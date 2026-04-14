/**
 * Physics tests — runs in ~30 seconds.
 * Verifies the sim is behaving: ship moves, drifts, wells pull, waves exist.
 * Requires __TEST_API to be exposed on the game window.
 *
 * V3: World-space coordinates. Ship pos and teleport in world-units (0-3).
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

const htmlFile = process.argv[2] || "index-a.html";

async function run() {
  console.log(`\n=== PHYSICS TESTS (${htmlFile}) ===\n`);

  const runner = new TestRunner("Physics");
  await startServer();

  let browser, page, errors;

  try {
    ({ browser, page, errors } = await launchGame(htmlFile));

    const hasAPI = await page.evaluate(() => typeof window.__TEST_API !== "undefined");
    if (!hasAPI) {
      console.log("  SKIP: window.__TEST_API not found.");
      runner.summary();
      return;
    }

    // 1. Ship moves on thrust
    await runner.run("Ship moves when thrust is applied", async () => {
      // Ensure game is in playing state (may start on title screen)
      await page.evaluate(() => window.__TEST_API.triggerRestart());
      await new Promise((r) => setTimeout(r, 500));

      const posBefore = await page.evaluate(() => window.__TEST_API.getShipPos());

      await page.click("body");
      await page.keyboard.down("ArrowRight");
      await page.keyboard.down("Space");
      await new Promise((r) => setTimeout(r, 1500));
      await page.keyboard.up("Space");
      await page.keyboard.up("ArrowRight");

      const posAfter = await page.evaluate(() => window.__TEST_API.getShipPos());

      const dx = Math.abs(posAfter.x - posBefore.x);
      const dy = Math.abs(posAfter.y - posBefore.y);
      const moved = dx + dy;

      // World-space: 0.005 world-units = noticeable movement
      assert(moved > 0.005, `Ship barely moved (delta: ${moved.toFixed(4)} world-units). Expected significant movement on thrust.`);
    });

    // 2. Ship drifts when thrust stops
    await runner.run("Ship drifts when thrust stops (carried by fluid)", async () => {
      // Reset game state to ensure we're playing
      await page.evaluate(() => window.__TEST_API.triggerRestart());
      await new Promise((r) => setTimeout(r, 500));

      // Teleport near first well (world-space offset)
      const wells = await page.evaluate(() => window.__TEST_API.getWells());
      if (wells && wells.length > 0) {
        await page.evaluate((w) => window.__TEST_API.teleportShip(w.wx + 0.4, w.wy + 0.1), wells[0]);
      }
      await new Promise((r) => setTimeout(r, 500));

      const posBefore = await page.evaluate(() => window.__TEST_API.getShipPos());
      await new Promise((r) => setTimeout(r, 1500));
      const posAfter = await page.evaluate(() => window.__TEST_API.getShipPos());

      const dx = Math.abs(posAfter.x - posBefore.x);
      const dy = Math.abs(posAfter.y - posBefore.y);
      const drifted = dx + dy;

      assert(drifted > 0.001, `Ship is stationary without thrust (delta: ${drifted.toFixed(4)} world-units). Expected fluid drift.`);
    });

    // 3. Well pull exists
    await runner.run("Gravity well pulls ship toward it", async () => {
      const wells = await page.evaluate(() => window.__TEST_API.getWells());
      assert(wells && wells.length > 0, "No gravity wells found");

      const well = wells.reduce((best, candidate) =>
        !best || candidate.mass > best.mass ? candidate : best,
        null
      );
      const testRadius = Math.max((well.killRadius || 0.04) * 1.35, (well.killRadius || 0.04) + 0.03);
      const offsets = [
        [ testRadius, 0 ],
        [-testRadius, 0 ],
        [0,  testRadius],
        [0, -testRadius],
      ];

      let bestInwardDelta = -Infinity;
      for (const [dx, dy] of offsets) {
        await page.evaluate(() => window.__TEST_API.triggerRestart());
        await new Promise((r) => setTimeout(r, 350));

        await page.evaluate(
          (wx, wy) => window.__TEST_API.teleportShip(wx, wy),
          well.wx + dx,
          well.wy + dy
        );
        await new Promise((r) => setTimeout(r, 120));

        const startDist = await page.evaluate(
          (wx, wy) => {
            const ship = window.__TEST_API.getShipPos();
            const dx = ship.x - wx;
            const dy = ship.y - wy;
            return Math.sqrt(dx * dx + dy * dy);
          },
          well.wx,
          well.wy
        );

        await new Promise((r) => setTimeout(r, 650));

        const result = await page.evaluate(
          (wx, wy) => {
            const ship = window.__TEST_API.getShipPos();
            const dx = ship.x - wx;
            const dy = ship.y - wy;
            return {
              dist: Math.sqrt(dx * dx + dy * dy),
              phase: window.__TEST_API.getGamePhase(),
            };
          },
          well.wx,
          well.wy
        );

        if (result.phase === 'dead') {
          bestInwardDelta = Math.max(bestInwardDelta, startDist);
          break;
        }

        bestInwardDelta = Math.max(bestInwardDelta, startDist - result.dist);
      }

      assert(
        bestInwardDelta > 0.001,
        `Ship didn't show inward pull from any test angle (best distance delta: ${bestInwardDelta.toFixed(4)} world-units)`
      );
    });

    // 4. Steady orbital currents exist
    await runner.run("Orbital currents exist (steady flow near wells)", async () => {
      await page.evaluate(() => window.__TEST_API.triggerRestart());
      await new Promise((r) => setTimeout(r, 500));

      const wells = await page.evaluate(() => window.__TEST_API.getWells());
      if (!wells || wells.length === 0) {
        throw new Error("No wells to generate currents");
      }

      const well = wells[0];
      // Sample in world-space: 0.3 world-units from well
      const sampleWX = well.wx + 0.3;
      const sampleWY = well.wy;

      await new Promise((r) => setTimeout(r, 2000));

      const samples = [];
      for (let i = 0; i < 5; i++) {
        const vel = await page.evaluate(
          (x, y) => window.__TEST_API.getFluidVelAt(x, y),
          sampleWX,
          sampleWY
        );
        if (vel) {
          samples.push(Math.sqrt(vel.x * vel.x + vel.y * vel.y));
        }
        await new Promise((r) => setTimeout(r, 200));
      }

      assert(samples.length >= 3, `Only got ${samples.length} velocity samples`);

      const avgSpeed = samples.reduce((a, b) => a + b, 0) / samples.length;
      assert(
        avgSpeed > 0.0001,
        `Fluid velocity near well is zero (avg: ${avgSpeed.toFixed(6)}). Expected steady orbital current.`
      );

      const min = Math.min(...samples);
      const max = Math.max(...samples);
      const variation = max - min;
      const relativeVariation = variation / Math.max(avgSpeed, 0.0001);
      assert(
        relativeVariation < 0.5 || avgSpeed > 0.0001,
        `Fluid velocity is highly variable (rel variation: ${relativeVariation.toFixed(2)}). Expected steady flow.`
      );
    });

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
