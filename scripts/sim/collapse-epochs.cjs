const { ANOMALY_COLLAPSE_EPOCH_CONTRACT } = require("../content/anomalies.cjs");

const EPSILON = 1e-9;

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

function stableNumber(value) {
  return Number(finiteNumber(value, "value").toFixed(9));
}

function cloneVector(vector, parameterNames) {
  const result = {};
  for (const name of parameterNames) result[name] = stableNumber(vector[name]);
  return Object.freeze(result);
}

function validateCollapseEpochContract(contract = ANOMALY_COLLAPSE_EPOCH_CONTRACT) {
  const errors = [];
  if (!contract || typeof contract !== "object") return { ok: false, errors: ["collapse epoch contract must be an object"] };
  if (contract.schemaVersion !== 1) errors.push("collapse epoch schemaVersion must be 1");
  if (contract.status !== "provisional") errors.push("collapse epoch status must remain provisional");
  if (contract.boundaryMode !== "match-progress") errors.push("collapse epoch boundaryMode must be match-progress");
  const vectors = contract.parameterVectors;
  const names = vectors && typeof vectors === "object" ? Object.keys(vectors).sort() : [];
  if (names.length === 0) errors.push("collapse epoch parameterVectors must not be empty");
  for (const name of names) {
    const declaration = vectors[name];
    if (!declaration || typeof declaration !== "object") {
      errors.push(`collapse epoch parameter ${name} must be an object`);
      continue;
    }
    if (!Array.isArray(declaration.range) || declaration.range.length !== 2
      || !declaration.range.every(Number.isFinite) || declaration.range[1] < declaration.range[0]) {
      errors.push(`collapse epoch parameter ${name} range must be two ordered finite numbers`);
    }
    if (!Number.isFinite(declaration.step) || declaration.step <= 0) errors.push(`collapse epoch parameter ${name} step must be positive`);
    if (typeof declaration.unit !== "string" || !declaration.unit) errors.push(`collapse epoch parameter ${name} unit is required`);
    if (typeof declaration.startBias !== "string" || !declaration.startBias) errors.push(`collapse epoch parameter ${name} startBias is required`);
    if (typeof declaration.source !== "string" || !declaration.source) errors.push(`collapse epoch parameter ${name} source is required`);
  }

  const boundaries = Array.isArray(contract.boundaries) ? contract.boundaries : [];
  if (boundaries.length < 2) errors.push("collapse epoch boundaries must contain at least two entries");
  let previousProgress = -EPSILON;
  const ids = new Set();
  boundaries.forEach((boundary, index) => {
    const prefix = `collapse epoch boundary ${index}`;
    if (!boundary || typeof boundary !== "object") {
      errors.push(`${prefix} must be an object`);
      return;
    }
    if (typeof boundary.id !== "string" || !boundary.id) errors.push(`${prefix} id is required`);
    if (ids.has(boundary.id)) errors.push(`${prefix} id must be unique`);
    ids.add(boundary.id);
    if (!Number.isFinite(boundary.progress) || boundary.progress < 0 || boundary.progress > 1) {
      errors.push(`${prefix} progress must be in [0, 1]`);
    }
    if (boundary.progress + EPSILON < previousProgress) errors.push(`${prefix} progress must be ordered`);
    previousProgress = Number(boundary.progress);
    const vector = boundary.parameterVector;
    if (!vector || typeof vector !== "object") {
      errors.push(`${prefix} parameterVector is required`);
      return;
    }
    for (const name of names) {
      if (!Number.isFinite(vector[name])) {
        errors.push(`${prefix} parameterVector.${name} must be finite`);
      } else if (vector[name] < vectors[name].range[0] - EPSILON || vector[name] > vectors[name].range[1] + EPSILON) {
        errors.push(`${prefix} parameterVector.${name} is outside its declared range`);
      }
    }
    for (const name of Object.keys(vector)) if (!names.includes(name)) errors.push(`${prefix} declares unknown parameter ${name}`);
  });
  if (boundaries[0]?.progress !== 0) errors.push("collapse epoch boundaries must start at progress 0");
  return { ok: errors.length === 0, errors };
}

function assertValidCollapseEpochContract(contract = ANOMALY_COLLAPSE_EPOCH_CONTRACT) {
  const result = validateCollapseEpochContract(contract);
  if (!result.ok) throw new Error(`Invalid collapse epoch contract: ${result.errors.join("; ")}`);
  return true;
}

function createCollapseEpochSchedule({ matchDurationSeconds, contract = ANOMALY_COLLAPSE_EPOCH_CONTRACT } = {}) {
  assertValidCollapseEpochContract(contract);
  const duration = nonNegativeNumber(matchDurationSeconds, "matchDurationSeconds");
  const names = Object.keys(contract.parameterVectors).sort();
  return Object.freeze(contract.boundaries.map((boundary, epochIndex) => Object.freeze({
    epochId: boundary.id,
    epochIndex,
    progress: stableNumber(boundary.progress),
    scheduledTime: stableNumber(duration * boundary.progress),
    parameterVector: cloneVector(boundary.parameterVector, names),
  })));
}

function createCollapseEpochState(schedule) {
  if (!Array.isArray(schedule) || schedule.length === 0) throw new TypeError("collapse epoch schedule must not be empty");
  const first = schedule[0];
  return {
    epochId: first.epochId,
    epochIndex: first.epochIndex,
    scheduledTime: first.scheduledTime,
    parameterVector: { ...first.parameterVector },
    nextIndex: 1,
    transitionCount: 0,
  };
}

function advanceCollapseEpochs(state, schedule, eventTime) {
  if (!state || !Array.isArray(schedule) || schedule.length === 0) throw new TypeError("collapse epoch state and schedule are required");
  const now = nonNegativeNumber(eventTime, "eventTime");
  let nextIndex = Math.max(1, Math.floor(Number(state.nextIndex) || 1));
  let current = {
    epochId: state.epochId,
    epochIndex: state.epochIndex,
    scheduledTime: state.scheduledTime,
    parameterVector: { ...state.parameterVector },
    nextIndex,
    transitionCount: Math.max(0, Math.floor(Number(state.transitionCount) || 0)),
  };
  const transitions = [];
  while (nextIndex < schedule.length && now + EPSILON >= schedule[nextIndex].scheduledTime) {
    const target = schedule[nextIndex];
    const transition = {
      previousEpochId: current.epochId,
      previousEpochIndex: current.epochIndex,
      epochId: target.epochId,
      epochIndex: target.epochIndex,
      progress: target.progress,
      scheduledTime: target.scheduledTime,
      eventTime: stableNumber(now),
      parameterVector: { ...target.parameterVector },
    };
    transitions.push(Object.freeze(transition));
    current = {
      epochId: target.epochId,
      epochIndex: target.epochIndex,
      scheduledTime: target.scheduledTime,
      parameterVector: { ...target.parameterVector },
      nextIndex: nextIndex + 1,
      transitionCount: current.transitionCount + 1,
    };
    nextIndex += 1;
  }
  return { state: current, transitions };
}

module.exports = {
  ANOMALY_COLLAPSE_EPOCH_CONTRACT,
  assertValidCollapseEpochContract,
  createCollapseEpochSchedule,
  createCollapseEpochState,
  advanceCollapseEpochs,
  validateCollapseEpochContract,
};
