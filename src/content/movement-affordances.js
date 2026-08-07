import { MOVEMENT } from './movement.js';

const TURN = Math.PI * 2;
const DEFAULTS = MOVEMENT.affordances;

function finite(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function clamp01(value) {
  return Math.max(0, Math.min(1, finite(value)));
}

export function normalizeHeading(angle) {
  let value = finite(angle) % TURN;
  if (value <= -Math.PI) value += TURN;
  if (value > Math.PI) value -= TURN;
  return value;
}

export function shortestHeadingDelta(from, to) {
  return normalizeHeading(finite(to) - finite(from));
}

export function convergeHeading(current, desired, dt, turnRate = DEFAULTS.turnRateRadiansPerSecond) {
  const start = normalizeHeading(current);
  const delta = shortestHeadingDelta(start, desired);
  const limit = Math.max(0, finite(turnRate)) * Math.max(0, finite(dt));
  if (Math.abs(delta) <= limit) return normalizeHeading(desired);
  return normalizeHeading(start + Math.sign(delta) * limit);
}

function smoothstep01(value) {
  const t = clamp01(value);
  return t * t * (3 - 2 * t);
}

export function usefulThrustScale(angleError, config = DEFAULTS) {
  const error = Math.abs(finite(angleError));
  const full = Math.max(0, finite(config.fullThrustAngleRadians));
  const minimum = Math.max(full + 1e-6, finite(config.minimumThrustAngleRadians, Math.PI));
  const floor = clamp01(config.minimumThrustScale);
  if (error <= full) return 1;
  if (error >= minimum) return floor;
  return 1 - (1 - floor) * smoothstep01((error - full) / (minimum - full));
}

export function resolveStoppingEnvelope(actor = {}, intent = {}, options = {}) {
  const speed = Math.hypot(finite(actor.vx), finite(actor.vy));
  const requestedBrake = clamp01(intent.brake);
  const target = options.approachTarget;
  const targetValid = target?.explicit === true
    && Number.isFinite(Number(target.distance))
    && Number.isFinite(Number(target.radius));
  const brakeAcceleration = Math.max(1e-6, finite(options.brakeAcceleration, 1));
  const stoppingDistance = speed * speed / (2 * brakeAcceleration);
  const stoppingMargin = Math.max(0, finite(options.stoppingMarginWorld, DEFAULTS.stoppingMarginWorld));
  const stoppingRadius = targetValid
    ? Math.max(0, finite(target.radius) - stoppingMargin)
    : 0;
  const remainingDistance = targetValid
    ? Math.max(0, finite(target.distance) - stoppingRadius)
    : Infinity;
  const withinTarget = targetValid && finite(target.distance) <= Math.max(0, finite(target.radius));
  const targetId = targetValid ? String(target.id || '') : null;
  const latchedTarget = targetValid && targetId
    && String(actor.movementStopTargetId || '') === targetId;
  const targetAssist = targetValid
    && (latchedTarget || remainingDistance <= stoppingDistance);
  const requiredBrake = targetAssist
    ? (withinTarget ? 1 : clamp01(stoppingDistance / Math.max(remainingDistance, 1e-6)))
    : 0;
  const residualThreshold = Math.max(0, finite(options.residualSpeedWorld, DEFAULTS.residualSpeedWorld));
  const needsCreep = targetAssist && !withinTarget && remainingDistance > 0 && speed <= residualThreshold;
  const active = requestedBrake > 0 || targetAssist;
  const direction = speed > 1e-9
    ? { x: finite(actor.vx) / speed, y: finite(actor.vy) / speed }
    : null;
  return Object.freeze({
    active,
    targetAssist,
    requestedBrake,
    brake: needsCreep ? requestedBrake : targetAssist ? Math.max(requestedBrake, requiredBrake) : requestedBrake,
    direction,
    speed,
    stoppingDistance,
    remainingDistance,
    targetId,
    targetKind: targetValid ? String(target.kind || 'interactable') : null,
    stoppingRadius,
    withinTarget,
    needsCreep,
    residualEligible: requestedBrake > 0 || (targetAssist && withinTarget),
  });
}

export function shapeMovementIntent(actor = {}, intent = {}, dt = 0, options = {}) {
  const inputX = finite(intent.moveX);
  const inputY = finite(intent.moveY);
  const inputMagnitude = Math.hypot(inputX, inputY);
  const fallbackHeading = Number.isFinite(Number(actor.movementFacing))
    ? Number(actor.movementFacing)
    : Number.isFinite(Number(actor.facing))
      ? Number(actor.facing)
      : Math.atan2(finite(actor.vy), finite(actor.vx));
  const desiredHeading = inputMagnitude > 1e-6
    ? Math.atan2(inputY, inputX)
    : fallbackHeading;
  const heading = convergeHeading(
    fallbackHeading,
    desiredHeading,
    dt,
    options.turnRateRadiansPerSecond ?? DEFAULTS.turnRateRadiansPerSecond,
  );
  const remainingTurn = shortestHeadingDelta(heading, desiredHeading);
  const requestedThrust = clamp01(intent.thrust);
  const thrustGateScale = usefulThrustScale(remainingTurn, options);
  const stopping = resolveStoppingEnvelope(actor, intent, { ...options, dt });
  const driveDirection = { x: Math.cos(heading), y: Math.sin(heading) };
  const brakeDirection = stopping.active && stopping.direction
    ? stopping.direction
    : driveDirection;
  const deliveredThrust = stopping.targetAssist
    ? (stopping.withinTarget ? 0 : Math.min(0.12, requestedThrust * thrustGateScale))
    : requestedThrust * thrustGateScale;
  return Object.freeze({
    input: Object.freeze({
      ...intent,
      moveX: driveDirection.x,
      moveY: driveDirection.y,
      brakeX: brakeDirection.x,
      brakeY: brakeDirection.y,
      thrust: deliveredThrust,
      brake: stopping.brake,
    }),
    heading,
    desiredHeading,
    requestedThrust,
    deliveredThrust,
    thrustGateScale,
    redirectRadians: remainingTurn,
    stopping,
    presentation: Object.freeze({
      facing: heading,
      requestedHeading: desiredHeading,
      thrustGateScale,
      plumeScale: deliveredThrust,
      plumeCantRadians: remainingTurn * 0.5,
      stoppingAssist: stopping.targetAssist,
    }),
  });
}

export function resolveNegligibleVelocity(actor, { stoppingActive = false, threshold = DEFAULTS.residualSpeedWorld } = {}) {
  if (!stoppingActive) return false;
  const speed = Math.hypot(finite(actor?.vx), finite(actor?.vy));
  if (speed > Math.max(0, finite(threshold))) return false;
  actor.vx = 0;
  actor.vy = 0;
  return true;
}
