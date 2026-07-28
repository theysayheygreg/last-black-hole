/**
 * inhibitor.cjs — Authoritative Inhibitor behavior tests.
 *
 * These are sim-server tests because the Inhibitor owns match-ending rules:
 * collection-shaped ecology, decoy targeting, portal lifecycle, and death causes must be true
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
      assert(clock.phase === 0 && Array.isArray(clock.entities) && clock.entities.length === 0,
        "Expected an empty collection at phase 0 with no scalar form state");
      assert(clock.waveId === "inhibitor:phase-0", "Expected stable phase-0 identity");
      assert(!("pressure" in clock) && !("pressureFrac" in clock) && !("threshold" in clock),
        "Inhibitor snapshot must not expose pressure or threshold fields");

      const waves = clock.schedule?.severityWaves || [];
      assert(waves.length === 3, `Expected three scheduled Inhibitor waves, got ${waves.length}`);
      assert(waves.every((wave, index) =>
        wave.announced === true && wave.tier === index + 1 && wave.metadata?.phase === index + 1
      ), `Expected announced tiered waves, got ${JSON.stringify(waves)}`);
      assert(JSON.stringify(waves.map((wave) => wave.time)) === JSON.stringify([72, 144, 216]),
        `Expected normalized Shallows phase fronts, got ${waves.map((wave) => wave.time)}`);
      const portalSchedule = first.portalSchedule;
      const finalWindow = portalSchedule?.windows?.find((window) => window.metadata?.finalExfil);
      assert(finalWindow?.openTime === 480 && finalWindow?.closeTime === 540,
        "Expected the guaranteed final exfil to open at the Shallows timer with a 60-second window");
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
      assert(second.inhibitor.phase === 0 && Array.isArray(second.inhibitor.entities)
        && second.inhibitor.entities.length === 0,
      "Expected a restarted match to return to an empty phase-0 ecology collection");
    });

    await runner.run("Vessel timing cannot advance or replace the scheduled final exfil", async () => {
      await startRun({ seed: 1001 });
      await postDebugPlayerState({ wx: 0.7, wy: 0.7, signalLevel: 0.25 });
      const before = await getSnapshot();
      const finalWindow = before.portalSchedule.windows.find((window) => window.metadata?.finalExfil);
      assert(finalWindow.openTime === 480, "Expected final exfil schedule front at the Shallows timer");
      await postDebugInhibitorState({ phase: 3 });
      const after = await getSnapshot();
      assert(after.inhibitor.phase === 3 && after.portalSchedule.windows
        .find((window) => window.metadata?.finalExfil)?.openTime === 480,
      "Vessel arrival must not advance or replace the Conductor-owned final exfil");
      assert(!after.world.portals.some((portal) => portal.finalInhibitor),
        "Vessel debug phase must not create the final exfil before its Conductor front");
    });

    await runner.run("Vessel ecology does not carry retired portal-block state", async () => {
      await startRun({ seed: 1002 });
      await postDebugPlayerState({ wx: 3.7, wy: 3.7, noiseRadiusMeters: 0 });
      await postDebugPortalState({
        portalId: "test-exit",
        wx: 1.0,
        wy: 1.0,
        lifespan: 120,
        alive: true,
        type: "exit",
      });
      await postDebugInhibitorState({ phase: 3 });
      const current = await waitForSnapshot((snapshot) =>
        snapshot.world.portals.some((entry) => entry.id === "test-exit"));
      const portal = current.world.portals.find((entry) => entry.id === "test-exit");
      assert(portal.alive === true && !Object.prototype.hasOwnProperty.call(portal, "blockedByInhibitor"),
        "Active exits remain independently available and expose no retired block flag");
    });

    await runner.run("Shroud decoy attracts Swarm while Vessel pursues the real player", async () => {
      await startRun({ hullType: "shroud", seed: 1003 });
      await postDebugPlayerState({ wx: 1.0, wy: 1.0, vx: 0, vy: 0, noiseRadiusMeters: 0 });
      await postInput({ ability2: true });

      const withDecoy = await waitForSnapshot((snapshot) => {
        const player = snapshot.players.find((entry) => entry.clientId === CLIENT_ID);
        return player?.abilityState?.decoys?.length > 0;
      });
      const decoy = withDecoy.players.find((entry) => entry.clientId === CLIENT_ID).abilityState.decoys[0];

      await postDebugPlayerState({ wx: 3.0, wy: 3.0, vx: 0, vy: 0, noiseRadiusMeters: 0 });
      await postDebugInhibitorState({ phase: 2 });
      const spawned = await waitForSnapshot((snapshot) =>
        snapshot.inhibitor.entities?.some((entity) => entity.kind === "swarm"));
      const swarm = spawned.inhibitor.entities.find((entity) => entity.kind === "swarm");
      await postDebugInhibitorState({ entities: [{ id: swarm.id, wx: decoy.wx, wy: decoy.wy }] });
      const swarmTrackedDecoy = await waitForSnapshot((snapshot) => {
        const current = snapshot.inhibitor.entities?.find((entity) => entity.id === swarm.id);
        return current && ["HEARD", "TRACKING"].includes(current.noiseListenerState)
          && current.lastHeard
          && worldDistance(current.lastHeard.wx, current.lastHeard.wy, decoy.wx, decoy.wy, snapshot.session.worldScale) < 0.35;
      });
      const tracked = swarmTrackedDecoy.inhibitor.entities.find((entity) => entity.id === swarm.id);
      assert(["HEARD", "TRACKING"].includes(tracked.noiseListenerState), "Expected Swarm to hear the decoy through Noise");

      await postDebugInhibitorState({ phase: 3 });
      const vesselSpawned = await waitForSnapshot((snapshot) =>
        snapshot.inhibitor.entities?.some((entity) => entity.kind === "vessel"));
      const vessel = vesselSpawned.inhibitor.entities.find((entity) => entity.kind === "vessel");
      await waitForSnapshot((snapshot) => snapshot.inhibitor.entities
        ?.find((entity) => entity.id === vessel.id)?.lifecycle === "alive");
      await postDebugPlayerState({ wx: 3.0, wy: 3.0, vx: 0, vy: 0, noiseRadiusMeters: 0 });
      await postDebugInhibitorState({ entities: [{ id: vessel.id, wx: 2.0, wy: 2.0 }] });
      const before = await getSnapshot();
      const beforeEntity = before.inhibitor.entities.find((entity) => entity.id === vessel.id);
      await sleep(1000);
      const after = await getSnapshot();
      const afterEntity = after.inhibitor.entities.find((entity) => entity.id === vessel.id);
      assert(afterEntity.target?.clientId === CLIENT_ID
        && beforeEntity.target?.clientId === CLIENT_ID,
      `Expected Vessel strategic pursuit to target the real player, not the decoy: before=${JSON.stringify(beforeEntity.target)} after=${JSON.stringify(afterEntity.target)}`);
    });

    await runner.run("Vessel kill publishes the Inhibitor death cause", async () => {
      await startRun({ seed: 1004 });
      await postDebugPlayerState({ wx: 2.0, wy: 2.0, vx: 0, vy: 0, noiseRadiusMeters: 0 });
      await postDebugInhibitorState({ phase: 3 });
      const vesselSpawned = await waitForSnapshot((snapshot) =>
        snapshot.inhibitor.entities?.some((entity) => entity.kind === "vessel"));
      const vessel = vesselSpawned.inhibitor.entities.find((entity) => entity.kind === "vessel");
      await waitForSnapshot((snapshot) => snapshot.inhibitor.entities
        ?.find((entity) => entity.id === vessel.id)?.lifecycle === "alive");
      await postDebugPlayerState({ wx: 2.0, wy: 2.0, vx: 0, vy: 0, noiseRadiusMeters: 0 });
      await postDebugInhibitorState({ entities: [{ id: vessel.id, wx: 2.0, wy: 2.0 }] });

      const dead = await waitForSnapshot((snapshot) => {
        const player = snapshot.players.find((entry) => entry.clientId === CLIENT_ID);
        return player?.status === "dead" &&
          snapshot.recentEvents.some((event) => event.type === "player.died" && event.payload?.cause === "inhibitor_vessel");
      });
      const death = dead.recentEvents.find((event) => event.type === "player.died" && event.payload?.cause === "inhibitor_vessel");
      assert(death.payload.clientId === CLIENT_ID, "Expected death event for harness player");
    });

    await runner.run("Swarm presentation exposes Noise listener state without retired wreck disturbance", async () => {
      await startRun({ seed: 1005 });
      await postDebugInhibitorState({ phase: 2 });
      const snapshot = await waitForSnapshot((current) =>
        current.inhibitor.entities?.some((entity) => entity.kind === "swarm"));
      const swarm = snapshot.inhibitor.entities.find((entity) => entity.kind === "swarm");
      assert(swarm.listensToNoise === true && !snapshot.world.wrecks.some((wreck) =>
        Object.prototype.hasOwnProperty.call(wreck, "blockedByInhibitor")),
      "Current Swarms must expose Noise listener state without retired wreck disturbance");
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
