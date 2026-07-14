"use strict";

const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { HostedSettlementService } = require("../scripts/hosted-settlement-service.cjs");
const { SQLiteHostedResultOutbox } = require("../scripts/sqlite-hosted-result-outbox.cjs");
const { SQLiteHostedSettlementRepository } = require("../scripts/sqlite-hosted-settlement-repository.cjs");

let assertions = 0;
function equal(actual, expected, message) { assertions += 1; assert.deepStrictEqual(actual, expected, message); }
function check(actual, message) { assertions += 1; assert(actual, message); }
function clock(start = 1_000_000) {
  let value = start;
  return { now: () => value, advance: (amount) => { value += amount; } };
}
function authority(runId) {
  return { run_id: runId, lease_id: `lease-${runId}`, lease_epoch: 3,
    authority_incarnation: `incarnation-${runId}` };
}
function members(runId) {
  return [{ run_membership_id: `member-${runId}`, profile_id: `profile-${runId}` }];
}
function payload(runId, earned = 7) {
  return { result_version: 1, outcomes: { [`member-${runId}`]: {
    outcome: "extracted", duration_ms: 1234, em_earned: earned,
    cargo: [{ item_id: `cargo-${runId}`, value: 1 }],
  } } };
}
function makeRig(label, { retention = 1000 } = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), `lbh-retention-${label}-`));
  const filepath = path.join(dir, "hosted.sqlite");
  const time = clock();
  const outbox = new SQLiteHostedResultOutbox({ filepath, now: time.now,
    randomBytes: () => Buffer.alloc(20, 4), referenceAuthorityMode: true });
  const repository = new SQLiteHostedSettlementRepository({ filepath, now: time.now,
    referenceAuthorityMode: true, auditRetentionMs: retention });
  return { dir, filepath, time, outbox, repository };
}
function add(rig, runId) {
  rig.outbox.registerAuthority(authority(runId), { runState: "DRAINING" });
  rig.repository.setRunMemberships(runId, members(runId));
  return rig.outbox.enqueue({ authority: authority(runId), payload: payload(runId) });
}
function ack(receipts, { crashOnce = false } = {}) {
  let crash = crashOnce;
  return (receipt) => {
    receipts.push(structuredClone(receipt));
    if (crash) { crash = false; throw Object.assign(new Error("archive-callback-crash"), { crash: true }); }
    return { acknowledged: true, run_id: receipt.run_id, result_id: receipt.result_id,
      result_hash: receipt.result_hash, settlement_id: receipt.settlement_id,
      receipt_id: receipt.receipt_id, idempotency_key: receipt.idempotency_key };
  };
}
function close(rig) {
  try { rig.repository?.close(); } finally { rig.outbox?.close(); }
  fs.rmSync(rig.dir, { recursive: true, force: true });
}

function main() {
  {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "lbh-retention-legacy-audit-"));
    const filepath = path.join(dir, "hosted.sqlite");
    const outbox = new SQLiteHostedResultOutbox({ filepath, now: () => 100,
      randomBytes: () => Buffer.alloc(20, 9), referenceAuthorityMode: true });
    outbox.db.prepare(`INSERT INTO hosted_result_audit
      (result_id,idempotency_key,run_id,result_hash,settlement_id,committed_at,archived_at,retain_until,
       placement_acknowledged_at) VALUES (?,?,?,?,?,?,?,?,?)`).run("legacy-result", "legacy-key",
      "legacy-run", "sha256:legacy", "legacy-settlement", 10, 11, 1000, 12);
    outbox.close();
    assert.throws(() => new SQLiteHostedSettlementRepository({ filepath, referenceAuthorityMode: true }),
      (error) => error.code === "HOSTED_SETTLEMENT_LEGACY_AUDIT_REVIEW_REQUIRED"
        && error.resultIds.includes("legacy-result")); assertions += 1;
    fs.rmSync(dir, { recursive: true, force: true });
  }

  {
    const rig = makeRig("roundtrip");
    const accepted = add(rig, "run-one");
    const receipts = [];
    const diagnostics = [];
    const service = new HostedSettlementService({ outbox: rig.outbox, repository: rig.repository,
      workerId: "archive-worker", leaseMs: 100, acknowledgePlacementResult: ack(receipts),
      diagnostics: (event) => diagnostics.push(event) });
    const settlement = service.deliverOne();
    equal(settlement.result_id, accepted.result_id, "settlement commits before archive");
    equal(rig.outbox.get(accepted.result_id), null, "acknowledged outbox payload row is deleted");
    equal(Number(rig.outbox.db.prepare("SELECT count(*) count FROM hosted_result_journal").get().count), 0,
      "finalized result journal payload is deleted");
    equal(rig.repository.db.prepare("SELECT payload_json FROM hosted_match_results").get().payload_json, "{}",
      "settled result payload is redacted");
    check(JSON.parse(rig.repository.db.prepare("SELECT response_json FROM hosted_settlements").get().response_json).archived,
      "settlement response is reduced to an archive receipt");
    const audit = rig.repository.db.prepare("SELECT * FROM hosted_result_audit").get();
    equal(audit.placement_acknowledged_at, rig.time.now(), "placement callback acknowledgement is durable");
    check(!JSON.stringify(audit).includes("cargo-run-one"), "audit tuple contains no result payload");
    equal(receipts.length, 1, "placement receives exactly one receipt in the happy path");
    check(!JSON.stringify(diagnostics).includes("cargo-run-one"), "archive diagnostics are payload-free");
    equal(rig.outbox.enqueue({ authority: authority("run-one"), payload: payload("run-one") }).state,
      "archived", "same result replay resolves from immutable audit tuple");
    assert.throws(() => rig.outbox.enqueue({ authority: authority("run-one"), payload: payload("run-one", 99) }),
      (error) => error.code === "HOSTED_RESULT_CONFLICT"); assertions += 1;
    close(rig);
  }

  {
    const rig = makeRig("crash-reopen");
    const accepted = add(rig, "run-crash");
    const receipts = [];
    const crashing = new HostedSettlementService({ outbox: rig.outbox, repository: rig.repository,
      workerId: "crash-worker", leaseMs: 100,
      acknowledgePlacementResult: ack(receipts, { crashOnce: true }) });
    assert.throws(() => crashing.deliverOne(), /archive-callback-crash/); assertions += 1;
    equal(rig.outbox.get(accepted.result_id).state, "delivered",
      "callback crash retains delivered recovery row without demotion");
    equal(rig.repository.db.prepare("SELECT payload_json FROM hosted_match_results").get().payload_json, "{}",
      "repository payload redaction survives callback crash");
    rig.time.advance(2000);
    equal(rig.repository.cleanupRetention({ now: rig.time.now(), auditBefore: rig.time.now(), limit: 10 }).auditDeleted,
      0, "cleanup racing an unacknowledged placement receipt retains its audit tuple");
    rig.repository.close(); rig.outbox.close();
    rig.outbox = new SQLiteHostedResultOutbox({ filepath: rig.filepath, now: rig.time.now,
      randomBytes: () => Buffer.alloc(20, 5), referenceAuthorityMode: true });
    rig.repository = new SQLiteHostedSettlementRepository({ filepath: rig.filepath, now: rig.time.now,
      referenceAuthorityMode: true, auditRetentionMs: 1000 });
    const recovered = new HostedSettlementService({ outbox: rig.outbox, repository: rig.repository,
      workerId: "reopen-worker", leaseMs: 100, acknowledgePlacementResult: ack(receipts) });
    equal(recovered.archiveSettled().archived, 1, "restart replays receipt and completes archive");
    equal(rig.outbox.get(accepted.result_id), null, "restart removes recovered delivered row");
    equal(receipts.length, 2, "idempotent placement receipt is replayed after ambiguous crash");
    equal(recovered.archiveSettled().archived, 0, "completed archive is not replayed again");
    close(rig);
  }

  {
    const rig = makeRig("safety-limits", { retention: 10 });
    const pending = add(rig, "run-pending");
    const leased = add(rig, "run-leased");
    rig.outbox.claim({ owner: "lease-worker", leaseMs: 100 });
    const dead = add(rig, "run-dead");
    // Force this accepted but unsettled row to terminal delivery failure. It
    // remains durable because no settlement receipt exists.
    rig.outbox.db.prepare(`UPDATE hosted_result_outbox SET state='dead-letter',available_at=NULL,
      delivery_lease_id=NULL,delivery_lease_owner=NULL,delivery_lease_expires_at=NULL WHERE result_id=?`)
      .run(dead.result_id);
    equal(rig.outbox.archiveCandidates({ limit: 10 }).length, 0,
      "pending, leased, and unsettled dead letters are never archive candidates");
    equal(rig.outbox.get(pending.result_id).state, "leased",
      "oldest pending row was atomically leased");
    equal(rig.outbox.get(leased.result_id).state, "pending", "other pending row remains pending");
    equal(rig.outbox.get(dead.result_id).state, "dead-letter", "unsettled dead letter remains intact");

    const settledDead = add(rig, "run-dead-settled");
    rig.outbox.db.prepare(`UPDATE hosted_result_outbox SET state='leased',attempts=8,
      delivery_lease_id='delivery-dead-settled',delivery_lease_owner='dead-worker',
      delivery_lease_expires_at=? WHERE result_id=?`).run(rig.time.now() + 100, settledDead.result_id);
    rig.repository.settle(rig.outbox.get(settledDead.result_id));
    rig.outbox.db.prepare(`UPDATE hosted_result_outbox SET state='dead-letter',available_at=NULL,
      delivery_lease_id=NULL,delivery_lease_owner=NULL,delivery_lease_expires_at=NULL WHERE result_id=?`)
      .run(settledDead.result_id);
    const deadService = new HostedSettlementService({ outbox: rig.outbox, repository: rig.repository,
      acknowledgePlacementResult: ack([]) });
    equal(deadService.archiveSettled().archived, 1,
      "a dead letter with durable settlement is safely archived through the receipt protocol");
    equal(rig.outbox.get(settledDead.result_id), null,
      "settled dead-letter transport payload does not remain unbounded");

    // Create three fully acknowledged archives using independent rows, then
    // prove retention cleanup honors both cutoff and global limit.
    for (const runId of ["run-audit-1", "run-audit-2", "run-audit-3"]) {
      add(rig, runId);
      const claim = rig.outbox.db.prepare(`SELECT result_id FROM hosted_result_outbox
        WHERE run_id=?`).get(runId);
      // Claim by result order would be blocked by older pending rows, so settle
      // directly and acknowledge the exact leased tuple for this focused test.
      rig.outbox.db.prepare(`UPDATE hosted_result_outbox SET state='leased',attempts=1,
        delivery_lease_id=?,delivery_lease_owner='retention-worker',delivery_lease_expires_at=?
        WHERE result_id=?`).run(`delivery-${runId}`, rig.time.now() + 100, claim.result_id);
      const entry = rig.outbox.get(claim.result_id);
      rig.repository.settle(entry);
      rig.outbox.markDelivered({ result_id: entry.result_id, delivery_lease_id: `delivery-${runId}` });
      const receipt = rig.repository.archiveSettledResult(rig.outbox.archiveCandidates({ limit: 10 })
        .find((candidate) => candidate.run_id === runId));
      rig.outbox.archiveSettled({ receipt });
      rig.time.advance(1);
    }
    equal(Number(rig.repository.db.prepare("SELECT count(*) count FROM hosted_result_audit").get().count), 4,
      "four minimal audit tuples are retained");
    const insertConflict = rig.repository.db.prepare(`INSERT INTO hosted_settlement_conflicts
      (quarantine_id,run_id,presented_result_id,presented_hash,accepted_result_id,accepted_hash,
       quarantined_at,retain_until) VALUES (?,?,?,?,?,?,?,?)`);
    for (const index of [1, 2]) insertConflict.run(`quarantine-${index}`, `conflict-run-${index}`,
      `presented-${index}`, `sha256:presented-${index}`, `accepted-${index}`,
      `sha256:accepted-${index}`, rig.time.now(), rig.time.now() + 10);
    equal(rig.repository.cleanupRetention({ now: rig.time.now(), auditBefore: rig.time.now(), limit: 2 }).auditDeleted,
      0, "audit rows survive their declared retention");
    equal(Number(rig.repository.db.prepare("SELECT count(*) count FROM hosted_settlement_conflicts").get().count), 2,
      "conflict evidence survives its declared retention");
    rig.time.advance(20);
    const firstCleanup = rig.repository.cleanupRetention({ now: rig.time.now(), auditBefore: rig.time.now(),
      conflictBefore: rig.time.now(), limit: 2 });
    equal(firstCleanup, { auditDeleted: 2, conflictsDeleted: 0, limit: 2 },
      "cleanup applies one global limit across audit and conflict evidence");
    equal(Number(rig.repository.db.prepare("SELECT count(*) count FROM hosted_result_audit").get().count), 2,
      "retention cleanup leaves the unprocessed audit tail");
    equal(rig.repository.cleanupRetention({ now: rig.time.now(), auditBefore: rig.time.now(),
      conflictBefore: rig.time.now(), limit: 2 }), { auditDeleted: 2, conflictsDeleted: 0, limit: 2 },
    "next bounded cleanup removes only the audit tail at its limit");
    equal(rig.repository.cleanupRetention({ now: rig.time.now(), auditBefore: rig.time.now(),
      conflictBefore: rig.time.now(), limit: 2 }).conflictsDeleted, 2,
    "following bounded cleanup removes the conflict tail at its limit");
    equal(rig.outbox.get(pending.result_id).state, "leased", "cleanup never deletes a live lease");
    equal(rig.outbox.get(leased.result_id).state, "pending", "cleanup never deletes pending delivery");
    equal(rig.outbox.get(dead.result_id).state, "dead-letter", "cleanup never deletes unsettled dead letter");
    close(rig);
  }

  console.log(`sqlite hosted retention: ${assertions} assertions passed`);
}

main();
