const assert = require('assert');
const fs = require('fs');
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
  assert(router.authoritative({ runId: 'run-a', seq: 8, type: 'star.consumed', payload: { wx: .4, wy: .5 } }, ctx));
  assert(router.authoritative({ runId: 'run-a', seq: 9, type: 'scavenger.consumed', payload: { wx: .6, wy: .7 } }, ctx));
  assert(router.portalProximity(true, { portalId: 'p1' }, ctx));
  assert.strictEqual(router.portalProximity(true, { portalId: 'p1' }, ctx), false);
  assert.strictEqual(router.portalProximity(false, { portalId: 'p1' }, ctx), false);
  router.setPhase('gameplay');
  router.reset('run-b');
  assert(router.authoritative({ runId: 'run-b', seq: 4, type: 'player.died', payload: { clientId: 'local' } }, ctx));
  assert.deepStrictEqual(calls.map((call) => call[0]), [
    'reset', 'loot', 'shieldActivate', 'starConsumed', 'scavDeath', 'portalProximity', 'phase', 'reset', 'death',
  ]);

  const bounded = new AudioRouter(engine, { clientId: 'local', now: () => 12, maxSeen: 32 });
  for (let seq = 1; seq <= 40; seq += 1) {
    bounded.authoritative({ runId: 'run-c', seq, type: 'player.loot', payload: { clientId: 'local' } }, ctx);
  }
  assert.strictEqual(bounded.seen.size, 32, 'dedupe history stays bounded within a run');
  assert.strictEqual(bounded.authoritative({ runId: 'run-d', seq: 1, type: 'player.loot', payload: { clientId: 'local' } }, ctx), true);
  assert.strictEqual(bounded.seen.size, 1, 'new authority run clears prior sequence history');
  assert(calls.filter((call) => call[0] === 'reset').length >= 3,
    'new authority runs reset held voices and mixer state, not only dedupe history');
  assert.strictEqual(bounded.authoritative({ runId: 'run-d', seq: 2, type: 'player.died', payload: {} }, ctx), false,
    'ownerless private events fail closed');

  const mainSource = fs.readFileSync(path.join(ROOT, 'src/main.js'), 'utf8');
  const remoteEvents = mainSource.slice(mainSource.indexOf('function applyRemoteEvents'), mainSource.indexOf('function rerollPreviewSeed'));
  assert(!remoteEvents.includes("audioEngine.playEvent('death')"), 'authoritative death audio must not bypass the router');
  assert(!remoteEvents.includes("audioEngine.playEvent('shieldAbsorb')"), 'authoritative shield audio must not bypass the router');
  assert(!remoteEvents.includes("audioEngine.playEvent('starConsumed')"), 'authoritative star audio must not bypass the router');
  assert(!remoteEvents.includes("audioEngine.playEvent('scavDeath')"), 'authoritative scavenger audio must not bypass the router');
  assert(mainSource.includes('audioRouter?.reset(`local:${localSeed}`)'), 'local runs reset router dedupe');
  assert(mainSource.includes('audioRouter?.reset(`remote:${targetMapEntry.id}:${briefingSeed}`)'), 'remote runs reset router dedupe');
  assert(/phase === 'playing'[\s\S]*?gamePhase = 'playing';[\s\S]*?audioRouter\?\.setPhase\('gameplay'\);[\s\S]*?showHUD\(\);/.test(mainSource),
    'authoritative snapshot recovery must restore the gameplay audio phase');
  assert(/phase === 'dead'[\s\S]*?gamePhase = 'dead';[\s\S]*?audioRouter\?\.setPhase\('dead'\);/.test(mainSource),
    'snapshot-only death must leave the gameplay audio phase');
  const remoteSnapshot = mainSource.slice(
    mainSource.indexOf('function applyRemoteSnapshot'),
    mainSource.indexOf('function applyRemoteSlingshotState'),
  );
  assert(/if \(classification\.runChanged\)[\s\S]*?audioRouter\?\.reset\(classification\.incomingRunId\);[\s\S]*?audioRouter\?\.setPhase\('loading'\);/.test(remoteSnapshot),
    'a rematch must reset held presentation audio and enter loading at the new authority-run boundary');
  const pauseRecovery = mainSource.slice(
    mainSource.indexOf('function applyPauseResumeDecision'),
    mainSource.indexOf('function resumeFromPause'),
  );
  assert(/decision\.phase === 'recovery' \|\| decision\.rematched[\s\S]*?gamePhase = 'recovery';[\s\S]*?audioRouter\?\.setPhase\('loading'\);/.test(pauseRecovery),
    'pause recovery must move the audio bed to loading without relying on retired recovery copy');
  const testApiSource = fs.readFileSync(path.join(ROOT, 'src/test-api.js'), 'utf8');
  assert(testApiSource.includes('getAudioDiagnostics()'), 'reviewers need structural audio diagnostics when output is inaudible');
  console.log('AudioRouter: 1 passed, 0 failed');
}
run().catch((error) => { console.error(error.stack || error.message); process.exit(1); });
