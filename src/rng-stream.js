// rng-stream.js — Client ESM mirror of scripts/rng-stream.js.
//
// MUST STAY IN SYNC with scripts/rng-stream.js. Same algorithm,
// same output for the same seed. If you edit one, edit the other.
//
// This module lets the client compute the same deterministic results
// as the server, enabling client-side prediction for loot, entity
// placement, signatures, etc. without server round-trips.

export function mulberry32(seed) {
  let state = seed | 0;
  return function () {
    state = (state + 0x6D2B79F5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function hashString(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h | 0;
}

export function createRNGStreams(seed) {
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
    float(name) { return getStream(name)(); },
    range(name, min, max) { return min + getStream(name)() * (max - min); },
    int(name, min, max) { return Math.floor(min + getStream(name)() * (max - min + 1)); },
    floatRange(name, min, max) { return min + getStream(name)() * (max - min); },
    pick(name, arr) {
      if (!arr || arr.length === 0) return undefined;
      return arr[Math.floor(getStream(name)() * arr.length)];
    },
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
    chance(name, p) { return getStream(name)() < p; },
    angle(name) { return getStream(name)() * Math.PI * 2; },
    variance(name, amt) { return 1 + (getStream(name)() * 2 - 1) * amt; },
    rawStream(name) { return getStream(name); },
    derive(name, key) {
      const derivedSeed = (masterSeed ^ hashString(name) ^ hashString(String(key))) | 0;
      return mulberry32(derivedSeed);
    },
  };
}
