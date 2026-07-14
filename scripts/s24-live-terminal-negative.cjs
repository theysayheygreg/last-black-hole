#!/usr/bin/env node
"use strict";

const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");

const ROOT = path.resolve(__dirname, "..");
const OUTPUT = path.join(ROOT, "docs", "v0.4", "evidence", "s24-live-loopback", "terminal-negative.json");
const RAW = path.join(ROOT, "docs", "v0.4", "evidence", "s24-live-loopback", "raw.json");
const RUNTIME = path.join(ROOT, "scripts", "sim-runtime.cjs");
const PROFILES = path.join(ROOT, "src", "content", "session-profiles.data.json");
const REMOVED_FIXTURE = path.join(ROOT, "scripts", "s24-live-evidence-fixture.cjs");
const REMOVED_TEST = path.join(ROOT, "tests", "s24-live-evidence-eligibility.cjs");
const COMMITS = Object.freeze({
  syntheticSeal: "eaaa811",
  initialEligibilitySeal: "66ab98d",
  guardedSeam: "67afbe8",
  failedDirectionWip: "bdc7668",
  failedDirectionRevert: "4e8395b",
  guardedSeamRevert: "0b3390f",
});

function git(...args) {
  return execFileSync("git", args, { cwd: ROOT, encoding: "utf8" }).trim();
}

function sha256(bytes) {
  return crypto.createHash("sha256").update(bytes).digest("hex");
}

function assertCommit(commit) {
  return git("rev-parse", `${commit}^{commit}`);
}

function buildTerminalNegative() {
  const runtimeBytes = fs.readFileSync(RUNTIME);
  const runtime = runtimeBytes.toString("utf8");
  const profilesBytes = fs.readFileSync(PROFILES);
  const profiles = JSON.parse(profilesBytes);
  const cap = runtime.match(/maxConnections:\s*(\d+)\s*,/);
  if (!cap) throw new Error("could not prove restored runtime adapter cap");
  const profileId = profiles.MAP_SESSION_PROFILES["deep-field"];
  const profile = profiles.SESSION_PROFILES[profileId];
  if (!profile) throw new Error("could not prove restored Deep Field profile");
  const runtimeWebSocketConnections = Number(cap[1]);
  const deepFieldMaxScavengers = profile.maxScavengers;
  if (runtimeWebSocketConnections !== 16) {
    throw new Error(`expected restored runtime adapter cap 16, got ${runtimeWebSocketConnections}`);
  }
  if (deepFieldMaxScavengers !== 7) {
    throw new Error(`expected restored Deep Field scavenger cap 7, got ${deepFieldMaxScavengers}`);
  }
  const chronology = Object.entries(COMMITS).map(([role, commit]) => ({ role, commit: assertCommit(commit) }));
  return {
    schema: "lbh-s24-live-eligibility-terminal-negative-v1",
    status: "not-proven",
    decision: "terminal-negative-no-more-retries",
    summary: "The guarded live H24 direction failed before a 24-client cohort bound; no capacity claim is available.",
    attempts: [
      { ordinal: 1, publicFaunaType: "s24-load", productionSchemaValidType: false,
        observed: "First isolated client received generic authority-error after manifest ACK during state-pair admission.",
        cohortBound: false },
      { ordinal: 2, publicFaunaType: "jelly", productionSchemaValidType: true,
        observed: "First isolated client received generic authority-error after manifest ACK during state-pair admission.",
        cohortBound: false },
    ],
    observedBoundaries: {
      defaultRuntimeWebSocketConnections: runtimeWebSocketConnections,
      defaultDeepFieldMaxScavengers: deepFieldMaxScavengers,
      defaultBoundaryTestPassedBeforeEachAdmissionAttempt: true,
      twentyFourClientCohortBound: false,
      rawArtifactPresent: fs.existsSync(RAW),
      rawCapture: {
        operatorReportedStarted: false,
        repositoryCanProveHistoricalNonExecution: false,
        note: "Repository state proves raw.json is absent; the orchestrator reports the raw command was never started.",
      },
    },
    rootCause: {
      observed: false,
      reason: "The adapter emitted a public generic authority-error and intentionally redacted the internal exception.",
      unprovenHypotheses: [
        "The evidence-only s24EvidenceBody property may have entered public projection shape.",
        "Another public projection validation, representation, or size boundary may have rejected the state pair.",
      ],
      claimBoundary: "No hypothesis is promoted to cause because the internal exception was not observed and retries are forbidden.",
    },
    topologyTarget: {
      matches: 1, logicalGameplayWritersPerMatch: 1, workers: 0,
      note: "Concurrent matches remain independent authorities; this failed lane did not create another writer.",
    },
    cleanup: {
      failedFixturePreservedInHistory: true,
      liveTreeFixtureRemoved: !fs.existsSync(REMOVED_FIXTURE) && !fs.existsSync(REMOVED_TEST),
      rawRunForbiddenAfterTerminalDecision: true,
    },
    syntheticPreflight: {
      commit: COMMITS.syntheticSeal,
      artifactSha256: "b15bd3a1037f710c0643fda6b0eb14f47bed16d32b32685fcc5a96752364f9d4",
      status: "synthetic-factor-screen-only",
      limitations: [
        "No live sockets, paced authority, actual process CPU, or observed on-wire traffic.",
        "H48/H96 remain extrapolations and are not promoted by this terminal negative.",
        "The synthetic S24 gate remains false and is not a capacity claim.",
      ],
    },
    retryDisposition: "Root forbids additional fixture patches, eligibility attempts, and raw captures in this lane.",
    chronology,
    provenance: {
      branch: git("branch", "--show-current"), commit: git("rev-parse", "HEAD"),
      runtime: { path: path.relative(ROOT, RUNTIME), sha256: sha256(runtimeBytes) },
      profiles: { path: path.relative(ROOT, PROFILES), sha256: sha256(profilesBytes) },
      generator: { path: path.relative(ROOT, __filename), sha256: sha256(fs.readFileSync(__filename)) },
    },
  };
}

function main() {
  const result = buildTerminalNegative();
  if (process.argv.includes("--write")) {
    if (fs.existsSync(OUTPUT)) throw new Error(`refusing to overwrite ${OUTPUT}`);
    fs.writeFileSync(OUTPUT, `${JSON.stringify(result, null, 2)}\n`, { flag: "wx" });
  }
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
}

if (require.main === module) main();
module.exports = { COMMITS, OUTPUT, RAW, buildTerminalNegative };
