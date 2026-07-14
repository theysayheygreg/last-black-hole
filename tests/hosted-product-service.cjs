"use strict";

const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const { HostedIdentityService } = require("../scripts/hosted-identity-service.cjs");
const { InMemoryHostedIdentityRepository } = require("../scripts/hosted-identity-repository.cjs");
const { createHostedPlacementService } = require("../scripts/hosted-placement-service.cjs");
const { InMemoryPlacementRepository } = require("../scripts/hosted-placement-repository.cjs");
const { InMemoryHostedResultOutbox, OUTBOX_STATES } = require("../scripts/hosted-result-outbox.cjs");
const { HostedSettlementService } = require("../scripts/hosted-settlement-service.cjs");
const { InMemoryHostedSettlementRepository } = require("../scripts/hosted-settlement-repository.cjs");
const { HostedProductPublicError, createHostedProductService } = require("../scripts/hosted-product-service.cjs");

function clone(value) { return value == null ? value : structuredClone(value); }
function cloneMap(map) { return new Map([...map].map(([key, value]) => [key, clone(value)])); }

class ProductRepository {
  constructor() {
    this.matches = new Map(); this.joinCodes = new Map(); this.memberships = new Map(); this.workloads = new Map();
  }
  transaction(fn) {
    const before = { matches: cloneMap(this.matches), joinCodes: cloneMap(this.joinCodes),
      memberships: cloneMap(this.memberships), workloads: cloneMap(this.workloads) };
    try { return fn(this); } catch (error) { Object.assign(this, before); throw error; }
  }
  createMatch(value) {
    if (this.matches.has(value.matchId) || this.joinCodes.has(value.joinCode)) throw new Error("duplicate match");
    this.matches.set(value.matchId, clone(value)); this.joinCodes.set(value.joinCode, value.matchId);
  }
  getMatch(id) { return clone(this.matches.get(id) || null); }
  getMatchByJoinCode(code) { return this.getMatch(this.joinCodes.get(code)); }
  getMatchByAllocation(handle) { return clone([...this.matches.values()].find((match) => match.allocationHandle === handle) || null); }
  updateMatch(id, mutate) { const next = mutate(this.getMatch(id)); this.matches.set(id, clone(next)); return clone(next); }
  key(matchId, profileId) { return `${matchId}\0${profileId}`; }
  addMembership(value) {
    const key = this.key(value.matchId, value.profileId);
    if (this.memberships.has(key)) throw new Error("duplicate membership");
    this.memberships.set(key, clone(value));
  }
  getMembership(matchId, profileId) { return clone(this.memberships.get(this.key(matchId, profileId)) || null); }
  listMemberships(matchId) { return [...this.memberships.values()].filter((value) => value.matchId === matchId).map(clone); }
  markMembershipAdmitted(matchId, runMembershipId, admittedAt) {
    const entry = [...this.memberships.entries()].find(([, value]) => value.matchId === matchId
      && value.runMembershipId === runMembershipId);
    if (!entry) return null;
    const next = { ...entry[1], admittedAt }; this.memberships.set(entry[0], clone(next)); return clone(next);
  }
  putWorkloadContext(value) { this.workloads.set(value.workloadRunHandle, clone(value)); }
  getWorkloadContext(handle) { return clone(this.workloads.get(handle) || null); }
  updateWorkloadContext(handle, mutate) {
    const next = mutate(this.getWorkloadContext(handle)); this.workloads.set(handle, clone(next)); return clone(next);
  }
  owner(runId) {
    const match = [...this.matches.values()].find((value) => value.runId === runId);
    if (!match) return null;
    const owner = this.listMemberships(match.matchId).find((value) => value.seatNo === 0);
    return owner ? { profile_id: owner.profileId, account_id: owner.accountId } : null;
  }
}

function rig() {
  let now = 1_000_000;
  let sequence = 0;
  let crashAfterCommit = false;
  const proofs = new Map();
  const diagnostics = [];
  const ids = { next(prefix) { sequence += 1; return `${prefix}_${String(sequence).padStart(7, "0")}`; } };
  const randomBytes = (size) => {
    const value = Buffer.alloc(size); value.writeBigUInt64BE(BigInt(++sequence), Math.max(0, size - 8)); return value;
  };
  const identityRepository = new InMemoryHostedIdentityRepository();
  const provider = {
    verifyGrant({ proof, expected }) {
      const row = proofs.get(proof);
      if (!row || expected.issuer !== "test-issuer" || expected.audience !== "lbh-client"
          || expected.appId !== "lbh" || expected.grantType !== "base_game") return null;
      return { subject: row.subject, issuer: expected.issuer, audience: expected.audience,
        appId: expected.appId, grantType: expected.grantType, providerGrantId: row.grantId,
        state: row.state, observationVersion: row.version, observedAt: row.observedAt };
    },
  };
  const identity = new HostedIdentityService({
    repository: identityRepository, providers: { test: { adapter: provider, issuer: "test-issuer",
      audience: "lbh-client", appId: "lbh", grantType: "base_game" } }, clock: { now: () => now },
    crypto: {
      randomId: (prefix) => ids.next(prefix), randomToken: () => `${ids.next("token")}_${"x".repeat(40)}`,
      hash: (value) => crypto.createHash("sha256").update(value).digest("hex"),
    }, diagnosticKey: "identity-diagnostic-key-at-least-32-bytes",
    accessTtlMs: 50_000, refreshTtlMs: 500_000,
  });
  const descriptors = new Map();
  for (let index = 0; index < 6; index += 1) descriptors.set(`workload-${index}`, {
    authorityInstanceId: `authority-${index}`, authorityIncarnation: `authority-${index}-incarnation-1`,
    credentialBinding: `binding-${index}`, region: "ord", artifactSha: "a".repeat(64),
    protocolVersion: "lbh-multiplayer-json-v2", manifestHash: "m".repeat(64),
    capabilities: ["state-pair-v1"], maxMatches: 8, maxSeats: 4,
    workloadKeyId: `key-${index}`, endpoint: `wss://authority-${index}.internal`,
  });
  const placementRepository = new InMemoryPlacementRepository();
  const placement = createHostedPlacementService({
    repository: placementRepository, now: () => now, randomBytes,
    tokenKey: crypto.createHash("sha256").update("product-placement-token-key").digest(),
    diagnosticKey: crypto.createHash("sha256").update("product-diagnostic-key").digest(),
    authenticateWorkload: (credential) => {
      const row = descriptors.get(credential); if (!row) return null;
      const { credentialBinding, ...placementIdentity } = row; return placementIdentity;
    },
    authenticateControlPlane: (credential) => credential === "internal-control" ? { role: "CONTROL_PLANE" } : null,
    readinessTtlMs: 100, leaseTtlMs: 200, bootstrapTtlMs: 100, ticketTtlMs: 1_000,
    measuredPackingLimit: 1,
  });
  for (let index = 0; index < 6; index += 1) {
    const row = descriptors.get(`workload-${index}`);
    placement.registerCapacity({ credential: `workload-${index}`, registration: {
      authorityInstanceId: row.authorityInstanceId, authorityIncarnation: row.authorityIncarnation,
      region: row.region, artifactSha: row.artifactSha,
      protocolVersion: row.protocolVersion, manifestHash: row.manifestHash, capabilities: row.capabilities,
      maxMatches: row.maxMatches, maxSeats: row.maxSeats, observedAllocation: 0, maintenance: false,
      draining: false, heartbeatTtlMs: 10_000, workloadKeyId: row.workloadKeyId,
    } });
  }
  const productRepository = new ProductRepository();
  const acceptedResults = new Map();
  const outbox = new InMemoryHostedResultOutbox({
    now: () => now, baseBackoffMs: 10, randomBytes: () => Buffer.alloc(20, 9),
    acceptAuthorityResult(authority, resultHash) {
      const run = placementRepository.getRun(authority.run_id);
      if (!run) return null;
      const descriptor = [...descriptors.values()].find((value) => value.authorityInstanceId === run.authorityInstanceId);
      const valid = run.leaseStatus === "ACTIVE" && run.state === "DRAINING"
        && run.authorityLeaseId === authority.lease_id && run.leaseEpoch === authority.lease_epoch
        && descriptor.authorityIncarnation === authority.authority_incarnation;
      if (!valid) return null;
      const prior = acceptedResults.get(run.runId);
      if (prior && (prior.result_hash !== resultHash || prior.lease_id !== authority.lease_id
          || prior.lease_epoch !== authority.lease_epoch)) return null;
      const accepted = prior || { accepted: true, run_id: run.runId, lease_id: authority.lease_id,
        lease_epoch: authority.lease_epoch, authority_incarnation: authority.authority_incarnation,
        result_hash: resultHash };
      acceptedResults.set(run.runId, accepted);
      return clone(accepted);
    },
  });
  const settlementRepository = new InMemoryHostedSettlementRepository({
    now: () => now,
    resolveRunMemberships(runId) {
      const match = [...productRepository.matches.values()].find((value) => value.runId === runId);
      return match ? productRepository.listMemberships(match.matchId).filter((member) => member.admittedAt).map((member) => ({
        run_membership_id: member.runMembershipId, profile_id: member.profileId,
      })) : [];
    },
    verifyAcceptedAuthorityResult(entry) { return clone(acceptedResults.get(entry.run_id) || null); },
  });
  const settlement = new HostedSettlementService({
    outbox, repository: settlementRepository, workerId: "worker", leaseMs: 100,
    fault(step) {
      if (step === "after-commit-before-ack" && crashAfterCommit) {
        crashAfterCommit = false; throw Object.assign(new Error("crash"), { crash: true });
      }
    },
  });
  const service = createHostedProductService({
    identity, placement, outbox, settlement, repository: productRepository, ids, clock: { now: () => now },
    controlCredential: "internal-control",
    authenticateControl: (credential) => credential === "operator" ? { role: "CONTROL_PLANE" } : null,
    resolveWorkloadIdentity: (credential) => descriptors.get(credential) || null,
    placementPolicy: () => ({ regionPreferences: ["ord"], artifactSha: "a".repeat(64),
      protocolVersion: "lbh-multiplayer-json-v2", manifestHash: "m".repeat(64), capabilities: ["state-pair-v1"] }),
    diagnostics: (event) => diagnostics.push(event), diagnosticKey: "product-diagnostic-key-at-least-32-bytes",
  });

  function makeUser(name) {
    const proof = `proof-${name}`; proofs.set(proof, { subject: `subject-${name}`, state: "active",
      grantId: `grant-${name}`, version: 1, observedAt: now });
    const session = service.exchangeProviderProof({ provider: "test", proof, callbackId: `callback-${name}` });
    const profile = service.createProfile({ accessToken: session.accessToken, displayName: name });
    return { name, proof, ...session, ...profile };
  }
  function revoke(user) {
    proofs.set(user.proof, { subject: `subject-${user.name}`, state: "revoked", grantId: `grant-${user.name}`,
      version: 2, observedAt: now + 1 });
    service.reconcileEntitlement({ provider: "test", proof: user.proof, callbackId: `revoke-${user.name}` });
  }
  function allocation(match, expectedIndex) {
    const selected = service.controlGetAllocation({ credential: "operator", matchId: match.matchId });
    const redeemed = service.workloadRedeem({ credential: `workload-${expectedIndex}`,
      allocationHandle: selected.allocationHandle, bootstrap: selected.bootstrap, audience: selected.audience });
    service.workloadReady({ credential: `workload-${expectedIndex}`, workloadRunHandle: redeemed.workloadRunHandle });
    return redeemed.workloadRunHandle;
  }
  function rejected(fn) {
    assert.throws(fn, (error) => error instanceof HostedProductPublicError
      && error.code === "HOSTED_PRODUCT_REJECTED" && error.message === "hosted product request rejected");
  }
  return { service, identityRepository, placementRepository, productRepository, settlementRepository, outbox,
    diagnostics, descriptors, makeUser, revoke, allocation, rejected,
    advance: (ms) => { now += ms; }, crashNext: () => { crashAfterCommit = true; } };
}

function main() {
  const h = rig();
  const users = ["Ada", "Bea", "Cy", "Dee", "Eve", "Fox"].map(h.makeUser);

  const matchA = h.service.clientCreateMatch({ accessToken: users[0].accessToken, profileId: users[0].profileId,
    seatCount: 4, clientIncarnation: "client-ada", playerAlias: "Ada" });
  const matchB = h.service.clientCreateMatch({ accessToken: users[4].accessToken, profileId: users[4].profileId,
    seatCount: 2, clientIncarnation: "client-eve", playerAlias: "Eve" });
  const runA = h.productRepository.getMatch(matchA.matchId).runId;
  const runB = h.productRepository.getMatch(matchB.matchId).runId;
  assert.notEqual(runA, runB, "concurrent matches have distinct server-derived runs");
  assert.notEqual(h.placementRepository.getRun(runA).authorityLeaseId, h.placementRepository.getRun(runB).authorityLeaseId,
    "concurrent matches have distinct authority leases");
  assert.notEqual(h.placementRepository.getRun(runA).authorityInstanceId, h.placementRepository.getRun(runB).authorityInstanceId,
    "packing limit one assigns distinct authority processes");
  assert.equal(JSON.stringify(matchA).includes("run_"), false, "client response hides durable run and lease identifiers");

  const handleA = h.allocation(matchA, 0);
  const handleB = h.allocation(matchB, 1);
  h.descriptors.set("workload-0-reincarnated", {
    ...h.descriptors.get("workload-0"), authorityIncarnation: "authority-0-incarnation-2",
    credentialBinding: "binding-0-incarnation-2",
  });
  h.rejected(() => h.service.workloadHeartbeat({ credential: "workload-0-reincarnated",
    workloadRunHandle: handleA, metrics: { connections: 0, queueDepth: 0, memoryBytes: 1 } }));
  for (let index = 1; index < 4; index += 1) {
    const joined = h.service.clientJoinMatch({ accessToken: users[index].accessToken, profileId: users[index].profileId,
      joinCode: matchA.joinCode, clientIncarnation: `client-${index}`, playerAlias: users[index].name });
    assert.equal(joined.seatNo, index);
  }
  h.rejected(() => h.service.clientJoinMatch({ accessToken: users[4].accessToken, profileId: users[4].profileId,
    joinCode: matchA.joinCode, clientIncarnation: "fifth", playerAlias: "Fifth" }));
  h.rejected(() => h.service.clientCreateMatch({ accessToken: users[5].accessToken, profileId: users[5].profileId,
    seatCount: 8, clientIncarnation: "eighth", playerAlias: "Eight" }));

  const ticketsA = users.slice(0, 4).map((user) => h.service.clientAdmission({
    accessToken: user.accessToken, profileId: user.profileId, matchId: matchA.matchId,
  }));
  for (const ticket of ticketsA) {
    const admitted = h.service.workloadRedeemAdmission({ credential: "workload-0", workloadRunHandle: handleA, ticket: ticket.ticket });
    assert.equal(admitted.admitted, true);
  }
  const ticketB = h.service.clientAdmission({ accessToken: users[4].accessToken, profileId: users[4].profileId, matchId: matchB.matchId });
  h.rejected(() => h.service.workloadRedeemAdmission({ credential: "workload-0", workloadRunHandle: handleA, ticket: ticketB.ticket }));
  h.rejected(() => h.service.clientAdmission({ accessToken: users[0].accessToken, profileId: users[4].profileId, matchId: matchB.matchId }));

  h.revoke(users[4]);
  h.rejected(() => h.service.clientAdmission({ accessToken: users[4].accessToken, profileId: users[4].profileId, matchId: matchB.matchId }));

  h.service.workloadBeginDrain({ credential: "workload-0", workloadRunHandle: handleA });
  const outcomes = {};
  for (const member of h.productRepository.listMemberships(matchA.matchId)) outcomes[member.runMembershipId] = {
    outcome: "extracted", duration_ms: 120_000, em_earned: member.seatNo === 0 ? 25 : 5,
    cargo: member.seatNo === 0 ? [{ item_id: "relic", value: 4 }] : [],
  };
  let accepted;
  try {
    accepted = h.service.workloadSubmitResult({ credential: "workload-0", workloadRunHandle: handleA,
      payload: { result_version: 1, outcomes } });
  } catch (error) {
    error.message += ` (${JSON.stringify(h.diagnostics.at(-1))})`;
    throw error;
  }
  assert.equal(h.outbox.get(accepted.result_id).state, OUTBOX_STATES.PENDING);
  h.rejected(() => h.service.controlReplaceMatch({ credential: "operator", matchId: matchA.matchId }));
  h.rejected(() => h.service.workloadSubmitResult({ credential: "workload-0", workloadRunHandle: handleA,
    payload: { result_version: 1, outcomes: { ...outcomes,
      [h.productRepository.listMemberships(matchA.matchId)[0].runMembershipId]: {
        outcome: "extracted", duration_ms: 120_000, em_earned: 26, cargo: [],
      } } } }));
  h.service.workloadEnd({ credential: "workload-0", workloadRunHandle: handleA });
  assert.equal(Object.hasOwn(h.service, "clientSettle"), false, "clients have no settlement operation");
  h.crashNext();
  h.rejected(() => h.service.controlDeliverSettlement({ credential: "operator" }));
  assert.equal(h.settlementRepository.snapshot().settlements.size, 1, "crash occurs after atomic settlement commit");
  assert.equal(h.outbox.get(accepted.result_id).state, OUTBOX_STATES.LEASED, "crash leaves delivery unacknowledged");
  h.advance(101);
  const replay = h.service.controlDeliverSettlement({ credential: "operator" });
  assert.equal(replay.replayed, true, "redelivery is exactly-once at settlement repository");
  assert.equal(h.outbox.get(accepted.result_id).state, OUTBOX_STATES.DELIVERED);
  assert.equal(h.settlementRepository.snapshot().profiles.get(users[0].profileId).balance, 25);

  const matchC = h.service.clientCreateMatch({ accessToken: users[5].accessToken, profileId: users[5].profileId,
    seatCount: 1, clientIncarnation: "client-fox", playerAlias: "Fox" });
  const oldAuthority = h.placementRepository.getRun(h.productRepository.getMatch(matchC.matchId).runId).authorityInstanceId;
  const oldIndex = Number(oldAuthority.split("-").pop());
  const handleC = h.allocation(matchC, oldIndex);
  h.advance(201);
  assert.equal(h.service.controlFenceExpired({ credential: "operator" }).fenced >= 1, true);
  h.service.controlReplaceMatch({ credential: "operator", matchId: matchC.matchId });
  const newRun = h.placementRepository.getRun(h.productRepository.getMatch(matchC.matchId).runId);
  assert.equal(newRun.leaseEpoch, 2, "replacement advances fencing epoch");
  assert.notEqual(newRun.authorityInstanceId, oldAuthority, "replacement moves to a different authority");
  h.rejected(() => h.service.workloadHeartbeat({ credential: `workload-${oldIndex}`, workloadRunHandle: handleC,
    metrics: { connections: 0, queueDepth: 0, memoryBytes: 1 } }));

  assert(h.diagnostics.length >= 7, "rejections emit bounded diagnostics");
  const text = JSON.stringify(h.diagnostics);
  for (const secret of [users[0].accountId, users[4].accountId, users[0].profileId, runA]) {
    assert.equal(text.includes(secret), false, "diagnostics must not disclose raw durable identity");
  }
  console.log("hosted product service: two matches, seat caps, fencing, entitlement, and settlement replay PASS");
}

main();
