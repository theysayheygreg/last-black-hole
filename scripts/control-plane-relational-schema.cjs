const SCHEMA_VERSION = 2;

const MIGRATIONS = [
  {
    version: 1,
    name: "stage-b-core",
    sql: `
      CREATE TABLE schema_migrations (
        version INTEGER PRIMARY KEY,
        name TEXT NOT NULL UNIQUE,
        applied_at TEXT NOT NULL
      ) STRICT;

      CREATE TABLE profiles (
        profile_id TEXT PRIMARY KEY CHECK(length(profile_id) BETWEEN 1 AND 128),
        subject_hash TEXT NOT NULL UNIQUE CHECK(length(subject_hash) = 64),
        name TEXT NOT NULL CHECK(length(name) BETWEEN 1 AND 64),
        revision INTEGER NOT NULL DEFAULT 1 CHECK(revision >= 1),
        exotic_matter INTEGER NOT NULL DEFAULT 0 CHECK(exotic_matter >= 0),
        vault_capacity INTEGER NOT NULL DEFAULT 25 CHECK(vault_capacity BETWEEN 0 AND 250),
        hull_type TEXT NOT NULL CHECK(length(hull_type) BETWEEN 1 AND 32),
        loadout_json TEXT NOT NULL CHECK(length(loadout_json) <= 16384),
        upgrades_json TEXT NOT NULL CHECK(length(upgrades_json) <= 16384),
        rig_levels_json TEXT NOT NULL CHECK(length(rig_levels_json) <= 1024),
        total_extractions INTEGER NOT NULL DEFAULT 0 CHECK(total_extractions >= 0),
        total_deaths INTEGER NOT NULL DEFAULT 0 CHECK(total_deaths >= 0),
        total_items_sold INTEGER NOT NULL DEFAULT 0 CHECK(total_items_sold >= 0),
        best_survival_time REAL NOT NULL DEFAULT 0 CHECK(best_survival_time >= 0),
        total_exotic_matter_earned INTEGER NOT NULL DEFAULT 0 CHECK(total_exotic_matter_earned >= 0),
        created_at TEXT NOT NULL,
        last_played_at TEXT NOT NULL
      ) STRICT;

      CREATE TABLE profile_revisions (
        profile_id TEXT NOT NULL REFERENCES profiles(profile_id) ON DELETE CASCADE,
        revision INTEGER NOT NULL CHECK(revision >= 1),
        reason TEXT NOT NULL CHECK(length(reason) BETWEEN 1 AND 64),
        detail_json TEXT NOT NULL CHECK(length(detail_json) <= 32768),
        created_at TEXT NOT NULL,
        PRIMARY KEY(profile_id, revision)
      ) STRICT;

      CREATE TABLE sessions (
        session_id TEXT PRIMARY KEY CHECK(length(session_id) BETWEEN 1 AND 128),
        run_id_hint TEXT,
        map_id TEXT,
        status TEXT NOT NULL CHECK(status IN ('IDLE','LOBBY','PLACING','LIVE','ENDED','INTERRUPTED')),
        max_players INTEGER NOT NULL CHECK(max_players BETWEEN 1 AND 4),
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      ) STRICT;

      CREATE TABLE session_memberships (
        session_membership_id TEXT PRIMARY KEY CHECK(length(session_membership_id) BETWEEN 1 AND 128),
        session_id TEXT NOT NULL REFERENCES sessions(session_id) ON DELETE CASCADE,
        profile_id TEXT NOT NULL REFERENCES profiles(profile_id) ON DELETE RESTRICT,
        seat_no INTEGER NOT NULL CHECK(seat_no BETWEEN 0 AND 3),
        role TEXT NOT NULL CHECK(role IN ('LEADER','MEMBER')),
        status TEXT NOT NULL CHECK(status IN ('ACTIVE','LEFT','ENDED')),
        public_alias TEXT NOT NULL CHECK(length(public_alias) BETWEEN 1 AND 64),
        created_at TEXT NOT NULL,
        UNIQUE(session_membership_id, profile_id),
        UNIQUE(session_id, profile_id),
        UNIQUE(session_id, seat_no),
        UNIQUE(session_id, public_alias)
      ) STRICT;

      CREATE TABLE runs (
        run_id TEXT PRIMARY KEY CHECK(length(run_id) BETWEEN 1 AND 128),
        session_id TEXT NOT NULL REFERENCES sessions(session_id) ON DELETE RESTRICT,
        status TEXT NOT NULL CHECK(status IN ('PLACING','READY','LIVE','ENDED','INTERRUPTED')),
        result_version INTEGER NOT NULL DEFAULT 1 CHECK(result_version >= 1),
        created_at TEXT NOT NULL,
        ended_at TEXT
      ) STRICT;

      CREATE TABLE run_memberships (
        run_membership_id TEXT PRIMARY KEY CHECK(length(run_membership_id) BETWEEN 1 AND 128),
        run_id TEXT NOT NULL REFERENCES runs(run_id) ON DELETE CASCADE,
        session_membership_id TEXT NOT NULL,
        profile_id TEXT NOT NULL REFERENCES profiles(profile_id) ON DELETE RESTRICT,
        seat_no INTEGER NOT NULL CHECK(seat_no BETWEEN 0 AND 3),
        player_alias TEXT NOT NULL CHECK(length(player_alias) BETWEEN 1 AND 64),
        status TEXT NOT NULL CHECK(status IN ('RESERVED','ACTIVE','ENDED','ABANDONED')),
        created_at TEXT NOT NULL,
        FOREIGN KEY(session_membership_id, profile_id)
          REFERENCES session_memberships(session_membership_id, profile_id) ON DELETE RESTRICT,
        UNIQUE(run_id, session_membership_id),
        UNIQUE(run_id, profile_id),
        UNIQUE(run_id, seat_no),
        UNIQUE(run_id, player_alias)
      ) STRICT;

      CREATE TABLE authority_instances (
        authority_instance_id TEXT PRIMARY KEY CHECK(length(authority_instance_id) BETWEEN 1 AND 128),
        status TEXT NOT NULL CHECK(status IN ('READY','DRAINING','OFFLINE')),
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      ) STRICT;

      CREATE TABLE run_placements (
        placement_id TEXT PRIMARY KEY CHECK(length(placement_id) BETWEEN 1 AND 128),
        run_id TEXT NOT NULL REFERENCES runs(run_id) ON DELETE CASCADE,
        authority_instance_id TEXT NOT NULL REFERENCES authority_instances(authority_instance_id) ON DELETE RESTRICT,
        placement_attempt INTEGER NOT NULL CHECK(placement_attempt >= 1),
        status TEXT NOT NULL CHECK(status IN ('SELECTED','READY','FAILED','ENDED')),
        created_at TEXT NOT NULL,
        UNIQUE(placement_id, run_id, authority_instance_id),
        UNIQUE(run_id, placement_attempt)
      ) STRICT;

      CREATE TABLE authority_leases (
        authority_lease_id TEXT PRIMARY KEY CHECK(length(authority_lease_id) BETWEEN 1 AND 128),
        run_id TEXT NOT NULL REFERENCES runs(run_id) ON DELETE CASCADE,
        placement_id TEXT NOT NULL,
        authority_instance_id TEXT NOT NULL REFERENCES authority_instances(authority_instance_id) ON DELETE RESTRICT,
        lease_epoch INTEGER NOT NULL CHECK(lease_epoch >= 1),
        status TEXT NOT NULL CHECK(status IN ('ACTIVE','FENCING','FENCED','ENDED')),
        deadline_at TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        FOREIGN KEY(placement_id, run_id, authority_instance_id)
          REFERENCES run_placements(placement_id, run_id, authority_instance_id) ON DELETE RESTRICT,
        UNIQUE(authority_lease_id, run_id, lease_epoch),
        UNIQUE(run_id, lease_epoch)
      ) STRICT;

      CREATE TABLE run_results (
        result_id TEXT PRIMARY KEY CHECK(length(result_id) BETWEEN 1 AND 128),
        run_id TEXT NOT NULL REFERENCES runs(run_id) ON DELETE RESTRICT,
        run_membership_id TEXT NOT NULL REFERENCES run_memberships(run_membership_id) ON DELETE RESTRICT,
        profile_id TEXT NOT NULL REFERENCES profiles(profile_id) ON DELETE RESTRICT,
        authority_lease_id TEXT NOT NULL,
        lease_epoch INTEGER NOT NULL CHECK(lease_epoch >= 1),
        result_version INTEGER NOT NULL CHECK(result_version >= 1),
        result_hash TEXT NOT NULL CHECK(length(result_hash) = 64),
        payload_json TEXT NOT NULL CHECK(length(payload_json) <= 131072),
        status TEXT NOT NULL CHECK(status IN ('ACCEPTED','SETTLED')),
        created_at TEXT NOT NULL,
        FOREIGN KEY(authority_lease_id, run_id, lease_epoch)
          REFERENCES authority_leases(authority_lease_id, run_id, lease_epoch) ON DELETE RESTRICT,
        UNIQUE(run_id, run_membership_id, result_version)
      ) STRICT;

      CREATE TABLE run_settlements (
        settlement_id TEXT PRIMARY KEY CHECK(length(settlement_id) BETWEEN 1 AND 128),
        result_id TEXT NOT NULL UNIQUE REFERENCES run_results(result_id) ON DELETE RESTRICT,
        profile_id TEXT NOT NULL REFERENCES profiles(profile_id) ON DELETE RESTRICT,
        idempotency_key TEXT NOT NULL UNIQUE CHECK(length(idempotency_key) = 64),
        committed_json TEXT NOT NULL CHECK(length(committed_json) <= 131072),
        committed_at TEXT NOT NULL
      ) STRICT;

      CREATE TABLE inventory_items (
        inventory_row_id TEXT PRIMARY KEY CHECK(length(inventory_row_id) BETWEEN 1 AND 128),
        profile_id TEXT NOT NULL REFERENCES profiles(profile_id) ON DELETE CASCADE,
        settlement_id TEXT REFERENCES run_settlements(settlement_id) ON DELETE RESTRICT,
        slot_no INTEGER NOT NULL CHECK(slot_no BETWEEN 0 AND 249),
        item_id TEXT NOT NULL CHECK(length(item_id) BETWEEN 1 AND 128),
        item_json TEXT NOT NULL CHECK(length(item_json) <= 16384),
        created_at TEXT NOT NULL,
        UNIQUE(profile_id, slot_no),
        UNIQUE(profile_id, item_id)
      ) STRICT;

      CREATE TABLE ledger_entries (
        ledger_entry_id TEXT PRIMARY KEY CHECK(length(ledger_entry_id) BETWEEN 1 AND 128),
        profile_id TEXT NOT NULL REFERENCES profiles(profile_id) ON DELETE CASCADE,
        settlement_id TEXT NOT NULL REFERENCES run_settlements(settlement_id) ON DELETE RESTRICT,
        reason TEXT NOT NULL CHECK(length(reason) BETWEEN 1 AND 64),
        currency TEXT NOT NULL CHECK(currency IN ('EM')),
        amount INTEGER NOT NULL,
        balance_after INTEGER NOT NULL CHECK(balance_after >= 0),
        created_at TEXT NOT NULL,
        UNIQUE(settlement_id, reason, currency)
      ) STRICT;

      CREATE TABLE conflict_quarantine (
        conflict_id TEXT PRIMARY KEY CHECK(length(conflict_id) BETWEEN 1 AND 128),
        run_id TEXT NOT NULL,
        run_membership_id TEXT NOT NULL,
        result_version INTEGER NOT NULL CHECK(result_version >= 1),
        accepted_hash TEXT NOT NULL CHECK(length(accepted_hash) = 64),
        presented_hash TEXT NOT NULL CHECK(length(presented_hash) = 64),
        observed_at TEXT NOT NULL,
        UNIQUE(run_id, run_membership_id, result_version, presented_hash)
      ) STRICT;

      CREATE TABLE import_journal (
        import_id TEXT PRIMARY KEY CHECK(length(import_id) BETWEEN 1 AND 128),
        source_id TEXT NOT NULL CHECK(length(source_id) = 64),
        source_path TEXT NOT NULL CHECK(length(source_path) BETWEEN 1 AND 4096),
        content_hash TEXT NOT NULL CHECK(length(content_hash) = 64),
        schema_version INTEGER NOT NULL CHECK(schema_version >= 1),
        rollback_copy_path TEXT NOT NULL CHECK(length(rollback_copy_path) BETWEEN 1 AND 4096),
        report_json TEXT NOT NULL CHECK(length(report_json) <= 131072),
        imported_at TEXT NOT NULL,
        UNIQUE(source_id, content_hash)
      ) STRICT;

      CREATE TABLE deletion_ledger (
        deletion_id TEXT PRIMARY KEY CHECK(length(deletion_id) BETWEEN 1 AND 128),
        subject_hash TEXT NOT NULL CHECK(length(subject_hash) = 64),
        reason TEXT NOT NULL CHECK(length(reason) BETWEEN 1 AND 128),
        deleted_at TEXT NOT NULL,
        UNIQUE(subject_hash)
      ) STRICT;
    `,
  },
  {
    version: 2,
    name: "stage-b-invariants",
    sql: `
      CREATE UNIQUE INDEX one_active_run_membership_per_profile
        ON run_memberships(profile_id) WHERE status = 'ACTIVE';
      CREATE UNIQUE INDEX one_active_authority_lease_per_run
        ON authority_leases(run_id) WHERE status = 'ACTIVE';
      CREATE UNIQUE INDEX one_selected_placement_per_run
        ON run_placements(run_id) WHERE status IN ('SELECTED','READY');
      CREATE UNIQUE INDEX one_active_leader_per_session
        ON session_memberships(session_id) WHERE role = 'LEADER' AND status = 'ACTIVE';

      CREATE TRIGGER session_membership_cap
      BEFORE INSERT ON session_memberships
      WHEN NEW.status = 'ACTIVE' AND (
        SELECT count(*) FROM session_memberships
        WHERE session_id = NEW.session_id AND status = 'ACTIVE'
      ) >= 4
      BEGIN
        SELECT RAISE(ABORT, 'session membership cap is four');
      END;

      CREATE TRIGGER session_declared_cap
      BEFORE INSERT ON session_memberships
      WHEN NEW.status = 'ACTIVE' AND (
        SELECT count(*) FROM session_memberships
        WHERE session_id = NEW.session_id AND status = 'ACTIVE'
      ) >= (
        SELECT max_players FROM sessions WHERE session_id = NEW.session_id
      )
      BEGIN
        SELECT RAISE(ABORT, 'session declared membership cap reached');
      END;

      CREATE TRIGGER lease_epoch_monotonic
      BEFORE INSERT ON authority_leases
      WHEN NEW.lease_epoch <= COALESCE((
        SELECT max(lease_epoch) FROM authority_leases WHERE run_id = NEW.run_id
      ), 0)
      BEGIN
        SELECT RAISE(ABORT, 'lease epoch must increase monotonically');
      END;
    `,
  },
];

function applyRelationalMigrations(db, now = new Date().toISOString()) {
  db.exec("BEGIN IMMEDIATE");
  try {
    const hasMigrations = db.prepare(
      "SELECT 1 AS found FROM sqlite_master WHERE type = 'table' AND name = 'schema_migrations'"
    ).get();
    const current = hasMigrations
      ? Number(db.prepare("SELECT COALESCE(max(version), 0) AS version FROM schema_migrations").get().version)
      : 0;
    if (current > SCHEMA_VERSION) {
      throw new Error(`Relational schema ${current} is newer than supported schema ${SCHEMA_VERSION}`);
    }
    for (const migration of MIGRATIONS) {
      if (migration.version <= current) continue;
      db.exec(migration.sql);
      db.prepare("INSERT INTO schema_migrations(version, name, applied_at) VALUES (?, ?, ?)")
        .run(migration.version, migration.name, now);
    }
    db.exec(`PRAGMA user_version = ${SCHEMA_VERSION}`);
    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}

module.exports = { SCHEMA_VERSION, MIGRATIONS, applyRelationalMigrations };
