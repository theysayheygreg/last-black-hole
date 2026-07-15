const assert = require('assert');
const fs = require('fs');
const path = require('path');

function makeRecordingContext() {
  const calls = [];
  const ctx = {
    calls,
    globalAlpha: 1,
    fillStyle: '',
    strokeStyle: '',
    lineWidth: 1,
    font: '',
    textAlign: 'left',
    textBaseline: 'alphabetic',
    save() { calls.push(['save']); },
    restore() { calls.push(['restore']); },
    beginPath() { calls.push(['beginPath']); },
    rect(x, y, w, h) { calls.push(['rect', x, y, w, h]); },
    clip() { calls.push(['clip']); },
    moveTo(x, y) { calls.push(['moveTo', x, y]); },
    lineTo(x, y) { calls.push(['lineTo', x, y]); },
    stroke() { calls.push(['stroke']); },
    strokeRect(x, y, w, h) { calls.push(['strokeRect', x, y, w, h]); },
    fillRect(x, y, w, h) { calls.push(['fillRect', x, y, w, h]); },
    fillText(text, x, y) { calls.push(['fillText', String(text), x, y]); },
    measureText(text) { return { width: String(text).length * 8 }; },
  };
  return ctx;
}

(async () => {
  const {
    advanceMotionClock,
    drawCommandButtonMotion,
    drawDirectionalWipe,
    drawMotionPanel,
    drawTerminalWindow,
    motionProgress,
    resolveMotionSettings,
    sampleFocusShift,
    sampleScreenTransition,
    sampleStaggeredRows,
    sampleTerminalWindow,
    sampleTimeline,
    staggerProgress,
    typeOnText,
    withRevealClip,
  } = await import('../src/ui/motion.js');

  assert.strictEqual(motionProgress(0.1, { delay: 0.2, duration: 1 }), 0);
  assert.strictEqual(advanceMotionClock(0.2, 5), 0.45, 'suspended tabs must not skip UI motion');
  assert.strictEqual(advanceMotionClock(0.2, 5, { maxStep: 1 / 15 }), 0.2 + (1 / 15));
  assert.strictEqual(motionProgress(9, { delay: 0.2, duration: 1 }), 1);
  assert.strictEqual(motionProgress(0, { reducedMotion: true }), 1);
  assert(staggerProgress(0.3, 0, { duration: 1 }) > staggerProgress(0.3, 3, { duration: 1 }));

  const timeline = sampleTimeline(0.25, [
    { name: 'first', duration: 0.2 },
    { name: 'second', duration: 0.2 },
  ]);
  assert.strictEqual(timeline.phase, 'second');
  assert.strictEqual(sampleTimeline(9, [{ name: 'done', duration: 0.2 }]).settled, true);

  assert.strictEqual(typeOnText('launch run', { time: 0, duration: 1 }), '');
  assert.strictEqual(typeOnText('launch run', { time: 9, duration: 1 }), 'launch run');
  assert.strictEqual(typeOnText('launch run', { reducedMotion: true }), 'launch run');

  const reduced = resolveMotionSettings({ enabled: false });
  assert.strictEqual(reduced.enabled, false);
  assert.strictEqual(reduced.reducedMotion, true);
  assert.strictEqual(reduced.intensity, 0);

  const prefersReduced = resolveMotionSettings({}, {
    matchMedia(query) {
      return { matches: query === '(prefers-reduced-motion: reduce)' };
    },
  });
  assert.strictEqual(prefersReduced.enabled, true);
  assert.strictEqual(prefersReduced.reducedMotion, true);
  assert.strictEqual(prefersReduced.maxOcclusion, 0.68);

  const transition = sampleScreenTransition(0.17);
  assert(transition.occlusionAlpha < 1, 'screen transitions must never produce a full-frame flash');
  assert.strictEqual(transition.criticalAlpha, 1, 'critical text remains independently readable');
  assert.deepStrictEqual(
    sampleScreenTransition(0, { reducedMotion: true }),
    sampleScreenTransition(9),
    'reduced motion should resolve to the settled transition state',
  );

  const windowState = sampleTerminalWindow(0.3);
  assert.strictEqual(windowState.rail, 1, 'window rail should finish before content starts');
  assert(windowState.frame > 0, 'window frame should follow its terminal rail');
  assert.strictEqual(windowState.content, 0, 'content must wait for the frame');

  const rows = sampleStaggeredRows(0.2, 3, { duration: 0.3, stagger: 0.08 });
  assert(rows[0].progress > rows[2].progress, 'row state should preserve deterministic stagger order');
  assert(sampleFocusShift(0.08).edgeAlpha > 0, 'focus transfer should have one brief edge accent');

  const panelCtx = makeRecordingContext();
  drawMotionPanel(panelCtx, { x: 10, y: 20, w: 100, h: 40 }, { progress: 0.5, origin: 'right' });
  assert(panelCtx.calls.some((call) => call[0] === 'clip'), 'panel reveal should clip partial panels');
  assert(panelCtx.calls.some((call) => call[0] === 'strokeRect'), 'panel reveal should draw panel chrome');

  const terminalCtx = makeRecordingContext();
  let contentDrawn = false;
  drawTerminalWindow(terminalCtx, { x: 10, y: 20, w: 100, h: 40 }, {
    state: sampleTerminalWindow(9),
    origin: 'bottom-right',
    drawContent() { contentDrawn = true; },
  });
  assert(terminalCtx.calls.some((call) => call[0] === 'lineTo'), 'terminal window should grow rails from its origin node');
  assert(contentDrawn, 'settled terminal window should draw content');

  const fullCtx = makeRecordingContext();
  withRevealClip(fullCtx, { x: 0, y: 0, w: 40, h: 20 }, 1, 'left', () => {
    fullCtx.fillRect(0, 0, 40, 20);
  });
  assert(!fullCtx.calls.some((call) => call[0] === 'clip'), 'full reveal should avoid unnecessary clipping');

  const buttonCtx = makeRecordingContext();
  drawCommandButtonMotion(buttonCtx, { x: 0, y: 0, w: 160, h: 34 }, 'continue', {
    hotkey: 'A',
    progress: 1,
    pulseTime: 0.1,
    active: true,
  });
  assert(buttonCtx.calls.some((call) => call[0] === 'fillText' && call[1].includes('CONTINUE')), 'button label should render');
  assert(buttonCtx.calls.some((call) => call[0] === 'fillText' && call[1] === 'A CONTINUE' && call[3] > 34),
    'button input prompt should render as subheading below the button');
  assert(!buttonCtx.calls.some((call) => call[0] === 'fillText' && call[1] === 'A  CONTINUE'),
    'button label must not fuse input affordance into the main action text');
  assert(buttonCtx.calls.some((call) => call[0] === 'strokeRect'), 'button pulse should draw an edge');

  const mainSource = fs.readFileSync(path.resolve(__dirname, '../src/main.js'), 'utf8');
  const titleVfx = mainSource.slice(
    mainSource.indexOf('function collectTitleVfxEvents'),
    mainSource.indexOf('function drawTitleCorruptionOverlay'),
  );
  assert(titleVfx.includes('if (currentUiMotionSettings().reducedMotion) return [];'),
    'reduced motion must suppress emitted title glyph VFX');
  const titleOverlay = mainSource.slice(
    mainSource.indexOf('function drawTitleScreenOverlay'),
    mainSource.indexOf('function renderShipVelocityReadout'),
  );
  assert(titleOverlay.includes('if (!motion.reducedMotion && titleReveal > 0.2 && glitchState.active > 0.01)'),
    'reduced motion must suppress the canvas title fault overlay');

  const wipeCtx = makeRecordingContext();
  drawDirectionalWipe(wipeCtx, { x: 0, y: 0, w: 400, h: 240 }, { progress: 0.5 });
  assert(wipeCtx.calls.filter((call) => call[0] === 'fillRect').length >= 2, 'directional wipe should draw a band and leading edge');

  await require('./ui-motion-temporal.cjs')();
  console.log('UI motion helpers passed');
})();
