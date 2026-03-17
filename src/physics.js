/**
 * physics.js — Centralized force math. All entity→ship forces go through here.
 *
 * The same lesson as coords.js: if you need to compute a force on the ship,
 * use these functions. Don't roll your own gravity formula inline.
 *
 * Force types:
 *   - Gravity pull (wells → ship): inverse-power with finite range
 *   - Radiation push (stars → ship): inverse-power with finite range
 *   - Proximity push (planetoids → ship): linear fade within radius
 *   - Wave push (wave rings → ship): band-pass cosine profile
 */

/**
 * Reference distance for normalizing inverse-power forces.
 * All strength values are "acceleration at this distance."
 * 0.25 world-units ≈ 100px at 1200px screen — matches old pixel-space feel.
 */
export const FORCE_REF_DIST = 0.25;

/** Minimum distance for force calculations (prevents singularity). */
export const FORCE_MIN_DIST = 0.15;

/**
 * Compute inverse-power force magnitude with finite range.
 * Returns scalar acceleration (world-units/s²). Caller handles direction.
 *
 * @param {number} dist - distance in world-units
 * @param {number} strength - acceleration at FORCE_REF_DIST
 * @param {number} mass - source mass multiplier
 * @param {number} falloff - distance exponent (1.5 = softer, 2.0 = inverse-square)
 * @param {number} maxRange - force drops to zero at this distance
 * @returns {number} acceleration magnitude, 0 if out of range
 */
export function inversePowerForce(dist, strength, mass, falloff, maxRange) {
  if (dist < 0.001 || dist > maxRange) return 0;
  const safeDist = Math.max(dist, FORCE_MIN_DIST);
  const normDist = safeDist / FORCE_REF_DIST;
  const baseAccel = strength * mass / Math.pow(normDist, falloff);
  // Smooth quadratic fade to zero at maxRange
  const t = dist / maxRange;
  const rangeFade = (1 - t) * (1 - t);
  return baseAccel * rangeFade;
}

/**
 * Compute proximity push force (linear fade within radius).
 * Used by planetoids — constant push that fades to zero at edge of radius.
 *
 * @param {number} dist - distance in world-units
 * @param {number} strength - peak acceleration at dist=0
 * @param {number} radius - push drops to zero at this distance
 * @returns {number} acceleration magnitude
 */
export function proximityForce(dist, strength, radius) {
  if (dist < 0.001 || dist > radius) return 0;
  return strength * (1 - dist / radius);
}

/**
 * Compute wave ring force (band-pass cosine profile).
 * Force peaks when the ship is exactly on the wavefront and fades
 * to zero at the edges of the band.
 *
 * @param {number} distFromSource - distance from ring source to ship
 * @param {number} ringRadius - current ring radius
 * @param {number} halfWidth - half-width of the wavefront band
 * @param {number} pushStrength - peak push acceleration
 * @param {number} amplitude - current ring amplitude (decays over time)
 * @returns {number} acceleration magnitude
 */
export function waveBandForce(distFromSource, ringRadius, halfWidth, pushStrength, amplitude) {
  const distFromFront = Math.abs(distFromSource - ringRadius);
  if (distFromFront > halfWidth) return 0;
  const bandPosition = distFromFront / halfWidth;
  const profile = Math.cos(bandPosition * Math.PI * 0.5);
  return pushStrength * amplitude * profile;
}

/**
 * Apply a force to the ship along a direction vector.
 * Consistent dt handling: uses 1/60 fixed timestep for frame-rate independence.
 *
 * @param {Ship} ship
 * @param {number} nx - unit direction X
 * @param {number} ny - unit direction Y
 * @param {number} magnitude - acceleration in world-units/s²
 * @param {number} [dt=1/60] - timestep
 */
export function applyForceToShip(ship, nx, ny, magnitude, dt = 1 / 60) {
  ship.vx += nx * magnitude * dt;
  ship.vy += ny * magnitude * dt;
}
