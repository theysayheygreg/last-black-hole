const assert = require('assert');

function fakeContext() {
  return {
    globalAlpha: 1,
    save() {}, restore() {}, beginPath() {}, moveTo() {}, lineTo() {},
    stroke() {}, fill() {}, fillRect() {}, strokeRect() {}, fillText() {},
    ellipse() {}, arc() {},
    measureText(text) { return { width: String(text).length * 6 }; },
  };
}

function presentationFixture() {
  const zero = { x: 0, y: 0, magnitude: 0 };
  return {
    camera: { x: 0, y: 0 },
    world: {
      wells: [{ world: { x: 0.2, y: 0.2 } }],
      stars: [{ world: { x: 0.6, y: 0.4 } }],
      planetoids: [{ world: { x: 0.8, y: 0.7 } }],
    },
    localPlayer: {
      world: { x: 0.5, y: 0.5 },
      ruler: {
        source: 'authority',
        slingshot: {
          captureRadius: { well: 450, star: 300, planetoid: 180 },
          magnetism: { active: true, entry: { x: 1, y: 0 }, locked: { x: 0.8, y: 0.4 }, bendDegrees: 26.6 },
          coyoteTime: { implemented: true, durationMs: 150, remainingMs: 75 },
          payoffCurve: { active: true, entry: { x: 1, y: 0 }, exit: { x: 1.2, y: 0.2 }, ratio: 1.22 },
          chainWindow: { active: true, durationSeconds: 1.5, remainingSeconds: 0.75 },
        },
      },
      forceLedger: {
        tick: 42,
        vectors: {
          thrust: { x: 100, y: 0, magnitude: 100 },
          coupling: { ...zero }, gravity: { ...zero }, wave: { ...zero },
          impulse: { ...zero }, drag: { ...zero },
        },
      },
    },
  };
}

(async () => {
  const { CONFIG } = await import('../src/config.js');
  const { snapControlValue } = await import('../src/dev-panel.js');
  const { REQUIRED_RULER_HANDLER_IDS } = await import('../src/ruler-contract.js');
  const { drawRulerOverlay } = await import('../src/ruler-overlay.js');

  assert.strictEqual(CONFIG.debug.showRulerOverlay, false, 'overlay must be production-disabled');
  CONFIG.debug.showRulerOverlay = true;
  CONFIG.debug.ruler.captureRadiusPreview_m = 0;

  const initial = drawRulerOverlay(fakeContext(), {
    presentation: presentationFixture(), canvasW: 1200, canvasH: 900, reducedMotion: true,
  });
  assert.strictEqual(initial.handlerCount, 11);
  assert.deepStrictEqual(initial.handlerIds, REQUIRED_RULER_HANDLER_IDS);
  assert.strictEqual(initial.geometry.scaleBarPx, 40);
  assert.strictEqual(initial.geometry.captureRadiusPx, 180);
  assert.strictEqual(initial.forceTick, 42);
  assert.strictEqual(initial.reducedMotion, true);

  CONFIG.debug.ruler.captureRadiusPreview_m = snapControlValue(
    'debug.ruler.captureRadiusPreview_m', 463,
  );
  const sameFrame = drawRulerOverlay(fakeContext(), {
    presentation: presentationFixture(), canvasW: 1200, canvasH: 900,
  });
  assert.strictEqual(CONFIG.debug.ruler.captureRadiusPreview_m, 475);
  assert.strictEqual(sameFrame.geometry.captureRadiusPx, 190);

  CONFIG.debug.showRulerOverlay = false;
  CONFIG.debug.ruler.captureRadiusPreview_m = 0;
  console.log('RulerOverlay: 8/8 passed');
})().catch((error) => {
  console.error(error.stack || error.message);
  process.exit(1);
});
