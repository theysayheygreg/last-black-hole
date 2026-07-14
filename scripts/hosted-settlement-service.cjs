"use strict";

class HostedSettlementService {
  constructor({ outbox, repository, workerId = "settlement-worker", leaseMs = 30_000,
    recoveryLimit = 100, archiveLimit = 100, acknowledgePlacementResult,
    diagnostics = () => {}, fault = () => {} } = {}) {
    if (!outbox || typeof outbox.claim !== "function") throw new TypeError("outbox is required");
    if (!repository || typeof repository.settle !== "function") throw new TypeError("repository is required");
    if (!Number.isSafeInteger(recoveryLimit) || recoveryLimit < 1 || recoveryLimit > 10_000) {
      throw new TypeError("recoveryLimit must be an integer from 1 to 10000");
    }
    if (typeof diagnostics !== "function") throw new TypeError("diagnostics must be a function");
    if (!Number.isSafeInteger(archiveLimit) || archiveLimit < 1 || archiveLimit > 10_000) {
      throw new TypeError("archiveLimit must be an integer from 1 to 10000");
    }
    if (acknowledgePlacementResult != null && typeof acknowledgePlacementResult !== "function") {
      throw new TypeError("acknowledgePlacementResult must be a function");
    }
    this.outbox = outbox; this.repository = repository; this.workerId = workerId; this.leaseMs = leaseMs;
    this.recoveryLimit = recoveryLimit; this.diagnostics = diagnostics; this.fault = fault;
    this.archiveLimit = archiveLimit; this.acknowledgePlacementResult = acknowledgePlacementResult;
  }

  deliverOne() {
    // Recovery is an explicit worker action rather than a constructor side
    // effect: the process has finished composing its placement and persistence
    // adapters before any terminal CAS can be replayed. A recovery failure is
    // fail-closed; no later outbox row is claimed out of order.
    if (typeof this.outbox.recoverPrepared === "function") {
      let recovered;
      try {
        recovered = this.outbox.recoverPrepared({ limit: this.recoveryLimit });
        if (!Array.isArray(recovered)) throw new TypeError("outbox recovery must return an array");
      } catch (error) {
        this._diagnose({ type: "hosted_result_journal_recovery", status: "failed",
          errorCode: typeof error?.code === "string" ? error.code : "RESULT_JOURNAL_RECOVERY_FAILED" });
        throw error;
      }
      if (recovered.length > 0) this._diagnose({ type: "hosted_result_journal_recovery",
        status: "recovered", recoveredCount: recovered.length, recoveryLimit: this.recoveryLimit });
    }
    this.archiveSettled();
    const claim = this.outbox.claim({ owner: this.workerId, leaseMs: this.leaseMs });
    if (!claim) return null;
    let delivered = false;
    try {
      this.fault("before-commit", claim);
      const committed = this.repository.settle(claim);
      this.fault("after-commit-before-ack", claim, committed);
      this.outbox.markDelivered({ result_id: claim.result_id, delivery_lease_id: claim.delivery_lease_id });
      delivered = true;
      this.archiveSettled();
      return committed;
    } catch (error) {
      // Settlement and delivery acknowledgement are already durable. Archive
      // recovery must retry the receipt callback; it must never demote a
      // delivered row back into the delivery retry/dead-letter state machine.
      if (delivered) throw error;
      // A process crash intentionally leaves the delivery lease in place. On
      // ordinary errors, release it for bounded at-least-once retry.
      if (error?.crash === true) throw error;
      this.outbox.markFailed({ result_id: claim.result_id, delivery_lease_id: claim.delivery_lease_id,
        errorCode: error?.code || "SETTLEMENT_FAILED" });
      throw error;
    }
  }

  archiveSettled() {
    if (!this.acknowledgePlacementResult || typeof this.outbox.archiveCandidates !== "function"
        || typeof this.outbox.archiveSettled !== "function"
        || typeof this.repository.archiveSettledResult !== "function") return Object.freeze({ archived: 0 });
    const candidates = this.outbox.archiveCandidates({ limit: this.archiveLimit });
    let archived = 0;
    for (const candidate of candidates) {
      const receipt = this.repository.archiveSettledResult(candidate);
      // The placement callback must be idempotent and exact-tuple checked. A
      // crash after it returns is safe: the same receipt is replayed before
      // local payload deletion on restart.
      const acknowledged = this.acknowledgePlacementResult(receipt);
      if (acknowledged?.acknowledged !== true || acknowledged.result_id !== receipt.result_id
          || acknowledged.result_hash !== receipt.result_hash || acknowledged.run_id !== receipt.run_id
          || acknowledged.settlement_id !== receipt.settlement_id
          || acknowledged.receipt_id !== receipt.receipt_id
          || acknowledged.idempotency_key !== receipt.idempotency_key) {
        throw new Error("settlement archive placement acknowledgement rejected");
      }
      this.outbox.archiveSettled({ receipt });
      archived += 1;
      this._diagnose({ type: "hosted_settlement_archive", status: "archived", archivedCount: 1 });
    }
    return Object.freeze({ archived });
  }

  _diagnose(event) {
    try { this.diagnostics(Object.freeze(event)); } catch {}
  }
}

module.exports = { HostedSettlementService };
