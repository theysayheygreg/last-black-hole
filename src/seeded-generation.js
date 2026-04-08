// seeded-generation.js — Client ESM mirror of scripts/seeded-generation.js.
//
// MUST STAY IN SYNC with scripts/seeded-generation.js. Same data,
// same algorithms, same output for the same seed + RNG state.
//
// This lets the client predict loot, signatures, and wreck composition
// from just a seed — no server round-trip needed.

export const COSMIC_SIGNATURES = [
  { id: 'heavy_current',  name: 'heavy current',  mods: { currentCouplingMult: 1.3 } },
  { id: 'dead_calm',      name: 'dead calm',       mods: { currentCouplingMult: 0.5, dragMult: 0.8 } },
  { id: 'signal_storm',   name: 'signal storm',    mods: { signalGenMult: 1.5, signalDecayMult: 0.7 } },
  { id: 'deep_gravity',   name: 'deep gravity',    mods: { wellGravityMult: 1.3, wellGrowthMult: 0.7 } },
  { id: 'thin_space',     name: 'thin space',      mods: { wellGravityMult: 0.7, portalLifespanMult: 0.6 } },
  { id: 'dark_run',       name: 'dark run',        mods: { sensorRangeMult: 0.6 } },
];

export const WELL_NAMES = [
  'Charybdis', 'Erebus', 'Tartarus', 'Lethe', 'Acheron',
  'Styx', 'Cocytus', 'Phlegethon', 'Mnemosyne', 'Nyx',
  'Abaddon', 'Sheol', 'Mictlan', 'Niflheim', 'Xibalba',
  'Pandemonium', 'Gehenna', 'Dis', 'Elysium', 'Avalon',
];

export const ITEM_CATALOG = {
  1: [
    { id: 'patched-thruster', name: 'Patched Thruster', tier: 1, affinity: null, coefficients: { thrustScale: 1.08 }, value: [15, 25] },
    { id: 'scrap-plating', name: 'Scrap Plating', tier: 1, affinity: null, coefficients: { wellResistScale: 1.06 }, value: [15, 20] },
    { id: 'signal-baffle', name: 'Signal Baffle', tier: 1, affinity: null, coefficients: { signalGenMult: 0.93 }, value: [18, 28] },
    { id: 'worn-coupling', name: 'Worn Coupling', tier: 1, affinity: null, coefficients: { currentCoupling: 1.06 }, value: [15, 22] },
    { id: 'drag-foil', name: 'Drag Foil', tier: 1, affinity: null, coefficients: { dragScale: 0.94 }, value: [15, 20] },
    { id: 'cargo-netting', name: 'Cargo Netting', tier: 1, affinity: null, coefficients: { cargoSlots: 1 }, value: [20, 30] },
    { id: 'pulse-lens', name: 'Pulse Lens', tier: 1, affinity: null, coefficients: { pulseRadiusScale: 1.10 }, value: [18, 25] },
    { id: 'sensor-dish', name: 'Sensor Dish', tier: 1, affinity: null, coefficients: { sensorRange: 1.10 }, value: [15, 22] },
    { id: 'flow-vane', name: 'Flow Vane', tier: 1, affinity: 'drifter', coefficients: { currentCoupling: 1.08 }, value: [18, 25] },
    { id: 'burn-canister', name: 'Burn Canister', tier: 1, affinity: 'breacher', coefficients: {}, value: [18, 25], special: 'burnFuel+3' },
  ],
  2: [
    { id: 'tuned-thruster', name: 'Tuned Thruster', tier: 2, affinity: null, coefficients: { thrustScale: 1.15 }, value: [50, 80] },
    { id: 'gravity-sheath', name: 'Gravity Sheath', tier: 2, affinity: null, coefficients: { wellResistScale: 1.15 }, value: [55, 85] },
    { id: 'signal-dampener', name: 'Signal Dampener', tier: 2, affinity: null, coefficients: { signalGenMult: 0.85 }, value: [60, 90] },
    { id: 'decay-accelerator', name: 'Decay Accelerator', tier: 2, affinity: null, coefficients: { signalDecayMult: 1.20 }, value: [55, 85] },
    { id: 'current-amplifier', name: 'Current Amplifier', tier: 2, affinity: 'drifter', coefficients: { currentCoupling: 1.18 }, value: [60, 90] },
    { id: 'afterburner-injector', name: 'Afterburner Injector', tier: 2, affinity: 'breacher', coefficients: { thrustScale: 1.12, signalGenMult: 1.10 }, value: [55, 80] },
    { id: 'resonance-coil', name: 'Resonance Coil', tier: 2, affinity: 'resonant', coefficients: { pulseRadiusScale: 1.20, pulseCooldownScale: 0.90 }, value: [65, 95] },
    { id: 'ghost-weave', name: 'Ghost Weave', tier: 2, affinity: 'shroud', coefficients: { signalGenMult: 0.82, sensorRange: 1.12 }, value: [70, 100] },
    { id: 'cargo-brace', name: 'Cargo Brace', tier: 2, affinity: 'hauler', coefficients: { cargoSlots: 1, pickupRadius: 1.10 }, value: [60, 90] },
    { id: 'pulse-sharpener', name: 'Pulse Sharpener', tier: 2, affinity: null, coefficients: { pulseSignalScale: 0.80, pulseRadiusScale: 0.90 }, value: [50, 75] },
    { id: 'debuff-purge', name: 'Debuff Purge', tier: 2, affinity: null, coefficients: { controlDebuffResist: 1.30 }, value: [50, 75] },
    { id: 'hull-reinforcement', name: 'Hull Reinforcement', tier: 2, affinity: null, coefficients: { wellResistScale: 1.10, controlDebuffResist: 1.15 }, value: [55, 85] },
    { id: 'drag-coefficient', name: 'Drag Coefficient', tier: 2, affinity: null, coefficients: { dragScale: 0.88 }, value: [55, 80] },
    { id: 'pickup-magnet', name: 'Pickup Magnet', tier: 2, affinity: null, coefficients: { pickupRadius: 1.25 }, value: [50, 75] },
  ],
  3: [
    { id: 'dead-mans-thruster', name: "Dead Man's Thruster", tier: 3, affinity: 'drifter', coefficients: { signalGenMult: 0.0, dragScale: 1.30 }, value: [200, 320], special: 'thrustSignalZero' },
    { id: 'overcharged-core', name: 'Overcharged Core', tier: 3, affinity: 'breacher', coefficients: { thrustScale: 1.30, signalGenMult: 1.50, signalDecayMult: 0.70 }, value: [220, 350] },
    { id: 'harmonic-anchor', name: 'Harmonic Anchor', tier: 3, affinity: 'resonant', coefficients: {}, value: [250, 380], special: 'eddyDuration+4,maxEddies+2' },
    { id: 'phase-veil', name: 'Phase Veil', tier: 3, affinity: 'shroud', coefficients: {}, value: [240, 360], special: 'ghostTrailBeacon,wakeCloakCooldown-15' },
    { id: 'cargo-brace-mk2', name: 'Cargo Brace Mk II', tier: 3, affinity: 'hauler', coefficients: {}, value: [230, 340], special: 'swarmDrainImmunity3' },
    { id: 'tidal-resonator', name: 'Tidal Resonator', tier: 3, affinity: null, coefficients: {}, value: [200, 300], special: 'pulseStandingWave' },
    { id: 'well-skimmer', name: 'Well Skimmer', tier: 3, affinity: null, coefficients: { wellResistScale: 1.35, thrustScale: 0.90 }, value: [210, 320] },
    { id: 'signal-siphon', name: 'Signal Siphon', tier: 3, affinity: null, coefficients: { signalDecayMult: 1.50, signalGenMult: 1.15 }, value: [200, 310] },
    { id: 'precision-pulse', name: 'Precision Pulse', tier: 3, affinity: null, coefficients: { pulseRadiusScale: 0.60, pulseSignalScale: 0.40, pulseCooldownScale: 0.50 }, value: [220, 340] },
    { id: 'drift-engine', name: 'Drift Engine', tier: 3, affinity: 'drifter', coefficients: { currentCoupling: 1.40, thrustScale: 0.75 }, value: [230, 350] },
    { id: 'burn-extender', name: 'Burn Extender', tier: 3, affinity: 'breacher', coefficients: {}, value: [250, 370], special: 'burnFuel+15,burnRecharge×2' },
    { id: 'sensor-array', name: 'Sensor Array', tier: 3, affinity: null, coefficients: { sensorRange: 1.50, signalGenMult: 1.08 }, value: [200, 300] },
  ],
  4: [
    { id: 'gravity-lens', name: 'Gravity Lens', tier: 4, affinity: 'resonant', coefficients: {}, value: [800, 1200], special: 'pulseInvert' },
    { id: 'echo-chamber', name: 'Echo Chamber', tier: 4, affinity: 'shroud', coefficients: {}, value: [900, 1300], special: 'autoDecoys' },
    { id: 'void-anchor', name: 'Void Anchor', tier: 4, affinity: null, coefficients: {}, value: [800, 1100], special: 'recallBeacon' },
    { id: 'singularity-drive', name: 'Singularity Drive', tier: 4, affinity: 'breacher', coefficients: {}, value: [1000, 1500], special: 'burnReverseWells' },
    { id: 'laminar-flow-core', name: 'Laminar Flow Core', tier: 4, affinity: 'drifter', coefficients: {}, value: [900, 1300], special: 'instantFlowLock' },
    { id: 'salvage-titan', name: 'Salvage Titan', tier: 4, affinity: 'hauler', coefficients: { cargoSlots: 3 }, value: [800, 1200], special: 'ghostWreckLoot' },
    { id: 'inhibitor-resonance', name: 'Inhibitor Resonance', tier: 4, affinity: null, coefficients: {}, value: [850, 1200], special: 'universalDampening' },
    { id: 'temporal-displacement', name: 'Temporal Displacement', tier: 4, affinity: null, coefficients: {}, value: [900, 1300], special: 'deathTeleport' },
  ],
};

export const CONSUMABLE_CATALOG = [
  { id: 'shield-cell', name: 'Shield Cell', tier: 1, value: [20, 30], effect: 'shieldBurst' },
  { id: 'signal-purge', name: 'Signal Purge', tier: 1, value: [25, 35], effect: 'signalPurge' },
  { id: 'time-dilator', name: 'Time Dilator', tier: 2, value: [60, 90], effect: 'timeSlowLocal' },
  { id: 'breach-flare', name: 'Breach Flare', tier: 2, value: [80, 120], effect: 'breachFlare' },
  { id: 'signal-flare', name: 'Signal Flare', tier: 1, value: [20, 35], effect: 'signalFlare' },
  { id: 'emergency-thrust', name: 'Emergency Thrust', tier: 2, value: [70, 100], effect: 'emergencyThrust' },
  { id: 'cargo-jettison', name: 'Cargo Jettison', tier: 1, value: [15, 20], effect: 'cargoJettison' },
  { id: 'well-repulsor', name: 'Well Repulsor', tier: 3, value: [200, 280], effect: 'wellRepulsor' },
];

export const LOOT_TIER_GATES = { 1: 0, 2: 30, 3: 120, 4: 240 };
export const LOOT_TIER_WEIGHTS = { 1: 60, 2: 30, 3: 8, 4: 2 };

export function availableTiers(sessionTime) {
  const tiers = [];
  for (const [tier, gateTime] of Object.entries(LOOT_TIER_GATES)) {
    if (sessionTime >= gateTime) tiers.push(Number(tier));
  }
  return tiers;
}

export function rollTier(rng, sessionTime, qualityBias = 1.0) {
  const tiers = availableTiers(sessionTime);
  let totalWeight = 0;
  for (const t of tiers) totalWeight += (LOOT_TIER_WEIGHTS[t] || 0) * (t >= 3 ? qualityBias : 1.0);
  let roll = rng() * totalWeight;
  for (const t of tiers) {
    const w = (LOOT_TIER_WEIGHTS[t] || 0) * (t >= 3 ? qualityBias : 1.0);
    roll -= w;
    if (roll <= 0) return t;
  }
  return tiers[0] || 1;
}

export function rollItem(rng, tier) {
  const pool = ITEM_CATALOG[tier];
  if (!pool || pool.length === 0) return null;
  const item = pool[Math.floor(rng() * pool.length)];
  const baseValue = item.value[0] + rng() * (item.value[1] - item.value[0]);
  return { ...item, value: Math.round(baseValue) };
}

export function rollConsumable(rng, sessionTime) {
  const maxTier = Math.max(...availableTiers(sessionTime));
  const eligible = CONSUMABLE_CATALOG.filter(c => c.tier <= maxTier);
  if (eligible.length === 0) return null;
  const c = eligible[Math.floor(rng() * eligible.length)];
  const baseValue = c.value[0] + rng() * (c.value[1] - c.value[0]);
  return { ...c, value: Math.round(baseValue) };
}

export function generateWreckLoot(rng, sessionTime, slotCount, qualityBias = 1.0) {
  const items = [];
  for (let i = 0; i < slotCount; i++) {
    const tier = rollTier(rng, sessionTime, qualityBias);
    const item = rollItem(rng, tier);
    if (item) items.push(item);
  }
  if (rng() < 0.4) {
    const c = rollConsumable(rng, sessionTime);
    if (c) items.push(c);
  }
  return items;
}

export function pickCosmicSignature(rng) {
  return COSMIC_SIGNATURES[Math.floor(rng() * COSMIC_SIGNATURES.length)];
}
