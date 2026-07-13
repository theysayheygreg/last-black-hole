#!/usr/bin/env node
"use strict";

const assert = require("assert");
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const { validateChecksums, aggregateChecksum } = require("./network/state-pair-product-metrics.cjs");

const ROOT = path.resolve(__dirname, "..");
const EVIDENCE = path.join(ROOT, "docs", "v0.4", "evidence", "state-pair-s14");
const BASELINE = path.join(ROOT, "docs", "v0.4", "evidence", "state-pair-s13", "round-b", "isolated");
const CANDIDATE = path.join(EVIDENCE, "candidate-process");
const BASELINE_SHA = "395df97d78fb9cbd8a6e07b13b56ba438b4d0be92d3a82514fe6a4be39870fd1";
const CANDIDATE_SHA = "c5259ec1cbeb3de2d0683031af7c2e7ae2f54c26d34f647906d880158d38ecdd";
const TARGET_HZ = 10;
const TARGET_BPS = 64 * 1024;
const SENSITIVITY_BPS = 80 * 1024;

function read(file) { return JSON.parse(fs.readFileSync(file, "utf8")); }
function sha(file) { return crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex"); }
function distribution(values) {
  const sorted = [...values].sort((a, b) => a - b);
  const at = (fraction) => sorted[Math.min(sorted.length - 1, Math.floor((sorted.length - 1) * fraction))];
  return { count: sorted.length, mean: sorted.reduce((sum, value) => sum + value, 0) / sorted.length,
    p50: at(0.5), p95: at(0.95), p99: at(0.99), max: sorted.at(-1) };
}

function normalizedTraffic(scenario) {
  const { scoredStartAt: startAt, scoredEndAt: endAt } = scenario.traffic.fixedWindowMetadata;
  const seconds = (endAt - startAt) / 1000;
  const events = scenario.accountingEvidence.filter((event) => event.timestamp >= startAt && event.timestamp < endAt
    && event.direction === "authority->client" && event.metric === "accepted");
  const recipients = [...new Set(events.map((event) => event.recipient))].sort();
  const normalizedBuckets = [];
  const perRecipient = {};
  for (const recipient of recipients) {
    const accepted = events.filter((event) => event.recipient === recipient);
    const pairs = accepted.filter((event) => event.frameClass === "statePair");
    const nonPairs = accepted.filter((event) => event.frameClass !== "statePair");
    const pairScale = TARGET_HZ / (pairs.length / seconds);
    const pairBytes = pairs.reduce((sum, event) => sum + event.bytes, 0);
    const nonPairBytes = nonPairs.reduce((sum, event) => sum + event.bytes, 0);
    const bucketCount = Math.ceil(seconds);
    const buckets = Array.from({ length: bucketCount }, () => ({ pair: 0, other: 0 }));
    for (const event of accepted) {
      const bucket = buckets[Math.min(bucketCount - 1, Math.floor((event.timestamp - startAt) / 1000))];
      if (event.frameClass === "statePair") bucket.pair += event.bytes;
      else bucket.other += event.bytes;
    }
    normalizedBuckets.push(...buckets.map((bucket) => bucket.pair * pairScale + bucket.other));
    perRecipient[recipient] = { observedPairsPerSecond: pairs.length / seconds, pairScale,
      observedMeanPairBytes: pairBytes / pairs.length, observedNonPairBytesPerSecond: nonPairBytes / seconds,
      actualApplicationBytesPerSecond: (pairBytes + nonPairBytes) / seconds,
      normalized10HzApplicationBytesPerSecond: (pairBytes * pairScale + nonPairBytes) / seconds };
  }
  return { method: "Hold each recipient's accepted pair-size mix constant; scale pair bytes to 10 Hz; retain non-pair bytes.",
    perRecipient, worstRecipientMeanDownlinkBytesPerSecond: Math.max(...Object.values(perRecipient)
      .map((row) => row.normalized10HzApplicationBytesPerSecond)),
    oneSecond: distribution(normalizedBuckets) };
}

function summarize(directory, population) {
  const scenario = read(path.join(directory, `normal-${population}.json`));
  const publisher = scenario.authorityState.statePair;
  const choice = publisher.codecPairChoice;
  const publications = publisher.keyframes + publisher.deltas + publisher.mixed;
  const baselineOperations = { componentSerializations: null,
    fullCandidateCompositions: choice.combinationsEvaluated, winnerSerializations: publications,
    bytesExamined: Object.values(choice.exactEncodedBytesByCombination)
      .reduce((sum, row) => sum + row.bytes, 0),
    allocationProxyBytes: null,
    allocationProxyNote: "S13 did not count expanded semantic JSON allocations, so no comparable total is claimed." };
  const normalized = normalizedTraffic(scenario);
  return { population, commit: scenario.commit,
    cadence: { configuredHz: scenario.cadence.configuredPublicationHz,
      authorityMinimumHz: scenario.cadence.minimumAuthorityAcceptedPairsPerSecond,
      receiverMinimumHz: scenario.cadence.minimumReceiverAcceptedPairsPerSecond },
    projectionAndPublishMs: scenario.performance.authority.projectionAndPublishMs,
    authorityCpuOneCoreFraction: scenario.performance.authority.cpuUsage.oneCoreFraction,
    eventLoopP95Ms: scenario.performance.authority.eventLoopDelay.p95Ms,
    overloadMode: scenario.authorityState.overloadState,
    traffic: { actualWorstMeanBytesPerSecond: scenario.traffic.worstRecipientMeanDownlinkBytesPerSecond,
      actualOneSecondP95BytesPerSecond: scenario.traffic.oneSecondAllRecipientBytesPerSecond.p95,
      normalized10HzWorstMeanBytesPerSecond: normalized.worstRecipientMeanDownlinkBytesPerSecond,
      normalized10HzOneSecondP95BytesPerSecond: normalized.oneSecond.p95 },
    correctnessPassed: scenario.correctness.passed,
    queuesClear: scenario.performance.queueAndBackpressure.cumulativePressure.noHighWaterOrQueuePolicyTransition
      && scenario.performance.queueAndBackpressure.maxQueuedBytes === 0
      && scenario.performance.queueAndBackpressure.maxPendingScheduledSends === 0,
    selection: { combinationsEvaluated: choice.combinationsEvaluated, selections: choice.selections,
      milliseconds: choice.selectionMilliseconds || choice.encodeMilliseconds,
      operations: choice.operations || baselineOperations },
    productGate: { correctnessAndConvergencePass: scenario.correctness.passed
        && scenario.correctness.authorityReceiverCountDeltaAtMostOnePerClient,
      cadencePass: scenario.cadence.minimumReceiverAcceptedPairsPerSecond >= 9,
      authorityClockPass: scenario.performance.authority.simTickMs.p95 <= (1000 / scenario.cadence.sessionTickHz)
        && scenario.performance.authority.projectionAndPublishMs.p95 <= (1000 / TARGET_HZ),
      normalModePass: scenario.authorityState.overloadState === "NORMAL",
      actualMeanPass: scenario.traffic.worstRecipientMeanDownlinkBytesPerSecond <= TARGET_BPS,
      actualP95Pass: scenario.traffic.oneSecondAllRecipientBytesPerSecond.p95 <= SENSITIVITY_BPS,
      normalizedMeanPass: normalized.worstRecipientMeanDownlinkBytesPerSecond <= TARGET_BPS,
      normalizedP95Pass: normalized.oneSecond.p95 <= SENSITIVITY_BPS } };
}

function build() {
  const baselineValidation = validateChecksums(BASELINE);
  const candidateValidation = validateChecksums(CANDIDATE);
  assert(baselineValidation.passed && baselineValidation.actualAggregateSha256 === BASELINE_SHA);
  assert(candidateValidation.passed && candidateValidation.actualAggregateSha256 === CANDIDATE_SHA);
  const selector = read(path.join(EVIDENCE, "selector-benchmark.json"));
  assert.strictEqual(selector.parity.mismatches, 0);
  const baseline = [1, 4, 8].map((population) => summarize(BASELINE, population));
  const candidate = [1, 4, 8].map((population) => summarize(CANDIDATE, population));
  const analysis = { schema: "lbh-s14-single-serialization-analysis-v1",
    authorityBoundary: "One logical authority process for one match/group; no global gameplay writer.",
    baselineBinding: { path: path.relative(ROOT, BASELINE), compositeSha256: BASELINE_SHA,
      implementationCommit: baseline[0].commit, sealedS13Commit: "54d33f3" },
    candidateBinding: { path: path.relative(ROOT, CANDIDATE), compositeSha256: CANDIDATE_SHA,
      implementationCommit: candidate[0].commit },
    selectorBenchmark: selector, parity: { adversarialCandidateWires: selector.adversarialParity.candidateWires,
      benchmarkWinnerWires: selector.parity.winnerCount,
      totalExactComparisons: selector.adversarialParity.candidateWires + selector.parity.winnerCount,
      mismatches: selector.adversarialParity.mismatches + selector.parity.mismatches }, baseline, candidate,
    productDecision: { admittedPopulations: candidate.filter((row) => Object.values(row.productGate).every(Boolean))
      .map((row) => row.population), rejectedPopulations: candidate.filter((row) => !Object.values(row.productGate).every(Boolean))
      .map((row) => row.population),
    statement: "One player passes. Four and eight remain cadence/overload failures; observed low traffic is not credited as a saving.",
    nextLane: "Reuse the already exact lane payload byte counts produced by delta/keyframe construction when enforcing expanded-pair limits, eliminating S14's second canonical serialization of those four lane payloads without changing candidate or wire bytes." },
    limitations: ["machine-local loopback", "20-second fixed windows", "no hosted/WAN/TLS/fleet claim",
      "no 24/48/96 extrapolation", "normalized traffic is counterfactual and cannot replace cadence admission"] };
  fs.writeFileSync(path.join(EVIDENCE, "analysis.json"), `${JSON.stringify(analysis, null, 2)}\n`, { flag: "wx" });
  const manifest = { schema: "lbh-s14-single-serialization-manifest-v1", baselineSha256: BASELINE_SHA,
    candidateSha256: CANDIDATE_SHA, selectorBenchmarkSha256: sha(path.join(EVIDENCE, "selector-benchmark.json")),
    analysisSha256: sha(path.join(EVIDENCE, "analysis.json")), exactParityComparisons: analysis.parity.totalExactComparisons,
    productDecision: analysis.productDecision };
  fs.writeFileSync(path.join(EVIDENCE, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`, { flag: "wx" });
  const files = ["analysis.json", "manifest.json", "selector-benchmark.json"];
  fs.writeFileSync(path.join(EVIDENCE, "checksums.json"), `${JSON.stringify(aggregateChecksum(EVIDENCE, files), null, 2)}\n`, { flag: "wx" });
}

function validate() {
  const baseline = validateChecksums(BASELINE);
  const candidate = validateChecksums(CANDIDATE);
  const own = validateChecksums(EVIDENCE);
  const manifest = read(path.join(EVIDENCE, "manifest.json"));
  const analysis = read(path.join(EVIDENCE, "analysis.json"));
  const invariants = { baseline: baseline.passed && baseline.actualAggregateSha256 === BASELINE_SHA,
    candidate: candidate.passed && candidate.actualAggregateSha256 === CANDIDATE_SHA,
    ownChecksums: own.passed,
    bindings: manifest.baselineSha256 === BASELINE_SHA && manifest.candidateSha256 === CANDIDATE_SHA
      && manifest.analysisSha256 === sha(path.join(EVIDENCE, "analysis.json"))
      && manifest.selectorBenchmarkSha256 === sha(path.join(EVIDENCE, "selector-benchmark.json")),
    parity: analysis.parity.mismatches === 0 && analysis.parity.totalExactComparisons === 1320
      && analysis.selectorBenchmark.adversarialParity.candidateWires === 320,
    semanticRows: analysis.candidate.every((row) => row.correctnessPassed && row.queuesClear
      && row.selection.operations.fullCandidateCompositions === row.selection.operations.winnerSerializations),
    decision: JSON.stringify(analysis.productDecision.admittedPopulations) === "[1]"
      && JSON.stringify(analysis.productDecision.rejectedPopulations) === "[4,8]" };
  const result = { passed: Object.values(invariants).every(Boolean), invariants,
    compositeSha256: own.actualAggregateSha256 };
  console.log(JSON.stringify(result, null, 2));
  process.exitCode = result.passed ? 0 : 1;
}

if (process.argv.includes("--build")) build();
validate();
