"use strict";

const nodeCrypto = require("node:crypto");
const {
  assertPlainData,
  assertExactKeys,
  diagnosticAlias,
} = require("./hosted-boundary.cjs");

const ENTITLEMENT_STATES = Object.freeze(["active", "revoked", "refunded"]);
const DEFAULT_ACCESS_TTL_MS = 10 * 60 * 1000;
const DEFAULT_REFRESH_TTL_MS = 30 * 24 * 60 * 60 * 1000;

class HostedIdentityPublicError extends Error {
  constructor() {
    super("identity request rejected");
    this.name = "HostedIdentityPublicError";
    this.code = "IDENTITY_REJECTED";
  }
}

class InternalIdentityError extends Error {
  constructor(reason, context = {}) {
    super(reason);
    this.reason = reason;
    this.context = context;
  }
}

function fail(reason, context) {
  throw new InternalIdentityError(reason, context);
}

function strictRecord(value, allowed, required = allowed) {
  try {
    assertPlainData(value, { maxDepth: 4, maxNodes: 64, maxStringBytes: 4096, maxArrayLength: 4, maxObjectKeys: 12 });
    assertExactKeys(value, allowed, required);
  } catch {
    fail("malformed_input");
  }
  return value;
}

function boundedString(value, name, { min = 1, max = 256, pattern } = {}) {
  if (typeof value !== "string" || value.length < min || value.length > max || value.trim() !== value) {
    fail("malformed_input", { field: name });
  }
  if (pattern && !pattern.test(value)) fail("malformed_input", { field: name });
  return value;
}

function defaultCryptoAdapter() {
  return {
    randomId(prefix) {
      return `${prefix}_${nodeCrypto.randomBytes(18).toString("base64url")}`;
    },
    randomToken() {
      return nodeCrypto.randomBytes(32).toString("base64url");
    },
    hash(value) {
      return nodeCrypto.createHash("sha256").update(value, "utf8").digest("base64url");
    },
  };
}

class HostedIdentityService {
  constructor({
    repository,
    providers,
    clock = { now: () => Date.now() },
    crypto = defaultCryptoAdapter(),
    diagnostics = () => {},
    diagnosticKey,
    diagnosticsAliaser,
    accessTtlMs = DEFAULT_ACCESS_TTL_MS,
    refreshTtlMs = DEFAULT_REFRESH_TTL_MS,
  }) {
    if (!repository || !providers || typeof providers !== "object") throw new TypeError("identity dependencies required");
    if (!clock || typeof clock.now !== "function" || !crypto || typeof crypto.randomId !== "function" ||
        typeof crypto.randomToken !== "function" || typeof crypto.hash !== "function") {
      throw new TypeError("identity adapters invalid");
    }
    if (!Number.isSafeInteger(accessTtlMs) || accessTtlMs < 1000 ||
        !Number.isSafeInteger(refreshTtlMs) || refreshTtlMs <= accessTtlMs) {
      throw new TypeError("identity ttl invalid");
    }
    this.repository = repository;
    this.providers = providers;
    this.clock = clock;
    this.crypto = crypto;
    this.diagnostics = diagnostics;
    if (diagnosticsAliaser !== undefined && typeof diagnosticsAliaser !== "function") {
      throw new TypeError("identity diagnostics aliaser invalid");
    }
    if (!diagnosticsAliaser && (typeof diagnosticKey !== "string" ||
        Buffer.byteLength(diagnosticKey, "utf8") < 32 || Buffer.byteLength(diagnosticKey, "utf8") > 512)) {
      throw new TypeError("identity diagnostic key required");
    }
    this.diagnosticKey = diagnosticKey;
    this.diagnosticsAliaser = diagnosticsAliaser;
    this.accessTtlMs = accessTtlMs;
    this.refreshTtlMs = refreshTtlMs;
  }

  exchangeProviderProof(input) {
    return this._public("provider_exchange", () => {
      strictRecord(input, ["provider", "proof", "callbackId"]);
      const provider = this._provider(input.provider);
      const proof = boundedString(input.proof, "proof", { max: 4096 });
      const callbackId = boundedString(input.callbackId, "callbackId", { max: 256 });
      const verified = this._verifyProvider(provider, proof);
      return this.repository.transaction((repo) => {
        if (repo.getCallback(input.provider, callbackId) || repo.getExchangeProof(input.provider, verified.proofUseHash)) {
          fail("exchange_replay");
        }
        const accountId = this._upsertIdentity(repo, input.provider, verified.subject);
        const entitlement = this._applyObservation(repo, accountId, input.provider, verified);
        if (entitlement.state !== "active") fail("entitlement_absent", { accountId });
        repo.putCallback({
          provider: input.provider, callbackId, accountId, subjectHash: this.crypto.hash(verified.subject),
          observationHash: verified.observationHash, kind: "exchange", createdAt: this.clock.now(),
        });
        repo.putExchangeProof({
          provider: input.provider, proofUseHash: verified.proofUseHash, accountId, callbackId, consumedAt: this.clock.now(),
        });
        return this._issueFamily(repo, accountId, provider.scope);
      });
    });
  }

  linkProvider(input) {
    return this._public("provider_link", () => {
      strictRecord(input, ["accessToken", "provider", "proof", "callbackId"]);
      const principal = this._authenticate(input.accessToken);
      const provider = this._provider(input.provider);
      const proof = boundedString(input.proof, "proof", { max: 4096 });
      const callbackId = boundedString(input.callbackId, "callbackId", { max: 256 });
      const verified = this._verifyProvider(provider, proof);
      return this.repository.transaction((repo) => {
        const existing = repo.getIdentity(input.provider, verified.subject);
        if (existing && existing.accountId !== principal.accountId) fail("identity_collision", { accountId: principal.accountId });
        const callback = repo.getCallback(input.provider, callbackId);
        if (callback && (callback.accountId !== principal.accountId || callback.subjectHash !== this.crypto.hash(verified.subject) ||
            callback.observationHash !== verified.observationHash || callback.kind !== "link")) {
          fail("callback_collision", { accountId: principal.accountId });
        }
        if (!existing) repo.putIdentity({
          identityId: this.crypto.randomId("identity"),
          provider: input.provider,
          providerSubject: verified.subject,
          accountId: principal.accountId,
          createdAt: this.clock.now(),
        });
        if (!callback) repo.putCallback({
          provider: input.provider,
          callbackId,
          accountId: principal.accountId,
          subjectHash: this.crypto.hash(verified.subject),
          observationHash: verified.observationHash,
          kind: "link",
          createdAt: this.clock.now(),
        });
        this._applyObservation(repo, principal.accountId, input.provider, verified);
        return { accountId: principal.accountId, linked: true };
      });
    });
  }

  reconcileEntitlement(input) {
    return this._public("entitlement_reconcile", () => {
      strictRecord(input, ["provider", "proof", "callbackId"]);
      const provider = this._provider(input.provider);
      const proof = boundedString(input.proof, "proof", { max: 4096 });
      const callbackId = boundedString(input.callbackId, "callbackId", { max: 256 });
      const verified = this._verifyProvider(provider, proof, { requireActive: false });
      return this.repository.transaction((repo) => {
        const identity = repo.getIdentity(input.provider, verified.subject);
        if (!identity) fail("identity_unknown");
        const subjectHash = this.crypto.hash(verified.subject);
        const callback = repo.getCallback(input.provider, callbackId);
        if (callback && (callback.accountId !== identity.accountId || callback.subjectHash !== subjectHash ||
            callback.observationHash !== verified.observationHash || callback.kind !== "reconcile")) {
          fail("callback_collision", { accountId: identity.accountId });
        }
        if (!callback) repo.putCallback({
          provider: input.provider,
          callbackId,
          accountId: identity.accountId,
          subjectHash,
          observationHash: verified.observationHash,
          kind: "reconcile",
          createdAt: this.clock.now(),
        });
        const entitlement = this._applyObservation(repo, identity.accountId, input.provider, verified);
        if (entitlement.state !== "active") {
          repo.revokeFamiliesForEntitlement(
            identity.accountId,
            provider.scope,
            this.clock.now(),
            `entitlement_${entitlement.state}`,
          );
        }
        return { reconciled: true, state: entitlement.state };
      });
    });
  }

  refresh(input) {
    return this._public("refresh", () => {
      strictRecord(input, ["refreshToken"]);
      const raw = boundedString(input.refreshToken, "refreshToken", { min: 32, max: 512 });
      const hash = this.crypto.hash(raw);
      const outcome = this.repository.transaction((repo) => {
        const token = repo.getRefreshToken(hash);
        if (!token) fail("refresh_invalid");
        const now = this.clock.now();
        const family = repo.getRefreshFamily(token.familyId);
        if (token.state !== "active") {
          repo.revokeFamily(token.familyId, now, "refresh_reuse");
          return { rejected: "refresh_reuse", accountId: token.accountId };
        }
        if (!family || family.state !== "active" || token.expiresAt <= now) {
          if (family) repo.revokeFamily(token.familyId, now, "refresh_expired");
          return { rejected: "refresh_invalid", accountId: token.accountId };
        }
        this._assertEntitled(repo, token.accountId, family.scope);
        repo.putRefreshToken({ ...token, state: "used", usedAt: now });
        return this._rotateFamily(repo, family, token.generation + 1);
      });
      if (outcome.rejected) fail(outcome.rejected, { accountId: outcome.accountId });
      return outcome;
    });
  }

  createProfile(input) {
    return this._public("profile_create", () => {
      strictRecord(input, ["accessToken", "displayName"]);
      const principal = this._authenticate(input.accessToken);
      const displayName = boundedString(input.displayName, "displayName", { max: 40 });
      const profile = {
        profileId: this.crypto.randomId("profile"),
        accountId: principal.accountId,
        displayName,
        state: "active",
        createdAt: this.clock.now(),
      };
      this.repository.transaction((repo) => repo.putProfile(profile));
      return { profileId: profile.profileId, displayName };
    });
  }

  authorizeProfile(input) {
    return this._public("profile_authorize", () => {
      strictRecord(input, ["accessToken", "profileId"]);
      const principal = this._authenticate(input.accessToken);
      const profileId = boundedString(input.profileId, "profileId", { max: 160 });
      const profile = this.repository.getProfile(profileId);
      if (!profile || profile.state !== "active" || profile.accountId !== principal.accountId) {
        fail("profile_forbidden", { accountId: principal.accountId });
      }
      return { accountId: principal.accountId, profileId: profile.profileId, authorized: true };
    });
  }

  _provider(name) {
    boundedString(name, "provider", { max: 80, pattern: /^[a-z0-9_-]+$/ });
    const config = this.providers[name];
    if (!config || typeof config !== "object" || !config.adapter || typeof config.adapter.verifyGrant !== "function") {
      fail("provider_unavailable");
    }
    try {
      const prototype = Object.getPrototypeOf(config);
      const keys = Object.keys(config).sort();
      if ((prototype !== Object.prototype && prototype !== null) ||
          JSON.stringify(keys) !== JSON.stringify(["adapter", "appId", "audience", "grantType", "issuer"])) {
        fail("provider_unavailable");
      }
      return {
        adapter: config.adapter,
        issuer: boundedString(config.issuer, "issuer", { max: 160 }),
        scope: {
          provider: name,
          audience: boundedString(config.audience, "audience", { max: 160 }),
          appId: boundedString(config.appId, "appId", { max: 160 }),
          grantType: boundedString(config.grantType, "grantType", { max: 80 }),
        },
      };
    } catch {
      fail("provider_unavailable");
    }
  }

  _verifyProvider(provider, proof, { requireActive = true } = {}) {
    let observation;
    try {
      observation = provider.adapter.verifyGrant({
        proof,
        expected: Object.freeze({
          issuer: provider.issuer,
          audience: provider.scope.audience,
          appId: provider.scope.appId,
          grantType: provider.scope.grantType,
        }),
      });
    } catch {
      fail("provider_unavailable");
    }
    try {
      strictRecord(observation, [
        "subject", "issuer", "audience", "appId", "grantType", "providerGrantId", "state",
        "observationVersion", "observedAt",
      ]);
    } catch {
      fail("provider_ambiguous");
    }
    const verified = {
      subject: boundedString(observation.subject, "subject", { max: 512 }),
      issuer: boundedString(observation.issuer, "issuer", { max: 160 }),
      audience: boundedString(observation.audience, "audience", { max: 160 }),
      appId: boundedString(observation.appId, "appId", { max: 160 }),
      grantType: boundedString(observation.grantType, "grantType", { max: 80 }),
      providerGrantId: boundedString(observation.providerGrantId, "providerGrantId", { max: 512 }),
      state: observation.state,
      observationVersion: observation.observationVersion,
      observedAt: observation.observedAt,
    };
    if (verified.issuer !== provider.issuer || verified.audience !== provider.scope.audience ||
        verified.appId !== provider.scope.appId || verified.grantType !== provider.scope.grantType) {
      fail("provider_binding_mismatch");
    }
    if (!ENTITLEMENT_STATES.includes(verified.state)) fail("entitlement_absent");
    if (requireActive && verified.state !== "active") fail("entitlement_absent");
    if (!Number.isSafeInteger(verified.observationVersion) || verified.observationVersion < 1 ||
        !Number.isSafeInteger(verified.observedAt) || verified.observedAt < 0) {
      fail("provider_ambiguous");
    }
    verified.observationHash = this.crypto.hash([
      verified.subject, verified.issuer, verified.audience, verified.appId, verified.grantType,
      verified.providerGrantId, verified.state, String(verified.observationVersion), String(verified.observedAt),
    ].join("\u0000"));
    verified.proofUseHash = this.crypto.hash([
      verified.subject, verified.issuer, verified.providerGrantId, String(verified.observationVersion),
    ].join("\u0000"));
    return verified;
  }

  _upsertIdentity(repo, provider, subject) {
    const existing = repo.getIdentity(provider, subject);
    if (existing) return existing.accountId;
    const accountId = this.crypto.randomId("account");
    repo.putAccount({ accountId, state: "active", createdAt: this.clock.now() });
    repo.putIdentity({
      identityId: this.crypto.randomId("identity"), provider, providerSubject: subject, accountId, createdAt: this.clock.now(),
    });
    return accountId;
  }

  _applyObservation(repo, accountId, provider, observation) {
    const existing = repo.getEntitlement(accountId, provider, observation.appId, observation.grantType);
    if (existing) {
      if (existing.providerGrantHash !== this.crypto.hash(observation.providerGrantId)) {
        fail("entitlement_grant_collision", { accountId });
      }
      if (existing.state !== "active" && observation.state !== existing.state) {
        fail("entitlement_terminal", { accountId });
      }
      if (observation.observationVersion < existing.observationVersion) {
        fail("entitlement_stale", { accountId });
      }
      if (observation.observationVersion === existing.observationVersion &&
          observation.observationHash !== existing.observationHash) {
        fail("entitlement_conflict", { accountId });
      }
      if (observation.observationVersion === existing.observationVersion) return existing;
      if (observation.observedAt <= existing.providerObservedAt) {
        fail("entitlement_stale", { accountId });
      }
    }
    const record = {
      entitlementId: existing?.entitlementId || this.crypto.randomId("entitlement"),
      accountId, provider, appId: observation.appId, grantType: observation.grantType,
      issuer: observation.issuer,
      audience: observation.audience,
      providerGrantHash: this.crypto.hash(observation.providerGrantId),
      state: observation.state,
      observationVersion: observation.observationVersion,
      providerObservedAt: observation.observedAt,
      observationHash: observation.observationHash,
      recordedAt: this.clock.now(),
    };
    repo.putEntitlement(record);
    return record;
  }

  _issueFamily(repo, accountId, scope) {
    const family = {
      familyId: this.crypto.randomId("refresh_family"), accountId, scope: { ...scope }, state: "active", createdAt: this.clock.now(),
    };
    repo.putRefreshFamily(family);
    return this._rotateFamily(repo, family, 0);
  }

  _rotateFamily(repo, family, generation) {
    const now = this.clock.now();
    const refreshToken = this.crypto.randomToken();
    const accessToken = this.crypto.randomToken();
    repo.putRefreshToken({
      tokenHash: this.crypto.hash(refreshToken), familyId: family.familyId, accountId: family.accountId,
      generation, state: "active", issuedAt: now, expiresAt: now + this.refreshTtlMs,
    });
    repo.putAccessSession({
      tokenHash: this.crypto.hash(accessToken), accessSessionId: this.crypto.randomId("access"), familyId: family.familyId,
      accountId: family.accountId, scope: { ...family.scope }, issuedAt: now, expiresAt: now + this.accessTtlMs,
    });
    return {
      accountId: family.accountId,
      accessToken,
      refreshToken,
      accessExpiresAt: now + this.accessTtlMs,
      refreshExpiresAt: now + this.refreshTtlMs,
    };
  }

  _authenticate(rawToken) {
    const token = boundedString(rawToken, "accessToken", { min: 32, max: 512 });
    const session = this.repository.getAccessSession(this.crypto.hash(token));
    const now = this.clock.now();
    if (!session || session.revokedAt || session.expiresAt <= now) fail("access_invalid", { accountId: session?.accountId });
    const family = this.repository.getRefreshFamily(session.familyId);
    if (!family || family.state !== "active") fail("access_invalid", { accountId: session.accountId });
    const account = this.repository.getAccount(session.accountId);
    if (!account || account.state !== "active") fail("access_invalid", { accountId: session.accountId });
    this._assertEntitled(this.repository, session.accountId, session.scope);
    return { accountId: session.accountId, accessSessionId: session.accessSessionId };
  }

  _assertEntitled(repo, accountId, scope) {
    const entitlement = repo.getEntitlement(accountId, scope.provider, scope.appId, scope.grantType);
    if (!entitlement || entitlement.state !== "active") fail("entitlement_absent", { accountId });
  }

  _public(event, operation) {
    try {
      return operation();
    } catch (error) {
      const internal = error instanceof InternalIdentityError ? error : new InternalIdentityError("internal_failure");
      const diagnostic = { event, outcome: "rejected", reason: internal.reason };
      if (internal.context.accountId) {
        try {
          const alias = this.diagnosticsAliaser
            ? this.diagnosticsAliaser("account", internal.context.accountId)
            : diagnosticAlias("account", internal.context.accountId, this.diagnosticKey);
          if (typeof alias === "string" && alias.length >= 1 && alias.length <= 160) diagnostic.accountAlias = alias;
        } catch {}
      }
      try { this.diagnostics(Object.freeze(diagnostic)); } catch {}
      throw new HostedIdentityPublicError();
    }
  }
}

module.exports = {
  HostedIdentityService,
  HostedIdentityPublicError,
  ENTITLEMENT_STATES,
  DEFAULT_ACCESS_TTL_MS,
  DEFAULT_REFRESH_TTL_MS,
  defaultCryptoAdapter,
};
