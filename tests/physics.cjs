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
  waitFor,
} = require("./helpers.cjs");

const htmlFile = process.argv[2] || "index-a.html";

async function prepareLocalRun(page, { disableWellPull = false } = {}) {
  await page.evaluate((disablePull) => {
    window.__TEST_API.triggerRestart();
    window.__TEST_API.clearInputForTest?.();
    window.__TEST_API.setTimeScale?.(0);
    window.__TEST_API.setConfig("wells.shipPullStrength", disablePull ? 0 : 0.6);
  }, disableWellPull);
  await waitFor(page, () => window.__TEST_API.getGamePhase() === "playing", { timeout: 9000 });
  await new Promise((r) => setTimeout(r, 250));
}

async function tickShip(page, frames, controls = {}) {
  let state = null;
  for (let i = 0; i < frames; i++) {
    state = await page.evaluate((stepControls) =>
      window.__TEST_API.tickShipPhysicsForTest?.(1 / 60, stepControls),
      controls
    );
  }
  assert(state, "tickShipPhysicsForTest did not return state");
  return state;
}

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
      await prepareLocalRun(page, { disableWellPull: true });

      const posBefore = await page.evaluate(() => window.__TEST_API.getShipPos());
      await tickShip(page, 60, { facing: 0, thrustIntensity: 1, brakeIntensity: 0, wellPullStrength: 0 });

      const posAfter = await page.evaluate(() => window.__TEST_API.getShipPos());

      const dx = Math.abs(posAfter.x - posBefore.x);
      const dy = Math.abs(posAfter.y - posBefore.y);
      const moved = dx + dy;

      // World-space: 0.005 world-units = noticeable movement
      assert(moved > 0.005, `Ship barely moved (delta: ${moved.toFixed(4)} world-units). Expected significant movement on thrust.`);
    });

    // 2. Ship drifts when thrust stops
    await runner.run("Ship drifts when thrust stops (carried by fluid)", async () => {
      await prepareLocalRun(page, { disableWellPull: true });

      await tickShip(page, 40, { facing: 0, thrustIntensity: 1, brakeIntensity: 0, wellPullStrength: 0 });
      const posBefore = await page.evaluate(() => window.__TEST_API.getShipPos());
      await tickShip(page, 60, { thrustIntensity: 0, brakeIntensity: 0, wellPullStrength: 0 });
      const posAfter = await page.evaluate(() => window.__TEST_API.getShipPos());

      const dx = Math.abs(posAfter.x - posBefore.x);
      const dy = Math.abs(posAfter.y - posBefore.y);
      const drifted = dx + dy;

      assert(drifted > 0.001, `Ship is stationary without thrust (delta: ${drifted.toFixed(4)} world-units). Expected fluid drift.`);
    });

    // 3. Well pull exists
    await runner.run("Gravity well pulls ship toward it", async () => {
      await prepareLocalRun(page);
      const previousFluidCoupling = await page.evaluate(() => window.__TEST_API.getConfig().ship.fluidCoupling);
      await page.evaluate(() => window.__TEST_API.setConfig("ship.fluidCoupling", 0));
      try {
        const wells = await page.evaluate(() => window.__TEST_API.getWells());
        assert(wells && wells.length > 0, "No gravity wells found");

        const well = wells.reduce((best, candidate) =>
          !best || candidate.mass > best.mass ? candidate : best,
          null
        );
        const grid = await page.evaluate(() => window.__TEST_API.getFluidGridState?.());
        const worldScale = grid?.worldScale || 3;
        const wrapWorld = (value) => ((value % worldScale) + worldScale) % worldScale;
        const testRadius = Math.max((well.killRadius || 0.04) * 1.35, (well.killRadius || 0.04) + 0.03);
        const offsets = [
          [ testRadius, 0 ],
          [-testRadius, 0 ],
          [0,  testRadius],
          [0, -testRadius],
        ];

        let bestInwardDelta = -Infinity;
        for (const [dx, dy] of offsets) {
          await page.evaluate(
            (wx, wy) => window.__TEST_API.teleportShip(wx, wy),
            wrapWorld(well.wx + dx),
            wrapWorld(well.wy + dy)
          );

          const startDist = await page.evaluate(
            (wx, wy, scale) => {
              const ship = window.__TEST_API.getShipPos();
              const wrapDelta = (from, to) => {
                let d = to - from;
                const half = scale / 2;
                if (d > half) d -= scale;
                if (d < -half) d += scale;
                return d;
              };
              const dx = wrapDelta(wx, ship.x);
              const dy = wrapDelta(wy, ship.y);
              return Math.sqrt(dx * dx + dy * dy);
            },
            well.wx,
            well.wy,
            worldScale
          );

          await tickShip(page, 60, { thrustIntensity: 0, brakeIntensity: 0, wellPullStrength: 0.6 });

          const result = await page.evaluate(
            (wx, wy, scale) => {
              const ship = window.__TEST_API.getShipPos();
              const wrapDelta = (from, to) => {
                let d = to - from;
                const half = scale / 2;
                if (d > half) d -= scale;
                if (d < -half) d += scale;
                return d;
              };
              const dx = wrapDelta(wx, ship.x);
              const dy = wrapDelta(wy, ship.y);
              return {
                dist: Math.sqrt(dx * dx + dy * dy),
                phase: window.__TEST_API.getGamePhase(),
              };
            },
            well.wx,
            well.wy,
            worldScale
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
      } finally {
        await page.evaluate((value) => window.__TEST_API.setConfig("ship.fluidCoupling", value), previousFluidCoupling);
      }
    });

    // 4. Steady orbital currents exist
    await runner.run("Orbital currents exist (steady flow near wells)", async () => {
      await prepareLocalRun(page);

      const wells = await page.evaluate(() => window.__TEST_API.getWells());
      if (!wells || wells.length === 0) {
        throw new Error("No wells to generate currents");
      }

      const well = wells[0];
      // Sample in world-space: 0.3 world-units from well
      const sampleWX = well.wx + 0.3;
      const sampleWY = well.wy;

      await page.evaluate(() => window.__TEST_API.setTimeScale?.(1));
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
      const maxSpeed = Math.max(...samples);
      assert(
        maxSpeed > 0.00001,
        `Fluid velocity near well is zero (max: ${maxSpeed.toFixed(6)}). Expected readable current.`
      );

      assert(samples.every((speed) => Number.isFinite(speed) && speed >= 0),
        `Fluid velocity samples contained invalid speeds: ${samples.join(', ')}`);
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
