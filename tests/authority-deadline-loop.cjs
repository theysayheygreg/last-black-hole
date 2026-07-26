const assert = require("assert");
const { TestRunner } = require("./helpers.cjs");
const { createAuthorityDeadlineLoop } = require("../scripts/sim/authority-deadline-loop.cjs");

function createFakeClock() {
  let time = 0;
  let nextId = 1;
  const timers = new Map();
  return {
    now: () => time,
    setTimer(callback, delay) {
      const id = nextId++;
      timers.set(id, { at: time + delay, callback });
      return id;
    },
    clearTimer(id) {
      timers.delete(id);
    },
    advanceTo(nextTime) {
      time = nextTime;
      const due = [...timers.entries()]
        .filter(([, timer]) => timer.at <= time)
        .sort(([, left], [, right]) => left.at - right.at);
      for (const [id, timer] of due) {
        timers.delete(id);
        timer.callback();
      }
    },
    pending() {
      return [...timers.values()].map((timer) => timer.at).sort((left, right) => left - right);
    },
  };
}

async function run() {
  const runner = new TestRunner("AuthorityDeadlineLoop");

  await runner.run("uses exact 15Hz deadlines instead of rounded intervals", () => {
    const clock = createFakeClock();
    const starts = [];
    const loop = createAuthorityDeadlineLoop({
      now: clock.now,
      setTimer: clock.setTimer,
      clearTimer: clock.clearTimer,
      tick: () => starts.push(clock.now()),
    });
    loop.start(15);
    for (let frame = 1; frame <= 15; frame += 1) clock.advanceTo(frame * (1000 / 15) + 0.01);
    assert.strictEqual(starts.length, 15, "Expected one authority step per 15Hz deadline");
    assert(Math.abs(starts.at(-1) - 1000) < 0.011,
      "Fifteen fixed-dt steps must land at one wall second without accumulated rounding");
    assert.strictEqual(loop.diagnostics().intervalMs, 66.666667, "The loop must retain the canonical fractional interval");
  });

  await runner.run("re-phases after ordinary timer drift without changing fixed dt", () => {
    const clock = createFakeClock();
    const starts = [];
    const loop = createAuthorityDeadlineLoop({
      now: clock.now,
      setTimer: clock.setTimer,
      clearTimer: clock.clearTimer,
      tick: () => starts.push(clock.now()),
    });
    loop.start(15);
    clock.advanceTo(72);
    assert.strictEqual(starts.length, 1, "Expected the delayed deadline to run once");
    assert(Math.abs(clock.pending()[0] - (2000 / 15)) < 0.000001,
      "The next deadline must stay on the original monotonic phase");
    clock.advanceTo(2000 / 15);
    assert.strictEqual(starts.length, 2, "Expected the next fixed-dt step at its recovered deadline");
  });

  await runner.run("bounds catch-up and drops stale deadlines after a long stall", () => {
    const clock = createFakeClock();
    let ticks = 0;
    const loop = createAuthorityDeadlineLoop({
      now: clock.now,
      setTimer: clock.setTimer,
      clearTimer: clock.clearTimer,
      tick: () => { ticks += 1; },
    });
    loop.start(15);
    clock.advanceTo(300);
    assert.strictEqual(ticks, 2, "A late callback may recover at most one fixed-dt step");
    assert.strictEqual(loop.diagnostics().catchUpTicks, 1, "Expected one explicit bounded catch-up step");
    assert.strictEqual(loop.diagnostics().skippedDeadlines, 2, "Expected stale-deadline accounting beyond the catch-up bound");
    assert(Math.abs(clock.pending()[0] - 333.33333333333337) < 0.000001,
      "The loop must resume at the next future deadline");
  });

  await runner.run("stop and restart discard stale timer callbacks", () => {
    const clock = createFakeClock();
    let ticks = 0;
    const loop = createAuthorityDeadlineLoop({
      now: clock.now,
      setTimer: clock.setTimer,
      clearTimer: clock.clearTimer,
      tick: () => { ticks += 1; },
    });
    loop.start(15);
    loop.stop();
    clock.advanceTo(200);
    assert.strictEqual(ticks, 0, "Stopped loop must not run a cancelled deadline");
    loop.start(2);
    clock.advanceTo(700);
    assert.strictEqual(ticks, 1, "Restarted loop must use its new cadence exactly once");
  });

  process.exit(runner.summary() ? 0 : 1);
}

run().catch((error) => {
  console.error(error.stack || error.message);
  process.exit(1);
});
