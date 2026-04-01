// --- Hull-Specific Rig Tracks ---
// Each hull has 3 named upgrade tracks with 5 levels each.
// Tracks deepen hull identity (not cover weaknesses).
// See CLASSES-AND-PROGRESSION.md and META-LOOP.md for full design.

const RIG_TRACKS = {
  drifter: {
    laminar:    { name: 'Laminar',    focus: 'current mastery' },
    edgerunner: { name: 'Edgerunner', focus: 'well navigation' },
    gleanings:  { name: 'Gleanings',  focus: 'extraction value' },
  },
  breacher: {
    afterburner: { name: 'Afterburner', focus: 'raw speed' },
    ironclad:    { name: 'Ironclad',    focus: 'survivability' },
    smashgrab:   { name: 'Smash & Grab', focus: 'speed-looting' },
  },
  resonant: {
    harmonics:  { name: 'Harmonics',  focus: 'eddy mastery' },
    anchor:     { name: 'Anchor',     focus: 'territorial control' },
    dampening:  { name: 'Dampening',  focus: 'anti-inhibitor' },
  },
  shroud: {
    phantom: { name: 'Phantom', focus: 'stealth depth' },
    sensor:  { name: 'Sensor',  focus: 'information' },
    decoy:   { name: 'Decoy',   focus: 'misdirection' },
  },
  hauler: {
    cargo:     { name: 'Cargo',     focus: 'carrying capacity' },
    salvage:   { name: 'Salvage',   focus: 'loot quality' },
    endurance: { name: 'Endurance', focus: 'survivability' },
  },
};

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

// Normalize rig levels: clamp to [0, 5], ensure 3 values
function normalizeRigLevels(rigLevels, hullType) {
  const defaults = defaultRigLevels(hullType);
  if (!Array.isArray(rigLevels)) return defaults;
  return defaults.map((d, i) => {
    const v = Number(rigLevels[i]);
    return Number.isFinite(v) ? clamp(Math.round(v), 0, 5) : d;
  });
}

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
      // currentSight: client-only (HUD renders flow lines within sensor range)
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
      // signalSight: client-only (HUD renders entity signal levels as color auras)
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
      // deepScanner: client-only (HUD shows wreck contents before looting)
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
    brain.dragScale *= Math.max(0.1, 1 - upgrades.drag * 0.12);
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

// --- Hull-Specific Rig Track Application ---
// Each hull's 3 tracks modify different coefficients at each level.
// rigLevels is [track0Level, track1Level, track2Level], each 0-5.
// Track order matches rigTrackNames() canonical order.

function applyRigUpgrades(brain, hullType, rigLevels) {
  const levels = normalizeRigLevels(rigLevels, hullType);

  if (hullType === 'drifter') {
    const [laminar, edgerunner, gleanings] = levels;
    // Laminar: current mastery
    if (laminar >= 1) brain.currentCoupling += 0.1;
    if (laminar >= 2) { /* flowLock alignTime -0.5s — applied in ability tick */ }
    if (laminar >= 3) brain.currentCoupling += 0.1;
    if (laminar >= 4) { /* flowLock alignTime -0.5s — applied in ability tick */ }
    if (laminar >= 5) { /* flowLock signalMult → 0.05 — applied in ability tick */ }
    // Edgerunner: well navigation
    if (edgerunner >= 1) brain.wellResistScale += 0.1;
    if (edgerunner >= 2) brain.signalDecayMult *= 1.2; // +20% decay in accretion shadows
    if (edgerunner >= 3) brain.wellResistScale += 0.1;
    if (edgerunner >= 4) { /* well kill radius visible in HUD — client-only */ }
    if (edgerunner >= 5) { /* eddyBrake cooldown -5s — applied in ability tick */ }
    // Gleanings: extraction value
    if (gleanings >= 1) brain.pickupRadius += 0.1;
    if (gleanings >= 2) { /* wreck tier visible before loot — client-only */ }
    if (gleanings >= 3) brain.pickupRadius += 0.1;
    if (gleanings >= 4) { /* 20% chance +1 item on extraction — applied in extraction logic */ }
    if (gleanings >= 5) { /* slipStream signalReduction → 0.5 — applied in ability tick */ }

  } else if (hullType === 'breacher') {
    const [afterburner, ironclad, smashgrab] = levels;
    // Afterburner: raw speed
    if (afterburner >= 1) { /* +5s burn fuel — applied in ability state init */ }
    if (afterburner >= 2) brain.thrustScale += 0.1;
    if (afterburner >= 3) { /* +5s burn fuel — applied in ability state init */ }
    if (afterburner >= 4) { /* burn recharge +50% — applied in ability tick */ }
    if (afterburner >= 5) { /* burn thrustMult → 2.5 — applied in ability tick */ }
    // Ironclad: survivability
    if (ironclad >= 1) brain.wellResistScale += 0.1;
    if (ironclad >= 2) brain.controlDebuffResist += 0.15;
    if (ironclad >= 3) { /* momentum shield threshold -10% — applied in ability tick */ }
    if (ironclad >= 4) brain.freeWellSurvives += 1; // shield charge on first burn
    if (ironclad >= 5) { /* shockwave stun +1s — applied in ability tick */ }
    // Smash & Grab: speed-looting
    if (smashgrab >= 1) { /* smashGrab: pickup at 90% speed — applied in pickup logic */ }
    if (smashgrab >= 2) brain.pickupRadius += 0.1;
    if (smashgrab >= 3) { /* smashGrab: pickup at 70% speed — applied in pickup logic */ }
    if (smashgrab >= 4) { /* cargo eject scatters further — applied in death logic */ }
    if (smashgrab >= 5) brain.signalGenMult *= 0.7; // loot spikes -30%

  } else if (hullType === 'resonant') {
    const [harmonics, anchor, dampening] = levels;
    // Harmonics: eddy mastery
    if (harmonics >= 1) { /* +1 max eddy — applied in ability tick */ }
    if (harmonics >= 2) { /* eddy duration +2s — applied in ability tick */ }
    if (harmonics >= 3) { /* eddies pull wrecks — applied in ability tick */ }
    if (harmonics >= 4) { /* +1 max eddy — applied in ability tick */ }
    if (harmonics >= 5) { /* eddies visible to all — client rendering */ }
    // Anchor: territorial control
    if (anchor >= 1) { /* resonanceTap range +0.1 — applied in ability tick */ }
    if (anchor >= 2) { /* tap cooldown -5s — applied in ability tick */ }
    if (anchor >= 3) brain.pulseCooldownScale *= 0.8; // -20% near anchor
    if (anchor >= 4) { /* tap persists through death — applied in death logic */ }
    if (anchor >= 5) { /* frequencyShift cooldown -15s — applied in ability tick */ }
    // Dampening: anti-inhibitor
    if (dampening >= 1) { /* dampening slow +10% — applied in inhibitor tick */ }
    if (dampening >= 2) { /* eddies reduce signal -0.005/s — applied in signal tick */ }
    if (dampening >= 3) { /* dampening slow +10% — applied in inhibitor tick */ }
    if (dampening >= 4) { /* eddies block form 1 — applied in inhibitor tick */ }
    if (dampening >= 5) { /* dampening works on form 3 — applied in inhibitor tick */ }

  } else if (hullType === 'shroud') {
    const [phantom, sensor, decoy] = levels;
    // Phantom: stealth depth
    if (phantom >= 1) { /* ghostTrail threshold → PRESENCE — applied in ability tick */ }
    if (phantom >= 2) brain.signalDecayMult *= 1.1;
    if (phantom >= 3) { /* wakeCloak cooldown -10s — applied in ability tick */ }
    if (phantom >= 4) { /* scavengers never detect — applied in scavenger AI */ }
    if (phantom >= 5) { /* wakeCloak works at THRESHOLD — applied in ability tick */ }
    // Sensor: information
    if (sensor >= 1) brain.sensorRange += 0.1;
    if (sensor >= 2) { /* see inhibitor tracking target — client-only */ }
    if (sensor >= 3) brain.sensorRange += 0.1;
    if (sensor >= 4) { /* see wreck contents — client-only (like deepScanner) */ }
    if (sensor >= 5) { /* see other players' equipped items — client-only */ }
    // Decoy: misdirection
    if (decoy >= 1) { /* +1 decoy charge — applied in ability state init */ }
    if (decoy >= 2) { /* decoy duration +4s — applied in ability tick */ }
    if (decoy >= 3) { /* decoy cooldown -20% — applied in ability tick */ }
    if (decoy >= 4) { /* decoys attract fauna — applied in fauna tick */ }
    if (decoy >= 5) { /* decoys placed remotely — applied in ability tick */ }

  } else if (hullType === 'hauler') {
    const [cargo, salvage, endurance] = levels;
    // Cargo: carrying capacity
    if (cargo >= 1) brain.cargoSlots += 1; // → 7
    if (cargo >= 2) { /* tagged wrecks glow brighter — client rendering */ }
    if (cargo >= 3) brain.cargoSlots += 1; // → 8
    if (cargo >= 4) { /* cargo brace: first swarm drain blocked — applied in inhibitor tick */ }
    if (cargo >= 5) { /* salvageLock +1 charge — applied in ability state init */ }
    // Salvage: loot quality
    if (salvage >= 1) { /* deepScanner shows item names — client-only */ }
    if (salvage >= 2) { /* tagged wreck bonus +1 item — applied in pickup logic */ }
    if (salvage >= 3) { /* tractor range +0.05 — applied in ability tick */ }
    if (salvage >= 4) { /* tagged wrecks locked for 10s — applied in pickup logic */ }
    if (salvage >= 5) { /* tractor can pull portals — applied in ability tick */ }
    // Endurance: survivability
    if (endurance >= 1) brain.freeWellSurvives = Math.max(brain.freeWellSurvives, 1); // eject scatters 0
    if (endurance >= 2) brain.wellResistScale += 0.1;
    if (endurance >= 3) { /* tractor cooldown -10s — applied in ability tick */ }
    if (endurance >= 4) brain.freeWellSurvives += 1; // → 2 per run
    if (endurance >= 5) { /* +10% speed when cargo full — applied in physics tick */ }
  }
}

function createPlayerBrain({ hullType = "drifter", rigLevels = null, profileUpgrades = null, equipped = [] } = {}) {
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

  // Hard caps
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
  RIG_TRACKS,
  defaultRigLevels,
  rigTrackNames,
  normalizeRigLevels,
  HULL_DEFINITIONS,
  BRAIN_DEFAULTS,
  normalizeHullType,
  normalizeProfileUpgrades,
  createPlayerBrain,
  createAbilityState,
};
