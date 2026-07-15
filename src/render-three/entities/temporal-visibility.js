const DEFAULT_SAMPLE_LIMIT = 8;
const DEFAULT_ENTITY_LIMIT = 128;

function finite(value, fallback = 0) {
  return Number.isFinite(Number(value)) ? Number(value) : fallback;
}
function normalizeRecord(record = {}) {
  return Object.freeze({
    id: String(record.id || 'unnamed'),
    role: String(record.role || 'entity'),
    frameId: finite(record.frameId),
    coreSubmitted: record.coreSubmitted === true,
    inView: record.inView === true,
    opacity: Math.max(0, Math.min(1, finite(record.opacity, 1))),
    reason: String(record.reason || 'unknown'),
  });
}

export function summarizeTemporalSamples(samples = [], { entityId, minFrames = 3 } = {}) {
  const id = String(entityId || '');
  const records = samples
    .flatMap((sample) => Array.isArray(sample?.entities) ? sample.entities : [])
    .filter((record) => record.id === id)
    .map(normalizeRecord);
  const requiredFrames = Math.max(1, Math.floor(Number(minFrames) || 1));
  const stable = records.length >= requiredFrames && records.every((record) => (
    record.coreSubmitted && record.inView && record.opacity > 0.001
  ));
  return {
    entityId: id,
    sampledFrames: records.length,
    requiredFrames,
    stableCore: stable,
    dropoutFrames: records.filter((record) => !record.coreSubmitted || !record.inView || record.opacity <= 0.001).length,
    reasons: [...new Set(records.map((record) => record.reason))],
    frameIds: records.map((record) => record.frameId),
  };
}

export class TemporalVisibilityContract {
  constructor({ sampleLimit = DEFAULT_SAMPLE_LIMIT, entityLimit = DEFAULT_ENTITY_LIMIT } = {}) {
    this.sampleLimit = Math.max(1, Math.floor(Number(sampleLimit) || DEFAULT_SAMPLE_LIMIT));
    this.entityLimit = Math.max(1, Math.floor(Number(entityLimit) || DEFAULT_ENTITY_LIMIT));
    this.samples = [];
    this.current = null;
    this.scope = { phase: null, runId: null };
  }

  reset(scope = {}) {
    this.samples = [];
    this.current = null;
    this.scope = { phase: scope.phase ?? null, runId: scope.runId ?? null };
  }

  beginFrame({ phase = this.scope.phase, runId = this.scope.runId, frameId = 0 } = {}) {
    this.current = {
      phase: phase ?? null,
      runId: runId ?? null,
      frameId: finite(frameId),
      entities: [],
    };
  }

  record(record = {}) {
    if (!this.current || this.current.entities.length >= this.entityLimit) return false;
    this.current.entities.push(normalizeRecord({ ...record, frameId: this.current.frameId }));
    return true;
  }

  endFrame() {
    if (!this.current) return;
    this.samples.push(Object.freeze({
      phase: this.current.phase,
      runId: this.current.runId,
      frameId: this.current.frameId,
      entities: Object.freeze(this.current.entities.slice()),
    }));
    if (this.samples.length > this.sampleLimit) this.samples.splice(0, this.samples.length - this.sampleLimit);
    this.current = null;
  }

  getStats({ entityIds = [] } = {}) {
    const summaries = {};
    for (const id of entityIds) summaries[id] = summarizeTemporalSamples(this.samples, { entityId: id });
    const records = this.samples.flatMap((sample) => sample.entities);
    return {
      scope: { ...this.scope },
      sampleLimit: this.sampleLimit,
      sampleCount: this.samples.length,
      entityLimit: this.entityLimit,
      recordedEntityCount: records.length,
      summaries,
      latestFrameId: this.samples.at(-1)?.frameId ?? null,
    };
  }
}
