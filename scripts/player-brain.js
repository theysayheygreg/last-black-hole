const DEFAULT_PROFILE_UPGRADES = {
  thrust: 0,
  hull: 0,
  coupling: 0,
  drag: 0,
  sensor: 0,
  vault: 0,
};

const PROFILE_SHIP_TO_HULL = {
  standard: "drifter",
  drifter: "drifter",
  breacher: "breacher",
  resonant: "resonant",
  shroud: "shroud",
  hauler: "hauler",
};

const HULL_DEFINITIONS = {
  drifter: {
    name: 'Drifter',
    thrustScale: 0.7,
    dragScale: 0.85,
    currentCoupling: 1.6,
    signalGenMult: 0.5,
    signalDecayMult: 1.0,
    pulseRadiusScale: 0.8,
    pulseCooldownScale: 1.0,
    pulseSignalScale: 1.0,
    cargoSlots: 4,
    pickupRadius: 1.0,
    sensorRange: 1.0,
    wellResistScale: 1.0,
    controlDebuffResist: 1.0,
    abilities: {
      flowLock: { type: 'passive_trigger', alignTime: 3.0, speedBoost: 0.4, signalMult: 0.1, cooldown: 5.0 },
      eddyBrake: { type: 'active', cooldown: 20.0, turbulenceDuration: 2.0, slowFactor: 0.5 },
      slipStream: { type: 'passive', followDist: 0.1, speedBonus: 0.2, signalReduction: 0.3 },
    },
  },
  breacher: {
    name: 'Breacher',
    thrustScale: 1.4,
    dragScale: 1.0,
    currentCoupling: 0.7,
    signalGenMult: 1.5,
    signalDecayMult: 0.8,
    pulseRadiusScale: 1.0,
    pulseCooldownScale: 1.0,
    pulseSignalScale: 1.0,
    cargoSlots: 4,
    pickupRadius: 1.0,
    sensorRange: 0.8,
    wellResistScale: 1.2,
    controlDebuffResist: 0.7,
    abilities: {
      burn: { type: 'active_toggle', fuelMax: 30.0, fuelRechargeRate: 0.5, thrustMult: 2.0, signalMult: 3.0 },
      shockwave: { type: 'enhanced_pulse', radiusMult: 1.5, stunDuration: 2.0, signalSpike: 0.15 },
      momentumShield: { type: 'passive', speedThreshold: 0.8, wellPullReduction: 0.25 },
      smashGrab: { type: 'passive' },
    },
  },
  resonant: {
    name: 'Resonant',
    thrustScale: 0.9,
    dragScale: 0.95,
    currentCoupling: 1.0,
    signalGenMult: 0.8,
    signalDecayMult: 1.0,
    pulseRadiusScale: 1.5,
    pulseCooldownScale: 0.6,
    pulseSignalScale: 0.5,
    cargoSlots: 4,
    pickupRadius: 1.0,
    sensorRange: 1.0,
    wellResistScale: 1.0,
    controlDebuffResist: 1.0,
    abilities: {
      harmonicPulse: { type: 'enhanced_pulse', eddyDuration: 6.0, eddyStrength: 0.03, maxEddies: 3 },
      resonanceTap: { type: 'active', cooldown: 15.0, range: 0.3, cooldownReduction: 0.5, radiusBonus: 0.3 },
      frequencyShift: { type: 'active', cooldown: 45.0 },
      dampeningField: { type: 'passive', inhibitorSlowFactor: 0.3 },
    },
  },
  shroud: {
    name: 'Shroud',
    thrustScale: 0.8,
    dragScale: 0.90,
    currentCoupling: 1.0,
    signalGenMult: 0.4,
    signalDecayMult: 1.5,
    pulseRadiusScale: 0.6,
    pulseCooldownScale: 1.3,
    pulseSignalScale: 1.2,
    cargoSlots: 3,
    pickupRadius: 0.8,
    sensorRange: 1.3,
    wellResistScale: 0.9,
    controlDebuffResist: 1.0,
    abilities: {
      wakeCloak: { type: 'active', cooldown: 30.0, zoneDrop: 1 },
      ghostTrail: { type: 'passive', maxZone: 'whisper' },
      decoyFlare: { type: 'active', cooldown: 60.0, charges: 2, duration: 8.0, decayRate: 0.5 },
    },
  },
  hauler: {
    name: 'Hauler',
    thrustScale: 0.6,
    dragScale: 1.1,
    currentCoupling: 0.8,
    signalGenMult: 1.0,
    signalDecayMult: 0.9,
    pulseRadiusScale: 0.9,
    pulseCooldownScale: 1.0,
    pulseSignalScale: 1.0,
    cargoSlots: 6,
    pickupRadius: 1.4,
    sensorRange: 0.9,
    wellResistScale: 0.8,
    controlDebuffResist: 1.2,
    abilities: {
      salvageLock: { type: 'active', charges: 2, bonusItems: 1 },
      reinforcedHull: { type: 'passive', wellSurvives: 1 },
      tractorField: { type: 'active', cooldown: 25.0, range: 0.15, channelTime: 3.0, pullSpeed: 0.04 },
    },
  },
};

const BRAIN_DEFAULTS = {
  thrustScale: 1.0,
  dragScale: 1.0,
  currentCoupling: 1.0,
  signalGenMult: 1.0,
  signalDecayMult: 1.0,
  pulseRadiusScale: 1.0,
  pulseCooldownScale: 1.0,
  pulseSignalScale: 1.0,
  cargoSlots: 4,
  pickupRadius: 1.0,
  sensorRange: 1.0,
  wellResistScale: 1.0,
  controlDebuffResist: 1.0,
  wellGraceDuration: 0,
  freeWellSurvives: 0,
};

const BRAIN_CAPS = {
  thrustScale: [0.3, 2.5],
  dragScale: [0.5, 1.5],
  currentCoupling: [0.3, 2.5],
  signalGenMult: [0.2, 3.0],
  signalDecayMult: [0.3, 3.0],
  pulseRadiusScale: [0.3, 2.5],
  pulseCooldownScale: [0.3, 2.0],
  pulseSignalScale: [0.2, 2.0],
  pickupRadius: [0.5, 2.0],
  sensorRange: [0.5, 2.5],
  wellResistScale: [0.5, 2.0],
  controlDebuffResist: [0.3, 2.0],
  wellGraceDuration: [0, 1.0],
  freeWellSurvives: [0, 3],
};

const ARTIFACT_COEFFICIENTS = {
  reduceWellPull: { wellResistScale: 1.25 },
  signalDampen: { signalGenMult: 0.85 },
};

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function normalizeProfileUpgrades(upgrades = {}) {
  const next = { ...DEFAULT_PROFILE_UPGRADES };
  for (const [key, value] of Object.entries(upgrades || {})) {
    if (!(key in next)) continue;
    const rank = Number(value);
    next[key] = Number.isFinite(rank) ? clamp(Math.round(rank), 0, 3) : 0;
  }
  return next;
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

function applyUpgradeCoefficients(brain, upgrades) {
  brain.thrustScale *= 1 + upgrades.thrust * 0.15;
  brain.currentCoupling *= 1 + upgrades.coupling * 0.10;
  brain.dragScale *= 1 - upgrades.drag * 0.12;

  const sensorMultipliers = [1.0, 1.2, 1.45, 1.7];
  brain.sensorRange *= sensorMultipliers[upgrades.sensor] ?? sensorMultipliers[sensorMultipliers.length - 1];

  if (upgrades.hull > 0) {
    brain.wellGraceDuration = 0.2 + upgrades.hull * 0.1;
  }
  if (upgrades.hull >= 2) {
    brain.freeWellSurvives += 1;
  }
}

function createPlayerBrain({ hullType = "drifter", profileUpgrades = {}, equipped = [] } = {}) {
  const normalizedHullType = normalizeHullType(hullType);
  const hull = HULL_DEFINITIONS[normalizedHullType] || HULL_DEFINITIONS.drifter;
  const brain = {};

  for (const key of Object.keys(BRAIN_DEFAULTS)) {
    brain[key] = hull[key] !== undefined ? hull[key] : BRAIN_DEFAULTS[key];
  }

  const upgrades = normalizeProfileUpgrades(profileUpgrades);
  applyUpgradeCoefficients(brain, upgrades);

  for (const item of equipped || []) {
    applyItemBrainEffects(brain, item);
  }

  for (const [key, [min, max]] of Object.entries(BRAIN_CAPS)) {
    if (brain[key] !== undefined) {
      brain[key] = key === "freeWellSurvives"
        ? clamp(Math.round(brain[key]), min, max)
        : clamp(brain[key], min, max);
    }
  }

  brain.cargoSlots = Math.max(1, Math.round(brain.cargoSlots));
  return brain;
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
  DEFAULT_PROFILE_UPGRADES,
  HULL_DEFINITIONS,
  BRAIN_DEFAULTS,
  normalizeHullType,
  normalizeProfileUpgrades,
  createPlayerBrain,
  createAbilityState,
};
