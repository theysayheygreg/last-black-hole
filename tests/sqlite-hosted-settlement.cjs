"use strict";

const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { DatabaseSync } = require("node:sqlite");
const { canonicalResult, HostedResultError, OUTBOX_STATES } = require("../scripts/hosted-result-outbox.cjs");
const { HostedSettlementService } = require("../scripts/hosted-settlement-service.cjs");
const { SQLiteHostedResultOutbox } = require("../scripts/sqlite-hosted-result-outbox.cjs");
const { SQLiteHostedSettlementRepository } = require("../scripts/sqlite-hosted-settlement-repository.cjs");

let assertions = 0;
function equal(actual, expected, message) { assertions += 1; assert.deepStrictEqual(actual, expected, message); }
function check(value, message) { assertions += 1; assert(value, message); }
function rejects(fn, code, message) {
  assertions += 1;
  assert.throws(fn, (error) => error instanceof HostedResultError && error.code === code
    && error.message === "hosted result rejected", message);
}
function tmp(label) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), `lbh-sqlite-hosted-${label}-`));
  return { dir, filepath: path.join(dir, "hosted.sqlite") };
}
function clock(start = 1_000_000) {
  let value = start;
  return { now: () => value, advance: (ms) => { value += ms; } };
}
function authority(overrides = {}) {
  return { run_id: "run-a", lease_id: "lease-a", lease_epoch: 7,
    authority_incarnation: "authority-a-incarnation-2", ...overrides };
}
function members(count = 4) {
  return Array.from({ length: count }, (_, index) => ({
    run_membership_id: `membership-${index + 1}`, profile_id: `server-profile-${index + 1}`,
  }));
}
function result(count = 4) {
  return { result_version: 1, outcomes: Object.fromEntries(Array.from({ length: count }, (_, index) => [
    `membership-${index + 1}`,
    { outcome: index % 2 ? "dead" : "extracted", duration_ms: 100_000 + index,
      em_earned: (index + 1) * 10, cargo: [{ item_id: `relic-${index + 1}`, value: index + 1 }] },
  ])) };
}
function setup(label, { time = clock(), outboxFault = () => {}, repoFault = () => {} } = {}) {
  const file = tmp(label);
  const outbox = new SQLiteHostedResultOutbox({ filepath: file.filepath, now: time.now,
    randomBytes: () => Buffer.alloc(20, 7), maxAttempts: 4, baseBackoffMs: 10,
    fault: outboxFault, referenceAuthorityMode: true });
  outbox.registerAuthority(authority(), { runState: "DRAINING", active: true });
  const repository = new SQLiteHostedSettlementRepository({ filepath: file.filepath, now: time.now,
    fault: repoFault, referenceAuthorityMode: true });
  repository.setRunMemberships("run-a", members());
  return { ...file, time, outbox, repository };
}
function close(rig) {
  try { rig.repository?.close(); } finally { rig.outbox?.close(); }
  fs.rmSync(rig.dir, { recursive: true, force: true });
}

class SQLitePlacementAcceptanceAdapter {
  constructor(filepath) {
    this.db = new DatabaseSync(filepath);
    this.db.exec("PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL; PRAGMA busy_timeout=5000;");
    this.db.exec(`CREATE TABLE placement_terminal_acceptance (
      run_id TEXT PRIMARY KEY, lease_id TEXT NOT NULL, lease_epoch INTEGER NOT NULL,
      authority_incarnation TEXT NOT NULL, run_state TEXT NOT NULL, accepted_result_id TEXT,
      accepted_result_hash TEXT, accepted_at INTEGER)`);
  }
  register(identity) {
    this.db.prepare(`INSERT INTO placement_terminal_acceptance
      (run_id,lease_id,lease_epoch,authority_incarnation,run_state) VALUES (?,?,?,?,'DRAINING')`)
      .run(identity.run_id, identity.lease_id, identity.lease_epoch, identity.authority_incarnation);
  }
  accept(identity, resultHash, resultId, acceptedAt) {
    this.db.exec("BEGIN IMMEDIATE");
    try {
      const changed = this.db.prepare(`UPDATE placement_terminal_acceptance
        SET accepted_result_id=?,accepted_result_hash=?,accepted_at=?
        WHERE run_id=? AND lease_id=? AND lease_epoch=? AND authority_incarnation=?
          AND run_state IN ('DRAINING','ENDED') AND accepted_result_hash IS NULL RETURNING *`)
        .get(resultId, resultHash, acceptedAt, identity.run_id, identity.lease_id,
          identity.lease_epoch, identity.authority_incarnation);
      const row = changed || this.db.prepare(`SELECT * FROM placement_terminal_acceptance
        WHERE run_id=? AND lease_id=? AND lease_epoch=? AND authority_incarnation=?
          AND accepted_result_id=? AND accepted_result_hash=?`).get(identity.run_id, identity.lease_id,
        identity.lease_epoch, identity.authority_incarnation, resultId, resultHash);
      this.db.exec("COMMIT");
      return this.public(row);
    } catch (error) {
      if (this.db.isTransaction) this.db.exec("ROLLBACK");
      throw error;
    }
  }
  verify(entry) {
    return this.public(this.db.prepare("SELECT * FROM placement_terminal_acceptance WHERE run_id=?")
      .get(entry.run_id));
  }
  replace(identity) {
    return Number(this.db.prepare(`UPDATE placement_terminal_acceptance SET lease_id=?,lease_epoch=?,
      authority_incarnation=?,run_state='ACTIVE' WHERE run_id=? AND accepted_result_hash IS NULL`)
      .run(identity.lease_id, identity.lease_epoch, identity.authority_incarnation, identity.run_id).changes) === 1;
  }
  public(row) {
    return row?.accepted_result_hash ? { accepted: true, run_id: row.run_id, lease_id: row.lease_id,
      lease_epoch: row.lease_epoch, authority_incarnation: row.authority_incarnation,
      result_id: row.accepted_result_id, result_hash: row.accepted_result_hash } : null;
  }
  close() { this.db.close(); }
}

function main() {
  {
    const file = tmp("required-adapters");
    assert.throws(() => new SQLiteHostedResultOutbox({ filepath: file.filepath }),
      /acceptAuthorityResult is required/); assertions += 1;
    assert.throws(() => new SQLiteHostedSettlementRepository({ filepath: file.filepath }),
      /verifyAcceptedAuthorityResult is required/); assertions += 1;
    fs.rmSync(file.dir, { recursive: true, force: true });
  }

  {
    const outboxFile = tmp("placement-bridge-outbox");
    const placementFile = tmp("placement-bridge-source");
    const time = clock();
    const placement = new SQLitePlacementAcceptanceAdapter(placementFile.filepath);
    placement.register(authority());
    let crash = true;
    const outbox = new SQLiteHostedResultOutbox({ filepath: outboxFile.filepath, now: time.now,
      acceptAuthorityResult: (...args) => placement.accept(...args),
      fault(step) {
        if (step === "after-placement-accept-before-outbox" && crash) {
          crash = false; throw new Error("bridge-gap-crash");
        }
      } });
    const repository = new SQLiteHostedSettlementRepository({ filepath: outboxFile.filepath, now: time.now,
      verifyAcceptedAuthorityResult: (entry) => placement.verify(entry) });
    repository.setRunMemberships("run-a", members());
    assert.throws(() => outbox.enqueue({ authority: authority(), payload: result() }), /bridge-gap-crash/); assertions += 1;
    equal(outbox.list().length, 0, "production bridge crash writes no partial outbox row");
    equal(placement.replace(authority({ lease_id: "replacement", lease_epoch: 8,
      authority_incarnation: "replacement" })), false,
    "placement acceptance blocks replacement before outbox repair");
    const repaired = outbox.enqueue({ authority: authority(), payload: result() });
    equal(repaired.state, OUTBOX_STATES.PENDING, "production bridge same-hash retry repairs outbox");
    equal(outbox.db.prepare(`SELECT name FROM sqlite_master
      WHERE type='table' AND name='hosted_reference_authority_lineages'`).get(), undefined,
    "production composition creates no independent authority registry");
    const claim = outbox.claim({ owner: "bridge-worker", leaseMs: 100 });
    equal(repository.settle(claim).members.length, 4,
      "settlement revalidates placement acceptance and commits exact membership");
    placement.db.prepare("UPDATE placement_terminal_acceptance SET accepted_result_hash='sha256:fenced'")
      .run();
    rejects(() => repository.settle(claim), "HOSTED_SETTLEMENT_FENCED",
      "settlement replay still revalidates placement acceptance");
    equal(repository.getProfile("server-profile-4").balance, 40,
      "failed placement revalidation mutates no settled economics");
    repository.close(); outbox.close(); placement.close();
    fs.rmSync(outboxFile.dir, { recursive: true, force: true });
    fs.rmSync(placementFile.dir, { recursive: true, force: true });
  }
  {
    const r = setup("reopen");
    const accepted = r.outbox.enqueue({ authority: authority(), payload: result() });
    equal(r.outbox.enqueue({ authority: authority(), payload: result() }).result_id, accepted.result_id,
      "same result enqueue is idempotent");
    const claim = r.outbox.claim({ owner: "worker-one", leaseMs: 100 });
    const committed = r.repository.settle(claim);
    r.outbox.markDelivered({ result_id: claim.result_id, delivery_lease_id: claim.delivery_lease_id });
    equal(r.repository.getProfile("server-profile-4").balance, 40, "all-member settlement applies profile four");
    r.repository.close(); r.outbox.close();

    const reopenedOutbox = new SQLiteHostedResultOutbox({ filepath: r.filepath, now: r.time.now,
      referenceAuthorityMode: true });
    const reopenedRepo = new SQLiteHostedSettlementRepository({ filepath: r.filepath, now: r.time.now,
      referenceAuthorityMode: true });
    equal(reopenedOutbox.get(accepted.result_id).state, OUTBOX_STATES.DELIVERED,
      "delivery acknowledgment survives reopen");
    equal(reopenedRepo.settle({ ...claim, delivery_lease_id: "redelivery" }).settlement_id,
      committed.settlement_id, "settlement replay survives reopen");
    equal(reopenedRepo.getProfile("server-profile-4").balance, 40, "reopen replay does not double credit");
    equal(reopenedRepo.integrityCheck(), ["ok"], "SQLite integrity check passes");
    equal(reopenedRepo.foreignKeyCheck(), [], "SQLite foreign-key check passes");
    reopenedRepo.close(); reopenedOutbox.close();
    fs.rmSync(r.dir, { recursive: true, force: true });
  }

  {
    const r = setup("workers");
    const second = new SQLiteHostedResultOutbox({ filepath: r.filepath, now: r.time.now,
      randomBytes: () => Buffer.alloc(20, 8), maxAttempts: 4, baseBackoffMs: 10,
      referenceAuthorityMode: true });
    r.outbox.enqueue({ authority: authority(), payload: result() });
    const firstClaim = r.outbox.claim({ owner: "worker-a", leaseMs: 100 });
    equal(second.claim({ owner: "worker-b", leaseMs: 100 }), null,
      "two database connections cannot claim one live delivery lease");
    r.time.advance(101);
    const recovered = second.claim({ owner: "worker-b", leaseMs: 100 });
    check(recovered && recovered.delivery_lease_id !== firstClaim.delivery_lease_id,
      "second connection atomically recovers an expired lease");
    rejects(() => r.outbox.markDelivered({ result_id: firstClaim.result_id,
      delivery_lease_id: firstClaim.delivery_lease_id }), "HOSTED_RESULT_STALE_DELIVERY_LEASE",
    "superseded worker cannot acknowledge");
    second.markFailed({ result_id: recovered.result_id, delivery_lease_id: recovered.delivery_lease_id });
    second.close(); close(r);
  }

  {
    const r = setup("dead-letter");
    r.outbox.enqueue({ authority: authority(), payload: result() });
    for (let attempt = 1; attempt <= 4; attempt += 1) {
      const claim = r.outbox.claim({ owner: "failing-worker", leaseMs: 100 });
      const failed = r.outbox.markFailed({ result_id: claim.result_id,
        delivery_lease_id: claim.delivery_lease_id, errorCode: "UPSTREAM_UNAVAILABLE" });
      if (attempt < 4) r.time.advance(10 * (2 ** (attempt - 1)));
      else equal(failed.state, OUTBOX_STATES.DEAD_LETTER, "retry exhaustion reaches dead letter");
    }
    r.outbox.close();
    const reopened = new SQLiteHostedResultOutbox({ filepath: r.filepath, now: r.time.now,
      referenceAuthorityMode: true });
    equal(reopened.list()[0].state, OUTBOX_STATES.DEAD_LETTER, "dead letter survives reopen");
    equal(reopened.claim({ owner: "late-worker", leaseMs: 100 }), null, "dead letter is not reclaimed");
    reopened.close(); r.repository.close(); fs.rmSync(r.dir, { recursive: true, force: true });
  }

  {
    const r = setup("lineage");
    const stale = authority();
    const next = authority({ lease_id: "lease-next", lease_epoch: 8,
      authority_incarnation: "authority-next" });
    equal(r.outbox.replaceAuthority(next, { runState: "DRAINING" }), true,
      "current authority may be replaced before terminal acceptance");
    rejects(() => r.outbox.enqueue({ authority: stale, payload: result() }), "HOSTED_RESULT_FENCED",
      "stale authority cannot enqueue");
    const accepted = r.outbox.enqueue({ authority: next, payload: result() });
    equal(r.outbox.replaceAuthority(authority({ lease_id: "lease-third", lease_epoch: 9,
      authority_incarnation: "authority-third" })), false,
    "accepted terminal lineage cannot be replaced");
    equal(r.outbox.accepted("run-a").result_id, accepted.result_id,
      "accepted lineage remains exactly bound to terminal result");
    const changed = result(); changed.outcomes["membership-1"].em_earned += 1;
    rejects(() => r.outbox.enqueue({ authority: next, payload: changed }), "HOSTED_RESULT_CONFLICT",
      "one accepted run cannot enqueue another result hash");
    close(r);
  }

  {
    const time = clock();
    const file = tmp("accept-rollback");
    let crash = true;
    const outbox = new SQLiteHostedResultOutbox({ filepath: file.filepath, now: time.now,
      referenceAuthorityMode: true,
      fault(step) {
        if (step === "after-placement-accept-before-outbox" && crash) {
          crash = false; throw new Error("accept-crash");
        }
      } });
    outbox.registerAuthority(authority(), { runState: "DRAINING" });
    assert.throws(() => outbox.enqueue({ authority: authority(), payload: result() }), /accept-crash/); assertions += 1;
    equal(outbox.getAuthority("run-a").accepted, true,
      "placement acceptance remains durable across the cross-database crash gap");
    equal(outbox.list().length, 0, "cross-database crash gap leaves no partial outbox row");
    equal(outbox.enqueue({ authority: authority(), payload: result() }).state, OUTBOX_STATES.PENDING,
      "same-hash retry repairs acceptance-before-outbox crash gap");
    equal(outbox.replaceAuthority(authority({ lease_id: "replacement", lease_epoch: 8,
      authority_incarnation: "replacement" })), false,
    "durable acceptance blocks replacement throughout repair gap");
    outbox.close(); fs.rmSync(file.dir, { recursive: true, force: true });
  }

  {
    for (const count of [1, 2, 3, 4]) {
      const r = setup(`seat-${count}`);
      // Membership truth is mutable only before acceptance.
      r.repository.setRunMemberships("run-a", members(count));
      const accepted = r.outbox.enqueue({ authority: authority(), payload: result(count) });
      const claim = r.outbox.claim({ owner: `seat-worker-${count}`, leaseMs: 100 });
      equal(r.repository.settle(claim).members.length, count, `${count}-member exact server set settles`);
      equal(r.repository.counts().hosted_profiles, count, `${count}-member settlement updates exactly ${count} profiles`);
      equal(r.outbox.get(accepted.result_id).state, OUTBOX_STATES.LEASED, "repository commit precedes outbox ack");
      close(r);
    }
    const omitted = setup("omitted");
    omitted.repository.setRunMemberships("run-a", members(4));
    omitted.outbox.enqueue({ authority: authority(), payload: result(3) });
    const omittedClaim = omitted.outbox.claim({ owner: "omitted-worker", leaseMs: 100 });
    rejects(() => omitted.repository.settle(omittedClaim), "HOSTED_SETTLEMENT_MEMBERSHIP_MISMATCH",
      "omitted admitted member rejects");
    equal(omitted.repository.counts().hosted_profiles, 0, "membership mismatch applies no economics");
    close(omitted);
  }

  {
    const boundaries = ["before-result", "after-result", "after-settlement-shell", "after-profile-ensure",
      "after-profile-update", "after-ledger", "after-inventory", "after-profile-revision",
      "after-settlement-response", "before-commit"];
    for (const boundary of boundaries) {
      const r = setup(`fault-${boundary}`, { repoFault(step) {
        if (step === boundary) throw new Error(`fault:${boundary}`);
      } });
      r.outbox.enqueue({ authority: authority(), payload: result() });
      const claim = r.outbox.claim({ owner: "fault-worker", leaseMs: 100 });
      assert.throws(() => r.repository.settle(claim), new RegExp(`fault:${boundary}`)); assertions += 1;
      const counts = r.repository.counts();
      for (const table of ["hosted_profiles", "hosted_profile_revisions", "hosted_match_results",
        "hosted_settlements", "hosted_ledger_entries", "hosted_inventory_items"]) {
        equal(counts[table], 0, `${boundary} rolls back ${table}`);
      }
      equal(r.repository.integrityCheck(), ["ok"], `${boundary} rollback preserves integrity`);
      close(r);
    }
  }

  {
    const r = setup("replay");
    r.outbox.enqueue({ authority: authority(), payload: result() });
    const claim = r.outbox.claim({ owner: "replay-worker", leaseMs: 100 });
    const first = r.repository.settle(claim);
    for (let index = 1; index < 100; index += 1) {
      const replay = r.repository.settle(claim);
      equal(replay.replayed, true, `replay ${index} is identified`);
      equal(replay.settlement_id, first.settlement_id, `replay ${index} retains settlement id`);
    }
    const counts = r.repository.counts();
    equal(counts.hosted_settlements, 1, "100 deliveries commit one settlement");
    equal(counts.hosted_profiles, 4, "100 deliveries retain four profiles");
    equal(counts.hosted_ledger_entries, 4, "100 deliveries post four ledgers once");
    equal(counts.hosted_inventory_items, 4, "100 deliveries post four inventories once");

    const changedPayload = result(); changedPayload.outcomes["membership-4"].em_earned = 999;
    const changed = canonicalResult(authority(), changedPayload);
    const conflict = { ...claim, result_id: changed.result_id, idempotency_key: changed.idempotency_key,
      result_hash: changed.result_hash, payload: changed.payload };
    rejects(() => r.repository.settle(conflict), "HOSTED_SETTLEMENT_CONFLICT",
      "conflicting settled run is quarantined");
    const after = r.repository.counts();
    equal(after.hosted_settlement_conflicts, 1, "conflict quarantine persists");
    equal(r.repository.getProfile("server-profile-4").balance, 40, "conflict changes no economics");
    equal(after.hosted_ledger_entries, 4, "conflict adds no ledger");
    equal(after.hosted_inventory_items, 4, "conflict adds no inventory");
    close(r);
  }

  {
    let crash = true;
    const r = setup("crash-before", { repoFault(step) {
      if (step === "before-commit" && crash) { crash = false; throw new Error("crash-before-commit"); }
    } });
    r.outbox.enqueue({ authority: authority(), payload: result() });
    const claim = r.outbox.claim({ owner: "crash-worker", leaseMs: 100 });
    assert.throws(() => r.repository.settle(claim), /crash-before-commit/); assertions += 1;
    equal(r.repository.counts().hosted_settlements, 0, "pre-commit crash leaves no settlement");
    equal(r.repository.settle(claim).replayed, false, "retry after pre-commit crash performs first commit");
    close(r);
  }

  {
    let crash = true;
    const r = setup("crash-after", { repoFault(step) {
      if (step === "after-commit" && crash) {
        crash = false; throw Object.assign(new Error("crash-after-commit"), { crash: true });
      }
    } });
    r.outbox.enqueue({ authority: authority(), payload: result() });
    const service = new HostedSettlementService({ outbox: r.outbox, repository: r.repository,
      workerId: "crash-worker", leaseMs: 100 });
    assert.throws(() => service.deliverOne(), /crash-after-commit/); assertions += 1;
    equal(r.repository.counts().hosted_settlements, 1, "post-commit crash retains settlement");
    equal(r.outbox.list()[0].state, OUTBOX_STATES.LEASED, "post-commit crash leaves ack pending");
    r.time.advance(101);
    equal(service.deliverOne().replayed, true, "redelivery after post-commit crash replays settlement");
    equal(r.repository.getProfile("server-profile-4").balance, 40, "post-commit replay does not double credit");
    close(r);
  }

  {
    const r = setup("privacy");
    const hostile = result();
    hostile.outcomes["membership-1"].cargo[0].account_id = "raw-account-secret-never-store";
    rejects(() => r.outbox.enqueue({ authority: authority(), payload: hostile }), "HOSTED_RESULT_INVALID",
      "authority payload cannot inject account ownership");
    r.outbox.enqueue({ authority: authority(), payload: result() });
    const claim = r.outbox.claim({ owner: "privacy-worker", leaseMs: 100 });
    r.repository.settle(claim);
    r.repository.close(); r.outbox.close();
    const files = fs.readdirSync(r.dir).filter((name) => name.startsWith("hosted.sqlite"));
    const bytes = Buffer.concat(files.map((name) => fs.readFileSync(path.join(r.dir, name))));
    check(!bytes.includes(Buffer.from("raw-account-secret-never-store")),
      "database, WAL, and sidecars contain no caller account secret");
    check(!bytes.includes(Buffer.from("account_id")), "durable hosted schema stores no account ownership field");
    fs.rmSync(r.dir, { recursive: true, force: true });
  }

  console.log(`sqlite hosted settlement: ${assertions} assertions passed`);
}

main();
