const assert = require('assert');
const {
  FORCE_COMPONENTS,
  beginForceLedger,
  finalizeForceLedger,
  recordForceMutation,
} = require('../scripts/sim/force-ledger.cjs');
const {
  applyPlayerBrakeAndIntegrate,
  applyPlayerDriveAndFlow,
} = require('../scripts/sim/player-movement-step.cjs');

let passed = 0;

function test(name, fn) {
  fn();
  passed += 1;
  console.log(`  PASS ${name}`);
}

function close(actual, expected, label) {
  assert(Math.abs(actual - expected) < 1e-9, `${label}: expected ${expected}, got ${actual}`);
}

test('authoritative ledger emits all six labeled vectors in m/s^2', () => {
  const player = { vx: 0, vy: 0 };
  const ledger = beginForceLedger(player, 0.1, 7);
  recordForceMutation(ledger, 'thrust', player, () => { player.vx += 0.25; });
  player.vy += 0.1;
  const result = finalizeForceLedger(ledger, player);
  assert.deepStrictEqual(Object.keys(result.vectors), FORCE_COMPONENTS);
  assert.strictEqual(result.unit, 'm/s^2');
  close(result.vectors.thrust.x, 2500, 'thrust acceleration');
  close(result.vectors.impulse.y, 1000, 'residual impulse acceleration');
});

test('component vectors exactly reconstruct authoritative tick delta-v', () => {
  const player = { vx: 1, vy: -0.5 };
  const ledger = beginForceLedger(player, 0.2, 8);
  recordForceMutation(ledger, 'gravity', player, () => { player.vx -= 0.1; player.vy += 0.3; });
  recordForceMutation(ledger, 'wave', player, () => { player.vx += 0.2; });
  const result = finalizeForceLedger(ledger, player);
  const sum = FORCE_COMPONENTS.reduce((total, name) => ({
    x: total.x + result.vectors[name].x,
    y: total.y + result.vectors[name].y,
  }), { x: 0, y: 0 });
  close(sum.x, result.total.x, 'total x');
  close(sum.y, result.total.y, 'total y');
});

test('shared movement step reports thrust, coupling, brake, and drag without changing order', () => {
  const player = {
    vx: 0.4, vy: -0.2, wx: 1, wy: 1,
    deltaV: 100, deltaVMax: 100, deltaVBurnRate: 12, deltaVBurnEff: 1,
    deltaVRegen: 1.5, deltaVRegenBoost: 6, timeSinceThrust: 0,
  };
  const brain = { thrustScale: 1, currentCoupling: 1, dragScale: 1 };
  const beforeDrive = { x: player.vx, y: player.vy };
  const drive = applyPlayerDriveAndFlow(player, { moveX: 1, moveY: 0, thrust: 1 }, 0.1, {
    brain,
    flowSample: { current: { x: -0.1, y: 0.3 } },
  });
  close(drive.thrustDeltaV.x + drive.couplingDeltaV.x, player.vx - beforeDrive.x, 'drive x');
  close(drive.thrustDeltaV.y + drive.couplingDeltaV.y, player.vy - beforeDrive.y, 'drive y');

  const beforeBrake = { x: player.vx, y: player.vy };
  const brake = applyPlayerBrakeAndIntegrate(player, { moveX: 1, moveY: 0, brake: 1 }, 0.1, {
    brain, thrustIntensity: drive.thrustIntensity, worldScale: 3,
  });
  close(brake.thrustDeltaV.x + brake.dragDeltaV.x, player.vx - beforeBrake.x, 'brake/drag x');
  close(brake.thrustDeltaV.y + brake.dragDeltaV.y, player.vy - beforeBrake.y, 'brake/drag y');
});

console.log(`ForceLedger: ${passed}/3 passed`);
