// Persistence-only adapter for the shared condition vocabulary.  This module
// deliberately owns no gameplay state: it loads the canonical manifest,
// migrates durable pilot facts, and projects legacy profile fields at the
// control-plane boundary while consumers finish moving to condition reads.
const {
  CONDITION_DEFINITIONS,
  CONDITION_SCHEMA_VERSION,
  ConditionStore,
  getConditionDefinition,
  sanitizeConditionValues,
  validateConditionValue,
} = require("../src/conditions/index.js");
const { RIG_TRACKS } = require("./content/hulls.cjs");

const CONDITIONS = new Map(CONDITION_DEFINITIONS.map((definition) => [definition.name, definition]));
const PILOT_PREFIX = "pilot.";
const LEGACY_UPGRADE_KEYS = Object.freeze(["thrust", "hull", "coupling", "drag", "sensor", "vault"]);

function finite(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function integer(value, fallback = 0) {
  return Math.max(0, Math.round(finite(value, fallback)));
}

function declared(name) {
  return CONDITIONS.get(name) || null;
}

function setIfDeclared(values, name, value) {
  const definition = declared(name);
  if (!definition || definition.kind !== "stored") return;
  try {
    validateConditionValue(definition, value);
    values[name] = value;
  } catch {}
}

function snapshotValues(snapshot) {
  const candidate = snapshot?.conditionValues?.values || snapshot?.conditionValues || {};
  const sanitized = sanitizeConditionValues(candidate, { scopes: ["pilot"] });
  return {
    values: { ...sanitized.values },
    issues: sanitized.issues.map(({ name }) => name),
  };
}

function conditionNameForRig(hullType, trackKey) {
  return `pilot.rig.${hullType}.${trackKey}Level`;
}

function rigNamesForHull(hullType) {
  return Object.keys(RIG_TRACKS[hullType] || {}).map((trackKey) => conditionNameForRig(hullType, trackKey));
}

function legacyConditions(snapshot, values) {
  const hullType = String(snapshot.hullType || snapshot.shipType || "drifter").toLowerCase();
  if (!("pilot.currency.exoticMatter" in values)) {
    setIfDeclared(values, "pilot.currency.exoticMatter", integer(snapshot.exoticMatter));
  }
  if (!("pilot.hull.selectedId" in values)) {
    setIfDeclared(values, "pilot.hull.selectedId", hullType);
  }
  const rigLevels = Array.isArray(snapshot.rigLevels) ? snapshot.rigLevels : [];
  rigNamesForHull(hullType).forEach((name, index) => {
    if (!(name in values)) setIfDeclared(values, name, integer(rigLevels[index]));
  });
  const scalarMap = {
    "pilot.chronicle.extractions": snapshot.totalExtractions,
    "pilot.chronicle.deaths": snapshot.totalDeaths,
    "pilot.chronicle.itemsSold": snapshot.totalItemsSold,
    "pilot.chronicle.totalExoticMatterEarned": snapshot.totalExoticMatterEarned,
    "pilot.chronicle.bestSurvivalSeconds": snapshot.bestSurvivalTime,
  };
  for (const [name, value] of Object.entries(scalarMap)) {
    if (!(name in values)) setIfDeclared(values, name, finite(value));
  }
  for (const key of LEGACY_UPGRADE_KEYS) {
    const name = `pilot.progression.legacy.${key}Rank`;
    if (!(name in values)) setIfDeclared(values, name, integer(snapshot.upgrades?.[key]));
  }
  // Public unlocks use the registry's declared defaults unless an already
  // migrated condition snapshot explicitly records a future earned state.
  for (const [name, definition] of CONDITIONS) {
    if (name.startsWith("pilot.unlock.") && definition.kind === "stored" && !(name in values) && definition.default !== undefined) {
      values[name] = definition.default;
    }
  }
}

function projectLegacyFields(profile, values) {
  const selected = values["pilot.hull.selectedId"];
  if (selected) {
    profile.hullType = selected;
    profile.shipType = selected;
  }
  const hullType = profile.hullType || profile.shipType || "drifter";
  const names = rigNamesForHull(hullType);
  if (names.length) {
    profile.rigLevels = names.map((name) => integer(values[name]));
  }
  const fieldMap = {
    exoticMatter: "pilot.currency.exoticMatter",
    totalExtractions: "pilot.chronicle.extractions",
    totalDeaths: "pilot.chronicle.deaths",
    totalItemsSold: "pilot.chronicle.itemsSold",
    totalExoticMatterEarned: "pilot.chronicle.totalExoticMatterEarned",
    bestSurvivalTime: "pilot.chronicle.bestSurvivalSeconds",
  };
  for (const [field, name] of Object.entries(fieldMap)) {
    if (name in values) profile[field] = values[name];
  }
  profile.upgrades = { ...(profile.upgrades || {}) };
  for (const key of LEGACY_UPGRADE_KEYS) {
    const name = `pilot.progression.legacy.${key}Rank`;
    if (name in values) profile.upgrades[key] = values[name];
  }
  return profile;
}

function migrateProfileConditions(snapshot = {}) {
  const { values, issues } = snapshotValues(snapshot);
  legacyConditions(snapshot, values);
  const profile = { ...snapshot };
  profile.conditionValues = {
    schemaVersion: CONDITION_SCHEMA_VERSION,
    values,
  };
  // Invalid/retired keys are intentionally observable without serializing the
  // bad values back into durable truth.
  if (issues.length) profile.conditionMigrationIssues = issues;
  else delete profile.conditionMigrationIssues;
  projectLegacyFields(profile, values);
  return profile;
}

function mutateProfileCondition(profile, name, action, value) {
  const next = migrateProfileConditions(profile);
  const definition = getConditionDefinition(name);
  if (definition.kind !== "stored" || !name.startsWith(PILOT_PREFIX)) {
    throw new Error(`Unknown or non-pilot stored condition: ${name}`);
  }
  const store = new ConditionStore({ initialValues: next.conditionValues });
  store.mutate(action, name, value);
  next.conditionValues = store.serialize({ scopes: ["pilot"] });
  projectLegacyFields(next, next.conditionValues.values);
  return next;
}

module.exports = {
  LEGACY_UPGRADE_KEYS,
  migrateProfileConditions,
  mutateProfileCondition,
  projectLegacyFields,
};
