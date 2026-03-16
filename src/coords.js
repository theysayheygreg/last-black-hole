/**
 * coords.js — THE coordinate authority. All flips happen here, nowhere else.
 *
 * Three coordinate spaces:
 *
 * SCREEN: (0,0) = top-left, (W,H) = bottom-right. Y-down. Pixels.
 *   Used by: canvas overlay, ship position, mouse input, wave ring rendering.
 *
 * WELL: (0,0) = top-left, (1,1) = bottom-right. Y-down. Normalized 0-1.
 *   Used by: well definitions, gravity calculations, getWellData, test API.
 *   Same convention as screen, just scaled to 0-1.
 *
 * FLUID UV: (0,0) = bottom-left, (1,1) = top-right. Y-up. Normalized 0-1.
 *   Used by: WebGL shaders, fluid sim textures, readPixels, display shader.
 *
 * RULE: If you need to convert between these spaces, use these functions.
 * If you find yourself writing `1.0 - y` inline, you are doing it wrong.
 */

// ---- Well <-> Fluid UV ----

/** Convert well-space (Y-down 0-1) to fluid UV (Y-up 0-1). */
export function wellToFluidUV(wx, wy) {
  return [wx, 1.0 - wy];
}

/** Convert fluid UV (Y-up 0-1) to well-space (Y-down 0-1). */
export function fluidUVToWell(fu, fv) {
  return [fu, 1.0 - fv];
}

// ---- Screen <-> Fluid UV ----

/** Convert screen pixels (Y-down) to fluid UV (Y-up 0-1). */
export function screenToFluidUV(sx, sy, canvasW, canvasH) {
  return [sx / canvasW, 1.0 - (sy / canvasH)];
}

/** Convert fluid UV (Y-up 0-1) to screen pixels (Y-down). */
export function fluidUVToScreen(fu, fv, canvasW, canvasH) {
  return [fu * canvasW, (1.0 - fv) * canvasH];
}

// ---- Well <-> Screen ----

/** Convert well-space (Y-down 0-1) to screen pixels (Y-down). Same convention, just scale. */
export function wellToScreen(wx, wy, canvasW, canvasH) {
  return [wx * canvasW, wy * canvasH];
}

/** Convert screen pixels (Y-down) to well-space (Y-down 0-1). Same convention, just normalize. */
export function screenToWell(sx, sy, canvasW, canvasH) {
  return [sx / canvasW, sy / canvasH];
}

// ---- Velocity conversions ----

/** Convert fluid velocity (Y-up) to screen velocity (Y-down). Negate Y. */
export function fluidVelToScreen(fvx, fvy) {
  return [fvx, -fvy];
}

/** Convert screen velocity (Y-down) to fluid velocity (Y-up). Negate Y. */
export function screenVelToFluid(svx, svy) {
  return [svx, -svy];
}
