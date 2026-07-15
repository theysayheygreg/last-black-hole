const assert = require("assert");
const fs = require("fs");
const path = require("path");
const { pathToFileURL } = require("url");
const { TestRunner } = require("./helpers.cjs");
const catalog = require("../scripts/anomaly-catalog.cjs");
const {
  Conductor,
} = require("../scripts/sim/conductor.cjs");
const {
  assertValidCollapseEpochContract,
  createCollapseEpochSchedule,
  createCollapseEpochState,
  advanceCollapseEpochs,
} = require("../scripts/sim/collapse-epochs.cjs");
const { calculateWellGrowth, createWellGrowthEvent } = require("../scripts/sim/well-growth.cjs");
const { createRNGStreams } = require("../scripts/rng-stream.cjs");
const { buildCoarseFlowField } = require("../scripts/coarse-flow-field.cjs");
const { createSeededSea } = require("../scripts/sim/seeded-sea.cjs");

function wellFixture() {
  return {
    id: "well-a",
    catalogId: "base-well",
    behaviorId: "base-well",
    wx: 1,
    wy: 1,
    mass: 1.5,
    killRadius: 0.06,
    startMass: 1.5,
    baseKillRadius: 0.06,
  };
}

async function run() {
  const runner = new TestRunner("SimGrowthEpochs");

  await runner.run("catalog declares valid provisional epoch vectors and Conductor ordering", () => {
    assert(catalog.assertValidAnomalyCatalog());
    assertValidCollapseEpochContract();
    const first = createCollapseEpochSchedule({ matchDurationSeconds: 600 });
    const second = createCollapseEpochSchedule({ matchDurationSeconds: 600 });
    assert.strictEqual(JSON.stringify(first), JSON.stringify(second), "same config must produce byte-stable epoch schedule");
    const conductor = new Conductor({ seed: 17, offsetGuardSeconds: 10 });
    conductor.scheduleCollapseEpochs(first);
    assert.deepStrictEqual(conductor.getSchedule().collapseEpochs, first, "Conductor must retain the epoch schedule identity and order");
  });

  await runner.run("variable dt crosses each epoch once and preserves schedule order", () => {
    const schedule = createCollapseEpochSchedule({ matchDurationSeconds: 600 });
    let state = createCollapseEpochState(schedule);
    const transitions = [];
    for (const time of [149.9, 150.1, 500, 500, 599]) {
      const result = advanceCollapseEpochs(state, schedule, time);
      state = result.state;
      transitions.push(...result.transitions);
    }
    assert.deepStrictEqual(transitions.map((entry) => entry.epochId), [
      "collapse-epoch-1",
      "collapse-epoch-2",
      "collapse-epoch-3",
    ]);
    assert.strictEqual(state.transitionCount, 3);
    assert.strictEqual(advanceCollapseEpochs(state, schedule, 600).transitions.length, 0);
    assert.deepStrictEqual(transitions.map((entry) => entry.eventTime), [150.1, 500, 500]);
  });

  await runner.run("epoch parameter vectors stay inside declared bounds", () => {
    const contract = catalog.ANOMALY_COLLAPSE_EPOCH_CONTRACT;
    const schedule = createCollapseEpochSchedule({ matchDurationSeconds: 600 });
    for (const epoch of schedule) {
      for (const [name, declaration] of Object.entries(contract.parameterVectors)) {
        const value = epoch.parameterVector[name];
        assert(value >= declaration.range[0] && value <= declaration.range[1], `${epoch.epochId}.${name} escaped its bound`);
      }
    }
  });

  await runner.run("identity epoch parameters preserve pre-first-epoch field output", () => {
    const seededSea = createSeededSea({
      seed: 90210,
      mapId: "field-proof",
      worldScale: 3,
      wells: [{ id: "well-a", wx: 1.5, wy: 1.5, mass: 1, orbitalDir: 1 }],
      rngStreams: createRNGStreams(90210),
    });
    const input = {
      worldScale: 3,
      cellSize: 0.2,
      wells: [{ id: "well-a", wx: 1.5, wy: 1.5, mass: 1, killRadius: 0.06, orbitalDir: 1 }],
      waveRings: [],
      seededSea,
    };
    const base = buildCoarseFlowField(input);
    const identity = buildCoarseFlowField({
      ...input,
      collapseParameters: { seededSeaAmbientMultiplier: 1, liveWavePushMultiplier: 1 },
    });
    assert.deepStrictEqual(identity.cells, base.cells, "epoch zero must leave base field cells unchanged");
  });

  await runner.run("epoch retune changes only named seeded ambient and live wave terms", () => {
    const well = { id: "well-a", wx: 1.5, wy: 1.5, mass: 1, killRadius: 0.06, orbitalDir: 1 };
    const wellOnly = { worldScale: 3, cellSize: 0.2, wells: [well], waveRings: [], seededSea: null };
    assert.deepStrictEqual(
      buildCoarseFlowField({ ...wellOnly, collapseParameters: { seededSeaAmbientMultiplier: 1.24, liveWavePushMultiplier: 1.15 } }).cells,
      buildCoarseFlowField(wellOnly).cells,
      "well gravity/current terms must not read collapse multipliers"
    );

    const seededSea = createSeededSea({ seed: 8, mapId: "field-proof", worldScale: 3, wells: [well], rngStreams: createRNGStreams(8) });
    const ambientBase = buildCoarseFlowField({ worldScale: 3, cellSize: 0.2, wells: [], waveRings: [], seededSea });
    const ambientRetuned = buildCoarseFlowField({ worldScale: 3, cellSize: 0.2, wells: [], waveRings: [], seededSea, collapseParameters: { seededSeaAmbientMultiplier: 1.24, liveWavePushMultiplier: 1 } });
    assert(ambientBase.cells.some((cell, index) => cell.currentX !== ambientRetuned.cells[index].currentX || cell.currentY !== ambientRetuned.cells[index].currentY), "seeded ambient multiplier must alter the seeded term");

    const ring = { id: "growth-ring", sourceWX: 1.5, sourceWY: 1.5, radius: 0.4, amplitude: 0.8, alive: true };
    const waveBase = buildCoarseFlowField({ worldScale: 3, cellSize: 0.2, wells: [], waveRings: [ring], seededSea: null });
    const waveRetuned = buildCoarseFlowField({ worldScale: 3, cellSize: 0.2, wells: [], waveRings: [ring], seededSea: null, collapseParameters: { seededSeaAmbientMultiplier: 1, liveWavePushMultiplier: 1.15 } });
    assert(waveBase.cells.some((cell, index) => cell.waveX !== waveRetuned.cells[index].waveX || cell.waveY !== waveRetuned.cells[index].waveY), "live wave multiplier must alter the live wave term");
  });

  await runner.run("scheduled and star-consumption growth events identify only the changed well", () => {
    const well = wellFixture();
    const before = { mass: well.mass, killRadius: well.killRadius };
    const growth = calculateWellGrowth({ well, massDelta: 0.02, killRadiusForMass: (candidate) => candidate.baseKillRadius * (1 + (candidate.mass - candidate.startMass) * 0.3) });
    const scheduled = createWellGrowthEvent({
      well,
      source: "schedule",
      reason: "normal-schedule",
      scheduledTime: 45,
      eventTime: 45.1,
      waveId: "wave-growth-a",
      before: growth.before,
      after: growth.after,
    });
    const consumed = createWellGrowthEvent({
      well,
      source: "star-consumption",
      reason: "star-consumed",
      sourceEntityId: "star-7",
      sourceEntityType: "star",
      eventTime: 91.2,
      waveId: "wave-star-7",
      before,
      after: { mass: 2, killRadius: 0.069 },
    });
    assert.strictEqual(scheduled.wellId, "well-a");
    assert.strictEqual(scheduled.sourceEntityId, null);
    assert.strictEqual(scheduled.before.mass, 1.5);
    assert.strictEqual(scheduled.after.mass, 1.52);
    assert.strictEqual(scheduled.tellId, "well-growth");
    assert.strictEqual(consumed.wellId, "well-a");
    assert.strictEqual(consumed.sourceEntityId, "star-7");
    assert.strictEqual(consumed.sourceEntityType, "star");
    assert.strictEqual(consumed.scheduledTime, null);
    assert.strictEqual(consumed.after.mass, 2);
  });

  await runner.run("snapshot-shaped truth survives presentation normalization without payload leakage", async () => {
    const presentation = await import(pathToFileURL(path.join(__dirname, "../src/presentation/presentation-frame.js")).href);
    const frame = presentation.createPresentationFrame({
      scene: {
        wells: [{ id: "well-a", catalogId: "base-well", behaviorId: "base-well", wx: 1, wy: 1, mass: 1.52, killRadius: 0.06036 }],
        collapseEpoch: {
          epochId: "collapse-epoch-1",
          epochIndex: 1,
          scheduledTime: 150,
          transitionCount: 1,
          parameterVector: { seededSeaAmbientMultiplier: 1.08, liveWavePushMultiplier: 1.05 },
        },
        collapseEpochSchedule: [{
          epochId: "collapse-epoch-1",
          epochIndex: 1,
          scheduledTime: 150,
          parameterVector: { seededSeaAmbientMultiplier: 1.08, liveWavePushMultiplier: 1.05 },
        }],
      },
      events: [{
        seq: 7,
        type: "well.grew",
        payload: {
          wellId: "well-a",
          catalogId: "base-well",
          source: "star-consumption",
          reason: "star-consumed",
          sourceEntityId: "star-7",
          waveId: "wave-star-7",
          tellId: "well-growth",
          scheduledTime: null,
          eventTime: 91.2,
          before: { mass: 1.5, killRadius: 0.06 },
          after: { mass: 1.52, killRadius: 0.06036 },
          payloadShouldNotLeak: true,
        },
      }],
    });
    assert.strictEqual(frame.world.wells[0].catalogId, "base-well");
    assert.strictEqual(frame.world.wells[0].mass, 1.52);
    assert.strictEqual(frame.world.collapseEpoch.epochId, "collapse-epoch-1");
    assert.strictEqual(frame.world.collapseEpoch.parameterVector.liveWavePushMultiplier, 1.05);
    assert.strictEqual(frame.events[0].wellId, "well-a");
    assert.strictEqual(frame.events[0].growthSource, "star-consumption");
    assert.strictEqual(frame.events[0].after.mass, 1.52);
    assert(!("payload" in frame.events[0]), "presentation normalization must not leak arbitrary event payloads");
  });

  await runner.run("authority epoch and growth paths add no per-player clock or bare random source", () => {
    const runtime = fs.readFileSync(path.join(__dirname, "../scripts/sim-runtime.cjs"), "utf8");
    const epochs = fs.readFileSync(path.join(__dirname, "../scripts/sim/collapse-epochs.cjs"), "utf8");
    assert(!epochs.includes("Math.random"), "collapse epoch contract must use no random source");
    assert(!epochs.includes("player"), "collapse epoch state must not be per-player");
    assert(runtime.includes("applyWellGrowth(well"), "authority must route both growth causes through the shared helper");
  });

  const passed = runner.summary();
  console.log(`SimGrowthEpochs: ${passed ? "focused proof passed" : "focused proof failed"}`);
  process.exit(passed ? 0 : 1);
}

run().catch((error) => {
  console.error("SimGrowthEpochs fatal error:", error.stack || error.message);
  process.exit(1);
});
