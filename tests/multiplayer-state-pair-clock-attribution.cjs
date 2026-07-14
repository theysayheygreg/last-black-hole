#!/usr/bin/env node
"use strict";

const fs = require("fs");
const net = require("net");
const os = require("os");
const path = require("path");
const { execFileSync, fork } = require("child_process");
const { startSimServer, stopSimServer } = require("./helpers.cjs");
const { distribution, fixedWindowRates, fixedWindowMeanAcceptedRates,
  mapClientsToAccountingRecipients, aggregateChecksum, validateChecksums } =
  require("./network/state-pair-product-metrics.cjs");

const ROOT = path.resolve(__dirname, "..");
const WORKER = path.join(__dirname, "network", "state-pair-isolated-client.cjs");
const SEED = 0x53A1B04E;
const S23T_PROFILE = String(process.env.LBH_S23T_PUBLIC_BODY_PROFILE || "").trim() === "1";
const S23T_CAPTURE_MODE = String(process.env.LBH_S23T_CAPTURE_MODE || "").trim();
if (S23T_CAPTURE_MODE && !["paired", "single"].includes(S23T_CAPTURE_MODE)) {
  throw new Error("LBH_S23T_CAPTURE_MODE must be paired or single");
}
const POPULATIONS = (() => {
  const values = String(process.env.LBH_S13_POPULATIONS || "1,4,8").split(",")
    .map((value) => Number(value.trim()));
  const expectedLength = S23T_CAPTURE_MODE === "single" ? 1
    : S23T_PROFILE || S23T_CAPTURE_MODE === "paired" ? 2 : 3;
  if (values.length !== expectedLength || new Set(values).size !== expectedLength
      || values.some((value) => ![1, 4, 8].includes(value))) {
    throw new Error(`LBH_S13_POPULATIONS must contain ${expectedLength} distinct supported populations`);
  }
  return values;
})();
const WARMUP_MS = Number(process.env.LBH_S13_WARMUP_MS || 5_000);
const WINDOW_MS = Number(process.env.LBH_S13_WINDOW_MS || 20_000);
const S12_ARTIFACT = path.join(ROOT, "docs", "v0.4", "evidence", "state-pair-s12", "pre-gate");
const S12_SHA256 = "00c6377fcf68b76dfac429054a35a0a9c55c7d93d8e043df7166a4eab5429845";
const S15_ARTIFACT = path.join(ROOT, "docs", "v0.4", "evidence", "state-pair-s15");
const S15_SHA256 = "66c2c751c80f2f0e94c4103eff01352b1e241ce9690fff58c9331a354ec23bf8";
const S16_BINARY = String(process.env.LBH_S16_BINARY || "").trim() === "1";
const S20_COMPRESSION = String(process.env.LBH_S20_COMPRESSION || "").trim() === "1";
const S21_STAGE_PROFILE = String(process.env.LBH_S21_STAGE_PROFILE || "").trim() === "1";
const S23_PUBLIC_BODY = String(process.env.LBH_S23_PUBLIC_BODY || "").trim() === "1";
const S23P_PREPARED_PUBLIC_SOURCE = String(process.env.LBH_S23P_PREPARED_PUBLIC_SOURCE || "").trim() === "1";
if (S16_BINARY && S20_COMPRESSION) throw new Error("S20 compression cannot be combined with S16 binary");
if (S23_PUBLIC_BODY && (!S20_COMPRESSION || S16_BINARY)) {
  throw new Error("S23 public body requires S20 compression and excludes S16 binary");
}
if (S23P_PREPARED_PUBLIC_SOURCE && !S23_PUBLIC_BODY) {
  throw new Error("S23P prepared public source requires S23 public body");
}
const PROFILE = S23P_PREPARED_PUBLIC_SOURCE ? "s23p" : S23_PUBLIC_BODY ? "s23"
  : S20_COMPRESSION ? "s20" : S16_BINARY ? "s16" : "s13";
const CANDIDATE_SCHEMA = S23P_PREPARED_PUBLIC_SOURCE ? "lbh-s23p-prepared-public-source-candidate-v1"
  : S23_PUBLIC_BODY ? "lbh-s23-public-body-candidate-v1"
  : S20_COMPRESSION ? "lbh-s20-compression-candidate-v1"
  : S16_BINARY ? "lbh-s16-binary-candidate-v1" : "lbh-s13-isolated-client-attribution-v1";
const RUN_SCHEMA = S23P_PREPARED_PUBLIC_SOURCE ? "lbh-s23p-prepared-public-source-run-v1"
  : S23_PUBLIC_BODY ? "lbh-s23-public-body-run-v1"
  : S20_COMPRESSION ? "lbh-s20-compression-run-v1"
  : S16_BINARY ? "lbh-s16-binary-run-v1" : "lbh-s13-isolated-client-run-v1";
const AGGREGATE_SCHEMA = S23P_PREPARED_PUBLIC_SOURCE ? "lbh-s23p-prepared-public-source-aggregate-v1"
  : S23_PUBLIC_BODY ? "lbh-s23-public-body-aggregate-v1"
  : S20_COMPRESSION ? "lbh-s20-compression-aggregate-v1"
  : S16_BINARY ? "lbh-s16-binary-aggregate-v1" : "lbh-s13-isolated-client-aggregate-v1";
const ACTIVE_CODEC = S23_PUBLIC_BODY ? "state-pair-public-body-v1"
  : S20_COMPRESSION ? "state-pair-brotli-v1"
  : S16_BINARY ? "state-pair-binary-v1" : "state-pair-positional-json-v1";
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function git(...args) {
  return execFileSync("git", args, { cwd: ROOT, encoding: "utf8" }).trim();
}

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

async function request(port, pathname, { method = "GET", body, authority } = {}) {
  const headers = { "content-type": "application/json", connection: "close" };
  if (authority) {
    headers["x-lbh-command-credential"] = authority.commandCredential;
    headers["x-lbh-player-id"] = authority.playerId;
    headers["x-lbh-run-id"] = authority.runId;
  }
  const response = await fetch(`http://127.0.0.1:${port}${pathname}`, {
    method, headers, body: body === undefined ? undefined : JSON.stringify(body),
  });
  const bytes = Buffer.from(await response.arrayBuffer());
  let responseBody = null;
  if (bytes.length) try { responseBody = JSON.parse(bytes.toString("utf8")); } catch {}
  return { status: response.status, body: responseBody, bytes };
}

async function waitFor(check, label, timeoutMs = 8_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const value = await check();
    if (value) return value;
    await sleep(20);
  }
  throw new Error(`Timed out waiting for ${label}`);
}

function spawnClient() {
  const child = fork(WORKER, [], { cwd: ROOT, stdio: ["ignore", "ignore", "pipe", "ipc"] });
  child.stderrText = "";
  child.stderr.on("data", (data) => { child.stderrText += data.toString(); });
  child.nextRequestId = 0;
  child.pending = new Map();
  child.on("message", (message) => {
    const pending = child.pending.get(message.requestId);
    if (!pending) return;
    child.pending.delete(message.requestId);
    if (message.error) pending.reject(new Error(message.error));
    else pending.resolve(message.result);
  });
  child.on("exit", (code, signal) => {
    const detail = `isolated client exited code=${code} signal=${signal}: ${child.stderrText}`;
    for (const pending of child.pending.values()) pending.reject(new Error(detail));
    child.pending.clear();
  });
  child.call = (command, extra = {}, timeoutMs = 15_000) => new Promise((resolve, reject) => {
    const requestId = ++child.nextRequestId;
    const timer = setTimeout(() => {
      child.pending.delete(requestId);
      reject(new Error(`isolated client ${command} timed out: ${child.stderrText}`));
    }, timeoutMs);
    child.pending.set(requestId, {
      resolve: (value) => { clearTimeout(timer); resolve(value); },
      reject: (error) => { clearTimeout(timer); reject(error); },
    });
    child.send({ requestId, command, ...extra });
  });
  return child;
}

async function setupPopulation(port, population) {
  const started = await request(port, "/session/start", { method: "POST", body: {
    mapId: "shallows", requesterId: `s13-${population}-seat-0`,
    requesterName: `S13 ${population} seat 0`, maxPlayers: population, seed: SEED,
  } });
  if (started.status !== 200) throw new Error(`session start failed: ${JSON.stringify(started.body)}`);
  const authorities = [];
  for (let seat = 0; seat < population; seat += 1) {
    const joined = await request(port, "/join", { method: "POST", body: {
      runId: started.body.session.runId, clientId: `s13-${population}-seat-${seat}`,
      joinTicket: seat === 0 ? started.body.joinTicket : undefined,
      name: `S13 ${population} seat ${seat}`,
    } });
    if (joined.status !== 200) throw new Error(`join ${seat} failed: ${JSON.stringify(joined.body)}`);
    authorities.push(joined.body.authority);
  }
  const children = [];
  const admissions = [];
  for (let seat = 0; seat < population; seat += 1) {
    const child = spawnClient();
    children.push(child);
    admissions.push(await child.call("init", { config: { port, authority: authorities[seat], seat,
      label: `${PROFILE}-${population}-seat-${seat}`, binary: S16_BINARY,
      compression: S20_COMPRESSION, publicBody: S23_PUBLIC_BODY,
      preparedPublicSource: S23P_PREPARED_PUBLIC_SOURCE } }, 30_000));
  }
  return { started, authorities, children, admissions };
}

function cpuDelta(start, end) {
  const user = end.cpuUsage.user - start.cpuUsage.user;
  const system = end.cpuUsage.system - start.cpuUsage.system;
  const totalMicroseconds = user + system;
  const wallMs = end.sampledAtMs - start.sampledAtMs;
  return { startSampledAtMs: start.sampledAtMs, endSampledAtMs: end.sampledAtMs,
    wallMilliseconds: wallMs, user, system, totalMicroseconds,
    oneCoreFraction: totalMicroseconds / Math.max(1, wallMs * 1000) };
}

const PRESSURE_POLICY_COUNTERS = ["connectionsCrossedTransportHighWater",
  "transportHighWaterCrossings", "connectionsHitQueuePolicy", "queuePolicyLimitCrossings",
  "queuePolicyEvents", "queuePolicyRebases", "queuePolicyDisconnects"];

function pressureDelta(start, end) {
  const before = start.multiplayer.adapter.pressure;
  const after = end.multiplayer.adapter.pressure;
  const policyDelta = Object.fromEntries(PRESSURE_POLICY_COUNTERS.map((key) =>
    [key, (after.policy[key] || 0) - (before.policy[key] || 0)]));
  return { start: before, end: after, policyDelta,
    noHighWaterOrQueuePolicyTransition: Object.values(policyDelta).every((value) => value === 0) };
}

function authorityCounts(events, startAt, endAt, mapping) {
  return Object.fromEntries(Object.entries(mapping.byClient).map(([label, recipient]) => [label, events
    .filter((event) => event.timestamp >= startAt && event.timestamp < endAt
      && event.recipientOrdinal === recipient.recipientOrdinal
      && event.direction === "authority->client" && event.frameClass === "statePair"
      && event.metric === "accepted").length]));
}

function receiverCounts(clients, startAt, endAt) {
  return Object.fromEntries(clients.map((client) => [client.label, client.acceptedPairEvents
    .filter((event) => event.at >= startAt && event.at < endAt).length]));
}

async function runScenario(population, runDir, commit) {
  const port = await freePort();
  let authorityPid = null;
  let setup = null;
  let preStopHealth = null;
  try {
    await startSimServer(port, { keepAlive: true, registerProcessCleanup: false, env: {
      NODE_ENV: "test", LBH_SIM_WS_ENABLED: "true", LBH_SIM_WS_JSON_V2: "true",
      LBH_SIM_WS_STATE_PAIR_V1: "true", LBH_SIM_WS_REPLICATION_ACCOUNTING: "1",
      LBH_SIM_WS_STATE_PAIR_MIXED_V1: "true",
      LBH_SIM_WS_RUNTIME_PUBLIC_COMPONENTS_V1: "true",
      LBH_SIM_WS_POSITIONAL_JSON_V1: "true", LBH_SIM_WS_ACK_REJECT_DIAGNOSTICS: "true",
      LBH_SIM_WS_STATE_PAIR_BINARY_V1: S16_BINARY ? "true" : "false",
      LBH_SIM_WS_STATE_PAIR_COMPRESSION_V1: S20_COMPRESSION ? "true" : "false",
      LBH_SIM_WS_STATE_PAIR_PUBLIC_BODY_V1: S23_PUBLIC_BODY ? "true" : "false",
      LBH_SIM_WS_STATE_PAIR_PREPARED_PUBLIC_SOURCE_V1: S23P_PREPARED_PUBLIC_SOURCE ? "true" : "false",
      LBH_SIM_WS_PREPARED_PROJECTIONS: "true", LBH_SIM_WS_BENCH_EVENT_LOOP: "1",
      LBH_REPLICATION_BASELINE_CAPTURE: "1", LBH_SIM_MAX_SIM_TIME: "7200",
      LBH_SIM_WS_STAGE_PROFILE: S21_STAGE_PROFILE ? "1" : "0",
      LBH_S23T_PUBLIC_BODY_PROFILE: S23T_PROFILE ? "1" : "0",
      LBH_S23T_EVIDENCE_HARNESS: S23T_PROFILE ? "1" : "0",
    } });
    authorityPid = Number(fs.readFileSync(path.join(ROOT, "tmp", `sim-server-${port}.pid`), "utf8"));
    setup = await setupPopulation(port, population);
    const warmupStartAt = Date.now() + 500;
    await Promise.all(setup.children.map((child) => child.call("workload-start", { workload: {
      phase: "warmup", startAt: warmupStartAt, durationMs: WARMUP_MS,
    } })));
    await sleep(Math.max(0, warmupStartAt + WARMUP_MS + 250 - Date.now()));
    const warmupWorkloads = await Promise.all(setup.children.map((child) => child.call("workload-stop")));
    if (!warmupWorkloads.every((entry) => entry.submittedInputSteps === entry.plannedInputSteps
      && entry.inputSequenceAdvance === entry.plannedInputSteps)) {
      throw new Error(`warmup input schedule did not complete exactly: ${JSON.stringify(warmupWorkloads)}`);
    }
    const reset = await request(port, "/debug/multiplayer/evidence-reset", { method: "POST" });
    if (reset.status !== 200) throw new Error(`evidence reset failed: ${JSON.stringify(reset.body)}`);
    const measurementStartAt = Date.now() + 500;
    const measurementEndAt = measurementStartAt + WINDOW_MS;
    const startHealth = (await request(port, "/health/compact")).body;
    await Promise.all(setup.children.map((child) => child.call("measure-start",
      { startAt: measurementStartAt })));
    await Promise.all(setup.children.map((child) => child.call("workload-start", { workload: {
      phase: "measurement", startAt: measurementStartAt, durationMs: WINDOW_MS,
    } })));
    const healthSamples = [];
    while (Date.now() < measurementEndAt + 250) {
      await sleep(Math.min(1_000, measurementEndAt + 250 - Date.now()));
      const sample = (await request(port, "/health/compact")).body;
      healthSamples.push({ at: Date.now(), cpuUsage: sample.process.cpuUsage,
        adapter: { queuedBytes: sample.multiplayer.adapter.queuedBytes,
          queuedMessages: sample.multiplayer.adapter.queuedMessages,
          pendingScheduledSends: sample.multiplayer.adapter.pendingScheduledSends,
          backpressured: sample.multiplayer.adapter.backpressured,
          wsBufferedBytes: sample.multiplayer.adapter.wsBufferedBytes },
        projection: sample.multiplayer.projection.accounting,
        overloadState: sample.session.overloadState, tickHz: sample.session.tickHz,
        snapshotHz: sample.session.snapshotHz });
    }
    const measurementWorkloads = await Promise.all(setup.children.map((child) => child.call("workload-stop")));
    const clients = await Promise.all(setup.children.map((child) => child.call("measure-stop")));
    const endHealth = (await request(port, "/health/compact")).body;
    const startAt = measurementStartAt;
    const endAt = measurementEndAt;
    for (const child of setup.children) await child.call("shutdown").catch(() => null);
    await waitFor(async () => {
      const health = (await request(port, "/health/compact")).body;
      return health.multiplayer.adapter.connections === 0
        && health.multiplayer.adapter.pendingScheduledSends === 0 ? health : false;
    }, `${population}-client drain`);
    preStopHealth = (await request(port, "/health")).body;
    const accounting = preStopHealth.multiplayer.adapter.replication;
    const mapping = mapClientsToAccountingRecipients(clients, accounting.events, startAt, endAt);
    const recipients = Object.values(mapping.byClient).map((entry) => entry.recipient).sort();
    const authorityAcceptedPairCountsByClient = authorityCounts(accounting.events, startAt, endAt, mapping);
    const receiverAcceptedPairCountsByClient = receiverCounts(clients, startAt, endAt);
    const seconds = (endAt - startAt) / 1000;
    const authorityRates = Object.fromEntries(Object.entries(authorityAcceptedPairCountsByClient)
      .map(([label, count]) => [label, count / seconds]));
    const receiverRates = Object.fromEntries(Object.entries(receiverAcceptedPairCountsByClient)
      .map(([label, count]) => [label, count / seconds]));
    const selected = accounting.events.filter((event) => event.timestamp >= startAt && event.timestamp < endAt);
    const exactRates = fixedWindowMeanAcceptedRates(selected, { startAt, endAt, recipients });
    const windows = fixedWindowRates(selected, { startAt, endAt, windowMs: 1_000, recipients });
    const totalAuthorityPairs = Object.values(authorityAcceptedPairCountsByClient).reduce((a, b) => a + b, 0);
    const totalReceiverPairs = Object.values(receiverAcceptedPairCountsByClient).reduce((a, b) => a + b, 0);
    const cumulativePressure = pressureDelta(startHealth, endHealth);
    const queue = {
      maxQueuedBytes: Math.max(0, ...healthSamples.map((sample) => sample.adapter.queuedBytes || 0)),
      maxQueuedMessages: Math.max(0, ...healthSamples.map((sample) => sample.adapter.queuedMessages || 0)),
      maxPendingScheduledSends: Math.max(0,
        ...healthSamples.map((sample) => sample.adapter.pendingScheduledSends || 0)),
      maxBackpressuredConnections: Math.max(0,
        ...healthSamples.map((sample) => sample.adapter.backpressured || 0)),
      maxAuthorityWsBufferedBytes: Math.max(0,
        ...healthSamples.map((sample) => sample.adapter.wsBufferedBytes || 0)),
      maxClientBufferedAmount: Math.max(...clients.map((client) => client.maxBufferedAmount)),
      cumulativePressure,
    };
    const correctness = {
      uniqueRecipientMapping: mapping.uniqueOptimal === true,
      noClientErrors: clients.every((client) => client.errors.length === 0),
      authorityReceiverCountDeltaAtMostOnePerClient: Object.keys(authorityRates).every((label) =>
        Math.abs(authorityAcceptedPairCountsByClient[label] - receiverAcceptedPairCountsByClient[label]) <= 1),
      receiverBasesApplicable: clients.every((client) => client.receiver.recoveryRequests === 0
        && client.receiver.rejected === 0 && client.receiver.ledger.misses === 0),
      exactSynchronizedInputSchedule: measurementWorkloads.every((entry) =>
        entry.startAt === measurementStartAt && entry.plannedInputSteps === WINDOW_MS / 100
        && entry.submittedInputSteps === entry.plannedInputSteps
        && entry.inputSequenceAdvance === entry.plannedInputSteps
        && entry.submittedActionSteps === Math.floor((entry.plannedInputSteps - 1) / (15 * 10))),
      noHighWaterOrQueuePolicyTransition: cumulativePressure.noHighWaterOrQueuePolicyTransition,
      accountingComplete: accounting.overflow === 0 && accounting.evidenceFailure === null,
    };
    correctness.passed = Object.values(correctness).every(Boolean);
    const result = {
      schema: CANDIDATE_SCHEMA,
      commit, population, codec: ACTIVE_CODEC,
      topology: { matches: 1, dedicatedLogicalAuthorities: 1, authorityPid,
        coordinatorPid: process.pid, isolatedClientProcesses: clients.map((client) => client.pid),
        simultaneousRecipients: population,
        note: "One logical authority for one match; each simulated client owns a distinct Node process/event loop." },
      window: { warmupMs: WARMUP_MS, requestedMeasurementMs: WINDOW_MS,
        startAt, endAt, durationSeconds: seconds, warmupWorkloads, measurementWorkloads },
      cadence: { configuredPublicationHz: 10, sessionTickHz: endHealth.session.tickHz,
        sessionSnapshotHz: endHealth.session.snapshotHz,
        authorityAcceptedPairCountsByClient, authorityAcceptedPairsPerSecondByClient: authorityRates,
        receiverAcceptedPairCountsByClient, receiverAcceptedPairsPerSecondByClient: receiverRates,
        minimumAuthorityAcceptedPairsPerSecond: Math.min(...Object.values(authorityRates)),
        minimumReceiverAcceptedPairsPerSecond: Math.min(...Object.values(receiverRates)),
        receiverShareOfAuthorityAcceptedPairs: totalAuthorityPairs > 0 ? totalReceiverPairs / totalAuthorityPairs : null,
        accountingRecipientMapping: mapping },
      traffic: { perRecipientMeanDownlinkBytesPerSecond: exactRates,
        worstRecipientMeanDownlinkBytesPerSecond: Math.max(...Object.values(exactRates)),
        oneSecondAllRecipientBytesPerSecond: windows.allRecipientWindowsBytesPerSecond,
        fixedWindowMetadata: { scoredStartAt: windows.scoredStartAt,
          scoredEndAt: windows.scoredEndAt, droppedPartialTailMs: windows.droppedPartialTailMs },
        accountingBoundary: "Exact application payload bytes accepted by authority ws.send callbacks; excludes WebSocket/TCP/TLS/WAN overhead." },
      performance: {
        authority: { cpuUsage: cpuDelta(startHealth.process, endHealth.process),
          cpuBoundary: "Exact cumulative authority process CPU delta divided by the same two health-sample timestamps; includes health polling and test-only replication accounting overhead.",
          eventLoopDelay: endHealth.multiplayer.projection.benchmarkEventLoopDelay,
          simTickMs: endHealth.multiplayer.projection.accounting.costDistributions.simTickMs,
          projectionAndPublishMs: endHealth.multiplayer.projection.accounting.costDistributions.projectionReplicationMs,
          ...(S21_STAGE_PROFILE ? {
            stageProfile: endHealth.multiplayer.adapter.authorityStageProfile,
          } : {}),
          ...(S23T_PROFILE ? {
            s23tPublicBodyProfile: endHealth.multiplayer.adapter.s23tPublicBodyProfile,
          } : {}) },
        clients: clients.map((client) => ({ label: client.label, pid: client.pid,
          cpuUsage: client.cpuUsage, eventLoopDelay: client.eventLoopDelay,
          decodeApplyMs: client.decodeApplyMs,
          ackSerializeSendMs: client.ackSerializeSendMs, inputSteps: client.inputSteps })),
        aggregateClientOneCoreFraction: clients.reduce((sum, client) => sum + client.cpuUsage.oneCoreFraction, 0),
        queueAndBackpressure: queue,
      },
      authorityState: { overloadState: endHealth.session.overloadState,
        skippedProjectionBeats: endHealth.multiplayer.projection.skippedBeats
          - startHealth.multiplayer.projection.skippedBeats,
        statePair: S23_PUBLIC_BODY ? endHealth.multiplayer.statePair
          : endHealth.multiplayer.statePair.publisher,
        adapter: endHealth.multiplayer.adapter.statePair },
      processBoundary: {
        authority: "sim tick, overload controller, public/owner projection, codec-candidate work per admitted recipient, pair selection, queueing, publish callbacks, ACK ingestion",
        isolatedClient: "wire parse/decode, receiver validation/materialization, semantic hash/ACK construction, input/action serialization, ACK serialization/send",
        coordinator: "session setup, health polling, wall-clock windowing, immutable evidence assembly only; no state-pair decode/apply/ACK",
      },
      accountingEvidence: selected, healthSamples, clients, correctness,
      limitations: ["Machine-local macOS loopback", "Raw WebSocket without TLS", "One match at a time",
        `Codec ${S20_COMPRESSION ? "Brotli q1 per-frame envelope with positional JSON fallback"
          : S16_BINARY ? "binary-v1 with positional JSON fallback" : "positional JSON v1"}`,
        "No fleet packing, WAN, hosted WSS, AOI, or 24/48/96-client claim"],
    };
    writeExclusive(path.join(runDir, `normal-${population}.json`), result);
    return result;
  } finally {
    for (const child of setup?.children || []) {
      if (child.connected) await child.call("shutdown").catch(() => child.kill("SIGTERM"));
      else if (child.exitCode === null) child.kill("SIGTERM");
    }
    if (preStopHealth === null) preStopHealth = await request(port, "/health")
      .then((response) => response.body).catch(() => null);
    await stopSimServer(port).catch(() => null);
    const portDead = await new Promise((resolve) => {
      const socket = net.connect({ host: "127.0.0.1", port }, () => { socket.destroy(); resolve(false); });
      socket.once("error", () => resolve(true));
    });
    let pidDead = authorityPid === null;
    if (authorityPid !== null) try { process.kill(authorityPid, 0); } catch { pidDead = true; }
    writeExclusive(path.join(runDir, `cleanup-normal-${population}.json`), {
      population, port, authorityPid, portDead, pidDead,
      preStopConnections: preStopHealth?.multiplayer?.adapter?.connections ?? null,
      preStopCompressedRetainedFrames:
        preStopHealth?.multiplayer?.adapter?.statePair?.compression?.retainedFrames ?? null,
      preStopCompressedRetainedBytes:
        preStopHealth?.multiplayer?.adapter?.statePair?.compression?.retainedBytes ?? null,
      passed: portDead && pidDead && preStopHealth?.multiplayer?.adapter?.connections === 0
        && (!S20_COMPRESSION
          || (preStopHealth?.multiplayer?.adapter?.statePair?.compression?.retainedFrames === 0
            && preStopHealth?.multiplayer?.adapter?.statePair?.compression?.retainedBytes === 0)),
    });
  }
}

function validateArtifact(directory) {
  const checksums = validateChecksums(directory);
  const run = JSON.parse(fs.readFileSync(path.join(directory, "run.json"), "utf8"));
  const aggregate = JSON.parse(fs.readFileSync(path.join(directory, "aggregate.json"), "utf8"));
  const artifactPopulations = run.config?.populations || [];
  const scenarios = artifactPopulations.map((population) =>
    JSON.parse(fs.readFileSync(path.join(directory, `normal-${population}.json`), "utf8")));
  const cleanup = artifactPopulations.map((population) =>
    JSON.parse(fs.readFileSync(path.join(directory, `cleanup-normal-${population}.json`), "utf8")));
  const expectedFiles = ["aggregate.json", "checksums.json", "run.json",
    ...artifactPopulations.flatMap((population) =>
      [`cleanup-normal-${population}.json`, `normal-${population}.json`])].sort();
  const actualFiles = fs.readdirSync(directory).filter((file) => file.endsWith(".json")).sort();
  const s12 = validateChecksums(S12_ARTIFACT);
  const s15 = S16_BINARY ? validateChecksums(S15_ARTIFACT) : null;
  const semantic = scenarios.map((entry) => {
    const seconds = entry.window.durationSeconds;
    const labels = entry.clients.map((client) => client.label);
    const receiverCountsRecomputed = Object.fromEntries(entry.clients.map((client) => [client.label,
      client.acceptedPairEvents.filter((event) => event.at >= entry.window.startAt
        && event.at < entry.window.endAt).length]));
    const authorityCountsRecomputed = authorityCounts(entry.accountingEvidence,
      entry.window.startAt, entry.window.endAt, entry.cadence.accountingRecipientMapping);
    const rates = (counts) => Object.fromEntries(Object.entries(counts)
      .map(([label, count]) => [label, count / seconds]));
    const recipients = Object.values(entry.cadence.accountingRecipientMapping.byClient)
      .map((row) => row.recipient).sort();
    const trafficMeans = fixedWindowMeanAcceptedRates(entry.accountingEvidence,
      { startAt: entry.window.startAt, endAt: entry.window.endAt, recipients });
    const trafficWindows = fixedWindowRates(entry.accountingEvidence,
      { startAt: entry.window.startAt, endAt: entry.window.endAt, windowMs: 1_000, recipients });
    const cpu = entry.performance.authority.cpuUsage;
    const cpuArithmetic = cpu.wallMilliseconds === cpu.endSampledAtMs - cpu.startSampledAtMs
      && cpu.totalMicroseconds === cpu.user + cpu.system
      && Math.abs(cpu.oneCoreFraction - cpu.totalMicroseconds / (cpu.wallMilliseconds * 1000)) < 1e-12;
    const pressure = entry.performance.queueAndBackpressure.cumulativePressure;
    const pressureRecomputed = Object.fromEntries(PRESSURE_POLICY_COUNTERS.map((key) =>
      [key, (pressure.end.policy[key] || 0) - (pressure.start.policy[key] || 0)]));
    const exactInputs = entry.window.measurementWorkloads.length === entry.population
      && entry.window.measurementWorkloads.every((workload) =>
        workload.startAt === entry.window.startAt
        && workload.plannedInputSteps === run.config.windowMs / 100
        && workload.submittedInputSteps === workload.plannedInputSteps
        && workload.inputSequenceAdvance === workload.plannedInputSteps
        && workload.submittedActionSteps === Math.floor((workload.plannedInputSteps - 1) / 150));
    const processIds = [entry.topology.authorityPid, entry.topology.coordinatorPid,
      ...entry.topology.isolatedClientProcesses];
    return {
      schemaCommit: entry.schema === (run.config.preparedPublicSource
        ? "lbh-s23p-prepared-public-source-candidate-v1"
        : run.config.publicBody ? "lbh-s23-public-body-candidate-v1"
        : run.config.compression ? "lbh-s20-compression-candidate-v1"
        : run.config.binary ? "lbh-s16-binary-candidate-v1" : "lbh-s13-isolated-client-attribution-v1")
        && entry.commit === run.commit,
      codecContract: entry.codec === (run.config.publicBody ? "state-pair-public-body-v1"
        : run.config.compression ? "state-pair-brotli-v1"
        : run.config.binary ? "state-pair-binary-v1" : "state-pair-positional-json-v1")
        && entry.clients.every((client) => client.receiver.mode === entry.codec),
      exactProcessIsolation: new Set(processIds).size === processIds.length
        && entry.topology.isolatedClientProcesses.length === entry.population,
      exactWindow: entry.window.endAt - entry.window.startAt === run.config.windowMs
        && seconds === run.config.windowMs / 1000,
      exactInputs,
      exactClientSet: labels.length === entry.population && new Set(labels).size === entry.population,
      mapping: entry.cadence.accountingRecipientMapping.uniqueOptimal === true
        && Object.keys(entry.cadence.accountingRecipientMapping.byClient).sort().join("|")
          === [...labels].sort().join("|"),
      authorityCounts: JSON.stringify(authorityCountsRecomputed)
        === JSON.stringify(entry.cadence.authorityAcceptedPairCountsByClient),
      receiverCounts: JSON.stringify(receiverCountsRecomputed)
        === JSON.stringify(entry.cadence.receiverAcceptedPairCountsByClient),
      authorityRates: JSON.stringify(rates(authorityCountsRecomputed))
        === JSON.stringify(entry.cadence.authorityAcceptedPairsPerSecondByClient),
      receiverRates: JSON.stringify(rates(receiverCountsRecomputed))
        === JSON.stringify(entry.cadence.receiverAcceptedPairsPerSecondByClient),
      trafficMeans: JSON.stringify(trafficMeans)
        === JSON.stringify(entry.traffic.perRecipientMeanDownlinkBytesPerSecond),
      trafficWindows: JSON.stringify(trafficWindows.allRecipientWindowsBytesPerSecond)
          === JSON.stringify(entry.traffic.oneSecondAllRecipientBytesPerSecond)
        && trafficWindows.droppedPartialTailMs === 0,
      cpuArithmetic,
      pressureArithmetic: JSON.stringify(pressureRecomputed) === JSON.stringify(pressure.policyDelta)
        && pressure.noHighWaterOrQueuePolicyTransition
          === Object.values(pressureRecomputed).every((value) => value === 0),
      clientCorrectness: entry.clients.every((client) => client.errors.length === 0
        && client.receiver.recoveryRequests === 0 && client.receiver.rejected === 0
        && client.receiver.ledger.misses === 0),
      storedVerdict: entry.correctness.passed === Object.entries(entry.correctness)
        .filter(([key]) => key !== "passed").every(([, value]) => value === true),
    };
  });
  const invariants = {
    checksums: checksums.passed,
    exactFileSet: JSON.stringify(actualFiles) === JSON.stringify(expectedFiles),
    runContract: run.schema === (run.config.preparedPublicSource
      ? "lbh-s23p-prepared-public-source-run-v1"
      : run.config.publicBody ? "lbh-s23-public-body-run-v1"
      : run.config.compression ? "lbh-s20-compression-run-v1"
      : run.config.binary ? "lbh-s16-binary-run-v1" : "lbh-s13-isolated-client-run-v1") && run.dirty === false
      && artifactPopulations.length > 0 && new Set(artifactPopulations).size === artifactPopulations.length
      && run.config.warmupMs === WARMUP_MS && run.config.windowMs === WINDOW_MS,
    aggregateContract: aggregate.schema === (run.config.preparedPublicSource
      ? "lbh-s23p-prepared-public-source-aggregate-v1"
      : run.config.publicBody ? "lbh-s23-public-body-aggregate-v1"
      : run.config.compression ? "lbh-s20-compression-aggregate-v1"
      : run.config.binary ? "lbh-s16-binary-aggregate-v1" : "lbh-s13-isolated-client-aggregate-v1")
      && aggregate.commit === run.commit && aggregate.scenarios.length === artifactPopulations.length,
    exactPopulations: JSON.stringify(scenarios.map((entry) => entry.population))
      === JSON.stringify(artifactPopulations),
    semanticRecomputation: semantic.every((checks) => Object.values(checks).every(Boolean)),
    correctness: scenarios.every((entry) => entry.correctness.passed === true),
    processMetricsPresent: scenarios.every((entry) => entry.performance.authority.cpuUsage.totalMicroseconds > 0
      && entry.performance.clients.every((client) => client.cpuUsage.totalMicroseconds > 0)),
    fixedWindowRetainsAllClients: scenarios.every((entry) =>
      Object.keys(entry.cadence.receiverAcceptedPairsPerSecondByClient).length === entry.population),
    cleanup: cleanup.every((entry, index) => entry.population === artifactPopulations[index]
      && entry.authorityPid === scenarios[index].topology.authorityPid
      && entry.passed === true && entry.portDead === true && entry.pidDead === true
      && entry.preStopConnections === 0
      && (!run.config.compression
        || (entry.preStopCompressedRetainedFrames === 0 && entry.preStopCompressedRetainedBytes === 0))),
    s12Binding: s12.passed && s12.actualAggregateSha256 === S12_SHA256
      && run.s12Binding.compositeSha256 === S12_SHA256
      && aggregate.s12Binding.compositeSha256 === S12_SHA256,
    s15Binding: !run.config.binary || (s15?.passed && s15.actualAggregateSha256 === S15_SHA256
      && run.s15Binding?.compositeSha256 === S15_SHA256
      && aggregate.s15Binding?.compositeSha256 === S15_SHA256),
  };
  return { passed: Object.values(invariants).every(Boolean), invariants, semantic, checksums };
}

async function main() {
  const validateIndex = process.argv.indexOf("--validate-artifact");
  if (validateIndex >= 0) {
    const result = validateArtifact(path.resolve(process.argv[validateIndex + 1]));
    console.log(JSON.stringify(result, null, 2));
    process.exit(result.passed ? 0 : 1);
  }
  const s12 = validateChecksums(S12_ARTIFACT);
  if (!s12.passed || s12.actualAggregateSha256 !== S12_SHA256) {
    throw new Error(`S12 artifact binding failed: ${JSON.stringify(s12)}`);
  }
  const s15 = S16_BINARY ? validateChecksums(S15_ARTIFACT) : null;
  if (S16_BINARY && (!s15.passed || s15.actualAggregateSha256 !== S15_SHA256)) {
    throw new Error(`S15 artifact binding failed: ${JSON.stringify(s15)}`);
  }
  const commit = git("rev-parse", "HEAD");
  const dirty = Boolean(git("status", "--porcelain"));
  if (dirty && process.env.LBH_S13_ALLOW_DIRTY !== "1" && process.env.LBH_S16_ALLOW_DIRTY !== "1"
      && process.env.LBH_S20_ALLOW_DIRTY !== "1" && process.env.LBH_S23_ALLOW_DIRTY !== "1"
      && process.env.LBH_S23P_ALLOW_DIRTY !== "1") {
    throw new Error(`${PROFILE.toUpperCase()} evidence requires clean HEAD`);
  }
  const runDir = path.resolve((S23P_PREPARED_PUBLIC_SOURCE ? process.env.LBH_S23P_OUTPUT_DIR
    : S23_PUBLIC_BODY ? process.env.LBH_S23_OUTPUT_DIR
    : S20_COMPRESSION ? process.env.LBH_S20_OUTPUT_DIR
    : S16_BINARY ? process.env.LBH_S16_OUTPUT_DIR : process.env.LBH_S13_OUTPUT_DIR)
    || path.join(__dirname, "screenshots",
      `multiplayer-state-pair-${PROFILE}-${new Date().toISOString().replace(/[:.]/g, "")}-${commit.slice(0, 7)}`));
  fs.mkdirSync(runDir, { recursive: false });
  writeExclusive(path.join(runDir, "run.json"), {
    schema: RUN_SCHEMA, commit, dirty, seed: SEED,
    command: `${process.env.LBH_S13_POPULATIONS
      ? `LBH_S13_POPULATIONS=${process.env.LBH_S13_POPULATIONS} ` : ""}`
      + `${S23_PUBLIC_BODY ? `${S23P_PREPARED_PUBLIC_SOURCE ? "LBH_S23P_PREPARED_PUBLIC_SOURCE=1 " : ""}LBH_S23_PUBLIC_BODY=1 LBH_S20_COMPRESSION=1 `
      : S20_COMPRESSION ? "LBH_S20_COMPRESSION=1 " : S16_BINARY ? "LBH_S16_BINARY=1 " : ""}`
      + `${S21_STAGE_PROFILE ? "LBH_S21_STAGE_PROFILE=1 " : ""}`
      + `${S23T_PROFILE ? "LBH_S23T_PUBLIC_BODY_PROFILE=1 " : ""}`
      + "node tests/multiplayer-state-pair-clock-attribution.cjs",
    config: { populations: POPULATIONS, warmupMs: WARMUP_MS, windowMs: WINDOW_MS,
      binary: S16_BINARY, compression: S20_COMPRESSION, publicBody: S23_PUBLIC_BODY,
      preparedPublicSource: S23P_PREPARED_PUBLIC_SOURCE,
      stageProfile: S21_STAGE_PROFILE, s23tProfile: S23T_PROFILE,
      ...(S23T_CAPTURE_MODE ? { s23tCaptureMode: S23T_CAPTURE_MODE } : {}) },
    machine: { hostname: os.hostname(), platform: os.platform(), release: os.release(), arch: os.arch(),
      cpu: os.cpus()[0]?.model || null, logicalCpuCount: os.cpus().length, node: process.version },
    s12Binding: { path: path.relative(ROOT, S12_ARTIFACT), compositeSha256: S12_SHA256 },
    ...(S16_BINARY ? { s15Binding: { path: path.relative(ROOT, S15_ARTIFACT), compositeSha256: S15_SHA256 } } : {}),
  });
  const scenarios = [];
  for (const population of POPULATIONS) scenarios.push(await runScenario(population, runDir, commit));
  const aggregate = {
    schema: AGGREGATE_SCHEMA, commit,
    s12Binding: { path: path.relative(ROOT, S12_ARTIFACT), compositeSha256: S12_SHA256 },
    ...(S16_BINARY ? { s15Binding: { path: path.relative(ROOT, S15_ARTIFACT), compositeSha256: S15_SHA256 } } : {}),
    scenarios: scenarios.map((entry) => ({ population: entry.population,
      authorityMinHz: entry.cadence.minimumAuthorityAcceptedPairsPerSecond,
      receiverMinHz: entry.cadence.minimumReceiverAcceptedPairsPerSecond,
      projectionP95Ms: entry.performance.authority.projectionAndPublishMs.p95,
      authorityOneCoreFraction: entry.performance.authority.cpuUsage.oneCoreFraction,
      aggregateClientOneCoreFraction: entry.performance.aggregateClientOneCoreFraction,
      overloadState: entry.authorityState.overloadState,
      queueAndBackpressure: entry.performance.queueAndBackpressure,
      correctnessPassed: entry.correctness.passed })),
    decisionBoundary: "Attribution only. Process isolation can distinguish authority work from receiver/harness contention but cannot admit hosted, fleet, WAN, or high-count play.",
  };
  writeExclusive(path.join(runDir, "aggregate.json"), aggregate);
  const files = fs.readdirSync(runDir).filter((file) => file.endsWith(".json") && file !== "checksums.json");
  writeExclusive(path.join(runDir, "checksums.json"), aggregateChecksum(runDir, files));
  const validation = validateArtifact(runDir);
  console.log(`${PROFILE.toUpperCase()} ${S20_COMPRESSION ? "compression" : S16_BINARY ? "binary" : "isolated-client"} artifact: ${runDir}`);
  console.log(`Aggregate SHA-256: ${validation.checksums.actualAggregateSha256}`);
  console.log(`Validation: ${validation.passed ? "PASS" : "FAIL"}`);
  process.exit(validation.passed ? 0 : 1);
}

main().catch((error) => { console.error(error.stack || error.message); process.exit(1); });
