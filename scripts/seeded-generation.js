// seeded-generation.js — Pure deterministic generation functions.
//
// All functions take an RNG stream object and return deterministic
// output. No Math.random(), no time-based randomness.
//
// Both server (scripts/seeded-generation.js) and client
// (src/seeded-generation.js) import this. They MUST stay in sync.
//
// Used for: well variance, sentry counts, scavenger spawns, wreck
// loot, AI hull picks, cosmic signatures, named wrecks.

const { BALANCE } = require("./content/balance.js");
const { SEEDED_SIGNATURES } = require("./content/signatures.js");
const { ITEM_CATALOG, CONSUMABLE_CATALOG } = require("./content/items.js");

const COSMIC_SIGNATURES = SEEDED_SIGNATURES;

const WELL_NAMES = [
  'Charybdis', 'Erebus', 'Tartarus', 'Lethe', 'Acheron',
  'Styx', 'Cocytus', 'Phlegethon', 'Mnemosyne', 'Nyx',
  'Abaddon', 'Sheol', 'Mictlan', 'Niflheim', 'Xibalba',
  'Pandemonium', 'Gehenna', 'Dis', 'Elysium', 'Avalon',
];

// --- Chronicle Fragments ---
// Unreliable first-person voices from dead pilots. Selected seeded per
// chronicle wreck. Lowercase, terse, contradictory across fragments by
// design. Fragments occasionally address "you" — the reader.
// See GHOSTS-V1.md and RETURNAL-REFERENCE.md.
//
// Authoring rules:
// - first person. no proper ending punctuation unless it adds weight
// - contradictions across fragments are a feature, not a bug
// - no tutorial content, no spoilers, no info-dumping
// - the voice should feel like something left behind in a hurry

const CHRONICLE_FRAGMENTS = {
  // Died to a gravity well. The mistake was the edge.
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

  // Died to the inhibitor in any of its forms.
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

  // Ran out of time — collapse took them.
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

  // Swarm form of the inhibitor — drained cargo, corrupted controls.
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

  // Killed by another scavenger / AI player / scavenger swarm
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

  // Generic fallback — catches any unknown death cause
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

function pickChronicleFragment(rngStream, deathCause) {
  const pool = CHRONICLE_FRAGMENTS[deathCause] || CHRONICLE_FRAGMENTS.unknown;
  if (!pool || pool.length === 0) return "";
  return pool[Math.floor(rngStream() * pool.length)];
}

const LOOT_TIER_GATES = BALANCE.loot.tierGates;
const LOOT_TIER_WEIGHTS = BALANCE.loot.tierWeights;

// Wreck wave schedule. Must match what the server consumes from the
// wreckWave + wreckLoot streams so client previews are accurate.
const WRECK_WAVES = [
  { time: 0,   count: [4, 6], slots: [1, 2], dangerZone: 0.5 },
  { time: 45,  count: [3, 5], slots: [2, 3], dangerZone: 0.4 },
  { time: 90,  count: [2, 4], slots: [2, 3], dangerZone: 0.3 },
  { time: 150, count: [2, 3], slots: [2, 4], dangerZone: 0.2 },
  { time: 240, count: [1, 2], slots: [3, 4], dangerZone: 0.15 },
];

function availableTiers(sessionTime) {
  const tiers = [];
  for (const [tier, gateTime] of Object.entries(LOOT_TIER_GATES)) {
    if (sessionTime >= gateTime) tiers.push(Number(tier));
  }
  return tiers;
}

function rollTier(rng, sessionTime, qualityBias = 1.0) {
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

function rollItem(rng, tier) {
  const pool = ITEM_CATALOG[tier];
  if (!pool || pool.length === 0) return null;
  const item = pool[Math.floor(rng() * pool.length)];
  const baseValue = item.value[0] + rng() * (item.value[1] - item.value[0]);
  return {
    ...item,
    value: Math.round(baseValue),
  };
}

function rollConsumable(rng, sessionTime) {
  const maxTier = Math.max(...availableTiers(sessionTime));
  const eligible = CONSUMABLE_CATALOG.filter(c => c.tier <= maxTier);
  if (eligible.length === 0) return null;
  const c = eligible[Math.floor(rng() * eligible.length)];
  const baseValue = c.value[0] + rng() * (c.value[1] - c.value[0]);
  return {
    ...c,
    value: Math.round(baseValue),
  };
}

function generateWreckLoot(rng, sessionTime, slotCount, qualityBias = 1.0) {
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

// --- Cosmic signature picker ---
function pickCosmicSignature(rng) {
  return COSMIC_SIGNATURES[Math.floor(rng() * COSMIC_SIGNATURES.length)];
}

// --- Well variance applied to a clean map ---
function applyWellVariance(rngStreams, wells, wellKillRadiusForMass) {
  for (let i = 0; i < wells.length; i++) {
    const well = wells[i];
    well.mass *= rngStreams.range('wellMass', 0.85, 1.15);
    well.growthRate *= rngStreams.range('wellGrowth', 0.80, 1.20);
    well.orbitalDir = rngStreams.float('wellDir') > 0.5 ? 1 : -1;
    well.name = rngStreams.pick('wellNames', WELL_NAMES);
    if (typeof wellKillRadiusForMass === 'function') {
      well.killRadius = wellKillRadiusForMass(well);
    }
  }
}

const exports_ = {
  COSMIC_SIGNATURES,
  WELL_NAMES,
  CHRONICLE_FRAGMENTS,
  ITEM_CATALOG,
  CONSUMABLE_CATALOG,
  LOOT_TIER_GATES,
  LOOT_TIER_WEIGHTS,
  WRECK_WAVES,
  availableTiers,
  rollTier,
  rollItem,
  rollConsumable,
  generateWreckLoot,
  pickCosmicSignature,
  pickChronicleFragment,
  applyWellVariance,
};

if (typeof module !== 'undefined') {
  module.exports = exports_;
}
