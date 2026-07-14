"use strict";

class HostedSettlementService {
  constructor({ outbox, repository, workerId = "settlement-worker", leaseMs = 30_000,
    recoveryLimit = 100, diagnostics = () => {}, fault = () => {} } = {}) {
    if (!outbox || typeof outbox.claim !== "function") throw new TypeError("outbox is required");
    if (!repository || typeof repository.settle !== "function") throw new TypeError("repository is required");
    if (!Number.isSafeInteger(recoveryLimit) || recoveryLimit < 1 || recoveryLimit > 10_000) {
      throw new TypeError("recoveryLimit must be an integer from 1 to 10000");
    }
    if (typeof diagnostics !== "function") throw new TypeError("diagnostics must be a function");
    this.outbox = outbox; this.repository = repository; this.workerId = workerId; this.leaseMs = leaseMs;
    this.recoveryLimit = recoveryLimit; this.diagnostics = diagnostics; this.fault = fault;
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
    const claim = this.outbox.claim({ owner: this.workerId, leaseMs: this.leaseMs });
    if (!claim) return null;
    try {
      this.fault("before-commit", claim);
      const committed = this.repository.settle(claim);
      this.fault("after-commit-before-ack", claim, committed);
      this.outbox.markDelivered({ result_id: claim.result_id, delivery_lease_id: claim.delivery_lease_id });
      return committed;
    } catch (error) {
      // A process crash intentionally leaves the delivery lease in place. On
      // ordinary errors, release it for bounded at-least-once retry.
      if (error?.crash === true) throw error;
      this.outbox.markFailed({ result_id: claim.result_id, delivery_lease_id: claim.delivery_lease_id,
        errorCode: error?.code || "SETTLEMENT_FAILED" });
      throw error;
    }
  }

  _diagnose(event) {
    try { this.diagnostics(Object.freeze(event)); } catch {}
  }
}

module.exports = { HostedSettlementService };
