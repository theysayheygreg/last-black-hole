#!/usr/bin/env node
"use strict";

const assert = require("assert");
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const { CODEC_PAIR_TIE_ORDER, testExactCanonicalCandidateSizesWithReuse,
  testExactCanonicalLaneCandidateSizesWithReuse } =
  require("../scripts/authority-delta-publisher.cjs");
const { canonicalJsonBytes } = require("../scripts/session-replication-manifest.cjs");
const { POSITIONAL_CODEC_MANIFEST_HASH, codecContext, encodePositionalFrame,
  decodePositionalFrame, composeStatePairCandidates } = require("../scripts/state-pair-positional-codec.cjs");

const ROOT = path.resolve(__dirname, "..");
const MANIFEST_HASH = `sha256:${"8".repeat(64)}`;
const markers = ["plain-ascii", "café-🚀-漢字", "quote-\"-slash-\\-controls-\n\t\u0000",
  "x".repeat(8192), "🚀".repeat(2048)];

function sample(index, marker = markers[index % markers.length]) {
  const context = codecContext({ matchId: "match-s15-adversarial", sessionId: "session-s15-adversarial",
    authorityIncarnation: 3, recipientId: "member-s15-adversarial", recipientIncarnation: 2,
    manifestHash: MANIFEST_HASH, codecManifestHash: POSITIONAL_CODEC_MANIFEST_HASH });
  const header = { type: "statePair", pairSchema: "lbh-authority-state-pair-mixed-v1",
    matchId: context.matchId, sessionId: context.sessionId, authorityIncarnation: context.authorityIncarnation,
    recipientId: context.recipientId, recipientIncarnation: context.recipientIncarnation, frameId: index + 1,
    statePairId: `pair-${index}`, snapshotId: `snapshot-${index}`, tick: index * 6,
    simTime: index / 10, eventWatermark: index, fieldRevision: index, overloadMode: "NORMAL",
    ballparkEpoch: 1, manifestHash: MANIFEST_HASH };
  const hash = (character) => `sha256:${character.repeat(64)}`;
  const keyframe = (lane) => ({ kind: "keyframe", schema: "lbh-canonical-projection-v1",
    resultHash: hash(lane === "public" ? "a" : "b"), projection: {
      schema: "lbh-canonical-projection-v1", lane, runId: header.matchId,
      authorityEpoch: header.authorityIncarnation, connectionEpoch: header.recipientIncarnation,
      ballparkEpoch: header.ballparkEpoch, manifestHash: header.manifestHash,
      statePairId: header.statePairId, snapshotId: header.snapshotId, tick: header.tick,
      simTime: header.simTime, eventWatermark: header.eventWatermark, fieldRevision: header.fieldRevision,
      overloadMode: header.overloadMode, world: { publicFacts: { profileId: marker } }, entities: [] } });
  const delta = (lane) => ({ kind: "delta", schema: "lbh-canonical-structural-delta-v1",
    baseSnapshotId: `base-${index}`, baseHash: hash("c"), resultHash: hash("d"), delta: {
      schema: "lbh-canonical-structural-delta-v1", lane, runId: header.matchId,
      authorityEpoch: header.authorityIncarnation, connectionEpoch: header.recipientIncarnation,
      ballparkEpoch: header.ballparkEpoch, manifestHash: header.manifestHash,
      statePairId: header.statePairId, baseSnapshotId: `base-${index}`,
      snapshotId: header.snapshotId, baseHash: hash("c"), resultHash: hash("d"),
      rootOps: [{ op: "set", path: ["publicFacts"], value: { profileId: marker } }],
      creates: [], updates: [], despawns: [] } });
  const lanes = { public: { keyframe: keyframe("public"), delta: delta("public") },
    owner: { keyframe: keyframe("owner"), delta: delta("owner") } };
  const entries = CODEC_PAIR_TIE_ORDER.map((kind) => {
    const [publicKind, ownerKind] = kind.split("+").map((part) => part.split("-")[1]);
    return { kind, frame: { ...header, public: lanes.public[publicKind], owner: lanes.owner[ownerKind] } };
  });
  return { context, header, lanes, entries };
}

function errorCode(run) {
  try { run(); return null; } catch (error) { return error.code || error.name; }
}

function run() {
  const transcript = [];
  let candidates = 0;
  let boundaryChecks = 0;
  for (let index = 0; index < 80; index += 1) {
    const { context, header, lanes, entries } = sample(index);
    const oracleExpanded = Object.fromEntries(entries.map((entry) => [entry.kind, canonicalJsonBytes(entry.frame).length]));
    const reused = testExactCanonicalCandidateSizesWithReuse(entries);
    const lazyExpanded = testExactCanonicalLaneCandidateSizesWithReuse(header, lanes);
    assert.deepStrictEqual(reused.sizes, oracleExpanded);
    assert.deepStrictEqual(lazyExpanded.sizes, oracleExpanded,
      "lazy expanded sizes must match brute-force canonical JSON for all four candidates");
    assert.deepStrictEqual(lazyExpanded.sizes, reused.sizes,
      "lazy and eager same-operation size proofs must be exact peers");
    assert.strictEqual(reused.diagnostics.laneSerializations, 0);
    assert.strictEqual(reused.diagnostics.laneSerializationReuses, 4);
    assert.strictEqual(lazyExpanded.diagnostics.laneSerializations, 0);
    assert.strictEqual(lazyExpanded.diagnostics.laneSerializationReuses, 4);
    assert.strictEqual(lazyExpanded.diagnostics.outerCandidateDescriptors, 4);
    assert.strictEqual(lazyExpanded.diagnostics.outerCandidateFrames, 0);
    const positional = composeStatePairCandidates(entries, context, CODEC_PAIR_TIE_ORDER);
    const oraclePositional = entries.map((entry) => ({ kind: entry.kind,
      wire: encodePositionalFrame(entry.frame, context) }));
    assert.deepStrictEqual(positional.candidates, oraclePositional.map((entry) => ({ kind: entry.kind,
      bytes: Buffer.byteLength(entry.wire, "utf8") })));
    const expected = [...oraclePositional].sort((a, b) => Buffer.byteLength(a.wire, "utf8")
      - Buffer.byteLength(b.wire, "utf8") || CODEC_PAIR_TIE_ORDER.indexOf(a.kind) - CODEC_PAIR_TIE_ORDER.indexOf(b.kind))[0];
    assert.strictEqual(positional.chosen.kind, expected.kind);
    assert.strictEqual(positional.chosen.wire, expected.wire);
    assert.deepStrictEqual(decodePositionalFrame(positional.chosen.wire, context), positional.chosen.frame);
    const boundary = Math.max(...Object.values(oracleExpanded));
    const acceptedBoundary = testExactCanonicalCandidateSizesWithReuse(entries, boundary);
    const rejectedBoundary = testExactCanonicalCandidateSizesWithReuse(entries, boundary - 1);
    const lazyAcceptedBoundary = testExactCanonicalLaneCandidateSizesWithReuse(header, lanes, boundary);
    const lazyRejectedBoundary = testExactCanonicalLaneCandidateSizesWithReuse(header, lanes, boundary - 1);
    assert.strictEqual(acceptedBoundary.limit.accepted, true);
    assert.strictEqual(rejectedBoundary.limit.accepted, false);
    assert(rejectedBoundary.limit.oversizeKinds.length > 0);
    assert.deepStrictEqual(lazyAcceptedBoundary.limit, acceptedBoundary.limit,
      "lazy expanded limit must accept the exact all-candidate boundary");
    assert.deepStrictEqual(lazyRejectedBoundary.limit, rejectedBoundary.limit,
      "lazy expanded limit must reject the same losing candidates one byte below the boundary");
    boundaryChecks += 4;
    transcript.push({ expanded: oracleExpanded, positional: positional.candidates,
      chosen: positional.chosen.kind, wireDigest: crypto.createHash("sha256")
        .update(positional.chosen.wire, "utf8").digest("hex"), diagnostics: reused.diagnostics,
      lazyDiagnostics: lazyExpanded.diagnostics });
    candidates += entries.length;
  }
  const invalid = [undefined, NaN, Infinity, -Infinity].map((value, index) => {
    const { header, lanes, entries } = sample(100 + index);
    entries[0].frame.public.projection.world.publicFacts.invalid = value;
    const oracle = errorCode(() => canonicalJsonBytes(entries[0].frame));
    const candidate = errorCode(() => testExactCanonicalCandidateSizesWithReuse(entries));
    const lazyCandidate = errorCode(() => testExactCanonicalLaneCandidateSizesWithReuse(header, lanes));
    assert.strictEqual(candidate, oracle);
    assert.strictEqual(lazyCandidate, oracle);
    assert(oracle !== null);
    return { value: value === undefined ? "undefined" : String(value), oracle, candidate, lazyCandidate };
  });
  const result = { schema: "lbh-s17-lazy-expanded-size-adversarial-v1", cases: 80,
    candidateComparisons: candidates, exactExpandedComparisons: candidates,
    exactLazyExpandedComparisons: candidates, exactPositionalComparisons: candidates,
    semanticDecodes: 80, boundaryChecks,
    invalidCanonicalCases: invalid, mismatches: 0,
    transcriptSha256: crypto.createHash("sha256").update(JSON.stringify(transcript)).digest("hex") };
  const output = process.env.LBH_S15_ADVERSARIAL_OUTPUT;
  if (output) fs.writeFileSync(path.resolve(ROOT, output), `${JSON.stringify(result, null, 2)}\n`, { flag: "wx" });
  console.log(JSON.stringify(result, null, 2));
}

run();
