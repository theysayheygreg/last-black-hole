const { TestRunner, assert } = require('./helpers.cjs');
const { Ship } = require('../src/ship.js');
const { BRAIN_DEFAULTS } = require('../scripts/player-brain.cjs');
const { stepPlayerMovementCore } = require('../scripts/sim/player-movement-step.cjs');

const DT = 1 / 15;
const FLOW = { current: { x: 0, y: 0 } };
const INPUT = { moveX: 1, moveY: 0, thrust: 1, brake: 0 };

function makeAuthorityPlayer() {
  return {
    wx: 1,
    wy: 1,
    vx: 0,
    vy: 0,
    brain: { ...BRAIN_DEFAULTS },
    deltaV: 1,
    deltaVMax: BRAIN_DEFAULTS.deltaVMax,
    deltaVRegen: BRAIN_DEFAULTS.deltaVRegen,
    deltaVRegenBoost: BRAIN_DEFAULTS.deltaVRegenBoost,
    deltaVBurnEff: BRAIN_DEFAULTS.deltaVBurnEff,
    deltaVBurnRate: BRAIN_DEFAULTS.deltaVBurnRate,
    timeSinceThrust: 0,
    deltaVRecovering: false,
  };
}

function makeLocalShip() {
  const ship = new Ship(1200, 800);
  ship.wx = 1;
  ship.wy = 1;
  ship.deltaV = 1;
  ship.deltaVMax = BRAIN_DEFAULTS.deltaVMax;
  ship.deltaVRegen = BRAIN_DEFAULTS.deltaVRegen;
  ship.deltaVRegenBoost = BRAIN_DEFAULTS.deltaVRegenBoost;
  ship.deltaVBurnEff = BRAIN_DEFAULTS.deltaVBurnEff;
  ship.deltaVBurnRate = BRAIN_DEFAULTS.deltaVBurnRate;
  ship.timeSinceThrust = 0;
  ship.deltaVRecovering = false;
  ship.thrustScale = BRAIN_DEFAULTS.thrustScale;
  ship.dragScale = BRAIN_DEFAULTS.dragScale;
  ship.currentCoupling = BRAIN_DEFAULTS.currentCoupling;
  ship.setMoveIntent(1, 0);
  ship.setThrustIntensity(1);
  ship.setBrakeIntensity(0);
  return ship;
}

function assertClose(label, actual, expected) {
  assert(Math.abs(actual - expected) <= 1e-12,
    `${label}: expected ${expected}, got ${actual}`);
}

async function run() {
  const runner = new TestRunner('FuelRecovery');

  await runner.run('depleted thrust recovers into usable authority and local thrust', async () => {
    const authority = makeAuthorityPlayer();
    const local = makeLocalShip();
    let sawRecovery = false;
    let sawUsableThrust = false;

    for (let tick = 0; tick < 180; tick += 1) {
      local.update(DT, { sample: () => FLOW.current }, null, null);
      const authorityStep = stepPlayerMovementCore(authority, INPUT, DT, {
        worldScale: 3,
        flowSample: FLOW,
      });

      assertClose(`tick ${tick} wx`, local.wx, authority.wx);
      assertClose(`tick ${tick} wy`, local.wy, authority.wy);
      assertClose(`tick ${tick} vx`, local.vx, authority.vx);
      assertClose(`tick ${tick} vy`, local.vy, authority.vy);
      assertClose(`tick ${tick} deltaV`, local.deltaV, authority.deltaV);
      assertClose(`tick ${tick} timeSinceThrust`, local.timeSinceThrust, authority.timeSinceThrust);
      assertClose(`tick ${tick} delivered thrust`, local.lastDeliveredThrustIntensity, authorityStep.thrustIntensity);

      sawRecovery ||= authority.deltaVRecovering === true;
      sawUsableThrust ||= authorityStep.thrustIntensity > 0.99;
    }

    assert(sawRecovery, 'Expected the authority to enter fuel recovery after depletion');
    assert(sawUsableThrust, 'Expected held thrust to become usable again after recovery');
    assert(authority.deltaV > 0, 'Expected recovery to leave the player with a live fuel reserve');
    assert(local.deltaV > 0, 'Expected the local presentation model to mirror recovered fuel');
  });

  const passed = runner.summary();
  process.exit(passed ? 0 : 1);
}

run().catch((error) => {
  console.error(error.stack || error.message);
  process.exit(1);
});
