const assert = require("assert");
const {
  advanceSeededSea,
  createSeededSea,
  hashSeededSea,
  serializeSeededSea,
  SEEDED_SEA_STREAMS,
} = require("../scripts/sim/seeded-sea.cjs");
const { createRNGStreams } = require("../scripts/rng-stream.cjs");

const N_TICKS = 24;
const DT = 1 / 15;
const WELLS = [
  { id: "well-b", wx: 2.1, wy: 0.9, mass: 0.8, orbitalDir: -1 },
  { id: "well-a", wx: 1.0, wy: 1.2, mass: 1.5, orbitalDir: 1 },
  { id: "well-c", wx: 1.95, wy: 2.16, mass: 1.2, orbitalDir: 1 },
];

function run(seed) {
  let sea = createSeededSea({
    seed,
    mapId: "shallows",
    worldScale: 3,
    wells: WELLS,
    rngStreams: createRNGStreams(seed),
  });
  for (let tick = 0; tick < N_TICKS; tick += 1) {
    sea = advanceSeededSea(sea, DT);
  }
  return { sea, hash: hashSeededSea(sea) };
}

const first = run(424242);
const second = run(424242);
const different = run(424243);

assert.deepStrictEqual(first.sea, second.sea, "same seed must produce the same N-tick sea state");
assert.strictEqual(first.hash, second.hash, "same seed must produce the same N-tick state hash");
assert.notStrictEqual(first.hash, different.hash, "different seeds must diverge in N-tick state hash");
assert(SEEDED_SEA_STREAMS.layout && SEEDED_SEA_STREAMS.motion && SEEDED_SEA_STREAMS.phase,
  "seeded sea must declare named RNG streams");
assert.strictEqual(
  serializeSeededSea({ b: 2, a: 1 }),
  serializeSeededSea({ a: 1, b: 2 }),
  "seeded sea serialization must be key-order stable"
);

console.log(`SeededSea: same-seed N=${N_TICKS} hash ${first.hash}`);
console.log(`SeededSea: different-seed N=${N_TICKS} hash ${different.hash}`);
console.log(`SeededSea: streams ${Object.values(SEEDED_SEA_STREAMS).join(", ")}`);
console.log("SeededSea: 4 passed, 0 failed");
