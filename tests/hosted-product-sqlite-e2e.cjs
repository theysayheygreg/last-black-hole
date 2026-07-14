"use strict";

const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { HostedIdentityService } = require("../scripts/hosted-identity-service.cjs");
const { SqliteHostedIdentityRepository } = require("../scripts/sqlite-hosted-identity-repository.cjs");
const { createHostedPlacementService } = require("../scripts/hosted-placement-service.cjs");
const { SqliteHostedPlacementRepository } = require("../scripts/sqlite-hosted-placement-repository.cjs");
const { SqliteHostedProductRepository } = require("../scripts/sqlite-hosted-product-repository.cjs");
const { SQLiteHostedResultOutbox } = require("../scripts/sqlite-hosted-result-outbox.cjs");
const { SQLiteHostedSettlementRepository } = require("../scripts/sqlite-hosted-settlement-repository.cjs");
const { HostedSettlementService } = require("../scripts/hosted-settlement-service.cjs");
const { createHostedProductService } = require("../scripts/hosted-product-service.cjs");

const root = fs.mkdtempSync(path.join(os.tmpdir(), "lbh-hosted-product-e2e-"));
const filepath = path.join(root, "hosted.sqlite");
let now = 2_000_000;
let sequence = 0;
const proofs = new Map();
const diagnostics = [];
const descriptor = {
  authorityInstanceId: "authority-durable-1", authorityIncarnation: "authority-durable-1-incarnation-7",
  credentialBinding: "binding-durable-7", region: "ord", artifactSha: "a".repeat(64),
  protocolVersion: "lbh-multiplayer-json-v2", manifestHash: "m".repeat(64),
  capabilities: ["state-pair-v1"], maxMatches: 1, maxSeats: 4,
  workloadKeyId: "workload-key-durable-7", endpoint: "wss://durable.internal",
};
const ids = { next(prefix) { sequence += 1; return `${prefix}_${String(sequence).padStart(8, "0")}`; } };
const randomBytes = (size) => {
  const bytes = Buffer.alloc(size); bytes.writeBigUInt64BE(BigInt(++sequence), Math.max(0, size - 8)); return bytes;
};
const provider = {
  verifyGrant({ proof, expected }) {
    const row = proofs.get(proof);
    if (!row) return null;
    return { subject: row.subject, issuer: expected.issuer, audience: expected.audience,
      appId: expected.appId, grantType: expected.grantType, providerGrantId: row.grantId,
      state: row.state, observationVersion: row.version, observedAt: row.observedAt };
  },
};

function placementIdentity() {
  const { credentialBinding, ...identity } = descriptor;
  return identity;
}

function acceptedFromPlacement(repository, entry) {
  const run = repository.getRun(entry.run_id);
  if (!run || run.resultAcceptanceState !== "ACCEPTED" || run.acceptedResultHash !== entry.result_hash
      || run.authorityLeaseId !== entry.authority.lease_id || run.leaseEpoch !== entry.authority.lease_epoch
      || run.authorityIncarnation !== entry.authority.authority_incarnation) return null;
  return { accepted: true, run_id: run.runId, lease_id: run.authorityLeaseId,
    lease_epoch: run.leaseEpoch, authority_incarnation: run.authorityIncarnation,
    result_hash: run.acceptedResultHash, accepted_at: run.acceptedAt };
}

function openStack() {
  const identityRepository = new SqliteHostedIdentityRepository({ filepath,
    subjectLookupKey: crypto.createHash("sha256").update("identity-subject-key").digest() });
  const placementRepository = new SqliteHostedPlacementRepository({ filename: filepath, now: () => now });
  const productRepository = new SqliteHostedProductRepository({ filepath,
    encryptionKey: "product-encryption-key-at-least-32-bytes", encryptionKeyId: "product-key-1", randomBytes });
  const outbox = new SQLiteHostedResultOutbox({ filepath, now: () => now, randomBytes,
    acceptAuthorityResult: (identity, resultHash) => placementRepository.acceptAuthorityResult(identity, resultHash) });
  const settlementRepository = new SQLiteHostedSettlementRepository({ filepath, now: () => now,
    verifyAcceptedAuthorityResult: (entry) => acceptedFromPlacement(placementRepository, entry) });
  const identity = new HostedIdentityService({
    repository: identityRepository,
    providers: { test: { adapter: provider, issuer: "test-issuer", audience: "lbh-client",
      appId: "lbh", grantType: "base_game" } },
    clock: { now: () => now }, crypto: {
      randomId: (prefix) => ids.next(prefix), randomToken: () => `${ids.next("token")}_${"x".repeat(40)}`,
      hash: (value) => crypto.createHash("sha256").update(value).digest("hex"),
    }, diagnosticKey: "durable-identity-diagnostic-key-32-bytes", accessTtlMs: 100_000, refreshTtlMs: 1_000_000,
  });
  const placement = createHostedPlacementService({
    repository: placementRepository, now: () => now, randomBytes,
    tokenKey: crypto.createHash("sha256").update("durable-placement-token-key").digest(),
    diagnosticKey: crypto.createHash("sha256").update("durable-diagnostic-key").digest(),
    authenticateWorkload: (credential) => credential === "workload" ? placementIdentity() : null,
    authenticateControlPlane: (credential) => credential === "internal-control" ? { role: "CONTROL_PLANE" } : null,
    readinessTtlMs: 10_000, leaseTtlMs: 10_000, bootstrapTtlMs: 10_000,
    ticketTtlMs: 10_000, measuredPackingLimit: 1,
  });
  const settlement = new HostedSettlementService({ outbox, repository: settlementRepository,
    workerId: "durable-worker", leaseMs: 1_000 });
  const product = createHostedProductService({
    identity, placement, outbox, settlement, repository: productRepository, ids, clock: { now: () => now },
    controlCredential: "internal-control",
    authenticateControl: (credential) => credential === "operator" ? { role: "CONTROL_PLANE" } : null,
    resolveWorkloadIdentity: (credential) => credential === "workload" ? descriptor : null,
    placementPolicy: () => ({ regionPreferences: ["ord"], artifactSha: descriptor.artifactSha,
      protocolVersion: descriptor.protocolVersion, manifestHash: descriptor.manifestHash,
      capabilities: descriptor.capabilities }),
    diagnostics: (event) => diagnostics.push(event),
    diagnosticKey: "durable-product-diagnostic-key-32-bytes",
  });
  return {
    identityRepository, placementRepository, productRepository, outbox, settlementRepository, product, placement,
    close() {
      settlementRepository.close(); outbox.close(); productRepository.close();
      placementRepository.close(); identityRepository.close();
    },
  };
}

function createUser(stack, name) {
  const proof = `proof-${name}`;
  proofs.set(proof, { subject: `subject-${name}`, grantId: `grant-${name}`,
    state: "active", version: 1, observedAt: now });
  const session = stack.product.exchangeProviderProof({ provider: "test", proof, callbackId: `callback-${name}` });
  const profile = stack.product.createProfile({ accessToken: session.accessToken, displayName: name });
  return { ...session, ...profile, name };
}

try {
  let stack = openStack();
  stack.placement.registerCapacity({ credential: "workload", registration: {
    authorityInstanceId: descriptor.authorityInstanceId, authorityIncarnation: descriptor.authorityIncarnation,
    region: descriptor.region, artifactSha: descriptor.artifactSha, protocolVersion: descriptor.protocolVersion,
    manifestHash: descriptor.manifestHash, capabilities: descriptor.capabilities,
    maxMatches: descriptor.maxMatches, maxSeats: descriptor.maxSeats, workloadKeyId: descriptor.workloadKeyId,
    observedAllocation: 0, maintenance: false, draining: false, heartbeatTtlMs: 100_000,
  } });
  const users = ["Ada", "Bea", "Cy", "Dee"].map((name) => createUser(stack, name));
  const match = stack.product.clientCreateMatch({ accessToken: users[0].accessToken,
    profileId: users[0].profileId, seatCount: 4, clientIncarnation: "client-0", playerAlias: "Ada" });
  users.slice(1).forEach((user, index) => stack.product.clientJoinMatch({ accessToken: user.accessToken,
    profileId: user.profileId, joinCode: match.joinCode, clientIncarnation: `client-${index + 1}`,
    playerAlias: user.name }));
  const allocation = stack.product.controlGetAllocation({ credential: "operator", matchId: match.matchId });
  const redeemed = stack.product.workloadRedeem({ credential: "workload", allocationHandle: allocation.allocationHandle,
    bootstrap: allocation.bootstrap, audience: allocation.audience });
  stack.product.workloadReady({ credential: "workload", workloadRunHandle: redeemed.workloadRunHandle });
  for (const user of users) {
    const admission = stack.product.clientAdmission({ accessToken: user.accessToken,
      profileId: user.profileId, matchId: match.matchId });
    stack.product.workloadRedeemAdmission({ credential: "workload",
      workloadRunHandle: redeemed.workloadRunHandle, ticket: admission.ticket });
  }
  const durableMatch = stack.productRepository.getMatch(match.matchId);
  const admitted = stack.productRepository.listMemberships(match.matchId).filter((member) => member.admittedAt != null);
  assert.equal(admitted.length, 4);
  stack.settlementRepository.setRunMemberships(durableMatch.runId, admitted.map((member) => ({
    run_membership_id: member.runMembershipId, profile_id: member.profileId,
  })));
  stack.close();

  // Each adapter reopens its own connection to the same durable file. The
  // placement acceptance is intentionally not claimed to be a cross-database
  // transaction: outbox retry repairs the narrow CAS-before-enqueue window,
  // and settlement freshly revalidates the immutable placement acceptance.
  stack = openStack();
  assert.equal(stack.productRepository.listMemberships(match.matchId).filter((member) => member.admittedAt != null).length, 4);
  stack.product.workloadHeartbeat({ credential: "workload", workloadRunHandle: redeemed.workloadRunHandle,
    metrics: { connections: 4, queueDepth: 0, memoryBytes: 1024 } });
  stack.product.workloadBeginDrain({ credential: "workload", workloadRunHandle: redeemed.workloadRunHandle });
  const outcomes = Object.fromEntries(admitted.map((member) => [member.runMembershipId, {
    outcome: "extracted", duration_ms: 90_000, em_earned: 10 + member.seatNo, cargo: [],
  }]));
  const accepted = stack.product.workloadSubmitResult({ credential: "workload",
    workloadRunHandle: redeemed.workloadRunHandle, payload: { result_version: 1, outcomes } });
  const terminal = stack.placementRepository.getRun(durableMatch.runId);
  assert.equal(terminal.resultAcceptanceState, "ACCEPTED");
  assert.equal(terminal.state, "ENDED");
  assert.equal(terminal.leaseStatus, "ENDED");
  const nextMatch = stack.product.clientCreateMatch({ accessToken: users[0].accessToken,
    profileId: users[0].profileId, seatCount: 1, clientIncarnation: "client-next", playerAlias: "Ada" });
  assert.equal(nextMatch.state, "ALLOCATING", "accepted terminal run releases measured packing capacity");
  stack.placementRepository.cleanup({ now, terminalBefore: now, keepTerminal: 8 });
  assert.equal(stack.placementRepository.getRun(durableMatch.runId).resultAcceptanceState, "ACCEPTED",
    "cleanup retains accepted lineage until a future settlement-ack archive protocol");
  assert.equal(stack.placementRepository.acceptAuthorityResult(accepted.authority, accepted.result_hash).accepted, true,
    "same accepted lineage and hash remain replayable from the retained tombstone");
  assert.equal(stack.product.workloadEnd({ credential: "workload",
    workloadRunHandle: redeemed.workloadRunHandle }).acceptedResultId, accepted.result_id);
  let committed;
  try { committed = stack.product.controlDeliverSettlement({ credential: "operator" }); }
  catch (error) { error.message += ` (${JSON.stringify(diagnostics.at(-1))})`; throw error; }
  assert.equal(committed.members.length, 4);
  assert.equal(stack.settlementRepository.counts().hosted_settlements, 1);
  stack.close();

  stack = openStack();
  assert.equal(stack.product.controlDeliverSettlement({ credential: "operator" }), null);
  assert.equal(stack.settlementRepository.counts().hosted_settlements, 1);
  const replay = stack.settlementRepository.settle(stack.outbox.get(accepted.result_id));
  assert.equal(replay.replayed, true);
  assert.equal(stack.settlementRepository.counts().hosted_settlements, 1);
  for (let index = 0; index < users.length; index += 1) {
    assert.equal(stack.settlementRepository.getProfile(users[index].profileId).balance, 10 + index);
  }
  assert.deepEqual(stack.settlementRepository.integrityCheck(), ["ok"]);
  assert.deepEqual(stack.settlementRepository.foreignKeyCheck(), []);
  stack.close();
  console.log("hosted product sqlite e2e: four-member reopen and exactly-once settlement PASS");
} finally {
  fs.rmSync(root, { recursive: true, force: true });
}
