import { MOVEMENT } from './movement.js';
import { dragFactorFromHalfLife } from './tuning.js';

export const MOVEMENT_INPUT = Object.freeze({
  coastHalfLifeSeconds: MOVEMENT.player.coastHalfLifeSeconds,
  fluidCoupling: MOVEMENT.player.fluidCoupling,
  brakeThrustScale: MOVEMENT.player.brakeThrustScale,
  // Kept as a private compatibility name for input/config consumers. The
  // player-facing resource is Heat; reverse thrust still costs 60% of the
  // forward heat gain through the canonical heat owner below.
  brakeFuelScale: MOVEMENT.player.heat.brakeScale,
  brakeHeatScale: MOVEMENT.player.heat.brakeScale,
  maxSpeedWorld: MOVEMENT.player.maxSpeedWorld,
  deltaVRegenDelay: MOVEMENT.player.deltaVRegenDelay,
  heatCoolDelaySeconds: MOVEMENT.player.heat.coolDelaySeconds,
});

function finiteNumber(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function wrapWorldPosition(value, worldScale) {
  const scale = Number.isFinite(worldScale) && worldScale > 0 ? worldScale : 1;
  return ((value % scale) + scale) % scale;
}

function clamp01(value) {
  return Math.max(0, Math.min(1, finiteNumber(value, 0)));
}

function getHeatRatio(player) {
  if (Number.isFinite(Number(player?.heatRatio))) {
    return clamp01(player.heatRatio);
  }
  if (Number.isFinite(Number(player?.heat))) {
    return clamp01(player.heat);
  }
  const maxDeltaV = Number(player?.deltaVMax) || MOVEMENT.player.deltaVMax;
  const deltaV = Math.max(0, Number(player?.deltaV) || 0);
  return maxDeltaV > 0 ? clamp01(1 - deltaV / maxDeltaV) : 0;
}

function isPlayerOverheated(player) {
  return Math.max(0, Number(player?.overheatRemaining) || 0) > 0
    || getHeatRatio(player) >= MOVEMENT.player.heat.overheatThreshold;
}

function setHeatRatio(player, ratio) {
  const heatRatio = clamp01(ratio);
  const maxDeltaV = Math.max(1, Number(player?.deltaVMax) || MOVEMENT.player.deltaVMax);
  player.heat = heatRatio;
  player.heatRatio = heatRatio;
  // deltaV remains a private wire/replay alias while Heat owns the resource.
  player.deltaVMax = maxDeltaV;
  player.deltaV = maxDeltaV * (1 - heatRatio);
  return heatRatio;
}

function heatRateScale(player, legacyRate, baseLegacyRate) {
  const maxDeltaV = Math.max(1, Number(player?.deltaVMax) || MOVEMENT.player.deltaVMax);
  const rate = Math.max(0, Number(legacyRate) || 0);
  const baseRate = Math.max(Number.EPSILON, Number(baseLegacyRate) || 0);
  return (rate / maxDeltaV) / (baseRate / MOVEMENT.player.deltaVMax);
}

function heatGainPerSecond(player, costScale = 1) {
  const burnRate = (Number(player?.deltaVBurnRate) || MOVEMENT.player.deltaVBurnRate)
    * (Number(player?.deltaVBurnEff) || 1);
  return MOVEMENT.player.heat.gainPerSecond
    * heatRateScale(player, burnRate, MOVEMENT.player.deltaVBurnRate)
    * Math.max(0, Number(costScale) || 0);
}

function heatCoolRates(player) {
  const baseRate = heatRateScale(player, player?.deltaVRegen, MOVEMENT.player.deltaVRegen);
  const boostRate = heatRateScale(player, player?.deltaVRegenBoost, MOVEMENT.player.deltaVRegenBoost);
  return {
    base: MOVEMENT.player.heat.coolPerSecond * baseRate,
    boost: MOVEMENT.player.heat.coolBoostPerSecond * boostRate,
  };
}

function advancePlayerOverheat(player, dt) {
  const remaining = Math.max(0, Number(player?.overheatRemaining) || 0);
  if (remaining <= 0) return false;
  const nextRemaining = Math.max(0, remaining - Math.max(0, Number(dt) || 0));
  player.overheatRemaining = nextRemaining;
  if (nextRemaining <= 0) {
    setHeatRatio(player, MOVEMENT.player.heat.resetRatio);
    player._heatResetThisStep = true;
    player.deltaVRecovering = false;
    return false;
  }
  player.deltaVRecovering = true;
  return true;
}

function consumePlayerHeat(player, intensity, dt, costScale = 1) {
  const requested = Math.max(0, Math.min(1, Number(intensity) || 0));
  if (requested <= 0) return 0;
  if (Math.max(0, Number(player.overheatRemaining) || 0) > 0) {
    player.deltaVRecovering = true;
    return 0;
  }
  const heat = getHeatRatio(player);
  const gain = heatGainPerSecond(player, costScale) * requested * Math.max(0, Number(dt) || 0);
  const nextHeat = setHeatRatio(player, heat + gain);
  const threshold = MOVEMENT.player.heat.overheatThreshold;
  if (nextHeat >= threshold - Number.EPSILON) {
    setHeatRatio(player, threshold);
    player.overheatRemaining = MOVEMENT.player.heat.lockoutSeconds;
    player.deltaVRecovering = true;
  } else {
    player.deltaVRecovering = false;
  }
  return requested;
}

function applyPlayerHeatCooling(player, dt, active, inputConfig = MOVEMENT_INPUT) {
  if (player._heatResetThisStep) {
    player._heatResetThisStep = false;
    player.timeSinceThrust = 0;
    return;
  }
  if (Math.max(0, Number(player.overheatRemaining) || 0) > 0) {
    player.timeSinceThrust = 0;
    return;
  }
  if (active) {
    player.timeSinceThrust = 0;
    return;
  }
  player.timeSinceThrust = (player.timeSinceThrust || 0) + dt;
  const coolDelay = inputConfig.heatCoolDelaySeconds ?? inputConfig.deltaVRegenDelay;
  const boost = player.timeSinceThrust >= coolDelay
    ? heatCoolRates(player).boost
    : 0;
  const rates = heatCoolRates(player);
  setHeatRatio(player, getHeatRatio(player) - (rates.base + boost) * dt);
}

// Private compatibility aliases keep the existing authority/replay adapters
// stable while all resource state and player-facing projections use Heat.
function applyPlayerDeltaVRegen(player, dt, burned, inputConfig = MOVEMENT_INPUT) {
  return applyPlayerHeatCooling(player, dt, burned, inputConfig);
}

function consumePlayerDeltaV(player, intensity, dt, costScale = 1) {
  return consumePlayerHeat(player, intensity, dt, costScale);
}

function applyPlayerDriveAndFlow(player, input, dt, options = {}) {
  const inputConfig = options.inputConfig || MOVEMENT_INPUT;
  const brain = options.brain || player.brain || {};
  const burnModifiers = options.burnModifiers || { thrust: 1 };
  const controlMult = finiteNumber(options.controlMult, 1);
  const flowSample = options.flowSample || { current: { x: 0, y: 0 } };
  const moveX = finiteNumber(input?.moveX, 0);
  const moveY = finiteNumber(input?.moveY, 0);
  const overheatActive = advancePlayerOverheat(player, dt);
  const thrustIntensity = overheatActive ? 0 : consumePlayerHeat(player, input?.thrust, dt, 1);
  const thrustScale = Number(brain.thrustScale) || 1;
  const accel = MOVEMENT.player.thrustAccel * thrustScale
    * (burnModifiers.thrust || 1) * thrustIntensity * controlMult;
  const thrustDeltaV = { x: moveX * accel * dt, y: moveY * accel * dt };

  player.vx += thrustDeltaV.x;
  player.vy += thrustDeltaV.y;

  const currentCoupling = Math.max(0, Number(brain.currentCoupling) || 0);
  const coupling = Math.min(inputConfig.fluidCoupling * currentCoupling * dt, 0.5);
  const current = flowSample.current || { x: 0, y: 0 };
  const beforeCouplingVX = player.vx;
  const beforeCouplingVY = player.vy;
  player.vx = player.vx * (1 - coupling) + finiteNumber(current.x, 0) * coupling;
  player.vy = player.vy * (1 - coupling) + finiteNumber(current.y, 0) * coupling;
  const couplingDeltaV = {
    x: player.vx - beforeCouplingVX,
    y: player.vy - beforeCouplingVY,
  };

  return { thrustIntensity, coupling, flowSample, thrustDeltaV, couplingDeltaV };
}

function clampPlayerSpeed(player, inputConfig = MOVEMENT_INPUT) {
  const speed = Math.hypot(player.vx, player.vy);
  const maxSpeed = inputConfig.maxSpeedWorld;
  if (Number.isFinite(maxSpeed) && speed > maxSpeed) {
    const scale = maxSpeed / speed;
    player.vx *= scale;
    player.vy *= scale;
  }
}

function applyPlayerBrakeAndIntegrate(player, input, dt, options = {}) {
  const inputConfig = options.inputConfig || MOVEMENT_INPUT;
  const brain = options.brain || player.brain || {};
  const controlMult = finiteNumber(options.controlMult, 1);
  const worldScale = finiteNumber(options.worldScale, 1);
  const moveX = finiteNumber(input?.moveX, 0);
  const moveY = finiteNumber(input?.moveY, 0);
  const thrustIntensity = Math.max(0, Number(options.thrustIntensity) || 0);
  const brakeIntensity = consumePlayerHeat(
    player,
    input?.brake,
    dt,
    inputConfig.brakeHeatScale ?? inputConfig.brakeFuelScale,
  );
  const thrustDeltaV = { x: 0, y: 0 };

  if (brakeIntensity > 0) {
    const thrustScale = Number(brain.thrustScale) || 1;
    const brakeAccel = MOVEMENT.player.thrustAccel * thrustScale
      * inputConfig.brakeThrustScale * brakeIntensity * controlMult;
    thrustDeltaV.x = -moveX * brakeAccel * dt;
    thrustDeltaV.y = -moveY * brakeAccel * dt;
    player.vx += thrustDeltaV.x;
    player.vy += thrustDeltaV.y;
  }

  const beforeDragVX = player.vx;
  const beforeDragVY = player.vy;
  applyPlayerHeatCooling(player, dt, thrustIntensity > 0.01 || brakeIntensity > 0.01, inputConfig);
  const dragScale = Number(brain.dragScale) || 1;
  const dragFactor = dragFactorFromHalfLife(inputConfig.coastHalfLifeSeconds, dt, dragScale);
  player.vx *= dragFactor;
  player.vy *= dragFactor;
  clampPlayerSpeed(player, inputConfig);
  const dragDeltaV = {
    x: player.vx - beforeDragVX,
    y: player.vy - beforeDragVY,
  };
  player.wx = wrapWorldPosition(player.wx + player.vx * dt, worldScale);
  player.wy = wrapWorldPosition(player.wy + player.vy * dt, worldScale);

  return { brakeIntensity, dragFactor, thrustDeltaV, dragDeltaV };
}

function applyAccelerationChannel(player, acceleration, dt) {
  const beforeX = player.vx;
  const beforeY = player.vy;
  const sources = Array.isArray(acceleration) ? acceleration : [acceleration];
  for (const source of sources) {
    player.vx += finiteNumber(source?.x, 0) * dt;
    player.vy += finiteNumber(source?.y, 0) * dt;
  }
  return { x: player.vx - beforeX, y: player.vy - beforeY };
}

/**
 * Advance one FREE authority movement step in its complete gameplay order.
 * GRAPPLED and TERMINAL never enter this path. The one field sample supplied
 * here owns current coupling, well gravity, and event waves for the whole tick.
 */
function stepPlayerFreeMovement(player, input, dt, options = {}) {
  const drive = applyPlayerDriveAndFlow(player, input, dt, options);

  // Well contact sits here because protected contact may replace velocity.
  // Returning false stops a newly terminal player before environment/drag.
  if (options.afterDrive && options.afterDrive(player, drive) === false) {
    return {
      ...drive,
      aborted: true,
      gravityDeltaV: { x: 0, y: 0 },
      waveDeltaV: { x: 0, y: 0 },
      brakeIntensity: 0,
      dragFactor: 1,
      dragDeltaV: { x: 0, y: 0 },
    };
  }

  const environment = options.environmentAcceleration || {};
  const gravityDeltaV = applyAccelerationChannel(player, environment.gravity, dt);
  const waveDeltaV = applyAccelerationChannel(player, environment.wave, dt);

  const brake = applyPlayerBrakeAndIntegrate(player, input, dt, {
    ...options,
    thrustIntensity: drive.thrustIntensity,
  });
  const thrustDeltaV = {
    x: drive.thrustDeltaV.x + brake.thrustDeltaV.x,
    y: drive.thrustDeltaV.y + brake.thrustDeltaV.y,
  };
  return {
    ...drive,
    ...brake,
    thrustDeltaV,
    gravityDeltaV,
    waveDeltaV,
    aborted: false,
  };
}

// Compatibility entrypoint for fixtures and local consumers that supply one
// undifferentiated external acceleration instead of authority field channels.
function stepPlayerMovementCore(player, input, dt, options = {}) {
  return stepPlayerFreeMovement(player, input, dt, {
    ...options,
    environmentAcceleration: options.environmentAcceleration || {
      gravity: options.externalAcceleration || { x: 0, y: 0 },
      wave: { x: 0, y: 0 },
    },
  });
}

export {
  applyPlayerBrakeAndIntegrate,
  applyPlayerHeatCooling,
  applyPlayerDeltaVRegen,
  applyPlayerDriveAndFlow,
  consumePlayerHeat,
  clampPlayerSpeed,
  consumePlayerDeltaV,
  finiteNumber,
  getHeatRatio,
  heatCoolRates,
  heatGainPerSecond,
  isPlayerOverheated,
  setHeatRatio,
  stepPlayerFreeMovement,
  stepPlayerMovementCore,
  wrapWorldPosition,
};
