const assert = require("assert");
const crypto = require("crypto");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { Worker } = require("worker_threads");
const { DatabaseSync } = require("node:sqlite");
const { SqliteHostedPlacementRepository } = require("../scripts/sqlite-hosted-placement-repository.cjs");
const { createHostedPlacementService } = require("../scripts/hosted-placement-service.cjs");

let passed = 0;
async function test(name, fn) {
  await fn();
  passed += 1;
  process.stdout.write(`PASS ${name}\n`);
}

function rejection(fn, code) {
  assert.throws(fn, (error) => error?.code === code, code);
}

function fixture({ measuredPackingLimit = 1, expirySweepLimit = 256 } = {}) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "lbh-placement-sqlite-"));
  const filename = path.join(directory, "placement.sqlite");
  let clock = 1_000_000;
  let sequence = 0;
  const tokenKey = crypto.createHash("sha256").update("sqlite-placement-token").digest();
  const diagnosticKey = crypto.createHash("sha256").update("sqlite-placement-diagnostic").digest();
  const descriptors = new Map([
    ["worker-a", {
      authorityInstanceId: "authority-a", authorityIncarnation: "authority-a-incarnation-1",
      region: "ord", artifactSha: "a".repeat(64),
      protocolVersion: "lbh-multiplayer-json-v2", manifestHash: "m".repeat(64),
      capabilities: ["state-pair-v1"], maxMatches: 8, maxSeats: 4,
      workloadKeyId: "key-a", endpoint: "wss://authority-a.internal",
    }],
    ["worker-b", {
      authorityInstanceId: "authority-b", authorityIncarnation: "authority-b-incarnation-1",
      region: "iad", artifactSha: "a".repeat(64),
      protocolVersion: "lbh-multiplayer-json-v2", manifestHash: "m".repeat(64),
      capabilities: ["state-pair-v1"], maxMatches: 8, maxSeats: 4,
      workloadKeyId: "key-b", endpoint: "wss://authority-b.internal",
    }],
  ]);
  const repositories = [];

  function openRepository(options = {}) {
    const repository = new SqliteHostedPlacementRepository({ filename, tombstoneLimit: 4,
      now: () => clock, ...options });
    repositories.push(repository);
    return repository;
  }

  function service(repository) {
    return createHostedPlacementService({
      repository, now: () => clock,
      randomBytes(size) {
        const output = Buffer.alloc(size);
        output.writeBigUInt64BE(BigInt(++sequence), size - 8);
        return output;
      },
      tokenKey, diagnosticKey,
      authenticateWorkload: (credential) => descriptors.get(credential) || null,
      authenticateControlPlane: (credential) => credential === "control" ? { role: "CONTROL_PLANE" } : null,
      bootstrapTtlMs: 1_000, ticketTtlMs: 2_000, readinessTtlMs: 1_500,
      leaseTtlMs: 2_000, measuredPackingLimit, expirySweepLimit,
    });
  }

  function registration(credential, overrides = {}) {
    const descriptor = descriptors.get(credential);
    return {
      authorityInstanceId: descriptor.authorityInstanceId,
      authorityIncarnation: descriptor.authorityIncarnation, region: descriptor.region,
      artifactSha: descriptor.artifactSha, protocolVersion: descriptor.protocolVersion,
      manifestHash: descriptor.manifestHash, capabilities: descriptor.capabilities,
      maxMatches: descriptor.maxMatches, maxSeats: descriptor.maxSeats, observedAllocation: 0,
      maintenance: false, draining: false, heartbeatTtlMs: 5_000,
      workloadKeyId: descriptor.workloadKeyId, ...overrides,
    };
  }

  function request(runId, overrides = {}) {
    return {
      requestId: `request-${runId}`, runId, sessionId: `session-${runId}`, seatCount: 4,
      regionPreferences: ["ord", "iad"], artifactSha: "a".repeat(64),
      protocolVersion: "lbh-multiplayer-json-v2", manifestHash: "m".repeat(64),
      capabilities: ["state-pair-v1"], ...overrides,
    };
  }

  function member(seatNo = 0) {
    return {
      accountId: `account-${seatNo}`, profileId: `profile-${seatNo}`,
      sessionMembershipId: `session-membership-${seatNo}`, runMembershipId: `run-membership-${seatNo}`,
      playerAlias: `Pilot ${seatNo + 1}`, seatNo, clientIncarnation: `client-${seatNo}`,
    };
  }

  return {
    filename, directory, descriptors, openRepository, service, registration, request, member,
    advance(ms) { clock += ms; },
    closeAll() {
      for (const repository of repositories) {
        try { repository.close(); } catch {}
      }
      fs.rmSync(directory, { recursive: true, force: true });
    },
  };
}

function register(service, h, credential = "worker-a", overrides) {
  return service.registerCapacity({ credential, registration: h.registration(credential, overrides) });
}

function place(service, h, runId, overrides) {
  return service.requestPlacement({ credential: "control", request: h.request(runId, overrides) });
}

function competingWorker(filename, request) {
  const repositoryPath = path.resolve(__dirname, "../scripts/sqlite-hosted-placement-repository.cjs");
  const servicePath = path.resolve(__dirname, "../scripts/hosted-placement-service.cjs");
  return new Promise((resolve, reject) => {
    const worker = new Worker(`
      const crypto = require("crypto");
      const { parentPort, workerData } = require("worker_threads");
      const { SqliteHostedPlacementRepository } = require(workerData.repositoryPath);
      const { createHostedPlacementService } = require(workerData.servicePath);
      try {
        const repository = new SqliteHostedPlacementRepository({ filename: workerData.filename });
        const service = createHostedPlacementService({
          repository,
          now: () => 1_000_000,
          randomBytes: crypto.randomBytes,
          tokenKey: crypto.createHash("sha256").update("sqlite-placement-token").digest(),
          diagnosticKey: crypto.createHash("sha256").update("sqlite-placement-diagnostic").digest(),
          authenticateWorkload: () => null,
          authenticateControlPlane: (credential) => credential === "control" ? { role: "CONTROL_PLANE" } : null,
          measuredPackingLimit: 1,
        });
        const outcome = service.requestPlacement({ credential: "control", request: workerData.request });
        repository.close();
        parentPort.postMessage({ ok: true, outcome });
      } catch (error) {
        parentPort.postMessage({ ok: false, message: error.message, code: error.code });
      }
    `, { eval: true, workerData: { filename, request, repositoryPath, servicePath } });
    worker.once("message", (message) => message.ok ? resolve(message.outcome) : reject(Object.assign(new Error(message.message), { code: message.code })));
    worker.once("error", reject);
    worker.once("exit", (code) => { if (code !== 0) reject(new Error(`placement worker exited ${code}`)); });
  });
}

function authorityRaceWorker(mode, filename, identity, request) {
  const repositoryPath = path.resolve(__dirname, "../scripts/sqlite-hosted-placement-repository.cjs");
  const servicePath = path.resolve(__dirname, "../scripts/hosted-placement-service.cjs");
  return new Promise((resolve, reject) => {
    const worker = new Worker(`
      const crypto = require("crypto");
      const { parentPort, workerData } = require("worker_threads");
      const { SqliteHostedPlacementRepository } = require(workerData.repositoryPath);
      const { createHostedPlacementService } = require(workerData.servicePath);
      try {
        const repository = new SqliteHostedPlacementRepository({ filename: workerData.filename, now: () => 1_000_100 });
        let won = false;
        if (workerData.mode === "accept") {
          won = Boolean(repository.acceptAuthorityResult(workerData.identity, "sha256:accepted-race",
            null, null, ["run-membership-0"]));
        } else {
          const fenced = repository.compareAndSetRun(workerData.identity.run_id,
            (run) => run.state === "DRAINING" && run.leaseStatus === "ACTIVE",
            (run) => ({ ...run, state: "FAILED", leaseStatus: "FENCED", terminalAt: 1_000_100, updatedAt: 1_000_100 }));
          won = Boolean(fenced);
        }
        repository.close();
        parentPort.postMessage({ ok: true, won });
      } catch (error) {
        parentPort.postMessage({ ok: false, message: error.message, code: error.code });
      }
    `, { eval: true, workerData: { mode, filename, identity, request, repositoryPath, servicePath } });
    worker.once("message", (message) => message.ok ? resolve(message.won) : reject(Object.assign(new Error(message.message), { code: message.code })));
    worker.once("error", reject);
    worker.once("exit", (code) => { if (code !== 0) reject(new Error(`authority race worker exited ${code}`)); });
  });
}

function drainRun(h, repository, service, runId) {
  const placement = place(service, h, runId);
  const run = repository.getRun(runId);
  const claims = service.redeemBootstrap({ credential: "worker-a", bootstrap: placement.bootstrap,
    audience: "authority:authority-a" });
  service.markReady({ credential: "worker-a", runId, authorityLeaseId: claims.authorityLeaseId,
    leaseEpoch: claims.leaseEpoch });
  const ticket = service.issueAdmissionTicket({ credential: "control", runId, member: h.member(0) });
  service.redeemAdmissionTicket({ credential: "worker-a", ticket: ticket.ticket });
  service.beginRunDrain({ credential: "worker-a", runId, authorityLeaseId: claims.authorityLeaseId,
    leaseEpoch: claims.leaseEpoch });
  return { run_id: runId, lease_id: claims.authorityLeaseId, lease_epoch: claims.leaseEpoch,
    authority_incarnation: run.authorityIncarnation };
}

(async () => {
  await test("SQLite capacity and placement survive close and reopen", () => {
    const h = fixture();
    try {
      const first = h.openRepository();
      const firstService = h.service(first);
      assert.strictEqual(first.db.prepare("PRAGMA journal_mode").get().journal_mode, "wal");
      assert.strictEqual(first.db.prepare("PRAGMA synchronous").get().synchronous, 2);
      assert.strictEqual(first.db.prepare("PRAGMA foreign_keys").get().foreign_keys, 1);
      assert.strictEqual(first.db.prepare("PRAGMA busy_timeout").get().timeout, 5_000);
      register(firstService, h);
      assert.strictEqual(place(firstService, h, "durable").won, true);
      first.close();
      const second = h.openRepository();
      assert.strictEqual(second.getCapacity("authority-a").region, "ord");
      assert.strictEqual(second.getRun("durable").state, "ALLOCATING");
      assert.strictEqual(second.snapshot().requestIndex.length, 1);
    } finally { h.closeAll(); }
  });

  await test("two SQLite connections competing for one run produce exactly one lease", async () => {
    const h = fixture();
    try {
      const repository = h.openRepository();
      const service = h.service(repository);
      register(service, h);
      const request = h.request("contended");
      const outcomes = await Promise.all([
        competingWorker(h.filename, request),
        competingWorker(h.filename, request),
      ]);
      assert.strictEqual(outcomes.filter((outcome) => outcome.won).length, 1);
      assert.strictEqual(repository.snapshot().runs.length, 1);
      assert.strictEqual(outcomes.filter((outcome) => Object.hasOwn(outcome, "bootstrap")).length, 1);
    } finally { h.closeAll(); }
  });

  await test("measured placement limit admits distinct runs but never overpacks capacity", () => {
    const h = fixture({ measuredPackingLimit: 2 });
    try {
      const repository = h.openRepository();
      const service = h.service(repository);
      register(service, h);
      assert.strictEqual(place(service, h, "packed-a").won, true);
      assert.strictEqual(place(service, h, "packed-b").won, true);
      assert.strictEqual(place(service, h, "packed-c").won, false);
      const runs = repository.snapshot().runs;
      assert.strictEqual(new Set(runs.map((run) => run.runId)).size, 2);
      assert.strictEqual(new Set(runs.map((run) => run.authorityLeaseId)).size, 2);
    } finally { h.closeAll(); }
  });

  await test("stale compare-and-set and stale lease epoch fail closed", () => {
    const h = fixture();
    try {
      const repository = h.openRepository();
      const service = h.service(repository);
      register(service, h);
      place(service, h, "stale");
      const original = repository.getRun("stale");
      assert(repository.compareAndSetRun("stale",
        (run) => run.leaseEpoch === original.leaseEpoch,
        (run) => ({ ...run, state: "FAILED", leaseStatus: "FENCED", terminalAt: 1_000_001, updatedAt: 1_000_001 })));
      assert.strictEqual(repository.compareAndSetRun("stale",
        (run) => run.state === original.state,
        (run) => ({ ...run, updatedAt: 1_000_002 })), null);
      rejection(() => service.resultEligible({ credential: "worker-a", runId: "stale",
        authorityLeaseId: original.authorityLeaseId, leaseEpoch: original.leaseEpoch }), "STALE_LEASE");
    } finally { h.closeAll(); }
  });

  await test("bootstrap and admission replay protection survive repository restart", () => {
    const h = fixture();
    try {
      let repository = h.openRepository();
      let service = h.service(repository);
      register(service, h);
      const placement = place(service, h, "replay");
      repository.close();

      repository = h.openRepository();
      service = h.service(repository);
      const claims = service.redeemBootstrap({ credential: "worker-a", bootstrap: placement.bootstrap,
        audience: "authority:authority-a" });
      repository.close();

      h.advance(1_001);
      repository = h.openRepository();
      service = h.service(repository);
      assert.strictEqual(service.redeemBootstrap({ credential: "worker-a", bootstrap: placement.bootstrap,
        audience: "authority:authority-a" }).replayed, true,
      "consumed bootstrap survives reopen beyond token TTL while readiness lease is live");
      service.markReady({ credential: "worker-a", runId: claims.runId,
        authorityLeaseId: claims.authorityLeaseId, leaseEpoch: claims.leaseEpoch });
      const ticket = service.issueAdmissionTicket({ credential: "control", runId: claims.runId, member: h.member(0) });
      service.redeemAdmissionTicket({ credential: "worker-a", ticket: ticket.ticket });
      repository.close();

      repository = h.openRepository();
      service = h.service(repository);
      assert.strictEqual(service.redeemAdmissionTicket({ credential: "worker-a", ticket: ticket.ticket }).replayed, true);
      assert.strictEqual(repository.getRun("replay").admittedCount, 1);
    } finally { h.closeAll(); }
  });

  await test("service rejects fifth and eighth seats before durable allocation", () => {
    const h = fixture();
    try {
      const repository = h.openRepository();
      const service = h.service(repository);
      register(service, h);
      rejection(() => place(service, h, "five", { seatCount: 5 }), "INVALID_REQUEST");
      rejection(() => place(service, h, "eight", { seatCount: 8 }), "INVALID_REQUEST");
      assert.strictEqual(repository.snapshot().runs.length, 0);
    } finally { h.closeAll(); }
  });

  await test("workload auth route and heartbeat remain bound to current durable lineage", () => {
    const h = fixture();
    try {
      const repository = h.openRepository();
      const service = h.service(repository);
      register(service, h);
      const placement = place(service, h, "workload-auth");
      const claims = service.redeemBootstrap({ credential: "worker-a", bootstrap: placement.bootstrap,
        audience: "authority:authority-a" });
      const route = service.markReady({ credential: "worker-a", runId: claims.runId,
        authorityLeaseId: claims.authorityLeaseId, leaseEpoch: claims.leaseEpoch });
      assert.strictEqual(service.validateRoute({ credential: "worker-a", route: route.route, runId: claims.runId }).endpoint,
        "wss://authority-a.internal");
      rejection(() => service.validateRoute({ credential: "worker-b", route: route.route, runId: claims.runId }), "STALE_LEASE");
      const heartbeat = service.heartbeat({ credential: "worker-a", runId: claims.runId,
        authorityLeaseId: claims.authorityLeaseId, leaseEpoch: claims.leaseEpoch,
        metrics: { connections: 1, queueDepth: 0, memoryBytes: 4096 } });
      assert(heartbeat.leaseDeadlineAt > 1_000_000);
    } finally { h.closeAll(); }
  });

  await test("capacity drain and expired heartbeat are rechecked inside placement claim", () => {
    const h = fixture();
    try {
      const repository = h.openRepository();
      const service = h.service(repository);
      register(service, h);
      service.setDrain({ credential: "worker-a", draining: true });
      assert.strictEqual(place(service, h, "drained").won, false);
      service.setDrain({ credential: "worker-a", draining: false });
      h.advance(5_001);
      assert.strictEqual(place(service, h, "expired-heartbeat").won, false);
      register(service, h);
      assert.strictEqual(place(service, h, "renewed-heartbeat").won, true);
    } finally { h.closeAll(); }
  });

  await test("SQLite expiry selection stays bounded and repeated sweeps drain the backlog", () => {
    const h = fixture({ measuredPackingLimit: 8, expirySweepLimit: 3 });
    try {
      const repository = h.openRepository();
      const service = h.service(repository);
      register(service, h);
      for (let index = 0; index < 8; index++) assert.strictEqual(place(service, h, `expiry-${index}`).won, true);
      h.advance(1_501);
      assert.strictEqual(repository.listExpiredCandidates(1_001_501, 3).length, 3);
      assert.deepStrictEqual([service.fenceExpired().fenced, service.fenceExpired().fenced,
        service.fenceExpired().fenced, service.fenceExpired().fenced], [3, 3, 2, 0]);
    } finally { h.closeAll(); }
  });

  await test("cleanup retains bounded tombstones and preserves foreign-key integrity", () => {
    const h = fixture();
    try {
      const repository = h.openRepository();
      const service = h.service(repository);
      register(service, h);
      const placement = place(service, h, "cleanup");
      const claims = service.redeemBootstrap({ credential: "worker-a", bootstrap: placement.bootstrap,
        audience: "authority:authority-a" });
      service.markReady({ credential: "worker-a", runId: claims.runId,
        authorityLeaseId: claims.authorityLeaseId, leaseEpoch: claims.leaseEpoch });
      service.endRun({ credential: "worker-a", runId: claims.runId,
        authorityLeaseId: claims.authorityLeaseId, leaseEpoch: claims.leaseEpoch, outcome: "ENDED" });
      assert.deepStrictEqual(repository.cleanup({ now: 1_000_001, terminalBefore: 1_000_001, keepTerminal: 1 }),
        { activeRuns: 0, consumedTokens: 1, tombstones: 1 });
      assert.strictEqual(repository.snapshot().tombstones[0].runId, "cleanup");
      assert.deepStrictEqual(repository.db.prepare("PRAGMA foreign_key_check").all(), []);
      assert.deepStrictEqual(repository.cleanup({ now: 1_003_000, terminalBefore: 1_003_000, keepTerminal: 0 }),
        { activeRuns: 0, consumedTokens: 0, tombstones: 0 });
      assert.strictEqual(repository.snapshot().requestIndex.length, 0);
      assert.deepStrictEqual(repository.db.prepare("PRAGMA foreign_key_check").all(), []);
    } finally { h.closeAll(); }
  });

  await test("adapter accepts an injected database without taking close ownership", () => {
    const db = new DatabaseSync(":memory:");
    const repository = new SqliteHostedPlacementRepository({ db });
    repository.close();
    assert.strictEqual(db.prepare("SELECT 1 AS value").get().value, 1);
    db.close();
  });

  await test("accepted authority result is immutable, replayable, and durable across reopen", () => {
    const h = fixture();
    try {
      let repository = h.openRepository();
      let service = h.service(repository);
      register(service, h);
      const identity = drainRun(h, repository, service, "accepted");
      const accepted = repository.acceptAuthorityResult(identity, "sha256:one", null, null, ["run-membership-0"]);
      assert.strictEqual(accepted.accepted, true);
      assert.strictEqual(repository.getRun("accepted").resultAcceptanceState, "ACCEPTED");
      assert.strictEqual(repository.getRun("accepted").state, "ENDED");
      assert.strictEqual(repository.getRun("accepted").leaseStatus, "ENDED");
      h.advance(10_000);
      assert.deepStrictEqual(service.fenceExpired(), { fenced: 0 });
      register(service, h);
      assert.strictEqual(place(service, h, "capacity-released").won, true);
      assert.strictEqual(repository.compareAndSetRun("accepted", () => true,
        (run) => ({ ...run, updatedAt: 1_000_001 })), null);
      assert.throws(() => repository.db.prepare(`UPDATE hosted_placement_current_allocations
        SET accepted_result_hash = 'sha256:tampered' WHERE run_id = 'accepted'`).run(),
      /accepted hosted placement result is immutable/);
      rejection(() => service.heartbeat({ credential: "worker-a", runId: "accepted",
        authorityLeaseId: identity.lease_id, leaseEpoch: identity.lease_epoch }), "STALE_LEASE");
      rejection(() => service.requestReplacement({ credential: "control", request: h.request("accepted", {
        requestId: "replacement-after-accept",
      }) }), "REPLACEMENT_NOT_FENCED");
      repository.close();

      repository = h.openRepository();
      assert.strictEqual(repository.acceptAuthorityResult(identity, "sha256:one", null, null, ["run-membership-0"]).accepted, true);
      repository.cleanup({ now: 1_010_000, terminalBefore: 1_010_000, keepTerminal: 4 });
      assert.strictEqual(repository.getRun("accepted").resultAcceptanceState, "ACCEPTED");
      assert.strictEqual(repository.acceptAuthorityResult(identity, "sha256:one", null, null, ["run-membership-0"]).accepted, true);
      assert.throws(() => repository.acceptAuthorityResult(identity, "sha256:other", null, null, ["run-membership-0"]),
        (error) => error.code === "HOSTED_RESULT_CONFLICT");
      assert.strictEqual(repository.getRun("accepted").acceptedResultHash, "sha256:one");
    } finally { h.closeAll(); }
  });

  await test("authority acceptance binds the exact canonical admitted membership set", () => {
    const h = fixture();
    try {
      const repository = h.openRepository();
      const service = h.service(repository);
      register(service, h);
      const runId = "accepted-membership-set";
      const placement = place(service, h, runId);
      const claims = service.redeemBootstrap({ credential: "worker-a", bootstrap: placement.bootstrap,
        audience: "authority:authority-a" });
      service.markReady({ credential: "worker-a", runId, authorityLeaseId: claims.authorityLeaseId,
        leaseEpoch: claims.leaseEpoch });
      for (const seatNo of [0, 1]) {
        const ticket = service.issueAdmissionTicket({ credential: "control", runId, member: h.member(seatNo) });
        service.redeemAdmissionTicket({ credential: "worker-a", ticket: ticket.ticket });
      }
      service.beginRunDrain({ credential: "worker-a", runId, authorityLeaseId: claims.authorityLeaseId,
        leaseEpoch: claims.leaseEpoch });
      const identity = { run_id: runId, lease_id: claims.authorityLeaseId, lease_epoch: claims.leaseEpoch,
        authority_incarnation: repository.getRun(runId).authorityIncarnation };
      assert.strictEqual(repository.acceptAuthorityResult(identity, "sha256:underinclusive", null, null,
        ["run-membership-0"]), null);
      assert.strictEqual(repository.getRun(runId).state, "DRAINING");
      const accepted = repository.acceptAuthorityResult(identity, "sha256:exact", null, null,
        ["run-membership-1", "run-membership-0"]);
      assert.strictEqual(accepted.membership_count, 2);
      assert.match(accepted.membership_digest, /^sha256:[0-9a-f]{64}$/);
      assert.strictEqual(repository.getRun(runId).acceptedMembershipDigest, accepted.membership_digest);
      assert.strictEqual(repository.acceptAuthorityResult(identity, "sha256:exact", null, null,
        ["run-membership-0"]), null, "accepted tuple cannot replay under a different membership set");
      assert.strictEqual(repository.acceptAuthorityResult(identity, "sha256:exact", null, null,
        ["run-membership-0", "run-membership-1"]).accepted, true);
    } finally { h.closeAll(); }
  });

  await test("cleanup never evicts accepted authority tuples while ordinary tombstones stay bounded", () => {
    const h = fixture();
    try {
      const repository = h.openRepository({ tombstoneLimit: 3 });
      const service = h.service(repository);
      register(service, h);
      const accepted = [];
      for (let index = 0; index < 7; index++) {
        const identity = drainRun(h, repository, service, `accepted-retained-${index}`);
        const resultHash = `sha256:retained-${index}`;
        repository.acceptAuthorityResult(identity, resultHash, null, null, ["run-membership-0"]);
        accepted.push({ identity, resultHash });
      }
      for (let index = 0; index < 7; index++) {
        const runId = `ordinary-terminal-${index}`;
        const placement = place(service, h, runId);
        const claims = service.redeemBootstrap({ credential: "worker-a", bootstrap: placement.bootstrap,
          audience: "authority:authority-a" });
        service.markReady({ credential: "worker-a", runId,
          authorityLeaseId: claims.authorityLeaseId, leaseEpoch: claims.leaseEpoch });
        service.endRun({ credential: "worker-a", runId,
          authorityLeaseId: claims.authorityLeaseId, leaseEpoch: claims.leaseEpoch, outcome: "ENDED" });
      }
      const summary = repository.cleanup({ now: 1_000_000, terminalBefore: 1_000_000, keepTerminal: 3 });
      assert.strictEqual(summary.activeRuns, accepted.length);
      assert.strictEqual(summary.tombstones, 3);
      assert(repository.snapshot().tombstones.every((entry) => entry.runId.startsWith("ordinary-terminal-")));
      for (const entry of accepted) {
        assert.strictEqual(repository.acceptAuthorityResult(entry.identity, entry.resultHash,
          null, null, ["run-membership-0"]).accepted, true);
      }
      assert.strictEqual(repository.getRun("accepted-retained-0").acceptedResultHash, "sha256:retained-0");
    } finally { h.closeAll(); }
  });

  await test("settlement receipt archives only the exact accepted tuple and permanently burns the run lineage", () => {
    const h = fixture();
    try {
      let repository = h.openRepository();
      let service = h.service(repository);
      register(service, h);
      const identity = drainRun(h, repository, service, "archive-exact");
      const accepted = repository.acceptAuthorityResult(identity, "sha256:archive-result",
        "result-archive-exact", 999_999, ["run-membership-0"]);
      const receipt = {
        receipt_schema: "lbh.hosted.placement-settlement-receipt", receipt_version: 1,
        result_version: 1, receipt_id: "receipt-archive-exact", settlement_id: "settlement-archive-exact",
        result_id: accepted.result_id, run_id: accepted.run_id, result_hash: accepted.result_hash,
        idempotency_key: "idempotency-archive-exact", committed_at: 999_999,
        lease_id: accepted.lease_id, lease_epoch: accepted.lease_epoch,
        authority_incarnation: accepted.authority_incarnation,
        membership_digest: accepted.membership_digest, membership_count: accepted.membership_count,
        archived_at: 1_000_000, retain_until: 1_001_000,
      };
      const acknowledged = service.acknowledgePlacementResult({ credential: "control", receipt });
      assert.deepStrictEqual(acknowledged, { acknowledged: true, replayed: false,
        run_id: "archive-exact", result_id: "result-archive-exact",
        result_hash: "sha256:archive-result", settlement_id: "settlement-archive-exact",
        receipt_id: "receipt-archive-exact", idempotency_key: "idempotency-archive-exact" });
      assert.strictEqual(repository.getRun("archive-exact"), null, "heavy current allocation is removed");
      assert.strictEqual(repository.snapshot().tombstones.some((row) => row.runId === "archive-exact"), false,
        "duplicate accepted tombstone is removed after the audit fence commits");
      assert.strictEqual(repository.acceptAuthorityResult(identity, accepted.result_hash, accepted.result_id,
        accepted.accepted_at, ["run-membership-0"]).archived, true,
      "exact authority replay resolves from the minimal archive fence");
      assert.throws(() => repository.acceptAuthorityResult(identity, accepted.result_hash, "result-replacement",
        accepted.accepted_at, ["run-membership-0"]), (error) => error.code === "HOSTED_RESULT_CONFLICT");
      assert.throws(() => service.acknowledgePlacementResult({ credential: "control",
        receipt: { ...receipt, settlement_id: "settlement-forged" } }),
      (error) => error.code === "HOSTED_PLACEMENT_ARCHIVE_CONFLICT");
      repository.close();

      repository = h.openRepository();
      service = h.service(repository);
      assert.deepStrictEqual(service.acknowledgePlacementResult({ credential: "control",
        receipt: { ...receipt, replayed: true } }), { acknowledged: true, replayed: true,
        run_id: "archive-exact", result_id: "result-archive-exact",
        result_hash: "sha256:archive-result", settlement_id: "settlement-archive-exact",
        receipt_id: "receipt-archive-exact", idempotency_key: "idempotency-archive-exact" },
      "ambiguous crash replays the same placement mutation after reopen");
      rejection(() => service.requestPlacement({ credential: "control", request: h.request("archive-exact", {
        requestId: "request-archive-resurrection",
      }) }), "RUN_QUARANTINED");
      assert.deepStrictEqual(repository.cleanupResultAudit({ now: 1_000_000, limit: 10 }),
        { deleted: 0, limit: 10 }, "declared retention protects the audit tuple");
      h.advance(1_001);
      assert.deepStrictEqual(repository.cleanupResultAudit({ now: 1_001_001, limit: 10 }),
        { deleted: 1, limit: 10 });
      assert.strictEqual(repository.isRunClosed("archive-exact"), true,
        "permanent lineage closure survives finite audit retention");
      rejection(() => service.requestPlacement({ credential: "control", request: h.request("archive-exact", {
        requestId: "request-after-audit-retention",
      }) }), "RUN_QUARANTINED");
    } finally { h.closeAll(); }
  });

  await test("authority process incarnation restart fences old bootstrap and current lease", () => {
    const h = fixture();
    try {
      const repository = h.openRepository();
      const firstService = h.service(repository);
      register(firstService, h);
      const placement = place(firstService, h, "incarnation-fence");
      const prior = h.descriptors.get("worker-a");
      h.descriptors.set("worker-a", { ...prior, authorityIncarnation: "authority-a-incarnation-2" });
      const restartedService = h.service(repository);
      rejection(() => restartedService.redeemBootstrap({ credential: "worker-a", bootstrap: placement.bootstrap,
        audience: "authority:authority-a" }), "STALE_LEASE");
      assert.strictEqual(repository.getRun("incarnation-fence").authorityIncarnation,
        "authority-a-incarnation-1");
    } finally { h.closeAll(); }
  });

  await test("authority result acceptance versus fencing race has one durable winner", async () => {
    const h = fixture();
    try {
      const repository = h.openRepository();
      const service = h.service(repository);
      register(service, h, "worker-a");
      register(service, h, "worker-b");
      const identity = drainRun(h, repository, service, "accept-replace-race");
      const outcomes = await Promise.all([
        authorityRaceWorker("accept", h.filename, identity, null),
        authorityRaceWorker("fence", h.filename, identity, null),
      ]);
      assert.strictEqual(outcomes.filter(Boolean).length, 1);
      const current = repository.getRun("accept-replace-race");
      if (current.resultAcceptanceState === "ACCEPTED") {
        assert.strictEqual(current.leaseEpoch, identity.lease_epoch);
        assert.strictEqual(current.acceptedResultHash, "sha256:accepted-race");
      } else {
        assert.strictEqual(current.leaseEpoch, identity.lease_epoch);
        assert.strictEqual(current.state, "FAILED");
        assert.strictEqual(current.leaseStatus, "FENCED");
      }
    } finally { h.closeAll(); }
  });

  await test("legacy allocation migration adds result columns and fences unbound incarnation", () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), "lbh-placement-legacy-"));
    const filename = path.join(directory, "legacy.sqlite");
    const db = new DatabaseSync(filename);
    db.exec(`
      CREATE TABLE hosted_placement_workload_registrations (
        authority_instance_id TEXT PRIMARY KEY, workload_key_id TEXT NOT NULL,
        artifact_sha TEXT NOT NULL, protocol_version TEXT NOT NULL, manifest_hash TEXT NOT NULL,
        registered_at INTEGER NOT NULL
      );
      CREATE TABLE hosted_placement_current_allocations (
        run_id TEXT PRIMARY KEY, authority_instance_id TEXT NOT NULL, request_id TEXT NOT NULL,
        state TEXT NOT NULL, lease_status TEXT NOT NULL, lease_epoch INTEGER NOT NULL,
        seat_count INTEGER NOT NULL, admitted_count INTEGER NOT NULL, terminal_at INTEGER,
        updated_at INTEGER NOT NULL, row_version INTEGER NOT NULL, payload_json TEXT NOT NULL
      );
      INSERT INTO hosted_placement_current_allocations VALUES (
        'legacy-run','legacy-authority','legacy-request','ACTIVE','ACTIVE',1,1,0,NULL,1,1,
        '{"runId":"legacy-run","authorityInstanceId":"legacy-authority","requestId":"legacy-request","state":"ACTIVE","leaseStatus":"ACTIVE","leaseEpoch":1,"seatCount":1,"admittedCount":0,"history":[]}'
      );
    `);
    db.close();
    const repository = new SqliteHostedPlacementRepository({ filename });
    try {
      const migrated = repository.getRun("legacy-run");
      assert.strictEqual(migrated.state, "FAILED");
      assert.strictEqual(migrated.leaseStatus, "FENCED");
      assert.strictEqual(migrated.authorityIncarnation, "legacy-unbound");
      assert.strictEqual(migrated.resultAcceptanceState, "OPEN");
      assert.strictEqual(repository.acceptAuthorityResult({ run_id: "legacy-run", lease_id: "x",
        lease_epoch: 1, authority_incarnation: "legacy-unbound" }, "sha256:no",
      null, null, ["run-membership-0"]), null);
    } finally {
      repository.close();
      fs.rmSync(directory, { recursive: true, force: true });
    }
  });

  await test("legacy accepted rows require review and explicit quarantine without fabricated membership binding", () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), "lbh-placement-legacy-accepted-"));
    const filename = path.join(directory, "legacy.sqlite");
    const db = new DatabaseSync(filename);
    db.exec(`
      CREATE TABLE hosted_placement_current_allocations (
        run_id TEXT PRIMARY KEY, authority_instance_id TEXT NOT NULL, authority_incarnation TEXT NOT NULL,
        request_id TEXT NOT NULL, state TEXT NOT NULL, lease_status TEXT NOT NULL, lease_epoch INTEGER NOT NULL,
        seat_count INTEGER NOT NULL, admitted_count INTEGER NOT NULL, terminal_at INTEGER, updated_at INTEGER NOT NULL,
        expiry_deadline_at INTEGER NOT NULL, row_version INTEGER NOT NULL,
        result_acceptance_state TEXT NOT NULL, accepted_result_hash TEXT, accepted_at INTEGER,
        payload_json TEXT NOT NULL
      );
      CREATE TABLE hosted_placement_terminal_tombstones (
        run_id TEXT PRIMARY KEY, state TEXT NOT NULL, lease_epoch INTEGER NOT NULL, terminal_at INTEGER NOT NULL,
        authority_lease_id TEXT, authority_incarnation TEXT, accepted_result_hash TEXT, accepted_at INTEGER
      );
      INSERT INTO hosted_placement_current_allocations VALUES (
        'legacy-current','legacy-authority','legacy-incarnation','legacy-request','ENDED','ENDED',1,1,1,50,50,50,1,
        'ACCEPTED','sha256:legacy-current',50,
        '{"runId":"legacy-current","authorityInstanceId":"legacy-authority","authorityIncarnation":"legacy-incarnation","authorityLeaseId":"legacy-lease","requestId":"legacy-request","state":"ENDED","leaseStatus":"ENDED","leaseEpoch":1,"seatCount":1,"admittedCount":1,"admittedMemberships":["unknown-legacy-member"],"terminalAt":50,"updatedAt":50}'
      );
      INSERT INTO hosted_placement_terminal_tombstones VALUES (
        'legacy-tombstone','ENDED',1,51,'legacy-lease-2','legacy-incarnation-2','sha256:legacy-tombstone',51
      );
    `);
    db.close();
    assert.throws(() => new SqliteHostedPlacementRepository({ filename, now: () => 100 }), (error) =>
      error.code === "HOSTED_PLACEMENT_LEGACY_ACCEPTANCE_REVIEW_REQUIRED"
        && error.runIds.includes("legacy-current"));
    const repository = new SqliteHostedPlacementRepository({ filename, now: () => 100,
      legacyAcceptancePolicy: "quarantine" });
    try {
      assert.deepStrictEqual(repository.listMigrationQuarantine(), [
        { runId: "legacy-current", sourceTable: "current", reason: "accepted_without_membership_binding", quarantinedAt: 100 },
        { runId: "legacy-tombstone", sourceTable: "tombstone", reason: "accepted_without_membership_binding", quarantinedAt: 100 },
      ]);
      assert.strictEqual(repository.getRun("legacy-current"), null);
      assert.strictEqual(repository.acceptAuthorityResult({ run_id: "legacy-current", lease_id: "legacy-lease",
        lease_epoch: 1, authority_incarnation: "legacy-incarnation" }, "sha256:legacy-current",
      null, null, ["unknown-legacy-member"]), null, "quarantine never promotes payload membership into trusted binding");
      assert.throws(() => repository.claimPlacement({ requestId: "resurrection-request",
        runId: "legacy-current", candidates: [], isEligible: () => true, create: () => null }),
      (error) => error.code === "HOSTED_PLACEMENT_RUN_QUARANTINED",
      "durable migration quarantine prevents the run id from being resurrected as a fresh placement");
      const quarantineService = createHostedPlacementService({ repository, now: () => 100,
        randomBytes: crypto.randomBytes,
        tokenKey: crypto.createHash("sha256").update("quarantine-token").digest(),
        diagnosticKey: crypto.createHash("sha256").update("quarantine-diagnostic").digest(),
        authenticateWorkload: () => null,
        authenticateControlPlane: (credential) => credential === "control" ? { role: "CONTROL_PLANE" } : null });
      rejection(() => quarantineService.requestPlacement({ credential: "control", request: {
        requestId: "service-resurrection-request", runId: "legacy-current", sessionId: "legacy-session",
        seatCount: 1, regionPreferences: ["ord"], artifactSha: "a".repeat(64),
        protocolVersion: "lbh-multiplayer-json-v2", manifestHash: "m".repeat(64), capabilities: [],
      } }), "RUN_QUARANTINED");
      const quarantined = repository.db.prepare(`SELECT payload_json FROM hosted_placement_migration_quarantine
        WHERE run_id='legacy-current' AND source_table='current'`).get();
      assert.strictEqual(JSON.parse(quarantined.payload_json).accepted_membership_digest, null);
      assert.strictEqual(repository.db.prepare(`SELECT value FROM hosted_placement_schema_meta
        WHERE key='acceptance_membership_binding'`).get().value, "2");
    } finally {
      repository.close();
      fs.rmSync(directory, { recursive: true, force: true });
    }
  });

  process.stdout.write(`\n${passed} SQLite hosted placement repository tests passed.\n`);
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
