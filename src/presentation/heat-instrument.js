export function resolveHeatInstrumentState({
  heatRatio = 0,
  overheatRemaining = 0,
  epsilon = 0.02,
} = {}) {
  const ratio = Math.max(0, Math.min(1, Number(heatRatio) || 0));
  const lockout = Math.max(0, Number(overheatRemaining) || 0);
  return Object.freeze({
    ratio,
    overheatRemaining: lockout,
    visible: ratio > Math.max(0, Number(epsilon) || 0) || lockout > 0,
    locked: lockout > 0,
  });
}
