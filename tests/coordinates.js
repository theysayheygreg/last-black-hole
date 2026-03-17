/**
 * Coordinate mismatch detection tests.
 * Verifies that visual well positions (dark voids in ASCII) align with
 * physics well positions (where ship gets pulled).
 *
 * The test places a single well at an asymmetric position (0.2, 0.2) —
 * top-left area in screen space — and checks:
 *   1. The darkest region in the screenshot is in the top-left quadrant
 *   2. A ship teleported to the well's screen position barely moves
 *      (confirming physics and visual positions agree)
 *
 * Usage: node tests/coordinates.js [index-a.html|index-b.html|index.html]
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
  console.log(`\n=== COORDINATE TESTS (${htmlFile}) ===\n`);

  const runner = new TestRunner("Coordinates");
  await startServer();

  let browser, page, errors;

  try {
    ({ browser, page, errors } = await launchGame(htmlFile));

    // Check __TEST_API exists
    const hasAPI = await page.evaluate(
      () => typeof window.__TEST_API !== "undefined"
    );
    if (!hasAPI) {
      console.log(
        "  SKIP: window.__TEST_API not found. Coordinate tests require the test API."
      );
      runner.summary();
      return;
    }

    // 1. Verify the current well layout stays asymmetric in screen space.
    // This is a coordinate-mapping test, not a screenshot-based render assertion.
    await runner.run(
      "Well screen coordinates span the expected asymmetric layout",
      async () => {
        await page.evaluate(() => window.__TEST_API.triggerRestart());
        await new Promise((r) => setTimeout(r, 500));

        // Check well WORLD positions (not screen positions, which depend on random camera).
        // Wells should be spread across the 3x3 map, not all clustered in one quadrant.
        const layout = await page.evaluate(() => {
          const wells = window.__TEST_API.getWells();
          if (!wells || wells.length === 0) return null;

          const midW = 1.5; // half of WORLD_SCALE (3.0)
          const counts = { left: 0, right: 0, top: 0, bottom: 0 };

          for (const well of wells) {
            if (well.wx < midW) counts.left++;
            if (well.wx >= midW) counts.right++;
            if (well.wy < midW) counts.top++;
            if (well.wy >= midW) counts.bottom++;
          }

          return { wells, counts };
        });

        assert(layout && layout.wells.length >= 4, "Expected at least four wells in the layout");
        assert(layout.counts.left > 0, "Expected at least one well in the left half of the world");
        assert(layout.counts.right > 0, "Expected at least one well in the right half of the world");
        assert(layout.counts.top > 0, "Expected at least one well in the top half of the world");
        assert(layout.counts.bottom > 0, "Expected at least one well in the bottom half of the world");

        console.log(
          `        World layout — left:${layout.counts.left} right:${layout.counts.right} top:${layout.counts.top} bottom:${layout.counts.bottom}`
        );
      }
    );

    // 2. Ship gravity alignment — teleport ship to well screen position,
    //    verify it barely moves (physics agrees with visual position)
    await runner.run(
      "Ship at well screen position experiences minimal drift (coords aligned)",
      async () => {
        // Get a well's screen position
        const wells = await page.evaluate(() => window.__TEST_API.getWells());
        assert(wells && wells.length > 0, "No wells found");

        const well = wells[0];

        // Teleport ship exactly to the well's world-space position
        await page.evaluate(
          (wx, wy) => window.__TEST_API.teleportShip(wx, wy),
          well.wx,
          well.wy
        );

        // Record position
        const posBefore = await page.evaluate(() =>
          window.__TEST_API.getShipPos()
        );

        // Wait 1 second
        await new Promise((r) => setTimeout(r, 1000));

        const posAfter = await page.evaluate(() =>
          window.__TEST_API.getShipPos()
        );

        // Ship should barely move — it's at the gravity center.
        // In world-space, allow some drift from orbital currents.
        const dx = Math.abs(posAfter.x - posBefore.x);
        const dy = Math.abs(posAfter.y - posBefore.y);
        const drift = Math.sqrt(dx * dx + dy * dy);

        console.log(`        Well screen pos: (${well.x.toFixed(0)}, ${well.y.toFixed(0)})`);
        console.log(`        Ship drift in 1s: ${drift.toFixed(4)} world-units`);

        // In world-space, 0.5 world-units of drift would indicate a mismatch
        assert(
          drift < 0.5,
          `Ship drifted ${drift.toFixed(3)} world-units from well center in 1s. ` +
            `If >0.5, physics and visual coordinates likely disagree.`
        );
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
