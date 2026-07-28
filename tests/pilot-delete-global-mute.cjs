const {
  startServer,
  stopServer,
  withFreshGame,
  TestRunner,
  assert,
  dispatchKey,
  waitFor,
} = require('./helpers.cjs');

async function waitPhase(page, phase) {
  await waitFor(page, (expected) => window.__TEST_API?.getGamePhase?.() === expected, { timeout: 8000 }, phase);
}

async function enterProfileSelect(page) {
  await waitPhase(page, 'title');
  await dispatchKey(page, 'Space', ' ');
  await waitPhase(page, 'profileSelect');
}

async function profileNames(page) {
  return page.evaluate(() => window.__TEST_API.getProfileSlots().map((profile) => profile?.name || null));
}

(async () => {
  const runner = new TestRunner('PilotDeleteGlobalMute');
  await startServer();
  try {
    await runner.run('Pilot Select cancel, confirm, and final-pilot flow', async () => {
      await withFreshGame('index-a.html', async ({ page }) => {
        await enterProfileSelect(page);
        await page.evaluate(() => {
          window.__TEST_API.createTestProfileSlot(0, 'Alpha');
          window.__TEST_API.createTestProfileSlot(1, 'Beta');
          window.__TEST_API.setActiveProfileSlotForTest(0);
          window.__TEST_API.setProfileCursorForTest(0);
        });

        await dispatchKey(page, 'KeyX', 'x');
        const opened = await page.evaluate(() => window.__TEST_API.getUiMotionState().profileDelete);
        assert(opened.slot === 0 && opened.choice === 'cancel', 'delete dialog must open on CANCEL');

        await dispatchKey(page, 'Space', ' ');
        const cancelled = await page.evaluate(() => ({
          modal: window.__TEST_API.getUiMotionState().profileDelete,
          slots: window.__TEST_API.getProfileSlots().map((profile) => profile?.name || null),
        }));
        assert(cancelled.modal?.slot === -1, 'cancel should close the delete dialog');
        assert(cancelled.slots[0] === 'Alpha', 'cancel must leave the selected pilot intact');

        await dispatchKey(page, 'KeyX', 'x');
        await dispatchKey(page, 'ArrowRight', 'ArrowRight');
        const armed = await page.evaluate(() => window.__TEST_API.getUiMotionState().profileDelete.choice);
        assert(armed === 'delete', 'DELETE must require an explicit choice');
        await dispatchKey(page, 'Space', ' ');
        const afterDelete = await page.evaluate(() => ({
          cursor: window.__TEST_API.getProfileCursorForTest?.(),
          slots: window.__TEST_API.getProfileSlots().map((profile) => profile?.name || null),
        }));
        assert(afterDelete.slots[0] === null && afterDelete.slots[1] === 'Beta', 'confirm should remove only the selected pilot');
        assert(afterDelete.cursor === undefined || afterDelete.cursor === 1, 'remaining pilot should become the deterministic selection');

        await dispatchKey(page, 'KeyX', 'x');
        await dispatchKey(page, 'ArrowRight', 'ArrowRight');
        await dispatchKey(page, 'Space', ' ');
        const finalDelete = await page.evaluate(() => ({
          phase: window.__TEST_API.getGamePhase(),
          profileDelete: window.__TEST_API.getUiMotionState().profileDelete,
          names: window.__TEST_API.getProfileSlots().map((profile) => profile?.name || null),
          prompt: window.__TEST_API.getUiMotionState().profilePrompt,
        }));
        assert(finalDelete.phase === 'profileSelect', 'final deletion should remain in Pilot Select');
        assert(finalDelete.profileDelete?.slot === -1, 'final deletion should close the confirmation');
        assert(finalDelete.names.every((name) => name === null), 'final deletion should remove the last saved pilot');
        assert(/confirm/.test(finalDelete.prompt || ''), 'final deletion should open the existing create-pilot flow');
      }, { resetState: true });
    });

    await runner.run('M toggles the master audio owner and has no menu collision', async () => {
      await withFreshGame('index-a.html', async ({ page }) => {
        await enterProfileSelect(page);
        const before = await page.evaluate(() => ({
          phase: window.__TEST_API.getGamePhase(),
          mix: window.__TEST_API.getAudioDiagnostics().mix,
        }));
        await dispatchKey(page, 'KeyM', 'm');
        await new Promise((resolve) => setTimeout(resolve, 500));
        const muted = await page.evaluate(() => ({
          phase: window.__TEST_API.getGamePhase(),
          mix: window.__TEST_API.getAudioDiagnostics().mix,
        }));
        assert(muted.phase === before.phase, 'mute must not change the current menu');
        assert(muted.mix?.muted === true, `M should mute the master owner (got ${JSON.stringify(muted.mix)})`);
        await dispatchKey(page, 'KeyM', 'm');
        await new Promise((resolve) => setTimeout(resolve, 500));
        const restored = await page.evaluate(() => window.__TEST_API.getAudioDiagnostics().mix);
        assert(restored.masterVolume === before.mix.masterVolume, 'unmute should restore master volume');
        assert(restored.effectsVolume === before.mix.effectsVolume, 'unmute should preserve effects mix');
        assert(restored.uiVolume === before.mix.uiVolume, 'unmute should preserve UI mix');
      }, { resetState: true });
    });
  } finally {
    try { await stopServer(); } catch {}
  }
  process.exit(runner.summary() ? 0 : 1);
})().catch((error) => {
  console.error(error.stack || error.message);
  process.exit(1);
});
