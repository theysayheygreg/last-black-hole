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
const LOOKUP_KEY_V2 = Buffer.from("sqlite-hosted-identity-lookup-key-v2-32-plus-bytes", "utf8");

function keyring(currentId, currentKey, previous = []) {
  return { current: { id: currentId, key: currentKey }, previous };
}

function tempDatabase() {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "lbh-hosted-identity-"));
  return { directory, filepath: path.join(directory, "identity.sqlite") };
}

function harness(filepath, { repository, subjectLookupKeyring } = {}) {
  let sequence = 0;
  let now = 1_800_000_000_000;
  const proofs = new Map();
  const repo = repository || new SqliteHostedIdentityRepository(subjectLookupKeyring
    ? { filepath, subjectLookupKeyring }
    : { filepath, subjectLookupKey: LOOKUP_KEY });
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
  assert.throws(() => new SqliteHostedIdentityRepository({
    filepath: ":memory:",
    subjectLookupKeyring: keyring("duplicate", LOOKUP_KEY, [{ id: "duplicate", key: LOOKUP_KEY_V2 }]),
  }), /ids must be unique/);
  assert.throws(() => new SqliteHostedIdentityRepository({
    filepath: ":memory:",
    subjectLookupKeyring: keyring("current", LOOKUP_KEY, [
      { id: "old-1", key: LOOKUP_KEY_V2 }, { id: "old-2", key: LOOKUP_KEY },
      { id: "old-3", key: LOOKUP_KEY_V2 }, { id: "old-4", key: LOOKUP_KEY },
    ]),
  }), /at most 3/);
  assert.throws(() => new SqliteHostedIdentityRepository({
    filepath: ":memory:", subjectLookupKeyring: keyring("bad id", LOOKUP_KEY),
  }), /key id invalid/);
});

test("key rotation dual-reads, re-HMACs, and survives close before old-key retirement", () => {
  const { filepath } = tempDatabase();
  const oldRing = keyring("subject-2026-01", LOOKUP_KEY);
  const rotatingRing = keyring("subject-2026-02", LOOKUP_KEY_V2,
    [{ id: "subject-2026-01", key: LOOKUP_KEY }]);
  const subject = "rotation-subject-secret-481516";
  const first = harness(filepath, { subjectLookupKeyring: oldRing });
  first.addProof("rotation-proof", subject);
  const session = first.service.exchangeProviderProof({
    provider: "test", proof: "rotation-proof", callbackId: "rotation-callback",
  });
  first.repo.close();

  const rotating = harness(filepath, { subjectLookupKeyring: rotatingRing });
  assert.equal(rotating.repo.getIdentity("test", subject).accountId, session.accountId);
  const migrated = rotating.repo.db.prepare(`SELECT subject_key_id,subject_lookup
    FROM hid_provider_identities`).get();
  assert.equal(migrated.subject_key_id, "subject-2026-02");
  assert.equal(migrated.subject_lookup,
    crypto.createHmac("sha256", LOOKUP_KEY_V2).update(`test\0${subject}`).digest("base64url"));
  rotating.repo.close();

  const retired = harness(filepath, {
    subjectLookupKeyring: keyring("subject-2026-02", LOOKUP_KEY_V2),
  });
  assert.equal(retired.repo.getIdentity("test", subject).accountId, session.accountId);
  retired.repo.close();
});

test("two rotated connections converge concurrent lookup and linking on one account", () => {
  const { filepath } = tempDatabase();
  const subject = "rotation-race-subject";
  const old = harness(filepath, { subjectLookupKeyring: keyring("old", LOOKUP_KEY) });
  old.addProof("proof-old", subject);
  const original = old.service.exchangeProviderProof({ provider: "test", proof: "proof-old", callbackId: "callback-old" });
  old.repo.close();

  const ring = keyring("new", LOOKUP_KEY_V2, [{ id: "old", key: LOOKUP_KEY }]);
  const a = harness(filepath, { subjectLookupKeyring: ring });
  const b = harness(filepath, { subjectLookupKeyring: ring });
  a.addProof("proof-a", subject, "active", 2);
  b.addProof("proof-b", subject, "active", 3);
  const linkedA = a.service.exchangeProviderProof({ provider: "test", proof: "proof-a", callbackId: "callback-a" });
  const linkedB = b.service.exchangeProviderProof({ provider: "test", proof: "proof-b", callbackId: "callback-b" });
  assert.equal(linkedA.accountId, original.accountId);
  assert.equal(linkedB.accountId, original.accountId);
  assert.equal(rows(a.repo.db, "hid_accounts"), 1);
  assert.equal(rows(a.repo.db, "hid_provider_identities"), 1);
  assert.equal(a.repo.db.prepare("SELECT subject_key_id FROM hid_provider_identities").get().subject_key_id, "new");
  a.repo.close();
  b.repo.close();
});

test("old-key retirement fails closed until every stored identity has migrated", () => {
  const { filepath } = tempDatabase();
  const old = harness(filepath, { subjectLookupKeyring: keyring("old", LOOKUP_KEY) });
  old.addProof("proof-unmigrated", "unmigrated-subject");
  old.service.exchangeProviderProof({ provider: "test", proof: "proof-unmigrated", callbackId: "callback-unmigrated" });
  old.repo.close();
  assert.throws(() => harness(filepath, {
    subjectLookupKeyring: keyring("new", LOOKUP_KEY_V2),
  }), /unknown subject lookup key id: old/);

  const migrating = harness(filepath, {
    subjectLookupKeyring: keyring("new", LOOKUP_KEY_V2, [{ id: "old", key: LOOKUP_KEY }]),
  });
  assert.ok(migrating.repo.getIdentity("test", "unmigrated-subject"));
  migrating.repo.close();
  const retired = harness(filepath, { subjectLookupKeyring: keyring("new", LOOKUP_KEY_V2) });
  assert.ok(retired.repo.getIdentity("test", "unmigrated-subject"));
  retired.repo.close();
});

test("rotation keeps raw subjects and key material out of sqlite files", () => {
  const { filepath } = tempDatabase();
  const subject = "RAW-ROTATED-SUBJECT-SECRET-001122";
  const old = harness(filepath, { subjectLookupKeyring: keyring("old", LOOKUP_KEY) });
  old.addProof("raw-rotation-proof", subject);
  old.service.exchangeProviderProof({ provider: "test", proof: "raw-rotation-proof", callbackId: "raw-rotation-callback" });
  old.repo.close();
  const rotated = harness(filepath, {
    subjectLookupKeyring: keyring("new", LOOKUP_KEY_V2, [{ id: "old", key: LOOKUP_KEY }]),
  });
  assert.ok(rotated.repo.getIdentity("test", subject));
  rotated.repo.db.exec("PRAGMA wal_checkpoint(TRUNCATE)");
  rotated.repo.close();
  const bytes = Buffer.concat([filepath, `${filepath}-wal`, `${filepath}-shm`]
    .filter((candidate) => fs.existsSync(candidate)).map((candidate) => fs.readFileSync(candidate)));
  for (const secret of [subject, LOOKUP_KEY, LOOKUP_KEY_V2]) {
    assert.equal(bytes.includes(Buffer.from(secret)), false, "rotation secret leaked to sqlite storage");
  }
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
