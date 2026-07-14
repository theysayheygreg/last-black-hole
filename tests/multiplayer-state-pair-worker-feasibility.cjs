#!/usr/bin/env node
"use strict";

const assert = require("assert");
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const v8 = require("v8");
const { performance } = require("perf_hooks");
const { Worker } = require("worker_threads");
const { createAuthorityDeltaPublisher } = require("../scripts/authority-delta-publisher.cjs");
const { normalizeView } = require("../scripts/canonical-structural-delta.cjs");
const { codecContext, POSITIONAL_CODEC_MANIFEST_HASH } = require("../scripts/state-pair-positional-codec.cjs");
const { createStatePairWireEncoder, parseWireFrame, SERVER_TO_CLIENT } =
  require("../scripts/multiplayer-wire-protocol.cjs");
const { decodeCompressedStatePair } = require("../scripts/state-pair-compression-codec.cjs");
const { replayStatePair, digest } = require("./network/state-pair-pure-replay.cjs");

const ROOT = path.resolve(__dirname, "..");
const WORKER = path.join(__dirname, "network", "state-pair-projection-worker.cjs");
const OUT = process.env.LBH_S21_WORKER_OUTPUT ? path.resolve(ROOT, process.env.LBH_S21_WORKER_OUTPUT) : null;
const MANIFEST_HASH = `sha256:${"8".repeat(64)}`;
const POPULATIONS = [1, 4, 8];
const BEATS = Number(process.env.LBH_S21_WORKER_BEATS || 18);
const ROUNDS = Number(process.env.LBH_S21_WORKER_ROUNDS || 8);

function sourceBindings() {
  return Object.fromEntries([
    __filename,
    path.join(__dirname, "network", "state-pair-pure-replay.cjs"),
    WORKER,
  ].map((file) => [path.relative(ROOT, file), sha(fs.readFileSync(file))]));
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
  }
  async start() {
    const started = performance.now();
    for (let index = 0; index < this.size; index += 1) this.add(index);
    await new Promise((resolve) => setTimeout(resolve, 20));
    this.startupMs = performance.now() - started;
  }
  add(index) {
    const worker = new Worker(WORKER);
    worker.on("message", (message) => {
      if (message.type === "shutdown-ack") return;
      const row = this.pending.get(message.requestId);
      if (!row) return;
      clearTimeout(row.timer); this.pending.delete(message.requestId);
      if (message.type === "error") row.reject(new Error(message.error));
      else row.resolve({ ...message, roundTripMs: performance.now() - row.started });
    });
    worker.on("exit", (code) => {
      for (const [id, row] of this.pending) if (row.worker === worker) {
        clearTimeout(row.timer); this.pending.delete(id); row.reject(new Error(`worker-exit:${code}`));
      }
    });
    this.workers[index] = worker;
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
  async close() {
    assert.strictEqual(this.pending.size, 0);
    await Promise.all(this.workers.map((worker) => worker.terminate()));
  }
}

function validateResult(job, result) {
  assert.deepStrictEqual(result.fence, job.fence);
  assert.strictEqual(result.kind, job.expected.kind);
  assert.strictEqual(result.positionalDigest, job.expected.positionalDigest);
  assert.strictEqual(result.positionalBytes, job.expected.positionalBytes);
  assert.strictEqual(result.compressedDigest, digest(result.compressed));
  assert(decodeCompressedStatePair(result.compressed).equals(result.positional));
  assert.deepStrictEqual(result.decodedFrame, job.expected.frame);
}

function commitResult(job, result, state) {
  validateResult(job, result);
  const fenceKey = JSON.stringify(result.fence);
  if (state.seen.has(fenceKey)) throw new Error("duplicate-worker-result");
  const recipient = `${result.fence.matchId}:${result.fence.authorityIncarnation}:`
    + `${result.fence.recipientId}:${result.fence.recipientIncarnation}`;
  if ((state.lastTick.get(recipient) ?? -1) >= result.fence.tick) throw new Error("out-of-order-worker-result");
  state.seen.add(fenceKey); state.lastTick.set(recipient, result.fence.tick);
  return true;
}

async function benchmark(jobs, workerCount) {
  const pool = new Pool(workerCount, { maxPending: 32, timeoutMs: 4000 });
  await pool.start();
  const roundTrip = [], compute = [], validation = [], cpuMicros = [], heap = [], batchWall = [];
  const byPopulation = Object.fromEntries(POPULATIONS.map((population) => [population,
    jobs.filter((job) => job.fence.matchId === `match-s21-${population}`).slice(-population)]));
  for (let round = 0; round < ROUNDS; round += 1) {
    for (const population of POPULATIONS) {
      const batch = round % 2 ? [...byPopulation[population]].reverse() : byPopulation[population];
      const started = performance.now();
      const rows = await Promise.all(batch.map((job) => pool.run(job)));
      batchWall.push({ population, ms: performance.now() - started });
      for (let index = 0; index < rows.length; index += 1) {
        const validateStarted = performance.now();
        validateResult(batch[index], rows[index].result);
        validation.push(performance.now() - validateStarted);
        roundTrip.push(rows[index].roundTripMs); compute.push(rows[index].computeMs);
        cpuMicros.push(rows[index].cpuMicros); heap.push(rows[index].heapUsed);
      }
    }
  }
  await pool.close();
  return { workers: workerCount, startupMs: pool.startupMs, jobs: roundTrip.length,
    roundTripMs: distribution(roundTrip), workerComputeMs: distribution(compute),
    cloneDispatchCollectProxyMs: distribution(roundTrip.map((value, index) => Math.max(0, value - compute[index]))),
    authorityValidationMs: distribution(validation), workerThreadCpuMicros: distribution(cpuMicros),
    totalWorkerCoreSeconds: cpuMicros.reduce((a, b) => a + b, 0) / 1e6,
    workerHeapHighWaterBytes: Math.max(...heap),
    batchWallByPopulation: Object.fromEntries(POPULATIONS.map((population) => [population,
      distribution(batchWall.filter((entry) => entry.population === population).map((entry) => entry.ms))])) };
}

function inlineBenchmark(jobs) {
  const rows = [], cpu = [], heap = [];
  const byPopulation = Object.fromEntries(POPULATIONS.map((population) => [population,
    jobs.filter((job) => job.fence.matchId === `match-s21-${population}`).slice(-population)]));
  for (let round = 0; round < ROUNDS; round += 1) for (const population of POPULATIONS) {
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
  const pool = new Pool(2, { maxPending: 2, timeoutMs: 40 });
  await pool.start();
  const checks = {};
  const sample = jobs.at(-1);
  const commitState = { seen: new Set(), lastTick: new Map() };
  const baseline = await pool.run(sample); commitResult(sample, baseline.result, commitState);
  const stale = structuredClone(sample); stale.fence.tick -= 6;
  checks.staleRejected = (() => { try { validateResult(sample, replayStatePair(stale)); return false; } catch { return true; } })();
  const cross = structuredClone(sample); cross.fence.matchId = "match-s21-other";
  checks.crossMatchRejected = (() => { try { validateResult(sample, replayStatePair(cross)); return false; } catch { return true; } })();
  const mutated = structuredClone(sample); mutated.current.owner.entities[0].components.ownerState.value.profileId = "mutated";
  checks.mutationRejected = (() => { try { validateResult(sample, replayStatePair(mutated)); return false; } catch { return true; } })();
  checks.duplicateRejected = (() => { try { commitResult(sample, baseline.result, commitState); return false; }
    catch (error) { return error.message === "duplicate-worker-result"; } })();
  const older = jobs.filter((job) => job.fence.matchId === sample.fence.matchId
    && job.fence.recipientId === sample.fence.recipientId
    && job.fence.recipientIncarnation === sample.fence.recipientIncarnation
    && job.fence.tick < sample.fence.tick).at(-1);
  checks.outOfOrderRejected = (() => { try {
    commitResult(older, replayStatePair(older), commitState); return false;
  } catch (error) { return error.message === "out-of-order-worker-result"; } })();
  const held = [pool.run(sample, { delayMs: 100, timeoutMs: 200 }), pool.run(sample, { delayMs: 100, timeoutMs: 200 })];
  try { await pool.run(sample); checks.backpressureRejected = false; }
  catch (error) { checks.backpressureRejected = error.message === "worker-backpressure"; }
  await Promise.all(held);
  try { await pool.run(sample, { delayMs: 100, timeoutMs: 5 }); checks.timeoutRejected = false; }
  catch (error) { checks.timeoutRejected = error.message === "worker-timeout"; }
  await new Promise((resolve) => setTimeout(resolve, 120));
  await pool.close();
  const crash = new Pool(1, { timeoutMs: 200 }); await crash.start();
  try { await crash.run(sample, { type: "crash" }); checks.crashRejected = false; }
  catch (error) { checks.crashRejected = error.message.startsWith("worker-exit:"); }
  await crash.close();
  checks.shutdownClean = pool.pending.size === 0 && crash.pending.size === 0;
  return checks;
}

async function main() {
  const validateAt = process.argv.indexOf("--validate-artifact");
  if (validateAt >= 0) {
    const artifact = JSON.parse(fs.readFileSync(path.resolve(process.argv[validateAt + 1]), "utf8"));
    const { jobs, exactComparisons } = buildCorpus();
    const bindings = jobs.map((job) => ({ fence: job.fence,
      input: digest(Buffer.from(JSON.stringify({ current: job.current, base: job.base }))) }));
    const checks = {
      schema: artifact.schema === "lbh-s21-worker-isolation-feasibility-v1",
      sources: JSON.stringify(artifact.sources) === JSON.stringify(sourceBindings()),
      populations: JSON.stringify(artifact.corpus.populations) === JSON.stringify(POPULATIONS),
      beats: artifact.corpus.beats === BEATS,
      jobs: artifact.corpus.jobs === jobs.length,
      inputDigest: artifact.corpus.jobInputDigest === sha(Buffer.from(JSON.stringify(bindings))),
      exactComparisons: artifact.exactComparisons === exactComparisons,
      parity: artifact.parity.mismatches === 0
        && ["positionalBytes", "positionalDigest", "decodedFrame", "selectionKind"]
          .every((key) => artifact.parity[key] === jobs.length),
      rounds: artifact.comparison.counterbalancedRounds === ROUNDS
        && [artifact.comparison.inline, artifact.comparison.twoWorkers, artifact.comparison.fourWorkers]
          .every((row) => row.jobs === ROUNDS * POPULATIONS.reduce((a, b) => a + b, 0)),
      failures: artifact.allFailureChecksPassed === true
        && Object.values(artifact.failureChecks).every(Boolean),
    };
    const result = { passed: Object.values(checks).every(Boolean), checks };
    console.log(JSON.stringify(result, null, 2));
    process.exit(result.passed ? 0 : 1);
  }
  const { jobs, exactComparisons } = buildCorpus();
  const corpusBindings = jobs.map((job) => ({ fence: job.fence,
    input: digest(Buffer.from(JSON.stringify({ current: job.current, base: job.base }))) }));
  const corpusManifest = { schema: "lbh-s21-projection-replay-corpus-v1", populations: POPULATIONS,
    beats: BEATS, jobs: jobs.length, mixedAckBases: true, recoveryJobs: jobs.filter((job) => job.forceKeyframe).length,
    churnJobs: jobs.filter((job) => job.identity.recipientIncarnation > 1).length,
    syntheticPublicFixture: true, privateDataPresent: false,
    jobInputDigest: sha(Buffer.from(JSON.stringify(corpusBindings))) };
  const inline = inlineBenchmark(jobs);
  const two = await benchmark(jobs, 2);
  const four = await benchmark(jobs, 4);
  const failureChecks = await adversarial(jobs);
  const result = { schema: "lbh-s21-worker-isolation-feasibility-v1", generatedAt: new Date().toISOString(),
    sources: sourceBindings(), corpus: corpusManifest, exactComparisons,
    parity: { positionalBytes: exactComparisons / 4, positionalDigest: exactComparisons / 4,
      decodedFrame: exactComparisons / 4, selectionKind: exactComparisons / 4, mismatches: 0 },
    comparison: { counterbalancedRounds: ROUNDS, inline, twoWorkers: two, fourWorkers: four,
      compressionBoundary: "Compression runs inside the pure replay worker; authority commit validation decodes the compressed envelope and verifies the exact positional digest and frame.",
      transferBoundary: "Immutable view/base objects are structured-cloned in; only the final compressed ArrayBuffer is transferred out. The positional source remains worker-local until validated output is committed." },
    failureChecks, allFailureChecksPassed: Object.values(failureChecks).every(Boolean),
    authorityBoundary: { soleWriter: "The match authority retains tick state, ACK/base and ledger mutation, admission, consequences, ordering, queue ownership, result validation, and send commit.",
      worker: "Pure reconstruction of candidate/projection bytes from immutable checksum-bound snapshots and exact supplied bases only.",
      prohibited: ["sim mutation", "ACK ingestion", "ledger mutation", "epoch rotation", "queue mutation", "network send", "cross-match reuse"] },
    limitations: ["Synthetic hermetic replay, not product admission", "No runtime worker integration",
      "No hosted/fleet cost claim", "No 24/48/96-client claim"] };
  if (OUT) fs.writeFileSync(OUT, `${JSON.stringify(result, null, 2)}\n`, { flag: "wx" });
  console.log(JSON.stringify(result, null, 2));
  process.exit(result.allFailureChecksPassed && result.parity.mismatches === 0 ? 0 : 1);
}

main().catch((error) => { console.error(error.stack || error); process.exit(1); });
