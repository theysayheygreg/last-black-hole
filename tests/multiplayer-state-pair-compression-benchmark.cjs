#!/usr/bin/env node
"use strict";

const assert = require("assert");
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const zlib = require("zlib");
const { performance } = require("perf_hooks");
const { createAuthorityDeltaPublisher } = require("../scripts/authority-delta-publisher.cjs");
const { codecContext, POSITIONAL_CODEC_MANIFEST_HASH } = require("../scripts/state-pair-positional-codec.cjs");
const { createStatePairWireEncoder, parseWireFrame, SERVER_TO_CLIENT } = require("../scripts/multiplayer-wire-protocol.cjs");
const { encodeCompressedStatePair, decodeCompressedStatePair } =
  require("../scripts/state-pair-compression-codec.cjs");

const ROOT = path.resolve(__dirname, "..");
const MANIFEST_HASH = `sha256:${"7".repeat(64)}`;
const IDENTITY = Object.freeze({ matchId: "match-s20-bench", sessionId: "session-s20-bench",
  authorityIncarnation: 1, recipientId: "member-s20-bench", recipientIncarnation: 1 });
const ROUNDS = Number(process.env.LBH_S20_BENCH_ROUNDS || 12);
const BEATS = Number(process.env.LBH_S20_BENCH_BEATS || 120);
const WARMUP_BEATS = Number(process.env.LBH_S20_BENCH_WARMUP || 40);

function distribution(values) {
  const sorted = [...values].sort((a, b) => a - b);
  const at = (p) => sorted[Math.min(sorted.length - 1, Math.floor((sorted.length - 1) * p))];
  return { count: sorted.length, mean: sorted.reduce((a, b) => a + b, 0) / sorted.length,
    p50: at(0.5), p95: at(0.95), p99: at(0.99), max: sorted.at(-1) };
}

function component(revision, value) { return { revision, value }; }
function views(beat) {
  const shared = { schema: "lbh-canonical-projection-v1", runId: IDENTITY.matchId,
    authorityEpoch: 1, connectionEpoch: 1, ballparkEpoch: 1, manifestHash: MANIFEST_HASH,
    statePairId: `pair-${beat}`, snapshotId: `snapshot-${beat}`, tick: beat * 6, simTime: beat / 10,
    eventWatermark: beat, fieldRevision: beat, overloadMode: "NORMAL" };
  const publicView = { ...shared, lane: "public", world: { publicFacts: {
    formTimes: [null, beat % 3 ? null : beat / 10, null, null] } },
  entities: Array.from({ length: 128 }, (_, index) => {
    const revision = Math.max(1, beat - (((beat - index) % 8 + 8) % 8));
    return { category: "player", sourceId: `seat-${index}`, incarnation: 1,
      lifecycleRevision: revision, components: { runtimeMotion: component(revision,
        { wx: (index + revision) / 100, wy: 0.4, vx: 0.1, vy: -0.2 }) } }; }) };
  const ownerView = { ...shared, lane: "owner", world: {}, entities: [{ category: "owner",
    sourceId: IDENTITY.recipientId, incarnation: 1, lifecycleRevision: beat,
    components: { ownerState: component(beat, { profileId: `pilot-café-🚀-${beat % 7}`,
      rigLevels: [1, 0, 0], cargo: Array.from({ length: 8 }, (_, i) => `cargo-${i}`), cargoCount: 8 }) } }] };
  return { publicView, ownerView };
}

function ack(frame) {
  return { type: "ack", ackKind: "statePair", ackSchema: "lbh-authority-state-pair-mixed-ack-v1",
    matchId: frame.matchId, sessionId: frame.sessionId, authorityIncarnation: frame.authorityIncarnation,
    recipientId: frame.recipientId, recipientIncarnation: frame.recipientIncarnation, frameId: frame.frameId,
    statePairId: frame.statePairId, snapshotId: frame.snapshotId, publicHash: frame.public.resultHash,
    ownerHash: frame.owner.resultHash, pairSchema: frame.pairSchema, tick: frame.tick, simTime: frame.simTime,
    eventWatermark: frame.eventWatermark, fieldRevision: frame.fieldRevision,
    overloadMode: frame.overloadMode, ballparkEpoch: frame.ballparkEpoch, manifestHash: frame.manifestHash,
    publicKind: frame.public.kind, ownerKind: frame.owner.kind,
    publicBaseSnapshotId: frame.public.baseSnapshotId ?? null, ownerBaseSnapshotId: frame.owner.baseSnapshotId ?? null };
}

function corpus() {
  const publisher = createAuthorityDeltaPublisher({ preparedProjections: true, trustedAuthorityProofs: true });
  const context = codecContext({ ...IDENTITY, manifestHash: MANIFEST_HASH,
    codecManifestHash: POSITIONAL_CODEC_MANIFEST_HASH });
  const encoder = createStatePairWireEncoder(context);
  const wires = [];
  for (let beat = 1; beat <= WARMUP_BEATS + BEATS; beat += 1) {
    const produced = publisher.publish({ identity: IDENTITY, ...views(beat), allowMixed: true, encodeWire: encoder });
    if (beat === 1 || beat > WARMUP_BEATS) wires.push({ bytes: Buffer.from(produced.encodedWire, "utf8"), frame: produced.frame,
      laneClass: `${produced.publicKind}+${produced.ownerKind}` });
    assert.strictEqual(publisher.acknowledge(IDENTITY, ack(produced.frame)).accepted, true);
  }
  return { wires, context };
}

const CODECS = Object.freeze([
  { name: "deflate-raw-1", compress: (b) => zlib.deflateRawSync(b, { level: 1 }),
    decompress: (b, n) => zlib.inflateRawSync(b, { maxOutputLength: n }) },
  { name: "deflate-raw-3", compress: (b) => zlib.deflateRawSync(b, { level: 3 }),
    decompress: (b, n) => zlib.inflateRawSync(b, { maxOutputLength: n }) },
  { name: "deflate-raw-6", compress: (b) => zlib.deflateRawSync(b, { level: 6 }),
    decompress: (b, n) => zlib.inflateRawSync(b, { maxOutputLength: n }) },
  { name: "brotli-q1", compress: (b) => zlib.brotliCompressSync(b, { params: {
      [zlib.constants.BROTLI_PARAM_QUALITY]: 1 } }),
    decompress: (b) => zlib.brotliDecompressSync(b) },
  { name: "brotli-q3", compress: (b) => zlib.brotliCompressSync(b, { params: {
      [zlib.constants.BROTLI_PARAM_QUALITY]: 3 } }),
    decompress: (b) => zlib.brotliDecompressSync(b) },
  { name: "brotli-q4", compress: (b) => zlib.brotliCompressSync(b, { params: {
      [zlib.constants.BROTLI_PARAM_QUALITY]: 4 } }),
    decompress: (b) => zlib.brotliDecompressSync(b) },
]);

function main() {
  const { wires, context } = corpus();
  const laneClasses = [...new Set(wires.map((entry) => entry.laneClass))].sort();
  assert(laneClasses.includes("delta+keyframe"),
    `representative corpus lost the product-dominant public-delta+owner-keyframe class: ${laneClasses}`);
  assert(laneClasses.includes("keyframe+keyframe"),
    `representative corpus lost its cold keyframe: ${laneClasses}`);
  let selectedEnvelopeExactComparisons = 0;
  let selectedEnvelopeSemanticComparisons = 0;
  let selectedEnvelopeAckTranscriptComparisons = 0;
  for (const sample of wires) {
    const decodedBytes = decodeCompressedStatePair(encodeCompressedStatePair(sample.bytes));
    assert(decodedBytes.equals(sample.bytes));
    selectedEnvelopeExactComparisons += 1;
    const decodedFrame = parseWireFrame(decodedBytes, { direction: SERVER_TO_CLIENT,
      positionalContext: context, requirePositional: true });
    assert.deepStrictEqual(decodedFrame, sample.frame);
    selectedEnvelopeSemanticComparisons += 1;
    assert.deepStrictEqual(ack(decodedFrame), ack(sample.frame));
    selectedEnvelopeAckTranscriptComparisons += 1;
  }
  const byCodec = new Map(CODECS.map((codec) => [codec.name, { compressionMs: [], decompressionMs: [],
    ratios: [], compressedBytes: [], byClass: new Map() }]));
  let exactComparisons = 0;
  for (let round = 0; round < ROUNDS; round += 1) {
    const codecOrder = [...CODECS.slice(round % CODECS.length), ...CODECS.slice(0, round % CODECS.length)];
    const wireOrder = round % 2 ? [...wires].reverse() : wires;
    for (const codec of codecOrder) {
      const stats = byCodec.get(codec.name);
      for (const sample of wireOrder) {
        const started = performance.now();
        const compressed = codec.compress(sample.bytes);
        stats.compressionMs.push(performance.now() - started);
        const decodeStarted = performance.now();
        const original = codec.decompress(compressed, sample.bytes.length);
        stats.decompressionMs.push(performance.now() - decodeStarted);
        assert(original.equals(sample.bytes));
        exactComparisons += 1;
        stats.ratios.push((compressed.length + 64) / sample.bytes.length);
        stats.compressedBytes.push(compressed.length + 64);
        const classStats = stats.byClass.get(sample.laneClass) || [];
        classStats.push((compressed.length + 64) / sample.bytes.length);
        stats.byClass.set(sample.laneClass, classStats);
      }
    }
  }
  const codecs = Object.fromEntries(CODECS.map(({ name }) => {
    const stats = byCodec.get(name);
    return [name, { authorityCompressionMilliseconds: distribution(stats.compressionMs),
      clientDecompressionMilliseconds: distribution(stats.decompressionMs),
      envelopeRatio: distribution(stats.ratios), compressedEnvelopeBytes: distribution(stats.compressedBytes),
      byLaneClass: Object.fromEntries([...stats.byClass].map(([key, values]) => [key, distribution(values)])),
      allocationProxyBytes: stats.compressedBytes.reduce((a, b) => a + b, 0) }];
  }));
  const eligible = Object.entries(codecs).filter(([, value]) => value.envelopeRatio.p95 <= 0.8
    && value.authorityCompressionMilliseconds.p95 <= 0.5)
    .sort((a, b) => a[1].authorityCompressionMilliseconds.p95 - b[1].authorityCompressionMilliseconds.p95);
  const selected = eligible[0]?.[0] || null;
  const result = { schema: "lbh-s20-codec-selection-benchmark-v1", counterbalancedRounds: ROUNDS,
    representativeWires: wires.length, sourceWireBytes: distribution(wires.map((entry) => entry.bytes.length)),
    laneClasses, exactComparisons,
    selectedEnvelopeExactComparisons, selectedEnvelopeSemanticComparisons,
    selectedEnvelopeAckTranscriptComparisons,
    envelopeBytesCharged: 64, hiddenPerMessageDeflate: false, codecs, selectionGate: {
      maximumP95EnvelopeRatio: 0.8, maximumP95AuthorityCompressionMilliseconds: 0.5 },
    selected, transcriptSha256: crypto.createHash("sha256")
      .update(wires.map((entry) => entry.bytes).join("\n")).digest("hex") };
  if (process.env.LBH_S20_BENCH_OUTPUT) fs.writeFileSync(path.resolve(ROOT, process.env.LBH_S20_BENCH_OUTPUT),
    `${JSON.stringify(result, null, 2)}\n`, { flag: "wx" });
  console.log(JSON.stringify(result, null, 2));
}

main();
