#!/usr/bin/env node
"use strict";

const assert = require("assert");
const fs = require("fs");
const path = require("path");
const { fixedWindowRates, validateChecksums } = require("./network/state-pair-product-metrics.cjs");

const ROOT = path.resolve(__dirname, "..");
const EVIDENCE = path.join(ROOT, "docs", "v0.4", "evidence", "state-pair-s20");
const EXPECTED = Object.freeze({
  baseline: "892fdc6d043b11eba03b4d745c48b40a966570e180b5d293c74f8009d3f4c57e",
  candidate: "b374926e4f769bb781ff42dd7df476bb64c15555cacbc45d3f0bfdf01fdee63a",
});

function read(relative) { return JSON.parse(fs.readFileSync(path.join(EVIDENCE, relative), "utf8")); }

function traffic(scenario) {
  const mapping = scenario.cadence.accountingRecipientMapping.byClient;
  const recipients = Object.values(mapping).map((row) => row.recipient);
  const windows = fixedWindowRates(scenario.accountingEvidence, { startAt: scenario.window.startAt,
    endAt: scenario.window.endAt, windowMs: 1000, recipients });
  const rows = Object.entries(mapping).map(([label, row]) => {
    const hz = scenario.cadence.receiverAcceptedPairsPerSecondByClient[label];
    const mean = scenario.traffic.perRecipientMeanDownlinkBytesPerSecond[row.recipient];
    const p95 = windows.recipientBytesPerSecond[row.recipient].p95;
    return { label, recipient: row.recipient, hz, actualMeanBytesPerSecond: mean,
      actualP95BytesPerSecond: p95, normalized10MeanBytesPerSecond: mean * 10 / hz,
      normalized10P95BytesPerSecond: p95 * 10 / hz };
  });
  const maximum = (key) => Math.max(...rows.map((row) => row[key]));
  return { rows, worst: { actualMeanBytesPerSecond: maximum("actualMeanBytesPerSecond"),
    actualP95BytesPerSecond: maximum("actualP95BytesPerSecond"),
    normalized10MeanBytesPerSecond: maximum("normalized10MeanBytesPerSecond"),
    normalized10P95BytesPerSecond: maximum("normalized10P95BytesPerSecond") } };
}

function main() {
  const bindings = Object.fromEntries(Object.entries(EXPECTED).map(([name, sha]) => {
    const validation = validateChecksums(path.join(EVIDENCE, name));
    assert(validation.passed && validation.actualAggregateSha256 === sha);
    return [name, validation];
  }));
  const codec = read("codec-selection.json");
  const adversarial = read("codec-adversarial.json");
  assert.strictEqual(codec.selected, "brotli-q1");
  assert.strictEqual(codec.exactComparisons, 8640);
  assert.strictEqual(codec.selectedEnvelopeExactComparisons, 120);
  assert.strictEqual(codec.selectedEnvelopeSemanticComparisons, 120);
  assert.strictEqual(codec.selectedEnvelopeAckTranscriptComparisons, 120);
  assert.strictEqual(adversarial.exactComparisons, 512);
  assert.strictEqual(adversarial.malformedCases, 13);
  assert.strictEqual(adversarial.mismatches, 0);
  const scenarios = [1, 4, 8].map((population) => {
    const baseline = read(`baseline/normal-${population}.json`);
    const candidate = read(`candidate/normal-${population}.json`);
    const before = traffic(baseline);
    const after = traffic(candidate);
    assert(baseline.correctness.passed && candidate.correctness.passed);
    assert(read(`baseline/cleanup-normal-${population}.json`).passed);
    assert(read(`candidate/cleanup-normal-${population}.json`).passed);
    const cadenceBefore = baseline.cadence.minimumReceiverAcceptedPairsPerSecond;
    const cadenceAfter = candidate.cadence.minimumReceiverAcceptedPairsPerSecond;
    const projectionP95Before = baseline.performance.authority.projectionAndPublishMs.p95;
    const projectionP95After = candidate.performance.authority.projectionAndPublishMs.p95;
    const admission = candidate.authorityState.overloadState === "NORMAL" && cadenceAfter >= 9
      && projectionP95After <= 100
      && after.worst.normalized10MeanBytesPerSecond <= 64 * 1024
      && after.worst.normalized10P95BytesPerSecond <= 80 * 1024;
    return { population, baseline: { cadenceHz: cadenceBefore, overloadState: baseline.authorityState.overloadState,
      projectionP95Ms: projectionP95Before, authorityOneCoreFraction: baseline.performance.authority.cpuUsage.oneCoreFraction,
      traffic: before.worst }, candidate: { cadenceHz: cadenceAfter,
      overloadState: candidate.authorityState.overloadState, projectionP95Ms: projectionP95After,
      authorityOneCoreFraction: candidate.performance.authority.cpuUsage.oneCoreFraction,
      compression: candidate.authorityState.adapter.compression, traffic: after.worst },
    change: { cadenceRatio: cadenceAfter / cadenceBefore,
      projectionP95Ratio: projectionP95After / projectionP95Before,
      normalizedMeanRatio: after.worst.normalized10MeanBytesPerSecond / before.worst.normalized10MeanBytesPerSecond,
      normalizedP95Ratio: after.worst.normalized10P95BytesPerSecond / before.worst.normalized10P95BytesPerSecond },
    admission };
  });
  assert.deepStrictEqual(scenarios.filter((row) => row.admission).map((row) => row.population), [1, 4]);
  const eight = scenarios.find((row) => row.population === 8);
  assert(eight.change.cadenceRatio >= 0.95 && eight.change.projectionP95Ratio <= 1.05);
  const result = { schema: "lbh-s20-compression-evidence-v1", bindings, codecSelection: {
    selected: codec.selected, counterbalancedRounds: codec.counterbalancedRounds,
    representativeWires: codec.representativeWires, exactComparisons: codec.exactComparisons,
    selectedCodec: codec.codecs[codec.selected], selectedEnvelopeExactComparisons: 120,
    selectedEnvelopeSemanticComparisons: 120, selectedEnvelopeAckTranscriptComparisons: 120 },
  adversarial, scenarios, productAdmission: { admittedPopulations: [1, 4], rejectedPopulations: [8],
    fourPlayerReason: "NORMAL at >=9 Hz; projection p95 <=100 ms; normalized mean <=64 KiB/s; normalized p95 <=80 KiB/s.",
    eightPlayerReason: "Compression preserves the existing clock within 5%, but the one-match authority remains DILATED below 9 Hz." },
  authorityTopology: "One dedicated logical authority owns one match/group; concurrent matches multiply these authorities horizontally.",
  limitations: ["Machine-local macOS loopback", "Raw WebSocket without TLS",
    "No permessage-deflate, context takeover, dictionary, worker offload, AOI, hosted fleet, or 24/48/96 claim"] };
  if (process.env.LBH_S20_EVIDENCE_OUTPUT) fs.writeFileSync(path.resolve(ROOT, process.env.LBH_S20_EVIDENCE_OUTPUT),
    `${JSON.stringify(result, null, 2)}\n`, { flag: "wx" });
  console.log(JSON.stringify(result, null, 2));
}

main();
