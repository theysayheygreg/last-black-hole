import { CONFIG } from '../config.js';
import { normalizeScavengerPresentation } from '../scavengers.js';
import { normalizeStarPresentation } from '../stars.js';

// This boundary derives renderer-safe values only. main.js retains ordered
// presentation side effects and mutation of the long-lived runtime systems.
export function snapshotRunId(snapshot) {
  return snapshot?.runId || snapshot?.session?.runId || null;
}

export function classifyRemoteSnapshot(previous, incoming) {
  const previousRunId = snapshotRunId(previous);
  const incomingRunId = snapshotRunId(incoming);
  return {
    previousRunId,
    incomingRunId,
    runChanged: Boolean(previousRunId && incomingRunId && incomingRunId !== previousRunId),
    duplicate: Boolean(previous
      && incoming?.tick === previous.tick
      && incoming?.simTime === previous.simTime),
  };
}

export function projectRemoteSnapshot(snapshot, {
  clientId = null,
  previousHealth = null,
  elapsedTime = 0,
} = {}) {
  const players = Array.isArray(snapshot.players) ? snapshot.players : [];
  return {
    mapId: snapshot.session?.mapId,
    worldScale: Number(snapshot.session?.worldScale),
    runDurationSeconds: snapshot.session?.runDurationSeconds,
    cosmicSignature: snapshot.session?.cosmicSignature
      ? { ...snapshot.session.cosmicSignature }
      : null,
    health: {
      ok: true,
      session: snapshot.session ?? null,
      playerCount: players.length,
      idleState: {
        ...(previousHealth?.idleState || {}),
        humanPlayerCount: players.filter((player) => !player.isAI).length,
      },
      tick: snapshot.tick ?? null,
      simTime: snapshot.simTime ?? null,
    },
    elapsedTime: snapshot.simTime ?? elapsedTime,
    localPlayer: snapshot.players?.find((player) => player.clientId === clientId),
    remotePlayers: players
      .filter((player) => player.clientId !== clientId)
      .map((player) => ({ ...player })),
    inhibitor: snapshot.inhibitor ? { ...snapshot.inhibitor } : null,
    world: snapshot.world,
  };
}

export function acceptedRemoteEvents(events, lastEventSeq) {
  const accepted = [];
  let cursor = lastEventSeq;
  for (const event of events) {
    if (!event || event.seq <= cursor) continue;
    cursor = event.seq;
    accepted.push(event);
  }
  return accepted;
}

function projectPortal(remote) {
  return {
    id: remote.id,
    wx: remote.wx,
    wy: remote.wy,
    type: remote.type ?? 'standard',
    wave: remote.wave ?? 0,
    spawnTime: remote.spawnTime ?? 0,
    lifespan: remote.lifespan ?? 90,
    alive: remote.alive !== false,
    finalInhibitor: remote.finalInhibitor === true,
    finalExfil: remote.finalExfil === true,
    guaranteedFinalExfil: remote.guaranteedFinalExfil === true,
    opacity: remote.opacity ?? 1,
    timeLeft(runTime) {
      return Math.max(0, (this.spawnTime + this.lifespan) - runTime);
    },
    isWarning(runTime) {
      return this.alive && this.timeLeft(runTime) < 15;
    },
    isCritical(runTime) {
      return this.alive && this.timeLeft(runTime) < 5;
    },
    getCaptureRadius() {
      const base = CONFIG.portals.captureRadius;
      if (this.type === 'unstable') return base * 0.5;
      if (this.type === 'rift') return base * 1.8;
      return base;
    },
  };
}

export function projectRemoteWorldPatch(world, {
  stars: previousStars = [],
  scavengers: previousScavengers = [],
} = {}) {
  if (!world) return null;
  const patch = {
    authoritativeField: world.authoritativeField || null,
  };
  if (Array.isArray(world.waveRings)) {
    patch.waveRings = world.waveRings.map((remote) => ({
      sourceWX: remote.sourceWX,
      sourceWY: remote.sourceWY,
      radius: remote.radius ?? 0,
      amplitude: remote.amplitude ?? 0,
      initialAmplitude: remote.initialAmplitude ?? remote.amplitude ?? 0,
      alive: remote.alive !== false,
      id: remote.id || null,
    }));
  }
  if (Array.isArray(world.wells)) patch.wells = world.wells;
  if (Array.isArray(world.stars)) {
    const previousById = new Map(previousStars.map((star) => [star.id, star]));
    patch.stars = world.stars.map((remote, index) =>
      normalizeStarPresentation(remote, previousById.get(remote.id) || previousStars[index] || {}));
  }
  if (Array.isArray(world.wrecks)) {
    patch.wrecks = world.wrecks.map((remote) => ({
      ...remote,
      alive: remote.alive !== false,
      looted: Boolean(remote.looted),
      pickupCooldown: remote.pickupCooldown ?? 0,
      loot: Array.isArray(remote.loot) ? remote.loot.map((item) => item ? { ...item } : null) : [],
    }));
  }
  if (Array.isArray(world.planetoids)) {
    patch.planetoids = world.planetoids.map((remote) => ({
      ...remote,
      alive: remote.alive !== false,
    }));
  }
  if (Array.isArray(world.portals)) {
    patch.portals = world.portals.map(projectPortal);
    patch.nextPortalWaveIndex = world.nextPortalWaveIndex;
  }
  if (Array.isArray(world.inhibitors)) {
    patch.inhibitors = world.inhibitors.map((entity) => ({ ...entity }));
  }
  if (Array.isArray(world.noiseEmitters)) {
    patch.noiseEmitters = world.noiseEmitters.map((emitter) => ({
      id: emitter.id,
      sourceKind: emitter.sourceKind || 'world',
      source: emitter.source || 'NOISE',
      sourceClass: emitter.sourceClass || null,
      wx: emitter.wx,
      wy: emitter.wy,
      radiusMeters: Math.max(0, Number(emitter.radiusMeters) || 0),
      cadenceSeconds: Math.max(0, Number(emitter.cadenceSeconds) || 0),
    }));
  }
  if (Array.isArray(world.scavengers)) {
    const previousById = new Map(previousScavengers.map((scavenger) => [scavenger.id, scavenger]));
    patch.scavengers = world.scavengers.map((remote, index) =>
      normalizeScavengerPresentation(remote, previousById.get(remote.id) || previousScavengers[index] || {}));
  }
  if (Array.isArray(world.fauna)) patch.fauna = world.fauna.filter((entry) => entry.alive !== false);
  if (Array.isArray(world.sentries)) patch.sentries = world.sentries.filter((entry) => entry.alive !== false);
  return patch;
}
