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
const directAuthorities = new Map();

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
  await waitFor(page, () => typeof window.__TEST_API?.createTestProfile === "function", { timeout: 12000 });
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
  const authority = directAuthorities.get(body.clientId);
  assert(authority, `No direct protocol authority for ${body.clientId}`);
  authority.commandSeq += 1;
  const response = await fetch(`${SIM_URL}/input`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-lbh-command-credential": authority.commandCredential,
      "x-lbh-player-id": authority.playerId,
      "x-lbh-run-id": authority.runId,
    },
    body: JSON.stringify({
      ...body,
      runId: authority.runId,
      playerId: authority.playerId,
      commandCredential: authority.commandCredential,
      commandSeq: authority.commandSeq,
    }),
  });
  return response.json();
}

async function postJoin(body) {
  const snapshot = await getSnapshot();
  const response = await fetch(`${SIM_URL}/join`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ runId: snapshot.runId || snapshot.session?.runId, ...body }),
  });
  const result = await response.json();
  if (result.authority) {
    directAuthorities.set(result.authority.playerId, {
      ...result.authority,
      commandSeq: result.authority.lastCommandSeq || 0,
    });
  }
  return result;
}

async function postInventoryAction(body) {
  const authority = directAuthorities.get(body.clientId);
  assert(authority, `No direct protocol authority for ${body.clientId}`);
  authority.commandSeq += 1;
  const response = await fetch(`${SIM_URL}/inventory/action`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-lbh-command-credential": authority.commandCredential,
      "x-lbh-player-id": authority.playerId,
      "x-lbh-run-id": authority.runId,
    },
    body: JSON.stringify({
      ...body,
      runId: authority.runId,
      playerId: authority.playerId,
      commandCredential: authority.commandCredential,
      commandSeq: authority.commandSeq,
    }),
  });
  return response.json();
}

async function sendBrowserInput(targetPage, body) {
  return targetPage.evaluate((message) => window.__TEST_API.sendRemoteInput(message), body);
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

async function postDebugPortalState(body) {
  const response = await fetch(`${SIM_URL}/debug/portal-state`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  return response.json();
}

async function postLeave(body) {
  const authority = directAuthorities.get(body.clientId);
  assert(authority, `No direct protocol authority for ${body.clientId}`);
  authority.commandSeq += 1;
  const response = await fetch(`${SIM_URL}/leave`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-lbh-command-credential": authority.commandCredential,
      "x-lbh-player-id": authority.playerId,
      "x-lbh-run-id": authority.runId,
    },
    body: JSON.stringify({
      runId: authority.runId,
      playerId: authority.playerId,
      commandCredential: authority.commandCredential,
      commandSeq: authority.commandSeq,
    }),
  });
  const result = await response.json();
  if (result.ok) directAuthorities.delete(body.clientId);
  return result;
}

async function leaveDirectClient(clientId) {
  if (!directAuthorities.has(clientId)) return;
  const result = await postLeave({ clientId });
  if (!result.ok) throw new Error(`Direct client cleanup failed for ${clientId}: ${JSON.stringify(result)}`);
}

async function withDirectClient(joinRequest, test) {
  const joined = await postJoin(joinRequest);
  assert(joined.ok === true, `Expected ${joinRequest.clientId} to join, got ${JSON.stringify(joined)}`);
  let testError = null;
  try {
    return await test(joined);
  } catch (err) {
    testError = err;
    throw err;
  } finally {
    try {
      await leaveDirectClient(joinRequest.clientId);
    } catch (cleanupError) {
      if (!testError) throw cleanupError;
      console.warn(`${cleanupError.message}; preserving primary failure: ${testError.message}`);
    }
  }
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
  const authority = directAuthorities.get(body.requesterId);
  assert(authority, `No direct protocol authority for ${body.requesterId}`);
  authority.commandSeq += 1;
  const response = await fetch(`${SIM_URL}/session/reset`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-lbh-command-credential": authority.commandCredential,
      "x-lbh-player-id": authority.playerId,
      "x-lbh-run-id": authority.runId,
    },
    body: JSON.stringify({
      requesterId: authority.playerId,
      runId: authority.runId,
      playerId: authority.playerId,
      commandCredential: authority.commandCredential,
      commandSeq: authority.commandSeq,
    }),
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

async function waitForSnapshotPlayerLabel(label, clientId, predicate, options = {}) {
  try {
    return await waitForSnapshotPlayer(clientId, predicate, options);
  } catch (err) {
    throw new Error(`${label}: ${err.message}`);
  }
}

function chooseSafePoint(snapshot, index = 0) {
  const ws = snapshot.session?.worldScale || 5;
  const wells = snapshot.world?.wells || [];
  const candidates = [
    [ws * 0.18, ws * 0.18],
    [ws * 0.82, ws * 0.18],
    [ws * 0.18, ws * 0.82],
    [ws * 0.82, ws * 0.82],
    [ws * 0.50, ws * 0.22],
    [ws * 0.22, ws * 0.50],
    [ws * 0.78, ws * 0.50],
    [ws * 0.50, ws * 0.78],
  ];
  const ranked = candidates.map(([wx, wy], candidateIndex) => {
    let nearest = Infinity;
    for (const well of wells) {
      const dist = Math.hypot(
        worldWrappedDeltaForTest(wx, well.wx, ws),
        worldWrappedDeltaForTest(wy, well.wy, ws)
      );
      nearest = Math.min(nearest, dist);
    }
    return { wx, wy, candidateIndex, nearest };
  }).sort((a, b) => b.nearest - a.nearest || a.candidateIndex - b.candidateIndex);
  return ranked[index % ranked.length] || { wx: ws * 0.5, wy: ws * 0.5 };
}

async function parkBrowserPlayer(targetPage, pointIndex = 0) {
  const net = await targetPage.evaluate(() => window.__TEST_API.getNetworkState());
  const snapshot = await getSnapshot();
  assert(snapshot.session?.status === "running", `Expected a running session while parking ${net.clientId}`);
  const point = chooseSafePoint(snapshot, pointIndex);
  const parked = await postDebugPlayerState({
    clientId: net.clientId,
    wx: point.wx,
    wy: point.wy,
    vx: 0,
    vy: 0,
    status: "alive",
  });
  assert(parked.ok === true, `Expected debug fixture to keep browser player ${net.clientId} alive`);
  return net;
}

async function run() {
  console.log(`\n=== REMOTE AUTHORITY TESTS (${htmlFile}) ===\n`);

  const runner = new TestRunner("RemoteAuthority");
  await startServer();
  await startSimServer(SIM_PORT);

  let browser, page;
  let browser2, page2;
  let promotionClientId = null;
  try {
    ({ browser, page } = await launchGame(withQuery(htmlFile, { simServer: SIM_URL })));
    await bootstrapCleanRemotePage(page);

    async function startFreshSimGroup() {
      if (browser2) {
        await browser2.close();
        browser2 = null;
        page2 = null;
      }
      if (browser) await browser.close();
      browser = null;
      page = null;
      directAuthorities.clear();
      await startSimServer(SIM_PORT);
    }

    async function startFreshRemoteGroup() {
      await startFreshSimGroup();
      ({ browser, page } = await launchGame(withQuery(htmlFile, { simServer: SIM_URL })));
      await bootstrapCleanRemotePage(page);
      await enterRemoteRun(page);
    }

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
      assert(snapshot.inhibitor?.phase === 0, "Expected the scheduled Inhibitor phase to begin at phase 0");
      assert(snapshot.inhibitor?.waveId === "inhibitor:phase-0", "Expected the phase-0 Conductor identity in remote snapshot");
      assert(!("pressure" in (snapshot.inhibitor || {})), "Remote snapshot must not expose Inhibitor pressure");
      assert(!("pressureFrac" in (snapshot.inhibitor || {})), "Remote snapshot must not expose Inhibitor pressureFrac");
      assert(!("threshold" in (snapshot.inhibitor || {})), "Remote snapshot must not expose Inhibitor threshold");
      assert(Array.isArray(snapshot.inhibitor?.schedule?.severityWaves), "Expected scheduled Inhibitor severity waves");
      await parkBrowserPlayer(page, 7);
    });

    await startFreshRemoteGroup();

    await runner.run("Remote debug can force and reset authoritative inhibitor phase and collection state", async () => {
      const forced = await postDebugInhibitorState({
        phase: 2,
      });
      assert(forced.ok === true, "Expected debug inhibitor force to succeed");
      assert(forced.snapshot?.inhibitor?.phase === 2,
        `Expected forced Inhibitor phase 2, got ${forced.snapshot?.inhibitor?.phase}`);

      let current = forced.snapshot;
      const deadline = Date.now() + 5000;
      while (Date.now() < deadline
        && !current.inhibitor?.entities?.some((entity) => entity.kind === "swarm")) {
        await sleep(100);
        current = await getSnapshot();
      }
      const swarm = current.inhibitor?.entities?.find((entity) => entity.kind === "swarm");
      assert(swarm?.kind === "swarm" && swarm.lifecycle !== "expired",
        "Expected phase 2 to publish a live Swarm collection entity");

      const reset = await postDebugInhibitorState({
        phase: 0,
      });
      assert(reset.ok === true, "Expected debug inhibitor reset to succeed");
      assert(reset.snapshot?.inhibitor?.phase === 0,
        `Expected reset Inhibitor phase 0, got ${reset.snapshot?.inhibitor?.phase}`);
    });

    await startFreshSimGroup();

    await runner.run("Remote portal extraction is a server consequence", async () => {
      const clientId = "remote-portal-authority-test";
      const portalId = "portal-authority-test";
      await withDirectClient({ clientId, name: "Portal Authority Test" }, async () => {
        try {
          const snapshot = await getSnapshot();
          const point = chooseSafePoint(snapshot, 0);
          const moved = await postDebugPlayerState({
            clientId,
            wx: point.wx,
            wy: point.wy,
            vx: 0,
            vy: 0,
            status: "alive",
          });
          assert(moved.ok === true,
            `Expected debug player placement before portal extraction, got ${JSON.stringify(moved)}`);

          const baselineEvents = await getEvents(0);
          const baselineSeq = baselineEvents.reduce((max, event) => Math.max(max, event.seq || 0), 0);
          const portal = await postDebugPortalState({
            id: portalId,
            wx: point.wx,
            wy: point.wy,
            type: "standard",
            alive: true,
            blockedByInhibitor: false,
            lifespan: 30,
            opacity: 1,
          });
          assert(portal.ok === true, `Expected debug portal placement, got ${JSON.stringify(portal)}`);

          const { player: readyPlayer } = await waitForSnapshotPlayer(
            clientId,
            (remotePlayer) => remotePlayer.status === "alive" &&
              remotePlayer.portalInteraction?.portalId === portalId &&
              remotePlayer.portalInteraction.ready === true,
            { timeout: 8000 }
          );
          assert(readyPlayer.status === "alive", "Expected portal residence to wait for explicit confirmation");
          const confirm = await postInput({
            clientId,
            seq: 1,
            moveX: 0,
            moveY: 0,
            extractConfirm: true,
          });
          assert(confirm.ok === true, `Expected extraction confirmation input, got ${JSON.stringify(confirm)}`);
          const { player } = await waitForSnapshotPlayer(
            clientId,
            (remotePlayer) => remotePlayer.status === "escaped",
            { timeout: 8000 }
          );
          assert(player.status === "escaped", `Expected player to escape, got ${player.status}`);
          const events = await waitForEvents(
            (allEvents) => allEvents.some((event) =>
              event.seq > baselineSeq &&
              event.type === "player.escaped" &&
              event.payload?.clientId === clientId &&
              event.payload?.portalId === portalId
            ),
            { timeout: 5000 }
          );
          assert(events.some((event) => event.seq > baselineSeq && event.type === "player.escaped" && event.payload?.portalId === portalId),
            "Expected authoritative escaped event for the debug portal");
        } finally {
          await postDebugPortalState({ id: portalId, alive: false, blockedByInhibitor: false });
        }
      });
    });

    await startFreshSimGroup();

    await runner.run("Remote star or planetoid push is server-authored", async () => {
      const clientId = "remote-push-authority-test";
      await withDirectClient({ clientId, name: "Push Authority Test" }, async () => {
        const snapshot = await getSnapshot();
        const ws = snapshot.session?.worldScale || 5;
        const wells = snapshot.world?.wells || [];
        const safeSource = (entries) => (entries || [])
          .filter((entry) => entry.alive !== false)
          .map((entry) => ({
            entry,
            wellClearance: wells.reduce((best, well) => Math.min(best, Math.hypot(
              worldWrappedDeltaForTest(entry.wx, well.wx, ws),
              worldWrappedDeltaForTest(entry.wy, well.wy, ws)
            )), Infinity),
          }))
          .sort((a, b) => b.wellClearance - a.wellClearance)[0]?.entry;
        const star = safeSource(snapshot.world?.stars);
        const planetoid = safeSource(snapshot.world?.planetoids);
        const source = star || planetoid;
        const forceComponent = star ? "solarWind" : "bodyPush";
        assert(source, "Expected an authoritative star or planetoid for push test");
        const offset = star ? 0.24 : 0.04;
        const placed = await postDebugPlayerState({
          clientId,
          wx: ((source.wx + offset) % ws + ws) % ws,
          wy: source.wy,
          vx: 0,
          vy: 0,
          status: "alive",
        });
        assert(placed.ok === true, "Expected debug player placement before push test");
        const placementTick = placed.snapshot?.tick || snapshot.tick || 0;

        const { player } = await waitForSnapshotPlayer(
          clientId,
          (remotePlayer, currentSnapshot) =>
            remotePlayer.status === "alive" &&
            currentSnapshot.tick > placementTick &&
            Number(remotePlayer.forceLedger?.vectors?.[forceComponent]?.x) > 0.01,
          { timeout: 8000 }
        );
        assert(player.forceLedger.vectors[forceComponent].x > 0.01,
          `Expected outward server-authored ${forceComponent}, got ${JSON.stringify(player.forceLedger.vectors[forceComponent])}`);
      });
    });

    await startFreshSimGroup();

    await runner.run("Remote scavenger contact bumps the player", async () => {
      const clientId = "remote-scavenger-bump-test";
      await withDirectClient({ clientId, name: "Scavenger Bump Test" }, async () => {
        const snapshot = await getSnapshot();
        const scavenger = snapshot.world?.scavengers?.find((entry) => entry.alive !== false);
        assert(scavenger?.id, "Expected an authoritative scavenger for contact test");
        try {
          const point = chooseSafePoint(snapshot, 1);
          const playerPlaced = await postDebugPlayerState({
            clientId,
            wx: point.wx,
            wy: point.wy,
            vx: 0,
            vy: 0,
            status: "alive",
          });
          assert(playerPlaced.ok === true, "Expected debug player placement before scavenger bump");
          const scavPlaced = await postDebugScavengerState({
            scavengerId: scavenger.id,
            wx: point.wx + 0.02,
            wy: point.wy,
            vx: 0,
            vy: 0,
            state: "drift",
            alive: true,
          });
          assert(scavPlaced.ok === true, "Expected debug scavenger placement before bump");

          const { player } = await waitForSnapshotPlayer(
            clientId,
            (remotePlayer) => remotePlayer.status === "alive" && Math.hypot(remotePlayer.vx, remotePlayer.vy) > 0.05,
            { timeout: 8000 }
          );
          assert(Math.hypot(player.vx, player.vy) > 0.05,
            `Expected scavenger contact impulse, got vx=${player.vx} vy=${player.vy}`);
        } finally {
          await postDebugScavengerState({
            scavengerId: scavenger.id,
            wx: scavenger.wx,
            wy: scavenger.wy,
            vx: scavenger.vx,
            vy: scavenger.vy,
            state: scavenger.state,
            alive: scavenger.alive !== false,
          });
        }
      });
    });

    await startFreshSimGroup();

    await runner.run("Remote Noise stays quiet for thrust that cannot be delivered", async () => {
      const clientId = "remote-noise-output-test";
      await withDirectClient({ clientId, name: "Noise Output Test" }, async () => {
        const snapshot = await getSnapshot();
        const point = chooseSafePoint(snapshot, 2);
        const placed = await postDebugPlayerState({
          clientId,
          wx: point.wx,
          wy: point.wy,
          vx: 0,
          vy: 0,
          deltaV: 0,
          noiseRadiusMeters: 0,
          timeSinceThrust: 0,
          status: "alive",
        });
        assert(placed.ok === true, "Expected debug player placement before Noise output test");
        const beforeTick = placed.snapshot?.tick || snapshot.tick || 0;

        await postInput({
          clientId,
          seq: Date.now() + 99,
          moveX: 1,
          moveY: 0,
          thrust: 1,
          brake: 0,
          consumeSlot: null,
          timestamp: Date.now(),
        });

        const { player, snapshot: after } = await waitForSnapshotPlayer(
          clientId,
          (remotePlayer, currentSnapshot) =>
            currentSnapshot.tick >= beforeTick + 4 &&
            Number(remotePlayer.noise?.audibleRadiusMeters) <= 1,
          { timeout: 8000 }
        );
        assert(Number(player.noise?.audibleRadiusMeters) <= 1,
          `Expected empty-tank thrust intent not to create Noise by tick ${after.tick}, got ${player.noise?.audibleRadiusMeters}`);
      });
    });

    await startFreshRemoteGroup();

    await runner.run("Remote snapshots advance and move the ship under authoritative input", async () => {
      await parkBrowserPlayer(page, 3);
      const before = await page.evaluate(() => ({
        net: window.__TEST_API.getNetworkState(),
        pos: window.__TEST_API.getShipPos(),
      }));
      const beforeServer = await getSnapshot();
      const beforePlayer = beforeServer.players?.find((entry) => entry.clientId === before.net.clientId);
      assert(beforePlayer, "Expected local browser player in authoritative snapshot");

      for (let i = 0; i < 5; i++) {
        await sendBrowserInput(page, {
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

    await startFreshSimGroup();

    await runner.run("Remote delta-v gates brake, fuel cells, and speed cap", async () => {
      const clientId = "remote-delta-v-authority-test";
      await withDirectClient({
        clientId,
        name: "Delta-V Authority Test",
        consumables: [null, {
          id: "fuel-cell-fixture",
          name: "Test Fuel Cell",
          category: "artifact",
          subcategory: "consumable",
          tier: "common",
          value: 35,
          useEffect: "fuelRefill",
          amount: 35,
          charges: 1,
        }],
      }, async () => {
        let result = await postDebugPlayerState({
          clientId,
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
          clientId,
          seq: Date.now() + 10,
          moveX: 1,
          moveY: 0,
          thrust: 0,
          brake: 1,
          consumeSlot: null,
          timestamp: Date.now(),
        });
        let observed = await waitForSnapshotPlayerLabel(
          "delta-v brake",
          clientId,
          (remotePlayer) => Math.hypot(remotePlayer.vx, remotePlayer.vy) > 0.001 && remotePlayer.deltaV < 20,
          { timeout: 5000 }
        );
        assert(Math.hypot(observed.player.vx, observed.player.vy) > 0.001,
          `Expected brake input to produce authoritative motion, got vx=${observed.player.vx} vy=${observed.player.vy}`);
        assert(observed.player.deltaV < 20, `Expected brake to spend delta-v, got ${observed.player.deltaV}`);

        result = await postDebugPlayerState({
          clientId,
          vx: 0,
          vy: 0,
          deltaV: 0,
          timeSinceThrust: 0,
          status: "alive",
        });
        assert(result.ok === true, "Expected debug empty tank to succeed");
        await postInput({
          clientId,
          seq: Date.now() + 20,
          moveX: 1,
          moveY: 0,
          thrust: 1,
          brake: 0,
          consumeSlot: 1,
          timestamp: Date.now(),
        });
        observed = await waitForSnapshotPlayerLabel(
          "delta-v fuel cell",
          clientId,
          (remotePlayer) => remotePlayer.consumables?.[1] === null && remotePlayer.deltaV > 20,
          { timeout: 5000 }
        );
        assert(observed.player.consumables[1] === null, "Expected fuel cell to be consumed authoritatively");
        assert(observed.player.deltaV > 20, `Expected fuel cell to refill delta-v, got ${observed.player.deltaV}`);

        result = await postDebugPlayerState({
          clientId,
          vx: 20,
          vy: 0,
          status: "alive",
        });
        assert(result.ok === true, "Expected debug high velocity to succeed");
        observed = await waitForSnapshotPlayerLabel(
          "delta-v speed cap",
          clientId,
          (remotePlayer) => Math.hypot(remotePlayer.vx, remotePlayer.vy) <= 8.01,
          { timeout: 5000 }
        );
        assert(Math.hypot(observed.player.vx, observed.player.vy) <= 8.01,
          `Expected server speed cap near 8 wu/s, got ${Math.hypot(observed.player.vx, observed.player.vy)}`);
      });
    });

    await startFreshRemoteGroup();

    await runner.run("Remote slingshot is resolved by the authoritative sim", async () => {
      await parkBrowserPlayer(page, 6);
      const net = await page.evaluate(() => window.__TEST_API.getNetworkState());
      const snapshot = await getSnapshot();
      const well = snapshot.world?.wells?.[0];
      const anchor = well;
      assert(anchor, "Expected a well anchor for authoritative slingshot test");
      const ws = snapshot.session?.worldScale || 5;
      // The authored well is the stable public Grapple Arc fixture. Dynamic
      // star/planetoid positions can move a browser input edge past its
      // capture window before the authority consumes it.
      const startOffset = 0.20;
      const startX = ((anchor.wx + startOffset) % ws + ws) % ws;
      const startY = anchor.wy;
      const reset = await postDebugPlayerState({
        clientId: net.clientId,
        wx: startX,
        wy: startY,
        vx: 0,
        // Any nonzero approach is eligible in Grapple Arc v3.
        vy: -1.2,
        deltaV: 40,
        status: "alive",
        resetSlingshot: true,
      });
      assert(reset.ok === true, "Expected debug slingshot reset to succeed");
      const resetPlayer = reset.snapshot?.players?.find((entry) => entry.clientId === net.clientId);
      assert(resetPlayer?.status === "alive", "Expected slingshot fixture player to be alive");
      assert(resetPlayer.slingshot?.engaged === false, "Expected slingshot fixture to reset the engaged state");
      assert(worldWrappedDeltaForTest(resetPlayer.wx, startX, ws) < 0.03 &&
        worldWrappedDeltaForTest(resetPlayer.wy, startY, ws) < 0.03,
      "Expected slingshot fixture placement in the authoritative debug response");
      assert(Math.abs(resetPlayer.vy + 1.2) < 0.2,
        `Expected slingshot fixture tangential velocity, got ${resetPlayer.vy}`);

      const captureEventWatermark = Math.max(0, ...(await getEvents(0)).map((event) => event.seq || 0));
      // Drive the real browser input loop. A one-off sendRemoteInput call is
      // immediately superseded by that loop's actual false held level, which
      // correctly releases the grapple before a snapshot poll can observe it.
      let slingshotKeyHeld = false;
      await page.keyboard.down("KeyF");
      slingshotKeyHeld = true;
      try {
        await waitFor(page, () => window.__TEST_API.getInputState()?.slingshot === true, { timeout: 3000 });
        const captureEvents = await waitForEvents((events) => events.some((event) =>
          event.seq > captureEventWatermark
            && event.type === "player.slingshotEngaged"
            && event.payload?.clientId === net.clientId
        ));
        const captureEvent = captureEvents.find((event) =>
          event.seq > captureEventWatermark
            && event.type === "player.slingshotEngaged"
            && event.payload?.clientId === net.clientId
        );
        assert(captureEvent, "Expected the browser edge to produce an authoritative capture event");
        assert(captureEvent.payload?.phase === "arc",
          `Expected capture event phase=arc, got ${captureEvent.payload?.phase}`);
        const engaged = await waitForSnapshotPlayerLabel(
          "slingshot engage",
          net.clientId,
          (remotePlayer) => remotePlayer.slingshot?.engaged === true
            && remotePlayer.slingshot.phase === "arc"
            && remotePlayer.slingshot.arcSpeed > 0,
          { timeout: 10000 }
        );
        assert(["well", "star", "planetoid"].includes(engaged.player.slingshot.anchorType),
          `Expected authoritative slingshot anchor, got ${engaged.player.slingshot.anchorType}`);

        const readyToRelease = await waitForSnapshotPlayerLabel(
          "grapple flat boost",
          net.clientId,
          (remotePlayer) => remotePlayer.slingshot?.engaged === true
            && remotePlayer.slingshot.arcSpeed > remotePlayer.slingshot.entrySpeed,
          { timeout: 10000 }
        );
        const playerBeforeRelease = readyToRelease.player;
        assert(Math.hypot(playerBeforeRelease.vx, playerBeforeRelease.vy) > 0.01,
          "Expected grappled player to have arc speed before release");

        const eventsBeforeRelease = await getEvents(0);
        const lastSeqBeforeRelease = eventsBeforeRelease.reduce((max, event) => Math.max(max, event.seq || 0), 0);
        await page.keyboard.up("KeyF");
        slingshotKeyHeld = false;
        const releaseEvents = await waitForEvents(
          (events) => events.some((event) =>
            event.seq > lastSeqBeforeRelease &&
            event.type === "player.slingshotReleased" &&
            event.payload?.clientId === net.clientId &&
            event.payload.boostAwarded > 0
          ),
          { timeout: 10000 }
        );
        const releaseEvent = releaseEvents.find((event) =>
          event.seq > lastSeqBeforeRelease &&
            event.type === "player.slingshotReleased" &&
            event.payload?.clientId === net.clientId
        );
        const released = await waitForSnapshotPlayerLabel(
          "slingshot release snapshot",
          net.clientId,
          (remotePlayer) => remotePlayer.slingshot?.engaged === false,
          { timeout: 10000 }
        );
        assert(released.player.slingshot.engaged === false, "Expected authoritative slingshot release");
        assert(releaseEvent?.payload?.boostAwarded > 0,
          `Expected positive authoritative flat grapple bonus, got ${JSON.stringify(releaseEvent)}`);
      } finally {
        if (slingshotKeyHeld) await page.keyboard.up("KeyF");
      }
    });

    await runner.run("Remote pulse is emitted by the authoritative sim protocol", async () => {
      await parkBrowserPlayer(page, 5);
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
      await sendBrowserInput(page, {
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

    await startFreshSimGroup();

    await runner.run("Remote inventory actions mutate authoritative cargo and loadout", async () => {
      const clientId = "remote-inventory-authority-test";
      await withDirectClient({
        clientId,
        name: "Inventory Authority Test",
        equipped: [{
          id: "pull-dampener-fixture",
          name: "Pull Dampener",
          category: "artifact",
          subcategory: "equippable",
          tier: "rare",
          value: 450,
          effect: "reduceWellPull",
        }],
      }, async () => {
        const resetPlayer = await postDebugPlayerState({
          clientId,
          wx: 1.5,
          wy: 1.5,
          vx: 0,
          vy: 0,
          status: "alive",
        });
        assert(resetPlayer.ok === true, "Expected debug reset to safe alive state before inventory mutation");

        let result = await postInventoryAction({
          clientId,
          action: "unequip",
          equipSlot: 0,
        });
        assert(result.ok === true, "Expected unequip action to succeed");

        let snapshotState = {
          snapshot: result.snapshot,
          player: result.snapshot.players.find((remotePlayer) => remotePlayer.clientId === clientId),
        };
        assert(snapshotState.player?.cargo?.some((item) => item?.name === "Pull Dampener"), "Expected unequipped artifact in cargo");

        const cargoSlot = snapshotState.player.cargo.findIndex((item) => item?.name === "Pull Dampener");
        result = await postInventoryAction({
          clientId,
          action: "equipCargo",
          cargoSlot,
          equipSlot: 1,
        });
        assert(result.ok === true, "Expected equipCargo action to succeed");

        snapshotState = {
          snapshot: result.snapshot,
          player: result.snapshot.players.find((remotePlayer) => remotePlayer.clientId === clientId),
        };
        assert(snapshotState.player?.equipped?.[1]?.name === "Pull Dampener", "Expected authoritative re-equip into slot 1");

        result = await postInventoryAction({
          clientId,
          action: "unequip",
          equipSlot: 1,
        });
        assert(result.ok === true, "Expected second unequip action to succeed");

        snapshotState = {
          snapshot: result.snapshot,
          player: result.snapshot.players.find((remotePlayer) => remotePlayer.clientId === clientId),
        };
        const dropSlot = snapshotState.player.cargo.findIndex(Boolean);
        assert(dropSlot >= 0, "Expected an occupied cargo slot before remote drop");
        result = await postInventoryAction({
          clientId,
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
    });

    await startFreshSimGroup();

    await runner.run("Human joins cannot select internal prototype hulls", async () => {
      const clientId = "internal-hull-authority-test";
      await withDirectClient({ clientId, name: "Roster Test", hullType: "resonant" }, async (joined) => {
        assert(joined.player?.hullType === "drifter",
          `Expected internal hull request to normalize to Drifter, got ${joined.player?.hullType}`);
      });
    });

    await startFreshRemoteGroup();

    await runner.run("Remote authoritative hazards push the player without local fallback", async () => {
      await parkBrowserPlayer(page, 3);
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
      await parkBrowserPlayer(page, 7);
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

    await startFreshRemoteGroup();

    await runner.run("Second client joins existing authoritative session", async () => {
      await parkBrowserPlayer(page, 6);
      await withDirectClient({
        clientId: "remote-test-second-client",
        name: "Second Client",
      }, async () => {
        const snapshot = await getSnapshot();
        assert(snapshot.players.length >= 2, `Expected at least 2 remote players, got ${snapshot.players.length}`);
        assert(snapshot.session.mapId === "shallows", `Expected shared session on shallows, got ${snapshot.session.mapId}`);
        await waitFor(page, () => window.__TEST_API.getRemotePlayers().length >= 1, { timeout: 5000 });

        const deniedReset = await postSessionReset({ requesterId: "remote-test-second-client" });
        assert(deniedReset.status === 403, `Expected non-host reset denial, got ${deniedReset.status}`);
      });
    });

    await startFreshRemoteGroup();

    await runner.run("Remote browser joins live authoritative run instead of resetting to its selected map", async () => {
      ({ browser: browser2, page: page2 } = await launchGame(withQuery(htmlFile, { simServer: SIM_URL })));
      await waitFor(page2, () => typeof window.__TEST_API?.createTestProfile === "function", { timeout: 12000 });

      await page2.evaluate(() => window.__TEST_API.createTestProfile("Second Browser"));
      const started = await page2.evaluate(() => window.__TEST_API.startRemoteGameNow(2));
      assert(started === true, "Expected second browser to start remote game through test API");

      await waitFor(page2, () => {
        const net = window.__TEST_API.getNetworkState();
        return net.remoteAuthorityActive && net.remoteMapId === "shallows" && typeof net.remoteTick === "number";
      }, { timeout: 12000 });

      const net = await page2.evaluate(() => window.__TEST_API.getNetworkState());
      assert(net.remoteMapId === "shallows", `Expected second browser to join live shallows run, got ${net.remoteMapId}`);
      promotionClientId = net.clientId;

      const snapshot = await getSnapshot();
      assert(snapshot.session.mapId === "shallows", `Expected live authoritative map to stay on shallows, got ${snapshot.session.mapId}`);
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
      const persisted = await getProfile(beforeProfile.id);
      assert(persisted.ok === true, "Expected persisted profile lookup to succeed after death");
      assert(persisted.profile.totalDeaths === beforeProfile.totalDeaths + 1, "Expected authoritative death count to increment");
      assert(Array.isArray(persisted.recentRuns) && persisted.recentRuns.length > 0,
        "Expected the profile endpoint to return authoritative recent runs");
      assert(Array.isArray(persisted.profile.runRecords) && persisted.profile.runRecords.length === persisted.recentRuns.length,
        "Expected Chronicle-compatible run records on the returned profile");

      const health = await fetch(`${SIM_URL}/health`).then((response) => response.json());
      assert(health.session.status === "running", "Expected session to keep running while another human remains active");
    });

    await runner.run("Host leaves and remaining player is promoted", async () => {
      const hostNet = await page.evaluate(() => window.__TEST_API.getNetworkState());
      await waitForPhase(page, "dead", 8000);
      await page.evaluate(() => window.__TEST_API.showRunResultsFixture(null, "dead"));
      await sleep(180);
      await tap(page, "Enter", "Enter");
      const leaveDeadline = Date.now() + 8000;
      while (Date.now() < leaveDeadline) {
        const snapshot = await getSnapshot();
        if (!snapshot.players.some((entry) => entry.clientId === hostNet.clientId)) break;
        await sleep(100);
      }
      const afterHostLeave = await getSnapshot();
      assert(!afterHostLeave.players.some((entry) => entry.clientId === hostNet.clientId),
        "Expected host to leave through its authenticated end-screen flow");

      const health = await fetch(`${SIM_URL}/health`).then((response) => response.json());
      assert(
        health.session.hostClientId === promotionClientId,
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
