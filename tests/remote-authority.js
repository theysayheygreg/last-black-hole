/**
 * remote-authority.js — Real remote-authority browser smoke.
 *
 * Starts a dedicated sim server, then drives the real menu/profile/mapSelect
 * flow into a remote-authority run and verifies snapshot + movement sync.
 *
 * Usage: node tests/remote-authority.js [index-a.html]
 */
const {
  startServer,
  stopServer,
  startSimServer,
  stopSimServer,
  launchGame,
  screenshot,
  TestRunner,
  assert,
  dispatchKey,
  waitFor,
} = require("./helpers");

const htmlFile = process.argv[2] || "index-a.html";
const SIM_PORT = 8788;
const SIM_URL = `http://127.0.0.1:${SIM_PORT}`;

function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

async function waitForPhase(page, phase, timeout = 9000) {
  await waitFor(page, (expected) => window.__TEST_API?.getGamePhase?.() === expected, { timeout }, phase);
}

async function tap(page, code, key) {
  await dispatchKey(page, code, key);
  await sleep(120);
}

async function bootstrapCleanRemotePage(page) {
  await page.evaluate(() => localStorage.clear());
  await page.reload({ waitUntil: "domcontentloaded" });
  await sleep(2000);
}

async function enterRemoteRun(page) {
  await waitForPhase(page, "title");
  await tap(page, "Space", " ");
  await waitForPhase(page, "profileSelect");
  await tap(page, "Enter", "Enter");
  await sleep(120);
  await tap(page, "Enter", "Enter");
  await waitForPhase(page, "home");

  await tap(page, "KeyE", "e");
  await tap(page, "KeyE", "e");
  await tap(page, "KeyE", "e");
  await tap(page, "Enter", "Enter");
  await waitForPhase(page, "mapSelect");

  await tap(page, "Enter", "Enter");
  await waitForPhase(page, "playing", 12000);
}

async function run() {
  console.log(`\n=== REMOTE AUTHORITY TESTS (${htmlFile}) ===\n`);

  const runner = new TestRunner("RemoteAuthority");
  await startServer();
  await startSimServer(SIM_PORT);

  let browser, page;

  try {
    ({ browser, page } = await launchGame(`${htmlFile}?simServer=${encodeURIComponent(SIM_URL)}`));
    await bootstrapCleanRemotePage(page);

    await runner.run("Remote menu path reaches authoritative gameplay", async () => {
      await enterRemoteRun(page);

      await waitFor(page, () => {
        const net = window.__TEST_API.getNetworkState();
        return net.simEnabled && net.remoteAuthorityActive && typeof net.remoteTick === "number";
      }, { timeout: 12000 });

      const net = await page.evaluate(() => window.__TEST_API.getNetworkState());
      assert(net.simEnabled === true, "Expected sim client enabled");
      assert(net.remoteAuthorityActive === true, "Expected remote authority active");
      assert(net.simUrl === "http://127.0.0.1:8788", `Unexpected sim URL: ${net.simUrl}`);
      assert(typeof net.remoteMapId === "string" && net.remoteMapId.length > 0, "Expected remote map id");
      assert(typeof net.remoteTick === "number", "Expected authoritative remote tick");

      await waitFor(page, () => window.__TEST_API.getScavengers().length > 0, { timeout: 4000 });
      const scavengers = await page.evaluate(() => window.__TEST_API.getScavengers());
      assert(scavengers.length > 0, "Expected authoritative scavengers in remote snapshot");
    });

    await runner.run("Remote snapshots advance and move the ship under authoritative input", async () => {
      const before = await page.evaluate(() => ({
        net: window.__TEST_API.getNetworkState(),
        pos: window.__TEST_API.getShipPos(),
      }));

      await page.evaluate(() => {
        window.dispatchEvent(new KeyboardEvent("keydown", {
          code: "Space",
          key: " ",
          bubbles: true,
        }));
      });
      await sleep(900);
      await page.evaluate(() => {
        window.dispatchEvent(new KeyboardEvent("keyup", {
          code: "Space",
          key: " ",
          bubbles: true,
        }));
      });

      await waitFor(page, (baselineTick) => {
        const net = window.__TEST_API.getNetworkState();
        return typeof net.remoteTick === "number" && net.remoteTick > baselineTick;
      }, { timeout: 6000 }, before.net.remoteTick ?? 0);

      const after = await page.evaluate(() => ({
        net: window.__TEST_API.getNetworkState(),
        pos: window.__TEST_API.getShipPos(),
      }));

      const dx = after.pos.x - before.pos.x;
      const dy = after.pos.y - before.pos.y;
      const moved = Math.hypot(dx, dy);

      assert(after.net.remoteTick > before.net.remoteTick, "Expected authoritative tick to advance");
      assert(moved > 0.005, `Expected ship movement under remote authority, got ${moved}`);
    });

    const filepath = await screenshot(page, "remote-authority");
    console.log(`\n  Screenshot: ${filepath}`);
  } finally {
    if (browser) await browser.close();
    await stopSimServer(SIM_PORT);
    stopServer();
  }

  const allPassed = runner.summary();
  process.exit(allPassed ? 0 : 1);
}

run().catch(async (err) => {
  console.error("RemoteAuthority test fatal error:", err.message);
  try { await stopSimServer(SIM_PORT); } catch {}
  stopServer();
  process.exit(1);
});
