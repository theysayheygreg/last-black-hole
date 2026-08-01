const GRAPPLE_ARC = require('../../src/content/grapple-arc.data.json');

function finite(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function normalized(value, fallback = { x: 1, y: 0 }) {
  const x = finite(value?.x, fallback.x);
  const y = finite(value?.y, fallback.y);
  const magnitude = Math.hypot(x, y);
  if (magnitude <= 1e-9) return { ...fallback };
  return { x: x / magnitude, y: y / magnitude };
}

function signedAngle(from, to) {
  const a = normalized(from);
  const b = normalized(to);
  return Math.atan2(a.x * b.y - a.y * b.x, a.x * b.x + a.y * b.y);
}

function rotate(value, radians) {
  const cosine = Math.cos(radians);
  const sine = Math.sin(radians);
  return {
    x: value.x * cosine - value.y * sine,
    y: value.x * sine + value.y * cosine,
  };
}

function anchorPhysicalRadius(anchor) {
  const family = GRAPPLE_ARC.anchorFamilies[anchor?.type] || GRAPPLE_ARC.anchorFamilies.planetoid;
  if (anchor?.type === 'well') {
    return Math.max(family.minimumPhysicalRadius, finite(anchor.killRadius, family.minimumPhysicalRadius));
  }
  if (anchor?.type === 'star') {
    const sizeMultiplier = GRAPPLE_ARC.starSizeMultipliers[anchor.starType] || 1;
    return Math.max(
      family.minimumPhysicalRadius,
      family.minimumPhysicalRadius * sizeMultiplier * Math.sqrt(Math.max(0.25, finite(anchor.mass, 1))),
    );
  }
  return Math.max(family.minimumPhysicalRadius, finite(anchor.radius, family.minimumPhysicalRadius));
}

function grappleGeometry(anchor) {
  const family = GRAPPLE_ARC.anchorFamilies[anchor?.type] || GRAPPLE_ARC.anchorFamilies.planetoid;
  const physicalRadius = anchorPhysicalRadius(anchor);
  const swingRadius = family.swingClearance + physicalRadius * family.swingRadiusScale;
  return Object.freeze({
    physicalRadius,
    swingRadius,
    hookRadius: swingRadius * GRAPPLE_ARC.hookReachMultiplier,
    boost: family.baseBoost + physicalRadius * family.sizeBoostScale,
  });
}

// The ship is at the local origin; anchorDX/DY is the shortest toroidal
// displacement from ship to anchor. The segment is the next authority step.
function sweptHookContact({ anchorDX, anchorDY, stepX = 0, stepY = 0, hookRadius }) {
  const lengthSquared = stepX * stepX + stepY * stepY;
  const t = lengthSquared > 1e-12
    ? Math.max(0, Math.min(1, (anchorDX * stepX + anchorDY * stepY) / lengthSquared))
    : 0;
  const closestX = stepX * t;
  const closestY = stepY * t;
  const distance = Math.hypot(anchorDX - closestX, anchorDY - closestY);
  return Object.freeze({ hit: distance <= Math.max(0, finite(hookRadius)), t, distance });
}

function orbitDirection(velocity, shipToAnchor) {
  const outward = normalized({ x: -shipToAnchor.x, y: -shipToAnchor.y });
  const ccw = { x: -outward.y, y: outward.x };
  const projection = finite(velocity?.x) * ccw.x + finite(velocity?.y) * ccw.y;
  if (Math.abs(projection) > 1e-9) return projection >= 0 ? 1 : -1;
  // A radial approach has no physical handedness. This deterministic
  // cross-axis fallback keeps identical inputs identical across authority.
  const velocityDirection = normalized(velocity);
  return velocityDirection.x * outward.y - velocityDirection.y * outward.x >= 0 ? 1 : -1;
}

function tangentFor(shipToAnchor, direction = 1) {
  const outward = normalized({ x: -shipToAnchor.x, y: -shipToAnchor.y });
  return { x: -outward.y * direction, y: outward.x * direction };
}

function assistedReleaseDirection({ tangent, outward, requested, maxDegrees = GRAPPLE_ARC.releaseAssistDegrees }) {
  const base = normalized(tangent);
  const wishMagnitude = Math.hypot(finite(requested?.x), finite(requested?.y));
  if (wishMagnitude <= 1e-9) return base;
  const wish = normalized(requested);
  // Backward, inward, and wild release inputs do not rewrite the earned line.
  if (wish.x * base.x + wish.y * base.y <= 0 || wish.x * outward.x + wish.y * outward.y < 0) return base;
  const maxRadians = Math.max(0, finite(maxDegrees)) * Math.PI / 180;
  const angle = signedAngle(base, wish);
  if (Math.abs(angle) > maxRadians) return base;
  return normalized(rotate(base, angle));
}

function lerp(from, to, t) {
  const progress = Math.max(0, Math.min(1, finite(t)));
  return finite(from) + (finite(to) - finite(from)) * progress;
}

function reelDirection(entry, tangent, progress) {
  const from = normalized(entry);
  const to = normalized(tangent);
  const clamped = Math.max(0, Math.min(1, finite(progress)));
  // Smoothstep avoids a visible steering corner at either end of the short
  // magnetic reel. At capture this is exactly the entry line; at the end it
  // is exactly the authored arc tangent.
  const blend = clamped * clamped * (3 - 2 * clamped);
  return normalized({
    x: lerp(from.x, to.x, blend),
    y: lerp(from.y, to.y, blend),
  }, to);
}

function releaseAnchorSnapshot(anchor, state = {}) {
  return Object.freeze({
    id: state.anchorId ?? anchor?.id ?? null,
    type: state.anchorType ?? anchor?.type ?? null,
    wx: finite(anchor?.wx, finite(state.anchorWX)),
    wy: finite(anchor?.wy, finite(state.anchorWY)),
    range: Math.max(0, finite(anchor?.swingRadius, finite(state.anchorRange))),
  });
}

module.exports = {
  GRAPPLE_ARC,
  anchorPhysicalRadius,
  assistedReleaseDirection,
  grappleGeometry,
  lerp,
  normalized,
  orbitDirection,
  reelDirection,
  releaseAnchorSnapshot,
  signedAngle,
  sweptHookContact,
  tangentFor,
};
