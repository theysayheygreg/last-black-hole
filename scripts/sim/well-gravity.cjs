// Authority adapter for the shared cross-runtime gravity family. Each body
// keeps its accepted production tuning here; the formula lives in src/content.
const sharedGravity = require("../../src/content/well-gravity.js");
const { gravityStrengthFromReferenceDriftSpeed } = require("../../src/content/tuning.js");
const { FABRIC } = require("../content/fabric.cjs");

const WELL_GRAVITY_PARAMS = Object.freeze({
  player: Object.freeze({
    strength: FABRIC.wellGravity.strength,
    referenceDistance: FABRIC.wellGravity.referenceDistance,
    minimumDistance: FABRIC.wellGravity.minimumDistance,
    fullGravityRadius: FABRIC.wellGravity.fullGravityRadius,
    falloffEndRadius: FABRIC.wellGravity.falloffEndRadius,
    minimumGravityFraction: FABRIC.wellGravity.minimumGravityFraction,
    falloffCurve: FABRIC.wellGravity.falloffCurve,
    featherRadius: FABRIC.wellGravity.featherRadius,
    growthReachPerMass: FABRIC.wellGravity.growthReachPerMass,
    falloff: FABRIC.wellGravity.falloff,
    rangeMode: "localized",
    maxRange: FABRIC.wellGravity.falloffEndRadius + FABRIC.wellGravity.featherRadius,
    zeroDistanceThreshold: 0.001,
  }),
  scavenger: Object.freeze({
    strength: 0.02,
    referenceDistance: 1,
    minimumDistance: 0.02,
    falloff: 1.8,
    rangeMode: "unbounded",
    maxRange: Infinity,
    zeroDistanceThreshold: 0.0001,
  }),
  wreck: Object.freeze({
    referenceDriftSpeed: 0.003,
    dragRate: 1.5,
    referenceDistance: 1,
    minimumDistance: 0.02,
    falloff: 1.5,
    rangeMode: "cutoff",
    maxRange: 0.8,
    zeroDistanceThreshold: 0.001,
  }),
});

function resolveParams(bodyClass, overrides = {}) {
  const profile = WELL_GRAVITY_PARAMS[bodyClass];
  if (!profile) throw new Error(`Unknown authoritative well-gravity body class: ${bodyClass}`);
  const params = { ...profile, ...overrides };
  if (params.referenceDriftSpeed !== undefined) {
    params.strength = gravityStrengthFromReferenceDriftSpeed(params.referenceDriftSpeed, params.dragRate);
  }
  return params;
}

function wellGravityMagnitude(bodyClass, dist, mass, overrides = {}) {
  const params = resolveParams(bodyClass, overrides);
  return sharedGravity.inversePowerMagnitude(dist, { ...params, mass });
}

function wellGravityVector(bodyClass, direction, mass, overrides = {}) {
  const params = resolveParams(bodyClass, overrides);
  return sharedGravity.gravityVector(direction, { ...params, mass });
}

module.exports = {
  ...sharedGravity,
  WELL_GRAVITY_PARAMS,
  wellGravityMagnitude,
  wellGravityVector,
};
