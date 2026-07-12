"use strict";

const { BoundedQuantiles } = require("./bounded-quantiles.cjs");

const DEFAULT_SAMPLE_INTERVAL_MS = 1_000;
const DEFAULT_WINDOW_DURATION_MS = 60_000;
const DEFAULT_EVENT_LOOP_RESOLUTION_MS = 20;
const MAX_COMPLETED_WINDOWS = 2;
const MAX_GC_SAMPLES_PER_WINDOW = 4_096;

function finite(value, fallback = 0) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
}

function createMetric() {
  return { count: 0, total: 0, min: Infinity, max: 0, latest: 0 };
}

function observeMetric(metric, value) {
  const sample = Math.max(0, finite(value));
  metric.count += 1;
  metric.total += sample;
  metric.min = Math.min(metric.min, sample);
  metric.max = Math.max(metric.max, sample);
  metric.latest = sample;
}

function describeMetric(metric) {
  return {
    count: metric.count,
    latest: metric.latest,
    min: metric.count ? metric.min : 0,
    average: metric.count ? metric.total / metric.count : 0,
    max: metric.max,
  };
}

function createWindow(startedMonotonicMs) {
  return {
    startedMonotonicMs,
    sampleCount: 0,
    memory: {
      rss: createMetric(),
      heapTotal: createMetric(),
      heapUsed: createMetric(),
      external: createMetric(),
      arrayBuffers: createMetric(),
    },
    cpuUserMicros: createMetric(),
    cpuSystemMicros: createMetric(),
    eluActiveMs: createMetric(),
    eluIdleMs: createMetric(),
    eluUtilization: createMetric(),
    gcCount: 0,
    gcDurationTotalMs: 0,
    gcKinds: Object.create(null),
    gcDurations: new BoundedQuantiles(MAX_GC_SAMPLES_PER_WINDOW),
  };
}

function createSoakRuntimeDiagnostics(options = {}) {
  const perfHooks = options.perfHooks || require("perf_hooks");
  const processApi = options.processApi || process;
  const now = options.now || (() => perfHooks.performance.now());
  const sampleIntervalMs = Math.max(1, finite(options.sampleIntervalMs, DEFAULT_SAMPLE_INTERVAL_MS));
  const windowDurationMs = Math.max(sampleIntervalMs, finite(options.windowDurationMs, DEFAULT_WINDOW_DURATION_MS));
  const setIntervalFn = options.setIntervalFn || setInterval;
  const clearIntervalFn = options.clearIntervalFn || clearInterval;
  const accounting = {
    sampleGapCount: 0,
    missedSampleCount: 0,
    sampleFailureCount: 0,
    observerFailureCount: 0,
    gcOverflowCount: 0,
    completedWindowCount: 0,
  };
  function safely(read, fallback, failureKey = "sampleFailureCount") {
    try {
      return read();
    } catch {
      accounting[failureKey] += 1;
      return fallback;
    }
  }
  const startedMonotonicMs = safely(now, 0);
  const startedUptimeSec = finite(safely(() => processApi.uptime(), 0));
  const inertEventLoopDelay = {
    max: 0,
    enable() {},
    disable() {},
    reset() {},
    percentile() { return 0; },
  };
  let eventLoopDelay = inertEventLoopDelay;
  let eventLoopDelayAvailable = false;
  try {
    eventLoopDelay = perfHooks.monitorEventLoopDelay({ resolution: DEFAULT_EVENT_LOOP_RESOLUTION_MS });
    eventLoopDelayAvailable = true;
  } catch {
    accounting.sampleFailureCount += 1;
  }
  let lifecycle = "running";
  let timer = null;
  let observer = null;
  let histogramEnabled = false;
  let observerConnected = false;
  let current = createWindow(startedMonotonicMs);
  let completed = [];
  let previousSampleMonotonicMs = startedMonotonicMs;
  let previousCpu = safely(() => processApi.cpuUsage(), { user: 0, system: 0 });
  let previousElu = safely(
    () => perfHooks.performance.eventLoopUtilization(),
    { active: 0, idle: 0, utilization: 0 },
  );

  function eventLoopSnapshot() {
    try {
      return {
        p50Ms: finite(eventLoopDelay.percentile(50)) / 1e6,
        p95Ms: finite(eventLoopDelay.percentile(95)) / 1e6,
        p99Ms: finite(eventLoopDelay.percentile(99)) / 1e6,
        maxMs: finite(eventLoopDelay.max) / 1e6,
      };
    } catch {
      accounting.sampleFailureCount += 1;
      return { p50Ms: 0, p95Ms: 0, p99Ms: 0, maxMs: 0 };
    }
  }

  function describeWindow(window, endedMonotonicMs, completedWindow) {
    const gc = window.gcDurations.snapshot();
    return {
      startedMonotonicMs: window.startedMonotonicMs,
      endedMonotonicMs,
      durationMs: Math.max(0, endedMonotonicMs - window.startedMonotonicMs),
      completed: completedWindow,
      sampleCount: window.sampleCount,
      memory: Object.fromEntries(Object.entries(window.memory).map(([key, metric]) => [key, describeMetric(metric)])),
      cpu: {
        userMicros: describeMetric(window.cpuUserMicros),
        systemMicros: describeMetric(window.cpuSystemMicros),
      },
      eventLoopUtilization: {
        activeMs: describeMetric(window.eluActiveMs),
        idleMs: describeMetric(window.eluIdleMs),
        utilization: describeMetric(window.eluUtilization),
      },
      eventLoopDelay: eventLoopSnapshot(),
      gc: {
        count: window.gcCount,
        durationTotalMs: window.gcDurationTotalMs,
        p50Ms: gc.p50,
        p95Ms: gc.p95,
        p99Ms: gc.p99,
        maxMs: gc.max,
        kindCounts: { ...window.gcKinds },
      },
    };
  }

  function resetWindow(atMonotonicMs) {
    try {
      eventLoopDelay.reset();
    } catch {
      accounting.sampleFailureCount += 1;
    }
    current = createWindow(atMonotonicMs);
  }

  function completeWindow(atMonotonicMs = now()) {
    if (lifecycle !== "running") return false;
    completed.push(describeWindow(current, atMonotonicMs, true));
    if (completed.length > MAX_COMPLETED_WINDOWS) completed = completed.slice(-MAX_COMPLETED_WINDOWS);
    accounting.completedWindowCount += 1;
    resetWindow(atMonotonicMs);
    return true;
  }

  function sampleNow(atMonotonicMs = now()) {
    if (lifecycle !== "running") return false;
    try {
      const elapsed = Math.max(0, atMonotonicMs - previousSampleMonotonicMs);
      const hasGap = elapsed > sampleIntervalMs * 1.5;
      const missedSamples = hasGap ? Math.max(1, Math.floor(elapsed / sampleIntervalMs) - 1) : 0;

      // Gather the entire sample before mutating aggregates or baselines. A
      // failed instrumentation read therefore cannot create a half-sample or
      // make the next CPU/ELU delta start from an uncommitted baseline.
      const memory = processApi.memoryUsage();
      const cpu = processApi.cpuUsage();
      const elu = perfHooks.performance.eventLoopUtilization();
      const active = Math.max(0, finite(elu.active) - finite(previousElu.active));
      const idle = Math.max(0, finite(elu.idle) - finite(previousElu.idle));
      const memorySample = Object.fromEntries(
        Object.keys(current.memory).map((key) => [key, Math.max(0, finite(memory[key]))]),
      );
      const cpuUser = Math.max(0, finite(cpu.user) - finite(previousCpu.user));
      const cpuSystem = Math.max(0, finite(cpu.system) - finite(previousCpu.system));

      for (const [key, value] of Object.entries(memorySample)) observeMetric(current.memory[key], value);
      observeMetric(current.cpuUserMicros, cpuUser);
      observeMetric(current.cpuSystemMicros, cpuSystem);
      observeMetric(current.eluActiveMs, active);
      observeMetric(current.eluIdleMs, idle);
      observeMetric(current.eluUtilization, active + idle > 0 ? active / (active + idle) : 0);
      if (hasGap) {
        accounting.sampleGapCount += 1;
        accounting.missedSampleCount += missedSamples;
      }
      previousCpu = cpu;
      previousElu = elu;
      current.sampleCount += 1;
      previousSampleMonotonicMs = atMonotonicMs;

      if (atMonotonicMs - current.startedMonotonicMs >= windowDurationMs) completeWindow(atMonotonicMs);
      return true;
    } catch {
      accounting.sampleFailureCount += 1;
      return false;
    }
  }

  function recordGc(entries) {
    if (lifecycle !== "running") return;
    try {
      for (const entry of entries.getEntries()) {
        const durationMs = Math.max(0, finite(entry.duration));
        current.gcCount += 1;
        current.gcDurationTotalMs += durationMs;
        const rawKind = entry.detail && entry.detail.kind != null ? entry.detail.kind : entry.kind;
        const kind = String(Math.max(0, Math.floor(finite(rawKind))));
        current.gcKinds[kind] = (current.gcKinds[kind] || 0) + 1;
        if (current.gcDurations.totalObserved >= MAX_GC_SAMPLES_PER_WINDOW) {
          accounting.gcOverflowCount += 1;
        }
        current.gcDurations.observe(durationMs);
      }
    } catch {
      accounting.observerFailureCount += 1;
    }
  }

  if (eventLoopDelayAvailable) {
    try {
      eventLoopDelay.enable();
      histogramEnabled = true;
    } catch {
      accounting.sampleFailureCount += 1;
    }
  }
  try {
    observer = new perfHooks.PerformanceObserver(recordGc);
    observer.observe({ entryTypes: ["gc"] });
    observerConnected = true;
  } catch {
    accounting.observerFailureCount += 1;
  }
  timer = setIntervalFn(sampleNow, sampleIntervalMs);
  if (timer && typeof timer.unref === "function") timer.unref();

  function status() {
    const atMonotonicMs = now();
    return {
      lifecycle,
      pid: Number(processApi.pid),
      monotonicMs: atMonotonicMs,
      uptimeSec: finite(processApi.uptime()),
      startedUptimeSec,
      sampleIntervalMs,
      windowDurationMs,
      timerActive: timer !== null,
      histogramEnabled,
      observerConnected,
      accounting: { ...accounting },
      completedWindows: completed.map((window) => JSON.parse(JSON.stringify(window))),
      currentWindow: lifecycle === "running"
        ? describeWindow(current, atMonotonicMs, false)
        : null,
    };
  }

  function stop() {
    if (lifecycle === "stopped") return status();
    lifecycle = "stopped";
    if (timer !== null) clearIntervalFn(timer);
    timer = null;
    try {
      eventLoopDelay.disable();
    } catch {
      accounting.sampleFailureCount += 1;
    }
    histogramEnabled = false;
    if (observer) {
      try {
        observer.disconnect();
      } catch {
        accounting.observerFailureCount += 1;
      }
    }
    observerConnected = false;
    return status();
  }

  return Object.freeze({ status, sampleNow, completeWindow, stop });
}

module.exports = {
  DEFAULT_SAMPLE_INTERVAL_MS,
  DEFAULT_WINDOW_DURATION_MS,
  MAX_COMPLETED_WINDOWS,
  MAX_GC_SAMPLES_PER_WINDOW,
  createSoakRuntimeDiagnostics,
};
