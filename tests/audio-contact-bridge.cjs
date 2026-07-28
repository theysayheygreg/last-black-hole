const assert = require('assert');
const path = require('path');
const { pathToFileURL } = require('url');

const ROOT = path.resolve(__dirname, '..');

async function run() {
  const { AudibleContactAudioBridge } = await import(
    pathToFileURL(path.join(ROOT, 'src/audio/audible-contact-audio-bridge.js')).href,
  );

  const bridge = new AudibleContactAudioBridge({ maxVoices: 2 });
  const plan = bridge.update([
    { id: 'glitch-a', live: true, category: 'GLITCH', rangeMeters: 1500, emittedRadiusMeters: 1600, bearingRadians: -0.8 },
    { id: 'swarm-a', live: true, identity: 'SWARM', category: 'SWARM', rangeMeters: 500, emittedRadiusMeters: 4600, bearingRadians: 0.2 },
    { id: 'exfil-a', live: true, identity: 'EXFIL', category: 'EXFIL TONE', rangeMeters: 700, emittedRadiusMeters: 4200, bearingRadians: 0.7 },
  ], { nowSeconds: 10 });

  assert.deepStrictEqual(plan.active.map((voice) => voice.id), ['exfil-a', 'swarm-a'],
    'the bounded bridge admits EXFIL before Vessel/Swarm and Glitch');
  assert.deepStrictEqual(plan.entered.map((voice) => voice.id), ['exfil-a', 'swarm-a'],
    'admitted contacts enter exactly once rather than producing per-frame one-shots');
  assert.strictEqual(plan.active[0].bearingRadians, 0.7, 'the bridge preserves authoritative canonical bearing');
  assert.strictEqual(plan.active[0].rangeMeters, 700, 'the bridge preserves authoritative canonical range');

  console.log('AudioContactBridge: priority cap 1 passed, 0 failed');
}

run().catch((error) => { console.error(error.stack || error.message); process.exit(1); });
