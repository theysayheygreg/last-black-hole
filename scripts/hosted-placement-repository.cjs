function clone(value) {
  return value == null ? value : structuredClone(value);
}

class InMemoryPlacementRepository {
  constructor({ tombstoneLimit = 256 } = {}) {
    if (!Number.isSafeInteger(tombstoneLimit) || tombstoneLimit < 1) throw new Error("invalid tombstone limit");
    this.tombstoneLimit = tombstoneLimit;
    this.capacities = new Map();
    this.runs = new Map();
    this.requestIndex = new Map();
    this.consumedTokens = new Map();
    this.tombstones = [];
  }

  registerCapacity(record) {
    this.capacities.set(record.authorityInstanceId, clone(record));
    return clone(record);
  }

  getCapacity(id) { return clone(this.capacities.get(id) || null); }
  listCapacities() { return [...this.capacities.values()].map(clone); }

  updateCapacity(id, mutate) {
    const current = this.capacities.get(id);
    if (!current) return null;
    const next = mutate(clone(current));
    this.capacities.set(id, clone(next));
    return clone(next);
  }

  getRun(runId) { return clone(this.runs.get(runId) || null); }

  listExpiredCandidates(now, limit = 256) {
    if (!Number.isSafeInteger(now) || now < 0 || !Number.isSafeInteger(limit) || limit < 1 || limit > 256) {
      throw new Error("invalid expiry query");
    }
    const selected = [];
    for (const run of this.runs.values()) {
      const deadlineAt = run.state === "ALLOCATING" ? run.readinessDeadlineAt : run.leaseDeadlineAt;
      if (!["ALLOCATING", "READY", "ACTIVE", "DRAINING"].includes(run.state)
        || run.leaseStatus !== "ACTIVE" || run.resultAcceptanceState === "ACCEPTED" || now < deadlineAt) continue;
      selected.push({ runId: run.runId, state: run.state, leaseStatus: run.leaseStatus,
        authorityLeaseId: run.authorityLeaseId, leaseEpoch: run.leaseEpoch, deadlineAt });
      selected.sort((left, right) => left.deadlineAt - right.deadlineAt || left.runId.localeCompare(right.runId));
      if (selected.length > limit) selected.pop();
    }
    return selected.map(clone);
  }

  claimPlacement({ requestId, runId, candidates, isEligible, create }) {
    const indexed = this.requestIndex.get(requestId);
    if (indexed) return { won: false, conflict: indexed !== runId, record: clone(this.runs.get(indexed)) };
    const existing = this.runs.get(runId);
    if (existing && ["ALLOCATING", "READY", "ACTIVE", "DRAINING"].includes(existing.state)) {
      return { won: false, record: clone(existing) };
    }
    for (const candidateId of candidates) {
      const capacity = this.capacities.get(candidateId);
      if (!capacity || !isEligible(clone(capacity))) continue;
      const allocations = [...this.runs.values()].filter((run) =>
        run.authorityInstanceId === candidateId && ["ALLOCATING", "READY", "ACTIVE", "DRAINING"].includes(run.state)).length;
      if (allocations >= capacity.placementLimit) continue;
      const epoch = Math.max(0, ...(existing?.history || []).map((entry) => entry.leaseEpoch || 0), existing?.leaseEpoch || 0) + 1;
      const record = create(clone(capacity), epoch, existing ? clone(existing) : null);
      this.runs.set(runId, clone(record));
      this.requestIndex.set(requestId, runId);
      return { won: true, conflict: false, record: clone(record) };
    }
    return { won: false, conflict: false, record: null };
  }

  compareAndSetRun(runId, predicate, mutate) {
    const current = this.runs.get(runId);
    if (!current || !predicate(clone(current))) return null;
    const next = mutate(clone(current));
    this.runs.set(runId, clone(next));
    return clone(next);
  }

  consumeToken(tokenId, expiresAt, consumedAt) {
    this.pruneTokens(consumedAt);
    if (this.consumedTokens.has(tokenId)) return false;
    this.consumedTokens.set(tokenId, expiresAt);
    return true;
  }

  isTokenConsumed(tokenId) { return this.consumedTokens.has(tokenId); }

  consumeTokenAndUpdateRun({ tokenId, expiresAt, consumedAt, runId, predicate, mutate }) {
    this.pruneTokens(consumedAt);
    if (this.consumedTokens.has(tokenId)) return null;
    const current = this.runs.get(runId);
    if (!current || !predicate(clone(current))) return null;
    const next = mutate(clone(current));
    this.consumedTokens.set(tokenId, expiresAt);
    this.runs.set(runId, clone(next));
    return clone(next);
  }

  pruneTokens(now) {
    for (const [id, expiry] of this.consumedTokens) if (now >= expiry) this.consumedTokens.delete(id);
  }

  cleanup({ now, terminalBefore = now, keepTerminal = this.tombstoneLimit } = {}) {
    this.pruneTokens(now);
    for (const [runId, run] of this.runs) {
      if (!["ENDED", "FAILED"].includes(run.state) || (run.terminalAt || Infinity) > terminalBefore) continue;
      this.runs.delete(runId);
      this.tombstones.push({ runId, state: run.state, leaseEpoch: run.leaseEpoch, terminalAt: run.terminalAt });
    }
    this.tombstones.sort((a, b) => b.terminalAt - a.terminalAt || a.runId.localeCompare(b.runId));
    this.tombstones.length = Math.min(this.tombstones.length, keepTerminal, this.tombstoneLimit);
    for (const [requestId, runId] of this.requestIndex) {
      if (!this.runs.has(runId) && !this.tombstones.some((entry) => entry.runId === runId)) this.requestIndex.delete(requestId);
    }
    return { activeRuns: this.runs.size, consumedTokens: this.consumedTokens.size, tombstones: this.tombstones.length };
  }

  snapshot() {
    return clone({
      capacities: [...this.capacities.values()],
      runs: [...this.runs.values()],
      requestIndex: [...this.requestIndex.entries()],
      consumedTokenCount: this.consumedTokens.size,
      tombstones: this.tombstones,
    });
  }
}

module.exports = { InMemoryPlacementRepository };
