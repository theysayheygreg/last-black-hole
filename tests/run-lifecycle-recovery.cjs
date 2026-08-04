/**
 * Player-facing run lifecycle smoke.
 *
 * A local run may end while its player is still reading the result screen.
 * The local launcher must keep the authority alive through Home so the next
 * normal map-select launch owns exactly one fresh run. This stays narrow: it
 * exercises the menu path and server lifecycle, not movement or rendering.
 */
const fs = require('fs');
const path = require('path');
const {
  startServer,
  stopServer,
  startSimServer,
  stopSimServer,
  launchGame,
  TestRunner,
  assert,
  dispatchKey,
  waitFor,
  withQuery,
} = require('./helpers.cjs');
const { MODES } = require('../scripts/stack.cjs');

const ROOT = path.resolve(__dirname, '..');
const htmlFile = process.argv[2] || 'index-a.html?renderer=three';
const PORT = Number(process.env.LBH_RUN_LIFECYCLE_SIM_PORT || (9650 + process.pid % 200));
const SIM_URL = `http://127.0.0.1:${PORT}`;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function request(route, options = {}) {
  const response = await fetch(`${SIM_URL}${route}`, options);
  const body = await response.json().catch(() => ({}));
  return { status: response.status, body };
}

async function post(route, payload) {
  return request(route, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload),
  });
}

async function waitForPhase(page, phase, timeout = 10000) {
  try {
    await waitFor(page, (expected) => window.__TEST_API?.getGamePhase?.() === expected, { timeout }, phase);
  } catch (error) {
    const observed = await page.evaluate(() => ({
      phase: window.__TEST_API?.getGamePhase?.() || null,
      testApi: Boolean(window.__TEST_API),
    })).catch(() => ({ phase: null, testApi: false }));
    throw new Error(`Expected phase ${phase}, observed ${JSON.stringify(observed)}: ${error.message}`);
  }
}

async function tap(page, code = 'Enter', key = 'Enter') {
  await dispatchKey(page, code, key);
  await sleep(120);
}

async function launchThroughMenu(page) {
  await waitForPhase(page, 'title');
  await sleep(600);
  await tap(page, 'Space', ' ');
  await waitForPhase(page, 'profileSelect');
  await tap(page);
  await tap(page);
  await waitForPhase(page, 'home');

  for (let attempt = 0; attempt < 8; attempt += 1) {
    const tab = await page.evaluate(() => window.__TEST_API?.getHomeState?.().tabName);
    if (tab === 'LAUNCH') break;
    await tap(page, 'KeyE', 'e');
  }
  const tab = await page.evaluate(() => window.__TEST_API?.getHomeState?.().tabName);
  assert(tab === 'LAUNCH', `Expected LAUNCH tab, got ${tab}`);
  await tap(page);
  await waitForPhase(page, 'mapSelect');
  await sleep(250);
  await tap(page);
  await waitForPhase(page, 'playing', 15000);
}

async function launchSecondRunThroughMenu(page) {
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const tab = await page.evaluate(() => window.__TEST_API?.getHomeState?.().tabName);
    if (tab === 'LAUNCH') break;
    await tap(page, 'KeyE', 'e');
  }
  const tab = await page.evaluate(() => window.__TEST_API?.getHomeState?.().tabName);
  assert(tab === 'LAUNCH', `Expected LAUNCH tab on return Home, got ${tab}`);
  await tap(page);
  await waitForPhase(page, 'mapSelect');
  await sleep(250);
  await tap(page);
  await waitForPhase(page, 'playing', 15000);
}

async function bootstrap(page) {
  await page.evaluate(() => localStorage.clear());
  await page.reload({ waitUntil: 'domcontentloaded' });
  try {
    await waitFor(page, () => Boolean(window.__TEST_API?.getGamePhase), { timeout: 5000 });
  } catch (error) {
    const diagnostics = page.getDiagnostics?.() || [];
    throw new Error(`Game test API did not boot: ${error.message}; diagnostics=${JSON.stringify(diagnostics.slice(-12))}`);
  }
}

async function run() {
  const runner = new TestRunner('RunLifecycleRecovery');

  await runner.run('Local player launch pins the same authority lifetime as the packaged app', () => {
    assert(
      JSON.stringify(MODES['local-host']?.serviceArgs?.sim) === JSON.stringify(['--keep-alive', 'true']),
      'Expected local-host authority to survive terminal result and Home',
    );
    const playSource = fs.readFileSync(path.join(ROOT, 'scripts', 'play.cjs'), 'utf8');
    assert(
      playSource.includes("startService('sim', LOCAL_PLAY_SIM_ARGS)"),
      'Expected the fresh npm play sim restart to retain the local lifetime args',
    );
  });

  await startServer();
  let browser;
  try {
    await runner.run('Death return Home starts one fresh playable authority run', async () => {
      await startSimServer(PORT, { keepAlive: true });
      const launched = await launchGame(withQuery(htmlFile, { simServer: SIM_URL }));
      browser = launched.browser;
      const { page, errors } = launched;
      await bootstrap(page);
      await launchThroughMenu(page);

      const firstNetwork = await page.evaluate(() => window.__TEST_API?.getNetworkState?.() || null);
      assert(firstNetwork?.clientId, 'Expected active client identity in first run');
      const firstHealth = await request('/health');
      const firstRunId = firstHealth.body.session?.runId;
      assert(firstHealth.status === 200 && firstRunId, 'Expected first running authority session');

      const death = await post('/debug/player-state', {
        clientId: firstNetwork.clientId,
        status: 'dead',
        cause: 'lifecycle-smoke',
      });
      assert(death.status === 200, `Expected controlled death setup, got ${death.status}`);
      await waitForPhase(page, 'dead');
      await sleep(4500); // Result screen's deliberate continue lock.
      await tap(page, 'Space', ' ');
      await waitForPhase(page, 'home', 12000);

      const homeHealth = await request('/health');
      assert(homeHealth.status === 200, 'Authority exited before Home could launch a new run');
      assert(homeHealth.body.idleState?.keepAlive === true, 'Expected persistent local player authority');

      await launchSecondRunThroughMenu(page);
      const secondHealth = await request('/health');
      const secondRunId = secondHealth.body.session?.runId;
      assert(secondHealth.status === 200 && secondHealth.body.session?.status === 'running', 'Expected second run to be running');
      assert(secondRunId && secondRunId !== firstRunId, 'Expected Home launch to create a fresh run identity');
      assert(secondHealth.body.idleState?.humanPlayerCount === 1, 'Expected exactly one human in the new run');
      assert(errors.length === 0, `Unexpected browser errors: ${errors.join(' | ')}`);
    });
  } finally {
    if (browser) await browser.close().catch(() => null);
    await stopSimServer(PORT).catch(() => null);
    stopServer();
  }

  process.exit(runner.summary() ? 0 : 1);
}

run().catch((error) => {
  console.error(error.stack || error.message);
  process.exit(1);
});
