const { TestRunner, assert, startSimServer, stopSimServer } = require("./helpers.cjs");
const { SLINGSHOT_VALUES, effectiveCoyoteTimeMs } = require("../scripts/sim/slingshot-contract.cjs");

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

async function waitForSnapshot(predicate, timeoutMs = 8000, pollingMs = 80) {
  const deadline = Date.now() + timeoutMs;
  let last = null;
  while (Date.now() < deadline) {
    const { body } = await getJson("/snapshot");
    last = body;
    if (predicate(body)) return body;
    await sleep(pollingMs);
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

function wrappedDelta(from, to, worldScale) {
  let delta = to - from;
  if (delta > worldScale / 2) delta -= worldScale;
  if (delta < -worldScale / 2) delta += worldScale;
  return delta;
}

function wrappedDistance(left, right, worldScale) {
  return Math.hypot(
    wrappedDelta(left.wx, right.wx, worldScale),
    wrappedDelta(left.wy, right.wy, worldScale),
  );
}

function coyoteProbe(world, worldScale) {
  const anchors = [
    ...(world.wells || []).map((anchor) => ({ ...anchor, range: 0.45, type: "well" })),
    ...(world.stars || []).filter((anchor) => anchor.alive !== false)
      .map((anchor) => ({ ...anchor, range: 0.3, type: "star" })),
    ...(world.planetoids || []).filter((anchor) => anchor.alive !== false)
      .map((anchor) => ({ ...anchor, range: 0.18, type: "planetoid" })),
  ];
  const exclusive = (point, anchor) => anchors.every((other) => other === anchor
    || wrappedDistance(point, other, worldScale) > other.range + 1e-6);
  for (const anchor of anchors) {
    for (let index = 0; index < 24; index += 1) {
      const angle = (index / 24) * Math.PI * 2;
      const unit = { x: Math.cos(angle), y: Math.sin(angle) };
      const inside = {
        wx: wrap(anchor.wx + unit.x * anchor.range * 0.8, worldScale),
        wy: wrap(anchor.wy + unit.y * anchor.range * 0.8, worldScale),
      };
      const outside = {
        wx: wrap(anchor.wx + unit.x * anchor.range * 1.01, worldScale),
        wy: wrap(anchor.wy + unit.y * anchor.range * 1.01, worldScale),
      };
      const lateOutside = {
        wx: wrap(anchor.wx + unit.x * anchor.range * 1.06, worldScale),
        wy: wrap(anchor.wy + unit.y * anchor.range * 1.06, worldScale),
      };
      if (exclusive(inside, anchor) && exclusive(outside, anchor) && exclusive(lateOutside, anchor)) {
        return {
          anchor,
          inside,
          outside,
          lateOutside,
          velocity: { x: -unit.y * 0.3, y: unit.x * 0.3 },
        };
      }
    }
  }
  throw new Error("Could not find an isolated slingshot coyote probe");
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

  await runner.run("Transport coyote allowance accepts within four ticks and rejects beyond it", async () => {
    await startSimServer(SIM_PORT, { keepAlive: true });
    try {
      const start = await postJson("/session/start", {
        mapId: "shallows",
        requesterId: "slingshot-coyote-test",
        requesterName: "Slingshot Coyote Test",
        seed: 7415,
      });
      assert(start.status === 200 && start.body.ok === true, `Expected start success, got ${start.status}`);
      const join = await postJson("/join", {
        runId: start.body.session.runId,
        clientId: "slingshot-coyote-test",
        joinTicket: start.body.joinTicket,
        name: "Slingshot Coyote Test",
      });
      assert(join.status === 200 && join.body.ok === true, `Expected join success, got ${join.status}`);
      const authority = join.body.authority;
      const initial = await waitForSnapshot((body) => body.players?.some((player) => player.clientId === "slingshot-coyote-test"));
      const worldScale = initial.session.worldScale;
      const probe = coyoteProbe(initial.world, worldScale);
      const dt = 1 / initial.session.tickHz;
      assert(Math.abs(dt - (1 / 15)) < 1e-9, `Expected Shallows dt=66.7 ms, got ${dt * 1000} ms`);
      const effectiveCoyoteMs = effectiveCoyoteTimeMs(SLINGSHOT_VALUES.coyoteTime, dt);
      assert(SLINGSHOT_VALUES.coyoteTime === 50, "Canonical coyote time must remain 50 ms");

      const setPlayer = (point, resetSlingshot = false) => postJson("/debug/player-state", {
        clientId: "slingshot-coyote-test",
        wx: point.wx,
        wy: point.wy,
        vx: probe.velocity.x,
        vy: probe.velocity.y,
        deltaV: 40,
        status: "alive",
        resetSlingshot,
      });

      const movedInside = await setPlayer(probe.inside, true);
      assert(movedInside.status === 200 && movedInside.body.ok === true, "Expected inside coyote probe placement");
      const aimed = await waitForSnapshot((body) => body.players?.some((player) =>
        player.clientId === "slingshot-coyote-test" && player.slingshot?.phase === "aim"));
      const aimedPlayer = aimed.players.find((player) => player.clientId === "slingshot-coyote-test");
      assert(aimedPlayer.slingshot.telegraph.aimCue.coyoteRemainingMs >= effectiveCoyoteMs - 1e-6,
        "Aim telemetry must expose the effective transport remainder");
      assert(aimedPlayer.slingshot.telegraph.aimCue.canonicalCoyoteRemainingMs >= SLINGSHOT_VALUES.coyoteTime - 1e-6,
        "Aim telemetry must retain the canonical coyote remainder separately");
      const nextTickWatermark = maxEventSeq((await getJson("/events")).body);
      const movedOutside = await setPlayer(probe.outside);
      assert(movedOutside.status === 200 && movedOutside.body.ok === true, "Expected transport coyote probe placement");
      await waitForSnapshot((body) => body.tick === aimed.tick + 3
        && body.players?.some((player) => player.clientId === "slingshot-coyote-test" && player.slingshot?.phase === "aim"), 1000, 10);
      const nextTickEdge = await postCommand("/input", authority, 1, {
        seq: 1,
        moveX: 0,
        moveY: 1,
        thrust: 0,
        brake: 0,
        slingshot: false,
        slingshotEdges: [201],
        timestamp: Date.now(),
      });
      assert(nextTickEdge.status === 200 && nextTickEdge.body.ok === true, "Expected within-four-tick coyote edge input acceptance");
      const engagedEvents = await waitForEvents(nextTickWatermark, (events) =>
        events.some((event) => event.type === "player.slingshotEngaged"));
      assert(engagedEvents.some((event) => event.type === "player.slingshotEngaged"),
        "Expected transport-window edge to engage from the previous presented aim");

      const reset = await setPlayer(probe.inside, true);
      assert(reset.status === 200 && reset.body.ok === true, "Expected coyote rejection reset");
      const lateAim = await waitForSnapshot((body) => body.players?.some((player) =>
        player.clientId === "slingshot-coyote-test" && player.slingshot?.phase === "aim"));
      const rejectionWatermark = maxEventSeq((await getJson("/events")).body);
      await setPlayer(probe.lateOutside);
      await waitForSnapshot((body) => body.tick >= lateAim.tick + 5, 1500, 10);
      const lateEdge = await postCommand("/input", authority, 2, {
        seq: 2,
        moveX: 0,
        moveY: 1,
        thrust: 0,
        brake: 0,
        slingshot: false,
        slingshotEdges: [202],
        timestamp: Date.now(),
      });
      assert(lateEdge.status === 200 && lateEdge.body.ok === true, "Expected late edge input to reach authority");
      await sleep(120);
      const lateEvents = (await getJson(`/events?since=${rejectionWatermark}`)).body.events || [];
      assert(!lateEvents.some((event) => event.type === "player.slingshotEngaged"),
        "Expected edge beyond the effective coyote window to reject");
      const final = (await getJson("/snapshot")).body.players?.find((player) => player.clientId === "slingshot-coyote-test");
      assert(final?.slingshot?.engaged !== true, "Late edge must not engage slingshot");
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
