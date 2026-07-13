"use strict";

const crypto = require("crypto");
const { canonicalJson, canonicalJsonBytes } = require("./session-replication-manifest.cjs");
const { publicEntityId } = require("./canonical-structural-delta.cjs");
const {
  ENTITY_FIELD_CLASSIFICATION,
  PUBLIC_FACT_CLASSIFICATION,
} = require("./runtime-public-schema.cjs");

const CAPABILITY = "state-pair-positional-json-v1";
const CODEC_SCHEMA = "lbh-state-pair-positional-json-v1";
const CODEC_VERSION = 1;
const PAIR_TAG = 0;
const ACK_TAG = 1;
const RECOVERY_TAG = 2;
const MAX_CODEC_BYTES = 256 * 1024;
const MAX_CODEC_DEPTH = 32;
const MAX_CODEC_NODES = 100000;
const MAX_CODEC_ARRAY_ITEMS = 16384;
const MAX_CODEC_STRING_BYTES = 8192;

const CATEGORIES = Object.freeze([
  "player", "well", "star", "wreck", "planetoid", "portal", "scavenger", "fauna", "sentry",
  "inhibitor", "owner",
]);
const COMPONENTS = Object.freeze([
  "runtimeMotion", "runtimeGameplay", "runtimeIdentity", "runtimePresentation", "runtimeOrder",
  "runtimePublic", "ownerState", "transient",
]);
const OVERLOAD_MODES = Object.freeze(["NORMAL", "THROTTLED", "DEGRADED", "DILATED"]);
const RECOVERY_REASONS = Object.freeze([
  "reconnect", "match-changed", "session-changed", "authority-changed", "recipient-changed",
  "manifest-changed", "schema-changed", "frame-gap", "stale-frame", "duplicate-mismatch",
  "identity-mismatch", "manifest-mismatch", "missing-base", "base-mismatch", "hash-mismatch",
  "lineage-mismatch", "owner-mismatch", "malformed-frame", "oversize-frame", "rejected-delta",
]);
const DESPAWN_REASONS = Object.freeze(["authoritative-removal", "reincarnated"]);

const OWNER_AND_NESTED_KEYS = Object.freeze([
  "profileId", "rigLevels", "abilityState", "hullType", "flowLockActive", "flowLockCooldown",
  "eddyBrakeCooldown", "burnActive", "burnFuel", "momentumShieldActive", "eddies", "tapAnchor",
  "tapCooldown", "frequencyShiftCooldown", "nextPulseInverted", "ghostTrailActive", "wakeCloakCooldown",
  "decoyCharges", "decoyCooldown", "decoys", "salvageLockCharges", "tractorCooldown",
  "tractorChannelTimer", "deltaV", "deltaVMax", "deltaVRatio", "lastInputSeq", "lastActionSeq", "lastInputBrake",
  "pendingSlingshotEdgeCount", "cargo", "cargoCount", "equipped", "consumables", "activeEffects",
  "effectState", "shieldCharges", "timeSlowRemaining", "pulseCooldownRemaining", "hullGraceRemaining",
  "portalInteraction", "portalId", "portalType", "enteredTick", "ready", "signal", "level", "zone",
  "prevZone", "controlDebuff", "slingshot", "energy", "chainCount", "engageRadius", "engaged",
  "anchorId", "anchorType", "anchorWX", "anchorWY", "anchorRange", "orbitDir", "index",
  "loot", "coefficients", "affinity", "value", "special", "effect", "amount", "catalogId", "category",
  "subcategory", "baseValue", "effectDesc", "useEffect", "useDesc", "charges", "instanceId",
  "cargoSlots", "controlDebuffResist", "currentCoupling", "deltaVBurnMult", "deltaVCapacityMult",
  "deltaVRegenMult", "dragScale", "pickupRadius", "pulseCooldownScale", "pulseRadiusScale",
  "pulseSignalScale", "sensorRange", "signalDecayMult", "signalGenMult", "thrustScale", "wellResistScale",
  "pathData", "semiA", "semiB", "tilt", "speed", "heading", "maxAge", "wellIndex", "wellA", "wellB",
  "fragment", "echoFragment", "formTimes",
  "flavor", "mechanical", "config", "layout", "mapSizes", "fluid", "viscosity", "gravity", "universe",
  "runDuration", "events", "growthInterval", "wellSpread", "wreckDensity", "portalCount", "scavengerCount",
  "mods", "currentCouplingMult", "dragMult", "signalGenMult", "signalDecayMult", "wellGravityMult",
  "wellGrowthMult", "portalLifespanMult", "sensorRangeMult",
]);

const PUBLIC_FACT_KEYS = Object.freeze([
  ...PUBLIC_FACT_CLASSIFICATION.rootLineage,
  ...PUBLIC_FACT_CLASSIFICATION.staticSession,
  ...PUBLIC_FACT_CLASSIFICATION.dynamicSession,
  ...PUBLIC_FACT_CLASSIFICATION.worldRoot,
  "session", "world", "publicFacts", "players", "inhibitor", "statePairId", "eventWatermark", "overloadMode",
  "wells", "stars", "wrecks", "planetoids", "portals", "scavengers", "fauna", "sentries",
]);
const ENTITY_KEYS = Object.freeze(Object.values(ENTITY_FIELD_CLASSIFICATION)
  .flatMap((classification) => Object.values(classification).flat()));
const FIELD_KEYS = Object.freeze([...new Set([
  ...PUBLIC_FACT_KEYS, ...ENTITY_KEYS, ...OWNER_AND_NESTED_KEYS,
])].sort());

const CATEGORY_TAG = new Map(CATEGORIES.map((value, index) => [value, index]));
const COMPONENT_TAG = new Map(COMPONENTS.map((value, index) => [value, index]));
const FIELD_TAG = new Map(FIELD_KEYS.map((value, index) => [value, index]));
const OVERLOAD_TAG = new Map(OVERLOAD_MODES.map((value, index) => [value, index]));
const RECOVERY_TAGS = new Map(RECOVERY_REASONS.map((value, index) => [value, index]));
const DESPAWN_TAGS = new Map(DESPAWN_REASONS.map((value, index) => [value, index]));
const POSITIONAL_CODEC_MANIFEST = Object.freeze({
  codecSchema: CODEC_SCHEMA,
  codecVersion: CODEC_VERSION,
  transport: "canonical-compact-json-text",
  semanticHashes: "lbh-canonical-projection-v1",
  frameTags: Object.freeze({ statePair: PAIR_TAG, statePairAck: ACK_TAG, statePairRecovery: RECOVERY_TAG }),
  pairLayout: Object.freeze(["frameTag", "codecVersion", "codecManifestHash", "pairSchemaTag", "matchId",
    "sessionId", "authorityIncarnation", "recipientId", "recipientIncarnation", "frameId", "statePairId",
    "snapshotId", "tick", "simTime", "eventWatermark", "fieldRevision", "overloadTag", "ballparkEpoch",
    "sessionManifestHash", "publicLane", "ownerLane"]),
  keyframeLaneLayout: Object.freeze(["kindTag=0", "resultHash", "worldValue", "entities"]),
  deltaLaneLayout: Object.freeze(["kindTag=1", "baseSnapshotId", "baseHash", "resultHash", "rootOps",
    "creates", "updates", "despawns"]),
  entityLayout: Object.freeze(["categoryTag", "sourceId", "incarnation", "lifecycleRevision", "components"]),
  componentLayout: Object.freeze(["componentTag", "revision", "value"]),
  updateLayout: Object.freeze(["categoryTag", "sourceId", "incarnation", "lifecycleRevision", "components"]),
  despawnLayout: Object.freeze(["categoryTag", "sourceId", "incarnation", "lifecycleRevision", "reasonTag"]),
  genericValueLayout: Object.freeze({ object: "[0,fieldTag,value,...]", array: "[1,value,...]" }),
  dictionaries: Object.freeze({ categories: CATEGORIES, components: COMPONENTS, fields: FIELD_KEYS,
    overloadModes: OVERLOAD_MODES, recoveryReasons: RECOVERY_REASONS, despawnReasons: DESPAWN_REASONS }),
  limits: Object.freeze({ maxBytes: MAX_CODEC_BYTES, maxDepth: MAX_CODEC_DEPTH, maxNodes: MAX_CODEC_NODES,
    maxArrayItems: MAX_CODEC_ARRAY_ITEMS, maxStringBytes: MAX_CODEC_STRING_BYTES }),
});
const POSITIONAL_CODEC_MANIFEST_HASH = `sha256:${crypto.createHash("sha256")
  .update(canonicalJsonBytes(POSITIONAL_CODEC_MANIFEST)).digest("hex")}`;

class PositionalCodecError extends Error {
  constructor(code, message) {
    super(message);
    this.name = "PositionalCodecError";
    this.code = code;
  }
}

function fail(code, message) {
  throw new PositionalCodecError(code, message);
}

function exactArray(value, length, label) {
  if (!Array.isArray(value) || value.length !== length) fail("invalid-layout", `${label} must have ${length} slots`);
  for (let index = 0; index < value.length; index += 1) {
    if (!Object.hasOwn(value, index)) fail("sparse-array", `${label} contains a sparse hole`);
  }
  return value;
}

function boundedArray(value, label, minimum = 0) {
  if (!Array.isArray(value) || value.length < minimum || value.length > MAX_CODEC_ARRAY_ITEMS) {
    fail("invalid-layout", `${label} is not a bounded array`);
  }
  for (let index = 0; index < value.length; index += 1) {
    if (!Object.hasOwn(value, index)) fail("sparse-array", `${label} contains a sparse hole`);
  }
  return value;
}

function string(value, label, { allowNull = false } = {}) {
  if (allowNull && value === null) return value;
  if (typeof value !== "string" || value.length === 0 || value.trim() !== value
      || value !== value.normalize("NFC") || Buffer.byteLength(value, "utf8") > MAX_CODEC_STRING_BYTES
  ) fail("invalid-string", `${label} is invalid`);
  return value;
}

function jsonString(value, label) {
  if (typeof value !== "string" || Buffer.byteLength(value, "utf8") > MAX_CODEC_STRING_BYTES) {
    fail("invalid-string", `${label} is invalid`);
  }
  return value;
}

function integer(value, label, minimum = 0) {
  if (!Number.isSafeInteger(value) || value < minimum || Object.is(value, -0)) fail("invalid-number", `${label} is invalid`);
  return value;
}

function number(value, label) {
  if (!Number.isFinite(value) || Object.is(value, -0)) fail("invalid-number", `${label} is invalid`);
  return value;
}

function tagOf(table, value, label) {
  const tag = table.get(value);
  if (!Number.isSafeInteger(tag)) fail("unknown-tag-value", `${label} ${JSON.stringify(value)} is not in the codec manifest`);
  return tag;
}

function valueOf(values, tag, label) {
  integer(tag, label);
  if (tag >= values.length) fail("unknown-tag", `${label} is outside the codec manifest`);
  return values[tag];
}

function countNode(state, depth, label) {
  if (depth > MAX_CODEC_DEPTH) fail("complexity-limit", `${label} is too deep`);
  state.nodes += 1;
  if (state.nodes > MAX_CODEC_NODES) fail("complexity-limit", `${label} is too complex`);
}

function encodeValue(value, state = { nodes: 0 }, depth = 0, label = "$value") {
  countNode(state, depth, label);
  if (value === null || typeof value === "boolean") return value;
  if (typeof value === "number") return number(value, label);
  if (typeof value === "string") return jsonString(value, label);
  if (Array.isArray(value)) {
    boundedArray(value, label);
    return [1, ...value.map((entry, index) => encodeValue(entry, state, depth + 1, `${label}[${index}]`))];
  }
  if (!value || typeof value !== "object" || (Object.getPrototypeOf(value) !== Object.prototype
      && Object.getPrototypeOf(value) !== null)) fail("invalid-value", `${label} must contain JSON values`);
  const entries = Object.keys(value).map((key) => [tagOf(FIELD_TAG, key, `${label} key`), key, value[key]])
    .sort((left, right) => left[0] - right[0]);
  if (entries.length > FIELD_KEYS.length) fail("complexity-limit", `${label} has too many fields`);
  const output = [0];
  for (const [tag, key, child] of entries) output.push(tag, encodeValue(child, state, depth + 1, `${label}.${key}`));
  return output;
}

function decodeValue(encoded, state = { nodes: 0 }, depth = 0, label = "$value") {
  countNode(state, depth, label);
  if (encoded === null || typeof encoded === "boolean") return encoded;
  if (typeof encoded === "number") return number(encoded, label);
  if (typeof encoded === "string") return jsonString(encoded, label);
  boundedArray(encoded, label, 1);
  const kind = integer(encoded[0], `${label} kind`);
  if (kind === 1) {
    return encoded.slice(1).map((entry, index) => decodeValue(entry, state, depth + 1, `${label}[${index}]`));
  }
  if (kind !== 0 || encoded.length % 2 !== 1) fail("invalid-layout", `${label} object encoding is invalid`);
  const output = {};
  let previous = -1;
  for (let index = 1; index < encoded.length; index += 2) {
    const fieldTag = integer(encoded[index], `${label} field tag`);
    if (fieldTag <= previous) fail("noncanonical-order", `${label} field tags must be unique and increasing`);
    previous = fieldTag;
    const key = valueOf(FIELD_KEYS, fieldTag, `${label} field tag`);
    output[key] = decodeValue(encoded[index + 1], state, depth + 1, `${label}.${key}`);
  }
  return output;
}

function splitPublicId(id) {
  string(id, "publicEntityId");
  const first = /^(\d+):/.exec(id);
  if (!first) fail("invalid-identity", "publicEntityId category prefix is invalid");
  const categoryBytes = Number(first[1]);
  const categoryStart = first[0].length;
  let categoryEnd = categoryStart;
  let consumed = 0;
  while (categoryEnd < id.length && consumed < categoryBytes) {
    const codePoint = id.codePointAt(categoryEnd);
    const character = String.fromCodePoint(codePoint);
    consumed += Buffer.byteLength(character, "utf8");
    categoryEnd += character.length;
  }
  if (consumed !== categoryBytes) fail("invalid-identity", "publicEntityId category length is invalid");
  const category = id.slice(categoryStart, categoryEnd);
  const second = /^(\d+):/.exec(id.slice(categoryEnd));
  if (!second) fail("invalid-identity", "publicEntityId source prefix is invalid");
  const sourceBytes = Number(second[1]);
  const sourceId = id.slice(categoryEnd + second[0].length);
  if (Buffer.byteLength(sourceId, "utf8") !== sourceBytes || publicEntityId(category, sourceId) !== id) {
    fail("invalid-identity", "publicEntityId is not canonical");
  }
  return [tagOf(CATEGORY_TAG, category, "entity category"), string(sourceId, "sourceId")];
}

function encodeComponentEntries(components, label) {
  if (!components || typeof components !== "object" || Array.isArray(components)) fail("invalid-components", `${label} is invalid`);
  return Object.keys(components).map((name) => {
    const component = components[name];
    if (!component || typeof component !== "object" || Array.isArray(component)) fail("invalid-components", `${label}.${name} is invalid`);
    const tag = tagOf(COMPONENT_TAG, name, `${label} name`);
    if (component.remove === true) {
      if (Object.keys(component).length !== 2 || !Object.hasOwn(component, "revision")) fail("invalid-components", `${label}.${name} removal is invalid`);
      return [tag, integer(component.revision, `${label}.${name}.revision`), 0];
    }
    if (Object.keys(component).length !== 2 || !Object.hasOwn(component, "revision") || !Object.hasOwn(component, "value")) {
      fail("invalid-components", `${label}.${name} is invalid`);
    }
    return [tag, integer(component.revision, `${label}.${name}.revision`), 1, encodeValue(component.value)];
  }).sort((left, right) => left[0] - right[0]);
}

function decodeComponentEntries(entries, label, { allowRemove = false } = {}) {
  boundedArray(entries, label);
  const output = {};
  let previous = -1;
  for (let index = 0; index < entries.length; index += 1) {
    const entry = boundedArray(entries[index], `${label}[${index}]`, 3);
    const tag = integer(entry[0], `${label}[${index}] tag`);
    if (tag <= previous) fail("noncanonical-order", `${label} tags must be unique and increasing`);
    previous = tag;
    const name = valueOf(COMPONENTS, tag, `${label}[${index}] tag`);
    const revision = integer(entry[1], `${label}[${index}] revision`);
    const mode = integer(entry[2], `${label}[${index}] mode`);
    if (mode === 0) {
      exactArray(entry, 3, `${label}[${index}]`);
      if (!allowRemove) fail("invalid-layout", `${label}[${index}] cannot remove a component`);
      output[name] = { revision, remove: true };
    } else if (mode === 1) {
      exactArray(entry, 4, `${label}[${index}]`);
      output[name] = { revision, value: decodeValue(entry[3]) };
    } else fail("unknown-tag", `${label}[${index}] mode is unknown`);
  }
  return output;
}

function encodeEntity(entity, label) {
  if (!entity || typeof entity !== "object" || Array.isArray(entity)) fail("invalid-entity", `${label} is invalid`);
  const expectedId = publicEntityId(entity.category, entity.sourceId);
  if (entity.publicEntityId !== expectedId) fail("invalid-identity", `${label} publicEntityId is not canonical`);
  return [tagOf(CATEGORY_TAG, entity.category, `${label}.category`), string(entity.sourceId, `${label}.sourceId`),
    integer(entity.incarnation, `${label}.incarnation`), integer(entity.lifecycleRevision, `${label}.lifecycleRevision`),
    encodeComponentEntries(entity.components, `${label}.components`)];
}

function decodeEntity(encoded, label) {
  exactArray(encoded, 5, label);
  const category = valueOf(CATEGORIES, encoded[0], `${label}.category`);
  const sourceId = string(encoded[1], `${label}.sourceId`);
  return { publicEntityId: publicEntityId(category, sourceId), category, sourceId,
    incarnation: integer(encoded[2], `${label}.incarnation`),
    lifecycleRevision: integer(encoded[3], `${label}.lifecycleRevision`),
    components: decodeComponentEntries(encoded[4], `${label}.components`) };
}

function encodeUpdate(update, label) {
  const [categoryTag, sourceId] = splitPublicId(update.publicEntityId);
  return [categoryTag, sourceId, integer(update.incarnation, `${label}.incarnation`),
    integer(update.lifecycleRevision, `${label}.lifecycleRevision`),
    encodeComponentEntries(update.components, `${label}.components`)];
}

function decodeUpdate(encoded, label) {
  exactArray(encoded, 5, label);
  const category = valueOf(CATEGORIES, encoded[0], `${label}.category`);
  const sourceId = string(encoded[1], `${label}.sourceId`);
  return { publicEntityId: publicEntityId(category, sourceId),
    incarnation: integer(encoded[2], `${label}.incarnation`),
    lifecycleRevision: integer(encoded[3], `${label}.lifecycleRevision`),
    components: decodeComponentEntries(encoded[4], `${label}.components`, { allowRemove: true }) };
}

function encodeRootOp(operation, label) {
  if (!operation || typeof operation !== "object" || !Array.isArray(operation.path)) fail("invalid-operation", `${label} is invalid`);
  const path = operation.path.map((field) => tagOf(FIELD_TAG, field, `${label}.path`));
  if (operation.op === "remove" && Object.keys(operation).length === 2) return [0, path];
  if (operation.op === "set" && Object.keys(operation).length === 3 && Object.hasOwn(operation, "value")) {
    return [1, path, encodeValue(operation.value)];
  }
  fail("invalid-operation", `${label} is invalid`);
}

function decodeRootOp(encoded, label) {
  boundedArray(encoded, label, 2);
  const op = integer(encoded[0], `${label}.op`);
  const tags = boundedArray(encoded[1], `${label}.path`, 1);
  const path = [];
  for (const tag of tags) path.push(valueOf(FIELD_KEYS, tag, `${label}.path tag`));
  if (op === 0) { exactArray(encoded, 2, label); return { op: "remove", path }; }
  if (op === 1) { exactArray(encoded, 3, label); return { op: "set", path, value: decodeValue(encoded[2]) }; }
  fail("unknown-tag", `${label}.op is unknown`);
}

function encodeLane(payload, label) {
  if (payload.kind === "keyframe") {
    return [0, string(payload.resultHash, `${label}.resultHash`), encodeValue(payload.projection.world),
      payload.projection.entities.map((entity, index) => encodeEntity(entity, `${label}.entities[${index}]`))];
  }
  if (payload.kind !== "delta") fail("invalid-layout", `${label}.kind is invalid`);
  return [1, string(payload.baseSnapshotId, `${label}.baseSnapshotId`), string(payload.baseHash, `${label}.baseHash`),
    string(payload.resultHash, `${label}.resultHash`),
    payload.delta.rootOps.map((entry, index) => encodeRootOp(entry, `${label}.rootOps[${index}]`)),
    payload.delta.creates.map((entry, index) => encodeEntity(entry, `${label}.creates[${index}]`)),
    payload.delta.updates.map((entry, index) => encodeUpdate(entry, `${label}.updates[${index}]`)),
    payload.delta.despawns.map((entry, index) => {
      const [categoryTag, sourceId] = splitPublicId(entry.publicEntityId);
      return [categoryTag, sourceId, integer(entry.incarnation, `${label}.despawns[${index}].incarnation`),
        integer(entry.lifecycleRevision, `${label}.despawns[${index}].lifecycleRevision`),
        tagOf(DESPAWN_TAGS, entry.reason, `${label}.despawns[${index}].reason`)];
    })];
}

function projectionHeader(frame, lane, world, entities) {
  return { schema: "lbh-canonical-projection-v1", lane, runId: frame.matchId,
    authorityEpoch: frame.authorityIncarnation, connectionEpoch: frame.recipientIncarnation,
    ballparkEpoch: frame.ballparkEpoch, manifestHash: frame.manifestHash, statePairId: frame.statePairId,
    snapshotId: frame.snapshotId, tick: frame.tick, simTime: frame.simTime,
    eventWatermark: frame.eventWatermark, fieldRevision: frame.fieldRevision,
    overloadMode: frame.overloadMode, world, entities };
}

function decodeLane(encoded, frame, lane) {
  boundedArray(encoded, lane, 4);
  const kind = integer(encoded[0], `${lane}.kind`);
  if (kind === 0) {
    exactArray(encoded, 4, lane);
    const projection = projectionHeader(frame, lane, decodeValue(encoded[2]),
      boundedArray(encoded[3], `${lane}.entities`).map((entry, index) => decodeEntity(entry, `${lane}.entities[${index}]`)));
    return { kind: "keyframe", schema: "lbh-canonical-projection-v1",
      resultHash: string(encoded[1], `${lane}.resultHash`), projection };
  }
  if (kind !== 1) fail("unknown-tag", `${lane}.kind is unknown`);
  exactArray(encoded, 8, lane);
  const baseSnapshotId = string(encoded[1], `${lane}.baseSnapshotId`);
  const baseHash = string(encoded[2], `${lane}.baseHash`);
  const resultHash = string(encoded[3], `${lane}.resultHash`);
  const delta = { schema: "lbh-canonical-structural-delta-v1", lane, runId: frame.matchId,
    authorityEpoch: frame.authorityIncarnation, connectionEpoch: frame.recipientIncarnation,
    ballparkEpoch: frame.ballparkEpoch, manifestHash: frame.manifestHash,
    statePairId: frame.statePairId, baseSnapshotId, snapshotId: frame.snapshotId, baseHash, resultHash,
    rootOps: boundedArray(encoded[4], `${lane}.rootOps`).map((entry, index) => decodeRootOp(entry, `${lane}.rootOps[${index}]`)),
    creates: boundedArray(encoded[5], `${lane}.creates`).map((entry, index) => decodeEntity(entry, `${lane}.creates[${index}]`)),
    updates: boundedArray(encoded[6], `${lane}.updates`).map((entry, index) => decodeUpdate(entry, `${lane}.updates[${index}]`)),
    despawns: boundedArray(encoded[7], `${lane}.despawns`).map((entry, index) => {
      exactArray(entry, 5, `${lane}.despawns[${index}]`);
      const category = valueOf(CATEGORIES, entry[0], `${lane}.despawns[${index}].category`);
      const sourceId = string(entry[1], `${lane}.despawns[${index}].sourceId`);
      return { publicEntityId: publicEntityId(category, sourceId),
        incarnation: integer(entry[2], `${lane}.despawns[${index}].incarnation`),
        lifecycleRevision: integer(entry[3], `${lane}.despawns[${index}].lifecycleRevision`),
        reason: valueOf(DESPAWN_REASONS, entry[4], `${lane}.despawns[${index}].reason`) };
    }) };
  return { kind: "delta", schema: "lbh-canonical-structural-delta-v1", baseSnapshotId, baseHash, resultHash, delta };
}

function assertContext(frame, context) {
  if (!context || typeof context !== "object" || Array.isArray(context)) fail("missing-context", "trusted codec context is required");
  if (context.codecManifestHash !== POSITIONAL_CODEC_MANIFEST_HASH) fail("codec-manifest-mismatch", "trusted codec manifest is unsupported");
  const expected = { matchId: context.matchId, sessionId: context.sessionId,
    authorityIncarnation: context.authorityIncarnation, recipientId: context.recipientId,
    recipientIncarnation: context.recipientIncarnation, manifestHash: context.manifestHash };
  for (const [key, value] of Object.entries(expected)) {
    if (value !== undefined && frame[key] !== value) fail("identity-mismatch", `${key} does not match trusted codec context`);
  }
}

function encodeStatePairValue(frame, context) {
  assertContext(frame, context);
  const encoded = [PAIR_TAG, CODEC_VERSION, POSITIONAL_CODEC_MANIFEST_HASH,
    frame.pairSchema === "lbh-authority-state-pair-mixed-v1" ? 1 : frame.pairSchema === "lbh-authority-state-pair-v1" ? 0 : -1,
    string(frame.matchId, "matchId"), string(frame.sessionId, "sessionId"), integer(frame.authorityIncarnation, "authorityIncarnation", 1),
    string(frame.recipientId, "recipientId"), integer(frame.recipientIncarnation, "recipientIncarnation", 1),
    integer(frame.frameId, "frameId", 1), string(frame.statePairId, "statePairId"), string(frame.snapshotId, "snapshotId"),
    integer(frame.tick, "tick"), number(frame.simTime, "simTime"), integer(frame.eventWatermark, "eventWatermark"),
    integer(frame.fieldRevision, "fieldRevision"), tagOf(OVERLOAD_TAG, frame.overloadMode, "overloadMode"),
    integer(frame.ballparkEpoch, "ballparkEpoch"), string(frame.manifestHash, "manifestHash"),
    encodeLane(frame.public, "public"), encodeLane(frame.owner, "owner")];
  if (encoded[3] < 0) fail("unknown-schema", "statePair schema is unsupported");
  return encoded;
}

function encodeStatePair(frame, context) {
  const wire = JSON.stringify(encodeStatePairValue(frame, context));
  if (Buffer.byteLength(wire, "utf8") > MAX_CODEC_BYTES) fail("frame-too-large", "positional statePair exceeds codec limit");
  return wire;
}

function statePairHeader(frame, context) {
  assertContext(frame, context);
  const header = [PAIR_TAG, CODEC_VERSION, POSITIONAL_CODEC_MANIFEST_HASH,
    frame.pairSchema === "lbh-authority-state-pair-mixed-v1" ? 1 : frame.pairSchema === "lbh-authority-state-pair-v1" ? 0 : -1,
    string(frame.matchId, "matchId"), string(frame.sessionId, "sessionId"), integer(frame.authorityIncarnation, "authorityIncarnation", 1),
    string(frame.recipientId, "recipientId"), integer(frame.recipientIncarnation, "recipientIncarnation", 1),
    integer(frame.frameId, "frameId", 1), string(frame.statePairId, "statePairId"), string(frame.snapshotId, "snapshotId"),
    integer(frame.tick, "tick"), number(frame.simTime, "simTime"), integer(frame.eventWatermark, "eventWatermark"),
    integer(frame.fieldRevision, "fieldRevision"), tagOf(OVERLOAD_TAG, frame.overloadMode, "overloadMode"),
    integer(frame.ballparkEpoch, "ballparkEpoch"), string(frame.manifestHash, "manifestHash")];
  if (header[3] < 0) fail("unknown-schema", "statePair schema is unsupported");
  return header;
}

// Exact composed sizing avoids materializing every cartesian state-pair wire.
// JSON arrays have fixed one-byte comma/bracket framing, so a shared serialized
// header plus independently serialized lanes is byte-identical to
// JSON.stringify([...header, publicLane, ownerLane]). Only the selected full
// wire is composed.
function composeStatePairCandidates(entries, context, tieOrder) {
  if (!Array.isArray(entries) || entries.length === 0 || !Array.isArray(tieOrder)) {
    throw new TypeError("candidate entries and tie order are required");
  }
  const firstHeader = statePairHeader(entries[0].frame, context);
  const headerText = JSON.stringify(firstHeader);
  const prefix = headerText.slice(0, -1);
  const prefixBytes = Buffer.byteLength(prefix, "utf8");
  const laneCache = new Map();
  const laneText = (payload, label) => {
    let cached = laneCache.get(payload);
    if (cached) return cached;
    const text = JSON.stringify(encodeLane(payload, label));
    cached = Object.freeze({ text, bytes: Buffer.byteLength(text, "utf8") });
    laneCache.set(payload, cached);
    return cached;
  };
  const sized = entries.map((entry) => {
    const header = statePairHeader(entry.frame, context);
    if (header.length !== firstHeader.length
        || header.some((value, index) => value !== firstHeader[index])) {
      fail("identity-mismatch", "candidate statePair headers differ");
    }
    const publicLane = laneText(entry.frame.public, "public");
    const ownerLane = laneText(entry.frame.owner, "owner");
    const bytes = prefixBytes + 1 + publicLane.bytes + 1 + ownerLane.bytes + 1;
    if (bytes > MAX_CODEC_BYTES) fail("frame-too-large", "positional statePair exceeds codec limit");
    return Object.freeze({ ...entry, bytes, publicLane, ownerLane });
  });
  const rank = new Map(tieOrder.map((kind, index) => [kind, index]));
  const chosen = [...sized].sort((a, b) => a.bytes - b.bytes
    || (rank.get(a.kind) ?? Number.MAX_SAFE_INTEGER) - (rank.get(b.kind) ?? Number.MAX_SAFE_INTEGER))[0];
  const wire = `${prefix},${chosen.publicLane.text},${chosen.ownerLane.text}]`;
  const bytes = Buffer.byteLength(wire, "utf8");
  if (bytes !== chosen.bytes) fail("internal-size-mismatch", "composed positional statePair size disagrees with exact sizing");
  return Object.freeze({ chosen: Object.freeze({ kind: chosen.kind, frame: chosen.frame, bytes, wire }),
    candidates: Object.freeze(sized.map((entry) => Object.freeze({ kind: entry.kind, bytes: entry.bytes }))),
    diagnostics: Object.freeze({ headerSerializations: 1, laneSerializations: laneCache.size,
      componentSerializations: 1 + laneCache.size, fullCandidateCompositions: 1, winnerSerializations: 1,
      bytesExamined: sized.reduce((sum, entry) => sum + entry.bytes, 0),
      allocationProxyBytes: Buffer.byteLength(headerText, "utf8")
        + [...laneCache.values()].reduce((sum, entry) => sum + entry.bytes, 0) + bytes }) });
}

function decodeStatePair(encoded, context) {
  exactArray(encoded, 21, "statePair");
  if (encoded[0] !== PAIR_TAG || encoded[1] !== CODEC_VERSION
      || encoded[2] !== POSITIONAL_CODEC_MANIFEST_HASH) fail("cross-version-replay", "statePair codec binding is unsupported");
  const pairSchema = encoded[3] === 1 ? "lbh-authority-state-pair-mixed-v1"
    : encoded[3] === 0 ? "lbh-authority-state-pair-v1" : fail("unknown-tag", "pair schema tag is unknown");
  const frame = { type: "statePair", pairSchema, matchId: string(encoded[4], "matchId"),
    sessionId: string(encoded[5], "sessionId"), authorityIncarnation: integer(encoded[6], "authorityIncarnation", 1),
    recipientId: string(encoded[7], "recipientId"), recipientIncarnation: integer(encoded[8], "recipientIncarnation", 1),
    frameId: integer(encoded[9], "frameId", 1), statePairId: string(encoded[10], "statePairId"),
    snapshotId: string(encoded[11], "snapshotId"), tick: integer(encoded[12], "tick"), simTime: number(encoded[13], "simTime"),
    eventWatermark: integer(encoded[14], "eventWatermark"), fieldRevision: integer(encoded[15], "fieldRevision"),
    overloadMode: valueOf(OVERLOAD_MODES, encoded[16], "overloadMode"), ballparkEpoch: integer(encoded[17], "ballparkEpoch"),
    manifestHash: string(encoded[18], "manifestHash") };
  assertContext(frame, context);
  frame.public = decodeLane(encoded[19], frame, "public");
  frame.owner = decodeLane(encoded[20], frame, "owner");
  return frame;
}

function encodeAckValue(frame, context) {
  assertContext(frame, context);
  if (frame.ackKind !== "statePair" || frame.ackSchema !== "lbh-authority-state-pair-mixed-ack-v1") {
    fail("unknown-schema", "positional codec only covers mixed statePair ACKs");
  }
  const encoded = [ACK_TAG, CODEC_VERSION, POSITIONAL_CODEC_MANIFEST_HASH,
    string(frame.matchId, "matchId"), string(frame.sessionId, "sessionId"), integer(frame.authorityIncarnation, "authorityIncarnation", 1),
    string(frame.recipientId, "recipientId"), integer(frame.recipientIncarnation, "recipientIncarnation", 1),
    integer(frame.frameId, "frameId", 1), string(frame.statePairId, "statePairId"), string(frame.snapshotId, "snapshotId"),
    string(frame.publicHash, "publicHash"), string(frame.ownerHash, "ownerHash"), integer(frame.tick, "tick"),
    number(frame.simTime, "simTime"), integer(frame.eventWatermark, "eventWatermark"), integer(frame.fieldRevision, "fieldRevision"),
    tagOf(OVERLOAD_TAG, frame.overloadMode, "overloadMode"), integer(frame.ballparkEpoch, "ballparkEpoch"),
    string(frame.manifestHash, "manifestHash"), frame.publicKind === "keyframe" ? 0 : frame.publicKind === "delta" ? 1 : -1,
    frame.ownerKind === "keyframe" ? 0 : frame.ownerKind === "delta" ? 1 : -1,
    string(frame.publicBaseSnapshotId, "publicBaseSnapshotId", { allowNull: true }),
    string(frame.ownerBaseSnapshotId, "ownerBaseSnapshotId", { allowNull: true })];
  if (encoded[20] < 0 || encoded[21] < 0) fail("unknown-tag", "ACK lane kind is invalid");
  return encoded;
}

function encodeAck(frame, context) {
  return JSON.stringify(encodeAckValue(frame, context));
}

function decodeAck(encoded, context) {
  exactArray(encoded, 24, "statePairAck");
  if (encoded[0] !== ACK_TAG || encoded[1] !== CODEC_VERSION || encoded[2] !== POSITIONAL_CODEC_MANIFEST_HASH) {
    fail("cross-version-replay", "ACK codec binding is unsupported");
  }
  const frame = { type: "ack", ackKind: "statePair", ackSchema: "lbh-authority-state-pair-mixed-ack-v1",
    matchId: string(encoded[3], "matchId"), sessionId: string(encoded[4], "sessionId"),
    authorityIncarnation: integer(encoded[5], "authorityIncarnation", 1), recipientId: string(encoded[6], "recipientId"),
    recipientIncarnation: integer(encoded[7], "recipientIncarnation", 1), frameId: integer(encoded[8], "frameId", 1),
    statePairId: string(encoded[9], "statePairId"), snapshotId: string(encoded[10], "snapshotId"),
    publicHash: string(encoded[11], "publicHash"), ownerHash: string(encoded[12], "ownerHash"),
    pairSchema: "lbh-authority-state-pair-mixed-v1", tick: integer(encoded[13], "tick"), simTime: number(encoded[14], "simTime"),
    eventWatermark: integer(encoded[15], "eventWatermark"), fieldRevision: integer(encoded[16], "fieldRevision"),
    overloadMode: valueOf(OVERLOAD_MODES, encoded[17], "overloadMode"), ballparkEpoch: integer(encoded[18], "ballparkEpoch"),
    manifestHash: string(encoded[19], "manifestHash"),
    publicKind: encoded[20] === 0 ? "keyframe" : encoded[20] === 1 ? "delta" : fail("unknown-tag", "publicKind is unknown"),
    ownerKind: encoded[21] === 0 ? "keyframe" : encoded[21] === 1 ? "delta" : fail("unknown-tag", "ownerKind is unknown"),
    publicBaseSnapshotId: string(encoded[22], "publicBaseSnapshotId", { allowNull: true }),
    ownerBaseSnapshotId: string(encoded[23], "ownerBaseSnapshotId", { allowNull: true }) };
  assertContext(frame, context);
  return frame;
}

function encodeRecoveryValue(frame, context) {
  assertContext(frame, context);
  return [RECOVERY_TAG, CODEC_VERSION, POSITIONAL_CODEC_MANIFEST_HASH,
    tagOf(RECOVERY_TAGS, frame.reason, "recovery reason"), string(frame.matchId, "matchId"),
    string(frame.sessionId, "sessionId"), integer(frame.authorityIncarnation, "authorityIncarnation", 1),
    string(frame.recipientId, "recipientId"), integer(frame.recipientIncarnation, "recipientIncarnation", 1),
    string(frame.manifestSchema, "manifestSchema"), string(frame.manifestHash, "manifestHash"),
    integer(frame.lastAcceptedFrameId, "lastAcceptedFrameId"),
    string(frame.lastAcceptedStatePairId, "lastAcceptedStatePairId", { allowNull: true }),
    string(frame.lastAcceptedSnapshotId, "lastAcceptedSnapshotId", { allowNull: true })];
}

function encodeRecovery(frame, context) {
  return JSON.stringify(encodeRecoveryValue(frame, context));
}

function decodeRecovery(encoded, context) {
  exactArray(encoded, 14, "statePairRecovery");
  if (encoded[0] !== RECOVERY_TAG || encoded[1] !== CODEC_VERSION || encoded[2] !== POSITIONAL_CODEC_MANIFEST_HASH) {
    fail("cross-version-replay", "recovery codec binding is unsupported");
  }
  const frame = { type: "statePairRecovery", recoverySchema: "lbh-client-state-pair-recovery-v1",
    reason: valueOf(RECOVERY_REASONS, encoded[3], "recovery reason"), matchId: string(encoded[4], "matchId"),
    sessionId: string(encoded[5], "sessionId"), authorityIncarnation: integer(encoded[6], "authorityIncarnation", 1),
    recipientId: string(encoded[7], "recipientId"), recipientIncarnation: integer(encoded[8], "recipientIncarnation", 1),
    manifestSchema: string(encoded[9], "manifestSchema"), manifestHash: string(encoded[10], "manifestHash"),
    lastAcceptedFrameId: integer(encoded[11], "lastAcceptedFrameId"),
    lastAcceptedStatePairId: string(encoded[12], "lastAcceptedStatePairId", { allowNull: true }),
    lastAcceptedSnapshotId: string(encoded[13], "lastAcceptedSnapshotId", { allowNull: true }) };
  assertContext(frame, context);
  return frame;
}

function encodePositionalFrame(frame, context) {
  if (frame?.type === "statePair") return encodeStatePair(frame, context);
  if (frame?.type === "ack" && frame.ackKind === "statePair") return encodeAck(frame, context);
  if (frame?.type === "statePairRecovery") return encodeRecovery(frame, context);
  fail("unsupported-frame", "frame is not covered by the positional state-pair codec");
}

function encodePositionalValueFrame(frame, context) {
  if (frame?.type === "statePair") return encodeStatePairValue(frame, context);
  if (frame?.type === "ack" && frame.ackKind === "statePair") return encodeAckValue(frame, context);
  if (frame?.type === "statePairRecovery") return encodeRecoveryValue(frame, context);
  fail("unsupported-frame", "frame is not covered by the positional state-pair codec");
}

function decodePositionalValueFrame(encoded, context) {
  if (!Array.isArray(encoded)) fail("invalid-layout", "positional frame must be an array");
  if (encoded[0] === PAIR_TAG) return decodeStatePair(encoded, context);
  if (encoded[0] === ACK_TAG) return decodeAck(encoded, context);
  if (encoded[0] === RECOVERY_TAG) return decodeRecovery(encoded, context);
  fail("unknown-tag", "positional frame tag is unknown");
}

function decodePositionalFrame(raw, context) {
  const text = typeof raw === "string" ? raw : Buffer.isBuffer(raw) || raw instanceof Uint8Array
    ? new TextDecoder("utf-8", { fatal: true }).decode(raw) : fail("invalid-encoding", "wire must be UTF-8 JSON text");
  if (Buffer.byteLength(text, "utf8") > MAX_CODEC_BYTES) fail("frame-too-large", "positional frame exceeds codec limit");
  let encoded;
  try { encoded = JSON.parse(text); } catch { fail("invalid-json", "positional frame is not valid JSON"); }
  if (!Array.isArray(encoded)) fail("invalid-layout", "positional frame must be an array");
  // This byte equality is the malleability fence: whitespace, alternate number
  // spellings, escaped string aliases, and negative zero are not admitted.
  if (JSON.stringify(encoded) !== text) fail("noncanonical-json", "positional frame is not canonical compact JSON");
  return decodePositionalValueFrame(encoded, context);
}

function codecContext(input = {}) {
  return Object.freeze({ codecManifestHash: POSITIONAL_CODEC_MANIFEST_HASH,
    matchId: input.matchId, sessionId: input.sessionId, authorityIncarnation: input.authorityIncarnation,
    recipientId: input.recipientId, recipientIncarnation: input.recipientIncarnation,
    manifestHash: input.manifestHash });
}

module.exports = {
  CAPABILITY, CODEC_SCHEMA, CODEC_VERSION, POSITIONAL_CODEC_MANIFEST, POSITIONAL_CODEC_MANIFEST_HASH,
  MAX_CODEC_BYTES, PositionalCodecError, codecContext, encodePositionalFrame, decodePositionalFrame,
  encodePositionalValueFrame, decodePositionalValueFrame, composeStatePairCandidates,
};
