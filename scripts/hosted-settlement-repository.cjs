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

function defaultSettlementApplier({ draft, ownership, entry, settlementId, now }) {
  const profileId = ownership.profile_id;
  const current = draft.profiles.get(profileId) || { profile_id: profileId, revision: 0, balance: 0 };
  const credit = Number.isSafeInteger(entry.payload?.em_earned) && entry.payload.em_earned >= 0 ? entry.payload.em_earned : 0;
  const profile = { ...current, revision: current.revision + 1, balance: current.balance + credit };
  draft.profiles.set(profileId, profile);
  const ledgerEntries = credit ? [{
    ledger_id: stableId("ledger", settlementId, "EM"), profile_id: profileId,
    settlement_id: settlementId, currency: "EM", delta: credit, balance: profile.balance, created_at: now,
  }] : [];
  for (const row of ledgerEntries) draft.ledger.set(row.ledger_id, row);
  const inventoryEntries = Array.isArray(entry.payload?.cargo) ? entry.payload.cargo.map((item, index) => ({
    inventory_id: stableId("inventory", settlementId, String(index)), profile_id: profileId,
    settlement_id: settlementId, item: copy(item), slot: index, created_at: now,
  })) : [];
  for (const row of inventoryEntries) draft.inventory.set(row.inventory_id, row);
  return { profile, ledgerEntries, inventoryEntries, result: copy(entry.payload) };
}

class InMemoryHostedSettlementRepository {
  constructor({ resolveRunOwnership, settlementApplier = defaultSettlementApplier, now = Date.now,
    fault = () => {} } = {}) {
    if (typeof resolveRunOwnership !== "function") throw new TypeError("resolveRunOwnership is required");
    if (typeof settlementApplier !== "function") throw new TypeError("settlementApplier is required");
    this.resolveRunOwnership = resolveRunOwnership;
    this.settlementApplier = settlementApplier;
    this.now = now;
    this.fault = fault;
    this.state = createEmptyState();
  }

  settle(entry) {
    if (!entry || typeof entry !== "object" || !entry.result_id || !entry.run_id || !entry.result_hash
        || !entry.idempotency_key || !entry.authority || !entry.payload) reject("HOSTED_SETTLEMENT_INVALID");
    const priorId = this.state.settlementByRun.get(entry.run_id) || this.state.settlementByResult.get(entry.result_id);
    if (priorId) {
      const prior = this.state.settlements.get(priorId);
      if (prior.result_hash !== entry.result_hash || prior.result_id !== entry.result_id || prior.run_id !== entry.run_id) {
        this._quarantine(entry, prior);
        reject("HOSTED_SETTLEMENT_CONFLICT");
      }
      return Object.freeze({ ...copy(prior.response), replayed: true });
    }

    const ownership = this.resolveRunOwnership(entry.run_id);
    if (!ownership || typeof ownership.profile_id !== "string" || !ownership.profile_id) reject("HOSTED_SETTLEMENT_OWNERSHIP_MISSING");
    const draft = copy(this.state);
    const committedAt = this.now();
    const settlementId = stableId("settlement", entry.result_id);
    try {
      this.fault("before-result");
      draft.runResults.set(entry.result_id, {
        result_id: entry.result_id, run_id: entry.run_id, result_hash: entry.result_hash,
        authority: copy(entry.authority), payload: copy(entry.payload), status: "SETTLED", created_at: entry.accepted_at,
      });
      this.fault("after-result");
      const applied = this.settlementApplier({ draft, ownership: copy(ownership), entry: copy(entry), settlementId, now: committedAt });
      this.fault("after-apply");
      const response = Object.freeze({
        settlement_id: settlementId, result_id: entry.result_id, run_id: entry.run_id,
        result_hash: entry.result_hash, committed_at: committedAt,
        profile_revision: applied.profile?.revision ?? null, result: copy(applied.result), replayed: false,
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
    } catch (error) {
      if (error instanceof HostedResultError) throw error;
      throw error;
    }
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

module.exports = { InMemoryHostedSettlementRepository, defaultSettlementApplier, createEmptyState };
