const { ControlPlaneStore } = require("./control-plane-store.cjs");
const { SessionRegistry } = require("./session-registry.cjs");
const {
  SERVICE_MODES,
  resolveServiceMode,
  wrapHostedRequest,
  unwrapHostedResult,
} = require("./hosted-boundary.cjs");

async function requestJson(method, baseUrl, route, body = null, extraHeaders = null, serviceMode = SERVICE_MODES.LOCAL) {
  const requestBody = serviceMode === SERVICE_MODES.HOSTED && body ? wrapHostedRequest(body) : body;
  const response = await fetch(`${String(baseUrl).replace(/\/$/, "")}${route}`, {
    method,
    headers: requestBody || extraHeaders
      ? { ...(requestBody ? { "content-type": "application/json" } : {}), ...(extraHeaders || {}) }
      : undefined,
    body: requestBody ? JSON.stringify(requestBody) : undefined,
  });
  const json = await response.json().catch(() => ({}));
  if (!response.ok || json.ok === false) {
    throw new Error(json.error || `${method} ${route} failed (${response.status})`);
  }
  return serviceMode === SERVICE_MODES.HOSTED ? unwrapHostedResult(json) : json;
}

class LocalControlPlaneClient {
  constructor({ controlPlaneFile, sessionRegistryFile }) {
    this.store = new ControlPlaneStore(controlPlaneFile);
    this.registry = new SessionRegistry(sessionRegistryFile);
  }

  async bootstrapProfile({ profileId, snapshot, fallbackName }) {
    return this.store.bootstrapProfile({ profileId, snapshot, fallbackName });
  }

  async getProfile(profileId) {
    return this.store.getProfile(profileId);
  }

  async getRecentRuns(profileId, limit = 5) {
    return this.store.getRecentRuns(profileId, limit);
  }

  async saveProfile(profile) {
    return this.store.saveProfile(profile);
  }

  async applyOutcome(payload) {
    return this.store.applyOutcome(payload);
  }

  async upsertSession(session, players = []) {
    const snapshot = this.store.upsertSession(session, players);
    const state = this.registry.read();
    state.sessions[snapshot.sessionId] = snapshot;
    this.registry.write(state);
    return snapshot;
  }

  async markSessionEnded(session, players = [], extra = {}) {
    const snapshot = this.store.markSessionEnded(session, players, extra);
    const state = this.registry.read();
    state.sessions[snapshot.sessionId] = snapshot;
    this.registry.write(state);
    return snapshot;
  }

  async registerSimInstance(instance) {
    // Embedded/local mode keeps the persistent store and session registry in
    // process. There is no separate sim-instance catalog to update here.
    return {
      ok: true,
      simInstance: {
        simInstanceId: instance.simInstanceId,
        url: instance.url || null,
        host: instance.host || null,
        port: instance.port || null,
      },
    };
  }

  async heartbeatSimInstance(instance) {
    // Same as register: local mode acknowledges the lifecycle contract so the
    // sim can use one codepath, but there is no out-of-process registry write.
    return {
      ok: true,
      simInstance: {
        simInstanceId: instance.simInstanceId,
      },
    };
  }

  async unregisterSimInstance(instance) {
    // Local mode has nothing durable to tear down for sim instances.
    return { ok: true, simInstanceId: instance.simInstanceId };
  }

  // --- Echoes ---
  async saveEchoWreck(wreck) {
    return this.store.saveEchoWreck(wreck);
  }

  async getEchoesForSeed(seed, mapId = null) {
    return this.store.getEchoesForSeed(seed, mapId);
  }

  async clearEchoesForSeed(seed, mapId = null) {
    return this.store.clearEchoesForSeed(seed, mapId);
  }
}

class RemoteControlPlaneClient {
  constructor({
    baseUrl,
    serviceToken = process.env.LBH_CONTROL_PLANE_SERVICE_TOKEN || "",
    serviceMode = process.env.LBH_SERVICE_MODE,
  }) {
    this.baseUrl = String(baseUrl).replace(/\/$/, "");
    this.serviceToken = String(serviceToken || "");
    this.serviceMode = resolveServiceMode(serviceMode);
    if (this.serviceMode === SERVICE_MODES.HOSTED && this.serviceToken.length < 32) {
      throw new Error("Hosted control-plane client requires service authentication");
    }
  }

  serviceHeaders() {
    return this.serviceToken ? { "x-lbh-service-token": this.serviceToken } : null;
  }

  async request(method, route, body = null) {
    return requestJson(method, this.baseUrl, route, body, this.serviceHeaders(), this.serviceMode);
  }

  hostedIdentityUnavailable() {
    if (this.serviceMode === SERVICE_MODES.HOSTED) {
      throw new Error("Hosted identity endpoint unavailable");
    }
  }

  async bootstrapProfile({ profileId, snapshot, fallbackName }) {
    this.hostedIdentityUnavailable();
    const body = await requestJson("POST", this.baseUrl, "/profile/bootstrap", {
      profileId,
      snapshot,
      fallbackName,
    });
    return body.profile;
  }

  async getProfile(profileId) {
    this.hostedIdentityUnavailable();
    const body = await requestJson("GET", this.baseUrl, `/profile?profileId=${encodeURIComponent(profileId)}`);
    return body.profile;
  }

  async getRecentRuns(profileId, limit = 5) {
    this.hostedIdentityUnavailable();
    const body = await requestJson(
      "GET",
      this.baseUrl,
      `/profile?profileId=${encodeURIComponent(profileId)}&runLimit=${encodeURIComponent(limit)}`,
    );
    return Array.isArray(body.recentRuns) ? body.recentRuns : [];
  }

  async saveProfile(profile) {
    this.hostedIdentityUnavailable();
    const body = await requestJson("POST", this.baseUrl, "/profile/save", { profile });
    return body.profile;
  }

  async applyOutcome(payload) {
    this.hostedIdentityUnavailable();
    const body = await this.request("POST", "/profile/outcome", payload);
    return body.committed;
  }

  async upsertSession(session, players = []) {
    const body = await this.request("POST", "/session/upsert", { session, players });
    return body.session;
  }

  async markSessionEnded(session, players = [], extra = {}) {
    const body = await this.request("POST", "/session/end", { session, players, extra });
    return body.session;
  }

  async registerSimInstance(instance) {
    return this.request("POST", "/sim/register", instance);
  }

  async heartbeatSimInstance(instance) {
    return this.request("POST", "/sim/heartbeat", instance);
  }

  async unregisterSimInstance(instance) {
    return this.request("POST", "/sim/unregister", instance);
  }

  // --- Echoes ---
  async saveEchoWreck(wreck) {
    this.hostedIdentityUnavailable();
    const body = await requestJson("POST", this.baseUrl, "/echoes/save", { wreck });
    return body.echo;
  }

  async getEchoesForSeed(seed, mapId = null) {
    this.hostedIdentityUnavailable();
    const params = new URLSearchParams({ seed: String(seed) });
    if (mapId != null) params.set("mapId", String(mapId));
    const body = await requestJson("GET", this.baseUrl, `/echoes?${params.toString()}`);
    return body.echoes || [];
  }

  async clearEchoesForSeed(seed, mapId = null) {
    this.hostedIdentityUnavailable();
    const params = new URLSearchParams({ seed: String(seed) });
    if (mapId != null) params.set("mapId", String(mapId));
    const body = await requestJson("DELETE", this.baseUrl, `/echoes?${params.toString()}`);
    return body.cleared || 0;
  }
}

function createControlPlaneClient(options = {}) {
  if (options.baseUrl) {
    return new RemoteControlPlaneClient({
      baseUrl: options.baseUrl,
      serviceToken: options.serviceToken ?? process.env.LBH_CONTROL_PLANE_SERVICE_TOKEN ?? "",
      serviceMode: options.serviceMode ?? process.env.LBH_SERVICE_MODE,
    });
  }
  if (resolveServiceMode(options.serviceMode) === SERVICE_MODES.HOSTED) {
    throw new Error("Hosted control-plane mode requires an explicit remote baseUrl");
  }
  return new LocalControlPlaneClient(options);
}

module.exports = {
  createControlPlaneClient,
  LocalControlPlaneClient,
  RemoteControlPlaneClient,
};
