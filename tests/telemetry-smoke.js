/**
 * telemetry-smoke.js — structured runtime telemetry canary.
 *
 * Verifies that the real distributed stack emits the telemetry events the
 * harness and operators now rely on for diagnosis.
 *
 * Usage: node tests/telemetry-smoke.js [index-a.html]
 */
const {
  startServer,
  stopServer,
  startControlPlane,
  stopControlPlane,
  startSimServer,
  stopSimServer,
  launchGame,
  TestRunner,
  assert,
  dispatchKey,
  waitFor,
  harnessLogFile,
  simLogFile,
  controlPlaneLogFile,
  waitForLogEvent,
} = require("./helpers");

const htmlFile = process.argv[2] || "index-a.html";
const CONTROL_PORT = 8795;
const SIM_PORT = 8796;
const CONTROL_URL = `http://127.0.0.1:${CONTROL_PORT}`;
const SIM_URL = `http://127.0.0.1:${SIM_PORT}`;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForPhase(page, phase, timeout = 12000) {
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
  await waitForPhase(page, "playing", 15000);
}

async function run() {
  console.log(`\n=== TELEMETRY SMOKE TESTS (${htmlFile}) ===\n`);

  const runner = new TestRunner("TelemetrySmoke");
  await startServer();
  await startControlPlane(CONTROL_PORT);
  await startSimServer(SIM_PORT, {
    env: {
      LBH_CONTROL_PLANE_URL: CONTROL_URL,
      LBH_SIM_INSTANCE_ID: "sim-telemetry-smoke",
    },
  });

  const harnessLog = harnessLogFile();
  const controlLog = controlPlaneLogFile(CONTROL_PORT);
  const simLog = simLogFile(SIM_PORT);

  let browser;
  let page;

  try {
    await runner.run("Runtime boot emits structured started events", async () => {
      const [devStarted, controlStarted, simStarted] = await Promise.all([
        waitForLogEvent(harnessLog, (event) => event.event === "runtime.started" && event.component === "dev-server"),
        waitForLogEvent(controlLog, (event) => event.event === "runtime.started" && event.component === "control-plane"),
        waitForLogEvent(simLog, (event) => event.event === "runtime.started" && event.component === "sim"),
      ]);

      assert(devStarted.url === "http://127.0.0.1:8719/", `Unexpected harness runtime url: ${devStarted.url}`);
      assert(controlStarted.url === CONTROL_URL + "/", `Unexpected control-plane url: ${controlStarted.url}`);
      assert(simStarted.url === SIM_URL + "/", `Unexpected sim url: ${simStarted.url}`);
    });

    ({ browser, page } = await launchGame(`${htmlFile}?simServer=${encodeURIComponent(SIM_URL)}`));
    await bootstrapCleanPage(page);

    await runner.run("Remote entry flow emits profile and session telemetry", async () => {
      await runRemoteEntryFlow(page);

      const [profileBootstrapped, sessionStarted, playerJoined] = await Promise.all([
        waitForLogEvent(controlLog, (event) => event.event === "profile.bootstrapped" && !!event.profileId, { timeout: 10000 }),
        waitForLogEvent(simLog, (event) => event.event === "session.started" && event.mapId === "shallows", { timeout: 10000 }),
        waitForLogEvent(simLog, (event) => event.event === "player.joined" && event.mapId === "shallows", { timeout: 10000 }),
      ]);

      assert(profileBootstrapped.hasSnapshot === true, "Expected profile bootstrap to include snapshot hydration");
      assert(typeof sessionStarted.sessionId === "string" && sessionStarted.sessionId.length > 0, "Expected session.started to include sessionId");
      assert(typeof playerJoined.clientId === "string" && playerJoined.clientId.length > 0, "Expected player.joined to include clientId");
    });

    await runner.run("Remote client reaches authoritative play while telemetry remains usable", async () => {
      await waitFor(page, () => {
        const net = window.__TEST_API.getNetworkState();
        return net.remoteAuthorityActive && typeof net.remoteTick === "number" && net.remoteTick > 0;
      }, { timeout: 12000 });

      const net = await page.evaluate(() => window.__TEST_API.getNetworkState());
      assert(net.sessionStatus === "running", `Expected running remote session, got ${net.sessionStatus}`);
      assert(net.sessionMapId === "shallows", `Expected shallows session, got ${net.sessionMapId}`);
    });
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
  console.error("Telemetry smoke fatal error:", error.message);
  try { await stopSimServer(SIM_PORT); } catch {}
  try { await stopControlPlane(CONTROL_PORT); } catch {}
  stopServer();
  process.exit(1);
});
