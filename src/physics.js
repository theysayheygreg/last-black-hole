/**
 * physics.js — Centralized force math for all entity→ship interactions.
 *
 * Same principle as coords.js: one authority for force calculations.
 * If you need to apply a force to the ship, use these functions.
 * Don't inline your own gravity formula.
 *
 * FORCE MODEL OVERVIEW:
 *
 * All forces return a scalar acceleration (world-units/s²). The caller
 * provides the direction vector and timestep via applyForceToShip().
 *
 * Three force profiles exist:
 *
 *   inversePowerForce:  strength × mass / dist^falloff, fading to 0 at maxRange
 *   ├── Used by: wells (pull), stars (push)
 *   ├── The "strength" value means "acceleration at FORCE_REF_DIST"
 *   └── Quadratic range fade: (1 - dist/maxRange)² — smooth, no hard cutoff
 *
 *   proximityForce:  strength × (1 - dist/radius), linear fade
 *   ├── Used by: planetoids (push)
 *   └── Simple and predictable — constant push that drops off linearly
 *
 *   waveBandForce:  strength × amplitude × cos(position in band)
 *   ├── Used by: wave rings (push)
 *   └── Only applies when ship is inside the expanding wavefront band
 */

/**
 * Reference distance for inverse-power force normalization.
 *
 * When CONFIG says "shipPullStrength: 0.6", that means "0.6 world-units/s²
 * at 0.25 world-units away." The formula divides actual distance by this
 * value before applying the falloff exponent.
 *
 * 0.25 world-units ≈ 100px on a 1200px screen — chosen to match the feel
 * of the original pixel-space gravity where strength was "px/s² at 100px."
 */
export const FORCE_REF_DIST = 0.25;

/**
 * Minimum distance for force calculations.
 *
 * Prevents infinite force when entities overlap. Any distance below this
 * is clamped to this value. 0.15 world-units ≈ 60px — close enough to
 * feel dangerous, far enough to prevent velocity explosion.
 */
export const FORCE_MIN_DIST = 0.15;

/**
 * Inverse-power force with finite range.
 *
 * Formula: (strength × mass / (dist/REF)^falloff) × (1 - dist/maxRange)²
 *
 * The first term is classic gravity (stronger at close range).
 * The second term fades force to exactly zero at maxRange — creating
 * genuine flat empty space where the player drifts freely.
 *
 * @param {number} dist - actual distance in world-units
 * @param {number} strength - acceleration at FORCE_REF_DIST (world-units/s²)
 * @param {number} mass - source mass multiplier (well.mass, star.mass)
 * @param {number} falloff - distance exponent. 1.5 = soft, 2.0 = inverse-square, 3.0 = sharp
 * @param {number} maxRange - force is zero beyond this distance (world-units)
 * @returns {number} scalar acceleration in world-units/s², or 0 if out of range
 */
export function inversePowerForce(dist, strength, mass, falloff, maxRange) {
  if (dist < 0.001 || dist > maxRange) return 0;
  const safeDist = Math.max(dist, FORCE_MIN_DIST);
  const normDist = safeDist / FORCE_REF_DIST;
  const baseAccel = strength * mass / Math.pow(normDist, falloff);
  // Linear range fade: 1.0 at center, 0.0 at maxRange.
  // (Was quadratic — crushed gravity to 25% at half-range, making wells feel sluggish.)
  const t = dist / maxRange;
  const rangeFade = 1 - t;
  return baseAccel * rangeFade;
}

/**
 * Linear proximity force (constant at center, zero at edge).
 *
 * Formula: strength × (1 - dist/radius)
 *
 * Simpler than inverse-power — used for planetoid push where you want
 * a predictable "I'm too close" shove without the singularity behavior.
 *
 * @param {number} dist - actual distance in world-units
 * @param {number} strength - peak acceleration at dist=0 (world-units/s²)
 * @param {number} radius - force is zero beyond this distance (world-units)
 * @returns {number} scalar acceleration in world-units/s²
 */
export function proximityForce(dist, strength, radius) {
  if (dist < 0.001 || dist > radius) return 0;
  return strength * (1 - dist / radius);
}

/**
 * Wave ring band-pass force (cosine profile across wavefront).
 *
 * Only applies when the ship is inside the ring's wavefront band
 * (within halfWidth of the current ring radius). Force peaks when the
 * ship is exactly on the wavefront and fades at the edges.
 *
 * Profile: cos(π/2 × distFromFront/halfWidth) — 1.0 at center, 0.0 at edge.
 * This creates a smooth push that feels like being hit by a wave, not a wall.
 *
 * @param {number} distFromSource - ship distance from ring center (world-units)
 * @param {number} ringRadius - current expanding radius of the ring (world-units)
 * @param {number} halfWidth - half the wavefront band thickness (world-units)
 * @param {number} pushStrength - peak push acceleration (world-units/s²)
 * @param {number} amplitude - current ring amplitude (decays each frame by waveDecay)
 * @returns {number} scalar acceleration in world-units/s²
 */
export function waveBandForce(distFromSource, ringRadius, halfWidth, pushStrength, amplitude) {
  const distFromFront = Math.abs(distFromSource - ringRadius);
  if (distFromFront > halfWidth) return 0;
  // 0.0 at wavefront center, 1.0 at band edge
  const bandPosition = distFromFront / halfWidth;
  // cos(0) = 1 at center, cos(π/2) = 0 at edge
  const profile = Math.cos(bandPosition * Math.PI * 0.5);
  return pushStrength * amplitude * profile;
}

/**
 * Apply a force to the ship along a direction vector.
 *
 * Multiplies acceleration by dt to get velocity delta: Δv = a × dt.
 * Default dt is 1/60 (fixed timestep) for forces applied outside
 * the main ship.update() loop (stars, planetoids, waves).
 *
 * @param {Ship} ship - mutates ship.vx and ship.vy directly
 * @param {number} nx - unit direction X (from worldDirectionTo)
 * @param {number} ny - unit direction Y
 * @param {number} magnitude - acceleration in world-units/s²
 * @param {number} [dt=1/60] - timestep in seconds
 */
export function applyForceToShip(ship, nx, ny, magnitude, dt = 1 / 60) {
  ship.vx += nx * magnitude * dt;
  ship.vy += ny * magnitude * dt;
}
