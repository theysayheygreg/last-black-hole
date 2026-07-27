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
};
