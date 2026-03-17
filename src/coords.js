/**
 * coords.js — THE coordinate authority. All flips happen here, nowhere else.
 *
 * Four coordinate spaces:
 *
 * SCREEN: (0,0) = top-left, (W,H) = bottom-right. Y-down. Pixels.
 *   Used by: canvas overlay, mouse input, 2D rendering.
 *
 * WORLD: (0,0) = top-left, (WORLD_SCALE, WORLD_SCALE) = bottom-right. Y-down.
 *   Used by: entity positions, ship position, gravity calculations.
 *   Toroidal (wraps at edges). 3x3 grid of the old 0-1 space.
 *
 * WELL (LEGACY): (0,0) = top-left, (1,1) = bottom-right. Y-down. Normalized 0-1.
 *   Kept for backward compatibility. Thin wrappers to world-space.
 *
 * FLUID UV: (0,0) = bottom-left, (1,1) = top-right. Y-up. Normalized 0-1.
 *   Used by: WebGL shaders, fluid sim textures, readPixels, display shader.
 *
 * RULE: If you need to convert between these spaces, use these functions.
 * If you find yourself writing `1.0 - y` inline, you are doing it wrong.
 */

// The world is 3x3 the old normalized space
export const WORLD_SCALE = 3.0;

// Camera zoom: how many world-units fit across one screen axis.
// The fluid display shader divides UV by WORLD_SCALE, showing 1/WORLD_SCALE
// of the texture per axis. Since the texture maps to the full world,
// one screen axis shows exactly 1 world-unit.
export const CAMERA_VIEW = 1.0;

/**
 * Pixels per world-unit for a given screen dimension.
 * Use this everywhere you need world→pixel scale. One source of truth.
 * For X axis: pxPerWorld(canvasW). For Y axis: pxPerWorld(canvasH).
 */
export function pxPerWorld(screenDim) {
  return screenDim / CAMERA_VIEW;
}

// ---- World <-> Fluid UV ----

/** Convert world-space (Y-down, 0-WORLD_SCALE) to fluid UV (Y-up, 0-1). */
export function worldToFluidUV(wx, wy) {
  return [wx / WORLD_SCALE, 1.0 - wy / WORLD_SCALE];
}

/** Convert fluid UV (Y-up, 0-1) to world-space (Y-down, 0-WORLD_SCALE). */
export function fluidUVToWorld(fu, fv) {
  return [fu * WORLD_SCALE, (1.0 - fv) * WORLD_SCALE];
}

// ---- World <-> Screen ----

/** Convert world-space to screen pixels, accounting for camera offset.
 *  Camera (camX, camY) is the world-space center of the screen.
 *  Handles toroidal wrapping — returns the closest screen position.
 *
 *  Scale matches the fluid display shader which shows 1/WORLD_SCALE of the
 *  texture per screen axis. Since the texture maps to the full world, the
 *  screen shows 1 world-unit in X (across canvasW) and 1 world-unit in Y
 *  (across canvasH). Different axis scales match the fluid's aspect stretch. */
export function worldToScreen(wx, wy, camX, camY, canvasW, canvasH) {
  let dx = wx - camX;
  let dy = wy - camY;
  const half = WORLD_SCALE / 2;
  if (dx > half) dx -= WORLD_SCALE;
  if (dx < -half) dx += WORLD_SCALE;
  if (dy > half) dy -= WORLD_SCALE;
  if (dy < -half) dy += WORLD_SCALE;
  const sx = canvasW / 2 + dx * pxPerWorld(canvasW);
  const sy = canvasH / 2 + dy * pxPerWorld(canvasH);
  return [sx, sy];
}

/** Convert screen pixels to world-space, accounting for camera offset. */
export function screenToWorld(sx, sy, camX, camY, canvasW, canvasH) {
  let wx = camX + (sx - canvasW / 2) / pxPerWorld(canvasW);
  let wy = camY + (sy - canvasH / 2) / pxPerWorld(canvasH);
  wx = ((wx % WORLD_SCALE) + WORLD_SCALE) % WORLD_SCALE;
  wy = ((wy % WORLD_SCALE) + WORLD_SCALE) % WORLD_SCALE;
  return [wx, wy];
}

// ---- World distance (toroidal) ----

/** Shortest distance between two world-space points on a torus. */
export function worldDistance(ax, ay, bx, by) {
  let dx = Math.abs(ax - bx);
  let dy = Math.abs(ay - by);
  if (dx > WORLD_SCALE / 2) dx = WORLD_SCALE - dx;
  if (dy > WORLD_SCALE / 2) dy = WORLD_SCALE - dy;
  return Math.sqrt(dx * dx + dy * dy);
}

/** Shortest displacement vector from (ax,ay) to (bx,by) on torus.
 *  Returns [dx, dy] where adding to (ax,ay) moves toward (bx,by). */
export function worldDisplacement(ax, ay, bx, by) {
  let dx = bx - ax;
  let dy = by - ay;
  const half = WORLD_SCALE / 2;
  if (dx > half) dx -= WORLD_SCALE;
  if (dx < -half) dx += WORLD_SCALE;
  if (dy > half) dy -= WORLD_SCALE;
  if (dy < -half) dy += WORLD_SCALE;
  return [dx, dy];
}

/**
 * Shortest distance, displacement, and unit direction from (ax,ay) to (bx,by) on torus.
 * Returns { dist, dx, dy, nx, ny } — distance, displacement, and unit direction.
 * If dist < epsilon, returns zero direction. Use this instead of manually computing
 * worldDisplacement + sqrt + normalize in every force calculation.
 */
export function worldDirectionTo(ax, ay, bx, by) {
  const [dx, dy] = worldDisplacement(ax, ay, bx, by);
  const dist = Math.sqrt(dx * dx + dy * dy);
  if (dist < 0.001) return { dist, dx, dy, nx: 0, ny: 0 };
  return { dist, dx, dy, nx: dx / dist, ny: dy / dist };
}

// ---- Legacy well-space functions (0-1 range) ----
// These now just delegate to world-space functions.
// Well-space positions should be migrated to world-space over time.

/** Convert well-space (Y-down 0-1) to fluid UV (Y-up 0-1). */
export function wellToFluidUV(wx, wy) {
  return [wx, 1.0 - wy];
}

/** Convert fluid UV (Y-up 0-1) to well-space (Y-down 0-1). */
export function fluidUVToWell(fu, fv) {
  return [fu, 1.0 - fv];
}

/** Convert screen pixels (Y-down) to fluid UV (Y-up 0-1). */
export function screenToFluidUV(sx, sy, canvasW, canvasH) {
  return [sx / canvasW, 1.0 - (sy / canvasH)];
}

/** Convert fluid UV (Y-up 0-1) to screen pixels (Y-down). */
export function fluidUVToScreen(fu, fv, canvasW, canvasH) {
  return [fu * canvasW, (1.0 - fv) * canvasH];
}

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
