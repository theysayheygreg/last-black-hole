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

async function sendAuthorizedInput(port, authority, commandSeq, input = {}) {
  return request(port, "/input", {
    runId: authority.runId,
    playerId: authority.playerId,
    commandCredential: authority.commandCredential,
    commandSeq,
    seq: commandSeq,
    moveX: 0,
    moveY: 0,
    thrust: 0,
    brake: 0,
    slingshot: false,
    pulse: false,
    ability1: false,
    ability2: false,
    ...input,
  });
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

async function expectSweptInhibitorDamage({ port, clientId, phase, kind, timeoutMs = 6000 }) {
  await withPlayer(port, clientId, async (authority) => {
    await request(port, "/debug/inhibitor-state", { phase });
    const initial = await waitFor(
      port,
      async () => (await request(port, "/snapshot")).body,
      (body) => body.inhibitor?.entities?.some((entity) =>
        entity.kind === kind && entity.lifecycle === "alive"),
      timeoutMs,
    );
    const player = initial.players.find((entry) => entry.clientId === clientId);
    const entity = initial.inhibitor.entities.find((entry) =>
      entry.kind === kind && entry.lifecycle === "alive");
    assert(entity, `Expected a live ${kind}`);
    await request(port, "/debug/inhibitor-state", {
      entity: { id: entity.id, wx: wrap(player.wx + 0.24, initial.session.worldScale), wy: player.wy },
    });
    await request(port, "/debug/player-state", {
      clientId,
      wx: player.wx,
      wy: player.wy,
      vx: 8,
      vy: 0,
      status: "alive",
    });
    await waitFor(
      port,
      async () => (await request(port, "/snapshot")).body,
      (body) => body.players.some((entry) => entry.clientId === clientId && entry.hullDamage > 0),
    );
    const events = await readAuthorizedEvents(port, authority);
    assert(events.events.some((event) =>
      event.type === "player.hullDamaged" &&
      event.payload?.clientId === clientId &&
      event.payload?.entityId === entity.id &&
      event.payload?.cause === `inhibitor_${kind}`),
    `Expected swept ${kind} contact to publish existing hull-damage truth`);
  });
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

  await runner.run("High-speed portal crossing opens one brief explicit-confirm window without auto-extract", async () => {
    const port = BASE_PORT + 2;
    const clientId = "swept-portal";
    await withPlayer(port, clientId, async (authority) => {
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
      const snapshot = await waitFor(
        port,
        async () => (await request(port, "/snapshot")).body,
        (body) => body.players.some((entry) =>
          entry.clientId === clientId &&
          entry.portalInteraction?.portalId === "swept-portal-target" &&
          Number.isFinite(entry.portalInteraction?.sweptConfirmExpiresAt)),
      );
      const crossedPlayer = snapshot.players.find((entry) => entry.clientId === clientId);
      assert(crossedPlayer?.status !== "escaped", "A swept fly-through must not extract without confirmation");
      assert(crossedPlayer?.portalInteraction?.sweptConfirmExpiresAt > 0,
        "A crossed aperture must offer only a short explicit-confirm grace");
      assert(!snapshot.recentEvents.some((event) =>
        event.type === "player.escaped" && event.payload?.portalId === "swept-portal-target"),
      "A fly-through must not publish player.escaped");
      const events = await readAuthorizedEvents(port, authority);
      assert(events.events.some((event) =>
        event.type === "player.portalProximity" &&
        event.payload?.portalId === "swept-portal-target" &&
        event.payload?.entered === true &&
        event.payload?.reason === "swept-crossing"),
      "A crossed aperture must publish the same player-facing prompt truth");

      const confirm = await sendAuthorizedInput(port, authority, 1, { extractConfirm: true });
      assert(confirm.status === 200 && confirm.body.ok, "Expected explicit portal confirmation to be accepted");
      await waitFor(
        port,
        async () => (await request(port, "/snapshot")).body,
        (body) => body.players.some((entry) => entry.clientId === clientId && entry.status === "escaped"),
      );
    });
  });

  await runner.run("Swept portal grace expires without extraction or a delayed confirm", async () => {
    const port = BASE_PORT + 6;
    const clientId = "swept-portal-expiry";
    await withPlayer(port, clientId, async (authority) => {
      const initial = (await request(port, "/snapshot")).body;
      const player = initial.players.find((entry) => entry.clientId === clientId);
      const scale = initial.session.worldScale;
      await request(port, "/debug/portal-state", {
        id: "swept-portal-expiry-target",
        wx: wrap(player.wx + 0.24, scale),
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
      await waitFor(
        port,
        async () => (await request(port, "/snapshot")).body,
        (body) => body.players.some((entry) =>
          entry.clientId === clientId &&
          entry.portalInteraction?.portalId === "swept-portal-expiry-target"),
      );
      const expired = await waitFor(
        port,
        async () => (await request(port, "/snapshot")).body,
        (body) => body.players.some((entry) =>
          entry.clientId === clientId && entry.status === "alive" && entry.portalInteraction === null),
        2500,
      );
      const beforeConfirm = expired.tick;
      const confirm = await sendAuthorizedInput(port, authority, 1, { extractConfirm: true });
      assert(confirm.status === 200 && confirm.body.ok, "A delayed input remains a valid ordinary command");
      const afterConfirm = await waitFor(
        port,
        async () => (await request(port, "/snapshot")).body,
        (body) => body.tick >= beforeConfirm + 2,
      );
      const expiredPlayer = afterConfirm.players.find((entry) => entry.clientId === clientId);
      assert(expiredPlayer?.status === "alive", "An expired crossed-aperture prompt must never extract later");
    });
  });

  await runner.run("Portal residence is detected when a movement step ends inside across the world seam", async () => {
    const port = BASE_PORT + 4;
    const clientId = "endpoint-portal";
    await withPlayer(port, clientId, async () => {
      const initial = (await request(port, "/snapshot")).body;
      const scale = initial.session.worldScale;
      const portalX = wrap(0.02, scale);
      const portalY = wrap(2.5, scale);
      await request(port, "/debug/portal-state", {
        id: "endpoint-portal-target",
        wx: portalX,
        wy: portalY,
        type: "standard",
        alive: true,
        blockedByInhibitor: false,
        lifespan: 30,
      });
      const placed = await request(port, "/debug/player-state", {
        clientId,
        wx: wrap(portalX - 0.1, scale),
        wy: portalY,
        // Fabric currents deliberately bend a slow coast away from the
        // aperture. This speed ends the next 15 Hz step inside the
        // seam-wrapped capture radius without using the fly-through case.
        vx: 2,
        vy: 0,
        status: "alive",
      });
      const placedTick = placed.body.snapshot.tick;
      const snapshot = await waitFor(
        port,
        async () => (await request(port, "/snapshot")).body,
        (body) => body.players.some((player) =>
          player.clientId === clientId &&
          player.status === "alive" &&
          player.portalInteraction?.portalId === "endpoint-portal-target" &&
          player.portalInteraction.enteredTick > placedTick),
      );
      const resident = snapshot.players.find((player) => player.clientId === clientId);
      assert(resident?.status === "alive", "Portal residence must still require confirmation to extract");
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

  await runner.run("High-speed Swarm crossing resolves hull damage between snapshots", async () => {
    const port = BASE_PORT + 5;
    const clientId = "swept-swarm";
    await withPlayer(port, clientId, async (authority) => {
      await request(port, "/debug/inhibitor-state", { phase: 2 });
      const initial = await waitFor(
        port,
        async () => (await request(port, "/snapshot")).body,
        (body) => body.inhibitor?.entities?.some((entity) =>
          entity.kind === "swarm" && entity.lifecycle === "alive"),
      );
      const player = initial.players.find((entry) => entry.clientId === clientId);
      const swarm = initial.inhibitor.entities.find((entry) =>
        entry.kind === "swarm" && entry.lifecycle === "alive");
      const scale = initial.session.worldScale;
      const targetX = wrap(player.wx + 0.24, scale);
      await request(port, "/debug/inhibitor-state", {
        entity: { id: swarm.id, wx: targetX, wy: player.wy },
      });
      await request(port, "/debug/player-state", {
        clientId,
        wx: player.wx,
        wy: player.wy,
        vx: 8,
        vy: 0,
        status: "alive",
      });
      await waitFor(
        port,
        async () => (await request(port, "/snapshot")).body,
        (body) => body.players.some((entry) => entry.clientId === clientId && entry.hullDamage > 0),
      );
      const events = await readAuthorizedEvents(port, authority);
      assert(events.events.some((event) =>
        event.type === "player.hullDamaged" &&
        event.payload?.clientId === clientId &&
        event.payload?.entityId === swarm.id &&
        event.payload?.cause === "inhibitor_swarm"),
      "Expected swept Swarm contact to publish existing hull-damage truth");
    });
  });

  await runner.run("High-speed Glitch crossing resolves hull damage between snapshots", () =>
    expectSweptInhibitorDamage({ port: BASE_PORT + 7, clientId: "swept-glitch", phase: 1, kind: "glitch" }));

  await runner.run("High-speed Vessel crossing resolves its existing outer-hull damage", () =>
    expectSweptInhibitorDamage({
      port: BASE_PORT + 8,
      clientId: "swept-vessel",
      phase: 3,
      kind: "vessel",
      timeoutMs: 7000,
    }));

  process.exit(runner.summary() ? 0 : 1);
}

run().catch((error) => {
  console.error(error.stack || error.message);
  process.exit(1);
});
