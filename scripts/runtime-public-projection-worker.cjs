"use strict";

const crypto = require("crypto");
const { isMainThread, parentPort } = require("worker_threads");
const { performance } = require("perf_hooks");
const {
  normalizeView,
  prepareProjection,
  preparedProjectionHash,
  createPreparedStructuralDelta,
} = require("./canonical-structural-delta.cjs");
const { canonicalJsonBytes } = require("./session-replication-manifest.cjs");

const PROTOCOL = "lbh-runtime-public-projection-worker-v1";

function digest(bytes) {
  return `sha256:${crypto.createHash("sha256").update(bytes).digest("hex")}`;
}

function context(view) {
  return Object.freeze({ schema: view.schema, manifestHash: view.manifestHash,
    matchId: view.runId, sessionId: "opaque-session", authorityIncarnation: view.authorityEpoch,
    recipientId: "opaque-recipient", recipientIncarnation: view.connectionEpoch,
    lane: "public", statePairId: view.statePairId, snapshotId: view.snapshotId, tick: view.tick });
}

function computePublicCandidates({ currentPublicView, basePublicView = null } = {}) {
  const current = normalizeView(currentPublicView);
  if (current.lane !== "public") throw new Error("worker-current-lane-must-be-public");
  const currentContext = context(current);
  const currentPrepared = prepareProjection(current, currentContext);
  const currentHash = preparedProjectionHash(currentPrepared, currentContext);
  const keyframe = Object.freeze({ kind: "keyframe", schema: current.schema,
    resultHash: currentHash, projection: current });
  let delta = null;
  if (basePublicView) {
    const base = normalizeView(basePublicView);
    if (base.lane !== "public") throw new Error("worker-base-lane-must-be-public");
    const baseContext = context(base);
    const basePrepared = prepareProjection(base, baseContext);
    const baseHash = preparedProjectionHash(basePrepared, baseContext);
    const built = createPreparedStructuralDelta(basePrepared, currentPrepared,
      { baseContext, currentContext, expectedBaseHash: baseHash });
    delta = Object.freeze({ kind: "delta", schema: built.delta.schema,
      baseSnapshotId: base.snapshotId, baseHash: built.delta.baseHash,
      resultHash: built.delta.resultHash, delta: built.delta });
  }
  const keyframeBytes = canonicalJsonBytes(keyframe);
  const deltaBytes = delta ? canonicalJsonBytes(delta) : null;
  return Object.freeze({
    keyframeBytes,
    keyframeDigest: digest(keyframeBytes),
    deltaBytes,
    deltaDigest: deltaBytes ? digest(deltaBytes) : null,
  });
}

if (!isMainThread) {
  parentPort.postMessage({ protocol: PROTOCOL, type: "ready" });
  parentPort.on("message", async (message) => {
    if (message?.protocol !== PROTOCOL) return;
    if (message.type === "shutdown") {
      parentPort.postMessage({ protocol: PROTOCOL, type: "shutdown-ack" });
      parentPort.close();
      return;
    }
    if (message.type === "crash") process.exit(73);
    if (message.delayMs > 0) await new Promise((resolve) => setTimeout(resolve, message.delayMs));
    const cpuStart = process.threadCpuUsage();
    const started = performance.now();
    try {
      const computed = computePublicCandidates(message.job);
      const keyframe = computed.keyframeBytes.buffer.slice(computed.keyframeBytes.byteOffset,
        computed.keyframeBytes.byteOffset + computed.keyframeBytes.byteLength);
      const delta = computed.deltaBytes && computed.deltaBytes.buffer.slice(computed.deltaBytes.byteOffset,
        computed.deltaBytes.byteOffset + computed.deltaBytes.byteLength);
      const cpu = process.threadCpuUsage(cpuStart);
      const result = { protocol: PROTOCOL, requestId: message.requestId, type: "result",
        fence: message.fence, keyframeBytes: keyframe, keyframeDigest: computed.keyframeDigest,
        deltaBytes: delta, deltaDigest: computed.deltaDigest,
        computeMs: performance.now() - started, workerCpuMicros: cpu.user + cpu.system };
      parentPort.postMessage(result, [keyframe, ...(delta ? [delta] : [])]);
    } catch (error) {
      parentPort.postMessage({ protocol: PROTOCOL, requestId: message.requestId, type: "error",
        fence: message.fence, error: String(error?.code || error?.message || error).slice(0, 160) });
    }
  });
}

module.exports = { PROTOCOL, digest, computePublicCandidates };
