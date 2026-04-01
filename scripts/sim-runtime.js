#!/usr/bin/env node

const http = require("http");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { performance } = require("perf_hooks");
const { loadPlayableMaps } = require("./shared-map-loader.js");
const {
  buildCoarseFlowField,
  sampleCoarseFlowField,
} = require("./coarse-flow-field.js");
const {
  RIG_TRACKS,
  defaultRigLevels,
  normalizeRigLevels,
  HULL_DEFINITIONS,
  BRAIN_DEFAULTS,
  normalizeHullType,
  normalizeProfileUpgrades,
  createPlayerBrain,
  createAbilityState,
} = require("./player-brain.js");
const { createControlPlaneClient } = require("./control-plane-client.js");
const {
  createOverloadController,
  projectOverloadBudget,
  advanceOverload,
} = require("./overload-state.js");
const {
  PROTOCOL_VERSION,
  DEFAULT_TICK_HZ,
  DEFAULT_SNAPSHOT_HZ,
  DEFAULT_WORLD_SCALE,
  DEFAULT_MAX_PLAYERS,
  createProtocolDescription,
  normalizeInputMessage,
  normalizeInventoryAction,
} = require("./sim-protocol.js");

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
const WELL_GROWTH_VARIANCE = 0.01;
const WELL_GROWTH_AMOUNT = 0.02;
const WELL_KILL_RADIUS_GROWTH = 0.3;
// Hull assignment rules for AI personalities
const PERSONALITY_HULL_MAP = {
  prospector: ['drifter', 'hauler'],
  raider: ['breacher'],
  vulture: ['resonant', 'breacher'],
  ghost: ['shroud', 'drifter'],
  desperado: ['breacher'],
};

// --- Loot Economy ---
// Tier gates: higher tiers unlock as session time advances.
// Wreck aging: older wrecks have more valuable loot.
// See LOOT-ECONOMY.md and ITEM-CATALOG.md for full design.

const LOOT_TIER_GATES = { 1: 0, 2: 30, 3: 120, 4: 240 }; // session seconds to unlock tier
const LOOT_TIER_WEIGHTS = { 1: 60, 2: 30, 3: 8, 4: 2 };  // relative roll weights
const WRECK_AGE_VALUE_CAP = 1.5;  // max value multiplier from aging
const WRECK_AGE_CAP_SECONDS = 120; // seconds to reach max age multiplier

// Wreck spawn waves: later waves spawn fewer but richer wrecks in more dangerous positions
const WRECK_WAVES = [
  { time: 0,   count: [4, 6], slots: [1, 2], dangerZone: 0.5 },  // safe
  { time: 45,  count: [3, 5], slots: [2, 3], dangerZone: 0.4 },
  { time: 90,  count: [2, 4], slots: [2, 3], dangerZone: 0.3 },
  { time: 150, count: [2, 3], slots: [2, 4], dangerZone: 0.2 },  // medium danger
  { time: 240, count: [1, 2], slots: [3, 4], dangerZone: 0.15 }, // near wells, T4 possible
];
const WRECK_WAVE_REPEAT_INTERVAL = 90; // after last wave, repeat every N seconds
const WRECK_WAVE_REPEAT = { count: [1, 1], slots: [3, 5], dangerZone: 0.12 };

// Compact item catalog — server only needs coefficients and metadata, not flavor text.
// Full catalog with flavor in docs/design/ITEM-CATALOG.md.
const ITEM_CATALOG = {
  1: [ // T1
    { id: 'patched-thruster',  name: 'Patched Thruster',  tier: 1, affinity: null,       coefficients: { thrustScale: 1.08 },                          value: [15, 25] },
    { id: 'scrap-plating',     name: 'Scrap Plating',     tier: 1, affinity: null,       coefficients: { wellResistScale: 1.06 },                      value: [15, 20] },
    { id: 'signal-baffle',     name: 'Signal Baffle',     tier: 1, affinity: null,       coefficients: { signalGenMult: 0.93 },                        value: [18, 28] },
    { id: 'worn-coupling',     name: 'Worn Coupling',     tier: 1, affinity: null,       coefficients: { currentCoupling: 1.06 },                      value: [15, 22] },
    { id: 'drag-foil',         name: 'Drag Foil',         tier: 1, affinity: null,       coefficients: { dragScale: 0.94 },                            value: [15, 20] },
    { id: 'cargo-netting',     name: 'Cargo Netting',     tier: 1, affinity: null,       coefficients: { cargoSlots: 1 },                              value: [20, 30] },
    { id: 'pulse-lens',        name: 'Pulse Lens',        tier: 1, affinity: null,       coefficients: { pulseRadiusScale: 1.10 },                     value: [18, 25] },
    { id: 'sensor-dish',       name: 'Sensor Dish',       tier: 1, affinity: null,       coefficients: { sensorRange: 1.10 },                          value: [15, 22] },
    { id: 'flow-vane',         name: 'Flow Vane',         tier: 1, affinity: 'drifter',  coefficients: { currentCoupling: 1.08 },                      value: [18, 25] },
    { id: 'burn-canister',     name: 'Burn Canister',     tier: 1, affinity: 'breacher', coefficients: {},                                              value: [18, 25], special: 'burnFuel+3' },
  ],
  2: [ // T2
    { id: 'tuned-thruster',      name: 'Tuned Thruster',      tier: 2, affinity: null,       coefficients: { thrustScale: 1.15 },                              value: [50, 80] },
    { id: 'gravity-sheath',      name: 'Gravity Sheath',      tier: 2, affinity: null,       coefficients: { wellResistScale: 1.15 },                          value: [55, 85] },
    { id: 'signal-dampener',     name: 'Signal Dampener',     tier: 2, affinity: null,       coefficients: { signalGenMult: 0.85 },                            value: [60, 90] },
    { id: 'decay-accelerator',   name: 'Decay Accelerator',   tier: 2, affinity: null,       coefficients: { signalDecayMult: 1.20 },                          value: [55, 85] },
    { id: 'current-amplifier',   name: 'Current Amplifier',   tier: 2, affinity: 'drifter',  coefficients: { currentCoupling: 1.18 },                          value: [60, 90] },
    { id: 'afterburner-injector',name: 'Afterburner Injector', tier: 2, affinity: 'breacher', coefficients: { thrustScale: 1.12, signalGenMult: 1.10 },         value: [55, 80] },
    { id: 'resonance-coil',     name: 'Resonance Coil',      tier: 2, affinity: 'resonant', coefficients: { pulseRadiusScale: 1.20, pulseCooldownScale: 0.90 },value: [65, 95] },
    { id: 'ghost-weave',        name: 'Ghost Weave',         tier: 2, affinity: 'shroud',   coefficients: { signalGenMult: 0.82, sensorRange: 1.12 },          value: [70, 100] },
    { id: 'cargo-brace',        name: 'Cargo Brace',         tier: 2, affinity: 'hauler',   coefficients: { cargoSlots: 1, pickupRadius: 1.10 },               value: [60, 90] },
    { id: 'pulse-sharpener',    name: 'Pulse Sharpener',     tier: 2, affinity: null,       coefficients: { pulseSignalScale: 0.80, pulseRadiusScale: 0.90 },  value: [50, 75] },
    { id: 'debuff-purge',       name: 'Debuff Purge',        tier: 2, affinity: null,       coefficients: { controlDebuffResist: 1.30 },                       value: [50, 75] },
    { id: 'hull-reinforcement',  name: 'Hull Reinforcement',  tier: 2, affinity: null,       coefficients: { wellResistScale: 1.10, controlDebuffResist: 1.15 },value: [55, 85] },
    { id: 'drag-coefficient',    name: 'Drag Coefficient',    tier: 2, affinity: null,       coefficients: { dragScale: 0.88 },                                value: [55, 80] },
    { id: 'pickup-magnet',       name: 'Pickup Magnet',       tier: 2, affinity: null,       coefficients: { pickupRadius: 1.25 },                              value: [50, 75] },
  ],
  3: [ // T3
    { id: 'dead-mans-thruster', name: "Dead Man's Thruster", tier: 3, affinity: 'drifter',  coefficients: { signalGenMult: 0.0, dragScale: 1.30 },  value: [200, 320], special: 'thrustSignalZero' },
    { id: 'overcharged-core',   name: 'Overcharged Core',    tier: 3, affinity: 'breacher', coefficients: { thrustScale: 1.30, signalGenMult: 1.50, signalDecayMult: 0.70 }, value: [220, 350] },
    { id: 'harmonic-anchor',    name: 'Harmonic Anchor',     tier: 3, affinity: 'resonant', coefficients: {},                                        value: [250, 380], special: 'eddyDuration+4,maxEddies+2' },
    { id: 'phase-veil',         name: 'Phase Veil',          tier: 3, affinity: 'shroud',   coefficients: {},                                        value: [240, 360], special: 'ghostTrailBeacon,wakeCloakCooldown-15' },
    { id: 'cargo-brace-mk2',    name: 'Cargo Brace Mk II',  tier: 3, affinity: 'hauler',   coefficients: {},                                        value: [230, 340], special: 'swarmDrainImmunity3' },
    { id: 'tidal-resonator',    name: 'Tidal Resonator',     tier: 3, affinity: null,       coefficients: {},                                        value: [200, 300], special: 'pulseStandingWave' },
    { id: 'well-skimmer',       name: 'Well Skimmer',        tier: 3, affinity: null,       coefficients: { wellResistScale: 1.35, thrustScale: 0.90 }, value: [210, 320] },
    { id: 'signal-siphon',      name: 'Signal Siphon',       tier: 3, affinity: null,       coefficients: { signalDecayMult: 1.50, signalGenMult: 1.15 }, value: [200, 310] },
    { id: 'precision-pulse',    name: 'Precision Pulse',     tier: 3, affinity: null,       coefficients: { pulseRadiusScale: 0.60, pulseSignalScale: 0.40, pulseCooldownScale: 0.50 }, value: [220, 340] },
    { id: 'drift-engine',       name: 'Drift Engine',        tier: 3, affinity: 'drifter',  coefficients: { currentCoupling: 1.40, thrustScale: 0.75 }, value: [230, 350] },
    { id: 'burn-extender',      name: 'Burn Extender',       tier: 3, affinity: 'breacher', coefficients: {},                                        value: [250, 370], special: 'burnFuel+15,burnRecharge×2' },
    { id: 'sensor-array',       name: 'Sensor Array',        tier: 3, affinity: null,       coefficients: { sensorRange: 1.50, signalGenMult: 1.08 }, value: [200, 300] },
  ],
  4: [ // T4
    { id: 'gravity-lens',           name: 'Gravity Lens',           tier: 4, affinity: 'resonant', coefficients: {}, value: [800, 1200],  special: 'pulseInvert' },
    { id: 'echo-chamber',           name: 'Echo Chamber',           tier: 4, affinity: 'shroud',   coefficients: {}, value: [900, 1300],  special: 'autoDecoys' },
    { id: 'void-anchor',            name: 'Void Anchor',            tier: 4, affinity: null,       coefficients: {}, value: [800, 1100],  special: 'recallBeacon' },
    { id: 'singularity-drive',      name: 'Singularity Drive',      tier: 4, affinity: 'breacher', coefficients: {}, value: [1000, 1500], special: 'burnReverseWells' },
    { id: 'laminar-flow-core',      name: 'Laminar Flow Core',      tier: 4, affinity: 'drifter',  coefficients: {}, value: [900, 1300],  special: 'instantFlowLock' },
    { id: 'salvage-titan',          name: 'Salvage Titan',          tier: 4, affinity: 'hauler',   coefficients: { cargoSlots: 3 }, value: [800, 1200], special: 'ghostWreckLoot' },
    { id: 'inhibitor-resonance',    name: 'Inhibitor Resonance',    tier: 4, affinity: null,       coefficients: {}, value: [850, 1200],  special: 'universalDampening' },
    { id: 'temporal-displacement',  name: 'Temporal Displacement',  tier: 4, affinity: null,       coefficients: {}, value: [900, 1300],  special: 'deathTeleport' },
  ],
};

const CONSUMABLE_CATALOG = [
  { id: 'shield-cell',      name: 'Shield Cell',      tier: 1, value: [20, 30],  effect: 'shieldBurst' },
  { id: 'signal-purge',     name: 'Signal Purge',     tier: 1, value: [25, 35],  effect: 'signalPurge' },
  { id: 'time-dilator',     name: 'Time Dilator',     tier: 2, value: [60, 90],  effect: 'timeSlowLocal' },
  { id: 'breach-flare',     name: 'Breach Flare',     tier: 2, value: [80, 120], effect: 'breachFlare' },
  { id: 'signal-flare',     name: 'Signal Flare',     tier: 1, value: [20, 35],  effect: 'signalFlare' },
  { id: 'emergency-thrust', name: 'Emergency Thrust', tier: 2, value: [70, 100], effect: 'emergencyThrust' },
  { id: 'cargo-jettison',   name: 'Cargo Jettison',   tier: 1, value: [15, 20],  effect: 'cargoJettison' },
  { id: 'well-repulsor',    name: 'Well Repulsor',    tier: 3, value: [200, 280], effect: 'wellRepulsor' },
];

function availableTiers(sessionTime) {
  const tiers = [];
  for (const [tier, gateTime] of Object.entries(LOOT_TIER_GATES)) {
    if (sessionTime >= gateTime) tiers.push(Number(tier));
  }
  return tiers;
}

function rollTier(sessionTime) {
  const tiers = availableTiers(sessionTime);
  let totalWeight = 0;
  for (const t of tiers) totalWeight += LOOT_TIER_WEIGHTS[t] || 0;
  let roll = Math.random() * totalWeight;
  for (const t of tiers) {
    roll -= LOOT_TIER_WEIGHTS[t] || 0;
    if (roll <= 0) return t;
  }
  return tiers[0] || 1;
}

function rollItem(tier) {
  const pool = ITEM_CATALOG[tier];
  if (!pool || pool.length === 0) return null;
  const item = pool[Math.floor(Math.random() * pool.length)];
  const baseValue = item.value[0] + Math.random() * (item.value[1] - item.value[0]);
  return {
    ...item,
    value: Math.round(baseValue),
    instanceId: `item-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
  };
}

function rollConsumable(sessionTime) {
  const maxTier = Math.max(...availableTiers(sessionTime));
  const eligible = CONSUMABLE_CATALOG.filter(c => c.tier <= maxTier);
  if (eligible.length === 0) return null;
  const c = eligible[Math.floor(Math.random() * eligible.length)];
  const baseValue = c.value[0] + Math.random() * (c.value[1] - c.value[0]);
  return {
    ...c,
    value: Math.round(baseValue),
    instanceId: `cons-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
  };
}

function generateWreckLoot(sessionTime, slotCount) {
  const items = [];
  for (let i = 0; i < slotCount; i++) {
    const tier = rollTier(sessionTime);
    const item = rollItem(tier);
    if (item) items.push(item);
  }
  // 40% chance of a consumable
  if (Math.random() < 0.4) {
    const c = rollConsumable(sessionTime);
    if (c) items.push(c);
  }
  return items;
}

function wreckAgeMultiplier(wreckSpawnTime, currentTime) {
  const age = currentTime - wreckSpawnTime;
  return Math.min(WRECK_AGE_VALUE_CAP, 1.0 + (age / WRECK_AGE_CAP_SECONDS) * (WRECK_AGE_VALUE_CAP - 1.0));
}

const SCAVENGER_CONFIG = {
  sensorRange: 1.5,
  decisionInterval: 0.8,
  thrustAccel: 0.5,
  drag: 0.06,
  fleeWellDist: 0.15,
  pickupRadius: 0.08,
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
const SERVER_INPUT = {
  brakeStrength: 0.15,
  baseDrag: 0.92,
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
const SIGNAL_CONFIG = {
  // Generation rates (per second for continuous, instant for spikes)
  thrustBaseRate: 0.005,
  thrustOppositionMult: 2.0,
  lootSpikeT1: 0.06,
  lootSpikeT2: 0.10,
  lootSpikeT3: 0.18,
  pulseSpike: 0.12,
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
  swarmSearchTimeout: 5.0,     // seconds before search pattern
  // Form 3: Vessel
  vesselSpeed: 0.08,
  vesselKillRadius: 0.08,
  vesselGravityRange: 0.3,
  vesselGravityStrength: 0.15,
  vesselPortalBlockRange: 0.2,
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

const MAP_SIM_SCALE_PROFILES = {
  shallows: {
    profileId: "small",
    tickHz: 15,
    snapshotHz: 10,
    worldTickHz: 10,
    portalTickHz: 10,
    growthTickHz: 4,
    scavengerTickHz: 12,
    waveTickHz: 15,
    fieldTickHz: 10,
    useCoarseField: false,
    flowFieldCellSize: 0.25,
    fieldFlowScale: 0.18,
    entityRelevanceRadius: 1.4,
    scavengerRelevanceRadius: 1.8,
    spawnScavengersBase: 1,
    spawnScavengersPerPlayer: 0.5,
    maxScavengers: 5,
    maxRelevantStarsPerPlayer: 6,
    maxRelevantPlanetoidsPerPlayer: 4,
    maxRelevantWrecksPerPlayer: 5,
    maxRelevantScavengersPerPlayer: 4,
    maxWellInfluencesPerPlayer: 6,
    maxWaveInfluencesPerPlayer: 6,
    maxPickupChecksPerPlayer: 4,
    maxPortalChecksPerPlayer: 4,
  },
  expanse: {
    profileId: "medium",
    tickHz: 12,
    snapshotHz: 8,
    worldTickHz: 6,
    portalTickHz: 6,
    growthTickHz: 3,
    scavengerTickHz: 8,
    waveTickHz: 12,
    fieldTickHz: 6,
    useCoarseField: true,
    flowFieldCellSize: 0.32,
    fieldFlowScale: 0.22,
    entityRelevanceRadius: 1.2,
    scavengerRelevanceRadius: 1.6,
    spawnScavengersBase: 1,
    spawnScavengersPerPlayer: 0.5,
    maxScavengers: 6,
    maxRelevantStarsPerPlayer: 5,
    maxRelevantPlanetoidsPerPlayer: 4,
    maxRelevantWrecksPerPlayer: 4,
    maxRelevantScavengersPerPlayer: 3,
    maxWellInfluencesPerPlayer: 5,
    maxWaveInfluencesPerPlayer: 5,
    maxPickupChecksPerPlayer: 3,
    maxPortalChecksPerPlayer: 3,
  },
  "deep-field": {
    profileId: "large",
    tickHz: 10,
    snapshotHz: 6,
    worldTickHz: 4,
    portalTickHz: 4,
    growthTickHz: 2,
    scavengerTickHz: 6,
    waveTickHz: 10,
    fieldTickHz: 4,
    useCoarseField: true,
    flowFieldCellSize: 0.45,
    fieldFlowScale: 0.28,
    entityRelevanceRadius: 1.0,
    scavengerRelevanceRadius: 1.4,
    spawnScavengersBase: 2,
    spawnScavengersPerPlayer: 0.5,
    maxScavengers: 7,
    maxRelevantStarsPerPlayer: 4,
    maxRelevantPlanetoidsPerPlayer: 3,
    maxRelevantWrecksPerPlayer: 4,
    maxRelevantScavengersPerPlayer: 3,
    maxWellInfluencesPerPlayer: 4,
    maxWaveInfluencesPerPlayer: 4,
    maxPickupChecksPerPlayer: 2,
    maxPortalChecksPerPlayer: 2,
  },
};

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
  res.setHeader("Access-Control-Allow-Headers", "content-type");
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

function cloneMapState(mapId, worldScaleOverride = null) {
  const map = PLAYABLE_MAPS[mapId] || PLAYABLE_MAPS.shallows;
  const parsedWorldScale = worldScaleOverride == null ? NaN : Number(worldScaleOverride);
  const worldScale = Number.isFinite(parsedWorldScale) && parsedWorldScale > 0 ? parsedWorldScale : map.worldScale;
  const wells = map.wells.map((well) => ({
    ...well,
    baseKillRadius: well.killRadius,
    startMass: well.mass,
    growthRate: (well.growthRate ?? WELL_GROWTH_AMOUNT) + (Math.random() * 2 - 1) * WELL_GROWTH_VARIANCE,
    killRadius: well.killRadius,
  }));
  const stars = map.stars.map((star) => ({
    ...star,
    alive: star.alive !== false,
    driftVX: 0,
    driftVY: 0,
  }));
  const wrecks = map.wrecks.map((wreck) => ({
    ...wreck,
    alive: true,
    looted: false,
    pickupCooldown: 0,
    vx: 0,
    vy: 0,
    spawnTime: 0,
    loot: generateWreckLoot(0, 1 + Math.floor(Math.random() * 2)), // T1 only at start
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

function randomBetween(min, max) {
  return min + Math.random() * (max - min);
}

function pick(list) {
  return list[Math.floor(Math.random() * list.length)];
}

function getSimScaleProfile(mapId, worldScale) {
  const profile = MAP_SIM_SCALE_PROFILES[mapId];
  if (profile) return { ...profile };
  if (worldScale >= 10) return { ...MAP_SIM_SCALE_PROFILES["deep-field"] };
  if (worldScale >= 5) return { ...MAP_SIM_SCALE_PROFILES.expanse };
  return { ...MAP_SIM_SCALE_PROFILES.shallows };
}

function generateScavengerIdentity(archetype) {
  const faction = pick(SCAVENGER_FACTIONS);
  const callsign = archetype === "vulture" ? pick(VULTURE_NAMES) : pick(DRIFTER_NAMES);
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
  for (let i = 0; i < count; i++) {
    const archetype = i < vultureCount ? "vulture" : "drifter";
    const edge = i % 4;
    let wx;
    let wy;
    if (edge === 0) {
      wx = Math.random() * mapState.worldScale;
      wy = 0.1;
    } else if (edge === 1) {
      wx = Math.random() * mapState.worldScale;
      wy = mapState.worldScale - 0.1;
    } else if (edge === 2) {
      wx = 0.1;
      wy = Math.random() * mapState.worldScale;
    } else {
      wx = mapState.worldScale - 0.1;
      wy = Math.random() * mapState.worldScale;
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
      facing: Math.random() * Math.PI * 2,
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
      decisionTimer: Math.random() * SCAVENGER_CONFIG.decisionInterval,
      driftHeading: Math.random() * Math.PI * 2,
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

  for (let attempt = 0; attempt < 40; attempt++) {
    const wx = Math.random() * worldScale;
    const wy = Math.random() * worldScale;

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
    wx: Math.random() * worldScale,
    wy: Math.random() * worldScale,
  };
}
function findSafeSpawn(map) {
  const allObjects = [
    ...map.wells.map((well) => ({ wx: well.wx, wy: well.wy })),
    ...map.stars.map((star) => ({ wx: star.wx, wy: star.wy })),
  ];
  const minDist = Math.max(0.25, map.worldScale * 0.08);

  let best = { wx: map.worldScale / 2, wy: map.worldScale / 2, dist: -Infinity };

  for (let attempt = 0; attempt < 80; attempt++) {
    const wx = Math.random() * map.worldScale;
    const wy = Math.random() * map.worldScale;
    let nearest = Infinity;
    for (const obj of allObjects) {
      nearest = Math.min(nearest, worldDistance(wx, wy, obj.wx, obj.wy, map.worldScale));
    }
    if (nearest >= minDist) return { wx, wy };
    if (nearest > best.dist) best = { wx, wy, dist: nearest };
  }

  return { wx: best.wx, wy: best.wy };
}


const args = parseArgs(process.argv.slice(2));
const HOST = args.host || "127.0.0.1";
const PORT = Number(args.port || 8787);
const PID_FILE = args["pid-file"] ? path.resolve(args["pid-file"]) : null;
const META_FILE = args["meta-file"] ? path.resolve(args["meta-file"]) : null;
const LOG_LABEL = args.label || "lbh-sim";
const SIM_INSTANCE_ID = String(args["sim-instance-id"] || process.env.LBH_SIM_INSTANCE_ID || `sim-${PORT}`);
const CONTROL_PLANE_URL = String(args["control-plane-url"] || process.env.LBH_CONTROL_PLANE_URL || "").trim();
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
  waveRings: [],
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
};

let tickHandle = null;

function publishEvent(type, payload = {}) {
  const event = {
    seq: runtime.nextEventSeq++,
    type,
    simTime: runtime.simTime,
    payload,
  };
  runtime.recentEvents.push(event);
  if (runtime.recentEvents.length > 128) {
    runtime.recentEvents.shift();
  }
  return event;
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
  return player.brain;
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
      pulse: false,
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
    committedOutcome: null,
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
    persistEndedSession({ status: "reset" });
  }
  const requestedMapId = String(config.mapId || "shallows");
  const requestedWorldScale = config.worldScale == null ? null : Number(config.worldScale);
  const mapState = cloneMapState(requestedMapId, requestedWorldScale);
  const scaleProfile = getSimScaleProfile(mapState.id, mapState.worldScale);
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
    maxPlayers: Number.isFinite(Number(config.maxPlayers)) ? Number(config.maxPlayers) : DEFAULT_MAX_PLAYERS,
  };
  runtime.mapState = mapState;
  runtime.mapState.fauna = [];
  runtime.mapState.sentries = spawnSentries(mapState);
  runtime.mapState.scavengers = spawnServerScavengers(runtime.mapState, runtime.session);
  runtime.tick = 0;
  runtime.simTime = 0;
  runtime.systemAccumulators = {
    world: 0,
    portals: 0,
    growth: 0,
    scavengers: 0,
    waves: 0,
    field: 0,
  };
  // Inhibitor: randomize threshold per run
  const inh = INHIBITOR_CONFIG;
  runtime.inhibitor = {
    pressure: 0,
    threshold: inh.thresholdMin + Math.random() * (inh.thresholdMax - inh.thresholdMin),
    form: 0, wx: 0, wy: 0, vx: 0, vy: 0,
    intensity: 0, radius: inh.glitchRadius,
    localTime: 0, swarmTrackTimer: 0,
    swarmTargetX: 0, swarmTargetY: 0,
    silenceTimer: 0, vesselTimer: 0,
    finalPortalSpawned: false,
  };
  runtime.players.clear();
  runtime.recentEvents = [];
  runtime.nextEventSeq = 1;
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
  runtime.waveRings = [];
  runtime.coarseField = null;
  rebuildAuthoritativeField();
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
  persistSessionRegistry();
  restartTickLoop();
}

function assignHost(clientId, name) {
  runtime.session.hostClientId = clientId;
  runtime.session.hostProfileId = runtime.players.get(clientId)?.profileId || null;
  runtime.session.hostName = name || clientId;
  publishEvent("session.hostAssigned", {
    clientId,
    name: runtime.session.hostName,
  });
  persistSessionRegistry();
}

function ensureHostPermission(requesterId) {
  if (!requesterId) return { ok: false, error: "requesterId is required" };
  if (!runtime.session.hostClientId) return { ok: true };
  if (runtime.session.hostClientId !== requesterId) {
    return { ok: false, error: "Only the session host can do that" };
  }
  return { ok: true };
}

function promoteHostIfNeeded() {
  if (runtime.players.size === 0) {
    runtime.session.hostClientId = null;
    runtime.session.hostName = null;
    return;
  }
  if (runtime.session.hostClientId && runtime.players.has(runtime.session.hostClientId)) return;
  // Only promote human players to host — AI can't accept /start or /reset
  const nextHost = Array.from(runtime.players.values()).find(p => !p.isAI);
  if (nextHost) assignHost(nextHost.clientId, nextHost.name);
}

function snapshotBody() {
  return {
    type: "snapshot",
    protocolVersion: PROTOCOL_VERSION,
    session: { ...runtime.session },
    tick: runtime.tick,
    simTime: runtime.simTime,
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
        flowLockActive: player.abilityState.flowLockActive,
        burnActive: player.abilityState.burnActive,
        burnFuel: player.abilityState.burnFuel,
        ghostTrailActive: player.abilityState.ghostTrailActive,
        decoys: player.abilityState.decoys,
        eddies: player.abilityState.eddies,
        tapAnchor: player.abilityState.tapAnchor,
      } : null,
      status: player.status,
      wx: player.wx,
      wy: player.wy,
      vx: player.vx,
      vy: player.vy,
      lastInputSeq: player.lastInput.seq,
      lastInputBrake: player.lastInput.brake || 0,
      cargo: player.cargo,
      cargoCount: getCargoCount(player),
      equipped: player.equipped,
      consumables: player.consumables,
      activeEffects: player.activeEffects,
      effectState: player.effectState,
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
      pressure: runtime.inhibitor.pressure,
      localTime: runtime.inhibitor.localTime,
    },
    recentEvents: runtime.recentEvents.slice(-32),
  };
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

function cloneProfileLoadout(profile) {
  return {
    equipped: cloneLoadoutItems(profile?.loadout?.equipped),
    consumables: cloneLoadoutItems(profile?.loadout?.consumables),
  };
}

function commitPlayerOutcome(player, outcome) {
  if (!player || player.isAI || !player.profileId) return null;
  if (player.committedOutcome) return null;
  // Outcome commit is one-way. Once a run result is written, later leave/reset
  // paths must not mutate durable profile state a second time.
  player.committedOutcome = outcome;
  trackControlPlaneWrite(controlPlane.applyOutcome({
    profileId: player.profileId,
    player,
    outcome,
    runDuration: runtime.simTime,
    session: runtime.session,
  }));
  publishEvent("profile.updated", {
    clientId: player.clientId,
    profileId: player.profileId,
    outcome,
  });
  return null;
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
  while (runtime.mapState.nextPortalWaveIndex < schedule.length) {
    const wave = schedule[runtime.mapState.nextPortalWaveIndex];
    if (runtime.simTime < wave.time) break;

    const spawnCount = wave.count[0] + Math.floor(Math.random() * (wave.count[1] - wave.count[0] + 1));
    for (let i = 0; i < spawnCount; i++) {
      const type = wave.types[Math.floor(Math.random() * wave.types.length)];
      const pos = findPortalSpawnPosition(type);
      const lifespan = type === "unstable"
        ? wave.lifespan + (Math.random() - 0.5) * wave.lifespan * 0.4
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
      publishEvent("portal.expired", {
        portalId: portal.id,
        type: portal.type,
      });
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
  const ws = runtime.session.worldScale;

  // Process scheduled waves
  while (runtime._wreckWaveIndex < WRECK_WAVES.length) {
    const wave = WRECK_WAVES[runtime._wreckWaveIndex];
    if (runtime.simTime < wave.time) break;

    const count = wave.count[0] + Math.floor(Math.random() * (wave.count[1] - wave.count[0] + 1));
    for (let i = 0; i < count; i++) {
      const slots = wave.slots[0] + Math.floor(Math.random() * (wave.slots[1] - wave.slots[0] + 1));
      const pos = findWreckSpawnPosition(wave.dangerZone);
      const wreck = {
        id: `wreck-wave-${runtime._wreckWaveIndex}-${i}-${runtime.tick}`,
        wx: pos.wx, wy: pos.wy,
        type: 'derelict',
        tier: rollTier(runtime.simTime),
        size: slots > 2 ? 'large' : slots > 1 ? 'medium' : 'small',
        alive: true, looted: false, pickupCooldown: 0,
        vx: 0, vy: 0,
        spawnTime: runtime.simTime,
        loot: generateWreckLoot(runtime.simTime, slots),
      };
      runtime.mapState.wrecks.push(wreck);
    }
    runtime._wreckWaveIndex++;
  }

  // Repeating waves after schedule ends
  if (runtime._wreckWaveIndex >= WRECK_WAVES.length) {
    runtime._wreckWaveRepeatTimer += dt;
    if (runtime._wreckWaveRepeatTimer >= WRECK_WAVE_REPEAT_INTERVAL) {
      runtime._wreckWaveRepeatTimer -= WRECK_WAVE_REPEAT_INTERVAL;
      const wave = WRECK_WAVE_REPEAT;
      const count = wave.count[0] + Math.floor(Math.random() * (wave.count[1] - wave.count[0] + 1));
      for (let i = 0; i < count; i++) {
        const slots = wave.slots[0] + Math.floor(Math.random() * (wave.slots[1] - wave.slots[0] + 1));
        const pos = findWreckSpawnPosition(wave.dangerZone);
        const wreck = {
          id: `wreck-repeat-${runtime.tick}-${i}`,
          wx: pos.wx, wy: pos.wy,
          type: 'derelict',
          tier: rollTier(runtime.simTime),
          size: slots > 2 ? 'large' : 'medium',
          alive: true, looted: false, pickupCooldown: 0,
          vx: 0, vy: 0,
          spawnTime: runtime.simTime,
          loot: generateWreckLoot(runtime.simTime, slots),
        };
        runtime.mapState.wrecks.push(wreck);
      }
    }
  }
}

// Spawn position biased by danger zone: lower dangerZone = closer to wells
function findWreckSpawnPosition(dangerZone) {
  const ws = runtime.session.worldScale;
  for (let attempt = 0; attempt < 20; attempt++) {
    const wx = Math.random() * ws;
    const wy = Math.random() * ws;
    let minWellDist = Infinity;
    for (const well of runtime.mapState.wells) {
      const d = worldDistance(wx, wy, well.wx, well.wy, ws);
      if (d < minWellDist) minWellDist = d;
    }
    // dangerZone is the minimum distance from any well — lower = more dangerous
    if (minWellDist >= dangerZone * 0.8 && minWellDist <= dangerZone * 2.0) {
      return { wx, wy };
    }
  }
  return { wx: Math.random() * ws, wy: Math.random() * ws };
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
  const activePortalCount = runtime.mapState.portals.filter((portal) => portal.alive !== false).length;
  const hasMorePortalWaves = runtime.mapState.nextPortalWaveIndex < PORTAL_CONFIG.waves.length;
  if (runtime.simTime <= 60) return;
  if (activePortalCount > 0) return;
  if (hasMorePortalWaves) return;

  for (const player of runtime.players.values()) {
    if (player.status !== "alive") continue;
    player.status = "dead";
    player.vx = 0;
    player.vy = 0;
    player.cargo = new Array(PLAYER_CARGO_SLOTS).fill(null);
    publishEvent("player.died", {
      clientId: player.clientId,
      cause: "collapse",
    });
  }
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
        const angle = Math.random() * Math.PI * 2;
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
  for (const wreck of wrecks) {
    if (wreck.alive === false) continue;
    if (wreck.pickupCooldown > 0) wreck.pickupCooldown = Math.max(0, wreck.pickupCooldown - dt);

    let ax = 0;
    let ay = 0;
    for (const well of runtime.mapState.wells) {
      const dx = worldDisplacement(wreck.wx, well.wx, runtime.session.worldScale);
      const dy = worldDisplacement(wreck.wy, well.wy, runtime.session.worldScale);
      const dist = Math.hypot(dx, dy);
      if (dist > 0.8 || dist < 0.001) continue;
      const accel = (0.0045 * well.mass) / Math.pow(Math.max(dist, 0.02), 1.5);
      ax += (dx / dist) * accel;
      ay += (dy / dist) * accel;
    }

    wreck.vx += ax * dt;
    wreck.vy += ay * dt;
    const dragFactor = Math.exp(-1.5 * dt);
    wreck.vx *= dragFactor;
    wreck.vy *= dragFactor;

    const speed = Math.hypot(wreck.vx, wreck.vy);
    const terminal = 0.05;
    if (speed > terminal) {
      wreck.vx *= terminal / speed;
      wreck.vy *= terminal / speed;
    }
    if (speed < 0.0005) {
      wreck.vx = 0;
      wreck.vy = 0;
    }

    wreck.wx = wrapWorld(wreck.wx + wreck.vx * dt, runtime.session.worldScale);
    wreck.wy = wrapWorld(wreck.wy + wreck.vy * dt, runtime.session.worldScale);

    for (const well of runtime.mapState.wells) {
      const dist = worldDistance(wreck.wx, wreck.wy, well.wx, well.wy, runtime.session.worldScale);
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

function applyScavengerBump(player, scavengers = runtime.mapState.scavengers) {
  for (const scav of scavengers) {
    if (scav.alive === false || scav.state === "dying") continue;
    const { dist, nx, ny } = worldDirection(scav.wx, scav.wy, player.wx, player.wy, runtime.session.worldScale);
    if (dist < SCAVENGER_CONFIG.bumpRadius && dist > 0.0001) {
      const impulse = SCAVENGER_CONFIG.bumpForce;
      player.vx += nx * impulse;
      player.vy += ny * impulse;
      scav.vx -= nx * impulse;
      scav.vy -= ny * impulse;
    }
  }
}

function applyWaveRingPush(player, dt) {
  if (runtime.session.useCoarseField && runtime.coarseField) {
    const field = sampleCoarseFlowField(runtime.coarseField, player.wx, player.wy);
    player.vx += field.waveX * dt;
    player.vy += field.waveY * dt;
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
    if (dist < well.killRadius) {
      if (player.effectState.shieldCharges > 0) {
        player.effectState.shieldCharges -= 1;
        refreshPlayerEffects(player);
        publishEvent("player.shieldAbsorbed", {
          clientId: player.clientId,
          wellId: well.id,
          wellName: well.name || well.id,
        });
        return;
      }
      if ((player.effectState.hullGraceRemaining || 0) > 0) {
        player.effectState.hullGraceRemaining = Math.max(0, player.effectState.hullGraceRemaining - dt);
        if (player.effectState.hullGraceRemaining > 0) {
          return;
        }
      } else if ((player.brain?.wellGraceDuration || 0) > 0) {
        player.effectState.hullGraceRemaining = player.brain.wellGraceDuration;
        publishEvent("player.hullGraceStarted", {
          clientId: player.clientId,
          wellId: well.id,
          wellName: well.name || well.id,
          duration: player.brain.wellGraceDuration,
        });
        return;
      }
      // Hauler Reinforced Hull: survive one well contact per run
      if (player.abilityState && player.abilityState.hullType === 'hauler'
          && player.abilityState.wellSurvivesRemaining > 0) {
        player.abilityState.wellSurvivesRemaining--;
        // Eject violently, scatter 1-2 cargo items
        const ejectAngle = Math.atan2(dy, dx) + Math.PI;
        player.vx = Math.cos(ejectAngle) * 0.3;
        player.vy = Math.sin(ejectAngle) * 0.3;
        player.wx = ((player.wx + Math.cos(ejectAngle) * 0.1) % runtime.session.worldScale + runtime.session.worldScale) % runtime.session.worldScale;
        player.wy = ((player.wy + Math.sin(ejectAngle) * 0.1) % runtime.session.worldScale + runtime.session.worldScale) % runtime.session.worldScale;
        // Scatter cargo
        const filled = player.cargo.map((c, i) => c ? i : -1).filter(i => i >= 0);
        const scatterCount = Math.min(filled.length, 1 + Math.floor(Math.random() * 2));
        for (let s = 0; s < scatterCount; s++) {
          const idx = filled[Math.floor(Math.random() * filled.length)];
          player.cargo[idx] = null;
        }
        publishEvent("ability.activated", {
          clientId: player.clientId, ability: "reinforcedHull", wellId: well.id,
        });
        return;
      }
      player.status = "dead";
      player.vx = 0;
      player.vy = 0;
      player.cargo = new Array(player.brain?.cargoSlots || PLAYER_CARGO_SLOTS).fill(null);
      commitPlayerOutcome(player, "dead");
      publishEvent("player.died", {
        clientId: player.clientId,
        cause: "well",
        wellId: well.id,
        wellName: well.name || well.id,
      });
      return;
    }
  }
  if ((player.effectState.hullGraceRemaining || 0) > 0) {
    player.effectState.hullGraceRemaining = 0;
  }
  let pullX = 0;
  let pullY = 0;
  if (runtime.session.useCoarseField && runtime.coarseField) {
    const field = sampleCoarseFlowField(runtime.coarseField, player.wx, player.wy);
    pullX = field.gravityX;
    pullY = field.gravityY;
  } else {
    for (const { entity: well } of relevantWells) {
      const dx = worldDisplacement(player.wx, well.wx, runtime.session.worldScale);
      const dy = worldDisplacement(player.wy, well.wy, runtime.session.worldScale);
      const dist = Math.hypot(dx, dy);
      if (dist < 0.0001) continue;
      const pull = (0.025 * well.mass) / Math.pow(Math.max(dist, 0.02), 1.8);
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

function tickPlayerPickups(player, wrecks = runtime.mapState.wrecks) {
  if (player.status !== "alive") return;
  const maxCargo = player.brain ? player.brain.cargoSlots : PLAYER_CARGO_SLOTS;
  if (getCargoCount(player) >= maxCargo) return;

  const nearbyWrecks = collectNearestByDistance(
    player.wx,
    player.wy,
    wrecks.filter((wreck) => wreck.alive !== false && !wreck.looted && wreck.pickupCooldown <= 0),
    runtime.session.maxPickupChecksPerPlayer || wrecks.length || 1
  );

  const pickupDist = 0.08 * (player.brain ? player.brain.pickupRadius : 1.0);
  for (const { entity: wreck, dist } of nearbyWrecks) {
    if (dist >= pickupDist) continue;

    // Apply wreck age value multiplier at loot time
    const ageMult = wreck.spawnTime != null ? wreckAgeMultiplier(wreck.spawnTime, runtime.simTime) : 1.0;
    while (wreck.loot?.length > 0 && getCargoCount(player) < maxCargo) {
      const freeSlot = player.cargo.indexOf(null);
      if (freeSlot === -1) break;
      const item = wreck.loot.shift();
      if (item && ageMult > 1.0) {
        item.value = Math.round((item.value || 0) * ageMult);
        // Scale coefficient magnitudes by age multiplier
        if (item.coefficients) {
          for (const [key, val] of Object.entries(item.coefficients)) {
            if (typeof val === 'number' && key !== 'cargoSlots') {
              // Scale the deviation from 1.0 by age multiplier
              const deviation = val - 1.0;
              item.coefficients[key] = 1.0 + deviation * ageMult;
            }
          }
        }
      }
      player.cargo[freeSlot] = item;
    }
    if (!wreck.loot || wreck.loot.length === 0) {
      wreck.looted = true;
    }
    // Signal spike from looting (tier-based)
    const wreckTier = wreck.tier || 1;
    const lootSpike = wreckTier >= 3 ? SIGNAL_CONFIG.lootSpikeT3
      : wreckTier >= 2 ? SIGNAL_CONFIG.lootSpikeT2
      : SIGNAL_CONFIG.lootSpikeT1;
    spikePlayerSignal(player, lootSpike);
    publishEvent("player.loot", {
      clientId: player.clientId,
      wreckId: wreck.id,
      cargoCount: getCargoCount(player),
    });
    if (getCargoCount(player) >= PLAYER_CARGO_SLOTS) break;
  }
}

function tickExtraction(player) {
  if (player.status !== "alive") return;
  const nearbyPortals = collectNearestByDistance(
    player.wx,
    player.wy,
    runtime.mapState.portals.filter((portal) => portal.alive !== false),
    runtime.session.maxPortalChecksPerPlayer || runtime.mapState.portals.length || 1
  );
  for (const { entity: portal, dist } of nearbyPortals) {
    if (dist < portalCaptureRadius(portal)) {
      player.status = "escaped";
      player.vx = 0;
      player.vy = 0;
      commitPlayerOutcome(player, "escaped");
      publishEvent("player.escaped", {
        clientId: player.clientId,
        portalId: portal.id,
        portalType: portal.type,
        cargoCount: getCargoCount(player),
      });
      return;
    }
  }
}

function refreshPlayerEffects(player) {
  const passive = player.equipped.filter(Boolean).map((item) => item.effect).filter(Boolean);
  const active = [];
  if (player.effectState.shieldCharges > 0) active.push("shieldBurst");
  if (player.effectState.timeSlowRemaining > 0) active.push("timeSlowLocal");
  player.activeEffects = [...new Set([...passive, ...active])];
}

function spawnTemporaryPortalNearPlayer(player) {
  const angle = Math.random() * Math.PI * 2;
  const dist = 0.15 + Math.random() * 0.1;
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

  const effectId = item.useEffect;
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
    case "signalPurge":
      break;
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
  const inputAngle =
    Math.hypot(player.lastInput.moveX, player.lastInput.moveY) > 0.1
      ? Math.atan2(player.lastInput.moveY, player.lastInput.moveX)
      : Math.random() * Math.PI * 2;
  const rearAngle = inputAngle + Math.PI + (Math.random() - 0.5) * Math.PI;
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
  if (Number.isFinite(Number(body.wx))) player.wx = wrapWorld(Number(body.wx), runtime.session.worldScale);
  if (Number.isFinite(Number(body.wy))) player.wy = wrapWorld(Number(body.wy), runtime.session.worldScale);
  if (Number.isFinite(Number(body.vx))) player.vx = Number(body.vx);
  if (Number.isFinite(Number(body.vy))) player.vy = Number(body.vy);
  if (typeof body.status === "string" && body.status) player.status = body.status;
  return player;
}

function applyDebugScavengerState(scavenger, body) {
  if (Number.isFinite(Number(body.wx))) scavenger.wx = wrapWorld(Number(body.wx), runtime.session.worldScale);
  if (Number.isFinite(Number(body.wy))) scavenger.wy = wrapWorld(Number(body.wy), runtime.session.worldScale);
  if (Number.isFinite(Number(body.vx))) scavenger.vx = Number(body.vx);
  if (Number.isFinite(Number(body.vy))) scavenger.vy = Number(body.vy);
  if (Number.isFinite(Number(body.lootCount))) scavenger.lootCount = Math.max(0, Number(body.lootCount));
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
    if (portal.alive === false) continue;
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

function buildRelevanceView() {
  const alivePlayers = getAlivePlayers();
  const entityRadius = runtime.session.entityRelevanceRadius || runtime.session.worldScale;
  const scavengerRadius = runtime.session.scavengerRelevanceRadius || entityRadius;

  if (alivePlayers.length === 0) {
    return {
      alivePlayers,
      stars: [],
      wrecks: [],
      planetoids: [],
      scavengers: runtime.mapState.scavengers.filter((scav) => scav.alive !== false && scav.state === "dying"),
    };
  }

  function collectRelevantEntities(entities, radius, perPlayerLimit) {
    const limit = clampBudgetCount(perPlayerLimit, entities.length || 1);
    const selectedIds = new Set();
    const selected = [];

    for (const player of alivePlayers) {
      const candidates = [];
      for (const entity of entities) {
        if (!entity || entity.alive === false) continue;
        const dist = worldDistance(entity.wx, entity.wy, player.wx, player.wy, runtime.session.worldScale);
        if (dist > radius) continue;
        candidates.push({ entity, dist });
      }
      candidates.sort((a, b) => a.dist - b.dist);
      for (let i = 0; i < Math.min(limit, candidates.length); i++) {
        const entity = candidates[i].entity;
        if (selectedIds.has(entity.id)) continue;
        selectedIds.add(entity.id);
        selected.push(entity);
      }
    }

    return selected;
  }

  return {
    alivePlayers,
    stars: collectRelevantEntities(
      runtime.mapState.stars,
      entityRadius,
      runtime.session.maxRelevantStarsPerPlayer || runtime.mapState.stars.length || 1
    ),
    wrecks: collectRelevantEntities(
      runtime.mapState.wrecks,
      entityRadius,
      runtime.session.maxRelevantWrecksPerPlayer || runtime.mapState.wrecks.length || 1
    ),
    planetoids: collectRelevantEntities(
      runtime.mapState.planetoids,
      entityRadius,
      runtime.session.maxRelevantPlanetoidsPerPlayer || runtime.mapState.planetoids.length || 1
    ),
    scavengers: [
      ...runtime.mapState.scavengers.filter((scav) => scav.alive !== false && scav.state === "dying"),
      ...collectRelevantEntities(
        runtime.mapState.scavengers.filter((scav) => scav.state !== "dying"),
        scavengerRadius,
        runtime.session.maxRelevantScavengersPerPlayer || runtime.mapState.scavengers.length || 1
      ),
    ].filter((scav, index, list) => list.findIndex((entry) => entry.id === scav.id) === index),
  };
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
  for (let i = 0; i < scav.lootCount; i++) {
    const angle = Math.random() * Math.PI * 2;
    const ejectDist = 0.05 + Math.random() * 0.05;
    const ejectSpeed = 0.2 + Math.random() * 0.2;
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
  const activePortalCount = runtime.mapState.portals.filter((portal) => portal.alive !== false).length;

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
          scav.driftHeading = Math.random() * Math.PI * 2;
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
  const isThrusting = input.thrust > 0.1;

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
    generation += cfg.thrustBaseRate * oppositionMult * input.thrust;
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
  const lootTarget = p.lootTarget[0] + Math.floor(Math.random() * (p.lootTarget[1] - p.lootTarget[0] + 1));
  const player = createPlayer(`ai-${personalityKey}-${index}`, name, hullType);
  player.isAI = true;
  player.personality = personalityKey;
  player.personalityWeights = p;
  player.aiState = {
    goal: 'loot',           // loot | extract | evade | contest
    targetWreckId: null,
    targetPortalId: null,
    decisionTimer: Math.random() * AI_PLAYER_CONFIG.decisionInterval, // stagger
    strategicTimer: Math.random() * AI_PLAYER_CONFIG.strategicInterval,
    lootTarget,
    lootCount: 0,
    facingAngle: Math.random() * Math.PI * 2,
    thrustIntensity: 0,
  };
  return player;
}

function spawnAIPlayers(mapState, session) {
  const personalityKeys = Object.keys(AI_PERSONALITIES);
  const count = 3;

  // Find human hull (if any) to avoid duplicating
  let humanHull = null;
  for (const p of runtime.players.values()) {
    if (!p.isAI) { humanHull = p.hullType; break; }
  }

  const chosenPersonalities = [];
  const chosenHulls = [];

  for (let i = 0; i < count; i++) {
    // Pick personality — at least 2 distinct
    let key;
    if (i < 2) {
      do { key = personalityKeys[Math.floor(Math.random() * personalityKeys.length)]; }
      while (chosenPersonalities.includes(key) && chosenPersonalities.length < personalityKeys.length);
    } else {
      key = personalityKeys[Math.floor(Math.random() * personalityKeys.length)];
    }
    chosenPersonalities.push(key);

    // Pick hull from personality's allowed list, avoiding human hull and duplicates
    const allowedHulls = PERSONALITY_HULL_MAP[key] || ['drifter'];
    let hull = allowedHulls[Math.floor(Math.random() * allowedHulls.length)];
    // Avoid duplicating human hull
    if (hull === humanHull && allowedHulls.length > 1) {
      hull = allowedHulls.find(h => h !== humanHull) || hull;
    }
    // Avoid duplicating other AI hulls when possible
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

function findSafeSpawn(mapState) {
  const ws = mapState.worldScale;
  for (let attempt = 0; attempt < 20; attempt++) {
    const wx = Math.random() * ws;
    const wy = Math.random() * ws;
    let safe = true;
    for (const well of mapState.wells) {
      if (worldDistance(wx, wy, well.wx, well.wy, ws) < 0.3) { safe = false; break; }
    }
    if (safe) return { wx, wy };
  }
  return { wx: Math.random() * ws, wy: Math.random() * ws };
}

// Analytical flow estimate from well positions (no GPU needed)
function estimateFlow(wx, wy) {
  if (runtime.session.useCoarseField && runtime.coarseField) {
    const sample = sampleCoarseFlowField(runtime.coarseField, wx, wy);
    return { x: sample.currentX, y: sample.currentY };
  }
  const ws = runtime.session.worldScale;
  let fx = 0, fy = 0;
  for (const well of runtime.mapState.wells) {
    const dx = worldDisplacement(wx, well.wx, ws);
    const dy = worldDisplacement(wy, well.wy, ws);
    const dist = Math.hypot(dx, dy);
    if (dist < 0.01) continue;
    const strength = (well.mass || 1) / Math.pow(dist, 1.5);
    const dir = well.orbitalDir || 1;
    fx += (-dy / dist) * dir * strength * 0.3;
    fy += (dx / dist) * dir * strength * 0.3;
  }
  return { x: fx, y: fy };
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
  const noise = 1.0 + (Math.random() - 0.5) * AI_PLAYER_CONFIG.perceptionNoise * 2;
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
  if (!portal.alive) return -Infinity;

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
  const portalsAlive = runtime.mapState.portals.filter(p => p.alive).length;
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
      if (portal && portal.alive) {
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
      ai.facingAngle += (Math.random() - 0.5) * 0.1 * dt;
    }

    // Set lastInput — main tick loop handles all physics (thrust, gravity, drag).
    // Do NOT apply velocity directly here or AI gets double-thrust.
    player.lastInput.moveX = Math.cos(ai.facingAngle) * ai.thrustIntensity;
    player.lastInput.moveY = Math.sin(ai.facingAngle) * ai.thrustIntensity;
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
    if (input.ability1 && as.eddyBrakeCooldown <= 0 && speed > 0.02) {
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
    if (input.ability1 && !as.burnActive && as.burnFuel > 1.0) {
      as.burnActive = true;
      publishEvent("ability.activated", { clientId: player.clientId, ability: "burn" });
    } else if (input.ability1 && as.burnActive) {
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
    if (input.ability1 && as.tapCooldown <= 0) {
      as.tapAnchor = { wx: player.wx, wy: player.wy };
      as.tapCooldown = HULL_DEFINITIONS.resonant.abilities.resonanceTap.cooldown;
      publishEvent("ability.activated", { clientId: player.clientId, ability: "resonanceTap" });
    }

    // Frequency Shift: invert next pulse with ability2
    if (as.frequencyShiftCooldown > 0) as.frequencyShiftCooldown -= dt;
    if (input.ability2 && as.frequencyShiftCooldown <= 0 && !as.nextPulseInverted) {
      as.nextPulseInverted = true;
      as.frequencyShiftCooldown = HULL_DEFINITIONS.resonant.abilities.frequencyShift.cooldown;
      publishEvent("ability.activated", { clientId: player.clientId, ability: "frequencyShift" });
    }

  } else if (as.hullType === 'shroud') {
    // Wake Cloak: ability1 drops signal by 1 zone
    if (as.wakeCloakCooldown > 0) as.wakeCloakCooldown -= dt;
    if (input.ability1 && as.wakeCloakCooldown <= 0 && player.signal.zone !== 'threshold') {
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
    if (input.ability2 && as.decoyCharges > 0 && as.decoyCooldown <= 0) {
      as.decoyCharges--;
      as.decoyCooldown = HULL_DEFINITIONS.shroud.abilities.decoyFlare.cooldown;
      as.decoys.push({
        wx: player.wx, wy: player.wy,
        signal: player.signal.level, age: 0,
      });
      publishEvent("ability.activated", { clientId: player.clientId, ability: "decoyFlare" });
    }

    // Tick decoys
    for (let i = as.decoys.length - 1; i >= 0; i--) {
      as.decoys[i].age += dt;
      as.decoys[i].signal *= (1 - HULL_DEFINITIONS.shroud.abilities.decoyFlare.decayRate * dt);
      if (as.decoys[i].age >= HULL_DEFINITIONS.shroud.abilities.decoyFlare.duration) {
        as.decoys.splice(i, 1);
      }
    }

  } else if (as.hullType === 'hauler') {
    // Salvage Lock: ability1 tags nearest wreck in sensor range
    if (input.ability1 && as.salvageLockCharges > 0) {
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
    if (input.ability2 && as.tractorCooldown <= 0) {
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
  for (const well of mapState.wells) {
    const count = cfg.perWell[0] + Math.floor(Math.random() * (cfg.perWell[1] - cfg.perWell[0] + 1));
    const baseOrbit = (well.ringOuter || 0.1);
    for (let i = 0; i < count; i++) {
      const orbitRadius = baseOrbit * (cfg.orbitRadiusMult[0] + Math.random() * (cfg.orbitRadiusMult[1] - cfg.orbitRadiusMult[0]));
      const angle = (i / count) * Math.PI * 2 + Math.random() * 0.3;
      const speed = cfg.patrolSpeed[0] + Math.random() * (cfg.patrolSpeed[1] - cfg.patrolSpeed[0]);
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

  // Spawn drift jellies to maintain count
  const jellyCount = fauna.filter(f => f.type === "jelly" && f.alive).length;
  if (jellyCount < cfg.jellyCount && fauna.length < cfg.maxTotal) {
    runtime._jellySpawnTimer = (runtime._jellySpawnTimer || 0) + dt;
    if (runtime._jellySpawnTimer >= cfg.jellySpawnInterval) {
      runtime._jellySpawnTimer = 0;
      fauna.push({
        id: `fauna-${runtime.tick}-${Math.random().toString(36).slice(2,6)}`,
        type: "jelly",
        wx: Math.random() * ws, wy: Math.random() * ws,
        vx: (Math.random() - 0.5) * 0.005, vy: (Math.random() - 0.5) * 0.005,
        age: 0,
        lifespan: cfg.jellyLifespan[0] + Math.random() * (cfg.jellyLifespan[1] - cfg.jellyLifespan[0]),
        alive: true,
        phase: Math.random() * Math.PI * 2,
      });
    }
  }

  // Spawn signal blooms based on signal zone
  const bloomRate = cfg.bloomSpawnRate[peakZone] || 0;
  if (bloomRate > 0 && peakPlayer && fauna.length < cfg.maxTotal) {
    runtime._bloomSpawnAccum = (runtime._bloomSpawnAccum || 0) + bloomRate * dt;
    while (runtime._bloomSpawnAccum >= 1) {
      runtime._bloomSpawnAccum -= 1;
      const angle = Math.random() * Math.PI * 2;
      const dist = cfg.bloomSpawnRange[0] + Math.random() * (cfg.bloomSpawnRange[1] - cfg.bloomSpawnRange[0]);
      fauna.push({
        id: `fauna-${runtime.tick}-${Math.random().toString(36).slice(2,6)}`,
        type: "bloom",
        wx: ((peakPlayer.wx + Math.cos(angle) * dist) % ws + ws) % ws,
        wy: ((peakPlayer.wy + Math.sin(angle) * dist) % ws + ws) % ws,
        vx: 0, vy: 0,
        age: 0,
        lifespan: cfg.bloomLifespan[0] + Math.random() * (cfg.bloomLifespan[1] - cfg.bloomLifespan[0]),
        alive: true,
        phase: Math.random() * Math.PI * 2,
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

function tickInhibitor(dt) {
  const inh = runtime.inhibitor;
  const cfg = INHIBITOR_CONFIG;
  const ws = runtime.session.worldScale;
  inh.localTime += dt;

  // Find peak player signal
  let peakSignal = 0;
  let loudestPlayer = null;
  for (const player of runtime.players.values()) {
    if (player.status !== "alive") continue;
    if (player.signal.level > peakSignal) {
      peakSignal = player.signal.level;
      loudestPlayer = player;
    }
  }

  // Pressure accumulation (always, even when inactive)
  inh.pressure += peakSignal * cfg.pressureFromSignal * dt;
  inh.pressure += (runtime.simTime / RUN_DURATION) * cfg.pressureFromTime * dt;
  inh.pressure = Math.min(1.5, inh.pressure); // soft cap

  // --- Form transitions ---
  const glitchThreshold = inh.threshold * cfg.glitchFraction;

  if (inh.form === 0 && inh.pressure >= glitchThreshold) {
    // Spawn Glitch at map edge farthest from loudest player
    inh.form = 1;
    inh.intensity = 0;
    inh.radius = cfg.glitchRadius;
    if (loudestPlayer) {
      // Farthest edge point
      inh.wx = (loudestPlayer.wx + ws / 2) % ws;
      inh.wy = (loudestPlayer.wy + ws / 2) % ws;
    } else {
      inh.wx = Math.random() * ws;
      inh.wy = Math.random() * ws;
    }
    inh.silenceTimer = 0;
    publishEvent("inhibitor.form", { form: 1, pressure: inh.pressure });
  }

  if (inh.form === 1 && inh.pressure >= inh.threshold) {
    // Irreversible: Swarm
    inh.form = 2;
    inh.intensity = 0;
    inh.radius = cfg.swarmRadius;
    inh.vesselTimer = 0;
    inh.swarmTrackTimer = 0;
    if (loudestPlayer) {
      inh.swarmTargetX = loudestPlayer.wx;
      inh.swarmTargetY = loudestPlayer.wy;
    }
    publishEvent("inhibitor.form", { form: 2, pressure: inh.pressure });
    publishEvent("inhibitor.wake", { wx: inh.wx, wy: inh.wy });
  }

  // vesselTimer ticks in form 2 AND 3 — final portal check needs it to keep advancing
  if (inh.form >= 2) {
    inh.vesselTimer += dt;
  }
  if (inh.form === 2) {
    if (inh.vesselTimer >= cfg.vesselTimeToForm || peakSignal >= 1.0) {
      inh.form = 3;
      inh.intensity = 0;
      inh.radius = cfg.swarmRadius * 1.5;
      publishEvent("inhibitor.form", { form: 3, pressure: inh.pressure });
    }
  }

  // --- Form behavior ---
  if (inh.form === 1) {
    // Glitch: drift toward last high-signal position, dissipate if quiet
    inh.intensity = Math.min(1, inh.intensity + dt * 0.5);
    if (peakSignal < SIGNAL_CONFIG.ghostMax) {
      inh.silenceTimer += dt;
      if (inh.silenceTimer >= cfg.glitchDissipateTime) {
        inh.form = 0;
        inh.intensity = 0;
        // Reset pressure below glitch threshold so it doesn't immediately reform
        inh.pressure = inh.threshold * cfg.glitchFraction * 0.5;
        publishEvent("inhibitor.form", { form: 0, pressure: inh.pressure });
      }
    } else {
      inh.silenceTimer = 0;
    }
    // Drift
    if (loudestPlayer) {
      const speed = peakSignal > cfg.glitchSolidifySignal ? cfg.glitchSolidifySpeed : cfg.glitchDriftSpeed;
      const dx = worldDisplacement(inh.wx, loudestPlayer.wx, ws);
      const dy = worldDisplacement(inh.wy, loudestPlayer.wy, ws);
      const dist = Math.hypot(dx, dy);
      if (dist > 0.01) {
        inh.wx = ((inh.wx + (dx / dist) * speed * dt) % ws + ws) % ws;
        inh.wy = ((inh.wy + (dy / dist) * speed * dt) % ws + ws) % ws;
      }
    }
  }

  if (inh.form === 2) {
    // Swarm: hunt by signal, speed scales with player activity
    inh.intensity = Math.min(1, inh.intensity + dt * 0.3);
    inh.swarmTrackTimer += dt;
    if (inh.swarmTrackTimer >= cfg.swarmTrackInterval && loudestPlayer) {
      inh.swarmTargetX = loudestPlayer.wx;
      inh.swarmTargetY = loudestPlayer.wy;
      inh.swarmTrackTimer = 0;
    }
    // Speed from player state
    let speed = cfg.swarmSpeedSilent;
    if (peakSignal > SIGNAL_CONFIG.flareMax) speed = cfg.swarmSpeedFlare;
    else if (peakSignal > SIGNAL_CONFIG.presenceMax) speed = cfg.swarmSpeedHeavy;
    else if (peakSignal > SIGNAL_CONFIG.ghostMax) speed = cfg.swarmSpeedLight;

    const dx = worldDisplacement(inh.wx, inh.swarmTargetX, ws);
    const dy = worldDisplacement(inh.wy, inh.swarmTargetY, ws);
    const dist = Math.hypot(dx, dy);
    if (dist > 0.01) {
      inh.wx = ((inh.wx + (dx / dist) * speed * dt) % ws + ws) % ws;
      inh.wy = ((inh.wy + (dy / dist) * speed * dt) % ws + ws) % ws;
    }

    // Contact effects
    for (const player of runtime.players.values()) {
      if (player.status !== "alive") continue;
      const pd = worldDistance(inh.wx, inh.wy, player.wx, player.wy, ws);
      if (pd < inh.radius * 0.5) {
        spikePlayerSignal(player, cfg.swarmContactSignalSpike * dt);
        // Sluggish controls — Swarm corrupts ship systems
        player.controlDebuff = cfg.swarmControlDebuffDuration;
        // Drain cargo
        if (Math.random() < cfg.swarmContactDrain * dt) {
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
    // Vessel: constant advance toward player, kills on contact
    inh.intensity = Math.min(1, inh.intensity + dt * 0.2);
    if (loudestPlayer) {
      const dx = worldDisplacement(inh.wx, loudestPlayer.wx, ws);
      const dy = worldDisplacement(inh.wy, loudestPlayer.wy, ws);
      const dist = Math.hypot(dx, dy);
      if (dist > 0.01) {
        inh.wx = ((inh.wx + (dx / dist) * cfg.vesselSpeed * dt) % ws + ws) % ws;
        inh.wy = ((inh.wy + (dy / dist) * cfg.vesselSpeed * dt) % ws + ws) % ws;
      }

      // Gravity pull
      for (const player of runtime.players.values()) {
        if (player.status !== "alive") continue;
        const pd = worldDistance(inh.wx, inh.wy, player.wx, player.wy, ws);
        if (pd < cfg.vesselGravityRange && pd > 0.001) {
          const pull = cfg.vesselGravityStrength * (1 - pd / cfg.vesselGravityRange);
          const pdx = worldDisplacement(player.wx, inh.wx, ws);
          const pdy = worldDisplacement(player.wy, inh.wy, ws);
          player.vx += (pdx / pd) * pull * dt;
          player.vy += (pdy / pd) * pull * dt;
        }
        // Kill on contact
        if (pd < cfg.vesselKillRadius) {
          player.status = "dead";
          player.vx = 0;
          player.vy = 0;
          publishEvent("player.died", { clientId: player.clientId, cause: "vessel" });
        }
      }

      // Block portals
      for (const portal of runtime.mapState.portals) {
        if (!portal.alive) continue;
        const portalDist = worldDistance(inh.wx, inh.wy, portal.wx, portal.wy, ws);
        if (portalDist < cfg.vesselPortalBlockRange) {
          portal.alive = false;
          publishEvent("portal.blocked", { portalId: portal.id });
        }
      }
    }

    // Final portal
    if (!inh.finalPortalSpawned && inh.vesselTimer >= cfg.vesselTimeToForm + cfg.finalPortalDelay) {
      // Spawn guaranteed portal farthest from Vessel
      let bestDist = 0, bestX = ws / 2, bestY = ws / 2;
      for (let i = 0; i < 8; i++) {
        const cx = Math.random() * ws;
        const cy = Math.random() * ws;
        const d = worldDistance(inh.wx, inh.wy, cx, cy, ws);
        if (d > bestDist) { bestDist = d; bestX = cx; bestY = cy; }
      }
      runtime.mapState.portals.push({
        id: `portal-final-${runtime.tick}`,
        wx: bestX, wy: bestY,
        type: "standard", wave: 99,
        spawnTime: runtime.simTime,
        lifespan: cfg.finalPortalLifespan,
        alive: true, opacity: 1,
      });
      inh.finalPortalSpawned = true;
      publishEvent("inhibitor.finalPortal", { wx: bestX, wy: bestY });
    }
  }
}

function tickSim() {
  if (runtime.session.status !== "running") return;
  const tickStart = performance.now();
  const dt = runtime.session.timeScale / runtime.session.tickHz;
  runtime.tick += 1;
  runtime.simTime += dt;
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

    const input = player.lastInput;
    if (input.consumeSlot !== null && input.consumeSlot !== undefined) {
      applyConsumable(player, input.consumeSlot);
      player.lastInput = { ...player.lastInput, consumeSlot: null };
    }

    if (input.pulse) {
      applyPulse(player);
      player.lastInput = { ...player.lastInput, pulse: false };
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
    const burnMod = getBurnModifiers(player);
    const accel = 2.5 * b.thrustScale * burnMod.thrust * input.thrust * controlMult;
    player.vx += input.moveX * accel * playerDt;
    player.vy += input.moveY * accel * playerDt;

    // Current coupling: fluid flow affects this ship more/less than default
    // (applied as velocity bias toward flow direction — higher coupling = more flow influence)
    if (b.currentCoupling !== 1.0) {
      const flow = estimateFlow(player.wx, player.wy);
      const couplingDelta = (b.currentCoupling - 1.0) * 0.5; // scale for feel
      player.vx += flow.x * couplingDelta * playerDt;
      player.vy += flow.y * couplingDelta * playerDt;
    }

    applyWellGravity(player, playerDt);
    if (player.status !== "alive") continue;
    applyStarPush(player, playerDt, relevance.stars);
    applyPlanetoidPush(player, playerDt, relevance.planetoids);
    applyWaveRingPush(player, playerDt);
    const brakeDrag = Math.max(0, Math.min(1, input.brake || 0)) * SERVER_INPUT.brakeStrength;
    const dragBase = Math.max(0.01, SERVER_INPUT.baseDrag - brakeDrag);
    player.vx *= Math.pow(dragBase * b.dragScale, playerDt * 15);
    player.vy *= Math.pow(dragBase * b.dragScale, playerDt * 15);
    player.wx = ((player.wx + player.vx * playerDt) % runtime.session.worldScale + runtime.session.worldScale) % runtime.session.worldScale;
    player.wy = ((player.wy + player.vy * playerDt) % runtime.session.worldScale + runtime.session.worldScale) % runtime.session.worldScale;
    applyScavengerBump(player, relevance.scavengers);

    tickPlayerPickups(player, relevance.wrecks);
    tickExtraction(player);
    if (player.status !== "alive") continue;
    tickPlayerSignal(player, playerDt);
  }

  const alivePlayerCount = relevance.alivePlayers.length;
  const activeAiCount = runtime.mapState.scavengers.filter((scav) => scav.alive !== false && scav.state !== "dying").length;
  const activeWreckCount = relevance.wrecks.filter((wreck) => wreck.alive !== false && !wreck.looted).length;
  const activePortalCount = runtime.mapState.portals.filter((portal) => portal.alive !== false).length;
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

function restartTickLoop() {
  if (tickHandle) clearInterval(tickHandle);
  tickHandle = setInterval(tickSim, Math.max(1, Math.round(1000 / runtime.session.tickHz)));
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
    res.setHeader("Access-Control-Allow-Headers", "content-type");
    res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
    res.end();
    return;
  }

  try {
    if (req.method === "GET" && req.url === "/health") {
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
      });
      return;
    }

    if (req.method === "GET" && req.url === "/maps") {
      sendJson(res, 200, {
        type: "maps",
        maps: Object.values(PLAYABLE_MAPS).map((map) => {
          const profile = getSimScaleProfile(map.id, map.worldScale);
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

    if (req.method === "GET" && req.url?.startsWith("/snapshot")) {
      sendJson(res, 200, snapshotBody());
      return;
    }

    if (req.method === "GET" && req.url?.startsWith("/events")) {
      const url = new URL(req.url, `http://${HOST}:${PORT}`);
      const since = Number(url.searchParams.get("since") || 0);
      sendJson(res, 200, {
        type: "events",
        protocolVersion: PROTOCOL_VERSION,
        events: runtime.recentEvents.filter((event) => event.seq > since),
      });
      return;
    }

    if (req.method === "POST" && req.url === "/session/start") {
      const body = await readJson(req);
      if (runtime.session.status === "running") {
        const permission = ensureHostPermission(String(body.requesterId || "").trim());
        if (!permission.ok) {
          sendJson(res, 403, { ok: false, error: permission.error, session: runtime.session });
          return;
        }
      }
      startSession(body);
      sendJson(res, 200, { ok: true, session: runtime.session });
      return;
    }

    if (req.method === "POST" && req.url === "/session/reset") {
      const body = await readJson(req);
      const permission = ensureHostPermission(String(body.requesterId || "").trim());
      if (!permission.ok) {
        sendJson(res, 403, { ok: false, error: permission.error, session: runtime.session });
        return;
      }
      startSession({
        ...runtime.session,
        requesterId: runtime.session.hostClientId,
        requesterName: runtime.session.hostName,
      });
      sendJson(res, 200, { ok: true, session: runtime.session });
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

      let player = runtime.players.get(clientId);
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
        const explicitHullType = normalizeHullType(body.hullType, durableProfile?.hullType || durableProfile?.shipType || body.profileSnapshot?.hullType || body.profileSnapshot?.shipType);
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
          player.profileShipType = body.profileSnapshot.shipType;
          player.hullType = normalizeHullType(player.hullType, player.profileShipType);
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

      sendJson(res, 200, { ok: true, player });
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
      sendJson(res, 200, { ok: true, profile });
      return;
    }

    if (req.method === "POST" && req.url === "/leave") {
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
      if (!player.isAI && !player.committedOutcome) {
        commitPlayerOutcome(player, player.status === "escaped" ? "escaped" : "abandoned");
      }
      runtime.players.delete(clientId);
      publishEvent("player.left", {
        clientId,
        name: player.name,
      });
      promoteHostIfNeeded();
      persistSessionRegistry();
      sendJson(res, 200, { ok: true, session: runtime.session, playerCount: runtime.players.size });
      return;
    }

    if (req.method === "POST" && req.url === "/input") {
      const body = await readJson(req);
      const message = normalizeInputMessage(body);
      if (!message.clientId) {
        sendJson(res, 400, { ok: false, error: "clientId is required" });
        return;
      }
      const player = runtime.players.get(message.clientId);
      if (!player) {
        sendJson(res, 404, { ok: false, error: "Unknown client" });
        return;
      }
      if (message.seq <= player.lastInput.seq) {
        sendJson(res, 200, { ok: true, ignored: true, reason: "stale-seq" });
        return;
      }
      player.lastInput = {
        ...message,
        pulse: Boolean(player.lastInput.pulse || message.pulse),
        consumeSlot:
          message.consumeSlot === null || message.consumeSlot === undefined
            ? player.lastInput.consumeSlot
            : message.consumeSlot,
      };
      sendJson(res, 200, { ok: true, acceptedSeq: message.seq, tick: runtime.tick });
      return;
    }

    if (req.method === "POST" && req.url === "/inventory/action") {
      const body = await readJson(req);
      const message = normalizeInventoryAction(body);
      if (!message.clientId) {
        sendJson(res, 400, { ok: false, error: "clientId is required" });
        return;
      }
      const player = runtime.players.get(message.clientId);
      if (!player) {
        sendJson(res, 404, { ok: false, error: "Unknown client" });
        return;
      }
      const result = applyInventoryAction(player, message);
      if (!result.ok) {
        sendJson(res, 409, { ok: false, error: result.error });
        return;
      }
      sendJson(res, 200, { ok: true, player, snapshot: snapshotBody() });
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
      sendJson(res, 200, { ok: true, player, snapshot: snapshotBody() });
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
      sendJson(res, 200, { ok: true, scavenger, snapshot: snapshotBody() });
      return;
    }

    sendJson(res, 404, { ok: false, error: "Not found" });
  } catch (err) {
    sendJson(res, 500, { ok: false, error: err.message });
  }
});

server.on("error", (err) => {
  console.error(`[${LOG_LABEL}] ${err.message}`);
  cleanupFiles(PID_FILE, META_FILE);
  process.exit(1);
});

function shutdown() {
  if (tickHandle) clearInterval(tickHandle);
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
