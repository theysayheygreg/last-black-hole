#!/usr/bin/env node

const assert = require('assert');

function fakeContext() {
  const calls = [];
  return {
    calls,
    globalAlpha: 1,
    save() {}, restore() {}, beginPath() {}, moveTo() {}, lineTo() {},
    stroke() {}, fill() {}, fillRect() {}, strokeRect() {}, ellipse() {}, arc() {},
    measureText(text) { return { width: String(text).length * 6 }; },
    fillText(text) { calls.push(String(text)); },
  };
}

async function run() {
  const hud = await import('../src/ui/hud-presentation.js');
  const results = await import('../src/run-results.js');
  const ruler = await import('../src/ruler-overlay.js');
  const { CONFIG } = await import('../src/config.js');

  const portalSystem = {
    activeCount: 1,
    portals: [{ id: 'exfil-1', type: 'extraction', alive: true, wx: 1.7, wy: 0.5 }],
  };
  const ship = { wx: 0.5, wy: 0.5 };

  const listening = hud.getRouteObjectiveState(ship, portalSystem, null, false, { exfilHeard: false });
  assert.strictEqual(listening.label, 'ROUTE: LISTEN');
  assert(!listening.label.includes('m') && !listening.detail.includes('m'), 'unheard route must not reveal distance');

  const discovered = hud.getRouteObjectiveState(ship, portalSystem, null, false, { exfilHeard: true });
  assert.strictEqual(discovered.label, 'aperture 1.2km');
  assert(discovered.detail.includes('enter cyan aperture'));

  assert.strictEqual(hud.formatNoiseDetail({ currentSource: 'IDLE' }), 'QUIET');
  assert.strictEqual(hud.formatNoiseDetail({ currentSource: 'THRUST', heardListenerCount: 2 }), 'SOURCE THRUST · HEARD BY 2');
  assert(!hud.formatNoiseDetail({ currentSource: 'IDLE' }).includes('TRACKED BY 0'));

  const view = results.buildRunResultsViewModel({
    phase: 'escaped',
    runResult: {
      outcome: 'extracted',
      noiseTimeHeardSeconds: 12.4,
      noiseTimeTrackedSeconds: 3.6,
      noiseMaxMeters: 420,
      noiseSource: 'THRUST',
      cargoExtracted: [],
    },
  });
  assert.strictEqual(view.noiseTimeHeardSeconds, 12.4);
  assert.strictEqual(view.noiseTimeTrackedSeconds, 3.6);
  assert.strictEqual(view.noiseTimeSummary, '12s heard · 4s tracked');

  CONFIG.debug.showRulerOverlay = true;
  const context = fakeContext();
  ruler.drawRulerOverlay(context, {
    presentation: {
      camera: { x: 0, y: 0 },
      world: {
        wells: [],
        stars: [],
        planetoids: [],
      },
      localPlayer: {
        world: { x: 0.5, y: 0.5 },
        ruler: {
          source: 'authority',
          slingshot: {
            captureRadius: { well: 450, star: 300, planetoid: 180 },
            magnetism: { active: false, entry: { x: 0, y: 0 }, locked: { x: 0, y: 0 }, bendDegrees: 0 },
            coyoteTime: { implemented: true, durationMs: 50, remainingMs: 0, effectiveDurationMs: 316.666, transportAllowanceMs: 266.666 },
            payoffCurve: { active: false, entry: { x: 0, y: 0 }, exit: { x: 0, y: 0 }, ratio: 0 },
            chainWindow: { active: false, durationSeconds: 0.5, remainingSeconds: 0 },
          },
        },
        forceLedger: { tick: 1, vectors: {} },
      },
      runClock: { elapsedSeconds: 0, durationSeconds: 480 },
    },
    canvasW: 1200,
    canvasH: 800,
    reducedMotion: true,
  });
  assert(context.calls.some((text) => text.includes('0 / 50 ms + 267 ms transport')),
    'ruler must expose canonical coyote and fixed transport allowance separately');
  CONFIG.debug.showRulerOverlay = false;

  console.log('OrreryRouteTeaching: 5/5 passed');
}

run().catch((error) => {
  console.error(error.stack || error.message);
  process.exit(1);
});
