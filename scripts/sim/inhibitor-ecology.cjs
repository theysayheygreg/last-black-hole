"use strict";

const { simUnitsToMeters } = require("../content/units.cjs");
const { NOISE_CONFIG, resolveThreatWarningBudget } = require("./noise-radius.cjs");
const INHIBITOR_ECOLOGY_DATA = require("../../src/content/inhibitor-ecology.data.json");

const POPULATION_CONFIG = INHIBITOR_ECOLOGY_DATA.population;

const SWARM_NOISE_THRESHOLDS = Object.freeze({
  lightMeters: NOISE_CONFIG.continuous.withFlowMeters,
  heavyMeters: NOISE_CONFIG.continuous.againstFlowMeters,
  flareMeters: NOISE_CONFIG.impulses.forcePulseMeters,
});

// The ecology owner keeps per-kind tuning and entity behavior together. The
// Conductor still owns when a kind is admitted; this module owns what lives.
const INHIBITOR_ECOLOGY_CONFIG = Object.freeze({
  totalActiveCap: POPULATION_CONFIG.totalActiveCap,
  glitch: Object.freeze({
    kind: "glitch",
    populationCap: POPULATION_CONFIG.kindCaps.glitch,
    spawnCadenceSeconds: 12,
    lifetimeSeconds: 60,
    radius: 0.1,
    coreRadius: 0.045,
    coreDamage: 0.25,
    fabricForceRadius: 0.18,
    fabricForceStrength: 0.018,
    driftSpeed: 0.018,
    driftWobble: 0.008,
    contactCooldownSeconds: 0.8,
    maxDamage: 1,
  }),
  swarm: Object.freeze({
    kind: "swarm",
    populationCap: POPULATION_CONFIG.kindCaps.swarm,
    spawnCadenceSeconds: 18,
    lifetimeSeconds: 120,
    radius: 0.25,
    contactRadius: 0.09,
    speedSilent: 0.25,
    speedLight: 0.6,
    speedHeavy: 1.1,
    speedFlare: 1.6,
    trackingIntervalSeconds: 3,
    searchTimeoutSeconds: 5,
    searchRadiusMin: 0.08,
    searchRadiusMax: 0.65,
    searchRadiusRate: 0.025,
    searchTurnRate: 1.4,
    warningBudget: Object.freeze(resolveThreatWarningBudget("swarm", {
      closureSpeedMetersPerSecond: 2450,
      lethalDistanceMeters: 90,
    })),
    hullDamage: 0.6,
    contactCooldownSeconds: 0.8,
    maxDamage: 1,
    presentation: Object.freeze({
      family: "inhibitor-swarm",
      palette: "magenta-fabric",
      identity: "noise-hunting-fabric",
    }),
  }),
  vessel: Object.freeze({
    kind: "vessel",
    populationCap: POPULATION_CONFIG.kindCaps.vessel,
    spawnCadenceSeconds: 24,
    inboundTellSeconds: 3,
    radius: 0.3,
    coreRadius: 0.075,
    outerDamageRadius: 0.18,
    outerDamage: 0.35,
    contactCooldownSeconds: 1,
    speed: 0.5,
    gravityRange: 0.32,
    gravityStrength: 0.16,
    wellOverdriveRange: 0.12,
    tierCap: 3,
    overdriveMultiplierPerTier: 1.18,
    massMultiplierPerTier: 1.18,
    forceMultiplierPerTier: 1.18,
    warningBudget: Object.freeze(resolveThreatWarningBudget("vessel", {
      closureSpeedMetersPerSecond: 1350,
      lethalDistanceMeters: 75,
    })),
    slingshotMultiplierPerTier: 1.18,
    presentation: Object.freeze({
      family: "inhibitor-vessel",
      palette: "procedural-magenta",
      identity: "strategic-anti-fluid-vessel",
    }),
  }),
});

function finite(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, finite(value, min)));
}

function wrap(value, worldScale) {
  const scale = Math.max(0.001, finite(worldScale, 1));
  return ((finite(value) % scale) + scale) % scale;
}

function toroidalDelta(from, to, worldScale) {
  const scale = Math.max(0.001, finite(worldScale, 1));
  let delta = finite(to) - finite(from);
  const half = scale / 2;
  if (delta > half) delta -= scale;
  if (delta < -half) delta += scale;
  return delta;
}

function countLiveGlitches(entities, kind = INHIBITOR_ECOLOGY_CONFIG.glitch.kind) {
  return Array.from(entities || []).filter((entity) =>
    entity?.kind === kind && entity.lifecycle !== "expired"
  ).length;
}

function shouldSpawnGlitch({ phase, simTime, nextSpawnAt, entities, config = INHIBITOR_ECOLOGY_CONFIG.glitch, totalActiveCap = INHIBITOR_ECOLOGY_CONFIG.totalActiveCap } = {}) {
  return Number(phase) >= 1
    && Number(simTime) >= Number(nextSpawnAt)
    && countLiveGlitches(entities, config.kind) < config.populationCap
    && countLiveInhibitors(entities) < totalActiveCap;
}

function countLiveEntities(entities, kind = null) {
  return Array.from(entities || []).filter((entity) =>
    (kind == null || entity?.kind === kind) && entity.lifecycle !== "expired"
  ).length;
}

function countLiveInhibitors(entities) {
  return countLiveEntities(entities);
}

function totalCapBlocksSpawn(entities, config = {}, totalActiveCap = INHIBITOR_ECOLOGY_CONFIG.totalActiveCap) {
  return countLiveInhibitors(entities) >= totalActiveCap
    && countLiveEntities(entities, config.kind) < config.populationCap;
}

function countLiveSwarms(entities, kind = INHIBITOR_ECOLOGY_CONFIG.swarm.kind) {
  return countLiveEntities(entities, kind);
}

function countLiveVessels(entities, kind = INHIBITOR_ECOLOGY_CONFIG.vessel.kind) {
  return countLiveEntities(entities, kind);
}

function shouldSpawnSwarm({ phase, simTime, nextSpawnAt, entities, config = INHIBITOR_ECOLOGY_CONFIG.swarm, totalActiveCap = INHIBITOR_ECOLOGY_CONFIG.totalActiveCap } = {}) {
  return Number(phase) >= 2
    && Number(simTime) >= Number(nextSpawnAt)
    && countLiveSwarms(entities, config.kind) < config.populationCap
    && countLiveInhibitors(entities) < totalActiveCap;
}

function shouldSpawnVessel({ phase, simTime, nextSpawnAt, entities, config = INHIBITOR_ECOLOGY_CONFIG.vessel, totalActiveCap = INHIBITOR_ECOLOGY_CONFIG.totalActiveCap } = {}) {
  return Number(phase) >= 3
    && Number(simTime) >= Number(nextSpawnAt)
    && countLiveVessels(entities, config.kind) < config.populationCap
    && countLiveInhibitors(entities) < totalActiveCap;
}

function createGlitchEntity({
  id,
  wx,
  wy,
  vx = 0,
  vy = 0,
  driftPhase = 0,
  createdAt = 0,
  createdTick = 0,
  config = INHIBITOR_ECOLOGY_CONFIG.glitch,
} = {}) {
  if (!String(id || "").trim()) throw new Error("Glitch id is required");
  return {
    id: String(id),
    kind: config.kind,
    lifecycle: "spawning",
    createdAt: finite(createdAt),
    changedAt: finite(createdAt),
    createdTick: Math.max(0, Math.trunc(finite(createdTick))),
    changedTick: Math.max(0, Math.trunc(finite(createdTick))),
    ageSeconds: 0,
    localTime: 0,
    wx: finite(wx),
    wy: finite(wy),
    prevWX: finite(wx),
    prevWY: finite(wy),
    vx: finite(vx),
    vy: finite(vy),
    driftPhase: finite(driftPhase),
    driftWobble: finite(config.driftWobble),
    radius: Math.max(0, finite(config.radius)),
    coreRadius: Math.max(0, finite(config.coreRadius)),
    coreDamage: Math.max(0, finite(config.coreDamage)),
    fabricForceRadius: Math.max(0, finite(config.fabricForceRadius)),
    fabricForceStrength: Math.max(0, finite(config.fabricForceStrength)),
    lifetimeSeconds: Math.max(0, finite(config.lifetimeSeconds)),
    contactCooldownSeconds: Math.max(0, finite(config.contactCooldownSeconds)),
    maxDamage: Math.max(0, finite(config.maxDamage, 1)),
    intensity: 0,
    listensToNoise: false,
    noiseListenerState: "NONE",
    contactCooldowns: Object.create(null),
  };
}

function advanceGlitchEntity(entity, {
  dt = 0,
  worldScale = 1,
  tick = 0,
  simTime = 0,
  config = INHIBITOR_ECOLOGY_CONFIG.glitch,
} = {}) {
  if (!entity || entity.lifecycle === "expired") return false;
  const step = Math.max(0, finite(dt));
  entity.prevWX = entity.wx;
  entity.prevWY = entity.wy;
  entity.ageSeconds = Math.max(0, finite(entity.ageSeconds) + step);
  entity.localTime = entity.ageSeconds;
  entity.intensity = clamp(entity.ageSeconds / 1.5, 0, 1);

  if (entity.lifecycle === "spawning") {
    entity.lifecycle = "alive";
    entity.changedAt = finite(simTime);
    entity.changedTick = Math.max(0, Math.trunc(finite(tick)));
  }

  if (entity.lifecycle === "alive") {
    const wobble = Math.sin(entity.ageSeconds * 1.7 + finite(entity.driftPhase)) * finite(entity.driftWobble);
    entity.wx = wrap(entity.wx + (entity.vx + wobble) * step, worldScale);
    entity.wy = wrap(entity.wy + (entity.vy + Math.cos(entity.ageSeconds * 1.3 + finite(entity.driftPhase)) * finite(entity.driftWobble)) * step, worldScale);
    if (entity.ageSeconds >= finite(entity.lifetimeSeconds)) {
      entity.lifecycle = "expired";
      entity.changedAt = finite(simTime);
      entity.changedTick = Math.max(0, Math.trunc(finite(tick)));
    }
    return true;
  }
  return entity.lifecycle !== "expired";
}

function resolveGlitchInfluence(entities, players, {
  dt = 0,
  worldScale = 1,
  tick = 0,
} = {}) {
  const contacts = [];
  const continuous = [];
  const step = Math.max(0, finite(dt));
  for (const glitch of entities || []) {
    if (!glitch || glitch.lifecycle !== "alive") continue;
    for (const player of players || []) {
      if (!player || player.status !== "alive") continue;
      const dx = toroidalDelta(glitch.wx, player.wx, worldScale);
      const dy = toroidalDelta(glitch.wy, player.wy, worldScale);
      const distance = Math.hypot(dx, dy);
      if (distance > 0 && distance < glitch.fabricForceRadius) {
        const falloff = 1 - distance / Math.max(0.001, glitch.fabricForceRadius);
        continuous.push({
          clientId: String(player.clientId || "unknown"),
          source: "glitch",
          entityId: glitch.id,
          x: (dx / distance) * glitch.fabricForceStrength * falloff,
          y: (dy / distance) * glitch.fabricForceStrength * falloff,
        });
      }

      const playerId = String(player.clientId || "unknown");
      const previousCooldown = Math.max(0, finite(glitch.contactCooldowns[playerId]));
      glitch.contactCooldowns[playerId] = Math.max(0, previousCooldown - step);
      if (distance > glitch.coreRadius || glitch.contactCooldowns[playerId] > 0) continue;

      const before = clamp(player.hullDamage, 0, glitch.maxDamage ?? 1);
      const after = clamp(before + glitch.coreDamage, 0, glitch.maxDamage ?? 1);
      player.hullDamage = after;
      glitch.contactCooldowns[playerId] = Math.max(0, finite(glitch.contactCooldownSeconds));
      contacts.push({
        entityId: glitch.id,
        clientId: playerId,
        damage: after - before,
        totalDamage: after,
        lethal: after >= (glitch.maxDamage ?? 1),
        tick: Math.max(0, Math.trunc(finite(tick))),
      });
    }
  }
  return { contacts, continuous };
}

function projectGlitchEntity(entity) {
  return {
    id: entity.id,
    kind: entity.kind,
    lifecycle: entity.lifecycle,
    createdTick: entity.createdTick,
    changedTick: entity.changedTick,
    ageSeconds: Math.max(0, finite(entity.ageSeconds)),
    wx: finite(entity.wx),
    wy: finite(entity.wy),
    vx: finite(entity.vx),
    vy: finite(entity.vy),
    radius: Math.max(0, finite(entity.radius)),
    coreRadius: Math.max(0, finite(entity.coreRadius)),
    intensity: clamp(entity.intensity, 0, 1),
    age: Math.max(0, finite(entity.ageSeconds)),
    ageSeconds: Math.max(0, finite(entity.ageSeconds)),
    lifetime: Math.max(0, finite(entity.lifetimeSeconds)),
    lifetimeSeconds: Math.max(0, finite(entity.lifetimeSeconds)),
    position: { wx: finite(entity.wx), wy: finite(entity.wy) },
    listensToNoise: false,
    noiseListenerState: "NONE",
    presentation: {
      family: "inhibitor-glitch",
      palette: "magenta-fabric-corruption",
      core: "damaging",
    },
  };
}

function selectSwarmNoiseSource(entity, noiseSources, worldScale) {
  return Array.from(noiseSources || [])
    .filter((source) => source && Number(source.radiusMeters) > 0)
    .map((source) => ({
      source,
      distance: Math.hypot(
        toroidalDelta(entity.wx, source.wx, worldScale),
        toroidalDelta(entity.wy, source.wy, worldScale),
      ),
    }))
    .filter(({ source, distance }) => {
      const distanceMeters = simUnitsToMeters(distance);
      return distanceMeters <= Number(source.radiusMeters);
    })
    .sort((a, b) => Number(b.source.radiusMeters) - Number(a.source.radiusMeters)
      || a.distance - b.distance)
    .map(({ source }) => source)[0] || null;
}

function moveSwarmEntity(entity, targetWX, targetWY, speed, dt, worldScale) {
  const dx = toroidalDelta(entity.wx, targetWX, worldScale);
  const dy = toroidalDelta(entity.wy, targetWY, worldScale);
  const distance = Math.hypot(dx, dy);
  if (distance <= 0.01) {
    entity.vx = 0;
    entity.vy = 0;
    return;
  }
  entity.vx = (dx / distance) * speed;
  entity.vy = (dy / distance) * speed;
  entity.wx = wrap(entity.wx + entity.vx * dt, worldScale);
  entity.wy = wrap(entity.wy + entity.vy * dt, worldScale);
}

function setSwarmSearchTarget(entity, dt, worldScale, config = INHIBITOR_ECOLOGY_CONFIG.swarm) {
  entity.searchTimer = Math.max(0, finite(entity.searchTimer) + Math.max(0, finite(dt)));
  entity.searchAngle = finite(entity.searchAngle) + finite(config.searchTurnRate) * Math.max(0, finite(dt));
  const searchAge = Math.max(0, entity.searchTimer - finite(config.searchTimeoutSeconds));
  const radius = Math.min(
    finite(config.searchRadiusMax),
    finite(config.searchRadiusMin) + searchAge * finite(config.searchRadiusRate),
  );
  const centerX = Number.isFinite(entity.lastHeardWX) ? entity.lastHeardWX : entity.targetWX;
  const centerY = Number.isFinite(entity.lastHeardWY) ? entity.lastHeardWY : entity.targetWY;
  entity.targetWX = wrap(centerX + Math.cos(entity.searchAngle) * radius, worldScale);
  entity.targetWY = wrap(centerY + Math.sin(entity.searchAngle) * radius, worldScale);
}

function resolveSwarmSpeed(noiseRadiusMeters, config = INHIBITOR_ECOLOGY_CONFIG.swarm) {
  const radius = Math.max(0, finite(noiseRadiusMeters));
  const thresholds = config.noiseThresholds || SWARM_NOISE_THRESHOLDS;
  if (radius >= finite(thresholds.flareMeters, SWARM_NOISE_THRESHOLDS.flareMeters)) return finite(config.speedFlare);
  if (radius >= finite(thresholds.heavyMeters, SWARM_NOISE_THRESHOLDS.heavyMeters)) return finite(config.speedHeavy);
  if (radius >= finite(thresholds.lightMeters, SWARM_NOISE_THRESHOLDS.lightMeters)) return finite(config.speedLight);
  if (radius > 0) return finite(config.speedLight);
  return finite(config.speedSilent);
}

function createSwarmEntity({
  id,
  wx,
  wy,
  targetWX = wx,
  targetWY = wy,
  searchAngle = 0,
  createdAt = 0,
  createdTick = 0,
  config = INHIBITOR_ECOLOGY_CONFIG.swarm,
} = {}) {
  if (!String(id || "").trim()) throw new Error("Swarm id is required");
  return {
    id: String(id),
    kind: config.kind,
    lifecycle: "spawning",
    createdAt: finite(createdAt),
    changedAt: finite(createdAt),
    createdTick: Math.max(0, Math.trunc(finite(createdTick))),
    changedTick: Math.max(0, Math.trunc(finite(createdTick))),
    ageSeconds: 0,
    localTime: 0,
    wx: finite(wx),
    wy: finite(wy),
    prevWX: finite(wx),
    prevWY: finite(wy),
    vx: 0,
    vy: 0,
    targetWX: finite(targetWX),
    targetWY: finite(targetWY),
    lastHeardWX: null,
    lastHeardWY: null,
    lastHeardAgeSeconds: 0,
    trackTimer: 0,
    searchTimer: 0,
    searchAngle: finite(searchAngle),
    radius: Math.max(0, finite(config.radius)),
    contactRadius: Math.max(0, finite(config.contactRadius)),
    hullDamage: Math.max(0, finite(config.hullDamage)),
    lifetimeSeconds: Math.max(0, finite(config.lifetimeSeconds)),
    contactCooldownSeconds: Math.max(0, finite(config.contactCooldownSeconds)),
    maxDamage: Math.max(0, finite(config.maxDamage, 1)),
    intensity: 0,
    listensToNoise: true,
    noiseListenerState: "QUIET",
    noiseSearchState: "IDLE",
    contactCooldowns: Object.create(null),
  };
}

function advanceSwarmEntity(entity, {
  dt = 0,
  worldScale = 1,
  tick = 0,
  simTime = 0,
  noiseSources = [],
  config = INHIBITOR_ECOLOGY_CONFIG.swarm,
} = {}) {
  if (!entity || entity.lifecycle === "expired") return false;
  const step = Math.max(0, finite(dt));
  entity.prevWX = entity.wx;
  entity.prevWY = entity.wy;
  entity.ageSeconds = Math.max(0, finite(entity.ageSeconds) + step);
  entity.localTime = entity.ageSeconds;
  entity.intensity = clamp(entity.ageSeconds / 1.5, 0, 1);
  if (entity.lifecycle === "spawning") {
    entity.lifecycle = "alive";
    entity.changedAt = finite(simTime);
    entity.changedTick = Math.max(0, Math.trunc(finite(tick)));
  }

  const source = selectSwarmNoiseSource(entity, noiseSources, worldScale);
  entity.noiseListenerState = "QUIET";
  entity.noiseSearchState = "IDLE";
  if (source) {
    entity.lastHeardWX = finite(source.wx);
    entity.lastHeardWY = finite(source.wy);
    entity.lastHeardAgeSeconds = 0;
    entity.searchTimer = 0;
    entity.trackTimer = Math.max(0, finite(entity.trackTimer) + step);
    entity.noiseListenerState = "HEARD";
    entity.noiseSearchState = "LISTENING";
    if (entity.trackTimer >= finite(config.trackingIntervalSeconds)) {
      entity.targetWX = finite(source.wx);
      entity.targetWY = finite(source.wy);
      entity.trackTimer = 0;
      entity.noiseListenerState = "TRACKING";
      entity.noiseSearchState = "TRACKING";
    }
  } else {
    entity.lastHeardAgeSeconds = Math.min(999, finite(entity.lastHeardAgeSeconds) + step);
    if (entity.searchTimer + step >= finite(config.searchTimeoutSeconds)) {
      entity.noiseListenerState = "INVESTIGATING";
      entity.noiseSearchState = "SEARCHING";
      setSwarmSearchTarget(entity, step, worldScale, config);
    } else {
      entity.searchTimer = Math.max(0, finite(entity.searchTimer) + step);
    }
  }

  const speed = resolveSwarmSpeed(source?.radiusMeters, config);
  moveSwarmEntity(entity, entity.targetWX, entity.targetWY, speed, step, worldScale);
  if (entity.ageSeconds >= finite(entity.lifetimeSeconds)) {
    entity.lifecycle = "expired";
    entity.changedAt = finite(simTime);
    entity.changedTick = Math.max(0, Math.trunc(finite(tick)));
  }
  return entity.lifecycle !== "expired";
}

function applySwarmContacts(entities, players, { dt = 0, worldScale = 1, tick = 0 } = {}) {
  const contacts = [];
  const step = Math.max(0, finite(dt));
  for (const swarm of entities || []) {
    if (!swarm || swarm.kind !== "swarm" || swarm.lifecycle !== "alive") continue;
    for (const player of players || []) {
      if (!player || player.status !== "alive") continue;
      const distance = Math.hypot(
        toroidalDelta(swarm.wx, player.wx, worldScale),
        toroidalDelta(swarm.wy, player.wy, worldScale),
      );
      const playerId = String(player.clientId || "unknown");
      swarm.contactCooldowns[playerId] = Math.max(0,
        finite(swarm.contactCooldowns[playerId]) - step);
      if (distance > swarm.contactRadius || swarm.contactCooldowns[playerId] > 0) continue;
      const before = clamp(player.hullDamage, 0, swarm.maxDamage);
      const after = clamp(before + swarm.hullDamage, 0, swarm.maxDamage);
      player.hullDamage = after;
      swarm.contactCooldowns[playerId] = Math.max(0, finite(swarm.contactCooldownSeconds));
      contacts.push({
        entityId: swarm.id,
        clientId: playerId,
        damage: after - before,
        totalDamage: after,
        lethal: after >= swarm.maxDamage,
        tick: Math.max(0, Math.trunc(finite(tick))),
      });
    }
  }
  return contacts;
}

function projectSwarmEntity(entity) {
  return {
    id: entity.id,
    kind: entity.kind,
    lifecycle: entity.lifecycle,
    createdTick: entity.createdTick,
    changedTick: entity.changedTick,
    ageSeconds: Math.max(0, finite(entity.ageSeconds)),
    wx: finite(entity.wx),
    wy: finite(entity.wy),
    vx: finite(entity.vx),
    vy: finite(entity.vy),
    radius: Math.max(0, finite(entity.radius)),
    contactRadius: Math.max(0, finite(entity.contactRadius)),
    intensity: clamp(entity.intensity, 0, 1),
    age: Math.max(0, finite(entity.ageSeconds)),
    lifetime: Math.max(0, finite(entity.lifetimeSeconds)),
    position: { wx: finite(entity.wx), wy: finite(entity.wy) },
    target: { wx: finite(entity.targetWX), wy: finite(entity.targetWY) },
    lastHeard: Number.isFinite(entity.lastHeardWX) ? {
      wx: finite(entity.lastHeardWX),
      wy: finite(entity.lastHeardWY),
      ageSeconds: Math.max(0, finite(entity.lastHeardAgeSeconds)),
    } : null,
    listensToNoise: true,
    noiseListenerState: entity.noiseListenerState || "QUIET",
    noiseSearchState: entity.noiseSearchState || "IDLE",
    presentation: {
      ...INHIBITOR_ECOLOGY_CONFIG.swarm.presentation,
      core: "damaging",
    },
  };
}

function resolveVesselEdgeSpawn({ edge = "top", edgeProgress = 0.5, worldScale = 1, inset = 0.001, speed = 0.07 } = {}) {
  const scale = Math.max(0.001, finite(worldScale, 1));
  const progress = clamp(edgeProgress, 0, 1);
  const margin = clamp(inset, 0, scale / 2);
  const velocity = Math.max(0, finite(speed));
  switch (String(edge).toLowerCase()) {
    case "right":
      return { wx: scale - margin, wy: progress * scale, vx: -velocity, vy: 0, edge: "right" };
    case "bottom":
      return { wx: progress * scale, wy: scale - margin, vx: 0, vy: -velocity, edge: "bottom" };
    case "left":
      return { wx: margin, wy: progress * scale, vx: velocity, vy: 0, edge: "left" };
    case "top":
    default:
      return { wx: progress * scale, wy: margin, vx: 0, vy: velocity, edge: "top" };
  }
}

function selectNearestAliveTarget(entity, players, worldScale) {
  const alive = Array.from(players || [])
    .filter((player) => player && player.status === "alive")
  // Vessels are a player-facing strategic threat. In solo sessions, AI pilots
  // remain ambient traffic and must not steal the Vessel's authored target.
  const humanTargets = alive.filter((player) => !player.isAI);
  const targets = humanTargets.length > 0 ? humanTargets : alive;
  return targets
    .map((player) => ({
      player,
      distance: Math.hypot(
        toroidalDelta(entity.wx, player.wx, worldScale),
        toroidalDelta(entity.wy, player.wy, worldScale),
      ),
    }))
    .sort((a, b) => a.distance - b.distance
      || String(a.player.clientId || "").localeCompare(String(b.player.clientId || "")))
    .map(({ player }) => player)[0] || null;
}

function createVesselEntity({
  id,
  edge = null,
  edgeProgress = 0.5,
  worldScale = 1,
  wx,
  wy,
  vx = 0,
  vy = 0,
  targetWX = wx,
  targetWY = wy,
  createdAt = 0,
  createdTick = 0,
  config = INHIBITOR_ECOLOGY_CONFIG.vessel,
} = {}) {
  if (!String(id || "").trim()) throw new Error("Vessel id is required");
  const edgeSpawn = edge == null ? null : resolveVesselEdgeSpawn({
    edge,
    edgeProgress,
    worldScale,
    speed: config.speed,
  });
  const spawnWX = edgeSpawn ? edgeSpawn.wx : finite(wx);
  const spawnWY = edgeSpawn ? edgeSpawn.wy : finite(wy);
  return {
    id: String(id),
    kind: config.kind,
    lifecycle: "inbound",
    createdAt: finite(createdAt),
    changedAt: finite(createdAt),
    createdTick: Math.max(0, Math.trunc(finite(createdTick))),
    changedTick: Math.max(0, Math.trunc(finite(createdTick))),
    ageSeconds: 0,
    localTime: 0,
    wx: spawnWX,
    wy: spawnWY,
    prevWX: spawnWX,
    prevWY: spawnWY,
    vx: edgeSpawn ? edgeSpawn.vx : finite(vx),
    vy: edgeSpawn ? edgeSpawn.vy : finite(vy),
    edge: edgeSpawn?.edge || null,
    edgeProgress: clamp(edgeProgress, 0, 1),
    targetWX: finite(targetWX, spawnWX),
    targetWY: finite(targetWY, spawnWY),
    targetClientId: null,
    awareness: "STRATEGIC",
    inboundTellSeconds: Math.max(0, finite(config.inboundTellSeconds)),
    inboundRemainingSeconds: Math.max(0, finite(config.inboundTellSeconds)),
    radius: Math.max(0, finite(config.radius)),
    coreRadius: Math.max(0, finite(config.coreRadius)),
    outerDamageRadius: Math.max(0, finite(config.outerDamageRadius)),
    outerDamage: Math.max(0, finite(config.outerDamage)),
    gravityRange: Math.max(0, finite(config.gravityRange)),
    gravityStrength: Math.max(0, finite(config.gravityStrength)),
    wellOverdriveRange: Math.max(0, finite(config.wellOverdriveRange)),
    speed: Math.max(0, finite(config.speed)),
    contactCooldownSeconds: Math.max(0, finite(config.contactCooldownSeconds)),
    tierCap: Math.max(0, Math.trunc(finite(config.tierCap, 3))),
    overdriveMultiplierPerTier: Math.max(1, finite(config.overdriveMultiplierPerTier, 1.18)),
    intensity: 0,
    listensToNoise: false,
    noiseListenerState: "NONE",
    contactCooldowns: Object.create(null),
    overdriveWellIds: new Set(),
  };
}

function advanceVesselEntity(entity, {
  dt = 0,
  worldScale = 1,
  tick = 0,
  simTime = 0,
  players = [],
} = {}) {
  if (!entity || entity.lifecycle === "expired") return false;
  const step = Math.max(0, finite(dt));
  entity.prevWX = entity.wx;
  entity.prevWY = entity.wy;
  entity.ageSeconds = Math.max(0, finite(entity.ageSeconds) + step);
  entity.localTime = entity.ageSeconds;
  entity.intensity = clamp(entity.ageSeconds / 1.5, 0, 1);
  entity.awareness = "STRATEGIC";
  entity.listensToNoise = false;
  entity.noiseListenerState = "NONE";

  const target = selectNearestAliveTarget(entity, players, worldScale);
  if (target) {
    entity.targetClientId = String(target.clientId || "");
    entity.targetWX = finite(target.wx);
    entity.targetWY = finite(target.wy);
  }
  const dx = toroidalDelta(entity.wx, entity.targetWX, worldScale);
  const dy = toroidalDelta(entity.wy, entity.targetWY, worldScale);
  const distance = Math.hypot(dx, dy);
  if (distance > 0.001) {
    entity.vx = (dx / distance) * entity.speed;
    entity.vy = (dy / distance) * entity.speed;
    entity.wx = wrap(entity.wx + entity.vx * step, worldScale);
    entity.wy = wrap(entity.wy + entity.vy * step, worldScale);
  } else {
    entity.vx = 0;
    entity.vy = 0;
  }

  entity.inboundRemainingSeconds = Math.max(0, entity.inboundTellSeconds - entity.ageSeconds);
  if (entity.lifecycle === "inbound" && entity.ageSeconds >= entity.inboundTellSeconds) {
    entity.lifecycle = "alive";
    entity.changedAt = finite(simTime);
    entity.changedTick = Math.max(0, Math.trunc(finite(tick)));
  }
  return entity.lifecycle !== "expired";
}

function resolveVesselInfluence(entities, players, {
  dt = 0,
  worldScale = 1,
  tick = 0,
} = {}) {
  const contacts = [];
  const continuous = [];
  const step = Math.max(0, finite(dt));
  for (const vessel of entities || []) {
    if (!vessel || vessel.kind !== "vessel" || vessel.lifecycle !== "alive") continue;
    for (const player of players || []) {
      if (!player || player.status !== "alive") continue;
      const dx = toroidalDelta(player.wx, vessel.wx, worldScale);
      const dy = toroidalDelta(player.wy, vessel.wy, worldScale);
      const distance = Math.hypot(dx, dy);
      if (distance > 0 && distance < vessel.gravityRange) {
        const falloff = 1 - distance / Math.max(0.001, vessel.gravityRange);
        continuous.push({
          clientId: String(player.clientId || "unknown"),
          source: "vessel",
          entityId: vessel.id,
          x: (dx / distance) * vessel.gravityStrength * falloff,
          y: (dy / distance) * vessel.gravityStrength * falloff,
        });
      }

      const playerId = String(player.clientId || "unknown");
      vessel.contactCooldowns[playerId] = Math.max(0,
        finite(vessel.contactCooldowns[playerId]) - step);
      if (distance > vessel.outerDamageRadius || vessel.contactCooldowns[playerId] > 0) continue;

      const before = clamp(player.hullDamage, 0, 1);
      const core = distance <= vessel.coreRadius;
      const after = core ? 1 : clamp(before + vessel.outerDamage, 0, 1);
      player.hullDamage = after;
      vessel.contactCooldowns[playerId] = Math.max(0, finite(vessel.contactCooldownSeconds));
      contacts.push({
        entityId: vessel.id,
        clientId: playerId,
        damage: after - before,
        totalDamage: after,
        instantKill: core,
        lethal: core || after >= 1,
        tick: Math.max(0, Math.trunc(finite(tick))),
      });
    }
  }
  return { contacts, continuous };
}

function projectVesselEntity(entity) {
  return {
    id: entity.id,
    kind: entity.kind,
    lifecycle: entity.lifecycle,
    createdTick: entity.createdTick,
    changedTick: entity.changedTick,
    ageSeconds: Math.max(0, finite(entity.ageSeconds)),
    wx: finite(entity.wx),
    wy: finite(entity.wy),
    vx: finite(entity.vx),
    vy: finite(entity.vy),
    radius: Math.max(0, finite(entity.radius)),
    coreRadius: Math.max(0, finite(entity.coreRadius)),
    outerDamageRadius: Math.max(0, finite(entity.outerDamageRadius)),
    inbound: {
      edge: entity.edge,
      tellSeconds: Math.max(0, finite(entity.inboundTellSeconds)),
      remainingSeconds: Math.max(0, finite(entity.inboundRemainingSeconds)),
    },
    target: {
      clientId: entity.targetClientId,
      wx: finite(entity.targetWX),
      wy: finite(entity.targetWY),
    },
    awareness: "STRATEGIC",
    listensToNoise: false,
    noiseListenerState: "NONE",
    intensity: clamp(entity.intensity, 0, 1),
    position: { wx: finite(entity.wx), wy: finite(entity.wy) },
    presentation: { ...INHIBITOR_ECOLOGY_CONFIG.vessel.presentation, core: "instant-kill" },
  };
}

function deriveWellOverdriveMultiplier(tier, config = INHIBITOR_ECOLOGY_CONFIG.vessel) {
  const cap = Math.max(0, Math.trunc(finite(config.tierCap, 3)));
  const boundedTier = Math.max(0, Math.min(cap, Math.trunc(finite(tier))));
  const perTier = Math.max(1, finite(config.overdriveMultiplierPerTier, 1.18));
  return Math.pow(perTier, boundedTier);
}

function applyWellOverdrive(wellOrOptions, maybeOptions = {}) {
  const options = arguments.length === 1 && wellOrOptions?.well
    ? wellOrOptions
    : { ...maybeOptions, well: wellOrOptions };
  const well = options.well;
  if (!well || typeof well !== "object") throw new TypeError("well is required");
  const config = options.config || INHIBITOR_ECOLOGY_CONFIG.vessel;
  const previousTier = Math.max(0, Math.trunc(finite(well.overdriveTier)));
  const nextTier = Math.min(Math.max(0, Math.trunc(finite(config.tierCap, 3))), previousTier + 1);
  const multiplier = deriveWellOverdriveMultiplier(nextTier, config);
  const source = String(options.source || "inhibitor-vessel");
  const time = finite(options.time, 0);
  const after = {
    overdriveTier: nextTier,
    overdriveMultiplier: multiplier,
    overdriveSource: source,
    overdriveTime: time,
  };
  return {
    changed: nextTier > previousTier,
    before: {
      overdriveTier: previousTier,
      overdriveMultiplier: deriveWellOverdriveMultiplier(previousTier, config),
    },
    after,
    tier: nextTier,
    multiplier,
    source,
    time,
    overdriveTier: nextTier,
    overdriveMultiplier: multiplier,
    overdriveSource: source,
    overdriveTime: time,
    well: { ...well, ...after },
  };
}

function effectiveWellMass(well) {
  const baseMass = Math.max(0, finite(well?.mass, 1));
  const multiplier = Math.max(1, finite(well?.overdriveMultiplier, 1));
  return baseMass * multiplier;
}

function summarizeEcologyEncounters(ecology = {}) {
  const counts = {
    glitch: Math.max(0, Math.trunc(finite(ecology.glitchSequence))),
    swarm: Math.max(0, Math.trunc(finite(ecology.swarmSequence))),
    vessel: Math.max(0, Math.trunc(finite(ecology.vesselSequence))),
  };
  return {
    kinds: Object.keys(counts).filter((kind) => counts[kind] > 0).sort(),
    counts: Object.fromEntries(Object.entries(counts).filter(([, count]) => count > 0)),
  };
}

module.exports = {
  INHIBITOR_ECOLOGY_DATA,
  INHIBITOR_ECOLOGY_CONFIG,
  createGlitchEntity,
  advanceGlitchEntity,
  resolveGlitchInfluence,
  projectGlitchEntity,
  createSwarmEntity,
  advanceSwarmEntity,
  applySwarmContacts,
  projectSwarmEntity,
  countLiveGlitches,
  countLiveInhibitors,
  countLiveSwarms,
  countLiveVessels,
  totalCapBlocksSpawn,
  shouldSpawnGlitch,
  shouldSpawnSwarm,
  shouldSpawnVessel,
  resolveSwarmSpeed,
  SWARM_NOISE_THRESHOLDS,
  resolveVesselEdgeSpawn,
  selectNearestAliveTarget,
  createVesselEntity,
  advanceVesselEntity,
  resolveVesselInfluence,
  projectVesselEntity,
  deriveWellOverdriveMultiplier,
  applyWellOverdrive,
  effectiveWellMass,
  summarizeEcologyEncounters,
  wrap,
  toroidalDelta,
};
