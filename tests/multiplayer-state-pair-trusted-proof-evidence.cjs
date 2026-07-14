#!/usr/bin/env node
"use strict";

const assert = require("assert");
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");
const { validateChecksums, aggregateChecksum } = require("./network/state-pair-product-metrics.cjs");

const ROOT = path.resolve(__dirname, "..");
const EVIDENCE = path.join(ROOT, "docs", "v0.4", "evidence", "state-pair-s18");
const CANDIDATE = path.join(EVIDENCE, "candidate-process");
const BASELINE = path.join(ROOT, "docs", "v0.4", "evidence", "state-pair-s17", "candidate-process");
const BENCHMARK = path.join(EVIDENCE, "trusted-proof-benchmark.json");
const PROOF_OUTPUT = path.join(EVIDENCE, "trusted-proof-adversarial.json");
const CANDIDATE_SHA = "82a1e0eadea4ee6d6dee36f86b1d937fbd31f3a16e95eb9f24cfa3bb68d69b37";
const BASELINE_SHA = "9001726f56fbfd895d32f5d3111dd50b16cb80bd1a0903772bffbdc78307d149";
const SEALED_SOURCE_COMMIT = "266e8c8";
const TARGET_HZ = 10;
const MIN_HZ = 9;
const TARGET_BPS = 64 * 1024;
const P95_BPS = 80 * 1024;

function shaFile(file) { return crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex"); }
function shaGitFile(revision, file) {
  return crypto.createHash("sha256").update(execFileSync("git", ["show", `${revision}:${file}`],
    { cwd: ROOT })).digest("hex");
}
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
      observedMeanPairBytes: pairBytes / pairs.length, observedOtherBytesPerSecond: otherBytes / seconds,
      normalized10HzBytesPerSecond: (pairBytes * pairScale + otherBytes) / seconds };
  }
  const windows = distribution(buckets);
  return { noCadenceCredit: true, perRecipient,
    worstMeanBytesPerSecond: Math.max(...Object.values(perRecipient).map((row) => row.normalized10HzBytesPerSecond)),
    oneSecondP95BytesPerSecond: windows.p95, oneSecondP99BytesPerSecond: windows.p99 };
}

function scenarioSummary(population) {
  const scenario = JSON.parse(fs.readFileSync(path.join(CANDIDATE, `normal-${population}.json`)));
  const baseline = JSON.parse(fs.readFileSync(path.join(BASELINE, `normal-${population}.json`)));
  const normalized = normalizedTraffic(scenario);
  const ledgerMax = Math.max(...scenario.clients.map((client) => client.receiver.ledger.highWaterBytes));
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
      authorityOneCoreFraction: baseline.performance.authority.cpuUsage.oneCoreFraction },
    candidate: { receiverHz: scenario.cadence.minimumReceiverAcceptedPairsPerSecond,
      authorityHz: scenario.cadence.minimumAuthorityAcceptedPairsPerSecond,
      projectionAndPublishMs: scenario.performance.authority.projectionAndPublishMs,
      authorityOneCoreFraction: scenario.performance.authority.cpuUsage.oneCoreFraction,
      actualWorstMeanBytesPerSecond: scenario.traffic.worstRecipientMeanDownlinkBytesPerSecond,
      actualOneSecondP95BytesPerSecond: scenario.traffic.oneSecondAllRecipientBytesPerSecond.p95,
      normalized10Hz: normalized, overloadMode: scenario.authorityState.overloadState,
      operations: scenario.authorityState.statePair.codecPairChoice.operations,
      ledger: { maxPerClientBytes: ledgerMax,
        currentAggregateBytesAtMeasurementEnd: scenario.clients.reduce((sum, client) => sum + client.receiver.ledger.bytes, 0) },
      correctness: scenario.correctness, gate, productAdmissionPassed: Object.values(gate).every(Boolean) },
    comparison: { cadenceDeltaHz: scenario.cadence.minimumReceiverAcceptedPairsPerSecond
        - baseline.cadence.minimumReceiverAcceptedPairsPerSecond,
      projectionP50ReductionFraction: 1 - scenario.performance.authority.projectionAndPublishMs.p50
        / baseline.performance.authority.projectionAndPublishMs.p50,
      projectionP95ReductionFraction: 1 - scenario.performance.authority.projectionAndPublishMs.p95
        / baseline.performance.authority.projectionAndPublishMs.p95,
      authorityCpuReductionFraction: 1 - scenario.performance.authority.cpuUsage.oneCoreFraction
        / baseline.performance.authority.cpuUsage.oneCoreFraction } };
}

function build() {
  const candidateChecks = validateChecksums(CANDIDATE);
  const baselineChecks = validateChecksums(BASELINE);
  assert(candidateChecks.passed && candidateChecks.actualAggregateSha256 === CANDIDATE_SHA);
  assert(baselineChecks.passed && baselineChecks.actualAggregateSha256 === BASELINE_SHA);
  const external = JSON.parse(execFileSync(process.execPath,
    [path.join(ROOT, "tests", "multiplayer-state-pair-clock-attribution.cjs"), "--validate-artifact", CANDIDATE],
    { cwd: ROOT, encoding: "utf8" }));
  assert(external.passed);
  const benchmark = JSON.parse(fs.readFileSync(BENCHMARK));
  const adversarial = JSON.parse(fs.readFileSync(PROOF_OUTPUT));
  assert(benchmark.attribution.material && benchmark.parity.mismatches === 0 && adversarial.mismatches === 0);
  const scenarios = [1, 4, 8].map(scenarioSummary);
  return { schema: "lbh-s18-trusted-authority-proof-analysis-v1",
    authorityBoundary: "One dedicated logical authority is the sole gameplay writer for one match/group; concurrent matches multiply this boundary horizontally.",
    releaseDefault: "S15 positional JSON plus S17 lazy materialization and S18 trusted same-operation proof. S16 binary remains opt-in.",
    baselineBinding: { path: path.relative(ROOT, BASELINE), compositeSha256: BASELINE_SHA,
      sealedS17Commit: "e57bf53" },
    candidateBinding: { path: path.relative(ROOT, CANDIDATE), compositeSha256: CANDIDATE_SHA,
      implementationCommit: "149b7d3c9bb04b672ea88dd498d031938aa6724b" },
    benchmarkBinding: { path: path.relative(ROOT, BENCHMARK), sha256: shaFile(BENCHMARK),
      exactWireComparisons: benchmark.parity.exactWireComparisons,
      exactSelectionTranscriptComparisons: benchmark.parity.exactSelectionTranscriptComparisons,
      semanticDecodeComparisons: benchmark.parity.semanticDecodeComparisons,
      mismatches: benchmark.parity.mismatches },
    adversarialBinding: { path: path.relative(ROOT, PROOF_OUTPUT), sha256: shaFile(PROOF_OUTPUT), ...adversarial },
    benchmarkSummary: benchmark.comparisons, scenarios,
    decision: { keep: true,
      admittedPopulations: scenarios.filter((row) => row.candidate.productAdmissionPassed).map((row) => row.population),
      rejectedPopulations: scenarios.filter((row) => !row.candidate.productAdmissionPassed).map((row) => row.population),
      statement: "The trusted proof is exact and material. Four players recover NORMAL 9.85 Hz clock behavior but remain above the normalized 64 KiB/s mean gate at 75,770 B/s, so only one player is product-admitted. Eight reaches 5.00 Hz but remains DILATED at 117.97 ms p95 and 79,004 B/s normalized mean; no cadence or bandwidth credit is awarded.",
      nextLane: "Share the immutable public projection/core/delta work once per match tick across recipients, retaining per-recipient owner overlays, connection lineage, ACK bases, and the one-writer authority boundary." },
    limitations: ["Machine-local loopback", "One immutable 20-second profiler-off candidate window per population",
      "S17 baseline and S18 candidate are not a same-minute paired process run",
      "No WAN, TLS, hosted fleet, compression, cadence policy, heavy sim, or 24/48/96 claim"] };
}

function sources(revision = null) {
  const hash = (file) => revision ? shaGitFile(revision, file) : shaFile(path.join(ROOT, file));
  return { implementation: Object.fromEntries(["authority-delta-publisher.cjs", "multiplayer-wire-protocol.cjs",
    "state-pair-positional-codec.cjs"].map((file) =>
    [file, hash(path.join("scripts", file))])),
  tests: Object.fromEntries(["multiplayer-state-pair-trusted-authority-proof.cjs",
    "multiplayer-state-pair-trusted-proof-benchmark.cjs", "multiplayer-state-pair-trusted-proof-evidence.cjs",
    "multiplayer-state-pair-canonical-reuse-benchmark.cjs"].map((file) =>
    [file, hash(path.join("tests", file))])) };
}

function main() {
  const analysis = build();
  if (process.argv.includes("--write")) {
    fs.writeFileSync(path.join(EVIDENCE, "analysis.json"), `${JSON.stringify(analysis, null, 2)}\n`, { flag: "wx" });
    const manifest = { schema: "lbh-s18-trusted-authority-proof-manifest-v1",
      analysisSha256: shaFile(path.join(EVIDENCE, "analysis.json")), benchmarkSha256: shaFile(BENCHMARK),
      adversarialSha256: shaFile(PROOF_OUTPUT), candidateCompositeSha256: CANDIDATE_SHA,
      baselineCompositeSha256: BASELINE_SHA, ...sources() };
    fs.writeFileSync(path.join(EVIDENCE, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`, { flag: "wx" });
    fs.writeFileSync(path.join(EVIDENCE, "checksums.json"), `${JSON.stringify(aggregateChecksum(EVIDENCE,
      ["analysis.json", "trusted-proof-benchmark.json", "trusted-proof-adversarial.json", "manifest.json"]), null, 2)}\n`, { flag: "wx" });
    console.log(JSON.stringify({ written: true, decision: analysis.decision }, null, 2));
    return;
  }
  const own = validateChecksums(EVIDENCE);
  const stored = JSON.parse(fs.readFileSync(path.join(EVIDENCE, "analysis.json")));
  const manifest = JSON.parse(fs.readFileSync(path.join(EVIDENCE, "manifest.json")));
  const currentSources = sources(SEALED_SOURCE_COMMIT);
  const invariants = { checksums: own.passed, exactAnalysis: JSON.stringify(stored) === JSON.stringify(analysis),
    analysisBinding: manifest.analysisSha256 === shaFile(path.join(EVIDENCE, "analysis.json")),
    benchmarkBinding: manifest.benchmarkSha256 === shaFile(BENCHMARK),
    adversarialBinding: manifest.adversarialSha256 === shaFile(PROOF_OUTPUT),
    sourceBindings: JSON.stringify(manifest.implementation) === JSON.stringify(currentSources.implementation)
      && JSON.stringify(manifest.tests) === JSON.stringify(currentSources.tests),
    decision: JSON.stringify(stored.decision.admittedPopulations) === "[1]"
      && JSON.stringify(stored.decision.rejectedPopulations) === "[4,8]",
    proofAccounting: stored.scenarios.every((row) => row.candidate.operations.trustedProofsCreated
      === row.candidate.operations.trustedProofsConsumed && row.candidate.operations.trustedProofRejects === 0) };
  console.log(JSON.stringify({ passed: Object.values(invariants).every(Boolean), invariants,
    compositeSha256: own.actualAggregateSha256, decision: stored.decision }, null, 2));
  process.exitCode = Object.values(invariants).every(Boolean) ? 0 : 1;
}

main();
