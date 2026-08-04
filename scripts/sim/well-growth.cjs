const { ANOMALY_EVENT_CONTRACTS } = require("../content/anomalies.cjs");
const { calculateWellReachMultiplier, wellBaseMass } = require("../../src/content/well-growth.js");

function finite(value, label) {
  const number = Number(value);
  if (!Number.isFinite(number)) throw new TypeError(`${label} must be finite`);
  return number;
}

function nonNegative(value, label) {
  const number = finite(value, label);
  if (number < 0) throw new RangeError(`${label} must not be negative`);
  return number;
}

function calculateWellGrowth({ well, massDelta, killRadiusForMass, growthReachPerMass }) {
  if (!well || typeof well !== "object") throw new TypeError("well is required");
  if (typeof killRadiusForMass !== "function") throw new TypeError("killRadiusForMass is required");
  const delta = nonNegative(massDelta, "massDelta");
  const before = {
    mass: nonNegative(well.mass, "well.mass"),
    killRadius: nonNegative(well.killRadius, "well.killRadius"),
    reachMultiplier: nonNegative(well.reachMultiplier ?? 1, "well.reachMultiplier"),
  };
  const afterMass = before.mass + delta;
  const after = {
    mass: afterMass,
    killRadius: nonNegative(killRadiusForMass({ ...well, mass: afterMass }), "afterKillRadius"),
    reachMultiplier: calculateWellReachMultiplier({
      mass: afterMass,
      baseMass: wellBaseMass(well),
      growthReachPerMass,
    }),
  };
  return { before, after };
}

function createWellGrowthEvent({
  well,
  source,
  reason,
  sourceEntityId = null,
  sourceEntityType = null,
  scheduledTime = null,
  eventTime,
  waveId,
  catalogId = well?.catalogId || "base-well",
  behaviorId = well?.behaviorId || "base-well",
  before,
  after,
} = {}) {
  const contract = ANOMALY_EVENT_CONTRACTS?.wellGrowth;
  if (!contract) throw new Error("well growth event contract is missing from the anomaly catalog");
  const wellId = String(well?.id || "").trim();
  if (!wellId) throw new TypeError("well.id is required");
  if (!source || !reason) throw new TypeError("well growth source and reason are required");
  const eventAt = nonNegative(eventTime, "eventTime");
  if (!waveId) throw new TypeError("well growth waveId is required");
  const beforeMass = nonNegative(before?.mass, "before.mass");
  const afterMass = nonNegative(after?.mass, "after.mass");
  if (afterMass < beforeMass) throw new RangeError("well growth after.mass must not precede before.mass");
  return {
    wellId,
    catalogId: String(catalogId),
    behaviorId: String(behaviorId),
    source: String(source),
    reason: String(reason),
    sourceEntityId: sourceEntityId == null ? null : String(sourceEntityId),
    sourceEntityType: sourceEntityType == null ? null : String(sourceEntityType),
    before: {
      mass: beforeMass,
      killRadius: nonNegative(before?.killRadius, "before.killRadius"),
      reachMultiplier: nonNegative(before?.reachMultiplier ?? 1, "before.reachMultiplier"),
    },
    after: {
      mass: afterMass,
      killRadius: nonNegative(after?.killRadius, "after.killRadius"),
      reachMultiplier: nonNegative(after?.reachMultiplier ?? 1, "after.reachMultiplier"),
    },
    scheduledTime: scheduledTime == null ? null : nonNegative(scheduledTime, "scheduledTime"),
    eventTime: eventAt,
    waveId: String(waveId),
    tellId: contract.tellId,
    mass: afterMass,
    killRadius: nonNegative(after?.killRadius, "after.killRadius"),
    wx: finite(well.wx, "well.wx"),
    wy: finite(well.wy, "well.wy"),
  };
}

module.exports = {
  calculateWellGrowth,
  createWellGrowthEvent,
};
