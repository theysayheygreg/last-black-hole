/**
 * Smoke tests — runs in <10 seconds.
 * Verifies the local client page loads, renders, and doesn't crash.
 *
 * This is the client-only canary. It does not prove control-plane/sim wiring.
 * Use `infra-smoke.cjs` and `remote-authority.cjs` for the architecture-aware path.
 *
 * Usage: node tests/smoke.cjs [index-a.html|index-b.html|index.html]
 */
const {
  startServer,
  stopServer,
  launchGame,
  TestRunner,
  assert,
  stepGameFrames,
} = require("./helpers.cjs");

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

    // 6. Render loop advances
    await runner.run("Render loop advances", async () => {
      const stepped = await stepGameFrames(page, 90);
      assert(stepped, "Frame step hook unavailable");
      assert(stepped.perfStats?.frameMs > 0, "Frame timing did not update");
      assert(stepped.perfStats?.fluidResolution > 0, "Fluid renderer did not report a resolution");
      assert(stepped.fps > 10, `FPS is ${stepped.fps}, expected >10 after stepped frames`);
    });

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
