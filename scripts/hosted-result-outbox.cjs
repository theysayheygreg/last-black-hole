"use strict";

const crypto = require("crypto");
const { canonicalJsonBytes } = require("./session-replication-manifest.cjs");

const RESULT_SCHEMA = "lbh-hosted-authority-result-v1";
const MAX_RESULT_BYTES = 128 * 1024;
const TERMINAL_RUN_STATES = new Set(["DRAINING", "ENDED"]);
const OUTBOX_STATES = Object.freeze({
  PENDING: "pending", LEASED: "leased", DELIVERED: "delivered", DEAD_LETTER: "dead-letter",
});
const FORBIDDEN_OWNERSHIP_KEYS = new Set(["account", "account_id", "accountId", "profile", "profile_id", "profileId"]);

class HostedResultError extends Error {
  constructor(code = "HOSTED_RESULT_REJECTED") {
    super("hosted result rejected");
    this.name = "HostedResultError";
    this.code = code;
  }
}

function reject(code) { throw new HostedResultError(code); }
function hash(bytes) { return `sha256:${crypto.createHash("sha256").update(bytes).digest("hex")}`; }
function id(prefix, ...parts) {
  return `${prefix}_${crypto.createHash("sha256").update(parts.join("\u001f")).digest("hex").slice(0, 40)}`;
}
function copy(value) { return value == null ? value : JSON.parse(JSON.stringify(value)); }

function validateIdentifier(value) {
  if (typeof value !== "string" || value.length < 1 || value.length > 160 || value.trim() !== value) {
    reject("HOSTED_RESULT_INVALID");
  }
  return value;
}

function validateAuthorityIdentity(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)
      || Object.getPrototypeOf(value) !== Object.prototype) reject("HOSTED_RESULT_INVALID");
  const expected = ["run_id", "lease_id", "lease_epoch", "authority_incarnation"];
  const keys = Object.keys(value);
  if (keys.length !== expected.length || keys.some((key) => !expected.includes(key))) reject("HOSTED_RESULT_INVALID");
  if (!Number.isSafeInteger(value.lease_epoch) || value.lease_epoch < 1) reject("HOSTED_RESULT_INVALID");
  return Object.freeze({
    run_id: validateIdentifier(value.run_id),
    lease_id: validateIdentifier(value.lease_id),
    lease_epoch: value.lease_epoch,
    authority_incarnation: validateIdentifier(value.authority_incarnation),
  });
}

function inspectPlainData(value, depth = 0, seen = new Set(), counter = { nodes: 0 }) {
  counter.nodes += 1;
  if (depth > 12 || counter.nodes > 4096) reject("HOSTED_RESULT_INVALID");
  if (value == null || typeof value === "boolean") return;
  if (typeof value === "number") {
    if (!Number.isFinite(value)) reject("HOSTED_RESULT_INVALID");
    return;
  }
  if (typeof value === "string") {
    if (Buffer.byteLength(value, "utf8") > 16 * 1024 || value !== value.normalize("NFC")) reject("HOSTED_RESULT_INVALID");
    return;
  }
  if (typeof value !== "object" || seen.has(value) || Object.getOwnPropertySymbols(value).length) reject("HOSTED_RESULT_INVALID");
  seen.add(value);
  if (Array.isArray(value)) {
    if (value.length > 256) reject("HOSTED_RESULT_INVALID");
    for (let index = 0; index < value.length; index += 1) {
      if (!Object.hasOwn(value, index)) reject("HOSTED_RESULT_INVALID");
      inspectPlainData(value[index], depth + 1, seen, counter);
    }
  } else {
    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) reject("HOSTED_RESULT_INVALID");
    const descriptors = Object.getOwnPropertyDescriptors(value);
    const keys = Object.keys(descriptors);
    if (keys.length > 128) reject("HOSTED_RESULT_INVALID");
    for (const key of keys) {
      if (FORBIDDEN_OWNERSHIP_KEYS.has(key) || Buffer.byteLength(key, "utf8") > 160) reject("HOSTED_RESULT_INVALID");
      const descriptor = descriptors[key];
      if (!descriptor.enumerable || !Object.hasOwn(descriptor, "value")) reject("HOSTED_RESULT_INVALID");
      inspectPlainData(descriptor.value, depth + 1, seen, counter);
    }
  }
  seen.delete(value);
}

function canonicalResult(identity, payload) {
  const authority = validateAuthorityIdentity(identity);
  inspectPlainData(payload);
  const body = { schema: RESULT_SCHEMA, authority, payload };
  let bytes;
  try { bytes = canonicalJsonBytes(body); } catch { reject("HOSTED_RESULT_INVALID"); }
  if (bytes.length > MAX_RESULT_BYTES) reject("HOSTED_RESULT_TOO_LARGE");
  const resultHash = hash(bytes);
  return Object.freeze({
    authority, payload: Object.freeze(copy(payload)), bytes, result_hash: resultHash,
    result_id: id("result", authority.run_id, resultHash),
    idempotency_key: id("result_delivery", authority.run_id, resultHash),
  });
}

class InMemoryHostedResultOutbox {
  constructor({ now = Date.now, verifyAuthority, randomBytes = crypto.randomBytes, maxAttempts = 8,
    baseBackoffMs = 1000 } = {}) {
    if (typeof verifyAuthority !== "function") throw new TypeError("verifyAuthority is required");
    this.now = now;
    this.verifyAuthority = verifyAuthority;
    this.randomBytes = randomBytes;
    this.maxAttempts = maxAttempts;
    this.baseBackoffMs = baseBackoffMs;
    this.entries = new Map();
    this.byRun = new Map();
  }

  enqueue({ authority, payload } = {}) {
    const canonical = canonicalResult(authority, payload);
    const lease = this.verifyAuthority(canonical.authority);
    if (!lease || lease.active !== true || !TERMINAL_RUN_STATES.has(lease.run_state)
        || lease.run_id !== canonical.authority.run_id || lease.lease_id !== canonical.authority.lease_id
        || lease.lease_epoch !== canonical.authority.lease_epoch
        || lease.authority_incarnation !== canonical.authority.authority_incarnation) {
      reject("HOSTED_RESULT_FENCED");
    }
    const priorId = this.byRun.get(canonical.authority.run_id);
    if (priorId) {
      const prior = this.entries.get(priorId);
      if (prior.result_hash !== canonical.result_hash) reject("HOSTED_RESULT_CONFLICT");
      return this._public(prior);
    }
    const now = this.now();
    const entry = {
      result_id: canonical.result_id, idempotency_key: canonical.idempotency_key,
      run_id: canonical.authority.run_id, result_hash: canonical.result_hash,
      authority: canonical.authority, payload: canonical.payload, accepted_at: now,
      state: OUTBOX_STATES.PENDING, attempts: 0, available_at: now,
      delivery_lease_id: null, delivery_lease_owner: null, delivery_lease_expires_at: null,
      delivered_at: null, last_error_code: null,
    };
    this.entries.set(entry.result_id, entry);
    this.byRun.set(entry.run_id, entry.result_id);
    return this._public(entry);
  }

  claim({ owner, leaseMs = 30_000 } = {}) {
    validateIdentifier(owner);
    if (!Number.isSafeInteger(leaseMs) || leaseMs < 100 || leaseMs > 300_000) reject("HOSTED_RESULT_INVALID");
    this.recoverExpiredLeases();
    const now = this.now();
    const entry = [...this.entries.values()]
      .filter((candidate) => candidate.state === OUTBOX_STATES.PENDING && candidate.available_at <= now)
      .sort((a, b) => a.accepted_at - b.accepted_at || a.result_id.localeCompare(b.result_id))[0];
    if (!entry) return null;
    entry.state = OUTBOX_STATES.LEASED;
    entry.attempts += 1;
    entry.delivery_lease_id = `delivery_${this.randomBytes(20).toString("hex")}_${entry.attempts}`;
    entry.delivery_lease_owner = owner;
    entry.delivery_lease_expires_at = now + leaseMs;
    return this._public(entry);
  }

  markDelivered({ result_id, delivery_lease_id } = {}) {
    const entry = this._leased(result_id, delivery_lease_id);
    entry.state = OUTBOX_STATES.DELIVERED;
    entry.delivered_at = this.now();
    this._clearLease(entry);
    return this._public(entry);
  }

  markFailed({ result_id, delivery_lease_id, errorCode = "DELIVERY_FAILED", terminal = false } = {}) {
    const entry = this._leased(result_id, delivery_lease_id);
    entry.last_error_code = typeof errorCode === "string" ? errorCode.slice(0, 80) : "DELIVERY_FAILED";
    if (terminal || entry.attempts >= this.maxAttempts) {
      entry.state = OUTBOX_STATES.DEAD_LETTER;
      entry.available_at = null;
    } else {
      entry.state = OUTBOX_STATES.PENDING;
      entry.available_at = this.now() + this.baseBackoffMs * (2 ** Math.min(entry.attempts - 1, 16));
    }
    this._clearLease(entry);
    return this._public(entry);
  }

  recoverExpiredLeases() {
    const now = this.now();
    for (const entry of this.entries.values()) {
      if (entry.state === OUTBOX_STATES.LEASED && entry.delivery_lease_expires_at <= now) {
        entry.state = entry.attempts >= this.maxAttempts ? OUTBOX_STATES.DEAD_LETTER : OUTBOX_STATES.PENDING;
        entry.available_at = entry.state === OUTBOX_STATES.PENDING ? now : null;
        this._clearLease(entry);
      }
    }
  }

  get(resultId) { const entry = this.entries.get(resultId); return entry ? this._public(entry) : null; }
  list() { return [...this.entries.values()].map((entry) => this._public(entry)); }
  _leased(resultId, leaseId) {
    const entry = this.entries.get(validateIdentifier(resultId));
    if (!entry || entry.state !== OUTBOX_STATES.LEASED || entry.delivery_lease_id !== leaseId
        || entry.delivery_lease_expires_at <= this.now()) reject("HOSTED_RESULT_STALE_DELIVERY_LEASE");
    return entry;
  }
  _clearLease(entry) {
    entry.delivery_lease_id = null; entry.delivery_lease_owner = null; entry.delivery_lease_expires_at = null;
  }
  _public(entry) { return Object.freeze(copy(entry)); }
}

module.exports = {
  RESULT_SCHEMA, MAX_RESULT_BYTES, OUTBOX_STATES, HostedResultError,
  canonicalResult, validateAuthorityIdentity, InMemoryHostedResultOutbox,
};
