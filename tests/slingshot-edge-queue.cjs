const { TestRunner, assert, startSimServer, stopSimServer } = require("./helpers.cjs");

const SIM_PORT = 8807;
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

async function postCommand(path, authority, commandSeq, payload) {
  return getJson(path, {
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
      commandSeq,
      ...payload,
    }),
  });
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function maxEventSeq(eventsBody) {
  return Math.max(0, ...(eventsBody.events || []).map((event) => event.seq || 0));
}

async function waitForSnapshot(predicate, timeoutMs = 8000) {
  const deadline = Date.now() + timeoutMs;
  let last = null;
  while (Date.now() < deadline) {
    const { body } = await getJson("/snapshot");
    last = body;
    if (predicate(body)) return body;
    await sleep(80);
  }
  throw new Error(`Timed out waiting for snapshot. Last tick=${last?.tick} simTime=${last?.simTime}`);
}

async function waitForEvents(sinceSeq, predicate, timeoutMs = 8000) {
  const deadline = Date.now() + timeoutMs;
  let lastEvents = [];
  while (Date.now() < deadline) {
    const { body } = await getJson(`/events?since=${sinceSeq}`);
    lastEvents = body.events || [];
    if (predicate(lastEvents)) return lastEvents;
    await sleep(80);
  }
  throw new Error(`Timed out waiting for event. Last events=${JSON.stringify(lastEvents)}`);
}

function wrap(value, worldScale) {
  return ((value % worldScale) + worldScale) % worldScale;
}

async function run() {
  const runner = new TestRunner("SlingshotEdgeQueue");

  await runner.run("Queued slingshot press edges survive one POST and tick across engage/release", async () => {
    await startSimServer(SIM_PORT, { keepAlive: true });
    try {
      const start = await postJson("/session/start", {
        mapId: "shallows",
        requesterId: "slingshot-edge-queue-test",
        requesterName: "Slingshot Edge Queue Test",
        seed: 7406,
      });
      assert(start.status === 200 && start.body.ok === true, `Expected start success, got ${start.status}`);

      const join = await postJson("/join", {
        runId: start.body.session.runId,
        clientId: "slingshot-edge-queue-test",
        joinTicket: start.body.joinTicket,
        name: "Slingshot Edge Queue Test",
      });
      assert(join.status === 200 && join.body.ok === true, `Expected join success, got ${join.status}`);
      const authority = join.body.authority;

      const initial = await waitForSnapshot((body) => body.players?.some((player) => player.clientId === "slingshot-edge-queue-test"));
      const anchor = initial.world?.stars?.find((entry) => entry.alive !== false) || initial.world?.planetoids?.find((entry) => entry.alive !== false) || initial.world?.wells?.[0];
      assert(anchor, "Expected an anchor for slingshot edge queue test");
      const ws = initial.session?.worldScale || 3;
      const startX = wrap(anchor.wx + 0.18, ws);
      const startY = anchor.wy;

      const moved = await postJson("/debug/player-state", {
        clientId: "slingshot-edge-queue-test",
        wx: startX,
        wy: startY,
        vx: 0,
        vy: -1.2,
        deltaV: 40,
        status: "alive",
        resetSlingshot: true,
      });
      assert(moved.status === 200 && moved.body.ok === true, `Expected debug player move success, got ${moved.status}`);

      const watermark = maxEventSeq((await getJson("/events")).body);
      const input = await postCommand("/input", authority, 1, {
        seq: 1,
        moveX: 1,
        moveY: 0,
        thrust: 0,
        brake: 0,
        slingshot: false,
        slingshotEdges: [101, 102],
        timestamp: Date.now(),
      });
      assert(input.status === 200 && input.body.ok === true, `Expected input success, got ${input.status}`);
      assert(input.body.acceptedSlingshotEdges?.join(",") === "101,102",
        `Expected both queued edges to be accepted, got ${JSON.stringify(input.body)}`);

      const events = await waitForEvents(watermark, (allEvents) => {
        const engaged = allEvents.some((event) => event.type === "player.slingshotEngaged");
        const released = allEvents.some((event) => event.type === "player.slingshotReleased");
        return engaged && released;
      });
      assert(events.some((event) => event.type === "player.slingshotEngaged"), "Expected queued edge to engage slingshot");
      assert(events.some((event) => event.type === "player.slingshotReleased"), "Expected queued edge to release slingshot");

      const final = await getJson("/snapshot");
      const player = final.body.players?.find((entry) => entry.clientId === "slingshot-edge-queue-test");
      assert(player?.slingshot?.engaged === false, "Expected second queued edge to leave slingshot released");
      assert(player?.pendingSlingshotEdgeCount === 0, `Expected no queued edges left, got ${player?.pendingSlingshotEdgeCount}`);
    } finally {
      await stopSimServer(SIM_PORT).catch(() => null);
    }
  });

  const allPassed = runner.summary();
  process.exit(allPassed ? 0 : 1);
}

run().catch(async (err) => {
  await stopSimServer(SIM_PORT).catch(() => null);
  console.error("SlingshotEdgeQueue test fatal error:", err.message);
  process.exit(1);
});
