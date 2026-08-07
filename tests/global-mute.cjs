const { startServer, stopServer, withFreshGame, TestRunner, assert, dispatchKey, waitFor } = require('./helpers.cjs');

async function waitPhase(page, phase) {
  await waitFor(page, (expected) => window.__TEST_API?.getGamePhase?.() === expected, { timeout: 8000 }, phase);
}

(async () => {
  const runner = new TestRunner('GlobalMute');
  await startServer();
  try {
    await runner.run('M toggles the master audio owner without changing menus', async () => {
      await withFreshGame('index-a.html', async ({ page }) => {
        await waitPhase(page, 'title');
        await dispatchKey(page, 'Space', ' ');
        await waitPhase(page, 'profileSelect');
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
        assert(muted.mix?.muted === true, 'M should mute the master owner');
        await dispatchKey(page, 'KeyM', 'm');
        await new Promise((resolve) => setTimeout(resolve, 500));
        const restored = await page.evaluate(() => window.__TEST_API.getAudioDiagnostics().mix);
        assert(restored.masterVolume === before.mix.masterVolume, 'unmute should restore master volume');
        assert(restored.effectsVolume === before.mix.effectsVolume, 'unmute should preserve effects mix');
        assert(restored.uiVolume === before.mix.uiVolume, 'unmute should preserve UI mix');
      }, { resetState: true });
    });
  } finally {
    stopServer();
  }
  process.exit(runner.summary() ? 0 : 1);
})().catch((error) => {
  console.error(error.stack || error.message);
  process.exit(1);
});
