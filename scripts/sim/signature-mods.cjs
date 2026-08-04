"use strict";

// Run signatures are authored as multipliers. Resolve them once at session
// start so malformed content cannot leak a different value into each seam.
const SIGNATURE_MOD_RANGES = Object.freeze({
  currentCouplingMult: Object.freeze([0.3, 2.5]),
  dragMult: Object.freeze([0.5, 1.5]),
  wellGravityMult: Object.freeze([0.25, 2.5]),
  wellGrowthMult: Object.freeze([0.25, 3]),
  portalLifespanMult: Object.freeze([0.25, 2]),
  sensorRangeMult: Object.freeze([0.5, 2.5]),
  noiseRadiusMultiplier: Object.freeze([0.2, 3]),
  noiseDecayMultiplier: Object.freeze([0.3, 3]),
});

function clamp(value, [min, max]) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? Math.max(min, Math.min(max, numeric)) : 1;
}

function resolveSignatureMods(signatureOrMods = null) {
  const source = signatureOrMods?.mods || signatureOrMods || {};
  return Object.freeze(Object.fromEntries(Object.entries(SIGNATURE_MOD_RANGES).map(([key, range]) => [
    key,
    clamp(source[key], range),
  ])));
}

function applySignatureModsToBrain(brain, signatureMods) {
  const mods = resolveSignatureMods(signatureMods);
  brain.currentCoupling *= mods.currentCouplingMult;
  brain.dragScale *= mods.dragMult;
  brain.noiseRadiusMultiplier *= mods.noiseRadiusMultiplier;
  brain.noiseDecayMultiplier *= mods.noiseDecayMultiplier;
  brain.sensorRange *= mods.sensorRangeMult;
  return brain;
}

module.exports = {
  SIGNATURE_MOD_RANGES,
  resolveSignatureMods,
  applySignatureModsToBrain,
};
