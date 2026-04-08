// rng-stream.js — Named streams for deterministic generation.
//
// Key idea: each named stream is an independent seeded RNG derived from
// the master seed XOR'd with a hash of the stream name. Adding a new
// random call to one stream doesn't shift the output of other streams,
// so "one new random call breaks every seed" is avoided.
//
// Both server (scripts/rng-stream.js) and client (src/rng-stream.js)
// import this. The two files must stay in sync — same algorithm, same
// output for the same seed. If you edit one, edit the other.
//
// Usage:
//   const rng = createRNGStreams(seed);
//   const mass = rng.range('wells', 0.85, 1.15);
//   const name = rng.pick('names', WELL_NAMES);
//   const tier = rng.chance('rare', 0.1) ? 3 : 1;

function mulberry32(seed) {
  let state = seed | 0;
  return function () {
    state = (state + 0x6D2B79F5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// FNV-1a hash. Deterministic across platforms.
function hashString(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h | 0;
}

function createRNGStreams(seed) {
  const masterSeed = (Number(seed) | 0) || 1;
  const streams = Object.create(null);

  function getStream(name) {
    if (!streams[name]) {
      streams[name] = mulberry32(masterSeed ^ hashString(name));
    }
    return streams[name];
  }

  return {
    seed: masterSeed,

    // Raw stream access — advance the stream and get a [0, 1) float
    float(name) { return getStream(name)(); },

    // min <= x < max
    range(name, min, max) { return min + getStream(name)() * (max - min); },

    // min <= x <= max (inclusive both ends)
    int(name, min, max) { return Math.floor(min + getStream(name)() * (max - min + 1)); },

    // min <= x < max (float, half-open)
    floatRange(name, min, max) { return min + getStream(name)() * (max - min); },

    // Uniform pick from array
    pick(name, arr) {
      if (!arr || arr.length === 0) return undefined;
      return arr[Math.floor(getStream(name)() * arr.length)];
    },

    // Weighted pick: items = [{ value, weight }, ...]
    weightedPick(name, items) {
      if (!items || items.length === 0) return undefined;
      let total = 0;
      for (const item of items) total += item.weight || 0;
      let roll = getStream(name)() * total;
      for (const item of items) {
        roll -= item.weight || 0;
        if (roll <= 0) return item.value;
      }
      return items[items.length - 1].value;
    },

    // chance(p) returns true with probability p
    chance(name, p) { return getStream(name)() < p; },

    // Full-circle angle in radians
    angle(name) { return getStream(name)() * Math.PI * 2; },

    // Centered variance: returns 1 + (rand * 2 - 1) * amt
    // e.g. variance('x', 0.15) gives 0.85 .. 1.15
    variance(name, amt) { return 1 + (getStream(name)() * 2 - 1) * amt; },

    // Direct stream function (for callsites that need the raw rng())
    rawStream(name) { return getStream(name); },

    // Ephemeral sub-stream: derive a new independent RNG from this one + key.
    // Useful for "per-entity" rolls where you want deterministic but
    // order-independent generation keyed by entity id.
    derive(name, key) {
      const derivedSeed = (masterSeed ^ hashString(name) ^ hashString(String(key))) | 0;
      return mulberry32(derivedSeed);
    },
  };
}

module.exports = { createRNGStreams, mulberry32, hashString };
