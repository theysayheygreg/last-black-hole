const { performance } = require("perf_hooks");
const { BODY_MASKS, maskNames } = require("./body-masks.cjs");
const { BODY_SCHEMA_VERSION, lifecycleStateIsActive } = require("./body-schema.cjs");
const { BodyRegistry } = require("./body-registry.cjs");
const { SpatialIndex } = require("./spatial-index.cjs");

const DEFAULT_WORLD_SCALE = 1;
const DEFAULT_CELL_SIZE = 0.25;
const DEFAULT_RETIRED_IDENTITY_LIMIT = 1024;
const LIFECYCLE_ORDER = Object.freeze({
  spawning: 0,
  alive: 1,
  dying: 2,
  dead: 3,
  removed: 4,
});

function finiteNumber(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function positiveNumber(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function bodyId(kind, sourceId, index) {
  const raw = String(sourceId ?? `${kind}-${index + 1}`).trim() || `${kind}-${index + 1}`;
  return `${kind}:${raw}`;
}

function lifecycleFor(entity, { aliveField = "alive", deadStates = [] } = {}) {
  if (!entity) return "dead";
  if (entity[aliveField] === false) return "dead";
  if (deadStates.includes(entity.state) || deadStates.includes(entity.status)) return "dead";
  if (entity.state === "dying" || entity.status === "dying") return "dying";
  return "alive";
}

function radiusFor(entity, keys, fallback) {
  for (const key of keys) {
    const value = Number(entity?.[key]);
    if (Number.isFinite(value) && value > 0) return value;
  }
  return fallback;
}

function createBodyCollector(bodies, categories, skipped, duplicateIds) {
  const seenIds = new Map();

  return function addBody(input) {
    const id = String(input.id || "").trim();
    const wx = Number(input.wx);
    const wy = Number(input.wy);
    if (!id || !Number.isFinite(wx) || !Number.isFinite(wy)) {
      const category = input.category || "unknown";
      skipped[category] = (skipped[category] || 0) + 1;
      return null;
    }

    let uniqueId = id;
    const duplicateCount = seenIds.get(id) || 0;
    if (duplicateCount > 0) {
      uniqueId = `${id}#${duplicateCount + 1}`;
      duplicateIds.push(id);
    }
    seenIds.set(id, duplicateCount + 1);

    const body = {
      ...input,
      id: uniqueId,
      wx,
      wy,
      radius: Math.max(0, finiteNumber(input.radius, 0)),
    };
    bodies.push(body);
    categories[input.category] = (categories[input.category] || 0) + 1;
    return body;
  };
}

function sameConfiguration(left, right) {
  return Math.abs(left - right) <= Number.EPSILON * Math.max(1, Math.abs(left), Math.abs(right));
}

function compareCodepoint(left, right) {
  const a = String(left);
  const b = String(right);
  return a < b ? -1 : a > b ? 1 : 0;
}

function cloneBallparkHandle(handle) {
  return Object.freeze({
    epoch: handle.epoch,
    slot: handle.slot,
    generation: handle.generation,
  });
}

function identityKey(handle) {
  return `${handle.epoch}:${handle.slot}:${handle.generation}`;
}

function cloneIdentity(identity) {
  if (!identity) return null;
  return {
    ...identity,
    handle: cloneBallparkHandle(identity.handle),
  };
}

function createBallparkMirror(options = {}) {
  return new BallparkMirror(options);
}

class BallparkMirror {
  constructor(options = {}) {
    this.worldScale = positiveNumber(options.worldScale, DEFAULT_WORLD_SCALE);
    this.cellSize = positiveNumber(options.cellSize, DEFAULT_CELL_SIZE);
    this.epoch = 1;
    this.retiredIdentityLimit = Math.max(
      0,
      Math.trunc(finiteNumber(options.retiredIdentityLimit, DEFAULT_RETIRED_IDENTITY_LIMIT)),
    );
    this.registry = new BodyRegistry({ worldScale: this.worldScale });
    this.index = new SpatialIndex({ worldScale: this.worldScale, cellSize: this.cellSize });
    this._identities = new Map();
    this._activeIdentityById = new Map();
    this._identityHistoryById = new Map();
    this._incarnationById = new Map();
    this._retiredIdentityKeys = [];
    this._lifecycleStats = this._emptyLifecycleStats();
    this.queryUsage = this._emptyQueryUsage();
    this.lastStats = this._emptyStats();
  }

  rebuildFromRuntime(runtime, options = {}) {
    const started = performance.now();
    const worldScale = positiveNumber(
      runtime?.session?.worldScale ?? runtime?.mapState?.worldScale,
      this.worldScale,
    );
    const cellSize = positiveNumber(
      options.cellSize ?? runtime?.session?.flowFieldCellSize,
      Math.min(DEFAULT_CELL_SIZE, worldScale),
    );
    const tick = Math.max(0, Math.trunc(finiteNumber(options.tick ?? runtime?.tick, 0)));
    const categories = {};
    const skipped = {};
    const duplicateIds = [];
    const desiredBodies = [];
    const addBody = createBodyCollector(desiredBodies, categories, skipped, duplicateIds);

    this._addPlayers(runtime, addBody);
    this._addWorldAnchors(runtime, addBody);
    this._addDynamicThreats(runtime, addBody);
    this._addWaveEmitters(runtime, addBody);
    this._addInhibitor(runtime, addBody);

    const reason = String(options.reason || "runtime");
    const worldScaleChanged = !sameConfiguration(worldScale, this.worldScale);
    const cellSizeChanged = !sameConfiguration(cellSize, this.cellSize);
    const explicitReset = options.reset === true
      || options.forceRebuild === true
      || reason === "session-started";
    const registryReset = worldScaleChanged || explicitReset;
    const indexRebuilt = registryReset || cellSizeChanged;

    if (registryReset) {
      this.reset({ worldScale, cellSize, tick, reason });
    } else if (cellSizeChanged) {
      this.index = new SpatialIndex({ worldScale, cellSize });
    }

    this.worldScale = worldScale;
    this.cellSize = cellSize;
    this.synchronizeBodies(desiredBodies, { tick });

    const bodies = this.registry.entries();
    const activeBodyCount = bodies.filter((body) => lifecycleStateIsActive(body.lifecycle?.state)).length;

    this.lastStats = {
      enabled: true,
      schemaVersion: BODY_SCHEMA_VERSION,
      worldScale,
      cellSize,
      lastRebuildTick: tick,
      lastRebuildSimTime: finiteNumber(options.simTime ?? runtime?.simTime, 0),
      lastRebuildReason: reason,
      lastRebuildMs: Number((performance.now() - started).toFixed(3)),
      lastSyncMode: registryReset ? "registry-reset" : indexRebuilt ? "index-rebuild" : "incremental",
      bodyCount: bodies.length,
      activeBodyCount,
      categories,
      skipped,
      duplicateIds,
      registry: this.registry.stats(),
      spatialIndex: this.index.stats(),
      identities: this._identityStats(),
      queryUsage: this._cloneQueryUsage(),
    };
    return this.stats();
  }

  stats() {
    return {
      ...this.lastStats,
      categories: { ...(this.lastStats.categories || {}) },
      skipped: { ...(this.lastStats.skipped || {}) },
      duplicateIds: [...(this.lastStats.duplicateIds || [])],
      registry: this.registry.stats(),
      spatialIndex: this.index.stats(),
      identities: this._identityStats(),
      queryUsage: this._cloneQueryUsage(),
    };
  }

  queryCircle(...args) {
    const before = this.index.stats();
    const started = performance.now();
    const hits = this.index.queryCircle(...args).map((hit) => ({
      ...hit,
      handle: this._ballparkHandle(hit.handle),
    }));
    this._recordQuery("queryCircle", before, hits, started);
    return hits;
  }

  nearest(...args) {
    const before = this.index.stats();
    const started = performance.now();
    const hits = this.index.nearest(...args).map((hit) => ({
      ...hit,
      handle: this._ballparkHandle(hit.handle),
    }));
    this._recordQuery("nearest", before, hits, started);
    return hits;
  }

  getBodyById(id) {
    return this.registry.getBodyById(id);
  }

  getBody(ref) {
    return this.registry.getBody(this._resolveActiveHandle(ref));
  }

  getHandleById(id) {
    const body = this.registry.getBodyById(String(id));
    return body ? this._ballparkHandle(body.handle) : null;
  }

  getIdentity(ref) {
    if (typeof ref === "string") {
      const direct = this._identities.get(ref);
      if (direct) return cloneIdentity(direct);
      const activeKey = this._activeIdentityById.get(ref);
      if (activeKey) return cloneIdentity(this._identities.get(activeKey));
      const history = this._identityHistoryById.get(ref) || [];
      return cloneIdentity(this._identities.get(history[history.length - 1]));
    }
    if (!ref || !Number.isInteger(ref.epoch) || !Number.isInteger(ref.slot)
      || !Number.isInteger(ref.generation)) return null;
    return cloneIdentity(this._identities.get(identityKey(ref)));
  }

  getIdentityHistory(id) {
    return (this._identityHistoryById.get(String(id)) || [])
      .map((key) => cloneIdentity(this._identities.get(key)))
      .filter(Boolean);
  }

  listBodies(options = {}) {
    const lifecycleStates = options.lifecycleStates ? new Set(options.lifecycleStates) : null;
    return this.registry.entries()
      .filter((body) => !options.category || body.category === options.category)
      .filter((body) => options.ownerId === undefined || body.ownerId === options.ownerId)
      .filter((body) => !lifecycleStates || lifecycleStates.has(body.lifecycle?.state))
      .sort((left, right) => compareCodepoint(left.id, right.id)
        || left.handle.slot - right.handle.slot
        || left.handle.generation - right.handle.generation);
  }

  listIdentities(options = {}) {
    const lifecycleStates = options.lifecycleStates ? new Set(options.lifecycleStates) : null;
    const identities = [...this._identities.values()]
      .filter((entry) => options.includeRetired !== false || entry.state !== "removed")
      .filter((entry) => !options.category || entry.category === options.category)
      .filter((entry) => !options.id || entry.id === options.id)
      .filter((entry) => !lifecycleStates || lifecycleStates.has(entry.state));
    return identities
      .sort((left, right) => left.handle.epoch - right.handle.epoch
        || left.handle.slot - right.handle.slot
        || left.handle.generation - right.handle.generation
        || compareCodepoint(left.id, right.id))
      .map(cloneIdentity);
  }

  createBody(input, { tick = 0 } = {}) {
    const handle = this.registry.createBody(input, { tick });
    const body = this.registry.getBody(handle);
    this.index.upsert(body);
    this._recordCreatedIdentity(body);
    this._refreshStatsCounts();
    return this._ballparkHandle(handle);
  }

  updateBody(ref, patch = {}, { tick = 0 } = {}) {
    const handle = this._resolveActiveHandle(ref);
    const body = this.registry.updateBody(handle, patch, { tick });
    this.index.upsert(body);
    this._recordUpdatedIdentity(body);
    return body;
  }

  setLifecycle(ref, state, { tick = 0 } = {}) {
    const handle = this._resolveActiveHandle(ref);
    const body = this.registry.getBody(handle);
    const currentOrder = LIFECYCLE_ORDER[body.lifecycle.state];
    const nextOrder = LIFECYCLE_ORDER[state];
    if (nextOrder === undefined) throw new Error(`Invalid body lifecycle state: ${state}`);
    if (nextOrder < currentOrder) {
      throw new Error(`Body ${body.id} lifecycle cannot move backward from ${body.lifecycle.state} to ${state}`);
    }
    if (state === body.lifecycle.state) return body;
    const updated = this.registry.setLifecycle(handle, state, { tick });
    this.index.upsert(updated);
    this._recordLifecycleIdentity(updated);
    this._refreshStatsCounts();
    return updated;
  }

  removeBody(ref, { tick = 0 } = {}) {
    const handle = this._resolveActiveHandle(ref);
    const body = this.registry.getBody(handle);
    this.index.remove(handle);
    const tombstone = this.registry.removeBody(handle, { tick });
    this._retireIdentity(body.id, tombstone.lifecycle, tick);
    this._refreshStatsCounts();
    return tombstone;
  }

  upsertBody(input, { tick = 0 } = {}) {
    const existing = this.registry.getBodyById(String(input?.id || ""));
    if (!existing) return this.createBody(input, { tick });

    const nextState = input.lifecycle?.state || existing.lifecycle.state;
    const currentOrder = LIFECYCLE_ORDER[existing.lifecycle.state];
    const nextOrder = LIFECYCLE_ORDER[nextState];
    if (nextOrder === undefined) throw new Error(`Invalid body lifecycle state: ${nextState}`);
    if (nextOrder < currentOrder) {
      this.removeBody(this._ballparkHandle(existing.handle), { tick });
      return this.createBody(input, { tick });
    }

    this.updateBody(this._ballparkHandle(existing.handle), input, { tick });
    if (nextState !== existing.lifecycle.state) {
      this.setLifecycle(this._ballparkHandle(existing.handle), nextState, { tick });
    }
    return this._ballparkHandle(existing.handle);
  }

  synchronizeBodies(desiredBodies, { tick = 0, removeMissing = true } = {}) {
    const desiredIds = new Set();
    const orderedBodies = [...(desiredBodies || [])]
      .sort((left, right) => compareCodepoint(left?.id, right?.id));
    for (const body of orderedBodies) {
      const id = String(body?.id || "").trim();
      if (!id) throw new Error("Ballpark synchronization requires a body id");
      if (desiredIds.has(id)) throw new Error(`Ballpark synchronization received duplicate id: ${id}`);
      desiredIds.add(id);
    }

    if (removeMissing) {
      const removedBodies = this.registry.entries()
        .filter((body) => !desiredIds.has(body.id))
        .sort((left, right) => compareCodepoint(left.id, right.id));
      for (const body of removedBodies) this.removeBody(this._ballparkHandle(body.handle), { tick });
    }

    for (const input of orderedBodies) this.upsertBody(input, { tick });
    this._refreshStatsCounts();
    return this.stats();
  }

  reset(options = {}) {
    const tick = Math.max(0, Math.trunc(finiteNumber(options.tick, 0)));
    const worldScale = positiveNumber(options.worldScale, this.worldScale);
    const cellSize = positiveNumber(options.cellSize, this.cellSize);
    const activeBodies = this.registry.entries()
      .sort((left, right) => compareCodepoint(left.id, right.id));
    for (const body of activeBodies) {
      this._retireIdentity(body.id, {
        ...body.lifecycle,
        state: "removed",
        changedTick: tick,
        updatedTick: tick,
        removedTick: tick,
      }, tick);
    }
    this.epoch += 1;
    this.worldScale = worldScale;
    this.cellSize = cellSize;
    this.registry = new BodyRegistry({ worldScale });
    this.index = new SpatialIndex({ worldScale, cellSize });
    this._lifecycleStats.registryResets += 1;
    this._refreshStatsCounts();
  }

  _ballparkHandle(handle) {
    return cloneBallparkHandle({
      epoch: this.epoch,
      slot: handle.slot,
      generation: handle.generation,
    });
  }

  _resolveActiveHandle(ref) {
    if (typeof ref === "string") {
      const handle = this.registry.getHandleById(ref);
      if (!handle) throw new Error(`Unknown Ballpark body id: ${ref}`);
      return handle;
    }
    if (!ref || !Number.isInteger(ref.epoch) || !Number.isInteger(ref.slot)
      || !Number.isInteger(ref.generation)) {
      this._lifecycleStats.staleReferenceRejects += 1;
      throw new Error("Ballpark body reference requires epoch, slot, and generation");
    }
    if (ref.epoch !== this.epoch) {
      this._lifecycleStats.staleReferenceRejects += 1;
      const error = new Error(`Stale Ballpark body reference from epoch ${ref.epoch}; current epoch is ${this.epoch}`);
      error.code = "STALE_BALLPARK_EPOCH";
      error.handle = { ...ref };
      throw error;
    }
    return { slot: ref.slot, generation: ref.generation };
  }

  _recordCreatedIdentity(body) {
    const handle = this._ballparkHandle(body.handle);
    const key = identityKey(handle);
    const history = this._identityHistoryById.get(body.id) || [];
    const incarnation = (this._incarnationById.get(body.id) || 0) + 1;
    const identity = {
      key,
      id: body.id,
      category: body.category,
      sourceId: body.data?.sourceId ?? null,
      handle,
      incarnation,
      state: body.lifecycle.state,
      createdTick: body.lifecycle.createdTick,
      changedTick: body.lifecycle.changedTick,
      updatedTick: body.lifecycle.updatedTick,
      dyingTick: body.lifecycle.dyingTick,
      deadTick: body.lifecycle.deadTick,
      removedTick: body.lifecycle.removedTick,
    };
    this._identities.set(key, identity);
    this._activeIdentityById.set(body.id, key);
    history.push(key);
    this._identityHistoryById.set(body.id, history);
    this._incarnationById.set(body.id, incarnation);
    this._lifecycleStats.created += 1;
  }

  _recordUpdatedIdentity(body) {
    const key = this._activeIdentityById.get(body.id);
    const identity = key ? this._identities.get(key) : null;
    if (!identity) throw new Error(`Missing Ballpark identity for active body ${body.id}`);
    identity.category = body.category;
    identity.sourceId = body.data?.sourceId ?? identity.sourceId;
    identity.updatedTick = body.lifecycle.updatedTick;
    this._lifecycleStats.updated += 1;
  }

  _recordLifecycleIdentity(body) {
    const key = this._activeIdentityById.get(body.id);
    const identity = key ? this._identities.get(key) : null;
    if (!identity) throw new Error(`Missing Ballpark identity for active body ${body.id}`);
    identity.state = body.lifecycle.state;
    identity.changedTick = body.lifecycle.changedTick;
    identity.updatedTick = body.lifecycle.updatedTick;
    identity.dyingTick = body.lifecycle.dyingTick;
    identity.deadTick = body.lifecycle.deadTick;
    identity.removedTick = body.lifecycle.removedTick;
    this._lifecycleStats.transitions += 1;
  }

  _retireIdentity(id, lifecycle, tick) {
    const key = this._activeIdentityById.get(id);
    const identity = key ? this._identities.get(key) : null;
    if (!identity) return;
    identity.state = "removed";
    identity.changedTick = Math.max(identity.changedTick, lifecycle?.changedTick ?? tick);
    identity.updatedTick = Math.max(identity.updatedTick, lifecycle?.updatedTick ?? tick);
    identity.dyingTick = lifecycle?.dyingTick ?? identity.dyingTick;
    identity.deadTick = lifecycle?.deadTick ?? identity.deadTick;
    identity.removedTick = lifecycle?.removedTick ?? tick;
    this._activeIdentityById.delete(id);
    this._retiredIdentityKeys.push(key);
    this._lifecycleStats.removed += 1;
    this._trimRetiredIdentities();
  }

  _trimRetiredIdentities() {
    while (this._retiredIdentityKeys.length > this.retiredIdentityLimit) {
      const key = this._retiredIdentityKeys.shift();
      const identity = this._identities.get(key);
      if (!identity) continue;
      this._identities.delete(key);
      const history = this._identityHistoryById.get(identity.id) || [];
      const nextHistory = history.filter((entry) => entry !== key);
      if (nextHistory.length > 0) this._identityHistoryById.set(identity.id, nextHistory);
      else this._identityHistoryById.delete(identity.id);
      this._lifecycleStats.pruned += 1;
    }
  }

  _emptyLifecycleStats() {
    return {
      epoch: this.epoch,
      activeIdentities: 0,
      retiredIdentities: 0,
      retainedIdentities: 0,
      retiredIdentityLimit: this.retiredIdentityLimit,
      created: 0,
      updated: 0,
      transitions: 0,
      removed: 0,
      pruned: 0,
      registryResets: 0,
      staleReferenceRejects: 0,
    };
  }

  _identityStats() {
    return {
      ...this._lifecycleStats,
      epoch: this.epoch,
      activeIdentities: this._activeIdentityById.size,
      retiredIdentities: this._retiredIdentityKeys.length,
      retainedIdentities: this._identities.size,
      retiredIdentityLimit: this.retiredIdentityLimit,
    };
  }

  _refreshStatsCounts() {
    if (!this.lastStats) return;
    const bodies = this.registry.entries();
    const categories = {};
    for (const body of bodies) categories[body.category] = (categories[body.category] || 0) + 1;
    this.lastStats.bodyCount = bodies.length;
    this.lastStats.activeBodyCount = bodies
      .filter((body) => lifecycleStateIsActive(body.lifecycle?.state)).length;
    this.lastStats.registry = this.registry.stats();
    this.lastStats.spatialIndex = this.index.stats();
    this.lastStats.identities = this._identityStats();
    this.lastStats.categories = categories;
  }

  _emptyStats() {
    return {
      enabled: true,
      schemaVersion: BODY_SCHEMA_VERSION,
      worldScale: this.worldScale,
      cellSize: this.cellSize,
      lastRebuildTick: null,
      lastRebuildSimTime: null,
      lastRebuildReason: "not-built",
      lastRebuildMs: 0,
      lastSyncMode: "not-built",
      bodyCount: 0,
      activeBodyCount: 0,
      categories: {},
      skipped: {},
      duplicateIds: [],
      registry: this.registry.stats(),
      spatialIndex: this.index.stats(),
      identities: this._identityStats(),
      queryUsage: this._cloneQueryUsage(),
    };
  }

  _emptyQueryUsage() {
    return {
      queryCount: 0,
      queryCircleCount: 0,
      nearestCount: 0,
      candidateCount: 0,
      hitCount: 0,
      maskRejects: 0,
      stateRejects: 0,
      duplicateCandidates: 0,
      lastKind: null,
      lastHitCount: 0,
      lastQueryMs: 0,
      totalQueryMs: 0,
    };
  }

  _cloneQueryUsage() {
    return { ...this.queryUsage };
  }

  _recordQuery(kind, before, hits, started) {
    const after = this.index.stats();
    const elapsedMs = performance.now() - started;
    this.queryUsage.queryCount += 1;
    this.queryUsage[`${kind}Count`] = (this.queryUsage[`${kind}Count`] || 0) + 1;
    this.queryUsage.candidateCount += Math.max(0, after.candidateCount - before.candidateCount);
    this.queryUsage.hitCount += Array.isArray(hits) ? hits.length : 0;
    this.queryUsage.maskRejects += Math.max(0, after.maskRejects - before.maskRejects);
    this.queryUsage.stateRejects += Math.max(0, after.stateRejects - before.stateRejects);
    this.queryUsage.duplicateCandidates += Math.max(0, after.duplicateCandidates - before.duplicateCandidates);
    this.queryUsage.lastKind = kind;
    this.queryUsage.lastHitCount = Array.isArray(hits) ? hits.length : 0;
    this.queryUsage.lastQueryMs = Number(elapsedMs.toFixed(3));
    this.queryUsage.totalQueryMs = Number((this.queryUsage.totalQueryMs + elapsedMs).toFixed(3));
  }

  _addPlayers(runtime, addBody) {
    for (const [clientId, player] of runtime?.players || []) {
      addBody({
        id: bodyId("player", clientId, 0),
        category: player?.isAI ? "aiPlayer" : "player",
        wx: player?.wx,
        wy: player?.wy,
        vx: finiteNumber(player?.vx, 0),
        vy: finiteNumber(player?.vy, 0),
        radius: radiusFor(player, ["radius", "collisionRadius"], 0.035),
        collisionMask: player?.isAI ? [BODY_MASKS.AI, BODY_MASKS.PLAYER] : BODY_MASKS.PLAYER,
        interactionMask: [BODY_MASKS.PICKUP, BODY_MASKS.PORTAL, BODY_MASKS.SIGNAL],
        ownerId: clientId,
        replicationLane: player?.isAI ? "near" : "self",
        lifecycle: { state: player?.status === "alive" ? "alive" : "dead" },
        data: {
          status: player?.status || "unknown",
          hullType: player?.hullType || null,
          maskNames: maskNames(player?.isAI ? [BODY_MASKS.AI, BODY_MASKS.PLAYER] : BODY_MASKS.PLAYER),
        },
      });
    }
  }

  _addWorldAnchors(runtime, addBody) {
    const world = runtime?.mapState || {};
    for (const [index, well] of (world.wells || []).entries()) {
      addBody({
        id: bodyId("well", well.id, index),
        category: "well",
        wx: well.wx,
        wy: well.wy,
        vx: 0,
        vy: 0,
        radius: radiusFor(well, ["killRadius", "radius"], 0.08),
        mass: finiteNumber(well.mass, 1),
        collisionMask: [BODY_MASKS.WELL, BODY_MASKS.HAZARD, BODY_MASKS.FORCE],
        interactionMask: [BODY_MASKS.HAZARD, BODY_MASKS.FORCE],
        replicationLane: "global",
        lifecycle: { state: well.consumedByInhibitor ? "dying" : "alive" },
        data: {
          sourceId: well.id ?? null,
          ringOuter: finiteNumber(well.ringOuter, 0),
          killRadius: finiteNumber(well.killRadius, 0),
        },
      });
    }

    for (const [index, star] of (world.stars || []).entries()) {
      addBody({
        id: bodyId("star", star.id, index),
        category: "star",
        wx: star.wx,
        wy: star.wy,
        vx: finiteNumber(star.driftVX ?? star.vx, 0),
        vy: finiteNumber(star.driftVY ?? star.vy, 0),
        radius: radiusFor(star, ["radius", "ringRadius"], 0.035),
        mass: finiteNumber(star.mass, 1),
        collisionMask: [BODY_MASKS.STAR, BODY_MASKS.FORCE],
        interactionMask: [BODY_MASKS.FORCE, BODY_MASKS.SIGNAL],
        replicationLane: "global",
        lifecycle: { state: lifecycleFor(star) },
        data: { sourceId: star.id ?? null, type: star.type || null },
      });
    }

    for (const [index, wreck] of (world.wrecks || []).entries()) {
      addBody({
        id: bodyId("wreck", wreck.id, index),
        category: "wreck",
        wx: wreck.wx,
        wy: wreck.wy,
        vx: finiteNumber(wreck.vx, 0),
        vy: finiteNumber(wreck.vy, 0),
        radius: radiusFor(wreck, ["lootRadius", "radius"], 0.045),
        collisionMask: BODY_MASKS.WRECK,
        interactionMask: [BODY_MASKS.PICKUP, BODY_MASKS.SIGNAL],
        replicationLane: "near",
        lifecycle: { state: wreck.looted ? "dead" : lifecycleFor(wreck) },
        data: {
          sourceId: wreck.id ?? null,
          type: wreck.type || null,
          looted: Boolean(wreck.looted),
          pickupCooldown: finiteNumber(wreck.pickupCooldown, 0),
          lootCount: Array.isArray(wreck.loot) ? wreck.loot.length : 0,
        },
      });
    }

    for (const [index, portal] of (world.portals || []).entries()) {
      addBody({
        id: bodyId("portal", portal.id, index),
        category: "portal",
        wx: portal.wx,
        wy: portal.wy,
        vx: finiteNumber(portal.vx, 0),
        vy: finiteNumber(portal.vy, 0),
        radius: radiusFor(portal, ["captureRadius", "radius"], 0.08),
        collisionMask: BODY_MASKS.PORTAL,
        interactionMask: BODY_MASKS.PORTAL,
        replicationLane: "global",
        lifecycle: { state: portal.blockedByInhibitor ? "dying" : lifecycleFor(portal) },
        data: {
          sourceId: portal.id ?? null,
          type: portal.type || null,
          blockedByInhibitor: Boolean(portal.blockedByInhibitor),
          finalInhibitor: Boolean(portal.finalInhibitor),
        },
      });
    }

    for (const [index, planetoid] of (world.planetoids || []).entries()) {
      addBody({
        id: bodyId("planetoid", planetoid.id, index),
        category: "planetoid",
        wx: planetoid.wx,
        wy: planetoid.wy,
        vx: finiteNumber(planetoid.vx, 0),
        vy: finiteNumber(planetoid.vy, 0),
        radius: radiusFor(planetoid, ["radius"], 0.035),
        mass: finiteNumber(planetoid.mass, 0.5),
        collisionMask: [BODY_MASKS.PLANETOID, BODY_MASKS.FORCE],
        interactionMask: BODY_MASKS.FORCE,
        replicationLane: "near",
        lifecycle: { state: lifecycleFor(planetoid) },
        data: { sourceId: planetoid.id ?? null, type: planetoid.type || null },
      });
    }
  }

  _addDynamicThreats(runtime, addBody) {
    const world = runtime?.mapState || {};
    for (const [index, scav] of (world.scavengers || []).entries()) {
      addBody({
        id: bodyId("scavenger", scav.id, index),
        category: "scavenger",
        wx: scav.wx,
        wy: scav.wy,
        vx: finiteNumber(scav.vx, 0),
        vy: finiteNumber(scav.vy, 0),
        radius: radiusFor(scav, ["radius"], 0.035),
        collisionMask: [BODY_MASKS.AI, BODY_MASKS.HAZARD],
        interactionMask: [BODY_MASKS.HAZARD, BODY_MASKS.PICKUP, BODY_MASKS.SIGNAL],
        replicationLane: "near",
        lifecycle: { state: lifecycleFor(scav) },
        data: {
          sourceId: scav.id ?? null,
          archetype: scav.archetype || null,
          state: scav.state || null,
          lootCount: finiteNumber(scav.lootCount, 0),
        },
      });
    }

    for (const [index, sentry] of (world.sentries || []).entries()) {
      addBody({
        id: bodyId("sentry", sentry.id, index),
        category: "sentry",
        wx: sentry.wx,
        wy: sentry.wy,
        vx: finiteNumber(sentry.vx, 0),
        vy: finiteNumber(sentry.vy, 0),
        radius: radiusFor(sentry, ["radius"], 0.035),
        collisionMask: [BODY_MASKS.AI, BODY_MASKS.HAZARD],
        interactionMask: [BODY_MASKS.HAZARD, BODY_MASKS.SIGNAL],
        replicationLane: "near",
        lifecycle: { state: lifecycleFor(sentry) },
        data: { sourceId: sentry.id ?? null, wellId: sentry.wellId || null, state: sentry.state || null },
      });
    }

    for (const [index, fauna] of (world.fauna || []).entries()) {
      addBody({
        id: bodyId("fauna", fauna.id, index),
        category: "fauna",
        wx: fauna.wx,
        wy: fauna.wy,
        vx: finiteNumber(fauna.vx, 0),
        vy: finiteNumber(fauna.vy, 0),
        radius: radiusFor(fauna, ["radius"], fauna.type === "jelly" ? 0.04 : 0.03),
        collisionMask: [BODY_MASKS.AI, BODY_MASKS.HAZARD],
        interactionMask: [BODY_MASKS.HAZARD, BODY_MASKS.SIGNAL],
        replicationLane: "near",
        lifecycle: { state: lifecycleFor(fauna) },
        data: { sourceId: fauna.id ?? null, type: fauna.type || null },
      });
    }
  }

  _addWaveEmitters(runtime, addBody) {
    for (const [index, wave] of (runtime?.waveRings || []).entries()) {
      addBody({
        id: bodyId("wave", wave.id, index),
        category: "wave",
        wx: wave.sourceWX,
        wy: wave.sourceWY,
        vx: 0,
        vy: 0,
        radius: radiusFor(wave, ["radius"], 0),
        mass: finiteNumber(wave.amplitude, 0),
        collisionMask: BODY_MASKS.FORCE,
        interactionMask: BODY_MASKS.FORCE,
        replicationLane: "vfx",
        lifecycle: { state: lifecycleFor(wave) },
        data: {
          sourceId: wave.id ?? null,
          amplitude: finiteNumber(wave.amplitude, 0),
          initialAmplitude: finiteNumber(wave.initialAmplitude, 0),
        },
      });
    }
  }

  _addInhibitor(runtime, addBody) {
    const inhibitor = runtime?.inhibitor;
    if (!inhibitor || finiteNumber(inhibitor.form, 0) <= 0) return;
    addBody({
      id: "inhibitor:vessel",
      category: "inhibitor",
      wx: inhibitor.wx,
      wy: inhibitor.wy,
      vx: finiteNumber(inhibitor.vx, 0),
      vy: finiteNumber(inhibitor.vy, 0),
      radius: radiusFor(inhibitor, ["radius"], 0.1),
      mass: finiteNumber(inhibitor.form, 1),
      collisionMask: [BODY_MASKS.HAZARD, BODY_MASKS.FORCE, BODY_MASKS.SIGNAL],
      interactionMask: [BODY_MASKS.HAZARD, BODY_MASKS.SIGNAL],
      replicationLane: "global",
      lifecycle: { state: "alive" },
      data: {
        form: finiteNumber(inhibitor.form, 0),
        intensity: finiteNumber(inhibitor.intensity, 0),
      },
    });
  }
}

module.exports = {
  BallparkMirror,
  createBallparkMirror,
};
