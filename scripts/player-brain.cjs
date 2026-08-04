const {
  RIG_TRACKS,
  PROFILE_SHIP_TO_HULL,
  HULL_DEFINITIONS,
} = require('./content/hulls.cjs');
const { MOVEMENT } = require('./content/movement.cjs');
const { profileDragScaleFromUpgradeRank } = require('../src/content/tuning.js');
const { resolvePlayerNoiseModifiers } = require('./sim/noise-radius.cjs');
const { applySignatureModsToBrain } = require('./sim/signature-mods.cjs');

// Default rig state: 3 tracks at level 0 for a given hull
function defaultRigLevels(hullType) {
  const tracks = RIG_TRACKS[hullType];
  if (!tracks) return [0, 0, 0];
  return Object.keys(tracks).map(() => 0);
}

// Track names for a hull, in canonical order
function rigTrackNames(hullType) {
  const tracks = RIG_TRACKS[hullType];
  if (!tracks) return [];
  return Object.keys(tracks);
}

// Caps derive from the authority-owned manifest, so saved levels cannot unlock
// a rule the shipped track does not contain.
function normalizeRigLevels(rigLevels, hullType) {
  const defaults = defaultRigLevels(hullType);
  const tracks = Object.values(RIG_TRACKS[hullType] || {});
  if (!Array.isArray(rigLevels)) return defaults;
  return defaults.map((d, i) => {
    const v = Number(rigLevels[i]);
    const cap = Array.isArray(tracks[i]?.levels) ? tracks[i].levels.length : 0;
    return Number.isFinite(v) ? clamp(Math.round(v), 0, cap) : d;
  });
}

const BRAIN_DEFAULTS = {
  thrustScale: 1.0,
  dragScale: 1.0,
  currentCoupling: 1.0,
  noiseRadiusMultiplier: 1.0,
  noiseDecayMultiplier: 1.0,
  pulseRadiusScale: 1.0,
  pulseCooldownScale: 1.0,
  pulseNoiseRadiusScale: 1.0,
  cargoSlots: 4,
  pickupRadius: 1.0,
  sensorRange: 1.0,
  wellResistScale: 1.0,
  controlDebuffResist: 1.0,
  wellGraceDuration: 0,
  freeWellSurvives: 0,
  deltaVMax: MOVEMENT.player.deltaVMax,
  deltaVRegen: MOVEMENT.player.deltaVRegen,
  deltaVRegenBoost: MOVEMENT.player.deltaVRegenBoost,
  deltaVBurnEff: 1.0,
  deltaVBurnRate: MOVEMENT.player.deltaVBurnRate,
};

const BRAIN_CAPS = {
  thrustScale: [0.3, 2.5],
  dragScale: [0.5, 1.5],
  currentCoupling: [0.3, 2.5],
  noiseRadiusMultiplier: [0.2, 3.0],
  noiseDecayMultiplier: [0.3, 3.0],
  pulseRadiusScale: [0.3, 2.5],
  pulseCooldownScale: [0.3, 2.0],
  pulseNoiseRadiusScale: [0.2, 2.0],
  pickupRadius: [0.5, 2.0],
  sensorRange: [0.5, 2.5],
  wellResistScale: [0.5, 2.0],
  controlDebuffResist: [0.3, 2.0],
  wellGraceDuration: [0, 1.0],
  freeWellSurvives: [0, 3],
  deltaVMax: [1, 500],
  deltaVRegen: [0, 20],
  deltaVRegenBoost: [0, 40],
  deltaVBurnEff: [0.1, 5],
  deltaVBurnRate: [1, 60],
};

const ITEM_COEFFICIENT_ALIASES = {
  deltaVCapacityMult: "deltaVMax",
  deltaVRegenMult: ["deltaVRegen", "deltaVRegenBoost"],
  deltaVBurnMult: "deltaVBurnEff",
  noiseRadiusMultiplier: "noiseRadiusMultiplier",
  noiseDecayMultiplier: "noiseDecayMultiplier",
  // Legacy loadout-save aliases only. Canonical content uses Noise names.
  signalGenMult: "noiseRadiusMultiplier",
  signalDecayMult: "noiseDecayMultiplier",
  pulseSignalScale: "pulseNoiseRadiusScale",
};

const ARTIFACT_COEFFICIENTS = {
  reduceWellPull: { wellResistScale: 1.25 },
  signalDampen: { noiseRadiusMultiplier: 0.85 },
};

const PROFILE_UPGRADE_DEFAULTS = {
  thrust: 0,
  hull: 0,
  coupling: 0,
  drag: 0,
  sensor: 0,
  vault: 0,
};

const PROFILE_UPGRADE_CAPS = {
  thrust: 3,
  hull: 3,
  coupling: 3,
  drag: 3,
  sensor: 3,
  vault: 3,
};

const SENSOR_RANGE_MULTIPLIERS = [1.0, 1.2, 1.45, 1.7];
const HULL_GRACE_DURATIONS = [0, 0.3, 0.4, 0.5];
const HULL_FREE_WELL_SURVIVES = [0, 0, 1, 1];

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function normalizeProfileUpgrades(upgrades = {}) {
  const normalized = {};
  for (const [key, defaultValue] of Object.entries(PROFILE_UPGRADE_DEFAULTS)) {
    const raw = Number(upgrades?.[key]);
    const cap = PROFILE_UPGRADE_CAPS[key] ?? defaultValue;
    normalized[key] = Number.isFinite(raw)
      ? clamp(Math.round(raw), 0, cap)
      : defaultValue;
  }
  return normalized;
}

function normalizeHullType(hullType = null, profileShipType = null) {
  if (hullType && HULL_DEFINITIONS[hullType]) return hullType;
  const fromProfile = PROFILE_SHIP_TO_HULL[profileShipType] || null;
  return fromProfile && HULL_DEFINITIONS[fromProfile] ? fromProfile : "drifter";
}

function applyNumericMultiplier(brain, key, multiplier) {
  if (!Number.isFinite(multiplier)) return;
  if (brain[key] === undefined || typeof brain[key] !== "number") return;
  if (key === "cargoSlots" || key === "freeWellSurvives") return;
  brain[key] *= multiplier;
}

function applyItemBrainEffects(brain, item) {
  if (!item) return;
  if (item.coefficients) {
    for (const [key, value] of Object.entries(item.coefficients)) {
      const alias = ITEM_COEFFICIENT_ALIASES[key];
      if (alias) {
        for (const target of Array.isArray(alias) ? alias : [alias]) {
          applyNumericMultiplier(brain, target, value);
        }
        continue;
      }
      if (key === "cargoSlots") {
        if (Number.isFinite(value)) brain.cargoSlots += value;
        continue;
      }
      applyNumericMultiplier(brain, key, value);
    }
  }
  const effectCoefficients = item.effect ? ARTIFACT_COEFFICIENTS[item.effect] : null;
  if (!effectCoefficients) return;
  for (const [key, value] of Object.entries(effectCoefficients)) {
    applyNumericMultiplier(brain, key, value);
  }
}

function applyProfileUpgrades(brain, profileUpgrades = null) {
  const upgrades = normalizeProfileUpgrades(profileUpgrades);
  if (upgrades.thrust > 0) {
    brain.thrustScale *= 1 + upgrades.thrust * 0.15;
  }
  if (upgrades.coupling > 0) {
    brain.currentCoupling *= 1 + upgrades.coupling * 0.10;
  }
  if (upgrades.drag > 0) {
    brain.dragScale *= profileDragScaleFromUpgradeRank(upgrades.drag);
  }
  if (upgrades.sensor > 0) {
    brain.sensorRange *= SENSOR_RANGE_MULTIPLIERS[upgrades.sensor] || SENSOR_RANGE_MULTIPLIERS[SENSOR_RANGE_MULTIPLIERS.length - 1];
  }
  if (upgrades.hull > 0) {
    brain.wellGraceDuration = Math.max(
      brain.wellGraceDuration,
      HULL_GRACE_DURATIONS[upgrades.hull] || 0
    );
    brain.freeWellSurvives = Math.max(
      brain.freeWellSurvives,
      HULL_FREE_WELL_SURVIVES[upgrades.hull] || 0
    );
  }
  return upgrades;
}

// --- Authority-owned rig application ---
// Each purchasable display string is paired with a manifest coefficient at an
// existing authority seam. Deferred ability and renderer-only promises are not
// valid rig levels.

function applyRigUpgrades(brain, hullType, rigLevels) {
  const levels = normalizeRigLevels(rigLevels, hullType);

  const tracks = Object.values(RIG_TRACKS[hullType] || {});
  for (const [trackIndex, track] of tracks.entries()) {
    for (const level of (track.levels || []).slice(0, levels[trackIndex])) {
      for (const modifier of level.modifiers || []) {
        if (!Number.isFinite(modifier?.value) || typeof brain[modifier.stat] !== 'number') continue;
        if (modifier.mode === 'add') brain[modifier.stat] += modifier.value;
        if (modifier.mode === 'multiply') brain[modifier.stat] *= modifier.value;
      }
    }
  }
}

function createPlayerBrain({ hullType = "drifter", rigLevels = null, profileUpgrades = null, equipped = [], signatureMods = null } = {}) {
  const normalizedHullType = normalizeHullType(hullType);
  const hull = HULL_DEFINITIONS[normalizedHullType] || HULL_DEFINITIONS.drifter;
  const brain = {};

  // Layer 1: hull base
  for (const key of Object.keys(BRAIN_DEFAULTS)) {
    brain[key] = hull[key] !== undefined ? hull[key] : BRAIN_DEFAULTS[key];
  }

  // Layer 2: legacy profile upgrades (durable profile progression)
  applyProfileUpgrades(brain, profileUpgrades);

  // Layer 3: rig track upgrades (additive on top of base+profile)
  const levels = rigLevels || defaultRigLevels(normalizedHullType);
  applyRigUpgrades(brain, normalizedHullType, levels);

  // Layer 4: equipped artifact effects (multiplicative on resolved brain)
  for (const item of equipped || []) {
    applyItemBrainEffects(brain, item);
  }

  // Layer 5: the run-wide signature is authoritative session state, not a
  // client-side configuration override.
  applySignatureModsToBrain(brain, signatureMods);

  // Hard caps
  for (const [key, [min, max]] of Object.entries(BRAIN_CAPS)) {
    if (brain[key] !== undefined) {
      brain[key] = key === "freeWellSurvives"
        ? clamp(Math.round(brain[key]), min, max)
        : clamp(brain[key], min, max);
    }
  }

  brain.cargoSlots = Math.max(1, Math.round(brain.cargoSlots));
  // The authority still reads this private field; keep the alias out of the
  // canonical content contract until that owner migrates its read site.
  brain.pulseSignalScale = brain.pulseNoiseRadiusScale;
  return brain;
}

function projectPlayerNoiseModifiers(brain) {
  return resolvePlayerNoiseModifiers({
    radiusMultiplier: brain?.noiseRadiusMultiplier,
    decayMultiplier: brain?.noiseDecayMultiplier,
  });
}

function syncPlayerNoiseModifiers(player) {
  if (!player?.noise) return null;
  const modifiers = projectPlayerNoiseModifiers(player.brain);
  player.noise.modifiers = modifiers;
  return modifiers;
}

function createAbilityState(hullType, brain = BRAIN_DEFAULTS) {
  const normalizedHullType = normalizeHullType(hullType);
  const hull = HULL_DEFINITIONS[normalizedHullType] || HULL_DEFINITIONS.drifter;
  const state = { hullType: normalizedHullType };

  if (normalizedHullType === 'drifter') {
    state.flowLockActive = false;
    state.flowLockAlignTimer = 0;
    state.flowLockCooldown = 0;
    state.eddyBrakeCooldown = 0;
  } else if (normalizedHullType === 'breacher') {
    state.burnActive = false;
    state.burnFuel = hull.abilities.burn.fuelMax;
    state.momentumShieldActive = false;
  } else if (normalizedHullType === 'resonant') {
    state.eddies = [];
    state.tapAnchor = null;
    state.tapCooldown = 0;
    state.frequencyShiftCooldown = 0;
    state.nextPulseInverted = false;
  } else if (normalizedHullType === 'shroud') {
    state.wakeCloakCooldown = 0;
    state.ghostTrailActive = false;
    state.decoyCharges = hull.abilities.decoyFlare.charges;
    state.decoyCooldown = 0;
    state.decoys = [];
  } else if (normalizedHullType === 'hauler') {
    state.salvageLockCharges = hull.abilities.salvageLock.charges;
    state.taggedWrecks = [];
    state.wellSurvivesRemaining = hull.abilities.reinforcedHull.wellSurvives;
    state.tractorCooldown = 0;
    state.tractorTarget = null;
    state.tractorChannelTimer = 0;
  }

  state.wellSurvivesRemaining = (state.wellSurvivesRemaining || 0) + (brain.freeWellSurvives || 0);
  return state;
}

module.exports = {
  RIG_TRACKS,
  defaultRigLevels,
  rigTrackNames,
  normalizeRigLevels,
  HULL_DEFINITIONS,
  BRAIN_DEFAULTS,
  normalizeHullType,
  normalizeProfileUpgrades,
  createPlayerBrain,
  projectPlayerNoiseModifiers,
  syncPlayerNoiseModifiers,
  createAbilityState,
};
