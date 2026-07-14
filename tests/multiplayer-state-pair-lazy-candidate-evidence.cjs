#!/usr/bin/env node
"use strict";

const assert = require("assert");
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");
const { validateChecksums, aggregateChecksum } = require("./network/state-pair-product-metrics.cjs");

const ROOT = path.resolve(__dirname, "..");
const EVIDENCE = path.join(ROOT, "docs", "v0.4", "evidence", "state-pair-s17");
const CANDIDATE = path.join(EVIDENCE, "candidate-process");
const BASELINE = path.join(ROOT, "docs", "v0.4", "evidence", "state-pair-s15", "candidate-process-r2");
const BENCHMARK = path.join(EVIDENCE, "lazy-benchmark.json");
const PROFILE_REJECTED = path.join(EVIDENCE, "rejected-profile-timeout");
const CANDIDATE_SHA = "9001726f56fbfd895d32f5d3111dd50b16cb80bd1a0903772bffbdc78307d149";
const BASELINE_SHA = "c2df9114ce2cfd7ab29ff613b214498b214cebd7df71d1e0c74750b974f6e266";
const TARGET_HZ = 10;
const MIN_HZ = 9;
const TARGET_BPS = 64 * 1024;
const P95_BPS = 80 * 1024;

function shaFile(file) {
  return crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
}

function distribution(values) {
  const sorted = [...values].sort((a, b) => a - b);
  const at = (fraction) => sorted[Math.min(sorted.length - 1, Math.floor((sorted.length - 1) * fraction))];
  return { count: sorted.length, mean: sorted.reduce((sum, value) => sum + value, 0) / sorted.length,
    p50: at(0.5), p95: at(0.95), p99: at(0.99), max: sorted.at(-1) };
}

function normalizedTraffic(scenario) {
  const { startAt, endAt } = scenario.window;
  const seconds = (endAt - startAt) / 1000;
  const recipients = Object.values(scenario.cadence.accountingRecipientMapping.byClient)
    .map((row) => row.recipient).sort();
  const perRecipient = {};
  const buckets = [];
  for (const recipient of recipients) {
    const accepted = scenario.accountingEvidence.filter((event) => event.timestamp >= startAt
      && event.timestamp < endAt && event.recipient === recipient
      && event.direction === "authority->client" && event.metric === "accepted");
    const pairs = accepted.filter((event) => event.frameClass === "statePair");
    const other = accepted.filter((event) => event.frameClass !== "statePair");
    assert(pairs.length > 0, "target-cadence normalization cannot credit a zero-cadence recipient");
    const pairScale = TARGET_HZ / (pairs.length / seconds);
    const pairBytes = pairs.reduce((sum, event) => sum + event.bytes, 0);
    const otherBytes = other.reduce((sum, event) => sum + event.bytes, 0);
    const oneSecond = Array.from({ length: Math.ceil(seconds) }, () => ({ pair: 0, other: 0 }));
    for (const event of accepted) {
      const index = Math.min(oneSecond.length - 1, Math.floor((event.timestamp - startAt) / 1000));
      oneSecond[index][event.frameClass === "statePair" ? "pair" : "other"] += event.bytes;
    }
    buckets.push(...oneSecond.map((entry) => entry.pair * pairScale + entry.other));
    perRecipient[recipient] = { observedHz: pairs.length / seconds, pairScale,
      observedMeanPairBytes: pairBytes / pairs.length,
      observedOtherBytesPerSecond: otherBytes / seconds,
      normalized10HzBytesPerSecond: (pairBytes * pairScale + otherBytes) / seconds };
  }
  const windows = distribution(buckets);
  return { method: "Scale each recipient's measured accepted state-pair bytes to 10 Hz; leave non-pair bytes observed.",
    noCadenceCredit: true, perRecipient,
    worstMeanBytesPerSecond: Math.max(...Object.values(perRecipient).map((row) => row.normalized10HzBytesPerSecond)),
    oneSecondP95BytesPerSecond: windows.p95, oneSecondP99BytesPerSecond: windows.p99 };
}

function scenarioSummary(population) {
  const scenario = JSON.parse(fs.readFileSync(path.join(CANDIDATE, `normal-${population}.json`)));
  const baseline = JSON.parse(fs.readFileSync(path.join(BASELINE, `normal-${population}.json`)));
  const normalized = normalizedTraffic(scenario);
  const ledgerMax = Math.max(...scenario.clients.map((client) => client.receiver.ledger.highWaterBytes));
  const ledgerCurrent = scenario.clients.reduce((sum, client) => sum + client.receiver.ledger.bytes, 0);
  const gate = { correctness: scenario.correctness.passed,
    cadence: scenario.cadence.minimumReceiverAcceptedPairsPerSecond >= MIN_HZ,
    authorityClock: scenario.performance.authority.projectionAndPublishMs.p95 <= 100,
    overloadNormal: scenario.authorityState.overloadState === "NORMAL",
    normalizedMean: normalized.worstMeanBytesPerSecond <= TARGET_BPS,
    normalizedP95: normalized.oneSecondP95BytesPerSecond <= P95_BPS,
    queuesClear: scenario.performance.queueAndBackpressure.cumulativePressure.noHighWaterOrQueuePolicyTransition };
  return { population,
    baseline: { receiverHz: baseline.cadence.minimumReceiverAcceptedPairsPerSecond,
      projectionAndPublishMs: baseline.performance.authority.projectionAndPublishMs,
      authorityOneCoreFraction: baseline.performance.authority.cpuUsage.oneCoreFraction,
      actualWorstMeanBytesPerSecond: baseline.traffic.worstRecipientMeanDownlinkBytesPerSecond },
    candidate: { receiverHz: scenario.cadence.minimumReceiverAcceptedPairsPerSecond,
      authorityHz: scenario.cadence.minimumAuthorityAcceptedPairsPerSecond,
      projectionAndPublishMs: scenario.performance.authority.projectionAndPublishMs,
      authorityOneCoreFraction: scenario.performance.authority.cpuUsage.oneCoreFraction,
      actualWorstMeanBytesPerSecond: scenario.traffic.worstRecipientMeanDownlinkBytesPerSecond,
      actualOneSecondP95BytesPerSecond: scenario.traffic.oneSecondAllRecipientBytesPerSecond.p95,
      overloadMode: scenario.authorityState.overloadState,
      normalized10Hz: normalized,
      operationCounters: scenario.authorityState.statePair.codecPairChoice.operations,
      ledger: { maxPerClientBytes: ledgerMax, currentAggregateBytesAtMeasurementEnd: ledgerCurrent },
      correctness: scenario.correctness, gate,
      productAdmissionPassed: Object.values(gate).every(Boolean) },
    comparison: { cadenceDeltaHz: scenario.cadence.minimumReceiverAcceptedPairsPerSecond
        - baseline.cadence.minimumReceiverAcceptedPairsPerSecond,
      projectionP50ReductionFraction: 1 - scenario.performance.authority.projectionAndPublishMs.p50
        / baseline.performance.authority.projectionAndPublishMs.p50,
      projectionP95ReductionFraction: 1 - scenario.performance.authority.projectionAndPublishMs.p95
        / baseline.performance.authority.projectionAndPublishMs.p95,
      authorityCpuReductionFraction: 1 - scenario.performance.authority.cpuUsage.oneCoreFraction
        / baseline.performance.authority.cpuUsage.oneCoreFraction } };
}

function stageRows(population) {
  const scenario = JSON.parse(fs.readFileSync(path.join(PROFILE_REJECTED, `normal-${population}.json`)));
  return Object.entries(scenario.performance.authorityStageProfile.stages).map(([stage, row]) => ({ stage,
    calls: row.aggregate.calls, totalMs: row.aggregate.totalMs, meanMs: row.aggregate.meanMs,
    p95Ms: row.aggregate.p95Ms, serializedAllocationProxyBytes: row.aggregate.serializedAllocationProxyBytes }))
    .sort((left, right) => right.totalMs - left.totalMs);
}

function build() {
  const candidateChecks = validateChecksums(CANDIDATE);
  const baselineChecks = validateChecksums(BASELINE);
  assert(candidateChecks.passed && candidateChecks.actualAggregateSha256 === CANDIDATE_SHA);
  assert(baselineChecks.passed && baselineChecks.actualAggregateSha256 === BASELINE_SHA);
  const externalValidation = JSON.parse(execFileSync(process.execPath,
    [path.join(ROOT, "tests", "multiplayer-state-pair-clock-attribution.cjs"), "--validate-artifact", CANDIDATE],
    { cwd: ROOT, encoding: "utf8" }));
  assert(externalValidation.passed);
  const benchmark = JSON.parse(fs.readFileSync(BENCHMARK));
  assert(benchmark.attribution.provenMaterial && benchmark.parity.mismatches === 0);
  const scenarios = [1, 4, 8].map(scenarioSummary);
  const analysis = { schema: "lbh-s17-lazy-candidate-analysis-v1",
    authorityBoundary: "One dedicated logical authority process is the sole writer for one match/group; concurrent matches multiply this boundary horizontally.",
    releaseDefault: "S15 positional JSON with S17 lazy selection; S16 binary remains opt-in and is excluded from admission.",
    baselineBinding: { path: path.relative(ROOT, BASELINE), compositeSha256: BASELINE_SHA,
      sealedDecisionCommit: "b52b0bfcbfcbaf3322a161d4e14334f67fdbf7af" },
    candidateBinding: { path: path.relative(ROOT, CANDIDATE), compositeSha256: CANDIDATE_SHA,
      implementationCommit: "effe42686e124cc2c90ae5b88852474057e20fd5" },
    benchmarkBinding: { path: path.relative(ROOT, BENCHMARK), sha256: shaFile(BENCHMARK),
      exactWireComparisons: benchmark.parity.exactWireComparisons,
      exactSelectionTranscriptComparisons: benchmark.parity.exactSelectionTranscriptComparisons,
      decodedSemanticComparisons: benchmark.parity.decodedSemanticComparisons,
      mismatches: benchmark.parity.mismatches },
    benchmarkSummary: benchmark.summaries,
    scenarios,
    profilerAttribution: {
      status: "rejected-for-product-evidence",
      reason: JSON.parse(fs.readFileSync(path.join(PROFILE_REJECTED, "failure.json"))).message,
      validUse: "The completed 1/4-player rows are focused attribution only; profiler overhead contaminates product cadence and the 8-player profile timed out.",
      rows: { 1: stageRows(1), 4: stageRows(4) },
      nextBottleneck: "Pair choice remains the largest completed synchronous stage, followed by public-core construction, public delta construction, and public projection construction. The next bounded lane should prove trusted same-operation lane validation/size proofs without another wire codec or cadence policy change." },
    decision: { keep: true, admittedPopulations: scenarios.filter((row) => row.candidate.productAdmissionPassed).map((row) => row.population),
      rejectedPopulations: scenarios.filter((row) => !row.candidate.productAdmissionPassed).map((row) => row.population),
      statement: "Lazy candidate selection is material and byte-identical, but it is not sufficient product admission: 4/8 remain dilated and below 9 Hz. Low actual traffic at collapsed cadence receives no credit.",
      nextLane: "Profile and remove remaining repeated trusted lane semantic validation and pair-choice size-proof work, preserving S15 positional bytes and S17 one-frame materialization." },
    limitations: ["Machine-local loopback", "One 20-second profiler-off candidate window per population",
      "S15 baseline and S17 candidate were not executed as a same-minute paired process run",
      "Focused stage profiler timed out at 8 players and is not product evidence",
      "No WAN, TLS, hosted fleet, 24/48/96, compression, or cadence-policy claim"] };
  return analysis;
}

function main() {
  const analysis = build();
  if (process.argv.includes("--write")) {
    fs.writeFileSync(path.join(EVIDENCE, "analysis.json"), `${JSON.stringify(analysis, null, 2)}\n`, { flag: "wx" });
    const manifest = { schema: "lbh-s17-lazy-candidate-manifest-v1",
      analysisSha256: shaFile(path.join(EVIDENCE, "analysis.json")), benchmarkSha256: shaFile(BENCHMARK),
      candidateCompositeSha256: CANDIDATE_SHA, baselineCompositeSha256: BASELINE_SHA,
      implementationSources: Object.fromEntries(["authority-delta-publisher.cjs", "multiplayer-wire-protocol.cjs",
        "state-pair-positional-codec.cjs"].map((file) => [file, shaFile(path.join(ROOT, "scripts", file))])),
      testSources: Object.fromEntries(["state-pair-positional-codec.cjs",
        "multiplayer-state-pair-canonical-reuse-adversarial.cjs",
        "multiplayer-state-pair-lazy-candidate-benchmark.cjs",
        "multiplayer-state-pair-lazy-candidate-evidence.cjs"].map((file) => [file, shaFile(path.join(ROOT, "tests", file))])) };
    fs.writeFileSync(path.join(EVIDENCE, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`, { flag: "wx" });
    const files = ["analysis.json", "lazy-benchmark.json", "manifest.json"];
    fs.writeFileSync(path.join(EVIDENCE, "checksums.json"),
      `${JSON.stringify(aggregateChecksum(EVIDENCE, files), null, 2)}\n`, { flag: "wx" });
    console.log(JSON.stringify({ written: true, decision: analysis.decision }, null, 2));
    return;
  }
  const own = validateChecksums(EVIDENCE);
  const storedAnalysis = JSON.parse(fs.readFileSync(path.join(EVIDENCE, "analysis.json")));
  const manifest = JSON.parse(fs.readFileSync(path.join(EVIDENCE, "manifest.json")));
  const implementationSources = Object.fromEntries(["authority-delta-publisher.cjs",
    "multiplayer-wire-protocol.cjs", "state-pair-positional-codec.cjs"]
    .map((file) => [file, shaFile(path.join(ROOT, "scripts", file))]));
  const testSources = Object.fromEntries(["state-pair-positional-codec.cjs",
    "multiplayer-state-pair-canonical-reuse-adversarial.cjs",
    "multiplayer-state-pair-lazy-candidate-benchmark.cjs",
    "multiplayer-state-pair-lazy-candidate-evidence.cjs"]
    .map((file) => [file, shaFile(path.join(ROOT, "tests", file))]));
  const invariants = {
    ownChecksums: own.passed,
    exactStoredAnalysis: JSON.stringify(storedAnalysis) === JSON.stringify(analysis),
    analysisBinding: manifest.analysisSha256 === shaFile(path.join(EVIDENCE, "analysis.json")),
    benchmarkBinding: manifest.benchmarkSha256 === shaFile(BENCHMARK),
    sourceBindings: JSON.stringify(manifest.implementationSources) === JSON.stringify(implementationSources)
      && JSON.stringify(manifest.testSources) === JSON.stringify(testSources),
    decision: JSON.stringify(storedAnalysis.decision.admittedPopulations) === "[1]"
      && JSON.stringify(storedAnalysis.decision.rejectedPopulations) === "[4,8]",
    lazyMaterialization: storedAnalysis.scenarios.every((row) => {
      const operations = row.candidate.operationCounters;
      return operations.outerCandidateDescriptors === operations.lanePayloadsBuilt
        && operations.outerCandidateFrames === operations.chosenFrameMaterializations
        && operations.outerCandidateDescriptors === operations.outerCandidateFrames * 4
        && operations.lanePayloadReferenceReuses === operations.lanePayloadsBuilt;
    }),
  };
  const result = { passed: Object.values(invariants).every(Boolean), invariants,
    compositeSha256: own.actualAggregateSha256, decision: storedAnalysis.decision };
  console.log(JSON.stringify(result, null, 2));
  process.exitCode = result.passed ? 0 : 1;
}

main();
