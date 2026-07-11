const assert = require('assert');
const path = require('path');
const { pathToFileURL } = require('url');
const ROOT = path.resolve(__dirname, '..');

async function run() {
  const { AudioRouter } = await import(pathToFileURL(path.join(ROOT, 'src/audio/audio-router.js')).href);
  const calls = [];
  const engine = { reset: () => calls.push(['reset']), setContext: (x) => calls.push(['phase', x]), playEvent: (...x) => { calls.push(x); return true; } };
  const router = new AudioRouter(engine, { clientId: 'local', now: () => 12 });
  router.reset('run-a');
  const ctx = { camX: 0, camY: 0, canvasW: 100, canvasH: 100 };
  assert(router.authoritative({ runId: 'run-a', seq: 4, type: 'player.loot', payload: { clientId: 'local', wx: .2, wy: .3 } }, ctx));
  assert.strictEqual(router.authoritative({ runId: 'run-a', seq: 4, type: 'player.loot', payload: { clientId: 'local' } }, ctx), false);
  assert.strictEqual(router.authoritative({ runId: 'run-a', seq: 5, type: 'player.loot', payload: { clientId: 'remote' } }, ctx), false);
  assert(router.authoritative({ runId: 'run-a', seq: 6, type: 'player.effectUsed', payload: { clientId: 'local', effectId: 'shieldBurst' } }, ctx));
  assert.strictEqual(router.authoritative({ runId: 'run-a', seq: 7, type: 'player.effectUsed', payload: { clientId: 'remote', effectId: 'shieldBurst' } }, ctx), false);
  assert(router.portalProximity(true, { portalId: 'p1' }, ctx));
  assert.strictEqual(router.portalProximity(true, { portalId: 'p1' }, ctx), false);
  assert.strictEqual(router.portalProximity(false, { portalId: 'p1' }, ctx), false);
  router.setPhase('gameplay');
  router.reset('run-b');
  assert(router.authoritative({ runId: 'run-b', seq: 4, type: 'player.died', payload: { clientId: 'local' } }, ctx));
  assert.deepStrictEqual(calls.map((call) => call[0]), ['reset', 'loot', 'shieldActivate', 'portalProximity', 'phase', 'reset', 'death']);
  console.log('AudioRouter: 1 passed, 0 failed');
}
run().catch((error) => { console.error(error.stack || error.message); process.exit(1); });
