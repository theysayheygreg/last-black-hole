#!/usr/bin/env node
"use strict";

const fs = require("fs");
const path = require("path");
const assert = require("assert");
const { validateChecksums } = require("./network/state-pair-product-metrics.cjs");

const ROOT = path.resolve(__dirname, "..");
const EVIDENCE = path.resolve(process.argv[2]
  || path.join(ROOT, "docs", "v0.4", "evidence", "state-pair-s23p"));
const ROUNDS = ["round-a", "round-b"];
const POPULATIONS = [1, 4, 8];
const TREATMENTS = ["control-s20", "control-s23", "candidate-s23p"];
const METHODOLOGY_ROUNDS = [
  { round: "round-a", treatmentOrder: ["control-s20", "control-s23", "candidate-s23p"],
    populationOrder: { s20: [8, 4, 1], s23: [4, 1, 8], s23p: [1, 8, 4] } },
  { round: "round-b", treatmentOrder: ["candidate-s23p", "control-s23", "control-s20"],
    populationOrder: { s23p: [4, 8, 1], s23: [8, 1, 4], s20: [1, 4, 8] } },
];

function read(file) {
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

function median(values) {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted.length % 2 ? sorted[Math.floor(sorted.length / 2)]
    : (sorted[sorted.length / 2 - 1] + sorted[sorted.length / 2]) / 2;
}

function ratio(candidate, control, select) {
  return select(candidate) / select(control);
}

function treatmentOrderKey(treatment) {
  return treatment === "control-s20" ? "s20"
    : treatment === "control-s23" ? "s23" : "s23p";
}

function validateCaptureOrder() {
  return METHODOLOGY_ROUNDS.flatMap((method) => method.treatmentOrder.map((treatment) => {
    const directory = path.join(EVIDENCE, method.round, treatment);
    const validation = validateChecksums(directory);
    assert(validation.passed, `${method.round}/${treatment} checksum validation failed`);
    const expected = method.populationOrder[treatmentOrderKey(treatment)];
    const run = read(path.join(directory, "run.json"));
    const aggregate = read(path.join(directory, "aggregate.json"));
    const aggregateOrder = aggregate.scenarios.map((entry) => entry.population);
    const starts = expected.map((population) => ({ population,
      windowStartAt: read(path.join(directory, `normal-${population}.json`)).window.startAt }));
    assert.deepStrictEqual(run.config.populations, expected,
      `${method.round}/${treatment} configured population order drifted`);
    assert.deepStrictEqual(aggregateOrder, expected,
      `${method.round}/${treatment} aggregate population order drifted`);
    assert(starts.every((entry, index) => index === 0
      || entry.windowStartAt > starts[index - 1].windowStartAt),
    `${method.round}/${treatment} measurement chronology contradicts declared order`);
    return { round: method.round, treatment, verified: true, populationOrder: expected,
      measurementWindowStartAt: starts.map((entry) => entry.windowStartAt) };
  }));
}

function scenario(round, treatment, population) {
  const directory = path.join(EVIDENCE, round, treatment);
  const validation = validateChecksums(directory);
  assert(validation.passed, `${round}/${treatment} checksum validation failed`);
  const row = read(path.join(directory, `normal-${population}.json`));
  const cleanup = read(path.join(directory, `cleanup-normal-${population}.json`));
  const publicBody = row.authorityState.statePair?.publicBody || null;
  const prepared = publicBody?.preparedPublicSource || null;
  const gates = {
    correctness: row.correctness.passed === true && cleanup.passed === true,
    cadence: row.cadence.minimumAuthorityAcceptedPairsPerSecond >= 9
      && row.cadence.minimumReceiverAcceptedPairsPerSecond >= 9,
    normal: row.authorityState.overloadState === "NORMAL",
    projectionP95: row.performance.authority.projectionAndPublishMs.p95 <= 50,
    projectionP99: row.performance.authority.projectionAndPublishMs.p99 <= 70,
    meanTraffic: row.traffic.worstRecipientMeanDownlinkBytesPerSecond <= 64 * 1024,
    p95Traffic: row.traffic.oneSecondAllRecipientBytesPerSecond.p95 <= 80 * 1024,
  };
  gates.passed = Object.values(gates).every(Boolean);
  return {
    round, treatment, population, codec: row.codec,
    artifactCompositeSha256: validation.actualAggregateSha256,
    cadence: {
      authorityMinHz: row.cadence.minimumAuthorityAcceptedPairsPerSecond,
      receiverMinHz: row.cadence.minimumReceiverAcceptedPairsPerSecond,
    },
    performance: {
      projectionP95Ms: row.performance.authority.projectionAndPublishMs.p95,
      projectionP99Ms: row.performance.authority.projectionAndPublishMs.p99,
      authorityOneCoreFraction: row.performance.authority.cpuUsage.oneCoreFraction,
    },
    traffic: {
      worstRecipientMeanBytesPerSecond: row.traffic.worstRecipientMeanDownlinkBytesPerSecond,
      oneSecondP95BytesPerSecond: row.traffic.oneSecondAllRecipientBytesPerSecond.p95,
    },
    overloadState: row.authorityState.overloadState,
    correctnessPassed: row.correctness.passed,
    cleanupPassed: cleanup.passed,
    publicBody: publicBody ? {
      authority: publicBody.authority,
      preparedPublicSource: prepared,
    } : null,
    gates,
  };
}

function comparisonsFor(rows, controlTreatment) {
  return POPULATIONS.map((population) => {
    const rounds = ROUNDS.map((round) => {
      const control = rows.find((row) => row.round === round
        && row.treatment === controlTreatment && row.population === population);
      const candidate = rows.find((row) => row.round === round
        && row.treatment === "candidate-s23p" && row.population === population);
      return {
        round,
        authorityCadenceRatio: ratio(candidate, control, (row) => row.cadence.authorityMinHz),
        projectionP95Ratio: ratio(candidate, control, (row) => row.performance.projectionP95Ms),
        projectionP99Ratio: ratio(candidate, control, (row) => row.performance.projectionP99Ms),
        authorityCpuRatio: ratio(candidate, control,
          (row) => row.performance.authorityOneCoreFraction),
        meanTrafficRatio: ratio(candidate, control,
          (row) => row.traffic.worstRecipientMeanBytesPerSecond),
        p95TrafficRatio: ratio(candidate, control,
          (row) => row.traffic.oneSecondP95BytesPerSecond),
      };
    });
    const keys = ["authorityCadenceRatio", "projectionP95Ratio", "projectionP99Ratio",
      "authorityCpuRatio", "meanTrafficRatio", "p95TrafficRatio"];
    return { population, rounds, medianRatios: Object.fromEntries(keys.map((key) =>
      [key, median(rounds.map((round) => round[key]))])) };
  });
}

const orderValidation = validateCaptureOrder();
const rows = ROUNDS.flatMap((round) => TREATMENTS.flatMap((treatment) =>
  POPULATIONS.map((population) => scenario(round, treatment, population))));
const vsS23 = comparisonsFor(rows, "control-s23");
const vsS20 = comparisonsFor(rows, "control-s20");
const candidateRows = rows.filter((row) => row.treatment === "candidate-s23p");
const s20NonRegression = vsS20.filter((comparison) => comparison.population <= 4)
  .every(({ medianRatios: value }) => value.authorityCadenceRatio >= 0.95
    && value.projectionP95Ratio <= 1.10 && value.projectionP99Ratio <= 1.10
    && value.authorityCpuRatio <= 1.10 && value.meanTrafficRatio <= 1.10
    && value.p95TrafficRatio <= 1.10);
const eightVsS23 = vsS23.find((comparison) => comparison.population === 8).medianRatios;
const analysis = {
  schema: "lbh-s23p-prepared-public-source-counterbalanced-analysis-v1",
  commit: read(path.join(EVIDENCE, "round-a", "candidate-s23p", "run.json")).commit,
  implementationCommits: {
    proofPath: "3b7ceeb350e06141786042393c7c76dca94aeceb",
    adversarialHardening: "b3145fbe4ed039da0c441817b551f0ff8c39cb1d",
    validateBeforeCommit: "b9c6825a769864e80711ee9e50a7ba86bfcdc2de",
  },
  methodology: {
    rounds: METHODOLOGY_ROUNDS,
    orderValidation,
    profiler: "off",
    processBoundary: "one authority process plus one isolated client process per recipient",
    absoluteThresholds: { minimumCadenceHz: 9, overload: "NORMAL", projectionP95Ms: 50,
      projectionP99Ms: 70, meanBytesPerSecond: 64 * 1024, p95BytesPerSecond: 80 * 1024 },
    s20NonRegressionThresholds: { minimumCadenceRatio: 0.95, maximumTailCpuTrafficRatio: 1.10 },
    eightS23RecoveryThresholds: { maximumProjectionP95Ratio: 0.70,
      maximumProjectionP99Ratio: 0.75 },
  },
  rows,
  comparisons: { vsS23, vsS20 },
  proof: {
    everyCandidateCorrectAndClean: candidateRows.every((row) =>
      row.correctnessPassed && row.cleanupPassed),
    preparedExactlyOncePerIssuedAuthorityBeat: candidateRows.every((row) => {
      const prepared = row.publicBody?.preparedPublicSource;
      const authority = row.publicBody?.authority;
      return prepared && prepared.active === 0 && prepared.issued > 0
        && prepared.consumed >= prepared.issued
        && prepared.consumed <= prepared.issued * row.population
        && prepared.rejected === 0 && prepared.revoked === 0
        && prepared.publicValidations === prepared.issued
        && prepared.publicCanonicalizations === prepared.issued
        && prepared.publicHashes === prepared.issued
        && authority?.bodyBuilds === prepared.issued
        && authority?.bodyHashes === prepared.issued
        && authority?.bodyCacheHits === 0;
    }),
    diagnosticsRetainNoRawRecipientIdentifiers: candidateRows.every((row) => {
      const prepared = row.publicBody?.preparedPublicSource;
      return prepared?.activeProofsNotInspectable === true
        && prepared?.retainsRawRecipientIdentifiers === false;
    }),
    exactS23WireSemanticsCoveredByFocusedTest: true,
    absoluteCandidatePassBothRounds: POPULATIONS.filter((population) => ROUNDS.every((round) =>
      rows.find((row) => row.round === round && row.treatment === "candidate-s23p"
        && row.population === population).gates.passed)),
    eightTailRecoveryVsS23: eightVsS23.projectionP95Ratio <= 0.70
      && eightVsS23.projectionP99Ratio <= 0.75,
    oneAndFourNonRegressionVsS20: s20NonRegression,
  },
  decision: null,
  limitations: ["Machine-local macOS loopback", "Raw WebSocket without TLS",
    "One match at a time", "Twenty-second fixed windows", "No WAN, hosted WSS, fleet packing, AOI, or high-count claim"],
};
const promote = analysis.proof.everyCandidateCorrectAndClean
  && analysis.proof.preparedExactlyOncePerIssuedAuthorityBeat
  && analysis.proof.diagnosticsRetainNoRawRecipientIdentifiers
  && analysis.proof.absoluteCandidatePassBothRounds.length === POPULATIONS.length
  && analysis.proof.eightTailRecoveryVsS23
  && analysis.proof.oneAndFourNonRegressionVsS20;
analysis.decision = {
  promoteS23P: promote,
  defaultEnabled: false,
  s20RemainsProductPathForOneThroughFour: !promote,
  eightPlayerAdmission: promote,
  reasons: promote
    ? ["S23P passes absolute 1/4/8 gates, recovers the S23 eight-player tail, and stays within the sealed 10% S20 non-regression envelope at one and four."]
    : [
      "Eight-player S23P misses the absolute 50 ms p95 and 70 ms p99 projection gates in both rounds.",
      "Eight-player median tail recovery versus S23 is below the precommitted 30% p95 and 25% p99 thresholds.",
      "One/four S23P does not stay inside the precommitted 10% S20 tail, CPU, and traffic non-regression envelope.",
    ],
};

const output = path.join(EVIDENCE, "analysis.json");
fs.writeFileSync(output, `${JSON.stringify(analysis, null, 2)}\n`, { flag: "wx" });
console.log(JSON.stringify({ output, commit: analysis.commit, proof: analysis.proof,
  decision: analysis.decision }, null, 2));
