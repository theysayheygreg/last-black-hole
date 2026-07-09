#!/usr/bin/env node

const http = require("http");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { performance } = require("perf_hooks");
const { createRuntimeLogger } = require("./runtime-telemetry.cjs");
const { loadPlayableMaps } = require("./shared-map-loader.cjs");
const { createRNGStreams } = require("./rng-stream.cjs");
const SEEDED_GEN = require("./seeded-generation.cjs");
const {
  buildCoarseFlowField,
  sampleCoarseFlowField,
} = require("./coarse-flow-field.cjs");
const { normalizeFlowSample } = require("./flow-sample.cjs");
const {
  PUBLIC_HULL_IDS,
  PERSONALITY_HULL_MAP,
  HULL_DEFINITIONS,
  RIG_TRACKS,
} = require("./content/hulls.cjs");

function normalizePublicHullType(...candidates) {
  for (const candidate of candidates) {
    const normalized = String(candidate || "").trim().toLowerCase();
    if (PUBLIC_HULL_IDS.includes(normalized)) return normalized;
  }
  return PUBLIC_HULL_IDS[0] || "drifter";
}
const {
  wreckAgeValueMultiplier,
  survivalBonusEm,
  runEmEarned,
} = require("./content/balance.cjs");
const { getSessionProfile } = require("./content/session-profiles.cjs");
const {
  defaultRigLevels,
  normalizeRigLevels,
  BRAIN_DEFAULTS,
  normalizeHullType,
  normalizeProfileUpgrades,
  createPlayerBrain,
  createAbilityState,
} = require("./player-brain.cjs");
const { createControlPlaneClient } = require("./control-plane-client.cjs");
const {
  createOverloadController,
  projectOverloadBudget,
  advanceOverload,
} = require("./overload-state.cjs");
const {
  PROTOCOL_VERSION,
  DEFAULT_TICK_HZ,
  DEFAULT_SNAPSHOT_HZ,
  DEFAULT_WORLD_SCALE,
  DEFAULT_MAX_PLAYERS,
  AUTHORITY_HEADER,
  PLAYER_ID_HEADER,
  RUN_ID_HEADER,
  createProtocolDescription,
  normalizeInputMessage,
  normalizeInventoryAction,
  playerEventVisibility,
  filterEventsForPlayer,
} = require("./sim-protocol.cjs");
const { BODY_MASKS } = require("./sim/body-masks.cjs");
const { BODY_SCHEMA_VERSION } = require("./sim/body-schema.cjs");
const { createBallparkMirror } = require("./sim/ballpark-mirror.cjs");
const { collectNearestBodies, collectRelevantBodies } = require("./sim/sim-queries.cjs");
const {
  applyPlayerBrakeAndIntegrate,
  applyPlayerDriveAndFlow,
} = require("./sim/player-movement-step.cjs");
const {
  sweptMovingCircleVsCircle,
  wrappedDelta,
} = require("./sim/world-geometry.cjs");
const { createSimEventJournal } = require("./sim-event-journal.cjs");
const { createSimSnapshotRing } = require("./sim-snapshot-ring.cjs");

const PLAYABLE_MAPS = loadPlayableMaps();
const PORTAL_CONFIG = {
  captureRadius: 0.08,
  waves: [
    { time: 45, count: [2, 3], types: ["standard"], lifespan: 90 },
    { time: 180, count: [1, 2], types: ["standard", "unstable"], lifespan: 75 },
    { time: 330, count: [1, 2], types: ["standard", "rift"], lifespan: 60 },
    { time: 450, count: [1, 1], types: ["unstable"], lifespan: 45 },
    { time: 570, count: [1, 1], types: ["standard"], lifespan: 30 },
  ],
};
const PLAYER_CARGO_SLOTS = 8;
const RUN_DURATION = 600;
const MATCH_MAX_SIM_TIME = readNumber(process.env.LBH_SIM_MAX_SIM_TIME, RUN_DURATION, 1);
const TERMINAL_SESSION_GRACE_MS = readNumber(process.env.LBH_SIM_TERMINAL_GRACE_MS, 30000, 0);
const WELL_GROWTH_VARIANCE = 0.01;
const WELL_GROWTH_AMOUNT = 0.02;
const WELL_KILL_RADIUS_GROWTH = 0.3;
// --- Loot Economy ---
// Item catalog, tier gates, signatures, and roll logic all live in
// seeded-generation.js so the client can mirror them for prediction.
// Wreck aging constants stay here since aging is server-runtime only.

const { WELL_NAMES } = SEEDED_GEN;

// Wreck wave schedule lives in seeded-generation.js so the client can mirror it.
const { WRECK_WAVES } = SEEDED_GEN;
const WRECK_WAVE_REPEAT_INTERVAL = 90; // after last wave, repeat every N seconds
const WRECK_WAVE_REPEAT = { count: [1, 1], slots: [3, 5], dangerZone: 0.12 };
const MAX_WRECK_REPEAT_WAVES = readNumber(process.env.LBH_SIM_MAX_WRECK_REPEAT_WAVES, 0, 0);
const MAX_LIVE_WRECKS = readNumber(process.env.LBH_SIM_MAX_LIVE_WRECKS, 64, 1);
const IDLE_SESSION_TICK_HZ = 1;
const DEFAULT_IDLE_SHUTDOWN_MS = 30000;

const WRECK_ADJECTIVES = [
  "Ascending", "Crystalline", "Shattered", "Infinite", "Dreaming",
  "Ossified", "Luminous", "Drifting", "Harmonic", "Forgotten",
  "Silent", "Fractured", "Prismatic", "Hollow", "Resonant",
];
const WRECK_NOUNS = [
  "Chorus", "Lattice", "Meridian", "Archive", "Theorem",
  "Garden", "Beacon", "Chrysalis", "Mandate", "Confluence",
  "Helix", "Axiom", "Tempest", "Orbit", "Zenith",
];
const WRECK_PREFIXES = ["Wreck", "Remains", "Hulk"];

function generateWreckName(rng = Math.random) {
  const pick = (list) => list[Math.floor(rng() * list.length)] || list[0];
  return `${pick(WRECK_PREFIXES)} of the ${pick(WRECK_ADJECTIVES)} ${pick(WRECK_NOUNS)}`;
}

function readNumber(value, fallback, min = -Infinity) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(min, parsed);
}

// Wrappers around seeded-generation.js that route through runtime streams.
// All init-time loot rolls flow through runtime.session.rng, which is
// seeded from runtime.session.seed. Same seed → same initial loot.

function currentRNG(streamName) {
  return runtime.session?.rng?.rawStream(streamName) || Math.random;
}

function rollTier(sessionTime, streamName = 'loot') {
  const bias = runtime.session?.lootQualityBias || 1.0;
  return SEEDED_GEN.rollTier(currentRNG(streamName), sessionTime, bias);
}

function rollItem(tier, streamName = 'loot') {
  const item = SEEDED_GEN.rollItem(currentRNG(streamName), tier);
  if (!item) return null;
  // instanceId uses Math.random — purely cosmetic, not seed-dependent
  return { ...item, instanceId: `item-${Date.now()}-${Math.random().toString(36).slice(2, 6)}` };
}

function generateWreckLoot(sessionTime, slotCount, streamName = 'loot') {
  const rng = currentRNG(streamName);
  const bias = runtime.session?.lootQualityBias || 1.0;
  const items = SEEDED_GEN.generateWreckLoot(rng, sessionTime, slotCount, bias);
  // Stamp cosmetic instance IDs after rolling so instance IDs don't affect RNG order
  for (const item of items) {
    const prefix = item.effect ? 'cons' : 'item';
    item.instanceId = `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
  }
  return items;
}

function wreckAgeMultiplier(wreckSpawnTime, currentTime) {
  return wreckAgeValueMultiplier(wreckSpawnTime, currentTime);
}

function applyRunSeed(rngStreams, mapState, session) {
  // Well variance: mass ±15%, growth rate ±20%, orbital direction, names
  for (let i = 0; i < mapState.wells.length; i++) {
    const well = mapState.wells[i];
    well.mass *= rngStreams.range('wellMass', 0.85, 1.15);
    well.growthRate *= rngStreams.range('wellGrowth', 0.80, 1.20);
    well.orbitalDir = rngStreams.float('wellDir') > 0.5 ? 1 : -1;
    well.name = rngStreams.pick('wellNames', WELL_NAMES);
    well.killRadius = wellKillRadiusForMass(well);
  }

  session.lootQualityBias = rngStreams.range('qualityBias', 0.8, 1.2);
  session.cosmicSignature = SEEDED_GEN.pickCosmicSignature(rngStreams.rawStream('signature'));
  session.aiSeed = Math.floor(rngStreams.float('aiSeed') * 1e9);
  session.hasNamedWreck = rngStreams.chance('namedWreck', 0.10);
  if (session.hasNamedWreck) {
    session.namedWreckWave = 3 + rngStreams.int('namedWreckWave', 0, 2);
  }
}

const SCAVENGER_CONFIG = {
  sensorRange: 1.5,
  decisionInterval: 0.8,
  thrustAccel: 0.5,
  drag: 0.06,
  fleeWellDist: 0.15,
  pickupRadius: 0.08,
  bumpRadius: 0.04,
  bumpForce: 0.3,
  deathSpiralDuration: 1.5,
};
const SERVER_COMBAT = {
  pulseCooldown: 4.0,
  pulseEntityForce: 0.5,
  pulseEntityRadius: 0.3,
  pulseRecoilForce: 0.4,
  timeSlowScale: 0.3,
  timeSlowDuration: 3.0,
};
const SERVER_WELLS = {
  shipPullStrength: 0.6,
  shipPullFalloff: 1.5,
  maxRange: 1.2,
  currentStrength: 0.3,
  currentFalloff: 1.5,
  currentRange: 1.35,
};
const STAR_SERVER = {
  shipPushStrength: 0.45,
  shipPushFalloff: 1.8,
  maxRange: 0.6,
};
const PLANETOID_SERVER = {
  shipPushStrength: 0.3,
  shipPushRadius: 0.1,
};
const WAVE_SERVER = {
  waveSpeed: 0.4,
  waveWidth: 0.1,
  waveDecay: 0.97,
  waveMaxRadius: 2.0,
  waveShipPush: 0.8,
  growthWaveAmplitude: 1.0,
};
const SLINGSHOT_SERVER = {
  range: { well: 0.45, star: 0.30, planetoid: 0.18 },
  massWeight: { well: 1.0, star: 0.6, planetoid: 0.3 },
  energyAccrualRate: 3.5,
  releaseMultiplier: 4.5,
  gravityCancelFraction: 0.95,
  tangentialForce: 1.5,
  chainWindowSeconds: 1.2,
  chainMultiplier: 1.4,
  minTangentialSpeed: 0.05,
  maxChainCount: 6,
};
const SIGNAL_CONFIG = {
  // Generation rates (per second for continuous, instant for spikes)
  thrustBaseRate: 0.005,
  thrustOppositionMult: 2.0,
  lootSpikeT1: 0.06,
  lootSpikeT2: 0.10,
  lootSpikeT3: 0.18,
  pulseSpike: 0.12,
  flareLaunchSpike: 0.04,
  flareSignalBonus: 0.10,
  // collisionSpike removed — no generic entity-entity collision exists; fauna/sentries
  // have per-type bumpSignal values tuned to their gameplay role.
  // extractionRate removed — extraction is instant (no charge time), so continuous
  // signal generation during extraction never fires. If extraction gains a charge
  // period, re-add at 0.003/s.
  wellProximityRate: 0.002,
  wellProximityDist: 0.30,
  coastRate: 0.001,
  // Decay rates (per second)
  decayBase: 0.025,
  decayWreckWake: 0.040,
  decayAccretionShadow: 0.050,
  // Thresholds
  ghostMax: 0.15,
  whisperMax: 0.35,
  presenceMax: 0.55,
  beaconMax: 0.75,
  flareMax: 0.90,
  // Zone names (ordered)
  zones: ["ghost", "whisper", "presence", "beacon", "flare", "threshold"],
};

const INHIBITOR_CONFIG = {
  // Pressure accumulation
  pressureFromSignal: 0.008,    // pressure/s per unit signal level
  pressureFromTime: 0.0005,     // pressure/s from elapsed time (normalized)
  pressureFromGrowth: 0.05,     // pressure per well growth event
  // Form thresholds (fraction of wake threshold)
  glitchFraction: 0.7,         // Form 1 at 70% of threshold
  // Wake threshold randomized per run
  thresholdMin: 0.82,
  thresholdMax: 0.98,
  // Form 1: Glitch
  glitchRadius: 0.1,           // world-units
  glitchDriftSpeed: 0.02,      // wu/s toward last signal position
  glitchDissipateTime: 10,     // seconds of silence before dissipating
  glitchSolidifySignal: 0.35,  // signal level that solidifies glitch
  glitchSolidifySpeed: 0.04,   // wu/s when solidified
  // Form 2: Swarm
  swarmRadius: 0.25,
  swarmSpeedSilent: 0.02,
  swarmSpeedLight: 0.05,
  swarmSpeedHeavy: 0.10,
  swarmSpeedFlare: 0.15,
  swarmTrackInterval: 3.0,     // seconds between target updates
  swarmContactDrain: 1.0,      // items/second on contact
  swarmContactSignalSpike: 0.25,
  swarmControlDebuffDuration: 5.0, // seconds of sluggish controls after Swarm contact
  swarmControlDebuffMult: 0.4,     // thrust multiplier during debuff
  swarmWreckDriftRange: 0.55,
  swarmWreckDriftStrength: 0.018,
  swarmWreckTerminalBonus: 0.035,
  swarmSearchTimeout: 5.0,     // seconds before search pattern
  swarmSearchRadiusMin: 0.08,
  swarmSearchRadiusMax: 0.65,
  swarmSearchRadiusRate: 0.025,
  swarmSearchTurnRate: 1.4,
  // Form 3: Vessel
  vesselSpeed: 0.08,
  vesselKillRadius: 0.08,
  vesselGravityRange: 0.3,
  vesselGravityStrength: 0.15,
  vesselPortalBlockRange: 0.2,
  vesselWellPullRange: 0.35,
  vesselWellPullStrength: 0.025,
  vesselWellConsumeRadius: 0.06,
  vesselConsumeRadiusGrowth: 0.025,
  vesselConsumeGravityBonus: 0.03,
  vesselTimeToForm: 90,        // seconds after Swarm, or instant if signal hits 1.0
  finalPortalDelay: 60,        // seconds after Vessel before guaranteed portal
  finalPortalLifespan: 15,
};

const FAUNA_CONFIG = {
  maxTotal: 60,
  // Drift Jellies — ambient, always present
  jellyCount: 6,
  jellySpawnInterval: 8,
  jellyLifespan: [40, 60],
  jellyBumpForce: 0.005,
  jellyBumpSignal: 0.01,
  jellySize: 3,
  // Signal Blooms — spawn near signal sources
  bloomAttraction: 0.008,
  bloomMaxSpeed: 0.025,
  bloomSpawnRange: [0.3, 0.6],
  bloomLifespan: [20, 40],
  bloomBumpForce: 0.006,
  bloomBumpSignal: 0.01,
  bloomSize: 2,
  bloomSpawnRate: {
    ghost: 0, whisper: 0.15, presence: 0.25, beacon: 0.5, flare: 1.0, threshold: 1.5,
  },
};

const SENTRY_CONFIG = {
  perWell: [2, 3],             // min/max sentries per well
  orbitRadiusMult: [1.2, 1.8], // multiplier on well ringOuter
  patrolSpeed: [0.03, 0.05],   // wu/s tangential speed
  lungeRange: 0.08,            // wu — triggers lunge
  lungeSpeed: 0.10,            // wu/s toward player
  lungeDuration: 0.5,          // seconds
  lungeRecovery: 2.5,          // seconds before returning to patrol
  bumpForce: 0.02,             // wu/s impulse TOWARD well
  bumpSignal: 0.05,            // signal spike on lunge contact
  segments: 4,                 // body segments for rendering
  color: [0, 255, 136],        // #00FF88 bright mint
};

const AI_PLAYER_CONFIG = {
  decisionInterval: 0.8,      // seconds between tactical decisions
  strategicInterval: 3.0,     // seconds between extraction re-evaluation
  thrustAccel: 2.5,           // same as human player
  drag: 0.92,                 // same drag exponent base
  pickupRadius: 0.08,
  sensorRange: 1.2,           // wu — how far AI can "see"
  perceptionDelay: 0.5,       // seconds of position staleness for other players
  perceptionNoise: 0.15,      // ±fraction noise on wreck value estimates
};

const AI_PERSONALITIES = {
  prospector: {
    name: 'Prospector',
    names: ['Steady Hand', 'Long Haul', 'Iron Keel', 'Patient Run', 'Clearwater', 'True North'],
    flowSamples: 6, coastThrust: 0.05, cruiseThrust: 0.3, maxThrust: 0.7,
    distancePenalty: 40, dangerPenalty: 60, currentBonus: 30, competitionPenalty: 25,
    minCargoValue: 150, panicPortalCount: 3, extractionGreed: 0.5, minimumWreckScore: 20,
    aggression: 0.15, contestThreshold: 40, signalTolerance: 0.45,
    lootTarget: [3, 5], riskHorizon: 30,
  },
  raider: {
    name: 'Raider',
    names: ['Redline', 'Breach Point', 'Hammer Down', 'No Quarter', 'Firestorm', 'Iron Rain'],
    flowSamples: 3, coastThrust: 0.2, cruiseThrust: 0.6, maxThrust: 1.0,
    distancePenalty: 15, dangerPenalty: 20, currentBonus: 10, competitionPenalty: 5,
    minCargoValue: 350, panicPortalCount: 2, extractionGreed: 0.8, minimumWreckScore: 40,
    aggression: 0.75, contestThreshold: 10, signalTolerance: 0.70,
    lootTarget: [5, 8], riskHorizon: 15,
  },
  vulture: {
    name: 'Vulture',
    names: ['Duskwalker', 'Still Water', 'Afterglow', 'Lastlight', 'Echo', 'Pale Wake'],
    flowSamples: 4, coastThrust: 0.1, cruiseThrust: 0.35, maxThrust: 0.9,
    distancePenalty: 20, dangerPenalty: 35, currentBonus: 15, competitionPenalty: -15,
    minCargoValue: 200, panicPortalCount: 2, extractionGreed: 0.6, minimumWreckScore: 15,
    aggression: 0.6, contestThreshold: 5, signalTolerance: 0.55,
    lootTarget: [3, 6], riskHorizon: 20,
  },
  ghost: {
    name: 'Ghost',
    names: ['\u2014', '...', 'Nil', 'Whisper', '0', '\u2591'],
    flowSamples: 8, coastThrust: 0.0, cruiseThrust: 0.15, maxThrust: 0.5,
    distancePenalty: 50, dangerPenalty: 80, currentBonus: 50, competitionPenalty: 40,
    minCargoValue: 80, panicPortalCount: 3, extractionGreed: 0.3, minimumWreckScore: 5,
    aggression: 0.05, contestThreshold: 80, signalTolerance: 0.25,
    lootTarget: [2, 4], riskHorizon: 45,
  },
  desperado: {
    name: 'Desperado',
    names: ['Double Down', 'All In', 'Last Call', 'One More', 'Jackpot', 'Full Send'],
    flowSamples: 4, coastThrust: 0.15, cruiseThrust: 0.5, maxThrust: 1.0,
    distancePenalty: 10, dangerPenalty: 10, currentBonus: 15, competitionPenalty: 15,
    minCargoValue: 500, panicPortalCount: 1, extractionGreed: 1.0, minimumWreckScore: 60,
    aggression: 0.5, contestThreshold: 20, signalTolerance: 0.80,
    lootTarget: [6, 8], riskHorizon: 8,
  },
};

const FORCE_REF_DIST = 0.25;
const FORCE_MIN_DIST = 0.15;
const SCAVENGER_FACTIONS = ["Collector", "Reaper", "Warden"];
const DRIFTER_NAMES = ["Quiet Tide", "Still Wake", "Ash Petal", "Cold Harbor", "Pale Drift", "Dim Lantern"];
const VULTURE_NAMES = ["Keen Edge", "Rust Claw", "Burnt Lance", "Bitter Claim", "Sharp Debt", "Iron Reap"];

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (!arg.startsWith("--")) continue;
    const key = arg.slice(2);
    const next = argv[i + 1];
    if (next && !next.startsWith("--")) {
      args[key] = next;
      i++;
    } else {
      args[key] = true;
    }
  }
  return args;
}

function readJson(req) {
  return new Promise((resolve, reject) => {
    let data = "";
    req.on("data", (chunk) => {
      data += chunk;
      if (data.length > 1024 * 1024) {
        reject(new Error("Request body too large"));
        req.destroy();
      }
    });
    req.on("end", () => {
      if (!data.trim()) {
        resolve({});
        return;
      }
      try {
        resolve(JSON.parse(data));
      } catch (err) {
        reject(err);
      }
    });
    req.on("error", reject);
  });
}

function sendJson(res, statusCode, body) {
  const payload = `${JSON.stringify(body, null, 2)}\n`;
  res.statusCode = statusCode;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Headers", `content-type,${AUTHORITY_HEADER},${PLAYER_ID_HEADER},${RUN_ID_HEADER}`);
  res.end(payload);
}

function ensureParent(filepath) {
  if (!filepath) return;
  fs.mkdirSync(path.dirname(filepath), { recursive: true });
}

function cleanupFiles(pidFile, metaFile) {
  for (const file of [pidFile, metaFile]) {
    if (!file) continue;
    try {
      fs.rmSync(file, { force: true });
    } catch {}
  }
}

function wrapWorld(value, worldScale) {
  const half = worldScale / 2;
  let wrapped = value;
  while (wrapped < -half) wrapped += worldScale;
  while (wrapped >= half) wrapped -= worldScale;
  return wrapped;
}

function wrapWorldPosition(value, worldScale) {
  return ((value % worldScale) + worldScale) % worldScale;
}

function worldDisplacement(a, b, worldScale) {
  let dx = b - a;
  if (dx > worldScale / 2) dx -= worldScale;
  if (dx < -worldScale / 2) dx += worldScale;
  return dx;
}

function worldDistance(ax, ay, bx, by, worldScale) {
  const dx = worldDisplacement(ax, bx, worldScale);
  const dy = worldDisplacement(ay, by, worldScale);
  return Math.hypot(dx, dy);
}

function worldDirection(ax, ay, bx, by, worldScale) {
  const dx = worldDisplacement(ax, bx, worldScale);
  const dy = worldDisplacement(ay, by, worldScale);
  const dist = Math.hypot(dx, dy);
  if (dist < 0.000001) return { dist, nx: 0, ny: 0 };
  return { dist, nx: dx / dist, ny: dy / dist };
}

function inversePowerForce(dist, strength, mass, falloff, maxRange) {
  if (dist < 0.001 || dist > maxRange) return 0;
  const safeDist = Math.max(dist, FORCE_MIN_DIST);
  const normDist = safeDist / FORCE_REF_DIST;
  const baseAccel = strength * mass / Math.pow(normDist, falloff);
  const t = dist / maxRange;
  const rangeFade = 1 - t;
  return baseAccel * rangeFade;
}

function orbitalCurrentSpeed(dist, strength, mass, falloff, maxRange) {
  if (dist < 0.001 || dist > maxRange) return 0;
  const safeDist = Math.max(dist, FORCE_MIN_DIST);
  const baseSpeed = strength * mass / Math.pow(safeDist, falloff);
  return baseSpeed * (1 - dist / maxRange);
}

function proximityForce(dist, strength, radius) {
  if (dist < 0.001 || dist > radius) return 0;
  return strength * (1 - dist / radius);
}

function waveBandForce(distFromSource, ringRadius, halfWidth, pushStrength, amplitude) {
  const distFromFront = Math.abs(distFromSource - ringRadius);
  if (distFromFront > halfWidth) return 0;
  const bandPosition = distFromFront / halfWidth;
  const profile = Math.cos(bandPosition * Math.PI * 0.5);
  return pushStrength * amplitude * profile;
}

function hashUnit(input) {
  const value = String(input);
  let hash = 2166136261;
  for (let i = 0; i < value.length; i++) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return ((hash >>> 0) % 1000000) / 1000000;
}

function wellKillRadiusForMass(well) {
  const startMass = well.startMass ?? well.mass ?? 1;
  const baseKillRadius = well.baseKillRadius ?? well.killRadius ?? 0.04;
  const growthFactor = WELL_KILL_RADIUS_GROWTH;
  const massDelta = Math.max(0, (well.mass ?? startMass) - startMass);
  return baseKillRadius * (1 + massDelta * growthFactor);
}

function initializePlanetoid(planetoid, wells, worldScale, index) {
  const seededA = hashUnit(`${planetoid.id}:a`);
  const seededB = hashUnit(`${planetoid.id}:b`);
  const seededC = hashUnit(`${planetoid.id}:c`);
  const seededD = hashUnit(`${planetoid.id}:d`);
  const state = {
    ...planetoid,
    alive: planetoid.alive !== false,
    age: 0,
    t: seededA * Math.PI * 2,
    wx: planetoid.wx ?? 0,
    wy: planetoid.wy ?? 0,
    vx: planetoid.vx ?? 0,
    vy: planetoid.vy ?? 0,
  };

  if (state.type === "orbit") {
    state.pathData = {
      wellIndex: state.wellIndex,
      semiA: 0.2 + seededB * 0.3,
      semiB: 0.15 + seededC * 0.25,
      tilt: seededD * Math.PI * 2,
      speed: 0.22 * (0.7 + seededA * 0.6),
    };
  } else if (state.type === "figure8") {
    state.pathData = {
      wellA: state.wellA,
      wellB: state.wellB,
      speed: 0.18 * (0.8 + seededB * 0.5),
    };
  } else if (state.type === "transit") {
    const edge = index % 4;
    const speed = 0.16 * (0.8 + seededB * 0.5);
    let heading = seededC * Math.PI * 2;
    let wx = seededA * worldScale;
    let wy = seededD * worldScale;
    if (edge === 0) {
      wy = 0;
      heading = Math.PI / 2 + (seededC - 0.5) * 1.0;
    } else if (edge === 1) {
      wx = worldScale;
      heading = Math.PI + (seededC - 0.5) * 1.0;
    } else if (edge === 2) {
      wy = worldScale;
      heading = -Math.PI / 2 + (seededC - 0.5) * 1.0;
    } else {
      wx = 0;
      heading = (seededC - 0.5) * 1.0;
    }
    state.wx = wx;
    state.wy = wy;
    state.vx = Math.cos(heading) * speed;
    state.vy = Math.sin(heading) * speed;
    state.pathData = { heading, speed, maxAge: worldScale / speed + 5 };
  }

  updatePlanetoidState(state, wells, 0, worldScale);
  return state;
}

function updatePlanetoidState(planetoid, wells, dt, worldScale) {
  const prevWX = planetoid.wx;
  const prevWY = planetoid.wy;

  if (planetoid.type === "orbit") {
    const well = wells[planetoid.pathData.wellIndex];
    if (!well) return;
    planetoid.t += planetoid.pathData.speed * dt;
    planetoid.wx = wrapWorld(
      well.wx + Math.cos(planetoid.t + planetoid.pathData.tilt) * planetoid.pathData.semiA,
      worldScale
    );
    planetoid.wy = wrapWorld(
      well.wy + Math.sin(planetoid.t) * planetoid.pathData.semiB,
      worldScale
    );
  } else if (planetoid.type === "figure8") {
    const wellA = wells[planetoid.pathData.wellA];
    const wellB = wells[planetoid.pathData.wellB];
    if (!wellA || !wellB) return;
    const dx = worldDisplacement(wellA.wx, wellB.wx, worldScale);
    const dy = worldDisplacement(wellA.wy, wellB.wy, worldScale);
    const midWX = wrapWorld(wellA.wx + dx / 2, worldScale);
    const midWY = wrapWorld(wellA.wy + dy / 2, worldScale);
    planetoid.t += planetoid.pathData.speed * dt;
    planetoid.wx = wrapWorld(midWX + (dx / 2) * Math.sin(planetoid.t), worldScale);
    planetoid.wy = wrapWorld(midWY + (dy / 2) * Math.sin(planetoid.t * 2), worldScale);
  } else if (planetoid.type === "transit") {
    planetoid.age += dt;
    planetoid.wx = wrapWorld(planetoid.wx + planetoid.vx * dt, worldScale);
    planetoid.wy = wrapWorld(planetoid.wy + planetoid.vy * dt, worldScale);
    if (planetoid.age > planetoid.pathData.maxAge) {
      planetoid.age = 0;
    }
  }

  if (dt > 0 && planetoid.type !== "transit") {
    const dx = worldDisplacement(prevWX, planetoid.wx, worldScale);
    const dy = worldDisplacement(prevWY, planetoid.wy, worldScale);
    planetoid.vx = dx / dt;
    planetoid.vy = dy / dt;
  }
}

function cloneMapState(mapId, worldScaleOverride = null, rngStreams = null) {
  const map = PLAYABLE_MAPS[mapId] || PLAYABLE_MAPS.shallows;
  const parsedWorldScale = worldScaleOverride == null ? NaN : Number(worldScaleOverride);
  const worldScale = Number.isFinite(parsedWorldScale) && parsedWorldScale > 0 ? parsedWorldScale : map.worldScale;
  const growthRng = rngStreams ? rngStreams.rawStream('wellGrowthVar') : Math.random;
  const wells = map.wells.map((well) => ({
    ...well,
    baseKillRadius: well.killRadius,
    startMass: well.mass,
    growthRate: (well.growthRate ?? WELL_GROWTH_AMOUNT) + (growthRng() * 2 - 1) * WELL_GROWTH_VARIANCE,
    killRadius: well.killRadius,
  }));
  const stars = map.stars.map((star) => ({
    ...star,
    alive: star.alive !== false,
    driftVX: star.driftVX ?? 0,
    driftVY: star.driftVY ?? 0,
  }));
  const initialLootStream = rngStreams ? rngStreams.rawStream('initialWreckLoot') : Math.random;
  const initialNameStream = rngStreams ? rngStreams.rawStream('initialWreckNames') : Math.random;
  const wrecks = map.wrecks.map((wreck) => ({
    ...wreck,
    name: wreck.name || generateWreckName(initialNameStream),
    alive: true,
    looted: false,
    pickupCooldown: 0,
    vx: 0,
    vy: 0,
    spawnTime: 0,
    loot: SEEDED_GEN.generateWreckLoot(
      initialLootStream,
      0,
      1 + Math.floor(initialLootStream() * 2),
      1.0
    ),
  }));
  const planetoids = map.planetoids.map((planetoid, index) =>
    initializePlanetoid(planetoid, wells, worldScale, index)
  );

  return {
    id: map.id,
    name: map.name,
    worldScale,
    fluidResolution: map.fluidResolution,
    wells,
    stars,
    wrecks,
    planetoids,
    portals: [],
    nextPortalWaveIndex: 0,
    scavengers: [],
  };
}

function cloneLoadoutItems(list = []) {
  if (!Array.isArray(list)) return [];
  return list.map((item) => (item ? { ...item } : null));
}

function portalCaptureRadius(portal) {
  const base = PORTAL_CONFIG.captureRadius;
  if (portal.type === "unstable") return base * 0.5;
  if (portal.type === "rift") return base * 1.8;
  return base;
}

function isPortalAvailable(portal) {
  return Boolean(portal && portal.alive !== false && portal.blockedByInhibitor !== true);
}

function randomBetween(min, max) {
  return min + Math.random() * (max - min);
}

function pick(list) {
  return list[Math.floor(Math.random() * list.length)];
}

function generateScavengerIdentity(archetype) {
  const rng = runtime.session?.rng?.rawStream('scavNames') || Math.random;
  const pickSeeded = (list) => list[Math.floor(rng() * list.length)];
  const faction = pickSeeded(SCAVENGER_FACTIONS);
  const callsign = archetype === "vulture" ? pickSeeded(VULTURE_NAMES) : pickSeeded(DRIFTER_NAMES);
  return {
    faction,
    callsign,
    name: `${faction} ${callsign}`,
  };
}

function clampBudgetCount(value, fallback = 1) {
  if (!Number.isFinite(value)) return fallback;
  return Math.max(1, Math.round(value));
}

function spawnServerScavengers(mapState, session) {
  const base = Number(session.spawnScavengersBase || 1);
  const perPlayer = Number(session.spawnScavengersPerPlayer || 0);
  const maxScavengers = clampBudgetCount(session.maxScavengers || 1);
  const count = Math.min(
    maxScavengers,
    clampBudgetCount(base + session.maxPlayers * perPlayer, maxScavengers)
  );
  const vultureCount = Math.max(1, Math.round(count * 0.33));
  const scavengers = [];
  const rng = session?.rng?.rawStream('scavSpawn') || Math.random;
  for (let i = 0; i < count; i++) {
    const archetype = i < vultureCount ? "vulture" : "drifter";
    const edge = i % 4;
    let wx;
    let wy;
    if (edge === 0) {
      wx = rng() * mapState.worldScale;
      wy = 0.1;
    } else if (edge === 1) {
      wx = rng() * mapState.worldScale;
      wy = mapState.worldScale - 0.1;
    } else if (edge === 2) {
      wx = 0.1;
      wy = rng() * mapState.worldScale;
    } else {
      wx = mapState.worldScale - 0.1;
      wy = rng() * mapState.worldScale;
    }
    const identity = generateScavengerIdentity(archetype);
    scavengers.push({
      id: `scav-${i + 1}`,
      archetype,
      faction: identity.faction,
      callsign: identity.callsign,
      name: identity.name,
      wx,
      wy,
      vx: 0,
      vy: 0,
      facing: rng() * Math.PI * 2,
      thrustIntensity: 0,
      alive: true,
      state: "drift",
      deathTimer: 0,
      deathWellId: null,
      deathWellWX: 0,
      deathWellWY: 0,
      deathStartWX: 0,
      deathStartWY: 0,
      deathAngle: 0,
      lootCount: 0,
      lootTarget: archetype === "vulture" ? 2 : 1,
      decisionTimer: rng() * SCAVENGER_CONFIG.decisionInterval,
      driftHeading: rng() * Math.PI * 2,
      targetWreckId: null,
      targetPortalId: null,
    });
  }
  return scavengers;
}

function findPortalSpawnPosition(portalType) {
  const worldScale = runtime.session.worldScale;
  const minPortalSpacing = 0.3;
  const dangerBias = portalType === "rift" ? 0.2 : portalType === "unstable" ? 0.1 : 0.45;
  const rng = runtime.session?.rng?.rawStream('portalPos') || Math.random;

  for (let attempt = 0; attempt < 40; attempt++) {
    const wx = rng() * worldScale;
    const wy = rng() * worldScale;

    let nearestPortal = Infinity;
    for (const portal of runtime.mapState.portals) {
      if (portal.alive === false) continue;
      nearestPortal = Math.min(
        nearestPortal,
        worldDistance(wx, wy, portal.wx, portal.wy, worldScale)
      );
    }
    if (nearestPortal < minPortalSpacing) continue;

    let nearestWell = Infinity;
    for (const well of runtime.mapState.wells) {
      nearestWell = Math.min(nearestWell, worldDistance(wx, wy, well.wx, well.wy, worldScale));
    }

    if (portalType === "rift") {
      if (nearestWell < 0.18 || nearestWell > 0.5) continue;
    } else if (portalType === "unstable") {
      if (nearestWell < 0.12 || nearestWell > 0.7) continue;
    } else {
      if (nearestWell < dangerBias) continue;
    }

    return { wx, wy };
  }

  return {
    wx: rng() * worldScale,
    wy: rng() * worldScale,
  };
}
const args = parseArgs(process.argv.slice(2));
const HOST = args.host || "127.0.0.1";
const PORT = Number(args.port || 8787);
const PID_FILE = args["pid-file"] ? path.resolve(args["pid-file"]) : null;
const META_FILE = args["meta-file"] ? path.resolve(args["meta-file"]) : null;
const LOG_LABEL = args.label || "lbh-sim";
const telemetry = createRuntimeLogger("sim", { label: LOG_LABEL, host: HOST, port: PORT });
const SIM_INSTANCE_ID = String(args["sim-instance-id"] || process.env.LBH_SIM_INSTANCE_ID || `sim-${PORT}`);
const CONTROL_PLANE_URL = String(args["control-plane-url"] || process.env.LBH_CONTROL_PLANE_URL || "").trim();
const KEEP_ALIVE = String(args["keep-alive"] || process.env.LBH_SIM_KEEP_ALIVE || "").trim() === "true";
const IDLE_SHUTDOWN_MS = KEEP_ALIVE
  ? 0
  : Math.max(1000, Number(args["idle-shutdown-ms"] || process.env.LBH_SIM_IDLE_SHUTDOWN_MS || DEFAULT_IDLE_SHUTDOWN_MS));
const CONTROL_PLANE_FILE = args["control-plane-file"]
  ? path.resolve(args["control-plane-file"])
  : path.resolve(__dirname, "..", "tmp", `control-plane-${PORT}.json`);
const SESSION_REGISTRY_FILE = args["session-registry-file"]
  ? path.resolve(args["session-registry-file"])
  : path.resolve(__dirname, "..", "tmp", `session-registry-${PORT}.json`);
const controlPlane = createControlPlaneClient({
  baseUrl: CONTROL_PLANE_URL || null,
  controlPlaneFile: CONTROL_PLANE_FILE,
  sessionRegistryFile: SESSION_REGISTRY_FILE,
});
const pendingControlPlaneWrites = new Set();
let controlPlaneHeartbeat = null;

const PLAYER_LOCAL_EVENT_TYPES = new Set([
  "profile.updated",
  "run.result",
  "player.inventoryAction",
  "player.loot",
  "player.effectUsed",
  "player.portalProximity",
  "player.portalConfirmed",
  "signal.zoneCrossing",
  "inhibitor.drainCargo",
]);

const protocol = createProtocolDescription();
const runtime = {
  startedAt: new Date().toISOString(),
  session: {
    id: null,
    status: "idle",
    mapId: null,
    mapName: null,
    hostClientId: null,
    hostName: null,
    overloadState: "NORMAL",
    overloadPressure: 0,
    timeScale: 1,
    baseTickHz: DEFAULT_TICK_HZ,
    baseSnapshotHz: DEFAULT_SNAPSHOT_HZ,
    worldScale: DEFAULT_WORLD_SCALE,
    tickHz: DEFAULT_TICK_HZ,
    snapshotHz: DEFAULT_SNAPSHOT_HZ,
    maxPlayers: DEFAULT_MAX_PLAYERS,
  },
  tick: 0,
  simTime: 0,
  loopTickHz: DEFAULT_TICK_HZ,
  eventJournal: createSimEventJournal({ capacity: 256, runId: "idle" }),
  snapshotRing: createSimSnapshotRing({ capacity: 32, runId: "idle" }),
  recentEvents: [],
  nextEventSeq: 1,
  systemAccumulators: {
    world: 0,
    portals: 0,
    growth: 0,
    scavengers: 0,
    waves: 0,
    field: 0,
  },
  players: new Map(),
  playerAuthorities: new Map(),
  joinClaims: new Map(),
  waveRings: [],
  ballparkMirror: createBallparkMirror({ worldScale: DEFAULT_WORLD_SCALE }),
  ballparkRelevance: { mode: "not-run", tick: null, categories: {} },
  coarseField: null,
  inhibitor: {
    pressure: 0,
    threshold: 0.90,  // randomized per run
    form: 0,          // 0=inactive, 1=glitch, 2=swarm, 3=vessel
    wx: 0, wy: 0,     // world position
    vx: 0, vy: 0,
    intensity: 0,      // 0-1, ramps during transitions
    radius: 0.1,
    localTime: 0,
    swarmTrackTimer: 0,
    swarmTargetX: 0, swarmTargetY: 0,
    silenceTimer: 0,   // how long peak signal has been low
    vesselTimer: 0,    // time since Form 2
    finalPortalSpawned: false,
    finalPortalExpired: false,
    formTimes: [null, null, null, null],
    lastSignalWX: 0,
    lastSignalWY: 0,
    lastSignalAge: 0,
    swarmSearchTimer: 0,
    swarmSearchAngle: 0,
    gravityBonus: 0,
  },
  mapState: {
    id: "shallows",
    name: "The Shallows",
    worldScale: DEFAULT_WORLD_SCALE,
    fluidResolution: 256,
    wells: [],
    stars: [],
    wrecks: [],
    planetoids: [],
    portals: [],
  },
  overload: null,
  keepAlive: KEEP_ALIVE,
  idleShutdownMs: IDLE_SHUTDOWN_MS,
  terminalSince: null,
  terminalShutdownAt: null,
  shutdownReason: null,
};

let tickHandle = null;
let currentLoopTickHz = DEFAULT_TICK_HZ;
let terminalShutdownHandle = null;

function publishEvent(type, payload = {}, options = {}) {
  const playerId = String(payload?.clientId || options.playerId || "").trim();
  const isPlayerLocal = PLAYER_LOCAL_EVENT_TYPES.has(type) && playerId;
  const event = runtime.eventJournal.append({
    tick: runtime.tick,
    simTime: runtime.simTime,
    type,
    lane: isPlayerLocal ? "playerLocal" : options.lane,
    source: options.source,
    subject: options.subject,
    visibility: isPlayerLocal ? playerEventVisibility(playerId) : options.visibility,
    payload,
  });
  runtime.nextEventSeq = runtime.eventJournal.nextSeq;
  runtime.recentEvents = runtime.eventJournal.read({
    since: Math.max(0, runtime.eventJournal.lastSeq - 128),
  }).events;
  return event;
}

function refreshBallparkMirror(reason = "runtime") {
  if (!runtime.ballparkMirror) return null;
  // v0.3 starts Ballpark as an observation layer. Rebuild-at-tick is simple
  // and deterministic while the old arrays remain the public protocol view.
  return runtime.ballparkMirror.rebuildFromRuntime(runtime, {
    tick: runtime.tick,
    simTime: runtime.simTime,
    reason,
  });
}

function applyOverloadProfile({ forceRestart = false } = {}) {
  if (!runtime.overload) return;
  const projection = projectOverloadBudget(runtime.overload.base, runtime.overload.state);
  const previousTickHz = runtime.session.tickHz;
  runtime.session.overloadState = projection.overloadState;
  runtime.session.overloadPressure = Number(runtime.overload.pressure || 0);
  runtime.session.timeScale = projection.timeScale;
  runtime.session.tickHz = projection.tickHz;
  runtime.session.snapshotHz = projection.snapshotHz;
  runtime.session.worldTickHz = projection.worldTickHz;
  runtime.session.portalTickHz = projection.portalTickHz;
  runtime.session.growthTickHz = projection.growthTickHz;
  runtime.session.scavengerTickHz = projection.scavengerTickHz;
  runtime.session.waveTickHz = projection.waveTickHz;
  runtime.session.fieldTickHz = projection.fieldTickHz;
  runtime.session.entityRelevanceRadius = projection.entityRelevanceRadius;
  runtime.session.scavengerRelevanceRadius = projection.scavengerRelevanceRadius;
  runtime.session.useCoarseField = projection.useCoarseField;
  runtime.session.flowFieldCellSize = projection.flowFieldCellSize;
  runtime.session.fieldFlowScale = projection.fieldFlowScale;
  runtime.session.spawnScavengersBase = projection.spawnScavengersBase;
  runtime.session.spawnScavengersPerPlayer = projection.spawnScavengersPerPlayer;
  runtime.session.maxScavengers = projection.maxScavengers;
  runtime.session.maxRelevantStarsPerPlayer = projection.maxRelevantStarsPerPlayer;
  runtime.session.maxRelevantPlanetoidsPerPlayer = projection.maxRelevantPlanetoidsPerPlayer;
  runtime.session.maxRelevantWrecksPerPlayer = projection.maxRelevantWrecksPerPlayer;
  runtime.session.maxRelevantScavengersPerPlayer = projection.maxRelevantScavengersPerPlayer;
  runtime.session.maxWellInfluencesPerPlayer = projection.maxWellInfluencesPerPlayer;
  runtime.session.maxWaveInfluencesPerPlayer = projection.maxWaveInfluencesPerPlayer;
  runtime.session.maxPickupChecksPerPlayer = projection.maxPickupChecksPerPlayer;
  runtime.session.maxPortalChecksPerPlayer = projection.maxPortalChecksPerPlayer;

  if (forceRestart || previousTickHz !== runtime.session.tickHz) {
    restartTickLoop();
  }
  rebuildAuthoritativeField();
}

function syncPlayerCargoCapacity(player) {
  const desired = Math.max(1, Math.round(player?.brain?.cargoSlots || PLAYER_CARGO_SLOTS));
  if (!Array.isArray(player.cargo)) {
    player.cargo = new Array(desired).fill(null);
    return;
  }
  while (player.cargo.length < desired) {
    player.cargo.push(null);
  }
  while (player.cargo.length > desired && player.cargo[player.cargo.length - 1] == null) {
    player.cargo.pop();
  }
}

function refreshPlayerBrain(player, durableProfile = null) {
  if (!player) return null;
  const prevFuelRatio = player.deltaVMax > 0 ? player.deltaV / player.deltaVMax : 1;
  player.hullType = normalizeHullType(player.hullType, durableProfile?.hullType || durableProfile?.shipType || player.profileShipType);
  const rigLevels = normalizeRigLevels(
    durableProfile?.rigLevels || player.rigLevels, player.hullType
  );
  const profileUpgrades = normalizeProfileUpgrades(
    durableProfile?.upgrades || player.profileUpgrades
  );
  player.rigLevels = rigLevels;
  player.profileUpgrades = profileUpgrades;
  if (durableProfile?.hullType || durableProfile?.shipType) {
    player.profileShipType = durableProfile.hullType || durableProfile.shipType;
  }
  player.brain = createPlayerBrain({
    hullType: player.hullType,
    rigLevels,
    profileUpgrades,
    equipped: player.equipped,
  });
  syncPlayerCargoCapacity(player);
  applyPlayerDeltaVBrain(player, { previousRatio: prevFuelRatio });
  return player.brain;
}

function applyPlayerDeltaVBrain(player, { previousRatio = null } = {}) {
  const brain = player.brain || BRAIN_DEFAULTS;
  const ratio = Number.isFinite(previousRatio)
    ? previousRatio
    : player.deltaVMax > 0 ? (Number(player.deltaV) || 0) / player.deltaVMax : 1;
  player.deltaVMax = Math.max(1, Number(brain.deltaVMax) || BRAIN_DEFAULTS.deltaVMax);
  player.deltaVRegen = Math.max(0, Number(brain.deltaVRegen) || 0);
  player.deltaVRegenBoost = Math.max(0, Number(brain.deltaVRegenBoost) || 0);
  player.deltaVBurnEff = Math.max(0.1, Number(brain.deltaVBurnEff) || 1);
  player.deltaVBurnRate = Math.max(1, Number(brain.deltaVBurnRate) || BRAIN_DEFAULTS.deltaVBurnRate);
  player.deltaV = Math.max(0, Math.min(player.deltaVMax, ratio * player.deltaVMax));
  if (!Number.isFinite(player.timeSinceThrust)) player.timeSinceThrust = 999;
}

function createPlayer(clientId, name, hullType = 'drifter', options = {}) {
  const normalizedHullType = normalizeHullType(hullType, options.profileShipType);
  const rigLevels = normalizeRigLevels(options.rigLevels, normalizedHullType);
  const profileUpgrades = normalizeProfileUpgrades(options.profileUpgrades);
  const brain = createPlayerBrain({
    hullType: normalizedHullType,
    rigLevels,
    profileUpgrades,
    equipped: options.equipped,
  });
  return {
    clientId,
    profileId: null,
    profileShipType: options.profileShipType || null,
    profileUpgrades,
    rigLevels,
    name: name || clientId,
    hullType: normalizedHullType,
    brain,
    abilityState: createAbilityState(normalizedHullType, brain),
    wx: 0,
    wy: 0,
    vx: 0,
    vy: 0,
    lastInput: {
      seq: 0,
      moveX: 0,
      moveY: 0,
      thrust: 0,
      brake: 0,
      slingshot: false,
      slingshotEdges: [],
      pulse: false,
      extractConfirm: false,
      ability1: false,
      ability2: false,
      consumeSlot: null,
      timestamp: Date.now(),
    },
    status: "alive",
    cargo: new Array(brain.cargoSlots).fill(null),
    equipped: Array.isArray(options.equipped) ? options.equipped.map((item) => item ? { ...item } : null) : [],
    consumables: Array.isArray(options.consumables) ? options.consumables.map((item) => item ? { ...item } : null) : [],
    activeEffects: [],
    effectState: {
      shieldCharges: 0,
      timeSlowRemaining: 0,
      pulseCooldownRemaining: 0,
      hullGraceRemaining: 0,
    },
    signal: {
      level: 0,
      zone: "ghost",
      prevZone: "ghost",
    },
    controlDebuff: 0,
    portalInteraction: null,
    slingshot: {
      engaged: false,
      anchorId: null,
      anchorType: null,
      anchorWX: null,
      anchorWY: null,
      anchorRange: 0,
      energy: 0,
      chainCount: 0,
      engageRadius: 0,
      orbitDir: 0,
      inputWasDown: false,
      lastReleaseTime: -Infinity,
      lastReleasedAnchorKey: null,
    },
    committedOutcome: null,
    deltaV: brain.deltaVMax || BRAIN_DEFAULTS.deltaVMax,
    deltaVMax: brain.deltaVMax || BRAIN_DEFAULTS.deltaVMax,
    deltaVRegen: brain.deltaVRegen || BRAIN_DEFAULTS.deltaVRegen,
    deltaVRegenBoost: brain.deltaVRegenBoost || BRAIN_DEFAULTS.deltaVRegenBoost,
    deltaVBurnEff: brain.deltaVBurnEff || BRAIN_DEFAULTS.deltaVBurnEff,
    deltaVBurnRate: brain.deltaVBurnRate || BRAIN_DEFAULTS.deltaVBurnRate,
    timeSinceThrust: 999,
  };
}

function getCargoCount(player) {
  return player.cargo.filter(Boolean).length;
}

function startSession(config = {}) {
  if (runtime.session.status === "running") {
    for (const player of runtime.players.values()) {
      if (!player.isAI) {
        commitPlayerOutcome(player, player.status === "escaped" ? "escaped" : "abandoned");
      }
    }
    endSession("reset", { status: "reset" });
  }
  clearTerminalShutdown();
  const requestedMapId = String(config.mapId || "shallows");
  const requestedWorldScale = config.worldScale == null ? null : Number(config.worldScale);
  // Build the RNG streams BEFORE cloning the map state so well growth
  // variance and initial wreck loot roll through the seed.
  const seed = Number.isFinite(Number(config.seed)) ? Number(config.seed) : Math.floor(Math.random() * 1e9);
  const rngStreams = createRNGStreams(seed);
  const mapState = cloneMapState(requestedMapId, requestedWorldScale, rngStreams);
  const scaleProfile = getSessionProfile(mapState.id, mapState.worldScale);
  runtime.session = {
    id: crypto.randomUUID(),
    runId: crypto.randomUUID(),
    status: "running",
    mapId: mapState.id,
    mapName: mapState.name,
    hostClientId: config.requesterId ? String(config.requesterId) : null,
    hostProfileId: config.requesterProfileId
      ? String(config.requesterProfileId)
      : (config.hostProfileId ? String(config.hostProfileId) : null),
    hostName: config.requesterName ? String(config.requesterName) : null,
    overloadState: "NORMAL",
    overloadPressure: 0,
    timeScale: 1,
    worldScale: mapState.worldScale,
    baseTickHz: Number.isFinite(Number(config.tickHz)) ? Number(config.tickHz) : scaleProfile.tickHz,
    baseSnapshotHz: Number.isFinite(Number(config.snapshotHz)) ? Number(config.snapshotHz) : scaleProfile.snapshotHz,
    tickHz: Number.isFinite(Number(config.tickHz)) ? Number(config.tickHz) : scaleProfile.tickHz,
    snapshotHz: Number.isFinite(Number(config.snapshotHz)) ? Number(config.snapshotHz) : scaleProfile.snapshotHz,
    baseWorldTickHz: scaleProfile.worldTickHz,
    worldTickHz: scaleProfile.worldTickHz,
    basePortalTickHz: scaleProfile.portalTickHz,
    portalTickHz: scaleProfile.portalTickHz,
    baseGrowthTickHz: scaleProfile.growthTickHz,
    growthTickHz: scaleProfile.growthTickHz,
    baseScavengerTickHz: scaleProfile.scavengerTickHz,
    scavengerTickHz: scaleProfile.scavengerTickHz,
    baseWaveTickHz: scaleProfile.waveTickHz,
    waveTickHz: scaleProfile.waveTickHz,
    baseFieldTickHz: scaleProfile.fieldTickHz,
    fieldTickHz: scaleProfile.fieldTickHz,
    useCoarseField: scaleProfile.useCoarseField,
    baseFlowFieldCellSize: scaleProfile.flowFieldCellSize,
    flowFieldCellSize: scaleProfile.flowFieldCellSize,
    baseFieldFlowScale: scaleProfile.fieldFlowScale,
    fieldFlowScale: scaleProfile.fieldFlowScale,
    baseEntityRelevanceRadius: scaleProfile.entityRelevanceRadius,
    entityRelevanceRadius: scaleProfile.entityRelevanceRadius,
    baseScavengerRelevanceRadius: scaleProfile.scavengerRelevanceRadius,
    scavengerRelevanceRadius: scaleProfile.scavengerRelevanceRadius,
    baseSpawnScavengersBase: scaleProfile.spawnScavengersBase,
    spawnScavengersBase: scaleProfile.spawnScavengersBase,
    baseSpawnScavengersPerPlayer: scaleProfile.spawnScavengersPerPlayer,
    spawnScavengersPerPlayer: scaleProfile.spawnScavengersPerPlayer,
    baseMaxScavengers: scaleProfile.maxScavengers,
    maxScavengers: scaleProfile.maxScavengers,
    baseMaxRelevantStarsPerPlayer: scaleProfile.maxRelevantStarsPerPlayer,
    maxRelevantStarsPerPlayer: scaleProfile.maxRelevantStarsPerPlayer,
    baseMaxRelevantPlanetoidsPerPlayer: scaleProfile.maxRelevantPlanetoidsPerPlayer,
    maxRelevantPlanetoidsPerPlayer: scaleProfile.maxRelevantPlanetoidsPerPlayer,
    baseMaxRelevantWrecksPerPlayer: scaleProfile.maxRelevantWrecksPerPlayer,
    maxRelevantWrecksPerPlayer: scaleProfile.maxRelevantWrecksPerPlayer,
    baseMaxRelevantScavengersPerPlayer: scaleProfile.maxRelevantScavengersPerPlayer,
    maxRelevantScavengersPerPlayer: scaleProfile.maxRelevantScavengersPerPlayer,
    baseMaxWellInfluencesPerPlayer: scaleProfile.maxWellInfluencesPerPlayer,
    maxWellInfluencesPerPlayer: scaleProfile.maxWellInfluencesPerPlayer,
    baseMaxWaveInfluencesPerPlayer: scaleProfile.maxWaveInfluencesPerPlayer,
    maxWaveInfluencesPerPlayer: scaleProfile.maxWaveInfluencesPerPlayer,
    baseMaxPickupChecksPerPlayer: scaleProfile.maxPickupChecksPerPlayer,
    maxPickupChecksPerPlayer: scaleProfile.maxPickupChecksPerPlayer,
    baseMaxPortalChecksPerPlayer: scaleProfile.maxPortalChecksPerPlayer,
    maxPortalChecksPerPlayer: scaleProfile.maxPortalChecksPerPlayer,
    simScaleProfile: scaleProfile.profileId,
    clientPerfProfile: scaleProfile.clientPerfProfile,
    maxPlayers: Number.isFinite(Number(config.maxPlayers)) ? Number(config.maxPlayers) : DEFAULT_MAX_PLAYERS,
  };
  // Attach seed + rng to the live session. rng stored non-enumerably so
  // it doesn't leak into JSON snapshots sent to clients.
  runtime.session.seed = seed;
  Object.defineProperty(runtime.session, 'rng', {
    value: rngStreams,
    enumerable: false,
    writable: true,
    configurable: true,
  });
  applyRunSeed(runtime.session.rng, mapState, runtime.session);

  runtime.mapState = mapState;
  runtime.mapState.fauna = [];
  runtime.mapState.sentries = spawnSentries(mapState);
  runtime.mapState.scavengers = spawnServerScavengers(runtime.mapState, runtime.session);

  // Hydrate persisted echo wrecks for this seed. Injected as live wrecks
  // so they participate in tickPlayerPickups/tickWrecks like any other
  // wreck. Marked with type: 'echo' and isChronicle: true so the client
  // can render them distinctly. See docs/design/ECHOES-V1.md §Spawn Rules.
  const startedSessionId = runtime.session.id;
  Promise.resolve(controlPlane.getEchoesForSeed(seed, runtime.session.mapId))
    .then((echoes) => {
      // Guard against hydration arriving after the session was reset
      if (runtime.session.id !== startedSessionId) return;
      if (!Array.isArray(echoes) || echoes.length === 0) return;
      for (const echo of echoes) {
        runtime.mapState.wrecks.push(hydrateEchoWreck(echo));
      }
      refreshBallparkMirror("echo-hydration");
    })
    .catch((err) => {
      console.error('[echoes] hydrate failed:', err?.message || err);
    });
  runtime.tick = 0;
  runtime.simTime = 0;
  runtime.emptySince = null;
  runtime.terminalSince = null;
  runtime.terminalShutdownAt = null;
  runtime.systemAccumulators = {
    world: 0,
    portals: 0,
    growth: 0,
    scavengers: 0,
    waves: 0,
    field: 0,
  };
  // Inhibitor: threshold per run, seeded for determinism
  const inh = INHIBITOR_CONFIG;
  const inhRng = runtime.session.rng.rawStream('inhibitorInit');
  runtime.inhibitor = {
    pressure: 0,
    threshold: inh.thresholdMin + inhRng() * (inh.thresholdMax - inh.thresholdMin),
    form: 0, wx: 0, wy: 0, vx: 0, vy: 0,
    intensity: 0, radius: inh.glitchRadius,
    localTime: 0, swarmTrackTimer: 0,
    swarmTargetX: 0, swarmTargetY: 0,
    silenceTimer: 0, vesselTimer: 0,
    finalPortalSpawned: false,
    finalPortalExpired: false,
    formTimes: [null, null, null, null],
    lastSignalWX: 0,
    lastSignalWY: 0,
    lastSignalAge: 0,
    swarmSearchTimer: 0,
    swarmSearchAngle: inhRng() * Math.PI * 2,
    gravityBonus: 0,
  };
  runtime.players.clear();
  runtime.playerAuthorities.clear();
  runtime.joinClaims.clear();
  runtime.eventJournal.startRun(runtime.session.runId);
  runtime.snapshotRing.startRun(runtime.session.runId);
  runtime.recentEvents = [];
  runtime.nextEventSeq = runtime.eventJournal.nextSeq;
  runtime.emptySince = null;
  runtime.overload = createOverloadController({
    tickHz: runtime.session.baseTickHz,
    snapshotHz: runtime.session.baseSnapshotHz,
    worldTickHz: runtime.session.baseWorldTickHz,
    portalTickHz: runtime.session.basePortalTickHz,
    growthTickHz: runtime.session.baseGrowthTickHz,
    scavengerTickHz: runtime.session.baseScavengerTickHz,
    waveTickHz: runtime.session.baseWaveTickHz,
    fieldTickHz: runtime.session.baseFieldTickHz,
    useCoarseField: runtime.session.useCoarseField,
    flowFieldCellSize: runtime.session.baseFlowFieldCellSize,
    fieldFlowScale: runtime.session.baseFieldFlowScale,
    entityRelevanceRadius: runtime.session.baseEntityRelevanceRadius,
    scavengerRelevanceRadius: runtime.session.baseScavengerRelevanceRadius,
    spawnScavengersBase: runtime.session.baseSpawnScavengersBase,
    spawnScavengersPerPlayer: runtime.session.baseSpawnScavengersPerPlayer,
    maxScavengers: runtime.session.baseMaxScavengers,
    maxRelevantStarsPerPlayer: runtime.session.baseMaxRelevantStarsPerPlayer,
    maxRelevantPlanetoidsPerPlayer: runtime.session.baseMaxRelevantPlanetoidsPerPlayer,
    maxRelevantWrecksPerPlayer: runtime.session.baseMaxRelevantWrecksPerPlayer,
    maxRelevantScavengersPerPlayer: runtime.session.baseMaxRelevantScavengersPerPlayer,
    maxWellInfluencesPerPlayer: runtime.session.baseMaxWellInfluencesPerPlayer,
    maxWaveInfluencesPerPlayer: runtime.session.baseMaxWaveInfluencesPerPlayer,
    maxPickupChecksPerPlayer: runtime.session.baseMaxPickupChecksPerPlayer,
    maxPortalChecksPerPlayer: runtime.session.baseMaxPortalChecksPerPlayer,
    maxPlayers: runtime.session.maxPlayers,
  });
  applyOverloadProfile();
  // Spawn AI players
  spawnAIPlayers(runtime.mapState, runtime.session);
  runtime.growthTimer = 0;
  runtime.growthIndex = 0;
  runtime._wreckWaveIndex = 0;
  runtime._wreckWaveRepeatTimer = 0;
  runtime._wreckRepeatWaveCount = 0;
  runtime.waveRings = [];
  runtime.coarseField = null;
  rebuildAuthoritativeField();
  telemetry.info("session.started", { sessionId: runtime.session.id, runId: runtime.session.runId, mapId: runtime.session.mapId, hostClientId: runtime.session.hostClientId, maxPlayers: runtime.session.maxPlayers, simScaleProfile: runtime.session.simScaleProfile });
  publishEvent("session.started", {
    sessionId: runtime.session.id,
    runId: runtime.session.runId,
    mapId: runtime.session.mapId,
    mapName: runtime.session.mapName,
    hostClientId: runtime.session.hostClientId,
    hostName: runtime.session.hostName,
    worldScale: runtime.session.worldScale,
    maxPlayers: runtime.session.maxPlayers,
  });
  refreshBallparkMirror("session-started");
  persistSessionRegistry();
  restartTickLoop();
}

function assignHost(clientId, name) {
  runtime.session.hostClientId = clientId;
  runtime.session.hostProfileId = runtime.players.get(clientId)?.profileId || null;
  runtime.session.hostName = name || clientId;
  telemetry.info("session.hostAssigned", { sessionId: runtime.session.id, clientId, profileId: runtime.session.hostProfileId, name: runtime.session.hostName });
  publishEvent("session.hostAssigned", {
    clientId,
    name: runtime.session.hostName,
  });
  persistSessionRegistry();
}

function newAuthoritySecret() {
  return crypto.randomBytes(32).toString("base64url");
}

function secretsMatch(left, right) {
  const a = Buffer.from(String(left || ""));
  const b = Buffer.from(String(right || ""));
  return a.length > 0 && a.length === b.length && crypto.timingSafeEqual(a, b);
}

function issueJoinClaim(playerId) {
  const normalized = String(playerId || "").trim();
  if (!normalized) return null;
  const claim = newAuthoritySecret();
  runtime.joinClaims.set(normalized, claim);
  return claim;
}

function issuePlayerAuthority(playerId) {
  const authority = {
    runId: runtime.session.runId,
    playerId,
    commandCredential: newAuthoritySecret(),
    lastCommandSeq: 0,
    lastSlingshotEdgeId: 0,
  };
  runtime.playerAuthorities.set(playerId, authority);
  return authority;
}

function publicAuthority(authority, { reconnected = false } = {}) {
  return {
    protocolVersion: PROTOCOL_VERSION,
    runId: authority.runId,
    playerId: authority.playerId,
    commandCredential: authority.commandCredential,
    lastCommandSeq: authority.lastCommandSeq,
    nextCommandSeq: authority.lastCommandSeq + 1,
    reconnected,
  };
}

function requestIdentity(req, body = {}) {
  const bodyPlayerId = String(body.playerId || body.clientId || "").trim();
  const headerPlayerId = String(req.headers[PLAYER_ID_HEADER] || "").trim();
  const bodyRunId = String(body.runId || "").trim();
  const headerRunId = String(req.headers[RUN_ID_HEADER] || "").trim();
  const bodyCredential = String(body.commandCredential || "").trim();
  const headerCredential = String(req.headers[AUTHORITY_HEADER] || "").trim();
  return {
    playerId: headerPlayerId || bodyPlayerId,
    runId: headerRunId || bodyRunId,
    commandCredential: headerCredential || bodyCredential,
    conflict:
      Boolean(headerPlayerId && bodyPlayerId && headerPlayerId !== bodyPlayerId) ||
      Boolean(headerRunId && bodyRunId && headerRunId !== bodyRunId) ||
      Boolean(headerCredential && bodyCredential && headerCredential !== bodyCredential),
  };
}

function authorizePlayerRequest(req, body = {}, { requireCommandSeq = true } = {}) {
  const identity = requestIdentity(req, body);
  if (identity.conflict) {
    return { ok: false, status: 400, code: "conflicting-identity", error: "Header and body authority identity disagree" };
  }
  if (!identity.runId || identity.runId !== runtime.session.runId) {
    return {
      ok: false,
      status: 409,
      code: "stale-run",
      error: "Command does not belong to the active run",
      activeRunId: runtime.session.runId || null,
    };
  }
  if (!identity.playerId) {
    return { ok: false, status: 400, code: "player-required", error: "playerId is required" };
  }
  const authority = runtime.playerAuthorities.get(identity.playerId);
  if (!authority || !secretsMatch(identity.commandCredential, authority.commandCredential)) {
    const credentialOwner = Array.from(runtime.playerAuthorities.values()).find((candidate) =>
      secretsMatch(identity.commandCredential, candidate.commandCredential)
    );
    if (credentialOwner && credentialOwner.playerId !== identity.playerId) {
      return { ok: false, status: 403, code: "wrong-player", error: "Command authority does not own that player" };
    }
    return { ok: false, status: 403, code: "invalid-authority", error: "Invalid player command authority" };
  }
  const bodyPlayerId = String(body.playerId || body.clientId || "").trim();
  if (bodyPlayerId && bodyPlayerId !== authority.playerId) {
    return { ok: false, status: 403, code: "wrong-player", error: "Command authority does not own that player" };
  }
  const commandSeq = Math.max(0, Math.floor(Number(body.commandSeq) || 0));
  if (requireCommandSeq && commandSeq <= authority.lastCommandSeq) {
    return {
      ok: false,
      status: 409,
      code: "stale-command",
      error: "Command sequence is not newer than the last accepted command",
      acceptedCommandSeq: authority.lastCommandSeq,
    };
  }
  return { ok: true, identity, authority, commandSeq };
}

function acceptCommand(auth) {
  auth.authority.lastCommandSeq = auth.commandSeq;
}

function sendAuthorityError(res, result) {
  sendJson(res, result.status || 403, {
    ok: false,
    code: result.code || "invalid-authority",
    error: result.error || "Invalid player command authority",
    activeRunId: result.activeRunId,
    acceptedCommandSeq: result.acceptedCommandSeq,
  });
}

function ensureHostAuthority(req, body = {}) {
  if (!runtime.session.hostClientId) return { ok: true, unclaimed: true };
  const auth = authorizePlayerRequest(req, body, { requireCommandSeq: true });
  if (!auth.ok) return auth;
  if (auth.authority.playerId !== runtime.session.hostClientId) {
    return { ok: false, status: 403, code: "host-required", error: "Only the session host can do that" };
  }
  return auth;
}

function promoteHostIfNeeded() {
  const humanPlayers = Array.from(runtime.players.values()).filter((player) => !player.isAI);
  if (humanPlayers.length === 0) {
    runtime.session.hostClientId = null;
    runtime.session.hostProfileId = null;
    runtime.session.hostName = null;
    runtime.emptySince = runtime.emptySince || Date.now();
    restartTickLoop();
    return;
  }
  runtime.emptySince = null;
  restartTickLoop();
  if (runtime.session.hostClientId && runtime.players.has(runtime.session.hostClientId)) return;
  // Only promote human players to host — AI can't accept /start or /reset
  const nextHost = humanPlayers[0];
  if (nextHost) assignHost(nextHost.clientId, nextHost.name);
}

function buildSnapshotBody() {
  return {
    type: "snapshot",
    protocolVersion: PROTOCOL_VERSION,
    session: { ...runtime.session },
    tick: runtime.tick,
    simTime: runtime.simTime,
    serverTime: Date.now(),
    lastEventSeq: runtime.eventJournal?.lastSeq ?? Math.max(0, runtime.nextEventSeq - 1),
    players: Array.from(runtime.players.values()).map((player) => ({
      clientId: player.clientId,
      profileId: player.profileId || null,
      name: player.name,
      isAI: Boolean(player.isAI),
      personality: player.personality || null,
      hullType: player.hullType || 'drifter',
      rigLevels: player.rigLevels || [0, 0, 0],
      abilityState: player.abilityState ? {
        hullType: player.abilityState.hullType,
        // Drifter
        flowLockActive: player.abilityState.flowLockActive,
        flowLockCooldown: player.abilityState.flowLockCooldown,
        eddyBrakeCooldown: player.abilityState.eddyBrakeCooldown,
        // Breacher
        burnActive: player.abilityState.burnActive,
        burnFuel: player.abilityState.burnFuel,
        momentumShieldActive: player.abilityState.momentumShieldActive,
        // Resonant
        eddies: player.abilityState.eddies,
        tapAnchor: player.abilityState.tapAnchor,
        tapCooldown: player.abilityState.tapCooldown,
        frequencyShiftCooldown: player.abilityState.frequencyShiftCooldown,
        nextPulseInverted: player.abilityState.nextPulseInverted,
        // Shroud
        ghostTrailActive: player.abilityState.ghostTrailActive,
        wakeCloakCooldown: player.abilityState.wakeCloakCooldown,
        decoyCharges: player.abilityState.decoyCharges,
        decoyCooldown: player.abilityState.decoyCooldown,
        decoys: player.abilityState.decoys,
        // Hauler
        salvageLockCharges: player.abilityState.salvageLockCharges,
        tractorCooldown: player.abilityState.tractorCooldown,
        tractorChannelTimer: player.abilityState.tractorChannelTimer,
      } : null,
      status: player.status,
      wx: player.wx,
      wy: player.wy,
      vx: player.vx,
      vy: player.vy,
      slingshot: player.slingshot ? {
        engaged: Boolean(player.slingshot.engaged),
        anchorId: player.slingshot.anchorId ?? null,
        anchorType: player.slingshot.anchorType ?? null,
        anchorWX: player.slingshot.anchorWX ?? null,
        anchorWY: player.slingshot.anchorWY ?? null,
        anchorRange: player.slingshot.anchorRange ?? 0,
        energy: player.slingshot.energy || 0,
        chainCount: player.slingshot.chainCount || 0,
        engageRadius: player.slingshot.engageRadius || 0,
        orbitDir: player.slingshot.orbitDir || 0,
      } : null,
      deltaV: player.deltaV,
      deltaVMax: player.deltaVMax,
      deltaVRatio: player.deltaVMax > 0 ? player.deltaV / player.deltaVMax : 0,
      lastInputSeq: player.lastInput.seq,
      lastInputBrake: player.lastInput.brake || 0,
      pendingSlingshotEdgeCount: Array.isArray(player.lastInput.slingshotEdges) ? player.lastInput.slingshotEdges.length : 0,
      cargo: player.cargo,
      cargoCount: getCargoCount(player),
      equipped: player.equipped,
      consumables: player.consumables,
      activeEffects: player.activeEffects,
      effectState: player.effectState,
      portalInteraction: player.portalInteraction ? { ...player.portalInteraction } : null,
      signal: player.signal,
      controlDebuff: player.controlDebuff || 0,
    })),
    world: {
      wells: runtime.mapState.wells,
      stars: runtime.mapState.stars,
      wrecks: runtime.mapState.wrecks,
      planetoids: runtime.mapState.planetoids,
      portals: runtime.mapState.portals,
      nextPortalWaveIndex: runtime.mapState.nextPortalWaveIndex,
      scavengers: runtime.mapState.scavengers,
      fauna: runtime.mapState.fauna,
      sentries: runtime.mapState.sentries,
    },
    inhibitor: {
      form: runtime.inhibitor.form,
      wx: runtime.inhibitor.wx,
      wy: runtime.inhibitor.wy,
      intensity: runtime.inhibitor.intensity,
      radius: runtime.inhibitor.radius,
      threshold: runtime.inhibitor.threshold,
      pressureFrac: runtime.inhibitor.threshold > 0
        ? runtime.inhibitor.pressure / runtime.inhibitor.threshold
        : 0,
      pressure: runtime.inhibitor.pressure,
      localTime: runtime.inhibitor.localTime,
      formTimes: Array.isArray(runtime.inhibitor.formTimes)
        ? runtime.inhibitor.formTimes.slice(0, 4)
        : [null, null, null, null],
      targetWX: runtime.inhibitor.swarmTargetX,
      targetWY: runtime.inhibitor.swarmTargetY,
      lastSignalWX: runtime.inhibitor.lastSignalWX,
      lastSignalWY: runtime.inhibitor.lastSignalWY,
      finalPortalSpawned: Boolean(runtime.inhibitor.finalPortalSpawned),
      finalPortalExpired: Boolean(runtime.inhibitor.finalPortalExpired),
      gravityBonus: runtime.inhibitor.gravityBonus || 0,
    },
    // Snapshot baselines are shared and cacheable. Player-local events are
    // recovered through the authenticated event stream instead.
    recentEvents: filterEventsForPlayer(runtime.recentEvents.slice(-32), null),
  };
}

function snapshotBody({ force = false } = {}) {
  const lastEventSeq = runtime.eventJournal?.lastSeq ?? Math.max(0, runtime.nextEventSeq - 1);
  const latest = runtime.snapshotRing.latest({ runId: runtime.session.runId || "idle" });
  if (!force && latest.status === "hit" && latest.snapshot?.tick === runtime.tick &&
      latest.snapshot?.lastEventSeq === lastEventSeq &&
      latest.snapshot?.session?.status === runtime.session.status) {
    return latest.snapshot;
  }
  return runtime.snapshotRing.append(buildSnapshotBody(), {
    bodySchemaVersion: BODY_SCHEMA_VERSION,
    snapshotSchemaVersion: 2,
    lastEventSeq,
  });
}

function getHumanPlayers({ activeOnly = false } = {}) {
  return Array.from(runtime.players.values()).filter((player) =>
    !player.isAI && (!activeOnly || player.status === "alive")
  );
}

function getHumanPlayerCount(options = {}) {
  return getHumanPlayers(options).length;
}

function getIdleState() {
  const humanPlayerCount = getHumanPlayerCount();
  const activeHumanPlayerCount = getHumanPlayerCount({ activeOnly: true });
  const idle = activeHumanPlayerCount === 0;
  const emptySince = humanPlayerCount === 0 ? runtime.emptySince : null;
  const idleForMs = emptySince ? Math.max(0, Date.now() - emptySince) : 0;
  const terminalShutdownInMs = runtime.terminalShutdownAt
    ? Math.max(0, runtime.terminalShutdownAt - Date.now())
    : null;
  return {
    idle,
    humanPlayerCount,
    activeHumanPlayerCount,
    aiPlayerCount: Math.max(0, runtime.players.size - humanPlayerCount),
    emptySince,
    idleForMs,
    terminalSince: runtime.terminalSince,
    terminalShutdownAt: runtime.terminalShutdownAt,
    terminalShutdownInMs,
    keepAlive: runtime.keepAlive,
    idleTickHz: IDLE_SESSION_TICK_HZ,
    currentLoopTickHz: runtime.loopTickHz,
    idleShutdownMs: runtime.keepAlive ? 0 : runtime.idleShutdownMs,
    shutdownInMs:
      humanPlayerCount > 0 || runtime.keepAlive || !runtime.idleShutdownMs
        ? null
        : Math.max(0, runtime.idleShutdownMs - idleForMs),
  };
}

function shutdownForIdle() {
  if (runtime.shutdownReason) return;
  runtime.shutdownReason = "idle-timeout";
  telemetry.info("runtime.idleShutdown", { idleShutdownMs: runtime.idleShutdownMs, sessionId: runtime.session?.id || null, mapId: runtime.session?.mapId || null });
  console.log(`[${LOG_LABEL}] idle shutdown after ${runtime.idleShutdownMs}ms with no human clients.`);
  shutdown();
}

function trackControlPlaneWrite(promise) {
  // Control-plane writes are intentionally fire-and-track rather than awaited
  // in the tick loop. Run truth stays in the sim; persistence catches up
  // asynchronously and the pending set is drained during shutdown.
  const tracked = Promise.resolve(promise)
    .catch((error) => {
      console.error(`[${LOG_LABEL}] control plane: ${error.message}`);
      return null;
    })
    .finally(() => {
      pendingControlPlaneWrites.delete(tracked);
    });
  pendingControlPlaneWrites.add(tracked);
  return tracked;
}

function persistSessionRegistry() {
  if (!runtime.session?.id) return;
  // Mirror live session truth out of the hot loop so the control plane can
  // answer session/host questions without the client talking directly to sim memory.
  trackControlPlaneWrite(controlPlane.upsertSession(runtime.session, Array.from(runtime.players.values())));
}

function persistEndedSession(extra = {}) {
  if (!runtime.session?.id) return;
  trackControlPlaneWrite(controlPlane.markSessionEnded(runtime.session, Array.from(runtime.players.values()), extra));
}

function clearTerminalShutdown() {
  if (terminalShutdownHandle) {
    clearTimeout(terminalShutdownHandle);
    terminalShutdownHandle = null;
  }
}

function scheduleTerminalShutdown(reason) {
  clearTerminalShutdown();
  runtime.terminalSince = Date.now();
  runtime.terminalShutdownAt = runtime.keepAlive ? null : runtime.terminalSince + TERMINAL_SESSION_GRACE_MS;
  if (runtime.keepAlive || TERMINAL_SESSION_GRACE_MS <= 0) return;
  terminalShutdownHandle = setTimeout(() => {
    runtime.shutdownReason = `terminal-${reason}`;
    telemetry.info("runtime.terminalShutdown", {
      reason,
      terminalGraceMs: TERMINAL_SESSION_GRACE_MS,
      sessionId: runtime.session?.id || null,
      mapId: runtime.session?.mapId || null,
    });
    shutdown();
  }, TERMINAL_SESSION_GRACE_MS);
  terminalShutdownHandle.unref?.();
}

function endSession(reason, extra = {}) {
  if (runtime.session.status !== "running") return false;
  runtime.session.status = "ended";
  runtime.session.endReason = reason;
  runtime.session.endedAt = new Date().toISOString();
  runtime.session.endedSimTime = runtime.simTime;
  publishEvent("session.ended", {
    reason,
    simTime: runtime.simTime,
    humanPlayerCount: getHumanPlayerCount(),
    activeHumanPlayerCount: getHumanPlayerCount({ activeOnly: true }),
  });
  telemetry.info("session.ended", {
    sessionId: runtime.session.id,
    runId: runtime.session.runId,
    reason,
    simTime: runtime.simTime,
    mapId: runtime.session.mapId,
  });
  persistEndedSession({ reason, ...extra });
  writeFiles();
  stopTickLoop();
  scheduleTerminalShutdown(reason);
  return true;
}

function killActiveHumanPlayers(cause) {
  let killedCount = 0;
  for (const player of getHumanPlayers({ activeOnly: true })) {
    player.status = "dead";
    player.vx = 0;
    player.vy = 0;
    publishEvent("player.died", {
      clientId: player.clientId,
      cause,
    });
    commitPlayerOutcome(player, "dead");
    player.cargo = new Array(player.brain?.cargoSlots || PLAYER_CARGO_SLOTS).fill(null);
    killedCount += 1;
  }
  return killedCount;
}

function maybeEnforceMatchLifetime() {
  if (runtime.session.status !== "running") return false;
  if (runtime.simTime < MATCH_MAX_SIM_TIME) return false;
  const killedCount = killActiveHumanPlayers("run-timeout");
  return endSession("run-timeout", { killedCount, maxSimTime: MATCH_MAX_SIM_TIME });
}

function maybeEndTerminalSession(reason = "terminal-players") {
  if (runtime.session.status !== "running") return false;
  if (getHumanPlayerCount() === 0) return false;
  if (getHumanPlayerCount({ activeOnly: true }) > 0) return false;
  return endSession(reason);
}

function cloneProfileLoadout(profile) {
  return {
    equipped: cloneLoadoutItems(profile?.loadout?.equipped),
    consumables: cloneLoadoutItems(profile?.loadout?.consumables),
  };
}

// --- Run Result Package ---
// Built on extraction/death/disconnect. Matches META-LOOP.md schema.
// Flows to control plane for persistence write-back.

function buildRunResult(player, outcome) {
  const cargoItems = player.cargo.filter(Boolean);
  const cargoValue = cargoItems.reduce((s, item) => s + (item.value || 0), 0);
  const survivalTime = runtime.simTime;
  const survivalBonus = survivalBonusEm(survivalTime);
  const isExtraction = outcome === 'escaped';
  const resultOutcome = isExtraction ? 'extracted' : outcome;
  const loadoutSnapshot = {
    equipped: cloneLoadoutItems(player.equipped),
    consumables: cloneLoadoutItems(player.consumables),
  };
  const salvageBrought = [
    ...loadoutSnapshot.equipped,
    ...loadoutSnapshot.consumables,
  ].filter(Boolean);

  // Death cause taxonomy
  let deathCause = null;
  let deathEntityId = null;
  if (outcome === 'dead') {
    // Find the most recent death event for this player
    const deathEvent = [...runtime.recentEvents].reverse().find(
      e => e.type === 'player.died' && e.payload?.clientId === player.clientId
    );
    if (deathEvent) {
      deathCause = deathEvent.payload.cause || 'unknown';
      deathEntityId = deathEvent.payload.wellId || deathEvent.payload.entityId || null;
    }
  }

  // AI outcomes
  const aiOutcomes = [];
  for (const p of runtime.players.values()) {
    if (!p.isAI) continue;
    aiOutcomes.push({
      personality: p.personality,
      hullType: p.hullType,
      outcome: p.status === 'escaped' ? 'extracted' : p.status === 'dead' ? 'dead' : 'alive',
      cargoCount: p.cargo.filter(Boolean).length,
    });
  }

  // Earnings
  const emEarned = runEmEarned({ outcome, cargoValue, survivalTime });
  const cargoExtracted = isExtraction ? cargoItems.map(i => ({ ...i })) : [];
  const cargoLost = !isExtraction ? cargoItems.map(i => ({ ...i })) : [];
  const notables = [];
  if (cargoExtracted.length > 0) {
    notables.push({ type: "cargo_extracted", description: `${cargoExtracted.length} cargo recovered`, value: cargoExtracted.length });
  }
  if (cargoLost.length > 0) {
    notables.push({ type: "cargo_lost", description: `${cargoLost.length} cargo lost`, value: cargoLost.length });
  }
  if (deathCause) {
    notables.push({ type: "death_cause", description: deathEntityId ? `${deathCause}: ${deathEntityId}` : deathCause, value: deathCause });
  }

  return {
    runId: runtime.session.runId,
    pilotId: player.clientId,
    profileId: player.profileId,
    hullType: player.hullType,
    rigLevels: player.rigLevels || [0, 0, 0],
    outcome: resultOutcome,
    deathCause,
    deathEntityId,
    survivalTime,
    cargoExtracted,
    cargoLost,
    salvageBrought,
    loadoutSnapshot,
    signalPeak: player._signalPeak || player.signal.level,
    signalPeakZone: player._signalPeakZone || player.signal.zone,
    timePerZone: player._signalTimePerZone || {},
    inhibitorFormReached: runtime.inhibitor.form,
    inhibitorFormTimes: runtime.inhibitor.formTimes || [],
    survivalBonus,
    emEarned,
    aiOutcomes,
    notables: notables.slice(0, 4),
    milestonesUnlocked: [],
    statsDelta: {
      runsAttempted: 1,
      runsCompleted: isExtraction ? 1 : 0,
      totalSurvivalTime: survivalTime,
      totalEmEarned: emEarned,
      cargoExtracted: cargoExtracted.length,
      cargoLost: cargoLost.length,
    },
    mapId: runtime.mapState.id,
    mapScale: runtime.session.worldScale,
    wellCount: runtime.mapState.wells.length,
    seed: runtime.session.seed,
  };
}

// Track the peak cargo value a player has ever held this cycle. Used
// for tier-rating their echo wreck if they die. See docs/design/ECHOES-V1.md.
function updatePeakCargoValue(player) {
  if (!player || !Array.isArray(player.cargo)) return;
  let total = 0;
  for (const item of player.cargo) {
    if (item && Number.isFinite(item.value)) total += item.value;
  }
  if (!Number.isFinite(player._peakCargoValue) || total > player._peakCargoValue) {
    player._peakCargoValue = total;
  }
}

// Chronicle tier derived from peak cargo value. Wrecks carry the
// "earned" tier of the cycle, not a random roll. See ECHOES-V1.md §Tier Table.
function echoTierFromCargoValue(value) {
  const v = Number.isFinite(value) ? value : 0;
  if (v >= 2501) return 4;
  if (v >= 801) return 3;
  if (v >= 201) return 2;
  return 1;
}

// Select the highest-value 60% of a pilot's final cargo for their
// echo wreck. The remaining 40% is lost to the void. "Loss is loss"
// pillar holds — the dead pilot does not get their stuff back, but
// whoever finds the echo can loot from what they were carrying.
function selectEchoLoot(cargo, keepRatio = 0.6) {
  const filled = (cargo || []).filter(Boolean);
  if (filled.length === 0) return [];
  const keepCount = Math.max(1, Math.ceil(filled.length * keepRatio));
  const sorted = [...filled].sort((a, b) => (b.value || 0) - (a.value || 0));
  return sorted.slice(0, keepCount).map(item => ({ ...item }));
}

// Build an echo wreck record for a pilot that just died. Only produces
// a record if the cycle was "loud enough" to be remembered — the pilot
// needs a meaningful peak cargo value. Dying empty leaves no echo; not
// every cycle is loud enough for the universe to remember.
function buildEchoWreckRecord(player, runResult) {
  if (!runtime.session?.seed) return null;
  const cargo = Array.isArray(player?.cargo) ? player.cargo.filter(Boolean) : [];
  if (cargo.length === 0) return null;
  const peakCargoValue = Number.isFinite(player._peakCargoValue) ? player._peakCargoValue : 0;
  if (peakCargoValue < 200) return null;

  const seed = runtime.session.seed;
  // Include position in the hash so two deaths at the same tick on the
  // same seed by the same pilot do not collide (e.g. deterministic
  // replay paths, quick repeated deaths). Per ECHOES-V1.md the echo is
  // keyed by (seed, deathTimestamp, deathPosition).
  const posKey = `${player.wx.toFixed(5)}:${player.wy.toFixed(5)}`;
  const tickHash = `${seed}-${runtime.tick}-${player.clientId || 'anon'}-${posKey}`;
  const wreckId = `echo-${Math.abs(hashStringFNV(tickHash)).toString(16)}`;

  // Select a fragment from the seeded pool keyed on the death cause.
  // Use a per-wreck derived stream so multiple simultaneous deaths don't
  // shift the main RNG streams.
  const fragmentRng = runtime.session.rng.derive('echoFragment', wreckId);
  const fragment = SEEDED_GEN.pickChronicleFragment
    ? SEEDED_GEN.pickChronicleFragment(fragmentRng, runResult.deathCause || 'unknown')
    : '';

  return {
    wreckId,
    mapId: runtime.session.mapId,
    seed,
    createdAt: new Date().toISOString(),
    pilotName: player.name || player.hullType || 'unknown',
    hullType: player.hullType || 'drifter',
    deathCause: runResult.deathCause || 'unknown',
    deathEntityId: runResult.deathEntityId || null,
    wx: player.wx,
    wy: player.wy,
    survivalTime: runtime.simTime,
    signalPeak: player._signalPeak || 0,
    signalPeakZone: player._signalPeakZone || 'ghost',
    peakCargoValue,
    tier: echoTierFromCargoValue(peakCargoValue),
    loot: selectEchoLoot(cargo, 0.6),
    fragment,
  };
}

// Convert a persisted echo record into a live wreck that tickWrecks
// and tickPlayerPickups treat like any other derelict. The echo flag
// is preserved so the client can render it distinctly and the signal
// leak / pickup-spike systems can detect it.
function hydrateEchoWreck(echo) {
  const wreck = {
    ...echo,
    id: `echo-${echo.wreckId || Math.random().toString(36).slice(2, 8)}`,
    type: 'echo',
    isEcho: true,
    alive: true,
    looted: false,
    pickupCooldown: 0,
    vx: 0,
    vy: 0,
    spawnTime: 0, // echoes are ambient from tick 0
    loot: Array.isArray(echo.loot) ? echo.loot.map(item => ({ ...item })) : [],
    // Preserve the narrative payload so the pickup path can display it
    echoFragment: echo.fragment || '',
    echoPilotName: echo.pilotName || 'unknown',
    echoHullType: echo.hullType || 'drifter',
    echoDeathCause: echo.deathCause || 'unknown',
    echoSurvivalTime: echo.survivalTime || 0,
    name: echo.name || `Echo of ${echo.pilotName || 'unknown pilot'}`,
    tier: echo.tier || 1,
  };
  // Nudge position out of any well kill radius if the original death
  // site is now occupied by a grown well (wells grow across cycles).
  const ws = runtime.session?.worldScale;
  if (ws && runtime.mapState?.wells) {
    for (const well of runtime.mapState.wells) {
      const [dx, dy] = worldDisplacementClamped(wreck.wx, wreck.wy, well.wx, well.wy, ws);
      const dist = Math.hypot(dx, dy);
      const minSafe = (well.killRadius || 0) * 1.3;
      if (dist > 0 && dist < minSafe) {
        const scale = minSafe / dist;
        wreck.wx = ((well.wx - dx * scale) % ws + ws) % ws;
        wreck.wy = ((well.wy - dy * scale) % ws + ws) % ws;
      }
    }
  }
  return wreck;
}

// Local wrapped-displacement helper for the nudge above. The existing
// worldDistance/worldDisplacement helpers in this file are 2-arg style,
// this one returns the 2D delta B→A wrapped by world scale.
function worldDisplacementClamped(ax, ay, bx, by, ws) {
  let dx = bx - ax;
  let dy = by - ay;
  const half = ws / 2;
  if (dx > half) dx -= ws;
  if (dx < -half) dx += ws;
  if (dy > half) dy -= ws;
  if (dy < -half) dy += ws;
  return [dx, dy];
}

// Tiny FNV-1a hash for stable wreck ids. Same input → same output.
function hashStringFNV(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h | 0;
}

function commitPlayerOutcome(player, outcome) {
  if (!player || player.isAI || !player.profileId) return null;
  if (player.committedOutcome) return null;
  player.committedOutcome = outcome;

  const runResult = buildRunResult(player, outcome);

  trackControlPlaneWrite(controlPlane.applyOutcome({
    profileId: player.profileId,
    player,
    outcome,
    runDuration: runtime.simTime,
    session: runtime.session,
    runResult, // full result package for persistence
  }));

  // Chronicle echo wreck: persist on death only. Extractions do not
  // leave echoes (they reached the door — the universe does not need
  // to remember them as a warning). See ECHOES-V1.md §Spawn Rules.
  if (outcome === 'dead') {
    const echoRecord = buildEchoWreckRecord(player, runResult);
    if (echoRecord) {
      trackControlPlaneWrite(
        Promise.resolve(controlPlane.saveEchoWreck(echoRecord))
          .catch((err) => console.error('[echoes] save failed:', err?.message || err))
      );
    }
  }

  // Existing consumers depend on profile.updated to know the write finished
  telemetry.info("player.outcomeCommitted", { sessionId: runtime.session?.id || null, clientId: player.clientId, profileId: player.profileId, outcome, hullType: player.hullType, cargoCount: getCargoCount(player) });
  publishEvent("profile.updated", {
    clientId: player.clientId,
    profileId: player.profileId,
    outcome,
  });
  publishEvent("run.result", {
    clientId: player.clientId,
    profileId: player.profileId,
    ...runResult,
  });
  return runResult;
}

function spawnWaveRing(wx, wy, amplitude) {
  runtime.waveRings.push({
    id: `wave-${runtime.tick}-${Math.random().toString(36).slice(2, 6)}`,
    sourceWX: wx,
    sourceWY: wy,
    radius: 0,
    amplitude,
    initialAmplitude: amplitude,
    alive: true,
  });
}

function tickWells(dt) {
  for (const well of runtime.mapState.wells) {
    well.killRadius = wellKillRadiusForMass(well);
  }
}

function tickPortals(dt) {
  const schedule = PORTAL_CONFIG.waves;
  const rng = runtime.session?.rng?.rawStream('portals') || Math.random;
  while (runtime.mapState.nextPortalWaveIndex < schedule.length) {
    const wave = schedule[runtime.mapState.nextPortalWaveIndex];
    if (runtime.simTime < wave.time) break;

    const spawnCount = wave.count[0] + Math.floor(rng() * (wave.count[1] - wave.count[0] + 1));
    for (let i = 0; i < spawnCount; i++) {
      const type = wave.types[Math.floor(rng() * wave.types.length)];
      const pos = findPortalSpawnPosition(type);
      const lifespan = type === "unstable"
        ? wave.lifespan + (rng() - 0.5) * wave.lifespan * 0.4
        : wave.lifespan;
      const portal = {
        id: `portal-${runtime.mapState.nextPortalWaveIndex + 1}-${i + 1}-${runtime.tick}`,
        wx: pos.wx,
        wy: pos.wy,
        type,
        wave: runtime.mapState.nextPortalWaveIndex + 1,
        spawnTime: runtime.simTime,
        lifespan,
        alive: true,
        opacity: 1,
      };
      runtime.mapState.portals.push(portal);
      publishEvent("portal.spawned", {
        portalId: portal.id,
        type: portal.type,
        wx: portal.wx,
        wy: portal.wy,
        wave: portal.wave,
      });
    }
    runtime.mapState.nextPortalWaveIndex += 1;
  }

  for (const portal of runtime.mapState.portals) {
    if (portal.alive === false) continue;
    const remaining = portal.spawnTime + portal.lifespan - runtime.simTime;
    if (remaining <= 0) {
      portal.alive = false;
      portal.opacity = 0;
      const handle = runtime.ballparkMirror?.getHandleById(`portal:${portal.id}`);
      if (handle) runtime.ballparkMirror.setLifecycle(handle, "dead", { tick: runtime.tick });
      publishEvent("portal.expired", {
        portalId: portal.id,
        type: portal.type,
      });
      if (portal.finalInhibitor) {
        runtime.inhibitor.finalPortalExpired = true;
        const killedCount = killActiveHumanPlayers("collapse");
        if (killedCount > 0) endSession("inhibitor-final-portal-missed", { killedCount, portalId: portal.id });
      }
      continue;
    }
    portal.opacity = remaining < 15 ? Math.max(0, remaining / 15) : 1;
  }
}

// --- Wreck Wave Spawning ---
// Spawn wreck waves on a schedule, with later waves spawning richer wrecks
// in more dangerous positions. See LOOT-ECONOMY.md.

function tickWreckWaves(dt) {
  if (!runtime._wreckWaveIndex) runtime._wreckWaveIndex = 0;
  if (!runtime._wreckWaveRepeatTimer) runtime._wreckWaveRepeatTimer = 0;
  if (!runtime._wreckRepeatWaveCount) runtime._wreckRepeatWaveCount = 0;
  const ws = runtime.session.worldScale;
  const waveRng = runtime.session?.rng?.rawStream('wreckWave') || Math.random;
  const nameRng = runtime.session?.rng?.rawStream('wreckNames') || Math.random;

  // Process scheduled waves
  while (runtime._wreckWaveIndex < WRECK_WAVES.length) {
    const wave = WRECK_WAVES[runtime._wreckWaveIndex];
    if (runtime.simTime < wave.time) break;

    const count = wave.count[0] + Math.floor(waveRng() * (wave.count[1] - wave.count[0] + 1));
    for (let i = 0; i < count; i++) {
      const slots = wave.slots[0] + Math.floor(waveRng() * (wave.slots[1] - wave.slots[0] + 1));
      const pos = findWreckSpawnPosition(wave.dangerZone);
      const wreck = {
        id: `wreck-wave-${runtime._wreckWaveIndex}-${i}-${runtime.tick}`,
        wx: pos.wx, wy: pos.wy,
        type: 'derelict',
        name: generateWreckName(nameRng),
        tier: rollTier(runtime.simTime, 'wreckTier'),
        size: slots > 2 ? 'large' : slots > 1 ? 'medium' : 'small',
        alive: true, looted: false, pickupCooldown: 0,
        vx: 0, vy: 0,
        spawnTime: runtime.simTime,
        loot: generateWreckLoot(runtime.simTime, slots, 'wreckLoot'),
      };
      runtime.mapState.wrecks.push(wreck);
    }
    runtime._wreckWaveIndex++;
  }

  // Repeats are bounded because every match is a fresh map; anything beyond
  // the authored schedule should be an opt-in stress/tuning path, not a leak.
  if (
    runtime._wreckWaveIndex >= WRECK_WAVES.length &&
    MAX_WRECK_REPEAT_WAVES > 0 &&
    runtime._wreckRepeatWaveCount < MAX_WRECK_REPEAT_WAVES &&
    runtime.simTime < MATCH_MAX_SIM_TIME &&
    runtime.mapState.wrecks.length < MAX_LIVE_WRECKS
  ) {
    runtime._wreckWaveRepeatTimer += dt;
    if (runtime._wreckWaveRepeatTimer >= WRECK_WAVE_REPEAT_INTERVAL) {
      runtime._wreckWaveRepeatTimer -= WRECK_WAVE_REPEAT_INTERVAL;
      const wave = WRECK_WAVE_REPEAT;
      const count = wave.count[0] + Math.floor(waveRng() * (wave.count[1] - wave.count[0] + 1));
      for (let i = 0; i < count; i++) {
        const slots = wave.slots[0] + Math.floor(waveRng() * (wave.slots[1] - wave.slots[0] + 1));
        const pos = findWreckSpawnPosition(wave.dangerZone);
        const wreck = {
          id: `wreck-repeat-${runtime.tick}-${i}`,
          wx: pos.wx, wy: pos.wy,
          type: 'derelict',
          name: generateWreckName(nameRng),
          tier: rollTier(runtime.simTime, 'wreckTier'),
          size: slots > 2 ? 'large' : 'medium',
          alive: true, looted: false, pickupCooldown: 0,
          vx: 0, vy: 0,
          spawnTime: runtime.simTime,
          loot: generateWreckLoot(runtime.simTime, slots, 'wreckLoot'),
        };
        runtime.mapState.wrecks.push(wreck);
      }
      runtime._wreckRepeatWaveCount += 1;
    }
  }
}

// Spawn position biased by danger zone: lower dangerZone = closer to wells
function findWreckSpawnPosition(dangerZone) {
  const ws = runtime.session.worldScale;
  const rng = runtime.session?.rng?.rawStream('wreckPos') || Math.random;
  for (let attempt = 0; attempt < 20; attempt++) {
    const wx = rng() * ws;
    const wy = rng() * ws;
    let minWellDist = Infinity;
    for (const well of runtime.mapState.wells) {
      const d = worldDistance(wx, wy, well.wx, well.wy, ws);
      if (d < minWellDist) minWellDist = d;
    }
    if (minWellDist >= dangerZone * 0.8 && minWellDist <= dangerZone * 2.0) {
      return { wx, wy };
    }
  }
  return { wx: rng() * ws, wy: rng() * ws };
}

function tickGrowth(dt) {
  runtime.growthTimer = (runtime.growthTimer || 0) + dt;
  const perWellInterval = 45 / Math.max(1, runtime.mapState.wells.length);
  while (runtime.growthTimer >= perWellInterval) {
    runtime.growthTimer -= perWellInterval;
    const idx = (runtime.growthIndex || 0) % runtime.mapState.wells.length;
    runtime.growthIndex = idx + 1;
    const well = runtime.mapState.wells[idx];
    if (!well) break;
    well.mass += well.growthRate;
    well.killRadius = wellKillRadiusForMass(well);
    spawnWaveRing(well.wx, well.wy, WAVE_SERVER.growthWaveAmplitude * well.mass);
    runtime.inhibitor.pressure += INHIBITOR_CONFIG.pressureFromGrowth;
    publishEvent("well.grew", {
      wellId: well.id,
      mass: well.mass,
      killRadius: well.killRadius,
      wx: well.wx,
      wy: well.wy,
    });
  }
}

function tickWaveRings(dt) {
  for (const ring of runtime.waveRings) {
    ring.radius += WAVE_SERVER.waveSpeed * dt;
    ring.amplitude *= WAVE_SERVER.waveDecay;
    if (ring.radius > WAVE_SERVER.waveMaxRadius || ring.amplitude < 0.01) {
      ring.alive = false;
    }
  }
  runtime.waveRings = runtime.waveRings.filter((ring) => ring.alive !== false);
}

function maybeCollapseRun() {
  const activePortalCount = runtime.mapState.portals.filter(isPortalAvailable).length;
  const hasMorePortalWaves = runtime.mapState.nextPortalWaveIndex < PORTAL_CONFIG.waves.length;
  if (runtime.simTime <= 60) return;
  if (activePortalCount > 0) return;
  if (hasMorePortalWaves) return;
  if (runtime.inhibitor?.form >= 3 &&
      !runtime.inhibitor.finalPortalSpawned &&
      !runtime.inhibitor.finalPortalExpired) {
    return;
  }

  let killedCount = 0;
  for (const player of runtime.players.values()) {
    if (player.status !== "alive") continue;
    player.status = "dead";
    player.vx = 0;
    player.vy = 0;
    publishEvent("player.died", {
      clientId: player.clientId,
      cause: "collapse",
    });
    commitPlayerOutcome(player, "dead");
    player.cargo = new Array(player.brain?.cargoSlots || PLAYER_CARGO_SLOTS).fill(null);
    killedCount += 1;
  }
  if (killedCount > 0) endSession("collapse", { killedCount });
}

function tickStars(dt, stars = runtime.mapState.stars) {
  for (const star of stars) {
    if (star.alive === false) continue;
    star.wx = wrapWorld(star.wx + (star.driftVX || 0) * dt, runtime.session.worldScale);
    star.wy = wrapWorld(star.wy + (star.driftVY || 0) * dt, runtime.session.worldScale);

    for (const well of runtime.mapState.wells) {
      const dist = worldDistance(star.wx, star.wy, well.wx, well.wy, runtime.session.worldScale);
      if (dist < well.killRadius) {
        star.alive = false;
        well.mass += (star.mass || 1) * 0.5;
        well.killRadius = wellKillRadiusForMass(well);
        const angle = (runtime.session?.rng?.rawStream('starRemnant') || Math.random)() * Math.PI * 2;
        const ejectDist = 0.08;
        const ejectSpeed = 0.4;
        const remnant = {
          id: `wreck-remnant-${star.id}-${runtime.tick}`,
          wx: wrapWorld(well.wx + Math.cos(angle) * ejectDist, runtime.session.worldScale),
          wy: wrapWorld(well.wy + Math.sin(angle) * ejectDist, runtime.session.worldScale),
          type: "vault",
          tier: 3,
          size: "large",
          alive: true,
          looted: false,
          pickupCooldown: 1.0,
          vx: Math.cos(angle) * ejectSpeed,
          vy: Math.sin(angle) * ejectSpeed,
          loot: [],
          name: `Remnant of ${star.name}`,
        };
        runtime.mapState.wrecks.push(remnant);
        spawnWaveRing(well.wx, well.wy, (star.mass || 1) * 3);
        publishEvent("star.consumed", {
          starId: star.id,
          starName: star.name,
          starType: star.type,
          starColor: star.typeDef?.color || null,
          wellId: well.id,
          wx: well.wx,
          wy: well.wy,
          remnantWreckId: remnant.id,
        });
        break;
      }
    }
  }
}

function tickWrecks(dt, wrecks = runtime.mapState.wrecks) {
  const ws = runtime.session.worldScale;
  for (const wreck of wrecks) {
    if (wreck.alive === false) continue;
    if (wreck.pickupCooldown > 0) wreck.pickupCooldown = Math.max(0, wreck.pickupCooldown - dt);

    let ax = 0;
    let ay = 0;
    for (const well of runtime.mapState.wells) {
      const dx = worldDisplacement(wreck.wx, well.wx, ws);
      const dy = worldDisplacement(wreck.wy, well.wy, ws);
      const dist = Math.hypot(dx, dy);
      if (dist > 0.8 || dist < 0.001) continue;
      const accel = (0.0045 * well.mass) / Math.pow(Math.max(dist, 0.02), 1.5);
      ax += (dx / dist) * accel;
      ay += (dy / dist) * accel;
    }

    let terminal = 0.05;
    const inh = runtime.inhibitor;
    if (inh?.form >= 2) {
      const dx = worldDisplacement(inh.wx, wreck.wx, ws);
      const dy = worldDisplacement(inh.wy, wreck.wy, ws);
      const dist = Math.hypot(dx, dy);
      const range = INHIBITOR_CONFIG.swarmWreckDriftRange;
      if (dist > 0.001 && dist < range) {
        const proximity = 1 - dist / range;
        // The Swarm is a gravity disturbance, not a magnet. Add a capped
        // tangential shove so nearby wrecks visibly shear without becoming
        // unbounded projectiles during long matches.
        const tangentX = -dy / dist;
        const tangentY = dx / dist;
        const outwardX = dx / dist;
        const outwardY = dy / dist;
        const strength = INHIBITOR_CONFIG.swarmWreckDriftStrength * proximity * proximity;
        ax += (tangentX * 0.78 + outwardX * 0.22) * strength;
        ay += (tangentY * 0.78 + outwardY * 0.22) * strength;
        terminal += INHIBITOR_CONFIG.swarmWreckTerminalBonus * proximity;
      }
    }

    wreck.vx += ax * dt;
    wreck.vy += ay * dt;
    const dragFactor = Math.exp(-1.5 * dt);
    wreck.vx *= dragFactor;
    wreck.vy *= dragFactor;

    const speed = Math.hypot(wreck.vx, wreck.vy);
    if (speed > terminal) {
      wreck.vx *= terminal / speed;
      wreck.vy *= terminal / speed;
    }
    if (speed < 0.0005) {
      wreck.vx = 0;
      wreck.vy = 0;
    }

    wreck.wx = wrapWorld(wreck.wx + wreck.vx * dt, ws);
    wreck.wy = wrapWorld(wreck.wy + wreck.vy * dt, ws);

    for (const well of runtime.mapState.wells) {
      const dist = worldDistance(wreck.wx, wreck.wy, well.wx, well.wy, ws);
      if (dist < well.killRadius) {
        wreck.alive = false;
        well.mass += 0.1;
        well.killRadius = wellKillRadiusForMass(well);
        publishEvent("wreck.consumed", {
          wreckId: wreck.id,
          wellId: well.id,
        });
        break;
      }
    }
  }
}

function tickPlanetoids(dt, planetoids = runtime.mapState.planetoids) {
  for (const planetoid of planetoids) {
    if (planetoid.alive === false) continue;
    updatePlanetoidState(planetoid, runtime.mapState.wells, dt, runtime.session.worldScale);
    for (const well of runtime.mapState.wells) {
      const dist = worldDistance(planetoid.wx, planetoid.wy, well.wx, well.wy, runtime.session.worldScale);
      if (dist < well.killRadius) {
        planetoid.alive = false;
        well.mass += 0.08;
        well.killRadius = wellKillRadiusForMass(well);
        spawnWaveRing(well.wx, well.wy, 0.2);
        publishEvent("planetoid.consumed", {
          planetoidId: planetoid.id,
          wellId: well.id,
          wx: well.wx,
          wy: well.wy,
        });
        break;
      }
    }
  }
}

function applyStarPush(player, dt, stars = runtime.mapState.stars) {
  for (const star of stars) {
    if (star.alive === false) continue;
    const { dist, nx, ny } = worldDirection(star.wx, star.wy, player.wx, player.wy, runtime.session.worldScale);
    const accel = inversePowerForce(
      dist,
      STAR_SERVER.shipPushStrength,
      star.mass || 1,
      STAR_SERVER.shipPushFalloff,
      STAR_SERVER.maxRange
    );
    if (accel > 0) {
      player.vx += nx * accel * dt;
      player.vy += ny * accel * dt;
    }
  }
}

function applyPlanetoidPush(player, dt, planetoids = runtime.mapState.planetoids) {
  for (const planetoid of planetoids) {
    if (planetoid.alive === false) continue;
    const { dist, nx, ny } = worldDirection(planetoid.wx, planetoid.wy, player.wx, player.wy, runtime.session.worldScale);
    const accel = proximityForce(dist, PLANETOID_SERVER.shipPushStrength, PLANETOID_SERVER.shipPushRadius);
    if (accel > 0) {
      player.vx += nx * accel * dt;
      player.vy += ny * accel * dt;
    }
  }
}

function movementSweep(startWX, startWY, player) {
  const worldScale = runtime.session.worldScale;
  return {
    startX: startWX,
    startY: startWY,
    deltaX: wrappedDelta(startWX, player.wx, worldScale),
    deltaY: wrappedDelta(startWY, player.wy, worldScale),
    worldScale,
  };
}

function sweptEntityContact(sweep, entity, radius) {
  if (!sweep) return null;
  const result = sweptMovingCircleVsCircle({
    ...sweep,
    movingRadius: 0,
    targetX: entity.wx,
    targetY: entity.wy,
    targetRadius: Math.max(0, radius),
  });
  return result.hit ? result : null;
}

function applyScavengerBump(player, scavengers = runtime.mapState.scavengers, sweep = null) {
  for (const scav of scavengers) {
    if (scav.alive === false || scav.state === "dying") continue;
    const { dist, nx, ny } = worldDirection(scav.wx, scav.wy, player.wx, player.wy, runtime.session.worldScale);
    const swept = dist >= SCAVENGER_CONFIG.bumpRadius
      ? sweptEntityContact(sweep, scav, SCAVENGER_CONFIG.bumpRadius)
      : null;
    if ((dist < SCAVENGER_CONFIG.bumpRadius || swept) && dist > 0.0001) {
      const impulse = SCAVENGER_CONFIG.bumpForce;
      const contactNX = swept?.normalX || nx;
      const contactNY = swept?.normalY || ny;
      player.vx += contactNX * impulse;
      player.vy += contactNY * impulse;
      scav.vx -= contactNX * impulse;
      scav.vy -= contactNY * impulse;
      publishEvent("player.scavengerBumped", {
        clientId: player.clientId,
        scavengerId: scav.id,
        swept: Boolean(swept),
        wx: swept?.contactX ?? player.wx,
        wy: swept?.contactY ?? player.wy,
      }, { lane: "neighborhood", subject: player.clientId });
    }
  }
}

function applyWaveRingPush(player, dt) {
  if (runtime.session.useCoarseField && runtime.coarseField) {
    const field = sampleCoarseFlowField(runtime.coarseField, player.wx, player.wy);
    player.vx += (field.wave?.x ?? field.waveX) * dt;
    player.vy += (field.wave?.y ?? field.waveY) * dt;
    return;
  }
  const halfWidth = WAVE_SERVER.waveWidth * 0.5;
  const relevantRings = collectNearestByDistance(
    player.wx,
    player.wy,
    runtime.waveRings,
    runtime.session.maxWaveInfluencesPerPlayer || runtime.waveRings.length || 1,
    (ring) => ({ wx: ring.sourceWX, wy: ring.sourceWY })
  );
  for (const { entity: ring } of relevantRings) {
    const { dist, nx, ny } = worldDirection(ring.sourceWX, ring.sourceWY, player.wx, player.wy, runtime.session.worldScale);
    const accel = waveBandForce(dist, ring.radius, halfWidth, WAVE_SERVER.waveShipPush, ring.amplitude);
    if (accel > 0) {
      player.vx += nx * accel * dt;
      player.vy += ny * accel * dt;
    }
  }
}

function resolveWellContact(player, well, dt, dx, dy) {
  if (player.effectState.shieldCharges > 0) {
    player.effectState.shieldCharges -= 1;
    refreshPlayerEffects(player);
    publishEvent("player.shieldAbsorbed", {
      clientId: player.clientId,
      wellId: well.id,
      wellName: well.name || well.id,
    });
    return "protected";
  }
  if ((player.effectState.hullGraceRemaining || 0) > 0) {
    player.effectState.hullGraceRemaining = Math.max(0, player.effectState.hullGraceRemaining - dt);
    if (player.effectState.hullGraceRemaining > 0) return "protected";
  } else if ((player.brain?.wellGraceDuration || 0) > 0) {
    player.effectState.hullGraceRemaining = player.brain.wellGraceDuration;
    publishEvent("player.hullGraceStarted", {
      clientId: player.clientId,
      wellId: well.id,
      wellName: well.name || well.id,
      duration: player.brain.wellGraceDuration,
    });
    return "protected";
  }
  if (player.abilityState && player.abilityState.hullType === 'hauler'
      && player.abilityState.wellSurvivesRemaining > 0) {
    player.abilityState.wellSurvivesRemaining--;
    const ejectAngle = Math.atan2(dy, dx) + Math.PI;
    player.vx = Math.cos(ejectAngle) * 0.3;
    player.vy = Math.sin(ejectAngle) * 0.3;
    player.wx = ((player.wx + Math.cos(ejectAngle) * 0.1) % runtime.session.worldScale + runtime.session.worldScale) % runtime.session.worldScale;
    player.wy = ((player.wy + Math.sin(ejectAngle) * 0.1) % runtime.session.worldScale + runtime.session.worldScale) % runtime.session.worldScale;
    const scatterRng = runtime.session?.rng?.rawStream('hullSave') || Math.random;
    const filled = player.cargo.map((cargo, index) => cargo ? index : -1).filter((index) => index >= 0);
    const scatterCount = Math.min(filled.length, 1 + Math.floor(scatterRng() * 2));
    for (let scatter = 0; scatter < scatterCount; scatter++) {
      const index = filled[Math.floor(scatterRng() * filled.length)];
      player.cargo[index] = null;
    }
    publishEvent("ability.activated", {
      clientId: player.clientId,
      ability: "reinforcedHull",
      wellId: well.id,
    });
    return "protected";
  }

  player.status = "dead";
  player.vx = 0;
  player.vy = 0;
  publishEvent("player.died", {
    clientId: player.clientId,
    cause: "well",
    wellId: well.id,
    wellName: well.name || well.id,
  });
  commitPlayerOutcome(player, "dead");
  player.cargo = new Array(player.brain?.cargoSlots || PLAYER_CARGO_SLOTS).fill(null);
  return "dead";
}

function applyWellGravity(player, dt) {
  const relevantWells = collectNearestByDistance(
    player.wx,
    player.wy,
    runtime.mapState.wells,
    runtime.session.maxWellInfluencesPerPlayer || runtime.mapState.wells.length || 1
  );
  for (const { entity: well } of relevantWells) {
    const dx = worldDisplacement(player.wx, well.wx, runtime.session.worldScale);
    const dy = worldDisplacement(player.wy, well.wy, runtime.session.worldScale);
    const dist = Math.hypot(dx, dy);
    if (dist < 0.0001) continue;
    if (dist < well.killRadius && resolveWellContact(player, well, dt, dx, dy) === "dead") return;
  }
  if ((player.effectState.hullGraceRemaining || 0) > 0) {
    player.effectState.hullGraceRemaining = 0;
  }
  let pullX = 0;
  let pullY = 0;
  if (runtime.session.useCoarseField && runtime.coarseField) {
    const field = sampleCoarseFlowField(runtime.coarseField, player.wx, player.wy);
    pullX = field.gravity?.x ?? field.gravityX;
    pullY = field.gravity?.y ?? field.gravityY;
  } else {
    for (const { entity: well } of relevantWells) {
      const dx = worldDisplacement(player.wx, well.wx, runtime.session.worldScale);
      const dy = worldDisplacement(player.wy, well.wy, runtime.session.worldScale);
      const dist = Math.hypot(dx, dy);
      if (dist < 0.0001) continue;
      const pull = inversePowerForce(
        dist,
        SERVER_WELLS.shipPullStrength,
        well.mass,
        SERVER_WELLS.shipPullFalloff,
        SERVER_WELLS.maxRange
      );
      pullX += (dx / dist) * pull;
      pullY += (dy / dist) * pull;
    }
  }
  let pullScale = 1;
  if (player.activeEffects.includes("reduceWellPull")) pullScale *= 0.8;
  const wr = player.brain ? player.brain.wellResistScale : 1.0;
  if (wr !== 1.0) pullScale /= wr;
  pullScale *= getMomentumShieldMult(player);
  player.vx += pullX * pullScale * dt;
  player.vy += pullY * pullScale * dt;
}

function applySweptWellContacts(player, dt, sweep) {
  const contacts = [];
  for (const well of runtime.mapState.wells) {
    const hit = sweptEntityContact(sweep, well, well.killRadius);
    if (!hit || hit.startedOverlapping) continue;
    contacts.push({ well, hit });
  }
  contacts.sort((a, b) => a.hit.t - b.hit.t || String(a.well.id).localeCompare(String(b.well.id)));
  for (const { well, hit } of contacts) {
    const dx = worldDisplacement(hit.contactX, well.wx, runtime.session.worldScale);
    const dy = worldDisplacement(hit.contactY, well.wy, runtime.session.worldScale);
    if (resolveWellContact(player, well, dt, dx, dy) === "dead") return;
  }
}

function pickupRadiusForPlayer(player) {
  return 0.08 * (player.brain ? player.brain.pickupRadius : 1.0);
}

function collectPickupWreckCandidates(player, wrecks, pickupDist, limit) {
  const mirror = runtime.ballparkMirror;
  if (!mirror) throw new Error("Ballpark is required for authoritative pickup queries");

  const materializedById = indexEntitiesById(wrecks);
  const { bodies } = collectNearestBodies(mirror, { wx: player.wx, wy: player.wy }, {
    category: "wreck",
    radius: pickupDist,
    // Cooldown is a wreck-specific gameplay fact, so gather the full local
    // pickup bubble and filter materialized entities before applying budget.
    limit: Math.max(limit, wrecks.length || 1),
    query: {
      interactionMask: BODY_MASKS.PICKUP,
      lifecycleStates: ["alive", "spawning"],
    },
  });

  const ranked = [];
  for (const hit of bodies) {
    const wreck = materializedById.get(String(hit.sourceId));
    if (!wreck || wreck.alive === false || wreck.looted || wreck.pickupCooldown > 0) continue;
    ranked.push({
      entity: wreck,
      handle: mirror.getHandleById(hit.id),
      dist: worldDistance(player.wx, player.wy, wreck.wx, wreck.wy, runtime.session.worldScale),
    });
  }
  ranked.sort((a, b) => a.dist - b.dist);
  return { candidates: ranked.slice(0, limit) };
}

function collectPortalExtractionCandidates(player, portals, captureDist, limit) {
  const mirror = runtime.ballparkMirror;
  if (!mirror) throw new Error("Ballpark is required for authoritative portal queries");

  const materializedById = indexEntitiesById(portals);
  const { bodies } = collectNearestBodies(mirror, { wx: player.wx, wy: player.wy }, {
    category: "portal",
    radius: captureDist,
    limit: Math.max(limit, portals.length || 1),
    query: {
      interactionMask: BODY_MASKS.PORTAL,
      lifecycleStates: ["alive", "spawning"],
    },
  });

  const ranked = [];
  for (const hit of bodies) {
    const portal = materializedById.get(String(hit.sourceId));
    if (!portal || !isPortalAvailable(portal)) continue;
    ranked.push({
      entity: portal,
      handle: mirror.getHandleById(hit.id),
      dist: worldDistance(player.wx, player.wy, portal.wx, portal.wy, runtime.session.worldScale),
    });
  }
  ranked.sort((a, b) => a.dist - b.dist);
  return { candidates: ranked.slice(0, limit) };
}

function tickPlayerPickups(player, wrecks = runtime.mapState.wrecks, sweep = null) {
  if (player.status !== "alive") return;
  const maxCargo = player.brain ? player.brain.cargoSlots : PLAYER_CARGO_SLOTS;
  if (getCargoCount(player) >= maxCargo) return;

  const pickupDist = pickupRadiusForPlayer(player);
  const limit = clampBudgetCount(runtime.session.maxPickupChecksPerPlayer || wrecks.length || 1, wrecks.length || 1);
  const { candidates: endpointCandidates } = collectPickupWreckCandidates(player, wrecks, pickupDist, limit);
  const nearbyById = new Map(endpointCandidates.map((candidate) => [String(candidate.entity.id), {
    ...candidate,
    contactT: 1,
  }]));
  if (sweep) {
    for (const wreck of wrecks) {
      if (wreck.alive === false || wreck.looted || wreck.pickupCooldown > 0) continue;
      const hit = sweptEntityContact(sweep, wreck, pickupDist);
      if (!hit) continue;
      const key = String(wreck.id);
      const existing = nearbyById.get(key);
      if (!existing || hit.t < existing.contactT) {
        nearbyById.set(key, { entity: wreck, dist: hit.distance ?? 0, contactT: hit.t });
      }
    }
  }
  const nearbyWrecks = [...nearbyById.values()]
    .sort((a, b) => a.contactT - b.contactT || a.dist - b.dist)
    .slice(0, limit);
  for (const { entity: wreck, handle, dist, contactT } of nearbyWrecks) {
    if (contactT >= 1 && dist >= pickupDist) continue;

    // Wreck age scales EM sell value only, not artifact coefficients.
    // Coefficients are fixed by the catalog — aging makes loot worth more to sell,
    // not mechanically stronger. This keeps balance tied to item design, not timing.
    const ageMult = wreck.spawnTime != null ? wreckAgeMultiplier(wreck.spawnTime, runtime.simTime) : 1.0;
    while (wreck.loot?.length > 0 && getCargoCount(player) < maxCargo) {
      const freeSlot = player.cargo.indexOf(null);
      if (freeSlot === -1) break;
      const item = wreck.loot.shift();
      if (item && ageMult > 1.0) {
        item.value = Math.round((item.value || 0) * ageMult);
      }
      player.cargo[freeSlot] = item;
    }
    if (!wreck.loot || wreck.loot.length === 0) {
      wreck.looted = true;
      const lifecycleHandle = handle || runtime.ballparkMirror.getHandleById(`wreck:${wreck.id}`);
      if (lifecycleHandle) runtime.ballparkMirror.setLifecycle(lifecycleHandle, "dead", { tick: runtime.tick });
    }
    // Track the peak cargo value this player ever held during the cycle.
    // Used later to tier-rate their chronicle echo wreck if they die.
    updatePeakCargoValue(player);
    // Signal spike from looting (tier-based)
    const wreckTier = wreck.tier || 1;
    let lootSpike = wreckTier >= 3 ? SIGNAL_CONFIG.lootSpikeT3
      : wreckTier >= 2 ? SIGNAL_CONFIG.lootSpikeT2
      : SIGNAL_CONFIG.lootSpikeT1;
    // Echo wrecks are loud: taking something from the dead makes noise.
    // Adds +0.10 on top of the tier-based spike. See ECHOES-V1.md.
    if (wreck.isEcho) lootSpike += 0.10;
    spikePlayerSignal(player, lootSpike);
    publishEvent("player.loot", {
      clientId: player.clientId,
      wreckId: wreck.id,
      cargoCount: getCargoCount(player),
      isEcho: Boolean(wreck.isEcho),
      echoFragment: wreck.echoFragment || null,
      echoPilotName: wreck.echoPilotName || null,
      echoHullType: wreck.echoHullType || null,
    });
      if (getCargoCount(player) >= maxCargo) break;
  }
}

function clearPortalInteraction(player, reason = "left-zone") {
  if (!player.portalInteraction) return;
  const previous = player.portalInteraction;
  player.portalInteraction = null;
  publishEvent("player.portalProximity", {
    clientId: player.clientId,
    portalId: previous.portalId,
    portalType: previous.portalType,
    entered: false,
    reason,
  });
}

function tickExtraction(player, confirmRequested = false) {
  if (player.status !== "alive") return;
  const portals = runtime.mapState.portals;
  const maxCaptureDist = portals.reduce((best, portal) => {
    if (!isPortalAvailable(portal)) return best;
    return Math.max(best, portalCaptureRadius(portal));
  }, 0.08);
  const limit = clampBudgetCount(runtime.session.maxPortalChecksPerPlayer || portals.length || 1, portals.length || 1);
  const { candidates: endpointCandidates } = collectPortalExtractionCandidates(player, portals, maxCaptureDist, limit);
  const portalHit = endpointCandidates
    .filter(({ entity: portal, dist }) => dist < portalCaptureRadius(portal))
    .sort((a, b) => a.dist - b.dist)[0] || null;

  if (!portalHit) {
    clearPortalInteraction(player);
    return;
  }

  const portal = portalHit.entity;
  const samePortal = player.portalInteraction?.portalId === portal.id;
  if (!samePortal) {
    clearPortalInteraction(player, "changed-zone");
    player.portalInteraction = {
      portalId: portal.id,
      portalType: portal.type,
      enteredTick: runtime.tick,
      ready: true,
    };
    publishEvent("player.portalProximity", {
      clientId: player.clientId,
      portalId: portal.id,
      portalType: portal.type,
      entered: true,
    });
  }

  if (!confirmRequested) return;
  publishEvent("player.portalConfirmed", {
    clientId: player.clientId,
    portalId: portal.id,
    portalType: portal.type,
  });
  player.status = "escaped";
  player.vx = 0;
  player.vy = 0;
  player.portalInteraction = null;
  commitPlayerOutcome(player, "escaped");
  publishEvent("player.escaped", {
    clientId: player.clientId,
    portalId: portal.id,
    portalType: portal.type,
    cargoCount: getCargoCount(player),
  });
}

function refreshPlayerEffects(player) {
  const passive = player.equipped.filter(Boolean).map((item) => item.effect).filter(Boolean);
  const active = [];
  if (player.effectState.shieldCharges > 0) active.push("shieldBurst");
  if (player.effectState.timeSlowRemaining > 0) active.push("timeSlowLocal");
  player.activeEffects = [...new Set([...passive, ...active])];
}

function spawnTemporaryPortalNearPlayer(player) {
  const rng = runtime.session?.rng?.rawStream('breachFlare') || Math.random;
  const angle = rng() * Math.PI * 2;
  const dist = 0.15 + rng() * 0.1;
  const portal = {
    id: `portal-breach-${player.clientId}-${runtime.tick}`,
    wx: wrapWorld(player.wx + Math.cos(angle) * dist, runtime.session.worldScale),
    wy: wrapWorld(player.wy + Math.sin(angle) * dist, runtime.session.worldScale),
    type: "unstable",
    wave: 0,
    spawnTime: runtime.simTime,
    lifespan: 15,
    alive: true,
    opacity: 1,
  };
  runtime.mapState.portals.push(portal);
  publishEvent("portal.spawned", {
    portalId: portal.id,
    type: portal.type,
    wx: portal.wx,
    wy: portal.wy,
    wave: portal.wave,
    source: "breachFlare",
    clientId: player.clientId,
  });
}

function applyConsumable(player, slotIndex) {
  if (!Number.isInteger(slotIndex) || slotIndex < 0 || slotIndex >= player.consumables.length) return;
  const item = player.consumables[slotIndex];
  if (!item || (item.charges || 0) <= 0) return;

  const effectId = item.useEffect || item.effect;
  item.charges = Math.max(0, (item.charges || 0) - 1);
  if (item.charges <= 0) {
    player.consumables[slotIndex] = null;
  }

  switch (effectId) {
    case "shieldBurst":
      player.effectState.shieldCharges += 1;
      break;
    case "timeSlowLocal":
      player.effectState.timeSlowRemaining = SERVER_COMBAT.timeSlowDuration;
      break;
    case "breachFlare":
      spawnTemporaryPortalNearPlayer(player);
      break;
    case "fuelRefill": {
      const refillAmount = Number(item.refillAmount || item.amount || item.deltaV || 35);
      player.deltaV = Math.min(player.deltaVMax || refillAmount, (player.deltaV || 0) + refillAmount);
      break;
    }
    default:
      break;
  }

  refreshPlayerEffects(player);
  publishEvent("player.effectUsed", {
    clientId: player.clientId,
    effectId,
    slotIndex,
  });
}

function applyPulse(player) {
  const pb = player.brain || BRAIN_DEFAULTS;
  if (player.effectState.pulseCooldownRemaining > 0) return false;

  player.effectState.pulseCooldownRemaining = SERVER_COMBAT.pulseCooldown * pb.pulseCooldownScale;
  const pulseRadius = SERVER_COMBAT.pulseEntityRadius * pb.pulseRadiusScale;
  player.vx -= player.lastInput.moveX * SERVER_COMBAT.pulseRecoilForce;
  player.vy -= player.lastInput.moveY * SERVER_COMBAT.pulseRecoilForce;

  for (const other of runtime.players.values()) {
    if (other.clientId === player.clientId || other.status !== "alive") continue;
    const dx = worldDisplacement(player.wx, other.wx, runtime.session.worldScale);
    const dy = worldDisplacement(player.wy, other.wy, runtime.session.worldScale);
    const dist = Math.hypot(dx, dy);
    if (dist < pulseRadius && dist > 0.001) {
      const force = SERVER_COMBAT.pulseEntityForce * (1 - dist / pulseRadius);
      other.vx += (dx / dist) * force;
      other.vy += (dy / dist) * force;
    }
  }

  for (const scav of runtime.mapState.scavengers) {
    if (scav.alive === false) continue;
    const dx = worldDisplacement(player.wx, scav.wx, runtime.session.worldScale);
    const dy = worldDisplacement(player.wy, scav.wy, runtime.session.worldScale);
    const dist = Math.hypot(dx, dy);
    if (dist < pulseRadius && dist > 0.001) {
      const force = SERVER_COMBAT.pulseEntityForce * (1 - dist / pulseRadius);
      scav.vx += (dx / dist) * force;
      scav.vy += (dy / dist) * force;
    }
  }

  for (const planetoid of runtime.mapState.planetoids) {
    if (planetoid.alive === false) continue;
    const dx = worldDisplacement(player.wx, planetoid.wx, runtime.session.worldScale);
    const dy = worldDisplacement(player.wy, planetoid.wy, runtime.session.worldScale);
    const dist = Math.hypot(dx, dy);
    if (dist < pulseRadius * 0.5 && dist > 0.001) {
      planetoid.wx = wrapWorld(planetoid.wx + (dx / dist) * 0.02, runtime.session.worldScale);
      planetoid.wy = wrapWorld(planetoid.wy + (dy / dist) * 0.02, runtime.session.worldScale);
    }
  }

  spikePlayerSignal(player, SIGNAL_CONFIG.pulseSpike * pb.pulseSignalScale);
  publishEvent("player.pulse", {
    clientId: player.clientId,
    wx: player.wx,
    wy: player.wy,
  });
  spawnWaveRing(player.wx, player.wy, 1.5);
  return true;
}

function addDroppedItemWreck(player, item) {
  if (!item) return;
  const rng = runtime.session?.rng?.rawStream('cargoDrop') || Math.random;
  const inputAngle =
    Math.hypot(player.lastInput.moveX, player.lastInput.moveY) > 0.1
      ? Math.atan2(player.lastInput.moveY, player.lastInput.moveX)
      : rng() * Math.PI * 2;
  const rearAngle = inputAngle + Math.PI + (rng() - 0.5) * Math.PI;
  const ejectDist = 0.18;
  const ejectSpeed = 0.3;
  const wreck = {
    id: `wreck-drop-${player.clientId}-${runtime.tick}-${Math.random().toString(36).slice(2, 6)}`,
    wx: wrapWorld(player.wx + Math.cos(rearAngle) * ejectDist, runtime.session.worldScale),
    wy: wrapWorld(player.wy + Math.sin(rearAngle) * ejectDist, runtime.session.worldScale),
    type: "derelict",
    tier: item.tier || "common",
    size: "scattered",
    alive: true,
    looted: false,
    pickupCooldown: 1.5,
    vx: Math.cos(rearAngle) * ejectSpeed,
    vy: Math.sin(rearAngle) * ejectSpeed,
    loot: [{ ...item }],
    name: `dropped: ${item.name}`,
  };
  runtime.mapState.wrecks.push(wreck);
}

function applyInventoryAction(player, actionMessage) {
  if (player.status !== "alive") {
    return { ok: false, error: "Player is not alive" };
  }

  const { action, cargoSlot, equipSlot, consumableSlot } = actionMessage;
  let changed = false;
  let itemName = null;

  switch (action) {
    case "dropCargo": {
      if (cargoSlot < 0 || cargoSlot >= player.cargo.length) return { ok: false, error: "Invalid cargo slot" };
      const item = player.cargo[cargoSlot];
      if (!item) return { ok: false, error: "No cargo item in slot" };
      player.cargo[cargoSlot] = null;
      addDroppedItemWreck(player, item);
      itemName = item.name;
      changed = true;
      break;
    }
    case "equipCargo": {
      if (cargoSlot < 0 || cargoSlot >= player.cargo.length) return { ok: false, error: "Invalid cargo slot" };
      if (equipSlot < 0 || equipSlot >= 2) return { ok: false, error: "Invalid equip slot" };
      const item = player.cargo[cargoSlot];
      if (!item || item.subcategory !== "equippable") return { ok: false, error: "Cargo item is not equippable" };
      const prev = player.equipped[equipSlot] || null;
      player.equipped[equipSlot] = item;
      player.cargo[cargoSlot] = prev;
      itemName = item.name;
      refreshPlayerEffects(player);
      refreshPlayerBrain(player);
      changed = true;
      break;
    }
    case "loadConsumable": {
      if (cargoSlot < 0 || cargoSlot >= player.cargo.length) return { ok: false, error: "Invalid cargo slot" };
      if (consumableSlot < 0 || consumableSlot >= 2) return { ok: false, error: "Invalid consumable slot" };
      const item = player.cargo[cargoSlot];
      if (!item || item.subcategory !== "consumable") return { ok: false, error: "Cargo item is not consumable" };
      const prev = player.consumables[consumableSlot] || null;
      player.consumables[consumableSlot] = item;
      player.cargo[cargoSlot] = prev;
      itemName = item.name;
      changed = true;
      break;
    }
    case "unequip": {
      if (equipSlot < 0 || equipSlot >= 2) return { ok: false, error: "Invalid equip slot" };
      const item = player.equipped[equipSlot];
      if (!item) return { ok: false, error: "No equipped item in slot" };
      const freeCargo = player.cargo.indexOf(null);
      if (freeCargo === -1) return { ok: false, error: "Cargo full" };
      player.equipped[equipSlot] = null;
      player.cargo[freeCargo] = item;
      itemName = item.name;
      refreshPlayerEffects(player);
      refreshPlayerBrain(player);
      changed = true;
      break;
    }
    case "unloadConsumable": {
      if (consumableSlot < 0 || consumableSlot >= 2) return { ok: false, error: "Invalid consumable slot" };
      const item = player.consumables[consumableSlot];
      if (!item) return { ok: false, error: "No consumable in slot" };
      const freeCargo = player.cargo.indexOf(null);
      if (freeCargo === -1) return { ok: false, error: "Cargo full" };
      player.consumables[consumableSlot] = null;
      player.cargo[freeCargo] = item;
      itemName = item.name;
      changed = true;
      break;
    }
    default:
      return { ok: false, error: "Unknown inventory action" };
  }

  if (changed) {
    publishEvent("player.inventoryAction", {
      clientId: player.clientId,
      action,
      itemName,
    });
  }

  return { ok: changed, player };
}

function applyDebugPlayerState(player, body) {
  if (typeof body.hullType === "string" && HULL_DEFINITIONS[body.hullType]) {
    // Internal hulls stay out of the public join contract, but targeted
    // authority tests still need a harness-only way to exercise their rules.
    player.hullType = normalizeHullType(body.hullType);
    player.rigLevels = normalizeRigLevels(body.rigLevels, player.hullType);
    refreshPlayerBrain(player);
    player.abilityState = createAbilityState(player.hullType, player.brain);
    refreshPlayerEffects(player);
  }
  if (Number.isFinite(Number(body.wx))) player.wx = wrapWorldPosition(Number(body.wx), runtime.session.worldScale);
  if (Number.isFinite(Number(body.wy))) player.wy = wrapWorldPosition(Number(body.wy), runtime.session.worldScale);
  if (Number.isFinite(Number(body.vx))) player.vx = Number(body.vx);
  if (Number.isFinite(Number(body.vy))) player.vy = Number(body.vy);
  if (Number.isFinite(Number(body.deltaV))) player.deltaV = Math.max(0, Math.min(player.deltaVMax || BRAIN_DEFAULTS.deltaVMax, Number(body.deltaV)));
  if (Number.isFinite(Number(body.signalLevel))) {
    player.signal.level = Math.max(0, Math.min(1, Number(body.signalLevel)));
    player.signal.zone = signalZoneForLevel(player.signal.level);
    player._signalPeak = Math.max(player._signalPeak || 0, player.signal.level);
    player._signalPeakZone = player.signal.zone;
  }
  if (Number.isFinite(Number(body.timeSinceThrust))) player.timeSinceThrust = Math.max(0, Number(body.timeSinceThrust));
  if (body.resetSlingshot === true) {
    const state = ensurePlayerSlingshot(player);
    state.engaged = false;
    state.anchorId = null;
    state.anchorType = null;
    state.anchorWX = null;
    state.anchorWY = null;
    state.anchorRange = 0;
    state.energy = 0;
    state.chainCount = 0;
    state.engageRadius = 0;
    state.orbitDir = 0;
    state.inputWasDown = false;
    state.lastReleaseTime = -Infinity;
    state.lastReleasedAnchorKey = null;
    state.consumedEdgeIds = [];
    if (player.lastInput) player.lastInput.slingshotEdges = [];
  }
  if (typeof body.status === "string" && body.status) {
    player.status = body.status;
    // Debug death should exercise the same profile write-back path as a real
    // hazard kill; otherwise the harness can set a dead player that never
    // commits an outcome.
    if (player.status === "dead" && !player.committedOutcome) {
      publishEvent("player.died", {
        clientId: player.clientId,
        cause: body.cause || "debug",
      });
      commitPlayerOutcome(player, "dead");
    }
  }
  return player;
}

function applyDebugInhibitorState(body) {
  const inh = runtime.inhibitor;
  const ws = runtime.session.worldScale || runtime.mapState.worldScale || 5;
  if (!inh) return null;
  let requestedForm = null;

  // Harnesses need to render rare late-run forms without waiting through a
  // full match clock; gameplay still owns normal pressure and transitions.
  if (Number.isFinite(Number(body.form))) requestedForm = Math.max(0, Math.min(3, Math.round(Number(body.form))));
  if (Number.isFinite(Number(body.wx))) inh.wx = wrapWorldPosition(Number(body.wx), ws);
  if (Number.isFinite(Number(body.wy))) inh.wy = wrapWorldPosition(Number(body.wy), ws);
  if (Number.isFinite(Number(body.pressure))) inh.pressure = Math.max(0, Math.min(1.5, Number(body.pressure)));
  if (Number.isFinite(Number(body.threshold))) inh.threshold = Math.max(0.01, Math.min(1.5, Number(body.threshold)));
  if (Number.isFinite(Number(body.intensity))) inh.intensity = Math.max(0, Math.min(1, Number(body.intensity)));
  if (Number.isFinite(Number(body.radius))) inh.radius = Math.max(0, Math.min(ws, Number(body.radius)));
  if (Number.isFinite(Number(body.localTime))) inh.localTime = Math.max(0, Number(body.localTime));
  if (Number.isFinite(Number(body.vesselTimer))) inh.vesselTimer = Math.max(0, Number(body.vesselTimer));
  if (Number.isFinite(Number(body.swarmTrackTimer))) inh.swarmTrackTimer = Math.max(0, Number(body.swarmTrackTimer));
  if (Number.isFinite(Number(body.swarmTargetX))) inh.swarmTargetX = wrapWorldPosition(Number(body.swarmTargetX), ws);
  if (Number.isFinite(Number(body.swarmTargetY))) inh.swarmTargetY = wrapWorldPosition(Number(body.swarmTargetY), ws);
  if (typeof body.finalPortalSpawned === "boolean") inh.finalPortalSpawned = body.finalPortalSpawned;
  if (typeof body.finalPortalExpired === "boolean") inh.finalPortalExpired = body.finalPortalExpired;
  if (Number.isFinite(Number(body.lastSignalWX))) inh.lastSignalWX = wrapWorldPosition(Number(body.lastSignalWX), ws);
  if (Number.isFinite(Number(body.lastSignalWY))) inh.lastSignalWY = wrapWorldPosition(Number(body.lastSignalWY), ws);
  if (Number.isFinite(Number(body.gravityBonus))) inh.gravityBonus = Math.max(0, Math.min(0.35, Number(body.gravityBonus)));
  if (Array.isArray(body.formTimes)) {
    inh.formTimes = body.formTimes.slice(0, 4).map((value) => Number.isFinite(Number(value)) ? Number(value) : null);
    while (inh.formTimes.length < 4) inh.formTimes.push(null);
  }

  if (requestedForm !== null) setInhibitorForm(requestedForm, { debug: true });

  if (inh.form === 0) {
    inh.intensity = 0;
    inh.radius = 0;
  } else {
    if (!Number.isFinite(inh.intensity) || inh.intensity <= 0) inh.intensity = 1;
    if (!Number.isFinite(inh.radius) || inh.radius <= 0) {
      inh.radius = inh.form === 1
        ? INHIBITOR_CONFIG.glitchRadius
        : inh.form === 2
          ? INHIBITOR_CONFIG.swarmRadius
          : INHIBITOR_CONFIG.swarmRadius * 1.5;
    }
    if (!Number.isFinite(inh.swarmTargetX)) inh.swarmTargetX = inh.wx;
    if (!Number.isFinite(inh.swarmTargetY)) inh.swarmTargetY = inh.wy;
  }

  return inh;
}

function applyDebugPortalState(body) {
  const ws = runtime.session.worldScale || runtime.mapState.worldScale || 5;
  const requestedId = String(body.portalId || body.id || "").trim();
  let portal = requestedId
    ? runtime.mapState.portals.find((entry) => entry.id === requestedId)
    : null;

  if (!portal) {
    portal = {
      id: requestedId || `portal-debug-${runtime.tick}-${runtime.mapState.portals.length}`,
      wx: 0,
      wy: 0,
      type: "stable",
      wave: 0,
      spawnTime: runtime.simTime,
      lifespan: 60,
      alive: true,
      opacity: 1,
      blockedByInhibitor: false,
      finalInhibitor: false,
    };
    runtime.mapState.portals.push(portal);
  }

  if (Number.isFinite(Number(body.wx))) portal.wx = wrapWorldPosition(Number(body.wx), ws);
  if (Number.isFinite(Number(body.wy))) portal.wy = wrapWorldPosition(Number(body.wy), ws);
  if (typeof body.type === "string" && body.type) portal.type = body.type;
  if (Number.isFinite(Number(body.wave))) portal.wave = Math.max(0, Math.round(Number(body.wave)));
  if (Number.isFinite(Number(body.spawnTime))) portal.spawnTime = Math.max(0, Number(body.spawnTime));
  if (Number.isFinite(Number(body.lifespan))) portal.lifespan = Math.max(0.1, Number(body.lifespan));
  if (Number.isFinite(Number(body.opacity))) portal.opacity = Math.max(0, Math.min(1, Number(body.opacity)));
  if (typeof body.alive === "boolean") portal.alive = body.alive;
  if (typeof body.blockedByInhibitor === "boolean") portal.blockedByInhibitor = body.blockedByInhibitor;
  if (typeof body.finalInhibitor === "boolean") portal.finalInhibitor = body.finalInhibitor;

  return portal;
}

function applyDebugScavengerState(scavenger, body) {
  if (Number.isFinite(Number(body.wx))) scavenger.wx = wrapWorldPosition(Number(body.wx), runtime.session.worldScale);
  if (Number.isFinite(Number(body.wy))) scavenger.wy = wrapWorldPosition(Number(body.wy), runtime.session.worldScale);
  if (Number.isFinite(Number(body.vx))) scavenger.vx = Number(body.vx);
  if (Number.isFinite(Number(body.vy))) scavenger.vy = Number(body.vy);
  if (Number.isFinite(Number(body.lootCount))) scavenger.lootCount = Math.max(0, Number(body.lootCount));
  if (Number.isFinite(Number(body.deathTimer))) scavenger.deathTimer = Math.max(0, Number(body.deathTimer));
  if (typeof body.deathWellId === "string") scavenger.deathWellId = body.deathWellId;
  if (Number.isFinite(Number(body.deathWellWX))) scavenger.deathWellWX = wrapWorldPosition(Number(body.deathWellWX), runtime.session.worldScale);
  if (Number.isFinite(Number(body.deathWellWY))) scavenger.deathWellWY = wrapWorldPosition(Number(body.deathWellWY), runtime.session.worldScale);
  if (Number.isFinite(Number(body.deathStartWX))) scavenger.deathStartWX = wrapWorldPosition(Number(body.deathStartWX), runtime.session.worldScale);
  if (Number.isFinite(Number(body.deathStartWY))) scavenger.deathStartWY = wrapWorldPosition(Number(body.deathStartWY), runtime.session.worldScale);
  if (typeof body.state === "string" && body.state) scavenger.state = body.state;
  if (typeof body.alive === "boolean") scavenger.alive = body.alive;
  return scavenger;
}

function nearestWell(entity) {
  let best = null;
  let bestDist = Infinity;
  for (const well of runtime.mapState.wells) {
    const dist = worldDistance(entity.wx, entity.wy, well.wx, well.wy, runtime.session.worldScale);
    if (dist < bestDist) {
      bestDist = dist;
      best = { well, dist };
    }
  }
  return best;
}

function nearestUnlootedWreck(entity) {
  let best = null;
  let bestDist = Infinity;
  for (const wreck of runtime.mapState.wrecks) {
    if (wreck.alive === false || wreck.looted) continue;
    const dist = worldDistance(entity.wx, entity.wy, wreck.wx, wreck.wy, runtime.session.worldScale);
    if (dist < bestDist) {
      bestDist = dist;
      best = { wreck, dist };
    }
  }
  return best;
}

function nearestPortal(entity) {
  let best = null;
  let bestDist = Infinity;
  for (const portal of runtime.mapState.portals) {
    if (!isPortalAvailable(portal)) continue;
    const dist = worldDistance(entity.wx, entity.wy, portal.wx, portal.wy, runtime.session.worldScale);
    if (dist < bestDist) {
      bestDist = dist;
      best = { portal, dist };
    }
  }
  return best;
}

function getAlivePlayers() {
  return Array.from(runtime.players.values()).filter((player) => player.status === "alive");
}

function collectNearestByDistance(originWX, originWY, entities, limit, getPosition = null) {
  const max = clampBudgetCount(limit, entities.length || 1);
  const ranked = [];
  for (const entity of entities) {
    if (!entity) continue;
    const pos = getPosition ? getPosition(entity) : entity;
    if (!pos) continue;
    const dist = worldDistance(originWX, originWY, pos.wx, pos.wy, runtime.session.worldScale);
    ranked.push({ entity, dist });
  }
  ranked.sort((a, b) => a.dist - b.dist);
  return ranked.slice(0, max);
}

function indexEntitiesById(entities) {
  const byId = new Map();
  for (const entity of entities || []) {
    if (!entity || entity.id === undefined || entity.id === null) continue;
    const id = String(entity.id);
    if (!byId.has(id)) byId.set(id, entity);
  }
  return byId;
}

function buildRelevanceView() {
  const alivePlayers = getAlivePlayers();
  const entityRadius = runtime.session.entityRelevanceRadius || runtime.session.worldScale;
  const scavengerRadius = runtime.session.scavengerRelevanceRadius || entityRadius;
  const relevanceStats = {
    mode: "ballpark",
    tick: runtime.tick,
    simTime: runtime.simTime,
    categories: {},
  };

  if (alivePlayers.length === 0) {
    relevanceStats.mode = "empty";
    relevanceStats.categories.scavenger = {
      mode: "empty",
      selectedCount: runtime.mapState.scavengers.filter((scav) => scav.alive !== false && scav.state === "dying").length,
      reason: "no-alive-players",
    };
    runtime.ballparkRelevance = relevanceStats;
    return {
      alivePlayers,
      stars: [],
      wrecks: [],
      planetoids: [],
      scavengers: runtime.mapState.scavengers.filter((scav) => scav.alive !== false && scav.state === "dying"),
    };
  }

  function collectRelevantEntities(entities, radius, perPlayerLimit, category, query) {
    if (!Array.isArray(entities) || entities.length === 0) {
      relevanceStats.categories[category] = {
        mode: "empty",
        radius,
        perPlayerLimit: 0,
        selectedCount: 0,
      };
      return [];
    }

    const mirror = runtime.ballparkMirror;
    if (!mirror) throw new Error("Ballpark is required for authoritative relevance queries");
    const { bodies, stats } = collectRelevantBodies(mirror, alivePlayers, {
      category,
      radius,
      perOriginLimit: clampBudgetCount(perPlayerLimit, entities.length || 1),
      query,
    });
    const byId = indexEntitiesById(entities);
    const selected = [];
    let missingEntityCount = 0;
    let inactiveEntityCount = 0;
    for (const hit of bodies) {
      const entity = byId.get(String(hit.sourceId));
      if (!entity) {
        missingEntityCount += 1;
        continue;
      }
      if (entity.alive === false) {
        inactiveEntityCount += 1;
        continue;
      }
      selected.push(entity);
    }
    relevanceStats.categories[category] = {
      ...stats,
      materializedCount: selected.length,
      missingEntityCount,
      inactiveEntityCount,
    };
    return selected;
  }

  const dyingScavengers = runtime.mapState.scavengers.filter((scav) => scav.alive !== false && scav.state === "dying");
  const nonDyingScavengers = runtime.mapState.scavengers.filter((scav) => scav.state !== "dying");

  const view = {
    alivePlayers,
    stars: collectRelevantEntities(
      runtime.mapState.stars,
      entityRadius,
      runtime.session.maxRelevantStarsPerPlayer || runtime.mapState.stars.length || 1,
      "star",
      { collisionMask: BODY_MASKS.STAR }
    ),
    wrecks: collectRelevantEntities(
      runtime.mapState.wrecks,
      entityRadius,
      runtime.session.maxRelevantWrecksPerPlayer || runtime.mapState.wrecks.length || 1,
      "wreck",
      { interactionMask: BODY_MASKS.PICKUP }
    ),
    planetoids: collectRelevantEntities(
      runtime.mapState.planetoids,
      entityRadius,
      runtime.session.maxRelevantPlanetoidsPerPlayer || runtime.mapState.planetoids.length || 1,
      "planetoid",
      { collisionMask: BODY_MASKS.PLANETOID }
    ),
    scavengers: [
      ...dyingScavengers,
      ...collectRelevantEntities(
        nonDyingScavengers,
        scavengerRadius,
        runtime.session.maxRelevantScavengersPerPlayer || runtime.mapState.scavengers.length || 1,
        "scavenger",
        { collisionMask: BODY_MASKS.AI, lifecycleStates: ["alive", "spawning"] }
      ),
    ].filter((scav, index, list) => list.findIndex((entry) => entry.id === scav.id) === index),
  };
  relevanceStats.categories.scavenger = {
    ...(relevanceStats.categories.scavenger || {}),
    dyingAlwaysRelevantCount: dyingScavengers.length,
    totalSelectedCount: view.scavengers.length,
  };
  runtime.ballparkRelevance = relevanceStats;
  return view;
}

function steerToward(entity, targetWX, targetWY, intensity = 1) {
  const dx = worldDisplacement(entity.wx, targetWX, runtime.session.worldScale);
  const dy = worldDisplacement(entity.wy, targetWY, runtime.session.worldScale);
  const dist = Math.hypot(dx, dy);
  if (dist < 0.0001) {
    entity.thrustIntensity = 0;
    return;
  }
  entity.facing = Math.atan2(dy, dx);
  entity.thrustIntensity = intensity;
}

function applyWellGravityToEntity(entity, dt, pullScale = 0.02) {
  let ax = 0;
  let ay = 0;
  for (const well of runtime.mapState.wells) {
    const dx = worldDisplacement(entity.wx, well.wx, runtime.session.worldScale);
    const dy = worldDisplacement(entity.wy, well.wy, runtime.session.worldScale);
    const dist = Math.hypot(dx, dy);
    if (dist < 0.0001) continue;
    if (dist < well.killRadius) {
      if (entity.state !== "dying") {
        entity.state = "dying";
        entity.deathTimer = 0;
        entity.deathWellId = well.id;
        entity.deathWellWX = well.wx;
        entity.deathWellWY = well.wy;
        entity.deathStartWX = entity.wx;
        entity.deathStartWY = entity.wy;
        entity.deathAngle = Math.atan2(entity.wy - well.wy, entity.wx - well.wx);
        entity.vx = 0;
        entity.vy = 0;
      }
      return false;
    }
    const pull = (pullScale * well.mass) / Math.pow(Math.max(dist, 0.02), 1.8);
    ax += (dx / dist) * pull;
    ay += (dy / dist) * pull;
  }
  entity.vx += ax * dt;
  entity.vy += ay * dt;
  return true;
}

function spawnScavengerDeathDrops(scav) {
  if ((scav.lootCount || 0) <= 0) return [];
  const tier = scav.archetype === "vulture" ? 2 : 1;
  const drops = [];
  const rng = runtime.session?.rng?.rawStream('scavDeath') || Math.random;
  for (let i = 0; i < scav.lootCount; i++) {
    const angle = rng() * Math.PI * 2;
    const ejectDist = 0.05 + rng() * 0.05;
    const ejectSpeed = 0.2 + rng() * 0.2;
    const wreck = {
      id: `wreck-scav-${scav.id}-${runtime.tick}-${i + 1}`,
      wx: wrapWorld(scav.wx + Math.cos(angle) * ejectDist, runtime.session.worldScale),
      wy: wrapWorld(scav.wy + Math.sin(angle) * ejectDist, runtime.session.worldScale),
      type: "derelict",
      tier,
      size: "scattered",
      alive: true,
      looted: false,
      pickupCooldown: 0.5,
      vx: Math.cos(angle) * ejectSpeed,
      vy: Math.sin(angle) * ejectSpeed,
      loot: [],
      name: `${scav.name} debris`,
    };
    runtime.mapState.wrecks.push(wreck);
    drops.push(wreck.id);
  }
  return drops;
}

function updateScavengerDeathSpiral(scav, dt) {
  const duration = SCAVENGER_CONFIG.deathSpiralDuration;
  scav.deathTimer += dt;

  if (scav.deathTimer >= duration) {
    scav.alive = false;
    const dropIds = spawnScavengerDeathDrops(scav);
    publishEvent("scavenger.consumed", {
      scavengerId: scav.id,
      name: scav.name,
      wellId: scav.deathWellId,
      wx: scav.wx,
      wy: scav.wy,
      lootCount: scav.lootCount || 0,
      droppedWreckIds: dropIds,
    });
    return false;
  }

  const t = scav.deathTimer / duration;
  const dx = worldDisplacement(scav.deathStartWX, scav.deathWellWX, runtime.session.worldScale);
  const dy = worldDisplacement(scav.deathStartWY, scav.deathWellWY, runtime.session.worldScale);
  const startDist = Math.hypot(dx, dy);
  const radius = startDist * (1 - t);
  scav.deathAngle += (4 + t * 12) * dt;
  scav.wx = wrapWorld(scav.deathWellWX + Math.cos(scav.deathAngle) * radius, runtime.session.worldScale);
  scav.wy = wrapWorld(scav.deathWellWY + Math.sin(scav.deathAngle) * radius, runtime.session.worldScale);
  scav.facing += 15 * dt;
  return true;
}

function tickScavengers(dt, scavengers = runtime.mapState.scavengers) {
  const activePortalCount = runtime.mapState.portals.filter(isPortalAvailable).length;

  for (const scav of scavengers) {
    if (scav.alive === false) continue;

    if (scav.state === "dying") {
      updateScavengerDeathSpiral(scav, dt);
      continue;
    }

    scav.decisionTimer -= dt;
    if (scav.decisionTimer <= 0) {
      scav.decisionTimer = SCAVENGER_CONFIG.decisionInterval;
      const nearest = nearestWell(scav);
      if (nearest && nearest.dist < SCAVENGER_CONFIG.fleeWellDist) {
        scav.state = "flee";
        scav.targetWreckId = null;
        scav.targetPortalId = null;
      } else {
        const wreckTarget = nearestUnlootedWreck(scav);
        const portalTarget = nearestPortal(scav);
        if (scav.lootCount >= scav.lootTarget || activePortalCount <= 1) {
          scav.state = portalTarget ? "extract" : "drift";
          scav.targetPortalId = portalTarget?.portal?.id || null;
          scav.targetWreckId = null;
        } else if (wreckTarget && wreckTarget.dist <= SCAVENGER_CONFIG.sensorRange) {
          scav.state = "loot";
          scav.targetWreckId = wreckTarget.wreck.id;
          scav.targetPortalId = null;
        } else {
          scav.state = "drift";
          scav.driftHeading = (runtime.session?.rng?.rawStream('scavDrift') || Math.random)() * Math.PI * 2;
          scav.targetWreckId = null;
          scav.targetPortalId = null;
        }
      }
    }

    if (scav.state === "flee") {
      const nearest = nearestWell(scav);
      if (nearest) {
        const dx = worldDisplacement(nearest.well.wx, scav.wx, runtime.session.worldScale);
        const dy = worldDisplacement(nearest.well.wy, scav.wy, runtime.session.worldScale);
        scav.facing = Math.atan2(dy, dx);
        scav.thrustIntensity = 1;
      } else {
        scav.thrustIntensity = 0;
      }
    } else if (scav.state === "loot") {
      const wreck = runtime.mapState.wrecks.find((entry) => entry.id === scav.targetWreckId && entry.alive !== false && !entry.looted);
      if (!wreck) {
        scav.state = "drift";
        scav.thrustIntensity = 0;
      } else {
        steerToward(scav, wreck.wx, wreck.wy, scav.archetype === "vulture" ? 1 : 0.8);
        const dist = worldDistance(scav.wx, scav.wy, wreck.wx, wreck.wy, runtime.session.worldScale);
        if (dist < SCAVENGER_CONFIG.pickupRadius) {
          scav.lootCount += Math.max(1, wreck.loot?.length || 1);
          wreck.looted = true;
          const handle = runtime.ballparkMirror?.getHandleById(`wreck:${wreck.id}`);
          if (handle) runtime.ballparkMirror.setLifecycle(handle, "dead", { tick: runtime.tick });
          publishEvent("scavenger.loot", {
            scavengerId: scav.id,
            wreckId: wreck.id,
            lootCount: scav.lootCount,
          });
          scav.state = "drift";
          scav.thrustIntensity = 0;
        }
      }
    } else if (scav.state === "extract") {
      const portal = runtime.mapState.portals.find((entry) => entry.id === scav.targetPortalId && entry.alive !== false);
      if (!portal) {
        scav.state = "drift";
        scav.thrustIntensity = 0;
      } else {
        steerToward(scav, portal.wx, portal.wy, 1);
        const dist = worldDistance(scav.wx, scav.wy, portal.wx, portal.wy, runtime.session.worldScale);
        if (dist < portalCaptureRadius(portal)) {
          scav.alive = false;
          publishEvent("scavenger.extracted", {
            scavengerId: scav.id,
            name: scav.name,
            portalId: portal.id,
            lootCount: scav.lootCount,
          });
          continue;
        }
      }
    } else {
      scav.facing = scav.driftHeading ?? scav.facing;
      scav.thrustIntensity = 0.2;
    }

    scav.vx += Math.cos(scav.facing) * SCAVENGER_CONFIG.thrustAccel * scav.thrustIntensity * dt;
    scav.vy += Math.sin(scav.facing) * SCAVENGER_CONFIG.thrustAccel * scav.thrustIntensity * dt;
    if (!applyWellGravityToEntity(scav, dt, 0.02)) continue;

    const dragFactor = Math.exp(-SCAVENGER_CONFIG.drag * dt * 60);
    scav.vx *= dragFactor;
    scav.vy *= dragFactor;
    scav.wx = ((scav.wx + scav.vx * dt) % runtime.session.worldScale + runtime.session.worldScale) % runtime.session.worldScale;
    scav.wy = ((scav.wy + scav.vy * dt) % runtime.session.worldScale + runtime.session.worldScale) % runtime.session.worldScale;
  }

  runtime.mapState.scavengers = runtime.mapState.scavengers.filter((scav) => scav.alive !== false);
}

function runSystemAtRate(key, hz, baseDt, fn) {
  if (!Number.isFinite(hz) || hz <= 0) return;
  const step = 1 / hz;
  runtime.systemAccumulators[key] = (runtime.systemAccumulators[key] || 0) + baseDt;
  let iterations = 0;
  while (runtime.systemAccumulators[key] >= step && iterations < 2) {
    fn(step);
    runtime.systemAccumulators[key] -= step;
    iterations += 1;
  }
  if (runtime.systemAccumulators[key] > step * 2) {
    runtime.systemAccumulators[key] = step;
  }
}

// --- Signal System ---
// Signal is the core risk/reward meter. It rises from valuable actions (thrust,
// loot, combat) and decays when quiet. Higher signal attracts fauna, escalates
// scavenger behavior, and accumulates Inhibitor pressure.
// Design: signal taxes ambition, never buys capability. See SIGNAL-DESIGN.md.
// Signal is a 0-1 float per player. Rises from activity, decays when quiet.
// Zone crossings publish events for client audio/visual feedback.

function signalZoneForLevel(level) {
  const cfg = SIGNAL_CONFIG;
  if (level <= cfg.ghostMax) return "ghost";
  if (level <= cfg.whisperMax) return "whisper";
  if (level <= cfg.presenceMax) return "presence";
  if (level <= cfg.beaconMax) return "beacon";
  if (level <= cfg.flareMax) return "flare";
  return "threshold";
}

function tickPlayerSignal(player, dt) {
  const cfg = SIGNAL_CONFIG;
  const sig = player.signal;
  const input = player.lastInput;
  const speed = Math.sqrt(player.vx * player.vx + player.vy * player.vy);
  const deliveredThrust = Math.max(0, Math.min(1, Number(player.lastDeliveredThrustIntensity) || 0));
  const isThrusting = deliveredThrust > 0.1;

  // --- Generation ---
  let generation = 0;

  if (isThrusting) {
    // Thrust signal: base rate scaled by flow opposition.
    // Fighting the current is loud; surfing with it is quiet.
    const flow = estimateFlow(player.wx, player.wy);
    const flowMag = Math.hypot(flow.x, flow.y);
    let oppositionMult = 1.0;
    const inputMag = Math.hypot(input.moveX, input.moveY);
    if (flowMag > 0.001 && inputMag > 0.001) {
      const thrustDirX = input.moveX / inputMag;
      const thrustDirY = input.moveY / inputMag;
      const alignment = (flow.x * thrustDirX + flow.y * thrustDirY) / flowMag;
      // alignment: -1 (fighting) to +1 (surfing). Scale opposition: 1.0 (surfing) to 3.0 (fighting)
      oppositionMult = 1.0 + Math.max(0, -alignment) * (cfg.thrustOppositionMult - 1.0);
    }
    generation += cfg.thrustBaseRate * oppositionMult * deliveredThrust;
  } else if (speed > 0.001) {
    // Coasting — minimal signal
    generation += cfg.coastRate;
  }

  // Well proximity — near wells is noisy
  for (const well of runtime.mapState.wells) {
    const dist = worldDistance(player.wx, player.wy, well.wx, well.wy, runtime.session.worldScale);
    if (dist < cfg.wellProximityDist) {
      generation += cfg.wellProximityRate;
      break; // only count once
    }
  }

  // Echo wreck proximity — the dead of past cycles leak signal within
  // the player's sensor range. Scales with the pilot's sensor multiplier
  // so Shroud hulls and sensor-upgraded pilots hear the dead from further
  // away. Multiple echoes stack. See docs/design/ECHOES-V1.md §Signal.
  const ECHO_SIGNAL_LEAK = 0.02;         // per second per nearby echo
  const ECHO_SENSOR_RANGE_BASE = 0.30;   // baseline sensor reach in world units
  const sensorMult = player.brain?.sensorRange || 1.0;
  const echoRange = ECHO_SENSOR_RANGE_BASE * sensorMult;
  if (runtime.mapState.wrecks) {
    for (const wreck of runtime.mapState.wrecks) {
      if (!wreck.isEcho || wreck.looted) continue;
      const dist = worldDistance(player.wx, player.wy, wreck.wx, wreck.wy, runtime.session.worldScale);
      if (dist < echoRange) {
        generation += ECHO_SIGNAL_LEAK;
      }
    }
  }

  // --- Decay ---
  let decay = 0;
  if (!isThrusting) {
    decay = cfg.decayBase;

    // Enhanced decay in wreck wake zones
    for (const wreck of runtime.mapState.wrecks) {
      if (wreck.looted) continue;
      const dist = worldDistance(player.wx, player.wy, wreck.wx, wreck.wy, runtime.session.worldScale);
      if (dist < 0.15) {
        decay = cfg.decayWreckWake;
        break;
      }
    }

    // Enhanced decay in accretion shadows
    for (const well of runtime.mapState.wells) {
      const dist = worldDistance(player.wx, player.wy, well.wx, well.wy, runtime.session.worldScale);
      if (dist < 0.25) {
        decay = Math.max(decay, cfg.decayAccretionShadow);
        break;
      }
    }
  }

  // --- Apply (hull coefficients + ability modifiers scale generation and decay) ---
  const pb = player.brain || BRAIN_DEFAULTS;
  const flowLockMult = getFlowLockSignalMult(player);
  const burnSignalMult = getBurnModifiers(player).signal;
  sig.level = Math.max(0, Math.min(1, sig.level + (generation * pb.signalGenMult * flowLockMult * burnSignalMult - decay * pb.signalDecayMult) * dt));

  // Track peak signal for run results
  if (sig.level > (player._signalPeak || 0)) {
    player._signalPeak = sig.level;
    player._signalPeakZone = sig.zone;
  }

  // --- Zone crossing ---
  const newZone = signalZoneForLevel(sig.level);
  if (newZone !== sig.zone) {
    sig.prevZone = sig.zone;
    sig.zone = newZone;
    publishEvent("signal.zoneCrossing", {
      clientId: player.clientId,
      from: sig.prevZone,
      to: sig.zone,
      level: sig.level,
    });
  }
}

function spikePlayerSignal(player, amount) {
  player.signal.level = Math.min(1, player.signal.level + amount);
  const newZone = signalZoneForLevel(player.signal.level);
  if (newZone !== player.signal.zone) {
    player.signal.prevZone = player.signal.zone;
    player.signal.zone = newZone;
    publishEvent("signal.zoneCrossing", {
      clientId: player.clientId,
      from: player.signal.prevZone,
      to: player.signal.zone,
      level: player.signal.level,
    });
  }
}

// --- AI Players (Adversarial Tier) ---
// Full player entities with decision system instead of network input.
// Same physics, inventory, signal as human players. Three decision timescales:
// - Tactical (0.8s): wreck/portal targeting, goal selection
// - Strategic (3.0s): extraction evaluation
// - Navigation (per-tick): thrust + steering from aiNavigateToward()
// Personalities are weight tables, not different code paths. See AI-PLAYERS.md.

function createAIPlayer(personalityKey, index, hullType = 'drifter') {
  const p = AI_PERSONALITIES[personalityKey];
  const name = p.names[index % p.names.length];
  const rng = runtime.session?.rng?.rawStream('aiInit') || Math.random;
  const lootTarget = p.lootTarget[0] + Math.floor(rng() * (p.lootTarget[1] - p.lootTarget[0] + 1));
  const player = createPlayer(`ai-${personalityKey}-${index}`, name, hullType);
  player.isAI = true;
  player.personality = personalityKey;
  player.personalityWeights = p;
  player.aiState = {
    goal: 'loot',
    targetWreckId: null,
    targetPortalId: null,
    decisionTimer: rng() * AI_PLAYER_CONFIG.decisionInterval,
    strategicTimer: rng() * AI_PLAYER_CONFIG.strategicInterval,
    lootTarget,
    lootCount: 0,
    facingAngle: rng() * Math.PI * 2,
    thrustIntensity: 0,
  };
  return player;
}

function spawnAIPlayers(mapState, session) {
  const personalityKeys = Object.keys(AI_PERSONALITIES);
  const count = 3;
  const rng = session?.rng?.rawStream('aiPick') || Math.random;

  let humanHull = null;
  for (const p of runtime.players.values()) {
    if (!p.isAI) { humanHull = p.hullType; break; }
  }

  const chosenPersonalities = [];
  const chosenHulls = [];

  for (let i = 0; i < count; i++) {
    let key;
    if (i < 2) {
      do { key = personalityKeys[Math.floor(rng() * personalityKeys.length)]; }
      while (chosenPersonalities.includes(key) && chosenPersonalities.length < personalityKeys.length);
    } else {
      key = personalityKeys[Math.floor(rng() * personalityKeys.length)];
    }
    chosenPersonalities.push(key);

    const allowedHulls = PERSONALITY_HULL_MAP[key] || ['drifter'];
    let hull = allowedHulls[Math.floor(rng() * allowedHulls.length)];
    if (hull === humanHull && allowedHulls.length > 1) {
      hull = allowedHulls.find(h => h !== humanHull) || hull;
    }
    if (chosenHulls.includes(hull)) {
      const alt = allowedHulls.find(h => !chosenHulls.includes(h) && h !== humanHull);
      if (alt) hull = alt;
    }
    chosenHulls.push(hull);

    const aiPlayer = createAIPlayer(key, i, hull);
    const pos = findSafeSpawn(mapState);
    aiPlayer.wx = pos.wx;
    aiPlayer.wy = pos.wy;
    runtime.players.set(aiPlayer.clientId, aiPlayer);
  }
}

function spawnClearance(entity, defaultMinDist) {
  if (entity.kind === "well") return Math.max(defaultMinDist, (entity.killRadius || 0.04) + 0.55);
  if (entity.kind === "star") return Math.max(defaultMinDist, 0.42 + (entity.mass || 1) * 0.06);
  if (entity.kind === "portal") return Math.max(0.28, defaultMinDist * 0.65);
  if (entity.kind === "planetoid") return Math.max(0.25, defaultMinDist * 0.55);
  return defaultMinDist;
}

function collectSpawnHazards(mapState, defaultMinDist) {
  return [
    ...(mapState.wells || []).map((well) => ({
      kind: "well",
      wx: well.wx,
      wy: well.wy,
      clearance: spawnClearance({ kind: "well", ...well }, defaultMinDist),
    })),
    ...(mapState.stars || []).filter((star) => star.alive !== false).map((star) => ({
      kind: "star",
      wx: star.wx,
      wy: star.wy,
      clearance: spawnClearance({ kind: "star", ...star }, defaultMinDist),
    })),
    ...(mapState.portals || []).filter(isPortalAvailable).map((portal) => ({
      kind: "portal",
      wx: portal.wx,
      wy: portal.wy,
      clearance: spawnClearance({ kind: "portal", ...portal }, defaultMinDist),
    })),
    ...(mapState.planetoids || []).filter((planetoid) => planetoid.alive !== false).map((planetoid) => ({
      kind: "planetoid",
      wx: planetoid.wx,
      wy: planetoid.wy,
      clearance: spawnClearance({ kind: "planetoid", ...planetoid }, defaultMinDist),
    })),
  ];
}

function scoreSpawnCandidate(wx, wy, hazards, worldScale) {
  if (hazards.length === 0) return Infinity;
  let score = Infinity;
  for (const hazard of hazards) {
    score = Math.min(score, worldDistance(wx, wy, hazard.wx, hazard.wy, worldScale) - hazard.clearance);
  }
  return score;
}

function findSafeSpawn(mapState) {
  const ws = mapState.worldScale;
  const minDist = Math.max(0.55, ws * 0.055);
  const hazards = collectSpawnHazards(mapState, minDist);
  const rng = runtime.session?.rng?.rawStream('safeSpawn') || Math.random;
  let best = { wx: ws / 2, wy: ws * 0.15, score: -Infinity };
  const consider = (wx, wy) => {
    const score = scoreSpawnCandidate(wx, wy, hazards, ws);
    if (score > best.score) best = { wx, wy, score };
    return score >= 0;
  };

  for (let attempt = 0; attempt < 90; attempt++) {
    const wx = rng() * ws;
    const wy = rng() * ws;
    if (consider(wx, wy)) return { wx, wy };
  }

  const steps = Math.max(5, Math.ceil(ws * 2));
  for (let ix = 0; ix < steps; ix++) {
    for (let iy = 0; iy < steps; iy++) {
      const wx = ((ix + 0.5) / steps) * ws;
      const wy = ((iy + 0.5) / steps) * ws;
      if (consider(wx, wy)) return { wx, wy };
    }
  }

  return { wx: best.wx, wy: best.wy };
}

// Analytical FlowSample estimate from well positions (no GPU needed).
function estimateFlowSample(wx, wy) {
  if (runtime.session.useCoarseField && runtime.coarseField) {
    const sample = sampleCoarseFlowField(runtime.coarseField, wx, wy);
    return normalizeFlowSample(sample);
  }
  const ws = runtime.session.worldScale;
  let fx = 0, fy = 0;
  let surf = 0;
  let sourceWellId = null;
  let bestCurrent = 0;
  for (const well of runtime.mapState.wells) {
    const dx = worldDisplacement(wx, well.wx, ws);
    const dy = worldDisplacement(wy, well.wy, ws);
    const dist = Math.hypot(dx, dy);
    if (dist < 0.01) continue;
    const dir = well.orbitalDir || 1;
    const currentAccel = orbitalCurrentSpeed(
      dist,
      SERVER_WELLS.currentStrength,
      well.mass || 1,
      SERVER_WELLS.currentFalloff,
      SERVER_WELLS.currentRange
    );
    if (currentAccel > 0) {
      fx += (-dy / dist) * dir * currentAccel;
      fy += (dx / dist) * dir * currentAccel;
      surf = Math.max(surf, Math.max(0, Math.min(1, currentAccel / 2.5)));
      if (Math.abs(currentAccel) > bestCurrent) {
        bestCurrent = Math.abs(currentAccel);
        sourceWellId = well.id ?? well.name ?? null;
      }
    }
  }
  return normalizeFlowSample({
    current: { x: fx, y: fy },
    surf,
    sources: { wellId: sourceWellId, ringId: null, anchorId: null },
    confidence: 1,
  });
}

function estimateFlow(wx, wy) {
  const sample = estimateFlowSample(wx, wy);
  return { x: sample.current.x, y: sample.current.y };
}

function ensurePlayerSlingshot(player) {
  if (player.slingshot) return player.slingshot;
  player.slingshot = {
    engaged: false,
    anchorId: null,
    anchorType: null,
    anchorWX: null,
    anchorWY: null,
    anchorRange: 0,
    energy: 0,
    chainCount: 0,
    engageRadius: 0,
    orbitDir: 0,
    inputWasDown: false,
    lastReleaseTime: -Infinity,
    lastReleasedAnchorKey: null,
  };
  return player.slingshot;
}

function slingshotAnchorKey(anchor) {
  return anchor ? `${anchor.type}:${anchor.id ?? anchor.index ?? "unknown"}` : null;
}

function collectSlingshotAnchors() {
  const anchors = [];
  runtime.mapState.wells.forEach((well, index) => {
    anchors.push({
      type: "well",
      id: well.id ?? well.name ?? `well-${index}`,
      index,
      wx: well.wx,
      wy: well.wy,
      massWeight: SLINGSHOT_SERVER.massWeight.well * (well.mass || 1),
      pullMass: well.mass || 1,
      pullStrength: SERVER_WELLS.shipPullStrength,
      pullFalloff: SERVER_WELLS.shipPullFalloff,
      pullRange: SERVER_WELLS.maxRange,
      range: SLINGSHOT_SERVER.range.well,
    });
  });
  runtime.mapState.stars.forEach((star, index) => {
    if (star.alive === false) return;
    anchors.push({
      type: "star",
      id: star.id ?? `star-${index}`,
      index,
      wx: star.wx,
      wy: star.wy,
      massWeight: SLINGSHOT_SERVER.massWeight.star * (star.mass || 1),
      pullMass: star.mass || 1,
      pullStrength: STAR_SERVER.shipPushStrength,
      pullFalloff: STAR_SERVER.shipPushFalloff,
      pullRange: STAR_SERVER.maxRange,
      range: SLINGSHOT_SERVER.range.star,
    });
  });
  runtime.mapState.planetoids.forEach((planetoid, index) => {
    if (planetoid.alive === false) return;
    anchors.push({
      type: "planetoid",
      id: planetoid.id ?? `planetoid-${index}`,
      index,
      wx: planetoid.wx,
      wy: planetoid.wy,
      massWeight: SLINGSHOT_SERVER.massWeight.planetoid,
      pullMass: 1,
      pullStrength: PLANETOID_SERVER.shipPushStrength,
      pullFalloff: 1,
      pullRange: PLANETOID_SERVER.shipPushRadius,
      range: SLINGSHOT_SERVER.range.planetoid,
    });
  });
  return anchors;
}

function findSlingshotAnchorByState(state) {
  const key = state?.anchorId && state?.anchorType
    ? `${state.anchorType}:${state.anchorId}`
    : null;
  if (!key) return null;
  return collectSlingshotAnchors().find((anchor) => slingshotAnchorKey(anchor) === key) || null;
}

function slingshotTangentialSpeed(player, anchor) {
  const dx = worldDisplacement(player.wx, anchor.wx, runtime.session.worldScale);
  const dy = worldDisplacement(player.wy, anchor.wy, runtime.session.worldScale);
  const dist = Math.hypot(dx, dy) || 1e-4;
  const tx = -(dy / dist);
  const ty = dx / dist;
  return Math.abs(player.vx * tx + player.vy * ty);
}

function slingshotOrbitDirection(player, anchor) {
  const dx = worldDisplacement(player.wx, anchor.wx, runtime.session.worldScale);
  const dy = worldDisplacement(player.wy, anchor.wy, runtime.session.worldScale);
  const dist = Math.hypot(dx, dy) || 1e-4;
  const tx = -(dy / dist);
  const ty = dx / dist;
  return (player.vx * tx + player.vy * ty) >= 0 ? 1 : -1;
}

function findSlingshotAffordance(player) {
  let best = null;
  let bestDist = Infinity;
  for (const anchor of collectSlingshotAnchors()) {
    const dist = worldDistance(player.wx, player.wy, anchor.wx, anchor.wy, runtime.session.worldScale);
    if (dist <= anchor.range && slingshotTangentialSpeed(player, anchor) < SLINGSHOT_SERVER.minTangentialSpeed) {
      continue;
    }
    if (dist <= anchor.range && dist < bestDist) {
      best = { anchor, distance: dist };
      bestDist = dist;
    }
  }
  return best;
}

function slingshotHullMods(player) {
  const hull = HULL_DEFINITIONS[player.hullType] || HULL_DEFINITIONS.drifter || {};
  return {
    energyMult: hull.slingshotEnergyMult ?? 1,
    chainWindowMult: hull.slingshotChainWindowMult ?? 1,
  };
}

function engagePlayerSlingshot(player, currentTime) {
  const state = ensurePlayerSlingshot(player);
  if (state.engaged) return false;
  const affordance = findSlingshotAffordance(player);
  const anchor = affordance?.anchor;
  if (!anchor) return false;
  const tanSpeed = slingshotTangentialSpeed(player, anchor);
  if (tanSpeed < SLINGSHOT_SERVER.minTangentialSpeed) return false;

  const mods = slingshotHullMods(player);
  const sinceRelease = currentTime - (state.lastReleaseTime ?? -Infinity);
  const chainWindow = SLINGSHOT_SERVER.chainWindowSeconds * mods.chainWindowMult;
  const anchorKey = slingshotAnchorKey(anchor);
  const chained = sinceRelease <= chainWindow && state.lastReleasedAnchorKey && state.lastReleasedAnchorKey !== anchorKey;
  const chainCount = chained
    ? Math.min((state.chainCount || 1) + 1, SLINGSHOT_SERVER.maxChainCount)
    : 1;

  const dx = worldDisplacement(player.wx, anchor.wx, runtime.session.worldScale);
  const dy = worldDisplacement(player.wy, anchor.wy, runtime.session.worldScale);
  const dist = Math.hypot(dx, dy) || 1e-4;
  const radialNX = dx / dist;
  const radialNY = dy / dist;
  const orbitDir = slingshotOrbitDirection(player, anchor);
  const tangentNX = -radialNY * orbitDir;
  const tangentNY = radialNX * orbitDir;
  const speed = Math.hypot(player.vx, player.vy);

  state.engaged = true;
  state.anchorId = anchor.id;
  state.anchorType = anchor.type;
  state.anchorWX = anchor.wx;
  state.anchorWY = anchor.wy;
  state.anchorRange = anchor.range;
  state.energy = 0;
  state.chainCount = chainCount;
  state.engageRadius = affordance.distance;
  state.orbitDir = orbitDir;
  player.vx = tangentNX * speed;
  player.vy = tangentNY * speed;

  publishEvent("player.slingshotEngaged", {
    clientId: player.clientId,
    anchorId: anchor.id,
    anchorType: anchor.type,
    chainCount,
  });
  return true;
}

function slingshotReleaseDirection(player, input = player.lastInput) {
  const mag = Math.hypot(input?.moveX || 0, input?.moveY || 0);
  if (mag > 0.01) return { x: input.moveX / mag, y: input.moveY / mag };
  const speed = Math.hypot(player.vx, player.vy);
  if (speed > 0.01) return { x: player.vx / speed, y: player.vy / speed };
  return { x: 1, y: 0 };
}

function releasePlayerSlingshot(player, currentTime, input = player.lastInput, { applyBoost = true, reason = "release" } = {}) {
  const state = ensurePlayerSlingshot(player);
  if (!state.engaged) return null;
  const mods = slingshotHullMods(player);
  const baseEnergy = state.energy || 0;
  const chainMult = Math.pow(SLINGSHOT_SERVER.chainMultiplier, Math.max(0, (state.chainCount || 1) - 1));
  const totalEnergy = baseEnergy * chainMult * SLINGSHOT_SERVER.releaseMultiplier * mods.energyMult;
  const dir = slingshotReleaseDirection(player, input);
  if (applyBoost) {
    player.vx += dir.x * totalEnergy;
    player.vy += dir.y * totalEnergy;
  }
  const previousAnchorId = state.anchorId;
  const previousAnchorType = state.anchorType;
  state.lastReleaseTime = currentTime;
  state.lastReleasedAnchorKey = `${previousAnchorType}:${previousAnchorId}`;
  state.engaged = false;
  state.anchorId = null;
  state.anchorType = null;
  state.anchorWX = null;
  state.anchorWY = null;
  state.anchorRange = 0;
  state.energy = 0;
  state.engageRadius = 0;
  state.orbitDir = 0;

  publishEvent("player.slingshotReleased", {
    clientId: player.clientId,
    anchorId: previousAnchorId,
    anchorType: previousAnchorType,
    reason,
    energyBanked: baseEnergy,
    totalEnergyAwarded: applyBoost ? totalEnergy : 0,
    chainCount: state.chainCount || 1,
  });
  return { totalEnergy, baseEnergy, chainCount: state.chainCount || 1 };
}

function rememberConsumedSlingshotEdge(state, edgeId) {
  if (!Number.isFinite(Number(edgeId)) || Number(edgeId) <= 0) return;
  const id = Math.trunc(Number(edgeId));
  if (!Array.isArray(state.consumedEdgeIds)) state.consumedEdgeIds = [];
  state.consumedEdgeIds.push(id);
  if (state.consumedEdgeIds.length > 64) {
    state.consumedEdgeIds.splice(0, state.consumedEdgeIds.length - 64);
  }
}

function hasSeenSlingshotEdge(player, edgeId) {
  const state = ensurePlayerSlingshot(player);
  if (!Number.isFinite(Number(edgeId)) || Number(edgeId) <= 0) return true;
  const id = Math.trunc(Number(edgeId));
  const pending = Array.isArray(player.lastInput?.slingshotEdges) ? player.lastInput.slingshotEdges : [];
  return pending.includes(id) || (Array.isArray(state.consumedEdgeIds) && state.consumedEdgeIds.includes(id));
}

function mergePendingSlingshotEdges(player, incomingEdges) {
  const pending = Array.isArray(player.lastInput?.slingshotEdges)
    ? player.lastInput.slingshotEdges.slice(0, 8)
    : [];
  for (const rawId of incomingEdges || []) {
    const id = Math.trunc(Number(rawId));
    if (id <= 0 || pending.includes(id) || hasSeenSlingshotEdge(player, id)) continue;
    pending.push(id);
    if (pending.length >= 8) break;
  }
  return pending;
}

function applyPlayerSlingshotForces(player, dt, input) {
  const state = ensurePlayerSlingshot(player);
  const anchor = findSlingshotAnchorByState(state);
  if (!anchor) {
    releasePlayerSlingshot(player, runtime.simTime, input, { applyBoost: false, reason: "anchor-lost" });
    return;
  }

  state.anchorWX = anchor.wx;
  state.anchorWY = anchor.wy;
  state.anchorRange = anchor.range;
  const dx = worldDisplacement(player.wx, anchor.wx, runtime.session.worldScale);
  const dy = worldDisplacement(player.wy, anchor.wy, runtime.session.worldScale);
  const dist = Math.hypot(dx, dy) || 1e-4;
  if (dist > anchor.range * 1.1) {
    releasePlayerSlingshot(player, runtime.simTime, input, { reason: "range-break" });
    return;
  }

  const radialNX = dx / dist;
  const radialNY = dy / dist;
  const orbitDir = state.orbitDir || 1;
  const tangentNX = -radialNY * orbitDir;
  const tangentNY = radialNX * orbitDir;
  const tanSpeed = player.vx * tangentNX + player.vy * tangentNY;
  const proximity = Math.max(0, 1 - dist / Math.max(anchor.range, 1e-4));
  state.energy += SLINGSHOT_SERVER.energyAccrualRate
    * Math.max(0, tanSpeed)
    * anchor.massWeight
    * proximity
    * dt;

  // This uses the same inverse-power profile as normal ship gravity, so
  // slingshot hold no longer cancels an imaginary stronger/weaker pull.
  const radialPull = inversePowerForce(
    dist,
    anchor.pullStrength,
    anchor.pullMass,
    anchor.pullFalloff,
    anchor.pullRange
  );
  const cancelMag = radialPull * SLINGSHOT_SERVER.gravityCancelFraction;
  player.vx += (-radialNX * cancelMag + tangentNX * SLINGSHOT_SERVER.tangentialForce) * dt;
  player.vy += (-radialNY * cancelMag + tangentNY * SLINGSHOT_SERVER.tangentialForce) * dt;
}

function tickPlayerSlingshot(player, dt, input) {
  const state = ensurePlayerSlingshot(player);
  const pendingEdges = Array.isArray(input?.slingshotEdges) ? input.slingshotEdges : [];
  const edgeId = pendingEdges.shift();
  if (edgeId !== undefined) {
    if (state.engaged) releasePlayerSlingshot(player, runtime.simTime, input);
    else engagePlayerSlingshot(player, runtime.simTime);
    rememberConsumedSlingshotEdge(state, edgeId);
    state.inputWasDown = Boolean(input?.slingshot);
    if (state.engaged) applyPlayerSlingshotForces(player, dt, input);
    return;
  }
  const down = Boolean(input?.slingshot);
  if (down && !state.inputWasDown) {
    if (state.engaged) releasePlayerSlingshot(player, runtime.simTime, input);
    else engagePlayerSlingshot(player, runtime.simTime);
  }
  state.inputWasDown = down;
  if (state.engaged) applyPlayerSlingshotForces(player, dt, input);
}

function rebuildAuthoritativeField() {
  if (!runtime.session.useCoarseField) {
    runtime.coarseField = null;
    return;
  }
  runtime.coarseField = buildCoarseFlowField({
    worldScale: runtime.session.worldScale,
    cellSize: runtime.session.flowFieldCellSize,
    wells: runtime.mapState.wells,
    waveRings: runtime.waveRings,
    wellGravityScale: SERVER_WELLS.shipPullStrength,
    wellGravityFalloff: SERVER_WELLS.shipPullFalloff,
    wellGravityMaxRange: SERVER_WELLS.maxRange,
    wellCurrentScale: SERVER_WELLS.currentStrength,
    wellCurrentFalloff: SERVER_WELLS.currentFalloff,
    wellCurrentMaxRange: SERVER_WELLS.currentRange,
    waveShipPush: WAVE_SERVER.waveShipPush * runtime.session.fieldFlowScale,
    waveWidth: WAVE_SERVER.waveWidth,
  });
}

// Sample flow along the path from (ax,ay) to (bx,by) at N points.
// N is personality.flowSamples — Ghost samples 8 (careful), Raider samples 3 (reckless).
// Returns average alignment of flow with travel direction. [-1, +1]
function estimatePathAlignment(ax, ay, bx, by, samples) {
  const ws = runtime.session.worldScale;
  const dx = worldDisplacement(ax, bx, ws);
  const dy = worldDisplacement(ay, by, ws);
  const pathDist = Math.hypot(dx, dy);
  if (pathDist < 0.01 || samples < 1) return 0;
  const dirX = dx / pathDist, dirY = dy / pathDist;
  let totalAlign = 0;
  for (let i = 0; i < samples; i++) {
    const t = (i + 0.5) / samples;
    const sx = ((ax + dx * t) % ws + ws) % ws;
    const sy = ((ay + dy * t) % ws + ws) % ws;
    const flow = estimateFlow(sx, sy);
    const flowMag = Math.hypot(flow.x, flow.y);
    if (flowMag > 0.001) {
      totalAlign += (flow.x * dirX + flow.y * dirY) / flowMag;
    }
  }
  return totalAlign / samples;
}

function aiScoreWreck(ai, wreck) {
  const ws = runtime.session.worldScale;
  const w = ai.personalityWeights;
  const dist = worldDistance(ai.wx, ai.wy, wreck.wx, wreck.wy, ws);
  if (dist > AI_PLAYER_CONFIG.sensorRange) return -Infinity;
  if (wreck.looted || wreck.alive === false) return -Infinity;

  // Estimate value with noise
  const itemCount = wreck.loot ? wreck.loot.length : 1;
  const tierMult = (wreck.tier || 1);
  const rawValue = itemCount * tierMult * 50;
  const noise = 1.0 + ((runtime.session?.rng?.rawStream('aiPerception') || Math.random)() - 0.5) * AI_PLAYER_CONFIG.perceptionNoise * 2;
  let score = rawValue * noise;

  // Distance penalty
  score -= dist * w.distancePenalty;

  // Well danger
  let wellDanger = 0;
  for (const well of runtime.mapState.wells) {
    const wd = worldDistance(wreck.wx, wreck.wy, well.wx, well.wy, ws);
    if (wd < 0.25) wellDanger = Math.max(wellDanger, 1 - wd / 0.25);
  }
  score -= wellDanger * w.dangerPenalty;

  // Current alignment bonus — sample flow along path using personality.flowSamples
  const samples = ai.personalityWeights.flowSamples || 4;
  const alignment = estimatePathAlignment(ai.wx, ai.wy, wreck.wx, wreck.wy, samples);
  score += alignment * w.currentBonus;

  // Competition — nearest other player to this wreck
  let nearestCompetitor = Infinity;
  for (const other of runtime.players.values()) {
    if (other.clientId === ai.clientId || other.status !== "alive") continue;
    const cd = worldDistance(other.wx, other.wy, wreck.wx, wreck.wy, ws);
    if (cd < nearestCompetitor) nearestCompetitor = cd;
  }
  if (nearestCompetitor < AI_PLAYER_CONFIG.sensorRange) {
    // Closer competitor = higher penalty. Vultures have negative penalty (bonus).
    const competitionFactor = 1 - nearestCompetitor / AI_PLAYER_CONFIG.sensorRange;
    score -= competitionFactor * w.competitionPenalty;
  }

  // Threat — sentries and inhibitor near wreck
  let threat = 0;
  for (const sentry of runtime.mapState.sentries) {
    if (!sentry.alive) continue;
    const sd = worldDistance(wreck.wx, wreck.wy, sentry.wx, sentry.wy, ws);
    if (sd < 0.15) threat = Math.max(threat, 1 - sd / 0.15);
  }
  if (runtime.inhibitor.form >= 2) {
    const inhD = worldDistance(wreck.wx, wreck.wy, runtime.inhibitor.wx, runtime.inhibitor.wy, ws);
    if (inhD < 0.4) threat = Math.max(threat, 1 - inhD / 0.4);
  }
  score -= threat * w.dangerPenalty * 0.5;

  return score;
}

function aiScorePortal(ai, portal) {
  const ws = runtime.session.worldScale;
  const w = ai.personalityWeights;
  if (!isPortalAvailable(portal)) return -Infinity;

  const dist = worldDistance(ai.wx, ai.wy, portal.wx, portal.wy, ws);
  const timeLeft = portal.lifespan - (runtime.simTime - portal.spawnTime);
  if (timeLeft < 3) return -Infinity;

  let score = 100;
  // Can I reach it?
  const estTravelTime = dist / 0.15; // rough speed estimate
  if (estTravelTime > timeLeft - 3) score -= 200;

  score -= dist * 20;
  if (portal.type === 'rift') score += 20;
  if (portal.type === 'unstable') score -= 15;

  // Cargo value amplifies extraction urgency
  const cargoValue = ai.cargo.reduce((s, item) => s + (item ? (item.value || 0) : 0), 0);
  score += cargoValue * w.extractionGreed;

  // Competition — how many others are heading this way?
  let competitorCount = 0;
  for (const other of runtime.players.values()) {
    if (other.clientId === ai.clientId || other.status !== "alive") continue;
    const cd = worldDistance(other.wx, other.wy, portal.wx, portal.wy, ws);
    if (cd < dist * 1.2) competitorCount++; // closer than us = competition
  }
  score -= competitorCount * w.competitionPenalty;

  // Inhibitor blocking — Vessel near portal makes it unreachable
  if (runtime.inhibitor.form >= 3) {
    const inhD = worldDistance(portal.wx, portal.wy, runtime.inhibitor.wx, runtime.inhibitor.wy, ws);
    if (inhD < INHIBITOR_CONFIG.vesselPortalBlockRange) return -Infinity;
  }

  return score;
}

function aiShouldExtract(ai) {
  const w = ai.personalityWeights;
  const cargoValue = ai.cargo.reduce((s, item) => s + (item ? (item.value || 0) : 0), 0);
  const cargoCount = ai.cargo.filter(Boolean).length;
  const portalsAlive = runtime.mapState.portals.filter(isPortalAvailable).length;
  const inhForm = runtime.inhibitor.form;

  // Hard triggers
  if (inhForm >= 3) return true;
  if (portalsAlive <= 1) return true;
  if (runtime.simTime > RUN_DURATION - 30) return true;

  // Soft triggers
  if (cargoValue >= w.minCargoValue) return true;
  if (cargoCount >= ai.aiState.lootTarget) return true;
  if (portalsAlive <= w.panicPortalCount) return true;
  if (inhForm >= 2 && cargoCount >= 3) return true;

  return false;
}

function aiTacticalDecision(ai) {
  const ws = runtime.session.worldScale;
  const w = ai.personalityWeights;

  // Should I extract?
  if (aiShouldExtract(ai)) {
    ai.aiState.goal = 'extract';
    // Find best portal
    let bestScore = -Infinity, bestId = null;
    for (const portal of runtime.mapState.portals) {
      const score = aiScorePortal(ai, portal);
      if (score > bestScore) { bestScore = score; bestId = portal.id; }
    }
    ai.aiState.targetPortalId = bestId;
    ai.aiState.targetWreckId = null;
    return;
  }

  // Evade inhibitor if nearby
  if (runtime.inhibitor.form >= 2) {
    const inhDist = worldDistance(ai.wx, ai.wy, runtime.inhibitor.wx, runtime.inhibitor.wy, ws);
    if (inhDist < 0.4) {
      ai.aiState.goal = 'evade';
      ai.aiState.targetWreckId = null;
      ai.aiState.targetPortalId = null;
      return;
    }
  }

  // Find best wreck
  ai.aiState.goal = 'loot';
  let bestScore = -Infinity, bestId = null;
  for (const wreck of runtime.mapState.wrecks) {
    const score = aiScoreWreck(ai, wreck);
    if (score > bestScore) { bestScore = score; bestId = wreck.id; }
  }

  if (bestScore < w.minimumWreckScore) {
    // Nothing worth looting — extract with what we have
    ai.aiState.goal = 'extract';
    let bestPortalScore = -Infinity, bestPortalId = null;
    for (const portal of runtime.mapState.portals) {
      const score = aiScorePortal(ai, portal);
      if (score > bestPortalScore) { bestPortalScore = score; bestPortalId = portal.id; }
    }
    ai.aiState.targetPortalId = bestPortalId;
    ai.aiState.targetWreckId = null;
  } else {
    ai.aiState.targetWreckId = bestId;
    ai.aiState.targetPortalId = null;
  }
}

function aiNavigateToward(ai, targetWX, targetWY, dt) {
  const ws = runtime.session.worldScale;
  const w = ai.personalityWeights;
  const dx = worldDisplacement(ai.wx, targetWX, ws);
  const dy = worldDisplacement(ai.wy, targetWY, ws);
  const dist = Math.hypot(dx, dy);
  if (dist < 0.005) { ai.aiState.thrustIntensity = 0; return; }

  // Check flow alignment along path — personality.flowSamples controls quality
  const samples = w.flowSamples || 4;
  const alignment = estimatePathAlignment(ai.wx, ai.wy, targetWX, targetWY, samples);

  // Set thrust based on current alignment (signal management)
  if (alignment > 0.5) {
    ai.aiState.thrustIntensity = w.coastThrust;
  } else if (alignment > 0.0) {
    ai.aiState.thrustIntensity = w.cruiseThrust;
  } else {
    ai.aiState.thrustIntensity = w.maxThrust;
  }

  // Steer: bias toward current if opposing. Sample local flow for lateral check.
  let steerX = dx / dist, steerY = dy / dist;
  const localFlow = estimateFlow(ai.wx, ai.wy);
  const localFlowMag = Math.hypot(localFlow.x, localFlow.y);
  if (alignment < -0.2 && localFlowMag > 0.005) {
    // Try lateral offset to find better current
    const perpX = -dy / dist, perpY = dx / dist;
    const leftFlow = estimateFlow(
      ((ai.wx + perpX * 0.1) % ws + ws) % ws,
      ((ai.wy + perpY * 0.1) % ws + ws) % ws
    );
    const rightFlow = estimateFlow(
      ((ai.wx - perpX * 0.1) % ws + ws) % ws,
      ((ai.wy - perpY * 0.1) % ws + ws) % ws
    );
    const leftAlign = (leftFlow.x * dx + leftFlow.y * dy) / (Math.hypot(leftFlow.x, leftFlow.y) * dist + 0.001);
    const rightAlign = (rightFlow.x * dx + rightFlow.y * dy) / (Math.hypot(rightFlow.x, rightFlow.y) * dist + 0.001);
    if (leftAlign > alignment && leftAlign > rightAlign) {
      steerX = perpX; steerY = perpY;
    } else if (rightAlign > alignment) {
      steerX = -perpX; steerY = -perpY;
    }
  }

  ai.aiState.facingAngle = Math.atan2(steerY, steerX);
}

function tickAIPlayers(dt) {
  const ws = runtime.session.worldScale;

  for (const player of runtime.players.values()) {
    if (!player.isAI || player.status !== "alive") continue;
    const ai = player.aiState;
    const w = player.personalityWeights;

    // Tactical decision timer
    ai.decisionTimer -= dt;
    if (ai.decisionTimer <= 0) {
      ai.decisionTimer = AI_PLAYER_CONFIG.decisionInterval;
      aiTacticalDecision(player);
    }

    // Navigate toward current target
    let targetWX = null, targetWY = null;

    if (ai.goal === 'loot' && ai.targetWreckId) {
      const wreck = runtime.mapState.wrecks.find(w => w.id === ai.targetWreckId);
      if (wreck && !wreck.looted && wreck.alive !== false) {
        targetWX = wreck.wx; targetWY = wreck.wy;
      } else {
        ai.decisionTimer = 0; // re-decide next tick
      }
    } else if (ai.goal === 'extract' && ai.targetPortalId) {
      const portal = runtime.mapState.portals.find(p => p.id === ai.targetPortalId);
      if (isPortalAvailable(portal)) {
        targetWX = portal.wx; targetWY = portal.wy;
      } else {
        ai.decisionTimer = 0;
      }
    } else if (ai.goal === 'evade') {
      // Flee away from inhibitor
      const inhDX = worldDisplacement(runtime.inhibitor.wx, player.wx, ws);
      const inhDY = worldDisplacement(runtime.inhibitor.wy, player.wy, ws);
      const inhDist = Math.hypot(inhDX, inhDY);
      if (inhDist > 0.01) {
        targetWX = ((player.wx + (inhDX / inhDist) * 0.5) % ws + ws) % ws;
        targetWY = ((player.wy + (inhDY / inhDist) * 0.5) % ws + ws) % ws;
      }
      ai.thrustIntensity = w.maxThrust;
    }

    if (targetWX !== null) {
      aiNavigateToward(player, targetWX, targetWY, dt);
    } else {
      // Drift
      ai.thrustIntensity = 0.05;
      ai.facingAngle += ((runtime.session?.rng?.rawStream('aiDrift') || Math.random)() - 0.5) * 0.1 * dt;
    }

    // Set lastInput — main tick loop handles all physics (thrust, gravity, drag).
    // Do NOT apply velocity directly here or AI gets double-thrust.
    player.lastInput.moveX = Math.cos(ai.facingAngle);
    player.lastInput.moveY = Math.sin(ai.facingAngle);
    player.lastInput.thrust = ai.thrustIntensity;

    // Pickup: handled by tickPlayerPickups in main loop (uses same cargo system)
    // Track loot count
    ai.lootCount = player.cargo.filter(Boolean).length;

    // Extraction: handled by tickExtraction in main loop
  }
}

// --- Hull Ability Tick ---
// Per-hull abilities: passives check conditions, actives respond to input.
// Runs once per player per tick, before physics.

function tickHullAbilities(player, dt) {
  if (player.status !== "alive" || !player.abilityState) return;
  const as = player.abilityState;
  const ws = runtime.session.worldScale;
  const input = player.lastInput;
  const ability1Down = Boolean(input.ability1);
  const ability2Down = Boolean(input.ability2);
  const ability1Pressed = ability1Down && !as.ability1WasDown;
  const ability2Pressed = ability2Down && !as.ability2WasDown;

  if (as.hullType === 'drifter') {
    // Flow Lock: current-aligned for 3s → locked surfing state
    const flow = estimateFlow(player.wx, player.wy);
    const flowMag = Math.hypot(flow.x, flow.y);
    const speed = Math.hypot(player.vx, player.vy);
    let aligned = false;
    if (flowMag > 0.005 && speed > 0.01) {
      const alignment = (flow.x * player.vx + flow.y * player.vy) / (flowMag * speed);
      aligned = alignment > 0.6;
    }

    if (as.flowLockCooldown > 0) as.flowLockCooldown -= dt;

    if (aligned && !as.flowLockActive && as.flowLockCooldown <= 0) {
      as.flowLockAlignTimer += dt;
      if (as.flowLockAlignTimer >= HULL_DEFINITIONS.drifter.abilities.flowLock.alignTime) {
        as.flowLockActive = true;
        publishEvent("ability.activated", { clientId: player.clientId, ability: "flowLock" });
      }
    } else if (!aligned && as.flowLockActive) {
      as.flowLockActive = false;
      as.flowLockAlignTimer = 0;
      as.flowLockCooldown = HULL_DEFINITIONS.drifter.abilities.flowLock.cooldown;
      publishEvent("ability.deactivated", { clientId: player.clientId, ability: "flowLock" });
    } else if (!aligned) {
      as.flowLockAlignTimer = 0;
    }

    // Flow Lock effects: speed boost + signal suppression (applied in physics/signal ticks via brain override)
    if (as.flowLockActive) {
      const boost = HULL_DEFINITIONS.drifter.abilities.flowLock.speedBoost;
      if (flowMag > 0.005) {
        player.vx += (flow.x / flowMag) * boost * speed * dt;
        player.vy += (flow.y / flowMag) * boost * speed * dt;
      }
    }

    // Eddy Brake: active ability — input.ability1 triggers instant stop + turbulence
    if (as.eddyBrakeCooldown > 0) as.eddyBrakeCooldown -= dt;
    if (ability1Pressed && as.eddyBrakeCooldown <= 0 && speed > 0.02) {
      player.vx = 0;
      player.vy = 0;
      as.eddyBrakeCooldown = HULL_DEFINITIONS.drifter.abilities.eddyBrake.cooldown;
      // Turbulence zone: push nearby entities away
      for (const other of runtime.players.values()) {
        if (other.clientId === player.clientId || other.status !== "alive") continue;
        const pd = worldDistance(player.wx, player.wy, other.wx, other.wy, ws);
        if (pd < 0.15) {
          const dx = worldDisplacement(player.wx, other.wx, ws);
          const dy = worldDisplacement(player.wy, other.wy, ws);
          const d = Math.hypot(dx, dy);
          if (d > 0.001) {
            other.vx *= HULL_DEFINITIONS.drifter.abilities.eddyBrake.slowFactor;
            other.vy *= HULL_DEFINITIONS.drifter.abilities.eddyBrake.slowFactor;
          }
        }
      }
      publishEvent("ability.activated", { clientId: player.clientId, ability: "eddyBrake" });
    }

  } else if (as.hullType === 'breacher') {
    // Burn: toggle with ability1, drains fuel
    if (ability1Pressed && !as.burnActive && as.burnFuel > 1.0) {
      as.burnActive = true;
      publishEvent("ability.activated", { clientId: player.clientId, ability: "burn" });
    } else if (ability1Pressed && as.burnActive) {
      as.burnActive = false;
      publishEvent("ability.deactivated", { clientId: player.clientId, ability: "burn" });
    }

    if (as.burnActive) {
      as.burnFuel = Math.max(0, as.burnFuel - dt);
      if (as.burnFuel <= 0) {
        as.burnActive = false;
        publishEvent("ability.deactivated", { clientId: player.clientId, ability: "burn" });
      }
    } else {
      // Recharge fuel when not burning
      const cfg = HULL_DEFINITIONS.breacher.abilities.burn;
      as.burnFuel = Math.min(cfg.fuelMax, as.burnFuel + cfg.fuelRechargeRate * dt);
    }

    // Momentum Shield: passive — check speed threshold
    const speed = Math.hypot(player.vx, player.vy);
    const maxSpeed = 2.5 * (player.brain ? player.brain.thrustScale : 1.0) * 0.3;
    as.momentumShieldActive = speed > maxSpeed * HULL_DEFINITIONS.breacher.abilities.momentumShield.speedThreshold;

  } else if (as.hullType === 'resonant') {
    // Tick existing eddies
    const eddyCfg = HULL_DEFINITIONS.resonant.abilities.harmonicPulse;
    for (let i = as.eddies.length - 1; i >= 0; i--) {
      as.eddies[i].age += dt;
      if (as.eddies[i].age >= eddyCfg.eddyDuration) {
        as.eddies.splice(i, 1);
      }
    }

    // Resonance Tap: place anchor with ability1
    if (as.tapCooldown > 0) as.tapCooldown -= dt;
    if (ability1Pressed && as.tapCooldown <= 0) {
      as.tapAnchor = { wx: player.wx, wy: player.wy };
      as.tapCooldown = HULL_DEFINITIONS.resonant.abilities.resonanceTap.cooldown;
      publishEvent("ability.activated", { clientId: player.clientId, ability: "resonanceTap" });
    }

    // Frequency Shift: invert next pulse with ability2
    if (as.frequencyShiftCooldown > 0) as.frequencyShiftCooldown -= dt;
    if (ability2Pressed && as.frequencyShiftCooldown <= 0 && !as.nextPulseInverted) {
      as.nextPulseInverted = true;
      as.frequencyShiftCooldown = HULL_DEFINITIONS.resonant.abilities.frequencyShift.cooldown;
      publishEvent("ability.activated", { clientId: player.clientId, ability: "frequencyShift" });
    }

  } else if (as.hullType === 'shroud') {
    // Wake Cloak: ability1 drops signal by 1 zone
    if (as.wakeCloakCooldown > 0) as.wakeCloakCooldown -= dt;
    if (ability1Pressed && as.wakeCloakCooldown <= 0 && player.signal.zone !== 'threshold') {
      // Drop signal to the top of the zone below current
      const zones = ['ghost', 'whisper', 'presence', 'beacon', 'flare', 'threshold'];
      const zoneThresholds = [0, 0.15, 0.35, 0.55, 0.75, 0.90];
      const idx = zones.indexOf(player.signal.zone);
      if (idx > 0) {
        player.signal.level = Math.min(player.signal.level, zoneThresholds[idx] - 0.01);
        player.signal.zone = zones[idx - 1];
      }
      as.wakeCloakCooldown = HULL_DEFINITIONS.shroud.abilities.wakeCloak.cooldown;
      publishEvent("ability.activated", { clientId: player.clientId, ability: "wakeCloak" });
    }

    // Ghost Trail: passive — invisible below WHISPER
    as.ghostTrailActive = player.signal.zone === 'ghost' || player.signal.zone === 'whisper';

    // Decoy Flare: ability2 spawns decoy
    if (as.decoyCooldown > 0) as.decoyCooldown -= dt;
    if (ability2Pressed && as.decoyCharges > 0 && as.decoyCooldown <= 0) {
      as.decoyCharges--;
      as.decoyCooldown = HULL_DEFINITIONS.shroud.abilities.decoyFlare.cooldown;
      spikePlayerSignal(player, SIGNAL_CONFIG.flareLaunchSpike);
      as.decoys.push({
        wx: player.wx, wy: player.wy,
        signal: Math.min(1, player.signal.level + SIGNAL_CONFIG.flareSignalBonus), age: 0,
      });
      publishEvent("ability.activated", { clientId: player.clientId, ability: "decoyFlare" });
    }

    // Tick decoys
    for (let i = as.decoys.length - 1; i >= 0; i--) {
      as.decoys[i].age += dt;
      const flow = estimateFlowSample(as.decoys[i].wx, as.decoys[i].wy).current;
      as.decoys[i].wx = wrapWorldPosition(as.decoys[i].wx + flow.x * dt, ws);
      as.decoys[i].wy = wrapWorldPosition(as.decoys[i].wy + flow.y * dt, ws);
      as.decoys[i].signal *= (1 - HULL_DEFINITIONS.shroud.abilities.decoyFlare.decayRate * dt);
      if (as.decoys[i].age >= HULL_DEFINITIONS.shroud.abilities.decoyFlare.duration) {
        as.decoys.splice(i, 1);
      }
    }

  } else if (as.hullType === 'hauler') {
    // Salvage Lock: ability1 tags nearest wreck in sensor range
    if (ability1Pressed && as.salvageLockCharges > 0) {
      let nearestWreck = null, nearestDist = Infinity;
      const sensorRange = 0.5 * (player.brain ? player.brain.sensorRange : 1.0);
      for (const wreck of runtime.mapState.wrecks) {
        if (wreck.looted || wreck.alive === false) continue;
        if (as.taggedWrecks.includes(wreck.id)) continue;
        const d = worldDistance(player.wx, player.wy, wreck.wx, wreck.wy, ws);
        if (d < sensorRange && d < nearestDist) {
          nearestDist = d;
          nearestWreck = wreck;
        }
      }
      if (nearestWreck) {
        as.taggedWrecks.push(nearestWreck.id);
        as.salvageLockCharges--;
        publishEvent("ability.activated", {
          clientId: player.clientId, ability: "salvageLock", wreckId: nearestWreck.id,
        });
      }
    }

    // Tractor Field: ability2 channels pull on nearest entity
    if (as.tractorCooldown > 0) as.tractorCooldown -= dt;
    if (ability2Down && as.tractorCooldown <= 0) {
      const tractorCfg = HULL_DEFINITIONS.hauler.abilities.tractorField;
      // Find nearest wreck/star in range
      let target = null, targetDist = Infinity;
      for (const wreck of runtime.mapState.wrecks) {
        if (wreck.looted || wreck.alive === false) continue;
        const d = worldDistance(player.wx, player.wy, wreck.wx, wreck.wy, ws);
        if (d < tractorCfg.range && d < targetDist) {
          targetDist = d;
          target = wreck;
        }
      }
      if (target) {
        // Pull target toward player
        const dx = worldDisplacement(target.wx, player.wx, ws);
        const dy = worldDisplacement(target.wy, player.wy, ws);
        const d = Math.hypot(dx, dy);
        if (d > 0.01) {
          target.wx = ((target.wx + (dx / d) * tractorCfg.pullSpeed * dt) % ws + ws) % ws;
          target.wy = ((target.wy + (dy / d) * tractorCfg.pullSpeed * dt) % ws + ws) % ws;
        }
        as.tractorChannelTimer += dt;
        if (as.tractorChannelTimer >= tractorCfg.channelTime) {
          as.tractorCooldown = tractorCfg.cooldown;
          as.tractorChannelTimer = 0;
        }
      }
    } else {
      as.tractorChannelTimer = 0;
    }
  }
  as.ability1WasDown = ability1Down;
  as.ability2WasDown = ability2Down;
}

// Breacher Burn modifies thrust and signal in the per-player physics loop.
// This helper returns thrust and signal multipliers based on ability state.
function getBurnModifiers(player) {
  if (!player.abilityState || player.abilityState.hullType !== 'breacher') return { thrust: 1, signal: 1 };
  if (!player.abilityState.burnActive) return { thrust: 1, signal: 1 };
  const cfg = HULL_DEFINITIONS.breacher.abilities.burn;
  return { thrust: cfg.thrustMult, signal: cfg.signalMult };
}

// Drifter Flow Lock suppresses signal generation
function getFlowLockSignalMult(player) {
  if (!player.abilityState || player.abilityState.hullType !== 'drifter') return 1;
  if (!player.abilityState.flowLockActive) return 1;
  return HULL_DEFINITIONS.drifter.abilities.flowLock.signalMult;
}

// Breacher Momentum Shield reduces well pull at high speed
function getMomentumShieldMult(player) {
  if (!player.abilityState || player.abilityState.hullType !== 'breacher') return 1;
  if (!player.abilityState.momentumShieldActive) return 1;
  return 1 - HULL_DEFINITIONS.breacher.abilities.momentumShield.wellPullReduction;
}

// --- Gradient Sentries (Active Tier) ---
// Patrol well orbits at ringOuter × 1.2-1.8. Three states:
// patrol (orbit) → lunge (rush toward player) → recover (drift back to orbit).
// Contact pushes player TOWARD well + signal spike. Design: Rift Eels from
// FAUNA.md, promoted to active tier as Gradient Sentries in ENTITY-CATALOG.md.

function spawnSentries(mapState) {
  const cfg = SENTRY_CONFIG;
  const sentries = [];
  const rng = runtime.session?.rng?.rawStream('sentrySpawn') || Math.random;
  for (const well of mapState.wells) {
    const count = cfg.perWell[0] + Math.floor(rng() * (cfg.perWell[1] - cfg.perWell[0] + 1));
    const baseOrbit = (well.ringOuter || 0.1);
    for (let i = 0; i < count; i++) {
      const orbitRadius = baseOrbit * (cfg.orbitRadiusMult[0] + rng() * (cfg.orbitRadiusMult[1] - cfg.orbitRadiusMult[0]));
      const angle = (i / count) * Math.PI * 2 + rng() * 0.3;
      const speed = cfg.patrolSpeed[0] + rng() * (cfg.patrolSpeed[1] - cfg.patrolSpeed[0]);
      sentries.push({
        id: `sentry-${well.id}-${i}`,
        wellId: well.id,
        wx: ((well.wx + Math.cos(angle) * orbitRadius) % mapState.worldScale + mapState.worldScale) % mapState.worldScale,
        wy: ((well.wy + Math.sin(angle) * orbitRadius) % mapState.worldScale + mapState.worldScale) % mapState.worldScale,
        orbitRadius,
        orbitAngle: angle,
        orbitSpeed: speed,
        orbitDir: well.orbitalDir || 1,
        state: "patrol", // patrol | lunge | recover
        lungeTimer: 0,
        recoverTimer: 0,
        lungeTargetX: 0, lungeTargetY: 0,
        alive: true,
      });
    }
  }
  return sentries;
}

function tickSentries(dt) {
  const cfg = SENTRY_CONFIG;
  const ws = runtime.session.worldScale;

  for (const sentry of runtime.mapState.sentries) {
    if (!sentry.alive) continue;
    const well = runtime.mapState.wells.find(w => w.id === sentry.wellId);
    if (!well) continue;

    if (sentry.state === "patrol") {
      // Orbit the well
      sentry.orbitAngle += (sentry.orbitSpeed / Math.max(0.01, sentry.orbitRadius)) * sentry.orbitDir * dt;
      sentry.wx = ((well.wx + Math.cos(sentry.orbitAngle) * sentry.orbitRadius) % ws + ws) % ws;
      sentry.wy = ((well.wy + Math.sin(sentry.orbitAngle) * sentry.orbitRadius) % ws + ws) % ws;

      // Check for nearby players — lunge if within range
      for (const player of runtime.players.values()) {
        if (player.status !== "alive") continue;
        const pd = worldDistance(sentry.wx, sentry.wy, player.wx, player.wy, ws);
        if (pd < cfg.lungeRange) {
          sentry.state = "lunge";
          sentry.lungeTimer = cfg.lungeDuration;
          sentry.lungeTargetX = player.wx;
          sentry.lungeTargetY = player.wy;
          break;
        }
      }
    } else if (sentry.state === "lunge") {
      sentry.lungeTimer -= dt;
      // Rush toward lunge target
      const dx = worldDisplacement(sentry.wx, sentry.lungeTargetX, ws);
      const dy = worldDisplacement(sentry.wy, sentry.lungeTargetY, ws);
      const dist = Math.hypot(dx, dy);
      if (dist > 0.005) {
        sentry.wx = ((sentry.wx + (dx / dist) * cfg.lungeSpeed * dt) % ws + ws) % ws;
        sentry.wy = ((sentry.wy + (dy / dist) * cfg.lungeSpeed * dt) % ws + ws) % ws;
      }

      // Check contact with players — push toward well
      for (const player of runtime.players.values()) {
        if (player.status !== "alive") continue;
        const pd = worldDistance(sentry.wx, sentry.wy, player.wx, player.wy, ws);
        if (pd < 0.04) {
          // Push player toward the well
          const toWellX = worldDisplacement(player.wx, well.wx, ws);
          const toWellY = worldDisplacement(player.wy, well.wy, ws);
          const toWellDist = Math.hypot(toWellX, toWellY);
          if (toWellDist > 0.001) {
            player.vx += (toWellX / toWellDist) * cfg.bumpForce;
            player.vy += (toWellY / toWellDist) * cfg.bumpForce;
          }
          spikePlayerSignal(player, cfg.bumpSignal);
          sentry.state = "recover";
          sentry.recoverTimer = cfg.lungeRecovery;
          break;
        }
      }

      if (sentry.lungeTimer <= 0) {
        sentry.state = "recover";
        sentry.recoverTimer = cfg.lungeRecovery;
      }
    } else if (sentry.state === "recover") {
      sentry.recoverTimer -= dt;
      // Drift back toward orbit
      const targetX = ((well.wx + Math.cos(sentry.orbitAngle) * sentry.orbitRadius) % ws + ws) % ws;
      const targetY = ((well.wy + Math.sin(sentry.orbitAngle) * sentry.orbitRadius) % ws + ws) % ws;
      const dx = worldDisplacement(sentry.wx, targetX, ws);
      const dy = worldDisplacement(sentry.wy, targetY, ws);
      const dist = Math.hypot(dx, dy);
      if (dist > 0.005) {
        sentry.wx = ((sentry.wx + (dx / dist) * cfg.patrolSpeed[0] * dt) % ws + ws) % ws;
        sentry.wy = ((sentry.wy + (dy / dist) * cfg.patrolSpeed[0] * dt) % ws + ws) % ws;
      }
      if (sentry.recoverTimer <= 0) {
        sentry.state = "patrol";
      }
    }
  }
}

// --- Fauna System (Ambient Tier) ---
// Lightweight entities: position, velocity, age, type. No state machine.
// Drift Jellies: ambient, always present, teal glow, +0.01 signal on bump.
// Signal Blooms (née Signal Moths): spawn near signal sources, attracted to
// highest-signal player. Spawn rate scales with signal zone. See FAUNA.md.

function tickFauna(dt) {
  const cfg = FAUNA_CONFIG;
  const ws = runtime.session.worldScale;
  const fauna = runtime.mapState.fauna;

  // Find peak player signal for bloom spawning
  let peakSignal = 0;
  let peakPlayer = null;
  for (const player of runtime.players.values()) {
    if (player.status !== "alive") continue;
    if (player.signal.level > peakSignal) {
      peakSignal = player.signal.level;
      peakPlayer = player;
    }
  }
  const peakZone = peakPlayer ? peakPlayer.signal.zone : "ghost";

  const faunaRng = runtime.session?.rng?.rawStream('fauna') || Math.random;

  // Spawn drift jellies to maintain count
  const jellyCount = fauna.filter(f => f.type === "jelly" && f.alive).length;
  if (jellyCount < cfg.jellyCount && fauna.length < cfg.maxTotal) {
    runtime._jellySpawnTimer = (runtime._jellySpawnTimer || 0) + dt;
    if (runtime._jellySpawnTimer >= cfg.jellySpawnInterval) {
      runtime._jellySpawnTimer = 0;
      fauna.push({
        id: `fauna-${runtime.tick}-${Math.random().toString(36).slice(2,6)}`,
        type: "jelly",
        wx: faunaRng() * ws, wy: faunaRng() * ws,
        vx: (faunaRng() - 0.5) * 0.005, vy: (faunaRng() - 0.5) * 0.005,
        age: 0,
        lifespan: cfg.jellyLifespan[0] + faunaRng() * (cfg.jellyLifespan[1] - cfg.jellyLifespan[0]),
        alive: true,
        phase: faunaRng() * Math.PI * 2,
      });
    }
  }

  // Spawn signal blooms based on signal zone
  const bloomRate = cfg.bloomSpawnRate[peakZone] || 0;
  if (bloomRate > 0 && peakPlayer && fauna.length < cfg.maxTotal) {
    runtime._bloomSpawnAccum = (runtime._bloomSpawnAccum || 0) + bloomRate * dt;
    while (runtime._bloomSpawnAccum >= 1) {
      runtime._bloomSpawnAccum -= 1;
      const angle = faunaRng() * Math.PI * 2;
      const dist = cfg.bloomSpawnRange[0] + faunaRng() * (cfg.bloomSpawnRange[1] - cfg.bloomSpawnRange[0]);
      fauna.push({
        id: `fauna-${runtime.tick}-${Math.random().toString(36).slice(2,6)}`,
        type: "bloom",
        wx: ((peakPlayer.wx + Math.cos(angle) * dist) % ws + ws) % ws,
        wy: ((peakPlayer.wy + Math.sin(angle) * dist) % ws + ws) % ws,
        vx: 0, vy: 0,
        age: 0,
        lifespan: cfg.bloomLifespan[0] + faunaRng() * (cfg.bloomLifespan[1] - cfg.bloomLifespan[0]),
        alive: true,
        phase: faunaRng() * Math.PI * 2,
      });
    }
  }

  // Update all fauna
  for (let i = fauna.length - 1; i >= 0; i--) {
    const f = fauna[i];
    if (!f.alive) { fauna.splice(i, 1); continue; }
    f.age += dt;
    if (f.age >= f.lifespan) { f.alive = false; fauna.splice(i, 1); continue; }

    if (f.type === "bloom" && peakPlayer) {
      // Attract toward signal source
      const dx = worldDisplacement(f.wx, peakPlayer.wx, ws);
      const dy = worldDisplacement(f.wy, peakPlayer.wy, ws);
      const dist = Math.hypot(dx, dy);
      if (dist > 0.01) {
        f.vx += (dx / dist) * cfg.bloomAttraction * dt;
        f.vy += (dy / dist) * cfg.bloomAttraction * dt;
      }
      const speed = Math.hypot(f.vx, f.vy);
      if (speed > cfg.bloomMaxSpeed) {
        f.vx *= cfg.bloomMaxSpeed / speed;
        f.vy *= cfg.bloomMaxSpeed / speed;
      }
    }

    // Light drag
    f.vx *= 0.99;
    f.vy *= 0.99;
    f.wx = ((f.wx + f.vx * dt) % ws + ws) % ws;
    f.wy = ((f.wy + f.vy * dt) % ws + ws) % ws;

    // Collision with players
    for (const player of runtime.players.values()) {
      if (player.status !== "alive") continue;
      const pd = worldDistance(f.wx, f.wy, player.wx, player.wy, ws);
      const bumpRadius = f.type === "jelly" ? 0.04 : 0.03;
      if (pd < bumpRadius) {
        const bumpForce = f.type === "jelly" ? cfg.jellyBumpForce : cfg.bloomBumpForce;
        const bumpSignal = f.type === "jelly" ? cfg.jellyBumpSignal : cfg.bloomBumpSignal;
        const bx = worldDisplacement(f.wx, player.wx, ws);
        const by = worldDisplacement(f.wy, player.wy, ws);
        const bd = Math.hypot(bx, by);
        if (bd > 0.001) {
          player.vx += (bx / bd) * bumpForce;
          player.vy += (by / bd) * bumpForce;
        }
        spikePlayerSignal(player, bumpSignal);
        f.alive = false; // consumed on contact
        break;
      }
    }
  }
}

// --- Inhibitor System (Existential Tier) ---
// Three-form escalation driven by signal pressure + time + well growth.
// Form 1 (Glitch): 70% of threshold — drifting corruption zone, magenta pulse.
// Form 2 (Swarm): irreversible wake — hunting mass, cargo drain, control debuff.
// Form 3 (Vessel): geometric anti-fluid — instant kill, portal blocking, gravity pull.
// Final portal guaranteed 60s after Vessel. See INHIBITOR.md.
// Pressure builds from player signal + time + well growth.
// Forms: 0=inactive, 1=glitch, 2=swarm, 3=vessel.

function ensureInhibitorFormTimes(inh = runtime.inhibitor) {
  if (!Array.isArray(inh.formTimes)) inh.formTimes = [null, null, null, null];
  while (inh.formTimes.length < 4) inh.formTimes.push(null);
  return inh.formTimes;
}

function setInhibitorForm(form, payload = {}) {
  const inh = runtime.inhibitor;
  if (inh.form === form) return false;
  inh.form = form;
  const formTimes = ensureInhibitorFormTimes(inh);
  if (form > 0 && formTimes[form] == null) formTimes[form] = runtime.simTime;
  publishEvent("inhibitor.form", { form, pressure: inh.pressure, ...payload });
  if (form === 2) publishEvent("inhibitor.wake", { wx: inh.wx, wy: inh.wy });
  return true;
}

function collectInhibitorSignalSources({ includeDecoys = true, includeZeroPlayers = false } = {}) {
  const sources = [];
  for (const player of runtime.players.values()) {
    if (player.status !== "alive") continue;
    const signal = Number(player.signal?.level) || 0;
    if (includeZeroPlayers || signal > 0) {
      sources.push({
        kind: player.isAI ? "ai-player" : "player",
        clientId: player.clientId,
        player,
        wx: player.wx,
        wy: player.wy,
        signal,
      });
    }
    if (!includeDecoys) continue;
    const decoys = player.abilityState?.decoys;
    if (!Array.isArray(decoys)) continue;
    for (const decoy of decoys) {
      const decoySignal = Number(decoy.signal) || 0;
      if (decoySignal <= 0) continue;
      sources.push({
        kind: "decoy",
        clientId: player.clientId,
        wx: decoy.wx,
        wy: decoy.wy,
        signal: decoySignal,
      });
    }
  }
  sources.sort((a, b) => b.signal - a.signal);
  return sources;
}

function selectInhibitorSignalSource(options = {}) {
  return collectInhibitorSignalSources(options)[0] || null;
}

function rememberInhibitorSignalSource(inh, source, dt) {
  if (source && source.signal > SIGNAL_CONFIG.ghostMax) {
    inh.lastSignalWX = source.wx;
    inh.lastSignalWY = source.wy;
    inh.lastSignalAge = 0;
  } else {
    inh.lastSignalAge = Math.min(999, (inh.lastSignalAge || 0) + dt);
  }
}

function moveInhibitorToward(inh, targetWX, targetWY, speed, dt, ws) {
  const dx = worldDisplacement(inh.wx, targetWX, ws);
  const dy = worldDisplacement(inh.wy, targetWY, ws);
  const dist = Math.hypot(dx, dy);
  if (dist <= 0.01) return;
  inh.wx = wrapWorldPosition(inh.wx + (dx / dist) * speed * dt, ws);
  inh.wy = wrapWorldPosition(inh.wy + (dy / dist) * speed * dt, ws);
}

function setSwarmSearchTarget(inh, dt, ws) {
  const cfg = INHIBITOR_CONFIG;
  inh.swarmSearchTimer = Math.max(0, (inh.swarmSearchTimer || 0) + dt);
  inh.swarmSearchAngle = (inh.swarmSearchAngle || 0) + cfg.swarmSearchTurnRate * dt;
  const searchAge = Math.max(0, inh.swarmSearchTimer - cfg.swarmSearchTimeout);
  const radius = Math.min(
    cfg.swarmSearchRadiusMax,
    cfg.swarmSearchRadiusMin + searchAge * cfg.swarmSearchRadiusRate
  );
  const centerX = Number.isFinite(inh.lastSignalWX) ? inh.lastSignalWX : inh.swarmTargetX;
  const centerY = Number.isFinite(inh.lastSignalWY) ? inh.lastSignalWY : inh.swarmTargetY;
  inh.swarmTargetX = wrapWorldPosition(centerX + Math.cos(inh.swarmSearchAngle) * radius, ws);
  inh.swarmTargetY = wrapWorldPosition(centerY + Math.sin(inh.swarmSearchAngle) * radius, ws);
}

function updateInhibitorPortalBlocks(inh, ws) {
  const cfg = INHIBITOR_CONFIG;
  for (const portal of runtime.mapState.portals) {
    if (portal.alive === false) continue;
    const shouldBlock = inh.form >= 3 &&
      worldDistance(inh.wx, inh.wy, portal.wx, portal.wy, ws) < cfg.vesselPortalBlockRange;
    if (portal.blockedByInhibitor !== shouldBlock) {
      portal.blockedByInhibitor = shouldBlock;
      publishEvent(shouldBlock ? "portal.blocked" : "portal.unblocked", {
        portalId: portal.id,
        by: "inhibitor",
      });
    }
  }
}

function updateVesselWellDistortion(inh, dt, ws) {
  const cfg = INHIBITOR_CONFIG;
  for (const well of runtime.mapState.wells) {
    if (well.consumedByInhibitor) continue;
    const dx = worldDisplacement(well.wx, inh.wx, ws);
    const dy = worldDisplacement(well.wy, inh.wy, ws);
    const dist = Math.hypot(dx, dy);
    if (dist > 0.001 && dist < cfg.vesselWellPullRange) {
      const pull = cfg.vesselWellPullStrength * (1 - dist / cfg.vesselWellPullRange);
      well.wx = wrapWorldPosition(well.wx + (dx / dist) * pull * dt, ws);
      well.wy = wrapWorldPosition(well.wy + (dy / dist) * pull * dt, ws);
    }
    if (dist < cfg.vesselWellConsumeRadius) {
      const absorbedMass = Math.max(0, Number(well.mass) || 0);
      well.consumedByInhibitor = true;
      well.mass = Math.max(0.05, absorbedMass * 0.25);
      well.killRadius = wellKillRadiusForMass(well);
      inh.radius = Math.min(0.75, (inh.radius || cfg.swarmRadius * 1.5) + absorbedMass * cfg.vesselConsumeRadiusGrowth);
      inh.gravityBonus = Math.min(0.35, (inh.gravityBonus || 0) + absorbedMass * cfg.vesselConsumeGravityBonus);
      publishEvent("inhibitor.consumeWell", {
        wellId: well.id,
        wx: well.wx,
        wy: well.wy,
        absorbedMass,
      });
    }
  }
}

function spawnInhibitorFinalPortal(inh, ws) {
  const cfg = INHIBITOR_CONFIG;
  let bestScore = -Infinity, bestX = ws / 2, bestY = ws / 2;
  const rng = runtime.session?.rng?.rawStream('finalPortal') || Math.random;
  const minWellClearance = 0.22;
  const minInhibitorClearance = (cfg.vesselPortalBlockRange || 0) + portalCaptureRadius({ type: "standard" });
  for (let i = 0; i < 32; i++) {
    const cx = rng() * ws;
    const cy = rng() * ws;
    const inhibitorDist = worldDistance(inh.wx, inh.wy, cx, cy, ws);
    let wellClearance = ws;
    for (const well of runtime.mapState.wells) {
      if (well.consumedByInhibitor) continue;
      const radius = Math.max(0, Number(well.killRadius) || 0);
      wellClearance = Math.min(wellClearance, worldDistance(well.wx, well.wy, cx, cy, ws) - radius);
    }
    let portalClearance = ws;
    for (const portal of runtime.mapState.portals) {
      if (portal.alive === false) continue;
      portalClearance = Math.min(portalClearance, worldDistance(portal.wx, portal.wy, cx, cy, ws) - portalCaptureRadius(portal));
    }
    const wellPenalty = wellClearance < minWellClearance ? (minWellClearance - wellClearance) * 6 : 0;
    const inhibitorPenalty = inhibitorDist < minInhibitorClearance ? (minInhibitorClearance - inhibitorDist) * 8 : 0;
    const score = inhibitorDist * 0.5 + wellClearance * 1.4 + portalClearance * 0.15 - wellPenalty - inhibitorPenalty;
    if (score > bestScore) {
      bestScore = score;
      bestX = cx;
      bestY = cy;
    }
  }
  runtime.mapState.portals.push({
    id: `portal-final-${runtime.tick}`,
    wx: bestX, wy: bestY,
    type: "standard", wave: 99,
    spawnTime: runtime.simTime,
    lifespan: cfg.finalPortalLifespan,
    alive: true, opacity: 1,
    finalInhibitor: true,
    blockedByInhibitor: false,
  });
  inh.finalPortalSpawned = true;
  publishEvent("inhibitor.finalPortal", { wx: bestX, wy: bestY });
}

function tickInhibitor(dt) {
  const inh = runtime.inhibitor;
  const cfg = INHIBITOR_CONFIG;
  const ws = runtime.session.worldScale;
  inh.localTime += dt;
  ensureInhibitorFormTimes(inh);

  const signalSource = selectInhibitorSignalSource({ includeDecoys: inh.form < 3 });
  const vesselTarget = selectInhibitorSignalSource({ includeDecoys: false, includeZeroPlayers: true });
  const peakSignal = signalSource?.signal || 0;
  rememberInhibitorSignalSource(inh, signalSource, dt);

  inh.pressure += peakSignal * cfg.pressureFromSignal * dt;
  inh.pressure += (runtime.simTime / RUN_DURATION) * cfg.pressureFromTime * dt;
  inh.pressure = Math.min(1.5, inh.pressure);

  const glitchThreshold = inh.threshold * cfg.glitchFraction;

  if (inh.form === 0 && inh.pressure >= glitchThreshold) {
    inh.intensity = 0;
    inh.radius = cfg.glitchRadius;
    const spawnFrom = signalSource || vesselTarget;
    if (spawnFrom) {
      inh.wx = wrapWorldPosition(spawnFrom.wx + ws / 2, ws);
      inh.wy = wrapWorldPosition(spawnFrom.wy + ws / 2, ws);
      inh.lastSignalWX = spawnFrom.wx;
      inh.lastSignalWY = spawnFrom.wy;
    } else {
      const rng = runtime.session?.rng?.rawStream('inhibitorSpawn') || Math.random;
      inh.wx = rng() * ws;
      inh.wy = rng() * ws;
    }
    inh.silenceTimer = 0;
    setInhibitorForm(1);
  }

  if (inh.form === 1 && inh.pressure >= inh.threshold) {
    inh.intensity = 0;
    inh.radius = cfg.swarmRadius;
    inh.vesselTimer = 0;
    inh.swarmTrackTimer = 0;
    inh.swarmSearchTimer = 0;
    const target = signalSource || vesselTarget;
    if (target) {
      inh.swarmTargetX = target.wx;
      inh.swarmTargetY = target.wy;
    }
    setInhibitorForm(2);
  }

  if (inh.form >= 2) inh.vesselTimer += dt;

  if (inh.form === 2) {
    if (inh.vesselTimer >= cfg.vesselTimeToForm || peakSignal >= 1.0) {
      inh.intensity = 0;
      inh.radius = Math.max(inh.radius || 0, cfg.swarmRadius * 1.5);
      setInhibitorForm(3);
    }
  }

  if (inh.form === 1) {
    inh.intensity = Math.min(1, inh.intensity + dt * 0.5);
    if (peakSignal < SIGNAL_CONFIG.ghostMax) {
      inh.silenceTimer += dt;
      if (inh.silenceTimer >= cfg.glitchDissipateTime) {
        inh.intensity = 0;
        inh.pressure = inh.threshold * cfg.glitchFraction * 0.5;
        setInhibitorForm(0);
      }
    } else {
      inh.silenceTimer = 0;
    }
    const targetX = Number.isFinite(inh.lastSignalWX) ? inh.lastSignalWX : signalSource?.wx;
    const targetY = Number.isFinite(inh.lastSignalWY) ? inh.lastSignalWY : signalSource?.wy;
    if (Number.isFinite(targetX) && Number.isFinite(targetY)) {
      const speed = peakSignal > cfg.glitchSolidifySignal ? cfg.glitchSolidifySpeed : cfg.glitchDriftSpeed;
      moveInhibitorToward(inh, targetX, targetY, speed, dt, ws);
    }
  }

  if (inh.form === 2) {
    inh.intensity = Math.min(1, inh.intensity + dt * 0.3);
    inh.swarmTrackTimer += dt;

    if (signalSource && signalSource.signal >= SIGNAL_CONFIG.ghostMax) {
      inh.swarmSearchTimer = 0;
      if (inh.swarmTrackTimer >= cfg.swarmTrackInterval) {
        inh.swarmTargetX = signalSource.wx;
        inh.swarmTargetY = signalSource.wy;
        inh.swarmTrackTimer = 0;
      }
    } else if (inh.swarmSearchTimer >= cfg.swarmSearchTimeout || inh.silenceTimer >= cfg.swarmSearchTimeout) {
      setSwarmSearchTarget(inh, dt, ws);
    } else {
      inh.swarmSearchTimer = (inh.swarmSearchTimer || 0) + dt;
    }

    let speed = cfg.swarmSpeedSilent;
    if (peakSignal > SIGNAL_CONFIG.flareMax) speed = cfg.swarmSpeedFlare;
    else if (peakSignal > SIGNAL_CONFIG.presenceMax) speed = cfg.swarmSpeedHeavy;
    else if (peakSignal > SIGNAL_CONFIG.ghostMax) speed = cfg.swarmSpeedLight;
    moveInhibitorToward(inh, inh.swarmTargetX, inh.swarmTargetY, speed, dt, ws);

    for (const player of runtime.players.values()) {
      if (player.status !== "alive") continue;
      const pd = worldDistance(inh.wx, inh.wy, player.wx, player.wy, ws);
      if (pd < inh.radius * 0.5) {
        spikePlayerSignal(player, cfg.swarmContactSignalSpike * dt);
        player.controlDebuff = Math.max(player.controlDebuff || 0, cfg.swarmControlDebuffDuration);
        if ((runtime.session?.rng?.rawStream('swarmDrain') || Math.random)() < cfg.swarmContactDrain * dt) {
          for (let i = player.cargo.length - 1; i >= 0; i--) {
            if (player.cargo[i]) {
              player.cargo[i] = null;
              publishEvent("inhibitor.drainCargo", { clientId: player.clientId });
              break;
            }
          }
        }
      }
    }
  }

  if (inh.form === 3) {
    inh.intensity = Math.min(1, inh.intensity + dt * 0.2);
    if (vesselTarget) {
      moveInhibitorToward(inh, vesselTarget.wx, vesselTarget.wy, cfg.vesselSpeed, dt, ws);
    }

    updateVesselWellDistortion(inh, dt, ws);

    const pullStrength = cfg.vesselGravityStrength + (inh.gravityBonus || 0);
    for (const player of runtime.players.values()) {
      if (player.status !== "alive") continue;
      const pd = worldDistance(inh.wx, inh.wy, player.wx, player.wy, ws);
      if (pd < cfg.vesselGravityRange && pd > 0.001) {
        const pull = pullStrength * (1 - pd / cfg.vesselGravityRange);
        const pdx = worldDisplacement(player.wx, inh.wx, ws);
        const pdy = worldDisplacement(player.wy, inh.wy, ws);
        player.vx += (pdx / pd) * pull * dt;
        player.vy += (pdy / pd) * pull * dt;
      }
      if (pd < cfg.vesselKillRadius) {
        player.status = "dead";
        player.vx = 0;
        player.vy = 0;
        publishEvent("player.died", {
          clientId: player.clientId,
          cause: "inhibitor_vessel",
          entityId: "inhibitor-vessel",
        });
        commitPlayerOutcome(player, "dead");
        player.cargo = new Array(player.brain?.cargoSlots || PLAYER_CARGO_SLOTS).fill(null);
      }
    }
  }

  updateInhibitorPortalBlocks(inh, ws);

  const formTimes = ensureInhibitorFormTimes(inh);
  const timeSinceVessel = formTimes[3] == null ? 0 : runtime.simTime - formTimes[3];
  if (inh.form >= 3 && !inh.finalPortalSpawned && timeSinceVessel >= cfg.finalPortalDelay) {
    spawnInhibitorFinalPortal(inh, ws);
  }
}

function tickSim() {
  if (runtime.session.status !== "running") return;
  if (getHumanPlayerCount() === 0) {
    runtime.emptySince = runtime.emptySince || Date.now();
    if (!runtime.keepAlive && runtime.idleShutdownMs > 0 && Date.now() - runtime.emptySince >= runtime.idleShutdownMs) {
      shutdownForIdle();
    }
    return;
  }
  if (maybeEndTerminalSession()) return;
  runtime.emptySince = null;
  const tickStart = performance.now();
  const dt = runtime.session.timeScale / runtime.session.tickHz;
  runtime.tick += 1;
  runtime.simTime += dt;
  if (maybeEnforceMatchLifetime()) return;
  const relevance = buildRelevanceView();

  runSystemAtRate("world", runtime.session.worldTickHz || runtime.session.tickHz, dt, (stepDt) => {
    tickWells(stepDt);
    tickStars(stepDt, relevance.stars);
    tickWrecks(stepDt, relevance.wrecks);
    tickPlanetoids(stepDt, relevance.planetoids);
  });
  runSystemAtRate("growth", runtime.session.growthTickHz || runtime.session.tickHz, dt, tickGrowth);
  runSystemAtRate("portals", runtime.session.portalTickHz || runtime.session.tickHz, dt, tickPortals);
  tickWreckWaves(dt);
  runSystemAtRate("scavengers", runtime.session.scavengerTickHz || runtime.session.tickHz, dt, (stepDt) =>
    tickScavengers(stepDt, relevance.scavengers)
  );
  runSystemAtRate("waves", runtime.session.waveTickHz || runtime.session.tickHz, dt, tickWaveRings);
  runSystemAtRate("field", runtime.session.fieldTickHz || runtime.session.worldTickHz || runtime.session.tickHz, dt, rebuildAuthoritativeField);
  tickAIPlayers(dt);
  tickSentries(dt);
  tickFauna(dt);
  tickInhibitor(dt);
  maybeCollapseRun();
  if (runtime.session.status !== "running") return;

  for (const player of runtime.players.values()) {
    if (player.status !== "alive") continue;

    if (player.effectState.pulseCooldownRemaining > 0) {
      player.effectState.pulseCooldownRemaining = Math.max(0, player.effectState.pulseCooldownRemaining - dt);
    }
    if (player.effectState.timeSlowRemaining > 0) {
      const wasActive = player.effectState.timeSlowRemaining > 0;
      player.effectState.timeSlowRemaining = Math.max(0, player.effectState.timeSlowRemaining - dt);
      if (wasActive && player.effectState.timeSlowRemaining <= 0) {
        refreshPlayerEffects(player);
        publishEvent("player.effectExpired", {
          clientId: player.clientId,
          effectId: "timeSlowLocal",
        });
      }
    }

    let input = player.lastInput;
    if (input.consumeSlot !== null && input.consumeSlot !== undefined) {
      applyConsumable(player, input.consumeSlot);
      player.lastInput = { ...player.lastInput, consumeSlot: null };
      input = player.lastInput;
    }

    if (input.pulse) {
      applyPulse(player);
      player.lastInput = { ...player.lastInput, pulse: false };
      input = player.lastInput;
    }

    const extractConfirm = Boolean(input.extractConfirm);
    if (extractConfirm) {
      player.lastInput = { ...player.lastInput, extractConfirm: false };
      input = player.lastInput;
    }

    const playerDt =
      player.effectState.timeSlowRemaining > 0
        ? dt * SERVER_COMBAT.timeSlowScale
        : dt;
    // Tick control debuff (Swarm contact → sluggish controls)
    if (player.controlDebuff > 0) {
      const debuffDecay = player.brain ? player.brain.controlDebuffResist : 1.0;
      player.controlDebuff = Math.max(0, player.controlDebuff - playerDt * debuffDecay);
    }
    // Tick hull abilities before physics
    tickHullAbilities(player, playerDt);

    const controlMult = player.controlDebuff > 0 ? INHIBITOR_CONFIG.swarmControlDebuffMult : 1.0;
    const b = player.brain || BRAIN_DEFAULTS;
    const flowSample = estimateFlowSample(player.wx, player.wy);
    const driveStep = applyPlayerDriveAndFlow(player, input, playerDt, {
      brain: b,
      burnModifiers: getBurnModifiers(player),
      controlMult,
      flowSample,
    });
    player.lastDeliveredThrustIntensity = driveStep.thrustIntensity;

    applyWellGravity(player, playerDt);
    if (player.status !== "alive") continue;
    tickPlayerSlingshot(player, playerDt, input);
    applyStarPush(player, playerDt, relevance.stars);
    applyPlanetoidPush(player, playerDt, relevance.planetoids);
    applyWaveRingPush(player, playerDt);
    const movementStartWX = player.wx;
    const movementStartWY = player.wy;
    applyPlayerBrakeAndIntegrate(player, input, playerDt, {
      brain: b,
      controlMult,
      thrustIntensity: driveStep.thrustIntensity,
      worldScale: runtime.session.worldScale,
    });
    const sweep = movementSweep(movementStartWX, movementStartWY, player);
    applySweptWellContacts(player, playerDt, sweep);
    if (player.status !== "alive") continue;
    applyScavengerBump(player, relevance.scavengers, sweep);

    tickPlayerPickups(player, relevance.wrecks, sweep);
    tickExtraction(player, extractConfirm);
    if (player.status !== "alive") continue;
    tickPlayerSignal(player, playerDt);
  }
  if (maybeEndTerminalSession()) return;
  refreshBallparkMirror("tick");

  const alivePlayerCount = relevance.alivePlayers.length;
  const activeAiCount = runtime.mapState.scavengers.filter((scav) => scav.alive !== false && scav.state !== "dying").length;
  const activeWreckCount = relevance.wrecks.filter((wreck) => wreck.alive !== false && !wreck.looted).length;
  const activePortalCount = runtime.mapState.portals.filter(isPortalAvailable).length;
  const activeWaveCount = runtime.waveRings.length;
  const forcePressure = Math.max(
    runtime.mapState.wells.length / Math.max(1, alivePlayerCount * (runtime.session.maxWellInfluencesPerPlayer || 1)),
    activeWaveCount / Math.max(1, alivePlayerCount * (runtime.session.maxWaveInfluencesPerPlayer || 1)),
    activeWreckCount / Math.max(1, alivePlayerCount * (runtime.session.maxPickupChecksPerPlayer || 1)),
    activePortalCount / Math.max(1, alivePlayerCount * (runtime.session.maxPortalChecksPerPlayer || 1))
  );
  const overload = advanceOverload(runtime.overload, {
    tickCostMs: performance.now() - tickStart,
    playerCount: alivePlayerCount,
    aiCount: activeAiCount,
    forcePressure,
  });
  runtime.session.overloadPressure = overload.pressure;
  if (overload.changed) {
    applyOverloadProfile({ forceRestart: true });
    publishEvent("session.overloadChanged", {
      previousState: overload.previousState,
      state: overload.state,
      pressure: overload.pressure,
      tickHz: runtime.session.tickHz,
      snapshotHz: runtime.session.snapshotHz,
      timeScale: runtime.session.timeScale,
    });
    persistSessionRegistry();
  }
}

function getLoopTickHz() {
  if (runtime.session.status !== "running") return 0;
  if (getHumanPlayerCount({ activeOnly: true }) === 0) return IDLE_SESSION_TICK_HZ;
  return runtime.session.tickHz;
}

function stopTickLoop() {
  if (tickHandle) clearInterval(tickHandle);
  tickHandle = null;
  currentLoopTickHz = 0;
  runtime.loopTickHz = 0;
}

function restartTickLoop() {
  const nextTickHz = getLoopTickHz();
  if (nextTickHz <= 0) {
    stopTickLoop();
    return;
  }
  if (tickHandle && currentLoopTickHz === nextTickHz) return;
  if (tickHandle) clearInterval(tickHandle);
  currentLoopTickHz = nextTickHz;
  runtime.loopTickHz = nextTickHz;
  tickHandle = setInterval(tickSim, Math.max(1, Math.round(1000 / nextTickHz)));
}

function writeFiles() {
  const meta = {
    pid: process.pid,
    host: HOST,
    port: PORT,
    simInstanceId: SIM_INSTANCE_ID,
    label: LOG_LABEL,
    startedAt: runtime.startedAt,
    url: `http://${HOST}:${PORT}/`,
    controlPlaneUrl: CONTROL_PLANE_URL || null,
    keepAlive: runtime.keepAlive,
    idleShutdownMs: runtime.idleShutdownMs,
    protocolVersion: PROTOCOL_VERSION,
    sessionStatus: runtime.session.status,
  };

  if (PID_FILE) {
    ensureParent(PID_FILE);
    fs.writeFileSync(PID_FILE, `${process.pid}\n`, "utf8");
  }
  if (META_FILE) {
    ensureParent(META_FILE);
    fs.writeFileSync(META_FILE, `${JSON.stringify(meta, null, 2)}\n`, "utf8");
  }
}

const server = http.createServer(async (req, res) => {
  if (req.method === "OPTIONS") {
    res.statusCode = 204;
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Headers", `content-type,${AUTHORITY_HEADER},${PLAYER_ID_HEADER},${RUN_ID_HEADER}`);
    res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
    res.end();
    return;
  }

  try {
    if (req.method === "GET" && req.url === "/health") {
      const idleState = getIdleState();
      sendJson(res, 200, {
        ok: true,
        protocolVersion: PROTOCOL_VERSION,
        simInstanceId: SIM_INSTANCE_ID,
        controlPlaneUrl: CONTROL_PLANE_URL || null,
        session: runtime.session,
        tick: runtime.tick,
        simTime: runtime.simTime,
        playerCount: runtime.players.size,
        mapId: runtime.mapState.id,
        ballpark: runtime.ballparkMirror ? runtime.ballparkMirror.stats() : null,
        ballparkRelevance: runtime.ballparkRelevance,
        eventJournal: runtime.eventJournal ? runtime.eventJournal.describe() : null,
        snapshotRing: runtime.snapshotRing ? runtime.snapshotRing.describe() : null,
        match: {
          maxSimTime: MATCH_MAX_SIM_TIME,
          terminalGraceMs: TERMINAL_SESSION_GRACE_MS,
          wreckRepeatWaveCount: runtime._wreckRepeatWaveCount || 0,
          maxWreckRepeatWaves: MAX_WRECK_REPEAT_WAVES,
          maxLiveWrecks: MAX_LIVE_WRECKS,
        },
        process: {
          pid: process.pid,
          uptimeSec: Number(process.uptime().toFixed(3)),
          memory: process.memoryUsage(),
        },
        idleState,
        shutdownReason: runtime.shutdownReason,
      });
      return;
    }

    if (req.method === "GET" && req.url === "/debug/ballpark") {
      sendJson(res, 200, {
        ok: true,
        ballpark: runtime.ballparkMirror ? runtime.ballparkMirror.stats() : null,
        relevance: runtime.ballparkRelevance,
      });
      return;
    }

    if (req.method === "GET" && req.url === "/maps") {
      sendJson(res, 200, {
        type: "maps",
        maps: Object.values(PLAYABLE_MAPS).map((map) => {
          const profile = getSessionProfile(map.id, map.worldScale);
          return {
            id: map.id,
            name: map.name,
            worldScale: map.worldScale,
            fluidResolution: map.fluidResolution,
            wellCount: map.wells.length,
            starCount: map.stars.length,
            wreckCount: map.wrecks.length,
            planetoidCount: map.planetoids.length,
            simScaleProfile: profile.profileId,
            clientPerfProfile: profile.clientPerfProfile,
            tickHz: profile.tickHz,
            snapshotHz: profile.snapshotHz,
            worldTickHz: profile.worldTickHz,
            portalTickHz: profile.portalTickHz,
            growthTickHz: profile.growthTickHz,
            scavengerTickHz: profile.scavengerTickHz,
            waveTickHz: profile.waveTickHz,
            fieldTickHz: profile.fieldTickHz,
            useCoarseField: profile.useCoarseField,
            flowFieldCellSize: profile.flowFieldCellSize,
            fieldFlowScale: profile.fieldFlowScale,
            entityRelevanceRadius: profile.entityRelevanceRadius,
            scavengerRelevanceRadius: profile.scavengerRelevanceRadius,
            spawnScavengersBase: profile.spawnScavengersBase,
            spawnScavengersPerPlayer: profile.spawnScavengersPerPlayer,
            maxScavengers: profile.maxScavengers,
            maxRelevantStarsPerPlayer: profile.maxRelevantStarsPerPlayer,
            maxRelevantPlanetoidsPerPlayer: profile.maxRelevantPlanetoidsPerPlayer,
            maxRelevantWrecksPerPlayer: profile.maxRelevantWrecksPerPlayer,
            maxRelevantScavengersPerPlayer: profile.maxRelevantScavengersPerPlayer,
            maxWellInfluencesPerPlayer: profile.maxWellInfluencesPerPlayer,
            maxWaveInfluencesPerPlayer: profile.maxWaveInfluencesPerPlayer,
            maxPickupChecksPerPlayer: profile.maxPickupChecksPerPlayer,
            maxPortalChecksPerPlayer: profile.maxPortalChecksPerPlayer,
          };
        }),
      });
      return;
    }

    if (req.method === "GET" && req.url === "/protocol") {
      sendJson(res, 200, protocol);
      return;
    }

    if (req.method === "GET" && req.url?.startsWith("/snapshots")) {
      const url = new URL(req.url, `http://${HOST}:${PORT}`);
      const sinceSnapshotId = Number(url.searchParams.get("since") || 0);
      const runId = url.searchParams.get("runId") || null;
      sendJson(res, 200, {
        type: "snapshots",
        protocolVersion: PROTOCOL_VERSION,
        ...runtime.snapshotRing.list({ sinceSnapshotId, runId }),
      });
      return;
    }

    if (req.method === "GET" && req.url?.startsWith("/snapshot")) {
      sendJson(res, 200, snapshotBody());
      return;
    }

    if (req.method === "GET" && req.url?.startsWith("/events")) {
      const url = new URL(req.url, `http://${HOST}:${PORT}`);
      const since = Number(url.searchParams.get("since") || 0);
      const lane = url.searchParams.get("lane") || url.searchParams.get("lanes") || null;
      const runId = url.searchParams.get("runId") || null;
      const wantsPrivateEvents = Boolean(
        req.headers[AUTHORITY_HEADER] || req.headers[PLAYER_ID_HEADER]
      );
      let playerId = null;
      if (wantsPrivateEvents) {
        const auth = authorizePlayerRequest(req, { runId }, { requireCommandSeq: false });
        if (!auth.ok) {
          sendAuthorityError(res, auth);
          return;
        }
        playerId = auth.authority.playerId;
      }
      const journalRead = runtime.eventJournal.read({ since, lane, runId });
      sendJson(res, 200, {
        type: "events",
        protocolVersion: PROTOCOL_VERSION,
        ...journalRead,
        events: filterEventsForPlayer(journalRead.events, playerId),
      });
      return;
    }

    if (req.method === "POST" && req.url === "/session/start") {
      const body = await readJson(req);
      if (runtime.session.status === "running") {
        const permission = ensureHostAuthority(req, {
          ...body,
          playerId: body.playerId || body.requesterId,
        });
        if (!permission.ok) {
          sendAuthorityError(res, permission);
          return;
        }
        if (permission.authority) acceptCommand(permission);
      }
      startSession(body);
      const joinTicket = issueJoinClaim(body.requesterId || body.playerId);
      sendJson(res, 200, { ok: true, session: runtime.session, joinTicket });
      return;
    }

    if (req.method === "POST" && req.url === "/session/reset") {
      const body = await readJson(req);
      const permission = ensureHostAuthority(req, {
        ...body,
        playerId: body.playerId || body.requesterId,
      });
      if (!permission.ok) {
        sendAuthorityError(res, permission);
        return;
      }
      if (permission.authority) acceptCommand(permission);
      const requesterId = runtime.session.hostClientId || body.requesterId || body.playerId;
      const requesterName = runtime.session.hostName;
      startSession({
        ...runtime.session,
        requesterId,
        requesterName,
      });
      const joinTicket = issueJoinClaim(requesterId);
      sendJson(res, 200, { ok: true, session: runtime.session, joinTicket });
      return;
    }

    if (req.method === "POST" && req.url === "/join") {
      const body = await readJson(req);
      if (runtime.session.status !== "running") {
        sendJson(res, 409, { ok: false, error: "No active session" });
        return;
      }

      const clientId = String(body.clientId || "").trim();
      if (!clientId) {
        sendJson(res, 400, { ok: false, error: "clientId is required" });
        return;
      }

      const requestedRunId = String(body.runId || "").trim();
      if (requestedRunId && requestedRunId !== runtime.session.runId) {
        sendJson(res, 409, {
          ok: false,
          code: "stale-run",
          error: "Join does not belong to the active run",
          activeRunId: runtime.session.runId,
        });
        return;
      }

      let player = runtime.players.get(clientId);
      let authority = runtime.playerAuthorities.get(clientId) || null;
      const reconnected = Boolean(player);
      if (player) {
        const auth = authorizePlayerRequest(req, {
          ...body,
          runId: requestedRunId || runtime.session.runId,
          playerId: clientId,
        }, { requireCommandSeq: false });
        if (!auth.ok) {
          sendAuthorityError(res, auth);
          return;
        }
        authority = auth.authority;
      } else {
        const pendingClaim = runtime.joinClaims.get(clientId);
        if (pendingClaim && !secretsMatch(body.joinTicket, pendingClaim)) {
          sendJson(res, 403, { ok: false, code: "join-claim-required", error: "A valid host join ticket is required" });
          return;
        }
      }
      if (!player) {
        const humanCount = Array.from(runtime.players.values()).filter(p => !p.isAI).length;
        if (humanCount >= runtime.session.maxPlayers) {
          sendJson(res, 409, { ok: false, error: "Session full" });
          return;
        }
        const profileId = body.profileId ? String(body.profileId).trim() : null;
        const durableProfile = profileId
          ? await controlPlane.bootstrapProfile({
              profileId,
              snapshot: body.profileSnapshot || null,
              fallbackName: body.name,
            })
          : null;
        const explicitHullType = normalizePublicHullType(
          body.hullType,
          durableProfile?.hullType,
          durableProfile?.shipType,
          body.profileSnapshot?.hullType,
          body.profileSnapshot?.shipType
        );
        const durableLoadout = cloneProfileLoadout(durableProfile);
        const equipped = durableProfile ? durableLoadout.equipped : cloneLoadoutItems(body.equipped);
        const consumables = durableProfile ? durableLoadout.consumables : cloneLoadoutItems(body.consumables);
        player = createPlayer(clientId, body.name, explicitHullType, {
          profileShipType: durableProfile?.hullType || durableProfile?.shipType || body.profileSnapshot?.hullType || body.profileSnapshot?.shipType || null,
          profileUpgrades: durableProfile?.upgrades || body.profileSnapshot?.upgrades || null,
          rigLevels: durableProfile?.rigLevels || body.profileSnapshot?.rigLevels || null,
          equipped,
          consumables,
        });
        player.profileId = durableProfile?.id || profileId || null;
        player.name = durableProfile?.name || player.name;
        player.equipped = equipped;
        player.consumables = consumables;
        refreshPlayerBrain(player, durableProfile);
        refreshPlayerEffects(player);
        const spawn = findSafeSpawn(runtime.mapState);
        player.wx = spawn.wx;
        player.wy = spawn.wy;
        runtime.players.set(clientId, player);
        authority = issuePlayerAuthority(clientId);
        runtime.joinClaims.delete(clientId);
        telemetry.info("player.joined", { sessionId: runtime.session.id, clientId, profileId: player.profileId, name: player.name, hullType: player.hullType, mapId: runtime.session.mapId });
        if (!runtime.session.hostClientId) assignHost(clientId, player.name);
        publishEvent("player.joined", { clientId, name: player.name, wx: player.wx, wy: player.wy });
        persistSessionRegistry();
      } else {
        if (body.name) {
          player.name = String(body.name);
        }
        if (body.profileId) {
          player.profileId = String(body.profileId);
        }
        if (body.profileSnapshot?.rigLevels) {
          player.rigLevels = normalizeRigLevels(body.profileSnapshot.rigLevels, player.hullType);
        }
        if (body.profileSnapshot?.upgrades) {
          player.profileUpgrades = normalizeProfileUpgrades(body.profileSnapshot.upgrades);
        }
        if (body.profileSnapshot?.shipType) {
          player.profileShipType = normalizePublicHullType(body.profileSnapshot.shipType);
          player.hullType = normalizePublicHullType(player.profileShipType, player.hullType);
        }
        if (Array.isArray(body.equipped)) {
          player.equipped = cloneLoadoutItems(body.equipped);
        }
        if (Array.isArray(body.consumables)) {
          player.consumables = cloneLoadoutItems(body.consumables);
        }
        refreshPlayerBrain(player);
        refreshPlayerEffects(player);
      }

      if (!player.isAI) {
        // A session starts idle because AI pilots are spawned before humans
        // arrive. Promote the loop as soon as a real player joins or rejoins.
        runtime.emptySince = null;
        restartTickLoop();
      }

      refreshBallparkMirror("player-joined");
      sendJson(res, 200, { ok: true, player, authority: publicAuthority(authority, { reconnected }) });
      return;
    }

    if (req.method === "GET" && req.url.startsWith("/profile")) {
      const requestUrl = new URL(req.url, `http://${HOST}:${PORT}`);
      const profileId = String(requestUrl.searchParams.get("profileId") || "").trim();
      if (!profileId) {
        sendJson(res, 400, { ok: false, error: "profileId is required" });
        return;
      }
      const profile = await controlPlane.getProfile(profileId);
      if (!profile) {
        sendJson(res, 404, { ok: false, error: "Unknown profile" });
        return;
      }
      const recentRuns = await controlPlane.getRecentRuns(profileId, 5);
      sendJson(res, 200, {
        ok: true,
        profile: { ...profile, runRecords: recentRuns },
        recentRuns,
      });
      return;
    }

    if (req.method === "POST" && req.url === "/leave") {
      const body = await readJson(req);
      const auth = authorizePlayerRequest(req, body);
      if (!auth.ok) {
        sendAuthorityError(res, auth);
        return;
      }
      acceptCommand(auth);
      const clientId = auth.authority.playerId;
      const player = runtime.players.get(clientId);
      if (!player) {
        sendJson(res, 404, { ok: false, error: "Unknown client" });
        return;
      }
      if (!player.isAI && !player.committedOutcome) {
        commitPlayerOutcome(player, player.status === "escaped" ? "escaped" : "abandoned");
      }
      runtime.players.delete(clientId);
      runtime.playerAuthorities.delete(clientId);
      telemetry.info("player.left", { sessionId: runtime.session.id, clientId, profileId: player.profileId, name: player.name, status: player.status });
      publishEvent("player.left", {
        clientId,
        name: player.name,
      });
      promoteHostIfNeeded();
      persistSessionRegistry();
      refreshBallparkMirror("player-left");
      sendJson(res, 200, { ok: true, session: runtime.session, playerCount: runtime.players.size });
      return;
    }

    if (req.method === "POST" && req.url === "/input") {
      const body = await readJson(req);
      if (runtime.session.status !== "running") {
        sendJson(res, 409, { ok: false, error: "No active session", session: runtime.session });
        return;
      }
      const message = normalizeInputMessage(body);
      const auth = authorizePlayerRequest(req, message);
      if (!auth.ok) {
        sendAuthorityError(res, auth);
        return;
      }
      acceptCommand(auth);
      const player = runtime.players.get(auth.authority.playerId);
      if (!player) {
        sendJson(res, 404, { ok: false, error: "Unknown client" });
        return;
      }
      if (message.seq <= player.lastInput.seq) {
        sendJson(res, 409, {
          ok: false,
          code: "stale-input",
          error: "Input sequence is not newer than the last accepted input",
          acceptedCommandSeq: auth.authority.lastCommandSeq,
          acceptedSeq: player.lastInput.seq,
        });
        return;
      }
      const acceptedSlingshotEdges = message.slingshotEdges.filter((edgeId) =>
        edgeId > (auth.authority.lastSlingshotEdgeId || 0)
      );
      if (acceptedSlingshotEdges.length > 0) {
        auth.authority.lastSlingshotEdgeId = acceptedSlingshotEdges[acceptedSlingshotEdges.length - 1];
      }
      const { commandCredential: _commandCredential, ...inputState } = message;
      player.lastInput = {
        ...inputState,
        slingshotEdges: mergePendingSlingshotEdges(player, acceptedSlingshotEdges),
        pulse: Boolean(player.lastInput.pulse || message.pulse),
        extractConfirm: Boolean(player.lastInput.extractConfirm || message.extractConfirm),
        consumeSlot:
          message.consumeSlot === null || message.consumeSlot === undefined
            ? player.lastInput.consumeSlot
            : message.consumeSlot,
      };
      sendJson(res, 200, {
        ok: true,
        acceptedCommandSeq: auth.authority.lastCommandSeq,
        acceptedSeq: message.seq,
        acceptedSlingshotEdges,
        pendingSlingshotEdgeCount: player.lastInput.slingshotEdges.length,
        tick: runtime.tick,
      });
      return;
    }

    if (req.method === "POST" && req.url === "/inventory/action") {
      const body = await readJson(req);
      if (runtime.session.status !== "running") {
        sendJson(res, 409, { ok: false, error: "No active session", session: runtime.session });
        return;
      }
      const message = normalizeInventoryAction(body);
      const auth = authorizePlayerRequest(req, message);
      if (!auth.ok) {
        sendAuthorityError(res, auth);
        return;
      }
      acceptCommand(auth);
      const player = runtime.players.get(auth.authority.playerId);
      if (!player) {
        sendJson(res, 404, { ok: false, error: "Unknown client" });
        return;
      }
      const result = applyInventoryAction(player, message);
      if (!result.ok) {
        sendJson(res, 409, { ok: false, error: result.error });
        return;
      }
      refreshBallparkMirror("inventory-action");
      sendJson(res, 200, {
        ok: true,
        acceptedCommandSeq: auth.authority.lastCommandSeq,
        player,
        snapshot: snapshotBody({ force: true }),
      });
      return;
    }

    if (req.method === "POST" && req.url === "/debug/player-state") {
      const body = await readJson(req);
      const clientId = String(body.clientId || "").trim();
      if (!clientId) {
        sendJson(res, 400, { ok: false, error: "clientId is required" });
        return;
      }
      const player = runtime.players.get(clientId);
      if (!player) {
        sendJson(res, 404, { ok: false, error: "Unknown client" });
        return;
      }
      applyDebugPlayerState(player, body);
      maybeEndTerminalSession("terminal-players");
      refreshBallparkMirror("debug-player-state");
      sendJson(res, 200, { ok: true, player, snapshot: snapshotBody({ force: true }) });
      return;
    }

    if (req.method === "POST" && req.url === "/debug/inhibitor-state") {
      const body = await readJson(req);
      const inhibitor = applyDebugInhibitorState(body);
      if (!inhibitor) {
        sendJson(res, 409, { ok: false, error: "No inhibitor runtime state" });
        return;
      }
      refreshBallparkMirror("debug-inhibitor-state");
      sendJson(res, 200, { ok: true, inhibitor, snapshot: snapshotBody({ force: true }) });
      return;
    }

    if (req.method === "POST" && req.url === "/debug/portal-state") {
      const body = await readJson(req);
      const portal = applyDebugPortalState(body);
      refreshBallparkMirror("debug-portal-state");
      sendJson(res, 200, { ok: true, portal, snapshot: snapshotBody({ force: true }) });
      return;
    }

    if (req.method === "POST" && req.url === "/debug/scavenger-state") {
      const body = await readJson(req);
      const scavengerId = String(body.scavengerId || "").trim();
      if (!scavengerId) {
        sendJson(res, 400, { ok: false, error: "scavengerId is required" });
        return;
      }
      const scavenger = runtime.mapState.scavengers.find((entry) => entry.id === scavengerId);
      if (!scavenger) {
        sendJson(res, 404, { ok: false, error: "Unknown scavenger" });
        return;
      }
      applyDebugScavengerState(scavenger, body);
      refreshBallparkMirror("debug-scavenger-state");
      sendJson(res, 200, { ok: true, scavenger, snapshot: snapshotBody({ force: true }) });
      return;
    }

    sendJson(res, 404, { ok: false, error: "Not found" });
  } catch (err) {
    sendJson(res, 500, { ok: false, error: err.message });
  }
});

server.on("error", (err) => {
  telemetry.error("runtime.error", { message: err.message });
  console.error(`[${LOG_LABEL}] ${err.message}`);
  cleanupFiles(PID_FILE, META_FILE);
  process.exit(1);
});

function shutdown() {
  if (tickHandle) clearInterval(tickHandle);
  clearTerminalShutdown();
  if (controlPlaneHeartbeat) clearInterval(controlPlaneHeartbeat);
  Promise.race([
    Promise.allSettled([
      Promise.allSettled(Array.from(pendingControlPlaneWrites)),
      controlPlane.unregisterSimInstance({ simInstanceId: SIM_INSTANCE_ID }).catch(() => null),
    ]),
    new Promise((resolve) => setTimeout(resolve, 1200)),
  ]).finally(() => {
    server.close(() => {
      cleanupFiles(PID_FILE, META_FILE);
      process.exit(0);
    });
  });
}

process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);
process.on("exit", () => cleanupFiles(PID_FILE, META_FILE));

server.listen(PORT, HOST, () => {
  writeFiles();
  telemetry.info("runtime.started", { url: `http://${HOST}:${PORT}/`, controlPlaneUrl: CONTROL_PLANE_URL, keepAlive: runtime.keepAlive, idleShutdownMs: runtime.idleShutdownMs });
  console.log(`[${LOG_LABEL}] listening on http://${HOST}:${PORT}/`);
  startSession();
  trackControlPlaneWrite(controlPlane.registerSimInstance({
    simInstanceId: SIM_INSTANCE_ID,
    url: `http://${HOST}:${PORT}/`,
    host: HOST,
    port: PORT,
  }));
  controlPlaneHeartbeat = setInterval(() => {
    trackControlPlaneWrite(controlPlane.heartbeatSimInstance({
      simInstanceId: SIM_INSTANCE_ID,
    }));
  }, 5000);
});
