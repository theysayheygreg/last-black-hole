const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const {
  startSimServer, stopSimServer,
  launchGame, withQuery,
} = require('./helpers.cjs');

const ROOT = path.resolve(__dirname, '..');
const STATIC_PORT = 8836;
const SIM_PORT = 8837;
const SIM_URL = `http://127.0.0.1:${SIM_PORT}`;
const OUTPUT_DIR = path.join(__dirname, 'screenshots', 'ruler-live-20260714');
const CAPTURE_PATH = path.join(OUTPUT_DIR, 'movement-slingshot-overlay.png');

function sleep(ms) { return new Promise((resolve) => setTimeout(resolve, ms)); }

function activeForceNames(player) {
  return Object.entries(player?.forceLedger?.vectors || {})
    .filter(([, vector]) => Math.hypot(Number(vector.x) || 0, Number(vector.y) || 0) > 0.01)
    .map(([name]) => name);
}

async function startStaticServer() {
  const child = spawn(process.execPath, [
    path.join(ROOT, 'scripts', 'static-server.cjs'),
    '--host', '127.0.0.1', '--port', String(STATIC_PORT), '--root', ROOT,
    '--pid-file', path.join(ROOT, 'tmp', `ruler-static-${STATIC_PORT}.pid`),
    '--meta-file', path.join(ROOT, 'tmp', `ruler-static-${STATIC_PORT}.json`),
    '--label', 'lbh-ruler-live',
  ], { cwd: ROOT, stdio: 'ignore' });
  await waitFor(async () => {
    try { return (await fetch(`http://127.0.0.1:${STATIC_PORT}/index-a.html`)).ok; }
    catch { return false; }
  }, Boolean, 'dedicated static server');
  return child;
}

async function waitFor(read, predicate, label, timeout = 10000) {
  const deadline = Date.now() + timeout;
  let value;
  while (Date.now() < deadline) {
    value = await read();
    if (predicate(value)) return value;
    await sleep(100);
  }
  throw new Error(`Timed out waiting for ${label}: ${JSON.stringify(value)}`);
}

async function snapshot() {
  const response = await fetch(`${SIM_URL}/snapshot`);
  if (!response.ok) throw new Error(`Snapshot failed: ${response.status}`);
  return response.json();
}

async function placePlayer(clientId, body) {
  const response = await fetch(`${SIM_URL}/debug/player-state`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ clientId, ...body }),
  });
  if (!response.ok) throw new Error(`Player placement failed: ${response.status}`);
  return response.json();
}

(async () => {
  let browser;
  let staticServer;
  try {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
    staticServer = await startStaticServer();
    await startSimServer(SIM_PORT, { keepAlive: true, idleShutdownMs: 5000 });
    const launched = await launchGame(withQuery(
      `http://127.0.0.1:${STATIC_PORT}/index-a.html`,
      { simServer: SIM_URL },
    ));
    browser = launched.browser;
    const page = launched.page;
    await page.setViewport({ width: 1280, height: 800, deviceScaleFactor: 1 });
    try {
      await waitFor(
        () => page.evaluate(() => Boolean(window.__TEST_API?.createTestProfile)),
        Boolean,
        `test API boot${launched.errors.length ? ` (${launched.errors.join('; ')})` : ''}`,
        12000,
      );
    } catch (error) {
      const boot = await page.evaluate(() => ({
        state: window.__LBH_BOOT_STATE__, flags: window.__LBH_BUILD_FLAGS__,
        errors: [...document.querySelectorAll('body > div')].map((node) => node.textContent).filter((text) => /error/i.test(text)),
      }));
      throw new Error(`${error.message}; boot=${JSON.stringify(boot)}`);
    }
    await page.evaluate(() => {
      localStorage.clear();
      window.__TEST_API.createTestProfile('Ruler Pilot');
    });
    await page.evaluate(() => window.__TEST_API.startRemoteGameNow(0));

    const network = await waitFor(
      () => page.evaluate(() => window.__TEST_API.getNetworkState()),
      (value) => value?.remoteAuthorityActive && value.clientId,
      'remote authority',
      12000,
    );
    const initial = await snapshot();
    const well = initial.world.wells[0];
    const worldScale = initial.session.worldScale;
    const wx = (well.wx + 0.24) % worldScale;
    await placePlayer(network.clientId, {
      wx, wy: well.wy, vx: 0, vy: 0.24, deltaV: 80, resetSlingshot: true,
    });
    await page.evaluate(() => {
      window.__TEST_API.setConfig('debug.showRulerOverlay', true);
      window.__TEST_API.setConfig('ui.motion.reduced', true);
    });
    await sleep(350);
    await page.keyboard.press('KeyF');

    await waitFor(
      async () => (await snapshot()).players.find((player) => player.clientId === network.clientId),
      (player) => player?.slingshot?.engaged === true,
      'authoritative slingshot engage',
    );
    await page.keyboard.down('KeyW');
    const overlay = await waitFor(
      () => page.evaluate(() => window.__TEST_API.getRulerOverlayStats()),
      (value) => value?.enabled && value.handlerCount === 11 && value.forceTick != null,
      'live ruler handler and force facts',
    );
    const player = await waitFor(
      async () => (await snapshot()).players.find((entry) => entry.clientId === network.clientId),
      (value) => value?.slingshot?.engaged === true && activeForceNames(value).length > 0,
      'live slingshot and movement force evidence',
    );
    const activeForces = activeForceNames(player);
    await page.screenshot({ path: CAPTURE_PATH });
    await page.keyboard.up('KeyW');

    console.log(JSON.stringify({
      capturePath: CAPTURE_PATH,
      handlers: overlay.handlerCount,
      forceTick: overlay.forceTick,
      slingshotEngaged: player.slingshot.engaged,
      speed: Math.hypot(player.vx, player.vy),
      activeForces,
      geometry: overlay.geometry,
      reducedMotion: overlay.reducedMotion,
      browserErrors: launched.errors,
    }, null, 2));
    if (launched.errors.length) throw new Error(`Browser errors: ${launched.errors.join('; ')}`);
  } finally {
    if (browser) await browser.close().catch(() => null);
    await stopSimServer(SIM_PORT).catch(() => null);
    staticServer?.kill('SIGTERM');
  }
})().catch((error) => {
  console.error(error.stack || error.message);
  process.exit(1);
});
