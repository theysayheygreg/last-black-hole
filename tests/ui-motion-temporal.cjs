const assert = require('assert');

async function runTemporalMotionTests() {
  const {
    sampleFocusShift,
    sampleScreenTransition,
    sampleStaggeredRows,
    sampleTerminalWindow,
    sampleTimeline,
  } = await import('../src/ui/motion.js');

  const phases = [
    { name: 'boot', duration: 0.1 },
    { name: 'scan', duration: 0.2 },
    { name: 'ready', duration: 0.1 },
  ];
  const early = sampleTimeline(0.05, phases);
  const middle = sampleTimeline(0.2, phases);
  const late = sampleTimeline(0.35, phases);
  const settled = sampleTimeline(0.5, phases);
  assert.strictEqual(early.phase, 'boot');
  assert.strictEqual(middle.phase, 'scan');
  assert.strictEqual(late.phase, 'ready');
  assert.strictEqual(settled.settled, true);
  assert(early.progress < middle.progress && middle.progress < late.progress && late.progress < settled.progress);
  assert.deepStrictEqual(sampleTimeline(0.2, phases), middle, 'timeline sampling must be deterministic');
  assert.strictEqual(sampleTimeline(0.2, phases, { delay: 0.25 }).progress, 0, 'delayed timelines stay at their initial state');

  const transitionTimes = [0.04, 0.15, 0.25, 0.5];
  const transitions = transitionTimes.map((time) => sampleScreenTransition(time, {
    duration: 0.34,
    maxOcclusion: 0.68,
  }));
  assert.deepStrictEqual(transitions.map((state) => state.phase), ['depart', 'handoff', 'arrive', 'arrive']);
  assert.deepStrictEqual(transitions.map((state) => state.settled), [false, false, false, true]);
  for (const state of transitions) {
    assert(state.occlusionAlpha <= 0.68, 'transition occlusion must stay under its configured safety cap');
    assert.strictEqual(state.criticalAlpha, 1, 'critical copy must remain fully readable through every phase');
  }
  assert(transitions[0].outgoingAlpha > transitions[1].outgoingAlpha, 'depart should release the outgoing screen');
  assert(transitions[2].incomingAlpha > transitions[1].incomingAlpha, 'arrive should reveal the incoming screen');
  assert.deepStrictEqual(
    sampleScreenTransition(0, { duration: 0.34, reducedMotion: true }),
    sampleScreenTransition(0.5, { duration: 0.34 }),
    'reduced motion must match the settled transition state',
  );

  const windowTimes = [0.02, 0.1, 0.23, 0.35, 0.5];
  const windows = windowTimes.map((time) => sampleTerminalWindow(time, { duration: 0.4 }));
  assert.deepStrictEqual(windows.map((state) => state.phase), ['node', 'rail', 'frame', 'content', 'content']);
  assert.deepStrictEqual(windows.map((state) => state.settled), [false, false, false, false, true]);
  assert.strictEqual(windows[0].rail, 0, 'terminal node appears before rail growth');
  assert.strictEqual(windows[1].frame, 0, 'frame waits until the rail is complete');
  assert.strictEqual(windows[2].content, 0, 'content waits until the frame is complete');
  assert(windows[3].content > 0 && windows[3].content < 1, 'late window state reveals content over a bounded interval');
  assert.deepStrictEqual(
    sampleTerminalWindow(0, { duration: 0.4, reducedMotion: true }),
    windows[4],
    'reduced motion must match settled terminal window geometry and content',
  );

  const rowEarly = sampleStaggeredRows(0.08, 4, { duration: 0.2, stagger: 0.05 });
  const rowLate = sampleStaggeredRows(1, 4, { duration: 0.2, stagger: 0.05 });
  assert(rowEarly[0].progress > rowEarly[1].progress && rowEarly[1].progress >= rowEarly[2].progress);
  assert(rowLate.every((row) => row.progress === 1 && row.offset === 0 && row.settled));
  assert.deepStrictEqual(
    sampleStaggeredRows(0, 4, { duration: 0.2, stagger: 0.05, reducedMotion: true }),
    rowLate,
    'reduced motion must preserve the settled row layout',
  );

  const focusEarly = sampleFocusShift(0.02, { duration: 0.16 });
  const focusMiddle = sampleFocusShift(0.08, { duration: 0.16 });
  const focusSettled = sampleFocusShift(0.2, { duration: 0.16 });
  assert(focusEarly.currentAlpha < focusMiddle.currentAlpha, 'focus transfer should strengthen the new target');
  assert(focusMiddle.edgeAlpha > focusEarly.edgeAlpha, 'focus accent should peak briefly near the middle');
  assert.strictEqual(focusSettled.edgeAlpha, 0, 'focus accent must not become a repeating loop');
  assert.deepStrictEqual(
    sampleFocusShift(0, { duration: 0.16, reducedMotion: true }),
    focusSettled,
    'reduced motion must match the settled focus state',
  );
}

module.exports = runTemporalMotionTests;

if (require.main === module) {
  runTemporalMotionTests()
    .then(() => console.log('UI motion temporal stages passed'))
    .catch((error) => {
      console.error(error);
      process.exitCode = 1;
    });
}
