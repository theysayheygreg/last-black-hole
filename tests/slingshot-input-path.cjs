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

async function setPad(page, { x = 0, y = 0, thrust = 0, brake = 0, slingshot = false } = {}) {
  await page.evaluate(({ x, y, thrust, brake, slingshot }) => {
    const pad = window.__TEST_GAMEPAD;
    pad.axes[0] = Math.max(-1, Math.min(1, x));
    pad.axes[1] = Math.max(-1, Math.min(1, y));
    pad.buttons[7] = { pressed: thrust > 0.05, touched: thrust > 0, value: thrust };
    pad.buttons[6] = { pressed: brake > 0.05, touched: brake > 0, value: brake };
    pad.buttons[3] = { pressed: Boolean(slingshot), touched: Boolean(slingshot), value: slingshot ? 1 : 0 };
    pad.timestamp = Date.now();
  }, { x, y, thrust, brake, slingshot });
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

async function waitForSlingshotRelease(clientId, since = 0, timeout = 5000) {
  const deadline = Date.now() + timeout;
  let lastEvents = [];
  let lastPlayer = null;
  while (Date.now() < deadline) {
    lastEvents = (await events(since)).filter((event) =>
      event.payload?.clientId === clientId && event.type.startsWith('player.slingshot'));
    const engagedIndex = lastEvents.findIndex((event) => event.type === 'player.slingshotEngaged');
    const releasedIndex = lastEvents.findIndex((event) => event.type === 'player.slingshotReleased');
    if (engagedIndex >= 0 && releasedIndex > engagedIndex) {
      const current = await snapshot();
      lastPlayer = current.players?.find((player) => player.clientId === clientId) || null;
      if (lastPlayer?.slingshot?.telegraph?.releaseGhost) {
        return {
          player: lastPlayer,
          snapshot: current,
          event: lastEvents[releasedIndex],
        };
      }
    }
    await sleep(80);
  }
  throw new Error(`Timed out waiting for durable slingshot release: events=${JSON.stringify(lastEvents)} player=${JSON.stringify(lastPlayer)}`);
}

async function captureSlingshotPrompt(page) {
  return page.evaluate(() => {
    const element = document.getElementById('hud-interaction');
    const glyph = element?.querySelector('[data-action-id="slingshot"]');
    const copy = glyph?.nextElementSibling?.classList.contains('ui-action-copy')
      ? glyph.nextElementSibling.textContent.trim()
      : null;
    return {
      text: element?.textContent || '',
      visible: getComputedStyle(element).display !== 'none',
      remoteAuthorityActive: Boolean(window.__TEST_API.getNetworkState()?.remoteAuthorityActive),
      remoteTick: window.__TEST_API.getNetworkState()?.remoteTick ?? null,
      glyph: glyph ? {
        action: glyph.dataset.actionId,
        inputFamily: glyph.dataset.inputFamily,
        label: glyph.textContent.trim(),
        copy,
      } : null,
      scene: window.__TEST_API.getThreeSceneState(),
    };
  });
}

function hasSlingshotEngagePresentation(prompt) {
  return prompt?.visible
    && prompt.remoteAuthorityActive
    && /well in range/i.test(prompt.text)
    && prompt.scene?.slingshot?.affordance
    && prompt.glyph?.action === 'slingshot'
    && prompt.glyph?.inputFamily === 'controller'
    && prompt.glyph?.label === 'Y'
    && prompt.glyph?.copy === 'engage';
}

function wrappedDelta(from, to, worldScale) {
  let delta = to - from;
  if (delta > worldScale / 2) delta -= worldScale;
  if (delta < -worldScale / 2) delta += worldScale;
  return delta;
}

function wrappedDistance(left, right, worldScale) {
  return Math.hypot(
    wrappedDelta(left.wx, right.wx, worldScale),
    wrappedDelta(left.wy, right.wy, worldScale),
  );
}

async function steerToRing(page, clientId, anchor) {
  const initial = await snapshot();
  const worldScale = initial.session.worldScale;
  const player = initial.players.find((entry) => entry.clientId === clientId);
  assert(player, 'authoritative player disappeared before slingshot approach');
  const dx = wrappedDelta(anchor.wx, player.wx, worldScale);
  const dy = wrappedDelta(anchor.wy, player.wy, worldScale);
  const radialLength = Math.hypot(dx, dy) || 1;
  const target = {
    id: `${anchor.id || 'route-anchor'}-inner-current`,
    wx: ((anchor.wx + (dx / radialLength) * 0.22) % worldScale + worldScale) % worldScale,
    wy: ((anchor.wy + (dy / radialLength) * 0.22) % worldScale + worldScale) % worldScale,
  };

  const deadline = Date.now() + 35000;
  const maxCruiseSpeed = 0.31;
  let start = null;
  let closest = Infinity;
  let last = null;
  let recharging = false;
  let aimSteeringUntil = 0;
  let aimAnchorKey = null;

  try {
    while (Date.now() < deadline) {
      const current = await snapshot();
      const next = current.players.find((entry) => entry.clientId === clientId);
      assert(next?.status === 'alive', `pilot left the run while approaching the route anchor: ${next?.status}`);
      if (!start) start = { wx: next.wx, wy: next.wy };
      const tx = wrappedDelta(next.wx, target.wx, worldScale);
      const ty = wrappedDelta(next.wy, target.wy, worldScale);
      const distance = Math.hypot(tx, ty);
      const speed = Math.hypot(next.vx || 0, next.vy || 0);
      const fuelRatio = next.deltaVRatio || 0;
      closest = Math.min(closest, distance);
      const commitDistance = 0.48;
      if (recharging) {
        if (fuelRatio > 0.42) recharging = false;
      } else if (fuelRatio < 0.015 || (fuelRatio < 0.08 && distance >= commitDistance)) {
        recharging = true;
      }
      last = {
        wx: next.wx,
        wy: next.wy,
        vx: next.vx,
        vy: next.vy,
        dist: distance,
        speed,
        fuelRatio,
        recharging,
      };

      const prompt = await captureSlingshotPrompt(page);
      const aim = next.slingshot?.aim || null;
      if (aim) {
        const currentAimKey = `${aim.anchorType || 'anchor'}:${aim.anchorId || 'unknown'}`;
        if (currentAimKey !== aimAnchorKey) {
          aimAnchorKey = currentAimKey;
          aimSteeringUntil = Date.now() + 140;
        }
        const aimDx = wrappedDelta(next.wx, aim.anchorWX, worldScale);
        const aimDy = wrappedDelta(next.wy, aim.anchorWY, worldScale);
        const aimDistance = Math.hypot(aimDx, aimDy) || 1;
        let tangentX = -aimDy / aimDistance;
        let tangentY = aimDx / aimDistance;
        if ((next.vx || 0) * tangentX + (next.vy || 0) * tangentY < 0) {
          tangentX = -tangentX;
          tangentY = -tangentY;
        }
        const emergencyBrake = speed > Math.max(0.52, maxCruiseSpeed * 1.6);
        if (Date.now() >= aimSteeringUntil
          && aim.engageEligible === true
          && hasSlingshotEngagePresentation(prompt)) {
          await setPad(page);
          return {
            start,
            end: last,
            closest,
            target: { ...target },
            aim,
            prompt,
          };
        }
        await setPad(page, {
          x: tangentX,
          y: tangentY,
          thrust: !emergencyBrake && fuelRatio > 0.01 ? 1 : 0,
          brake: emergencyBrake && fuelRatio > 0.01 ? 1 : 0,
        });
        await sleep(70);
        continue;
      }

      const nx = distance > 1e-6 ? tx / distance : 1;
      const ny = distance > 1e-6 ? ty / distance : 0;
      const desiredSpeed = maxCruiseSpeed;
      const correctionX = nx * desiredSpeed - (next.vx || 0);
      const correctionY = ny * desiredSpeed - (next.vy || 0);
      const correctionMagnitude = Math.hypot(correctionX, correctionY);
      const emergencyBrake = speed > Math.max(0.52, maxCruiseSpeed * 1.6);
      if (recharging) {
        await setPad(page);
        await sleep(150);
        continue;
      }
      await setPad(page, {
        x: emergencyBrake && speed > 0.01 ? (next.vx || 0) / speed : correctionX / (correctionMagnitude || 1),
        y: emergencyBrake && speed > 0.01 ? (next.vy || 0) / speed : correctionY / (correctionMagnitude || 1),
        thrust: !emergencyBrake && fuelRatio > 0.01 && correctionMagnitude > 0.035 ? 1 : 0,
        brake: emergencyBrake && fuelRatio > 0.01 ? 1 : 0,
      });
      await sleep(110);
    }
  } finally {
    await setPad(page).catch(() => null);
  }
  throw new Error(`Could not reach ${target.id}; closest=${closest.toFixed(4)} last=${JSON.stringify(last)}`);
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

      const routeAnchor = initial.snapshot.world.wells
        .filter((well) => well?.alive !== false && !well?.consumedByInhibitor)
        .sort((left, right) => wrappedDistance(initial.player, left, initial.snapshot.session.worldScale)
          - wrappedDistance(initial.player, right, initial.snapshot.session.worldScale))[0];
      assert(routeAnchor, 'Shallows route well is missing');
      const approach = await steerToRing(page, clientId, routeAnchor);
      const aim = approach.aim;
      const promptBefore = approach.prompt;
      assert(aim?.engageEligible === true && aim.speed >= 0.01,
        `Authority aim was not engage-eligible: ${JSON.stringify(aim)}`);
      assert(promptBefore.visible && /well in range/i.test(promptBefore.text), `Missing in-world slingshot prompt: ${JSON.stringify(promptBefore)}`);
      assert(JSON.stringify(promptBefore.glyph) === JSON.stringify({
        action: 'slingshot',
        inputFamily: 'controller',
        label: 'Y',
        copy: 'engage',
      }), `Controller prompt did not expose semantic Y engage state: ${JSON.stringify(promptBefore.glyph)}`);
      assert(promptBefore.scene.slingshot?.affordance, 'Three scene did not expose the authoritative aim affordance');

      const engageStartedAt = Date.now();
      const engageAckCount = (await edgeAcks(page)).length;
      // Hold the real controller Y action through lock and orbit. Release is
      // proved by lifting Y, not by sending a second toggle edge.
      await setPad(page, { x: 1, y: 0, slingshot: true });
      await waitFor(page, (count) => (window.__TEST_API.getNetworkState()?.networkMetrics?.slingshotEdgeAcks || []).length === count + 1,
        { timeout: 5000 }, engageAckCount);
      const lock = await waitForPlayer(clientId, (player) => player.slingshot?.phase === 'lock' && player.slingshot?.engaged === true, 'authoritative lock');
      const lockSeenAt = Date.now();
      await waitFor(page, () => Boolean(window.__TEST_API.getThreeSceneState()?.slingshot?.telegraph?.lock), { timeout: 1500 });
      const lockScene = await page.evaluate(() => window.__TEST_API.getThreeSceneState());
      assert(lockScene.slingshot?.telegraph?.lock, 'Lock telegraph did not reach the visible scene state');
      await waitForPlayer(clientId, (player) => player.slingshot?.phase === 'arc' && player.slingshot?.engaged === true, 'authoritative arc');
      const arcSeenAt = Date.now();
      await waitFor(page, () => Boolean(window.__TEST_API.getThreeSceneState()?.slingshot?.telegraph?.ownedArc), { timeout: 1500 });
      const arcScene = await page.evaluate(() => window.__TEST_API.getThreeSceneState());
      assert(arcScene.slingshot?.telegraph?.ownedArc, 'Owned arc did not reach the visible scene state');

      await waitFor(page, () => {
        const element = document.getElementById('hud-interaction');
        const glyph = element?.querySelector('[data-action-id="slingshot"]');
        const copy = glyph?.nextElementSibling?.classList.contains('ui-action-copy')
          ? glyph.nextElementSibling.textContent.trim()
          : null;
        return Boolean(
          element
          && getComputedStyle(element).display !== 'none'
          && glyph?.dataset.actionId === 'slingshot'
          && glyph?.dataset.inputFamily === 'controller'
          && glyph.textContent.trim() === 'Y'
          && copy === 'release'
        );
      }, { timeout: 1500 });
      const promptDuring = await captureSlingshotPrompt(page);
      assert(JSON.stringify(promptDuring.glyph) === JSON.stringify({
        action: 'slingshot',
        inputFamily: 'controller',
        label: 'Y',
        copy: 'release',
      }), `Controller prompt did not expose semantic Y release state: ${JSON.stringify(promptDuring.glyph)}`);
      const releaseStartedAt = Date.now();
      // The button-up packet carries slingshot=false through SimClient to the
      // authority, which owns the release and chosen exit direction.
      await setPad(page, { x: 1, y: 0 });
      const released = await waitForSlingshotRelease(clientId, baselineSeq);
      assert(released.player.slingshot?.engaged === false, 'Authoritative release event must leave slingshot disengaged');
      assert(released.player.slingshot?.telegraph?.releaseGhost, 'Authoritative snapshot must retain the release ghost payload');
      await waitFor(page, () => Boolean(window.__TEST_API.getThreeSceneState()?.slingshot?.telegraph?.releaseGhost), { timeout: 1500 });
      const releaseScene = await page.evaluate(() => window.__TEST_API.getThreeSceneState());
      assert(releaseScene.slingshot?.telegraph?.releaseGhost, 'Release ghost did not reach the visible scene state');

      const routeEvents = (await events(baselineSeq)).filter((event) => event.payload?.clientId === clientId && event.type.startsWith('player.slingshot'));
      const routeEventTypes = routeEvents.map((event) => event.type);
      assert(JSON.stringify(routeEventTypes) === JSON.stringify(['player.slingshotEngaged', 'player.slingshotReleased']),
        `Expected slingshot engage/release order, got ${JSON.stringify(routeEventTypes)}`);
      assert((await edgeAcks(page)).length === initialAckCount + 2, 'Expected no-anchor and engage edge acknowledgements; release uses held-state transition');
      assert(errors.length === 0, `browser errors: ${errors.join('; ')}`);
      console.log(JSON.stringify({
        edgeAcks: await edgeAcks(page),
        events: routeEvents.map((event) => ({ type: event.type, tick: event.tick, simTime: event.simTime })),
        promptBefore: promptBefore.text,
        promptDuring,
        anchor: { id: routeAnchor.id, type: routeAnchor.type || 'well' },
        approach: { target: approach.target, aimDistance: aim?.distance ?? null },
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
