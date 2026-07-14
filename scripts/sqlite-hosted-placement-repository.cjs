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
  constructor({ filename = ":memory:", db = null, tombstoneLimit = 256, busyTimeoutMs = 5_000,
    now = Date.now } = {}) {
    this.tombstoneLimit = positiveInteger(tombstoneLimit, "tombstone limit");
    positiveInteger(busyTimeoutMs, "busy timeout");
    if (db !== null && (!db || typeof db.prepare !== "function" || typeof db.exec !== "function")) {
      throw new Error("invalid database");
    }
    if (db === null && (typeof filename !== "string" || filename.length < 1)) throw new Error("invalid filename");
    if (typeof now !== "function") throw new Error("invalid clock");
    this.now = now;
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
        authority_incarnation TEXT NOT NULL,
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
        authority_incarnation TEXT NOT NULL,
        request_id TEXT NOT NULL,
        state TEXT NOT NULL CHECK (state IN ('ALLOCATING','READY','ACTIVE','DRAINING','ENDED','FAILED')),
        lease_status TEXT NOT NULL CHECK (lease_status IN ('ACTIVE','FENCED','ENDED')),
        lease_epoch INTEGER NOT NULL CHECK (lease_epoch >= 1),
        seat_count INTEGER NOT NULL CHECK (seat_count BETWEEN 1 AND 4),
        admitted_count INTEGER NOT NULL CHECK (admitted_count BETWEEN 0 AND seat_count),
        terminal_at INTEGER,
        updated_at INTEGER NOT NULL CHECK (updated_at >= 0),
        expiry_deadline_at INTEGER NOT NULL CHECK (expiry_deadline_at >= 0),
        row_version INTEGER NOT NULL CHECK (row_version >= 1),
        result_acceptance_state TEXT NOT NULL DEFAULT 'OPEN'
          CHECK (result_acceptance_state IN ('OPEN','ACCEPTED')),
        accepted_result_hash TEXT,
        accepted_at INTEGER,
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
        terminal_at INTEGER NOT NULL CHECK (terminal_at >= 0),
        authority_lease_id TEXT,
        authority_incarnation TEXT,
        accepted_result_hash TEXT,
        accepted_at INTEGER
      ) STRICT;
    `);
    this.#migrateWorkloadColumns();
    this.#migrateCurrentAllocationColumns();
    this.#migrateTombstoneColumns();
  }

  #migrateWorkloadColumns() {
    const columns = new Set(this.db.prepare(`
      SELECT name FROM pragma_table_info('hosted_placement_workload_registrations')
    `).all().map((row) => row.name));
    if (!columns.has("authority_incarnation")) {
      this.db.exec("ALTER TABLE hosted_placement_workload_registrations ADD COLUMN authority_incarnation TEXT");
    }
  }

  #migrateCurrentAllocationColumns() {
    const columns = new Set(this.db.prepare(`
      SELECT name FROM pragma_table_info('hosted_placement_current_allocations')
    `).all().map((row) => row.name));
    if (!columns.has("authority_incarnation")) {
      this.db.exec("ALTER TABLE hosted_placement_current_allocations ADD COLUMN authority_incarnation TEXT");
      // An old allocation cannot prove which process incarnation held its lease.
      // Fence it instead of equating process identity with a reusable instance ID.
      this.db.exec(`UPDATE hosted_placement_current_allocations
        SET authority_incarnation = 'legacy-unbound', state = 'FAILED', lease_status = 'FENCED'
        WHERE authority_incarnation IS NULL`);
    }
    if (!columns.has("result_acceptance_state")) {
      this.db.exec("ALTER TABLE hosted_placement_current_allocations ADD COLUMN result_acceptance_state TEXT NOT NULL DEFAULT 'OPEN'");
    }
    if (!columns.has("accepted_result_hash")) {
      this.db.exec("ALTER TABLE hosted_placement_current_allocations ADD COLUMN accepted_result_hash TEXT");
    }
    if (!columns.has("accepted_at")) {
      this.db.exec("ALTER TABLE hosted_placement_current_allocations ADD COLUMN accepted_at INTEGER");
    }
    if (!columns.has("expiry_deadline_at")) {
      this.db.exec("ALTER TABLE hosted_placement_current_allocations ADD COLUMN expiry_deadline_at INTEGER");
      this.db.exec(`UPDATE hosted_placement_current_allocations SET expiry_deadline_at =
        CASE WHEN state = 'ALLOCATING' THEN CAST(json_extract(payload_json, '$.readinessDeadlineAt') AS INTEGER)
          ELSE CAST(json_extract(payload_json, '$.leaseDeadlineAt') AS INTEGER) END
        WHERE expiry_deadline_at IS NULL`);
    }
    this.db.exec(`CREATE INDEX IF NOT EXISTS hosted_placement_expiry_candidates
      ON hosted_placement_current_allocations(result_acceptance_state, lease_status, state, expiry_deadline_at, run_id)`);
    this.db.exec("DROP TRIGGER IF EXISTS hosted_placement_result_acceptance_shape_insert");
    this.db.exec("DROP TRIGGER IF EXISTS hosted_placement_result_acceptance_shape_update");
    this.db.exec(`
      CREATE TRIGGER IF NOT EXISTS hosted_placement_result_acceptance_shape_insert
      BEFORE INSERT ON hosted_placement_current_allocations
      WHEN NOT (
        (NEW.result_acceptance_state = 'OPEN' AND NEW.accepted_result_hash IS NULL AND NEW.accepted_at IS NULL)
        OR (NEW.result_acceptance_state = 'ACCEPTED' AND NEW.accepted_result_hash IS NOT NULL
          AND NEW.accepted_at IS NOT NULL AND NEW.state = 'ENDED' AND NEW.lease_status = 'ENDED'
          AND NEW.terminal_at IS NOT NULL)
      )
      BEGIN SELECT RAISE(ABORT, 'invalid hosted placement result acceptance'); END;

      CREATE TRIGGER IF NOT EXISTS hosted_placement_result_acceptance_shape_update
      BEFORE UPDATE ON hosted_placement_current_allocations
      WHEN NOT (
        (NEW.result_acceptance_state = 'OPEN' AND NEW.accepted_result_hash IS NULL AND NEW.accepted_at IS NULL)
        OR (NEW.result_acceptance_state = 'ACCEPTED' AND NEW.accepted_result_hash IS NOT NULL
          AND NEW.accepted_at IS NOT NULL AND NEW.state = 'ENDED' AND NEW.lease_status = 'ENDED'
          AND NEW.terminal_at IS NOT NULL)
      )
      BEGIN SELECT RAISE(ABORT, 'invalid hosted placement result acceptance'); END;

      CREATE TRIGGER IF NOT EXISTS hosted_placement_result_acceptance_immutable_update
      BEFORE UPDATE ON hosted_placement_current_allocations
      WHEN OLD.result_acceptance_state = 'ACCEPTED'
      BEGIN SELECT RAISE(ABORT, 'accepted hosted placement result is immutable'); END;

    `);
  }

  #migrateTombstoneColumns() {
    const columns = new Set(this.db.prepare(`
      SELECT name FROM pragma_table_info('hosted_placement_terminal_tombstones')
    `).all().map((row) => row.name));
    for (const [name, type] of [["authority_lease_id", "TEXT"], ["authority_incarnation", "TEXT"],
      ["accepted_result_hash", "TEXT"], ["accepted_at", "INTEGER"]]) {
      if (!columns.has(name)) this.db.exec(`ALTER TABLE hosted_placement_terminal_tombstones ADD COLUMN ${name} ${type}`);
    }
    this.db.exec("DROP TRIGGER IF EXISTS hosted_placement_result_acceptance_immutable_delete");
    this.db.exec(`
      CREATE TRIGGER IF NOT EXISTS hosted_placement_preserve_accepted_result_delete
      BEFORE DELETE ON hosted_placement_current_allocations
      WHEN OLD.result_acceptance_state = 'ACCEPTED'
      BEGIN
        INSERT INTO hosted_placement_terminal_tombstones(
          run_id,state,lease_epoch,terminal_at,authority_lease_id,authority_incarnation,
          accepted_result_hash,accepted_at
        ) VALUES (OLD.run_id,'ENDED',OLD.lease_epoch,OLD.terminal_at,
          json_extract(OLD.payload_json, '$.authorityLeaseId'),OLD.authority_incarnation,
          OLD.accepted_result_hash,OLD.accepted_at)
        ON CONFLICT(run_id) DO UPDATE SET
          state='ENDED',lease_epoch=excluded.lease_epoch,terminal_at=excluded.terminal_at,
          authority_lease_id=excluded.authority_lease_id,authority_incarnation=excluded.authority_incarnation,
          accepted_result_hash=excluded.accepted_result_hash,accepted_at=excluded.accepted_at;
      END;
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
    record.state = row.state;
    record.leaseStatus = row.lease_status;
    record.terminalAt = row.terminal_at;
    record.updatedAt = row.updated_at;
    record.authorityIncarnation = row.authority_incarnation;
    record.resultAcceptanceState = row.result_acceptance_state;
    record.acceptedResultHash = row.accepted_result_hash;
    record.acceptedAt = row.accepted_at;
    record.history = this.#history(record.runId);
    return record;
  }

  #getRunRow(runId) {
    return this.db.prepare(`
      SELECT payload_json, row_version, state, lease_status, terminal_at, updated_at,
        authority_incarnation, result_acceptance_state,
        accepted_result_hash, accepted_at
      FROM hosted_placement_current_allocations WHERE run_id = ?
    `).get(runId);
  }

  #writeCapacity(record) {
    this.db.prepare(`
      INSERT INTO hosted_placement_workload_registrations (
        authority_instance_id, workload_key_id, authority_incarnation, artifact_sha,
        protocol_version, manifest_hash, registered_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(authority_instance_id) DO UPDATE SET
        workload_key_id = excluded.workload_key_id,
        authority_incarnation = excluded.authority_incarnation,
        artifact_sha = excluded.artifact_sha,
        protocol_version = excluded.protocol_version,
        manifest_hash = excluded.manifest_hash,
        registered_at = excluded.registered_at
    `).run(record.authorityInstanceId, record.workloadKeyId, record.authorityIncarnation, record.artifactSha,
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

  listExpiredCandidates(now, limit = 256) {
    if (!Number.isSafeInteger(now) || now < 0 || !Number.isSafeInteger(limit) || limit < 1 || limit > 256) {
      throw new Error("invalid expiry query");
    }
    return this.db.prepare(`
      SELECT run_id, state, lease_status, lease_epoch,
        json_extract(payload_json, '$.authorityLeaseId') AS authority_lease_id,
        expiry_deadline_at AS deadline_at
      FROM hosted_placement_current_allocations
      WHERE state IN ('ALLOCATING','READY','ACTIVE','DRAINING')
        AND lease_status = 'ACTIVE' AND result_acceptance_state = 'OPEN'
        AND expiry_deadline_at <= ?
      ORDER BY deadline_at, run_id
      LIMIT ?
    `).all(now, limit).map((row) => ({ runId: row.run_id, state: row.state,
      leaseStatus: row.lease_status, authorityLeaseId: row.authority_lease_id,
      leaseEpoch: Number(row.lease_epoch), deadlineAt: Number(row.deadline_at) }));
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
        if (typeof record.authorityIncarnation !== "string" || record.authorityIncarnation.length < 1) {
          throw new Error("placement callback omitted authority incarnation");
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
            run_id, authority_instance_id, authority_incarnation, request_id, state, lease_status, lease_epoch,
            seat_count, admitted_count, terminal_at, updated_at, expiry_deadline_at, row_version, payload_json
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT(run_id) DO UPDATE SET
            authority_instance_id = excluded.authority_instance_id,
            authority_incarnation = excluded.authority_incarnation,
            request_id = excluded.request_id,
            state = excluded.state,
            lease_status = excluded.lease_status,
            lease_epoch = excluded.lease_epoch,
            seat_count = excluded.seat_count,
            admitted_count = excluded.admitted_count,
            terminal_at = excluded.terminal_at,
            updated_at = excluded.updated_at,
            expiry_deadline_at = excluded.expiry_deadline_at,
            row_version = excluded.row_version,
            payload_json = excluded.payload_json
        `).run(runId, candidateId, record.authorityIncarnation, requestId,
          record.state, record.leaseStatus, record.leaseEpoch,
          record.seatCount, record.admittedCount, record.terminalAt ?? null, record.updatedAt,
          record.state === "ALLOCATING" ? record.readinessDeadlineAt : record.leaseDeadlineAt,
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
      if (!current || current.resultAcceptanceState === "ACCEPTED" || !predicate(clone(current))) return null;
      const next = mutate(clone(current));
      if (next.runId !== runId || next.seatCount < 1 || next.seatCount > 4
        || next.admittedCount < 0 || next.admittedCount > next.seatCount) throw new Error("invalid run mutation");
      const result = this.db.prepare(`
        UPDATE hosted_placement_current_allocations SET
          authority_instance_id = ?, request_id = ?, state = ?, lease_status = ?, lease_epoch = ?,
          seat_count = ?, admitted_count = ?, terminal_at = ?, updated_at = ?,
          expiry_deadline_at = ?, row_version = row_version + 1, payload_json = ?
        WHERE run_id = ? AND row_version = ?
      `).run(next.authorityInstanceId, next.requestId, next.state, next.leaseStatus, next.leaseEpoch,
        next.seatCount, next.admittedCount, next.terminalAt ?? null, next.updatedAt,
        next.state === "ALLOCATING" ? next.readinessDeadlineAt : next.leaseDeadlineAt,
        encodeRecord(next), runId, row.row_version);
      return Number(result.changes) === 1 ? this.getRun(runId) : null;
    });
  }

  isTokenConsumed(tokenId) {
    return Boolean(this.db.prepare(`
      SELECT 1 FROM hosted_placement_consumed_tokens WHERE token_id = ?
    `).get(tokenId));
  }

  acceptAuthorityResult(identity, resultHash) {
    const keys = identity && typeof identity === "object" && !Array.isArray(identity)
      ? Object.keys(identity) : [];
    const expected = ["run_id", "lease_id", "lease_epoch", "authority_incarnation"];
    if (keys.length !== expected.length || keys.some((key) => !expected.includes(key))
      || typeof identity.run_id !== "string" || identity.run_id.length < 1
      || typeof identity.lease_id !== "string" || identity.lease_id.length < 1
      || !Number.isSafeInteger(identity.lease_epoch) || identity.lease_epoch < 1
      || typeof identity.authority_incarnation !== "string" || identity.authority_incarnation.length < 1
      || typeof resultHash !== "string" || resultHash.length < 1 || resultHash.length > 256
      || resultHash.trim() !== resultHash) throw new Error("invalid authority result identity");
    return this.#transaction(() => {
      const row = this.#getRunRow(identity.run_id);
      const current = this.#rowToRun(row);
      if (!current) {
        const tombstone = this.db.prepare(`SELECT * FROM hosted_placement_terminal_tombstones
          WHERE run_id = ?`).get(identity.run_id);
        const exactTombstone = tombstone && tombstone.authority_lease_id === identity.lease_id
          && Number(tombstone.lease_epoch) === identity.lease_epoch
          && tombstone.authority_incarnation === identity.authority_incarnation
          && tombstone.accepted_result_hash !== null;
        if (!exactTombstone) return null;
        if (tombstone.accepted_result_hash !== resultHash) {
          const error = new Error("authority result conflicts with accepted hash");
          error.code = "HOSTED_RESULT_CONFLICT";
          throw error;
        }
        return Object.freeze({ accepted: true, run_id: identity.run_id, lease_id: identity.lease_id,
          lease_epoch: identity.lease_epoch, authority_incarnation: identity.authority_incarnation,
          result_hash: resultHash, accepted_at: Number(tombstone.accepted_at) });
      }
      const exactLineage = current
        && current.authorityLeaseId === identity.lease_id
        && current.leaseEpoch === identity.lease_epoch
        && current.authorityIncarnation === identity.authority_incarnation;
      if (!exactLineage) return null;
      if (current.resultAcceptanceState === "ACCEPTED") {
        if (current.acceptedResultHash !== resultHash) {
          const error = new Error("authority result conflicts with accepted hash");
          error.code = "HOSTED_RESULT_CONFLICT";
          throw error;
        }
        return Object.freeze({ accepted: true, run_id: identity.run_id, lease_id: identity.lease_id,
          lease_epoch: identity.lease_epoch, authority_incarnation: identity.authority_incarnation,
          result_hash: resultHash, accepted_at: current.acceptedAt });
      }
      if (current.state !== "DRAINING" || current.leaseStatus !== "ACTIVE") return null;
      const acceptedAt = this.now();
      if (!Number.isSafeInteger(acceptedAt) || acceptedAt < 0) throw new Error("invalid clock");
      const result = this.db.prepare(`
        UPDATE hosted_placement_current_allocations SET
          result_acceptance_state = 'ACCEPTED', accepted_result_hash = ?, accepted_at = ?,
          state = 'ENDED', lease_status = 'ENDED', terminal_at = ?, updated_at = ?,
          expiry_deadline_at = ?, row_version = row_version + 1
        WHERE run_id = ? AND row_version = ? AND state = 'DRAINING' AND lease_status = 'ACTIVE'
          AND result_acceptance_state = 'OPEN' AND accepted_result_hash IS NULL
          AND authority_incarnation = ?
      `).run(resultHash, acceptedAt, acceptedAt, acceptedAt, acceptedAt,
        identity.run_id, row.row_version, identity.authority_incarnation);
      if (Number(result.changes) !== 1) return null;
      return Object.freeze({ accepted: true, run_id: identity.run_id, lease_id: identity.lease_id,
        lease_epoch: identity.lease_epoch, authority_incarnation: identity.authority_incarnation,
        result_hash: resultHash, accepted_at: acceptedAt });
    });
  }

  consumeTokenAndUpdateRun({ tokenId, expiresAt, consumedAt, runId, predicate, mutate }) {
    return this.#transaction(() => {
      this.db.prepare(`DELETE FROM hosted_placement_consumed_tokens WHERE expires_at <= ?`).run(consumedAt);
      if (this.isTokenConsumed(tokenId)) return null;
      const row = this.#getRunRow(runId);
      const current = this.#rowToRun(row);
      if (!current || current.resultAcceptanceState === "ACCEPTED" || !predicate(clone(current))) return null;
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
          expiry_deadline_at = ?, row_version = row_version + 1, payload_json = ?
        WHERE run_id = ? AND row_version = ?
      `).run(next.state, next.leaseStatus, next.seatCount, next.admittedCount,
        next.terminalAt ?? null, next.updatedAt,
        next.state === "ALLOCATING" ? next.readinessDeadlineAt : next.leaseDeadlineAt,
        encodeRecord(next), runId, row.row_version);
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
      SELECT payload_json, row_version, state, lease_status, terminal_at, updated_at,
        authority_incarnation, result_acceptance_state,
        accepted_result_hash, accepted_at
      FROM hosted_placement_current_allocations ORDER BY run_id
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
