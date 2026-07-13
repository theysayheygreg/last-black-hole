"use strict";

const {
  normalizeView,
  projectionHash,
  createStructuralDelta,
} = require("./canonical-structural-delta.cjs");
const { canonicalJsonBytes } = require("./session-replication-manifest.cjs");
const { STAGES } = require("./authority-stage-profiler.cjs");

const PAIR_SCHEMA = "lbh-authority-state-pair-v1";
const ACK_SCHEMA = "lbh-authority-state-pair-ack-v1";
const MIXED_PAIR_SCHEMA = "lbh-authority-state-pair-mixed-v1";
const MIXED_ACK_SCHEMA = "lbh-authority-state-pair-mixed-ack-v1";
const MAX_WIRE_PAIR_BYTES = 256 * 1024;
const DEFAULTS = Object.freeze({
  maxRecipients: 128,
  maxPendingPairsPerRecipient: 8,
  maxRetainedBytesPerRecipient: 2 * 1024 * 1024,
  maxPairBytes: 256 * 1024,
});

class AuthorityDeltaError extends Error {
  constructor(code, message) {
    super(message);
    this.name = "AuthorityDeltaError";
    this.code = code;
  }
}

function fail(code, message) {
  throw new AuthorityDeltaError(code, message);
}

function positiveInteger(value, fallback, label) {
  const result = value === undefined ? fallback : Number(value);
  if (!Number.isSafeInteger(result) || result <= 0) throw new TypeError(`${label} must be a positive integer`);
  return result;
}

function requiredString(value, label) {
  if (typeof value !== "string" || !value || value.length > 160 || value.trim() !== value) {
    fail("invalid-identity", `${label} must be a non-empty trimmed identifier`);
  }
  return value;
}

function normalizeIdentity(input) {
  if (!input || typeof input !== "object" || Array.isArray(input)) fail("invalid-identity", "identity is required");
  const identity = Object.freeze({
    matchId: requiredString(input.matchId, "matchId"),
    sessionId: requiredString(input.sessionId, "sessionId"),
    authorityIncarnation: input.authorityIncarnation,
    recipientId: requiredString(input.recipientId, "recipientId"),
    recipientIncarnation: input.recipientIncarnation,
  });
  if (!Number.isSafeInteger(identity.authorityIncarnation) || identity.authorityIncarnation < 1
    || !Number.isSafeInteger(identity.recipientIncarnation) || identity.recipientIncarnation < 1) {
    fail("invalid-identity", "authority and recipient incarnations must be positive safe integers");
  }
  return identity;
}

function recipientKey(identity) {
  return [identity.matchId, identity.sessionId, identity.authorityIncarnation,
    identity.recipientId, identity.recipientIncarnation].map((part) => `${String(part).length}:${part}`).join("");
}

function sameIdentity(a, b) {
  return a.matchId === b.matchId && a.sessionId === b.sessionId
    && a.authorityIncarnation === b.authorityIncarnation
    && a.recipientId === b.recipientId && a.recipientIncarnation === b.recipientIncarnation;
}

function assertProjectionPair(identity, publicView, ownerView) {
  if (publicView.lane !== "public" || ownerView.lane !== "owner") fail("lane-mismatch", "state pair requires public and owner lanes");
  for (const view of [publicView, ownerView]) {
    if (view.runId !== identity.matchId || view.authorityEpoch !== identity.authorityIncarnation
      || view.connectionEpoch !== identity.recipientIncarnation) {
      fail("lineage-mismatch", "projection lineage does not match match/recipient identity");
    }
  }
  for (const field of ["runId", "authorityEpoch", "connectionEpoch", "ballparkEpoch", "manifestHash",
    "statePairId", "snapshotId", "tick", "simTime", "eventWatermark", "fieldRevision", "overloadMode"]) {
    if (publicView[field] !== ownerView[field]) fail("non-atomic-pair", `public and owner ${field} must match`);
  }
}

function serializedBytes(value, stageProfiler, recipientKey) {
  if (!stageProfiler) return canonicalJsonBytes(value).length;
  return stageProfiler.measureSync(STAGES.JSON_SERIALIZATION, (bytes) => ({
    recipientKey,
    outputBytes: bytes.length,
    allocatedBytes: bytes.length,
  }), () => canonicalJsonBytes(value)).length;
}

function keyframePayload(view, { stageProfiler = null, recipientKey = null, lane } = {}) {
  const stage = lane === "owner" ? STAGES.OWNER_CANONICAL_HASH : STAGES.PUBLIC_CANONICAL_HASH;
  const resultHash = stageProfiler
    ? stageProfiler.measureSync(stage, (hashValue) => ({
        recipientKey,
        inputBytes: canonicalJsonBytes(view).length,
        outputBytes: Buffer.byteLength(hashValue || "", "utf8"),
        allocatedBytes: Buffer.byteLength(hashValue || "", "utf8"),
        entities: view.entities.length,
        components: view.entities.reduce((sum, entity) => sum + Object.keys(entity.components).length, 0),
      }), () => projectionHash(view))
    : projectionHash(view);
  return Object.freeze({
    kind: "keyframe",
    schema: view.schema,
    resultHash,
    projection: view,
  });
}

function deltaPayload(base, current, { stageProfiler = null, recipientKey = null, lane } = {}) {
  const stage = lane === "owner" ? STAGES.OWNER_DELTA_CANDIDATE : STAGES.PUBLIC_DELTA_CANDIDATE;
  const built = stageProfiler
    ? stageProfiler.measureSync(stage, (result) => ({
        recipientKey,
        inputBytes: canonicalJsonBytes({ base: base.view, current }).length,
        outputBytes: result?.deltaBytes || 0,
        allocatedBytes: result?.deltaBytes || 0,
        entities: current.entities.length,
        components: current.entities.reduce((sum, entity) => sum + Object.keys(entity.components).length, 0),
      }), () => createStructuralDelta(base.view, current, { expectedBaseHash: base.hash }))
    : createStructuralDelta(base.view, current, { expectedBaseHash: base.hash });
  const payload = Object.freeze({
    kind: "delta",
    schema: built.delta.schema,
    baseSnapshotId: base.view.snapshotId,
    baseHash: base.hash,
    resultHash: built.delta.resultHash,
    delta: built.delta,
  });
  const deltaBytes = serializedBytes(payload, stageProfiler, recipientKey);
  const keyframe = keyframePayload(current, { stageProfiler, recipientKey, lane });
  const keyframeBytes = serializedBytes(keyframe, stageProfiler, recipientKey);
  return Object.freeze({
    payload: deltaBytes < keyframeBytes ? payload : keyframe,
    decision: deltaBytes < keyframeBytes ? "delta" : "delta-not-smaller",
    deltaBytes,
    keyframeBytes,
  });
}

function pairProjectionKind(publicKind, ownerKind) {
  return publicKind === ownerKind ? publicKind : `public-${publicKind}+owner-${ownerKind}`;
}

function createAuthorityDeltaPublisher(options = {}) {
  const stageProfiler = options.stageProfiler || null;
  const limits = Object.freeze({
    maxRecipients: positiveInteger(options.maxRecipients, DEFAULTS.maxRecipients, "maxRecipients"),
    maxPendingPairsPerRecipient: positiveInteger(options.maxPendingPairsPerRecipient,
      DEFAULTS.maxPendingPairsPerRecipient, "maxPendingPairsPerRecipient"),
    maxRetainedBytesPerRecipient: positiveInteger(options.maxRetainedBytesPerRecipient,
      DEFAULTS.maxRetainedBytesPerRecipient, "maxRetainedBytesPerRecipient"),
    maxPairBytes: positiveInteger(options.maxPairBytes, DEFAULTS.maxPairBytes, "maxPairBytes"),
  });
  if (limits.maxRetainedBytesPerRecipient < limits.maxPairBytes) {
    throw new RangeError("maxRetainedBytesPerRecipient must retain at least one maxPairBytes frame");
  }
  if (limits.maxPairBytes > MAX_WIRE_PAIR_BYTES) {
    throw new RangeError(`maxPairBytes cannot exceed the ${MAX_WIRE_PAIR_BYTES}-byte wire frame limit`);
  }
  const recipients = new Map();
  const counters = { keyframes: 0, deltas: 0, mixed: 0, retransmits: 0, ackAccepted: 0, ackRejected: 0,
    ackBaseAdvances: 0, forcedRebases: 0 };
  const keyframeReasons = new Map();
  const candidates = {
    comparisons: 0,
    publicDeltaBytes: 0, publicKeyframeBytes: 0,
    ownerDeltaBytes: 0, ownerKeyframeBytes: 0,
  };

  function countReason(reason) {
    const normalized = String(reason || "unknown-keyframe-reason").slice(0, 160);
    keyframeReasons.set(normalized, (keyframeReasons.get(normalized) || 0) + 1);
  }

  function observeCandidate(lane, decision) {
    if (lane === "public") candidates.comparisons += 1;
    candidates[`${lane}DeltaBytes`] += decision.deltaBytes;
    candidates[`${lane}KeyframeBytes`] += decision.keyframeBytes;
  }

  function stateFor(identity, create = true) {
    const key = recipientKey(identity);
    let state = recipients.get(key);
    if (!state && create) {
      if (recipients.size >= limits.maxRecipients) fail("recipient-cap", "authority recipient cap reached");
      state = { identity, nextFrameId: 1, acked: null, pending: new Map(), retainedBytes: 0,
        forceKeyframe: true, forceReason: "initial-no-acked-base" };
      recipients.set(key, state);
    }
    return state;
  }

  function clearPending(state) {
    state.pending.clear();
    state.retainedBytes = 0;
  }

  function forceRebase(state, reason = "explicit-rebase") {
    state.acked = null;
    clearPending(state);
    state.forceKeyframe = true;
    state.forceReason = reason;
    counters.forcedRebases += 1;
  }

  function publish({ identity: rawIdentity, publicView: publicInput, ownerView: ownerInput,
    dirtyHints = null, allowMixed = false }) {
    const identity = normalizeIdentity(rawIdentity);
    const profile = { stageProfiler, recipientKey: identity.recipientId };
    const publicView = normalizeView(publicInput);
    const ownerView = normalizeView(ownerInput);
    assertProjectionPair(identity, publicView, ownerView);
    const state = stateFor(identity);
    const lineageChanged = state.acked && (
      state.acked.public.view.manifestHash !== publicView.manifestHash
      || state.acked.public.view.ballparkEpoch !== publicView.ballparkEpoch
      || state.acked.public.view.schema !== publicView.schema
      || state.acked.owner.view.schema !== ownerView.schema
    );
    if (lineageChanged) forceRebase(state, "lineage-changed");

    let publicPayload;
    let ownerPayload;
    let keyframeReason = null;
    let publicDecision = null;
    let ownerDecision = null;
    try {
      if (state.forceKeyframe || !state.acked) {
        publicPayload = keyframePayload(publicView, { ...profile, lane: "public" });
        ownerPayload = keyframePayload(ownerView, { ...profile, lane: "owner" });
        keyframeReason = state.forceReason || "missing-acked-base";
      } else {
        publicDecision = deltaPayload(state.acked.public, publicView, { ...profile, lane: "public" });
        ownerDecision = deltaPayload(state.acked.owner, ownerView, { ...profile, lane: "owner" });
        observeCandidate("public", publicDecision);
        observeCandidate("owner", ownerDecision);
        publicPayload = publicDecision.payload;
        ownerPayload = ownerDecision.payload;
        if (publicPayload.kind === "keyframe" || ownerPayload.kind === "keyframe") {
          keyframeReason = `candidate:${publicDecision.decision}+${ownerDecision.decision}`;
        }
      }
    } catch (error) {
      const code = String(error?.code || error?.name || "unknown").slice(0, 96);
      forceRebase(state, `semantic-fallback:${code}`);
      publicPayload = keyframePayload(publicView, { ...profile, lane: "public" });
      ownerPayload = keyframePayload(ownerView, { ...profile, lane: "owner" });
      keyframeReason = state.forceReason;
    }
    // Legacy state-pair-v1 recipients retain the original same-kind contract.
    if (!allowMixed && publicPayload.kind !== ownerPayload.kind) {
      keyframeReason = `atomic-kind-alignment:public-${publicDecision?.decision || publicPayload.kind}+owner-${ownerDecision?.decision || ownerPayload.kind}`;
      publicPayload = keyframePayload(publicView, { ...profile, lane: "public" });
      ownerPayload = keyframePayload(ownerView, { ...profile, lane: "owner" });
    }
    const frameId = state.nextFrameId;
    const pairSchema = allowMixed ? MIXED_PAIR_SCHEMA : PAIR_SCHEMA;
    const rawBuildFrame = (nextPublic, nextOwner) => Object.freeze({
      type: "statePair",
      pairSchema,
      matchId: identity.matchId,
      sessionId: identity.sessionId,
      authorityIncarnation: identity.authorityIncarnation,
      recipientId: identity.recipientId,
      recipientIncarnation: identity.recipientIncarnation,
      frameId,
      statePairId: publicView.statePairId,
      snapshotId: publicView.snapshotId,
      tick: publicView.tick,
      simTime: publicView.simTime,
      eventWatermark: publicView.eventWatermark,
      fieldRevision: publicView.fieldRevision,
      overloadMode: publicView.overloadMode,
      ballparkEpoch: publicView.ballparkEpoch,
      manifestHash: publicView.manifestHash,
      public: nextPublic,
      owner: nextOwner,
    });
    const buildFrame = (nextPublic, nextOwner) => stageProfiler
      ? stageProfiler.measureSync(STAGES.PAIR_ENVELOPE, (builtFrame) => ({
          recipientKey: identity.recipientId,
          inputBytes: canonicalJsonBytes({ public: nextPublic, owner: nextOwner }).length,
          outputBytes: canonicalJsonBytes(builtFrame).length,
          allocatedBytes: canonicalJsonBytes(builtFrame).length,
        }), () => rawBuildFrame(nextPublic, nextOwner))
      : rawBuildFrame(nextPublic, nextOwner);
    let frame = buildFrame(publicPayload, ownerPayload);
    let bytes = serializedBytes(frame, stageProfiler, identity.recipientId);
    const fullKeyframe = buildFrame(
      keyframePayload(publicView, { ...profile, lane: "public" }),
      keyframePayload(ownerView, { ...profile, lane: "owner" }),
    );
    const fullKeyframeBytes = serializedBytes(fullKeyframe, stageProfiler, identity.recipientId);
    const candidateBytes = bytes;
    const choosePair = () => {
      if (allowMixed && (publicPayload.kind !== "keyframe" || ownerPayload.kind !== "keyframe")
          && (bytes >= fullKeyframeBytes || bytes > limits.maxPairBytes)) {
        keyframeReason = bytes >= fullKeyframeBytes ? "pair-not-smaller" : "pair-limit-fallback";
        publicPayload = fullKeyframe.public;
        ownerPayload = fullKeyframe.owner;
        frame = fullKeyframe;
        bytes = fullKeyframeBytes;
      }
    };
    if (stageProfiler) stageProfiler.measureSync(STAGES.PAIR_CHOICE, () => ({
      recipientKey: identity.recipientId,
      inputBytes: candidateBytes + fullKeyframeBytes,
      outputBytes: bytes,
    }), choosePair);
    else choosePair();
    if (bytes > limits.maxPairBytes) {
      forceRebase(state);
      fail("pair-too-large", `atomic state pair exceeds ${limits.maxPairBytes} bytes`);
    }
    state.nextFrameId += 1;
    const record = Object.freeze({
      frame,
      bytes,
      public: Object.freeze({ view: publicView, hash: publicPayload.resultHash }),
      owner: Object.freeze({ view: ownerView, hash: ownerPayload.resultHash }),
    });
    state.pending.set(frame.frameId, record);
    state.retainedBytes += bytes;
    state.forceKeyframe = false;
    state.forceReason = null;
    const laneKinds = pairProjectionKind(publicPayload.kind, ownerPayload.kind);
    const counter = publicPayload.kind === "delta" && ownerPayload.kind === "delta"
      ? "deltas" : publicPayload.kind === "keyframe" && ownerPayload.kind === "keyframe"
        ? "keyframes" : "mixed";
    counters[counter] += 1;
    if (publicPayload.kind === "keyframe" && ownerPayload.kind === "keyframe") countReason(keyframeReason);
    while (state.pending.size > limits.maxPendingPairsPerRecipient
      || state.retainedBytes > limits.maxRetainedBytesPerRecipient) {
      const oldestId = state.pending.keys().next().value;
      const oldest = state.pending.get(oldestId);
      state.pending.delete(oldestId);
      state.retainedBytes -= oldest.bytes;
      state.forceKeyframe = true;
      state.forceReason = "retention-evicted-acked-base-unsafe";
    }
    return Object.freeze({ frame, bytes,
      projectionKind: publicPayload.kind === ownerPayload.kind ? publicPayload.kind : laneKinds,
      publicKind: publicPayload.kind, ownerKind: ownerPayload.kind, fullKeyframeBytes });
  }

  function acknowledge(rawIdentity, ack) {
    const identity = normalizeIdentity(rawIdentity);
    const state = stateFor(identity, false);
    const reject = (reason) => {
      counters.ackRejected += 1;
      if (state) {
        state.forceKeyframe = true;
        state.forceReason = `ack-rejected:${reason}`;
      }
      return Object.freeze({ accepted: false, reason });
    };
    if (!state || !ack || typeof ack !== "object" || Array.isArray(ack)) return reject("unknown-recipient");
    if (!sameIdentity(identity, ack)) return reject("identity-mismatch");
    if (!Number.isSafeInteger(ack.frameId) || ack.frameId < 1) return reject("invalid-frame-id");
    const record = state.pending.get(ack.frameId);
    if (!record) return reject("unknown-frame");
    const mixed = record.frame.pairSchema === MIXED_PAIR_SCHEMA;
    const ackKeys = new Set(["type", "ackKind", "ackSchema", "matchId", "sessionId", "authorityIncarnation",
      "recipientId", "recipientIncarnation", "frameId", "statePairId", "snapshotId", "publicHash", "ownerHash",
      ...(mixed ? ["pairSchema", "tick", "simTime", "eventWatermark", "fieldRevision", "overloadMode",
        "ballparkEpoch", "manifestHash", "publicKind", "ownerKind", "publicBaseSnapshotId", "ownerBaseSnapshotId"] : [])]);
    if (Object.keys(ack).some((key) => !ackKeys.has(key)) || ack.type !== "ack"
      || ack.ackKind !== "statePair" || ack.ackSchema !== (mixed ? MIXED_ACK_SCHEMA : ACK_SCHEMA)) return reject("invalid-ack-schema");
    if (ack.statePairId !== record.frame.statePairId || ack.snapshotId !== record.frame.snapshotId
      || ack.publicHash !== record.public.hash || ack.ownerHash !== record.owner.hash) return reject("lineage-mismatch");
    if (mixed && ["authorityIncarnation", "recipientIncarnation", "frameId", "tick", "simTime",
      "eventWatermark", "fieldRevision", "ballparkEpoch"].some((key) => Object.is(ack[key], -0))) {
      return reject("lineage-mismatch");
    }
    if (mixed && (ack.publicKind !== record.frame.public.kind || ack.ownerKind !== record.frame.owner.kind
      || ack.publicBaseSnapshotId !== (record.frame.public.baseSnapshotId || null)
      || ack.ownerBaseSnapshotId !== (record.frame.owner.baseSnapshotId || null)
      || ack.pairSchema !== record.frame.pairSchema || ack.tick !== record.frame.tick
      || ack.simTime !== record.frame.simTime || ack.eventWatermark !== record.frame.eventWatermark
      || ack.fieldRevision !== record.frame.fieldRevision || ack.overloadMode !== record.frame.overloadMode
      || ack.ballparkEpoch !== record.frame.ballparkEpoch
      || ack.manifestHash !== record.frame.manifestHash)) return reject("lineage-mismatch");
    state.acked = Object.freeze({ public: record.public, owner: record.owner, frameId: ack.frameId });
    for (const [frameId, pending] of state.pending) {
      if (frameId > ack.frameId) continue;
      state.pending.delete(frameId);
      state.retainedBytes -= pending.bytes;
    }
    state.forceKeyframe = false;
    state.forceReason = null;
    counters.ackAccepted += 1;
    counters.ackBaseAdvances += 1;
    return Object.freeze({ accepted: true, frameId: ack.frameId });
  }

  function retransmit(rawIdentity, frameId) {
    const identity = normalizeIdentity(rawIdentity);
    const record = stateFor(identity, false)?.pending.get(frameId);
    if (!record) return null;
    counters.retransmits += 1;
    return Object.freeze({ frame: record.frame, bytes: record.bytes,
      projectionKind: record.frame.public.kind === record.frame.owner.kind
        ? record.frame.public.kind : pairProjectionKind(record.frame.public.kind, record.frame.owner.kind) });
  }

  function rebase(rawIdentity) {
    const identity = normalizeIdentity(rawIdentity);
    const state = stateFor(identity, false);
    if (state) forceRebase(state, "client-recovery-request");
  }

  function disconnect(rawIdentity) {
    const identity = normalizeIdentity(rawIdentity);
    recipients.delete(recipientKey(identity));
  }

  function diagnostics() {
    let pendingPairs = 0;
    let retainedBytes = 0;
    for (const state of recipients.values()) {
      pendingPairs += state.pending.size;
      retainedBytes += state.retainedBytes;
    }
    let recipientsWithAckedBase = 0;
    let maxAckedFrameId = 0;
    for (const state of recipients.values()) {
      if (!state.acked) continue;
      recipientsWithAckedBase += 1;
      maxAckedFrameId = Math.max(maxAckedFrameId, state.acked.frameId);
    }
    const candidateAverages = Object.freeze({
      comparisons: candidates.comparisons,
      publicDeltaBytes: candidates.comparisons ? candidates.publicDeltaBytes / candidates.comparisons : null,
      publicKeyframeBytes: candidates.comparisons ? candidates.publicKeyframeBytes / candidates.comparisons : null,
      ownerDeltaBytes: candidates.comparisons ? candidates.ownerDeltaBytes / candidates.comparisons : null,
      ownerKeyframeBytes: candidates.comparisons ? candidates.ownerKeyframeBytes / candidates.comparisons : null,
    });
    return Object.freeze({ recipients: recipients.size, pendingPairs, retainedBytes, ...counters,
      recipientsWithAckedBase, maxAckedFrameId,
      keyframeReasons: Object.freeze(Object.fromEntries([...keyframeReasons].sort(([a], [b]) => a.localeCompare(b)))),
      candidateAverageBytes: candidateAverages, limits });
  }

  return Object.freeze({ publish, acknowledge, retransmit, rebase, disconnect, diagnostics });
}

module.exports = {
  PAIR_SCHEMA,
  ACK_SCHEMA,
  MIXED_PAIR_SCHEMA,
  MIXED_ACK_SCHEMA,
  MAX_WIRE_PAIR_BYTES,
  DEFAULTS,
  AuthorityDeltaError,
  createAuthorityDeltaPublisher,
};
