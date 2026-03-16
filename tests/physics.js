/**
 * Physics tests — runs in ~30 seconds.
 * Verifies the sim is behaving: ship moves, drifts, wells pull, waves exist.
 * Requires __TEST_API to be exposed on the game window.
 *
 * Usage: node tests/physics.js [index-a.html|index-b.html|index.html]
 */
const {
  startServer,
  stopServer,
  launchGame,
  screenshot,
  TestRunner,
  assert,
} = require("./helpers");

const htmlFile = process.argv[2] || "index.html";

async function run() {
  console.log(`\n=== PHYSICS TESTS (${htmlFile}) ===\n`);

  const runner = new TestRunner("Physics");
  await startServer();

  let browser, page, errors;

  try {
    ({ browser, page, errors } = await launchGame(htmlFile));

    // Check __TEST_API exists
    const hasAPI = await page.evaluate(() => typeof window.__TEST_API !== "undefined");
    if (!hasAPI) {
      console.log("  SKIP: window.__TEST_API not found. Physics tests require the test API.");
      console.log("        Ensure the prototype exposes __TEST_API per AGENT-TESTING.md.\n");
      runner.summary();
      return;
    }

    // 1. Ship moves on thrust
    await runner.run("Ship moves when thrust is applied", async () => {
      const posBefore = await page.evaluate(() => window.__TEST_API.getShipPos());

      // Simulate thrust by moving mouse to right side of screen and clicking
      await page.mouse.move(900, 360);
      await page.mouse.down();
      await new Promise((r) => setTimeout(r, 1500));
      await page.mouse.up();

      const posAfter = await page.evaluate(() => window.__TEST_API.getShipPos());

      const dx = Math.abs(posAfter.x - posBefore.x);
      const dy = Math.abs(posAfter.y - posBefore.y);
      const moved = dx + dy;

      assert(moved > 5, `Ship barely moved (delta: ${moved.toFixed(1)}px). Expected significant movement on thrust.`);
    });

    // 2. Ship drifts when thrust stops
    await runner.run("Ship drifts when thrust stops (carried by fluid)", async () => {
      // Get current velocity
      await page.mouse.up(); // ensure no thrust

      const posBefore = await page.evaluate(() => window.__TEST_API.getShipPos());
      await new Promise((r) => setTimeout(r, 1500));
      const posAfter = await page.evaluate(() => window.__TEST_API.getShipPos());

      const dx = Math.abs(posAfter.x - posBefore.x);
      const dy = Math.abs(posAfter.y - posBefore.y);
      const drifted = dx + dy;

      assert(drifted > 1, `Ship is stationary without thrust (delta: ${drifted.toFixed(1)}px). Expected fluid drift.`);
    });

    // 3. Well pull exists
    await runner.run("Gravity well pulls ship toward it", async () => {
      // Get well position
      const wells = await page.evaluate(() => window.__TEST_API.getWells());
      assert(wells && wells.length > 0, "No gravity wells found");

      const well = wells[0];

      // Teleport ship near the well (but not inside it)
      const testX = well.x + 150;
      const testY = well.y;
      await page.evaluate(
        (x, y) => window.__TEST_API.teleportShip(x, y),
        testX,
        testY
      );

      await new Promise((r) => setTimeout(r, 2000));

      const posAfter = await page.evaluate(() => window.__TEST_API.getShipPos());
      const distBefore = 150;
      const distAfter = Math.sqrt(
        (posAfter.x - well.x) ** 2 + (posAfter.y - well.y) ** 2
      );

      assert(
        distAfter < distBefore,
        `Ship didn't move toward well (dist before: ${distBefore.toFixed(0)}, after: ${distAfter.toFixed(0)})`
      );
    });

    // 4. Waves exist (fluid velocity oscillates over time)
    await runner.run("Waves exist (fluid velocity oscillates)", async () => {
      // Sample fluid velocity at a fixed point over time
      const wells = await page.evaluate(() => window.__TEST_API.getWells());
      if (!wells || wells.length === 0) {
        throw new Error("No wells to generate waves");
      }

      const well = wells[0];
      // Sample point at moderate distance from well
      const sampleX = well.x + 200;
      const sampleY = well.y;

      const samples = [];
      for (let i = 0; i < 10; i++) {
        const vel = await page.evaluate(
          (x, y) => window.__TEST_API.getFluidVelAt(x, y),
          sampleX,
          sampleY
        );
        if (vel) {
          samples.push(Math.sqrt(vel.x * vel.x + vel.y * vel.y));
        }
        await new Promise((r) => setTimeout(r, 300));
      }

      assert(samples.length >= 5, `Only got ${samples.length} velocity samples`);

      // Check for variation (waves = velocity changes over time)
      const min = Math.min(...samples);
      const max = Math.max(...samples);
      const variation = max - min;

      assert(
        variation > 0.001,
        `Fluid velocity is constant (variation: ${variation.toFixed(6)}). Expected oscillation from wave pulses.`
      );
    });

    // Take a screenshot
    const screenshotPath = await screenshot(page, "physics");
    console.log(`\n  Screenshot: ${screenshotPath}`);
  } finally {
    if (browser) await browser.close();
    stopServer();
  }

  const allPassed = runner.summary();
  process.exit(allPassed ? 0 : 1);
}

run().catch((err) => {
  console.error("Physics test fatal error:", err.message);
  stopServer();
  process.exit(1);
});
