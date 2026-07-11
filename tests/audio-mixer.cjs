const assert = require('assert');
const path = require('path');
const { pathToFileURL } = require('url');
const ROOT = path.resolve(__dirname, '..');
async function run() {
  const { AudioMixer } = await import(pathToFileURL(path.join(ROOT, 'src/audio/mixer.js')).href);
  const mixer = new AudioMixer({ caps: { ui: 2, world: 6, player: 4, critical: 5, ambient: 6, transient: 16 } });
  assert(mixer.admit('menuMove', 0));
  assert.strictEqual(mixer.admit('menuConfirm', .05), false, 'two-source confirm cannot exceed the UI cap');
  assert(mixer.admit('menuConfirm', .2));
  assert.strictEqual(mixer.admit('menuMove', .21), false, 'UI cap is bounded');
  assert(mixer.admit('extract', .21), 'critical cue remains admitted despite UI saturation');
  const before = mixer.snapshot(.21);
  assert.strictEqual(before.active.ui, 2);
  assert.strictEqual(before.active.critical, 5);
  assert.strictEqual(mixer.snapshot(3).active.critical, 0, 'leases expire');
  assert.strictEqual(before.drops['bus:ui'], 2);
  console.log('AudioMixer: 1 passed, 0 failed');
}
run().catch((error) => { console.error(error.stack || error.message); process.exit(1); });
