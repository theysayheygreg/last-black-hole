#!/usr/bin/env node
"use strict";

const fs = require("fs");
const path = require("path");
const assert = require("assert");
const { validateChecksums } = require("./network/state-pair-product-metrics.cjs");

const ROOT = path.resolve(__dirname, "..");
const EVIDENCE = path.resolve(process.argv[2]
  || path.join(ROOT, "docs", "v0.4", "evidence", "state-pair-s23"));
const ROUNDS = ["round-a", "round-b"];
const POPULATIONS = [1, 4, 8];
const TREATMENTS = ["control-s20", "candidate-s23"];

function read(file) {
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

function scenario(round, treatment, population) {
  const directory = path.join(EVIDENCE, round, treatment);
  const validation = validateChecksums(directory);
  assert(validation.passed, `${round}/${treatment} checksum validation failed`);
  const row = read(path.join(directory, `normal-${population}.json`));
  const cleanup = read(path.join(directory, `cleanup-normal-${population}.json`));
  const body = row.authorityState.statePair?.publicBody?.authority || null;
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
    publicBody: body ? {
      bodyBuilds: body.bodyBuilds, bodyHashes: body.bodyHashes,
      cohortHits: body.cohortHits, cohortBuilds: body.cohortBuilds,
      bodySerializations: body.bodySerializations,
      retainedPublicMaterialBytes: body.retainedPublicMaterialBytes,
      capBytes: body.limits.maxBodyBytes,
      capRespected: body.retainedPublicMaterialBytes <= body.limits.maxBodyBytes,
    } : null,
    gates,
  };
}

function ratio(candidate, control, select) {
  return select(candidate) / select(control);
}

function median(values) {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted.length % 2 ? sorted[Math.floor(sorted.length / 2)]
    : (sorted[sorted.length / 2 - 1] + sorted[sorted.length / 2]) / 2;
}

const rows = ROUNDS.flatMap((round) => TREATMENTS.flatMap((treatment) =>
  POPULATIONS.map((population) => scenario(round, treatment, population))));
const comparisons = POPULATIONS.map((population) => {
  const rounds = ROUNDS.map((round) => {
    const control = rows.find((row) => row.round === round && row.treatment === "control-s20"
      && row.population === population);
    const candidate = rows.find((row) => row.round === round && row.treatment === "candidate-s23"
      && row.population === population);
    return {
      round,
      authorityCadenceRatio: ratio(candidate, control, (row) => row.cadence.authorityMinHz),
      projectionP95Ratio: ratio(candidate, control, (row) => row.performance.projectionP95Ms),
      projectionP99Ratio: ratio(candidate, control, (row) => row.performance.projectionP99Ms),
      authorityCpuRatio: ratio(candidate, control, (row) => row.performance.authorityOneCoreFraction),
      meanTrafficRatio: ratio(candidate, control, (row) => row.traffic.worstRecipientMeanBytesPerSecond),
      p95TrafficRatio: ratio(candidate, control, (row) => row.traffic.oneSecondP95BytesPerSecond),
      candidateGates: candidate.gates,
    };
  });
  const keys = ["authorityCadenceRatio", "projectionP95Ratio", "projectionP99Ratio",
    "authorityCpuRatio", "meanTrafficRatio", "p95TrafficRatio"];
  return { population, rounds, medianRatios: Object.fromEntries(keys.map((key) =>
    [key, median(rounds.map((round) => round[key]))])) };
});

const candidateRows = rows.filter((row) => row.treatment === "candidate-s23");
const analysis = {
  schema: "lbh-s23-public-body-counterbalanced-analysis-v1",
  commit: read(path.join(EVIDENCE, "round-a", "candidate-s23", "run.json")).commit,
  methodology: {
    rounds: [
      { round: "round-a", treatmentOrder: ["control-s20", "candidate-s23"],
        populationOrder: { control: [8, 4, 1], candidate: [1, 4, 8] } },
      { round: "round-b", treatmentOrder: ["candidate-s23", "control-s20"],
        populationOrder: { candidate: [8, 4, 1], control: [1, 4, 8] } },
    ],
    profiler: "off",
    processBoundary: "one authority process plus one isolated client process per recipient",
    thresholds: { minimumCadenceHz: 9, overload: "NORMAL", projectionP95Ms: 50,
      projectionP99Ms: 70, meanBytesPerSecond: 64 * 1024, p95BytesPerSecond: 80 * 1024 },
  },
  rows,
  comparisons,
  proof: {
    everyCandidateCorrectAndClean: candidateRows.every((row) => row.correctnessPassed && row.cleanupPassed),
    oneBuildAndHashCounterPerBody: candidateRows.every((row) =>
      row.publicBody.bodyBuilds === row.publicBody.bodyHashes),
    realFourAndEightRecipientCohortReuse: candidateRows.filter((row) => row.population >= 4)
      .every((row) => row.publicBody.cohortHits > 0),
    boundedCanonicalMaterial: candidateRows.every((row) => row.publicBody.capRespected),
  },
  decision: {
    promoteS23: false,
    defaultEnabled: false,
    s20RemainsProductPathForOneThroughFour: true,
    eightPlayerAdmission: false,
    absoluteCandidatePassBothRounds: POPULATIONS.filter((population) => ROUNDS.every((round) =>
      rows.find((row) => row.round === round && row.treatment === "candidate-s23"
        && row.population === population).gates.passed)),
    reasons: [
      "Four misses the 50 ms projection p95 gate in round A.",
      "Eight recovers NORMAL >=9 Hz cadence but misses both 50 ms p95 and 70 ms p99 projection gates in both rounds.",
      "One remains inside absolute gates but materially regresses S20 CPU, projection tails, and traffic, so one/four non-regression is not proven.",
    ],
    maintenanceVerdict: "Keep the corrected capability and proof harness default-off as a bounded research seam; do not replace S20 or claim eight-player product admission.",
  },
  limitations: ["Machine-local macOS loopback", "Raw WebSocket without TLS",
    "One match at a time", "Twenty-second fixed windows", "No WAN, hosted WSS, fleet packing, AOI, or high-count claim"],
};

const output = path.join(EVIDENCE, "analysis.json");
fs.writeFileSync(output, `${JSON.stringify(analysis, null, 2)}\n`, { flag: "wx" });
console.log(JSON.stringify({ output, commit: analysis.commit, proof: analysis.proof,
  decision: analysis.decision }, null, 2));
