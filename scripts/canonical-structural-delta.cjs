"use strict";

const crypto = require("crypto");
const { canonicalJson, canonicalJsonBytes, compareCodePoints } = require("./session-replication-manifest.cjs");

const VIEW_SCHEMA = "lbh-canonical-projection-v1";
const DELTA_SCHEMA = "lbh-canonical-structural-delta-v1";
const LANES = new Set(["public", "owner"]);
const MAX_VIEW_BYTES = 1024 * 1024;
const MAX_DELTA_BYTES = 512 * 1024;
const MAX_ENTITIES = 4096;
const MAX_COMPONENTS_PER_ENTITY = 128;
const MAX_OPERATIONS = 16384;
const MAX_DEPTH = 32;
const MAX_NODES = 100000;
const MAX_RETAINED_IDENTITIES = 8192;
const MAX_RETAINED_IDENTITY_BYTES = 512 * 1024;
const PREPARED_CONTEXT_KEYS = Object.freeze([
  "schema", "manifestHash", "matchId", "sessionId", "authorityIncarnation",
  "recipientId", "recipientIncarnation", "lane", "statePairId", "snapshotId", "tick",
]);
const preparedProjections = new WeakMap();

// S1 owns these immutable facts. S2 projections may refer to the manifest hash,
// but must not repeat the extracted definitions.
const STATIC_MANIFEST_EXTRACTED_ROOT_KEYS = Object.freeze([
  "manifest", "staticManifest", "mapBounds", "staticAnchors", "publicContent",
]);
const PUBLIC_PRIVATE_KEY_PATTERN = /(cargo|inventory|equipment|equipped|consumable|delta.?v|loadout|cooldown|private|credential|portal.?confirmation|secret|profile|rigLevels|abilityState|activeEffects|effectState|controlDebuff|commandCredential|ticket|password|authToken)/i;
// S2d's runtimePublic component is sourced exclusively from the existing S1
// public projection. Public gameplay entities legitimately contain cooldown
// fields, so retain the stronger legacy-component denylist above while using a
// dedicated owner-secret denylist for the lossless S1 compatibility lane.
const RUNTIME_PUBLIC_PRIVATE_KEY_PATTERN = /(cargo|inventory|equipment|equipped|consumable|delta.?v|loadout|cooldown|private|credential|portal.?(confirmation|interaction)|secret|profile|rigLevels|abilityState|activeEffects|effectState|controlDebuff|ticket|password|authToken)/i;
const NESTED_STATIC_KEY_PATTERN = /^(manifest|staticManifest|mapBounds|staticAnchors|publicContent|visualDescriptors|stableSourceIds)$/;
const VIEW_KEYS = new Set(["schema", "lane", "runId", "authorityEpoch", "connectionEpoch", "ballparkEpoch", "manifestHash", "statePairId", "snapshotId", "tick", "simTime", "eventWatermark", "fieldRevision", "overloadMode", "world", "entities"]);
const DELTA_KEYS = new Set(["schema", "lane", "runId", "authorityEpoch", "connectionEpoch", "ballparkEpoch", "manifestHash", "statePairId", "baseSnapshotId", "snapshotId", "baseHash", "resultHash", "rootOps", "creates", "updates", "despawns"]);
const ROOT_MUTABLE_KEYS = new Set(["statePairId", "snapshotId", "tick", "simTime", "eventWatermark", "fieldRevision", "overloadMode", "world"]);
const PUBLIC_COMPONENT_SCHEMA = new Set(["transform", "motion", "appearance", "lifecycle", "publicState", "runtimePublic", "runtimeMotion", "runtimeGameplay", "runtimeIdentity", "runtimePresentation", "runtimeOrder", "lootPublic", "playerPublic", "worldEntity", "signalPublic", "statusPublic", "portalPublic", "fieldPublic", "inhibitorPublic", "scavengerPublic", "faunaPublic", "sentryPublic"]);
const OWNER_COMPONENT_SCHEMA = new Set(["inventory", "equipment", "consumables", "deltaV", "loadout", "ownerState", "cooldowns", "signal", "portalConfirmation", "transient"]);
const PUBLIC_COMPONENT_VALUE_KEYS = new Set(["x", "y", "z", "wx", "wy", "vx", "vy", "vz", "heading", "rotation", "radius", "scale", "kind", "type", "variant", "color", "visible", "active", "state", "reason", "hull", "status", "tier", "valueBand", "claimed", "signalBand", "id", "sourceId"]);
const PUBLIC_WORLD_KEYS = new Set(["toroidalBounds", "currents", "phase", "field", "overload", "global", "publicFacts"]);
const PUBLIC_WRECK_LOOT_COEFFICIENT_KEYS = new Set([
  "cargoSlots", "controlDebuffResist", "deltaVBurnMult", "deltaVCapacityMult", "deltaVRegenMult", "pulseCooldownScale",
]);
const PUBLIC_SESSION_PROFILE_VALUES = Object.freeze({
  simScaleProfile: new Set(["small", "medium", "large"]),
  clientPerfProfile: new Set(["fixedGrid"]),
});

class StructuralDeltaError extends Error {
  constructor(code, message) {
    super(message);
    this.name = "StructuralDeltaError";
    this.code = code;
  }
}

function fail(code, message) {
  throw new StructuralDeltaError(code, message);
}

function assertExactKeys(value, allowed, path) {
  for (const key of Object.keys(value)) if (!allowed.has(key)) fail("unknown-field", `${path}.${key} is not declared by the schema`);
}

function sha256(value) {
  return `sha256:${crypto.createHash("sha256").update(canonicalJsonBytes(value)).digest("hex")}`;
}

function sha256Bytes(bytes) {
  return `sha256:${crypto.createHash("sha256").update(bytes).digest("hex")}`;
}

function utf8IdentityPart(value, label) {
  if (typeof value !== "string" || !value || value !== value.normalize("NFC")) {
    fail("invalid-identity", `${label} must be a non-empty NFC string`);
  }
  return `${Buffer.byteLength(value, "utf8")}:${value}`;
}

function publicEntityId(category, sourceId) {
  return `${utf8IdentityPart(category, "category")}${utf8IdentityPart(sourceId, "sourceId")}`;
}

function isPlainObject(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function cloneCanonical(value) {
  return JSON.parse(canonicalJson(value));
}

function deepFreeze(value) {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) deepFreeze(child);
  return Object.freeze(value);
}

function countTree(value, depth = 0, state = { nodes: 0 }) {
  if (depth > MAX_DEPTH) fail("complexity-limit", `projection exceeds depth ${MAX_DEPTH}`);
  state.nodes += 1;
  if (state.nodes > MAX_NODES) fail("complexity-limit", `projection exceeds ${MAX_NODES} nodes`);
  if (Array.isArray(value)) for (const child of value) countTree(child, depth + 1, state);
  else if (isPlainObject(value)) for (const child of Object.values(value)) countTree(child, depth + 1, state);
  return state.nodes;
}

function scanPublicPrivacy(value, path = "$") {
  if (Array.isArray(value)) return value.forEach((entry, index) => scanPublicPrivacy(entry, `${path}[${index}]`));
  if (!isPlainObject(value)) return;
  for (const [key, child] of Object.entries(value)) {
    if (PUBLIC_PRIVATE_KEY_PATTERN.test(key)) fail("public-private-field", `${path}.${key} is owner-private`);
    scanPublicPrivacy(child, `${path}.${key}`);
  }
}

function samePath(actual, expected) {
  return actual.length === expected.length && actual.every((part, index) => part === expected[index]);
}

function runtimePublicKeyAllowed(key, value, scope, relativePath) {
  if (scope === "publicFacts" && samePath(relativePath, ["session"]) && PUBLIC_SESSION_PROFILE_VALUES[key]) {
    return typeof value === "string" && PUBLIC_SESSION_PROFILE_VALUES[key].has(value);
  }
  if (scope !== "wreck") return false;
  if (key === "pickupCooldown" && relativePath.length === 0) {
    return typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= 60;
  }
  const coefficientPath = relativePath.length === 3 && relativePath[0] === "loot"
    && Number.isSafeInteger(relativePath[1]) && relativePath[1] >= 0 && relativePath[2] === "coefficients";
  if (!coefficientPath || !PUBLIC_WRECK_LOOT_COEFFICIENT_KEYS.has(key)
      || typeof value !== "number" || !Number.isFinite(value)) return false;
  return key === "cargoSlots"
    ? Number.isSafeInteger(value) && value >= 0 && value <= 16
    : value >= 0 && value <= 4;
}

function scanRuntimePublicPrivacy(value, path = "$", scope = null, relativePath = []) {
  if (Array.isArray(value)) return value.forEach((entry, index) => scanRuntimePublicPrivacy(
    entry, `${path}[${index}]`, scope, [...relativePath, index],
  ));
  if (!isPlainObject(value)) return;
  for (const [key, child] of Object.entries(value)) {
    if (RUNTIME_PUBLIC_PRIVATE_KEY_PATTERN.test(key)
        && !runtimePublicKeyAllowed(key, child, scope, relativePath)) {
      fail("public-private-field", `${path}.${key} is owner-private`);
    }
    scanRuntimePublicPrivacy(child, `${path}.${key}`, scope, [...relativePath, key]);
  }
}

function validatePublicLeaf(value, path) {
  if (value === null || ["string", "boolean", "number"].includes(typeof value)) return;
  if (Array.isArray(value)) return value.forEach((entry, index) => validatePublicLeaf(entry, `${path}[${index}]`));
  fail("unknown-public-value-schema", `${path} contains an undeclared nested object`);
}

function validatePublicComponentValue(value, path) {
  if (!isPlainObject(value)) return validatePublicLeaf(value, path);
  for (const [key, child] of Object.entries(value)) {
    if (!PUBLIC_COMPONENT_VALUE_KEYS.has(key)) fail("unknown-public-value-schema", `${path}.${key} is not declared public state`);
    validatePublicLeaf(child, `${path}.${key}`);
  }
}

function validatePublicWorld(world) {
  for (const [key, child] of Object.entries(world)) {
    if (!PUBLIC_WORLD_KEYS.has(key)) fail("unknown-public-value-schema", `$.world.${key} is not declared public world state`);
    if (key === "publicFacts") {
      scanRuntimePublicPrivacy(child, `$.world.${key}`, "publicFacts");
      scanStaticRepeats(child, `$.world.${key}`);
    } else validatePublicLeaf(child, `$.world.${key}`);
  }
}

function scanStaticRepeats(value, path = "$.world") {
  if (Array.isArray(value)) return value.forEach((entry, index) => scanStaticRepeats(entry, `${path}[${index}]`));
  if (!isPlainObject(value)) return;
  for (const [key, child] of Object.entries(value)) {
    if (NESTED_STATIC_KEY_PATTERN.test(key)) fail("static-manifest-field", `${path}.${key} belongs in the static manifest`);
    scanStaticRepeats(child, `${path}.${key}`);
  }
}

function normalizeRetired(input) {
  const entries = input instanceof Map ? [...input.entries()] : Object.entries(input || {});
  const result = new Map();
  for (const [id, incarnation] of entries) {
    if (typeof id !== "string" || !Number.isSafeInteger(incarnation) || incarnation < 0 || result.has(id)) fail("invalid-retained-identity", "retained identity registry is malformed");
    result.set(id, incarnation);
    if (result.size > MAX_RETAINED_IDENTITIES) fail("retained-identity-overflow", `retained identity registry exceeds ${MAX_RETAINED_IDENTITIES} entries`);
  }
  if (canonicalJsonBytes(Object.fromEntries(result)).length > MAX_RETAINED_IDENTITY_BYTES) fail("retained-identity-overflow", `retained identity registry exceeds ${MAX_RETAINED_IDENTITY_BYTES} bytes`);
  return result;
}

function retiredObject(map) {
  return deepFreeze(Object.fromEntries([...map.entries()].sort(([a], [b]) => compareCodePoints(a, b))));
}

function normalizeComponent(name, component, path) {
  if (typeof name !== "string" || !name || name !== name.normalize("NFC")) fail("invalid-component", `${path} has invalid component name`);
  if (!isPlainObject(component) || !Number.isSafeInteger(component.revision) || component.revision < 0 || !("value" in component)) {
    fail("invalid-component", `${path}.${name} requires non-negative revision and value`);
  }
  assertExactKeys(component, new Set(["revision", "value"]), `${path}.${name}`);
  return { revision: component.revision, value: cloneCanonical(component.value) };
}

function normalizeEntity(entity, lane, index) {
  const path = `$.entities[${index}]`;
  if (!isPlainObject(entity)) fail("invalid-entity", `${path} must be an object`);
  assertExactKeys(entity, new Set(["publicEntityId", "category", "sourceId", "incarnation", "lifecycleRevision", "components"]), path);
  const id = publicEntityId(entity.category, entity.sourceId);
  if (entity.publicEntityId !== undefined && entity.publicEntityId !== id) fail("identity-collision", `${path} publicEntityId does not match namespace`);
  if (!Number.isSafeInteger(entity.incarnation) || entity.incarnation < 0) fail("invalid-incarnation", `${path} incarnation is invalid`);
  if (!Number.isSafeInteger(entity.lifecycleRevision) || entity.lifecycleRevision < 0) fail("invalid-lifecycle", `${path} lifecycleRevision is invalid`);
  if (!isPlainObject(entity.components)) fail("invalid-components", `${path}.components must be an object`);
  const names = Object.keys(entity.components).sort(compareCodePoints);
  if (names.length > MAX_COMPONENTS_PER_ENTITY) fail("complexity-limit", `${path} exceeds component cap`);
  const components = {};
  const componentSchema = lane === "public" ? PUBLIC_COMPONENT_SCHEMA : OWNER_COMPONENT_SCHEMA;
  for (const name of names) {
    if (!componentSchema.has(name)) fail("unknown-component-schema", `${path}.components.${name} is not declared for ${lane}`);
    components[name] = normalizeComponent(name, entity.components[name], `${path}.components`);
    if (lane === "public") {
      if (["runtimePublic", "runtimeMotion", "runtimeGameplay", "runtimeIdentity", "runtimePresentation"].includes(name)) {
        scanRuntimePublicPrivacy(components[name].value, `${path}.components.${name}.value`, entity.category);
      }
      else if (name === "runtimeOrder") {
        const order = components[name].value;
        if (!isPlainObject(order) || Object.keys(order).length !== 1
            || !Number.isSafeInteger(order.index) || order.index < 0) {
          fail("unknown-public-value-schema", `${path}.components.${name}.value requires a non-negative index`);
        }
      }
      else validatePublicComponentValue(components[name].value, `${path}.components.${name}.value`);
    }
  }
  const normalized = { publicEntityId: id, category: entity.category, sourceId: entity.sourceId,
    incarnation: entity.incarnation, lifecycleRevision: entity.lifecycleRevision, components };
  scanStaticRepeats(normalized, path);
  if (lane === "public") {
    for (const [name, component] of Object.entries(normalized.components)) {
      if (["runtimePublic", "runtimeMotion", "runtimeGameplay", "runtimeIdentity", "runtimePresentation"].includes(name)) {
        scanRuntimePublicPrivacy(component.value, `${path}.components.${name}.value`, entity.category);
      }
      else scanPublicPrivacy(component, `${path}.components.${name}`);
    }
  }
  return normalized;
}

function normalizeViewDetails(input) {
  if (!isPlainObject(input) || input.schema !== VIEW_SCHEMA) fail("unknown-schema", `expected ${VIEW_SCHEMA}`);
  countTree(input);
  for (const key of STATIC_MANIFEST_EXTRACTED_ROOT_KEYS) {
    if (Object.hasOwn(input, key)) fail("static-manifest-field", `${key} belongs in the static manifest`);
  }
  assertExactKeys(input, VIEW_KEYS, "$");
  if (!LANES.has(input.lane)) fail("unknown-lane", "projection lane must be public or owner");
  for (const field of ["runId", "manifestHash", "statePairId", "snapshotId"]) {
    if (typeof input[field] !== "string" || !input[field]) fail("invalid-view", `${field} is required`);
  }
  for (const field of ["authorityEpoch", "connectionEpoch", "ballparkEpoch", "tick", "eventWatermark", "fieldRevision"]) {
    if (!Number.isSafeInteger(input[field]) || input[field] < 0 || Object.is(input[field], -0)) {
      fail("invalid-view", `${field} must be a non-negative safe integer`);
    }
  }
  if (typeof input.simTime !== "number" || !Number.isFinite(input.simTime)) fail("invalid-view", "simTime must be finite");
  if (!isPlainObject(input.world)) fail("invalid-view", "world must be an object");
  scanStaticRepeats(input.world);
  if (input.lane === "public") validatePublicWorld(input.world);
  if (!Array.isArray(input.entities) || input.entities.length > MAX_ENTITIES) fail("complexity-limit", "entities exceed bounded array cap");
  const entities = input.entities.map((entry, index) => normalizeEntity(entry, input.lane, index));
  entities.sort((a, b) => compareCodePoints(a.publicEntityId, b.publicEntityId));
  for (let index = 1; index < entities.length; index += 1) {
    if (entities[index - 1].publicEntityId === entities[index].publicEntityId) fail("identity-collision", `duplicate entity ${entities[index].publicEntityId}`);
  }
  const view = {
    schema: VIEW_SCHEMA, lane: input.lane, runId: input.runId, authorityEpoch: input.authorityEpoch,
    connectionEpoch: input.connectionEpoch, ballparkEpoch: input.ballparkEpoch,
    manifestHash: input.manifestHash, snapshotId: input.snapshotId, tick: input.tick,
    statePairId: input.statePairId,
    simTime: Object.is(input.simTime, -0) ? 0 : input.simTime, eventWatermark: input.eventWatermark,
    fieldRevision: input.fieldRevision, overloadMode: input.overloadMode ?? null,
    world: cloneCanonical(input.world), entities,
  };
  const canonicalBytes = canonicalJsonBytes(view);
  if (canonicalBytes.length > MAX_VIEW_BYTES) fail("projection-too-large", `projection exceeds ${MAX_VIEW_BYTES} bytes`);
  return Object.freeze({ view: deepFreeze(view), canonicalBytes });
}

function normalizeView(input) {
  return normalizeViewDetails(input).view;
}

function normalizePreparedContext(input, view) {
  if (!isPlainObject(input)) fail("invalid-prepared-context", "prepared projection context is required");
  assertExactKeys(input, new Set(PREPARED_CONTEXT_KEYS), "$preparedContext");
  const context = {};
  for (const key of PREPARED_CONTEXT_KEYS) context[key] = input[key];
  for (const key of ["schema", "manifestHash", "matchId", "sessionId", "recipientId", "lane", "statePairId", "snapshotId"]) {
    if (typeof context[key] !== "string" || !context[key] || context[key] !== context[key].normalize("NFC")) {
      fail("invalid-prepared-context", `${key} is invalid`);
    }
  }
  for (const key of ["authorityIncarnation", "recipientIncarnation", "tick"]) {
    if (!Number.isSafeInteger(context[key]) || context[key] < 0 || Object.is(context[key], -0)) {
      fail("invalid-prepared-context", `${key} is invalid`);
    }
  }
  if (context.schema !== view.schema || context.manifestHash !== view.manifestHash
      || context.matchId !== view.runId || context.authorityIncarnation !== view.authorityEpoch
      || context.recipientIncarnation !== view.connectionEpoch || context.lane !== view.lane
      || context.statePairId !== view.statePairId || context.snapshotId !== view.snapshotId
      || context.tick !== view.tick) {
    fail("prepared-context-mismatch", "prepared projection context does not match the normalized view");
  }
  return Object.freeze(context);
}

function samePreparedContext(actual, expected) {
  return PREPARED_CONTEXT_KEYS.every((key) => actual[key] === expected[key]);
}

function prepareProjection(input, rawContext) {
  const normalized = normalizeViewDetails(input);
  const context = normalizePreparedContext(rawContext, normalized.view);
  const token = Object.freeze(Object.create(null));
  preparedProjections.set(token, Object.freeze({
    context,
    view: normalized.view,
    canonicalBytes: normalized.canonicalBytes,
    hash: sha256Bytes(normalized.canonicalBytes),
    entityIndex: indexEntities(normalized.view.entities),
  }));
  return token;
}

function preparedDetails(token, rawExpectedContext) {
  const details = token && typeof token === "object" ? preparedProjections.get(token) : null;
  if (!details) fail("invalid-prepared-projection", "projection was not prepared by this authority module");
  const expected = normalizePreparedContext(rawExpectedContext, details.view);
  if (!samePreparedContext(details.context, expected)) {
    fail("prepared-context-mismatch", "prepared projection cannot be reused outside its bound authority context");
  }
  return details;
}

function preparedProjectionView(token, expectedContext) {
  return preparedDetails(token, expectedContext).view;
}

function preparedProjectionHash(token, expectedContext) {
  return preparedDetails(token, expectedContext).hash;
}

function equalCanonical(a, b) {
  return canonicalJson(a) === canonicalJson(b);
}

function pathCompare(a, b) {
  return compareCodePoints(canonicalJson(a), canonicalJson(b));
}

function recursiveDiff(before, after, path = [], operations = []) {
  if (equalCanonical(before, after)) return operations;
  if (isPlainObject(before) && isPlainObject(after)) {
    const keys = [...new Set([...Object.keys(before), ...Object.keys(after)])].sort(compareCodePoints);
    for (const key of keys) {
      if (!Object.hasOwn(after, key)) operations.push({ op: "remove", path: [...path, key] });
      else if (!Object.hasOwn(before, key)) operations.push({ op: "set", path: [...path, key], value: cloneCanonical(after[key]) });
      else recursiveDiff(before[key], after[key], [...path, key], operations);
      if (operations.length > MAX_OPERATIONS) fail("complexity-limit", `delta exceeds ${MAX_OPERATIONS} operations`);
    }
    return operations;
  }
  operations.push({ op: "set", path, value: cloneCanonical(after) });
  return operations;
}

function metadataOf(view) {
  const { entities, ...metadata } = view;
  return metadata;
}

function indexEntities(entities) {
  return new Map(entities.map((entity) => [entity.publicEntityId, entity]));
}

function createStructuralDeltaNormalized(base, current, { expectedBaseHash = null, dirtyHints = null,
  retainedIncarnations = null, baseHash = null, currentHash = null, before = null, after = null } = {}) {
  if (base.lane !== current.lane || base.runId !== current.runId || base.authorityEpoch !== current.authorityEpoch
    || base.connectionEpoch !== current.connectionEpoch || base.manifestHash !== current.manifestHash) fail("base-mismatch", "base lineage does not match current projection");
  if (base.ballparkEpoch !== current.ballparkEpoch) fail("base-mismatch", "ballpark epoch requires a keyframe");
  if (current.tick < base.tick || current.simTime < base.simTime || current.eventWatermark < base.eventWatermark) fail("invalid-order", "current projection lineage regressed");
  if (current.fieldRevision < base.fieldRevision) fail("field-revision-regression", "field revision regressed");
  const verifiedBaseHash = baseHash || sha256(base);
  if (expectedBaseHash !== null && expectedBaseHash !== verifiedBaseHash) fail("base-hash-mismatch", "expected base hash does not match materialized base");
  const verifiedCurrentHash = currentHash || sha256(current);
  if (verifiedCurrentHash !== verifiedBaseHash && (current.snapshotId === base.snapshotId || current.statePairId === base.statePairId)) {
    fail("invalid-cursor-advance", "changed projection requires new snapshotId and statePairId");
  }
  const beforeEntities = before || indexEntities(base.entities);
  const afterEntities = after || indexEntities(current.entities);
  const retained = normalizeRetired(retainedIncarnations);
  const creates = [];
  const updates = [];
  const despawns = [];
  for (const id of [...new Set([...beforeEntities.keys(), ...afterEntities.keys()])].sort(compareCodePoints)) {
    const oldEntity = beforeEntities.get(id);
    const newEntity = afterEntities.get(id);
    if (!newEntity) {
      if (oldEntity.lifecycleRevision === Number.MAX_SAFE_INTEGER) fail("revision-overflow", `${id} lifecycle revision cannot advance`);
      despawns.push({ publicEntityId: id, incarnation: oldEntity.incarnation,
        lifecycleRevision: oldEntity.lifecycleRevision + 1, reason: "authoritative-removal" });
      continue;
    }
    if (!oldEntity) {
      if (retained.has(id) && newEntity.incarnation <= retained.get(id)) fail("stale-incarnation", `entity ${id} reuses a retained incarnation`);
      creates.push(newEntity); continue;
    }
    if (newEntity.incarnation < oldEntity.incarnation) fail("stale-incarnation", `entity ${id} incarnation regressed`);
    if (newEntity.incarnation > oldEntity.incarnation) {
      if (oldEntity.lifecycleRevision === Number.MAX_SAFE_INTEGER) fail("revision-overflow", `${id} lifecycle revision cannot advance`);
      despawns.push({ publicEntityId: id, incarnation: oldEntity.incarnation,
        lifecycleRevision: Math.max(oldEntity.lifecycleRevision + 1, newEntity.lifecycleRevision - 1), reason: "reincarnated" });
      creates.push(newEntity);
      continue;
    }
    if (newEntity.lifecycleRevision < oldEntity.lifecycleRevision) fail("lifecycle-regression", `entity ${id} lifecycle revision regressed`);
    const components = {};
    for (const name of [...new Set([...Object.keys(oldEntity.components), ...Object.keys(newEntity.components)])].sort(compareCodePoints)) {
      const oldComponent = oldEntity.components[name];
      const newComponent = newEntity.components[name];
      if (!newComponent) {
        if (oldComponent.revision === Number.MAX_SAFE_INTEGER) fail("revision-overflow", `${id}.${name} revision cannot advance`);
        components[name] = { revision: oldComponent.revision + 1, remove: true };
      } else if (!oldComponent || !equalCanonical(oldComponent.value, newComponent.value)) {
        if (oldComponent && newComponent.revision <= oldComponent.revision) fail("component-revision-regression", `${id}.${name} changed without a newer revision`);
        components[name] = newComponent;
      } else if (newComponent.revision !== oldComponent.revision) {
        fail("revision-without-change", `${id}.${name} revision changed without a value change`);
      }
    }
    if (Object.keys(components).length || newEntity.lifecycleRevision !== oldEntity.lifecycleRevision) {
      updates.push({ publicEntityId: id, incarnation: newEntity.incarnation,
        lifecycleRevision: newEntity.lifecycleRevision, components });
    }
  }
  const rootOps = recursiveDiff(metadataOf(base), metadataOf(current));
  rootOps.sort((a, b) => pathCompare(a.path, b.path));
  const delta = {
    schema: DELTA_SCHEMA, lane: current.lane, runId: current.runId, authorityEpoch: current.authorityEpoch,
    connectionEpoch: current.connectionEpoch, ballparkEpoch: current.ballparkEpoch,
    manifestHash: current.manifestHash, baseSnapshotId: base.snapshotId, snapshotId: current.snapshotId,
    statePairId: current.statePairId,
    baseHash: verifiedBaseHash, resultHash: verifiedCurrentHash, rootOps, creates, updates, despawns,
  };
  countTree(delta);
  const deltaBytes = canonicalJsonBytes(delta).length;
  if (deltaBytes > MAX_DELTA_BYTES) fail("delta-too-large", `delta exceeds ${MAX_DELTA_BYTES} bytes`);
  return Object.freeze({ delta: deepFreeze(cloneCanonical(delta)), deltaBytes, resultView: current,
    diagnostics: Object.freeze({ dirtyHintsObserved: dirtyHints == null ? 0 : Array.isArray(dirtyHints) ? dirtyHints.length : 1,
      dirtyHintsUsedForCorrectness: false }) });
}

function createStructuralDelta(baseInput, currentInput, options = {}) {
  return createStructuralDeltaNormalized(normalizeView(baseInput), normalizeView(currentInput), options);
}

function createPreparedStructuralDelta(baseToken, currentToken, { baseContext, currentContext,
  expectedBaseHash = null, dirtyHints = null, retainedIncarnations = null } = {}) {
  const base = preparedDetails(baseToken, baseContext);
  const current = preparedDetails(currentToken, currentContext);
  return createStructuralDeltaNormalized(base.view, current.view, {
    expectedBaseHash,
    dirtyHints,
    retainedIncarnations,
    baseHash: base.hash,
    currentHash: current.hash,
    before: base.entityIndex,
    after: current.entityIndex,
  });
}

function assertSortedUnique(items, key, label) {
  let previous = null;
  for (const item of items) {
    const current = key(item);
    if (previous !== null && compareCodePoints(previous, current) >= 0) fail("invalid-order", `${label} must be strictly ordered`);
    previous = current;
  }
}

function assertNoPathOverlap(operations) {
  for (let index = 1; index < operations.length; index += 1) {
    const previous = operations[index - 1].path;
    const current = operations[index].path;
    const previousPrefix = previous.length < current.length && previous.every((part, partIndex) => part === current[partIndex]);
    const currentPrefix = current.length < previous.length && current.every((part, partIndex) => part === previous[partIndex]);
    if (previousPrefix || currentPrefix) {
      fail("invalid-order", "root operations must not contain parent/child overlap");
    }
  }
}

function setAtPath(root, operation) {
  if (!Array.isArray(operation.path) || operation.path.some((part) => typeof part !== "string" || !part)) fail("invalid-operation", "operation path is invalid");
  if (operation.path.length === 0) fail("invalid-operation", "root replacement is not allowed");
  let target = root;
  for (let index = 0; index < operation.path.length - 1; index += 1) {
    const part = operation.path[index];
    if (!isPlainObject(target[part])) fail("invalid-operation", `missing object path ${operation.path.join(".")}`);
    target = target[part];
  }
  const key = operation.path.at(-1);
  if (operation.op === "remove") {
    if (!Object.hasOwn(target, key)) fail("invalid-operation", `remove target ${operation.path.join(".")} is absent`);
    delete target[key];
  } else if (operation.op === "set" && Object.hasOwn(operation, "value")) target[key] = cloneCanonical(operation.value);
  else fail("invalid-operation", "unknown root operation");
}

function applyStructuralDelta(baseInput, deltaInput, { expectedResultHash = null, retainedIncarnations = null } = {}) {
  const base = normalizeView(baseInput);
  countTree(deltaInput);
  const delta = cloneCanonical(deltaInput);
  if (!isPlainObject(delta) || delta.schema !== DELTA_SCHEMA) fail("unknown-schema", `expected ${DELTA_SCHEMA}`);
  if (canonicalJsonBytes(delta).length > MAX_DELTA_BYTES) fail("delta-too-large", `delta exceeds ${MAX_DELTA_BYTES} bytes`);
  assertExactKeys(delta, DELTA_KEYS, "$delta");
  if (delta.lane !== base.lane || delta.runId !== base.runId || delta.authorityEpoch !== base.authorityEpoch
    || delta.connectionEpoch !== base.connectionEpoch || delta.ballparkEpoch !== base.ballparkEpoch
    || delta.manifestHash !== base.manifestHash || delta.baseSnapshotId !== base.snapshotId) fail("base-mismatch", "delta lineage does not match base");
  if (delta.baseHash !== sha256(base)) fail("base-hash-mismatch", "delta base hash does not match materialized base");
  for (const key of ["rootOps", "creates", "updates", "despawns"]) if (!Array.isArray(delta[key])) fail("invalid-delta", `${key} must be an array`);
  for (const key of ["creates", "updates", "despawns"]) {
    for (const entry of delta[key]) if (!isPlainObject(entry) || typeof entry.publicEntityId !== "string" || !entry.publicEntityId) fail("invalid-delta", `${key} contains a malformed entity operation`);
  }
  for (const operation of delta.rootOps) {
    if (!isPlainObject(operation) || !Array.isArray(operation.path) || !ROOT_MUTABLE_KEYS.has(operation.path[0])) fail("invalid-operation", "root operation targets immutable lineage or is malformed");
    assertExactKeys(operation, operation.op === "set" ? new Set(["op", "path", "value"]) : new Set(["op", "path"]), "$delta.rootOps[]");
  }
  assertSortedUnique(delta.rootOps, (entry) => canonicalJson(entry.path), "rootOps");
  assertNoPathOverlap(delta.rootOps);
  assertSortedUnique(delta.creates, (entry) => entry.publicEntityId, "creates");
  assertSortedUnique(delta.updates, (entry) => entry.publicEntityId, "updates");
  assertSortedUnique(delta.despawns, (entry) => entry.publicEntityId, "despawns");
  const createIds = new Set(delta.creates.map((entry) => entry.publicEntityId));
  const updateIds = new Set(delta.updates.map((entry) => entry.publicEntityId));
  const despawnIds = new Set(delta.despawns.map((entry) => entry.publicEntityId));
  for (const id of updateIds) if (createIds.has(id) || despawnIds.has(id)) fail("invalid-lifecycle-order", `${id} has conflicting lifecycle operations`);
  const candidate = cloneCanonical(metadataOf(base));
  for (const operation of delta.rootOps) setAtPath(candidate, operation);
  const entities = indexEntities(base.entities.map(cloneCanonical));
  const retiredIncarnationsMap = normalizeRetired(retainedIncarnations);
  for (const despawn of delta.despawns) {
    if (!isPlainObject(despawn)) fail("invalid-despawn", "despawn must be an object");
    assertExactKeys(despawn, new Set(["publicEntityId", "incarnation", "lifecycleRevision", "reason"]), "$delta.despawns[]");
    const entity = entities.get(despawn.publicEntityId);
    const replacement = delta.creates.find((entry) => entry.publicEntityId === despawn.publicEntityId);
    const expectedReason = replacement ? "reincarnated" : "authoritative-removal";
    const expectedLifecycleRevision = replacement
      ? Math.max(entity?.lifecycleRevision + 1, replacement.lifecycleRevision - 1)
      : entity?.lifecycleRevision + 1;
    if (!entity || entity.incarnation !== despawn.incarnation || !Number.isSafeInteger(despawn.lifecycleRevision)
      || despawn.lifecycleRevision !== expectedLifecycleRevision || despawn.reason !== expectedReason
      || (replacement && replacement.incarnation <= entity.incarnation)) fail("stale-incarnation", `invalid despawn ${despawn.publicEntityId}`);
    retiredIncarnationsMap.set(despawn.publicEntityId, Math.max(retiredIncarnationsMap.get(despawn.publicEntityId) ?? -1, entity.incarnation));
    entities.delete(despawn.publicEntityId);
  }
  for (const create of delta.creates) {
    const entity = normalizeEntity(create, base.lane, 0);
    if (entities.has(entity.publicEntityId)) fail("duplicate-create", `entity ${entity.publicEntityId} already exists`);
    if (retiredIncarnationsMap.has(entity.publicEntityId) && entity.incarnation <= retiredIncarnationsMap.get(entity.publicEntityId)) {
      fail("stale-incarnation", `replacement ${entity.publicEntityId} must increase incarnation`);
    }
    entities.set(entity.publicEntityId, entity);
  }
  for (const update of delta.updates) {
    if (!isPlainObject(update)) fail("invalid-update", "update must be an object");
    assertExactKeys(update, new Set(["publicEntityId", "incarnation", "lifecycleRevision", "components"]), "$delta.updates[]");
    const entity = entities.get(update.publicEntityId);
    if (!entity || entity.incarnation !== update.incarnation) fail("stale-incarnation", `invalid update ${update.publicEntityId}`);
    if (!Number.isSafeInteger(update.lifecycleRevision) || update.lifecycleRevision < entity.lifecycleRevision || !isPlainObject(update.components)) fail("invalid-update", `invalid update ${update.publicEntityId}`);
    for (const name of Object.keys(update.components).sort(compareCodePoints)) {
      const patch = update.components[name];
      const oldComponent = entity.components[name];
      if (patch.remove === true) {
        if (!oldComponent || !Number.isSafeInteger(patch.revision) || patch.revision !== oldComponent.revision + 1
          || Object.keys(patch).some((key) => !["revision", "remove"].includes(key))) fail("component-revision-regression", `invalid removal ${update.publicEntityId}.${name}`);
        delete entity.components[name];
      } else {
        const component = normalizeComponent(name, patch, "$.updates.components");
        if (oldComponent && component.revision <= oldComponent.revision) fail("component-revision-regression", `invalid update ${update.publicEntityId}.${name}`);
        if (oldComponent && equalCanonical(component.value, oldComponent.value)) fail("revision-without-change", `invalid unchanged update ${update.publicEntityId}.${name}`);
        entity.components[name] = component;
      }
    }
    entity.lifecycleRevision = update.lifecycleRevision;
  }
  candidate.entities = [...entities.values()].sort((a, b) => compareCodePoints(a.publicEntityId, b.publicEntityId));
  const materialized = normalizeView(candidate);
  if (materialized.snapshotId !== delta.snapshotId) fail("result-lineage-mismatch", "delta snapshot header does not match reconstructed view");
  if (materialized.statePairId !== delta.statePairId) fail("result-lineage-mismatch", "delta state-pair header does not match reconstructed view");
  if (materialized.tick < base.tick || materialized.fieldRevision < base.fieldRevision || materialized.simTime < base.simTime || materialized.eventWatermark < base.eventWatermark) fail("result-lineage-regression", "reconstructed projection lineage regressed");
  const resultHash = sha256(materialized);
  if (resultHash !== delta.baseHash && (materialized.snapshotId === base.snapshotId || materialized.statePairId === base.statePairId)) fail("invalid-cursor-advance", "changed projection reused its base cursor identity");
  if (delta.resultHash !== resultHash || (expectedResultHash !== null && expectedResultHash !== resultHash)) fail("result-hash-mismatch", "reconstructed projection hash mismatch");
  if (canonicalJsonBytes(Object.fromEntries(retiredIncarnationsMap)).length > MAX_RETAINED_IDENTITY_BYTES
    || retiredIncarnationsMap.size > MAX_RETAINED_IDENTITIES) fail("retained-identity-overflow", "retained identity registry requires epoch reset/rebase");
  return Object.freeze({ view: materialized, resultHash, bytes: canonicalJsonBytes(materialized).length,
    retainedIncarnations: retiredObject(retiredIncarnationsMap) });
}

module.exports = {
  VIEW_SCHEMA, DELTA_SCHEMA, STATIC_MANIFEST_EXTRACTED_ROOT_KEYS,
  PUBLIC_COMPONENT_SCHEMA, OWNER_COMPONENT_SCHEMA,
  MAX_VIEW_BYTES, MAX_DELTA_BYTES, MAX_ENTITIES, MAX_COMPONENTS_PER_ENTITY, MAX_OPERATIONS,
  MAX_RETAINED_IDENTITIES, MAX_RETAINED_IDENTITY_BYTES,
  StructuralDeltaError, publicEntityId, normalizeView, projectionHash: (view) => sha256(normalizeView(view)),
  prepareProjection, preparedProjectionView, preparedProjectionHash, createPreparedStructuralDelta,
  createStructuralDelta, applyStructuralDelta,
};
