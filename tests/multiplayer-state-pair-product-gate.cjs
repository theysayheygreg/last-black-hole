#!/usr/bin/env node
"use strict";

const crypto = require("crypto");
const fs = require("fs");
const net = require("net");
const os = require("os");
const path = require("path");
const { execFileSync } = require("child_process");
const { performance } = require("perf_hooks");
const { WebSocket } = require("ws");
const { startSimServer, stopSimServer } = require("./helpers.cjs");
const { createClientDeltaReceiver } = require("../scripts/client-delta-receiver.cjs");
const { projectionHash } = require("../scripts/canonical-structural-delta.cjs");
const { summarizeWindow } = require("../scripts/replication-accounting.cjs");
const { WIRE_PROTOCOL_VERSION_V2, SIM_PROTOCOL_VERSION } = require("../scripts/multiplayer-wire-protocol.cjs");
const { distribution, fixedWindowRates, eventBreakdown, aggregateChecksum,
  validateChecksums } = require("./network/state-pair-product-metrics.cjs");

const ROOT = path.resolve(__dirname, "..");
const SEED = 0x53A1B04E;
const INPUT_HZ = 10;
const TARGET_BPS = 64 * 1024;
const SENSITIVITY_BPS = 80 * 1024;
const S0 = Object.freeze({
  1: { downlinkBps: 274607, pairP50: 28501, pairP95: 30578 },
  4: { downlinkBps: 255652, pairP50: 26817, pairP95: 28790 },
  8: { downlinkBps: 241892, pairP50: 25237, pairP95: 26889 },
});
const S1_STATIC_PAIR_SAVINGS_BYTES = 953;
const PROFILE = process.argv.includes("--review") ? "review" : "canonical";
const POPULATIONS = PROFILE === "review" ? [1, 8] : [1, 4, 8];
const NORMAL_WARMUP_MS = PROFILE === "review" ? 5_000 : 60_000;
const NORMAL_WINDOW_MS = PROFILE === "review" ? 20_000 : 300_000;
const CHURN_WARMUP_MS = PROFILE === "review" ? 5_000 : 20_000;
const CHURN_WINDOW_MS = PROFILE === "review" ? 30_000 : 90_000;
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function writeExclusive(file, value) {
  fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`, { flag: "wx" });
}

function git(...args) {
  return execFileSync("git", args, { cwd: ROOT, encoding: "utf8" }).trim();
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

async function request(port, pathname, { method = "GET", body, authority, headers = {} } = {}) {
  const requestHeaders = { "content-type": "application/json", connection: "close", ...headers };
  if (authority) {
    requestHeaders["x-lbh-command-credential"] = authority.commandCredential;
    requestHeaders["x-lbh-player-id"] = authority.playerId;
    requestHeaders["x-lbh-run-id"] = authority.runId;
  }
  const response = await fetch(`http://127.0.0.1:${port}${pathname}`, {
    method, headers: requestHeaders, body: body === undefined ? undefined : JSON.stringify(body),
  });
  const bytes = Buffer.from(await response.arrayBuffer());
  let responseBody = null;
  if (bytes.length) {
    try { responseBody = JSON.parse(bytes.toString("utf8")); } catch { responseBody = null; }
  }
  return { status: response.status, body: responseBody, bytes };
}

async function waitFor(check, label, timeoutMs = 8000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const value = await check();
    if (value) return value;
    await sleep(20);
  }
  throw new Error(`Timed out waiting for ${label}`);
}

function send(client, frame) {
  const wire = JSON.stringify(frame);
  // Close can race one final heartbeat/event callback. That frame belongs to
  // teardown and must not turn an otherwise clean, drained run into a harness
  // exception or be counted as accepted uplink traffic.
  if (client.ws.readyState !== WebSocket.OPEN) return false;
  client.ws.send(wire);
  const key = frame.type === "ack" ? `ack:${frame.ackKind}` : frame.type;
  const row = client.uplink[key] ||= { frames: 0, bytes: 0 };
  row.frames += 1;
  row.bytes += Buffer.byteLength(wire, "utf8");
  return true;
}

function scanPairShape(client, frame) {
  const payloads = [frame.public, frame.owner];
  for (const payload of payloads) {
    if (payload.kind === "keyframe") client.shape.keyframes += 1;
    else {
      client.shape.deltas += 1;
      client.shape.creates += payload.delta.creates.length;
      client.shape.updates += payload.delta.updates.length;
      client.shape.despawns += payload.delta.despawns.length;
      client.shape.rootOps += payload.delta.rootOps.length;
      if (payload.delta.despawns.some((entry) => entry.reason === "reincarnated")) client.shape.reincarnations += 1;
      client.shape.reincarnations += payload.delta.creates.filter((entry) => entry.incarnation > 1).length;
    }
  }
}

function observeMaterializedLifecycle(client, publicView) {
  const current = new Map(publicView.entities.map((entity) => [entity.publicEntityId, {
    category: entity.category,
    sourceId: entity.sourceId,
    incarnation: entity.incarnation,
    hash: crypto.createHash("sha256").update(JSON.stringify(entity.components)).digest("hex"),
  }]));
  if (client.materializedEntities === null) {
    client.observedLifecycle.creates += current.size;
    client.observedLifecycle.reincarnations += [...current.values()].filter((entry) => entry.incarnation > 1).length;
  } else {
    for (const [id, prior] of client.materializedEntities) {
      const next = current.get(id);
      if (!next) {
        client.observedLifecycle.despawns += 1;
        client.retiredIncarnations.set(id, Math.max(client.retiredIncarnations.get(id) || 0, prior.incarnation));
      } else if (next.hash !== prior.hash) client.observedLifecycle.componentChanges += 1;
    }
    for (const [id, next] of current) {
      if (client.materializedEntities.has(id)) continue;
      client.observedLifecycle.creates += 1;
      if (next.incarnation > (client.retiredIncarnations.get(id) || 0) || next.incarnation > 1) {
        client.observedLifecycle.reincarnations += next.incarnation > 1 ? 1 : 0;
      }
    }
  }
  client.materializedEntities = current;
}

function hasMaterializedPublicEntity(client, category, sourceId) {
  if (!(client.materializedEntities instanceof Map)) return false;
  return [...client.materializedEntities.values()].some((entity) =>
    entity.category === category && entity.sourceId === sourceId);
}

async function openStatePairClient({ port, authority, label, reuseManifest = false, fault = {} }) {
  const issued = await request(port, "/multiplayer/ticket", { method: "POST", authority, body: {
    kind: "admission", supportedVersions: [WIRE_PROTOCOL_VERSION_V2],
    capabilities: ["static-manifest-v1", "state-pair-v1"],
  } });
  if (issued.status !== 200 || !issued.body.capabilities.includes("state-pair-v1")) {
    throw new Error(`${label} state-pair ticket failed: ${JSON.stringify(issued.body)}`);
  }
  const client = {
    label, authority, ticket: issued.body, fault, ws: new WebSocket(`ws://127.0.0.1:${port}/stream`,
      { perMessageDeflate: false }),
    welcome: null, receiver: null, error: null, close: null, pairCount: 0, acceptedPairs: 0,
    lastPairAt: null, lastStatePairAckSentFrameId: 0,
    inputSeq: 0, actionSeq: 0, commandSeq: 0, uplink: {}, downlink: {},
    manifest: { reused: reuseManifest, servedBytes: 0, hash: issued.body.manifestHash },
    clientWorkSamples: [], ackWorkSamples: [], faultLog: [], hashesVerified: 0,
    shape: { keyframes: 0, deltas: 0, creates: 0, updates: 0, despawns: 0, reincarnations: 0, rootOps: 0 },
    materializedEntities: null, retiredIncarnations: new Map(),
    observedLifecycle: { creates: 0, despawns: 0, reincarnations: 0, componentChanges: 0 },
  };
  client.ws.on("error", (error) => { client.error = error.message; });
  client.ws.on("close", (code, reason) => { client.close = { code, reason: reason.toString("utf8"), at: Date.now() }; });
  client.ws.on("message", (raw) => {
    const text = raw.toString("utf8");
    const frame = JSON.parse(text);
    const key = frame.type === "ack" ? `ack:${frame.ackKind}` : frame.type;
    const row = client.downlink[key] ||= { frames: 0, bytes: 0 };
    row.frames += 1;
    row.bytes += Buffer.byteLength(text, "utf8");
    if (frame.type === "welcome") {
      client.welcome = frame;
      client.inputSeq = frame.lastInputSeq;
      client.actionSeq = frame.lastActionSeq;
      client.commandSeq = frame.lastCommandSeq;
      client.receiver = createClientDeltaReceiver({ context: {
        matchId: frame.runId, sessionId: frame.connectionId,
        authorityIncarnation: frame.authorityIncarnation, recipientId: frame.membershipId,
        recipientIncarnation: frame.connectionEpoch, manifestSchema: frame.manifestSchema,
        manifestHash: frame.manifestHash,
      } });
      return;
    }
    if (frame.type === "heartbeat") {
      send(client, { type: "pong", heartbeatId: frame.heartbeatId, clientTimeMs: Date.now() });
      return;
    }
    if (frame.type === "event") {
      send(client, { type: "ack", ackKind: "delivery", deliveryId: frame.deliveryId });
      send(client, { type: "ack", ackKind: "event", eventSeq: frame.eventSeq });
      return;
    }
    if (frame.type === "ack" && frame.ackKind === "action" && Number.isSafeInteger(frame.deliveryId)) {
      send(client, { type: "ack", ackKind: "delivery", deliveryId: frame.deliveryId });
      return;
    }
    if (frame.type !== "statePair") return;
    client.pairCount += 1;
    client.lastPairAt = Date.now();
    scanPairShape(client, frame);
    if (fault.dropPairNumber === client.pairCount) {
      client.faultLog.push({ type: "frame-loss", frameId: frame.frameId, at: Date.now() });
      return;
    }
    const started = performance.now();
    const outcome = client.receiver.receive(text);
    client.clientWorkSamples.push({ at: Date.now(), ms: performance.now() - started });
    if (!outcome.accepted) {
      client.faultLog.push({ type: "recovery", reason: outcome.reason, afterFrameId: frame.frameId, at: Date.now() });
      send(client, outcome.recovery);
      return;
    }
    client.acceptedPairs += 1;
    if (projectionHash(outcome.state.public) !== outcome.ack.publicHash
      || projectionHash(outcome.state.owner) !== outcome.ack.ownerHash
      || frame.public.resultHash !== outcome.ack.publicHash || frame.owner.resultHash !== outcome.ack.ownerHash) {
      client.error = "materialized authority/client projection hash mismatch";
      client.ws.terminate();
      return;
    }
    if (outcome.state.matchId !== client.welcome.runId
      || outcome.state.recipientId !== client.welcome.membershipId
      || outcome.state.owner.entities.some((entity) => entity.sourceId !== client.welcome.membershipId)) {
      client.error = "cross-match or cross-recipient projection leakage";
      client.ws.terminate();
      return;
    }
    client.hashesVerified += 1;
    observeMaterializedLifecycle(client, outcome.state.public);
    if (fault.withholdAckPairNumber === client.pairCount) {
      client.faultLog.push({ type: "ack-loss", frameId: frame.frameId, at: Date.now() });
      return;
    }
    const ackStarted = performance.now();
    if (send(client, outcome.ack)) client.lastStatePairAckSentFrameId = frame.frameId;
    client.ackWorkSamples.push({ at: Date.now(), ms: performance.now() - ackStarted });
  });
  await new Promise((resolve, reject) => { client.ws.once("open", resolve); client.ws.once("error", reject); });
  send(client, { type: "hello", wireVersion: issued.body.wireVersion,
    simProtocolVersion: SIM_PROTOCOL_VERSION, admissionTicket: issued.body.ticket,
    capabilities: issued.body.capabilities, manifestSchema: issued.body.manifestSchema,
    manifestHash: issued.body.manifestHash });
  await waitFor(() => client.welcome || client.error || client.close, `${label} welcome`);
  if (!client.welcome) throw new Error(`${label} failed before welcome: ${client.error || JSON.stringify(client.close)}`);
  if (!reuseManifest) {
    const fetched = await request(port, issued.body.fetchPath, {
      headers: { authorization: `Bearer ${issued.body.manifestCapability}` },
    });
    if (fetched.status !== 200 || fetched.bytes.length !== issued.body.manifestBytes
      || `sha256:${crypto.createHash("sha256").update(fetched.bytes).digest("hex")}` !== issued.body.manifestHash) {
      throw new Error(`${label} manifest verification failed`);
    }
    client.manifest.servedBytes = fetched.bytes.length;
  }
  send(client, { type: "manifestAck", manifestSchema: issued.body.manifestSchema,
    manifestHash: issued.body.manifestHash, manifestBytes: issued.body.manifestBytes,
    connectionEpoch: client.welcome.connectionEpoch });
  await waitFor(() => client.acceptedPairs > 0 || client.error || client.close, `${label} first state pair`);
  if (client.error || client.close) throw new Error(`${label} admission failed: ${client.error || JSON.stringify(client.close)}`);
  return client;
}

async function closeClient(client) {
  if (!client || client.ws.readyState === WebSocket.CLOSED) return;
  client.ws._socket?.resume();
  client.ws.close(1000, "gate complete");
  await waitFor(() => client.close, `${client.label} close`, 1500).catch(() => client.ws.terminate());
}

function summarizeClients(clients) {
  return clients.map((client) => ({
    label: client.label, membershipId: client.welcome.membershipId, connectionEpoch: client.welcome.connectionEpoch,
    acceptedPairs: client.acceptedPairs, hashesVerified: client.hashesVerified,
    lastAcceptedFrameId: client.receiver?.current()?.frameId || 0,
    lastStatePairAckSentFrameId: client.lastStatePairAckSentFrameId,
    manifest: client.manifest, uplinkSerialized: client.uplink, downlinkObserved: client.downlink,
    clientApplyMs: distribution(client.clientWorkSamples.map((sample) => sample.ms)),
    ackSerializeSendMs: distribution(client.ackWorkSamples.map((sample) => sample.ms)),
    shape: client.shape, faults: client.faultLog, error: client.error, close: client.close,
    observedLifecycle: client.observedLifecycle,
  }));
}

function memorySummary(samples) {
  const rows = samples.map((sample) => sample.memory);
  const elapsedSeconds = samples.map((sample) => (sample.at - samples[0].at) / 1000);
  const slope = (field) => {
    const values = rows.map((row) => row[field]);
    const meanX = elapsedSeconds.reduce((a, b) => a + b, 0) / elapsedSeconds.length;
    const meanY = values.reduce((a, b) => a + b, 0) / values.length;
    const numerator = elapsedSeconds.reduce((sum, x, index) => sum + (x - meanX) * (values[index] - meanY), 0);
    const denominator = elapsedSeconds.reduce((sum, x) => sum + (x - meanX) ** 2, 0);
    return denominator > 0 ? numerator / denominator : 0;
  };
  return { samples: samples.length, rssBytes: distribution(rows.map((row) => row.rss)),
    heapUsedBytes: distribution(rows.map((row) => row.heapUsed)),
    externalBytes: distribution(rows.map((row) => row.external)),
    slopeBytesPerSecond: { rss: slope("rss"), heapUsed: slope("heapUsed") },
    first: rows[0], last: rows.at(-1) };
}

function deltaHealth(before, after) {
  const left = before.multiplayer.projection.accounting;
  const right = after.multiplayer.projection.accounting;
  return {
    simTickMs: right.costDistributions.simTickMs,
    projectionAndPublishMs: right.costDistributions.projectionReplicationMs,
    projectionSamples: right.projectionDurationSamples - left.projectionDurationSamples,
    projectionTotalMs: right.projectionDurationTotalMs - left.projectionDurationTotalMs,
    replicationCostConsumedMs: right.replicationCostConsumedTotalMs - left.replicationCostConsumedTotalMs,
    replicationCostOverflowMs: right.replicationCostOverflowMs - left.replicationCostOverflowMs,
  };
}

async function runWorkload(clientsRef, durationMs, { port, memorySamples, churn = null }) {
  const started = performance.now();
  const wallStartedAt = Date.now();
  const steps = Math.floor(durationMs / (1000 / INPUT_HZ));
  let lastMemorySecond = -1;
  for (let step = 0; step < steps; step += 1) {
    const target = started + step * (1000 / INPUT_HZ);
    const delay = target - performance.now();
    if (delay > 0) await sleep(delay);
    const elapsed = performance.now() - started;
    await churn?.(elapsed, clientsRef);
    const clients = clientsRef.current.filter((client) => client.ws.readyState === WebSocket.OPEN && !client.error);
    for (let seat = 0; seat < clients.length; seat += 1) {
      const client = clients[seat];
      const phase = ((step + seat * 7) % 64) / 64 * Math.PI * 2;
      send(client, { type: "input", inputSeq: ++client.inputSeq,
        moveX: Number(Math.cos(phase).toFixed(6)), moveY: Number(Math.sin(phase).toFixed(6)),
        thrust: step % 5 !== 0 ? 1 : 0, brake: step % 29 === 0 ? 1 : 0,
        slingshot: false, ability1: false, ability2: false, clientTimeMs: Date.now() });
    }
    if (step > 0 && step % (15 * INPUT_HZ) === 0) {
      for (const client of clients) {
        send(client, { type: "action", actionId: `${client.label}-pulse-${step}`,
          actionSeq: ++client.actionSeq, commandSeq: ++client.commandSeq,
          actionKind: "pulse", payload: {}, clientTimeMs: Date.now() });
      }
    }
    const second = Math.floor(elapsed / 1000);
    if (second !== lastMemorySecond) {
      const health = await request(port, "/health/compact");
      memorySamples.push({ at: Date.now(), memory: health.body.process.memory,
        publisher: health.body.multiplayer.statePair.publisher,
        adapter: { queuedBytes: health.body.multiplayer.adapter.queuedBytes,
          pendingScheduledSends: health.body.multiplayer.adapter.pendingScheduledSends,
          connections: health.body.multiplayer.adapter.connections } });
      lastMemorySecond = second;
    }
  }
  const remaining = started + durationMs - performance.now();
  if (remaining > 0) await sleep(remaining);
  return { wallStartedAt, wallEndedAt: Date.now(), requestedDurationMs: durationMs,
    actualDurationMs: performance.now() - started, inputSteps: steps };
}

async function setupPopulation(port, population, scenarioName) {
  const started = await request(port, "/session/start", { method: "POST", body: {
    mapId: "shallows", requesterId: `${scenarioName}-seat-0`, requesterName: `${scenarioName} seat 0`,
    maxPlayers: population, seed: SEED,
  } });
  if (started.status !== 200) throw new Error(`session start failed: ${JSON.stringify(started.body)}`);
  const authorities = [];
  const clients = [];
  for (let seat = 0; seat < population; seat += 1) {
    const joined = await request(port, "/join", { method: "POST", body: {
      runId: started.body.session.runId, clientId: `${scenarioName}-seat-${seat}`,
      joinTicket: seat === 0 ? started.body.joinTicket : undefined, name: `${scenarioName} seat ${seat}`,
    } });
    if (joined.status !== 200) throw new Error(`join ${seat} failed: ${JSON.stringify(joined.body)}`);
    authorities.push(joined.body.authority);
    clients.push(await openStatePairClient({ port, authority: joined.body.authority,
      label: `${scenarioName}-seat-${seat}` }));
  }
  return { started, authorities, clients };
}

function scenarioWindows(events, startAt, endAt, recipients, churn) {
  const widths = churn ? [1_000, 5_000, 10_000, 30_000] : [1_000, 5_000, 10_000, 60_000];
  return Object.fromEntries(widths.filter((width) => width <= endAt - startAt)
    .map((width) => [`${width / 1000}s`, fixedWindowRates(events,
      { startAt, endAt, windowMs: width, recipients })]));
}

async function runScenario({ population, scenario, runDir }) {
  const churn = scenario === "churn";
  const port = await freePort();
  const clientsRef = { current: [] };
  const allClients = [];
  const memorySamples = [];
  let authorityPid = null;
  let preStopHealth = null;
  let faultActions = [];
  try {
    await startSimServer(port, { keepAlive: true, registerProcessCleanup: false, env: {
      NODE_ENV: "test", LBH_SIM_WS_ENABLED: "true", LBH_SIM_WS_JSON_V2: "true",
      LBH_SIM_WS_STATE_PAIR_V1: "true", LBH_SIM_WS_REPLICATION_ACCOUNTING: "1",
      LBH_REPLICATION_BASELINE_CAPTURE: "1", LBH_SIM_MAX_SIM_TIME: "7200",
    } });
    authorityPid = Number(fs.readFileSync(path.join(ROOT, "tmp", `sim-server-${port}.pid`), "utf8").trim());
    const setup = await setupPopulation(port, population, `${scenario}-${population}`);
    clientsRef.current = setup.clients;
    allClients.push(...setup.clients);
    const warmupMs = churn ? CHURN_WARMUP_MS : NORMAL_WARMUP_MS;
    await runWorkload(clientsRef, warmupMs, { port, memorySamples });
    const resetEvidence = await request(port, "/debug/multiplayer/evidence-reset", { method: "POST" });
    if (resetEvidence.status !== 200) {
      throw new Error(`performance evidence reset failed: ${JSON.stringify(resetEvidence.body)}`);
    }
    const startHealth = (await request(port, "/health/compact")).body;
    const startAt = Date.now();
    const applied = new Set();
    const churnSchedule = !churn ? null : async (elapsed, ref) => {
      const at = PROFILE === "review"
        ? { pause: 3000, drop: 7000, ack: 11000, reconnect: 16000, leave: 22000, mutate: 26000 }
        : { pause: 5000, drop: 15000, ack: 25000, reconnect: 35000, leave: 55000, mutate: 70000 };
      const once = async (name, fn) => {
        if (elapsed < at[name] || applied.has(name)) return;
        applied.add(name);
        const result = await fn();
        faultActions.push({ name, elapsedMs: elapsed, at: Date.now(), ...(result || {}) });
      };
      await once("pause", async () => {
        const target = ref.current.at(-1);
        target.ws._socket.pause();
        // Stay below the publisher's eight-pair retention cap here. Loss and
        // stale-base recovery are injected independently so this probe measures
        // bounded queue/coalescing without accidentally replacing their lane.
        const durationMs = PROFILE === "review" ? 400 : 600;
        setTimeout(() => target.ws._socket?.resume(), durationMs);
        return { target: target.label, durationMs };
      });
      await once("drop", async () => {
        const target = ref.current[0];
        target.fault.dropPairNumber = target.pairCount + 1;
        return { target: target.label, pairNumber: target.fault.dropPairNumber };
      });
      await once("ack", async () => {
        const target = ref.current[Math.min(1, ref.current.length - 1)];
        target.fault.withholdAckPairNumber = target.pairCount + 1;
        return { target: target.label, pairNumber: target.fault.withholdAckPairNumber };
      });
      await once("reconnect", async () => {
        const old = ref.current[0];
        await closeClient(old);
        const rejoined = await request(port, "/join", { method: "POST", authority: old.authority, body: {
          runId: old.authority.runId, clientId: old.authority.playerId, name: old.label,
        } });
        if (rejoined.status !== 200) throw new Error(`reconnect failed: ${JSON.stringify(rejoined.body)}`);
        const replacement = await openStatePairClient({ port, authority: rejoined.body.authority,
          label: `${old.label}-reconnect`, reuseManifest: true });
        ref.current[0] = replacement;
        allClients.push(replacement);
        return { target: old.label, oldEpoch: old.welcome.connectionEpoch,
          newEpoch: replacement.welcome.connectionEpoch, manifestReused: replacement.manifest.reused };
      });
      await once("leave", async () => {
        const index = ref.current.length - 1;
        const old = ref.current[index];
        const sourceId = old.authority.playerId;
        const observers = ref.current.filter((client) => client !== old
          && client.ws.readyState === WebSocket.OPEN && !client.error);
        const presenceBeforeLeave = observers.length === 0 || await waitFor(() =>
          observers.every((client) => hasMaterializedPublicEntity(client, "player", sourceId)),
        `${scenario}/${population} departing player presence`);
        await closeClient(old);
        const left = await request(port, "/leave", { method: "POST", authority: old.authority, body: {
          runId: old.authority.runId, playerId: old.authority.playerId, commandSeq: old.commandSeq + 1,
        } });
        if (left.status !== 200) throw new Error(`leave failed: ${JSON.stringify(left.body)}`);
        const authorityAbsence = await waitFor(async () => {
          const health = await request(port, "/health/compact");
          return health.body.playerCount === population - 1;
        }, `${scenario}/${population} authority leave`);
        const absenceObserved = observers.length === 0 || await waitFor(() =>
          observers.every((client) => !hasMaterializedPublicEntity(client, "player", sourceId)),
        `${scenario}/${population} departing player despawn`);
        const rejoined = await request(port, "/join", { method: "POST", body: {
          runId: old.authority.runId, clientId: old.authority.playerId, name: old.label,
        } });
        if (rejoined.status !== 200) throw new Error(`reincarnation join failed: ${JSON.stringify(rejoined.body)}`);
        const replacement = await openStatePairClient({ port, authority: rejoined.body.authority,
          label: `${old.label}-reincarnated` });
        ref.current[index] = replacement;
        allClients.push(replacement);
        const replacementObserved = await waitFor(() => [...observers, replacement]
          .every((client) => hasMaterializedPublicEntity(client, "player", sourceId)),
        `${scenario}/${population} replacement player create`);
        return { target: old.label, oldMembership: old.welcome.membershipId,
          replacementMembership: replacement.welcome.membershipId,
          observerCount: observers.length, presenceBeforeLeave: Boolean(presenceBeforeLeave),
          authorityAbsenceObserved: Boolean(authorityAbsence),
          clientAbsenceObserved: Boolean(absenceObserved),
          clientReplacementObserved: Boolean(replacementObserved) };
      });
      await once("mutate", async () => {
        const target = ref.current[Math.min(2, ref.current.length - 1)];
        const changed = await request(port, "/debug/player-state", { method: "POST", body: {
          clientId: target.authority.playerId, wx: 0.125, wy: 0.875, vx: 0.5, vy: -0.25, signalLevel: 0.6,
        } });
        if (changed.status !== 200) throw new Error(`debug mutation failed: ${JSON.stringify(changed.body)}`);
        return { target: target.label };
      });
    };
    const workload = await runWorkload(clientsRef, churn ? CHURN_WINDOW_MS : NORMAL_WINDOW_MS,
      { port, memorySamples, churn: churnSchedule });
    const endAt = startAt + (churn ? CHURN_WINDOW_MS : NORMAL_WINDOW_MS);
    const endHealth = (await request(port, "/health/compact")).body;
    for (const client of clientsRef.current) await closeClient(client);
    await waitFor(async () => {
      const health = (await request(port, "/health/compact")).body;
      return health.multiplayer.adapter.connections === 0
        && health.multiplayer.adapter.pendingScheduledSends === 0 ? health : false;
    }, `${scenario}/${population} final drain`);
    preStopHealth = (await request(port, "/health")).body;
    const accounting = preStopHealth.multiplayer.adapter.replication;
    const selected = accounting.events.filter((event) => event.timestamp >= startAt && event.timestamp < endAt);
    const recipients = [...new Set(selected.map((event) => event.recipient))].sort();
    const windows = scenarioWindows(accounting.events, startAt, endAt, recipients, churn);
    const normalSummary = churn ? null : summarizeWindow(accounting, { startAt, endAt,
      evidenceFinalized: true, expectedRecipients: population, pendingSendCallbacks: 0 });
    const perRecipientMean = churn ? Object.fromEntries(recipients.map((recipient) => {
      const downlink = selected.filter((event) => event.recipient === recipient
        && event.metric === "accepted" && event.direction === "authority->client")
        .reduce((sum, event) => sum + event.bytes, 0);
      return [recipient, downlink / ((endAt - startAt) / 1000)];
    })) : Object.fromEntries(Object.entries(normalSummary.recipients)
      .map(([recipient, row]) => [recipient, row.downlinkAcceptedBytesPerSecond]));
    const meanWorst = Math.max(...Object.values(perRecipientMean));
    const p95OneSecond = windows["1s"].allRecipientWindowsBytesPerSecond.p95;
    const clientSummary = summarizeClients(allClients);
    const shape = clientSummary.reduce((sum, client) => {
      for (const key of Object.keys(sum)) sum[key] += client.shape[key];
      return sum;
    }, { keyframes: 0, deltas: 0, creates: 0, updates: 0, despawns: 0, reincarnations: 0, rootOps: 0 });
    const observedLifecycle = clientSummary.reduce((sum, client) => {
      for (const key of Object.keys(sum)) sum[key] += client.observedLifecycle[key];
      return sum;
    }, { creates: 0, despawns: 0, reincarnations: 0, componentChanges: 0 });
    const publisher = preStopHealth.multiplayer.statePair.publisher;
    const livePublisher = endHealth.multiplayer.statePair.publisher;
    const correctness = {
      allClientHashesMatched: clientSummary.every((client) => client.hashesVerified === client.acceptedPairs),
      noClientErrors: clientSummary.every((client) => client.error === null),
      publisherDrained: publisher.recipients === 0 && publisher.pendingPairs === 0 && publisher.retainedBytes === 0,
      statePairAcksConverged: publisher.ackAccepted > 0,
      unexpectedAckRejects: churn || publisher.ackRejected === 0,
      accountingComplete: accounting.overflow === 0 && accounting.evidenceFailure === null,
      faultConvergence: !churn || clientSummary.every((client) => {
        const loss = client.faults.find((fault) => fault.type === "frame-loss");
        const ackLoss = client.faults.find((fault) => fault.type === "ack-loss");
        if (loss && !client.faults.some((fault) => fault.type === "recovery")) return false;
        if (ackLoss && !(client.lastAcceptedFrameId > ackLoss.frameId
          && client.lastStatePairAckSentFrameId > ackLoss.frameId)) return false;
        return true;
      }),
      lifecycleObserved: !churn || (observedLifecycle.componentChanges > 0
        && faultActions.some((entry) => entry.name === "leave"
          && entry.oldMembership !== entry.replacementMembership
          && entry.presenceBeforeLeave && entry.authorityAbsenceObserved
          && entry.clientAbsenceObserved && entry.clientReplacementObserved)),
    };
    const admission = {
      steadyMeanAtOrBelow64KiB: churn ? null : meanWorst <= TARGET_BPS,
      steadyOneSecondP95AtOrBelow80KiB: churn ? null : p95OneSecond <= SENSITIVITY_BPS,
      correctnessPassed: Object.values(correctness).every(Boolean),
      authorityWithinExistingClockBudget: endHealth.multiplayer.projection.accounting.costDistributions.simTickMs.p95
        <= (1000 / endHealth.session.tickHz)
        && endHealth.multiplayer.projection.accounting.costDistributions.projectionReplicationMs.p95
        <= (1000 / endHealth.session.snapshotHz),
      overloadStayedNormal: endHealth.session.overloadState === "NORMAL",
    };
    admission.passed = Object.values(admission).filter((value) => value !== null).every(Boolean);
    const breakdown = eventBreakdown(accounting.events, startAt, endAt);
    const pairGroup = Object.values(breakdown)
      .filter((row) => row.direction === "authority->client" && row.frameClass === "statePair" && row.metric === "accepted");
    const pairFrameBytes = selected.filter((event) => event.direction === "authority->client"
      && event.frameClass === "statePair" && event.metric === "accepted").map((event) => event.bytes);
    const pairStats = distribution(pairFrameBytes);
    const productKeyframes = pairGroup.filter((row) => row.projectionKind === "keyframe")
      .reduce((sum, row) => sum + row.frames, 0);
    const productDeltas = pairGroup.filter((row) => row.projectionKind === "delta")
      .reduce((sum, row) => sum + row.frames, 0);
    const result = {
      schemaVersion: 1, scenario, population, seed: SEED, profile: PROFILE,
      topology: { matches: 1, dedicatedLogicalAuthorities: 1, simultaneousRecipients: population,
        note: "One authoritative sim instance for one match; not a concurrent-match fleet-capacity result." },
      window: { startAt, endAt, durationSeconds: (endAt - startAt) / 1000,
        warmupSeconds: warmupMs / 1000, workload },
      accountingBoundary: {
        downstreamVerdict: "Exact UTF-8 JSON application bytes accepted by ws.send callback per recipient.",
        upstream: "Exact UTF-8 JSON application bytes accepted by the authority plus client serialized class ledger.",
        manifest: "Exact served canonical manifest bytes, reported separately from steady stream.",
        excluded: ["WebSocket framing", "TCP/IP", "TLS/WSS", "WAN", "compression", "hosted ingress/egress"],
      },
      exactTraffic: { perRecipientMeanDownlinkBytesPerSecond: perRecipientMean,
        worstRecipientMeanDownlinkBytesPerSecond: meanWorst, oneSecondP95DownlinkBytesPerSecond: p95OneSecond,
        acceptedBreakdown: breakdown, windows,
        explicitCounts: {
          recoveryRequestsSerialized: clientSummary.reduce((sum, client) =>
            sum + (client.uplinkSerialized.statePairRecovery?.frames || 0), 0),
          recoveryRequestSerializedBytes: clientSummary.reduce((sum, client) =>
            sum + (client.uplinkSerialized.statePairRecovery?.bytes || 0), 0),
          recoveryIngressAccountingClass: "control",
          retransmittedStatePairs: selected.filter((event) => event.direction === "authority->client"
            && event.frameClass === "statePair" && event.metric === "retransmitted").length,
          acceptedStatePairAcks: selected.filter((event) => event.direction === "client->authority"
            && event.frameClass === "ack" && event.metric === "accepted").length,
          reliableAccepted: selected.filter((event) => event.direction === "authority->client"
            && event.metric === "accepted" && event.reliableId !== null).length,
          reliableAckRetired: selected.filter((event) => event.direction === "authority->client"
            && event.metric === "ackRetired" && event.reliableId !== null).length,
        },
        manifestServedBytes: clientSummary.reduce((sum, client) => sum + client.manifest.servedBytes, 0),
        clientSerializedUplink: clientSummary.map((client) => ({ label: client.label, classes: client.uplinkSerialized })) },
      pairShape: { ...shape, observedMaterializedLifecycle: observedLifecycle,
        keyframeCauseAttribution: publisher.keyframeReasons,
        keyframeCauseAttributionScope: "scenario lifetime including warmup",
        ackBaseProof: { ackAccepted: publisher.ackAccepted, ackRejected: publisher.ackRejected,
          ackBaseAdvances: publisher.ackBaseAdvances,
          recipientsWithAckedBaseBeforeCleanup: livePublisher.recipientsWithAckedBase,
          maxAckedFrameIdBeforeCleanup: livePublisher.maxAckedFrameId,
          candidateAverageBytes: livePublisher.candidateAverageBytes,
          counterScope: "scenario lifetime including warmup; live base fields are pre-cleanup" },
        acceptedStatePairFrameBytes: pairGroup.map((row) => ({ kind: row.projectionKind,
        frames: row.frames, bytes: row.bytes, frameBytes: row.frameBytes })),
        productWindow: { keyframes: productKeyframes, deltas: productDeltas,
          keyframesPerAcceptedPair: productKeyframes / Math.max(1, productKeyframes + productDeltas),
          keyframesPerSecondPerRecipient: productKeyframes / population / ((endAt - startAt) / 1000) },
        comparison: { acceptedS0FullJson: S0[population], s1StaticManifestApproximatePairP50: S0[population].pairP50 - S1_STATIC_PAIR_SAVINGS_BYTES,
          observedPairBytes: pairStats,
          savingsVsS0PairP50: 1 - pairStats.p50 / S0[population].pairP50,
          savingsVsS1ApproxPairP50: 1 - pairStats.p50 / (S0[population].pairP50 - S1_STATIC_PAIR_SAVINGS_BYTES) } },
      cadence: { authorityTickHz: endHealth.session.tickHz, publicationHz: endHealth.session.snapshotHz,
        observedPairsPerSecond: pairFrameBytes.length / population / ((endAt - startAt) / 1000) },
      performance: { machineLocal: true,
        authority: { ...deltaHealth(startHealth, endHealth),
          percentileScope: "bounded runtime rolling ring; reset after warmup by evidence-only endpoint" },
        clientApplyMs: distribution(allClients.flatMap((client) => client.clientWorkSamples)
          .filter((sample) => sample.at >= startAt && sample.at < endAt).map((sample) => sample.ms)),
        clientAckSerializeSendMs: distribution(allClients.flatMap((client) => client.ackWorkSamples)
          .filter((sample) => sample.at >= startAt && sample.at < endAt).map((sample) => sample.ms)),
        eventLoopLag: { available: false, reason: "Runtime does not expose event-loop-delay telemetry; no threshold invented." },
        memory: memorySummary(memorySamples.filter((sample) => sample.at >= startAt && sample.at < endAt)),
        boundedState: { publisherAfterCleanup: publisher,
          maxPublisherPendingPairs: Math.max(...memorySamples.map((sample) => sample.publisher.pendingPairs)),
          maxPublisherRetainedBytes: Math.max(...memorySamples.map((sample) => sample.publisher.retainedBytes)),
          maxAdapterQueuedBytes: Math.max(...memorySamples.map((sample) => sample.adapter.queuedBytes)) } },
      faults: faultActions, clients: clientSummary, correctness, admission,
      diagnostics: { projectionErrors: endHealth.multiplayer.projection.errors - startHealth.multiplayer.projection.errors,
        skippedBeats: endHealth.multiplayer.projection.skippedBeats - startHealth.multiplayer.projection.skippedBeats,
        statePair: endHealth.multiplayer.statePair, manifestTransfers: preStopHealth.multiplayer.manifestTransfers },
      limitations: ["Local macOS loopback only", "raw WebSocket without TLS", "one match at a time",
        "no hosted fleet, WSS, WAN, packet retransmission, compression, AOI, binary codec, or 24-96-client claim"],
    };
    writeExclusive(path.join(runDir, `${scenario}-${population}.json`), result);
    return result;
  } finally {
    for (const client of clientsRef.current) await closeClient(client).catch(() => {});
    await stopSimServer(port).catch(() => {});
    const portDead = await new Promise((resolve) => {
      const socket = net.connect({ host: "127.0.0.1", port }, () => { socket.destroy(); resolve(false); });
      socket.once("error", () => resolve(true));
    });
    let pidDead = authorityPid === null;
    if (authorityPid !== null) try { process.kill(authorityPid, 0); } catch { pidDead = true; }
    writeExclusive(path.join(runDir, `cleanup-${scenario}-${population}.json`), {
      scenario, population, port, authorityPid, preStopConnections: preStopHealth?.multiplayer?.adapter?.connections ?? null,
      portDead, pidDead, passed: portDead && pidDead && preStopHealth?.multiplayer?.adapter?.connections === 0,
    });
  }
}

function validateArtifact(directory) {
  const checksum = validateChecksums(directory);
  const aggregate = JSON.parse(fs.readFileSync(path.join(directory, "aggregate.json"), "utf8"));
  const scenarioFiles = aggregate.scenarios.map((entry) => JSON.parse(fs.readFileSync(path.join(directory, entry.file), "utf8")));
  const invariants = {
    checksums: checksum.passed,
    allCleanupPassed: fs.readdirSync(directory).filter((name) => name.startsWith("cleanup-")).every((name) =>
      JSON.parse(fs.readFileSync(path.join(directory, name), "utf8")).passed === true),
    productCorrectnessPassed: scenarioFiles.every((entry) => entry.admission.correctnessPassed),
    allAccountingComplete: scenarioFiles.every((entry) => entry.correctness.accountingComplete),
    normalPopulationsPresent: [1, 4, 8].every((population) => scenarioFiles.some((entry) =>
      entry.scenario === "normal" && entry.population === population)) || aggregate.profile === "review",
    churnPopulationsPresent: [1, 4, 8].every((population) => scenarioFiles.some((entry) =>
      entry.scenario === "churn" && entry.population === population)) || aggregate.profile === "review",
  };
  const methodPassed = invariants.checksums && invariants.allCleanupPassed
    && invariants.allAccountingComplete && invariants.normalPopulationsPresent && invariants.churnPopulationsPresent;
  return { passed: methodPassed, invariants, checksum,
    aggregateVerdict: aggregate.verdict };
}

async function main() {
  const validationIndex = process.argv.indexOf("--validate-artifact");
  if (validationIndex >= 0) {
    const directory = path.resolve(process.argv[validationIndex + 1]);
    const result = validateArtifact(directory);
    console.log(JSON.stringify(result, null, 2));
    process.exit(result.passed ? 0 : 1);
  }
  const commit = git("rev-parse", "HEAD");
  const dirty = Boolean(git("status", "--porcelain"));
  if (dirty && process.env.LBH_S3_ALLOW_DIRTY !== "1") throw new Error("S3 product evidence requires clean HEAD");
  const stamp = new Date().toISOString().replace(/[:.]/g, "");
  const runDir = process.env.LBH_S3_OUTPUT_DIR
    ? path.resolve(process.env.LBH_S3_OUTPUT_DIR)
    : path.join(__dirname, "screenshots", `multiplayer-state-pair-s3-${stamp}-${commit.slice(0, 7)}`);
  fs.mkdirSync(runDir, { recursive: false });
  const command = `node tests/multiplayer-state-pair-product-gate.cjs${PROFILE === "review" ? " --review" : ""}`;
  writeExclusive(path.join(runDir, "run.json"), {
    schemaVersion: 1, generatedAt: new Date().toISOString(), command, profile: PROFILE, commit, dirty, seed: SEED,
    config: { populations: POPULATIONS, normalWarmupMs: NORMAL_WARMUP_MS, normalWindowMs: NORMAL_WINDOW_MS,
      churnWarmupMs: CHURN_WARMUP_MS, churnWindowMs: CHURN_WINDOW_MS, inputHz: INPUT_HZ,
      targetBytesPerSecondPerPlayer: TARGET_BPS, sensitivityBytesPerSecondPerPlayer: SENSITIVITY_BPS,
      env: { LBH_SIM_WS_JSON_V2: true, LBH_SIM_WS_STATE_PAIR_V1: true,
        LBH_SIM_WS_REPLICATION_ACCOUNTING: true, LBH_REPLICATION_BASELINE_CAPTURE: true } },
    machine: { hostname: os.hostname(), platform: os.platform(), release: os.release(), arch: os.arch(),
      cpu: os.cpus()[0]?.model || null, logicalCpuCount: os.cpus().length, totalMemoryBytes: os.totalmem(),
      node: process.version, v8: process.versions.v8 },
    claimBoundary: "Machine-local opt-in state-pair-v1 application traffic and CPU gate for one match authority at 1/4/8 recipients; not WAN/WSS/hosted/fleet/high-count evidence.",
  });
  const results = [];
  try {
    for (const population of POPULATIONS) results.push(await runScenario({ population, scenario: "normal", runDir }));
    for (const population of POPULATIONS) results.push(await runScenario({ population, scenario: "churn", runDir }));
  } catch (error) {
    writeExclusive(path.join(runDir, "failure.json"), { at: new Date().toISOString(), message: error.message,
      stack: String(error.stack || "").split("\n").slice(0, 20) });
    throw error;
  }
  const verdict = {
    passed: results.every((entry) => entry.admission.passed),
    normal: Object.fromEntries(results.filter((entry) => entry.scenario === "normal")
      .map((entry) => [entry.population, entry.admission])),
    churn: Object.fromEntries(results.filter((entry) => entry.scenario === "churn")
      .map((entry) => [entry.population, entry.admission])),
  };
  const normalResults = results.filter((entry) => entry.scenario === "normal");
  const failureAnalysis = normalResults.map((entry) => {
    const acceptedDownlink = Object.values(entry.exactTraffic.acceptedBreakdown)
      .filter((row) => row.direction === "authority->client" && row.metric === "accepted")
      .sort((left, right) => right.bytes - left.bytes);
    const total = acceptedDownlink.reduce((sum, row) => sum + row.bytes, 0);
    return {
      population: entry.population,
      requiredDownlinkReductionBytesPerSecond: Math.max(0,
        entry.exactTraffic.worstRecipientMeanDownlinkBytesPerSecond - TARGET_BPS),
      requiredDownlinkReductionFraction: Math.max(0,
        1 - TARGET_BPS / entry.exactTraffic.worstRecipientMeanDownlinkBytesPerSecond),
      dominantAcceptedDownlink: acceptedDownlink.slice(0, 5).map((row) => ({
        frameClass: row.frameClass, projectionKind: row.projectionKind, bytes: row.bytes,
        fraction: total > 0 ? row.bytes / total : 0,
      })),
    };
  });
  const aggregate = { schemaVersion: 1, profile: PROFILE, commit, seed: SEED, command, verdict,
    scenarios: results.map((entry) => ({ file: `${entry.scenario}-${entry.population}.json`,
      scenario: entry.scenario, population: entry.population,
      worstRecipientMeanDownlinkBytesPerSecond: entry.exactTraffic.worstRecipientMeanDownlinkBytesPerSecond,
      oneSecondP95DownlinkBytesPerSecond: entry.exactTraffic.oneSecondP95DownlinkBytesPerSecond,
      admission: entry.admission })),
    manifestIdentity: { hashes: results.map((entry) => entry.diagnostics.statePair.manifestHash),
      changedAcrossFreshMatches: new Set(results.map((entry) => entry.diagnostics.statePair.manifestHash)).size > 1,
      reconnectReuseObserved: results.filter((entry) => entry.scenario === "churn")
        .every((entry) => entry.faults.some((fault) => fault.name === "reconnect" && fault.manifestReused === true)) },
    failureAnalysis,
    recommendation: verdict.passed ? "Advance only to separately measured WAN/WSS and longer soak gates."
      : {
        nextSlice: "Test mixed public-delta/owner-keyframe lane kinds inside one atomically applied statePair before any broader codec or AOI work; the gate now attributes the dominant fallback and records both candidates.",
        quantifiedTarget: "The next slice must recover the per-population required reductions in failureAnalysis; do not substitute aggregate averages.",
        boundedPotentialReference: "The existing focused runtime loopback measured 31,993-byte keyframe versus 11,696-byte valid delta (63.4% smaller), but that is a non-representative upper-bound clue, not a product forecast.",
        second: "Reduce exhaustive runtimePublic component replacement only after candidate evidence identifies the repeated fields; preserve canonical projection completeness.",
        defer: "Binary, AOI, compression, hosted WSS, and fleet packing remain out of scope until structural JSON passes or a measured residual justifies them.",
      },
  };
  writeExclusive(path.join(runDir, "aggregate.json"), aggregate);
  const files = fs.readdirSync(runDir).filter((name) => name.endsWith(".json") && name !== "checksums.json");
  writeExclusive(path.join(runDir, "checksums.json"), aggregateChecksum(runDir, files));
  const validation = validateArtifact(runDir);
  console.log(`S3 state-pair artifact: ${runDir}`);
  console.log(`Aggregate SHA-256: ${validation.checksum.actualAggregateSha256}`);
  console.log(`Verdict: ${verdict.passed ? "PASS" : "FAIL"}; validation=${validation.passed ? "PASS" : "FAIL"}`);
  process.exit(validation.passed ? 0 : 1);
}

main().catch((error) => { console.error(error.stack || error.message); process.exit(1); });
