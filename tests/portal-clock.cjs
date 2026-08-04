const {
  startSimServer,
  stopSimServer,
  TestRunner,
  assert,
} = require("./helpers.cjs");
const { Conductor } = require("../scripts/sim/conductor.cjs");
const { canOpenPortalWindow } = require("../scripts/sim/portal-window-state.cjs");

const SIM_PORT = Number(process.env.LBH_PORTAL_CLOCK_SIM_PORT || 8818);
const SIM_URL = `http://127.0.0.1:${SIM_PORT}`;
const EPSILON = 1e-9;
// This leaves less than one .20 cadence beat without a player-visible exit.
// It protects the original report's back-half drought without prescribing a
// new simulation clock or fake windows.
const MAX_EXIT_LESS_GAP_PROGRESS = 0.175;

const MAP_EXPECTATIONS = Object.freeze({
  shallows: {
    duration: 480,
    optionalDurations: [72, 60, 24, 18, 12],
  },
  expanse: {
    duration: 600,
    optionalDurations: [90, 75, 30, 22.5, 15],
  },
  "deep-field": {
    duration: 720,
    optionalDurations: [108, 90, 36, 27, 18],
  },
});

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

function closeEnough(actual, expected, label) {
  assert(Math.abs(Number(actual) - Number(expected)) <= EPSILON,
    `${label}: expected ${expected}, got ${actual}`);
}

function assertGuarded(fronts, guard) {
  const ordered = fronts.slice().sort((a, b) => a.time - b.time || a.id.localeCompare(b.id));
  for (let index = 1; index < ordered.length; index += 1) {
    assert(ordered[index].time - ordered[index - 1].time >= guard,
      `Event fronts ${ordered[index - 1].id}/${ordered[index].id} violated ${guard}s guard`);
  }
}

function assertExitlessGapBound(windows, duration, mapId) {
  const live = windows.filter((window) => canOpenPortalWindow(window));
  const fronts = [{ openTime: 0, closeTime: 0 }, ...live];
  for (let index = 1; index < fronts.length; index += 1) {
    const gapProgress = (fronts[index].openTime - fronts[index - 1].closeTime) / duration;
    assert(gapProgress <= MAX_EXIT_LESS_GAP_PROGRESS + EPSILON,
      `${mapId} has an exit-less gap of ${(gapProgress * 100).toFixed(1)}%, above the ${MAX_EXIT_LESS_GAP_PROGRESS * 100}% bound`);
  }
}

function assertMapSchedule(schedule, mapId, expectation) {
  assert(schedule?.conductorId === "match-conductor", "Expected the portal schedule on the match Conductor");
  assert(schedule.matchDurationSeconds === expectation.duration, `${mapId} schedule duration`);
  assert(schedule.offsetGuardSeconds === 10, `${mapId} Conductor guard`);

  const optional = schedule.windows.filter((window) => !window.metadata.finalExfil);
  const finalWindow = schedule.windows.find((window) => window.metadata.finalExfil);
  assert(optional.length === 5, `${mapId} keeps five declared optional windows`);
  assert(JSON.stringify(optional.map((window) => window.metadata.effectiveCountRange)) === JSON.stringify([
    [2, 3], [1, 2], [1, 1], [1, 1], [1, 1],
  ]), `${mapId} keeps every optional window real through phase three`);

  optional.forEach((window, index) => {
    const requestedProgress = 0.075 + 0.2 * index;
    const phaseBand = window.metadata.phaseBand;
    assert(phaseBand, `${mapId} optional ${index + 1} declares its phase band`);
    closeEnough(window.metadata.requestedOpenProgress, requestedProgress,
      `${mapId} optional ${index + 1} normalized target`);
    assert(window.metadata.openProgress + EPSILON >= phaseBand.startProgress &&
      window.metadata.openProgress <= phaseBand.endProgress + EPSILON,
    `${mapId} optional ${index + 1} crossed its declared phase band`);
    assert(window.metadata.phaseAtOpen === window.metadata.declaredPhase,
      `${mapId} optional ${index + 1} changed its declared phase`);
    assert(canOpenPortalWindow(window), `${mapId} optional ${index + 1} must be a real player route`);
    closeEnough(window.duration, expectation.optionalDurations[index],
      `${mapId} optional ${index + 1} duration`);
  });
  assert(optional.slice(0, 3).every(canOpenPortalWindow),
    `${mapId} must retain a live optional route in each declared early/mid/pressure band`);
  assertExitlessGapBound([...optional, finalWindow], expectation.duration, mapId);

  assert(finalWindow, `${mapId} final exfil window`);
  closeEnough(finalWindow.openTime, expectation.duration, `${mapId} final exfil open`);
  closeEnough(finalWindow.closeTime, expectation.duration + 60, `${mapId} final exfil close`);
  assert(finalWindow.openId.endsWith(":open") && finalWindow.closeId.endsWith(":close"),
    `${mapId} final exfil event identities`);
  assertGuarded(schedule.eventFronts, schedule.offsetGuardSeconds);
}

async function run() {
  const runner = new TestRunner("PortalClock");
  await startSimServer(SIM_PORT, { keepAlive: true, idleShutdownMs: 5000 });

  try {
    await runner.run("every map keeps phase-banded live portal routes without a back-half drought", async () => {
      for (const [mapId, expectation] of Object.entries(MAP_EXPECTATIONS)) {
        await request("/session/start", { mapId, maxPlayers: 1, seed: 424242 });
        const snapshot = await request("/snapshot");
      assert(snapshot.world.portals.length === 0, `${mapId} must not materialize a portal before its declared open front`);
        assertMapSchedule(snapshot.portalSchedule, mapId, expectation);
      }
    });

    await runner.run("zero-count diagnostic windows cannot publish an opening", () => {
      const zeroCount = { metadata: { effectiveCountRange: [0, 0] } };
      const liveOptional = { metadata: { effectiveCountRange: [1, 1] } };
      const finalExfil = { metadata: { finalExfil: true, effectiveCountRange: [1, 1] } };
      assert(canOpenPortalWindow(zeroCount) === false,
        "A zero-count schedule entry must be suppressed before portal.windowOpened is published");
      assert(canOpenPortalWindow(liveOptional) === true);
      assert(canOpenPortalWindow(finalExfil) === true);
    });

    await runner.run("Conductor spawn selection preserves declared final radius bands", async () => {
      await request("/session/start", { mapId: "shallows", maxPlayers: 1, seed: 424242 });
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
