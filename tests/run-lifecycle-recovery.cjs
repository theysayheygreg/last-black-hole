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
const { MODES, startLocalHostSim } = require('../scripts/stack.cjs');

const ROOT = path.resolve(__dirname, '..');
const htmlFile = process.argv[2] || 'index-a.html?renderer=three';
const PORT = Number(process.env.LBH_RUN_LIFECYCLE_SIM_PORT || (9650 + process.pid % 200));
const SIM_URL = `http://127.0.0.1:${PORT}`;
const UNPINNED_PORT = PORT + 1;
const PINNED_PORT = PORT + 2;

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

async function requestAt(port, route, options = {}) {
  const response = await fetch(`http://127.0.0.1:${port}${route}`, options);
  return { status: response.status, body: await response.json().catch(() => ({})) };
}

async function postAt(port, route, payload) {
  return requestAt(port, route, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload),
  });
}

async function waitForHealthAt(port, predicate, timeout = 5000) {
  const deadline = Date.now() + timeout;
  let last = null;
  while (Date.now() < deadline) {
    try {
      last = await requestAt(port, '/health');
      if (predicate(last)) return last;
    } catch (error) {
      last = { error };
    }
    await sleep(60);
  }
  throw new Error(`Timed out waiting for sim health on ${port}: ${last?.error?.message || JSON.stringify(last?.body || null)}`);
}

async function startAndEndTerminalRun(port, clientId) {
  const start = await postAt(port, '/session/start', {
    mapId: 'shallows', requesterId: clientId, requesterName: clientId,
  });
  assert(start.status === 200, `Expected start on ${port}, got ${start.status}`);
  const join = await postAt(port, '/join', {
    clientId,
    runId: start.body.session?.runId,
    joinTicket: start.body.joinTicket,
    name: clientId,
  });
  assert(join.status === 200, `Expected join on ${port}, got ${join.status}`);
  const death = await postAt(port, '/debug/player-state', {
    clientId, status: 'dead', cause: 'lifecycle-smoke',
  });
  assert(death.status === 200, `Expected terminal setup on ${port}, got ${death.status}`);
  await waitForHealthAt(port, (result) => result.status === 200 && result.body.session?.status === 'ended');
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

async function launchSecondRunThroughMenu(page, mapIndex = 0) {
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
  for (let index = 0; index < mapIndex; index += 1) {
    await tap(page, 'ArrowDown', 'ArrowDown');
  }
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

  await runner.run('Local player launch replaces a managed unpinned sim before starting', async () => {
    assert(
      JSON.stringify(MODES['local-host']?.serviceArgs?.sim) === JSON.stringify(['--keep-alive', 'true']),
      'Expected local-host authority to survive terminal result and Home',
    );
    const restartCalls = [];
    await startLocalHostSim({
      healthFetcher: async () => ({ idleState: { keepAlive: false } }),
      stop: (name) => { restartCalls.push(`stop:${name}`); return 'stopped'; },
      start: (name, args) => { restartCalls.push(`start:${name}:${args.join(' ')}`); return 'started'; },
    });
    assert(
      restartCalls.join('|') === 'stop:sim|start:sim:--keep-alive true',
      `Expected managed unpinned sim replacement, got ${restartCalls.join('|')}`,
    );
    const pinnedCalls = [];
    await startLocalHostSim({
      healthFetcher: async () => ({ idleState: { keepAlive: true } }),
      stop: () => { pinnedCalls.push('stop'); return 'stopped'; },
      start: (name, args) => { pinnedCalls.push(`start:${name}:${args.join(' ')}`); return 'started'; },
    });
    assert(
      pinnedCalls.join('|') === 'start:sim:--keep-alive true',
      `Expected pinned sim reuse, got ${pinnedCalls.join('|')}`,
    );
    const playSource = fs.readFileSync(path.join(ROOT, 'scripts', 'play.cjs'), 'utf8');
    assert(
      playSource.includes("startService('sim', LOCAL_PLAY_SIM_ARGS)"),
      'Expected the fresh npm play sim restart to retain the local lifetime args',
    );
  });

  await runner.run('Unpinned terminal sim retires while pinned player sim survives the same grace', async () => {
    const terminalEnv = { LBH_SIM_TERMINAL_GRACE_MS: '300' };
    await startSimServer(UNPINNED_PORT, { env: terminalEnv });
    try {
      await startAndEndTerminalRun(UNPINNED_PORT, 'unpinned-terminal');
      await sleep(700);
      let stopped = false;
      try {
        await requestAt(UNPINNED_PORT, '/health');
      } catch {
        stopped = true;
      }
      assert(stopped, 'Expected unpinned terminal sim to retire after its grace period');
    } finally {
      await stopSimServer(UNPINNED_PORT).catch(() => null);
    }

    await startSimServer(PINNED_PORT, { keepAlive: true, env: terminalEnv });
    try {
      await startAndEndTerminalRun(PINNED_PORT, 'pinned-terminal');
      await sleep(700);
      const health = await requestAt(PINNED_PORT, '/health');
      assert(health.status === 200, 'Expected pinned terminal sim to remain available');
      assert(health.body.idleState?.keepAlive === true, 'Expected keepAlive truth after terminal grace');
    } finally {
      await stopSimServer(PINNED_PORT).catch(() => null);
    }
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

      await launchSecondRunThroughMenu(page, 1);
      const secondHealth = await request('/health');
      const secondRunId = secondHealth.body.session?.runId;
      assert(secondHealth.status === 200 && secondHealth.body.session?.status === 'running', 'Expected second run to be running');
      assert(secondRunId && secondRunId !== firstRunId, 'Expected Home launch to create a fresh run identity');
      assert(secondHealth.body.session?.mapId === 'expanse',
        `Expected selected expanse route, got ${secondHealth.body.session?.mapId || 'unknown'}`);
      assert(secondHealth.body.idleState?.humanPlayerCount === 1, 'Expected exactly one human in the new run');

      const restartSelection = await page.evaluate(async () => {
        window.__TEST_API.setMapSelectIndex(2);
        const expected = window.__TEST_API.getMapSelectSurvey();
        await window.__TEST_API.restart();
        return expected;
      });
      const restartedHealth = await request('/health');
      const restartedNetwork = await page.evaluate(() => window.__TEST_API.getNetworkState());
      assert(restartSelection?.entry?.id === 'deep-field',
        `Expected Deep Field briefing before restart, got ${restartSelection?.entry?.id || 'unknown'}`);
      assert(restartedHealth.body.session?.mapId === restartSelection.entry.id,
        `Expected authority map ${restartSelection.entry.id}, got ${restartedHealth.body.session?.mapId || 'unknown'}`);
      assert(restartedNetwork.remoteMapId === restartSelection.entry.id,
        `Expected client map ${restartSelection.entry.id}, got ${restartedNetwork.remoteMapId || 'unknown'}`);
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
