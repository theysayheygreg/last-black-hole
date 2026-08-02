const EPSILON = 1e-9;

function powerMagnitude(strength, mass, falloff, distance, referenceDistance) {
  return Number(strength) * Number(mass)
    / Math.pow(distance / referenceDistance, Number(falloff) || 1);
}

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
  fullGravityRadius,
  falloffEndRadius,
  minimumGravityFraction = 0,
  falloffCurve = 'linear',
  featherRadius = 0,
}) {
  if (dist < zeroDistanceThreshold) return 0;

  if (rangeMode === 'localized') {
    const fullRadius = Math.max(0, Number(fullGravityRadius) || 0);
    const falloffEnd = Math.max(fullRadius, Number(falloffEndRadius) || 0);
    const feather = Math.max(0, Number(featherRadius) || 0);
    const envelopeEnd = falloffEnd + feather;
    if (dist > envelopeEnd) return 0;

    const fullReferenceDistance = Math.max(EPSILON, Number(referenceDistance) || 0.25);
    const fullDistance = Math.max(fullRadius, Number(minimumDistance) || 0, fullReferenceDistance);
    const fullMagnitude = powerMagnitude(strength, mass, falloff, fullDistance, fullReferenceDistance);
    if (dist <= fullRadius) return fullMagnitude;

    const eased = (value) => {
      const t = Math.max(0, Math.min(1, value));
      if (falloffCurve === 'smoothstep') return t * t * (3 - 2 * t);
      if (falloffCurve === 'easeOutCubic') {
        const remaining = 1 - t;
        return 1 - remaining * remaining * remaining;
      }
      return t;
    };
    const minimum = Math.max(0, Math.min(1, Number(minimumGravityFraction) || 0));
    if (dist <= falloffEnd) {
      const t = eased((dist - fullRadius) / Math.max(EPSILON, falloffEnd - fullRadius));
      return fullMagnitude * (1 - (1 - minimum) * t);
    }
    if (feather <= EPSILON) return 0;
    const featherT = eased((dist - falloffEnd) / feather);
    return fullMagnitude * minimum * (1 - featherT);
  }

  if (rangeMode !== 'unbounded' && dist > maxRange) return 0;

  const safeDist = Math.max(dist, minimumDistance);
  const normalizedDistance = safeDist / referenceDistance;
  const baseAcceleration = powerMagnitude(strength, mass, falloff, safeDist, referenceDistance);
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
