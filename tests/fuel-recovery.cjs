const { TestRunner, assert } = require('./helpers.cjs');
const { Ship } = require('../src/ship.js');
const { createPlayerBrain } = require('../scripts/player-brain.cjs');
const { stepPlayerMovementCore } = require('../scripts/sim/player-movement-step.cjs');

const DT = 1 / 15;
const FLOW = { current: { x: 0, y: 0 } };
const INPUT = { moveX: 1, moveY: 0, thrust: 1, brake: 0 };
// Independent expected-state oracle. These are the pre-tune hull values,
// doubled here rather than read from a movement helper or manifest.
const REGEN_ITEM_MULT = 1.25;
const FUEL_FIXTURES = Object.freeze([
  { hullType: 'drifter', max: 60, burnEff: 0.55, oldRegen: 1.5, oldBoost: 6 },
  { hullType: 'breacher', max: 200, burnEff: 1.6, oldRegen: 1, oldBoost: 4 },
  { hullType: 'resonant', max: 100, burnEff: 1, oldRegen: 1.5, oldBoost: 6 },
  { hullType: 'shroud', max: 80, burnEff: 0.85, oldRegen: 2, oldBoost: 7 },
  { hullType: 'hauler', max: 130, burnEff: 1.1, oldRegen: 1.2, oldBoost: 5 },
]);
const REGEN_DELAY = 0.5;
const BURN_RATE = 12;

function expectedFuelFor(fixture) {
  return {
    initial: 1,
    max: fixture.max,
    burnRate: BURN_RATE,
    burnEff: fixture.burnEff,
    regen: fixture.oldRegen * 2 * REGEN_ITEM_MULT,
    regenBoost: fixture.oldBoost * 2 * REGEN_ITEM_MULT,
    regenDelay: REGEN_DELAY,
  };
}

function stepExpectedFuel(state, fuel) {
  const burnCost = fuel.burnRate * fuel.burnEff * INPUT.thrust * DT;
  let deliveredThrust = 0;
  let deltaVRecovering = state.deltaVRecovering;
  let deltaV = state.deltaV;

  if (deltaV >= burnCost) {
    deltaV -= burnCost;
    deltaVRecovering = deltaV <= 0;
    deliveredThrust = INPUT.thrust;
  } else {
    deltaVRecovering = true;
  }

  let timeSinceThrust = state.timeSinceThrust;
  if (deliveredThrust > 0.01) {
    timeSinceThrust = 0;
  } else {
    timeSinceThrust += DT;
    const boost = timeSinceThrust >= fuel.regenDelay ? fuel.regenBoost : 0;
    deltaV = Math.min(fuel.max, deltaV + (fuel.regen + boost) * DT);
  }

  return { deltaV, timeSinceThrust, deltaVRecovering, deliveredThrust };
}

function makeAuthorityPlayer(brain) {
  return {
    wx: 1,
    wy: 1,
    vx: 0,
    vy: 0,
    brain,
    deltaV: 1,
    deltaVMax: brain.deltaVMax,
    deltaVRegen: brain.deltaVRegen,
    deltaVRegenBoost: brain.deltaVRegenBoost,
    deltaVBurnEff: brain.deltaVBurnEff,
    deltaVBurnRate: brain.deltaVBurnRate,
    timeSinceThrust: 0,
    deltaVRecovering: false,
  };
}

function makeLocalShip(brain) {
  const ship = new Ship(1200, 800);
  ship.wx = 1;
  ship.wy = 1;
  ship.deltaV = 1;
  ship.deltaVMax = brain.deltaVMax;
  ship.deltaVRegen = brain.deltaVRegen;
  ship.deltaVRegenBoost = brain.deltaVRegenBoost;
  ship.deltaVBurnEff = brain.deltaVBurnEff;
  ship.deltaVBurnRate = brain.deltaVBurnRate;
  ship.timeSinceThrust = 0;
  ship.deltaVRecovering = false;
  ship.thrustScale = brain.thrustScale;
  ship.dragScale = brain.dragScale;
  ship.currentCoupling = brain.currentCoupling;
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

  await runner.run('all hulls recover delta-v at exactly 2x, including item multipliers', async () => {
    for (const fixture of FUEL_FIXTURES) {
      const fuel = expectedFuelFor(fixture);
      const brain = createPlayerBrain({
        hullType: fixture.hullType,
        equipped: [{ coefficients: { deltaVRegenMult: REGEN_ITEM_MULT } }],
      });
      const authority = makeAuthorityPlayer(brain);
      const local = makeLocalShip(brain);
      let expected = {
        deltaV: fuel.initial,
        timeSinceThrust: 0,
        deltaVRecovering: false,
        deliveredThrust: 0,
      };
      let recoveryTick = null;
      let usableAfterRecoveryTick = null;

      assertClose(`${fixture.hullType} capacity`, brain.deltaVMax, fuel.max);
      assertClose(`${fixture.hullType} burn rate`, brain.deltaVBurnRate, fuel.burnRate);
      assertClose(`${fixture.hullType} burn efficiency`, brain.deltaVBurnEff, fuel.burnEff);
      assertClose(`${fixture.hullType} ambient regen`, brain.deltaVRegen, fuel.regen);
      assertClose(`${fixture.hullType} delayed boost`, brain.deltaVRegenBoost, fuel.regenBoost);

      for (let tick = 0; tick < 180; tick += 1) {
        local.update(DT, { sample: () => FLOW.current }, null, null);
        const authorityStep = stepPlayerMovementCore(authority, INPUT, DT, {
          worldScale: 3,
          flowSample: FLOW,
        });
        expected = stepExpectedFuel(expected, fuel);

        assertClose(`${fixture.hullType} tick ${tick} deltaV`, local.deltaV, authority.deltaV);
        assertClose(`${fixture.hullType} tick ${tick} oracle authority deltaV`, authority.deltaV, expected.deltaV);
        assertClose(`${fixture.hullType} tick ${tick} oracle local deltaV`, local.deltaV, expected.deltaV);
        assertClose(`${fixture.hullType} tick ${tick} timeSinceThrust`, authority.timeSinceThrust, expected.timeSinceThrust);
        assertClose(`${fixture.hullType} tick ${tick} delivered thrust`, authorityStep.thrustIntensity, expected.deliveredThrust);

        if (recoveryTick === null && authority.deltaVRecovering) recoveryTick = tick;
        if (recoveryTick !== null && tick > recoveryTick && authorityStep.thrustIntensity > 0.99) {
          usableAfterRecoveryTick ??= tick;
        }
      }

      assert(recoveryTick !== null && recoveryTick >= 0,
        `${fixture.hullType}: expected recovery onset, got ${recoveryTick}`);
      assert(usableAfterRecoveryTick !== null && usableAfterRecoveryTick > recoveryTick,
        `${fixture.hullType}: expected usable thrust after recovery tick ${recoveryTick}, got ${usableAfterRecoveryTick}`);
    }
  });

  await runner.run('regen caps at the unchanged tank maximum at 15 Hz', async () => {
    for (const fixture of FUEL_FIXTURES) {
      const fuel = expectedFuelFor(fixture);
      const brain = createPlayerBrain({
        hullType: fixture.hullType,
        equipped: [{ coefficients: { deltaVRegenMult: REGEN_ITEM_MULT } }],
      });
      const authority = makeAuthorityPlayer(brain);
      authority.deltaV = fuel.max - ((fuel.regen + fuel.regenBoost) * DT / 2);
      authority.timeSinceThrust = REGEN_DELAY;
      stepPlayerMovementCore(authority, { moveX: 0, moveY: 0, thrust: 0, brake: 0 }, DT, {
        worldScale: 3,
        flowSample: FLOW,
      });
      assertClose(`${fixture.hullType} capped delta-v`, authority.deltaV, fuel.max);
    }
  });

  const passed = runner.summary();
  process.exit(passed ? 0 : 1);
}

run().catch((error) => {
  console.error(error.stack || error.message);
  process.exit(1);
});
