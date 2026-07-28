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

  const dedupeBridge = new AudibleContactAudioBridge({ maxVoices: 2 });
  const deduped = dedupeBridge.update([
    { id: 'duplicate', live: true, category: 'EXFIL TONE', rangeMeters: 700, emittedRadiusMeters: 4200 },
    { id: 'duplicate', live: true, category: 'GLITCH', rangeMeters: 1, emittedRadiusMeters: 1600 },
    { id: 'glitch-b', live: true, category: 'GLITCH', rangeMeters: 2, emittedRadiusMeters: 1600 },
  ]);
  assert.deepStrictEqual(deduped.active.map((voice) => voice.id), ['duplicate', 'glitch-b'],
    'duplicate contact ids are removed before the voice cap');

  const identityBridge = new AudibleContactAudioBridge({ maxVoices: 2 });
  const trustedClasses = identityBridge.update([
    { id: 'category-allowlist', live: true, identity: 'UNTRUSTED', category: 'SWARM', rangeMeters: 1, emittedRadiusMeters: 4600 },
    { id: 'identity-reject', live: true, identity: 'ADMIN', category: 'NOISE', rangeMeters: 1, emittedRadiusMeters: 4600 },
    { id: 'canonical-category', live: true, category: 'GLITCH', rangeMeters: 2, emittedRadiusMeters: 1600 },
  ]);
  assert.deepStrictEqual(trustedClasses.active.map((voice) => voice.id), ['category-allowlist', 'canonical-category'],
    'untrusted identities cannot become audio classes while canonical categories remain audible');
  assert.strictEqual(trustedClasses.active[0].category, 'SWARM');

  const staleBridge = new AudibleContactAudioBridge({ maxVoices: 1 });
  staleBridge.update([{ id: 'stale', live: true, category: 'SWARM', rangeMeters: 10, emittedRadiusMeters: 4600 }]);
  const stale = staleBridge.update([{ id: 'stale', live: false, category: 'SWARM' }]);
  assert.strictEqual(stale.active.length, 0, 'stale live:false contacts stay suppressed');
  assert.strictEqual(stale.expired[0].id, 'stale', 'stale contact exits the held voice lifecycle');

  console.log('AudioContactBridge: priority cap, dedupe, class allowlist, and stale suppression checks passed');
}

run().catch((error) => { console.error(error.stack || error.message); process.exit(1); });
