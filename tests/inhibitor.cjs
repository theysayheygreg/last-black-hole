/**
 * inhibitor.cjs — Authoritative Inhibitor behavior tests.
 *
 * These are sim-server tests because the Inhibitor owns match-ending rules:
 * forms, decoy targeting, portal blocking, and death causes must be true
 * before any renderer/HUD treatment can be trusted.
 */
const {
  startSimServer,
  stopSimServer,
  TestRunner,
  assert,
} = require("./helpers.cjs");

const SIM_PORT = Number(process.env.LBH_INHIBITOR_SIM_PORT || 8816);
const SIM_URL = `http://127.0.0.1:${SIM_PORT}`;
const CLIENT_ID = "inhibitor-human";
let authority = null;
let commandSeq = 0;

function sleep(ms) { return new Promise((resolve) => setTimeout(resolve, ms)); }

function worldDistance(aX, aY, bX, bY, worldScale = 5) {
  const dx = Math.min(Math.abs(bX - aX), worldScale - Math.abs(bX - aX));
  const dy = Math.min(Math.abs(bY - aY), worldScale - Math.abs(bY - aY));
  return Math.hypot(dx, dy);
}

async function request(path, body = null, { authorized = false } = {}) {
  const envelope = authorized ? {
    runId: authority.runId,
    playerId: authority.playerId,
    commandCredential: authority.commandCredential,
    commandSeq: ++commandSeq,
  } : {};
  const response = await fetch(`${SIM_URL}${path}`, body == null ? undefined : {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(authorized ? {
        "x-lbh-command-credential": authority.commandCredential,
        "x-lbh-player-id": authority.playerId,
        "x-lbh-run-id": authority.runId,
      } : {}),
    },
    body: JSON.stringify({ ...body, ...envelope }),
  });
  const json = await response.json();
  if (!response.ok || json.ok === false) {
    throw new Error(`${path} failed: ${response.status} ${json.error || JSON.stringify(json)}`);
  }
  return json;
}

async function getSnapshot() {
  return request("/snapshot");
}

async function startRun({ hullType = "drifter", seed = 4242 } = {}) {
  const started = await request("/session/start", {
    mapId: "shallows",
    requesterId: CLIENT_ID,
    requesterName: "Inhibitor Harness",
    maxPlayers: 1,
    seed,
  }, { authorized: Boolean(authority) });
  const joined = await request("/join", {
    runId: started.session.runId,
    clientId: CLIENT_ID,
    name: "Inhibitor Pilot",
    hullType: "drifter",
    joinTicket: started.joinTicket,
  });
  authority = joined.authority;
  commandSeq = authority.lastCommandSeq || 0;
  assert(joined.player?.clientId === CLIENT_ID, "Expected harness player to join");
  if (hullType !== "drifter") {
    await request("/debug/player-state", { clientId: CLIENT_ID, hullType });
  }
  return joined.player;
}

async function waitForSnapshot(predicate, { timeout = 5000, interval = 80 } = {}) {
  const deadline = Date.now() + timeout;
  let last = null;
  while (Date.now() < deadline) {
    last = await getSnapshot();
    if (predicate(last)) return last;
    await sleep(interval);
  }
  throw new Error(`Timed out waiting for snapshot predicate; last tick=${last?.tick}`);
}

async function postDebugPlayerState(body) {
  return request("/debug/player-state", { clientId: CLIENT_ID, ...body });
}

async function postDebugInhibitorState(body) {
  return request("/debug/inhibitor-state", body);
}

async function postDebugPortalState(body) {
  return request("/debug/portal-state", body);
}

async function postInput(body) {
  return request("/input", {
    seq: Date.now(),
    moveX: 0,
    moveY: 0,
    thrust: 0,
    brake: 0,
    ...body,
  }, { authorized: true });
}

async function run() {
  console.log(`\n=== INHIBITOR TESTS (sim ${SIM_PORT}) ===\n`);
  const runner = new TestRunner("Inhibitor");
  await startSimServer(SIM_PORT, { keepAlive: true, idleShutdownMs: 5000 });

  try {
    await runner.run("Conductor clock is seed-stable, announced, ordered, and pressure-free", async () => {
      await startRun({ seed: 1000 });
      const first = await getSnapshot();
      const clock = first.inhibitor;
      assert(clock.phase === 0 && clock.form === 0, "Expected phase 0/form 0 at match start");
      assert(clock.waveId === "inhibitor:phase-0", "Expected stable phase-0 identity");
      assert(!("pressure" in clock) && !("pressureFrac" in clock) && !("threshold" in clock),
        "Inhibitor snapshot must not expose pressure or threshold fields");

      const waves = clock.schedule?.severityWaves || [];
      assert(waves.length === 3, `Expected three scheduled Inhibitor waves, got ${waves.length}`);
      assert(waves.every((wave, index) =>
        wave.announced === true && wave.tier === index + 1 && wave.metadata?.phase === index + 1
      ), `Expected announced tiered waves, got ${JSON.stringify(waves)}`);
      assert(JSON.stringify(waves.map((wave) => wave.time)) === JSON.stringify([90, 180, 270]),
        `Expected 90-second grace and even 90-second phases, got ${waves.map((wave) => wave.time)}`);
      assert(waves[2].time + 60 < 600, "Expected the provisional phase-3 plus final-portal delay to stay inside RUN_DURATION");
      assert(waves.every((wave, index) => index === 0 || wave.time > waves[index - 1].time),
        "Expected strictly ordered wave times");
      assert(waves.every((wave) => Number.isFinite(wave.budget) && wave.budget > 0),
        "Expected positive wave budget metadata");
      assert(first.recentEvents.some((event) =>
        event.type === "inhibitor.waveAnnounced" &&
        event.payload?.waveId === "inhibitor:phase-0" &&
        event.payload?.phase === 0 &&
        event.payload?.announced === true
      ), "Expected announced phase-0 event identity in the authoritative journal");
      for (const event of first.recentEvents.filter((entry) => entry.type.startsWith("inhibitor."))) {
        assert(!("pressure" in (event.payload || {})) && !("pressureFrac" in (event.payload || {})) && !("threshold" in (event.payload || {})),
          `Inhibitor event exposed stale pressure fields: ${JSON.stringify(event)}`);
      }

      await startRun({ seed: 1000 });
      const second = await getSnapshot();
      assert(JSON.stringify(second.inhibitor.schedule) === JSON.stringify(clock.schedule),
        "Expected identical phase/wave schedule for identical authoritative seed and config");
      assert(second.inhibitor.phase === 0 && second.inhibitor.form === 0,
        "Expected a restarted match to return to phase 0/form 0");
    });

    await runner.run("form times drive Vessel final portal timing", async () => {
      await startRun({ seed: 1001 });
      await postDebugPlayerState({ wx: 0.7, wy: 0.7, signalLevel: 0.25 });

      const form1 = await postDebugInhibitorState({ form: 1, wx: 4.2, wy: 4.2 });
      assert(form1.snapshot.inhibitor.formTimes[1] != null, "Form 1 should record first-seen sim time");

      const form2 = await postDebugInhibitorState({ form: 2, wx: 4.2, wy: 4.2 });
      assert(form2.snapshot.inhibitor.formTimes[2] != null, "Form 2 should record first-seen sim time");

      const snap = await getSnapshot();
      await postDebugInhibitorState({
        form: 3,
        wx: 4.2,
        wy: 4.2,
        formTimes: [null, form1.snapshot.inhibitor.formTimes[1], form2.snapshot.inhibitor.formTimes[2], snap.simTime - 61],
        finalPortalSpawned: false,
      });

      const spawned = await waitForSnapshot((snapshot) =>
        snapshot.inhibitor.finalPortalSpawned === true &&
        snapshot.world.portals.some((portal) => portal.finalInhibitor && portal.alive !== false)
      );
      const finalPortal = spawned.world.portals.find((portal) => portal.finalInhibitor);
      assert(finalPortal.blockedByInhibitor !== true, "Guaranteed final portal must start usable");
      const ws = spawned.session?.worldScale || 5;
      const nearestWellClearance = spawned.world.wells.reduce((nearest, well) => {
        const clearance = worldDistance(well.wx, well.wy, finalPortal.wx, finalPortal.wy, ws) - (Number(well.killRadius) || 0);
        return Math.min(nearest, clearance);
      }, Infinity);
      assert(nearestWellClearance >= 0.18,
        `Guaranteed final portal must clear lethal well space, got clearance ${nearestWellClearance.toFixed(3)}`);
    });

    await runner.run("Vessel blocks and unblocks portals without destroying them", async () => {
      await startRun({ seed: 1002 });
      await postDebugPlayerState({ wx: 3.7, wy: 3.7, signalLevel: 0.4 });
      await postDebugPortalState({
        portalId: "test-exit",
        wx: 1.0,
        wy: 1.0,
        lifespan: 120,
        alive: true,
        blockedByInhibitor: false,
      });
      await postDebugInhibitorState({ form: 3, wx: 1.04, wy: 1.04 });

      const blocked = await waitForSnapshot((snapshot) => {
        const portal = snapshot.world.portals.find((entry) => entry.id === "test-exit");
        return portal?.alive !== false && portal.blockedByInhibitor === true;
      });
      const blockedPortal = blocked.world.portals.find((entry) => entry.id === "test-exit");
      assert(blockedPortal.alive === true, "Blocked portal should remain alive for later unblocking");

      await postDebugInhibitorState({ form: 0 });
      const unblocked = await waitForSnapshot((snapshot) => {
        const portal = snapshot.world.portals.find((entry) => entry.id === "test-exit");
        return portal?.alive !== false && portal.blockedByInhibitor !== true;
      });
      assert(unblocked.world.portals.find((entry) => entry.id === "test-exit").alive === true, "Unblocked portal should still be alive");
    });

    await runner.run("Shroud decoy attracts Swarm while Vessel pursues the real player", async () => {
      await startRun({ hullType: "shroud", seed: 1003 });
      await postDebugPlayerState({ wx: 1.0, wy: 1.0, vx: 0, vy: 0, signalLevel: 0.5 });
      await postInput({ ability2: true });

      const withDecoy = await waitForSnapshot((snapshot) => {
        const player = snapshot.players.find((entry) => entry.clientId === CLIENT_ID);
        return player?.abilityState?.decoys?.length > 0;
      });
      const decoy = withDecoy.players.find((entry) => entry.clientId === CLIENT_ID).abilityState.decoys[0];

      await postDebugPlayerState({ wx: 3.0, wy: 3.0, vx: 0, vy: 0, signalLevel: 0.05 });
      await postDebugInhibitorState({
        form: 2,
        wx: 2.0,
        wy: 2.0,
        swarmTrackTimer: 3.5,
      });

      const swarmTrackedDecoy = await waitForSnapshot((snapshot) =>
        worldDistance(snapshot.inhibitor.targetWX, snapshot.inhibitor.targetWY, decoy.wx, decoy.wy, snapshot.session.worldScale) < 0.25
      );
      assert(swarmTrackedDecoy.inhibitor.form === 2, "Expected active Swarm form");

      await postDebugInhibitorState({ form: 3, wx: 2.0, wy: 2.0 });
      const before = await getSnapshot();
      const beforeDist = worldDistance(before.inhibitor.wx, before.inhibitor.wy, 3.0, 3.0, before.session.worldScale);
      await sleep(1000);
      const after = await getSnapshot();
      const afterDist = worldDistance(after.inhibitor.wx, after.inhibitor.wy, 3.0, 3.0, after.session.worldScale);
      assert(afterDist < beforeDist - 0.02, `Expected Vessel to move toward real player (${beforeDist} -> ${afterDist})`);
    });

    await runner.run("Vessel kill publishes the Inhibitor death cause", async () => {
      await startRun({ seed: 1004 });
      await postDebugPlayerState({ wx: 2.0, wy: 2.0, vx: 0, vy: 0, signalLevel: 0.8 });
      await postDebugInhibitorState({ form: 3, wx: 2.01, wy: 2.01 });

      const dead = await waitForSnapshot((snapshot) => {
        const player = snapshot.players.find((entry) => entry.clientId === CLIENT_ID);
        return player?.status === "dead" &&
          snapshot.recentEvents.some((event) => event.type === "player.died" && event.payload?.cause === "inhibitor_vessel");
      });
      const death = dead.recentEvents.find((event) => event.type === "player.died" && event.payload?.cause === "inhibitor_vessel");
      assert(death.payload.clientId === CLIENT_ID, "Expected death event for harness player");
    });

    await runner.run("Swarm disturbance accelerates nearby wreck drift", async () => {
      await startRun({ seed: 1005 });
      const before = await getSnapshot();
      const wreck = before.world.wrecks.find((entry) => entry.alive !== false);
      assert(wreck, "Expected a wreck in the test map");

      await postDebugInhibitorState({
        form: 2,
        wx: wreck.wx - 0.08,
        wy: wreck.wy,
        intensity: 1,
      });

      const disturbed = await waitForSnapshot((snapshot) => {
        const current = snapshot.world.wrecks.find((entry) => entry.id === wreck.id);
        return current && Math.hypot(current.vx || 0, current.vy || 0) > 0.002;
      }, { timeout: 5000, interval: 80 });
      const moved = disturbed.world.wrecks.find((entry) => entry.id === wreck.id);
      assert(Math.hypot(moved.vx || 0, moved.vy || 0) > 0.002, "Expected Swarm-adjacent wreck velocity to rise");
    });
  } finally {
    await stopSimServer(SIM_PORT).catch(() => null);
  }

  if (!runner.summary()) process.exit(1);
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
