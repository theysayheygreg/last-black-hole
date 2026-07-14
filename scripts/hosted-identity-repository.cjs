"use strict";

function copy(value) {
  return value == null ? value : structuredClone(value);
}

function copyMap(source) {
  return new Map([...source].map(([key, value]) => [key, copy(value)]));
}

/**
 * Transactional reference repository for the hosted identity contract.
 *
 * Production adapters must provide the same synchronous transaction semantics
 * over durable storage. Provider subjects are restricted identity data and are
 * deliberately kept out of account/profile/session records.
 */
class InMemoryHostedIdentityRepository {
  constructor() {
    this.accounts = new Map();
    this.identities = new Map();
    this.callbacks = new Map();
    this.entitlements = new Map();
    this.profiles = new Map();
    this.accessSessions = new Map();
    this.refreshFamilies = new Map();
    this.refreshTokens = new Map();
  }

  transaction(operation) {
    const snapshot = {
      accounts: copyMap(this.accounts),
      identities: copyMap(this.identities),
      callbacks: copyMap(this.callbacks),
      entitlements: copyMap(this.entitlements),
      profiles: copyMap(this.profiles),
      accessSessions: copyMap(this.accessSessions),
      refreshFamilies: copyMap(this.refreshFamilies),
      refreshTokens: copyMap(this.refreshTokens),
    };
    try {
      return operation(this);
    } catch (error) {
      Object.assign(this, snapshot);
      throw error;
    }
  }

  getAccount(accountId) { return copy(this.accounts.get(accountId)); }
  putAccount(record) { this.accounts.set(record.accountId, copy(record)); }

  getIdentity(provider, providerSubject) {
    return copy(this.identities.get(`${provider}\u0000${providerSubject}`));
  }
  putIdentity(record) {
    this.identities.set(`${record.provider}\u0000${record.providerSubject}`, copy(record));
  }

  getCallback(provider, callbackId) {
    return copy(this.callbacks.get(`${provider}\u0000${callbackId}`));
  }
  putCallback(record) {
    this.callbacks.set(`${record.provider}\u0000${record.callbackId}`, copy(record));
  }

  entitlementKey(accountId, provider, appId, grantType) {
    return `${accountId}\u0000${provider}\u0000${appId}\u0000${grantType}`;
  }
  getEntitlement(accountId, provider, appId, grantType) {
    return copy(this.entitlements.get(this.entitlementKey(accountId, provider, appId, grantType)));
  }
  putEntitlement(record) {
    this.entitlements.set(
      this.entitlementKey(record.accountId, record.provider, record.appId, record.grantType),
      copy(record),
    );
  }
  listEntitlements(accountId) {
    return [...this.entitlements.values()].filter((entry) => entry.accountId === accountId).map(copy);
  }

  getProfile(profileId) { return copy(this.profiles.get(profileId)); }
  putProfile(record) { this.profiles.set(record.profileId, copy(record)); }

  getAccessSession(tokenHash) { return copy(this.accessSessions.get(tokenHash)); }
  putAccessSession(record) { this.accessSessions.set(record.tokenHash, copy(record)); }

  getRefreshFamily(familyId) { return copy(this.refreshFamilies.get(familyId)); }
  putRefreshFamily(record) { this.refreshFamilies.set(record.familyId, copy(record)); }

  getRefreshToken(tokenHash) { return copy(this.refreshTokens.get(tokenHash)); }
  putRefreshToken(record) { this.refreshTokens.set(record.tokenHash, copy(record)); }

  revokeFamily(familyId, revokedAt, reason) {
    const family = this.refreshFamilies.get(familyId);
    if (!family) return;
    this.refreshFamilies.set(familyId, { ...family, state: "revoked", revokedAt, revokeReason: reason });
    for (const [hash, token] of this.refreshTokens) {
      if (token.familyId === familyId && token.state === "active") {
        this.refreshTokens.set(hash, { ...token, state: "revoked", revokedAt });
      }
    }
  }
}

module.exports = { InMemoryHostedIdentityRepository };
