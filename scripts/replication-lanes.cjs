const REPLICATION_LANES = Object.freeze({
  GLOBAL: "global",
  PLAYER_LOCAL: "playerLocal",
  NEIGHBORHOOD: "neighborhood",
  VFX: "vfx",
  DEBUG: "debug",
  CINEMATIC: "cinematic",
});

const ALL_REPLICATION_LANES = Object.freeze(Object.values(REPLICATION_LANES));
const LANE_SET = new Set(ALL_REPLICATION_LANES);

function formatLaneList() {
  return ALL_REPLICATION_LANES.join(", ");
}

function isReplicationLane(lane) {
  return LANE_SET.has(lane);
}

function normalizeReplicationLane(lane, fallback = REPLICATION_LANES.GLOBAL) {
  if (lane === undefined || lane === null || lane === "") return fallback;
  const normalized = String(lane).trim();
  if (LANE_SET.has(normalized)) return normalized;
  throw new Error(`Unknown replication lane '${lane}'. Expected one of: ${formatLaneList()}`);
}

function normalizeLaneFilter(filter) {
  if (
    filter === undefined ||
    filter === null ||
    filter === "" ||
    filter === "*" ||
    filter === "all"
  ) {
    return null;
  }

  const rawLanes = Array.isArray(filter)
    ? filter
    : String(filter).split(",");
  const lanes = [];
  for (const rawLane of rawLanes) {
    if (rawLane === undefined || rawLane === null) continue;
    const lane = String(rawLane).trim();
    if (!lane || lane === "*" || lane === "all") return null;
    const normalized = normalizeReplicationLane(lane);
    if (!lanes.includes(normalized)) lanes.push(normalized);
  }
  return lanes.length > 0 ? Object.freeze(lanes) : null;
}

function eventMatchesLane(event, filter) {
  const lanes = normalizeLaneFilter(filter);
  if (!lanes) return true;
  const eventLane = normalizeReplicationLane(event?.lane);
  return lanes.includes(eventLane);
}

module.exports = {
  REPLICATION_LANES,
  ALL_REPLICATION_LANES,
  isReplicationLane,
  normalizeReplicationLane,
  normalizeLaneFilter,
  eventMatchesLane,
};
