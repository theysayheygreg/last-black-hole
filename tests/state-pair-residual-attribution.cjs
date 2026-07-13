#!/usr/bin/env node
"use strict";

const assert = require("assert");
const { analyzeStatePairSample, tokenComposition } = require("./network/state-pair-residual-attribution.cjs");

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    passed += 1;
    console.log(`  PASS: ${name}`);
  } catch (error) {
    failed += 1;
    console.error(`  FAIL: ${name}\n    ${error.stack || error.message}`);
  }
}

function projection(lane, components) {
  return {
    schema: "lbh-canonical-projection-v1", lane, runId: "run", authorityEpoch: 1,
    connectionEpoch: 1, ballparkEpoch: 1, manifestHash: "sha256:manifest", statePairId: "pair-2",
    snapshotId: "snapshot-2", tick: 2, simTime: 1, eventWatermark: 0, fieldRevision: 1,
    overloadMode: "NORMAL", world: {}, entities: [{ publicEntityId: `${lane}:one`, category: lane,
      sourceId: lane, incarnation: 1, lifecycleRevision: 1, components }],
  };
}

function sampleFrame() {
  const publicDelta = {
    schema: "lbh-canonical-structural-delta-v1", lane: "public", runId: "run",
    authorityEpoch: 1, connectionEpoch: 1, ballparkEpoch: 1, manifestHash: "sha256:manifest",
    baseSnapshotId: "snapshot-1", snapshotId: "snapshot-2", statePairId: "pair-2",
    baseHash: "sha256:base", resultHash: "sha256:result",
    rootOps: [{ op: "set", path: ["tick"], value: 2 }],
    creates: [],
    updates: [{ publicEntityId: "6:player3:one", incarnation: 1, lifecycleRevision: 2,
      components: { motion: { revision: 2, value: { x: 1.25, y: -2.5 } } } }],
    despawns: [],
  };
  return {
    type: "statePair", pairSchema: "lbh-authority-state-pair-mixed-v1", matchId: "run",
    sessionId: "session", authorityIncarnation: 1, recipientId: "recipient", recipientIncarnation: 1,
    frameId: 2, statePairId: "pair-2", snapshotId: "snapshot-2", tick: 2, simTime: 1,
    eventWatermark: 0, fieldRevision: 1, overloadMode: "NORMAL", ballparkEpoch: 1,
    manifestHash: "sha256:manifest",
    public: { kind: "delta", schema: publicDelta.schema, baseSnapshotId: "snapshot-1",
      baseHash: "sha256:base", resultHash: "sha256:result", delta: publicDelta },
    owner: { kind: "keyframe", schema: "lbh-canonical-projection-v1", resultHash: "sha256:owner",
      projection: projection("owner", {
        ownerState: { revision: 1, value: { secretCallsign: "PRIVATE-CANARY", cargo: ["hidden"] } },
        transient: { revision: 1, value: { lastInputSeq: 2 } },
        surpriseSecretName: { revision: 1, value: "PRIVATE-CANARY-2" },
      }) },
  };
}

test("exact lane, public-operation, and owner-keyframe totals reconcile", () => {
  const wire = JSON.stringify(sampleFrame());
  const result = analyzeStatePairSample([wire]);
  assert.strictEqual(result.exactLaneReconciliation.passed, true);
  assert.strictEqual(result.publicDelta.operationClassReconciliation.passed, true);
  assert.strictEqual(result.ownerKeyframe.reconciliation.passed, true);
  assert.strictEqual(result.sample.encodedPairBytes, Buffer.byteLength(wire));
});

test("owner values and unapproved component names never enter safe evidence", () => {
  const result = analyzeStatePairSample([JSON.stringify(sampleFrame())]);
  const evidence = JSON.stringify(result);
  assert(!evidence.includes("PRIVATE-CANARY"));
  assert(!evidence.includes("surpriseSecretName"));
  assert(evidence.includes("<redacted-component>"));
});

test("public attribution exposes operation, root, entity, component, and token views", () => {
  const result = analyzeStatePairSample([JSON.stringify(sampleFrame())]);
  assert(result.publicDelta.operationClasses.some((row) => row.operationClass === "unchangedProtocolOverhead"));
  assert(result.publicDelta.rootFields.some((row) => row.rootField === "tick"));
  assert(result.publicDelta.entityTypes.some((row) => row.entityType === "player"));
  assert(result.publicDelta.components.some((row) => row.component === "motion"));
  assert(result.publicDelta.tokenComposition.numericPayloadBytes > 0);
  assert(result.publicDelta.tokenComposition.identifierAndKeyBytes > 0);
  assert.strictEqual(result.publicDelta.updateLexicalComposition.reconciliation.passed, true);
  assert(result.publicDelta.updateLexicalComposition.componentPayloads.numericPayloadBytes > 0);
  assert(result.publicDelta.updateLexicalComposition.entityEnvelopes.identifierAndKeyBytes > 0);
});

test("token composition is exact including delimiter overhead", () => {
  const value = { alpha: [1, "two", false, null] };
  const result = tokenComposition(value);
  assert.strictEqual(result.totalBytes, result.identifierAndKeyBytes + result.stringPayloadBytes
    + result.numericPayloadBytes + result.booleanAndNullPayloadBytes + result.delimiterBytes);
});

console.log(`\nStatePairResidualAttribution: ${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
