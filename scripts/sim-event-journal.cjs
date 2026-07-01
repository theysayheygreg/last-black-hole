const {
  REPLICATION_LANES,
  normalizeReplicationLane,
  normalizeLaneFilter,
  eventMatchesLane,
} = require("./replication-lanes.cjs");

const DEFAULT_EVENT_JOURNAL_CAPACITY = 256;

function cloneJson(value, fallback = {}) {
  if (value === undefined) return fallback;
  if (value === null || typeof value !== "object") return value;
  return JSON.parse(JSON.stringify(value));
}

function normalizeCapacity(value, fallback) {
  const parsed = Math.floor(Number(value));
  const capacity = Number.isFinite(parsed) ? parsed : fallback;
  if (capacity < 1) throw new Error("Event journal capacity must be at least 1");
  return capacity;
}

function normalizeRunId(value) {
  const runId = String(value || "").trim();
  if (!runId) throw new Error("Event journal requires a non-empty runId");
  return runId;
}

function normalizeSeq(value, fallback = 0) {
  const parsed = Math.floor(Number(value));
  return Number.isFinite(parsed) ? Math.max(0, parsed) : fallback;
}

function normalizeNumber(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function normalizeStringField(value, fallback = null) {
  if (value === undefined || value === null || value === "") return fallback;
  return String(value);
}

function cloneEvent(event) {
  return {
    seq: event.seq,
    runId: event.runId,
    tick: event.tick,
    simTime: event.simTime,
    type: event.type,
    lane: event.lane,
    source: event.source,
    subject: event.subject,
    visibility: event.visibility,
    payload: cloneJson(event.payload),
  };
}

class SimEventJournal {
  constructor(options = {}) {
    this.capacity = normalizeCapacity(options.capacity, DEFAULT_EVENT_JOURNAL_CAPACITY);
    this.runId = normalizeRunId(options.runId || "run-1");
    this.nextSeq = 1;
    this.events = [];
    this.stats = {
      appended: 0,
      dropped: 0,
      duplicateRejected: 0,
      staleReads: 0,
      futureReads: 0,
      resetReads: 0,
      resets: 0,
    };
  }

  get lastSeq() {
    return this.nextSeq - 1;
  }

  get firstRetainedSeq() {
    return this.events.length > 0 ? this.events[0].seq : this.nextSeq;
  }

  get droppedBeforeSeq() {
    return this.firstRetainedSeq;
  }

  startRun(runId) {
    this.runId = normalizeRunId(runId);
    this.nextSeq = 1;
    this.events = [];
    this.stats.resets += 1;
    return this.describe();
  }

  append(input = {}) {
    const eventRunId = input.runId === undefined || input.runId === null
      ? this.runId
      : normalizeRunId(input.runId);
    if (eventRunId !== this.runId) {
      throw new Error(`Cannot append event for stale run '${eventRunId}' while '${this.runId}' is active`);
    }

    if (input.seq !== undefined && input.seq !== null) {
      const requestedSeq = normalizeSeq(input.seq);
      if (requestedSeq !== this.nextSeq) {
        this.stats.duplicateRejected += 1;
        throw new Error(`Event journal owns sequence ids; expected next seq ${this.nextSeq}, got ${requestedSeq}`);
      }
    }

    const type = String(input.type || "").trim();
    if (!type) throw new Error("Event journal append requires a non-empty type");

    const event = {
      seq: this.nextSeq,
      runId: this.runId,
      tick: normalizeSeq(input.tick),
      simTime: normalizeNumber(input.simTime),
      type,
      lane: normalizeReplicationLane(input.lane, REPLICATION_LANES.GLOBAL),
      source: normalizeStringField(input.source, "sim"),
      subject: normalizeStringField(input.subject),
      visibility: normalizeStringField(input.visibility, "public"),
      payload: cloneJson(input.payload),
    };

    this.nextSeq += 1;
    this.events.push(event);
    this.stats.appended += 1;

    while (this.events.length > this.capacity) {
      this.events.shift();
      this.stats.dropped += 1;
    }

    return cloneEvent(event);
  }

  read(options = {}) {
    const requestedRunId = options.runId === undefined || options.runId === null
      ? null
      : normalizeRunId(options.runId);
    const since = normalizeSeq(options.since);
    const laneFilter = normalizeLaneFilter(options.lane ?? options.lanes);
    const lastSeq = this.lastSeq;

    if (requestedRunId && requestedRunId !== this.runId) {
      this.stats.resetReads += 1;
      return {
        runId: this.runId,
        requestedRunId,
        since,
        effectiveSince: lastSeq,
        lastSeq,
        nextSince: lastSeq,
        droppedBeforeSeq: this.droppedBeforeSeq,
        retainedCount: this.events.length,
        laneFilter,
        stale: false,
        future: false,
        reset: true,
        reason: "run-reset",
        events: [],
      };
    }

    const stale = this.events.length > 0 && since > 0 && since < this.firstRetainedSeq - 1;
    const future = since > lastSeq;
    if (stale) this.stats.staleReads += 1;
    if (future) this.stats.futureReads += 1;

    const effectiveSince = stale ? this.firstRetainedSeq - 1 : since;
    const events = future
      ? []
      : this.events
        .filter((event) => event.seq > effectiveSince && eventMatchesLane(event, laneFilter))
        .map(cloneEvent);

    return {
      runId: this.runId,
      requestedRunId: requestedRunId || this.runId,
      since,
      effectiveSince,
      lastSeq,
      nextSince: lastSeq,
      droppedBeforeSeq: this.droppedBeforeSeq,
      retainedCount: this.events.length,
      laneFilter,
      stale,
      future,
      reset: false,
      reason: stale ? "since-before-retention" : future ? "since-after-last-seq" : "ok",
      events,
    };
  }

  describe() {
    return {
      runId: this.runId,
      capacity: this.capacity,
      firstRetainedSeq: this.firstRetainedSeq,
      droppedBeforeSeq: this.droppedBeforeSeq,
      lastSeq: this.lastSeq,
      nextSeq: this.nextSeq,
      retainedCount: this.events.length,
      stats: this.getStats(),
    };
  }

  getStats() {
    return { ...this.stats };
  }
}

class EventPlaybackGate {
  constructor(options = {}) {
    this.runId = options.runId ? normalizeRunId(options.runId) : null;
    this.lastSeq = normalizeSeq(options.lastSeq);
    this.stats = {
      accepted: 0,
      duplicates: 0,
      staleRunRejects: 0,
      resets: 0,
      invalid: 0,
    };
  }

  reset(runId) {
    this.runId = normalizeRunId(runId);
    this.lastSeq = 0;
    this.stats.resets += 1;
    return this.describe();
  }

  accept(event) {
    if (!event || event.seq === undefined || event.seq === null || !event.runId) {
      this.stats.invalid += 1;
      return { accepted: false, reason: "invalid-event", runId: this.runId, lastSeq: this.lastSeq };
    }

    const eventRunId = normalizeRunId(event.runId);
    if (this.runId === null) this.runId = eventRunId;
    if (eventRunId !== this.runId) {
      this.stats.staleRunRejects += 1;
      return {
        accepted: false,
        reason: "stale-run",
        resetRequired: true,
        runId: this.runId,
        eventRunId,
        lastSeq: this.lastSeq,
      };
    }

    const seq = normalizeSeq(event.seq);
    if (seq <= this.lastSeq) {
      this.stats.duplicates += 1;
      return { accepted: false, reason: "duplicate", runId: this.runId, lastSeq: this.lastSeq };
    }

    this.lastSeq = seq;
    this.stats.accepted += 1;
    return { accepted: true, reason: "accepted", runId: this.runId, lastSeq: this.lastSeq };
  }

  acceptWindow(window = {}) {
    let reset = false;
    if (window.reset) {
      this.reset(window.runId);
      return { reset: true, events: [], lastSeq: this.lastSeq, stats: this.getStats() };
    }

    if (window.runId && this.runId && window.runId !== this.runId) {
      this.reset(window.runId);
      reset = true;
    }

    const accepted = [];
    for (const event of window.events || []) {
      const result = this.accept(event);
      if (result.accepted) accepted.push(cloneEvent(event));
    }
    return { reset, events: accepted, lastSeq: this.lastSeq, stats: this.getStats() };
  }

  describe() {
    return {
      runId: this.runId,
      lastSeq: this.lastSeq,
      stats: this.getStats(),
    };
  }

  getStats() {
    return { ...this.stats };
  }
}

function createSimEventJournal(options) {
  return new SimEventJournal(options);
}

function createEventPlaybackGate(options) {
  return new EventPlaybackGate(options);
}

module.exports = {
  DEFAULT_EVENT_JOURNAL_CAPACITY,
  SimEventJournal,
  EventPlaybackGate,
  createSimEventJournal,
  createEventPlaybackGate,
};
