#!/usr/bin/env node
"use strict";

const crypto = require("crypto");
const fs = require("fs");
const net = require("net");
const os = require("os");
const path = require("path");
const { execFileSync } = require("child_process");
const { startSimServer, stopSimServer } = require("./helpers.cjs");
const { openRawClient, sendRawClientFrame, closeRawClient, waitFor } = require("./network/raw-ws-client.cjs");
const { summarizeWindow, nearestRank } = require("../scripts/replication-accounting.cjs");

const ROOT = path.resolve(__dirname, "..");
const POPULATIONS = [1, 4, 8];
const PRODUCT_WINDOW_MS = 300_000;
const WARMUP_MS = 60_000;
const SEED = 0x50B04A5E;
const INPUT_HZ = 10;
// Per client over warm-up + product: <=3,600 input ACKs, <=7,200 state
// frames, <=360 heartbeats, plus bounded action/event/control overhead.
const MAX_RETAINED_FRAMES_PER_CLIENT = 5_000;
const MAX_RECEIVED_FRAMES_PER_CLIENT = 15_000;
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
let activeRunDir = null;

function writeExclusive(file, value) {
  fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`, { flag: "wx" });
}

async function freePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const port = server.address().port;
      server.close((error) => error ? reject(error) : resolve(port));
    });
  });
}

async function request(port, pathname, { method = "GET", body, authority, accounting } = {}) {
  const headers = { "content-type": "application/json", connection: "close" };
  if (authority) {
    headers["x-lbh-command-credential"] = authority.commandCredential;
    headers["x-lbh-player-id"] = authority.playerId;
    headers["x-lbh-run-id"] = authority.runId;
  }
  const response = await fetch(`http://127.0.0.1:${port}${pathname}`, {
    method, headers, body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (accounting) {
    const key = `${method} ${pathname} ${response.status}`;
    accounting[key] = (accounting[key] || 0) + 1;
  }
  return { status: response.status, body: await response.json() };
}

function strictStatus() {
  return execFileSync("git", ["status", "--porcelain"], { cwd: ROOT, encoding: "utf8" }).trim();
}

function psCpuMs(pid) {
  const raw = execFileSync("ps", ["-p", String(pid), "-o", "time="], { encoding: "utf8" }).trim();
  const parts = raw.split(":").map(Number);
  if (parts.some((value) => !Number.isFinite(value))) throw new Error(`invalid ps CPU time: ${raw}`);
  const seconds = parts.length === 3 ? parts[0] * 3600 + parts[1] * 60 + parts[2]
    : parts[0] * 60 + parts[1];
  return seconds * 1000;
}

function percentile(values, p) {
  return nearestRank(values, p);
}

function shapeSummary(events, startAt, endAt) {
  const selected = events.filter((event) => event.timestamp >= startAt && event.timestamp < endAt
    && event.metric === "accepted");
  const result = {};
  for (const event of selected) {
    const key = `${event.direction}|${event.frameClass}`;
    const row = result[key] ||= { frames: 0, bytes: 0, entityCounts: [], componentCounts: [], despawnCounts: [] };
    row.frames += event.frames;
    row.bytes += event.bytes;
    row.entityCounts.push(event.entityCount);
    row.componentCounts.push(event.componentCount);
    row.despawnCounts.push(event.despawnCount);
  }
  return Object.fromEntries(Object.entries(result).map(([key, row]) => [key, {
    frames: row.frames, bytes: row.bytes,
    entityCount: { p50: percentile(row.entityCounts, 0.5), p95: percentile(row.entityCounts, 0.95), max: Math.max(...row.entityCounts) },
    componentCount: { p50: percentile(row.componentCounts, 0.5), p95: percentile(row.componentCounts, 0.95), max: Math.max(...row.componentCounts) },
    despawnCount: { p50: percentile(row.despawnCounts, 0.5), p95: percentile(row.despawnCounts, 0.95), max: Math.max(...row.despawnCounts) },
  }]));
}

function projectionDelta(before, after) {
  const left = before.multiplayer.projection.accounting;
  const right = after.multiplayer.projection.accounting;
  return {
    projectionDurationSamples: right.projectionDurationSamples - left.projectionDurationSamples,
    projectionDurationTotalMs: right.projectionDurationTotalMs - left.projectionDurationTotalMs,
    replicationCostConsumedTotalMs: right.replicationCostConsumedTotalMs - left.replicationCostConsumedTotalMs,
    replicationCostOverflowMs: right.replicationCostOverflowMs - left.replicationCostOverflowMs,
    finalRollingSimTickMsContext: right.costDistributions.simTickMs,
    finalRollingProjectionReplicationMsContext: right.costDistributions.projectionReplicationMs,
  };
}

async function runInputSchedule(clients, inputSeq, durationMs, { actionSeq = null, commandSeq = null } = {}) {
  const started = performance.now();
  const wallStartedAt = Date.now();
  const stepMs = 1000 / INPUT_HZ;
  const inputSteps = Math.floor(durationMs / stepMs);
  const actionSteps = actionSeq ? Math.floor(durationMs / 30_000) : 0;
  let nextAction = 0;
  for (let step = 0; step < inputSteps; step += 1) {
    const delay = started + step * stepMs - performance.now();
    if (delay > 0) await sleep(delay);
    for (let seat = 0; seat < clients.length; seat += 1) {
      const phase = ((step + seat * 7) % 64) / 64 * Math.PI * 2;
      sendRawClientFrame(clients[seat], { type: "input", inputSeq: ++inputSeq[seat],
        moveX: Number(Math.cos(phase).toFixed(6)), moveY: Number(Math.sin(phase).toFixed(6)),
        thrust: step % 5 !== 0 ? 1 : 0, brake: step % 29 === 0 ? 1 : 0,
        slingshot: false, ability1: false, ability2: false, clientTimeMs: Date.now() });
    }
    if (nextAction < actionSteps && step === nextAction * 30_000 / stepMs) {
      const round = nextAction + 1;
      await Promise.all(clients.map(async (client, seat) => {
        const before = client.frames.length;
        const actionId = `s0-action-${round}-${seat}`;
        sendRawClientFrame(client, { type: "action", actionId,
          actionSeq: ++actionSeq[seat], commandSeq: ++commandSeq[seat], actionKind: "pulse", payload: {},
          clientTimeMs: Date.now() });
        const ack = await waitFor(() => client.frames.slice(before).find((frame) => frame.type === "ack"
          && frame.ackKind === "action" && frame.actionId === actionId), `S0 action ${round}/${seat}`, 5000);
        if (ack.deliveryId !== undefined) {
          sendRawClientFrame(client, { type: "ack", ackKind: "delivery", deliveryId: ack.deliveryId });
        }
      }));
      nextAction += 1;
    }
  }
  const remaining = started + durationMs - performance.now();
  if (remaining > 0) await sleep(remaining);
  return { inputSteps, actionSteps, wallStartedAt, wallEndedAt: Date.now(),
    actualDurationMs: performance.now() - started };
}

async function runPopulation(population, runDir, commit) {
  const port = await freePort();
  const httpAccounting = {};
  const clients = [];
  const authorities = [];
  const inputSeq = Array(population).fill(0);
  const actionSeq = Array(population).fill(0);
  const commandSeq = Array(population).fill(0);
  let authorityPid = null;
  let preStopConnections = null;
  let cleanup = null;
  try {
    await startSimServer(port, { keepAlive: true, registerProcessCleanup: false, env: {
      NODE_ENV: "test", LBH_SIM_WS_ENABLED: "true", LBH_SIM_WS_REPLICATION_ACCOUNTING: "1",
      LBH_REPLICATION_BASELINE_CAPTURE: "1", LBH_SIM_MAX_SIM_TIME: "7200",
    } });
    authorityPid = Number(fs.readFileSync(path.join(ROOT, "tmp", `sim-server-${port}.pid`), "utf8").trim());
    if (!Number.isSafeInteger(authorityPid)) throw new Error("authority PID file was not exact");
    const started = await request(port, "/session/start", { method: "POST", accounting: httpAccounting, body: {
      mapId: "shallows", requesterId: `s0-seat-0`, requesterName: "S0 Seat 0",
      maxPlayers: population, seed: SEED,
    } });
    if (started.status !== 200) throw new Error(`session start failed: ${JSON.stringify(started.body)}`);
    for (let seat = 0; seat < population; seat += 1) {
      const joined = await request(port, "/join", { method: "POST", accounting: httpAccounting, body: {
        runId: started.body.session.runId, clientId: `s0-seat-${seat}`,
        joinTicket: seat === 0 ? started.body.joinTicket : undefined, name: `S0 Seat ${seat}`,
      } });
      if (joined.status !== 200) throw new Error(`join ${seat} failed: ${JSON.stringify(joined.body)}`);
      authorities.push(joined.body.authority);
      const ticket = await request(port, "/multiplayer/ticket", { method: "POST", authority: joined.body.authority,
        accounting: httpAccounting, body: { kind: "admission" } });
      if (ticket.status !== 200) throw new Error(`ticket ${seat} failed`);
      clients.push(await openRawClient({ port, ticket: ticket.body.ticket, pilotSlot: `seat-${seat}`,
        record() {}, maxFrames: MAX_RETAINED_FRAMES_PER_CLIENT,
        maxReceivedFrames: MAX_RECEIVED_FRAMES_PER_CLIENT, sampleStateEvery: 100 }));
      actionSeq[seat] = clients[seat].latestFrames.welcome.lastActionSeq;
      commandSeq[seat] = clients[seat].latestFrames.welcome.lastCommandSeq;
    }
    const admitted = await request(port, "/health", { accounting: httpAccounting });
    if (admitted.body.process.pid !== authorityPid) throw new Error("authority PID changed before admission completed");
    if (!admitted.body.multiplayer.adapter.replication) throw new Error("opt-in accounting ledger is absent");
    await waitFor(async () => {
      const health = await request(port, "/health", { accounting: httpAccounting });
      return health.body.multiplayer.adapter.pendingScheduledSends === 0 ? health : false;
    }, "initial accounting drain", 5000);
    const warmup = await runInputSchedule(clients, inputSeq, WARMUP_MS);
    const startHealth = await request(port, "/health", { accounting: httpAccounting });
    const cpuStartMs = psCpuMs(authorityPid);
    const schedule = await runInputSchedule(clients, inputSeq, PRODUCT_WINDOW_MS, { actionSeq, commandSeq });
    const startAt = schedule.wallStartedAt;
    const endAt = startAt + PRODUCT_WINDOW_MS;
    const endHealth = await request(port, "/health", { accounting: httpAccounting });
    const cpuEndMs = psCpuMs(authorityPid);
    for (const client of clients) await closeRawClient(client);
    await waitFor(async () => {
      const health = await request(port, "/health", { accounting: httpAccounting });
      const adapter = health.body.multiplayer.adapter;
      return adapter.connections === 0 && adapter.pendingScheduledSends === 0 ? health : false;
    }, "final accounting cleanup", 5000);
    const finalHealth = await request(port, "/health", { accounting: httpAccounting });
    preStopConnections = finalHealth.body.multiplayer.adapter.connections;
    const snapshot = finalHealth.body.multiplayer.adapter.replication;
    const summary = summarizeWindow(snapshot, { startAt, endAt, evidenceFinalized: true,
      expectedRecipients: population, pendingSendCallbacks: 0 });
    if (!summary.exactProductWindow || Object.keys(summary.recipients).length !== population) {
      throw new Error(`incomplete product window: ${JSON.stringify({ population, summary })}`);
    }
    const coverage = Object.values(summary.recipients).map((recipient) => recipient.activeSeconds);
    if (!coverage.every((seconds) => Math.abs(seconds - PRODUCT_WINDOW_MS / 1000) <= 0.001)) {
      throw new Error(`exact recipient coverage failed: ${JSON.stringify(coverage)}`);
    }
    const selected = snapshot.events.filter((event) => event.timestamp >= startAt && event.timestamp < endAt);
    const publicFrames = selected.filter((event) => event.metric === "accepted" && event.frameClass === "publicState").length;
    const ownerFrames = selected.filter((event) => event.metric === "accepted" && event.frameClass === "ownerState").length;
    if (publicFrames !== ownerFrames || publicFrames !== summary.completePairBytes.count) {
      throw new Error(`public/owner pair conservation failed: ${JSON.stringify({ publicFrames, ownerFrames,
        completePairs: summary.completePairBytes.count })}`);
    }
    const rates = Object.values(summary.recipients).map((recipient) => recipient.actualProjectionBeatsPerSecond);
    if (!rates.every((rate) => rate >= 9.5 && rate <= 10.5)) throw new Error(`projection cadence escaped 10Hz band: ${rates}`);
    const acceptedReliableEvents = selected.filter((event) => event.metric === "accepted"
      && event.direction === "authority->client" && event.reliableId !== null);
    const retiredReliableEvents = selected.filter((event) => event.metric === "ackRetired"
      && event.reliableId !== null);
    const reliableKey = (event) => `${event.recipient}|${event.connectionEpoch}|${event.reliableId}`;
    const acceptedReliableIds = new Set(acceptedReliableEvents.map(reliableKey));
    const retiredReliableIds = new Set(retiredReliableEvents.map(reliableKey));
    const reliableAccepted = acceptedReliableEvents.length;
    const reliableRetired = retiredReliableEvents.length;
    const acceptedInputs = selected.filter((event) => event.metric === "accepted"
      && event.direction === "client->authority" && event.frameClass === "input").length;
    const acceptedActions = selected.filter((event) => event.metric === "accepted"
      && event.direction === "client->authority" && event.frameClass === "action").length;
    if (acceptedInputs !== population * schedule.inputSteps || acceptedActions !== population * schedule.actionSteps
      || acceptedReliableIds.size < population * schedule.actionSteps
      || acceptedReliableIds.size !== retiredReliableIds.size
      || [...acceptedReliableIds].some((key) => !retiredReliableIds.has(key))) {
      throw new Error(`reliable workload did not settle: ${JSON.stringify({ reliableAccepted, reliableRetired, schedule })}`);
    }
    const projection = projectionDelta(startHealth.body, endHealth.body);
    const scheduleSpec = { seed: SEED, warmupMs: WARMUP_MS, productWindowMs: PRODUCT_WINDOW_MS,
      inputHzPerClient: INPUT_HZ, actionEveryMs: 30_000, inputPhasePeriodSteps: 64 };
    const evidence = {
      schemaVersion: 1, population, commit, seed: SEED, inputHzPerClient: INPUT_HZ,
      wireVersion: 1, encoding: "full-json", durationSeconds: PRODUCT_WINDOW_MS / 1000,
      claimBoundary: "S0 local loopback full-JSON directional baseline only; no delta, compression, AOI, binary, WAN, WSS, hosted, 64 KiB/s acceptance, or retroactive minute-nine claim",
      topology: { matches: 1, logicalAuthoritiesPerActiveMatch: 1, clients: population },
      schedule: { spec: scheduleSpec,
        hash: crypto.createHash("sha256").update(JSON.stringify(scheduleSpec)).digest("hex"), warmup, product: schedule,
        exactInputFramesPerClient: schedule.inputSteps, exactReliableActionsPerClient: schedule.actionSteps },
      window: { startAt, endAt, startTick: startHealth.body.tick, endTick: endHealth.body.tick,
        exactRecipientCoverageSeconds: coverage },
      summary, shapes: shapeSummary(snapshot.events, startAt, endAt),
      exactWorkloadLedger: { acceptedInputs, acceptedActions, reliableAccepted, reliableRetired,
        clientTransportFailures: clients.filter((client) => client.error).length,
        coalescedFrames: selected.filter((event) => event.metric === "coalesced").length,
        policyDroppedFrames: selected.filter((event) => event.metric === "policyDropped").length,
        retransmittedFrames: selected.filter((event) => event.metric === "retransmitted").length },
      performance: { authorityProcessCpuMs: cpuEndMs - cpuStartMs,
        samplingScope: "Product schedule plus bounded ps/health boundary sampling overhead; rolling distributions are context only",
        scheduleOverrunMs: schedule.wallEndedAt - endAt, ...projection },
      authority: { pidStable: finalHealth.body.process.pid === authorityPid,
        overloadState: finalHealth.body.session.overloadState,
        projectionBeats: finalHealth.body.multiplayer.projection.beats - startHealth.body.multiplayer.projection.beats,
        projectionErrors: finalHealth.body.multiplayer.projection.errors - startHealth.body.multiplayer.projection.errors },
      httpAccounting, privacy: { rawIdentityFieldsPersisted: false, ledgerUsesSaltedDigestAndOrdinal: true },
      legacyMinuteNineReconciliation: { status: "NOT_APPLICABLE_FRESH_WINDOW",
        reason: "No same-window legacy combined ledger exists; this does not reconstruct the preserved minute-nine total" },
      localProviderSpendUsd: 0,
    };
    writeExclusive(path.join(runDir, `population-${population}.json`), evidence);
    cleanup = { clientsClosed: clients.every((client) => client.close), pidStable: evidence.authority.pidStable,
      port, authorityPid, preStopConnections };
    return evidence;
  } finally {
    for (const client of clients) await closeRawClient(client).catch(() => {});
    await stopSimServer(port).catch(() => {});
    const portDead = await new Promise((resolve) => {
      const socket = net.connect({ host: "127.0.0.1", port }, () => { socket.destroy(); resolve(false); });
      socket.once("error", () => resolve(true));
    });
    let pidDead = authorityPid === null;
    if (authorityPid !== null) {
      try { process.kill(authorityPid, 0); } catch { pidDead = true; }
    }
    const clientsClosed = clients.every((client) => client.close || client.ws.readyState === client.ws.CLOSED);
    const passed = portDead && pidDead && clientsClosed
      && (preStopConnections === null || preStopConnections === 0);
    writeExclusive(path.join(runDir, `cleanup-${population}.json`), {
      ...(cleanup || {}), preStopConnections, clientsClosed, portDead, pidDead, passed,
      scenarioReachedFinalDrain: preStopConnections !== null,
    });
    if (!passed) throw new Error(`population ${population} cleanup failed`);
  }
}

async function main() {
  const commit = execFileSync("git", ["rev-parse", "HEAD"], { cwd: ROOT, encoding: "utf8" }).trim();
  const dirty = strictStatus().length > 0;
  if (dirty && process.env.LBH_S0_ALLOW_DIRTY !== "1") throw new Error("S0 evidence requires clean HEAD");
  const stamp = new Date().toISOString().replace(/[:.]/g, "");
  const runDir = path.join(__dirname, "screenshots", `multiplayer-replication-s0-${stamp}-${commit.slice(0, 7)}`);
  fs.mkdirSync(runDir, { recursive: false });
  activeRunDir = runDir;
  writeExclusive(path.join(runDir, "manifest.json"), {
    schemaVersion: 1, generatedAt: new Date().toISOString(), commit, dirty, diagnosticOnly: dirty,
    populations: POPULATIONS, productWindowSeconds: PRODUCT_WINDOW_MS / 1000, seed: SEED,
    runtime: { node: process.version, platform: process.platform, arch: process.arch, osRelease: os.release() },
    evidenceClass: "local-loopback-v1-full-json-directional-baseline",
    localProviderSpendUsd: 0,
  });
  const rows = [];
  for (const population of POPULATIONS) rows.push(await runPopulation(population, runDir, commit));
  const summary = {
    schemaVersion: 1, commit, encoding: "full-json", productWindowSeconds: 300,
    claimBoundary: "Directional baseline evidence only; no delta or 64 KiB/s acceptance and no retroactive minute-nine claim",
    populations: rows.map((row) => ({ population: row.population,
      downlinkBytesPerRecipientSecond: row.summary.aggregate.downlinkAcceptedBytesPerRecipientSecond,
      uplinkBytesPerRecipientSecond: row.summary.aggregate.uplinkAcceptedBytesPerRecipientSecond,
      pairP50Bytes: row.summary.completePairBytes.p50, pairP95Bytes: row.summary.completePairBytes.p95,
      projectionBeatsPerSecond: Object.values(row.summary.recipients).map((recipient) => recipient.actualProjectionBeatsPerSecond),
      authorityProcessCpuMs: row.performance.authorityProcessCpuMs,
      projectionDurationTotalMs: row.performance.projectionDurationTotalMs,
      localProviderSpendUsd: 0 })),
    localProviderSpendUsd: 0,
  };
  writeExclusive(path.join(runDir, "cross-population-summary.json"), summary);
  const forbidden = /"(?:commandCredential|admissionTicket|resumeTicket|ticket|profileId|membershipId|playerId|connectionId|currentRunId|runId|equipped|inventory)"\s*:/;
  for (const name of fs.readdirSync(runDir)) {
    const text = fs.readFileSync(path.join(runDir, name), "utf8");
    if (forbidden.test(text) || text.includes("s0-seat-")) throw new Error(`privacy scan rejected ${name}`);
  }
  const files = fs.readdirSync(runDir).sort().map((name) => ({ name,
    sha256: crypto.createHash("sha256").update(fs.readFileSync(path.join(runDir, name))).digest("hex") }));
  writeExclusive(path.join(runDir, "terminal.json"), { status: "PASS", canonical: !dirty,
    completedAt: new Date().toISOString(), files, aggregateSha256: crypto.createHash("sha256")
      .update(files.map((entry) => `${entry.name}:${entry.sha256}`).join("\n")).digest("hex") });
  console.log(`S0 directional baseline artifact: ${runDir}`);
  console.log(JSON.stringify(summary, null, 2));
}

main().catch((error) => {
  if (activeRunDir && fs.existsSync(activeRunDir) && !fs.existsSync(path.join(activeRunDir, "terminal.json"))) {
    const safeMessage = String(error.message || "S0 capture failed")
      .replace(/s0-seat-[\w-]+/g, "[redacted-seat]").slice(0, 1000);
    writeExclusive(path.join(activeRunDir, "terminal.json"), { status: "FAIL", canonical: false,
      completedAt: new Date().toISOString(), error: safeMessage });
  }
  console.error(error.stack || error.message);
  process.exitCode = 1;
});
