/**
 * coords.js — THE coordinate authority. All space conversions happen here.
 *
 * Four coordinate spaces exist in the game:
 *
 * ┌─────────────┬───────────┬──────────┬───────────────┬──────────────────────────┐
 * │ Space       │ Origin    │ Y dir    │ Range         │ Used by                  │
 * ├─────────────┼───────────┼──────────┼───────────────┼──────────────────────────┤
 * │ SCREEN      │ top-left  │ Y-down   │ pixels (W×H)  │ canvas, mouse, overlay   │
 * │ WORLD       │ top-left  │ Y-down   │ 0–WORLD_SCALE │ entities, ship, physics  │
 * │ WELL (old)  │ top-left  │ Y-down   │ 0–1           │ legacy compat only       │
 * │ FLUID UV    │ bot-left  │ Y-up     │ 0–1           │ GPU shaders, textures    │
 * └─────────────┴───────────┴──────────┴───────────────┴──────────────────────────┘
 *
 * RULE: If JS gameplay, renderer, or test code converts between these spaces,
 * use these functions. Inline `1.0 - y` flips in feature code are bugs.
 * GLSL shaders cannot import this module; route shader-side Y flips through
 * that file's GLSL coordinate helper when available. Any other shader flip
 * must be local, commented, and covered by coordinate/renderer fixtures.
 *
 * KEY RELATIONSHIPS:
 *   World → Fluid UV:  camera-relative, GRID_WINDOW span (worldToFluidUV)
 *   World → Screen:    camera-relative, CAMERA_VIEW span (worldToScreen)
 *   World radius → view: axis-specific scale (worldRadiusToScreen / worldRadiusToSceneScale)
 *   Fluid vel → World vel:  Y-flipped, reference-scaled (fluidVelToWorld)
 */

// ---- Scale constants ----

/** Total toroidal world size. All entity positions live in 0–WORLD_SCALE. */
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
 * World-units shown by the current camera projection on each screen axis.
 *
 * The renderer is intentionally locked to the same 3x3 world slice as the
 * camera-anchored fluid texture. Until the sim supports rectangular fluid
 * windows, widening X by aspect would show danger and fabric from different
 * world slices. Three.js still owns a real 3D scene; this is the adapter that
 * keeps its top-down projection aligned with the square simulation window.
 */
export const CAMERA_VIEW = 3.0;

/**
 * Convert the current render target to pixels-per-world-unit.
 * Use this everywhere you need world→pixel scale. One source of truth.
 *
 * For axis-specific projection, pass the axis dimension you are drawing in:
 * X uses canvas width / CAMERA_VIEW; Y uses canvas height / CAMERA_VIEW.
 * A second parameter is accepted for compatibility with older call sites and
 * intentionally ignored.
 */
export function pxPerWorld(screenDim, _screenH = null) {
  return screenDim / CAMERA_VIEW;
}

/**
 * Axis-specific pixel scale for one world unit. Use this for projecting
 * world-space radii/distances onto a non-square render target.
 */
export function worldPixelScale(canvasW, canvasH) {
  return {
    x: pxPerWorld(canvasW),
    y: pxPerWorld(canvasH),
  };
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

/** Convert a world-space radius/distance to the camera-relative fluid UV span. */
export function worldRadiusToFluidUV(worldRadius) {
  return worldRadius / GRID_WINDOW;
}

/** Convert a camera-relative fluid UV radius/distance back to world units. */
export function fluidUVRadiusToWorld(uvRadius) {
  return uvRadius * GRID_WINDOW;
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

/** Convert normalized world Y (top-left, down) to texture V (bottom-left, up). */
export function worldYToFluidTextureV(worldY) {
  return 1 - worldY;
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
 * Scale: the visible world slice is the square CAMERA_VIEW window. X and Y use
 * their own pixel scales so canvas overlays, the square fluid texture, and
 * Three's top-down scene all agree about where hazards are drawn.
 */
export function worldToScreen(wx, wy, camX, camY, canvasW, canvasH) {
  // Displacement from camera to entity, with toroidal shortest-path
  let dx = wx - camX;
  let dy = wy - camY;
  const half = WORLD_SCALE / 2;
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
 * Reference grid span that all fluid UV-space parameters are calibrated for.
 * CONFIG values for splat radii, force strengths, accretion distances, etc.
 * were tuned at this visible-window scale. Total map size must not leak into
 * these conversions; the camera-anchored grid always describes GRID_WINDOW.
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
  // Circular culling must include the square window's corners.
  const cullDist = (Math.SQRT2 * CAMERA_VIEW) / 2 + margin;
  return worldDistance(entityWX, entityWY, camX, camY) > cullDist;
}

// ---- Velocity conversions ----

/** Fluid velocity is Y-up; screen/world velocity is Y-down. Negate Y component. */
export function fluidVelToScreen(fvx, fvy) { return [fvx, -fvy]; }

/** Convert world-space velocity to reference-scaled fluid velocity. */
export function worldVelToFluid(wvx, wvy) {
  return [wvx / FLUID_REF_SCALE, -wvy / FLUID_REF_SCALE];
}

// ---- Unit conversion helpers ----
// Use these instead of inline * GRID_WINDOW or / GRID_WINDOW.

/**
 * Convert camera-window fluid UV distance/value to world-units.
 * Fluid UV spans 0–1 across GRID_WINDOW, not the full map.
 */
export function uvToWorld(uvValue) {
  return fluidUVRadiusToWorld(uvValue);
}

/**
 * Convert world-units distance/value to camera-window fluid UV.
 * Inverse of uvToWorld.
 */
export function worldToUV(worldValue) {
  return worldRadiusToFluidUV(worldValue);
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
 * Legacy single-axis world→pixel conversion.
 * Prefer worldPixelScale() for vectors and worldRadiusToScreen() for radii.
 */
export function worldToPx(worldValue, screenDim, screenH = null) {
  return worldValue * pxPerWorld(screenDim, screenH);
}

/**
 * Project a world-space radius into screen pixels.
 *
 * mode="world" preserves the same world metric as worldToScreen(). On a
 * widescreen target that means circles in simulation space become ellipses in
 * pixels, which is what gameplay hazard/range visuals need.
 *
 * mode="screen" keeps a small glyph visually round in pixel space. Use it only
 * for non-gameplay icon sizing, not collision/range/hazard affordances.
 */
export function worldRadiusToScreen(worldRadius, canvasW, canvasH, mode = 'world') {
  const { x, y } = worldPixelScale(canvasW, canvasH);
  const ry = worldRadius * y;
  if (mode === 'screen') return { rx: ry, ry };
  return { rx: worldRadius * x, ry };
}

/**
 * Project a world-space radius into Three scene scale.
 *
 * The top-down Three camera spans [-aspect, aspect] × [-1, 1]. Positions use
 * the same stretched projection as worldToScreen(), so world-space gameplay
 * radii need an X scale multiplied by aspect. Screen glyphs intentionally keep
 * uniform scene scale for readability.
 */
export function worldRadiusToSceneScale(worldRadius, cameraAspect = 1, cameraView = CAMERA_VIEW, mode = 'world') {
  const safeView = Math.max(0.001, Number.isFinite(cameraView) ? cameraView : CAMERA_VIEW);
  const y = (worldRadius / safeView) * 2;
  if (mode === 'screen') return { x: y, y };
  return { x: y * Math.max(0.001, cameraAspect || 1), y };
}
