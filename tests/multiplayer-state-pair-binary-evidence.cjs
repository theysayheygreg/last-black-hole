#!/usr/bin/env node
"use strict";

const assert = require("assert");
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");
const { validateChecksums, aggregateChecksum } = require("./network/state-pair-product-metrics.cjs");

const ROOT = path.resolve(__dirname, "..");
const EVIDENCE = path.join(ROOT, "docs", "v0.4", "evidence", "state-pair-s16");
const BASELINE = path.join(ROOT, "docs", "v0.4", "evidence", "state-pair-s15", "candidate-process-r2");
const CANDIDATE = path.join(EVIDENCE, "candidate-process");
const BASELINE_SHA = "c2df9114ce2cfd7ab29ff613b214498b214cebd7df71d1e0c74750b974f6e266";
const CANDIDATE_SHA = "458da816f61b5d79d6ca75ed4a7efecdf82b76fb7a288c47f9272889779386f2";
const S15_TOP_LEVEL_SHA = "66c2c751c80f2f0e94c4103eff01352b1e241ce9690fff58c9331a354ec23bf8";
const IMPLEMENTATION_COMMIT = "51618994215e056cd47c24fcb5c13d9ad12778a0";
const TARGET_HZ = 10;
const TARGET_BPS = 64 * 1024;
const SENSITIVITY_BPS = 80 * 1024;

function read(file) { return JSON.parse(fs.readFileSync(file, "utf8")); }
function sha(file) { return crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex"); }
function git(...args) { return execFileSync("git", args, { cwd: ROOT, encoding: "utf8" }).trim(); }
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
  const gate = { correctnessAndConvergencePass: scenario.correctness.passed,
    cadencePass: scenario.cadence.minimumReceiverAcceptedPairsPerSecond >= 9,
    authorityClockPass: scenario.performance.authority.simTickMs.p95 <= 1000 / scenario.cadence.sessionTickHz
      && scenario.performance.authority.projectionAndPublishMs.p95 <= 1000 / TARGET_HZ,
    normalModePass: scenario.authorityState.overloadState === "NORMAL",
    actualMeanPass: scenario.traffic.worstRecipientMeanDownlinkBytesPerSecond <= TARGET_BPS,
    actualP95Pass: scenario.traffic.oneSecondAllRecipientBytesPerSecond.p95 <= SENSITIVITY_BPS,
    normalizedMeanPass: normalized.worstMeanBytesPerSecond <= TARGET_BPS,
    normalizedP95Pass: normalized.oneSecond.p95 <= SENSITIVITY_BPS };
  const binary = scenario.authorityState.adapter?.binary || null;
  return { population, commit: scenario.commit, codec: scenario.codec || "state-pair-positional-v1",
    cadence: { authorityMinimumHz: scenario.cadence.minimumAuthorityAcceptedPairsPerSecond,
      receiverMinimumHz: scenario.cadence.minimumReceiverAcceptedPairsPerSecond },
    projectionAndPublishMs: scenario.performance.authority.projectionAndPublishMs,
    authorityCpuOneCoreFraction: scenario.performance.authority.cpuUsage.oneCoreFraction,
    client: { worstDecodeP95Ms: Math.max(...scenario.performance.clients.map((row) => row.decodeMs.p95)),
      worstApplyP95Ms: Math.max(...scenario.performance.clients.map((row) => row.applyMs.p95)) },
    overloadMode: scenario.authorityState.overloadState,
    traffic: { actualWorstMeanBytesPerSecond: scenario.traffic.worstRecipientMeanDownlinkBytesPerSecond,
      actualOneSecondP95BytesPerSecond: scenario.traffic.oneSecondAllRecipientBytesPerSecond.p95,
      normalized10HzWorstMeanBytesPerSecond: normalized.worstMeanBytesPerSecond,
      normalized10HzOneSecondP95BytesPerSecond: normalized.oneSecond.p95 },
    binaryReuse: binary && { reusedEncodedFrames: binary.reusedEncodedFrames,
      reusedEncodedBytes: binary.reusedEncodedBytes, decodedFrames: binary.decodedFrames },
    correctnessPassed: scenario.correctness.passed,
    queuesClear: scenario.performance.queueAndBackpressure.cumulativePressure.noHighWaterOrQueuePolicyTransition
      && Object.values(scenario.performance.queueAndBackpressure.cumulativePressure.end.current)
        .every((row) => row.total === 0),
    productGate: gate };
}

function compare(baseline, candidate) {
  return baseline.map((before, index) => {
    const after = candidate[index];
    return { population: before.population,
      actualWorstMeanWireReductionFraction: 1 - after.traffic.actualWorstMeanBytesPerSecond
        / before.traffic.actualWorstMeanBytesPerSecond,
      actualP95WireReductionFraction: 1 - after.traffic.actualOneSecondP95BytesPerSecond
        / before.traffic.actualOneSecondP95BytesPerSecond,
      projectionP95ChangeFraction: after.projectionAndPublishMs.p95 / before.projectionAndPublishMs.p95 - 1,
      authorityCpuChangeFraction: after.authorityCpuOneCoreFraction / before.authorityCpuOneCoreFraction - 1,
      receiverCadenceChangeHz: after.cadence.receiverMinimumHz - before.cadence.receiverMinimumHz };
  });
}

function build() {
  assert(validateChecksums(BASELINE).passed && validateChecksums(BASELINE).actualAggregateSha256 === BASELINE_SHA);
  assert(validateChecksums(CANDIDATE).passed && validateChecksums(CANDIDATE).actualAggregateSha256 === CANDIDATE_SHA);
  const s15 = validateChecksums(path.join(ROOT, "docs", "v0.4", "evidence", "state-pair-s15"));
  assert(s15.passed && s15.actualAggregateSha256 === S15_TOP_LEVEL_SHA);
  assert.strictEqual(git("rev-parse", IMPLEMENTATION_COMMIT), IMPLEMENTATION_COMMIT);
  const testOutput = execFileSync(process.execPath, [path.join(ROOT, "tests", "state-pair-binary-codec.cjs")],
    { cwd: ROOT, encoding: "utf8" });
  assert(testOutput.includes("9 passed, 0 failed"));
  const parity = { schema: "lbh-s16-binary-parity-proof-v1", implementationCommit: IMPLEMENTATION_COMMIT,
    command: "node tests/state-pair-binary-codec.cjs", result: "9 passed, 0 failed",
    sourceSha256: sha(path.join(ROOT, "tests", "state-pair-binary-codec.cjs")),
    binaryCodecSha256: sha(path.join(ROOT, "scripts", "state-pair-binary-codec.cjs")),
    exactTransactionFrames: 24, deterministicValueCases: 519, craftedMalformedCases: 28,
    deterministicMutatedFrames: 1000, minimumRejectedMutations: 950,
    proofs: ["binary and positional decode to identical statePair semantics",
      "ACK lineage is accepted through the binary path",
      "JSON positional fallback is complete when the connection/session is negotiated without binary",
      "cross-codec state-pair traffic fails closed", "accepted fuzz mutations cannot change semantics"] };
  fs.writeFileSync(path.join(EVIDENCE, "parity.json"), `${JSON.stringify(parity, null, 2)}\n`, { flag: "wx" });
  const baseline = [1, 4, 8].map((population) => summarize(BASELINE, population));
  const candidate = [1, 4, 8].map((population) => summarize(CANDIDATE, population));
  const benchmark = read(path.join(EVIDENCE, "codec-benchmark.json"));
  const analysis = { schema: "lbh-s16-binary-state-pair-analysis-v1",
    authorityBoundary: "One logical authority process is the sole gameplay writer for one match/group. Deployment multiplies this boundary horizontally across concurrent matches; there is no single global authority.",
    baselineBinding: { path: path.relative(ROOT, BASELINE), compositeSha256: BASELINE_SHA,
      implementationCommit: baseline[0].commit, sealedS15Commit: "06ff295" },
    candidateBinding: { path: path.relative(ROOT, CANDIDATE), compositeSha256: CANDIDATE_SHA,
      implementationCommit: IMPLEMENTATION_COMMIT, evidenceCommit: null },
    s15TopLevelBinding: { path: "docs/v0.4/evidence/state-pair-s15", compositeSha256: S15_TOP_LEVEL_SHA },
    parity, codecMicrobenchmark: benchmark, baseline, candidate, comparison: compare(baseline, candidate),
    productDecision: { replacement: "reject", admittedPopulations: candidate.filter((row) =>
      Object.values(row.productGate).every(Boolean)).map((row) => row.population),
    rejectedPopulations: candidate.filter((row) => !Object.values(row.productGate).every(Boolean))
      .map((row) => row.population),
    statement: "The generic lossless binary codec reduces measured process wire traffic by 30-35%, but it regresses authority projection/publish p95 by 4-19%, raises authority CPU by 1-5%, and does not improve receiver cadence. Its representative codec-only workload is also 3.5% larger and 3.3x slower to encode than positional JSON. Keep S15 positional JSON as the release default; retain S16 only as an opt-in bounded prototype.",
    nextLane: "Profile and remove repeated authority-side candidate construction/materialization before attempting another wire codec. Preserve S15 selection and positional JSON wire truth while proving lower projection/publish cost at 1/4/8." },
    limitations: ["machine-local loopback", "single 20-second candidate window per population",
      "codec microbenchmark is machine-local and synthetic", "no hosted/WAN/TLS/fleet claim",
      "no 24/48/96 extrapolation", "normalized traffic is counterfactual and cannot replace cadence admission"] };
  fs.writeFileSync(path.join(EVIDENCE, "analysis.json"), `${JSON.stringify(analysis, null, 2)}\n`, { flag: "wx" });
  const manifest = { schema: "lbh-s16-binary-state-pair-manifest-v1",
    baselineSha256: BASELINE_SHA, candidateSha256: CANDIDATE_SHA, s15TopLevelSha256: S15_TOP_LEVEL_SHA,
    analysisSha256: sha(path.join(EVIDENCE, "analysis.json")),
    benchmarkSha256: sha(path.join(EVIDENCE, "codec-benchmark.json")),
    paritySha256: sha(path.join(EVIDENCE, "parity.json")), implementationCommit: IMPLEMENTATION_COMMIT,
    productDecision: analysis.productDecision };
  fs.writeFileSync(path.join(EVIDENCE, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`, { flag: "wx" });
  const files = ["analysis.json", "codec-benchmark.json", "manifest.json", "parity.json"];
  fs.writeFileSync(path.join(EVIDENCE, "checksums.json"),
    `${JSON.stringify(aggregateChecksum(EVIDENCE, files), null, 2)}\n`, { flag: "wx" });
}

function validate() {
  const own = validateChecksums(EVIDENCE);
  const analysis = read(path.join(EVIDENCE, "analysis.json"));
  const manifest = read(path.join(EVIDENCE, "manifest.json"));
  const invariants = { ownChecksums: own.passed,
    baseline: validateChecksums(BASELINE).passed && validateChecksums(BASELINE).actualAggregateSha256 === BASELINE_SHA,
    candidate: validateChecksums(CANDIDATE).passed && validateChecksums(CANDIDATE).actualAggregateSha256 === CANDIDATE_SHA,
    bindings: manifest.analysisSha256 === sha(path.join(EVIDENCE, "analysis.json"))
      && manifest.benchmarkSha256 === sha(path.join(EVIDENCE, "codec-benchmark.json"))
      && manifest.paritySha256 === sha(path.join(EVIDENCE, "parity.json")),
    parity: analysis.parity.result === "9 passed, 0 failed" && analysis.parity.exactTransactionFrames === 24
      && analysis.parity.deterministicValueCases === 519 && analysis.parity.craftedMalformedCases === 28
      && analysis.parity.deterministicMutatedFrames === 1000,
    semantics: analysis.candidate.every((row) => row.correctnessPassed && row.queuesClear
      && row.binaryReuse?.reusedEncodedFrames > 0),
    decision: analysis.productDecision.replacement === "reject"
      && JSON.stringify(analysis.productDecision.admittedPopulations) === "[1]"
      && JSON.stringify(analysis.productDecision.rejectedPopulations) === "[4,8]" };
  const result = { passed: Object.values(invariants).every(Boolean), invariants,
    compositeSha256: own.actualAggregateSha256 };
  console.log(JSON.stringify(result, null, 2));
  process.exitCode = result.passed ? 0 : 1;
}

if (process.argv.includes("--build")) build();
validate();
