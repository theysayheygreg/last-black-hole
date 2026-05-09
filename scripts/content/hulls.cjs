// Hull content manifest.
//
// This is the first extracted runtime content surface for LBH's authority
// stack. The goal is simple: keep hull identity, AI hull assignment, and
// named rig tracks in data space so the server runtime and PlayerBrain do not
// each become a second hidden source of truth.

const RIG_TRACKS = {
  drifter: {
    laminar: { name: 'Laminar', focus: 'current mastery' },
    edgerunner: { name: 'Edgerunner', focus: 'well navigation' },
    gleanings: { name: 'Gleanings', focus: 'extraction value' },
  },
  breacher: {
    afterburner: { name: 'Afterburner', focus: 'raw speed' },
    ironclad: { name: 'Ironclad', focus: 'survivability' },
    smashgrab: { name: 'Smash & Grab', focus: 'speed-looting' },
  },
  resonant: {
    harmonics: { name: 'Harmonics', focus: 'eddy mastery' },
    anchor: { name: 'Anchor', focus: 'territorial control' },
    dampening: { name: 'Dampening', focus: 'anti-inhibitor' },
  },
  shroud: {
    phantom: { name: 'Phantom', focus: 'stealth depth' },
    sensor: { name: 'Sensor', focus: 'information' },
    decoy: { name: 'Decoy', focus: 'misdirection' },
  },
  hauler: {
    cargo: { name: 'Cargo', focus: 'carrying capacity' },
    salvage: { name: 'Salvage', focus: 'loot quality' },
    endurance: { name: 'Endurance', focus: 'survivability' },
  },
};

const PROFILE_SHIP_TO_HULL = {
  standard: 'drifter',
  drifter: 'drifter',
  breacher: 'breacher',
  resonant: 'resonant',
  shroud: 'shroud',
  hauler: 'hauler',
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
    dragScale: 0.9,
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

const PERSONALITY_HULL_MAP = {
  prospector: ['drifter', 'hauler'],
  raider: ['breacher'],
  vulture: ['resonant', 'breacher'],
  ghost: ['shroud', 'drifter'],
  desperado: ['breacher'],
};

module.exports = {
  RIG_TRACKS,
  PROFILE_SHIP_TO_HULL,
  HULL_DEFINITIONS,
  PERSONALITY_HULL_MAP,
};
