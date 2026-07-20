export function hashSeed(value = 'lbh') {
  let hash = 2166136261;
  for (const character of String(value)) {
    hash ^= character.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

export function seededUnit(seed, index = 0) {
  let value = (hashSeed(seed) + Math.imul(index + 1, 0x9e3779b9)) >>> 0;
  value ^= value << 13;
  value ^= value >>> 17;
  value ^= value << 5;
  return (value >>> 0) / 4294967296;
}

export function traceEventId(runSeed, cue, sequence = 0) {
  return `${runSeed || 'local'}:${cue}:${sequence}`;
}
