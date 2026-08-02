const { TestRunner, assert } = require("./helpers.cjs");
const { FABRIC } = require("../scripts/content/fabric.cjs");
const { PUBLIC_HULL_IDS, HULL_DEFINITIONS } = require("../scripts/content/hulls.cjs");
const { loadPlayableMaps } = require("../scripts/shared-map-loader.cjs");
const { createRNGStreams } = require("../scripts/rng-stream.cjs");
const { createSeededSea } = require("../scripts/sim/seeded-sea.cjs");
const { capFabricCurrent, fabricCarrySpeedCap } = require("../scripts/sim/fabric-reference-frame.cjs");
const { buildCoarseFlowField } = require("../scripts/coarse-flow-field.cjs");

const EPSILON = 1e-9;

function magnitude(vector) {
  return Math.hypot(Number(vector?.x) || 0, Number(vector?.y) || 0);
}

async function run() {
  const runner = new TestRunner("FabricCurrentCap");

  await runner.run("composed Shallows FREE current stays in every public hull reference band", () => {
    const shallows = loadPlayableMaps().shallows;
    assert(shallows?.wells?.length > 0, "Expected authored Shallows wells");
    let observedOverCapRawCurrent = false;

    for (const massMultiplier of [0.85, 1.15]) {
      const wells = shallows.wells.map((well) => ({ ...well, mass: well.mass * massMultiplier }));
      const seededSea = createSeededSea({
        seed: 7406,
        mapId: shallows.id,
        worldScale: shallows.worldScale,
        wells,
        rngStreams: createRNGStreams(7406),
      });
      const field = buildCoarseFlowField({
        worldScale: shallows.worldScale,
        cellSize: 0.05,
        wells,
        seededSea,
      });

      for (const cell of field.cells) {
        const raw = { x: cell.currentX, y: cell.currentY };
        for (const hullType of PUBLIC_HULL_IDS) {
          const player = { hullType, brain: { ...HULL_DEFINITIONS[hullType] } };
          const capped = capFabricCurrent(raw, player);
          const cap = fabricCarrySpeedCap(player);
          assert(capped.magnitude <= cap + EPSILON,
            `${hullType} exceeded its ${FABRIC.referenceFrame.carryCapFraction} carry band at Shallows mass ${massMultiplier}`);
          if (magnitude(raw) > cap + EPSILON) {
            observedOverCapRawCurrent = true;
            assert(capped.capped, "An over-band composed current must be capped before coupling");
            const alignment = raw.x * capped.x + raw.y * capped.y;
            assert(alignment > 0, "Current cap must preserve the composed current direction");
          }
        }
      }
    }
    assert(observedOverCapRawCurrent, "Shallows mass bounds must exercise the composed-current cap");
  });

  const allPassed = runner.summary();
  process.exit(allPassed ? 0 : 1);
}

run().catch((error) => {
  console.error("FabricCurrentCap fatal error:", error.stack || error.message);
  process.exit(1);
});
