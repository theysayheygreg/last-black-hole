const BODY_MASKS = Object.freeze({
  NONE: 0,
  PLAYER: 1 << 0,
  AI: 1 << 1,
  WRECK: 1 << 2,
  PORTAL: 1 << 3,
  WELL: 1 << 4,
  STAR: 1 << 5,
  PLANETOID: 1 << 6,
  HAZARD: 1 << 7,
  PICKUP: 1 << 8,
  FORCE: 1 << 9,
  SIGNAL: 1 << 10,
  DEBUG: 1 << 11,
});

const ALL_BODY_MASKS = Object.values(BODY_MASKS)
  .filter((value) => Number.isInteger(value) && value > 0)
  .reduce((mask, value) => mask | value, 0);

function normalizeMaskName(name) {
  return String(name || "").trim().toUpperCase().replace(/[-\s]+/g, "_");
}

function resolveMask(value, fallback = BODY_MASKS.NONE) {
  if (value === undefined || value === null) return fallback;
  if (Array.isArray(value)) {
    return value.reduce((mask, entry) => mask | resolveMask(entry, BODY_MASKS.NONE), BODY_MASKS.NONE);
  }
  if (typeof value === "number" && Number.isFinite(value)) return value | 0;
  if (typeof value === "string") {
    return value
      .split(/[|,\s]+/)
      .filter(Boolean)
      .reduce((mask, token) => mask | (BODY_MASKS[normalizeMaskName(token)] ?? BODY_MASKS.NONE), BODY_MASKS.NONE);
  }
  return fallback;
}

function hasAnyMask(value, filter) {
  const valueMask = resolveMask(value, BODY_MASKS.NONE);
  const filterMask = resolveMask(filter, ALL_BODY_MASKS);
  if (filterMask === BODY_MASKS.NONE) return true;
  return (valueMask & filterMask) !== 0;
}

function maskNames(mask) {
  const value = resolveMask(mask, BODY_MASKS.NONE);
  return Object.entries(BODY_MASKS)
    .filter(([name, bit]) => name !== "NONE" && bit > 0 && (value & bit) !== 0)
    .map(([name]) => name.toLowerCase());
}

module.exports = {
  BODY_MASKS: Object.freeze({ ...BODY_MASKS, ALL: ALL_BODY_MASKS }),
  ALL_BODY_MASKS,
  resolveMask,
  hasAnyMask,
  maskNames,
};
