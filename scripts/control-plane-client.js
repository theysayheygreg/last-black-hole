const { ControlPlaneStore } = require("./control-plane-store.js");
const { SessionRegistry } = require("./session-registry.js");

async function requestJson(method, baseUrl, route, body = null) {
  const response = await fetch(`${String(baseUrl).replace(/\/$/, "")}${route}`, {
    method,
    headers: body ? { "content-type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = await response.json().catch(() => ({}));
  if (!response.ok || json.ok === false) {
    throw new Error(json.error || `${method} ${route} failed (${response.status})`);
  }
  return json;
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

  async getEchoesForSeed(seed) {
    return this.store.getEchoesForSeed(seed);
  }

  async clearEchoesForSeed(seed) {
    return this.store.clearEchoesForSeed(seed);
  }
}

class RemoteControlPlaneClient {
  constructor({ baseUrl }) {
    this.baseUrl = String(baseUrl).replace(/\/$/, "");
  }

  async bootstrapProfile({ profileId, snapshot, fallbackName }) {
    const body = await requestJson("POST", this.baseUrl, "/profile/bootstrap", {
      profileId,
      snapshot,
      fallbackName,
    });
    return body.profile;
  }

  async getProfile(profileId) {
    const body = await requestJson("GET", this.baseUrl, `/profile?profileId=${encodeURIComponent(profileId)}`);
    return body.profile;
  }

  async saveProfile(profile) {
    const body = await requestJson("POST", this.baseUrl, "/profile/save", { profile });
    return body.profile;
  }

  async applyOutcome(payload) {
    const body = await requestJson("POST", this.baseUrl, "/profile/outcome", payload);
    return body.committed;
  }

  async upsertSession(session, players = []) {
    const body = await requestJson("POST", this.baseUrl, "/session/upsert", { session, players });
    return body.session;
  }

  async markSessionEnded(session, players = [], extra = {}) {
    const body = await requestJson("POST", this.baseUrl, "/session/end", { session, players, extra });
    return body.session;
  }

  async registerSimInstance(instance) {
    return requestJson("POST", this.baseUrl, "/sim/register", instance);
  }

  async heartbeatSimInstance(instance) {
    return requestJson("POST", this.baseUrl, "/sim/heartbeat", instance);
  }

  async unregisterSimInstance(instance) {
    return requestJson("POST", this.baseUrl, "/sim/unregister", instance);
  }

  // --- Echoes ---
  async saveEchoWreck(wreck) {
    const body = await requestJson("POST", this.baseUrl, "/echoes/save", { wreck });
    return body.echo;
  }

  async getEchoesForSeed(seed) {
    const body = await requestJson("GET", this.baseUrl, `/echoes?seed=${encodeURIComponent(seed)}`);
    return body.echoes || [];
  }

  async clearEchoesForSeed(seed) {
    const body = await requestJson("DELETE", this.baseUrl, `/echoes?seed=${encodeURIComponent(seed)}`);
    return body.cleared || 0;
  }
}

function createControlPlaneClient(options = {}) {
  if (options.baseUrl) {
    return new RemoteControlPlaneClient({ baseUrl: options.baseUrl });
  }
  return new LocalControlPlaneClient(options);
}

module.exports = {
  createControlPlaneClient,
  LocalControlPlaneClient,
  RemoteControlPlaneClient,
};
