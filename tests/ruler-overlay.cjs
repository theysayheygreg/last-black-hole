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
          radii: { hookMeters: 450, swingMeters: 300 },
          reel: { active: true, entry: { x: 1, y: 0 }, locked: { x: 0.8, y: 0.4 }, bendDegrees: 26.6, configuredMs: 150 },
          flatBoost: { active: true, entry: { x: 1, y: 0 }, exit: { x: 1.2, y: 0.2 }, amount: 0.2 },
          releaseAssist: { degrees: 10 },
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
  const { REQUIRED_RULER_HANDLER_IDS } = await import('../src/ruler-contract.js');
  const { drawRulerOverlay } = await import('../src/ruler-overlay.js');
  const { RULER_SCALE_BAR_METERS } = await import('../src/units.js');

  assert.strictEqual(CONFIG.debug.showRulerOverlay, false, 'overlay must be production-disabled');
  CONFIG.debug.showRulerOverlay = true;

  const initial = drawRulerOverlay(fakeContext(), {
    presentation: presentationFixture(), canvasW: 1200, canvasH: 900, reducedMotion: true,
  });
  assert.strictEqual(initial.handlerCount, 10);
  assert.deepStrictEqual(initial.handlerIds, REQUIRED_RULER_HANDLER_IDS);
  assert.strictEqual(initial.geometry.scaleBarPx, RULER_SCALE_BAR_METERS * 1200 / 3000);
  assert.strictEqual(initial.geometry.captureRadiusPx, 180);
  assert.strictEqual(initial.forceTick, 42);
  assert.strictEqual(initial.reducedMotion, true);

  CONFIG.debug.showRulerOverlay = false;
  console.log('RulerOverlay: 6/6 passed');
})().catch((error) => {
  console.error(error.stack || error.message);
  process.exit(1);
});
