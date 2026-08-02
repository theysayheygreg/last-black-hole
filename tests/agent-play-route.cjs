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
const DEFAULT_WELL_MARGIN = 0.02;
const CAPTURE_SAMPLE_COUNT = 12;
const CLEARANCE_SAMPLE_COUNT = 16;

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

function routeHazards({ from, to, wells = [], worldScale, safetyMargin = DEFAULT_WELL_MARGIN }) {
  const dx = wrappedDelta(from.wx, to.wx, worldScale);
  const dy = wrappedDelta(from.wy, to.wy, worldScale);
  return wells
    .filter((well) => well?.alive !== false && !well?.consumedByInhibitor)
    .map((well) => {
      const clearance = finiteNonNegative(well.killRadius, 0) + safetyMargin;
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

function wellClearance(point, wells, worldScale) {
  return wells.reduce((best, well) => Math.min(
    best,
    wrappedDistance(point.wx, point.wy, well.wx, well.wy, worldScale)
      - finiteNonNegative(well.killRadius, 0),
  ), Infinity);
}

function chooseCaptureTarget({ player, portal, wells, worldScale, safetyMargin }) {
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
    const clearance = wellClearance(point, wells, worldScale);
    return { point, clearance, index };
  });
  const safe = candidates.filter(({ clearance }) => clearance >= safetyMargin - EPSILON);
  const ranked = (safe.length ? safe : candidates).sort((left, right) =>
    left.index - right.index || right.clearance - left.clearance,
  );
  return { target: ranked[0].point, captureRadius: radius };
}

function chooseClearanceWaypoint({ player, target, blocker, wells, worldScale, safetyMargin }) {
  const clearanceRadius = blocker.clearance + safetyMargin * 0.75;
  const baseAngle = Math.atan2(
    wrappedDelta(player.wy, blocker.well.wy, worldScale),
    wrappedDelta(player.wx, blocker.well.wx, worldScale),
  );
  const candidates = Array.from({ length: CLEARANCE_SAMPLE_COUNT }, (_, index) => {
    const point = pointOnRing(
      blocker.well,
      clearanceRadius,
      baseAngle + (index * Math.PI * 2) / CLEARANCE_SAMPLE_COUNT,
      worldScale,
      `${blocker.well.id}-clearance-${index}`,
    );
    const inbound = routeHazards({ from: player, to: point, wells, worldScale, safetyMargin });
    const outbound = routeHazards({ from: point, to: target, wells, worldScale, safetyMargin });
    const totalDistance = wrappedDistance(player.wx, player.wy, point.wx, point.wy, worldScale)
      + wrappedDistance(point.wx, point.wy, target.wx, target.wy, worldScale);
    return { point, inbound, outbound, totalDistance, index };
  });
  candidates.sort((left, right) =>
    left.inbound.length + left.outbound.length - right.inbound.length - right.outbound.length
    || left.totalDistance - right.totalDistance
    || left.index - right.index,
  );
  return candidates[0].point;
}

function planPortalApproach({ player, portal, wells = [], worldScale, safetyMargin = DEFAULT_WELL_MARGIN }) {
  const margin = finiteNonNegative(safetyMargin, DEFAULT_WELL_MARGIN);
  const capture = chooseCaptureTarget({ player, portal, wells, worldScale, safetyMargin: margin });
  const hazards = routeHazards({ from: player, to: capture.target, wells, worldScale, safetyMargin: margin });
  const blocker = hazards[0] || null;
  const waypoint = blocker
    ? chooseClearanceWaypoint({ player, target: capture.target, blocker, wells, worldScale, safetyMargin: margin })
    : null;
  return {
    target: capture.target,
    captureRadius: capture.captureRadius,
    safetyMargin: margin,
    blocker: blocker && {
      wellId: blocker.well.id,
      wellName: blocker.well.name || blocker.well.id,
      clearance: blocker.clearance,
      closestDistance: blocker.closest.distance,
    },
    waypoint,
  };
}

module.exports = {
  DEFAULT_WELL_MARGIN,
  portalCaptureRadius,
  planPortalApproach,
  routeHazards,
};
