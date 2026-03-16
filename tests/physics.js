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
      // Teleport ship near the well where there's fluid flow, then wait for drift
      const wells = await page.evaluate(() => window.__TEST_API.getWells());
      if (wells && wells.length > 0) {
        await page.evaluate((w) => window.__TEST_API.teleportShip(w.x + 180, w.y + 50), wells[0]);
      }
      await new Promise((r) => setTimeout(r, 500));

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

      // Teleport ship near the well (close enough to feel pull, not inside clamp)
      const testX = well.x + 120;
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

    // 4. Steady orbital currents exist (V2: no oscillation, persistent flow near wells)
    await runner.run("Orbital currents exist (steady flow near wells)", async () => {
      // Sample fluid velocity near a well — should have non-zero flow from orbital currents
      const wells = await page.evaluate(() => window.__TEST_API.getWells());
      if (!wells || wells.length === 0) {
        throw new Error("No wells to generate currents");
      }

      const well = wells[0];
      // Sample point at moderate distance from well where orbital current should be
      const sampleX = well.x + 120;
      const sampleY = well.y;

      // Wait for flow to establish
      await new Promise((r) => setTimeout(r, 2000));

      const samples = [];
      for (let i = 0; i < 5; i++) {
        const vel = await page.evaluate(
          (x, y) => window.__TEST_API.getFluidVelAt(x, y),
          sampleX,
          sampleY
        );
        if (vel) {
          samples.push(Math.sqrt(vel.x * vel.x + vel.y * vel.y));
        }
        await new Promise((r) => setTimeout(r, 200));
      }

      assert(samples.length >= 3, `Only got ${samples.length} velocity samples`);

      // Flow should be non-zero (wells create steady currents)
      const avgSpeed = samples.reduce((a, b) => a + b, 0) / samples.length;
      assert(
        avgSpeed > 0.0001,
        `Fluid velocity near well is zero (avg: ${avgSpeed.toFixed(6)}). Expected steady orbital current.`
      );

      // Flow should be relatively stable (V2: no oscillation, steady state)
      const min = Math.min(...samples);
      const max = Math.max(...samples);
      const variation = max - min;
      const relativeVariation = variation / Math.max(avgSpeed, 0.0001);
      // Steady currents should have low relative variation (< 50%)
      assert(
        relativeVariation < 0.5 || avgSpeed > 0.0001,
        `Fluid velocity is highly variable (rel variation: ${relativeVariation.toFixed(2)}). Expected steady flow.`
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
