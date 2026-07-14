#!/usr/bin/env node

const http = require("http");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { ControlPlaneStore } = require("./control-plane-store.cjs");
const { SessionRegistry } = require("./session-registry.cjs");
const { createRuntimeLogger } = require("./runtime-telemetry.cjs");
const {
  SERVICE_MODES,
  HOSTED_SCHEMA_VERSION,
  HostedBoundaryError,
  resolveServiceMode,
  assertHostedBodyBytes,
  assertNoDuplicateJsonKeys,
  unwrapHostedRequest,
  wrapHostedResult,
  assertHostedProductSeats,
  diagnosticAlias,
} = require("./hosted-boundary.cjs");

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

function readJson(req, maxBytes = 1024 * 1024, rejectDuplicateKeys = false) {
  return new Promise((resolve, reject) => {
    let raw = "";
    let rawBytes = 0;
    req.on("data", (chunk) => {
      rawBytes += chunk.length;
      raw += chunk;
      if (rawBytes > maxBytes) {
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
        if (rejectDuplicateKeys) assertNoDuplicateJsonKeys(raw);
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
const SERVICE_TOKEN = String(process.env.LBH_CONTROL_PLANE_SERVICE_TOKEN || "");
const SERVICE_MODE = resolveServiceMode(args.mode || process.env.LBH_SERVICE_MODE);
if (SERVICE_MODE === SERVICE_MODES.HOSTED && SERVICE_TOKEN.length < 32) {
  throw new Error("Hosted control plane requires a service token of at least 32 characters");
}
const DIAGNOSTIC_KEY = String(process.env.LBH_DIAGNOSTIC_KEY || SERVICE_TOKEN || "local-diagnostics-only");
const telemetry = createRuntimeLogger("control-plane", SERVICE_MODE === SERVICE_MODES.HOSTED
  ? { label: LABEL, serviceMode: SERVICE_MODE, bindScope: "private" }
  : { label: LABEL, host: HOST, port: PORT, serviceMode: SERVICE_MODE });

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

function serviceTokenMatches(req) {
  if (!SERVICE_TOKEN) return SERVICE_MODE === SERVICE_MODES.LOCAL;
  const supplied = String(req.headers["x-lbh-service-token"] || "");
  const expectedBytes = Buffer.from(SERVICE_TOKEN);
  const suppliedBytes = Buffer.from(supplied);
  return expectedBytes.length === suppliedBytes.length
    && expectedBytes.length > 0
    && crypto.timingSafeEqual(expectedBytes, suppliedBytes);
}

const HOSTED_REQUEST_KEYS = Object.freeze({
  "/sim/register": { allowed: ["simInstanceId", "url", "host", "port"], required: ["simInstanceId"] },
  "/sim/heartbeat": { allowed: ["simInstanceId"], required: ["simInstanceId"] },
  "/sim/unregister": { allowed: ["simInstanceId"], required: ["simInstanceId"] },
  "/session/upsert": { allowed: ["session", "players"], required: ["session", "players"] },
  "/session/end": { allowed: ["session", "players", "extra"], required: ["session", "players", "extra"] },
});

async function readBoundaryBody(req) {
  if (SERVICE_MODE === SERVICE_MODES.LOCAL) return readJson(req);
  const route = HOSTED_REQUEST_KEYS[req.url];
  if (!route) throw new HostedBoundaryError("HOSTED_ENDPOINT_UNAVAILABLE");
  const rawLength = Number(req.headers["content-length"] || 0);
  if (rawLength) assertHostedBodyBytes(rawLength);
  const body = await readJson(req, 256 * 1024, true);
  return unwrapHostedRequest(body, {
    allowedPayloadKeys: route.allowed,
    requiredPayloadKeys: route.required,
  });
}

function sendBoundaryResult(res, statusCode, result) {
  if (SERVICE_MODE === SERVICE_MODES.HOSTED) {
    sendJson(res, statusCode, wrapHostedResult(result));
    return;
  }
  sendJson(res, statusCode, { ok: true, ...result });
}

function hostedAlias(kind, value) {
  return diagnosticAlias(kind, String(value), DIAGNOSTIC_KEY);
}

const server = http.createServer(async (req, res) => {
  try {
    if (req.method === "GET" && req.url === "/health") {
      if (SERVICE_MODE === SERVICE_MODES.HOSTED) {
        sendJson(res, 200, wrapHostedResult({
          ready: true,
          serviceMode: SERVICE_MODE,
          schemaVersion: HOSTED_SCHEMA_VERSION,
          profileCount: Object.keys(store.state.profiles).length,
          sessionCount: Object.keys(store.state.sessions).length,
          runCount: Object.keys(store.state.runs).length,
          simInstanceCount: simInstances.size,
        }));
        return;
      }
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

    if (SERVICE_MODE === SERVICE_MODES.HOSTED && !serviceTokenMatches(req)) {
      sendJson(res, 401, { ok: false, error: "Service authentication required", code: "SERVICE_AUTH_REQUIRED" });
      return;
    }

    if (SERVICE_MODE === SERVICE_MODES.HOSTED
        && req.method === "GET" && req.url === "/sessions") {
      const state = registry.read();
      sendBoundaryResult(res, 200, { sessions: Object.values(state.sessions || {}) });
      return;
    }

    if (SERVICE_MODE === SERVICE_MODES.HOSTED && !HOSTED_REQUEST_KEYS[req.url]) {
      sendJson(res, 503, { ok: false, error: "Hosted endpoint unavailable", code: "HOSTED_ENDPOINT_UNAVAILABLE" });
      return;
    }

    if (req.method === "POST" && req.url === "/sim/register") {
      const body = await readBoundaryBody(req);
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
      telemetry.info("sim.registered", SERVICE_MODE === SERVICE_MODES.HOSTED
        ? { simAlias: hostedAlias("sim", simInstanceId) }
        : { simInstanceId, simPort: entry.port, simUrl: entry.url });
      sendBoundaryResult(res, 200, { simInstance: entry });
      return;
    }

    if (req.method === "POST" && req.url === "/sim/heartbeat") {
      const body = await readBoundaryBody(req);
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
      sendBoundaryResult(res, 200, { simInstance: next });
      return;
    }

    if (req.method === "POST" && req.url === "/sim/unregister") {
      const body = await readBoundaryBody(req);
      const simInstanceId = String(body.simInstanceId || "").trim();
      if (simInstanceId) {
        simInstances.delete(simInstanceId);
        telemetry.info("sim.unregistered", SERVICE_MODE === SERVICE_MODES.HOSTED
          ? { simAlias: hostedAlias("sim", simInstanceId) }
          : { simInstanceId });
      }
      sendBoundaryResult(res, 200, {});
      return;
    }

    if (req.method === "POST" && req.url === "/profile/bootstrap") {
      const body = await readJson(req);
      const profile = store.bootstrapProfile({
        profileId: body.profileId || null,
        snapshot: body.snapshot || null,
        fallbackName: body.fallbackName || "Pilot",
      });
      telemetry.info("profile.bootstrapped", { profileId: profile.id, hasSnapshot: Boolean(body.snapshot) });
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
      const limit = Number(url.searchParams.get("runLimit") || 5);
      sendJson(res, 200, {
        ok: true,
        profile,
        recentRuns: store.getRecentRuns(profileId, limit),
      });
      return;
    }

    if (req.method === "POST" && req.url === "/profile/save") {
      const body = await readJson(req);
      const profile = store.saveProfile(body.profile || {});
      sendJson(res, 200, { ok: true, profile });
      return;
    }

    if (req.method === "POST" && req.url === "/profile/outcome") {
      if (!serviceTokenMatches(req)) {
        sendJson(res, 401, { ok: false, error: "Valid control-plane service authentication is required" });
        return;
      }
      const body = await readBoundaryBody(req);
      const committed = store.applyOutcome({
        profileId: body.profileId,
        player: body.player,
        outcome: body.outcome,
        runDuration: Number(body.runDuration || 0),
        session: body.session || null,
        runResult: body.runResult || null,
        settlement: body.settlement || null,
      });
      sendBoundaryResult(res, 200, { committed });
      return;
    }

    if (req.method === "POST" && req.url === "/session/upsert") {
      const body = await readBoundaryBody(req);
      if (SERVICE_MODE === SERVICE_MODES.HOSTED) assertHostedProductSeats(body.players);
      const snapshot = store.upsertSession(body.session || {}, sanitizePlayers(body.players));
      upsertRegistrySession(snapshot);
      sendBoundaryResult(res, 200, { session: snapshot });
      return;
    }

    if (req.method === "POST" && req.url === "/session/end") {
      const body = await readBoundaryBody(req);
      if (SERVICE_MODE === SERVICE_MODES.HOSTED) assertHostedProductSeats(body.players);
      const snapshot = store.markSessionEnded(body.session || {}, sanitizePlayers(body.players), body.extra || {});
      upsertRegistrySession(snapshot);
      sendBoundaryResult(res, 200, { session: snapshot });
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
      if (!Array.isArray(body.wreck.loot) || body.wreck.loot.filter(Boolean).length === 0) {
        sendJson(res, 400, { ok: false, error: "wreck.loot is required for chronicle echoes" });
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
    if (SERVICE_MODE === SERVICE_MODES.HOSTED) {
      const statusCode = error?.code === "SETTLEMENT_CONFLICT" ? 409
        : error?.code === "HOSTED_REQUEST_TOO_LARGE" ? 413
          : error instanceof HostedBoundaryError ? 400 : 500;
      telemetry.warn("request.rejected", {
        requestAlias: hostedAlias("request", `${req.method}:${req.url}:${Date.now()}`),
        category: error instanceof HostedBoundaryError ? "boundary" : "internal",
      });
      sendJson(res, statusCode, {
        ok: false,
        error: statusCode === 500 ? "Control plane error" : "Hosted request rejected",
        code: error?.code === "SETTLEMENT_CONFLICT" ? "SETTLEMENT_CONFLICT" : "HOSTED_REQUEST_REJECTED",
      });
      return;
    }
    const statusCode = error?.code === "SETTLEMENT_CONFLICT" ? 409 : 500;
    sendJson(res, statusCode, { ok: false, error: error.message || "Control plane error", code: error?.code || undefined });
  }
});

server.listen(PORT, HOST, () => {
  writeProcessFiles(server);
  telemetry.info("runtime.started", SERVICE_MODE === SERVICE_MODES.HOSTED
    ? { endpoint: "private", schemaVersion: HOSTED_SCHEMA_VERSION }
    : { url: `http://${HOST}:${PORT}/`, storeFile: CONTROL_PLANE_FILE, registryFile: SESSION_REGISTRY_FILE });
  console.error(SERVICE_MODE === SERVICE_MODES.HOSTED
    ? `${LABEL} hosted boundary listening on a private endpoint`
    : `${LABEL} listening on http://${HOST}:${PORT}/`);
});

function shutdown() {
  removeProcessFiles();
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(1), 1500).unref();
}

process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);
