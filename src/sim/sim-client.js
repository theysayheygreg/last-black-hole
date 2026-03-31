function randomClientId() {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  return `lbh-client-${Math.random().toString(36).slice(2, 10)}`;
}

export class SimClient {
  constructor(baseUrl) {
    this.baseUrl = String(baseUrl || '').replace(/\/+$/, '');
    this.clientId = randomClientId();
    this.seq = 0;
    this.latestSnapshot = null;
    this.lastPollAt = 0;
    this.pollIntervalMs = 100;
  }

  _applySessionClocks(session) {
    const snapshotHz = Number(session?.snapshotHz);
    if (Number.isFinite(snapshotHz) && snapshotHz > 0) {
      this.pollIntervalMs = Math.max(40, Math.round(1000 / snapshotHz));
    }
  }

  get enabled() {
    return Boolean(this.baseUrl);
  }

  async _json(path, options = {}) {
    if (!this.enabled) throw new Error('Sim client is not configured');
    const response = await fetch(`${this.baseUrl}${path}`, {
      headers: { 'content-type': 'application/json' },
      ...options,
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(body?.error || `HTTP ${response.status}`);
    }
    return body;
  }

  async getHealth() {
    const body = await this._json('/health');
    this._applySessionClocks(body?.session);
    return body;
  }

  async getMaps() {
    return this._json('/maps');
  }

  async startSession({ mapId, worldScale, maxPlayers = 4, requesterId = this.clientId, requesterName = null, requesterProfileId = null, requesterProfile = null }) {
    const body = await this._json('/session/start', {
      method: 'POST',
      body: JSON.stringify({ mapId, worldScale, maxPlayers, requesterId, requesterName, requesterProfileId, requesterProfile }),
    });
    this._applySessionClocks(body?.session);
    this.latestSnapshot = null;
    this.lastPollAt = 0;
    return body.session;
  }

  async ensureSession({ mapId, worldScale, maxPlayers = 4 }) {
    const health = await this.getHealth();
    const session = health?.session;
    if (session?.status === 'running' && session.mapId === mapId) {
      return session;
    }
    return this.startSession({ mapId, worldScale, maxPlayers });
  }

  async resetSession({ requesterId = this.clientId } = {}) {
    const body = await this._json('/session/reset', {
      method: 'POST',
      body: JSON.stringify({ requesterId }),
    });
    this._applySessionClocks(body?.session);
    this.latestSnapshot = null;
    this.lastPollAt = 0;
    return body.session;
  }

  async join({ name, profileId = null, profileSnapshot = null, equipped = null, consumables = null }) {
    return this._json('/join', {
      method: 'POST',
      body: JSON.stringify({
        clientId: this.clientId,
        name,
        profileId,
        profileSnapshot,
        equipped,
        consumables,
      }),
    });
  }

  async leave() {
    return this._json('/leave', {
      method: 'POST',
      body: JSON.stringify({
        clientId: this.clientId,
      }),
    });
  }

  async pollSnapshot(force = false) {
    const now = Date.now();
    if (!force && now - this.lastPollAt < this.pollIntervalMs && this.latestSnapshot) {
      return this.latestSnapshot;
    }
    this.lastPollAt = now;
    this.latestSnapshot = await this._json('/snapshot');
    this._applySessionClocks(this.latestSnapshot?.session);
    return this.latestSnapshot;
  }

  async sendInput({ moveX = 0, moveY = 0, thrust = 0, pulse = false, consumeSlot = null }) {
    this.seq += 1;
    return this._json('/input', {
      method: 'POST',
      body: JSON.stringify({
        clientId: this.clientId,
        seq: this.seq,
        moveX,
        moveY,
        thrust,
        pulse,
        consumeSlot,
        timestamp: Date.now(),
      }),
    });
  }

  async inventoryAction({ action, cargoSlot = -1, equipSlot = -1, consumableSlot = -1 }) {
    return this._json('/inventory/action', {
      method: 'POST',
      body: JSON.stringify({
        clientId: this.clientId,
        action,
        cargoSlot,
        equipSlot,
        consumableSlot,
      }),
    });
  }

  async getProfile(profileId) {
    if (!profileId) throw new Error('profileId is required');
    return this._json(`/profile?profileId=${encodeURIComponent(profileId)}`);
  }
}
