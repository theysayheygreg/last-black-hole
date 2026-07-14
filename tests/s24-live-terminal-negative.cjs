#!/usr/bin/env node
"use strict";

const assert = require("assert");
const fs = require("fs");
const path = require("path");
const { COMMITS, OUTPUT, RAW, buildTerminalNegative } =
  require("../scripts/s24-live-terminal-negative.cjs");

const ROOT = path.resolve(__dirname, "..");
const result = buildTerminalNegative();
assert.strictEqual(result.schema, "lbh-s24-live-eligibility-terminal-negative-v1");
assert.strictEqual(result.status, "not-proven");
assert.strictEqual(result.decision, "terminal-negative-no-more-retries");
assert.strictEqual(result.attempts.length, 2);
assert(result.attempts.every((attempt) => attempt.observed.includes("generic authority-error after manifest ACK")));
assert.strictEqual(result.attempts[0].publicFaunaType, "s24-load");
assert.strictEqual(result.attempts[0].productionSchemaValidType, false);
assert.strictEqual(result.attempts[1].publicFaunaType, "jelly");
assert.strictEqual(result.attempts[1].productionSchemaValidType, true);
assert(result.attempts.every((attempt) => attempt.cohortBound === false));
assert.strictEqual(result.observedBoundaries.defaultRuntimeWebSocketConnections, 16);
assert.strictEqual(result.observedBoundaries.defaultDeepFieldMaxScavengers, 7);
assert.strictEqual(result.observedBoundaries.twentyFourClientCohortBound, false);
assert.strictEqual(result.observedBoundaries.rawArtifactPresent, false);
assert.strictEqual(fs.existsSync(RAW), false);
assert.strictEqual(result.observedBoundaries.rawCapture.operatorReportedStarted, false);
assert.strictEqual(result.observedBoundaries.rawCapture.repositoryCanProveHistoricalNonExecution, false);
assert.strictEqual(result.rootCause.observed, false);
assert(result.rootCause.claimBoundary.startsWith("No hypothesis is promoted"));
assert.strictEqual(result.topologyTarget.logicalGameplayWritersPerMatch, 1);
assert.strictEqual(result.topologyTarget.workers, 0);
assert.strictEqual(result.cleanup.liveTreeFixtureRemoved, true);
assert.strictEqual(result.syntheticPreflight.status, "synthetic-factor-screen-only");
assert(result.syntheticPreflight.limitations.some((line) => line.includes("not a capacity claim")));
assert.deepStrictEqual(result.chronology.map((row) => row.role), Object.keys(COMMITS));
assert(!fs.existsSync(path.join(ROOT, "scripts", "s24-live-evidence-fixture.cjs")));
assert(!fs.existsSync(path.join(ROOT, "tests", "s24-live-evidence-eligibility.cjs")));
const serialized = JSON.stringify(result);
assert(!serialized.includes("s24-eligibility-seat-"));
assert(!/commandCredential|admissionTicket|joinTicket|membershipId/.test(serialized));
if (fs.existsSync(OUTPUT)) {
  const artifact = JSON.parse(fs.readFileSync(OUTPUT, "utf8"));
  assert.strictEqual(artifact.schema, result.schema);
  assert.strictEqual(artifact.status, "not-proven");
  assert.deepStrictEqual(artifact.attempts, result.attempts);
  assert.deepStrictEqual(artifact.rootCause, result.rootCause);
}
console.log("s24 terminal negative claim boundary passed");
