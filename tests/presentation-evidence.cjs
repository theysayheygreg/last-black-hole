#!/usr/bin/env node

const assert = require('assert');
const path = require('path');
const { pathToFileURL } = require('url');
const { recordJourneyStage } = require('./agent-play-report.cjs');

async function run() {
  const hud = await import(pathToFileURL(path.join(__dirname, '..', 'src', 'ui', 'hud-presentation.js')).href);
  const layout = await import(pathToFileURL(path.join(__dirname, '..', 'src', 'ui', 'presentation-layout.js')).href);

  const optional = hud.getRouteObjectiveState(
    { wx: 0.5, wy: 0.5 },
    { activeCount: 2, portals: [{ type: 'extraction', alive: true, wx: 0.8, wy: 0.5 }] },
    null,
    false,
    { exfilHeard: false, portalInteraction: { portalId: 'optional-1', portalType: 'standard', ready: true } },
  );
  assert.strictEqual(optional.label, 'OPTIONAL APERTURE');
  assert.strictEqual(optional.detail, 'ROUTE: LISTEN');

  assert.strictEqual(layout.safeObjectLabel(undefined, 'STAR 1'), 'STAR 1');
  assert.strictEqual(layout.safeObjectLabel('undefined', 'PLANETOID 1'), 'PLANETOID 1');
  assert.strictEqual(layout.safeObjectLabel('Lumen', 'STAR 1'), 'Lumen');
  const shipSlots = layout.getShipLocalLabelSlots({ shipX: 640, shipY: 400, canvasW: 1280, canvasH: 800 });
  assert(shipSlots.heat.bounds.y > shipSlots.velocity.bounds.y + shipSlots.velocity.bounds.h);
  const labels = layout.placePresentationLabels([
    { id: 'near-star', order: 20, anchorX: 640, anchorY: 430, width: 120, height: 18 },
    { id: 'near-planet', order: 30, anchorX: 640, anchorY: 430, width: 120, height: 18 },
  ], { canvasW: 1280, canvasH: 800, obstacles: [shipSlots.velocity.bounds, shipSlots.heat.bounds] });
  assert.strictEqual(labels.placed.length, 2);
  assert(!layout.rectsOverlap(labels.placed[0].bounds, labels.placed[1].bounds, 5));

  const terminal = hud.getTerminalPresentationState('dead');
  assert.strictEqual(terminal.interaction, null);
  assert.strictEqual(terminal.abilities.inert, true);
  const inert = hud.getAbilityPresentationState({ hullType: 'breacher', terminal: true, burnFuel: 20 });
  assert.strictEqual(inert.slots[0].inert, true);
  assert.strictEqual(inert.slots[0].tone, 'inert');
  assert.strictEqual(inert.slots[0].action, null);

  assert.strictEqual(hud.formatNoiseDetail({ currentSource: 'NOISE', heardListenerCount: 3 }), 'HEARD BY 3');
  assert(!hud.formatNoiseDetail({ currentSource: 'NOISE' }).includes('NOISE · NOISE'));

  const report = { journey: {} };
  recordJourneyStage(report, { briefing: { mapName: 'The Shallows' }, firstRun: { runId: 'run-1' } });
  recordJourneyStage(report, { slingshot: { anchorType: 'well' } });
  assert.deepStrictEqual(report.journey.briefing, { mapName: 'The Shallows' });
  assert.deepStrictEqual(report.journey.firstRun, { runId: 'run-1' });
  assert.deepStrictEqual(report.journey.slingshot, { anchorType: 'well' });

  console.log('PresentationEvidence: 5/5 passed');
}

run().catch((error) => {
  console.error(error.stack || error.message);
  process.exit(1);
});
