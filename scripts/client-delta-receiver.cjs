"use strict";

const crypto = require("crypto");
const {
  normalizeView,
  projectionHash,
  applyStructuralDelta,
} = require("./canonical-structural-delta.cjs");
const {
  canonicalJsonBytes,
} = require("./session-replication-manifest.cjs");
const {
  SERVER_TO_CLIENT,
  parseWireFrame,
} = require("./multiplayer-wire-protocol.cjs");
const {
  PAIR_SCHEMA,
  ACK_SCHEMA,
  MIXED_PAIR_SCHEMA,
  MIXED_ACK_SCHEMA,
  MAX_WIRE_PAIR_BYTES,
} = require("./authority-delta-publisher.cjs");
const {
  CAPABILITY: RUNTIME_PUBLIC_COMPONENTS_CAPABILITY,
  reconstructLegacyPublicEntities,
} = require("./runtime-public-schema.cjs");

const CAPABILITY = "state-pair-v1";
const MIXED_CAPABILITY = "state-pair-mixed-v1";
const STATIC_MANIFEST_CAPABILITY = "static-manifest-v1";
const RECOVERY_SCHEMA = "lbh-client-state-pair-recovery-v1";
const DEFAULT_MANIFEST_SCHEMA = "lbh-session-replication-manifest-v1";
const FORBIDDEN_KEYS = new Set(["__proto__", "prototype", "constructor"]);
const MAX_CONTINUITY_ENTITIES = 8192;
const MAX_CONTINUITY_COMPONENTS = 16384;
const MAX_CONTINUITY_BYTES = 1024 * 1024;
const MODES = Object.freeze({
  V1: "v1",
  STATIC_MANIFEST: "static-manifest-v1",
  STATE_PAIR: CAPABILITY,
  STATE_PAIR_MIXED: MIXED_CAPABILITY,
  STATE_PAIR_RUNTIME_COMPONENTS: RUNTIME_PUBLIC_COMPONENTS_CAPABILITY,
});
const RECOVERY_REASONS = new Set([
  "reconnect", "match-changed", "session-changed", "authority-changed", "recipient-changed",
  "manifest-changed", "schema-changed", "frame-gap", "stale-frame",
  "duplicate-mismatch", "identity-mismatch", "manifest-mismatch",
  "missing-base", "base-mismatch", "hash-mismatch", "lineage-mismatch",
  "owner-mismatch", "malformed-frame", "oversize-frame", "rejected-delta",
]);

class ClientDeltaError extends Error {
  constructor(code, message) {
    super(message);
    this.name = "ClientDeltaError";
    this.code = code;
  }
}

function fail(code, message) {
  throw new ClientDeltaError(code, message);
}

function requiredString(value, label) {
  if (typeof value !== "string" || !value || value.length > 160 || value.trim() !== value
    || value !== value.normalize("NFC")) fail("invalid-context", `${label} is invalid`);
  return value;
}

function positiveSafeInteger(value, label) {
  if (!Number.isSafeInteger(value) || value < 1) fail("invalid-context", `${label} is invalid`);
  return value;
}

function normalizeContext(input) {
  if (!input || typeof input !== "object" || Array.isArray(input)) fail("invalid-context", "receiver context is required");
  const allowed = new Set(["matchId", "sessionId", "authorityIncarnation", "recipientId",
    "recipientIncarnation", "manifestSchema", "manifestHash"]);
  if (Object.keys(input).some((key) => !allowed.has(key))) fail("invalid-context", "receiver context has unknown fields");
  const manifestSchema = requiredString(input.manifestSchema || DEFAULT_MANIFEST_SCHEMA, "manifestSchema");
  if (manifestSchema !== DEFAULT_MANIFEST_SCHEMA) fail("invalid-context", "manifestSchema is unsupported");
  return Object.freeze({
    matchId: requiredString(input.matchId, "matchId"),
    sessionId: requiredString(input.sessionId, "sessionId"),
    authorityIncarnation: positiveSafeInteger(input.authorityIncarnation, "authorityIncarnation"),
    recipientId: requiredString(input.recipientId, "recipientId"),
    recipientIncarnation: positiveSafeInteger(input.recipientIncarnation, "recipientIncarnation"),
    manifestSchema,
    manifestHash: requiredString(input.manifestHash, "manifestHash"),
  });
}

function sameContextIdentity(context, frame) {
  return frame.matchId === context.matchId && frame.sessionId === context.sessionId
    && frame.authorityIncarnation === context.authorityIncarnation
    && frame.recipientId === context.recipientId
    && frame.recipientIncarnation === context.recipientIncarnation;
}

function deepFreeze(value) {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) deepFreeze(child);
  return Object.freeze(value);
}

function scanForbiddenKeys(value, depth = 0, state = { nodes: 0 }) {
  if (depth > 40) fail("malformed-frame", "frame nesting is too deep");
  state.nodes += 1;
  if (state.nodes > 120000) fail("malformed-frame", "frame is too complex");
  if (!value || typeof value !== "object") return;
  if (Array.isArray(value)) {
    for (const child of value) scanForbiddenKeys(child, depth + 1, state);
    return;
  }
  for (const [key, child] of Object.entries(value)) {
    if (FORBIDDEN_KEYS.has(key)) fail("malformed-frame", "frame contains a forbidden object key");
    scanForbiddenKeys(child, depth + 1, state);
  }
}

function wireBytes(raw) {
  if (typeof raw === "string") return Buffer.byteLength(raw, "utf8");
  if (Buffer.isBuffer(raw) || raw instanceof Uint8Array) return raw.byteLength;
  fail("malformed-frame", "state-pair receiver accepts UTF-8 wire bytes only");
}

function frameFingerprint(frame) {
  return `sha256:${crypto.createHash("sha256").update(canonicalJsonBytes(frame)).digest("hex")}`;
}

function emptyContinuity() {
  return deepFreeze({ entities: {}, retired: {} });
}

function advanceContinuity(view, prior = emptyContinuity()) {
  const entities = {};
  const retired = { ...prior.retired };
  let componentCount = 0;
  const currentIds = new Set();
  for (const entity of view.entities) {
    const id = entity.publicEntityId;
    currentIds.add(id);
    const old = prior.entities[id];
    const retiredIncarnation = retired[id];
    if (!old && Number.isSafeInteger(retiredIncarnation) && entity.incarnation <= retiredIncarnation) {
      fail("lineage-mismatch", `keyframe entity ${id} reused a retired incarnation`);
    }
    if (old && entity.incarnation < old.incarnation) fail("lineage-mismatch", `keyframe entity ${id} incarnation regressed`);
    const sameIncarnation = old && entity.incarnation === old.incarnation;
    if (sameIncarnation && entity.lifecycleRevision < old.lifecycleRevision) {
      fail("lineage-mismatch", `keyframe entity ${id} lifecycle regressed`);
    }
    if (old && entity.incarnation > old.incarnation) {
      retired[id] = Math.max(retired[id] ?? -1, old.incarnation);
    }
    const components = {};
    const oldComponents = sameIncarnation ? old.components : {};
    for (const [name, component] of Object.entries(entity.components)) {
      const fence = oldComponents[name];
      const valueHash = frameFingerprint(component.value);
      if (fence && component.revision < fence.revision) {
        fail("lineage-mismatch", `keyframe component ${id}.${name} revision regressed`);
      }
      if (fence && component.revision === fence.revision
        && (!fence.present || valueHash !== fence.valueHash)) {
        fail("lineage-mismatch", `keyframe component ${id}.${name} changed without revision`);
      }
      if (fence?.present && component.revision > fence.revision && valueHash === fence.valueHash) {
        fail("lineage-mismatch", `keyframe component ${id}.${name} revision changed without value change`);
      }
      components[name] = { revision: component.revision, valueHash, present: true };
      componentCount += 1;
    }
    for (const [name, fence] of Object.entries(oldComponents)) {
      if (Object.hasOwn(components, name)) continue;
      if (fence.revision === Number.MAX_SAFE_INTEGER) fail("lineage-mismatch", `keyframe component ${id}.${name} revision overflow`);
      components[name] = {
        revision: fence.present ? fence.revision + 1 : fence.revision,
        valueHash: fence.valueHash,
        present: false,
      };
      componentCount += 1;
    }
    entities[id] = {
      incarnation: entity.incarnation,
      lifecycleRevision: entity.lifecycleRevision,
      components,
    };
  }
  for (const [id, old] of Object.entries(prior.entities)) {
    if (!currentIds.has(id)) retired[id] = Math.max(retired[id] ?? -1, old.incarnation);
  }
  if (Object.keys(entities).length > MAX_CONTINUITY_ENTITIES || componentCount > MAX_CONTINUITY_COMPONENTS) {
    fail("lineage-mismatch", "continuity fence exceeds bounded entry limits");
  }
  const result = deepFreeze({ entities, retired });
  if (canonicalJsonBytes(result).length > MAX_CONTINUITY_BYTES) fail("lineage-mismatch", "continuity fence exceeds bounded bytes");
  return result;
}

function normalizeRecoveryReason(reason) {
  if (RECOVERY_REASONS.has(reason)) return reason;
  if (/hash/i.test(reason)) return "hash-mismatch";
  if (/base/i.test(reason)) return "base-mismatch";
  if (/identity|recipient|owner/i.test(reason)) return "identity-mismatch";
  if (/large|oversize|bytes/i.test(reason)) return "oversize-frame";
  if (/lineage|order|cursor|incarnation|revision|lifecycle/i.test(reason)) return "lineage-mismatch";
  return "rejected-delta";
}

function selectClientReplicationMode({ wireVersion, capabilities = [] } = {}) {
  if (wireVersion !== "lbh-multiplayer-json-v2") return MODES.V1;
  if (!Array.isArray(capabilities)) return MODES.V1;
  if (capabilities.includes(STATIC_MANIFEST_CAPABILITY) && capabilities.includes(CAPABILITY)
      && capabilities.includes(MIXED_CAPABILITY)
      && capabilities.includes(RUNTIME_PUBLIC_COMPONENTS_CAPABILITY)) {
    return MODES.STATE_PAIR_RUNTIME_COMPONENTS;
  }
  if (capabilities.includes(STATIC_MANIFEST_CAPABILITY) && capabilities.includes(CAPABILITY)
      && capabilities.includes(MIXED_CAPABILITY)) return MODES.STATE_PAIR_MIXED;
  if (capabilities.includes(STATIC_MANIFEST_CAPABILITY) && capabilities.includes(CAPABILITY)) return MODES.STATE_PAIR;
  if (capabilities.includes(STATIC_MANIFEST_CAPABILITY)) return MODES.STATIC_MANIFEST;
  return MODES.V1;
}

function createClientDeltaReceiver({ context: rawContext, capabilities = [CAPABILITY],
  maxPairBytes = MAX_WIRE_PAIR_BYTES, onState = null, onRecovery = null } = {}) {
  let context = normalizeContext(rawContext);
  if (!Array.isArray(capabilities) || capabilities.some((value) => typeof value !== "string")) {
    throw new TypeError("capabilities must be a string array");
  }
  const allowMixed = capabilities.includes(MIXED_CAPABILITY) && capabilities.includes(CAPABILITY);
  const materializeRuntimeComponents = allowMixed
    && capabilities.includes(RUNTIME_PUBLIC_COMPONENTS_CAPABILITY);
  if (!Number.isSafeInteger(maxPairBytes) || maxPairBytes < 1024 || maxPairBytes > MAX_WIRE_PAIR_BYTES) {
    throw new RangeError(`maxPairBytes must be between 1024 and ${MAX_WIRE_PAIR_BYTES}`);
  }
  if (onState !== null && typeof onState !== "function") throw new TypeError("onState must be a function");
  if (onRecovery !== null && typeof onRecovery !== "function") throw new TypeError("onRecovery must be a function");

  let publicBase = null;
  let ownerBase = null;
  let publicRetired = Object.freeze({});
  let ownerRetired = Object.freeze({});
  let currentPair = null;
  let lastAcceptedPair = null;
  let publicContinuity = emptyContinuity();
  let ownerContinuity = emptyContinuity();
  let lastFrameId = 0;
  let lastFingerprint = null;
  let lastAck = null;
  let awaitingKeyframe = true;
  let recoveryRequested = false;
  let lastRecovery = null;
  const counters = {
    accepted: 0, keyframes: 0, deltas: 0, mixed: 0, duplicates: 0, rejected: 0,
    recoveryRequests: 0, observerFailures: 0,
  };

  function makeRecovery(reason, acceptedCursor = lastAcceptedPair) {
    const normalizedReason = normalizeRecoveryReason(reason);
    const request = deepFreeze({
      type: "statePairRecovery",
      recoverySchema: RECOVERY_SCHEMA,
      reason: normalizedReason,
      matchId: context.matchId,
      sessionId: context.sessionId,
      authorityIncarnation: context.authorityIncarnation,
      recipientId: context.recipientId,
      recipientIncarnation: context.recipientIncarnation,
      manifestSchema: context.manifestSchema,
      manifestHash: context.manifestHash,
      lastAcceptedFrameId: lastFrameId,
      lastAcceptedStatePairId: acceptedCursor?.statePairId || null,
      lastAcceptedSnapshotId: acceptedCursor?.snapshotId || null,
    });
    if (canonicalJsonBytes(request).length > 2048) fail("invalid-context", "recovery request exceeds bounded size");
    lastRecovery = request;
    counters.recoveryRequests += 1;
    try { onRecovery?.(request); } catch { counters.observerFailures += 1; }
    return request;
  }

  function discardUnsafeBases(reason, acceptedCursor = lastAcceptedPair) {
    publicBase = null;
    ownerBase = null;
    currentPair = null;
    // Once either lane is unsafe, the old ACK cannot be replayed: the authority
    // would keep publishing deltas against a base the client erased. The
    // fingerprint and trusted one-pair fence remain so the same frame id cannot
    // change bytes or regress lifecycle history during keyframe recovery.
    lastAck = null;
    awaitingKeyframe = true;
    recoveryRequested = true;
    return makeRecovery(reason, acceptedCursor);
  }

  function reject(reason) {
    counters.rejected += 1;
    return Object.freeze({ accepted: false, duplicate: false, reason: normalizeRecoveryReason(reason),
      recovery: discardUnsafeBases(reason) });
  }

  function validateOwnerProjection(view) {
    for (const entity of view.entities) {
      if (entity.sourceId !== context.recipientId) fail("owner-mismatch", "owner projection contains another recipient");
    }
  }

  function materializeLane(lane, payload, base, retired) {
    if (payload.kind === "keyframe") {
      const view = normalizeView(payload.projection);
      if (projectionHash(view) !== payload.resultHash) fail("hash-mismatch", `${lane} keyframe hash mismatch`);
      return Object.freeze({ view, hash: payload.resultHash, retired });
    }
    if (!base) fail("missing-base", `${lane} delta has no materialized base`);
    if (payload.baseSnapshotId !== base.view.snapshotId || payload.baseHash !== base.hash) {
      fail("base-mismatch", `${lane} delta base does not match materialized state`);
    }
    const applied = applyStructuralDelta(base.view, payload.delta, {
      expectedResultHash: payload.resultHash,
      retainedIncarnations: retired,
    });
    return Object.freeze({ view: applied.view, hash: applied.resultHash, retired: applied.retainedIncarnations });
  }

  function assertRelativeLineage(frame) {
    if (!lastAcceptedPair) return;
    if (frame.tick < lastAcceptedPair.tick || frame.simTime < lastAcceptedPair.simTime
      || frame.eventWatermark < lastAcceptedPair.eventWatermark
      || frame.fieldRevision < lastAcceptedPair.fieldRevision
      || frame.ballparkEpoch < lastAcceptedPair.ballparkEpoch) {
      fail("lineage-mismatch", "state-pair lineage regressed");
    }
    if (frame.statePairId === lastAcceptedPair.statePairId || frame.snapshotId === lastAcceptedPair.snapshotId) {
      fail("lineage-mismatch", "new state pair reused an accepted cursor");
    }
  }

  function assertMaterializedLineage(lane, view, frame) {
    const expected = {
      lane,
      runId: frame.matchId,
      authorityEpoch: frame.authorityIncarnation,
      connectionEpoch: frame.recipientIncarnation,
      ballparkEpoch: frame.ballparkEpoch,
      manifestHash: frame.manifestHash,
      statePairId: frame.statePairId,
      snapshotId: frame.snapshotId,
      tick: frame.tick,
      simTime: frame.simTime,
      eventWatermark: frame.eventWatermark,
      fieldRevision: frame.fieldRevision,
      overloadMode: frame.overloadMode,
    };
    for (const [field, value] of Object.entries(expected)) {
      if (view[field] !== value) fail("lineage-mismatch", `${lane} materialized ${field} disagrees with frame`);
    }
  }

  function receive(raw) {
    let frame;
    try {
      const bytes = wireBytes(raw);
      if (bytes > maxPairBytes) return reject("oversize-frame");
      frame = parseWireFrame(raw, { direction: SERVER_TO_CLIENT });
      scanForbiddenKeys(frame);
      if (frame.type !== "statePair"
          || (frame.pairSchema !== PAIR_SCHEMA && (!allowMixed || frame.pairSchema !== MIXED_PAIR_SCHEMA))) {
        fail("malformed-frame", "expected a negotiated statePair frame");
      }
      if (!sameContextIdentity(context, frame)) fail("identity-mismatch", "state-pair identity does not match receiver");
      if (frame.manifestHash !== context.manifestHash) fail("manifest-mismatch", "state-pair manifest does not match receiver");
      for (const field of ["tick", "simTime", "eventWatermark", "fieldRevision", "ballparkEpoch"]) {
        if (Object.is(frame[field], -0)) fail("lineage-mismatch", `state-pair ${field} cannot be negative zero`);
      }

      const fingerprint = frameFingerprint(frame);
      if (frame.frameId === lastFrameId && lastFingerprint && fingerprint !== lastFingerprint) {
        fail("duplicate-mismatch", "duplicate frame id changed bytes");
      }
      if (frame.frameId === lastFrameId && lastAck) {
        counters.duplicates += 1;
        return Object.freeze({ accepted: true, duplicate: true, ack: lastAck, state: currentPair });
      }
      if (frame.frameId < lastFrameId) fail("stale-frame", "state-pair frame is stale");
      if (lastFrameId === 0 && !recoveryRequested && frame.frameId !== 1) fail("frame-gap", "initial state-pair frame must start at one");
      if (!awaitingKeyframe && frame.frameId !== lastFrameId + 1) fail("frame-gap", "state-pair frame gap detected");
      if (awaitingKeyframe && (frame.public.kind !== "keyframe" || frame.owner.kind !== "keyframe")) {
        fail("missing-base", "recovery requires keyframes for both atomic lanes");
      }
      if (frame.frameId !== lastFrameId) assertRelativeLineage(frame);

      // Both lanes are materialized into locals. No observable receiver state
      // changes until the complete pair and both hashes have passed.
      const nextPublic = materializeLane("public", frame.public, publicBase, publicRetired);
      const nextOwner = materializeLane("owner", frame.owner, ownerBase, ownerRetired);
      assertMaterializedLineage("public", nextPublic.view, frame);
      assertMaterializedLineage("owner", nextOwner.view, frame);
      validateOwnerProjection(nextOwner.view);
      const nextPublicContinuity = advanceContinuity(nextPublic.view, publicContinuity);
      const nextOwnerContinuity = advanceContinuity(nextOwner.view, ownerContinuity);
      // Reconstruction happens before any receiver state is published. A
      // missing/unknown component therefore rejects the entire pair rather
      // than exposing an intermediate half-materialized entity.
      const legacyPublicEntities = materializeRuntimeComponents
        ? reconstructLegacyPublicEntities(nextPublic.view)
        : null;
      const pair = deepFreeze({
        matchId: frame.matchId,
        sessionId: frame.sessionId,
        authorityIncarnation: frame.authorityIncarnation,
        recipientId: frame.recipientId,
        recipientIncarnation: frame.recipientIncarnation,
        manifestSchema: context.manifestSchema,
        manifestHash: frame.manifestHash,
        frameId: frame.frameId,
        statePairId: frame.statePairId,
        snapshotId: frame.snapshotId,
        tick: frame.tick,
        simTime: frame.simTime,
        eventWatermark: frame.eventWatermark,
        fieldRevision: frame.fieldRevision,
        overloadMode: frame.overloadMode,
        ballparkEpoch: frame.ballparkEpoch,
        public: nextPublic.view,
        owner: nextOwner.view,
        ...(legacyPublicEntities ? { legacyPublicEntities } : {}),
      });
      const ack = deepFreeze({
        type: "ack",
        ackKind: "statePair",
        ackSchema: frame.pairSchema === MIXED_PAIR_SCHEMA ? MIXED_ACK_SCHEMA : ACK_SCHEMA,
        matchId: frame.matchId,
        sessionId: frame.sessionId,
        authorityIncarnation: frame.authorityIncarnation,
        recipientId: frame.recipientId,
        recipientIncarnation: frame.recipientIncarnation,
        frameId: frame.frameId,
        statePairId: frame.statePairId,
        snapshotId: frame.snapshotId,
        publicHash: nextPublic.hash,
        ownerHash: nextOwner.hash,
        ...(frame.pairSchema === MIXED_PAIR_SCHEMA ? {
          pairSchema: frame.pairSchema,
          tick: frame.tick,
          simTime: frame.simTime,
          eventWatermark: frame.eventWatermark,
          fieldRevision: frame.fieldRevision,
          overloadMode: frame.overloadMode,
          ballparkEpoch: frame.ballparkEpoch,
          manifestHash: frame.manifestHash,
          publicKind: frame.public.kind,
          ownerKind: frame.owner.kind,
          publicBaseSnapshotId: frame.public.baseSnapshotId || null,
          ownerBaseSnapshotId: frame.owner.baseSnapshotId || null,
        } : {}),
      });

      publicBase = Object.freeze({ view: nextPublic.view, hash: nextPublic.hash });
      ownerBase = Object.freeze({ view: nextOwner.view, hash: nextOwner.hash });
      publicContinuity = nextPublicContinuity;
      ownerContinuity = nextOwnerContinuity;
      publicRetired = nextPublicContinuity.retired;
      ownerRetired = nextOwnerContinuity.retired;
      currentPair = pair;
      lastAcceptedPair = pair;
      lastFrameId = frame.frameId;
      lastFingerprint = fingerprint;
      lastAck = ack;
      awaitingKeyframe = false;
      recoveryRequested = false;
      lastRecovery = null;
      counters.accepted += 1;
      counters[frame.public.kind === frame.owner.kind
        ? frame.public.kind === "keyframe" ? "keyframes" : "deltas" : "mixed"] += 1;
      try { onState?.(pair); } catch { counters.observerFailures += 1; }
      return Object.freeze({ accepted: true, duplicate: false, ack, state: pair });
    } catch (error) {
      return reject(error?.code || "malformed-frame");
    }
  }

  function reconnect(rawNextContext = context, reason = "reconnect") {
    let next;
    try {
      next = normalizeContext(rawNextContext);
    } catch (error) {
      if (typeof rawNextContext?.manifestSchema === "string"
        && rawNextContext.manifestSchema !== DEFAULT_MANIFEST_SCHEMA) {
        return discardUnsafeBases("schema-changed", null);
      }
      throw error;
    }
    let recoveryReason = reason;
    const identityChanged = next.matchId !== context.matchId || next.sessionId !== context.sessionId
      || next.authorityIncarnation !== context.authorityIncarnation
      || next.recipientId !== context.recipientId || next.recipientIncarnation !== context.recipientIncarnation
      || next.manifestSchema !== context.manifestSchema || next.manifestHash !== context.manifestHash;
    if (next.matchId !== context.matchId) recoveryReason = "match-changed";
    else if (next.sessionId !== context.sessionId) recoveryReason = "session-changed";
    else if (next.authorityIncarnation !== context.authorityIncarnation) recoveryReason = "authority-changed";
    else if (next.recipientId !== context.recipientId || next.recipientIncarnation !== context.recipientIncarnation) recoveryReason = "recipient-changed";
    else if (next.manifestSchema !== context.manifestSchema) recoveryReason = "schema-changed";
    else if (next.manifestHash !== context.manifestHash) recoveryReason = "manifest-changed";
    context = next;
    lastFrameId = 0;
    lastFingerprint = null;
    lastAck = null;
    if (identityChanged) {
      lastAcceptedPair = null;
      publicContinuity = emptyContinuity();
      ownerContinuity = emptyContinuity();
      publicRetired = Object.freeze({});
      ownerRetired = Object.freeze({});
    }
    return discardUnsafeBases(recoveryReason, null);
  }

  function current() {
    return currentPair;
  }

  function diagnostics() {
    return deepFreeze({
      ...counters,
      mode: materializeRuntimeComponents
        ? MODES.STATE_PAIR_RUNTIME_COMPONENTS
        : allowMixed ? MODES.STATE_PAIR_MIXED : MODES.STATE_PAIR,
      awaitingKeyframe,
      hasPublicBase: Boolean(publicBase),
      hasOwnerBase: Boolean(ownerBase),
      lastFrameId,
      retainedPublicIdentities: Object.keys(publicRetired).length,
      retainedOwnerIdentities: Object.keys(ownerRetired).length,
      retainedPairHistory: lastFingerprint ? 1 : 0,
      lastRecovery,
      limits: { maxPairBytes, maxRetainedPairHistory: 1 },
    });
  }

  return Object.freeze({ receive, reconnect, current, diagnostics });
}

module.exports = {
  CAPABILITY,
  MIXED_CAPABILITY,
  RUNTIME_PUBLIC_COMPONENTS_CAPABILITY,
  RECOVERY_SCHEMA,
  DEFAULT_MANIFEST_SCHEMA,
  MODES,
  ClientDeltaError,
  selectClientReplicationMode,
  createClientDeltaReceiver,
};
