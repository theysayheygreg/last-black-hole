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

async function postAuthorizedInput(authority, commandSeq, payload) {
  return getJson("/input", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-lbh-command-credential": authority.commandCredential,
      "x-lbh-player-id": authority.playerId,
      "x-lbh-run-id": authority.runId,
    },
    body: JSON.stringify({
      ...payload,
      runId: authority.runId,
      playerId: authority.playerId,
      commandCredential: authority.commandCredential,
      commandSeq,
    }),
  });
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function authorityHeaders(authority) {
  return {
    "x-lbh-command-credential": authority.commandCredential,
    "x-lbh-player-id": authority.playerId,
    "x-lbh-run-id": authority.runId,
  };
}

async function waitForSnapshot(predicate, authority = null, timeoutMs = 5000) {
  const deadline = Date.now() + timeoutMs;
  let last = null;
  while (Date.now() < deadline) {
    const { body } = await getJson("/snapshot", authority ? { headers: authorityHeaders(authority) } : undefined);
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
        runId: start.body.session.runId,
        clientId: "ballpark-extraction-test",
        name: "Ballpark Extraction Test",
        joinTicket: start.body.joinTicket,
      });
      assert(join.status === 200 && join.body.ok === true, `Expected join success, got ${join.status}`);
      const authority = join.body.authority;

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

      const ready = await waitForSnapshot((body) =>
        body.players?.some((player) =>
          player.clientId === "ballpark-extraction-test" &&
          player.status === "alive" &&
          player.portalInteraction?.portalId === "ballpark-extraction-portal"
        )
      , authority);
      const readyPlayer = ready.players.find((entry) => entry.clientId === "ballpark-extraction-test");
      assert(readyPlayer?.status === "alive", "Portal proximity must not auto-extract the player");

      await postJson("/debug/player-state", {
        clientId: "ballpark-extraction-test",
        wx: 2.2,
        wy: 2.2,
        vx: 0,
        vy: 0,
        status: "alive",
      });
      const aborted = await waitForSnapshot((body) => body.players?.some((player) =>
        player.clientId === "ballpark-extraction-test" &&
        player.status === "alive" &&
        player.portalInteraction === null
      ), authority);
      assert(aborted.players.find((entry) => entry.clientId === "ballpark-extraction-test")?.status === "alive",
        "Leaving the portal zone must abort without extracting");

      await postJson("/debug/player-state", {
        clientId: "ballpark-extraction-test",
        wx: 2.72,
        wy: 2.72,
        vx: 0,
        vy: 0,
        status: "alive",
      });
      await waitForSnapshot((body) => body.players?.some((player) =>
        player.clientId === "ballpark-extraction-test" &&
        player.portalInteraction?.portalId === "ballpark-extraction-portal"
      ), authority);

      const confirmed = await postAuthorizedInput(authority, 1, {
        seq: 1,
        moveX: 0,
        moveY: 0,
        extractConfirm: true,
      });
      assert(confirmed.status === 200 && confirmed.body.ok === true,
        `Expected extraction confirmation to be accepted, got ${confirmed.status}`);

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
