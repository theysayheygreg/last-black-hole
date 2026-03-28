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

function cloneMapState(mapId) {
  const map = PLAYABLE_MAPS[mapId] || PLAYABLE_MAPS.shallows;
  return {
    id: map.id,
    name: map.name,
    worldScale: map.worldScale,
    fluidResolution: map.fluidResolution,
    wells: map.wells.map((well) => ({ ...well })),
    stars: map.stars.map((star) => ({ ...star })),
    wrecks: map.wrecks.map((wreck) => ({ ...wreck, alive: true })),
    planetoids: map.planetoids.map((planetoid) => ({ ...planetoid })),
    portals: [],
  };
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
  mapState: cloneMapState("shallows"),
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
  };
}

function startSession(config = {}) {
  const requestedMapId = String(config.mapId || "shallows");
  const mapState = cloneMapState(requestedMapId);
  runtime.session = {
    id: crypto.randomUUID(),
    status: "running",
    mapId: mapState.id,
    mapName: mapState.name,
    worldScale: Number.isFinite(Number(config.worldScale)) ? Number(config.worldScale) : mapState.worldScale,
    tickHz: Number.isFinite(Number(config.tickHz)) ? Number(config.tickHz) : DEFAULT_TICK_HZ,
    snapshotHz: Number.isFinite(Number(config.snapshotHz)) ? Number(config.snapshotHz) : DEFAULT_SNAPSHOT_HZ,
    maxPlayers: Number.isFinite(Number(config.maxPlayers)) ? Number(config.maxPlayers) : DEFAULT_MAX_PLAYERS,
  };
  mapState.worldScale = runtime.session.worldScale;
  runtime.mapState = mapState;
  runtime.tick = 0;
  runtime.simTime = 0;
  runtime.players.clear();
  runtime.recentEvents = [];
  runtime.nextEventSeq = 1;
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
    })),
    world: {
      wells: runtime.mapState.wells,
      stars: runtime.mapState.stars,
      wrecks: runtime.mapState.wrecks.filter((wreck) => wreck.alive !== false),
      planetoids: runtime.mapState.planetoids,
      portals: runtime.mapState.portals,
    },
    recentEvents: runtime.recentEvents.slice(-32),
  };
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
      publishEvent("player.died", {
        clientId: player.clientId,
        cause: "well",
        wellId: well.id,
        wellName: well.name || well.id,
      });
      return;
    }
    const pull = (0.025 * well.mass) / Math.pow(Math.max(dist, 0.02), 1.8);
    ax += (dx / dist) * pull;
    ay += (dy / dist) * pull;
  }
  player.vx += ax * dt;
  player.vy += ay * dt;
}

function tickSim() {
  if (runtime.session.status !== "running") return;
  const dt = 1 / runtime.session.tickHz;
  runtime.tick += 1;
  runtime.simTime += dt;

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
        const spawn = findSafeSpawn(runtime.mapState);
        player.wx = spawn.wx;
        player.wy = spawn.wy;
        runtime.players.set(clientId, player);
        publishEvent("player.joined", { clientId, name: player.name, wx: player.wx, wy: player.wy });
      } else if (body.name) {
        player.name = String(body.name);
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

startSession();
server.listen(PORT, HOST, () => {
  writeFiles();
  console.log(`[${LOG_LABEL}] listening on http://${HOST}:${PORT}/`);
});
