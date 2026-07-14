"use strict";

const crypto = require("crypto");
const { DatabaseSync } = require("node:sqlite");
const { HostedResultError, validateAuthorityIdentity, validateResultPayload } = require("./hosted-result-outbox.cjs");
const { configureHostedResultOutboxDatabase } = require("./sqlite-hosted-result-outbox.cjs");

function reject(code) { throw new HostedResultError(code); }
function stableId(prefix, ...parts) {
  return `${prefix}_${crypto.createHash("sha256").update(parts.join("\u001f")).digest("hex").slice(0, 40)}`;
}
function validId(value) {
  if (typeof value !== "string" || value.length < 1 || value.length > 160 || value.trim() !== value) {
    reject("HOSTED_SETTLEMENT_INVALID");
  }
  return value;
}
function parse(value) { return JSON.parse(value); }
function json(value) { return JSON.stringify(value); }

function configure(db, { referenceAuthorityMode = false } = {}) {
  configureHostedResultOutboxDatabase(db, { referenceAuthorityMode });
  db.exec(`
    CREATE TABLE IF NOT EXISTS hosted_run_memberships (
      run_id TEXT NOT NULL,
      run_membership_id TEXT NOT NULL,
      profile_id TEXT NOT NULL,
      membership_state TEXT NOT NULL DEFAULT 'admitted' CHECK(membership_state IN ('admitted','removed')),
      PRIMARY KEY(run_id, run_membership_id),
      UNIQUE(run_id, profile_id)
    );
    CREATE TABLE IF NOT EXISTS hosted_profiles (
      profile_id TEXT PRIMARY KEY,
      revision INTEGER NOT NULL DEFAULT 0 CHECK(revision >= 0),
      balance INTEGER NOT NULL DEFAULT 0 CHECK(balance >= 0),
      updated_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS hosted_profile_revisions (
      profile_id TEXT NOT NULL REFERENCES hosted_profiles(profile_id) ON DELETE RESTRICT,
      revision INTEGER NOT NULL,
      settlement_id TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      PRIMARY KEY(profile_id, revision),
      UNIQUE(profile_id, settlement_id)
    );
    CREATE TABLE IF NOT EXISTS hosted_match_results (
      result_id TEXT PRIMARY KEY,
      run_id TEXT NOT NULL UNIQUE,
      result_hash TEXT NOT NULL,
      lease_id TEXT NOT NULL,
      lease_epoch INTEGER NOT NULL,
      authority_incarnation TEXT NOT NULL,
      payload_json TEXT NOT NULL,
      accepted_at INTEGER NOT NULL,
      settled_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS hosted_settlements (
      settlement_id TEXT PRIMARY KEY,
      result_id TEXT NOT NULL UNIQUE REFERENCES hosted_match_results(result_id) ON DELETE RESTRICT,
      run_id TEXT NOT NULL UNIQUE,
      result_hash TEXT NOT NULL,
      idempotency_key TEXT NOT NULL UNIQUE,
      response_json TEXT NOT NULL,
      committed_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS hosted_ledger_entries (
      ledger_id TEXT PRIMARY KEY,
      profile_id TEXT NOT NULL REFERENCES hosted_profiles(profile_id) ON DELETE RESTRICT,
      run_membership_id TEXT NOT NULL,
      settlement_id TEXT NOT NULL REFERENCES hosted_settlements(settlement_id) ON DELETE RESTRICT,
      currency TEXT NOT NULL CHECK(currency='EM'),
      delta INTEGER NOT NULL CHECK(delta >= 0),
      balance INTEGER NOT NULL CHECK(balance >= 0),
      created_at INTEGER NOT NULL,
      UNIQUE(settlement_id, run_membership_id, currency)
    );
    CREATE TABLE IF NOT EXISTS hosted_inventory_items (
      inventory_id TEXT PRIMARY KEY,
      profile_id TEXT NOT NULL REFERENCES hosted_profiles(profile_id) ON DELETE RESTRICT,
      run_membership_id TEXT NOT NULL,
      settlement_id TEXT NOT NULL REFERENCES hosted_settlements(settlement_id) ON DELETE RESTRICT,
      slot_no INTEGER NOT NULL CHECK(slot_no >= 0),
      item_json TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      UNIQUE(settlement_id, run_membership_id, slot_no)
    );
    CREATE TABLE IF NOT EXISTS hosted_settlement_conflicts (
      quarantine_id TEXT PRIMARY KEY,
      run_id TEXT NOT NULL,
      presented_result_id TEXT NOT NULL,
      presented_hash TEXT NOT NULL,
      accepted_result_id TEXT,
      accepted_hash TEXT,
      quarantined_at INTEGER NOT NULL,
      UNIQUE(run_id, presented_hash)
    );
    CREATE TRIGGER IF NOT EXISTS hosted_run_memberships_max_four_insert
    BEFORE INSERT ON hosted_run_memberships
    WHEN NEW.membership_state='admitted' AND
      (SELECT count(*) FROM hosted_run_memberships
       WHERE run_id=NEW.run_id AND membership_state='admitted') >= 4
    BEGIN SELECT RAISE(ABORT, 'hosted membership capacity'); END;
    CREATE TRIGGER IF NOT EXISTS hosted_run_memberships_lock_update
    BEFORE UPDATE ON hosted_run_memberships
    WHEN EXISTS(SELECT 1 FROM hosted_result_outbox WHERE run_id=OLD.run_id)
    BEGIN SELECT RAISE(ABORT, 'hosted membership accepted'); END;
    CREATE TRIGGER IF NOT EXISTS hosted_run_memberships_lock_delete
    BEFORE DELETE ON hosted_run_memberships
    WHEN EXISTS(SELECT 1 FROM hosted_result_outbox WHERE run_id=OLD.run_id)
    BEGIN SELECT RAISE(ABORT, 'hosted membership accepted'); END;
  `);
  // Older reference builds blocked every post-accept insert because callers
  // supplied membership rows before result acceptance. Hosted composition now
  // resolves immutable product/identity ownership while settling, so only the
  // repository's trusted snapshot path may create the first terminal rows.
  db.exec("DROP TRIGGER IF EXISTS hosted_run_memberships_lock_insert");
  return db;
}

function openDatabase({ filepath, db, referenceAuthorityMode = false } = {}) {
  if (db) return { db: configure(db, { referenceAuthorityMode }), ownsDb: false };
  if (typeof filepath !== "string" || !filepath) throw new TypeError("filepath or db is required");
  return { db: configure(new DatabaseSync(filepath), { referenceAuthorityMode }), ownsDb: true };
}

function normalizeMemberships(rows) {
  if (!Array.isArray(rows) || rows.length < 1 || rows.length > 4) reject("HOSTED_SETTLEMENT_MEMBERSHIP_MISMATCH");
  const membershipIds = new Set();
  const profileIds = new Set();
  const normalized = rows.map((row) => {
    const membershipId = row?.run_membership_id;
    const profileId = row?.profile_id;
    if (typeof membershipId !== "string" || !membershipId || typeof profileId !== "string" || !profileId
        || membershipIds.has(membershipId) || profileIds.has(profileId)) {
      reject("HOSTED_SETTLEMENT_MEMBERSHIP_MISMATCH");
    }
    validId(membershipId); validId(profileId);
    membershipIds.add(membershipId); profileIds.add(profileId);
    return { run_membership_id: membershipId, profile_id: profileId };
  });
  return normalized.sort((a, b) => a.run_membership_id.localeCompare(b.run_membership_id));
}

function assertExactOutcomeSet(payload, memberships) {
  const presented = Object.keys(payload?.outcomes || {}).sort();
  const admitted = memberships.map((row) => row.run_membership_id);
  if (presented.length !== admitted.length || presented.some((id, index) => id !== admitted[index])) {
    reject("HOSTED_SETTLEMENT_MEMBERSHIP_MISMATCH");
  }
}

class SQLiteHostedSettlementRepository {
  constructor({ filepath, db, now = Date.now, fault = () => {},
    verifyAcceptedAuthorityResult, resolveRunMemberships, referenceAuthorityMode = false } = {}) {
    if (!referenceAuthorityMode && typeof verifyAcceptedAuthorityResult !== "function") {
      throw new TypeError("verifyAcceptedAuthorityResult is required outside explicit reference authority mode");
    }
    if (!referenceAuthorityMode && typeof resolveRunMemberships !== "function") {
      throw new TypeError("resolveRunMemberships is required outside explicit reference authority mode");
    }
    const opened = openDatabase({ filepath, db, referenceAuthorityMode });
    this.db = opened.db;
    this.ownsDb = opened.ownsDb;
    this.now = now;
    this.fault = fault;
    this.referenceAuthorityMode = referenceAuthorityMode;
    this.verifyAcceptedAuthorityResult = referenceAuthorityMode
      ? (entry) => this._verifyReferenceAcceptance(entry)
      : verifyAcceptedAuthorityResult;
    this.resolveRunMemberships = resolveRunMemberships;
  }

  close() { if (this.ownsDb) this.db.close(); }

  setRunMemberships(runId, rows) {
    if (!this.referenceAuthorityMode) reject("HOSTED_SETTLEMENT_FENCED");
    runId = validId(runId);
    const memberships = normalizeMemberships(rows);
    this.db.exec("BEGIN IMMEDIATE");
    try {
      if (this.db.prepare("SELECT 1 FROM hosted_result_outbox WHERE run_id=?").get(runId)) {
        reject("HOSTED_SETTLEMENT_FENCED");
      }
      if (this.referenceAuthorityMode && !this.db.prepare(
        "SELECT 1 FROM hosted_reference_authority_lineages WHERE run_id=? AND accepted_result_hash IS NULL"
      ).get(runId)) reject("HOSTED_SETTLEMENT_FENCED");
      this.db.prepare("DELETE FROM hosted_run_memberships WHERE run_id=?").run(runId);
      const insert = this.db.prepare(`INSERT INTO hosted_run_memberships
        (run_id,run_membership_id,profile_id,membership_state) VALUES (?,?,?,'admitted')`);
      for (const member of memberships) insert.run(runId, member.run_membership_id, member.profile_id);
      this.db.exec("COMMIT");
      return memberships;
    } catch (error) {
      if (this.db.isTransaction) this.db.exec("ROLLBACK");
      throw error;
    }
  }

  settle(entry) {
    this._validateEntry(entry);
    const authority = validateAuthorityIdentity(entry.authority);
    validateResultPayload(entry.payload);
    const committedAt = this.now();
    let afterCommitError = null;
    this.db.exec("BEGIN IMMEDIATE");
    try {
      const prior = this.db.prepare(`SELECT * FROM hosted_settlements
        WHERE run_id=? OR result_id=? ORDER BY committed_at LIMIT 1`).get(entry.run_id, entry.result_id);
      // Placement acceptance is immutable and authoritative. When placement
      // uses another DB, this is a fresh revalidation immediately before local
      // writes, not a claim of cross-database serializability.
      const accepted = this.verifyAcceptedAuthorityResult(entry);
      const lineageMatches = accepted?.accepted === true && accepted.run_id === entry.run_id
        && accepted.lease_id === authority.lease_id
        && Number(accepted.lease_epoch) === authority.lease_epoch
        && accepted.authority_incarnation === authority.authority_incarnation
        && (accepted.result_id == null || accepted.result_id === entry.result_id)
        && accepted.result_hash === entry.result_hash;

      if (!lineageMatches) {
        if (prior && (prior.result_id !== entry.result_id || prior.result_hash !== entry.result_hash)) {
          this._insertConflict(entry, prior, committedAt);
          this.db.exec("COMMIT");
          reject("HOSTED_SETTLEMENT_CONFLICT");
        }
        reject("HOSTED_SETTLEMENT_FENCED");
      }
      if (prior) {
        if (prior.run_id !== entry.run_id || prior.result_id !== entry.result_id
            || prior.result_hash !== entry.result_hash || prior.idempotency_key !== entry.idempotency_key) {
          this._insertConflict(entry, prior, committedAt);
          this.db.exec("COMMIT");
          reject("HOSTED_SETTLEMENT_CONFLICT");
        }
        this.db.exec("COMMIT");
        return Object.freeze({ ...parse(prior.response_json), replayed: true });
      }

      if (!this.referenceAuthorityMode) {
        const resolvedMemberships = normalizeMemberships(this.resolveRunMemberships(entry.run_id));
        const existing = this.db.prepare(`SELECT run_membership_id,profile_id FROM hosted_run_memberships
          WHERE run_id=? AND membership_state='admitted' ORDER BY run_membership_id`).all(entry.run_id);
        if (existing.length) {
          const normalizedExisting = normalizeMemberships(existing);
          if (json(normalizedExisting) !== json(resolvedMemberships)) {
            reject("HOSTED_SETTLEMENT_MEMBERSHIP_MISMATCH");
          }
        } else {
          const insert = this.db.prepare(`INSERT INTO hosted_run_memberships
            (run_id,run_membership_id,profile_id,membership_state) VALUES (?,?,?,'admitted')`);
          for (const member of resolvedMemberships) {
            insert.run(entry.run_id, member.run_membership_id, member.profile_id);
          }
        }
      }

      const memberships = this.db.prepare(`SELECT run_membership_id,profile_id FROM hosted_run_memberships
        WHERE run_id=? AND membership_state='admitted' ORDER BY run_membership_id`).all(entry.run_id);
      const normalized = normalizeMemberships(memberships);
      assertExactOutcomeSet(entry.payload, normalized);
      const settlementId = stableId("settlement", entry.result_id);
      const responseMembers = [];

      this.fault("before-result");
      this.db.prepare(`INSERT INTO hosted_match_results
        (result_id,run_id,result_hash,lease_id,lease_epoch,authority_incarnation,payload_json,accepted_at,settled_at)
        VALUES (?,?,?,?,?,?,?,?,?)`).run(entry.result_id, entry.run_id, entry.result_hash,
        authority.lease_id, authority.lease_epoch, authority.authority_incarnation,
        json(entry.payload), entry.accepted_at, committedAt);
      this.fault("after-result");

      // Insert the settlement before its FK-dependent economics, then fill its immutable response last.
      this.db.prepare(`INSERT INTO hosted_settlements
        (settlement_id,result_id,run_id,result_hash,idempotency_key,response_json,committed_at)
        VALUES (?,?,?,?,?,'{}',?)`).run(settlementId, entry.result_id, entry.run_id,
        entry.result_hash, entry.idempotency_key, committedAt);
      this.fault("after-settlement-shell");

      for (const membership of normalized) {
        const outcome = entry.payload.outcomes[membership.run_membership_id];
        this.db.prepare(`INSERT INTO hosted_profiles(profile_id,revision,balance,updated_at)
          VALUES (?,0,0,?) ON CONFLICT(profile_id) DO NOTHING`).run(membership.profile_id, committedAt);
        this.fault("after-profile-ensure");
        const profile = this.db.prepare(`UPDATE hosted_profiles SET revision=revision+1,
          balance=balance+?,updated_at=? WHERE profile_id=? RETURNING revision,balance`).get(
          outcome.em_earned, committedAt, membership.profile_id);
        this.fault("after-profile-update");
        if (outcome.em_earned) {
          this.db.prepare(`INSERT INTO hosted_ledger_entries
            (ledger_id,profile_id,run_membership_id,settlement_id,currency,delta,balance,created_at)
            VALUES (?,?,?,?,'EM',?,?,?)`).run(
            stableId("ledger", settlementId, membership.run_membership_id, "EM"), membership.profile_id,
            membership.run_membership_id, settlementId, outcome.em_earned, profile.balance, committedAt);
          this.fault("after-ledger");
        }
        const cargo = Array.isArray(outcome.cargo) ? outcome.cargo : [];
        cargo.forEach((item, index) => {
          this.db.prepare(`INSERT INTO hosted_inventory_items
            (inventory_id,profile_id,run_membership_id,settlement_id,slot_no,item_json,created_at)
            VALUES (?,?,?,?,?,?,?)`).run(
            stableId("inventory", settlementId, membership.run_membership_id, String(index)),
            membership.profile_id, membership.run_membership_id, settlementId, index, json(item), committedAt);
          this.fault("after-inventory");
        });
        this.db.prepare(`INSERT INTO hosted_profile_revisions
          (profile_id,revision,settlement_id,created_at) VALUES (?,?,?,?)`).run(
          membership.profile_id, profile.revision, settlementId, committedAt);
        this.fault("after-profile-revision");
        responseMembers.push({ run_membership_id: membership.run_membership_id,
          profile_revision: profile.revision, outcome: outcome.outcome,
          em_credited: outcome.em_earned, inventory_count: cargo.length });
      }

      const response = { settlement_id: settlementId, result_id: entry.result_id, run_id: entry.run_id,
        result_hash: entry.result_hash, committed_at: committedAt, members: responseMembers, replayed: false };
      this.db.prepare("UPDATE hosted_settlements SET response_json=? WHERE settlement_id=?")
        .run(json(response), settlementId);
      this.fault("after-settlement-response");
      this.fault("before-commit");
      this.db.exec("COMMIT");
      try { this.fault("after-commit"); } catch (error) { afterCommitError = error; }
      if (afterCommitError) throw afterCommitError;
      return Object.freeze(response);
    } catch (error) {
      if (this.db.isTransaction) this.db.exec("ROLLBACK");
      throw error;
    }
  }

  _validateEntry(entry) {
    if (!entry || typeof entry !== "object" || !entry.result_id || !entry.run_id || !entry.result_hash
        || !entry.idempotency_key || !entry.authority || !entry.payload
        || entry.authority.run_id !== entry.run_id || !Number.isSafeInteger(entry.accepted_at)) {
      reject("HOSTED_SETTLEMENT_INVALID");
    }
    [entry.result_id, entry.run_id, entry.result_hash, entry.idempotency_key].forEach(validId);
  }

  _insertConflict(entry, prior, now) {
    this.db.prepare(`INSERT OR IGNORE INTO hosted_settlement_conflicts
      (quarantine_id,run_id,presented_result_id,presented_hash,accepted_result_id,accepted_hash,quarantined_at)
      VALUES (?,?,?,?,?,?,?)`).run(stableId("quarantine", entry.run_id, entry.result_hash), entry.run_id,
      entry.result_id, entry.result_hash, prior?.result_id || null, prior?.result_hash || null, now);
  }

  _verifyReferenceAcceptance(entry) {
    const row = this.db.prepare(`SELECT * FROM hosted_reference_authority_lineages
      WHERE run_id=? AND accepted_result_hash IS NOT NULL`).get(entry.run_id);
    return row ? { accepted: true, run_id: row.run_id, lease_id: row.lease_id,
      lease_epoch: row.lease_epoch, authority_incarnation: row.authority_incarnation,
      result_id: row.accepted_result_id, result_hash: row.accepted_result_hash } : null;
  }

  getProfile(profileId) {
    const row = this.db.prepare("SELECT profile_id,revision,balance,updated_at FROM hosted_profiles WHERE profile_id=?")
      .get(validId(profileId));
    return row ? Object.freeze({ ...row }) : null;
  }

  counts() {
    const tables = ["hosted_run_memberships", "hosted_profiles", "hosted_profile_revisions",
      "hosted_match_results", "hosted_settlements", "hosted_ledger_entries",
      "hosted_inventory_items", "hosted_settlement_conflicts"];
    return Object.fromEntries(tables.map((table) => [table,
      Number(this.db.prepare(`SELECT count(*) AS count FROM ${table}`).get().count)]));
  }

  integrityCheck() { return this.db.prepare("PRAGMA integrity_check").all().map((row) => row.integrity_check); }
  foreignKeyCheck() { return this.db.prepare("PRAGMA foreign_key_check").all(); }
}

module.exports = {
  SQLiteHostedSettlementRepository, configureHostedSettlementDatabase: configure,
  normalizeMemberships, assertExactOutcomeSet,
};
