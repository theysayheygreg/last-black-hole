"use strict";

const VOLATILE_KEYS = new Set([
  "id",
  "instanceId",
  "runId",
  "sessionId",
  "timestamp",
  "startedAt",
  "updatedAt",
]);

function normalizeBenchTruth(value, key = "") {
  if (VOLATILE_KEYS.has(key)) return undefined;
  if (Array.isArray(value)) {
    return value.map((entry) => normalizeBenchTruth(entry)).filter((entry) => entry !== undefined);
  }
  if (value && typeof value === "object") {
    const output = {};
    for (const childKey of Object.keys(value).sort()) {
      const normalized = normalizeBenchTruth(value[childKey], childKey);
      if (normalized !== undefined) output[childKey] = normalized;
    }
    return output;
  }
  if (typeof value === "number" && Number.isFinite(value)) {
    return Number(value.toFixed(9));
  }
  return value;
}

module.exports = { normalizeBenchTruth };
