const { BODY_MASKS, resolveMask } = require("./body-masks.cjs");

const BODY_SCHEMA_VERSION = 1;

const LIFECYCLE_STATES = Object.freeze([
  "spawning",
  "alive",
  "dying",
  "dead",
  "removed",
]);

const ACTIVE_LIFECYCLE_STATES = Object.freeze([
  "spawning",
  "alive",
  "dying",
]);

const REPLICATION_LANES = Object.freeze([
  "self",
  "near",
  "global",
  "debug",
  "cinematic",
  "vfx",
]);

const DEFAULT_REPLICATION_LANE = "near";

function assertFiniteNumber(value, name) {
  if (!Number.isFinite(value)) {
    throw new Error(`Body ${name} must be a finite number`);
  }
  return value;
}

function finiteOr(value, fallback) {
  return Number.isFinite(value) ? value : fallback;
}

function normalizeLifecycle(input = {}, tick = 0) {
  const state = input.state || "spawning";
  if (!LIFECYCLE_STATES.includes(state)) {
    throw new Error(`Invalid body lifecycle state: ${state}`);
  }
  const safeTick = Math.max(0, Math.trunc(finiteOr(tick, 0)));
  const createdTick = Math.max(0, Math.trunc(finiteOr(input.createdTick, safeTick)));
  const changedTick = Math.max(createdTick, Math.trunc(finiteOr(input.changedTick, safeTick)));
  const updatedTick = Math.max(createdTick, Math.trunc(finiteOr(input.updatedTick, changedTick)));
  return {
    state,
    createdTick,
    changedTick,
    updatedTick,
    dyingTick: input.dyingTick ?? (state === "dying" ? changedTick : null),
    deadTick: input.deadTick ?? (state === "dead" ? changedTick : null),
    removedTick: input.removedTick ?? (state === "removed" ? changedTick : null),
  };
}

function normalizeBodyInput(input, { tick = 0, worldScale = 1, handle = null } = {}) {
  if (!input || typeof input !== "object") {
    throw new Error("Body input must be an object");
  }
  if (typeof input.id !== "string" || input.id.trim().length === 0) {
    throw new Error("Body id must be a non-empty string");
  }

  const wx = assertFiniteNumber(Number(input.wx), "wx");
  const wy = assertFiniteNumber(Number(input.wy), "wy");
  const radius = Math.max(0, assertFiniteNumber(Number(input.radius ?? 0), "radius"));
  const mass = Math.max(0, finiteOr(Number(input.mass), 1));
  const category = String(input.category || input.type || "body");
  const replicationLane = input.replicationLane || DEFAULT_REPLICATION_LANE;
  if (!REPLICATION_LANES.includes(replicationLane)) {
    throw new Error(`Invalid body replication lane: ${replicationLane}`);
  }

  return {
    schemaVersion: BODY_SCHEMA_VERSION,
    id: input.id.trim(),
    category,
    handle,
    wx,
    wy,
    prevWX: finiteOr(Number(input.prevWX), wx),
    prevWY: finiteOr(Number(input.prevWY), wy),
    vx: finiteOr(Number(input.vx), 0),
    vy: finiteOr(Number(input.vy), 0),
    ax: finiteOr(Number(input.ax), 0),
    ay: finiteOr(Number(input.ay), 0),
    radius,
    mass,
    collisionMask: resolveMask(input.collisionMask ?? input.mask, BODY_MASKS.NONE),
    interactionMask: resolveMask(input.interactionMask, BODY_MASKS.NONE),
    ownerId: input.ownerId ?? null,
    replicationLane,
    lifecycle: normalizeLifecycle(input.lifecycle, tick),
    flags: { ...(input.flags || {}) },
    data: input.data ? { ...input.data } : {},
    worldScale,
  };
}

function lifecycleStateIsActive(state) {
  return ACTIVE_LIFECYCLE_STATES.includes(state);
}

module.exports = {
  BODY_SCHEMA_VERSION,
  LIFECYCLE_STATES,
  ACTIVE_LIFECYCLE_STATES,
  REPLICATION_LANES,
  DEFAULT_REPLICATION_LANE,
  normalizeBodyInput,
  normalizeLifecycle,
  lifecycleStateIsActive,
};
