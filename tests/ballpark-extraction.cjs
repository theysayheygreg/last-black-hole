const { TestRunner, assert, startSimServer, stopSimServer } = require("./helpers.cjs");

const SIM_PORT = 8806;
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

function sleep(ms) {
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

async function waitForEvents(sinceSeq, predicate, timeoutMs = 5000) {
  const deadline = Date.now() + timeoutMs;
  let lastEvents = [];
  while (Date.now() < deadline) {
    const { body } = await getJson(`/events?since=${sinceSeq}`);
    lastEvents = body.events || [];
    if (predicate(lastEvents)) return lastEvents;
    await sleep(100);
  }
  throw new Error(`Timed out waiting for event. Last events=${JSON.stringify(lastEvents)}`);
}

function maxEventSeq(eventsBody) {
  return Math.max(0, ...(eventsBody.events || []).map((event) => event.seq || 0));
}

async function run() {
  const runner = new TestRunner("BallparkExtraction");

  await runner.run("Authoritative portal extraction uses Ballpark candidates and preserves escape consequence", async () => {
    await startSimServer(SIM_PORT, { keepAlive: true });
    try {
      const start = await postJson("/session/start", {
        mapId: "shallows",
        requesterId: "ballpark-extraction-test",
        requesterName: "Ballpark Extraction Test",
        seed: 7405,
      });
      assert(start.status === 200 && start.body.ok === true, `Expected start success, got ${start.status}`);

      const join = await postJson("/join", {
        clientId: "ballpark-extraction-test",
        name: "Ballpark Extraction Test",
      });
      assert(join.status === 200 && join.body.ok === true, `Expected join success, got ${join.status}`);

      await waitForSnapshot((body) => body.players?.some((player) => player.clientId === "ballpark-extraction-test"));
      const beforeHealth = await getJson("/health");
      const beforeQueries = beforeHealth.body.ballpark?.queryUsage?.queryCircleCount || 0;
      const eventWatermark = maxEventSeq((await getJson("/events")).body);

      const moved = await postJson("/debug/player-state", {
        clientId: "ballpark-extraction-test",
        wx: 2.72,
        wy: 2.72,
        vx: 0,
        vy: 0,
        deltaV: 40,
        status: "alive",
        signalLevel: 0,
        resetSlingshot: true,
      });
      assert(moved.status === 200 && moved.body.ok === true, `Expected debug player move success, got ${moved.status}`);

      const portal = await postJson("/debug/portal-state", {
        id: "ballpark-extraction-portal",
        wx: 2.72,
        wy: 2.72,
        type: "standard",
        lifespan: 60,
        alive: true,
        blockedByInhibitor: false,
      });
      assert(portal.status === 200 && portal.body.ok === true, `Expected debug portal placement, got ${portal.status}`);

      const escaped = await waitForSnapshot((body) =>
        body.players?.some((player) =>
          player.clientId === "ballpark-extraction-test" &&
          player.status === "escaped"
        )
      );
      const player = escaped.players.find((entry) => entry.clientId === "ballpark-extraction-test");
      assert(player?.status === "escaped", `Expected escaped player, got ${player?.status}`);

      const events = await waitForEvents(eventWatermark, (allEvents) =>
        allEvents.some((event) =>
          event.type === "player.escaped" &&
          event.payload?.portalId === "ballpark-extraction-portal"
        )
      );
      assert(events.some((event) => event.type === "player.escaped"), "Expected authoritative player.escaped event");

      const health = await getJson("/health");
      const afterQueries = health.body.ballpark?.queryUsage?.queryCircleCount || 0;
      assert(afterQueries > beforeQueries,
        `Expected Ballpark query usage to increase during extraction (${beforeQueries} -> ${afterQueries})`);
    } finally {
      await stopSimServer(SIM_PORT).catch(() => null);
    }
  });

  const allPassed = runner.summary();
  process.exit(allPassed ? 0 : 1);
}

run().catch(async (err) => {
  await stopSimServer(SIM_PORT).catch(() => null);
  console.error("BallparkExtraction test fatal error:", err.message);
  process.exit(1);
});
