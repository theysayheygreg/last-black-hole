#!/usr/bin/env node

const assert = require('assert');
const path = require('path');
const { pathToFileURL } = require('url');

const ROOT = path.resolve(__dirname, '..');

async function run() {
  const hud = await import(pathToFileURL(path.join(ROOT, 'src', 'hud.js')).href);
  const misaligned = hud.getSlingshotInteractionState({
    aim: { type: 'well', tangentialSpeed: 0.02, engageEligible: false },
    engaged: false,
  });
  const misalignedPrompt = hud.getInteractionPresentationState(misaligned, { deck: true });
  assert.strictEqual(misaligned.actionable, false);
  assert.strictEqual(misaligned.detail, 'align with current');
  assert.strictEqual(misalignedPrompt.action, null);
  assert.strictEqual(misalignedPrompt.caption, null, 'Misaligned aim must not expose an actionable glyph');

  const eligible = hud.getSlingshotInteractionState({
    aim: { type: 'well', tangentialSpeed: 0.05, engageEligible: true },
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
