"use strict";

const crypto = require("crypto");
const { DatabaseSync } = require("node:sqlite");
const {
  HostedResultError, OUTBOX_STATES, canonicalResult, validateAuthorityIdentity,
} = require("./hosted-result-outbox.cjs");

function reject(code) { throw new HostedResultError(code); }
function copy(value) { return value == null ? value : JSON.parse(JSON.stringify(value)); }
function json(value) { return JSON.stringify(value); }
function parse(value) { return JSON.parse(value); }
function validId(value) {
  if (typeof value !== "string" || value.length < 1 || value.length > 160 || value.trim() !== value) {
    reject("HOSTED_RESULT_INVALID");
  }
  return value;
}

function configure(db, { referenceAuthorityMode = false } = {}) {
  db.exec("PRAGMA foreign_keys=ON; PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL; PRAGMA busy_timeout=5000;");
  db.exec(`
    CREATE TABLE IF NOT EXISTS hosted_result_journal (
      result_id TEXT PRIMARY KEY,
      idempotency_key TEXT NOT NULL UNIQUE,
      run_id TEXT NOT NULL UNIQUE,
      result_hash TEXT NOT NULL,
      lease_id TEXT NOT NULL,
      lease_epoch INTEGER NOT NULL,
      authority_incarnation TEXT NOT NULL,
      payload_json TEXT NOT NULL,
      prepared_at INTEGER NOT NULL,
      placement_accepted_at INTEGER,
      finalized_at INTEGER,
      state TEXT NOT NULL CHECK(state IN ('prepared','accepted','finalized')),
      CHECK((state = 'prepared') = (placement_accepted_at IS NULL)),
      CHECK((state = 'finalized') = (finalized_at IS NOT NULL))
    );
    CREATE INDEX IF NOT EXISTS hosted_result_journal_recovery
      ON hosted_result_journal(state, prepared_at, result_id);
    CREATE TABLE IF NOT EXISTS hosted_result_outbox (
      result_id TEXT PRIMARY KEY,
      idempotency_key TEXT NOT NULL UNIQUE,
      run_id TEXT NOT NULL UNIQUE,
      result_hash TEXT NOT NULL,
      lease_id TEXT NOT NULL,
      lease_epoch INTEGER NOT NULL,
      authority_incarnation TEXT NOT NULL,
      payload_json TEXT NOT NULL,
      accepted_at INTEGER NOT NULL,
      state TEXT NOT NULL CHECK(state IN ('pending','leased','delivered','dead-letter')),
      attempts INTEGER NOT NULL DEFAULT 0 CHECK(attempts >= 0),
      available_at INTEGER,
      delivery_lease_id TEXT UNIQUE,
      delivery_lease_owner TEXT,
      delivery_lease_expires_at INTEGER,
      delivered_at INTEGER,
      last_error_code TEXT,
      CHECK((state = 'leased') = (delivery_lease_id IS NOT NULL)),
      CHECK((delivery_lease_id IS NULL) = (delivery_lease_owner IS NULL)),
      CHECK((delivery_lease_id IS NULL) = (delivery_lease_expires_at IS NULL))
    );
    CREATE INDEX IF NOT EXISTS hosted_result_outbox_claim
      ON hosted_result_outbox(state, available_at, accepted_at, result_id);
  `);
  if (referenceAuthorityMode) db.exec(`
    CREATE TABLE IF NOT EXISTS hosted_reference_authority_lineages (
      run_id TEXT PRIMARY KEY,
      lease_id TEXT NOT NULL,
      lease_epoch INTEGER NOT NULL CHECK(lease_epoch >= 1),
      authority_incarnation TEXT NOT NULL,
      run_state TEXT NOT NULL CHECK(run_state IN ('ALLOCATING','READY','ACTIVE','DRAINING','ENDED','FENCED')),
      active INTEGER NOT NULL CHECK(active IN (0,1)),
      accepted_result_id TEXT,
      accepted_result_hash TEXT,
      accepted_at INTEGER,
      CHECK((accepted_result_id IS NULL) = (accepted_result_hash IS NULL)),
      CHECK((accepted_result_hash IS NULL) = (accepted_at IS NULL))
    );
  `);
  return db;
}

function openDatabase({ filepath, db, referenceAuthorityMode = false } = {}) {
  if (db) return { db: configure(db, { referenceAuthorityMode }), ownsDb: false };
  if (typeof filepath !== "string" || !filepath) throw new TypeError("filepath or db is required");
  return { db: configure(new DatabaseSync(filepath), { referenceAuthorityMode }), ownsDb: true };
}

class SQLiteHostedResultOutbox {
  constructor({ filepath, db, now = Date.now, randomBytes = crypto.randomBytes,
    maxAttempts = 8, baseBackoffMs = 1000, fault = () => {},
    acceptAuthorityResult, referenceAuthorityMode = false } = {}) {
    if (!referenceAuthorityMode && typeof acceptAuthorityResult !== "function") {
      throw new TypeError("acceptAuthorityResult is required outside explicit reference authority mode");
    }
    const opened = openDatabase({ filepath, db, referenceAuthorityMode });
    this.db = opened.db;
    this.ownsDb = opened.ownsDb;
    this.now = now;
    this.randomBytes = randomBytes;
    this.maxAttempts = maxAttempts;
    this.baseBackoffMs = baseBackoffMs;
    this.fault = fault;
    this.referenceAuthorityMode = referenceAuthorityMode;
    this.acceptAuthorityResult = referenceAuthorityMode
      ? (identity, resultHash, resultId, acceptedAt) => this._acceptReference(identity, resultHash, resultId, acceptedAt)
      : acceptAuthorityResult;
  }

  close() { if (this.ownsDb) this.db.close(); }

  registerAuthority(authority, { runState = "DRAINING", active = true } = {}) {
    this._requireReferenceMode();
    const identity = validateAuthorityIdentity(authority);
    if (!["ALLOCATING", "READY", "ACTIVE", "DRAINING", "ENDED", "FENCED"].includes(runState)) {
      reject("HOSTED_RESULT_INVALID");
    }
    this.db.prepare(`
      INSERT INTO hosted_reference_authority_lineages
        (run_id, lease_id, lease_epoch, authority_incarnation, run_state, active)
      VALUES (?, ?, ?, ?, ?, ?)
      ON CONFLICT(run_id) DO UPDATE SET
        lease_id=excluded.lease_id, lease_epoch=excluded.lease_epoch,
        authority_incarnation=excluded.authority_incarnation, run_state=excluded.run_state, active=excluded.active
      WHERE hosted_reference_authority_lineages.accepted_result_hash IS NULL
        AND excluded.lease_epoch >= hosted_reference_authority_lineages.lease_epoch
    `).run(identity.run_id, identity.lease_id, identity.lease_epoch,
      identity.authority_incarnation, runState, active ? 1 : 0);
    return this.getAuthority(identity.run_id);
  }

  replaceAuthority(authority, options = {}) {
    const before = this.getAuthority(authority?.run_id);
    const after = this.registerAuthority(authority, options);
    return Boolean(after && (!before || after.lease_id === authority.lease_id)
      && after.accepted_result_hash == null);
  }

  setAuthorityState(runId, runState, active = true) {
    this._requireReferenceMode();
    validId(runId);
    if (!["ALLOCATING", "READY", "ACTIVE", "DRAINING", "ENDED", "FENCED"].includes(runState)) {
      reject("HOSTED_RESULT_INVALID");
    }
    this.db.prepare(`UPDATE hosted_reference_authority_lineages SET run_state=?, active=?
      WHERE run_id=?`).run(runState, active ? 1 : 0, runId);
    return this.getAuthority(runId);
  }

  getAuthority(runId) {
    this._requireReferenceMode();
    const row = this.db.prepare("SELECT * FROM hosted_reference_authority_lineages WHERE run_id=?").get(validId(runId));
    return row ? Object.freeze({ ...row, active: Boolean(row.active), accepted: row.accepted_result_hash != null }) : null;
  }

  enqueue({ authority, payload } = {}) {
    const canonical = canonicalResult(authority, payload);
    const prior = this.db.prepare("SELECT * FROM hosted_result_outbox WHERE run_id=?").get(canonical.authority.run_id);
    if (prior) {
      if (prior.result_hash !== canonical.result_hash) reject("HOSTED_RESULT_CONFLICT");
      return this._public(prior);
    }

    const journal = this._prepare(canonical);
    return this._recoverJournalRow(journal);
  }

  // Explicit startup/worker recovery. Every row contains canonical bytes before
  // placement can become terminal, so recovery never needs a caller to resubmit
  // (or choose) a payload. Placement acceptance is an idempotent exact-tuple CAS.
  recoverPrepared({ limit = 100 } = {}) {
    if (!Number.isSafeInteger(limit) || limit < 1 || limit > 10_000) reject("HOSTED_RESULT_INVALID");
    const rows = this.db.prepare(`SELECT * FROM hosted_result_journal
      WHERE state!='finalized' ORDER BY prepared_at,result_id LIMIT ?`).all(limit);
    return rows.map((row) => this._recoverJournalRow(row));
  }

  _prepare(canonical) {
    const prior = this.db.prepare("SELECT * FROM hosted_result_journal WHERE run_id=?")
      .get(canonical.authority.run_id);
    if (prior) {
      if (prior.result_hash !== canonical.result_hash
        || prior.result_id !== canonical.result_id
        || prior.idempotency_key !== canonical.idempotency_key) reject("HOSTED_RESULT_CONFLICT");
      return prior;
    }

    this.fault("before-result-prepare");
    const preparedAt = this.now();
    this.db.exec("BEGIN IMMEDIATE");
    try {
      const concurrent = this.db.prepare("SELECT * FROM hosted_result_journal WHERE run_id=?")
        .get(canonical.authority.run_id);
      if (concurrent) {
        if (concurrent.result_hash !== canonical.result_hash
          || concurrent.result_id !== canonical.result_id
          || concurrent.idempotency_key !== canonical.idempotency_key) reject("HOSTED_RESULT_CONFLICT");
        this.db.exec("COMMIT");
        return concurrent;
      }
      this.db.prepare(`INSERT INTO hosted_result_journal
        (result_id,idempotency_key,run_id,result_hash,lease_id,lease_epoch,authority_incarnation,
         payload_json,prepared_at,state)
        VALUES (?,?,?,?,?,?,?,?,?,'prepared')`).run(
        canonical.result_id, canonical.idempotency_key, canonical.authority.run_id,
        canonical.result_hash, canonical.authority.lease_id, canonical.authority.lease_epoch,
        canonical.authority.authority_incarnation, json(canonical.payload), preparedAt);
      this.fault("before-result-prepare-commit");
      this.db.exec("COMMIT");
    } catch (error) {
      if (this.db.isTransaction) this.db.exec("ROLLBACK");
      throw error;
    }
    const row = this.db.prepare("SELECT * FROM hosted_result_journal WHERE result_id=?")
      .get(canonical.result_id);
    this.fault("after-result-prepare");
    return row;
  }

  _recoverJournalRow(row) {
    const canonical = this._canonicalFromJournal(row);
    if (row.state === "prepared") {
      const accepted = this.acceptAuthorityResult(canonical.authority, canonical.result_hash,
        canonical.result_id, row.prepared_at, Object.keys(canonical.payload.outcomes).sort());
      if (!this._acceptanceMatches(accepted, canonical)) {
        // A definitive rejection means this speculative preparation never
        // became terminal and must not pin the run against its live lineage.
        // Thrown/ambiguous failures deliberately retain the canonical journal.
        if (accepted == null || accepted.accepted === false) {
          this.db.prepare("DELETE FROM hosted_result_journal WHERE result_id=? AND state='prepared'")
            .run(row.result_id);
        }
        reject("HOSTED_RESULT_FENCED");
      }
      this.fault("after-placement-accept-before-journal-accepted");
      // Compatibility hook retained for existing fault-harness callers.
      this.fault("after-placement-accept-before-outbox");
      this.db.prepare(`UPDATE hosted_result_journal
        SET state='accepted', placement_accepted_at=?
        WHERE result_id=? AND state='prepared'`).run(this.now(), row.result_id);
      row = this.db.prepare("SELECT * FROM hosted_result_journal WHERE result_id=?").get(row.result_id);
      this.fault("after-result-journal-accepted");
    } else {
      // Do not trust journal state alone across service/database boundaries.
      // Reverify the immutable tuple with placement before publishing bytes.
      const accepted = this.acceptAuthorityResult(canonical.authority, canonical.result_hash,
        canonical.result_id, row.prepared_at, Object.keys(canonical.payload.outcomes).sort());
      if (!this._acceptanceMatches(accepted, canonical)) reject("HOSTED_RESULT_FENCED");
    }

    return this._finalizeJournal(row);
  }

  _finalizeJournal(row) {
    const now = this.now();

    this.db.exec("BEGIN IMMEDIATE");
    try {
      const current = this.db.prepare("SELECT * FROM hosted_result_journal WHERE result_id=?").get(row.result_id);
      if (!current || current.state === "prepared") reject("HOSTED_RESULT_FENCED");
      const concurrent = this.db.prepare("SELECT * FROM hosted_result_outbox WHERE run_id=?").get(row.run_id);
      if (concurrent) {
        if (concurrent.result_hash !== row.result_hash || concurrent.result_id !== row.result_id) {
          reject("HOSTED_RESULT_CONFLICT");
        }
        if (current.state !== "finalized") this.db.prepare(`UPDATE hosted_result_journal
          SET state='finalized', finalized_at=? WHERE result_id=?`).run(now, row.result_id);
        this.db.exec("COMMIT");
        return this._public(concurrent);
      }
      this.db.prepare(`
        INSERT INTO hosted_result_outbox
          (result_id,idempotency_key,run_id,result_hash,lease_id,lease_epoch,authority_incarnation,
           payload_json,accepted_at,state,attempts,available_at)
        VALUES (?,?,?,?,?,?,?,?,?,'pending',0,?)
      `).run(row.result_id, row.idempotency_key, row.run_id, row.result_hash, row.lease_id,
        row.lease_epoch, row.authority_incarnation, row.payload_json,
        row.placement_accepted_at || row.prepared_at, now);
      this.db.prepare(`UPDATE hosted_result_journal SET state='finalized', finalized_at=?
        WHERE result_id=? AND state='accepted'`).run(now, row.result_id);
      this.fault("before-result-finalization-commit");
      this.fault("before-enqueue-commit");
      this.db.exec("COMMIT");
      const result = this.get(row.result_id);
      this.fault("after-result-finalization");
      return result;
    } catch (error) {
      if (this.db.isTransaction) this.db.exec("ROLLBACK");
      throw error;
    }
  }

  _canonicalFromJournal(row) {
    const authority = { run_id: row.run_id, lease_id: row.lease_id,
      lease_epoch: Number(row.lease_epoch), authority_incarnation: row.authority_incarnation };
    const recovered = canonicalResult(authority, parse(row.payload_json));
    if (recovered.result_id !== row.result_id || recovered.idempotency_key !== row.idempotency_key
      || recovered.result_hash !== row.result_hash) reject("HOSTED_RESULT_CONFLICT");
    return recovered;
  }

  claim({ owner, leaseMs = 30_000 } = {}) {
    validId(owner);
    if (!Number.isSafeInteger(leaseMs) || leaseMs < 100 || leaseMs > 300_000) reject("HOSTED_RESULT_INVALID");
    const now = this.now();
    this.db.exec("BEGIN IMMEDIATE");
    try {
      this._recoverExpiredLeases(now);
      const candidate = this.db.prepare(`SELECT result_id FROM hosted_result_outbox
        WHERE state='pending' AND available_at<=?
        ORDER BY accepted_at,result_id LIMIT 1`).get(now);
      if (!candidate) { this.db.exec("COMMIT"); return null; }
      const leaseId = `delivery_${this.randomBytes(20).toString("hex")}_${now}`;
      const claimed = this.db.prepare(`
        UPDATE hosted_result_outbox SET state='leased', attempts=attempts+1,
          delivery_lease_id=?, delivery_lease_owner=?, delivery_lease_expires_at=?
        WHERE result_id=? AND state='pending' AND available_at<=?
        RETURNING *
      `).get(leaseId, owner, now + leaseMs, candidate.result_id, now);
      this.db.exec("COMMIT");
      return claimed ? this._public(claimed) : null;
    } catch (error) {
      if (this.db.isTransaction) this.db.exec("ROLLBACK");
      throw error;
    }
  }

  markDelivered({ result_id, delivery_lease_id } = {}) {
    const now = this.now();
    const row = this.db.prepare(`
      UPDATE hosted_result_outbox SET state='delivered', delivered_at=?,
        delivery_lease_id=NULL,delivery_lease_owner=NULL,delivery_lease_expires_at=NULL
      WHERE result_id=? AND state='leased' AND delivery_lease_id=? AND delivery_lease_expires_at>?
      RETURNING *
    `).get(now, validId(result_id), validId(delivery_lease_id), now);
    if (!row) reject("HOSTED_RESULT_STALE_DELIVERY_LEASE");
    return this._public(row);
  }

  markFailed({ result_id, delivery_lease_id, errorCode = "DELIVERY_FAILED", terminal = false } = {}) {
    const now = this.now();
    this.db.exec("BEGIN IMMEDIATE");
    try {
      const row = this.db.prepare(`SELECT * FROM hosted_result_outbox
        WHERE result_id=? AND state='leased' AND delivery_lease_id=? AND delivery_lease_expires_at>?`).get(
        validId(result_id), validId(delivery_lease_id), now);
      if (!row) reject("HOSTED_RESULT_STALE_DELIVERY_LEASE");
      const dead = terminal || row.attempts >= this.maxAttempts;
      const availableAt = dead ? null : now + this.baseBackoffMs * (2 ** Math.min(row.attempts - 1, 16));
      const updated = this.db.prepare(`UPDATE hosted_result_outbox SET state=?, available_at=?, last_error_code=?,
        delivery_lease_id=NULL,delivery_lease_owner=NULL,delivery_lease_expires_at=NULL WHERE result_id=? RETURNING *`).get(
        dead ? OUTBOX_STATES.DEAD_LETTER : OUTBOX_STATES.PENDING, availableAt,
        typeof errorCode === "string" ? errorCode.slice(0, 80) : "DELIVERY_FAILED", row.result_id);
      this.db.exec("COMMIT");
      return this._public(updated);
    } catch (error) {
      if (this.db.isTransaction) this.db.exec("ROLLBACK");
      throw error;
    }
  }

  recoverExpiredLeases() {
    this.db.exec("BEGIN IMMEDIATE");
    try { this._recoverExpiredLeases(this.now()); this.db.exec("COMMIT"); }
    catch (error) { if (this.db.isTransaction) this.db.exec("ROLLBACK"); throw error; }
  }

  _recoverExpiredLeases(now) {
    this.db.prepare(`UPDATE hosted_result_outbox SET
      state=CASE WHEN attempts>=? THEN 'dead-letter' ELSE 'pending' END,
      available_at=CASE WHEN attempts>=? THEN NULL ELSE ? END,
      delivery_lease_id=NULL,delivery_lease_owner=NULL,delivery_lease_expires_at=NULL
      WHERE state='leased' AND delivery_lease_expires_at<=?`).run(this.maxAttempts, this.maxAttempts, now, now);
  }

  get(resultId) {
    const row = this.db.prepare("SELECT * FROM hosted_result_outbox WHERE result_id=?").get(validId(resultId));
    return row ? this._public(row) : null;
  }
  list() { return this.db.prepare("SELECT * FROM hosted_result_outbox ORDER BY accepted_at,result_id").all().map((row) => this._public(row)); }
  accepted(runId) {
    this._requireReferenceMode();
    const row = this.getAuthority(runId);
    return row?.accepted ? Object.freeze({ accepted: true, run_id: row.run_id, lease_id: row.lease_id,
      lease_epoch: row.lease_epoch, authority_incarnation: row.authority_incarnation,
      result_hash: row.accepted_result_hash, result_id: row.accepted_result_id }) : null;
  }
  _requireReferenceMode() {
    if (!this.referenceAuthorityMode) throw new TypeError("reference authority mode is not enabled");
  }
  _acceptReference(identity, resultHash, resultId, acceptedAt) {
    this.db.exec("BEGIN IMMEDIATE");
    try {
      const accepted = this.db.prepare(`
        UPDATE hosted_reference_authority_lineages
        SET accepted_result_id=?, accepted_result_hash=?, accepted_at=?
        WHERE run_id=? AND lease_id=? AND lease_epoch=? AND authority_incarnation=?
          AND active=1 AND run_state IN ('DRAINING','ENDED') AND accepted_result_hash IS NULL
        RETURNING *
      `).get(resultId, resultHash, acceptedAt, identity.run_id, identity.lease_id,
        identity.lease_epoch, identity.authority_incarnation);
      const row = accepted || this.db.prepare(`SELECT * FROM hosted_reference_authority_lineages
        WHERE run_id=? AND lease_id=? AND lease_epoch=? AND authority_incarnation=?
          AND accepted_result_id=? AND accepted_result_hash=?`).get(identity.run_id, identity.lease_id,
        identity.lease_epoch, identity.authority_incarnation, resultId, resultHash);
      this.db.exec("COMMIT");
      return row ? { accepted: true, run_id: row.run_id, lease_id: row.lease_id,
        lease_epoch: row.lease_epoch, authority_incarnation: row.authority_incarnation,
        result_hash: row.accepted_result_hash, result_id: row.accepted_result_id } : null;
    } catch (error) {
      if (this.db.isTransaction) this.db.exec("ROLLBACK");
      throw error;
    }
  }
  _acceptanceMatches(accepted, canonical) {
    return accepted?.accepted === true && accepted.run_id === canonical.authority.run_id
      && accepted.lease_id === canonical.authority.lease_id
      && Number(accepted.lease_epoch) === canonical.authority.lease_epoch
      && accepted.authority_incarnation === canonical.authority.authority_incarnation
      && accepted.result_hash === canonical.result_hash
      && (accepted.result_id == null || accepted.result_id === canonical.result_id);
  }
  _public(row) {
    return Object.freeze({
      result_id: row.result_id, idempotency_key: row.idempotency_key, run_id: row.run_id,
      result_hash: row.result_hash,
      authority: Object.freeze({ run_id: row.run_id, lease_id: row.lease_id,
        lease_epoch: row.lease_epoch, authority_incarnation: row.authority_incarnation }),
      payload: Object.freeze(parse(row.payload_json)), accepted_at: row.accepted_at,
      state: row.state, attempts: row.attempts, available_at: row.available_at,
      delivery_lease_id: row.delivery_lease_id, delivery_lease_owner: row.delivery_lease_owner,
      delivery_lease_expires_at: row.delivery_lease_expires_at, delivered_at: row.delivered_at,
      last_error_code: row.last_error_code,
    });
  }
}

module.exports = { SQLiteHostedResultOutbox, configureHostedResultOutboxDatabase: configure };
