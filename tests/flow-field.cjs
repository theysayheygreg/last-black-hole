const { TestRunner, assert } = require("./helpers.cjs");
const { FABRIC } = require("../src/content/fabric.js");

async function run() {
  const runner = new TestRunner("FlowField");
  const { FlowField } = await import("../src/sim/flow-field.js");

  await runner.run("Local well sample separates orbital current from gravity", async () => {
    const field = new FlowField(null, {
      wellSystem: {
        wells: [{ wx: 1.5, wy: 1.5, mass: 1.2, orbitalDir: 1, killRadius: 0.08 }],
      },
      starSystem: { stars: [] },
      waveRings: { rings: [] },
    });

    const sample = field.sample(1.9, 1.5);
    assert(Math.abs(sample.current.y) > 0.01, `Expected orbital current, got ${sample.current.y}`);
    assert(Math.abs(sample.current.x) < 1e-6, `Current should not contain radial well pull, got ${sample.current.x}`);
    assert(sample.gravity.x < -0.01, `Expected inward gravity as separate channel, got ${sample.gravity.x}`);
    assert(Math.abs(sample.gravity.y) < 1e-6, `Gravity Y should be near zero on the east axis, got ${sample.gravity.y}`);
  });

  await runner.run("Broad local current remains a finite authored profile", async () => {
    const field = new FlowField(null, {
      wellSystem: {
        wells: [{ wx: 1.5, wy: 1.5, mass: 1.2, orbitalDir: 1, killRadius: 0.08 }],
      },
      starSystem: { stars: [] },
      waveRings: { rings: [] },
    });

    const sample = field.sample(2.95, 1.5);
    assert(Number.isFinite(sample.current.x) && Number.isFinite(sample.current.y),
      `Expected finite broad current, got (${sample.current.x}, ${sample.current.y})`);
    assert(Math.abs(sample.gravity.x) < 1e-9 && Math.abs(sample.gravity.y) < 1e-9,
      `Expected calm void gravity outside well range, got (${sample.gravity.x}, ${sample.gravity.y})`);
  });

  await runner.run("reach growth preserves local gravity and current strength at the same envelope ratio", async () => {
    const sampleAtRatio = (well, ratio) => {
      const reach = well.reachMultiplier;
      const fullRadius = FABRIC.wellGravity.fullGravityRadius * reach;
      const falloffEndRadius = (FABRIC.wellGravity.falloffEndRadius ?? 1.2) * reach;
      const distance = fullRadius + (falloffEndRadius - fullRadius) * ratio;
      const field = new FlowField(null, {
        wellSystem: { wells: [well] },
        starSystem: { stars: [] },
        waveRings: { rings: [] },
      });
      return field.sample(1.5, 1.5 + distance);
    };
    const base = sampleAtRatio({
      wx: 1.5, wy: 1.5, mass: 1.2, baseMass: 1.2, reachMultiplier: 1,
      orbitalDir: 1, killRadius: 0.08,
    }, 0.5);
    const grown = sampleAtRatio({
      wx: 1.5, wy: 1.5, mass: 1.6, baseMass: 1.2, reachMultiplier: 1.2,
      orbitalDir: 1, killRadius: 0.08,
    }, 0.5);
    assert(Math.abs(base.gravity.y - grown.gravity.y) < 1e-12,
      `Expected fixed-ratio gravity strength, got ${base.gravity.y} vs ${grown.gravity.y}`);
    assert(Math.abs(base.current.x - grown.current.x) < 1e-12,
      `Expected fixed-ratio current strength, got ${base.current.x} vs ${grown.current.x}`);
  });

  await runner.run("Local wave sample stays outside gameplay flow", async () => {
    const field = new FlowField(null, {
      wellSystem: { wells: [] },
      starSystem: { stars: [] },
      waveRings: {
        rings: [{ sourceWX: 1.5, sourceWY: 1.5, radius: 0.4, amplitude: 0.8, alive: true }],
      },
    });

    const sample = field.sample(1.9, 1.5);
    assert(!('wave' in sample), 'Retired local wave channel must be absent');
    assert(Math.abs(sample.current.x) < 1e-9 && Math.abs(sample.current.y) < 1e-9,
      `Wave force should not be mixed into current, got (${sample.current.x}, ${sample.current.y})`);
  });

  await runner.run("Local star sample reports hazard without hidden current", async () => {
    const field = new FlowField(null, {
      wellSystem: { wells: [] },
      starSystem: {
        stars: [{ wx: 1.5, wy: 1.5, mass: 1, alive: true, typeDef: { pushMult: 1 } }],
      },
      waveRings: { rings: [] },
    });

    const sample = field.sample(1.7, 1.5);
    assert(sample.hazard > 0, `Expected star hazard/readability channel, got ${sample.hazard}`);
    assert(Math.abs(sample.current.x) < 1e-9 && Math.abs(sample.current.y) < 1e-9,
      `Star push should stay in explicit ship force path, got current (${sample.current.x}, ${sample.current.y})`);
  });

  const allPassed = runner.summary();
  process.exit(allPassed ? 0 : 1);
}

run().catch((err) => {
  console.error("FlowField test fatal error:", err.message);
  process.exit(1);
});
