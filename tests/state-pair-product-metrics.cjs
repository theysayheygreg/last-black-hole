#!/usr/bin/env node
"use strict";

const { TestRunner, assert } = require("./helpers.cjs");
const { distribution, fixedWindowRates } = require("./network/state-pair-product-metrics.cjs");

async function run() {
  const runner = new TestRunner("StatePairProductMetrics");
  await runner.run("nearest-rank distributions retain p99 and worst negative evidence", () => {
    const stats = distribution([1, 2, 3, 4, 100]);
    assert(stats.p50 === 3 && stats.p95 === 100 && stats.p99 === 100 && stats.max === 100,
      `Unexpected distribution ${JSON.stringify(stats)}`);
  });
  await runner.run("fixed windows preserve recipient and aggregate bursts", () => {
    const events = [
      { timestamp: 100, recipient: "r1", direction: "authority->client", metric: "accepted", bytes: 100, frames: 1 },
      { timestamp: 1100, recipient: "r1", direction: "authority->client", metric: "accepted", bytes: 300, frames: 1 },
      { timestamp: 1100, recipient: "r2", direction: "authority->client", metric: "accepted", bytes: 500, frames: 1 },
    ];
    const result = fixedWindowRates(events, { startAt: 0, endAt: 2000, windowMs: 1000,
      recipients: ["r1", "r2"] });
    assert(result.recipientBytesPerSecond.r1.p50 === 100 && result.recipientBytesPerSecond.r1.max === 300,
      "Recipient windows must not average away the burst");
    assert(result.aggregateBytesPerSecond.max === 800, "Aggregate burst must include simultaneous recipients");
  });
  process.exit(runner.summary() ? 0 : 1);
}

run().catch((error) => { console.error(error.stack || error.message); process.exit(1); });
