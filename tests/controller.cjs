/**
 * controller.js — synthetic gamepad coverage for local and remote paths.
 *
 * Usage: node tests/controller.js [index-a.html]
 */
const {
  startServer,
  stopServer,
  withFreshGame,
  withFreshSimServer,
  screenshot,
  TestRunner,
  assert,
  waitFor,
  withQuery,
  stepGameFrames,
} = require('./helpers.cjs');

const htmlFile = process.argv[2] || 'index-a.html';
const SIM_PORT = 8789;
const SIM_URL = `http://127.0.0.1:${SIM_PORT}`;

function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

async function getSnapshot() {
  const response = await fetch(`${SIM_URL}/snapshot`);
  return response.json();
}

async function postSim(path, body) {
  const response = await fetch(`${SIM_URL}${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
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

async function waitForLabeled(page, label, predicate, options = {}, ...args) {
  try {
    await waitFor(page, predicate, options, ...args);
  } catch (err) {
    let debug = null;
    try {
      debug = await page.evaluate(() => ({
        phase: window.__TEST_API?.getGamePhase?.() || null,
        input: window.__TEST_API?.getInputState?.() || null,
        network: window.__TEST_API?.getNetworkState?.() || null,
        inventory: window.__TEST_API?.getInventory?.() || null,
      }));
    } catch {}
    const suffix = debug ? ` state=${JSON.stringify(debug)}` : '';
    throw new Error(`${label}: ${err.message}${suffix}`);
  }
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

async function moveHomeTabWithGamepad(page, tabName) {
  const tabOrder = ['SHIP', 'VAULT', 'RIG', 'CHRONICLE', 'LAUNCH'];
  const targetIndex = tabOrder.indexOf(tabName);
  if (targetIndex < 0) throw new Error(`Unknown home tab ${tabName}`);
  for (let i = 0; i < tabOrder.length + 2; i++) {
    const current = await page.evaluate(() => window.__TEST_API.getHomeState());
    if (current.tabName === tabName) return;
    const currentIndex = Number.isInteger(current.tabIndex)
      ? current.tabIndex
      : tabOrder.indexOf(current.tabName);
    if (currentIndex < 0) break;
    const forward = (targetIndex - currentIndex + tabOrder.length) % tabOrder.length;
    const backward = (currentIndex - targetIndex + tabOrder.length) % tabOrder.length;
    await tapGamepadButton(page, forward <= backward ? 5 : 4);
  }
  const current = await page.evaluate(() => window.__TEST_API.getHomeState().tabName);
  throw new Error(`Expected home tab ${tabName}, got ${current}`);
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
  await moveHomeTabWithGamepad(page, 'LAUNCH');
  await tapGamepadButton(page, 0); // open map select
  await waitForPhase(page, 'mapSelect');
  await tapGamepadButton(page, 0); // launch first map
  await waitForPhase(page, 'playing', 12000);
}

async function enterMapSelectWithGamepad(page) {
  await waitForPhase(page, 'title');
  await tapGamepadButton(page, 0); // confirm -> profileSelect
  await waitForPhase(page, 'profileSelect');
  await tapGamepadButton(page, 0); // create/select
  await tapGamepadButton(page, 0); // confirm generated name if needed
  await waitForPhase(page, 'home');
  await moveHomeTabWithGamepad(page, 'LAUNCH');
  await tapGamepadButton(page, 0); // open map select
  await waitForPhase(page, 'mapSelect');
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
  await moveHomeTabWithGamepad(page, 'LAUNCH');
  await tapGamepadButton(page, 0);
  await waitForPhase(page, 'mapSelect');
  await tapGamepadButton(page, 0);
  await waitForPhase(page, 'playing', 12000);
  await waitForLabeled(page, 'remote authority activation', () => {
    const net = window.__TEST_API.getNetworkState();
    return net.simEnabled && net.remoteAuthorityActive && typeof net.remoteTick === 'number';
  }, { timeout: 12000 });
}

async function run() {
  console.log(`\n=== CONTROLLER TESTS (${htmlFile}) ===\n`);

  const runner = new TestRunner('Controller');
  await startServer();

  let localShot = null;
  let remoteShot = null;

  try {
    await runner.run('Synthetic gamepad rerolls the map seed from map select', async () => {
      await withFreshGame(htmlFile, async ({ page }) => {
        await bootstrapCleanPage(page);
        await installVirtualGamepad(page);
        await enterMapSelectWithGamepad(page);
        const before = await page.evaluate(() => window.__TEST_API.getMapSelectState());
        await tapGamepadButton(page, 2); // reroll seed
        await waitFor(page, (oldSeed) => window.__TEST_API.getMapSelectState().seed !== oldSeed, { timeout: 3000 }, before.seed);
        const after = await page.evaluate(() => window.__TEST_API.getMapSelectState());
        assert(after.phase === 'mapSelect', `Expected to remain in mapSelect, got ${after.phase}`);
        assert(after.seed !== before.seed, `Expected controller reroll to change seed ${before.seed}`);
      });
    });

    await runner.run('Synthetic gamepad reaches gameplay and moves locally', async () => {
      await withFreshGame(htmlFile, async ({ page }) => {
        await bootstrapCleanPage(page);
        await installVirtualGamepad(page);
        await enterLocalRunWithGamepad(page);
        const before = await page.evaluate(() => window.__TEST_API.getShipPos());
        await setGamepadAxes(page, [1, 0, 0, 0, 0, 0]);
        await setGamepadButton(page, 7, true, 1);
        await stepGameFrames(page, 8, 1 / 60);
        await waitForLabeled(page, 'local gamepad thrust input', () => {
          const input = window.__TEST_API.getInputState();
          return input && input.lastInputSource === 'gamepad' && input.thrustIntensity > 0.9;
        }, { timeout: 3000 });
        await stepGameFrames(page, 54, 1 / 60);
        const propulsion = await page.evaluate(() => window.__TEST_API.getThreeSceneState()?.ship || null);
        assert(propulsion?.thrusting === true && propulsion?.braking === false,
          `Three scene must publish delivered thrust state: ${JSON.stringify(propulsion)}`);
        await setGamepadButton(page, 7, false, 0);
        await setGamepadAxes(page, [0, 0, 0, 0, 0, 0]);
        await stepGameFrames(page, 12, 1 / 60);
        const coastPropulsion = await page.evaluate(() => window.__TEST_API.getThreeSceneState()?.ship || null);
        assert(coastPropulsion?.thrusting === false && coastPropulsion?.braking === false,
          `Three scene must clear delivered propulsion after release: ${JSON.stringify(coastPropulsion)}`);
        const after = await page.evaluate(() => ({
          pos: window.__TEST_API.getShipPos(),
          inventory: window.__TEST_API.getInventory(),
        }));
        const moved = Math.hypot(after.pos.x - before.x, after.pos.y - before.y);
        assert(moved > 0.005, `Expected local controller movement, got ${moved}`);

        await tapGamepadButton(page, 17); // inventory open
        await waitForLabeled(page, 'local inventory open', () => window.__TEST_API.getInventory()?.open === true, { timeout: 3000 });
        await tapGamepadButton(page, 1); // back/close
        await waitForLabeled(page, 'local inventory close', () => window.__TEST_API.getInventory()?.open === false, { timeout: 3000 });
        localShot = await screenshot(page, 'controller-local');
      });
    });

    await runner.run('Synthetic gamepad drives remote gameplay input, brake, inventory, and ability', async () => {
      await withFreshSimServer(SIM_PORT, async () => {
        await withFreshGame(withQuery(htmlFile, { simServer: SIM_URL }), async ({ page: pageRemote }) => {
          await bootstrapCleanPage(pageRemote);
          await installVirtualGamepad(pageRemote);
          await enterRemoteRunWithGamepad(pageRemote, { hullType: 'breacher' });

          await tapGamepadButton(pageRemote, 17); // inventory open
          await waitForLabeled(pageRemote, 'remote inventory open', () => window.__TEST_API.getInventory()?.open === true, { timeout: 3000 });
          await holdGamepad(pageRemote, {
            axes: [1, 0, 0, 0, 0, 0],
            buttons: [{ index: 7, value: 1 }],
          }, 350);
          await waitForLabeled(pageRemote, 'remote inventory suppresses action scalars', () => {
            const net = window.__TEST_API.getNetworkState();
            // Inventory suppresses action scalars but still preserves facing intent
            // so brake-only and ability packets can steer once the menu closes.
            return net.lastRemoteInput && net.lastRemoteInput.thrust === 0 && net.lastRemoteInput.brake === 0;
          }, { timeout: 3000 });

          await tapGamepadButton(pageRemote, 1); // close inventory
          await waitForLabeled(pageRemote, 'remote inventory close', () => window.__TEST_API.getInventory()?.open === false, { timeout: 3000 });

          await setGamepadButton(pageRemote, 6, true, 1);
          await sleep(220);
          await waitForLabeled(pageRemote, 'remote brake packet', () => {
            const net = window.__TEST_API.getNetworkState();
            return net.lastRemoteInput && net.lastRemoteInput.brake > 0.9;
          }, { timeout: 3000 });
          await setGamepadButton(pageRemote, 6, false, 0);
          await sleep(160);
          await waitFor(pageRemote, () => {
            const stats = window.__TEST_API.getPerfStats();
            return Number.isFinite(stats?.remoteInputAckRttMs) &&
              Number.isFinite(stats?.remoteInputToSnapshotMs);
          }, { timeout: 5000 });

          const slingshotNet = await pageRemote.evaluate(() => window.__TEST_API.getNetworkState());
          const snapshot = await getSnapshot();
          const well = snapshot.world?.wells?.[0];
          assert(well, 'Expected a well anchor for controller slingshot test');
          const ws = snapshot.session?.worldScale || 5;
          const moved = await postSim('/debug/player-state', {
            clientId: slingshotNet.clientId,
            wx: ((well.wx + 0.36) % ws + ws) % ws,
            wy: well.wy,
            vx: 0,
            vy: -0.35,
            deltaV: 40,
            status: 'alive',
            resetSlingshot: true,
          });
          assert(moved.ok === true, 'Expected debug placement for controller slingshot test');
          await setGamepadButton(pageRemote, 3, true, 1);
          const engaged = await waitForSnapshotPlayer(
            slingshotNet.clientId,
            (remotePlayer) => remotePlayer.slingshot?.engaged === true,
            { timeout: 5000, interval: 120 }
          );
          await setGamepadButton(pageRemote, 3, false, 0);
          assert(engaged.player.slingshot?.engaged === true, 'Expected controller slingshot to engage remotely');

          await setGamepadButton(pageRemote, 4, true, 1); // ability1 -> burn for breacher
          const net = await pageRemote.evaluate(() => window.__TEST_API.getNetworkState());
          const { player } = await waitForSnapshotPlayer(
            net.clientId,
            (remotePlayer) => Boolean(remotePlayer.abilityState?.burnActive),
            { timeout: 5000, interval: 120 }
          );
          await sleep(650);
          const held = await waitForSnapshotPlayer(
            net.clientId,
            (remotePlayer) => Boolean(remotePlayer.abilityState?.burnActive),
            { timeout: 2000, interval: 120 }
          );
          await setGamepadButton(pageRemote, 4, false, 0);
          await sleep(160);
          const latencyStats = await pageRemote.evaluate(() => window.__TEST_API.getPerfStats());
          assert(player.abilityState?.burnActive === true, 'Expected controller ability1 to toggle burn remotely');
          assert(held.player.abilityState?.burnActive === true, 'Expected held ability1 not to tick-toggle Breacher burn off');
          assert(Number.isFinite(latencyStats.remoteInputAckRttMs), 'Expected remote input ACK RTT metric');
          assert(Number.isFinite(latencyStats.remoteInputToSnapshotMs), 'Expected remote input-to-snapshot metric');
          remoteShot = await screenshot(pageRemote, 'controller-remote');
        });
      });
    });

    console.log(`\n  Local screenshot: ${localShot}`);
    console.log(`  Remote screenshot: ${remoteShot}`);
  } finally {
    stopServer();
  }

  const allPassed = runner.summary();
  process.exit(allPassed ? 0 : 1);
}

run().catch((err) => {
  console.error('Controller test fatal error:', err.message);
  stopServer();
  process.exit(1);
});
