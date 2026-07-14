const crypto = require("crypto");

const SERVICE_MODES = Object.freeze({ LOCAL: "local", HOSTED: "hosted" });
const HOSTED_SCHEMA_VERSION = "lbh-hosted-boundary-v1";
const HOSTED_PRODUCT_MAX_PLAYERS = 4;
const MAX_HOSTED_BODY_BYTES = 256 * 1024;

const COMPATIBILITY_ID_MAP = Object.freeze({
  sessionId: "session_id",
  runId: "run_id",
  membershipId: "run_membership_id",
  connectionId: "connection_id",
  connectionEpoch: "connection_epoch",
});

class HostedBoundaryError extends Error {
  constructor(code = "HOSTED_BOUNDARY_REJECTED") {
    super("hosted boundary rejected");
    this.name = "HostedBoundaryError";
    this.code = code;
  }
}

function reject(code) {
  throw new HostedBoundaryError(code);
}

function resolveServiceMode(value = process.env.LBH_SERVICE_MODE) {
  const normalized = value == null || value === "" ? SERVICE_MODES.LOCAL : String(value).trim().toLowerCase();
  if (normalized !== SERVICE_MODES.LOCAL && normalized !== SERVICE_MODES.HOSTED) {
    reject("INVALID_SERVICE_MODE");
  }
  return normalized;
}

function isPlainRecord(value) {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function assertPlainData(value, {
  maxDepth = 12,
  maxNodes = 4096,
  maxStringBytes = 16 * 1024,
  maxArrayLength = 256,
  maxObjectKeys = 128,
} = {}) {
  const seen = new Set();
  let nodes = 0;

  function visit(current, depth) {
    nodes += 1;
    if (nodes > maxNodes || depth > maxDepth) reject("HOSTED_SCHEMA_INVALID");
    if (current == null || typeof current === "boolean") return;
    if (typeof current === "number") {
      if (!Number.isFinite(current)) reject("HOSTED_SCHEMA_INVALID");
      return;
    }
    if (typeof current === "string") {
      if (Buffer.byteLength(current, "utf8") > maxStringBytes) reject("HOSTED_SCHEMA_INVALID");
      return;
    }
    if (typeof current !== "object" || typeof current === "function") reject("HOSTED_SCHEMA_INVALID");
    if (seen.has(current)) reject("HOSTED_SCHEMA_INVALID");
    seen.add(current);
    if (Object.getOwnPropertySymbols(current).length > 0) reject("HOSTED_SCHEMA_INVALID");

    if (Array.isArray(current)) {
      if (current.length > maxArrayLength) reject("HOSTED_SCHEMA_INVALID");
      for (const entry of current) visit(entry, depth + 1);
      seen.delete(current);
      return;
    }
    if (!isPlainRecord(current)) reject("HOSTED_SCHEMA_INVALID");
    const descriptors = Object.getOwnPropertyDescriptors(current);
    const keys = Object.keys(descriptors);
    if (keys.length > maxObjectKeys) reject("HOSTED_SCHEMA_INVALID");
    for (const key of keys) {
      const descriptor = descriptors[key];
      if (!descriptor.enumerable || !Object.hasOwn(descriptor, "value")) reject("HOSTED_SCHEMA_INVALID");
      if (Buffer.byteLength(key, "utf8") > 160) reject("HOSTED_SCHEMA_INVALID");
      visit(descriptor.value, depth + 1);
    }
    seen.delete(current);
  }

  visit(value, 0);
  return value;
}

function assertExactKeys(value, allowed, required = allowed) {
  if (!isPlainRecord(value)) reject("HOSTED_SCHEMA_INVALID");
  const keys = Object.keys(value);
  if (keys.some((key) => !allowed.includes(key))) reject("HOSTED_SCHEMA_INVALID");
  if (required.some((key) => !Object.hasOwn(value, key))) reject("HOSTED_SCHEMA_INVALID");
  return value;
}

function boundedIdentifier(value) {
  if (typeof value !== "string" || value.length < 1 || value.length > 160 || value.trim() !== value) {
    reject("HOSTED_SCHEMA_INVALID");
  }
  return value;
}

function assertHostedBodyBytes(rawBytes) {
  if (!Number.isSafeInteger(rawBytes) || rawBytes < 0 || rawBytes > MAX_HOSTED_BODY_BYTES) {
    reject("HOSTED_REQUEST_TOO_LARGE");
  }
}

function assertNoDuplicateJsonKeys(raw) {
  let index = 0;
  const text = String(raw);

  function whitespace() {
    while (/\s/.test(text[index] || "")) index += 1;
  }
  function stringToken() {
    if (text[index] !== '"') reject("HOSTED_SCHEMA_INVALID");
    const start = index;
    index += 1;
    while (index < text.length) {
      if (text[index] === "\\") {
        index += 2;
        continue;
      }
      if (text[index] === '"') {
        index += 1;
        try {
          return JSON.parse(text.slice(start, index));
        } catch {
          reject("HOSTED_SCHEMA_INVALID");
        }
      }
      index += 1;
    }
    reject("HOSTED_SCHEMA_INVALID");
  }
  function value() {
    whitespace();
    if (text[index] === "{") return object();
    if (text[index] === "[") return array();
    if (text[index] === '"') return stringToken();
    const match = text.slice(index).match(/^(?:-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?|true|false|null)/);
    if (!match) reject("HOSTED_SCHEMA_INVALID");
    index += match[0].length;
  }
  function object() {
    index += 1;
    whitespace();
    const keys = new Set();
    if (text[index] === "}") {
      index += 1;
      return;
    }
    while (index < text.length) {
      whitespace();
      const key = stringToken();
      if (keys.has(key)) reject("HOSTED_DUPLICATE_KEY");
      keys.add(key);
      whitespace();
      if (text[index] !== ":") reject("HOSTED_SCHEMA_INVALID");
      index += 1;
      value();
      whitespace();
      if (text[index] === "}") {
        index += 1;
        return;
      }
      if (text[index] !== ",") reject("HOSTED_SCHEMA_INVALID");
      index += 1;
    }
    reject("HOSTED_SCHEMA_INVALID");
  }
  function array() {
    index += 1;
    whitespace();
    if (text[index] === "]") {
      index += 1;
      return;
    }
    while (index < text.length) {
      value();
      whitespace();
      if (text[index] === "]") {
        index += 1;
        return;
      }
      if (text[index] !== ",") reject("HOSTED_SCHEMA_INVALID");
      index += 1;
    }
    reject("HOSTED_SCHEMA_INVALID");
  }

  value();
  whitespace();
  if (index !== text.length) reject("HOSTED_SCHEMA_INVALID");
  return true;
}

function unwrapHostedRequest(body, { allowedPayloadKeys, requiredPayloadKeys = allowedPayloadKeys } = {}) {
  assertPlainData(body);
  assertExactKeys(body, ["schemaVersion", "payload"]);
  if (body.schemaVersion !== HOSTED_SCHEMA_VERSION) reject("HOSTED_SCHEMA_INVALID");
  assertExactKeys(body.payload, allowedPayloadKeys, requiredPayloadKeys);
  return body.payload;
}

function wrapHostedRequest(payload) {
  assertPlainData(payload);
  return { schemaVersion: HOSTED_SCHEMA_VERSION, payload };
}

function wrapHostedResult(result) {
  assertPlainData(result);
  return { ok: true, schemaVersion: HOSTED_SCHEMA_VERSION, result };
}

function unwrapHostedResult(body) {
  assertPlainData(body);
  assertExactKeys(body, ["ok", "schemaVersion", "result"]);
  if (body.ok !== true || body.schemaVersion !== HOSTED_SCHEMA_VERSION) reject("HOSTED_SCHEMA_INVALID");
  return body.result;
}

function assertHostedProductSeats(playersOrCount) {
  const count = Array.isArray(playersOrCount) ? playersOrCount.length : playersOrCount;
  if (!Number.isSafeInteger(count) || count < 1 || count > HOSTED_PRODUCT_MAX_PLAYERS) {
    reject("HOSTED_SEAT_CAP");
  }
  return count;
}

function assertHostedSeatAdmission({ activeSeats, seatNo }) {
  if (!Number.isSafeInteger(activeSeats) || activeSeats < 0 || activeSeats >= HOSTED_PRODUCT_MAX_PLAYERS) {
    reject("HOSTED_SEAT_CAP");
  }
  if (!Number.isSafeInteger(seatNo) || seatNo < 0 || seatNo >= HOSTED_PRODUCT_MAX_PLAYERS) {
    reject("HOSTED_SEAT_CAP");
  }
  return true;
}

function assertHostedTicketIssuance(context) {
  assertPlainData(context);
  assertExactKeys(context, ["activeSeats", "seatNo", "authorityCount"]);
  assertHostedSeatAdmission(context);
  if (context.authorityCount !== 1) reject("HOSTED_AUTHORITY_COUNT");
  return true;
}

function assertHostedAuthorityAdmission(context) {
  return assertHostedTicketIssuance(context);
}

function rejectServerDerivedIdentityFields(value) {
  assertPlainData(value);
  const forbidden = /^(?:account|profile|session|run|membership|player|lease|authority)(?:Id|_id)$/;
  const stack = [value];
  while (stack.length > 0) {
    const current = stack.pop();
    if (!current || typeof current !== "object") continue;
    for (const [key, entry] of Object.entries(current)) {
      if (forbidden.test(key)) reject("HOSTED_CALLER_IDENTITY_FORBIDDEN");
      if (entry && typeof entry === "object") stack.push(entry);
    }
  }
  return value;
}

function authorizeLocator({ authenticatedPrincipalId, recordOwnerPrincipalId, locator }) {
  boundedIdentifier(authenticatedPrincipalId);
  boundedIdentifier(recordOwnerPrincipalId);
  boundedIdentifier(locator);
  if (authenticatedPrincipalId !== recordOwnerPrincipalId) reject("HOSTED_NOT_AUTHORIZED");
  return true;
}

function diagnosticAlias(kind, value, key) {
  const normalizedKind = boundedIdentifier(kind).replace(/[^A-Za-z0-9_-]/g, "_");
  const normalizedKey = boundedIdentifier(key);
  const normalizedValue = boundedIdentifier(value);
  const digest = crypto.createHmac("sha256", normalizedKey).update(normalizedValue, "utf8").digest("base64url").slice(0, 16);
  return `${normalizedKind}_${digest}`;
}

function compatibilityIds(source = {}) {
  assertPlainData(source);
  const mapped = {};
  for (const [legacy, hosted] of Object.entries(COMPATIBILITY_ID_MAP)) {
    if (source[legacy] !== undefined) mapped[hosted] = source[legacy];
  }
  return mapped;
}

module.exports = {
  SERVICE_MODES,
  HOSTED_SCHEMA_VERSION,
  HOSTED_PRODUCT_MAX_PLAYERS,
  MAX_HOSTED_BODY_BYTES,
  COMPATIBILITY_ID_MAP,
  HostedBoundaryError,
  resolveServiceMode,
  assertPlainData,
  assertExactKeys,
  assertHostedBodyBytes,
  assertNoDuplicateJsonKeys,
  unwrapHostedRequest,
  wrapHostedRequest,
  wrapHostedResult,
  unwrapHostedResult,
  assertHostedProductSeats,
  assertHostedSeatAdmission,
  assertHostedTicketIssuance,
  assertHostedAuthorityAdmission,
  rejectServerDerivedIdentityFields,
  authorizeLocator,
  diagnosticAlias,
  compatibilityIds,
};
