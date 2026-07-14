#!/usr/bin/env node
"use strict";

const assert = require("assert");
const fs = require("fs");
const path = require("path");
const { fixedWindowRates, validateChecksums } = require("./network/state-pair-product-metrics.cjs");

const ROOT = path.resolve(__dirname, "..");
const EVIDENCE = path.join(ROOT, "docs", "v0.4", "evidence", "state-pair-s20");
const EXPECTED = Object.freeze({
  "round-a/baseline": "34889e19a112a3288d35eeafa575ace90f0319d14eb27c0ccc53c13245f13594",
  "round-a/candidate": "d9b732599aa5e036bdedced3c6d14d8301cc6fa4e9015d633bf7e751bf43d6ac",
  "round-b/baseline": "a11dbbefd132173d3f45cba687aa7693a6126a491284c38ae604c24dd92b594d",
  "round-b/candidate": "8cc0f77b58048420449a8116e998a27d428240b19e8047608268b9b38e48ee2c",
});
const EVIDENCE_COMMIT = "9ff1b06b638e082d760539819d1a678a70e31c40";

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

function median(values) {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

function main() {
  const bindings = Object.fromEntries(Object.entries(EXPECTED).map(([name, sha]) => {
    const validation = validateChecksums(path.join(EVIDENCE, name));
    assert(validation.passed && validation.actualAggregateSha256 === sha);
    const run = read(`${name}/run.json`);
    assert.strictEqual(run.commit, EVIDENCE_COMMIT);
    assert.strictEqual(run.dirty, false);
    return [name, validation];
  }));
  const codec = read("codec-selection.json");
  const adversarial = read("codec-adversarial.json");
  assert.strictEqual(codec.selected, "brotli-q1");
  assert.deepStrictEqual(codec.laneClasses, ["delta+keyframe", "keyframe+keyframe"]);
  assert.strictEqual(codec.exactComparisons, 8712);
  assert.strictEqual(codec.selectedEnvelopeExactComparisons, 121);
  assert.strictEqual(codec.selectedEnvelopeSemanticComparisons, 121);
  assert.strictEqual(codec.selectedEnvelopeAckTranscriptComparisons, 121);
  assert(codec.codecs[codec.selected].authorityCompressionMilliseconds.p95 <= 0.5);
  assert(codec.codecs[codec.selected].envelopeRatio.p95 <= 0.8);
  assert.strictEqual(adversarial.manifestHash,
    "sha256:2c3cd325e00203ca79e18cf5bf6004fe54c7accacbf7901a8fb66db27167b551");
  assert.strictEqual(adversarial.exactComparisons, 512);
  assert.strictEqual(adversarial.malformedCases, 13);
  assert.strictEqual(adversarial.maxAndMaxMinusOneCases, 2);
  assert.strictEqual(adversarial.mismatches, 0);

  const rounds = ["round-a", "round-b"].map((round) => ({ round, scenarios: [1, 4, 8].map((population) => {
    const baseline = read(`${round}/baseline/normal-${population}.json`);
    const candidate = read(`${round}/candidate/normal-${population}.json`);
    const baselineCleanup = read(`${round}/baseline/cleanup-normal-${population}.json`);
    const candidateCleanup = read(`${round}/candidate/cleanup-normal-${population}.json`);
    const before = traffic(baseline);
    const after = traffic(candidate);
    assert(baseline.correctness.passed && candidate.correctness.passed);
    assert(baselineCleanup.passed && candidateCleanup.passed);
    assert.strictEqual(candidateCleanup.preStopCompressedRetainedFrames, 0);
    assert.strictEqual(candidateCleanup.preStopCompressedRetainedBytes, 0);
    const cadenceBefore = baseline.cadence.minimumReceiverAcceptedPairsPerSecond;
    const cadenceAfter = candidate.cadence.minimumReceiverAcceptedPairsPerSecond;
    const projectionP95Before = baseline.performance.authority.projectionAndPublishMs.p95;
    const projectionP95After = candidate.performance.authority.projectionAndPublishMs.p95;
    const cpuBefore = baseline.performance.authority.cpuUsage.oneCoreFraction;
    const cpuAfter = candidate.performance.authority.cpuUsage.oneCoreFraction;
    const compression = candidate.authorityState.adapter.compression;
    assert.strictEqual(compression.enabledConnections, population);
    assert(compression.compressedFrames > 0 && compression.sourceBytes > compression.encodedBytes);
    assert.strictEqual(compression.retainedFrames, 0);
    assert.strictEqual(compression.retainedBytes, 0);
    const admission = candidate.authorityState.overloadState === "NORMAL" && cadenceAfter >= 9
      && projectionP95After <= 100
      && after.worst.normalized10MeanBytesPerSecond <= 64 * 1024
      && after.worst.normalized10P95BytesPerSecond <= 80 * 1024;
    return { population, baseline: { cadenceHz: cadenceBefore,
      overloadState: baseline.authorityState.overloadState, projectionP95Ms: projectionP95Before,
      authorityOneCoreFraction: cpuBefore, traffic: before.worst },
    candidate: { cadenceHz: cadenceAfter, overloadState: candidate.authorityState.overloadState,
      projectionP95Ms: projectionP95After, authorityOneCoreFraction: cpuAfter,
      compression, traffic: after.worst },
    change: { cadenceRatio: cadenceAfter / cadenceBefore,
      projectionP95Ratio: projectionP95After / projectionP95Before,
      authorityOneCoreFractionRatio: cpuAfter / cpuBefore,
      normalizedMeanRatio: after.worst.normalized10MeanBytesPerSecond
        / before.worst.normalized10MeanBytesPerSecond,
      normalizedP95Ratio: after.worst.normalized10P95BytesPerSecond
        / before.worst.normalized10P95BytesPerSecond },
    admission };
  }) }));

  for (const round of rounds) {
    assert.deepStrictEqual(round.scenarios.filter((row) => row.admission).map((row) => row.population), [1, 4]);
    const four = round.scenarios.find((row) => row.population === 4);
    assert(four.change.authorityOneCoreFractionRatio <= 1.05);
    const eight = round.scenarios.find((row) => row.population === 8);
    assert(eight.change.cadenceRatio >= 0.95);
    assert(eight.change.projectionP95Ratio <= 1.10);
    assert(eight.change.authorityOneCoreFractionRatio <= 1.05);
  }
  const eightRows = rounds.map((round) => round.scenarios.find((row) => row.population === 8));
  const eightAggregate = {
    medianCadenceRatio: median(eightRows.map((row) => row.change.cadenceRatio)),
    medianProjectionP95Ratio: median(eightRows.map((row) => row.change.projectionP95Ratio)),
    medianAuthorityOneCoreFractionRatio:
      median(eightRows.map((row) => row.change.authorityOneCoreFractionRatio)),
  };
  assert(eightAggregate.medianCadenceRatio >= 0.95);
  assert(eightAggregate.medianProjectionP95Ratio <= 1.05);
  assert(eightAggregate.medianAuthorityOneCoreFractionRatio <= 1.05);

  const result = { schema: "lbh-s20-compression-evidence-v2", evidenceCommit: EVIDENCE_COMMIT,
    bindings, codecSelection: { selected: codec.selected,
      counterbalancedRounds: codec.counterbalancedRounds, representativeWires: codec.representativeWires,
      laneClasses: codec.laneClasses, exactComparisons: codec.exactComparisons,
      selectedCodec: codec.codecs[codec.selected], selectedEnvelopeExactComparisons: 121,
      selectedEnvelopeSemanticComparisons: 121, selectedEnvelopeAckTranscriptComparisons: 121 },
    adversarial, rounds, eightAggregate,
    productAdmission: { admittedPopulations: [1, 4], rejectedPopulations: [8],
      fourPlayerReason: "Both counterbalanced rounds are NORMAL at >=9 Hz, projection p95 <=100 ms, normalized mean <=64 KiB/s, normalized p95 <=80 KiB/s, and authority CPU ratio <=1.05.",
      eightPlayerReason: "Both rounds remain DILATED below 9 Hz. Counterbalanced median cadence, projection-tail, and authority-CPU ratios stay within the non-regression gate; this does not admit eight." },
    authorityTopology: "One dedicated logical authority owns one match/group; concurrent matches multiply these authorities horizontally.",
    limitations: ["Machine-local macOS loopback", "Raw WebSocket without TLS",
      "No permessage-deflate, context takeover, dictionary, worker offload, AOI, hosted fleet, or 24/48/96 claim"] };
  if (process.env.LBH_S20_EVIDENCE_OUTPUT) fs.writeFileSync(path.resolve(ROOT, process.env.LBH_S20_EVIDENCE_OUTPUT),
    `${JSON.stringify(result, null, 2)}\n`, { flag: "wx" });
  console.log(JSON.stringify(result, null, 2));
}

main();
