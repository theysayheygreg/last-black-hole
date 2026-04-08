#!/usr/bin/env node

const http = require("http");
const fs = require("fs");
const path = require("path");
const { ControlPlaneStore } = require("./control-plane-store.js");
const { SessionRegistry } = require("./session-registry.js");

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
    let raw = "";
    req.on("data", (chunk) => {
      raw += chunk;
      if (raw.length > 1024 * 1024) {
        reject(new Error("Request too large"));
        req.destroy();
      }
    });
    req.on("end", () => {
      if (!raw.trim()) {
        resolve({});
        return;
      }
      try {
        resolve(JSON.parse(raw));
      } catch (error) {
        reject(error);
      }
    });
    req.on("error", reject);
  });
}

function sendJson(res, statusCode, body) {
  const payload = `${JSON.stringify(body, null, 2)}\n`;
  res.writeHead(statusCode, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
    "content-length": Buffer.byteLength(payload),
  });
  res.end(payload);
}

function sanitizePlayers(players = []) {
  return Array.isArray(players)
    ? players.map((player) => ({
        clientId: player.clientId,
        profileId: player.profileId || null,
        name: player.name,
        status: player.status,
        isAI: Boolean(player.isAI),
      }))
    : [];
}

const args = parseArgs(process.argv.slice(2));
const HOST = args.host || process.env.LBH_CONTROL_PLANE_HOST || "127.0.0.1";
const PORT = Number(args.port || process.env.LBH_CONTROL_PLANE_PORT || 8791);
const ROOT = path.resolve(__dirname, "..");
const CONTROL_PLANE_FILE = path.resolve(
  args["control-plane-file"]
    || process.env.LBH_CONTROL_PLANE_FILE
    || path.join(ROOT, "tmp", "control-plane-store.json")
);
const SESSION_REGISTRY_FILE = path.resolve(
  args["session-registry-file"]
    || process.env.LBH_SESSION_REGISTRY_FILE
    || path.join(ROOT, "tmp", "session-registry.json")
);
const PID_FILE = args["pid-file"] ? path.resolve(args["pid-file"]) : null;
const META_FILE = args["meta-file"] ? path.resolve(args["meta-file"]) : null;
const LABEL = args.label || process.env.LBH_CONTROL_PLANE_LABEL || "lbh-control-plane";

const store = new ControlPlaneStore(CONTROL_PLANE_FILE);
const registry = new SessionRegistry(SESSION_REGISTRY_FILE);
const simInstances = new Map();
const startedAt = new Date().toISOString();

function writeProcessFiles(server) {
  if (PID_FILE) {
    fs.mkdirSync(path.dirname(PID_FILE), { recursive: true });
    fs.writeFileSync(PID_FILE, `${process.pid}\n`);
  }
  if (META_FILE) {
    fs.mkdirSync(path.dirname(META_FILE), { recursive: true });
    fs.writeFileSync(META_FILE, `${JSON.stringify({
      pid: process.pid,
      label: LABEL,
      host: HOST,
      port: PORT,
      url: `http://${HOST}:${PORT}/`,
      startedAt,
    }, null, 2)}\n`);
  }
}

function removeProcessFiles() {
  for (const file of [PID_FILE, META_FILE]) {
    if (!file) continue;
    try {
      fs.rmSync(file, { force: true });
    } catch {}
  }
}

function upsertRegistrySession(snapshot) {
  if (!snapshot?.sessionId) return null;
  const state = registry.read();
  state.sessions[snapshot.sessionId] = snapshot;
  registry.write(state);
  return snapshot;
}

function removeRegistrySession(sessionId) {
  if (!sessionId) return;
  const state = registry.read();
  delete state.sessions[sessionId];
  registry.write(state);
}

const server = http.createServer(async (req, res) => {
  try {
    if (req.method === "GET" && req.url === "/health") {
      sendJson(res, 200, {
        ok: true,
        label: LABEL,
        startedAt,
        storeFile: CONTROL_PLANE_FILE,
        registryFile: SESSION_REGISTRY_FILE,
        profileCount: Object.keys(store.state.profiles).length,
        sessionCount: Object.keys(store.state.sessions).length,
        runCount: Object.keys(store.state.runs).length,
        simInstances: Array.from(simInstances.values()),
      });
      return;
    }

    if (req.method === "POST" && req.url === "/sim/register") {
      const body = await readJson(req);
      const simInstanceId = String(body.simInstanceId || "").trim();
      if (!simInstanceId) {
        sendJson(res, 400, { ok: false, error: "simInstanceId is required" });
        return;
      }
      const entry = {
        simInstanceId,
        url: body.url || null,
        host: body.host || null,
        port: Number.isFinite(Number(body.port)) ? Number(body.port) : null,
        registeredAt: simInstances.get(simInstanceId)?.registeredAt || new Date().toISOString(),
        heartbeatAt: new Date().toISOString(),
      };
      simInstances.set(simInstanceId, entry);
      sendJson(res, 200, { ok: true, simInstance: entry });
      return;
    }

    if (req.method === "POST" && req.url === "/sim/heartbeat") {
      const body = await readJson(req);
      const simInstanceId = String(body.simInstanceId || "").trim();
      if (!simInstanceId || !simInstances.has(simInstanceId)) {
        sendJson(res, 404, { ok: false, error: "Unknown sim instance" });
        return;
      }
      const next = {
        ...simInstances.get(simInstanceId),
        heartbeatAt: new Date().toISOString(),
      };
      simInstances.set(simInstanceId, next);
      sendJson(res, 200, { ok: true, simInstance: next });
      return;
    }

    if (req.method === "POST" && req.url === "/sim/unregister") {
      const body = await readJson(req);
      const simInstanceId = String(body.simInstanceId || "").trim();
      if (simInstanceId) simInstances.delete(simInstanceId);
      sendJson(res, 200, { ok: true });
      return;
    }

    if (req.method === "POST" && req.url === "/profile/bootstrap") {
      const body = await readJson(req);
      const profile = store.bootstrapProfile({
        profileId: body.profileId || null,
        snapshot: body.snapshot || null,
        fallbackName: body.fallbackName || "Pilot",
      });
      sendJson(res, 200, { ok: true, profile });
      return;
    }

    if (req.method === "GET" && req.url.startsWith("/profile?")) {
      const url = new URL(req.url, `http://${HOST}:${PORT}`);
      const profileId = String(url.searchParams.get("profileId") || "").trim();
      if (!profileId) {
        sendJson(res, 400, { ok: false, error: "profileId is required" });
        return;
      }
      const profile = store.getProfile(profileId);
      if (!profile) {
        sendJson(res, 404, { ok: false, error: "Unknown profile" });
        return;
      }
      sendJson(res, 200, { ok: true, profile });
      return;
    }

    if (req.method === "POST" && req.url === "/profile/save") {
      const body = await readJson(req);
      const profile = store.saveProfile(body.profile || {});
      sendJson(res, 200, { ok: true, profile });
      return;
    }

    if (req.method === "POST" && req.url === "/profile/outcome") {
      const body = await readJson(req);
      const committed = store.applyOutcome({
        profileId: body.profileId,
        player: body.player,
        outcome: body.outcome,
        runDuration: Number(body.runDuration || 0),
        session: body.session || null,
      });
      sendJson(res, 200, { ok: true, committed });
      return;
    }

    if (req.method === "POST" && req.url === "/session/upsert") {
      const body = await readJson(req);
      const snapshot = store.upsertSession(body.session || {}, sanitizePlayers(body.players));
      upsertRegistrySession(snapshot);
      sendJson(res, 200, { ok: true, session: snapshot });
      return;
    }

    if (req.method === "POST" && req.url === "/session/end") {
      const body = await readJson(req);
      const snapshot = store.markSessionEnded(body.session || {}, sanitizePlayers(body.players), body.extra || {});
      upsertRegistrySession(snapshot);
      sendJson(res, 200, { ok: true, session: snapshot });
      return;
    }

    if (req.method === "GET" && req.url === "/sessions") {
      const state = registry.read();
      sendJson(res, 200, {
        ok: true,
        sessions: Object.values(state.sessions || {}),
      });
      return;
    }

    if (req.method === "DELETE" && req.url.startsWith("/session?")) {
      const url = new URL(req.url, `http://${HOST}:${PORT}`);
      const sessionId = String(url.searchParams.get("sessionId") || "").trim();
      if (!sessionId) {
        sendJson(res, 400, { ok: false, error: "sessionId is required" });
        return;
      }
      removeRegistrySession(sessionId);
      sendJson(res, 200, { ok: true });
      return;
    }

    // --- Echoes: past-cycle residue ---
    if (req.method === "GET" && req.url.startsWith("/echoes?")) {
      const url = new URL(req.url, `http://${HOST}:${PORT}`);
      const seed = url.searchParams.get("seed");
      const mapId = url.searchParams.get("mapId");
      if (seed == null || seed === "" || mapId == null || mapId === "") {
        sendJson(res, 400, { ok: false, error: "seed and mapId are required" });
        return;
      }
      const echoes = store.getEchoesForSeed(seed, mapId);
      sendJson(res, 200, { ok: true, echoes });
      return;
    }

    if (req.method === "POST" && req.url === "/echoes/save") {
      const body = await readJson(req);
      if (!body?.wreck) {
        sendJson(res, 400, { ok: false, error: "wreck is required" });
        return;
      }
      if (!body.wreck.mapId || body.wreck.seed == null || !body.wreck.wreckId) {
        sendJson(res, 400, { ok: false, error: "wreck.mapId, wreck.seed, and wreck.wreckId are required" });
        return;
      }
      const saved = store.saveEchoWreck(body.wreck);
      sendJson(res, 200, { ok: true, echo: saved });
      return;
    }

    if (req.method === "DELETE" && req.url.startsWith("/echoes?")) {
      const url = new URL(req.url, `http://${HOST}:${PORT}`);
      const seed = url.searchParams.get("seed");
      const mapId = url.searchParams.get("mapId");
      if (seed == null || seed === "" || mapId == null || mapId === "") {
        sendJson(res, 400, { ok: false, error: "seed and mapId are required" });
        return;
      }
      const cleared = store.clearEchoesForSeed(seed, mapId);
      sendJson(res, 200, { ok: true, cleared });
      return;
    }

    sendJson(res, 404, { ok: false, error: "Not found" });
  } catch (error) {
    sendJson(res, 500, { ok: false, error: error.message || "Control plane error" });
  }
});

server.listen(PORT, HOST, () => {
  writeProcessFiles(server);
  console.error(`${LABEL} listening on http://${HOST}:${PORT}/`);
});

function shutdown() {
  removeProcessFiles();
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(1), 1500).unref();
}

process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);
