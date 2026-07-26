"use strict";

const { performance } = require("perf_hooks");

function percentile(samples, fraction) {
  if (!samples.length) return 0;
  const sorted = [...samples].sort((left, right) => left - right);
  const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil(sorted.length * fraction) - 1));
  return sorted[index];
}

function summarize(samples) {
  return {
    p50Ms: Number(percentile(samples, 0.5).toFixed(3)),
    p95Ms: Number(percentile(samples, 0.95).toFixed(3)),
    maxMs: Number((samples.length ? Math.max(...samples) : 0).toFixed(3)),
  };
}

/**
 * Run fixed-dt authority work against monotonic wall-clock deadlines. Late
 * timers shorten the next wait instead of rounding every interval up; a long
 * stall drops stale deadlines rather than fast-forwarding gameplay in a burst.
 */
function createAuthorityDeadlineLoop({
  tick,
  now = () => performance.now(),
  setTimer = setTimeout,
  clearTimer = clearTimeout,
  sampleCapacity = 128,
  maxCatchUpTicks = 1,
} = {}) {
  if (typeof tick !== "function") throw new TypeError("tick is required");

  let timer = null;
  let running = false;
  let tickHz = 0;
  let intervalMs = 0;
  let nextDeadlineMs = 0;
  let callbacks = 0;
  let timerWakeups = 0;
  let earlyWakeups = 0;
  let catchUpTicks = 0;
  let skippedDeadlines = 0;
  const tickCosts = [];
  const lateness = [];
  const periods = [];
  let lastStartedAt = null;

  function retain(samples, value) {
    samples.push(value);
    if (samples.length > sampleCapacity) samples.shift();
  }

  function schedule() {
    if (!running) return;
    timer = setTimer(wake, Math.max(0, nextDeadlineMs - now()));
  }

  function wake() {
    timer = null;
    if (!running) return;
    timerWakeups += 1;
    const startedAt = now();
    if (startedAt + 0.0001 < nextDeadlineMs) {
      // Node can quantize fractional delays down. Do not integrate early.
      earlyWakeups += 1;
      schedule();
      return;
    }

    let catchUpsThisWake = 0;
    while (running) {
      const tickStartedAt = now();
      const lateMs = tickStartedAt - nextDeadlineMs;
      if (lastStartedAt !== null) retain(periods, tickStartedAt - lastStartedAt);
      lastStartedAt = tickStartedAt;
      callbacks += 1;
      tick();
      const finishedAt = now();
      retain(tickCosts, finishedAt - tickStartedAt);
      retain(lateness, lateMs);

      nextDeadlineMs += intervalMs;
      if (finishedAt < nextDeadlineMs) break;
      if (catchUpsThisWake < maxCatchUpTicks) {
        catchUpsThisWake += 1;
        catchUpTicks += 1;
        continue;
      }
      const missed = Math.floor((finishedAt - nextDeadlineMs) / intervalMs) + 1;
      skippedDeadlines += missed;
      nextDeadlineMs += missed * intervalMs;
      break;
    }
    schedule();
  }

  function start(nextTickHz) {
    const parsedHz = Number(nextTickHz);
    if (!Number.isFinite(parsedHz) || parsedHz <= 0) throw new RangeError("tickHz must be positive");
    stop();
    running = true;
    tickHz = parsedHz;
    intervalMs = 1000 / parsedHz;
    nextDeadlineMs = now() + intervalMs;
    schedule();
  }

  function stop() {
    if (timer !== null) clearTimer(timer);
    timer = null;
    running = false;
  }

  function stats() {
    return {
      running,
      tickHz,
      intervalMs: Number(intervalMs.toFixed(6)),
      callbacks,
      timerWakeups,
      earlyWakeups,
      catchUpTicks,
      skippedDeadlines,
      tickCost: summarize(tickCosts),
      lateness: summarize(lateness),
      cadence: summarize(periods),
    };
  }

  return { start, stop, stats };
}

module.exports = { createAuthorityDeadlineLoop };
