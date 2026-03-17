/**
 * Smoke tests — runs in <10 seconds.
 * Verifies the game loads, renders, and doesn't crash.
 *
 * Usage: node tests/smoke.js [index-a.html|index-b.html|index.html]
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
  console.log(`\n=== SMOKE TESTS (${htmlFile}) ===\n`);

  const runner = new TestRunner("Smoke");
  await startServer();

  let browser, page, errors;

  try {
    ({ browser, page, errors } = await launchGame(htmlFile));

    // 1. Page loads
    await runner.run("Page loads without crash", async () => {
      const title = await page.title();
      assert(title !== undefined, "Page has no title element");
    });

    // 2. Canvas exists
    await runner.run("Canvas element exists", async () => {
      const hasCanvas = await page.evaluate(() => !!document.querySelector("canvas"));
      assert(hasCanvas, "No <canvas> element found");
    });

    // 3. WebGL context
    await runner.run("WebGL context created", async () => {
      const hasGL = await page.evaluate(() => {
        const canvas = document.querySelector("canvas");
        if (!canvas) return false;
        return !!(canvas.getContext("webgl2") || canvas.getContext("webgl"));
      });
      assert(hasGL, "No WebGL context on canvas");
    });

    // 4. No JS errors
    await runner.run("No JavaScript errors", async () => {
      assert(errors.length === 0, `JS errors: ${errors.join("; ")}`);
    });

    // 5. CONFIG object exists
    await runner.run("CONFIG object exists", async () => {
      const hasConfig = await page.evaluate(() => {
        return typeof CONFIG !== "undefined" && typeof CONFIG === "object";
      });
      assert(hasConfig, "CONFIG object not found on window");
    });

    // 6. FPS above floor (check after 2s of running)
    await runner.run("FPS above floor", async () => {
      // Wait an additional 2s for the sim to stabilize
      await new Promise((r) => setTimeout(r, 2000));

      const { fps, isHeadless } = await page.evaluate(() => ({
        fps:
          typeof window.__TEST_API !== "undefined" && window.__TEST_API.getFPS
            ? window.__TEST_API.getFPS()
            : null,
        isHeadless: navigator.userAgent.includes("HeadlessChrome"),
      }));

      if (fps !== null) {
        const floor = isHeadless ? 10 : 30;
        assert(fps > floor, `FPS is ${fps}, expected >${floor}`);
      } else {
        // If no __TEST_API.getFPS, just verify the page is still responsive
        const responsive = await page.evaluate(() => true);
        assert(responsive, "Page unresponsive");
        console.log("        (FPS check skipped — __TEST_API.getFPS not available)");
      }
    });

    // Take a screenshot for the record
    const screenshotPath = await screenshot(page, "smoke");
    console.log(`\n  Screenshot: ${screenshotPath}`);
  } finally {
    if (browser) await browser.close();
    stopServer();
  }

  const allPassed = runner.summary();
  process.exit(allPassed ? 0 : 1);
}

run().catch((err) => {
  console.error("Smoke test fatal error:", err.message);
  stopServer();
  process.exit(1);
});
