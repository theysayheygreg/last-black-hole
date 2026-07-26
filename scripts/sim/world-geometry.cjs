/**
 * Authoritative geometry for the square toroidal gameplay world.
 *
 * These helpers use world units only. They deliberately know nothing about
 * screen axes, fluid UVs, cameras, or renderer conventions. Sweeps accept an
 * unwrapped displacement because wrapped endpoints cannot describe motion
 * that crossed a seam or traveled more than half the world in one tick.
 */

const EPSILON = 1e-12;

function finiteNumber(value, label) {
  const number = Number(value);
  if (!Number.isFinite(number)) throw new TypeError(`${label} must be finite`);
  return number;
}

function validWorldScale(worldScale) {
  const scale = finiteNumber(worldScale, "worldScale");
  if (scale <= 0) throw new RangeError("worldScale must be greater than zero");
  return scale;
}

function nonNegativeRadius(value, label) {
  const radius = finiteNumber(value, label);
  if (radius < 0) throw new RangeError(`${label} must not be negative`);
  return radius;
}

function wrapPosition(value, worldScale) {
  const scale = validWorldScale(worldScale);
  const coordinate = finiteNumber(value, "coordinate");
  return ((coordinate % scale) + scale) % scale;
}

/**
 * Return the shortest signed displacement from `from` to `to`.
 * Exact half-world ties keep the sign of the unwrapped direction.
 */
function wrappedDelta(from, to, worldScale) {
  const scale = validWorldScale(worldScale);
  let delta = finiteNumber(to, "to") - finiteNumber(from, "from");
  delta %= scale;
  const half = scale * 0.5;
  if (delta > half) delta -= scale;
  if (delta < -half) delta += scale;
  return delta;
}

function wrappedDistanceSquared(ax, ay, bx, by, worldScale) {
  const dx = wrappedDelta(ax, bx, worldScale);
  const dy = wrappedDelta(ay, by, worldScale);
  return dx * dx + dy * dy;
}

function wrappedDistance(ax, ay, bx, by, worldScale) {
  return Math.hypot(
    wrappedDelta(ax, bx, worldScale),
    wrappedDelta(ay, by, worldScale)
  );
}

function periodicImageRange(point, segmentMin, segmentMax, padding, worldScale) {
  return {
    min: Math.floor((segmentMin - padding - point) / worldScale) - 1,
    max: Math.ceil((segmentMax + padding - point) / worldScale) + 1,
  };
}

function forEachPeriodicPointNearSegment(pointX, pointY, startX, startY, deltaX, deltaY, padding, worldScale, visit) {
  const endX = startX + deltaX;
  const endY = startY + deltaY;
  const xRange = periodicImageRange(pointX, Math.min(startX, endX), Math.max(startX, endX), padding, worldScale);
  const yRange = periodicImageRange(pointY, Math.min(startY, endY), Math.max(startY, endY), padding, worldScale);

  for (let ix = xRange.min; ix <= xRange.max; ix += 1) {
    for (let iy = yRange.min; iy <= yRange.max; iy += 1) {
      visit(pointX + ix * worldScale, pointY + iy * worldScale);
    }
  }
}

/**
 * Find the closest approach from a toroidal point to an unwrapped segment.
 *
 * `deltaX` and `deltaY` are the segment's full displacement, not a wrapped
 * endpoint. Returned `closestX/Y` are wrapped world positions. `offsetX/Y`
 * point from the segment toward the selected periodic image of the point.
 */
function closestPointOnToroidalSegment({
  pointX,
  pointY,
  startX,
  startY,
  deltaX,
  deltaY,
  worldScale,
}) {
  const scale = validWorldScale(worldScale);
  const px = finiteNumber(pointX, "pointX");
  const py = finiteNumber(pointY, "pointY");
  const sx = finiteNumber(startX, "startX");
  const sy = finiteNumber(startY, "startY");
  const vx = finiteNumber(deltaX, "deltaX");
  const vy = finiteNumber(deltaY, "deltaY");
  const lengthSquared = vx * vx + vy * vy;
  let best = null;

  forEachPeriodicPointNearSegment(px, py, sx, sy, vx, vy, 0, scale, (imageX, imageY) => {
    const rawT = lengthSquared <= EPSILON
      ? 0
      : ((imageX - sx) * vx + (imageY - sy) * vy) / lengthSquared;
    const t = Math.max(0, Math.min(1, rawT));
    const closestUnwrappedX = sx + vx * t;
    const closestUnwrappedY = sy + vy * t;
    const offsetX = imageX - closestUnwrappedX;
    const offsetY = imageY - closestUnwrappedY;
    const distanceSquared = offsetX * offsetX + offsetY * offsetY;

    if (!best || distanceSquared < best.distanceSquared - EPSILON
      || (Math.abs(distanceSquared - best.distanceSquared) <= EPSILON && t < best.t)) {
      best = {
        t,
        distanceSquared,
        distance: Math.sqrt(distanceSquared),
        closestX: wrapPosition(closestUnwrappedX, scale),
        closestY: wrapPosition(closestUnwrappedY, scale),
        closestUnwrappedX,
        closestUnwrappedY,
        pointImageX: imageX,
        pointImageY: imageY,
        offsetX,
        offsetY,
      };
    }
  });

  return best;
}

function contactAgainstImage(startX, startY, deltaX, deltaY, combinedRadius, targetImageX, targetImageY) {
  const relX = startX - targetImageX;
  const relY = startY - targetImageY;
  const radiusSquared = combinedRadius * combinedRadius;
  const initialDistanceSquared = relX * relX + relY * relY;

  if (initialDistanceSquared <= radiusSquared + EPSILON) {
    return { t: 0, startedOverlapping: true, targetImageX, targetImageY };
  }

  const speedSquared = deltaX * deltaX + deltaY * deltaY;
  if (speedSquared <= EPSILON) return null;

  const b = 2 * (relX * deltaX + relY * deltaY);
  const c = initialDistanceSquared - radiusSquared;
  const discriminant = b * b - 4 * speedSquared * c;
  if (discriminant < -EPSILON) return null;

  const root = Math.sqrt(Math.max(0, discriminant));
  const t = (-b - root) / (2 * speedSquared);
  if (t < -EPSILON || t > 1 + EPSILON) return null;
  return {
    t: Math.max(0, Math.min(1, t)),
    startedOverlapping: false,
    targetImageX,
    targetImageY,
  };
}

/**
 * Sweep a moving circle against a stationary circle in a toroidal world.
 *
 * The result's `t` is normalized over the supplied displacement. The contact
 * position is the moving circle's center at impact, wrapped into the world.
 * The normal points from the target center toward the moving circle.
 */
function sweptMovingCircleVsCircle({
  startX,
  startY,
  deltaX,
  deltaY,
  movingRadius,
  targetX,
  targetY,
  targetRadius,
  worldScale,
}) {
  const scale = validWorldScale(worldScale);
  const sx = finiteNumber(startX, "startX");
  const sy = finiteNumber(startY, "startY");
  const vx = finiteNumber(deltaX, "deltaX");
  const vy = finiteNumber(deltaY, "deltaY");
  const tx = finiteNumber(targetX, "targetX");
  const ty = finiteNumber(targetY, "targetY");
  const moverRadius = nonNegativeRadius(movingRadius, "movingRadius");
  const obstacleRadius = nonNegativeRadius(targetRadius, "targetRadius");
  const combinedRadius = moverRadius + obstacleRadius;
  let best = null;

  forEachPeriodicPointNearSegment(tx, ty, sx, sy, vx, vy, combinedRadius, scale, (imageX, imageY) => {
    const hit = contactAgainstImage(sx, sy, vx, vy, combinedRadius, imageX, imageY);
    if (!hit) return;
    if (!best || hit.t < best.t - EPSILON
      || (Math.abs(hit.t - best.t) <= EPSILON
        && (imageX < best.targetImageX || (imageX === best.targetImageX && imageY < best.targetImageY)))) {
      best = hit;
    }
  });

  if (!best) return { hit: false };

  const contactUnwrappedX = sx + vx * best.t;
  const contactUnwrappedY = sy + vy * best.t;
  const normalOffsetX = contactUnwrappedX - best.targetImageX;
  const normalOffsetY = contactUnwrappedY - best.targetImageY;
  const normalLength = Math.hypot(normalOffsetX, normalOffsetY);

  return {
    hit: true,
    t: best.t,
    startedOverlapping: best.startedOverlapping,
    contactX: wrapPosition(contactUnwrappedX, scale),
    contactY: wrapPosition(contactUnwrappedY, scale),
    contactUnwrappedX,
    contactUnwrappedY,
    targetImageX: best.targetImageX,
    targetImageY: best.targetImageY,
    normalX: normalLength > EPSILON ? normalOffsetX / normalLength : 0,
    normalY: normalLength > EPSILON ? normalOffsetY / normalLength : 0,
  };
}

module.exports = {
  closestPointOnToroidalSegment,
  sweptMovingCircleVsCircle,
  wrapPosition,
  wrappedDelta,
  wrappedDistance,
  wrappedDistanceSquared,
};
