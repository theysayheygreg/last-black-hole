#!/usr/bin/env node
"use strict";

const assert = require("assert");
const fs = require("fs");
const path = require("path");
const {
  ABORT_P95_MS,
  COMMITS,
  EXPECTED_COMPOSITE_SHA256,
  REMOVED_FILES,
  REVERT_PAIRS,
  buildTerminalNegative,
} = require("../scripts/split-public-fragment-terminal-negative.cjs");

const ROOT = path.resolve(__dirname, "..");
const result = buildTerminalNegative();
assert.strictEqual(result.schema, "lbh-split-public-fragment-terminal-negative-v1");
assert.strictEqual(result.status, "rejected-reverted");
assert.strictEqual(result.decision, "eight-player-v0.4-closed-cap-four");
assert.strictEqual(result.artifact.sha256, EXPECTED_COMPOSITE_SHA256);
assert.strictEqual(result.screen.population, 8);
assert.strictEqual(result.screen.projectionPublishP95Ms, 55.90450000000055);
assert.strictEqual(result.screen.declaredAbortWhenP95MsAbove, ABORT_P95_MS);
assert.match(result.screen.thresholdProvenance, /not encoded in the raw artifact/);
assert.strictEqual(result.screen.independentlyCrossedAbortGate, true);
assert.strictEqual(result.screen.receiverCadenceHz, 9.666666666666666);
assert.strictEqual(result.screen.worstRecipientMeanDownlinkBytesPerSecond, 49386.666666666664);
assert.strictEqual(result.screen.oneSecondRecipientWindowP95BytesPerSecond, 49922);
assert.strictEqual(result.screen.authorityOneCoreFraction, 0.5097349493873202);
assert.strictEqual(result.screen.overload, "NORMAL");
assert.strictEqual(result.instrumentationLimitation.rawLogicalPairCountUsable, false);
assert.strictEqual(result.instrumentationLimitation.rawCorrectnessFailureIsNotSemanticFailure, true);
assert.match(result.instrumentationLimitation.reason, /fragment and overlay physical wires/);
assert.strictEqual(result.claimBoundary.semanticAndPrivacyClaims, "focused prototype tests only");
assert.strictEqual(result.claimBoundary.sealedTwentySecondCaptureRan, false);
assert.match(result.claimBoundary.redTeamDisposition, /no exploit or leak was observed/);
assert.strictEqual(result.topology.logicalGameplayAuthoritiesPerMatch, 1);
assert.strictEqual(result.topology.concurrentMatchesMultiplyIsolatedAuthorities, true);
assert.strictEqual(result.nextPhase, "hosted identity placement cost and unit economics");
assert.deepStrictEqual(result.chronology.map((record) => record.role), Object.keys(COMMITS));
assert.strictEqual(result.revertProof.pairs.length, REVERT_PAIRS.length);
assert.strictEqual(result.revertProof.baselineTree, result.revertProof.restoredTree);
assert.strictEqual(result.instrumentationLimitation.causeProvenFromHistory, true);
for (const relative of REMOVED_FILES) assert.strictEqual(fs.existsSync(path.join(ROOT, relative)), false);
assert.strictEqual(result.liveSource.sourceMatches, 0);
console.log("split public-fragment terminal negative artifact and live-source absence passed");
