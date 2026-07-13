#!/usr/bin/env node
"use strict";

const assert = require("assert");
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const { performance } = require("perf_hooks");
const { publicEntityId } = require("../scripts/canonical-structural-delta.cjs");
const { CODEC_PAIR_TIE_ORDER } = require("../scripts/authority-delta-publisher.cjs");
const { POSITIONAL_CODEC_MANIFEST_HASH, codecContext, encodePositionalFrame,
  composeStatePairCandidates } = require("../scripts/state-pair-positional-codec.cjs");

const ROOT = path.resolve(__dirname, "..");
const ITERATIONS = Number(process.env.LBH_S14_SELECTOR_ITERATIONS || 1000);
const WARMUP = Number(process.env.LBH_S14_SELECTOR_WARMUP || 100);
const MANIFEST_HASH = `sha256:${"9".repeat(64)}`;

function distribution(values) {
  const sorted = [...values].sort((a, b) => a - b);
  const at = (fraction) => sorted[Math.min(sorted.length - 1, Math.floor((sorted.length - 1) * fraction))];
  return { count: sorted.length, mean: sorted.reduce((sum, value) => sum + value, 0) / sorted.length,
    p50: at(0.5), p95: at(0.95), p99: at(0.99), max: sorted.at(-1) };
}

function inputs(iteration) {
  const context = codecContext({ matchId: "match-s14-selector", sessionId: "session-s14-selector",
    authorityIncarnation: 1, recipientId: "member-s14-selector", recipientIncarnation: 1,
    manifestHash: MANIFEST_HASH, codecManifestHash: POSITIONAL_CODEC_MANIFEST_HASH });
  const header = { type: "statePair", pairSchema: "lbh-authority-state-pair-mixed-v1",
    matchId: context.matchId, sessionId: context.sessionId, authorityIncarnation: 1,
    recipientId: context.recipientId, recipientIncarnation: 1, frameId: iteration + 1,
    statePairId: `pair-${iteration}`, snapshotId: `snapshot-${iteration}`, tick: iteration * 6,
    simTime: iteration / 10, eventWatermark: iteration, fieldRevision: iteration,
    overloadMode: "NORMAL", ballparkEpoch: 1, manifestHash: MANIFEST_HASH };
  const entity = (lane, index) => ({ publicEntityId: publicEntityId(lane === "public" ? "player" : "owner", `seat-${index}`),
    category: lane === "public" ? "player" : "owner", sourceId: `seat-${index}`, incarnation: 1,
    lifecycleRevision: iteration, components: lane === "public"
      ? { runtimeMotion: { revision: iteration, value: { wx: index / 10, wy: 0.4, vx: 0.1, vy: -0.2 } } }
      : { ownerState: { revision: iteration, value: { profileId: `pilot-${index}-caf\u00e9-\ud83d\ude80`,
        rigLevels: [1, 0, 0], cargo: Array.from({ length: 8 }, (_, item) => `cargo-${item}`), cargoCount: 8 } } } });
  const keyframe = (lane) => ({ kind: "keyframe", schema: "lbh-canonical-projection-v1",
    resultHash: `sha256:${lane === "public" ? "a" : "b"}${"0".repeat(63)}`,
    projection: { schema: "lbh-canonical-projection-v1", lane, runId: header.matchId,
      authorityEpoch: 1, connectionEpoch: 1, ballparkEpoch: 1, manifestHash: MANIFEST_HASH,
      statePairId: header.statePairId, snapshotId: header.snapshotId, tick: header.tick,
      simTime: header.simTime, eventWatermark: header.eventWatermark, fieldRevision: header.fieldRevision,
      overloadMode: "NORMAL", world: { publicFacts: { formTimes: [null, null, null, null] } },
      entities: Array.from({ length: lane === "public" ? 48 : 1 }, (_, index) => entity(lane, index)) } });
  const delta = (lane) => ({ kind: "delta", schema: "lbh-canonical-structural-delta-v1",
    baseSnapshotId: `snapshot-${Math.max(0, iteration - 1)}`, baseHash: `sha256:${"c".repeat(64)}`,
    resultHash: `sha256:${"d".repeat(64)}`, delta: { schema: "lbh-canonical-structural-delta-v1", lane,
      runId: header.matchId, authorityEpoch: 1, connectionEpoch: 1, ballparkEpoch: 1,
      manifestHash: MANIFEST_HASH, statePairId: header.statePairId,
      baseSnapshotId: `snapshot-${Math.max(0, iteration - 1)}`, snapshotId: header.snapshotId,
      baseHash: `sha256:${"c".repeat(64)}`, resultHash: `sha256:${"d".repeat(64)}`,
      rootOps: [], creates: [], updates: Array.from({ length: lane === "public" ? 48 : 1 }, (_, index) => {
        const item = entity(lane, index);
        return { publicEntityId: item.publicEntityId, incarnation: 1, lifecycleRevision: iteration,
          components: item.components };
      }), despawns: [] } });
  const lanes = { public: { keyframe: keyframe("public"), delta: delta("public") },
    owner: { keyframe: keyframe("owner"), delta: delta("owner") } };
  return { context, entries: CODEC_PAIR_TIE_ORDER.map((kind) => {
    const [publicKind, ownerKind] = kind.split("+").map((part) => part.split("-")[1]);
    return { kind, frame: { ...header, public: lanes.public[publicKind], owner: lanes.owner[ownerKind] } };
  }) };
}

function brute(entries, context) {
  const candidates = entries.map((entry) => {
    const wire = encodePositionalFrame(entry.frame, context);
    return { ...entry, wire, bytes: Buffer.byteLength(wire, "utf8") };
  });
  const chosen = [...candidates].sort((a, b) => a.bytes - b.bytes
    || CODEC_PAIR_TIE_ORDER.indexOf(a.kind) - CODEC_PAIR_TIE_ORDER.indexOf(b.kind))[0];
  return { chosen, bytesExamined: candidates.reduce((sum, entry) => sum + entry.bytes, 0),
    allocationProxyBytes: candidates.reduce((sum, entry) => sum + entry.bytes, 0), fullCandidateCompositions: 4 };
}

function run() {
  for (let index = 0; index < WARMUP; index += 1) {
    const sample = inputs(index);
    brute(sample.entries, sample.context);
    composeStatePairCandidates(sample.entries, sample.context, CODEC_PAIR_TIE_ORDER);
  }
  const rows = { bruteForce: [], composed: [] };
  const operations = { bruteForce: { fullCandidateCompositions: 0, allocationProxyBytes: 0, bytesExamined: 0 },
    composed: { fullCandidateCompositions: 0, winnerSerializations: 0, componentSerializations: 0,
      allocationProxyBytes: 0, bytesExamined: 0 } };
  const transcript = [];
  for (let index = WARMUP; index < WARMUP + ITERATIONS; index += 1) {
    const sample = inputs(index);
    let started = performance.now();
    const before = brute(sample.entries, sample.context);
    rows.bruteForce.push(performance.now() - started);
    started = performance.now();
    const after = composeStatePairCandidates(sample.entries, sample.context, CODEC_PAIR_TIE_ORDER);
    rows.composed.push(performance.now() - started);
    assert.strictEqual(after.chosen.kind, before.chosen.kind);
    assert.strictEqual(after.chosen.wire, before.chosen.wire);
    Object.assign(operations.bruteForce, {
      fullCandidateCompositions: operations.bruteForce.fullCandidateCompositions + 4,
      allocationProxyBytes: operations.bruteForce.allocationProxyBytes + before.allocationProxyBytes,
      bytesExamined: operations.bruteForce.bytesExamined + before.bytesExamined });
    for (const key of Object.keys(operations.composed)) {
      operations.composed[key] += after.diagnostics[key] || 0;
    }
    transcript.push(after.chosen.wire);
  }
  const before = distribution(rows.bruteForce);
  const after = distribution(rows.composed);
  const result = { schema: "lbh-s14-selector-benchmark-v1", iterations: ITERATIONS, warmup: WARMUP,
    workload: { publicEntities: 48, ownerEntities: 1, candidatesPerSelection: 4 },
    before: { method: "S12 brute-force four complete positional wires", milliseconds: before,
      operations: operations.bruteForce },
    after: { method: "S14 exact component sizing and one winner composition", milliseconds: after,
      operations: operations.composed },
    comparison: { meanSpeedup: before.mean / after.mean,
      meanReductionFraction: 1 - after.mean / before.mean,
      allocationProxyReductionFraction: 1 - operations.composed.allocationProxyBytes / operations.bruteForce.allocationProxyBytes },
    parity: { winnerCount: ITERATIONS, mismatches: 0,
      transcriptSha256: crypto.createHash("sha256").update(transcript.join("\n")).digest("hex") } };
  const output = process.env.LBH_S14_SELECTOR_OUTPUT;
  if (output) fs.writeFileSync(path.resolve(ROOT, output), `${JSON.stringify(result, null, 2)}\n`, { flag: "wx" });
  console.log(JSON.stringify(result, null, 2));
}

run();
