const { TestRunner, assert } = require("./helpers.cjs");
const { BRAIN_DEFAULTS } = require("../scripts/player-brain.cjs");
const { stepPlayerMovementCore } = require("../scripts/sim/player-movement-step.cjs");

const EPSILON = 1e-9;

function makePlayer(overrides = {}) {
  const brain = { ...BRAIN_DEFAULTS, ...(overrides.brain || {}) };
  return {
    wx: overrides.wx ?? 1,
    wy: overrides.wy ?? 1,
    vx: overrides.vx ?? 0,
    vy: overrides.vy ?? 0,
    brain,
    deltaV: overrides.deltaV ?? brain.deltaVMax,
    deltaVMax: brain.deltaVMax,
    deltaVRegen: brain.deltaVRegen,
    deltaVRegenBoost: brain.deltaVRegenBoost,
    deltaVBurnEff: brain.deltaVBurnEff,
    deltaVBurnRate: brain.deltaVBurnRate,
    timeSinceThrust: overrides.timeSinceThrust ?? 0,
  };
}

function runMovementCase(fixture) {
  const player = makePlayer(fixture.player);
  let lastStep = null;
  for (let tick = 0; tick < fixture.ticks; tick += 1) {
    lastStep = stepPlayerMovementCore(player, fixture.input, fixture.dt || 1 / 15, {
      worldScale: fixture.worldScale || 4,
      flowSample: fixture.flowSample || { current: { x: 0, y: 0 } },
      burnModifiers: fixture.burnModifiers,
      controlMult: fixture.controlMult,
    });
  }
  return { player, lastStep };
}

function assertClose(label, actual, expected, epsilon = EPSILON) {
  assert(
    Math.abs(actual - expected) <= epsilon,
    `${label}: expected ${expected}, got ${actual}`,
  );
}

function assertMovementFixture(fixture) {
  const result = runMovementCase(fixture);
  for (const [key, expected] of Object.entries(fixture.expected.player)) {
    assertClose(`${fixture.name}.player.${key}`, result.player[key], expected, fixture.epsilon || EPSILON);
  }
  for (const [key, expected] of Object.entries(fixture.expected.lastStep || {})) {
    assertClose(`${fixture.name}.lastStep.${key}`, result.lastStep[key], expected, fixture.epsilon || EPSILON);
  }
}

async function run() {
  const runner = new TestRunner("MovementGolden");

  const fixtures = [
    {
      name: "straight thrust without flow",
      ticks: 30,
      input: { moveX: 1, moveY: 0, thrust: 1, brake: 0 },
      expected: {
        player: {
          wx: 2.6966773838815232,
          wy: 1,
          vx: 1.062989722430562,
          vy: 0,
          deltaV: 76.00000000000009,
          timeSinceThrust: 0,
        },
        lastStep: {
          thrustIntensity: 1,
          brakeIntensity: 0,
          coupling: 0.08,
          dragFactor: 0.941336550625,
        },
      },
    },
    {
      name: "brake spends delta-v",
      ticks: 12,
      player: { wx: 1.5, wy: 1.5, vx: 1.2, vy: 0.1, deltaV: 20 },
      input: { moveX: 1, moveY: 0, thrust: 0, brake: 1 },
      expected: {
        player: {
          wx: 1.716297955169269,
          wy: 1.5354250432078134,
          vx: -0.17146810158636713,
          vy: 0.017798892990821186,
          deltaV: 14.239999999999995,
          timeSinceThrust: 0,
        },
        lastStep: {
          thrustIntensity: 0,
          brakeIntensity: 1,
          coupling: 0.08,
          dragFactor: 0.941336550625,
        },
      },
    },
    {
      name: "flow coupling drift",
      ticks: 20,
      input: { moveX: 0, moveY: 0, thrust: 0, brake: 0 },
      flowSample: { current: { x: 0.4, y: -0.2 } },
      expected: {
        player: {
          wx: 1.208353682003085,
          wy: 0.895823158998458,
          vx: 0.2121833688188301,
          vy: -0.10609168440941505,
          deltaV: 100,
          timeSinceThrust: 1.3333333333333333,
        },
        lastStep: {
          thrustIntensity: 0,
          brakeIntensity: 0,
          coupling: 0.08,
          dragFactor: 0.941336550625,
        },
      },
    },
    {
      name: "speed clamp and world wrap",
      ticks: 1,
      player: { wx: 3.96, wy: 0.04, vx: 9, vy: -9, deltaV: 0 },
      input: { moveX: 0, moveY: 0, thrust: 0, brake: 0 },
      expected: {
        player: {
          wx: 0.33712361663282486,
          wy: 3.6628763833671747,
          vx: 5.65685424949238,
          vy: -5.65685424949238,
          deltaV: 0.1,
          timeSinceThrust: 0.06666666666666667,
        },
        lastStep: {
          thrustIntensity: 0,
          brakeIntensity: 0,
          coupling: 0.08,
          dragFactor: 0.941336550625,
        },
      },
    },
    {
      name: "non-default brain coefficients",
      ticks: 18,
      player: {
        deltaV: 50,
        brain: {
          thrustScale: 1.35,
          currentCoupling: 0.55,
          dragScale: 1.25,
          deltaVMax: 80,
          deltaVRegen: 2,
          deltaVRegenBoost: 7,
          deltaVBurnEff: 0.85,
          deltaVBurnRate: 10,
        },
      },
      input: { moveX: 0.6, moveY: 0.8, thrust: 0.75, brake: 0.25 },
      flowSample: { current: { x: -0.25, y: 0.15 } },
      controlMult: 0.7,
      expected: {
        player: {
          wx: 1.2852377576879395,
          wy: 1.5085458226441633,
          vx: 0.3417809822511705,
          vy: 0.6093558307003955,
          deltaV: 40.820000000000036,
          timeSinceThrust: 0,
        },
        lastStep: {
          thrustIntensity: 0.75,
          brakeIntensity: 0.25,
          coupling: 0.044000000000000004,
          dragFactor: 0.9270831314086913,
        },
      },
    },
  ];

  for (const fixture of fixtures) {
    await runner.run(fixture.name, async () => assertMovementFixture(fixture));
  }

  const allPassed = runner.summary();
  process.exit(allPassed ? 0 : 1);
}

run().catch((err) => {
  console.error("MovementGolden test fatal error:", err.message);
  process.exit(1);
});
