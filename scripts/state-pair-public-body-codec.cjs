"use strict";

const { canonicalJson } = require("./session-replication-manifest.cjs");

const CAPABILITY = "state-pair-public-body-v1";
const PAIR_SCHEMA = "lbh-authority-state-pair-body-v1";
const BODY_SCHEMA = "lbh-public-body-v1";
const BODY_DELTA_SCHEMA = "lbh-public-body-delta-v1";
const MAX_CODEC_BYTES = 256 * 1024;
const MAX_DEPTH = 40;
const MAX_NODES = 120000;
const FORBIDDEN_OBJECT_KEYS = new Set(["__proto__", "prototype", "constructor"]);
const PRIVATE_BODY_KEYS = new Set([
  "connectionId", "connectionEpoch", "sessionId", "membershipId", "recipientId",
  "recipientIncarnation", "playerId", "profileId", "commandCredential", "statePairId",
  "snapshotId", "frameId", "ack", "ackState", "recovery", "recoveryReason",
  "lastInputSeq", "lastActionSeq", "rigLevels", "cargo", "equipped", "consumables",
  "privateProgression", "ownerState", "transient",
]);

class PublicBodyCodecError extends Error {
  constructor(code, message) {
    super(message);
    this.name = "PublicBodyCodecError";
    this.code = code;
  }
}

function fail(code, message) {
  throw new PublicBodyCodecError(code, message);
}

function plainObject(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function requiredString(value, label) {
  if (typeof value !== "string" || !value || value.trim() !== value
      || value !== value.normalize("NFC") || Buffer.byteLength(value, "utf8") > 8192) {
    fail("invalid-string", `${label} is invalid`);
  }
  return value;
}

function integer(value, label, minimum = 0) {
  if (!Number.isSafeInteger(value) || value < minimum || Object.is(value, -0)) {
    fail("invalid-number", `${label} is invalid`);
  }
  return value;
}

function finite(value, label) {
  if (!Number.isFinite(value) || Object.is(value, -0)) fail("invalid-number", `${label} is invalid`);
  return value;
}

function exactKeys(value, expected, label) {
  if (!plainObject(value)) fail("invalid-layout", `${label} must be an object`);
  const keys = Object.keys(value).sort();
  const wanted = [...expected].sort();
  if (keys.length !== wanted.length || keys.some((key, index) => key !== wanted[index])) {
    fail("invalid-layout", `${label} fields are not exact`);
  }
}

function scanSafeJson(value, depth = 0, state = { nodes: 0 }, { privacy = false } = {}) {
  if (depth > MAX_DEPTH) fail("complexity-limit", "public-body frame is too deep");
  state.nodes += 1;
  if (state.nodes > MAX_NODES) fail("complexity-limit", "public-body frame is too complex");
  if (value === null || typeof value === "boolean" || typeof value === "string") return;
  if (typeof value === "number") { finite(value, "JSON number"); return; }
  if (Array.isArray(value)) {
    if (value.length > 16384) fail("complexity-limit", "public-body array is too large");
    for (const child of value) scanSafeJson(child, depth + 1, state, { privacy });
    return;
  }
  if (!plainObject(value)) fail("invalid-layout", "public-body frame contains a non-plain object");
  for (const [key, child] of Object.entries(value)) {
    if (FORBIDDEN_OBJECT_KEYS.has(key)) fail("forbidden-key", "public-body frame contains a forbidden key");
    if (privacy && PRIVATE_BODY_KEYS.has(key)) {
      fail("privacy-boundary", `public body contains recipient/private field ${key}`);
    }
    scanSafeJson(child, depth + 1, state, { privacy });
  }
}

function assertBodyBinding(body, frame) {
  exactKeys(body, ["schema", "matchId", "authorityIncarnation", "ballparkEpoch", "manifestHash",
    "bodyId", "bodyRevision", "world", "entities"], "public body");
  if (body.schema !== BODY_SCHEMA) fail("unknown-schema", "public body schema is unsupported");
  requiredString(body.matchId, "body.matchId");
  requiredString(body.manifestHash, "body.manifestHash");
  requiredString(body.bodyId, "body.bodyId");
  integer(body.authorityIncarnation, "body.authorityIncarnation", 1);
  integer(body.ballparkEpoch, "body.ballparkEpoch", 1);
  integer(body.bodyRevision, "body.bodyRevision", 1);
  if (body.matchId !== frame.matchId || body.authorityIncarnation !== frame.authorityIncarnation
      || body.ballparkEpoch !== frame.ballparkEpoch || body.manifestHash !== frame.manifestHash) {
    fail("identity-mismatch", "public body binding differs from its recipient envelope");
  }
  if (!plainObject(body.world) || !Array.isArray(body.entities)) {
    fail("invalid-layout", "public body world/entities are invalid");
  }
  scanSafeJson(body, 0, { nodes: 0 }, { privacy: true });
}

function assertPublicPayload(payload, frame) {
  if (!plainObject(payload)) fail("invalid-layout", "public body lane is invalid");
  if (payload.kind === "keyframe") {
    exactKeys(payload, ["kind", "schema", "bodyId", "bodyRevision", "resultHash", "body"],
      "public body keyframe");
    if (payload.schema !== BODY_SCHEMA) fail("unknown-schema", "public body keyframe schema is unsupported");
    assertBodyBinding(payload.body, frame);
    if (payload.bodyId !== payload.body.bodyId || payload.bodyRevision !== payload.body.bodyRevision) {
      fail("lineage-mismatch", "public body keyframe identity differs from its body");
    }
  } else if (payload.kind === "delta") {
    exactKeys(payload, ["kind", "schema", "baseBodyId", "baseBodyRevision", "baseHash", "bodyId",
      "bodyRevision", "resultHash", "structuralBaseHash", "structuralResultHash", "delta"],
      "public body delta");
    if (payload.schema !== BODY_DELTA_SCHEMA) fail("unknown-schema", "public body delta schema is unsupported");
    requiredString(payload.baseBodyId, "public.baseBodyId");
    integer(payload.baseBodyRevision, "public.baseBodyRevision", 1);
    requiredString(payload.structuralBaseHash, "public.structuralBaseHash");
    requiredString(payload.structuralResultHash, "public.structuralResultHash");
    if (!plainObject(payload.delta)) fail("invalid-layout", "public body delta is invalid");
    scanSafeJson(payload.delta);
  } else fail("invalid-layout", "public body lane kind is invalid");
  requiredString(payload.bodyId, "public.bodyId");
  integer(payload.bodyRevision, "public.bodyRevision", 1);
  requiredString(payload.resultHash, "public.resultHash");
  if (payload.bodyId !== frame.bodyId || payload.bodyRevision !== frame.bodyRevision
      || payload.resultHash !== frame.bodyHash) {
    fail("lineage-mismatch", "public body lane differs from its recipient envelope");
  }
}

function assertFrame(frame, context = {}) {
  exactKeys(frame, ["type", "pairSchema", "matchId", "sessionId", "authorityIncarnation",
    "recipientId", "recipientIncarnation", "frameId", "statePairId", "snapshotId", "tick",
    "simTime", "eventWatermark", "fieldRevision", "overloadMode", "ballparkEpoch", "manifestHash",
    "bodyId", "bodyRevision", "bodyHash", "public", "owner"], "public-body statePair");
  if (frame.type !== "statePair" || frame.pairSchema !== PAIR_SCHEMA) {
    fail("unknown-schema", "public-body statePair schema is unsupported");
  }
  for (const key of ["matchId", "sessionId", "recipientId", "statePairId", "snapshotId",
    "manifestHash", "bodyId", "bodyHash", "overloadMode"]) requiredString(frame[key], key);
  for (const key of ["authorityIncarnation", "recipientIncarnation", "frameId", "bodyRevision"]) {
    integer(frame[key], key, 1);
  }
  for (const key of ["tick", "eventWatermark", "fieldRevision"]) integer(frame[key], key);
  integer(frame.ballparkEpoch, "ballparkEpoch", 1);
  finite(frame.simTime, "simTime");
  for (const key of ["matchId", "sessionId", "authorityIncarnation", "recipientId",
    "recipientIncarnation", "manifestHash"]) {
    if (context[key] !== undefined && context[key] !== frame[key]) {
      fail("identity-mismatch", `${key} differs from the pinned public-body context`);
    }
  }
  assertPublicPayload(frame.public, frame);
  if (!plainObject(frame.owner) || !["keyframe", "delta"].includes(frame.owner.kind)) {
    fail("invalid-layout", "owner lane is invalid");
  }
  scanSafeJson(frame.owner);
  return true;
}

function encodePublicBodyFrame(frame, context) {
  assertFrame(frame, context);
  const wire = canonicalJson(frame);
  if (Buffer.byteLength(wire, "utf8") > MAX_CODEC_BYTES) {
    fail("frame-too-large", "public-body statePair exceeds codec limit");
  }
  return wire;
}

function decodePublicBodyFrame(raw, context) {
  const text = typeof raw === "string" ? raw
    : Buffer.isBuffer(raw) || raw instanceof Uint8Array
      ? new TextDecoder("utf-8", { fatal: true }).decode(raw)
      : fail("invalid-encoding", "public-body wire must be UTF-8 bytes");
  if (Buffer.byteLength(text, "utf8") > MAX_CODEC_BYTES) fail("frame-too-large", "public-body frame exceeds codec limit");
  let frame;
  try { frame = JSON.parse(text); } catch { fail("invalid-json", "public-body frame is not valid JSON"); }
  if (canonicalJson(frame) !== text) fail("noncanonical-json", "public-body frame is not canonical JSON");
  assertFrame(frame, context);
  return frame;
}

function codecContext(input = {}) {
  return Object.freeze({ matchId: input.matchId, sessionId: input.sessionId,
    authorityIncarnation: input.authorityIncarnation, recipientId: input.recipientId,
    recipientIncarnation: input.recipientIncarnation, manifestHash: input.manifestHash });
}

module.exports = {
  CAPABILITY,
  PAIR_SCHEMA,
  BODY_SCHEMA,
  BODY_DELTA_SCHEMA,
  MAX_CODEC_BYTES,
  PRIVATE_BODY_KEYS,
  PublicBodyCodecError,
  codecContext,
  assertFrame,
  scanPublicBodyPrivacy: (body) => scanSafeJson(body, 0, { nodes: 0 }, { privacy: true }),
  encodePublicBodyFrame,
  decodePublicBodyFrame,
};
