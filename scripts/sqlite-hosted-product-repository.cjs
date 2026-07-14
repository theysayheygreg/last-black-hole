"use strict";

const crypto = require("node:crypto");
const { DatabaseSync } = require("node:sqlite");

const MATCH_STATES = new Set(["ALLOCATING", "READY", "ACTIVE", "DRAINING", "FENCED", "ENDED"]);
const WORKLOAD_STATES = MATCH_STATES;

function clone(value) { return value == null ? value : structuredClone(value); }
function text(value, name) {
  if (typeof value !== "string" || value.length < 1 || value.length > 1024) throw new TypeError(`${name} invalid`);
  return value;
}
function integer(value, name) {
  if (!Number.isSafeInteger(value) || value < 0) throw new TypeError(`${name} invalid`);
  return value;
}
function key(value) {
  const bytes = Buffer.isBuffer(value) ? Buffer.from(value)
    : value instanceof Uint8Array ? Buffer.from(value)
      : typeof value === "string" ? Buffer.from(value, "utf8") : null;
  if (!bytes || bytes.length < 32) throw new TypeError("hosted product encryption key must be at least 32 bytes");
  return crypto.createHash("sha256").update(bytes).digest();
}

class SqliteHostedProductRepository {
  constructor({ filepath, db, encryptionKey, encryptionKeyId, busyTimeoutMs = 5000, randomBytes = crypto.randomBytes } = {}) {
    if ((filepath == null) === (db == null)) throw new TypeError("provide exactly one hosted product sqlite filepath or db");
    if (!Number.isSafeInteger(busyTimeoutMs) || busyTimeoutMs < 0 || busyTimeoutMs > 60_000) {
      throw new TypeError("hosted product sqlite busy timeout invalid");
    }
    this.encryptionKey = key(encryptionKey);
    this.encryptionKeyId = text(encryptionKeyId, "encryption key id");
    if (typeof randomBytes !== "function") throw new TypeError("randomBytes invalid");
    this.randomBytes = randomBytes;
    this.db = db || new DatabaseSync(filepath);
    this.ownsDb = !db;
    this.inTransaction = false;
    // Install the lock wait before any pragma that may need the schema lock.
    // Avoid re-requesting WAL on every process open: concurrent journal-mode
    // transitions can fail before SQLite's busy handler is involved.
    this.db.exec(`PRAGMA busy_timeout = ${busyTimeoutMs}; PRAGMA foreign_keys = ON;`);
    const journalMode = this.db.prepare("PRAGMA journal_mode").get().journal_mode;
    if (journalMode !== "wal" && journalMode !== "memory") this.db.exec("PRAGMA journal_mode = WAL;");
    this.db.exec("PRAGMA synchronous = FULL;");
    this._createSchema();
  }

  _createSchema() {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS hprod_matches (
        match_id TEXT PRIMARY KEY,
        run_id TEXT NOT NULL UNIQUE,
        session_id TEXT NOT NULL UNIQUE,
        join_code TEXT NOT NULL UNIQUE,
        allocation_handle TEXT NOT NULL UNIQUE,
        seat_count INTEGER NOT NULL CHECK (seat_count BETWEEN 1 AND 4),
        state TEXT NOT NULL CHECK (state IN ('ALLOCATING','READY','ACTIVE','DRAINING','FENCED','ENDED')),
        owner_account_id TEXT NOT NULL,
        row_version INTEGER NOT NULL DEFAULT 0 CHECK (row_version >= 0),
        key_id TEXT NOT NULL,
        nonce BLOB NOT NULL CHECK (length(nonce) = 12),
        auth_tag BLOB NOT NULL CHECK (length(auth_tag) = 16),
        ciphertext BLOB NOT NULL,
        UNIQUE (match_id, run_id),
        UNIQUE (match_id, run_id, session_id)
      ) STRICT;

      CREATE TABLE IF NOT EXISTS hprod_memberships (
        membership_id TEXT PRIMARY KEY,
        match_id TEXT NOT NULL,
        run_id TEXT NOT NULL,
        session_id TEXT NOT NULL,
        profile_id TEXT NOT NULL,
        account_id TEXT NOT NULL,
        seat_no INTEGER NOT NULL CHECK (seat_no BETWEEN 0 AND 3),
        run_membership_id TEXT NOT NULL UNIQUE,
        session_membership_id TEXT NOT NULL UNIQUE,
        admitted_at INTEGER CHECK (admitted_at IS NULL OR admitted_at >= 0),
        payload_json TEXT NOT NULL,
        FOREIGN KEY (match_id, run_id, session_id)
          REFERENCES hprod_matches(match_id, run_id, session_id) ON DELETE CASCADE,
        UNIQUE (match_id, profile_id),
        UNIQUE (match_id, account_id),
        UNIQUE (match_id, seat_no),
        UNIQUE (match_id, membership_id),
        UNIQUE (match_id, run_membership_id),
        UNIQUE (match_id, session_membership_id)
      ) STRICT;

      CREATE TRIGGER IF NOT EXISTS hprod_membership_capacity_insert
      BEFORE INSERT ON hprod_memberships
      BEGIN
        SELECT CASE WHEN NEW.seat_no >= (SELECT seat_count FROM hprod_matches WHERE match_id=NEW.match_id)
          THEN RAISE(ABORT, 'hosted product seat out of bounds') END;
        SELECT CASE WHEN (SELECT count(*) FROM hprod_memberships WHERE match_id=NEW.match_id) >=
          (SELECT seat_count FROM hprod_matches WHERE match_id=NEW.match_id)
          THEN RAISE(ABORT, 'hosted product match full') END;
      END;

      CREATE TRIGGER IF NOT EXISTS hprod_membership_lineage_update
      BEFORE UPDATE OF match_id,run_id,session_id,profile_id,account_id,seat_no,
        run_membership_id,session_membership_id ON hprod_memberships
      BEGIN SELECT RAISE(ABORT, 'hosted product membership lineage immutable'); END;

      CREATE TRIGGER IF NOT EXISTS hprod_match_seat_count_update
      BEFORE UPDATE OF seat_count ON hprod_matches
      BEGIN
        SELECT CASE WHEN NEW.seat_count < (SELECT count(*) FROM hprod_memberships WHERE match_id=OLD.match_id)
          THEN RAISE(ABORT, 'hosted product occupied seat reduction') END;
        SELECT CASE WHEN NEW.seat_count <= COALESCE((SELECT max(seat_no) FROM hprod_memberships WHERE match_id=OLD.match_id), -1)
          THEN RAISE(ABORT, 'hosted product occupied seat out of bounds') END;
      END;

      CREATE TABLE IF NOT EXISTS hprod_workload_contexts (
        workload_run_handle TEXT PRIMARY KEY,
        match_id TEXT NOT NULL,
        run_id TEXT NOT NULL,
        authority_lease_id TEXT NOT NULL,
        lease_epoch INTEGER NOT NULL CHECK (lease_epoch >= 1),
        authority_instance_id TEXT NOT NULL,
        authority_incarnation TEXT NOT NULL,
        credential_binding TEXT NOT NULL,
        state TEXT NOT NULL CHECK (state IN ('ALLOCATING','READY','ACTIVE','DRAINING','FENCED','ENDED')),
        row_version INTEGER NOT NULL DEFAULT 0 CHECK (row_version >= 0),
        payload_json TEXT NOT NULL,
        FOREIGN KEY (match_id, run_id) REFERENCES hprod_matches(match_id, run_id) ON DELETE CASCADE,
        UNIQUE (run_id, authority_lease_id, lease_epoch),
        UNIQUE (workload_run_handle, match_id, run_id, authority_lease_id, lease_epoch)
      ) STRICT;

      CREATE TRIGGER IF NOT EXISTS hprod_workload_lineage_update
      BEFORE UPDATE OF workload_run_handle,match_id,run_id,authority_lease_id,lease_epoch,
        authority_instance_id,authority_incarnation,credential_binding ON hprod_workload_contexts
      BEGIN SELECT RAISE(ABORT, 'hosted product workload lineage immutable'); END;

      CREATE INDEX IF NOT EXISTS hprod_memberships_match_idx ON hprod_memberships(match_id,seat_no);
      CREATE INDEX IF NOT EXISTS hprod_workloads_match_idx ON hprod_workload_contexts(match_id);
    `);
  }

  transaction(operation) {
    if (typeof operation !== "function") throw new TypeError("hosted product transaction operation required");
    if (this.inTransaction) return operation(this);
    this.db.exec("BEGIN IMMEDIATE");
    this.inTransaction = true;
    try {
      const result = operation(this);
      if (result && typeof result.then === "function") throw new TypeError("hosted product transactions must be synchronous");
      this.db.exec("COMMIT");
      return result;
    } catch (error) {
      try { this.db.exec("ROLLBACK"); } catch {}
      throw error;
    } finally { this.inTransaction = false; }
  }

  close() { if (this.ownsDb) this.db.close(); }

  _aad(matchId, keyId = this.encryptionKeyId) { return Buffer.from(`lbh:hprod:match:v1\0${keyId}\0${matchId}`, "utf8"); }
  _seal(match) {
    const nonce = Buffer.from(this.randomBytes(12));
    if (nonce.length !== 12) throw new TypeError("randomBytes returned invalid nonce");
    const cipher = crypto.createCipheriv("aes-256-gcm", this.encryptionKey, nonce);
    cipher.setAAD(this._aad(match.matchId));
    const ciphertext = Buffer.concat([cipher.update(JSON.stringify(match), "utf8"), cipher.final()]);
    return { nonce, authTag: cipher.getAuthTag(), ciphertext };
  }
  _open(row) {
    if (!row) return null;
    if (row.key_id !== this.encryptionKeyId) throw new Error("hosted product encryption key id unavailable");
    const decipher = crypto.createDecipheriv("aes-256-gcm", this.encryptionKey, row.nonce);
    decipher.setAAD(this._aad(row.match_id, row.key_id));
    decipher.setAuthTag(row.auth_tag);
    return JSON.parse(Buffer.concat([decipher.update(row.ciphertext), decipher.final()]).toString("utf8"));
  }
  _matchRow(where, value) {
    return this.db.prepare(`SELECT * FROM hprod_matches WHERE ${where}=?`).get(value);
  }
  _validateMatch(match) {
    for (const field of ["matchId", "runId", "sessionId", "joinCode", "allocationHandle", "ownerAccountId"]) text(match[field], field);
    if (!Number.isSafeInteger(match.seatCount) || match.seatCount < 1 || match.seatCount > 4) throw new TypeError("seatCount invalid");
    if (!MATCH_STATES.has(match.state)) throw new TypeError("match state invalid");
    return match;
  }

  createMatch(value) {
    const match = this._validateMatch(clone(value));
    const sealed = this._seal(match);
    this.db.prepare(`INSERT INTO hprod_matches
      (match_id,run_id,session_id,join_code,allocation_handle,seat_count,state,owner_account_id,
       row_version,key_id,nonce,auth_tag,ciphertext) VALUES(?,?,?,?,?,?,?,?,0,?,?,?,?)`)
      .run(match.matchId, match.runId, match.sessionId, match.joinCode, match.allocationHandle,
        match.seatCount, match.state, match.ownerAccountId, this.encryptionKeyId,
        sealed.nonce, sealed.authTag, sealed.ciphertext);
  }
  getMatch(matchId) { return this._open(this._matchRow("match_id", matchId)); }
  getMatchByJoinCode(joinCode) { return this._open(this._matchRow("join_code", joinCode)); }
  getMatchByAllocation(allocationHandle) { return this._open(this._matchRow("allocation_handle", allocationHandle)); }
  updateMatch(matchId, mutate, expectedRowVersion = null) {
    if (typeof mutate !== "function") throw new TypeError("match mutator required");
    const operation = () => {
      const row = this._matchRow("match_id", matchId);
      if (!row) return null;
      if (expectedRowVersion != null && row.row_version !== expectedRowVersion) return null;
      const next = this._validateMatch(clone(mutate(this._open(row))));
      if (next.matchId !== row.match_id || next.runId !== row.run_id || next.sessionId !== row.session_id
          || next.joinCode !== row.join_code || next.ownerAccountId !== row.owner_account_id) {
        throw new Error("hosted product match lineage immutable");
      }
      const sealed = this._seal(next);
      const result = this.db.prepare(`UPDATE hprod_matches SET allocation_handle=?,seat_count=?,state=?,
        row_version=row_version+1,key_id=?,nonce=?,auth_tag=?,ciphertext=?
        WHERE match_id=? AND row_version=?`)
        .run(next.allocationHandle, next.seatCount, next.state, this.encryptionKeyId,
          sealed.nonce, sealed.authTag, sealed.ciphertext, matchId, row.row_version);
      return result.changes === 1 ? clone(next) : null;
    };
    return this.inTransaction ? operation() : this.transaction(operation);
  }

  _validateMembership(value) {
    const member = clone(value);
    for (const field of ["membershipId", "matchId", "runId", "sessionId", "profileId", "accountId",
      "runMembershipId", "sessionMembershipId", "clientIncarnation", "playerAlias"]) text(member[field], field);
    if (!Number.isSafeInteger(member.seatNo) || member.seatNo < 0 || member.seatNo > 3) throw new TypeError("seatNo invalid");
    integer(member.createdAt, "createdAt");
    if (member.admittedAt != null) integer(member.admittedAt, "admittedAt");
    return member;
  }
  addMembership(value) {
    const member = this._validateMembership(value);
    this.db.prepare(`INSERT INTO hprod_memberships
      (membership_id,match_id,run_id,session_id,profile_id,account_id,seat_no,run_membership_id,
       session_membership_id,admitted_at,payload_json) VALUES(?,?,?,?,?,?,?,?,?,?,?)`)
      .run(member.membershipId, member.matchId, member.runId, member.sessionId, member.profileId,
        member.accountId, member.seatNo, member.runMembershipId, member.sessionMembershipId,
        member.admittedAt ?? null, JSON.stringify(member));
  }
  _member(row) {
    if (!row) return null;
    const member = JSON.parse(row.payload_json);
    if (row.admitted_at != null) member.admittedAt = row.admitted_at;
    return member;
  }
  getMembership(matchId, profileId) {
    return this._member(this.db.prepare("SELECT * FROM hprod_memberships WHERE match_id=? AND profile_id=?")
      .get(matchId, profileId));
  }
  listMemberships(matchId) {
    return this.db.prepare("SELECT * FROM hprod_memberships WHERE match_id=? ORDER BY seat_no,membership_id")
      .all(matchId).map((row) => this._member(row));
  }
  markMembershipAdmitted(matchId, runMembershipId, admittedAt) {
    integer(admittedAt, "admittedAt");
    const row = this.db.prepare("SELECT * FROM hprod_memberships WHERE match_id=? AND run_membership_id=?")
      .get(matchId, runMembershipId);
    if (!row) return null;
    if (row.admitted_at == null) {
      const member = this._member(row); member.admittedAt = admittedAt;
      this.db.prepare(`UPDATE hprod_memberships SET admitted_at=?,payload_json=?
        WHERE match_id=? AND run_membership_id=? AND admitted_at IS NULL`)
        .run(admittedAt, JSON.stringify(member), matchId, runMembershipId);
    }
    return this._member(this.db.prepare("SELECT * FROM hprod_memberships WHERE match_id=? AND run_membership_id=?")
      .get(matchId, runMembershipId));
  }

  _validateWorkload(value) {
    const context = clone(value);
    for (const field of ["workloadRunHandle", "matchId", "runId", "authorityLeaseId", "authorityInstanceId",
      "authorityIncarnation", "credentialBinding"]) text(context[field], field);
    if (!Number.isSafeInteger(context.leaseEpoch) || context.leaseEpoch < 1) throw new TypeError("leaseEpoch invalid");
    if (!WORKLOAD_STATES.has(context.state)) throw new TypeError("workload state invalid");
    return context;
  }
  putWorkloadContext(value) {
    const context = this._validateWorkload(value);
    this.db.prepare(`INSERT INTO hprod_workload_contexts
      (workload_run_handle,match_id,run_id,authority_lease_id,lease_epoch,authority_instance_id,
       authority_incarnation,credential_binding,state,row_version,payload_json)
       VALUES(?,?,?,?,?,?,?,?,?,0,?)`)
      .run(context.workloadRunHandle, context.matchId, context.runId, context.authorityLeaseId,
        context.leaseEpoch, context.authorityInstanceId, context.authorityIncarnation,
        context.credentialBinding, context.state, JSON.stringify(context));
  }
  _workload(row) { return row ? JSON.parse(row.payload_json) : null; }
  getWorkloadContext(handle) {
    return this._workload(this.db.prepare("SELECT * FROM hprod_workload_contexts WHERE workload_run_handle=?").get(handle));
  }
  updateWorkloadContext(handle, mutate, expectedRowVersion = null) {
    if (typeof mutate !== "function") throw new TypeError("workload mutator required");
    const operation = () => {
      const row = this.db.prepare("SELECT * FROM hprod_workload_contexts WHERE workload_run_handle=?").get(handle);
      if (!row) return null;
      if (expectedRowVersion != null && row.row_version !== expectedRowVersion) return null;
      const current = this._workload(row);
      const next = this._validateWorkload(mutate(clone(current)));
      for (const field of ["workloadRunHandle", "matchId", "runId", "authorityLeaseId", "leaseEpoch",
        "authorityInstanceId", "authorityIncarnation", "credentialBinding"]) {
        if (next[field] !== current[field]) throw new Error("hosted product workload lineage immutable");
      }
      const result = this.db.prepare(`UPDATE hprod_workload_contexts SET state=?,row_version=row_version+1,payload_json=?
        WHERE workload_run_handle=? AND row_version=?`)
        .run(next.state, JSON.stringify(next), handle, row.row_version);
      return result.changes === 1 ? clone(next) : null;
    };
    return this.inTransaction ? operation() : this.transaction(operation);
  }
}

module.exports = { SqliteHostedProductRepository };
