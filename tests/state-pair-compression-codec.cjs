#!/usr/bin/env node
"use strict";

const assert = require("assert");
const crypto = require("crypto");
const zlib = require("zlib");
const {
  HEADER_BYTES, MAX_ORIGINAL_BYTES, MANIFEST_HASH, CompressionCodecError,
  encodeCompressedStatePair, decodeCompressedStatePair,
} = require("../scripts/state-pair-compression-codec.cjs");

function errorCode(run) {
  try { run(); return null; } catch (error) {
    assert(error instanceof CompressionCodecError);
    return error.code;
  }
}

function main() {
  const samples = [Buffer.from("[0,1]"), Buffer.from(`[0,${JSON.stringify("café-🚀-\\-\n")}]`),
    Buffer.alloc(MAX_ORIGINAL_BYTES - 1, 120), Buffer.alloc(MAX_ORIGINAL_BYTES, 121)];
  let exactComparisons = 0;
  for (let index = 0; index < 512; index += 1) {
    const bytes = index < samples.length ? samples[index] : Buffer.from(JSON.stringify([
      0, index, crypto.createHash("sha256").update(String(index)).digest("hex"), "x".repeat(index % 4096),
    ]));
    assert(decodeCompressedStatePair(encodeCompressedStatePair(bytes)).equals(bytes));
    exactComparisons += 1;
  }
  const wire = encodeCompressedStatePair(samples[1]);
  const cases = [];
  const mutate = (name, fn) => { const value = Buffer.from(wire); fn(value); cases.push([name, errorCode(() => decodeCompressedStatePair(value))]); };
  cases.push(["truncated", errorCode(() => decodeCompressedStatePair(wire.subarray(0, -1)))]);
  cases.push(["trailing", errorCode(() => decodeCompressedStatePair(Buffer.concat([wire, Buffer.from([0])])))]);
  mutate("magic", (b) => { b[0] ^= 1; });
  mutate("version", (b) => { b[4] += 1; });
  mutate("codec", (b) => { b[5] += 1; });
  mutate("flags", (b) => { b[6] = 1; });
  mutate("manifest", (b) => { b[8] ^= 1; });
  mutate("compressed-length", (b) => { b.writeUInt32BE(b.readUInt32BE(40) + 1, 40); });
  mutate("original-length", (b) => { b.writeUInt32BE(b.readUInt32BE(44) - 1, 44); });
  mutate("checksum", (b) => { b[48] ^= 1; });
  mutate("payload", (b) => { b[HEADER_BYTES] ^= 1; });
  const second = zlib.brotliCompressSync(Buffer.from("other"), { params: {
    [zlib.constants.BROTLI_PARAM_QUALITY]: 1,
  } });
  const concat = Buffer.concat([wire, second]);
  concat.writeUInt32BE(concat.length - HEADER_BYTES, 40);
  cases.push(["concatenated-stream", errorCode(() => decodeCompressedStatePair(concat))]);
  const bombOriginal = Buffer.alloc(256 * 1024, 0);
  const bomb = encodeCompressedStatePair(bombOriginal);
  bomb.writeUInt32BE(64, 44);
  cases.push(["bomb-output-bound", errorCode(() => decodeCompressedStatePair(bomb))]);
  const retained = encodeCompressedStatePair(samples[0]);
  const stable = Buffer.from(retained);
  samples[0].fill(0);
  assert(retained.equals(stable));
  assert(cases.every(([, code]) => code), JSON.stringify(cases));
  console.log(JSON.stringify({ schema: "lbh-s20-compression-codec-adversarial-v1", manifestHash: MANIFEST_HASH,
    exactComparisons, malformedCases: cases.length, malformedResults: Object.fromEntries(cases),
    maxAndMaxMinusOneCases: 2, mutableRetentionComparisons: 1, mismatches: 0 }, null, 2));
}

main();
