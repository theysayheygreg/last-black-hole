const assert = require("assert");
const fs = require("fs");
const path = require("path");
const { buildCoarseFlowField, sampleCoarseFlowField, serializeCoarseFlowField } = require("../scripts/coarse-flow-field.cjs");
const { getSessionProfile, CLIENT_PERF_PROFILES } = require("../scripts/content/session-profiles.cjs");
const { selectAnomalyCast } = require("../scripts/anomaly-catalog.cjs");
const { createRNGStreams } = require("../scripts/rng-stream.cjs");
const { TestRunner } = require("./helpers.cjs");
const serverScales = require("../scripts/content/map-scales.cjs");
const { loadAuthoredMaps, loadPlayableMaps } = require("../scripts/shared-map-loader.cjs");
const { MOVEMENT } = require("../scripts/content/movement.cjs");
const { stepPlayerMovementCore } = require("../scripts/sim/player-movement-step.cjs");
const { SimSnapshotRing } = require("../scripts/sim-snapshot-ring.cjs");

const ROOT = path.resolve(__dirname, "..");
const POSITION_FAMILIES = ["wells", "stars", "wrecks"];

async function loadClientMaps() {
  return import(`file://${path.join(ROOT, "src", "maps", "playable-map-loader.js")}?w2a4=loader`);
}

function assertPointInBounds(point, dimensions, label) {
  assert(point.x >= 0 && point.x < dimensions.width, `${label} x outside bounds`);
  assert(point.y >= 0 && point.y < dimensions.height, `${label} y outside bounds`);
}

function assertAlmostEqual(actual, expected, label) {
  assert(Math.abs(actual - expected) < 1e-12, `${label}: ${actual} !== ${expected}`);
}

function torusDelta(from, to, worldScale) {
  let delta = to - from;
  if (delta > worldScale / 2) delta -= worldScale;
  if (delta < -worldScale / 2) delta += worldScale;
  return delta;
}

function torusDistance(a, b, worldScale) {
  return Math.hypot(
    torusDelta(a.x, b.x, worldScale),
    torusDelta(a.y, b.y, worldScale),
  );
}

function routeAnchors(map) {
  return (map.route?.stages || [])
    .filter((stage) => stage.anchor)
    .map((stage) => {
      const list = map[`${stage.anchor.entity}s`] || [];
      const point = list[stage.anchor.index];
      assert(point, `${map.id}: route anchor ${stage.anchor.entity}[${stage.anchor.index}] missing`);
      return point;
    });
}

function directNoFlowTravelSeconds(distance, integrationHz) {
  const dt = 1 / integrationHz;
  const player = {
    wx: 0,
    wy: 0,
    vx: 0,
    vy: 0,
    deltaV: 1e9,
    deltaVMax: 1e9,
    deltaVBurnRate: MOVEMENT.player.deltaVBurnRate,
    deltaVBurnEff: 1,
    deltaVRegen: 0,
    deltaVRegenBoost: 0,
    timeSinceThrust: 0,
    brain: { thrustScale: 1, dragScale: 1, currentCoupling: 1 },
  };
  let traveled = 0;
  let steps = 0;
  while (traveled < distance && steps < integrationHz * 30) {
    stepPlayerMovementCore(player, { moveX: 1, moveY: 0, thrust: 1, brake: 0 }, dt, {
      brain: player.brain,
      flowSample: { current: { x: 0, y: 0 } },
      worldScale: 1000,
    });
    traveled += Math.hypot(player.vx, player.vy) * dt;
    steps += 1;
  }
  assert(traveled >= distance, `Canonical movement did not cover ${distance} world units`);
  return steps * dt;
}

async function run() {
  const runner = new TestRunner("W2A4MapScale");
  const clientScales = await import(`file://${path.join(ROOT, "src", "content", "map-scales.js")}?w2a4=registry`);
  const clientMapLoader = await loadClientMaps();
  const clientMaps = clientMapLoader.MAP_MODULES;
  const authoredMaps = loadAuthoredMaps();
  const playableMaps = loadPlayableMaps();

  await runner.run("canonical registry has exactly the shipping 5/15/25 trio", () => {
    assert.deepStrictEqual(serverScales.PLAYABLE_MAP_IDS, ["shallows", "expanse", "deep-field"]);
    assert.deepStrictEqual(clientScales.PLAYABLE_MAP_IDS, serverScales.PLAYABLE_MAP_IDS);
    assert.deepStrictEqual(clientScales.MAP_SCALE_REGISTRY, serverScales.MAP_SCALE_REGISTRY);
    assert.deepStrictEqual(serverScales.MAP_SCALE_REGISTRY, require("../src/content/map-scales.data.json").MAP_SCALE_REGISTRY);
    assert.deepStrictEqual(
      serverScales.PLAYABLE_MAP_IDS.map((id) => serverScales.MAP_SCALE_REGISTRY[id].dimensions.width),
      [5, 15, 25],
    );
    assert.strictEqual(clientMapLoader.assertPlayableMapModulesParity(), true);
    assert.deepStrictEqual(Object.keys(clientMapLoader.MAP_MODULES), serverScales.PLAYABLE_MAP_IDS);
  });

  await runner.run("ESM and CJS map exports share registry identity and bounded positions", () => {
    for (const mapId of serverScales.PLAYABLE_MAP_IDS) {
      const definition = serverScales.getMapScaleDefinition(mapId);
      const esmMap = clientMaps[mapId];
      const cjsMap = playableMaps[mapId];
      assert.strictEqual(esmMap.id, mapId);
      assert.strictEqual(esmMap.mapClass, definition.mapClass);
      assert.deepStrictEqual(esmMap.dimensions, definition.dimensions);
      assert.strictEqual(esmMap.profileId, definition.profileId);
      assert.strictEqual(esmMap.sourceFile, definition.sourceFile);
      assert.strictEqual(cjsMap.sourceFile, definition.sourceFile);
      assert.strictEqual(esmMap.worldScale, definition.dimensions.width);
      assert.strictEqual(cjsMap.worldScale, definition.dimensions.width);
      assert.deepStrictEqual(cjsMap.dimensions, definition.dimensions);

      for (const family of POSITION_FAMILIES) {
        assert.strictEqual(esmMap[family].length, cjsMap[family].length, `${mapId} ${family} count drifted`);
        for (let index = 0; index < esmMap[family].length; index += 1) {
          const esmPoint = esmMap[family][index];
          const cjsPoint = cjsMap[family][index];
          assertPointInBounds(esmPoint, definition.dimensions, `${mapId} ${family}[${index}]`);
          assert.strictEqual(cjsPoint.wx, esmPoint.x, `${mapId} ${family}[${index}] x drifted`);
          assert.strictEqual(cjsPoint.wy, esmPoint.y, `${mapId} ${family}[${index}] y drifted`);
        }
      }
    }
  });

  await runner.run("authored coordinates migrate by normalized composition", () => {
    for (const mapId of serverScales.PLAYABLE_MAP_IDS) {
      const definition = serverScales.getMapScaleDefinition(mapId);
      const authored = authoredMaps[mapId];
      const migrated = clientMaps[mapId];
      for (const family of POSITION_FAMILIES) {
        for (let index = 0; index < authored[family].length; index += 1) {
          const before = authored[family][index];
          const after = migrated[family][index];
          assertAlmostEqual(
            after.x / definition.dimensions.width,
            before.x / definition.legacyDimensions.width,
            `${mapId} ${family}[${index}] normalized x changed`,
          );
          assertAlmostEqual(
            after.y / definition.dimensions.height,
            before.y / definition.legacyDimensions.height,
            `${mapId} ${family}[${index}] normalized y changed`,
          );
        }
      }
    }
  });

  await runner.run("old scale-encoded active modules are not loadable", () => {
    for (const legacyFile of ["shallows-3x3.js", "expanse-5x5.js", "deep-field-10x10.js"]) {
      assert(!fs.existsSync(path.join(ROOT, "src", "maps", legacyFile)), `${legacyFile} still exists`);
    }
  });

  await runner.run("authored density and movement stay inside the declared contract", () => {
    const densityContract = serverScales.AUTHORED_MAP_CONTRACT.densityPerWorldUnit;
    const travelContract = serverScales.AUTHORED_MAP_CONTRACT.travel;
    for (const mapId of serverScales.PLAYABLE_MAP_IDS) {
      const definition = serverScales.getMapScaleDefinition(mapId);
      const map = clientMaps[mapId];
      const scale = definition.dimensions.width;
      for (const family of ["wells", "stars", "wrecks", "planetoids"]) {
        const density = map[family].length / scale;
        const bounds = densityContract[family];
        assert(density >= bounds.min && density <= bounds.max,
          `${mapId} ${family} density ${density} outside ${bounds.min}-${bounds.max}`);
      }

      const anchors = routeAnchors(map);
      const legs = anchors.slice(1).map((point, index) => torusDistance(anchors[index], point, scale));
      const observedSeconds = [];
      assert(legs.length > 0, `${mapId}: authored route has no movement legs`);
      for (const leg of legs) {
        assert(leg >= travelContract.minimumRouteLegWorldUnits,
          `${mapId}: route leg ${leg} below movement floor`);
        assert(leg <= scale * travelContract.maximumRouteLegFraction,
          `${mapId}: route leg ${leg} exceeds scale fraction`);
        const seconds = directNoFlowTravelSeconds(leg, travelContract.integrationHz);
        const tierContract = travelContract.tiers[mapId];
        assert(seconds >= tierContract.floorSeconds && seconds <= tierContract.ceilingSeconds,
          `${mapId}: direct no-flow leg ${leg} takes ${seconds}s outside ${tierContract.floorSeconds}-${tierContract.ceilingSeconds}s`);
        observedSeconds.push(Number(seconds.toFixed(2)));
      }
      assert.deepStrictEqual(observedSeconds, travelContract.tiers[mapId].observedLegSeconds,
        `${mapId}: canonical no-flow observations changed`);
    }
  });

  await runner.run("same seed and route identity stay truthful across all tiers", () => {
    for (const mapId of serverScales.PLAYABLE_MAP_IDS) {
      const map = clientMaps[mapId];
      const firstCast = selectAnomalyCast({
        mapId,
        seed: 424242,
        wellCount: map.wells.length,
        rngStreams: createRNGStreams(424242),
      });
      const secondCast = selectAnomalyCast({
        mapId,
        seed: 424242,
        wellCount: map.wells.length,
        rngStreams: createRNGStreams(424242),
      });
      assert.deepStrictEqual(firstCast, secondCast, `${mapId}: same seed changed anomaly cast`);
      assert.strictEqual(map.id, mapId);
      assert.strictEqual(map.worldScale, serverScales.MAP_SCALE_REGISTRY[mapId].dimensions.width);
      assert(map.route?.id, `${mapId}: missing route identity`);
    }
  });

  await runner.run("25x25 coarse field and local render resources stay bounded", async () => {
    const mapId = "deep-field";
    const map = playableMaps[mapId];
    const profile = getSessionProfile(mapId, map.worldScale);
    const fixedGrid = CLIENT_PERF_PROFILES.fixedGrid;
    const field = buildCoarseFlowField({
      worldScale: map.worldScale,
      cellSize: profile.flowFieldCellSize,
      wells: map.wells,
      waveRings: [],
      seededSea: null,
      maxCells: profile.maxCoarseFieldCells,
    });
    const serialized = serializeCoarseFlowField(field, 1, {
      maxCells: profile.maxCoarseFieldCells,
      maxBytes: profile.snapshotBudgetBytes,
    });
    const fieldBytes = Buffer.from(serialized.data, "base64").byteLength;
    assert(profile.useCoarseField === true, "Deep Field must use the coarse field");
    assert(field.cells.length <= profile.maxCoarseFieldCells,
      `Deep Field coarse cells exceed profile ceiling: ${field.cells.length}/${profile.maxCoarseFieldCells}`);
    assert(fieldBytes <= profile.snapshotBudgetBytes,
      `Serialized coarse field exceeds snapshot budget: ${fieldBytes}/${profile.snapshotBudgetBytes}`);
    assert(fixedGrid.fluidResolution === 192, "Fixed local fluid allocation changed");
    assert(fixedGrid.localWindowWorldUnits === 3, "Fixed local fluid window changed");
    assert(fixedGrid.coarseTextureResolution === 64, "Fixed coarse texture allocation changed");
    assert.throws(() => buildCoarseFlowField({
      worldScale: map.worldScale,
      cellSize: profile.flowFieldCellSize,
      wells: map.wells,
      waveRings: [],
      seededSea: null,
      maxCells: field.cells.length - 1,
    }), /exceeding the 3135-cell budget/, "Coarse-field construction must fail closed");
    assert.throws(() => serializeCoarseFlowField(field, 1, {
      maxCells: field.cells.length - 1,
      maxBytes: profile.snapshotBudgetBytes,
    }), /exceeding the 3135-cell budget/, "Coarse-field serialization must fail closed");
    const ring = new SimSnapshotRing({ runId: "w2a4-budget-proof" });
    assert.throws(() => ring.append({ payload: "x".repeat(512) }, {
      maxBytes: 128,
      budgetLabel: "W2-A4 snapshot proof",
    }), /exceeding the 128-byte budget/, "Snapshot serialization must fail closed");
    assert.strictEqual(ring.describe().retainedCount, 0, "Rejected snapshot must not enter the ring");
    const configSource = fs.readFileSync(path.join(ROOT, "src", "config.js"), "utf8");
    const coordsSource = fs.readFileSync(path.join(ROOT, "src", "coords.js"), "utf8");
    const fluidSource = fs.readFileSync(path.join(ROOT, "src", "fluid.js"), "utf8");
    assert(configSource.includes("CLIENT_PERF_PROFILES.fixedGrid.fluidResolution"),
      "Client fluid resolution is not sourced from the fixed-grid profile");
    assert(coordsSource.includes("CLIENT_PERF_PROFILES.fixedGrid.localWindowWorldUnits"),
      "Client fluid window is not sourced from the fixed-grid profile");
    assert(fluidSource.includes("this.coarseRes = CONFIG.fluid.coarseResolution"),
      "Client coarse texture resolution is not sourced from the fixed-grid profile");
    assert(!fluidSource.includes("this.coarseRes = 64"), "Client coarse texture has a duplicate literal allocation");
  });

  await runner.run("toroidal sampling is invariant to whole-map window shifts", () => {
    const map = playableMaps["deep-field"];
    const field = buildCoarseFlowField({
      worldScale: map.worldScale,
      cellSize: getSessionProfile("deep-field", map.worldScale).flowFieldCellSize,
      wells: map.wells,
      waveRings: [],
      seededSea: null,
    });
    for (const [x, y] of [[1.25, 2.5], [12.4, 19.1], [24.7, 0.2]]) {
      const first = sampleCoarseFlowField(field, x, y);
      const shifted = sampleCoarseFlowField(field, x + map.worldScale, y - map.worldScale);
      for (const key of ["currentX", "currentY", "gravityX", "gravityY", "hazard", "surf"]) {
        assertAlmostEqual(shifted[key], first[key], `${key} changed across toroidal shift`);
      }
    }
  });

  const passed = runner.summary();
  if (!passed) process.exitCode = 1;
}

run().catch((error) => {
  console.error(error.stack || error);
  process.exitCode = 1;
});
