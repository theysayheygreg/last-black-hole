const { TestRunner, assert } = require('./helpers.cjs');
const { Ship } = require('../src/ship.js');
const { BRAIN_DEFAULTS } = require('../scripts/player-brain.cjs');
const { stepPlayerMovementCore } = require('../scripts/sim/player-movement-step.cjs');

const EPSILON = 1e-12;
const DT = 1 / 30;
const FLOW = { current: { x: 0, y: 0 } };
const INITIAL_HEAT_RATIO = 0.2;

const INPUTS = [
  { moveX: 0.6, moveY: 0.8, thrust: 1, brake: 0 },
  { moveX: 0.6, moveY: 0.8, thrust: 0.75, brake: 0 },
  { moveX: -0.8, moveY: 0.6, thrust: 0, brake: 1 },
  { moveX: -0.8, moveY: 0.6, thrust: 0, brake: 0.6 },
  { moveX: 0, moveY: -1, thrust: 1, brake: 0 },
  { moveX: 0, moveY: -1, thrust: 0, brake: 1 },
];

const BRAIN = {
  ...BRAIN_DEFAULTS,
  thrustScale: 1.25,
  dragScale: 0.9,
  currentCoupling: 1.1,
};

function makeAuthorityPlayer() {
  return {
    wx: 1.25,
    wy: 2.1,
    vx: -0.18,
    vy: 0.23,
    movementFacing: -Math.PI / 2,
    brain: { ...BRAIN },
    heat: INITIAL_HEAT_RATIO,
    heatRatio: INITIAL_HEAT_RATIO,
    deltaV: BRAIN.deltaVMax * (1 - INITIAL_HEAT_RATIO),
    deltaVMax: BRAIN.deltaVMax,
    deltaVRegen: BRAIN.deltaVRegen,
    deltaVRegenBoost: BRAIN.deltaVRegenBoost,
    deltaVBurnEff: BRAIN.deltaVBurnEff,
    deltaVBurnRate: BRAIN.deltaVBurnRate,
    timeSinceThrust: 0,
  };
}

function makeLocalShip() {
  const ship = new Ship(1200, 800);
  ship.wx = 1.25;
  ship.wy = 2.1;
  ship.vx = -0.18;
  ship.vy = 0.23;
  ship.deltaVMax = BRAIN.deltaVMax;
  ship.deltaVRegen = BRAIN.deltaVRegen;
  ship.deltaVRegenBoost = BRAIN.deltaVRegenBoost;
  ship.deltaVBurnEff = BRAIN.deltaVBurnEff;
  ship.deltaVBurnRate = BRAIN.deltaVBurnRate;
  ship.timeSinceThrust = 0;
  ship.thrustScale = BRAIN.thrustScale;
  ship.dragScale = BRAIN.dragScale;
  ship.currentCoupling = BRAIN.currentCoupling;
  ship.setHeatRatio(INITIAL_HEAT_RATIO);
  // The facing is deliberately unrelated to the stick vector below.
  ship.facing = -Math.PI / 2;
  return ship;
}

function assertClose(label, actual, expected) {
  assert(Math.abs(actual - expected) <= EPSILON,
    `${label}: expected ${expected}, got ${actual}`);
}

async function run() {
  const runner = new TestRunner('MovementTrajectoryParity');

  await runner.run('local Ship and authority share the no-gravity trajectory', async () => {
    const local = makeLocalShip();
    const authority = makeAuthorityPlayer();
    const flowField = { sample: () => ({ x: 0, y: 0 }) };

    for (let tick = 0; tick < 24; tick += 1) {
      const input = INPUTS[tick % INPUTS.length];
      local.setMoveIntent(input.moveX, input.moveY);
      local.setThrustIntensity(input.thrust);
      local.setBrakeIntensity(input.brake);
      local.update(DT, flowField, null, null);

      const authorityStep = stepPlayerMovementCore(authority, input, DT, {
        worldScale: 3,
        flowSample: FLOW,
      });

      assertClose(`tick ${tick} wx`, local.wx, authority.wx);
      assertClose(`tick ${tick} wy`, local.wy, authority.wy);
      assertClose(`tick ${tick} vx`, local.vx, authority.vx);
      assertClose(`tick ${tick} vy`, local.vy, authority.vy);
      assertClose(`tick ${tick} Heat`, local.getHeatRatio(), authority.heatRatio);
      assertClose(`tick ${tick} local deltaV alias`, local.deltaV, authority.deltaV);
      assertClose(`tick ${tick} authority Heat/legacy parity`, authority.heatRatio,
        1 - authority.deltaV / authority.deltaVMax);
      assertClose(`tick ${tick} timeSinceThrust`, local.timeSinceThrust, authority.timeSinceThrust);
      assertClose(`tick ${tick} delivered thrust`, local.lastDeliveredThrustIntensity,
        authorityStep.thrustIntensity);
      assertClose(`tick ${tick} delivered brake`, local.lastDeliveredBrakeIntensity,
        authorityStep.brakeIntensity);
    }
  });

  const passed = runner.summary();
  process.exit(passed ? 0 : 1);
}

run().catch((error) => {
  console.error(error.stack || error.message);
  process.exit(1);
});
