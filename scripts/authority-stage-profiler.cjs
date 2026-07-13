"use strict";

const { performance, monitorEventLoopDelay } = require("perf_hooks");

const DEFAULT_SAMPLE_CAPACITY = 512;
const DEFAULT_MAX_RECIPIENTS = 16;
const STAGES = Object.freeze({
  RAW_SNAPSHOT_BUILD: "match.rawSnapshotBuild",
  STATIC_MANIFEST_PREP: "recipient.staticManifestPreparation",
  PUBLIC_CORE: "recipient.publicCoreProjectionConstruction",
  PUBLIC_PROJECTION: "recipient.publicProjectionConstruction",
  PUBLIC_CANONICAL_HASH: "recipient.publicCanonicalHash",
  PUBLIC_DELTA_CANDIDATE: "recipient.publicDeltaCandidate",
  OWNER_SOURCE: "recipient.ownerSourceProjection",
  OWNER_PROJECTION: "recipient.ownerProjectionConstruction",
  OWNER_CANONICAL_HASH: "recipient.ownerCanonicalHash",
  OWNER_DELTA_CANDIDATE: "recipient.ownerDeltaCandidate",
  PAIR_CHOICE: "recipient.pairChoiceFallback",
  PAIR_ENVELOPE: "recipient.pairEnvelopeConstruction",
  JSON_SERIALIZATION: "recipient.jsonSerialization",
  ACCOUNTING: "recipient.replicationAccounting",
  ADAPTER_ENQUEUE: "recipient.adapterQueueEnqueue",
  SOCKET_SEND_CALL: "recipient.socketSendCall",
  SOCKET_SEND_CALLBACK: "recipient.socketSendCallback",
});
const ALLOWED_STAGES = new Set(Object.values(STAGES));
const METRIC_NAMES = Object.freeze([
  "inputBytes", "outputBytes", "allocatedBytes", "entities", "components",
]);

function positiveInteger(value, fallback, label) {
  const parsed = value === undefined ? fallback : Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 1) throw new TypeError(`${label} must be a positive integer`);
  return parsed;
}

function finiteNonNegative(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
}

function percentile(sorted, quantile) {
  if (sorted.length === 0) return null;
  const index = Math.max(0, Math.min(sorted.length - 1, Math.ceil(sorted.length * quantile) - 1));
  return sorted[index];
}

function createRecord(sampleCapacity) {
  return {
    calls: 0,
    totalMs: 0,
    maxMs: 0,
    samples: new Array(sampleCapacity),
    sampleCount: 0,
    sampleCursor: 0,
    inputBytes: 0,
    outputBytes: 0,
    allocatedBytes: 0,
    entities: 0,
    components: 0,
  };
}

function observeRecord(record, durationMs, metrics) {
  const duration = finiteNonNegative(durationMs);
  record.calls += 1;
  record.totalMs += duration;
  record.maxMs = Math.max(record.maxMs, duration);
  record.samples[record.sampleCursor] = duration;
  record.sampleCursor = (record.sampleCursor + 1) % record.samples.length;
  record.sampleCount = Math.min(record.samples.length, record.sampleCount + 1);
  for (const name of METRIC_NAMES) record[name] += finiteNonNegative(metrics?.[name]);
}

function summarizeRecord(record) {
  const samples = record.samples.slice(0, record.sampleCount).sort((a, b) => a - b);
  return Object.freeze({
    calls: record.calls,
    totalMs: record.totalMs,
    meanMs: record.calls ? record.totalMs / record.calls : null,
    p50Ms: percentile(samples, 0.50),
    p95Ms: percentile(samples, 0.95),
    p99Ms: percentile(samples, 0.99),
    maxMs: record.maxMs,
    retainedSamples: record.sampleCount,
    inputBytes: record.inputBytes,
    outputBytes: record.outputBytes,
    allocatedBytes: record.allocatedBytes,
    entities: record.entities,
    components: record.components,
  });
}

function createAuthorityStageProfiler(options = {}) {
  const sampleCapacity = positiveInteger(options.sampleCapacity, DEFAULT_SAMPLE_CAPACITY, "sampleCapacity");
  const maxRecipients = positiveInteger(options.maxRecipients, DEFAULT_MAX_RECIPIENTS, "maxRecipients");
  const stages = new Map();
  const recipientSlots = new Map();
  let overflowRecipientObservations = 0;
  let startedAt = Date.now();
  let generation = 1;
  const eventLoop = monitorEventLoopDelay({ resolution: 20 });
  eventLoop.enable();

  function recipientSlot(recipientKey) {
    if (recipientKey === undefined || recipientKey === null) return null;
    const key = String(recipientKey);
    if (recipientSlots.has(key)) return recipientSlots.get(key);
    if (recipientSlots.size >= maxRecipients) {
      overflowRecipientObservations += 1;
      return "overflow";
    }
    const slot = recipientSlots.size + 1;
    recipientSlots.set(key, slot);
    return slot;
  }

  function recordsFor(stage) {
    if (!ALLOWED_STAGES.has(stage)) throw new RangeError(`Unknown authority profile stage: ${stage}`);
    let record = stages.get(stage);
    if (!record) {
      record = { aggregate: createRecord(sampleCapacity), recipients: new Map() };
      stages.set(stage, record);
    }
    return record;
  }

  function observe(stage, durationMs, metrics = {}) {
    const records = recordsFor(stage);
    observeRecord(records.aggregate, durationMs, metrics);
    const slot = recipientSlot(metrics.recipientKey);
    if (slot !== null) {
      let recipient = records.recipients.get(slot);
      if (!recipient) {
        recipient = createRecord(sampleCapacity);
        records.recipients.set(slot, recipient);
      }
      observeRecord(recipient, durationMs, metrics);
    }
  }

  function measureSync(stage, metrics, callback) {
    const before = performance.now();
    try {
      const value = callback();
      const durationMs = performance.now() - before;
      const extra = typeof metrics === "function" ? metrics(value) : metrics;
      observe(stage, durationMs, extra);
      return value;
    } catch (error) {
      const durationMs = performance.now() - before;
      const extra = typeof metrics === "function" ? metrics(null, error) : metrics;
      observe(stage, durationMs, extra);
      throw error;
    }
  }

  async function measureAsync(stage, metrics, callback) {
    const before = performance.now();
    try {
      const value = await callback();
      const durationMs = performance.now() - before;
      const extra = typeof metrics === "function" ? metrics(value) : metrics;
      observe(stage, durationMs, extra);
      return value;
    } catch (error) {
      const durationMs = performance.now() - before;
      const extra = typeof metrics === "function" ? metrics(null, error) : metrics;
      observe(stage, durationMs, extra);
      throw error;
    }
  }

  function start(stage, metrics = {}) {
    const before = performance.now();
    const expectedGeneration = generation;
    let ended = false;
    return (extra = {}) => {
      if (ended || expectedGeneration !== generation) return false;
      ended = true;
      observe(stage, performance.now() - before, { ...metrics, ...extra });
      return true;
    };
  }

  function eventLoopSnapshot() {
    if (eventLoop.max === 0) {
      return Object.freeze({ unit: "milliseconds", minMs: null, meanMs: null,
        p50Ms: null, p95Ms: null, p99Ms: null, maxMs: null });
    }
    const convert = (value) => Number.isFinite(value) ? value / 1e6 : null;
    return Object.freeze({
      unit: "milliseconds",
      minMs: convert(eventLoop.min),
      meanMs: convert(eventLoop.mean),
      p50Ms: convert(eventLoop.percentile(50)),
      p95Ms: convert(eventLoop.percentile(95)),
      p99Ms: convert(eventLoop.percentile(99)),
      maxMs: convert(eventLoop.max),
    });
  }

  function snapshot() {
    const rows = {};
    for (const stage of Object.values(STAGES)) {
      const record = stages.get(stage);
      if (!record) continue;
      rows[stage] = Object.freeze({
        scope: stage.startsWith("match.") ? "once-per-match-beat" : "per-recipient",
        timingKind: stage === STAGES.SOCKET_SEND_CALLBACK ? "async-wall-latency"
          : stage === STAGES.STATIC_MANIFEST_PREP || stage === STAGES.OWNER_SOURCE
            ? "awaited-wall-time" : "synchronous-exclusive-time",
        aggregate: summarizeRecord(record.aggregate),
        recipients: Object.freeze([...record.recipients.entries()]
          .sort(([left], [right]) => String(left).localeCompare(String(right), undefined, { numeric: true }))
          .map(([slot, recipient]) => Object.freeze({ slot, ...summarizeRecord(recipient) }))),
      });
    }
    return Object.freeze({
      enabled: true,
      schema: "lbh-authority-stage-profile-v1",
      startedAt,
      capturedAt: Date.now(),
      bounds: Object.freeze({ sampleCapacityPerStage: sampleCapacity, maxRecipients, stageCount: ALLOWED_STAGES.size }),
      privacy: "Recipient metrics use process-local ordinal slots; identities and values are never emitted.",
      recipientSlots: recipientSlots.size,
      overflowRecipientObservations,
      eventLoopDelay: eventLoopSnapshot(),
      stages: Object.freeze(rows),
    });
  }

  function reset() {
    generation += 1;
    stages.clear();
    recipientSlots.clear();
    overflowRecipientObservations = 0;
    startedAt = Date.now();
    eventLoop.reset();
  }

  function stop() {
    generation += 1;
    eventLoop.disable();
    stages.clear();
    recipientSlots.clear();
    overflowRecipientObservations = 0;
  }

  return Object.freeze({ observe, measureSync, measureAsync, start, snapshot, reset, stop,
    generation: () => generation });
}

module.exports = {
  DEFAULT_SAMPLE_CAPACITY,
  DEFAULT_MAX_RECIPIENTS,
  STAGES,
  createAuthorityStageProfiler,
};
