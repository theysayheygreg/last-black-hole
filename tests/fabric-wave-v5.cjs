const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { TestRunner } = require('./helpers.cjs');
const { createConductedWaveSchedule } = require('../scripts/sim/conductor.cjs');

const ROOT = path.resolve(__dirname, '..');

async function run() {
  const runner = new TestRunner('FabricWaveV5');
  const {
    eventWaveMaterialProfile,
    eventWaveSourceFluidWorld,
    projectEventWavePresentation,
  } = await import(path.join(ROOT, 'src/presentation/well-wave-presentation.js'));
  const { worldYToFluidTextureV } = await import(path.join(ROOT, 'src/coords.js'));
  const { cueForAuthoritativeEvent } = await import(path.join(ROOT, 'src/audio-events.js'));

  await runner.run('ordinary conducted waves project a named telegraph then one active swell', () => {
    const [scheduled] = createConductedWaveSchedule({
      matchDurationSeconds: 600,
      phaseCounts: [1],
      phaseProgresses: [0.15],
      wells: [{ id: 'well-a', wx: 1.2, wy: 0.8 }],
      telegraphSeconds: 1.5,
    });
    const telegraph = projectEventWavePresentation({
      ...scheduled,
      state: 'telegraph',
      radius: 0,
      frontWidth: 0.1,
      amplitude: 1,
      initialAmplitude: 1,
      sourceWX: 1.2,
      sourceWY: 0.8,
      launchTime: scheduled.time,
      telegraphStartTime: scheduled.time - 1.5,
    }, scheduled.time - 0.75);
    assert.strictEqual(telegraph.eventId, scheduled.eventId);
    assert.strictEqual(telegraph.cause, 'conductor');
    assert.strictEqual(telegraph.sourceWellId, 'well-a');
    assert.strictEqual(telegraph.state, 'telegraph');
    assert(telegraph.telegraphProgress > 0 && telegraph.telegraphProgress < 1);

    const active = projectEventWavePresentation({
      ...telegraph,
      state: 'active',
      radius: 0.42,
      launchTime: scheduled.time,
      telegraphStartTime: scheduled.time - 1.5,
    }, scheduled.time + 1);
    assert.strictEqual(active.state, 'active');
    assert.strictEqual(active.radius, 0.42);
    assert.strictEqual(active.frontWidth, 0.1);
    assert(active.sourceWellId === 'well-a' && active.eventId === scheduled.eventId);
  });

  await runner.run('material swell has a thin crest and returns to calm behind it', () => {
    const wave = { radius: 0.8, frontWidth: 0.1, strengthRatio: 1 };
    const front = eventWaveMaterialProfile(wave, 0.8);
    const calm = eventWaveMaterialProfile(wave, 0.0);
    assert(front.swell > 0.9 && front.leadingCrest > 0.9, `front read was ${JSON.stringify(front)}`);
    assert(calm.calmBehind && calm.swell < 0.02, `wave should settle behind the crest: ${JSON.stringify(calm)}`);
  });

  await runner.run('telegraph tightens and brightens the source well', () => {
    const neutral = eventWaveMaterialProfile({ radius: 0.8, frontWidth: 0.1, strengthRatio: 1 }, 0.18);
    const rising = eventWaveMaterialProfile({
      radius: 0.8,
      frontWidth: 0.1,
      strengthRatio: 1,
      telegraphProgress: 1,
    }, 0.18);
    assert(rising.displayDistance > neutral.displayDistance,
      `rising telegraph must tighten toward the core: ${JSON.stringify({ neutral, rising })}`);
    assert(rising.sourceBrightness > neutral.sourceBrightness,
      `rising telegraph must brighten: ${JSON.stringify({ neutral, rising })}`);
    const shader = fs.readFileSync(path.join(ROOT, 'src/render/shaders/fluid.glsl.js'), 'utf8');
    assert(shader.includes('float telegraphScale = 1.0 + telegraph * 0.14;'));
    assert(shader.includes('float displayDist = dist * telegraphScale;'));
  });

  await runner.run('wave sources upload global fluid Y-up coordinates', () => {
    const wave = { sourceWX: 0.41, sourceWY: 0.73 };
    const [sourceX, sourceY] = eventWaveSourceFluidWorld(wave, 3);
    const expectedY = worldYToFluidTextureV(wave.sourceWY / 3) * 3;
    assert.strictEqual(sourceX, wave.sourceWX);
    assert(Math.abs(sourceY - expectedY) < 1e-9, `source Y conversion drifted: ${sourceY} vs ${expectedY}`);
    assert.notStrictEqual(sourceY, wave.sourceWY, 'non-symmetric Y must not reach the shader in world-down form');
    const fluid = fs.readFileSync(path.join(ROOT, 'src/fluid.js'), 'utf8');
    assert(fluid.includes('eventWaveSourceFluidWorld(wave, worldScale)'));
  });

  await runner.run('every source-bound wave announces once before launch', () => {
    const runtime = fs.readFileSync(path.join(ROOT, 'scripts/sim-runtime.cjs'), 'utf8');
    const announcements = runtime.match(/publishEvent\("wave\.announced"/g) || [];
    assert.strictEqual(announcements.length, 1, 'announcement ownership must be centralized');
    const spawnStart = runtime.indexOf('function spawnWaveRing(');
    const spawnEnd = runtime.indexOf('\nfunction tickWells(', spawnStart);
    const spawn = runtime.slice(spawnStart, spawnEnd);
    assert(spawn.includes('runtime.simTime + resolvedPrelaunch'),
      'natural source waves need the bounded canonical prelaunch by default');
    assert(spawn.includes('sourceWX: wx') && spawn.includes('sourceWY: wy') && spawn.includes('cause: ring.cause'));
    const conductedStart = runtime.indexOf('function tickConductedWaves(');
    const conductedEnd = runtime.indexOf('\nfunction maybeCollapseRun(', conductedStart);
    const conducted = runtime.slice(conductedStart, conductedEnd);
    assert(!conducted.includes('publishEvent("wave.announced"'),
      'conducted waves must use the shared announcement path exactly once');
    assert(runtime.includes('cause = "well-growth"'), 'missing independent wave cause well-growth');
    assert(runtime.includes('cause: "consumption"'), 'missing independent wave cause consumption');
    assert(runtime.includes('cause: "vessel-overdrive"'), 'missing independent wave cause vessel-overdrive');
  });

  await runner.run('telegraph audio is one source-bound spatial cue', () => {
    const mapped = cueForAuthoritativeEvent({
      type: 'wave.announced',
      payload: { eventId: 'conductor:wave:phase-1:1', sourceWX: 1.2, sourceWY: 0.8 },
    });
    assert.strictEqual(mapped.cue, 'fabricWaveTelegraph');
    assert.strictEqual(mapped.payload.wx, 1.2);
    assert.strictEqual(mapped.payload.wy, 0.8);
    const cueSpec = fs.readFileSync(path.join(ROOT, 'src/audio/cue-spec.js'), 'utf8');
    const synthesis = fs.readFileSync(path.join(ROOT, 'src/audio/cue-synthesis.js'), 'utf8');
    const main = fs.readFileSync(path.join(ROOT, 'src/main.js'), 'utf8');
    assert(cueSpec.includes('fabricWaveTelegraph') && synthesis.includes('_playFabricWaveTelegraph'));
    assert(main.includes("case 'wave.announced':") && main.includes('payload.cause'),
      'the source cause must be visible before the front reaches the player');
  });

  await runner.run('product wave presentation has no detached ring or anonymous pulse path', () => {
    const shader = fs.readFileSync(path.join(ROOT, 'src/render/shaders/fluid.glsl.js'), 'utf8');
    const waveRings = fs.readFileSync(path.join(ROOT, 'src/wave-rings.js'), 'utf8');
    const renderer = fs.readFileSync(path.join(ROOT, 'src/render-three/world-scene-presentation.js'), 'utf8');
    assert(shader.includes('u_waveCount') && shader.includes('waveSwell') && shader.includes('waveCrest'));
    assert(shader.includes('u_waveTelegraph') && shader.includes('telegraphScale'));
    assert(!waveRings.includes('SPLATS_PER_RING') && !waveRings.includes('visualSplat('));
    assert(!renderer.includes('_addSourceBoundWellWavefront') && !renderer.includes('well-growth-wavefront:'));
  });

  await runner.run('Bench art staging is explicit and cannot claim authority', () => {
    const testApi = fs.readFileSync(path.join(ROOT, 'src/test-api.js'), 'utf8');
    assert(testApi.includes('stageBenchFabricWaveForTest'));
    assert(testApi.includes("cause: 'bench-forced-art-review'"));
    assert(testApi.includes('authority crossing fixture remains the mechanical proof'));
    const seamStart = testApi.indexOf('stageBenchFabricWaveForTest');
    const seamEnd = testApi.indexOf('clearBenchFabricWaveForTest', seamStart);
    const seam = testApi.slice(seamStart, seamEnd);
    assert(!seam.includes('simClient') && !seam.includes('/debug/') && !seam.includes('publishEvent'),
      'Bench staging must remain local presentation only');
  });

  const allPassed = runner.summary();
  process.exit(allPassed ? 0 : 1);
}

run().catch((error) => {
  console.error('FabricWaveV5 fatal error:', error.stack || error.message);
  process.exit(1);
});
