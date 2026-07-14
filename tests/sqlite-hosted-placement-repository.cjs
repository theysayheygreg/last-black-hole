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
          won = Boolean(repository.acceptAuthorityResult(workerData.identity, "sha256:accepted-race"));
        } else {
          const fenced = repository.compareAndSetRun(workerData.identity.run_id,
            (run) => run.state === "DRAINING" && run.leaseStatus === "ACTIVE",
            (run) => ({ ...run, state: "FAILED", leaseStatus: "FENCED", terminalAt: 1_000_100, updatedAt: 1_000_100 }));
          if (fenced) {
            const service = createHostedPlacementService({
              repository, now: () => 1_000_100, randomBytes: crypto.randomBytes,
              tokenKey: crypto.createHash("sha256").update("sqlite-placement-token").digest(),
              diagnosticKey: crypto.createHash("sha256").update("sqlite-placement-diagnostic").digest(),
              authenticateWorkload: () => null,
              authenticateControlPlane: (credential) => credential === "control" ? { role: "CONTROL_PLANE" } : null,
              measuredPackingLimit: 1,
            });
            won = service.requestReplacement({ credential: "control", request: workerData.request }).won;
          }
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

      repository = h.openRepository();
      service = h.service(repository);
      rejection(() => service.redeemBootstrap({ credential: "worker-a", bootstrap: placement.bootstrap,
        audience: "authority:authority-a" }), "BOOTSTRAP_REPLAY");
      service.markReady({ credential: "worker-a", runId: claims.runId,
        authorityLeaseId: claims.authorityLeaseId, leaseEpoch: claims.leaseEpoch });
      const ticket = service.issueAdmissionTicket({ credential: "control", runId: claims.runId, member: h.member(0) });
      service.redeemAdmissionTicket({ credential: "worker-a", ticket: ticket.ticket });
      repository.close();

      repository = h.openRepository();
      service = h.service(repository);
      rejection(() => service.redeemAdmissionTicket({ credential: "worker-a", ticket: ticket.ticket }), "TICKET_REPLAY");
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
      const accepted = repository.acceptAuthorityResult(identity, "sha256:one");
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
      assert.strictEqual(repository.acceptAuthorityResult(identity, "sha256:one").accepted, true);
      repository.cleanup({ now: 1_010_000, terminalBefore: 1_010_000, keepTerminal: 4 });
      assert.strictEqual(repository.getRun("accepted"), null);
      assert.strictEqual(repository.acceptAuthorityResult(identity, "sha256:one").accepted, true);
      assert.throws(() => repository.acceptAuthorityResult(identity, "sha256:other"),
        (error) => error.code === "HOSTED_RESULT_CONFLICT");
      assert.strictEqual(repository.db.prepare(`SELECT accepted_result_hash FROM hosted_placement_terminal_tombstones
        WHERE run_id = 'accepted'`).get().accepted_result_hash, "sha256:one");
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

  await test("authority result acceptance versus replacement race has one durable winner", async () => {
    const h = fixture();
    try {
      const repository = h.openRepository();
      const service = h.service(repository);
      register(service, h, "worker-a");
      register(service, h, "worker-b");
      const identity = drainRun(h, repository, service, "accept-replace-race");
      const replacementRequest = h.request("accept-replace-race", {
        requestId: "request-accept-replace-race-replacement",
      });
      const outcomes = await Promise.all([
        authorityRaceWorker("accept", h.filename, identity, replacementRequest),
        authorityRaceWorker("replace", h.filename, identity, replacementRequest),
      ]);
      assert.strictEqual(outcomes.filter(Boolean).length, 1);
      const current = repository.getRun("accept-replace-race");
      if (current.resultAcceptanceState === "ACCEPTED") {
        assert.strictEqual(current.leaseEpoch, identity.lease_epoch);
        assert.strictEqual(current.acceptedResultHash, "sha256:accepted-race");
      } else {
        assert.strictEqual(current.leaseEpoch, identity.lease_epoch + 1);
        assert.strictEqual(current.authorityIncarnation, "authority-b-incarnation-1");
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
        lease_epoch: 1, authority_incarnation: "legacy-unbound" }, "sha256:no"), null);
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
