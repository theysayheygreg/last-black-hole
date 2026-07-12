"use strict";

const crypto = require("crypto");
const { WebSocket, WebSocketServer } = require("ws");
const {
  CLIENT_TO_SERVER,
  SERVER_TO_CLIENT,
  LIMITS,
  WireProtocolError,
  parseWireFrame,
  encodeWireFrame,
} = require("./multiplayer-wire-protocol.cjs");
const { createMultiplayerSendQueue } = require("./multiplayer-send-queue.cjs");
const {
  DEFAULTS,
  publicError,
  consumeRateBucket,
  stableBindingKey,
  normalizeAdapterOptions,
  createConnectionState,
  summarizeConnections,
  assertOwnerProjection,
  createUpgradeHandler,
  createLifecycleGuards,
  enqueueBoundedInbound,
} = require("./sim-ws-adapter-guards.cjs");

const MAX_PENDING_REPLAY_EVENTS = 32;
const MAX_REPLAY_EVENTS_PER_PASS = 8;
const MAX_PENDING_REPLAY_BYTES = 64 * 1024;
const ACTION_RELIABLE_MESSAGE_RESERVE = 16;
const ACTION_RELIABLE_BYTE_RESERVE = 32 * 1024;

function createSimWebSocketAdapter(options = {}) {
  const config = normalizeAdapterOptions(options);
  const scheduleOutboundFrame = typeof options.scheduleOutboundFrame === "function"
    ? options.scheduleOutboundFrame
    : null;
  const buildEventRecovery = typeof options.buildEventRecovery === "function"
    ? options.buildEventRecovery
    : async () => null;
  const {
    server, upgradeRouter, redeemHello, revalidateBinding, onInput, onAction, buildPublicState, buildOwnerState,
    onPong, onAck, now, path, helloTimeoutMs, heartbeatIntervalMs, backpressureTimeoutMs, shutdownTimeoutMs, closeGraceMs,
    maxConnections, maxPendingHello, maxPendingInbound, maxPendingInboundBytes, maxPendingInboundBytesTotal,
    sweepIntervalMs, queueOptions,
  } = config;
  const connections = new Set();
  const byBindingKey = new Map();
  const bindingKeys = new WeakMap();
  const wss = new WebSocketServer({ noServer: true, perMessageDeflate: false, maxPayload: LIMITS.maxFrameBytes });
  const lifecycle = new AbortController();
  let closed = false;
  let generation = 1;
  let currentRunId = config.runId;
  let heartbeatCounter = 0;
  let schedulerConnectionCounter = 0;
  let pendingHello = 0;
  let rejectedConnections = 0;
  let rejectedPendingHello = 0;
  let maxObservedPendingInbound = 0;
  let pendingInboundBytesTotal = 0;
  let maxObservedPendingInboundBytes = 0;
  const eventReplayStats = {
    replayedEvents: 0,
    eventAcks: 0,
    forcedRebases: 0,
    duplicatePendingEvents: 0,
  };
  const pressureMetricNames = Object.freeze([
    "wsBufferedBytes",
    "queuedBytes",
    "reliableBytes",
    "replayEventBytes",
    "pendingInboundBytes",
    "pendingSends",
    "scheduledSends",
  ]);
  const pressureTotals = Object.fromEntries(pressureMetricNames.map((name) => [name, 0]));
  const pressureMaxima = Object.fromEntries(pressureMetricNames.map((name) => [name, {
    total: 0,
    worstConnection: 0,
  }]));
  const pressurePolicy = {
    transportHighWaterBytes: null,
    applicationQueueBytes: null,
    reliableQueueBytes: null,
    replayEventBytes: MAX_PENDING_REPLAY_BYTES,
    inboundPendingBytes: maxPendingInboundBytes,
    connectionsCrossedTransportHighWater: 0,
    transportHighWaterCrossings: 0,
    connectionsHitQueuePolicy: 0,
    queuePolicyLimitCrossings: 0,
    queuePolicyEvents: 0,
    queuePolicyRebases: 0,
    queuePolicyDisconnects: 0,
  };

  function pressureValues(state) {
    const status = state.queue.status();
    let wsBufferedBytes = 0;
    try { wsBufferedBytes = Math.max(0, Number(state.ws.bufferedAmount) || 0); } catch {}
    return {
      wsBufferedBytes,
      queuedBytes: Math.max(0, Number(status.queuedBytes) || 0),
      reliableBytes: Math.max(0, Number(status.reliableBytes) || 0),
      replayEventBytes: Math.max(0, Number(state.pendingEventBytes) || 0),
      pendingInboundBytes: Math.max(0, Number(state.pendingInboundBytes) || 0),
      pendingSends: Math.max(0, Number(state.pendingSends) || 0),
      scheduledSends: Math.max(0, Number(state.scheduledSends?.size) || 0),
    };
  }

  function samplePressure(state) {
    if (!state?.queue || !state?.ws) return;
    const previous = state.pressureSnapshot || Object.fromEntries(pressureMetricNames.map((name) => [name, 0]));
    const current = pressureValues(state);
    state.pressureSnapshot = current;
    for (const name of pressureMetricNames) {
      pressureTotals[name] = Math.max(0, pressureTotals[name] + current[name] - previous[name]);
      pressureMaxima[name].total = Math.max(pressureMaxima[name].total, pressureTotals[name]);
      pressureMaxima[name].worstConnection = Math.max(pressureMaxima[name].worstConnection, current[name]);
    }
    const threshold = state.queue.limits.transportHighWaterBytes;
    pressurePolicy.transportHighWaterBytes ??= threshold;
    pressurePolicy.applicationQueueBytes ??= state.queue.limits.maxBytes;
    pressurePolicy.reliableQueueBytes ??= state.queue.limits.maxReliableBytes;
    const crossed = current.wsBufferedBytes >= threshold;
    if (crossed && !state.pressureTransportHigh) {
      pressurePolicy.transportHighWaterCrossings += 1;
      if (!state.pressureEverTransportHigh) {
        state.pressureEverTransportHigh = true;
        pressurePolicy.connectionsCrossedTransportHighWater += 1;
      }
    }
    state.pressureTransportHigh = crossed;
    const status = state.queue.status();
    const queueAtLimit = status.queuedBytes >= state.queue.limits.maxBytes
      || status.queuedMessages >= state.queue.limits.maxMessages
      || status.reliableBytes >= state.queue.limits.maxReliableBytes
      || status.reliableMessages >= state.queue.limits.maxReliableMessages
      || status.rebaseRequired
      || status.disconnectRequired;
    if (queueAtLimit && !state.pressureQueueAtLimit) {
      pressurePolicy.queuePolicyLimitCrossings += 1;
      if (!state.pressureEverQueuePolicy) {
        state.pressureEverQueuePolicy = true;
        pressurePolicy.connectionsHitQueuePolicy += 1;
      }
    }
    state.pressureQueueAtLimit = queueAtLimit;
  }

  function detachPressure(state) {
    samplePressure(state);
    for (const name of pressureMetricNames) {
      pressureTotals[name] = Math.max(0, pressureTotals[name] - (state.pressureSnapshot?.[name] || 0));
    }
    state.pressureSnapshot = Object.fromEntries(pressureMetricNames.map((name) => [name, 0]));
    state.pressureTransportHigh = false;
    state.pressureQueueAtLimit = false;
  }

  function markQueuePolicy(state, action) {
    if (action !== "rebase" && action !== "disconnect") return;
    pressurePolicy.queuePolicyEvents += 1;
    if (action === "rebase") pressurePolicy.queuePolicyRebases += 1;
    else pressurePolicy.queuePolicyDisconnects += 1;
    if (!state.pressureEverQueuePolicy) {
      state.pressureEverQueuePolicy = true;
      pressurePolicy.connectionsHitQueuePolicy += 1;
    }
    samplePressure(state);
  }

  function pressureDiagnostics() {
    for (const state of connections) samplePressure(state);
    const currentWorst = Object.fromEntries(pressureMetricNames.map((name) => [name, 0]));
    for (const state of connections) {
      for (const name of pressureMetricNames) {
        currentWorst[name] = Math.max(currentWorst[name], state.pressureSnapshot?.[name] || 0);
      }
    }
    const current = {};
    const maxima = {};
    for (const name of pressureMetricNames) {
      current[name] = Object.freeze({ total: pressureTotals[name], worstConnection: currentWorst[name] });
      maxima[name] = Object.freeze({ ...pressureMaxima[name] });
    }
    return Object.freeze({
      current: Object.freeze(current),
      maxima: Object.freeze(maxima),
      policy: Object.freeze({ ...pressurePolicy }),
    });
  }

  const handleUpgrade = createUpgradeHandler({
    wss,
    path,
    maxConnections,
    maxPendingHello,
    isClosed: () => closed,
    connectionCount: () => connections.size,
    pendingHelloCount: () => pendingHello,
    onConnectionRejected: () => { rejectedConnections += 1; },
    onPendingHelloRejected: () => { rejectedPendingHello += 1; },
  });
  const { callbackContext, stateIsLive } = createLifecycleGuards({
    lifecycle,
    getGeneration: () => generation,
    isClosed: () => closed,
  });

  async function isBindingCurrent(state, purpose) {
    if (!state.bound || !stateIsLive(state)) return false;
    const expectedGeneration = state.generation;
    try {
      const valid = await revalidateBinding(state.binding, callbackContext(state, purpose));
      return stateIsLive(state, expectedGeneration) && valid !== false;
    } catch {
      return false;
    }
  }

  function resetOutbound(state) {
    samplePressure(state);
    for (const token of [...(state.scheduledSends || [])]) {
      token.active = false;
      try { token.cancel?.(); } catch {}
    }
    state.scheduledSends?.clear();
    state.outboundGeneration = (state.outboundGeneration || 0) + 1;
    const result = state.queue.reset();
    samplePressure(state);
    return result;
  }

  function sendWireImmediate(state, wire, sendAttempt = null, { completeAttempt = true } = {}) {
    if (state.cleaned || state.ws.readyState !== WebSocket.OPEN) {
      if (sendAttempt) state.queue.completeSendAttempt(sendAttempt, { physicalCopies: 0 });
      return false;
    }
    if (sendAttempt && !state.queue.authorizePhysicalSend(sendAttempt)) return false;
    try {
      state.pendingSends += 1;
      samplePressure(state);
      state.ws.send(wire, (error) => {
        state.pendingSends = Math.max(0, state.pendingSends - 1);
        samplePressure(state);
        if (error) terminate(state);
        else flush(state);
      });
      if (sendAttempt) {
        if (!state.queue.recordPhysicalSend(sendAttempt)
          || (completeAttempt && !state.queue.completeSendAttempt(sendAttempt, { physicalCopies: 1 }))) {
          terminate(state);
          return false;
        }
      }
      samplePressure(state);
      return true;
    } catch {
      state.pendingSends = Math.max(0, state.pendingSends - 1);
      samplePressure(state);
      if (sendAttempt) state.queue.completeSendAttempt(sendAttempt, { physicalCopies: 0 });
      terminate(state);
      return false;
    }
  }

  function outboundFrameContext(state, frame) {
    const identity = state.identity || {};
    const semanticId = frame.deliveryId
      ?? frame.actionId
      ?? frame.heartbeatId
      ?? (frame.snapshotId === undefined ? undefined : `${frame.runId || currentRunId}:${frame.snapshotId}:${frame.type}`)
      ?? (frame.eventSeq === undefined ? undefined : `${frame.runId || currentRunId}:${frame.eventSeq}:${frame.type}`);
    return Object.freeze({
      direction: "authority-to-client",
      frameClass: frame.type,
      frameType: frame.type,
      semanticId,
      runId: frame.runId || currentRunId,
      playerId: identity.playerId || `pending-${state.schedulerConnectionId}`,
      membershipId: identity.membershipId,
      connectionEpoch: identity.connectionEpoch ?? state.generation,
      connectionGeneration: state.generation,
      schedulerConnectionId: state.schedulerConnectionId,
      outboundGeneration: state.outboundGeneration,
      signal: state.abortController.signal,
    });
  }

  function sendWire(state, wire, frame, sendAttempt = null) {
    // Epoch barriers and terminal frames are physically ordered outside the
    // impairment scheduler. Reliable attempts may be delayed only while their
    // queue lease remains live; scheduling alone never makes them ACK-eligible.
    if (
      !scheduleOutboundFrame
      || frame.type === "welcome"
      || frame.type === "rebase"
      || frame.type === "error"
      || frame.type === "close"
    ) {
      return sendWireImmediate(state, wire, sendAttempt);
    }
    if (state.cleaned || state.ws.readyState !== WebSocket.OPEN) {
      if (sendAttempt) state.queue.completeSendAttempt(sendAttempt, { physicalCopies: 0 });
      return false;
    }
    const context = outboundFrameContext(state, frame);
    const token = {
      active: true,
      cancel: null,
      delivered: 0,
      deliveryCount: null,
      physicalCopies: 0,
      sendAttempt,
    };
    state.scheduledSends ??= new Set();
    state.scheduledSends.add(token);
    samplePressure(state);
    const settle = () => {
      if (!token.active) return true;
      if (token.sendAttempt
        && !state.queue.completeSendAttempt(token.sendAttempt, { physicalCopies: token.physicalCopies })) {
        token.active = false;
        state.scheduledSends.delete(token);
        samplePressure(state);
        terminate(state);
        return false;
      }
      token.active = false;
      state.scheduledSends.delete(token);
      samplePressure(state);
      return true;
    };
    const deliver = () => {
      if (!token.active) return false;
      token.delivered += 1;
      const epochIsCurrent = context.connectionEpoch === undefined
        || state.identity?.connectionEpoch === context.connectionEpoch;
      const mayDeliverWhileClosing = frame.type === "close";
      const live = !closed
        && generation === context.connectionGeneration
        && state.generation === context.connectionGeneration
        && state.schedulerConnectionId === context.schedulerConnectionId
        && state.outboundGeneration === context.outboundGeneration
        && (state.identity?.runId || currentRunId) === context.runId
        && !state.cleaned
        && !state.abortController.signal.aborted
        && epochIsCurrent
        && (!state.closing || mayDeliverWhileClosing);
      let sent = false;
      if (live) {
        state.queue.observeTransportBufferedBytes(state.ws.bufferedAmount);
        if (!state.queue.transportBackpressured) {
          // The first copy can be received and cumulatively ACKed before an
          // asynchronously delayed duplicate is released. Retirement makes
          // that late copy stale, not a transport-integrity failure.
          if (token.sendAttempt
            && !state.queue.authorizePhysicalSend(token.sendAttempt)
            && state.queue.status().lastAckedReliableId >= token.sendAttempt.reliableId) {
            token.active = false;
            state.scheduledSends.delete(token);
            samplePressure(state);
            return false;
          }
          sent = sendWireImmediate(state, wire, token.sendAttempt, { completeAttempt: false });
          if (sent && token.sendAttempt) token.physicalCopies += 1;
        }
      }
      // A delayed release that finds a dead or backpressured socket ends this
      // attempt now. Zero accepted copies re-arm it for a later sweep; a second
      // callback from a duplicate decision is fenced by token.active.
      if (!sent || (token.deliveryCount !== null && token.delivered >= token.deliveryCount)) settle();
      return sent;
    };
    try {
      const outcome = scheduleOutboundFrame(wire, context, deliver);
      if (outcome && typeof outcome.then === "function") {
        Promise.resolve(outcome).catch(() => {});
        settle();
        terminate(state);
        return false;
      }
      if (outcome === false || outcome?.accepted === false) {
        settle();
        terminate(state);
        return false;
      }
      token.cancel = typeof outcome === "function" ? outcome
        : (typeof outcome?.cancel === "function" ? outcome.cancel : null);
      token.deliveryCount = outcome?.deliveryCount === undefined ? 1 : outcome.deliveryCount;
      if (!Number.isSafeInteger(token.deliveryCount)
        || token.deliveryCount < 0
        || token.deliveryCount > 2
        || token.delivered > token.deliveryCount) {
        settle();
        terminate(state);
        return false;
      }
      if (token.deliveryCount === 0 || token.delivered >= token.deliveryCount) settle();
      return true;
    } catch {
      settle();
      terminate(state);
      return false;
    }
  }

  function sendFrame(state, frame) {
    return sendWire(state, encodeWireFrame(frame, { direction: SERVER_TO_CLIENT }), frame);
  }

  function sendApplicationClose(state, code, reason, reconnectable, retryAfterMs, transportCode = code) {
    state.closing = true;
    state.closingSince ??= now();
    const closeFrame = { type: "close", code, reason, reconnectable };
    if (retryAfterMs !== undefined) closeFrame.retryAfterMs = retryAfterMs;
    sendFrame(state, closeFrame);
    if (state.ws.readyState === WebSocket.OPEN || state.ws.readyState === WebSocket.CONNECTING) {
      try {
        state.ws.close(transportCode, transportCode === 1013 ? "server overloaded" : reason);
      } catch {
        terminate(state);
      }
    }
  }

  function failConnection(state, error, { relatedType, fatal = true } = {}) {
    if (state.closing) return;
    const safe = publicError(error);
    const frame = { type: "error", code: safe.code, message: safe.message, fatal, retryable: safe.retryable };
    if (relatedType) frame.relatedType = relatedType;
    sendFrame(state, frame);
    if (fatal) {
      state.closing = true;
      sendApplicationClose(state, safe.closeCode, safe.code.slice(0, 123), safe.retryable);
    }
  }

  function cleanup(state) {
    if (state.cleaned) return;
    state.cleaned = true;
    state.abortController.abort();
    clearTimeout(state.helloTimer);
    if (state.helloPending) {
      state.helloPending = false;
      pendingHello = Math.max(0, pendingHello - 1);
    }
    connections.delete(state);
    if (state.bindingKey !== null && byBindingKey.get(state.bindingKey) === state) byBindingKey.delete(state.bindingKey);
    resetOutbound(state);
    detachPressure(state);
  }

  function terminate(state) {
    if (state.cleaned) return;
    state.closing = true;
    if (state.ws.readyState !== WebSocket.CLOSED) state.ws.terminate();
    cleanup(state);
  }

  function queueOutcome(state, outcome, rebaseWatermarks = null) {
    if (!outcome || outcome.action === "queued" || outcome.action === "coalesced" || outcome.action === "ignore") return;
    markQueuePolicy(state, outcome.action);
    if (outcome.action === "rebase") {
      const binding = state.binding;
      const runId = rebaseWatermarks?.runId || binding?.runId || currentRunId;
      const snapshotId = Math.max(1, Number(rebaseWatermarks?.snapshotId || binding?.snapshotId) || 1);
      const lastEventSeq = Math.max(0, Number(rebaseWatermarks?.lastEventSeq ?? binding?.lastEventSeq) || 0);
      resetOutbound(state);
      state.pendingEventSeqs?.clear();
      state.pendingEventBytes = 0;
      state.lastEventAckSeq = lastEventSeq;
      sendFrame(state, { type: "rebase", runId, reason: "server-recovery", snapshotId, lastEventSeq });
      return;
    }
    if (outcome.action === "disconnect") {
      state.closing = true;
      sendApplicationClose(state, 4008, "queue policy", true, 250, 1013);
    }
  }

  function flush(state) {
    if (state.flushing || state.closing || state.ws.readyState !== WebSocket.OPEN) return;
    state.flushing = true;
    try {
      const status = state.queue.observeTransportBufferedBytes(state.ws.bufferedAmount);
      const timestamp = now();
      if (status.backpressured) state.backpressuredSince ??= timestamp;
      else state.backpressuredSince = null;
      if (status.disconnectRequired) return queueOutcome(state, { action: "disconnect" });
      // Lease at most one queue entry per pass. A held reliable attempt must
      // not strand later entries in a pre-leased batch; later enqueue/sweep
      // passes can lease the next ready entry independently.
      const drained = state.queue.drain(scheduleOutboundFrame ? { maxMessages: 1 } : {});
      samplePressure(state);
      if (drained.action === "pause") return;
      for (const message of drained.messages) {
        if (message.lane === "state") {
          for (const frame of message.envelope.frames) {
            const wire = encodeWireFrame(frame, { direction: SERVER_TO_CLIENT });
            if (!sendWire(state, wire, frame)) break;
          }
        } else if (!sendWire(
          state,
          encodeWireFrame(message.envelope, { direction: SERVER_TO_CLIENT }),
          message.envelope,
          message.sendAttempt,
        )) {
          break;
        }
      }
    } catch (error) {
      failConnection(state, error);
    } finally {
      state.flushing = false;
      samplePressure(state);
    }
  }

  function enqueueReliableState(state, frame, { replayEvent = false } = {}) {
    if (state.closing) return { accepted: false, action: "disconnect", reason: "connection-closing" };
    try {
      if (replayEvent && frame?.type === "event") {
        if (frame.eventSeq <= state.lastEventAckSeq || state.pendingEventSeqs.has(frame.eventSeq)) {
          eventReplayStats.duplicatePendingEvents += 1;
          return { accepted: false, action: "ignore", reason: "event-already-pending" };
        }
        if (state.pendingEventSeqs.size >= MAX_PENDING_REPLAY_EVENTS) {
          return { accepted: false, action: "ignore", reason: "event-replay-window-full" };
        }
      }
      const nextId = state.queue.status().highestIssuedReliableId + 1;
      const retainedFrame = frame?.deliveryId === undefined ? { ...frame, deliveryId: nextId } : frame;
      encodeWireFrame(retainedFrame, { direction: SERVER_TO_CLIENT });
      const wireBytes = Buffer.byteLength(JSON.stringify(retainedFrame), "utf8");
      if (replayEvent && retainedFrame.type === "event") {
        const queueStatus = state.queue.status();
        if (
          state.pendingEventBytes + wireBytes > MAX_PENDING_REPLAY_BYTES
          || queueStatus.reliableMessages >= state.queue.limits.maxReliableMessages - ACTION_RELIABLE_MESSAGE_RESERVE
          || queueStatus.reliableBytes + wireBytes > state.queue.limits.maxReliableBytes - ACTION_RELIABLE_BYTE_RESERVE
        ) return { accepted: false, action: "ignore", reason: "event-replay-budget-full" };
      }
      const result = state.queue.enqueueConsequence(retainedFrame, { reliableId: retainedFrame.deliveryId });
      samplePressure(state);
      queueOutcome(state, result);
      if (result.accepted && replayEvent && retainedFrame.type === "event") {
        state.pendingEventSeqs.set(retainedFrame.eventSeq, result.byteLength);
        state.pendingEventBytes += result.byteLength;
        samplePressure(state);
        state.binding.highestIssuedEventSeq = Math.max(
          state.binding.highestIssuedEventSeq || 0,
          retainedFrame.eventSeq,
        );
        eventReplayStats.replayedEvents += 1;
      }
      flush(state);
      return result.accepted ? { ...result, frame: retainedFrame } : result;
    } catch (error) {
      const safe = publicError(error, "reliable-frame-invalid");
      failConnection(state, error);
      return { accepted: false, action: "reject", reason: safe.code };
    }
  }

  async function handleHello(state, frame) {
    if (state.bound) throw new WireProtocolError("duplicate-hello", "hello is only valid once", 4400);
    const expectedGeneration = state.generation;
    const result = await redeemHello(frame, callbackContext(state, "redeem-hello"));
    if (!stateIsLive(state, expectedGeneration)) return;
    if (!result || typeof result !== "object" || !result.binding || !result.welcome || !result.rebase) {
      throw Object.assign(new Error("invalid hello redemption"), { publicCode: "admission-rejected", closeCode: 4401 });
    }
    encodeWireFrame(result.welcome, { direction: SERVER_TO_CLIENT });
    encodeWireFrame(result.rebase, { direction: SERVER_TO_CLIENT });
    const identity = Object.freeze({
      runId: result.welcome.runId,
      membershipId: result.welcome.membershipId,
      playerId: result.welcome.playerId,
      connectionId: result.welcome.connectionId,
      connectionEpoch: result.welcome.connectionEpoch,
    });
    const bindingKey = stableBindingKey(result.bindingKey || identity);
    if (!bindingKey) throw Object.assign(new Error("stable binding identity missing"), { publicCode: "admission-rejected", closeCode: 4401 });
    if (!Array.isArray(result.baselineFrames)
      || result.baselineFrames.length !== 2
      || result.baselineFrames[0]?.type !== "publicState"
      || result.baselineFrames[1]?.type !== "ownerState") {
      throw Object.assign(new Error("invalid hello baseline"), { publicCode: "admission-rejected", closeCode: 4401 });
    }
    const [baselinePublicFrame, baselineOwnerFrame] = result.baselineFrames;
    encodeWireFrame(baselinePublicFrame, { direction: SERVER_TO_CLIENT });
    encodeWireFrame(baselineOwnerFrame, { direction: SERVER_TO_CLIENT });
    assertOwnerProjection(baselineOwnerFrame, baselinePublicFrame, identity);
    state.binding = result.binding;
    state.bindingKey = bindingKey;
    state.identity = identity;
    if (typeof state.binding === "object" && state.binding !== null) bindingKeys.set(state.binding, bindingKey);
    state.bound = true;
    state.pendingEventSeqs = new Map();
    state.pendingEventBytes = 0;
    state.lastEventAckSeq = Math.max(0, Number(result.binding.requestedEventSeq) || 0);
    if (!(await isBindingCurrent(state, "private-welcome"))) {
      if (!stateIsLive(state, expectedGeneration)) return;
      throw Object.assign(new Error("redeemed binding is no longer current"), { publicCode: "connection-fenced", closeCode: 4003 });
    }
    if (!stateIsLive(state, expectedGeneration)) return;
    if (state.helloPending) {
      state.helloPending = false;
      pendingHello = Math.max(0, pendingHello - 1);
    }
    clearTimeout(state.helloTimer);
    state.heartbeatIntervalMs = result.welcome.heartbeatIntervalMs;
    state.nextHeartbeatAt = now() + state.heartbeatIntervalMs;
    const prior = byBindingKey.get(bindingKey);
    if (prior && prior !== state) {
      if (prior.identity.connectionEpoch >= identity.connectionEpoch) {
        state.closing = true;
        sendApplicationClose(state, 4003, "connection superseded", true);
        return;
      }
      resetOutbound(prior);
      prior.closing = true;
      sendApplicationClose(prior, 4003, "connection replaced", true);
    }
    if (!(await isBindingCurrent(state, "private-welcome-send"))) {
      if (!stateIsLive(state, expectedGeneration)) return;
      throw Object.assign(new Error("redeemed binding is no longer current"), { publicCode: "connection-fenced", closeCode: 4003 });
    }
    if (!stateIsLive(state, expectedGeneration)) return;
    byBindingKey.set(bindingKey, state);
    currentRunId = result.welcome.runId;
    resetOutbound(state);
    sendFrame(state, result.welcome);
    sendFrame(state, result.rebase);
    sendFrame(state, baselinePublicFrame);
    sendFrame(state, baselineOwnerFrame);
    if (Array.isArray(result.reliableEvents)) {
      let enqueued = 0;
      for (const event of result.reliableEvents) {
        if (enqueued >= MAX_REPLAY_EVENTS_PER_PASS) break;
        const outcome = enqueueReliableState(state, event, { replayEvent: true });
        if (outcome.accepted) enqueued += 1;
      }
    }
  }

  async function handleBoundFrame(state, frame) {
    const expectedGeneration = state.generation;
    if (!(await isBindingCurrent(state, `inbound:${frame.type}`))) {
      if (!stateIsLive(state, expectedGeneration)) return;
      state.closing = true;
      return sendApplicationClose(state, 4003, "connection fenced", true);
    }
    if (frame.type === "input") {
      if (!consumeRateBucket(state.inputBucket, now())) {
        state.closing = true;
        return sendApplicationClose(state, 4008, "input rate exceeded", true, 250, 1013);
      }
      const reply = await onInput(state.binding, frame, callbackContext(state, "input"));
      if (!stateIsLive(state, expectedGeneration)) return;
      if (reply && await isBindingCurrent(state, "private-input-ack")) sendFrame(state, reply.frame || reply);
      else if (reply && stateIsLive(state, expectedGeneration)) {
        state.closing = true;
        sendApplicationClose(state, 4003, "connection fenced", true);
      }
      return;
    }
    if (frame.type === "action") {
      if (!consumeRateBucket(state.actionBucket, now())) {
        state.closing = true;
        return sendApplicationClose(state, 4008, "action rate exceeded", true, 250, 1013);
      }
      const reply = await onAction(state.binding, frame, callbackContext(state, "action"));
      if (!stateIsLive(state, expectedGeneration)) return;
      if (reply && await isBindingCurrent(state, "private-action-ack")) enqueueReliableState(state, reply.frame || reply);
      else if (reply && stateIsLive(state, expectedGeneration)) {
        state.closing = true;
        sendApplicationClose(state, 4003, "connection fenced", true);
      }
      return;
    }
    if (frame.type === "pong") {
      if (frame.heartbeatId !== state.pendingHeartbeat?.id) {
        throw new WireProtocolError("invalid-pong", "pong does not match the active heartbeat", 4400);
      }
      state.pendingHeartbeat = null;
      state.nextHeartbeatAt = now() + state.heartbeatIntervalMs;
      await onPong(state.binding, frame, callbackContext(state, "pong"));
      if (!stateIsLive(state, expectedGeneration)) return;
      return;
    }
    if (frame.type === "ack") {
      if (frame.ackKind === "delivery") queueOutcome(state, state.queue.acknowledge(frame.deliveryId));
      samplePressure(state);
      if (!stateIsLive(state, expectedGeneration)) return;
      await onAck(state.binding, frame, callbackContext(state, "ack"));
      if (!stateIsLive(state, expectedGeneration)) return;
      if (frame.ackKind === "event" || frame.ackKind === "baseline") {
        const eventSeq = frame.eventSeq;
        if (eventSeq > state.lastEventAckSeq) {
          state.lastEventAckSeq = eventSeq;
          eventReplayStats.eventAcks += 1;
          for (const [pendingSeq, bytes] of state.pendingEventSeqs) {
            if (pendingSeq <= eventSeq) {
              state.pendingEventSeqs.delete(pendingSeq);
              state.pendingEventBytes = Math.max(0, state.pendingEventBytes - bytes);
            }
          }
          samplePressure(state);
        }
      }
      flush(state);
      return;
    }
    throw new WireProtocolError("unexpected-frame", `unexpected ${frame.type} frame`, 4400);
  }

  async function processInboundFrame(state, raw, isBinary) {
    if (!stateIsLive(state)) return;
    if (isBinary) throw new WireProtocolError("binary-frame", "binary application frames are not supported", 4403);
    const frame = parseWireFrame(raw, { direction: CLIENT_TO_SERVER });
    if (!state.bound) {
      if (frame.type !== "hello") throw new WireProtocolError("hello-required", "first frame must be hello", 4401);
      await handleHello(state, frame);
    } else {
      await handleBoundFrame(state, frame);
    }
  }

  function connection(ws) {
    const timestamp = now();
    const state = createConnectionState({
      ws,
      queue: createMultiplayerSendQueue(queueOptions),
      generation,
      timestamp,
      heartbeatIntervalMs,
    });
    state.schedulerConnectionId = ++schedulerConnectionCounter;
    state.outboundGeneration = 0;
    state.scheduledSends = new Set();
    pendingHello += 1;
    connections.add(state);
    samplePressure(state);
    state.helloTimer = setTimeout(() => {
      if (!state.bound && !state.closing) {
        state.closing = true;
        sendApplicationClose(state, 4401, "hello timeout", true);
      }
    }, helloTimeoutMs);
    state.helloTimer.unref?.();
    ws.on("message", (raw, isBinary) => {
      enqueueBoundedInbound({
        state,
        raw,
        isBinary,
        maxPendingInbound,
        maxPendingInboundBytes,
        maxPendingInboundBytesTotal,
        getPendingInboundBytesTotal: () => pendingInboundBytesTotal,
        onBytes: (delta) => {
          pendingInboundBytesTotal = Math.max(0, pendingInboundBytesTotal + delta);
          samplePressure(state);
        },
        onDepth: (depth) => { maxObservedPendingInbound = Math.max(maxObservedPendingInbound, depth); },
        onByteDepth: (_socketBytes, totalBytes) => {
          maxObservedPendingInboundBytes = Math.max(maxObservedPendingInboundBytes, totalBytes);
        },
        onFrame: (frameRaw, binary) => processInboundFrame(state, frameRaw, binary),
        onError: (error) => failConnection(state, error),
        onOverflow: () => {
          state.closing = true;
          sendApplicationClose(state, 4008, "inbound queue full", true, 250, 1013);
        },
      });
    });
    ws.on("close", () => cleanup(state));
    ws.on("error", () => terminate(state));
  }

  async function projectNow(context = {}) {
    if (closed) return { projected: 0, skipped: connections.size };
    const candidates = [...connections].filter((state) => state.bound && !state.closing && !state.cleaned);
    if (candidates.length === 0) return { projected: 0, skipped: connections.size };
    const expectedGeneration = generation;
    let publicFrame;
    try {
      publicFrame = await buildPublicState(context, callbackContext(null, "public-project"));
      if (closed || generation !== expectedGeneration || lifecycle.signal.aborted) {
        return { projected: 0, skipped: connections.size, aborted: true };
      }
      encodeWireFrame(publicFrame, { direction: SERVER_TO_CLIENT });
    } catch (error) {
      const safe = publicError(error, "public-projection-failed");
      for (const state of connections) {
        if (state.bound && stateIsLive(state)) failConnection(state, error, { fatal: false });
      }
      return { projected: 0, skipped: connections.size, error: safe.code };
    }
    let projected = 0;
    let skipped = Math.max(0, connections.size - candidates.length);
    for (const state of candidates) {
      if (!(await isBindingCurrent(state, "private-project"))) {
        skipped += 1;
        if (!stateIsLive(state)) continue;
        state.closing = true;
        sendApplicationClose(state, 4003, "connection fenced", true);
        continue;
      }
      try {
        const ownerFrame = await buildOwnerState(
          state.binding,
          publicFrame,
          context,
          callbackContext(state, "owner-project"),
        );
        if (!stateIsLive(state)) {
          skipped += 1;
          continue;
        }
        encodeWireFrame(ownerFrame, { direction: SERVER_TO_CLIENT });
        assertOwnerProjection(ownerFrame, publicFrame, state.identity);
        const recovery = await buildEventRecovery(
          state.binding,
          publicFrame,
          ownerFrame,
          Object.freeze({
            maxEvents: Math.min(
              MAX_REPLAY_EVENTS_PER_PASS,
              Math.max(0, MAX_PENDING_REPLAY_EVENTS - state.pendingEventSeqs.size),
            ),
            maxBytes: Math.max(0, MAX_PENDING_REPLAY_BYTES - state.pendingEventBytes),
            pendingEventSeqs: Object.freeze([...state.pendingEventSeqs.keys()]),
          }),
          callbackContext(state, "event-recovery"),
        );
        if (!(await isBindingCurrent(state, "private-project-send"))) {
          if (!stateIsLive(state)) {
            skipped += 1;
            continue;
          }
          state.closing = true;
          sendApplicationClose(state, 4003, "connection fenced", true);
          skipped += 1;
          continue;
        }
        if (recovery?.rebase) {
          encodeWireFrame(recovery.rebase, { direction: SERVER_TO_CLIENT });
          resetOutbound(state);
          state.pendingEventSeqs.clear();
          state.pendingEventBytes = 0;
          state.lastEventAckSeq = recovery.rebase.lastEventSeq;
          eventReplayStats.forcedRebases += 1;
          sendFrame(state, recovery.rebase);
          sendFrame(state, publicFrame);
          sendFrame(state, ownerFrame);
          projected += 1;
          continue;
        }
        let recoveryAccepted = true;
        for (const event of recovery?.events || []) {
          const eventOutcome = enqueueReliableState(state, event, { replayEvent: true });
          if (!eventOutcome.accepted) {
            recoveryAccepted = false;
            break;
          }
          state.binding.eventScanSeq = Math.max(state.binding.eventScanSeq || 0, event.eventSeq);
        }
        if (recoveryAccepted && Number.isSafeInteger(recovery?.scanThrough)) {
          state.binding.eventScanSeq = Math.max(state.binding.eventScanSeq || 0, recovery.scanThrough);
        }
        const outcome = state.queue.enqueueState(publicFrame.snapshotId, {
          kind: "state-pair",
          frames: [publicFrame, ownerFrame],
        });
        samplePressure(state);
        queueOutcome(state, outcome, publicFrame);
        flush(state);
        if (outcome.accepted) projected += 1;
        else skipped += 1;
      } catch (error) {
        skipped += 1;
        failConnection(state, error, { fatal: error?.fatal === true });
      }
    }
    return { projected, skipped, snapshotId: publicFrame.snapshotId };
  }

  function bindingKeyFor(binding) {
    return typeof binding === "object" && binding !== null
      ? bindingKeys.get(binding) || stableBindingKey(binding)
      : stableBindingKey(binding);
  }

  async function enqueueReliable(binding, frame) {
    const key = bindingKeyFor(binding);
    const state = key ? byBindingKey.get(key) : null;
    if (!state) return { accepted: false, action: "ignore", reason: "binding-not-connected" };
    if (!(await isBindingCurrent(state, "private-reliable-send"))) {
      if (!stateIsLive(state)) return { accepted: false, action: "ignore", reason: "connection-not-live" };
      state.closing = true;
      sendApplicationClose(state, 4003, "connection fenced", true);
      return { accepted: false, action: "disconnect", reason: "connection-fenced" };
    }
    return enqueueReliableState(state, frame);
  }

  async function sendRebase(binding, frame) {
    const key = bindingKeyFor(binding);
    const state = key ? byBindingKey.get(key) : null;
    if (!state) return { accepted: false, action: "ignore", reason: "binding-not-connected" };
    try {
      encodeWireFrame(frame, { direction: SERVER_TO_CLIENT });
    } catch (error) {
      return { accepted: false, action: "reject", reason: publicError(error, "rebase-frame-invalid").code };
    }
    if (!(await isBindingCurrent(state, "private-rebase-send-final"))) {
      if (!stateIsLive(state)) return { accepted: false, action: "ignore", reason: "connection-not-live" };
      state.closing = true;
      sendApplicationClose(state, 4003, "connection fenced", true);
      return { accepted: false, action: "disconnect", reason: "connection-fenced" };
    }
    resetOutbound(state);
    state.pendingEventSeqs.clear();
    state.pendingEventBytes = 0;
    state.lastEventAckSeq = Math.max(state.lastEventAckSeq, Number(frame.lastEventSeq) || 0);
    eventReplayStats.forcedRebases += 1;
    if (!sendFrame(state, frame)) return { accepted: false, action: "disconnect", reason: "send-failed" };
    return { accepted: true, action: "sent" };
  }

  async function broadcastReliable(frameFactory) {
    const results = [];
    for (const state of connections) {
      if (!state.bound || state.closing) continue;
      if (!(await isBindingCurrent(state, "private-reliable-send"))) {
        if (!stateIsLive(state)) continue;
        state.closing = true;
        sendApplicationClose(state, 4003, "connection fenced", true);
        results.push({ accepted: false, action: "disconnect", reason: "connection-fenced" });
        continue;
      }
      try {
        const produced = typeof frameFactory === "function"
          ? await frameFactory(state.binding, callbackContext(state, "broadcast-reliable"))
          : frameFactory;
        if (!stateIsLive(state)) {
          results.push({ accepted: false, action: "ignore", reason: "connection-not-live" });
        } else if (produced && !(await isBindingCurrent(state, "private-reliable-send-final"))) {
          if (!stateIsLive(state)) {
            results.push({ accepted: false, action: "ignore", reason: "connection-not-live" });
          } else {
            state.closing = true;
            sendApplicationClose(state, 4003, "connection fenced", true);
            results.push({ accepted: false, action: "disconnect", reason: "connection-fenced" });
          }
        } else if (produced?.rebase) {
          encodeWireFrame(produced.rebase, { direction: SERVER_TO_CLIENT });
          resetOutbound(state);
          state.pendingEventSeqs.clear();
          state.pendingEventBytes = 0;
          state.lastEventAckSeq = Math.max(0, Number(produced.rebase.lastEventSeq) || 0);
          eventReplayStats.forcedRebases += 1;
          results.push(sendFrame(state, produced.rebase)
            ? { accepted: true, action: "rebase" }
            : { accepted: false, action: "disconnect", reason: "send-failed" });
        } else if (produced) {
          const replayFrames = Array.isArray(produced) ? produced : [produced];
          let accepted = 0;
          let ignored = 0;
          for (const frame of replayFrames) {
            if (accepted >= MAX_REPLAY_EVENTS_PER_PASS) break;
            const outcome = enqueueReliableState(state, frame, { replayEvent: frame?.type === "event" });
            if (outcome.accepted) accepted += 1;
            else ignored += 1;
          }
          results.push({ accepted: accepted > 0, action: accepted > 0 ? "queued" : "ignore", acceptedFrames: accepted, ignoredFrames: ignored });
        }
      } catch (error) {
        const safe = publicError(error, "reliable-factory-failed");
        failConnection(state, error, { fatal: false });
        results.push({ accepted: false, action: "reject", reason: safe.code });
      }
    }
    return results;
  }

  function rotateRun(nextRunId) {
    currentRunId = nextRunId || null;
    let fenced = 0;
    for (const state of [...connections]) {
      resetOutbound(state);
      state.pendingEventSeqs?.clear();
      state.pendingEventBytes = 0;
      if (!state.closing) {
        fenced += 1;
        state.closing = true;
        sendApplicationClose(state, 4003, "run changed", true);
      }
    }
    return { runId: currentRunId, fenced };
  }

  function heartbeatSweep() {
    if (closed) return;
    const timestamp = now();
    for (const state of [...connections]) {
      if (state.closing) {
        if (state.closingSince !== null && timestamp - state.closingSince >= closeGraceMs) terminate(state);
        continue;
      }
      if (!state.bound) continue;
      const queueStatus = state.queue.observeTransportBufferedBytes(state.ws.bufferedAmount);
      if (queueStatus.backpressured) state.backpressuredSince ??= timestamp;
      else state.backpressuredSince = null;
      if (state.backpressuredSince !== null && timestamp - state.backpressuredSince >= backpressureTimeoutMs) {
        state.closing = true;
        sendApplicationClose(state, 4008, "backpressure timeout", true, 250, 1013);
        continue;
      }
      if (state.pendingHeartbeat && timestamp - state.pendingHeartbeat.sentAt >= state.heartbeatIntervalMs * 2) {
        state.closing = true;
        sendApplicationClose(state, 4001, "heartbeat timeout", true, 250);
        continue;
      }
      if (!state.pendingHeartbeat && timestamp >= state.nextHeartbeatAt) {
        const id = `hb-${++heartbeatCounter}-${crypto.randomBytes(6).toString("base64url")}`;
        state.pendingHeartbeat = { id, sentAt: timestamp };
        state.nextHeartbeatAt = timestamp + state.heartbeatIntervalMs;
        sendFrame(state, { type: "heartbeat", heartbeatId: id, serverTimeMs: timestamp });
      }
      flush(state);
    }
  }

  wss.on("connection", connection);
  wss.on("error", () => {
    for (const state of [...connections]) terminate(state);
  });
  if (upgradeRouter) upgradeRouter.attach(handleUpgrade);
  else server.on("upgrade", handleUpgrade);
  const detachUpgrade = () => {
    if (upgradeRouter) upgradeRouter.detach(handleUpgrade);
    else server.removeListener("upgrade", handleUpgrade);
  };
  const heartbeatTimer = setInterval(heartbeatSweep, sweepIntervalMs);
  heartbeatTimer.unref?.();

  function diagnostics() {
    const summary = summarizeConnections(connections);
    let pendingEventFrames = 0;
    let pendingEventBytes = 0;
    let pendingScheduledSends = 0;
    for (const state of connections) pendingEventFrames += state.pendingEventSeqs?.size || 0;
    for (const state of connections) pendingEventBytes += state.pendingEventBytes || 0;
    for (const state of connections) pendingScheduledSends += state.scheduledSends?.size || 0;
    return Object.freeze({
      path,
      closed,
      currentRunId,
      connections: connections.size,
      ...summary,
      pendingInboundBytes: pendingInboundBytesTotal,
      pendingScheduledSends,
      pendingHello,
      maxObservedPendingInbound,
      maxObservedPendingInboundBytes,
      maxConnections,
      maxPendingHello,
      maxPendingInbound,
      maxPendingInboundBytes,
      maxPendingInboundBytesTotal,
      backpressureTimeoutMs,
      closeGraceMs,
      rejectedConnections,
      rejectedPendingHello,
      sweepIntervalMs,
      helloTimers: pendingHello,
      livenessTimers: closed ? 0 : 1,
      pressure: pressureDiagnostics(),
      eventReplay: Object.freeze({
        maxPendingPerBinding: MAX_PENDING_REPLAY_EVENTS,
        maxEnqueuePerPass: MAX_REPLAY_EVENTS_PER_PASS,
        maxPendingBytesPerBinding: MAX_PENDING_REPLAY_BYTES,
        actionMessageReserve: ACTION_RELIABLE_MESSAGE_RESERVE,
        actionByteReserve: ACTION_RELIABLE_BYTE_RESERVE,
        pendingEventFrames,
        pendingEventBytes,
        ...eventReplayStats,
      }),
    });
  }

  async function shutdown() {
    if (closed) return diagnostics();
    closed = true;
    generation += 1;
    lifecycle.abort();
    clearInterval(heartbeatTimer);
    detachUpgrade();
    for (const state of [...connections]) terminate(state);
    await new Promise((resolve) => {
      let settled = false;
      const finish = () => {
        if (settled) return;
        settled = true;
        clearTimeout(timeout);
        resolve();
      };
      const timeout = setTimeout(finish, shutdownTimeoutMs);
      timeout.unref?.();
      wss.close(finish);
    });
    return diagnostics();
  }

  return Object.freeze({
    project: projectNow,
    projectNow,
    enqueueReliable,
    rebase: sendRebase,
    sendRebase,
    broadcastReliable,
    bindingKeyFor,
    rotateRun,
    diagnostics,
    shutdown,
  });
}

module.exports = {
  DEFAULTS,
  createSimWebSocketAdapter,
};
