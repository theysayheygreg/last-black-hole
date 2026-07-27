"use strict";

// Vertical 1 owns only the bounded Glitch ecology. Swarm/Vessel values stay
// out of this module until their migration verticals own the collection.
const INHIBITOR_ECOLOGY_CONFIG = Object.freeze({
  compatibilityRemoval: "vertical-4",
  glitch: Object.freeze({
    kind: "glitch",
    populationCap: 6,
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

function applyGlitchForcesAndContacts(entities, players, {
  dt = 0,
  worldScale = 1,
  tick = 0,
} = {}) {
  const contacts = [];
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
        player.vx += (dx / distance) * glitch.fabricForceStrength * falloff * step;
        player.vy += (dy / distance) * glitch.fabricForceStrength * falloff * step;
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
  return contacts;
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

module.exports = {
  INHIBITOR_ECOLOGY_CONFIG,
  createGlitchEntity,
  advanceGlitchEntity,
  applyGlitchForcesAndContacts,
  projectGlitchEntity,
  wrap,
  toroidalDelta,
};
