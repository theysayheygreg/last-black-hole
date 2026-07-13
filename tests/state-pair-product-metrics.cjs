#!/usr/bin/env node
"use strict";

const { TestRunner, assert } = require("./helpers.cjs");
const { distribution, fixedWindowRates, fixedWindowMeanAcceptedRates,
  mapClientsToAccountingRecipients } = require("./network/state-pair-product-metrics.cjs");

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
  await runner.run("fixed windows exclude and label a partial tail bucket", () => {
    const result = fixedWindowRates([
      { timestamp: 100, recipient: "r1", direction: "authority->client", metric: "accepted", bytes: 100 },
      { timestamp: 2200, recipient: "r1", direction: "authority->client", metric: "accepted", bytes: 900 },
    ], { startAt: 0, endAt: 2500, windowMs: 1000, recipients: ["r1"] });
    assert(result.recipientBytesPerSecond.r1.max === 100,
      "Partial-tail traffic must not be divided by a full-window denominator");
    assert(result.scoredEndAt === 2000 && result.droppedPartialTailMs === 500,
      "Fixed-window metadata must expose the excluded partial tail");
  });
  await runner.run("fixed means retain intended silent recipients and full-duration denominator", () => {
    const events = [
      { timestamp: 1500, recipient: "short", direction: "authority->client", metric: "accepted", bytes: 500 },
    ];
    const means = fixedWindowMeanAcceptedRates(events,
      { startAt: 1000, endAt: 3000, recipients: ["short", "silent"] });
    assert(means.short === 250, "Accepted bytes must divide by the full fixed window");
    assert(means.silent === 0, "An intended silent recipient must remain an explicit zero");
  });
  await runner.run("recipient mapping preserves measured zero cadence from warmup identity proof", () => {
    const clients = [
      { label: "seat-a", acceptedPairEvents: [
        { at: 50, frameId: 1, bytes: 101 },
        { at: 150, frameId: 2, bytes: 102 },
      ] },
      { label: "seat-b", acceptedPairEvents: [{ at: 50, frameId: 1, bytes: 201 }] },
    ];
    const events = [
      { timestamp: 50, recipientOrdinal: 7, projectionBeat: 1, bytes: 201,
        direction: "authority->client", frameClass: "statePair", metric: "accepted" },
      { timestamp: 50, recipientOrdinal: 3, projectionBeat: 1, bytes: 101,
        direction: "authority->client", frameClass: "statePair", metric: "accepted" },
      { timestamp: 150, recipientOrdinal: 3, projectionBeat: 2, bytes: 102,
        direction: "authority->client", frameClass: "statePair", metric: "accepted" },
    ];
    const mapping = mapClientsToAccountingRecipients(clients, events, 100, 200);
    assert(mapping.byClient["seat-a"].recipientOrdinal === 3
      && mapping.byClient["seat-a"].measurementTupleMatches === 1,
    "Measured client must retain its exact tuple proof");
    assert(mapping.byClient["seat-b"].recipientOrdinal === 7
      && mapping.byClient["seat-b"].measurementTupleMatches === 0,
    "Warmup identity must map the client without inventing measured cadence");
  });
  process.exit(runner.summary() ? 0 : 1);
}

run().catch((error) => { console.error(error.stack || error.message); process.exit(1); });
