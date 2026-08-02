"use strict";

const { MOVEMENT } = require("../content/movement.cjs");
const { HULL_DEFINITIONS } = require("../content/hulls.cjs");
const { dragFactorFromHalfLife } = require("../../src/content/tuning.js");

/**
 * Calm-space speed is derived from the existing thrust/drag equilibrium and
 * the canonical hard cap. It is a reference for impulses, not a new speed
 * limit or a second movement model.
 */
function hullCalmSpaceReferenceSpeed(playerOrHullType = "drifter", {
  movement = MOVEMENT,
  hullDefinitions = HULL_DEFINITIONS,
} = {}) {
  const player = playerOrHullType && typeof playerOrHullType === "object"
    ? playerOrHullType
    : null;
  const hullType = player?.hullType || (typeof playerOrHullType === "string" ? playerOrHullType : "drifter");
  const hull = hullDefinitions[hullType] || hullDefinitions.drifter || {};
  const brain = player?.brain || {};
  const resolvedThrustScale = Number(brain.thrustScale);
  const resolvedDragScale = Number(brain.dragScale);
  const baseThrustScale = Number(hull.thrustScale);
  const baseDragScale = Number(hull.dragScale);
  const thrustScale = Number.isFinite(resolvedThrustScale) && resolvedThrustScale >= 0
    ? resolvedThrustScale
    : (Number.isFinite(baseThrustScale) && baseThrustScale >= 0 ? baseThrustScale : 1);
  const dragScale = Number.isFinite(resolvedDragScale) && resolvedDragScale >= 0
    ? resolvedDragScale
    : (Number.isFinite(baseDragScale) && baseDragScale >= 0 ? baseDragScale : 1);
  const thrustAccel = Math.max(0, Number(movement.player?.thrustAccel) || 0) * thrustScale;
  const coastHalfLife = Math.max(Number.EPSILON, Number(movement.player?.coastHalfLifeSeconds) || 0);
  const integrationHz = Number(movement.authority?.integrationHz);
  if (!Number.isFinite(integrationHz) || integrationHz <= 0) {
    throw new RangeError("movement.authority.integrationHz must be greater than zero");
  }
  const dt = 1 / integrationHz;
  const dragFactor = dragFactorFromHalfLife(coastHalfLife, dt, dragScale);
  const equilibrium = dragFactor < 1
    ? (thrustAccel * dt * dragFactor) / (1 - dragFactor)
    : Infinity;
  const maxSpeed = Math.max(0, Number(movement.player?.maxSpeedWorld) || 0);
  return Math.min(maxSpeed, equilibrium);
}

module.exports = { hullCalmSpaceReferenceSpeed };
