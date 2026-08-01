const assert = require('assert');
const fs = require('fs');
const path = require('path');
const {
  applyPlayerBrakeAndIntegrate,
  applyPlayerDriveAndFlow,
  stepPlayerFreeMovement,
} = require('../scripts/sim/player-movement-step.cjs');

const ROOT = path.resolve(__dirname, '..');

function close(actual, expected, label) {
  assert(Math.abs(actual - expected) < 1e-9, `${label}: expected ${expected}, got ${actual}`);
}

function makePlayer() {
  return {
    wx: 1,
    wy: 1,
    vx: 0.2,
    vy: -0.1,
    brain: { thrustScale: 1, currentCoupling: 1, dragScale: 1 },
    deltaV: 100,
    deltaVMax: 100,
    deltaVBurnRate: 12,
    deltaVBurnEff: 1,
    deltaVRegen: 1.5,
    deltaVRegenBoost: 6,
    timeSinceThrust: 0,
  };
}

{
  const input = { moveX: 0.8, moveY: -0.4, thrust: 0.7, brake: 0.25 };
  const options = {
    worldScale: 5,
    flowSample: { current: { x: -0.2, y: 0.3 } },
    environmentAcceleration: {
      gravity: { x: 0.4, y: -0.3 },
      wave: { x: -0.1, y: 0.2 },
    },
  };
  const unified = makePlayer();
  const reference = makePlayer();
  const step = stepPlayerFreeMovement(unified, input, 0.1, options);

  // Frozen reference is the previous FREE order: drive/current, gravity,
  // wave, brake/drag/cap, then position integration.
  const drive = applyPlayerDriveAndFlow(reference, input, 0.1, options);
  reference.vx += options.environmentAcceleration.gravity.x * 0.1;
  reference.vy += options.environmentAcceleration.gravity.y * 0.1;
  reference.vx += options.environmentAcceleration.wave.x * 0.1;
  reference.vy += options.environmentAcceleration.wave.y * 0.1;
  const brake = applyPlayerBrakeAndIntegrate(reference, input, 0.1, {
    ...options,
    thrustIntensity: drive.thrustIntensity,
  });

  for (const key of ['wx', 'wy', 'vx', 'vy', 'heat', 'heatRatio', 'deltaV', 'timeSinceThrust']) {
    close(unified[key], reference[key], `ordered parity ${key}`);
  }
  close(step.thrustDeltaV.x, drive.thrustDeltaV.x + brake.thrustDeltaV.x, 'combined thrust x');
  close(step.thrustDeltaV.y, drive.thrustDeltaV.y + brake.thrustDeltaV.y, 'combined thrust y');
}

{
  const player = makePlayer();
  const before = { x: player.vx, y: player.vy };
  const step = stepPlayerFreeMovement(player, {
    moveX: 1,
    moveY: 0,
    thrust: 1,
    brake: 0,
  }, 0.1, {
    worldScale: 5,
    flowSample: { current: { x: -0.2, y: 0.3 } },
    environmentAcceleration: {
      gravity: { x: 0.4, y: -0.3 },
      wave: { x: -0.1, y: 0.2 },
    },
  });
  assert.strictEqual(step.aborted, false);
  close(step.gravityDeltaV.x, 0.04, 'gravity delta-v x');
  close(step.waveDeltaV.y, 0.02, 'wave delta-v y');
  const reconstructed = {
    x: step.thrustDeltaV.x + step.couplingDeltaV.x + step.gravityDeltaV.x
      + step.waveDeltaV.x + step.dragDeltaV.x,
    y: step.thrustDeltaV.y + step.couplingDeltaV.y + step.gravityDeltaV.y
      + step.waveDeltaV.y + step.dragDeltaV.y,
  };
  close(player.vx - before.x, reconstructed.x, 'complete FREE delta-v x');
  close(player.vy - before.y, reconstructed.y, 'complete FREE delta-v y');
}

{
  const player = makePlayer();
  let velocityAtContact = null;
  const step = stepPlayerFreeMovement(player, { moveX: 1, moveY: 0, thrust: 1 }, 0.1, {
    worldScale: 5,
    flowSample: { current: { x: 0, y: 0 } },
    environmentAcceleration: { gravity: { x: 99, y: 99 }, wave: { x: 99, y: 99 } },
    afterDrive: (movingPlayer) => {
      velocityAtContact = movingPlayer.vx;
      movingPlayer.vx = 0;
      movingPlayer.vy = 0;
      return false;
    },
  });
  assert(velocityAtContact > 0.2, 'contact gate must run after authored drive/current');
  assert.strictEqual(step.aborted, true);
  assert.deepStrictEqual({ x: player.vx, y: player.vy }, { x: 0, y: 0 });
  assert.deepStrictEqual(step.gravityDeltaV, { x: 0, y: 0 });
  assert.deepStrictEqual(step.waveDeltaV, { x: 0, y: 0 });
}

const runtimeSource = fs.readFileSync(path.join(ROOT, 'scripts/sim-runtime.cjs'), 'utf8');
const freeStart = runtimeSource.indexOf('function tickAuthorityPlayers');
const freeEnd = runtimeSource.indexOf('\nfunction tickSim', freeStart);
const freeSource = runtimeSource.slice(freeStart, freeEnd);
assert.strictEqual((freeSource.match(/estimateFlowSample\(/g) || []).length, 1,
  'FREE authority movement must sample the fabric exactly once per player tick');
assert.strictEqual((freeSource.match(/stepPlayerFreeMovement\(/g) || []).length, 1,
  'FREE authority movement must have one ordered step owner');
for (const retired of ['applyWellGravity(', 'applyStarPush(', 'applyPlanetoidPush(', 'applyWaveRingPush(']) {
  assert(!runtimeSource.includes(retired), `retired split force mutator remains: ${retired}`);
}

console.log('FreeMovementStep: one fabric sample and one ordered FREE step PASS');
