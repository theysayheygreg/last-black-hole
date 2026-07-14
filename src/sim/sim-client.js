import * as streamOps from './sim-stream-transport.js';

const EXPECTED_PROTOCOL_VERSION = 'lbh-local-v2';

function randomId(prefix = 'lbh-client') {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  return `${prefix}-${Math.random().toString(36).slice(2, 10)}`;
}

function socketOpen(socket) {
  return socket && socket.readyState === 1;
}

export class SimClient {
  constructor(baseUrl, {
    transport = 'http', WebSocketImpl = globalThis.WebSocket, actionDrainTimeoutMs = 8000,
    scheduleStreamFrame = null, supportedWireVersions = null,
  } = {}) {
    this.baseUrl = String(baseUrl || '').replace(/\/+$/, '');
    this.transport = transport === 'stream' ? 'stream' : 'http';
    this.activeTransport = 'http';
    this.WebSocketImpl = WebSocketImpl;
    this.actionDrainTimeoutMs = Math.max(1, Number(actionDrainTimeoutMs) || 8000);
    this.supportedWireVersions = Array.isArray(supportedWireVersions)
      ? Object.freeze([...new Set(supportedWireVersions)])
      : null;
    this._manifestCache = new Map();
    this._manifestVerification = null;
    this._acceptedManifest = null;
    this._acceptedManifestHash = null;
    this._scheduleStreamFrameCallback = typeof scheduleStreamFrame === 'function'
      ? scheduleStreamFrame
      : (typeof scheduleStreamFrame?.schedule === 'function'
          ? scheduleStreamFrame.schedule.bind(scheduleStreamFrame)
          : null);
    this.clientId = randomId();
    this.seq = 0;
    this.commandSeq = 0;
    this.actionSeq = 0;
    this.commandCredential = null;
    this.authorityRunId = null;
    this.authorityPlayerId = null;
    this.membershipId = null;
    this.connectionId = null;
    this.connectionEpoch = 0;
    this.joinTicket = null;
    this.roomCode = null;
    this._commandTail = Promise.resolve();
    this.latestSnapshot = null;
    this.latestEvents = [];
    this.runId = null;
    this.eventCursor = 0;
    this.lastSnapshotId = 0;
    this.lastPollAt = 0;
    this.pollIntervalMs = 100;
    this.lastSentInput = null;
    this.pendingInputs = [];
    this._protocol = null;
    this._socket = null;
    this._socketGeneration = 0;
    this._streamState = 'idle';
    this._streamVersion = 0;
    this._streamWaiters = [];
    this._inputAcks = new Map();
    this._pendingPublic = new Map();
    this._pendingOwner = new Map();
    this._pendingActions = new Map();
    this._settledActionAcks = new Map();
    this._eventFrames = new Map();
    this._deliveryAckThrough = 0;
    this._pendingDeliveryIds = new Set();
    this._deliveryEpochFailed = false;
    this._rebase = null;
    this._latestOwnerActionSeq = 0;
    this._heartbeatTimer = null;
    this._connectionAttempts = new Map();
    this._reconnectPromise = null;
    this._shuttingDown = false;
    this._closeDirective = null;
    this._scheduledStreamFrames = new Set();
    this._hotPathHttpCount = 0;
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
      slingshotEdgeAcks: [],
      lastRecoveryReason: null,
      reconnectCount: 0,
      reconnectReason: null,
      lastInputAck: 0,
      lastActionAck: 0,
      lastDeliveryAck: 0,
      lastEventAck: 0,
      hotPathHttpCount: 0,
      pendingScheduledStreamFrames: 0,
      scheduledStreamFrameFailures: 0,
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
    if (this.transport === 'stream' && /^\/(?:input|snapshot|events|inventory\/action)(?:[/?]|$)/.test(path)) {
      this._hotPathHttpCount += 1;
      this.metrics.hotPathHttpCount = this._hotPathHttpCount;
    }
    const authorityHeaders = this.commandCredential && this.authorityRunId
      ? {
          'x-lbh-command-credential': this.commandCredential,
          'x-lbh-player-id': this.authorityPlayerId || this.clientId,
          'x-lbh-run-id': this.authorityRunId,
        }
      : {};
    const response = await fetch(`${this.baseUrl}${path}`, {
      ...options,
      headers: {
        'content-type': 'application/json',
        ...authorityHeaders,
        ...(options.headers || {}),
      },
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) {
      const error = new Error(body?.error || `HTTP ${response.status}`);
      error.code = body?.code || null;
      error.status = response.status;
      error.details = body;
      throw error;
    }
    return body;
  }

  async getHealth() {
    const body = await this._json('/health');
    if (body?.protocolVersion !== EXPECTED_PROTOCOL_VERSION) {
      const error = new Error(`Expected ${EXPECTED_PROTOCOL_VERSION}; received ${body?.protocolVersion || 'unknown'}`);
      error.code = 'room-version-incompatible';
      error.expectedProtocolVersion = EXPECTED_PROTOCOL_VERSION;
      error.receivedProtocolVersion = body?.protocolVersion || null;
      throw error;
    }
    this._applySessionClocks(body?.session);
    return body;
  }

  async getMaps() {
    return this._json('/maps');
  }

  async startSession({ mapId, worldScale, maxPlayers = 4, seed = null, requesterId = this.clientId, requesterName = null, requesterProfileId = null, requesterProfile = null, staged = false }) {
    await this._awaitPendingActions();
    await this._stopStream('session-start');
    const command = this.commandCredential ? this._nextCommandEnvelope() : {};
    const request = () => this._json('/session/start', {
      method: 'POST',
      body: JSON.stringify({ mapId, worldScale, maxPlayers, seed, requesterId, requesterName, requesterProfileId, requesterProfile, startMode: staged ? 'staged' : 'immediate', ...command }),
    });
    const body = await (this.commandCredential ? this._enqueueCommand(request) : request());
    this._applySessionClocks(body?.session);
    this.roomCode = body?.roomCode || null;
    this._clearAuthority(body?.session?.runId || null, body?.joinTicket || null);
    this._resetStreamState(body?.session?.runId || null);
    return body.session;
  }

  async launchSession({ requesterId = this.clientId } = {}) {
    await this._awaitPendingActions();
    const command = this._nextCommandEnvelope();
    const body = await this._enqueueCommand(() => this._json('/session/launch', {
      method: 'POST', body: JSON.stringify({ requesterId, ...command }),
    }));
    this._applySessionClocks(body?.session);
    return body.session;
  }

  async getLobby() {
    return this._json('/lobby', { cache: 'no-store' });
  }

  async setReady(ready) {
    const command = this._nextCommandEnvelope();
    return this._enqueueCommand(() => this._json('/session/ready', {
      method: 'POST', body: JSON.stringify({ ready: Boolean(ready), ...command }),
    }));
  }

  async ensureSession({ mapId, worldScale, maxPlayers = 4 }) {
    const health = await this.getHealth();
    const session = health?.session;
    const hasHumanPilot = Number(health?.idleState?.humanPlayerCount || 0) > 0;
    if (session?.status === 'running' && session.mapId === mapId && hasHumanPilot) {
      if (this.runId !== session.runId) this._resetStreamState(session.runId || null);
      return session;
    }
    return this.startSession({ mapId, worldScale, maxPlayers });
  }

  async resetSession({ requesterId = this.clientId } = {}) {
    await this._awaitPendingActions();
    await this._stopStream('session-reset');
    const command = this._nextCommandEnvelope();
    const body = await this._enqueueCommand(() => this._json('/session/reset', {
      method: 'POST', body: JSON.stringify({ requesterId, ...command }),
    }));
    this._applySessionClocks(body?.session);
    this.roomCode = body?.roomCode || null;
    this._clearAuthority(body?.session?.runId || null, body?.joinTicket || null);
    this._resetStreamState(body?.session?.runId || null);
    return body.session;
  }

  async join({ name, profileId = null, profileSnapshot = null, equipped = null, consumables = null, roomCode = null }) {
    const body = await this._json('/join', {
      method: 'POST',
      body: JSON.stringify({ clientId: this.clientId, runId: this.runId, joinTicket: this.joinTicket, roomCode, name, profileId, profileSnapshot, equipped, consumables }),
    });
    if (roomCode) this.roomCode = String(roomCode).trim().toUpperCase();
    this._adoptAuthority(body?.authority);
    if (this.transport === 'stream') await this._connectStream('admission');
    return body;
  }

  async leave() {
    await this._drainPendingActions(this.actionDrainTimeoutMs);
    this._shuttingDown = true;
    try {
      const envelope = this._nextCommandEnvelope();
      const response = await this._enqueueCommand(() => this._json('/leave', {
        method: 'POST', body: JSON.stringify({ ...envelope }),
      }));
      await this._stopStream('leave');
      this._clearAuthority(this.runId, null);
      this.roomCode = null;
      return response;
    } finally {
      this._shuttingDown = false;
    }
  }

  async shutdown() {
    this._shuttingDown = true;
    await this._stopStream('shutdown');
  }

  async abandon() {
    this._shuttingDown = true;
    try {
      await this._stopStream('abandon');
      this._clearAuthority(null, null);
      this._resetStreamState(null);
      this.roomCode = null;
    } finally {
      this._shuttingDown = false;
    }
  }

  async pollSnapshot(force = false) {
    if (this.transport === 'stream') {
      const version = this._streamVersion;
      if (this.latestSnapshot && !force) return this.latestSnapshot;
      if (!this.latestSnapshot || force) await this._waitForStreamState(version, 5000);
      return this.latestSnapshot;
    }
    const now = Date.now();
    if (!force && now - this.lastPollAt < this.pollIntervalMs && this.latestSnapshot) return this.latestSnapshot;
    this.lastPollAt = now;
    this.latestSnapshot = await this._json('/snapshot');
    this._recordSnapshotMetrics(this.latestSnapshot);
    this._applySessionClocks(this.latestSnapshot?.session);
    await this._syncEventWindow(this.latestSnapshot);
    return this.latestSnapshot;
  }

  _resetStreamState(runId = null) {
    this._resetStreamFrameScheduler();
    this.latestSnapshot = null;
    this.latestEvents = [];
    this.runId = runId;
    this.eventCursor = 0;
    this.lastSnapshotId = 0;
    this.lastPollAt = 0;
    this._pendingPublic.clear();
    this._pendingOwner.clear();
    this._settledActionAcks.clear();
    this._eventFrames.clear();
    this._resetDeliveryEpoch();
    this._rebase = null;
    this._acceptedManifest = null;
    this._acceptedManifestHash = null;
  }

  _clearAuthority(runId = null, joinTicket = null) {
    this.commandSeq = 0;
    this.actionSeq = 0;
    this.commandCredential = null;
    this.authorityRunId = null;
    this.authorityPlayerId = null;
    this.membershipId = null;
    this.connectionId = null;
    this.connectionEpoch = 0;
    this.joinTicket = joinTicket;
    if (runId) this.runId = runId;
  }

  _adoptAuthority(authority) {
    if (!authority?.commandCredential || !authority?.runId) throw new Error('Sim join did not return protocol-v2 command authority');
    this.commandCredential = authority.commandCredential;
    this.authorityRunId = authority.runId;
    this.authorityPlayerId = authority.playerId || this.clientId;
    this.membershipId = authority.membershipId || null;
    this.connectionId = authority.connectionId || null;
    this.connectionEpoch = Math.max(0, Number(authority.connectionEpoch) || 0);
    this.runId = authority.runId;
    this.commandSeq = Math.max(0, Number(authority.lastCommandSeq) || 0);
    this.joinTicket = null;
  }

  _adoptWelcome(frame) {
    this.commandCredential = frame.commandCredential;
    this.authorityRunId = frame.runId;
    this.runId = frame.runId;
    this.authorityPlayerId = frame.playerId;
    this.membershipId = frame.membershipId;
    this.connectionId = frame.connectionId;
    this.connectionEpoch = frame.connectionEpoch;
    this.commandSeq = Math.max(this.commandSeq, frame.lastCommandSeq);
    this.actionSeq = Math.max(this.actionSeq, frame.lastActionSeq);
    const acceptedInputSeq = Math.max(0, Number(frame.lastInputSeq) || 0);
    this.metrics.lastInputAck = Math.max(this.metrics.lastInputAck, acceptedInputSeq);
    this.metrics.lastAcceptedSeq = Math.max(this.metrics.lastAcceptedSeq, acceptedInputSeq);
    this.pendingInputs = this.pendingInputs.filter((entry) => entry.seq > acceptedInputSeq);
    for (const [inputSeq, pending] of this._inputAcks) {
      if (inputSeq <= acceptedInputSeq) this._settleInputAck(inputSeq, { type: 'ack', ackKind: 'input', inputSeq });
    }
  }

  _nextCommandEnvelope() {
    if (!this.commandCredential || !this.authorityRunId) throw new Error('Join the active sim run before sending commands');
    this.commandSeq += 1;
    return { runId: this.authorityRunId, playerId: this.authorityPlayerId || this.clientId, commandSeq: this.commandSeq };
  }

  _enqueueCommand(send) {
    const pending = this._commandTail.then(send, send);
    this._commandTail = pending.catch(() => null);
    return pending;
  }

  async _syncEventWindow(snapshot) {
    const runId = snapshot?.runId || snapshot?.session?.runId || null;
    const watermark = Math.max(0, Number(snapshot?.lastEventSeq) || 0);
    if (!runId) { this.latestEvents = []; return; }
    if (this.runId !== runId) {
      this.runId = runId;
      this.eventCursor = 0;
      this.latestEvents = [];
      if (this.authorityRunId && this.authorityRunId !== runId) this._clearAuthority(runId, null);
    }
    this.lastSnapshotId = Math.max(0, Number(snapshot?.snapshotId) || 0);
    this.metrics.lastSnapshotId = this.lastSnapshotId;
    if (watermark <= this.eventCursor) return;
    const window = await this._json(`/events?since=${this.eventCursor}&runId=${encodeURIComponent(runId)}`);
    if (window.reset || window.stale || window.future) {
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
    if (this.transport !== 'stream') {
      const events = this.latestEvents;
      this.latestEvents = [];
      return events;
    }
    const frames = [...this._eventFrames.values()]
      .filter((frame) => frame.deliveryId <= this._deliveryAckThrough)
      .sort((a, b) => a.eventSeq - b.eventSeq);
    for (const frame of frames) this._eventFrames.delete(frame.eventSeq);
    this.latestEvents = [...this._eventFrames.values()]
      .filter((frame) => frame.deliveryId <= this._deliveryAckThrough)
      .sort((a, b) => a.eventSeq - b.eventSeq);
    if (frames.length > 0) {
      const eventSeq = frames.at(-1).eventSeq;
      this.eventCursor = Math.max(this.eventCursor, eventSeq);
      this.metrics.lastEventAck = this.eventCursor;
      this.metrics.lastEventSeq = this.eventCursor;
      this._sendFrame({ type: 'ack', ackKind: 'event', eventSeq: this.eventCursor });
    }
    return frames.map((frame) => ({
      runId: frame.runId, seq: frame.eventSeq, tick: frame.tick,
      visibility: frame.visibility, type: frame.eventType, payload: frame.payload,
    }));
  }

  _nowMs() {
    return globalThis.performance?.now ? globalThis.performance.now() : Date.now();
  }

  _recordSnapshotMetrics(snapshot) {
    const now = this._nowMs();
    if (this._lastSnapshotClientAt != null) this.metrics.lastSnapshotIntervalMs = now - this._lastSnapshotClientAt;
    this._lastSnapshotClientAt = now;
    if (Number.isFinite(Number(snapshot?.serverTime))) this.metrics.lastSnapshotLagMs = Date.now() - Number(snapshot.serverTime);
    this.metrics.lastSnapshotTick = snapshot?.tick ?? this.metrics.lastSnapshotTick;
    this.metrics.lastSnapshotId = snapshot?.snapshotId ?? this.metrics.lastSnapshotId;
    const localPlayer = snapshot?.players?.find((player) => player.clientId === this.clientId);
    const acceptedSeq = Number(localPlayer?.lastInputSeq);
    if (!Number.isFinite(acceptedSeq)) return;
    const acknowledged = this.pendingInputs.filter((entry) => entry.seq <= acceptedSeq);
    if (acknowledged.length === 0) return;
    const sentAt = acknowledged.at(-1).sentAt;
    this.metrics.lastInputToSnapshotMs = sentAt == null ? null : now - sentAt;
    this.pendingInputs = this.pendingInputs.filter((entry) => entry.seq > acceptedSeq);
  }

  getMetrics() {
    return {
      ...this.metrics,
      selectedTransport: this.transport,
      activeTransport: this.activeTransport,
      streamState: this._streamState,
      pendingActionCount: this._pendingActions.size,
      pendingInputCount: this.pendingInputs.length,
      pollIntervalMs: this.pollIntervalMs,
      latestRunId: this.runId,
      latestSnapshotId: this.lastSnapshotId,
      latestEventSeq: this.eventCursor,
      hotPathHttpOccurred: this._hotPathHttpCount > 0,
      slingshotEdgeAcks: this.metrics.slingshotEdgeAcks.map((entry) => ({ ...entry, requestedEdgeIds: [...entry.requestedEdgeIds], acceptedEdgeIds: [...entry.acceptedEdgeIds] })),
    };
  }

  async sendInput(input = {}) {
    if (this.transport !== 'stream') return this._sendHttpInput(input);
    if (!socketOpen(this._socket)) await (this._reconnectPromise || Promise.reject(new Error('Sim stream is not connected')));
    this.seq += 1;
    const queuedAt = this._nowMs();
    const continuous = {
      type: 'input', inputSeq: this.seq,
      moveX: input.moveX || 0, moveY: input.moveY || 0,
      thrust: input.thrust || 0, brake: input.brake || 0,
      slingshot: Boolean(input.slingshot), ability1: Boolean(input.ability1), ability2: Boolean(input.ability2),
      clientTimeMs: Date.now(),
    };
    this.lastSentInput = { ...continuous, seq: this.seq, sentAt: null, queuedAt };
    this.pendingInputs.push({ seq: this.seq, sentAt: null, queuedAt });
    if (this.pendingInputs.length > 32) this.pendingInputs.splice(0, this.pendingInputs.length - 32);
    const inputAck = this._awaitInputAck(continuous.inputSeq, null);
    this._sendFrame(continuous);
    const edgeIds = Array.isArray(input.slingshotEdges) ? input.slingshotEdges.slice(0, 8) : [];
    const actions = edgeIds.map((edgeId) => this._queueAction('slingshotEdge', { edgeId }));
    if (input.pulse) actions.push(this._queueAction('pulse', {}));
    if (input.extractConfirm) actions.push(this._queueAction('extractConfirm', {}));
    if (input.consumeSlot !== null && input.consumeSlot !== undefined) actions.push(this._queueAction('consume', { slot: input.consumeSlot }));
    const actionResults = Promise.all(actions).then((actionAcks) => {
      const accepted = actionAcks.filter((entry) => entry.status === 'accepted');
      const acceptedEdges = accepted.filter((entry) => entry.actionKind === 'slingshotEdge').map((entry) => entry.payload.edgeId);
      const settledEdges = actionAcks.filter((entry) => entry.actionKind === 'slingshotEdge').map((entry) => entry.payload.edgeId);
      if (edgeIds.length > 0) this._recordSlingshotAck(continuous, edgeIds, acceptedEdges, queuedAt, {});
      return {
        actionAcks,
        acceptedSlingshotEdges: acceptedEdges,
        settledSlingshotEdges: settledEdges,
        pendingSlingshotEdgeCount: accepted.find((entry) => entry.actionKind === 'slingshotEdge')?.result?.pending ?? null,
        pulseSettled: actionAcks.some((entry) => entry.actionKind === 'pulse'),
        pulseAccepted: accepted.some((entry) => entry.actionKind === 'pulse'),
        extractConfirmSettled: actionAcks.some((entry) => entry.actionKind === 'extractConfirm'),
        extractConfirmAccepted: accepted.some((entry) => entry.actionKind === 'extractConfirm'),
        consumeSettledSlot: actionAcks.find((entry) => entry.actionKind === 'consume')?.payload?.slot ?? null,
        consumeAcceptedSlot: accepted.find((entry) => entry.actionKind === 'consume')?.payload?.slot ?? null,
      };
    });
    const ack = await inputAck;
    return {
      ok: true,
      acceptedSeq: ack.inputSeq,
      acceptedSlingshotEdges: [],
      actionResults,
    };
  }

  async _sendHttpInput({ moveX = 0, moveY = 0, thrust = 0, brake = 0, slingshot = false, slingshotEdges = [], pulse = false, extractConfirm = false, ability1 = false, ability2 = false, consumeSlot = null }) {
    this.seq += 1;
    const sentAt = this._nowMs();
    this.lastSentInput = { ...this._nextCommandEnvelope(), seq: this.seq, moveX, moveY, thrust, brake, slingshot, slingshotEdges: Array.isArray(slingshotEdges) ? slingshotEdges.slice(0, 8) : [], pulse, extractConfirm, ability1, ability2, consumeSlot, sentAt };
    this.pendingInputs.push({ seq: this.seq, sentAt });
    if (this.pendingInputs.length > 32) this.pendingInputs.splice(0, this.pendingInputs.length - 32);
    const inputPayload = { ...this.lastSentInput, timestamp: Date.now() };
    const response = await this._enqueueCommand(() => this._json('/input', { method: 'POST', body: JSON.stringify(inputPayload) }));
    this.metrics.lastAcceptedSeq = response.acceptedSeq ?? this.metrics.lastAcceptedSeq;
    this.metrics.lastInputAckRttMs = this._nowMs() - sentAt;
    if (inputPayload.slingshotEdges.length > 0) this._recordSlingshotAck(inputPayload, inputPayload.slingshotEdges, response.acceptedSlingshotEdges || [], sentAt, response);
    return response;
  }

  _recordSlingshotAck(input, requestedEdgeIds, acceptedEdgeIds, sentAt, response) {
    this.metrics.slingshotEdgeAcks.push({
      inputSeq: input.inputSeq || input.seq, commandSeq: input.commandSeq ?? null,
      requestedEdgeIds: [...requestedEdgeIds], acceptedEdgeIds: [...acceptedEdgeIds],
      sentAtUnixMs: input.timestamp || input.clientTimeMs, acknowledgedAtUnixMs: Date.now(),
      ackRttMs: this._nowMs() - sentAt, serverTick: response.tick ?? null,
      pendingEdgeCount: response.pendingSlingshotEdgeCount ?? null,
    });
    if (this.metrics.slingshotEdgeAcks.length > 16) this.metrics.slingshotEdgeAcks.splice(0, this.metrics.slingshotEdgeAcks.length - 16);
  }

  async inventoryAction({ action, cargoSlot = -1, equipSlot = -1, consumableSlot = -1 }) {
    if (this.transport === 'stream') {
      const ack = await this._queueAction('inventory', { action, cargoSlot, equipSlot, consumableSlot });
      if (ack.status !== 'accepted') throw new Error(ack.result?.code || 'Inventory action rejected');
      await this._waitForOwnerAction(ack.actionSeq, 5000);
      return { ok: true, acceptedCommandSeq: ack.commandSeq, action: ack.result?.action || action };
    }
    const envelope = this._nextCommandEnvelope();
    return this._enqueueCommand(() => this._json('/inventory/action', { method: 'POST', body: JSON.stringify({ ...envelope, action, cargoSlot, equipSlot, consumableSlot }) }));
  }

  async getProfile(profileId) {
    if (!profileId) throw new Error('profileId is required');
    return this._json(`/profile?profileId=${encodeURIComponent(profileId)}`);
  }

  async _discoverProtocol(...args) { return streamOps._discoverProtocol.apply(this, args); }
  async _issueStreamTicket(...args) { return streamOps._issueStreamTicket.apply(this, args); }
  async _verifySessionManifest(...args) { return streamOps._verifySessionManifest.apply(this, args); }
  async _connectStream(...args) { return streamOps._connectStream.apply(this, args); }
  _handleStreamFrame(...args) { return streamOps._handleStreamFrame.apply(this, args); }
  _resetStreamFrameScheduler(...args) { return streamOps._resetStreamFrameScheduler.apply(this, args); }
  _scheduleEncodedStreamFrame(...args) { return streamOps._scheduleEncodedStreamFrame.apply(this, args); }
  _resetDeliveryEpoch(...args) { return streamOps._resetDeliveryEpoch.apply(this, args); }
  _mergeFrame(...args) { return streamOps._mergeFrame.apply(this, args); }
  _trimFrameMaps(...args) { return streamOps._trimFrameMaps.apply(this, args); }
  _waitForStreamState(...args) { return streamOps._waitForStreamState.apply(this, args); }
  _awaitInputAck(...args) { return streamOps._awaitInputAck.apply(this, args); }
  _settleInputAck(...args) { return streamOps._settleInputAck.apply(this, args); }
  _queueAction(...args) { return streamOps._queueAction.apply(this, args); }
  _awaitPendingActions(...args) { return streamOps._awaitPendingActions.apply(this, args); }
  async _drainPendingActions(...args) { return streamOps._drainPendingActions.apply(this, args); }
  _waitForOwnerAction(...args) { return streamOps._waitForOwnerAction.apply(this, args); }
  _armHeartbeatWatchdog(...args) { return streamOps._armHeartbeatWatchdog.apply(this, args); }
  _sendFrame(...args) { return streamOps._sendFrame.apply(this, args); }
  _handleSocketClose(...args) { return streamOps._handleSocketClose.apply(this, args); }
  _scheduleReconnect(...args) { return streamOps._scheduleReconnect.apply(this, args); }
  async _stopStream(...args) { return streamOps._stopStream.apply(this, args); }
}
