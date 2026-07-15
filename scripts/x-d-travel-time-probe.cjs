const assert = require("assert");
const fs = require("fs");
const path = require("path");

const {
  PLAYABLE_MAP_IDS,
  MAP_SCALE_REGISTRY,
} = require("./content/map-scales.cjs");
const { getSessionProfile } = require("./content/session-profiles.cjs");
const { MOVEMENT } = require("./content/movement.cjs");
const {
  BRAIN_DEFAULTS,
  HULL_DEFINITIONS,
  createPlayerBrain,
} = require("./player-brain.cjs");
const { loadPlayableMaps } = require("./shared-map-loader.cjs");
const { stepPlayerMovementCore } = require("./sim/player-movement-step.cjs");
const { wrappedDelta, wrappedDistance } = require("./sim/world-geometry.cjs");

const ROOT = path.resolve(__dirname, "..");
const OUTPUT = path.join(ROOT, "docs", "v0.3", "reviews", "artifacts", "x-d-travel-time-probe.json");
const SAMPLE_SEEDS = Object.freeze([101, 202, 303]);
const MEASUREMENT_BASE_COMMIT = "e693adb26fc69390bdb2b0a1d9fb72404f4f5376";
const LATER_ENCOUNTER_SOURCE_COMMIT = "a4efcee8f4f4ee39727e8bee8d0d21ec2f2f4bb3";

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function modeDefinitions() {
  const burn = HULL_DEFINITIONS.breacher.abilities.burn;
  return [
    {
      id: "cruise",
      label: "canonical baseline full-stick cruise",
      hullType: null,
      brain: clone(BRAIN_DEFAULTS),
      burnMultiplier: 1,
      burnFuelMax: null,
      abilitySource: null,
    },
    {
      id: "burst",
      label: "Breacher full-stick cruise with existing Burn active",
      hullType: "breacher",
      brain: createPlayerBrain({ hullType: "breacher", rigLevels: [0, 0, 0] }),
      burnMultiplier: burn.thrustMult,
      burnFuelMax: burn.fuelMax,
      abilitySource: "src/content/hulls.data.json:HULL_DEFINITIONS.breacher.abilities.burn",
    },
  ];
}

function routeAnchors(map) {
  return (map.route?.stages || [])
    .filter((stage) => stage.anchor)
    .map((stage) => {
      const list = map[`${stage.anchor.entity}s`] || [];
      const point = list[stage.anchor.index];
      assert(point, `${map.id}: route anchor ${stage.anchor.entity}[${stage.anchor.index}] missing`);
      return {
        entity: stage.anchor.entity,
        index: stage.anchor.index,
        x: point.wx,
        y: point.wy,
      };
    });
}

function routeLegs(map, worldScale) {
  const anchors = routeAnchors(map);
  return anchors.slice(1).map((target, index) => {
    const start = anchors[index];
    const distance = wrappedDistance(start.x, start.y, target.x, target.y, worldScale);
    assert(distance > 0, `${map.id}: route leg ${index} has zero distance`);
    return {
      index,
      start,
      target,
      distance,
      direction: {
        x: wrappedDelta(start.x, target.x, worldScale) / distance,
        y: wrappedDelta(start.y, target.y, worldScale) / distance,
      },
    };
  });
}

function makePlayer(mode, start) {
  const brain = clone(mode.brain);
  const deltaVMax = 1e9;
  return {
    wx: start.x,
    wy: start.y,
    vx: 0,
    vy: 0,
    deltaV: deltaVMax,
    deltaVMax,
    deltaVBurnRate: Number(brain.deltaVBurnRate) || MOVEMENT.player.deltaVBurnRate,
    deltaVBurnEff: Number(brain.deltaVBurnEff) || 1,
    deltaVRegen: Number(brain.deltaVRegen) || 0,
    deltaVRegenBoost: Number(brain.deltaVRegenBoost) || 0,
    timeSinceThrust: 0,
    brain,
  };
}

function measureDistance({ mapId, mode, worldScale, dt, probe, sampleIndex, seed }) {
  const player = makePlayer(mode, probe.start);
  const input = { moveX: probe.direction.x, moveY: probe.direction.y, thrust: 1, brake: 0 };
  const targetDistance = probe.distance;
  const maxSteps = Math.ceil(targetDistance * 120) + 2400;
  let traveled = 0;
  let steps = 0;
  let burnFuelRemaining = mode.burnFuelMax;

  while (traveled < targetDistance && steps < maxSteps) {
    const beforeVX = player.vx;
    const beforeVY = player.vy;
    stepPlayerMovementCore(player, input, dt, {
      brain: player.brain,
      burnModifiers: { thrust: mode.burnMultiplier },
      flowSample: { current: { x: 0, y: 0 } },
      worldScale,
    });
    const speed = Math.hypot(player.vx, player.vy);
    const stepDistance = speed * dt;
    assert(Number.isFinite(stepDistance), `${mapId}/${mode.id}: non-finite movement at step ${steps}`);
    traveled += stepDistance;
    if (burnFuelRemaining !== null) burnFuelRemaining = Math.max(0, burnFuelRemaining - dt);
    assert(
      Math.hypot(player.vx, player.vy) <= MOVEMENT.player.maxSpeedWorld + 1e-9,
      `${mapId}/${mode.id}: speed cap exceeded`,
    );
    assert(
      Math.hypot(player.vx - beforeVX, player.vy - beforeVY) < 100,
      `${mapId}/${mode.id}: unreasonable single-step delta-v`,
    );
    steps += 1;
  }

  assert(traveled >= targetDistance, `${mapId}/${mode.id}: failed to terminate at ${targetDistance} wu`);
  return {
    schema: "x-d-travel-time-raw-run-v1",
    mapId,
    mode: mode.id,
    probeKind: probe.kind,
    routeId: probe.routeId || null,
    legIndex: probe.legIndex ?? null,
    sampleIndex,
    seed,
    worldScale,
    distanceWorldUnits: targetDistance,
    start: probe.start,
    target: probe.target || null,
    direction: probe.direction,
    dtSeconds: dt,
    steps,
    simulatedSeconds: steps * dt,
    pathDistanceWorldUnits: traveled,
    finalPosition: { x: player.wx, y: player.wy },
    finalSpeedWorldUnitsPerSecond: Math.hypot(player.vx, player.vy),
    initialDeltaV: player.deltaVMax,
    finalDeltaV: player.deltaV,
    burnFuelMax: mode.burnFuelMax,
    burnFuelRemaining,
  };
}

function buildRawRuns() {
  const maps = loadPlayableMaps();
  const rawRuns = [];
  for (const mapId of PLAYABLE_MAP_IDS) {
    const map = maps[mapId];
    const definition = MAP_SCALE_REGISTRY[mapId];
    const profile = getSessionProfile(mapId, definition.dimensions.width);
    const worldScale = definition.dimensions.width;
    const dt = 1 / profile.tickHz;
    const legs = routeLegs(map, worldScale);
    const probes = [
      {
        kind: "one-cell",
        distance: 1,
        start: { x: 0, y: 0 },
        direction: { x: 1, y: 0 },
      },
      {
        kind: "full-width-crossing",
        distance: worldScale,
        start: { x: 0, y: 0 },
        direction: { x: 1, y: 0 },
      },
      ...legs.map((leg) => ({
        kind: "representative-route-leg",
        routeId: map.route.id,
        legIndex: leg.index,
        distance: leg.distance,
        start: { x: leg.start.x, y: leg.start.y },
        target: { x: leg.target.x, y: leg.target.y },
        direction: leg.direction,
      })),
    ];
    for (const mode of modeDefinitions()) {
      for (const probe of probes) {
        for (let sampleIndex = 0; sampleIndex < SAMPLE_SEEDS.length; sampleIndex += 1) {
          rawRuns.push(measureDistance({
            mapId,
            mode,
            worldScale,
            dt,
            probe,
            sampleIndex,
            seed: SAMPLE_SEEDS[sampleIndex],
          }));
        }
      }
    }
  }
  return rawRuns;
}

function byKey(rows, key) {
  return rows.filter((row) => row.probeKind === key);
}

function median(values) {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)];
}

function summarize(rawRuns) {
  const maps = loadPlayableMaps();
  return PLAYABLE_MAP_IDS.map((mapId) => {
    const definition = MAP_SCALE_REGISTRY[mapId];
    const profile = getSessionProfile(mapId, definition.dimensions.width);
    const mapRows = rawRuns.filter((row) => row.mapId === mapId);
    const cruiseRows = mapRows.filter((row) => row.mode === "cruise");
    const burstRows = mapRows.filter((row) => row.mode === "burst");
    const cruiseCell = median(byKey(cruiseRows, "one-cell").map((row) => row.simulatedSeconds));
    const burstCell = median(byKey(burstRows, "one-cell").map((row) => row.simulatedSeconds));
    const sensorRadiusWorldUnits = profile.entityRelevanceRadius;
    const sensorRadiusCells = sensorRadiusWorldUnits / 1;
    const route = routeLegs(maps[mapId], definition.dimensions.width);
    const routeSummary = route.map((leg) => ({
      legIndex: leg.index,
      distanceWorldUnits: leg.distance,
      cruiseSeconds: median(cruiseRows
        .filter((row) => row.probeKind === "representative-route-leg" && row.legIndex === leg.index)
        .map((row) => row.simulatedSeconds)),
      burstSeconds: median(burstRows
        .filter((row) => row.probeKind === "representative-route-leg" && row.legIndex === leg.index)
        .map((row) => row.simulatedSeconds)),
    }));
    return {
      mapId,
      dimensions: { ...definition.dimensions },
      profileId: definition.profileId,
      tickHz: profile.tickHz,
      dtSeconds: 1 / profile.tickHz,
      cruiseSecondsPerCell: cruiseCell,
      burstSecondsPerCell: burstCell,
      cruiseFullWidthCrossingSeconds: median(byKey(cruiseRows, "full-width-crossing").map((row) => row.simulatedSeconds)),
      burstFullWidthCrossingSeconds: median(byKey(burstRows, "full-width-crossing").map((row) => row.simulatedSeconds)),
      representativeRoute: {
        routeId: maps[mapId].route.id,
        legs: routeSummary,
      },
      sensorRead: {
        source: "session profile entityRelevanceRadius",
        radiusWorldUnits: sensorRadiusWorldUnits,
        radiusCellsProvisional: sensorRadiusCells,
      },
      decisionsPerMinuteProxy: {
        definition: "60 / (cruise seconds per cell × sensor radius in provisional cells)",
        value: 60 / (cruiseCell * sensorRadiusCells),
      },
    };
  });
}

function validateReport(report) {
  assert.strictEqual(report.schema, "x-d-travel-time-probe-v1");
  assert.deepStrictEqual(report.mapIds, PLAYABLE_MAP_IDS);
  assert.strictEqual(report.sampleCount, SAMPLE_SEEDS.length);
  assert.deepStrictEqual(report.sampleSeeds, SAMPLE_SEEDS);
  const expectedProbeCount = PLAYABLE_MAP_IDS.reduce((count, mapId) => {
    const map = loadPlayableMaps()[mapId];
    return count + 2 + routeAnchors(map).length - 1;
  }, 0);
  assert.strictEqual(report.rawRuns.length, expectedProbeCount * 2 * SAMPLE_SEEDS.length);
  for (const row of report.rawRuns) {
    assert.strictEqual(row.schema, "x-d-travel-time-raw-run-v1");
    assert.strictEqual(row.simulatedSeconds, row.steps * row.dtSeconds);
    assert(row.pathDistanceWorldUnits >= row.distanceWorldUnits);
  }
  for (const summary of report.summary) {
    const cellRows = report.rawRuns.filter((row) => row.mapId === summary.mapId && row.mode === "cruise" && row.probeKind === "one-cell");
    assert.strictEqual(summary.cruiseSecondsPerCell, median(cellRows.map((row) => row.simulatedSeconds)));
    assert.strictEqual(
      summary.decisionsPerMinuteProxy.value,
      60 / (summary.cruiseSecondsPerCell * summary.sensorRead.radiusCellsProvisional),
    );
    for (const leg of summary.representativeRoute.legs) {
      const legRows = report.rawRuns.filter((row) => row.mapId === summary.mapId
        && row.mode === "cruise" && row.probeKind === "representative-route-leg" && row.legIndex === leg.legIndex);
      assert.strictEqual(leg.cruiseSeconds, median(legRows.map((row) => row.simulatedSeconds)));
    }
  }
  return true;
}

function createReport() {
  const rawRuns = buildRawRuns();
  const report = {
    schema: "x-d-travel-time-probe-v1",
    measurementBaseCommit: MEASUREMENT_BASE_COMMIT,
    sourceCommits: {
      acceptedBase: MEASUREMENT_BASE_COMMIT,
      laterEncounterGenerationDesign: LATER_ENCOUNTER_SOURCE_COMMIT,
    },
    mapIds: [...PLAYABLE_MAP_IDS],
    mapRegistrySource: "src/content/map-scales.data.json:MAP_SCALE_REGISTRY",
    movementSource: "src/content/movement-step.js -> src/content/movement.data.json",
    sessionProfileSource: "src/content/session-profiles.data.json:SESSION_PROFILES",
    sampleCount: SAMPLE_SEEDS.length,
    sampleSeeds: [...SAMPLE_SEEDS],
    seedInfluence: "none: no RNG draw enters the isolated movement protocol; seeds are reproducibility labels",
    protocol: {
      dt: "1 / canonical session profile tickHz: 1/15, 1/12, 1/10 seconds for Shallows, Expanse, Deep Field",
      input: "moveX=shortest-path unit direction, moveY=shortest-path unit direction, thrust=1, brake=0; held for every tick",
      cruise: "canonical baseline brain defaults, sustained full-stick thrust, no burn, no flow, no entity forces",
      burst: "Breacher default brain with existing Burn active; burn thrustMult and fuelMax read from HULL_DEFINITIONS, no slingshot",
      deltaV: "sufficientDeltaV=true from AUTHORED_MAP_CONTRACT.travel; movement lane uses a 1e9 delta-v reserve so depletion cannot become the measured travel time",
      flow: "zero current sample; no wells, stars, planetoids, waves, gravity, contacts, or collisions",
      termination: "stop after accumulated path distance reaches target distance; measured time is completed simulation ticks",
      probes: "one cell = 1 current registry world unit; full-width = one toroidal map circumference; route legs use current authored route anchors and shortest toroidal distance",
    },
    units: {
      currentRegistry: "map dimensions are world units; current measurement uses 1 wu = 1 provisional cell for placement math",
      fictionScale: "unresolved and intentionally not ratified; no meters conversion is claimed",
    },
    summary: summarize(rawRuns),
    rawRuns,
  };
  validateReport(report);
  return report;
}

function writeReport(report) {
  fs.mkdirSync(path.dirname(OUTPUT), { recursive: true });
  fs.writeFileSync(OUTPUT, `${JSON.stringify(report, null, 2)}\n`);
}

function main() {
  const args = new Set(process.argv.slice(2));
  const first = createReport();
  if (args.has("--verify")) {
    const second = createReport();
    assert.strictEqual(JSON.stringify(first), JSON.stringify(second), "deterministic rerun changed measurement output");
    process.stdout.write("deterministic rerun: identical\n");
  }
  if (!args.has("--no-write")) writeReport(first);
  if (args.has("--print")) {
    for (const row of first.summary) process.stdout.write(`${JSON.stringify(row)}\n`);
  }
  process.stdout.write(`raw runs: ${first.rawRuns.length}\n`);
  process.stdout.write(`artifact: ${OUTPUT}\n`);
}

if (require.main === module) main();

module.exports = { createReport, validateReport };
