#!/usr/bin/env node
"use strict";

const assert = require("assert");
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const { validateChecksums, aggregateChecksum } = require("./network/state-pair-product-metrics.cjs");

const ROOT = path.resolve(__dirname, "..");
const EVIDENCE = path.join(ROOT, "docs", "v0.4", "evidence", "state-pair-s15");
const BASELINE = path.join(ROOT, "docs", "v0.4", "evidence", "state-pair-s14", "candidate-process");
const CANDIDATE = path.join(EVIDENCE, "candidate-process");
const BASELINE_SHA = "c5259ec1cbeb3de2d0683031af7c2e7ae2f54c26d34f647906d880158d38ecdd";
const CANDIDATE_SHA = "c4afcb83fd50e9f1373402f43233f222662a70e7872b50e441fcef612dd4bff4";
const S14_TOP_LEVEL_SHA = "055de7c637163bb25e50dd36993f1e16075d2fa4abeb4be7216aafd95a6bfc4f";
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
  const buckets = [];
  const perRecipient = {};
  for (const recipient of recipients) {
    const accepted = events.filter((event) => event.recipient === recipient);
    const pairs = accepted.filter((event) => event.frameClass === "statePair");
    const other = accepted.filter((event) => event.frameClass !== "statePair");
    const scale = TARGET_HZ / (pairs.length / seconds);
    const pairBytes = pairs.reduce((sum, event) => sum + event.bytes, 0);
    const otherBytes = other.reduce((sum, event) => sum + event.bytes, 0);
    const oneSecond = Array.from({ length: Math.ceil(seconds) }, () => ({ pair: 0, other: 0 }));
    for (const event of accepted) {
      const bucket = oneSecond[Math.min(oneSecond.length - 1, Math.floor((event.timestamp - startAt) / 1000))];
      if (event.frameClass === "statePair") bucket.pair += event.bytes;
      else bucket.other += event.bytes;
    }
    buckets.push(...oneSecond.map((bucket) => bucket.pair * scale + bucket.other));
    perRecipient[recipient] = { observedPairsPerSecond: pairs.length / seconds,
      actualBytesPerSecond: (pairBytes + otherBytes) / seconds,
      normalized10HzBytesPerSecond: (pairBytes * scale + otherBytes) / seconds };
  }
  return { perRecipient,
    worstMeanBytesPerSecond: Math.max(...Object.values(perRecipient).map((row) => row.normalized10HzBytesPerSecond)),
    oneSecond: distribution(buckets) };
}

function summarize(directory, population) {
  const scenario = read(path.join(directory, `normal-${population}.json`));
  const normalized = normalizedTraffic(scenario);
  const pair = scenario.authorityState.statePair.codecPairChoice;
  const gate = { correctnessAndConvergencePass: scenario.correctness.passed,
    cadencePass: scenario.cadence.minimumReceiverAcceptedPairsPerSecond >= 9,
    authorityClockPass: scenario.performance.authority.simTickMs.p95 <= 1000 / scenario.cadence.sessionTickHz
      && scenario.performance.authority.projectionAndPublishMs.p95 <= 1000 / TARGET_HZ,
    normalModePass: scenario.authorityState.overloadState === "NORMAL",
    actualMeanPass: scenario.traffic.worstRecipientMeanDownlinkBytesPerSecond <= TARGET_BPS,
    actualP95Pass: scenario.traffic.oneSecondAllRecipientBytesPerSecond.p95 <= SENSITIVITY_BPS,
    normalizedMeanPass: normalized.worstMeanBytesPerSecond <= TARGET_BPS,
    normalizedP95Pass: normalized.oneSecond.p95 <= SENSITIVITY_BPS };
  return { population, commit: scenario.commit,
    cadence: { authorityMinimumHz: scenario.cadence.minimumAuthorityAcceptedPairsPerSecond,
      receiverMinimumHz: scenario.cadence.minimumReceiverAcceptedPairsPerSecond },
    projectionAndPublishMs: scenario.performance.authority.projectionAndPublishMs,
    authorityCpuOneCoreFraction: scenario.performance.authority.cpuUsage.oneCoreFraction,
    overloadMode: scenario.authorityState.overloadState,
    traffic: { actualWorstMeanBytesPerSecond: scenario.traffic.worstRecipientMeanDownlinkBytesPerSecond,
      actualOneSecondP95BytesPerSecond: scenario.traffic.oneSecondAllRecipientBytesPerSecond.p95,
      normalized10HzWorstMeanBytesPerSecond: normalized.worstMeanBytesPerSecond,
      normalized10HzOneSecondP95BytesPerSecond: normalized.oneSecond.p95 },
    operations: pair.operations, chosen: pair.combinationsChosen, fallbacks: pair.fallbacks,
    correctnessPassed: scenario.correctness.passed,
    queuesClear: scenario.performance.queueAndBackpressure.cumulativePressure.noHighWaterOrQueuePolicyTransition
      && scenario.performance.queueAndBackpressure.maxQueuedBytes === 0
      && scenario.performance.queueAndBackpressure.maxPendingScheduledSends === 0,
    productGate: gate };
}

function selectorAnalysis() {
  const names = ["round-a-baseline", "round-a-candidate", "round-b-candidate", "round-b-baseline"];
  const rows = Object.fromEntries(names.map((name) => [name,
    read(path.join(EVIDENCE, "selector", `${name}.json`))]));
  const transcripts = new Set(Object.values(rows).map((row) => row.transcriptSha256));
  const selections = new Set(Object.values(rows).map((row) => row.selectionTranscriptSha256));
  assert.strictEqual(transcripts.size, 1);
  assert.strictEqual(selections.size, 1);
  const baseline = [rows["round-a-baseline"], rows["round-b-baseline"]];
  const candidate = [rows["round-a-candidate"], rows["round-b-candidate"]];
  const mean = (group, pathFn) => group.reduce((sum, row) => sum + pathFn(row), 0) / group.length;
  return { orderCounterbalanced: true, iterationsPerRun: 1000,
    parityComparisons: 1000, adversarialComparisonsRetainedFromS14: 320, totalExactComparisons: 1320,
    transcriptSha256: [...transcripts][0], selectionTranscriptSha256: [...selections][0],
    baseline: { meanPublishMs: mean(baseline, (row) => row.publishMilliseconds.mean),
      meanSelectionP50Ms: mean(baseline, (row) => row.selectionMilliseconds.p50),
      operations: baseline[0].operations },
    candidate: { meanPublishMs: mean(candidate, (row) => row.publishMilliseconds.mean),
      meanSelectionP50Ms: mean(candidate, (row) => row.selectionMilliseconds.p50),
      operations: candidate[0].operations },
    comparison: { publishMeanReductionFraction: 1 - mean(candidate, (row) => row.publishMilliseconds.mean)
        / mean(baseline, (row) => row.publishMilliseconds.mean),
      selectionP50ReductionFraction: 1 - mean(candidate, (row) => row.selectionMilliseconds.p50)
        / mean(baseline, (row) => row.selectionMilliseconds.p50) } };
}

function build() {
  assert(validateChecksums(BASELINE).passed && validateChecksums(BASELINE).actualAggregateSha256 === BASELINE_SHA);
  assert(validateChecksums(CANDIDATE).passed && validateChecksums(CANDIDATE).actualAggregateSha256 === CANDIDATE_SHA);
  const s14Validation = validateChecksums(path.join(ROOT, "docs", "v0.4", "evidence", "state-pair-s14"));
  assert(s14Validation.passed && s14Validation.actualAggregateSha256 === S14_TOP_LEVEL_SHA);
  const baseline = [1, 4, 8].map((population) => summarize(BASELINE, population));
  const candidate = [1, 4, 8].map((population) => summarize(CANDIDATE, population));
  const selector = selectorAnalysis();
  const analysis = { schema: "lbh-s15-canonical-lane-reuse-analysis-v1",
    authorityBoundary: "One logical authority process for one match/group; no global gameplay writer.",
    baselineBinding: { path: path.relative(ROOT, BASELINE), compositeSha256: BASELINE_SHA,
      implementationCommit: baseline[0].commit, sealedS14Commit: "a0c950e" },
    candidateBinding: { path: path.relative(ROOT, CANDIDATE), compositeSha256: CANDIDATE_SHA,
      implementationCommit: candidate[0].commit, evidenceCommit: "94d81ec" },
    s14TopLevelBinding: { path: "docs/v0.4/evidence/state-pair-s14", compositeSha256: S14_TOP_LEVEL_SHA },
    selector, baseline, candidate,
    parity: { exactComparisons: selector.totalExactComparisons, wireTranscriptEqual: true,
      selectionTranscriptEqual: true, mismatches: 0 },
    productDecision: { admittedPopulations: candidate.filter((row) => Object.values(row.productGate).every(Boolean))
      .map((row) => row.population), rejectedPopulations: candidate.filter((row) => !Object.values(row.productGate).every(Boolean))
      .map((row) => row.population),
    statement: "Canonical lane reuse is exact and removes expanded lane reserialization, but four and eight still fail cadence, clock, overload, and normalized-mean admission. Low actual traffic receives no credit.",
    nextLane: "Prototype a bounded binary state-pair codec against the exact positional JSON oracle; retain JSON fallback and do not change authority, cadence, ACK, recovery, or admission policy." },
    limitations: ["machine-local loopback", "single 20-second candidate window per population",
      "microbenchmark timing is order-counterbalanced but machine-local", "no hosted/WAN/TLS/fleet claim",
      "no 24/48/96 extrapolation", "normalized traffic is counterfactual and cannot replace cadence admission"] };
  fs.writeFileSync(path.join(EVIDENCE, "analysis.json"), `${JSON.stringify(analysis, null, 2)}\n`, { flag: "wx" });
  const selectorFiles = fs.readdirSync(path.join(EVIDENCE, "selector")).sort().map((name) => ({ name,
    sha256: sha(path.join(EVIDENCE, "selector", name)) }));
  const manifest = { schema: "lbh-s15-canonical-lane-reuse-manifest-v1",
    baselineSha256: BASELINE_SHA, candidateSha256: CANDIDATE_SHA, s14TopLevelSha256: S14_TOP_LEVEL_SHA,
    analysisSha256: sha(path.join(EVIDENCE, "analysis.json")), selectorFiles,
    exactParityComparisons: analysis.parity.exactComparisons, productDecision: analysis.productDecision };
  fs.writeFileSync(path.join(EVIDENCE, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`, { flag: "wx" });
  const files = ["analysis.json", "manifest.json", ...selectorFiles.map((row) => `selector/${row.name}`)];
  fs.writeFileSync(path.join(EVIDENCE, "checksums.json"), `${JSON.stringify(aggregateChecksum(EVIDENCE, files), null, 2)}\n`, { flag: "wx" });
}

function validate() {
  const own = validateChecksums(EVIDENCE);
  const manifest = read(path.join(EVIDENCE, "manifest.json"));
  const analysis = read(path.join(EVIDENCE, "analysis.json"));
  const invariants = { ownChecksums: own.passed,
    baseline: validateChecksums(BASELINE).passed && validateChecksums(BASELINE).actualAggregateSha256 === BASELINE_SHA,
    candidate: validateChecksums(CANDIDATE).passed && validateChecksums(CANDIDATE).actualAggregateSha256 === CANDIDATE_SHA,
    bindings: manifest.analysisSha256 === sha(path.join(EVIDENCE, "analysis.json"))
      && manifest.s14TopLevelSha256 === S14_TOP_LEVEL_SHA,
    parity: analysis.parity.exactComparisons === 1320 && analysis.parity.mismatches === 0,
    semantics: analysis.candidate.every((row) => row.correctnessPassed && row.queuesClear),
    reuse: analysis.candidate.every((row) => row.operations.expandedLaneSerializations === 0
      && row.operations.expandedLaneSerializationReuses > 0 && row.operations.expandedSerializedLaneBytes === 0),
    decision: JSON.stringify(analysis.productDecision.admittedPopulations) === "[1]"
      && JSON.stringify(analysis.productDecision.rejectedPopulations) === "[4,8]" };
  const result = { passed: Object.values(invariants).every(Boolean), invariants,
    compositeSha256: own.actualAggregateSha256 };
  console.log(JSON.stringify(result, null, 2));
  process.exitCode = result.passed ? 0 : 1;
}

if (process.argv.includes("--build")) build();
validate();
