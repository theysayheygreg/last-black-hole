"use strict";

const { canonicalJson } = require("./session-replication-manifest.cjs");

const CAPABILITY = "runtime-public-components-v1";
const COMPONENT_SCHEMA = "lbh-runtime-public-components-v1";
const COMPONENTS = Object.freeze({
  motion: "runtimeMotion",
  gameplay: "runtimeGameplay",
  identity: "runtimeIdentity",
  presentation: "runtimePresentation",
});

// Every top-level field copied from the authoritative public snapshot is
// classified here. Projection fails closed when a source category or field is
// absent from this table. Movement/collision fields stay on every configured
// 10 Hz publication; the other groups use component revision/on-change
// semantics and therefore have no timer-driven staleness.
const ENTITY_FIELD_CLASSIFICATION = Object.freeze({
  player: Object.freeze({
    motion: Object.freeze(["wx", "wy", "vx", "vy", "slingshot"]),
    gameplay: Object.freeze(["status"]),
    identity: Object.freeze(["sourceId", "incarnation", "clientId", "name", "isAI", "personality", "hullType"]),
    presentation: Object.freeze([]),
  }),
  well: Object.freeze({
    motion: Object.freeze(["wx", "wy", "killRadius"]),
    gameplay: Object.freeze(["mass", "growthRate", "consumedByInhibitor"]),
    identity: Object.freeze(["sourceId", "incarnation", "id"]),
    presentation: Object.freeze(["name", "orbitalDir", "points", "spinRate", "baseKillRadius", "startMass"]),
  }),
  star: Object.freeze({
    motion: Object.freeze(["wx", "wy", "driftVX", "driftVY"]),
    gameplay: Object.freeze(["alive", "mass"]),
    identity: Object.freeze(["sourceId", "incarnation", "id", "type"]),
    presentation: Object.freeze(["orbitalDir"]),
  }),
  wreck: Object.freeze({
    motion: Object.freeze(["wx", "wy", "vx", "vy", "size"]),
    gameplay: Object.freeze(["alive", "looted", "pickupCooldown", "loot", "tier", "spawnTime",
      "survivalTime", "signalPeak", "peakCargoValue", "echoSurvivalTime"]),
    identity: Object.freeze(["sourceId", "incarnation", "id", "type", "name", "wreckId", "mapId", "seed", "createdAt", "pilotName",
      "hullType", "deathCause", "deathEntityId", "signalPeakZone", "isEcho", "echoPilotName", "echoHullType",
      "echoDeathCause"]),
    presentation: Object.freeze(["fragment", "echoFragment"]),
  }),
  planetoid: Object.freeze({
    motion: Object.freeze(["wx", "wy", "vx", "vy"]),
    gameplay: Object.freeze(["alive", "age", "t", "wellIndex", "wellA", "wellB"]),
    identity: Object.freeze(["sourceId", "incarnation", "id", "type"]),
    presentation: Object.freeze(["pathData"]),
  }),
  portal: Object.freeze({
    motion: Object.freeze(["wx", "wy"]),
    gameplay: Object.freeze(["alive", "lifespan", "spawnTime", "blockedByInhibitor", "finalInhibitor"]),
    identity: Object.freeze(["sourceId", "incarnation", "id", "type", "wave"]),
    presentation: Object.freeze(["opacity"]),
  }),
  scavenger: Object.freeze({
    motion: Object.freeze(["wx", "wy", "vx", "vy", "facing", "driftHeading"]),
    gameplay: Object.freeze(["alive", "state", "decisionTimer", "lootCount", "lootTarget", "targetPortalId",
      "targetWreckId", "deathTimer", "deathWellId", "deathWellWX", "deathWellWY", "deathStartWX",
      "deathStartWY", "deathAngle"]),
    identity: Object.freeze(["sourceId", "incarnation", "id", "name", "callsign", "archetype", "faction"]),
    presentation: Object.freeze(["thrustIntensity"]),
  }),
  fauna: Object.freeze({
    motion: Object.freeze(["wx", "wy", "vx", "vy"]),
    gameplay: Object.freeze(["alive", "age", "lifespan"]),
    identity: Object.freeze(["sourceId", "incarnation", "id", "type"]),
    presentation: Object.freeze(["phase"]),
  }),
  sentry: Object.freeze({
    motion: Object.freeze(["wx", "wy", "lungeTargetX", "lungeTargetY"]),
    gameplay: Object.freeze(["alive", "state", "wellId", "lungeTimer", "recoverTimer"]),
    identity: Object.freeze(["sourceId", "incarnation", "id"]),
    presentation: Object.freeze(["orbitAngle", "orbitDir", "orbitRadius", "orbitSpeed"]),
  }),
  inhibitor: Object.freeze({
    motion: Object.freeze(["wx", "wy", "targetWX", "targetWY", "lastSignalWX", "lastSignalWY", "radius"]),
    gameplay: Object.freeze(["form", "intensity", "threshold", "pressureFrac", "pressure",
      "finalPortalSpawned", "finalPortalExpired", "gravityBonus"]),
    identity: Object.freeze(["sourceId", "incarnation"]),
    presentation: Object.freeze(["localTime", "formTimes"]),
  }),
});

const PUBLIC_FACT_CLASSIFICATION = Object.freeze({
  rootLineage: Object.freeze(["type", "protocolVersion", "bodySchemaVersion", "snapshotSchemaVersion", "runId",
    "baselineSnapshotId", "snapshotId", "tick", "simTime", "fieldRevision", "serverTime", "lastEventSeq"]),
  staticSession: Object.freeze(["id", "runId", "mapId", "mapName", "seed", "maxPlayers", "worldScale",
    "simScaleProfile", "clientPerfProfile", "cosmicSignature", "aiSeed", "lootQualityBias", "hasNamedWreck",
    "baseTickHz", "baseSnapshotHz", "baseWorldTickHz", "basePortalTickHz", "baseScavengerTickHz",
    "baseWaveTickHz", "baseGrowthTickHz", "baseFieldTickHz", "baseFlowFieldCellSize", "baseFieldFlowScale",
    "baseMaxScavengers", "baseSpawnScavengersBase", "baseSpawnScavengersPerPlayer",
    "baseMaxWellInfluencesPerPlayer", "baseMaxWaveInfluencesPerPlayer", "baseMaxPickupChecksPerPlayer",
    "baseMaxPortalChecksPerPlayer", "baseEntityRelevanceRadius", "baseScavengerRelevanceRadius",
    "baseMaxRelevantStarsPerPlayer", "baseMaxRelevantPlanetoidsPerPlayer", "baseMaxRelevantWrecksPerPlayer",
    "baseMaxRelevantScavengersPerPlayer"]),
  dynamicSession: Object.freeze(["status", "hostClientId", "hostName", "endReason", "endedAt", "endedSimTime",
    "namedWreckWave", "overloadState", "overloadPressure",
    "timeScale", "tickHz", "snapshotHz", "worldTickHz", "portalTickHz", "scavengerTickHz", "waveTickHz",
    "growthTickHz", "fieldTickHz", "flowFieldCellSize", "fieldFlowScale", "useCoarseField", "maxScavengers",
    "spawnScavengersBase", "spawnScavengersPerPlayer", "maxWellInfluencesPerPlayer",
    "maxWaveInfluencesPerPlayer", "maxPickupChecksPerPlayer", "maxPortalChecksPerPlayer",
    "entityRelevanceRadius", "scavengerRelevanceRadius", "maxRelevantStarsPerPlayer",
    "maxRelevantPlanetoidsPerPlayer", "maxRelevantWrecksPerPlayer", "maxRelevantScavengersPerPlayer"]),
  worldRoot: Object.freeze(["nextPortalWaveIndex"]),
});

const SLINGSHOT_KEYS = new Set(["engaged", "anchorId", "anchorType", "anchorWX", "anchorWY", "anchorRange", "orbitDir"]);
const PATH_DATA_KEYS = new Set(["wellIndex", "wellA", "wellB", "semiA", "semiB", "tilt", "speed"]);
const LOOT_KEYS = new Set(["id", "name", "tier", "affinity", "coefficients", "value", "special", "effect",
  "amount", "catalogId", "category", "subcategory", "baseValue", "effectDesc", "useEffect", "useDesc", "charges",
  "instanceId"]);
const COEFFICIENT_KEYS = new Set(["cargoSlots", "controlDebuffResist", "currentCoupling", "deltaVBurnMult",
  "deltaVCapacityMult", "deltaVRegenMult", "dragScale", "pickupRadius", "pulseCooldownScale", "pulseRadiusScale",
  "pulseSignalScale", "sensorRange", "signalDecayMult", "signalGenMult", "thrustScale", "wellResistScale"]);

class RuntimePublicSchemaError extends Error {
  constructor(code, message) {
    super(message);
    this.name = "RuntimePublicSchemaError";
    this.code = code;
  }
}

function fail(code, message) {
  throw new RuntimePublicSchemaError(code, message);
}

function plainObject(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function exactKeys(value, allowed, label) {
  if (!plainObject(value)) fail("invalid-source-field", `${label} must be an object`);
  for (const key of Object.keys(value)) {
    if (!allowed.has(key)) fail("unknown-source-field", `${label}.${key} is not classified`);
  }
}

function validateNested(category, entity) {
  if (category === "player" && entity.slingshot !== null && entity.slingshot !== undefined) {
    exactKeys(entity.slingshot, SLINGSHOT_KEYS, "player.slingshot");
  }
  if (category === "planetoid" && entity.pathData !== undefined) {
    exactKeys(entity.pathData, PATH_DATA_KEYS, "planetoid.pathData");
  }
  if (category === "wreck" && entity.loot !== undefined) {
    if (!Array.isArray(entity.loot)) fail("invalid-source-field", "wreck.loot must be an array");
    for (let index = 0; index < entity.loot.length; index += 1) {
      const item = entity.loot[index];
      exactKeys(item, LOOT_KEYS, `wreck.loot[${index}]`);
      if (item.coefficients !== undefined) exactKeys(item.coefficients, COEFFICIENT_KEYS, `wreck.loot[${index}].coefficients`);
    }
  }
}

function assertPublicFactsClassified(state) {
  if (!plainObject(state)) fail("invalid-source-field", "public state must be an object");
  const rootAllowed = new Set([...PUBLIC_FACT_CLASSIFICATION.rootLineage, "session", "players", "world", "inhibitor"]);
  exactKeys(state, rootAllowed, "publicState");
  const sessionAllowed = new Set([...PUBLIC_FACT_CLASSIFICATION.staticSession, ...PUBLIC_FACT_CLASSIFICATION.dynamicSession]);
  exactKeys(state.session, sessionAllowed, "publicState.session");
  if (!plainObject(state.world)) fail("invalid-source-field", "publicState.world must be an object");
  const worldAllowed = new Set([...PUBLIC_FACT_CLASSIFICATION.worldRoot,
    "wells", "stars", "wrecks", "planetoids", "portals", "scavengers", "fauna", "sentries"]);
  exactKeys(state.world, worldAllowed, "publicState.world");
  return true;
}

function splitRuntimePublicEntity(category, entity) {
  if (!plainObject(entity)) fail("invalid-source-field", `${category} entity must be an object`);
  const classification = ENTITY_FIELD_CLASSIFICATION[category];
  if (!classification) fail("unknown-source-category", `${category} is not classified`);
  const allowed = new Set(Object.values(classification).flat());
  exactKeys(entity, allowed, category);
  validateNested(category, entity);
  const components = {};
  for (const group of ["motion", "gameplay", "identity", "presentation"]) {
    const value = {};
    for (const field of classification[group]) {
      if (Object.hasOwn(entity, field)) value[field] = entity[field];
    }
    if (Object.keys(value).length) components[COMPONENTS[group]] = JSON.parse(canonicalJson(value));
  }
  return components;
}

function reconstructRuntimePublicEntity(entity) {
  if (!plainObject(entity) || !plainObject(entity.components)) fail("invalid-materialized-entity", "materialized entity is invalid");
  const classification = ENTITY_FIELD_CLASSIFICATION[entity.category];
  if (!classification) fail("unknown-source-category", `${entity.category} is not classified`);
  if (entity.components.runtimePublic) fail("legacy-component-in-split-view", "split view contains runtimePublic");
  if (!Object.values(COMPONENTS).some((name) => entity.components[name])) {
    fail("missing-runtime-components", `${entity.category} has no classified runtime component`);
  }
  const output = {};
  for (const group of ["motion", "gameplay", "identity", "presentation"]) {
    const component = entity.components[COMPONENTS[group]];
    if (!component) continue;
    exactKeys(component.value, new Set(classification[group]), `${entity.category}.${COMPONENTS[group]}`);
    for (const field of classification[group]) {
      if (Object.hasOwn(component.value, field)) output[field] = component.value[field];
    }
  }
  validateNested(entity.category, output);
  return JSON.parse(canonicalJson(output));
}

function reconstructLegacyPublicEntities(view) {
  if (!plainObject(view) || !Array.isArray(view.entities)) fail("invalid-materialized-view", "materialized public view is invalid");
  return Object.freeze(view.entities.map((entity) => Object.freeze({
    category: entity.category,
    sourceId: entity.sourceId,
    index: entity.components.runtimeOrder?.value?.index ?? null,
    value: Object.freeze(reconstructRuntimePublicEntity(entity)),
  })).sort((a, b) => a.category.localeCompare(b.category) || a.index - b.index || a.sourceId.localeCompare(b.sourceId)));
}

module.exports = {
  CAPABILITY,
  COMPONENT_SCHEMA,
  COMPONENTS,
  ENTITY_FIELD_CLASSIFICATION,
  PUBLIC_FACT_CLASSIFICATION,
  RuntimePublicSchemaError,
  assertPublicFactsClassified,
  splitRuntimePublicEntity,
  reconstructRuntimePublicEntity,
  reconstructLegacyPublicEntities,
};
