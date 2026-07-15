const { TestRunner, assert } = require("./helpers.cjs");
const {
  Conductor,
  EventFrontConflictError,
  EventFrontRegistry,
  clampedIntervalLerp,
  createIntervalLerp,
  createSeverityWaveSchedule,
  createThresholdField,
  selectToroidalSpawn,
} = require("../scripts/sim/conductor.cjs");

const EPSILON = 1e-9;

function expectThrows(fn, messagePart) {
  let error = null;
  try {
    fn();
  } catch (caught) {
    error = caught;
  }
  assert(error, `Expected an error containing ${messagePart}`);
  assert(error.message.includes(messagePart), `Expected error ${JSON.stringify(error.message)} to contain ${messagePart}`);
  return error;
}

async function run() {
  const runner = new TestRunner("Conductor");

  await runner.run("same seed and declarations produce byte-stable ordered schedule data", async () => {
    const declaration = {
      id: "threat",
      startTime: 10,
      cadence: 12,
      count: 3,
      timeJitterSeconds: 1,
      budget: { initial: 4, step: 1, jitter: 0.25 },
      tier: 2,
      tierTable: { heavy: ["sentry"], light: ["glitch"] },
      metadata: { source: "test", route: "north" },
    };
    const build = () => {
      const conductor = new Conductor({ seed: 73, offsetGuardSeconds: 5 });
      conductor.registerEventFront({ id: "opening", time: 2, kind: "phase", metadata: { phase: 0 } });
      conductor.scheduleSeverityWaves(declaration);
      return JSON.stringify(conductor.orderedScheduleData());
    };
    const first = build();
    const second = build();
    assert(first === second, "Expected identical schedule bytes for identical seed and declarations");
    const parsed = JSON.parse(first);
    assert(parsed.eventFronts[0].id === "opening", "Expected event fronts ordered by time");
    assert(parsed.severityWaves[0].waveId === "threat:1", "Expected stable wave identity");
  });

  await runner.run("seed divergence changes explicitly randomized schedule data", async () => {
    const declaration = {
      id: "seeded",
      startTime: 4,
      cadence: 8,
      count: 2,
      timeJitterSeconds: 2,
      budget: { initial: 3, step: 1, jitter: 0.5 },
    };
    const first = JSON.stringify(createSeverityWaveSchedule({ ...declaration, seed: 1 }));
    const second = JSON.stringify(createSeverityWaveSchedule({ ...declaration, seed: 2 }));
    assert(first !== second, "Expected a different seed to change jittered schedule data");
  });

  await runner.run("offset guard accepts exact separation", async () => {
    const registry = new EventFrontRegistry({ offsetGuardSeconds: 10 });
    registry.register({ id: "first", time: 5 });
    registry.register({ id: "second", time: 15 });
    assert(registry.ordered().length === 2, "Expected both exactly separated event fronts to register");
  });

  await runner.run("offset guard clearly rejects impossible overlap", async () => {
    const registry = new EventFrontRegistry({ offsetGuardSeconds: 10 });
    registry.register({ id: "first", time: 5 });
    const error = expectThrows(() => registry.register({ id: "overlap", time: 14.999 }), "at least 10 seconds apart");
    assert(error instanceof EventFrontConflictError, `Expected EventFrontConflictError, got ${error.name}`);
    assert(error.code === "EVENT_FRONT_OFFSET_CONFLICT", `Expected conflict code, got ${error.code}`);
    assert(registry.ordered().length === 1, "Expected failed registration to leave the registry unchanged");
  });

  await runner.run("threshold fields expose inactive, active, and normalized boundaries", async () => {
    const threshold = createThresholdField({ thresholdSeconds: 60 });
    const before = threshold.sample(30);
    const at = threshold.sample(60);
    const after = threshold.sample(90);
    assert(!before.active && Math.abs(before.progress - 0.5) < EPSILON, "Expected half progress before threshold");
    assert(at.active && Math.abs(at.progress - 1) < EPSILON, "Expected active at threshold");
    assert(after.active && Math.abs(after.progress - 1) < EPSILON, "Expected progress clamped after threshold");
  });

  await runner.run("interval lerps clamp and remain monotone between endpoints", async () => {
    const lerp = createIntervalLerp({ startTime: 10, endTime: 20, startValue: 2, endValue: 8 });
    const values = [lerp.sample(0), lerp.sample(10), lerp.sample(15), lerp.sample(20), lerp.sample(30)];
    assert(JSON.stringify(values) === JSON.stringify([2, 2, 5, 8, 8]), `Unexpected lerp boundaries: ${values}`);
    assert(values.every((value, index) => index === 0 || value >= values[index - 1]), "Expected increasing lerp to be monotone");
    assert(clampedIntervalLerp(8, 2, -1) === 8, "Expected descending lerp to clamp before its interval");
    assert(clampedIntervalLerp(8, 2, 2) === 2, "Expected descending lerp to clamp after its interval");
  });

  await runner.run("announced waves retain identity, time, budget, tier, table, and metadata", async () => {
    const [wave] = createSeverityWaveSchedule({
      id: "announced",
      startTime: 7,
      cadence: 10,
      count: 1,
      budget: 0,
      tier: 3,
      tierTable: { vessel: ["hunter"] },
      metadata: { reason: "test" },
    });
    assert(wave.announced === true, "Expected severity wave to be announced");
    assert(wave.waveId === "announced:1" && wave.time === 7, "Expected stable wave identity and time");
    assert(wave.budget === 0 && wave.tier === 3, "Expected nonnegative budget and tier metadata");
    assert(JSON.stringify(wave.tierTable) === JSON.stringify({ vessel: ["hunter"] }), "Expected tier table metadata");
    assert(JSON.stringify(wave.metadata) === JSON.stringify({ reason: "test" }), "Expected custom wave metadata");
  });

  await runner.run("paired windows register stable open and close fronts under the guard", async () => {
    const conductor = new Conductor({ seed: 11, conductorId: "match-conductor", offsetGuardSeconds: 10 });
    conductor.registerEventFront({ id: "inhibitor:phase-1", time: 90, kind: "inhibitor.phase" });
    const windows = conductor.scheduleWindows({
      idPrefix: "portal:optional",
      startTime: 45,
      cadence: 120,
      count: 2,
      durations: [90, 75],
      metadata: [{ kind: "optional", windowIndex: 0 }, { kind: "optional", windowIndex: 1 }],
    });
    assert(windows[0].windowId === "portal:optional:1", "Expected stable window identity");
    assert(windows[0].openId === "portal:optional:1:open" && windows[0].closeId === "portal:optional:1:close",
      "Expected paired stable open/close identities");
    assert(windows[0].openTime === 45 && windows[0].closeTime === 135, "Expected first window timing");
    assert(windows[1].openTime === 165 && windows[1].closeTime === 240, "Expected second window timing");
    const schedule = conductor.getSchedule();
    assert(schedule.conductorId === "match-conductor" && schedule.offsetGuardSeconds === 10,
      "Expected conductor identity and guard in schedule data");
    assert(schedule.windows.length === 2 && schedule.eventFronts
      .filter((front) => front.kind === "window.open" || front.kind === "window.close")
      .every((front) => front.metadata.conductorId === "match-conductor"),
      "Expected window fronts to carry conductor identity");
    assert(schedule.eventFronts.every((front, index, fronts) => index === 0 || front.time - fronts[index - 1].time >= 10),
      "Expected every registered front to satisfy the offset guard");
  });

  await runner.run("window declarations reject an impossible close/open overlap", async () => {
    const conductor = new Conductor({ seed: 12, offsetGuardSeconds: 10 });
    expectThrows(() => conductor.scheduleWindows({
      idPrefix: "portal:invalid",
      startTime: 45,
      cadence: 20,
      count: 2,
      durations: [30, 5],
    }), "must be at least 10 seconds apart");
    assert(conductor.getSchedule().eventFronts.length === 0, "Expected failed window registration to leave the conductor unchanged");
  });

  await runner.run("severity budgets reject any generated sequence below zero", async () => {
    const error = expectThrows(() => createSeverityWaveSchedule({
      id: "bad-budget",
      startTime: 0,
      cadence: 5,
      count: 3,
      budget: { initial: 2, step: -1.5 },
    }), "crosses below zero");
    assert(error instanceof RangeError, `Expected RangeError, got ${error.name}`);
  });

  await runner.run("negative jitter budget declarations fail before budget RNG consumption", async () => {
    let calls = 0;
    const spyRng = {
      range() {
        calls += 1;
        return 1;
      },
    };
    expectThrows(() => createSeverityWaveSchedule({
      id: "jitter-bound",
      startTime: 0,
      cadence: 5,
      count: 1,
      budget: { initial: 0.1, step: 0, jitter: 1 },
      rngStreams: spyRng,
    }), "declaration crosses below zero");
    assert(calls === 0, `Expected declaration rejection before budget RNG consumption, got ${calls} calls`);
  });

  await runner.run("toroidal spawn selection stays inside its explicit radius band", async () => {
    const spawn = selectToroidalSpawn({
      seed: 41,
      streamName: "test.spawn",
      origin: { wx: 9.8, wy: 0.2 },
      worldScale: 10,
      minRadius: 1,
      maxRadius: 2,
    });
    assert(spawn.wx >= 0 && spawn.wx < 10 && spawn.wy >= 0 && spawn.wy < 10, "Expected wrapped spawn coordinates");
    assert(spawn.radius >= 1 && spawn.radius < 2, `Expected sampled radius in [1, 2), got ${spawn.radius}`);
    assert(Math.abs(spawn.distance - spawn.radius) < EPSILON, "Expected toroidal distance to preserve the selected band");
    const sameSeed = selectToroidalSpawn({
      seed: 41,
      streamName: "test.spawn",
      origin: { wx: 9.8, wy: 0.2 },
      worldScale: 10,
      minRadius: 1,
      maxRadius: 2,
    });
    const otherSeed = selectToroidalSpawn({
      seed: 42,
      streamName: "test.spawn",
      origin: { wx: 9.8, wy: 0.2 },
      worldScale: 10,
      minRadius: 1,
      maxRadius: 2,
    });
    assert(JSON.stringify(spawn) === JSON.stringify(sameSeed), "Expected named stream selection to repeat for the same seed");
    assert(JSON.stringify(spawn) !== JSON.stringify(otherSeed), "Expected intended spawn randomness to diverge by seed");
  });

  await runner.run("spawn radius rejects a greater-than-half-world band before RNG consumption", async () => {
    let calls = 0;
    const spyRng = {
      angle() { calls += 1; return 0; },
      range() { calls += 1; return 0; },
    };
    expectThrows(() => selectToroidalSpawn({
      rngStreams: spyRng,
      streamName: "test.invalid",
      origin: { wx: 1, wy: 1 },
      worldScale: 10,
      minRadius: 1,
      maxRadius: 5.01,
    }), "worldScale / 2");
    assert(calls === 0, `Expected invalid radius band to consume no RNG values, got ${calls}`);
  });

  const allPassed = runner.summary();
  process.exit(allPassed ? 0 : 1);
}

run().catch((error) => {
  console.error(error.stack || error.message);
  process.exit(1);
});
