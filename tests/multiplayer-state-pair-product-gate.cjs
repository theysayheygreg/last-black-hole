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
const { createClientDeltaReceiver, MIXED_CAPABILITY,
  RUNTIME_PUBLIC_COMPONENTS_CAPABILITY, POSITIONAL_CODEC_CAPABILITY } = require("../scripts/client-delta-receiver.cjs");
const { projectionHash } = require("../scripts/canonical-structural-delta.cjs");
const { summarizeWindow } = require("../scripts/replication-accounting.cjs");
const { WIRE_PROTOCOL_VERSION_V2, SIM_PROTOCOL_VERSION, SERVER_TO_CLIENT,
  encodeWireFrame, parseWireFrame } = require("../scripts/multiplayer-wire-protocol.cjs");
const { codecContext: positionalCodecContext, POSITIONAL_CODEC_MANIFEST,
  POSITIONAL_CODEC_MANIFEST_HASH } =
  require("../scripts/state-pair-positional-codec.cjs");
const { canonicalJsonBytes } = require("../scripts/session-replication-manifest.cjs");
const { distribution, fixedWindowRates, eventBreakdown, aggregateChecksum,
  validateChecksums } = require("./network/state-pair-product-metrics.cjs");
const { analyzeStatePairSample } = require("./network/state-pair-residual-attribution.cjs");

const ROOT = path.resolve(__dirname, "..");
const SEED = 0x53A1B04E;
const INPUT_HZ = 10;
const TARGET_PUBLICATION_HZ = 10;
const MIN_HEALTHY_PUBLICATION_HZ = TARGET_PUBLICATION_HZ * 0.90;
const ATTRIBUTION_SAMPLE_FRAMES = 512;
const TARGET_BPS = 64 * 1024;
const SENSITIVITY_BPS = 80 * 1024;
const S0 = Object.freeze({
  1: { downlinkBps: 274607, pairP50: 28501, pairP95: 30578 },
  4: { downlinkBps: 255652, pairP50: 26817, pairP95: 28790 },
  8: { downlinkBps: 241892, pairP50: 25237, pairP95: 26889 },
});
const S1_STATIC_PAIR_SAVINGS_BYTES = 953;
const STAGE_PROFILE = process.argv.includes("--s5-profile");
const PROFILE_CONTROL = STAGE_PROFILE && process.argv.includes("--profile-control");
const MICRO_PROFILE = STAGE_PROFILE && process.argv.includes("--micro");
const S6_BENCHMARK = process.argv.includes("--s6-benchmark");
const S7_GATE = process.argv.includes("--s7");
const S8_PROTOTYPE = process.argv.includes("--s8-prototype");
const S9_PROTOTYPE = process.argv.includes("--s9-positional");
const S10_PROTOTYPE = process.argv.includes("--s10-ledger");
const POSITIONAL_GATE = S9_PROTOTYPE || S10_PROTOTYPE;
const SPARSE_GATE = S8_PROTOTYPE || POSITIONAL_GATE;
const RESIDUAL_GATE = S7_GATE || SPARSE_GATE;
const ADMISSION_MODE = process.argv.includes("--admission");
const S6_PREPARED = !["0", "false"].includes(String(process.env.LBH_S6_PREPARED ?? "true").toLowerCase());
const GATE = S10_PROTOTYPE ? "s10" : S9_PROTOTYPE ? "s9" : S8_PROTOTYPE ? "s8" : S7_GATE ? "s7" : S6_BENCHMARK ? "s6" : STAGE_PROFILE ? "s5" : process.argv.includes("--s4") ? "s4" : "s3";
const MIXED_GATE = GATE !== "s3";
const COMPARE_S3 = GATE === "s4";
const S3_CANONICAL_SHA256 = "55ff1666b4c8efdabb58bdc77a024a0df33edee2b5681558f62ac8e9fad7cf90";
const S3_CANONICAL_DIR = path.join(ROOT, "docs", "v0.4", "evidence", "state-pair-s3",
  "multiplayer-state-pair-s3-2026-07-13T062243917Z-805c5d4");
const S4_CANONICAL_SHA256 = "50f7e0f59bd6368ee7f8b1e84e30129eb948e422ee0d619bfea186a9386b3a92";
const S4_CANONICAL_DIR = path.join(ROOT, "docs", "v0.4", "evidence", "state-pair-s4",
  "multiplayer-state-pair-s4-2026-07-13T074927227Z-a052787");
const S6_ANALYSIS_PATH = path.join(ROOT, "docs", "v0.4", "evidence", "state-pair-s6", "analysis.json");
const S6_ANALYSIS_SHA256 = "32f97d424f929b37a6da624a578fd379261ad030d3965db34d5cd0452219b1c6";
const PROFILE = S6_BENCHMARK ? `diagnostic-${S6_PREPARED ? "prepared" : "legacy"}` : STAGE_PROFILE
  ? `diagnostic-${MICRO_PROFILE ? "micro-" : ""}${PROFILE_CONTROL ? "control" : "instrumented"}`
  : process.argv.includes("--review") ? "review" : "canonical";
const S6_POPULATIONS = String(process.env.LBH_S6_POPULATIONS || "1,4,8").split(",")
  .map((value) => Number(value)).filter((value) => [1, 4, 8].includes(value));
const POPULATIONS = SPARSE_GATE ? [1, 4, 8] : S6_BENCHMARK ? [...new Set(S6_POPULATIONS)]
  : MICRO_PROFILE || PROFILE === "review" ? [1, 8] : [1, 4, 8];
const CHURN_POPULATIONS = RESIDUAL_GATE ? [1, 8] : POPULATIONS;
const NORMAL_WARMUP_MS = S6_BENCHMARK ? 5_000 : MICRO_PROFILE ? 5_000 : STAGE_PROFILE ? 10_000 : PROFILE === "review" ? 5_000 : 60_000;
const NORMAL_WINDOW_MS = S6_BENCHMARK ? 15_000 : MICRO_PROFILE ? 15_000 : STAGE_PROFILE ? 30_000 : PROFILE === "review" ? 20_000 : 300_000;
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
  const wire = encodeWireFrame(frame, { ...(client.codecContext ? { positionalContext: client.codecContext } : {}) });
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
  const pairKind = `public-${frame.public.kind}+owner-${frame.owner.kind}`;
  client.pairKinds[pairKind] = (client.pairKinds[pairKind] || 0) + 1;
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
  const requestedCapabilities = ["static-manifest-v1", "state-pair-v1",
    ...(MIXED_GATE ? [MIXED_CAPABILITY] : []),
    ...(SPARSE_GATE ? [RUNTIME_PUBLIC_COMPONENTS_CAPABILITY] : []),
    ...(POSITIONAL_GATE ? [POSITIONAL_CODEC_CAPABILITY] : [])];
  const issued = await request(port, "/multiplayer/ticket", { method: "POST", authority, body: {
    kind: "admission", supportedVersions: [WIRE_PROTOCOL_VERSION_V2],
    capabilities: requestedCapabilities,
  } });
  if (issued.status !== 200 || !issued.body.capabilities.includes("state-pair-v1")
      || (MIXED_GATE && !issued.body.capabilities.includes(MIXED_CAPABILITY))
      || (SPARSE_GATE && !issued.body.capabilities.includes(RUNTIME_PUBLIC_COMPONENTS_CAPABILITY))
      || (POSITIONAL_GATE && !issued.body.capabilities.includes(POSITIONAL_CODEC_CAPABILITY))) {
    throw new Error(`${label} state-pair ticket failed: ${JSON.stringify(issued.body)}`);
  }
  const client = {
    label, authority, ticket: issued.body, fault, ws: new WebSocket(`ws://127.0.0.1:${port}/stream`,
      { perMessageDeflate: false }),
    welcome: null, receiver: null, codecContext: null, error: null, close: null, pairCount: 0,
    acceptedPairs: 0, validatedPairs: 0, staleOrDuplicatePairs: 0,
    receiverFinalDiagnostics: null, receiverCleanupDiagnostics: null, lastVisibleFrameId: 0,
    lastPairAt: null, lastStatePairAckSentFrameId: 0,
    inputSeq: 0, actionSeq: 0, commandSeq: 0, uplink: {}, downlink: {},
    manifest: { reused: reuseManifest, servedBytes: 0, hash: issued.body.manifestHash,
      codecManifestHash: POSITIONAL_GATE ? POSITIONAL_CODEC_MANIFEST_HASH : null,
      codecVerified: POSITIONAL_GATE ? reuseManifest : null,
      codecVerificationSource: POSITIONAL_GATE && reuseManifest ? "local-static-manifest-cache" : null },
    wireDecodeSamples: [], clientWorkSamples: [], ackWorkSamples: [], faultLog: [], hashesVerified: 0,
    legacyReconstructionVerified: 0, acceptedPairTimes: [],
    shape: { keyframes: 0, deltas: 0, creates: 0, updates: 0, despawns: 0, reincarnations: 0, rootOps: 0 },
    pairKinds: {},
    attributionCapture: { active: false, startAt: null, maxFrames: ATTRIBUTION_SAMPLE_FRAMES, rawFrames: [] },
    materializedEntities: null, retiredIncarnations: new Map(),
    observedLifecycle: { creates: 0, despawns: 0, reincarnations: 0, componentChanges: 0 },
  };
  client.ws.on("error", (error) => { client.error = error.message; });
  client.ws.on("close", (code, reason) => { client.close = { code, reason: reason.toString("utf8"), at: Date.now() }; });
  client.ws.on("message", (raw) => {
    const text = raw.toString("utf8");
    const positionalWire = text.startsWith("[");
    const decodeStarted = positionalWire ? performance.now() : 0;
    const frame = text.startsWith("[")
      ? parseWireFrame(text, { direction: SERVER_TO_CLIENT, positionalContext: client.codecContext,
          requirePositional: true })
      : parseWireFrame(text, { direction: SERVER_TO_CLIENT });
    if (positionalWire) client.wireDecodeSamples.push({ at: Date.now(), ms: performance.now() - decodeStarted });
    const key = frame.type === "ack" ? `ack:${frame.ackKind}` : frame.type;
    const row = client.downlink[key] ||= { frames: 0, bytes: 0 };
    row.frames += 1;
    row.bytes += Buffer.byteLength(text, "utf8");
    if (frame.type === "welcome") {
      client.welcome = frame;
      client.inputSeq = frame.lastInputSeq;
      client.actionSeq = frame.lastActionSeq;
      client.commandSeq = frame.lastCommandSeq;
      if (POSITIONAL_GATE) client.codecContext = positionalCodecContext({
        matchId: frame.runId, sessionId: frame.connectionId,
        authorityIncarnation: frame.authorityIncarnation, recipientId: frame.membershipId,
        recipientIncarnation: frame.connectionEpoch, manifestHash: frame.manifestHash,
        codecManifestHash: POSITIONAL_CODEC_MANIFEST_HASH,
      });
      client.receiver = createClientDeltaReceiver({ context: {
        matchId: frame.runId, sessionId: frame.connectionId,
        authorityIncarnation: frame.authorityIncarnation, recipientId: frame.membershipId,
        recipientIncarnation: frame.connectionEpoch, manifestSchema: frame.manifestSchema,
        manifestHash: frame.manifestHash,
      }, capabilities: issued.body.capabilities });
      return;
    }
    if (frame.type === "error") {
      client.error = `${frame.code}:${frame.message}`;
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
      client.faultLog.push({ type: outcome.recovery ? "recovery" : "rejection",
        reason: outcome.reason, afterFrameId: frame.frameId, at: Date.now() });
      if (outcome.recovery) send(client, outcome.recovery);
      return;
    }
    client.validatedPairs += 1;
    if (projectionHash(outcome.state.public) !== outcome.ack.publicHash
      || projectionHash(outcome.state.owner) !== outcome.ack.ownerHash
      || (outcome.published !== false
        && (frame.public.resultHash !== outcome.ack.publicHash || frame.owner.resultHash !== outcome.ack.ownerHash))) {
      client.error = "materialized authority/client projection hash mismatch";
      client.ws.terminate();
      return;
    }
    if (outcome.published === false) {
      client.staleOrDuplicatePairs += 1;
      const ackStarted = performance.now();
      if (send(client, outcome.ack)) client.lastStatePairAckSentFrameId = outcome.ack.frameId;
      client.ackWorkSamples.push({ at: Date.now(), ms: performance.now() - ackStarted });
      return;
    }
    client.acceptedPairs += 1;
    client.acceptedPairTimes.push(Date.now());
    client.lastVisibleFrameId = outcome.state.frameId;
    if (outcome.state.matchId !== client.welcome.runId
      || outcome.state.recipientId !== client.welcome.membershipId
      || outcome.state.owner.entities.some((entity) => entity.sourceId !== client.welcome.membershipId)) {
      client.error = "cross-match or cross-recipient projection leakage";
      client.ws.terminate();
      return;
    }
    if (SPARSE_GATE) {
      const legacy = outcome.state.legacyPublicState;
      const rows = outcome.state.legacyPublicEntities;
      const laneRows = (category) => rows.filter((row) => row.category === category)
        .sort((a, b) => a.index - b.index).map((row) => row.value);
      const exactShape = legacy && Array.isArray(rows)
        && JSON.stringify(legacy.players) === JSON.stringify(laneRows("player"))
        && JSON.stringify(legacy.world?.wells) === JSON.stringify(laneRows("well"))
        && JSON.stringify(legacy.world?.stars) === JSON.stringify(laneRows("star"))
        && JSON.stringify(legacy.world?.wrecks) === JSON.stringify(laneRows("wreck"))
        && JSON.stringify(legacy.world?.planetoids) === JSON.stringify(laneRows("planetoid"))
        && JSON.stringify(legacy.world?.portals) === JSON.stringify(laneRows("portal"))
        && JSON.stringify(legacy.world?.scavengers) === JSON.stringify(laneRows("scavenger"))
        && JSON.stringify(legacy.world?.fauna) === JSON.stringify(laneRows("fauna"))
        && JSON.stringify(legacy.world?.sentries) === JSON.stringify(laneRows("sentry"))
        && JSON.stringify(legacy.inhibitor) === JSON.stringify(laneRows("inhibitor")[0]);
      if (!exactShape) {
        client.error = "split components did not reconstruct the exact legacy public-state shape";
        client.ws.terminate();
        return;
      }
      client.legacyReconstructionVerified += 1;
    }
    client.hashesVerified += 1;
    if (outcome.published !== false) observeMaterializedLifecycle(client, outcome.state.public);
    if (client.attributionCapture.active && Date.now() >= client.attributionCapture.startAt
        && client.attributionCapture.rawFrames.length < client.attributionCapture.maxFrames) {
      if (encodeWireFrame(frame, { direction: SERVER_TO_CLIENT,
          ...(client.codecContext ? { positionalContext: client.codecContext } : {}) }) !== text) {
        client.error = "captured state-pair bytes differ from canonical wire encoding";
        client.ws.terminate();
        return;
      }
      client.attributionCapture.rawFrames.push(text);
    }
    if (fault.withholdAckPairNumber === client.pairCount) {
      client.faultLog.push({ type: "ack-loss", frameId: frame.frameId, at: Date.now() });
      return;
    }
    const ackStarted = performance.now();
    if (send(client, outcome.ack)) client.lastStatePairAckSentFrameId = outcome.ack.frameId;
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
    if (POSITIONAL_GATE) {
      const sessionManifest = JSON.parse(fetched.bytes.toString("utf8"));
      const codec = sessionManifest.publicContent?.statePairCodec;
      const codecHash = codec?.manifest
        ? `sha256:${crypto.createHash("sha256").update(canonicalJsonBytes(codec.manifest)).digest("hex")}` : null;
      if (codec?.capability !== POSITIONAL_CODEC_CAPABILITY
          || codec?.codecManifestHash !== POSITIONAL_CODEC_MANIFEST_HASH
          || codecHash !== POSITIONAL_CODEC_MANIFEST_HASH
          || !canonicalJsonBytes(codec.manifest).equals(canonicalJsonBytes(POSITIONAL_CODEC_MANIFEST))) {
        throw new Error(`${label} positional codec manifest binding failed`);
      }
      client.manifest.codecVerified = true;
      client.manifest.codecVerificationSource = "fetched-content-addressed-session-manifest";
    }
    client.manifest.servedBytes = fetched.bytes.length;
  }
  send(client, { type: "manifestAck", manifestSchema: issued.body.manifestSchema,
    manifestHash: issued.body.manifestHash, manifestBytes: issued.body.manifestBytes,
    connectionEpoch: client.welcome.connectionEpoch });
  await waitFor(() => client.acceptedPairs > 0 || client.error || client.close, `${label} first state pair`).catch(async (error) => {
    const health = await request(port, "/health/compact").catch(() => null);
    throw new Error(`${error.message}; uplink=${JSON.stringify(client.uplink)}; health=${JSON.stringify(health?.body?.multiplayer?.statePair)}; projection=${JSON.stringify(health?.body?.multiplayer?.projection)}; adapter=${JSON.stringify({ manifestRequiredConnections: health?.body?.multiplayer?.adapter?.manifestRequiredConnections, statePair: health?.body?.multiplayer?.adapter?.statePair })}`);
  });
  if (client.error || client.close) throw new Error(`${label} admission failed: ${client.error || JSON.stringify(client.close)}`);
  return client;
}

async function closeClient(client) {
  if (!client) return;
  if (client.ws.readyState !== WebSocket.CLOSED) {
    client.ws._socket?.resume();
    client.ws.close(1000, "gate complete");
    await waitFor(() => client.close, `${client.label} close`, 1500).catch(() => client.ws.terminate());
  }
  if (!client.receiverCleanupDiagnostics) {
    client.receiverFinalDiagnostics = client.receiver?.diagnostics() || null;
    client.lastVisibleFrameId = client.receiver?.current()?.frameId || client.lastVisibleFrameId;
    client.receiver?.teardown();
    client.receiverCleanupDiagnostics = client.receiver?.diagnostics() || null;
  }
}

function summarizeClients(clients) {
  return clients.map((client) => ({
    label: client.label, membershipId: client.welcome.membershipId, connectionEpoch: client.welcome.connectionEpoch,
    capabilities: client.ticket.capabilities,
    acceptedPairs: client.acceptedPairs, validatedPairs: client.validatedPairs,
    staleOrDuplicatePairs: client.staleOrDuplicatePairs, hashesVerified: client.hashesVerified,
    legacyReconstructionVerified: client.legacyReconstructionVerified,
    lastAcceptedFrameId: client.lastVisibleFrameId,
    lastStatePairAckSentFrameId: client.lastStatePairAckSentFrameId,
    manifest: client.manifest, uplinkSerialized: client.uplink, downlinkObserved: client.downlink,
    wireDecodeMs: distribution(client.wireDecodeSamples.map((sample) => sample.ms)),
    clientApplyMs: distribution(client.clientWorkSamples.map((sample) => sample.ms)),
    ackSerializeSendMs: distribution(client.ackWorkSamples.map((sample) => sample.ms)),
    shape: client.shape, faults: client.faultLog, error: client.error, close: client.close,
    pairKinds: client.pairKinds,
    observedLifecycle: client.observedLifecycle,
    receiverDiagnostics: client.receiverFinalDiagnostics,
    receiverCleanupDiagnostics: client.receiverCleanupDiagnostics,
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

function numericComparison(s4, s3) {
  if (!Number.isFinite(s4) || !Number.isFinite(s3)) return { s3, s4, delta: null, changeFraction: null };
  return { s3, s4, delta: s4 - s3, changeFraction: s3 === 0 ? null : (s4 - s3) / s3 };
}

function namedNumericComparison(current, baseline, currentLabel, baselineLabel) {
  const compared = numericComparison(current, baseline);
  return { [baselineLabel]: baseline, [currentLabel]: current,
    delta: compared.delta, changeFraction: compared.changeFraction };
}

function compareScenarioToS3(result) {
  const s3 = JSON.parse(fs.readFileSync(path.join(S3_CANONICAL_DIR,
    `${result.scenario}-${result.population}.json`), "utf8"));
  const compareDistribution = (s4Distribution, s3Distribution) => Object.fromEntries(
    ["p50", "p95", "p99", "max"].map((key) =>
      [key, numericComparison(s4Distribution[key], s3Distribution[key])]),
  );
  return {
    artifact: path.relative(ROOT, S3_CANONICAL_DIR),
    compositeSha256: S3_CANONICAL_SHA256,
    exactTraffic: {
      worstRecipientMeanDownlinkBytesPerSecond: numericComparison(
        result.exactTraffic.worstRecipientMeanDownlinkBytesPerSecond,
        s3.exactTraffic.worstRecipientMeanDownlinkBytesPerSecond),
      oneSecondP95DownlinkBytesPerSecond: numericComparison(
        result.exactTraffic.oneSecondP95DownlinkBytesPerSecond,
        s3.exactTraffic.oneSecondP95DownlinkBytesPerSecond),
      oneSecondP99DownlinkBytesPerSecond: numericComparison(
        result.exactTraffic.oneSecondP99DownlinkBytesPerSecond,
        s3.exactTraffic.windows["1s"].allRecipientWindowsBytesPerSecond.p99),
    },
    pairCadencePerRecipient: numericComparison(result.cadence.authorityAcceptedPairsPerSecond,
      s3.cadence.observedPairsPerSecond),
    pairKinds: {
      s3: s3.pairShape.productWindow.pairKindCounts || {
        "public-keyframe+owner-keyframe": s3.pairShape.productWindow.keyframes,
        "public-delta+owner-delta": s3.pairShape.productWindow.deltas,
      },
      s4: result.pairShape.productWindow.pairKindCounts,
    },
    pairBytes: compareDistribution(result.pairShape.comparison.observedPairBytes,
      s3.pairShape.comparison.observedPairBytes),
    authority: {
      simTickMs: compareDistribution(result.performance.authority.simTickMs,
        s3.performance.authority.simTickMs),
      projectionAndPublishMs: compareDistribution(result.performance.authority.projectionAndPublishMs,
        s3.performance.authority.projectionAndPublishMs),
    },
    client: {
      applyMs: compareDistribution(result.performance.clientApplyMs, s3.performance.clientApplyMs),
      ackSerializeSendMs: compareDistribution(result.performance.clientAckSerializeSendMs,
        s3.performance.clientAckSerializeSendMs),
    },
    memorySlopeBytesPerSecond: {
      rss: numericComparison(result.performance.memory.slopeBytesPerSecond.rss,
        s3.performance.memory.slopeBytesPerSecond.rss),
      heapUsed: numericComparison(result.performance.memory.slopeBytesPerSecond.heapUsed,
        s3.performance.memory.slopeBytesPerSecond.heapUsed),
    },
    overloadState: { s3: s3.admission.overloadStayedNormal, s4: result.admission.overloadStayedNormal },
    correctness: { s3: s3.admission.correctnessPassed, s4: result.admission.correctnessPassed },
  };
}

function compareScenarioToS4(result) {
  const s4 = JSON.parse(fs.readFileSync(path.join(S4_CANONICAL_DIR,
    `${result.scenario}-${result.population}.json`), "utf8"));
  const compareNumber = (s7, s4) => namedNumericComparison(s7, s4, "s7", "s4");
  const compareDistribution = (s7Distribution, s4Distribution) => Object.fromEntries(
    ["p50", "p95", "p99", "max"].map((key) =>
      [key, compareNumber(s7Distribution[key], s4Distribution[key])]),
  );
  return {
    artifact: path.relative(ROOT, S4_CANONICAL_DIR),
    compositeSha256: S4_CANONICAL_SHA256,
    exactTraffic: {
      worstRecipientMeanDownlinkBytesPerSecond: compareNumber(
        result.exactTraffic.worstRecipientMeanDownlinkBytesPerSecond,
        s4.exactTraffic.worstRecipientMeanDownlinkBytesPerSecond),
      oneSecondP95DownlinkBytesPerSecond: compareNumber(
        result.exactTraffic.oneSecondP95DownlinkBytesPerSecond,
        s4.exactTraffic.oneSecondP95DownlinkBytesPerSecond),
      oneSecondP99DownlinkBytesPerSecond: compareNumber(
        result.exactTraffic.oneSecondP99DownlinkBytesPerSecond,
        s4.exactTraffic.oneSecondP99DownlinkBytesPerSecond),
    },
    pairCadencePerRecipient: compareNumber(result.cadence.authorityAcceptedPairsPerSecond,
      s4.cadence.observedPairsPerSecond),
    pairKinds: { s4: s4.pairShape.productWindow.pairKindCounts,
      s7: result.pairShape.productWindow.pairKindCounts },
    pairBytes: compareDistribution(result.pairShape.comparison.observedPairBytes,
      s4.pairShape.comparison.observedPairBytes),
    authority: {
      simTickMs: compareDistribution(result.performance.authority.simTickMs,
        s4.performance.authority.simTickMs),
      projectionAndPublishMs: compareDistribution(result.performance.authority.projectionAndPublishMs,
        s4.performance.authority.projectionAndPublishMs),
    },
    client: { applyMs: compareDistribution(result.performance.clientApplyMs, s4.performance.clientApplyMs) },
    memorySlopeBytesPerSecond: {
      rss: compareNumber(result.performance.memory.slopeBytesPerSecond.rss,
        s4.performance.memory.slopeBytesPerSecond.rss),
      heapUsed: compareNumber(result.performance.memory.slopeBytesPerSecond.heapUsed,
        s4.performance.memory.slopeBytesPerSecond.heapUsed),
    },
    correctness: { s4: s4.admission.correctnessPassed, s7: result.admission.correctnessPassed },
  };
}

function compareScenarioToS6(result) {
  if (result.scenario !== "normal") return null;
  const analysis = JSON.parse(fs.readFileSync(S6_ANALYSIS_PATH, "utf8"));
  const prepared = analysis.summary?.[String(result.population)]?.prepared;
  if (!prepared) throw new Error(`S6 prepared diagnostic is missing population ${result.population}`);
  const projectionMean = result.performance.authority.projectionSamples > 0
    ? result.performance.authority.projectionTotalMs / result.performance.authority.projectionSamples : null;
  const compareNumber = (s7, s6) => namedNumericComparison(s7, s6, "s7", "s6PreparedDiagnostic");
  return {
    artifact: path.relative(ROOT, S6_ANALYSIS_PATH),
    analysisSha256: S6_ANALYSIS_SHA256,
    method: "S6 alternating short paired diagnostic aggregate; not a five-minute canonical product run.",
    exactTraffic: {
      worstRecipientMeanDownlinkBytesPerSecond: compareNumber(
        result.exactTraffic.worstRecipientMeanDownlinkBytesPerSecond, prepared.downlinkMeanBps),
      oneSecondP95DownlinkBytesPerSecond: compareNumber(
        result.exactTraffic.oneSecondP95DownlinkBytesPerSecond, prepared.downlinkOneSecondP95Bps),
    },
    pairCadencePerRecipient: compareNumber(result.cadence.authorityAcceptedPairsPerSecond, prepared.publicationHz),
    authority: {
      projectionMeanMs: compareNumber(projectionMean, prepared.projectionMeanMs),
      projectionP95Ms: compareNumber(result.performance.authority.projectionAndPublishMs.p95,
        prepared.projectionP95Ms),
      projectionP99Ms: compareNumber(result.performance.authority.projectionAndPublishMs.p99,
        prepared.projectionP99Ms),
      simTickP95Ms: compareNumber(result.performance.authority.simTickMs.p95, prepared.simTickP95Ms),
    },
    eventLoopP95Ms: compareNumber(result.performance.eventLoopLag?.p95Ms ?? null, prepared.eventLoopP95Ms),
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

function modeledTransport(payloadBytes) {
  const webSocketBytes = payloadBytes < 126 ? 2 : payloadBytes <= 0xffff ? 4 : 10;
  const tlsRecords = Math.max(1, Math.ceil((payloadBytes + webSocketBytes) / 16_384));
  const tls13Bytes = tlsRecords * 22;
  const ipv4TcpSegments = Math.max(1, Math.ceil((payloadBytes + webSocketBytes + tls13Bytes) / 1460));
  const ipv4TcpBytes = ipv4TcpSegments * 40;
  return { applicationBytes: payloadBytes, webSocketBytes, tls13Bytes, ipv4TcpBytes,
    modeledTotalBytes: payloadBytes + webSocketBytes + tls13Bytes + ipv4TcpBytes };
}

function addTransport(target, source, scale = 1) {
  for (const key of Object.keys(target)) target[key] += source[key] * scale;
}

function normalizeTrafficAtTargetCadence(events, { startAt, endAt, recipients }) {
  const seconds = (endAt - startAt) / 1000;
  const bucketCount = Math.ceil(seconds);
  const perRecipient = {};
  const normalizedBuckets = [];
  for (const recipient of recipients) {
    const accepted = events.filter((event) => event.timestamp >= startAt && event.timestamp < endAt
      && event.recipient === recipient && event.direction === "authority->client" && event.metric === "accepted");
    const pairs = accepted.filter((event) => event.frameClass === "statePair");
    const nonPairs = accepted.filter((event) => event.frameClass !== "statePair");
    const observedPairsPerSecond = pairs.length / seconds;
    if (!(observedPairsPerSecond > 0)) throw new Error(`target-cadence model has no accepted pairs for ${recipient}`);
    const pairScale = TARGET_PUBLICATION_HZ / observedPairsPerSecond;
    const actualTransport = { applicationBytes: 0, webSocketBytes: 0, tls13Bytes: 0,
      ipv4TcpBytes: 0, modeledTotalBytes: 0 };
    const normalizedTransport = { applicationBytes: 0, webSocketBytes: 0, tls13Bytes: 0,
      ipv4TcpBytes: 0, modeledTotalBytes: 0 };
    const buckets = Array.from({ length: bucketCount }, () => ({ pairBytes: 0, nonPairBytes: 0 }));
    for (const event of accepted) {
      const transport = modeledTransport(event.bytes);
      addTransport(actualTransport, transport);
      addTransport(normalizedTransport, transport, event.frameClass === "statePair" ? pairScale : 1);
      const index = Math.min(bucketCount - 1, Math.floor((event.timestamp - startAt) / 1000));
      if (event.frameClass === "statePair") buckets[index].pairBytes += event.bytes;
      else buckets[index].nonPairBytes += event.bytes;
    }
    const pairBytes = pairs.reduce((sum, event) => sum + event.bytes, 0);
    const nonPairBytes = nonPairs.reduce((sum, event) => sum + event.bytes, 0);
    const actualApplicationBytesPerSecond = (pairBytes + nonPairBytes) / seconds;
    const targetCadenceApplicationBytesPerSecond = (pairBytes * pairScale + nonPairBytes) / seconds;
    const recipientBuckets = buckets.map((bucket) => bucket.pairBytes * pairScale + bucket.nonPairBytes);
    normalizedBuckets.push(...recipientBuckets);
    perRecipient[recipient] = {
      observedPairsPerSecond,
      targetPairsPerSecond: TARGET_PUBLICATION_HZ,
      pairScale,
      observedMeanPairBytes: pairBytes / pairs.length,
      observedNonPairBytesPerSecond: nonPairBytes / seconds,
      actualApplicationBytesPerSecond,
      targetCadenceApplicationBytesPerSecond,
      targetCadenceRequiredReductionBytesPerSecond: Math.max(0,
        targetCadenceApplicationBytesPerSecond - TARGET_BPS),
      actualModeledTransportBytesPerSecond: Object.fromEntries(Object.entries(actualTransport)
        .map(([key, value]) => [key, value / seconds])),
      targetCadenceModeledTransportBytesPerSecond: Object.fromEntries(Object.entries(normalizedTransport)
        .map(([key, value]) => [key, value / seconds])),
    };
  }
  const normalizedMeans = Object.values(perRecipient).map((row) => row.targetCadenceApplicationBytesPerSecond);
  const normalizedWindowDistribution = distribution(normalizedBuckets);
  return {
    method: "Hold each recipient's observed accepted pair-size mix constant; scale state-pair bytes from observed cadence to configured 10 Hz; leave observed non-state bytes unchanged.",
    admissionUse: "Counterfactual guard only. A true admission also requires observed cadence >=90% of configured cadence and NORMAL overload.",
    configuredPublicationHz: TARGET_PUBLICATION_HZ,
    minimumHealthyObservedPublicationHz: MIN_HEALTHY_PUBLICATION_HZ,
    perRecipient,
    worstRecipientMeanDownlinkBytesPerSecond: Math.max(...normalizedMeans),
    oneSecondP95DownlinkBytesPerSecond: normalizedWindowDistribution.p95,
    oneSecondP99DownlinkBytesPerSecond: normalizedWindowDistribution.p99,
    modeledTransportBoundary: {
      application: "Measured compact JSON application payload.",
      webSocket: "Modeled unmasked server frame header: 2, 4, or 10 bytes by payload length.",
      tls13: "Modeled 22 bytes per TLS 1.3 record with a 16,384-byte plaintext cap and one WebSocket frame per record sequence.",
      ipv4Tcp: "Modeled 40-byte IPv4+TCP headers per 1,460-byte TCP payload segment; excludes options, ACK-only packets, loss, and retransmit.",
      notAdmissionEvidence: true,
    },
  };
}

function buildResidualDecisionTable(normalResults) {
  return normalResults.map((entry) => {
    const normalizationRows = Object.values(entry.targetCadenceNormalization.perRecipient);
    const worst = normalizationRows.sort((left, right) =>
      right.targetCadenceApplicationBytesPerSecond - left.targetCadenceApplicationBytesPerSecond)[0];
    const attribution = entry.residualAttribution;
    const sampledPairs = attribution.sample.capturedAcceptedFrames;
    const publicDeltaPerPair = sampledPairs ? attribution.publicDelta.bytes / sampledPairs : 0;
    const ownerKeyframePerPair = sampledPairs ? attribution.ownerKeyframe.bytes / sampledPairs : 0;
    const outerEnvelopePerPair = sampledPairs
      ? attribution.exactLaneReconciliation.outerEnvelopeBytes / sampledPairs : 0;
    const token = attribution.publicDelta.tokenComposition;
    const compactableJsonProxyPerPair = sampledPairs
      ? (token.identifierAndKeyBytes + token.stringPayloadBytes + token.delimiterBytes) / sampledPairs : 0;
    const entityOperationBytes = attribution.publicDelta.operationClasses
      .filter((row) => ["creates", "updates", "despawns"].includes(row.operationClass))
      .reduce((sum, row) => sum + row.bytes, 0);
    const entityOperationProxyPerPair = sampledPairs ? entityOperationBytes / sampledPairs : 0;
    const topComponents = attribution.publicDelta.components
      .filter((row) => !String(row.component).startsWith("<"))
      .slice(0, 5).map((row) => ({ component: row.component, operationClass: row.operationClass,
        bytesPerSampledPair: row.bytesPerSampledPair,
        updateFrequencyPerPair: row.occurrencesPerSampledPair }));
    const topEntityCategories = attribution.publicDelta.entityTypes
      .filter((row) => !String(row.entityType).startsWith("<"))
      .slice(0, 8).map((row) => ({ entityType: row.entityType,
        operationClass: row.operationClass, bytesPerSampledPair: row.bytesPerSampledPair,
        pairFrequency: row.pairFrequency }));
    const targetMeanPairBudgetBytesAt10Hz = Math.max(0,
      (TARGET_BPS - worst.observedNonPairBytesPerSecond) / TARGET_PUBLICATION_HZ);
    const requiredMeanPairReductionBytes = Math.max(0,
      worst.observedMeanPairBytes - targetMeanPairBudgetBytesAt10Hz);
    const maximumCadenceAt64KiB = Math.max(0,
      (TARGET_BPS - worst.observedNonPairBytesPerSecond) / worst.observedMeanPairBytes);
    return {
      population: entry.population,
      actualAuthorityAcceptedPairsPerSecond: entry.cadence.authorityAcceptedPairsPerSecond,
      targetCadenceRequiredReductionBytesPerSecond: worst.targetCadenceRequiredReductionBytesPerSecond,
      exactMeanPairEnvelopeAt10Hz: {
        applicationBudgetBytesPerSecond: TARGET_BPS,
        observedNonPairBytesPerSecond: worst.observedNonPairBytesPerSecond,
        availableStatePairBytesPerSecond: Math.max(0, TARGET_BPS - worst.observedNonPairBytesPerSecond),
        maximumMeanPairBytes: targetMeanPairBudgetBytesAt10Hz,
        observedMeanPairBytes: worst.observedMeanPairBytes,
        requiredMeanPairReductionBytes,
        requiredMeanPairReductionFraction: worst.observedMeanPairBytes
          ? requiredMeanPairReductionBytes / worst.observedMeanPairBytes : null,
      },
      measuredResidualPerSampledPair: { publicDeltaBytes: publicDeltaPerPair,
        ownerKeyframeBytes: ownerKeyframePerPair, outerEnvelopeBytes: outerEnvelopePerPair },
      topPublicComponents: topComponents,
      topEntityCategories,
      publicUpdateLexicalComposition: attribution.publicDelta.updateLexicalComposition,
      choices: [
        {
          choice: "cadence-cap",
          measuredUpside: `A cap near ${maximumCadenceAt64KiB.toFixed(2)} Hz would reach the 64 KiB/s mean only if observed pair size stayed constant.`,
          latencyAndComplexityRisk: "High product-latency risk; conflicts with the configured 10 Hz contract and can enlarge deltas.",
          evidencePriority: 4,
        },
        {
          choice: "schema-cleanup-field-cadence",
          measuredUpside: `Public delta is ${publicDeltaPerPair.toFixed(1)} B/sample pair at a 10 Hz ceiling of ${(publicDeltaPerPair * 10).toFixed(1)} B/s; target the listed high-frequency components first.`,
          latencyAndComplexityRisk: "Low-to-medium if fields remain authoritative and cadence classes are explicit; stale-field semantics need proof.",
          evidencePriority: 1,
        },
        {
          choice: "compact-binary-codec",
          measuredUpside: `Identifiers, string tokens, and JSON delimiters provide a ${(compactableJsonProxyPerPair * 10).toFixed(1)} B/s structural ceiling at 10 Hz, not a predicted saving.`,
          latencyAndComplexityRisk: "Medium-to-high protocol/versioning/debuggability cost; requires exact equivalence and fallback proof.",
          evidencePriority: 2,
        },
        {
          choice: "aoi",
          measuredUpside: `Entity operation arrays provide a ${(entityOperationProxyPerPair * 10).toFixed(1)} B/s upper-bound proxy at 10 Hz.`,
          representativeWorkloadVerdict: "Not justified as the first slice: dominant Shallows categories recur on nearly every sampled pair, and this gate contains no distance/visibility evidence proving safe exclusion.",
          latencyAndComplexityRisk: "High visibility, lifecycle, and interest-churn risk; Shallows evidence may understate larger-map upside.",
          evidencePriority: 3,
        },
      ],
      supportedFirst: "schema-cleanup-field-cadence",
      caveat: "Upsides are measured byte ceilings or hold-size counterfactuals, not implementation forecasts; prototype the first choice before promotion.",
    };
  });
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
      LBH_SIM_WS_STATE_PAIR_MIXED_V1: MIXED_GATE ? "true" : "false",
      LBH_SIM_WS_RUNTIME_PUBLIC_COMPONENTS_V1: SPARSE_GATE ? "true" : "false",
      LBH_SIM_WS_POSITIONAL_JSON_V1: POSITIONAL_GATE ? "true" : "false",
      LBH_SIM_WS_ACK_REJECT_DIAGNOSTICS: RESIDUAL_GATE ? "true" : "false",
      LBH_SIM_WS_PREPARED_PROJECTIONS: S6_BENCHMARK && !S6_PREPARED ? "false" : "true",
      LBH_SIM_WS_BENCH_EVENT_LOOP: S6_BENCHMARK || RESIDUAL_GATE ? "1" : "0",
      LBH_REPLICATION_BASELINE_CAPTURE: "1", LBH_SIM_MAX_SIM_TIME: "7200",
      LBH_SIM_WS_STAGE_PROFILE: STAGE_PROFILE && !PROFILE_CONTROL ? "1" : "0",
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
    if (RESIDUAL_GATE && !churn) {
      clientsRef.current[0].attributionCapture.startAt = startAt;
      clientsRef.current[0].attributionCapture.active = true;
    }
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
          return health.body.idleState?.activeHumanPlayerCount === population - 1;
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
    let residualAttribution = null;
    if (RESIDUAL_GATE && !churn) {
      const capture = clientsRef.current[0].attributionCapture;
      capture.active = false;
      residualAttribution = POSITIONAL_GATE ? {
        schema: `lbh-state-pair-${GATE}-positional-sample-v1`,
        sample: { capturedAcceptedFrames: capture.rawFrames.length,
          encodedBytes: capture.rawFrames.reduce((sum, raw) => sum + Buffer.byteLength(raw, "utf8"), 0),
          meanEncodedBytes: capture.rawFrames.length
            ? capture.rawFrames.reduce((sum, raw) => sum + Buffer.byteLength(raw, "utf8"), 0) / capture.rawFrames.length : null,
          deterministicDigest: `sha256:${crypto.createHash("sha256").update(capture.rawFrames.join("\n")).digest("hex")}` },
        codec: POSITIONAL_CODEC_CAPABILITY,
        privacy: { rawFramesRetained: false, ownerPrivateValuesEmitted: false },
      } : analyzeStatePairSample(capture.rawFrames, { maxFrames: ATTRIBUTION_SAMPLE_FRAMES });
      capture.rawFrames.length = 0;
    }
    const endHealth = STAGE_PROFILE && !PROFILE_CONTROL ? await waitFor(async () => {
      const body = (await request(port, "/health/compact")).body;
      const profile = body.multiplayer.adapter.authorityStageProfile;
      const rawCalls = profile?.stages["match.rawSnapshotBuild"]?.aggregate.calls || 0;
      const coreCalls = profile?.stages["recipient.publicCoreProjectionConstruction"]?.aggregate.calls || 0;
      const proof = body.multiplayer.statePair.profileShareability?.publicCore;
      return rawCalls > 0 && proof?.beats === rawCalls && coreCalls === rawCalls * population
        && proof.comparisons === rawCalls * (population - 1)
        && proof.mismatches === 0 ? body : false;
    }, `${scenario}/${population} complete stage-profile beats`, 5000)
      : (await request(port, "/health/compact")).body;
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
    const p99OneSecond = windows["1s"].allRecipientWindowsBytesPerSecond.p99;
    const targetCadenceNormalization = RESIDUAL_GATE && !churn
      ? normalizeTrafficAtTargetCadence(accounting.events, { startAt, endAt, recipients }) : null;
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
    const receiverDiagnostics = clientSummary.map((client) => client.receiverDiagnostics).filter(Boolean);
    const receiverCleanupDiagnostics = clientSummary.map((client) => client.receiverCleanupDiagnostics).filter(Boolean);
    const receiverBaseMismatchCount = receiverDiagnostics.reduce((sum, diagnostics) => sum
      + (diagnostics.rejectionReasons?.["base-mismatch"] || 0)
      + (diagnostics.rejectionReasons?.["missing-base"] || 0), 0);
    const receiverRecoveryRequestCount = receiverDiagnostics.reduce((sum, diagnostics) =>
      sum + diagnostics.recoveryRequests, 0);
    const receiverRejectedCount = receiverDiagnostics.reduce((sum, diagnostics) =>
      sum + diagnostics.rejected, 0);
    const correctness = {
      mixedCapabilityNegotiated: !MIXED_GATE || clientSummary.every((client) =>
        client.capabilities.includes(MIXED_CAPABILITY)),
      allClientHashesMatched: clientSummary.every((client) => client.hashesVerified === client.acceptedPairs),
      ownerPrivacyAndAtomicObservationVerified: clientSummary.every((client) =>
        client.hashesVerified === client.acceptedPairs && client.error === null),
      legacyPublicStateShapeInternallyConsistent: !SPARSE_GATE || clientSummary.every((client) =>
        client.legacyReconstructionVerified === client.acceptedPairs),
      noClientErrors: clientSummary.every((client) => client.error === null),
      publisherDrained: publisher.recipients === 0 && publisher.pendingPairs === 0 && publisher.retainedBytes === 0,
      statePairAcksConverged: publisher.ackAccepted > 0,
      ackRejectsExactlyZero: publisher.ackRejected === 0,
      receiverBasesStayedApplicable: receiverBaseMismatchCount === 0,
      receiverRecoveryRequestsExactlyExpected: churn || receiverRecoveryRequestCount === 0,
      receiverRejectionsExactlyZeroInNormal: churn || receiverRejectedCount === 0,
      receiverLedgerStayedBounded: receiverDiagnostics.every((diagnostics) =>
        diagnostics.ledger.entries <= diagnostics.limits.maxRetainedPairHistory
        && diagnostics.ledger.bytes <= diagnostics.limits.maxRetainedBytes
        && diagnostics.ledger.highWaterBytes <= diagnostics.limits.maxRetainedBytes),
      receiverLedgerCleanedUp: receiverCleanupDiagnostics.length === clientSummary.length
        && receiverCleanupDiagnostics.every((diagnostics) =>
          diagnostics.closed === true && diagnostics.ledger.entries === 0 && diagnostics.ledger.bytes === 0),
      accountingComplete: accounting.overflow === 0 && accounting.evidenceFailure === null,
      faultConvergence: !churn || clientSummary.every((client) => {
        const loss = client.faults.find((fault) => fault.type === "frame-loss");
        const ackLoss = client.faults.find((fault) => fault.type === "ack-loss");
        if (loss && (S10_PROTOTYPE
          ? !(client.lastAcceptedFrameId > loss.frameId)
          : !client.faults.some((fault) => fault.type === "recovery"))) return false;
        if (ackLoss && !(client.lastAcceptedFrameId > ackLoss.frameId
          && client.lastStatePairAckSentFrameId > ackLoss.frameId)) return false;
        return true;
      }),
      noUnexpectedNormalRecovery: churn || allClients.every((client) => !client.faultLog.some((fault) =>
        fault.type === "recovery" && fault.at >= startAt && fault.at < endAt)),
      lifecycleObserved: !churn || (observedLifecycle.componentChanges > 0
        && faultActions.some((entry) => entry.name === "leave"
          && entry.oldMembership !== entry.replacementMembership
          && entry.presenceBeforeLeave && entry.authorityAbsenceObserved
          && entry.clientAbsenceObserved && entry.clientReplacementObserved)),
    };
    const authorityAcceptedPairsPerSecond = selected.filter((event) => event.direction === "authority->client"
      && event.frameClass === "statePair" && event.metric === "accepted").length
      / population / ((endAt - startAt) / 1000);
    const receiverAcceptedPairsPerSecond = Object.fromEntries(allClients.map((client) => [client.label,
      client.acceptedPairTimes.filter((at) => at >= startAt && at < endAt).length
        / ((endAt - startAt) / 1000)]));
    const minimumReceiverAcceptedPairsPerSecond = churn ? null
      : Math.min(...Object.values(receiverAcceptedPairsPerSecond));
    const receiverCadenceToleranceHz = Math.max(0.5, authorityAcceptedPairsPerSecond * 0.05);
    const receiverCadenceTracksAuthority = churn ? null : Object.values(receiverAcceptedPairsPerSecond)
      .every((rate) => Math.abs(rate - authorityAcceptedPairsPerSecond) <= receiverCadenceToleranceHz);
    const admission = {
      steadyMeanAtOrBelow64KiB: churn ? null : meanWorst <= TARGET_BPS,
      steadyOneSecondP95AtOrBelow80KiB: churn ? null : p95OneSecond <= SENSITIVITY_BPS,
      targetCadenceMeanAtOrBelow64KiB: churn || !RESIDUAL_GATE ? null
        : targetCadenceNormalization.worstRecipientMeanDownlinkBytesPerSecond <= TARGET_BPS,
      targetCadenceOneSecondP95AtOrBelow80KiB: churn || !RESIDUAL_GATE ? null
        : targetCadenceNormalization.oneSecondP95DownlinkBytesPerSecond <= SENSITIVITY_BPS,
      receiverAcceptedCadenceAtLeast90PercentOfConfigured: churn || !RESIDUAL_GATE ? null
        : minimumReceiverAcceptedPairsPerSecond >= MIN_HEALTHY_PUBLICATION_HZ,
      receiverCadenceTracksAuthorityWithinTolerance: !S10_PROTOTYPE || churn ? null
        : receiverCadenceTracksAuthority,
      receiverCadenceToleranceHz: !S10_PROTOTYPE || churn ? null : receiverCadenceToleranceHz,
      correctnessPassed: Object.values(correctness).every(Boolean),
      authorityWithinExistingClockBudget: endHealth.multiplayer.projection.accounting.costDistributions.simTickMs.p95
        <= (1000 / endHealth.session.tickHz)
        && endHealth.multiplayer.projection.accounting.costDistributions.projectionReplicationMs.p95
        <= (1000 / (RESIDUAL_GATE ? TARGET_PUBLICATION_HZ : endHealth.session.snapshotHz)),
      overloadStayedNormal: endHealth.session.overloadState === "NORMAL",
    };
    admission.convergenceOnlyPassed = !S10_PROTOTYPE ? null
      : admission.correctnessPassed
        && (churn || (admission.receiverCadenceTracksAuthorityWithinTolerance === true
          && admission.receiverAcceptedCadenceAtLeast90PercentOfConfigured === true));
    admission.productAdmissionPassed = !S10_PROTOTYPE ? null
      : admission.convergenceOnlyPassed
        && admission.authorityWithinExistingClockBudget === true
        && admission.overloadStayedNormal === true
        && (churn || (admission.steadyMeanAtOrBelow64KiB === true
          && admission.steadyOneSecondP95AtOrBelow80KiB === true
          && admission.targetCadenceMeanAtOrBelow64KiB === true
          && admission.targetCadenceOneSecondP95AtOrBelow80KiB === true));
    admission.passed = S10_PROTOTYPE
      ? admission.productAdmissionPassed
      : Object.entries(admission).filter(([key, value]) => value !== null
        && key !== "receiverCadenceToleranceHz").every(([, value]) => Boolean(value));
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
    const productPairKindCounts = Object.fromEntries(pairGroup.map((row) =>
      [row.projectionKind === "keyframe" ? "public-keyframe+owner-keyframe"
        : row.projectionKind === "delta" ? "public-delta+owner-delta" : row.projectionKind, row.frames]));
    const productMixed = Object.entries(productPairKindCounts)
      .filter(([kind]) => !["public-keyframe+owner-keyframe", "public-delta+owner-delta"].includes(kind))
      .reduce((sum, [, frames]) => sum + frames, 0);
    const publicDeltaOwnerKeyframe = productPairKindCounts["public-delta+owner-keyframe"] || 0;
    const atomicAlignmentCauses = Object.entries(publisher.keyframeReasons)
      .filter(([reason]) => reason.startsWith("atomic-kind-alignment:"))
      .reduce((sum, [, count]) => sum + count, 0);
    const sumEvents = (predicate) => selected.filter(predicate).reduce((sum, event) => ({
      frames: sum.frames + event.frames, bytes: sum.bytes + event.bytes,
    }), { frames: 0, bytes: 0 });
    const exactClassTotals = {
      fullKeyframeStatePairs: sumEvents((event) => event.direction === "authority->client"
        && event.frameClass === "statePair" && event.metric === "accepted"
        && event.projectionKind === "keyframe"),
      mixedStatePairs: sumEvents((event) => event.direction === "authority->client"
        && event.frameClass === "statePair" && event.metric === "accepted"
        && String(event.projectionKind).includes("+")),
      retransmittedStatePairs: sumEvents((event) => event.direction === "authority->client"
        && event.frameClass === "statePair" && event.metric === "retransmitted"),
      authorityControlAccepted: sumEvents((event) => event.direction === "authority->client"
        && event.frameClass === "control" && event.metric === "accepted"),
      authorityAcksAccepted: sumEvents((event) => event.direction === "authority->client"
        && event.frameClass === "ack" && event.metric === "accepted"),
      clientStatePairAcksAccepted: sumEvents((event) => event.direction === "client->authority"
        && event.frameClass === "ack" && event.metric === "accepted"),
      clientControlAccepted: sumEvents((event) => event.direction === "client->authority"
        && event.frameClass === "control" && event.metric === "accepted"),
      manifestsServed: { frames: clientSummary.filter((client) => client.manifest.servedBytes > 0).length,
        bytes: clientSummary.reduce((sum, client) => sum + client.manifest.servedBytes, 0) },
    };
    const result = {
      schemaVersion: RESIDUAL_GATE ? 3 : MIXED_GATE ? 2 : 1,
      gate: GATE, scenario, population, seed: SEED, profile: PROFILE,
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
        oneSecondP99DownlinkBytesPerSecond: p99OneSecond,
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
          exactClassTotals,
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
          mixed: productMixed, publicDeltaOwnerKeyframe, pairKindCounts: productPairKindCounts,
          atomicKindAlignmentCauses: atomicAlignmentCauses,
          atomicKindAlignmentAbsent: atomicAlignmentCauses === 0,
          keyframesPerAcceptedPair: productKeyframes / Math.max(1, productKeyframes + productDeltas + productMixed),
          keyframesPerSecondPerRecipient: productKeyframes / population / ((endAt - startAt) / 1000) },
        comparison: { acceptedS0FullJson: S0[population], s1StaticManifestApproximatePairP50: S0[population].pairP50 - S1_STATIC_PAIR_SAVINGS_BYTES,
          observedPairBytes: pairStats,
          savingsVsS0PairP50: 1 - pairStats.p50 / S0[population].pairP50,
          savingsVsS1ApproxPairP50: 1 - pairStats.p50 / (S0[population].pairP50 - S1_STATIC_PAIR_SAVINGS_BYTES) } },
      cadence: { authorityTickHz: endHealth.session.tickHz, publicationHz: endHealth.session.snapshotHz,
        configuredPublicationHz: TARGET_PUBLICATION_HZ,
        minimumHealthyObservedPublicationHz: MIN_HEALTHY_PUBLICATION_HZ,
        authorityAcceptedPairsPerSecond,
        receiverAcceptedPairsPerSecond,
        minimumReceiverAcceptedPairsPerSecond,
        authorityBoundary: "Application state-pair bytes accepted by ws.send callbacks; not proof of receiver acceptance.",
        receiverBoundary: "State pairs accepted and materialized by each test receiver inside the measured window." },
      fieldFreshness: SPARSE_GATE
        ? endHealth.multiplayer.statePair.runtimePublicComponents.fieldFreshness : null,
      targetCadenceNormalization,
      residualAttribution,
      recoveryAnalysis: (() => {
        const recoveries = allClients.flatMap((client) => client.faultLog)
          .filter((fault) => fault.type === "recovery" && fault.at >= startAt && fault.at < endAt);
        return {
          clientRecoveryRequests: recoveries.length,
          byReason: Object.fromEntries([...new Set(recoveries.map((fault) => fault.reason))].sort()
            .map((reason) => [reason, recoveries.filter((fault) => fault.reason === reason).length])),
          publisherKeyframeReasons: publisher.keyframeReasons,
          interpretation: "Unexpected recovery in a normal window fails correctness. Churn results must be read with the injected fault log; retries never satisfy cadence or admission.",
        };
      })(),
      performance: { machineLocal: true,
        authority: { ...deltaHealth(startHealth, endHealth),
          percentileScope: "bounded runtime rolling ring; reset after warmup by evidence-only endpoint" },
        positionalWireDecodeMs: POSITIONAL_GATE ? distribution(allClients.flatMap((client) => client.wireDecodeSamples)
          .filter((sample) => sample.at >= startAt && sample.at < endAt).map((sample) => sample.ms)) : null,
        clientApplyMs: distribution(allClients.flatMap((client) => client.clientWorkSamples)
          .filter((sample) => sample.at >= startAt && sample.at < endAt).map((sample) => sample.ms)),
        clientAckSerializeSendMs: distribution(allClients.flatMap((client) => client.ackWorkSamples)
          .filter((sample) => sample.at >= startAt && sample.at < endAt).map((sample) => sample.ms)),
        eventLoopLag: endHealth.multiplayer.projection.benchmarkEventLoopDelay
          || endHealth.multiplayer.adapter.authorityStageProfile?.eventLoopDelay
          || { available: false, reason: PROFILE_CONTROL
            ? "Instrumentation-off A/B control intentionally has no event-loop-delay monitor."
            : "Runtime stage profiler was not enabled." },
        authorityStageProfile: endHealth.multiplayer.adapter.authorityStageProfile || null,
        memory: { ...memorySummary(memorySamples.filter((sample) => sample.at >= startAt && sample.at < endAt)),
          ledgerLimitation: "Authority process memory includes the guarded replication-accounting ledger and cannot isolate product-only retention." },
        boundedState: { publisherAfterCleanup: publisher,
          maxPublisherPendingPairs: Math.max(...memorySamples.map((sample) => sample.publisher.pendingPairs)),
          maxPublisherRetainedBytes: Math.max(...memorySamples.map((sample) => sample.publisher.retainedBytes)),
          maxAdapterQueuedBytes: Math.max(...memorySamples.map((sample) => sample.adapter.queuedBytes)) } },
      faults: faultActions, clients: clientSummary, correctness, admission,
      diagnostics: { projectionErrors: endHealth.multiplayer.projection.errors - startHealth.multiplayer.projection.errors,
        skippedBeats: endHealth.multiplayer.projection.skippedBeats - startHealth.multiplayer.projection.skippedBeats,
        statePair: endHealth.multiplayer.statePair,
        adapterStatePair: endHealth.multiplayer.adapter.statePair,
        manifestTransfers: preStopHealth.multiplayer.manifestTransfers },
      limitations: ["Local macOS loopback only", "raw WebSocket without TLS", "one match at a time",
        "no hosted fleet, WSS, WAN, packet retransmission, compression, AOI, binary codec, or 24-96-client claim"],
    };
    if (COMPARE_S3) result.comparisonToS3 = compareScenarioToS3(result);
    if (RESIDUAL_GATE) {
      result.comparisonToS4 = compareScenarioToS4(result);
      result.comparisonToS6PreparedDiagnostic = compareScenarioToS6(result);
    }
    writeExclusive(path.join(runDir, `${scenario}-${population}.json`), result);
    return result;
  } finally {
    for (const client of clientsRef.current) await closeClient(client).catch(() => {});
    if (preStopHealth === null) {
      preStopHealth = await request(port, "/health").then((response) => response.body).catch(() => null);
    }
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
    productCorrectnessOutcomeRecorded: scenarioFiles.every((entry) =>
      typeof entry.admission.correctnessPassed === "boolean"),
    allAccountingComplete: scenarioFiles.every((entry) => entry.correctness.accountingComplete),
    normalPopulationsPresent: (aggregate.expectedPopulations || (aggregate.microProfile ? [1, 8] : [1, 4, 8])).every((population) =>
      scenarioFiles.some((entry) => entry.scenario === "normal" && entry.population === population))
      || aggregate.profile === "review",
    churnPopulationsPresent: ["s5", "s6"].includes(aggregate.gate)
      || (aggregate.expectedChurnPopulations || [1, 4, 8]).every((population) => scenarioFiles.some((entry) =>
        entry.scenario === "churn" && entry.population === population)) || aggregate.profile === "review",
    atomicKindAlignmentAbsent: !["s4", "s7", "s8"].includes(aggregate.gate) || scenarioFiles.every((entry) =>
      entry.pairShape.productWindow.atomicKindAlignmentAbsent === true),
    mixedPairsObserved: !["s4", "s7", "s8", "s9", "s10"].includes(aggregate.gate) || scenarioFiles
      .filter((entry) => entry.scenario === "normal")
      .every((entry) => entry.pairShape.productWindow.publicDeltaOwnerKeyframe > 0),
    s3ComparisonsPresent: aggregate.gate !== "s4" || scenarioFiles.every((entry) =>
      entry.comparisonToS3?.compositeSha256 === S3_CANONICAL_SHA256),
    stageProfilePresent: aggregate.gate !== "s5" || aggregate.instrumentationEnabled === false
      || scenarioFiles.every((entry) => entry.performance.authorityStageProfile?.enabled === true),
    publicCoreShareabilityProved: aggregate.gate !== "s5" || aggregate.instrumentationEnabled === false
      || scenarioFiles.every((entry) => {
        const proof = entry.diagnostics.statePair.profileShareability?.publicCore;
        const profile = entry.performance.authorityStageProfile;
        const rawCalls = profile?.stages["match.rawSnapshotBuild"]?.aggregate.calls || 0;
        const coreCalls = profile?.stages["recipient.publicCoreProjectionConstruction"]?.aggregate.calls || 0;
        return proof?.noMismatchesAmongObservedComparisons === true && proof.mismatches === 0
          && proof.beats === rawCalls && coreCalls === rawCalls * entry.population
          && proof.comparisons === rawCalls * (entry.population - 1);
      }),
    s7PreparedProfilerBoundary: !["s7", "s8", "s9", "s10"].includes(aggregate.gate) || (aggregate.preparedProjectionsEnabled === true
      && aggregate.instrumentationEnabled === false && aggregate.eventLoopMonitorEnabled === true),
    s7AckRejectAccountingConsistent: !["s7", "s8", "s9", "s10"].includes(aggregate.gate) || scenarioFiles.every((entry) => {
      const rejected = entry.pairShape.ackBaseProof.ackRejected;
      return Number.isSafeInteger(rejected) && rejected >= 0
        && entry.correctness.ackRejectsExactlyZero === (rejected === 0);
    }),
    s7CadenceNormalizationPresent: !["s7", "s8", "s9", "s10"].includes(aggregate.gate) || scenarioFiles
      .filter((entry) => entry.scenario === "normal")
      .every((entry) => entry.targetCadenceNormalization?.configuredPublicationHz === TARGET_PUBLICATION_HZ
        && Number.isFinite(entry.targetCadenceNormalization?.worstRecipientMeanDownlinkBytesPerSecond)
        && Number.isFinite(entry.targetCadenceNormalization?.oneSecondP95DownlinkBytesPerSecond)),
    s7AttributionReconciledAndPrivate: ["s9", "s10"].includes(aggregate.gate) ? scenarioFiles
      .filter((entry) => entry.scenario === "normal")
      .every((entry) => entry.residualAttribution?.codec === POSITIONAL_CODEC_CAPABILITY
        && entry.residualAttribution?.sample?.capturedAcceptedFrames > 0
        && entry.residualAttribution?.privacy?.rawFramesRetained === false
        && entry.residualAttribution?.privacy?.ownerPrivateValuesEmitted === false)
      : !["s7", "s8"].includes(aggregate.gate) || scenarioFiles
      .filter((entry) => entry.scenario === "normal")
      .every((entry) => entry.residualAttribution?.exactLaneReconciliation?.passed === true
        && entry.residualAttribution?.publicDelta?.operationClassReconciliation?.passed === true
        && entry.residualAttribution?.publicDelta?.updateLexicalComposition?.reconciliation?.passed === true
        && entry.residualAttribution?.ownerKeyframe?.reconciliation?.passed === true
        && entry.residualAttribution?.privacy?.rawFramesRetained === false
        && entry.residualAttribution?.privacy?.ownerPrivateValuesEmitted === false),
    s7ComparisonsPresent: !["s7", "s8", "s9", "s10"].includes(aggregate.gate) || scenarioFiles.every((entry) =>
      entry.comparisonToS4?.compositeSha256 === S4_CANONICAL_SHA256
        && (entry.scenario !== "normal"
          || entry.comparisonToS6PreparedDiagnostic?.analysisSha256 === S6_ANALYSIS_SHA256)),
    s8FieldFreshnessPresent: !["s8", "s9", "s10"].includes(aggregate.gate) || scenarioFiles.every((entry) =>
      Object.values(entry.fieldFreshness?.maximumConfiguredPublicationLagBeats || {})
        .length === 4
      && Object.values(entry.fieldFreshness.maximumConfiguredPublicationLagBeats)
        .every((value) => value === 0)),
    s9CodecManifestBound: !["s9", "s10"].includes(aggregate.gate) || scenarioFiles.every((entry) =>
      entry.clients.every((client) => client.manifest?.codecVerified === true
        && client.manifest?.codecManifestHash === POSITIONAL_CODEC_MANIFEST_HASH)
      && entry.diagnostics?.adapterStatePair?.positionalJson?.encodedFrames > 0
      && entry.performance?.positionalWireDecodeMs?.count > 0),
    s10LedgerEvidence: aggregate.gate !== "s10" || scenarioFiles.every((entry) =>
      entry.clients.every((client) => client.receiverDiagnostics?.ledger
        && client.receiverDiagnostics.ledger.entries <= client.receiverDiagnostics.limits.maxRetainedPairHistory
        && client.receiverDiagnostics.ledger.bytes <= client.receiverDiagnostics.limits.maxRetainedBytes
        && client.receiverCleanupDiagnostics?.closed === true
        && client.receiverCleanupDiagnostics?.ledger?.entries === 0
        && client.receiverCleanupDiagnostics?.ledger?.bytes === 0)
      && entry.correctness.receiverBasesStayedApplicable === true
      && entry.correctness.ackRejectsExactlyZero === true
      && typeof entry.admission.convergenceOnlyPassed === "boolean"
      && typeof entry.admission.productAdmissionPassed === "boolean"
      && typeof entry.admission.authorityWithinExistingClockBudget === "boolean"
      && typeof entry.admission.overloadStayedNormal === "boolean"
      && (entry.scenario !== "normal"
        || (entry.admission.receiverCadenceTracksAuthorityWithinTolerance === true
          && entry.admission.convergenceOnlyPassed === true))),
  };
  const methodPassed = invariants.checksums && invariants.allCleanupPassed
    && (["s7", "s8", "s9", "s10"].includes(aggregate.gate) ? invariants.productCorrectnessOutcomeRecorded : invariants.productCorrectnessPassed)
    && invariants.allAccountingComplete && invariants.normalPopulationsPresent && invariants.churnPopulationsPresent
    && invariants.atomicKindAlignmentAbsent && invariants.mixedPairsObserved && invariants.s3ComparisonsPresent
    && invariants.stageProfilePresent && invariants.publicCoreShareabilityProved
    && invariants.s7PreparedProfilerBoundary && invariants.s7AckRejectAccountingConsistent
    && invariants.s7CadenceNormalizationPresent && invariants.s7AttributionReconciledAndPrivate
    && invariants.s7ComparisonsPresent && invariants.s8FieldFreshnessPresent
    && invariants.s9CodecManifestBound && invariants.s10LedgerEvidence;
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
  const admissionIndex = process.argv.indexOf("--admission-artifact");
  if (admissionIndex >= 0) {
    const directory = path.resolve(process.argv[admissionIndex + 1]);
    const result = validateArtifact(directory);
    const admitted = result.passed && result.aggregateVerdict?.passed === true;
    console.log(JSON.stringify({ ...result, admitted }, null, 2));
    process.exit(!result.passed ? 1 : admitted ? 0 : 2);
  }
  const commit = git("rev-parse", "HEAD");
  const dirty = Boolean(git("status", "--porcelain"));
  const allowDirty = process.env[`LBH_${GATE.toUpperCase()}_ALLOW_DIRTY`] === "1";
  if (dirty && !allowDirty) throw new Error(`${GATE.toUpperCase()} product evidence requires clean HEAD`);
  const stamp = new Date().toISOString().replace(/[:.]/g, "");
  const configuredOutput = process.env[`LBH_${GATE.toUpperCase()}_OUTPUT_DIR`];
  const runDir = configuredOutput
    ? path.resolve(configuredOutput)
    : path.join(__dirname, "screenshots", `multiplayer-state-pair-${GATE}-${stamp}-${commit.slice(0, 7)}`);
  fs.mkdirSync(runDir, { recursive: false });
  const command = `node tests/multiplayer-state-pair-product-gate.cjs${S10_PROTOTYPE ? " --s10-ledger" : S9_PROTOTYPE ? " --s9-positional" : S8_PROTOTYPE ? " --s8-prototype" : S7_GATE ? " --s7" : S6_BENCHMARK ? " --s6-benchmark" : STAGE_PROFILE ? " --s5-profile" : MIXED_GATE ? " --s4" : ""}${MICRO_PROFILE ? " --micro" : ""}${PROFILE_CONTROL ? " --profile-control" : ""}${PROFILE === "review" ? " --review" : ""}${ADMISSION_MODE ? " --admission" : ""}`;
  writeExclusive(path.join(runDir, "run.json"), {
    schemaVersion: RESIDUAL_GATE ? 3 : 2,
    gate: GATE, generatedAt: new Date().toISOString(), command, profile: PROFILE, commit, dirty, seed: SEED,
    config: { populations: POPULATIONS, normalWarmupMs: NORMAL_WARMUP_MS, normalWindowMs: NORMAL_WINDOW_MS,
      churnWarmupMs: CHURN_WARMUP_MS, churnWindowMs: CHURN_WINDOW_MS, inputHz: INPUT_HZ,
      targetBytesPerSecondPerPlayer: TARGET_BPS, sensitivityBytesPerSecondPerPlayer: SENSITIVITY_BPS,
      targetPublicationHz: TARGET_PUBLICATION_HZ,
      minimumHealthyObservedPublicationHz: MIN_HEALTHY_PUBLICATION_HZ,
      attributionSampleFramesPerPopulation: RESIDUAL_GATE ? ATTRIBUTION_SAMPLE_FRAMES : 0,
      env: { LBH_SIM_WS_JSON_V2: true, LBH_SIM_WS_STATE_PAIR_V1: true,
        LBH_SIM_WS_STATE_PAIR_MIXED_V1: MIXED_GATE,
        LBH_SIM_WS_RUNTIME_PUBLIC_COMPONENTS_V1: SPARSE_GATE,
        LBH_SIM_WS_POSITIONAL_JSON_V1: POSITIONAL_GATE,
        LBH_SIM_WS_ACK_REJECT_DIAGNOSTICS: RESIDUAL_GATE,
        LBH_SIM_WS_PREPARED_PROJECTIONS: S6_BENCHMARK ? S6_PREPARED : true,
        LBH_SIM_WS_BENCH_EVENT_LOOP: S6_BENCHMARK || RESIDUAL_GATE,
        LBH_SIM_WS_REPLICATION_ACCOUNTING: true, LBH_REPLICATION_BASELINE_CAPTURE: true,
        LBH_SIM_WS_STAGE_PROFILE: STAGE_PROFILE && !PROFILE_CONTROL } },
    machine: { hostname: os.hostname(), platform: os.platform(), release: os.release(), arch: os.arch(),
      cpu: os.cpus()[0]?.model || null, logicalCpuCount: os.cpus().length, totalMemoryBytes: os.totalmem(),
      node: process.version, v8: process.versions.v8 },
    claimBoundary: `Machine-local opt-in ${MIXED_GATE ? "state-pair-mixed-v1" : "state-pair-v1"} application traffic and CPU gate for one match authority at 1/4/8 recipients; not WAN/WSS/hosted/fleet/high-count evidence.`,
    s3CanonicalEvidence: COMPARE_S3 ? { path: path.relative(ROOT, S3_CANONICAL_DIR),
      compositeSha256: S3_CANONICAL_SHA256 } : null,
    s4CanonicalEvidence: RESIDUAL_GATE ? { path: path.relative(ROOT, S4_CANONICAL_DIR),
      compositeSha256: S4_CANONICAL_SHA256 } : null,
    s6PreparedDiagnosticEvidence: RESIDUAL_GATE ? { path: path.relative(ROOT, S6_ANALYSIS_PATH),
      analysisSha256: S6_ANALYSIS_SHA256 } : null,
  });
  const results = [];
  try {
    for (const population of POPULATIONS) results.push(await runScenario({ population, scenario: "normal", runDir }));
    if (!STAGE_PROFILE && !S6_BENCHMARK) {
      for (const population of CHURN_POPULATIONS) results.push(await runScenario({ population, scenario: "churn", runDir }));
    }
  } catch (error) {
    writeExclusive(path.join(runDir, "failure.json"), { at: new Date().toISOString(), message: error.message,
      stack: String(error.stack || "").split("\n").slice(0, 20) });
    throw error;
  }
  const verdict = {
    passed: results.every((entry) => entry.admission.passed),
    productAdmissionPassed: !S10_PROTOTYPE ? null
      : results.every((entry) => entry.admission.productAdmissionPassed === true),
    convergenceOnlyPassed: !S10_PROTOTYPE ? null
      : results.every((entry) => entry.admission.convergenceOnlyPassed === true),
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
      targetCadenceRequiredDownlinkReductionBytesPerSecond: entry.targetCadenceNormalization
        ? Math.max(0, entry.targetCadenceNormalization.worstRecipientMeanDownlinkBytesPerSecond - TARGET_BPS) : null,
      targetCadenceRequiredDownlinkReductionFraction: entry.targetCadenceNormalization
        ? Math.max(0, 1 - TARGET_BPS
          / entry.targetCadenceNormalization.worstRecipientMeanDownlinkBytesPerSecond) : null,
      dominantAcceptedDownlink: acceptedDownlink.slice(0, 5).map((row) => ({
        frameClass: row.frameClass, projectionKind: row.projectionKind, bytes: row.bytes,
        fraction: total > 0 ? row.bytes / total : 0,
      })),
    };
  });
  const aggregate = { schemaVersion: RESIDUAL_GATE ? 3 : MIXED_GATE ? 2 : 1, gate: GATE,
    profile: PROFILE, microProfile: MICRO_PROFILE, instrumentationEnabled: STAGE_PROFILE && !PROFILE_CONTROL,
    eventLoopMonitorEnabled: S6_BENCHMARK || RESIDUAL_GATE,
    commit, seed: SEED, command, verdict, expectedPopulations: POPULATIONS,
    expectedChurnPopulations: !STAGE_PROFILE && !S6_BENCHMARK ? CHURN_POPULATIONS : [],
    preparedProjectionsEnabled: RESIDUAL_GATE ? true : S6_BENCHMARK ? S6_PREPARED : null,
    scenarios: results.map((entry) => ({ file: `${entry.scenario}-${entry.population}.json`,
      scenario: entry.scenario, population: entry.population,
      worstRecipientMeanDownlinkBytesPerSecond: entry.exactTraffic.worstRecipientMeanDownlinkBytesPerSecond,
      oneSecondP95DownlinkBytesPerSecond: entry.exactTraffic.oneSecondP95DownlinkBytesPerSecond,
      oneSecondP99DownlinkBytesPerSecond: entry.exactTraffic.oneSecondP99DownlinkBytesPerSecond,
      pairKindCounts: entry.pairShape.productWindow.pairKindCounts,
      admission: entry.admission })),
    s3CanonicalEvidence: COMPARE_S3 ? { path: path.relative(ROOT, S3_CANONICAL_DIR),
      compositeSha256: S3_CANONICAL_SHA256,
      comparisons: Object.fromEntries(results.map((entry) =>
        [`${entry.scenario}-${entry.population}`, entry.comparisonToS3])) } : null,
    optimizationProof: MIXED_GATE ? {
      atomicKindAlignmentCauses: results.reduce((sum, entry) =>
        sum + entry.pairShape.productWindow.atomicKindAlignmentCauses, 0),
      publicDeltaOwnerKeyframeProductPairs: results.reduce((sum, entry) =>
        sum + entry.pairShape.productWindow.publicDeltaOwnerKeyframe, 0),
      allNormalPopulationsObservedMixed: normalResults.every((entry) =>
        entry.pairShape.productWindow.publicDeltaOwnerKeyframe > 0),
    } : null,
    manifestIdentity: { hashes: results.map((entry) => entry.diagnostics.statePair.manifestHash),
      changedAcrossFreshMatches: new Set(results.map((entry) => entry.diagnostics.statePair.manifestHash)).size > 1,
      reconnectReuseObserved: results.filter((entry) => entry.scenario === "churn")
        .every((entry) => entry.faults.some((fault) => fault.name === "reconnect" && fault.manifestReused === true)) },
    failureAnalysis,
    residualDecisionTable: RESIDUAL_GATE && !POSITIONAL_GATE ? buildResidualDecisionTable(normalResults) : null,
    recommendation: STAGE_PROFILE ? "Diagnostic only: use stage attribution and the A/B control before selecting one narrow CPU optimization."
      : S10_PROTOTYPE ? {
        decision: "Report bounded-base convergence separately from product admission. Convergence requires edge-triggered recovery, exact ACK behavior, and receiver cadence tracking authority; product admission additionally keeps the existing clock, NORMAL overload, and traffic gates.",
        bandwidthBoundary: "A convergence-only pass does not admit the product when positional traffic, authority clock, or overload guards fail.",
        defer: "Do not enable experimental capabilities by default or expand to binary, compression, AOI, hosted WSS, WAN, or fleet claims.",
      }
      : S9_PROTOTYPE ? {
        decision: "Treat this as a positional-JSON pre-gate only; admission still requires the canonical duration and every correctness/cadence/overload guard.",
        targetMeanPairBytesAt10Hz: 6504,
        s8SampledMeanPairBytes: { 1: 11973, 4: 13831, 8: 15949 },
        defer: "Do not enable by default or expand to binary, compression, AOI, hosted WSS, WAN, or fleet claims.",
      }
      : S8_PROTOTYPE ? {
        decision: "Do not admit runtime-public-components-v1 from this pre-gate. It preserves exact client-visible state and freshness, but component splitting alone does not close the S7 traffic gap.",
        nextEvidence: "Prototype one bounded compact public-entity envelope/schema encoding while preserving the same ticket-bound rollback and exact reconstruction tests, then rerun this gate.",
        optionalFollowup: "Only if the compact-envelope result still misses narrowly, measure one explicitly bounded presentation cadence class with a non-zero field-age contract.",
        defer: "Do not enable the capability by default or add binary, compression, AOI, hosted WSS, WAN, or fleet claims from this local result.",
      }
      : RESIDUAL_GATE ? {
        first: "Use the privacy-safe residual table to prototype schema cleanup and explicit field cadence before selecting a codec or AOI change.",
        admission: "Do not admit from target-cadence normalization alone; require actual >=9 Hz cadence, NORMAL overload, exact application thresholds, and the normalized guard.",
        nextEvidence: "Prototype one bounded payload change, prove exact authority/client equivalence, then rerun this same canonical gate.",
        defer: "Do not change cadence policy, enable new defaults, or claim WSS/WAN/hosted overhead from the separate transport sensitivity model.",
      }
      : verdict.passed ? "S4 structural JSON traffic and CPU pass; advance only to separately measured WAN/WSS and longer soak gates."
      : {
        nextSlice: "Diagnose the dominant accepted statePair bytes and projection/publish cost at each failing population; reduce repeated runtimePublic structure only if the product evidence identifies it as the next narrow cause.",
        quantifiedTarget: "Recover each population's exact required reduction in failureAnalysis; do not substitute aggregate averages or modeled transport overhead.",
        second: "Keep mixed public-delta/owner-keyframe atomic observation and independently isolate accounting-ledger memory from product memory before changing retention.",
        defer: "Binary, AOI, compression, hosted WSS, and fleet packing remain out of scope until structural JSON passes or a measured residual justifies them.",
      },
  };
  writeExclusive(path.join(runDir, "aggregate.json"), aggregate);
  const files = fs.readdirSync(runDir).filter((name) => name.endsWith(".json") && name !== "checksums.json");
  writeExclusive(path.join(runDir, "checksums.json"), aggregateChecksum(runDir, files));
  const validation = validateArtifact(runDir);
  console.log(`${GATE.toUpperCase()} state-pair artifact: ${runDir}`);
  console.log(`Aggregate SHA-256: ${validation.checksum.actualAggregateSha256}`);
  console.log(`Verdict: ${verdict.passed ? "PASS" : "FAIL"}; validation=${validation.passed ? "PASS" : "FAIL"}`);
  process.exit(!validation.passed ? 1 : ADMISSION_MODE && !verdict.passed ? 2 : 0);
}

main().catch((error) => { console.error(error.stack || error.message); process.exit(1); });
