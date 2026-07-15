/**
 * Exact conversions for tunables whose implementation form is not player-readable.
 * Keep the conversion at the shared boundary so browser and authority use one math path.
 */

const REFERENCE_HZ = 60;

export function dragPerReferenceFrameFromHalfLife(halfLifeSeconds) {
  const halfLife = Number(halfLifeSeconds);
  if (!Number.isFinite(halfLife) || halfLife <= 0) return 0;
  return 1 - Math.pow(0.5, 1 / (REFERENCE_HZ * halfLife));
}

export function dragFactorFromHalfLife(halfLifeSeconds, dt, dragScale = 1) {
  const halfLife = Number(halfLifeSeconds);
  const seconds = Number(dt);
  const scale = Math.max(0, Number(dragScale) || 0);
  if (!Number.isFinite(halfLife) || halfLife <= 0 || !Number.isFinite(seconds)) return 1;
  const perFrame = Math.min(0.95, dragPerReferenceFrameFromHalfLife(halfLife) * scale);
  return Math.pow(1 - perFrame, seconds * REFERENCE_HZ);
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

export const TUNING_REFERENCE_HZ = REFERENCE_HZ;
