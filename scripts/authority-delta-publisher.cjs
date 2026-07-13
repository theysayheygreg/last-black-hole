"use strict";

const crypto = require("crypto");

const {
  normalizeView,
  projectionHash,
  prepareProjection,
  preparedProjectionView,
  preparedProjectionHash,
  createPreparedStructuralDelta,
  createStructuralDelta,
} = require("./canonical-structural-delta.cjs");
const { canonicalJson, canonicalJsonBytes } = require("./session-replication-manifest.cjs");
const { STAGES } = require("./authority-stage-profiler.cjs");
const { isTrustedStatePairWireEncoder, hasTrustedStatePairCandidateSelector,
  selectTrustedStatePairWireCandidate } = require("./multiplayer-wire-protocol.cjs");

const PAIR_SCHEMA = "lbh-authority-state-pair-v1";
const ACK_SCHEMA = "lbh-authority-state-pair-ack-v1";
const MIXED_PAIR_SCHEMA = "lbh-authority-state-pair-mixed-v1";
const MIXED_ACK_SCHEMA = "lbh-authority-state-pair-mixed-ack-v1";
const MAX_WIRE_PAIR_BYTES = 256 * 1024;
const CODEC_CHOICE_SAMPLE_LIMIT = 2048;
// Equal-size candidates prefer less base dependence. This does not override
// recovery: forced/no-base publications never enter codec-aware selection.
const CODEC_PAIR_TIE_ORDER = Object.freeze([
  "public-keyframe+owner-keyframe",
  "public-keyframe+owner-delta",
  "public-delta+owner-keyframe",
  "public-delta+owner-delta",
]);
const exactEncodedPublications = new WeakSet();
const CANONICAL_COMPONENT_PROOF = Symbol("canonical-component-proof");
const ACK_REJECT_REASON_CODES = new Set(["unknown-recipient", "identity-mismatch", "invalid-frame-id",
  "unknown-frame", "invalid-ack-schema", "lineage-mismatch", "unexpected-state-pair-ack", "unknown"]);
const ACK_REJECT_RELATIONS = new Set(["duplicate", "stale", "future", "unknown", "pending-missing", "hash",
  "binding", "recovery-race"]);
const DEFAULTS = Object.freeze({
  maxRecipients: 128,
  // Match the client base ledger so an ACK delayed by the eight-seat local
  // apply loop can still be authenticated before either side evicts its base.
  maxPendingPairsPerRecipient: 12,
  // Proofs are hash/lineage envelopes only (never projections or wire bytes).
  // A 256-entry cap covers prolonged eight-seat event-loop backpressure while
  // remaining a small, deterministic authority-side bound.
  maxRetiredAckProofsPerRecipient: 256,
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

function privateWireCopy(wire) {
  return Buffer.isBuffer(wire) ? Buffer.from(wire) : wire;
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

// These proofs live only for one synchronous publish selection. The private
// symbol and exact payload identity prevent callers from substituting a size
// derived from another tick, recipient, or structurally-similar object.
function serializedComponentProof(value, stageProfiler, recipientKey) {
  const serialize = () => canonicalJson(value);
  const text = stageProfiler
    ? stageProfiler.measureSync(STAGES.JSON_SERIALIZATION, (encoded) => {
        const bytes = Buffer.byteLength(encoded, "utf8");
        return { recipientKey, outputBytes: bytes, serializedAllocationProxyBytes: bytes };
      }, serialize)
    : serialize();
  return Object.freeze({ [CANONICAL_COMPONENT_PROOF]: true, payload: value,
    text, bytes: Buffer.byteLength(text, "utf8") });
}

function wireDigest(wire) {
  return `sha256:${crypto.createHash("sha256").update(wire, "utf8").digest("hex")}`;
}

function exactCanonicalCandidateSizes(entries, componentProofs = null) {
  const first = entries[0].frame;
  const keys = Object.keys(first).sort((a, b) => {
    const left = Array.from(a, (character) => character.codePointAt(0));
    const right = Array.from(b, (character) => character.codePointAt(0));
    for (let index = 0; index < Math.min(left.length, right.length); index += 1) {
      if (left[index] !== right[index]) return left[index] - right[index];
    }
    return left.length - right.length;
  });
  const payloadCache = new Map();
  const encodedPayload = (payload) => {
    let value = payloadCache.get(payload);
    if (value === undefined) {
      const proof = componentProofs?.get(payload);
      if (proof !== undefined) {
        if (proof?.[CANONICAL_COMPONENT_PROOF] !== true || proof.payload !== payload
            || typeof proof.text !== "string" || !Number.isSafeInteger(proof.bytes)
            || proof.bytes !== Buffer.byteLength(proof.text, "utf8")) {
          fail("invalid-wire-size", "canonical component size proof is invalid");
        }
        value = Object.freeze({ text: proof.text, bytes: proof.bytes, reused: true });
      } else {
        const text = canonicalJson(payload);
        value = Object.freeze({ text, bytes: Buffer.byteLength(text, "utf8"), reused: false });
      }
      payloadCache.set(payload, value);
    }
    return value;
  };
  const sharedSegments = new Map();
  for (const key of keys) {
    if (key === "public" || key === "owner") continue;
    sharedSegments.set(key, `${JSON.stringify(key)}:${canonicalJson(first[key])}`);
  }
  const sizes = new Map();
  for (const entry of entries) {
    const candidateKeys = Object.keys(entry.frame).sort((a, b) => keys.indexOf(a) - keys.indexOf(b));
    if (candidateKeys.length !== keys.length || candidateKeys.some((key, index) => key !== keys[index])) {
      fail("invalid-wire-size", "candidate statePair fields differ");
    }
    for (const key of keys) {
      if (key !== "public" && key !== "owner" && entry.frame[key] !== first[key]) {
        fail("invalid-wire-size", "candidate statePair headers differ");
      }
    }
    let bytes = 2 + Math.max(0, keys.length - 1);
    for (const key of keys) {
      if (key === "public" || key === "owner") {
        const payload = encodedPayload(entry.frame[key]);
        bytes += Buffer.byteLength(JSON.stringify(key), "utf8") + 1 + payload.bytes;
      } else bytes += Buffer.byteLength(sharedSegments.get(key), "utf8");
    }
    sizes.set(entry.kind, bytes);
  }
  const reusedPayloads = [...payloadCache.keys()].filter((payload) => payloadCache.get(payload).reused);
  const newPayloads = [...payloadCache.keys()].filter((payload) => !payloadCache.get(payload).reused);
  return Object.freeze({ sizes,
    componentSerializations: sharedSegments.size + newPayloads.length,
    headerSerializations: sharedSegments.size,
    laneSerializations: newPayloads.length,
    laneSerializationReuses: reusedPayloads.length,
    reusedLaneBytes: reusedPayloads.reduce((sum, payload) => sum + componentProofs.get(payload).bytes, 0),
    serializedLaneBytes: newPayloads.reduce((sum, payload) => sum + payloadCache.get(payload).bytes, 0),
    bytesExamined: [...sharedSegments.values()].reduce((sum, value) => sum + Buffer.byteLength(value, "utf8"), 0)
      + [...payloadCache.values()].reduce((sum, value) => sum + value.bytes, 0),
    allocationProxyBytes: [...sharedSegments.values()].reduce((sum, value) => sum + Buffer.byteLength(value, "utf8"), 0)
      + newPayloads.reduce((sum, payload) => sum + payloadCache.get(payload).bytes, 0) });
}

function percentile(values, fraction) {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.floor((sorted.length - 1) * fraction))];
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
  const deltaCanonical = serializedComponentProof(payload, stageProfiler, recipientKey);
  const deltaBytes = deltaCanonical.bytes;
  const keyframe = keyframePayload(current, { stageProfiler, recipientKey, lane,
    prepared, preparedContext, operationCounters });
  const keyframeCanonical = serializedComponentProof(keyframe, stageProfiler, recipientKey);
  const keyframeBytes = keyframeCanonical.bytes;
  return Object.freeze({
    payload: deltaBytes < keyframeBytes ? payload : keyframe,
    deltaPayload: payload,
    keyframePayload: keyframe,
    deltaCanonical,
    keyframeCanonical,
    decision: deltaBytes < keyframeBytes ? "delta" : "delta-not-smaller",
    deltaBytes,
    keyframeBytes,
  });
}

function pairProjectionKind(publicKind, ownerKind) {
  return publicKind === ownerKind ? publicKind : `public-${publicKind}+owner-${ownerKind}`;
}

function pairCombinationKind(publicKind, ownerKind) {
  return `public-${publicKind}+owner-${ownerKind}`;
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
  const codecChoice = {
    combinationsEvaluated: 0,
    combinationsChosen: new Map(),
    encodedByCombination: new Map(),
    bytesSavedVsSemanticChoice: 0,
    selections: 0,
    encodeMilliseconds: [],
    encodeSamplesDropped: 0,
    fallbacks: new Map(),
    maxEphemeralCandidates: 0,
    componentSerializations: 0,
    fullCandidateCompositions: 0,
    winnerSerializations: 0,
    bytesExamined: 0,
    allocationProxyBytes: 0,
    expandedHeaderSerializations: 0,
    expandedLaneSerializations: 0,
    expandedLaneSerializationReuses: 0,
    expandedReusedLaneBytes: 0,
    expandedSerializedLaneBytes: 0,
    expandedBytesExamined: 0,
    selectionMilliseconds: [],
    selectionSamplesDropped: 0,
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

  function countCodecFallback(reason) {
    const bounded = String(reason || "unknown").slice(0, 96);
    codecChoice.fallbacks.set(bounded, (codecChoice.fallbacks.get(bounded) || 0) + 1);
  }

  function observeCodecEncode(kind, bytes, elapsedMs) {
    codecChoice.combinationsEvaluated += 1;
    const row = codecChoice.encodedByCombination.get(kind) || { count: 0, bytes: 0 };
    row.count += 1;
    row.bytes += bytes;
    codecChoice.encodedByCombination.set(kind, row);
    if (codecChoice.encodeMilliseconds.length < CODEC_CHOICE_SAMPLE_LIMIT) {
      codecChoice.encodeMilliseconds.push(elapsedMs);
    } else codecChoice.encodeSamplesDropped += 1;
  }

  function observeExactSelection(selected, expanded) {
    for (const entry of selected.candidates) {
      codecChoice.combinationsEvaluated += 1;
      const row = codecChoice.encodedByCombination.get(entry.kind) || { count: 0, bytes: 0 };
      row.count += 1;
      row.bytes += entry.bytes;
      codecChoice.encodedByCombination.set(entry.kind, row);
    }
    codecChoice.componentSerializations += selected.diagnostics.componentSerializations
      + expanded.componentSerializations;
    codecChoice.fullCandidateCompositions += selected.diagnostics.fullCandidateCompositions;
    codecChoice.winnerSerializations += selected.diagnostics.winnerSerializations;
    codecChoice.bytesExamined += selected.diagnostics.bytesExamined;
    codecChoice.allocationProxyBytes += selected.diagnostics.allocationProxyBytes
      + expanded.allocationProxyBytes;
    codecChoice.expandedHeaderSerializations += expanded.headerSerializations;
    codecChoice.expandedLaneSerializations += expanded.laneSerializations;
    codecChoice.expandedLaneSerializationReuses += expanded.laneSerializationReuses;
    codecChoice.expandedReusedLaneBytes += expanded.reusedLaneBytes;
    codecChoice.expandedSerializedLaneBytes += expanded.serializedLaneBytes;
    codecChoice.expandedBytesExamined += expanded.bytesExamined;
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
    dirtyHints = null, allowMixed = false, wireSize = null, encodeWire = null }) {
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
    const priorSemanticProjectionKind = pairProjectionKind(publicPayload.kind, ownerPayload.kind);
    const priorSemanticCombinationKind = pairCombinationKind(publicPayload.kind, ownerPayload.kind);
    let frame = buildFrame(publicPayload, ownerPayload);
    if (wireSize !== null && typeof wireSize !== "function") fail("invalid-wire-size", "wireSize must be a function");
    if (encodeWire !== null && typeof encodeWire !== "function") fail("invalid-wire-encoder", "encodeWire must be a function");
    if (encodeWire && !isTrustedStatePairWireEncoder(encodeWire)) {
      fail("invalid-wire-encoder", "encodeWire must be created by the negotiated wire protocol");
    }
    const measureWire = (candidate, kind) => {
      const expandedBytes = canonicalJsonBytes(candidate).length;
      if (expandedBytes > limits.maxPairBytes) {
        fail("pair-too-large", `atomic state pair exceeds ${limits.maxPairBytes} bytes in expanded form`);
      }
      const started = performance.now();
      const encodedWire = encodeWire ? encodeWire(candidate) : null;
      if (encodedWire !== null && typeof encodedWire !== "string" && !Buffer.isBuffer(encodedWire)) {
        fail("invalid-wire-encoder", "encodeWire must return canonical UTF-8 text or exact binary bytes");
      }
      const measured = encodedWire !== null ? Buffer.byteLength(encodedWire, "utf8")
        : wireSize ? wireSize(candidate) : serializedBytes(candidate, stageProfiler, identity.recipientId);
      if (!Number.isSafeInteger(measured) || measured < 1 || measured > MAX_WIRE_PAIR_BYTES) {
        fail("invalid-wire-size", "wire encoder returned an invalid encoded byte count");
      }
      if (encodeWire || wireSize) observeCodecEncode(kind, measured, performance.now() - started);
      return Object.freeze({ frame: candidate, kind, bytes: measured, expandedBytes,
        encodedWire, encodedDigest: encodedWire === null ? null : wireDigest(encodedWire) });
    };
    const fullKeyframe = buildFrame(
      keyframePayload(publicView, { ...profile, lane: "public",
        prepared: preparedPublic.prepared, preparedContext: preparedPublic.context, operationCounters }),
      keyframePayload(ownerView, { ...profile, lane: "owner",
        prepared: preparedOwner.prepared, preparedContext: preparedOwner.context, operationCounters }),
    );
    const fullKind = pairCombinationKind("keyframe", "keyframe");
    let chosen = null;
    const exactSafeBase = Boolean((encodeWire || wireSize) && allowMixed && state.acked && !state.forceKeyframe
      && publicDecision?.deltaPayload && ownerDecision?.deltaPayload);
    let fullKeyframeBytes = null;
    const choosePair = () => {
      const composedExact = exactSafeBase && encodeWire && hasTrustedStatePairCandidateSelector(encodeWire);
      if (composedExact) {
        const lanes = {
          public: { keyframe: publicDecision.keyframePayload, delta: publicDecision.deltaPayload },
          owner: { keyframe: ownerDecision.keyframePayload, delta: ownerDecision.deltaPayload },
        };
        const entries = CODEC_PAIR_TIE_ORDER.map((kind) => {
          const [publicKind, ownerKind] = kind.split("+").map((part) => part.split("-")[1]);
          return Object.freeze({ kind, frame: buildFrame(lanes.public[publicKind], lanes.owner[ownerKind]) });
        });
        codecChoice.maxEphemeralCandidates = Math.max(codecChoice.maxEphemeralCandidates, entries.length);
        const started = performance.now();
        try {
          const canonicalProofs = new Map([
            [publicDecision.keyframePayload, publicDecision.keyframeCanonical],
            [publicDecision.deltaPayload, publicDecision.deltaCanonical],
            [ownerDecision.keyframePayload, ownerDecision.keyframeCanonical],
            [ownerDecision.deltaPayload, ownerDecision.deltaCanonical],
          ]);
          const expanded = exactCanonicalCandidateSizes(entries, canonicalProofs);
          for (const bytes of expanded.sizes.values()) {
            if (bytes > limits.maxPairBytes) fail("pair-too-large",
              `atomic state pair exceeds ${limits.maxPairBytes} bytes in expanded form`);
          }
          const selected = selectTrustedStatePairWireCandidate(encodeWire, entries, CODEC_PAIR_TIE_ORDER);
          observeExactSelection(selected, expanded);
          const selectedExpandedBytes = expanded.sizes.get(selected.chosen.kind);
          chosen = Object.freeze({ frame: selected.chosen.frame, kind: selected.chosen.kind,
            bytes: selected.chosen.bytes, expandedBytes: selectedExpandedBytes,
            encodedWire: selected.chosen.wire, encodedDigest: wireDigest(selected.chosen.wire) });
          const sizes = new Map(selected.candidates.map((entry) => [entry.kind, entry.bytes]));
          fullKeyframeBytes = sizes.get(fullKind);
          const semanticBytes = sizes.get(priorSemanticCombinationKind) ?? fullKeyframeBytes;
          codecChoice.selections += 1;
          codecChoice.combinationsChosen.set(chosen.kind,
            (codecChoice.combinationsChosen.get(chosen.kind) || 0) + 1);
          codecChoice.bytesSavedVsSemanticChoice += Math.max(0, semanticBytes - chosen.bytes);
          if (chosen.kind === fullKind) keyframeReason = "codec-choice:public-keyframe+owner-keyframe";
        } catch (error) {
          countCodecFallback(`candidate-invalid:${String(error.code || error.name || "unknown")}`);
          keyframeReason = `codec-candidate-invalid:${String(error.code || error.name || "unknown")}`;
          chosen = measureWire(fullKeyframe, fullKind);
          fullKeyframeBytes = chosen.bytes;
        }
        const elapsed = performance.now() - started;
        if (codecChoice.selectionMilliseconds.length < CODEC_CHOICE_SAMPLE_LIMIT) {
          codecChoice.selectionMilliseconds.push(elapsed);
        } else codecChoice.selectionSamplesDropped += 1;
      } else {
        let fullMeasured;
        try { fullMeasured = measureWire(fullKeyframe, fullKind); }
        catch (error) {
          forceRebase(state, `wire-fallback:${String(error?.code || error?.name || "unknown").slice(0, 64)}`);
          throw error;
        }
        fullKeyframeBytes = fullMeasured.bytes;
        if (encodeWire) {
          codecChoice.fullCandidateCompositions += 1;
          codecChoice.winnerSerializations += 1;
          codecChoice.bytesExamined += fullMeasured.bytes;
          codecChoice.allocationProxyBytes += fullMeasured.bytes;
        }
        if (exactSafeBase) {
          const lanes = {
            public: { keyframe: publicDecision.keyframePayload, delta: publicDecision.deltaPayload },
            owner: { keyframe: ownerDecision.keyframePayload, delta: ownerDecision.deltaPayload },
          };
          const measured = new Map([[fullKind, fullMeasured]]);
          let candidateFailure = null;
          for (const kind of CODEC_PAIR_TIE_ORDER.slice(1)) {
            const [publicKind, ownerKind] = kind.split("+").map((part) => part.split("-")[1]);
            try { measured.set(kind, measureWire(buildFrame(lanes.public[publicKind], lanes.owner[ownerKind]), kind)); }
            catch (error) { candidateFailure ||= error; }
          }
          codecChoice.maxEphemeralCandidates = Math.max(codecChoice.maxEphemeralCandidates, measured.size);
          if (candidateFailure) {
            countCodecFallback(`candidate-invalid:${String(candidateFailure.code || candidateFailure.name || "unknown")}`);
            chosen = fullMeasured;
            keyframeReason = `codec-candidate-invalid:${String(candidateFailure.code || candidateFailure.name || "unknown")}`;
          } else {
            const semanticKind = priorSemanticCombinationKind;
            const semanticBytes = measured.get(semanticKind)?.bytes ?? fullKeyframeBytes;
            chosen = [...measured.values()].sort((a, b) => a.bytes - b.bytes
              || CODEC_PAIR_TIE_ORDER.indexOf(a.kind) - CODEC_PAIR_TIE_ORDER.indexOf(b.kind))[0];
            codecChoice.selections += 1;
            codecChoice.combinationsChosen.set(chosen.kind,
              (codecChoice.combinationsChosen.get(chosen.kind) || 0) + 1);
            codecChoice.bytesSavedVsSemanticChoice += Math.max(0, semanticBytes - chosen.bytes);
            if (chosen.kind === fullKind) keyframeReason = "codec-choice:public-keyframe+owner-keyframe";
          }
        } else {
        if (encodeWire) countCodecFallback(state.acked ? "recovery-precedence" : "missing-exact-acked-base");
        let semanticMeasured;
        const semanticKind = priorSemanticCombinationKind;
        try { semanticMeasured = semanticKind === fullKind ? fullMeasured : measureWire(frame, semanticKind); }
        catch (error) {
          countCodecFallback(`semantic-invalid:${String(error?.code || error?.name || "unknown")}`);
          semanticMeasured = fullMeasured;
          keyframeReason = `wire-fallback:${String(error?.code || error?.name || "unknown")}`;
        }
        chosen = allowMixed && semanticKind !== fullKind
          && (semanticMeasured.bytes >= fullKeyframeBytes || semanticMeasured.bytes > limits.maxPairBytes)
          ? fullMeasured : semanticMeasured;
        if (chosen === fullMeasured && semanticKind !== fullKind) {
          keyframeReason = semanticMeasured.bytes >= fullKeyframeBytes ? "pair-not-smaller" : "pair-limit-fallback";
        }
        }
      }
      frame = chosen.frame;
      publicPayload = frame.public;
      ownerPayload = frame.owner;
    };
    if (stageProfiler) stageProfiler.measureSync(STAGES.PAIR_CHOICE, () => ({
      recipientKey: identity.recipientId,
      inputBytes: fullKeyframeBytes,
      outputBytes: chosen?.bytes || fullKeyframeBytes,
    }), choosePair);
    else choosePair();
    let bytes = chosen.bytes;
    if (bytes > limits.maxPairBytes) {
      forceRebase(state);
      fail("pair-too-large", `atomic state pair exceeds ${limits.maxPairBytes} bytes`);
    }
    state.nextFrameId += 1;
    const retainedWire = privateWireCopy(chosen.encodedWire);
    const record = Object.freeze({
      frame,
      bytes,
      encodedWire: retainedWire,
      encodedDigest: chosen.encodedDigest,
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
    const published = Object.freeze({ frame, bytes,
      ...(chosen.encodedWire !== null ? { encodedWire: privateWireCopy(retainedWire),
        encodedDigest: chosen.encodedDigest, expandedBytes: chosen.expandedBytes } : {}),
      priorSemanticProjectionKind,
      projectionKind: publicPayload.kind === ownerPayload.kind ? publicPayload.kind : laneKinds,
      publicKind: publicPayload.kind, ownerKind: ownerPayload.kind, fullKeyframeBytes });
    if (chosen.encodedWire !== null) exactEncodedPublications.add(published);
    return published;
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
    const published = Object.freeze({ frame: record.frame, bytes: record.bytes,
      ...(record.encodedWire !== null ? { encodedWire: privateWireCopy(record.encodedWire),
        encodedDigest: record.encodedDigest } : {}),
      projectionKind: record.frame.public.kind === record.frame.owner.kind
        ? record.frame.public.kind : pairProjectionKind(record.frame.public.kind, record.frame.owner.kind) });
    if (record.encodedWire !== null) exactEncodedPublications.add(published);
    return published;
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
    const encodeSamples = codecChoice.encodeMilliseconds;
    const selectionSamples = codecChoice.selectionMilliseconds;
    const codecPairChoice = Object.freeze({
      tieOrder: CODEC_PAIR_TIE_ORDER,
      combinationsEvaluated: codecChoice.combinationsEvaluated,
      combinationsChosen: Object.freeze(Object.fromEntries([...codecChoice.combinationsChosen].sort())),
      exactEncodedBytesByCombination: Object.freeze(Object.fromEntries([...codecChoice.encodedByCombination]
        .sort(([a], [b]) => a.localeCompare(b)).map(([kind, row]) => [kind, Object.freeze({
          count: row.count, bytes: row.bytes, meanBytes: row.bytes / row.count,
        })]))),
      selections: codecChoice.selections,
      bytesSavedVsPriorSemanticChoice: codecChoice.bytesSavedVsSemanticChoice,
      meanBytesSavedVsPriorSemanticChoice: codecChoice.selections
        ? codecChoice.bytesSavedVsSemanticChoice / codecChoice.selections : null,
      encodeMilliseconds: Object.freeze({ count: encodeSamples.length,
        p50: percentile(encodeSamples, 0.50), p95: percentile(encodeSamples, 0.95),
        p99: percentile(encodeSamples, 0.99), max: encodeSamples.length ? Math.max(...encodeSamples) : null,
        samplesDropped: codecChoice.encodeSamplesDropped, sampleLimit: CODEC_CHOICE_SAMPLE_LIMIT }),
      selectionMilliseconds: Object.freeze({ count: selectionSamples.length,
        p50: percentile(selectionSamples, 0.50), p95: percentile(selectionSamples, 0.95),
        p99: percentile(selectionSamples, 0.99), max: selectionSamples.length ? Math.max(...selectionSamples) : null,
        samplesDropped: codecChoice.selectionSamplesDropped, sampleLimit: CODEC_CHOICE_SAMPLE_LIMIT }),
      operations: Object.freeze({ componentSerializations: codecChoice.componentSerializations,
        fullCandidateCompositions: codecChoice.fullCandidateCompositions,
        winnerSerializations: codecChoice.winnerSerializations,
        bytesExamined: codecChoice.bytesExamined,
        allocationProxyBytes: codecChoice.allocationProxyBytes,
        expandedHeaderSerializations: codecChoice.expandedHeaderSerializations,
        expandedLaneSerializations: codecChoice.expandedLaneSerializations,
        expandedLaneSerializationReuses: codecChoice.expandedLaneSerializationReuses,
        expandedReusedLaneBytes: codecChoice.expandedReusedLaneBytes,
        expandedSerializedLaneBytes: codecChoice.expandedSerializedLaneBytes,
        expandedBytesExamined: codecChoice.expandedBytesExamined }),
      fallbacks: Object.freeze(Object.fromEntries([...codecChoice.fallbacks].sort())),
      ephemeralCandidates: Object.freeze({ retainedAfterPublish: 0,
        maxPerPublish: codecChoice.maxEphemeralCandidates, configuredMaximum: CODEC_PAIR_TIE_ORDER.length }),
    });
    return Object.freeze({ recipients: recipients.size, pendingPairs, retainedBytes, retiredAckProofs, ...counters,
      recipientsWithAckedBase, maxAckedFrameId,
      keyframeReasons: Object.freeze(Object.fromEntries([...keyframeReasons].sort(([a], [b]) => a.localeCompare(b)))),
      candidateAverageBytes: candidateAverages, codecPairChoice, limits,
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

// Test-only same-operation oracle for the private proof path. It deliberately
// creates fresh proofs and consumes them immediately; callers cannot provide,
// retain, or replay a proof token.
function testExactCanonicalCandidateSizesWithReuse(entries, maxPairBytes = null) {
  const proofs = new Map();
  for (const entry of entries) {
    for (const lane of ["public", "owner"]) {
      const payload = entry?.frame?.[lane];
      if (payload && !proofs.has(payload)) proofs.set(payload, serializedComponentProof(payload, null, null));
    }
  }
  const exact = exactCanonicalCandidateSizes(entries, proofs);
  const oversize = maxPairBytes === null ? [] : [...exact.sizes]
    .filter(([, bytes]) => bytes > maxPairBytes).map(([kind]) => kind);
  return Object.freeze({ sizes: Object.freeze(Object.fromEntries(exact.sizes)),
    limit: Object.freeze({ maxPairBytes, accepted: maxPairBytes === null || oversize.length === 0,
      oversizeKinds: Object.freeze(oversize) }),
    diagnostics: Object.freeze({ componentSerializations: exact.componentSerializations,
      headerSerializations: exact.headerSerializations, laneSerializations: exact.laneSerializations,
      laneSerializationReuses: exact.laneSerializationReuses, reusedLaneBytes: exact.reusedLaneBytes,
      serializedLaneBytes: exact.serializedLaneBytes, bytesExamined: exact.bytesExamined,
      allocationProxyBytes: exact.allocationProxyBytes }) });
}

module.exports = {
  PAIR_SCHEMA,
  ACK_SCHEMA,
  MIXED_PAIR_SCHEMA,
  MIXED_ACK_SCHEMA,
  MAX_WIRE_PAIR_BYTES,
  CODEC_PAIR_TIE_ORDER,
  DEFAULTS,
  AuthorityDeltaError,
  createAuthorityDeltaPublisher,
  testExactCanonicalCandidateSizesWithReuse,
  isExactEncodedPublication: (value) => Boolean(value && typeof value === "object"
    && exactEncodedPublications.has(value)),
};
