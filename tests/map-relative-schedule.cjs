const assert = require("assert");
const fs = require("fs");
const path = require("path");
const { pathToFileURL } = require("url");
const { TestRunner, startSimServer, stopSimServer } = require("./helpers.cjs");
const serverMaps = require("../scripts/content/map-scales.cjs");

const ROOT = path.join(__dirname, "..");
const FIXTURE = JSON.parse(fs.readFileSync(path.join(__dirname, "fixtures", "map-relative-schedule.json"), "utf8"));
const SIM_PORT = Number(process.env.LBH_MAP_RELATIVE_SCHEDULE_PORT || 8821);
const SIM_URL = `http://127.0.0.1:${SIM_PORT}`;
const EPSILON = 1e-9;

function closeEnough(actual, expected, label) {
  assert(Math.abs(Number(actual) - Number(expected)) <= EPSILON, `${label}: expected ${expected}, got ${actual}`);
}

async function request(pathname, body = null) {
  const response = await fetch(`${SIM_URL}${pathname}`, body == null ? undefined : {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const bodyJson = await response.json();
  assert(response.ok && bodyJson.ok !== false, `${pathname} failed: ${response.status} ${JSON.stringify(bodyJson)}`);
  return bodyJson;
}

function assertClassificationFixture() {
  const sourceFiles = [
    "src/content/map-scales.data.json",
    "scripts/sim/collapse-epochs.cjs",
    "scripts/sim-runtime.cjs",
    "scripts/sim/conductor.cjs",
  ];
  const source = Object.fromEntries(sourceFiles.map((file) => [
    file,
    fs.readFileSync(path.join(ROOT, file), "utf8"),
  ]));
  assert(source["src/content/map-scales.data.json"].includes('"runDurationSeconds": 480'));
  assert(source["src/content/map-scales.data.json"].includes('"runDurationSeconds": 600'));
  assert(source["src/content/map-scales.data.json"].includes('"runDurationSeconds": 720'));
  assert(source["scripts/sim/collapse-epochs.cjs"].includes("duration * boundary.progress"));
  assert(source["scripts/sim-runtime.cjs"].includes("phaseProgresses: Object.freeze([0, 0.15, 0.30, 0.45])"));
  assert(source["scripts/sim-runtime.cjs"].includes("graceProgress: 0.075"));
  assert(source["scripts/sim-runtime.cjs"].includes("cadenceProgress: 0.20"));
  assert(source["scripts/sim-runtime.cjs"].includes("durationProgress: 0.15"));
  assert(source["scripts/sim-runtime.cjs"].includes('openProgress: 1'));
  assert(source["scripts/sim-runtime.cjs"].includes("finalExfilDuration: readNumber"));
  assert(source["scripts/sim-runtime.cjs"].includes("offsetGuardSeconds: 10"));
  assert(source["scripts/sim-runtime.cjs"].includes("requestedOpenProgress"));
  assert(source["scripts/sim/conductor.cjs"].includes("matchDurationSeconds"));
  assert(!source["scripts/sim-runtime.cjs"].includes("RUN_DURATION = 600"));
  assert(!source["scripts/sim-runtime.cjs"].includes("MATCH_MAX_SIM_TIME = 600"));
  assert(FIXTURE.migrated.length === 4 && FIXTURE.absolute.length === 4,
    "Expected the fixture to classify all migrated and absolute clock families");
}

function assertEpochSchedule(snapshot, duration) {
  const epochs = snapshot.world?.collapseEpochSchedule || [];
  assert.strictEqual(epochs.length, 4, "Expected four collapse epochs");
  assert.deepStrictEqual(epochs.map((epoch) => epoch.progress), [0, 0.25, 0.5, 0.75]);
  assert.deepStrictEqual(epochs.map((epoch) => epoch.epochId), [
    "collapse-epoch-0",
    "collapse-epoch-1",
    "collapse-epoch-2",
    "collapse-epoch-3",
  ]);
  epochs.forEach((epoch, index) => closeEnough(epoch.scheduledTime, duration * [0, 0.25, 0.5, 0.75][index], `${duration}s epoch ${index}`));
  assert.deepStrictEqual(epochs.map((epoch) => epoch.parameterVector.seededSeaAmbientMultiplier), [1, 1.08, 1.16, 1.24]);
}

function assertRunSchedule(snapshot, duration) {
  assert.strictEqual(snapshot.session?.runDurationSeconds, duration, `${duration}s session duration`);
  assert.strictEqual(snapshot.portalSchedule?.matchDurationSeconds, duration, `${duration}s Conductor duration`);
  const schedule = snapshot.portalSchedule;
  const waves = snapshot.inhibitor?.schedule?.severityWaves || [];
  assert.deepStrictEqual(waves.map((wave) => wave.time), [duration * 0.15, duration * 0.30, duration * 0.45]);
  assert.deepStrictEqual(waves.map((wave) => wave.waveId), [
    "inhibitor:phase-1:1",
    "inhibitor:phase-2:1",
    "inhibitor:phase-3:1",
  ]);

  const optional = schedule.windows.filter((window) => !window.metadata?.finalExfil);
  const finalWindow = schedule.windows.find((window) => window.metadata?.finalExfil);
  assert.strictEqual(optional.length, 5, `${duration}s optional portal count`);
  assert.deepStrictEqual(optional.map((window) => window.windowId), [
    "portal:optional:1",
    "portal:optional:2",
    "portal:optional:3",
    "portal:optional:4",
    "portal:optional:5",
  ]);
  optional.forEach((window, index) => {
    closeEnough(window.metadata.requestedOpenProgress, 0.075 + 0.2 * index, `${duration}s portal ${index + 1} target`);
    assert(window.metadata.openProgress + EPSILON >= window.metadata.phaseBand.startProgress &&
      window.metadata.openProgress <= window.metadata.phaseBand.endProgress + EPSILON,
    `${duration}s portal ${index + 1} crossed its declared phase band`);
    closeEnough(window.metadata.durationProgress, [0.15, 0.125, 0.10, 0.075, 0.05][index],
      `${duration}s portal ${index + 1} duration progress`);
    closeEnough(window.metadata.baseDurationSeconds, duration * window.metadata.durationProgress,
      `${duration}s portal ${index + 1} scales its base duration`);
    assert(window.duration <= window.metadata.baseDurationSeconds * (window.metadata.durationMultiplier || 1) + EPSILON,
      `${duration}s portal ${index + 1} exceeded its declared phase duration`);
    assert(window.openTime >= 0 && window.closeTime > window.openTime, `${duration}s portal ${index + 1} has invalid bounds`);
  });
  assert.deepStrictEqual(optional.map((window) => window.openId), [
    "portal:optional:1:open",
    "portal:optional:2:open",
    "portal:optional:3:open",
    "portal:optional:4:open",
    "portal:optional:5:open",
  ]);
  assert(finalWindow, "Expected final exfil window");
  closeEnough(finalWindow.openTime, duration, `${duration}s final exfil open`);
  closeEnough(finalWindow.closeTime, duration + 60, `${duration}s final exfil close`);
  assert.strictEqual(finalWindow.metadata.openProgress, 1);
  assert.strictEqual(finalWindow.metadata.durationSeconds, 60);

  const fronts = schedule.eventFronts.slice().sort((a, b) => a.time - b.time || a.id.localeCompare(b.id));
  for (let index = 1; index < fronts.length; index += 1) {
    assert(fronts[index].time - fronts[index - 1].time >= schedule.offsetGuardSeconds,
      `${duration}s front guard failed between ${fronts[index - 1].id} and ${fronts[index].id}`);
  }
  assert.deepStrictEqual(schedule.eventFronts.map((front) => front.id), schedule.eventFronts
    .slice().sort((a, b) => a.time - b.time || a.id.localeCompare(b.id)).map((front) => front.id));
}

async function run() {
  const runner = new TestRunner("MapRelativeSchedule");
  const browserMaps = await import(pathToFileURL(path.join(ROOT, "src/content/map-scales.js")).href);
  assertClassificationFixture();

  await runner.run("registry exposes exact ESM/CJS duration parity", () => {
    for (const mapId of ["shallows", "expanse", "deep-field"]) {
      assert.strictEqual(browserMaps.getMapDurationSeconds(mapId), FIXTURE.canonicalDurations[mapId]);
      assert.strictEqual(serverMaps.getMapDurationSeconds(mapId), FIXTURE.canonicalDurations[mapId]);
    }
    assert.deepStrictEqual(
      browserMaps.PLAYABLE_MAP_IDS.map((mapId) => browserMaps.getMapDurationSeconds(mapId)),
      serverMaps.PLAYABLE_MAP_IDS.map((mapId) => serverMaps.getMapDurationSeconds(mapId)),
    );
  });

  await runner.run("authority resolves every tier and preserves deterministic fronts", async () => {
    await startSimServer(SIM_PORT, { keepAlive: true, idleShutdownMs: 5000 });
    try {
    const snapshots = {};
    for (const mapId of ["shallows", "expanse", "deep-field"]) {
      const started = await request("/session/start", { mapId, maxPlayers: 1, seed: 424242 });
      snapshots[mapId] = await request("/snapshot");
      assert.strictEqual(started.session.runDurationSeconds, FIXTURE.canonicalDurations[mapId]);
      assertEpochSchedule(snapshots[mapId], FIXTURE.canonicalDurations[mapId]);
      assertRunSchedule(snapshots[mapId], FIXTURE.canonicalDurations[mapId]);
    }

    const expanse = snapshots.expanse;
    assert.deepStrictEqual(
      expanse.portalSchedule.windows.filter((window) => !window.metadata?.finalExfil).map((window) => window.openTime),
      [10, 100, 310, 405, 525],
      "600s Expanse optional openings must fit their guarded phase intervals",
    );
    assert.deepStrictEqual(
      expanse.portalSchedule.windows.filter((window) => !window.metadata?.finalExfil).map((window) => window.closeTime),
      [80, 140, 340, 427.5, 540],
      "600s Expanse optional closes must avoid every canonical front",
    );
    assert.deepStrictEqual(
      snapshots.shallows.portalSchedule.windows.map((window) => window.windowId),
      snapshots.deepField?.portalSchedule?.windows?.map((window) => window.windowId) || snapshots["deep-field"].portalSchedule.windows.map((window) => window.windowId),
      "Optional and final window IDs must remain tier-invariant",
    );

    const repeat = await request("/session/start", { mapId: "expanse", maxPlayers: 1, seed: 424242 });
    const repeatSnapshot = await request("/snapshot");
    assert.strictEqual(repeat.session.runDurationSeconds, 600);
    assert.strictEqual(JSON.stringify(repeatSnapshot.portalSchedule), JSON.stringify(expanse.portalSchedule),
      "Same seed and map must produce byte-stable schedule IDs/order and times");
    } finally {
      await stopSimServer(SIM_PORT).catch(() => null);
    }
  });

  if (!runner.summary()) process.exit(1);
}

run().catch((error) => {
  console.error(error.stack || error.message);
  process.exit(1);
});
