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
  reconstructLegacyPublicState,
} = require("./runtime-public-schema.cjs");
const {
  CAPABILITY: POSITIONAL_CODEC_CAPABILITY,
  POSITIONAL_CODEC_MANIFEST_HASH,
  codecContext: positionalCodecContext,
} = require("./state-pair-positional-codec.cjs");
const {
  CAPABILITY: BINARY_CODEC_CAPABILITY,
  BINARY_CODEC_MANIFEST_HASH,
  codecContext: binaryCodecContext,
} = require("./state-pair-binary-codec.cjs");
const {
  CAPABILITY: COMPRESSION_CODEC_CAPABILITY,
  MANIFEST_HASH: COMPRESSION_CODEC_MANIFEST_HASH,
  decodeCompressedStatePair,
} = require("./state-pair-compression-codec.cjs");
const {
  CAPABILITY: PUBLIC_BODY_CAPABILITY,
  PAIR_SCHEMA: PUBLIC_BODY_PAIR_SCHEMA,
  BODY_SCHEMA: PUBLIC_BODY_SCHEMA,
  codecContext: publicBodyCodecContext,
  decodePublicBodyFrame,
} = require("./state-pair-public-body-codec.cjs");

const CAPABILITY = "state-pair-v1";
const MIXED_CAPABILITY = "state-pair-mixed-v1";
const STATIC_MANIFEST_CAPABILITY = "static-manifest-v1";
const RECOVERY_SCHEMA = "lbh-client-state-pair-recovery-v1";
const DEFAULT_MANIFEST_SCHEMA = "lbh-session-replication-manifest-v1";
const FORBIDDEN_KEYS = new Set(["__proto__", "prototype", "constructor"]);
const MAX_CONTINUITY_ENTITIES = 8192;
const MAX_CONTINUITY_COMPONENTS = 16384;
const MAX_CONTINUITY_BYTES = 1024 * 1024;
const DEFAULT_BASE_LEDGER_LIMITS = Object.freeze({
  // Count is secondary to the hard byte ceiling: high-recipient local
  // overload can stretch authority/ACK delivery far beyond a dozen beats.
  // Sixty-four exact materialized bases preserve those branches while the
  // eight-MiB and age guards keep the cache finite.
  maxEntries: 64,
  maxBytes: 8 * 1024 * 1024,
  maxAgeMs: 60 * 1000,
  minRecoveryIntervalMs: 250,
});
const MODES = Object.freeze({
  V1: "v1",
  STATIC_MANIFEST: "static-manifest-v1",
  STATE_PAIR: CAPABILITY,
  STATE_PAIR_MIXED: MIXED_CAPABILITY,
  STATE_PAIR_RUNTIME_COMPONENTS: RUNTIME_PUBLIC_COMPONENTS_CAPABILITY,
  STATE_PAIR_POSITIONAL_JSON: POSITIONAL_CODEC_CAPABILITY,
  STATE_PAIR_BINARY: BINARY_CODEC_CAPABILITY,
  STATE_PAIR_COMPRESSION: COMPRESSION_CODEC_CAPABILITY,
  STATE_PAIR_PUBLIC_BODY: PUBLIC_BODY_CAPABILITY,
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

function advanceContinuity(view, prior = emptyContinuity(), { allowUnseenRevisionHistory = false } = {}) {
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
      if (fence?.present && component.revision > fence.revision && valueHash === fence.valueHash
          && !allowUnseenRevisionHistory) {
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
  if (/compression/i.test(reason)) return "malformed-frame";
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
      && capabilities.includes(RUNTIME_PUBLIC_COMPONENTS_CAPABILITY)
      && capabilities.includes(POSITIONAL_CODEC_CAPABILITY)
      && capabilities.includes(BINARY_CODEC_CAPABILITY)) {
    return MODES.STATE_PAIR_BINARY;
  }
  if (capabilities.includes(STATIC_MANIFEST_CAPABILITY) && capabilities.includes(CAPABILITY)
      && capabilities.includes(MIXED_CAPABILITY)
      && capabilities.includes(RUNTIME_PUBLIC_COMPONENTS_CAPABILITY)
      && capabilities.includes(POSITIONAL_CODEC_CAPABILITY)
      && capabilities.includes(COMPRESSION_CODEC_CAPABILITY)) {
    return MODES.STATE_PAIR_COMPRESSION;
  }
  if (capabilities.includes(STATIC_MANIFEST_CAPABILITY) && capabilities.includes(CAPABILITY)
      && capabilities.includes(MIXED_CAPABILITY)
      && capabilities.includes(RUNTIME_PUBLIC_COMPONENTS_CAPABILITY)
      && capabilities.includes(POSITIONAL_CODEC_CAPABILITY)) {
    return MODES.STATE_PAIR_POSITIONAL_JSON;
  }
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
  maxPairBytes = MAX_WIRE_PAIR_BYTES, onState = null, onRecovery = null,
  baseLedgerLimits = {}, now = Date.now } = {}) {
  let context = normalizeContext(rawContext);
  if (!Array.isArray(capabilities) || capabilities.some((value) => typeof value !== "string")) {
    throw new TypeError("capabilities must be a string array");
  }
  const allowMixed = capabilities.includes(MIXED_CAPABILITY) && capabilities.includes(CAPABILITY);
  const materializeRuntimeComponents = allowMixed
    && capabilities.includes(RUNTIME_PUBLIC_COMPONENTS_CAPABILITY);
  const positional = materializeRuntimeComponents && capabilities.includes(POSITIONAL_CODEC_CAPABILITY);
  const binary = positional && capabilities.includes(BINARY_CODEC_CAPABILITY);
  const compressed = positional && !binary && capabilities.includes(COMPRESSION_CODEC_CAPABILITY);
  const publicBody = compressed && capabilities.includes(PUBLIC_BODY_CAPABILITY);
  let codecContext = positional ? positionalCodecContext({ ...context,
    codecManifestHash: POSITIONAL_CODEC_MANIFEST_HASH }) : null;
  let binaryContext = binary ? binaryCodecContext({ ...context,
    codecManifestHash: BINARY_CODEC_MANIFEST_HASH }) : null;
  let compressionContext = compressed
    ? Object.freeze({ compressionManifestHash: COMPRESSION_CODEC_MANIFEST_HASH }) : null;
  let bodyCodecContext = publicBody ? publicBodyCodecContext(context) : null;
  if (!Number.isSafeInteger(maxPairBytes) || maxPairBytes < 1024 || maxPairBytes > MAX_WIRE_PAIR_BYTES) {
    throw new RangeError(`maxPairBytes must be between 1024 and ${MAX_WIRE_PAIR_BYTES}`);
  }
  if (onState !== null && typeof onState !== "function") throw new TypeError("onState must be a function");
  if (onRecovery !== null && typeof onRecovery !== "function") throw new TypeError("onRecovery must be a function");
  if (typeof now !== "function") throw new TypeError("now must be a function");
  const ledgerLimits = Object.freeze(Object.fromEntries(Object.entries(DEFAULT_BASE_LEDGER_LIMITS)
    .map(([key, fallback]) => {
      const value = baseLedgerLimits[key] === undefined ? fallback : Number(baseLedgerLimits[key]);
      if (!Number.isSafeInteger(value) || value < 1) throw new RangeError(`${key} must be a positive safe integer`);
      return [key, value];
    })));

  function codecBinding() {
    return binary
      ? `${BINARY_CODEC_CAPABILITY}:${BINARY_CODEC_MANIFEST_HASH}`
      : positional
      ? `${POSITIONAL_CODEC_CAPABILITY}:${POSITIONAL_CODEC_MANIFEST_HASH}`
      : materializeRuntimeComponents ? RUNTIME_PUBLIC_COMPONENTS_CAPABILITY
        : allowMixed ? MIXED_CAPABILITY : CAPABILITY;
  }

  function bindingKey() {
    return [context.matchId, context.sessionId, context.authorityIncarnation, context.recipientId,
      context.recipientIncarnation, context.manifestSchema, context.manifestHash, codecBinding()]
      .map((part) => `${String(part).length}:${part}`).join("");
  }

  let currentPair = null;
  let lastAcceptedPair = null;
  let visiblePublicContinuity = emptyContinuity();
  let visibleOwnerContinuity = emptyContinuity();
  let lastFrameId = 0;
  let lastVisibleFingerprint = null;
  let lastAck = null;
  let admitted = false;
  let closed = false;
  let recoveryEpisode = null;
  let lastRecovery = null;
  let lastRecoveryAt = Number.NEGATIVE_INFINITY;
  let ledgerBytes = 0;
  let ledgerHighWaterBytes = 0;
  const ledger = new Map();
  const publicIndex = new Map();
  const ownerIndex = new Map();
  const snapshotIndex = new Map();
  const statePairIndex = new Map();
  const rejectionReasons = new Map();
  const recoveryReasons = new Map();
  const evictionReasons = new Map();
  const counters = {
    accepted: 0, keyframes: 0, deltas: 0, mixed: 0, duplicates: 0, rejected: 0,
    staleAccepted: 0, published: 0, recoveryRequests: 0, recoveryEpisodes: 0,
    recoveryCoalesced: 0, recoveryRateLimited: 0, recoveryConvergences: 0,
    observerFailures: 0, ledgerHits: 0, ledgerMisses: 0, ledgerEvictions: 0,
    publicBodyKeyframes: 0, publicBodyDeltas: 0, publicBodyBaseHits: 0,
    publicBodyBaseMisses: 0, publicBodyEvictions: 0,
  };
  const bodyLedger = new Map();

  function bodyHash(body) {
    return `sha256:${crypto.createHash("sha256").update(canonicalJsonBytes(body)).digest("hex")}`;
  }

  function bodyInternalView(body) {
    return normalizeView({ schema: "lbh-canonical-projection-v1", lane: "public",
      runId: body.matchId, authorityEpoch: body.authorityIncarnation, connectionEpoch: 1,
      ballparkEpoch: body.ballparkEpoch, manifestHash: body.manifestHash,
      statePairId: body.bodyId, snapshotId: body.bodyId, tick: body.bodyRevision,
      simTime: body.bodyRevision, eventWatermark: 0, fieldRevision: 0,
      overloadMode: "NORMAL", world: body.world, entities: body.entities });
  }

  function retainBody(record) {
    bodyLedger.delete(record.body.bodyId);
    bodyLedger.set(record.body.bodyId, record);
    while (bodyLedger.size > 16) {
      bodyLedger.delete(bodyLedger.keys().next().value);
      counters.publicBodyEvictions += 1;
    }
  }

  function materializePublicBody(frame) {
    let body;
    let internalView;
    if (frame.public.kind === "keyframe") {
      body = frame.public.body;
      internalView = bodyInternalView(body);
      counters.publicBodyKeyframes += 1;
    } else {
      const base = bodyLedger.get(frame.public.baseBodyId);
      if (!base) {
        counters.publicBodyBaseMisses += 1;
        fail("missing-base", "public body delta named no retained global base");
      }
      counters.publicBodyBaseHits += 1;
      if (base.bodyHash !== frame.public.baseHash
          || base.body.bodyRevision !== frame.public.baseBodyRevision
          || projectionHash(base.internalView) !== frame.public.structuralBaseHash) {
        fail("base-mismatch", "public body delta base binding differs from retained body");
      }
      const applied = applyStructuralDelta(base.internalView, frame.public.delta,
        { expectedResultHash: frame.public.structuralResultHash });
      internalView = applied.view;
      body = deepFreeze({ schema: PUBLIC_BODY_SCHEMA, matchId: frame.matchId,
        authorityIncarnation: frame.authorityIncarnation, ballparkEpoch: frame.ballparkEpoch,
        manifestHash: frame.manifestHash, bodyId: frame.bodyId, bodyRevision: frame.bodyRevision,
        world: internalView.world, entities: internalView.entities });
      counters.publicBodyDeltas += 1;
    }
    if (body.bodyId !== frame.bodyId || body.bodyRevision !== frame.bodyRevision
        || bodyHash(body) !== frame.bodyHash) fail("hash-mismatch", "public body result hash mismatch");
    const record = deepFreeze({ body, bodyHash: frame.bodyHash, internalView });
    retainBody(record);
    const projection = normalizeView({ schema: "lbh-canonical-projection-v1", lane: "public",
      runId: frame.matchId, authorityEpoch: frame.authorityIncarnation,
      connectionEpoch: frame.recipientIncarnation, ballparkEpoch: frame.ballparkEpoch,
      manifestHash: frame.manifestHash, statePairId: frame.statePairId,
      snapshotId: frame.snapshotId, tick: frame.tick, simTime: frame.simTime,
      eventWatermark: frame.eventWatermark, fieldRevision: frame.fieldRevision,
      overloadMode: frame.overloadMode, world: body.world, entities: body.entities });
    return Object.freeze({ body, projection, projectionHash: projectionHash(projection),
      bodyHash: frame.bodyHash, kind: frame.public.kind,
      baseBodyId: frame.public.kind === "delta" ? frame.public.baseBodyId : null });
  }

  function count(map, key) {
    map.set(key, (map.get(key) || 0) + 1);
  }

  function laneKey(snapshotId, hash) {
    return `${snapshotId.length}:${snapshotId}${hash.length}:${hash}`;
  }

  function rebuildIndexes() {
    publicIndex.clear();
    ownerIndex.clear();
    snapshotIndex.clear();
    statePairIndex.clear();
    for (const entry of ledger.values()) {
      publicIndex.set(laneKey(entry.snapshotId, entry.publicBase.hash), entry.frameId);
      ownerIndex.set(laneKey(entry.snapshotId, entry.ownerBase.hash), entry.frameId);
      snapshotIndex.set(entry.snapshotId, entry.frameId);
      statePairIndex.set(entry.statePairId, entry.frameId);
    }
  }

  function evict(frameId, reason) {
    const entry = ledger.get(frameId);
    if (!entry) return;
    ledger.delete(frameId);
    ledgerBytes -= entry.bytes;
    counters.ledgerEvictions += 1;
    count(evictionReasons, reason);
  }

  function enforceLedgerBounds(wallMs = now()) {
    for (const [frameId, entry] of ledger) {
      if (wallMs - entry.materializedAtMs > ledgerLimits.maxAgeMs) evict(frameId, "age");
    }
    while (ledger.size > ledgerLimits.maxEntries || ledgerBytes > ledgerLimits.maxBytes) {
      const candidates = [...ledger.keys()].filter((frameId) => frameId !== lastFrameId);
      const oldestFrameId = Math.min(...(candidates.length ? candidates : ledger.keys()));
      evict(oldestFrameId, ledger.size > ledgerLimits.maxEntries ? "frame-count" : "bytes");
    }
    rebuildIndexes();
  }

  function clearLedger() {
    ledger.clear();
    ledgerBytes = 0;
    rebuildIndexes();
  }

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
    lastRecoveryAt = now();
    counters.recoveryRequests += 1;
    count(recoveryReasons, normalizedReason);
    try { onRecovery?.(request); } catch { counters.observerFailures += 1; }
    return request;
  }

  function requestRecovery(reason) {
    if (!recoveryEpisode) {
      recoveryEpisode = { binding: bindingKey(), reason: normalizeRecoveryReason(reason), requested: false };
      counters.recoveryEpisodes += 1;
    } else {
      counters.recoveryCoalesced += 1;
    }
    if (recoveryEpisode.requested) return null;
    if (now() - lastRecoveryAt < ledgerLimits.minRecoveryIntervalMs) {
      counters.recoveryRateLimited += 1;
      return null;
    }
    recoveryEpisode.requested = true;
    return makeRecovery(recoveryEpisode.reason);
  }

  function beginExplicitRecovery(reason) {
    const normalizedReason = normalizeRecoveryReason(reason);
    if (recoveryEpisode?.binding === bindingKey() && recoveryEpisode.requested
        && recoveryEpisode.reason === normalizedReason) {
      counters.recoveryCoalesced += 1;
      return null;
    }
    recoveryEpisode = { binding: bindingKey(), reason: normalizedReason, requested: true };
    counters.recoveryEpisodes += 1;
    return makeRecovery(normalizedReason);
  }

  function reject(reason, { recoverable = false } = {}) {
    const normalizedReason = normalizeRecoveryReason(reason);
    counters.rejected += 1;
    count(rejectionReasons, normalizedReason);
    const recovery = recoverable ? requestRecovery(normalizedReason) : null;
    return Object.freeze({ accepted: false, duplicate: false, reason: normalizedReason,
      ...(recovery ? { recovery } : {}) });
  }

  function validateOwnerProjection(view) {
    for (const entity of view.entities) {
      if (entity.sourceId !== context.recipientId) fail("owner-mismatch", "owner projection contains another recipient");
    }
  }

  function resolveBase(lane, payload) {
    const index = lane === "public" ? publicIndex : ownerIndex;
    const frameId = index.get(laneKey(payload.baseSnapshotId, payload.baseHash));
    if (frameId === undefined) {
      counters.ledgerMisses += 1;
      const snapshotKnown = snapshotIndex.has(payload.baseSnapshotId);
      fail(snapshotKnown ? "base-mismatch" : "missing-base",
        `${lane} delta named no exact retained atomic base`);
    }
    const entry = ledger.get(frameId);
    if (!entry || entry.binding !== bindingKey()) fail("identity-mismatch", `${lane} base binding changed`);
    counters.ledgerHits += 1;
    return entry;
  }

  function materializeLane(lane, payload, baseEntry) {
    if (payload.kind === "keyframe") {
      const view = normalizeView(payload.projection);
      if (projectionHash(view) !== payload.resultHash) fail("hash-mismatch", `${lane} keyframe hash mismatch`);
      return Object.freeze({ view, hash: payload.resultHash, baseEntry: null });
    }
    const base = lane === "public" ? baseEntry.publicBase : baseEntry.ownerBase;
    const continuity = lane === "public" ? baseEntry.publicContinuity : baseEntry.ownerContinuity;
    if (payload.baseSnapshotId !== base.view.snapshotId || payload.baseHash !== base.hash) {
      fail("base-mismatch", `${lane} delta base changed after selection`);
    }
    const applied = applyStructuralDelta(base.view, payload.delta, {
      expectedResultHash: payload.resultHash,
      retainedIncarnations: continuity.retired,
    });
    return Object.freeze({ view: applied.view, hash: applied.resultHash, baseEntry });
  }

  function assertRelativeLineage(frame, baseEntries) {
    for (const base of baseEntries) {
      if (frame.frameId <= base.frameId || frame.tick < base.tick || frame.simTime < base.simTime
        || frame.eventWatermark < base.eventWatermark || frame.fieldRevision < base.fieldRevision
        || frame.ballparkEpoch < base.ballparkEpoch) {
        fail("lineage-mismatch", "state-pair lineage regressed from its advertised base");
      }
    }
  }

  function shouldPublish(frame) {
    if (!currentPair) return true;
    return frame.frameId > currentPair.frameId && frame.tick >= currentPair.tick
      && frame.simTime >= currentPair.simTime && frame.eventWatermark >= currentPair.eventWatermark
      && frame.fieldRevision >= currentPair.fieldRevision && frame.ballparkEpoch >= currentPair.ballparkEpoch;
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
    let bodyMeta = null;
    try {
      if (closed) fail("invalid-context", "receiver is torn down");
      enforceLedgerBounds();
      const bytes = wireBytes(raw);
      if (bytes > maxPairBytes) return reject("oversize-frame");
      if (compressed && typeof raw === "string") {
        fail("compression-frame-required", "negotiated compressed state-pair must use its pinned binary envelope");
      }
      frame = publicBody
        ? decodePublicBodyFrame(decodeCompressedStatePair(raw), bodyCodecContext)
        : parseWireFrame(raw, { direction: SERVER_TO_CLIENT,
        ...(compressed ? { compressed: true, compressionContext, positionalContext: codecContext }
          : binary ? (typeof raw !== "string"
          ? { binary: true, binaryContext }
          : { requireBinary: true })
          : positional ? { positionalContext: codecContext, requirePositional: true } : {}) });
      scanForbiddenKeys(frame);
      if (frame.type !== "statePair"
          || (frame.pairSchema !== PAIR_SCHEMA && (!allowMixed || frame.pairSchema !== MIXED_PAIR_SCHEMA)
            && (!publicBody || frame.pairSchema !== PUBLIC_BODY_PAIR_SCHEMA))) {
        fail("malformed-frame", "expected a negotiated statePair frame");
      }
      if (!sameContextIdentity(context, frame)) fail("identity-mismatch", "state-pair identity does not match receiver");
      if (frame.manifestHash !== context.manifestHash) fail("manifest-mismatch", "state-pair manifest does not match receiver");
      for (const field of ["tick", "simTime", "eventWatermark", "fieldRevision", "ballparkEpoch"]) {
        if (Object.is(frame[field], -0)) fail("lineage-mismatch", `state-pair ${field} cannot be negative zero`);
      }

      const fingerprint = frameFingerprint(frame);
      const retainedDuplicate = ledger.get(frame.frameId);
      if (frame.frameId === lastFrameId && lastVisibleFingerprint
          && fingerprint !== lastVisibleFingerprint) {
        fail("duplicate-mismatch", "visible frame id changed bytes after ledger eviction");
      }
      if (retainedDuplicate && fingerprint !== retainedDuplicate.fingerprint) {
        fail("duplicate-mismatch", "duplicate frame id changed bytes");
      }
      if (retainedDuplicate) {
        counters.duplicates += 1;
        return Object.freeze({ accepted: true, duplicate: true, published: false,
          ack: lastAck, state: currentPair });
      }
      if (publicBody) {
        bodyMeta = materializePublicBody(frame);
        frame = deepFreeze({ ...frame, pairSchema: MIXED_PAIR_SCHEMA,
          public: deepFreeze({ kind: "keyframe", resultHash: bodyMeta.projectionHash,
            projection: bodyMeta.projection }) });
      }
      if (!admitted && (frame.public.kind !== "keyframe" || frame.owner.kind !== "keyframe")) {
        fail("missing-base", "admission or explicit rebase requires both atomic keyframes");
      }
      if (!admitted && currentPair && frame.frameId <= lastFrameId) {
        fail("stale-frame", "explicit rebase fences frames at or below the retained presentation cursor");
      }
      if (recoveryEpisode?.requested
          && (frame.public.kind !== "keyframe" || frame.owner.kind !== "keyframe")) {
        fail("missing-base", "an outstanding recovery request fences dependent deltas until an atomic keyframe");
      }

      const publicBaseEntry = frame.public.kind === "delta" ? resolveBase("public", frame.public) : null;
      const ownerBaseEntry = frame.owner.kind === "delta" ? resolveBase("owner", frame.owner) : null;
      if (publicBaseEntry && ownerBaseEntry && publicBaseEntry !== ownerBaseEntry) {
        fail("base-mismatch", "public and owner deltas name different atomic base pairs");
      }
      const baseEntries = [...new Set([publicBaseEntry, ownerBaseEntry].filter(Boolean))];
      assertRelativeLineage(frame, baseEntries);

      // Both lanes are materialized into locals. No observable receiver state
      // changes until the complete pair and both hashes have passed.
      const nextPublic = materializeLane("public", frame.public, publicBaseEntry);
      const nextOwner = materializeLane("owner", frame.owner, ownerBaseEntry);
      assertMaterializedLineage("public", nextPublic.view, frame);
      assertMaterializedLineage("owner", nextOwner.view, frame);
      validateOwnerProjection(nextOwner.view);
      // A recovery keyframe may legitimately summarize value transitions that
      // occurred in coalesced frames. Sparse deltas still reject revision-only
      // updates; only the explicitly requested full rebase may advance an
      // unseen revision while restoring the same current value.
      const recoveryKeyframe = (!admitted || recoveryEpisode)
        && frame.public.kind === "keyframe" && frame.owner.kind === "keyframe";
      const unseenBranchHistory = baseEntries.some((entry) => frame.frameId > entry.frameId + 1)
        || (currentPair && frame.frameId > currentPair.frameId + 1);
      const publish = shouldPublish(frame);
      const branchPublicContinuity = publicBaseEntry?.publicContinuity
        || (!publish && currentPair ? emptyContinuity() : visiblePublicContinuity);
      const branchOwnerContinuity = ownerBaseEntry?.ownerContinuity
        || (!publish && currentPair ? emptyContinuity() : visibleOwnerContinuity);
      let nextPublicContinuity = advanceContinuity(nextPublic.view, branchPublicContinuity,
        { allowUnseenRevisionHistory: recoveryKeyframe || unseenBranchHistory });
      let nextOwnerContinuity = advanceContinuity(nextOwner.view, branchOwnerContinuity,
        { allowUnseenRevisionHistory: recoveryKeyframe || unseenBranchHistory });
      if (publish && currentPair && (publicBaseEntry?.frameId !== currentPair.frameId
          || ownerBaseEntry?.frameId !== currentPair.frameId)) {
        nextPublicContinuity = advanceContinuity(nextPublic.view, visiblePublicContinuity,
          { allowUnseenRevisionHistory: true });
        nextOwnerContinuity = advanceContinuity(nextOwner.view, visibleOwnerContinuity,
          { allowUnseenRevisionHistory: true });
      }
      // Reconstruction happens before any receiver state is published. A
      // missing/unknown component therefore rejects the entire pair rather
      // than exposing an intermediate half-materialized entity.
      const legacyPublicEntities = materializeRuntimeComponents
        ? reconstructLegacyPublicEntities(nextPublic.view)
        : null;
      const legacyPublicState = materializeRuntimeComponents
        ? reconstructLegacyPublicState(nextPublic.view)
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
        ...(bodyMeta ? { publicBodyId: bodyMeta.body.bodyId,
          publicBodyRevision: bodyMeta.body.bodyRevision, publicBodyHash: bodyMeta.bodyHash } : {}),
        ...(legacyPublicEntities ? { legacyPublicEntities } : {}),
        ...(legacyPublicState ? { legacyPublicState } : {}),
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
        publicHash: bodyMeta ? bodyMeta.bodyHash : nextPublic.hash,
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
          publicKind: bodyMeta ? bodyMeta.kind : frame.public.kind,
          ownerKind: frame.owner.kind,
          publicBaseSnapshotId: bodyMeta ? bodyMeta.baseBodyId : frame.public.baseSnapshotId || null,
          ownerBaseSnapshotId: frame.owner.baseSnapshotId || null,
        } : {}),
      });

      const materializedAtMs = now();
      const entryShape = {
        binding: bindingKey(), frameId: frame.frameId, statePairId: frame.statePairId,
        snapshotId: frame.snapshotId, tick: frame.tick, simTime: frame.simTime,
        eventWatermark: frame.eventWatermark, fieldRevision: frame.fieldRevision,
        ballparkEpoch: frame.ballparkEpoch, fingerprint,
        publicBase: { view: nextPublic.view, hash: nextPublic.hash },
        ownerBase: { view: nextOwner.view, hash: nextOwner.hash },
        publicContinuity: nextPublicContinuity, ownerContinuity: nextOwnerContinuity,
      };
      const entryBytes = canonicalJsonBytes(entryShape).length;
      if (entryBytes > ledgerLimits.maxBytes) fail("oversize-frame", "materialized base exceeds ledger byte bound");
      if (snapshotIndex.has(frame.snapshotId) || statePairIndex.has(frame.statePairId)
          || (currentPair && (frame.snapshotId === currentPair.snapshotId
            || frame.statePairId === currentPair.statePairId))) {
        fail("lineage-mismatch", "new frame reused a retained snapshot or state-pair cursor");
      }
      const entry = deepFreeze({ ...entryShape, materializedAtMs, bytes: entryBytes });
      while (ledger.size >= ledgerLimits.maxEntries
          || ledgerBytes + entry.bytes > ledgerLimits.maxBytes) {
        const candidates = [...ledger.keys()].filter((frameId) => frameId !== lastFrameId);
        const oldestFrameId = Math.min(...(candidates.length ? candidates : ledger.keys()));
        evict(oldestFrameId, ledger.size >= ledgerLimits.maxEntries ? "frame-count" : "bytes");
      }
      rebuildIndexes();
      ledger.set(entry.frameId, entry);
      ledgerBytes += entry.bytes;
      ledgerHighWaterBytes = Math.max(ledgerHighWaterBytes, ledgerBytes);
      enforceLedgerBounds(materializedAtMs);

      if (publish) {
        currentPair = pair;
        lastAcceptedPair = pair;
        lastFrameId = frame.frameId;
        lastVisibleFingerprint = fingerprint;
        lastAck = ack;
        visiblePublicContinuity = nextPublicContinuity;
        visibleOwnerContinuity = nextOwnerContinuity;
        admitted = true;
        if (recoveryEpisode) counters.recoveryConvergences += 1;
        recoveryEpisode = null;
        lastRecovery = null;
        counters.published += 1;
      } else {
        counters.staleAccepted += 1;
      }
      counters.accepted += 1;
      counters[frame.public.kind === frame.owner.kind
        ? frame.public.kind === "keyframe" ? "keyframes" : "deltas" : "mixed"] += 1;
      if (publish) {
        try { onState?.(pair); } catch { counters.observerFailures += 1; }
      }
      return Object.freeze({ accepted: true, duplicate: false, stale: !publish,
        published: publish, ack: publish ? ack : lastAck, state: publish ? pair : currentPair });
    } catch (error) {
      const reason = error?.code === "invalid-field" && /negative zero|-0/i.test(String(error.message || ""))
        ? "lineage-mismatch" : normalizeRecoveryReason(error?.code || "malformed-frame");
      return reject(reason, { recoverable: reason === "missing-base" });
    }
  }

  function reconnect(rawNextContext = context, reason = "reconnect") {
    let next;
    try {
      next = normalizeContext(rawNextContext);
    } catch (error) {
      if (typeof rawNextContext?.manifestSchema === "string"
        && rawNextContext.manifestSchema !== DEFAULT_MANIFEST_SCHEMA) {
        clearLedger();
        admitted = false;
        return beginExplicitRecovery("schema-changed");
      }
      throw error;
    }
    let recoveryReason = reason;
    if (next.matchId !== context.matchId) recoveryReason = "match-changed";
    else if (next.sessionId !== context.sessionId) recoveryReason = "session-changed";
    else if (next.authorityIncarnation !== context.authorityIncarnation) recoveryReason = "authority-changed";
    else if (next.recipientId !== context.recipientId || next.recipientIncarnation !== context.recipientIncarnation) recoveryReason = "recipient-changed";
    else if (next.manifestSchema !== context.manifestSchema) recoveryReason = "schema-changed";
    else if (next.manifestHash !== context.manifestHash) recoveryReason = "manifest-changed";
    context = next;
    if (positional) codecContext = positionalCodecContext({ ...context,
      codecManifestHash: POSITIONAL_CODEC_MANIFEST_HASH });
    if (binary) binaryContext = binaryCodecContext({ ...context,
      codecManifestHash: BINARY_CODEC_MANIFEST_HASH });
    if (publicBody) bodyCodecContext = publicBodyCodecContext(context);
    lastFrameId = 0;
    lastVisibleFingerprint = null;
    lastAck = null;
    clearLedger();
    bodyLedger.clear();
    admitted = false;
    lastAcceptedPair = null;
    currentPair = null;
    visiblePublicContinuity = emptyContinuity();
    visibleOwnerContinuity = emptyContinuity();
    return beginExplicitRecovery(recoveryReason);
  }

  function rebase(reason = "reconnect") {
    clearLedger();
    bodyLedger.clear();
    admitted = false;
    lastAck = null;
    return beginExplicitRecovery(reason);
  }

  function teardown() {
    clearLedger();
    bodyLedger.clear();
    admitted = false;
    recoveryEpisode = null;
    currentPair = null;
    lastAcceptedPair = null;
    lastAck = null;
    lastFrameId = 0;
    lastVisibleFingerprint = null;
    visiblePublicContinuity = emptyContinuity();
    visibleOwnerContinuity = emptyContinuity();
    closed = true;
  }

  function current() {
    return currentPair;
  }

  function diagnostics() {
    return deepFreeze({
      ...counters,
      mode: publicBody ? MODES.STATE_PAIR_PUBLIC_BODY
        : binary ? MODES.STATE_PAIR_BINARY : compressed ? MODES.STATE_PAIR_COMPRESSION
        : positional ? MODES.STATE_PAIR_POSITIONAL_JSON : materializeRuntimeComponents
        ? MODES.STATE_PAIR_RUNTIME_COMPONENTS
        : allowMixed ? MODES.STATE_PAIR_MIXED : MODES.STATE_PAIR,
      awaitingKeyframe: !admitted,
      hasPublicBase: ledger.size > 0,
      hasOwnerBase: ledger.size > 0,
      lastFrameId,
      retainedPublicIdentities: Object.keys(visiblePublicContinuity.retired).length,
      retainedOwnerIdentities: Object.keys(visibleOwnerContinuity.retired).length,
      retainedPairHistory: ledger.size,
      retainedPublicBodies: bodyLedger.size,
      ledger: {
        entries: ledger.size, bytes: ledgerBytes, highWaterBytes: ledgerHighWaterBytes,
        hits: counters.ledgerHits, misses: counters.ledgerMisses, evictions: counters.ledgerEvictions,
        evictionReasons: Object.fromEntries([...evictionReasons].sort()),
      },
      rejectionReasons: Object.fromEntries([...rejectionReasons].sort()),
      recoveryReasons: Object.fromEntries([...recoveryReasons].sort()),
      recoveryOutstanding: Boolean(recoveryEpisode?.requested),
      recoveryEpisode: recoveryEpisode ? { reason: recoveryEpisode.reason,
        requested: recoveryEpisode.requested } : null,
      lastRecovery,
      closed,
      limits: { maxPairBytes, maxRetainedPairHistory: ledgerLimits.maxEntries,
        maxRetainedBytes: ledgerLimits.maxBytes, maxRetainedAgeMs: ledgerLimits.maxAgeMs,
        minRecoveryIntervalMs: ledgerLimits.minRecoveryIntervalMs },
    });
  }

  return Object.freeze({ receive, reconnect, rebase, teardown, current, diagnostics });
}

module.exports = {
  CAPABILITY,
  MIXED_CAPABILITY,
  RUNTIME_PUBLIC_COMPONENTS_CAPABILITY,
  POSITIONAL_CODEC_CAPABILITY,
  BINARY_CODEC_CAPABILITY,
  COMPRESSION_CODEC_CAPABILITY,
  PUBLIC_BODY_CAPABILITY,
  RECOVERY_SCHEMA,
  DEFAULT_MANIFEST_SCHEMA,
  DEFAULT_BASE_LEDGER_LIMITS,
  MODES,
  ClientDeltaError,
  selectClientReplicationMode,
  createClientDeltaReceiver,
};
