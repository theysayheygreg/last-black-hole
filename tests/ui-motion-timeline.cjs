const assert = require('assert');

function roundedState(state, keys) {
  return Object.fromEntries(keys.map((key) => [
    key,
    typeof state[key] === 'number' ? Number(state[key].toFixed(4)) : state[key],
  ]));
}

(async () => {
  const {
    sampleFocusShift,
    sampleScreenTransition,
    sampleStaggeredRows,
    sampleTerminalWindow,
  } = await import('../src/ui/motion.js');

  const transitionTimes = [0.03, 0.17, 0.28, 1];
  const transitionStages = transitionTimes.map((time) => roundedState(
    sampleScreenTransition(time),
    ['phase', 'outgoingAlpha', 'incomingAlpha', 'occlusionAlpha', 'criticalAlpha', 'settled'],
  ));
  assert.deepStrictEqual(transitionStages, [
    { phase: 'depart', outgoingAlpha: 0.9499, incomingAlpha: 0, occlusionAlpha: 0.0341, criticalAlpha: 1, settled: false },
    { phase: 'handoff', outgoingAlpha: 0, incomingAlpha: 0.1533, occlusionAlpha: 0.68, criticalAlpha: 1, settled: false },
    { phase: 'arrive', outgoingAlpha: 0, incomingAlpha: 0.7884, occlusionAlpha: 0.1755, criticalAlpha: 1, settled: false },
    { phase: 'arrive', outgoingAlpha: 0, incomingAlpha: 1, occlusionAlpha: 0, criticalAlpha: 1, settled: true },
  ]);
  assert(transitionStages.every((stage) => stage.occlusionAlpha < 1));

  const windowTimes = [0.02, 0.12, 0.28, 1];
  const windowStages = windowTimes.map((time) => roundedState(
    sampleTerminalWindow(time),
    ['phase', 'node', 'rail', 'frame', 'content', 'settled'],
  ));
  assert.deepStrictEqual(windowStages, [
    { phase: 'node', node: 0.7806, rail: 0, frame: 0, content: 0, settled: false },
    { phase: 'rail', node: 1, rail: 0.932, frame: 0, content: 0, settled: false },
    { phase: 'frame', node: 1, rail: 1, frame: 0.99, content: 0, settled: false },
    { phase: 'content', node: 1, rail: 1, frame: 1, content: 1, settled: true },
  ]);

  const rowsEarly = sampleStaggeredRows(0.08, 4, { duration: 0.24, stagger: 0.06 });
  const rowsSettled = sampleStaggeredRows(1, 4, { duration: 0.24, stagger: 0.06 });
  assert(rowsEarly[0].alpha > rowsEarly[1].alpha && rowsEarly[1].alpha > rowsEarly[2].alpha);
  assert(rowsSettled.every((row) => row.alpha === 1 && row.offset === 0 && row.settled));

  const focusStages = [0.02, 0.08, 0.14, 1].map((time) => sampleFocusShift(time));
  assert(focusStages[0].edgeAlpha < focusStages[1].edgeAlpha);
  assert(focusStages[2].currentAlpha > focusStages[1].currentAlpha);
  assert.deepStrictEqual(focusStages.at(-1), sampleFocusShift(0, { reducedMotion: true }));

  const reducedWindow = sampleTerminalWindow(0, { reducedMotion: true });
  assert.deepStrictEqual(
    roundedState(reducedWindow, ['node', 'rail', 'frame', 'content', 'settled']),
    { node: 1, rail: 1, frame: 1, content: 1, settled: true },
  );
  assert.deepStrictEqual(
    sampleStaggeredRows(0, 3, { reducedMotion: true }),
    sampleStaggeredRows(9, 3),
    'reduced rows should exactly match settled static rows',
  );

  console.log('UI motion temporal stages passed');
})();
