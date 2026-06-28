const assert = require('assert');

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
    drawCommandButtonMotion,
    drawDirectionalWipe,
    drawMotionPanel,
    motionProgress,
    resolveMotionSettings,
    staggerProgress,
    typeOnText,
    withRevealClip,
  } = await import('../src/ui/motion.js');

  assert.strictEqual(motionProgress(0.1, { delay: 0.2, duration: 1 }), 0);
  assert.strictEqual(motionProgress(9, { delay: 0.2, duration: 1 }), 1);
  assert.strictEqual(motionProgress(0, { reducedMotion: true }), 1);
  assert(staggerProgress(0.3, 0, { duration: 1 }) > staggerProgress(0.3, 3, { duration: 1 }));

  assert.strictEqual(typeOnText('launch run', { time: 0, duration: 1 }), '');
  assert.strictEqual(typeOnText('launch run', { time: 9, duration: 1 }), 'launch run');
  assert.strictEqual(typeOnText('launch run', { reducedMotion: true }), 'launch run');

  const reduced = resolveMotionSettings({ enabled: false });
  assert.strictEqual(reduced.reducedMotion, true);
  assert.strictEqual(reduced.intensity, 0);

  const panelCtx = makeRecordingContext();
  drawMotionPanel(panelCtx, { x: 10, y: 20, w: 100, h: 40 }, { progress: 0.5, origin: 'right' });
  assert(panelCtx.calls.some((call) => call[0] === 'clip'), 'panel reveal should clip partial panels');
  assert(panelCtx.calls.some((call) => call[0] === 'strokeRect'), 'panel reveal should draw panel chrome');

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
  assert(buttonCtx.calls.some((call) => call[0] === 'strokeRect'), 'button pulse should draw an edge');

  const wipeCtx = makeRecordingContext();
  drawDirectionalWipe(wipeCtx, { x: 0, y: 0, w: 400, h: 240 }, { progress: 0.5 });
  assert(wipeCtx.calls.filter((call) => call[0] === 'fillRect').length >= 2, 'directional wipe should draw a band and leading edge');

  console.log('UI motion helpers passed');
})();
