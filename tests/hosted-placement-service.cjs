const assert = require("assert");
const crypto = require("crypto");
const { InMemoryPlacementRepository } = require("../scripts/hosted-placement-repository.cjs");
const { HostedPlacementError, createHostedPlacementService } = require("../scripts/hosted-placement-service.cjs");

let passed = 0;
async function test(name, fn) {
  await fn();
  passed += 1;
  process.stdout.write(`PASS ${name}\n`);
}

function rejection(fn, code) {
  assert.throws(fn, (error) => error?.code === code, code);
}

function harness({ capacity = 24, tombstoneLimit = 4 } = {}) {
  let clock = 1_000_000;
  let sequence = 0;
  const logs = [];
  const repository = new InMemoryPlacementRepository({ tombstoneLimit });
  const descriptors = new Map();
  for (let index = 0; index < capacity; index++) {
    descriptors.set(`workload-${index}`, {
      authorityInstanceId: `authority-${index}`,
      authorityIncarnation: `authority-${index}-incarnation-1`,
      region: index < capacity - 1 ? "ord" : "iad",
      artifactSha: "a".repeat(64), protocolVersion: "lbh-multiplayer-json-v2",
      manifestHash: "m".repeat(64), capabilities: ["state-pair-v1", "state-pair-brotli-v1"],
      maxMatches: 8, maxSeats: 4, workloadKeyId: `key-${index}`, endpoint: `wss://authority-${index}.internal`,
    });
  }
  const randomBytes = (size) => {
    const output = Buffer.alloc(size);
    output.writeBigUInt64BE(BigInt(++sequence), Math.max(0, size - 8));
    return output;
  };
  const options = {
    repository, now: () => clock, randomBytes,
    tokenKey: crypto.createHash("sha256").update("placement-token-test-key").digest(),
    diagnosticKey: crypto.createHash("sha256").update("diagnostic-test-key").digest(),
    authenticateWorkload: (credential) => descriptors.get(credential) || null,
    authenticateControlPlane: (credential) => credential === "control-plane" ? { role: "CONTROL_PLANE" } : null,
    logger: (entry) => logs.push(entry), bootstrapTtlMs: 100, ticketTtlMs: 1_000,
    readinessTtlMs: 150, leaseTtlMs: 200, measuredPackingLimit: 1,
  };
  const service = createHostedPlacementService(options);

  function registration(index, overrides = {}) {
    const trusted = descriptors.get(`workload-${index}`);
    return {
      authorityInstanceId: trusted.authorityInstanceId, authorityIncarnation: trusted.authorityIncarnation,
      region: trusted.region,
      artifactSha: trusted.artifactSha, protocolVersion: trusted.protocolVersion,
      manifestHash: trusted.manifestHash, capabilities: trusted.capabilities,
      maxMatches: trusted.maxMatches, maxSeats: trusted.maxSeats, observedAllocation: 0,
      maintenance: false, draining: false, heartbeatTtlMs: 5_000, workloadKeyId: trusted.workloadKeyId,
      ...overrides,
    };
  }

  function register(index, overrides) {
    return service.registerCapacity({ credential: `workload-${index}`, registration: registration(index, overrides) });
  }

  function request(run, overrides = {}) {
    return {
      requestId: `request-${run}`, runId: run, sessionId: `session-${run}`, seatCount: 4,
      regionPreferences: ["ord", "iad"], artifactSha: "a".repeat(64),
      protocolVersion: "lbh-multiplayer-json-v2", manifestHash: "m".repeat(64),
      capabilities: ["state-pair-v1", "state-pair-brotli-v1"], ...overrides,
    };
  }

  function place(run, overrides) {
    return service.requestPlacement({ credential: "control-plane", request: request(run, overrides) });
  }

  function bootstrap(index, placement) {
    return service.redeemBootstrap({
      credential: `workload-${index}`, bootstrap: placement.bootstrap, audience: `authority:authority-${index}`,
    });
  }

  function ready(index, claims) {
    return service.markReady({ credential: `workload-${index}`, runId: claims.runId,
      authorityLeaseId: claims.authorityLeaseId, leaseEpoch: claims.leaseEpoch });
  }

  function member(seatNo = 0, suffix = String(seatNo)) {
    return {
      accountId: `account-secret-${suffix}`, profileId: `profile-secret-${suffix}`,
      sessionMembershipId: `session-member-${suffix}`, runMembershipId: `run-member-${suffix}`,
      playerAlias: `Pilot ${seatNo + 1}`, seatNo, clientIncarnation: `client-process-${suffix}`,
    };
  }

  return {
    repository, service, options, logs, descriptors, register, registration, request, place, bootstrap, ready, member,
    assignedIndex(runId) { return Number(repository.getRun(runId).authorityInstanceId.split("-").pop()); },
    advance(ms) { clock += ms; }, now() { return clock; }, serviceWorker() { return createHostedPlacementService(options); },
  };
}

(async () => {
  await test("capacity registration is workload-bound and rejects caller-selected identity", () => {
    const h = harness({ capacity: 1 });
    h.register(0);
    rejection(() => h.service.registerCapacity({ credential: "workload-0", registration: h.registration(0, { region: "bogus" }) }), "WORKLOAD_IDENTITY_MISMATCH");
    rejection(() => h.service.registerCapacity({ credential: "workload-0", registration: h.registration(0,
      { authorityIncarnation: "authority-0-incarnation-restarted" }) }), "WORKLOAD_IDENTITY_MISMATCH");
    rejection(() => h.service.registerCapacity({ credential: "bad", registration: h.registration(0) }), "WORKLOAD_AUTH_REQUIRED");
  });

  await test("two placement workers repeatedly race and exactly one receives bootstrap", async () => {
    const h = harness({ capacity: 20 });
    for (let index = 0; index < 20; index++) h.register(index);
    const workerA = h.service;
    const workerB = h.serviceWorker();
    for (let index = 0; index < 20; index++) {
      const request = h.request(`race-${index}`);
      const outcomes = await Promise.all([
        Promise.resolve().then(() => workerA.requestPlacement({ credential: "control-plane", request })),
        Promise.resolve().then(() => workerB.requestPlacement({ credential: "control-plane", request })),
      ]);
      assert.strictEqual(outcomes.filter((entry) => entry.won).length, 1);
      assert.strictEqual(outcomes.filter((entry) => Object.hasOwn(entry, "bootstrap")).length, 1);
    }
  });

  await test("concurrent runs receive distinct placements leases and authority instances", () => {
    const h = harness({ capacity: 3 });
    h.register(0); h.register(1); h.register(2);
    const placements = [h.place("alpha"), h.place("beta"), h.place("gamma")];
    const assigned = h.repository.snapshot().runs.map((run) => Number(run.authorityInstanceId.split("-").pop()));
    const claims = placements.map((placement, index) => h.bootstrap(assigned[index], placement));
    assert.strictEqual(new Set(claims.map((entry) => entry.placementId)).size, 3);
    assert.strictEqual(new Set(claims.map((entry) => entry.authorityLeaseId)).size, 3);
    assert.strictEqual(new Set(claims.map((entry) => entry.authorityInstanceId)).size, 3);
  });

  await test("capacity exhaustion and artifact protocol manifest mismatch allocate nothing", () => {
    const h = harness({ capacity: 1 });
    h.register(0);
    assert.strictEqual(h.place("only").won, true);
    assert.deepStrictEqual(h.place("exhausted"), { won: false, state: "UNPLACED" });
    const h2 = harness({ capacity: 1 });
    h2.register(0);
    for (const override of [
      { artifactSha: "b".repeat(64) }, { protocolVersion: "wrong-v3" }, { manifestHash: "x".repeat(64) },
      { capabilities: ["state-pair-v1", "unavailable"] },
    ]) assert.strictEqual(h2.place(`mismatch-${Object.keys(override)[0]}`, override).won, false);
  });

  await test("fifth and eighth seats reject before allocation", () => {
    const h = harness({ capacity: 1 });
    h.register(0);
    rejection(() => h.place("five", { seatCount: 5 }), "INVALID_REQUEST");
    rejection(() => h.place("eight", { seatCount: 8 }), "INVALID_REQUEST");
    assert.strictEqual(h.repository.snapshot().runs.length, 0);
  });

  await test("leader/client authority and placement selectors are rejected by exact schema", () => {
    const h = harness({ capacity: 1 });
    h.register(0);
    rejection(() => h.service.requestPlacement({ credential: "leader", request: h.request("leader") }), "CONTROL_PLANE_AUTH_REQUIRED");
    rejection(() => h.service.requestPlacement({ credential: "control-plane", request: {
      ...h.request("selector"), authorityInstanceId: "authority-0", authorityLeaseId: "lease-chosen",
    } }), "INVALID_REQUEST");
  });

  await test("idempotency keys cannot be rebound to another run", () => {
    const h = harness({ capacity: 2 });
    h.register(0); h.register(1);
    h.place("idempotent-one", { requestId: "same-request-key" });
    rejection(() => h.place("idempotent-two", { requestId: "same-request-key" }), "IDEMPOTENCY_CONFLICT");
    assert.strictEqual(h.repository.snapshot().runs.length, 1);
  });

  await test("readiness cannot bypass successful single-use bootstrap redemption", () => {
    const h = harness({ capacity: 1 });
    h.register(0);
    h.place("bootstrap-required");
    const run = h.repository.getRun("bootstrap-required");
    rejection(() => h.service.markReady({ credential: "workload-0", runId: run.runId,
      authorityLeaseId: run.authorityLeaseId, leaseEpoch: run.leaseEpoch }), "DUPLICATE_OR_STALE_READY");
  });

  await test("bootstrap is opaque audience-bound single-use expiring and authenticated", () => {
    const h = harness({ capacity: 4 });
    for (let index = 0; index < 4; index++) h.register(index);
    const first = h.place("bootstrap-first");
    assert(!first.bootstrap.includes("bootstrap-first"));
    const claims = h.bootstrap(h.assignedIndex("bootstrap-first"), first);
    assert.strictEqual(claims.maxSeats, 4);
    assert.strictEqual(claims.authorityIncarnation, "authority-0-incarnation-1");
    rejection(() => h.bootstrap(h.assignedIndex("bootstrap-first"), first), "BOOTSTRAP_REPLAY");
    const second = h.place("bootstrap-audience");
    const secondIndex = h.assignedIndex("bootstrap-audience");
    const wrongIndex = secondIndex === 0 ? 1 : 0;
    rejection(() => h.service.redeemBootstrap({ credential: `workload-${wrongIndex}`, bootstrap: second.bootstrap, audience: `authority:authority-${wrongIndex}` }), "TOKEN_REJECTED");
    const forged = second.bootstrap.slice(0, -1) + (second.bootstrap.endsWith("A") ? "B" : "A");
    rejection(() => h.service.redeemBootstrap({ credential: `workload-${secondIndex}`, bootstrap: forged, audience: `authority:authority-${secondIndex}` }), "TOKEN_REJECTED");
    const third = h.place("bootstrap-expiry");
    h.advance(100);
    rejection(() => h.bootstrap(h.assignedIndex("bootstrap-expiry"), third), "BOOTSTRAP_REJECTED");
  });

  await test("ready route heartbeat admission and current result eligibility form one fenced lineage", () => {
    const h = harness({ capacity: 1 });
    h.register(0);
    const placement = h.place("lifecycle");
    const claims = h.bootstrap(0, placement);
    const route = h.ready(0, claims);
    const destination = h.service.validateRoute({ credential: "workload-0", route: route.route, runId: claims.runId });
    assert.strictEqual(destination.endpoint, "wss://authority-0.internal");
    assert.strictEqual(h.service.resultEligible({ credential: "workload-0", runId: claims.runId,
      authorityLeaseId: claims.authorityLeaseId, leaseEpoch: claims.leaseEpoch }), true);
    const ticket = h.service.issueAdmissionTicket({ credential: "control-plane", runId: claims.runId, member: h.member(0) });
    assert(!ticket.ticket.includes("account-secret") && !ticket.ticket.includes("profile-secret"));
    const admitted = h.service.redeemAdmissionTicket({ credential: "workload-0", ticket: ticket.ticket });
    assert.strictEqual(admitted.seatNo, 0);
    rejection(() => h.service.redeemAdmissionTicket({ credential: "workload-0", ticket: ticket.ticket }), "TICKET_REPLAY");
    const renewed = h.service.heartbeat({ credential: "workload-0", runId: claims.runId,
      authorityLeaseId: claims.authorityLeaseId, leaseEpoch: claims.leaseEpoch,
      metrics: { connections: 1, queueDepth: 0, memoryBytes: 2048 } });
    assert(renewed.leaseDeadlineAt > h.now());
    h.advance(150);
    h.service.heartbeat({ credential: "workload-0", runId: claims.runId,
      authorityLeaseId: claims.authorityLeaseId, leaseEpoch: claims.leaseEpoch });
    h.advance(60);
    assert.strictEqual(h.service.validateRoute({ credential: "workload-0", route: route.route, runId: claims.runId }).endpoint,
      "wss://authority-0.internal", "current route must survive its original heartbeat deadline after renewal");
  });

  await test("duplicate ready and duplicate end fail closed", () => {
    const h = harness({ capacity: 1 });
    h.register(0);
    const claims = h.bootstrap(0, h.place("duplicates"));
    h.ready(0, claims);
    rejection(() => h.ready(0, claims), "STALE_LEASE");
    h.service.endRun({ credential: "workload-0", runId: claims.runId,
      authorityLeaseId: claims.authorityLeaseId, leaseEpoch: claims.leaseEpoch, outcome: "ENDED" });
    rejection(() => h.service.endRun({ credential: "workload-0", runId: claims.runId,
      authorityLeaseId: claims.authorityLeaseId, leaseEpoch: claims.leaseEpoch, outcome: "ENDED" }), "STALE_LEASE");
  });

  await test("missed readiness fences before replacement and raises the epoch", () => {
    const h = harness({ capacity: 2 });
    h.register(0); h.register(1);
    const first = h.bootstrap(0, h.place("replace-before-ready"));
    h.advance(151);
    assert.deepStrictEqual(h.service.fenceExpired(), { fenced: 1 });
    const replacementRequest = h.request("replace-before-ready", { requestId: "replacement-request" });
    const replacement = h.service.requestReplacement({ credential: "control-plane", request: replacementRequest });
    assert.strictEqual(replacement.won, true);
    const second = h.bootstrap(1, replacement);
    assert.strictEqual(second.leaseEpoch, first.leaseEpoch + 1);
    rejection(() => h.ready(0, first), "STALE_LEASE");
  });

  await test("crash after admission interrupts and cannot transparently replace", () => {
    const h = harness({ capacity: 2 });
    h.register(0); h.register(1);
    const claims = h.bootstrap(0, h.place("after-admit"));
    h.ready(0, claims);
    const ticket = h.service.issueAdmissionTicket({ credential: "control-plane", runId: claims.runId, member: h.member(0) });
    h.service.redeemAdmissionTicket({ credential: "workload-0", ticket: ticket.ticket });
    h.advance(201);
    h.service.fenceExpired();
    rejection(() => h.service.requestReplacement({ credential: "control-plane",
      request: h.request("after-admit", { requestId: "replace-after-admit" }) }), "RUN_INTERRUPTED");
  });

  await test("drain refuses new work while live work can finish", () => {
    const h = harness({ capacity: 2 });
    h.register(0); h.register(1);
    const claims = h.bootstrap(0, h.place("draining-live"));
    h.ready(0, claims);
    h.service.setDrain({ credential: "workload-0", draining: true });
    const next = h.bootstrap(1, h.place("draining-new"));
    assert.strictEqual(next.authorityInstanceId, "authority-1");
    assert.deepStrictEqual(h.service.beginRunDrain({ credential: "workload-0", runId: claims.runId,
      authorityLeaseId: claims.authorityLeaseId, leaseEpoch: claims.leaseEpoch }), { state: "DRAINING" });
    assert.strictEqual(h.service.resultEligible({ credential: "workload-0", runId: claims.runId,
      authorityLeaseId: claims.authorityLeaseId, leaseEpoch: claims.leaseEpoch }), true);
  });

  await test("old route ticket heartbeat and result are fenced after pre-admit replacement", () => {
    const h = harness({ capacity: 2 });
    h.register(0); h.register(1);
    const oldClaims = h.bootstrap(0, h.place("fence-all"));
    const oldRoute = h.ready(0, oldClaims);
    const oldTicket = h.service.issueAdmissionTicket({ credential: "control-plane", runId: oldClaims.runId, member: h.member(0) });
    h.advance(201); h.service.fenceExpired();
    const replacement = h.service.requestReplacement({ credential: "control-plane",
      request: h.request("fence-all", { requestId: "fence-all-replacement" }) });
    const newClaims = h.bootstrap(1, replacement); h.ready(1, newClaims);
    rejection(() => h.service.validateRoute({ credential: "workload-0", route: oldRoute.route, runId: oldClaims.runId }), "STALE_LEASE");
    rejection(() => h.service.redeemAdmissionTicket({ credential: "workload-0", ticket: oldTicket.ticket }), "STALE_LEASE");
    rejection(() => h.service.heartbeat({ credential: "workload-0", runId: oldClaims.runId,
      authorityLeaseId: oldClaims.authorityLeaseId, leaseEpoch: oldClaims.leaseEpoch }), "STALE_LEASE");
    rejection(() => h.service.resultEligible({ credential: "workload-0", runId: oldClaims.runId,
      authorityLeaseId: oldClaims.authorityLeaseId, leaseEpoch: oldClaims.leaseEpoch }), "STALE_LEASE");
  });

  await test("multi-match route and lease material cannot cross runs", () => {
    const h = harness({ capacity: 2 });
    h.register(0); h.register(1);
    const one = h.bootstrap(0, h.place("isolation-one")); const routeOne = h.ready(0, one);
    const two = h.bootstrap(1, h.place("isolation-two")); h.ready(1, two);
    rejection(() => h.service.validateRoute({ credential: "workload-0", route: routeOne.route, runId: two.runId }), "TOKEN_REJECTED");
    rejection(() => h.service.resultEligible({ credential: "workload-1", runId: one.runId,
      authorityLeaseId: two.authorityLeaseId, leaseEpoch: two.leaseEpoch }), "STALE_LEASE");
  });

  await test("stale capacity heartbeat and maintenance records never receive allocation", () => {
    const h = harness({ capacity: 2 });
    h.register(0, { heartbeatTtlMs: 10 });
    h.register(1, { maintenance: true });
    h.advance(11);
    assert.strictEqual(h.place("no-healthy-capacity").won, false);
  });

  await test("ticket expiry forgery wrong workload and over-reservation fail closed", () => {
    const h = harness({ capacity: 2 });
    h.register(0); h.register(1);
    const claims = h.bootstrap(0, h.place("ticket-negative", { seatCount: 1 })); h.ready(0, claims);
    rejection(() => h.service.issueAdmissionTicket({ credential: "control-plane", runId: claims.runId, member: h.member(1) }), "SEAT_CAP");
    const ticket = h.service.issueAdmissionTicket({ credential: "control-plane", runId: claims.runId, member: h.member(0) });
    const forged = ticket.ticket.slice(0, -1) + (ticket.ticket.endsWith("A") ? "B" : "A");
    rejection(() => h.service.redeemAdmissionTicket({ credential: "workload-0", ticket: forged }), "TOKEN_REJECTED");
    rejection(() => h.service.redeemAdmissionTicket({ credential: "workload-1", ticket: ticket.ticket }), "TOKEN_REJECTED");
    h.advance(1_000);
    rejection(() => h.service.redeemAdmissionTicket({ credential: "workload-0", ticket: ticket.ticket }), "TICKET_REJECTED");
  });

  await test("two tickets for one membership cannot consume two seats", () => {
    const h = harness({ capacity: 1 });
    h.register(0);
    const claims = h.bootstrap(0, h.place("duplicate-membership")); h.ready(0, claims);
    const first = h.service.issueAdmissionTicket({ credential: "control-plane", runId: claims.runId, member: h.member(0) });
    const second = h.service.issueAdmissionTicket({ credential: "control-plane", runId: claims.runId, member: h.member(0) });
    h.service.redeemAdmissionTicket({ credential: "workload-0", ticket: first.ticket });
    rejection(() => h.service.redeemAdmissionTicket({ credential: "workload-0", ticket: second.ticket }), "MEMBERSHIP_ALREADY_ADMITTED");
    assert.strictEqual(h.repository.getRun(claims.runId).admittedCount, 1);
  });

  await test("two memberships cannot consume the same reserved seat", () => {
    const h = harness({ capacity: 1 });
    h.register(0);
    const claims = h.bootstrap(0, h.place("duplicate-seat")); h.ready(0, claims);
    const first = h.service.issueAdmissionTicket({ credential: "control-plane", runId: claims.runId, member: h.member(0, "seat-a") });
    const second = h.service.issueAdmissionTicket({ credential: "control-plane", runId: claims.runId, member: h.member(0, "seat-b") });
    h.service.redeemAdmissionTicket({ credential: "workload-0", ticket: first.ticket });
    rejection(() => h.service.redeemAdmissionTicket({ credential: "workload-0", ticket: second.ticket }), "SEAT_ALREADY_ADMITTED");
  });

  await test("repository rechecks capacity eligibility inside the claim transaction", () => {
    const repository = new InMemoryPlacementRepository();
    repository.registerCapacity({ authorityInstanceId: "authority-race", maxMatches: 1, placementLimit: 1, draining: false });
    repository.updateCapacity("authority-race", (capacity) => ({ ...capacity, draining: true }));
    const outcome = repository.claimPlacement({
      requestId: "capacity-race", runId: "capacity-race-run", candidates: ["authority-race"],
      isEligible: (capacity) => capacity.draining === false,
      create: () => { throw new Error("draining capacity must not be claimed"); },
    });
    assert.deepStrictEqual(outcome, { won: false, conflict: false, record: null });
  });

  await test("cleanup bounds terminal tombstones and consumed-token replay state", () => {
    const h = harness({ capacity: 8, tombstoneLimit: 4 });
    for (let index = 0; index < 8; index++) h.register(index);
    for (let index = 0; index < 8; index++) {
      const runId = `cleanup-${index}`;
      const placement = h.place(runId);
      const assigned = h.assignedIndex(runId);
      const claims = h.bootstrap(assigned, placement);
      h.ready(assigned, claims);
      const ticket = h.service.issueAdmissionTicket({ credential: "control-plane", runId: claims.runId, member: h.member(0, `cleanup-${index}`) });
      h.service.redeemAdmissionTicket({ credential: `workload-${assigned}`, ticket: ticket.ticket });
      h.service.endRun({ credential: `workload-${assigned}`, runId: claims.runId,
        authorityLeaseId: claims.authorityLeaseId, leaseEpoch: claims.leaseEpoch, outcome: "ENDED" });
      h.advance(1);
    }
    h.advance(1_001);
    const summary = h.service.cleanup({ terminalBefore: h.now(), keepTerminal: 4 });
    assert.deepStrictEqual(summary, { activeRuns: 0, consumedTokens: 0, tombstones: 4 });
  });

  await test("structured diagnostics contain aliases counts and states only", () => {
    const h = harness({ capacity: 1 });
    h.register(0);
    const claims = h.bootstrap(0, h.place("diagnostic-secret-run")); h.ready(0, claims);
    h.service.endRun({ credential: "workload-0", runId: claims.runId,
      authorityLeaseId: claims.authorityLeaseId, leaseEpoch: claims.leaseEpoch, outcome: "ENDED" });
    const encoded = JSON.stringify(h.logs);
    for (const forbidden of ["diagnostic-secret-run", "workload-0", "authority-0", "account-secret", "profile-secret", "lease_"]) {
      assert(!encoded.includes(forbidden), `diagnostics leaked ${forbidden}`);
    }
    for (const entry of h.logs) {
      assert(Object.keys(entry).every((key) => ["event", "code", "state", "seatCount", "candidateCount", "activeCount", "runAlias", "instanceAlias"].includes(key)));
    }
  });

  console.log(`hosted placement service: ${passed} adversarial groups passed`);
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
