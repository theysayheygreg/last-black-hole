const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { pathToFileURL } = require('url');

const ROOT = path.resolve(__dirname, '..');

async function run() {
  const { AUDIO_BUSES, AUDIO_PRIORITIES, CUE_SPECS, cueSpec } = await import(
    pathToFileURL(path.join(ROOT, 'src', 'audio', 'cue-spec.js')).href
  );
  assert.deepStrictEqual(AUDIO_BUSES, ['ambient', 'world', 'player', 'ui', 'critical']);
  for (const [id, spec] of Object.entries(CUE_SPECS)) {
    assert.strictEqual(spec.id, id);
    assert(AUDIO_BUSES.includes(spec.bus), `${id} uses a declared bus`);
    assert(AUDIO_PRIORITIES.includes(spec.priority), `${id} uses a declared priority`);
    assert(spec.maxVoices >= 1 && spec.duration > 0 && spec.cooldown >= 0, `${id} has bounded admission`);
  }
  assert.strictEqual(cueSpec('extract').priority, 'critical');
  assert.strictEqual(cueSpec('portalConfirm').motif, 'route-cell');
  assert.strictEqual(cueSpec('loot').motif, 'amber-salvage');
  assert.strictEqual(cueSpec('inhibitorFinalPortal').maxVoices, 5);
  assert.strictEqual(cueSpec('scavDeath').maxVoices, 4);
  assert.strictEqual(cueSpec('upgrade').maxVoices, 4);
  assert.strictEqual(cueSpec('missing'), null);

  const engineSource = fs.readFileSync(path.join(ROOT, 'src', 'audio.js'), 'utf8');
  const routedCues = [...engineSource.matchAll(/case '([^']+)'/g)].map((match) => match[1]).sort();
  assert.deepStrictEqual(routedCues, Object.keys(CUE_SPECS).sort(), 'every declared cue has exactly one engine route');
  for (const deadName of [
    'playAuthoritativeEvent', 'setPortalProximity', '_portalProximityActive', '_wireAndPlay',
    '_playScavengerExtract', '_playWellRumble', '_playCrunch', '_playItemPlink',
  ]) {
    assert(!engineSource.includes(deadName), `${deadName} stays deleted`);
  }
  assert(/case 'portalFinal':\s+this\._playPortalDeath\(/.test(engineSource), 'portalFinal keeps its live terminal cue');
  console.log('AudioCueSpec: 1 passed, 0 failed');
}
run().catch((error) => { console.error(error.stack || error.message); process.exit(1); });
