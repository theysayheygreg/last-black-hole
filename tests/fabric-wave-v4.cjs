const assert = require("assert");
const fs = require("fs");
const path = require("path");
const { TestRunner } = require("./helpers.cjs");
const {
  hasWaveReceipt,
  rememberWaveReceipt,
  sweptWaveCrossing,
} = require("../scripts/sim/swept-wave-crossing.cjs");
const { hullCalmSpaceReferenceSpeed } = require("../scripts/sim/hull-reference-speed.cjs");
const { MOVEMENT } = require("../scripts/content/movement.cjs");
const { dragFactorFromHalfLife } = require("../src/content/tuning.js");
const { FABRIC } = require("../scripts/content/fabric.cjs");
const { createConductedWaveSchedule } = require("../scripts/sim/conductor.cjs");
const {
  buildCoarseFlowField,
  sampleCoarseFlowField,
} = require("../scripts/coarse-flow-field.cjs");

const ROOT = path.resolve(__dirname, "..");
const EPSILON = 1e-9;

function crossing(overrides = {}) {
  return sweptWaveCrossing({
    startX: 0,
    startY: 0,
    endX: 0,
    endY: 0,
    sourceX: 2,
    sourceY: 0,
    worldScale: 10,
    previousRadius: 1.8,
    currentRadius: 2.2,
    frontWidth: 0.1,
    ...overrides,
  });
}

async function run() {
  const runner = new TestRunner("FabricWaveV4");

  await runner.run("authority sweep covers approach, high speed, miss, seam, and one receipt", () => {
    assert(crossing().hit, "Expected a stationary player to be crossed by an expanding front");
    assert(crossing({
      startX: 0,
      endX: 4,
      previousRadius: 2,
      currentRadius: 2,
    }).hit, "Expected a high-speed segment to cross a static front");
    assert(crossing({
      startX: 0,
      endX: 6,
      deltaX: 6,
      deltaY: 0,
      previousRadius: 1.8,
      currentRadius: 2.2,
    }).hit, "Expected the authority's unwrapped high-speed delta to be swept");
    assert(!crossing({
      sourceX: 0,
      sourceY: 2,
      previousRadius: 0.2,
      currentRadius: 0.4,
    }).hit, "Expected a closest-approach miss outside the front");
    assert(crossing({
      startX: 4.8,
      endX: 0,
      sourceX: 0.1,
      previousRadius: 0.2,
      currentRadius: 0.4,
    }).hit, "Expected the toroidal seam to remain a normal swept crossing");

    let receipts = [];
    assert(!hasWaveReceipt(receipts, "wave-a"));
    receipts = rememberWaveReceipt(receipts, "wave-a", 12);
    assert(hasWaveReceipt(receipts, "wave-a"));
    receipts = rememberWaveReceipt(receipts, "wave-a", 13);
    assert.strictEqual(receipts.length, 1, "A player must receive one bounded receipt per wave");
    assert.strictEqual(receipts[0].tick, 13);
  });

  await runner.run("wave impulse uses each hull's derived calm-space reference", () => {
    const drifter = hullCalmSpaceReferenceSpeed("drifter");
    const breacher = hullCalmSpaceReferenceSpeed("breacher");
    assert(drifter > 0 && breacher > drifter, "Expected distinct positive hull reference speeds");
    const variantPlayer = {
      hullType: "drifter",
      brain: { thrustScale: 1.15, dragScale: 1.25 },
    };
    const variant = hullCalmSpaceReferenceSpeed(variantPlayer);
    const dt = 1 / MOVEMENT.authority.integrationHz;
    const dragFactor = dragFactorFromHalfLife(
      MOVEMENT.player.coastHalfLifeSeconds,
      dt,
      variantPlayer.brain.dragScale,
    );
    const expectedVariant = Math.min(
      MOVEMENT.player.maxSpeedWorld,
      (MOVEMENT.player.thrustAccel * variantPlayer.brain.thrustScale * dt * dragFactor)
        / (1 - dragFactor),
    );
    assert(Math.abs(variant - expectedVariant) < EPSILON,
      `Resolved brain speed must use the canonical 15 Hz drag order: ${variant} !== ${expectedVariant}`);
    assert(Math.abs(variant - drifter) > EPSILON,
      "Resolved brain thrust/drag must change the hull reference speed");
    const normal = crossing({
      startX: 0,
      endX: 4,
      previousRadius: 2,
      currentRadius: 2,
    });
    const before = { x: 0.4, y: -0.2 };
    const impulse = FABRIC.eventWave.impulseFraction * drifter;
    const after = {
      x: before.x + normal.normalX * impulse,
      y: before.y + normal.normalY * impulse,
    };
    assert(Math.abs((after.x - before.x) / normal.normalX - impulse) < EPSILON);
    assert(Math.abs(after.y - before.y - normal.normalY * impulse) < EPSILON);
    assert(Math.abs(FABRIC.eventWave.impulseFraction * breacher
      - FABRIC.eventWave.impulseFraction * drifter) > EPSILON,
      "Different hulls must not share a scattered nominal impulse speed");
    const runtimeSource = fs.readFileSync(path.join(ROOT, "scripts/sim-runtime.cjs"), "utf8");
    assert(runtimeSource.includes("hullCalmSpaceReferenceSpeed(player)"),
      "Runtime wave impulse must consume the active player's resolved brain");
  });

  await runner.run("Conductor owns four-phase 0/1/2/3 source schedule", () => {
    const wells = [
      { id: "well-b", wx: 3, wy: 3 },
      { id: "well-a", wx: 1, wy: 1 },
    ];
    const sixHundred = createConductedWaveSchedule({
      matchDurationSeconds: 600,
      wells,
      telegraphSeconds: 1.5,
    });
    assert.deepStrictEqual(
      [0, 1, 2, 3].map((phase) => sixHundred.filter((event) => event.phase === phase).length),
      [0, 1, 2, 3],
    );
    for (let index = 1; index < sixHundred.length; index += 1) {
      assert(sixHundred[index].time > sixHundred[index - 1].time,
        "Conducted waves must be staggered, never simultaneous");
    }
    assert(sixHundred.every((event) => event.sourceWellId === "well-a" || event.sourceWellId === "well-b"));
    assert(sixHundred.every((event) => event.cause === "conductor" && event.telegraphSeconds === 1.5));

    const threeHundred = createConductedWaveSchedule({
      matchDurationSeconds: 300,
      wells,
      telegraphSeconds: 1.5,
    });
    assert.deepStrictEqual(
      threeHundred.map((event) => event.time),
      sixHundred.map((event) => event.time * 0.5),
      "The source schedule must scale with match duration");
  });

  await runner.run("coarse field carries no wave acceleration or ring source", () => {
    const field = buildCoarseFlowField({
      worldScale: 3,
      cellSize: 0.2,
      wells: [],
      waveRings: [{ id: "retired-band", sourceWX: 1.5, sourceWY: 1.5, radius: 0.4, amplitude: 1 }],
    });
    const sample = sampleCoarseFlowField(field, 1.9, 1.5);
    assert(Math.abs(sample.wave.x) < EPSILON && Math.abs(sample.wave.y) < EPSILON);
    assert.strictEqual(sample.sources.ringId, null);
    assert.strictEqual(sample.surf, 0);
    const coarseSource = fs.readFileSync(path.join(ROOT, "scripts/coarse-flow-field.cjs"), "utf8");
    const localSource = fs.readFileSync(path.join(ROOT, "src/sim/flow-field.js"), "utf8");
    const ringSource = fs.readFileSync(path.join(ROOT, "src/wave-rings.js"), "utf8");
    assert(!coarseSource.includes("waveShipPush"));
    assert(!localSource.includes("waveBandForce"));
    assert(!ringSource.includes("applyToShip"));
  });

  const allPassed = runner.summary();
  process.exit(allPassed ? 0 : 1);
}

run().catch((error) => {
  console.error("FabricWaveV4 fatal error:", error.stack || error.message);
  process.exit(1);
});
