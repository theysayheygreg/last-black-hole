const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const crypto = require("crypto");
const { RelationalControlPlaneStore, SCHEMA_VERSION } = require("../scripts/control-plane-relational-store.cjs");

const ROOT = path.resolve(__dirname, "..");
const FIXTURE = path.join(__dirname, "fixtures/control-plane-relational-store/current-json-v2.json");
let assertions = 0;

function check(value, message) {
  assertions++;
  assert(value, message);
}

function equal(actual, expected, message) {
  assertions++;
  assert.deepStrictEqual(actual, expected, message);
}

function rejects(fn, code, message) {
  assertions++;
  assert.throws(fn, (error) => [error?.code, error?.message, error?.errstr]
    .some((value) => String(value || "").toLowerCase().includes(String(code).toLowerCase())), message);
}

function tempStore(label, options = {}) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), `lbh-rel-${label}-`));
  const filepath = path.join(directory, "control-plane.sqlite");
  return { directory, filepath, store: new RelationalControlPlaneStore(filepath, options) };
}

function payload(overrides = {}) {
  const runId = overrides.runId || `run-${crypto.randomUUID()}`;
  const profileId = overrides.profileId || `profile-${crypto.randomUUID()}`;
  const itemId = overrides.itemId || `item-${crypto.randomUUID()}`;
  return {
    profileId,
    outcome: "extracted",
    runDuration: 120,
    session: { id: `session-${runId}`, runId, mapId: "shallows" },
    player: {
      clientId: "raw-client-id-must-not-persist",
      profileId,
      name: "Relational Pilot",
      cargo: [{ id: itemId, name: "Relational Relic", value: 20 }],
      equipped: [],
      consumables: [],
    },
    runResult: {
      runId,
      profileId,
      resultVersion: 1,
      outcome: "extracted",
      survivalTime: 120,
      emEarned: 60,
      cargoExtracted: [{ id: itemId, name: "Relational Relic", value: 20 }],
      cargoLost: [],
    },
    settlement: { authorityInstanceId: "authority-local-test", authorityEpoch: 1 },
  };
}

function topology(store, profileId, runId) {
  return store._transaction(() => {
    store._ensureProfile(profileId, {}, "Topology Pilot");
    return store._ensureLocalTopology({ profileId, session: { id: `session-${runId}`, runId }, runId });
  });
}

async function main() {
  {
    const { store, filepath } = tempStore("schema");
    const integrity = store.integrityCheck();
    equal(integrity.schemaVersion, SCHEMA_VERSION, "schema version should be migrated");
    equal(integrity.integrity, "ok", "SQLite integrity should pass");
    equal(integrity.foreignKeys, [], "foreign keys should pass");
    equal(integrity.journalMode, "wal", "local repository should use WAL");
    equal(integrity.synchronous, 2, "local repository should use FULL synchronous mode");
    const schema = store.db.prepare("SELECT sql FROM sqlite_master WHERE sql IS NOT NULL ORDER BY name").all().map((row) => row.sql).join("\n");
    check(!/hardware|fingerprint|service_token|command_credential|refresh_token/i.test(schema), "schema must not grow secret or fingerprint columns");
    store.close();
    const reopened = new RelationalControlPlaneStore(filepath);
    equal(reopened.schemaVersion, SCHEMA_VERSION, "migration should be idempotent on reopen");
    reopened.close();
  }

  {
    const { store, filepath } = tempStore("profile");
    const created = store.bootstrapProfile({ profileId: "profile-a", snapshot: { name: "Pilot A", exoticMatter: 99 } });
    equal(created.exoticMatter, 99, "profile creation should preserve local durable balance");
    const clientAttempt = store.bootstrapProfile({ profileId: "profile-a", snapshot: { name: "Renamed", exoticMatter: 9999 } });
    equal(clientAttempt.name, "Renamed", "bootstrap may change display name");
    equal(clientAttempt.exoticMatter, 99, "bootstrap must not overwrite stored economics");
    clientAttempt.hullType = "hauler";
    clientAttempt.exoticMatter = 105;
    const saved = store.saveProfile(clientAttempt);
    equal(saved.exoticMatter, 105, "explicit local save should update normalized balance");
    check(saved.revision >= 3, "profile revisions should be monotonic");
    store.close();
    const reopened = new RelationalControlPlaneStore(filepath);
    equal(reopened.getProfile("profile-a").hullType, "hauler", "profile should survive reopen");
    reopened.close();
  }

  {
    const { store } = tempStore("caps");
    const players = Array.from({ length: 4 }, (_, index) => ({ profileId: `profile-cap-${index}`, name: `Pilot ${index}` }));
    const mirrored = store.upsertSession({ id: "session-cap", maxPlayers: 4, status: "lobby" }, players);
    equal(mirrored.playerCount, 4, "four memberships should admit");
    rejects(() => store.upsertSession({ id: "session-cap-5", maxPlayers: 4 }, [...players, { profileId: "profile-cap-4", name: "Fifth" }]), "SESSION_CAP", "fifth membership should reject");
    store.bootstrapProfile({ profileId: "profile-fk", snapshot: { name: "FK" } });
    store.bootstrapProfile({ profileId: "profile-cap-direct-5", snapshot: { name: "Direct Fifth" } });
    rejects(() => store.db.prepare("INSERT INTO session_memberships VALUES ('direct-fifth','session-cap','profile-cap-direct-5',0,'MEMBER','ACTIVE','Fifth','now')").run(), "membership cap reached", "database trigger should reject a fifth active membership");
    rejects(() => store.db.prepare("INSERT INTO session_memberships VALUES ('bad-fk','missing','profile-fk',0,'MEMBER','ACTIVE','Alias','now')").run(), "FOREIGN", "foreign key violation should reject");
    topology(store, "profile-active", "run-active-1");
    rejects(() => topology(store, "profile-active", "run-active-2"), "CONSTRAINT", "same profile must not own two active run bodies");
    store.close();
  }

  {
    const { store } = tempStore("lease");
    topology(store, "profile-lease", "run-lease");
    store.createAuthorityInstance({ authorityInstanceId: "authority-a" });
    const first = store.claimAuthorityLease({ runId: "run-lease", authorityInstanceId: "authority-a", expectedEpoch: 0 });
    equal(first.leaseEpoch, 1, "first lease epoch should be one");
    rejects(() => store.claimAuthorityLease({ runId: "run-lease", authorityInstanceId: "authority-b", expectedEpoch: 0 }), "STALE_LEASE", "stale placement CAS should reject");
    rejects(() => store.claimAuthorityLease({ runId: "run-lease", authorityInstanceId: "authority-b", expectedEpoch: 1 }), "STALE_LEASE", "replacement CAS must bind the current lease id");
    const second = store.claimAuthorityLease({ runId: "run-lease", authorityInstanceId: "authority-b", expectedEpoch: 1, expectedLeaseId: first.authorityLeaseId });
    equal(second.leaseEpoch, 2, "lease epoch should increase monotonically");
    equal(Number(store.db.prepare("SELECT count(*) count FROM authority_leases WHERE run_id='run-lease' AND status='ACTIVE'").get().count), 1, "one active lease per run");
    rejects(() => store.renewAuthorityLease({ runId: "run-lease", authorityLeaseId: first.authorityLeaseId, leaseEpoch: 1, deadlineAt: "2099-01-01T00:00:00Z" }), "STALE_LEASE", "stale lease renewal should reject");
    store.fenceAuthorityLease({ runId: "run-lease", authorityLeaseId: second.authorityLeaseId, leaseEpoch: 2 });
    rejects(() => store.fenceAuthorityLease({ runId: "run-lease", authorityLeaseId: second.authorityLeaseId, leaseEpoch: 2 }), "STALE_LEASE", "double fence should reject");
    topology(store, "profile-stale-result", "run-stale-result");
    const staleFirst = store.claimAuthorityLease({ runId: "run-stale-result", authorityInstanceId: "authority-old", expectedEpoch: 0 });
    store.claimAuthorityLease({ runId: "run-stale-result", authorityInstanceId: "authority-new", expectedEpoch: 1, expectedLeaseId: staleFirst.authorityLeaseId });
    const stalePayload = payload({ profileId: "profile-stale-result", runId: "run-stale-result" });
    stalePayload.settlement = { authorityInstanceId: "authority-old", authorityLeaseId: staleFirst.authorityLeaseId, authorityEpoch: 1 };
    rejects(() => store.applyOutcome(stalePayload), "STALE_LEASE", "fenced authority result should reject");
    store.close();
  }

  {
    const { store, filepath } = tempStore("settlement");
    const resultPayload = payload({ profileId: "profile-settle", runId: "run-settle", itemId: "item-settle" });
    let first;
    for (let index = 0; index < 100; index++) {
      const committed = store.applyOutcome(resultPayload);
      if (index === 0) first = committed;
      else equal(committed.replayed, true, `replay ${index} should return original settlement`);
    }
    equal(first.replayed, false, "first delivery should commit");
    const counts = store.inspectCounts();
    equal(counts.run_results, 1, "100 deliveries should create one result");
    equal(counts.run_settlements, 1, "100 deliveries should create one settlement");
    equal(counts.ledger_entries, 1, "100 deliveries should create one ledger posting");
    equal(counts.inventory_items, 1, "100 deliveries should create one inventory item");
    equal(store.getProfile("profile-settle").exoticMatter, 60, "100 deliveries should credit once");
    const conflicting = clonePayload(resultPayload);
    conflicting.runResult.emEarned = 61;
    rejects(() => store.applyOutcome(conflicting), "SETTLEMENT_CONFLICT", "different result hash should quarantine");
    equal(store.inspectCounts().conflict_quarantine, 1, "conflict should be durable quarantine");
    equal(store.getProfile("profile-settle").exoticMatter, 60, "conflict must not credit");
    rejects(() => store.applyOutcome({ ...payload({ profileId: "profile-stale", runId: "run-stale" }), settlement: { authorityInstanceId: "authority-local-test", authorityEpoch: 2 } }), "STALE_LEASE", "first result cannot invent epoch two");
    const bytes = fs.readFileSync(filepath);
    check(!bytes.includes(Buffer.from("raw-client-id-must-not-persist")), "raw client id must not persist in main database");
    store.close();
  }

  {
    const faultSteps = ["after-topology", "after-result", "after-profile", "after-settlement", "after-ledger", "after-inventory", "before-commit"];
    for (const step of faultSteps) {
      const { store, filepath } = tempStore(`fault-${step}`, {
        faultInjector(current) {
          if (current === step) throw Object.assign(new Error(`fault:${step}`), { code: "FAULT_INJECTED" });
        },
      });
      store.bootstrapProfile({ profileId: `profile-${step}`, snapshot: { name: "Fault Pilot" } });
      rejects(() => store.applyOutcome(payload({ profileId: `profile-${step}`, runId: `run-${step}`, itemId: `item-${step}` })), "FAULT_INJECTED", `${step} should abort transaction`);
      store.close();
      const reopened = new RelationalControlPlaneStore(filepath);
      const counts = reopened.inspectCounts();
      equal(reopened.getProfile(`profile-${step}`).exoticMatter, 0, `${step} must preserve pre-state balance`);
      equal(counts.run_results, 0, `${step} must leave no partial result`);
      equal(counts.run_settlements, 0, `${step} must leave no partial settlement`);
      equal(counts.ledger_entries, 0, `${step} must leave no partial ledger`);
      equal(counts.inventory_items, 0, `${step} must leave no partial inventory`);
      equal(counts.profile_revisions, 1, `${step} must leave no partial revision`);
      reopened.close();
    }
  }

  {
    const { store } = tempStore("limits");
    rejects(() => store.bootstrapProfile({ profileId: "x".repeat(129), snapshot: { name: "Too Long" } }), "INVALID_INPUT", "oversized identifier should reject");
    rejects(() => store.bootstrapProfile({ profileId: "profile-name", snapshot: { name: "x".repeat(65) } }), "INVALID_INPUT", "oversized display value should reject");
    const huge = payload({ profileId: "profile-huge", runId: "run-huge" });
    huge.runResult.unbounded = "x".repeat(140000);
    rejects(() => store.applyOutcome(huge), "INVALID_INPUT", "oversized result should reject");
    store.close();
  }

  {
    const { directory, store } = tempStore("import");
    const dryA = store.importJsonSnapshot({ sourcePath: FIXTURE, dryRun: true });
    const dryB = store.importJsonSnapshot({ sourcePath: FIXTURE, dryRun: true });
    equal(dryA, dryB, "dry-run report should be deterministic");
    equal(dryA.counts.profiles, 1, "dry-run should find one profile");
    equal(dryA.counts.runs, 1, "dry-run should find one importable run");
    equal(dryA.counts.skippedRuns, 1, "dry-run should report orphan run");
    check(dryA.profiles[0].profileId !== "caller-owned-profile-id", "import must derive durable profile id");
    const imported = store.importJsonSnapshot({ sourcePath: FIXTURE, rollbackDirectory: path.join(directory, "rollback") });
    equal(imported.replayed, false, "first import should commit");
    check(fs.existsSync(imported.rollbackCopyPath), "import should retain rollback copy");
    equal(crypto.createHash("sha256").update(fs.readFileSync(imported.rollbackCopyPath)).digest("hex"), dryA.source.contentHash, "rollback copy should match source hash");
    const replay = store.importJsonSnapshot({ sourcePath: FIXTURE, rollbackDirectory: path.join(directory, "rollback") });
    equal(replay.replayed, true, "re-import should be idempotent");
    equal(store.inspectCounts().import_journal, 1, "re-import should keep one journal row");
    const importedProfileId = imported.importedProfileIds[0];
    equal(store.getProfile(importedProfileId).exoticMatter, 17, "import should preserve local balance without cloud trust claim");
    const databaseText = fs.readFileSync(store.filepath);
    check(!databaseText.includes(Buffer.from("must-not-survive")), "import must strip raw client and pilot ids");

    store.bootstrapProfile({ profileId: "other-profile", snapshot: { name: "Other Secret Pilot" } });
    const exported = store.exportProfile(importedProfileId);
    check(exported.profile.id === importedProfileId, "export should contain requested profile");
    check(!JSON.stringify(exported).includes("Other Secret Pilot"), "export must not contain another profile's data");

    const backupPath = path.join(directory, "pre-delete.sqlite");
    await store.backupTo(backupPath);
    const deletion = store.deleteProfile(importedProfileId, { reason: "test-request" });
    equal(deletion.deleted, true, "profile deletion should delete subject data");
    equal(store.getProfile(importedProfileId), null, "deleted profile should be inaccessible");
    check(deletion.deletionLedger.length === 1, "deletion should leave subject-hash ledger");
    equal(store.integrityCheck().foreignKeys, [], "deletion should preserve foreign keys");
    store.close();

    const restored = new RelationalControlPlaneStore(backupPath);
    check(restored.getProfile(importedProfileId), "pre-delete backup should initially contain profile");
    const replayed = restored.replayDeletionLedger(deletion.deletionLedger);
    equal(replayed.deleted, 1, "deletion ledger should remove restored data");
    equal(restored.getProfile(importedProfileId), null, "deletion must remain effective after restore");
    equal(restored.integrityCheck().integrity, "ok", "restored-and-redacted database should remain sound");
    restored.close();
  }

  {
    const { store } = tempStore("import-fault", {
      faultInjector(step) {
        if (step === "import-after-profiles") throw Object.assign(new Error("import fault"), { code: "FAULT_INJECTED" });
      },
    });
    rejects(() => store.importJsonSnapshot({ sourcePath: FIXTURE, rollbackDirectory: path.join(os.tmpdir(), `lbh-import-rollback-${crypto.randomUUID()}`) }), "FAULT_INJECTED", "import failure should abort transaction");
    equal(store.inspectCounts().profiles, 0, "failed import should leave no profiles");
    equal(store.inspectCounts().import_journal, 0, "failed import should leave no import journal");
    store.close();
  }

  console.log(`control-plane relational store: ${assertions} assertions passed`);
}

function clonePayload(value) {
  return JSON.parse(JSON.stringify(value));
}

main().catch((error) => {
  console.error(error.stack || error);
  process.exit(1);
});
