/**
 * Shared inverse-power gravity math for browser and authoritative consumers.
 * Body-class parameters live at each boundary; this module owns the formula.
 */
export function inversePowerMagnitude(dist, {
  strength,
  mass,
  falloff,
  maxRange,
  referenceDistance = 0.25,
  minimumDistance = 0.15,
  rangeMode = 'linear',
  zeroDistanceThreshold = 0.001,
}) {
  if (dist < zeroDistanceThreshold) return 0;
  if (rangeMode !== 'unbounded' && dist > maxRange) return 0;

  const safeDist = Math.max(dist, minimumDistance);
  const normalizedDistance = safeDist / referenceDistance;
  const baseAcceleration = strength * mass
    / Math.pow(normalizedDistance, falloff);
  if (rangeMode !== 'linear') return baseAcceleration;

  return baseAcceleration * (1 - dist / maxRange);
}

export function gravityVector(direction, params) {
  const magnitude = inversePowerMagnitude(direction.dist, params);
  return {
    x: direction.nx * magnitude,
    y: direction.ny * magnitude,
    magnitude,
  };
}
