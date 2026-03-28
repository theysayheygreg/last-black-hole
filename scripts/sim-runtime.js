#!/usr/bin/env node

const http = require("http");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { loadPlayableMaps } = require("./shared-map-loader.js");
const {
  PROTOCOL_VERSION,
  DEFAULT_TICK_HZ,
  DEFAULT_SNAPSHOT_HZ,
  DEFAULT_WORLD_SCALE,
  DEFAULT_MAX_PLAYERS,
  createProtocolDescription,
  normalizeInputMessage,
} = require("./sim-protocol.js");

const PLAYABLE_MAPS = loadPlayableMaps();
const PORTAL_CONFIG = {
  captureRadius: 0.08,
  waves: [
    { time: 45, count: [2, 3], types: ["standard"], lifespan: 90 },
    { time: 180, count: [1, 2], types: ["standard", "unstable"], lifespan: 75 },
    { time: 330, count: [1, 2], types: ["standard", "rift"], lifespan: 60 },
    { time: 450, count: [1, 1], types: ["unstable"], lifespan: 45 },
    { time: 570, count: [1, 1], types: ["standard"], lifespan: 30 },
  ],
};
const PLAYER_CARGO_SLOTS = 8;
const RUN_DURATION = 600;
const WELL_GROWTH_VARIANCE = 0.01;
const WELL_GROWTH_AMOUNT = 0.02;
const WELL_KILL_RADIUS_GROWTH = 0.3;

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (!arg.startsWith("--")) continue;
    const key = arg.slice(2);
    const next = argv[i + 1];
    if (next && !next.startsWith("--")) {
      args[key] = next;
      i++;
    } else {
      args[key] = true;
    }
  }
  return args;
}

function readJson(req) {
  return new Promise((resolve, reject) => {
    let data = "";
    req.on("data", (chunk) => {
      data += chunk;
      if (data.length > 1024 * 1024) {
        reject(new Error("Request body too large"));
        req.destroy();
      }
    });
    req.on("end", () => {
      if (!data.trim()) {
        resolve({});
        return;
      }
      try {
        resolve(JSON.parse(data));
      } catch (err) {
        reject(err);
      }
    });
    req.on("error", reject);
  });
}

function sendJson(res, statusCode, body) {
  const payload = `${JSON.stringify(body, null, 2)}\n`;
  res.statusCode = statusCode;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Headers", "content-type");
  res.end(payload);
}

function ensureParent(filepath) {
  if (!filepath) return;
  fs.mkdirSync(path.dirname(filepath), { recursive: true });
}

function cleanupFiles(pidFile, metaFile) {
  for (const file of [pidFile, metaFile]) {
    if (!file) continue;
    try {
      fs.rmSync(file, { force: true });
    } catch {}
  }
}

function wrapWorld(value, worldScale) {
  const half = worldScale / 2;
  let wrapped = value;
  while (wrapped < -half) wrapped += worldScale;
  while (wrapped >= half) wrapped -= worldScale;
  return wrapped;
}

function worldDisplacement(a, b, worldScale) {
  let dx = b - a;
  if (dx > worldScale / 2) dx -= worldScale;
  if (dx < -worldScale / 2) dx += worldScale;
  return dx;
}

function worldDistance(ax, ay, bx, by, worldScale) {
  const dx = worldDisplacement(ax, bx, worldScale);
  const dy = worldDisplacement(ay, by, worldScale);
  return Math.hypot(dx, dy);
}

function hashUnit(input) {
  const value = String(input);
  let hash = 2166136261;
  for (let i = 0; i < value.length; i++) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return ((hash >>> 0) % 1000000) / 1000000;
}

function wellKillRadiusForMass(well) {
  const startMass = well.startMass ?? well.mass ?? 1;
  const baseKillRadius = well.baseKillRadius ?? well.killRadius ?? 0.04;
  const growthFactor = WELL_KILL_RADIUS_GROWTH;
  const massDelta = Math.max(0, (well.mass ?? startMass) - startMass);
  return baseKillRadius * (1 + massDelta * growthFactor);
}

function initializePlanetoid(planetoid, wells, worldScale, index) {
  const seededA = hashUnit(`${planetoid.id}:a`);
  const seededB = hashUnit(`${planetoid.id}:b`);
  const seededC = hashUnit(`${planetoid.id}:c`);
  const seededD = hashUnit(`${planetoid.id}:d`);
  const state = {
    ...planetoid,
    alive: planetoid.alive !== false,
    age: 0,
    t: seededA * Math.PI * 2,
    wx: planetoid.wx ?? 0,
    wy: planetoid.wy ?? 0,
    vx: planetoid.vx ?? 0,
    vy: planetoid.vy ?? 0,
  };

  if (state.type === "orbit") {
    state.pathData = {
      wellIndex: state.wellIndex,
      semiA: 0.2 + seededB * 0.3,
      semiB: 0.15 + seededC * 0.25,
      tilt: seededD * Math.PI * 2,
      speed: 0.22 * (0.7 + seededA * 0.6),
    };
  } else if (state.type === "figure8") {
    state.pathData = {
      wellA: state.wellA,
      wellB: state.wellB,
      speed: 0.18 * (0.8 + seededB * 0.5),
    };
  } else if (state.type === "transit") {
    const edge = index % 4;
    const speed = 0.16 * (0.8 + seededB * 0.5);
    let heading = seededC * Math.PI * 2;
    let wx = seededA * worldScale;
    let wy = seededD * worldScale;
    if (edge === 0) {
      wy = 0;
      heading = Math.PI / 2 + (seededC - 0.5) * 1.0;
    } else if (edge === 1) {
      wx = worldScale;
      heading = Math.PI + (seededC - 0.5) * 1.0;
    } else if (edge === 2) {
      wy = worldScale;
      heading = -Math.PI / 2 + (seededC - 0.5) * 1.0;
    } else {
      wx = 0;
      heading = (seededC - 0.5) * 1.0;
    }
    state.wx = wx;
    state.wy = wy;
    state.vx = Math.cos(heading) * speed;
    state.vy = Math.sin(heading) * speed;
    state.pathData = { heading, speed, maxAge: worldScale / speed + 5 };
  }

  updatePlanetoidState(state, wells, 0, worldScale);
  return state;
}

function updatePlanetoidState(planetoid, wells, dt, worldScale) {
  const prevWX = planetoid.wx;
  const prevWY = planetoid.wy;

  if (planetoid.type === "orbit") {
    const well = wells[planetoid.pathData.wellIndex];
    if (!well) return;
    planetoid.t += planetoid.pathData.speed * dt;
    planetoid.wx = wrapWorld(
      well.wx + Math.cos(planetoid.t + planetoid.pathData.tilt) * planetoid.pathData.semiA,
      worldScale
    );
    planetoid.wy = wrapWorld(
      well.wy + Math.sin(planetoid.t) * planetoid.pathData.semiB,
      worldScale
    );
  } else if (planetoid.type === "figure8") {
    const wellA = wells[planetoid.pathData.wellA];
    const wellB = wells[planetoid.pathData.wellB];
    if (!wellA || !wellB) return;
    const dx = worldDisplacement(wellA.wx, wellB.wx, worldScale);
    const dy = worldDisplacement(wellA.wy, wellB.wy, worldScale);
    const midWX = wrapWorld(wellA.wx + dx / 2, worldScale);
    const midWY = wrapWorld(wellA.wy + dy / 2, worldScale);
    planetoid.t += planetoid.pathData.speed * dt;
    planetoid.wx = wrapWorld(midWX + (dx / 2) * Math.sin(planetoid.t), worldScale);
    planetoid.wy = wrapWorld(midWY + (dy / 2) * Math.sin(planetoid.t * 2), worldScale);
  } else if (planetoid.type === "transit") {
    planetoid.age += dt;
    planetoid.wx = wrapWorld(planetoid.wx + planetoid.vx * dt, worldScale);
    planetoid.wy = wrapWorld(planetoid.wy + planetoid.vy * dt, worldScale);
    if (planetoid.age > planetoid.pathData.maxAge) {
      planetoid.age = 0;
    }
  }

  if (dt > 0 && planetoid.type !== "transit") {
    const dx = worldDisplacement(prevWX, planetoid.wx, worldScale);
    const dy = worldDisplacement(prevWY, planetoid.wy, worldScale);
    planetoid.vx = dx / dt;
    planetoid.vy = dy / dt;
  }
}

function cloneMapState(mapId, worldScaleOverride = null) {
  const map = PLAYABLE_MAPS[mapId] || PLAYABLE_MAPS.shallows;
  const parsedWorldScale = worldScaleOverride == null ? NaN : Number(worldScaleOverride);
  const worldScale = Number.isFinite(parsedWorldScale) && parsedWorldScale > 0 ? parsedWorldScale : map.worldScale;
  const wells = map.wells.map((well) => ({
    ...well,
    baseKillRadius: well.killRadius,
    startMass: well.mass,
    growthRate: (well.growthRate ?? WELL_GROWTH_AMOUNT) + (Math.random() * 2 - 1) * WELL_GROWTH_VARIANCE,
    killRadius: well.killRadius,
  }));
  const stars = map.stars.map((star) => ({
    ...star,
    alive: star.alive !== false,
    driftVX: 0,
    driftVY: 0,
  }));
  const wrecks = map.wrecks.map((wreck) => ({
    ...wreck,
    alive: true,
    looted: false,
    pickupCooldown: 0,
    vx: 0,
    vy: 0,
  }));
  const planetoids = map.planetoids.map((planetoid, index) =>
    initializePlanetoid(planetoid, wells, worldScale, index)
  );

  return {
    id: map.id,
    name: map.name,
    worldScale,
    fluidResolution: map.fluidResolution,
    wells,
    stars,
    wrecks,
    planetoids,
    portals: [],
    nextPortalWaveIndex: 0,
  };
}

function cloneLoadoutItems(list = []) {
  if (!Array.isArray(list)) return [];
  return list.map((item) => (item ? { ...item } : null));
}

function portalCaptureRadius(portal) {
  const base = PORTAL_CONFIG.captureRadius;
  if (portal.type === "unstable") return base * 0.5;
  if (portal.type === "rift") return base * 1.8;
  return base;
}

function randomBetween(min, max) {
  return min + Math.random() * (max - min);
}

function findPortalSpawnPosition(portalType) {
  const worldScale = runtime.session.worldScale;
  const minPortalSpacing = 0.3;
  const dangerBias = portalType === "rift" ? 0.2 : portalType === "unstable" ? 0.1 : 0.45;

  for (let attempt = 0; attempt < 40; attempt++) {
    const wx = Math.random() * worldScale;
    const wy = Math.random() * worldScale;

    let nearestPortal = Infinity;
    for (const portal of runtime.mapState.portals) {
      if (portal.alive === false) continue;
      nearestPortal = Math.min(
        nearestPortal,
        worldDistance(wx, wy, portal.wx, portal.wy, worldScale)
      );
    }
    if (nearestPortal < minPortalSpacing) continue;

    let nearestWell = Infinity;
    for (const well of runtime.mapState.wells) {
      nearestWell = Math.min(nearestWell, worldDistance(wx, wy, well.wx, well.wy, worldScale));
    }

    if (portalType === "rift") {
      if (nearestWell < 0.18 || nearestWell > 0.5) continue;
    } else if (portalType === "unstable") {
      if (nearestWell < 0.12 || nearestWell > 0.7) continue;
    } else {
      if (nearestWell < dangerBias) continue;
    }

    return { wx, wy };
  }

  return {
    wx: Math.random() * worldScale,
    wy: Math.random() * worldScale,
  };
}
function findSafeSpawn(map) {
  const allObjects = [
    ...map.wells.map((well) => ({ wx: well.wx, wy: well.wy })),
    ...map.stars.map((star) => ({ wx: star.wx, wy: star.wy })),
  ];
  const minDist = Math.max(0.25, map.worldScale * 0.08);

  let best = { wx: map.worldScale / 2, wy: map.worldScale / 2, dist: -Infinity };

  for (let attempt = 0; attempt < 80; attempt++) {
    const wx = Math.random() * map.worldScale;
    const wy = Math.random() * map.worldScale;
    let nearest = Infinity;
    for (const obj of allObjects) {
      nearest = Math.min(nearest, worldDistance(wx, wy, obj.wx, obj.wy, map.worldScale));
    }
    if (nearest >= minDist) return { wx, wy };
    if (nearest > best.dist) best = { wx, wy, dist: nearest };
  }

  return { wx: best.wx, wy: best.wy };
}


const args = parseArgs(process.argv.slice(2));
const HOST = args.host || "127.0.0.1";
const PORT = Number(args.port || 8787);
const PID_FILE = args["pid-file"] ? path.resolve(args["pid-file"]) : null;
const META_FILE = args["meta-file"] ? path.resolve(args["meta-file"]) : null;
const LOG_LABEL = args.label || "lbh-sim";

const protocol = createProtocolDescription();
const runtime = {
  startedAt: new Date().toISOString(),
  session: {
    id: null,
    status: "idle",
    mapId: null,
    mapName: null,
    worldScale: DEFAULT_WORLD_SCALE,
    tickHz: DEFAULT_TICK_HZ,
    snapshotHz: DEFAULT_SNAPSHOT_HZ,
    maxPlayers: DEFAULT_MAX_PLAYERS,
  },
  tick: 0,
  simTime: 0,
  recentEvents: [],
  nextEventSeq: 1,
  players: new Map(),
  mapState: {
    id: "shallows",
    name: "The Shallows",
    worldScale: DEFAULT_WORLD_SCALE,
    fluidResolution: 256,
    wells: [],
    stars: [],
    wrecks: [],
    planetoids: [],
    portals: [],
  },
};

let tickHandle = null;

function publishEvent(type, payload = {}) {
  const event = {
    seq: runtime.nextEventSeq++,
    type,
    simTime: runtime.simTime,
    payload,
  };
  runtime.recentEvents.push(event);
  if (runtime.recentEvents.length > 128) {
    runtime.recentEvents.shift();
  }
  return event;
}

function createPlayer(clientId, name) {
  return {
    clientId,
    name: name || clientId,
    wx: 0,
    wy: 0,
    vx: 0,
    vy: 0,
    lastInput: {
      seq: 0,
      moveX: 0,
      moveY: 0,
      thrust: 0,
      pulse: false,
      timestamp: Date.now(),
    },
    status: "alive",
    cargo: [],
    equipped: [],
    consumables: [],
    activeEffects: [],
  };
}

function startSession(config = {}) {
  const requestedMapId = String(config.mapId || "shallows");
  const requestedWorldScale = config.worldScale == null ? null : Number(config.worldScale);
  const mapState = cloneMapState(requestedMapId, requestedWorldScale);
  runtime.session = {
    id: crypto.randomUUID(),
    status: "running",
    mapId: mapState.id,
    mapName: mapState.name,
    worldScale: mapState.worldScale,
    tickHz: Number.isFinite(Number(config.tickHz)) ? Number(config.tickHz) : DEFAULT_TICK_HZ,
    snapshotHz: Number.isFinite(Number(config.snapshotHz)) ? Number(config.snapshotHz) : DEFAULT_SNAPSHOT_HZ,
    maxPlayers: Number.isFinite(Number(config.maxPlayers)) ? Number(config.maxPlayers) : DEFAULT_MAX_PLAYERS,
  };
  runtime.mapState = mapState;
  runtime.tick = 0;
  runtime.simTime = 0;
  runtime.players.clear();
  runtime.recentEvents = [];
  runtime.nextEventSeq = 1;
  runtime.growthTimer = 0;
  runtime.growthIndex = 0;
  publishEvent("session.started", {
    sessionId: runtime.session.id,
    mapId: runtime.session.mapId,
    mapName: runtime.session.mapName,
    worldScale: runtime.session.worldScale,
    maxPlayers: runtime.session.maxPlayers,
  });
  restartTickLoop();
}

function snapshotBody() {
  return {
    type: "snapshot",
    protocolVersion: PROTOCOL_VERSION,
    session: { ...runtime.session },
    tick: runtime.tick,
    simTime: runtime.simTime,
    players: Array.from(runtime.players.values()).map((player) => ({
      clientId: player.clientId,
      name: player.name,
      status: player.status,
      wx: player.wx,
      wy: player.wy,
      vx: player.vx,
      vy: player.vy,
      lastInputSeq: player.lastInput.seq,
      cargo: player.cargo,
      cargoCount: player.cargo.length,
      equipped: player.equipped,
      consumables: player.consumables,
      activeEffects: player.activeEffects,
    })),
    world: {
      wells: runtime.mapState.wells,
      stars: runtime.mapState.stars,
      wrecks: runtime.mapState.wrecks,
      planetoids: runtime.mapState.planetoids,
      portals: runtime.mapState.portals,
      nextPortalWaveIndex: runtime.mapState.nextPortalWaveIndex,
    },
    recentEvents: runtime.recentEvents.slice(-32),
  };
}

function tickWells(dt) {
  for (const well of runtime.mapState.wells) {
    well.killRadius = wellKillRadiusForMass(well);
  }
}

function tickPortals(dt) {
  const schedule = PORTAL_CONFIG.waves;
  while (runtime.mapState.nextPortalWaveIndex < schedule.length) {
    const wave = schedule[runtime.mapState.nextPortalWaveIndex];
    if (runtime.simTime < wave.time) break;

    const spawnCount = wave.count[0] + Math.floor(Math.random() * (wave.count[1] - wave.count[0] + 1));
    for (let i = 0; i < spawnCount; i++) {
      const type = wave.types[Math.floor(Math.random() * wave.types.length)];
      const pos = findPortalSpawnPosition(type);
      const lifespan = type === "unstable"
        ? wave.lifespan + (Math.random() - 0.5) * wave.lifespan * 0.4
        : wave.lifespan;
      const portal = {
        id: `portal-${runtime.mapState.nextPortalWaveIndex + 1}-${i + 1}-${runtime.tick}`,
        wx: pos.wx,
        wy: pos.wy,
        type,
        wave: runtime.mapState.nextPortalWaveIndex + 1,
        spawnTime: runtime.simTime,
        lifespan,
        alive: true,
        opacity: 1,
      };
      runtime.mapState.portals.push(portal);
      publishEvent("portal.spawned", {
        portalId: portal.id,
        type: portal.type,
        wx: portal.wx,
        wy: portal.wy,
        wave: portal.wave,
      });
    }
    runtime.mapState.nextPortalWaveIndex += 1;
  }

  for (const portal of runtime.mapState.portals) {
    if (portal.alive === false) continue;
    const remaining = portal.spawnTime + portal.lifespan - runtime.simTime;
    if (remaining <= 0) {
      portal.alive = false;
      portal.opacity = 0;
      publishEvent("portal.expired", {
        portalId: portal.id,
        type: portal.type,
      });
      continue;
    }
    portal.opacity = remaining < 15 ? Math.max(0, remaining / 15) : 1;
  }
}

function tickGrowth(dt) {
  runtime.growthTimer = (runtime.growthTimer || 0) + dt;
  const perWellInterval = 45 / Math.max(1, runtime.mapState.wells.length);
  while (runtime.growthTimer >= perWellInterval) {
    runtime.growthTimer -= perWellInterval;
    const idx = (runtime.growthIndex || 0) % runtime.mapState.wells.length;
    runtime.growthIndex = idx + 1;
    const well = runtime.mapState.wells[idx];
    if (!well) break;
    well.mass += well.growthRate;
    well.killRadius = wellKillRadiusForMass(well);
    publishEvent("well.grew", {
      wellId: well.id,
      mass: well.mass,
      killRadius: well.killRadius,
    });
  }
}

function maybeCollapseRun() {
  const activePortalCount = runtime.mapState.portals.filter((portal) => portal.alive !== false).length;
  const hasMorePortalWaves = runtime.mapState.nextPortalWaveIndex < PORTAL_CONFIG.waves.length;
  if (runtime.simTime <= 60) return;
  if (activePortalCount > 0) return;
  if (hasMorePortalWaves) return;

  for (const player of runtime.players.values()) {
    if (player.status !== "alive") continue;
    player.status = "dead";
    player.vx = 0;
    player.vy = 0;
    player.cargo = [];
    publishEvent("player.died", {
      clientId: player.clientId,
      cause: "collapse",
    });
  }
}

function tickStars(dt) {
  for (const star of runtime.mapState.stars) {
    if (star.alive === false) continue;
    star.wx = wrapWorld(star.wx + (star.driftVX || 0) * dt, runtime.session.worldScale);
    star.wy = wrapWorld(star.wy + (star.driftVY || 0) * dt, runtime.session.worldScale);

    for (const well of runtime.mapState.wells) {
      const dist = worldDistance(star.wx, star.wy, well.wx, well.wy, runtime.session.worldScale);
      if (dist < well.killRadius) {
        star.alive = false;
        well.mass += (star.mass || 1) * 0.5;
        well.killRadius = wellKillRadiusForMass(well);
        publishEvent("star.consumed", {
          starId: star.id,
          wellId: well.id,
        });
        break;
      }
    }
  }
}

function tickWrecks(dt) {
  for (const wreck of runtime.mapState.wrecks) {
    if (wreck.alive === false) continue;
    if (wreck.pickupCooldown > 0) wreck.pickupCooldown = Math.max(0, wreck.pickupCooldown - dt);

    let ax = 0;
    let ay = 0;
    for (const well of runtime.mapState.wells) {
      const dx = worldDisplacement(wreck.wx, well.wx, runtime.session.worldScale);
      const dy = worldDisplacement(wreck.wy, well.wy, runtime.session.worldScale);
      const dist = Math.hypot(dx, dy);
      if (dist > 0.8 || dist < 0.001) continue;
      const accel = (0.0045 * well.mass) / Math.pow(Math.max(dist, 0.02), 1.5);
      ax += (dx / dist) * accel;
      ay += (dy / dist) * accel;
    }

    wreck.vx += ax * dt;
    wreck.vy += ay * dt;
    const dragFactor = Math.exp(-1.5 * dt);
    wreck.vx *= dragFactor;
    wreck.vy *= dragFactor;

    const speed = Math.hypot(wreck.vx, wreck.vy);
    const terminal = 0.05;
    if (speed > terminal) {
      wreck.vx *= terminal / speed;
      wreck.vy *= terminal / speed;
    }
    if (speed < 0.0005) {
      wreck.vx = 0;
      wreck.vy = 0;
    }

    wreck.wx = wrapWorld(wreck.wx + wreck.vx * dt, runtime.session.worldScale);
    wreck.wy = wrapWorld(wreck.wy + wreck.vy * dt, runtime.session.worldScale);

    for (const well of runtime.mapState.wells) {
      const dist = worldDistance(wreck.wx, wreck.wy, well.wx, well.wy, runtime.session.worldScale);
      if (dist < well.killRadius) {
        wreck.alive = false;
        well.mass += 0.1;
        well.killRadius = wellKillRadiusForMass(well);
        publishEvent("wreck.consumed", {
          wreckId: wreck.id,
          wellId: well.id,
        });
        break;
      }
    }
  }
}

function tickPlanetoids(dt) {
  for (const planetoid of runtime.mapState.planetoids) {
    if (planetoid.alive === false) continue;
    updatePlanetoidState(planetoid, runtime.mapState.wells, dt, runtime.session.worldScale);
    for (const well of runtime.mapState.wells) {
      const dist = worldDistance(planetoid.wx, planetoid.wy, well.wx, well.wy, runtime.session.worldScale);
      if (dist < well.killRadius) {
        planetoid.alive = false;
        well.mass += 0.08;
        well.killRadius = wellKillRadiusForMass(well);
        publishEvent("planetoid.consumed", {
          planetoidId: planetoid.id,
          wellId: well.id,
        });
        break;
      }
    }
  }
}

function applyWellGravity(player, dt) {
  let ax = 0;
  let ay = 0;
  for (const well of runtime.mapState.wells) {
    const dx = worldDisplacement(player.wx, well.wx, runtime.session.worldScale);
    const dy = worldDisplacement(player.wy, well.wy, runtime.session.worldScale);
    const dist = Math.hypot(dx, dy);
    if (dist < 0.0001) continue;
    if (dist < well.killRadius) {
      player.status = "dead";
      player.vx = 0;
      player.vy = 0;
      player.cargo = [];
      publishEvent("player.died", {
        clientId: player.clientId,
        cause: "well",
        wellId: well.id,
        wellName: well.name || well.id,
      });
      return;
    }
    let pull = (0.025 * well.mass) / Math.pow(Math.max(dist, 0.02), 1.8);
    if (player.activeEffects.includes("reduceWellPull")) {
      pull *= 0.8;
    }
    ax += (dx / dist) * pull;
    ay += (dy / dist) * pull;
  }
  player.vx += ax * dt;
  player.vy += ay * dt;
}

function tickPlayerPickups(player) {
  if (player.status !== "alive") return;
  if (player.cargo.length >= PLAYER_CARGO_SLOTS) return;

  for (const wreck of runtime.mapState.wrecks) {
    if (wreck.alive === false || wreck.looted || wreck.pickupCooldown > 0) continue;
    const dist = worldDistance(player.wx, player.wy, wreck.wx, wreck.wy, runtime.session.worldScale);
    if (dist >= 0.08) continue;

    while (wreck.loot?.length > 0 && player.cargo.length < PLAYER_CARGO_SLOTS) {
      player.cargo.push(wreck.loot.shift());
    }
    if (!wreck.loot || wreck.loot.length === 0) {
      wreck.looted = true;
    }
    publishEvent("player.loot", {
      clientId: player.clientId,
      wreckId: wreck.id,
      cargoCount: player.cargo.length,
    });
    if (player.cargo.length >= PLAYER_CARGO_SLOTS) break;
  }
}

function tickExtraction(player) {
  if (player.status !== "alive") return;
  for (const portal of runtime.mapState.portals) {
    if (portal.alive === false) continue;
    const dist = worldDistance(player.wx, player.wy, portal.wx, portal.wy, runtime.session.worldScale);
    if (dist < portalCaptureRadius(portal)) {
      player.status = "escaped";
      player.vx = 0;
      player.vy = 0;
      publishEvent("player.escaped", {
        clientId: player.clientId,
        portalId: portal.id,
        portalType: portal.type,
        cargoCount: player.cargo.length,
      });
      return;
    }
  }
}

function tickSim() {
  if (runtime.session.status !== "running") return;
  const dt = 1 / runtime.session.tickHz;
  runtime.tick += 1;
  runtime.simTime += dt;

  tickWells(dt);
  tickGrowth(dt);
  tickStars(dt);
  tickWrecks(dt);
  tickPlanetoids(dt);
  tickPortals(dt);
  maybeCollapseRun();

  for (const player of runtime.players.values()) {
    if (player.status !== "alive") continue;

    const input = player.lastInput;
    const accel = 2.5 * input.thrust;
    player.vx += input.moveX * accel * dt;
    player.vy += input.moveY * accel * dt;
    applyWellGravity(player, dt);
    if (player.status !== "alive") continue;
    player.vx *= Math.pow(0.92, dt * 15);
    player.vy *= Math.pow(0.92, dt * 15);
    player.wx = ((player.wx + player.vx * dt) % runtime.session.worldScale + runtime.session.worldScale) % runtime.session.worldScale;
    player.wy = ((player.wy + player.vy * dt) % runtime.session.worldScale + runtime.session.worldScale) % runtime.session.worldScale;

    tickPlayerPickups(player);
    tickExtraction(player);
    if (player.status !== "alive") continue;

    if (input.pulse) {
      publishEvent("player.pulse", { clientId: player.clientId, wx: player.wx, wy: player.wy });
      player.lastInput = { ...player.lastInput, pulse: false };
    }
  }
}

function restartTickLoop() {
  if (tickHandle) clearInterval(tickHandle);
  tickHandle = setInterval(tickSim, Math.max(1, Math.round(1000 / runtime.session.tickHz)));
}

function writeFiles() {
  const meta = {
    pid: process.pid,
    host: HOST,
    port: PORT,
    label: LOG_LABEL,
    startedAt: runtime.startedAt,
    url: `http://${HOST}:${PORT}/`,
    protocolVersion: PROTOCOL_VERSION,
    sessionStatus: runtime.session.status,
  };

  if (PID_FILE) {
    ensureParent(PID_FILE);
    fs.writeFileSync(PID_FILE, `${process.pid}\n`, "utf8");
  }
  if (META_FILE) {
    ensureParent(META_FILE);
    fs.writeFileSync(META_FILE, `${JSON.stringify(meta, null, 2)}\n`, "utf8");
  }
}

const server = http.createServer(async (req, res) => {
  if (req.method === "OPTIONS") {
    res.statusCode = 204;
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Headers", "content-type");
    res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
    res.end();
    return;
  }

  try {
    if (req.method === "GET" && req.url === "/health") {
      sendJson(res, 200, {
        ok: true,
        protocolVersion: PROTOCOL_VERSION,
        session: runtime.session,
        tick: runtime.tick,
        simTime: runtime.simTime,
        playerCount: runtime.players.size,
        mapId: runtime.mapState.id,
      });
      return;
    }

    if (req.method === "GET" && req.url === "/maps") {
      sendJson(res, 200, {
        type: "maps",
        maps: Object.values(PLAYABLE_MAPS).map((map) => ({
          id: map.id,
          name: map.name,
          worldScale: map.worldScale,
          fluidResolution: map.fluidResolution,
          wellCount: map.wells.length,
          starCount: map.stars.length,
          wreckCount: map.wrecks.length,
          planetoidCount: map.planetoids.length,
        })),
      });
      return;
    }

    if (req.method === "GET" && req.url === "/protocol") {
      sendJson(res, 200, protocol);
      return;
    }

    if (req.method === "GET" && req.url?.startsWith("/snapshot")) {
      sendJson(res, 200, snapshotBody());
      return;
    }

    if (req.method === "GET" && req.url?.startsWith("/events")) {
      const url = new URL(req.url, `http://${HOST}:${PORT}`);
      const since = Number(url.searchParams.get("since") || 0);
      sendJson(res, 200, {
        type: "events",
        protocolVersion: PROTOCOL_VERSION,
        events: runtime.recentEvents.filter((event) => event.seq > since),
      });
      return;
    }

    if (req.method === "POST" && req.url === "/session/start") {
      const body = await readJson(req);
      startSession(body);
      sendJson(res, 200, { ok: true, session: runtime.session });
      return;
    }

    if (req.method === "POST" && req.url === "/session/reset") {
      startSession(runtime.session);
      sendJson(res, 200, { ok: true, session: runtime.session });
      return;
    }

    if (req.method === "POST" && req.url === "/join") {
      const body = await readJson(req);
      if (runtime.session.status !== "running") {
        sendJson(res, 409, { ok: false, error: "No active session" });
        return;
      }

      const clientId = String(body.clientId || "").trim();
      if (!clientId) {
        sendJson(res, 400, { ok: false, error: "clientId is required" });
        return;
      }

      let player = runtime.players.get(clientId);
      if (!player) {
        if (runtime.players.size >= runtime.session.maxPlayers) {
          sendJson(res, 409, { ok: false, error: "Session full" });
          return;
        }
        player = createPlayer(clientId, body.name);
        player.equipped = cloneLoadoutItems(body.equipped);
        player.consumables = cloneLoadoutItems(body.consumables);
        player.activeEffects = player.equipped.filter(Boolean).map((item) => item.effect).filter(Boolean);
        const spawn = findSafeSpawn(runtime.mapState);
        player.wx = spawn.wx;
        player.wy = spawn.wy;
        runtime.players.set(clientId, player);
        publishEvent("player.joined", { clientId, name: player.name, wx: player.wx, wy: player.wy });
      } else if (body.name) {
        player.name = String(body.name);
        if (Array.isArray(body.equipped)) {
          player.equipped = cloneLoadoutItems(body.equipped);
          player.activeEffects = player.equipped.filter(Boolean).map((item) => item.effect).filter(Boolean);
        }
        if (Array.isArray(body.consumables)) {
          player.consumables = cloneLoadoutItems(body.consumables);
        }
      }

      sendJson(res, 200, { ok: true, player });
      return;
    }

    if (req.method === "POST" && req.url === "/input") {
      const body = await readJson(req);
      const message = normalizeInputMessage(body);
      if (!message.clientId) {
        sendJson(res, 400, { ok: false, error: "clientId is required" });
        return;
      }
      const player = runtime.players.get(message.clientId);
      if (!player) {
        sendJson(res, 404, { ok: false, error: "Unknown client" });
        return;
      }
      if (message.seq <= player.lastInput.seq) {
        sendJson(res, 200, { ok: true, ignored: true, reason: "stale-seq" });
        return;
      }
      player.lastInput = message;
      sendJson(res, 200, { ok: true, acceptedSeq: message.seq, tick: runtime.tick });
      return;
    }

    sendJson(res, 404, { ok: false, error: "Not found" });
  } catch (err) {
    sendJson(res, 500, { ok: false, error: err.message });
  }
});

server.on("error", (err) => {
  console.error(`[${LOG_LABEL}] ${err.message}`);
  cleanupFiles(PID_FILE, META_FILE);
  process.exit(1);
});

function shutdown() {
  if (tickHandle) clearInterval(tickHandle);
  server.close(() => {
    cleanupFiles(PID_FILE, META_FILE);
    process.exit(0);
  });
}

process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);
process.on("exit", () => cleanupFiles(PID_FILE, META_FILE));

server.listen(PORT, HOST, () => {
  writeFiles();
  console.log(`[${LOG_LABEL}] listening on http://${HOST}:${PORT}/`);
  startSession();
});
