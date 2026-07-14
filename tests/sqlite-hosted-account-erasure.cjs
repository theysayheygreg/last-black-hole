"use strict";

const assert = require("node:assert");
const crypto = require("node:crypto");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { DatabaseSync } = require("node:sqlite");
const { SqliteHostedIdentityRepository } = require("../scripts/sqlite-hosted-identity-repository.cjs");
const { SqliteHostedProductRepository } = require("../scripts/sqlite-hosted-product-repository.cjs");
const { SQLiteHostedSettlementRepository } = require("../scripts/sqlite-hosted-settlement-repository.cjs");
const {
  SQLiteHostedAccountErasureCoordinator, HostedAccountErasureError,
} = require("../scripts/sqlite-hosted-account-erasure.cjs");

let assertions = 0;
function equal(actual, expected, message) { assertions += 1; assert.deepStrictEqual(actual, expected, message); }
function check(value, message) { assertions += 1; assert(value, message); }
function rejects(fn, code, message) {
  assertions += 1;
  assert.throws(fn, (error) => error instanceof HostedAccountErasureError && error.code === code, message);
}
const control = (accountId) => ({ authenticated: true, plane: "control", role: "CONTROL_PLANE", accountId });
const worker = { authenticated: true, plane: "control", role: "CONTROL_PLANE" };

function rig(label, { fault = () => {} } = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), `lbh-erasure-${label}-`));
  const filepath = path.join(dir, "hosted.sqlite");
  const db = new DatabaseSync(filepath);
  const identity = new SqliteHostedIdentityRepository({ db, subjectLookupKey: "i".repeat(32) });
  const product = new SqliteHostedProductRepository({ db, encryptionKey: "p".repeat(32), encryptionKeyId: "test-v1" });
  const settlement = new SQLiteHostedSettlementRepository({ db, referenceAuthorityMode: true });
  const erasure = new SQLiteHostedAccountErasureCoordinator({ db, productRepository: product,
    erasureKey: "e".repeat(32), now: () => 1_000_000, fault });
  return { dir, filepath, db, identity, product, settlement, erasure };
}
function close(r) {
  try { r.erasure?.close(); } catch {}
  try { r.settlement?.close(); } catch {}
  try { r.product?.close(); } catch {}
  try { r.identity?.close(); } catch {}
  try { r.db?.close(); } catch {}
  fs.rmSync(r.dir, { recursive: true, force: true });
}

function addIdentity(r, suffix) {
  const accountId = `account-${suffix}`;
  const profileId = `profile-${suffix}`;
  r.identity.putAccount({ accountId, state: "active", createdAt: 1 });
  r.identity.putIdentity({ identityId: `identity-${suffix}`, provider: "test", providerSubject: `subject-${suffix}`,
    accountId, createdAt: 1 });
  r.identity.putCallback({ provider: "test", callbackId: `callback-${suffix}`, accountId, createdAt: 2 });
  r.identity.putExchangeProof({ provider: "test", proofUseHash: `proof-${suffix}`, accountId, createdAt: 2 });
  r.identity.putEntitlement({ entitlementId: `entitlement-${suffix}`, accountId, provider: "test", appId: "lbh",
    grantType: "purchase", providerGrantHash: `grant-${suffix}`, state: "active", observationVersion: 1,
    providerObservedAt: 2, observationHash: `observation-${suffix}` });
  r.identity.putProfile({ profileId, accountId, state: "active", playerAlias: `Pilot ${suffix}` });
  r.identity.putRefreshFamily({ familyId: `family-${suffix}`, accountId,
    scope: { provider: "test", appId: "lbh", grantType: "purchase" }, state: "active" });
  r.identity.putRefreshToken({ tokenHash: `refresh-${suffix}`, familyId: `family-${suffix}`, accountId,
    generation: 0, state: "active" });
  r.identity.putAccessSession({ tokenHash: `access-${suffix}`, accessSessionId: `session-${suffix}`,
    familyId: `family-${suffix}`, accountId });
  return { accountId, profileId };
}

function createMatch(r, { suffix, state, users, admitted = true, settled = false }) {
  const matchId = `match-${suffix}`;
  const runId = `run-${suffix}`;
  const sessionId = `session-match-${suffix}`;
  r.product.createMatch({ matchId, runId, sessionId, joinCode: `join-${suffix}`,
    allocationHandle: `allocation-${suffix}`, seatCount: users.length, state,
    ownerAccountId: users[0].accountId, placementRequestId: `placement-${suffix}`,
    bootstrap: `secret-${suffix}`, createdAt: 10 });
  users.forEach((user, index) => r.product.addMembership({
    membershipId: `member-${suffix}-${index}`, matchId, runId, sessionId,
    profileId: user.profileId, accountId: user.accountId, seatNo: index,
    runMembershipId: `run-member-${suffix}-${index}`,
    sessionMembershipId: `session-member-${suffix}-${index}`,
    clientIncarnation: `client-device-${suffix}-${index}`, playerAlias: `Alias ${suffix} ${index}`,
    createdAt: 10, admittedAt: admitted ? 11 : null,
  }));
  if (settled) settle(r, { suffix, runId, users });
  return { matchId, runId };
}

function settle(r, { suffix, runId, users }) {
  const resultId = `result-${suffix}`;
  const settlementId = `settlement-${suffix}`;
  const payload = { result_version: 1, outcomes: Object.fromEntries(users.map((_, index) => [
    `run-member-${suffix}-${index}`, { outcome: "extracted", em_earned: 10 + index,
      cargo: [{ item_id: `cargo-${suffix}-${index}` }] },
  ])) };
  r.db.prepare(`INSERT INTO hosted_result_outbox
    (result_id,idempotency_key,run_id,result_hash,lease_id,lease_epoch,authority_incarnation,
     payload_json,accepted_at,state,attempts,available_at,delivered_at)
    VALUES(?,?,?,?,?,?,?, ?,?,'delivered',1,NULL,?)`).run(resultId, `idem-${suffix}`, runId,
    `sha256:${suffix}`, `lease-${suffix}`, 1, `incarnation-${suffix}`, JSON.stringify(payload), 12, 13);
  r.db.prepare(`INSERT INTO hosted_match_results
    (result_id,run_id,result_hash,lease_id,lease_epoch,authority_incarnation,payload_json,accepted_at,settled_at)
    VALUES(?,?,?,?,?,?,?,?,?)`).run(resultId, runId, `sha256:${suffix}`, `lease-${suffix}`, 1,
    `incarnation-${suffix}`, JSON.stringify(payload), 12, 13);
  const response = { settlement_id: settlementId, result_id: resultId, run_id: runId,
    result_hash: `sha256:${suffix}`, committed_at: 13, members: users.map((_, index) => ({
      run_membership_id: `run-member-${suffix}-${index}`, profile_revision: 1,
      em_credited: 10 + index, inventory_count: 1,
    })) };
  r.db.prepare(`INSERT INTO hosted_settlements
    (settlement_id,result_id,run_id,result_hash,idempotency_key,response_json,committed_at)
    VALUES(?,?,?,?,?,?,?)`).run(settlementId, resultId, runId, `sha256:${suffix}`,
    `idem-${suffix}`, JSON.stringify(response), 13);
  users.forEach((user, index) => {
    r.db.prepare("INSERT OR IGNORE INTO hosted_profiles(profile_id,revision,balance,updated_at) VALUES(?,1,?,13)")
      .run(user.profileId, 10 + index);
    r.db.prepare(`INSERT INTO hosted_run_memberships(run_id,run_membership_id,profile_id,membership_state)
      VALUES(?,?,?,'admitted')`).run(runId, `run-member-${suffix}-${index}`, user.profileId);
    r.db.prepare(`INSERT INTO hosted_profile_revisions(profile_id,revision,settlement_id,created_at)
      VALUES(?,1,?,13)`).run(user.profileId, settlementId);
    r.db.prepare(`INSERT INTO hosted_ledger_entries
      (ledger_id,profile_id,run_membership_id,settlement_id,currency,delta,balance,created_at)
      VALUES(?,?,?,?, 'EM',?,?,13)`).run(`ledger-${suffix}-${index}`, user.profileId,
      `run-member-${suffix}-${index}`, settlementId, 10 + index, 10 + index);
    r.db.prepare(`INSERT INTO hosted_inventory_items
      (inventory_id,profile_id,run_membership_id,settlement_id,slot_no,item_json,created_at)
      VALUES(?,?,?,?,0,?,13)`).run(`inventory-${suffix}-${index}`, user.profileId,
      `run-member-${suffix}-${index}`, settlementId, JSON.stringify({ item_id: `cargo-${suffix}-${index}` }));
  });
}

function archiveForErasure(r, suffix) {
  const resultId = `result-${suffix}`;
  const settlementId = `settlement-${suffix}`;
  const membershipIds = r.db.prepare(`SELECT run_membership_id FROM hosted_run_memberships
    WHERE run_id=? ORDER BY run_membership_id`).all(`run-${suffix}`).map((row) => row.run_membership_id);
  const membershipDigest = `sha256:${crypto.createHash("sha256").update(JSON.stringify(membershipIds)).digest("hex")}`;
  r.db.prepare(`INSERT INTO hosted_result_audit
    (result_id,idempotency_key,run_id,result_hash,settlement_id,committed_at,archived_at,
     retain_until,placement_acknowledged_at,receipt_schema,receipt_version,result_version,
     lease_id,lease_epoch,authority_incarnation,membership_digest,membership_count)
    VALUES(?,?,?,?,?,?,?, ?,?,?,?,?,?,?,?,?,?)`).run(resultId, `idem-${suffix}`, `run-${suffix}`,
    `sha256:${suffix}`, settlementId, 13, 14, 1_000_014, 15,
    "lbh.hosted.placement-settlement-receipt", 1, 1, `lease-${suffix}`, 1,
    `incarnation-${suffix}`, membershipDigest, membershipIds.length);
  r.db.prepare("UPDATE hosted_match_results SET payload_json='{}' WHERE result_id=?").run(resultId);
  r.db.prepare("UPDATE hosted_settlements SET response_json=? WHERE settlement_id=?")
    .run(JSON.stringify({ settlement_id: settlementId, result_id: resultId, run_id: `run-${suffix}`,
      result_hash: `sha256:${suffix}`, committed_at: 13, archived: true }), settlementId);
  r.db.prepare("DELETE FROM hosted_result_outbox WHERE result_id=?").run(resultId);
}

function runToComplete(r, request, accountId, limit = 1) {
  let status = request;
  let turns = 0;
  while (status.state !== "complete" && turns < 100) {
    status = r.erasure.step({ auth: worker, erasureId: request.erasureId, targetAccountId: accountId, limit });
    turns += 1;
  }
  check(turns < 100, "bounded erasure completes");
  return status;
}

function main() {
  {
    const r = rig("auth");
    const a = addIdentity(r, "a");
    const b = addIdentity(r, "b");
    rejects(() => r.erasure.request({ auth: null, targetAccountId: a.accountId, requestId: "r1" }),
      "ERASURE_CONTROL_AUTH_REQUIRED", "anonymous erasure request rejected");
    rejects(() => r.erasure.request({ auth: control(b.accountId), targetAccountId: a.accountId, requestId: "r1" }),
      "ERASURE_ACCOUNT_MISMATCH", "authenticated account cannot erase another account");
    const first = r.erasure.request({ auth: control(a.accountId), targetAccountId: a.accountId, requestId: "r1" });
    equal(r.erasure.request({ auth: control(a.accountId), targetAccountId: a.accountId, requestId: "r1" }).erasureId,
      first.erasureId, "same authenticated request is idempotent");
    rejects(() => r.erasure.request({ auth: control(a.accountId), targetAccountId: a.accountId, requestId: "r2" }),
      "ERASURE_REQUEST_COLLISION", "different request id cannot silently replace durable receipt");
    close(r);
  }

  {
    const r = rig("blockers");
    const live = addIdentity(r, "live");
    const liveMatch = createMatch(r, { suffix: "live", state: "ACTIVE", users: [live], admitted: true });
    const liveRequest = r.erasure.request({ auth: control(live.accountId), targetAccountId: live.accountId, requestId: "live-r" });
    equal(r.erasure.step({ auth: worker, erasureId: liveRequest.erasureId,
      targetAccountId: live.accountId }).reason, "LIVE_RUN", "live match defers erasure");
    r.product.updateMatch(liveMatch.matchId, (match) => ({ ...match, state: "ENDED" }));
    equal(r.erasure.step({ auth: worker, erasureId: liveRequest.erasureId,
      targetAccountId: live.accountId }).reason, "ADMITTED_RUN_UNSETTLED", "ended admitted but unsettled run defers");
    equal(r.identity.getAccount(live.accountId).state, "active", "deferred request mutates no identity");
    close(r);
  }

  {
    const r = rig("settled-cross-account");
    const target = addIdentity(r, "target");
    const other = addIdentity(r, "other");
    createMatch(r, { suffix: "safe", state: "ENDED", users: [target, other], settled: true });
    const request = r.erasure.request({ auth: control(target.accountId), targetAccountId: target.accountId,
      requestId: "erase-target" });
    equal(r.erasure.step({ auth: worker, erasureId: request.erasureId,
      targetAccountId: target.accountId }).reason, "SETTLEMENT_ARCHIVE_UNACKNOWLEDGED",
    "delivered settlement still defers until placement archive acknowledgement");
    archiveForErasure(r, "safe");
    const complete = runToComplete(r, request, target.accountId, 1);
    equal(complete.state, "complete", "settled account reaches terminal erasure receipt");
    equal(r.identity.getAccount(target.accountId), undefined, "identity account and cascading provider/session data deleted");
    equal(r.identity.getAccount(other.accountId).state, "active", "other account remains active");
    equal(r.identity.getProfile(other.profileId).accountId, other.accountId, "other profile ownership remains exact");
    equal(r.db.prepare("SELECT count(*) AS n FROM hosted_inventory_items WHERE profile_id=?").get(target.profileId).n,
      0, "target inventory payload deleted");
    equal(r.db.prepare("SELECT count(*) AS n FROM hosted_inventory_items WHERE profile_id=?").get(other.profileId).n,
      1, "other account inventory remains");
    const targetLedger = r.db.prepare("SELECT * FROM hosted_ledger_entries WHERE ledger_id='ledger-safe-0'").get();
    check(targetLedger.profile_id.startsWith("erased_profile_"), "accounting ledger retains only HMAC profile alias");
    check(targetLedger.run_membership_id.startsWith("erased_run_member_"), "ledger membership is de-identified");
    const otherLedger = r.db.prepare("SELECT * FROM hosted_ledger_entries WHERE ledger_id='ledger-safe-1'").get();
    equal(otherLedger.profile_id, other.profileId, "cross-account ledger is never rewritten");
    equal(r.db.prepare("SELECT payload_json FROM hprod_memberships WHERE seat_no=0").get(), undefined,
      "profile ownership, player alias, and client incarnation membership payload are deleted");
    equal(JSON.parse(r.db.prepare("SELECT payload_json FROM hprod_memberships WHERE seat_no=1").get().payload_json)
      .accountId, other.accountId, "other account product membership remains exact");
    check(r.product.getMatch("match-safe").ownerAccountId.startsWith("erased_account_"),
      "ended shared match owner is de-identified inside encrypted product payload");
    equal(r.db.prepare("SELECT payload_json FROM hosted_match_results WHERE run_id='run-safe'").get().payload_json,
      "{}", "settled result body is retired while immutable hash remains");
    equal(r.db.prepare("SELECT placement_acknowledged_at FROM hosted_result_audit WHERE run_id='run-safe'")
      .get().placement_acknowledged_at, 15, "placement archive acknowledgement remains auditable");
    equal(r.db.prepare("SELECT count(*) AS n FROM hosted_account_erasures").get().n, 1,
      "minimal HMAC erasure receipt retained");
    const dump = r.db.prepare(`SELECT group_concat(value,'|') AS text FROM (
      SELECT payload_json AS value FROM hprod_memberships UNION ALL
      SELECT response_json FROM hosted_settlements UNION ALL
      SELECT profile_id FROM hosted_profiles UNION ALL
      SELECT profile_id FROM hosted_ledger_entries)`).get().text;
    check(!dump.includes(target.accountId) && !dump.includes(target.profileId),
      "retained product/economic records contain no raw target account or profile id");
    equal(r.erasure.step({ auth: worker, erasureId: request.erasureId,
      targetAccountId: target.accountId, limit: 1 }).state, "complete", "terminal replay is idempotent");
    close(r);
  }

  {
    let rival = null;
    let interleave = true;
    const r = rig("writer-race", { fault(step) {
      if (step === "before-lock" && interleave) {
        interleave = false;
        rival.prepare("UPDATE hprod_matches SET state='ACTIVE' WHERE match_id='match-writer-race'").run();
      }
    } });
    const target = addIdentity(r, "writer-race");
    createMatch(r, { suffix: "writer-race", state: "ENDED", users: [target], settled: true });
    archiveForErasure(r, "writer-race");
    const request = r.erasure.request({ auth: control(target.accountId), targetAccountId: target.accountId,
      requestId: "erase-writer-race" });
    rival = new DatabaseSync(r.filepath);
    rival.exec("PRAGMA busy_timeout=5000; PRAGMA journal_mode=WAL;");
    equal(r.erasure.step({ auth: worker, erasureId: request.erasureId,
      targetAccountId: target.accountId, limit: 1 }).reason, "LIVE_RUN",
    "writer transition before lock is observed by the in-transaction blocker check");
    equal(r.db.prepare("SELECT account_id FROM hprod_memberships WHERE match_id='match-writer-race'")
      .get().account_id, target.accountId, "racing live transition leaves identity and membership untouched");
    rival.prepare("UPDATE hprod_matches SET state='ENDED' WHERE match_id='match-writer-race'").run();
    equal(runToComplete(r, request, target.accountId, 1).state, "complete",
      "erasure resumes only after the competing writer restores a safe terminal state");
    rival.close();
    close(r);
  }

  {
    let crash = true;
    const r = rig("crash", { fault(step) {
      if (step === "before-commit" && crash) { crash = false; throw new Error("simulated-erasure-crash"); }
    } });
    const target = addIdentity(r, "crash");
    createMatch(r, { suffix: "crash", state: "ENDED", users: [target], settled: true });
    archiveForErasure(r, "crash");
    const request = r.erasure.request({ auth: control(target.accountId), targetAccountId: target.accountId,
      requestId: "erase-crash" });
    assert.throws(() => r.erasure.step({ auth: worker, erasureId: request.erasureId,
      targetAccountId: target.accountId, limit: 1 }), /simulated-erasure-crash/); assertions += 1;
    equal(r.db.prepare("SELECT account_id FROM hprod_memberships WHERE match_id='match-crash'").get().account_id,
      target.accountId, "fault rolls back product de-identification atomically");
    equal(r.identity.getAccount(target.accountId).state, "active", "fault rolls back identity work");
    r.erasure.close(); r.settlement.close(); r.product.close(); r.identity.close(); r.db.close();

    const db = new DatabaseSync(r.filepath);
    const identity = new SqliteHostedIdentityRepository({ db, subjectLookupKey: "i".repeat(32) });
    const product = new SqliteHostedProductRepository({ db, encryptionKey: "p".repeat(32), encryptionKeyId: "test-v1" });
    const settlement = new SQLiteHostedSettlementRepository({ db, referenceAuthorityMode: true });
    const erasure = new SQLiteHostedAccountErasureCoordinator({ db, productRepository: product,
      erasureKey: "e".repeat(32), now: () => 1_000_001 });
    Object.assign(r, { db, identity, product, settlement, erasure });
    equal(runToComplete(r, request, target.accountId, 1).state, "complete",
      "durable request resumes after reopen without double credit or cross-account choice");
    equal(r.db.prepare("PRAGMA integrity_check").get().integrity_check, "ok", "erasure preserves SQLite integrity");
    equal(r.db.prepare("PRAGMA foreign_key_check").all(), [], "erasure preserves foreign keys");
    close(r);
  }

  console.log(`sqlite hosted account erasure tests passed (${assertions} assertions)`);
}

main();
