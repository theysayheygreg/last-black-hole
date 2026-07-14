"use strict";

const crypto = require("crypto");
const zlib = require("zlib");
const { canonicalJsonBytes } = require("./session-replication-manifest.cjs");

const CAPABILITY = "state-pair-brotli-v1";
const CODEC_SCHEMA = "lbh-state-pair-compression-envelope-v1";
const CODEC_VERSION = 1;
const CODEC_ID = 1;
const CODEC_NAME = "brotli-quality-1";
const MAGIC = Buffer.from("LBHZ", "ascii");
const HEADER_BYTES = 64;
const MAX_ORIGINAL_BYTES = 256 * 1024;
const MAX_COMPRESSED_BYTES = MAX_ORIGINAL_BYTES - HEADER_BYTES;
const MANIFEST = Object.freeze({
  schema: CODEC_SCHEMA,
  version: CODEC_VERSION,
  capability: CAPABILITY,
  envelope: Object.freeze({
    magic: "LBHZ",
    headerBytes: HEADER_BYTES,
    fields: Object.freeze(["magic", "version", "codecId", "flags", "reserved", "manifestHash",
      "compressedLength", "originalLength", "originalDigest"]),
  }),
  codec: Object.freeze({ id: CODEC_ID, name: CODEC_NAME, algorithm: "brotli", quality: 1,
    contextTakeover: false, dictionary: false }),
  integrity: Object.freeze({ algorithm: "sha256", digestBytes: 16,
    binding: "manifestHash || original positional bytes" }),
  limits: Object.freeze({ maxCompressedBytes: MAX_COMPRESSED_BYTES, maxOriginalBytes: MAX_ORIGINAL_BYTES }),
  inner: "canonical state-pair-positional-json-v1 bytes",
});
const MANIFEST_DIGEST = crypto.createHash("sha256").update(canonicalJsonBytes(MANIFEST)).digest();
const MANIFEST_HASH = `sha256:${MANIFEST_DIGEST.toString("hex")}`;

class CompressionCodecError extends Error {
  constructor(code, message) {
    super(message);
    this.name = "CompressionCodecError";
    this.code = code;
  }
}

function fail(code, message) {
  throw new CompressionCodecError(code, message);
}

function asBytes(value, label) {
  if (typeof value === "string") return Buffer.from(value, "utf8");
  if (Buffer.isBuffer(value) || value instanceof Uint8Array) return Buffer.from(value);
  fail("invalid-input", `${label} must be bytes`);
}

function originalDigest(bytes) {
  return crypto.createHash("sha256").update(MANIFEST_DIGEST).update(bytes).digest().subarray(0, 16);
}

function encodeCompressedStatePair(positionalWire) {
  const original = asBytes(positionalWire, "positional wire");
  if (original.length < 1 || original.length > MAX_ORIGINAL_BYTES) {
    fail("original-length", "original positional wire is outside the bounded envelope");
  }
  const compressed = zlib.brotliCompressSync(original, { params: {
    [zlib.constants.BROTLI_PARAM_QUALITY]: 1,
  } });
  if (compressed.length < 1 || compressed.length > MAX_COMPRESSED_BYTES) {
    fail("compressed-length", "compressed positional wire is outside the bounded envelope");
  }
  const envelope = Buffer.allocUnsafe(HEADER_BYTES + compressed.length);
  MAGIC.copy(envelope, 0);
  envelope[4] = CODEC_VERSION;
  envelope[5] = CODEC_ID;
  envelope[6] = 0;
  envelope[7] = 0;
  MANIFEST_DIGEST.copy(envelope, 8);
  envelope.writeUInt32BE(compressed.length, 40);
  envelope.writeUInt32BE(original.length, 44);
  originalDigest(original).copy(envelope, 48);
  compressed.copy(envelope, HEADER_BYTES);
  return envelope;
}

function decodeCompressedStatePair(raw) {
  const envelope = asBytes(raw, "compressed envelope");
  if (envelope.length < HEADER_BYTES + 1) fail("truncated-envelope", "compression envelope is truncated");
  if (!envelope.subarray(0, 4).equals(MAGIC)) fail("wrong-magic", "compression envelope magic is invalid");
  if (envelope[4] !== CODEC_VERSION) fail("wrong-version", "compression envelope version is unsupported");
  if (envelope[5] !== CODEC_ID) fail("wrong-codec", "compression envelope codec is unsupported");
  if (envelope[6] !== 0 || envelope[7] !== 0) fail("invalid-flags", "compression envelope flags are invalid");
  if (!envelope.subarray(8, 40).equals(MANIFEST_DIGEST)) fail("wrong-manifest", "compression manifest binding failed");
  const compressedLength = envelope.readUInt32BE(40);
  const originalLength = envelope.readUInt32BE(44);
  if (compressedLength < 1 || compressedLength > MAX_COMPRESSED_BYTES) {
    fail("compressed-length", "declared compressed length is outside limits");
  }
  if (originalLength < 1 || originalLength > MAX_ORIGINAL_BYTES) {
    fail("original-length", "declared original length is outside limits");
  }
  if (envelope.length !== HEADER_BYTES + compressedLength) {
    fail("envelope-length", "compression envelope has truncation or trailing bytes");
  }
  let inflated;
  try {
    inflated = zlib.brotliDecompressSync(envelope.subarray(HEADER_BYTES), {
      maxOutputLength: originalLength,
      info: true,
    });
  } catch {
    fail("invalid-stream", "compressed stream is invalid or exceeds its declared output bound");
  }
  if (inflated.engine.bytesWritten !== compressedLength) {
    fail("trailing-stream", "compressed stream contains trailing or concatenated data");
  }
  const original = Buffer.from(inflated.buffer);
  if (original.length !== originalLength) fail("original-length", "inflated length differs from declaration");
  if (!crypto.timingSafeEqual(originalDigest(original), envelope.subarray(48, 64))) {
    fail("integrity", "inflated positional wire failed integrity binding");
  }
  return original;
}

module.exports = {
  CAPABILITY,
  CODEC_SCHEMA,
  CODEC_VERSION,
  CODEC_ID,
  CODEC_NAME,
  HEADER_BYTES,
  MAX_COMPRESSED_BYTES,
  MAX_ORIGINAL_BYTES,
  MANIFEST,
  MANIFEST_HASH,
  CompressionCodecError,
  encodeCompressedStatePair,
  decodeCompressedStatePair,
};
