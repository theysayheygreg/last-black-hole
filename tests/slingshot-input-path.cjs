/**
 * Normal-input RC proof for the packaged/local-authority slingshot path.
 * No debug placement, edge injection, or authority-state mutation is used.
 */
const {
  startServer,
  stopServer,
  withFreshGame,
  withFreshSimServer,
  waitFor,
  withQuery,
  assert,
} = require('./helpers.cjs');

const SIM_PORT = 8794;
const SIM_URL = `http://127.0.0.1:${SIM_PORT}`;
const HTML_FILE = process.argv[2] || 'index-a.html?renderer=three';

function sleep(ms) { return new Promise((resolve) => setTimeout(resolve, ms)); }

async function snapshot() {
  const response = await fetch(`${SIM_URL}/snapshot`);
  if (!response.ok) throw new Error(`snapshot failed: ${response.status}`);
  return response.json();
}

async function events(since = 0) {
  const response = await fetch(`${SIM_URL}/events?since=${since}`);
  if (!response.ok) throw new Error(`events failed: ${response.status}`);
  return (await response.json()).events || [];
}

async function phase(page, expected) {
  await waitFor(page, (value) => window.__TEST_API?.getGamePhase?.() === value, { timeout: 12000 }, expected);
}

async function tapKey(page, code, holdMs = 80) {
  await page.keyboard.down(code);
  await sleep(holdMs);
  await page.keyboard.up(code);
  await sleep(140);
}

async function installVirtualPad(page) {
  await page.evaluate(() => {
    const button = () => ({ pressed: false, touched: false, value: 0 });
    window.__TEST_GAMEPAD = {
      id: 'LBH RC Virtual Deck',
      index: 0,
      connected: true,
      mapping: 'standard',
      axes: [0, 0, 0, 0, -1, -1],
      buttons: Array.from({ length: 18 }, button),
      timestamp: Date.now(),
    };
    Object.defineProperty(Navigator.prototype, 'getGamepads', {
      configurable: true,
      value: () => [window.__TEST_GAMEPAD],
    });
  });
}

async function setPad(page, { x = 0, y = 0, thrust = 0, slingshot = false } = {}) {
  await page.evaluate(({ x, y, thrust, slingshot }) => {
    const pad = window.__TEST_GAMEPAD;
    pad.axes[0] = Math.max(-1, Math.min(1, x));
    pad.axes[1] = Math.max(-1, Math.min(1, y));
    pad.buttons[7] = { pressed: thrust > 0.05, touched: thrust > 0, value: thrust };
    pad.buttons[3] = { pressed: Boolean(slingshot), touched: Boolean(slingshot), value: slingshot ? 1 : 0 };
    pad.timestamp = Date.now();
  }, { x, y, thrust, slingshot });
}

async function edgeAcks(page) {
  return page.evaluate(() => window.__TEST_API?.getNetworkState?.()?.networkMetrics?.slingshotEdgeAcks || []);
}

async function waitForPlayer(clientId, predicate, label, timeout = 8000) {
  const deadline = Date.now() + timeout;
  let last = null;
  while (Date.now() < deadline) {
    const current = await snapshot();
    last = current.players?.find((player) => player.clientId === clientId) || null;
    if (last && predicate(last, current)) return { player: last, snapshot: current };
    await sleep(100);
  }
  throw new Error(`Timed out waiting for ${label}: ${JSON.stringify(last)}`);
}

async function steerToRing(page, clientId, anchor) {
  const initial = await snapshot();
  const worldScale = initial.session.worldScale;
  const player = initial.players.find((entry) => entry.clientId === clientId);
  let dx = player.wx - anchor.wx;
  let dy = player.wy - anchor.wy;
  if (dx > worldScale / 2) dx -= worldScale;
  if (dx < -worldScale / 2) dx += worldScale;
  if (dy > worldScale / 2) dy -= worldScale;
  if (dy < -worldScale / 2) dy += worldScale;
  const radialLength = Math.hypot(dx, dy) || 1;
  const target = {
    wx: ((anchor.wx + (dx / radialLength) * 0.22) % worldScale + worldScale) % worldScale,
    wy: ((anchor.wy + (dy / radialLength) * 0.22) % worldScale + worldScale) % worldScale,
  };

  const deadline = Date.now() + 35000;
  while (Date.now() < deadline) {
    const current = await snapshot();
    const next = current.players.find((entry) => entry.clientId === clientId);
    assert(next?.status === 'alive', `pilot left the run while approaching the route anchor: ${next?.status}`);
    let tx = target.wx - next.wx;
    let ty = target.wy - next.wy;
    if (tx > worldScale / 2) tx -= worldScale;
    if (tx < -worldScale / 2) tx += worldScale;
    if (ty > worldScale / 2) ty -= worldScale;
    if (ty < -worldScale / 2) ty += worldScale;
    const distance = Math.hypot(tx, ty);
    if (distance <= 0.12) break;
    await setPad(page, { x: tx / distance, y: ty / distance, thrust: 1 });
    await sleep(120);
  }
  const atRing = await snapshot();
  const next = atRing.players.find((entry) => entry.clientId === clientId);
  let tx = anchor.wx - next.wx;
  let ty = anchor.wy - next.wy;
  if (tx > worldScale / 2) tx -= worldScale;
  if (tx < -worldScale / 2) tx += worldScale;
  if (ty > worldScale / 2) ty -= worldScale;
  if (ty < -worldScale / 2) ty += worldScale;
  const distance = Math.hypot(tx, ty) || 1;
  await setPad(page, { x: -ty / distance, y: tx / distance, thrust: 1 });
  await sleep(180);
  await setPad(page);
  return { target, player: next };
}

async function run() {
  await startServer();
  await withFreshSimServer(SIM_PORT, async () => {
    await withFreshGame(withQuery(HTML_FILE, { simServer: SIM_URL }), async ({ page, errors }) => {
      await page.evaluate(() => localStorage.clear());
      await page.reload({ waitUntil: 'domcontentloaded' });
      await sleep(1800);
      await installVirtualPad(page);

      await phase(page, 'title');
      await tapKey(page, 'Space');
      await phase(page, 'profileSelect');
      await tapKey(page, 'Space');
      await sleep(160);
      if ((await page.evaluate(() => window.__TEST_API.getGamePhase())) !== 'home') await tapKey(page, 'Space');
      await phase(page, 'home');
      for (let i = 0; i < 4; i++) await tapKey(page, 'KeyE');
      await waitFor(page, () => window.__TEST_API.getHomeState()?.tabName === 'LAUNCH', { timeout: 4000 });
      await tapKey(page, 'Space');
      await phase(page, 'mapSelect');
      await tapKey(page, 'Space');
      await phase(page, 'playing');
      await waitFor(page, () => window.__TEST_API.getNetworkState()?.remoteAuthorityActive === true, { timeout: 12000 });

      const net = await page.evaluate(() => window.__TEST_API.getNetworkState());
      const clientId = net.clientId;
      const initial = await waitForPlayer(clientId, (player) => player.status === 'alive', 'initial player');
      const baselineSeq = (await events(0)).reduce((max, event) => Math.max(max, event.seq || 0), 0);
      assert(!initial.player.slingshot?.aim, 'safe spawn unexpectedly began inside a slingshot affordance');

      const initialAckCount = (await edgeAcks(page)).length;
      await tapKey(page, 'KeyF');
      await waitFor(page, (count) => (window.__TEST_API.getNetworkState()?.networkMetrics?.slingshotEdgeAcks || []).length === count + 1,
        { timeout: 5000 }, initialAckCount);
      await waitFor(page, () => document.querySelector('#hud-warnings')?.textContent.includes('no anchor in range'), { timeout: 3000 });

      const routeAnchor = initial.snapshot.world.wells[1];
      assert(routeAnchor, 'Shallows route well is missing');
      const approach = await steerToRing(page, clientId, routeAnchor);
      const aim = await waitForPlayer(clientId, (player) => Boolean(player.slingshot?.aim), 'authoritative aim affordance');
      await tapKey(page, 'KeyW', 40);
      const promptBefore = await page.evaluate(() => {
        const element = document.getElementById('hud-interaction');
        const glyph = element?.querySelector('[data-action-id="slingshot"]');
        const copy = glyph?.nextElementSibling?.classList.contains('ui-action-copy')
          ? glyph.nextElementSibling.textContent.trim()
          : null;
        return {
          text: element?.textContent || '',
          visible: getComputedStyle(element).display !== 'none',
          glyph: glyph ? {
            action: glyph.dataset.actionId,
            inputFamily: glyph.dataset.inputFamily,
            label: glyph.textContent.trim(),
            copy,
          } : null,
          scene: window.__TEST_API.getThreeSceneState(),
        };
      });
      assert(promptBefore.visible && /well in range/i.test(promptBefore.text), `Missing in-world slingshot prompt: ${JSON.stringify(promptBefore)}`);
      assert.deepStrictEqual(promptBefore.glyph, {
        action: 'slingshot',
        inputFamily: 'deck',
        label: 'Y',
        copy: 'engage',
      }, `Deck prompt did not expose semantic Y engage state: ${JSON.stringify(promptBefore.glyph)}`);
      assert(promptBefore.scene.slingshot?.affordance, 'Three scene did not expose the authoritative aim affordance');

      const engageStartedAt = Date.now();
      const engageAckCount = (await edgeAcks(page)).length;
      await tapKey(page, 'KeyF');
      await waitFor(page, (count) => (window.__TEST_API.getNetworkState()?.networkMetrics?.slingshotEdgeAcks || []).length === count + 1,
        { timeout: 5000 }, engageAckCount);
      const lock = await waitForPlayer(clientId, (player) => player.slingshot?.phase === 'lock' && player.slingshot?.engaged === true, 'authoritative lock');
      const lockSeenAt = Date.now();
      const lockScene = await page.evaluate(() => window.__TEST_API.getThreeSceneState());
      assert(lockScene.slingshot?.telegraph?.lock, 'Lock telegraph did not reach the visible scene state');
      await waitForPlayer(clientId, (player) => player.slingshot?.phase === 'arc' && player.slingshot?.engaged === true, 'authoritative arc');
      const arcSeenAt = Date.now();
      const arcScene = await page.evaluate(() => window.__TEST_API.getThreeSceneState());
      assert(arcScene.slingshot?.telegraph?.ownedArc, 'Owned arc did not reach the visible scene state');

      await setPad(page, { x: 1, y: 0 });
      await sleep(160);
      const promptDuring = await page.evaluate(() => {
        const element = document.getElementById('hud-interaction');
        const glyph = element?.querySelector('[data-action-id="slingshot"]');
        const copy = glyph?.nextElementSibling?.classList.contains('ui-action-copy')
          ? glyph.nextElementSibling.textContent.trim()
          : null;
        return {
          text: element?.textContent || '',
          glyph: glyph ? {
            action: glyph.dataset.actionId,
            inputFamily: glyph.dataset.inputFamily,
            label: glyph.textContent.trim(),
            copy,
          } : null,
        };
      });
      assert.deepStrictEqual(promptDuring.glyph, {
        action: 'slingshot',
        inputFamily: 'deck',
        label: 'Y',
        copy: 'release',
      }, `Controller prompt did not expose semantic Y release state: ${JSON.stringify(promptDuring.glyph)}`);
      const releaseAckCount = (await edgeAcks(page)).length;
      const releaseStartedAt = Date.now();
      await setPad(page, { x: 1, y: 0, slingshot: true });
      await sleep(90);
      await setPad(page, { x: 1, y: 0 });
      await waitFor(page, (count) => (window.__TEST_API.getNetworkState()?.networkMetrics?.slingshotEdgeAcks || []).length === count + 1,
        { timeout: 5000 }, releaseAckCount);
      const released = await waitForPlayer(clientId, (player) => player.slingshot?.phase === 'release-ghost' && player.slingshot?.engaged === false, 'authoritative release ghost');
      const releaseScene = await page.evaluate(() => window.__TEST_API.getThreeSceneState());
      assert(releaseScene.slingshot?.telegraph?.releaseGhost, 'Release ghost did not reach the visible scene state');

      const routeEvents = (await events(baselineSeq)).filter((event) => event.payload?.clientId === clientId && event.type.startsWith('player.slingshot'));
      assert.deepStrictEqual(routeEvents.map((event) => event.type), ['player.slingshotEngaged', 'player.slingshotReleased']);
      assert((await edgeAcks(page)).length === initialAckCount + 3, 'Expected no-anchor, engage, and release edge acknowledgements');
      assert.strictEqual(errors.length, 0, `browser errors: ${errors.join('; ')}`);
      console.log(JSON.stringify({
        edgeAcks: await edgeAcks(page),
        events: routeEvents.map((event) => ({ type: event.type, tick: event.tick, simTime: event.simTime })),
        promptBefore: promptBefore.text,
        promptDuring,
        anchor: { id: routeAnchor.id, type: routeAnchor.type || 'well' },
        approach: { target: approach.target, aimDistance: aim.player.slingshot.aim.distance },
        timingsMs: {
          engageToLock: lockSeenAt - engageStartedAt,
          lockToArc: arcSeenAt - lockSeenAt,
          releaseToGhost: Date.now() - releaseStartedAt,
        },
        phases: [lock.player.slingshot.phase, 'arc', released.player.slingshot.phase],
      }, null, 2));
    });
  });
  await stopServer();
}

run().catch(async (error) => {
  try { stopServer(); } catch {}
  console.error(error.stack || error.message);
  process.exit(1);
});
