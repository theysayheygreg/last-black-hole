"use strict";

const { benchValidation } = require("./bench-errors.cjs");

const BENCH_GALLERY_ID = "bench-gallery-v1";
const BENCH_GALLERY_SEED = 303031;
const WELL_ARCHETYPE_ID = "well.standard";
const WELL_DEFAULTS = Object.freeze({ influenceRadius: 220, startMass: 80 });
const SCAVENGER_ARCHETYPE_ID = "scavenger.standard";
const SCAVENGER_DEFAULTS = Object.freeze({ detectionRadius: 180 });
const SCAVENGER_ACTIONS = Object.freeze([
  Object.freeze({ id: "idle", label: "Return to Idle", effect: "Returns the scavenger to its home marker with no target." }),
  Object.freeze({ id: "detect", label: "Detect Wreck", effect: "Acquires the yard wreck and shows the detection state." }),
  Object.freeze({ id: "chase", label: "Chase Wreck", effect: "Moves the scavenger toward the acquired yard wreck." }),
  Object.freeze({ id: "reset", label: "Reset Scenario", effect: "Restores the deterministic idle setup for this scavenger." }),
]);

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
      tunableContract: family === "wells"
        ? WELL_ARCHETYPE_ID
        : family === "scavengers" ? SCAVENGER_ARCHETYPE_ID : null,
      contractStatus: family === "wells" || family === "scavengers"
        ? "TUNABLE"
        : "NO TUNABLE CONTRACT YET",
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

function createScavengerEntities(exhibit, tuning) {
  return [
    { id: "bench:scavenger:standard:a", name: "Yard Scavenger A", wx: exhibit.placement.x - 430, wy: exhibit.placement.y - 45 },
    { id: "bench:scavenger:standard:b", name: "Yard Scavenger B", wx: exhibit.placement.x - 220, wy: exhibit.placement.y + 45 },
  ].map((placement) => ({
    ...placement,
    family: "scavengers",
    bayId: exhibit.bayId,
    representation: "runtime-archetype",
    contractStatus: "TUNABLE",
    selectable: true,
    archetypeId: SCAVENGER_ARCHETYPE_ID,
    archetype: SCAVENGER_ARCHETYPE_ID,
    adapterId: SCAVENGER_ARCHETYPE_ID,
    selectionKey: `archetype:${SCAVENGER_ARCHETYPE_ID}`,
    inspector: { adapterId: SCAVENGER_ARCHETYPE_ID, label: "Yard Scavenger" },
    detectionRadius: tuning.detectionRadius,
    radius: 22,
    geometry: {
      drawKind: "radius",
      center: { wx: placement.wx, wy: placement.wy },
      radius: tuning.detectionRadius,
    },
    rulerFacts: [{
      id: "detectionRadius",
      label: "Detection Radius",
      radius: tuning.detectionRadius,
      value: tuning.detectionRadius,
      distance: tuning.detectionRadius,
      unit: "world units",
    }],
    home: { wx: placement.wx, wy: placement.wy },
    scenarioState: "idle",
    scenarioStateLabel: "Idle — no target",
    targetId: null,
    targetPosition: null,
    scenarioActions: SCAVENGER_ACTIONS.map((action) => ({ ...action })),
    vx: 0,
    vy: 0,
    simulationKind: "scavenger-scenario",
    scenarioTicks: 0,
    scenarioPhase: placement.id.endsWith(":a") ? 0.15 : 0.65,
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
  scavengerTuning = SCAVENGER_DEFAULTS,
} = {}) {
  const gallery = createBenchGallery({ activeBayId });
  const entities = gallery.bays.flatMap((bay, bayIndex) => bay.exhibits.flatMap((exhibit, familyIndex) =>
    exhibit.family === "wells"
      ? createWellEntities(exhibit, { ...WELL_DEFAULTS, ...wellTuning })
      : exhibit.family === "scavengers"
        ? createScavengerEntities(exhibit, { ...SCAVENGER_DEFAULTS, ...scavengerTuning })
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

function applyBenchScenarioAction(world, { entityId = null, adapterId = null, actionId } = {}) {
  const normalizedAction = String(actionId || "").trim();
  if (!SCAVENGER_ACTIONS.some((action) => action.id === normalizedAction)) {
    throw benchValidation(`Unsupported Bench scenario action: ${actionId}`);
  }
  const normalizedEntityId = String(entityId || "").trim();
  const normalizedAdapterId = String(adapterId || "").trim();
  if (!normalizedEntityId && !normalizedAdapterId) {
    throw benchValidation("Bench scenario action requires entityId or adapterId");
  }
  const targets = world.entities.filter((entity) => entity.archetypeId === SCAVENGER_ARCHETYPE_ID
    && (normalizedEntityId ? entity.id === normalizedEntityId : entity.adapterId === normalizedAdapterId));
  if (targets.length === 0) throw benchValidation("Bench scenario action target was not found");

  const yardWreck = world.entities.find((entity) => entity.id === "bench:salvage-yard:wrecks");
  for (const entity of targets) {
    if (normalizedAction === "idle" || normalizedAction === "reset") {
      entity.wx = entity.home.wx;
      entity.wy = entity.home.wy;
      entity.geometry.center = { wx: entity.wx, wy: entity.wy };
      entity.scenarioState = "idle";
      entity.scenarioStateLabel = "Idle — no target";
      entity.targetId = null;
      entity.targetPosition = null;
      entity.vx = 0;
      entity.vy = 0;
      continue;
    }
    entity.targetId = yardWreck?.id || "bench:salvage-yard:wrecks";
    entity.targetPosition = yardWreck ? { wx: yardWreck.wx, wy: yardWreck.wy } : null;
    if (normalizedAction === "detect") {
      entity.scenarioState = "detected";
      entity.scenarioStateLabel = "Detected — yard wreck acquired";
      entity.vx = 0;
      entity.vy = 0;
      continue;
    }
    entity.scenarioState = "chasing";
    entity.scenarioStateLabel = "Chasing — closing on yard wreck";
    if (yardWreck) {
      const dx = yardWreck.wx - entity.home.wx;
      const dy = yardWreck.wy - entity.home.wy;
      const magnitude = Math.hypot(dx, dy) || 1;
      entity.wx = Number((yardWreck.wx - (dx / magnitude) * 72).toFixed(3));
      entity.wy = Number((yardWreck.wy - (dy / magnitude) * 72).toFixed(3));
      entity.geometry.center = { wx: entity.wx, wy: entity.wy };
      entity.vx = Number((dx / magnitude * 24).toFixed(3));
      entity.vy = Number((dy / magnitude * 24).toFixed(3));
    }
  }
  return {
    actionId: normalizedAction,
    targetIds: targets.map((entity) => entity.id),
    scenarioStates: targets.map((entity) => ({ entityId: entity.id, state: entity.scenarioState })),
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
  SCAVENGER_ACTIONS,
  SCAVENGER_ARCHETYPE_ID,
  SCAVENGER_DEFAULTS,
  activateBenchBay,
  applyBenchScenarioAction,
  createBenchGallery,
  createBenchGalleryWorld,
  setBenchWorldActiveBay,
  tickBenchGalleryWorld,
};
