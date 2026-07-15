const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { pathToFileURL } = require('url');

const ROOT = path.resolve(__dirname, '..');

async function run() {
  const { movementAudioLevels, resolveMovementAudioState } = await import(
    pathToFileURL(path.join(ROOT, 'src/audio/movement-state.js')).href,
  );
  const { AudioRouter } = await import(
    pathToFileURL(path.join(ROOT, 'src/audio/audio-router.js')).href,
  );

  assert.strictEqual(resolveMovementAudioState({ thrust: 1, speed: 0.2 }), 'coasting',
    'input intent alone must not sound like delivered thrust');
  assert.strictEqual(resolveMovementAudioState({ deliveredThrust: 0.7, speed: 0.2 }), 'thrusting');
  assert.strictEqual(resolveMovementAudioState({ deliveredBrake: 0.8, deliveredThrust: 0.7, speed: 0.2 }), 'braking',
    'braking wins when both delivered actions are present');
  assert.strictEqual(resolveMovementAudioState({ deliveredThrust: 0, deliveredBrake: 0, speed: 0.2 }), 'coasting');
  assert.strictEqual(resolveMovementAudioState({ deliveredThrust: 0.08, speed: 0.2 }, 'thrusting'), 'thrusting',
    'thrust stays engaged through the exit threshold');
  assert.strictEqual(resolveMovementAudioState({ deliveredThrust: 0.04, speed: 0.2 }, 'thrusting'), 'coasting',
    'thrust releases below the hysteresis threshold');
  assert.strictEqual(resolveMovementAudioState({ active: false, deliveredThrust: 1, speed: 0.2 }, 'thrusting'), 'idle');

  const thrustLevels = movementAudioLevels({ deliveredThrust: 1 }, 'thrusting');
  const coastLevels = movementAudioLevels({ speed: 0.2 }, 'coasting');
  const brakeLevels = movementAudioLevels({ deliveredBrake: 1 }, 'braking');
  assert(thrustLevels.gain > coastLevels.gain && brakeLevels.gain > coastLevels.gain,
    'coast must remain a quieter layer than active movement');
  assert(thrustLevels.frequency > brakeLevels.frequency,
    'thrust and braking must have distinct tonal centers');

  const calls = [];
  const router = new AudioRouter({
    updateMovementState: (state) => { calls.push(state); return true; },
  });
  assert(router.movementState({ deliveredThrust: 0.6, active: true }));
  assert.strictEqual(calls.length, 1);
  assert.strictEqual(calls[0].deliveredThrust, 0.6);

  const source = fs.readFileSync(path.join(ROOT, 'src/audio.js'), 'utf8');
  assert(source.includes('this._initMovementVoice();'), 'movement voice must initialize once with the engine');
  assert(source.includes('noise.loop = true;'), 'movement texture must use one bounded loop');
  assert(source.includes('this._setMovementVoice'), 'movement voice must be state-ramped, not recreated per update');
  assert(!source.includes("case 'thrustOn'"), 'dead one-shot thrust cue must be removed');
  assert(!source.includes('_playThrustOn'), 'dead one-shot thrust helper must be removed');

  console.log('AudioMovement: 10 passed, 0 failed');
}

run().catch((error) => {
  console.error(error.stack || error.message);
  process.exit(1);
});
