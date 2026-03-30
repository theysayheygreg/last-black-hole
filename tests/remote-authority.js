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

  await page.evaluate(() => {
    window.__TEST_API.seedProfileEquipped(0, {
      name: "Pull Dampener",
      category: "artifact",
      subcategory: "equippable",
      tier: "rare",
      value: 450,
      effect: "reduceWellPull",
      effectDesc: "test",
    });
    window.__TEST_API.seedProfileConsumable(0, {
      name: "Test Shield",
      category: "artifact",
      subcategory: "consumable",
      tier: "rare",
      value: 300,
      useEffect: "shieldBurst",
      useDesc: "test",
      charges: 1,
    });
  });

  await tap(page, "KeyE", "e");
  await tap(page, "KeyE", "e");
  await tap(page, "KeyE", "e");
  await tap(page, "Enter", "Enter");
  await waitForPhase(page, "mapSelect");

  await tap(page, "Enter", "Enter");
  await waitForPhase(page, "playing", 12000);
}

async function getEvents(since = 0) {
  const response = await fetch(`${SIM_URL}/events?since=${since}`);
  const body = await response.json();
  return body.events || [];
}

async function getSnapshot() {
  const response = await fetch(`${SIM_URL}/snapshot`);
  return response.json();
}

async function postInput(body) {
  const response = await fetch(`${SIM_URL}/input`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  return response.json();
}

async function postInventoryAction(body) {
  const response = await fetch(`${SIM_URL}/inventory/action`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  return response.json();
}

async function postDebugPlayerState(body) {
  const response = await fetch(`${SIM_URL}/debug/player-state`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  return response.json();
}

async function waitForEvents(predicate, { timeout = 5000, interval = 100 } = {}) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    const events = await getEvents(0);
    if (predicate(events)) return events;
    await sleep(interval);
  }
  throw new Error("Timed out waiting for remote events");
}

async function waitForSnapshotPlayer(predicate, { timeout = 5000, interval = 100 } = {}) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    const snapshot = await getSnapshot();
    const player = snapshot.players?.[0];
    if (player && predicate(player, snapshot)) return { player, snapshot };
    await sleep(interval);
  }
  throw new Error("Timed out waiting for authoritative snapshot state");
}

async function run() {
  console.log(`\n=== REMOTE AUTHORITY TESTS (${htmlFile}) ===\n`);

  const runner = new TestRunner("RemoteAuthority");
  await startServer();
  await startSimServer(SIM_PORT);

  let browser, page;
  let browser2, page2;
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

    await runner.run("Remote consumables are consumed by the authoritative sim protocol", async () => {
      const net = await page.evaluate(() => window.__TEST_API.getNetworkState());
      const seq = Date.now();
      await postInput({
        clientId: net.clientId,
        seq,
        moveX: 0,
        moveY: 0,
        thrust: 0,
        pulse: false,
        consumeSlot: 0,
        timestamp: Date.now(),
      });
      const { player } = await waitForSnapshotPlayer(
        (remotePlayer) => remotePlayer.consumables?.[0] === null && (remotePlayer.effectState?.shieldCharges ?? 0) > 0,
        { timeout: 5000 }
      );
      assert(player.consumables[0] === null, "Expected authoritative consumable slot to empty after use");
      assert((player.effectState?.shieldCharges ?? 0) > 0, "Expected shield effect to activate authoritatively");
    });

    await runner.run("Remote pulse is emitted by the authoritative sim protocol", async () => {
      const net = await page.evaluate(() => window.__TEST_API.getNetworkState());
      const seq = Date.now() + 1;
      const beforeEvents = await getEvents(0);
      const baselineSeq = beforeEvents.reduce((max, event) => Math.max(max, event.seq || 0), 0);
      await postInput({
        clientId: net.clientId,
        seq,
        moveX: 0,
        moveY: 0,
        thrust: 0,
        pulse: true,
        consumeSlot: null,
        timestamp: Date.now(),
      });
      const events = await waitForEvents(
        (allEvents) => allEvents.some((event) => event.seq > baselineSeq && event.type === "player.pulse"),
        { timeout: 5000 }
      );
      assert(
        events.some((event) => event.seq > baselineSeq && event.type === "player.pulse"),
        "Expected authoritative pulse event"
      );
    });

    await runner.run("Remote inventory actions mutate authoritative cargo and loadout", async () => {
      const net = await page.evaluate(() => window.__TEST_API.getNetworkState());

      let result = await postInventoryAction({
        clientId: net.clientId,
        action: "unequip",
        equipSlot: 0,
      });
      assert(result.ok === true, "Expected unequip action to succeed");

      let snapshotState = await waitForSnapshotPlayer(
        (remotePlayer) => !remotePlayer.equipped?.[0] && remotePlayer.cargo?.some((item) => item?.name === "Pull Dampener"),
        { timeout: 5000 }
      );
      assert(snapshotState.player.cargo.some((item) => item?.name === "Pull Dampener"), "Expected unequipped artifact in cargo");

      const cargoSlot = snapshotState.player.cargo.findIndex((item) => item?.name === "Pull Dampener");
      result = await postInventoryAction({
        clientId: net.clientId,
        action: "equipCargo",
        cargoSlot,
        equipSlot: 1,
      });
      assert(result.ok === true, "Expected equipCargo action to succeed");

      snapshotState = await waitForSnapshotPlayer(
        (remotePlayer) => remotePlayer.equipped?.[1]?.name === "Pull Dampener",
        { timeout: 5000 }
      );
      assert(snapshotState.player.equipped[1]?.name === "Pull Dampener", "Expected authoritative re-equip into slot 1");
    });

    await runner.run("Remote authoritative hazards push the player without local fallback", async () => {
      const net = await page.evaluate(() => window.__TEST_API.getNetworkState());
      const result = await postDebugPlayerState({
        clientId: net.clientId,
        wx: 1.62,
        wy: 1.65,
        vx: 0,
        vy: 0,
        status: "alive",
      });
      assert(result.ok === true, "Expected debug player state update to succeed");

      const before = await getSnapshot();
      const beforePlayer = before.players.find((player) => player.clientId === net.clientId);
      assert(beforePlayer, "Expected remote player in authoritative snapshot");

      const { player: afterPlayer } = await waitForSnapshotPlayer(
        (remotePlayer) =>
          remotePlayer.clientId === net.clientId &&
          (remotePlayer.vx > 0.01 || remotePlayer.wx > beforePlayer.wx + 0.01),
        { timeout: 5000 }
      );
      assert(afterPlayer.vx > 0.01, `Expected authoritative star push to accelerate player, got vx=${afterPlayer.vx}`);
      assert(afterPlayer.wx > beforePlayer.wx, `Expected authoritative push to move player away from star, got ${afterPlayer.wx} from ${beforePlayer.wx}`);
    });

    await runner.run("Second client joins existing authoritative session", async () => {
      const joinResponse = await fetch(`${SIM_URL}/join`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          clientId: "remote-test-second-client",
          name: "Second Client",
        }),
      }).then((response) => response.json());

      assert(joinResponse.ok === true, "Expected direct second join to succeed");

      const snapshot = await getSnapshot();
      assert(snapshot.players.length >= 2, `Expected at least 2 remote players, got ${snapshot.players.length}`);
      assert(snapshot.session.mapId === "shallows", `Expected shared session on shallows, got ${snapshot.session.mapId}`);
    });

    await runner.run("Remote browser joins live authoritative run instead of resetting to its selected map", async () => {
      ({ browser: browser2, page: page2 } = await launchGame(`${htmlFile}?simServer=${encodeURIComponent(SIM_URL)}`));
      await bootstrapCleanRemotePage(page2);

      const started = await page2.evaluate(() => window.__TEST_API.startRemoteGame(2));
      assert(started === true, "Expected second browser to start remote game through test API");

      await waitFor(page2, () => {
        const net = window.__TEST_API.getNetworkState();
        return net.remoteAuthorityActive && net.remoteMapId === "shallows" && typeof net.remoteTick === "number";
      }, { timeout: 12000 });

      const net = await page2.evaluate(() => window.__TEST_API.getNetworkState());
      assert(net.remoteMapId === "shallows", `Expected second browser to join live shallows run, got ${net.remoteMapId}`);

      const snapshot = await getSnapshot();
      assert(snapshot.session.mapId === "shallows", `Expected live authoritative map to stay on shallows, got ${snapshot.session.mapId}`);

      await browser2.close();
      browser2 = null;
      page2 = null;
    });

    const filepath = await screenshot(page, "remote-authority");
    console.log(`\n  Screenshot: ${filepath}`);
  } finally {
    if (browser2) await browser2.close();
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
