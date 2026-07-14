"use strict";

const crypto = require("crypto");
const {
  normalizeView,
  projectionHash,
  createStructuralDelta,
} = require("./canonical-structural-delta.cjs");
const { canonicalJson, canonicalJsonBytes } = require("./session-replication-manifest.cjs");
const {
  MIXED_ACK_SCHEMA,
  createAuthorityDeltaPublisher,
  registerExactEncodedPublication,
} = require("./authority-delta-publisher.cjs");
const {
  PAIR_SCHEMA,
  BODY_SCHEMA,
  BODY_DELTA_SCHEMA,
  codecContext,
  assertPublicBody,
  encodePublicBodyFrame,
} = require("./state-pair-public-body-codec.cjs");
const { STAGES: S23T_STAGES } = require("./s23t-public-body-profiler.cjs");

const DEFAULTS = Object.freeze({
  maxBodies: 16,
  maxBodyBytes: 8 * 1024 * 1024,
  maxCohortsPerTarget: 16,
  maxPendingPairsPerRecipient: 12,
  maxRetiredAckProofsPerRecipient: 256,
  maxRetainedBytesPerRecipient: 2 * 1024 * 1024,
});

class SharedPublicBodyError extends Error {
  constructor(code, message) {
    super(message);
    this.name = "SharedPublicBodyError";
    this.code = code;
  }
}

function fail(code, message) {
  throw new SharedPublicBodyError(code, message);
}

function positiveInteger(value, fallback, label) {
  const result = value === undefined ? fallback : Number(value);
  if (!Number.isSafeInteger(result) || result < 1) throw new RangeError(`${label} must be a positive integer`);
  return result;
}

function requiredString(value, label) {
  if (typeof value !== "string" || !value || value.trim() !== value || value !== value.normalize("NFC")) {
    fail("invalid-identity", `${label} is invalid`);
  }
  return value;
}

function deepFreeze(value) {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) deepFreeze(child);
  return Object.freeze(value);
}

function clone(value) {
  return JSON.parse(canonicalJson(value));
}

function sha256(value) {
  return `sha256:${crypto.createHash("sha256").update(value).digest("hex")}`;
}

function identityKey(identity) {
  return canonicalJson([identity.matchId, identity.sessionId, identity.authorityIncarnation,
    identity.recipientId, identity.recipientIncarnation]);
}

function sameIdentity(identity, ack) {
  return ack.matchId === identity.matchId && ack.sessionId === identity.sessionId
    && ack.authorityIncarnation === identity.authorityIncarnation
    && ack.recipientId === identity.recipientId
    && ack.recipientIncarnation === identity.recipientIncarnation;
}

function bodyInternalView(body) {
  return normalizeView({
    schema: "lbh-canonical-projection-v1",
    lane: "public",
    runId: body.matchId,
    authorityEpoch: body.authorityIncarnation,
    connectionEpoch: 1,
    ballparkEpoch: body.ballparkEpoch,
    manifestHash: body.manifestHash,
    statePairId: body.bodyId,
    snapshotId: body.bodyId,
    tick: body.bodyRevision,
    simTime: body.bodyRevision,
    eventWatermark: 0,
    fieldRevision: 0,
    overloadMode: "NORMAL",
    world: body.world,
    entities: body.entities,
  });
}

function createSharedPublicBodyAuthority({ matchId, authorityIncarnation, ballparkEpoch,
  manifestHash, publisherOptions = {}, limits: rawLimits = {}, s23tProfiler = null } = {}) {
  const fixed = Object.freeze({
    matchId: requiredString(matchId, "matchId"),
    authorityIncarnation: positiveInteger(authorityIncarnation, undefined, "authorityIncarnation"),
    ballparkEpoch: positiveInteger(ballparkEpoch, undefined, "ballparkEpoch"),
    manifestHash: requiredString(manifestHash, "manifestHash"),
  });
  const limits = Object.freeze(Object.fromEntries(Object.entries(DEFAULTS).map(([key, fallback]) =>
    [key, positiveInteger(rawLimits[key], fallback, key)])));
  const ownerPublisher = createAuthorityDeltaPublisher(publisherOptions);
  const bodies = new Map();
  const sourceBodies = new Map();
  const keyframes = new Map();
  const recipients = new Map();
  let bodyBytes = 0;
  let encodedBodyCache = null;
  let encodedBodyBytes = 0;
  let nextBodyRevision = 1;
  let cohortTargetId = null;
  let cohorts = new Map();
  let cohortBytes = 0;
  const counters = {
    bodyBuilds: 0, bodyHashes: 0, bodyCacheHits: 0, bodyEvictions: 0,
    cohortHits: 0, cohortMisses: 0, cohortBuilds: 0, cohortCapFallbacks: 0,
    bodyKeyframes: 0, bodyDeltas: 0, bodySerializations: 0, acknowledgements: 0, ackRejected: 0,
    retransmits: 0, recoveryResets: 0, disconnects: 0,
  };

  function assertIdentity(identity) {
    if (!identity || typeof identity !== "object" || identity.matchId !== fixed.matchId
        || identity.authorityIncarnation !== fixed.authorityIncarnation) {
      fail("identity-mismatch", "recipient identity is outside the public-body authority");
    }
    requiredString(identity.sessionId, "sessionId");
    requiredString(identity.recipientId, "recipientId");
    positiveInteger(identity.recipientIncarnation, undefined, "recipientIncarnation");
    return identity;
  }

  function stateFor(identity, create = true) {
    const key = identityKey(identity);
    let state = recipients.get(key);
    if (!state && create) {
      state = { identity: Object.freeze({ ...identity }), ackedBody: null, pending: new Map(),
        retired: new Map(), retainedBytes: 0, forceKeyframe: true };
      recipients.set(key, state);
    }
    return state;
  }

  function evictBodies() {
    while (bodies.size > limits.maxBodies || bodyBytes > limits.maxBodyBytes) {
      const oldestId = bodies.keys().next().value;
      const record = bodies.get(oldestId);
      bodies.delete(oldestId);
      keyframes.delete(oldestId);
      if (encodedBodyCache?.bodyId === oldestId) {
        encodedBodyCache = null;
        encodedBodyBytes = 0;
      }
      sourceBodies.delete(record.sourceKey);
      bodyBytes -= record.bytes;
      counters.bodyEvictions += 1;
      for (const state of recipients.values()) {
        if (state.ackedBody?.body.bodyId === oldestId) {
          state.ackedBody = null;
          state.forceKeyframe = true;
        }
      }
    }
  }

  function prepareBody({ sourceKey, world, entities }) {
    const boundedSourceKey = requiredString(String(sourceKey), "sourceKey");
    const prior = sourceBodies.get(boundedSourceKey);
    if (prior) {
      const candidateHash = s23tProfiler
        ? s23tProfiler.measureSync(S23T_STAGES.BODY_CANONICAL_HASH, null,
          () => sha256(canonicalJsonBytes({ world, entities })))
        : sha256(canonicalJsonBytes({ world, entities }));
      if (candidateHash !== prior.sourceHash) {
        fail("source-reuse", "one authoritative source tick produced different public body content");
      }
      counters.bodyCacheHits += 1;
      return prior;
    }
    if (nextBodyRevision > Number.MAX_SAFE_INTEGER) fail("body-revision-overflow", "public body revision overflowed");
    const bodyRevision = nextBodyRevision++;
    const bodyId = `body-${fixed.authorityIncarnation}-${bodyRevision}`;
    const sourceHash = s23tProfiler
      ? s23tProfiler.measureSync(S23T_STAGES.BODY_CANONICAL_HASH, null,
        () => sha256(canonicalJsonBytes({ world, entities })))
      : sha256(canonicalJsonBytes({ world, entities }));
    const normalized = () => {
      const provisionalBody = { schema: BODY_SCHEMA, ...fixed, bodyId, bodyRevision,
        world: clone(world), entities: clone(entities) };
      const internalView = bodyInternalView(provisionalBody);
      const body = deepFreeze({ ...provisionalBody, world: internalView.world,
        entities: internalView.entities });
      assertPublicBody(body);
      return { body, internalView };
    };
    const normalizedBody = s23tProfiler
      ? s23tProfiler.measureSync(S23T_STAGES.BODY_NORMALIZE_VALIDATE, null, normalized)
      : normalized();
    const { body, internalView } = normalizedBody;
    // The body hash uses the same normalized world/entity order as structural
    // deltas. Delta application can therefore reconstruct byte-identical body
    // semantics instead of depending on source traversal order.
    const canonical = () => ({ bodyHash: sha256(canonicalJsonBytes(body)),
      structuralHash: projectionHash(internalView), bytes: canonicalJsonBytes(body).length });
    const canonicalFacts = s23tProfiler
      ? s23tProfiler.measureSync(S23T_STAGES.BODY_CANONICAL_HASH, null, canonical)
      : canonical();
    const { bodyHash, structuralHash, bytes } = canonicalFacts;
    if (bytes > limits.maxBodyBytes) fail("body-too-large", "one public body exceeds the match history byte cap");
    const record = Object.freeze({ sourceKey: boundedSourceKey, sourceHash, body, bodyHash,
      internalView, structuralHash, bytes });
    bodies.set(bodyId, record);
    sourceBodies.set(boundedSourceKey, record);
    bodyBytes += bytes;
    counters.bodyBuilds += 1;
    counters.bodyHashes += 1;
    if (cohortTargetId !== bodyId) {
      cohortTargetId = bodyId;
      cohorts = new Map();
      cohortBytes = 0;
      encodedBodyCache = null;
      encodedBodyBytes = 0;
    }
    evictBodies();
    return record;
  }

  function keyframePayload(target) {
    const cached = keyframes.get(target.body.bodyId);
    if (cached) return cached;
    const payload = deepFreeze({ kind: "keyframe", schema: BODY_SCHEMA, bodyId: target.body.bodyId,
      bodyRevision: target.body.bodyRevision, resultHash: target.bodyHash, body: target.body });
    keyframes.set(target.body.bodyId, payload);
    return payload;
  }

  function encodedBody(target) {
    if (encodedBodyCache?.bodyId === target.body.bodyId) return encodedBodyCache.wire;
    const wire = canonicalJson(target.body);
    counters.bodySerializations += 1;
    const bytes = Buffer.byteLength(wire, "utf8");
    if (bodyBytes + cohortBytes + bytes <= limits.maxBodyBytes) {
      encodedBodyCache = Object.freeze({ bodyId: target.body.bodyId, wire });
      encodedBodyBytes = bytes;
    }
    return wire;
  }

  function deltaPayload(base, target) {
    const key = `${base.body.bodyId.length}:${base.body.bodyId}${base.bodyHash.length}:${base.bodyHash}`;
    const cached = cohorts.get(key);
    if (cached) {
      counters.cohortHits += 1;
      return cached;
    }
    counters.cohortMisses += 1;
    if (cohorts.size >= limits.maxCohortsPerTarget) {
      counters.cohortCapFallbacks += 1;
      return null;
    }
    let built;
    try {
      built = createStructuralDelta(base.internalView, target.internalView,
        { expectedBaseHash: base.structuralHash });
    } catch {
      // A recipient may ACK an older body while an on-change component moves
      // away and back to the same value. Its revision fence must advance, but
      // the structural codec intentionally rejects revision-only deltas. A
      // full body is the exact, bounded fallback for that cohort.
      counters.cohortCapFallbacks += 1;
      return null;
    }
    const payload = deepFreeze({ kind: "delta", schema: BODY_DELTA_SCHEMA,
      baseBodyId: base.body.bodyId, baseBodyRevision: base.body.bodyRevision,
      baseHash: base.bodyHash, bodyId: target.body.bodyId, bodyRevision: target.body.bodyRevision,
      resultHash: target.bodyHash, structuralBaseHash: base.structuralHash,
      structuralResultHash: target.structuralHash, delta: built.delta });
    const bytes = canonicalJsonBytes(payload).length;
    if (bodyBytes + encodedBodyBytes + cohortBytes + bytes > limits.maxBodyBytes) {
      counters.cohortCapFallbacks += 1;
      return null;
    }
    cohorts.set(key, payload);
    cohortBytes += bytes;
    counters.cohortBuilds += 1;
    return payload;
  }

  function placeholderPublic(ownerView) {
    return { ...ownerView, lane: "public", world: {}, entities: [] };
  }

  function retire(state, frameId, record) {
    state.retired.set(frameId, Object.freeze({ bodyHash: record.body.bodyHash,
      ownerHash: record.frame.owner.resultHash }));
    while (state.retired.size > limits.maxRetiredAckProofsPerRecipient) {
      state.retired.delete(state.retired.keys().next().value);
    }
  }

  function publish({ identity: rawIdentity, body: target, ownerView, ownerPrepared = null,
    dirtyHints = null }) {
    const identity = assertIdentity(rawIdentity);
    if (!target || bodies.get(target.body?.bodyId) !== target) {
      fail("unknown-body", "publication must use a live body prepared by this authority");
    }
    const state = stateFor(identity);
    const publishLegacy = () => ownerPublisher.publish({ identity,
      publicView: placeholderPublic(ownerView), ownerView, ownerPrepared, dirtyHints, allowMixed: true });
    const legacy = s23tProfiler
      ? s23tProfiler.measureSync(S23T_STAGES.LEGACY_PUBLISHER, identity.recipientId, publishLegacy)
      : publishLegacy();
    const base = !state.forceKeyframe && state.ackedBody && bodies.has(state.ackedBody.body.bodyId)
      ? state.ackedBody : null;
    const selectPublic = () => base ? deltaPayload(base, target) || keyframePayload(target) : keyframePayload(target);
    const publicPayload = s23tProfiler
      ? s23tProfiler.measureSync(S23T_STAGES.COHORT_DELTA, identity.recipientId, selectPublic)
      : selectPublic();
    if (publicPayload.kind === "keyframe") counters.bodyKeyframes += 1;
    else counters.bodyDeltas += 1;
    const buildEnvelope = () => deepFreeze({ ...legacy.frame, pairSchema: PAIR_SCHEMA,
      bodyId: target.body.bodyId, bodyRevision: target.body.bodyRevision, bodyHash: target.bodyHash,
      public: publicPayload, owner: legacy.frame.owner });
    const frame = s23tProfiler
      ? s23tProfiler.measureSync(S23T_STAGES.ENVELOPE_BUILD, identity.recipientId, buildEnvelope)
      : buildEnvelope();
    const preparedEncodedBody = publicPayload.kind === "keyframe" && s23tProfiler
      ? s23tProfiler.measureSync(S23T_STAGES.BODY_CANONICAL_HASH, identity.recipientId,
        () => encodedBody(target)) : null;
    const serializeRetain = () => {
      const wire = encodePublicBodyFrame(frame,
        codecContext({ ...identity, manifestHash: fixed.manifestHash }),
        publicPayload.kind === "keyframe"
          ? { encodedBody: preparedEncodedBody === null ? encodedBody(target) : preparedEncodedBody }
          : undefined);
      const bytes = Buffer.byteLength(wire, "utf8");
      const encodedDigest = sha256(wire);
      const publication = registerExactEncodedPublication(Object.freeze({ frame, bytes,
        encodedWire: wire, encodedDigest, expandedBytes: canonicalJsonBytes(frame).length,
        projectionKind: publicPayload.kind === frame.owner.kind ? publicPayload.kind
          : `public-${publicPayload.kind}+owner-${frame.owner.kind}` }));
      const record = Object.freeze({ publication, frame, body: target, legacy });
      state.pending.set(frame.frameId, record);
      state.retainedBytes += bytes;
      state.forceKeyframe = false;
      while (state.pending.size > limits.maxPendingPairsPerRecipient
          || state.retainedBytes > limits.maxRetainedBytesPerRecipient) {
        const oldestId = state.pending.keys().next().value;
        const oldest = state.pending.get(oldestId);
        retire(state, oldestId, oldest);
        state.pending.delete(oldestId);
        state.retainedBytes -= oldest.publication.bytes;
        state.forceKeyframe = true;
      }
      return publication;
    };
    return s23tProfiler
      ? s23tProfiler.measureSync(S23T_STAGES.ENVELOPE_SERIALIZE, identity.recipientId, serializeRetain)
      : serializeRetain();
  }

  function legacyAck(record, ack) {
    const frame = record.legacy.frame;
    return {
      type: "ack", ackKind: "statePair", ackSchema: MIXED_ACK_SCHEMA,
      matchId: frame.matchId, sessionId: frame.sessionId,
      authorityIncarnation: frame.authorityIncarnation, recipientId: frame.recipientId,
      recipientIncarnation: frame.recipientIncarnation, frameId: frame.frameId,
      statePairId: frame.statePairId, snapshotId: frame.snapshotId,
      publicHash: frame.public.resultHash, ownerHash: frame.owner.resultHash,
      pairSchema: "lbh-authority-state-pair-mixed-v1", tick: frame.tick, simTime: frame.simTime,
      eventWatermark: frame.eventWatermark, fieldRevision: frame.fieldRevision,
      overloadMode: frame.overloadMode, ballparkEpoch: frame.ballparkEpoch,
      manifestHash: frame.manifestHash, publicKind: frame.public.kind, ownerKind: frame.owner.kind,
      publicBaseSnapshotId: frame.public.baseSnapshotId || null,
      ownerBaseSnapshotId: frame.owner.baseSnapshotId || null,
    };
  }

  function acknowledge(rawIdentity, ack) {
    const identity = assertIdentity(rawIdentity);
    const state = stateFor(identity, false);
    const reject = (reason) => {
      counters.ackRejected += 1;
      if (state) state.forceKeyframe = true;
      return Object.freeze({ accepted: false, reason });
    };
    if (!state || !ack || typeof ack !== "object" || !sameIdentity(identity, ack)
        || !Number.isSafeInteger(ack.frameId) || ack.frameId < 1) return reject("identity-mismatch");
    const record = state.pending.get(ack.frameId);
    if (!record) {
      const retired = state.retired.get(ack.frameId);
      if (retired && ack.publicHash === retired.bodyHash && ack.ownerHash === retired.ownerHash) {
        return Object.freeze({ accepted: true, stale: true, retired: true, frameId: ack.frameId });
      }
      return reject("unknown-frame");
    }
    const frame = record.frame;
    const expectedBase = frame.public.kind === "delta" ? frame.public.baseBodyId : null;
    if (ack.ackSchema !== MIXED_ACK_SCHEMA || ack.statePairId !== frame.statePairId
        || ack.snapshotId !== frame.snapshotId || ack.publicHash !== record.body.bodyHash
        || ack.ownerHash !== frame.owner.resultHash || ack.tick !== frame.tick
        || ack.simTime !== frame.simTime || ack.eventWatermark !== frame.eventWatermark
        || ack.fieldRevision !== frame.fieldRevision || ack.overloadMode !== frame.overloadMode
        || ack.ballparkEpoch !== frame.ballparkEpoch || ack.manifestHash !== frame.manifestHash
        || ack.publicKind !== frame.public.kind || ack.ownerKind !== frame.owner.kind
        || ack.publicBaseSnapshotId !== expectedBase
        || ack.ownerBaseSnapshotId !== (frame.owner.baseSnapshotId || null)) {
      return reject("lineage-mismatch");
    }
    const ownerResult = ownerPublisher.acknowledge(identity, legacyAck(record, ack));
    if (!ownerResult.accepted) return reject(ownerResult.reason || "owner-ack-rejected");
    state.ackedBody = record.body;
    for (const [frameId, pending] of state.pending) {
      if (frameId > ack.frameId) continue;
      state.pending.delete(frameId);
      state.retainedBytes -= pending.publication.bytes;
    }
    state.forceKeyframe = false;
    counters.acknowledgements += 1;
    return Object.freeze({ accepted: true, frameId: ack.frameId });
  }

  function retransmit(rawIdentity, frameId) {
    const identity = assertIdentity(rawIdentity);
    const record = stateFor(identity, false)?.pending.get(frameId);
    if (!record) return null;
    counters.retransmits += 1;
    return record.publication;
  }

  function rebase(rawIdentity) {
    const identity = assertIdentity(rawIdentity);
    const state = stateFor(identity, false);
    if (state) {
      state.ackedBody = null;
      state.forceKeyframe = true;
      state.pending.clear();
      state.retainedBytes = 0;
    }
    ownerPublisher.rebase(identity);
    counters.recoveryResets += 1;
  }

  function disconnect(rawIdentity) {
    const identity = assertIdentity(rawIdentity);
    recipients.delete(identityKey(identity));
    ownerPublisher.disconnect(identity);
    counters.disconnects += 1;
  }

  function diagnostics() {
    let pendingPairs = 0;
    let retainedBytes = 0;
    let retiredAckProofs = 0;
    for (const state of recipients.values()) {
      pendingPairs += state.pending.size;
      retainedBytes += state.retainedBytes;
      retiredAckProofs += state.retired.size;
    }
    return deepFreeze({ schema: PAIR_SCHEMA, ...counters, bodies: bodies.size, bodyBytes,
      encodedBodyBytes, cohortBytes,
      retainedPublicMaterialBytes: bodyBytes + encodedBodyBytes + cohortBytes,
      recipients: recipients.size, pendingPairs, retainedBytes, retiredAckProofs,
      activeTargetCohorts: cohorts.size, cohortTargetId, limits, ownerPublisher: ownerPublisher.diagnostics() });
  }

  return Object.freeze({ prepareBody, publish, acknowledge, retransmit, rebase, disconnect, diagnostics });
}

module.exports = {
  DEFAULTS,
  SharedPublicBodyError,
  createSharedPublicBodyAuthority,
};
