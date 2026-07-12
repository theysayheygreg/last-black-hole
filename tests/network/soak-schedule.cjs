"use strict";

const crypto = require("crypto");
const { createSplitMix64 } = require("./seeded-frame-scheduler.cjs");

function stable(value) {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`;
  return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stable(value[key])}`).join(",")}}`;
}

function compileSoakSchedule(fixture) {
  const durations = { "pr-smoke": 360000, "normal-45m": 2700000 };
  if (!Object.hasOwn(durations, fixture.profile) || fixture.pilotCount !== 8
    || fixture.wallTimeMs !== durations[fixture.profile]
    || fixture.warmupMs + fixture.measuredBodyMs + fixture.recoveryMs !== fixture.wallTimeMs) {
    throw new Error(`${fixture.profile} fixture duration/topology contract mismatch`);
  }
  const rng = createSplitMix64(BigInt(fixture.rootSeed));
  const schedule = [];
  for (let atMs = 0; atMs < fixture.wallTimeMs; atMs += fixture.inputCadenceMs) {
    for (let seat = 0; seat < fixture.pilotCount; seat += 1) {
      let moveX = (Number(rng() >> 11n) / 9007199254740992) * 2 - 1;
      let moveY = (Number(rng() >> 11n) / 9007199254740992) * 2 - 1;
      const magnitude = Math.hypot(moveX, moveY);
      if (magnitude > 1) { moveX /= magnitude; moveY /= magnitude; }
      schedule.push({ atMs, order: 50, kind: "input", seat,
        moveX: Number(moveX.toFixed(6)), moveY: Number(moveY.toFixed(6)) });
    }
  }
  for (let atMs = 0; atMs <= fixture.wallTimeMs; atMs += fixture.healthCadenceMs) {
    schedule.push({ atMs, order: 40, kind: "health-sample" });
  }
  let round = 0;
  const cycleActionTimes = new Set(fixture.barriers.filter((entry) => entry.kind === "reconnect" || entry.kind === "leave-join")
    .map((entry) => entry.atMs));
  for (let atMs = fixture.warmupMs; atMs < fixture.warmupMs + fixture.measuredBodyMs;
    atMs += fixture.actionCadenceMs, round += 1) {
    if (cycleActionTimes.has(atMs)) continue;
    const seat = round % 8;
    const anticipatedIncarnation = fixture.profile === "pr-smoke" && seat === 5 && atMs >= 240000 ? 2 : 1;
    schedule.push({ atMs, order: 60, kind: "action", round, seat: round % 8,
      actionKindIndex: Math.floor(round / 8) % 5,
      anticipatedIncarnation,
      semanticId: `${fixture.profile}-${fixture.rootSeed}-round-${round}-seat-${seat}-inc-${anticipatedIncarnation}-kind-${Math.floor(round / 8) % 5}` });
  }
  for (const barrier of fixture.barriers) {
    const order = barrier.kind === "forced-gc-checkpoint" ? 30 : 10;
    schedule.push({ ...barrier, order });
  }
  schedule.push({ atMs: fixture.wallTimeMs, order: 90, kind: "final-drain" });
  schedule.sort((a, b) => a.atMs - b.atMs || a.order - b.order || (a.seat ?? -1) - (b.seat ?? -1));
  const scheduleHash = crypto.createHash("sha256").update(stable({
    scenarioVersion: fixture.scenarioVersion, rootSeed: fixture.rootSeed, schedule,
  })).digest("hex");
  const gcMinutes = fixture.barriers.filter((entry) => entry.kind === "forced-gc-checkpoint")
    .flatMap((entry) => [Math.floor(entry.atMs / 60000), Math.floor(entry.atMs / 60000) + 1]);
  return Object.freeze({ scenarioVersion: fixture.scenarioVersion, profile: fixture.profile,
    rootSeed: fixture.rootSeed, scheduleHash, excludedPerformanceMinutes: [...new Set(gcMinutes)],
    events: Object.freeze(schedule.map(Object.freeze)) });
}

module.exports = { compileSoakSchedule, stable };
