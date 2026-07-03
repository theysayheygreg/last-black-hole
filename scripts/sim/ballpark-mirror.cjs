const { performance } = require("perf_hooks");
const { BODY_MASKS, maskNames } = require("./body-masks.cjs");
const { BODY_SCHEMA_VERSION, lifecycleStateIsActive } = require("./body-schema.cjs");
const { BodyRegistry } = require("./body-registry.cjs");
const { SpatialIndex } = require("./spatial-index.cjs");

const DEFAULT_WORLD_SCALE = 1;
const DEFAULT_CELL_SIZE = 0.25;

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

function createBodyAdder(registry, categories, skipped, duplicateIds, tick) {
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

    const handle = registry.createBody({
      ...input,
      id: uniqueId,
      wx,
      wy,
      radius: Math.max(0, finiteNumber(input.radius, 0)),
    }, { tick });
    registry.setLifecycle(handle, input.lifecycle?.state || "alive", { tick });
    categories[input.category] = (categories[input.category] || 0) + 1;
    return registry.getBody(handle);
  };
}

function createBallparkMirror(options = {}) {
  return new BallparkMirror(options);
}

class BallparkMirror {
  constructor(options = {}) {
    this.worldScale = positiveNumber(options.worldScale, DEFAULT_WORLD_SCALE);
    this.cellSize = positiveNumber(options.cellSize, DEFAULT_CELL_SIZE);
    this.registry = new BodyRegistry({ worldScale: this.worldScale });
    this.index = new SpatialIndex({ worldScale: this.worldScale, cellSize: this.cellSize });
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
    const registry = new BodyRegistry({ worldScale });
    const index = new SpatialIndex({ worldScale, cellSize });
    const categories = {};
    const skipped = {};
    const duplicateIds = [];
    const addBody = createBodyAdder(registry, categories, skipped, duplicateIds, tick);

    this._addPlayers(runtime, addBody);
    this._addWorldAnchors(runtime, addBody);
    this._addDynamicThreats(runtime, addBody);
    this._addWaveEmitters(runtime, addBody);
    this._addInhibitor(runtime, addBody);

    const bodies = registry.entries();
    index.rebuild(bodies);
    const activeBodyCount = bodies.filter((body) => lifecycleStateIsActive(body.lifecycle?.state)).length;

    this.worldScale = worldScale;
    this.cellSize = cellSize;
    this.registry = registry;
    this.index = index;
    this.lastStats = {
      enabled: true,
      schemaVersion: BODY_SCHEMA_VERSION,
      worldScale,
      cellSize,
      lastRebuildTick: tick,
      lastRebuildSimTime: finiteNumber(options.simTime ?? runtime?.simTime, 0),
      lastRebuildReason: String(options.reason || "runtime"),
      lastRebuildMs: Number((performance.now() - started).toFixed(3)),
      bodyCount: bodies.length,
      activeBodyCount,
      categories,
      skipped,
      duplicateIds,
      registry: registry.stats(),
      spatialIndex: index.stats(),
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
      queryUsage: this._cloneQueryUsage(),
    };
  }

  queryCircle(...args) {
    const before = this.index.stats();
    const started = performance.now();
    const hits = this.index.queryCircle(...args);
    this._recordQuery("queryCircle", before, hits, started);
    return hits;
  }

  nearest(...args) {
    const before = this.index.stats();
    const started = performance.now();
    const hits = this.index.nearest(...args);
    this._recordQuery("nearest", before, hits, started);
    return hits;
  }

  getBodyById(id) {
    return this.registry.getBodyById(id);
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
      bodyCount: 0,
      activeBodyCount: 0,
      categories: {},
      skipped: {},
      duplicateIds: [],
      registry: this.registry.stats(),
      spatialIndex: this.index.stats(),
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
        pressure: finiteNumber(inhibitor.pressure, 0),
      },
    });
  }
}

module.exports = {
  BallparkMirror,
  createBallparkMirror,
};
