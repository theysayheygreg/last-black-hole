"use strict";

const { createBenchAdapterRegistry } = require("./bench-adapters.cjs");
const { benchValidation } = require("./bench-errors.cjs");
const {
  activateBenchBay,
  applyBenchScenarioAction,
  createBenchGallery,
  createBenchGalleryWorld,
  setBenchWorldActiveBay,
  tickBenchGalleryWorld,
  WELL_ARCHETYPE_ID,
  WELL_DEFAULTS,
  PLAYER_SHIP_ARCHETYPE_ID,
  PLAYER_SHIP_DEFAULTS,
  SCAVENGER_ARCHETYPE_ID,
  SCAVENGER_DEFAULTS,
  WRECK_ARCHETYPE_ID,
  WRECK_DEFAULTS,
  PORTAL_ARCHETYPE_ID,
  PORTAL_DEFAULTS,
} = require("./bench-gallery.cjs");
const { normalizeBenchTruth } = require("./bench-normalize.cjs");

const PATCH_SCHEMA = "lbh-bench-patch/v1";

function keyFor(entry) {
  return `${entry.adapterId}.${entry.propertyId}`;
}

function cloneEntries(map) {
  return Array.from(map.values()).map((entry) => ({ ...entry }));
}

function validateValue(value, property) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) throw benchValidation(`${property.id} requires a finite number`);
  if (numeric < property.min || numeric > property.max) {
    throw benchValidation(`${property.id} must be between ${property.min} and ${property.max}`);
  }
  const steps = Math.round((numeric - property.min) / property.step);
  const snapped = property.min + steps * property.step;
  if (Math.abs(snapped - numeric) > 1e-9) {
    throw benchValidation(`${property.id} must align to step ${property.step}`);
  }
  return numeric;
}

function validatePatch(patch, registry) {
  if (!patch || patch.schema !== PATCH_SCHEMA || !Array.isArray(patch.edits)) {
    throw benchValidation(`Bench patch must use schema ${PATCH_SCHEMA} with an edits array`);
  }
  const seen = new Set();
  return patch.edits.map((raw) => {
    const adapterId = String(raw?.adapterId || "").trim();
    const propertyId = String(raw?.propertyId || "").trim();
    const { property } = registry.requireProperty(adapterId, propertyId);
    const expectedStatus = property.applies === "restart" ? "banked-restart" : "live-applied";
    if (raw.applies !== property.applies || raw.status !== expectedStatus) {
      throw benchValidation(`Bench patch timing mismatch for ${adapterId}.${propertyId}`);
    }
    const entry = Object.freeze({
      adapterId,
      propertyId,
      value: validateValue(raw.value, property),
      applies: property.applies,
      status: expectedStatus,
    });
    const key = keyFor(entry);
    if (seen.has(key)) throw benchValidation(`Duplicate Bench patch entry: ${key}`);
    seen.add(key);
    return entry;
  });
}

function createBenchAuthority(options = {}) {
  const registry = options.registry || createBenchAdapterRegistry();
  const ownsRegistry = !options.registry;
  let gallery = createBenchGallery();
  const wellTuning = { ...WELL_DEFAULTS };
  const playerShipTuning = { ...PLAYER_SHIP_DEFAULTS };
  const scavengerTuning = { ...SCAVENGER_DEFAULTS };
  const wreckTuning = { ...WRECK_DEFAULTS };
  const portalTuning = { ...PORTAL_DEFAULTS };
  let world = createBenchGalleryWorld({ playerShipTuning, wellTuning, scavengerTuning, wreckTuning, portalTuning });
  const live = new Map();
  const restart = new Map();
  let undo = null;

  function propagatePlayerShipTuning() {
    for (const entity of world.entities) {
      if (entity.archetypeId !== PLAYER_SHIP_ARCHETYPE_ID) continue;
      entity.thrustAcceleration = playerShipTuning.thrustAcceleration;
      if (entity.scenarioState === "thrusting") {
        const displayDistance = Number((entity.thrustAcceleration * 24).toFixed(3));
        entity.wx = Number((entity.home.wx + displayDistance).toFixed(3));
        entity.vx = Number((entity.thrustAcceleration * 12).toFixed(3));
        entity.scenarioStateLabel = `Thrusting — ${entity.thrustAcceleration} world units/s²`;
        entity.thrustVector.to = { wx: entity.wx, wy: entity.wy };
        entity.thrustVector.magnitude = entity.thrustAcceleration;
      }
    }
  }

  function propagateWellTuning() {
    for (const entity of world.entities) {
      if (entity.archetypeId !== WELL_ARCHETYPE_ID) continue;
      entity.influenceRadius = wellTuning.influenceRadius;
      entity.geometry.radius = wellTuning.influenceRadius;
      entity.rulerFacts[0].distance = wellTuning.influenceRadius;
      entity.linkedSlingshot.captureDistance = Number((wellTuning.influenceRadius * 0.7).toFixed(3));
      entity.linkedSlingshot.ruler.toRadius = entity.linkedSlingshot.captureDistance;
    }
  }

  function propagateScavengerTuning() {
    for (const entity of world.entities) {
      if (entity.archetypeId !== SCAVENGER_ARCHETYPE_ID) continue;
      entity.detectionRadius = scavengerTuning.detectionRadius;
      entity.geometry.radius = scavengerTuning.detectionRadius;
      entity.rulerFacts[0].radius = scavengerTuning.detectionRadius;
      entity.rulerFacts[0].value = scavengerTuning.detectionRadius;
      entity.rulerFacts[0].distance = scavengerTuning.detectionRadius;
    }
  }

  function propagateWreckTuning() {
    for (const entity of world.entities) {
      if (entity.archetypeId !== WRECK_ARCHETYPE_ID) continue;
      entity.salvageRadius = wreckTuning.salvageRadius;
      entity.geometry.radius = wreckTuning.salvageRadius;
      entity.rulerFacts[0].radius = wreckTuning.salvageRadius;
      entity.rulerFacts[0].value = wreckTuning.salvageRadius;
      entity.rulerFacts[0].distance = wreckTuning.salvageRadius;
    }
  }

  function propagatePortalTuning() {
    for (const entity of world.entities) {
      if (entity.archetypeId !== PORTAL_ARCHETYPE_ID) continue;
      entity.captureRadius = portalTuning.captureRadius;
      entity.geometry.radius = portalTuning.captureRadius;
      entity.rulerFacts[0].radius = portalTuning.captureRadius;
      entity.rulerFacts[0].value = portalTuning.captureRadius;
      entity.rulerFacts[0].distance = portalTuning.captureRadius;
    }
  }

  if (ownsRegistry) {
    registry.register({
      id: PLAYER_SHIP_ARCHETYPE_ID,
      label: "Standard Player Ship",
      properties: [{
        id: "thrustAcceleration",
        label: "Thrust Acceleration",
        effect: "Changes forward acceleration for every Standard Player Ship and the distance shown by its thrust scenario.",
        group: "Drive",
        unit: "world units/s²",
        min: 1,
        max: 6,
        step: 0.5,
        scope: "type",
        applies: "live",
        drawKind: "vector",
        reset: "Restore the shipped player thrust acceleration.",
      }],
      getCurrent(property) { return playerShipTuning[property.id]; },
      apply({ property, value }) {
        playerShipTuning[property.id] = value;
        propagatePlayerShipTuning();
      },
      reset({ property }) {
        playerShipTuning[property.id] = PLAYER_SHIP_DEFAULTS[property.id];
        propagatePlayerShipTuning();
      },
    });
    registry.register({
      id: WELL_ARCHETYPE_ID,
      label: "Standard Well",
      properties: [{
        id: "influenceRadius",
        label: "Influence Radius",
        effect: "Changes the pull and linked slingshot ruler radius for every Standard Well.",
        group: "Gravity and Slingshot",
        unit: "world units",
        min: 100,
        max: 400,
        step: 10,
        scope: "type",
        applies: "live",
        drawKind: "radius",
        reset: "Restore the canonical Standard Well radius.",
      }],
      getCurrent(property) { return wellTuning[property.id]; },
      apply({ property, value }) {
        wellTuning[property.id] = value;
        propagateWellTuning();
      },
      reset({ property }) {
        wellTuning[property.id] = WELL_DEFAULTS[property.id];
        propagateWellTuning();
      },
    });
    registry.register({
      id: SCAVENGER_ARCHETYPE_ID,
      label: "Yard Scavenger",
      properties: [{
        id: "detectionRadius",
        label: "Detection Radius",
        effect: "Changes how far every Yard Scavenger can acquire a target in this scenario.",
        group: "Detection and Chase",
        unit: "world units",
        min: 80,
        max: 400,
        step: 20,
        scope: "type",
        applies: "live",
        drawKind: "radius",
        reset: "Restore the shipped Yard Scavenger detection radius.",
      }],
      getCurrent(property) { return scavengerTuning[property.id]; },
      apply({ property, value }) {
        scavengerTuning[property.id] = value;
        propagateScavengerTuning();
      },
      reset({ property }) {
        scavengerTuning[property.id] = SCAVENGER_DEFAULTS[property.id];
        propagateScavengerTuning();
      },
    });
    registry.register({
      id: WRECK_ARCHETYPE_ID,
      label: "Standard Wreck",
      properties: [{
        id: "salvageRadius",
        label: "Salvage Radius",
        effect: "Changes how close a ship must be to salvage every Standard Wreck.",
        group: "Wreck and Loot",
        unit: "world units",
        min: 50,
        max: 250,
        step: 10,
        scope: "type",
        applies: "live",
        drawKind: "radius",
        reset: "Restore the shipped Standard Wreck salvage radius.",
      }],
      getCurrent(property) { return wreckTuning[property.id]; },
      apply({ property, value }) {
        wreckTuning[property.id] = value;
        propagateWreckTuning();
      },
      reset({ property }) {
        wreckTuning[property.id] = WRECK_DEFAULTS[property.id];
        propagateWreckTuning();
      },
    });
    registry.register({
      id: PORTAL_ARCHETYPE_ID,
      label: "Extraction Portal",
      properties: [{
        id: "captureRadius",
        label: "Capture Radius",
        effect: "Changes the extraction capture area for every Extraction Portal.",
        group: "Portal and Objective",
        unit: "world units",
        min: 60,
        max: 300,
        step: 10,
        scope: "type",
        applies: "live",
        drawKind: "radius",
        reset: "Restore the shipped Extraction Portal capture radius.",
      }],
      getCurrent(property) { return portalTuning[property.id]; },
      apply({ property, value }) {
        portalTuning[property.id] = value;
        propagatePortalTuning();
      },
      reset({ property }) {
        portalTuning[property.id] = PORTAL_DEFAULTS[property.id];
        propagatePortalTuning();
      },
    });
  }

  function captureUndo() {
    undo = { live: cloneEntries(live), restart: cloneEntries(restart) };
  }

  function restoreEntries(target, entries) {
    target.clear();
    for (const entry of entries) target.set(keyFor(entry), { ...entry });
  }

  function applyEntry(rawEntry, { capture = true } = {}) {
    const { property: rawProperty } = registry.requireProperty(rawEntry.adapterId, rawEntry.propertyId);
    const [entry] = validatePatch({
      schema: PATCH_SCHEMA,
      edits: [{
        ...rawEntry,
        applies: rawProperty.applies,
        status: rawProperty.applies === "restart" ? "banked-restart" : "live-applied",
      }],
    }, registry);
    const { adapter, property } = registry.requireProperty(entry.adapterId, entry.propertyId);
    if (property.applies !== "restart" && !adapter.apply) {
      throw benchValidation(`Bench adapter ${adapter.id} has no authority applicator`);
    }
    if (property.applies !== "restart") {
      adapter.apply({ property, value: entry.value });
    }
    if (capture) captureUndo();
    const target = property.applies === "restart" ? restart : live;
    target.set(keyFor(entry), entry);
    return entry;
  }

  function importPatch(patch) {
    const edits = validatePatch(patch, registry);
    for (const entry of edits) {
      const { adapter, property } = registry.requireProperty(entry.adapterId, entry.propertyId);
      if (property.applies !== "restart" && !adapter.apply) {
        throw benchValidation(`Bench adapter ${adapter.id} has no authority applicator`);
      }
    }
    for (const entry of live.values()) {
      const { adapter, property } = registry.requireProperty(entry.adapterId, entry.propertyId);
      if (!adapter.reset) throw benchValidation(`Bench adapter ${adapter.id} has no authority reset applicator`);
      adapter.reset({ property });
    }
    for (const entry of edits) {
      const { adapter, property } = registry.requireProperty(entry.adapterId, entry.propertyId);
      if (property.applies !== "restart") adapter.apply({ property, value: entry.value });
    }
    captureUndo();
    restoreEntries(live, edits.filter((entry) => entry.applies !== "restart"));
    restoreEntries(restart, edits.filter((entry) => entry.applies === "restart"));
    return exportPatch();
  }

  function resetWhere(predicate) {
    const liveResets = Array.from(live.values()).filter(predicate).map((entry) => ({
      entry,
      ...registry.requireProperty(entry.adapterId, entry.propertyId),
    }));
    for (const { adapter } of liveResets) {
      if (!adapter.reset) throw benchValidation(`Bench adapter ${adapter.id} has no authority reset applicator`);
    }
    for (const { adapter, property } of liveResets) adapter.reset({ property });
    captureUndo();
    for (const [key, entry] of live) if (predicate(entry)) live.delete(key);
    for (const [key, entry] of restart) if (predicate(entry)) restart.delete(key);
    return exportPatch();
  }

  function exportPatch() {
    return {
      schema: PATCH_SCHEMA,
      edits: [...cloneEntries(live), ...cloneEntries(restart)].sort((a, b) => keyFor(a).localeCompare(keyFor(b))),
      liveApplied: cloneEntries(live),
      bankedRestart: cloneEntries(restart),
    };
  }

  function state() {
    return {
      enabled: true,
      gallery,
      world: snapshotWorld(),
      adapters: registry.describe(),
      patch: exportPatch(),
      canUndo: Boolean(undo),
    };
  }

  function snapshotWorld() {
    return JSON.parse(JSON.stringify(world));
  }

  return Object.freeze({
    activateBay(activeBayId) {
      gallery = activateBenchBay(gallery, activeBayId);
      setBenchWorldActiveBay(world, activeBayId);
      return state();
    },
    applyEntry,
    exportPatch,
    importPatch,
    registry,
    replaySameSetup() {
      gallery = createBenchGallery({ activeBayId: gallery.activeBayId });
      world = createBenchGalleryWorld({
        activeBayId: gallery.activeBayId,
        playerShipTuning,
        wellTuning,
        scavengerTuning,
        wreckTuning,
        portalTuning,
      });
      return normalizeBenchTruth({ gallery, patch: exportPatch(), world: snapshotWorld() });
    },
    runScenarioAction({ entityId = null, adapterId = null, actionId } = {}) {
      const action = applyBenchScenarioAction(world, { entityId, adapterId, actionId });
      return { action, state: state() };
    },
    resetAll() { return resetWhere(() => true); },
    resetProperty(adapterId, propertyId) {
      registry.requireProperty(adapterId, propertyId);
      return resetWhere((entry) => entry.adapterId === adapterId && entry.propertyId === propertyId);
    },
    resetType(adapterId) {
      registry.requireAdapter(adapterId);
      return resetWhere((entry) => entry.adapterId === adapterId);
    },
    state,
    snapshot() {
      return {
        galleryId: gallery.id,
        seed: gallery.seed,
        activeBayId: gallery.activeBayId,
        world: snapshotWorld(),
        patch: exportPatch(),
      };
    },
    tick(dt) {
      tickBenchGalleryWorld(world, dt);
      return snapshotWorld();
    },
    undoLastChange() {
      if (!undo) return false;
      const previous = undo;
      for (const entry of live.values()) {
        const { adapter, property } = registry.requireProperty(entry.adapterId, entry.propertyId);
        if (!adapter.reset) throw benchValidation(`Bench adapter ${adapter.id} has no authority reset applicator`);
        adapter.reset({ property });
      }
      for (const entry of previous.live) {
        const { adapter, property } = registry.requireProperty(entry.adapterId, entry.propertyId);
        if (!adapter.apply) throw benchValidation(`Bench adapter ${adapter.id} has no authority applicator`);
        adapter.apply({ property, value: entry.value });
      }
      restoreEntries(live, previous.live);
      restoreEntries(restart, previous.restart);
      undo = null;
      return true;
    },
  });
}

module.exports = {
  PATCH_SCHEMA,
  createBenchAuthority,
  validatePatch,
  validateValue,
};
