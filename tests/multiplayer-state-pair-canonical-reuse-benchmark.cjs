#!/usr/bin/env node
"use strict";

const assert = require("assert");
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const { performance } = require("perf_hooks");
const { execFileSync } = require("child_process");

const ROOT = path.resolve(__dirname, "..");
const MODULE_ROOT = path.resolve(process.env.LBH_S15_MODULE_ROOT || ROOT);
const ITERATIONS = Number(process.env.LBH_S15_SELECTOR_ITERATIONS || 1000);
const WARMUP = Number(process.env.LBH_S15_SELECTOR_WARMUP || 100);
const { createAuthorityDeltaPublisher } = require(path.join(MODULE_ROOT, "scripts", "authority-delta-publisher.cjs"));
const { POSITIONAL_CODEC_MANIFEST_HASH, codecContext } =
  require(path.join(MODULE_ROOT, "scripts", "state-pair-positional-codec.cjs"));
const { createStatePairWireEncoder, parseWireFrame, SERVER_TO_CLIENT } =
  require(path.join(MODULE_ROOT, "scripts", "multiplayer-wire-protocol.cjs"));

const MANIFEST_HASH = `sha256:${"9".repeat(64)}`;
const identity = Object.freeze({ matchId: "match-s15-selector", sessionId: "session-s15-selector",
  authorityIncarnation: 1, recipientId: "member-s15-selector", recipientIncarnation: 1 });

function fileSha(file) {
  return crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
}

function git(...args) {
  return execFileSync("git", args, { cwd: ROOT, encoding: "utf8" }).trim();
}

function distribution(values) {
  const sorted = [...values].sort((a, b) => a - b);
  const at = (fraction) => sorted[Math.min(sorted.length - 1, Math.floor((sorted.length - 1) * fraction))];
  return { count: sorted.length, mean: sorted.reduce((sum, value) => sum + value, 0) / sorted.length,
    p50: at(0.5), p95: at(0.95), p99: at(0.99), max: sorted.at(-1) };
}

function component(revision, value) { return { revision, value }; }

function views(beat) {
  const shared = { schema: "lbh-canonical-projection-v1", runId: identity.matchId,
    authorityEpoch: identity.authorityIncarnation, connectionEpoch: identity.recipientIncarnation,
    ballparkEpoch: 1, manifestHash: MANIFEST_HASH, statePairId: `pair-${beat}`,
    snapshotId: `snapshot-${beat}`, tick: beat * 6, simTime: beat / 10,
    eventWatermark: beat, fieldRevision: beat, overloadMode: "NORMAL" };
  const publicView = { ...shared, lane: "public", world: { publicFacts: { formTimes: [null, null, null, null] } },
    entities: Array.from({ length: 48 }, (_, index) => ({ category: "player", sourceId: `seat-${index}`,
      incarnation: 1, lifecycleRevision: beat, components: { runtimeMotion: component(beat,
        { wx: (index + beat) / 100, wy: 0.4, vx: 0.1, vy: -0.2 }) } })) };
  const ownerView = { ...shared, lane: "owner", world: {}, entities: [{ category: "owner",
    sourceId: identity.recipientId, incarnation: 1, lifecycleRevision: beat,
    components: { ownerState: component(beat, { profileId: `pilot-café-🚀-${beat % 7}`,
      rigLevels: [1, 0, 0], cargo: Array.from({ length: 8 }, (_, item) => `cargo-${item}`), cargoCount: 8 }) } }] };
  return { publicView, ownerView };
}

function ack(frame) {
  return { type: "ack", ackKind: "statePair", ackSchema: "lbh-authority-state-pair-mixed-ack-v1",
    matchId: frame.matchId, sessionId: frame.sessionId, authorityIncarnation: frame.authorityIncarnation,
    recipientId: frame.recipientId, recipientIncarnation: frame.recipientIncarnation,
    frameId: frame.frameId, statePairId: frame.statePairId, snapshotId: frame.snapshotId,
    publicHash: frame.public.resultHash, ownerHash: frame.owner.resultHash, pairSchema: frame.pairSchema,
    tick: frame.tick, simTime: frame.simTime, eventWatermark: frame.eventWatermark,
    fieldRevision: frame.fieldRevision, overloadMode: frame.overloadMode, ballparkEpoch: frame.ballparkEpoch,
    manifestHash: frame.manifestHash, publicKind: frame.public.kind, ownerKind: frame.owner.kind,
    publicBaseSnapshotId: frame.public.baseSnapshotId ?? null,
    ownerBaseSnapshotId: frame.owner.baseSnapshotId ?? null };
}

function run() {
  const publisher = createAuthorityDeltaPublisher({ preparedProjections: true });
  const context = codecContext({ ...identity, manifestHash: MANIFEST_HASH,
    codecManifestHash: POSITIONAL_CODEC_MANIFEST_HASH });
  const encoder = createStatePairWireEncoder(context);
  const samples = [];
  const transcript = [];
  const selections = [];
  for (let beat = 1; beat <= WARMUP + ITERATIONS + 1; beat += 1) {
    const input = { identity, ...views(beat), allowMixed: true, encodeWire: encoder };
    const started = performance.now();
    const produced = publisher.publish(input);
    const elapsed = performance.now() - started;
    assert.strictEqual(Buffer.byteLength(produced.encodedWire, "utf8"), produced.bytes);
    assert.deepStrictEqual(parseWireFrame(produced.encodedWire,
      { direction: SERVER_TO_CLIENT, positionalContext: context, requirePositional: true }), produced.frame);
    assert.strictEqual(publisher.acknowledge(identity, ack(produced.frame)).accepted, true);
    if (beat > WARMUP + 1) {
      samples.push(elapsed);
      transcript.push(produced.encodedWire);
      selections.push([produced.publicKind, produced.ownerKind, produced.bytes, produced.expandedBytes,
        produced.encodedDigest]);
    }
  }
  const choice = publisher.diagnostics().codecPairChoice;
  const sourceCommit = process.env.LBH_S15_SOURCE_COMMIT || git("rev-parse", "HEAD");
  const sourceTree = process.env.LBH_S15_SOURCE_TREE || git("rev-parse", `${sourceCommit}^{tree}`);
  const result = { schema: "lbh-s15-canonical-reuse-benchmark-run-v1",
    moduleRoot: path.relative(ROOT, MODULE_ROOT) || ".", iterations: ITERATIONS, warmup: WARMUP,
    execution: { runLabel: process.env.LBH_S15_RUN_LABEL || null,
      declaredOrder: Number(process.env.LBH_S15_RUN_ORDER || 0), sourceCommit, sourceTree,
      testScriptCommit: git("rev-parse", "HEAD"),
      trackedSourceDirty: Boolean(git("diff", "--name-only") || git("diff", "--cached", "--name-only")),
      sourceHashes: {
        authorityPublisher: fileSha(path.join(MODULE_ROOT, "scripts", "authority-delta-publisher.cjs")),
        positionalCodec: fileSha(path.join(MODULE_ROOT, "scripts", "state-pair-positional-codec.cjs")),
        wireProtocol: fileSha(path.join(MODULE_ROOT, "scripts", "multiplayer-wire-protocol.cjs")),
        benchmarkScript: fileSha(__filename),
      } },
    workload: { publicEntities: 48, ownerEntities: 1, candidatesPerSelection: 4 },
    publishMilliseconds: distribution(samples), selectionMilliseconds: choice.selectionMilliseconds,
    operations: choice.operations, selections: choice.selections,
    fallbackCounts: choice.fallbacks,
    transcriptSha256: crypto.createHash("sha256").update(transcript.join("\n")).digest("hex"),
    selectionTranscriptSha256: crypto.createHash("sha256").update(JSON.stringify(selections)).digest("hex"),
    parityComparisons: ITERATIONS,
    decodedSemanticComparisons: ITERATIONS };
  const output = process.env.LBH_S15_SELECTOR_OUTPUT;
  if (output) fs.writeFileSync(path.resolve(ROOT, output), `${JSON.stringify(result, null, 2)}\n`, { flag: "wx" });
  console.log(JSON.stringify(result, null, 2));
}

run();
