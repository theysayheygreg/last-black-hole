const { performance } = require("perf_hooks");
const { ACTIVE_LIFECYCLE_STATES } = require("./body-schema.cjs");
const { BODY_MASKS, resolveMask } = require("./body-masks.cjs");
const { handleKey, wrapWorld } = require("./body-registry.cjs");

function positiveNumber(value, fallback) {
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

function worldDelta(from, to, worldScale) {
  let delta = to - from;
  const half = worldScale / 2;
  if (delta > half) delta -= worldScale;
  if (delta < -half) delta += worldScale;
  return delta;
}

function worldDistance(ax, ay, bx, by, worldScale) {
  return Math.hypot(worldDelta(ax, bx, worldScale), worldDelta(ay, by, worldScale));
}

function compareQueryResults(a, b) {
  const delta = a.distance - b.distance;
  if (Math.abs(delta) > 1e-12) return delta;
  const aId = String(a.id);
  const bId = String(b.id);
  if (aId < bId) return -1;
  if (aId > bId) return 1;
  if (a.handle.slot !== b.handle.slot) return a.handle.slot - b.handle.slot;
  return a.handle.generation - b.handle.generation;
}

function cloneHandle(handle) {
  return Object.freeze({ slot: handle.slot, generation: handle.generation });
}

class SpatialIndex {
  constructor({ worldScale = 1, cellSize = 0.25 } = {}) {
    this.worldScale = positiveNumber(Number(worldScale), 1);
    this.requestedCellSize = positiveNumber(Number(cellSize), this.worldScale);
    const cellsPerAxis = Math.max(1, Math.round(this.worldScale / this.requestedCellSize));
    // The toroidal grid period must equal worldScale exactly. A raw ceil() cell
    // count creates a phantom seam outside the world, so wrapped candidates can
    // miss bodies near x/y=0 when cellSize does not divide the map cleanly.
    this.cellSize = this.worldScale / cellsPerAxis;
    this.columns = cellsPerAxis;
    this.rows = cellsPerAxis;
    this.cells = Array.from({ length: this.columns * this.rows }, () => new Set());
    this.records = new Map();
    this.recordCells = new Map();
    this._stats = {
      bodyCount: 0,
      insertCount: 0,
      updateCount: 0,
      removeCount: 0,
      queryCount: 0,
      candidateCount: 0,
      hitCount: 0,
      maskRejects: 0,
      stateRejects: 0,
      duplicateCandidates: 0,
      lastQueryMs: 0,
      totalQueryMs: 0,
    };
  }

  get size() {
    return this.records.size;
  }

  clear() {
    for (const cell of this.cells) cell.clear();
    this.records.clear();
    this.recordCells.clear();
    this._stats.bodyCount = 0;
  }

  rebuild(bodies = []) {
    this.clear();
    for (const body of bodies) this.upsert(body);
  }

  upsert(body) {
    if (!body?.handle) throw new Error("SpatialIndex.upsert requires a body with a handle");
    const key = handleKey(body.handle);
    const exists = this.records.has(key);
    if (exists) this._removeFromCells(key);

    const record = this._recordFromBody(body);
    const cellIds = this._cellsForWrappedBox(record.wx, record.wy, record.radius, record.radius);
    for (const cellId of cellIds) this.cells[cellId].add(key);
    this.records.set(key, record);
    this.recordCells.set(key, cellIds);
    this._stats.bodyCount = this.records.size;
    this._stats[exists ? "updateCount" : "insertCount"] += 1;
  }

  remove(handle) {
    const key = handleKey(handle);
    const existed = this.records.delete(key);
    this._removeFromCells(key);
    if (existed) this._stats.removeCount += 1;
    this._stats.bodyCount = this.records.size;
    return existed;
  }

  queryCircle(wxOrQuery, wy, radius, options = {}) {
    const query = typeof wxOrQuery === "object"
      ? wxOrQuery
      : { wx: wxOrQuery, wy, radius, ...options };
    const qx = wrapWorld(Number(query.wx), this.worldScale);
    const qy = wrapWorld(Number(query.wy), this.worldScale);
    const qr = Math.max(0, Number(query.radius) || 0);
    const candidates = this._candidateKeysForBox(qx, qy, qr, qr);
    return this._collectQuery(candidates, query, (record) => {
      const dx = worldDelta(qx, record.wx, this.worldScale);
      const dy = worldDelta(qy, record.wy, this.worldScale);
      const distance = Math.hypot(dx, dy);
      return distance <= qr + record.radius + 1e-12
        ? { distance, dx, dy }
        : null;
    });
  }

  queryAABB(wxOrQuery, wy, halfWidth, halfHeight, options = {}) {
    const query = typeof wxOrQuery === "object"
      ? wxOrQuery
      : { wx: wxOrQuery, wy, halfWidth, halfHeight, ...options };
    const qx = wrapWorld(Number(query.wx), this.worldScale);
    const qy = wrapWorld(Number(query.wy), this.worldScale);
    const hx = Math.max(0, Number(query.halfWidth ?? query.width * 0.5) || 0);
    const hy = Math.max(0, Number(query.halfHeight ?? query.height * 0.5) || 0);
    const candidates = this._candidateKeysForBox(qx, qy, hx, hy);
    return this._collectQuery(candidates, query, (record) => {
      const dx = worldDelta(qx, record.wx, this.worldScale);
      const dy = worldDelta(qy, record.wy, this.worldScale);
      if (Math.abs(dx) <= hx + record.radius + 1e-12 && Math.abs(dy) <= hy + record.radius + 1e-12) {
        return { distance: Math.hypot(dx, dy), dx, dy };
      }
      return null;
    });
  }

  nearest(wxOrQuery, wy, options = {}) {
    const query = typeof wxOrQuery === "object"
      ? wxOrQuery
      : { wx: wxOrQuery, wy, ...options };
    const radius = Number.isFinite(query.radius) ? query.radius : this.worldScale;
    const limit = Math.max(1, Math.trunc(Number(query.limit) || 1));
    return this.queryCircle({ ...query, radius, limit });
  }

  stats() {
    return {
      ...this._stats,
      bodyCount: this.records.size,
      worldScale: this.worldScale,
      requestedCellSize: this.requestedCellSize,
      cellSize: this.cellSize,
      columns: this.columns,
      rows: this.rows,
    };
  }

  _recordFromBody(body) {
    return {
      id: body.id,
      category: body.category,
      handle: cloneHandle(body.handle),
      wx: wrapWorld(Number(body.wx), this.worldScale),
      wy: wrapWorld(Number(body.wy), this.worldScale),
      radius: Math.max(0, Number(body.radius) || 0),
      collisionMask: resolveMask(body.collisionMask, BODY_MASKS.NONE),
      interactionMask: resolveMask(body.interactionMask, BODY_MASKS.NONE),
      lifecycleState: body.lifecycle?.state || "alive",
      body,
    };
  }

  _collectQuery(candidateKeys, query, project) {
    const start = performance.now();
    const seen = new Set();
    const results = [];
    let duplicateCandidates = 0;
    let maskRejects = 0;
    let stateRejects = 0;
    const lifecycleStates = new Set(query.lifecycleStates || ACTIVE_LIFECYCLE_STATES);
    const collisionMask = query.collisionMask === undefined ? null : resolveMask(query.collisionMask, BODY_MASKS.NONE);
    const interactionMask = query.interactionMask === undefined ? null : resolveMask(query.interactionMask, BODY_MASKS.NONE);
    const anyMask = query.mask === undefined ? null : resolveMask(query.mask, BODY_MASKS.NONE);

    for (const key of candidateKeys) {
      if (seen.has(key)) {
        duplicateCandidates += 1;
        continue;
      }
      seen.add(key);
      const record = this.records.get(key);
      if (!record) continue;
      if (!lifecycleStates.has(record.lifecycleState)) {
        stateRejects += 1;
        continue;
      }
      if (collisionMask !== null && (record.collisionMask & collisionMask) === 0) {
        maskRejects += 1;
        continue;
      }
      if (interactionMask !== null && (record.interactionMask & interactionMask) === 0) {
        maskRejects += 1;
        continue;
      }
      if (anyMask !== null && ((record.collisionMask | record.interactionMask) & anyMask) === 0) {
        maskRejects += 1;
        continue;
      }
      const hit = project(record);
      if (!hit) continue;
      results.push({
        id: record.id,
        category: record.category,
        handle: cloneHandle(record.handle),
        body: record.body,
        distance: hit.distance,
        dx: hit.dx,
        dy: hit.dy,
      });
    }

    results.sort(compareQueryResults);
    const limited = Number.isFinite(query.limit) ? results.slice(0, Math.max(0, Math.trunc(query.limit))) : results;
    const elapsedMs = performance.now() - start;
    this._stats.queryCount += 1;
    this._stats.candidateCount += seen.size;
    this._stats.hitCount += limited.length;
    this._stats.maskRejects += maskRejects;
    this._stats.stateRejects += stateRejects;
    this._stats.duplicateCandidates += duplicateCandidates;
    this._stats.lastQueryMs = elapsedMs;
    this._stats.totalQueryMs += elapsedMs;
    return limited;
  }

  _removeFromCells(key) {
    const cellIds = this.recordCells.get(key) || [];
    for (const cellId of cellIds) this.cells[cellId]?.delete(key);
    this.recordCells.delete(key);
  }

  _candidateKeysForBox(wx, wy, halfWidth, halfHeight) {
    const keys = [];
    for (const cellId of this._cellsForWrappedBox(wx, wy, halfWidth, halfHeight)) {
      for (const key of this.cells[cellId]) keys.push(key);
    }
    return keys;
  }

  _cellsForWrappedBox(wx, wy, halfWidth, halfHeight) {
    const cols = this._axisCells(wx, halfWidth, this.columns);
    const rows = this._axisCells(wy, halfHeight, this.rows);
    const ids = new Set();
    for (const row of rows) {
      for (const col of cols) ids.add(row * this.columns + col);
    }
    return [...ids];
  }

  _axisCells(center, halfExtent, count) {
    if (halfExtent * 2 >= this.worldScale) {
      return Array.from({ length: count }, (_, index) => index);
    }
    const start = Math.floor((center - halfExtent) / this.cellSize);
    const end = Math.floor((center + halfExtent) / this.cellSize);
    const cells = new Set();
    for (let index = start; index <= end; index++) {
      cells.add(((index % count) + count) % count);
    }
    return [...cells];
  }
}

module.exports = {
  SpatialIndex,
  worldDelta,
  worldDistance,
  compareQueryResults,
};
