const assert = require('assert');
const path = require('path');
const { pathToFileURL } = require('url');

(async () => {
  const ui = await import(pathToFileURL(path.resolve(__dirname, '../src/bench/ui.js')).href);
  const good = { gallery: { seed: 42 }, patch: { liveApplied: [], bankedRestart: [] } };

  let state = ui.reduceBenchUiActionState(null, { type: 'success', value: good });
  assert.strictEqual(state.lastGood, good);
  assert.strictEqual(state.error, null);

  state = ui.reduceBenchUiActionState(state, {
    type: 'failure',
    error: new Error('  authority\n rejected   malformed patch  '),
  });
  assert.strictEqual(state.lastGood, good, 'a failed action must preserve the last good authority state');
  assert.strictEqual(state.error, 'authority rejected malformed patch');

  state = ui.reduceBenchUiActionState(state, { type: 'success' });
  assert.strictEqual(state.lastGood, good);
  assert.strictEqual(state.error, null, 'a successful action must clear the visible error');

  const authorityTruth = { world: { wells: [{ id: 'well-1' }] } };
  const localSnapshot = { world: { wells: [] } };
  assert.strictEqual(
    ui.resolveBenchReplayTruth({ authorityTruth }, localSnapshot),
    authorityTruth,
    'authority-provided truth must win over the client snapshot callback',
  );
  assert.strictEqual(ui.resolveBenchReplayTruth({}, localSnapshot), localSnapshot);
  assert.deepStrictEqual(ui.resolveBenchReplayTruth({}, null), {});

  const longError = ui.formatBenchUiError('x'.repeat(220));
  assert.strictEqual(longError.length, 160, 'visible errors stay concise');
  assert.throws(
    () => ui.reduceBenchUiActionState(state, { type: 'mystery' }),
    /Unknown Bench UI action state transition/,
  );

  const outcomes = [];
  const failedResult = await ui.runBenchUiAction(
    async () => { throw new Error('fetch failed'); },
    (outcome) => outcomes.push(outcome),
  );
  assert.strictEqual(failedResult, undefined, 'action failures are captured rather than rejected');
  assert.strictEqual(outcomes[0].type, 'failure');
  assert.match(outcomes[0].error.message, /fetch failed/);
  const successfulResult = await ui.runBenchUiAction(
    async () => 'ok',
    (outcome) => outcomes.push(outcome),
  );
  assert.strictEqual(successfulResult, 'ok');
  assert.strictEqual(outcomes[1].type, 'success');

  console.log('Bench UI state: captured errors, recovery, and authority-truth replay proof passed');
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
