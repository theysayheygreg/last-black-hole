import { WORLD_SCALE, worldDisplacement, wrapWorld } from '../coords.js';
import {
  MOVEMENT_INPUT,
  getHeatRatio,
  stepPlayerMovementCore,
} from '../content/movement-step.js';
import { UNIT_SCALE } from '../content/units.js';

// This is a presentation bridge, not a second authority. The client predicts
// only its own input and uses the last authoritative force sample as a short
// lived hint while the next snapshot is in flight. It selects the newest
// unacknowledged command rather than replaying a queue. The authority ledger
// supplies the current's already-accounted acceleration; the client never
// samples or recreates the server field.
export const LOCAL_PLAYER_RECONCILIATION = Object.freeze({
  positionCorrectionHalfLifeSeconds: 0.09,
  velocityCorrectionHalfLifeSeconds: 0.12,
  hardSnapDistanceWorld: 0.75,
  hardSnapVelocityDeltaWorld: 4,
  maxExtrapolationSeconds: 0.75,
});

function finite(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function movementBrain(source = {}) {
  return {
    thrustScale: finite(source.thrustScale, 1),
    dragScale: finite(source.dragScale, 1),
    currentCoupling: finite(source.currentCoupling, 1),
  };
}

function phaseKey(player = {}) {
  // Slingshot phase is authority-owned presentation state, not a separate
  // client simulation. A phase transition (lock -> arc -> release ghost)
  // must rebase to fresh truth without teleporting the local ship.
  return player.status || 'alive';
}

function forceAcceleration(forceLedger) {
  const currentCoupling = forceLedger?.vectors?.currentCoupling || {};
  const wellGravity = forceLedger?.vectors?.wellGravity || {};
  const bodyPush = forceLedger?.vectors?.bodyPush || {};
  const wave = forceLedger?.vectors?.wave || {};
  const scale = UNIT_SCALE.metersPerSimUnit;
  return {
    x: (finite(currentCoupling.x) + finite(wellGravity.x) + finite(bodyPush.x) + finite(wave.x)) / scale,
    y: (finite(currentCoupling.y) + finite(wellGravity.y) + finite(bodyPush.y) + finite(wave.y)) / scale,
  };
}

function normalizeMovementInput(input = {}) {
  return {
    moveX: finite(input.moveX),
    moveY: finite(input.moveY),
    thrust: Math.max(0, finite(input.thrust)),
    brake: Math.max(0, finite(input.brake)),
  };
}

function latestUnacknowledgedMovement(pendingInputs, acknowledgedSeq) {
  if (!Array.isArray(pendingInputs) || pendingInputs.length === 0) return null;
  const ack = Number.isFinite(Number(acknowledgedSeq)) ? Number(acknowledgedSeq) : -Infinity;
  let latest = null;
  for (const entry of pendingInputs) {
    const seq = Number(entry?.seq);
    if (!Number.isFinite(seq) || seq <= ack) continue;
    if (latest && seq <= latest.seq) continue;
    latest = {
      seq,
      input: normalizeMovementInput(entry),
    };
  }
  return latest;
}

function authorityState(player, { runId = null, now = 0 } = {}) {
  return {
    runId,
    phase: phaseKey(player),
    wx: finite(player.wx),
    wy: finite(player.wy),
    vx: finite(player.vx),
    vy: finite(player.vy),
    deltaV: Math.max(0, finite(player.deltaV)),
    deltaVMax: Math.max(0, finite(player.deltaVMax)),
    deltaVRegen: Math.max(0, finite(player.deltaVRegen)),
    deltaVRegenBoost: Math.max(0, finite(player.deltaVRegenBoost)),
    deltaVBurnEff: Math.max(0, finite(player.deltaVBurnEff, 1)),
    deltaVBurnRate: Math.max(0, finite(player.deltaVBurnRate)),
    heat: getHeatRatio(player),
    heatRatio: getHeatRatio(player),
    overheatRemaining: Math.max(0, finite(player.overheatRemaining, 0)),
    timeSinceThrust: Math.max(0, finite(player.timeSinceThrust)),
    forceLedger: player.forceLedger || null,
    receivedAt: now,
  };
}

function predictionFromAuthority(authority) {
  return {
    wx: authority.wx,
    wy: authority.wy,
    vx: authority.vx,
    vy: authority.vy,
    deltaV: authority.deltaV,
    deltaVMax: authority.deltaVMax,
    deltaVRegen: authority.deltaVRegen,
    deltaVRegenBoost: authority.deltaVRegenBoost,
    deltaVBurnEff: authority.deltaVBurnEff,
    deltaVBurnRate: authority.deltaVBurnRate,
    heat: authority.heat,
    heatRatio: authority.heatRatio,
    overheatRemaining: authority.overheatRemaining,
    timeSinceThrust: authority.timeSinceThrust,
  };
}

function blendFactor(dt, halfLifeSeconds) {
  if (dt <= 0) return 0;
  return 1 - Math.exp(-dt / Math.max(0.001, halfLifeSeconds));
}

function extrapolatedAuthority(authority, now, maxExtrapolationSeconds) {
  const elapsed = Math.min(
    maxExtrapolationSeconds,
    Math.max(0, (now - authority.receivedAt) / 1000),
  );
  const acceleration = forceAcceleration(authority.forceLedger);
  return {
    wx: wrapWorld(authority.wx + authority.vx * elapsed + 0.5 * acceleration.x * elapsed * elapsed),
    wy: wrapWorld(authority.wy + authority.vy * elapsed + 0.5 * acceleration.y * elapsed * elapsed),
    vx: authority.vx + acceleration.x * elapsed,
    vy: authority.vy + acceleration.y * elapsed,
  };
}

export function createLocalPlayerReconciliationState({
  brain = null,
  inputConfig = MOVEMENT_INPUT,
  worldScale = WORLD_SCALE,
  maxExtrapolationSeconds = LOCAL_PLAYER_RECONCILIATION.maxExtrapolationSeconds,
} = {}) {
  return {
    authority: null,
    wx: 0,
    wy: 0,
    vx: 0,
    vy: 0,
    deltaV: 0,
    deltaVMax: 0,
    deltaVRegen: 0,
    deltaVRegenBoost: 0,
    deltaVBurnEff: 1,
    deltaVBurnRate: 0,
    heat: 0,
    heatRatio: 0,
    overheatRemaining: 0,
    timeSinceThrust: 0,
    brain: movementBrain(brain || {}),
    inputConfig,
    worldScale: finite(worldScale, WORLD_SCALE),
    maxExtrapolationSeconds: Math.max(0, finite(maxExtrapolationSeconds,
      LOCAL_PLAYER_RECONCILIATION.maxExtrapolationSeconds)),
    pendingInputCount: 0,
    lastAcknowledgedSeq: null,
    predictionInputSource: 'current',
    predictionInputSeq: null,
    correctionDistance: 0,
    correctionVelocity: 0,
    lastMode: 'idle',
  };
}

/**
 * Rebase the private presentation state on a snapshot. Run and terminal
 * status changes are deliberate boundaries; ordinary updates blend.
 */
export function rebaseLocalPlayerReconciliation(state, player, {
  runId = null,
  now = 0,
  brain = null,
  inputConfig = MOVEMENT_INPUT,
  worldScale = WORLD_SCALE,
  maxExtrapolationSeconds = LOCAL_PLAYER_RECONCILIATION.maxExtrapolationSeconds,
  pendingInputs,
  acknowledgedSeq,
  forceReset = false,
} = {}) {
  const authority = authorityState(player, { runId, now });
  const boundary = forceReset || !state.authority
    || state.authority.runId !== authority.runId
    || state.authority.phase !== authority.phase;
  const [dx, dy] = state.authority
    ? worldDisplacement(state.wx, state.wy, authority.wx, authority.wy)
    : [0, 0];
  const distance = Math.hypot(dx, dy);
  const velocityDistance = state.authority
    ? Math.hypot(state.vx - authority.vx, state.vy - authority.vy)
    : 0;
  const hardReset = boundary
    || distance > LOCAL_PLAYER_RECONCILIATION.hardSnapDistanceWorld
    || velocityDistance > LOCAL_PLAYER_RECONCILIATION.hardSnapVelocityDeltaWorld;
  // Keep local input prediction, but never let a stale tank or burn profile
  // survive a server snapshot. The next local step starts from this truth.
  const base = hardReset ? predictionFromAuthority(authority) : {
    ...state,
    deltaV: authority.deltaV,
    deltaVMax: authority.deltaVMax,
    deltaVRegen: authority.deltaVRegen,
    deltaVRegenBoost: authority.deltaVRegenBoost,
    deltaVBurnEff: authority.deltaVBurnEff,
    deltaVBurnRate: authority.deltaVBurnRate,
    heat: authority.heat,
    heatRatio: authority.heatRatio,
    overheatRemaining: authority.overheatRemaining,
    timeSinceThrust: authority.timeSinceThrust,
  };
  const pendingInputCount = pendingInputs === undefined
    ? (state.pendingInputCount || 0)
    : (Array.isArray(pendingInputs) ? pendingInputs.length : 0);
  const lastAcknowledgedSeq = acknowledgedSeq === undefined
    ? (state.lastAcknowledgedSeq ?? null)
    : (Number.isFinite(Number(acknowledgedSeq)) ? Number(acknowledgedSeq) : null);

  return {
    state: {
      ...base,
      authority,
      brain: brain ? movementBrain(brain) : state.brain,
      inputConfig: inputConfig || state.inputConfig || MOVEMENT_INPUT,
      worldScale: finite(worldScale, state.worldScale || WORLD_SCALE),
      maxExtrapolationSeconds: Math.max(0, finite(maxExtrapolationSeconds,
        state.maxExtrapolationSeconds || LOCAL_PLAYER_RECONCILIATION.maxExtrapolationSeconds)),
      pendingInputCount,
      lastAcknowledgedSeq,
      correctionDistance: distance,
      correctionVelocity: velocityDistance,
      lastMode: hardReset ? 'hard-reset' : 'rebase',
    },
    hardReset,
  };
}

/** Advance only the local presentation; authority remains the source of truth. */
export function advanceLocalPlayerReconciliation(state, {
  dt = 0,
  now = 0,
  input = {},
  pendingInputs,
  acknowledgedSeq,
} = {}) {
  if (!state.authority) return { state, hardReset: false };
  const stepDt = Math.max(0, Math.min(1 / 30, finite(dt)));
  const pendingInputCount = pendingInputs === undefined
    ? (state.pendingInputCount || 0)
    : (Array.isArray(pendingInputs) ? pendingInputs.length : 0);
  const lastAcknowledgedSeq = acknowledgedSeq === undefined
    ? (state.lastAcknowledgedSeq ?? null)
    : (Number.isFinite(Number(acknowledgedSeq)) ? Number(acknowledgedSeq) : null);
  const pendingMovement = latestUnacknowledgedMovement(pendingInputs, lastAcknowledgedSeq);
  const predictionInput = pendingMovement?.input || normalizeMovementInput(input);
  const predicted = predictionFromAuthority({
    ...state,
    wx: state.wx,
    wy: state.wy,
    vx: state.vx,
    vy: state.vy,
    deltaV: state.deltaV,
    deltaVMax: state.deltaVMax,
    deltaVRegen: state.deltaVRegen,
    deltaVRegenBoost: state.deltaVRegenBoost,
    deltaVBurnEff: state.deltaVBurnEff,
    deltaVBurnRate: state.deltaVBurnRate,
    heat: state.heat,
    heatRatio: state.heatRatio,
    overheatRemaining: state.overheatRemaining,
    timeSinceThrust: state.timeSinceThrust,
  });
  predicted.brain = state.brain;
  predicted.inputConfig = state.inputConfig || MOVEMENT_INPUT;
  stepPlayerMovementCore(predicted, predictionInput, stepDt, {
    brain: predicted.brain,
    inputConfig: predicted.inputConfig,
    flowSample: { current: { x: 0, y: 0 } },
    externalAcceleration: forceAcceleration(state.authority.forceLedger),
    worldScale: state.worldScale || WORLD_SCALE,
  });

  const target = extrapolatedAuthority(
    state.authority,
    now,
    state.maxExtrapolationSeconds ?? LOCAL_PLAYER_RECONCILIATION.maxExtrapolationSeconds,
  );
  const [dx, dy] = worldDisplacement(predicted.wx, predicted.wy, target.wx, target.wy);
  const distance = Math.hypot(dx, dy);
  const velocityDistance = Math.hypot(predicted.vx - target.vx, predicted.vy - target.vy);
  if (distance > LOCAL_PLAYER_RECONCILIATION.hardSnapDistanceWorld
    || velocityDistance > LOCAL_PLAYER_RECONCILIATION.hardSnapVelocityDeltaWorld) {
    return {
      state: {
        ...state,
        ...predictionFromAuthority({ ...state.authority, ...target }),
        correctionDistance: distance,
        correctionVelocity: velocityDistance,
        pendingInputCount,
        lastAcknowledgedSeq,
        predictionInputSource: pendingMovement ? 'pending' : 'current',
        predictionInputSeq: pendingMovement?.seq ?? null,
        lastMode: 'hard-reset',
      },
      hardReset: true,
    };
  }

  const positionBlend = blendFactor(stepDt, LOCAL_PLAYER_RECONCILIATION.positionCorrectionHalfLifeSeconds);
  const velocityBlend = blendFactor(stepDt, LOCAL_PLAYER_RECONCILIATION.velocityCorrectionHalfLifeSeconds);
  return {
    state: {
      ...state,
      wx: wrapWorld(predicted.wx + dx * positionBlend),
      wy: wrapWorld(predicted.wy + dy * positionBlend),
      vx: predicted.vx + (target.vx - predicted.vx) * velocityBlend,
      vy: predicted.vy + (target.vy - predicted.vy) * velocityBlend,
      deltaV: predicted.deltaV,
      deltaVMax: predicted.deltaVMax,
      deltaVRegen: predicted.deltaVRegen,
      deltaVRegenBoost: predicted.deltaVRegenBoost,
      deltaVBurnEff: predicted.deltaVBurnEff,
      deltaVBurnRate: predicted.deltaVBurnRate,
      heat: predicted.heat,
      heatRatio: predicted.heatRatio,
      overheatRemaining: predicted.overheatRemaining,
      timeSinceThrust: predicted.timeSinceThrust,
      correctionDistance: distance,
      correctionVelocity: velocityDistance,
      pendingInputCount,
      lastAcknowledgedSeq,
      predictionInputSource: pendingMovement ? 'pending' : 'current',
      predictionInputSeq: pendingMovement?.seq ?? null,
      lastMode: 'blend',
    },
    hardReset: false,
  };
}
