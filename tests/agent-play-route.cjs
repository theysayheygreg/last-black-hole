/**
 * Pure route planning for the AgentPlay controller.
 *
 * This is deliberately test-only: it reads the public authoritative snapshot
 * and turns a portal's public capture contract into conservative controller
 * targets. It does not participate in simulation, placement, or movement.
 */
const {
  closestPointOnToroidalSegment,
  wrapPosition,
  wrappedDelta,
  wrappedDistance,
} = require("../scripts/sim/world-geometry.cjs");

const EPSILON = 1e-9;
const PORTAL_CAPTURE_RADIUS = 0.08;
const PORTAL_CAPTURE_FRACTION = 0.6;
const DEFAULT_WELL_MARGIN = 0.035;
const DRIFT_LOOKAHEAD_SECONDS = 0.45;
const MAX_DRIFT_MARGIN = 0.12;
const CAPTURE_SAMPLE_COUNT = 12;
const CLEARANCE_SAMPLE_COUNT = 48;

function portalCaptureRadius(portal) {
  const base = PORTAL_CAPTURE_RADIUS;
  if (portal?.type === "unstable") return base * 0.5;
  if (portal?.type === "rift") return base * 1.8;
  return base;
}

function finiteNonNegative(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? number : fallback;
}

function speedOf(velocity) {
  return Math.hypot(Number(velocity?.vx) || 0, Number(velocity?.vy) || 0);
}

function dynamicMargin({ velocity, driftLookahead = DRIFT_LOOKAHEAD_SECONDS }) {
  return Math.min(
    MAX_DRIFT_MARGIN,
    speedOf(velocity) * finiteNonNegative(driftLookahead, DRIFT_LOOKAHEAD_SECONDS),
  );
}

function clearanceRadius(well, safetyMargin, velocity, driftLookahead) {
  return finiteNonNegative(well.killRadius, 0)
    + finiteNonNegative(safetyMargin, DEFAULT_WELL_MARGIN)
    + dynamicMargin({ velocity, driftLookahead });
}

function resolveHazardClearance({ distance, clearance, stoppingDistance, driftMargin, inwardSpeed }) {
  const dynamicClearance = finiteNonNegative(clearance, 0) + finiteNonNegative(stoppingDistance, 0);
  const brakeDistance = dynamicClearance + Math.max(0.035, finiteNonNegative(driftMargin, 0));
  return {
    dynamicClearance,
    brakeDistance,
    active: Number(distance) <= brakeDistance && Number(inwardSpeed) > -0.01,
  };
}

function resolveAgentPlayControlPriority({ hazardActive, recharging, overheated, shouldBrake }) {
  if (hazardActive) return { mode: "hazard-clearance", coast: false, brake: true };
  if (overheated) return { mode: "overheat-coast", coast: true, brake: false };
  if (recharging) return { mode: "recharge", coast: true, brake: false };
  if (shouldBrake) return { mode: "brake-for-proximity", coast: false, brake: true };
  return { mode: "approach", coast: false, brake: false };
}

function routeHazards({
  from,
  to,
  wells = [],
  worldScale,
  safetyMargin = DEFAULT_WELL_MARGIN,
  velocity = null,
  driftLookahead = DRIFT_LOOKAHEAD_SECONDS,
}) {
  const dx = wrappedDelta(from.wx, to.wx, worldScale);
  const dy = wrappedDelta(from.wy, to.wy, worldScale);
  return wells
    .filter((well) => well?.alive !== false && !well?.consumedByInhibitor)
    .map((well) => {
      const clearance = clearanceRadius(well, safetyMargin, velocity, driftLookahead);
      const closest = closestPointOnToroidalSegment({
        pointX: well.wx,
        pointY: well.wy,
        startX: from.wx,
        startY: from.wy,
        deltaX: dx,
        deltaY: dy,
        worldScale,
      });
      return { well, clearance, closest };
    })
    .filter(({ clearance, closest }) => closest.distance < clearance - EPSILON)
    .sort((left, right) =>
      left.closest.t - right.closest.t
      || left.closest.distance - right.closest.distance
      || String(left.well.id).localeCompare(String(right.well.id)),
    );
}

function pointOnRing(center, radius, angle, worldScale, id) {
  return {
    id,
    wx: wrapPosition(center.wx + Math.cos(angle) * radius, worldScale),
    wy: wrapPosition(center.wy + Math.sin(angle) * radius, worldScale),
  };
}

function wellClearance(point, wells, worldScale, safetyMargin, velocity, driftLookahead) {
  return wells.reduce((best, well) => Math.min(
    best,
    wrappedDistance(point.wx, point.wy, well.wx, well.wy, worldScale)
      - clearanceRadius(well, safetyMargin, velocity, driftLookahead),
  ), Infinity);
}

function chooseCaptureTarget({ player, portal, wells, worldScale, safetyMargin, velocity, driftLookahead }) {
  const radius = portalCaptureRadius(portal);
  const ringRadius = radius * PORTAL_CAPTURE_FRACTION;
  const awayX = wrappedDelta(portal.wx, player.wx, worldScale);
  const awayY = wrappedDelta(portal.wy, player.wy, worldScale);
  const baseAngle = Math.atan2(awayY, awayX);
  const candidates = Array.from({ length: CAPTURE_SAMPLE_COUNT }, (_, index) => {
    const point = pointOnRing(
      portal,
      ringRadius,
      baseAngle + (index * Math.PI * 2) / CAPTURE_SAMPLE_COUNT,
      worldScale,
      `${portal.id}-capture-band-${index}`,
    );
    const clearance = wellClearance(point, wells, worldScale, safetyMargin, velocity, driftLookahead);
    const hazards = routeHazards({
      from: player,
      to: point,
      wells,
      worldScale,
      safetyMargin,
      velocity,
      driftLookahead,
    });
    const distance = wrappedDistance(player.wx, player.wy, point.wx, point.wy, worldScale);
    return { point, clearance, hazards, distance, index };
  });
  const safe = candidates.filter(({ clearance, hazards }) => clearance >= -EPSILON && hazards.length === 0);
  const ranked = (safe.length ? safe : candidates).sort((left, right) =>
    left.hazards.length - right.hazards.length
      || right.clearance - left.clearance
      || left.distance - right.distance
      || left.index - right.index,
  );
  return { target: ranked[0].point, captureRadius: radius };
}

function chooseClearanceWaypoint({ player, target, blocker, wells, worldScale, safetyMargin, velocity, driftLookahead }) {
  // A point barely outside the no-go ring can still require a chord straight
  // through the well, especially across a wrap seam. Leave room for a real
  // tangent turn, scaled by the same public velocity horizon used for risk.
  const waypointRadius = blocker.clearance + Math.max(
    safetyMargin * 1.5,
    dynamicMargin({ velocity, driftLookahead }) * 1.5,
  );
  const baseAngle = Math.atan2(
    wrappedDelta(player.wy, blocker.well.wy, worldScale),
    wrappedDelta(player.wx, blocker.well.wx, worldScale),
  );
  const candidates = Array.from({ length: CLEARANCE_SAMPLE_COUNT }, (_, index) => {
    const point = pointOnRing(
      blocker.well,
      waypointRadius,
      baseAngle + (index * Math.PI * 2) / CLEARANCE_SAMPLE_COUNT,
      worldScale,
      `${blocker.well.id}-clearance-${index}`,
    );
    const inbound = routeHazards({ from: player, to: point, wells, worldScale, safetyMargin, velocity, driftLookahead });
    const outbound = routeHazards({ from: point, to: target, wells, worldScale, safetyMargin, velocity, driftLookahead });
    const totalDistance = wrappedDistance(player.wx, player.wy, point.wx, point.wy, worldScale)
      + wrappedDistance(point.wx, point.wy, target.wx, target.wy, worldScale);
    const clearance = wellClearance(point, wells, worldScale, safetyMargin, velocity, driftLookahead);
    return { point, inbound, outbound, totalDistance, clearance, index };
  });
  candidates.sort((left, right) =>
    left.inbound.length + left.outbound.length - right.inbound.length - right.outbound.length
    || right.clearance - left.clearance
    || left.totalDistance - right.totalDistance
    || left.index - right.index,
  );
  return candidates[0].point;
}

function nearestHazard({ player, wells, worldScale, safetyMargin, velocity, driftLookahead }) {
  return wells
    .filter((well) => well?.alive !== false && !well?.consumedByInhibitor)
    .map((well) => {
      const dx = wrappedDelta(well.wx, player.wx, worldScale);
      const dy = wrappedDelta(well.wy, player.wy, worldScale);
      return {
        wellId: well.id,
        wellName: well.name || well.id,
        wx: well.wx,
        wy: well.wy,
        distance: Math.hypot(dx, dy),
        clearance: clearanceRadius(well, safetyMargin, velocity, driftLookahead),
        awayX: dx,
        awayY: dy,
      };
    })
    .sort((left, right) =>
      left.distance - left.clearance - (right.distance - right.clearance)
      || String(left.wellId).localeCompare(String(right.wellId)),
    )[0] || null;
}

function planPortalApproach({
  player,
  portal,
  wells = [],
  worldScale,
  safetyMargin = DEFAULT_WELL_MARGIN,
  velocity = null,
  driftLookahead = DRIFT_LOOKAHEAD_SECONDS,
}) {
  const margin = finiteNonNegative(safetyMargin, DEFAULT_WELL_MARGIN);
  const capture = chooseCaptureTarget({ player, portal, wells, worldScale, safetyMargin: margin, velocity, driftLookahead });
  const hazards = routeHazards({ from: player, to: capture.target, wells, worldScale, safetyMargin: margin, velocity, driftLookahead });
  const blocker = hazards[0] || null;
  const waypoint = blocker
    ? chooseClearanceWaypoint({ player, target: capture.target, blocker, wells, worldScale, safetyMargin: margin, velocity, driftLookahead })
    : null;
  return {
    target: capture.target,
    captureRadius: capture.captureRadius,
    safetyMargin: margin,
    driftMargin: dynamicMargin({ velocity, driftLookahead }),
    nearestHazard: nearestHazard({ player, wells, worldScale, safetyMargin: margin, velocity, driftLookahead }),
    blocker: blocker && {
      wellId: blocker.well.id,
      wellName: blocker.well.name || blocker.well.id,
      clearance: blocker.clearance,
      closestDistance: blocker.closest.distance,
    },
    waypoint,
  };
}

// Wrecks and other ordinary route targets use the same published well-clearance
// geometry as portal approach. This stays in the AgentPlay planner: it reads
// snapshots only and never changes world placement, growth, or movement truth.
function planRouteApproach({
  player,
  target,
  wells = [],
  worldScale,
  safetyMargin = DEFAULT_WELL_MARGIN,
  velocity = null,
  driftLookahead = DRIFT_LOOKAHEAD_SECONDS,
}) {
  const margin = finiteNonNegative(safetyMargin, DEFAULT_WELL_MARGIN);
  const hazards = routeHazards({
    from: player,
    to: target,
    wells,
    worldScale,
    safetyMargin: margin,
    velocity,
    driftLookahead,
  });
  const blocker = hazards[0] || null;
  const waypoint = blocker
    ? chooseClearanceWaypoint({
      player,
      target,
      blocker,
      wells,
      worldScale,
      safetyMargin: margin,
      velocity,
      driftLookahead,
    })
    : null;
  return {
    target,
    safetyMargin: margin,
    driftMargin: dynamicMargin({ velocity, driftLookahead }),
    nearestHazard: nearestHazard({ player, wells, worldScale, safetyMargin: margin, velocity, driftLookahead }),
    blocker: blocker && {
      wellId: blocker.well.id,
      wellName: blocker.well.name || blocker.well.id,
      clearance: blocker.clearance,
      closestDistance: blocker.closest.distance,
    },
    waypoint,
  };
}

function resolveLiveWreckTarget(wreckId, wrecks = []) {
  const id = String(wreckId || "");
  if (!id) return null;
  const wreck = wrecks.find((entry) => String(entry?.id || "") === id) || null;
  if (!wreck || wreck.alive === false || wreck.looted || !wreck.loot?.length) return null;
  return wreck;
}

module.exports = {
  DEFAULT_WELL_MARGIN,
  DRIFT_LOOKAHEAD_SECONDS,
  clearanceRadius,
  resolveAgentPlayControlPriority,
  resolveHazardClearance,
  portalCaptureRadius,
  planPortalApproach,
  planRouteApproach,
  resolveLiveWreckTarget,
  routeHazards,
};
