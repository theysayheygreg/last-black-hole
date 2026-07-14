"use strict";

const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawn } = require("node:child_process");
const { DatabaseSync } = require("node:sqlite");
const { SqliteHostedProductRepository } = require("../scripts/sqlite-hosted-product-repository.cjs");

const KEY = crypto.createHash("sha256").update("sqlite hosted product test key").digest();
const KEY_ID = "hprod-test-key-v1";
const ROTATED_KEY = crypto.createHash("sha256").update("sqlite hosted product rotated key").digest();
const ROTATED_KEY_ID = "hprod-test-key-v2";

function match(suffix, seatCount = 4) {
  return { matchId: `match-${suffix}`, runId: `run-${suffix}`, sessionId: `session-${suffix}`,
    joinCode: `join-${suffix}`, allocationHandle: `allocation-${suffix}`, seatCount,
    state: "ALLOCATING", ownerAccountId: `account-owner-${suffix}`,
    bootstrap: `BOOTSTRAP-PLAINTEXT-${suffix}-MUST-NEVER-APPEAR`,
    bootstrapAudience: `audience-${suffix}`, placementRequestId: `request-${suffix}`, createdAt: 100 };
}
function member(suffix, matchRecord, seatNo) {
  return { membershipId: `membership-${suffix}`, matchId: matchRecord.matchId,
    runId: matchRecord.runId, sessionId: matchRecord.sessionId, profileId: `profile-${suffix}`,
    accountId: `account-${suffix}`, seatNo, runMembershipId: `run-member-${suffix}`,
    sessionMembershipId: `session-member-${suffix}`, clientIncarnation: `client-${suffix}`,
    playerAlias: `Player ${suffix}`, createdAt: 101 };
}
function workload(suffix, matchRecord, epoch = 1) {
  return { workloadRunHandle: `workload-${suffix}`, matchId: matchRecord.matchId, runId: matchRecord.runId,
    authorityLeaseId: `lease-${suffix}`, leaseEpoch: epoch, authorityInstanceId: `authority-${suffix}`,
    authorityIncarnation: `incarnation-${suffix}`, credentialBinding: `binding-${suffix}`, state: "ALLOCATING" };
}

if (process.argv[2] === "--race-worker") {
  const [, , , filepath, suffix, seatText] = process.argv;
  const repository = new SqliteHostedProductRepository({ filepath, encryptionKey: KEY, encryptionKeyId: KEY_ID, busyTimeoutMs: 10_000 });
  try {
    const record = repository.getMatch("match-race");
    repository.transaction((repo) => repo.addMembership(member(suffix, record, Number(seatText))));
    process.stdout.write("won");
  } catch (error) {
    process.stdout.write(`lost:${error.code || error.message}`);
  } finally { repository.close(); }
  process.exit(0);
}

let passed = 0;
const tests = [];
function test(name, fn) { tests.push({ name, fn }); }
function rejects(fn, pattern) { assert.throws(fn, pattern); }
function repository(filepath, options = {}) {
  return new SqliteHostedProductRepository({ filepath, encryptionKey: KEY, encryptionKeyId: KEY_ID, ...options });
}

test("reopens durable records and preserves lookup locators", () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "lbh-hprod-reopen-"));
  const filepath = path.join(directory, "product.sqlite");
  const first = repository(filepath); const value = match("reopen", 2);
  first.transaction((repo) => {
    repo.createMatch(value); repo.addMembership(member("reopen-owner", value, 0));
    repo.putWorkloadContext(workload("reopen", value));
  });
  first.close();
  const second = repository(filepath);
  assert.deepEqual(second.getMatch(value.matchId), value);
  assert.equal(second.getMatchByJoinCode(value.joinCode).matchId, value.matchId);
  assert.equal(second.getMatchByAllocation(value.allocationHandle).runId, value.runId);
  assert.equal(second.getMembership(value.matchId, "profile-reopen-owner").seatNo, 0);
  assert.equal(second.getWorkloadContext("workload-reopen").authorityLeaseId, "lease-reopen");
  assert.deepEqual(second.db.prepare("PRAGMA foreign_key_check").all(), []);
  second.close(); fs.rmSync(directory, { recursive: true, force: true });
});

test("accepts an injected database without taking ownership", () => {
  const db = new DatabaseSync(":memory:");
  const repo = new SqliteHostedProductRepository({ db, encryptionKey: KEY, encryptionKeyId: KEY_ID });
  const value = match("injected"); repo.createMatch(value); repo.close();
  assert.equal(db.prepare("SELECT count(*) AS count FROM hprod_matches").get().count, 1);
  db.close();
});

test("encrypts match payload including bootstrap at rest", () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "lbh-hprod-secret-"));
  const filepath = path.join(directory, "product.sqlite"); const value = match("secret");
  const repo = repository(filepath); repo.createMatch(value);
  repo.db.exec("PRAGMA wal_checkpoint(TRUNCATE)"); repo.close();
  for (const filename of fs.readdirSync(directory)) {
    const bytes = fs.readFileSync(path.join(directory, filename));
    assert.equal(bytes.includes(Buffer.from(value.bootstrap)), false, `${filename} leaked bootstrap`);
  }
  const wrong = new SqliteHostedProductRepository({ filepath, encryptionKey: Buffer.alloc(32, 9), encryptionKeyId: KEY_ID });
  rejects(() => wrong.getMatch(value.matchId)); wrong.close();
  fs.rmSync(directory, { recursive: true, force: true });
});

test("rotation dual-reads an old row and safely rewrites it to the current key", () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "lbh-hprod-rotate-"));
  const filepath = path.join(directory, "product.sqlite"); const value = match("rotate");
  const first = repository(filepath); first.createMatch(value); first.close();
  const rotating = new SqliteHostedProductRepository({ filepath, encryptionKey: ROTATED_KEY,
    encryptionKeyId: ROTATED_KEY_ID, previousEncryptionKeys: [{ keyId: KEY_ID, key: KEY }] });
  assert.deepEqual(rotating.getMatch(value.matchId), value);
  assert.equal(rotating.db.prepare("SELECT key_id FROM hprod_matches WHERE match_id=?").get(value.matchId).key_id,
    ROTATED_KEY_ID, "read should migrate the exact encrypted row");
  rotating.close();
  const retired = new SqliteHostedProductRepository({ filepath, encryptionKey: ROTATED_KEY, encryptionKeyId: ROTATED_KEY_ID });
  assert.deepEqual(retired.getMatch(value.matchId), value, "migrated row survives reopen after old-key retirement");
  retired.close(); fs.rmSync(directory, { recursive: true, force: true });
});

test("retired unknown and tampered encryption key IDs fail closed", () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "lbh-hprod-retire-"));
  const filepath = path.join(directory, "product.sqlite"); const value = match("retire");
  const first = repository(filepath); first.createMatch(value); first.close();
  const retired = new SqliteHostedProductRepository({ filepath, encryptionKey: ROTATED_KEY, encryptionKeyId: ROTATED_KEY_ID });
  rejects(() => retired.getMatch(value.matchId), /key id unavailable/); retired.close();
  const rotating = new SqliteHostedProductRepository({ filepath, encryptionKey: ROTATED_KEY,
    encryptionKeyId: ROTATED_KEY_ID, previousEncryptionKeys: [{ keyId: KEY_ID, key: KEY }] });
  rotating.db.prepare("UPDATE hprod_matches SET key_id=? WHERE match_id=?").run(ROTATED_KEY_ID, value.matchId);
  rejects(() => rotating.getMatch(value.matchId));
  rotating.db.prepare("UPDATE hprod_matches SET key_id=? WHERE match_id=?").run("unknown-key", value.matchId);
  rejects(() => rotating.getMatch(value.matchId), /key id unavailable/);
  rotating.close(); fs.rmSync(directory, { recursive: true, force: true });
});

test("rejects duplicate and oversized previous encryption keyrings", () => {
  rejects(() => new SqliteHostedProductRepository({ filepath: ":memory:", encryptionKey: ROTATED_KEY,
    encryptionKeyId: ROTATED_KEY_ID, previousEncryptionKeys: [{ keyId: ROTATED_KEY_ID, key: KEY }] }), /collision/);
  rejects(() => new SqliteHostedProductRepository({ filepath: ":memory:", encryptionKey: ROTATED_KEY,
    encryptionKeyId: ROTATED_KEY_ID, previousEncryptionKeys: Array.from({ length: 5 }, (_, index) => ({
      keyId: `old-${index}`, key: KEY,
    })) }), /previous encryption keys invalid/);
});

test("enforces 1..4 seats and rejects fifth membership", () => {
  const repo = repository(":memory:");
  rejects(() => repo.createMatch(match("eight", 8)), /seatCount/);
  const value = match("cap", 4); repo.createMatch(value);
  for (let seat = 0; seat < 4; seat += 1) repo.addMembership(member(`cap-${seat}`, value, seat));
  rejects(() => repo.addMembership(member("cap-fifth", value, 0)), /match full|UNIQUE/);
  rejects(() => repo.updateMatch(value.matchId, (current) => ({ ...current, seatCount: 3 })), /occupied seat/);
  assert.equal(repo.listMemberships(value.matchId).length, 4); repo.close();
});

test("two processes racing for the last seat admit exactly one", async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "lbh-hprod-race-"));
  const filepath = path.join(directory, "product.sqlite"); const value = match("race", 4);
  const repo = repository(filepath); repo.createMatch(value);
  for (let seat = 0; seat < 3; seat += 1) repo.addMembership(member(`race-base-${seat}`, value, seat));
  repo.close();
  function contender(suffix) {
    return new Promise((resolve, reject) => {
      const child = spawn(process.execPath, [__filename, "--race-worker", filepath, suffix, "3"], { stdio: ["ignore", "pipe", "pipe"] });
      let stdout = ""; let stderr = "";
      child.stdout.on("data", (data) => { stdout += data; }); child.stderr.on("data", (data) => { stderr += data; });
      child.on("error", reject); child.on("close", (code) => code === 0 ? resolve(stdout) : reject(new Error(stderr)));
    });
  }
  const outcomes = await Promise.all([contender("race-a"), contender("race-b")]);
  assert.equal(outcomes.filter((value) => value === "won").length, 1, JSON.stringify(outcomes));
  const check = repository(filepath); assert.equal(check.listMemberships(value.matchId).length, 4); check.close();
  fs.rmSync(directory, { recursive: true, force: true });
});

test("rejects duplicate and cross-match membership identity smuggling", () => {
  const repo = repository(":memory:"); const one = match("one"); const two = match("two");
  repo.createMatch(one); repo.createMatch(two); const original = member("shared", one, 0); repo.addMembership(original);
  rejects(() => repo.addMembership({ ...member("other", two, 0), membershipId: original.membershipId }), /UNIQUE/);
  rejects(() => repo.addMembership({ ...member("lineage", two, 1), runId: one.runId }), /FOREIGN KEY/);
  assert.equal(repo.listMemberships(two.matchId).length, 0); repo.close();
});

test("match and workload row-version CAS reject stale writers", () => {
  const repo = repository(":memory:"); const value = match("cas"); repo.createMatch(value);
  const ready = repo.updateMatch(value.matchId, (current) => ({ ...current, state: "READY" }), 0);
  assert.equal(ready.state, "READY");
  assert.equal(repo.updateMatch(value.matchId, (current) => ({ ...current, state: "ACTIVE" }), 0), null);
  const context = workload("cas", value); repo.putWorkloadContext(context);
  assert.equal(repo.updateWorkloadContext(context.workloadRunHandle, (current) => ({ ...current, state: "READY" }), 0).state, "READY");
  assert.equal(repo.updateWorkloadContext(context.workloadRunHandle, (current) => ({ ...current, state: "ACTIVE" }), 0), null);
  repo.close();
});

test("admission replay is idempotent and cross-match admission is rejected", () => {
  const repo = repository(":memory:"); const one = match("admit-one"); const two = match("admit-two");
  repo.createMatch(one); repo.createMatch(two); const joined = member("admit", one, 0); repo.addMembership(joined);
  assert.equal(repo.markMembershipAdmitted(one.matchId, joined.runMembershipId, 200).admittedAt, 200);
  assert.equal(repo.markMembershipAdmitted(one.matchId, joined.runMembershipId, 999).admittedAt, 200);
  assert.equal(repo.markMembershipAdmitted(two.matchId, joined.runMembershipId, 300), null);
  rejects(() => repo.db.prepare("UPDATE hprod_memberships SET admitted_at=NULL WHERE membership_id=?")
    .run(joined.membershipId), /admitted membership immutable/);
  rejects(() => repo.db.prepare("DELETE FROM hprod_memberships WHERE membership_id=?")
    .run(joined.membershipId), /admitted membership immutable/);
  repo.close();
});

test("workload context binds exact match run lease epoch and credential lineage", () => {
  const repo = repository(":memory:"); const value = match("workload"); repo.createMatch(value);
  const context = workload("bound", value, 7); repo.putWorkloadContext(context);
  rejects(() => repo.putWorkloadContext({ ...workload("duplicate", value, 7), authorityLeaseId: context.authorityLeaseId }), /UNIQUE/);
  rejects(() => repo.updateWorkloadContext(context.workloadRunHandle,
    (current) => ({ ...current, credentialBinding: "attacker-binding" })), /lineage immutable/);
  assert.deepEqual(repo.getWorkloadContext(context.workloadRunHandle), context); repo.close();
});

test("transaction rollback leaves no partial rows and foreign keys remain clean", () => {
  const repo = repository(":memory:"); const value = match("rollback");
  rejects(() => repo.transaction((tx) => {
    tx.createMatch(value); tx.addMembership(member("rollback-owner", value, 0)); throw new Error("inject rollback");
  }), /inject rollback/);
  assert.equal(repo.getMatch(value.matchId), null); assert.deepEqual(repo.db.prepare("PRAGMA foreign_key_check").all(), []);
  assert.equal(repo.db.prepare("PRAGMA integrity_check").get().integrity_check, "ok"); repo.close();
});

(async () => {
  for (const entry of tests) {
    try { await entry.fn(); passed += 1; process.stdout.write(`ok ${passed} - ${entry.name}\n`); }
    catch (error) { process.stderr.write(`not ok - ${entry.name}\n${error.stack}\n`); process.exitCode = 1; break; }
  }
  process.stdout.write(`${passed}/${tests.length} sqlite hosted product repository checks passed\n`);
})();
