const assert = require('assert');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const catalog = require('../scripts/content/items.cjs');
const { normalizeProfileSnapshot } = require('../scripts/control-plane-store.cjs');

function source(file) {
  return fs.readFileSync(path.join(ROOT, file), 'utf8');
}

function run() {
  assert(!catalog.CONSUMABLE_EFFECT_IDS.includes('timeSlowLocal'),
    'retired effect must not be a live consumable effect');
  for (const id of ['time-dilator', 'dead-air-ampoule']) {
    assert(!catalog.CONSUMABLE_CATALOG.some((item) => item.id === id), `${id} remains in the live catalog`);
  }

  const retired = { catalogId: 'time-dilator', useEffect: 'timeSlowLocal', charges: 1 };
  const live = { catalogId: 'shield-cell', useEffect: 'shieldBurst', charges: 1 };
  assert.deepStrictEqual(catalog.sanitizeRetiredItems([retired, live, null]), [null, live, null],
    'legacy retired loadout items must migrate to empty slots');
  const normalized = normalizeProfileSnapshot({
    vault: [retired],
    loadout: { equipped: [retired], consumables: [retired, live] },
  }, 'retirement-fixture');
  assert.deepStrictEqual(normalized.vault, [], 'durable retired vault items must be removed on load');
  assert.deepStrictEqual(normalized.loadout.equipped, [null, null], 'retired equipped items must not remain reachable');
  assert.deepStrictEqual(normalized.loadout.consumables, [null, live], 'retired consumables must clear their slots on load');

  for (const file of [
    'scripts/sim-runtime.cjs',
    'src/main.js',
    'src/audio.js',
    'src/audio/audio-router.js',
    'src/audio/cue-spec.js',
  ]) {
    const text = source(file);
    assert(!text.includes('timeSlowRemaining'), `${file} retains retired runtime state`);
    assert(!text.includes('timeSlowScale'), `${file} retains retired time scale config`);
    assert(!text.includes('timeSlowDuration'), `${file} retains retired duration config`);
    assert(!text.includes('timeSlowLocal'), `${file} retains retired effect routing`);
    assert(!text.includes('player.effectExpired'), `${file} retains retired expiry event routing`);
  }

  const manifest = JSON.parse(source('assets/visual/manifest.json'));
  assert(!manifest.items['time-dilator'] && !manifest.items['dead-air-ampoule'],
    'retired consumables remain visually reachable');
  console.log('TimeSlowRetirement: 5 passed, 0 failed');
}

try {
  run();
} catch (error) {
  console.error(error.stack || error.message);
  process.exit(1);
}
