"use strict";

const { createBenchAdapterRegistry } = require("./bench-adapters.cjs");
const { activateBenchBay, createBenchGallery } = require("./bench-gallery.cjs");
const { normalizeBenchTruth } = require("./bench-normalize.cjs");

const PATCH_VERSION = 1;

function keyFor(entry) {
  return `${entry.adapterId}.${entry.propertyId}`;
}

function cloneEntries(map) {
  return Array.from(map.values()).map((entry) => ({ ...entry }));
}

function validateValue(value, property) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) throw new Error(`${property.id} requires a finite number`);
  if (numeric < property.min || numeric > property.max) {
    throw new Error(`${property.id} must be between ${property.min} and ${property.max}`);
  }
  const steps = Math.round((numeric - property.min) / property.step);
  const snapped = property.min + steps * property.step;
  if (Math.abs(snapped - numeric) > 1e-9) {
    throw new Error(`${property.id} must align to step ${property.step}`);
  }
  return numeric;
}

function validatePatch(patch, registry) {
  if (!patch || patch.version !== PATCH_VERSION || !Array.isArray(patch.entries)) {
    throw new Error(`Bench patch must use version ${PATCH_VERSION} with an entries array`);
  }
  const seen = new Set();
  return patch.entries.map((raw) => {
    const adapterId = String(raw?.adapterId || "").trim();
    const propertyId = String(raw?.propertyId || "").trim();
    const { property } = registry.requireProperty(adapterId, propertyId);
    const entry = Object.freeze({
      adapterId,
      propertyId,
      value: validateValue(raw.value, property),
      timing: property.timing,
    });
    const key = keyFor(entry);
    if (seen.has(key)) throw new Error(`Duplicate Bench patch entry: ${key}`);
    seen.add(key);
    return entry;
  });
}

function createBenchAuthority({ registry = createBenchAdapterRegistry() } = {}) {
  let gallery = createBenchGallery();
  const live = new Map();
  const restart = new Map();
  let undo = null;

  function captureUndo() {
    undo = { live: cloneEntries(live), restart: cloneEntries(restart) };
  }

  function restoreEntries(target, entries) {
    target.clear();
    for (const entry of entries) target.set(keyFor(entry), { ...entry });
  }

  function applyEntry(rawEntry, { capture = true } = {}) {
    const [entry] = validatePatch({ version: PATCH_VERSION, entries: [rawEntry] }, registry);
    const { adapter, property } = registry.requireProperty(entry.adapterId, entry.propertyId);
    if (property.timing !== "RESTART" && !adapter.apply) {
      throw new Error(`Bench adapter ${adapter.id} has no authority applicator`);
    }
    if (capture) captureUndo();
    const target = property.timing === "RESTART" ? restart : live;
    target.set(keyFor(entry), entry);
    if (property.timing !== "RESTART") {
      adapter.apply({ property, value: entry.value });
    }
    return entry;
  }

  function importPatch(patch) {
    const entries = validatePatch(patch, registry);
    for (const entry of entries) {
      const { adapter, property } = registry.requireProperty(entry.adapterId, entry.propertyId);
      if (property.timing !== "RESTART" && !adapter.apply) {
        throw new Error(`Bench adapter ${adapter.id} has no authority applicator`);
      }
    }
    captureUndo();
    for (const entry of live.values()) {
      const { adapter, property } = registry.requireProperty(entry.adapterId, entry.propertyId);
      if (!adapter.reset) throw new Error(`Bench adapter ${adapter.id} has no authority reset applicator`);
      adapter.reset({ property });
    }
    live.clear();
    restart.clear();
    for (const entry of entries) applyEntry(entry, { capture: false });
    return exportPatch();
  }

  function resetWhere(predicate) {
    const liveResets = Array.from(live.values()).filter(predicate).map((entry) => ({
      entry,
      ...registry.requireProperty(entry.adapterId, entry.propertyId),
    }));
    for (const { adapter } of liveResets) {
      if (!adapter.reset) throw new Error(`Bench adapter ${adapter.id} has no authority reset applicator`);
    }
    captureUndo();
    for (const { adapter, property } of liveResets) adapter.reset({ property });
    for (const [key, entry] of live) if (predicate(entry)) live.delete(key);
    for (const [key, entry] of restart) if (predicate(entry)) restart.delete(key);
    return exportPatch();
  }

  function exportPatch() {
    return {
      version: PATCH_VERSION,
      entries: [...cloneEntries(live), ...cloneEntries(restart)].sort((a, b) => keyFor(a).localeCompare(keyFor(b))),
      liveApplied: cloneEntries(live),
      bankedRestart: cloneEntries(restart),
    };
  }

  function state() {
    return {
      enabled: true,
      gallery,
      adapters: registry.describe(),
      patch: exportPatch(),
      canUndo: Boolean(undo),
    };
  }

  return Object.freeze({
    activateBay(activeBayId) {
      gallery = activateBenchBay(gallery, activeBayId);
      return state();
    },
    applyEntry,
    exportPatch,
    importPatch,
    registry,
    replaySameSetup(worldTruth = {}) {
      gallery = createBenchGallery({ activeBayId: gallery.activeBayId });
      return normalizeBenchTruth({ gallery, patch: exportPatch(), worldTruth });
    },
    resetAll() { return resetWhere(() => true); },
    resetProperty(adapterId, propertyId) {
      return resetWhere((entry) => entry.adapterId === adapterId && entry.propertyId === propertyId);
    },
    resetType(adapterId) { return resetWhere((entry) => entry.adapterId === adapterId); },
    state,
    undoLastChange() {
      if (!undo) return false;
      const previous = undo;
      for (const entry of live.values()) {
        const { adapter, property } = registry.requireProperty(entry.adapterId, entry.propertyId);
        if (!adapter.reset) throw new Error(`Bench adapter ${adapter.id} has no authority reset applicator`);
        adapter.reset({ property });
      }
      for (const entry of previous.live) {
        const { adapter, property } = registry.requireProperty(entry.adapterId, entry.propertyId);
        if (!adapter.apply) throw new Error(`Bench adapter ${adapter.id} has no authority applicator`);
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
  PATCH_VERSION,
  createBenchAuthority,
  validatePatch,
  validateValue,
};
