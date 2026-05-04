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

/** Total world size. The old 0-1 space scaled up 3×. All entity positions live in 0–WORLD_SCALE. */
export let WORLD_SCALE = 3.0;

/**
 * GRID_WINDOW — world-units spanned by the fluid GPU grid texture.
 *
 * The fluid grid is a camera-anchored window whose size stays fixed even
 * when WORLD_SCALE grows. Large maps pay for visible fabric, not total
 * world area; off-window flow returns through the coarse field.
 */
export let GRID_WINDOW = 3.0;

/** Update the world scale. GRID_WINDOW is intentionally NOT updated — fluid grid stays fixed. */
export function setWorldScale(s) {
  WORLD_SCALE = s;
  _accretionScaleCache = Math.sqrt(s * FLUID_REF_SCALE);
}

/**
 * How many world-units the camera shows per screen axis.
 * The fluid display shader divides UV by WORLD_SCALE, showing 1/3 of the full
 * texture on each axis. Since the texture maps to the full 3×3 world, one axis
 * shows exactly 1 world-unit. This constant keeps the overlay in sync.
 *
 * Changing this zooms the camera. 0.5 = zoomed in (half a world-unit fills screen).
 * 2.0 = zoomed out (two world-units visible). Must also update the display shader's
 * u_gridWindow uniform to match.
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

// ---- Fluid camera state ----
//
// The fluid grid is camera-anchored: UV (0,0)..(1,1) represents a window
// of GRID_WINDOW world-units centered on the camera, NOT the whole world.
// All fluid-injection callers go through worldToFluidUV(), which translates
// world coords to camera-relative UVs using this state. Set once per
// gameLoop frame from main.js (and any standalone harness that drives a
// fluid sim, e.g. the title prototype).
//
// The grid contents are world-stable: a per-frame translate pass in
// fluid.js shifts texture data by the camera delta so currents don't slide
// with the camera. Off-window contributions come from the coarse field.
let _fluidCameraX = 0.0;
let _fluidCameraY = 0.0;

export function setFluidCamera(camX, camY) {
  _fluidCameraX = camX;
  _fluidCameraY = camY;
}

export function getFluidCamera() {
  return [_fluidCameraX, _fluidCameraY];
}

// ---- World <-> Fluid UV ----

/**
 * Convert world-space (Y-down) to fluid UV (Y-up, 0–1) **camera-relative**.
 * UV (0.5, 0.5) is the camera; UV span = GRID_WINDOW world-units.
 * Toroidal world wrap is applied via shortest-displacement so wells near a
 * world edge stay close to camera when the camera is on the opposite edge.
 *
 * Values outside [0, 1] are valid: they mean the world point is outside
 * the current fluid window and should be culled or handled by coarse flow.
 */
export function worldToFluidUV(wx, wy) {
  let dx = wx - _fluidCameraX;
  let dy = wy - _fluidCameraY;
  const half = WORLD_SCALE / 2;
  if (dx > half) dx -= WORLD_SCALE;
  if (dx < -half) dx += WORLD_SCALE;
  if (dy > half) dy -= WORLD_SCALE;
  if (dy < -half) dy += WORLD_SCALE;
  // X+ in world → U+; Y+ in world (down) → V- (UV is Y-up).
  return [dx / GRID_WINDOW + 0.5, 0.5 - dy / GRID_WINDOW];
}

/**
 * Convert fluid UV (Y-up, 0–1) back to world-space (Y-down). Inverse of
 * worldToFluidUV. Result is wrapped into [0, WORLD_SCALE).
 */
export function fluidUVToWorld(fu, fv) {
  let wx = _fluidCameraX + (fu - 0.5) * GRID_WINDOW;
  let wy = _fluidCameraY - (fv - 0.5) * GRID_WINDOW;
  wx = ((wx % WORLD_SCALE) + WORLD_SCALE) % WORLD_SCALE;
  wy = ((wy % WORLD_SCALE) + WORLD_SCALE) % WORLD_SCALE;
  return [wx, wy];
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

/**
 * Wrap a world coordinate to [0, WORLD_SCALE). Handles negatives.
 * Use instead of inline ((x % WORLD_SCALE) + WORLD_SCALE) % WORLD_SCALE.
 */
export function wrapWorld(v) {
  return ((v % WORLD_SCALE) + WORLD_SCALE) % WORLD_SCALE;
}

// ---- Fluid UV scaling ----

/**
 * Reference world scale that all fluid UV-space parameters are calibrated for.
 * All CONFIG values for splat radii, force strengths, accretion distances, etc.
 * were tuned at this scale. When WORLD_SCALE differs, UV-space parameters must
 * be adjusted so they produce the same world-space effect.
 */
export const FLUID_REF_SCALE = 3.0;

/**
 * UV-to-grid scaling factor. Multiply UV-space distances/offsets by this
 * to normalize them to the reference scale's behavior.
 *
 * Keyed to GRID_WINDOW, not WORLD_SCALE. With GRID_WINDOW fixed at the
 * reference scale, splats and forces stay tuned the same on every map.
 */
export function uvScale() {
  return FLUID_REF_SCALE / GRID_WINDOW;
}

/**
 * Get both UV scaling factors for fluid.splat() calls.
 * Returns { s, s2 } where:
 *   s  = uvScale()      — multiply force magnitudes and UV offsets by this
 *   s2 = uvScale() ** 2 — multiply splat radii (areas) by this
 *
 * This is the GPU SPLAT SCALING RULE in one call. Every system that injects
 * into the fluid sim should use this instead of computing s/s2 inline.
 *
 * Usage:
 *   const { s, s2 } = splatScale();
 *   fluid.splat(u, v, forceX * s, forceY * s, radius * s2, r, g, b);
 */
export function splatScale() {
  const s = FLUID_REF_SCALE / GRID_WINDOW;
  return { s, s2: s * s };
}

/**
 * Scale factor for accretion ring visuals. Sqrt scaling ensures rings grow
 * sub-linearly with map size — dramatic without overwhelming on large maps.
 * See docs/design/RING-SCALE.md for the full analysis.
 *
 * Cached — recomputed only when setWorldScale() is called (on map load).
 * 3x3 map: 3.0, 5x5: 3.87, 10x10: 5.48 (vs linear WORLD_SCALE: 3, 5, 10)
 */
let _accretionScaleCache = Math.sqrt(WORLD_SCALE * FLUID_REF_SCALE);
export function accretionScale() {
  return _accretionScaleCache;
}

// ---- Entity culling ----

/**
 * Should an entity be culled from fluid injection this frame?
 *
 * RULES:
 * - Wells and stars: NEVER CULL. Their physics (ship gravity, kill radius,
 *   push force) checks ALL instances regardless of camera. Visual must match.
 * - Everything else: cull if worldDistance > visible half-extent + margin.
 * - The margin accounts for entity visual radius and movement between frames.
 *
 * @param {number} entityWX - entity world X
 * @param {number} entityWY - entity world Y
 * @param {number} camX - camera world X
 * @param {number} camY - camera world Y
 * @param {number} margin - extra world-units beyond visible edge (default 0.3)
 * @returns {boolean} true if the entity should be skipped
 */
export function shouldCull(entityWX, entityWY, camX, camY, margin = 0.3) {
  if (camX == null) return false;
  const cullDist = CAMERA_VIEW / 2 + margin;
  return worldDistance(entityWX, entityWY, camX, camY) > cullDist;
}

// ---- Velocity conversions ----

/** Fluid velocity is Y-up; screen/world velocity is Y-down. Negate Y component. */
export function fluidVelToScreen(fvx, fvy) { return [fvx, -fvy]; }

// ---- Unit conversion helpers ----
// Use these instead of inline * WORLD_SCALE or / WORLD_SCALE.

/**
 * Convert fluid UV distance/value to world-units.
 * Fluid UV spans 0–1 across the full world (0–WORLD_SCALE).
 * So 1 UV unit = WORLD_SCALE world-units.
 */
export function uvToWorld(uvValue) {
  return uvValue * WORLD_SCALE;
}

/**
 * Convert world-units distance/value to fluid UV.
 * Inverse of uvToWorld.
 */
export function worldToUV(worldValue) {
  return worldValue / WORLD_SCALE;
}

/**
 * Convert fluid UV velocity to world-space velocity (Y-flipped).
 * Combines the Y-flip (UV is Y-up, world is Y-down) with the scale conversion.
 * Returns [worldVx, worldVy].
 */
export function fluidVelToWorld(fvx, fvy) {
  // Use FLUID_REF_SCALE (not WORLD_SCALE) so the ship feels the same
  // fluid coupling regardless of map size. Force injection is already
  // UV-scaled to produce the same UV velocity — we don't want to then
  // amplify it by a larger WORLD_SCALE on bigger maps.
  return [fvx * FLUID_REF_SCALE, -fvy * FLUID_REF_SCALE];
}

/**
 * Convert a world-units value to screen pixels.
 * For consistent overlay rendering of world-space radii, distances, etc.
 * Uses X-axis scale (canvasW). For Y-axis, pass canvasH instead.
 */
export function worldToPx(worldValue, screenDim) {
  return worldValue * pxPerWorld(screenDim);
}
