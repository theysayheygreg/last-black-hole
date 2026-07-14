"use strict";

const path = require("path");
const { Worker } = require("worker_threads");
const { performance } = require("perf_hooks");
const { PROTOCOL, digest } = require("./runtime-public-projection-worker.cjs");

const WORKER = path.join(__dirname, "runtime-public-projection-worker.cjs");

function distribution(values) {
  if (!values.length) return Object.freeze({ count: 0, p50: null, p95: null, p99: null, max: null });
  const sorted = [...values].sort((a, b) => a - b);
  const pick = (q) => sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * q) - 1)];
  return Object.freeze({ count: sorted.length, p50: pick(0.5), p95: pick(0.95),
    p99: pick(0.99), max: sorted.at(-1) });
}

function parseCandidate(message, expectedFence, maxBytes) {
  if (message?.protocol !== PROTOCOL || message.type !== "result"
      || JSON.stringify(message.fence) !== JSON.stringify(expectedFence)) {
    throw Object.assign(new Error("public-worker-fence-mismatch"), { code: "fence-mismatch" });
  }
  const keyframeBytes = Buffer.from(message.keyframeBytes || new ArrayBuffer(0));
  const deltaBytes = message.deltaBytes ? Buffer.from(message.deltaBytes) : null;
  if (!keyframeBytes.length || keyframeBytes.length > maxBytes || (deltaBytes && deltaBytes.length > maxBytes)
      || digest(keyframeBytes) !== message.keyframeDigest
      || (deltaBytes ? digest(deltaBytes) !== message.deltaDigest : message.deltaDigest !== null)) {
    throw Object.assign(new Error("public-worker-result-invalid"), { code: "result-invalid" });
  }
  return Object.freeze({ keyframe: JSON.parse(keyframeBytes.toString("utf8")),
    delta: deltaBytes ? JSON.parse(deltaBytes.toString("utf8")) : null,
    transferBytes: keyframeBytes.length + (deltaBytes?.length || 0),
    computeMs: message.computeMs, workerCpuMicros: message.workerCpuMicros });
}

function createRuntimePublicProjectionPool({ size, maxPending = size * 8, timeoutMs = 80,
  maxResultBytes = 256 * 1024 } = {}) {
  if (![2, 4].includes(size)) throw new RangeError("public projection worker count must be 2 or 4");
  const workers = [];
  const pending = new Map();
  const samples = { dispatchMs: [], roundTripMs: [], computeMs: [] };
  const counters = { issued: 0, completed: 0, rejected: 0, timedOut: 0, backpressure: 0,
    crashes: 0, cancelled: 0, ready: 0, gracefulExits: 0, forcedExits: 0,
    inputCloneBytes: 0, outputTransferBytes: 0, workerCpuMicros: 0, maxPending: 0 };
  let sequence = 0;
  let next = 0;
  let closed = false;

  const ready = Promise.all(Array.from({ length: size }, (_, index) => new Promise((resolve, reject) => {
    const worker = new Worker(WORKER);
    const row = { worker, index, ready: false, exiting: false };
    workers.push(row);
    const readyTimer = setTimeout(() => reject(new Error(`public-worker-ready-timeout:${index}`)), 2_000);
    worker.on("message", (message) => {
      if (message?.protocol !== PROTOCOL) return;
      if (message.type === "ready") {
        clearTimeout(readyTimer); row.ready = true; counters.ready += 1; resolve(); return;
      }
      if (message.type === "shutdown-ack") { row.exiting = true; return; }
      const request = pending.get(message.requestId);
      if (!request) return;
      clearTimeout(request.timer);
      pending.delete(message.requestId);
      try {
        if (message.type === "error") throw Object.assign(new Error(message.error), { code: "worker-error" });
        const parsed = parseCandidate(message, request.fence, maxResultBytes);
        counters.completed += 1;
        counters.outputTransferBytes += parsed.transferBytes;
        counters.workerCpuMicros += parsed.workerCpuMicros || 0;
        samples.computeMs.push(parsed.computeMs || 0);
        samples.roundTripMs.push(performance.now() - request.started);
        request.resolve(parsed);
      } catch (error) {
        counters.rejected += 1;
        request.reject(error);
      }
    });
    worker.on("exit", (code) => {
      clearTimeout(readyTimer);
      row.ready = false;
      if (row.exiting && code === 0) counters.gracefulExits += 1;
      else if (!closed) counters.crashes += 1;
      for (const [requestId, request] of pending) {
        if (request.row !== row) continue;
        clearTimeout(request.timer); pending.delete(requestId);
        counters.rejected += 1;
        request.reject(Object.assign(new Error(`public-worker-exit:${code}`), { code: "worker-exit" }));
      }
    });
    worker.on("error", reject);
  })));

  async function run(job, fence, options = {}) {
    await ready;
    if (closed) throw Object.assign(new Error("public-worker-pool-closed"), { code: "closed" });
    if (pending.size >= maxPending) {
      counters.backpressure += 1;
      throw Object.assign(new Error("public-worker-backpressure"), { code: "backpressure" });
    }
    const row = workers[next++ % workers.length];
    const requestId = ++sequence;
    const started = performance.now();
    const inputCloneBytes = Buffer.byteLength(JSON.stringify({ fence, job }), "utf8");
    counters.inputCloneBytes += inputCloneBytes;
    counters.issued += 1;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        if (!pending.delete(requestId)) return;
        counters.timedOut += 1;
        reject(Object.assign(new Error("public-worker-timeout"), { code: "timeout" }));
      }, options.timeoutMs || timeoutMs);
      pending.set(requestId, { row, fence, resolve, reject, timer, started });
      counters.maxPending = Math.max(counters.maxPending, pending.size);
      row.worker.postMessage({ protocol: PROTOCOL, type: options.crash ? "crash" : "job",
        requestId, fence, job, delayMs: options.delayMs || 0 });
      samples.dispatchMs.push(performance.now() - started);
    });
  }

  async function close({ drainMs = 250, forceMs = 100 } = {}) {
    if (closed) return;
    closed = true;
    const deadline = performance.now() + drainMs;
    while (pending.size && performance.now() < deadline) {
      await new Promise((resolve) => setTimeout(resolve, 2));
    }
    for (const request of pending.values()) {
      clearTimeout(request.timer); counters.cancelled += 1;
      request.reject(Object.assign(new Error("public-worker-cancelled"), { code: "cancelled" }));
    }
    pending.clear();
    for (const row of workers) row.worker.postMessage({ protocol: PROTOCOL, type: "shutdown" });
    await Promise.all(workers.map(async (row) => {
      const exited = new Promise((resolve) => row.worker.once("exit", resolve));
      const timer = new Promise((resolve) => setTimeout(() => resolve("force"), forceMs));
      if (await Promise.race([exited, timer]) === "force") {
        counters.forcedExits += 1;
        await row.worker.terminate();
      }
    }));
  }

  function diagnostics() {
    return Object.freeze({ enabled: true, configuredWorkers: size,
      readyWorkers: workers.filter((row) => row.ready).length, pending: pending.size,
      maxPendingConfigured: maxPending, timeoutMs, ...counters,
      dispatchMs: distribution(samples.dispatchMs), roundTripMs: distribution(samples.roundTripMs),
      computeMs: distribution(samples.computeMs) });
  }

  return Object.freeze({ ready, run, close, diagnostics });
}

module.exports = { createRuntimePublicProjectionPool };
