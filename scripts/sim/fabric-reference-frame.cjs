"use strict";

const { FABRIC } = require("../content/fabric.cjs");
const { hullCalmSpaceReferenceSpeed } = require("./hull-reference-speed.cjs");

function finite(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function fabricCarrySpeedCap(player) {
  return Math.max(0, finite(FABRIC.referenceFrame?.carryCapFraction))
    * hullCalmSpaceReferenceSpeed(player);
}

// FREE flight receives the already-composed seeded-sea plus well-current
// velocity as one moving reference frame. This is intentionally a velocity
// cap before per-player coupling, never an acceleration cap or a new drag.
function capFabricCurrent(current, player) {
  const x = finite(current?.x);
  const y = finite(current?.y);
  const magnitude = Math.hypot(x, y);
  const cap = fabricCarrySpeedCap(player);
  if (magnitude <= cap || magnitude <= Number.EPSILON) {
    return { x, y, magnitude, cap, capped: false };
  }
  const scale = cap / magnitude;
  return { x: x * scale, y: y * scale, magnitude: cap, cap, capped: true };
}

module.exports = { capFabricCurrent, fabricCarrySpeedCap };
