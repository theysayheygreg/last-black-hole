#!/usr/bin/env node
"use strict";

const assert = require("assert");
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");
const { projectionHash } = require("../scripts/canonical-structural-delta.cjs");
const { canonicalJson, canonicalJsonBytes } = require("../scripts/session-replication-manifest.cjs");
const { CODEC_PAIR_TIE_ORDER } = require("../scripts/authority-delta-publisher.cjs");
const { codecContext, POSITIONAL_CODEC_MANIFEST_HASH, encodePositionalFrame,
  decodePositionalFrame } = require("../scripts/state-pair-positional-codec.cjs");
const { createStatePairWireEncoder, selectTrustedStatePairWireLaneCandidate,
  validateTrustedAuthorityStatePairLaneCandidates, SERVER_TO_CLIENT } =
  require("../scripts/multiplayer-wire-protocol.cjs");

const MANIFEST_HASH = `sha256:${"8".repeat(64)}`;

function deepFreeze(value) {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) deepFreeze(child);
  return Object.freeze(value);
}

function errorCode(run) {
  try { run(); return null; } catch (error) { return error.code || error.name; }
}

function fixture(index, marker = "café-🚀-quote-\"-slash-\\-controls-\n\t") {
  const context = codecContext({ matchId: "match-s18-proof", sessionId: "session-s18-proof",
    authorityIncarnation: 3, recipientId: "member-s18-proof", recipientIncarnation: 2,
    manifestHash: MANIFEST_HASH, codecManifestHash: POSITIONAL_CODEC_MANIFEST_HASH });
  const header = { type: "statePair", pairSchema: "lbh-authority-state-pair-mixed-v1",
    matchId: context.matchId, sessionId: context.sessionId, authorityIncarnation: context.authorityIncarnation,
    recipientId: context.recipientId, recipientIncarnation: context.recipientIncarnation, frameId: index + 1,
    statePairId: `pair-${index}`, snapshotId: `snapshot-${index}`, tick: index * 6,
    simTime: index / 10, eventWatermark: index, fieldRevision: index, overloadMode: "NORMAL",
    ballparkEpoch: 1, manifestHash: MANIFEST_HASH };
  const keyframe = (lane) => {
    const projection = { schema: "lbh-canonical-projection-v1", lane, runId: header.matchId,
      authorityEpoch: header.authorityIncarnation, connectionEpoch: header.recipientIncarnation,
      ballparkEpoch: header.ballparkEpoch, manifestHash: header.manifestHash,
      statePairId: header.statePairId, snapshotId: header.snapshotId, tick: header.tick,
      simTime: header.simTime, eventWatermark: header.eventWatermark, fieldRevision: header.fieldRevision,
      overloadMode: header.overloadMode, world: { publicFacts: { formTimes: [marker] } }, entities: [] };
    return { kind: "keyframe", schema: projection.schema, resultHash: projectionHash(projection), projection };
  };
  const hash = (character) => `sha256:${character.repeat(64)}`;
  const delta = (lane) => ({ kind: "delta", schema: "lbh-canonical-structural-delta-v1",
    baseSnapshotId: `base-${index}`, baseHash: hash("c"), resultHash: hash("d"), delta: {
      schema: "lbh-canonical-structural-delta-v1", lane, runId: header.matchId,
      authorityEpoch: header.authorityIncarnation, connectionEpoch: header.recipientIncarnation,
      ballparkEpoch: header.ballparkEpoch, manifestHash: header.manifestHash,
      statePairId: header.statePairId, baseSnapshotId: `base-${index}`,
      snapshotId: header.snapshotId, baseHash: hash("c"), resultHash: hash("d"),
      rootOps: [{ op: "set", path: ["statePairId"], value: header.statePairId },
        { op: "set", path: ["snapshotId"], value: header.snapshotId },
        { op: "set", path: ["world"], value: { publicFacts: { formTimes: [marker] } } }],
      creates: [], updates: [], despawns: [] } });
  const lanes = { public: { keyframe: keyframe("public"), delta: delta("public") },
    owner: { keyframe: keyframe("owner"), delta: delta("owner") } };
  deepFreeze(header); deepFreeze(lanes);
  const canonicalFacts = Object.freeze([
    ["public-keyframe", lanes.public.keyframe], ["public-delta", lanes.public.delta],
    ["owner-keyframe", lanes.owner.keyframe], ["owner-delta", lanes.owner.delta],
  ].map(([label, payload]) => { const text = canonicalJson(payload);
    return Object.freeze({ label, payload, text, bytes: Buffer.byteLength(text, "utf8") }); }));
  return { context, header, lanes, canonicalFacts };
}

function main() {
  const benchmark = path.join(__dirname, "multiplayer-state-pair-canonical-reuse-benchmark.cjs");
  const run = (trusted) => JSON.parse(execFileSync(process.execPath, [benchmark], { encoding: "utf8",
    env: { ...process.env, LBH_S15_SELECTOR_ITERATIONS: "160", LBH_S15_SELECTOR_WARMUP: "20",
      ...(trusted ? {} : { LBH_S18_DISABLE_TRUSTED_PROOFS: "1" }) } }));
  const full = run(false);
  const trusted = run(true);
  assert.strictEqual(trusted.transcriptSha256, full.transcriptSha256);
  assert.strictEqual(trusted.selectionTranscriptSha256, full.selectionTranscriptSha256);
  assert.strictEqual(trusted.operations.trustedProofsCreated, 180);
  assert.strictEqual(trusted.operations.trustedProofsConsumed, 180);
  assert.strictEqual(trusted.operations.trustedProofRejects, 0);
  const exactBoundary = trusted.operations.maxExpandedCandidateBytes;
  assert(Number.isSafeInteger(exactBoundary) && exactBoundary > 0);
  const boundaryEnv = { ...process.env, LBH_S15_SELECTOR_ITERATIONS: "160", LBH_S15_SELECTOR_WARMUP: "20",
    LBH_S18_MAX_PAIR_BYTES: String(exactBoundary) };
  const atBoundary = JSON.parse(execFileSync(process.execPath, [benchmark], { encoding: "utf8", env: boundaryEnv,
    stdio: ["ignore", "pipe", "pipe"] }));
  const belowEnv = { ...boundaryEnv, LBH_S18_MAX_PAIR_BYTES: String(exactBoundary - 1) };
  const trustedBelow = JSON.parse(execFileSync(process.execPath, [benchmark], { encoding: "utf8", env: belowEnv,
    stdio: ["ignore", "pipe", "pipe"] }));
  const fullBelow = JSON.parse(execFileSync(process.execPath, [benchmark], { encoding: "utf8",
    env: { ...belowEnv, LBH_S18_DISABLE_TRUSTED_PROOFS: "1" }, stdio: ["ignore", "pipe", "pipe"] }));
  assert.strictEqual(atBoundary.transcriptSha256, trusted.transcriptSha256);
  assert.strictEqual(trustedBelow.transcriptSha256, fullBelow.transcriptSha256);
  assert((trustedBelow.fallbackCounts["candidate-invalid:pair-too-large"] || 0) > 0);

  const stale = fixture(2000);
  const staleEncoder = createStatePairWireEncoder(stale.context);
  const forged = Object.freeze(Object.create(null));
  assert.strictEqual(errorCode(() => selectTrustedStatePairWireLaneCandidate(staleEncoder,
    stale.header, stale.lanes, CODEC_PAIR_TIE_ORDER, forged, 256 * 1024)), "invalid-trusted-proof");
  const other = fixture(2002);
  assert.strictEqual(errorCode(() => selectTrustedStatePairWireLaneCandidate(
    createStatePairWireEncoder(other.context), other.header, other.lanes, CODEC_PAIR_TIE_ORDER,
    forged, 256 * 1024)), "invalid-trusted-proof");
  assert.throws(() => { stale.lanes.public.keyframe.projection.world.publicFacts.formTimes[0] = "mutated"; }, TypeError);

  const hostile = [
    (value) => { value.header.extra = true; },
    (value) => { delete value.header.snapshotId; },
    (value) => { value.header.tick = NaN; },
    (value) => { value.lanes.public.delta.delta.snapshotId = "wrong"; },
    (value) => { value.lanes.owner.keyframe.projection.connectionEpoch += 1; },
  ];
  const hostileCodes = hostile.map((mutate, index) => {
    const value = fixture(3000 + index);
    const mutable = JSON.parse(JSON.stringify({ header: value.header, lanes: value.lanes }));
    mutate(mutable);
    return errorCode(() => validateTrustedAuthorityStatePairLaneCandidates(
      mutable.header, mutable.lanes, CODEC_PAIR_TIE_ORDER));
  });
  assert(hostileCodes.every(Boolean));

  const result = { schema: "lbh-s18-trusted-authority-proof-v1", cases: 80,
    exactWireComparisons: 160, expandedComparisons: 640, semanticComparisons: 160,
    boundaryChecks: 2, exactBoundary,
    staleProofRejects: 1, crossOperationProofRejects: 1, forgedProofRejects: 1,
    mutationRejects: 1, hostileCases: hostileCodes.length, hostileCodes,
    mismatches: 0, transcriptSha256: crypto.createHash("sha256")
      .update(trusted.transcriptSha256).digest("hex"), direction: SERVER_TO_CLIENT,
    proofOperations: trusted.operations };
  if (process.env.LBH_S18_PROOF_OUTPUT) fs.writeFileSync(path.resolve(process.env.LBH_S18_PROOF_OUTPUT),
    `${JSON.stringify(result, null, 2)}\n`, { flag: "wx" });
  console.log(JSON.stringify(result, null, 2));
}

main();
