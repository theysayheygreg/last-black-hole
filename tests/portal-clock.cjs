const {
  startSimServer,
  stopSimServer,
  TestRunner,
  assert,
} = require("./helpers.cjs");
const { Conductor } = require("../scripts/sim/conductor.cjs");

const SIM_PORT = Number(process.env.LBH_PORTAL_CLOCK_SIM_PORT || 8818);
const TRANSITION_PORT = Number(process.env.LBH_PORTAL_CLOCK_TRANSITION_PORT || 8819);
const SIM_URL = `http://127.0.0.1:${SIM_PORT}`;

async function request(path, body = null, port = SIM_PORT) {
  const baseUrl = port === SIM_PORT ? SIM_URL : `http://127.0.0.1:${port}`;
  const response = await fetch(`${baseUrl}${path}`, body == null ? undefined : {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const json = await response.json();
  if (!response.ok || json.ok === false) throw new Error(`${path} failed: ${response.status} ${JSON.stringify(json)}`);
  return json;
}

async function waitForSnapshot(port, predicate, timeoutMs = 5000) {
  const deadline = Date.now() + timeoutMs;
  let last = null;
  while (Date.now() < deadline) {
    try {
      last = await request("/snapshot", null, port);
      if (predicate(last)) return last;
    } catch (error) {
      last = { error };
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`Timed out waiting for snapshot on ${port}: ${JSON.stringify({
    session: last?.session,
    simTime: last?.simTime,
    portals: last?.world?.portals,
    players: last?.players?.map((player) => ({ clientId: player.clientId, isAI: player.isAI, status: player.status })),
    finalWindow: last?.portalSchedule?.windows?.find((window) => window.metadata?.finalExfil),
  })}`);
}

async function waitForEvents(port, since, predicate, timeoutMs = 5000) {
  const deadline = Date.now() + timeoutMs;
  let last = [];
  while (Date.now() < deadline) {
    try {
      last = (await request(`/events?since=${since}`, null, port)).events || [];
      if (predicate(last)) return last;
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`Timed out waiting for events on ${port}: ${JSON.stringify(last)}`);
}

function maxEventSeq(events) {
  return Math.max(0, ...(events || []).map((event) => Number(event.seq) || 0));
}

function assertGuarded(fronts, guard) {
  const ordered = fronts.slice().sort((a, b) => a.time - b.time || a.id.localeCompare(b.id));
  for (let index = 1; index < ordered.length; index += 1) {
    assert(ordered[index].time - ordered[index - 1].time >= guard,
      `Event fronts ${ordered[index - 1].id}/${ordered[index].id} violated ${guard}s guard`);
  }
}

async function run() {
  const runner = new TestRunner("PortalClock");
  await startSimServer(SIM_PORT, { keepAlive: true, idleShutdownMs: 5000 });

  try {
    await runner.run("server publishes one guarded deterministic portal schedule", async () => {
      const first = await request("/snapshot");
      assert(first.world.portals.length === 0, "No portal may exist before its declared open event");
      const schedule = first.portalSchedule;
      assert(schedule?.conductorId === "match-conductor", "Expected the portal schedule on the match Conductor");
      assert(schedule.offsetGuardSeconds === 10, "Expected the provisional ten-second Conductor guard");
      assert(schedule.windows.length === 6, `Expected five optional windows and one final window, got ${schedule.windows.length}`);

      const optional = schedule.windows.filter((window) => !window.metadata.finalExfil);
      const finalWindow = schedule.windows.find((window) => window.metadata.finalExfil);
      assert(JSON.stringify(optional.map((window) => window.openTime)) === JSON.stringify([36, 226, 281, 327, 420]),
        "Expected normalized optional targets with the absolute guard resolved forward");
      assert(JSON.stringify(optional.map((window) => window.closeTime)) === JSON.stringify([126, 271, 317, 354, 438]),
        "Expected absolute portal durations with declarative late-phase shortening");
      assert(JSON.stringify(optional.map((window) => window.metadata.effectiveCountRange)) === JSON.stringify([[2, 3], [0, 0], [0, 0], [0, 0], [0, 0]]),
        "Expected deterministic late-phase count thinning");
      assert(finalWindow.openTime === 480 && finalWindow.closeTime === 540,
        "Final exfil must open at the Shallows timer and close after its declared duration");
      assert(finalWindow.openId.endsWith(":open") && finalWindow.closeId.endsWith(":close"),
        "Expected stable final open/close event identities");
      assertGuarded(schedule.eventFronts, schedule.offsetGuardSeconds);

      const restarted = await request("/session/start", { mapId: "shallows", maxPlayers: 1, seed: 424242 });
      const sameSeed = await request("/snapshot");
      assert(restarted.session.seed === 424242, "Expected the focused restart to use the requested seed");
      assert(JSON.stringify(sameSeed.portalSchedule) === JSON.stringify(
        await request("/session/start", { mapId: "shallows", maxPlayers: 1, seed: 424242 })
          .then(() => request("/snapshot"))
          .then((snapshot) => snapshot.portalSchedule)
      ), "Expected same seed/config to produce byte-stable portal schedule data");
    });

    await runner.run("live server opens and closes guaranteed final exfil on its declared fronts", async () => {
      await startSimServer(TRANSITION_PORT, {
        keepAlive: true,
        idleShutdownMs: 5000,
        env: {
          LBH_SIM_MAX_SIM_TIME: "10",
          LBH_SIM_FINAL_EXFIL_DURATION: "10",
          LBH_SIM_TERMINAL_GRACE_MS: "60000",
        },
      });
      try {
        const start = await request("/session/start", {
          mapId: "shallows",
          requesterId: "portal-clock-host",
          requesterName: "Portal Clock Host",
          maxPlayers: 1,
        }, TRANSITION_PORT);
        assert(start.session?.runId, "Expected a real session start run id");
        const join = await request("/join", {
          runId: start.session.runId,
          clientId: "portal-clock-host",
          name: "Portal Clock Host",
          joinTicket: start.joinTicket,
        }, TRANSITION_PORT);
        assert(join.ok === true, "Expected a real human to join the transition session");

        const baseline = await request("/events?since=0", null, TRANSITION_PORT);
        const since = maxEventSeq(baseline.events);
        const beforeOpen = await waitForSnapshot(TRANSITION_PORT, (snapshot) =>
          snapshot.session?.status === "running" && snapshot.simTime >= 5 && snapshot.simTime < 10, 8000);
        assert(!beforeOpen.world.portals.some((portal) => portal.finalInhibitor && portal.alive !== false),
          "Real server must not materialize final exfil before the main timer");

        const opened = await waitForSnapshot(TRANSITION_PORT, (snapshot) =>
          snapshot.session?.status === "running" && snapshot.simTime >= 10 && snapshot.simTime < 20 &&
          snapshot.world.portals.some((portal) => portal.id === "portal-final-exfil" && portal.alive !== false), 12000);
        const finalPortal = opened.world.portals.find((portal) => portal.id === "portal-final-exfil");
        const openEvents = await waitForEvents(TRANSITION_PORT, since, (events) =>
          events.some((event) => event.type === "portal.windowOpened" && event.payload?.windowId === "portal:final-exfil:1") &&
          events.some((event) => event.type === "portal.spawned" && event.payload?.portalId === "portal-final-exfil"), 3000);
        const openedEvent = openEvents.find((event) => event.type === "portal.windowOpened" && event.payload?.windowId === "portal:final-exfil:1");
        const spawnedEvent = openEvents.find((event) => event.type === "portal.spawned" && event.payload?.portalId === "portal-final-exfil");
        assert(opened.session.status === "running", "Real session must remain running at final open");
        assert(finalPortal.windowId === "portal:final-exfil:1" && finalPortal.scheduledOpenTime === 10 && finalPortal.scheduledCloseTime === 20,
          "Real final portal must carry the declared open and close schedule");
        assert(openedEvent.payload.conductorId === "match-conductor" && openedEvent.payload.openId.endsWith(":open") &&
          openedEvent.payload.scheduledOpenTime === 10 && openedEvent.payload.scheduledCloseTime === 20,
        "Real open event must carry Conductor identity and schedule fronts");
        assert(spawnedEvent.payload.conductorId === "match-conductor" && spawnedEvent.payload.portalId === finalPortal.id,
          "Real spawn event must identify the guaranteed final portal");

        const ended = await waitForSnapshot(TRANSITION_PORT, (snapshot) =>
          snapshot.session?.status === "ended" && snapshot.simTime >= 20, 20000);
        const closeEvents = await waitForEvents(TRANSITION_PORT, since, (events) =>
          events.some((event) => event.type === "portal.windowClosed" && event.payload?.windowId === "portal:final-exfil:1") &&
          events.some((event) => event.type === "portal.expired" && event.payload?.portalId === "portal-final-exfil"), 3000);
        assert(ended.session.endReason === "run-timeout", "Real final close must end the session as run-timeout");
        assert(ended.players.filter((player) => !player.isAI && player.status === "alive").length === 0,
          "Real final close must leave no active humans");
        assert(closeEvents.some((event) => event.type === "portal.windowClosed" && event.payload?.closeId.endsWith(":close")),
          "Real close event must carry its paired close identity");
      } finally {
        await stopSimServer(TRANSITION_PORT).catch(() => null);
      }
    });

    await runner.run("Conductor spawn selection preserves declared final radius bands", async () => {
      const schedule = (await request("/snapshot")).portalSchedule;
      const finalWindow = schedule.windows.find((window) => window.metadata.finalExfil);
      const band = finalWindow.metadata.spawnRadiusBands.finalExfil;
      for (const seed of [1, 2, 17, 4242, 99999]) {
        const conductor = new Conductor({ seed, worldScale: 3 });
        const spawn = conductor.selectToroidalSpawn({
          streamName: "portal.spawn.portal:final-exfil:1.0.attempt-0",
          anchor: { wx: 1.5, wy: 1.5 },
          worldScale: 3,
          minRadius: band.minRadius,
          maxRadius: band.maxRadius,
        });
        assert(spawn.radius >= band.minRadius && spawn.radius <= band.maxRadius,
          `Final spawn escaped its declared band for seed ${seed}`);
      }
    });
  } finally {
    await stopSimServer(SIM_PORT).catch(() => null);
  }

  if (!runner.summary()) process.exit(1);
}

run().catch((error) => {
  console.error(error.stack || error.message);
  process.exit(1);
});
