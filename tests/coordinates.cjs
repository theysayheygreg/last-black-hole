/**
 * Coordinate mismatch detection tests.
 * Verifies that visual well positions (dark voids in ASCII) align with
 * physics well positions (where ship gets pulled).
 *
 * The browser checks use the authored playing fixture at a fixed seed, then
 * compare its renderer-facing well pixels with the shared coordinate authority.
 *
 * Usage: node tests/coordinates.cjs [index-a.html]
 */
const {
  startServer,
  stopServer,
  launchGame,
  screenshot,
  TestRunner,
  assert,
} = require("./helpers.cjs");

const htmlFile = process.argv[2] || "index-a.html";

async function run() {
  console.log(`\n=== COORDINATE TESTS (${htmlFile}) ===\n`);

  const runner = new TestRunner("Coordinates");

  await runner.run("Square fluid-window world/screen projection round-trips", async () => {
    const coords = await import("../src/coords.js");
    const canvasW = 1280;
    const canvasH = 720;
    const camX = 1.2;
    const camY = 1.6;
    const halfWindow = coords.CAMERA_VIEW / 2;

    const [rightEdgeX, rightEdgeY] = coords.screenToWorld(canvasW, canvasH / 2, camX, camY, canvasW, canvasH);
    assert(Math.abs(rightEdgeX - (camX + halfWindow)) < 1e-6,
      `Right screen edge should be ${halfWindow.toFixed(3)} world-units from camera, got ${rightEdgeX - camX}`);
    assert(Math.abs(rightEdgeY - camY) < 1e-6, "Right screen edge should preserve camera Y");

    const [topX, topY] = coords.screenToWorld(canvasW / 2, 0, camX, camY, canvasW, canvasH);
    assert(Math.abs(topX - camX) < 1e-6, "Top screen edge should preserve camera X");
    assert(Math.abs(topY - (camY - halfWindow)) < 1e-6,
      `Top screen edge should be ${halfWindow.toFixed(3)} world-units above camera, got ${camY - topY}`);

    const probeWX = camX + 0.37;
    const probeWY = camY - 0.22;
    const [sx, sy] = coords.worldToScreen(probeWX, probeWY, camX, camY, canvasW, canvasH);
    const [roundWX, roundWY] = coords.screenToWorld(sx, sy, camX, camY, canvasW, canvasH);
    assert(Math.abs(roundWX - probeWX) < 1e-6 && Math.abs(roundWY - probeWY) < 1e-6,
      `worldToScreen/screenToWorld mismatch: (${roundWX}, ${roundWY})`);

    const edgeInset = 1e-6;
    const [rightEdgePx] = coords.worldToScreen(camX + halfWindow - edgeInset, camY, camX, camY, canvasW, canvasH);
    assert(Math.abs(rightEdgePx - (canvasW - edgeInset * (canvasW / coords.CAMERA_VIEW))) < 1e-3,
      "The square fluid-window right edge should land on the right screen edge");

    const [, bottomEdgePx] = coords.worldToScreen(camX, camY + halfWindow - edgeInset, camX, camY, canvasW, canvasH);
    assert(Math.abs(bottomEdgePx - (canvasH - edgeInset * (canvasH / coords.CAMERA_VIEW))) < 1e-3,
      "The square fluid-window bottom edge should land on the bottom screen edge");
  });

  await runner.run("World radii use axis-specific projection helpers", async () => {
    const coords = await import("../src/coords.js");
    const canvasW = 1280;
    const canvasH = 720;
    const radius = 0.25;
    const aspect = canvasW / canvasH;

    const worldPx = coords.worldRadiusToScreen(radius, canvasW, canvasH);
    assert(Math.abs(worldPx.rx - radius * canvasW / coords.CAMERA_VIEW) < 1e-6,
      `Expected world X radius to use canvas width, got ${worldPx.rx}`);
    assert(Math.abs(worldPx.ry - radius * canvasH / coords.CAMERA_VIEW) < 1e-6,
      `Expected world Y radius to use canvas height, got ${worldPx.ry}`);

    const glyphPx = coords.worldRadiusToScreen(radius, canvasW, canvasH, "screen");
    assert(Math.abs(glyphPx.rx - glyphPx.ry) < 1e-6,
      "Screen glyph mode should stay visually round");

    const worldScene = coords.worldRadiusToSceneScale(radius, aspect, coords.CAMERA_VIEW);
    assert(Math.abs(worldScene.x - worldScene.y * aspect) < 1e-6,
      `Expected Three world radius X scale to include aspect, got ${worldScene.x}/${worldScene.y}`);

    const glyphScene = coords.worldRadiusToSceneScale(radius, aspect, coords.CAMERA_VIEW, "screen");
    assert(Math.abs(glyphScene.x - glyphScene.y) < 1e-6,
      "Three screen glyph mode should keep uniform scene scale");
  });

  await runner.run("Fluid UV radius follows GRID_WINDOW, not total map scale", async () => {
    const coords = await import("../src/coords.js");
    coords.setWorldScale(10);
    const radius = 0.4;
    const uv = coords.worldRadiusToFluidUV(radius);
    assert(Math.abs(uv - radius / coords.GRID_WINDOW) < 1e-9,
      `Expected UV radius ${radius / coords.GRID_WINDOW}, got ${uv}`);
    assert(Math.abs(coords.uvToWorld(uv) - radius) < 1e-9,
      "uvToWorld should invert camera-window UV radius");
    coords.setWorldScale(3);
  });

  await startServer();

  let browser, page, errors;

  try {
    ({ browser, page, errors } = await launchGame(htmlFile));

    // Check __TEST_API exists
    const hasAPI = await page.evaluate(
      () => typeof window.__TEST_API !== "undefined"
    );
    assert(hasAPI, "window.__TEST_API must mount for coordinate proof");

    let seededFixture = null;

    await runner.run(
      "Authored playing fixture publishes stable coordinate inputs",
      async () => {
        seededFixture = await page.evaluate(() => {
          const loaded = window.__TEST_API.showUiFixture("playing-hud", {
            mapIndex: 0,
            seed: 424242,
          });
          const wells = window.__TEST_API.getWells().map(({ name, wx, wy, mass }) => ({
            name,
            wx,
            wy,
            mass,
          }));
          return { loaded, wells };
        });

        assert(seededFixture.loaded, "Expected playing fixture to load at seed 424242");
        assert(seededFixture.wells.length > 0, "Expected playing fixture to publish wells");
        assert(seededFixture.wells.every((well) =>
          Number.isFinite(well.wx) && Number.isFinite(well.wy) && Number.isFinite(well.mass)),
        "Expected finite world coordinates and mass for every renderer-facing well");
      }
    );

    await runner.run(
      "Renderer well pixels match the shared coordinate authority",
      async () => {
        assert(seededFixture, "Expected seeded fixture contract before projection proof");
        const rendered = await page.evaluate(() => ({
          backend: window.__TEST_API.getRendererBackend(),
          wells: window.__TEST_API.getWells(),
          camera: window.__TEST_API.getThreeSceneState()?.camera || null,
        }));
        assert(rendered.backend === "three", `Expected Three renderer, got ${rendered.backend}`);
        assert(rendered.camera, "Expected renderer camera contract");

        const coords = await import("../src/coords.js");
        coords.setWorldScale(rendered.camera.worldScale);
        for (const well of rendered.wells) {
          const [x, y] = coords.worldToScreen(
            well.wx,
            well.wy,
            rendered.camera.camX,
            rendered.camera.camY,
            rendered.camera.canvasWidth,
            rendered.camera.canvasHeight,
          );
          assert(Math.abs(well.x - x) < 1e-6 && Math.abs(well.y - y) < 1e-6,
            `${well.name} renderer position (${well.x}, ${well.y}) diverged from coordinate authority (${x}, ${y})`);
        }
        coords.setWorldScale(3);
      }
    );

    // Take a screenshot
    const screenshotPath = await screenshot(page, "coordinates");
    console.log(`\n  Screenshot: ${screenshotPath}`);
  } finally {
    if (browser) await browser.close();
    stopServer();
  }

  const allPassed = runner.summary();
  process.exit(allPassed ? 0 : 1);
}

run().catch((err) => {
  console.error("Coordinate test fatal error:", err.message);
  stopServer();
  process.exit(1);
});
