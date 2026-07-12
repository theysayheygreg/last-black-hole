#!/usr/bin/env node
"use strict";

const nodeAssert = require("assert");
const { TestRunner, assert } = require("./helpers.cjs");
const {
  MAX_COMPLETED_WINDOWS,
  createSoakRuntimeDiagnostics,
} = require("../scripts/soak-runtime-diagnostics.cjs");

function fixture() {
  let monotonicMs = 100;
  let uptimeSec = 10;
  let cpu = { user: 1_000, system: 500 };
  let elu = { active: 20, idle: 80, utilization: 0.2 };
  let intervalCallback = null;
  let cleared = 0;
  let unrefed = 0;
  let histogramEnabled = 0;
  let histogramDisabled = 0;
  let histogramResets = 0;
  let observerCallback = null;
  let observerDisconnected = 0;
  let failMemoryReads = 0;
  const histogram = {
    max: 9_000_000,
    enable() { histogramEnabled += 1; },
    disable() { histogramDisabled += 1; },
    reset() { histogramResets += 1; },
    percentile(value) { return value * 100_000; },
  };
  class FakeObserver {
    constructor(callback) { observerCallback = callback; }
    observe(options) { nodeAssert.deepStrictEqual(options, { entryTypes: ["gc"] }); }
    disconnect() { observerDisconnected += 1; }
  }
  const processApi = {
    pid: 4242,
    uptime: () => uptimeSec,
    memoryUsage: () => {
      if (failMemoryReads > 0) {
        failMemoryReads -= 1;
        throw new Error("injected memory failure");
      }
      return {
        rss: 1000 + monotonicMs,
        heapTotal: 800,
        heapUsed: 400,
        external: 30,
        arrayBuffers: 20,
      };
    },
    cpuUsage: () => ({ ...cpu }),
  };
  const perfHooks = {
    performance: { eventLoopUtilization: () => ({ ...elu }) },
    monitorEventLoopDelay: ({ resolution }) => {
      assert(resolution === 20, "event-loop histogram must use the declared 20ms resolution");
      return histogram;
    },
    PerformanceObserver: FakeObserver,
  };
  const diagnostics = createSoakRuntimeDiagnostics({
    processApi,
    perfHooks,
    now: () => monotonicMs,
    sampleIntervalMs: 10,
    windowDurationMs: 20,
    setIntervalFn(callback, delay) {
      assert(delay === 10, "test sampler should retain its injected one-Hz analogue");
      intervalCallback = callback;
      return { unref() { unrefed += 1; } };
    },
    clearIntervalFn() { cleared += 1; },
  });
  return {
    diagnostics,
    advance(ms, { user = 10, system = 5, active = 2, idle = 8 } = {}) {
      monotonicMs += ms;
      uptimeSec += ms / 1000;
      cpu = { user: cpu.user + user, system: cpu.system + system };
      elu = { active: elu.active + active, idle: elu.idle + idle, utilization: active / (active + idle) };
    },
    sample: () => intervalCallback(),
    failNextMemoryRead() { failMemoryReads += 1; },
    gc(entries) { observerCallback({ getEntries: () => entries }); },
    resources: () => ({
      cleared, unrefed, histogramEnabled, histogramDisabled, histogramResets, observerDisconnected,
    }),
  };
}

async function run() {
  const runner = new TestRunner("SoakRuntimeDiagnostics");

  await runner.run("production runtime keeps diagnostics completely absent unless explicitly enabled", async () => {
    const source = require("fs").readFileSync(require("path").join(__dirname, "../scripts/sim-runtime.cjs"), "utf8");
    assert(source.includes('process.env.LBH_SOAK_DIAGNOSTICS === "1"'), "runtime must use exact opt-in authorization");
    assert(source.includes("if (soakRuntimeDiagnostics) health.soakDiagnostics"), "default health must omit diagnostics entirely");
    assert(!Object.prototype.hasOwnProperty.call({}, "soakDiagnostics"), "default health shape has no placeholder field");
  });

  await runner.run("opt-in sampler exposes bounded numeric aggregates and explicit gaps", async () => {
    const f = fixture();
    f.advance(10);
    f.sample();
    f.gc([
      { duration: 2, detail: { kind: 1 } },
      { duration: 5, detail: { kind: 4 } },
    ]);
    f.advance(25);
    f.sample();
    f.advance(20);
    f.sample();
    f.advance(20);
    f.sample();
    const status = f.diagnostics.status();
    assert(status.pid === 4242 && status.lifecycle === "running", "status must expose authority PID and lifecycle");
    assert(status.monotonicMs === 175 && status.uptimeSec > status.startedUptimeSec, "status must expose monotonic and uptime clocks");
    assert(status.completedWindows.length === MAX_COMPLETED_WINDOWS, "completed runtime windows must retain exactly the last two");
    assert(status.accounting.completedWindowCount === 3, "evicted windows must remain counted without being retained");
    assert(status.accounting.sampleGapCount === 3 && status.accounting.missedSampleCount === 3,
      "late sampling must expose explicit gap and missed-sample counts");
    const firstRetained = status.completedWindows[0];
    assert(firstRetained.sampleCount === 1, "each completed window must report bounded sample cardinality");
    assert(firstRetained.eventLoopDelay.p95Ms === 9.5 && firstRetained.eventLoopDelay.maxMs === 9,
      "event-loop aggregates must be converted from nanoseconds to milliseconds");
    const serialized = JSON.stringify(status);
    assert(!serialized.includes("getEntries") && !serialized.includes("duration\":2"),
      "health must not expose raw performance or GC event lists");
    assert(f.resources().unrefed === 1, "diagnostic timer must be unrefed");
  });

  await runner.run("GC aggregates are numeric, kind-bounded, and reset with the minute window", async () => {
    const f = fixture();
    f.gc([
      { duration: 1, detail: { kind: 1 } },
      { duration: 3, detail: { kind: 1 } },
      { duration: 7, detail: { kind: 4 } },
    ]);
    f.advance(20);
    f.sample();
    const window = f.diagnostics.status().completedWindows[0];
    assert(window.gc.count === 3 && window.gc.durationTotalMs === 11, "GC window must aggregate exact count and duration");
    assert(window.gc.p50Ms === 3 && window.gc.p95Ms === 7 && window.gc.p99Ms === 7 && window.gc.maxMs === 7,
      "GC window must expose bounded pause quantiles only");
    nodeAssert.deepStrictEqual(window.gc.kindCounts, { 1: 2, 4: 1 });
    assert(f.diagnostics.status().currentWindow.gc.count === 0, "completed window must reset current GC aggregates");
  });

  await runner.run("sampling failures are atomic and later success exposes the missing interval", async () => {
    const f = fixture();
    f.advance(10);
    f.sample();
    f.advance(25);
    f.failNextMemoryRead();
    assert(f.diagnostics.sampleNow() === false, "instrumentation failure must stay contained");
    let status = f.diagnostics.status();
    assert(status.accounting.sampleFailureCount === 1 && status.currentWindow.sampleCount === 1,
      "failed sampling must be counted without committing a partial sample");
    assert(status.accounting.sampleGapCount === 0 && status.accounting.missedSampleCount === 0,
      "a late failed attempt must not pre-commit gap accounting");
    assert(status.currentWindow.cpu.userMicros.count === 1 && status.currentWindow.memory.rss.count === 1,
      "all sample aggregates must retain the same committed cardinality after failure");
    f.advance(10);
    f.sample();
    status = f.diagnostics.status();
    assert(status.accounting.sampleGapCount === 1 && status.accounting.missedSampleCount === 2,
      "the next success must expose the interval missing since the last committed sample");
    assert(status.completedWindows[0].cpu.userMicros.max === 20,
      "CPU delta after failure must cover the full uncommitted interval exactly once");
  });

  await runner.run("instrumentation startup failures degrade to explicit stopped capabilities", async () => {
    const diagnostics = createSoakRuntimeDiagnostics({
      now: () => 10,
      processApi: {
        pid: 7,
        uptime: () => 1,
        memoryUsage: () => ({}),
        cpuUsage: () => { throw new Error("cpu unavailable"); },
      },
      perfHooks: {
        performance: {
          eventLoopUtilization: () => { throw new Error("ELU unavailable"); },
        },
        monitorEventLoopDelay: () => { throw new Error("histogram unavailable"); },
        PerformanceObserver: class {
          constructor() { throw new Error("observer unavailable"); }
        },
      },
      setIntervalFn: () => ({ unref() {} }),
      clearIntervalFn: () => {},
    });
    const status = diagnostics.status();
    assert(status.lifecycle === "running" && status.timerActive === true,
      "optional diagnostics failures must not abort the authority sampler lifecycle");
    assert(status.histogramEnabled === false && status.observerConnected === false,
      "failed instrumentation capabilities must be explicit rather than fabricated");
    assert(status.accounting.sampleFailureCount === 3 && status.accounting.observerFailureCount === 1,
      "every failed startup capability must have a numeric failure count");
    diagnostics.stop();
  });

  await runner.run("cleanup proves every owned resource stopped", async () => {
    const f = fixture();
    f.advance(10);
    f.sample();
    const stopped = f.diagnostics.stop();
    assert(stopped.lifecycle === "stopped" && stopped.timerActive === false, "cleanup health must prove sampler stopped");
    assert(stopped.histogramEnabled === false && stopped.observerConnected === false,
      "cleanup health must prove histogram and observer stopped");
    assert(stopped.currentWindow === null, "stopped health must not expose a mutable current window");
    assert(f.diagnostics.sampleNow() === false && f.diagnostics.completeWindow() === false,
      "stopped sampler must reject later mutation");
    const resources = f.resources();
    assert(resources.cleared === 1 && resources.histogramDisabled === 1 && resources.observerDisconnected === 1,
      "cleanup must clear the timer, disable the histogram, and disconnect the observer exactly once");
    f.diagnostics.stop();
    assert(f.resources().cleared === 1, "cleanup must be idempotent");
  });

  if (!runner.summary()) process.exitCode = 1;
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
