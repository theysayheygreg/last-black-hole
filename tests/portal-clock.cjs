const {
  startSimServer,
  stopSimServer,
  TestRunner,
  assert,
} = require("./helpers.cjs");
const { Conductor } = require("../scripts/sim/conductor.cjs");
const {
  canOpenPortalWindow,
  createPortalWindowOpenedEvent,
} = require("../scripts/sim/portal-window-state.cjs");

const SIM_PORT = Number(process.env.LBH_PORTAL_CLOCK_SIM_PORT || 8818);
const SIM_URL = `http://127.0.0.1:${SIM_PORT}`;
const EPSILON = 1e-9;
// The phase-1 to phase-3 transition can span one collapse front, but it must
// stay below 30% of a run. Once phase 3 begins, the original tighter bound
// protects the reported back-half drought without inventing fake windows.
const MAX_EXIT_LESS_GAP_PROGRESS = 0.30;
const MAX_BACK_HALF_GAP_PROGRESS = 0.175;

const MAP_EXPECTATIONS = Object.freeze({
  shallows: {
    duration: 480,
    optionalOpens: [10, 82, 250, 324, 420],
    optionalCloses: [62, 110, 274, 342, 432],
  },
  expanse: {
    duration: 600,
    optionalOpens: [10, 100, 310, 405, 525],
    optionalCloses: [80, 140, 340, 427.5, 540],
  },
  "deep-field": {
    duration: 720,
    optionalOpens: [10, 118, 370, 486, 630],
    optionalCloses: [98, 170, 406, 513, 648],
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
  const backHalf = live.filter((window) =>
    window.metadata?.declaredPhase === 3 || window.metadata?.finalExfil === true,
  );
  for (let index = 1; index < backHalf.length; index += 1) {
    const gapProgress = (backHalf[index].openTime - backHalf[index - 1].closeTime) / duration;
    assert(gapProgress <= MAX_BACK_HALF_GAP_PROGRESS + EPSILON,
      `${mapId} back half has an exit-less gap of ${(gapProgress * 100).toFixed(1)}%`);
  }
}

function assertMapSchedule(snapshot, mapId, expectation) {
  const schedule = snapshot.portalSchedule;
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
    closeEnough(window.openTime, expectation.optionalOpens[index],
      `${mapId} optional ${index + 1} opening front`);
    closeEnough(window.closeTime, expectation.optionalCloses[index],
      `${mapId} optional ${index + 1} closing front`);
  });

  const canonicalFronts = Array.from(new Set([
    ...(snapshot.inhibitor?.schedule?.severityWaves || []).map((wave) => wave.time),
    ...(snapshot.world?.collapseEpochSchedule || []).map((epoch) => epoch.scheduledTime),
  ])).sort((a, b) => a - b);

  optional.forEach((window, index) => {
    const requestedProgress = 0.075 + 0.2 * index;
    const phaseBand = window.metadata.phaseBand;
    assert(phaseBand, `${mapId} optional ${index + 1} declares its phase band`);
    closeEnough(window.metadata.requestedOpenProgress, requestedProgress,
      `${mapId} optional ${index + 1} normalized target`);
    assert(window.metadata.openProgress + EPSILON >= phaseBand.startProgress &&
      window.closeTime / expectation.duration <= phaseBand.endProgress + EPSILON,
    `${mapId} optional ${index + 1} crossed its declared phase band at either endpoint`);
    const guardedStart = phaseBand.startProgress * expectation.duration + schedule.offsetGuardSeconds;
    const guardedEnd = phaseBand.endProgress * expectation.duration - schedule.offsetGuardSeconds;
    assert(window.openTime + EPSILON >= guardedStart && window.closeTime <= guardedEnd + EPSILON,
      `${mapId} optional ${index + 1} escaped its guarded phase interval`);
    for (const frontTime of canonicalFronts) {
      const entirelyBefore = window.closeTime <= frontTime - schedule.offsetGuardSeconds + EPSILON;
      const entirelyAfter = window.openTime + EPSILON >= frontTime + schedule.offsetGuardSeconds;
      assert(entirelyBefore || entirelyAfter,
        `${mapId} optional ${index + 1} crosses canonical front ${frontTime}`);
    }
    assert(window.metadata.phaseAtOpen === window.metadata.declaredPhase,
      `${mapId} optional ${index + 1} changed its declared phase`);
    assert(canOpenPortalWindow(window), `${mapId} optional ${index + 1} must be a real player route`);
    closeEnough(window.duration, expectation.optionalCloses[index] - expectation.optionalOpens[index],
      `${mapId} optional ${index + 1} guarded duration`);
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
        assert(snapshot.world.portals.length === 0,
          `${mapId} must not materialize a portal before its declared open front`);
        assertMapSchedule(snapshot, mapId, expectation);
      }
    });

    await runner.run("zero-count diagnostic windows cannot publish an opening", () => {
      const zeroCount = { windowId: "portal:optional:zero", metadata: { effectiveCountRange: [0, 0] } };
      const liveOptional = { metadata: { effectiveCountRange: [1, 1] } };
      const finalExfil = { metadata: { finalExfil: true, effectiveCountRange: [1, 1] } };
      assert(canOpenPortalWindow(zeroCount) === false,
        "A zero-count schedule entry must be suppressed before portal.windowOpened is published");
      assert(canOpenPortalWindow(liveOptional) === true);
      assert(canOpenPortalWindow(finalExfil) === true);
      const eventStream = [];
      const zeroEvent = createPortalWindowOpenedEvent(zeroCount, { windowId: zeroCount.windowId });
      if (zeroEvent) eventStream.push(zeroEvent);
      assert(eventStream.every((event) => event.type !== "portal.windowOpened"),
        "A zero-count runtime window must emit no portal.windowOpened event");
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
