#!/usr/bin/env node

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { performance } = require("perf_hooks");
const { createRuntimeLogger } = require("./runtime-telemetry.cjs");
const { createAuthorityDeadlineLoop } = require("./sim/authority-deadline-loop.cjs");
const { loadPlayableMaps } = require("./shared-map-loader.cjs");
const { getMapDurationSeconds, getPortalPlacementPolicy } = require("./content/map-scales.cjs");
const { createRNGStreams } = require("./rng-stream.cjs");
const { sanitizeRetiredItems } = require("./content/items.cjs");
const SEEDED_GEN = require("./seeded-generation.cjs");
const {
  buildCoarseFlowField,
  sampleCoarseFlowField,
  serializeCoarseFlowField,
} = require("./coarse-flow-field.cjs");
const {
  advanceSeededSea,
  createSeededSea,
  hashSeededSea,
} = require("./sim/seeded-sea.cjs");
const { decayWaveAmplitude, WAVE_HALF_LIFE_SECONDS } = require("./sim/event-wave.cjs");
const {
  NOISE_CONFIG,
  clampMeters,
  emitterAudibleFor,
  resolveContinuousRadius,
  resolveImpulseRadius,
  resolveNoiseSourceProjection,
  recordNoisePeak,
  enemyListenerStateFor,
} = require("./sim/noise-radius.cjs");
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
const {
  getSessionProfile,
  CLIENT_PERF_PROFILES,
} = require("./content/session-profiles.cjs");
const { MOVEMENT } = require("./content/movement.cjs");
const { getLegacySessionCompatibility } = require("./sim/session-compatibility.cjs");
const {
  buildPublicSnapshot,
  projectPublicSession,
} = require("./sim/public-snapshot.cjs");
const { simUnitsToMeters } = require("./content/units.cjs");
const {
  selectAnomalyCast,
  migrateCurrentWell,
} = require("./anomaly-catalog.cjs");
const {
  defaultRigLevels,
  normalizeRigLevels,
  BRAIN_DEFAULTS,
  normalizeHullType,
  normalizeProfileUpgrades,
  createPlayerBrain,
  syncPlayerNoiseModifiers,
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
const AUTHORITY_INTEGRATION_HZ = MOVEMENT.authority.integrationHz;
const { BODY_MASKS } = require("./sim/body-masks.cjs");
const { BODY_SCHEMA_VERSION } = require("./sim/body-schema.cjs");
const { createBallparkMirror } = require("./sim/ballpark-mirror.cjs");
const { createBenchAuthority } = require("./sim/bench-authority.cjs");
const { isBenchValidationError } = require("./sim/bench-errors.cjs");
const { resolveBenchGate } = require("./sim/bench-gate.cjs");
const { collectNearestBodies, collectRelevantBodies } = require("./sim/sim-queries.cjs");
const {
  applyPlayerBrakeAndIntegrate,
  applyPlayerDriveAndFlow,
  getHeatRatio,
  setHeatRatio,
} = require("./sim/player-movement-step.cjs");
const {
  WELL_GRAVITY_PARAMS,
  wellGravityMagnitude,
  wellGravityVector,
} = require("./sim/well-gravity.cjs");
const {
  singleCorrectionDelta: worldDisplacement,
  singleCorrectionDistance: worldDistance,
  sweptMovingCircleVsCircle,
  wrapPosition: wrapWorldPosition,
} = require("./sim/world-geometry.cjs");
const { createConductor } = require("./sim/conductor.cjs");
const {
  INHIBITOR_ECOLOGY_CONFIG,
  totalCapBlocksSpawn,
  createGlitchEntity,
  advanceGlitchEntity,
  applyGlitchForcesAndContacts,
  createSwarmEntity,
  advanceSwarmEntity,
  applySwarmContacts,
  createVesselEntity,
  advanceVesselEntity,
  applyVesselForcesAndContacts,
  shouldSpawnVessel,
  applyWellOverdrive,
  effectiveWellMass,
  summarizeEcologyEncounters,
  shouldSpawnSwarm,
  shouldSpawnGlitch,
} = require("./sim/inhibitor-ecology.cjs");
const {
  beginForceLedger,
  finalizeForceLedger,
  recordForceDeltaV,
  recordForceMutation,
  setForceLedgerDt,
} = require("./sim/force-ledger.cjs");
const {
  INTERNAL: SLINGSHOT_INTERNAL,
  SLINGSHOT_VALUES,
  boundedReleaseDelta,
  captureRadiusWorld,
  coyoteWindowOpen,
  engageEligible: slingshotEngageEligible,
  effectiveCoyoteTimeMs,
  quarterTurnsFromArc,
  releaseSpeedCap,
  resolveChainCount,
  rotateToward,
  signedAngle,
  tangentialSpeed,
} = require("./sim/slingshot-contract.cjs");
const { createSimEventJournal } = require("./sim-event-journal.cjs");
const { createSimSnapshotRing } = require("./sim-snapshot-ring.cjs");
const { serializeRuntimeJson } = require("./sim/serialization-budget.cjs");
const { createJsonHttpLifecycle } = require("./sim/http-lifecycle.cjs");
const {
  createIdleSessionState,
  createRunningSessionState,
  createInhibitorState,
  createRunState,
} = require("./sim/session-state.cjs");
const {
  createCollapseEpochSchedule,
  createCollapseEpochState,
  advanceCollapseEpochs,
} = require("./sim/collapse-epochs.cjs");
const { calculateWellGrowth, createWellGrowthEvent } = require("./sim/well-growth.cjs");

const PLAYABLE_MAPS = loadPlayableMaps();
const PORTAL_CONFIG = Object.freeze({
  captureRadius: 0.08,
  schedule: Object.freeze({
    // Whole-run fronts are normalized against the selected map duration.
    graceProgress: 0.075,
    cadenceProgress: 0.20,
    offsetGuardSeconds: 10,
    optionalWindows: Object.freeze([
      { count: [2, 3], types: ["standard"], durationSeconds: 90 },
      { count: [1, 2], types: ["standard", "unstable"], durationSeconds: 75 },
      { count: [1, 2], types: ["standard", "rift"], durationSeconds: 60 },
      { count: [1, 1], types: ["unstable"], durationSeconds: 45 },
      { count: [1, 1], types: ["standard"], durationSeconds: 30 },
    ]),
    latePhaseRules: Object.freeze([
      { minInhibitorPhase: 2, countMultiplier: 0.5, durationMultiplier: 0.8 },
      { minInhibitorPhase: 3, countMultiplier: 0, durationMultiplier: 0.6 },
    ]),
    finalExfilDuration: readNumber(process.env.LBH_SIM_FINAL_EXFIL_DURATION, 60, 1),
    placementAttempts: 128,
  }),
});
const AUTHORITY_INPUT_CONFIG = Object.freeze({
  heldInputTimeoutMs: readNumber(process.env.LBH_SIM_HELD_INPUT_TIMEOUT_MS, 750, 1),
});
const PLAYER_CARGO_SLOTS = 8;
// This is an explicit fixture/test override. Product durations come only from
// the selected map's canonical content registry.
const MATCH_MAX_SIM_TIME_OVERRIDE = process.env.LBH_SIM_MAX_SIM_TIME === undefined
  ? null
  : readNumber(process.env.LBH_SIM_MAX_SIM_TIME, null, 1);
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
  "Silent", "Fractured", "Prismatic", "Hollow", "Echoing",
];
const WRECK_NOUNS = [
  "Chorus", "Lattice", "Meridian", "Archive", "Theorem",
  "Garden", "Beacon", "Chrysalis", "Mandate", "Confluence",
  "Helix", "Axiom", "Tempest", "Orbit", "Zenith",
];
const WRECK_PREFIXES = ["Wreck", "Remains", "Hulk"];

function generateWreckName(rng) {
  const pick = (list) => list[Math.floor(rng() * list.length)] || list[0];
  return `${pick(WRECK_PREFIXES)} of the ${pick(WRECK_ADJECTIVES)} ${pick(WRECK_NOUNS)}`;
}

function readNumber(value, fallback, min = -Infinity) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(min, parsed);
}

function resolveRunDurationSeconds(mapId) {
  const canonical = Number(getMapDurationSeconds(mapId));
  if (!Number.isFinite(canonical) || canonical <= 0) {
    throw new Error(`Map ${mapId} has no canonical run duration`);
  }
  return MATCH_MAX_SIM_TIME_OVERRIDE == null
    ? canonical
    : MATCH_MAX_SIM_TIME_OVERRIDE;
}

// Wrappers around seeded-generation.js that route through runtime streams.
// All init-time loot rolls flow through runtime.session.rng, which is
// seeded from runtime.session.seed. Same seed → same initial loot.

function currentRNG(streamName) {
  if (!runtime.session?.rng) {
    throw new Error(`Seeded sim RNG requested before session stream setup: ${streamName}`);
  }
  return runtime.session.rng.rawStream(streamName);
}

function nextSeededToken(prefix, streamName = "authorityIds") {
  const value = Math.floor(currentRNG(streamName)() * 0x100000000).toString(36);
  return `${prefix}-${value}`;
}

function rollTier(sessionTime, streamName = 'loot') {
  const bias = runtime.session?.lootQualityBias || 1.0;
  return SEEDED_GEN.rollTier(currentRNG(streamName), sessionTime, bias);
}

function rollItem(tier, streamName = 'loot') {
  const item = SEEDED_GEN.rollItem(currentRNG(streamName), tier);
  if (!item) return null;
  return { ...item, instanceId: nextSeededToken("item") };
}

function generateWreckLoot(sessionTime, slotCount, streamName = 'loot') {
  const rng = currentRNG(streamName);
  const bias = runtime.session?.lootQualityBias || 1.0;
  const items = SEEDED_GEN.generateWreckLoot(rng, sessionTime, slotCount, bias);
  // Stamp cosmetic instance IDs after rolling so instance IDs don't affect RNG order
  for (const item of items) {
    const prefix = item.effect ? 'cons' : 'item';
    item.instanceId = nextSeededToken(prefix);
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
};
const SERVER_WELLS = {
  shipPullStrength: WELL_GRAVITY_PARAMS.player.strength,
  shipPullFalloff: WELL_GRAVITY_PARAMS.player.falloff,
  maxRange: WELL_GRAVITY_PARAMS.player.maxRange,
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
  waveHalfLife: WAVE_HALF_LIFE_SECONDS,
  waveMaxRadius: 2.0,
  waveShipPush: 0.8,
  growthWaveAmplitude: 1.0,
};
const SLINGSHOT_SERVER = Object.freeze({
  // Exactly five player-facing gameplay knobs. The values/ranges/steps live
  // in slingshot-contract.cjs; the remaining fields are implementation-only.
  captureRadius: SLINGSHOT_VALUES.captureRadius,
  magnetism: SLINGSHOT_VALUES.magnetism,
  coyoteTime: SLINGSHOT_VALUES.coyoteTime,
  payoffCurve: SLINGSHOT_VALUES.payoffCurve,
  chainWindow: SLINGSHOT_VALUES.chainWindow,
  internal: SLINGSHOT_INTERNAL,
  massWeight: Object.freeze({ well: 1.0, star: 0.6, planetoid: 0.3 }),
});
const INHIBITOR_CONFIG = {
  // The prior Expanse schedule is 90/180/270 seconds on a 600-second run.
  // These normalized fronts preserve that anchor on every map tier.
  phaseProgresses: Object.freeze([0, 0.15, 0.30, 0.45]),
  phaseWaveBudgets: [0, 1, 2, 3],
};

function inhibitorPhaseProgress(phase) {
  return INHIBITOR_CONFIG.phaseProgresses[Math.max(0, Math.min(3, phase))] || 0;
}

function inhibitorPhaseAtProgress(progress) {
  for (let phase = 3; phase >= 1; phase -= 1) {
    if (progress >= inhibitorPhaseProgress(phase)) return phase;
  }
  return 0;
}

function latePortalRuleForPhase(phase) {
  return PORTAL_CONFIG.schedule.latePhaseRules.reduce((selected, rule) => {
    return phase >= rule.minInhibitorPhase ? rule : selected;
  }, { minInhibitorPhase: 0, countMultiplier: 1, durationMultiplier: 1 });
}

function scalePortalCountRange(countRange, multiplier) {
  if (multiplier <= 0) return [0, 0];
  const min = Math.max(0, Math.ceil(countRange[0] * multiplier));
  const max = Math.max(min, Math.floor(countRange[1] * multiplier));
  return [min, max];
}

function portalWindowMetadata(
  declaration,
  index,
  phase,
  openProgress,
  requestedOpenProgress = openProgress,
  portalPlacement,
) {
  const lateRule = latePortalRuleForPhase(phase);
  return {
    system: "portals",
    kind: "optional",
    windowIndex: index,
    openProgress,
    requestedOpenProgress,
    phaseAtOpen: phase,
    countRange: declaration.count.slice(),
    effectiveCountRange: scalePortalCountRange(declaration.count, lateRule.countMultiplier),
    types: declaration.types.slice(),
    baseDurationSeconds: declaration.durationSeconds,
    durationMultiplier: lateRule.durationMultiplier,
    durationSeconds: declaration.durationSeconds * lateRule.durationMultiplier,
    latePhaseRule: lateRule,
    portalPlacementPolicyId: portalPlacement.policyId,
    spawnRadiusBands: portalPlacement.spawnRadiusBands,
    minPortalSpacing: portalPlacement.minPortalSpacing,
    finalExfil: false,
  };
}

function createInhibitorConductor(seed, runDurationSeconds, mapId) {
  const duration = Number(runDurationSeconds);
  if (!Number.isFinite(duration) || duration <= 0) {
    throw new RangeError("runDurationSeconds must be greater than zero");
  }
  const portalPlacement = getPortalPlacementPolicy(mapId);
  const conductor = createConductor({
    seed,
    conductorId: "match-conductor",
    offsetGuardSeconds: PORTAL_CONFIG.schedule.offsetGuardSeconds,
    matchDurationSeconds: duration,
  });
  const resolvedGuardSeconds = conductor.getSchedule().offsetGuardSeconds;
  let previousRegisteredPhaseTime = 0;
  conductor.registerEventFront({
    id: "inhibitor:phase-0",
    time: 0,
    kind: "inhibitor.phase",
    metadata: {
      system: "inhibitor",
      phase: 0,
      tier: 0,
      scheduledTime: 0,
      budget: INHIBITOR_CONFIG.phaseWaveBudgets[0],
    },
  });

  for (let phase = 1; phase <= 3; phase += 1) {
    const progress = inhibitorPhaseProgress(phase);
    const scheduledTime = duration * progress;
    if (scheduledTime - previousRegisteredPhaseTime < resolvedGuardSeconds) continue;
    conductor.scheduleSeverityWaves({
      waveIdPrefix: `inhibitor:phase-${phase}`,
      startTime: scheduledTime,
      cadence: duration * 0.15,
      count: 1,
      budget: INHIBITOR_CONFIG.phaseWaveBudgets[phase],
      tier: phase,
      metadata: {
        system: "inhibitor",
        phase,
        progress,
        scheduledTime,
      },
    });
    previousRegisteredPhaseTime = scheduledTime;
  }

  const guardSeconds = PORTAL_CONFIG.schedule.offsetGuardSeconds;
  const inhibitorFrontTimes = INHIBITOR_CONFIG.phaseProgresses.map(
    (progress) => duration * progress,
  );
  let previousOptionalCloseTime = null;
  const optionalWindows = PORTAL_CONFIG.schedule.optionalWindows.flatMap((declaration, index) => {
    const requestedOpenProgress =
      PORTAL_CONFIG.schedule.graceProgress + PORTAL_CONFIG.schedule.cadenceProgress * index;
    const requestedOpenTime = duration * requestedOpenProgress;
    if (requestedOpenTime + declaration.durationSeconds > duration) {
      return [];
    }

    // Portal targets stay normalized, but the pre-existing absolute guard
    // may move a short-tier opening forward when it meets an epoch front.
    let openTime = Math.max(
      requestedOpenTime,
      previousOptionalCloseTime === null ? 0 : previousOptionalCloseTime + guardSeconds,
    );
    for (let attempt = 0; attempt < 16; attempt += 1) {
      const phase = inhibitorPhaseAtProgress(openTime / duration);
      const durationSeconds = portalWindowMetadata(
        declaration,
        index,
        phase,
        openTime / duration,
        requestedOpenProgress,
        portalPlacement,
      ).durationSeconds;
      let nextOpenTime = openTime;
      for (const frontTime of inhibitorFrontTimes) {
        if (Math.abs(nextOpenTime - frontTime) < guardSeconds) {
          nextOpenTime = Math.max(nextOpenTime, frontTime + guardSeconds);
        }
        if (Math.abs(nextOpenTime + durationSeconds - frontTime) < guardSeconds) {
          nextOpenTime = Math.max(nextOpenTime, frontTime + guardSeconds);
        }
      }
      if (nextOpenTime === openTime) {
        break;
      }
      openTime = nextOpenTime;
    }

    const openProgress = openTime / duration;
    const phase = inhibitorPhaseAtProgress(openProgress);
    const metadata = portalWindowMetadata(
      declaration,
      index,
      phase,
      openProgress,
      requestedOpenProgress,
      portalPlacement,
    );
    previousOptionalCloseTime = openTime + metadata.durationSeconds;
    return [{
      openTime,
      durationSeconds: metadata.durationSeconds,
      metadata,
    }];
  });
  if (optionalWindows.length > 0) {
    conductor.scheduleWindows({
      idPrefix: "portal:optional",
      openTimes: optionalWindows.map((window) => window.openTime),
      count: optionalWindows.length,
      durations: optionalWindows.map((window) => window.durationSeconds),
      metadata: optionalWindows.map((window) => window.metadata),
    });
  }
  conductor.scheduleWindows({
    idPrefix: "portal:final-exfil",
    startTime: duration,
    cadence: 1,
    count: 1,
    durations: PORTAL_CONFIG.schedule.finalExfilDuration,
    metadata: {
      system: "portals",
      kind: "final-exfil",
      windowIndex: optionalWindows.length,
      openProgress: 1,
      phaseAtOpen: inhibitorPhaseAtProgress(1),
      countRange: [1, 1],
      effectiveCountRange: [1, 1],
      types: ["standard"],
      baseDurationSeconds: PORTAL_CONFIG.schedule.finalExfilDuration,
      durationMultiplier: 1,
      durationSeconds: PORTAL_CONFIG.schedule.finalExfilDuration,
      latePhaseRule: { minInhibitorPhase: 0, countMultiplier: 1, durationMultiplier: 1 },
      portalPlacementPolicyId: portalPlacement.policyId,
      spawnRadiusBands: portalPlacement.spawnRadiusBands,
      minPortalSpacing: portalPlacement.minPortalSpacing,
      finalExfil: true,
    },
  });
  return conductor;
}

const FAUNA_CONFIG = {
  maxTotal: 60,
  // Drift Jellies — ambient, always present
  jellyCount: 6,
  jellySpawnInterval: 8,
  jellyLifespan: [40, 60],
  jellyBumpForce: 0.005,
  jellySize: 3,
  // Noise listeners — local fauna, not global signal-seeking spawns.
  bloomSpawnRange: [0.3, 0.6],
  bloomLifespan: [20, 40],
  bloomBumpForce: 0.006,
  bloomSize: 2,
  // The former 0.99/tick drag was authored at the 15 Hz authority cadence.
  // Store its equivalent per-second retention so the unit stays explicit.
  dragRetentionPerSecond: Math.pow(0.99, MOVEMENT.authority.integrationHz),
  bloomSpawnRatePerSecond: 0.35,
  bloomListenerSensitivity: 1.0,
  jellyListenerSensitivity: 0.7,
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
  bumpNoiseMeters: 300,         // noise impulse on lunge contact
  segments: 4,                 // body segments for rendering
  color: [0, 255, 136],        // #00FF88 bright mint
};

const AI_PLAYER_CONFIG = {
  decisionInterval: 0.8,      // seconds between tactical decisions
  strategicInterval: 3.0,     // seconds between extraction re-evaluation
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

const httpLifecycle = createJsonHttpLifecycle({
  serialize: serializeRuntimeJson,
  allowedHeaders: [AUTHORITY_HEADER, PLAYER_ID_HEADER, RUN_ID_HEADER],
});
const { readJson, sendJson } = httpLifecycle;

async function handleBenchRoute(req, res, handler) {
  try {
    const body = await readJson(req);
    sendJson(res, 200, await handler(body));
  } catch (error) {
    if (error instanceof SyntaxError || isBenchValidationError(error)) {
      sendJson(res, 400, { ok: false, code: "bench-validation", error: error.message });
      return;
    }
    throw error;
  }
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

// Several legacy content paths intentionally keep [-scale/2, scale/2)
// coordinates. Toroidal math accepts both representations, but wrapping them
// into [0, scale) here would change snapshots and seeded outcomes.
function wrapCenteredCoordinate(value, worldScale) {
  const half = worldScale / 2;
  let wrapped = value;
  while (wrapped < -half) wrapped += worldScale;
  while (wrapped >= half) wrapped -= worldScale;
  return wrapped;
}

function worldDirection(ax, ay, bx, by, worldScale) {
  const dx = worldDisplacement(ax, bx, worldScale);
  const dy = worldDisplacement(ay, by, worldScale);
  const dist = Math.hypot(dx, dy);
  if (dist < 0.000001) return { dist, nx: 0, ny: 0 };
  return { dist, dx, dy, nx: dx / dist, ny: dy / dist };
}

function inversePowerForce(dist, strength, mass, falloff, maxRange) {
  return wellGravityMagnitude("player", dist, mass, {
    strength,
    falloff,
    maxRange,
    zeroDistanceThreshold: 0.001,
  });
}

function proximityForce(dist, strength, radius) {
  if (dist < 0.001 || dist > radius) return 0;
  return strength * (1 - dist / radius);
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
    planetoid.wx = wrapCenteredCoordinate(
      well.wx + Math.cos(planetoid.t + planetoid.pathData.tilt) * planetoid.pathData.semiA,
      worldScale
    );
    planetoid.wy = wrapCenteredCoordinate(
      well.wy + Math.sin(planetoid.t) * planetoid.pathData.semiB,
      worldScale
    );
  } else if (planetoid.type === "figure8") {
    const wellA = wells[planetoid.pathData.wellA];
    const wellB = wells[planetoid.pathData.wellB];
    if (!wellA || !wellB) return;
    const dx = worldDisplacement(wellA.wx, wellB.wx, worldScale);
    const dy = worldDisplacement(wellA.wy, wellB.wy, worldScale);
    const midWX = wrapCenteredCoordinate(wellA.wx + dx / 2, worldScale);
    const midWY = wrapCenteredCoordinate(wellA.wy + dy / 2, worldScale);
    planetoid.t += planetoid.pathData.speed * dt;
    planetoid.wx = wrapCenteredCoordinate(midWX + (dx / 2) * Math.sin(planetoid.t), worldScale);
    planetoid.wy = wrapCenteredCoordinate(midWY + (dy / 2) * Math.sin(planetoid.t * 2), worldScale);
  } else if (planetoid.type === "transit") {
    planetoid.age += dt;
    planetoid.wx = wrapCenteredCoordinate(planetoid.wx + planetoid.vx * dt, worldScale);
    planetoid.wy = wrapCenteredCoordinate(planetoid.wy + planetoid.vy * dt, worldScale);
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
  if (!rngStreams) throw new Error("Map state cloning requires seeded RNG streams");
  const map = PLAYABLE_MAPS[mapId];
  if (!map) throw new Error(`Unknown active map id: ${mapId}`);
  const parsedWorldScale = worldScaleOverride == null ? NaN : Number(worldScaleOverride);
  if (Number.isFinite(parsedWorldScale) && parsedWorldScale !== map.worldScale) {
    throw new Error(`Map ${map.id} is canonical at ${map.worldScale} world units; scale override ${parsedWorldScale} rejected`);
  }
  const worldScale = map.worldScale;
  const anomalyCatalog = selectAnomalyCast({
    mapId: map.id,
    seed: rngStreams.seed,
    wellCount: map.wells.length,
    rngStreams,
  });
  const growthRng = rngStreams.rawStream('wellGrowthVar');
  const wells = map.wells.map((well, index) => migrateCurrentWell({
    ...well,
    catalogId: anomalyCatalog.cast[index]?.catalogId,
    baseKillRadius: well.killRadius,
    startMass: well.mass,
    growthRate: ((well.growthRate ?? WELL_GROWTH_AMOUNT) + (growthRng() * 2 - 1) * WELL_GROWTH_VARIANCE)
      * (anomalyCatalog.cast[index]?.fabricSignature?.parameters?.growthRateMultiplier ?? 1),
    killRadius: well.killRadius,
  }, anomalyCatalog.cast[index]?.catalogId)).map((well) => ({
    ...well,
    overdriveTier: 0,
    overdriveMultiplier: 1,
    overdriveSource: null,
    overdriveTime: null,
  }));
  const stars = map.stars.map((star) => ({
    ...star,
    alive: star.alive !== false,
    driftVX: star.driftVX ?? 0,
    driftVY: star.driftVY ?? 0,
  }));
  const initialLootStream = rngStreams.rawStream('initialWreckLoot');
  const initialNameStream = rngStreams.rawStream('initialWreckNames');
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
    mapClass: map.mapClass,
    profileId: map.profileId,
    dimensions: { ...map.dimensions },
    name: map.name,
    worldScale,
    fluidResolution: map.fluidResolution,
    anomalyCatalog,
    wells,
    stars,
    wrecks,
    planetoids,
    portals: [],
    nextPortalWindowIndex: 0,
    nextPortalWaveIndex: 0,
    scavengers: [],
  };
}

function cloneRetiredSafeItems(list = []) {
  return sanitizeRetiredItems(list);
}

function portalCaptureRadius(portal) {
  const base = PORTAL_CONFIG.captureRadius;
  if (portal.type === "unstable") return base * 0.5;
  if (portal.type === "rift") return base * 1.8;
  return base;
}

function isPortalAvailable(portal) {
  return Boolean(portal && portal.alive !== false);
}

function generateScavengerIdentity(archetype) {
  const rng = currentRNG('scavNames');
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
  const rng = session?.rng?.rawStream('scavSpawn');
  if (!rng) throw new Error("Scavenger spawning requires seeded RNG streams");
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

function portalSpawnAnchor(anchorName, worldScale) {
  if (anchorName === "map-center") return { wx: worldScale / 2, wy: worldScale / 2 };
  throw new RangeError(`Unknown portal spawn anchor: ${anchorName}`);
}

function portalSpawnBand(portalType, finalExfil = false) {
  const bands = runtime.portalPlacement?.spawnRadiusBands;
  if (!bands) throw new RangeError("Portal placement policy is not initialized");
  const band = finalExfil ? bands.finalExfil : bands[portalType];
  if (!band) throw new RangeError(`No portal spawn radius band for ${portalType}`);
  return band;
}

function portalPlacementIsValid(position, portalType, band, { finalExfil = false } = {}) {
  const worldScale = runtime.session.worldScale;
  const epsilon = 1e-9;
  if (position.distance < band.minRadius - epsilon || position.distance > band.maxRadius + epsilon) return false;

  if (!finalExfil) {
    const nearestPortal = runtime.mapState.portals.reduce((nearest, portal) => {
      if (portal.alive === false) return nearest;
      return Math.min(nearest, worldDistance(position.wx, position.wy, portal.wx, portal.wy, worldScale));
    }, Infinity);
    if (nearestPortal < (runtime.portalPlacement?.minPortalSpacing || 0)) return false;
  }

  const nearestWell = runtime.mapState.wells.reduce((nearest, well) => {
    return Math.min(nearest, worldDistance(position.wx, position.wy, well.wx, well.wy, worldScale));
  }, Infinity);
  const nearestWellClearance = runtime.mapState.wells.reduce((nearest, well) => {
    const clearance = worldDistance(position.wx, position.wy, well.wx, well.wy, worldScale)
      - Math.max(0, Number(well.killRadius) || 0);
    return Math.min(nearest, clearance);
  }, Infinity);
  if (finalExfil) return nearestWellClearance >= band.minWellClearance;
  if (band.minWellDistance !== undefined && nearestWell < band.minWellDistance) return false;
  if (band.maxWellDistance !== undefined && nearestWell > band.maxWellDistance) return false;
  return true;
}

function findPortalSpawnPosition(portalType, window, portalIndex, { finalExfil = false } = {}) {
  const worldScale = runtime.session.worldScale;
  const band = portalSpawnBand(portalType, finalExfil);
  const anchor = portalSpawnAnchor(band.anchor, worldScale);
  const windowId = window.windowId;
  const attemptCount = PORTAL_CONFIG.schedule.placementAttempts;
  for (let attempt = 0; attempt < attemptCount; attempt += 1) {
    const position = runtime.conductor.selectToroidalSpawn({
      streamName: `portal.spawn.${windowId}.${portalIndex}.attempt-${attempt}`,
      anchor,
      worldScale,
      minRadius: band.minRadius,
      maxRadius: band.maxRadius,
    });
    if (portalPlacementIsValid(position, portalType, band, { finalExfil })) {
      return { ...position, anchorName: band.anchor, minRadius: band.minRadius, maxRadius: band.maxRadius };
    }
  }

  // The seeded attempts carry normal placement variation. The final exfil
  // also gets a bounded angular/radial scan so a bad roll cannot erase its
  // guarantee or escape the declared radius band.
  const fallbackRings = finalExfil ? 8 : 2;
  const fallbackAngles = finalExfil ? 256 : 64;
  for (let ring = 0; ring < fallbackRings; ring += 1) {
    const radius = band.minRadius + (band.maxRadius - band.minRadius) * ((ring + 0.5) / fallbackRings);
    for (let angleIndex = 0; angleIndex < fallbackAngles; angleIndex += 1) {
      const position = runtime.conductor.selectToroidalSpawn({
        streamName: `portal.spawn.${windowId}.${portalIndex}.fallback-${ring}-${angleIndex}`,
        anchor,
        worldScale,
        minRadius: band.minRadius,
        maxRadius: band.maxRadius,
        angle: (Math.PI * 2 * angleIndex) / fallbackAngles,
        radius,
      });
      if (portalPlacementIsValid(position, portalType, band, { finalExfil })) {
        return { ...position, anchorName: band.anchor, minRadius: band.minRadius, maxRadius: band.maxRadius };
      }
    }
  }
  throw new RangeError(
    `No valid ${finalExfil ? "final exfil" : portalType} portal position in declared radius band `
    + `[${band.minRadius}, ${band.maxRadius}] for ${windowId}`
  );
}
const args = parseArgs(process.argv.slice(2));
const BENCH_GATE = resolveBenchGate({ args });
const benchAuthority = BENCH_GATE.enabled ? createBenchAuthority() : null;
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
]);

const protocol = createProtocolDescription();
const runtime = {
  startedAt: new Date().toISOString(),
  session: createIdleSessionState({
    movementHz: DEFAULT_TICK_HZ,
    snapshotHz: DEFAULT_SNAPSHOT_HZ,
    worldScale: DEFAULT_WORLD_SCALE,
    maxPlayers: DEFAULT_MAX_PLAYERS,
  }),
  tick: 0,
  simTime: 0,
  loopTickHz: DEFAULT_TICK_HZ,
  eventJournal: createSimEventJournal({ capacity: 256, runId: "idle" }),
  snapshotRing: createSimSnapshotRing({ capacity: 32, runId: "idle" }),
  recentEvents: [],
  players: new Map(),
  playerAuthorities: new Map(),
  joinClaims: new Map(),
  idCounters: Object.create(null),
  waveRings: [],
  ballparkMirror: createBallparkMirror({ worldScale: DEFAULT_WORLD_SCALE }),
  ballparkRelevance: { mode: "not-run", tick: null, categories: {} },
  coarseField: null,
  authorityFieldPacket: null,
  collapseEpochSchedule: [],
  collapseEpochState: null,
  conductor: null,
  inhibitorSchedule: null,
  portalSchedule: null,
  portalPlacement: null,
  portalClock: null,
  inhibitor: createInhibitorState(),
  inhibitorEntities: [],
  inhibitorEcology: {
    glitchSequence: 0,
    nextGlitchSpawnAt: null,
    swarmSequence: 0,
    nextSwarmSpawnAt: null,
    vesselSequence: 0,
    nextVesselSpawnAt: null,
    suppressedByTotalCap: { glitch: 0, swarm: 0, vessel: 0 },
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
    nextPortalWindowIndex: 0,
  },
  overload: null,
  keepAlive: KEEP_ALIVE,
  idleShutdownMs: IDLE_SHUTDOWN_MS,
  terminalSince: null,
  terminalShutdownAt: null,
  shutdownReason: null,
};

let tickLoop = null;
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

function summarizeTickTimings() {
  const samples = Array.isArray(runtime.tickTimingsMs) ? runtime.tickTimingsMs : [];
  if (samples.length === 0) return { sampleCount: 0, p50Ms: 0, p95Ms: 0, maxMs: 0 };
  const ordered = samples.slice().sort((a, b) => a - b);
  const percentile = (fraction) => ordered[Math.min(ordered.length - 1, Math.ceil(ordered.length * fraction) - 1)];
  return {
    sampleCount: samples.length,
    p50Ms: Number(percentile(0.50).toFixed(3)),
    p95Ms: Number(percentile(0.95).toFixed(3)),
    maxMs: Number(ordered[ordered.length - 1].toFixed(3)),
  };
}

function recordTickTiming(tickCostMs) {
  runtime.tickTimingsMs.push(Math.max(0, Number(tickCostMs) || 0));
  if (runtime.tickTimingsMs.length > 256) runtime.tickTimingsMs.shift();
}

function applyOverloadProfile() {
  if (!runtime.overload) return;
  const projection = projectOverloadBudget(runtime.overload.base, runtime.overload.state);
  runtime.session.overloadState = projection.overloadState;
  runtime.session.overloadPressure = Number(runtime.overload.pressure || 0);
  runtime.session.timeScale = 1;
  runtime.session.tickHz = AUTHORITY_INTEGRATION_HZ;
  runtime.session.snapshotHz = projection.snapshotHz;
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
  const prevHeatRatio = getHeatRatio(player);
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
  syncPlayerNoiseModifiers(player);
  syncPlayerCargoCapacity(player);
  applyPlayerDeltaVBrain(player, { previousHeatRatio: prevHeatRatio });
  return player.brain;
}

function applyPlayerDeltaVBrain(player, { previousHeatRatio = null } = {}) {
  const brain = player.brain || BRAIN_DEFAULTS;
  const heatRatio = Number.isFinite(previousHeatRatio)
    ? previousHeatRatio
    : getHeatRatio(player);
  player.deltaVMax = Math.max(1, Number(brain.deltaVMax) || BRAIN_DEFAULTS.deltaVMax);
  player.deltaVRegen = Math.max(0, Number(brain.deltaVRegen) || 0);
  player.deltaVRegenBoost = Math.max(0, Number(brain.deltaVRegenBoost) || 0);
  player.deltaVBurnEff = Math.max(0.1, Number(brain.deltaVBurnEff) || 1);
  player.deltaVBurnRate = Math.max(1, Number(brain.deltaVBurnRate) || BRAIN_DEFAULTS.deltaVBurnRate);
  setHeatRatio(player, heatRatio);
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
  const player = {
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
      receivedAt: Date.now(),
    },
    status: "alive",
    hullDamage: 0,
    cargo: new Array(brain.cargoSlots).fill(null),
    equipped: cloneRetiredSafeItems(options.equipped),
    consumables: cloneRetiredSafeItems(options.consumables),
    activeEffects: [],
    effectState: {
      shieldCharges: 0,
      pulseCooldownRemaining: 0,
      hullGraceRemaining: 0,
    },
    _wellGraceContactActive: false,
    _wellGraceLastTick: -1,
    noise: {
      audibleRadiusMeters: 0,
      previousRadiusMeters: 0,
      trend: "steady",
      currentSource: "IDLE",
      dominantSource: "IDLE",
      sourceClass: null,
      listeners: [],
      heardListenerCount: 0,
      trackedListenerCount: 0,
      lockedOnListenerCount: 0,
      lastHeardPosition: null,
      maxAudibleRadiusMeters: 0,
      timeHeardSeconds: 0,
      timeTrackedSeconds: 0,
      continuousRadiusMeters: 0,
      continuousSource: "IDLE",
      continuousSourceClass: null,
      impulses: [],
    },
    portalInteraction: null,
    slingshot: {
      phase: "idle",
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
      entryVX: 0,
      entryVY: 0,
      lockedVX: 0,
      lockedVY: 0,
      bendDegrees: 0,
      arcRadians: 0,
      previousRadialX: 0,
      previousRadialY: 0,
      aimAnchorKey: null,
      aimAnchorId: null,
      aimAnchorType: null,
      aimAnchorWX: null,
      aimAnchorWY: null,
      aimAnchorRange: 0,
      aimDistance: 0,
      lastAimSeenTime: -Infinity,
      coyoteUntil: 0,
      coyoteActive: false,
      lockTick: -1,
      lockUntil: 0,
      releaseGhostUntil: 0,
      releaseGhost: null,
      lastPayoff: null,
    },
    committedOutcome: null,
    deltaV: brain.deltaVMax || BRAIN_DEFAULTS.deltaVMax,
    deltaVMax: brain.deltaVMax || BRAIN_DEFAULTS.deltaVMax,
    deltaVRegen: brain.deltaVRegen || BRAIN_DEFAULTS.deltaVRegen,
    deltaVRegenBoost: brain.deltaVRegenBoost || BRAIN_DEFAULTS.deltaVRegenBoost,
    deltaVBurnEff: brain.deltaVBurnEff || BRAIN_DEFAULTS.deltaVBurnEff,
    deltaVBurnRate: brain.deltaVBurnRate || BRAIN_DEFAULTS.deltaVBurnRate,
    timeSinceThrust: 999,
    deltaVRecovering: false,
    heat: 0,
    heatRatio: 0,
    overheatRemaining: 0,
  };
  syncPlayerNoiseModifiers(player);
  return player;
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
  const seed = Number.isFinite(Number(config.seed))
    ? Number(config.seed)
    : crypto.randomInt(1, 1_000_000_000);
  const rngStreams = createRNGStreams(seed);
  const mapState = cloneMapState(requestedMapId, requestedWorldScale, rngStreams);
  const scaleProfile = getSessionProfile(mapState.id, mapState.worldScale);
  const runDurationSeconds = resolveRunDurationSeconds(mapState.id);
  const snapshotHz = Number.isFinite(Number(config.snapshotHz))
    ? Number(config.snapshotHz)
    : scaleProfile.snapshotHz;
  runtime.session = createRunningSessionState({
    sessionId: crypto.randomUUID(),
    runId: crypto.randomUUID(),
    mapState,
    runDurationSeconds,
    host: {
      clientId: config.requesterId ? String(config.requesterId) : null,
      profileId: config.requesterProfileId
        ? String(config.requesterProfileId)
        : (config.hostProfileId ? String(config.hostProfileId) : null),
      name: config.requesterName ? String(config.requesterName) : null,
    },
    movementHz: AUTHORITY_INTEGRATION_HZ,
    snapshotHz,
    profile: scaleProfile,
    clientProfile: CLIENT_PERF_PROFILES[scaleProfile.clientPerfProfile],
    maxPlayers: Number.isFinite(Number(config.maxPlayers))
      ? Number(config.maxPlayers)
      : DEFAULT_MAX_PLAYERS,
  });
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
  runtime.session.seededSea = createSeededSea({
    seed,
    mapId: mapState.id,
    worldScale: mapState.worldScale,
    wells: mapState.wells,
    rngStreams: runtime.session.rng,
  });
  runtime.session.seededSeaHash = hashSeededSea(runtime.session.seededSea);

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
  const runState = createRunState();
  Object.assign(runtime, runState.clock);
  // The Conductor is one match-scoped authority built from the run seed. Its
  // portal geometry comes from the same map-scale registry as the session.
  runtime.portalPlacement = getPortalPlacementPolicy(runtime.session.mapId);
  runtime.conductor = createInhibitorConductor(
    runtime.session.seed,
    runtime.session.runDurationSeconds,
    runtime.session.mapId,
  );
  runtime.inhibitorSchedule = runtime.conductor.getSchedule();
  runtime.portalClock = runState.portalClock;
  const inh = INHIBITOR_CONFIG;
  const phaseZero = runtime.inhibitorSchedule.eventFronts.find((event) => event.id === "inhibitor:phase-0");
  runtime.inhibitor = createInhibitorState({
    phaseZero,
    config: inh,
    searchAngle: runtime.session.rng.rawStream('inhibitorInit')() * Math.PI * 2,
  });
  runtime.players.clear();
  runtime.playerAuthorities.clear();
  runtime.joinClaims.clear();
  runtime.eventJournal.startRun(runtime.session.runId);
  runtime.snapshotRing.startRun(runtime.session.runId);
  Object.assign(runtime, runState.history);
  Object.assign(runtime, runState.ecology);
  runtime.overload = createOverloadController({
    snapshotHz: runtime.session.baseSnapshotHz,
  });
  applyOverloadProfile();
  // Spawn AI players
  spawnAIPlayers(runtime.mapState, runtime.session);
  Object.assign(runtime, runState.growth);
  runtime.collapseEpochSchedule = createCollapseEpochSchedule({ matchDurationSeconds: runtime.session.runDurationSeconds });
  runtime.collapseEpochState = createCollapseEpochState(runtime.collapseEpochSchedule);
  runtime.conductor.scheduleCollapseEpochs(runtime.collapseEpochSchedule);
  runtime.inhibitorSchedule = runtime.conductor.getSchedule();
  runtime.portalSchedule = runtime.inhibitorSchedule;
  Object.assign(runtime, runState.world);
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
  publishInhibitorPhaseEvent(0, phaseZero, { startup: true });
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

function getAuthorityFieldPacket() {
  if (!runtime.coarseField) return null;
  if (runtime.authorityFieldPacket?.field === runtime.coarseField
    && runtime.authorityFieldPacket.tick === runtime.tick) {
    return runtime.authorityFieldPacket.payload;
  }
  const payload = serializeCoarseFlowField(runtime.coarseField, runtime.tick, {
    maxCells: runtime.session.useCoarseField
      ? runtime.session.maxCoarseFieldCells
      : Infinity,
    maxBytes: runtime.session.snapshotBudgetBytes,
  });
  runtime.authorityFieldPacket = { field: runtime.coarseField, tick: runtime.tick, payload };
  return payload;
}

function getPublicSession() {
  return projectPublicSession(runtime.session, runtime.mapState, runtime.waveRings);
}

function snapshotBody({ force = false } = {}) {
  const lastEventSeq = runtime.eventJournal.lastSeq;
  const latest = runtime.snapshotRing.latest({ runId: runtime.session.runId || "idle" });
  if (!force && latest.status === "hit" && latest.snapshot?.tick === runtime.tick &&
      latest.snapshot?.lastEventSeq === lastEventSeq &&
      latest.snapshot?.session?.status === runtime.session.status) {
    return latest.snapshot;
  }
  const session = getPublicSession();
  const body = buildPublicSnapshot({
    session,
    clock: {
      tick: runtime.tick,
      simTime: runtime.simTime,
      serverTime: Date.now(),
      lastEventSeq,
    },
    bench: benchAuthority ? benchAuthority.snapshot() : null,
    players: runtime.players.values(),
    world: {
      mapState: runtime.mapState,
      portalSchedule: runtime.portalSchedule,
      waveRings: runtime.waveRings,
      collapseEpochState: runtime.collapseEpochState,
      collapseEpochSchedule: runtime.collapseEpochSchedule,
      growthTimer: runtime.growthTimer,
      getAuthoritativeField: getAuthorityFieldPacket,
    },
    inhibitor: runtime.inhibitor,
    inhibitorEntities: runtime.inhibitorEntities,
    inhibitorEcology: runtime.inhibitorEcology,
    recentEvents: runtime.recentEvents,
  }, {
    slingshotCoyoteTelemetry,
    buildSlingshotTelegraph,
    buildPlayerRulerFacts,
  });
  return runtime.snapshotRing.append(body, {
    bodySchemaVersion: BODY_SCHEMA_VERSION,
    snapshotSchemaVersion: 2,
    lastEventSeq,
    maxBytes: runtime.session.snapshotBudgetBytes,
    budgetLabel: `${runtime.session.mapId || "unknown"} snapshot`,
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
  const idle = benchAuthority ? false : activeHumanPlayerCount === 0;
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
      benchAuthority || humanPlayerCount > 0 || runtime.keepAlive || !runtime.idleShutdownMs
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
  if (!runtime.portalClock?.finalClosed) return false;
  const killedCount = killActiveHumanPlayers("run-timeout");
  return endSession("run-timeout", {
    killedCount,
    maxSimTime: runtime.session.runDurationSeconds,
    finalExfilCloseTime: runtime.portalSchedule?.windows?.find((window) => window.metadata?.finalExfil)?.closeTime,
  });
}

function maybeEndTerminalSession(reason = "terminal-players") {
  if (runtime.session.status !== "running") return false;
  if (getHumanPlayerCount() === 0) return false;
  if (getHumanPlayerCount({ activeOnly: true }) > 0) return false;
  return endSession(reason);
}

function cloneProfileLoadout(profile) {
  return {
    equipped: cloneRetiredSafeItems(profile?.loadout?.equipped),
    consumables: cloneRetiredSafeItems(profile?.loadout?.consumables),
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
    equipped: cloneRetiredSafeItems(player.equipped),
    consumables: cloneRetiredSafeItems(player.consumables),
  };
  const salvageBrought = [
    ...loadoutSnapshot.equipped,
    ...loadoutSnapshot.consumables,
  ].filter(Boolean);
  const ecologyEncountered = summarizeEcologyEncounters(runtime.inhibitorEcology);

  // Death cause taxonomy
  let deathCause = null;
  let deathEntityId = null;
  let deathEntityName = null;
  if (outcome === 'dead') {
    // Find the most recent death event for this player
    const deathEvent = [...runtime.recentEvents].reverse().find(
      e => e.type === 'player.died' && e.payload?.clientId === player.clientId
    );
    if (deathEvent) {
      deathCause = deathEvent.payload.cause || 'unknown';
      deathEntityId = deathEvent.payload.wellId || deathEvent.payload.entityId || null;
      deathEntityName = deathEvent.payload.wellName || deathEvent.payload.entityName || null;
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
    const deathLabel = deathEntityName || deathEntityId;
    notables.push({ type: "death_cause", description: deathLabel ? `${deathCause}: ${deathLabel}` : deathCause, value: deathCause });
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
    deathEntityName,
    survivalTime,
    runDurationSeconds: runtime.session.runDurationSeconds,
    cargoExtracted,
    cargoLost,
    salvageBrought,
    loadoutSnapshot,
    noiseMaxMeters: Math.round(player.noise?.maxAudibleRadiusMeters || 0),
    noiseSource: player.noise?.loudestSource || player.noise?.dominantSource || "IDLE",
    noiseTimeHeardSeconds: Number((player.noise?.timeHeardSeconds || 0).toFixed(2)),
    noiseTimeTrackedSeconds: Number((player.noise?.timeTrackedSeconds || 0).toFixed(2)),
    ecologyPhaseReached: runtime.inhibitor.phase,
    ecologyKindsReached: ecologyEncountered.kinds,
    ecologyCounts: ecologyEncountered.counts,
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
    noiseMaxMeters: Math.round(player.noise?.maxAudibleRadiusMeters || 0),
    noiseSource: player.noise?.loudestSource || player.noise?.dominantSource || 'IDLE',
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
  const fallbackEchoKey = `${echo.seed || runtime.session.seed}:${echo.pilotName || "unknown"}:${echo.wx || 0}:${echo.wy || 0}`;
  const wreck = {
    ...echo,
    id: `echo-${echo.wreckId || Math.abs(hashStringFNV(fallbackEchoKey)).toString(16)}`,
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
      const dx = worldDisplacement(wreck.wx, well.wx, ws);
      const dy = worldDisplacement(wreck.wy, well.wy, ws);
      const dist = Math.hypot(dx, dy);
      const minSafe = (well.killRadius || 0) * 1.3;
      if (dist > 0 && dist < minSafe) {
        const scale = minSafe / dist;
        wreck.wx = wrapWorldPosition(well.wx - dx * scale, ws);
        wreck.wy = wrapWorldPosition(well.wy - dy * scale, ws);
      }
    }
  }
  return wreck;
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

function spawnWaveRing(wx, wy, amplitude, sourceWellId = null) {
  const ring = {
    id: nextSeededToken(`wave-${runtime.tick}`, "waveIds"),
    sourceWX: wx,
    sourceWY: wy,
    radius: 0,
    amplitude,
    initialAmplitude: amplitude,
    sourceWellId: sourceWellId == null ? null : String(sourceWellId),
    alive: true,
  };
  runtime.waveRings.push(ring);
  if (runtime.session?.status === "running") rebuildAuthoritativeField();
  return ring;
}

function tickWells(dt) {
  for (const well of runtime.mapState.wells) {
    well.killRadius = wellKillRadiusForMass(well);
  }
}

function portalEventPayload(window, extra = {}) {
  return {
    conductorId: runtime.conductor?.id || "match-conductor",
    windowId: window.windowId,
    openId: window.openId,
    closeId: window.closeId,
    scheduledOpenTime: window.openTime,
    scheduledCloseTime: window.closeTime,
    portalMetadata: window.metadata,
    ...extra,
  };
}

function portalWindowIdLabel(window) {
  return window.metadata?.finalExfil ? "final-exfil" : `optional-${window.metadata?.windowIndex + 1}`;
}

function spawnPortalForWindow(window, type, index, { finalExfil = false } = {}) {
  const position = findPortalSpawnPosition(type, window, index, { finalExfil });
  const label = portalWindowIdLabel(window);
  const portal = {
    id: finalExfil ? "portal-final-exfil" : `portal-${label}-${index + 1}`,
    wx: position.wx,
    wy: position.wy,
    type,
    wave: finalExfil ? 99 : window.metadata.windowIndex + 1,
    spawnTime: window.openTime,
    lifespan: window.duration,
    scheduledOpenTime: window.openTime,
    scheduledCloseTime: window.closeTime,
    windowId: window.windowId,
    openId: window.openId,
    closeId: window.closeId,
    spawnAnchor: position.anchorName,
    spawnRadius: position.radius,
    spawnRadiusBand: { minRadius: position.minRadius, maxRadius: position.maxRadius },
    alive: true,
    opacity: 1,
    finalInhibitor: finalExfil,
    guaranteedFinalExfil: finalExfil,
  };
  runtime.mapState.portals.push(portal);
  publishEvent("portal.spawned", portalEventPayload(window, {
    portalId: portal.id,
    type: portal.type,
    wx: portal.wx,
    wy: portal.wy,
    wave: portal.wave,
    finalExfil,
    spawnAnchor: portal.spawnAnchor,
    spawnRadius: portal.spawnRadius,
    spawnRadiusBand: portal.spawnRadiusBand,
  }));
  return portal;
}

function openPortalWindow(window) {
  if (runtime.portalClock.openedWindowIds.has(window.windowId)) return;
  runtime.portalClock.openedWindowIds.add(window.windowId);
  const finalExfil = Boolean(window.metadata?.finalExfil);
  const countRange = window.metadata?.effectiveCountRange || [0, 0];
  const count = finalExfil
    ? 1
    : runtime.session.rng.int(`portal.window.count.${window.windowId}`, countRange[0], countRange[1]);
  publishEvent("portal.windowOpened", portalEventPayload(window, {
    finalExfil,
    portalCount: count,
    portalTypes: window.metadata?.types || [],
  }));

  for (let index = 0; index < count; index += 1) {
    const type = finalExfil
      ? "standard"
      : runtime.session.rng.pick(`portal.window.type.${window.windowId}.${index}`, window.metadata.types);
    spawnPortalForWindow(window, type, index, { finalExfil });
  }

  if (window.metadata?.finalExfil) {
    runtime.portalClock.finalOpen = true;
    const finalPortal = runtime.mapState.portals.find((portal) => portal.windowId === window.windowId);
    publishEvent("inhibitor.finalPortal", portalEventPayload(window, {
      portalId: finalPortal?.id || null,
      wx: finalPortal?.wx,
      wy: finalPortal?.wy,
      finalExfil: true,
    }));
  } else {
    runtime.mapState.nextPortalWindowIndex = window.metadata.windowIndex + 1;
    runtime.mapState.nextPortalWaveIndex = runtime.mapState.nextPortalWindowIndex;
  }
}

function closePortalWindow(window) {
  if (!runtime.portalClock.openedWindowIds.has(window.windowId) ||
      runtime.portalClock.closedWindowIds.has(window.windowId)) return;
  runtime.portalClock.closedWindowIds.add(window.windowId);
  const finalExfil = Boolean(window.metadata?.finalExfil);
  const closingPortals = runtime.mapState.portals.filter((portal) =>
    portal.windowId === window.windowId && portal.alive !== false
  );
  publishEvent("portal.windowClosed", portalEventPayload(window, {
    finalExfil,
    portalIds: closingPortals.map((portal) => portal.id),
  }));
  for (const portal of closingPortals) {
    portal.alive = false;
    portal.opacity = 0;
    const handle = runtime.ballparkMirror?.getHandleById(`portal:${portal.id}`);
    if (handle) runtime.ballparkMirror.setLifecycle(handle, "dead", { tick: runtime.tick });
    publishEvent("portal.expired", portalEventPayload(window, {
      portalId: portal.id,
      type: portal.type,
      finalExfil,
    }));
  }
  if (finalExfil) {
    runtime.portalClock.finalClosed = true;
  }
}

function tickPortals(dt) {
  let lifecycleChanged = false;
  const windows = runtime.portalSchedule?.windows || [];
  for (const window of windows) {
    if (runtime.simTime >= window.openTime && !runtime.portalClock.openedWindowIds.has(window.windowId)) {
      openPortalWindow(window);
      lifecycleChanged = true;
    }
    if (runtime.simTime >= window.closeTime && !runtime.portalClock.closedWindowIds.has(window.windowId)) {
      closePortalWindow(window);
      lifecycleChanged = true;
    }
  }

  for (const portal of runtime.mapState.portals) {
    if (portal.alive === false) continue;
    if (!portal.windowId && Number.isFinite(portal.spawnTime) && Number.isFinite(portal.lifespan) &&
        runtime.simTime >= portal.spawnTime + portal.lifespan) {
      portal.alive = false;
      portal.opacity = 0;
      const handle = runtime.ballparkMirror?.getHandleById(`portal:${portal.id}`);
      if (handle) runtime.ballparkMirror.setLifecycle(handle, "dead", { tick: runtime.tick });
      publishEvent("portal.expired", {
        portalId: portal.id,
        type: portal.type,
        source: "unscheduled",
      });
      lifecycleChanged = true;
      continue;
    }
    const remaining = portal.scheduledCloseTime - runtime.simTime;
    portal.opacity = remaining < 15 ? Math.max(0, remaining / 15) : 1;
  }
  return lifecycleChanged;
}

// --- Wreck Wave Spawning ---
// Spawn wreck waves on a schedule, with later waves spawning richer wrecks
// in more dangerous positions. See LOOT-ECONOMY.md.

function tickWreckWaves(dt) {
  if (!runtime._wreckWaveIndex) runtime._wreckWaveIndex = 0;
  if (!runtime._wreckWaveRepeatTimer) runtime._wreckWaveRepeatTimer = 0;
  if (!runtime._wreckRepeatWaveCount) runtime._wreckRepeatWaveCount = 0;
  const ws = runtime.session.worldScale;
  const waveRng = currentRNG('wreckWave');
  const nameRng = currentRNG('wreckNames');

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
    runtime.simTime < runtime.session.runDurationSeconds &&
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
  const rng = currentRNG('wreckPos');
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
    const scheduledTime = runtime.simTime - runtime.growthTimer;
    applyWellGrowth(well, {
      massDelta: well.growthRate,
      source: "schedule",
      reason: "normal-schedule",
      scheduledTime,
      waveAmplitude: WAVE_SERVER.growthWaveAmplitude * (well.mass + well.growthRate),
    });
  }
}

function tickCollapseEpochs() {
  if (!runtime.collapseEpochState || runtime.collapseEpochSchedule.length === 0) return;
  const advanced = advanceCollapseEpochs(
    runtime.collapseEpochState,
    runtime.collapseEpochSchedule,
    runtime.simTime,
  );
  runtime.collapseEpochState = advanced.state;
  for (const transition of advanced.transitions) {
    publishEvent("collapse.epochTransition", {
      ...transition,
      source: "collapse-schedule",
      reason: "match-progress",
    });
  }
}

function applyWellGrowth(well, {
  massDelta,
  source,
  reason,
  sourceEntityId = null,
  sourceEntityType = null,
  scheduledTime = null,
  waveAmplitude,
} = {}) {
  const growth = calculateWellGrowth({
    well,
    massDelta,
    killRadiusForMass: wellKillRadiusForMass,
  });
  well.mass = growth.after.mass;
  well.killRadius = growth.after.killRadius;
  const growthWaveMultiplier = well.fabricSignature?.parameters?.growthWaveAmplitudeMultiplier ?? 1;
  const ring = spawnWaveRing(
    well.wx,
    well.wy,
    (waveAmplitude ?? WAVE_SERVER.growthWaveAmplitude * well.mass) * growthWaveMultiplier,
    well.id,
  );
  return publishEvent("well.grew", createWellGrowthEvent({
    well,
    source,
    reason,
    sourceEntityId,
    sourceEntityType,
    scheduledTime,
    eventTime: runtime.simTime,
    waveId: ring.id,
    before: growth.before,
    after: growth.after,
  }));
}

function tickWaveRings(dt) {
  for (const ring of runtime.waveRings) {
    ring.radius += WAVE_SERVER.waveSpeed * dt;
    ring.amplitude = decayWaveAmplitude(ring.amplitude, dt, WAVE_SERVER.waveHalfLife);
    if (ring.radius > WAVE_SERVER.waveMaxRadius || ring.amplitude < 0.01) {
      ring.alive = false;
    }
  }
  runtime.waveRings = runtime.waveRings.filter((ring) => ring.alive !== false);
}

function maybeCollapseRun() {
  if (!runtime.portalClock?.finalClosed) return;
  const activePortalCount = runtime.mapState.portals.filter(isPortalAvailable).length;
  if (runtime.simTime <= 60) return;
  if (activePortalCount > 0) return;

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
    star.wx = wrapCenteredCoordinate(star.wx + (star.driftVX || 0) * dt, runtime.session.worldScale);
    star.wy = wrapCenteredCoordinate(star.wy + (star.driftVY || 0) * dt, runtime.session.worldScale);

    for (const well of runtime.mapState.wells) {
      const dist = worldDistance(star.wx, star.wy, well.wx, well.wy, runtime.session.worldScale);
      if (dist < well.killRadius) {
        star.alive = false;
        const growthEvent = applyWellGrowth(well, {
          massDelta: (star.mass || 1) * 0.5,
          source: "star-consumption",
          reason: "star-consumed",
          sourceEntityId: star.id,
          sourceEntityType: "star",
          waveAmplitude: (star.mass || 1) * 3,
        });
        const angle = currentRNG('starRemnant')() * Math.PI * 2;
        const ejectDist = 0.08;
        const ejectSpeed = 0.4;
        const remnant = {
          id: `wreck-remnant-${star.id}-${runtime.tick}`,
          wx: wrapCenteredCoordinate(well.wx + Math.cos(angle) * ejectDist, runtime.session.worldScale),
          wy: wrapCenteredCoordinate(well.wy + Math.sin(angle) * ejectDist, runtime.session.worldScale),
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
        publishEvent("star.consumed", {
          starId: star.id,
          starName: star.name,
          starType: star.type,
          starColor: star.typeDef?.color || null,
          wellId: well.id,
          wx: well.wx,
          wy: well.wy,
          remnantWreckId: remnant.id,
          wellGrowthEventSeq: growthEvent.seq,
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
      const direction = worldDirection(wreck.wx, wreck.wy, well.wx, well.wy, ws);
      const gravity = wellGravityVector("wreck", direction, effectiveWellMass(well));
      ax += gravity.x;
      ay += gravity.y;
    }

    const terminal = 0.05;

    wreck.vx += ax * dt;
    wreck.vy += ay * dt;
    const dragFactor = Math.exp(-WELL_GRAVITY_PARAMS.wreck.dragRate * dt);
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

    wreck.wx = wrapCenteredCoordinate(wreck.wx + wreck.vx * dt, ws);
    wreck.wy = wrapCenteredCoordinate(wreck.wy + wreck.vy * dt, ws);

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
    deltaX: worldDisplacement(startWX, player.wx, worldScale),
    deltaY: worldDisplacement(startWY, player.wy, worldScale),
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

function portalEndpointDistance(player, portal) {
  return worldDistance(
    player.wx,
    player.wy,
    portal.wx,
    portal.wy,
    runtime.session.worldScale
  );
}

function expireHeldInput(player, now = Date.now()) {
  if (player.isAI || !player.lastInput) return player.lastInput;
  const receivedAt = Number(player.lastInput.receivedAt);
  if (!Number.isFinite(receivedAt) || now - receivedAt < AUTHORITY_INPUT_CONFIG.heldInputTimeoutMs) {
    return player.lastInput;
  }

  const input = player.lastInput;
  if (input.moveX === 0 && input.moveY === 0 && input.thrust === 0 && input.brake === 0
    && !input.slingshot && !input.ability1 && !input.ability2) {
    return input;
  }

  // Receipt time is authoritative; client timestamps are only transport metadata.
  player.lastInput = {
    ...input,
    moveX: 0,
    moveY: 0,
    thrust: 0,
    brake: 0,
    slingshot: false,
    ability1: false,
    ability2: false,
  };
  return player.lastInput;
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
      emitPlayerNoise(player, NOISE_CONFIG.impulses.collisionMeters, "IMPACT", {
        action: "scavenger-contact",
      });
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
  if (runtime.coarseField) {
    const field = sampleCoarseFlowField(runtime.coarseField, player.wx, player.wy);
    player.vx += (field.wave?.x ?? field.waveX) * dt;
    player.vy += (field.wave?.y ?? field.waveY) * dt;
    return;
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
  const graceDuration = player.brain?.wellGraceDuration || 0;
  if (graceDuration > 0 && !player._wellGraceContactActive) {
    player._wellGraceContactActive = true;
    player._wellGraceLastTick = runtime.tick;
    player.effectState.hullGraceRemaining = graceDuration;
    publishEvent("player.hullGraceStarted", {
      clientId: player.clientId,
      wellId: well.id,
      wellName: well.name || well.id,
      duration: graceDuration,
    });
    return "protected";
  }
  if (player._wellGraceContactActive && player._wellGraceLastTick !== runtime.tick) {
    player._wellGraceLastTick = runtime.tick;
    player.effectState.hullGraceRemaining = Math.max(0, player.effectState.hullGraceRemaining - dt);
  }
  if ((player.effectState.hullGraceRemaining || 0) > 0) return "protected";
  if (player.abilityState && player.abilityState.hullType === 'hauler'
      && player.abilityState.wellSurvivesRemaining > 0) {
    player.abilityState.wellSurvivesRemaining--;
    const ejectAngle = Math.atan2(dy, dx) + Math.PI;
    player.vx = Math.cos(ejectAngle) * 0.3;
    player.vy = Math.sin(ejectAngle) * 0.3;
    player.wx = wrapWorldPosition(player.wx + Math.cos(ejectAngle) * 0.1, runtime.session.worldScale);
    player.wy = wrapWorldPosition(player.wy + Math.sin(ejectAngle) * 0.1, runtime.session.worldScale);
    const scatterRng = currentRNG('hullSave');
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
    runtime.mapState.wells.length || 1
  );
  let hasWellContact = false;
  for (const { entity: well } of relevantWells) {
    const dx = worldDisplacement(player.wx, well.wx, runtime.session.worldScale);
    const dy = worldDisplacement(player.wy, well.wy, runtime.session.worldScale);
    const dist = Math.hypot(dx, dy);
    if (dist < well.killRadius) {
      hasWellContact = true;
      if (resolveWellContact(player, well, dt, dx, dy) === "dead") return;
    }
  }
  if (!hasWellContact && player._wellGraceContactActive) {
    player._wellGraceContactActive = false;
    player._wellGraceLastTick = -1;
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
      const direction = worldDirection(player.wx, player.wy, well.wx, well.wy, runtime.session.worldScale);
      const gravity = wellGravityVector("player", direction, effectiveWellMass(well));
      pullX += gravity.x;
      pullY += gravity.y;
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
      dist: portalEndpointDistance(player, portal),
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
  const limit = wrecks.length || 1;
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
    // Salvage is a discrete emitter impulse. Echo proximity itself is silent.
    const wreckTier = wreck.tier || 1;
    const salvageRadius = NOISE_CONFIG.impulses.salvage[Math.min(3, Math.max(1, wreckTier))]
      || NOISE_CONFIG.impulses.salvage[1];
    emitPlayerNoise(player, salvageRadius, "SALVAGE", { action: "salvage" });
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
  }, PORTAL_CONFIG.captureRadius);
  const limit = portals.length || 1;
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
  player.activeEffects = [...new Set([...passive, ...active])];
}

function spawnTemporaryPortalNearPlayer(player) {
  const rng = currentRNG('breachFlare');
  const angle = rng() * Math.PI * 2;
  const dist = 0.15 + rng() * 0.1;
  const portal = {
    id: `portal-breach-${player.clientId}-${runtime.tick}`,
    wx: wrapCenteredCoordinate(player.wx + Math.cos(angle) * dist, runtime.session.worldScale),
    wy: wrapCenteredCoordinate(player.wy + Math.sin(angle) * dist, runtime.session.worldScale),
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
    case "breachFlare":
      spawnTemporaryPortalNearPlayer(player);
      break;
    case "fuelRefill": {
      const refillAmount = Number(item.refillAmount || item.amount || item.deltaV || 35);
      const nextDeltaV = Math.min(player.deltaVMax || refillAmount, (player.deltaV || 0) + refillAmount);
      setHeatRatio(player, 1 - nextDeltaV / Math.max(player.deltaVMax || refillAmount, 1));
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
      planetoid.wx = wrapCenteredCoordinate(planetoid.wx + (dx / dist) * 0.02, runtime.session.worldScale);
      planetoid.wy = wrapCenteredCoordinate(planetoid.wy + (dy / dist) * 0.02, runtime.session.worldScale);
    }
  }

  emitPlayerNoise(player, NOISE_CONFIG.impulses.forcePulseMeters * (pb.pulseSignalScale || 1), "PULSE", { action: "force-pulse" });
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
  const rng = currentRNG('cargoDrop');
  const inputAngle =
    Math.hypot(player.lastInput.moveX, player.lastInput.moveY) > 0.1
      ? Math.atan2(player.lastInput.moveY, player.lastInput.moveX)
      : rng() * Math.PI * 2;
  const rearAngle = inputAngle + Math.PI + (rng() - 0.5) * Math.PI;
  const ejectDist = 0.18;
  const ejectSpeed = 0.3;
  const wreck = {
    id: nextSeededToken(`wreck-drop-${player.clientId}-${runtime.tick}`, "wreckIds"),
    wx: wrapCenteredCoordinate(player.wx + Math.cos(rearAngle) * ejectDist, runtime.session.worldScale),
    wy: wrapCenteredCoordinate(player.wy + Math.sin(rearAngle) * ejectDist, runtime.session.worldScale),
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
  if (Number.isFinite(Number(body.heatRatio))) {
    setHeatRatio(player, Number(body.heatRatio));
  } else if (Number.isFinite(Number(body.deltaV))) {
    const nextDeltaV = Math.max(0, Math.min(player.deltaVMax || BRAIN_DEFAULTS.deltaVMax, Number(body.deltaV)));
    setHeatRatio(player, 1 - nextDeltaV / Math.max(player.deltaVMax || BRAIN_DEFAULTS.deltaVMax, 1));
  }
  if (Number.isFinite(Number(body.noiseRadiusMeters))) {
    player.noise.audibleRadiusMeters = Math.max(0, Number(body.noiseRadiusMeters));
    player.noise.maxAudibleRadiusMeters = Math.max(player.noise.maxAudibleRadiusMeters || 0, player.noise.audibleRadiusMeters);
  } else if (Number.isFinite(Number(body.signalLevel))) {
    // Harness migration shim only: old debug callers may seed a meter, never a
    // player-facing signal band or threshold.
    player.noise.audibleRadiusMeters = Math.max(0, simUnitsToMeters(Number(body.signalLevel)));
    player.noise.maxAudibleRadiusMeters = Math.max(player.noise.maxAudibleRadiusMeters || 0, player.noise.audibleRadiusMeters);
  }
  if (Number.isFinite(Number(body.timeSinceThrust))) player.timeSinceThrust = Math.max(0, Number(body.timeSinceThrust));
  if (body.resetSlingshot === true) {
    const state = ensurePlayerSlingshot(player);
    state.phase = "idle";
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
    state.entryVX = 0;
    state.entryVY = 0;
    state.lockedVX = 0;
    state.lockedVY = 0;
    state.bendDegrees = 0;
    state.arcRadians = 0;
    state.previousRadialX = 0;
    state.previousRadialY = 0;
    state.aimAnchorKey = null;
    state.aimAnchorId = null;
    state.aimAnchorType = null;
    state.aimAnchorWX = null;
    state.aimAnchorWY = null;
    state.aimAnchorRange = 0;
    state.aimDistance = 0;
    state.lastAimSeenTime = -Infinity;
    state.coyoteUntil = 0;
    state.coyoteActive = false;
    state.lockTick = -1;
    state.lockUntil = 0;
    state.releaseGhostUntil = 0;
    state.releaseGhost = null;
    state.lastPayoff = null;
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
  const requestedPhase = Number.isFinite(Number(body.phase))
    ? Math.max(0, Math.min(3, Math.round(Number(body.phase))))
    : null;
  if (requestedPhase !== null) setInhibitorPhase(requestedPhase, null, { debug: true });
  const patches = Array.isArray(body.entities) ? body.entities : body.entity ? [body.entity] : [];
  for (const patch of patches) {
    const entity = runtime.inhibitorEntities.find((entry) => entry.id === patch.id);
    if (!entity) continue;
    if (Number.isFinite(Number(patch.wx))) entity.wx = wrapWorldPosition(Number(patch.wx), ws);
    if (Number.isFinite(Number(patch.wy))) entity.wy = wrapWorldPosition(Number(patch.wy), ws);
    if (Number.isFinite(Number(patch.intensity))) entity.intensity = Math.max(0, Math.min(1, Number(patch.intensity)));
    if (Number.isFinite(Number(patch.radius))) entity.radius = Math.max(0, Math.min(ws, Number(patch.radius)));
  }
  return {
    phase: inh.phase,
    entities: runtime.inhibitorEntities.filter((entity) => entity.lifecycle !== "expired"),
  };
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
  // Authority always integrates every gameplay entity. Ballpark remains the
  // query owner, but map-specific relevance caps cannot drop force/contact work.
  const entityRadius = runtime.session.worldScale;
  const scavengerRadius = runtime.session.worldScale;
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
    const selectsWholeCategory = (
      radius >= runtime.session.worldScale
      && perPlayerLimit >= entities.length
    );
    // A full-world, unlimited query returns the same category from every
    // player origin. The first alive player preserves the old result order.
    const queryOrigins = selectsWholeCategory ? [alivePlayers[0]] : alivePlayers;
    const { bodies, stats } = collectRelevantBodies(mirror, queryOrigins, {
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
      runtime.mapState.stars.length || 1,
      "star",
      { collisionMask: BODY_MASKS.STAR }
    ),
    wrecks: collectRelevantEntities(
      runtime.mapState.wrecks,
      entityRadius,
      runtime.mapState.wrecks.length || 1,
      "wreck",
      { interactionMask: BODY_MASKS.PICKUP }
    ),
    planetoids: collectRelevantEntities(
      runtime.mapState.planetoids,
      entityRadius,
      runtime.mapState.planetoids.length || 1,
      "planetoid",
      { collisionMask: BODY_MASKS.PLANETOID }
    ),
    scavengers: [
      ...dyingScavengers,
      ...collectRelevantEntities(
        nonDyingScavengers,
        scavengerRadius,
        runtime.mapState.scavengers.length || 1,
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

function applyWellGravityToEntity(entity, dt) {
  let ax = 0;
  let ay = 0;
  for (const well of runtime.mapState.wells) {
    const direction = worldDirection(entity.wx, entity.wy, well.wx, well.wy, runtime.session.worldScale);
    if (direction.dist < WELL_GRAVITY_PARAMS.scavenger.zeroDistanceThreshold) continue;
    const dx = direction.dx;
    const dy = direction.dy;
    const dist = direction.dist;
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
    const gravity = wellGravityVector("scavenger", direction, effectiveWellMass(well));
    ax += gravity.x;
    ay += gravity.y;
  }
  entity.vx += ax * dt;
  entity.vy += ay * dt;
  return true;
}

function spawnScavengerDeathDrops(scav) {
  if ((scav.lootCount || 0) <= 0) return [];
  const tier = scav.archetype === "vulture" ? 2 : 1;
  const drops = [];
  const rng = currentRNG('scavDeath');
  for (let i = 0; i < scav.lootCount; i++) {
    const angle = rng() * Math.PI * 2;
    const ejectDist = 0.05 + rng() * 0.05;
    const ejectSpeed = 0.2 + rng() * 0.2;
    const wreck = {
      id: `wreck-scav-${scav.id}-${runtime.tick}-${i + 1}`,
      wx: wrapCenteredCoordinate(scav.wx + Math.cos(angle) * ejectDist, runtime.session.worldScale),
      wy: wrapCenteredCoordinate(scav.wy + Math.sin(angle) * ejectDist, runtime.session.worldScale),
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
  scav.wx = wrapCenteredCoordinate(scav.deathWellWX + Math.cos(scav.deathAngle) * radius, runtime.session.worldScale);
  scav.wy = wrapCenteredCoordinate(scav.deathWellWY + Math.sin(scav.deathAngle) * radius, runtime.session.worldScale);
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
          scav.driftHeading = currentRNG('scavDrift')() * Math.PI * 2;
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
    if (!applyWellGravityToEntity(scav, dt)) continue;

    const dragFactor = Math.exp(-SCAVENGER_CONFIG.drag * dt * 60);
    scav.vx *= dragFactor;
    scav.vy *= dragFactor;
    scav.wx = wrapWorldPosition(scav.wx + scav.vx * dt, runtime.session.worldScale);
    scav.wy = wrapWorldPosition(scav.wy + scav.vy * dt, runtime.session.worldScale);
  }

  runtime.mapState.scavengers = runtime.mapState.scavengers.filter((scav) => scav.alive !== false);
}

// --- Noise Radius System ---
// Noise is the emitter-owned audible envelope. It rises from delivered actions
// and decays in canonical meters; Conductor timing remains independent.
function noiseModifiersFor(player) {
  const source = player?.noise?.modifiers || {};
  const radiusMultiplier = Number(source.radiusMultiplier);
  const decayMultiplier = Number(source.decayMultiplier);
  return {
    idleFloorMeters: Number.isFinite(Number(source.idleFloorMeters))
      ? clampMeters(source.idleFloorMeters)
      : NOISE_CONFIG.idleFloorMeters,
    radiusMultiplier: Number.isFinite(radiusMultiplier) && radiusMultiplier >= 0
      ? radiusMultiplier
      : 1,
    decayMultiplier: Number.isFinite(decayMultiplier) && decayMultiplier >= 0
      ? decayMultiplier
      : 1,
  };
}

function noiseSourceLabel(source) {
  return String(source || "IDLE").toUpperCase().replace(/[^A-Z0-9 ]+/g, "").trim() || "IDLE";
}

function tickPlayerNoise(player, dt) {
  const noise = player.noise;
  if (!noise) return;
  const input = player.lastInput || {};
  const deliveredThrust = Math.max(0, Math.min(1, Number(player.lastDeliveredThrustIntensity) || 0));
  const deliveredBrake = Math.max(0, Math.min(1, Number(player.lastDeliveredBrakeIntensity) || 0));
  const flow = estimateFlow(player.wx, player.wy);
  const flowMag = Math.hypot(flow.x, flow.y);
  const inputMag = Math.hypot(Number(input.moveX) || 0, Number(input.moveY) || 0);
  let alignment = 0;
  if (flowMag > 0.001 && inputMag > 0.001) {
    alignment = (flow.x * input.moveX + flow.y * input.moveY) / (flowMag * inputMag);
  }
  const modifiers = noiseModifiersFor(player);
  let targetMeters = 0;
  let activeSource = "IDLE";
  let activeSourceClass = null;
  if (deliveredBrake > 0.01) {
    targetMeters = NOISE_CONFIG.continuous.brakeMeters * modifiers.radiusMultiplier;
    activeSource = "BRAKE";
    activeSourceClass = "VESSEL THRUST";
  } else if (deliveredThrust > 0.01) {
    const againstFlow = alignment < -0.15;
    const withFlow = alignment > 0.45;
    targetMeters = (againstFlow
      ? NOISE_CONFIG.continuous.againstFlowMeters
      : withFlow ? NOISE_CONFIG.continuous.withFlowMeters : NOISE_CONFIG.continuous.neutralMeters)
      * modifiers.radiusMultiplier * deliveredThrust;
    activeSource = againstFlow ? "THRUST AGAINST FLOW" : withFlow ? "THRUST WITH FLOW" : "THRUST";
    activeSourceClass = "VESSEL THRUST";
  }

  noise.continuousRadiusMeters = resolveContinuousRadius(
    noise.continuousRadiusMeters,
    targetMeters,
    dt,
    modifiers.decayMultiplier,
  );

  const nextImpulses = [];
  let impulseRadius = 0;
  let impulseSource = "IDLE";
  let impulseSourceClass = null;
  for (const impulse of Array.isArray(noise.impulses) ? noise.impulses : []) {
    const ageSeconds = Math.max(0, Number(impulse.ageSeconds) || 0) + dt;
    const currentRadius = resolveImpulseRadius(impulse.radiusMeters, ageSeconds, modifiers.decayMultiplier);
    if (currentRadius <= 0) continue;
    nextImpulses.push({ ...impulse, ageSeconds });
    if (currentRadius > impulseRadius) {
      impulseRadius = currentRadius;
      impulseSource = impulse.source;
      impulseSourceClass = impulse.sourceClass || null;
    }
  }
  noise.impulses = nextImpulses;
  const previousRadius = Math.max(0, Number(noise.audibleRadiusMeters) || 0);
  const audibleRadius = Math.max(modifiers.idleFloorMeters, noise.continuousRadiusMeters, impulseRadius);
  noise.previousRadiusMeters = previousRadius;
  noise.audibleRadiusMeters = clampMeters(audibleRadius);
  const delta = noise.audibleRadiusMeters - previousRadius;
  noise.trend = delta > 1 ? "rising" : delta < -1 ? "falling" : "steady";
  if (targetMeters > 0) {
    noise.continuousSource = activeSource;
    noise.continuousSourceClass = activeSourceClass;
  } else if (noise.continuousRadiusMeters <= 0) {
    noise.continuousSource = "IDLE";
    noise.continuousSourceClass = null;
  }
  const sourceProjection = resolveNoiseSourceProjection({
    continuousRadiusMeters: noise.continuousRadiusMeters,
    continuousSource: noise.continuousSource,
    continuousSourceClass: noise.continuousSourceClass,
    impulseRadiusMeters: impulseRadius,
    impulseSource,
    impulseSourceClass,
  });
  noise.currentSource = noiseSourceLabel(sourceProjection.source);
  noise.sourceClass = sourceProjection.sourceClass;
  if (noise.currentSource !== "IDLE") noise.dominantSource = noise.currentSource;
  const peak = recordNoisePeak({
    previousMaxMeters: noise.maxAudibleRadiusMeters,
    previousSource: noise.loudestSource,
    radiusMeters: noise.audibleRadiusMeters,
    source: noise.currentSource,
  });
  noise.maxAudibleRadiusMeters = peak.maxAudibleRadiusMeters;
  noise.loudestSource = peak.loudestSource;
}

function emitPlayerNoise(player, radiusMeters, source, options = {}) {
  if (!player?.noise) return;
  const radius = clampMeters(radiusMeters) * noiseModifiersFor(player).radiusMultiplier;
  if (radius <= 0) return;
  const eventSource = noiseSourceLabel(source);
  const requestedSourceClass = options.sourceClass ?? "VESSEL";
  const sourceClass = NOISE_CONFIG.publicSourceClasses.includes(String(requestedSourceClass).toUpperCase())
    ? String(requestedSourceClass).toUpperCase()
    : null;
  player.noise.impulses = Array.isArray(player.noise.impulses) ? player.noise.impulses : [];
  player.noise.impulses.push({ radiusMeters: radius, source: eventSource, sourceClass, ageSeconds: 0 });
  player.noise.currentSource = eventSource;
  player.noise.dominantSource = eventSource;
  player.noise.sourceClass = sourceClass;
  publishEvent("noise.impulse", {
    clientId: player.clientId,
    wx: player.wx,
    wy: player.wy,
    radiusMeters: radius,
    source: eventSource,
    action: options.action || eventSource,
    sourceClass,
  });
}

function refreshPlayerNoiseListeners(player) {
  const noise = player?.noise;
  if (!noise) return;
  const listeners = [];
  const ws = runtime.session.worldScale;
  for (const fauna of runtime.mapState.fauna || []) {
    // Jellies are ambient scenery. Only Signal Blooms consume the player
    // Noise envelope and therefore belong in listener counts/state.
    if (fauna.alive === false || fauna.type !== "bloom") continue;
    const distanceSimUnits = worldDistance(player.wx, player.wy, fauna.wx, fauna.wy, ws);
    const listener = enemyListenerStateFor({
      radiusMeters: noise.audibleRadiusMeters,
      distanceSimUnits,
      sensitivity: FAUNA_CONFIG.bloomListenerSensitivity,
    });
    fauna.listenerState = listener.state;
    if (listener.state !== "QUIET") {
      fauna.lastHeardWX = player.wx;
      fauna.lastHeardWY = player.wy;
      listeners.push({
        id: fauna.id,
        kind: fauna.type === "bloom" ? "SIGNAL BLOOM" : "FAUNA",
        state: listener.state,
        distanceMeters: listener.distanceMeters,
        sourceWX: fauna.wx,
        sourceWY: fauna.wy,
      });
    }
  }
  for (const swarm of runtime.inhibitorEntities || []) {
    if (swarm.kind !== "swarm" || swarm.lifecycle !== "alive") continue;
    const distanceSimUnits = worldDistance(player.wx, player.wy, swarm.wx, swarm.wy, ws);
    const audible = emitterAudibleFor({ radiusMeters: noise.audibleRadiusMeters, distanceSimUnits });
    if (!audible.audible) continue;
    listeners.push({
      id: swarm.id,
      kind: "SWARM",
      state: swarm.noiseListenerState === "TRACKING" ? "TRACKING"
        : swarm.noiseListenerState === "INVESTIGATING" ? "INVESTIGATING"
          : "HEARD",
      distanceMeters: audible.distanceMeters,
      sourceWX: swarm.wx,
      sourceWY: swarm.wy,
    });
  }
  noise.listeners = listeners;
  noise.heardListenerCount = listeners.length;
  noise.trackedListenerCount = listeners.filter((listener) => listener.state === "TRACKING").length;
  noise.lockedOnListenerCount = listeners.filter((listener) => listener.state === "LOCKED ON").length;
  if (listeners.length > 0) noise.timeHeardSeconds = (noise.timeHeardSeconds || 0) + 1 / AUTHORITY_INTEGRATION_HZ;
  if (noise.trackedListenerCount > 0) noise.timeTrackedSeconds = (noise.timeTrackedSeconds || 0) + 1 / AUTHORITY_INTEGRATION_HZ;
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
  const rng = currentRNG('aiInit');
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
  const rng = session?.rng?.rawStream('aiPick');
  if (!rng) throw new Error("AI personality selection requires seeded RNG streams");

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
  const rng = currentRNG('safeSpawn');
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

// Gameplay reads the server-owned field only; presentation has no authority seam.
function estimateFlowSample(wx, wy) {
  if (runtime.coarseField) {
    const sample = sampleCoarseFlowField(runtime.coarseField, wx, wy);
    return normalizeFlowSample(sample);
  }
  return normalizeFlowSample({ confidence: 0 });
}

function estimateFlow(wx, wy) {
  const sample = estimateFlowSample(wx, wy);
  return { x: sample.current.x, y: sample.current.y };
}

function ensurePlayerSlingshot(player) {
  if (player.slingshot) return player.slingshot;
  player.slingshot = {
    phase: "idle",
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
    entryVX: 0,
    entryVY: 0,
    lockedVX: 0,
    lockedVY: 0,
    bendDegrees: 0,
    arcRadians: 0,
    previousRadialX: 0,
    previousRadialY: 0,
    aimAnchorKey: null,
    aimAnchorId: null,
    aimAnchorType: null,
    aimAnchorWX: null,
    aimAnchorWY: null,
    aimAnchorRange: 0,
    aimDistance: 0,
    lastAimSeenTime: -Infinity,
    coyoteUntil: 0,
    coyoteActive: false,
    lockTick: -1,
    lockUntil: 0,
    releaseGhostUntil: 0,
    releaseGhost: null,
    lastPayoff: null,
  };
  return player.slingshot;
}

function slingshotCoyoteTelemetry(state) {
  const canonicalDurationMs = Math.max(0, SLINGSHOT_SERVER.coyoteTime);
  const hasAimTime = Number.isFinite(state.lastAimSeenTime);
  const canonicalRemainingMs = hasAimTime
    ? Math.max(0, (state.lastAimSeenTime + canonicalDurationMs / 1000 - runtime.simTime) * 1000)
    : 0;
  const transportRemainingMs = Number.isFinite(state.coyoteUntil)
    ? Math.max(0, (state.coyoteUntil - runtime.simTime) * 1000)
    : 0;
  const effectiveDurationMs = hasAimTime && Number.isFinite(state.coyoteUntil)
    ? Math.max(0, (state.coyoteUntil - state.lastAimSeenTime) * 1000)
    : 0;
  return {
    canonicalDurationMs,
    canonicalRemainingMs,
    effectiveDurationMs,
    transportRemainingMs,
  };
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
      massWeight: SLINGSHOT_SERVER.massWeight.well * effectiveWellMass(well),
      pullMass: effectiveWellMass(well),
      pullStrength: SERVER_WELLS.shipPullStrength,
      pullFalloff: SERVER_WELLS.shipPullFalloff,
      pullRange: SERVER_WELLS.maxRange,
      range: captureRadiusWorld("well", SLINGSHOT_SERVER.captureRadius),
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
      range: captureRadiusWorld("star", SLINGSHOT_SERVER.captureRadius),
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
      range: captureRadiusWorld("planetoid", SLINGSHOT_SERVER.captureRadius),
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
  return tangentialSpeed({ x: player.vx, y: player.vy }, { x: dx, y: dy });
}

function slingshotAimEligibility(player, state, anchor = findSlingshotAnchorByState(state)) {
  const tangential = anchor ? slingshotTangentialSpeed(player, anchor) : 0;
  return {
    tangentialSpeed: tangential,
    engageEligible: Boolean(anchor && slingshotEngageEligible(tangential)),
  };
}

function setSlingshotAimEligibility(player, state, anchor) {
  const eligibility = slingshotAimEligibility(player, state, anchor);
  state.aimTangentialSpeed = eligibility.tangentialSpeed;
  state.engageEligible = eligibility.engageEligible;
  return eligibility;
}

function slingshotOrbitDirection(player, anchor) {
  const dx = worldDisplacement(player.wx, anchor.wx, runtime.session.worldScale);
  const dy = worldDisplacement(player.wy, anchor.wy, runtime.session.worldScale);
  const dist = Math.hypot(dx, dy) || 1e-4;
  const tx = -(dy / dist);
  const ty = dx / dist;
  return (player.vx * tx + player.vy * ty) >= 0 ? 1 : -1;
}

function findNearestSlingshotAffordance(player) {
  let best = null;
  let bestDist = Infinity;
  for (const anchor of collectSlingshotAnchors()) {
    const dist = worldDistance(player.wx, player.wy, anchor.wx, anchor.wy, runtime.session.worldScale);
    if (dist <= anchor.range && dist < bestDist) {
      best = { anchor, distance: dist };
      bestDist = dist;
    }
  }
  return best;
}

function updateSlingshotAim(player, currentTime, dt = 0) {
  const state = ensurePlayerSlingshot(player);
  if (state.engaged) return null;
  const coyoteTimeMs = effectiveCoyoteTimeMs(SLINGSHOT_SERVER.coyoteTime);
  const current = findNearestSlingshotAffordance(player);
  if (current) {
    const key = slingshotAnchorKey(current.anchor);
    state.phase = "aim";
    state.aimAnchorKey = key;
    state.aimAnchorId = current.anchor.id;
    state.aimAnchorType = current.anchor.type;
    state.aimAnchorWX = current.anchor.wx;
    state.aimAnchorWY = current.anchor.wy;
    state.aimAnchorRange = current.anchor.range;
    state.aimDistance = current.distance;
    state.lastAimSeenTime = currentTime;
    state.coyoteUntil = currentTime + coyoteTimeMs / 1000;
    state.coyoteActive = false;
    setSlingshotAimEligibility(player, state, current.anchor);
    return current;
  }

  const canCoyote = state.aimAnchorKey && coyoteWindowOpen(
    currentTime,
    state.lastAimSeenTime,
    coyoteTimeMs,
  );
  if (canCoyote) {
    state.phase = "aim";
    state.coyoteActive = true;
    const anchor = findSlingshotAnchorByState({
      anchorId: state.aimAnchorId,
      anchorType: state.aimAnchorType,
    });
    setSlingshotAimEligibility(player, state, anchor);
    return anchor;
  }

  state.phase = "idle";
  state.aimAnchorKey = null;
  state.aimAnchorId = null;
  state.aimAnchorType = null;
  state.aimAnchorWX = null;
  state.aimAnchorWY = null;
  state.aimAnchorRange = 0;
  state.aimDistance = 0;
  state.aimTangentialSpeed = 0;
  state.engageEligible = false;
  state.coyoteActive = false;
  state.coyoteUntil = 0;
  return null;
}

function findSlingshotAffordance(player, currentTime = runtime.simTime, dt = 0) {
  const normal = findNearestSlingshotAffordance(player);
  if (normal) return normal;
  const state = ensurePlayerSlingshot(player);
  const coyoteTimeMs = effectiveCoyoteTimeMs(SLINGSHOT_SERVER.coyoteTime);
  if (!state.aimAnchorKey || !coyoteWindowOpen(currentTime, state.lastAimSeenTime, coyoteTimeMs)) {
    return null;
  }
  const anchor = findSlingshotAnchorByState({ anchorId: state.aimAnchorId, anchorType: state.aimAnchorType });
  if (!anchor) return null;
  const distance = worldDistance(player.wx, player.wy, anchor.wx, anchor.wy, runtime.session.worldScale);
  if (distance > anchor.range * SLINGSHOT_INTERNAL.rangeBreakGraceFactor) return null;
  return { anchor, distance, coyote: true };
}

function slingshotHullMods(player) {
  const hull = HULL_DEFINITIONS[player.hullType] || HULL_DEFINITIONS.drifter || {};
  return {
    energyMult: hull.slingshotEnergyMult ?? 1,
    chainWindowMult: hull.slingshotChainWindowMult ?? 1,
  };
}

function slingshotAnchorTelemetry(state, prefix = "anchor") {
  const field = (name) => prefix ? `${prefix}${name[0].toUpperCase()}${name.slice(1)}` : name;
  const id = state[field("anchorId")];
  if (!id) return null;
  return {
    id,
    type: state[field("anchorType")],
    wx: state[field("anchorWX")],
    wy: state[field("anchorWY")],
    range: state[field("anchorRange")] || 0,
  };
}

function buildSlingshotTelegraph(player) {
  const state = ensurePlayerSlingshot(player);
  const coyote = slingshotCoyoteTelemetry(state);
  const aimAnchor = slingshotAnchorTelemetry(state, "aim");
  const aimEligibility = aimAnchor
    ? setSlingshotAimEligibility(player, state, findSlingshotAnchorByState(state))
    : { tangentialSpeed: 0, engageEligible: false };
  const activeAnchor = slingshotAnchorTelemetry(state, "");
  const releaseGhost = state.releaseGhost ? {
    ...state.releaseGhost,
    remainingMs: Math.max(0, (state.releaseGhostUntil - runtime.simTime) * 1000),
  } : null;
  return {
    phase: state.phase || "idle",
    aimCue: aimAnchor ? {
      anchor: aimAnchor,
      distance: state.aimDistance || 0,
      tangentialSpeed: aimEligibility.tangentialSpeed,
      engageEligible: aimEligibility.engageEligible,
      coyoteActive: Boolean(state.coyoteActive),
      coyoteRemainingMs: coyote.transportRemainingMs,
      canonicalCoyoteRemainingMs: coyote.canonicalRemainingMs,
      effectiveCoyoteDurationMs: coyote.effectiveDurationMs,
      transportCoyoteRemainingMs: coyote.transportRemainingMs,
    } : null,
    lock: state.engaged || state.phase === "lock" ? {
      anchor: activeAnchor,
      entry: { x: state.entryVX || 0, y: state.entryVY || 0 },
      locked: { x: state.lockedVX || 0, y: state.lockedVY || 0 },
      bendDegrees: state.bendDegrees || 0,
    } : null,
    ownedArc: state.engaged && state.phase === "arc" ? {
      anchor: activeAnchor,
      orbitDir: state.orbitDir || 0,
      arcRadians: state.arcRadians || 0,
      quarterTurns: quarterTurnsFromArc(state.arcRadians, state.chainCount),
      energy: state.energy || 0,
      chainCount: state.chainCount || 0,
    } : null,
    releaseGhost,
  };
}

function buildPlayerRulerFacts(player) {
  const state = ensurePlayerSlingshot(player);
  const coyote = slingshotCoyoteTelemetry(state);
  const mods = slingshotHullMods(player);
  const effectiveChainWindow = SLINGSHOT_SERVER.chainWindow * mods.chainWindowMult;
  const chainElapsed = runtime.simTime - (state.lastReleaseTime ?? -Infinity);
  const chainRemaining = Number.isFinite(chainElapsed)
    ? Math.max(0, effectiveChainWindow - chainElapsed)
    : 0;
  const releaseDirection = slingshotReleaseDirection(player);
  const projectedBoost = (state.energy || 0) * SLINGSHOT_INTERNAL.releaseFillMultiplier * mods.energyMult;
  const livePayoff = state.engaged ? {
    entry: { x: state.entryVX || 0, y: state.entryVY || 0 },
    exit: boundedReleaseDelta({
      velocity: { x: player.vx, y: player.vy },
      direction: releaseDirection,
      entrySpeed: Math.hypot(state.entryVX || 0, state.entryVY || 0),
      arcRadians: state.arcRadians,
      payoffCurve: SLINGSHOT_SERVER.payoffCurve,
      chainCount: state.chainCount,
      desiredBoost: projectedBoost,
    }).exit,
  } : state.lastPayoff;
  const entrySpeed = Math.hypot(livePayoff?.entry?.x || 0, livePayoff?.entry?.y || 0);
  const exitSpeed = Math.hypot(livePayoff?.exit?.x || 0, livePayoff?.exit?.y || 0);
  return {
    source: "authority",
    slingshot: {
      captureRadius_m: {
        well: SLINGSHOT_SERVER.captureRadius,
        star: SLINGSHOT_SERVER.captureRadius * (2 / 3),
        planetoid: SLINGSHOT_SERVER.captureRadius * 0.4,
      },
      magnetism: {
        active: Boolean(state.engaged || state.phase === "lock"),
        entry: { x: state.entryVX || 0, y: state.entryVY || 0 },
        locked: { x: state.lockedVX || 0, y: state.lockedVY || 0 },
        bend_deg: state.bendDegrees || 0,
      },
      coyoteTime: {
        implemented: SLINGSHOT_SERVER.coyoteTime > 0,
        duration_ms: SLINGSHOT_SERVER.coyoteTime,
        effective_duration_ms: coyote.effectiveDurationMs,
        remaining_ms: coyote.canonicalRemainingMs,
        effective_remaining_ms: coyote.transportRemainingMs,
        transport_remaining_ms: coyote.transportRemainingMs,
      },
      payoffCurve: {
        active: Boolean(livePayoff),
        entry: livePayoff?.entry || { x: 0, y: 0 },
        exit: livePayoff?.exit || { x: 0, y: 0 },
        ratio: entrySpeed > 1e-9 ? exitSpeed / entrySpeed : 0,
      },
      chainWindow: {
        duration_s: effectiveChainWindow,
        remaining_s: chainRemaining,
        active: chainRemaining > 0,
      },
    },
  };
}

function engagePlayerSlingshot(player, currentTime, dt = 0) {
  const state = ensurePlayerSlingshot(player);
  if (state.engaged) return false;
  const affordance = findSlingshotAffordance(player, currentTime, dt);
  const anchor = affordance?.anchor;
  if (!anchor) return false;
  const tanSpeed = slingshotTangentialSpeed(player, anchor);
  if (!slingshotEngageEligible(tanSpeed)) return false;

  const mods = slingshotHullMods(player);
  const anchorKey = slingshotAnchorKey(anchor);
  const chainCount = resolveChainCount({
    nowSeconds: currentTime,
    lastReleaseSeconds: state.lastReleaseTime,
    chainWindowSeconds: SLINGSHOT_SERVER.chainWindow * mods.chainWindowMult,
    lastAnchorKey: state.lastReleasedAnchorKey,
    anchorKey,
    previousCount: state.chainCount,
  });

  const dx = worldDisplacement(player.wx, anchor.wx, runtime.session.worldScale);
  const dy = worldDisplacement(player.wy, anchor.wy, runtime.session.worldScale);
  const dist = Math.hypot(dx, dy) || 1e-4;
  const radialNX = dx / dist;
  const radialNY = dy / dist;
  const orbitDir = slingshotOrbitDirection(player, anchor);
  const tangentNX = -radialNY * orbitDir;
  const tangentNY = radialNX * orbitDir;
  const speed = Math.hypot(player.vx, player.vy);
  const locked = rotateToward(
    { x: player.vx, y: player.vy },
    { x: tangentNX * speed, y: tangentNY * speed },
    SLINGSHOT_SERVER.magnetism,
  );
  state.entryVX = player.vx;
  state.entryVY = player.vy;

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
  state.phase = "lock";
  state.lockTick = runtime.tick;
  state.lockUntil = currentTime + SLINGSHOT_INTERNAL.lockTelegraphDurationSeconds;
  state.bendDegrees = locked.bendDegrees;
  state.arcRadians = 0;
  state.previousRadialX = radialNX;
  state.previousRadialY = radialNY;
  state.coyoteActive = false;
  player.vx = locked.vector.x;
  player.vy = locked.vector.y;
  state.lockedVX = player.vx;
  state.lockedVY = player.vy;

  publishEvent("player.slingshotEngaged", {
    clientId: player.clientId,
    anchorId: anchor.id,
    anchorType: anchor.type,
    chainCount,
    phase: state.phase,
    bendDegrees: state.bendDegrees,
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
  const entrySpeed = Math.hypot(state.entryVX || 0, state.entryVY || 0);
  const requestedBoost = baseEnergy * SLINGSHOT_INTERNAL.releaseFillMultiplier * mods.energyMult;
  const dir = slingshotReleaseDirection(player, input);
  const beforeRelease = { x: player.vx, y: player.vy };
  const speedCap = releaseSpeedCap(
    entrySpeed,
    state.arcRadians,
    SLINGSHOT_SERVER.payoffCurve,
    state.chainCount,
  );
  const release = boundedReleaseDelta({
    velocity: beforeRelease,
    direction: dir,
    entrySpeed,
    arcRadians: state.arcRadians,
    payoffCurve: SLINGSHOT_SERVER.payoffCurve,
    chainCount: state.chainCount,
    desiredBoost: requestedBoost,
  });
  state.lastPayoff = {
    entry: { x: state.entryVX || 0, y: state.entryVY || 0 },
    exit: applyBoost ? release.exit : beforeRelease,
    direction: { x: dir.x, y: dir.y },
    speedCap,
    arcRadians: state.arcRadians,
    quarterTurns: quarterTurnsFromArc(state.arcRadians, state.chainCount),
  };
  if (applyBoost) {
    player.vx = release.exit.x;
    player.vy = release.exit.y;
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
  state.arcRadians = 0;
  state.previousRadialX = 0;
  state.previousRadialY = 0;
  state.phase = "release-ghost";
  state.releaseGhostUntil = currentTime + SLINGSHOT_INTERNAL.releaseGhostDurationSeconds;
  state.releaseGhost = {
    anchor: {
      id: previousAnchorId,
      type: previousAnchorType,
      wx: state.aimAnchorWX,
      wy: state.aimAnchorWY,
      range: state.aimAnchorRange,
    },
    entry: { x: state.entryVX || 0, y: state.entryVY || 0 },
    exit: applyBoost ? release.exit : beforeRelease,
    direction: { x: dir.x, y: dir.y },
    speedCap,
    quarterTurns: state.lastPayoff.quarterTurns,
  };

  publishEvent("player.slingshotReleased", {
    clientId: player.clientId,
    anchorId: previousAnchorId,
    anchorType: previousAnchorType,
    reason,
    energyBanked: baseEnergy,
    totalEnergyAwarded: applyBoost ? Math.hypot(release.delta.x, release.delta.y) : 0,
    chainCount: state.chainCount || 1,
    speedCap,
    exitSpeed: Math.hypot(player.vx, player.vy),
  });
  return { totalEnergy: Math.hypot(release.delta.x, release.delta.y), baseEnergy, chainCount: state.chainCount || 1 };
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
  let dx = worldDisplacement(player.wx, anchor.wx, runtime.session.worldScale);
  let dy = worldDisplacement(player.wy, anchor.wy, runtime.session.worldScale);
  let dist = Math.hypot(dx, dy) || 1e-4;
  if (dist > anchor.range * 1.1) {
    if (!input?.slingshot) {
      releasePlayerSlingshot(player, runtime.simTime, input, { reason: "range-break" });
      return;
    }

    // A held orbit owns the stick until deliberate button-up. Keep the
    // existing range-break cleanup for released input, but correct a single
    // outward integration step back to the capture boundary so stale held
    // input cannot create a release ghost before the release packet arrives.
    const radialNX = dx / dist;
    const radialNY = dy / dist;
    player.wx = wrapWorldPosition(
      anchor.wx + radialNX * anchor.range,
      runtime.session.worldScale,
    );
    player.wy = wrapWorldPosition(
      anchor.wy + radialNY * anchor.range,
      runtime.session.worldScale,
    );
    const outwardVelocity = player.vx * radialNX + player.vy * radialNY;
    if (outwardVelocity > 0) {
      player.vx -= radialNX * outwardVelocity;
      player.vy -= radialNY * outwardVelocity;
    }
    dx = worldDisplacement(player.wx, anchor.wx, runtime.session.worldScale);
    dy = worldDisplacement(player.wy, anchor.wy, runtime.session.worldScale);
    dist = Math.hypot(dx, dy) || 1e-4;
  }

  const radialNX = dx / dist;
  const radialNY = dy / dist;
  if (runtime.simTime >= state.lockUntil && state.phase === "lock") state.phase = "arc";
  if (Math.hypot(state.previousRadialX, state.previousRadialY) > 0.5) {
    const radialDelta = signedAngle(
      { x: state.previousRadialX, y: state.previousRadialY },
      { x: radialNX, y: radialNY },
    ) * (state.orbitDir || 1);
    if (radialDelta > 0) state.arcRadians += radialDelta;
  }
  state.previousRadialX = radialNX;
  state.previousRadialY = radialNY;
  const orbitDir = state.orbitDir || 1;
  const tangentNX = -radialNY * orbitDir;
  const tangentNY = radialNX * orbitDir;
  const tanSpeed = player.vx * tangentNX + player.vy * tangentNY;
  const proximity = Math.max(0, 1 - dist / Math.max(anchor.range, 1e-4));
  state.energy += SLINGSHOT_INTERNAL.energyAccrualRate
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
  const cancelMag = radialPull * SLINGSHOT_INTERNAL.gravityCancelFraction;
  player.vx += (-radialNX * cancelMag + tangentNX * SLINGSHOT_INTERNAL.tangentialForce) * dt;
  player.vy += (-radialNY * cancelMag + tangentNY * SLINGSHOT_INTERNAL.tangentialForce) * dt;
}

function tickPlayerSlingshot(player, dt, input) {
  const state = ensurePlayerSlingshot(player);
  if (!state.engaged && state.phase === "release-ghost" && runtime.simTime >= state.releaseGhostUntil) {
    state.phase = "idle";
    state.releaseGhost = null;
  }
  if (!state.engaged) updateSlingshotAim(player, runtime.simTime, dt);
  const pendingEdges = Array.isArray(input?.slingshotEdges) ? input.slingshotEdges : [];
  const edgeId = pendingEdges.shift();
  if (edgeId !== undefined) {
    // Edges make the rising press reliable across transport. A held action
    // stays engaged until the authoritative level falls; retain the old
    // edge-only release shape for older clients that send a release edge.
    if (!state.engaged) {
      engagePlayerSlingshot(player, runtime.simTime, dt);
    } else if (!input?.slingshot) {
      releasePlayerSlingshot(player, runtime.simTime, input);
    }
    rememberConsumedSlingshotEdge(state, edgeId);
    state.inputWasDown = Boolean(input?.slingshot);
    if (state.engaged) applyPlayerSlingshotForces(player, dt, input);
    return;
  }
  const down = Boolean(input?.slingshot);
  if (state.engaged && state.inputWasDown && !down) {
    releasePlayerSlingshot(player, runtime.simTime, input);
  } else if (down && !state.inputWasDown && !state.engaged) {
    engagePlayerSlingshot(player, runtime.simTime, dt);
  }
  state.inputWasDown = down;
  if (state.engaged) applyPlayerSlingshotForces(player, dt, input);
}

function rebuildAuthoritativeField() {
  if (!runtime.session?.worldScale || !runtime.session?.flowFieldCellSize) {
    runtime.coarseField = null;
    return;
  }
  runtime.coarseField = buildCoarseFlowField({
    worldScale: runtime.session.worldScale,
    cellSize: runtime.session.flowFieldCellSize,
    wells: runtime.mapState.wells,
    waveRings: runtime.waveRings,
    seededSea: runtime.session.seededSea,
    wellGravityScale: SERVER_WELLS.shipPullStrength,
    wellGravityFalloff: SERVER_WELLS.shipPullFalloff,
    wellGravityMaxRange: SERVER_WELLS.maxRange,
    wellCurrentScale: SERVER_WELLS.currentStrength,
    wellCurrentFalloff: SERVER_WELLS.currentFalloff,
    wellCurrentMaxRange: SERVER_WELLS.currentRange,
    waveShipPush: WAVE_SERVER.waveShipPush,
    waveWidth: WAVE_SERVER.waveWidth,
    collapseParameters: runtime.collapseEpochState?.parameterVector,
    maxCells: runtime.session.useCoarseField
      ? runtime.session.maxCoarseFieldCells
      : Infinity,
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
    const sx = wrapWorldPosition(ax + dx * t, ws);
    const sy = wrapWorldPosition(ay + dy * t, ws);
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
  const noise = 1.0 + (currentRNG('aiPerception')() - 0.5) * AI_PLAYER_CONFIG.perceptionNoise * 2;
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
  for (const entity of runtime.inhibitorEntities) {
    if (entity.lifecycle === "expired") continue;
    const inhD = worldDistance(wreck.wx, wreck.wy, entity.wx, entity.wy, ws);
    const threatRadius = entity.kind === "vessel" ? 0.5 : 0.4;
    if (inhD < threatRadius) threat = Math.max(threat, 1 - inhD / threatRadius);
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

  return score;
}

function aiShouldExtract(ai) {
  const w = ai.personalityWeights;
  const cargoValue = ai.cargo.reduce((s, item) => s + (item ? (item.value || 0) : 0), 0);
  const cargoCount = ai.cargo.filter(Boolean).length;
  const portalsAlive = runtime.mapState.portals.filter(isPortalAvailable).length;
  const ecologyPhase = runtime.inhibitor.phase;

  // Hard triggers
  if (ecologyPhase >= 3) return true;
  if (portalsAlive <= 1) return true;
  if (runtime.simTime > runtime.session.runDurationSeconds - 30) return true;

  // Soft triggers
  if (cargoValue >= w.minCargoValue) return true;
  if (cargoCount >= ai.aiState.lootTarget) return true;
  if (portalsAlive <= w.panicPortalCount) return true;
  if (ecologyPhase >= 2 && cargoCount >= 3) return true;

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
  const nearbyEcology = runtime.inhibitorEntities
    .filter((entity) => entity.lifecycle !== "expired")
    .map((entity) => ({ entity, distance: worldDistance(ai.wx, ai.wy, entity.wx, entity.wy, ws) }))
    .sort((a, b) => a.distance - b.distance)[0];
  if (nearbyEcology && nearbyEcology.distance < 0.4) {
    const inhDist = nearbyEcology.distance;
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
      wrapWorldPosition(ai.wx + perpX * 0.1, ws),
      wrapWorldPosition(ai.wy + perpY * 0.1, ws)
    );
    const rightFlow = estimateFlow(
      wrapWorldPosition(ai.wx - perpX * 0.1, ws),
      wrapWorldPosition(ai.wy - perpY * 0.1, ws)
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
      const target = runtime.inhibitorEntities
        .filter((entity) => entity.lifecycle !== "expired")
        .sort((a, b) => worldDistance(player.wx, player.wy, a.wx, a.wy, ws)
          - worldDistance(player.wx, player.wy, b.wx, b.wy, ws))[0];
      if (!target) {
        ai.goal = "loot";
        continue;
      }
      const inhDX = worldDisplacement(target.wx, player.wx, ws);
      const inhDY = worldDisplacement(target.wy, player.wy, ws);
      const inhDist = Math.hypot(inhDX, inhDY);
      if (inhDist > 0.01) {
        targetWX = wrapWorldPosition(player.wx + (inhDX / inhDist) * 0.5, ws);
        targetWY = wrapWorldPosition(player.wy + (inhDY / inhDist) * 0.5, ws);
      }
      ai.thrustIntensity = w.maxThrust;
    }

    if (targetWX !== null) {
      aiNavigateToward(player, targetWX, targetWY, dt);
    } else {
      // Drift
      ai.thrustIntensity = 0.05;
      ai.facingAngle += (currentRNG('aiDrift')() - 0.5) * 0.1 * dt;
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
    // Wake Cloak: keep the existing quieting affordance without restoring
    // player-facing signal bands.
    if (as.wakeCloakCooldown > 0) as.wakeCloakCooldown -= dt;
    if (ability1Pressed && as.wakeCloakCooldown <= 0) {
      player.noise.audibleRadiusMeters = Math.min(
        player.noise.audibleRadiusMeters,
        NOISE_CONFIG.continuous.withFlowMeters,
      );
      player.noise.continuousRadiusMeters = Math.min(
        player.noise.continuousRadiusMeters,
        NOISE_CONFIG.continuous.withFlowMeters,
      );
      as.wakeCloakCooldown = HULL_DEFINITIONS.shroud.abilities.wakeCloak.cooldown;
      publishEvent("ability.activated", { clientId: player.clientId, ability: "wakeCloak" });
    }

    // Ghost Trail: passive — visual quiet state, not an Inhibitor trigger.
    as.ghostTrailActive = player.noise.audibleRadiusMeters <= NOISE_CONFIG.continuous.withFlowMeters;

    // Decoy Flare: ability2 spawns decoy
    if (as.decoyCooldown > 0) as.decoyCooldown -= dt;
    if (ability2Pressed && as.decoyCharges > 0 && as.decoyCooldown <= 0) {
      as.decoyCharges--;
      as.decoyCooldown = HULL_DEFINITIONS.shroud.abilities.decoyFlare.cooldown;
      emitPlayerNoise(player, NOISE_CONFIG.impulses.decoyLaunchMeters, "DECOY", { action: "decoy-launch" });
      as.decoys.push({
        wx: player.wx, wy: player.wy,
        noiseRadiusMeters: NOISE_CONFIG.impulses.decoyLaunchMeters, age: 0,
      });
      publishEvent("ability.activated", { clientId: player.clientId, ability: "decoyFlare" });
    }

    // Tick decoys
    for (let i = as.decoys.length - 1; i >= 0; i--) {
      as.decoys[i].age += dt;
      const flow = estimateFlowSample(as.decoys[i].wx, as.decoys[i].wy).current;
      as.decoys[i].wx = wrapWorldPosition(as.decoys[i].wx + flow.x * dt, ws);
      as.decoys[i].wy = wrapWorldPosition(as.decoys[i].wy + flow.y * dt, ws);
      as.decoys[i].noiseRadiusMeters = Math.max(0,
        as.decoys[i].noiseRadiusMeters * (1 - HULL_DEFINITIONS.shroud.abilities.decoyFlare.decayRate * dt));
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
          target.wx = wrapWorldPosition(target.wx + (dx / d) * tractorCfg.pullSpeed * dt, ws);
          target.wy = wrapWorldPosition(target.wy + (dy / d) * tractorCfg.pullSpeed * dt, ws);
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
  const rng = currentRNG('sentrySpawn');
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
        wx: wrapWorldPosition(well.wx + Math.cos(angle) * orbitRadius, mapState.worldScale),
        wy: wrapWorldPosition(well.wy + Math.sin(angle) * orbitRadius, mapState.worldScale),
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
      sentry.wx = wrapWorldPosition(well.wx + Math.cos(sentry.orbitAngle) * sentry.orbitRadius, ws);
      sentry.wy = wrapWorldPosition(well.wy + Math.sin(sentry.orbitAngle) * sentry.orbitRadius, ws);

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
        sentry.wx = wrapWorldPosition(sentry.wx + (dx / dist) * cfg.lungeSpeed * dt, ws);
        sentry.wy = wrapWorldPosition(sentry.wy + (dy / dist) * cfg.lungeSpeed * dt, ws);
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
          emitPlayerNoise(player, cfg.bumpNoiseMeters, "IMPACT", { action: "sentry-contact" });
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
      const targetX = wrapWorldPosition(well.wx + Math.cos(sentry.orbitAngle) * sentry.orbitRadius, ws);
      const targetY = wrapWorldPosition(well.wy + Math.sin(sentry.orbitAngle) * sentry.orbitRadius, ws);
      const dx = worldDisplacement(sentry.wx, targetX, ws);
      const dy = worldDisplacement(sentry.wy, targetY, ws);
      const dist = Math.hypot(dx, dy);
      if (dist > 0.005) {
        sentry.wx = wrapWorldPosition(sentry.wx + (dx / dist) * cfg.patrolSpeed[0] * dt, ws);
        sentry.wy = wrapWorldPosition(sentry.wy + (dy / dist) * cfg.patrolSpeed[0] * dt, ws);
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

  // Blooms are local listener entities. Their existence is not gated by a
  // global player meter, so Conductor timing and Noise remain separate.
  let spawnPlayer = null;
  for (const player of runtime.players.values()) {
    if (player.status !== "alive") continue;
    spawnPlayer = spawnPlayer || player;
  }

  const faunaRng = currentRNG('fauna');

  // Spawn drift jellies to maintain count
  const jellyCount = fauna.filter(f => f.type === "jelly" && f.alive).length;
  if (jellyCount < cfg.jellyCount && fauna.length < cfg.maxTotal) {
    runtime._jellySpawnTimer = (runtime._jellySpawnTimer || 0) + dt;
    if (runtime._jellySpawnTimer >= cfg.jellySpawnInterval) {
      runtime._jellySpawnTimer = 0;
      fauna.push({
        id: nextSeededToken(`fauna-${runtime.tick}`, "faunaIds"),
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
    const bloomRate = spawnPlayer ? cfg.bloomSpawnRatePerSecond : 0;
  if (bloomRate > 0 && spawnPlayer && fauna.length < cfg.maxTotal) {
    runtime._bloomSpawnAccum = (runtime._bloomSpawnAccum || 0) + bloomRate * dt;
    while (runtime._bloomSpawnAccum >= 1) {
      runtime._bloomSpawnAccum -= 1;
      const angle = faunaRng() * Math.PI * 2;
      const dist = cfg.bloomSpawnRange[0] + faunaRng() * (cfg.bloomSpawnRange[1] - cfg.bloomSpawnRange[0]);
      fauna.push({
        id: nextSeededToken(`fauna-${runtime.tick}`, "faunaIds"),
        type: "bloom",
        wx: wrapWorldPosition(spawnPlayer.wx + Math.cos(angle) * dist, ws),
        wy: wrapWorldPosition(spawnPlayer.wy + Math.sin(angle) * dist, ws),
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

    // Blooms use their existing lightweight velocity/force path to investigate
    // a remembered Noise source. Jellies remain ambient and never consume it.
    if (f.type === "bloom"
      && (f.listenerState === "HEARD" || f.listenerState === "TRACKING")
      && Number.isFinite(f.lastHeardWX)
      && Number.isFinite(f.lastHeardWY)) {
      const dx = worldDisplacement(f.wx, f.lastHeardWX, ws);
      const dy = worldDisplacement(f.wy, f.lastHeardWY, ws);
      const distance = Math.hypot(dx, dy);
      if (distance > 0.001) {
        const force = f.listenerState === "TRACKING"
          ? cfg.bloomBumpForce * 1.5
          : cfg.bloomBumpForce;
        f.vx += (dx / distance) * force * dt;
        f.vy += (dy / distance) * force * dt;
      }
    }

    const dragRetention = Math.pow(cfg.dragRetentionPerSecond, dt);
    f.vx *= dragRetention;
    f.vy *= dragRetention;
    f.wx = wrapWorldPosition(f.wx + f.vx * dt, ws);
    f.wy = wrapWorldPosition(f.wy + f.vy * dt, ws);

    // Collision with players
    for (const player of runtime.players.values()) {
      if (player.status !== "alive") continue;
      const pd = worldDistance(f.wx, f.wy, player.wx, player.wy, ws);
      const bumpRadius = f.type === "jelly" ? 0.04 : 0.03;
      if (pd < bumpRadius) {
        const bumpForce = f.type === "jelly" ? cfg.jellyBumpForce : cfg.bloomBumpForce;
        const bx = worldDisplacement(f.wx, player.wx, ws);
        const by = worldDisplacement(f.wy, player.wy, ws);
        const bd = Math.hypot(bx, by);
        if (bd > 0.001) {
          player.vx += (bx / bd) * bumpForce;
          player.vy += (by / bd) * bumpForce;
        }
        emitPlayerNoise(player, NOISE_CONFIG.impulses.collisionMeters, "IMPACT", { action: "fauna-contact" });
        f.alive = false; // consumed on contact
        break;
      }
    }
  }
}

// --- Inhibitor Ecology ---
// Conductor phase fronts admit accumulating Glitches, Swarms, and Vessels.

function getScheduledInhibitorWave(phase) {
  return runtime.inhibitorSchedule?.severityWaves?.find((wave) => wave.tier === phase) || null;
}

function publishInhibitorPhaseEvent(phase, wave, extra = {}) {
  const event = wave || {};
  const waveId = event.waveId || event.id || `inhibitor:phase-${phase}`;
  const scheduledTime = event.time ?? event.metadata?.scheduledTime ?? 0;
  const budget = event.budget ?? event.metadata?.budget ?? 0;
  const payload = {
    conductorId: "match-conductor",
    waveId,
    phase,
    tier: event.tier ?? event.metadata?.tier ?? phase,
    scheduledTime,
    budget,
    announced: extra.announced !== false,
    ...extra,
  };
  publishEvent("inhibitor.waveAnnounced", payload);
  publishEvent("inhibitor.phase", payload);
  return payload;
}

function setInhibitorPhase(phase, wave, payload = {}) {
  const inh = runtime.inhibitor;
  if (inh.phase === phase && !payload.debug) return false;
  inh.phase = phase;
  const event = wave || {
    id: `inhibitor:debug:phase-${phase}`,
    time: runtime.simTime,
    tier: phase,
    budget: INHIBITOR_CONFIG.phaseWaveBudgets[phase] ?? 0,
  };
  const eventPayload = publishInhibitorPhaseEvent(phase, event, {
    ...payload,
    announced: payload.announced !== undefined ? payload.announced : !payload.debug,
  });
  inh.waveId = eventPayload.waveId;
  inh.scheduledTime = eventPayload.scheduledTime;
  inh.waveBudget = eventPayload.budget;
  if (phase === 2) publishEvent("inhibitor.wake", { phase, ...eventPayload });
  return true;
}

function advanceInhibitorClock() {
  const inh = runtime.inhibitor;
  for (const wave of runtime.inhibitorSchedule?.severityWaves || []) {
    if (wave.time > runtime.simTime || wave.tier <= inh.phase) continue;
    setInhibitorPhase(wave.tier, wave);
  }
}

function spawnConductorGlitch() {
  const ecology = runtime.inhibitorEcology;
  const cfg = INHIBITOR_ECOLOGY_CONFIG.glitch;
  const worldScale = runtime.session.worldScale;
  const sequence = Math.max(0, Math.trunc(Number(ecology.glitchSequence) || 0)) + 1;
  const id = `inhibitor-glitch-${sequence}`;
  const spawn = runtime.conductor.selectToroidalSpawn({
    streamName: `inhibitor.glitch.${sequence}`,
    anchor: { wx: worldScale * 0.5, wy: worldScale * 0.5 },
    worldScale,
    minRadius: 0,
    maxRadius: worldScale * 0.45,
  });
  const driftRng = currentRNG(`inhibitor.glitch.drift.${sequence}`);
  const driftAngle = driftRng() * Math.PI * 2;
  const driftSpeed = cfg.driftSpeed * (0.65 + driftRng() * 0.35);
  const entity = createGlitchEntity({
    id,
    wx: spawn.wx,
    wy: spawn.wy,
    vx: Math.cos(driftAngle) * driftSpeed,
    vy: Math.sin(driftAngle) * driftSpeed,
    driftPhase: driftAngle,
    createdAt: runtime.simTime,
    createdTick: runtime.tick,
    config: cfg,
  });
  ecology.glitchSequence = sequence;
  runtime.inhibitorEntities.push(entity);
  publishEvent("inhibitor.glitchSpawned", {
    conductorId: runtime.conductor?.id || "match-conductor",
    entityId: entity.id,
    kind: entity.kind,
    phase: runtime.inhibitor.phase,
    scheduledTime: runtime.simTime,
    wx: entity.wx,
    wy: entity.wy,
  }, { lane: "vfx", subject: entity.id });
  return entity;
}

function spawnConductorSwarm() {
  const ecology = runtime.inhibitorEcology;
  const cfg = INHIBITOR_ECOLOGY_CONFIG.swarm;
  const worldScale = runtime.session.worldScale;
  const sequence = Math.max(0, Math.trunc(Number(ecology.swarmSequence) || 0)) + 1;
  const id = `inhibitor-swarm-${sequence}`;
  const spawn = runtime.conductor.selectToroidalSpawn({
    streamName: `inhibitor.swarm.${sequence}`,
    anchor: { wx: worldScale * 0.5, wy: worldScale * 0.5 },
    worldScale,
    minRadius: worldScale * 0.08,
    maxRadius: worldScale * 0.45,
  });
  const rng = currentRNG(`inhibitor.swarm.heading.${sequence}`);
  const entity = createSwarmEntity({
    id,
    wx: spawn.wx,
    wy: spawn.wy,
    targetWX: spawn.wx,
    targetWY: spawn.wy,
    searchAngle: rng() * Math.PI * 2,
    createdAt: runtime.simTime,
    createdTick: runtime.tick,
    config: cfg,
  });
  ecology.swarmSequence = sequence;
  runtime.inhibitorEntities.push(entity);
  publishEvent("inhibitor.swarmSpawned", {
    conductorId: runtime.conductor?.id || "match-conductor",
    entityId: entity.id,
    kind: entity.kind,
    phase: runtime.inhibitor.phase,
    scheduledTime: runtime.simTime,
    wx: entity.wx,
    wy: entity.wy,
  }, { lane: "vfx", subject: entity.id });
  return entity;
}

function spawnConductorVessel() {
  const ecology = runtime.inhibitorEcology;
  const cfg = INHIBITOR_ECOLOGY_CONFIG.vessel;
  const worldScale = runtime.session.worldScale;
  const sequence = Math.max(0, Math.trunc(Number(ecology.vesselSequence) || 0)) + 1;
  const edges = ["top", "right", "bottom", "left"];
  const edge = edges[(sequence - 1) % edges.length];
  const edgeRng = currentRNG(`inhibitor.vessel.edge.${sequence}`);
  const edgeProgress = edgeRng();
  const id = `inhibitor-vessel-${sequence}`;
  const entity = createVesselEntity({
    id,
    edge,
    edgeProgress,
    worldScale,
    createdAt: runtime.simTime,
    createdTick: runtime.tick,
    config: cfg,
  });
  ecology.vesselSequence = sequence;
  runtime.inhibitorEntities.push(entity);
  const payload = {
    conductorId: runtime.conductor?.id || "match-conductor",
    entityId: entity.id,
    kind: entity.kind,
    phase: runtime.inhibitor.phase,
    scheduledTime: runtime.simTime,
    inboundTellSeconds: entity.inboundTellSeconds,
    edge: entity.edge,
    wx: entity.wx,
    wy: entity.wy,
    vx: entity.vx,
    vy: entity.vy,
    awareness: entity.awareness,
  };
  publishEvent("inhibitor.vesselInbound", payload, { lane: "vfx", subject: entity.id });
  publishEvent("inhibitor.vesselSpawned", payload, { lane: "vfx", subject: entity.id });
  return entity;
}

function recordTotalCapSuppression({ kind, requiredPhase, nextKey, phase, simTime, config }) {
  if (Number(phase) < requiredPhase || Number(simTime) < Number(runtime.inhibitorEcology[nextKey])) return false;
  if (!totalCapBlocksSpawn(runtime.inhibitorEntities, config)) return false;
  const counters = runtime.inhibitorEcology.suppressedByTotalCap || {
    glitch: 0,
    swarm: 0,
    vessel: 0,
  };
  counters[kind] = Math.max(0, Math.trunc(Number(counters[kind]) || 0)) + 1;
  runtime.inhibitorEcology.suppressedByTotalCap = counters;
  runtime.inhibitorEcology[nextKey] = runtime.simTime + config.spawnCadenceSeconds;
  return true;
}

function applyInhibitorContacts(contacts, cause) {
  for (const contact of contacts) {
    const player = runtime.players.get(contact.clientId);
    if (!player || player.status !== "alive") continue;
    publishEvent("player.hullDamaged", {
      clientId: player.clientId,
      cause,
      entityId: contact.entityId,
      damage: contact.damage,
      hullDamage: contact.totalDamage,
    }, { lane: "neighborhood", subject: player.clientId });
    if (!contact.lethal || player.status !== "alive") continue;
    player.status = "dead";
    player.vx = 0;
    player.vy = 0;
    publishEvent("player.died", {
      clientId: player.clientId,
      cause,
      entityId: contact.entityId,
    });
    commitPlayerOutcome(player, "dead");
    player.cargo = new Array(player.brain?.cargoSlots || PLAYER_CARGO_SLOTS).fill(null);
  }
}

function tickInhibitorEcology(dt, noiseSources = []) {
  const ecology = runtime.inhibitorEcology;
  const cfg = INHIBITOR_ECOLOGY_CONFIG.glitch;
  const swarmCfg = INHIBITOR_ECOLOGY_CONFIG.swarm;
  const vesselCfg = INHIBITOR_ECOLOGY_CONFIG.vessel;
  const worldScale = runtime.session.worldScale;
  // Expired entries remain visible for one snapshot so lifecycle is truthful,
  // then the bounded active collection drops them on the next tick.
  for (let index = runtime.inhibitorEntities.length - 1; index >= 0; index -= 1) {
    if (runtime.inhibitorEntities[index].lifecycle === "expired") {
      runtime.inhibitorEntities.splice(index, 1);
    }
  }

  if (runtime.inhibitor.phase >= 1 && ecology.nextGlitchSpawnAt == null) {
    ecology.nextGlitchSpawnAt = runtime.simTime;
  }
  if (shouldSpawnGlitch({
    phase: runtime.inhibitor.phase,
    simTime: runtime.simTime,
    nextSpawnAt: ecology.nextGlitchSpawnAt,
    entities: runtime.inhibitorEntities,
    config: cfg,
  })) {
    spawnConductorGlitch();
    ecology.nextGlitchSpawnAt = runtime.simTime + cfg.spawnCadenceSeconds;
  } else {
    recordTotalCapSuppression({
      kind: "glitch",
      requiredPhase: 1,
      nextKey: "nextGlitchSpawnAt",
      phase: runtime.inhibitor.phase,
      simTime: runtime.simTime,
      config: cfg,
    });
  }

  if (runtime.inhibitor.phase >= 2 && ecology.nextSwarmSpawnAt == null) {
    ecology.nextSwarmSpawnAt = runtime.simTime;
  }
  if (shouldSpawnSwarm({
    phase: runtime.inhibitor.phase,
    simTime: runtime.simTime,
    nextSpawnAt: ecology.nextSwarmSpawnAt,
    entities: runtime.inhibitorEntities,
    config: swarmCfg,
  })) {
    spawnConductorSwarm();
    ecology.nextSwarmSpawnAt = runtime.simTime + swarmCfg.spawnCadenceSeconds;
  } else {
    recordTotalCapSuppression({
      kind: "swarm",
      requiredPhase: 2,
      nextKey: "nextSwarmSpawnAt",
      phase: runtime.inhibitor.phase,
      simTime: runtime.simTime,
      config: swarmCfg,
    });
  }

  if (runtime.inhibitor.phase >= 3 && ecology.nextVesselSpawnAt == null) {
    ecology.nextVesselSpawnAt = runtime.simTime;
  }
  if (shouldSpawnVessel({
    phase: runtime.inhibitor.phase,
    simTime: runtime.simTime,
    nextSpawnAt: ecology.nextVesselSpawnAt,
    entities: runtime.inhibitorEntities,
    config: vesselCfg,
  })) {
    spawnConductorVessel();
    ecology.nextVesselSpawnAt = runtime.simTime + vesselCfg.spawnCadenceSeconds;
  } else {
    recordTotalCapSuppression({
      kind: "vessel",
      requiredPhase: 3,
      nextKey: "nextVesselSpawnAt",
      phase: runtime.inhibitor.phase,
      simTime: runtime.simTime,
      config: vesselCfg,
    });
  }

  for (const entity of runtime.inhibitorEntities) {
    if (entity.kind === "glitch") {
      advanceGlitchEntity(entity, {
        dt,
        worldScale,
        tick: runtime.tick,
        simTime: runtime.simTime,
        config: cfg,
      });
    } else if (entity.kind === "swarm") {
      advanceSwarmEntity(entity, {
        dt,
        worldScale,
        tick: runtime.tick,
        simTime: runtime.simTime,
        noiseSources,
        config: swarmCfg,
      });
    } else if (entity.kind === "vessel") {
      advanceVesselEntity(entity, {
        dt,
        worldScale,
        tick: runtime.tick,
        simTime: runtime.simTime,
        players: runtime.players.values(),
      });
    }
  }
  const glitchContacts = applyGlitchForcesAndContacts(runtime.inhibitorEntities, runtime.players.values(), {
    dt,
    worldScale,
    tick: runtime.tick,
  });
  applyInhibitorContacts(glitchContacts, "inhibitor_glitch");
  const swarmContacts = applySwarmContacts(runtime.inhibitorEntities, runtime.players.values(), {
    dt,
    worldScale,
    tick: runtime.tick,
  });
  applyInhibitorContacts(swarmContacts, "inhibitor_swarm");
  const vesselContacts = applyVesselForcesAndContacts(runtime.inhibitorEntities, runtime.players.values(), {
    dt,
    worldScale,
    tick: runtime.tick,
  });
  applyInhibitorContacts(vesselContacts, "inhibitor_vessel");

  for (const vessel of runtime.inhibitorEntities) {
    if (vessel.kind !== "vessel" || vessel.lifecycle !== "alive") continue;
    if (!(vessel.overdriveWellIds instanceof Set)) vessel.overdriveWellIds = new Set();
    for (const well of runtime.mapState.wells) {
      const distance = worldDistance(vessel.wx, vessel.wy, well.wx, well.wy, worldScale);
      if (distance > vessel.wellOverdriveRange) continue;
      const wellKey = String(well.id || well.name || "well");
      if (vessel.overdriveWellIds.has(wellKey)) continue;
      const change = applyWellOverdrive({
        well,
        source: vessel.id,
        time: runtime.simTime,
        config: vesselCfg,
      });
      Object.assign(well, change.after);
      vessel.overdriveWellIds.add(wellKey);
      publishEvent("inhibitor.wellOverdriven", {
        conductorId: runtime.conductor?.id || "match-conductor",
        entityId: vessel.id,
        wellId: well.id,
        tier: change.tier,
        multiplier: change.multiplier,
        source: change.source,
        time: change.time,
      }, { lane: "vfx", subject: well.id });
    }
  }
}

function collectInhibitorNoiseSources({ includeDecoys = true, includeZeroPlayers = false } = {}) {
  const sources = [];
  for (const player of runtime.players.values()) {
    if (player.status !== "alive") continue;
    const radiusMeters = Number(player.noise?.audibleRadiusMeters) || 0;
    if (includeZeroPlayers || radiusMeters > 0) {
      sources.push({
        kind: player.isAI ? "ai-player" : "player",
        clientId: player.clientId,
        player,
        wx: player.wx,
        wy: player.wy,
        radiusMeters,
      });
    }
    if (!includeDecoys) continue;
    const decoys = player.abilityState?.decoys;
    if (!Array.isArray(decoys)) continue;
    for (const decoy of decoys) {
      const decoyRadiusMeters = Number(decoy.noiseRadiusMeters) || 0;
      if (decoyRadiusMeters <= 0) continue;
      sources.push({
        kind: "decoy",
        clientId: player.clientId,
        wx: decoy.wx,
        wy: decoy.wy,
        radiusMeters: decoyRadiusMeters,
      });
    }
  }
  sources.sort((a, b) => b.radiusMeters - a.radiusMeters);
  return sources;
}

function tickInhibitor(dt) {
  const inh = runtime.inhibitor;
  inh.localTime += dt;
  // Conductor time alone advances Inhibitor phases. Noise is only a Swarm
  // acquisition input and never drives Vessel awareness or exfil timing.
  advanceInhibitorClock();
  tickInhibitorEcology(dt, collectInhibitorNoiseSources({ includeDecoys: true }));

}

function tickAuthorityPlayers(dt, relevance) {
  const forceLedgers = new Map();
  for (const player of runtime.players.values()) {
    if (player.status === "alive") forceLedgers.set(player, beginForceLedger(player, dt, runtime.tick));
  }

  for (const player of runtime.players.values()) {
    if (player.status !== "alive") continue;
    const forceLedger = forceLedgers.get(player);

    if (player.effectState.pulseCooldownRemaining > 0) {
      player.effectState.pulseCooldownRemaining = Math.max(0, player.effectState.pulseCooldownRemaining - dt);
    }
    let input = expireHeldInput(player);
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

    const playerDt = dt;
    setForceLedgerDt(forceLedger, playerDt);
    // Tick hull abilities before physics
    recordForceMutation(forceLedger, "impulse", player, () => tickHullAbilities(player, playerDt));

    const b = player.brain || BRAIN_DEFAULTS;
    const flowSample = estimateFlowSample(player.wx, player.wy);
    const driveStep = applyPlayerDriveAndFlow(player, input, playerDt, {
      brain: b,
      burnModifiers: getBurnModifiers(player),
      flowSample,
    });
    recordForceDeltaV(forceLedger, "thrust", driveStep.thrustDeltaV);
    recordForceDeltaV(forceLedger, "coupling", driveStep.couplingDeltaV);
    player.lastDeliveredThrustIntensity = driveStep.thrustIntensity;

    recordForceMutation(forceLedger, "gravity", player, () => applyWellGravity(player, playerDt));
    if (player.status !== "alive") continue;
    recordForceMutation(forceLedger, "impulse", player, () => tickPlayerSlingshot(player, playerDt, input));
    recordForceMutation(forceLedger, "gravity", player, () => applyStarPush(player, playerDt, relevance.stars));
    recordForceMutation(forceLedger, "gravity", player, () => applyPlanetoidPush(player, playerDt, relevance.planetoids));
    recordForceMutation(forceLedger, "wave", player, () => applyWaveRingPush(player, playerDt));
    const movementStartWX = player.wx;
    const movementStartWY = player.wy;
    const brakeStep = applyPlayerBrakeAndIntegrate(player, input, playerDt, {
      brain: b,
      thrustIntensity: driveStep.thrustIntensity,
      worldScale: runtime.session.worldScale,
    });
    recordForceDeltaV(forceLedger, "thrust", brakeStep.thrustDeltaV);
    recordForceDeltaV(forceLedger, "drag", brakeStep.dragDeltaV);
    player.lastDeliveredBrakeIntensity = brakeStep.brakeIntensity;
    const sweep = movementSweep(movementStartWX, movementStartWY, player);
    recordForceMutation(forceLedger, "impulse", player, () => applySweptWellContacts(player, playerDt, sweep));
    if (player.status !== "alive") continue;
    recordForceMutation(forceLedger, "impulse", player, () => applyScavengerBump(player, relevance.scavengers, sweep));

    tickPlayerPickups(player, relevance.wrecks, sweep);
    tickExtraction(player, extractConfirm);
    if (player.status !== "alive") continue;
    tickPlayerNoise(player, playerDt);
  }
  for (const [player, ledger] of forceLedgers) {
    player.forceLedger = finalizeForceLedger(ledger, player);
  }
}

function tickSim() {
  if (runtime.session.status !== "running") return;
  if (benchAuthority) {
    const dt = 1 / AUTHORITY_INTEGRATION_HZ;
    runtime.emptySince = null;
    runtime.tick += 1;
    runtime.simTime = Number((runtime.simTime + dt).toFixed(9));
    benchAuthority.tick(dt);
    return;
  }
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
  // Every authority-owned system advances together. Snapshot cadence and
  // relevance budgets may vary by map; simulation dt may not.
  const dt = 1 / AUTHORITY_INTEGRATION_HZ;
  runtime.tick += 1;
  runtime.simTime += dt;
  tickCollapseEpochs();
  const relevance = buildRelevanceView();

  tickWells(dt);
  tickStars(dt, relevance.stars);
  tickWrecks(dt, relevance.wrecks);
  tickPlanetoids(dt, relevance.planetoids);
  tickGrowth(dt);
  const portalsChanged = tickPortals(dt);
  // Portal residence is queried by authority in this same tick. Rebuild the
  // spatial mirror after lifecycle changes so a newly opened aperture cannot
  // be visible in the world while absent from the interaction query.
  if (portalsChanged) refreshBallparkMirror("portal-lifecycle");
  if (maybeEnforceMatchLifetime()) return;
  tickWreckWaves(dt);
  tickScavengers(dt, relevance.scavengers);
  tickWaveRings(dt);
  runtime.session.seededSea = advanceSeededSea(runtime.session.seededSea, dt);
  runtime.session.seededSeaHash = hashSeededSea(runtime.session.seededSea);
  rebuildAuthoritativeField();
  tickAIPlayers(dt);
  tickSentries(dt);
  tickFauna(dt);
  tickInhibitor(dt);
  maybeCollapseRun();
  if (runtime.session.status !== "running") return;

  tickAuthorityPlayers(dt, relevance);
  for (const player of runtime.players.values()) {
    if (player.status === "alive") refreshPlayerNoiseListeners(player);
  }
  if (maybeEndTerminalSession()) return;
  refreshBallparkMirror("tick");

  const tickCostMs = performance.now() - tickStart;
  recordTickTiming(tickCostMs);
  const overload = advanceOverload(runtime.overload, { tickCostMs });
  runtime.session.overloadPressure = overload.pressure;
  if (overload.changed) {
    applyOverloadProfile();
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
  if (benchAuthority) return AUTHORITY_INTEGRATION_HZ;
  if (getHumanPlayerCount({ activeOnly: true }) === 0) return IDLE_SESSION_TICK_HZ;
  return runtime.session.tickHz;
}

function stopTickLoop() {
  tickLoop?.stop();
  tickLoop = null;
  currentLoopTickHz = 0;
  runtime.loopTickHz = 0;
}

function restartTickLoop() {
  const nextTickHz = getLoopTickHz();
  if (nextTickHz <= 0) {
    stopTickLoop();
    return;
  }
  if (tickLoop && currentLoopTickHz === nextTickHz) return;
  stopTickLoop();
  currentLoopTickHz = nextTickHz;
  runtime.loopTickHz = nextTickHz;
  tickLoop = createAuthorityDeadlineLoop({ tick: tickSim });
  tickLoop.start(nextTickHz);
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

async function routeRequest(req, res) {
  if (req.method === "GET" && req.url === "/health") {
    const idleState = getIdleState();
    sendJson(res, 200, {
      ok: true,
      protocolVersion: PROTOCOL_VERSION,
      simInstanceId: SIM_INSTANCE_ID,
      controlPlaneUrl: CONTROL_PLANE_URL || null,
      session: getPublicSession(),
      tick: runtime.tick,
      simTime: runtime.simTime,
      playerCount: runtime.players.size,
      mapId: benchAuthority ? benchAuthority.snapshot().galleryId : runtime.mapState.id,
      ballpark: runtime.ballparkMirror ? runtime.ballparkMirror.stats() : null,
      ballparkRelevance: runtime.ballparkRelevance,
      eventJournal: runtime.eventJournal ? runtime.eventJournal.describe() : null,
      snapshotRing: runtime.snapshotRing ? runtime.snapshotRing.describe() : null,
      match: {
        maxSimTime: runtime.session.runDurationSeconds,
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
      timing: {
        tick: summarizeTickTimings(),
      },
      // Keep deadline delivery inspectable without retaining per-tick timing
      // history in the authority process.
      scheduler: tickLoop?.diagnostics() || null,
      idleState,
      shutdownReason: runtime.shutdownReason,
      bench: BENCH_GATE.enabled
        ? { enabled: true, gateSource: BENCH_GATE.source, galleryId: benchAuthority.state().gallery.id }
        : { enabled: false },
    });
    return;
  }

  if (req.url?.startsWith("/bench") && !BENCH_GATE.enabled) {
    sendJson(res, 404, { ok: false, error: "Bench authority is disabled; launch with the explicit Bench gate" });
    return;
  }

  if (req.method === "GET" && req.url === "/bench") {
    sendJson(res, 200, { ok: true, gateSource: BENCH_GATE.source, ...benchAuthority.state() });
    return;
  }

  if (req.method === "POST" && req.url === "/bench/bay") {
    await handleBenchRoute(req, res, (body) => ({ ok: true, ...benchAuthority.activateBay(body.activeBayId) }));
    return;
  }

  if (req.method === "POST" && req.url === "/bench/patch") {
    await handleBenchRoute(req, res, (body) => ({ ok: true, patch: benchAuthority.importPatch(body.patch) }));
    return;
  }

  if (req.method === "POST" && req.url === "/bench/edit") {
    await handleBenchRoute(req, res, (body) => ({
      ok: true,
      entry: benchAuthority.applyEntry({
        adapterId: body.adapterId,
        propertyId: body.propertyId,
        value: body.value,
      }),
      state: benchAuthority.state(),
    }));
    return;
  }

  if (req.method === "POST" && req.url === "/bench/action") {
    await handleBenchRoute(req, res, (body) => ({
      ok: true,
      ...benchAuthority.runScenarioAction({
        entityId: body.entityId,
        adapterId: body.adapterId,
        actionId: body.actionId,
      }),
    }));
    return;
  }

  if (req.method === "POST" && req.url === "/bench/replay") {
    await handleBenchRoute(req, res, () => ({ ok: true, authorityTruth: benchAuthority.replaySameSetup() }));
    return;
  }

  if (req.method === "POST" && req.url === "/bench/reset") {
    await handleBenchRoute(req, res, (body) => {
      let patch;
      if (body.propertyId) patch = benchAuthority.resetProperty(body.adapterId, body.propertyId);
      else if (body.adapterId) patch = benchAuthority.resetType(body.adapterId);
      else patch = benchAuthority.resetAll();
      return { ok: true, patch };
    });
    return;
  }

  if (req.method === "POST" && req.url === "/bench/undo") {
    await handleBenchRoute(req, res, () => ({
      ok: true,
      undone: benchAuthority.undoLastChange(),
      patch: benchAuthority.exportPatch(),
    }));
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
          mapClass: map.mapClass,
          profileId: map.profileId,
          dimensions: { ...map.dimensions },
          name: map.name,
          worldScale: map.worldScale,
          fluidResolution: map.fluidResolution,
          wellCount: map.wells.length,
          starCount: map.stars.length,
          wreckCount: map.wrecks.length,
          planetoidCount: map.planetoids.length,
          simScaleProfile: profile.profileId,
          clientPerfProfile: profile.clientPerfProfile,
          tickHz: AUTHORITY_INTEGRATION_HZ,
          snapshotHz: profile.snapshotHz,
          ...getLegacySessionCompatibility({
            worldScale: map.worldScale,
            mapState: map,
          }),
          useCoarseField: profile.useCoarseField,
          flowFieldCellSize: profile.flowFieldCellSize,
          fieldFlowScale: profile.fieldFlowScale,
          spawnScavengersBase: profile.spawnScavengersBase,
          spawnScavengersPerPlayer: profile.spawnScavengersPerPlayer,
          maxScavengers: profile.maxScavengers,
          localFluidResolution: CLIENT_PERF_PROFILES[profile.clientPerfProfile].fluidResolution,
          localFluidWindowWorldUnits: CLIENT_PERF_PROFILES[profile.clientPerfProfile].localWindowWorldUnits,
          coarseTextureResolution: CLIENT_PERF_PROFILES[profile.clientPerfProfile].coarseTextureResolution,
          maxCoarseFieldCells: profile.maxCoarseFieldCells,
          snapshotBudgetBytes: profile.snapshotBudgetBytes,
          snapshotBudgetBytesPerSecond: profile.snapshotBudgetBytesPerSecond,
          ballparkSyncBudgetMs: profile.ballparkSyncBudgetMs,
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
    sendJson(res, 200, { ok: true, session: getPublicSession(), joinTicket });
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
    sendJson(res, 200, { ok: true, session: getPublicSession(), joinTicket });
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
      const equipped = durableProfile ? durableLoadout.equipped : cloneRetiredSafeItems(body.equipped);
      const consumables = durableProfile ? durableLoadout.consumables : cloneRetiredSafeItems(body.consumables);
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
        player.equipped = cloneRetiredSafeItems(body.equipped);
      }
      if (Array.isArray(body.consumables)) {
        player.consumables = cloneRetiredSafeItems(body.consumables);
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
    sendJson(res, 200, { ok: true, session: getPublicSession(), playerCount: runtime.players.size });
    return;
  }

  if (req.method === "POST" && req.url === "/input") {
    const body = await readJson(req);
    if (runtime.session.status !== "running") {
      sendJson(res, 409, { ok: false, error: "No active session", session: getPublicSession() });
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
      receivedAt: Date.now(),
      slingshotEdges: mergePendingSlingshotEdges(player, acceptedSlingshotEdges),
      pulse: Boolean(player.lastInput.pulse || message.pulse),
      extractConfirm: Boolean(player.lastInput.extractConfirm || message.extractConfirm),
      consumeSlot:
        message.consumeSlot === null || message.consumeSlot === undefined
          ? player.lastInput.consumeSlot
          : message.consumeSlot,
    };
    // A confirmation is a discrete authority action, not held movement. If
    // it arrives while the player is already in a portal, resolve it against
    // the current authoritative position before the next movement tick can
    // carry the ship back out of the aperture. The same exact residence check
    // still rejects a command that arrives after the player has left.
    if (message.extractConfirm && player.status === "alive" && player.portalInteraction?.ready === true) {
      player.lastInput = { ...player.lastInput, extractConfirm: false };
      tickExtraction(player, true);
    }
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
      sendJson(res, 409, { ok: false, error: "No active session", session: getPublicSession() });
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
}

const server = httpLifecycle.createServer(routeRequest);

server.on("error", (err) => {
  telemetry.error("runtime.error", { message: err.message });
  console.error(`[${LOG_LABEL}] ${err.message}`);
  cleanupFiles(PID_FILE, META_FILE);
  process.exit(1);
});

function shutdown() {
  stopTickLoop();
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
