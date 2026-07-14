"use strict";

const assert = require("assert");
const {
  HostedResultError, InMemoryHostedResultOutbox, canonicalResult, OUTBOX_STATES,
} = require("../scripts/hosted-result-outbox.cjs");
const { InMemoryHostedSettlementRepository } = require("../scripts/hosted-settlement-repository.cjs");
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
  return { now: () => time, advance: (ms) => { time += ms; } };
}
function authority(overrides = {}) {
  return { run_id: "run-a", lease_id: "lease-a", lease_epoch: 7,
    authority_incarnation: "authority-a-incarnation-2", ...overrides };
}
function members(count = 4) {
  return Array.from({ length: count }, (_, index) => ({
    run_membership_id: `membership-${index + 1}`, profile_id: `server-profile-${index + 1}`,
    account_id: `server-account-${index + 1}`,
  }));
}
function memberOutcome(index, overrides = {}) {
  return { outcome: index % 2 ? "dead" : "extracted", duration_ms: 120_000 + index,
    em_earned: 10 * (index + 1), cargo: [{ item_id: `relic-${index + 1}`, value: 20 }], ...overrides };
}
function result({ count = 4, outcomes, ...overrides } = {}) {
  return { result_version: 1,
    outcomes: outcomes || Object.fromEntries(Array.from({ length: count }, (_, index) =>
      [`membership-${index + 1}`, memberOutcome(index)])), ...overrides };
}

class AuthorityAcceptanceStore {
  constructor(identity = authority()) {
    this.current = { active: true, run_state: "DRAINING", ...identity };
    this.accepted = null;
  }
  setCurrent(value) { this.current = value; }
  accept(identity, resultHash) {
    if (this.accepted) {
      return this._same(identity, resultHash, this.accepted) ? { ...this.accepted } : null;
    }
    const current = this.current;
    if (!current || current.active !== true || !["DRAINING", "ENDED"].includes(current.run_state)
        || !this._same(identity, resultHash, { ...current, result_hash: resultHash })) return null;
    this.accepted = { accepted: true, ...identity, result_hash: resultHash };
    return { ...this.accepted };
  }
  verify(entry) { return this.accepted ? { ...this.accepted } : null; }
  replace(nextIdentity) {
    if (this.accepted) return false;
    this.current = { active: true, run_state: "ACTIVE", ...nextIdentity };
    return true;
  }
  _same(identity, resultHash, record) {
    return record.run_id === identity.run_id && record.lease_id === identity.lease_id
      && record.lease_epoch === identity.lease_epoch
      && record.authority_incarnation === identity.authority_incarnation
      && record.result_hash === resultHash;
  }
}

function rig({ time = clock(), fault = () => {}, repoFault = () => {}, admitted = members() } = {}) {
  const acceptance = new AuthorityAcceptanceStore();
  const outbox = new InMemoryHostedResultOutbox({
    now: time.now, baseBackoffMs: 10, maxAttempts: 4,
    randomBytes: () => Buffer.alloc(20, 7),
    acceptAuthorityResult: (identity, resultHash) => acceptance.accept(identity, resultHash),
  });
  const repository = new InMemoryHostedSettlementRepository({
    now: time.now, fault: repoFault,
    resolveRunMemberships: (runId) => runId === "run-a" ? admitted : null,
    verifyAcceptedAuthorityResult: (entry) => acceptance.verify(entry),
  });
  const service = new HostedSettlementService({ outbox, repository, workerId: "worker-a", leaseMs: 100, fault });
  return { time, acceptance, outbox, repository, service };
}

function main() {
  {
    const { outbox } = rig();
    const first = outbox.enqueue({ authority: authority(), payload: result() });
    const replay = outbox.enqueue({ authority: authority(), payload: result() });
    equal(replay.result_id, first.result_id, "same terminal result should retain stable result id");
    equal(replay.idempotency_key, first.idempotency_key, "same terminal result should retain idempotency key");
    equal(outbox.list().length, 1, "same result should create one immutable outbox row");
    const ordered = result();
    const reversed = { result_version: 1, outcomes: Object.fromEntries(Object.entries(ordered.outcomes).reverse()) };
    equal(canonicalResult(authority(), ordered).result_hash, canonicalResult(authority(), reversed).result_hash,
      "canonical hash must not depend on membership insertion order");
    const conflicting = result(); conflicting.outcomes["membership-1"].em_earned += 1;
    rejects(() => outbox.enqueue({ authority: authority(), payload: conflicting }),
      "HOSTED_RESULT_CONFLICT", "one run must not publish two terminal results");
  }

  {
    for (const invalid of [
      { active: true, run_state: "DRAINING", ...authority({ lease_id: "replacement" }) },
      { active: true, run_state: "DRAINING", ...authority({ lease_epoch: 8 }) },
      { active: true, run_state: "DRAINING", ...authority({ authority_incarnation: "replacement" }) },
      { active: false, run_state: "DRAINING", ...authority() },
      { active: true, run_state: "ACTIVE", ...authority() },
    ]) {
      const state = rig(); state.acceptance.setCurrent(invalid);
      rejects(() => state.outbox.enqueue({ authority: authority(), payload: result() }),
        "HOSTED_RESULT_FENCED", "CAS must fence stale or non-terminal authority");
    }
  }

  {
    const { outbox } = rig();
    const withProfile = result(); withProfile.outcomes["membership-1"].profile_id = "caller-profile";
    rejects(() => outbox.enqueue({ authority: authority(), payload: withProfile }),
      "HOSTED_RESULT_INVALID", "authority must not supply profile ownership");
    const withAccount = result(); withAccount.outcomes["membership-1"].cargo[0].accountId = "caller-account";
    rejects(() => outbox.enqueue({ authority: authority(), payload: withAccount }),
      "HOSTED_RESULT_INVALID", "nested authority account ownership must reject");
    const huge = result(); huge.outcomes["membership-1"].cargo[0].blob = "x".repeat(129 * 1024);
    rejects(() => outbox.enqueue({ authority: authority(), payload: huge }),
      "HOSTED_RESULT_INVALID", "oversized scalar must reject");
    rejects(() => outbox.enqueue({ authority: authority(), payload: result({ count: 0 }) }),
      "HOSTED_RESULT_INVALID", "empty outcome set must reject");
    rejects(() => outbox.enqueue({ authority: authority(), payload: result({ count: 5 }) }),
      "HOSTED_RESULT_INVALID", "fifth outcome must reject");
    let getterRead = false;
    const hostile = {};
    Object.defineProperty(hostile, "result_version", { enumerable: true, get() { getterRead = true; return 1; } });
    rejects(() => outbox.enqueue({ authority: authority(), payload: hostile }),
      "HOSTED_RESULT_INVALID", "accessor input must reject generically");
    equal(getterRead, false, "validation must not invoke untrusted accessors");
  }

  {
    const state = rig();
    const accepted = state.outbox.enqueue({ authority: authority(), payload: result() });
    const replacement = authority({ lease_id: "lease-new", lease_epoch: 8, authority_incarnation: "authority-new" });
    equal(state.acceptance.replace(replacement), false,
      "atomic result acceptance must make enqueue-then-replacement impossible");
    const committed = state.service.deliverOne();
    equal(committed.result_id, accepted.result_id, "accepted lineage should settle");
    equal(state.outbox.get(accepted.result_id).state, OUTBOX_STATES.DELIVERED,
      "acknowledgment must follow durable settlement");
    const snapshot = state.repository.snapshot();
    equal(snapshot.profiles.size, 4, "one transaction should update all four admitted profiles");
    equal(snapshot.ledger.size, 4, "one transaction should post all four ledgers");
    equal(snapshot.inventory.size, 4, "one transaction should add all four inventories");
    for (let index = 0; index < 4; index += 1) {
      const profile = snapshot.profiles.get(`server-profile-${index + 1}`);
      equal(profile.revision, 1, `member ${index + 1} profile revision should advance once`);
      equal(profile.balance, 10 * (index + 1), `member ${index + 1} should receive only its outcome`);
    }
    check(!JSON.stringify(committed).includes("server-profile"), "public acknowledgment must not disclose profiles");
    check(!JSON.stringify(state.outbox.list()).includes("server-profile"), "authority outbox must contain no profiles");
  }

  {
    const state = rig();
    state.outbox.enqueue({ authority: authority(), payload: result() });
    state.acceptance.accepted = { accepted: true, ...authority({ lease_id: "lease-new", lease_epoch: 8 }),
      result_hash: state.acceptance.accepted.result_hash };
    rejects(() => state.service.deliverOne(), "HOSTED_SETTLEMENT_FENCED",
      "settlement must revalidate accepted lineage and refuse stale queued result");
    equal(state.repository.snapshot().profiles.size, 0, "fenced queued result must mutate no profile");
  }

  {
    const omission = rig();
    omission.outbox.enqueue({ authority: authority(), payload: result({ count: 3 }) });
    rejects(() => omission.service.deliverOne(), "HOSTED_SETTLEMENT_MEMBERSHIP_MISMATCH",
      "omitted admitted membership must reject atomically");
    const addition = rig({ admitted: members(3) });
    addition.outbox.enqueue({ authority: authority(), payload: result({ count: 4 }) });
    rejects(() => addition.service.deliverOne(), "HOSTED_SETTLEMENT_MEMBERSHIP_MISMATCH",
      "unadmitted membership outcome must reject atomically");
    const duplicateTruth = members(); duplicateTruth[3].run_membership_id = duplicateTruth[2].run_membership_id;
    const duplicate = rig({ admitted: duplicateTruth });
    duplicate.outbox.enqueue({ authority: authority(), payload: result() });
    rejects(() => duplicate.service.deliverOne(), "HOSTED_SETTLEMENT_MEMBERSHIP_MISMATCH",
      "duplicate server membership truth must reject");
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
      equal(snapshot.profiles.size, 0, `${step} must roll back all four profiles`);
      equal(snapshot.ledger.size, 0, `${step} must roll back all four ledgers`);
      equal(snapshot.inventory.size, 0, `${step} must roll back all four inventories`);
      equal(state.outbox.get(accepted.result_id).state, OUTBOX_STATES.PENDING,
        `${step} must not acknowledge the outbox row`);
    }
  }

  {
    let crash = true;
    const state = rig({ fault(step) {
      if (step === "before-commit" && crash) {
        crash = false; throw Object.assign(new Error("crash-before-commit"), { crash: true });
      }
    } });
    state.outbox.enqueue({ authority: authority(), payload: result() });
    assert.throws(() => state.service.deliverOne(), /crash-before-commit/); assertions += 1;
    equal(state.repository.snapshot().settlements.size, 0, "crash before commit must not settle");
    state.time.advance(101);
    equal(state.service.deliverOne().replayed, false, "recovered pre-commit crash should perform first commit");
  }

  {
    let crash = true;
    const state = rig({ fault(step) {
      if (step === "after-commit-before-ack" && crash) {
        crash = false; throw Object.assign(new Error("crash-after-commit"), { crash: true });
      }
    } });
    state.outbox.enqueue({ authority: authority(), payload: result() });
    assert.throws(() => state.service.deliverOne(), /crash-after-commit/); assertions += 1;
    equal(state.repository.snapshot().settlements.size, 1, "crash after commit must retain settlement");
    state.time.advance(101);
    equal(state.service.deliverOne().replayed, true, "commit-before-ack recovery must replay response");
    equal(state.repository.snapshot().profiles.get("server-profile-4").balance, 40,
      "replay must not double-credit any member");
  }

  {
    const state = rig();
    const accepted = state.outbox.enqueue({ authority: authority(), payload: result() });
    const claim = state.outbox.claim({ owner: "sender-a", leaseMs: 100 });
    equal(state.outbox.claim({ owner: "sender-b", leaseMs: 100 }), null, "double sender must not share live claim");
    state.time.advance(101);
    const replacement = state.outbox.claim({ owner: "sender-b", leaseMs: 100 });
    rejects(() => state.outbox.markDelivered({ result_id: accepted.result_id, delivery_lease_id: claim.delivery_lease_id }),
      "HOSTED_RESULT_STALE_DELIVERY_LEASE", "superseded delivery lease must not acknowledge");
    state.outbox.markFailed({ result_id: replacement.result_id, delivery_lease_id: replacement.delivery_lease_id });
  }

  {
    const state = rig();
    state.outbox.enqueue({ authority: authority(), payload: result() });
    for (let attempt = 1; attempt <= 4; attempt += 1) {
      const claim = state.outbox.claim({ owner: "failing-sender", leaseMs: 100 });
      check(claim, `attempt ${attempt} should claim after backoff`);
      const failed = state.outbox.markFailed({ result_id: claim.result_id,
        delivery_lease_id: claim.delivery_lease_id, errorCode: "UPSTREAM_UNAVAILABLE" });
      if (attempt < 4) {
        equal(failed.state, OUTBOX_STATES.PENDING, `attempt ${attempt} should remain retryable`);
        equal(state.outbox.claim({ owner: "too-early", leaseMs: 100 }), null, "backoff should prevent immediate retry");
        state.time.advance(10 * (2 ** (attempt - 1)));
      } else equal(failed.state, OUTBOX_STATES.DEAD_LETTER, "retry exhaustion should dead-letter");
    }
  }

  {
    const state = rig();
    state.outbox.enqueue({ authority: authority(), payload: result() });
    const claim = state.outbox.claim({ owner: "replay-source", leaseMs: 100 });
    let first;
    for (let index = 0; index < 100; index += 1) {
      const settled = state.repository.settle(claim);
      if (index === 0) first = settled;
      else {
        equal(settled.replayed, true, `four-member replay ${index} should reuse committed response`);
        equal(settled.settlement_id, first.settlement_id, `four-member replay ${index} should retain settlement id`);
      }
    }
    const snapshot = state.repository.snapshot();
    equal(snapshot.settlements.size, 1, "100 four-member deliveries should create one settlement");
    equal(snapshot.profiles.size, 4, "100 four-member deliveries should retain four profiles");
    equal(snapshot.ledger.size, 4, "100 four-member deliveries should post four ledger rows once");
    equal(snapshot.inventory.size, 4, "100 four-member deliveries should add four items once");
    const changed = result(); changed.outcomes["membership-4"].em_earned = 999;
    const conflictCanonical = canonicalResult(authority(), changed);
    const conflicting = { ...claim, result_id: conflictCanonical.result_id,
      idempotency_key: conflictCanonical.idempotency_key, result_hash: conflictCanonical.result_hash,
      payload: conflictCanonical.payload };
    rejects(() => state.repository.settle(conflicting), "HOSTED_SETTLEMENT_CONFLICT",
      "different four-member hash must quarantine");
    const after = state.repository.snapshot();
    equal(after.quarantine.length, 1, "conflict quarantine should be durable");
    equal(after.profiles.get("server-profile-4").balance, 40, "conflict must not mutate member profile");
    equal(after.ledger.size, 4, "conflict must not mutate ledgers");
    equal(after.inventory.size, 4, "conflict must not mutate inventory");
  }

  console.log(`hosted settlement service: ${assertions} assertions passed`);
}

main();
