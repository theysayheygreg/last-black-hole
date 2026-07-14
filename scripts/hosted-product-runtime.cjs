"use strict";

const crypto = require("node:crypto");
const {
  HOSTED_SCHEMA_VERSION,
  MAX_HOSTED_BODY_BYTES,
  assertHostedBodyBytes,
  assertNoDuplicateJsonKeys,
  assertPlainData,
  unwrapHostedRequest,
  wrapHostedResult,
} = require("./hosted-boundary.cjs");

const ERROR_BODY = Object.freeze({ ok: false, schemaVersion: HOSTED_SCHEMA_VERSION, error: "request_rejected" });

const ROUTES = Object.freeze(new Map([
  ["POST /v1/provider/exchange", { method: "exchangeProviderProof", auth: "public", keys: ["provider", "proof", "callbackId"] }],
  ["POST /v1/provider/refresh", { method: "refresh", auth: "public", keys: ["refreshToken"] }],
  ["POST /v1/provider/entitlement", { method: "reconcileEntitlement", auth: "public", keys: ["provider", "proof", "callbackId"] }],
  ["POST /v1/profile", { method: "createProfile", auth: "client", keys: ["displayName"] }],
  ["POST /v1/matches", { method: "clientCreateMatch", auth: "client", keys: ["profileId", "seatCount", "clientIncarnation", "playerAlias"] }],
  ["POST /v1/matches/join", { method: "clientJoinMatch", auth: "client", keys: ["profileId", "joinCode", "clientIncarnation", "playerAlias"] }],
  ["POST /v1/matches/admission", { method: "clientAdmission", auth: "client", keys: ["profileId", "matchId"] }],
  ["POST /v1/workload/redeem", { method: "workloadRedeem", auth: "workload", keys: ["allocationHandle", "bootstrap", "audience"] }],
  ["POST /v1/workload/ready", { method: "workloadReady", auth: "workload", keys: ["workloadRunHandle"] }],
  ["POST /v1/workload/heartbeat", { method: "workloadHeartbeat", auth: "workload", keys: ["workloadRunHandle", "metrics"] }],
  ["POST /v1/workload/admit", { method: "workloadRedeemAdmission", auth: "workload", keys: ["workloadRunHandle", "ticket"] }],
  ["POST /v1/workload/drain", { method: "workloadBeginDrain", auth: "workload", keys: ["workloadRunHandle"] }],
  ["POST /v1/workload/result", { method: "workloadSubmitResult", auth: "workload", keys: ["workloadRunHandle", "payload"] }],
  ["POST /v1/workload/end", { method: "workloadEnd", auth: "workload", keys: ["workloadRunHandle"] }],
  ["POST /v1/control/allocation", { method: "controlGetAllocation", auth: "control", keys: ["matchId"] }],
  ["POST /v1/control/sweep", { method: "controlFenceExpired", auth: "control", keys: [] }],
  ["POST /v1/control/replace", { method: "controlReplaceMatch", auth: "control", keys: ["matchId"] }],
  ["POST /v1/control/settlement", { method: "controlDeliverSettlement", auth: "control", keys: [] }],
]));

function bytes(value) {
  if (Buffer.isBuffer(value)) return value.length;
  if (typeof value === "string") return Buffer.byteLength(value);
  return -1;
}

function requireSecret(value, name) {
  if ((typeof value !== "string" && !Buffer.isBuffer(value)) || bytes(value) < 32) {
    throw new TypeError(`${name} must contain at least 32 bytes`);
  }
}

function validateHostedRuntimeOptions(options) {
  if (!options || options.mode !== "hosted") throw new TypeError("hosted runtime requires hosted mode");
  if (!options.service || typeof options.service !== "object") throw new TypeError("hosted product service required");
  for (const route of ROUTES.values()) {
    if (typeof options.service[route.method] !== "function") throw new TypeError(`hosted product service missing ${route.method}`);
  }
  for (const key of ["diagnosticKey", "hmacKey", "encryptionKey", "tokenKey", "controlToken"]) {
    requireSecret(options[key], key);
  }
  if (!options.providerAdapters || typeof options.providerAdapters !== "object"
      || Object.keys(options.providerAdapters).length === 0) throw new TypeError("provider adapters required");
  for (const adapter of Object.values(options.providerAdapters)) {
    const verifier = adapter?.verifyGrant || adapter?.adapter?.verifyGrant;
    if (typeof verifier !== "function") throw new TypeError("provider adapter verifier required");
  }
  if (options.production === true) {
    for (const [name, adapter] of Object.entries(options.providerAdapters)) {
      if (name === "test" || adapter?.testOnly === true) throw new TypeError("test provider forbidden in production");
    }
  }
  const paths = options.sqlitePaths || { primary: options.sqlitePath };
  if (!paths || typeof paths !== "object") throw new TypeError("sqlite path required");
  const values = Object.values(paths);
  if (!values.length || values.some((value) => typeof value !== "string" || value === ":memory:"
      || !require("node:path").isAbsolute(value))) throw new TypeError("absolute durable sqlite path required");
  if (new Set(values).size !== 1) throw new TypeError("ambiguous sqlite paths");
  if (typeof options.authenticateWorkloadToken !== "function") throw new TypeError("workload token resolver required");
  if (options.authenticateControlRequest != null && typeof options.authenticateControlRequest !== "function") {
    throw new TypeError("control authenticator invalid");
  }
  return true;
}

function bearer(req) {
  const header = req.headers.authorization;
  if (typeof header !== "string" || !header.startsWith("Bearer ")) return null;
  const token = header.slice(7);
  return token.length >= 32 && token.length <= 4096 && token.trim() === token ? token : null;
}

function sameSecret(left, right) {
  if (typeof left !== "string" || (typeof right !== "string" && !Buffer.isBuffer(right))) return false;
  const a = Buffer.from(left); const b = Buffer.from(right);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

function workloadCredential(resolved) {
  if (!resolved || typeof resolved !== "object") return null;
  try { assertPlainData(resolved, { maxDepth: 3, maxNodes: 32, maxStringBytes: 512 }); } catch { return null; }
  const required = ["credential", "authorityInstanceId", "authorityIncarnation", "workloadKeyId", "credentialBinding"];
  if (required.some((key) => typeof resolved[key] !== "string" || resolved[key].length < 1 || resolved[key].length > 512)) return null;
  return resolved.credential;
}

function send(res, status, body) {
  const json = JSON.stringify(body);
  res.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "content-length": Buffer.byteLength(json),
    "cache-control": "no-store",
    "x-content-type-options": "nosniff",
  });
  res.end(json);
}

function readJson(req, limit) {
  return new Promise((resolve, reject) => {
    const declared = req.headers["content-length"];
    if (declared != null && (!/^\d+$/.test(declared) || Number(declared) > limit)) return reject(new Error("rejected"));
    const chunks = []; let total = 0; let settled = false;
    const fail = () => { if (!settled) { settled = true; reject(new Error("rejected")); } };
    req.on("data", (chunk) => {
      total += chunk.length;
      if (total > limit) { fail(); req.destroy(); return; }
      chunks.push(chunk);
    });
    req.on("error", fail);
    req.on("end", () => {
      if (settled) return;
      try {
        assertHostedBodyBytes(total);
        const raw = Buffer.concat(chunks).toString("utf8");
        assertNoDuplicateJsonKeys(raw);
        const parsed = JSON.parse(raw);
        assertPlainData(parsed);
        settled = true; resolve(parsed);
      } catch { fail(); }
    });
  });
}

function createHostedProductRuntime(options = {}) {
  validateHostedRuntimeOptions(options);
  const maxBodyBytes = Math.min(options.maxBodyBytes || MAX_HOSTED_BODY_BYTES, MAX_HOSTED_BODY_BYTES);

  return async function hostedProductRuntime(req, res) {
    if (req.method === "GET" && req.url === "/health") {
      return send(res, 200, { ok: true, schemaVersion: HOSTED_SCHEMA_VERSION });
    }
    const parsedUrl = (() => { try { return new URL(req.url, "http://runtime.invalid"); } catch { return null; } })();
    const pathname = parsedUrl && parsedUrl.search === "" ? parsedUrl.pathname : "";
    const route = ROUTES.get(`${req.method} ${pathname}`);
    if (!route) return send(res, 404, ERROR_BODY);
    try {
      if (!/^application\/json(?:\s*;|$)/i.test(req.headers["content-type"] || "")) throw new Error("rejected");
      const body = await readJson(req, maxBodyBytes);
      const payload = unwrapHostedRequest(body, { allowedPayloadKeys: route.keys });
      let credential;
      if (route.auth === "client") {
        credential = bearer(req);
        if (!credential) throw new Error("rejected");
      } else if (route.auth === "control") {
        const token = bearer(req);
        const mtls = typeof options.resolveMtlsPrincipal === "function" ? options.resolveMtlsPrincipal(req) : null;
        if (mtls?.role === "CONTROL_PLANE" && typeof mtls.credential === "string") credential = mtls.credential;
        else if (typeof options.authenticateControlRequest === "function") credential = options.authenticateControlRequest(req, token);
        else if (sameSecret(token, options.controlToken)) credential = token;
        if (typeof credential !== "string") throw new Error("rejected");
      } else if (route.auth === "workload") {
        const token = bearer(req);
        if (!token) throw new Error("rejected");
        credential = workloadCredential(options.authenticateWorkloadToken(token));
        if (!credential) throw new Error("rejected");
      }
      const input = credential == null ? payload
        : route.auth === "client" ? { accessToken: credential, ...payload }
          : { credential, ...payload };
      const result = await options.service[route.method](input);
      return send(res, 200, wrapHostedResult(result === undefined ? null : result));
    } catch (error) {
      try { options.diagnostics?.({ operation: "http_request", outcome: "rejected" }); } catch {}
      if (!res.headersSent) return send(res, 400, ERROR_BODY);
      res.destroy();
    }
  };
}

module.exports = {
  ERROR_BODY,
  ROUTES,
  validateHostedRuntimeOptions,
  createHostedProductRuntime,
};
