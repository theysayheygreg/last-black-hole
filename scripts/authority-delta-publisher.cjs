"use strict";

const {
  normalizeView,
  projectionHash,
  createStructuralDelta,
} = require("./canonical-structural-delta.cjs");
const { canonicalJsonBytes } = require("./session-replication-manifest.cjs");

const PAIR_SCHEMA = "lbh-authority-state-pair-v1";
const ACK_SCHEMA = "lbh-authority-state-pair-ack-v1";
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

function keyframePayload(view) {
  return Object.freeze({
    kind: "keyframe",
    schema: view.schema,
    resultHash: projectionHash(view),
    projection: view,
  });
}

function deltaPayload(base, current) {
  const built = createStructuralDelta(base.view, current, { expectedBaseHash: base.hash });
  const payload = Object.freeze({
    kind: "delta",
    schema: built.delta.schema,
    baseSnapshotId: base.view.snapshotId,
    baseHash: base.hash,
    resultHash: built.delta.resultHash,
    delta: built.delta,
  });
  return canonicalJsonBytes(payload).length < canonicalJsonBytes(keyframePayload(current)).length
    ? payload : keyframePayload(current);
}

function createAuthorityDeltaPublisher(options = {}) {
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
  const counters = { keyframes: 0, deltas: 0, retransmits: 0, ackAccepted: 0, ackRejected: 0, forcedRebases: 0 };

  function stateFor(identity, create = true) {
    const key = recipientKey(identity);
    let state = recipients.get(key);
    if (!state && create) {
      if (recipients.size >= limits.maxRecipients) fail("recipient-cap", "authority recipient cap reached");
      state = { identity, nextFrameId: 1, acked: null, pending: new Map(), retainedBytes: 0, forceKeyframe: true };
      recipients.set(key, state);
    }
    return state;
  }

  function clearPending(state) {
    state.pending.clear();
    state.retainedBytes = 0;
  }

  function forceRebase(state) {
    state.acked = null;
    clearPending(state);
    state.forceKeyframe = true;
    counters.forcedRebases += 1;
  }

  function publish({ identity: rawIdentity, publicView: publicInput, ownerView: ownerInput, dirtyHints = null }) {
    const identity = normalizeIdentity(rawIdentity);
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
    if (lineageChanged) forceRebase(state);

    let publicPayload;
    let ownerPayload;
    try {
      publicPayload = state.forceKeyframe || !state.acked
        ? keyframePayload(publicView) : deltaPayload(state.acked.public, publicView, dirtyHints);
      ownerPayload = state.forceKeyframe || !state.acked
        ? keyframePayload(ownerView) : deltaPayload(state.acked.owner, ownerView, dirtyHints);
    } catch {
      forceRebase(state);
      publicPayload = keyframePayload(publicView);
      ownerPayload = keyframePayload(ownerView);
    }
    // A pair is one transaction. If either lane cannot delta safely, both lanes rebase.
    if (publicPayload.kind !== ownerPayload.kind) {
      publicPayload = keyframePayload(publicView);
      ownerPayload = keyframePayload(ownerView);
    }
    const frame = Object.freeze({
      type: "statePair",
      pairSchema: PAIR_SCHEMA,
      matchId: identity.matchId,
      sessionId: identity.sessionId,
      authorityIncarnation: identity.authorityIncarnation,
      recipientId: identity.recipientId,
      recipientIncarnation: identity.recipientIncarnation,
      frameId: state.nextFrameId++,
      statePairId: publicView.statePairId,
      snapshotId: publicView.snapshotId,
      tick: publicView.tick,
      simTime: publicView.simTime,
      eventWatermark: publicView.eventWatermark,
      fieldRevision: publicView.fieldRevision,
      overloadMode: publicView.overloadMode,
      ballparkEpoch: publicView.ballparkEpoch,
      manifestHash: publicView.manifestHash,
      public: publicPayload,
      owner: ownerPayload,
    });
    const bytes = canonicalJsonBytes(frame).length;
    if (bytes > limits.maxPairBytes) {
      forceRebase(state);
      fail("pair-too-large", `atomic state pair exceeds ${limits.maxPairBytes} bytes`);
    }
    const record = Object.freeze({
      frame,
      bytes,
      public: Object.freeze({ view: publicView, hash: publicPayload.resultHash }),
      owner: Object.freeze({ view: ownerView, hash: ownerPayload.resultHash }),
    });
    state.pending.set(frame.frameId, record);
    state.retainedBytes += bytes;
    state.forceKeyframe = false;
    counters[publicPayload.kind === "delta" ? "deltas" : "keyframes"] += 1;
    while (state.pending.size > limits.maxPendingPairsPerRecipient
      || state.retainedBytes > limits.maxRetainedBytesPerRecipient) {
      const oldestId = state.pending.keys().next().value;
      const oldest = state.pending.get(oldestId);
      state.pending.delete(oldestId);
      state.retainedBytes -= oldest.bytes;
      state.forceKeyframe = true;
    }
    return Object.freeze({ frame, bytes, projectionKind: publicPayload.kind });
  }

  function acknowledge(rawIdentity, ack) {
    const identity = normalizeIdentity(rawIdentity);
    const state = stateFor(identity, false);
    const reject = (reason) => {
      counters.ackRejected += 1;
      if (state) state.forceKeyframe = true;
      return Object.freeze({ accepted: false, reason });
    };
    if (!state || !ack || typeof ack !== "object" || Array.isArray(ack)) return reject("unknown-recipient");
    const ackKeys = new Set(["type", "ackKind", "ackSchema", "matchId", "sessionId", "authorityIncarnation",
      "recipientId", "recipientIncarnation", "frameId", "statePairId", "snapshotId", "publicHash", "ownerHash"]);
    if (Object.keys(ack).some((key) => !ackKeys.has(key)) || ack.type !== "ack"
      || ack.ackKind !== "statePair" || ack.ackSchema !== ACK_SCHEMA) return reject("invalid-ack-schema");
    if (!sameIdentity(identity, ack)) return reject("identity-mismatch");
    if (!Number.isSafeInteger(ack.frameId) || ack.frameId < 1) return reject("invalid-frame-id");
    const record = state.pending.get(ack.frameId);
    if (!record) return reject("unknown-frame");
    if (ack.statePairId !== record.frame.statePairId || ack.snapshotId !== record.frame.snapshotId
      || ack.publicHash !== record.public.hash || ack.ownerHash !== record.owner.hash) return reject("lineage-mismatch");
    state.acked = Object.freeze({ public: record.public, owner: record.owner, frameId: ack.frameId });
    for (const [frameId, pending] of state.pending) {
      if (frameId > ack.frameId) continue;
      state.pending.delete(frameId);
      state.retainedBytes -= pending.bytes;
    }
    state.forceKeyframe = false;
    counters.ackAccepted += 1;
    return Object.freeze({ accepted: true, frameId: ack.frameId });
  }

  function retransmit(rawIdentity, frameId) {
    const identity = normalizeIdentity(rawIdentity);
    const record = stateFor(identity, false)?.pending.get(frameId);
    if (!record) return null;
    counters.retransmits += 1;
    return Object.freeze({ frame: record.frame, bytes: record.bytes, projectionKind: record.frame.public.kind });
  }

  function rebase(rawIdentity) {
    const identity = normalizeIdentity(rawIdentity);
    const state = stateFor(identity, false);
    if (state) forceRebase(state);
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
    return Object.freeze({ recipients: recipients.size, pendingPairs, retainedBytes, ...counters, limits });
  }

  return Object.freeze({ publish, acknowledge, retransmit, rebase, disconnect, diagnostics });
}

module.exports = {
  PAIR_SCHEMA,
  ACK_SCHEMA,
  MAX_WIRE_PAIR_BYTES,
  DEFAULTS,
  AuthorityDeltaError,
  createAuthorityDeltaPublisher,
};
