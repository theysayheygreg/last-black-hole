"use strict";

const crypto = require("crypto");
const { HostedResultError } = require("./hosted-result-outbox.cjs");

function reject(code) { throw new HostedResultError(code); }
function copy(value) { return value == null ? value : structuredClone(value); }
function stableId(prefix, ...parts) {
  return `${prefix}_${crypto.createHash("sha256").update(parts.join("\u001f")).digest("hex").slice(0, 40)}`;
}

function createEmptyState() {
  return {
    profiles: new Map(), inventory: new Map(), ledger: new Map(), runResults: new Map(),
    settlements: new Map(), settlementByRun: new Map(), settlementByResult: new Map(), quarantine: [],
  };
}

function normalizeMemberships(rows) {
  if (!Array.isArray(rows) || rows.length < 1 || rows.length > 4) reject("HOSTED_SETTLEMENT_MEMBERSHIP_MISMATCH");
  const membershipIds = new Set();
  const profileIds = new Set();
  const normalized = rows.map((row) => {
    if (!row || typeof row !== "object" || typeof row.run_membership_id !== "string"
        || !row.run_membership_id || typeof row.profile_id !== "string" || !row.profile_id
        || membershipIds.has(row.run_membership_id) || profileIds.has(row.profile_id)) {
      reject("HOSTED_SETTLEMENT_MEMBERSHIP_MISMATCH");
    }
    membershipIds.add(row.run_membership_id);
    profileIds.add(row.profile_id);
    return { run_membership_id: row.run_membership_id, profile_id: row.profile_id };
  });
  return normalized.sort((a, b) => a.run_membership_id.localeCompare(b.run_membership_id));
}

function assertExactOutcomeSet(payload, memberships) {
  const presented = Object.keys(payload?.outcomes || {}).sort();
  const admitted = memberships.map((row) => row.run_membership_id);
  if (presented.length !== admitted.length || presented.some((id, index) => id !== admitted[index])) {
    reject("HOSTED_SETTLEMENT_MEMBERSHIP_MISMATCH");
  }
}

function defaultSettlementApplier({ draft, memberships, entry, settlementId, now }) {
  const members = [];
  for (const membership of memberships) {
    const outcome = entry.payload.outcomes[membership.run_membership_id];
    const profileId = membership.profile_id;
    const current = draft.profiles.get(profileId) || { profile_id: profileId, revision: 0, balance: 0 };
    const credit = outcome.em_earned;
    const profile = { ...current, revision: current.revision + 1, balance: current.balance + credit };
    draft.profiles.set(profileId, profile);
    if (credit) {
      const ledger = {
        ledger_id: stableId("ledger", settlementId, membership.run_membership_id, "EM"), profile_id: profileId,
        run_membership_id: membership.run_membership_id, settlement_id: settlementId,
        currency: "EM", delta: credit, balance: profile.balance, created_at: now,
      };
      draft.ledger.set(ledger.ledger_id, ledger);
    }
    const cargo = Array.isArray(outcome.cargo) ? outcome.cargo : [];
    cargo.forEach((item, index) => {
      const inventory = {
        inventory_id: stableId("inventory", settlementId, membership.run_membership_id, String(index)),
        profile_id: profileId, run_membership_id: membership.run_membership_id,
        settlement_id: settlementId, item: copy(item), slot: index, created_at: now,
      };
      draft.inventory.set(inventory.inventory_id, inventory);
    });
    members.push({
      run_membership_id: membership.run_membership_id, profile_revision: profile.revision,
      outcome: outcome.outcome, em_credited: credit, inventory_count: cargo.length,
    });
  }
  return { members };
}

function acceptedLineageMatches(accepted, entry) {
  return accepted?.accepted === true && accepted.run_id === entry.run_id
    && accepted.lease_id === entry.authority.lease_id
    && accepted.lease_epoch === entry.authority.lease_epoch
    && accepted.authority_incarnation === entry.authority.authority_incarnation
    && accepted.result_hash === entry.result_hash;
}

class InMemoryHostedSettlementRepository {
  constructor({ resolveRunMemberships, verifyAcceptedAuthorityResult,
    settlementApplier = defaultSettlementApplier, now = Date.now, fault = () => {} } = {}) {
    if (typeof resolveRunMemberships !== "function") throw new TypeError("resolveRunMemberships is required");
    if (typeof verifyAcceptedAuthorityResult !== "function") throw new TypeError("verifyAcceptedAuthorityResult is required");
    if (typeof settlementApplier !== "function") throw new TypeError("settlementApplier is required");
    this.resolveRunMemberships = resolveRunMemberships;
    this.verifyAcceptedAuthorityResult = verifyAcceptedAuthorityResult;
    this.settlementApplier = settlementApplier;
    this.now = now;
    this.fault = fault;
    this.state = createEmptyState();
  }

  settle(entry) {
    if (!entry || typeof entry !== "object" || !entry.result_id || !entry.run_id || !entry.result_hash
        || !entry.idempotency_key || !entry.authority || !entry.payload) reject("HOSTED_SETTLEMENT_INVALID");
    const priorId = this.state.settlementByRun.get(entry.run_id) || this.state.settlementByResult.get(entry.result_id);
    const prior = priorId ? this.state.settlements.get(priorId) : null;

    // Durable adapters MUST perform this accepted-lineage read in the same
    // serializable transaction that inserts run result, all member economics,
    // and settlement. The acceptance row is written by the authority CAS and
    // prevents lease replacement after a terminal result is accepted.
    const accepted = this.verifyAcceptedAuthorityResult(entry);
    if (!acceptedLineageMatches(accepted, entry)) {
      if (prior && (prior.result_hash !== entry.result_hash || prior.result_id !== entry.result_id)) {
        this._quarantine(entry, prior);
        reject("HOSTED_SETTLEMENT_CONFLICT");
      }
      reject("HOSTED_SETTLEMENT_FENCED");
    }
    if (prior) {
      if (prior.result_hash !== entry.result_hash || prior.result_id !== entry.result_id || prior.run_id !== entry.run_id) {
        this._quarantine(entry, prior);
        reject("HOSTED_SETTLEMENT_CONFLICT");
      }
      return Object.freeze({ ...copy(prior.response), replayed: true });
    }

    const memberships = normalizeMemberships(this.resolveRunMemberships(entry.run_id));
    assertExactOutcomeSet(entry.payload, memberships);
    const draft = copy(this.state);
    const committedAt = this.now();
    const settlementId = stableId("settlement", entry.result_id);
    this.fault("before-result");
    draft.runResults.set(entry.result_id, {
      result_id: entry.result_id, run_id: entry.run_id, result_hash: entry.result_hash,
      authority: copy(entry.authority), payload: copy(entry.payload), status: "SETTLED", created_at: entry.accepted_at,
    });
    this.fault("after-result");
    const applied = this.settlementApplier({
      draft, memberships: copy(memberships), entry: copy(entry), settlementId, now: committedAt,
    });
    const appliedIds = Array.isArray(applied?.members)
      ? applied.members.map((row) => row?.run_membership_id).sort() : [];
    const admittedIds = memberships.map((row) => row.run_membership_id);
    if (appliedIds.length !== admittedIds.length || appliedIds.some((value, index) => value !== admittedIds[index])) {
      reject("HOSTED_SETTLEMENT_APPLIER_INCOMPLETE");
    }
    this.fault("after-apply");
    const response = Object.freeze({
      settlement_id: settlementId, result_id: entry.result_id, run_id: entry.run_id,
      result_hash: entry.result_hash, committed_at: committedAt,
      members: copy(applied.members), replayed: false,
    });
    const settlement = {
      settlement_id: settlementId, result_id: entry.result_id, run_id: entry.run_id,
      result_hash: entry.result_hash, idempotency_key: entry.idempotency_key,
      committed_at: committedAt, response,
    };
    draft.settlements.set(settlementId, settlement);
    draft.settlementByRun.set(entry.run_id, settlementId);
    draft.settlementByResult.set(entry.result_id, settlementId);
    this.fault("before-commit");
    this.state = draft;
    return response;
  }

  _quarantine(entry, prior) {
    this.state.quarantine.push({
      quarantine_id: stableId("quarantine", entry.run_id, entry.result_hash), run_id: entry.run_id,
      presented_result_id: entry.result_id, presented_hash: entry.result_hash,
      accepted_result_id: prior.result_id, accepted_hash: prior.result_hash, quarantined_at: this.now(),
    });
  }

  snapshot() { return copy(this.state); }
}

module.exports = {
  InMemoryHostedSettlementRepository, defaultSettlementApplier, createEmptyState,
  normalizeMemberships, assertExactOutcomeSet,
};
