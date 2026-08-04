function finiteNonNegative(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(0, number) : fallback;
}

/**
 * The mass a normal well field was seeded with. Growth records accretion and
 * widens the field envelope; it is not an unannounced force multiplier.
 */
export function wellBaseMass(well) {
  return finiteNonNegative(
    well?.baseMass,
    finiteNonNegative(well?.startMass, finiteNonNegative(well?.mass, 1)),
  );
}

/**
 * Vessel overdrive is deliberately the only runtime multiplier that makes an
 * existing well field stronger. It does not change the growth reach curve.
 */
export function wellStrengthMass(well) {
  return wellBaseMass(well) * Math.max(1, finiteNonNegative(well?.overdriveMultiplier, 1));
}

/**
 * Growth expands one shared gravity/current envelope. The caller stores this
 * on the well so snapshots and presentation use the exact authority state.
 */
export function calculateWellReachMultiplier({ mass, baseMass, growthReachPerMass }) {
  const accumulatedMass = Math.max(0, finiteNonNegative(mass) - finiteNonNegative(baseMass));
  return 1 + accumulatedMass * finiteNonNegative(growthReachPerMass);
}

export function resolveWellReachMultiplier(well, growthReachPerMass) {
  const stored = Number(well?.reachMultiplier);
  if (Number.isFinite(stored) && stored >= 1) return stored;
  return calculateWellReachMultiplier({
    mass: well?.mass,
    baseMass: wellBaseMass(well),
    growthReachPerMass,
  });
}
