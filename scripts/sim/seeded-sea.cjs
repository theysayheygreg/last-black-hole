const crypto = require("crypto");
const { wrappedDelta } = require("./world-geometry.cjs");

const SEEDED_SEA_SCHEMA_VERSION = 1;
const SEEDED_SEA_STREAMS = Object.freeze({
  layout: "seededSea.layout",
  motion: "seededSea.motion",
  phase: "seededSea.phase",
});

const TAU = Math.PI * 2;
const MIN_SWELL_COUNT = 2;
const MAX_SWELL_COUNT = 4;
const AMBIENT_FLOOR = 0.30;
const BASE_THRUST_ACCEL = 2.5;
const OUTSIDE_WELL_FLOOR_FACTOR = 0.2;

function finite(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function wrapPhase(value) {
  return ((value % TAU) + TAU) % TAU;
}

function stableNumber(value) {
  return Number(finite(value).toFixed(9));
}

function stableHistory(wells = []) {
  return wells
    .map((well, index) => ({
      id: String(well?.id ?? well?.name ?? `well-${index}`),
      wx: stableNumber(well?.wx ?? well?.x),
      wy: stableNumber(well?.wy ?? well?.y),
      mass: stableNumber(well?.mass ?? 1),
      growthRate: stableNumber(well?.growthRate ?? 0),
      orbitalDir: finite(well?.orbitalDir, 1) < 0 ? -1 : 1,
    }))
    .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}

function requireStream(rngStreams, name) {
  if (!rngStreams || typeof rngStreams.rawStream !== "function") {
    throw new TypeError("Seeded sea generation requires the existing named RNG streams");
  }
  return rngStreams.rawStream(name);
}

function createSeededSea({ seed, mapId, worldScale, wells, rngStreams }) {
  const historyWells = stableHistory(wells);
  if (historyWells.length === 0) {
    throw new RangeError("Seeded sea generation requires map procgen well history");
  }

  const layoutRng = requireStream(rngStreams, SEEDED_SEA_STREAMS.layout);
  const motionRng = requireStream(rngStreams, SEEDED_SEA_STREAMS.motion);
  const phaseRng = requireStream(rngStreams, SEEDED_SEA_STREAMS.phase);
  const swellCount = MIN_SWELL_COUNT + Math.floor(layoutRng() * (MAX_SWELL_COUNT - MIN_SWELL_COUNT + 1));
  const normalizedWorldScale = Math.max(0.01, finite(worldScale, 1));

  const trains = [];
  for (let index = 0; index < swellCount; index += 1) {
    const source = historyWells[Math.floor(layoutRng() * historyWells.length)];
    const heading = motionRng() * TAU;
    trains.push({
      id: `swell-${index + 1}`,
      sourceWellId: source.id,
      sourceWX: source.wx,
      sourceWY: source.wy,
      heading: stableNumber(heading),
      wavelength: stableNumber(0.75 + motionRng() * 0.75),
      speed: stableNumber(0.18 + motionRng() * 0.18),
      amplitude: stableNumber(0.12 + motionRng() * 0.16),
      influenceRadius: stableNumber(Math.max(0.75, Math.min(normalizedWorldScale * 0.45, 1.35))),
      phase: stableNumber(phaseRng() * TAU),
    });
  }

  return {
    schemaVersion: SEEDED_SEA_SCHEMA_VERSION,
    seed: (Number(seed) | 0) || 1,
    mapId: String(mapId || "unknown"),
    worldScale: stableNumber(normalizedWorldScale),
    source: "map-procgen-history",
    ambientFloor: AMBIENT_FLOOR,
    history: {
      wells: historyWells,
    },
    state: {
      tick: 0,
      elapsedSeconds: 0,
    },
    trains,
  };
}

function advanceSeededSea(sea, dt) {
  const step = Math.max(0, finite(dt));
  return {
    ...sea,
    state: {
      tick: (sea?.state?.tick || 0) + 1,
      elapsedSeconds: stableNumber((sea?.state?.elapsedSeconds || 0) + step),
    },
    trains: (sea?.trains || []).map((train) => ({
      ...train,
      phase: stableNumber(wrapPhase(
        train.phase + (TAU * train.speed / Math.max(0.001, train.wavelength)) * step
      )),
    })),
  };
}

function sampleSeededSea(sea, wx, wy, { ambientMultiplier = 1, sourceMultipliers = null } = {}) {
  if (!sea || !Array.isArray(sea.trains) || sea.trains.length === 0) {
    return { x: 0, y: 0, magnitude: 0, sourceWellId: null, wellInfluence: 0 };
  }

  const worldScale = Math.max(0.01, finite(sea.worldScale, 1));
  const ambientCeiling = Math.max(0, Math.min(AMBIENT_FLOOR, finite(sea.ambientFloor, AMBIENT_FLOOR)));
  const ambientScale = Math.max(0, finite(ambientMultiplier, 1));
  let x = 0;
  let y = 0;
  let sourceWellId = null;
  let strongest = 0;
  let strongestInfluence = 0;

  for (const train of sea.trains) {
    const dx = wrappedDelta(train.sourceWX, wx, worldScale);
    const dy = wrappedDelta(train.sourceWY, wy, worldScale);
    const dist = Math.hypot(dx, dy);
    const radius = Math.max(0.001, finite(train.influenceRadius, 1));
    const wellInfluence = Math.max(0, Math.min(1, 1 - dist / radius));
    const attenuation = OUTSIDE_WELL_FLOOR_FACTOR
      + (1 - OUTSIDE_WELL_FLOOR_FACTOR) * wellInfluence;
    const heading = finite(train.heading);
    const wavelength = Math.max(0.001, finite(train.wavelength, 1));
    const longitudinalDistance = dx * Math.cos(heading) + dy * Math.sin(heading);
    const phase = finite(train.phase) + (TAU * longitudinalDistance / wavelength);
    const sourceMultiplier = sourceMultipliers && train.sourceWellId != null
      ? Math.max(0, finite(sourceMultipliers[train.sourceWellId], 1))
      : 1;
    const contribution = BASE_THRUST_ACCEL
      * ambientCeiling
      * ambientScale
      * sourceMultiplier
      * Math.max(0, finite(train.amplitude))
      * attenuation
      * Math.sin(phase);
    x += Math.cos(heading) * contribution;
    y += Math.sin(heading) * contribution;
    const contributionMagnitude = Math.abs(contribution);
    if (contributionMagnitude > strongest) {
      strongest = contributionMagnitude;
      sourceWellId = train.sourceWellId ?? null;
      strongestInfluence = wellInfluence;
    }
  }

  const magnitude = Math.hypot(x, y);
  const maxMagnitude = BASE_THRUST_ACCEL * ambientCeiling * ambientScale;
  if (magnitude > maxMagnitude && magnitude > 0) {
    const scale = maxMagnitude / magnitude;
    x *= scale;
    y *= scale;
  }

  return {
    x: stableNumber(x),
    y: stableNumber(y),
    magnitude: stableNumber(Math.hypot(x, y)),
    sourceWellId,
    wellInfluence: stableNumber(strongestInfluence),
  };
}

function stableSerialize(value) {
  if (Array.isArray(value)) return `[${value.map(stableSerialize).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value).sort().map((key) => (
      `${JSON.stringify(key)}:${stableSerialize(value[key])}`
    )).join(",")}}`;
  }
  return JSON.stringify(value);
}

function serializeSeededSea(sea) {
  return stableSerialize(sea);
}

function hashSeededSea(sea) {
  return crypto.createHash("sha256").update(serializeSeededSea(sea)).digest("hex");
}

module.exports = {
  AMBIENT_FLOOR,
  BASE_THRUST_ACCEL,
  SEEDED_SEA_SCHEMA_VERSION,
  SEEDED_SEA_STREAMS,
  advanceSeededSea,
  createSeededSea,
  hashSeededSea,
  sampleSeededSea,
  serializeSeededSea,
};
