#!/usr/bin/env node
"use strict";

const assert = require("assert");
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");
const { validateChecksums, aggregateChecksum } = require("./network/state-pair-product-metrics.cjs");

const ROOT = path.resolve(__dirname, "..");
const EVIDENCE = path.join(ROOT, "docs/v0.4/evidence/state-pair-s19");
const BASELINE = path.join(EVIDENCE, "baseline");
const CANDIDATE = path.join(EVIDENCE, "candidate");
const BENCHMARK = path.join(EVIDENCE, "benchmark/benchmark.json");
const BASELINE_SHA = "df2441176514833357645959815053be53adaa23c8b434ec7548bf4cc52169f7";
const CANDIDATE_SHA = "79765292714530595321902fb5bf3a5cfa502b02d5c4c46c9c6cca95739c4a23";
const EXPERIMENT_COMMIT = "5074e42";
const TARGET_HZ = 10;
const MIN_HZ = 9;
const TARGET_BPS = 64 * 1024;
const P95_BPS = 80 * 1024;

function sha(value) { return crypto.createHash("sha256").update(value).digest("hex"); }
function shaFile(file) { return sha(fs.readFileSync(file)); }
function gitFileSha(commit, file) {
  return sha(execFileSync("git", ["show", `${commit}:${file}`], { cwd: ROOT }));
}
function read(file) { return JSON.parse(fs.readFileSync(file, "utf8")); }
function distribution(values) { const sorted = [...values].sort((a, b) => a - b);
  const at = (fraction) => sorted[Math.min(sorted.length - 1, Math.floor((sorted.length - 1) * fraction))];
  return { count: sorted.length, mean: sorted.reduce((sum, value) => sum + value, 0) / sorted.length,
    p50: at(0.5), p95: at(0.95), p99: at(0.99), max: sorted.at(-1) }; }

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
    assert(pairs.length > 0, "normalization cannot credit zero cadence");
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
      normalized10HzBytesPerSecond: (pairBytes * pairScale + otherBytes) / seconds };
  }
  return { perRecipient,
    worstMeanBytesPerSecond: Math.max(...Object.values(perRecipient).map((row) => row.normalized10HzBytesPerSecond)),
    oneSecondP95BytesPerSecond: distribution(buckets).p95 };
}

function scenario(population) {
  const baseline = read(path.join(BASELINE, `normal-${population}.json`));
  const candidate = read(path.join(CANDIDATE, `normal-${population}.json`));
  const normalized = normalizedTraffic(candidate);
  const cache = candidate.authorityState.statePair.sharedPublicWork;
  const gate = { correctness: candidate.correctness.passed,
    cadence: candidate.cadence.minimumReceiverAcceptedPairsPerSecond >= MIN_HZ,
    authorityClock: candidate.performance.authority.projectionAndPublishMs.p95 <= 100,
    overloadNormal: candidate.authorityState.overloadState === "NORMAL",
    normalizedMean: normalized.worstMeanBytesPerSecond <= TARGET_BPS,
    normalizedP95: normalized.oneSecondP95BytesPerSecond <= P95_BPS,
    queuesClear: candidate.performance.queueAndBackpressure.cumulativePressure.noHighWaterOrQueuePolicyTransition };
  return { population,
    baseline: { receiverHz: baseline.cadence.minimumReceiverAcceptedPairsPerSecond,
      projectionAndPublishMs: baseline.performance.authority.projectionAndPublishMs,
      authorityOneCoreFraction: baseline.performance.authority.cpuUsage.oneCoreFraction },
    candidate: { receiverHz: candidate.cadence.minimumReceiverAcceptedPairsPerSecond,
      projectionAndPublishMs: candidate.performance.authority.projectionAndPublishMs,
      authorityOneCoreFraction: candidate.performance.authority.cpuUsage.oneCoreFraction,
      actualWorstMeanBytesPerSecond: candidate.traffic.worstRecipientMeanDownlinkBytesPerSecond,
      actualOneSecondP95BytesPerSecond: candidate.traffic.oneSecondAllRecipientBytesPerSecond.p95,
      normalized10Hz: normalized, sharedPublic: cache, correctness: candidate.correctness,
      gate, productAdmissionPassed: Object.values(gate).every(Boolean) },
    comparison: { cadenceDeltaHz: candidate.cadence.minimumReceiverAcceptedPairsPerSecond
        - baseline.cadence.minimumReceiverAcceptedPairsPerSecond,
      projectionP50ReductionFraction: 1 - candidate.performance.authority.projectionAndPublishMs.p50
        / baseline.performance.authority.projectionAndPublishMs.p50,
      projectionP95ReductionFraction: 1 - candidate.performance.authority.projectionAndPublishMs.p95
        / baseline.performance.authority.projectionAndPublishMs.p95,
      authorityCpuReductionFraction: 1 - candidate.performance.authority.cpuUsage.oneCoreFraction
        / baseline.performance.authority.cpuUsage.oneCoreFraction } };
}

function build() {
  const baselineCheck = validateChecksums(BASELINE);
  const candidateCheck = validateChecksums(CANDIDATE);
  assert(baselineCheck.passed && baselineCheck.actualAggregateSha256 === BASELINE_SHA);
  assert(candidateCheck.passed && candidateCheck.actualAggregateSha256 === CANDIDATE_SHA);
  const benchmark = read(BENCHMARK);
  assert.strictEqual(benchmark.parity.mismatches, 0);
  const scenarios = [1, 4, 8].map(scenario);
  assert(scenarios.every((row) => row.candidate.sharedPublic.keyframeReuses === 0
    && row.candidate.sharedPublic.deltaReuses === 0));
  return { schema: "lbh-s19-shared-public-rejected-analysis-v1",
    authorityBoundary: "One dedicated logical authority remains the sole gameplay writer for one match/group; concurrent matches multiply this boundary horizontally.",
    releaseDefault: "S15 positional JSON plus S17 lazy materialization and S18 trusted proof; S16 binary remains opt-in. S19 runtime changes are reverted.",
    experiment: { implementationCommit: EXPERIMENT_COMMIT, revertCommit: "5f4d3c3",
      baselineCompositeSha256: BASELINE_SHA, candidateCompositeSha256: CANDIDATE_SHA,
      exactFocusedComparisons: 22, focusedMismatches: 0,
      counterbalancedBenchmark: { sha256: shaFile(BENCHMARK), ...benchmark } },
    scenarios,
    decision: { keep: false, admittedPopulations: [1], rejectedPopulations: [4, 8],
      statement: "The synchronized synthetic cohort is byte-exact and faster, but real publisher keys retain recipient-specific connection epochs and state-pair IDs; delta keys additionally retain exact ACKed-base hashes, while runtime transition cohorts retain recipient revision-tracker snapshot identity. Staggered scheduling and ACK progression therefore record zero exact keyframe/delta reuse at 1/4/8. The single fixed-order run observes higher CPU/tail values and 4.95 to 4.80 Hz at eight, but zero reuse alone is sufficient to revert rather than weaken revision, ACK-base, or lineage semantics.",
      gatesChanged: [], gatesUnchanged: ["four-player normalized mean", "eight-player cadence", "eight-player authority clock", "eight-player normalized mean"],
      nextLane: "Run a bounded compression pilot against S18 positional JSON with strict four-player bandwidth and eight-player authority CPU/tail gates; do not change authority cadence or make S16 binary the default." },
    redTeam: { reviewer: "Independent read-only agent", confirmedP1: [], remainingP1P2: [],
      resolvedP2: [
        "Real admissions recorded zero publisher keyframe/delta reuse and regressed authority CPU/tail latency; mandatory revert 5f4d3c3 removes the ineffective default-on path.",
        "The synchronized focused oracle and microbenchmark manufacture cohorts not formed by staggered product admission; both are labeled synthetic ceilings, not admission evidence.",
        "Sealed isolated-process artifacts do not export runtime source/core counters; the decision makes no upstream-core reuse claim and relies only on exported publisher cohort counters.",
        "One fixed 20-second ordering limits precise regression attribution, but deterministic zero publisher reuse is independently sufficient to reject the mechanism." ],
      removedP3Diagnostics: ["Non-causal cache-miss labels", "Tautological identity counter", "Incomplete reused-byte accounting"] },
    rejectedEvidence: { path: "rejected-co-located", reason: "The co-located attempt failed during eight-seat manifest admission and is not used for performance or admission." },
    retainedBaseline: "S6 prepared public projection/core work remains accepted and prevents repeat validation/canonicalization/hashing within each recipient lane. S19 was a distinct cross-recipient runtime-transition and publisher-cohort layer; reverting it does not remove S6.",
    limitations: ["Machine-local raw WebSocket loopback", "One fixed-order 20-second profiler-off isolated-process window per population per side; observed candidate differences are not a counterbalanced causal estimate",
      "Counterbalanced microbenchmark uses deliberately synchronized histories not produced by real staggered admission",
      "Isolated product artifacts export publisher cohort counters, not runtime source/core counters; no upstream-core reuse claim is made",
      "No WAN, TLS, hosted fleet, compression, cadence policy, heavy sim, or 24/48/96 claim"] };
}

function sourceBindings() {
  const files = ["scripts/authority-delta-publisher.cjs", "scripts/runtime-state-pair-integration.cjs",
    "scripts/sim-runtime.cjs", "tests/runtime-state-pair-integration.cjs"];
  return Object.fromEntries(files.map((file) => [file, gitFileSha(EXPERIMENT_COMMIT, file)]));
}

function main() {
  const analysis = build();
  const analysisFile = path.join(EVIDENCE, "analysis.json");
  const manifestFile = path.join(EVIDENCE, "manifest.json");
  const checksumFile = path.join(EVIDENCE, "checksums.json");
  if (process.argv.includes("--write")) {
    fs.writeFileSync(analysisFile, `${JSON.stringify(analysis, null, 2)}\n`, { flag: "wx" });
    const manifest = { schema: "lbh-s19-shared-public-rejected-manifest-v1",
      analysisSha256: shaFile(analysisFile), baselineCompositeSha256: BASELINE_SHA,
      candidateCompositeSha256: CANDIDATE_SHA, benchmarkSha256: shaFile(BENCHMARK),
      experimentSourceBindings: sourceBindings() };
    fs.writeFileSync(manifestFile, `${JSON.stringify(manifest, null, 2)}\n`, { flag: "wx" });
    fs.writeFileSync(checksumFile, `${JSON.stringify(aggregateChecksum(EVIDENCE,
      ["analysis.json", "manifest.json", "benchmark/benchmark.json"]), null, 2)}\n`, { flag: "wx" });
  }
  const stored = read(analysisFile);
  const manifest = read(manifestFile);
  const own = validateChecksums(EVIDENCE);
  const invariants = { checksum: own.passed,
    analysis: JSON.stringify(stored) === JSON.stringify(analysis),
    sources: JSON.stringify(manifest.experimentSourceBindings) === JSON.stringify(sourceBindings()),
    rejected: stored.decision.keep === false && stored.scenarios.every((row) =>
      row.candidate.sharedPublic.keyframeReuses === 0 && row.candidate.sharedPublic.deltaReuses === 0) };
  console.log(JSON.stringify({ passed: Object.values(invariants).every(Boolean), invariants,
    compositeSha256: own.actualAggregateSha256, decision: stored.decision }, null, 2));
  process.exitCode = Object.values(invariants).every(Boolean) ? 0 : 1;
}

main();
