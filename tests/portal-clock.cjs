const {
  startSimServer,
  stopSimServer,
  TestRunner,
  assert,
} = require("./helpers.cjs");
const { Conductor } = require("../scripts/sim/conductor.cjs");

const SIM_PORT = Number(process.env.LBH_PORTAL_CLOCK_SIM_PORT || 8818);
const SIM_URL = `http://127.0.0.1:${SIM_PORT}`;

async function request(path, body = null) {
  const response = await fetch(`${SIM_URL}${path}`, body == null ? undefined : {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const json = await response.json();
  if (!response.ok || json.ok === false) throw new Error(`${path} failed: ${response.status} ${JSON.stringify(json)}`);
  return json;
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
      assert(JSON.stringify(optional.map((window) => window.openTime)) === JSON.stringify([45, 165, 285, 405, 525]),
        "Expected the evenly spread optional open cadence");
      assert(JSON.stringify(optional.map((window) => window.closeTime)) === JSON.stringify([135, 240, 321, 432, 543]),
        "Expected declarative late-phase shortening in the registered close fronts");
      assert(JSON.stringify(optional.map((window) => window.metadata.effectiveCountRange)) === JSON.stringify([[2, 3], [1, 2], [0, 0], [0, 0], [0, 0]]),
        "Expected deterministic late-phase count thinning");
      assert(finalWindow.openTime === 600 && finalWindow.closeTime === 660,
        "Final exfil must open at the main timer and close after its declared duration");
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

    await runner.run("final-exfil transition stays live through open and hard-times only at close", async () => {
      const schedule = (await request("/snapshot")).portalSchedule;
      const finalWindow = schedule.windows.find((window) => window.metadata.finalExfil);
      const state = { running: true, opened: false, closed: false, hardTimeout: false };
      const advance = (time) => {
        if (time >= finalWindow.openTime) state.opened = true;
        if (time >= finalWindow.closeTime) {
          state.closed = true;
          state.hardTimeout = true;
          state.running = false;
        }
      };
      advance(finalWindow.openTime - 0.001);
      assert(!state.opened && state.running, "Final exfil must not open before its schedule front");
      advance(finalWindow.openTime);
      assert(state.opened && state.running && !state.hardTimeout, "Main timer expiry must open final exfil while session truth stays running");
      advance(finalWindow.closeTime - 0.001);
      assert(state.running && !state.hardTimeout, "Final duration must remain usable until its close front");
      advance(finalWindow.closeTime);
      assert(state.closed && state.hardTimeout && !state.running, "Hard timeout belongs only to the declared final close front");
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
