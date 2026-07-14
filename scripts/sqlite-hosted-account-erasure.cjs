"use strict";

const crypto = require("node:crypto");
const { DatabaseSync } = require("node:sqlite");

const MIN_ERASURE_KEY_BYTES = 32;
const MAX_BATCH = 100;
const SAFE_MATCH_STATES = new Set(["ENDED", "FENCED"]);

class HostedAccountErasureError extends Error {
  constructor(code) {
    super("hosted account erasure rejected");
    this.name = "HostedAccountErasureError";
    this.code = code;
  }
}

function reject(code) { throw new HostedAccountErasureError(code); }
function bytes(value) {
  const result = Buffer.isBuffer(value) ? Buffer.from(value)
    : value instanceof Uint8Array ? Buffer.from(value)
      : typeof value === "string" ? Buffer.from(value, "utf8") : null;
  if (!result || result.length < MIN_ERASURE_KEY_BYTES) {
    throw new TypeError("hosted account erasure key must be at least 32 bytes");
  }
  return result;
}
function id(value, name) {
  if (typeof value !== "string" || value.length < 1 || value.length > 1024 || value.trim() !== value) {
    throw new TypeError(`${name} invalid`);
  }
  return value;
}
function integer(value, name, min = 1, max = Number.MAX_SAFE_INTEGER) {
  if (!Number.isSafeInteger(value) || value < min || value > max) throw new TypeError(`${name} invalid`);
  return value;
}

/**
 * Bounded, restartable erasure for the local SQLite hosted reference stack.
 *
 * This is deliberately de-identification, not a claim that accounting records
 * disappear. Settled currency ledgers and immutable result hashes are retained
 * under deployment-keyed HMAC aliases. Provider identity, sessions, inventory,
 * player aliases, and client incarnation payloads are deleted. The erasure key
 * is therefore regulated operational material: losing it changes idempotency;
 * disclosing it weakens pseudonymization.
 *
 * Requests require an already-authenticated CONTROL_PLANE principal bound to
 * the target account. Workers also require CONTROL_PLANE credentials and the
 * target id for an HMAC binding check; the durable receipt stores neither.
 */
class SQLiteHostedAccountErasureCoordinator {
  constructor({ filepath, db, erasureKey, productRepository, now = Date.now, fault = () => {} } = {}) {
    if ((filepath == null) === (db == null)) throw new TypeError("provide exactly one erasure sqlite filepath or db");
    if (typeof now !== "function" || typeof fault !== "function") throw new TypeError("erasure dependencies invalid");
    this.key = bytes(erasureKey);
    this.db = db || new DatabaseSync(filepath);
    this.ownsDb = !db;
    this.productRepository = productRepository;
    if (!productRepository || productRepository.db !== this.db
        || typeof productRepository._open !== "function" || typeof productRepository._seal !== "function") {
      throw new TypeError("erasure product repository must share the coordinator database");
    }
    this.now = now;
    this.fault = fault;
    this.db.exec("PRAGMA foreign_keys=ON; PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL; PRAGMA busy_timeout=5000;");
    this._configure();
  }

  _configure() {
    for (const table of ["hid_accounts", "hid_profiles", "hprod_matches", "hprod_memberships",
      "hosted_settlements", "hosted_profiles", "hosted_ledger_entries"]) {
      if (!this.db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?").get(table)) {
        throw new Error(`hosted account erasure requires ${table}`);
      }
    }
    this.db.exec("BEGIN IMMEDIATE");
    try {
      this.db.exec(`
      CREATE TABLE IF NOT EXISTS hosted_account_erasures (
        erasure_id TEXT PRIMARY KEY,
        account_hash TEXT NOT NULL UNIQUE,
        request_hash TEXT NOT NULL UNIQUE,
        state TEXT NOT NULL CHECK(state IN ('requested','deferred','running','complete')),
        reason TEXT,
        requested_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        completed_at INTEGER,
        processed_rows INTEGER NOT NULL DEFAULT 0 CHECK(processed_rows >= 0)
      ) STRICT;
      CREATE TABLE IF NOT EXISTS hosted_account_erasure_guard (
        enabled INTEGER PRIMARY KEY CHECK(enabled=1)
      ) STRICT;
      DROP TRIGGER IF EXISTS hprod_membership_lineage_update;
      CREATE TRIGGER hprod_membership_lineage_update
      BEFORE UPDATE OF match_id,run_id,session_id,profile_id,account_id,seat_no,
        run_membership_id,session_membership_id ON hprod_memberships
      WHEN NOT EXISTS(SELECT 1 FROM hosted_account_erasure_guard WHERE enabled=1)
      BEGIN SELECT RAISE(ABORT, 'hosted product membership lineage immutable'); END;
      DROP TRIGGER IF EXISTS hprod_admitted_membership_delete;
      CREATE TRIGGER hprod_admitted_membership_delete
      BEFORE DELETE ON hprod_memberships
      WHEN OLD.admitted_at IS NOT NULL
        AND NOT EXISTS(SELECT 1 FROM hosted_account_erasure_guard WHERE enabled=1)
      BEGIN SELECT RAISE(ABORT, 'hosted product admitted membership immutable'); END;
      DROP TRIGGER IF EXISTS hosted_run_memberships_lock_update;
      CREATE TRIGGER hosted_run_memberships_lock_update
      BEFORE UPDATE ON hosted_run_memberships
      WHEN EXISTS(SELECT 1 FROM hosted_result_outbox WHERE run_id=OLD.run_id)
        AND NOT EXISTS(SELECT 1 FROM hosted_account_erasure_guard WHERE enabled=1)
      BEGIN SELECT RAISE(ABORT, 'hosted membership accepted'); END;
      DROP TRIGGER IF EXISTS hosted_run_memberships_lock_delete;
      CREATE TRIGGER hosted_run_memberships_lock_delete
      BEFORE DELETE ON hosted_run_memberships
      WHEN EXISTS(SELECT 1 FROM hosted_result_outbox WHERE run_id=OLD.run_id)
        AND NOT EXISTS(SELECT 1 FROM hosted_account_erasure_guard WHERE enabled=1)
      BEGIN SELECT RAISE(ABORT, 'hosted membership accepted'); END;
      `);
      this.db.exec("COMMIT");
    } catch (error) {
      if (this.db.isTransaction) this.db.exec("ROLLBACK");
      throw error;
    }
  }

  close() { if (this.ownsDb) this.db.close(); }

  _hmac(kind, value) {
    return crypto.createHmac("sha256", this.key).update(kind).update("\0").update(String(value))
      .digest("base64url");
  }
  _alias(kind, value) { return `erased_${kind}_${this._hmac(kind, value).slice(0, 32)}`; }
  _control(auth) {
    if (!auth || auth.authenticated !== true || auth.plane !== "control" || auth.role !== "CONTROL_PLANE") {
      reject("ERASURE_CONTROL_AUTH_REQUIRED");
    }
  }

  request({ auth, targetAccountId, requestId } = {}) {
    this._control(auth);
    targetAccountId = id(targetAccountId, "targetAccountId");
    requestId = id(requestId, "requestId");
    if (auth.accountId !== targetAccountId) reject("ERASURE_ACCOUNT_MISMATCH");
    if (!this.db.prepare("SELECT 1 FROM hid_accounts WHERE account_id=?").get(targetAccountId)) {
      reject("ERASURE_ACCOUNT_NOT_FOUND");
    }
    const accountHash = this._hmac("account", targetAccountId);
    const requestHash = this._hmac("request", `${targetAccountId}\0${requestId}`);
    const erasureId = `erase_${accountHash.slice(0, 40)}`;
    const at = this.now();
    try {
      this.db.prepare(`INSERT INTO hosted_account_erasures
        (erasure_id,account_hash,request_hash,state,requested_at,updated_at)
        VALUES(?,?,?,'requested',?,?)
        ON CONFLICT(account_hash) DO NOTHING`).run(erasureId, accountHash, requestHash, at, at);
    } catch (error) {
      if (String(error.message).includes("request_hash")) reject("ERASURE_REQUEST_COLLISION");
      throw error;
    }
    const row = this.db.prepare("SELECT * FROM hosted_account_erasures WHERE account_hash=?").get(accountHash);
    if (row.request_hash !== requestHash) reject("ERASURE_REQUEST_COLLISION");
    return this._public(row);
  }

  status({ auth, erasureId } = {}) {
    this._control(auth);
    const row = this.db.prepare("SELECT * FROM hosted_account_erasures WHERE erasure_id=?")
      .get(id(erasureId, "erasureId"));
    if (!row) reject("ERASURE_NOT_FOUND");
    return this._public(row);
  }

  step({ auth, erasureId, targetAccountId, limit = 25 } = {}) {
    this._control(auth);
    erasureId = id(erasureId, "erasureId");
    targetAccountId = id(targetAccountId, "targetAccountId");
    integer(limit, "limit", 1, MAX_BATCH);
    const row = this.db.prepare("SELECT * FROM hosted_account_erasures WHERE erasure_id=?").get(erasureId);
    if (!row) reject("ERASURE_NOT_FOUND");
    if (row.account_hash !== this._hmac("account", targetAccountId)) reject("ERASURE_ACCOUNT_MISMATCH");
    if (row.state === "complete") return this._public(row);

    this.fault("before-lock", { erasureId });
    this.db.exec("BEGIN IMMEDIATE");
    try {
      // The safety decision belongs inside the same writer lock as every
      // mutation. A pre-lock check would allow another process to reactivate
      // the match or create a result/outbox row in the gap.
      const blocker = this._blocker(targetAccountId);
      if (blocker) {
        this.db.prepare(`UPDATE hosted_account_erasures SET state='deferred',reason=?,updated_at=?
          WHERE erasure_id=?`).run(blocker, this.now(), erasureId);
        this.db.exec("COMMIT");
        return this._public(this.db.prepare("SELECT * FROM hosted_account_erasures WHERE erasure_id=?")
          .get(erasureId));
      }
      this.db.prepare("INSERT OR IGNORE INTO hosted_account_erasure_guard(enabled) VALUES(1)").run();
      this.db.prepare(`UPDATE hosted_account_erasures SET state='running',reason=NULL,updated_at=?
        WHERE erasure_id=?`).run(this.now(), erasureId);
      this.fault("after-begin", { erasureId });
      const processed = this._boundedWork(targetAccountId, limit);
      this.fault("before-progress", { erasureId, processed });
      const accountRemains = Boolean(this.db.prepare("SELECT 1 FROM hid_accounts WHERE account_id=?")
        .get(targetAccountId));
      const state = accountRemains ? "running" : "complete";
      this.db.prepare(`UPDATE hosted_account_erasures SET state=?,updated_at=?,completed_at=?,
        processed_rows=processed_rows+? WHERE erasure_id=?`)
        .run(state, this.now(), state === "complete" ? this.now() : null, processed, erasureId);
      this.db.prepare("DELETE FROM hosted_account_erasure_guard").run();
      this.fault("before-commit", { erasureId, processed, state });
      this.db.exec("COMMIT");
    } catch (error) {
      if (this.db.isTransaction) this.db.exec("ROLLBACK");
      throw error;
    }
    return this.status({ auth, erasureId });
  }

  _blocker(accountId) {
    const live = this.db.prepare(`SELECT m.run_id,x.state FROM hprod_memberships m
      JOIN hprod_matches x ON x.match_id=m.match_id WHERE m.account_id=? AND x.state NOT IN ('ENDED','FENCED')
      LIMIT 1`).get(accountId) || this.db.prepare(`SELECT run_id,state FROM hprod_matches
      WHERE owner_account_id=? AND state NOT IN ('ENDED','FENCED') LIMIT 1`).get(accountId);
    if (live && !SAFE_MATCH_STATES.has(live.state)) return "LIVE_RUN";
    const unsettled = this.db.prepare(`SELECT m.run_id FROM hprod_memberships m
      JOIN hprod_matches x ON x.match_id=m.match_id
      LEFT JOIN hosted_settlements s ON s.run_id=m.run_id
      WHERE m.account_id=? AND m.admitted_at IS NOT NULL AND s.run_id IS NULL LIMIT 1`).get(accountId);
    if (unsettled) return "ADMITTED_RUN_UNSETTLED";
    const unarchived = this.db.prepare(`SELECT m.run_id FROM hprod_memberships m
      JOIN hosted_settlements s ON s.run_id=m.run_id
      JOIN hosted_result_outbox o ON o.run_id=m.run_id
      WHERE m.account_id=? LIMIT 1`).get(accountId);
    // Delivery alone is insufficient. Archive creates the typed receipt, gets
    // placement's exact acknowledgement, then atomically deletes the outbox.
    // Aliasing membership ids before that point would change its digest and
    // permanently fence placement acknowledgement.
    if (unarchived) return "SETTLEMENT_ARCHIVE_UNACKNOWLEDGED";
    const missingArchiveProof = this.db.prepare(`SELECT m.run_id,s.response_json
      FROM hprod_memberships m JOIN hosted_settlements s ON s.run_id=m.run_id
      LEFT JOIN hosted_result_audit a ON a.run_id=m.run_id AND a.placement_acknowledged_at IS NOT NULL
      WHERE m.account_id=? AND m.admitted_at IS NOT NULL AND a.run_id IS NULL LIMIT 1`).get(accountId);
    if (missingArchiveProof) {
      let archived = false;
      try { archived = JSON.parse(missingArchiveProof.response_json)?.archived === true; } catch {}
      // After retention cleanup the acknowledgement row may be gone; the
      // payload-free archived response plus absent outbox is the durable safe
      // terminal shape produced only after the archive workflow ran.
      if (!archived) return "SETTLEMENT_ARCHIVE_PROOF_MISSING";
    }
    return null;
  }

  _boundedWork(accountId, limit) {
    let processed = 0;
    const member = this.db.prepare(`SELECT * FROM hprod_memberships WHERE account_id=?
      ORDER BY match_id,membership_id LIMIT 1`).get(accountId);
    if (member) processed = this._eraseMembership(member, limit);
    if (processed) return processed;

    const owners = this.db.prepare("SELECT * FROM hprod_matches WHERE owner_account_id=? ORDER BY match_id LIMIT ?")
      .all(accountId, limit);
    for (const row of owners) {
      const match = this.productRepository._open(row);
      match.ownerAccountId = this._alias("account", accountId);
      const sealed = this.productRepository._seal(match);
      this.db.prepare(`UPDATE hprod_matches SET owner_account_id=?,row_version=row_version+1,
        key_id=?,nonce=?,auth_tag=?,ciphertext=? WHERE match_id=?`)
        .run(match.ownerAccountId, this.productRepository.encryptionKeyId, sealed.nonce,
          sealed.authTag, sealed.ciphertext, row.match_id);
      processed += 1;
    }
    if (processed) return processed;

    const profiles = this.db.prepare(`SELECT profile_id FROM hid_profiles WHERE account_id=?
      ORDER BY profile_id LIMIT 1`).all(accountId);
    for (const row of profiles) {
      const changed = this._deidentifyProfileBatch(row.profile_id, this._alias("profile", row.profile_id), limit);
      if (changed) return changed;
      this.db.prepare("DELETE FROM hid_profiles WHERE profile_id=? AND account_id=?")
        .run(row.profile_id, accountId);
      processed += 1;
    }
    if (processed) return processed;

    for (const table of ["hid_access_sessions", "hid_refresh_tokens", "hid_refresh_families",
      "hid_provider_identities", "hid_callbacks", "hid_exchange_proofs", "hid_entitlements"]) {
      const deleted = Number(this.db.prepare(`DELETE FROM ${table} WHERE rowid IN (
        SELECT rowid FROM ${table} WHERE account_id=? ORDER BY rowid LIMIT ?)`)
        .run(accountId, limit).changes);
      if (deleted) return deleted;
    }
    return Number(this.db.prepare("DELETE FROM hid_accounts WHERE account_id=?").run(accountId).changes);
  }

  _eraseMembership(row, limit) {
    if (row.admitted_at == null) {
      this.db.prepare("DELETE FROM hprod_memberships WHERE membership_id=? AND account_id=?")
        .run(row.membership_id, row.account_id);
      return 1;
    }
    const profileAlias = this._alias("profile", row.profile_id);
    const runMemberAlias = this._alias("run_member", row.run_membership_id);
    let changed = this._deidentifyProfileBatch(row.profile_id, profileAlias, limit);
    if (changed) return changed;
    changed = Number(this.db.prepare(`DELETE FROM hosted_inventory_items WHERE inventory_id IN (
      SELECT inventory_id FROM hosted_inventory_items WHERE run_membership_id=? ORDER BY inventory_id LIMIT ?)`)
      .run(row.run_membership_id, limit).changes);
    if (changed) return changed;
    changed = Number(this.db.prepare(`UPDATE hosted_ledger_entries SET run_membership_id=? WHERE ledger_id IN (
      SELECT ledger_id FROM hosted_ledger_entries WHERE run_membership_id=? ORDER BY ledger_id LIMIT ?)`)
      .run(runMemberAlias, row.run_membership_id, limit).changes);
    if (changed) return changed;
    changed = Number(this.db.prepare(`UPDATE hosted_run_memberships SET profile_id=?,run_membership_id=?
      WHERE run_id=? AND run_membership_id=?`).run(profileAlias, runMemberAlias,
      row.run_id, row.run_membership_id).changes);
    if (changed) return changed;
    changed = this._redactSettledTransportStep(row.run_id, row.run_membership_id, runMemberAlias);
    if (changed) return changed;
    // The admitted product membership is no longer needed after the exact
    // placement archive acknowledgement. Delete its ownership, alias, and
    // client-incarnation payload instead of retaining a pseudonymous product
    // shadow. Only settlement/audit/ledger obligations remain.
    this.db.prepare("DELETE FROM hprod_memberships WHERE membership_id=? AND account_id=?")
      .run(row.membership_id, row.account_id);
    return 1;
  }

  _deidentifyProfileBatch(profileId, profileAlias, limit) {
    const profile = this.db.prepare("SELECT * FROM hosted_profiles WHERE profile_id=?").get(profileId);
    if (!profile) return 0;
    this.db.prepare(`INSERT OR IGNORE INTO hosted_profiles(profile_id,revision,balance,updated_at)
      VALUES(?,?,?,?)`).run(profileAlias, profile.revision, profile.balance, profile.updated_at);
    let changed = Number(this.db.prepare(`UPDATE hosted_profile_revisions SET profile_id=? WHERE rowid IN (
      SELECT rowid FROM hosted_profile_revisions WHERE profile_id=? ORDER BY revision LIMIT ?)`)
      .run(profileAlias, profileId, limit).changes);
    if (changed) return changed;
    changed = Number(this.db.prepare(`UPDATE hosted_ledger_entries SET profile_id=? WHERE ledger_id IN (
      SELECT ledger_id FROM hosted_ledger_entries WHERE profile_id=? ORDER BY ledger_id LIMIT ?)`)
      .run(profileAlias, profileId, limit).changes);
    if (changed) return changed;
    changed = Number(this.db.prepare(`DELETE FROM hosted_inventory_items WHERE inventory_id IN (
      SELECT inventory_id FROM hosted_inventory_items WHERE profile_id=? ORDER BY inventory_id LIMIT ?)`)
      .run(profileId, limit).changes);
    if (changed) return changed;
    changed = Number(this.db.prepare(`UPDATE hosted_run_memberships SET profile_id=? WHERE rowid IN (
      SELECT rowid FROM hosted_run_memberships WHERE profile_id=? ORDER BY run_id,run_membership_id LIMIT ?)`)
      .run(profileAlias, profileId, limit).changes);
    if (changed) return changed;
    this.db.prepare("DELETE FROM hosted_profiles WHERE profile_id=?").run(profileId);
    return 1;
  }

  _redactSettledTransportStep(runId, oldRunMembershipId, alias) {
    const settlement = this.db.prepare("SELECT settlement_id,response_json FROM hosted_settlements WHERE run_id=?")
      .get(runId);
    if (settlement) {
      const response = JSON.parse(settlement.response_json);
      if (Array.isArray(response.members)) {
        const member = response.members.find((entry) => entry.run_membership_id === oldRunMembershipId);
        if (member) {
          member.run_membership_id = alias;
          this.db.prepare("UPDATE hosted_settlements SET response_json=? WHERE settlement_id=?")
            .run(JSON.stringify(response), settlement.settlement_id);
          return 1;
        }
      }
    }
    // A committed settlement makes result bodies replay-redundant. Hashes,
    // authority lineage, receipts, and ledger rows remain for audit.
    let changed = Number(this.db.prepare("UPDATE hosted_match_results SET payload_json='{}' WHERE run_id=? AND payload_json<>'{}'")
      .run(runId).changes);
    if (changed) return changed;
    changed = Number(this.db.prepare(`UPDATE hosted_result_outbox SET payload_json='{}'
      WHERE run_id=? AND state='delivered' AND payload_json<>'{}'`).run(runId).changes);
    if (changed) return changed;
    return Number(this.db.prepare(`UPDATE hosted_result_journal SET payload_json='{}'
      WHERE run_id=? AND state='finalized' AND payload_json<>'{}'`).run(runId).changes);
  }

  _public(row) {
    return Object.freeze({ erasureId: row.erasure_id, state: row.state, reason: row.reason ?? null,
      requestedAt: row.requested_at, updatedAt: row.updated_at, completedAt: row.completed_at ?? null,
      processedRows: Number(row.processed_rows) });
  }
}

module.exports = {
  SQLiteHostedAccountErasureCoordinator, HostedAccountErasureError,
  MIN_ERASURE_KEY_BYTES, MAX_BATCH,
};
