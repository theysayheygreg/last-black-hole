"use strict";

const crypto = require("crypto");
const { prepareProjection, preparedProjectionView, preparedProjectionHash,
  createPreparedStructuralDelta } =
  require("../../scripts/canonical-structural-delta.cjs");
const { canonicalJsonBytes } = require("../../scripts/session-replication-manifest.cjs");
const { codecContext, encodePositionalFrame, composeStatePairLaneCandidates } =
  require("../../scripts/state-pair-positional-codec.cjs");
const { encodeCompressedStatePair, decodeCompressedStatePair } =
  require("../../scripts/state-pair-compression-codec.cjs");

const TIE_ORDER = Object.freeze([
  "public-keyframe+owner-keyframe",
  "public-keyframe+owner-delta",
  "public-delta+owner-keyframe",
  "public-delta+owner-delta",
]);

function digest(bytes) {
  return `sha256:${crypto.createHash("sha256").update(bytes).digest("hex")}`;
}

function preparedContext(view, identity) {
  return { schema: view.schema, manifestHash: view.manifestHash, matchId: identity.matchId,
    sessionId: identity.sessionId, authorityIncarnation: identity.authorityIncarnation,
    recipientId: identity.recipientId, recipientIncarnation: identity.recipientIncarnation,
    lane: view.lane, statePairId: view.statePairId, snapshotId: view.snapshotId, tick: view.tick };
}

function lanePayloads(currentInput, baseInput, identity) {
  const currentContext = preparedContext(currentInput, identity);
  const currentToken = prepareProjection(currentInput, currentContext);
  const current = preparedProjectionView(currentToken, currentContext);
  const currentHash = preparedProjectionHash(currentToken, currentContext);
  const keyframe = Object.freeze({ kind: "keyframe", schema: current.schema,
    resultHash: currentHash, projection: current });
  if (!baseInput) return Object.freeze({ keyframe, delta: null });
  const baseContext = preparedContext(baseInput, identity);
  const baseToken = prepareProjection(baseInput, baseContext);
  const base = preparedProjectionView(baseToken, baseContext);
  const baseHash = preparedProjectionHash(baseToken, baseContext);
  const built = createPreparedStructuralDelta(baseToken, currentToken,
    { baseContext, currentContext, expectedBaseHash: baseHash });
  const delta = Object.freeze({ kind: "delta", schema: built.delta.schema,
    baseSnapshotId: base.snapshotId, baseHash: built.delta.baseHash,
    resultHash: built.delta.resultHash, delta: built.delta });
  return Object.freeze({ keyframe, delta });
}

function publicWorkerJob(job) {
  return {
    fence: { ...job.fence }, identity: { ...job.identity }, frameId: job.frameId,
    forceKeyframe: job.forceKeyframe,
    current: { public: structuredClone(job.current.public) },
    base: job.base ? { public: structuredClone(job.base.public) } : null,
  };
}

function replayPublicProjection(job) {
  if (job.current?.owner || job.base?.owner) throw new Error("worker-input-must-not-contain-owner-lane");
  const publicLanes = lanePayloads(job.current.public, job.base?.public || null, job.identity);
  const keyframeBytes = canonicalJsonBytes(publicLanes.keyframe);
  const deltaBytes = publicLanes.delta ? canonicalJsonBytes(publicLanes.delta) : null;
  return {
    fence: { ...job.fence },
    publicKeyframeBytes: keyframeBytes,
    publicKeyframeDigest: digest(keyframeBytes),
    publicDeltaBytes: deltaBytes,
    publicDeltaDigest: deltaBytes ? digest(deltaBytes) : null,
  };
}

function parsePublicWorkerResult(job, result) {
  if (JSON.stringify(result.fence) !== JSON.stringify(job.fence)) throw new Error("public-worker-fence-mismatch");
  const keyframeBytes = Buffer.from(result.publicKeyframeBytes);
  if (digest(keyframeBytes) !== result.publicKeyframeDigest) throw new Error("public-keyframe-digest-mismatch");
  const keyframe = JSON.parse(keyframeBytes.toString("utf8"));
  let delta = null;
  if (result.publicDeltaBytes) {
    const deltaBytes = Buffer.from(result.publicDeltaBytes);
    if (digest(deltaBytes) !== result.publicDeltaDigest) throw new Error("public-delta-digest-mismatch");
    delta = JSON.parse(deltaBytes.toString("utf8"));
  }
  return Object.freeze({ keyframe: Object.freeze(keyframe), delta: delta && Object.freeze(delta) });
}

function finalizeStatePair(job, publicResult) {
  const identity = job.identity;
  const publicLanes = parsePublicWorkerResult(job, publicResult);
  const ownerLanes = lanePayloads(job.current.owner, job.base?.owner || null, identity);
  const publicView = publicLanes.keyframe.projection;
  const header = Object.freeze({ type: "statePair", pairSchema: "lbh-authority-state-pair-mixed-v1",
    matchId: identity.matchId, sessionId: identity.sessionId,
    authorityIncarnation: identity.authorityIncarnation, recipientId: identity.recipientId,
    recipientIncarnation: identity.recipientIncarnation, frameId: job.frameId,
    statePairId: publicView.statePairId, snapshotId: publicView.snapshotId, tick: publicView.tick,
    simTime: publicView.simTime, eventWatermark: publicView.eventWatermark,
    fieldRevision: publicView.fieldRevision, overloadMode: publicView.overloadMode,
    ballparkEpoch: publicView.ballparkEpoch, manifestHash: publicView.manifestHash });
  const context = codecContext({ ...identity, manifestHash: publicView.manifestHash });
  let chosen;
  let candidates;
  if (!job.forceKeyframe && publicLanes.delta && ownerLanes.delta) {
    const selected = composeStatePairLaneCandidates(header, {
      public: publicLanes, owner: ownerLanes,
    }, context, TIE_ORDER);
    chosen = selected.chosen;
    candidates = selected.candidates.map((entry) => ({ kind: entry.kind, bytes: entry.bytes }));
  } else {
    const frame = Object.freeze({ ...header, public: publicLanes.keyframe, owner: ownerLanes.keyframe });
    const wire = encodePositionalFrame(frame, context);
    chosen = { kind: "public-keyframe+owner-keyframe", bytes: Buffer.byteLength(wire), frame, wire };
    candidates = [{ kind: chosen.kind, bytes: chosen.bytes }];
  }
  const positional = Buffer.from(chosen.wire, "utf8");
  const compressed = encodeCompressedStatePair(positional);
  if (!decodeCompressedStatePair(compressed).equals(positional)) {
    throw new Error("compressed replay failed exact round trip");
  }
  return {
    fence: { ...job.fence }, kind: chosen.kind, candidates,
    positional, positionalBytes: positional.length, positionalDigest: digest(positional),
    compressed, compressedBytes: compressed.length, compressedDigest: digest(compressed),
    decodedFrame: chosen.frame,
  };
}

function replayStatePair(job) {
  return finalizeStatePair(job, replayPublicProjection(publicWorkerJob(job)));
}

module.exports = { TIE_ORDER, digest, publicWorkerJob, replayPublicProjection,
  finalizeStatePair, replayStatePair };
