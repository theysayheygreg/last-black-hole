/**
 * remote-authority.cjs — Real remote-authority browser smoke.
 *
 * Starts a dedicated sim server, then drives the real menu/profile/mapSelect
 * flow into a remote-authority run and verifies snapshot + movement sync.
 * This suite intentionally keeps one sim alive across assertions because
 * host transfer, second-client join, and session continuity are the contract.
 *
 * Usage: node tests/remote-authority.cjs [index-a.html]
 */
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
} = require("./helpers.cjs");

const htmlFile = process.argv[2] || "index-a.html";
const SIM_PORT = Number(process.env.LBH_REMOTE_AUTHORITY_SIM_PORT || 8798);
const SIM_URL = `http://127.0.0.1:${SIM_PORT}`;

function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

function worldWrappedDeltaForTest(a, b, worldScale) {
  const direct = Math.abs((Number(b) || 0) - (Number(a) || 0));
  return Math.min(direct, Math.abs((Number(worldScale) || 5) - direct));
}

async function waitForPhase(page, phase, timeout = 9000) {
  await waitFor(page, (expected) => window.__TEST_API?.getGamePhase?.() === expected, { timeout }, phase);
}

async function tap(page, code, key) {
  await dispatchKey(page, code, key);
  await sleep(120);
}

async function moveHomeTab(page, tabName) {
  for (let i = 0; i < 8; i++) {
    if (await page.evaluate((name) => window.__TEST_API.getHomeState().tabName === name, tabName)) return;
    await tap(page, "KeyE", "e");
  }
  const current = await page.evaluate(() => window.__TEST_API.getHomeState().tabName);
  throw new Error(`Expected home tab ${tabName}, got ${current}`);
}

async function bootstrapCleanRemotePage(page) {
  await page.evaluate(() => localStorage.clear());
  await page.reload({ waitUntil: "domcontentloaded" });
  await sleep(2000);
}

async function enterRemoteRun(page) {
  await page.evaluate(() => {
    window.__TEST_API.createTestProfile("Remote Pilot");
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
    window.__TEST_API.seedProfileConsumable(1, {
      name: "Test Fuel Cell",
      category: "artifact",
      subcategory: "consumable",
      tier: "common",
      value: 35,
      useEffect: "fuelRefill",
      useDesc: "test",
      amount: 35,
      charges: 1,
    });
  });

  const started = await page.evaluate(() => window.__TEST_API.startRemoteGameNow(0));
  assert(started === true, "Expected remote game to start through test API");
  await waitForPhase(page, "playing", 12000);
}

async function enterRemoteMapSelect(page) {
  await waitForPhase(page, "title");
  await tap(page, "Space", " ");
  await waitForPhase(page, "profileSelect");
  await tap(page, "Enter", "Enter");
  await sleep(120);
  await tap(page, "Enter", "Enter");
  await waitForPhase(page, "home");
  await moveHomeTab(page, "LAUNCH");
  await tap(page, "Enter", "Enter");
  await waitForPhase(page, "mapSelect");
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

async function getProfile(profileId) {
  const response = await fetch(`${SIM_URL}/profile?profileId=${encodeURIComponent(profileId)}`);
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

async function postDebugInhibitorState(body) {
  const response = await fetch(`${SIM_URL}/debug/inhibitor-state`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  return response.json();
}

async function postLeave(body) {
  const response = await fetch(`${SIM_URL}/leave`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  return response.json();
}

async function postDebugScavengerState(body) {
  const response = await fetch(`${SIM_URL}/debug/scavenger-state`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  return response.json();
}

async function postSessionReset(body) {
  const response = await fetch(`${SIM_URL}/session/reset`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const json = await response.json();
  return { status: response.status, body: json };
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

async function waitForSnapshotPlayer(clientId, predicate, { timeout = 5000, interval = 100 } = {}) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    const snapshot = await getSnapshot();
    const player = snapshot.players?.find((entry) => entry.clientId === clientId);
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
    ({ browser, page } = await launchGame(withQuery(htmlFile, { simServer: SIM_URL })));
    await bootstrapCleanRemotePage(page);

    await runner.run("Remote test API path reaches authoritative gameplay", async () => {
      await enterRemoteRun(page);

      await waitFor(page, () => {
        const net = window.__TEST_API.getNetworkState();
        return net.simEnabled && net.remoteAuthorityActive && typeof net.remoteTick === "number";
      }, { timeout: 12000 });

      const net = await page.evaluate(() => window.__TEST_API.getNetworkState());
      assert(net.simEnabled === true, "Expected sim client enabled");
      assert(net.remoteAuthorityActive === true, "Expected remote authority active");
      assert(net.simUrl === SIM_URL, `Unexpected sim URL: ${net.simUrl}`);
      assert(typeof net.remoteMapId === "string" && net.remoteMapId.length > 0, "Expected remote map id");
      assert(typeof net.remoteTick === "number", "Expected authoritative remote tick");
      assert(net.sessionStatus === "running", `Expected running session state, got ${net.sessionStatus}`);
      assert(net.sessionIsHost === true, "Expected first remote browser to report host status");
      assert(net.sessionCanHostReset === true, "Expected host browser to report reset authority");
      assert(net.sessionMapId === "shallows", `Expected live session map id to be shallows, got ${net.sessionMapId}`);

      const health = await fetch(`${SIM_URL}/health`).then((response) => response.json());
      assert(health.session.hostClientId === net.clientId, "Expected first remote browser to become session host");

      await waitFor(page, () => window.__TEST_API.getScavengers().length > 0, { timeout: 8000 });
      const scavengers = await page.evaluate(() => window.__TEST_API.getScavengers());
      assert(scavengers.length > 0, "Expected authoritative scavengers in remote snapshot");

      const ability = await page.evaluate(() => window.__TEST_API.getAbilityState());
      assert(ability?.hullType === "drifter", `Expected drifter ability state, got ${ability?.hullType}`);
      assert(ability.ability1?.name === "eddy brake", `Expected ability1 eddy brake, got ${ability.ability1?.name}`);
      assert(typeof ability.ability1.cooldown === "number", "Expected ability1 cooldown number");
      assert(ability.ability2 === null, "Expected drifter ability2 slot to be explicitly empty");

      const snapshot = await getSnapshot();
      assert(typeof snapshot.inhibitor?.threshold === "number", "Expected inhibitor threshold in remote snapshot");
      assert(typeof snapshot.inhibitor?.pressureFrac === "number", "Expected inhibitor pressureFrac in remote snapshot");
    });

    await runner.run("Remote debug can force and reset authoritative inhibitor state", async () => {
      const snapshot = await getSnapshot();
      const ws = snapshot.session?.worldScale || 5;
      const forced = await postDebugInhibitorState({
        form: 2,
        wx: ws * 0.42,
        wy: ws * 0.47,
        radius: 0.25,
        intensity: 0.85,
        pressure: 1,
        threshold: 1,
        localTime: 12,
        swarmTargetX: ws * 0.5,
        swarmTargetY: ws * 0.5,
      });
      assert(forced.ok === true, "Expected debug inhibitor force to succeed");
      assert(forced.snapshot?.inhibitor?.form === 2, `Expected forced swarm form, got ${forced.snapshot?.inhibitor?.form}`);
      assert(forced.snapshot.inhibitor.intensity >= 0.8, "Expected forced inhibitor intensity in snapshot");

      const reset = await postDebugInhibitorState({
        form: 0,
        pressure: 0,
        intensity: 0,
        radius: 0,
      });
      assert(reset.ok === true, "Expected debug inhibitor reset to succeed");
      assert(reset.snapshot?.inhibitor?.form === 0, `Expected reset inhibitor form 0, got ${reset.snapshot?.inhibitor?.form}`);
    });

    await runner.run("Remote snapshots advance and move the ship under authoritative input", async () => {
      const before = await page.evaluate(() => ({
        net: window.__TEST_API.getNetworkState(),
        pos: window.__TEST_API.getShipPos(),
      }));
      const beforeServer = await getSnapshot();
      const beforePlayer = beforeServer.players?.find((entry) => entry.clientId === before.net.clientId);
      assert(beforePlayer, "Expected local browser player in authoritative snapshot");

      for (let i = 0; i < 5; i++) {
        await postInput({
          clientId: before.net.clientId,
          seq: Date.now() + i,
          moveX: 1,
          moveY: 0,
          thrust: 1,
          pulse: false,
          timestamp: Date.now(),
        });
        await sleep(80);
      }

      const { player: afterPlayer, snapshot: afterServer } = await waitForSnapshotPlayer(
        before.net.clientId,
        (remotePlayer, snapshot) => {
          const moved = Math.hypot(remotePlayer.wx - beforePlayer.wx, remotePlayer.wy - beforePlayer.wy);
          return snapshot.tick > (before.net.remoteTick ?? 0) && moved > 0.0001;
        },
        { timeout: 6000 }
      );

      const dx = afterPlayer.wx - beforePlayer.wx;
      const dy = afterPlayer.wy - beforePlayer.wy;
      const moved = Math.hypot(dx, dy);

      assert(afterServer.tick > before.net.remoteTick, "Expected authoritative tick to advance");
      assert(moved > 0.0001, `Expected ship movement under remote authority, got ${moved}`);
    });

    await runner.run("Remote delta-v gates brake, fuel cells, and speed cap", async () => {
      const net = await page.evaluate(() => window.__TEST_API.getNetworkState());
      let result = await postDebugPlayerState({
        clientId: net.clientId,
        wx: 1.5,
        wy: 1.5,
        vx: 0,
        vy: 0,
        deltaV: 20,
        timeSinceThrust: 999,
        status: "alive",
      });
      assert(result.ok === true, "Expected debug fuel reset to succeed");

      await postInput({
        clientId: net.clientId,
        seq: Date.now() + 10,
        moveX: 1,
        moveY: 0,
        thrust: 0,
        brake: 1,
        consumeSlot: null,
        timestamp: Date.now(),
      });
      let observed = await waitForSnapshotPlayer(
        net.clientId,
        (remotePlayer) => Math.hypot(remotePlayer.vx, remotePlayer.vy) > 0.001 && remotePlayer.deltaV < 20,
        { timeout: 5000 }
      );
      assert(Math.hypot(observed.player.vx, observed.player.vy) > 0.001,
        `Expected brake input to produce authoritative motion, got vx=${observed.player.vx} vy=${observed.player.vy}`);
      assert(observed.player.deltaV < 20, `Expected brake to spend delta-v, got ${observed.player.deltaV}`);

      result = await postDebugPlayerState({
        clientId: net.clientId,
        vx: 0,
        vy: 0,
        deltaV: 0,
        timeSinceThrust: 0,
        status: "alive",
      });
      assert(result.ok === true, "Expected debug empty tank to succeed");
      await postInput({
        clientId: net.clientId,
        seq: Date.now() + 20,
        moveX: 1,
        moveY: 0,
        thrust: 1,
        brake: 0,
        consumeSlot: 1,
        timestamp: Date.now(),
      });
      observed = await waitForSnapshotPlayer(
        net.clientId,
        (remotePlayer) => remotePlayer.consumables?.[1] === null && remotePlayer.deltaV > 20,
        { timeout: 5000 }
      );
      assert(observed.player.consumables[1] === null, "Expected fuel cell to be consumed authoritatively");
      assert(observed.player.deltaV > 20, `Expected fuel cell to refill delta-v, got ${observed.player.deltaV}`);

      result = await postDebugPlayerState({
        clientId: net.clientId,
        vx: 20,
        vy: 0,
        status: "alive",
      });
      assert(result.ok === true, "Expected debug high velocity to succeed");
      observed = await waitForSnapshotPlayer(
        net.clientId,
        (remotePlayer) => Math.hypot(remotePlayer.vx, remotePlayer.vy) <= 8.01,
        { timeout: 5000 }
      );
      assert(Math.hypot(observed.player.vx, observed.player.vy) <= 8.01,
        `Expected server speed cap near 8 wu/s, got ${Math.hypot(observed.player.vx, observed.player.vy)}`);
    });

    await runner.run("Remote slingshot is resolved by the authoritative sim", async () => {
      const net = await page.evaluate(() => window.__TEST_API.getNetworkState());
      const snapshot = await getSnapshot();
      const well = snapshot.world?.wells?.[0];
      assert(well, "Expected a well anchor for authoritative slingshot test");
      const ws = snapshot.session?.worldScale || 5;
      const startX = ((well.wx + 0.25) % ws + ws) % ws;
      const startY = well.wy;
      const reset = await postDebugPlayerState({
        clientId: net.clientId,
        wx: startX,
        wy: startY,
        vx: 0,
        // The server applies flow/current coupling before the edge-triggered
        // slingshot check, so the fixture needs enough tangential speed to
        // remain above the authoritative gate after that first integration.
        vy: -1.2,
        deltaV: 40,
        status: "alive",
        resetSlingshot: true,
      });
      assert(reset.ok === true, "Expected debug slingshot reset to succeed");

      const engageSeq = Date.now() + 100;
      await postInput({
        clientId: net.clientId,
        seq: engageSeq,
        moveX: 1,
        moveY: 0,
        thrust: 0,
        brake: 0,
        slingshot: true,
        timestamp: Date.now(),
      });
      const engaged = await waitForSnapshotPlayer(
        net.clientId,
        (remotePlayer) => remotePlayer.slingshot?.engaged === true && remotePlayer.slingshot.energy >= 0,
        { timeout: 5000 }
      );
      assert(["well", "star", "planetoid"].includes(engaged.player.slingshot.anchorType),
        `Expected authoritative slingshot anchor, got ${engaged.player.slingshot.anchorType}`);

      const { player: playerBeforeRelease } = await waitForSnapshotPlayer(
        net.clientId,
        (remotePlayer) => remotePlayer.slingshot?.engaged === true && remotePlayer.slingshot.energy > 0,
        { timeout: 5000 }
      );
      const speedBeforeRelease = Math.hypot(playerBeforeRelease.vx, playerBeforeRelease.vy);

      await postInput({
        clientId: net.clientId,
        seq: engageSeq + 1,
        moveX: 1,
        moveY: 0,
        thrust: 0,
        brake: 0,
        slingshot: false,
        timestamp: Date.now(),
      });
      await sleep(120);
      await postInput({
        clientId: net.clientId,
        seq: engageSeq + 2,
        moveX: 1,
        moveY: 0,
        thrust: 0,
        brake: 0,
        slingshot: true,
        timestamp: Date.now(),
      });
      const released = await waitForSnapshotPlayer(
        net.clientId,
        (remotePlayer) =>
          remotePlayer.slingshot?.engaged === false &&
          Math.hypot(remotePlayer.vx, remotePlayer.vy) > speedBeforeRelease + 0.01,
        { timeout: 5000 }
      );
      assert(released.player.slingshot.engaged === false, "Expected authoritative slingshot release");
      assert(Math.hypot(released.player.vx, released.player.vy) > speedBeforeRelease + 0.01,
        `Expected release boost to increase speed, got ${Math.hypot(released.player.vx, released.player.vy)} from ${speedBeforeRelease}`);
    });

    await runner.run("Remote pulse is emitted by the authoritative sim protocol", async () => {
      const net = await page.evaluate(() => window.__TEST_API.getNetworkState());
      const moved = await postDebugPlayerState({
        clientId: net.clientId,
        wx: 1.08,
        wy: 1.22,
        vx: 0,
        vy: 0,
        status: "alive",
      });
      assert(moved.ok === true, "Expected debug move near well before pulse");
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

      // Browser-side disruption rings are presentation; the server event is
      // the authoritative contract this suite needs to guard.
    });

    await runner.run("Remote inventory actions mutate authoritative cargo and loadout", async () => {
      const net = await page.evaluate(() => window.__TEST_API.getNetworkState());
      const resetPlayer = await postDebugPlayerState({
        clientId: net.clientId,
        wx: 1.5,
        wy: 1.5,
        vx: 0,
        vy: 0,
        status: "alive",
      });
      assert(resetPlayer.ok === true, "Expected debug reset to safe alive state before inventory mutation");

      let result = await postInventoryAction({
        clientId: net.clientId,
        action: "unequip",
        equipSlot: 0,
      });
      assert(result.ok === true, "Expected unequip action to succeed");

      let snapshotState = {
        snapshot: result.snapshot,
        player: result.snapshot.players.find((remotePlayer) => remotePlayer.clientId === net.clientId),
      };
      assert(snapshotState.player?.cargo?.some((item) => item?.name === "Pull Dampener"), "Expected unequipped artifact in cargo");

      const cargoSlot = snapshotState.player.cargo.findIndex((item) => item?.name === "Pull Dampener");
      result = await postInventoryAction({
        clientId: net.clientId,
        action: "equipCargo",
        cargoSlot,
        equipSlot: 1,
      });
      assert(result.ok === true, "Expected equipCargo action to succeed");

      snapshotState = {
        snapshot: result.snapshot,
        player: result.snapshot.players.find((remotePlayer) => remotePlayer.clientId === net.clientId),
      };
      assert(snapshotState.player?.equipped?.[1]?.name === "Pull Dampener", "Expected authoritative re-equip into slot 1");

      result = await postInventoryAction({
        clientId: net.clientId,
        action: "unequip",
        equipSlot: 1,
      });
      assert(result.ok === true, "Expected second unequip action to succeed");

      snapshotState = {
        snapshot: result.snapshot,
        player: result.snapshot.players.find((remotePlayer) => remotePlayer.clientId === net.clientId),
      };
      const dropSlot = snapshotState.player.cargo.findIndex(Boolean);
      assert(dropSlot >= 0, "Expected an occupied cargo slot before remote drop");
      result = await postInventoryAction({
        clientId: net.clientId,
        action: "dropCargo",
        cargoSlot: dropSlot,
      });
      assert(result.ok === true, "Expected dropCargo action to succeed");
      const authoritativeDropped = result.snapshot.world.wrecks.find((wreck) => typeof wreck.name === "string" && wreck.name.startsWith("dropped:"));
      assert(authoritativeDropped, "Expected authoritative snapshot to contain dropped wreck");

      const dropSnapshot = await getSnapshot();
      assert(
        dropSnapshot.world?.wrecks?.some((wreck) => wreck.name === authoritativeDropped.name),
        "Expected dropped wreck to remain in authoritative world snapshot"
      );
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
        net.clientId,
        (remotePlayer) =>
          remotePlayer.clientId === net.clientId &&
          Math.hypot(remotePlayer.vx, remotePlayer.vy) > 0.01,
        { timeout: 5000 }
      );
      const afterSpeed = Math.hypot(afterPlayer.vx, afterPlayer.vy);
      assert(afterSpeed > 0.01, `Expected authoritative hazard acceleration, got speed=${afterSpeed}`);
      assert(
        worldWrappedDeltaForTest(beforePlayer.wx, afterPlayer.wx, before.session?.worldScale || 5) > 0.0001 ||
        worldWrappedDeltaForTest(beforePlayer.wy, afterPlayer.wy, before.session?.worldScale || 5) > 0.0001 ||
        afterSpeed > 0.02,
        `Expected authoritative hazard to move or accelerate player, got wx=${afterPlayer.wx} wy=${afterPlayer.wy} speed=${afterSpeed}`
      );
    });

    await runner.run("Remote scavenger death consequences stay authoritative", async () => {
      const scavengers = await page.evaluate(() => window.__TEST_API.getScavengers());
      assert(scavengers.length > 0, "Expected at least one scavenger for remote death test");
      const target = scavengers[0];
      const authoritative = await getSnapshot();
      const targetWell = authoritative.world?.wells?.[0];
      assert(targetWell?.id, "Expected authoritative well for scavenger death test");
      const moved = await postDebugScavengerState({
        scavengerId: target.id || "scav-1",
        wx: targetWell.wx,
        wy: targetWell.wy,
        vx: 0,
        vy: 0,
        lootCount: 2,
        state: "dying",
        alive: true,
        deathTimer: 1.45,
        deathWellId: targetWell.id,
        deathWellWX: targetWell.wx,
        deathWellWY: targetWell.wy,
        deathStartWX: targetWell.wx,
        deathStartWY: targetWell.wy,
      });
      assert(moved.ok === true, "Expected debug scavenger move near well to succeed");

      const events = await waitForEvents(
        (allEvents) => allEvents.some((event) => event.type === "scavenger.consumed" && event.payload?.lootCount >= 2),
        { timeout: 8000 }
      );
      const consumed = events.find((event) => event.type === "scavenger.consumed" && event.payload?.lootCount >= 2);
      assert(consumed, "Expected authoritative scavenger consumed event with loot");

      const deathDropSnapshot = await getSnapshot();
      assert(
        deathDropSnapshot.world?.wrecks?.some((wreck) => wreck.name === `${consumed.payload.name} debris`),
        "Expected authoritative snapshot to contain scavenger debris"
      );
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

      await waitFor(page, () => window.__TEST_API.getRemotePlayers().length >= 1, { timeout: 5000 });
    });

    await runner.run("Remote browser joins live authoritative run instead of resetting to its selected map", async () => {
      ({ browser: browser2, page: page2 } = await launchGame(withQuery(htmlFile, { simServer: SIM_URL })));
      await bootstrapCleanRemotePage(page2);

      await page2.evaluate(() => window.__TEST_API.createTestProfile("Second Browser"));
      const started = await page2.evaluate(() => window.__TEST_API.startRemoteGameNow(2));
      assert(started === true, "Expected second browser to start remote game through test API");

      await waitFor(page2, () => {
        const net = window.__TEST_API.getNetworkState();
        return net.remoteAuthorityActive && net.remoteMapId === "shallows" && typeof net.remoteTick === "number";
      }, { timeout: 12000 });

      const net = await page2.evaluate(() => window.__TEST_API.getNetworkState());
      assert(net.remoteMapId === "shallows", `Expected second browser to join live shallows run, got ${net.remoteMapId}`);

      const snapshot = await getSnapshot();
      assert(snapshot.session.mapId === "shallows", `Expected live authoritative map to stay on shallows, got ${snapshot.session.mapId}`);

      const deniedReset = await postSessionReset({ requesterId: net.clientId });
      assert(deniedReset.status === 403, `Expected non-host reset denial, got ${deniedReset.status}`);

       const leaveResponse = await postLeave({ clientId: net.clientId });
       assert(leaveResponse.ok === true, "Expected browser-backed client leave to succeed");

       const afterLeave = await getSnapshot();
       assert(afterLeave.session.mapId === "shallows", `Expected session map to remain shallows after leave, got ${afterLeave.session.mapId}`);
       assert(
         !afterLeave.players.some((player) => player.clientId === net.clientId),
         "Expected leaving browser client to be removed from authoritative session"
       );

      await browser2.close();
      browser2 = null;
      page2 = null;
    });

    await runner.run("Remote death writes back authoritative profile state", async () => {
      const beforeProfile = await page.evaluate(() => window.__TEST_API.getProfile());
      assert(beforeProfile?.id, "Expected active profile id before remote death");

      const net = await page.evaluate(() => window.__TEST_API.getNetworkState());
      const authoritativeBefore = await getSnapshot();
      const targetWell = authoritativeBefore.world?.wells?.[0];
      assert(targetWell?.wx != null && targetWell?.wy != null, "Expected authoritative well for death test");
      const moved = await postDebugPlayerState({
        clientId: net.clientId,
        wx: targetWell.wx,
        wy: targetWell.wy,
        vx: 0,
        vy: 0,
        status: "alive",
      });
      assert(moved.ok === true, "Expected debug move near well before death");

      const killed = await postDebugPlayerState({
        clientId: net.clientId,
        wx: targetWell.wx,
        wy: targetWell.wy,
        vx: 0,
        vy: 0,
        status: "dead",
        cause: "debug",
      });
      assert(killed.ok === true, "Expected debug death to succeed");
      await waitForSnapshotPlayer(
        net.clientId,
        (remotePlayer) => remotePlayer.status === "dead",
        { timeout: 8000 }
      );
      await waitForEvents(
        (allEvents) => allEvents.some((event) => event.type === "profile.updated" && event.payload?.clientId === net.clientId),
        { timeout: 8000 }
      );

      const persisted = await getProfile(beforeProfile.id);
      assert(persisted.ok === true, "Expected persisted profile lookup to succeed after death");
      assert(persisted.profile.totalDeaths === beforeProfile.totalDeaths + 1, "Expected authoritative death count to increment");

      const health = await fetch(`${SIM_URL}/health`).then((response) => response.json());
      assert(health.session.status === "running", "Expected session to keep running while another human remains active");
    });

    await runner.run("Host leaves and remaining player is promoted", async () => {
      const hostNet = await page.evaluate(() => window.__TEST_API.getNetworkState());
      const leaveResponse = await postLeave({ clientId: hostNet.clientId });
      assert(leaveResponse.ok === true, "Expected host leave to succeed");

      const health = await fetch(`${SIM_URL}/health`).then((response) => response.json());
      assert(
        health.session.hostClientId === "remote-test-second-client",
        `Expected remaining client to be promoted host, got ${health.session.hostClientId}`
      );
    });

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
