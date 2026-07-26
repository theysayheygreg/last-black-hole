const { BODY_MASKS, resolveMask } = require("./body-masks.cjs");
const {
  LIFECYCLE_STATES,
  normalizeBodyInput,
} = require("./body-schema.cjs");
const { wrapPosition } = require("./world-geometry.cjs");

function wrapWorld(value, worldScale) {
  const scale = Number.isFinite(worldScale) && worldScale > 0 ? worldScale : 1;
  const coordinate = Number(value);
  return Number.isFinite(coordinate) ? wrapPosition(coordinate, scale) : NaN;
}

function makeHandle(slot, generation) {
  return Object.freeze({ slot, generation });
}

function cloneHandle(handle) {
  return makeHandle(handle.slot, handle.generation);
}

function handleKey(handle) {
  return `${handle.slot}:${handle.generation}`;
}

class DuplicateBodyIdError extends Error {
  constructor(id) {
    super(`Body id already exists: ${id}`);
    this.name = "DuplicateBodyIdError";
    this.code = "DUPLICATE_BODY_ID";
    this.id = id;
  }
}

class StaleBodyHandleError extends Error {
  constructor(handle, details = {}) {
    const reason = details.reason || "stale";
    super(`Stale body handle ${JSON.stringify(handle)} (${reason})`);
    this.name = "StaleBodyHandleError";
    this.code = "STALE_BODY_HANDLE";
    this.handle = handle ? { ...handle } : handle;
    this.slot = handle?.slot;
    this.expectedGeneration = handle?.generation;
    this.actualGeneration = details.actualGeneration ?? null;
    this.reason = reason;
  }
}

class BodyRegistry {
  constructor({ worldScale = 1 } = {}) {
    if (!Number.isFinite(worldScale) || worldScale <= 0) {
      throw new Error("BodyRegistry worldScale must be a positive number");
    }
    this.worldScale = worldScale;
    this._slots = [];
    this._freeSlots = [];
    this._idToHandle = new Map();
    this._stats = {
      bodyCount: 0,
      created: 0,
      updated: 0,
      lifecycleChanges: 0,
      removed: 0,
      recycledSlots: 0,
      staleHandleRejects: 0,
      duplicateIdRejects: 0,
    };
  }

  get size() {
    return this._stats.bodyCount;
  }

  stats() {
    return { ...this._stats, slotCount: this._slots.length, freeSlots: this._freeSlots.length };
  }

  createBody(input, { tick = 0 } = {}) {
    const id = String(input?.id || "").trim();
    if (this._idToHandle.has(id)) {
      this._stats.duplicateIdRejects += 1;
      throw new DuplicateBodyIdError(id);
    }

    const slot = this._freeSlots.length > 0 ? this._freeSlots.pop() : this._slots.length;
    const existing = this._slots[slot];
    const generation = existing ? existing.generation + 1 : 1;
    if (existing) this._stats.recycledSlots += 1;
    const handle = makeHandle(slot, generation);
    const body = normalizeBodyInput({
      collisionMask: BODY_MASKS.NONE,
      interactionMask: BODY_MASKS.NONE,
      ...input,
      wx: wrapWorld(Number(input.wx), this.worldScale),
      wy: wrapWorld(Number(input.wy), this.worldScale),
    }, {
      tick,
      worldScale: this.worldScale,
      handle,
    });
    body.handle = handle;

    this._slots[slot] = { generation, body, tombstone: null };
    this._idToHandle.set(body.id, handle);
    this._stats.bodyCount += 1;
    this._stats.created += 1;
    return cloneHandle(handle);
  }

  has(handle) {
    try {
      this._requireBody(handle);
      return true;
    } catch (err) {
      if (err?.code === "STALE_BODY_HANDLE") return false;
      throw err;
    }
  }

  getBody(handle) {
    return this._requireBody(handle);
  }

  getBodyById(id) {
    const handle = this._idToHandle.get(id);
    return handle ? this.getBody(handle) : null;
  }

  getHandleById(id) {
    const handle = this._idToHandle.get(id);
    return handle ? cloneHandle(handle) : null;
  }

  updateBody(handle, patch = {}, { tick = 0 } = {}) {
    const body = this._requireBody(handle);
    const nextWX = patch.wx !== undefined ? wrapWorld(Number(patch.wx), this.worldScale) : body.wx;
    const nextWY = patch.wy !== undefined ? wrapWorld(Number(patch.wy), this.worldScale) : body.wy;
    if (!Number.isFinite(nextWX) || !Number.isFinite(nextWY)) {
      throw new Error(`Body ${body.id} update requires finite wx/wy`);
    }

    body.prevWX = body.wx;
    body.prevWY = body.wy;
    body.wx = nextWX;
    body.wy = nextWY;

    for (const key of ["vx", "vy", "ax", "ay", "mass"]) {
      if (patch[key] !== undefined) {
        const value = Number(patch[key]);
        if (!Number.isFinite(value)) throw new Error(`Body ${body.id} ${key} must be finite`);
        body[key] = key === "mass" ? Math.max(0, value) : value;
      }
    }
    if (patch.radius !== undefined) {
      const radius = Number(patch.radius);
      if (!Number.isFinite(radius)) throw new Error(`Body ${body.id} radius must be finite`);
      body.radius = Math.max(0, radius);
    }
    if (patch.collisionMask !== undefined || patch.mask !== undefined) {
      body.collisionMask = resolveMask(patch.collisionMask ?? patch.mask, body.collisionMask);
    }
    if (patch.interactionMask !== undefined) {
      body.interactionMask = resolveMask(patch.interactionMask, body.interactionMask);
    }
    if (patch.ownerId !== undefined) body.ownerId = patch.ownerId;
    if (patch.replicationLane !== undefined) body.replicationLane = patch.replicationLane;
    if (patch.flags) body.flags = { ...body.flags, ...patch.flags };
    if (patch.data) body.data = { ...body.data, ...patch.data };

    body.lifecycle.updatedTick = Math.max(body.lifecycle.updatedTick, Math.trunc(Number(tick) || 0));
    this._stats.updated += 1;
    return body;
  }

  setLifecycle(handle, state, { tick = 0 } = {}) {
    if (!LIFECYCLE_STATES.includes(state)) {
      throw new Error(`Invalid body lifecycle state: ${state}`);
    }
    const body = this._requireBody(handle);
    const safeTick = Math.max(0, Math.trunc(Number(tick) || 0));
    body.lifecycle.state = state;
    body.lifecycle.changedTick = Math.max(body.lifecycle.changedTick, safeTick);
    body.lifecycle.updatedTick = Math.max(body.lifecycle.updatedTick, safeTick);
    if (state === "dying" && body.lifecycle.dyingTick === null) body.lifecycle.dyingTick = safeTick;
    if (state === "dead" && body.lifecycle.deadTick === null) body.lifecycle.deadTick = safeTick;
    if (state === "removed" && body.lifecycle.removedTick === null) body.lifecycle.removedTick = safeTick;
    this._stats.lifecycleChanges += 1;
    return body;
  }

  removeBody(handle, { tick = 0 } = {}) {
    const body = this.setLifecycle(handle, "removed", { tick });
    const slot = handle.slot;
    const record = this._slots[slot];
    const tombstone = {
      ...body,
      handle: cloneHandle(body.handle),
      lifecycle: { ...body.lifecycle },
      flags: { ...body.flags },
      data: { ...body.data },
    };
    this._idToHandle.delete(body.id);
    record.body = null;
    record.tombstone = tombstone;
    this._freeSlots.push(slot);
    this._stats.bodyCount -= 1;
    this._stats.removed += 1;
    return tombstone;
  }

  entries() {
    return this._slots
      .map((record) => record?.body)
      .filter(Boolean);
  }

  handles() {
    return this.entries().map((body) => cloneHandle(body.handle));
  }

  _requireBody(handle) {
    if (!handle || !Number.isInteger(handle.slot) || !Number.isInteger(handle.generation)) {
      this._stats.staleHandleRejects += 1;
      throw new StaleBodyHandleError(handle, { reason: "malformed" });
    }
    const record = this._slots[handle.slot];
    if (!record) {
      this._stats.staleHandleRejects += 1;
      throw new StaleBodyHandleError(handle, { reason: "unknown slot" });
    }
    if (record.generation !== handle.generation) {
      this._stats.staleHandleRejects += 1;
      throw new StaleBodyHandleError(handle, {
        actualGeneration: record.generation,
        reason: "recycled slot",
      });
    }
    if (!record.body) {
      this._stats.staleHandleRejects += 1;
      throw new StaleBodyHandleError(handle, {
        actualGeneration: record.generation,
        reason: "removed body",
      });
    }
    return record.body;
  }
}

module.exports = {
  BodyRegistry,
  DuplicateBodyIdError,
  StaleBodyHandleError,
  wrapWorld,
  handleKey,
};
