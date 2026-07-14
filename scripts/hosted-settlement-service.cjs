"use strict";

class HostedSettlementService {
  constructor({ outbox, repository, workerId = "settlement-worker", leaseMs = 30_000,
    fault = () => {} } = {}) {
    if (!outbox || typeof outbox.claim !== "function") throw new TypeError("outbox is required");
    if (!repository || typeof repository.settle !== "function") throw new TypeError("repository is required");
    this.outbox = outbox; this.repository = repository; this.workerId = workerId; this.leaseMs = leaseMs; this.fault = fault;
  }

  deliverOne() {
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
}

module.exports = { HostedSettlementService };
