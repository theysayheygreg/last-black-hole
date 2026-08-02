const { TestRunner, assert } = require("./helpers.cjs");
const { createRNGStreams } = require("../scripts/rng-stream.cjs");
const { getSessionProfile, SESSION_PROFILES } = require("../scripts/content/session-profiles.cjs");
const {
  buildCoarseFlowField,
  sampleCoarseFlowField,
} = require("../scripts/coarse-flow-field.cjs");
const { createSeededSea } = require("../scripts/sim/seeded-sea.cjs");
const {
  WAVE_HALF_LIFE_SECONDS,
  advanceWaveRings,
} = require("../scripts/sim/event-wave.cjs");
const { BRAIN_DEFAULTS } = require("../scripts/player-brain.cjs");
const { stepPlayerMovementCore } = require("../scripts/sim/player-movement-step.cjs");

function makePlayer() {
  return {
    wx: 1,
    wy: 1,
    vx: 0,
    vy: 0,
    brain: { ...BRAIN_DEFAULTS },
    deltaV: BRAIN_DEFAULTS.deltaVMax,
    deltaVMax: BRAIN_DEFAULTS.deltaVMax,
    deltaVRegen: BRAIN_DEFAULTS.deltaVRegen,
    deltaVRegenBoost: BRAIN_DEFAULTS.deltaVRegenBoost,
    deltaVBurnEff: BRAIN_DEFAULTS.deltaVBurnEff,
    deltaVBurnRate: BRAIN_DEFAULTS.deltaVBurnRate,
    timeSinceThrust: 0,
  };
}

function stepWithAuthority(flowSample) {
  const player = makePlayer();
  stepPlayerMovementCore(player, { moveX: 0, moveY: 0, thrust: 0, brake: 0 }, 1 / 15, {
    worldScale: 4,
    flowSample,
  });
  return {
    wx: player.wx,
    wy: player.wy,
    vx: player.vx,
    vy: player.vy,
    deltaV: player.deltaV,
  };
}

function advanceFor(ring, dt, count) {
  let rings = [ring];
  for (let index = 0; index < count; index += 1) {
    rings = advanceWaveRings(rings, dt, {
      speed: 0.4,
      maxRadius: 10,
      halfLife: WAVE_HALF_LIFE_SECONDS,
    });
  }
  return rings[0];
}

async function run() {
  const runner = new TestRunner("AuthoritativeField");

  await runner.run("seeded trains enter current under the ambient ceiling", async () => {
    const seededSea = createSeededSea({
      seed: 90210,
      mapId: "field-proof",
      worldScale: 4,
      wells: [{ id: "well-a", wx: 1.5, wy: 1.5, mass: 1, growthRate: 0.01, orbitalDir: 1 }],
      rngStreams: createRNGStreams(90210),
    });
    const field = buildCoarseFlowField({
      worldScale: 4,
      cellSize: 0.2,
      wells: [],
      waveRings: [],
      seededSea,
    });
    const ambientMagnitudes = field.cells.map((cell) => Math.hypot(cell.ambientX, cell.ambientY));
    assert(ambientMagnitudes.some((magnitude) => magnitude > 0), "Expected seeded trains to contribute to field current");
    assert(Math.max(...ambientMagnitudes) <= 2.5 * 0.20 + 1e-9,
      "Seeded ambient must stay at or below the canonical 20% carry cap");
    const sample = sampleCoarseFlowField(field, 1.5, 1.5);
    assert(Math.hypot(sample.current.x, sample.current.y) > 0,
      "Gameplay sample must carry the seeded authoritative current");
  });

  await runner.run("live wave terms decay by seconds, not update count", async () => {
    const ring = {
      id: "wave-proof",
      sourceWX: 1.5,
      sourceWY: 1.5,
      radius: 0,
      amplitude: 1.5,
      alive: true,
    };
    const expectedAmplitude = 1.5 * Math.pow(0.5, 2 / WAVE_HALF_LIFE_SECONDS);
    for (const [dt, count] of [[0.1, 20], [0.25, 8], [0.5, 4]]) {
      const result = advanceFor(ring, dt, count);
      assert(Math.abs(result.amplitude - expectedAmplitude) < 1e-12,
        `Expected dt-correct amplitude for ${dt}s steps, got ${result.amplitude}`);
      assert(Math.abs(result.radius - 0.8) < 1e-12,
        `Expected dt-correct radius for ${dt}s steps, got ${result.radius}`);
    }
  });

  await runner.run("field carries live wave force at one normalized weight", async () => {
    const ring = {
      id: "wave-proof",
      sourceWX: 1.5,
      sourceWY: 1.5,
      radius: 0.4,
      amplitude: 0.8,
      alive: true,
    };
    const field = buildCoarseFlowField({
      worldScale: 3,
      cellSize: 0.2,
      wells: [],
      waveRings: [ring],
      waveShipPush: 0.8,
      waveWidth: 0.1,
    });
    const sample = sampleCoarseFlowField(field, 1.9, 1.5);
    assert(sample.wave.x > 0.01, `Expected live ring force in authoritative field, got ${sample.wave.x}`);
    assert(sample.sources.ringId === ring.id, `Expected live ring source, got ${sample.sources.ringId}`);
  });

  await runner.run("field scale is unified across map profiles", async () => {
    for (const profile of Object.values(SESSION_PROFILES)) {
      assert(profile.fieldFlowScale === 1.0, `Expected unified fieldFlowScale, got ${profile.fieldFlowScale}`);
    }
    assert(getSessionProfile("shallows", 5).fieldFlowScale === getSessionProfile("deep-field", 25).fieldFlowScale,
      "Expected map profiles to expose one normalized field scale");
  });

  await runner.run("movement outcome ignores absent or contradictory presentation flow", async () => {
    const authority = {
      current: { x: 0.4, y: -0.2 },
      wave: { x: 0.1, y: 0.3 },
    };
    const withoutGpu = stepWithAuthority(authority);
    const withContradictoryGpu = stepWithAuthority({
      ...authority,
      gpu: { current: { x: -99, y: 99 }, wave: { x: 99, y: -99 } },
    });
    assert(JSON.stringify(withContradictoryGpu) === JSON.stringify(withoutGpu),
      "Presentation flow must not alter the authority movement outcome");
    assert(Math.abs(withoutGpu.vx) > 0 && Math.abs(withoutGpu.vy) > 0,
      "Movement must consume the authoritative field current");
  });

  const allPassed = runner.summary();
  process.exit(allPassed ? 0 : 1);
}

run().catch((err) => {
  console.error("AuthoritativeField test fatal error:", err.message);
  process.exit(1);
});
