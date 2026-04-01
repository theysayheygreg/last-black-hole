const { TestRunner, assert } = require("./helpers");
const {
  buildCoarseFlowField,
  sampleCoarseFlowField,
} = require("../scripts/coarse-flow-field.js");

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
    assert(Math.abs(sample.currentY) > 0.01, `Expected orbital current near well, got ${sample.currentY}`);
    assert(sample.gravityX < -0.01, `Expected inward gravity toward well, got ${sample.gravityX}`);
    assert(hazardSample.hazard > 0, `Expected non-zero hazard in well band, got ${hazardSample.hazard}`);
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
  });

  const allPassed = runner.summary();
  process.exit(allPassed ? 0 : 1);
}

run().catch((err) => {
  console.error("CoarseField test fatal error:", err.message);
  process.exit(1);
});
