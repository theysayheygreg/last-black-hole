#!/usr/bin/env node
"use strict";

const fs = require("fs");
const path = require("path");
const { performance } = require("perf_hooks");
const {
  POSITIONAL_CODEC_MANIFEST_HASH,
  codecContext: positionalContext,
  encodePositionalFrame,
  decodePositionalFrame,
} = require("../scripts/state-pair-positional-codec.cjs");
const {
  BINARY_CODEC_MANIFEST_HASH,
  codecContext: binaryContext,
  encodeBinaryFrame,
  decodeBinaryFrame,
} = require("../scripts/state-pair-binary-codec.cjs");

const ROOT = path.resolve(__dirname, "..");
const MANIFEST_HASH = `sha256:${"8".repeat(64)}`;
const FRAMES = Number(process.env.LBH_S16_BENCH_FRAMES || 120);
const ITERATIONS = Number(process.env.LBH_S16_BENCH_ITERATIONS || 20);
const WARMUP = Number(process.env.LBH_S16_BENCH_WARMUP || 3);

function percentile(values, ratio) {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * ratio))];
}

function stats(values) {
  return { count: values.length, mean: values.reduce((sum, value) => sum + value, 0) / values.length,
    p50: percentile(values, 0.50), p95: percentile(values, 0.95), p99: percentile(values, 0.99) };
}

function contexts() {
  const input = { matchId: "match-s16-benchmark", sessionId: "session-s16-benchmark",
    authorityIncarnation: 3, recipientId: "member-s16-benchmark", recipientIncarnation: 2,
    manifestHash: MANIFEST_HASH };
  return { positional: positionalContext({ ...input, codecManifestHash: POSITIONAL_CODEC_MANIFEST_HASH }),
    binary: binaryContext({ ...input, codecManifestHash: BINARY_CODEC_MANIFEST_HASH }) };
}

function frame(index, context) {
  const marker = index % 3 === 0 ? `café-🚀-${index}`
    : index % 3 === 1 ? `quote-\"-slash-\\-control-\n-${index}` : `plain-${index}`;
  const header = { type: "statePair", pairSchema: "lbh-authority-state-pair-mixed-v1",
    matchId: context.matchId, sessionId: context.sessionId,
    authorityIncarnation: context.authorityIncarnation, recipientId: context.recipientId,
    recipientIncarnation: context.recipientIncarnation, frameId: index + 1,
    statePairId: `pair-${index}`, snapshotId: `snapshot-${index}`, tick: index * 6,
    simTime: index / 10, eventWatermark: index, fieldRevision: index,
    overloadMode: "NORMAL", ballparkEpoch: 1, manifestHash: MANIFEST_HASH };
  const projection = (lane) => ({ schema: "lbh-canonical-projection-v1", lane,
    runId: header.matchId, authorityEpoch: header.authorityIncarnation,
    connectionEpoch: header.recipientIncarnation, ballparkEpoch: header.ballparkEpoch,
    manifestHash: header.manifestHash, statePairId: header.statePairId,
    snapshotId: header.snapshotId, tick: header.tick, simTime: header.simTime,
    eventWatermark: header.eventWatermark, fieldRevision: header.fieldRevision,
    overloadMode: header.overloadMode,
    world: lane === "public" ? { publicFacts: { profileId: marker,
      formTimes: [index, index / 3, index === 0 ? 0 : -index] } } : {},
    entities: Array.from({ length: lane === "public" ? 48 : 1 }, (_, entityIndex) => ({
      publicEntityId: `${lane === "public" ? "6:player" : "5:owner"}${Buffer.byteLength(`${lane}-${entityIndex}`)}:${lane}-${entityIndex}`,
      category: lane === "public" ? "player" : "owner", sourceId: `${lane}-${entityIndex}`,
      incarnation: 1, lifecycleRevision: index + 1,
      components: lane === "public" ? {
        runtimeMotion: { revision: index + 1, value: { wx: entityIndex / 48, wy: index / 100,
          vx: 0.1, vy: -0.2, heading: index / 10 } },
        runtimeOrder: { revision: 1, value: { index: entityIndex } },
      } : { ownerState: { revision: index + 1, value: { profileId: marker,
        deltaV: 100 - index / 10, cargo: [marker], cargoCount: 1 } } },
    })) });
  const hash = (name, value) => `sha256:${name === "public" ? "a" : "b"}${String(value).padStart(63, "0").slice(-63)}`;
  const keyframe = (name) => ({ kind: "keyframe", schema: "lbh-canonical-projection-v1",
    resultHash: hash(name, index), projection: projection(name) });
  const publicLane = index === 0 ? keyframe("public") : {
    kind: "delta", schema: "lbh-canonical-structural-delta-v1",
    baseSnapshotId: `snapshot-${index - 1}`, baseHash: hash("public", index - 1),
    resultHash: hash("public", index),
    delta: { schema: "lbh-canonical-structural-delta-v1", lane: "public",
      runId: header.matchId, authorityEpoch: header.authorityIncarnation,
      connectionEpoch: header.recipientIncarnation, ballparkEpoch: header.ballparkEpoch,
      manifestHash: header.manifestHash, statePairId: header.statePairId,
      baseSnapshotId: `snapshot-${index - 1}`, snapshotId: header.snapshotId,
      baseHash: hash("public", index - 1), resultHash: hash("public", index), rootOps: [], creates: [],
      updates: projection("public").entities.map((entity) => ({
        publicEntityId: entity.publicEntityId, incarnation: entity.incarnation,
        lifecycleRevision: entity.lifecycleRevision,
        components: { runtimeMotion: entity.components.runtimeMotion },
      })), despawns: [] },
  };
  return { ...header, public: publicLane, owner: keyframe("owner") };
}

function measure(label, frames, encode, decode, order) {
  const encodeMs = [];
  const decodeMs = [];
  const wires = [];
  let encodedBytes = 0;
  for (let warmup = 0; warmup < WARMUP; warmup += 1) {
    for (const value of frames) decode(encode(value));
  }
  for (let iteration = 0; iteration < ITERATIONS; iteration += 1) {
    const sequence = order === "reverse" ? [...frames].reverse() : frames;
    for (const value of sequence) {
      const encodeStarted = performance.now();
      const wire = encode(value);
      encodeMs.push(performance.now() - encodeStarted);
      const decodeStarted = performance.now();
      decode(wire);
      decodeMs.push(performance.now() - decodeStarted);
      const bytes = Buffer.byteLength(wire);
      encodedBytes += bytes;
      if (wires.length < frames.length) wires.push(bytes);
    }
  }
  return { label, order, frames: frames.length, iterations: ITERATIONS,
    operations: { authorityEncodes: frames.length * ITERATIONS, clientDecodes: frames.length * ITERATIONS,
      materializedFullFrames: frames.length * ITERATIONS },
    authorityEncodeMs: stats(encodeMs), clientDecodeMs: stats(decodeMs),
    wireBytes: stats(wires), allocationProxyBytes: encodedBytes };
}

function run() {
  const context = contexts();
  const frames = Array.from({ length: FRAMES }, (_, index) => frame(index, context.positional));
  const positional = measure("s15-positional-json", frames,
    (value) => encodePositionalFrame(value, context.positional),
    (wire) => decodePositionalFrame(wire, context.positional), "forward");
  const binary = measure("s16-binary", frames,
    (value) => encodeBinaryFrame(value, context.binary),
    (wire) => decodeBinaryFrame(wire, context.binary), "reverse");
  const result = { schema: "lbh-s16-codec-microbenchmark-v1",
    config: { frames: FRAMES, iterations: ITERATIONS, warmup: WARMUP,
      workload: "48 public motion updates plus one owner keyframe after the initial keyframe; representative public-delta+owner-keyframe statePair" },
    positional, binary,
    comparison: {
      meanWireReductionFraction: 1 - binary.wireBytes.mean / positional.wireBytes.mean,
      authorityEncodeMeanRatioBinaryOverJson: binary.authorityEncodeMs.mean / positional.authorityEncodeMs.mean,
      clientDecodeMeanRatioBinaryOverJson: binary.clientDecodeMs.mean / positional.clientDecodeMs.mean,
      allocationProxyReductionFraction: 1 - binary.allocationProxyBytes / positional.allocationProxyBytes,
    },
    limitations: ["Machine-local synthetic codec-only benchmark", "Does not include projection, delta construction, selection, socket, or ACK apply"],
  };
  const output = process.env.LBH_S16_BENCH_OUTPUT;
  if (output) fs.writeFileSync(path.resolve(ROOT, output), `${JSON.stringify(result, null, 2)}\n`, { flag: "wx" });
  console.log(JSON.stringify(result, null, 2));
}

run();
