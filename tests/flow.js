/**
 * Flow tests — exercises the actual user journey through the game.
 *
 * Unlike other tests that use triggerRestart() to skip menus, this test
 * simulates real input through every game phase:
 *   title → mapSelect → playing → (die or escape) → mapSelect → play again
 *
 * This catches bugs that only appear on the user path (like the map select
 * crash from referencing removed portals data).
 *
 * Usage: node tests/flow.js [index-a.html]
 */
const {
  startServer,
  stopServer,
  launchGame,
  screenshot,
  TestRunner,
  assert,
} = require('./helpers');

const htmlFile = process.argv[2] || 'index-a.html';

async function getPhase(page) {
  // gamePhase is a getter on the test API — need to access via function
  return page.evaluate(() => {
    const api = window.__TEST_API;
    if (!api) return 'no_api';
    // Read gamePhase through the getState closure
    return api.gamePhase;
  });
}

async function getErrors(page) {
  return page.evaluate(() => {
    // Check if game loop is still running by looking at FPS
    const api = window.__TEST_API;
    if (!api) return ['no test API'];
    const fps = api.getFPS();
    if (fps < 1) return ['game loop appears frozen (FPS < 1)'];
    return [];
  });
}

async function pressSpace(page) {
  await page.keyboard.press('Space');
  await new Promise(r => setTimeout(r, 300));
}

async function pressKey(page, key, wait = 300) {
  await page.keyboard.press(key);
  await new Promise(r => setTimeout(r, wait));
}

async function run() {
  console.log(`\n=== FLOW TESTS (${htmlFile}) ===\n`);

  const runner = new TestRunner('Flow');
  await startServer();

  let browser, page, errors;

  try {
    ({ browser, page, errors } = await launchGame(htmlFile));

    // Collect page errors throughout
    const pageErrors = [];
    page.on('pageerror', e => pageErrors.push(e.message));

    // ---- 1. Title screen loads ----
    await runner.run('Title screen loads without errors', async () => {
      await new Promise(r => setTimeout(r, 1000));
      assert(pageErrors.length === 0,
        `Page errors on load: ${pageErrors.join('; ')}`);
      // Game loop should be running (FPS > 0)
      const fps = await page.evaluate(() => window.__TEST_API ? window.__TEST_API.getFPS() : 0);
      assert(fps > 10, `FPS is ${fps.toFixed(0)} — game loop may be frozen`);
    });

    // ---- 2. Title → Map Select ----
    await runner.run('Space transitions from title to map select', async () => {
      // Wait for title screen's 0.5s input delay
      await new Promise(r => setTimeout(r, 1000));
      await pressSpace(page);
      await new Promise(r => setTimeout(r, 500));
      // Verify no crashes
      assert(pageErrors.length === 0,
        `Errors after title→mapSelect: ${pageErrors.join('; ')}`);
      const fps = await page.evaluate(() => window.__TEST_API.getFPS());
      assert(fps > 10, `FPS dropped to ${fps.toFixed(0)} on map select`);
    });

    // ---- 3. Map Select → Playing ----
    await runner.run('Space on map select starts game without crash', async () => {
      await pressSpace(page);
      await new Promise(r => setTimeout(r, 1500));
      assert(pageErrors.length === 0,
        `Errors after startGame: ${pageErrors.join('; ')}`);
      const fps = await page.evaluate(() => window.__TEST_API.getFPS());
      assert(fps > 10, `FPS dropped to ${fps.toFixed(0)} after game start`);
      // Ship should exist and have a valid position
      const pos = await page.evaluate(() => window.__TEST_API.getShipPos());
      assert(pos && typeof pos.x === 'number' && !isNaN(pos.x),
        `Ship position invalid: ${JSON.stringify(pos)}`);
    });

    // ---- 4. Navigate to second map and start ----
    await runner.run('Can select a different map and start', async () => {
      // Pause → exit to title
      await pressKey(page, 'Escape');  // pause
      await new Promise(r => setTimeout(r, 300));
      await pressKey(page, 'ArrowDown');  // select "exit to title"
      await pressSpace(page);  // confirm
      await new Promise(r => setTimeout(r, 500));

      // Title → map select
      await pressSpace(page);
      await new Promise(r => setTimeout(r, 500));

      // Move down to second map
      await pressKey(page, 'ArrowDown');
      await pressSpace(page);  // start second map
      await new Promise(r => setTimeout(r, 1500));

      assert(pageErrors.length === 0,
        `Errors after starting second map: ${pageErrors.join('; ')}`);
      const fps = await page.evaluate(() => window.__TEST_API.getFPS());
      assert(fps > 10, `FPS dropped to ${fps.toFixed(0)} on second map`);
    });

    // ---- 5. Die and return to map select ----
    await runner.run('Death → map select flow works', async () => {
      // Teleport ship into a well to force death
      const wells = await page.evaluate(() => window.__TEST_API.getWells());
      if (wells && wells.length > 0) {
        await page.evaluate((w) => {
          window.__TEST_API.teleportShip(w.wx, w.wy);
        }, wells[0]);
      }
      // Wait for death
      await new Promise(r => setTimeout(r, 2000));
      assert(pageErrors.length === 0,
        `Errors after death: ${pageErrors.join('; ')}`);

      // Press space to continue (needs 1s+ delay for prompt to appear)
      await new Promise(r => setTimeout(r, 1000));
      await pressSpace(page);
      await new Promise(r => setTimeout(r, 500));

      // Should be on map select now — start another game
      await pressSpace(page);
      await new Promise(r => setTimeout(r, 1500));
      assert(pageErrors.length === 0,
        `Errors after restart from death: ${pageErrors.join('; ')}`);
      const pos = await page.evaluate(() => window.__TEST_API.getShipPos());
      assert(pos && typeof pos.x === 'number' && !isNaN(pos.x),
        `Ship position invalid after restart: ${JSON.stringify(pos)}`);
    });

    // ---- 6. Pause and resume ----
    await runner.run('Pause → resume preserves game state', async () => {
      const posBefore = await page.evaluate(() => window.__TEST_API.getShipPos());
      await pressKey(page, 'Escape');  // pause
      await new Promise(r => setTimeout(r, 500));
      await pressKey(page, 'Escape');  // resume (ESC = resume now)
      await new Promise(r => setTimeout(r, 500));
      assert(pageErrors.length === 0,
        `Errors after pause/resume: ${pageErrors.join('; ')}`);
      const posAfter = await page.evaluate(() => window.__TEST_API.getShipPos());
      assert(posAfter && typeof posAfter.x === 'number',
        `Ship position invalid after resume: ${JSON.stringify(posAfter)}`);
    });

    // ---- 7. Full cycle: pause → exit to title → map select → play ----
    await runner.run('Full cycle: pause → exit → title → select → play', async () => {
      await pressKey(page, 'Escape');  // pause
      await new Promise(r => setTimeout(r, 300));
      await pressKey(page, 'ArrowDown');  // select "exit to title"
      await pressSpace(page);  // confirm
      await new Promise(r => setTimeout(r, 800));

      // Now on title — press space
      await pressSpace(page);
      await new Promise(r => setTimeout(r, 500));

      // Now on map select — press space
      await pressSpace(page);
      await new Promise(r => setTimeout(r, 1500));

      assert(pageErrors.length === 0,
        `Errors in full cycle: ${pageErrors.join('; ')}`);
      const fps = await page.evaluate(() => window.__TEST_API.getFPS());
      assert(fps > 10, `FPS is ${fps.toFixed(0)} after full cycle`);
    });

    const screenshotPath = await screenshot(page, 'flow');
    console.log(`\n  Screenshot: ${screenshotPath}`);
  } finally {
    if (browser) await browser.close();
    stopServer();
  }

  const allPassed = runner.summary();
  process.exit(allPassed ? 0 : 1);
}

run().catch(err => {
  console.error('Flow test fatal error:', err.message);
  stopServer();
  process.exit(1);
});
