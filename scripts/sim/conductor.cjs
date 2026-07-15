const { createRNGStreams } = require("../rng-stream.cjs");
const { wrapPosition, wrappedDistance } = require("./world-geometry.cjs");

function finiteNumber(value, label) {
  const number = Number(value);
  if (!Number.isFinite(number)) throw new TypeError(`${label} must be finite`);
  return number;
}

function nonNegativeNumber(value, label) {
  const number = finiteNumber(value, label);
  if (number < 0) throw new RangeError(`${label} must not be negative`);
  return number;
}

function positiveNumber(value, label) {
  const number = finiteNumber(value, label);
  if (number <= 0) throw new RangeError(`${label} must be greater than zero`);
  return number;
}

function integerAtLeast(value, label, minimum = 0) {
  const number = finiteNumber(value, label);
  if (!Number.isInteger(number) || number < minimum) {
    throw new RangeError(`${label} must be an integer at least ${minimum}`);
  }
  return number;
}

function clamp01(value) {
  const number = finiteNumber(value, "progress");
  return Math.max(0, Math.min(1, number));
}

// Stable cloning keeps schedule serialization independent of declaration key order.
function stableClone(value, label = "value") {
  if (value === null || typeof value === "string" || typeof value === "boolean") return value;
  if (typeof value === "number") return finiteNumber(value, label);
  if (Array.isArray(value)) return Object.freeze(value.map((item, index) => stableClone(item, `${label}[${index}]`)));
  if (!value || typeof value !== "object") throw new TypeError(`${label} must be JSON-compatible data`);

  const result = {};
  for (const key of Object.keys(value).sort()) {
    result[key] = stableClone(value[key], `${label}.${key}`);
  }
  return Object.freeze(result);
}

function compareTimedRecords(a, b) {
  if (a.time !== b.time) return a.time - b.time;
  if (a.id < b.id) return -1;
  if (a.id > b.id) return 1;
  return (a.waveIndex || 0) - (b.waveIndex || 0);
}

class EventFrontConflictError extends RangeError {
  constructor(first, second, offsetGuardSeconds) {
    super(
      `Event fronts "${first.id}" at ${first.time} and "${second.id}" at ${second.time}`
      + ` must be at least ${offsetGuardSeconds} seconds apart`
    );
    this.name = "EventFrontConflictError";
    this.code = "EVENT_FRONT_OFFSET_CONFLICT";
    this.firstId = first.id;
    this.secondId = second.id;
    this.separation = Math.abs(first.time - second.time);
    this.offsetGuardSeconds = offsetGuardSeconds;
  }
}

function normalizeEventFront(front) {
  if (!front || typeof front !== "object") throw new TypeError("event front must be an object");
  const id = String(front.id || "").trim();
  if (!id) throw new TypeError("event front id must not be empty");
  const time = nonNegativeNumber(front.time, `event front ${id} time`);
  const kind = String(front.kind || "event");
  const metadata = front.metadata === undefined ? {} : front.metadata;
  return stableClone({ id, time, kind, metadata }, `event front ${id}`);
}

class EventFrontRegistry {
  constructor({ offsetGuardSeconds = 0 } = {}) {
    this.offsetGuardSeconds = nonNegativeNumber(offsetGuardSeconds, "offsetGuardSeconds");
    this._events = [];
  }

  register(front) {
    return this.registerMany([front])[0];
  }

  registerMany(fronts) {
    if (!Array.isArray(fronts)) throw new TypeError("event fronts must be an array");
    const candidates = fronts.map(normalizeEventFront);
    const ids = new Set(this._events.map((event) => event.id));
    for (const candidate of candidates) {
      if (ids.has(candidate.id)) throw new RangeError(`Event front id already registered: ${candidate.id}`);
      ids.add(candidate.id);
    }

    const ordered = this._events.concat(candidates).sort(compareTimedRecords);
    for (let index = 1; index < ordered.length; index += 1) {
      const previous = ordered[index - 1];
      const current = ordered[index];
      if (current.time - previous.time < this.offsetGuardSeconds) {
        throw new EventFrontConflictError(previous, current, this.offsetGuardSeconds);
      }
    }

    this._events.push(...candidates);
    return candidates;
  }

  ordered() {
    return stableClone(this._events.slice().sort(compareTimedRecords), "eventFronts");
  }
}

function resolveWindowDuration(durations, index) {
  const value = Array.isArray(durations) ? durations[index] : durations;
  return positiveNumber(value, `window ${index + 1} duration`);
}

function createTimedWindowSchedule({
  idPrefix,
  startTime,
  cadence,
  count,
  durations,
  metadata = [],
} = {}) {
  const prefix = String(idPrefix || "").trim();
  if (!prefix) throw new TypeError("window idPrefix must not be empty");
  const start = nonNegativeNumber(startTime, "window startTime");
  const interval = positiveNumber(cadence, "window cadence");
  const total = integerAtLeast(count, "window count", 1);
  if (Array.isArray(durations) && durations.length !== total) {
    throw new RangeError(`window durations must contain exactly ${total} values`);
  }
  if (Array.isArray(metadata) && metadata.length !== 0 && metadata.length !== total) {
    throw new RangeError(`window metadata must contain exactly ${total} values`);
  }

  return Object.freeze(Array.from({ length: total }, (_, index) => {
    const windowId = `${prefix}:${index + 1}`;
    const openTime = start + interval * index;
    const duration = resolveWindowDuration(durations, index);
    const closeTime = openTime + duration;
    return stableClone({
      windowId,
      openId: `${windowId}:open`,
      closeId: `${windowId}:close`,
      openTime,
      closeTime,
      duration,
      metadata: Array.isArray(metadata) ? (metadata[index] || {}) : metadata,
    }, `window ${index + 1}`);
  }));
}

function createThresholdField({ thresholdSeconds, thresholdTime } = {}) {
  const rawThreshold = thresholdSeconds === undefined ? thresholdTime : thresholdSeconds;
  const threshold = nonNegativeNumber(rawThreshold, "thresholdSeconds");

  function sample(timeSeconds) {
    const time = finiteNumber(timeSeconds, "timeSeconds");
    const active = time >= threshold;
    const progress = threshold === 0
      ? (time >= 0 ? 1 : 0)
      : clamp01(time / threshold);
    return Object.freeze({ active, progress });
  }

  return Object.freeze({
    thresholdSeconds: threshold,
    sample,
    evaluate: sample,
    isActive(timeSeconds) { return sample(timeSeconds).active; },
    progressAt(timeSeconds) { return sample(timeSeconds).progress; },
  });
}

function clampedIntervalLerp(startValue, endValue, progress) {
  const start = finiteNumber(startValue, "startValue");
  const end = finiteNumber(endValue, "endValue");
  const amount = clamp01(progress);
  const value = start + (end - start) * amount;
  return Math.max(Math.min(start, end), Math.min(Math.max(start, end), value));
}

function createIntervalLerp({ startTime, endTime, startValue, endValue }) {
  const fromTime = finiteNumber(startTime, "startTime");
  const toTime = finiteNumber(endTime, "endTime");
  if (toTime < fromTime) throw new RangeError("endTime must not precede startTime");
  finiteNumber(startValue, "startValue");
  finiteNumber(endValue, "endValue");

  function sample(timeSeconds) {
    const time = finiteNumber(timeSeconds, "timeSeconds");
    const progress = toTime === fromTime
      ? (time < fromTime ? 0 : 1)
      : clamp01((time - fromTime) / (toTime - fromTime));
    return clampedIntervalLerp(startValue, endValue, progress);
  }

  return Object.freeze({
    startTime: fromTime,
    endTime: toTime,
    startValue: Number(startValue),
    endValue: Number(endValue),
    sample,
    valueAt: sample,
  });
}

function resolveBudgetSequence({ budget, count, rng, streamName, budgetJitter }) {
  let sequence;
  if (Array.isArray(budget)) {
    if (budget.length !== count) throw new RangeError(`budget sequence must contain exactly ${count} values`);
    sequence = budget.map((value, index) => finiteNumber(value, `budget[${index}]`));
  } else if (typeof budget === "number") {
    sequence = Array.from({ length: count }, () => finiteNumber(budget, "budget"));
  } else if (budget && typeof budget === "object") {
    const values = budget.values || budget.sequence;
    if (values !== undefined) {
      if (!Array.isArray(values) || values.length !== count) {
        throw new RangeError(`budget values must contain exactly ${count} entries`);
      }
      sequence = values.map((value, index) => finiteNumber(value, `budget[${index}]`));
    } else {
      const initial = budget.initial === undefined ? budget.start : budget.initial;
      const step = budget.step === undefined
        ? (budget.increment === undefined ? (budget.delta === undefined ? 0 : budget.delta) : budget.increment)
        : budget.step;
      const jitter = budget.jitter === undefined ? budgetJitter : budget.jitter;
      finiteNumber(initial, "budget.initial");
      finiteNumber(step, "budget.step");
      nonNegativeNumber(jitter || 0, "budget.jitter");
      for (let index = 0; index < count; index += 1) {
        const lowerBound = initial + step * index - jitter;
        if (lowerBound < 0) {
          throw new RangeError(
            `severity budget declaration crosses below zero at index ${index}: lower bound ${lowerBound}`
          );
        }
      }
      sequence = Array.from({ length: count }, (_, index) => {
        const randomOffset = jitter ? rng.range(`${streamName}:budget`, -jitter, jitter) : 0;
        return initial + step * index + randomOffset;
      });
    }
  } else {
    throw new TypeError("budget must be a number, sequence, or declaration object");
  }

  sequence.forEach((value, index) => {
    if (!Number.isFinite(value)) throw new TypeError(`generated budget[${index}] must be finite`);
    if (value < 0) throw new RangeError(`generated severity budget crosses below zero at index ${index}: ${value}`);
  });
  return sequence;
}

function createSeverityWaveSchedule({
  seed = 1,
  streamName = "conductor.severity-waves",
  id,
  waveIdPrefix,
  startTime = 0,
  cadence,
  count,
  waveCount,
  budget,
  budgetJitter = 0,
  tier = null,
  tierTable = {},
  metadata = {},
  timeJitterSeconds = 0,
  rngStreams,
} = {}) {
  const prefix = String(waveIdPrefix === undefined ? (id === undefined ? "severity-wave" : id) : waveIdPrefix).trim();
  if (!prefix) throw new TypeError("waveIdPrefix must not be empty");
  const start = nonNegativeNumber(startTime, "startTime");
  const interval = positiveNumber(cadence, "cadence");
  const total = integerAtLeast(count === undefined ? waveCount : count, "count");
  const timeJitter = nonNegativeNumber(timeJitterSeconds, "timeJitterSeconds");
  const jitter = nonNegativeNumber(budgetJitter, "budgetJitter");
  if (!String(streamName).trim()) throw new TypeError("streamName must not be empty");

  const rng = rngStreams || createRNGStreams(seed);
  const budgets = resolveBudgetSequence({ budget, count: total, rng, streamName, budgetJitter: jitter });
  const waves = Array.from({ length: total }, (_, index) => {
    const randomTimeOffset = timeJitter
      ? rng.range(`${streamName}:time`, 0, timeJitter)
      : 0;
    return stableClone({
      waveId: `${prefix}:${index + 1}`,
      waveIndex: index,
      announced: true,
      time: start + interval * index + randomTimeOffset,
      budget: budgets[index],
      tier,
      tierTable,
      metadata,
    }, `severity wave ${index + 1}`);
  });

  return Object.freeze(waves.sort(compareTimedRecords));
}

function resolveOrigin(options) {
  const source = options.origin || options.anchor || {};
  const x = options.originX === undefined
    ? (source.wx === undefined ? source.x : source.wx)
    : options.originX;
  const y = options.originY === undefined
    ? (source.wy === undefined ? source.y : source.wy)
    : options.originY;
  return {
    x: finiteNumber(x, "originX"),
    y: finiteNumber(y, "originY"),
  };
}

function selectToroidalSpawn({
  seed = 1,
  rngStreams,
  rng,
  streamName = "conductor.spawn-radius",
  origin,
  anchor,
  originX,
  originY,
  worldScale,
  minRadius,
  maxRadius,
  angle: requestedAngle,
  radius: requestedRadius,
} = {}) {
  const scale = positiveNumber(worldScale, "worldScale");
  const point = resolveOrigin({ origin, anchor, originX, originY });
  const minimum = nonNegativeNumber(minRadius, "minRadius");
  const maximum = nonNegativeNumber(maxRadius, "maxRadius");
  if (maximum < minimum) throw new RangeError("maxRadius must be at least minRadius");
  // A square torus has ambiguous shortest paths beyond half its side length.
  if (maximum > scale / 2) throw new RangeError("maxRadius must not exceed worldScale / 2 on a square torus");
  if (!String(streamName).trim()) throw new TypeError("streamName must not be empty");

  const streams = rngStreams || rng || createRNGStreams(seed);
  if (!streams || typeof streams.angle !== "function" || typeof streams.range !== "function") {
    throw new TypeError("rngStreams must expose named angle and range methods");
  }
  const angle = requestedAngle === undefined
    ? streams.angle(streamName)
    : finiteNumber(requestedAngle, "angle");
  const radius = requestedRadius === undefined
    ? streams.range(streamName, minimum, maximum)
    : finiteNumber(requestedRadius, "radius");
  if (radius < minimum || radius > maximum) throw new RangeError("radius must stay inside the declared radius band");
  const wx = wrapPosition(point.x + Math.cos(angle) * radius, scale);
  const wy = wrapPosition(point.y + Math.sin(angle) * radius, scale);
  return stableClone({
    wx,
    wy,
    radius,
    angle,
    distance: wrappedDistance(point.x, point.y, wx, wy, scale),
    streamName: String(streamName),
  }, "toroidal spawn");
}

class Conductor {
  constructor({ seed = 1, conductorId = "match-conductor", offsetGuardSeconds = 0, worldScale } = {}) {
    this.rngStreams = createRNGStreams(seed);
    this.seed = this.rngStreams.seed;
    this.id = String(conductorId || "").trim();
    if (!this.id) throw new TypeError("conductorId must not be empty");
    this.worldScale = worldScale === undefined ? undefined : positiveNumber(worldScale, "worldScale");
    this.events = new EventFrontRegistry({ offsetGuardSeconds });
    this._severityWaves = [];
    this._windows = [];
    this._collapseEpochs = [];
  }

  registerEventFront(front) {
    return this.events.register(front);
  }

  scheduleSeverityWaves(declaration) {
    const waves = createSeverityWaveSchedule({ ...declaration, seed: this.seed });
    this.events.registerMany(waves.map((wave) => ({
      id: wave.waveId,
      time: wave.time,
      kind: "severity-wave",
      metadata: { waveId: wave.waveId },
    })));
    this._severityWaves.push(...waves);
    return waves;
  }

  scheduleWindows(declaration) {
    const windows = createTimedWindowSchedule(declaration);
    this.events.registerMany(windows.flatMap((window) => [
      {
        id: window.openId,
        time: window.openTime,
        kind: "window.open",
        metadata: {
          conductorId: this.id,
          windowId: window.windowId,
          openId: window.openId,
          closeId: window.closeId,
          scheduledOpenTime: window.openTime,
          scheduledCloseTime: window.closeTime,
          portalMetadata: window.metadata,
        },
      },
      {
        id: window.closeId,
        time: window.closeTime,
        kind: "window.close",
        metadata: {
          conductorId: this.id,
          windowId: window.windowId,
          openId: window.openId,
          closeId: window.closeId,
          scheduledOpenTime: window.openTime,
          scheduledCloseTime: window.closeTime,
          portalMetadata: window.metadata,
        },
      },
    ]));
    this._windows.push(...windows);
    return windows;
  }

  scheduleCollapseEpochs(epochs) {
    if (!Array.isArray(epochs) || epochs.length === 0) throw new TypeError("collapse epochs must be a non-empty array");
    const ids = new Set();
    const normalized = epochs.map((epoch, index) => {
      const id = String(epoch.epochId || "").trim();
      if (!id) throw new TypeError(`collapse epoch ${index} requires an epochId`);
      if (ids.has(id)) throw new RangeError(`collapse epoch id already scheduled: ${id}`);
      ids.add(id);
      const time = nonNegativeNumber(epoch.scheduledTime, `collapse epoch ${id} scheduledTime`);
      const progress = finiteNumber(epoch.progress, `collapse epoch ${id} progress`);
      if (progress < 0 || progress > 1) throw new RangeError(`collapse epoch ${id} progress must be in [0, 1]`);
      return stableClone({
        epochId: id,
        epochIndex: integerAtLeast(epoch.epochIndex, `collapse epoch ${id} epochIndex`),
        progress,
        scheduledTime: time,
        parameterVector: epoch.parameterVector || {},
      }, `collapse epoch ${id}`);
    });
    for (let index = 1; index < normalized.length; index += 1) {
      if (normalized[index].scheduledTime < normalized[index - 1].scheduledTime) {
        throw new RangeError("collapse epochs must be ordered by scheduledTime");
      }
    }
    this._collapseEpochs = normalized;
    return this._collapseEpochs.slice();
  }

  selectToroidalSpawn(options = {}) {
    return selectToroidalSpawn({
      ...options,
      rngStreams: this.rngStreams,
      worldScale: options.worldScale === undefined ? this.worldScale : options.worldScale,
    });
  }

  orderedScheduleData() {
    return stableClone({
      conductorId: this.id,
      offsetGuardSeconds: this.events.offsetGuardSeconds,
      eventFronts: this.events.ordered(),
      severityWaves: this._severityWaves.slice().sort(compareTimedRecords),
      windows: this._windows.slice().sort((a, b) => a.openTime - b.openTime),
      collapseEpochs: this._collapseEpochs.slice(),
    }, "schedule");
  }

  getSchedule() {
    return this.orderedScheduleData();
  }
}

function createConductor(options) {
  return new Conductor(options);
}

module.exports = {
  Conductor,
  EventFrontConflictError,
  EventFrontRegistry,
  clampedIntervalLerp,
  clampedMonotoneLerp: clampedIntervalLerp,
  createConductor,
  createIntervalLerp,
  createSeverityWaveSchedule,
  createSeverityWaves: createSeverityWaveSchedule,
  createTimedWindowSchedule,
  createThresholdField,
  selectToroidalSpawn,
};
