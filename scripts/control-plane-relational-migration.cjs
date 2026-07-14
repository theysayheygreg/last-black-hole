const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

function digest(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function stableJson(value) {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableJson(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value === undefined ? null : value);
}

function derivedId(prefix, ...parts) {
  return `${prefix}-${digest(parts.join("\u001f")).slice(0, 32)}`;
}

function cleanImportedValue(value) {
  if (Array.isArray(value)) return value.map(cleanImportedValue);
  if (!value || typeof value !== "object") return value;
  const cleaned = {};
  for (const [key, child] of Object.entries(value)) {
    if (/^(clientId|pilotId|playerId|profileId|authorityInstanceId|authorityLeaseId|commandCredential|serviceToken)$/i.test(key)) continue;
    cleaned[key] = cleanImportedValue(child);
  }
  return cleaned;
}

function inspectJsonSnapshot(sourcePath) {
  const absolute = path.resolve(sourcePath);
  const raw = fs.readFileSync(absolute);
  if (raw.length > 16 * 1024 * 1024) throw Object.assign(new Error("import snapshot exceeds 16 MiB"), { code: "IMPORT_TOO_LARGE" });
  let parsed;
  try {
    parsed = JSON.parse(raw.toString("utf8"));
  } catch {
    throw Object.assign(new Error("import snapshot is not valid JSON"), { code: "IMPORT_INVALID" });
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw Object.assign(new Error("import snapshot root is malformed"), { code: "IMPORT_INVALID" });
  }
  const sourceId = digest(`json-snapshot\u001f${absolute}`);
  const contentHash = digest(raw);
  const profiles = Object.entries(parsed.profiles || {}).sort(([a], [b]) => a.localeCompare(b)).map(([sourceKey, snapshot]) => ({
    sourceRecordHash: digest(`profile\u001f${sourceKey}`),
    profileId: derivedId("profile-import", sourceId, sourceKey),
    name: typeof snapshot?.name === "string" && snapshot.name.trim() ? snapshot.name.slice(0, 64) : "Imported Pilot",
    snapshot: snapshot && typeof snapshot === "object" && !Array.isArray(snapshot) ? cleanImportedValue(snapshot) : {},
  }));
  const profileBySourceId = new Map();
  for (const [sourceKey, snapshot] of Object.entries(parsed.profiles || {})) {
    profileBySourceId.set(sourceKey, derivedId("profile-import", sourceId, sourceKey));
    if (snapshot?.id) profileBySourceId.set(String(snapshot.id), derivedId("profile-import", sourceId, sourceKey));
  }
  const runs = Object.entries(parsed.runs || {}).sort(([a], [b]) => a.localeCompare(b)).map(([sourceKey, run]) => ({
    sourceRecordHash: digest(`run\u001f${sourceKey}`),
    runId: derivedId("run-import", sourceId, sourceKey),
    profileId: profileBySourceId.get(String(run?.profileId || "")) || null,
    payload: cleanImportedValue(run && typeof run === "object" ? run : {}),
  }));
  const validRuns = runs.filter((run) => run.profileId);
  const skippedRuns = runs.filter((run) => !run.profileId).map((run) => ({
    sourceRecordHash: run.sourceRecordHash,
    reason: "profile-reference-not-importable",
  }));
  const report = {
    reportVersion: 1,
    source: {
      path: absolute,
      sourceId,
      contentHash,
      schemaVersion: Number(parsed.version) || 1,
      bytes: raw.length,
    },
    counts: {
      profiles: profiles.length,
      runs: validRuns.length,
      skippedRuns: skippedRuns.length,
      sessionsObserved: Object.keys(parsed.sessions || {}).length,
    },
    profiles: profiles.map(({ sourceRecordHash, profileId, name }) => ({ sourceRecordHash, profileId, name })),
    runs: validRuns.map(({ sourceRecordHash, runId, profileId }) => ({ sourceRecordHash, runId, profileId })),
    skippedRuns,
  };
  return { absolute, raw, parsed, profiles, runs: validRuns, report };
}

function rollbackCopy(snapshot, rollbackDirectory) {
  const directory = path.resolve(rollbackDirectory || path.join(path.dirname(snapshot.absolute), ".lbh-relational-import-backups"));
  fs.mkdirSync(directory, { recursive: true, mode: 0o700 });
  const destination = path.join(directory, `${snapshot.report.source.sourceId.slice(0, 16)}-${snapshot.report.source.contentHash}.json`);
  if (!fs.existsSync(destination)) fs.writeFileSync(destination, snapshot.raw, { flag: "wx", mode: 0o600 });
  const copied = fs.readFileSync(destination);
  if (digest(copied) !== snapshot.report.source.contentHash) {
    throw Object.assign(new Error("rollback copy hash mismatch"), { code: "IMPORT_BACKUP_MISMATCH" });
  }
  return destination;
}

function importJsonSnapshot(store, { sourcePath, dryRun = false, rollbackDirectory = null } = {}) {
  const snapshot = inspectJsonSnapshot(sourcePath);
  if (dryRun) return { ...snapshot.report, dryRun: true, replayed: false };
  const rollbackPath = rollbackCopy(snapshot, rollbackDirectory);
  const existing = store.db.prepare("SELECT report_json, rollback_copy_path FROM import_journal WHERE source_id = ? AND content_hash = ?")
    .get(snapshot.report.source.sourceId, snapshot.report.source.contentHash);
  if (existing) {
    return { ...JSON.parse(existing.report_json), dryRun: false, replayed: true, rollbackCopyPath: existing.rollback_copy_path };
  }

  return store._transaction(() => {
    for (const profile of snapshot.profiles) {
      if (!store._profileRow(profile.profileId)) {
        store._insertProfile(profile.profileId, { ...profile.snapshot, id: undefined, name: profile.name }, profile.name, "json-import");
      }
    }
    store._fault("import-after-profiles");
    for (const run of snapshot.runs) {
      const sessionId = derivedId("session-import", run.runId);
      const topology = store._ensureLocalTopology({ profileId: run.profileId, session: { id: sessionId, runId: run.runId, mapId: run.payload.mapId || null }, runId: run.runId });
      const lease = store._ensureLease(run.runId, { authorityInstanceId: "local-import-authority", authorityEpoch: 1 });
      const resultId = derivedId("result-import", run.runId, topology.runMembershipId);
      const settlementId = derivedId("settlement-import", resultId);
      const payload = {
        runId: run.runId,
        profileId: run.profileId,
        resultVersion: 1,
        outcome: run.payload.outcome || "abandoned",
        runDuration: Number(run.payload.runDuration) || 0,
        session: { id: sessionId, runId: run.runId, mapId: run.payload.mapId || null },
        player: { name: "Imported Pilot", hullType: run.payload.hullType || null, cargo: [], equipped: [], consumables: [], signal: null },
        runResult: run.payload,
      };
      const payloadJson = stableJson(payload);
      if (Buffer.byteLength(payloadJson) > 131072) throw Object.assign(new Error("imported run exceeds bounded size"), { code: "IMPORT_INVALID" });
      const resultHash = digest(payloadJson);
      const timestamp = new Date().toISOString();
      store.db.prepare("INSERT INTO run_results VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?, 'SETTLED', ?)")
        .run(resultId, run.runId, topology.runMembershipId, run.profileId, lease.authority_lease_id, Number(lease.lease_epoch), resultHash, payloadJson, timestamp);
      const committed = stableJson({ profile: store.getProfile(run.profileId), result: { outcome: payload.outcome, imported: true }, settlement: { settlementId, runId: run.runId, resultHash } });
      store.db.prepare("INSERT INTO run_settlements VALUES (?, ?, ?, ?, ?, ?)")
        .run(settlementId, resultId, run.profileId, digest(`import\u001f${resultId}`), committed, timestamp);
      store.db.prepare("UPDATE run_memberships SET status='ENDED' WHERE run_membership_id=?").run(topology.runMembershipId);
      store.db.prepare("UPDATE runs SET status='ENDED', ended_at=? WHERE run_id=?").run(timestamp, run.runId);
    }
    store._fault("import-after-runs");
    const report = { ...snapshot.report, importedProfileIds: snapshot.profiles.map((entry) => entry.profileId) };
    const importId = derivedId("import", snapshot.report.source.sourceId, snapshot.report.source.contentHash);
    store.db.prepare("INSERT INTO import_journal VALUES (?, ?, ?, ?, ?, ?, ?, ?)")
      .run(importId, snapshot.report.source.sourceId, snapshot.absolute, snapshot.report.source.contentHash,
        snapshot.report.source.schemaVersion, rollbackPath, stableJson(report), new Date().toISOString());
    store._fault("import-before-commit");
    return { ...report, dryRun: false, replayed: false, rollbackCopyPath: rollbackPath };
  });
}

function exportProfile(store, profileId) {
  const profile = store.getProfile(profileId);
  if (!profile) return null;
  const rows = (sql) => store.db.prepare(sql).all(profileId).map((row) => ({ ...row }));
  return {
    exportVersion: 1,
    profile,
    revisions: rows("SELECT revision, reason, detail_json, created_at FROM profile_revisions WHERE profile_id=? ORDER BY revision"),
    inventory: rows("SELECT slot_no, item_id, item_json, created_at FROM inventory_items WHERE profile_id=? ORDER BY slot_no"),
    ledger: rows("SELECT reason, currency, amount, balance_after, created_at FROM ledger_entries WHERE profile_id=? ORDER BY created_at, ledger_entry_id"),
    results: rows("SELECT result_id, run_id, result_version, result_hash, payload_json, status, created_at FROM run_results WHERE profile_id=? ORDER BY created_at"),
    settlements: rows("SELECT settlement_id, result_id, idempotency_key, committed_json, committed_at FROM run_settlements WHERE profile_id=? ORDER BY committed_at"),
  };
}

function deleteProfileRows(store, subjectHash, reason, deletedAt) {
  const row = store.db.prepare("SELECT profile_id FROM profiles WHERE subject_hash=?").get(subjectHash);
  store.db.prepare("INSERT OR IGNORE INTO deletion_ledger VALUES (?, ?, ?, ?)")
    .run(derivedId("deletion", subjectHash), subjectHash, String(reason || "user-request").slice(0, 128), deletedAt);
  if (!row) return false;
  const profileId = row.profile_id;
  const runIds = store.db.prepare("SELECT run_id FROM run_memberships WHERE profile_id=?").all(profileId).map((entry) => entry.run_id);
  store.db.prepare("DELETE FROM ledger_entries WHERE profile_id=?").run(profileId);
  store.db.prepare("DELETE FROM inventory_items WHERE profile_id=?").run(profileId);
  store.db.prepare("DELETE FROM run_settlements WHERE profile_id=?").run(profileId);
  store.db.prepare("DELETE FROM run_results WHERE profile_id=?").run(profileId);
  store.db.prepare("DELETE FROM run_memberships WHERE profile_id=?").run(profileId);
  store.db.prepare("DELETE FROM session_memberships WHERE profile_id=?").run(profileId);
  for (const runId of runIds) {
    const count = Number(store.db.prepare("SELECT count(*) AS count FROM run_memberships WHERE run_id=?").get(runId).count);
    if (count === 0) store.db.prepare("DELETE FROM runs WHERE run_id=?").run(runId);
  }
  store.db.prepare("DELETE FROM sessions WHERE NOT EXISTS (SELECT 1 FROM session_memberships WHERE session_memberships.session_id=sessions.session_id)").run();
  store.db.prepare("DELETE FROM profiles WHERE profile_id=?").run(profileId);
  return true;
}

function deleteProfile(store, profileId, { reason = "user-request" } = {}) {
  const row = store.db.prepare("SELECT subject_hash FROM profiles WHERE profile_id=?").get(profileId);
  if (!row) return { deleted: false, deletionLedger: exportDeletionLedger(store) };
  const deletedAt = new Date().toISOString();
  const deleted = store._transaction(() => deleteProfileRows(store, row.subject_hash, reason, deletedAt));
  return { deleted, subjectHash: row.subject_hash, deletionLedger: exportDeletionLedger(store) };
}

function exportDeletionLedger(store) {
  return store.db.prepare("SELECT deletion_id, subject_hash, reason, deleted_at FROM deletion_ledger ORDER BY deleted_at, deletion_id")
    .all().map((row) => ({ deletionId: row.deletion_id, subjectHash: row.subject_hash, reason: row.reason, deletedAt: row.deleted_at }));
}

function replayDeletionLedger(store, records) {
  if (!Array.isArray(records) || records.length > 100000) throw Object.assign(new Error("deletion ledger is malformed"), { code: "INVALID_INPUT" });
  return store._transaction(() => {
    let deleted = 0;
    for (const record of records) {
      if (!/^[a-f0-9]{64}$/.test(String(record.subjectHash || ""))) throw Object.assign(new Error("deletion subject is malformed"), { code: "INVALID_INPUT" });
      if (deleteProfileRows(store, record.subjectHash, record.reason, record.deletedAt || new Date().toISOString())) deleted++;
    }
    return { replayed: records.length, deleted };
  });
}

module.exports = {
  inspectJsonSnapshot,
  importJsonSnapshot,
  exportProfile,
  deleteProfile,
  exportDeletionLedger,
  replayDeletionLedger,
};
