"use strict";

const { wrapPosition, wrappedDelta } = require("./world-geometry.cjs");

const EPSILON = 1e-9;

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

function quadraticRoots(a, b, c) {
  if (Math.abs(a) <= EPSILON) {
    if (Math.abs(b) <= EPSILON) return [];
    return [-c / b];
  }
  const discriminant = b * b - 4 * a * c;
  if (discriminant < -EPSILON) return [];
  const root = Math.sqrt(Math.max(0, discriminant));
  return [(-b - root) / (2 * a), (-b + root) / (2 * a)];
}

function boundaryCrossing({ startX, startY, deltaX, deltaY, previousRadius, radiusDelta, boundary }) {
  const radius0 = Math.max(0, previousRadius + boundary);
  const radiusDeltaSafe = radiusDelta;
  const a = deltaX * deltaX + deltaY * deltaY - radiusDeltaSafe * radiusDeltaSafe;
  const b = 2 * (startX * deltaX + startY * deltaY - radius0 * radiusDeltaSafe);
  const c = startX * startX + startY * startY - radius0 * radius0;
  return quadraticRoots(a, b, c)
    .filter((t) => t > EPSILON && t <= 1 + EPSILON)
    .map((t) => Math.max(0, Math.min(1, t)));
}

/**
 * Test the player segment against an expanding annular front. The relative
 * path and front radius are both swept over the authority tick, so a fast
 * player cannot tunnel through a narrow wave. Authority callers pass their
 * already-resolved toroidal displacement; pure callers may use wrapped
 * endpoints when no unwrapped delta is available.
 */
function sweptWaveCrossing({
  startX,
  startY,
  endX,
  endY,
  deltaX,
  deltaY,
  sourceX,
  sourceY,
  worldScale,
  previousRadius,
  currentRadius,
  frontWidth,
} = {}) {
  const scale = finite(worldScale, "worldScale");
  if (scale <= 0) throw new RangeError("worldScale must be greater than zero");
  const startWorldX = finite(startX, "startX");
  const startWorldY = finite(startY, "startY");
  const hasExplicitDelta = deltaX !== undefined || deltaY !== undefined;
  if (hasExplicitDelta && (deltaX === undefined || deltaY === undefined)) {
    throw new TypeError("deltaX and deltaY must be provided together");
  }
  const endWorldX = hasExplicitDelta ? startWorldX + finite(deltaX, "deltaX") : finite(endX, "endX");
  const endWorldY = hasExplicitDelta ? startWorldY + finite(deltaY, "deltaY") : finite(endY, "endY");
  const sourceWorldX = finite(sourceX, "sourceX");
  const sourceWorldY = finite(sourceY, "sourceY");
  const beforeRadius = nonNegative(previousRadius, "previousRadius");
  const afterRadius = nonNegative(currentRadius, "currentRadius");
  const width = nonNegative(frontWidth, "frontWidth");
  if (afterRadius < beforeRadius - EPSILON) return { hit: false };

  const relativeStartX = wrappedDelta(sourceWorldX, startWorldX, scale);
  const relativeStartY = wrappedDelta(sourceWorldY, startWorldY, scale);
  const relativeDeltaX = !hasExplicitDelta
    ? wrappedDelta(startWorldX, endWorldX, scale)
    : finite(deltaX, "deltaX");
  const relativeDeltaY = !hasExplicitDelta
    ? wrappedDelta(startWorldY, endWorldY, scale)
    : finite(deltaY, "deltaY");
  const radiusDelta = afterRadius - beforeRadius;
  const halfWidth = width * 0.5;
  const candidates = [
    ...boundaryCrossing({
      startX: relativeStartX,
      startY: relativeStartY,
      deltaX: relativeDeltaX,
      deltaY: relativeDeltaY,
      previousRadius: beforeRadius,
      radiusDelta,
      boundary: -halfWidth,
    }),
    ...boundaryCrossing({
      startX: relativeStartX,
      startY: relativeStartY,
      deltaX: relativeDeltaX,
      deltaY: relativeDeltaY,
      previousRadius: beforeRadius,
      radiusDelta,
      boundary: halfWidth,
    }),
  ].sort((a, b) => a - b);
  if (candidates.length === 0) return { hit: false };

  const t = candidates[0];
  const relativeX = relativeStartX + relativeDeltaX * t;
  const relativeY = relativeStartY + relativeDeltaY * t;
  const distance = Math.hypot(relativeX, relativeY);
  const normalLength = Math.max(EPSILON, distance);
  return {
    hit: true,
    t,
    contactX: wrapPosition(startWorldX + relativeDeltaX * t, scale),
    contactY: wrapPosition(startWorldY + relativeDeltaY * t, scale),
    normalX: relativeX / normalLength,
    normalY: relativeY / normalLength,
  };
}

function hasWaveReceipt(receipts, waveId) {
  return Array.isArray(receipts)
    && receipts.some((receipt) => String(receipt?.waveId) === String(waveId));
}

function rememberWaveReceipt(receipts, waveId, tick, maxReceipts = 64) {
  const bounded = Math.max(1, Math.floor(Number(maxReceipts) || 64));
  const next = Array.isArray(receipts)
    ? receipts.filter((receipt) => String(receipt?.waveId) !== String(waveId))
    : [];
  next.push({ waveId, tick });
  return next.slice(-bounded);
}

module.exports = { hasWaveReceipt, rememberWaveReceipt, sweptWaveCrossing };
