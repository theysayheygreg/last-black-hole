#!/usr/bin/env node

const assert = require('assert');
const path = require('path');
const { pathToFileURL } = require('url');

const ROOT = path.resolve(__dirname, '..');

async function run() {
  const hud = await import(pathToFileURL(path.join(ROOT, 'src', 'ui', 'hud-presentation.js')).href);
  const facade = await import(pathToFileURL(path.join(ROOT, 'src', 'hud.js')).href);
  assert.strictEqual(facade.getSlingshotInteractionState, hud.getSlingshotInteractionState,
    'HUD facade must preserve getSlingshotInteractionState');
  const stationary = hud.getSlingshotInteractionState({
    aim: { type: 'well', speed: 0, engageEligible: false },
    engaged: false,
  });
  const stationaryPrompt = hud.getInteractionPresentationState(stationary, { deck: true });
  assert.strictEqual(stationary.actionable, false);
  assert.strictEqual(stationary.detail, 'start moving to grapple');
  assert.strictEqual(stationaryPrompt.action, null);
  assert.strictEqual(stationaryPrompt.caption, null, 'Stationary aim must not expose an actionable glyph');

  const eligible = hud.getSlingshotInteractionState({
    aim: { type: 'well', speed: 0.01, engageEligible: true },
    engaged: false,
  });
  const eligiblePrompt = hud.getInteractionPresentationState(eligible, { deck: true });
  assert.strictEqual(eligible.action, 'slingshot');
  assert(eligiblePrompt.caption.includes('Y'), 'Eligible aim must expose the Deck Y engage glyph');

  console.log('SlingshotHud: 2/2 passed');
}

run().catch((error) => {
  console.error(error.stack || error.message);
  process.exit(1);
});
