const { TestRunner, assert } = require("./helpers.cjs");
const {
  buildCoarseFlowField,
  sampleCoarseFlowField,
} = require("../scripts/coarse-flow-field.cjs");

async function run() {
  const runner = new TestRunner("CoarseField");

  await runner.run("Well field carries orbital current and inward gravity", async () => {
    const field = buildCoarseFlowField({
      worldScale: 3,
      cellSize: 0.25,
      wells: [{ wx: 1.5, wy: 1.5, mass: 1.2, orbitalDir: 1, killRadius: 0.08, ringOuter: 0.3 }],
      waveRings: [],
    });
    const sample = sampleCoarseFlowField(field, 1.9, 1.5);
    const hazardSample = sampleCoarseFlowField(field, 1.72, 1.5);
    assert(sample.current && sample.gravity && sample.wave, "Expected nested FlowSample vectors");
    assert(sample.x === sample.current.x && sample.y === sample.current.y, "Expected x/y aliases to mirror current");
    assert(Math.abs(sample.currentY) > 0.01, `Expected orbital current near well, got ${sample.currentY}`);
    assert(sample.gravityX < -0.01, `Expected inward gravity toward well, got ${sample.gravityX}`);
    assert(hazardSample.hazard > 0, `Expected non-zero hazard in well band, got ${hazardSample.hazard}`);
    assert(hazardSample.signalShadow > 0, `Expected signal shadow in well band, got ${hazardSample.signalShadow}`);
  });

  await runner.run("Well current fades out before open space", async () => {
    const field = buildCoarseFlowField({
      worldScale: 5,
      cellSize: 0.25,
      wells: [{ wx: 2.5, wy: 2.5, mass: 1.2, orbitalDir: 1, killRadius: 0.08, ringOuter: 0.3 }],
      waveRings: [],
    });
    const sample = sampleCoarseFlowField(field, 0.5, 2.5);
    assert(Math.abs(sample.current.x) < 1e-9 && Math.abs(sample.current.y) < 1e-9,
      `Expected no coarse current outside well range, got (${sample.current.x}, ${sample.current.y})`);
    assert(Math.abs(sample.gravity.x) < 1e-9 && Math.abs(sample.gravity.y) < 1e-9,
      `Expected no coarse gravity outside well range, got (${sample.gravity.x}, ${sample.gravity.y})`);
  });

  await runner.run("Wave rings project outward band force", async () => {
    const field = buildCoarseFlowField({
      worldScale: 3,
      cellSize: 0.2,
      wells: [],
      waveRings: [{ sourceWX: 1.5, sourceWY: 1.5, radius: 0.4, amplitude: 0.8 }],
    });
    const sample = sampleCoarseFlowField(field, 1.9, 1.5);
    assert(sample.waveX > 0.01, `Expected outward wave force on +X side, got ${sample.waveX}`);
    assert(sample.wave.x === sample.waveX, "Expected nested wave vector to mirror legacy flat fields");
    assert(sample.surf > 0, `Expected surf semantic channel on wavefront, got ${sample.surf}`);
  });

  const allPassed = runner.summary();
  process.exit(allPassed ? 0 : 1);
}

run().catch((err) => {
  console.error("CoarseField test fatal error:", err.message);
  process.exit(1);
});
