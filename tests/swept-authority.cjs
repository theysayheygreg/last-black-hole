const { TestRunner, assert, startSimServer, stopSimServer } = require("./helpers.cjs");

const BASE_PORT = 8826;

function wrap(value, worldScale) {
  return ((value % worldScale) + worldScale) % worldScale;
}

async function request(port, path, payload = null) {
  const response = await fetch(`http://127.0.0.1:${port}${path}`, payload === null ? undefined : {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload),
  });
  return { status: response.status, body: await response.json() };
}

async function waitFor(port, read, predicate, timeoutMs = 6000) {
  const deadline = Date.now() + timeoutMs;
  let last = null;
  while (Date.now() < deadline) {
    last = await read();
    if (predicate(last)) return last;
    await new Promise((resolve) => setTimeout(resolve, 60));
  }
  throw new Error(`Timed out waiting for swept consequence: ${JSON.stringify(last)}`);
}

async function readAuthorizedEvents(port, authority, since = 0) {
  const response = await fetch(`http://127.0.0.1:${port}/events?since=${since}`, {
    headers: {
      "x-lbh-command-credential": authority.commandCredential,
      "x-lbh-player-id": authority.playerId,
      "x-lbh-run-id": authority.runId,
    },
  });
  return response.json();
}

async function withPlayer(port, clientId, work) {
  await startSimServer(port, { keepAlive: true });
  try {
    const start = await request(port, "/session/start", {
      mapId: "shallows",
      requesterId: clientId,
      requesterName: clientId,
      seed: 90317,
    });
    assert(start.status === 200 && start.body.ok, "Expected session start");
    const join = await request(port, "/join", {
      runId: start.body.session.runId,
      clientId,
      name: clientId,
      hullType: "drifter",
      joinTicket: start.body.joinTicket,
    });
    assert(join.status === 200 && join.body.ok, "Expected player join");
    await work(join.body.authority);
  } finally {
    await stopSimServer(port).catch(() => null);
  }
}

async function run() {
  const runner = new TestRunner("SweptAuthority");

  await runner.run("High-speed well crossing resolves death between snapshots", async () => {
    const port = BASE_PORT;
    const clientId = "swept-well";
    await withPlayer(port, clientId, async (authority) => {
      const initial = (await request(port, "/snapshot")).body;
      const well = initial.world.wells[0];
      const scale = initial.session.worldScale;
      const offset = Math.max(0.18, well.killRadius + 0.12);
      await request(port, "/debug/player-state", {
        clientId,
        wx: wrap(well.wx - offset, scale),
        wy: well.wy,
        vx: 8,
        vy: 0,
        status: "alive",
      });
      const snapshot = await waitFor(
        port,
        async () => (await request(port, "/snapshot")).body,
        (body) => body.players.some((player) => player.clientId === clientId && player.status === "dead"),
      );
      const death = snapshot.recentEvents.find((event) =>
        event.type === "player.died" && event.payload?.clientId === clientId);
      assert(death?.payload?.wellId === well.id, "Expected crossed well to author the death");
    });
  });

  await runner.run("High-speed wreck crossing resolves pickup between snapshots", async () => {
    const port = BASE_PORT + 1;
    const clientId = "swept-wreck";
    await withPlayer(port, clientId, async (authority) => {
      const initial = (await request(port, "/snapshot")).body;
      const wreck = initial.world.wrecks.find((entry) => entry.alive !== false && !entry.looted && entry.loot?.length);
      assert(wreck, "Expected seeded wreck with loot");
      const scale = initial.session.worldScale;
      await request(port, "/debug/player-state", {
        clientId,
        wx: wrap(wreck.wx - 0.22, scale),
        wy: wreck.wy,
        vx: 8,
        vy: 0,
        status: "alive",
      });
      const snapshot = await waitFor(
        port,
        async () => (await request(port, "/snapshot")).body,
        (body) => body.players.some((player) => player.clientId === clientId && player.cargoCount > 0),
      );
      const events = await readAuthorizedEvents(port, authority);
      assert(events.events.some((event) =>
        event.type === "player.loot" && event.payload?.clientId === clientId),
      "Expected swept pickup to publish a private player.loot event");
    });
  });

  await runner.run("High-speed portal crossing does not bypass explicit confirmation", async () => {
    const port = BASE_PORT + 2;
    const clientId = "swept-portal";
    await withPlayer(port, clientId, async () => {
      const initial = (await request(port, "/snapshot")).body;
      const player = initial.players.find((entry) => entry.clientId === clientId);
      const scale = initial.session.worldScale;
      const portalX = wrap(player.wx + 0.24, scale);
      await request(port, "/debug/portal-state", {
        id: "swept-portal-target",
        wx: portalX,
        wy: player.wy,
        type: "standard",
        alive: true,
        blockedByInhibitor: false,
        lifespan: 30,
      });
      await request(port, "/debug/player-state", {
        clientId,
        wx: player.wx,
        wy: player.wy,
        vx: 8,
        vy: 0,
        status: "alive",
      });
      const beforeTick = initial.tick;
      const snapshot = await waitFor(
        port,
        async () => (await request(port, "/snapshot")).body,
        (body) => body.tick >= beforeTick + 3,
      );
      const crossedPlayer = snapshot.players.find((entry) => entry.clientId === clientId);
      assert(crossedPlayer?.status !== "escaped", "A swept fly-through must not extract without confirmation");
      assert(!snapshot.recentEvents.some((event) =>
        event.type === "player.escaped" && event.payload?.portalId === "swept-portal-target"),
      "A fly-through must not publish player.escaped");
    });
  });

  await runner.run("High-speed scavenger crossing resolves a bump between snapshots", async () => {
    const port = BASE_PORT + 3;
    const clientId = "swept-scavenger";
    await withPlayer(port, clientId, async () => {
      const initial = (await request(port, "/snapshot")).body;
      const player = initial.players.find((entry) => entry.clientId === clientId);
      const scavenger = initial.world.scavengers.find((entry) => entry.alive !== false);
      assert(scavenger, "Expected a live scavenger");
      const scale = initial.session.worldScale;
      const targetX = wrap(player.wx + 0.24, scale);
      await request(port, "/debug/scavenger-state", {
        scavengerId: scavenger.id,
        wx: targetX,
        wy: player.wy,
        vx: 0,
        vy: 0,
        state: "recover",
        alive: true,
      });
      await request(port, "/debug/player-state", {
        clientId,
        wx: player.wx,
        wy: player.wy,
        vx: 8,
        vy: 0,
        status: "alive",
      });
      const window = await waitFor(
        port,
        async () => (await request(port, "/events?since=0")).body,
        (body) => body.events.some((event) =>
          event.type === "player.scavengerBumped" &&
          event.payload?.clientId === clientId &&
          event.payload?.scavengerId === scavenger.id),
      );
      const bump = window.events.find((event) => event.type === "player.scavengerBumped");
      assert(bump.payload.swept === true, "Expected the scavenger bump to come from swept contact");
    });
  });

  process.exit(runner.summary() ? 0 : 1);
}

run().catch((error) => {
  console.error(error.stack || error.message);
  process.exit(1);
});
