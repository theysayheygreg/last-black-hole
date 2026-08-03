// FRAG_DISPLAY stores four uniform-array entries per visible well: position,
// mass, shape, and deformation profile. WebGL2 array elements consume one
// vec4 slot each even when the declared type is float or vec2.
//
// Fixed display uniforms conservatively cost 125 vec4 slots (including
// samplers), so 64 wells cost 125 + 64 * 4 = 381 of the WebGL2 minimum 1024
// fragment-uniform vectors. The old 256-well declaration cost at least 1149
// and could not link on minimum-spec GPUs.
export const FABRIC_WELL_UNIFORM_BUDGET = 64;
export const FRAG_DISPLAY_FIXED_UNIFORM_VECTORS = 125;
export const FRAG_DISPLAY_WELL_VECTORS_PER_ENTRY = 4;

export function estimatedFabricDisplayUniformVectors(wellBudget = FABRIC_WELL_UNIFORM_BUDGET) {
  return FRAG_DISPLAY_FIXED_UNIFORM_VECTORS
    + Math.max(0, Math.floor(Number(wellBudget) || 0)) * FRAG_DISPLAY_WELL_VECTORS_PER_ENTRY;
}

/**
 * Keep every visible well when under budget. On overflow, retain the nearest
 * wells deterministically, then restore source order so overlapping well
 * compositing does not flicker as the camera moves.
 */
export function selectFabricWellIndices(candidates = [], limit = FABRIC_WELL_UNIFORM_BUDGET) {
  const cap = Math.max(0, Math.floor(Number(limit) || 0));
  const normalized = candidates.map((candidate, sourceOrder) => ({
    index: Math.max(0, Math.floor(Number(candidate?.index) || 0)),
    distanceSq: Number.isFinite(Number(candidate?.distanceSq))
      ? Math.max(0, Number(candidate.distanceSq))
      : Number.POSITIVE_INFINITY,
    sourceOrder,
  }));
  if (normalized.length <= cap) return normalized.map(({ index }) => index);
  return normalized
    .sort((a, b) => a.distanceSq - b.distanceSq || a.index - b.index || a.sourceOrder - b.sourceOrder)
    .slice(0, cap)
    .sort((a, b) => a.index - b.index || a.sourceOrder - b.sourceOrder)
    .map(({ index }) => index);
}
