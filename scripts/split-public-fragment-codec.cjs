"use strict";

const crypto = require("crypto");
const zlib = require("zlib");
const { canonicalJson, canonicalJsonBytes } = require("./session-replication-manifest.cjs");
const { assertPublicBody, scanPublicBodyPrivacy, BODY_SCHEMA, BODY_DELTA_SCHEMA } =
  require("./state-pair-public-body-codec.cjs");

const CAPABILITY = "state-pair-split-public-fragment-v1";
const FRAGMENT_SCHEMA = "lbh-split-public-fragment-v1";
const OVERLAY_SCHEMA = "lbh-split-owner-overlay-v1";
const FRAGMENT_MAGIC = Buffer.from("LBHPF001", "ascii");
const OVERLAY_MAGIC = Buffer.from("LBHPO001", "ascii");
const HEADER_BYTES = 49;
// A split pair is accepted by the existing 256 KiB state-pair receiver. Keep
// each physical half within that ceiling; the authority separately bounds the
// combined fragment + overlay bytes to the same total.
const MAX_FRAGMENT_BYTES = 256 * 1024;
const MAX_OVERLAY_BYTES = 256 * 1024;

const MANIFEST = Object.freeze({
  schema: "lbh-split-public-fragment-codec-manifest-v1",
  version: 1,
  capability: CAPABILITY,
  fragmentSchema: FRAGMENT_SCHEMA,
  overlaySchema: OVERLAY_SCHEMA,
  publicPayloads: Object.freeze([BODY_SCHEMA, BODY_DELTA_SCHEMA]),
  representation: "fixed binary header plus Brotli-q1 canonical allowlisted public-fragment payload",
  precision: "lossless",
  authority: "one match-local single writer; public bytes are derived immutable replication output",
  limits: Object.freeze({ maxFragmentBytes: MAX_FRAGMENT_BYTES, maxOverlayBytes: MAX_OVERLAY_BYTES }),
});
const MANIFEST_HASH = `sha256:${crypto.createHash("sha256").update(canonicalJsonBytes(MANIFEST)).digest("hex")}`;

class SplitPublicFragmentError extends Error {
  constructor(code, message) {
    super(message);
    this.name = "SplitPublicFragmentError";
    this.code = code;
  }
}

function fail(code, message) {
  throw new SplitPublicFragmentError(code, message);
}

function plainObject(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function exactKeys(value, keys, label) {
  if (!plainObject(value)) fail("invalid-layout", `${label} must be a plain object`);
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  if (actual.length !== expected.length || actual.some((key, index) => key !== expected[index])) {
    fail("invalid-layout", `${label} has fields outside its fixed schema`);
  }
}

function string(value, label) {
  if (typeof value !== "string" || !value || value.trim() !== value || value !== value.normalize("NFC")) {
    fail("invalid-field", `${label} must be a non-empty NFC string`);
  }
}

function integer(value, label, min = 0) {
  if (!Number.isSafeInteger(value) || value < min || Object.is(value, -0)) {
    fail("invalid-field", `${label} must be a safe integer >= ${min}`);
  }
}

function finite(value, label) {
  if (typeof value !== "number" || !Number.isFinite(value) || Object.is(value, -0)) {
    fail("invalid-field", `${label} must be finite`);
  }
}

function sha256(bytes) {
  return crypto.createHash("sha256").update(bytes).digest();
}

function digestString(bytes) {
  return `sha256:${sha256(bytes).toString("hex")}`;
}

function assertPublicPayload(payload, fragment) {
  if (!plainObject(payload) || !["keyframe", "delta"].includes(payload.kind)) {
    fail("invalid-layout", "public fragment payload kind is invalid");
  }
  if (payload.kind === "keyframe") {
    exactKeys(payload, ["kind", "schema", "bodyId", "bodyRevision", "resultHash", "body"], "keyframe payload");
    if (payload.schema !== BODY_SCHEMA) fail("unknown-schema", "public keyframe schema is unsupported");
    assertPublicBody(payload.body);
  } else {
    exactKeys(payload, ["kind", "schema", "baseBodyId", "baseBodyRevision", "baseHash", "bodyId",
      "bodyRevision", "resultHash", "structuralBaseHash", "structuralResultHash", "delta"], "delta payload");
    if (payload.schema !== BODY_DELTA_SCHEMA) fail("unknown-schema", "public delta schema is unsupported");
    for (const key of ["baseBodyId", "baseHash", "structuralBaseHash", "structuralResultHash"]) string(payload[key], key);
    integer(payload.baseBodyRevision, "baseBodyRevision", 1);
    exactKeys(payload.delta, ["schema", "lane", "runId", "authorityEpoch", "connectionEpoch",
      "ballparkEpoch", "manifestHash", "statePairId", "baseSnapshotId", "snapshotId", "baseHash",
      "resultHash", "rootOps", "creates", "updates", "despawns"], "public structural delta");
    if (payload.delta.schema !== "lbh-canonical-structural-delta-v1" || payload.delta.lane !== "public"
        || !Array.isArray(payload.delta.rootOps) || !Array.isArray(payload.delta.creates)
        || !Array.isArray(payload.delta.updates) || !Array.isArray(payload.delta.despawns)) {
      fail("invalid-layout", "public delta must use the fixed public structural-delta schema");
    }
    // Delta envelope identity includes connectionEpoch by schema. Privacy applies to
    // the public mutations it carries, not to that authority-owned lineage field.
    scanPublicBodyPrivacy({
      rootOps: payload.delta.rootOps,
      creates: payload.delta.creates,
      updates: payload.delta.updates,
      despawns: payload.delta.despawns,
    });
  }
  for (const key of ["bodyId", "resultHash"]) string(payload[key], key);
  integer(payload.bodyRevision, "bodyRevision", 1);
  if (payload.bodyId !== fragment.bodyId || payload.bodyRevision !== fragment.bodyRevision
      || payload.resultHash !== fragment.bodyHash) {
    fail("lineage-mismatch", "public payload differs from its fragment binding");
  }
}

function assertFragment(fragment, context = {}) {
  exactKeys(fragment, ["type", "schema", "matchId", "authorityIncarnation", "ballparkEpoch", "manifestHash",
    "fragmentId", "fragmentRevision", "snapshotId", "tick", "simTime", "eventWatermark", "fieldRevision",
    "overloadMode", "bodyId", "bodyRevision", "bodyHash", "public"], "public fragment");
  if (fragment.type !== "publicFragment" || fragment.schema !== FRAGMENT_SCHEMA) {
    fail("unknown-schema", "public fragment schema is unsupported");
  }
  for (const key of ["matchId", "manifestHash", "fragmentId", "snapshotId", "overloadMode", "bodyId", "bodyHash"]) {
    string(fragment[key], key);
  }
  for (const key of ["authorityIncarnation", "ballparkEpoch", "fragmentRevision", "bodyRevision"]) {
    integer(fragment[key], key, 1);
  }
  for (const key of ["tick", "eventWatermark", "fieldRevision"]) integer(fragment[key], key);
  finite(fragment.simTime, "simTime");
  for (const key of ["matchId", "authorityIncarnation", "ballparkEpoch", "manifestHash"]) {
    if (context[key] !== undefined && context[key] !== fragment[key]) {
      fail("identity-mismatch", `${key} differs from the pinned fragment context`);
    }
  }
  assertPublicPayload(fragment.public, fragment);
  return true;
}

function assertOverlay(overlay, context = {}) {
  exactKeys(overlay, ["type", "schema", "matchId", "sessionId", "authorityIncarnation", "recipientId",
    "recipientIncarnation", "frameId", "statePairId", "snapshotId", "tick", "simTime", "eventWatermark",
    "fieldRevision", "overloadMode", "ballparkEpoch", "manifestHash", "fragmentId", "fragmentRevision",
    "fragmentHash", "bodyId", "bodyHash", "owner"], "owner overlay");
  if (overlay.type !== "ownerOverlay" || overlay.schema !== OVERLAY_SCHEMA) {
    fail("unknown-schema", "owner overlay schema is unsupported");
  }
  for (const key of ["matchId", "sessionId", "recipientId", "statePairId", "snapshotId", "overloadMode",
    "manifestHash", "fragmentId", "fragmentHash", "bodyId", "bodyHash"]) string(overlay[key], key);
  for (const key of ["authorityIncarnation", "recipientIncarnation", "frameId", "ballparkEpoch",
    "fragmentRevision"]) integer(overlay[key], key, 1);
  for (const key of ["tick", "eventWatermark", "fieldRevision"]) integer(overlay[key], key);
  finite(overlay.simTime, "simTime");
  for (const key of ["matchId", "sessionId", "authorityIncarnation", "recipientId", "recipientIncarnation",
    "manifestHash"]) {
    if (context[key] !== undefined && context[key] !== overlay[key]) {
      fail("identity-mismatch", `${key} differs from the pinned overlay context`);
    }
  }
  exactKeys(overlay.owner, ["kind", "resultHash", "view"], "owner overlay payload");
  if (overlay.owner.kind !== "keyframe") fail("invalid-layout", "owner overlay must be a complete keyframe");
  string(overlay.owner.resultHash, "owner.resultHash");
  if (!plainObject(overlay.owner.view)) fail("invalid-layout", "owner overlay view must be a plain object");
  return true;
}

function encodeEnvelope(magic, value, maxBytes, validate) {
  validate(value);
  const canonical = canonicalJsonBytes(value);
  if (canonical.length > maxBytes) fail("frame-too-large", "split replication source exceeds its fixed cap");
  const compressed = zlib.brotliCompressSync(canonical, {
    params: { [zlib.constants.BROTLI_PARAM_QUALITY]: 1 },
  });
  const wire = Buffer.allocUnsafe(HEADER_BYTES + compressed.length);
  magic.copy(wire, 0);
  wire.writeUInt8(1, 8);
  wire.writeUInt32BE(canonical.length, 9);
  wire.writeUInt32BE(compressed.length, 13);
  sha256(canonical).copy(wire, 17);
  compressed.copy(wire, HEADER_BYTES);
  return Object.freeze({ wire, semanticDigest: digestString(canonical), canonicalBytes: canonical.length,
    compressedBytes: wire.length });
}

function decodeEnvelope(raw, magic, maxBytes, validate, context) {
  if (!Buffer.isBuffer(raw) && !(raw instanceof Uint8Array)) fail("invalid-encoding", "split frame must be binary");
  const wire = Buffer.isBuffer(raw) ? raw : Buffer.from(raw.buffer, raw.byteOffset, raw.byteLength);
  if (wire.length < HEADER_BYTES || !wire.subarray(0, 8).equals(magic) || wire.readUInt8(8) !== 1) {
    fail("invalid-encoding", "split frame header is invalid");
  }
  const originalLength = wire.readUInt32BE(9);
  const compressedLength = wire.readUInt32BE(13);
  if (originalLength < 1 || originalLength > maxBytes || compressedLength !== wire.length - HEADER_BYTES) {
    fail("frame-too-large", "split frame lengths are invalid");
  }
  let canonical;
  try { canonical = zlib.brotliDecompressSync(wire.subarray(HEADER_BYTES), { maxOutputLength: maxBytes }); }
  catch { fail("invalid-compression", "split frame Brotli payload is invalid"); }
  if (canonical.length !== originalLength || !crypto.timingSafeEqual(sha256(canonical), wire.subarray(17, 49))) {
    fail("integrity-failure", "split frame digest or length is invalid");
  }
  let value;
  try { value = JSON.parse(canonical.toString("utf8")); }
  catch { fail("invalid-json", "split frame payload is not JSON"); }
  if (!canonical.equals(canonicalJsonBytes(value))) fail("noncanonical-json", "split frame payload is noncanonical");
  validate(value, context);
  return Object.freeze({ value, semanticDigest: digestString(canonical), wireBytes: wire.length });
}

function encodePublicFragment(fragment) {
  return encodeEnvelope(FRAGMENT_MAGIC, fragment, MAX_FRAGMENT_BYTES, assertFragment);
}

function decodePublicFragment(raw, context = {}) {
  return decodeEnvelope(raw, FRAGMENT_MAGIC, MAX_FRAGMENT_BYTES, assertFragment, context);
}

function encodeOwnerOverlay(overlay) {
  return encodeEnvelope(OVERLAY_MAGIC, overlay, MAX_OVERLAY_BYTES, assertOverlay);
}

function decodeOwnerOverlay(raw, context = {}) {
  return decodeEnvelope(raw, OVERLAY_MAGIC, MAX_OVERLAY_BYTES, assertOverlay, context);
}

function splitWireKind(raw) {
  if (!Buffer.isBuffer(raw) && !(raw instanceof Uint8Array)) return null;
  const wire = Buffer.isBuffer(raw) ? raw : Buffer.from(raw.buffer, raw.byteOffset, raw.byteLength);
  if (wire.length < 8) return null;
  if (wire.subarray(0, 8).equals(FRAGMENT_MAGIC)) return "fragment";
  if (wire.subarray(0, 8).equals(OVERLAY_MAGIC)) return "overlay";
  return null;
}

module.exports = {
  CAPABILITY,
  FRAGMENT_SCHEMA,
  OVERLAY_SCHEMA,
  MANIFEST,
  MANIFEST_HASH,
  MAX_FRAGMENT_BYTES,
  MAX_OVERLAY_BYTES,
  SplitPublicFragmentError,
  assertFragment,
  assertOverlay,
  encodePublicFragment,
  decodePublicFragment,
  encodeOwnerOverlay,
  decodeOwnerOverlay,
  splitWireKind,
};
