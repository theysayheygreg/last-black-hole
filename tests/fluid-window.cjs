/**
 * Fluid-window tests - browser coverage for the camera-anchored GPU grid.
 *
 * Large maps should keep the same fluid texture cost as the 3x3 reference
 * map. Only wells near the camera feed the display shader directly; off-window
 * influence is carried by the coarse field.
 *
 * Usage: node tests/fluid-window.js [index-a.html]
 */
const {
  startServer,
  stopServer,
  launchGame,
  TestRunner,
  assert,
} = require("./helpers.cjs");

const htmlFile = process.argv[2] || "index-a.html";

const MAPS = [
  { index: 0, label: "shallows", scale: 3, wells: 4 },
  { index: 1, label: "expanse", scale: 5, wells: 8 },
  { index: 2, label: "deep-field", scale: 10, wells: 20 },
];

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function startMapAndReadGrid(page, map) {
  const ok = await page.evaluate((index) => window.__TEST_API.startGameOnMap(index), map.index);
  assert(ok, `Could not start ${map.label}`);

  await page.waitForFunction(
    (expectedWells) => {
      const grid = window.__TEST_API.getFluidGridState?.();
      const stats = grid?.perfStats;
      return stats?.fluidResolution > 0 && stats?.totalWellCount === expectedWells;
    },
    { timeout: 8000 },
    map.wells
  );

  await sleep(300);
  return page.evaluate(() => window.__TEST_API.getFluidGridState());
}

async function run() {
  console.log(`\n=== FLUID WINDOW TESTS (${htmlFile}) ===\n`);

  const runner = new TestRunner("FluidWindow");
  await startServer();

  let browser, page, errors;

  try {
    ({ browser, page, errors } = await launchGame(htmlFile));

    await runner.run("Test API exposes fixed fluid-grid state", async () => {
      const hasAPI = await page.evaluate(() => typeof window.__TEST_API?.getFluidGridState === "function");
      assert(hasAPI, "window.__TEST_API.getFluidGridState not found");
    });

    await runner.run("Gameplay maps keep one fixed-size fluid window", async () => {
      for (const map of MAPS) {
        const grid = await startMapAndReadGrid(page, map);
        const stats = grid.perfStats;
        assert(grid.worldScale === map.scale, `${map.label}: expected worldScale ${map.scale}, got ${grid.worldScale}`);
        assert(grid.gridWindow === 3, `${map.label}: expected GRID_WINDOW 3, got ${grid.gridWindow}`);
        assert(stats.fluidResolution === 256, `${map.label}: expected 256 fluid grid, got ${stats.fluidResolution}`);
        assert(stats.totalWellCount === map.wells, `${map.label}: expected ${map.wells} wells, got ${stats.totalWellCount}`);
        assert(stats.visibleWellCount > 0, `${map.label}: expected at least one direct render well`);
        assert(stats.visibleWellCount <= stats.totalWellCount,
          `${map.label}: visibleWellCount ${stats.visibleWellCount} exceeds total ${stats.totalWellCount}`);
      }
    });

    await runner.run("Large maps cull off-window wells from direct rendering", async () => {
      for (const map of MAPS.filter((m) => m.scale > 3)) {
        const grid = await startMapAndReadGrid(page, map);
        const { visibleWellCount, totalWellCount } = grid.perfStats;
        assert(visibleWellCount < totalWellCount,
          `${map.label}: expected off-window wells to use coarse flow, got ${visibleWellCount}/${totalWellCount} direct wells`);
      }
    });

    await runner.run("Fluid camera stays valid inside the active world", async () => {
      for (const map of MAPS) {
        const grid = await startMapAndReadGrid(page, map);
        assert(Number.isFinite(grid.fluidCamera.x) && Number.isFinite(grid.fluidCamera.y),
          `${map.label}: fluid camera is not finite (${grid.fluidCamera.x}, ${grid.fluidCamera.y})`);
        assert(grid.fluidCamera.x >= 0 && grid.fluidCamera.x < map.scale,
          `${map.label}: fluid camera x=${grid.fluidCamera.x} outside [0, ${map.scale})`);
        assert(grid.fluidCamera.y >= 0 && grid.fluidCamera.y < map.scale,
          `${map.label}: fluid camera y=${grid.fluidCamera.y} outside [0, ${map.scale})`);
      }
    });

    await runner.run("Fluid window produces no browser errors", async () => {
      assert(errors.length === 0, `Page errors: ${errors.join("; ")}`);
    });
  } finally {
    if (browser) await browser.close();
    stopServer();
  }

  const allPassed = runner.summary();
  process.exit(allPassed ? 0 : 1);
}

run().catch((err) => {
  console.error("FluidWindow test fatal error:", err.message);
  stopServer();
  process.exit(1);
});
