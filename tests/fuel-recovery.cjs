const { TestRunner, assert } = require('./helpers.cjs');
const { createPlayerBrain } = require('../scripts/player-brain.cjs');
const { MOVEMENT } = require('../src/content/movement.js');
const {
  stepPlayerMovementCore,
  getHeatRatio,
  heatCoolRates,
  heatGainPerSecond,
} = require('../scripts/sim/player-movement-step.cjs');

const DT = 1 / 15;
const FLOW = { current: { x: 0, y: 0 } };

const HULLS = ['drifter', 'breacher', 'resonant', 'shroud', 'hauler'];

function makePlayer(brain, heatRatio = 0) {
  return {
    wx: 1,
    wy: 1,
    vx: 0,
    vy: 0,
    brain,
    deltaV: brain.deltaVMax * (1 - heatRatio),
    deltaVMax: brain.deltaVMax,
    deltaVRegen: brain.deltaVRegen,
    deltaVRegenBoost: brain.deltaVRegenBoost,
    deltaVBurnEff: brain.deltaVBurnEff,
    deltaVBurnRate: brain.deltaVBurnRate,
    timeSinceThrust: 0,
    deltaVRecovering: false,
    heat: heatRatio,
    heatRatio,
    overheatRemaining: 0,
  };
}

function step(player, input) {
  return stepPlayerMovementCore(player, input, DT, {
    worldScale: 3,
    flowSample: FLOW,
  });
}

function assertClose(label, actual, expected, epsilon = 1e-12) {
  assert(Math.abs(actual - expected) <= epsilon,
    `${label}: expected ${expected}, got ${actual}`);
}

async function run() {
  const runner = new TestRunner('HeatPropulsion');

  await runner.run('canonical heat rates preserve each hull and item burn/cool ratios', async () => {
    assertClose('base gain', MOVEMENT.player.heat.gainPerSecond, 0.12);
    assertClose('base cool', MOVEMENT.player.heat.coolPerSecond, 0.03);
    assertClose('delayed cool', MOVEMENT.player.heat.coolBoostPerSecond, 0.12);
    assertClose('brake heat scale', MOVEMENT.player.heat.brakeScale, 0.6);

    for (const hullType of HULLS) {
      const brain = createPlayerBrain({
        hullType,
        equipped: [{ coefficients: { deltaVRegenMult: 1.25 } }],
      });
      const player = makePlayer(brain);
      const expectedGain = heatGainPerSecond(player) * DT;
      step(player, { moveX: 1, moveY: 0, thrust: 1, brake: 0 });
      assertClose(`${hullType} heat gain`, getHeatRatio(player), expectedGain);
      assert(player.vx > 0, `${hullType} must still deliver thrust while cool`);

      const expectedCool = heatCoolRates(player).base * DT;
      player.timeSinceThrust = 0;
      const heatBeforeCool = getHeatRatio(player);
      step(player, { moveX: 1, moveY: 0, thrust: 0, brake: 0 });
      assertClose(`${hullType} ambient cool`, heatBeforeCool - getHeatRatio(player), expectedCool);
    }
  });

  await runner.run('overheat locks propulsion for 3s, then resets to 25%', async () => {
    const brain = createPlayerBrain({ hullType: 'drifter' });
    const player = makePlayer(brain, 0.999);
    const thrust = step(player, { moveX: 1, moveY: 0, thrust: 1, brake: 0 });
    assert(thrust.thrustIntensity === 1, 'the threshold-crossing sample should still deliver thrust');
    assertClose('overheated ratio', getHeatRatio(player), MOVEMENT.player.heat.overheatThreshold);
    assertClose('lockout duration', player.overheatRemaining, MOVEMENT.player.heat.lockoutSeconds);
    assert(player.deltaVRecovering, 'overheat must gate the private compatibility resource');

    for (let tick = 0; tick < MOVEMENT.player.heat.lockoutSeconds / DT; tick += 1) {
      step(player, { moveX: 1, moveY: 0, thrust: 0, brake: 0 });
    }
    assertClose('reset heat', getHeatRatio(player), MOVEMENT.player.heat.resetRatio);
    assertClose('lockout cleared', player.overheatRemaining, 0);
    assert(!player.deltaVRecovering, 'reset heat must make propulsion available again');
  });

  await runner.run('brake is reverse propulsion at the canonical 60% heat cost', async () => {
    const brain = createPlayerBrain({ hullType: 'drifter' });
    const player = makePlayer(brain);
    const result = step(player, { moveX: 1, moveY: 0, thrust: 0, brake: 1 });
    const expectedHeat = heatGainPerSecond(player, MOVEMENT.player.heat.brakeScale) * DT;
    assertClose('brake heat gain', getHeatRatio(player), expectedHeat);
    assert(result.brakeIntensity === 1, 'brake input must be delivered while cool');
    assert(player.vx < 0, 'brake must remain reverse propulsion');
  });

  const passed = runner.summary();
  process.exit(passed ? 0 : 1);
}

run().catch((error) => {
  console.error(error.stack || error.message);
  process.exit(1);
});
