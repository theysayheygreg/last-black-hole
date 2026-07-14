const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { DatabaseSync, backup } = require("node:sqlite");
const { normalizeProfileSnapshot } = require("./control-plane-store.cjs");
const { applyRelationalMigrations, SCHEMA_VERSION } = require("./control-plane-relational-schema.cjs");
const relationalMigration = require("./control-plane-relational-migration.cjs");

const DEFAULT_LOADOUT = { equipped: [null, null], consumables: [null, null] };
const DEFAULT_UPGRADES = { thrust: 0, hull: 0, coupling: 0, drag: 0, sensor: 0, vault: 0 };

function nowIso() {
  return new Date().toISOString();
}

function stableJson(value) {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableJson(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value === undefined ? null : value);
}

function sha256(value) {
  return crypto.createHash("sha256").update(Buffer.isBuffer(value) ? value : String(value)).digest("hex");
}

function stableId(prefix, ...parts) {
  return `${prefix}-${sha256(parts.join("\u001f")).slice(0, 32)}`;
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function parseJson(value, fallback) {
  try {
    return JSON.parse(value);
  } catch {
    return clone(fallback);
  }
}

function boundedString(value, name, { min = 1, max = 128 } = {}) {
  const text = String(value ?? "");
  if (text.length < min || text.length > max || /[\u0000-\u001f]/.test(text)) {
    const error = new Error(`${name} is malformed`);
    error.code = "INVALID_INPUT";
    throw error;
  }
  return text;
}

function boundedJson(value, name, maxBytes) {
  const json = stableJson(value);
  if (Buffer.byteLength(json) > maxBytes) {
    const error = new Error(`${name} exceeds its bounded size`);
    error.code = "INVALID_INPUT";
    throw error;
  }
  return json;
}

function finiteNonnegative(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(0, number) : fallback;
}

function integerNonnegative(value, fallback = 0) {
  return Math.round(finiteNonnegative(value, fallback));
}

function sqliteError(error, code = "RELATIONAL_STORE_ERROR") {
  if (!error.code || String(error.code).startsWith("ERR_SQLITE")) error.code = code;
  return error;
}

function normalizedOutcome(value) {
  if (value === "escaped") return "extracted";
  if (["extracted", "dead", "disconnected", "abandoned"].includes(value)) return value;
  return "abandoned";
}

function normalizedSessionStatus(value) {
  const status = String(value || "LOBBY").toUpperCase();
  if (["IDLE", "LOBBY", "PLACING", "LIVE", "ENDED", "INTERRUPTED"].includes(status)) return status;
  if (["RUNNING", "PLAYING", "ACTIVE", "IN_RUN"].includes(status)) return "LIVE";
  if (["CLOSED", "COMPLETE", "COMPLETED"].includes(status)) return "ENDED";
  return "LOBBY";
}

function safeItem(item, index) {
  if (!item || typeof item !== "object") throw Object.assign(new Error("inventory item is malformed"), { code: "INVALID_INPUT" });
  const itemId = boundedString(item.id || `item-${index}`, "item.id");
  const record = { ...clone(item), id: itemId };
  boundedJson(record, "inventory item", 16384);
  return record;
}

function sanitizeResultValue(value) {
  if (Array.isArray(value)) return value.map(sanitizeResultValue);
  if (!value || typeof value !== "object") return value;
  const sanitized = {};
  for (const [key, child] of Object.entries(value)) {
    if (/^(clientId|authorityInstanceId|authorityLeaseId|commandCredential|serviceToken)$/i.test(key)) continue;
    sanitized[key] = sanitizeResultValue(child);
  }
  return sanitized;
}

class RelationalControlPlaneStore {
  constructor(filepath, options = {}) {
    this.filepath = path.resolve(filepath);
    this.faultInjector = typeof options.faultInjector === "function" ? options.faultInjector : null;
    fs.mkdirSync(path.dirname(this.filepath), { recursive: true });
    this.db = new DatabaseSync(this.filepath);
    this.db.exec("PRAGMA foreign_keys = ON");
    this.db.exec("PRAGMA busy_timeout = 5000");
    this.db.exec("PRAGMA journal_mode = WAL");
    this.db.exec("PRAGMA synchronous = FULL");
    this.db.exec("PRAGMA wal_autocheckpoint = 1000");
    applyRelationalMigrations(this.db);
  }

  get schemaVersion() {
    return Number(this.db.prepare("PRAGMA user_version").get().user_version);
  }

  close() {
    if (!this.db) return;
    this.db.exec("PRAGMA wal_checkpoint(TRUNCATE)");
    this.db.close();
    this.db = null;
  }

  _transaction(fn) {
    this.db.exec("BEGIN IMMEDIATE");
    try {
      const result = fn();
      this.db.exec("COMMIT");
      return result;
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }
  }

  _fault(step) {
    if (this.faultInjector) this.faultInjector(step);
  }

  _profileRow(profileId) {
    return this.db.prepare("SELECT * FROM profiles WHERE profile_id = ?").get(profileId) || null;
  }

  _insertProfile(profileId, snapshot = {}, fallbackName = "Pilot", reason = "create") {
    const normalized = normalizeProfileSnapshot(snapshot, profileId, fallbackName);
    const timestamp = nowIso();
    const id = boundedString(profileId || normalized.id, "profileId");
    const name = boundedString(normalized.name || fallbackName, "profile.name", { max: 64 });
    const loadoutJson = boundedJson(normalized.loadout || DEFAULT_LOADOUT, "profile.loadout", 16384);
    const upgradesJson = boundedJson(normalized.upgrades || DEFAULT_UPGRADES, "profile.upgrades", 16384);
    const rigsJson = boundedJson(normalized.rigLevels || [0, 0, 0], "profile.rigLevels", 1024);
    this.db.prepare(`
      INSERT INTO profiles(
        profile_id, subject_hash, name, revision, exotic_matter, vault_capacity, hull_type,
        loadout_json, upgrades_json, rig_levels_json, total_extractions, total_deaths,
        total_items_sold, best_survival_time, total_exotic_matter_earned, created_at, last_played_at
      ) VALUES (?, ?, ?, 1, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id, sha256(`profile\u001f${id}`), name, integerNonnegative(normalized.exoticMatter),
      Math.min(250, integerNonnegative(normalized.vaultCapacity, 25)), boundedString(normalized.hullType || "drifter", "profile.hullType", { max: 32 }),
      loadoutJson, upgradesJson, rigsJson, integerNonnegative(normalized.totalExtractions),
      integerNonnegative(normalized.totalDeaths), integerNonnegative(normalized.totalItemsSold),
      finiteNonnegative(normalized.bestSurvivalTime), integerNonnegative(normalized.totalExoticMatterEarned),
      normalized.created || timestamp, normalized.lastPlayed || timestamp,
    );
    const revisionDetail = boundedJson({ name, hullType: normalized.hullType || "drifter" }, "profile revision", 32768);
    this.db.prepare(`
      INSERT INTO profile_revisions(profile_id, revision, reason, detail_json, created_at)
      VALUES (?, 1, ?, ?, ?)
    `).run(id, reason, revisionDetail, timestamp);
    const vault = Array.isArray(normalized.vault) ? normalized.vault : [];
    const seen = new Set();
    for (let slot = 0; slot < Math.min(vault.length, Math.min(250, integerNonnegative(normalized.vaultCapacity, 25))); slot++) {
      const item = safeItem(vault[slot], slot);
      if (seen.has(item.id)) throw Object.assign(new Error("duplicate inventory item"), { code: "INVALID_INPUT" });
      seen.add(item.id);
      this.db.prepare(`
        INSERT INTO inventory_items(inventory_row_id, profile_id, settlement_id, slot_no, item_id, item_json, created_at)
        VALUES (?, ?, NULL, ?, ?, ?, ?)
      `).run(stableId("inventory", id, item.id), id, slot, item.id, stableJson(item), timestamp);
    }
    return this._profileRow(id);
  }

  _ensureProfile(profileId, snapshot = {}, fallbackName = "Pilot") {
    const id = boundedString(profileId, "profileId");
    return this._profileRow(id) || this._insertProfile(id, snapshot, fallbackName);
  }

  _rowToProfile(row) {
    if (!row) return null;
    const vault = this.db.prepare("SELECT item_json FROM inventory_items WHERE profile_id = ? ORDER BY slot_no")
      .all(row.profile_id).map((entry) => parseJson(entry.item_json, null)).filter(Boolean);
    return {
      id: row.profile_id,
      name: row.name,
      revision: Number(row.revision),
      created: row.created_at,
      lastPlayed: row.last_played_at,
      exoticMatter: Number(row.exotic_matter),
      vault,
      vaultCapacity: Number(row.vault_capacity),
      loadout: parseJson(row.loadout_json, DEFAULT_LOADOUT),
      upgrades: parseJson(row.upgrades_json, DEFAULT_UPGRADES),
      rigLevels: parseJson(row.rig_levels_json, [0, 0, 0]),
      hullType: row.hull_type,
      totalExtractions: Number(row.total_extractions),
      totalDeaths: Number(row.total_deaths),
      totalItemsSold: Number(row.total_items_sold),
      bestSurvivalTime: Number(row.best_survival_time),
      totalExoticMatterEarned: Number(row.total_exotic_matter_earned),
    };
  }

  bootstrapProfile({ profileId, snapshot, fallbackName = "Pilot" }) {
    return this._transaction(() => {
      const existing = this._profileRow(boundedString(profileId || snapshot?.id, "profileId"));
      if (!existing) return clone(this._rowToProfile(this._insertProfile(profileId || snapshot?.id, snapshot, fallbackName)));
      const name = boundedString(snapshot?.name || existing.name, "profile.name", { max: 64 });
      if (name !== existing.name) {
        const revision = Number(existing.revision) + 1;
        const timestamp = nowIso();
        this.db.prepare("UPDATE profiles SET name = ?, revision = ?, last_played_at = ? WHERE profile_id = ?")
          .run(name, revision, timestamp, existing.profile_id);
        this.db.prepare("INSERT INTO profile_revisions VALUES (?, ?, 'display-name', ?, ?)")
          .run(existing.profile_id, revision, stableJson({ name }), timestamp);
      }
      return clone(this._rowToProfile(this._profileRow(existing.profile_id)));
    });
  }

  getProfile(profileId) {
    if (!profileId) return null;
    return clone(this._rowToProfile(this._profileRow(boundedString(profileId, "profileId"))));
  }

  saveProfile(profile) {
    if (!profile?.id) throw Object.assign(new Error("profile.id is required"), { code: "INVALID_INPUT" });
    return this._transaction(() => {
      const existing = this._ensureProfile(profile.id, profile, profile.name);
      const normalized = normalizeProfileSnapshot(profile, profile.id, profile.name || existing.name);
      const revision = Number(existing.revision) + 1;
      const timestamp = nowIso();
      this.db.prepare(`
        UPDATE profiles SET name = ?, revision = ?, exotic_matter = ?, vault_capacity = ?, hull_type = ?,
          loadout_json = ?, upgrades_json = ?, rig_levels_json = ?, total_extractions = ?, total_deaths = ?,
          total_items_sold = ?, best_survival_time = ?, total_exotic_matter_earned = ?, last_played_at = ?
        WHERE profile_id = ?
      `).run(
        boundedString(normalized.name, "profile.name", { max: 64 }), revision,
        integerNonnegative(normalized.exoticMatter), Math.min(250, integerNonnegative(normalized.vaultCapacity, 25)),
        boundedString(normalized.hullType, "profile.hullType", { max: 32 }),
        boundedJson(normalized.loadout, "profile.loadout", 16384), boundedJson(normalized.upgrades, "profile.upgrades", 16384),
        boundedJson(normalized.rigLevels, "profile.rigLevels", 1024), integerNonnegative(normalized.totalExtractions),
        integerNonnegative(normalized.totalDeaths), integerNonnegative(normalized.totalItemsSold),
        finiteNonnegative(normalized.bestSurvivalTime), integerNonnegative(normalized.totalExoticMatterEarned), timestamp, profile.id,
      );
      this.db.prepare("DELETE FROM inventory_items WHERE profile_id = ?").run(profile.id);
      const seen = new Set();
      for (let slot = 0; slot < Math.min(normalized.vault.length, normalized.vaultCapacity); slot++) {
        const item = safeItem(normalized.vault[slot], slot);
        if (seen.has(item.id)) throw Object.assign(new Error("duplicate inventory item"), { code: "INVALID_INPUT" });
        seen.add(item.id);
        this.db.prepare("INSERT INTO inventory_items VALUES (?, ?, NULL, ?, ?, ?, ?)")
          .run(stableId("inventory", profile.id, item.id), profile.id, slot, item.id, stableJson(item), timestamp);
      }
      this.db.prepare("INSERT INTO profile_revisions VALUES (?, ?, 'save', ?, ?)")
        .run(profile.id, revision, boundedJson({ name: normalized.name, hullType: normalized.hullType }, "profile revision", 32768), timestamp);
      return clone(this._rowToProfile(this._profileRow(profile.id)));
    });
  }

  _ensureLocalTopology({ profileId, session, runId }) {
    const timestamp = nowIso();
    const sessionId = boundedString(session?.id || `session-${runId}`, "sessionId");
    this.db.prepare(`
      INSERT INTO sessions(session_id, run_id_hint, map_id, status, max_players, created_at, updated_at)
      VALUES (?, ?, ?, 'LIVE', 4, ?, ?)
      ON CONFLICT(session_id) DO UPDATE SET run_id_hint = excluded.run_id_hint, updated_at = excluded.updated_at
    `).run(sessionId, runId, session?.mapId || null, timestamp, timestamp);
    const sessionMembershipId = stableId("session-membership", sessionId, profileId);
    const currentCount = Number(this.db.prepare(
      "SELECT count(*) AS count FROM session_memberships WHERE session_id = ? AND status = 'ACTIVE'"
    ).get(sessionId).count);
    const existingSessionMember = this.db.prepare(
      "SELECT * FROM session_memberships WHERE session_membership_id = ?"
    ).get(sessionMembershipId);
    if (!existingSessionMember) {
      const seat = Math.min(3, currentCount);
      this.db.prepare(`
        INSERT INTO session_memberships VALUES (?, ?, ?, ?, ?, 'ACTIVE', ?, ?)
      `).run(sessionMembershipId, sessionId, profileId, seat, currentCount === 0 ? "LEADER" : "MEMBER", `Pilot ${seat + 1}`, timestamp);
    }
    this.db.prepare(`
      INSERT INTO runs(run_id, session_id, status, result_version, created_at, ended_at)
      VALUES (?, ?, 'LIVE', 1, ?, NULL)
      ON CONFLICT(run_id) DO NOTHING
    `).run(runId, sessionId, timestamp);
    const runMembershipId = stableId("run-membership", runId, profileId);
    const existingRunMember = this.db.prepare("SELECT * FROM run_memberships WHERE run_membership_id = ?").get(runMembershipId);
    if (!existingRunMember) {
      const seatNo = Number(this.db.prepare(
        "SELECT seat_no FROM session_memberships WHERE session_membership_id = ?"
      ).get(sessionMembershipId).seat_no);
      this.db.prepare(`
        INSERT INTO run_memberships VALUES (?, ?, ?, ?, ?, ?, 'ACTIVE', ?)
      `).run(runMembershipId, runId, sessionMembershipId, profileId, seatNo, `player-${seatNo + 1}`, timestamp);
    }
    return { sessionId, sessionMembershipId, runMembershipId };
  }

  createAuthorityInstance({ authorityInstanceId, status = "READY" }) {
    const id = boundedString(authorityInstanceId, "authorityInstanceId");
    const timestamp = nowIso();
    this.db.prepare(`
      INSERT INTO authority_instances VALUES (?, ?, ?, ?)
      ON CONFLICT(authority_instance_id) DO UPDATE SET status = excluded.status, updated_at = excluded.updated_at
    `).run(id, status, timestamp, timestamp);
    return { authorityInstanceId: id, status };
  }

  claimAuthorityLease({ runId, authorityInstanceId, expectedEpoch = 0, expectedLeaseId = null, deadlineAt = null }) {
    return this._transaction(() => {
      const run = this.db.prepare("SELECT run_id FROM runs WHERE run_id = ?").get(boundedString(runId, "runId"));
      if (!run) throw Object.assign(new Error("run does not exist"), { code: "FOREIGN_KEY_REJECTED" });
      this.createAuthorityInstance({ authorityInstanceId });
      const currentEpoch = Number(this.db.prepare(
        "SELECT COALESCE(max(lease_epoch), 0) AS epoch FROM authority_leases WHERE run_id = ?"
      ).get(runId).epoch);
      if (currentEpoch !== Number(expectedEpoch)) {
        throw Object.assign(new Error("lease compare-and-swap failed"), { code: "STALE_LEASE" });
      }
      const active = this.db.prepare("SELECT authority_lease_id FROM authority_leases WHERE run_id = ? AND status = 'ACTIVE'").get(runId);
      if (active && active.authority_lease_id !== expectedLeaseId) {
        throw Object.assign(new Error("lease compare-and-swap failed"), { code: "STALE_LEASE" });
      }
      this.db.prepare("UPDATE authority_leases SET status = 'FENCED', updated_at = ? WHERE run_id = ? AND status = 'ACTIVE'")
        .run(nowIso(), runId);
      this.db.prepare("UPDATE run_placements SET status = 'ENDED' WHERE run_id = ? AND status IN ('SELECTED','READY')").run(runId);
      const epoch = currentEpoch + 1;
      const placementId = stableId("placement", runId, epoch);
      const leaseId = stableId("lease", runId, epoch, authorityInstanceId);
      const timestamp = nowIso();
      this.db.prepare("INSERT INTO run_placements VALUES (?, ?, ?, ?, 'READY', ?)")
        .run(placementId, runId, authorityInstanceId, epoch, timestamp);
      this.db.prepare("INSERT INTO authority_leases VALUES (?, ?, ?, ?, ?, 'ACTIVE', ?, ?, ?)")
        .run(leaseId, runId, placementId, authorityInstanceId, epoch, deadlineAt || "9999-12-31T23:59:59.999Z", timestamp, timestamp);
      return { runId, authorityInstanceId, placementId, authorityLeaseId: leaseId, leaseEpoch: epoch };
    });
  }

  renewAuthorityLease({ runId, authorityLeaseId, leaseEpoch, deadlineAt }) {
    const result = this.db.prepare(`
      UPDATE authority_leases SET deadline_at = ?, updated_at = ?
      WHERE run_id = ? AND authority_lease_id = ? AND lease_epoch = ? AND status = 'ACTIVE'
    `).run(deadlineAt, nowIso(), runId, authorityLeaseId, leaseEpoch);
    if (Number(result.changes) !== 1) throw Object.assign(new Error("stale authority lease"), { code: "STALE_LEASE" });
    return { runId, authorityLeaseId, leaseEpoch, deadlineAt };
  }

  fenceAuthorityLease({ runId, authorityLeaseId, leaseEpoch }) {
    const result = this.db.prepare(`
      UPDATE authority_leases SET status = 'FENCED', updated_at = ?
      WHERE run_id = ? AND authority_lease_id = ? AND lease_epoch = ? AND status = 'ACTIVE'
    `).run(nowIso(), runId, authorityLeaseId, leaseEpoch);
    if (Number(result.changes) !== 1) throw Object.assign(new Error("stale authority lease"), { code: "STALE_LEASE" });
    return { fenced: true };
  }

  _ensureLease(runId, settlement = {}) {
    let active = this.db.prepare("SELECT * FROM authority_leases WHERE run_id = ? AND status = 'ACTIVE'").get(runId);
    if (!active) {
      const authorityInstanceId = boundedString(settlement.authorityInstanceId || "local-authority", "authorityInstanceId");
      this.createAuthorityInstance({ authorityInstanceId });
      const maxEpoch = Number(this.db.prepare(
        "SELECT COALESCE(max(lease_epoch), 0) AS epoch FROM authority_leases WHERE run_id = ?"
      ).get(runId).epoch);
      const requested = settlement.authorityEpoch == null ? maxEpoch + 1 : Number(settlement.authorityEpoch);
      if (!Number.isInteger(requested) || requested !== maxEpoch + 1) {
        throw Object.assign(new Error("stale authority lease"), { code: "STALE_LEASE" });
      }
      const placementId = stableId("placement", runId, requested);
      const leaseId = settlement.authorityLeaseId
        ? boundedString(settlement.authorityLeaseId, "authorityLeaseId")
        : stableId("lease", runId, requested, authorityInstanceId);
      const timestamp = nowIso();
      this.db.prepare("INSERT INTO run_placements VALUES (?, ?, ?, ?, 'READY', ?)")
        .run(placementId, runId, authorityInstanceId, requested, timestamp);
      this.db.prepare("INSERT INTO authority_leases VALUES (?, ?, ?, ?, ?, 'ACTIVE', ?, ?, ?)")
        .run(leaseId, runId, placementId, authorityInstanceId, requested, "9999-12-31T23:59:59.999Z", timestamp, timestamp);
      active = this.db.prepare("SELECT * FROM authority_leases WHERE authority_lease_id = ?").get(leaseId);
    }
    if (settlement.authorityInstanceId && active.authority_instance_id !== settlement.authorityInstanceId) {
      throw Object.assign(new Error("stale authority lease"), { code: "STALE_LEASE" });
    }
    if (settlement.authorityLeaseId && active.authority_lease_id !== settlement.authorityLeaseId) {
      throw Object.assign(new Error("stale authority lease"), { code: "STALE_LEASE" });
    }
    if (settlement.authorityEpoch != null && Number(active.lease_epoch) !== Number(settlement.authorityEpoch)) {
      throw Object.assign(new Error("stale authority lease"), { code: "STALE_LEASE" });
    }
    return active;
  }

  _immutableResult(payload, runId, resultVersion) {
    const player = payload.player || {};
    const sanitizedPlayer = {
      name: player.name || null,
      hullType: player.hullType || null,
      rigLevels: Array.isArray(player.rigLevels) ? player.rigLevels.slice(0, 3) : [],
      cargo: Array.isArray(player.cargo) ? player.cargo.map(clone) : [],
      equipped: Array.isArray(player.equipped) ? player.equipped.map(clone) : [],
      consumables: Array.isArray(player.consumables) ? player.consumables.map(clone) : [],
      signal: player.signal && typeof player.signal === "object" ? clone(player.signal) : null,
    };
    const immutable = {
      runId,
      profileId: payload.profileId,
      resultVersion,
      outcome: payload.outcome,
      runDuration: payload.runDuration || 0,
      session: payload.session ? { id: payload.session.id || null, runId, mapId: payload.session.mapId || null } : null,
      player: sanitizedPlayer,
      runResult: payload.runResult ? sanitizeResultValue(payload.runResult) : null,
    };
    return { immutable, json: boundedJson(immutable, "result payload", 131072), hash: sha256(stableJson(immutable)) };
  }

  _recordConflict({ runId, runMembershipId, resultVersion, acceptedHash, presentedHash }) {
    this._transaction(() => {
      this.db.prepare(`
        INSERT OR IGNORE INTO conflict_quarantine VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run(stableId("conflict", runId, runMembershipId, resultVersion, presentedHash), runId, runMembershipId,
        resultVersion, acceptedHash, presentedHash, nowIso());
    });
  }

  applyOutcome(payload) {
    const profileId = boundedString(payload?.profileId, "profileId");
    const runId = boundedString(payload?.runResult?.runId || payload?.session?.runId || payload?.session?.id, "runId");
    const resultVersion = Number(payload?.runResult?.resultVersion || payload?.settlement?.resultVersion || 1);
    if (!Number.isInteger(resultVersion) || resultVersion < 1) throw Object.assign(new Error("resultVersion is malformed"), { code: "INVALID_INPUT" });
    const immutable = this._immutableResult(payload, runId, resultVersion);
    const runMembershipId = stableId("run-membership", runId, profileId);
    const existing = this.db.prepare(`
      SELECT rr.result_hash, rs.committed_json FROM run_results rr
      JOIN run_settlements rs ON rs.result_id = rr.result_id
      WHERE rr.run_id = ? AND rr.run_membership_id = ? AND rr.result_version = ?
    `).get(runId, runMembershipId, resultVersion);
    if (existing) {
      if (existing.result_hash !== immutable.hash) {
        this._recordConflict({ runId, runMembershipId, resultVersion, acceptedHash: existing.result_hash, presentedHash: immutable.hash });
        throw Object.assign(new Error("settlement result conflict quarantined"), { code: "SETTLEMENT_CONFLICT" });
      }
      return { ...parseJson(existing.committed_json, {}), replayed: true };
    }

    try {
      return this._transaction(() => {
        this._ensureProfile(profileId, {}, payload.player?.name || "Pilot");
        const topology = this._ensureLocalTopology({ profileId, session: payload.session, runId });
        const lease = this._ensureLease(runId, payload.settlement || {});
        this._fault("after-topology");

        const resultId = stableId("result", runId, topology.runMembershipId, resultVersion);
        const settlementId = stableId("settlement", resultId);
        const idempotencyKey = sha256(`${runId}\u001f${topology.runMembershipId}\u001f${resultVersion}`);
        const timestamp = nowIso();
        this.db.prepare(`
          INSERT INTO run_results VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'ACCEPTED', ?)
        `).run(resultId, runId, topology.runMembershipId, profileId, lease.authority_lease_id,
          Number(lease.lease_epoch), resultVersion, immutable.hash, immutable.json, timestamp);
        this._fault("after-result");

        const current = this._rowToProfile(this._profileRow(profileId));
        const outcome = normalizedOutcome(payload.runResult?.outcome || payload.outcome);
        const emCredit = ["dead", "extracted"].includes(outcome)
          ? integerNonnegative(payload.runResult?.emEarned, 0)
          : 0;
        const survival = finiteNonnegative(payload.runResult?.survivalTime, payload.runDuration || 0);
        const cargo = outcome === "extracted"
          ? (Array.isArray(payload.runResult?.cargoExtracted) ? payload.runResult.cargoExtracted : payload.player?.cargo || [])
          : [];
        const existingItemIds = new Set(current.vault.map((item) => item.id));
        const additions = [];
        let overflowValue = 0;
        for (let index = 0; index < cargo.length; index++) {
          const item = safeItem(cargo[index], index);
          if (existingItemIds.has(item.id)) throw Object.assign(new Error("duplicate inventory item"), { code: "INVALID_INPUT" });
          existingItemIds.add(item.id);
          if (current.vault.length + additions.length < current.vaultCapacity) additions.push(item);
          else overflowValue += integerNonnegative(item.value);
        }
        const credited = emCredit + overflowValue;
        const revision = current.revision + 1;
        const totalExtractions = current.totalExtractions + (outcome === "extracted" ? 1 : 0);
        const totalDeaths = current.totalDeaths + (outcome === "dead" ? 1 : 0);
        const balance = current.exoticMatter + credited;
        const result = { outcome, tax: 0, emCredited: credited, overflowValue, extractedCount: cargo.length };

        this.db.prepare(`
          UPDATE profiles SET revision = ?, exotic_matter = ?, loadout_json = ?, total_extractions = ?, total_deaths = ?,
            best_survival_time = ?, total_exotic_matter_earned = ?, last_played_at = ? WHERE profile_id = ?
        `).run(revision, balance, boundedJson({
          equipped: payload.player?.equipped || [], consumables: payload.player?.consumables || [],
        }, "profile.loadout", 16384), totalExtractions, totalDeaths, Math.max(current.bestSurvivalTime, outcome === "extracted" ? survival : 0),
        current.totalExoticMatterEarned + credited, timestamp, profileId);
        this._fault("after-profile");

        const provisional = {
          profile: null,
          result,
          settlement: {
            settlementId, idempotencyKey, runId, profileId, resultVersion,
            authorityInstanceId: lease.authority_instance_id,
            authorityLeaseId: lease.authority_lease_id,
            authorityEpoch: Number(lease.lease_epoch), resultHash: immutable.hash, committedAt: timestamp,
          },
        };
        this.db.prepare("INSERT INTO run_settlements VALUES (?, ?, ?, ?, ?, ?)")
          .run(settlementId, resultId, profileId, idempotencyKey, "{}", timestamp);
        this._fault("after-settlement");
        if (credited !== 0) {
          this.db.prepare("INSERT INTO ledger_entries VALUES (?, ?, ?, 'run-result', 'EM', ?, ?, ?)")
            .run(stableId("ledger", settlementId, "run-result", "EM"), profileId, settlementId, credited, balance, timestamp);
        }
        this._fault("after-ledger");
        const nextSlot = current.vault.length;
        additions.forEach((item, index) => {
          this.db.prepare("INSERT INTO inventory_items VALUES (?, ?, ?, ?, ?, ?, ?)")
            .run(stableId("inventory", profileId, item.id), profileId, settlementId, nextSlot + index, item.id, stableJson(item), timestamp);
        });
        this._fault("after-inventory");
        this.db.prepare("INSERT INTO profile_revisions VALUES (?, ?, 'settlement', ?, ?)")
          .run(profileId, revision, boundedJson({ settlementId, resultHash: immutable.hash }, "profile revision", 32768), timestamp);
        this.db.prepare("UPDATE run_results SET status = 'SETTLED' WHERE result_id = ?").run(resultId);
        this.db.prepare("UPDATE run_memberships SET status = 'ENDED' WHERE run_membership_id = ?").run(topology.runMembershipId);
        this.db.prepare("UPDATE runs SET status = 'ENDED', ended_at = ? WHERE run_id = ?").run(timestamp, runId);
        provisional.profile = this._rowToProfile(this._profileRow(profileId));
        const committedJson = boundedJson(provisional, "committed settlement", 131072);
        this.db.prepare("UPDATE run_settlements SET committed_json = ? WHERE settlement_id = ?")
          .run(committedJson, settlementId);
        this._fault("before-commit");
        return { ...provisional, replayed: false };
      });
    } catch (error) {
      throw sqliteError(error);
    }
  }

  getRecentRuns(profileId, limit = 5) {
    const safeLimit = Math.max(1, Math.min(20, Math.floor(Number(limit) || 5)));
    return this.db.prepare(`
      SELECT payload_json FROM run_results WHERE profile_id = ? ORDER BY created_at DESC, result_id DESC LIMIT ?
    `).all(boundedString(profileId, "profileId"), safeLimit)
      .map((row) => parseJson(row.payload_json, null))
      .filter(Boolean)
      .map((payload) => ({
        ...(payload.runResult || {}),
        runId: payload.runId,
        profileId: payload.profileId,
        outcome: normalizedOutcome(payload.runResult?.outcome || payload.outcome),
        updatedAt: payload.runResult?.updatedAt || null,
      }));
  }

  upsertSession(session, players = []) {
    const humans = players.filter((player) => !player?.isAI);
    if (humans.length > 4) throw Object.assign(new Error("session membership cap is four"), { code: "SESSION_CAP" });
    return this._transaction(() => {
      const sessionId = boundedString(session?.id, "sessionId");
      const maxPlayers = Number(session?.maxPlayers);
      const cap = Number.isInteger(maxPlayers) && maxPlayers >= 1 && maxPlayers <= 4 ? maxPlayers : 4;
      if (humans.length > cap) throw Object.assign(new Error("session declared membership cap reached"), { code: "SESSION_CAP" });
      const timestamp = nowIso();
      this.db.prepare(`
        INSERT INTO sessions VALUES (?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(session_id) DO UPDATE SET run_id_hint=excluded.run_id_hint, map_id=excluded.map_id,
          status=excluded.status, max_players=excluded.max_players, updated_at=excluded.updated_at
      `).run(sessionId, session.runId || sessionId, session.mapId || null,
        normalizedSessionStatus(session.status), cap, timestamp, timestamp);
      this.db.prepare("UPDATE session_memberships SET status='LEFT', role='MEMBER' WHERE session_id=? AND status='ACTIVE'").run(sessionId);
      humans.forEach((player, seat) => {
        const profileId = boundedString(player.profileId, "profileId");
        this._ensureProfile(profileId, {}, player.name || `Pilot ${seat + 1}`);
        const membershipId = stableId("session-membership", sessionId, profileId);
        this.db.prepare(`
          INSERT INTO session_memberships VALUES (?, ?, ?, ?, ?, 'ACTIVE', ?, ?)
          ON CONFLICT(session_membership_id) DO UPDATE SET seat_no=excluded.seat_no, role=excluded.role,
            status='ACTIVE', public_alias=excluded.public_alias
        `).run(membershipId, sessionId, profileId, seat,
          (session.hostProfileId ? session.hostProfileId === profileId : seat === 0) ? "LEADER" : "MEMBER",
          boundedString(player.name || `Pilot ${seat + 1}`, "player.name", { max: 64 }), timestamp);
      });
      return {
        sessionId,
        runId: session.runId || sessionId,
        status: session.status || "lobby",
        maxPlayers: cap,
        playerCount: humans.length,
        players: humans.map((player) => ({ profileId: player.profileId, name: player.name, status: player.status })),
        updatedAt: timestamp,
      };
    });
  }

  markSessionEnded(session, players = [], extra = {}) {
    return this.upsertSession({ ...session, status: extra.status || "ENDED" }, players);
  }

  inspectJsonSnapshot(sourcePath) {
    return relationalMigration.inspectJsonSnapshot(sourcePath).report;
  }

  importJsonSnapshot(options) {
    return relationalMigration.importJsonSnapshot(this, options);
  }

  exportProfile(profileId) {
    return relationalMigration.exportProfile(this, boundedString(profileId, "profileId"));
  }

  deleteProfile(profileId, options = {}) {
    return relationalMigration.deleteProfile(this, boundedString(profileId, "profileId"), options);
  }

  exportDeletionLedger() {
    return relationalMigration.exportDeletionLedger(this);
  }

  replayDeletionLedger(records) {
    return relationalMigration.replayDeletionLedger(this, records);
  }

  inspectCounts() {
    const tables = ["profiles", "profile_revisions", "inventory_items", "ledger_entries", "sessions",
      "session_memberships", "runs", "run_memberships", "authority_leases", "run_results",
      "run_settlements", "conflict_quarantine", "import_journal", "deletion_ledger"];
    return Object.fromEntries(tables.map((table) => [table, Number(this.db.prepare(`SELECT count(*) AS count FROM ${table}`).get().count)]));
  }

  integrityCheck() {
    return {
      integrity: this.db.prepare("PRAGMA integrity_check").get().integrity_check,
      foreignKeys: this.db.prepare("PRAGMA foreign_key_check").all(),
      schemaVersion: this.schemaVersion,
      journalMode: this.db.prepare("PRAGMA journal_mode").get().journal_mode,
      synchronous: Number(this.db.prepare("PRAGMA synchronous").get().synchronous),
    };
  }

  async backupTo(destination) {
    const target = path.resolve(destination);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    if (fs.existsSync(target)) throw Object.assign(new Error("backup destination already exists"), { code: "BACKUP_EXISTS" });
    await backup(this.db, target);
    return { path: target, hash: sha256(fs.readFileSync(target)) };
  }
}

module.exports = {
  RelationalControlPlaneStore,
  SCHEMA_VERSION,
  stableJson,
  sha256,
};
