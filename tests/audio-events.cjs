const assert = require('assert');
const path = require('path');
const { pathToFileURL } = require('url');

const ROOT = path.resolve(__dirname, '..');

async function run() {
  const {
    cueForAuthoritativeEvent,
    EventVoiceBudget,
  } = await import(pathToFileURL(path.join(ROOT, 'src', 'audio-events.js')).href);

  const local = { clientId: 'pilot-local' };
  const cue = (type, payload = {}) => cueForAuthoritativeEvent({ type, payload }, local)?.cue || null;

  assert.strictEqual(cue('player.loot', { clientId: 'pilot-local' }), 'loot');
  assert.strictEqual(cue('player.loot', { clientId: 'pilot-remote' }), null);
  assert.strictEqual(cue('player.loot', {}), null, 'ownerless private events fail closed when a local identity exists');
  assert.strictEqual(cue('player.slingshotEngaged', { clientId: 'pilot-local' }), 'slingshotEngage');
  assert.strictEqual(cue('player.slingshotReleased', { clientId: 'pilot-local' }), 'slingshotRelease');
  assert.strictEqual(cue('player.portalProximity', { clientId: 'pilot-local', entered: true }), 'portalProximity');
  assert.strictEqual(cue('player.portalProximity', { clientId: 'pilot-local', entered: false }), null);
  assert.strictEqual(cue('player.portalConfirmed', { clientId: 'pilot-local' }), 'portalConfirm');
  assert.strictEqual(cue('player.escaped', { clientId: 'pilot-local' }), 'extract');
  assert.strictEqual(cue('player.scavengerBumped', { clientId: 'pilot-local' }), 'scavengerBump');
  assert.strictEqual(cue('inhibitor.glitchSpawned', { kind: 'glitch' }), 'inhibitorGlitch');
  assert.strictEqual(cue('inhibitor.swarmSpawned', { kind: 'swarm' }), 'inhibitorWake');
  assert.strictEqual(cue('inhibitor.wake', { phase: 2 }), 'inhibitorWake');
  assert.strictEqual(cue('inhibitor.vesselInbound', { kind: 'vessel' }), 'inhibitorVessel');

  const budget = new EventVoiceBudget(16);
  assert.strictEqual(budget.admit('loot', 0), true);
  assert.strictEqual(budget.admit('slingshotEngage', 0), true);
  assert.strictEqual(budget.admit('slingshotRelease', 0), true);
  assert.strictEqual(budget.admit('scavengerBump', 0), true);
  assert.strictEqual(budget.admit('inhibitorGlitch', 0), true);
  assert.strictEqual(budget.activeVoices(0), 11);
  assert.strictEqual(budget.admit('portalProximity', 0), false, 'regular cues must preserve the critical reserve');
  assert.strictEqual(budget.admit('extract', 0), true, 'critical extraction must fit in the reserved voices');
  assert.strictEqual(budget.activeVoices(0), 16);
  assert.strictEqual(budget.admit('inhibitorVessel', 0), false, 'budget must never exceed its voice cap');
  assert.strictEqual(budget.activeVoices(0), 16);
  assert.strictEqual(budget.activeVoices(3), 0, 'leases must expire after their cue duration');

  const cooldown = new EventVoiceBudget(16);
  assert.strictEqual(cooldown.admit('portalProximity', 5), true);
  assert.strictEqual(cooldown.admit('portalProximity', 5.2), false);
  assert.strictEqual(cooldown.admit('portalProximity', 5.8), true);

  const rollback = new EventVoiceBudget(16);
  assert.strictEqual(rollback.admit('menuMove', 10), true);
  assert.strictEqual(rollback.release('menuMove', 10), true);
  assert.strictEqual(rollback.activeVoices(10), 0);
  assert.strictEqual(rollback.admit('menuMove', 10), true, 'rolled-back admission must not retain cooldown state');

  console.log('AudioEvents: 2 passed, 0 failed');
}

run().catch((error) => {
  console.error(error.stack || error.message);
  process.exit(1);
});
