"use strict";

const { performance, monitorEventLoopDelay, PerformanceObserver } = require("perf_hooks");

const SAMPLE_CAPACITY = 512;
const MAX_RECIPIENTS = 16;

const STAGES = Object.freeze({
  PUBLIC_CORE: "publicCoreSource",
  BODY_NORMALIZE_VALIDATE: "bodyNormalizeAllowlist",
  BODY_CANONICAL_HASH: "bodyCanonicalEncodingHash",
  COHORT_DELTA: "cohortLookupDeltaSerialize",
  OWNER_SOURCE: "ownerSourcePreparedProjection",
  LEGACY_PUBLISHER: "legacyPlaceholderOwnerPublisher",
  ENVELOPE_BUILD: "recipientEnvelopeBuildValidate",
  ENVELOPE_SERIALIZE: "envelopeSerializeDigestRetain",
  ADAPTER_DIGEST: "adapterDigestVerification",
  COMPRESSION: "brotliCompression",
  ACCOUNTING_ENQUEUE: "accountingEnqueue",
  SOCKET_SEND: "socketSendCall",
  SOCKET_CALLBACK: "socketCallbackAsyncWall",
  ACK_INGESTION: "ackIngestionAsyncWall",
  SIM_TICK: "simTick",
});

const EXCLUSIVE = new Set([
  STAGES.PUBLIC_CORE, STAGES.BODY_NORMALIZE_VALIDATE, STAGES.BODY_CANONICAL_HASH,
  STAGES.COHORT_DELTA, STAGES.OWNER_SOURCE, STAGES.LEGACY_PUBLISHER,
  STAGES.ENVELOPE_BUILD, STAGES.ENVELOPE_SERIALIZE, STAGES.ADAPTER_DIGEST,
  STAGES.COMPRESSION, STAGES.ACCOUNTING_ENQUEUE, STAGES.SOCKET_SEND,
]);
const ASYNC_WALL = new Set([STAGES.SOCKET_CALLBACK, STAGES.ACK_INGESTION]);
const FIXED_LABELS = new Set(Object.values(STAGES));

function percentile(values, quantile) {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.max(0, Math.min(sorted.length - 1, Math.ceil(sorted.length * quantile) - 1))];
}

function summary(values) {
  const finite = values.filter((value) => Number.isFinite(value) && value >= 0);
  return Object.freeze({ count: finite.length,
    p50Ms: percentile(finite, 0.50), p95Ms: percentile(finite, 0.95),
    p99Ms: percentile(finite, 0.99), maxMs: finite.length ? Math.max(...finite) : null,
    totalMs: finite.reduce((sum, value) => sum + value, 0) });
}

function createS23tPublicBodyProfiler() {
  let generation = 1;
  let nextOrdinal = 1;
  let activeBeat = null;
  let exclusiveDepth = 0;
  let beatCursor = 0;
  let beatCount = 0;
  const beats = new Array(SAMPLE_CAPACITY);
  const recipientSlots = new Map();
  let overflowRecipientObservations = 0;
  let incompleteBeats = 0;
  let nestedTimerViolations = 0;
  const asyncSamples = Object.fromEntries([...ASYNC_WALL].map((stage) => [stage, []]));
  const simTickSamples = [];
  const eventLoop = monitorEventLoopDelay({ resolution: 10 });
  eventLoop.enable();
  const gc = [];
  const gcObserver = new PerformanceObserver((list) => {
    for (const entry of list.getEntries()) {
      gc.push(Object.freeze({ durationMs: entry.duration, kind: Number(entry.detail?.kind ?? entry.kind ?? 0) }));
      if (gc.length > SAMPLE_CAPACITY) gc.shift();
    }
  });
  gcObserver.observe({ entryTypes: ["gc"] });

  function slotFor(key) {
    if (key === undefined || key === null) return 0;
    if (recipientSlots.has(key)) return recipientSlots.get(key);
    if (recipientSlots.size >= MAX_RECIPIENTS) {
      overflowRecipientObservations += 1;
      return MAX_RECIPIENTS + 1;
    }
    const slot = recipientSlots.size + 1;
    recipientSlots.set(key, slot);
    return slot;
  }

  function systemSample() {
    return { cpu: process.cpuUsage(), elu: performance.eventLoopUtilization(), memory: process.memoryUsage() };
  }

  function beginBeat() {
    if (activeBeat) {
      incompleteBeats += 1;
      activeBeat = null;
      exclusiveDepth = 0;
    }
    activeBeat = { ordinal: nextOrdinal++, startedAt: performance.now(), systemStart: systemSample(),
      stages: Object.create(null), invocations: Object.create(null), slots: new Set(), gcStart: gc.length };
    return activeBeat.ordinal;
  }

  function observe(stage, durationMs, recipientKey = null) {
    if (!FIXED_LABELS.has(stage)) throw new RangeError("S23T stage label is not fixed");
    const duration = Math.max(0, Number(durationMs) || 0);
    if (ASYNC_WALL.has(stage)) {
      const samples = asyncSamples[stage];
      samples.push(duration);
      if (samples.length > SAMPLE_CAPACITY) samples.shift();
      return;
    }
    if (stage === STAGES.SIM_TICK) {
      simTickSamples.push(duration);
      if (simTickSamples.length > SAMPLE_CAPACITY) simTickSamples.shift();
      return;
    }
    if (!activeBeat) return;
    const slot = slotFor(recipientKey);
    if (slot) activeBeat.slots.add(slot);
    activeBeat.stages[stage] = (activeBeat.stages[stage] || 0) + duration;
    activeBeat.invocations[stage] = (activeBeat.invocations[stage] || 0) + 1;
  }

  function measureSync(stage, recipientKey, callback) {
    if (!EXCLUSIVE.has(stage)) throw new RangeError("S23T synchronous timer is not exclusive");
    if (exclusiveDepth !== 0) {
      nestedTimerViolations += 1;
      throw new Error(`S23T exclusive timer nesting at ${stage}`);
    }
    exclusiveDepth = 1;
    const startedAt = performance.now();
    try { return callback(); }
    finally {
      observe(stage, performance.now() - startedAt, recipientKey);
      exclusiveDepth = 0;
    }
  }

  function startAsync(stage) {
    if (!ASYNC_WALL.has(stage)) throw new RangeError("S23T async stage is unsupported");
    const startedAt = performance.now();
    const expectedGeneration = generation;
    let finished = false;
    return () => {
      if (finished || generation !== expectedGeneration) return false;
      finished = true;
      observe(stage, performance.now() - startedAt);
      return true;
    };
  }

  function endBeat() {
    if (!activeBeat) return false;
    const endedAt = performance.now();
    const systemEnd = systemSample();
    const outerMs = endedAt - activeBeat.startedAt;
    const exclusiveMs = Object.entries(activeBeat.stages)
      .filter(([stage]) => EXCLUSIVE.has(stage)).reduce((sum, [, value]) => sum + value, 0);
    const cpu = process.cpuUsage(activeBeat.systemStart.cpu);
    const elu = performance.eventLoopUtilization(systemEnd.elu, activeBeat.systemStart.elu);
    const memory = systemEnd.memory;
    const row = Object.freeze({ ordinal: activeBeat.ordinal, outerMs, exclusiveMs,
      unattributedMs: Math.max(0, outerMs - exclusiveMs),
      reconciliationRatio: outerMs > 0 ? exclusiveMs / outerMs : 0,
      recipientSlots: Object.freeze([...activeBeat.slots].sort((a, b) => a - b)),
      stages: Object.freeze({ ...activeBeat.stages }), invocations: Object.freeze({ ...activeBeat.invocations }),
      cpuMicroseconds: cpu.user + cpu.system, elu: elu.utilization,
      heapUsed: memory.heapUsed, heapTotal: memory.heapTotal, rss: memory.rss,
      external: memory.external, arrayBuffers: memory.arrayBuffers,
      gcEvents: Math.max(0, gc.length - activeBeat.gcStart) });
    beats[beatCursor] = row;
    beatCursor = (beatCursor + 1) % SAMPLE_CAPACITY;
    beatCount = Math.min(SAMPLE_CAPACITY, beatCount + 1);
    activeBeat = null;
    return true;
  }

  function rows() {
    if (beatCount < SAMPLE_CAPACITY) return beats.slice(0, beatCount);
    return [...beats.slice(beatCursor), ...beats.slice(0, beatCursor)];
  }

  function eventLoopSnapshot() {
    const ms = (value) => Number.isFinite(value) ? value / 1e6 : null;
    return eventLoop.max === 0 ? null : Object.freeze({ p50Ms: ms(eventLoop.percentile(50)),
      p95Ms: ms(eventLoop.percentile(95)), p99Ms: ms(eventLoop.percentile(99)), maxMs: ms(eventLoop.max) });
  }

  function snapshot() {
    const retained = rows();
    const stageRows = {};
    for (const stage of EXCLUSIVE) {
      stageRows[stage] = Object.freeze({ timingKind: "exclusive-synchronous",
        duration: summary(retained.map((beat) => beat.stages[stage] || 0)),
        invocations: summary(retained.map((beat) => beat.invocations[stage] || 0)) });
    }
    for (const stage of ASYNC_WALL) stageRows[stage] = Object.freeze({ timingKind: "async-wall-excluded",
      duration: summary(asyncSamples[stage]) });
    stageRows[STAGES.SIM_TICK] = Object.freeze({ timingKind: "separate-synchronous",
      duration: summary(simTickSamples) });
    const highWater = (name) => retained.length ? Math.max(...retained.map((beat) => beat[name])) : null;
    return Object.freeze({ enabled: true, schema: "lbh-s23t-public-body-profile-v1",
      bounds: Object.freeze({ sourceBeatCapacity: SAMPLE_CAPACITY, maxRecipientSlots: MAX_RECIPIENTS }),
      privacy: "Ordinal recipient slots and numeric timing/counter/process values only; no identity, owner payload, world/entity value, frame, or arbitrary string is retained.",
      timingContract: Object.freeze({ exclusiveTimersNeverNest: true,
        asyncWallExcludedFromReconciliation: true, inclusiveParents: Object.freeze([]),
        diagnosticSerializationInsideTimedSpans: false }),
      completeSourceBeats: retained.length, incompleteBeats, nestedTimerViolations,
      recipientSlots: recipientSlots.size, overflowRecipientObservations,
      outer: summary(retained.map((beat) => beat.outerMs)),
      unattributed: summary(retained.map((beat) => beat.unattributedMs)),
      reconciliation: Object.freeze({ ratios: summary(retained.map((beat) => beat.reconciliationRatio)),
        aggregateRatio: retained.reduce((sum, beat) => sum + beat.outerMs, 0) > 0
          ? retained.reduce((sum, beat) => sum + beat.exclusiveMs, 0)
            / retained.reduce((sum, beat) => sum + beat.outerMs, 0) : 0,
        p95UnattributedMs: percentile(retained.map((beat) => beat.unattributedMs), 0.95) }),
      stages: Object.freeze(stageRows), eventLoopDelay: eventLoopSnapshot(),
      gc: Object.freeze({ events: gc.length, duration: summary(gc.map((entry) => entry.durationMs)),
        byKind: Object.freeze(Object.fromEntries([...new Set(gc.map((entry) => entry.kind))]
          .map((kind) => [kind, gc.filter((entry) => entry.kind === kind).length]))) }),
      memoryHighWater: Object.freeze({ heapUsed: highWater("heapUsed"), heapTotal: highWater("heapTotal"),
        rss: highWater("rss"), external: highWater("external"), arrayBuffers: highWater("arrayBuffers") }),
      process: Object.freeze({ cpuMicrosecondsPerBeat: summary(retained.map((beat) => beat.cpuMicroseconds)),
        eluPerBeat: summary(retained.map((beat) => beat.elu)) }),
      sourceBeats: Object.freeze(retained) });
  }

  function reset() {
    generation += 1;
    activeBeat = null;
    exclusiveDepth = 0;
    beatCursor = 0;
    beatCount = 0;
    beats.fill(undefined);
    recipientSlots.clear();
    overflowRecipientObservations = 0;
    incompleteBeats = 0;
    nestedTimerViolations = 0;
    for (const samples of Object.values(asyncSamples)) samples.length = 0;
    simTickSamples.length = 0;
    gc.length = 0;
    eventLoop.reset();
  }

  function stop() {
    generation += 1;
    eventLoop.disable();
    gcObserver.disconnect();
  }

  return Object.freeze({ beginBeat, endBeat, measureSync, startAsync, observe, snapshot, reset, stop });
}

module.exports = { SAMPLE_CAPACITY, MAX_RECIPIENTS, STAGES, createS23tPublicBodyProfiler };
