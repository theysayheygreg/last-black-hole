"use strict";

const crypto = require("crypto");
const zlib = require("zlib");
const { canonicalJsonBytes } = require("./session-replication-manifest.cjs");

const CAPABILITY = "state-pair-brotli-v1";
const PUBLIC_BODY_COMPRESSION_CAPABILITY = "state-pair-public-body-brotli-v1";
const CODEC_SCHEMA = "lbh-state-pair-compression-envelope-v1";
const CODEC_VERSION = 1;
const CODEC_ID = 1;
const CODEC_NAME = "brotli-quality-1";
const MAGIC = Buffer.from("LBHZ", "ascii");
const HEADER_BYTES = 64;
const MAX_ENVELOPE_BYTES = 256 * 1024;
// Brotli can expand incompressible input. Keep an explicit 16 KiB admission
// reserve so every admitted inner frame still fits the fixed outer envelope;
// positional sessions retain their independent 256 KiB fallback limit.
const EXPANSION_RESERVE_BYTES = 16 * 1024;
const MAX_COMPRESSED_BYTES = MAX_ENVELOPE_BYTES - HEADER_BYTES;
const MAX_ORIGINAL_BYTES = MAX_COMPRESSED_BYTES - EXPANSION_RESERVE_BYTES;
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
  limits: Object.freeze({ maxEnvelopeBytes: MAX_ENVELOPE_BYTES,
    expansionReserveBytes: EXPANSION_RESERVE_BYTES,
    maxCompressedBytes: MAX_COMPRESSED_BYTES, maxOriginalBytes: MAX_ORIGINAL_BYTES }),
  inner: "canonical state-pair-positional-json-v1 bytes",
});
const MANIFEST_DIGEST = crypto.createHash("sha256").update(canonicalJsonBytes(MANIFEST)).digest();
const MANIFEST_HASH = `sha256:${MANIFEST_DIGEST.toString("hex")}`;
const PUBLIC_BODY_MAGIC = Buffer.from("LBHP", "ascii");
const PUBLIC_BODY_CODEC_ID = 2;
const PUBLIC_BODY_MANIFEST = Object.freeze({
  schema: "lbh-public-body-compression-envelope-v1",
  version: CODEC_VERSION,
  capability: PUBLIC_BODY_COMPRESSION_CAPABILITY,
  envelope: Object.freeze({ magic: "LBHP", headerBytes: HEADER_BYTES,
    fields: MANIFEST.envelope.fields }),
  codec: Object.freeze({ id: PUBLIC_BODY_CODEC_ID, name: CODEC_NAME, algorithm: "brotli", quality: 1,
    contextTakeover: false, dictionary: false }),
  integrity: Object.freeze({ algorithm: "sha256", digestBytes: 16,
    binding: "publicBodyCompressionManifestHash || original public-body bytes" }),
  limits: MANIFEST.limits,
  inner: "canonical lbh-authority-state-pair-body-v1 bytes",
});
const PUBLIC_BODY_MANIFEST_DIGEST = crypto.createHash("sha256")
  .update(canonicalJsonBytes(PUBLIC_BODY_MANIFEST)).digest();
const PUBLIC_BODY_MANIFEST_HASH = `sha256:${PUBLIC_BODY_MANIFEST_DIGEST.toString("hex")}`;

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

function publicBodyOriginalDigest(bytes) {
  return crypto.createHash("sha256").update(PUBLIC_BODY_MANIFEST_DIGEST).update(bytes).digest().subarray(0, 16);
}

function encodeCompressedPublicBodyStatePair(publicBodyWire) {
  const original = asBytes(publicBodyWire, "public-body wire");
  if (original.length < 1 || original.length > MAX_ORIGINAL_BYTES) {
    fail("original-length", "original public-body wire is outside the bounded envelope");
  }
  const compressed = zlib.brotliCompressSync(original, { params: {
    [zlib.constants.BROTLI_PARAM_QUALITY]: 1,
  } });
  if (compressed.length < 1 || compressed.length > MAX_COMPRESSED_BYTES) {
    fail("compressed-length", "compressed public-body wire is outside the bounded envelope");
  }
  const envelope = Buffer.allocUnsafe(HEADER_BYTES + compressed.length);
  PUBLIC_BODY_MAGIC.copy(envelope, 0);
  envelope[4] = CODEC_VERSION;
  envelope[5] = PUBLIC_BODY_CODEC_ID;
  envelope[6] = 0;
  envelope[7] = 0;
  PUBLIC_BODY_MANIFEST_DIGEST.copy(envelope, 8);
  envelope.writeUInt32BE(compressed.length, 40);
  envelope.writeUInt32BE(original.length, 44);
  publicBodyOriginalDigest(original).copy(envelope, 48);
  compressed.copy(envelope, HEADER_BYTES);
  return envelope;
}

function decodeCompressedPublicBodyStatePair(raw) {
  const envelope = asBytes(raw, "public-body compressed envelope");
  if (envelope.length < HEADER_BYTES + 1) fail("truncated-envelope", "public-body compression envelope is truncated");
  if (!envelope.subarray(0, 4).equals(PUBLIC_BODY_MAGIC)) fail("wrong-magic", "public-body compression envelope magic is invalid");
  if (envelope[4] !== CODEC_VERSION || envelope[5] !== PUBLIC_BODY_CODEC_ID
      || envelope[6] !== 0 || envelope[7] !== 0) {
    fail("wrong-version", "public-body compression envelope profile is unsupported");
  }
  if (!envelope.subarray(8, 40).equals(PUBLIC_BODY_MANIFEST_DIGEST)) {
    fail("wrong-manifest", "public-body compression manifest binding failed");
  }
  const compressedLength = envelope.readUInt32BE(40);
  const originalLength = envelope.readUInt32BE(44);
  if (compressedLength < 1 || compressedLength > MAX_COMPRESSED_BYTES
      || originalLength < 1 || originalLength > MAX_ORIGINAL_BYTES
      || envelope.length !== HEADER_BYTES + compressedLength) {
    fail("envelope-length", "public-body compression envelope lengths are invalid");
  }
  let inflated;
  try {
    inflated = zlib.brotliDecompressSync(envelope.subarray(HEADER_BYTES), {
      maxOutputLength: originalLength, info: true,
    });
  } catch {
    fail("invalid-stream", "public-body compressed stream is invalid or exceeds its declared bound");
  }
  if (inflated.engine.bytesWritten !== compressedLength) fail("trailing-stream", "public-body compressed stream has trailing data");
  const original = Buffer.from(inflated.buffer);
  if (original.length !== originalLength
      || !crypto.timingSafeEqual(publicBodyOriginalDigest(original), envelope.subarray(48, 64))) {
    fail("integrity", "inflated public-body wire failed length or integrity binding");
  }
  return original;
}

module.exports = {
  CAPABILITY,
  PUBLIC_BODY_COMPRESSION_CAPABILITY,
  CODEC_SCHEMA,
  CODEC_VERSION,
  CODEC_ID,
  CODEC_NAME,
  HEADER_BYTES,
  MAX_ENVELOPE_BYTES,
  EXPANSION_RESERVE_BYTES,
  MAX_COMPRESSED_BYTES,
  MAX_ORIGINAL_BYTES,
  MANIFEST,
  MANIFEST_HASH,
  PUBLIC_BODY_MANIFEST,
  PUBLIC_BODY_MANIFEST_HASH,
  CompressionCodecError,
  encodeCompressedStatePair,
  decodeCompressedStatePair,
  encodeCompressedPublicBodyStatePair,
  decodeCompressedPublicBodyStatePair,
};
