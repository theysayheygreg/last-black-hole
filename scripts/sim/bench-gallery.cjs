"use strict";

const { benchValidation } = require("./bench-errors.cjs");
const MOVEMENT = require("../../src/content/movement.data.json");

const BENCH_GALLERY_ID = "bench-gallery-v1";
const BENCH_GALLERY_SEED = 303031;
const WELL_ARCHETYPE_ID = "well.standard";
const WELL_DEFAULTS = Object.freeze({ influenceRadius: 220, startMass: 80 });
const PLAYER_SHIP_ARCHETYPE_ID = "ship.player.standard";
const PLAYER_SHIP_DEFAULTS = Object.freeze({ thrustAcceleration: MOVEMENT.player.thrustAccel });
const PLAYER_SHIP_ACTIONS = Object.freeze([
  Object.freeze({ id: "idle", label: "Return to Idle", effect: "Returns the ship to its launch marker with engines idle." }),
  Object.freeze({ id: "thrust", label: "Run Thrust Step", effect: "Runs one bounded forward thrust step using the current type acceleration." }),
  Object.freeze({ id: "coast", label: "Coast", effect: "Holds the ship at the end of its thrust step with engines off." }),
  Object.freeze({ id: "reset", label: "Reset Scenario", effect: "Restores the deterministic launch setup for this ship." }),
]);
const SCAVENGER_ARCHETYPE_ID = "scavenger.standard";
const SCAVENGER_DEFAULTS = Object.freeze({ detectionRadius: 180 });
const SCAVENGER_ACTIONS = Object.freeze([
  Object.freeze({ id: "idle", label: "Return to Idle", effect: "Returns the scavenger to its home marker with no target." }),
  Object.freeze({ id: "detect", label: "Detect Wreck", effect: "Acquires the yard wreck and shows the detection state." }),
  Object.freeze({ id: "chase", label: "Chase Wreck", effect: "Moves the scavenger toward the acquired yard wreck." }),
  Object.freeze({ id: "reset", label: "Reset Scenario", effect: "Restores the deterministic idle setup for this scavenger." }),
]);
const WRECK_ARCHETYPE_ID = "wreck.standard";
const WRECK_DEFAULTS = Object.freeze({ salvageRadius: 110 });
const WRECK_ACTIONS = Object.freeze([
  Object.freeze({ id: "intact", label: "Restore Intact", effect: "Reseals the wreck and returns its debris and loot to the deterministic setup." }),
  Object.freeze({ id: "loot", label: "Expose Loot", effect: "Opens the wreck and makes its nearby salvage available." }),
  Object.freeze({ id: "destroy", label: "Destroy Wreck", effect: "Breaks the wreck apart and scatters its debris while leaving salvage exposed." }),
]);
const PORTAL_ARCHETYPE_ID = "portal.extraction";
const PORTAL_DEFAULTS = Object.freeze({ captureRadius: 140 });
const PORTAL_ACTIONS = Object.freeze([
  Object.freeze({ id: "announce", label: "Announce Portal", effect: "Marks the extraction portal as the active objective." }),
  Object.freeze({ id: "open", label: "Open Portal", effect: "Opens the portal and shows its live extraction capture area." }),
  Object.freeze({ id: "blocked", label: "Block Extraction", effect: "Closes extraction behind an objective blocker." }),
  Object.freeze({ id: "extract", label: "Run Extraction", effect: "Completes the extraction beat for this portal scenario." }),
  Object.freeze({ id: "reset", label: "Reset Scenario", effect: "Restores the deterministic dormant portal setup." }),
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
      tunableContract: family === "player-ships"
        ? PLAYER_SHIP_ARCHETYPE_ID
        : family === "wells"
        ? WELL_ARCHETYPE_ID
        : family === "scavengers"
          ? SCAVENGER_ARCHETYPE_ID
          : family === "wrecks"
            ? WRECK_ARCHETYPE_ID
            : family === "portals" ? PORTAL_ARCHETYPE_ID : null,
      contractStatus: family === "player-ships" || family === "wells" || family === "scavengers" || family === "wrecks" || family === "portals"
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

function createPlayerShipEntities(exhibit, tuning) {
  return [
    { id: "bench:ship:player:standard:a", name: "Standard Ship A", wx: exhibit.placement.x - 80, wy: exhibit.placement.y - 35 },
    { id: "bench:ship:player:standard:b", name: "Standard Ship B", wx: exhibit.placement.x + 70, wy: exhibit.placement.y + 35 },
  ].map((placement) => ({
    ...placement,
    family: "player-ships",
    bayId: exhibit.bayId,
    representation: "runtime-archetype",
    contractStatus: "TUNABLE",
    selectable: true,
    archetypeId: PLAYER_SHIP_ARCHETYPE_ID,
    archetype: PLAYER_SHIP_ARCHETYPE_ID,
    adapterId: PLAYER_SHIP_ARCHETYPE_ID,
    selectionKey: `archetype:${PLAYER_SHIP_ARCHETYPE_ID}`,
    inspector: { adapterId: PLAYER_SHIP_ARCHETYPE_ID, label: "Standard Player Ship" },
    thrustAcceleration: tuning.thrustAcceleration,
    radius: 24,
    home: { wx: placement.wx, wy: placement.wy },
    facing: 0,
    scenarioState: "idle",
    scenarioStateLabel: "Idle — engines cold",
    scenarioActions: PLAYER_SHIP_ACTIONS.map((action) => ({ ...action })),
    thrusting: false,
    thrustVector: {
      from: { wx: placement.wx, wy: placement.wy },
      to: { wx: placement.wx, wy: placement.wy },
      magnitude: 0,
      unit: "world units/s²",
    },
    vx: 0,
    vy: 0,
    simulationKind: "player-ship-scenario",
    scenarioTicks: 0,
    scenarioPhase: placement.id.endsWith(":a") ? 0.12 : 0.62,
  }));
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
    { id: "bench:scavenger:standard:a", name: "Yard Scavenger A", wx: exhibit.placement.x - 40, wy: exhibit.placement.y - 45 },
    { id: "bench:scavenger:standard:b", name: "Yard Scavenger B", wx: exhibit.placement.x + 180, wy: exhibit.placement.y + 45 },
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

function createWreckEntities(exhibit, tuning) {
  return [
    { id: "bench:wreck:standard:a", name: "Standard Wreck A", wx: exhibit.placement.x - 70, wy: exhibit.placement.y - 35 },
    { id: "bench:wreck:standard:b", name: "Standard Wreck B", wx: exhibit.placement.x + 90, wy: exhibit.placement.y + 45 },
  ].map((placement) => ({
    ...placement,
    family: "wrecks",
    bayId: exhibit.bayId,
    representation: "runtime-archetype",
    contractStatus: "TUNABLE",
    selectable: true,
    archetypeId: WRECK_ARCHETYPE_ID,
    archetype: WRECK_ARCHETYPE_ID,
    adapterId: WRECK_ARCHETYPE_ID,
    selectionKey: `archetype:${WRECK_ARCHETYPE_ID}`,
    inspector: { adapterId: WRECK_ARCHETYPE_ID, label: "Standard Wreck" },
    salvageRadius: tuning.salvageRadius,
    radius: 30,
    geometry: {
      drawKind: "radius",
      center: { wx: placement.wx, wy: placement.wy },
      radius: tuning.salvageRadius,
    },
    rulerFacts: [{
      id: "salvageRadius",
      label: "Salvage Radius",
      radius: tuning.salvageRadius,
      value: tuning.salvageRadius,
      distance: tuning.salvageRadius,
      unit: "world units",
    }],
    scenarioState: "intact",
    scenarioStateLabel: "Intact — salvage sealed",
    scenarioActions: WRECK_ACTIONS.map((action) => ({ ...action })),
    integrity: 1,
    lootExposed: false,
    vx: 0,
    vy: 0,
    simulationKind: "wreck-scenario",
    scenarioTicks: 0,
    scenarioPhase: placement.id.endsWith(":a") ? 0.3 : 0.7,
  }));
}

function createDebrisEntities(exhibit) {
  return [
    { id: "bench:debris:plate:a", name: "Hull Plate", dx: -55, dy: -30 },
    { id: "bench:debris:plate:b", name: "Engine Debris", dx: 35, dy: 20 },
    { id: "bench:debris:plate:c", name: "Broken Spar", dx: 75, dy: -45 },
  ].map((part, index) => ({
    id: part.id,
    name: part.name,
    family: "debris",
    bayId: exhibit.bayId,
    representation: "authority-scenario-object",
    contractStatus: "NO TUNABLE CONTRACT YET",
    selectable: true,
    archetypeId: "debris.wreckage",
    archetype: "debris.wreckage",
    selectionKey: "archetype:debris.wreckage",
    wx: exhibit.placement.x + part.dx,
    wy: exhibit.placement.y + part.dy,
    home: { wx: exhibit.placement.x + part.dx, wy: exhibit.placement.y + part.dy },
    radius: 13,
    scenarioState: "compact",
    scenarioStateLabel: "Compact — beside intact wreck",
    scattered: false,
    vx: 0,
    vy: 0,
    simulationKind: "wreck-scenario",
    scenarioTicks: 0,
    scenarioPhase: Number((0.2 + index * 0.21).toFixed(3)),
  }));
}

function createLootEntities(exhibit) {
  return [
    { id: "bench:loot:salvage:a", name: "Salvage Canister", dx: -38, dy: -20 },
    { id: "bench:loot:salvage:b", name: "Fuel Cell", dx: 48, dy: 25 },
  ].map((item, index) => ({
    id: item.id,
    name: item.name,
    family: "loot",
    bayId: exhibit.bayId,
    representation: "authority-scenario-object",
    contractStatus: "NO TUNABLE CONTRACT YET",
    selectable: true,
    archetypeId: "loot.salvage",
    archetype: "loot.salvage",
    selectionKey: "archetype:loot.salvage",
    wx: exhibit.placement.x + item.dx,
    wy: exhibit.placement.y + item.dy,
    radius: 12,
    scenarioState: "stowed",
    scenarioStateLabel: "Stowed — sealed in wreck",
    available: false,
    revealed: false,
    vx: 0,
    vy: 0,
    simulationKind: "wreck-scenario",
    scenarioTicks: 0,
    scenarioPhase: Number((0.35 + index * 0.28).toFixed(3)),
  }));
}

function createPortalEntities(exhibit, tuning) {
  return [
    { id: "bench:portal:extraction:a", name: "Extraction Portal A", wx: exhibit.placement.x - 90, wy: exhibit.placement.y - 30 },
    { id: "bench:portal:extraction:b", name: "Extraction Portal B", wx: exhibit.placement.x + 110, wy: exhibit.placement.y + 35 },
  ].map((placement) => ({
    ...placement,
    family: "portals",
    bayId: exhibit.bayId,
    representation: "runtime-archetype",
    contractStatus: "TUNABLE",
    selectable: true,
    archetypeId: PORTAL_ARCHETYPE_ID,
    archetype: PORTAL_ARCHETYPE_ID,
    adapterId: PORTAL_ARCHETYPE_ID,
    selectionKey: `archetype:${PORTAL_ARCHETYPE_ID}`,
    inspector: { adapterId: PORTAL_ARCHETYPE_ID, label: "Extraction Portal" },
    captureRadius: tuning.captureRadius,
    radius: 34,
    geometry: {
      drawKind: "radius",
      center: { wx: placement.wx, wy: placement.wy },
      radius: tuning.captureRadius,
    },
    rulerFacts: [{
      id: "captureRadius",
      label: "Capture Radius",
      radius: tuning.captureRadius,
      value: tuning.captureRadius,
      distance: tuning.captureRadius,
      unit: "world units",
    }],
    scenarioState: "dormant",
    scenarioStateLabel: "Dormant — awaiting announcement",
    objectiveState: "inactive",
    objectiveLabel: "Extraction objective inactive",
    announced: false,
    open: false,
    blocked: false,
    extracted: false,
    scenarioActions: PORTAL_ACTIONS.map((action) => ({ ...action })),
    vx: 0,
    vy: 0,
    simulationKind: "portal-scenario",
    scenarioTicks: 0,
    scenarioPhase: placement.id.endsWith(":a") ? 0.18 : 0.68,
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
  playerShipTuning = PLAYER_SHIP_DEFAULTS,
  wellTuning = WELL_DEFAULTS,
  scavengerTuning = SCAVENGER_DEFAULTS,
  wreckTuning = WRECK_DEFAULTS,
  portalTuning = PORTAL_DEFAULTS,
} = {}) {
  const gallery = createBenchGallery({ activeBayId });
  const entities = gallery.bays.flatMap((bay, bayIndex) => bay.exhibits.flatMap((exhibit, familyIndex) =>
    exhibit.family === "player-ships"
      ? createPlayerShipEntities(exhibit, { ...PLAYER_SHIP_DEFAULTS, ...playerShipTuning })
      : exhibit.family === "wells"
      ? createWellEntities(exhibit, { ...WELL_DEFAULTS, ...wellTuning })
      : exhibit.family === "scavengers"
        ? createScavengerEntities(exhibit, { ...SCAVENGER_DEFAULTS, ...scavengerTuning })
      : exhibit.family === "wrecks"
        ? createWreckEntities(exhibit, { ...WRECK_DEFAULTS, ...wreckTuning })
      : exhibit.family === "debris"
        ? createDebrisEntities(exhibit)
      : exhibit.family === "loot"
        ? createLootEntities(exhibit)
      : exhibit.family === "portals"
        ? createPortalEntities(exhibit, { ...PORTAL_DEFAULTS, ...portalTuning })
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
  const normalizedEntityId = String(entityId || "").trim();
  const normalizedAdapterId = String(adapterId || "").trim();
  if (!normalizedEntityId && !normalizedAdapterId) {
    throw benchValidation("Bench scenario action requires entityId or adapterId");
  }
  const requestedTargets = world.entities.filter((entity) =>
    normalizedEntityId ? entity.id === normalizedEntityId : entity.adapterId === normalizedAdapterId);
  const archetypeId = requestedTargets[0]?.archetypeId;
  const supportedActions = archetypeId === SCAVENGER_ARCHETYPE_ID
    ? SCAVENGER_ACTIONS
    : archetypeId === PLAYER_SHIP_ARCHETYPE_ID
      ? PLAYER_SHIP_ACTIONS
    : archetypeId === WRECK_ARCHETYPE_ID
      ? WRECK_ACTIONS
      : archetypeId === PORTAL_ARCHETYPE_ID ? PORTAL_ACTIONS : [];
  if (!supportedActions.some((action) => action.id === normalizedAction)) {
    throw benchValidation(`Unsupported Bench scenario action: ${actionId}`);
  }
  const targets = requestedTargets.filter((entity) => entity.archetypeId === archetypeId);
  if (targets.length === 0) throw benchValidation("Bench scenario action target was not found");

  if (archetypeId === PLAYER_SHIP_ARCHETYPE_ID) {
    for (const entity of targets) {
      if (normalizedAction === "idle" || normalizedAction === "reset") {
        entity.wx = entity.home.wx;
        entity.wy = entity.home.wy;
        entity.scenarioState = "idle";
        entity.scenarioStateLabel = "Idle — engines cold";
        entity.thrusting = false;
        entity.vx = 0;
        entity.vy = 0;
        entity.thrustVector = {
          from: { ...entity.home },
          to: { ...entity.home },
          magnitude: 0,
          unit: "world units/s²",
        };
        continue;
      }
      if (normalizedAction === "coast") {
        entity.scenarioState = "coasting";
        entity.scenarioStateLabel = "Coasting — engines off";
        entity.thrusting = false;
        entity.vx = 0;
        entity.vy = 0;
        continue;
      }
      const displayDistance = Number((entity.thrustAcceleration * 24).toFixed(3));
      entity.wx = Number((entity.home.wx + displayDistance).toFixed(3));
      entity.wy = entity.home.wy;
      entity.scenarioState = "thrusting";
      entity.scenarioStateLabel = `Thrusting — ${entity.thrustAcceleration} world units/s²`;
      entity.thrusting = true;
      entity.vx = Number((entity.thrustAcceleration * 12).toFixed(3));
      entity.vy = 0;
      entity.thrustVector = {
        from: { ...entity.home },
        to: { wx: entity.wx, wy: entity.wy },
        magnitude: entity.thrustAcceleration,
        unit: "world units/s²",
      };
    }
    return {
      actionId: normalizedAction,
      targetIds: targets.map((entity) => entity.id),
      scenarioStates: targets.map((entity) => ({ entityId: entity.id, state: entity.scenarioState })),
    };
  }

  if (archetypeId === WRECK_ARCHETYPE_ID) {
    const debris = world.entities.filter((entity) => entity.family === "debris");
    const loot = world.entities.filter((entity) => entity.family === "loot");
    for (const entity of targets) {
      entity.scenarioState = normalizedAction === "loot" ? "looted" : normalizedAction;
      entity.scenarioStateLabel = normalizedAction === "intact"
        ? "Intact — salvage sealed"
        : normalizedAction === "loot" ? "Open — salvage exposed" : "Destroyed — debris scattered";
      entity.integrity = normalizedAction === "destroy" ? 0 : normalizedAction === "loot" ? 0.55 : 1;
      entity.lootExposed = normalizedAction !== "intact";
    }
    for (const entity of loot) {
      entity.available = normalizedAction !== "intact";
      entity.revealed = normalizedAction !== "intact";
      entity.scenarioState = normalizedAction === "intact" ? "stowed" : "available";
      entity.scenarioStateLabel = normalizedAction === "intact"
        ? "Stowed — sealed in wreck"
        : "Available — ready for pickup";
    }
    for (const [index, entity] of debris.entries()) {
      entity.scattered = normalizedAction === "destroy";
      entity.scenarioState = normalizedAction === "destroy" ? "scattered" : "compact";
      entity.scenarioStateLabel = normalizedAction === "destroy"
        ? "Scattered — wreck destroyed"
        : "Compact — beside intact wreck";
      entity.wx = entity.home.wx + (normalizedAction === "destroy" ? (index - 1) * 70 : 0);
      entity.wy = entity.home.wy + (normalizedAction === "destroy" ? (index % 2 === 0 ? -65 : 70) : 0);
    }
    return {
      actionId: normalizedAction,
      targetIds: targets.map((entity) => entity.id),
      scenarioStates: targets.map((entity) => ({ entityId: entity.id, state: entity.scenarioState })),
      affectedIds: [...debris, ...loot].map((entity) => entity.id),
    };
  }

  if (archetypeId === PORTAL_ARCHETYPE_ID) {
    for (const entity of targets) {
      const state = normalizedAction === "reset" ? "dormant" : normalizedAction;
      entity.scenarioState = state;
      entity.scenarioStateLabel = state === "dormant"
        ? "Dormant — awaiting announcement"
        : state === "announce"
          ? "Announced — extraction objective active"
          : state === "open"
            ? "Open — ship may enter capture radius"
            : state === "blocked"
              ? "Blocked — objective requirement unmet"
              : "Extracted — scenario complete";
      entity.objectiveState = state === "dormant"
        ? "inactive"
        : state === "extract" ? "complete" : state === "blocked" ? "blocked" : "active";
      entity.objectiveLabel = state === "dormant"
        ? "Extraction objective inactive"
        : state === "extract"
          ? "Extraction objective complete"
          : state === "blocked" ? "Extraction objective blocked" : "Extraction objective active";
      entity.announced = state !== "dormant";
      entity.open = state === "open" || state === "extract";
      entity.blocked = state === "blocked";
      entity.extracted = state === "extract";
    }
    return {
      actionId: normalizedAction,
      targetIds: targets.map((entity) => entity.id),
      scenarioStates: targets.map((entity) => ({ entityId: entity.id, state: entity.scenarioState })),
    };
  }

  const yardWreck = world.entities.find((entity) => entity.id === "bench:wreck:standard:a");
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
    entity.targetId = yardWreck?.id || "bench:wreck:standard:a";
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
  PLAYER_SHIP_ACTIONS,
  PLAYER_SHIP_ARCHETYPE_ID,
  PLAYER_SHIP_DEFAULTS,
  SCAVENGER_ACTIONS,
  SCAVENGER_ARCHETYPE_ID,
  SCAVENGER_DEFAULTS,
  WRECK_ACTIONS,
  WRECK_ARCHETYPE_ID,
  WRECK_DEFAULTS,
  PORTAL_ACTIONS,
  PORTAL_ARCHETYPE_ID,
  PORTAL_DEFAULTS,
  activateBenchBay,
  applyBenchScenarioAction,
  createBenchGallery,
  createBenchGalleryWorld,
  setBenchWorldActiveBay,
  tickBenchGalleryWorld,
};
