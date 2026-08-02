const { TestRunner, assert } = require("./helpers.cjs");
const FABRIC = require("../src/content/fabric.data.json");
const { WELL_GRAVITY_PARAMS, wellGravityMagnitude } = require("../scripts/sim/well-gravity.cjs");
const { buildCoarseFlowField, sampleCoarseFlowField } = require("../scripts/coarse-flow-field.cjs");

async function run() {
  const runner = new TestRunner("FabricProfile");

  await runner.run("canonical profile owns the mechanical readability controls", async () => {
    assert(FABRIC.referenceFrame.carryCapFraction === 0.2);
    assert(FABRIC.seededSea.ambientThrustCeiling === FABRIC.referenceFrame.carryCapFraction);
    assert(WELL_GRAVITY_PARAMS.player.fullGravityRadius === FABRIC.wellGravity.fullGravityRadius);
    assert(WELL_GRAVITY_PARAMS.player.falloffEndRadius === FABRIC.wellGravity.falloffEndRadius);
    assert(WELL_GRAVITY_PARAMS.player.minimumGravityFraction === FABRIC.wellGravity.minimumGravityFraction);
    assert(
      Math.abs(FABRIC.wellGravity.falloffEndRadius * FABRIC.wellCurrent.currentReachMultiplier - 1.8) < 1e-9,
      "Expected 1.5x current reach from the canonical falloff end",
    );
    assert(FABRIC.eventWave.impulseFraction === 0.25);
    assert(JSON.stringify(FABRIC.eventWave.conductedPhaseCounts) === JSON.stringify([0, 1, 2, 3]));
    assert(FABRIC.eventWave.conductedSourceSpacingSeconds === 10);
  });

  await runner.run("localized gravity and broad current share the authored reach", async () => {
    const full = wellGravityMagnitude("player", 0.2, 1);
    const plateau = wellGravityMagnitude("player", 0.8, 1);
    const edge = wellGravityMagnitude("player", 1.2, 1);
    const feather = wellGravityMagnitude("player", 1.26, 1);
    assert(Math.abs(full - 0.6) < 1e-9, `Expected full gravity baseline, got ${full}`);
    assert(plateau > edge && edge > feather && feather > 0,
      `Expected eased gravity envelope, got ${plateau}, ${edge}, ${feather}`);

    const field = buildCoarseFlowField({
      worldScale: 5,
      cellSize: 0.05,
      wells: [{ id: "well-a", wx: 2.5, wy: 2.5, mass: 1, orbitalDir: 1 }],
      waveRings: [],
    });
    const broad = sampleCoarseFlowField(field, 3.0, 2.5);
    const outer = sampleCoarseFlowField(field, 4.0, 2.5);
    const open = sampleCoarseFlowField(field, 4.4, 2.5);
    assert(Math.abs(broad.current.y) > 0.01, "Expected authored broad current in the gravity approach");
    assert(Math.abs(outer.current.y) > 0.01, "Expected current to persist through the broad eddy");
    assert(Math.abs(open.current.y) < 1e-9, "Expected current to end at the derived 1.5x reach");
  });

  const allPassed = runner.summary();
  process.exit(allPassed ? 0 : 1);
}

run().catch((error) => {
  console.error("FabricProfile fatal error:", error.stack || error.message);
  process.exit(1);
});
