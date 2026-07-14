const { DatabaseSync } = require("node:sqlite");

const ACTIVE_STATES = ["ALLOCATING", "READY", "ACTIVE", "DRAINING"];
const TERMINAL_STATES = ["ENDED", "FAILED"];

function clone(value) {
  return value == null ? value : structuredClone(value);
}

function positiveInteger(value, name) {
  if (!Number.isSafeInteger(value) || value < 1) throw new Error(`invalid ${name}`);
  return value;
}

function parseJson(value) {
  return JSON.parse(value);
}

function encodeRecord(record) {
  const copy = clone(record);
  delete copy.history;
  return JSON.stringify(copy);
}

class SqliteHostedPlacementRepository {
  constructor({ filename = ":memory:", db = null, tombstoneLimit = 256, busyTimeoutMs = 5_000 } = {}) {
    this.tombstoneLimit = positiveInteger(tombstoneLimit, "tombstone limit");
    positiveInteger(busyTimeoutMs, "busy timeout");
    if (db !== null && (!db || typeof db.prepare !== "function" || typeof db.exec !== "function")) {
      throw new Error("invalid database");
    }
    if (db === null && (typeof filename !== "string" || filename.length < 1)) throw new Error("invalid filename");
    this.db = db || new DatabaseSync(filename);
    this.ownsDatabase = db === null;
    this.db.exec("PRAGMA foreign_keys = ON");
    this.db.exec(`PRAGMA busy_timeout = ${busyTimeoutMs}`);
    this.db.exec("PRAGMA journal_mode = WAL");
    this.db.exec("PRAGMA synchronous = FULL");
    this.#initialize();
  }

  #initialize() {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS hosted_placement_workload_registrations (
        authority_instance_id TEXT PRIMARY KEY,
        workload_key_id TEXT NOT NULL,
        artifact_sha TEXT NOT NULL,
        protocol_version TEXT NOT NULL,
        manifest_hash TEXT NOT NULL,
        registered_at INTEGER NOT NULL CHECK (registered_at >= 0)
      ) STRICT;

      CREATE TABLE IF NOT EXISTS hosted_placement_capacities (
        authority_instance_id TEXT PRIMARY KEY
          REFERENCES hosted_placement_workload_registrations(authority_instance_id) ON DELETE CASCADE,
        region TEXT NOT NULL,
        placement_limit INTEGER NOT NULL CHECK (placement_limit >= 1),
        max_matches INTEGER NOT NULL CHECK (max_matches >= 1),
        max_seats INTEGER NOT NULL CHECK (max_seats BETWEEN 1 AND 4),
        observed_allocation INTEGER NOT NULL CHECK (observed_allocation >= 0),
        maintenance INTEGER NOT NULL CHECK (maintenance IN (0, 1)),
        draining INTEGER NOT NULL CHECK (draining IN (0, 1)),
        heartbeat_deadline_at INTEGER NOT NULL CHECK (heartbeat_deadline_at >= 0),
        updated_at INTEGER NOT NULL CHECK (updated_at >= 0),
        payload_json TEXT NOT NULL CHECK (json_valid(payload_json))
      ) STRICT;

      CREATE TABLE IF NOT EXISTS hosted_placement_run_lineages (
        run_id TEXT PRIMARY KEY,
        created_at INTEGER NOT NULL CHECK (created_at >= 0)
      ) STRICT;

      CREATE TABLE IF NOT EXISTS hosted_placement_current_allocations (
        run_id TEXT PRIMARY KEY REFERENCES hosted_placement_run_lineages(run_id) ON DELETE CASCADE,
        authority_instance_id TEXT NOT NULL
          REFERENCES hosted_placement_workload_registrations(authority_instance_id),
        request_id TEXT NOT NULL,
        state TEXT NOT NULL CHECK (state IN ('ALLOCATING','READY','ACTIVE','DRAINING','ENDED','FAILED')),
        lease_status TEXT NOT NULL CHECK (lease_status IN ('ACTIVE','FENCED','ENDED')),
        lease_epoch INTEGER NOT NULL CHECK (lease_epoch >= 1),
        seat_count INTEGER NOT NULL CHECK (seat_count BETWEEN 1 AND 4),
        admitted_count INTEGER NOT NULL CHECK (admitted_count BETWEEN 0 AND seat_count),
        terminal_at INTEGER,
        updated_at INTEGER NOT NULL CHECK (updated_at >= 0),
        row_version INTEGER NOT NULL CHECK (row_version >= 1),
        payload_json TEXT NOT NULL CHECK (json_valid(payload_json))
      ) STRICT;

      CREATE INDEX IF NOT EXISTS hosted_placement_current_by_instance
        ON hosted_placement_current_allocations(authority_instance_id, state, lease_status);

      CREATE TABLE IF NOT EXISTS hosted_placement_history (
        run_id TEXT NOT NULL REFERENCES hosted_placement_run_lineages(run_id) ON DELETE CASCADE,
        lease_epoch INTEGER NOT NULL CHECK (lease_epoch >= 1),
        placement_id TEXT NOT NULL,
        authority_instance_id TEXT NOT NULL,
        authority_lease_id TEXT NOT NULL,
        state TEXT NOT NULL,
        lease_status TEXT NOT NULL,
        recorded_at INTEGER NOT NULL CHECK (recorded_at >= 0),
        payload_json TEXT NOT NULL CHECK (json_valid(payload_json)),
        PRIMARY KEY (run_id, lease_epoch)
      ) STRICT;

      CREATE TABLE IF NOT EXISTS hosted_placement_request_bindings (
        request_id TEXT PRIMARY KEY,
        run_id TEXT NOT NULL REFERENCES hosted_placement_run_lineages(run_id) ON DELETE CASCADE,
        bound_at INTEGER NOT NULL CHECK (bound_at >= 0)
      ) STRICT;

      CREATE TABLE IF NOT EXISTS hosted_placement_consumed_tokens (
        token_id TEXT PRIMARY KEY,
        run_id TEXT NOT NULL REFERENCES hosted_placement_run_lineages(run_id) ON DELETE CASCADE,
        expires_at INTEGER NOT NULL CHECK (expires_at >= 0),
        consumed_at INTEGER NOT NULL CHECK (consumed_at >= 0)
      ) STRICT;

      CREATE INDEX IF NOT EXISTS hosted_placement_tokens_by_expiry
        ON hosted_placement_consumed_tokens(expires_at);

      CREATE TABLE IF NOT EXISTS hosted_placement_terminal_tombstones (
        run_id TEXT PRIMARY KEY REFERENCES hosted_placement_run_lineages(run_id) ON DELETE CASCADE,
        state TEXT NOT NULL CHECK (state IN ('ENDED','FAILED')),
        lease_epoch INTEGER NOT NULL CHECK (lease_epoch >= 1),
        terminal_at INTEGER NOT NULL CHECK (terminal_at >= 0)
      ) STRICT;
    `);
  }

  #transaction(callback) {
    this.db.exec("BEGIN IMMEDIATE");
    try {
      const result = callback();
      this.db.exec("COMMIT");
      return result;
    } catch (error) {
      try { this.db.exec("ROLLBACK"); } catch {}
      throw error;
    }
  }

  #history(runId) {
    return this.db.prepare(`
      SELECT payload_json FROM hosted_placement_history WHERE run_id = ? ORDER BY lease_epoch
    `).all(runId).map((row) => parseJson(row.payload_json));
  }

  #rowToRun(row) {
    if (!row) return null;
    const record = parseJson(row.payload_json);
    record.history = this.#history(record.runId);
    return record;
  }

  #getRunRow(runId) {
    return this.db.prepare(`
      SELECT payload_json, row_version FROM hosted_placement_current_allocations WHERE run_id = ?
    `).get(runId);
  }

  #writeCapacity(record) {
    this.db.prepare(`
      INSERT INTO hosted_placement_workload_registrations (
        authority_instance_id, workload_key_id, artifact_sha, protocol_version, manifest_hash, registered_at
      ) VALUES (?, ?, ?, ?, ?, ?)
      ON CONFLICT(authority_instance_id) DO UPDATE SET
        workload_key_id = excluded.workload_key_id,
        artifact_sha = excluded.artifact_sha,
        protocol_version = excluded.protocol_version,
        manifest_hash = excluded.manifest_hash,
        registered_at = excluded.registered_at
    `).run(record.authorityInstanceId, record.workloadKeyId, record.artifactSha,
      record.protocolVersion, record.manifestHash, record.updatedAt);
    this.db.prepare(`
      INSERT INTO hosted_placement_capacities (
        authority_instance_id, region, placement_limit, max_matches, max_seats, observed_allocation,
        maintenance, draining, heartbeat_deadline_at, updated_at, payload_json
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(authority_instance_id) DO UPDATE SET
        region = excluded.region,
        placement_limit = excluded.placement_limit,
        max_matches = excluded.max_matches,
        max_seats = excluded.max_seats,
        observed_allocation = excluded.observed_allocation,
        maintenance = excluded.maintenance,
        draining = excluded.draining,
        heartbeat_deadline_at = excluded.heartbeat_deadline_at,
        updated_at = excluded.updated_at,
        payload_json = excluded.payload_json
    `).run(record.authorityInstanceId, record.region, record.placementLimit, record.maxMatches,
      record.maxSeats, record.observedAllocation, record.maintenance ? 1 : 0, record.draining ? 1 : 0,
      record.heartbeatDeadlineAt, record.updatedAt, JSON.stringify(record));
  }

  registerCapacity(record) {
    return this.#transaction(() => {
      this.#writeCapacity(record);
      return clone(record);
    });
  }

  getCapacity(authorityInstanceId) {
    const row = this.db.prepare(`
      SELECT payload_json FROM hosted_placement_capacities WHERE authority_instance_id = ?
    `).get(authorityInstanceId);
    return row ? parseJson(row.payload_json) : null;
  }

  listCapacities() {
    return this.db.prepare(`
      SELECT payload_json FROM hosted_placement_capacities ORDER BY authority_instance_id
    `).all().map((row) => parseJson(row.payload_json));
  }

  updateCapacity(authorityInstanceId, mutate) {
    return this.#transaction(() => {
      const current = this.getCapacity(authorityInstanceId);
      if (!current) return null;
      const next = mutate(clone(current));
      this.#writeCapacity(next);
      return clone(next);
    });
  }

  getRun(runId) {
    return this.#rowToRun(this.#getRunRow(runId));
  }

  claimPlacement({ requestId, runId, candidates, isEligible, create }) {
    return this.#transaction(() => {
      const binding = this.db.prepare(`
        SELECT run_id FROM hosted_placement_request_bindings WHERE request_id = ?
      `).get(requestId);
      if (binding) {
        return { won: false, conflict: binding.run_id !== runId, record: this.getRun(binding.run_id) };
      }

      const existingRow = this.#getRunRow(runId);
      const existing = this.#rowToRun(existingRow);
      if (existing && ACTIVE_STATES.includes(existing.state)) return { won: false, record: existing };

      for (const candidateId of candidates) {
        const capacity = this.getCapacity(candidateId);
        if (!capacity || !isEligible(clone(capacity))) continue;
        const allocation = this.db.prepare(`
          SELECT COUNT(*) AS count FROM hosted_placement_current_allocations
          WHERE authority_instance_id = ? AND state IN ('ALLOCATING','READY','ACTIVE','DRAINING')
        `).get(candidateId);
        if (Number(allocation.count) >= capacity.placementLimit) continue;
        const maximum = this.db.prepare(`
          SELECT MAX(lease_epoch) AS epoch FROM (
            SELECT lease_epoch FROM hosted_placement_history WHERE run_id = ?
            UNION ALL
            SELECT lease_epoch FROM hosted_placement_current_allocations WHERE run_id = ?
          )
        `).get(runId, runId);
        const epoch = Number(maximum.epoch || 0) + 1;
        const record = create(clone(capacity), epoch, existing ? clone(existing) : null);
        if (record.runId !== runId || record.requestId !== requestId || record.authorityInstanceId !== candidateId) {
          throw new Error("placement callback changed identity");
        }
        if (record.seatCount < 1 || record.seatCount > 4 || record.admittedCount < 0
          || record.admittedCount > record.seatCount) throw new Error("invalid placement counts");

        this.db.prepare(`
          INSERT INTO hosted_placement_run_lineages(run_id, created_at) VALUES (?, ?)
          ON CONFLICT(run_id) DO NOTHING
        `).run(runId, record.createdAt);
        if (existing) {
          const historical = {
            placementId: existing.placementId,
            authorityInstanceId: existing.authorityInstanceId,
            authorityLeaseId: existing.authorityLeaseId,
            leaseEpoch: existing.leaseEpoch,
            state: existing.state,
            leaseStatus: existing.leaseStatus,
          };
          this.db.prepare(`
            INSERT INTO hosted_placement_history (
              run_id, lease_epoch, placement_id, authority_instance_id, authority_lease_id,
              state, lease_status, recorded_at, payload_json
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(run_id, lease_epoch) DO NOTHING
          `).run(runId, historical.leaseEpoch, historical.placementId, historical.authorityInstanceId,
            historical.authorityLeaseId, historical.state, historical.leaseStatus,
            record.updatedAt, JSON.stringify(historical));
        }
        const nextVersion = Number(existingRow?.row_version || 0) + 1;
        this.db.prepare(`
          INSERT INTO hosted_placement_current_allocations (
            run_id, authority_instance_id, request_id, state, lease_status, lease_epoch,
            seat_count, admitted_count, terminal_at, updated_at, row_version, payload_json
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT(run_id) DO UPDATE SET
            authority_instance_id = excluded.authority_instance_id,
            request_id = excluded.request_id,
            state = excluded.state,
            lease_status = excluded.lease_status,
            lease_epoch = excluded.lease_epoch,
            seat_count = excluded.seat_count,
            admitted_count = excluded.admitted_count,
            terminal_at = excluded.terminal_at,
            updated_at = excluded.updated_at,
            row_version = excluded.row_version,
            payload_json = excluded.payload_json
        `).run(runId, candidateId, requestId, record.state, record.leaseStatus, record.leaseEpoch,
          record.seatCount, record.admittedCount, record.terminalAt ?? null, record.updatedAt,
          nextVersion, encodeRecord(record));
        this.db.prepare(`
          INSERT INTO hosted_placement_request_bindings(request_id, run_id, bound_at) VALUES (?, ?, ?)
        `).run(requestId, runId, record.createdAt);
        return { won: true, conflict: false, record: this.getRun(runId) };
      }
      return { won: false, conflict: false, record: null };
    });
  }

  compareAndSetRun(runId, predicate, mutate) {
    return this.#transaction(() => {
      const row = this.#getRunRow(runId);
      const current = this.#rowToRun(row);
      if (!current || !predicate(clone(current))) return null;
      const next = mutate(clone(current));
      if (next.runId !== runId || next.seatCount < 1 || next.seatCount > 4
        || next.admittedCount < 0 || next.admittedCount > next.seatCount) throw new Error("invalid run mutation");
      const result = this.db.prepare(`
        UPDATE hosted_placement_current_allocations SET
          authority_instance_id = ?, request_id = ?, state = ?, lease_status = ?, lease_epoch = ?,
          seat_count = ?, admitted_count = ?, terminal_at = ?, updated_at = ?,
          row_version = row_version + 1, payload_json = ?
        WHERE run_id = ? AND row_version = ?
      `).run(next.authorityInstanceId, next.requestId, next.state, next.leaseStatus, next.leaseEpoch,
        next.seatCount, next.admittedCount, next.terminalAt ?? null, next.updatedAt,
        encodeRecord(next), runId, row.row_version);
      return Number(result.changes) === 1 ? this.getRun(runId) : null;
    });
  }

  isTokenConsumed(tokenId) {
    return Boolean(this.db.prepare(`
      SELECT 1 FROM hosted_placement_consumed_tokens WHERE token_id = ?
    `).get(tokenId));
  }

  consumeTokenAndUpdateRun({ tokenId, expiresAt, consumedAt, runId, predicate, mutate }) {
    return this.#transaction(() => {
      this.db.prepare(`DELETE FROM hosted_placement_consumed_tokens WHERE expires_at <= ?`).run(consumedAt);
      if (this.isTokenConsumed(tokenId)) return null;
      const row = this.#getRunRow(runId);
      const current = this.#rowToRun(row);
      if (!current || !predicate(clone(current))) return null;
      const next = mutate(clone(current));
      if (next.runId !== runId || next.seatCount < 1 || next.seatCount > 4
        || next.admittedCount < 0 || next.admittedCount > next.seatCount) throw new Error("invalid run mutation");
      this.db.prepare(`
        INSERT INTO hosted_placement_consumed_tokens(token_id, run_id, expires_at, consumed_at)
        VALUES (?, ?, ?, ?)
      `).run(tokenId, runId, expiresAt, consumedAt);
      const result = this.db.prepare(`
        UPDATE hosted_placement_current_allocations SET
          state = ?, lease_status = ?, seat_count = ?, admitted_count = ?, terminal_at = ?, updated_at = ?,
          row_version = row_version + 1, payload_json = ?
        WHERE run_id = ? AND row_version = ?
      `).run(next.state, next.leaseStatus, next.seatCount, next.admittedCount,
        next.terminalAt ?? null, next.updatedAt, encodeRecord(next), runId, row.row_version);
      if (Number(result.changes) !== 1) throw new Error("run compare-and-set lost");
      return this.getRun(runId);
    });
  }

  cleanup({ now, terminalBefore = now, keepTerminal = this.tombstoneLimit } = {}) {
    if (!Number.isSafeInteger(now) || !Number.isSafeInteger(terminalBefore)
      || !Number.isSafeInteger(keepTerminal) || keepTerminal < 0) throw new Error("invalid cleanup options");
    return this.#transaction(() => {
      this.db.prepare(`DELETE FROM hosted_placement_consumed_tokens WHERE expires_at <= ?`).run(now);
      const terminal = this.db.prepare(`
        SELECT run_id, state, lease_epoch, terminal_at FROM hosted_placement_current_allocations
        WHERE state IN ('ENDED','FAILED') AND terminal_at IS NOT NULL AND terminal_at <= ?
      `).all(terminalBefore);
      const tombstone = this.db.prepare(`
        INSERT INTO hosted_placement_terminal_tombstones(run_id, state, lease_epoch, terminal_at)
        VALUES (?, ?, ?, ?)
        ON CONFLICT(run_id) DO UPDATE SET state=excluded.state, lease_epoch=excluded.lease_epoch,
          terminal_at=excluded.terminal_at
      `);
      const remove = this.db.prepare(`DELETE FROM hosted_placement_current_allocations WHERE run_id = ?`);
      for (const row of terminal) {
        tombstone.run(row.run_id, row.state, row.lease_epoch, row.terminal_at);
        remove.run(row.run_id);
      }
      const retain = Math.min(keepTerminal, this.tombstoneLimit);
      const excess = this.db.prepare(`
        SELECT run_id FROM hosted_placement_terminal_tombstones
        ORDER BY terminal_at DESC, run_id ASC LIMIT -1 OFFSET ?
      `).all(retain);
      for (const row of excess) {
        this.db.prepare(`DELETE FROM hosted_placement_terminal_tombstones WHERE run_id = ?`).run(row.run_id);
        this.db.prepare(`DELETE FROM hosted_placement_run_lineages WHERE run_id = ?`).run(row.run_id);
      }
      return {
        activeRuns: Number(this.db.prepare(`SELECT COUNT(*) AS count FROM hosted_placement_current_allocations`).get().count),
        consumedTokens: Number(this.db.prepare(`SELECT COUNT(*) AS count FROM hosted_placement_consumed_tokens`).get().count),
        tombstones: Number(this.db.prepare(`SELECT COUNT(*) AS count FROM hosted_placement_terminal_tombstones`).get().count),
      };
    });
  }

  snapshot() {
    const capacities = this.listCapacities();
    const runs = this.db.prepare(`
      SELECT payload_json, row_version FROM hosted_placement_current_allocations ORDER BY run_id
    `).all().map((row) => this.#rowToRun(row));
    const requestIndex = this.db.prepare(`
      SELECT request_id, run_id FROM hosted_placement_request_bindings ORDER BY request_id
    `).all().map((row) => [row.request_id, row.run_id]);
    const tombstones = this.db.prepare(`
      SELECT run_id AS runId, state, lease_epoch AS leaseEpoch, terminal_at AS terminalAt
      FROM hosted_placement_terminal_tombstones ORDER BY terminal_at DESC, run_id ASC
    `).all().map((row) => ({ ...row }));
    const consumedTokenCount = Number(this.db.prepare(`
      SELECT COUNT(*) AS count FROM hosted_placement_consumed_tokens
    `).get().count);
    return clone({ capacities, runs, requestIndex, consumedTokenCount, tombstones });
  }

  close() {
    if (this.ownsDatabase && this.db) this.db.close();
    this.db = null;
  }
}

module.exports = { SqliteHostedPlacementRepository };
