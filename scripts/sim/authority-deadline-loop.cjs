"use strict";

const { performance } = require("perf_hooks");

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
} = {}) {
  if (typeof tick !== "function") throw new TypeError("tick is required");

  let timer = null;
  let running = false;
  let tickHz = 0;
  let intervalMs = 0;
  let nextDeadlineMs = 0;
  let catchUpTicks = 0;
  let skippedDeadlines = 0;

  function schedule() {
    if (!running) return;
    timer = setTimer(wake, Math.max(0, nextDeadlineMs - now()));
  }

  function wake() {
    timer = null;
    if (!running) return;
    const startedAt = now();
    if (startedAt + 0.0001 < nextDeadlineMs) {
      // Node can quantize fractional delays down. Do not integrate early.
      schedule();
      return;
    }

    tick();
    let finishedAt = now();
    nextDeadlineMs += intervalMs;
    if (running && finishedAt >= nextDeadlineMs) {
      // One fixed-dt recovery step is enough to absorb ordinary timer jitter.
      // Further stale deadlines are dropped below to avoid a physics burst.
      catchUpTicks += 1;
      tick();
      finishedAt = now();
      nextDeadlineMs += intervalMs;
    }
    if (running && finishedAt >= nextDeadlineMs) {
      const missed = Math.floor((finishedAt - nextDeadlineMs) / intervalMs) + 1;
      skippedDeadlines += missed;
      nextDeadlineMs += missed * intervalMs;
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

  function diagnostics() {
    return {
      tickHz,
      intervalMs: Number(intervalMs.toFixed(6)),
      catchUpTicks,
      skippedDeadlines,
    };
  }

  return { start, stop, diagnostics };
}

module.exports = { createAuthorityDeadlineLoop };
