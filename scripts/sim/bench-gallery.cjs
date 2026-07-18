"use strict";

const BENCH_GALLERY_ID = "bench-gallery-v1";
const BENCH_GALLERY_SEED = 303031;

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
    throw new Error(`Unknown Bench bay: ${activeBayId}`);
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
      tunableContract: null,
      contractStatus: "NO TUNABLE CONTRACT YET",
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

function activateBenchBay(gallery, activeBayId) {
  return createBenchGallery({ activeBayId, seed: gallery?.seed });
}

module.exports = {
  BAY_DEFINITIONS,
  BENCH_GALLERY_ID,
  BENCH_GALLERY_SEED,
  activateBenchBay,
  createBenchGallery,
};
