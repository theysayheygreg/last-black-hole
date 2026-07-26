const assert = require('assert');
const path = require('path');
const { pathToFileURL } = require('url');

const ROOT = path.resolve(__dirname, '..');

async function run() {
  const { AUDIO_BUSES, AUDIO_PRIORITIES, CUE_SPECS, cueSpec } = await import(
    pathToFileURL(path.join(ROOT, 'src', 'audio', 'cue-spec.js')).href
  );
  const { SYNTHESIZED_CUES } = await import(
    pathToFileURL(path.join(ROOT, 'src', 'audio', 'cue-synthesis.js')).href
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

  assert.deepStrictEqual([...SYNTHESIZED_CUES].sort(), Object.keys(CUE_SPECS).sort(),
    'every declared cue has exactly one synthesis handler');
  console.log('AudioCueSpec: 1 passed, 0 failed');
}
run().catch((error) => { console.error(error.stack || error.message); process.exit(1); });
