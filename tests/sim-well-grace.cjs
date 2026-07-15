const { TestRunner, assert, startSimServer, stopSimServer } = require("./helpers.cjs");

const PORT = 8838;

async function request(path, payload = null, authority = null) {
  const headers = {};
  if (payload !== null) headers["content-type"] = "application/json";
  if (authority) {
    headers["x-lbh-command-credential"] = authority.commandCredential;
    headers["x-lbh-player-id"] = authority.playerId;
    headers["x-lbh-run-id"] = authority.runId;
  }
  const response = await fetch(`http://127.0.0.1:${PORT}${path}`, payload === null ? {
    headers,
  } : {
    method: "POST",
    headers,
    body: JSON.stringify(payload),
  });
  return { status: response.status, body: await response.json() };
}

async function waitForDeath(clientId, authority, contactState, timeoutMs = 2500) {
  const deadline = Date.now() + timeoutMs;
  let snapshot = null;
  while (Date.now() < deadline) {
    await request("/debug/player-state", { clientId, ...contactState });
    snapshot = (await request("/snapshot")).body;
    const player = snapshot.players.find((entry) => entry.clientId === clientId);
    if (player?.status === "dead") return snapshot;
    await new Promise((resolve) => setTimeout(resolve, 40));
  }

  const events = (await request("/events?since=0", null, authority)).body.events || [];
  const graceCount = events.filter((event) =>
    event.type === "player.hullGraceStarted" && event.payload?.clientId === clientId).length;
  throw new Error(`Player remained alive after well grace window; observed ${graceCount} grace events`);
}

async function run() {
  const runner = new TestRunner("SimWellGrace");

  await runner.run("Well contact grants grace once, then kills after its duration", async () => {
    const clientId = "well-grace-pilot";
    await startSimServer(PORT, { keepAlive: true });
    try {
      const start = await request("/session/start", {
        mapId: "shallows",
        requesterId: clientId,
        requesterName: "Well Grace Pilot",
        seed: 90317,
      });
      assert(start.status === 200 && start.body.ok, "Expected session start");

      const join = await request("/join", {
        runId: start.body.session.runId,
        clientId,
        name: "Well Grace Pilot",
        hullType: "drifter",
        joinTicket: start.body.joinTicket,
        profileSnapshot: { upgrades: { hull: 1 } },
      });
      assert(join.status === 200 && join.body.ok, "Expected upgraded player join");

      const initial = (await request("/snapshot")).body;
      const well = initial.world.wells[0];
      assert(well?.killRadius > 0, "Expected an authoritative well with a kill radius");

      const enteredAt = Date.now();
      const contactState = {
        wx: well.wx + well.killRadius * 0.8,
        wy: well.wy,
        vx: 0,
        vy: 0.02,
      };
      const moved = await request("/debug/player-state", {
        clientId,
        ...contactState,
        status: "alive",
      });
      assert(moved.status === 200 && moved.body.ok, "Expected discrete slow entry into the well");

      const terminal = await waitForDeath(clientId, join.body.authority, contactState);
      const elapsedMs = Date.now() - enteredAt;
      const events = (await request("/events?since=0", null, join.body.authority)).body.events || [];
      const graceEvents = events.filter((event) =>
        event.type === "player.hullGraceStarted" && event.payload?.clientId === clientId);
      const deathEvents = events.filter((event) =>
        event.type === "player.died" && event.payload?.clientId === clientId && event.payload?.cause === "well");

      assert(graceEvents.length === 1, `Expected one grace event, got ${graceEvents.length}`);
      assert(deathEvents.length === 1, `Expected one well death event, got ${deathEvents.length}`);
      assert(deathEvents[0].payload.wellId === well.id, "Expected the contacted well to author death");
      assert(elapsedMs >= graceEvents[0].payload.duration * 1000,
        `Expected death after ${graceEvents[0].payload.duration}s grace, got ${elapsedMs}ms`);
      assert(terminal.players.find((player) => player.clientId === clientId)?.status === "dead",
        "Expected terminal authority snapshot to retain death");
    } finally {
      await stopSimServer(PORT).catch(() => null);
    }
  });

  const allPassed = runner.summary();
  process.exit(allPassed ? 0 : 1);
}

run().catch((error) => {
  console.error(error.stack || error.message);
  process.exit(1);
});
