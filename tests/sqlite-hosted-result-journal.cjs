"use strict";

const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { SQLiteHostedResultOutbox } = require("../scripts/sqlite-hosted-result-outbox.cjs");
const { SQLiteHostedSettlementRepository } = require("../scripts/sqlite-hosted-settlement-repository.cjs");
const { HostedSettlementService } = require("../scripts/hosted-settlement-service.cjs");
const { HostedResultError, OUTBOX_STATES } = require("../scripts/hosted-result-outbox.cjs");

let assertions = 0;
function equal(actual, expected, message) {
  assertions += 1;
  assert.deepStrictEqual(actual, expected, message);
}
function check(value, message) { assertions += 1; assert(value, message); }
function conflict(fn, message) {
  assertions += 1;
  assert.throws(fn, (error) => error instanceof HostedResultError
    && error.code === "HOSTED_RESULT_CONFLICT", message);
}
function authority() {
  return { run_id: "run-journal", lease_id: "lease-journal", lease_epoch: 3,
    authority_incarnation: "authority-journal-incarnation" };
}
function payload(em = 17) {
  return { result_version: 1, outcomes: {
    "membership-1": { outcome: "extracted", duration_ms: 1234, em_earned: em, cargo: [] },
  } };
}
function temp(step) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), `lbh-result-journal-${step}-`));
  return { dir, filepath: path.join(dir, "hosted.sqlite") };
}

function exerciseBoundary(boundary) {
  const file = temp(boundary.step);
  let crash = true;
  const outbox = new SQLiteHostedResultOutbox({ filepath: file.filepath,
    now: () => 1_000_000, referenceAuthorityMode: true,
    fault(step) {
      if (step === boundary.step && crash) {
        crash = false;
        throw new Error(`journal-crash:${boundary.step}`);
      }
    } });
  outbox.registerAuthority(authority(), { runState: "DRAINING" });
  assert.throws(() => outbox.enqueue({ authority: authority(), payload: payload() }),
    new RegExp(`journal-crash:${boundary.step}`)); assertions += 1;
  equal(outbox.getAuthority(authority().run_id).accepted, boundary.accepted,
    `${boundary.step}: expected placement state`);
  const journal = outbox.db.prepare("SELECT * FROM hosted_result_journal WHERE run_id=?")
    .get(authority().run_id);
  equal(journal?.state || null, boundary.journal, `${boundary.step}: expected journal state`);
  if (boundary.accepted) {
    check(journal && journal.payload_json === JSON.stringify(payload()),
      `${boundary.step}: accepted placement always retains canonical bytes`);
  }
  outbox.close();

  const reopened = new SQLiteHostedResultOutbox({ filepath: file.filepath,
    now: () => 1_000_001, referenceAuthorityMode: true });
  if (boundary.journal == null) {
    equal(reopened.recoverPrepared(), [], `${boundary.step}: nothing terminal needs recovery`);
    equal(reopened.enqueue({ authority: authority(), payload: payload() }).state,
      OUTBOX_STATES.PENDING, `${boundary.step}: clean retry can prepare and accept`);
  } else if (boundary.journal === "finalized") {
    equal(reopened.recoverPrepared(), [], `${boundary.step}: committed finalization needs no recovery`);
    equal(reopened.enqueue({ authority: authority(), payload: payload() }).state,
      OUTBOX_STATES.PENDING, `${boundary.step}: finalized enqueue is idempotent`);
  } else {
    conflict(() => reopened.enqueue({ authority: authority(), payload: payload(999) }),
      `${boundary.step}: recovery cannot use a caller-selected alternate payload`);
    const [recovered] = reopened.recoverPrepared();
    equal(recovered.state, OUTBOX_STATES.PENDING,
      `${boundary.step}: explicit reopen recovery publishes canonical bytes`);
  }
  equal(reopened.db.prepare("SELECT state FROM hosted_result_journal WHERE run_id=?")
    .get(authority().run_id).state, "finalized", `${boundary.step}: journal finalizes durably`);
  equal(reopened.list().length, 1, `${boundary.step}: exactly one result is published`);
  equal(reopened.list()[0].payload, payload(), `${boundary.step}: published payload is canonical`);
  reopened.close();
  fs.rmSync(file.dir, { recursive: true, force: true });
}

function main() {
  for (const boundary of [
    { step: "before-result-prepare", journal: null, accepted: false },
    { step: "before-result-prepare-commit", journal: null, accepted: false },
    { step: "after-result-prepare", journal: "prepared", accepted: false },
    { step: "after-placement-accept-before-journal-accepted", journal: "prepared", accepted: true },
    { step: "after-result-journal-accepted", journal: "accepted", accepted: true },
    { step: "before-result-finalization-commit", journal: "accepted", accepted: true },
    { step: "after-result-finalization", journal: "finalized", accepted: true },
  ]) exerciseBoundary(boundary);

  {
    const file = temp("stale-lineage");
    const outbox = new SQLiteHostedResultOutbox({ filepath: file.filepath,
      referenceAuthorityMode: true });
    outbox.registerAuthority(authority(), { runState: "DRAINING" });
    const stale = { ...authority(), lease_id: "stale-lease", lease_epoch: 2,
      authority_incarnation: "stale-incarnation" };
    assertions += 1;
    assert.throws(() => outbox.enqueue({ authority: stale, payload: payload() }),
      (error) => error instanceof HostedResultError && error.code === "HOSTED_RESULT_FENCED");
    equal(outbox.db.prepare("SELECT * FROM hosted_result_journal WHERE run_id=?")
      .get(authority().run_id), undefined,
    "definitively rejected speculative preparation does not pin the live lineage");
    equal(outbox.enqueue({ authority: authority(), payload: payload() }).state, OUTBOX_STATES.PENDING,
      "live lineage can prepare after stale preparation is definitively rejected");
    outbox.close();
    fs.rmSync(file.dir, { recursive: true, force: true });
  }

  {
    const file = temp("worker-startup-recovery-e2e");
    let crash = true;
    let outbox = new SQLiteHostedResultOutbox({ filepath: file.filepath,
      now: () => 2_000_000, referenceAuthorityMode: true,
      fault(step) {
        if (step === "after-placement-accept-before-journal-accepted" && crash) {
          crash = false;
          throw Object.assign(new Error("authority-process-crash"), { crash: true });
        }
      } });
    outbox.registerAuthority(authority(), { runState: "DRAINING" });
    let repository = new SQLiteHostedSettlementRepository({ filepath: file.filepath,
      now: () => 2_000_000, referenceAuthorityMode: true });
    repository.setRunMemberships(authority().run_id, [{ run_membership_id: "membership-1",
      profile_id: "profile-1" }]);
    assert.throws(() => outbox.enqueue({ authority: authority(), payload: payload() }),
      /authority-process-crash/); assertions += 1;
    equal(outbox.list(), [], "authority crash occurs before any outbox publication");
    equal(outbox.db.prepare("SELECT state FROM hosted_result_journal WHERE run_id=?")
      .get(authority().run_id).state, "prepared",
    "authority crash leaves canonical result bytes durably prepared");
    repository.close(); outbox.close();

    const recoveryDiagnostics = [];
    outbox = new SQLiteHostedResultOutbox({ filepath: file.filepath,
      now: () => 2_000_001, referenceAuthorityMode: true });
    repository = new SQLiteHostedSettlementRepository({ filepath: file.filepath,
      now: () => 2_000_001, referenceAuthorityMode: true });
    const worker = new HostedSettlementService({ outbox, repository,
      workerId: "recovery-worker", leaseMs: 1_000, recoveryLimit: 8,
      diagnostics: (event) => recoveryDiagnostics.push(event) });
    const committed = worker.deliverOne();
    equal(committed.members.length, 1,
      "settlement worker recovers and settles without authority result resubmission");
    equal(repository.getProfile("profile-1").balance, 17,
      "recovered canonical result applies economics exactly once");
    equal(outbox.list()[0].state, OUTBOX_STATES.DELIVERED,
      "worker acknowledges the recovered outbox row");
    equal(recoveryDiagnostics, [{ type: "hosted_result_journal_recovery", status: "recovered",
      recoveredCount: 1, recoveryLimit: 8 }], "bounded recovery emits payload-free diagnostics");
    equal(worker.deliverOne(), null, "second worker pass neither resubmits nor resettles the result");
    equal(repository.counts().hosted_settlements, 1, "worker recovery remains exactly once");
    repository.close(); outbox.close();
    fs.rmSync(file.dir, { recursive: true, force: true });
  }

  {
    let claimed = false;
    let observedLimit = null;
    const recoveryDiagnostics = [];
    const recoveryError = Object.assign(new Error("placement unavailable"), {
      code: "HOSTED_RESULT_RECOVERY_UNAVAILABLE",
    });
    const worker = new HostedSettlementService({
      outbox: {
        recoverPrepared({ limit }) { observedLimit = limit; throw recoveryError; },
        claim() { claimed = true; return null; },
      },
      repository: { settle() { throw new Error("unreachable"); } },
      recoveryLimit: 7,
      diagnostics: (event) => recoveryDiagnostics.push(event),
    });
    assert.throws(() => worker.deliverOne(), (error) => error === recoveryError); assertions += 1;
    equal(observedLimit, 7, "worker forwards its configured bounded journal recovery limit");
    equal(claimed, false, "journal recovery failure is fail-closed before outbox claim");
    equal(recoveryDiagnostics, [{ type: "hosted_result_journal_recovery", status: "failed",
      errorCode: "HOSTED_RESULT_RECOVERY_UNAVAILABLE" }],
    "journal recovery failure emits payload-free diagnostics");
  }

  console.log(`sqlite hosted result journal: ${assertions} assertions passed`);
}

main();
