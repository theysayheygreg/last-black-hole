/**
 * infra-smoke.js — lightweight architecture smoke.
 *
 * Verifies the real LBH runtime split boots coherently:
 * - control plane
 * - authoritative sim
 * - static client
 * - browser client in remote-authority mode
 *
 * This is intentionally smaller than remote-authority.js. It is a boot and
 * wiring canary for the distributed stack, not the full gameplay protocol suite.
 *
 * Usage: node tests/infra-smoke.js [index-a.html]
 */
const {
  startServer,
  stopServer,
  startControlPlane,
  stopControlPlane,
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
const CONTROL_PORT = 8793;
const SIM_PORT = 8794;
const CONTROL_URL = `http://127.0.0.1:${CONTROL_PORT}`;
const SIM_URL = `http://127.0.0.1:${SIM_PORT}`;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForPhase(page, phase, timeout = 9000) {
  await waitFor(page, (expected) => window.__TEST_API?.getGamePhase?.() === expected, { timeout }, phase);
}

async function tap(page, code, key) {
  await dispatchKey(page, code, key);
  await sleep(120);
}

async function bootstrapCleanPage(page) {
  await page.evaluate(() => localStorage.clear());
  await page.reload({ waitUntil: "domcontentloaded" });
  await sleep(2000);
}

async function getJson(url) {
  const response = await fetch(url);
  const body = await response.json();
  if (!response.ok || body.ok === false) {
    throw new Error(body.error || `GET ${url} failed (${response.status})`);
  }
  return body;
}

async function runRemoteEntryFlow(page) {
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
  console.log(`\n=== INFRA SMOKE TESTS (${htmlFile}) ===\n`);

  const runner = new TestRunner("InfraSmoke");
  await startServer();
  await startControlPlane(CONTROL_PORT);
  await startSimServer(SIM_PORT, {
    env: {
      LBH_CONTROL_PLANE_URL: CONTROL_URL,
      LBH_SIM_INSTANCE_ID: "sim-infra-smoke",
    },
  });

  let browser;
  let page;

  try {
    await runner.run("Control plane and sim boot with explicit process identity", async () => {
      const controlHealth = await getJson(`${CONTROL_URL}/health`);
      assert(Array.isArray(controlHealth.simInstances), "Expected control-plane sim registry");

      const simHealth = await getJson(`${SIM_URL}/health`);
      assert(simHealth.simInstanceId === "sim-infra-smoke", `Unexpected sim instance id: ${simHealth.simInstanceId}`);
      assert(simHealth.controlPlaneUrl === CONTROL_URL, `Unexpected control plane url: ${simHealth.controlPlaneUrl}`);

      const registered = controlHealth.simInstances.find((entry) => entry.simInstanceId === "sim-infra-smoke");
      assert(registered, "Expected sim instance registered in control plane");
    });

    ({ browser, page } = await launchGame(`${htmlFile}?simServer=${encodeURIComponent(SIM_URL)}`));
    await bootstrapCleanPage(page);

    await runner.run("Remote-capable client boots cleanly against sim stack", async () => {
      const net = await page.evaluate(() => window.__TEST_API.getNetworkState());
      assert(net.simEnabled === true, "Expected sim client enabled");
      assert(net.simUrl === SIM_URL, `Unexpected sim url: ${net.simUrl}`);
      assert(net.remoteAuthorityActive === false, "Expected remote authority inactive before run start");
    });

    await runner.run("Real remote launch path reaches authoritative gameplay", async () => {
      await runRemoteEntryFlow(page);

      await waitFor(page, () => {
        const net = window.__TEST_API.getNetworkState();
        return net.remoteAuthorityActive && typeof net.remoteTick === "number";
      }, { timeout: 12000 });

      const net = await page.evaluate(() => window.__TEST_API.getNetworkState());
      assert(net.sessionStatus === "running", `Expected running session, got ${net.sessionStatus}`);
      assert(net.sessionIsHost === true, "Expected first client to become host");
      assert(net.sessionMapId === "shallows", `Expected shallows session, got ${net.sessionMapId}`);
    });

    const filepath = await screenshot(page, "infra-smoke");
    console.log(`\n  Screenshot: ${filepath}`);
  } finally {
    if (browser) await browser.close();
    await stopSimServer(SIM_PORT).catch(() => null);
    await stopControlPlane(CONTROL_PORT).catch(() => null);
    stopServer();
  }

  const ok = runner.summary();
  process.exit(ok ? 0 : 1);
}

run().catch(async (error) => {
  console.error("Infra smoke fatal error:", error.message);
  try { await stopSimServer(SIM_PORT); } catch {}
  try { await stopControlPlane(CONTROL_PORT); } catch {}
  stopServer();
  process.exit(1);
});
