"use strict";

const crypto = require("node:crypto");
const { DatabaseSync } = require("node:sqlite");

const SUBJECT_KEY_BYTES = 32;
const MAX_PREVIOUS_SUBJECT_KEYS = 3;
const LEGACY_SUBJECT_KEY_ID = "legacy-v1";

function clone(value) {
  return value == null ? value : structuredClone(value);
}

function keyBuffer(value) {
  const key = Buffer.isBuffer(value) ? Buffer.from(value)
    : value instanceof Uint8Array ? Buffer.from(value)
      : typeof value === "string" ? Buffer.from(value, "utf8") : null;
  if (!key || key.length < SUBJECT_KEY_BYTES) {
    throw new TypeError("hosted identity subject lookup key must be at least 32 bytes");
  }
  return key;
}

function keyId(value) {
  if (typeof value !== "string" || !/^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/.test(value)) {
    throw new TypeError("hosted identity subject lookup key id invalid");
  }
  return value;
}

function subjectKeyring(subjectLookupKey, subjectLookupKeyring) {
  if (subjectLookupKey != null && subjectLookupKeyring != null) {
    throw new TypeError("provide one hosted identity subject lookup key or keyring");
  }
  if (subjectLookupKeyring == null) {
    return {
      entries: [{ id: LEGACY_SUBJECT_KEY_ID, key: keyBuffer(subjectLookupKey), current: true }],
      // The single-key constructor is the pre-keyring compatibility path. It
      // may read/tag legacy rows, but writes remain fenced until none remain.
      untaggedLegacyKeyId: LEGACY_SUBJECT_KEY_ID,
      explicit: false,
    };
  }
  if (!subjectLookupKeyring || typeof subjectLookupKeyring !== "object" ||
      !subjectLookupKeyring.current || !Array.isArray(subjectLookupKeyring.previous ?? [])) {
    throw new TypeError("hosted identity subject lookup keyring invalid");
  }
  const previous = subjectLookupKeyring.previous ?? [];
  if (previous.length > MAX_PREVIOUS_SUBJECT_KEYS) {
    throw new TypeError(`hosted identity subject lookup keyring allows at most ${MAX_PREVIOUS_SUBJECT_KEYS} previous keys`);
  }
  const entries = [subjectLookupKeyring.current, ...previous].map((entry, index) => ({
    id: keyId(entry?.id), key: keyBuffer(entry?.key), current: index === 0,
  }));
  const ids = new Set();
  for (const entry of entries) {
    if (ids.has(entry.id)) throw new TypeError("hosted identity subject lookup key ids must be unique");
    ids.add(entry.id);
  }
  const untaggedLegacyKeyId = subjectLookupKeyring.untaggedLegacyKeyId == null
    ? null : keyId(subjectLookupKeyring.untaggedLegacyKeyId);
  if (untaggedLegacyKeyId != null && !ids.has(untaggedLegacyKeyId)) {
    throw new TypeError("hosted identity untagged legacy key id must reference a configured key");
  }
  return { entries, untaggedLegacyKeyId, explicit: true };
}

function json(value) { return JSON.stringify(value); }
function parse(row) { return row ? JSON.parse(row.payload_json) : undefined; }

/**
 * Durable synchronous repository for HostedIdentityService.
 *
 * The provider subject is never stored. Its only durable representation is an
 * HMAC lookup value under a deployment secret. getIdentity reconstructs the
 * subject field from its caller's already-verified query so the in-memory
 * repository contract remains unchanged without making the database a subject
 * directory.
 */
class SqliteHostedIdentityRepository {
  constructor({ filepath, db, subjectLookupKey, subjectLookupKeyring, busyTimeoutMs = 5000 } = {}) {
    if ((filepath == null) === (db == null)) {
      throw new TypeError("provide exactly one hosted identity sqlite filepath or db");
    }
    if (!Number.isSafeInteger(busyTimeoutMs) || busyTimeoutMs < 0 || busyTimeoutMs > 60_000) {
      throw new TypeError("hosted identity sqlite busy timeout invalid");
    }
    const lookupKeyring = subjectKeyring(subjectLookupKey, subjectLookupKeyring);
    this.subjectLookupKeys = lookupKeyring.entries;
    this.currentSubjectLookupKey = this.subjectLookupKeys[0];
    this.subjectLookupKeyIds = new Set(this.subjectLookupKeys.map((entry) => entry.id));
    this.untaggedLegacyKeyId = lookupKeyring.untaggedLegacyKeyId;
    this.explicitSubjectLookupKeyring = lookupKeyring.explicit;
    this.db = db || new DatabaseSync(filepath);
    this.ownsDb = !db;
    this.inTransaction = false;
    this.db.exec(`
      PRAGMA journal_mode = WAL;
      PRAGMA synchronous = FULL;
      PRAGMA foreign_keys = ON;
      PRAGMA busy_timeout = ${busyTimeoutMs};
    `);
    this._createSchema();
  }

  _createSchema() {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS hid_accounts (
        account_id TEXT PRIMARY KEY,
        state TEXT NOT NULL CHECK (state IN ('active','disabled','deleted')),
        payload_json TEXT NOT NULL
      ) STRICT;

      CREATE TABLE IF NOT EXISTS hid_provider_identities (
        identity_id TEXT PRIMARY KEY,
        provider TEXT NOT NULL,
        subject_lookup TEXT NOT NULL,
        subject_key_id TEXT,
        account_id TEXT NOT NULL REFERENCES hid_accounts(account_id) ON DELETE CASCADE,
        created_at INTEGER NOT NULL,
        UNIQUE (provider, subject_lookup)
      ) STRICT;

      CREATE TABLE IF NOT EXISTS hid_callbacks (
        provider TEXT NOT NULL,
        callback_id TEXT NOT NULL,
        account_id TEXT NOT NULL REFERENCES hid_accounts(account_id) ON DELETE CASCADE,
        payload_json TEXT NOT NULL,
        PRIMARY KEY (provider, callback_id)
      ) STRICT;

      CREATE TABLE IF NOT EXISTS hid_exchange_proofs (
        provider TEXT NOT NULL,
        proof_use_hash TEXT NOT NULL,
        account_id TEXT NOT NULL REFERENCES hid_accounts(account_id) ON DELETE CASCADE,
        payload_json TEXT NOT NULL,
        PRIMARY KEY (provider, proof_use_hash)
      ) STRICT;

      CREATE TABLE IF NOT EXISTS hid_entitlements (
        entitlement_id TEXT PRIMARY KEY,
        account_id TEXT NOT NULL REFERENCES hid_accounts(account_id) ON DELETE CASCADE,
        provider TEXT NOT NULL,
        app_id TEXT NOT NULL,
        grant_type TEXT NOT NULL,
        provider_grant_hash TEXT NOT NULL,
        state TEXT NOT NULL CHECK (state IN ('active','revoked','refunded')),
        observation_version INTEGER NOT NULL CHECK (observation_version >= 1),
        provider_observed_at INTEGER NOT NULL CHECK (provider_observed_at >= 0),
        observation_hash TEXT NOT NULL,
        payload_json TEXT NOT NULL,
        UNIQUE (account_id, provider, app_id, grant_type)
      ) STRICT;

      CREATE TRIGGER IF NOT EXISTS hid_entitlement_monotonic_update
      BEFORE UPDATE ON hid_entitlements
      BEGIN
        SELECT CASE
          WHEN NEW.provider_grant_hash <> OLD.provider_grant_hash
            THEN RAISE(ABORT, 'hosted entitlement grant collision')
          WHEN OLD.state <> 'active' AND NEW.state <> OLD.state
            THEN RAISE(ABORT, 'hosted entitlement terminal')
          WHEN NEW.observation_version < OLD.observation_version
            THEN RAISE(ABORT, 'hosted entitlement stale version')
          WHEN NEW.observation_version = OLD.observation_version
               AND NEW.observation_hash <> OLD.observation_hash
            THEN RAISE(ABORT, 'hosted entitlement observation conflict')
          WHEN NEW.observation_version > OLD.observation_version
               AND NEW.provider_observed_at <= OLD.provider_observed_at
            THEN RAISE(ABORT, 'hosted entitlement stale time')
        END;
      END;

      CREATE TABLE IF NOT EXISTS hid_profiles (
        profile_id TEXT PRIMARY KEY,
        account_id TEXT NOT NULL REFERENCES hid_accounts(account_id) ON DELETE CASCADE,
        state TEXT NOT NULL,
        payload_json TEXT NOT NULL
      ) STRICT;

      CREATE TABLE IF NOT EXISTS hid_refresh_families (
        family_id TEXT PRIMARY KEY,
        account_id TEXT NOT NULL REFERENCES hid_accounts(account_id) ON DELETE CASCADE,
        provider TEXT NOT NULL,
        app_id TEXT NOT NULL,
        grant_type TEXT NOT NULL,
        state TEXT NOT NULL CHECK (state IN ('active','revoked')),
        payload_json TEXT NOT NULL
      ) STRICT;

      CREATE TABLE IF NOT EXISTS hid_refresh_tokens (
        token_hash TEXT PRIMARY KEY,
        family_id TEXT NOT NULL REFERENCES hid_refresh_families(family_id) ON DELETE CASCADE,
        account_id TEXT NOT NULL REFERENCES hid_accounts(account_id) ON DELETE CASCADE,
        generation INTEGER NOT NULL CHECK (generation >= 0),
        state TEXT NOT NULL CHECK (state IN ('active','used','revoked')),
        payload_json TEXT NOT NULL
      ) STRICT;

      CREATE UNIQUE INDEX IF NOT EXISTS hid_one_active_refresh_generation
        ON hid_refresh_tokens(family_id, generation) WHERE state = 'active';

      CREATE TABLE IF NOT EXISTS hid_access_sessions (
        token_hash TEXT PRIMARY KEY,
        access_session_id TEXT NOT NULL UNIQUE,
        family_id TEXT NOT NULL REFERENCES hid_refresh_families(family_id) ON DELETE CASCADE,
        account_id TEXT NOT NULL REFERENCES hid_accounts(account_id) ON DELETE CASCADE,
        revoked_at INTEGER,
        payload_json TEXT NOT NULL
      ) STRICT;

      CREATE INDEX IF NOT EXISTS hid_access_family_idx ON hid_access_sessions(family_id);
      CREATE INDEX IF NOT EXISTS hid_refresh_family_idx ON hid_refresh_tokens(family_id);
      CREATE INDEX IF NOT EXISTS hid_entitlement_account_idx ON hid_entitlements(account_id);
    `);
    // Databases created before keyring support have an untagged HMAC column.
    // A successful lookup under a configured key is enough to tag and migrate
    // that row; no raw provider subject is needed or persisted.
    const identityColumns = this.db.prepare("PRAGMA table_info(hid_provider_identities)").all();
    if (!identityColumns.some((column) => column.name === "subject_key_id")) {
      this.db.exec("ALTER TABLE hid_provider_identities ADD COLUMN subject_key_id TEXT");
    }
    const storedKeyIds = this.db.prepare(`SELECT DISTINCT subject_key_id AS id
      FROM hid_provider_identities WHERE subject_key_id IS NOT NULL`).all();
    for (const row of storedKeyIds) {
      if (!this.subjectLookupKeyIds.has(row.id)) {
        throw new Error(`hosted identity database references unknown subject lookup key id: ${row.id}`);
      }
    }
    const untaggedRows = Number(this.db.prepare(`SELECT count(*) AS count
      FROM hid_provider_identities WHERE subject_key_id IS NULL`).get().count);
    if (untaggedRows > 0 && this.explicitSubjectLookupKeyring && this.untaggedLegacyKeyId == null) {
      throw new Error("hosted identity database has untagged legacy subjects; reviewed migration key required");
    }
  }

  _subjectLookup(provider, subject, key = this.currentSubjectLookupKey.key) {
    if (typeof provider !== "string" || typeof subject !== "string") throw new TypeError("identity lookup invalid");
    return crypto.createHmac("sha256", key)
      .update(provider, "utf8").update("\0").update(subject, "utf8").digest("base64url");
  }

  _subjectLookups(provider, subject) {
    return this.subjectLookupKeys.map((entry) => ({
      id: entry.id, lookup: this._subjectLookup(provider, subject, entry.key), current: entry.current,
    }));
  }

  transaction(operation) {
    if (typeof operation !== "function") throw new TypeError("identity transaction operation required");
    if (this.inTransaction) return operation(this);
    this.db.exec("BEGIN IMMEDIATE");
    this.inTransaction = true;
    try {
      const result = operation(this);
      if (result && typeof result.then === "function") throw new TypeError("identity transactions must be synchronous");
      this.db.exec("COMMIT");
      return result;
    } catch (error) {
      try { this.db.exec("ROLLBACK"); } catch {}
      throw error;
    } finally {
      this.inTransaction = false;
    }
  }

  close() { if (this.ownsDb) this.db.close(); }

  getAccount(accountId) {
    return parse(this.db.prepare("SELECT payload_json FROM hid_accounts WHERE account_id = ?").get(accountId));
  }
  putAccount(record) {
    this.db.prepare(`INSERT INTO hid_accounts(account_id,state,payload_json) VALUES(?,?,?)
      ON CONFLICT(account_id) DO UPDATE SET state=excluded.state,payload_json=excluded.payload_json`)
      .run(record.accountId, record.state, json(record));
  }

  getIdentity(provider, providerSubject) {
    const candidates = this._subjectLookups(provider, providerSubject);
    const placeholders = candidates.map(() => "?").join(",");
    const matches = this.db.prepare(`SELECT identity_id,provider,subject_lookup,subject_key_id,account_id,created_at
      FROM hid_provider_identities WHERE provider=? AND subject_lookup IN (${placeholders})`)
      .all(provider, ...candidates.map((candidate) => candidate.lookup));
    if (matches.length === 0) return undefined;
    if (matches.length !== 1) throw new Error("hosted identity subject lookup collision across key generations");
    const row = matches[0];
    if (row.subject_key_id != null && !this.subjectLookupKeyIds.has(row.subject_key_id)) {
      throw new Error("hosted identity subject lookup references unknown key id");
    }
    const matched = candidates.find((candidate) => candidate.lookup === row.subject_lookup);
    if (!matched) throw new Error("hosted identity subject lookup key mismatch");
    if (row.subject_key_id == null && matched.id !== this.untaggedLegacyKeyId) {
      throw new Error("hosted identity untagged subject did not match reviewed legacy key");
    }
    if (!matched.current || row.subject_key_id !== this.currentSubjectLookupKey.id) {
      // Lazy dual-read migration is atomic. Operators must retain bounded old
      // keys until every identity that must remain discoverable has traversed
      // this path; a migrated identity is safe after its old key is retired.
      this.db.prepare(`UPDATE hid_provider_identities
        SET subject_lookup=?,subject_key_id=?
        WHERE identity_id=? AND subject_lookup=?`)
        .run(candidates[0].lookup, this.currentSubjectLookupKey.id, row.identity_id, row.subject_lookup);
    }
    return {
      identityId: row.identity_id, provider: row.provider, providerSubject,
      accountId: row.account_id, createdAt: row.created_at,
    };
  }
  putIdentity(record) {
    // An untagged row could be the same provider subject under an unknown old
    // key. Until all such rows have been looked up and migrated, refusing new
    // links is the only way to rule out duplicate accounts without raw subjects.
    const untaggedRows = Number(this.db.prepare(`SELECT count(*) AS count
      FROM hid_provider_identities WHERE subject_key_id IS NULL`).get().count);
    if (untaggedRows > 0) {
      throw new Error("hosted identity links fenced until untagged legacy subjects migrate");
    }
    this.db.prepare(`INSERT INTO hid_provider_identities
      (identity_id,provider,subject_lookup,subject_key_id,account_id,created_at) VALUES(?,?,?,?,?,?)`)
      .run(record.identityId, record.provider,
        this._subjectLookup(record.provider, record.providerSubject), this.currentSubjectLookupKey.id,
        record.accountId, record.createdAt);
  }

  getCallback(provider, callbackId) {
    return parse(this.db.prepare("SELECT payload_json FROM hid_callbacks WHERE provider=? AND callback_id=?")
      .get(provider, callbackId));
  }
  putCallback(record) {
    this.db.prepare(`INSERT INTO hid_callbacks(provider,callback_id,account_id,payload_json) VALUES(?,?,?,?)`)
      .run(record.provider, record.callbackId, record.accountId, json(record));
  }

  getExchangeProof(provider, proofUseHash) {
    return parse(this.db.prepare("SELECT payload_json FROM hid_exchange_proofs WHERE provider=? AND proof_use_hash=?")
      .get(provider, proofUseHash));
  }
  putExchangeProof(record) {
    this.db.prepare(`INSERT INTO hid_exchange_proofs(provider,proof_use_hash,account_id,payload_json) VALUES(?,?,?,?)`)
      .run(record.provider, record.proofUseHash, record.accountId, json(record));
  }

  getEntitlement(accountId, provider, appId, grantType) {
    return parse(this.db.prepare(`SELECT payload_json FROM hid_entitlements
      WHERE account_id=? AND provider=? AND app_id=? AND grant_type=?`)
      .get(accountId, provider, appId, grantType));
  }
  putEntitlement(record) {
    this.db.prepare(`INSERT INTO hid_entitlements
      (entitlement_id,account_id,provider,app_id,grant_type,provider_grant_hash,state,
       observation_version,provider_observed_at,observation_hash,payload_json)
      VALUES(?,?,?,?,?,?,?,?,?,?,?)
      ON CONFLICT(account_id,provider,app_id,grant_type) DO UPDATE SET
        entitlement_id=excluded.entitlement_id,provider_grant_hash=excluded.provider_grant_hash,
        state=excluded.state,observation_version=excluded.observation_version,
        provider_observed_at=excluded.provider_observed_at,observation_hash=excluded.observation_hash,
        payload_json=excluded.payload_json`)
      .run(record.entitlementId, record.accountId, record.provider, record.appId, record.grantType,
        record.providerGrantHash, record.state, record.observationVersion, record.providerObservedAt,
        record.observationHash, json(record));
  }
  listEntitlements(accountId) {
    return this.db.prepare("SELECT payload_json FROM hid_entitlements WHERE account_id=? ORDER BY entitlement_id")
      .all(accountId).map(parse);
  }

  getProfile(profileId) {
    return parse(this.db.prepare("SELECT payload_json FROM hid_profiles WHERE profile_id=?").get(profileId));
  }
  putProfile(record) {
    this.db.prepare(`INSERT INTO hid_profiles(profile_id,account_id,state,payload_json) VALUES(?,?,?,?)
      ON CONFLICT(profile_id) DO UPDATE SET account_id=excluded.account_id,state=excluded.state,payload_json=excluded.payload_json`)
      .run(record.profileId, record.accountId, record.state, json(record));
  }

  getAccessSession(tokenHash) {
    return parse(this.db.prepare("SELECT payload_json FROM hid_access_sessions WHERE token_hash=?").get(tokenHash));
  }
  putAccessSession(record) {
    this.db.prepare(`INSERT INTO hid_access_sessions
      (token_hash,access_session_id,family_id,account_id,revoked_at,payload_json) VALUES(?,?,?,?,?,?)
      ON CONFLICT(token_hash) DO UPDATE SET access_session_id=excluded.access_session_id,
        family_id=excluded.family_id,account_id=excluded.account_id,revoked_at=excluded.revoked_at,
        payload_json=excluded.payload_json`)
      .run(record.tokenHash, record.accessSessionId, record.familyId, record.accountId,
        record.revokedAt ?? null, json(record));
  }

  getRefreshFamily(familyId) {
    return parse(this.db.prepare("SELECT payload_json FROM hid_refresh_families WHERE family_id=?").get(familyId));
  }
  putRefreshFamily(record) {
    const scope = record.scope;
    this.db.prepare(`INSERT INTO hid_refresh_families
      (family_id,account_id,provider,app_id,grant_type,state,payload_json) VALUES(?,?,?,?,?,?,?)
      ON CONFLICT(family_id) DO UPDATE SET account_id=excluded.account_id,provider=excluded.provider,
        app_id=excluded.app_id,grant_type=excluded.grant_type,state=excluded.state,payload_json=excluded.payload_json`)
      .run(record.familyId, record.accountId, scope.provider, scope.appId, scope.grantType, record.state, json(record));
  }

  getRefreshToken(tokenHash) {
    return parse(this.db.prepare("SELECT payload_json FROM hid_refresh_tokens WHERE token_hash=?").get(tokenHash));
  }
  putRefreshToken(record) {
    this.db.prepare(`INSERT INTO hid_refresh_tokens
      (token_hash,family_id,account_id,generation,state,payload_json) VALUES(?,?,?,?,?,?)
      ON CONFLICT(token_hash) DO UPDATE SET family_id=excluded.family_id,account_id=excluded.account_id,
        generation=excluded.generation,state=excluded.state,payload_json=excluded.payload_json`)
      .run(record.tokenHash, record.familyId, record.accountId, record.generation, record.state, json(record));
  }

  revokeFamily(familyId, revokedAt, reason) {
    const family = this.getRefreshFamily(familyId);
    if (!family) return;
    this.putRefreshFamily({ ...family, state: "revoked", revokedAt, revokeReason: reason });
    const tokens = this.db.prepare("SELECT token_hash,payload_json FROM hid_refresh_tokens WHERE family_id=? AND state='active'")
      .all(familyId);
    for (const row of tokens) this.putRefreshToken({ ...JSON.parse(row.payload_json), state: "revoked", revokedAt });
    const sessions = this.db.prepare("SELECT token_hash,payload_json FROM hid_access_sessions WHERE family_id=? AND revoked_at IS NULL")
      .all(familyId);
    for (const row of sessions) this.putAccessSession({ ...JSON.parse(row.payload_json), revokedAt, revokeReason: reason });
  }

  revokeFamiliesForEntitlement(accountId, scope, revokedAt, reason) {
    const rows = this.db.prepare(`SELECT family_id FROM hid_refresh_families
      WHERE account_id=? AND provider=? AND app_id=? AND grant_type=? AND state='active'`)
      .all(accountId, scope.provider, scope.appId, scope.grantType);
    for (const row of rows) this.revokeFamily(row.family_id, revokedAt, reason);
  }

  deleteAccount(accountId) {
    return this.db.prepare("DELETE FROM hid_accounts WHERE account_id=?").run(accountId).changes > 0;
  }
}

module.exports = {
  SqliteHostedIdentityRepository,
  SUBJECT_KEY_BYTES,
  MAX_PREVIOUS_SUBJECT_KEYS,
  LEGACY_SUBJECT_KEY_ID,
};
