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
    this.latestEvents = [];
    this.runId = null;
    this.eventCursor = 0;
    this.lastSnapshotId = 0;
    this.lastPollAt = 0;
    this.pollIntervalMs = 100;
    this.lastSentInput = null;
    this.pendingInputs = [];
    this.metrics = {
      lastInputAckRttMs: null,
      lastInputToSnapshotMs: null,
      lastSnapshotLagMs: null,
      lastSnapshotIntervalMs: null,
      lastAcceptedSeq: 0,
      lastSnapshotTick: null,
      lastSnapshotId: 0,
      lastEventSeq: 0,
      eventGapRecoveries: 0,
      lastRecoveryReason: null,
    };
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

  async startSession({ mapId, worldScale, maxPlayers = 4, seed = null, requesterId = this.clientId, requesterName = null, requesterProfileId = null, requesterProfile = null }) {
    const body = await this._json('/session/start', {
      method: 'POST',
      body: JSON.stringify({ mapId, worldScale, maxPlayers, seed, requesterId, requesterName, requesterProfileId, requesterProfile }),
    });
    this._applySessionClocks(body?.session);
    this._resetStreamState(body?.session?.runId || null);
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
    this._resetStreamState(body?.session?.runId || null);
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
    this._recordSnapshotMetrics(this.latestSnapshot);
    this._applySessionClocks(this.latestSnapshot?.session);
    await this._syncEventWindow(this.latestSnapshot);
    return this.latestSnapshot;
  }

  _resetStreamState(runId = null) {
    this.latestSnapshot = null;
    this.latestEvents = [];
    this.runId = runId;
    this.eventCursor = 0;
    this.lastSnapshotId = 0;
    this.lastPollAt = 0;
  }

  async _syncEventWindow(snapshot) {
    const runId = snapshot?.runId || snapshot?.session?.runId || null;
    const watermark = Math.max(0, Number(snapshot?.lastEventSeq) || 0);
    if (!runId) {
      this.latestEvents = [];
      return;
    }
    if (this.runId !== runId) {
      this.runId = runId;
      this.eventCursor = 0;
      this.latestEvents = [];
    }
    this.lastSnapshotId = Math.max(0, Number(snapshot?.snapshotId) || 0);
    this.metrics.lastSnapshotId = this.lastSnapshotId;
    if (watermark <= this.eventCursor) return;

    const window = await this._json(
      `/events?since=${this.eventCursor}&runId=${encodeURIComponent(runId)}`,
    );
    if (window.reset || window.stale || window.future) {
      // Full snapshots are authoritative rebases. If the bounded event window
      // cannot bridge the gap, continue after its watermark instead of
      // applying a partial history to fresh state.
      this.latestEvents = [];
      this.eventCursor = watermark;
      this.metrics.eventGapRecoveries += 1;
      this.metrics.lastRecoveryReason = window.reason || 'event-window-reset';
    } else {
      this.latestEvents = Array.isArray(window.events) ? window.events : [];
      this.eventCursor = Math.max(this.eventCursor, Number(window.nextSince) || watermark);
      this.metrics.lastRecoveryReason = null;
    }
    this.metrics.lastEventSeq = this.eventCursor;
  }

  consumeEvents() {
    const events = this.latestEvents;
    this.latestEvents = [];
    return events;
  }

  _nowMs() {
    return globalThis.performance?.now ? globalThis.performance.now() : Date.now();
  }

  _recordSnapshotMetrics(snapshot) {
    const now = this._nowMs();
    if (this._lastSnapshotClientAt != null) {
      this.metrics.lastSnapshotIntervalMs = now - this._lastSnapshotClientAt;
    }
    this._lastSnapshotClientAt = now;
    if (Number.isFinite(Number(snapshot?.serverTime))) {
      this.metrics.lastSnapshotLagMs = Date.now() - Number(snapshot.serverTime);
    }
    this.metrics.lastSnapshotTick = snapshot?.tick ?? this.metrics.lastSnapshotTick;
    this.metrics.lastSnapshotId = snapshot?.snapshotId ?? this.metrics.lastSnapshotId;

    const localPlayer = snapshot?.players?.find((player) => player.clientId === this.clientId);
    const acceptedSeq = Number(localPlayer?.lastInputSeq);
    if (!Number.isFinite(acceptedSeq)) return;
    const acknowledged = this.pendingInputs.filter((entry) => entry.seq <= acceptedSeq);
    if (acknowledged.length === 0) return;
    const last = acknowledged[acknowledged.length - 1];
    this.metrics.lastInputToSnapshotMs = now - last.sentAt;
    this.pendingInputs = this.pendingInputs.filter((entry) => entry.seq > acceptedSeq);
  }

  getMetrics() {
    return {
      ...this.metrics,
      pendingInputCount: this.pendingInputs.length,
      pollIntervalMs: this.pollIntervalMs,
    };
  }

  async sendInput({ moveX = 0, moveY = 0, thrust = 0, brake = 0, slingshot = false, slingshotEdges = [], pulse = false, ability1 = false, ability2 = false, consumeSlot = null }) {
    this.seq += 1;
    const sentAt = this._nowMs();
    this.lastSentInput = {
      clientId: this.clientId,
      seq: this.seq,
      moveX,
      moveY,
      thrust,
      brake,
      slingshot,
      slingshotEdges: Array.isArray(slingshotEdges) ? slingshotEdges.slice(0, 8) : [],
      pulse,
      ability1,
      ability2,
      consumeSlot,
      sentAt,
    };
    this.pendingInputs.push({ seq: this.seq, sentAt });
    if (this.pendingInputs.length > 32) this.pendingInputs.splice(0, this.pendingInputs.length - 32);
    const response = await this._json('/input', {
      method: 'POST',
      body: JSON.stringify({
        ...this.lastSentInput,
        timestamp: Date.now(),
      }),
    });
    this.metrics.lastAcceptedSeq = response.acceptedSeq ?? this.metrics.lastAcceptedSeq;
    this.metrics.lastInputAckRttMs = this._nowMs() - sentAt;
    return response;
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
