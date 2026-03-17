/**
 * coords.js — THE coordinate authority. All space conversions happen here.
 *
 * Four coordinate spaces exist in the game:
 *
 * ┌─────────────┬───────────┬──────────┬───────────────┬──────────────────────────┐
 * │ Space       │ Origin    │ Y dir    │ Range         │ Used by                  │
 * ├─────────────┼───────────┼──────────┼───────────────┼──────────────────────────┤
 * │ SCREEN      │ top-left  │ Y-down   │ pixels (W×H)  │ canvas, mouse, overlay   │
 * │ WORLD       │ top-left  │ Y-down   │ 0–3 (toroidal)│ entities, ship, physics  │
 * │ WELL (old)  │ top-left  │ Y-down   │ 0–1           │ legacy compat only       │
 * │ FLUID UV    │ bot-left  │ Y-up     │ 0–1           │ GPU shaders, textures    │
 * └─────────────┴───────────┴──────────┴───────────────┴──────────────────────────┘
 *
 * RULE: If you need to convert between these spaces, use these functions.
 * If you find yourself writing `1.0 - y` inline, you are doing it wrong.
 *
 * KEY RELATIONSHIPS:
 *   World → Fluid UV:  x÷3, flip y÷3        (worldToFluidUV)
 *   World → Screen:    offset from camera, ×pxPerWorld   (worldToScreen)
 *   Fluid vel → World vel:  negate Y, ×WORLD_SCALE      (done in ship.js)
 */

// ---- Scale constants ----

/** Total world size. The old 0-1 space scaled up 3×. All entity positions live in 0–3. */
export const WORLD_SCALE = 3.0;

/**
 * How many world-units the camera shows per screen axis.
 * The fluid display shader divides UV by WORLD_SCALE, showing 1/3 of the full
 * texture on each axis. Since the texture maps to the full 3×3 world, one axis
 * shows exactly 1 world-unit. This constant keeps the overlay in sync.
 *
 * Changing this zooms the camera. 0.5 = zoomed in (half a world-unit fills screen).
 * 2.0 = zoomed out (two world-units visible). Must also update the display shader's
 * u_worldScale uniform to match.
 */
export const CAMERA_VIEW = 1.0;

/**
 * Convert a screen dimension (width or height) to pixels-per-world-unit.
 * Use this everywhere you need world→pixel scale. One source of truth.
 *
 * With CAMERA_VIEW=1.0: a 1200px-wide screen shows 1 world-unit, so 1200 px/world-unit.
 * For X: pxPerWorld(canvasW). For Y: pxPerWorld(canvasH).
 * These differ on non-square screens, which matches the fluid shader's stretch.
 */
export function pxPerWorld(screenDim) {
  return screenDim / CAMERA_VIEW;
}

// ---- World <-> Fluid UV ----

/**
 * Convert world-space (Y-down, 0–WORLD_SCALE) to fluid UV (Y-up, 0–1).
 * Divides by WORLD_SCALE to normalize, flips Y because UV is Y-up.
 * Used for: placing splats, reading fluid velocity at entity positions.
 */
export function worldToFluidUV(wx, wy) {
  return [wx / WORLD_SCALE, 1.0 - wy / WORLD_SCALE];
}

/**
 * Convert fluid UV (Y-up, 0–1) to world-space (Y-down, 0–WORLD_SCALE).
 * Inverse of worldToFluidUV.
 */
export function fluidUVToWorld(fu, fv) {
  return [fu * WORLD_SCALE, (1.0 - fv) * WORLD_SCALE];
}

// ---- World <-> Screen ----

/**
 * Convert world-space to screen pixels, accounting for camera.
 * Camera (camX, camY) is the world-space center of the screen.
 *
 * Toroidal wrapping: if an entity is >1.5 world-units away on any axis,
 * it wraps to the closer side. This means entities near the world edge
 * appear correctly when the camera is near the opposite edge.
 *
 * Scale: 1 world-unit fills canvasW pixels horizontally and canvasH vertically.
 * This matches the fluid display shader's zoom level exactly.
 */
export function worldToScreen(wx, wy, camX, camY, canvasW, canvasH) {
  // Displacement from camera to entity, with toroidal shortest-path
  let dx = wx - camX;
  let dy = wy - camY;
  const half = WORLD_SCALE / 2;  // 1.5 — half the world; anything farther wraps
  if (dx > half) dx -= WORLD_SCALE;
  if (dx < -half) dx += WORLD_SCALE;
  if (dy > half) dy -= WORLD_SCALE;
  if (dy < -half) dy += WORLD_SCALE;
  // World offset → pixel offset from screen center
  const sx = canvasW / 2 + dx * pxPerWorld(canvasW);
  const sy = canvasH / 2 + dy * pxPerWorld(canvasH);
  return [sx, sy];
}

/**
 * Convert screen pixels to world-space, accounting for camera.
 * Inverse of worldToScreen. Used for mouse aim (screen click → world target).
 * Result is wrapped to [0, WORLD_SCALE] on both axes.
 */
export function screenToWorld(sx, sy, camX, camY, canvasW, canvasH) {
  let wx = camX + (sx - canvasW / 2) / pxPerWorld(canvasW);
  let wy = camY + (sy - canvasH / 2) / pxPerWorld(canvasH);
  // Wrap to valid world range
  wx = ((wx % WORLD_SCALE) + WORLD_SCALE) % WORLD_SCALE;
  wy = ((wy % WORLD_SCALE) + WORLD_SCALE) % WORLD_SCALE;
  return [wx, wy];
}

// ---- World distance (toroidal) ----

/**
 * Shortest distance between two points on the toroidal world.
 * Wraps each axis independently: if the straight-line distance exceeds
 * half the world, the wrapped path is shorter.
 */
export function worldDistance(ax, ay, bx, by) {
  let dx = Math.abs(ax - bx);
  let dy = Math.abs(ay - by);
  if (dx > WORLD_SCALE / 2) dx = WORLD_SCALE - dx;
  if (dy > WORLD_SCALE / 2) dy = WORLD_SCALE - dy;
  return Math.sqrt(dx * dx + dy * dy);
}

/**
 * Shortest displacement vector from (ax,ay) to (bx,by) on the torus.
 * Returns [dx, dy] — add this to (ax,ay) to move toward (bx,by).
 * Used for gravity direction, camera follow, mouse aim.
 */
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
 * All-in-one: distance, displacement, and unit direction from A to B on torus.
 * Returns { dist, dx, dy, nx, ny }. If points are coincident, direction is zero.
 *
 * Use this instead of manually calling worldDisplacement + sqrt + normalize.
 * Every force calculation needs this pattern — centralized here.
 */
export function worldDirectionTo(ax, ay, bx, by) {
  const [dx, dy] = worldDisplacement(ax, ay, bx, by);
  const dist = Math.sqrt(dx * dx + dy * dy);
  if (dist < 0.001) return { dist, dx, dy, nx: 0, ny: 0 };
  return { dist, dx, dy, nx: dx / dist, ny: dy / dist };
}

// ---- Legacy well-space functions (0–1 range) ----
// The original 1×1 map used 0–1 normalized coordinates called "well-space."
// These are kept for backward compat but nothing should add new callers.

export function wellToFluidUV(wx, wy) { return [wx, 1.0 - wy]; }
export function fluidUVToWell(fu, fv) { return [fu, 1.0 - fv]; }
export function screenToFluidUV(sx, sy, canvasW, canvasH) {
  return [sx / canvasW, 1.0 - (sy / canvasH)];
}
export function fluidUVToScreen(fu, fv, canvasW, canvasH) {
  return [fu * canvasW, (1.0 - fv) * canvasH];
}
export function wellToScreen(wx, wy, canvasW, canvasH) {
  return [wx * canvasW, wy * canvasH];
}
export function screenToWell(sx, sy, canvasW, canvasH) {
  return [sx / canvasW, sy / canvasH];
}

// ---- Velocity conversions ----

/** Fluid velocity is Y-up; screen/world velocity is Y-down. Negate Y component. */
export function fluidVelToScreen(fvx, fvy) { return [fvx, -fvy]; }
export function screenVelToFluid(svx, svy) { return [svx, -svy]; }
