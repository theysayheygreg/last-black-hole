function randomId(prefix = 'action') {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  return `${prefix}-${Math.random().toString(36).slice(2, 10)}`;
}

function socketUrl(baseUrl, path) {
  const url = new URL(path, `${String(baseUrl).replace(/\/+$/, '')}/`);
  url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
  return url.toString();
}

function socketOpen(socket) {
  return socket && socket.readyState === 1;
}

function frameData(event) {
  const value = event?.data ?? event;
  if (typeof value === 'string') return value;
  if (value instanceof ArrayBuffer) return new TextDecoder().decode(value);
  if (ArrayBuffer.isView(value)) return new TextDecoder().decode(value);
  return String(value);
}

function classifyStreamWire(wire) {
  try {
    const candidate = JSON.parse(wire);
    return {
      type: typeof candidate?.type === 'string' ? candidate.type : 'unknown',
      runId: typeof candidate?.runId === 'string' ? candidate.runId : undefined,
      actionId: typeof candidate?.actionId === 'string' ? candidate.actionId : undefined,
      deliveryId: Number.isSafeInteger(candidate?.deliveryId) ? candidate.deliveryId : undefined,
      inputSeq: Number.isSafeInteger(candidate?.inputSeq) ? candidate.inputSeq : undefined,
      eventSeq: Number.isSafeInteger(candidate?.eventSeq) ? candidate.eventSeq : undefined,
      snapshotId: Number.isSafeInteger(candidate?.snapshotId) ? candidate.snapshotId : undefined,
      heartbeatId: Number.isSafeInteger(candidate?.heartbeatId) ? candidate.heartbeatId : undefined,
      commandSeq: Number.isSafeInteger(candidate?.commandSeq) ? candidate.commandSeq : undefined,
    };
  } catch {
    // Classification is only a privacy-safe scheduling sidecar. The release
    // callback performs the authoritative parse and closes on malformed input.
    return { type: 'unknown' };
  }
}

const DELIVERY_WINDOW_SIZE = 128;
const SCHEDULED_STREAM_FRAME_LIMIT = 256;

function refreshPlayableEvents(client) {
  client.latestEvents = [...client._eventFrames.values()]
    .filter((frame) => frame.deliveryId <= client._deliveryAckThrough)
    .sort((a, b) => a.eventSeq - b.eventSeq);
}

function failDeliveryEpoch(client, reason) {
  client._deliveryEpochFailed = true;
  client.metrics.reconnectReason = reason;
  client._eventFrames.clear();
  client.latestEvents = [];
  if (socketOpen(client._socket)) client._socket.close(4000, reason);
  return { accepted: false, duplicate: false };
}

function receiveReliableDelivery(client, deliveryId) {
  if (client._deliveryEpochFailed) return { accepted: false, duplicate: false };
  const id = Number(deliveryId);
  if (!Number.isSafeInteger(id) || id <= 0) return failDeliveryEpoch(client, 'invalid-delivery-id');
  if (id <= client._deliveryAckThrough) {
    if (client._deliveryAckThrough > 0) {
      client._sendFrame({ type: 'ack', ackKind: 'delivery', deliveryId: client._deliveryAckThrough });
    }
    return { accepted: true, duplicate: true };
  }
  if (client._pendingDeliveryIds.has(id)) return { accepted: true, duplicate: true };
  if (id - client._deliveryAckThrough > DELIVERY_WINDOW_SIZE
      || client._pendingDeliveryIds.size >= DELIVERY_WINDOW_SIZE) {
    return failDeliveryEpoch(client, 'delivery-window-overflow');
  }
  client._pendingDeliveryIds.add(id);
  const before = client._deliveryAckThrough;
  while (client._pendingDeliveryIds.delete(client._deliveryAckThrough + 1)) {
    client._deliveryAckThrough += 1;
  }
  client.metrics.lastDeliveryAck = client._deliveryAckThrough;
  if (client._deliveryAckThrough > before) {
    client._sendFrame({ type: 'ack', ackKind: 'delivery', deliveryId: client._deliveryAckThrough });
    refreshPlayableEvents(client);
  }
  return { accepted: true, duplicate: false };
}

export function _resetDeliveryEpoch() {
  this._deliveryAckThrough = 0;
  this._pendingDeliveryIds.clear();
  this._deliveryEpochFailed = false;
  this.metrics.lastDeliveryAck = 0;
  this._eventFrames.clear();
  this.latestEvents = [];
}

function streamFrameSemanticId(frame, generation) {
  return frame.deliveryId
    ?? frame.actionId
    ?? frame.inputSeq
    ?? frame.eventSeq
    ?? frame.snapshotId
    ?? frame.heartbeatId
    ?? frame.commandSeq
    ?? `${frame.type || 'unknown'}:${generation}`;
}

function streamFrameMetadata(client, frame, direction, generation) {
  return Object.freeze({
    direction,
    frameClass: frame.type || 'unknown',
    frameType: frame.type || 'unknown',
    semanticId: streamFrameSemanticId(frame, generation),
    runId: frame.runId || client.runId || client.authorityRunId || null,
    connectionEpoch: client.connectionEpoch,
    connectionGeneration: generation,
    playerId: client.authorityPlayerId || client.clientId,
  });
}

function failStreamScheduler(client, generation, reason, expectedSocket = null) {
  if (generation !== client._socketGeneration
      || (expectedSocket && expectedSocket !== client._socket)) return false;
  client.metrics.scheduledStreamFrameFailures += 1;
  client.metrics.reconnectReason = reason;
  client._resetStreamFrameScheduler();
  if (generation === client._socketGeneration && socketOpen(client._socket)) {
    client._socket.close(4000, reason);
  }
  return false;
}

export function _resetStreamFrameScheduler({ preserveSameRunUpstream = false } = {}) {
  for (const token of this._scheduledStreamFrames) {
    if (preserveSameRunUpstream
        && token.direction === 'client-to-authority'
        && (token.frameType === 'action' || token.frameType === 'input')) continue;
    token.active = false;
    token.cancelled = true;
    try { token.cancel?.(); } catch {}
  }
  for (const token of [...this._scheduledStreamFrames]) {
    if (!token.active) this._scheduledStreamFrames.delete(token);
  }
  this.metrics.pendingScheduledStreamFrames = this._scheduledStreamFrames.size;
}

export function _scheduleEncodedStreamFrame(wire, frame, direction, generation, deliverWire) {
  const bypass = frame.type === 'hello'
    || frame.type === 'welcome'
    || frame.type === 'rebase'
    || frame.type === 'error'
    || frame.type === 'close';
  if (!this._scheduleStreamFrameCallback || bypass) return deliverWire();
  if (generation !== this._socketGeneration || this._scheduledStreamFrames.size >= SCHEDULED_STREAM_FRAME_LIMIT) {
    return failStreamScheduler(this, generation, 'stream-scheduler-capacity');
  }
  const socket = this._socket;
  const runId = this.runId;
  const connectionEpoch = this.connectionEpoch;
  const metadata = streamFrameMetadata(this, frame, direction, generation);
  const token = {
    active: true, cancel: null, delivered: 0, deliveryCount: null,
    cancelled: false, completed: false, direction, frameType: frame.type,
  };
  this._scheduledStreamFrames.add(token);
  this.metrics.pendingScheduledStreamFrames = this._scheduledStreamFrames.size;
  const settle = (completed = false) => {
    if (!token.active) return;
    token.active = false;
    token.completed = completed;
    this._scheduledStreamFrames.delete(token);
    this.metrics.pendingScheduledStreamFrames = this._scheduledStreamFrames.size;
  };
  const deliver = () => {
    if (!token.active) {
      if (token.completed && !token.cancelled) {
        return failStreamScheduler(this, generation, 'stream-scheduler-extra-callback', socket);
      }
      return false;
    }
    if (token.delivered >= 2) {
      settle();
      return failStreamScheduler(this, generation, 'stream-scheduler-extra-callback', socket);
    }
    token.delivered += 1;
    const barrier = direction === 'authority-to-client'
      && (frame.type === 'welcome' || frame.type === 'rebase');
    const live = generation === this._socketGeneration
      && socket === this._socket
      && socketOpen(this._socket)
      && (barrier || (runId === this.runId && connectionEpoch === this.connectionEpoch));
    let delivered = false;
    if (live) {
      try {
        delivered = deliverWire() !== false;
      } catch {
        failStreamScheduler(this, generation, 'stream-scheduler-delivery-failed', socket);
      }
    }
    if (!delivered) settle();
    else if (token.deliveryCount !== null && token.delivered >= token.deliveryCount) settle(true);
    return delivered;
  };
  try {
    const outcome = this._scheduleStreamFrameCallback(wire, metadata, deliver);
    if (outcome && typeof outcome.then === 'function') {
      Promise.resolve(outcome).catch(() => {});
      settle();
      return failStreamScheduler(this, generation, 'stream-scheduler-async-outcome');
    }
    if (outcome === false || outcome?.accepted === false) {
      settle();
      return failStreamScheduler(this, generation, 'stream-scheduler-rejected');
    }
    token.cancel = typeof outcome === 'function' ? outcome
      : (typeof outcome?.cancel === 'function' ? outcome.cancel : null);
    token.deliveryCount = outcome?.deliveryCount === undefined ? 1 : outcome.deliveryCount;
    if (!Number.isSafeInteger(token.deliveryCount)
        || token.deliveryCount < 0
        || token.deliveryCount > 2
        || token.delivered > token.deliveryCount) {
      settle();
      return failStreamScheduler(this, generation, 'stream-scheduler-invalid-copy-count');
    }
    if (token.deliveryCount === 0 || token.delivered >= token.deliveryCount) settle(true);
    return true;
  } catch {
    settle();
    return failStreamScheduler(this, generation, 'stream-scheduler-threw');
  }
}

export async function _discoverProtocol() {
  if (this._protocol) return this._protocol;
  const protocol = await this._json('/protocol');
  const stream = protocol?.transports?.stream;
  if (!stream?.path || !stream?.wireVersion || !protocol?.version) throw new Error('Sim server did not advertise a stream protocol');
  this._protocol = { path: stream.path, wireVersion: stream.wireVersion, simProtocolVersion: protocol.version };
  return this._protocol;
}

export async function _issueStreamTicket(kind) {
  return this._json('/multiplayer/ticket', { method: 'POST', body: JSON.stringify({ kind }) });
}

export async function _connectStream(kind = 'admission') {
  if (!this.WebSocketImpl) throw new Error('WebSocket is unavailable in this client');
  this._resetStreamFrameScheduler();
  const generation = ++this._socketGeneration;
  const canceled = new Promise((_, reject) => {
    this._connectionAttempts.set(generation, { reject });
  });
  let protocol;
  let ticket;
  try {
    protocol = await Promise.race([this._discoverProtocol(), canceled]);
    if (generation !== this._socketGeneration) throw new Error('Sim stream connection superseded during discovery');
    ticket = await Promise.race([this._issueStreamTicket(kind), canceled]);
    if (generation !== this._socketGeneration) throw new Error('Sim stream connection superseded during ticket issuance');
  } catch (error) {
    this._connectionAttempts.delete(generation);
    throw error;
  }
  const ws = new this.WebSocketImpl(socketUrl(this.baseUrl, protocol.path));
  this._socket = ws;
  this._streamState = kind === 'resume' ? 'reconnecting' : 'connecting';
  this._closeDirective = null;
  const baselineVersion = this._streamVersion;
  const hello = {
    type: 'hello', wireVersion: protocol.wireVersion, simProtocolVersion: protocol.simProtocolVersion,
    ...(kind === 'resume' ? {
      resumeTicket: ticket.ticket,
      ...(this.runId && this.lastSnapshotId > 0 ? { lastRunId: this.runId, lastSnapshotId: this.lastSnapshotId, lastEventSeq: this.eventCursor } : {}),
    } : { admissionTicket: ticket.ticket }),
  };
  await new Promise((resolve, reject) => {
    let settled = false;
    let timer = null;
    const finish = (fn, value) => {
      if (!settled) {
        settled = true;
        clearTimeout(timer);
        this._connectionAttempts.delete(generation);
        fn(value);
      }
    };
    this._connectionAttempts.set(generation, {
      reject: (error) => finish(reject, error),
      socket: ws,
    });
    ws.addEventListener('open', () => {
      if (generation !== this._socketGeneration) return;
      this._sendFrame(hello, generation);
    });
    ws.addEventListener('message', (event) => {
      if (generation !== this._socketGeneration) return;
      try {
        const wire = frameData(event);
        const classification = classifyStreamWire(wire);
        this._scheduleEncodedStreamFrame(wire, classification, 'authority-to-client', generation, () => {
          const frame = JSON.parse(wire);
          this._handleStreamFrame(frame, generation);
          if (this._streamVersion > baselineVersion) finish(resolve);
          return true;
        });
      } catch (error) {
        if (!settled) finish(reject, error);
        else if (ws.readyState === 1) ws.close(4000, 'invalid scheduled stream frame');
      }
    });
    ws.addEventListener('error', () => {
      if (generation === this._socketGeneration) finish(reject, new Error('Sim stream connection failed'));
    });
    ws.addEventListener('close', (event) => {
      if (generation !== this._socketGeneration) return;
      if (!settled) finish(reject, new Error(`Sim stream closed during admission (${event.code})`));
      this._handleSocketClose(event, generation);
    });
    timer = setTimeout(() => {
      if (generation === this._socketGeneration) finish(reject, new Error('Timed out waiting for sim stream baseline'));
    }, 5000);
    timer.unref?.();
  });
  this.activeTransport = 'stream';
  this._streamState = 'open';
  if (kind === 'resume') {
    this.metrics.reconnectCount += 1;
    if (this.lastSentInput && this.lastSentInput.inputSeq > this.metrics.lastInputAck) {
      // Continuous input is latest-wins rather than idempotent. The old socket
      // can settle its final frame after the resume welcome captured a cursor,
      // so replaying that exact sequence can race into a stale-input close.
      // Re-issue the same physical intent above every observed cursor instead;
      // reliable action frames below retain their original identities.
      const inputSeq = Math.max(this.seq, this.lastSentInput.inputSeq, this.metrics.lastInputAck) + 1;
      this.seq = inputSeq;
      const resumedInput = {
        type: 'input', inputSeq,
        moveX: this.lastSentInput.moveX, moveY: this.lastSentInput.moveY,
        thrust: this.lastSentInput.thrust, brake: this.lastSentInput.brake,
        slingshot: this.lastSentInput.slingshot, ability1: this.lastSentInput.ability1,
        ability2: this.lastSentInput.ability2, clientTimeMs: Date.now(),
      };
      const queuedAt = this._nowMs();
      this.lastSentInput = { ...resumedInput, seq: inputSeq, sentAt: null, queuedAt };
      this.pendingInputs = this.pendingInputs.filter((entry) => entry.seq > this.lastSentInput.inputSeq);
      this.pendingInputs.push({ seq: inputSeq, sentAt: null, queuedAt });
      this._sendFrame(resumedInput);
    }
    for (const pending of this._pendingActions.values()) this._sendFrame(pending.frame);
  }
}

export function _handleStreamFrame(frame, generation) {
  if (generation !== this._socketGeneration) return;
  if (frame.type === 'welcome') {
    this._resetStreamFrameScheduler();
    this._resetDeliveryEpoch();
    this._adoptWelcome(frame);
    this._armHeartbeatWatchdog(frame.heartbeatIntervalMs, generation);
    return;
  }
  if (frame.type === 'heartbeat') {
    this._armHeartbeatWatchdog(null, generation);
    this._sendFrame({ type: 'pong', heartbeatId: frame.heartbeatId, clientTimeMs: Date.now() });
    return;
  }
  if (frame.type === 'rebase') {
    this._resetStreamFrameScheduler({ preserveSameRunUpstream: frame.runId === this.runId });
    if (frame.runId !== this.runId) {
      this.lastSnapshotId = 0;
      this.latestSnapshot = null;
    }
    this._rebase = frame;
    this.metrics.lastRecoveryReason = frame.reason;
    this._pendingPublic.clear();
    this._pendingOwner.clear();
    if (frame.reason === 'event-gap' || frame.reason === 'run-changed') this.metrics.eventGapRecoveries += 1;
    this._resetDeliveryEpoch();
    this.eventCursor = frame.lastEventSeq;
    return;
  }
  if (frame.type === 'publicState') {
    this._pendingPublic.set(frame.snapshotId, frame);
    this._trimFrameMaps();
    this._mergeFrame(frame.snapshotId);
    return;
  }
  if (frame.type === 'ownerState') {
    if (frame.runId !== this.runId || frame.membershipId !== this.membershipId || frame.playerId !== this.authorityPlayerId) return;
    this._pendingOwner.set(frame.snapshotId, frame);
    this._trimFrameMaps();
    this._mergeFrame(frame.snapshotId);
    return;
  }
  if (frame.type === 'event') {
    if (frame.runId !== this.runId) return;
    const relevant = frame.eventSeq > this.eventCursor;
    const newEvent = relevant && !this._eventFrames.has(frame.eventSeq);
    if (newEvent && this._eventFrames.size >= 64) {
      failDeliveryEpoch(this, 'event-window-overflow');
      return;
    }
    const delivery = receiveReliableDelivery(this, frame.deliveryId);
    if (!delivery.accepted || delivery.duplicate || !relevant) return;
    if (!newEvent) return;
    this._eventFrames.set(frame.eventSeq, frame);
    refreshPlayableEvents(this);
    return;
  }
  if (frame.type === 'ack' && frame.ackKind === 'input') {
    this.metrics.lastInputAck = Math.max(this.metrics.lastInputAck, frame.inputSeq);
    this.metrics.lastAcceptedSeq = Math.max(this.metrics.lastAcceptedSeq, frame.inputSeq);
    this._settleInputAck(frame.inputSeq, frame);
    return;
  }
  if (frame.type === 'ack' && frame.ackKind === 'action') {
    const settled = this._settledActionAcks.get(frame.actionId);
    if (settled) {
      if (settled.actionSeq !== frame.actionSeq || settled.commandSeq !== frame.commandSeq) {
        failDeliveryEpoch(this, 'action-ack-identity-mismatch');
        return;
      }
      receiveReliableDelivery(this, frame.deliveryId);
      return;
    }
    const pending = this._pendingActions.get(frame.actionId);
    if (!pending || pending.frame.actionSeq !== frame.actionSeq || pending.frame.commandSeq !== frame.commandSeq) {
      failDeliveryEpoch(this, 'unknown-action-ack');
      return;
    }
    const delivery = receiveReliableDelivery(this, frame.deliveryId);
    if (!delivery.accepted || delivery.duplicate) return;
    this._pendingActions.delete(frame.actionId);
    this._settledActionAcks.set(frame.actionId, { actionSeq: frame.actionSeq, commandSeq: frame.commandSeq });
    while (this._settledActionAcks.size > 128) this._settledActionAcks.delete(this._settledActionAcks.keys().next().value);
    this.metrics.lastActionAck = Math.max(this.metrics.lastActionAck, frame.actionSeq);
    pending.resolve({ ...frame, actionKind: pending.frame.actionKind, payload: pending.frame.payload });
    return;
  }
  if (frame.type === 'error') {
    this.metrics.reconnectReason = frame.code;
    if (frame.fatal && !frame.retryable) throw new Error(frame.message || frame.code);
    return;
  }
  if (frame.type === 'close') this._closeDirective = frame;
}

export function _mergeFrame(snapshotId) {
  const pub = this._pendingPublic.get(snapshotId);
  const owner = this._pendingOwner.get(snapshotId);
  if (!pub || !owner) return;
  if (!this._rebase && snapshotId <= this.lastSnapshotId) {
    this._pendingPublic.delete(snapshotId);
    this._pendingOwner.delete(snapshotId);
    return;
  }
  if (this._rebase && snapshotId < this._rebase.snapshotId) return;
  const aligned = pub.runId === owner.runId
    && pub.runId === this.runId
    && pub.snapshotId === owner.snapshotId
    && pub.tick === owner.tick
    && pub.simTime === owner.simTime
    && pub.lastEventSeq === owner.lastEventSeq
    && pub.fieldRevision === owner.fieldRevision;
  if (!aligned) return;
  const state = pub.state || {};
  const players = Array.isArray(state.players) ? state.players.map((player) =>
    player.clientId === owner.playerId ? { ...player, ...owner.state } : player) : [];
  this.latestSnapshot = { ...state, players };
  this.runId = pub.runId;
  this.lastSnapshotId = pub.snapshotId;
  this._recordSnapshotMetrics(this.latestSnapshot);
  this._applySessionClocks(this.latestSnapshot.session);
  this.metrics.lastSnapshotId = pub.snapshotId;
  this.metrics.lastEventSeq = Math.max(this.metrics.lastEventSeq, pub.lastEventSeq);
  this._latestOwnerActionSeq = Math.max(this._latestOwnerActionSeq, owner.lastActionSeq);
  this._pendingPublic.delete(snapshotId);
  this._pendingOwner.delete(snapshotId);
  if (this._rebase) {
    this._sendFrame({ type: 'ack', ackKind: 'baseline', snapshotId, eventSeq: this._rebase.lastEventSeq });
    this._rebase = null;
  }
  this._streamVersion += 1;
  for (const waiter of [...this._streamWaiters]) {
    if (!waiter.predicate || waiter.predicate()) {
      this._streamWaiters.splice(this._streamWaiters.indexOf(waiter), 1);
      waiter.resolve();
    }
  }
}

export function _trimFrameMaps() {
  for (const map of [this._pendingPublic, this._pendingOwner]) {
    while (map.size > 4) map.delete(map.keys().next().value);
  }
}

export function _waitForStreamState(afterVersion, timeoutMs, predicate = null) {
  if (this._streamVersion > afterVersion) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const waiter = { resolve, reject, predicate };
    this._streamWaiters.push(waiter);
    setTimeout(() => {
      const index = this._streamWaiters.indexOf(waiter);
      if (index >= 0) this._streamWaiters.splice(index, 1);
      reject(new Error('Timed out waiting for authoritative stream state'));
    }, timeoutMs);
  });
}

export function _awaitInputAck(inputSeq, sentAt) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      this._inputAcks.delete(inputSeq);
      reject(new Error('Timed out waiting for input ACK'));
    }, 5000);
    this._inputAcks.set(inputSeq, { resolve, reject, timer, sentAt });
  });
}

export function _settleInputAck(inputSeq, frame) {
  for (const [pendingSeq, pending] of this._inputAcks) {
    if (pendingSeq > inputSeq) continue;
    clearTimeout(pending.timer);
    this._inputAcks.delete(pendingSeq);
    this.metrics.lastInputAckRttMs = pending.sentAt == null ? null : this._nowMs() - pending.sentAt;
    pending.resolve(frame);
  }
  this.pendingInputs = this.pendingInputs.filter((entry) => entry.seq > inputSeq);
}

export function _queueAction(actionKind, payload) {
  if (this._pendingActions.size >= 32) return Promise.reject(new Error('Reliable action queue is full'));
  this.actionSeq += 1;
  this.commandSeq += 1;
  const actionId = randomId('action');
  const frame = { type: 'action', actionId, actionSeq: this.actionSeq, commandSeq: this.commandSeq, actionKind, payload, clientTimeMs: Date.now() };
  const promise = new Promise((resolve, reject) => {
    this._pendingActions.set(actionId, { frame, resolve, reject, promise: null });
    this._sendFrame(frame);
  });
  this._pendingActions.get(actionId).promise = promise;
  return promise;
}

export function _awaitPendingActions() {
  return Promise.all([...this._pendingActions.values()].map((entry) => entry.promise));
}

export async function _drainPendingActions(timeoutMs) {
  if (this._pendingActions.size === 0) return;
  let timer = null;
  try {
    await Promise.race([
      this._awaitPendingActions(),
      new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error('Timed out draining reliable actions before control-plane mutation')), timeoutMs);
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}

export function _waitForOwnerAction(actionSeq, timeoutMs) {
  if (this._latestOwnerActionSeq >= actionSeq) return Promise.resolve();
  return this._waitForStreamState(this._streamVersion, timeoutMs, () => this._latestOwnerActionSeq >= actionSeq);
}

export function _armHeartbeatWatchdog(intervalMs, generation) {
  clearTimeout(this._heartbeatTimer);
  const interval = Math.max(1000, Number(intervalMs) || Number(this._heartbeatIntervalMs) || 5000);
  this._heartbeatIntervalMs = interval;
  this._heartbeatTimer = setTimeout(() => {
    if (generation !== this._socketGeneration || !socketOpen(this._socket)) return;
    this.metrics.reconnectReason = 'heartbeat-blackout';
    this._socket.close(4000, 'heartbeat blackout');
  }, interval * 2.5);
  this._heartbeatTimer.unref?.();
}

export function _sendFrame(frame, generation = this._socketGeneration) {
  const socket = this._socket;
  if (!socketOpen(socket)) return false;
  const wire = JSON.stringify(frame);
  return this._scheduleEncodedStreamFrame(wire, frame, 'client-to-authority', generation, () => {
    if (generation !== this._socketGeneration || socket !== this._socket || !socketOpen(socket)) return false;
    const physicallySentAt = this._nowMs();
    if (frame.type === 'input') {
      const pendingInput = this.pendingInputs.find((entry) => entry.seq === frame.inputSeq);
      if (pendingInput && pendingInput.sentAt == null) pendingInput.sentAt = physicallySentAt;
      const pendingAck = this._inputAcks.get(frame.inputSeq);
      if (pendingAck && pendingAck.sentAt == null) pendingAck.sentAt = physicallySentAt;
      if (this.lastSentInput?.inputSeq === frame.inputSeq && this.lastSentInput.sentAt == null) {
        this.lastSentInput.sentAt = physicallySentAt;
      }
    }
    socket.send(wire);
    return true;
  });
}

export function _handleSocketClose(event, generation) {
  if (generation !== this._socketGeneration || this._shuttingDown || this.transport !== 'stream') return;
  this._resetStreamFrameScheduler();
  clearTimeout(this._heartbeatTimer);
  this.activeTransport = 'http';
  this._streamState = 'disconnected';
  const directive = this._closeDirective;
  const reconnectable = directive ? directive.reconnectable : ![1000, 4400, 4401, 4403, 4406].includes(event.code);
  const reason = directive?.reason || event.reason || `socket-${event.code}`;
  this.metrics.reconnectReason = reason;
  if (reconnectable) this._scheduleReconnect(reason, directive?.retryAfterMs || 0);
}

export function _scheduleReconnect(reason, initialDelay = 0) {
  if (this._reconnectPromise || this._shuttingDown) return this._reconnectPromise;
  this.metrics.reconnectReason = reason;
  this._reconnectPromise = (async () => {
    let lastError = null;
    for (let attempt = 0; attempt < 5 && !this._shuttingDown; attempt += 1) {
      const delay = attempt === 0 ? initialDelay : Math.min(2000, 100 * (2 ** (attempt - 1)));
      if (delay > 0) await new Promise((resolve) => setTimeout(resolve, delay));
      try { await this._connectStream('resume'); return; } catch (error) { lastError = error; }
    }
    this._streamState = 'failed';
    throw lastError || new Error('Sim stream reconnect exhausted');
  })().finally(() => { this._reconnectPromise = null; });
  this._reconnectPromise.catch(() => null);
  return this._reconnectPromise;
}

export async function _stopStream(reason) {
  this._socketGeneration += 1;
  this._resetStreamFrameScheduler();
  for (const [generation, attempt] of this._connectionAttempts) {
    this._connectionAttempts.delete(generation);
    attempt.reject(new Error(`Sim stream connection canceled: ${reason}`));
    if (attempt.socket?.readyState < 2) attempt.socket.close(1000, 'connection canceled');
  }
  const ws = this._socket;
  this._socket = null;
  this.activeTransport = 'http';
  this._streamState = reason || 'closed';
  clearTimeout(this._heartbeatTimer);
  if (ws && ws.readyState < 2) ws.close(1000, String(reason || 'closed').slice(0, 120));
  for (const pending of this._pendingActions.values()) pending.reject(new Error(`Sim stream stopped: ${reason}`));
  this._pendingActions.clear();
  this._settledActionAcks.clear();
  this._resetDeliveryEpoch();
}
