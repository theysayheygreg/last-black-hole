const { BRAIN_DEFAULTS } = require("../player-brain.cjs");
const { MOVEMENT } = require("../content/movement.cjs");

const SERVER_INPUT = Object.freeze({
  baseDragPer60HzFrame: MOVEMENT.player.baseDragPer60HzFrame,
  fluidCoupling: MOVEMENT.player.fluidCoupling,
  brakeThrustScale: MOVEMENT.player.brakeThrustScale,
  brakeFuelScale: MOVEMENT.player.brakeFuelScale,
  maxSpeedWorld: MOVEMENT.player.maxSpeedWorld,
  deltaVRegenDelay: MOVEMENT.player.deltaVRegenDelay,
});

function finiteNumber(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function wrapWorldPosition(value, worldScale) {
  const scale = Number.isFinite(worldScale) && worldScale > 0 ? worldScale : 1;
  return ((value % scale) + scale) % scale;
}

function consumePlayerDeltaV(player, intensity, dt, costScale = 1) {
  const requested = Math.max(0, Math.min(1, Number(intensity) || 0));
  if (requested <= 0 || player.deltaV <= 0) return 0;
  const burnRate = (player.deltaVBurnRate || BRAIN_DEFAULTS.deltaVBurnRate)
    * (player.deltaVBurnEff || 1)
    * costScale;
  const burnCost = burnRate * requested * dt;
  const allowedRatio = burnCost > 0 ? Math.min(1, player.deltaV / burnCost) : 1;
  player.deltaV = Math.max(0, player.deltaV - burnCost * allowedRatio);
  return requested * allowedRatio;
}

function applyPlayerDeltaVRegen(player, dt, burned, inputConfig = SERVER_INPUT) {
  if (burned) {
    player.timeSinceThrust = 0;
    return;
  }
  player.timeSinceThrust = (player.timeSinceThrust || 0) + dt;
  const boost = player.timeSinceThrust >= inputConfig.deltaVRegenDelay
    ? (player.deltaVRegenBoost || 0)
    : 0;
  const regenRate = (player.deltaVRegen || 0) + boost;
  player.deltaV = Math.min(player.deltaVMax || BRAIN_DEFAULTS.deltaVMax, (player.deltaV || 0) + regenRate * dt);
}

function clampPlayerSpeed(player, inputConfig = SERVER_INPUT) {
  const speed = Math.hypot(player.vx, player.vy);
  const maxSpeed = inputConfig.maxSpeedWorld;
  if (Number.isFinite(maxSpeed) && speed > maxSpeed) {
    const scale = maxSpeed / speed;
    player.vx *= scale;
    player.vy *= scale;
  }
}

function applyPlayerDriveAndFlow(player, input, dt, options = {}) {
  const inputConfig = options.inputConfig || SERVER_INPUT;
  const brain = options.brain || player.brain || BRAIN_DEFAULTS;
  const burnModifiers = options.burnModifiers || { thrust: 1 };
  const controlMult = finiteNumber(options.controlMult, 1);
  const flowSample = options.flowSample || { current: { x: 0, y: 0 } };
  const moveX = finiteNumber(input?.moveX, 0);
  const moveY = finiteNumber(input?.moveY, 0);
  const thrustIntensity = consumePlayerDeltaV(player, input?.thrust, dt, 1);
  const accel = MOVEMENT.player.thrustAccel * brain.thrustScale
    * (burnModifiers.thrust || 1) * thrustIntensity * controlMult;

  player.vx += moveX * accel * dt;
  player.vy += moveY * accel * dt;

  const currentCoupling = Math.max(0, Number(brain.currentCoupling) || 0);
  const coupling = Math.min(inputConfig.fluidCoupling * currentCoupling * dt, 0.5);
  const current = flowSample.current || { x: 0, y: 0 };
  player.vx = player.vx * (1 - coupling) + finiteNumber(current.x, 0) * coupling;
  player.vy = player.vy * (1 - coupling) + finiteNumber(current.y, 0) * coupling;

  return { thrustIntensity, coupling, flowSample };
}

function applyPlayerBrakeAndIntegrate(player, input, dt, options = {}) {
  const inputConfig = options.inputConfig || SERVER_INPUT;
  const brain = options.brain || player.brain || BRAIN_DEFAULTS;
  const controlMult = finiteNumber(options.controlMult, 1);
  const worldScale = finiteNumber(options.worldScale, 1);
  const moveX = finiteNumber(input?.moveX, 0);
  const moveY = finiteNumber(input?.moveY, 0);
  const thrustIntensity = Math.max(0, Number(options.thrustIntensity) || 0);
  const brakeIntensity = consumePlayerDeltaV(player, input?.brake, dt, inputConfig.brakeFuelScale);

  if (brakeIntensity > 0) {
    const brakeAccel = MOVEMENT.player.thrustAccel * brain.thrustScale
      * inputConfig.brakeThrustScale * brakeIntensity * controlMult;
    player.vx -= moveX * brakeAccel * dt;
    player.vy -= moveY * brakeAccel * dt;
  }

  applyPlayerDeltaVRegen(player, dt, thrustIntensity > 0.01 || brakeIntensity > 0.01, inputConfig);
  const dragPerFrame = Math.max(0, Math.min(0.95, inputConfig.baseDragPer60HzFrame * brain.dragScale));
  const dragFactor = Math.pow(1 - dragPerFrame, dt * 60);
  player.vx *= dragFactor;
  player.vy *= dragFactor;
  clampPlayerSpeed(player, inputConfig);
  player.wx = wrapWorldPosition(player.wx + player.vx * dt, worldScale);
  player.wy = wrapWorldPosition(player.wy + player.vy * dt, worldScale);

  return { brakeIntensity, dragFactor };
}

function stepPlayerMovementCore(player, input, dt, options = {}) {
  const drive = applyPlayerDriveAndFlow(player, input, dt, options);
  const brake = applyPlayerBrakeAndIntegrate(player, input, dt, {
    ...options,
    thrustIntensity: drive.thrustIntensity,
  });
  return { ...drive, ...brake };
}

module.exports = {
  SERVER_INPUT,
  applyPlayerBrakeAndIntegrate,
  applyPlayerDeltaVRegen,
  applyPlayerDriveAndFlow,
  clampPlayerSpeed,
  consumePlayerDeltaV,
  stepPlayerMovementCore,
  wrapWorldPosition,
};
