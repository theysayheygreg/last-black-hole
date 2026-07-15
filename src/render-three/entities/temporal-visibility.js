const DEFAULT_SAMPLE_LIMIT = 8;
const DEFAULT_ENTITY_LIMIT = 1024;
const VISIBILITY_STATES = Object.freeze([
  'visible',
  'offscreen-cull',
  'budget-cull',
  'transparent',
  'absent',
  'reset',
  'occluded',
  'unknown',
]);

function finite(value, fallback = 0) {
  return Number.isFinite(Number(value)) ? Number(value) : fallback;
}

function identityKey(record = {}) {
  return `${String(record.family || 'entity')}:${String(record.id || 'unnamed')}`;
}

function stateFor(record = {}) {
  if (VISIBILITY_STATES.includes(record.state)) return record.state;
  if (record.reason === 'offscreen-cull') return 'offscreen-cull';
  if (record.reason === 'budget-cull') return 'budget-cull';
  if (record.reason === 'transparent' || record.reason === 'zero-opacity') return 'transparent';
  if (record.reason === 'absent') return 'absent';
  if (record.reason === 'reset') return 'reset';
  if (record.reason === 'occluded') return 'occluded';
  if (record.coreSubmitted && record.inView && finite(record.opacity, 1) > 0.001) return 'visible';
  return 'unknown';
}

function normalizeRecord(record = {}) {
  const state = stateFor(record);
  return Object.freeze({
    id: String(record.id || 'unnamed'),
    family: String(record.family || 'entity'),
    role: String(record.role || record.family || 'entity'),
    frameId: finite(record.frameId),
    coreSubmitted: record.coreSubmitted === true,
    inView: record.inView === true,
    opacity: Math.max(0, Math.min(1, finite(record.opacity, state === 'absent' || state === 'reset' ? 0 : 1))),
    state,
    reason: String(record.reason || state),
    occlusion: record.occlusion === 'known' || state === 'occluded' ? 'known' : 'unsupported',
  });
}

function countStates(records) {
  const counts = {};
  for (const record of records) counts[record.state] = (counts[record.state] || 0) + 1;
  return counts;
}

function isStableRecord(record) {
  return record.state === 'visible'
    && record.coreSubmitted
    && record.inView
    && record.opacity > 0.001;
}

function areSequential(frameIds) {
  return frameIds.every((frameId, index) => index === 0 || frameId === frameIds[index - 1] + 1);
}

export function summarizeTemporalSamples(samples = [], { entityId, family, minFrames = 3 } = {}) {
  const id = String(entityId || '');
  const familyId = family == null ? null : String(family);
  const records = samples
    .flatMap((sample) => (Array.isArray(sample?.entities) ? sample.entities : [])
      .map((record) => ({ ...record, frameId: record.frameId ?? sample.frameId })))
    .filter((record) => record.id === id && (familyId == null || record.family === familyId))
    .map(normalizeRecord);
  const requiredFrames = Math.max(1, Math.floor(Number(minFrames) || 1));
  const frameIds = records.map((record) => record.frameId);
  const stable = records.length >= requiredFrames && areSequential(frameIds) && records.every(isStableRecord);
  return {
    entityId: id,
    family: familyId,
    sampledFrames: records.length,
    requiredFrames,
    stableCore: stable,
    dropoutFrames: records.filter((record) => !isStableRecord(record)).length,
    states: [...new Set(records.map((record) => record.state))],
    stateCounts: countStates(records),
    reasons: [...new Set(records.map((record) => record.reason))],
    occlusion: records.some((record) => record.occlusion === 'known') ? 'known' : 'unsupported',
    frameIds,
    sequentialFrameIds: areSequential(frameIds),
  };
}

export function summarizeTemporalFamily(samples = [], { family, minFrames = 3 } = {}) {
  const familyId = String(family || '');
  const records = samples
    .flatMap((sample) => (Array.isArray(sample?.entities) ? sample.entities : [])
      .map((record) => ({ ...record, frameId: record.frameId ?? sample.frameId })))
    .filter((record) => record.family === familyId)
    .map(normalizeRecord);
  const ids = [...new Set(records.map((record) => record.id))];
  const identities = Object.fromEntries(ids.map((id) => [
    id,
    summarizeTemporalSamples(samples, { entityId: id, family: familyId, minFrames }),
  ]));
  const stableCore = ids.length > 0
    && Object.values(identities).every((summary) => summary.stableCore);
  return {
    family: familyId,
    sampledFrames: samples.length,
    expectedIdentityCount: ids.length,
    stableCore,
    states: [...new Set(records.map((record) => record.state))],
    stateCounts: countStates(records),
    identities,
  };
}

export class TemporalVisibilityContract {
  constructor({ sampleLimit = DEFAULT_SAMPLE_LIMIT, entityLimit = DEFAULT_ENTITY_LIMIT } = {}) {
    this.sampleLimit = Math.max(1, Math.floor(Number(sampleLimit) || DEFAULT_SAMPLE_LIMIT));
    this.entityLimit = Math.max(1, Math.floor(Number(entityLimit) || DEFAULT_ENTITY_LIMIT));
    this.samples = [];
    this.current = null;
    this.scope = { phase: null, runId: null };
    this.knownEntities = new Map();
    this.pendingResetEntities = [];
    this.lastFrameId = null;
  }

  reset(scope = {}) {
    this.samples = [];
    this.current = null;
    this.scope = { phase: scope.phase ?? null, runId: scope.runId ?? null };
    this.pendingResetEntities = [...this.knownEntities.values()];
    this.knownEntities.clear();
    this.lastFrameId = null;
  }

  beginFrame({ phase = this.scope.phase, runId = this.scope.runId, frameId = 0, expected = [], families = [] } = {}) {
    if (this.current) throw new Error('Temporal visibility frame already open');
    const normalizedFrameId = finite(frameId);
    if (this.lastFrameId != null && normalizedFrameId !== this.lastFrameId + 1) {
      throw new Error(`Temporal visibility frame ids must be sequential: expected ${this.lastFrameId + 1}, got ${normalizedFrameId}`);
    }
    const expectedEntities = new Map();
    for (const record of expected) {
      const normalized = normalizeRecord({ ...record, frameId: normalizedFrameId });
      expectedEntities.set(identityKey(normalized), normalized);
    }
    // A previously known identity remains expected until a reset or a new
    // snapshot explicitly removes it; that removal becomes an absent record.
    for (const [key, record] of this.knownEntities) {
      if (!expectedEntities.has(key)) expectedEntities.set(key, record);
    }
    this.current = {
      phase: phase ?? null,
      runId: runId ?? null,
      frameId: normalizedFrameId,
      expectedFamilies: new Set(families.map((family) => String(family))),
      expectedEntities,
      records: new Map(),
    };
  }

  recordExpected(record = {}) {
    if (!this.current) return false;
    const normalized = normalizeRecord({ ...record, frameId: this.current.frameId });
    this.current.expectedEntities.set(identityKey(normalized), normalized);
    return true;
  }

  record(record = {}) {
    if (!this.current || this.current.records.size >= this.entityLimit) return false;
    const normalized = normalizeRecord({ ...record, frameId: this.current.frameId });
    const key = identityKey(normalized);
    this.current.expectedEntities.set(key, normalized);
    if (this.current.records.has(key)) return false;
    this.current.records.set(key, normalized);
    return true;
  }

  endFrame() {
    if (!this.current) return;
    for (const resetRecord of this.pendingResetEntities) {
      const key = identityKey(resetRecord);
      if (!this.current.expectedEntities.has(key) && !this.current.records.has(key)) {
        this.record({ ...resetRecord, state: 'reset', reason: 'reset', frameId: this.current.frameId });
      }
    }
    this.pendingResetEntities = [];
    for (const [key, expected] of this.current.expectedEntities) {
      if (this.current.records.has(key)) continue;
      this.record({
        id: expected.id,
        family: expected.family,
        role: expected.role,
        state: 'absent',
        reason: 'absent',
        coreSubmitted: false,
        inView: false,
        opacity: 0,
      });
    }
    const entities = [...this.current.records.values()];
    this.samples.push(Object.freeze({
      phase: this.current.phase,
      runId: this.current.runId,
      frameId: this.current.frameId,
      entities: Object.freeze(entities),
    }));
    if (this.samples.length > this.sampleLimit) this.samples.splice(0, this.samples.length - this.sampleLimit);
    this.knownEntities = new Map(entities.map((record) => [identityKey(record), record]));
    this.lastFrameId = this.current.frameId;
    this.current = null;
  }

  getStats({ entityIds = [], families = [] } = {}) {
    const records = this.samples.flatMap((sample) => sample.entities);
    const ids = new Set(entityIds.map((id) => String(id)));
    for (const record of records) ids.add(record.id);
    const summaries = {};
    for (const id of ids) summaries[id] = summarizeTemporalSamples(this.samples, { entityId: id });
    const familyIds = new Set(families.map((family) => String(family)));
    for (const record of records) familyIds.add(record.family);
    const familySummaries = {};
    for (const family of familyIds) familySummaries[family] = summarizeTemporalFamily(this.samples, { family });
    return {
      scope: { ...this.scope },
      sampleLimit: this.sampleLimit,
      sampleCount: this.samples.length,
      entityLimit: this.entityLimit,
      recordedEntityCount: records.length,
      expectedEntityCount: this.knownEntities.size,
      summaries,
      familySummaries,
      latestFrameId: this.samples.at(-1)?.frameId ?? null,
      sequentialFrameIds: this.samples.every((sample, index) => index === 0 || sample.frameId === this.samples[index - 1].frameId + 1),
    };
  }
}
