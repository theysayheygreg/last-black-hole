const { MOVEMENT } = require('../content/movement.cjs');
const {
  closestPointOnToroidalSegment,
  wrapPosition,
  wrappedDelta,
  wrappedDistance,
} = require('./world-geometry.cjs');

const EPSILON = 1e-9;
const WAYPOINT_SAMPLE_COUNT = 32;
const APPROACH = MOVEMENT.affordances;

function finiteNonNegative(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? number : fallback;
}

function driftMargin(player) {
  return Math.min(
    finiteNonNegative(APPROACH.approachHazardMaxDriftWorld),
    Math.hypot(Number(player?.vx) || 0, Number(player?.vy) || 0)
      * finiteNonNegative(APPROACH.approachHazardLookaheadSeconds),
  );
}

function wellClearanceRadius(well, player) {
  return finiteNonNegative(well?.killRadius)
    + finiteNonNegative(APPROACH.approachHazardMarginWorld)
    + driftMargin(player);
}

function liveWells(wells) {
  return (wells || []).filter((well) => well?.alive !== false && !well?.consumedByInhibitor);
}

function routeHazards({ from, to, wells, player, worldScale }) {
  const deltaX = wrappedDelta(from.wx, to.wx, worldScale);
  const deltaY = wrappedDelta(from.wy, to.wy, worldScale);
  return liveWells(wells)
    .map((well) => {
      const clearance = wellClearanceRadius(well, player);
      const closest = closestPointOnToroidalSegment({
        pointX: well.wx,
        pointY: well.wy,
        startX: from.wx,
        startY: from.wy,
        deltaX,
        deltaY,
        worldScale,
      });
      return { well, clearance, closest };
    })
    .filter(({ clearance, closest }) => closest.distance < clearance - EPSILON)
    .sort((left, right) => left.closest.t - right.closest.t
      || left.closest.distance - right.closest.distance
      || String(left.well.id).localeCompare(String(right.well.id)));
}

function pointOnRing(well, radius, angle, worldScale, id) {
  return {
    id,
    wx: wrapPosition(well.wx + Math.cos(angle) * radius, worldScale),
    wy: wrapPosition(well.wy + Math.sin(angle) * radius, worldScale),
  };
}

function pointClearance(point, wells, player, worldScale) {
  return liveWells(wells).reduce((best, well) => Math.min(
    best,
    wrappedDistance(point.wx, point.wy, well.wx, well.wy, worldScale)
      - wellClearanceRadius(well, player),
  ), Infinity);
}

function chooseClearanceWaypoint({ player, target, blocker, wells, worldScale }) {
  const margin = finiteNonNegative(APPROACH.approachHazardMarginWorld);
  const reserve = driftMargin(player);
  const waypointRadius = blocker.clearance + Math.max(margin * 1.5, reserve * 1.5);
  const baseAngle = Math.atan2(
    wrappedDelta(blocker.well.wy, player.wy, worldScale),
    wrappedDelta(blocker.well.wx, player.wx, worldScale),
  );
  const candidates = Array.from({ length: WAYPOINT_SAMPLE_COUNT }, (_, index) => {
    const point = pointOnRing(
      blocker.well,
      waypointRadius,
      baseAngle + (index * Math.PI * 2) / WAYPOINT_SAMPLE_COUNT,
      worldScale,
      `${blocker.well.id}-approach-${index}`,
    );
    const inbound = routeHazards({ from: player, to: point, wells, player, worldScale });
    const outbound = routeHazards({ from: point, to: target, wells, player, worldScale });
    return {
      point,
      blockers: inbound.length + outbound.length,
      clearance: pointClearance(point, wells, player, worldScale),
      distance: wrappedDistance(player.wx, player.wy, point.wx, point.wy, worldScale)
        + wrappedDistance(point.wx, point.wy, target.wx, target.wy, worldScale),
      index,
    };
  });
  candidates.sort((left, right) => left.blockers - right.blockers
    || right.clearance - left.clearance
    || left.distance - right.distance
    || left.index - right.index);
  return candidates[0]?.point || null;
}

function nearestHazard({ player, wells, worldScale }) {
  return liveWells(wells)
    .map((well) => {
      const awayX = wrappedDelta(well.wx, player.wx, worldScale);
      const awayY = wrappedDelta(well.wy, player.wy, worldScale);
      return {
        id: well.id,
        distance: Math.hypot(awayX, awayY),
        clearance: wellClearanceRadius(well, player),
        awayX,
        awayY,
      };
    })
    .sort((left, right) => left.distance - left.clearance - (right.distance - right.clearance)
      || String(left.id).localeCompare(String(right.id)))[0] || null;
}

function resolveApproachRoute({ player, target, wells, worldScale }) {
  const blocker = routeHazards({ from: player, to: target, wells, player, worldScale })[0] || null;
  const waypoint = blocker
    ? chooseClearanceWaypoint({ player, target, blocker, wells, worldScale })
    : null;
  return {
    hazard: nearestHazard({ player, wells, worldScale }),
    hazardDriftMargin: driftMargin(player),
    steering: waypoint ? {
      x: wrappedDelta(player.wx, waypoint.wx, worldScale),
      y: wrappedDelta(player.wy, waypoint.wy, worldScale),
      waypointId: waypoint.id,
    } : null,
  };
}

function resolveAuthorityApproachTarget({
  player,
  targetId,
  wrecks = [],
  portals = [],
  wells = [],
  worldScale,
  worldDistance,
  pickupRadiusForPlayer,
  portalCaptureRadius,
  isPortalAvailable,
} = {}) {
  const id = String(targetId || '').trim();
  if (!id) return null;
  const distanceTo = (target) => worldDistance(
    player.wx,
    player.wy,
    target.wx,
    target.wy,
    worldScale,
  );
  const wreck = wrecks.find((entry) => entry.id === id
    && entry.alive !== false && !entry.looted);
  if (wreck) {
    const route = resolveApproachRoute({ player, target: wreck, wells, worldScale });
    return {
      explicit: true,
      id: wreck.id,
      kind: 'salvage',
      distance: distanceTo(wreck),
      radius: pickupRadiusForPlayer(player),
      ...route,
    };
  }
  const portal = portals.find((entry) => entry.id === id && isPortalAvailable(entry));
  if (portal) {
    const route = resolveApproachRoute({ player, target: portal, wells, worldScale });
    return {
      explicit: true,
      id: portal.id,
      kind: 'portal',
      distance: distanceTo(portal),
      radius: portalCaptureRadius(portal),
      ...route,
    };
  }
  return null;
}

module.exports = {
  resolveApproachRoute,
  resolveAuthorityApproachTarget,
  routeHazards,
  wellClearanceRadius,
};
