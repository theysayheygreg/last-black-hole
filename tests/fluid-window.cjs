/**
 * Fluid-window tests - browser coverage for the camera-anchored GPU grid.
 *
 * Large maps should keep the same fluid texture cost as the fixed local reference
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
const { CLIENT_PERF_PROFILES } = require("../scripts/content/session-profiles.cjs");
const { PLAYABLE_MAP_IDS, MAP_SCALE_REGISTRY } = require("../scripts/content/map-scales.cjs");
const { loadPlayableMaps } = require("../scripts/shared-map-loader.cjs");

const htmlFile = process.argv[2] || "index-a.html";
const EXPECTED_FLUID_RESOLUTION = CLIENT_PERF_PROFILES.fixedGrid.fluidResolution;

const AUTHORITATIVE_MAPS = loadPlayableMaps();
const MAPS = PLAYABLE_MAP_IDS.map((mapId, index) => ({
  index,
  label: mapId,
  scale: MAP_SCALE_REGISTRY[mapId].dimensions.width,
  wells: AUTHORITATIVE_MAPS[mapId].wells.length,
}));

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
        assert(grid.gridWindow === CLIENT_PERF_PROFILES.fixedGrid.localWindowWorldUnits,
          `${map.label}: expected fixed GRID_WINDOW ${CLIENT_PERF_PROFILES.fixedGrid.localWindowWorldUnits}, got ${grid.gridWindow}`);
        assert(stats.fluidResolution === EXPECTED_FLUID_RESOLUTION,
          `${map.label}: expected ${EXPECTED_FLUID_RESOLUTION} fluid grid, got ${stats.fluidResolution}`);
        assert(stats.totalWellCount === map.wells, `${map.label}: expected ${map.wells} wells, got ${stats.totalWellCount}`);
        assert(stats.visibleWellCount > 0, `${map.label}: expected at least one direct render well`);
        assert(stats.visibleWellCount <= stats.totalWellCount,
          `${map.label}: visibleWellCount ${stats.visibleWellCount} exceeds total ${stats.totalWellCount}`);
      }
    });

    await runner.run("Large maps cull off-window wells from direct rendering", async () => {
      for (const map of MAPS.filter((m) => m.scale > CLIENT_PERF_PROFILES.fixedGrid.localWindowWorldUnits)) {
        const grid = await startMapAndReadGrid(page, map);
        const { visibleWellCount, totalWellCount } = grid.perfStats;
        assert(visibleWellCount < totalWellCount,
          `${map.label}: expected off-window wells to use coarse flow, got ${visibleWellCount}/${totalWellCount} direct wells`);
      }
    });

    await runner.run("Spawn and visible wells share the same camera window", async () => {
      for (const map of MAPS) {
        await startMapAndReadGrid(page, map);
        const audit = await page.evaluate(() => {
          const api = window.__TEST_API;
          const grid = api.getFluidGridState();
          const ship = api.getShipPos();
          const shipScreen = api.getShipScreenPos();
          const wells = api.getWells();
          const canvas = document.getElementById('overlay-canvas') || document.querySelector('canvas');
          const width = canvas?.width || window.innerWidth;
          const height = canvas?.height || window.innerHeight;
          const worldScale = grid.worldScale;
          const cam = grid.fluidCamera;
          const halfWindow = grid.gridWindow / 2;
          const wrapDelta = (from, to) => {
            let d = to - from;
            const half = worldScale / 2;
            if (d > half) d -= worldScale;
            if (d < -half) d += worldScale;
            return d;
          };
          const dist = (ax, ay, bx, by) => Math.hypot(wrapDelta(ax, bx), wrapDelta(ay, by));
          const nearest = wells.reduce((best, well) => {
            const d = dist(ship.x, ship.y, well.wx, well.wy);
            return !best || d < best.dist ? { name: well.name, dist: d, killRadius: well.killRadius } : best;
          }, null);
          const windowWells = wells.map((well) => {
            const dx = wrapDelta(cam.x, well.wx);
            const dy = wrapDelta(cam.y, well.wy);
            const inFluidWindow = Math.abs(dx) <= halfWindow + 1e-6 && Math.abs(dy) <= halfWindow + 1e-6;
            const onScreen = well.x >= -2 && well.x <= width + 2 && well.y >= -2 && well.y <= height + 2;
            return { name: well.name, x: well.x, y: well.y, dx, dy, inFluidWindow, onScreen };
          }).filter((well) => well.inFluidWindow);
          return {
            phase: api.getGamePhase(),
            width,
            height,
            ship,
            shipScreen,
            nearest,
            windowWells,
          };
        });

        assert(audit.phase === 'playing', `${map.label}: expected playing phase after map load, got ${audit.phase}`);
        assert(audit.shipScreen?.x >= -2 && audit.shipScreen?.x <= audit.width + 2
          && audit.shipScreen?.y >= -2 && audit.shipScreen?.y <= audit.height + 2,
          `${map.label}: spawned ship is not on screen (${JSON.stringify(audit.shipScreen)})`);
        assert(audit.nearest && audit.nearest.dist > (audit.nearest.killRadius || 0) + 0.18,
          `${map.label}: spawn too close to nearest well ${JSON.stringify(audit.nearest)}`);
        assert(audit.windowWells.length > 0,
          `${map.label}: expected at least one well inside the fluid camera window`);
        for (const well of audit.windowWells) {
          assert(well.onScreen,
            `${map.label}: well inside fluid window is off-screen ${JSON.stringify(well)}`);
        }
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
