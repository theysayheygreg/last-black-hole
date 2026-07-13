"use strict";

const crypto = require("crypto");

const MANIFEST_SCHEMA = "lbh-session-replication-manifest-v1";
const MAX_MANIFEST_BYTES = 1024 * 1024;
const FETCH_CAPABILITY_BYTES = 32;
const FETCH_CAPABILITY_PATTERN = /^[A-Za-z0-9_-]{43}$/;
const DEFAULT_FETCH_TTL_MS = 10_000;
const DEFAULT_FETCH_CAPACITY = 64;

class SessionManifestError extends Error {
  constructor(code, message) {
    super(message);
    this.name = "SessionManifestError";
    this.code = code;
  }
}

function fail(code, message) {
  throw new SessionManifestError(code, message);
}

function compareCodePoints(left, right) {
  const a = Array.from(left, (character) => character.codePointAt(0));
  const b = Array.from(right, (character) => character.codePointAt(0));
  for (let index = 0; index < Math.min(a.length, b.length); index += 1) {
    if (a[index] !== b[index]) return a[index] - b[index];
  }
  return a.length - b.length;
}

function canonicalJson(value, path = "$", seen = new Set()) {
  if (value === null) return "null";
  if (typeof value === "boolean") return value ? "true" : "false";
  if (typeof value === "number") {
    if (!Number.isFinite(value)) fail("non-finite-number", `${path} must be finite`);
    return Object.is(value, -0) ? "0" : JSON.stringify(value);
  }
  if (typeof value === "string") {
    if (value !== value.normalize("NFC")) fail("non-nfc-string", `${path} must be NFC-normalized`);
    return JSON.stringify(value);
  }
  if (typeof value !== "object") fail("non-json-value", `${path} is not a JSON value`);
  if (seen.has(value)) fail("cyclic-value", `${path} is cyclic`);
  seen.add(value);
  let encoded;
  if (Array.isArray(value)) {
    encoded = `[${value.map((entry, index) => canonicalJson(entry, `${path}[${index}]`, seen)).join(",")}]`;
  } else {
    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) fail("non-json-object", `${path} must be a plain object`);
    const keys = Object.keys(value).sort(compareCodePoints);
    encoded = `{${keys.map((key) => {
      if (key !== key.normalize("NFC")) fail("non-nfc-key", `${path} contains a non-NFC key`);
      if (value[key] === undefined) fail("non-json-value", `${path}.${key} is undefined`);
      return `${JSON.stringify(key)}:${canonicalJson(value[key], `${path}.${key}`, seen)}`;
    }).join(",")}}`;
  }
  seen.delete(value);
  return encoded;
}

function canonicalJsonBytes(value) {
  return Buffer.from(canonicalJson(value), "utf8");
}

function deepFreeze(value) {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) deepFreeze(child);
  return Object.freeze(value);
}

function createSessionReplicationManifest({ runId, map, publicContent = {}, schema = MANIFEST_SCHEMA } = {}) {
  if (typeof runId !== "string" || !runId || runId.trim() !== runId) fail("invalid-run", "runId is required");
  if (!map || typeof map !== "object" || Array.isArray(map)) fail("invalid-map", "map is required");
  const staticMap = {
    id: map.id,
    name: map.name,
    worldScale: map.worldScale,
    fluidResolution: map.fluidResolution,
    route: map.route ?? null,
    wells: map.wells ?? [],
    stars: map.stars ?? [],
    wrecks: map.wrecks ?? [],
    planetoids: map.planetoids ?? [],
  };
  const manifest = deepFreeze({
    manifestSchema: schema,
    runId,
    map: staticMap,
    publicContent,
  });
  const bytes = canonicalJsonBytes(manifest);
  if (bytes.length > MAX_MANIFEST_BYTES) fail("manifest-too-large", `manifest exceeds ${MAX_MANIFEST_BYTES} bytes`);
  const manifestHash = `sha256:${crypto.createHash("sha256").update(bytes).digest("hex")}`;
  const immutableBytes = Buffer.from(bytes);
  return Object.freeze({
    manifest,
    get bytes() { return Buffer.from(immutableBytes); },
    manifestSchema: schema,
    manifestHash,
    manifestBytes: bytes.length,
    fetchPath: `/multiplayer/manifest/${manifestHash.slice(7)}`,
  });
}

function createManifestFetchRegistry({
  now = Date.now, randomBytes = crypto.randomBytes, ttlMs = DEFAULT_FETCH_TTL_MS,
  capacity = DEFAULT_FETCH_CAPACITY,
} = {}) {
  const records = new Map();
  const proofs = new Set();
  const acceptedCaches = new Set();
  const digest = (token) => crypto.createHash("sha256").update(token, "utf8").digest("hex");
  const proofKey = ({ runId, membershipId, manifestHash, connectionEpoch }) =>
    JSON.stringify([runId, membershipId, manifestHash, connectionEpoch]);
  const cacheKey = ({ runId, membershipId, manifestHash }) => JSON.stringify([runId, membershipId, manifestHash]);
  function pruneExpired(at = now()) {
    for (const [key, record] of records) if (at >= record.expiresAt) records.delete(key);
  }
  function issue({ runId, membershipId, manifestHash, connectionEpoch = null }) {
    const issuedAt = now();
    pruneExpired(issuedAt);
    if (records.size >= capacity) fail("capability-capacity", "manifest fetch capability capacity is exhausted");
    const tokenBytes = randomBytes(FETCH_CAPABILITY_BYTES);
    if (!Buffer.isBuffer(tokenBytes) || tokenBytes.length !== FETCH_CAPABILITY_BYTES) fail("capability-generation", "randomBytes returned an invalid capability");
    const token = tokenBytes.toString("base64url");
    records.set(digest(token), { runId, membershipId, manifestHash, connectionEpoch, expiresAt: issuedAt + ttlMs, used: false });
    return Object.freeze({ capability: token, expiresAt: issuedAt + ttlMs });
  }
  function redeem(token, expected) {
    if (typeof token !== "string" || !FETCH_CAPABILITY_PATTERN.test(token)) fail("invalid-capability", "manifest capability is malformed");
    const key = digest(token);
    const record = records.get(key);
    if (!record || record.used || now() >= record.expiresAt) {
      records.delete(key);
      fail("invalid-capability", "manifest capability is unknown, used, or expired");
    }
    for (const field of ["runId", "membershipId", "manifestHash"]) {
      if (expected[field] !== undefined && record[field] !== expected[field]) fail("capability-mismatch", `manifest capability ${field} mismatch`);
    }
    record.used = true;
    records.delete(key);
    if (proofs.size >= capacity && !proofs.has(proofKey(record))) fail("proof-capacity", "manifest proof capacity is exhausted");
    proofs.add(proofKey(record));
    return Object.freeze({ ...record });
  }
  function consumeProof(expected) {
    const key = proofKey(expected);
    if (proofs.delete(key)) {
      acceptedCaches.add(cacheKey(expected));
      return true;
    }
    if (!acceptedCaches.has(cacheKey(expected))) fail("manifest-not-fetched", "manifest fetch proof is missing");
    return true;
  }
  function reset() {
    const count = records.size + proofs.size;
    records.clear();
    proofs.clear();
    acceptedCaches.clear();
    return count;
  }
  return Object.freeze({
    issue, redeem, consumeProof, reset,
    diagnostics: () => Object.freeze({ retained: records.size, verified: proofs.size, cachedBindings: acceptedCaches.size, ttlMs, capacity }),
  });
}

module.exports = {
  MANIFEST_SCHEMA,
  MAX_MANIFEST_BYTES,
  DEFAULT_FETCH_TTL_MS,
  DEFAULT_FETCH_CAPACITY,
  SessionManifestError,
  compareCodePoints,
  canonicalJson,
  canonicalJsonBytes,
  createSessionReplicationManifest,
  createManifestFetchRegistry,
};
