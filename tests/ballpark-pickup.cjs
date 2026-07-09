const { TestRunner, assert, startSimServer, stopSimServer } = require("./helpers.cjs");

const SIM_PORT = 8805;
const SIM_URL = `http://127.0.0.1:${SIM_PORT}`;

async function getJson(path, options) {
  const response = await fetch(`${SIM_URL}${path}`, options);
  const body = await response.json();
  return { status: response.status, body };
}

async function postJson(path, payload) {
  return getJson(path, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload),
  });
}

async function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForSnapshot(predicate, timeoutMs = 5000) {
  const deadline = Date.now() + timeoutMs;
  let last = null;
  while (Date.now() < deadline) {
    const { body } = await getJson("/snapshot");
    last = body;
    if (predicate(body)) return body;
    await sleep(100);
  }
  throw new Error(`Timed out waiting for snapshot. Last tick=${last?.tick} simTime=${last?.simTime}`);
}

async function waitForEvents(sinceSeq, predicate, authority, timeoutMs = 5000) {
  const deadline = Date.now() + timeoutMs;
  let lastEvents = [];
  while (Date.now() < deadline) {
    const { body } = await getJson(`/events?since=${sinceSeq}`, authority ? {
      headers: {
        "x-lbh-command-credential": authority.commandCredential,
        "x-lbh-player-id": authority.playerId,
        "x-lbh-run-id": authority.runId,
      },
    } : undefined);
    lastEvents = body.events || [];
    if (predicate(lastEvents)) return lastEvents;
    await sleep(100);
  }
  throw new Error(`Timed out waiting for event. Last events=${JSON.stringify(lastEvents)}`);
}

function maxEventSeq(eventsBody) {
  return Math.max(0, ...(eventsBody.events || []).map((event) => event.seq || 0));
}

function worldDelta(from, to, worldScale) {
  let delta = to - from;
  if (delta > worldScale / 2) delta -= worldScale;
  if (delta < -worldScale / 2) delta += worldScale;
  return delta;
}

function worldDistance(ax, ay, bx, by, worldScale) {
  return Math.hypot(worldDelta(ax, bx, worldScale), worldDelta(ay, by, worldScale));
}

function pickSafeLootWreck(snapshot) {
  const worldScale = snapshot.session?.worldScale || snapshot.world?.worldScale || 5;
  const wells = snapshot.world?.wells || [];
  return (snapshot.world?.wrecks || [])
    .filter((wreck) => wreck && wreck.alive !== false && !wreck.looted && (wreck.loot || []).length > 0)
    .map((wreck) => {
      const nearestWellDist = wells.reduce((best, well) => Math.min(
        best,
        worldDistance(wreck.wx, wreck.wy, well.wx, well.wy, worldScale),
      ), Infinity);
      return { wreck, nearestWellDist };
    })
    .filter(({ nearestWellDist }) => nearestWellDist > 0.25)
    .sort((a, b) => b.nearestWellDist - a.nearestWellDist)[0]?.wreck || null;
}

async function run() {
  const runner = new TestRunner("BallparkPickup");

  await runner.run("Authoritative wreck pickup uses Ballpark candidates and preserves loot consequence", async () => {
    await startSimServer(SIM_PORT, { keepAlive: true });
    try {
      const start = await postJson("/session/start", {
        mapId: "shallows",
        requesterId: "ballpark-pickup-test",
        requesterName: "Ballpark Pickup Test",
        seed: 7404,
      });
      assert(start.status === 200 && start.body.ok === true, `Expected start success, got ${start.status}`);

      const join = await postJson("/join", {
        runId: start.body.session.runId,
        clientId: "ballpark-pickup-test",
        name: "Ballpark Pickup Test",
        joinTicket: start.body.joinTicket,
      });
      assert(join.status === 200 && join.body.ok === true, `Expected join success, got ${join.status}`);

      const snapshot = await waitForSnapshot((body) => body.players?.some((player) => player.clientId === "ballpark-pickup-test"));
      const target = pickSafeLootWreck(snapshot);
      assert(target?.id, "Expected a safe loot-bearing wreck in the fresh shallows run");

      const eventWatermark = maxEventSeq((await getJson("/events")).body);
      const moved = await postJson("/debug/player-state", {
        clientId: "ballpark-pickup-test",
        wx: target.wx,
        wy: target.wy,
        vx: 0,
        vy: 0,
        status: "alive",
        signalLevel: 0,
      });
      assert(moved.status === 200 && moved.body.ok === true, `Expected debug player move success, got ${moved.status}`);

      const events = await waitForEvents(eventWatermark, (allEvents) =>
        allEvents.some((event) => event.type === "player.loot" && event.payload?.wreckId === target.id)
      , join.body.authority);
      const lootEvent = events.find((event) => event.type === "player.loot" && event.payload?.wreckId === target.id);
      assert(lootEvent, `Expected player.loot event for ${target.id}`);

      const after = await getJson("/snapshot");
      const player = after.body.players.find((entry) => entry.clientId === "ballpark-pickup-test");
      const wreck = after.body.world.wrecks.find((entry) => entry.id === target.id);
      assert(player?.cargoCount > 0, `Expected player cargo after pickup, got ${player?.cargoCount}`);
      assert(
        wreck?.looted === true || (wreck?.loot || []).length < (target.loot || []).length,
        "Expected authoritative wreck loot state to change after pickup",
      );

      const health = await getJson("/health");
      assert(health.body.ballpark?.queryUsage?.queryCircleCount > 0, "Expected Ballpark query usage after pickup run");
    } finally {
      await stopSimServer(SIM_PORT).catch(() => null);
    }
  });

  const allPassed = runner.summary();
  process.exit(allPassed ? 0 : 1);
}

run().catch(async (err) => {
  await stopSimServer(SIM_PORT).catch(() => null);
  console.error("BallparkPickup test fatal error:", err.message);
  process.exit(1);
});
