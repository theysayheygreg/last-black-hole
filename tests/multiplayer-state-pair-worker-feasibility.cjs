#!/usr/bin/env node
"use strict";

const assert = require("assert");
const crypto = require("crypto");
const fs = require("fs");
const os = require("os");
const path = require("path");
const v8 = require("v8");
const { execFileSync } = require("child_process");
const { performance } = require("perf_hooks");
const { Worker } = require("worker_threads");
const { createAuthorityDeltaPublisher } = require("../scripts/authority-delta-publisher.cjs");
const { normalizeView } = require("../scripts/canonical-structural-delta.cjs");
const { codecContext, POSITIONAL_CODEC_MANIFEST_HASH } = require("../scripts/state-pair-positional-codec.cjs");
const { createStatePairWireEncoder, parseWireFrame, SERVER_TO_CLIENT } =
  require("../scripts/multiplayer-wire-protocol.cjs");
const { decodeCompressedStatePair } = require("../scripts/state-pair-compression-codec.cjs");
const { publicWorkerJob, finalizeStatePair, replayStatePair, digest } =
  require("./network/state-pair-pure-replay.cjs");

const ROOT = path.resolve(__dirname, "..");
const WORKER = path.join(__dirname, "network", "state-pair-projection-worker.cjs");
const OUT = process.env.LBH_S21_WORKER_OUTPUT ? path.resolve(ROOT, process.env.LBH_S21_WORKER_OUTPUT) : null;
const MANIFEST_HASH = `sha256:${"8".repeat(64)}`;
const POPULATIONS = [1, 4, 8];
const BEATS = Number(process.env.LBH_S21_WORKER_BEATS || 18);
const ROUNDS = Number(process.env.LBH_S21_WORKER_ROUNDS || 4);

function sourceBindings() {
  return Object.fromEntries([
    __filename,
    path.join(__dirname, "network", "state-pair-pure-replay.cjs"),
    WORKER,
    path.join(ROOT, "scripts", "authority-delta-publisher.cjs"),
    path.join(ROOT, "scripts", "canonical-structural-delta.cjs"),
    path.join(ROOT, "scripts", "multiplayer-wire-protocol.cjs"),
    path.join(ROOT, "scripts", "state-pair-positional-codec.cjs"),
    path.join(ROOT, "scripts", "state-pair-compression-codec.cjs"),
  ].map((file) => [path.relative(ROOT, file), sha(fs.readFileSync(file))]));
}

function git(...args) {
  return execFileSync("git", args, { cwd: ROOT, encoding: "utf8" }).trim();
}

function component(revision, value) { return { revision, value }; }
function identity(population, seat, incarnation = 1) {
  return { matchId: `match-s21-${population}`, sessionId: `session-s21-${population}-${seat}`,
    authorityIncarnation: 1, recipientId: `synthetic-seat-${seat}`, recipientIncarnation: incarnation };
}
function views(beat, id) {
  const shared = { schema: "lbh-canonical-projection-v1", runId: id.matchId,
    authorityEpoch: id.authorityIncarnation, connectionEpoch: id.recipientIncarnation,
    ballparkEpoch: 1, manifestHash: MANIFEST_HASH,
    statePairId: `pair-${beat}-${id.recipientId}-${id.recipientIncarnation}`,
    snapshotId: `snapshot-${beat}-${id.recipientId}-${id.recipientIncarnation}`,
    tick: beat * 6, simTime: beat / 10, eventWatermark: beat, fieldRevision: beat,
    overloadMode: "NORMAL" };
  return {
    public: normalizeView({ ...shared, lane: "public", world: { publicFacts: {
      formTimes: [null, null, null, null] } },
      entities: Array.from({ length: 128 }, (_, index) => {
        const revision = Math.max(1, beat - (((beat - index) % 8 + 8) % 8));
        return { category: "player", sourceId: `public-${index}`, incarnation: 1,
          lifecycleRevision: revision, components: { runtimeMotion: component(revision,
            { wx: (index + revision) / 100, wy: 0.4, vx: 0.1, vy: -0.2 }) } };
      }) }),
    owner: normalizeView({ ...shared, lane: "owner", world: {}, entities: [{ category: "owner",
      sourceId: id.recipientId, incarnation: id.recipientIncarnation, lifecycleRevision: beat,
      components: { ownerState: component(beat, { profileId: `synthetic-${id.recipientId}-${beat}`,
        rigLevels: [1, 0, 0], cargo: Array.from({ length: 8 }, (_, index) => `cargo-${index}`),
        cargoCount: 8 }) } }] }),
  };
}
function ack(frame) {
  return { type: "ack", ackKind: "statePair", ackSchema: "lbh-authority-state-pair-mixed-ack-v1",
    matchId: frame.matchId, sessionId: frame.sessionId, authorityIncarnation: frame.authorityIncarnation,
    recipientId: frame.recipientId, recipientIncarnation: frame.recipientIncarnation, frameId: frame.frameId,
    statePairId: frame.statePairId, snapshotId: frame.snapshotId, publicHash: frame.public.resultHash,
    ownerHash: frame.owner.resultHash, pairSchema: frame.pairSchema, tick: frame.tick, simTime: frame.simTime,
    eventWatermark: frame.eventWatermark, fieldRevision: frame.fieldRevision,
    overloadMode: frame.overloadMode, ballparkEpoch: frame.ballparkEpoch, manifestHash: frame.manifestHash,
    publicKind: frame.public.kind, ownerKind: frame.owner.kind,
    publicBaseSnapshotId: frame.public.baseSnapshotId ?? null,
    ownerBaseSnapshotId: frame.owner.baseSnapshotId ?? null };
}
function sha(value) { return crypto.createHash("sha256").update(value).digest("hex"); }
function distribution(values) {
  const sorted = [...values].sort((a, b) => a - b);
  const pick = (q) => sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * q) - 1)];
  return { count: sorted.length, mean: sorted.reduce((a, b) => a + b, 0) / sorted.length,
    p50: pick(0.5), p95: pick(0.95), p99: pick(0.99), max: sorted.at(-1) };
}

function buildCorpus() {
  const jobs = [];
  let exactComparisons = 0;
  for (const population of POPULATIONS) {
    const publisher = createAuthorityDeltaPublisher({ preparedProjections: true, trustedAuthorityProofs: true });
    const seats = Array.from({ length: population }, (_, seat) => ({ seat, id: identity(population, seat),
      base: null, lastProduced: null }));
    for (let beat = 1; beat <= BEATS; beat += 1) {
      for (const seat of seats) {
        if (beat === 10 && seat.seat === 0) {
          publisher.disconnect(seat.id);
          seat.id = identity(population, seat.seat, 2);
          seat.base = null;
          seat.lastProduced = null;
        }
        const current = views(beat, seat.id);
        const context = codecContext({ ...seat.id, manifestHash: MANIFEST_HASH,
          codecManifestHash: POSITIONAL_CODEC_MANIFEST_HASH });
        const encoder = createStatePairWireEncoder(context);
        const recovery = beat === 7 && seat.seat === population - 1;
        if (recovery) publisher.rebase(seat.id);
        const produced = publisher.publish({ identity: seat.id, publicView: current.public,
          ownerView: current.owner, allowMixed: true, encodeWire: encoder });
        const job = { fence: { matchId: seat.id.matchId, authorityIncarnation: seat.id.authorityIncarnation,
          ballparkEpoch: 1, manifestHash: MANIFEST_HASH, tick: current.public.tick,
          snapshotId: current.public.snapshotId, recipientId: seat.id.recipientId,
          recipientIncarnation: seat.id.recipientIncarnation }, identity: seat.id, frameId: produced.frame.frameId,
          forceKeyframe: !seat.base || recovery, current, base: seat.base,
          expected: { kind: `public-${produced.publicKind}+owner-${produced.ownerKind}`,
            positionalDigest: produced.encodedDigest, positionalBytes: produced.bytes,
            frame: produced.frame } };
        const replay = replayStatePair(job);
        assert.strictEqual(replay.kind, job.expected.kind);
        assert.strictEqual(replay.positionalDigest, job.expected.positionalDigest);
        assert.strictEqual(replay.positionalBytes, job.expected.positionalBytes);
        assert.deepStrictEqual(replay.decodedFrame, job.expected.frame);
        job.expected.candidates = replay.candidates;
        job.expected.compressedDigest = replay.compressedDigest;
        exactComparisons += 4;
        jobs.push(job);
        seat.lastProduced = { produced, current };
        const stride = (seat.seat % 3) + 1;
        if (beat === 1 || beat % stride === 0 || recovery) {
          assert.strictEqual(publisher.acknowledge(seat.id, ack(produced.frame)).accepted, true);
          seat.base = current;
        }
      }
    }
    for (const seat of seats) publisher.disconnect(seat.id);
    assert.strictEqual(publisher.diagnostics().recipients, 0);
  }
  return { jobs, exactComparisons };
}

class Pool {
  constructor(size, options = {}) {
    this.size = size; this.maxPending = options.maxPending || size * 2; this.timeoutMs = options.timeoutMs || 2000;
    this.next = 0; this.sequence = 0; this.pending = new Map(); this.workers = [];
    this.ready = new Map(); this.shutdown = new Map(); this.alive = new Set();
  }
  async start() {
    const started = performance.now();
    const ready = [];
    for (let index = 0; index < this.size; index += 1) ready.push(this.add(index));
    await Promise.all(ready);
    this.startupMs = performance.now() - started;
  }
  add(index) {
    const worker = new Worker(WORKER);
    this.alive.add(worker);
    const ready = new Promise((resolve) => this.ready.set(worker, resolve));
    worker.on("message", (message) => {
      if (message.type === "ready") { this.ready.get(worker)?.(); this.ready.delete(worker); return; }
      if (message.type === "shutdown-ack") { this.shutdown.get(worker)?.(); this.shutdown.delete(worker); return; }
      const row = this.pending.get(message.requestId);
      if (!row) return;
      clearTimeout(row.timer); this.pending.delete(message.requestId);
      if (message.type === "error") row.reject(new Error(message.error));
      else row.resolve({ ...message, roundTripMs: performance.now() - row.started });
    });
    worker.on("exit", (code) => {
      this.alive.delete(worker);
      this.ready.get(worker)?.(); this.ready.delete(worker);
      this.shutdown.get(worker)?.(); this.shutdown.delete(worker);
      for (const [id, row] of this.pending) if (row.worker === worker) {
        clearTimeout(row.timer); this.pending.delete(id); row.reject(new Error(`worker-exit:${code}`));
      }
    });
    this.workers[index] = worker;
    return ready;
  }
  run(job, extra = {}) {
    if (this.pending.size >= this.maxPending) return Promise.reject(new Error("worker-backpressure"));
    const requestId = ++this.sequence;
    const worker = this.workers[this.next++ % this.workers.length];
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => { this.pending.delete(requestId); reject(new Error("worker-timeout")); },
        extra.timeoutMs || this.timeoutMs);
      this.pending.set(requestId, { resolve, reject, timer, worker, started: performance.now() });
      worker.postMessage({ type: extra.type || "job", requestId, job, delayMs: extra.delayMs || 0 });
    });
  }
  async close({ drainTimeoutMs = 500, shutdownTimeoutMs = 200 } = {}) {
    const drainStarted = performance.now();
    while (this.pending.size && performance.now() - drainStarted < drainTimeoutMs) {
      await new Promise((resolve) => setTimeout(resolve, 2));
    }
    let forced = 0;
    if (this.pending.size) {
      forced += this.alive.size;
      await Promise.all([...this.alive].map((worker) => worker.terminate()));
    } else {
      await Promise.all([...this.alive].map((worker) => new Promise((resolve) => {
        const timer = setTimeout(() => { this.shutdown.delete(worker); resolve(false); }, shutdownTimeoutMs);
        this.shutdown.set(worker, () => { clearTimeout(timer); resolve(true); });
        worker.postMessage({ type: "shutdown" });
      }).then(async (acked) => {
        if (!acked && this.alive.has(worker)) { forced += 1; await worker.terminate(); }
      })));
    }
    return { graceful: this.workers.length - forced, forced, pending: this.pending.size };
  }
}

function validateResult(job, result) {
  assert.deepStrictEqual(result.fence, job.fence);
  assert.strictEqual(result.kind, job.expected.kind);
  assert.deepStrictEqual(result.candidates, job.expected.candidates);
  assert.strictEqual(result.positionalDigest, job.expected.positionalDigest);
  assert.strictEqual(result.positionalBytes, job.expected.positionalBytes);
  assert.strictEqual(result.compressedDigest, digest(result.compressed));
  assert.strictEqual(result.compressedDigest, job.expected.compressedDigest);
  const positional = decodeCompressedStatePair(result.compressed);
  assert.strictEqual(positional.length, result.positionalBytes);
  assert.strictEqual(digest(positional), result.positionalDigest);
  const context = codecContext({ ...job.identity, manifestHash: job.current.public.manifestHash,
    codecManifestHash: POSITIONAL_CODEC_MANIFEST_HASH });
  const decoded = parseWireFrame(positional, { direction: SERVER_TO_CLIENT,
    positionalContext: context, requirePositional: true });
  assert.deepStrictEqual(decoded, job.expected.frame);
}

class AuthorityCommitGate {
  constructor() { this.live = new Map(); this.issued = new Map(); this.seen = new Set(); this.lastTick = new Map(); this.generation = 0; }
  install({ matchId, authorityIncarnation, ballparkEpoch, manifestHash, recipients }) {
    this.live.set(matchId, { authorityIncarnation, ballparkEpoch, manifestHash,
      recipients: new Map(recipients.map((entry) => [entry.recipientId, entry.recipientIncarnation])) });
  }
  issue(job) {
    const live = this.live.get(job.fence.matchId);
    if (!live || live.authorityIncarnation !== job.fence.authorityIncarnation
        || live.ballparkEpoch !== job.fence.ballparkEpoch || live.manifestHash !== job.fence.manifestHash
        || live.recipients.get(job.fence.recipientId) !== job.fence.recipientIncarnation) {
      throw new Error("worker-job-not-current");
    }
    const generation = ++this.generation;
    const issued = structuredClone(job);
    issued.fence.workGeneration = generation;
    this.issued.set(generation, JSON.stringify(issued.fence));
    return issued;
  }
  commit(job, result) {
    validateResult(job, result);
    const fence = result.fence;
    const live = this.live.get(fence.matchId);
    if (!live || live.authorityIncarnation !== fence.authorityIncarnation
        || live.ballparkEpoch !== fence.ballparkEpoch || live.manifestHash !== fence.manifestHash) {
      throw new Error("stale-worker-authority-fence");
    }
    if (live.recipients.get(fence.recipientId) !== fence.recipientIncarnation) {
      throw new Error("stale-worker-recipient-fence");
    }
    const fenceKey = JSON.stringify(fence);
    if (this.seen.has(fenceKey)) throw new Error("duplicate-worker-result");
    if (this.issued.get(fence.workGeneration) !== fenceKey) throw new Error("unissued-worker-result");
    const recipient = `${fence.matchId}:${fence.authorityIncarnation}:${fence.recipientId}:${fence.recipientIncarnation}`;
    if ((this.lastTick.get(recipient) ?? -1) >= fence.tick) throw new Error("out-of-order-worker-result");
    this.issued.delete(fence.workGeneration); this.seen.add(fenceKey); this.lastTick.set(recipient, fence.tick);
    return true;
  }
}

async function benchmark(jobs, workerCount, rounds = ROUNDS) {
  const pool = new Pool(workerCount, { maxPending: 32, timeoutMs: 4000 });
  await pool.start();
  const roundTrip = [], compute = [], finalize = [], finalizeCpu = [], cpuMicros = [], heap = [];
  const metadataBytes = [], transferredBytes = [], batchWall = [];
  const byPopulation = Object.fromEntries(POPULATIONS.map((population) => [population,
    jobs.filter((job) => job.fence.matchId === `match-s21-${population}`).slice(-population)]));
  for (let round = 0; round < rounds; round += 1) {
    for (const population of POPULATIONS) {
      const batch = round % 2 ? [...byPopulation[population]].reverse() : byPopulation[population];
      const started = performance.now();
      const rows = await Promise.all(batch.map((job) => pool.run(publicWorkerJob(job))));
      for (let index = 0; index < rows.length; index += 1) {
        const finalizeStarted = performance.now();
        const cpuStarted = process.threadCpuUsage();
        const result = finalizeStatePair(batch[index], rows[index].result);
        validateResult(batch[index], result);
        const used = process.threadCpuUsage(cpuStarted);
        finalizeCpu.push(used.user + used.system);
        finalize.push(performance.now() - finalizeStarted);
        roundTrip.push(rows[index].roundTripMs); compute.push(rows[index].computeMs);
        cpuMicros.push(rows[index].cpuMicros); heap.push(rows[index].heapUsed);
        metadataBytes.push(rows[index].result.metadataCloneProxyBytes);
        transferredBytes.push(rows[index].result.transferredPublicBytes);
      }
      batchWall.push({ population, ms: performance.now() - started });
    }
  }
  const shutdown = await pool.close();
  return { workers: workerCount, startupMs: pool.startupMs, jobs: roundTrip.length,
    roundTripMs: distribution(roundTrip), workerComputeMs: distribution(compute),
    cloneDispatchCollectProxyMs: distribution(roundTrip.map((value, index) => Math.max(0, value - compute[index]))),
    authorityFinalizeAndValidationMs: distribution(finalize),
    authorityFinalizeAndValidationCpuMicros: distribution(finalizeCpu),
    workerThreadCpuMicros: distribution(cpuMicros),
    totalWorkerCoreSeconds: cpuMicros.reduce((a, b) => a + b, 0) / 1e6,
    totalAuthorityFinalizeCoreSeconds: finalizeCpu.reduce((a, b) => a + b, 0) / 1e6,
    workerHeapHighWaterBytes: Math.max(...heap),
    aggregateWorkerHeapUpperBoundBytes: workerCount * Math.max(...heap),
    metadataCloneProxyBytes: distribution(metadataBytes),
    transferredPublicBytes: distribution(transferredBytes), shutdown,
    batchWallByPopulation: Object.fromEntries(POPULATIONS.map((population) => [population,
      distribution(batchWall.filter((entry) => entry.population === population).map((entry) => entry.ms))])) };
}

function inlineBenchmark(jobs, rounds = ROUNDS) {
  const rows = [], cpu = [], heap = [];
  const byPopulation = Object.fromEntries(POPULATIONS.map((population) => [population,
    jobs.filter((job) => job.fence.matchId === `match-s21-${population}`).slice(-population)]));
  for (let round = 0; round < rounds; round += 1) for (const population of POPULATIONS) {
    const batch = round % 2 ? [...byPopulation[population]].reverse() : byPopulation[population];
    const started = performance.now();
    const cpuStarted = process.threadCpuUsage();
    for (const job of batch) validateResult(job, replayStatePair(job));
    const used = process.threadCpuUsage(cpuStarted);
    rows.push({ population, ms: performance.now() - started });
    cpu.push(used.user + used.system); heap.push(v8.getHeapStatistics().used_heap_size);
  }
  return { workers: 0, startupMs: 0, jobs: rows.reduce((sum, row) => sum + row.population, 0),
    batchWallByPopulation: Object.fromEntries(POPULATIONS.map((population) => [population,
      distribution(rows.filter((entry) => entry.population === population).map((entry) => entry.ms))])),
    batchThreadCpuMicros: distribution(cpu), totalMainThreadCoreSeconds: cpu.reduce((a, b) => a + b, 0) / 1e6,
    mainHeapHighWaterBytes: Math.max(...heap) };
}

async function adversarial(jobs) {
  const pool = new Pool(2, { maxPending: 8, timeoutMs: 500 });
  await pool.start();
  const checks = {};
  const sample = jobs.at(-1);
  const liveFor = (job) => ({ matchId: job.fence.matchId,
    authorityIncarnation: job.fence.authorityIncarnation, ballparkEpoch: job.fence.ballparkEpoch,
    manifestHash: job.fence.manifestHash,
    recipients: [{ recipientId: job.fence.recipientId,
      recipientIncarnation: job.fence.recipientIncarnation }] });

  const baselineGate = new AuthorityCommitGate(); baselineGate.install(liveFor(sample));
  const issued = baselineGate.issue(sample);
  const baselineRow = await pool.run(publicWorkerJob(issued));
  const baseline = finalizeStatePair(issued, baselineRow.result);
  baselineGate.commit(issued, baseline);
  checks.duplicateRejected = (() => { try { baselineGate.commit(issued, baseline); return false; }
    catch (error) { return error.message === "duplicate-worker-result"; } })();

  const staleGate = new AuthorityCommitGate(); staleGate.install(liveFor(sample));
  const staleIssued = staleGate.issue(sample);
  const stalePromise = pool.run(publicWorkerJob(staleIssued), { delayMs: 20 });
  staleGate.install({ ...liveFor(sample), authorityIncarnation: 2 });
  const staleRow = await stalePromise;
  const staleResult = finalizeStatePair(staleIssued, staleRow.result);
  checks.staleRejected = (() => { try { staleGate.commit(staleIssued, staleResult); return false; }
    catch (error) { return error.message === "stale-worker-authority-fence"; } })();

  const crossGate = new AuthorityCommitGate();
  const crossSource = jobs.find((job) => job.fence.matchId !== sample.fence.matchId);
  const crossSourceGate = new AuthorityCommitGate(); crossSourceGate.install(liveFor(crossSource));
  const crossIssued = crossSourceGate.issue(crossSource);
  const crossRow = await pool.run(publicWorkerJob(crossIssued));
  const crossResult = finalizeStatePair(crossIssued, crossRow.result);
  checks.crossMatchRejected = (() => { try { crossGate.commit(crossIssued, crossResult); return false; }
    catch (error) { return error.message === "stale-worker-authority-fence"; } })();

  const mutationGate = new AuthorityCommitGate(); mutationGate.install(liveFor(sample));
  const mutationIssued = mutationGate.issue(sample);
  const dispatched = publicWorkerJob(mutationIssued);
  const mutationPromise = pool.run(dispatched, { delayMs: 20 });
  dispatched.current.public.entities[0].components.runtimeMotion.value.wx = 999999;
  const mutationRow = await mutationPromise;
  const mutationResult = finalizeStatePair(mutationIssued, mutationRow.result);
  checks.postDispatchMutationIsolated = mutationGate.commit(mutationIssued, mutationResult);

  const older = jobs.filter((job) => job.fence.matchId === sample.fence.matchId
    && job.fence.recipientId === sample.fence.recipientId
    && job.fence.recipientIncarnation === sample.fence.recipientIncarnation
    && job.fence.tick < sample.fence.tick).slice(-2);
  const orderGate = new AuthorityCommitGate(); orderGate.install(liveFor(sample));
  const olderIssued = orderGate.issue(older[0]);
  const newerIssued = orderGate.issue(older[1]);
  const [olderRow, newerRow] = await Promise.all([
    pool.run(publicWorkerJob(olderIssued), { delayMs: 40 }),
    pool.run(publicWorkerJob(newerIssued)),
  ]);
  orderGate.commit(newerIssued, finalizeStatePair(newerIssued, newerRow.result));
  checks.outOfOrderRejected = (() => { try {
    orderGate.commit(olderIssued, finalizeStatePair(olderIssued, olderRow.result)); return false;
  } catch (error) { return error.message === "out-of-order-worker-result"; } })();
  await pool.close();

  const pressure = new Pool(2, { maxPending: 2, timeoutMs: 500 }); await pressure.start();
  const held = [pressure.run(publicWorkerJob(sample), { delayMs: 100 }),
    pressure.run(publicWorkerJob(sample), { delayMs: 100 })];
  try { await pressure.run(publicWorkerJob(sample)); checks.backpressureRejected = false; }
  catch (error) { checks.backpressureRejected = error.message === "worker-backpressure"; }
  await Promise.all(held);
  try { await pressure.run(publicWorkerJob(sample), { delayMs: 100, timeoutMs: 5 }); checks.timeoutRejected = false; }
  catch (error) { checks.timeoutRejected = error.message === "worker-timeout"; }
  await new Promise((resolve) => setTimeout(resolve, 120));
  await pressure.close();

  const draining = new Pool(1, { timeoutMs: 500 }); await draining.start();
  const pendingDrain = draining.run(publicWorkerJob(sample), { delayMs: 30 });
  const drainClose = draining.close({ drainTimeoutMs: 200 });
  await pendingDrain;
  const drainResult = await drainClose;
  checks.gracefulDrain = drainResult.graceful === 1 && drainResult.forced === 0;

  const forced = new Pool(1, { timeoutMs: 500 }); await forced.start();
  const forcedPending = forced.run(publicWorkerJob(sample), { delayMs: 200 }).catch((error) => error);
  const forcedResult = await forced.close({ drainTimeoutMs: 2 });
  const forcedError = await forcedPending;
  checks.forcedShutdownRejectsPending = forcedResult.forced === 1
    && forcedError instanceof Error && forcedError.message.startsWith("worker-exit:");

  const crash = new Pool(1, { timeoutMs: 200 }); await crash.start();
  try { await crash.run(publicWorkerJob(sample), { type: "crash" }); checks.crashRejected = false; }
  catch (error) { checks.crashRejected = error.message.startsWith("worker-exit:"); }
  await crash.close();
  checks.shutdownClean = pool.pending.size === 0 && pressure.pending.size === 0
    && draining.pending.size === 0 && forced.pending.size === 0 && crash.pending.size === 0;
  return checks;
}

function expectedOutputDigest(job) {
  return digest(Buffer.from(JSON.stringify({ kind: job.expected.kind,
    candidates: job.expected.candidates, positionalDigest: job.expected.positionalDigest,
    positionalBytes: job.expected.positionalBytes, frame: job.expected.frame,
    compressedDigest: job.expected.compressedDigest }), "utf8"));
}

function corpusBindings(jobs) {
  return jobs.map((job) => ({ fence: job.fence, identity: job.identity, frameId: job.frameId,
    forceKeyframe: job.forceKeyframe,
    publicWorkerInputDigest: digest(Buffer.from(JSON.stringify(publicWorkerJob(job)), "utf8")),
    expectedOutputDigest: expectedOutputDigest(job) }));
}

async function runLatinSquare(jobs) {
  const definitions = {
    inline: () => inlineBenchmark(jobs, ROUNDS),
    twoWorkers: () => benchmark(jobs, 2, ROUNDS),
    fourWorkers: () => benchmark(jobs, 4, ROUNDS),
  };
  const orders = [
    ["inline", "twoWorkers", "fourWorkers"],
    ["fourWorkers", "inline", "twoWorkers"],
    ["twoWorkers", "fourWorkers", "inline"],
  ];
  const runs = [];
  for (const order of orders) {
    const rows = {};
    for (const topology of order) rows[topology] = await definitions[topology]();
    runs.push({ order, rows });
  }
  return runs;
}

async function main() {
  const validateAt = process.argv.indexOf("--validate-artifact");
  if (validateAt >= 0) {
    const artifact = JSON.parse(fs.readFileSync(path.resolve(process.argv[validateAt + 1]), "utf8"));
    const { jobs, exactComparisons } = buildCorpus();
    const bindings = corpusBindings(jobs);
    const benchmarkRows = artifact.comparison.latinSquareRuns.flatMap((run) =>
      Object.values(run.rows));
    const checks = {
      schema: artifact.schema === "lbh-s21-worker-isolation-feasibility-v1",
      sources: JSON.stringify(artifact.sources) === JSON.stringify(sourceBindings()),
      populations: JSON.stringify(artifact.corpus.populations) === JSON.stringify(POPULATIONS),
      beats: artifact.corpus.beats === BEATS,
      jobs: artifact.corpus.jobs === jobs.length,
      inputDigest: artifact.corpus.jobInputDigest === sha(Buffer.from(JSON.stringify(bindings))),
      expectedOutputDigest: artifact.corpus.expectedOutputDigest === sha(Buffer.from(
        JSON.stringify(bindings.map((entry) => entry.expectedOutputDigest)))),
      exactComparisons: artifact.exactComparisons === exactComparisons,
      parity: artifact.parity.mismatches === 0
        && ["positionalBytes", "positionalDigest", "decodedFrame", "selectionKind"]
          .every((key) => artifact.parity[key] === jobs.length),
      rounds: artifact.comparison.recipientOrderCounterbalancedRoundsPerLatinSquareCell === ROUNDS
        && artifact.comparison.topologyOrderCounterbalanced === true
        && benchmarkRows.length === 9
        && benchmarkRows.every((row) => row.jobs === ROUNDS * POPULATIONS.reduce((a, b) => a + b, 0)),
      generationBinding: artifact.generation.cleanAtGeneration === true
        && artifact.generation.command.includes("multiplayer-state-pair-worker-feasibility.cjs")
        && artifact.generation.gitCommit.length === 40,
      boundary: artifact.authorityBoundary.workerInputContainsOwner === false
        && artifact.authorityBoundary.compressionOwnerSelectionCommitRemainAuthority === true,
      failures: artifact.allFailureChecksPassed === true
        && Object.values(artifact.failureChecks).every(Boolean),
    };
    const result = { passed: Object.values(checks).every(Boolean), checks };
    console.log(JSON.stringify(result, null, 2));
    process.exit(result.passed ? 0 : 1);
  }
  const { jobs, exactComparisons } = buildCorpus();
  const generatedFromGit = { gitCommit: git("rev-parse", "HEAD"),
    cleanAtGeneration: git("status", "--porcelain") === "",
    command: "LBH_S21_WORKER_OUTPUT=docs/v0.4/evidence/state-pair-s21/worker-feasibility.json node tests/multiplayer-state-pair-worker-feasibility.cjs",
    machine: { hostname: os.hostname(), platform: os.platform(), release: os.release(), arch: os.arch(),
      logicalCpuCount: os.cpus().length, cpuModel: os.cpus()[0]?.model || null,
      node: process.version } };
  const bindings = corpusBindings(jobs);
  const corpusManifest = { schema: "lbh-s21-projection-replay-corpus-v1", populations: POPULATIONS,
    beats: BEATS, jobs: jobs.length, mixedAckBases: true, recoveryJobs: jobs.filter((job) => job.forceKeyframe).length,
    churnJobs: jobs.filter((job) => job.identity.recipientIncarnation > 1).length,
    syntheticPublicFixture: true, syntheticOwnerFixtureAuthorityOnly: true,
    realPrivateDataPresent: false, workerInputContainsOwner: false,
    jobInputDigest: sha(Buffer.from(JSON.stringify(bindings))),
    expectedOutputDigest: sha(Buffer.from(JSON.stringify(bindings.map((entry) => entry.expectedOutputDigest)))) };
  const latinSquareRuns = await runLatinSquare(jobs);
  const failureChecks = await adversarial(jobs);
  const result = { schema: "lbh-s21-worker-isolation-feasibility-v1", generatedAt: new Date().toISOString(),
    generation: generatedFromGit, sources: sourceBindings(), corpus: corpusManifest, exactComparisons,
    parity: { positionalBytes: exactComparisons / 4, positionalDigest: exactComparisons / 4,
      decodedFrame: exactComparisons / 4, selectionKind: exactComparisons / 4, mismatches: 0 },
    comparison: { recipientOrderCounterbalancedRoundsPerLatinSquareCell: ROUNDS,
      topologyOrderCounterbalanced: true, latinSquareRuns,
      cpuBoundary: "Worker thread CPU covers public projection construction only and excludes host structured-clone/message overhead. Authority CPU covers owner construction, pair choice, compression, result validation, and decoded-frame verification.",
      memoryBoundary: "Per-isolate V8 heap high-water and worker-count multiplied upper bounds exclude RSS, native allocations, external ArrayBuffers, and host clone transients; they are not process-memory forecasts.",
      compressionBoundary: "Compression, owner-lane construction, mixed-pair choice, ledger checks, queue ownership, and send commit remain on the match-authority thread.",
      transferBoundary: "Only canonical public keyframe/delta ArrayBuffers cross back from a worker. Owner input never enters a worker. Small fence and digest metadata is cloned and reported separately." },
    failureChecks, allFailureChecksPassed: Object.values(failureChecks).every(Boolean),
    authorityBoundary: { soleWriter: "The match authority retains tick state, ACK/base and ledger mutation, admission, consequences, ordering, queue ownership, result validation, and send commit.",
      worker: "Pure public-lane keyframe/delta projection bytes from immutable checksum-bound public snapshots and exact public bases only.",
      workerInputContainsOwner: false,
      compressionOwnerSelectionCommitRemainAuthority: true,
      prohibited: ["sim mutation", "ACK ingestion", "ledger mutation", "epoch rotation", "queue mutation", "network send", "cross-match reuse"] },
    limitations: ["Synthetic hermetic replay, not product admission", "No runtime worker integration",
      "No hosted/fleet cost claim", "No 24/48/96-client claim"] };
  if (OUT) fs.writeFileSync(OUT, `${JSON.stringify(result, null, 2)}\n`, { flag: "wx" });
  console.log(JSON.stringify(result, null, 2));
  process.exit(result.allFailureChecksPassed && result.parity.mismatches === 0 ? 0 : 1);
}

main().catch((error) => { console.error(error.stack || error); process.exit(1); });
