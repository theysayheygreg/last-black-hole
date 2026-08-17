const { simUnitsToMeters } = require("../content/units.cjs");
const data = require("../../src/content/noise.data.json");

// Noise is deliberately a small gameplay envelope, not an audio simulation.
// Values are meters because that is the unit the player can reason about.
const NOISE_CONFIG = Object.freeze({
  ...data,
  continuous: Object.freeze({ ...data.continuous }),
  impulses: Object.freeze({ ...data.impulses, salvage: Object.freeze({ ...data.impulses.salvage }) }),
  tuning: Object.freeze(Object.fromEntries(Object.entries(data.tuning).map(([key, value]) => [key, Object.freeze({ ...value })]))),
  publicSourceClasses: Object.freeze([...data.publicSourceClasses]),
});

function clampMeters(value) {
  return Math.max(0, Number.isFinite(Number(value)) ? Number(value) : 0);
}

function resolvePlayerNoiseModifiers({ idleFloorMeters = NOISE_CONFIG.idleFloorMeters, radiusMultiplier = 1, decayMultiplier = 1 } = {}) {
  const radius = Number(radiusMultiplier);
  const decay = Number(decayMultiplier);
  return {
    idleFloorMeters: clampMeters(idleFloorMeters),
    radiusMultiplier: Number.isFinite(radius) && radius >= 0 ? radius : 1,
    decayMultiplier: Number.isFinite(decay) && decay >= 0 ? decay : 1,
  };
}

function resolveThreatWarningBudget(kind, {
  radiusMeters = NOISE_CONFIG.world.inhibitor?.[kind]?.radiusMeters,
  closureSpeedMetersPerSecond = 0,
  lethalDistanceMeters = 0,
} = {}) {
  const budget = NOISE_CONFIG.world.warningBudgets?.[kind];
  if (!budget) return null;
  const cruiseMetersPerSecond = Math.max(0, Number(NOISE_CONFIG.world.warningBudgets.representativeCruiseMetersPerSecond) || 0);
  const firstHeardSeconds = Math.max(0, Number(budget.firstHeardSeconds) || 0);
  const closureSeconds = Math.max(0, Number(budget.closureSeconds) || 0);
  const referenceCornerMeters = Math.max(0, Number(NOISE_CONFIG.world.warningBudgets.referenceCornerMeters) || 0);
  const radius = clampMeters(radiusMeters);
  const closureSpeed = Math.max(0, Number(closureSpeedMetersPerSecond) || 0);
  const closureDistanceMeters = Math.max(0, radius - Math.max(0, Number(lethalDistanceMeters) || 0));
  return {
    kind,
    firstHeardSeconds,
    closureSeconds,
    cruiseMetersPerSecond,
    referenceCornerMeters,
    firstHeardRadiusMeters: referenceCornerMeters + cruiseMetersPerSecond * firstHeardSeconds,
    authoredRadiusMeters: radius,
    closureSpeedMetersPerSecond: closureSpeed,
    observedClosureSeconds: closureSpeed > 0 ? closureDistanceMeters / closureSpeed : null,
    closureBudgetMet: closureSpeed <= 0 || closureDistanceMeters >= closureSpeed * closureSeconds,
  };
}

function emitterAudibleFor({ radiusMeters, distanceSimUnits }) {
  const radius = clampMeters(radiusMeters);
  const distanceMeters = Math.max(0, simUnitsToMeters(distanceSimUnits));
  return { audible: radius > 0 && distanceMeters <= radius, distanceMeters, radiusMeters: radius };
}

function resolveImpulseRadius(radiusMeters, ageSeconds, decayMultiplier = 1) {
  const age = Math.max(0, Number(ageSeconds) || 0);
  const radius = clampMeters(radiusMeters);
  if (age <= NOISE_CONFIG.impulseHoldSeconds) return radius;
  return Math.max(0, radius - (age - NOISE_CONFIG.impulseHoldSeconds)
    * NOISE_CONFIG.impulseDecayMetersPerSecond * Math.max(0, Number(decayMultiplier) || 0));
}

function resolveContinuousRadius(currentRadiusMeters, targetRadiusMeters, dt, decayMultiplier = 1) {
  const current = clampMeters(currentRadiusMeters);
  const target = clampMeters(targetRadiusMeters);
  if (target > 0) return target;
  return Math.max(0, current - NOISE_CONFIG.continuousDecayMetersPerSecond
    * Math.max(0, Number(decayMultiplier) || 0) * Math.max(0, Number(dt) || 0));
}

function identifyPublicSource({ radiusMeters, distanceSimUnits, sourceClass }) {
  const className = String(sourceClass || '').toUpperCase();
  const distanceMeters = Math.max(0, simUnitsToMeters(distanceSimUnits));
  return distanceMeters <= clampMeters(radiusMeters) * NOISE_CONFIG.identificationFraction
    && NOISE_CONFIG.publicSourceClasses.includes(className)
    ? className
    : null;
}

function publicSourceClass(value) {
  const className = String(value || '').toUpperCase();
  return NOISE_CONFIG.publicSourceClasses.includes(className) ? className : null;
}

function selectLocalNoiseListenerHost(players = []) {
  const alive = Array.from(players || []).filter((player) => player?.status === "alive");
  return alive.find((player) => !player.isAI) || alive[0] || null;
}

function resolveNoiseSourceProjection({
  continuousRadiusMeters = 0,
  continuousSource = "IDLE",
  continuousSourceClass = null,
  impulseRadiusMeters = 0,
  impulseSource = "IDLE",
  impulseSourceClass = null,
} = {}) {
  const continuousRadius = clampMeters(continuousRadiusMeters);
  const impulseRadius = clampMeters(impulseRadiusMeters);
  if (continuousRadius >= impulseRadius && continuousRadius > 0) {
    return {
      source: String(continuousSource || "IDLE"),
      sourceClass: publicSourceClass(continuousSourceClass),
    };
  }
  if (impulseRadius > 0) {
    return {
      source: String(impulseSource || "IDLE"),
      sourceClass: publicSourceClass(impulseSourceClass),
    };
  }
  return { source: "IDLE", sourceClass: null };
}

function recordNoisePeak({
  previousMaxMeters = 0,
  previousSource = "IDLE",
  radiusMeters = 0,
  source = "IDLE",
} = {}) {
  const previousMax = clampMeters(previousMaxMeters);
  const radius = clampMeters(radiusMeters);
  if (radius > previousMax) {
    return { maxAudibleRadiusMeters: radius, loudestSource: String(source || "IDLE") };
  }
  return { maxAudibleRadiusMeters: previousMax, loudestSource: previousSource || "IDLE" };
}

function enemyListenerStateFor({ radiusMeters, distanceSimUnits, sensitivity = 1 }) {
  const radius = clampMeters(radiusMeters);
  const distanceMeters = Math.max(0, simUnitsToMeters(distanceSimUnits));
  const effectiveRadius = radius * Math.max(0, Number(sensitivity) || 0);
  if (effectiveRadius <= 0 || distanceMeters > effectiveRadius) {
    return { state: "QUIET", distanceMeters, effectiveRadiusMeters: effectiveRadius };
  }
  const state = distanceMeters <= effectiveRadius * NOISE_CONFIG.enemyTrackingRadiusRatio
    ? "TRACKING"
    : "HEARD";
  return { state, distanceMeters, effectiveRadiusMeters: effectiveRadius };
}

module.exports = {
  NOISE_CONFIG,
  clampMeters,
  emitterAudibleFor,
  identifyPublicSource,
  enemyListenerStateFor,
  resolveContinuousRadius,
  resolveImpulseRadius,
  resolveNoiseSourceProjection,
  recordNoisePeak,
  resolvePlayerNoiseModifiers,
  resolveThreatWarningBudget,
  selectLocalNoiseListenerHost,
};
