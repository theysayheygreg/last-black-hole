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
  normalizeInventoryAction,
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
const SCAVENGER_CONFIG = {
  sensorRange: 1.5,
  decisionInterval: 0.8,
  thrustAccel: 0.5,
  drag: 0.06,
  fleeWellDist: 0.15,
  pickupRadius: 0.08,
  deathSpiralDuration: 1.5,
};
const SERVER_COMBAT = {
  pulseCooldown: 4.0,
  pulseEntityForce: 0.5,
  pulseEntityRadius: 0.3,
  pulseRecoilForce: 0.4,
  timeSlowScale: 0.3,
  timeSlowDuration: 3.0,
};
const STAR_SERVER = {
  shipPushStrength: 0.45,
  shipPushFalloff: 1.8,
  maxRange: 0.6,
};
const PLANETOID_SERVER = {
  shipPushStrength: 0.3,
  shipPushRadius: 0.1,
};
const WAVE_SERVER = {
  waveSpeed: 0.4,
  waveWidth: 0.1,
  waveDecay: 0.97,
  waveMaxRadius: 2.0,
  waveShipPush: 0.8,
  growthWaveAmplitude: 1.0,
};
const SIGNAL_CONFIG = {
  // Generation rates (per second for continuous, instant for spikes)
  thrustBaseRate: 0.005,
  thrustOppositionMult: 2.0,
  lootSpikeT1: 0.06,
  lootSpikeT2: 0.10,
  lootSpikeT3: 0.18,
  pulseSpike: 0.12,
  collisionSpike: 0.08,
  extractionRate: 0.003,
  wellProximityRate: 0.002,
  wellProximityDist: 0.30,
  coastRate: 0.001,
  // Decay rates (per second)
  decayBase: 0.025,
  decayWreckWake: 0.040,
  decayAccretionShadow: 0.050,
  // Thresholds
  ghostMax: 0.15,
  whisperMax: 0.35,
  presenceMax: 0.55,
  beaconMax: 0.75,
  flareMax: 0.90,
  // Zone names (ordered)
  zones: ["ghost", "whisper", "presence", "beacon", "flare", "threshold"],
};

const INHIBITOR_CONFIG = {
  // Pressure accumulation
  pressureFromSignal: 0.008,    // pressure/s per unit signal level
  pressureFromTime: 0.0005,     // pressure/s from elapsed time (normalized)
  pressureFromGrowth: 0.05,     // pressure per well growth event
  // Form thresholds (fraction of wake threshold)
  glitchFraction: 0.7,         // Form 1 at 70% of threshold
  // Wake threshold randomized per run
  thresholdMin: 0.82,
  thresholdMax: 0.98,
  // Form 1: Glitch
  glitchRadius: 0.1,           // world-units
  glitchDriftSpeed: 0.02,      // wu/s toward last signal position
  glitchDissipateTime: 10,     // seconds of silence before dissipating
  glitchSolidifySignal: 0.35,  // signal level that solidifies glitch
  glitchSolidifySpeed: 0.04,   // wu/s when solidified
  // Form 2: Swarm
  swarmRadius: 0.25,
  swarmSpeedSilent: 0.02,
  swarmSpeedLight: 0.05,
  swarmSpeedHeavy: 0.10,
  swarmSpeedFlare: 0.15,
  swarmTrackInterval: 3.0,     // seconds between target updates
  swarmContactDrain: 1.0,      // items/second on contact
  swarmContactSignalSpike: 0.25,
  swarmSearchTimeout: 5.0,     // seconds before search pattern
  // Form 3: Vessel
  vesselSpeed: 0.08,
  vesselKillRadius: 0.08,
  vesselGravityRange: 0.3,
  vesselGravityStrength: 0.15,
  vesselPortalBlockRange: 0.2,
  vesselTimeToForm: 90,        // seconds after Swarm, or instant if signal hits 1.0
  finalPortalDelay: 60,        // seconds after Vessel before guaranteed portal
  finalPortalLifespan: 15,
};

const FORCE_REF_DIST = 0.25;
const FORCE_MIN_DIST = 0.15;
const SCAVENGER_FACTIONS = ["Collector", "Reaper", "Warden"];
const DRIFTER_NAMES = ["Quiet Tide", "Still Wake", "Ash Petal", "Cold Harbor", "Pale Drift", "Dim Lantern"];
const VULTURE_NAMES = ["Keen Edge", "Rust Claw", "Burnt Lance", "Bitter Claim", "Sharp Debt", "Iron Reap"];

const MAP_SIM_SCALE_PROFILES = {
  shallows: {
    profileId: "small",
    tickHz: 15,
    snapshotHz: 10,
    worldTickHz: 10,
    portalTickHz: 10,
    growthTickHz: 4,
    scavengerTickHz: 12,
    waveTickHz: 15,
    entityRelevanceRadius: 1.4,
    scavengerRelevanceRadius: 1.8,
    spawnScavengersBase: 1,
    spawnScavengersPerPlayer: 0.5,
    maxScavengers: 5,
    maxRelevantStarsPerPlayer: 6,
    maxRelevantPlanetoidsPerPlayer: 4,
    maxRelevantWrecksPerPlayer: 5,
    maxRelevantScavengersPerPlayer: 4,
    maxWellInfluencesPerPlayer: 6,
    maxWaveInfluencesPerPlayer: 6,
    maxPickupChecksPerPlayer: 4,
    maxPortalChecksPerPlayer: 4,
  },
  expanse: {
    profileId: "medium",
    tickHz: 12,
    snapshotHz: 8,
    worldTickHz: 6,
    portalTickHz: 6,
    growthTickHz: 3,
    scavengerTickHz: 8,
    waveTickHz: 12,
    entityRelevanceRadius: 1.2,
    scavengerRelevanceRadius: 1.6,
    spawnScavengersBase: 1,
    spawnScavengersPerPlayer: 0.5,
    maxScavengers: 6,
    maxRelevantStarsPerPlayer: 5,
    maxRelevantPlanetoidsPerPlayer: 4,
    maxRelevantWrecksPerPlayer: 4,
    maxRelevantScavengersPerPlayer: 3,
    maxWellInfluencesPerPlayer: 5,
    maxWaveInfluencesPerPlayer: 5,
    maxPickupChecksPerPlayer: 3,
    maxPortalChecksPerPlayer: 3,
  },
  "deep-field": {
    profileId: "large",
    tickHz: 10,
    snapshotHz: 6,
    worldTickHz: 4,
    portalTickHz: 4,
    growthTickHz: 2,
    scavengerTickHz: 6,
    waveTickHz: 10,
    entityRelevanceRadius: 1.0,
    scavengerRelevanceRadius: 1.4,
    spawnScavengersBase: 2,
    spawnScavengersPerPlayer: 0.5,
    maxScavengers: 7,
    maxRelevantStarsPerPlayer: 4,
    maxRelevantPlanetoidsPerPlayer: 3,
    maxRelevantWrecksPerPlayer: 4,
    maxRelevantScavengersPerPlayer: 3,
    maxWellInfluencesPerPlayer: 4,
    maxWaveInfluencesPerPlayer: 4,
    maxPickupChecksPerPlayer: 2,
    maxPortalChecksPerPlayer: 2,
  },
};

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

function worldDirection(ax, ay, bx, by, worldScale) {
  const dx = worldDisplacement(ax, bx, worldScale);
  const dy = worldDisplacement(ay, by, worldScale);
  const dist = Math.hypot(dx, dy);
  if (dist < 0.000001) return { dist, nx: 0, ny: 0 };
  return { dist, nx: dx / dist, ny: dy / dist };
}

function inversePowerForce(dist, strength, mass, falloff, maxRange) {
  if (dist < 0.001 || dist > maxRange) return 0;
  const safeDist = Math.max(dist, FORCE_MIN_DIST);
  const normDist = safeDist / FORCE_REF_DIST;
  const baseAccel = strength * mass / Math.pow(normDist, falloff);
  const t = dist / maxRange;
  const rangeFade = 1 - t;
  return baseAccel * rangeFade;
}

function proximityForce(dist, strength, radius) {
  if (dist < 0.001 || dist > radius) return 0;
  return strength * (1 - dist / radius);
}

function waveBandForce(distFromSource, ringRadius, halfWidth, pushStrength, amplitude) {
  const distFromFront = Math.abs(distFromSource - ringRadius);
  if (distFromFront > halfWidth) return 0;
  const bandPosition = distFromFront / halfWidth;
  const profile = Math.cos(bandPosition * Math.PI * 0.5);
  return pushStrength * amplitude * profile;
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
    scavengers: [],
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

function pick(list) {
  return list[Math.floor(Math.random() * list.length)];
}

function getSimScaleProfile(mapId, worldScale) {
  const profile = MAP_SIM_SCALE_PROFILES[mapId];
  if (profile) return { ...profile };
  if (worldScale >= 10) return { ...MAP_SIM_SCALE_PROFILES["deep-field"] };
  if (worldScale >= 5) return { ...MAP_SIM_SCALE_PROFILES.expanse };
  return { ...MAP_SIM_SCALE_PROFILES.shallows };
}

function generateScavengerIdentity(archetype) {
  const faction = pick(SCAVENGER_FACTIONS);
  const callsign = archetype === "vulture" ? pick(VULTURE_NAMES) : pick(DRIFTER_NAMES);
  return {
    faction,
    callsign,
    name: `${faction} ${callsign}`,
  };
}

function clampBudgetCount(value, fallback = 1) {
  if (!Number.isFinite(value)) return fallback;
  return Math.max(1, Math.round(value));
}

function spawnServerScavengers(mapState, session) {
  const base = Number(session.spawnScavengersBase || 1);
  const perPlayer = Number(session.spawnScavengersPerPlayer || 0);
  const maxScavengers = clampBudgetCount(session.maxScavengers || 1);
  const count = Math.min(
    maxScavengers,
    clampBudgetCount(base + session.maxPlayers * perPlayer, maxScavengers)
  );
  const vultureCount = Math.max(1, Math.round(count * 0.33));
  const scavengers = [];
  for (let i = 0; i < count; i++) {
    const archetype = i < vultureCount ? "vulture" : "drifter";
    const edge = i % 4;
    let wx;
    let wy;
    if (edge === 0) {
      wx = Math.random() * mapState.worldScale;
      wy = 0.1;
    } else if (edge === 1) {
      wx = Math.random() * mapState.worldScale;
      wy = mapState.worldScale - 0.1;
    } else if (edge === 2) {
      wx = 0.1;
      wy = Math.random() * mapState.worldScale;
    } else {
      wx = mapState.worldScale - 0.1;
      wy = Math.random() * mapState.worldScale;
    }
    const identity = generateScavengerIdentity(archetype);
    scavengers.push({
      id: `scav-${i + 1}`,
      archetype,
      faction: identity.faction,
      callsign: identity.callsign,
      name: identity.name,
      wx,
      wy,
      vx: 0,
      vy: 0,
      facing: Math.random() * Math.PI * 2,
      thrustIntensity: 0,
      alive: true,
      state: "drift",
      deathTimer: 0,
      deathWellId: null,
      deathWellWX: 0,
      deathWellWY: 0,
      deathStartWX: 0,
      deathStartWY: 0,
      deathAngle: 0,
      lootCount: 0,
      lootTarget: archetype === "vulture" ? 2 : 1,
      decisionTimer: Math.random() * SCAVENGER_CONFIG.decisionInterval,
      driftHeading: Math.random() * Math.PI * 2,
      targetWreckId: null,
      targetPortalId: null,
    });
  }
  return scavengers;
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
    hostClientId: null,
    hostName: null,
    worldScale: DEFAULT_WORLD_SCALE,
    tickHz: DEFAULT_TICK_HZ,
    snapshotHz: DEFAULT_SNAPSHOT_HZ,
    maxPlayers: DEFAULT_MAX_PLAYERS,
  },
  tick: 0,
  simTime: 0,
  recentEvents: [],
  nextEventSeq: 1,
  systemAccumulators: {
    world: 0,
    portals: 0,
    growth: 0,
    scavengers: 0,
    waves: 0,
  },
  players: new Map(),
  waveRings: [],
  inhibitor: {
    pressure: 0,
    threshold: 0.90,  // randomized per run
    form: 0,          // 0=inactive, 1=glitch, 2=swarm, 3=vessel
    wx: 0, wy: 0,     // world position
    vx: 0, vy: 0,
    intensity: 0,      // 0-1, ramps during transitions
    radius: 0.1,
    localTime: 0,
    swarmTrackTimer: 0,
    swarmTargetX: 0, swarmTargetY: 0,
    silenceTimer: 0,   // how long peak signal has been low
    vesselTimer: 0,    // time since Form 2
    finalPortalSpawned: false,
  },
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
      consumeSlot: null,
      timestamp: Date.now(),
    },
    status: "alive",
    cargo: new Array(PLAYER_CARGO_SLOTS).fill(null),
    equipped: [],
    consumables: [],
    activeEffects: [],
    effectState: {
      shieldCharges: 0,
      timeSlowRemaining: 0,
      pulseCooldownRemaining: 0,
    },
    signal: {
      level: 0,
      zone: "ghost",
      prevZone: "ghost",
    },
  };
}

function getCargoCount(player) {
  return player.cargo.filter(Boolean).length;
}

function startSession(config = {}) {
  const requestedMapId = String(config.mapId || "shallows");
  const requestedWorldScale = config.worldScale == null ? null : Number(config.worldScale);
  const mapState = cloneMapState(requestedMapId, requestedWorldScale);
  const scaleProfile = getSimScaleProfile(mapState.id, mapState.worldScale);
  runtime.session = {
    id: crypto.randomUUID(),
    status: "running",
    mapId: mapState.id,
    mapName: mapState.name,
    hostClientId: config.requesterId ? String(config.requesterId) : null,
    hostName: config.requesterName ? String(config.requesterName) : null,
    worldScale: mapState.worldScale,
    tickHz: Number.isFinite(Number(config.tickHz)) ? Number(config.tickHz) : scaleProfile.tickHz,
    snapshotHz: Number.isFinite(Number(config.snapshotHz)) ? Number(config.snapshotHz) : scaleProfile.snapshotHz,
    worldTickHz: scaleProfile.worldTickHz,
    portalTickHz: scaleProfile.portalTickHz,
    growthTickHz: scaleProfile.growthTickHz,
    scavengerTickHz: scaleProfile.scavengerTickHz,
    waveTickHz: scaleProfile.waveTickHz,
    entityRelevanceRadius: scaleProfile.entityRelevanceRadius,
    scavengerRelevanceRadius: scaleProfile.scavengerRelevanceRadius,
    spawnScavengersBase: scaleProfile.spawnScavengersBase,
    spawnScavengersPerPlayer: scaleProfile.spawnScavengersPerPlayer,
    maxScavengers: scaleProfile.maxScavengers,
    maxRelevantStarsPerPlayer: scaleProfile.maxRelevantStarsPerPlayer,
    maxRelevantPlanetoidsPerPlayer: scaleProfile.maxRelevantPlanetoidsPerPlayer,
    maxRelevantWrecksPerPlayer: scaleProfile.maxRelevantWrecksPerPlayer,
    maxRelevantScavengersPerPlayer: scaleProfile.maxRelevantScavengersPerPlayer,
    maxWellInfluencesPerPlayer: scaleProfile.maxWellInfluencesPerPlayer,
    maxWaveInfluencesPerPlayer: scaleProfile.maxWaveInfluencesPerPlayer,
    maxPickupChecksPerPlayer: scaleProfile.maxPickupChecksPerPlayer,
    maxPortalChecksPerPlayer: scaleProfile.maxPortalChecksPerPlayer,
    simScaleProfile: scaleProfile.profileId,
    maxPlayers: Number.isFinite(Number(config.maxPlayers)) ? Number(config.maxPlayers) : DEFAULT_MAX_PLAYERS,
  };
  runtime.mapState = mapState;
  runtime.mapState.scavengers = spawnServerScavengers(runtime.mapState, runtime.session);
  runtime.tick = 0;
  runtime.simTime = 0;
  runtime.systemAccumulators = {
    world: 0,
    portals: 0,
    growth: 0,
    scavengers: 0,
    waves: 0,
  };
  // Inhibitor: randomize threshold per run
  const inh = INHIBITOR_CONFIG;
  runtime.inhibitor = {
    pressure: 0,
    threshold: inh.thresholdMin + Math.random() * (inh.thresholdMax - inh.thresholdMin),
    form: 0, wx: 0, wy: 0, vx: 0, vy: 0,
    intensity: 0, radius: inh.glitchRadius,
    localTime: 0, swarmTrackTimer: 0,
    swarmTargetX: 0, swarmTargetY: 0,
    silenceTimer: 0, vesselTimer: 0,
    finalPortalSpawned: false,
  };
  runtime.players.clear();
  runtime.recentEvents = [];
  runtime.nextEventSeq = 1;
  runtime.growthTimer = 0;
  runtime.growthIndex = 0;
  runtime.waveRings = [];
  publishEvent("session.started", {
    sessionId: runtime.session.id,
    mapId: runtime.session.mapId,
    mapName: runtime.session.mapName,
    hostClientId: runtime.session.hostClientId,
    hostName: runtime.session.hostName,
    worldScale: runtime.session.worldScale,
    maxPlayers: runtime.session.maxPlayers,
  });
  restartTickLoop();
}

function assignHost(clientId, name) {
  runtime.session.hostClientId = clientId;
  runtime.session.hostName = name || clientId;
  publishEvent("session.hostAssigned", {
    clientId,
    name: runtime.session.hostName,
  });
}

function ensureHostPermission(requesterId) {
  if (!requesterId) return { ok: false, error: "requesterId is required" };
  if (!runtime.session.hostClientId) return { ok: true };
  if (runtime.session.hostClientId !== requesterId) {
    return { ok: false, error: "Only the session host can do that" };
  }
  return { ok: true };
}

function promoteHostIfNeeded() {
  if (runtime.players.size === 0) {
    runtime.session.hostClientId = null;
    runtime.session.hostName = null;
    return;
  }
  if (runtime.session.hostClientId && runtime.players.has(runtime.session.hostClientId)) return;
  const nextHost = runtime.players.values().next().value;
  if (nextHost) assignHost(nextHost.clientId, nextHost.name);
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
      cargoCount: getCargoCount(player),
      equipped: player.equipped,
      consumables: player.consumables,
      activeEffects: player.activeEffects,
      effectState: player.effectState,
      signal: player.signal,
    })),
    world: {
      wells: runtime.mapState.wells,
      stars: runtime.mapState.stars,
      wrecks: runtime.mapState.wrecks,
      planetoids: runtime.mapState.planetoids,
      portals: runtime.mapState.portals,
      nextPortalWaveIndex: runtime.mapState.nextPortalWaveIndex,
      scavengers: runtime.mapState.scavengers,
    },
    inhibitor: {
      form: runtime.inhibitor.form,
      wx: runtime.inhibitor.wx,
      wy: runtime.inhibitor.wy,
      intensity: runtime.inhibitor.intensity,
      radius: runtime.inhibitor.radius,
      pressure: runtime.inhibitor.pressure,
      localTime: runtime.inhibitor.localTime,
    },
    recentEvents: runtime.recentEvents.slice(-32),
  };
}

function spawnWaveRing(wx, wy, amplitude) {
  runtime.waveRings.push({
    id: `wave-${runtime.tick}-${Math.random().toString(36).slice(2, 6)}`,
    sourceWX: wx,
    sourceWY: wy,
    radius: 0,
    amplitude,
    initialAmplitude: amplitude,
    alive: true,
  });
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
    spawnWaveRing(well.wx, well.wy, WAVE_SERVER.growthWaveAmplitude * well.mass);
    runtime.inhibitor.pressure += INHIBITOR_CONFIG.pressureFromGrowth;
    publishEvent("well.grew", {
      wellId: well.id,
      mass: well.mass,
      killRadius: well.killRadius,
      wx: well.wx,
      wy: well.wy,
    });
  }
}

function tickWaveRings(dt) {
  for (const ring of runtime.waveRings) {
    ring.radius += WAVE_SERVER.waveSpeed * dt;
    ring.amplitude *= WAVE_SERVER.waveDecay;
    if (ring.radius > WAVE_SERVER.waveMaxRadius || ring.amplitude < 0.01) {
      ring.alive = false;
    }
  }
  runtime.waveRings = runtime.waveRings.filter((ring) => ring.alive !== false);
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
    player.cargo = new Array(PLAYER_CARGO_SLOTS).fill(null);
    publishEvent("player.died", {
      clientId: player.clientId,
      cause: "collapse",
    });
  }
}

function tickStars(dt, stars = runtime.mapState.stars) {
  for (const star of stars) {
    if (star.alive === false) continue;
    star.wx = wrapWorld(star.wx + (star.driftVX || 0) * dt, runtime.session.worldScale);
    star.wy = wrapWorld(star.wy + (star.driftVY || 0) * dt, runtime.session.worldScale);

    for (const well of runtime.mapState.wells) {
      const dist = worldDistance(star.wx, star.wy, well.wx, well.wy, runtime.session.worldScale);
      if (dist < well.killRadius) {
        star.alive = false;
        well.mass += (star.mass || 1) * 0.5;
        well.killRadius = wellKillRadiusForMass(well);
        const angle = Math.random() * Math.PI * 2;
        const ejectDist = 0.08;
        const ejectSpeed = 0.4;
        const remnant = {
          id: `wreck-remnant-${star.id}-${runtime.tick}`,
          wx: wrapWorld(well.wx + Math.cos(angle) * ejectDist, runtime.session.worldScale),
          wy: wrapWorld(well.wy + Math.sin(angle) * ejectDist, runtime.session.worldScale),
          type: "vault",
          tier: 3,
          size: "large",
          alive: true,
          looted: false,
          pickupCooldown: 1.0,
          vx: Math.cos(angle) * ejectSpeed,
          vy: Math.sin(angle) * ejectSpeed,
          loot: [],
          name: `Remnant of ${star.name}`,
        };
        runtime.mapState.wrecks.push(remnant);
        spawnWaveRing(well.wx, well.wy, (star.mass || 1) * 3);
        publishEvent("star.consumed", {
          starId: star.id,
          starName: star.name,
          starType: star.type,
          starColor: star.typeDef?.color || null,
          wellId: well.id,
          wx: well.wx,
          wy: well.wy,
          remnantWreckId: remnant.id,
        });
        break;
      }
    }
  }
}

function tickWrecks(dt, wrecks = runtime.mapState.wrecks) {
  for (const wreck of wrecks) {
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

function tickPlanetoids(dt, planetoids = runtime.mapState.planetoids) {
  for (const planetoid of planetoids) {
    if (planetoid.alive === false) continue;
    updatePlanetoidState(planetoid, runtime.mapState.wells, dt, runtime.session.worldScale);
    for (const well of runtime.mapState.wells) {
      const dist = worldDistance(planetoid.wx, planetoid.wy, well.wx, well.wy, runtime.session.worldScale);
      if (dist < well.killRadius) {
        planetoid.alive = false;
        well.mass += 0.08;
        well.killRadius = wellKillRadiusForMass(well);
        spawnWaveRing(well.wx, well.wy, 0.2);
        publishEvent("planetoid.consumed", {
          planetoidId: planetoid.id,
          wellId: well.id,
          wx: well.wx,
          wy: well.wy,
        });
        break;
      }
    }
  }
}

function applyStarPush(player, dt, stars = runtime.mapState.stars) {
  for (const star of stars) {
    if (star.alive === false) continue;
    const { dist, nx, ny } = worldDirection(star.wx, star.wy, player.wx, player.wy, runtime.session.worldScale);
    const accel = inversePowerForce(
      dist,
      STAR_SERVER.shipPushStrength,
      star.mass || 1,
      STAR_SERVER.shipPushFalloff,
      STAR_SERVER.maxRange
    );
    if (accel > 0) {
      player.vx += nx * accel * dt;
      player.vy += ny * accel * dt;
    }
  }
}

function applyPlanetoidPush(player, dt, planetoids = runtime.mapState.planetoids) {
  for (const planetoid of planetoids) {
    if (planetoid.alive === false) continue;
    const { dist, nx, ny } = worldDirection(planetoid.wx, planetoid.wy, player.wx, player.wy, runtime.session.worldScale);
    const accel = proximityForce(dist, PLANETOID_SERVER.shipPushStrength, PLANETOID_SERVER.shipPushRadius);
    if (accel > 0) {
      player.vx += nx * accel * dt;
      player.vy += ny * accel * dt;
    }
  }
}

function applyScavengerBump(player, scavengers = runtime.mapState.scavengers) {
  for (const scav of scavengers) {
    if (scav.alive === false || scav.state === "dying") continue;
    const { dist, nx, ny } = worldDirection(scav.wx, scav.wy, player.wx, player.wy, runtime.session.worldScale);
    if (dist < SCAVENGER_CONFIG.bumpRadius && dist > 0.0001) {
      const impulse = SCAVENGER_CONFIG.bumpForce;
      player.vx += nx * impulse;
      player.vy += ny * impulse;
      scav.vx -= nx * impulse;
      scav.vy -= ny * impulse;
    }
  }
}

function applyWaveRingPush(player, dt) {
  const halfWidth = WAVE_SERVER.waveWidth * 0.5;
  const relevantRings = collectNearestByDistance(
    player.wx,
    player.wy,
    runtime.waveRings,
    runtime.session.maxWaveInfluencesPerPlayer || runtime.waveRings.length || 1,
    (ring) => ({ wx: ring.sourceWX, wy: ring.sourceWY })
  );
  for (const { entity: ring } of relevantRings) {
    const { dist, nx, ny } = worldDirection(ring.sourceWX, ring.sourceWY, player.wx, player.wy, runtime.session.worldScale);
    const accel = waveBandForce(dist, ring.radius, halfWidth, WAVE_SERVER.waveShipPush, ring.amplitude);
    if (accel > 0) {
      player.vx += nx * accel * dt;
      player.vy += ny * accel * dt;
    }
  }
}

function applyWellGravity(player, dt) {
  let ax = 0;
  let ay = 0;
  const relevantWells = collectNearestByDistance(
    player.wx,
    player.wy,
    runtime.mapState.wells,
    runtime.session.maxWellInfluencesPerPlayer || runtime.mapState.wells.length || 1
  );
  for (const { entity: well } of relevantWells) {
    const dx = worldDisplacement(player.wx, well.wx, runtime.session.worldScale);
    const dy = worldDisplacement(player.wy, well.wy, runtime.session.worldScale);
    const dist = Math.hypot(dx, dy);
    if (dist < 0.0001) continue;
    if (dist < well.killRadius) {
      if (player.effectState.shieldCharges > 0) {
        player.effectState.shieldCharges -= 1;
        refreshPlayerEffects(player);
        publishEvent("player.shieldAbsorbed", {
          clientId: player.clientId,
          wellId: well.id,
          wellName: well.name || well.id,
        });
        return;
      }
      player.status = "dead";
      player.vx = 0;
      player.vy = 0;
      player.cargo = new Array(PLAYER_CARGO_SLOTS).fill(null);
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

function tickPlayerPickups(player, wrecks = runtime.mapState.wrecks) {
  if (player.status !== "alive") return;
  if (getCargoCount(player) >= PLAYER_CARGO_SLOTS) return;

  const nearbyWrecks = collectNearestByDistance(
    player.wx,
    player.wy,
    wrecks.filter((wreck) => wreck.alive !== false && !wreck.looted && wreck.pickupCooldown <= 0),
    runtime.session.maxPickupChecksPerPlayer || wrecks.length || 1
  );

  for (const { entity: wreck, dist } of nearbyWrecks) {
    if (dist >= 0.08) continue;

    while (wreck.loot?.length > 0 && getCargoCount(player) < PLAYER_CARGO_SLOTS) {
      const freeSlot = player.cargo.indexOf(null);
      if (freeSlot === -1) break;
      player.cargo[freeSlot] = wreck.loot.shift();
    }
    if (!wreck.loot || wreck.loot.length === 0) {
      wreck.looted = true;
    }
    // Signal spike from looting (tier-based)
    const wreckTier = wreck.tier || 1;
    const lootSpike = wreckTier >= 3 ? SIGNAL_CONFIG.lootSpikeT3
      : wreckTier >= 2 ? SIGNAL_CONFIG.lootSpikeT2
      : SIGNAL_CONFIG.lootSpikeT1;
    spikePlayerSignal(player, lootSpike);
    publishEvent("player.loot", {
      clientId: player.clientId,
      wreckId: wreck.id,
      cargoCount: getCargoCount(player),
    });
    if (getCargoCount(player) >= PLAYER_CARGO_SLOTS) break;
  }
}

function tickExtraction(player) {
  if (player.status !== "alive") return;
  const nearbyPortals = collectNearestByDistance(
    player.wx,
    player.wy,
    runtime.mapState.portals.filter((portal) => portal.alive !== false),
    runtime.session.maxPortalChecksPerPlayer || runtime.mapState.portals.length || 1
  );
  for (const { entity: portal, dist } of nearbyPortals) {
    if (dist < portalCaptureRadius(portal)) {
      player.status = "escaped";
      player.vx = 0;
      player.vy = 0;
      publishEvent("player.escaped", {
        clientId: player.clientId,
        portalId: portal.id,
        portalType: portal.type,
        cargoCount: getCargoCount(player),
      });
      return;
    }
  }
}

function refreshPlayerEffects(player) {
  const passive = player.equipped.filter(Boolean).map((item) => item.effect).filter(Boolean);
  const active = [];
  if (player.effectState.shieldCharges > 0) active.push("shieldBurst");
  if (player.effectState.timeSlowRemaining > 0) active.push("timeSlowLocal");
  player.activeEffects = [...new Set([...passive, ...active])];
}

function spawnTemporaryPortalNearPlayer(player) {
  const angle = Math.random() * Math.PI * 2;
  const dist = 0.15 + Math.random() * 0.1;
  const portal = {
    id: `portal-breach-${player.clientId}-${runtime.tick}`,
    wx: wrapWorld(player.wx + Math.cos(angle) * dist, runtime.session.worldScale),
    wy: wrapWorld(player.wy + Math.sin(angle) * dist, runtime.session.worldScale),
    type: "unstable",
    wave: 0,
    spawnTime: runtime.simTime,
    lifespan: 15,
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
    source: "breachFlare",
    clientId: player.clientId,
  });
}

function applyConsumable(player, slotIndex) {
  if (!Number.isInteger(slotIndex) || slotIndex < 0 || slotIndex >= player.consumables.length) return;
  const item = player.consumables[slotIndex];
  if (!item || (item.charges || 0) <= 0) return;

  const effectId = item.useEffect;
  item.charges = Math.max(0, (item.charges || 0) - 1);
  if (item.charges <= 0) {
    player.consumables[slotIndex] = null;
  }

  switch (effectId) {
    case "shieldBurst":
      player.effectState.shieldCharges += 1;
      break;
    case "timeSlowLocal":
      player.effectState.timeSlowRemaining = SERVER_COMBAT.timeSlowDuration;
      break;
    case "breachFlare":
      spawnTemporaryPortalNearPlayer(player);
      break;
    case "signalPurge":
      break;
    default:
      break;
  }

  refreshPlayerEffects(player);
  publishEvent("player.effectUsed", {
    clientId: player.clientId,
    effectId,
    slotIndex,
  });
}

function applyPulse(player) {
  if (player.effectState.pulseCooldownRemaining > 0) return false;

  player.effectState.pulseCooldownRemaining = SERVER_COMBAT.pulseCooldown;
  player.vx -= player.lastInput.moveX * SERVER_COMBAT.pulseRecoilForce;
  player.vy -= player.lastInput.moveY * SERVER_COMBAT.pulseRecoilForce;

  for (const other of runtime.players.values()) {
    if (other.clientId === player.clientId || other.status !== "alive") continue;
    const dx = worldDisplacement(player.wx, other.wx, runtime.session.worldScale);
    const dy = worldDisplacement(player.wy, other.wy, runtime.session.worldScale);
    const dist = Math.hypot(dx, dy);
    if (dist < SERVER_COMBAT.pulseEntityRadius && dist > 0.001) {
      const force = SERVER_COMBAT.pulseEntityForce * (1 - dist / SERVER_COMBAT.pulseEntityRadius);
      other.vx += (dx / dist) * force;
      other.vy += (dy / dist) * force;
    }
  }

  for (const scav of runtime.mapState.scavengers) {
    if (scav.alive === false) continue;
    const dx = worldDisplacement(player.wx, scav.wx, runtime.session.worldScale);
    const dy = worldDisplacement(player.wy, scav.wy, runtime.session.worldScale);
    const dist = Math.hypot(dx, dy);
    if (dist < SERVER_COMBAT.pulseEntityRadius && dist > 0.001) {
      const force = SERVER_COMBAT.pulseEntityForce * (1 - dist / SERVER_COMBAT.pulseEntityRadius);
      scav.vx += (dx / dist) * force;
      scav.vy += (dy / dist) * force;
    }
  }

  for (const planetoid of runtime.mapState.planetoids) {
    if (planetoid.alive === false) continue;
    const dx = worldDisplacement(player.wx, planetoid.wx, runtime.session.worldScale);
    const dy = worldDisplacement(player.wy, planetoid.wy, runtime.session.worldScale);
    const dist = Math.hypot(dx, dy);
    if (dist < SERVER_COMBAT.pulseEntityRadius * 0.5 && dist > 0.001) {
      planetoid.wx = wrapWorld(planetoid.wx + (dx / dist) * 0.02, runtime.session.worldScale);
      planetoid.wy = wrapWorld(planetoid.wy + (dy / dist) * 0.02, runtime.session.worldScale);
    }
  }

  spikePlayerSignal(player, SIGNAL_CONFIG.pulseSpike);
  publishEvent("player.pulse", {
    clientId: player.clientId,
    wx: player.wx,
    wy: player.wy,
  });
  spawnWaveRing(player.wx, player.wy, 1.5);
  return true;
}

function addDroppedItemWreck(player, item) {
  if (!item) return;
  const inputAngle =
    Math.hypot(player.lastInput.moveX, player.lastInput.moveY) > 0.1
      ? Math.atan2(player.lastInput.moveY, player.lastInput.moveX)
      : Math.random() * Math.PI * 2;
  const rearAngle = inputAngle + Math.PI + (Math.random() - 0.5) * Math.PI;
  const ejectDist = 0.18;
  const ejectSpeed = 0.3;
  const wreck = {
    id: `wreck-drop-${player.clientId}-${runtime.tick}-${Math.random().toString(36).slice(2, 6)}`,
    wx: wrapWorld(player.wx + Math.cos(rearAngle) * ejectDist, runtime.session.worldScale),
    wy: wrapWorld(player.wy + Math.sin(rearAngle) * ejectDist, runtime.session.worldScale),
    type: "derelict",
    tier: item.tier || "common",
    size: "scattered",
    alive: true,
    looted: false,
    pickupCooldown: 1.5,
    vx: Math.cos(rearAngle) * ejectSpeed,
    vy: Math.sin(rearAngle) * ejectSpeed,
    loot: [{ ...item }],
    name: `dropped: ${item.name}`,
  };
  runtime.mapState.wrecks.push(wreck);
}

function applyInventoryAction(player, actionMessage) {
  if (player.status !== "alive") {
    return { ok: false, error: "Player is not alive" };
  }

  const { action, cargoSlot, equipSlot, consumableSlot } = actionMessage;
  let changed = false;
  let itemName = null;

  switch (action) {
    case "dropCargo": {
      if (cargoSlot < 0 || cargoSlot >= player.cargo.length) return { ok: false, error: "Invalid cargo slot" };
      const item = player.cargo[cargoSlot];
      if (!item) return { ok: false, error: "No cargo item in slot" };
      player.cargo[cargoSlot] = null;
      addDroppedItemWreck(player, item);
      itemName = item.name;
      changed = true;
      break;
    }
    case "equipCargo": {
      if (cargoSlot < 0 || cargoSlot >= player.cargo.length) return { ok: false, error: "Invalid cargo slot" };
      if (equipSlot < 0 || equipSlot >= 2) return { ok: false, error: "Invalid equip slot" };
      const item = player.cargo[cargoSlot];
      if (!item || item.subcategory !== "equippable") return { ok: false, error: "Cargo item is not equippable" };
      const prev = player.equipped[equipSlot] || null;
      player.equipped[equipSlot] = item;
      player.cargo[cargoSlot] = prev;
      itemName = item.name;
      refreshPlayerEffects(player);
      changed = true;
      break;
    }
    case "loadConsumable": {
      if (cargoSlot < 0 || cargoSlot >= player.cargo.length) return { ok: false, error: "Invalid cargo slot" };
      if (consumableSlot < 0 || consumableSlot >= 2) return { ok: false, error: "Invalid consumable slot" };
      const item = player.cargo[cargoSlot];
      if (!item || item.subcategory !== "consumable") return { ok: false, error: "Cargo item is not consumable" };
      const prev = player.consumables[consumableSlot] || null;
      player.consumables[consumableSlot] = item;
      player.cargo[cargoSlot] = prev;
      itemName = item.name;
      changed = true;
      break;
    }
    case "unequip": {
      if (equipSlot < 0 || equipSlot >= 2) return { ok: false, error: "Invalid equip slot" };
      const item = player.equipped[equipSlot];
      if (!item) return { ok: false, error: "No equipped item in slot" };
      const freeCargo = player.cargo.indexOf(null);
      if (freeCargo === -1) return { ok: false, error: "Cargo full" };
      player.equipped[equipSlot] = null;
      player.cargo[freeCargo] = item;
      itemName = item.name;
      refreshPlayerEffects(player);
      changed = true;
      break;
    }
    case "unloadConsumable": {
      if (consumableSlot < 0 || consumableSlot >= 2) return { ok: false, error: "Invalid consumable slot" };
      const item = player.consumables[consumableSlot];
      if (!item) return { ok: false, error: "No consumable in slot" };
      const freeCargo = player.cargo.indexOf(null);
      if (freeCargo === -1) return { ok: false, error: "Cargo full" };
      player.consumables[consumableSlot] = null;
      player.cargo[freeCargo] = item;
      itemName = item.name;
      changed = true;
      break;
    }
    default:
      return { ok: false, error: "Unknown inventory action" };
  }

  if (changed) {
    publishEvent("player.inventoryAction", {
      clientId: player.clientId,
      action,
      itemName,
    });
  }

  return { ok: changed, player };
}

function applyDebugPlayerState(player, body) {
  if (Number.isFinite(Number(body.wx))) player.wx = wrapWorld(Number(body.wx), runtime.session.worldScale);
  if (Number.isFinite(Number(body.wy))) player.wy = wrapWorld(Number(body.wy), runtime.session.worldScale);
  if (Number.isFinite(Number(body.vx))) player.vx = Number(body.vx);
  if (Number.isFinite(Number(body.vy))) player.vy = Number(body.vy);
  if (typeof body.status === "string" && body.status) player.status = body.status;
  return player;
}

function applyDebugScavengerState(scavenger, body) {
  if (Number.isFinite(Number(body.wx))) scavenger.wx = wrapWorld(Number(body.wx), runtime.session.worldScale);
  if (Number.isFinite(Number(body.wy))) scavenger.wy = wrapWorld(Number(body.wy), runtime.session.worldScale);
  if (Number.isFinite(Number(body.vx))) scavenger.vx = Number(body.vx);
  if (Number.isFinite(Number(body.vy))) scavenger.vy = Number(body.vy);
  if (Number.isFinite(Number(body.lootCount))) scavenger.lootCount = Math.max(0, Number(body.lootCount));
  if (typeof body.state === "string" && body.state) scavenger.state = body.state;
  if (typeof body.alive === "boolean") scavenger.alive = body.alive;
  return scavenger;
}

function nearestWell(entity) {
  let best = null;
  let bestDist = Infinity;
  for (const well of runtime.mapState.wells) {
    const dist = worldDistance(entity.wx, entity.wy, well.wx, well.wy, runtime.session.worldScale);
    if (dist < bestDist) {
      bestDist = dist;
      best = { well, dist };
    }
  }
  return best;
}

function nearestUnlootedWreck(entity) {
  let best = null;
  let bestDist = Infinity;
  for (const wreck of runtime.mapState.wrecks) {
    if (wreck.alive === false || wreck.looted) continue;
    const dist = worldDistance(entity.wx, entity.wy, wreck.wx, wreck.wy, runtime.session.worldScale);
    if (dist < bestDist) {
      bestDist = dist;
      best = { wreck, dist };
    }
  }
  return best;
}

function nearestPortal(entity) {
  let best = null;
  let bestDist = Infinity;
  for (const portal of runtime.mapState.portals) {
    if (portal.alive === false) continue;
    const dist = worldDistance(entity.wx, entity.wy, portal.wx, portal.wy, runtime.session.worldScale);
    if (dist < bestDist) {
      bestDist = dist;
      best = { portal, dist };
    }
  }
  return best;
}

function getAlivePlayers() {
  return Array.from(runtime.players.values()).filter((player) => player.status === "alive");
}

function collectNearestByDistance(originWX, originWY, entities, limit, getPosition = null) {
  const max = clampBudgetCount(limit, entities.length || 1);
  const ranked = [];
  for (const entity of entities) {
    if (!entity) continue;
    const pos = getPosition ? getPosition(entity) : entity;
    if (!pos) continue;
    const dist = worldDistance(originWX, originWY, pos.wx, pos.wy, runtime.session.worldScale);
    ranked.push({ entity, dist });
  }
  ranked.sort((a, b) => a.dist - b.dist);
  return ranked.slice(0, max);
}

function buildRelevanceView() {
  const alivePlayers = getAlivePlayers();
  const entityRadius = runtime.session.entityRelevanceRadius || runtime.session.worldScale;
  const scavengerRadius = runtime.session.scavengerRelevanceRadius || entityRadius;

  if (alivePlayers.length === 0) {
    return {
      alivePlayers,
      stars: [],
      wrecks: [],
      planetoids: [],
      scavengers: runtime.mapState.scavengers.filter((scav) => scav.alive !== false && scav.state === "dying"),
    };
  }

  function collectRelevantEntities(entities, radius, perPlayerLimit) {
    const limit = clampBudgetCount(perPlayerLimit, entities.length || 1);
    const selectedIds = new Set();
    const selected = [];

    for (const player of alivePlayers) {
      const candidates = [];
      for (const entity of entities) {
        if (!entity || entity.alive === false) continue;
        const dist = worldDistance(entity.wx, entity.wy, player.wx, player.wy, runtime.session.worldScale);
        if (dist > radius) continue;
        candidates.push({ entity, dist });
      }
      candidates.sort((a, b) => a.dist - b.dist);
      for (let i = 0; i < Math.min(limit, candidates.length); i++) {
        const entity = candidates[i].entity;
        if (selectedIds.has(entity.id)) continue;
        selectedIds.add(entity.id);
        selected.push(entity);
      }
    }

    return selected;
  }

  return {
    alivePlayers,
    stars: collectRelevantEntities(
      runtime.mapState.stars,
      entityRadius,
      runtime.session.maxRelevantStarsPerPlayer || runtime.mapState.stars.length || 1
    ),
    wrecks: collectRelevantEntities(
      runtime.mapState.wrecks,
      entityRadius,
      runtime.session.maxRelevantWrecksPerPlayer || runtime.mapState.wrecks.length || 1
    ),
    planetoids: collectRelevantEntities(
      runtime.mapState.planetoids,
      entityRadius,
      runtime.session.maxRelevantPlanetoidsPerPlayer || runtime.mapState.planetoids.length || 1
    ),
    scavengers: [
      ...runtime.mapState.scavengers.filter((scav) => scav.alive !== false && scav.state === "dying"),
      ...collectRelevantEntities(
        runtime.mapState.scavengers.filter((scav) => scav.state !== "dying"),
        scavengerRadius,
        runtime.session.maxRelevantScavengersPerPlayer || runtime.mapState.scavengers.length || 1
      ),
    ].filter((scav, index, list) => list.findIndex((entry) => entry.id === scav.id) === index),
  };
}

function steerToward(entity, targetWX, targetWY, intensity = 1) {
  const dx = worldDisplacement(entity.wx, targetWX, runtime.session.worldScale);
  const dy = worldDisplacement(entity.wy, targetWY, runtime.session.worldScale);
  const dist = Math.hypot(dx, dy);
  if (dist < 0.0001) {
    entity.thrustIntensity = 0;
    return;
  }
  entity.facing = Math.atan2(dy, dx);
  entity.thrustIntensity = intensity;
}

function applyWellGravityToEntity(entity, dt, pullScale = 0.02) {
  let ax = 0;
  let ay = 0;
  for (const well of runtime.mapState.wells) {
    const dx = worldDisplacement(entity.wx, well.wx, runtime.session.worldScale);
    const dy = worldDisplacement(entity.wy, well.wy, runtime.session.worldScale);
    const dist = Math.hypot(dx, dy);
    if (dist < 0.0001) continue;
    if (dist < well.killRadius) {
      if (entity.state !== "dying") {
        entity.state = "dying";
        entity.deathTimer = 0;
        entity.deathWellId = well.id;
        entity.deathWellWX = well.wx;
        entity.deathWellWY = well.wy;
        entity.deathStartWX = entity.wx;
        entity.deathStartWY = entity.wy;
        entity.deathAngle = Math.atan2(entity.wy - well.wy, entity.wx - well.wx);
        entity.vx = 0;
        entity.vy = 0;
      }
      return false;
    }
    const pull = (pullScale * well.mass) / Math.pow(Math.max(dist, 0.02), 1.8);
    ax += (dx / dist) * pull;
    ay += (dy / dist) * pull;
  }
  entity.vx += ax * dt;
  entity.vy += ay * dt;
  return true;
}

function spawnScavengerDeathDrops(scav) {
  if ((scav.lootCount || 0) <= 0) return [];
  const tier = scav.archetype === "vulture" ? 2 : 1;
  const drops = [];
  for (let i = 0; i < scav.lootCount; i++) {
    const angle = Math.random() * Math.PI * 2;
    const ejectDist = 0.05 + Math.random() * 0.05;
    const ejectSpeed = 0.2 + Math.random() * 0.2;
    const wreck = {
      id: `wreck-scav-${scav.id}-${runtime.tick}-${i + 1}`,
      wx: wrapWorld(scav.wx + Math.cos(angle) * ejectDist, runtime.session.worldScale),
      wy: wrapWorld(scav.wy + Math.sin(angle) * ejectDist, runtime.session.worldScale),
      type: "derelict",
      tier,
      size: "scattered",
      alive: true,
      looted: false,
      pickupCooldown: 0.5,
      vx: Math.cos(angle) * ejectSpeed,
      vy: Math.sin(angle) * ejectSpeed,
      loot: [],
      name: `${scav.name} debris`,
    };
    runtime.mapState.wrecks.push(wreck);
    drops.push(wreck.id);
  }
  return drops;
}

function updateScavengerDeathSpiral(scav, dt) {
  const duration = SCAVENGER_CONFIG.deathSpiralDuration;
  scav.deathTimer += dt;

  if (scav.deathTimer >= duration) {
    scav.alive = false;
    const dropIds = spawnScavengerDeathDrops(scav);
    publishEvent("scavenger.consumed", {
      scavengerId: scav.id,
      name: scav.name,
      wellId: scav.deathWellId,
      wx: scav.wx,
      wy: scav.wy,
      lootCount: scav.lootCount || 0,
      droppedWreckIds: dropIds,
    });
    return false;
  }

  const t = scav.deathTimer / duration;
  const dx = worldDisplacement(scav.deathStartWX, scav.deathWellWX, runtime.session.worldScale);
  const dy = worldDisplacement(scav.deathStartWY, scav.deathWellWY, runtime.session.worldScale);
  const startDist = Math.hypot(dx, dy);
  const radius = startDist * (1 - t);
  scav.deathAngle += (4 + t * 12) * dt;
  scav.wx = wrapWorld(scav.deathWellWX + Math.cos(scav.deathAngle) * radius, runtime.session.worldScale);
  scav.wy = wrapWorld(scav.deathWellWY + Math.sin(scav.deathAngle) * radius, runtime.session.worldScale);
  scav.facing += 15 * dt;
  return true;
}

function tickScavengers(dt, scavengers = runtime.mapState.scavengers) {
  const activePortalCount = runtime.mapState.portals.filter((portal) => portal.alive !== false).length;

  for (const scav of scavengers) {
    if (scav.alive === false) continue;

    if (scav.state === "dying") {
      updateScavengerDeathSpiral(scav, dt);
      continue;
    }

    scav.decisionTimer -= dt;
    if (scav.decisionTimer <= 0) {
      scav.decisionTimer = SCAVENGER_CONFIG.decisionInterval;
      const nearest = nearestWell(scav);
      if (nearest && nearest.dist < SCAVENGER_CONFIG.fleeWellDist) {
        scav.state = "flee";
        scav.targetWreckId = null;
        scav.targetPortalId = null;
      } else {
        const wreckTarget = nearestUnlootedWreck(scav);
        const portalTarget = nearestPortal(scav);
        if (scav.lootCount >= scav.lootTarget || activePortalCount <= 1) {
          scav.state = portalTarget ? "extract" : "drift";
          scav.targetPortalId = portalTarget?.portal?.id || null;
          scav.targetWreckId = null;
        } else if (wreckTarget && wreckTarget.dist <= SCAVENGER_CONFIG.sensorRange) {
          scav.state = "loot";
          scav.targetWreckId = wreckTarget.wreck.id;
          scav.targetPortalId = null;
        } else {
          scav.state = "drift";
          scav.driftHeading = Math.random() * Math.PI * 2;
          scav.targetWreckId = null;
          scav.targetPortalId = null;
        }
      }
    }

    if (scav.state === "flee") {
      const nearest = nearestWell(scav);
      if (nearest) {
        const dx = worldDisplacement(nearest.well.wx, scav.wx, runtime.session.worldScale);
        const dy = worldDisplacement(nearest.well.wy, scav.wy, runtime.session.worldScale);
        scav.facing = Math.atan2(dy, dx);
        scav.thrustIntensity = 1;
      } else {
        scav.thrustIntensity = 0;
      }
    } else if (scav.state === "loot") {
      const wreck = runtime.mapState.wrecks.find((entry) => entry.id === scav.targetWreckId && entry.alive !== false && !entry.looted);
      if (!wreck) {
        scav.state = "drift";
        scav.thrustIntensity = 0;
      } else {
        steerToward(scav, wreck.wx, wreck.wy, scav.archetype === "vulture" ? 1 : 0.8);
        const dist = worldDistance(scav.wx, scav.wy, wreck.wx, wreck.wy, runtime.session.worldScale);
        if (dist < SCAVENGER_CONFIG.pickupRadius) {
          scav.lootCount += Math.max(1, wreck.loot?.length || 1);
          wreck.looted = true;
          publishEvent("scavenger.loot", {
            scavengerId: scav.id,
            wreckId: wreck.id,
            lootCount: scav.lootCount,
          });
          scav.state = "drift";
          scav.thrustIntensity = 0;
        }
      }
    } else if (scav.state === "extract") {
      const portal = runtime.mapState.portals.find((entry) => entry.id === scav.targetPortalId && entry.alive !== false);
      if (!portal) {
        scav.state = "drift";
        scav.thrustIntensity = 0;
      } else {
        steerToward(scav, portal.wx, portal.wy, 1);
        const dist = worldDistance(scav.wx, scav.wy, portal.wx, portal.wy, runtime.session.worldScale);
        if (dist < portalCaptureRadius(portal)) {
          scav.alive = false;
          publishEvent("scavenger.extracted", {
            scavengerId: scav.id,
            name: scav.name,
            portalId: portal.id,
            lootCount: scav.lootCount,
          });
          continue;
        }
      }
    } else {
      scav.facing = scav.driftHeading ?? scav.facing;
      scav.thrustIntensity = 0.2;
    }

    scav.vx += Math.cos(scav.facing) * SCAVENGER_CONFIG.thrustAccel * scav.thrustIntensity * dt;
    scav.vy += Math.sin(scav.facing) * SCAVENGER_CONFIG.thrustAccel * scav.thrustIntensity * dt;
    if (!applyWellGravityToEntity(scav, dt, 0.02)) continue;

    const dragFactor = Math.exp(-SCAVENGER_CONFIG.drag * dt * 60);
    scav.vx *= dragFactor;
    scav.vy *= dragFactor;
    scav.wx = ((scav.wx + scav.vx * dt) % runtime.session.worldScale + runtime.session.worldScale) % runtime.session.worldScale;
    scav.wy = ((scav.wy + scav.vy * dt) % runtime.session.worldScale + runtime.session.worldScale) % runtime.session.worldScale;
  }

  runtime.mapState.scavengers = runtime.mapState.scavengers.filter((scav) => scav.alive !== false);
}

function runSystemAtRate(key, hz, baseDt, fn) {
  if (!Number.isFinite(hz) || hz <= 0) return;
  const step = 1 / hz;
  runtime.systemAccumulators[key] = (runtime.systemAccumulators[key] || 0) + baseDt;
  let iterations = 0;
  while (runtime.systemAccumulators[key] >= step && iterations < 2) {
    fn(step);
    runtime.systemAccumulators[key] -= step;
    iterations += 1;
  }
  if (runtime.systemAccumulators[key] > step * 2) {
    runtime.systemAccumulators[key] = step;
  }
}

// --- Signal System ---
// Signal is a 0-1 float per player. Rises from activity, decays when quiet.
// Zone crossings publish events for client audio/visual feedback.

function signalZoneForLevel(level) {
  const cfg = SIGNAL_CONFIG;
  if (level <= cfg.ghostMax) return "ghost";
  if (level <= cfg.whisperMax) return "whisper";
  if (level <= cfg.presenceMax) return "presence";
  if (level <= cfg.beaconMax) return "beacon";
  if (level <= cfg.flareMax) return "flare";
  return "threshold";
}

function tickPlayerSignal(player, dt) {
  const cfg = SIGNAL_CONFIG;
  const sig = player.signal;
  const input = player.lastInput;
  const speed = Math.sqrt(player.vx * player.vx + player.vy * player.vy);
  const isThrusting = input.thrust > 0.1;

  // --- Generation ---
  let generation = 0;

  if (isThrusting) {
    // Base thrust signal, scaled by intensity
    generation += cfg.thrustBaseRate * input.thrust;
    // TODO: opposition multiplier requires flow field sampling (analytical model)
    // For now, scale by raw speed as a proxy — faster = louder
    generation += cfg.thrustBaseRate * Math.min(speed * 5, cfg.thrustOppositionMult - 1.0) * input.thrust;
  } else if (speed > 0.001) {
    // Coasting — minimal signal
    generation += cfg.coastRate;
  }

  // Well proximity — near wells is noisy
  for (const well of runtime.mapState.wells) {
    const dist = worldDistance(player.wx, player.wy, well.wx, well.wy, runtime.session.worldScale);
    if (dist < cfg.wellProximityDist) {
      generation += cfg.wellProximityRate;
      break; // only count once
    }
  }

  // --- Decay ---
  let decay = 0;
  if (!isThrusting) {
    decay = cfg.decayBase;

    // Enhanced decay in wreck wake zones
    for (const wreck of runtime.mapState.wrecks) {
      if (wreck.looted) continue;
      const dist = worldDistance(player.wx, player.wy, wreck.wx, wreck.wy, runtime.session.worldScale);
      if (dist < 0.15) {
        decay = cfg.decayWreckWake;
        break;
      }
    }

    // Enhanced decay in accretion shadows
    for (const well of runtime.mapState.wells) {
      const dist = worldDistance(player.wx, player.wy, well.wx, well.wy, runtime.session.worldScale);
      if (dist < 0.25) {
        decay = Math.max(decay, cfg.decayAccretionShadow);
        break;
      }
    }
  }

  // --- Apply ---
  sig.level = Math.max(0, Math.min(1, sig.level + (generation - decay) * dt));

  // --- Zone crossing ---
  const newZone = signalZoneForLevel(sig.level);
  if (newZone !== sig.zone) {
    sig.prevZone = sig.zone;
    sig.zone = newZone;
    publishEvent("signal.zoneCrossing", {
      clientId: player.clientId,
      from: sig.prevZone,
      to: sig.zone,
      level: sig.level,
    });
  }
}

function spikePlayerSignal(player, amount) {
  player.signal.level = Math.min(1, player.signal.level + amount);
  const newZone = signalZoneForLevel(player.signal.level);
  if (newZone !== player.signal.zone) {
    player.signal.prevZone = player.signal.zone;
    player.signal.zone = newZone;
    publishEvent("signal.zoneCrossing", {
      clientId: player.clientId,
      from: player.signal.prevZone,
      to: player.signal.zone,
      level: player.signal.level,
    });
  }
}

// --- Inhibitor System ---
// Pressure builds from player signal + time + well growth.
// Forms: 0=inactive, 1=glitch, 2=swarm, 3=vessel.

function tickInhibitor(dt) {
  const inh = runtime.inhibitor;
  const cfg = INHIBITOR_CONFIG;
  const ws = runtime.session.worldScale;
  inh.localTime += dt;

  // Find peak player signal
  let peakSignal = 0;
  let loudestPlayer = null;
  for (const player of runtime.players.values()) {
    if (player.status !== "alive") continue;
    if (player.signal.level > peakSignal) {
      peakSignal = player.signal.level;
      loudestPlayer = player;
    }
  }

  // Pressure accumulation (always, even when inactive)
  inh.pressure += peakSignal * cfg.pressureFromSignal * dt;
  inh.pressure += (runtime.simTime / RUN_DURATION) * cfg.pressureFromTime * dt;
  inh.pressure = Math.min(1.5, inh.pressure); // soft cap

  // --- Form transitions ---
  const glitchThreshold = inh.threshold * cfg.glitchFraction;

  if (inh.form === 0 && inh.pressure >= glitchThreshold) {
    // Spawn Glitch at map edge farthest from loudest player
    inh.form = 1;
    inh.intensity = 0;
    inh.radius = cfg.glitchRadius;
    if (loudestPlayer) {
      // Farthest edge point
      inh.wx = (loudestPlayer.wx + ws / 2) % ws;
      inh.wy = (loudestPlayer.wy + ws / 2) % ws;
    } else {
      inh.wx = Math.random() * ws;
      inh.wy = Math.random() * ws;
    }
    inh.silenceTimer = 0;
    publishEvent("inhibitor.form", { form: 1, pressure: inh.pressure });
  }

  if (inh.form === 1 && inh.pressure >= inh.threshold) {
    // Irreversible: Swarm
    inh.form = 2;
    inh.intensity = 0;
    inh.radius = cfg.swarmRadius;
    inh.vesselTimer = 0;
    inh.swarmTrackTimer = 0;
    if (loudestPlayer) {
      inh.swarmTargetX = loudestPlayer.wx;
      inh.swarmTargetY = loudestPlayer.wy;
    }
    publishEvent("inhibitor.form", { form: 2, pressure: inh.pressure });
    publishEvent("inhibitor.wake", { wx: inh.wx, wy: inh.wy });
  }

  if (inh.form === 2) {
    inh.vesselTimer += dt;
    if (inh.vesselTimer >= cfg.vesselTimeToForm || peakSignal >= 1.0) {
      inh.form = 3;
      inh.intensity = 0;
      inh.radius = cfg.swarmRadius * 1.5;
      publishEvent("inhibitor.form", { form: 3, pressure: inh.pressure });
    }
  }

  // --- Form behavior ---
  if (inh.form === 1) {
    // Glitch: drift toward last high-signal position, dissipate if quiet
    inh.intensity = Math.min(1, inh.intensity + dt * 0.5);
    if (peakSignal < SIGNAL_CONFIG.ghostMax) {
      inh.silenceTimer += dt;
      if (inh.silenceTimer >= cfg.glitchDissipateTime) {
        inh.form = 0;
        inh.intensity = 0;
        publishEvent("inhibitor.form", { form: 0, pressure: inh.pressure });
      }
    } else {
      inh.silenceTimer = 0;
    }
    // Drift
    if (loudestPlayer) {
      const speed = peakSignal > cfg.glitchSolidifySignal ? cfg.glitchSolidifySpeed : cfg.glitchDriftSpeed;
      const dx = worldDisplacement(inh.wx, loudestPlayer.wx, ws);
      const dy = worldDisplacement(inh.wy, loudestPlayer.wy, ws);
      const dist = Math.hypot(dx, dy);
      if (dist > 0.01) {
        inh.wx = ((inh.wx + (dx / dist) * speed * dt) % ws + ws) % ws;
        inh.wy = ((inh.wy + (dy / dist) * speed * dt) % ws + ws) % ws;
      }
    }
  }

  if (inh.form === 2) {
    // Swarm: hunt by signal, speed scales with player activity
    inh.intensity = Math.min(1, inh.intensity + dt * 0.3);
    inh.swarmTrackTimer += dt;
    if (inh.swarmTrackTimer >= cfg.swarmTrackInterval && loudestPlayer) {
      inh.swarmTargetX = loudestPlayer.wx;
      inh.swarmTargetY = loudestPlayer.wy;
      inh.swarmTrackTimer = 0;
    }
    // Speed from player state
    let speed = cfg.swarmSpeedSilent;
    if (peakSignal > SIGNAL_CONFIG.flareMax) speed = cfg.swarmSpeedFlare;
    else if (peakSignal > SIGNAL_CONFIG.presenceMax) speed = cfg.swarmSpeedHeavy;
    else if (peakSignal > SIGNAL_CONFIG.ghostMax) speed = cfg.swarmSpeedLight;

    const dx = worldDisplacement(inh.wx, inh.swarmTargetX, ws);
    const dy = worldDisplacement(inh.wy, inh.swarmTargetY, ws);
    const dist = Math.hypot(dx, dy);
    if (dist > 0.01) {
      inh.wx = ((inh.wx + (dx / dist) * speed * dt) % ws + ws) % ws;
      inh.wy = ((inh.wy + (dy / dist) * speed * dt) % ws + ws) % ws;
    }

    // Contact effects
    for (const player of runtime.players.values()) {
      if (player.status !== "alive") continue;
      const pd = worldDistance(inh.wx, inh.wy, player.wx, player.wy, ws);
      if (pd < inh.radius * 0.5) {
        spikePlayerSignal(player, cfg.swarmContactSignalSpike * dt);
        // Drain cargo
        if (Math.random() < cfg.swarmContactDrain * dt) {
          for (let i = player.cargo.length - 1; i >= 0; i--) {
            if (player.cargo[i]) {
              player.cargo[i] = null;
              publishEvent("inhibitor.drainCargo", { clientId: player.clientId });
              break;
            }
          }
        }
      }
    }
  }

  if (inh.form === 3) {
    // Vessel: constant advance toward player, kills on contact
    inh.intensity = Math.min(1, inh.intensity + dt * 0.2);
    if (loudestPlayer) {
      const dx = worldDisplacement(inh.wx, loudestPlayer.wx, ws);
      const dy = worldDisplacement(inh.wy, loudestPlayer.wy, ws);
      const dist = Math.hypot(dx, dy);
      if (dist > 0.01) {
        inh.wx = ((inh.wx + (dx / dist) * cfg.vesselSpeed * dt) % ws + ws) % ws;
        inh.wy = ((inh.wy + (dy / dist) * cfg.vesselSpeed * dt) % ws + ws) % ws;
      }

      // Gravity pull
      for (const player of runtime.players.values()) {
        if (player.status !== "alive") continue;
        const pd = worldDistance(inh.wx, inh.wy, player.wx, player.wy, ws);
        if (pd < cfg.vesselGravityRange && pd > 0.001) {
          const pull = cfg.vesselGravityStrength * (1 - pd / cfg.vesselGravityRange);
          const pdx = worldDisplacement(player.wx, inh.wx, ws);
          const pdy = worldDisplacement(player.wy, inh.wy, ws);
          player.vx += (pdx / pd) * pull * dt;
          player.vy += (pdy / pd) * pull * dt;
        }
        // Kill on contact
        if (pd < cfg.vesselKillRadius) {
          player.status = "dead";
          player.vx = 0;
          player.vy = 0;
          publishEvent("player.died", { clientId: player.clientId, cause: "vessel" });
        }
      }

      // Block portals
      for (const portal of runtime.mapState.portals) {
        if (!portal.alive) continue;
        const portalDist = worldDistance(inh.wx, inh.wy, portal.wx, portal.wy, ws);
        if (portalDist < cfg.vesselPortalBlockRange) {
          portal.alive = false;
          publishEvent("portal.blocked", { portalId: portal.id });
        }
      }
    }

    // Final portal
    if (!inh.finalPortalSpawned && inh.vesselTimer >= cfg.vesselTimeToForm + cfg.finalPortalDelay) {
      // Spawn guaranteed portal farthest from Vessel
      let bestDist = 0, bestX = ws / 2, bestY = ws / 2;
      for (let i = 0; i < 8; i++) {
        const cx = Math.random() * ws;
        const cy = Math.random() * ws;
        const d = worldDistance(inh.wx, inh.wy, cx, cy, ws);
        if (d > bestDist) { bestDist = d; bestX = cx; bestY = cy; }
      }
      runtime.mapState.portals.push({
        id: `portal-final-${runtime.tick}`,
        wx: bestX, wy: bestY,
        type: "standard", wave: 99,
        spawnTime: runtime.simTime,
        lifespan: cfg.finalPortalLifespan,
        alive: true, opacity: 1,
      });
      inh.finalPortalSpawned = true;
      publishEvent("inhibitor.finalPortal", { wx: bestX, wy: bestY });
    }
  }
}

function tickSim() {
  if (runtime.session.status !== "running") return;
  const dt = 1 / runtime.session.tickHz;
  runtime.tick += 1;
  runtime.simTime += dt;
  const relevance = buildRelevanceView();

  runSystemAtRate("world", runtime.session.worldTickHz || runtime.session.tickHz, dt, (stepDt) => {
    tickWells(stepDt);
    tickStars(stepDt, relevance.stars);
    tickWrecks(stepDt, relevance.wrecks);
    tickPlanetoids(stepDt, relevance.planetoids);
  });
  runSystemAtRate("growth", runtime.session.growthTickHz || runtime.session.tickHz, dt, tickGrowth);
  runSystemAtRate("portals", runtime.session.portalTickHz || runtime.session.tickHz, dt, tickPortals);
  runSystemAtRate("scavengers", runtime.session.scavengerTickHz || runtime.session.tickHz, dt, (stepDt) =>
    tickScavengers(stepDt, relevance.scavengers)
  );
  runSystemAtRate("waves", runtime.session.waveTickHz || runtime.session.tickHz, dt, tickWaveRings);
  tickInhibitor(dt);
  maybeCollapseRun();

  for (const player of runtime.players.values()) {
    if (player.status !== "alive") continue;

    if (player.effectState.pulseCooldownRemaining > 0) {
      player.effectState.pulseCooldownRemaining = Math.max(0, player.effectState.pulseCooldownRemaining - dt);
    }
    if (player.effectState.timeSlowRemaining > 0) {
      const wasActive = player.effectState.timeSlowRemaining > 0;
      player.effectState.timeSlowRemaining = Math.max(0, player.effectState.timeSlowRemaining - dt);
      if (wasActive && player.effectState.timeSlowRemaining <= 0) {
        refreshPlayerEffects(player);
        publishEvent("player.effectExpired", {
          clientId: player.clientId,
          effectId: "timeSlowLocal",
        });
      }
    }

    const input = player.lastInput;
    if (input.consumeSlot !== null && input.consumeSlot !== undefined) {
      applyConsumable(player, input.consumeSlot);
      player.lastInput = { ...player.lastInput, consumeSlot: null };
    }

    if (input.pulse) {
      applyPulse(player);
      player.lastInput = { ...player.lastInput, pulse: false };
    }

    const playerDt =
      player.effectState.timeSlowRemaining > 0
        ? dt * SERVER_COMBAT.timeSlowScale
        : dt;
    const accel = 2.5 * input.thrust;
    player.vx += input.moveX * accel * playerDt;
    player.vy += input.moveY * accel * playerDt;
    applyWellGravity(player, playerDt);
    if (player.status !== "alive") continue;
    applyStarPush(player, playerDt, relevance.stars);
    applyPlanetoidPush(player, playerDt, relevance.planetoids);
    applyWaveRingPush(player, playerDt);
    player.vx *= Math.pow(0.92, playerDt * 15);
    player.vy *= Math.pow(0.92, playerDt * 15);
    player.wx = ((player.wx + player.vx * playerDt) % runtime.session.worldScale + runtime.session.worldScale) % runtime.session.worldScale;
    player.wy = ((player.wy + player.vy * playerDt) % runtime.session.worldScale + runtime.session.worldScale) % runtime.session.worldScale;
    applyScavengerBump(player, relevance.scavengers);

    tickPlayerPickups(player, relevance.wrecks);
    tickExtraction(player);
    if (player.status !== "alive") continue;
    tickPlayerSignal(player, playerDt);
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
        maps: Object.values(PLAYABLE_MAPS).map((map) => {
          const profile = getSimScaleProfile(map.id, map.worldScale);
          return {
            id: map.id,
            name: map.name,
            worldScale: map.worldScale,
            fluidResolution: map.fluidResolution,
            wellCount: map.wells.length,
            starCount: map.stars.length,
            wreckCount: map.wrecks.length,
            planetoidCount: map.planetoids.length,
            simScaleProfile: profile.profileId,
            tickHz: profile.tickHz,
            snapshotHz: profile.snapshotHz,
            worldTickHz: profile.worldTickHz,
            portalTickHz: profile.portalTickHz,
            growthTickHz: profile.growthTickHz,
            scavengerTickHz: profile.scavengerTickHz,
            waveTickHz: profile.waveTickHz,
            entityRelevanceRadius: profile.entityRelevanceRadius,
            scavengerRelevanceRadius: profile.scavengerRelevanceRadius,
            spawnScavengersBase: profile.spawnScavengersBase,
            spawnScavengersPerPlayer: profile.spawnScavengersPerPlayer,
            maxScavengers: profile.maxScavengers,
            maxRelevantStarsPerPlayer: profile.maxRelevantStarsPerPlayer,
            maxRelevantPlanetoidsPerPlayer: profile.maxRelevantPlanetoidsPerPlayer,
            maxRelevantWrecksPerPlayer: profile.maxRelevantWrecksPerPlayer,
            maxRelevantScavengersPerPlayer: profile.maxRelevantScavengersPerPlayer,
            maxWellInfluencesPerPlayer: profile.maxWellInfluencesPerPlayer,
            maxWaveInfluencesPerPlayer: profile.maxWaveInfluencesPerPlayer,
            maxPickupChecksPerPlayer: profile.maxPickupChecksPerPlayer,
            maxPortalChecksPerPlayer: profile.maxPortalChecksPerPlayer,
          };
        }),
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
      if (runtime.session.status === "running") {
        const permission = ensureHostPermission(String(body.requesterId || "").trim());
        if (!permission.ok) {
          sendJson(res, 403, { ok: false, error: permission.error, session: runtime.session });
          return;
        }
      }
      startSession(body);
      sendJson(res, 200, { ok: true, session: runtime.session });
      return;
    }

    if (req.method === "POST" && req.url === "/session/reset") {
      const body = await readJson(req);
      const permission = ensureHostPermission(String(body.requesterId || "").trim());
      if (!permission.ok) {
        sendJson(res, 403, { ok: false, error: permission.error, session: runtime.session });
        return;
      }
      startSession({
        ...runtime.session,
        requesterId: runtime.session.hostClientId,
        requesterName: runtime.session.hostName,
      });
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
        refreshPlayerEffects(player);
        const spawn = findSafeSpawn(runtime.mapState);
        player.wx = spawn.wx;
        player.wy = spawn.wy;
        runtime.players.set(clientId, player);
        if (!runtime.session.hostClientId) assignHost(clientId, player.name);
        publishEvent("player.joined", { clientId, name: player.name, wx: player.wx, wy: player.wy });
      } else if (body.name) {
        player.name = String(body.name);
        if (Array.isArray(body.equipped)) {
          player.equipped = cloneLoadoutItems(body.equipped);
          refreshPlayerEffects(player);
        }
        if (Array.isArray(body.consumables)) {
          player.consumables = cloneLoadoutItems(body.consumables);
        }
      }

      sendJson(res, 200, { ok: true, player });
      return;
    }

    if (req.method === "POST" && req.url === "/leave") {
      const body = await readJson(req);
      const clientId = String(body.clientId || "").trim();
      if (!clientId) {
        sendJson(res, 400, { ok: false, error: "clientId is required" });
        return;
      }
      const player = runtime.players.get(clientId);
      if (!player) {
        sendJson(res, 404, { ok: false, error: "Unknown client" });
        return;
      }
      runtime.players.delete(clientId);
      publishEvent("player.left", {
        clientId,
        name: player.name,
      });
      promoteHostIfNeeded();
      sendJson(res, 200, { ok: true, session: runtime.session, playerCount: runtime.players.size });
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
      player.lastInput = {
        ...message,
        pulse: Boolean(player.lastInput.pulse || message.pulse),
        consumeSlot:
          message.consumeSlot === null || message.consumeSlot === undefined
            ? player.lastInput.consumeSlot
            : message.consumeSlot,
      };
      sendJson(res, 200, { ok: true, acceptedSeq: message.seq, tick: runtime.tick });
      return;
    }

    if (req.method === "POST" && req.url === "/inventory/action") {
      const body = await readJson(req);
      const message = normalizeInventoryAction(body);
      if (!message.clientId) {
        sendJson(res, 400, { ok: false, error: "clientId is required" });
        return;
      }
      const player = runtime.players.get(message.clientId);
      if (!player) {
        sendJson(res, 404, { ok: false, error: "Unknown client" });
        return;
      }
      const result = applyInventoryAction(player, message);
      if (!result.ok) {
        sendJson(res, 409, { ok: false, error: result.error });
        return;
      }
      sendJson(res, 200, { ok: true, player, snapshot: snapshotBody() });
      return;
    }

    if (req.method === "POST" && req.url === "/debug/player-state") {
      const body = await readJson(req);
      const clientId = String(body.clientId || "").trim();
      if (!clientId) {
        sendJson(res, 400, { ok: false, error: "clientId is required" });
        return;
      }
      const player = runtime.players.get(clientId);
      if (!player) {
        sendJson(res, 404, { ok: false, error: "Unknown client" });
        return;
      }
      applyDebugPlayerState(player, body);
      sendJson(res, 200, { ok: true, player, snapshot: snapshotBody() });
      return;
    }

    if (req.method === "POST" && req.url === "/debug/scavenger-state") {
      const body = await readJson(req);
      const scavengerId = String(body.scavengerId || "").trim();
      if (!scavengerId) {
        sendJson(res, 400, { ok: false, error: "scavengerId is required" });
        return;
      }
      const scavenger = runtime.mapState.scavengers.find((entry) => entry.id === scavengerId);
      if (!scavenger) {
        sendJson(res, 404, { ok: false, error: "Unknown scavenger" });
        return;
      }
      applyDebugScavengerState(scavenger, body);
      sendJson(res, 200, { ok: true, scavenger, snapshot: snapshotBody() });
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
