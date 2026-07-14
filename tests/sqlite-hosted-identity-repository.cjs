"use strict";

const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { DatabaseSync } = require("node:sqlite");
const { HostedIdentityService, HostedIdentityPublicError } = require("../scripts/hosted-identity-service.cjs");
const { SqliteHostedIdentityRepository } = require("../scripts/sqlite-hosted-identity-repository.cjs");

const LOOKUP_KEY = Buffer.from("sqlite-hosted-identity-lookup-key-v1-32-plus-bytes", "utf8");

function tempDatabase() {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "lbh-hosted-identity-"));
  return { directory, filepath: path.join(directory, "identity.sqlite") };
}

function harness(filepath, { repository } = {}) {
  let sequence = 0;
  let now = 1_800_000_000_000;
  const proofs = new Map();
  const repo = repository || new SqliteHostedIdentityRepository({ filepath, subjectLookupKey: LOOKUP_KEY });
  const provider = {
    verifyGrant({ proof }) {
      const value = proofs.get(proof);
      if (!value) return null;
      return { ...value };
    },
  };
  const cryptoAdapter = {
    randomId(prefix) { sequence += 1; return `${prefix}_${crypto.randomBytes(8).toString("hex")}_${sequence}`; },
    randomToken() { sequence += 1; return `raw-token-${sequence}-${crypto.randomBytes(32).toString("base64url")}`; },
    hash(value) { return crypto.createHash("sha256").update(value, "utf8").digest("hex"); },
  };
  const service = new HostedIdentityService({
    repository: repo,
    providers: {
      test: {
        adapter: provider, issuer: "issuer", audience: "lbh-client", appId: "lbh", grantType: "base_game",
      },
    },
    clock: { now: () => now },
    crypto: cryptoAdapter,
    diagnosticsAliaser: () => "account_test",
    accessTtlMs: 10_000,
    refreshTtlMs: 100_000,
  });
  function addProof(proof, subject, state = "active", version = 1) {
    proofs.set(proof, {
      subject, issuer: "issuer", audience: "lbh-client", appId: "lbh", grantType: "base_game",
      providerGrantId: `grant-${subject}`, state, observationVersion: version, observedAt: now + version,
    });
  }
  return { repo, service, addProof, proofs, advance(ms) { now += ms; } };
}

function isRejected(operation) {
  assert.throws(operation, (error) => error instanceof HostedIdentityPublicError && error.code === "IDENTITY_REJECTED");
}

function rows(db, table) {
  return Number(db.prepare(`SELECT count(*) AS count FROM ${table}`).get().count);
}

const tests = [];
function test(name, operation) { tests.push({ name, operation }); }

test("configuration requires one database source and a strong subject HMAC key", () => {
  assert.throws(() => new SqliteHostedIdentityRepository({ filepath: ":memory:", subjectLookupKey: "short" }), /32 bytes/);
  assert.throws(() => new SqliteHostedIdentityRepository({ subjectLookupKey: LOOKUP_KEY }), /exactly one/);
  const db = new DatabaseSync(":memory:");
  assert.throws(() => new SqliteHostedIdentityRepository({ filepath: ":memory:", db, subjectLookupKey: LOOKUP_KEY }), /exactly one/);
  db.close();
});

test("exchange, profile ownership, and token families survive close and reopen", () => {
  const { filepath } = tempDatabase();
  const first = harness(filepath);
  const subject = "provider-subject-persistent-123";
  first.addProof("proof-persistent", subject);
  const session = first.service.exchangeProviderProof({ provider: "test", proof: "proof-persistent", callbackId: "callback-1" });
  const profile = first.service.createProfile({ accessToken: session.accessToken, displayName: "Durable" });
  const identity = first.repo.getIdentity("test", subject);
  first.repo.close();

  const second = harness(filepath);
  assert.equal(second.repo.getIdentity("test", subject).accountId, session.accountId);
  assert.equal(second.repo.getIdentity("test", subject).identityId, identity.identityId);
  assert.equal(second.repo.getProfile(profile.profileId).accountId, session.accountId);
  assert.equal(second.service.authorizeProfile({ accessToken: session.accessToken, profileId: profile.profileId }).authorized, true);
  const rotated = second.service.refresh({ refreshToken: session.refreshToken });
  assert.equal(rotated.accountId, session.accountId);
  second.repo.close();
});

test("database files never contain raw provider subject, proof, or bearer tokens", () => {
  const { filepath } = tempDatabase();
  const h = harness(filepath);
  const subject = "RAW-SUBJECT-SECRET-9988776655";
  const proof = "RAW-PROOF-SECRET-1122334455";
  h.addProof(proof, subject);
  const session = h.service.exchangeProviderProof({ provider: "test", proof, callbackId: "callback-secret" });
  const callback = h.repo.getCallback("test", "callback-secret");
  assert.equal(callback.accountId, session.accountId);
  h.repo.db.exec("PRAGMA wal_checkpoint(TRUNCATE)");
  h.repo.close();
  const bytes = Buffer.concat([filepath, `${filepath}-wal`, `${filepath}-shm`]
    .filter((candidate) => fs.existsSync(candidate)).map((candidate) => fs.readFileSync(candidate)));
  for (const secret of [subject, proof, session.accessToken, session.refreshToken]) {
    assert.equal(bytes.includes(Buffer.from(secret)), false, `database leaked ${secret.slice(0, 12)}`);
  }
  assert.equal(bytes.includes(crypto.createHmac("sha256", LOOKUP_KEY).update("test\0" + subject).digest()), false,
    "binary digest form is not the configured base64url lookup representation");
});

test("two connections observe callback and proof replay claims exactly once", () => {
  const { filepath } = tempDatabase();
  const a = harness(filepath);
  const b = harness(filepath);
  a.addProof("proof-race", "subject-race");
  b.addProof("proof-race", "subject-race");
  const winner = a.service.exchangeProviderProof({ provider: "test", proof: "proof-race", callbackId: "callback-race" });
  isRejected(() => b.service.exchangeProviderProof({ provider: "test", proof: "proof-race", callbackId: "callback-race-2" }));
  assert.equal(rows(a.repo.db, "hid_refresh_families"), 1);
  assert.equal(a.repo.getIdentity("test", "subject-race").accountId, winner.accountId);
  a.repo.close();
  b.repo.close();
});

test("refresh rotation race revokes the family and every access session", () => {
  const { filepath } = tempDatabase();
  const a = harness(filepath);
  a.addProof("proof-refresh", "subject-refresh");
  const initial = a.service.exchangeProviderProof({ provider: "test", proof: "proof-refresh", callbackId: "callback-refresh" });
  const b = harness(filepath);
  const rotated = a.service.refresh({ refreshToken: initial.refreshToken });
  isRejected(() => b.service.refresh({ refreshToken: initial.refreshToken }));
  isRejected(() => a.service.refresh({ refreshToken: rotated.refreshToken }));
  isRejected(() => b.service.createProfile({ accessToken: rotated.accessToken, displayName: "Fenced" }));
  const family = a.repo.db.prepare("SELECT payload_json FROM hid_refresh_families").get();
  assert.equal(JSON.parse(family.payload_json).state, "revoked");
  assert.equal(a.repo.db.prepare("SELECT count(*) AS count FROM hid_access_sessions WHERE revoked_at IS NULL").get().count, 0);
  a.repo.close();
  b.repo.close();
});

test("entitlement-scoped revocation crosses all families but not another scope", () => {
  const { filepath } = tempDatabase();
  const h = harness(filepath);
  h.addProof("proof-one", "subject-scoped", "active", 1);
  h.addProof("proof-two", "subject-scoped", "active", 2);
  const one = h.service.exchangeProviderProof({ provider: "test", proof: "proof-one", callbackId: "callback-one" });
  const two = h.service.exchangeProviderProof({ provider: "test", proof: "proof-two", callbackId: "callback-two" });
  const accountId = one.accountId;
  h.repo.transaction((repo) => {
    repo.putRefreshFamily({
      familyId: "other-family", accountId,
      scope: { provider: "test", audience: "lbh-client", appId: "other-app", grantType: "base_game" },
      state: "active", createdAt: 1,
    });
    repo.revokeFamiliesForEntitlement(accountId,
      { provider: "test", appId: "lbh", grantType: "base_game" }, 1234, "refund");
  });
  assert.equal(h.repo.getRefreshFamily("other-family").state, "active");
  assert.equal(h.repo.db.prepare("SELECT count(*) AS count FROM hid_refresh_families WHERE state='revoked'").get().count, 2);
  isRejected(() => h.service.createProfile({ accessToken: one.accessToken, displayName: "No" }));
  isRejected(() => h.service.createProfile({ accessToken: two.accessToken, displayName: "No" }));
  h.repo.close();
});

test("entitlement trigger independently enforces terminal and monotonic observations", () => {
  const { filepath } = tempDatabase();
  const h = harness(filepath);
  h.addProof("proof-terminal", "subject-terminal");
  const session = h.service.exchangeProviderProof({ provider: "test", proof: "proof-terminal", callbackId: "callback-terminal" });
  const active = h.repo.getEntitlement(session.accountId, "test", "lbh", "base_game");
  const revoked = { ...active, state: "revoked", observationVersion: 2,
    providerObservedAt: active.providerObservedAt + 1, observationHash: "revoked-observation" };
  h.repo.putEntitlement(revoked);
  assert.throws(() => h.repo.putEntitlement({ ...revoked, state: "active", observationVersion: 3,
    providerObservedAt: revoked.providerObservedAt + 1, observationHash: "reactivation" }), /terminal/);
  assert.throws(() => h.repo.putEntitlement({ ...revoked, observationVersion: 1,
    providerObservedAt: revoked.providerObservedAt + 1, observationHash: "stale" }), /stale version/);
  assert.throws(() => h.repo.putEntitlement({ ...revoked, observationHash: "same-version-conflict" }), /conflict/);
  assert.equal(h.repo.getEntitlement(session.accountId, "test", "lbh", "base_game").state, "revoked");
  h.repo.close();
});

test("BEGIN IMMEDIATE transaction rolls back the complete identity graph on fault", () => {
  const { filepath } = tempDatabase();
  const h = harness(filepath);
  assert.throws(() => h.repo.transaction((repo) => {
    repo.putAccount({ accountId: "rollback-account", state: "active", createdAt: 1 });
    repo.putIdentity({ identityId: "rollback-identity", provider: "test", providerSubject: "rollback-subject",
      accountId: "rollback-account", createdAt: 1 });
    throw new Error("injected fault");
  }), /injected fault/);
  assert.equal(h.repo.getAccount("rollback-account"), undefined);
  assert.equal(h.repo.getIdentity("test", "rollback-subject"), undefined);
  assert.equal(h.repo.db.prepare("PRAGMA foreign_key_check").all().length, 0);
  assert.equal(h.repo.db.prepare("PRAGMA integrity_check").get().integrity_check, "ok");
  h.repo.close();
});

test("account deletion cascades profiles, identity lookup, proofs, and sessions", () => {
  const { filepath } = tempDatabase();
  const h = harness(filepath);
  h.addProof("proof-delete", "subject-delete");
  const session = h.service.exchangeProviderProof({ provider: "test", proof: "proof-delete", callbackId: "callback-delete" });
  h.service.createProfile({ accessToken: session.accessToken, displayName: "Delete" });
  assert.equal(h.repo.deleteAccount(session.accountId), true);
  assert.equal(h.repo.getAccount(session.accountId), undefined);
  assert.equal(h.repo.getIdentity("test", "subject-delete"), undefined);
  for (const table of ["hid_provider_identities", "hid_callbacks", "hid_exchange_proofs", "hid_entitlements",
    "hid_profiles", "hid_refresh_families", "hid_refresh_tokens", "hid_access_sessions"]) {
    assert.equal(rows(h.repo.db, table), 0, `${table} was not cascade-deleted`);
  }
  assert.equal(h.repo.db.prepare("PRAGMA foreign_key_check").all().length, 0);
  assert.equal(h.repo.db.prepare("PRAGMA integrity_check").get().integrity_check, "ok");
  h.repo.close();
});

let passed = 0;
for (const entry of tests) {
  try {
    entry.operation();
    passed += 1;
    process.stdout.write(`PASS ${entry.name}\n`);
  } catch (error) {
    process.stderr.write(`FAIL ${entry.name}\n${error.stack}\n`);
  }
}
process.stdout.write(`${passed}/${tests.length} sqlite hosted identity repository tests passed\n`);
if (passed !== tests.length) process.exitCode = 1;
