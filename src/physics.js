/**
 * physics.js — Centralized force math for all entity→ship interactions.
 *
 * Same principle as coords.js: one authority for force calculations.
 * If you need to apply a force to the ship, use these functions.
 * Don't inline your own gravity formula.
 *
 * FORCE MODEL OVERVIEW:
 *
 * Scalar force helpers return acceleration (world-units/s²). The well-gravity
 * helper also returns the direction-resolved vector. Callers provide the
 * timestep via applyForceToShip() or their body integration step.
 *
 * Force profiles include:
 *
 *   inversePowerForce:  strength × mass / dist^falloff, fading to 0 at maxRange
 *   ├── Used by: wells (pull), stars (push)
 *   ├── The "strength" value means "acceleration at FORCE_REF_DIST"
 *   └── Linear range fade: (1 - dist/maxRange) — smooth, no hard cutoff
 *
 *   orbitalCurrentSpeed: strength × mass / dist^falloff, fading to 0 at maxRange
 *   ├── Used by: well surf-current samples
 *   └── Returns a target velocity, not an acceleration
 *
 *   proximityForce:  strength × (1 - dist/radius), linear fade
 *   ├── Used by: planetoids (push)
 *   └── Simple and predictable — constant push that drops off linearly
 *
 *   waveBandForce:  strength × amplitude × cos(position in band)
 *   ├── Used by: wave rings (push)
 *   └── Only applies when ship is inside the expanding wavefront band
 *
 *   wellGravityVector: body-class parameterized inverse-power well gravity
 *   ├── Used by: player, scavenger, and wreck bodies
 *   └── Direction comes from coords.js; shared content owns magnitude + vector
 */

import { gravityVector, inversePowerMagnitude } from './content/well-gravity.js';

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
 * Named well-gravity parameters that differ by body class.
 *
 * Player and scavenger gravity use the accepted ship curve: strength is
 * normalized at FORCE_REF_DIST, the singularity is clamped at
 * FORCE_MIN_DIST, and force fades linearly to zero at maxRange. Wrecks keep
 * their deliberately tiny raw-distance drift curve and hard range cutoff.
 * Keeping those differences as data lets every consumer use one formula.
 */
export const WELL_GRAVITY_BODY_CLASSES = Object.freeze({
  player: Object.freeze({
    referenceDistance: FORCE_REF_DIST,
    minimumDistance: FORCE_MIN_DIST,
    rangeMode: 'linear',
    zeroDistanceThreshold: 0.001,
  }),
  scavenger: Object.freeze({
    referenceDistance: FORCE_REF_DIST,
    minimumDistance: FORCE_MIN_DIST,
    rangeMode: 'linear',
    zeroDistanceThreshold: 0.001,
  }),
  wreck: Object.freeze({
    referenceDistance: 1,
    minimumDistance: 0.02,
    rangeMode: 'cutoff',
    zeroDistanceThreshold: 0.001,
  }),
});

/**
 * Inverse-power force with finite range.
 *
 * Formula: (strength × mass / (dist/REF)^falloff) × (1 - dist/maxRange)
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
  return inversePowerMagnitude(dist, {
    strength,
    mass,
    falloff,
    maxRange,
    referenceDistance: FORCE_REF_DIST,
    minimumDistance: FORCE_MIN_DIST,
    rangeMode: 'linear',
    zeroDistanceThreshold: 0.001,
  });
}

/**
 * Calculate a toroidal well-gravity vector for a named body class.
 *
 * `direction` must come from coords.js worldDirectionTo(), so all three
 * consumers share the same wrapped direction and the same force family.
 * Per-system strength, falloff, and range remain caller-owned tunables; the
 * body-class profile supplies only the intentional shape differences.
 *
 * @param {'player'|'scavenger'|'wreck'} bodyClass
 * @param {object} options
 * @param {{dist:number,nx:number,ny:number}} options.direction
 * @param {number} options.strength - acceleration scale
 * @param {number} options.mass - well mass multiplier
 * @param {number} options.falloff - distance exponent
 * @param {number} options.maxRange - force range in world-units
 * @returns {{x:number,y:number,magnitude:number}}
 */
export function wellGravityVector(bodyClass, {
  direction,
  strength,
  mass,
  falloff,
  maxRange,
}) {
  const profile = WELL_GRAVITY_BODY_CLASSES[bodyClass];
  if (!profile) throw new Error(`Unknown well gravity body class: ${bodyClass}`);

  return gravityVector(direction, {
    strength,
    mass,
    falloff,
    maxRange,
    ...profile,
  });
}

/**
 * Orbital current target speed with finite range.
 *
 * The flow sampler returns this as a velocity target for fluid coupling,
 * not as an acceleration. It intentionally keeps the older world-distance
 * falloff curve so near-well surf lanes retain their punch, but it now
 * fades to zero at maxRange so distant wells cannot tow the ship invisibly.
 *
 * @param {number} dist - actual distance in world-units
 * @param {number} strength - current speed scale
 * @param {number} mass - source mass multiplier
 * @param {number} falloff - distance exponent
 * @param {number} maxRange - current is zero beyond this distance
 * @returns {number} target current speed in world-units/sec
 */
export function orbitalCurrentSpeed(dist, strength, mass, falloff, maxRange) {
  if (dist < 0.001 || dist > maxRange) return 0;
  const safeDist = Math.max(dist, FORCE_MIN_DIST);
  const baseSpeed = strength * mass / Math.pow(safeDist, falloff);
  return baseSpeed * (1 - dist / maxRange);
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
