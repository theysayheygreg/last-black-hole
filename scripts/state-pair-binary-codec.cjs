"use strict";

const crypto = require("crypto");
const { canonicalJsonBytes } = require("./session-replication-manifest.cjs");
const {
  POSITIONAL_CODEC_MANIFEST_HASH,
  MAX_CODEC_BYTES,
  PositionalCodecError,
  encodePositionalValueFrame,
  decodePositionalValueFrame,
  composeStatePairCandidates,
} = require("./state-pair-positional-codec.cjs");

const CAPABILITY = "state-pair-binary-v1";
const CODEC_SCHEMA = "lbh-state-pair-binary-v1";
const CODEC_VERSION = 1;
const MAGIC = Buffer.from("LBSP", "ascii");
const HEADER_BYTES = 42;
const MAX_DEPTH = 32;
const MAX_NODES = 100000;
const MAX_ARRAY_ITEMS = 16384;
const MAX_STRING_BYTES = 8192;
const MAX_VARINT_BYTES = 8;

const TYPES = Object.freeze({
  null: 0,
  false: 1,
  true: 2,
  unsignedInteger: 3,
  negativeInteger: 4,
  float64: 5,
  utf8: 6,
  array: 7,
  utf16be: 8,
});

const BINARY_CODEC_MANIFEST = Object.freeze({
  codecSchema: CODEC_SCHEMA,
  codecVersion: CODEC_VERSION,
  capability: CAPABILITY,
  transport: "websocket-binary-message",
  magicHex: MAGIC.toString("hex"),
  headerLayout: Object.freeze(["magic:4", "version:u8", "codecManifestHash:32", "frameTag:u8", "payloadBytes:u32be"]),
  payload: Object.freeze({
    sourceSchema: POSITIONAL_CODEC_MANIFEST_HASH,
    valueTypes: TYPES,
    integerEncoding: "canonical-unsigned-varint; negative tag plus magnitude",
    otherNumberEncoding: "ieee754-float64-be; finite; negative-zero-rejected",
    stringEncoding: "strict-utf8-length-prefixed; exact-utf16be fallback for lone surrogates",
  }),
  semanticHashes: "lbh-canonical-projection-v1",
  limits: Object.freeze({ maxBytes: MAX_CODEC_BYTES, maxDepth: MAX_DEPTH, maxNodes: MAX_NODES,
    maxArrayItems: MAX_ARRAY_ITEMS, maxStringBytes: MAX_STRING_BYTES, maxVarintBytes: MAX_VARINT_BYTES }),
});
const BINARY_CODEC_MANIFEST_HASH = `sha256:${crypto.createHash("sha256")
  .update(canonicalJsonBytes(BINARY_CODEC_MANIFEST)).digest("hex")}`;
const BINARY_CODEC_MANIFEST_DIGEST = Buffer.from(BINARY_CODEC_MANIFEST_HASH.slice(7), "hex");

class BinaryCodecError extends Error {
  constructor(code, message) {
    super(message);
    this.name = "BinaryCodecError";
    this.code = code;
  }
}

function fail(code, message) {
  throw new BinaryCodecError(code, message);
}

function assertContext(context) {
  if (!context || typeof context !== "object" || Array.isArray(context)) {
    fail("missing-context", "trusted binary codec context is required");
  }
  if (context.codecManifestHash !== BINARY_CODEC_MANIFEST_HASH) {
    fail("codec-manifest-mismatch", "trusted binary codec manifest is unsupported");
  }
}

function positionalContext(context) {
  assertContext(context);
  return Object.freeze({ ...context, codecManifestHash: POSITIONAL_CODEC_MANIFEST_HASH });
}

function countNode(state, depth) {
  if (depth > MAX_DEPTH) fail("complexity-limit", "binary value is too deep");
  state.nodes += 1;
  if (state.nodes > MAX_NODES) fail("complexity-limit", "binary value is too complex");
}

function varuint(value) {
  if (!Number.isSafeInteger(value) || value < 0) fail("invalid-number", "varint value is invalid");
  let current = BigInt(value);
  const bytes = [];
  do {
    let byte = Number(current & 0x7fn);
    current >>= 7n;
    if (current > 0n) byte |= 0x80;
    bytes.push(byte);
  } while (current > 0n);
  if (bytes.length > MAX_VARINT_BYTES) fail("integer-overflow", "varint exceeds safe integer bound");
  return Buffer.from(bytes);
}

function hasLoneSurrogate(value) {
  for (let index = 0; index < value.length; index += 1) {
    const unit = value.charCodeAt(index);
    if (unit >= 0xd800 && unit <= 0xdbff) {
      const next = value.charCodeAt(index + 1);
      if (next >= 0xdc00 && next <= 0xdfff) { index += 1; continue; }
      return true;
    }
    if (unit >= 0xdc00 && unit <= 0xdfff) return true;
  }
  return false;
}

function encodeString(value) {
  if (!hasLoneSurrogate(value)) return { type: TYPES.utf8, bytes: Buffer.from(value, "utf8") };
  const bytes = Buffer.allocUnsafe(value.length * 2);
  for (let index = 0; index < value.length; index += 1) bytes.writeUInt16BE(value.charCodeAt(index), index * 2);
  return { type: TYPES.utf16be, bytes };
}

function measureValue(value, state, depth = 0) {
  countNode(state, depth);
  if (value === null || value === false || value === true) return 1;
  if (typeof value === "number") {
    if (!Number.isFinite(value) || Object.is(value, -0)) fail("invalid-number", "binary number is invalid");
    return Number.isSafeInteger(value) ? 1 + varuint(value >= 0 ? value : -value).length : 9;
  }
  if (typeof value === "string") {
    const { bytes } = encodeString(value);
    if (bytes.length > MAX_STRING_BYTES) fail("string-too-large", "binary string exceeds codec limit");
    return 1 + varuint(bytes.length).length + bytes.length;
  }
  if (!Array.isArray(value)) fail("invalid-type", "binary payload only admits positional arrays and scalar JSON values");
  if (value.length > MAX_ARRAY_ITEMS) fail("collection-too-large", "binary array exceeds codec limit");
  let bytes = 1 + varuint(value.length).length;
  for (let index = 0; index < value.length; index += 1) {
    if (!Object.hasOwn(value, index)) fail("sparse-array", "binary array contains a sparse hole");
    bytes += measureValue(value[index], state, depth + 1);
  }
  return bytes;
}

function encodeValue(value, chunks, state, depth = 0) {
  countNode(state, depth);
  if (value === null) { chunks.push(Buffer.from([TYPES.null])); return; }
  if (value === false) { chunks.push(Buffer.from([TYPES.false])); return; }
  if (value === true) { chunks.push(Buffer.from([TYPES.true])); return; }
  if (typeof value === "number") {
    if (!Number.isFinite(value) || Object.is(value, -0)) fail("invalid-number", "binary number is invalid");
    if (Number.isSafeInteger(value)) {
      chunks.push(Buffer.from([value >= 0 ? TYPES.unsignedInteger : TYPES.negativeInteger]));
      chunks.push(varuint(value >= 0 ? value : -value));
      return;
    }
    const encoded = Buffer.allocUnsafe(9);
    encoded[0] = TYPES.float64;
    encoded.writeDoubleBE(value, 1);
    chunks.push(encoded);
    return;
  }
  if (typeof value === "string") {
    const { type, bytes } = encodeString(value);
    if (bytes.length > MAX_STRING_BYTES) fail("string-too-large", "binary string exceeds codec limit");
    chunks.push(Buffer.from([type]), varuint(bytes.length), bytes);
    return;
  }
  if (!Array.isArray(value)) fail("invalid-type", "binary payload only admits positional arrays and scalar JSON values");
  if (value.length > MAX_ARRAY_ITEMS) fail("collection-too-large", "binary array exceeds codec limit");
  for (let index = 0; index < value.length; index += 1) {
    if (!Object.hasOwn(value, index)) fail("sparse-array", "binary array contains a sparse hole");
  }
  chunks.push(Buffer.from([TYPES.array]), varuint(value.length));
  for (const entry of value) encodeValue(entry, chunks, state, depth + 1);
}

function encodeBinaryValue(value, frameTag) {
  if (!Number.isSafeInteger(frameTag) || frameTag < 0 || frameTag > 255) fail("invalid-tag", "frame tag is invalid");
  const chunks = [];
  encodeValue(value, chunks, { nodes: 0 });
  const payload = Buffer.concat(chunks);
  if (payload.length + HEADER_BYTES > MAX_CODEC_BYTES) fail("frame-too-large", "binary frame exceeds codec limit");
  const header = Buffer.allocUnsafe(HEADER_BYTES);
  MAGIC.copy(header, 0);
  header[4] = CODEC_VERSION;
  BINARY_CODEC_MANIFEST_DIGEST.copy(header, 5);
  header[37] = frameTag;
  header.writeUInt32BE(payload.length, 38);
  return Buffer.concat([header, payload], header.length + payload.length);
}

function readVaruint(state, label) {
  let value = 0n;
  let shift = 0n;
  const start = state.offset;
  for (let index = 0; index < MAX_VARINT_BYTES; index += 1) {
    if (state.offset >= state.end) fail("truncated-frame", `${label} is truncated`);
    const byte = state.buffer[state.offset++];
    value |= BigInt(byte & 0x7f) << shift;
    if ((byte & 0x80) === 0) {
      if (index > 0 && (byte & 0x7f) === 0) fail("noncanonical-varint", `${label} is overlong`);
      if (value > BigInt(Number.MAX_SAFE_INTEGER)) fail("integer-overflow", `${label} exceeds safe integer bound`);
      return { value: Number(value), bytes: state.offset - start };
    }
    shift += 7n;
  }
  fail("integer-overflow", `${label} exceeds varint byte limit`);
}

function decodeValue(state, depth = 0) {
  countNode(state, depth);
  if (state.offset >= state.end) fail("truncated-frame", "binary value tag is truncated");
  const type = state.buffer[state.offset++];
  if (type === TYPES.null) return null;
  if (type === TYPES.false) return false;
  if (type === TYPES.true) return true;
  if (type === TYPES.unsignedInteger || type === TYPES.negativeInteger) {
    const value = readVaruint(state, "integer").value;
    if (type === TYPES.negativeInteger && value === 0) fail("negative-zero", "negative integer zero is noncanonical");
    return type === TYPES.negativeInteger ? -value : value;
  }
  if (type === TYPES.float64) {
    if (state.end - state.offset < 8) fail("truncated-frame", "float64 is truncated");
    const value = state.buffer.readDoubleBE(state.offset);
    state.offset += 8;
    if (!Number.isFinite(value) || Object.is(value, -0) || Number.isSafeInteger(value)) {
      fail("noncanonical-number", "float64 must be finite non-integer and not negative zero");
    }
    return value;
  }
  if (type === TYPES.utf8) {
    const length = readVaruint(state, "string length").value;
    if (length > MAX_STRING_BYTES) fail("string-too-large", "binary string exceeds codec limit");
    if (length > state.end - state.offset) fail("truncated-frame", "binary string is truncated");
    const bytes = state.buffer.subarray(state.offset, state.offset + length);
    state.offset += length;
    let value;
    try { value = new TextDecoder("utf-8", { fatal: true }).decode(bytes); }
    catch { fail("invalid-utf8", "binary string is not valid UTF-8"); }
    if (!Buffer.from(value, "utf8").equals(bytes)) fail("noncanonical-utf8", "binary string UTF-8 is not canonical");
    return value;
  }
  if (type === TYPES.utf16be) {
    const length = readVaruint(state, "UTF-16 string length").value;
    if (length > MAX_STRING_BYTES) fail("string-too-large", "binary string exceeds codec limit");
    if (length % 2 !== 0) fail("invalid-utf16", "UTF-16 string byte length must be even");
    if (length > state.end - state.offset) fail("truncated-frame", "binary UTF-16 string is truncated");
    let value = "";
    for (let offset = state.offset; offset < state.offset + length; offset += 2) {
      value += String.fromCharCode(state.buffer.readUInt16BE(offset));
    }
    state.offset += length;
    if (!hasLoneSurrogate(value)) fail("noncanonical-utf16", "well-formed Unicode must use UTF-8");
    return value;
  }
  if (type === TYPES.array) {
    const count = readVaruint(state, "array length").value;
    if (count > MAX_ARRAY_ITEMS) fail("collection-too-large", "binary array exceeds codec limit");
    if (count > state.end - state.offset) fail("truncated-frame", "binary array cannot fit remaining payload");
    const output = new Array(count);
    for (let index = 0; index < count; index += 1) output[index] = decodeValue(state, depth + 1);
    return output;
  }
  fail("unknown-type", `binary value type ${type} is unsupported`);
}

function encodeBinaryFrame(frame, context) {
  const encoded = encodePositionalValueFrame(frame, positionalContext(context));
  return encodeBinaryValue(encoded, encoded[0]);
}

function binaryFrameByteLength(frame, context) {
  const encoded = encodePositionalValueFrame(frame, positionalContext(context));
  return HEADER_BYTES + measureValue(encoded, { nodes: 0 });
}

function decodeBinaryFrame(raw, context) {
  assertContext(context);
  if (!Buffer.isBuffer(raw) && !(raw instanceof Uint8Array)) fail("invalid-encoding", "binary frame must be bytes");
  const buffer = Buffer.isBuffer(raw) ? raw : Buffer.from(raw.buffer, raw.byteOffset, raw.byteLength);
  if (buffer.length > MAX_CODEC_BYTES) fail("frame-too-large", "binary frame exceeds codec limit");
  if (buffer.length < HEADER_BYTES) fail("truncated-frame", "binary header is truncated");
  if (!buffer.subarray(0, 4).equals(MAGIC)) fail("invalid-magic", "binary frame magic is invalid");
  if (buffer[4] !== CODEC_VERSION) fail("unsupported-version", "binary codec version is unsupported");
  if (!buffer.subarray(5, 37).equals(BINARY_CODEC_MANIFEST_DIGEST)) {
    fail("codec-manifest-mismatch", "binary codec manifest binding is unsupported");
  }
  const frameTag = buffer[37];
  const payloadBytes = buffer.readUInt32BE(38);
  if (payloadBytes !== buffer.length - HEADER_BYTES) fail("length-mismatch", "binary payload length is not exact");
  const state = { buffer, offset: HEADER_BYTES, end: buffer.length, nodes: 0 };
  const encoded = decodeValue(state);
  if (state.offset !== state.end) fail("trailing-bytes", "binary payload has trailing bytes");
  if (!Array.isArray(encoded) || encoded.length === 0 || encoded[0] !== frameTag) {
    fail("frame-tag-mismatch", "binary header and positional frame tags disagree");
  }
  try { return decodePositionalValueFrame(encoded, positionalContext(context)); }
  catch (error) {
    if (error instanceof PositionalCodecError) fail(error.code, error.message);
    throw error;
  }
}

function composeBinaryStatePairCandidates(entries, context, tieOrder) {
  // S16 deliberately preserves S15's exact positional JSON winner. Binary is
  // only a transport representation change; changing public/owner base choice
  // would confound ACK/recovery parity and the admission comparison.
  const positional = composeStatePairCandidates(entries, positionalContext(context), tieOrder);
  const binaryCandidates = entries.map((entry) => Object.freeze({ kind: entry.kind,
    bytes: binaryFrameByteLength(entry.frame, context) }));
  const wire = encodeBinaryFrame(positional.chosen.frame, context);
  return Object.freeze({
    chosen: Object.freeze({ kind: positional.chosen.kind, frame: positional.chosen.frame,
      bytes: wire.length, wire }),
    candidates: Object.freeze(binaryCandidates.map((entry) => Object.freeze({ kind: entry.kind, bytes: entry.bytes }))),
    diagnostics: Object.freeze({ ...positional.diagnostics,
      binaryCandidateEncodes: 0, binaryCandidateSizePasses: binaryCandidates.length,
      binaryWinnerEncodes: 1, binaryBytes: wire.length,
      positionalOracleBytes: positional.chosen.bytes,
      allocationProxyBytes: positional.diagnostics.allocationProxyBytes
        + wire.length }),
  });
}

function codecContext(input = {}) {
  return Object.freeze({ codecManifestHash: BINARY_CODEC_MANIFEST_HASH,
    matchId: input.matchId, sessionId: input.sessionId, authorityIncarnation: input.authorityIncarnation,
    recipientId: input.recipientId, recipientIncarnation: input.recipientIncarnation,
    manifestHash: input.manifestHash });
}

module.exports = {
  CAPABILITY,
  CODEC_SCHEMA,
  CODEC_VERSION,
  MAGIC,
  HEADER_BYTES,
  TYPES,
  BINARY_CODEC_MANIFEST,
  BINARY_CODEC_MANIFEST_HASH,
  BinaryCodecError,
  codecContext,
  encodeBinaryFrame,
  binaryFrameByteLength,
  decodeBinaryFrame,
  composeBinaryStatePairCandidates,
};
