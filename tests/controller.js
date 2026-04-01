/**
 * controller.js — synthetic gamepad coverage for local and remote paths.
 *
 * Usage: node tests/controller.js [index-a.html]
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
  waitFor,
} = require('./helpers');

const htmlFile = process.argv[2] || 'index-a.html';
const SIM_PORT = 8789;
const SIM_URL = `http://127.0.0.1:${SIM_PORT}`;

function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

async function getSnapshot() {
  const response = await fetch(`${SIM_URL}/snapshot`);
  return response.json();
}

async function waitForSnapshotPlayer(clientId, predicate, { timeout = 5000, interval = 100 } = {}) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    const snapshot = await getSnapshot();
    const player = snapshot.players?.find((entry) => entry.clientId === clientId);
    if (player && predicate(player, snapshot)) return { player, snapshot };
    await sleep(interval);
  }
  throw new Error('Timed out waiting for authoritative snapshot state');
}

async function waitForPhase(page, phase, timeout = 9000) {
  await waitFor(page, (expected) => window.__TEST_API?.getGamePhase?.() === expected, { timeout }, phase);
}

async function bootstrapCleanPage(page) {
  await page.evaluate(() => localStorage.clear());
  await page.reload({ waitUntil: 'domcontentloaded' });
  await sleep(2000);
}

async function installVirtualGamepad(page) {
  await page.evaluate(() => {
    const buttonTemplate = () => ({ pressed: false, touched: false, value: 0 });
    const buildPad = () => ({
      id: 'LBH Virtual Pad',
      index: 0,
      connected: true,
      mapping: 'standard',
      axes: [0, 0, 0, 0, -1, -1],
      buttons: Array.from({ length: 18 }, buttonTemplate),
      timestamp: Date.now(),
    });
    window.__TEST_GAMEPAD = buildPad();
    const getter = () => [window.__TEST_GAMEPAD];
    Object.defineProperty(Navigator.prototype, 'getGamepads', {
      configurable: true,
      value: getter,
    });
  });
}

async function setGamepadAxes(page, axes = []) {
  await page.evaluate((nextAxes) => {
    const gp = window.__TEST_GAMEPAD;
    const defaults = [0, 0, 0, 0, -1, -1];
    const normalized = Array.from({ length: 6 }, (_, index) => {
      return Number(nextAxes[index] ?? defaults[index]);
    });
    gp.axes = normalized;
    gp.timestamp = Date.now();
  }, axes);
}

async function setGamepadButton(page, buttonIndex, pressed, value = null) {
  await page.evaluate(({ buttonIndex, pressed, value }) => {
    const gp = window.__TEST_GAMEPAD;
    const nextValue = value === null ? (pressed ? 1 : 0) : value;
    gp.buttons[buttonIndex] = {
      pressed: Boolean(pressed),
      touched: Boolean(pressed),
      value: Number(nextValue),
    };
    gp.timestamp = Date.now();
  }, { buttonIndex, pressed, value });
}

async function tapGamepadButton(page, buttonIndex, { holdMs = 90, value = null } = {}) {
  await setGamepadButton(page, buttonIndex, true, value);
  await sleep(holdMs);
  await setGamepadButton(page, buttonIndex, false, 0);
  await sleep(140);
}

async function holdGamepad(page, { axes = null, buttons = [] } = {}, holdMs = 500) {
  if (axes) await setGamepadAxes(page, axes);
  for (const button of buttons) {
    await setGamepadButton(page, button.index, true, button.value ?? null);
  }
  await sleep(holdMs);
  if (axes) await setGamepadAxes(page, [0, 0, 0, 0, -1, -1]);
  for (const button of buttons) {
    await setGamepadButton(page, button.index, false, 0);
  }
  await sleep(160);
}

async function enterLocalRunWithGamepad(page) {
  await waitForPhase(page, 'title');
  await tapGamepadButton(page, 0); // confirm -> profileSelect
  await waitForPhase(page, 'profileSelect');
  await tapGamepadButton(page, 0); // create/select
  await tapGamepadButton(page, 0); // confirm generated name if needed
  await waitForPhase(page, 'home');
  await tapGamepadButton(page, 5); // tab right
  await tapGamepadButton(page, 5); // tab right
  await tapGamepadButton(page, 5); // tab right -> launch
  await tapGamepadButton(page, 0); // open map select
  await waitForPhase(page, 'mapSelect');
  await tapGamepadButton(page, 0); // launch first map
  await waitForPhase(page, 'playing', 12000);
}

async function enterRemoteRunWithGamepad(page, { hullType = 'breacher' } = {}) {
  await waitForPhase(page, 'title');
  await tapGamepadButton(page, 0);
  await waitForPhase(page, 'profileSelect');
  await tapGamepadButton(page, 0);
  await tapGamepadButton(page, 0);
  await waitForPhase(page, 'home');
  await page.evaluate((nextHullType) => {
    window.__TEST_API.setProfileShipType(nextHullType);
    window.__TEST_API.seedProfileConsumable(0, {
      name: 'Test Shield',
      category: 'artifact',
      subcategory: 'consumable',
      tier: 'rare',
      value: 300,
      useEffect: 'shieldBurst',
      useDesc: 'test',
      charges: 1,
    });
  }, hullType);
  await tapGamepadButton(page, 5);
  await tapGamepadButton(page, 5);
  await tapGamepadButton(page, 5);
  await tapGamepadButton(page, 0);
  await waitForPhase(page, 'mapSelect');
  await tapGamepadButton(page, 0);
  await waitForPhase(page, 'playing', 12000);
  await waitFor(page, () => {
    const net = window.__TEST_API.getNetworkState();
    return net.simEnabled && net.remoteAuthorityActive && typeof net.remoteTick === 'number';
  }, { timeout: 12000 });
}

async function run() {
  console.log(`\n=== CONTROLLER TESTS (${htmlFile}) ===\n`);

  const runner = new TestRunner('Controller');
  await startServer();
  await startSimServer(SIM_PORT);

  let browser, page;
  let browserRemote, pageRemote;

  try {
    ({ browser, page } = await launchGame(htmlFile));
    await bootstrapCleanPage(page);
    await installVirtualGamepad(page);

    await runner.run('Synthetic gamepad reaches gameplay and moves locally', async () => {
      await enterLocalRunWithGamepad(page);
      const before = await page.evaluate(() => window.__TEST_API.getShipPos());
      await setGamepadAxes(page, [1, 0, 0, 0, 0, 0]);
      await setGamepadButton(page, 7, true, 1);
      await waitFor(page, () => {
        const input = window.__TEST_API.getInputState();
        return input && input.lastInputSource === 'gamepad' && input.thrustIntensity > 0.9;
      }, { timeout: 3000 });
      await sleep(900);
      await setGamepadButton(page, 7, false, 0);
      await setGamepadAxes(page, [0, 0, 0, 0, 0, 0]);
      await sleep(180);
      const after = await page.evaluate(() => ({
        pos: window.__TEST_API.getShipPos(),
        inventory: window.__TEST_API.getInventory(),
      }));
      const moved = Math.hypot(after.pos.x - before.x, after.pos.y - before.y);
      assert(moved > 0.005, `Expected local controller movement, got ${moved}`);

      await tapGamepadButton(page, 17); // inventory open
      await waitFor(page, () => window.__TEST_API.getInventory()?.open === true, { timeout: 3000 });
      await tapGamepadButton(page, 1); // back/close
      await waitFor(page, () => window.__TEST_API.getInventory()?.open === false, { timeout: 3000 });
    });

    ({ browser: browserRemote, page: pageRemote } = await launchGame(`${htmlFile}?simServer=${encodeURIComponent(SIM_URL)}`));
    await bootstrapCleanPage(pageRemote);
    await installVirtualGamepad(pageRemote);

    await runner.run('Synthetic gamepad drives remote gameplay input, brake, inventory, and ability', async () => {
      await enterRemoteRunWithGamepad(pageRemote, { hullType: 'breacher' });

      await tapGamepadButton(pageRemote, 17); // inventory open
      await waitFor(pageRemote, () => window.__TEST_API.getInventory()?.open === true, { timeout: 3000 });
      await holdGamepad(pageRemote, {
        axes: [1, 0, 0, 0, 0, 0],
        buttons: [{ index: 7, value: 1 }],
      }, 350);
      await waitFor(pageRemote, () => {
        const net = window.__TEST_API.getNetworkState();
        return net.lastRemoteInput && net.lastRemoteInput.thrust === 0 && net.lastRemoteInput.moveX === 0;
      }, { timeout: 3000 });

      await tapGamepadButton(pageRemote, 1); // close inventory
      await waitFor(pageRemote, () => window.__TEST_API.getInventory()?.open === false, { timeout: 3000 });

      await setGamepadButton(pageRemote, 6, true, 1);
      await sleep(220);
      await waitFor(pageRemote, () => {
        const net = window.__TEST_API.getNetworkState();
        return net.lastRemoteInput && net.lastRemoteInput.brake > 0.9;
      }, { timeout: 3000 });
      await setGamepadButton(pageRemote, 6, false, 0);
      await sleep(160);

      await setGamepadButton(pageRemote, 4, true, 1); // ability1 -> burn for breacher
      const net = await pageRemote.evaluate(() => window.__TEST_API.getNetworkState());
      const { player } = await waitForSnapshotPlayer(
        net.clientId,
        (remotePlayer) => Boolean(remotePlayer.abilityState?.burnActive),
        { timeout: 5000, interval: 120 }
      );
      await setGamepadButton(pageRemote, 4, false, 0);
      await sleep(160);
      assert(player.abilityState?.burnActive === true, 'Expected controller ability1 to toggle burn remotely');
    });

    const localShot = await screenshot(page, 'controller-local');
    const remoteShot = await screenshot(pageRemote, 'controller-remote');
    console.log(`\n  Local screenshot: ${localShot}`);
    console.log(`  Remote screenshot: ${remoteShot}`);
  } finally {
    if (browser) await browser.close();
    if (browserRemote) await browserRemote.close();
    await stopSimServer(SIM_PORT).catch(() => null);
    stopServer();
  }

  const allPassed = runner.summary();
  process.exit(allPassed ? 0 : 1);
}

run().catch((err) => {
  console.error('Controller test fatal error:', err.message);
  stopServer();
  stopSimServer(SIM_PORT).catch(() => null).finally(() => process.exit(1));
});
