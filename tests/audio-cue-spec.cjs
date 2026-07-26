const assert = require('assert');
const fs = require('fs');
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
  const engineSource = fs.readFileSync(path.join(ROOT, 'src', 'audio.js'), 'utf8');
  const synthesisSource = fs.readFileSync(path.join(ROOT, 'src', 'audio', 'cue-synthesis.js'), 'utf8');
  const audioSource = engineSource + synthesisSource;
  const playEventSource = engineSource.slice(engineSource.indexOf('  playEvent('), engineSource.indexOf('  // ---- Init helpers'));
  let priorStep = -1;
  for (const step of [
    '!this.initiated || !CONFIG.audio.enabled', 'cueSpec(type)', '_eventBudget.admit',
    '_mixer.admit', '_eventBudget.release', '_trace.mark', 'clearPortalReady',
    'worldToScreen', '_cueSynthesis.play',
  ]) {
    const stepIndex = playEventSource.indexOf(step);
    assert(stepIndex > priorStep, `${step} preserves cue admission order`);
    priorStep = stepIndex;
  }
  for (const deadName of [
    'playAuthoritativeEvent', 'setPortalProximity', '_portalProximityActive', '_wireAndPlay',
    '_playScavengerExtract', '_playWellRumble', '_playCrunch', '_playItemPlink',
  ]) {
    assert(!audioSource.includes(deadName), `${deadName} stays deleted`);
  }
  assert(/portalFinal:.*_playPortalDeath\(/.test(synthesisSource), 'portalFinal keeps its live terminal cue');
  console.log('AudioCueSpec: 1 passed, 0 failed');
}
run().catch((error) => { console.error(error.stack || error.message); process.exit(1); });
