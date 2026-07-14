"use strict";

const assert = require("assert");
const {
  HostedResultError, InMemoryHostedResultOutbox, canonicalResult, OUTBOX_STATES,
} = require("../scripts/hosted-result-outbox.cjs");
const {
  InMemoryHostedSettlementRepository,
} = require("../scripts/hosted-settlement-repository.cjs");
const { HostedSettlementService } = require("../scripts/hosted-settlement-service.cjs");

let assertions = 0;
function check(value, message) { assertions += 1; assert(value, message); }
function equal(actual, expected, message) { assertions += 1; assert.deepStrictEqual(actual, expected, message); }
function rejects(fn, code, message) {
  assertions += 1;
  assert.throws(fn, (error) => error instanceof HostedResultError && error.code === code
    && error.message === "hosted result rejected", message);
}
function clock(start = 1_000_000) {
  let time = start;
  return { now: () => time, advance: (ms) => { time += ms; }, value: () => time };
}
function authority(overrides = {}) {
  return { run_id: "run-a", lease_id: "lease-a", lease_epoch: 7,
    authority_incarnation: "authority-a-incarnation-2", ...overrides };
}
function result(overrides = {}) {
  return { result_version: 1, outcome: "extracted", duration_ms: 120_000,
    em_earned: 60, cargo: [{ item_id: "relic-a", value: 20 }], ...overrides };
}
function leaseRecord(identity, overrides = {}) {
  return { active: true, run_state: "DRAINING", ...identity, ...overrides };
}
function rig({ time = clock(), fault = () => {}, repoFault = () => {} } = {}) {
  let current = leaseRecord(authority());
  const outbox = new InMemoryHostedResultOutbox({
    now: time.now, baseBackoffMs: 10, maxAttempts: 4,
    randomBytes: () => Buffer.alloc(20, 7),
    verifyAuthority: () => current,
  });
  const repository = new InMemoryHostedSettlementRepository({
    now: time.now, fault: repoFault,
    resolveRunOwnership(runId) {
      return runId === "run-a" ? { profile_id: "server-profile-a", account_id: "server-account-a" } : null;
    },
  });
  const service = new HostedSettlementService({ outbox, repository, workerId: "worker-a", leaseMs: 100, fault });
  return { time, outbox, repository, service, setLease(value) { current = value; } };
}

function main() {
  {
    const { outbox } = rig();
    const first = outbox.enqueue({ authority: authority(), payload: result() });
    const replay = outbox.enqueue({ authority: authority(), payload: result() });
    equal(replay.result_id, first.result_id, "same terminal result should retain a stable result id");
    equal(replay.idempotency_key, first.idempotency_key, "same terminal result should retain an idempotency key");
    equal(outbox.list().length, 1, "same result should create one immutable outbox row");
    check(first.result_hash.startsWith("sha256:"), "outbox should persist canonical payload hash");
    const orderA = canonicalResult(authority(), { alpha: 1, beta: { x: 2, y: 3 } });
    const orderB = canonicalResult(authority(), { beta: { y: 3, x: 2 }, alpha: 1 });
    equal(orderA.result_hash, orderB.result_hash, "canonical hash must not depend on object insertion order");
    rejects(() => outbox.enqueue({ authority: authority(), payload: result({ em_earned: 61 }) }),
      "HOSTED_RESULT_CONFLICT", "one run must not publish two different terminal results");
  }

  {
    const state = rig();
    for (const invalid of [
      leaseRecord(authority(), { lease_id: "replacement" }),
      leaseRecord(authority(), { lease_epoch: 8 }),
      leaseRecord(authority(), { authority_incarnation: "replacement" }),
      leaseRecord(authority(), { active: false }),
      leaseRecord(authority(), { run_state: "ACTIVE" }),
    ]) {
      state.setLease(invalid);
      rejects(() => state.outbox.enqueue({ authority: authority(), payload: result() }),
        "HOSTED_RESULT_FENCED", "stale or non-terminal authority must be fenced");
    }
  }

  {
    const { outbox } = rig();
    rejects(() => outbox.enqueue({ authority: authority(), payload: result({ profile_id: "caller-profile" }) }),
      "HOSTED_RESULT_INVALID", "caller-supplied profile ownership must reject");
    rejects(() => outbox.enqueue({ authority: authority(), payload: { nested: { accountId: "caller-account" } } }),
      "HOSTED_RESULT_INVALID", "nested caller-supplied account ownership must reject");
    rejects(() => outbox.enqueue({ authority: authority(), payload: { huge: "x".repeat(129 * 1024) } }),
      "HOSTED_RESULT_INVALID", "oversized scalar must fail bounded input validation");
    let getterRead = false;
    const hostile = {};
    Object.defineProperty(hostile, "outcome", { enumerable: true, get() { getterRead = true; return "extracted"; } });
    rejects(() => outbox.enqueue({ authority: authority(), payload: hostile }),
      "HOSTED_RESULT_INVALID", "accessor input must reject generically");
    equal(getterRead, false, "validation must not invoke untrusted accessors");
  }

  {
    const { outbox, repository, service } = rig();
    const accepted = outbox.enqueue({ authority: authority(), payload: result() });
    const committed = service.deliverOne();
    equal(committed.result_id, accepted.result_id, "settlement should commit claimed result");
    equal(outbox.get(accepted.result_id).state, OUTBOX_STATES.DELIVERED,
      "outbox acknowledgment must follow durable settlement");
    const snapshot = repository.snapshot();
    equal(snapshot.runResults.size, 1, "settlement atomically records run result");
    equal(snapshot.settlements.size, 1, "settlement atomically records settlement");
    equal(snapshot.profiles.get("server-profile-a").revision, 1, "settlement atomically advances profile revision");
    equal(snapshot.profiles.get("server-profile-a").balance, 60, "settlement credits server-derived profile once");
    equal(snapshot.ledger.size, 1, "settlement atomically records ledger entry");
    equal(snapshot.inventory.size, 1, "settlement atomically records inventory entry");
    check(!JSON.stringify(committed).includes("server-profile-a"), "public acknowledgment should not disclose ownership");
  }

  {
    const failSteps = ["before-result", "after-result", "after-apply", "before-commit"];
    for (const step of failSteps) {
      const state = rig({ repoFault(current) { if (current === step) throw new Error(`fault:${step}`); } });
      const accepted = state.outbox.enqueue({ authority: authority(), payload: result() });
      assert.throws(() => state.service.deliverOne(), new RegExp(`fault:${step}`)); assertions += 1;
      const snapshot = state.repository.snapshot();
      equal(snapshot.runResults.size, 0, `${step} must roll back result`);
      equal(snapshot.settlements.size, 0, `${step} must roll back settlement`);
      equal(snapshot.profiles.size, 0, `${step} must roll back profile`);
      equal(snapshot.ledger.size, 0, `${step} must roll back ledger`);
      equal(snapshot.inventory.size, 0, `${step} must roll back inventory`);
      equal(state.outbox.get(accepted.result_id).state, OUTBOX_STATES.PENDING,
        `${step} must not acknowledge the outbox row`);
    }
  }

  {
    let crash = true;
    const state = rig({ fault(step) {
      if (step === "before-commit" && crash) {
        crash = false;
        throw Object.assign(new Error("crash-before-commit"), { crash: true });
      }
    } });
    const accepted = state.outbox.enqueue({ authority: authority(), payload: result() });
    assert.throws(() => state.service.deliverOne(), /crash-before-commit/); assertions += 1;
    equal(state.repository.snapshot().settlements.size, 0, "crash before commit must not settle");
    equal(state.outbox.get(accepted.result_id).state, OUTBOX_STATES.LEASED, "crash should leave claim for lease recovery");
    state.time.advance(101);
    const recovered = state.service.deliverOne();
    equal(recovered.replayed, false, "recovered pre-commit crash should perform first commit");
  }

  {
    let crash = true;
    const state = rig({ fault(step) {
      if (step === "after-commit-before-ack" && crash) {
        crash = false;
        throw Object.assign(new Error("crash-after-commit"), { crash: true });
      }
    } });
    const accepted = state.outbox.enqueue({ authority: authority(), payload: result() });
    assert.throws(() => state.service.deliverOne(), /crash-after-commit/); assertions += 1;
    equal(state.repository.snapshot().settlements.size, 1, "crash after commit must retain durable settlement");
    equal(state.outbox.get(accepted.result_id).state, OUTBOX_STATES.LEASED, "missing ack should retain delivery lease");
    state.time.advance(101);
    const replay = state.service.deliverOne();
    equal(replay.replayed, true, "recovery after commit-before-ack must replay committed response");
    equal(state.repository.snapshot().profiles.get("server-profile-a").balance, 60, "commit replay must not double credit");
    equal(state.outbox.get(accepted.result_id).state, OUTBOX_STATES.DELIVERED, "replay may safely acknowledge outbox");
  }

  {
    const state = rig();
    const accepted = state.outbox.enqueue({ authority: authority(), payload: result() });
    const claim = state.outbox.claim({ owner: "sender-a", leaseMs: 100 });
    equal(state.outbox.claim({ owner: "sender-b", leaseMs: 100 }), null, "double sender must not share a live claim");
    state.time.advance(101);
    const replacement = state.outbox.claim({ owner: "sender-b", leaseMs: 100 });
    rejects(() => state.outbox.markDelivered({ result_id: accepted.result_id, delivery_lease_id: claim.delivery_lease_id }),
      "HOSTED_RESULT_STALE_DELIVERY_LEASE", "superseded delivery lease must not acknowledge");
    state.outbox.markFailed({ result_id: replacement.result_id, delivery_lease_id: replacement.delivery_lease_id });
  }

  {
    const state = rig();
    const accepted = state.outbox.enqueue({ authority: authority(), payload: result() });
    for (let attempt = 1; attempt <= 4; attempt += 1) {
      const claim = state.outbox.claim({ owner: "failing-sender", leaseMs: 100 });
      check(claim, `attempt ${attempt} should claim after backoff`);
      const failed = state.outbox.markFailed({ result_id: claim.result_id,
        delivery_lease_id: claim.delivery_lease_id, errorCode: "UPSTREAM_UNAVAILABLE" });
      if (attempt < 4) {
        equal(failed.state, OUTBOX_STATES.PENDING, `attempt ${attempt} should remain retryable`);
        equal(state.outbox.claim({ owner: "too-early", leaseMs: 100 }), null,
          `attempt ${attempt} backoff should prevent immediate retry`);
        state.time.advance(10 * (2 ** (attempt - 1)));
      } else {
        equal(failed.state, OUTBOX_STATES.DEAD_LETTER, "bounded retry exhaustion should dead-letter");
      }
    }
    equal(state.outbox.get(accepted.result_id).last_error_code, "UPSTREAM_UNAVAILABLE",
      "dead letter should retain bounded diagnostic code");
  }

  {
    const state = rig();
    const accepted = state.outbox.enqueue({ authority: authority(), payload: result() });
    const claim = state.outbox.claim({ owner: "replay-source", leaseMs: 100 });
    let first;
    for (let index = 0; index < 100; index += 1) {
      const settled = state.repository.settle(claim);
      if (index === 0) first = settled;
      else {
        equal(settled.replayed, true, `replay ${index} should return committed response`);
        equal(settled.settlement_id, first.settlement_id, `replay ${index} should retain settlement id`);
      }
    }
    const snapshot = state.repository.snapshot();
    equal(snapshot.settlements.size, 1, "100 deliveries should create one settlement");
    equal(snapshot.runResults.size, 1, "100 deliveries should create one result");
    equal(snapshot.profiles.get("server-profile-a").balance, 60, "100 deliveries should credit once");
    const conflictCanonical = canonicalResult(authority(), result({ em_earned: 61 }));
    const conflicting = { ...claim, result_id: conflictCanonical.result_id,
      idempotency_key: conflictCanonical.idempotency_key, result_hash: conflictCanonical.result_hash,
      payload: conflictCanonical.payload };
    rejects(() => state.repository.settle(conflicting), "HOSTED_SETTLEMENT_CONFLICT",
      "different canonical hash for settled run must quarantine");
    const after = state.repository.snapshot();
    equal(after.quarantine.length, 1, "conflict quarantine should be durable");
    equal(after.profiles.get("server-profile-a").balance, 60, "conflict must not mutate profile");
    equal(after.ledger.size, 1, "conflict must not mutate ledger");
    equal(after.inventory.size, 1, "conflict must not mutate inventory");
    equal(state.outbox.get(accepted.result_id).state, OUTBOX_STATES.LEASED, "repository commit alone must not acknowledge");
  }

  console.log(`hosted settlement service: ${assertions} assertions passed`);
}

main();
