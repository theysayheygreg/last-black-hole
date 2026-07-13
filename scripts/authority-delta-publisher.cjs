"use strict";

const {
  normalizeView,
  projectionHash,
  prepareProjection,
  preparedProjectionView,
  preparedProjectionHash,
  createPreparedStructuralDelta,
  createStructuralDelta,
} = require("./canonical-structural-delta.cjs");
const { canonicalJsonBytes } = require("./session-replication-manifest.cjs");
const { STAGES } = require("./authority-stage-profiler.cjs");

const PAIR_SCHEMA = "lbh-authority-state-pair-v1";
const ACK_SCHEMA = "lbh-authority-state-pair-ack-v1";
const MIXED_PAIR_SCHEMA = "lbh-authority-state-pair-mixed-v1";
const MIXED_ACK_SCHEMA = "lbh-authority-state-pair-mixed-ack-v1";
const MAX_WIRE_PAIR_BYTES = 256 * 1024;
const ACK_REJECT_REASON_CODES = new Set(["unknown-recipient", "identity-mismatch", "invalid-frame-id",
  "unknown-frame", "invalid-ack-schema", "lineage-mismatch", "unexpected-state-pair-ack", "unknown"]);
const ACK_REJECT_RELATIONS = new Set(["duplicate", "stale", "future", "unknown", "pending-missing", "hash",
  "binding", "recovery-race"]);
const DEFAULTS = Object.freeze({
  maxRecipients: 128,
  // Match the client base ledger so an ACK delayed by the eight-seat local
  // apply loop can still be authenticated before either side evicts its base.
  maxPendingPairsPerRecipient: 12,
  maxRetiredAckProofsPerRecipient: 64,
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
    serializedAllocationProxyBytes: bytes.length,
  }), () => canonicalJsonBytes(value)).length;
}

function keyframePayload(view, { stageProfiler = null, recipientKey = null, lane,
  prepared = null, preparedContext = null, operationCounters = null } = {}) {
  const stage = lane === "owner" ? STAGES.OWNER_CANONICAL_HASH : STAGES.PUBLIC_CANONICAL_HASH;
  const computeHash = () => {
    if (prepared) {
      if (operationCounters) operationCounters.preparedHashHits += 1;
      return preparedProjectionHash(prepared, preparedContext);
    }
    if (operationCounters) {
      operationCounters.canonicalizations += 1;
      operationCounters.hashes += 1;
    }
    return projectionHash(view);
  };
  const resultHash = stageProfiler
    ? stageProfiler.measureSync(stage, (hashValue) => ({
        recipientKey,
        inputBytes: canonicalJsonBytes(view).length,
        outputBytes: Buffer.byteLength(hashValue || "", "utf8"),
        serializedAllocationProxyBytes: Buffer.byteLength(hashValue || "", "utf8"),
        entities: view.entities.length,
        components: view.entities.reduce((sum, entity) => sum + Object.keys(entity.components).length, 0),
      }), computeHash)
    : computeHash();
  return Object.freeze({
    kind: "keyframe",
    schema: view.schema,
    resultHash,
    projection: view,
  });
}

function deltaPayload(base, current, { stageProfiler = null, recipientKey = null, lane,
  prepared = null, preparedContext = null, operationCounters = null } = {}) {
  const stage = lane === "owner" ? STAGES.OWNER_DELTA_CANDIDATE : STAGES.PUBLIC_DELTA_CANDIDATE;
  const buildDelta = () => {
    if (operationCounters) operationCounters.diffs += 1;
    if (base.prepared && prepared) {
      if (operationCounters) operationCounters.preparedDiffs += 1;
      return createPreparedStructuralDelta(base.prepared, prepared, {
        baseContext: base.context,
        currentContext: preparedContext,
        expectedBaseHash: base.hash,
      });
    }
    if (operationCounters) {
      operationCounters.canonicalizations += 2;
      operationCounters.hashes += 2;
    }
    return createStructuralDelta(base.view, current, { expectedBaseHash: base.hash });
  };
  const built = stageProfiler
    ? stageProfiler.measureSync(stage, (result) => ({
        recipientKey,
        inputBytes: canonicalJsonBytes({ base: base.view, current }).length,
        outputBytes: result?.deltaBytes || 0,
        serializedAllocationProxyBytes: result?.deltaBytes || 0,
        entities: current.entities.length,
        components: current.entities.reduce((sum, entity) => sum + Object.keys(entity.components).length, 0),
      }), buildDelta)
    : buildDelta();
  const payload = Object.freeze({
    kind: "delta",
    schema: built.delta.schema,
    baseSnapshotId: base.view.snapshotId,
    baseHash: base.hash,
    resultHash: built.delta.resultHash,
    delta: built.delta,
  });
  const deltaBytes = serializedBytes(payload, stageProfiler, recipientKey);
  const keyframe = keyframePayload(current, { stageProfiler, recipientKey, lane,
    prepared, preparedContext, operationCounters });
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
  const preparedProjectionsEnabled = options.preparedProjections !== false;
  const ackRejectDiagnosticsEnabled = options.ackRejectDiagnostics === true;
  const limits = Object.freeze({
    maxRecipients: positiveInteger(options.maxRecipients, DEFAULTS.maxRecipients, "maxRecipients"),
    maxPendingPairsPerRecipient: positiveInteger(options.maxPendingPairsPerRecipient,
      DEFAULTS.maxPendingPairsPerRecipient, "maxPendingPairsPerRecipient"),
    maxRetiredAckProofsPerRecipient: positiveInteger(options.maxRetiredAckProofsPerRecipient,
      DEFAULTS.maxRetiredAckProofsPerRecipient, "maxRetiredAckProofsPerRecipient"),
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
    ackBaseAdvances: 0, ackRecipientsWithBaseAdvance: 0,
    ackDuplicates: 0, ackIgnoredStale: 0, forcedRebases: 0 };
  const keyframeReasons = new Map();
  const candidates = {
    comparisons: 0,
    publicDeltaBytes: 0, publicKeyframeBytes: 0,
    ownerDeltaBytes: 0, ownerKeyframeBytes: 0,
  };
  const operationCounters = {
    canonicalizations: 0, hashes: 0, diffs: 0, preparations: 0,
    preparedHashHits: 0, preparedDiffs: 0, suppliedPreparedHits: 0,
  };
  const ackRejectDiagnostics = {
    total: 0,
    byReason: new Map(),
    byRelation: new Map(),
    orderTransitions: new Map(),
    lastRelation: null,
  };

  function classifyAckReject(reason, state, ack) {
    if (reason === "unknown-recipient" || reason === "identity-mismatch") return "binding";
    if (reason === "invalid-ack-schema" || reason === "invalid-frame-id") return "unknown";
    if (reason === "lineage-mismatch") {
      const record = state && Number.isSafeInteger(ack?.frameId)
        ? state.pending.get(ack.frameId) || state.retiredAcks.get(ack.frameId) : null;
      if (record && (ack.publicHash !== record.public.hash || ack.ownerHash !== record.owner.hash)) return "hash";
      return "unknown";
    }
    if (!state || !Number.isSafeInteger(ack?.frameId)) return "unknown";
    if (state.acked && ack.frameId === state.acked.frameId) return "duplicate";
    if (state.acked && ack.frameId < state.acked.frameId) return "stale";
    if (ack.frameId >= state.nextFrameId) return "future";
    if (state.forceKeyframe && /recovery|rebase|lineage-changed/.test(String(state.forceReason || ""))) {
      return "recovery-race";
    }
    return "pending-missing";
  }

  function observeAckReject(reason, relation) {
    if (!ackRejectDiagnosticsEnabled) return;
    const boundedReason = ACK_REJECT_REASON_CODES.has(reason) ? reason : "unknown";
    const boundedRelation = ACK_REJECT_RELATIONS.has(relation) ? relation : "unknown";
    ackRejectDiagnostics.total += 1;
    ackRejectDiagnostics.byReason.set(boundedReason, (ackRejectDiagnostics.byReason.get(boundedReason) || 0) + 1);
    ackRejectDiagnostics.byRelation.set(boundedRelation,
      (ackRejectDiagnostics.byRelation.get(boundedRelation) || 0) + 1);
    if (ackRejectDiagnostics.lastRelation !== null) {
      const transition = `${ackRejectDiagnostics.lastRelation}->${boundedRelation}`;
      ackRejectDiagnostics.orderTransitions.set(transition,
        (ackRejectDiagnostics.orderTransitions.get(transition) || 0) + 1);
    }
    ackRejectDiagnostics.lastRelation = boundedRelation;
  }

  function preparationContext(identity, view, lane) {
    return Object.freeze({
      schema: view.schema,
      manifestHash: view.manifestHash,
      matchId: identity.matchId,
      sessionId: identity.sessionId,
      authorityIncarnation: identity.authorityIncarnation,
      recipientId: identity.recipientId,
      recipientIncarnation: identity.recipientIncarnation,
      lane,
      statePairId: view.statePairId,
      snapshotId: view.snapshotId,
      tick: view.tick,
    });
  }

  function prepareCurrent(identity, input, supplied, lane) {
    if (!input || typeof input !== "object" || Array.isArray(input)) {
      // Preserve the canonical validator's structured fail-closed error instead
      // of dereferencing malformed source input while building cache identity.
      normalizeView(input);
    }
    if (!preparedProjectionsEnabled) {
      operationCounters.canonicalizations += 1;
      return Object.freeze({ view: normalizeView(input), prepared: null, context: null });
    }
    const context = preparationContext(identity, input, lane);
    const prepared = supplied || prepareProjection(input, context);
    if (supplied) operationCounters.suppliedPreparedHits += 1;
    else {
      operationCounters.preparations += 1;
      operationCounters.canonicalizations += 1;
      operationCounters.hashes += 1;
    }
    const view = preparedProjectionView(prepared, context);
    if (supplied && view !== input) {
      fail("prepared-input-mismatch", "supplied prepared projection must serve its exact normalized view");
    }
    return Object.freeze({ view, prepared, context });
  }

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
      state = { identity, nextFrameId: 1, acked: null, pending: new Map(), retiredAcks: new Map(), retainedBytes: 0,
        hasBaseAdvanced: false,
        forceKeyframe: true, forceReason: "initial-no-acked-base" };
      recipients.set(key, state);
    }
    return state;
  }

  function ackProof(record) {
    const frame = record.frame;
    return Object.freeze({
      frame: Object.freeze({ statePairId: frame.statePairId, snapshotId: frame.snapshotId,
        pairSchema: frame.pairSchema, tick: frame.tick, simTime: frame.simTime,
        eventWatermark: frame.eventWatermark, fieldRevision: frame.fieldRevision,
        overloadMode: frame.overloadMode, ballparkEpoch: frame.ballparkEpoch,
        manifestHash: frame.manifestHash,
        public: Object.freeze({ kind: frame.public.kind, baseSnapshotId: frame.public.baseSnapshotId }),
        owner: Object.freeze({ kind: frame.owner.kind, baseSnapshotId: frame.owner.baseSnapshotId }) }),
      public: Object.freeze({ hash: record.public.hash }),
      owner: Object.freeze({ hash: record.owner.hash }),
    });
  }

  function retireAckProof(state, frameId, record) {
    state.retiredAcks.set(frameId, ackProof(record));
    while (state.retiredAcks.size > limits.maxRetiredAckProofsPerRecipient) {
      state.retiredAcks.delete(state.retiredAcks.keys().next().value);
    }
  }

  function clearPending(state) {
    for (const [frameId, record] of state.pending) retireAckProof(state, frameId, record);
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
    publicPrepared: suppliedPublicPrepared = null, ownerPrepared: suppliedOwnerPrepared = null,
    dirtyHints = null, allowMixed = false, wireSize = null }) {
    const identity = normalizeIdentity(rawIdentity);
    const profile = { stageProfiler, recipientKey: identity.recipientId };
    const preparedPublic = prepareCurrent(identity, publicInput, suppliedPublicPrepared, "public");
    const preparedOwner = prepareCurrent(identity, ownerInput, suppliedOwnerPrepared, "owner");
    const { view: publicView } = preparedPublic;
    const { view: ownerView } = preparedOwner;
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
        publicPayload = keyframePayload(publicView, { ...profile, lane: "public",
          prepared: preparedPublic.prepared, preparedContext: preparedPublic.context, operationCounters });
        ownerPayload = keyframePayload(ownerView, { ...profile, lane: "owner",
          prepared: preparedOwner.prepared, preparedContext: preparedOwner.context, operationCounters });
        keyframeReason = state.forceReason || "missing-acked-base";
      } else {
        publicDecision = deltaPayload(state.acked.public, publicView, { ...profile, lane: "public",
          prepared: preparedPublic.prepared, preparedContext: preparedPublic.context, operationCounters });
        ownerDecision = deltaPayload(state.acked.owner, ownerView, { ...profile, lane: "owner",
          prepared: preparedOwner.prepared, preparedContext: preparedOwner.context, operationCounters });
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
      publicPayload = keyframePayload(publicView, { ...profile, lane: "public",
        prepared: preparedPublic.prepared, preparedContext: preparedPublic.context, operationCounters });
      ownerPayload = keyframePayload(ownerView, { ...profile, lane: "owner",
        prepared: preparedOwner.prepared, preparedContext: preparedOwner.context, operationCounters });
      keyframeReason = state.forceReason;
    }
    // Legacy state-pair-v1 recipients retain the original same-kind contract.
    if (!allowMixed && publicPayload.kind !== ownerPayload.kind) {
      keyframeReason = `atomic-kind-alignment:public-${publicDecision?.decision || publicPayload.kind}+owner-${ownerDecision?.decision || ownerPayload.kind}`;
      publicPayload = keyframePayload(publicView, { ...profile, lane: "public",
        prepared: preparedPublic.prepared, preparedContext: preparedPublic.context, operationCounters });
      ownerPayload = keyframePayload(ownerView, { ...profile, lane: "owner",
        prepared: preparedOwner.prepared, preparedContext: preparedOwner.context, operationCounters });
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
          serializedAllocationProxyBytes: canonicalJsonBytes(builtFrame).length,
        }), () => rawBuildFrame(nextPublic, nextOwner))
      : rawBuildFrame(nextPublic, nextOwner);
    let frame = buildFrame(publicPayload, ownerPayload);
    if (wireSize !== null && typeof wireSize !== "function") fail("invalid-wire-size", "wireSize must be a function");
    const measureWire = (candidate) => {
      const measured = wireSize ? wireSize(candidate) : serializedBytes(candidate, stageProfiler, identity.recipientId);
      if (!Number.isSafeInteger(measured) || measured < 1 || measured > MAX_WIRE_PAIR_BYTES) {
        fail("invalid-wire-size", "wireSize returned an invalid encoded byte count");
      }
      return measured;
    };
    let bytes = measureWire(frame);
    const fullKeyframe = buildFrame(
      keyframePayload(publicView, { ...profile, lane: "public",
        prepared: preparedPublic.prepared, preparedContext: preparedPublic.context, operationCounters }),
      keyframePayload(ownerView, { ...profile, lane: "owner",
        prepared: preparedOwner.prepared, preparedContext: preparedOwner.context, operationCounters }),
    );
    const fullKeyframeBytes = measureWire(fullKeyframe);
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
      public: Object.freeze({ view: publicView, hash: publicPayload.resultHash,
        prepared: preparedPublic.prepared, context: preparedPublic.context }),
      owner: Object.freeze({ view: ownerView, hash: ownerPayload.resultHash,
        prepared: preparedOwner.prepared, context: preparedOwner.context }),
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
      retireAckProof(state, oldestId, oldest);
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
      const relation = classifyAckReject(reason, state, ack);
      observeAckReject(reason, relation);
      if (state) {
        state.forceKeyframe = true;
        state.forceReason = `ack-rejected:${reason}`;
      }
      return Object.freeze({ accepted: false, reason,
        ...(ackRejectDiagnosticsEnabled ? { diagnostic: Object.freeze({ relation }) } : {}) });
    };
    if (!state || !ack || typeof ack !== "object" || Array.isArray(ack)) return reject("unknown-recipient");
    if (!sameIdentity(identity, ack)) return reject("identity-mismatch");
    if (!Number.isSafeInteger(ack.frameId) || ack.frameId < 1) return reject("invalid-frame-id");
    if (state.acked && ack.frameId < state.acked.frameId) {
      // ACKs are cumulative. A delayed older ACK for the same exact binding
      // cannot move the authority base backward and is therefore an
      // idempotent no-op rather than a recovery-triggering protocol error.
      const staleMixed = ack.ackSchema === MIXED_ACK_SCHEMA;
      const staleKeys = new Set(["type", "ackKind", "ackSchema", "matchId", "sessionId",
        "authorityIncarnation", "recipientId", "recipientIncarnation", "frameId", "statePairId",
        "snapshotId", "publicHash", "ownerHash", ...(staleMixed ? ["pairSchema", "tick", "simTime",
          "eventWatermark", "fieldRevision", "overloadMode", "ballparkEpoch", "manifestHash",
          "publicKind", "ownerKind", "publicBaseSnapshotId", "ownerBaseSnapshotId"] : [])]);
      if (Object.keys(ack).some((key) => !staleKeys.has(key))
          || [...staleKeys].some((key) => !Object.hasOwn(ack, key))
          || ack.type !== "ack" || ack.ackKind !== "statePair"
          || (ack.ackSchema !== ACK_SCHEMA && ack.ackSchema !== MIXED_ACK_SCHEMA)) {
        return reject("invalid-ack-schema");
      }
      counters.ackIgnoredStale += 1;
      return Object.freeze({ accepted: true, validated: false, frameId: state.acked.frameId, stale: true });
    }
    const ackedDuplicate = state.acked && ack.frameId === state.acked.frameId;
    const retired = !ackedDuplicate && !state.pending.has(ack.frameId)
      ? state.retiredAcks.get(ack.frameId) : null;
    const record = ackedDuplicate ? state.acked.record : state.pending.get(ack.frameId) || retired;
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
    if (retired) {
      counters.ackAccepted += 1;
      counters.ackIgnoredStale += 1;
      return Object.freeze({ accepted: true, validated: true, frameId: ack.frameId,
        stale: true, retired: true });
    }
    if (ackedDuplicate) {
      counters.ackAccepted += 1;
      counters.ackDuplicates += 1;
      return Object.freeze({ accepted: true, frameId: ack.frameId, duplicate: true });
    }
    state.acked = Object.freeze({ public: record.public, owner: record.owner, frameId: ack.frameId, record });
    for (const [frameId, pending] of state.pending) {
      if (frameId > ack.frameId) continue;
      state.pending.delete(frameId);
      state.retainedBytes -= pending.bytes;
    }
    state.forceKeyframe = false;
    state.forceReason = null;
    counters.ackAccepted += 1;
    counters.ackBaseAdvances += 1;
    if (!state.hasBaseAdvanced) {
      state.hasBaseAdvanced = true;
      counters.ackRecipientsWithBaseAdvance += 1;
    }
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
    let preparedPendingReferences = 0;
    let preparedAckedReferences = 0;
    let retiredAckProofs = 0;
    for (const state of recipients.values()) {
      pendingPairs += state.pending.size;
      retainedBytes += state.retainedBytes;
      retiredAckProofs += state.retiredAcks.size;
      for (const record of state.pending.values()) {
        if (record.public.prepared) preparedPendingReferences += 1;
        if (record.owner.prepared) preparedPendingReferences += 1;
      }
      if (state.acked?.public.prepared) preparedAckedReferences += 1;
      if (state.acked?.owner.prepared) preparedAckedReferences += 1;
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
    return Object.freeze({ recipients: recipients.size, pendingPairs, retainedBytes, retiredAckProofs, ...counters,
      recipientsWithAckedBase, maxAckedFrameId,
      keyframeReasons: Object.freeze(Object.fromEntries([...keyframeReasons].sort(([a], [b]) => a.localeCompare(b)))),
      candidateAverageBytes: candidateAverages, limits,
      ackRejectDiagnostics: ackRejectDiagnosticsEnabled
        ? Object.freeze({
            enabled: true,
            total: ackRejectDiagnostics.total,
            byReason: Object.freeze(Object.fromEntries([...ackRejectDiagnostics.byReason].sort())),
            byRelation: Object.freeze(Object.fromEntries([...ackRejectDiagnostics.byRelation].sort())),
            orderTransitions: Object.freeze(Object.fromEntries([...ackRejectDiagnostics.orderTransitions].sort())),
            boundedReasonCodes: 8,
            boundedRelations: 8,
            orderScope: "global arrival order within one match authority lifetime; not per-recipient causal order",
          })
        : Object.freeze({ enabled: false }),
      preparedProjections: Object.freeze({ enabled: preparedProjectionsEnabled, ...operationCounters,
        pendingReferences: preparedPendingReferences, ackedReferences: preparedAckedReferences,
        maxPendingReferences: limits.maxRecipients * limits.maxPendingPairsPerRecipient * 2,
        maxAckedReferences: limits.maxRecipients * 2 }) });
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
