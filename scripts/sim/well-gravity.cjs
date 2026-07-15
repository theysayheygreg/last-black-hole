// Authority adapter for the shared cross-runtime gravity family. Each body
// keeps its accepted production tuning here; the formula lives in src/content.
const sharedGravity = require("../../src/content/well-gravity.js");

const WELL_GRAVITY_PARAMS = Object.freeze({
  player: Object.freeze({
    strength: 0.6,
    referenceDistance: 0.25,
    minimumDistance: 0.15,
    falloff: 1.5,
    rangeMode: "linear",
    maxRange: 1.2,
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
    strength: 0.0045,
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
  return { ...profile, ...overrides };
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
