const { PROTOCOL_VERSION } = require("./sim-protocol.cjs");

const DEFAULT_SNAPSHOT_RING_CAPACITY = 32;
const DEFAULT_BODY_SCHEMA_VERSION = 1;
const DEFAULT_SNAPSHOT_SCHEMA_VERSION = 1;

function cloneJson(value, fallback = {}) {
  if (value === undefined) return fallback;
  if (value === null || typeof value !== "object") return value;
  return JSON.parse(JSON.stringify(value));
}

function normalizeCapacity(value, fallback) {
  const parsed = Math.floor(Number(value));
  const capacity = Number.isFinite(parsed) ? parsed : fallback;
  if (capacity < 1) throw new Error("Snapshot ring capacity must be at least 1");
  return capacity;
}

function normalizeRunId(value) {
  const runId = String(value || "").trim();
  if (!runId) throw new Error("Snapshot ring requires a non-empty runId");
  return runId;
}

function normalizeSnapshotId(value, fallback = null) {
  if ((value === undefined || value === null || value === "") && fallback !== null) return fallback;
  const parsed = Math.floor(Number(value));
  if (!Number.isFinite(parsed) || parsed < 1) {
    throw new Error(`Invalid snapshot id '${value}'`);
  }
  return parsed;
}

function normalizeSeq(value, fallback = 0) {
  const parsed = Math.floor(Number(value));
  return Number.isFinite(parsed) ? Math.max(0, parsed) : fallback;
}

function normalizeNumber(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function cloneSnapshot(snapshot) {
  return cloneJson(snapshot);
}

class SimSnapshotRing {
  constructor(options = {}) {
    this.capacity = normalizeCapacity(options.capacity, DEFAULT_SNAPSHOT_RING_CAPACITY);
    this.runId = normalizeRunId(options.runId || "run-1");
    this.nextSnapshotId = 1;
    this.snapshots = [];
    this.byId = new Map();
    this.stats = {
      appended: 0,
      dropped: 0,
      duplicateRejected: 0,
      staleLookups: 0,
      futureLookups: 0,
      missingLookups: 0,
      resetLookups: 0,
      resets: 0,
    };
  }

  get firstRetainedSnapshotId() {
    return this.snapshots.length > 0 ? this.snapshots[0].snapshotId : this.nextSnapshotId;
  }

  get lastSnapshotId() {
    return this.nextSnapshotId - 1;
  }

  startRun(runId) {
    this.runId = normalizeRunId(runId);
    this.nextSnapshotId = 1;
    this.snapshots = [];
    this.byId.clear();
    this.stats.resets += 1;
    return this.describe();
  }

  append(snapshot = {}, metadata = {}) {
    const source = { ...cloneJson(snapshot), ...cloneJson(metadata) };
    const snapshotRunId = source.runId === undefined || source.runId === null
      ? this.runId
      : normalizeRunId(source.runId);
    if (snapshotRunId !== this.runId) {
      throw new Error(`Cannot append snapshot for stale run '${snapshotRunId}' while '${this.runId}' is active`);
    }

    const snapshotId = source.snapshotId === undefined || source.snapshotId === null
      ? this.nextSnapshotId
      : normalizeSnapshotId(source.snapshotId);
    if (this.byId.has(snapshotId) || snapshotId < this.nextSnapshotId) {
      this.stats.duplicateRejected += 1;
      throw new Error(`Snapshot id ${snapshotId} is not the next monotonic snapshot id`);
    }

    const baselineSnapshotId = source.baselineSnapshotId === undefined || source.baselineSnapshotId === null
      ? null
      : normalizeSnapshotId(source.baselineSnapshotId);

    const stored = {
      ...source,
      protocolVersion: source.protocolVersion || PROTOCOL_VERSION,
      snapshotId,
      baselineSnapshotId,
      runId: this.runId,
      tick: normalizeSeq(source.tick),
      simTime: normalizeNumber(source.simTime),
      serverTime: source.serverTime ?? null,
      bodySchemaVersion: normalizeSeq(source.bodySchemaVersion, DEFAULT_BODY_SCHEMA_VERSION),
      snapshotSchemaVersion: normalizeSeq(source.snapshotSchemaVersion, DEFAULT_SNAPSHOT_SCHEMA_VERSION),
      lastEventSeq: normalizeSeq(source.lastEventSeq),
    };

    this.nextSnapshotId = snapshotId + 1;
    this.snapshots.push(stored);
    this.byId.set(snapshotId, stored);
    this.stats.appended += 1;

    while (this.snapshots.length > this.capacity) {
      const dropped = this.snapshots.shift();
      this.byId.delete(dropped.snapshotId);
      this.stats.dropped += 1;
    }

    return cloneSnapshot(stored);
  }

  lookup(snapshotId, options = {}) {
    const requestedRunId = options.runId === undefined || options.runId === null
      ? null
      : normalizeRunId(options.runId);
    const id = normalizeSnapshotId(snapshotId);

    if (requestedRunId && requestedRunId !== this.runId) {
      this.stats.resetLookups += 1;
      return this.lookupResult("reset", id, {
        requestedRunId,
        reason: "run-reset",
      });
    }

    const snapshot = this.byId.get(id);
    if (snapshot) {
      return this.lookupResult("hit", id, { snapshot: cloneSnapshot(snapshot), reason: "ok" });
    }

    if (id < this.firstRetainedSnapshotId) {
      this.stats.staleLookups += 1;
      return this.lookupResult("stale", id, { reason: "snapshot-before-retention" });
    }

    if (id > this.lastSnapshotId) {
      this.stats.futureLookups += 1;
      return this.lookupResult("future", id, { reason: "snapshot-after-last-id" });
    }

    this.stats.missingLookups += 1;
    return this.lookupResult("missing", id, { reason: "snapshot-gap" });
  }

  latest(options = {}) {
    const requestedRunId = options.runId === undefined || options.runId === null
      ? null
      : normalizeRunId(options.runId);
    if (requestedRunId && requestedRunId !== this.runId) {
      this.stats.resetLookups += 1;
      return this.lookupResult("reset", null, {
        requestedRunId,
        reason: "run-reset",
      });
    }
    const snapshot = this.snapshots[this.snapshots.length - 1] || null;
    return {
      status: snapshot ? "hit" : "empty",
      reason: snapshot ? "ok" : "empty-ring",
      runId: this.runId,
      snapshotId: snapshot?.snapshotId ?? null,
      firstRetainedSnapshotId: this.firstRetainedSnapshotId,
      lastSnapshotId: this.lastSnapshotId,
      snapshot: snapshot ? cloneSnapshot(snapshot) : null,
    };
  }

  list(options = {}) {
    const requestedRunId = options.runId === undefined || options.runId === null
      ? null
      : normalizeRunId(options.runId);
    const sinceSnapshotId = normalizeSeq(options.sinceSnapshotId);
    if (requestedRunId && requestedRunId !== this.runId) {
      this.stats.resetLookups += 1;
      return {
        status: "reset",
        reason: "run-reset",
        runId: this.runId,
        requestedRunId,
        sinceSnapshotId,
        snapshots: [],
        firstRetainedSnapshotId: this.firstRetainedSnapshotId,
        lastSnapshotId: this.lastSnapshotId,
      };
    }

    const stale = this.snapshots.length > 0 && sinceSnapshotId > 0 && sinceSnapshotId < this.firstRetainedSnapshotId - 1;
    const future = sinceSnapshotId > this.lastSnapshotId;
    if (stale) this.stats.staleLookups += 1;
    if (future) this.stats.futureLookups += 1;

    const effectiveSince = stale ? this.firstRetainedSnapshotId - 1 : sinceSnapshotId;
    return {
      status: stale ? "stale" : future ? "future" : "ok",
      reason: stale ? "since-before-retention" : future ? "since-after-last-id" : "ok",
      runId: this.runId,
      sinceSnapshotId,
      effectiveSinceSnapshotId: effectiveSince,
      firstRetainedSnapshotId: this.firstRetainedSnapshotId,
      lastSnapshotId: this.lastSnapshotId,
      snapshots: future
        ? []
        : this.snapshots
          .filter((snapshot) => snapshot.snapshotId > effectiveSince)
          .map(cloneSnapshot),
    };
  }

  lookupResult(status, snapshotId, extra = {}) {
    return {
      status,
      reason: extra.reason || status,
      runId: this.runId,
      requestedRunId: extra.requestedRunId || this.runId,
      snapshotId,
      firstRetainedSnapshotId: this.firstRetainedSnapshotId,
      lastSnapshotId: this.lastSnapshotId,
      snapshot: extra.snapshot || null,
    };
  }

  describe() {
    return {
      runId: this.runId,
      capacity: this.capacity,
      firstRetainedSnapshotId: this.firstRetainedSnapshotId,
      lastSnapshotId: this.lastSnapshotId,
      nextSnapshotId: this.nextSnapshotId,
      retainedCount: this.snapshots.length,
      stats: this.getStats(),
    };
  }

  getStats() {
    return { ...this.stats };
  }
}

function createSimSnapshotRing(options) {
  return new SimSnapshotRing(options);
}

module.exports = {
  DEFAULT_SNAPSHOT_RING_CAPACITY,
  DEFAULT_BODY_SCHEMA_VERSION,
  DEFAULT_SNAPSHOT_SCHEMA_VERSION,
  SimSnapshotRing,
  createSimSnapshotRing,
};
