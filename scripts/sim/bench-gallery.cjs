"use strict";

const { benchValidation } = require("./bench-errors.cjs");

const BENCH_GALLERY_ID = "bench-gallery-v1";
const BENCH_GALLERY_SEED = 303031;
const WELL_ARCHETYPE_ID = "well.standard";
const WELL_DEFAULTS = Object.freeze({ influenceRadius: 220, startMass: 80 });

const BAY_DEFINITIONS = Object.freeze([
  Object.freeze({
    id: "probe-and-ships",
    label: "Probe and Ships",
    families: Object.freeze(["probe-ship", "player-ships", "enemy-ships"]),
  }),
  Object.freeze({
    id: "gravity-and-anomalies",
    label: "Gravity and Anomalies",
    families: Object.freeze(["wells", "linked-slingshot", "stars", "anomalies"]),
  }),
  Object.freeze({
    id: "salvage-yard",
    label: "Salvage Yard",
    families: Object.freeze(["debris", "wrecks", "loot", "scavengers"]),
  }),
  Object.freeze({
    id: "terrain-and-life",
    label: "Terrain and Life",
    families: Object.freeze(["planetoids", "fauna", "sentries"]),
  }),
  Object.freeze({
    id: "objectives",
    label: "Portals and Objectives",
    families: Object.freeze(["portals", "objectives", "conductor-states"]),
  }),
]);

function stablePlacement(bayIndex, familyIndex) {
  return Object.freeze({
    x: bayIndex * 1200 + 200 + familyIndex * 180,
    y: 300 + (familyIndex % 2) * 220,
  });
}

function createBenchGallery({ activeBayId = BAY_DEFINITIONS[0].id } = {}) {
  if (!BAY_DEFINITIONS.some((bay) => bay.id === activeBayId)) {
    throw benchValidation(`Unknown Bench bay: ${activeBayId}`);
  }
  const bays = BAY_DEFINITIONS.map((bay, bayIndex) => ({
    ...bay,
    active: bay.id === activeBayId,
    simulation: bay.id === activeBayId ? "active" : "paused",
    exhibits: bay.families.map((family, familyIndex) => ({
      identity: `bench:${bay.id}:${family}`,
      family,
      bayId: bay.id,
      placement: stablePlacement(bayIndex, familyIndex),
      tunableContract: family === "wells" ? WELL_ARCHETYPE_ID : null,
      contractStatus: family === "wells" ? "TUNABLE" : "NO TUNABLE CONTRACT YET",
    })),
  }));
  return {
    id: BENCH_GALLERY_ID,
    name: "Bench Gallery",
    seed: BENCH_GALLERY_SEED,
    fixedLayout: true,
    activeBayId,
    bays,
  };
}

function createWellEntities(exhibit, tuning) {
  const captureDistance = Number((tuning.influenceRadius * 0.7).toFixed(3));
  return [
    { id: "bench:well:standard:a", label: "Standard Well A", wx: exhibit.placement.x - 90, wy: exhibit.placement.y },
    { id: "bench:well:standard:b", label: "Standard Well B", wx: exhibit.placement.x + 90, wy: exhibit.placement.y },
  ].map((placement) => ({
    ...placement,
    family: "wells",
    bayId: exhibit.bayId,
    representation: "runtime-archetype",
    contractStatus: "TUNABLE",
    selectable: true,
    archetypeId: WELL_ARCHETYPE_ID,
    archetype: WELL_ARCHETYPE_ID,
    adapterId: WELL_ARCHETYPE_ID,
    selectionKey: `archetype:${WELL_ARCHETYPE_ID}`,
    inspector: { adapterId: WELL_ARCHETYPE_ID, label: "Standard Well" },
    influenceRadius: tuning.influenceRadius,
    mass: tuning.startMass,
    radius: 30,
    geometry: {
      drawKind: "radius",
      center: { wx: placement.wx, wy: placement.wy },
      radius: tuning.influenceRadius,
    },
    rulerFacts: [{
      id: "influenceRadius",
      label: "Influence Radius",
      distance: tuning.influenceRadius,
      unit: "world units",
    }],
    linkedSlingshot: {
      captureDistance,
      ruler: { fromRadius: 0, toRadius: captureDistance, unit: "world units" },
    },
    vx: 0,
    vy: 0,
    simulationKind: "well-pulse",
    scenarioTicks: 0,
    scenarioPhase: placement.id.endsWith(":a") ? 0.2 : 0.6,
  }));
}

function createBenchEntity(exhibit, bayIndex, familyIndex) {
  const probe = exhibit.family === "probe-ship";
  return {
    id: exhibit.identity,
    family: exhibit.family,
    bayId: exhibit.bayId,
    representation: probe ? "authority-probe" : "read-only-placeholder",
    contractStatus: exhibit.contractStatus,
    wx: exhibit.placement.x,
    wy: exhibit.placement.y,
    vx: 0,
    vy: 0,
    radius: probe ? 24 : 18,
    active: exhibit.bayId === BAY_DEFINITIONS[0].id,
    simulation: exhibit.bayId === BAY_DEFINITIONS[0].id ? "active" : "paused",
    simulationKind: "scenario-pulse",
    scenarioTicks: 0,
    scenarioPhase: Number(((bayIndex + 1) * 0.17 + (familyIndex + 1) * 0.07).toFixed(6)),
    ...(probe ? {
      name: "Bench Probe",
      status: "alive",
      invulnerable: true,
      fuel: "infinite",
      infiniteFuel: true,
    } : {}),
  };
}

function createBenchGalleryWorld({
  activeBayId = BAY_DEFINITIONS[0].id,
  wellTuning = WELL_DEFAULTS,
} = {}) {
  const gallery = createBenchGallery({ activeBayId });
  const entities = gallery.bays.flatMap((bay, bayIndex) => bay.exhibits.flatMap((exhibit, familyIndex) =>
    exhibit.family === "wells"
      ? createWellEntities(exhibit, { ...WELL_DEFAULTS, ...wellTuning })
      : [createBenchEntity(exhibit, bayIndex, familyIndex)]
  ));
  setBenchWorldActiveBay({ entities }, activeBayId);
  return {
    id: gallery.id,
    seed: gallery.seed,
    fixedLayout: true,
    activeBayId,
    scenarioTime: 0,
    entities,
  };
}

function setBenchWorldActiveBay(world, activeBayId) {
  if (!BAY_DEFINITIONS.some((bay) => bay.id === activeBayId)) {
    throw benchValidation(`Unknown Bench bay: ${activeBayId}`);
  }
  world.activeBayId = activeBayId;
  for (const entity of world.entities) {
    entity.active = entity.bayId === activeBayId;
    entity.simulation = entity.active ? "active" : "paused";
  }
  return world;
}

function tickBenchGalleryWorld(world, dt) {
  const step = Number(dt);
  if (!Number.isFinite(step) || step < 0) throw benchValidation("Bench Gallery tick requires a non-negative dt");
  world.scenarioTime = Number((world.scenarioTime + step).toFixed(9));
  for (const entity of world.entities) {
    if (!entity.active || entity.simulationKind === "none") continue;
    entity.scenarioTicks += 1;
    entity.scenarioPhase = Number(((entity.scenarioPhase + step * 0.25) % 1).toFixed(9));
  }
  return world;
}

function activateBenchBay(gallery, activeBayId) {
  return createBenchGallery({ activeBayId, seed: gallery?.seed });
}

module.exports = {
  BAY_DEFINITIONS,
  BENCH_GALLERY_ID,
  BENCH_GALLERY_SEED,
  WELL_ARCHETYPE_ID,
  WELL_DEFAULTS,
  activateBenchBay,
  createBenchGallery,
  createBenchGalleryWorld,
  setBenchWorldActiveBay,
  tickBenchGalleryWorld,
};
