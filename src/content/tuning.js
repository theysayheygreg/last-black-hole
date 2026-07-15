const REFERENCE_HZ = 60;

function contract(values) {
  return Object.freeze({ ...values });
}

const coastHalfLifeSeconds = contract({
  min: 0.25,
  max: 4,
  step: 0.05,
  unit: 's half-life',
  startBias: 'authority baseline',
  tip: 'Seconds for coasting speed to halve. Longer = more glide.',
});
const authorityWreckReferenceDriftSpeed = contract({
  min: 0,
  max: 0.02,
  step: 0.001,
  unit: 'world-units/s at 1 wu from a mass-1 well',
  startBias: 'quiet drift',
});
const authorityWreckDragRate = contract({
  min: 0.5,
  max: 3,
  step: 0.25,
  unit: '1/s',
  startBias: 'standard damping',
});
const localWreckReferenceDriftSpeed = contract({
  min: 0,
  max: 0.2,
  step: 0.005,
  unit: 'world-units/s',
  startBias: 'quiet drift',
  tip: 'Steady drift speed at 1 wu from a mass-1 well.',
});
const localWreckDragRate = contract({
  min: 0.5,
  max: 5,
  step: 0.25,
  unit: '1/s',
  startBias: 'standard damping',
  tip: 'Drift velocity decay rate. Higher = more sluggish.',
});
const profileDragUpgrade = contract({
  min: 0,
  max: 3,
  step: 1,
  reductionPerRank: 0.12,
  minimumScale: 0.1,
});

export const TUNING_CONTRACTS = Object.freeze({
  movement: Object.freeze({ coastHalfLifeSeconds }),
  wreckDrift: Object.freeze({
    referenceDriftSpeed: authorityWreckReferenceDriftSpeed,
    dragRate: authorityWreckDragRate,
  }),
  localWreckDrift: Object.freeze({
    referenceDriftSpeed: localWreckReferenceDriftSpeed,
    dragRate: localWreckDragRate,
  }),
  signal: Object.freeze({
    thrustBasePercentPerSecond: contract({ min: 0, max: 5, step: 0.5, unit: '% signal full-scale/s', startBias: 'quiet until opposition matters' }),
    coastPercentPerSecond: contract({ min: 0, max: 2, step: 0.1, unit: '% signal full-scale/s', startBias: 'barely audible' }),
    wellProximityPercentPerSecond: contract({ min: 0, max: 2, step: 0.1, unit: '% signal full-scale/s', startBias: 'environmental tax' }),
    decayBasePercentPerSecond: contract({ min: 0, max: 10, step: 0.5, unit: '% signal full-scale/s', startBias: 'quiet baseline' }),
    decayWreckWakePercentPerSecond: contract({ min: 0, max: 10, step: 0.5, unit: '% signal full-scale/s', startBias: 'wake relief' }),
    decayAccretionShadowPercentPerSecond: contract({ min: 0, max: 10, step: 0.5, unit: '% signal full-scale/s', startBias: 'shadow relief' }),
  }),
  profileDragUpgrade,
});

export const CLIENT_TUNABLE_CONTRACTS = Object.freeze({
  'ship.coastHalfLifeSeconds': coastHalfLifeSeconds,
  'wrecks.referenceDriftSpeed': localWreckReferenceDriftSpeed,
  'wrecks.dragRate': localWreckDragRate,
});

export function dragPerReferenceFrameFromHalfLife(halfLifeSeconds) {
  const halfLife = Number(halfLifeSeconds);
  if (!Number.isFinite(halfLife) || halfLife <= 0) return 0;
  return 1 - Math.pow(0.5, 1 / (REFERENCE_HZ * halfLife));
}

export function effectiveDragPerReferenceFrame(halfLifeSeconds, dragScale = 1) {
  const scale = Math.max(0, Number(dragScale) || 0);
  return Math.min(0.95, dragPerReferenceFrameFromHalfLife(halfLifeSeconds) * scale);
}

export function dragFactorFromHalfLife(halfLifeSeconds, dt, dragScale = 1) {
  const seconds = Number(dt);
  if (!Number.isFinite(seconds)) return 1;
  return Math.pow(1 - effectiveDragPerReferenceFrame(halfLifeSeconds, dragScale), seconds * REFERENCE_HZ);
}

export function halfLifeSecondsFromDragPerReferenceFrame(dragPerFrame) {
  const perFrame = Number(dragPerFrame);
  if (!Number.isFinite(perFrame) || perFrame <= 0) return Infinity;
  if (perFrame >= 1) return 0;
  return Math.log(0.5) / (REFERENCE_HZ * Math.log(1 - perFrame));
}

export function gravityStrengthFromReferenceDriftSpeed(referenceDriftSpeed, dragRate) {
  return Number(referenceDriftSpeed) * Number(dragRate);
}

export function signalFractionPerSecond(percent) {
  return Number(percent) / 100;
}

export function normalizeProfileDragUpgradeRank(rank) {
  const numeric = Number(rank);
  if (!Number.isFinite(numeric)) return profileDragUpgrade.min;
  return Math.max(profileDragUpgrade.min, Math.min(profileDragUpgrade.max, Math.round(numeric)));
}

export function profileDragScaleFromUpgradeRank(rank) {
  const normalized = normalizeProfileDragUpgradeRank(rank);
  return Math.max(profileDragUpgrade.minimumScale, 1 - normalized * profileDragUpgrade.reductionPerRank);
}

export function normalizeTuningOverrideAliases(overrides, label = 'config override') {
  if (!overrides || typeof overrides !== 'object' || Array.isArray(overrides)) return overrides;
  const normalized = { ...overrides };
  if (!overrides.ship || typeof overrides.ship !== 'object' || Array.isArray(overrides.ship)) return normalized;

  const ship = { ...overrides.ship };
  if (Object.prototype.hasOwnProperty.call(ship, 'drag')) {
    if (Object.prototype.hasOwnProperty.call(ship, 'coastHalfLifeSeconds')) {
      throw new Error(`${label} defines both legacy ship.drag and ship.coastHalfLifeSeconds`);
    }
    const legacyDrag = Number(ship.drag);
    if (!Number.isFinite(legacyDrag) || legacyDrag <= 0 || legacyDrag >= 1) {
      throw new Error(`${label} has invalid legacy ship.drag: ${ship.drag}`);
    }
    ship.coastHalfLifeSeconds = halfLifeSecondsFromDragPerReferenceFrame(legacyDrag);
    delete ship.drag;
  }
  normalized.ship = ship;
  return normalized;
}

export const TUNING_REFERENCE_HZ = REFERENCE_HZ;
