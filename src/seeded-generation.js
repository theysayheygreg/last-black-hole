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

// --- Chronicle Fragments ---
// Unreliable first-person voices from dead pilots. Must stay in sync
// with scripts/seeded-generation.js. See GHOSTS-V1.md for authoring rules.

export const CHRONICLE_FRAGMENTS = {
  well: [
    "the drifter told me the current was safe. it was not.",
    "wasn't looking at it.",
    "the pull was louder than i was.",
    "i thought i could surf the edge of it.",
    "never fight the river. i forgot i knew that.",
    "it had a name. charybdis. that should have been enough.",
    "the well was smaller a minute ago.",
    "i hesitated.",
    "three cycles ago i did this exact thing and lived. i remember.",
    "it's not the pull. it's the patience.",
    "the event horizon was not where the map said it was.",
    "i kept watching the timer. i should have been watching the current.",
  ],
  vessel: [
    "i heard it before i saw it.",
    "the figures in the distance were not distant.",
    "there is something in the void that does not want us here.",
    "i did not hear the inhibitor. i felt it first.",
    "it was not a shape. it was a decision.",
    "the signal was me. i was loud.",
    "i thought if i stayed quiet it would forget.",
    "it was never going to forget.",
    "the vessel had my callsign on it. i checked twice.",
    "it does not chase. it arrives.",
    "when the inhibitor looks at you it does not use eyes.",
    "the dampening field worked until it didn't.",
  ],
  collapse: [
    "the universe ran out before i did.",
    "i was still looking for another portal.",
    "there is no such thing as a safe pace.",
    "i was going to leave. i always was.",
    "the clock was the universe all along. the universe was the clock.",
    "i think the wells are breathing slower now.",
    "last cycle i made it.",
    "if you find this, you had more time than i did.",
    "one more wreck. just one. that was the whole mistake.",
    "the final portal was ten seconds away. ten.",
    "collapse does not hurt. it just stops including you.",
    "i measured everything except how much i would hesitate.",
  ],
  swarm: [
    "they drained everything. even the name of the thing i was holding.",
    "i dropped it so i could run. then i dropped the other one.",
    "the hauler i saw at 03:11 — was that you?",
    "every swarm is the same swarm.",
    "i didn't hear them arrive.",
    "there is no silence loud enough.",
    "i thought i could outrun them. i could not outrun them.",
    "the swarm is what the void remembers.",
    "my controls went heavy. then i went heavy.",
    "they do not take what you carry. they take what you were going to become.",
    "the debuff purge worked. but it only works once.",
    "i kept my cargo and lost the cycle. fair trade. not a good one.",
  ],
  scavenger: [
    "someone beat me to it.",
    "i was not the only one watching the wreck.",
    "the scavengers are us from another cycle. i think.",
    "they don't talk to me anymore.",
    "i recognized the callsign. i should not have.",
    "the vulture had my old paint on it.",
    "i got greedy.",
    "i think they were warning me.",
    "there is a moment when a wreck is anyone's. that moment was not mine.",
    "the drifter had already been dead a long time when i met her.",
    "raiders do not talk because the signal would give them away. this was smart.",
    "the ai players are better than me. they know where i will be before i do.",
  ],
  unknown: [
    "i do not remember how this ended.",
    "there was a moment. then there was not.",
    "this was the cycle where i almost understood.",
    "if you are reading this you found me. congratulations. i think.",
    "i was not paying attention.",
    "the last thing i heard was not a sound.",
    "nothing killed me. i just stopped.",
    "the void is patient. i was not.",
  ],
};

export function pickChronicleFragment(rngStream, deathCause) {
  const pool = CHRONICLE_FRAGMENTS[deathCause] || CHRONICLE_FRAGMENTS.unknown;
  if (!pool || pool.length === 0) return "";
  return pool[Math.floor(rngStream() * pool.length)];
}

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

// Wreck wave schedule. Must match what the server consumes from the
// wreckWave + wreckLoot streams so client previews are accurate.
export const WRECK_WAVES = [
  { time: 0,   count: [4, 6], slots: [1, 2], dangerZone: 0.5 },
  { time: 45,  count: [3, 5], slots: [2, 3], dangerZone: 0.4 },
  { time: 90,  count: [2, 4], slots: [2, 3], dangerZone: 0.3 },
  { time: 150, count: [2, 3], slots: [2, 4], dangerZone: 0.2 },
  { time: 240, count: [1, 2], slots: [3, 4], dangerZone: 0.15 },
];

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
