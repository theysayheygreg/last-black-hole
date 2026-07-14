"use strict";

const assert = require("node:assert/strict");
const { HostedIdentityService, HostedIdentityPublicError } = require("../scripts/hosted-identity-service.cjs");
const { InMemoryHostedIdentityRepository } = require("../scripts/hosted-identity-repository.cjs");

function harness() {
  let now = 1_700_000_000_000;
  let sequence = 0;
  let randomIdHook;
  const proofs = new Map();
  const diagnostics = [];
  const provider = {
    outage: false,
    verifyGrant({ proof, expected }) {
      if (this.outage) throw new Error("offline");
      this.lastExpected = expected;
      const record = proofs.get(proof);
      if (!record) return null;
      const result = { ...record };
      delete result.ambiguous;
      if (record.ambiguous) result.secondSubject = "other";
      return result;
    },
  };
  const repository = new InMemoryHostedIdentityRepository();
  const crypto = {
    randomId(prefix) {
      sequence += 1;
      if (randomIdHook) randomIdHook(prefix);
      return `${prefix}_${String(sequence).padStart(6, "0")}`;
    },
    randomToken() { sequence += 1; return `token_${String(sequence).padStart(58, "x")}`; },
    hash(value) { return require("node:crypto").createHash("sha256").update(value).digest("hex"); },
  };
  const service = new HostedIdentityService({
    repository,
    providers: {
      test: { adapter: provider, issuer: "test-issuer", audience: "lbh-client", appId: "lbh", grantType: "base_game" },
      test2: { adapter: provider, issuer: "test-issuer", audience: "lbh-client", appId: "lbh", grantType: "base_game" },
    },
    clock: { now: () => now },
    crypto,
    diagnostics: (event) => diagnostics.push(event),
    diagnosticKey: "test-diagnostic-key-at-least-32-bytes",
    accessTtlMs: 10_000,
    refreshTtlMs: 100_000,
  });
  const addProof = (proof, subject, state = "active", observationVersion = 1, overrides = {}) => proofs.set(proof, {
    subject,
    issuer: "test-issuer",
    audience: "lbh-client",
    appId: "lbh",
    grantType: "base_game",
    providerGrantId: `grant-${subject}`,
    state,
    observationVersion,
    observedAt: now + observationVersion,
    ...overrides,
  });
  const exchange = (proof, callbackId = `callback-${proof}`) => service.exchangeProviderProof({
    provider: "test", proof, callbackId,
  });
  return {
    service, repository, provider, proofs, diagnostics, addProof, exchange,
    advance: (milliseconds) => { now += milliseconds; },
    setRandomIdHook: (hook) => { randomIdHook = hook; },
  };
}

function rejected(operation) {
  assert.throws(operation, (error) => {
    assert(error instanceof HostedIdentityPublicError);
    assert.equal(error.code, "IDENTITY_REJECTED");
    assert.equal(error.message, "identity request rejected");
    assert.equal(Object.hasOwn(error, "reason"), false);
    return true;
  });
}

const tests = [];
function test(name, operation) { tests.push({ name, operation }); }

test("provider exchange creates opaque internal ids and separate entitlement", () => {
  const h = harness();
  h.addProof("proof-a", "provider-subject-7656119");
  const session = h.exchange("proof-a");
  assert.match(session.accountId, /^account_/);
  assert.notEqual(session.accountId, "provider-subject-7656119");
  assert.equal(JSON.stringify(session).includes("provider-subject"), false);
  const identity = h.repository.getIdentity("test", "provider-subject-7656119");
  assert.equal(identity.accountId, session.accountId);
  const entitlement = h.repository.getEntitlement(session.accountId, "test", "lbh", "base_game");
  assert.equal(entitlement.state, "active");
  assert.notEqual(entitlement.entitlementId, session.accountId);
  assert.deepEqual(h.provider.lastExpected, {
    issuer: "test-issuer", audience: "lbh-client", appId: "lbh", grantType: "base_game",
  });
  assert.equal(Object.isFrozen(h.provider.lastExpected), true);
});

test("exchange callback and proof are durable one-shot consumptions", () => {
  const h = harness();
  h.addProof("proof-a", "subject-a");
  const first = h.exchange("proof-a", "callback-a");
  rejected(() => h.exchange("proof-a", "callback-a"));
  rejected(() => h.exchange("proof-a", "different-callback"));
  h.addProof("different-proof", "subject-a", "active", 2);
  rejected(() => h.exchange("different-proof", "callback-a"));
  assert.equal(h.repository.refreshFamilies.size, 1);
  assert.equal(h.repository.exchangeProofs.size, 1);
  assert.equal([...h.repository.refreshFamilies.values()][0].accountId, first.accountId);
  const durableRecords = JSON.stringify([
    ...h.repository.callbacks.values(), ...h.repository.exchangeProofs.values(),
    ...h.repository.accessSessions.values(), ...h.repository.refreshTokens.values(),
  ]);
  assert.equal(durableRecords.includes(first.accessToken), false);
  assert.equal(durableRecords.includes(first.refreshToken), false);
});

test("an interleaved exchange replay observes the durable claim before family issuance", () => {
  const h = harness();
  h.addProof("proof-a", "subject-a");
  let interleaved = false;
  h.setRandomIdHook((prefix) => {
    if (prefix !== "refresh_family" || interleaved) return;
    interleaved = true;
    rejected(() => h.exchange("proof-a", "concurrent-callback"));
  });
  h.exchange("proof-a", "winning-callback");
  assert.equal(interleaved, true);
  assert.equal(h.repository.exchangeProofs.size, 1);
  assert.equal(h.repository.refreshFamilies.size, 1);
});

test("provider linking is idempotent without minting a family", () => {
  const h = harness();
  h.addProof("proof-a", "subject-a");
  h.addProof("proof-b", "subject-b", "active", 2);
  const first = h.exchange("proof-a", "callback-a");
  const linkOne = h.service.linkProvider({
    accessToken: first.accessToken, provider: "test2", proof: "proof-b", callbackId: "callback-b",
  });
  const linkTwo = h.service.linkProvider({
    accessToken: first.accessToken, provider: "test2", proof: "proof-b", callbackId: "callback-b",
  });
  assert.deepEqual(linkOne, linkTwo);
  assert.equal(h.repository.getIdentity("test2", "subject-b").accountId, first.accountId);
});

test("account-link collision fails closed without moving identity", () => {
  const h = harness();
  h.addProof("proof-a", "subject-a");
  h.addProof("proof-b", "subject-b", "active", 2);
  const a = h.exchange("proof-a");
  const b = h.exchange("proof-b");
  rejected(() => h.service.linkProvider({
    accessToken: a.accessToken, provider: "test", proof: "proof-b", callbackId: "collision-link",
  }));
  assert.equal(h.repository.getIdentity("test", "subject-b").accountId, b.accountId);
  assert.notEqual(a.accountId, b.accountId);
});

test("refresh rotates and replay revokes the entire family", () => {
  const h = harness();
  h.addProof("proof-a", "subject-a");
  const first = h.exchange("proof-a");
  const second = h.service.refresh({ refreshToken: first.refreshToken });
  assert.notEqual(second.refreshToken, first.refreshToken);
  rejected(() => h.service.refresh({ refreshToken: first.refreshToken }));
  rejected(() => h.service.refresh({ refreshToken: second.refreshToken }));
  rejected(() => h.service.createProfile({ accessToken: second.accessToken, displayName: "Fenced" }));
  const family = [...h.repository.refreshFamilies.values()][0];
  assert.equal(family.state, "revoked");
  assert.equal(family.revokeReason, "refresh_reuse");
});

test("revoked and refunded entitlement immediately fail authorization", () => {
  for (const state of ["revoked", "refunded"]) {
    const h = harness();
    h.addProof("proof-a", "subject-a");
    const session = h.exchange("proof-a");
    const entitlement = h.repository.getEntitlement(session.accountId, "test", "lbh", "base_game");
    h.repository.putEntitlement({
      ...entitlement,
      state,
      observedAt: 1_700_000_000_001,
    });
    rejected(() => h.service.createProfile({ accessToken: session.accessToken, displayName: "No Grant" }));
    rejected(() => h.service.refresh({ refreshToken: session.refreshToken }));
  }
});

test("provider reconciliation persists revoke/refund and fences every scoped family", () => {
  for (const state of ["revoked", "refunded"]) {
    const h = harness();
    h.addProof("proof-a", "subject-a", "active", 1);
    h.addProof("proof-b", "subject-a", "active", 2);
    const first = h.exchange("proof-a", "sign-in-a");
    const second = h.exchange("proof-b", "sign-in-b");
    h.addProof("terminal-proof", "subject-a", state, 3);
    const observation = {
      provider: "test", proof: "terminal-proof", callbackId: `provider-${state}`,
    };
    assert.deepEqual(h.service.reconcileEntitlement(observation), { reconciled: true, state });
    assert.deepEqual(h.service.reconcileEntitlement(observation), { reconciled: true, state });
    assert.equal(h.repository.getEntitlement(first.accountId, "test", "lbh", "base_game").state, state);
    assert.equal([...h.repository.refreshFamilies.values()].every((family) => family.state === "revoked"), true);
    assert.equal([...h.repository.accessSessions.values()].every((session) => session.revokedAt), true);
    rejected(() => h.service.createProfile({ accessToken: first.accessToken, displayName: "Revoked" }));
    rejected(() => h.service.createProfile({ accessToken: second.accessToken, displayName: "Refunded" }));
    rejected(() => h.service.refresh({ refreshToken: first.refreshToken }));
    rejected(() => h.service.refresh({ refreshToken: second.refreshToken }));
  }
});

test("provider reconciliation never creates an account for an unknown identity", () => {
  const h = harness();
  h.addProof("unknown-proof", "never-linked-subject", "refunded");
  rejected(() => h.service.reconcileEntitlement({
    provider: "test", proof: "unknown-proof", callbackId: "unknown-callback",
  }));
  assert.equal(h.repository.accounts.size, 0);
  assert.equal(h.repository.identities.size, 0);
  assert.equal(h.repository.entitlements.size, 0);
});

test("entitlement absence and non-active provider observation fail closed", () => {
  const h = harness();
  h.addProof("revoked-proof", "subject-r", "revoked");
  rejected(() => h.exchange("revoked-proof"));
  rejected(() => h.exchange("missing-proof"));
  assert.equal(h.repository.accounts.size, 0);
});

test("provider assertion binding rejects every trusted-configuration mismatch", () => {
  for (const [field, value] of [
    ["issuer", "evil-issuer"],
    ["audience", "other-client"],
    ["appId", "other-game"],
    ["grantType", "friend-pass"],
  ]) {
    const h = harness();
    h.addProof("mismatch", "subject-a", "active", 1, { [field]: value });
    rejected(() => h.exchange("mismatch"));
    assert.equal(h.repository.accounts.size, 0);
    assert.equal(h.repository.refreshFamilies.size, 0);
  }
});

test("monotonic observations reject stale time/version and terminal reactivation", () => {
  const h = harness();
  h.addProof("active-v2", "subject-a", "active", 2);
  const session = h.exchange("active-v2");
  const initial = h.repository.getEntitlement(session.accountId, "test", "lbh", "base_game");

  h.addProof("active-v1", "subject-a", "active", 1);
  rejected(() => h.exchange("active-v1", "stale-version"));
  h.addProof("active-v3-old-time", "subject-a", "active", 3, { observedAt: initial.providerObservedAt });
  rejected(() => h.exchange("active-v3-old-time", "stale-time"));
  h.addProof("other-grant-v3", "subject-a", "active", 3, { providerGrantId: "different-grant" });
  rejected(() => h.exchange("other-grant-v3", "grant-collision"));
  assert.equal(h.repository.refreshFamilies.size, 1);

  h.addProof("revoked-v3", "subject-a", "revoked", 3);
  assert.equal(h.service.reconcileEntitlement({
    provider: "test", proof: "revoked-v3", callbackId: "revoke-v3",
  }).state, "revoked");
  h.addProof("active-v4", "subject-a", "active", 4);
  rejected(() => h.exchange("active-v4", "reactivate-v4"));
  h.addProof("refunded-v4", "subject-a", "refunded", 4);
  rejected(() => h.service.reconcileEntitlement({
    provider: "test", proof: "refunded-v4", callbackId: "change-terminal-state",
  }));
  const terminal = h.repository.getEntitlement(session.accountId, "test", "lbh", "base_game");
  assert.equal(terminal.state, "revoked");
  assert.equal(terminal.observationVersion, 3);
  assert.equal(h.repository.refreshFamilies.size, 1);
  assert.equal([...h.repository.refreshFamilies.values()][0].state, "revoked");
});

test("profile authorization is owner-only", () => {
  const h = harness();
  h.addProof("proof-a", "subject-a");
  h.addProof("proof-b", "subject-b");
  const a = h.exchange("proof-a");
  const b = h.exchange("proof-b");
  const profile = h.service.createProfile({ accessToken: a.accessToken, displayName: "Owner" });
  assert.match(profile.profileId, /^profile_/);
  assert.equal(h.service.authorizeProfile({ accessToken: a.accessToken, profileId: profile.profileId }).authorized, true);
  rejected(() => h.service.authorizeProfile({ accessToken: b.accessToken, profileId: profile.profileId }));
});

test("access and refresh expiry use the injected clock", () => {
  const h = harness();
  h.addProof("proof-a", "subject-a");
  const accessExpired = h.exchange("proof-a");
  h.advance(10_001);
  rejected(() => h.service.createProfile({ accessToken: accessExpired.accessToken, displayName: "Late" }));
  h.addProof("fresh-proof", "subject-a", "active", 2);
  const fresh = h.exchange("fresh-proof", "fresh-callback");
  h.advance(100_001);
  rejected(() => h.service.refresh({ refreshToken: fresh.refreshToken }));
});

test("malformed and smuggled fields receive one generic error", () => {
  const h = harness();
  h.addProof("proof-a", "subject-a");
  const valid = {
    provider: "test", proof: "proof-a", callbackId: "callback-a",
  };
  rejected(() => h.service.exchangeProviderProof({ ...valid, accountId: "caller-selected" }));
  rejected(() => h.service.exchangeProviderProof({ ...valid, deviceFingerprint: "hardware-hash" }));
  rejected(() => h.service.exchangeProviderProof({ ...valid, audience: "caller-selected" }));
  rejected(() => h.service.exchangeProviderProof({ ...valid, appId: "caller-selected" }));
  rejected(() => h.service.exchangeProviderProof({ ...valid, provider: "../test" }));
  rejected(() => h.service.exchangeProviderProof(Object.assign(Object.create({}), valid)));
  rejected(() => h.service.exchangeProviderProof({ ...valid, proof: "x".repeat(4097) }));
  assert.equal(h.repository.accounts.size, 0);
});

test("provider ambiguity and outage fail closed", () => {
  const h = harness();
  h.addProof("proof-a", "subject-a");
  h.proofs.get("proof-a").ambiguous = true;
  rejected(() => h.exchange("proof-a"));
  h.proofs.get("proof-a").ambiguous = false;
  h.provider.outage = true;
  rejected(() => h.exchange("proof-a", "outage-callback"));
  assert.equal(h.repository.accounts.size, 0);
});

test("diagnostics are pseudonymous and contain no provider subjects or secrets", () => {
  const h = harness();
  h.addProof("proof-a", "very-secret-provider-subject");
  h.addProof("proof-b", "other-secret-subject");
  const a = h.exchange("proof-a");
  h.exchange("proof-b");
  rejected(() => h.service.linkProvider({
    accessToken: a.accessToken, provider: "test", proof: "proof-b", callbackId: "collision",
  }));
  const serialized = JSON.stringify(h.diagnostics);
  assert.equal(serialized.includes("very-secret-provider-subject"), false);
  assert.equal(serialized.includes("other-secret-subject"), false);
  assert.equal(serialized.includes(a.accessToken), false);
  assert.match(h.diagnostics.at(-1).accountAlias, /^account_/);
  assert.deepEqual(Object.keys(h.diagnostics.at(-1)).sort(), ["accountAlias", "event", "outcome", "reason"]);
});

test("identity service never models seat counts or eight-player admission", () => {
  const source = require("node:fs").readFileSync(require.resolve("../scripts/hosted-identity-service.cjs"), "utf8");
  assert.equal(/seatCount|maxPlayers|eightPlayer|playerCap/.test(source), false);
});

test("diagnostics require a strong key or an injected aliaser", () => {
  const repository = new InMemoryHostedIdentityRepository();
  const base = { repository, providers: {} };
  assert.throws(() => new HostedIdentityService(base), /diagnostic key required/);
  assert.throws(() => new HostedIdentityService({ ...base, diagnosticKey: "short" }), /diagnostic key required/);
  assert.throws(() => new HostedIdentityService({
    ...base, diagnosticKey: "x".repeat(32), diagnosticsAliaser: "not-a-function",
  }), /aliaser invalid/);
  const service = new HostedIdentityService({
    ...base,
    diagnosticsAliaser: (kind, value) => `${kind}_${value.length}`,
  });
  assert(service instanceof HostedIdentityService);
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
process.stdout.write(`${passed}/${tests.length} hosted identity tests passed\n`);
if (passed !== tests.length) process.exitCode = 1;
