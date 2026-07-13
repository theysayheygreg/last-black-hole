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
const { DEFAULTS: SEND_QUEUE_DEFAULTS, createMultiplayerSendQueue } = require("./multiplayer-send-queue.cjs");
const {
  createReplicationAccounting,
  summarizeWindow: summarizeReplicationWindow,
} = require("./replication-accounting.cjs");
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
const STATE_PAIR_RECOVERY_COOLDOWN_MS = 1000;

function createSimWebSocketAdapter(options = {}) {
  const config = normalizeAdapterOptions(options);
  const scheduleOutboundFrame = typeof options.scheduleOutboundFrame === "function"
    ? options.scheduleOutboundFrame
    : null;
  const buildEventRecovery = typeof options.buildEventRecovery === "function"
    ? options.buildEventRecovery
    : async () => null;
  const projectPublicStateForBinding = typeof options.projectPublicStateForBinding === "function"
    ? options.projectPublicStateForBinding
    : (_binding, frame) => frame;
  const verifyManifestAck = typeof options.verifyManifestAck === "function"
    ? options.verifyManifestAck
    : async () => true;
  const onBindingClosed = typeof options.onBindingClosed === "function" ? options.onBindingClosed : null;
  const onBindingOpened = typeof options.onBindingOpened === "function" ? options.onBindingOpened : null;
  const {
    server, upgradeRouter, redeemHello, revalidateBinding, onInput, onAction, buildPublicState, buildOwnerState,
    onPong, onAck, onStatePairRecovery, onPressureTransition, buildStatePair, now, path, helloTimeoutMs, heartbeatIntervalMs, backpressureTimeoutMs, shutdownTimeoutMs, closeGraceMs,
    maxConnections, maxPendingHello, maxPendingInbound, maxPendingInboundBytes, maxPendingInboundBytesTotal,
    sweepIntervalMs, queueOptions,
  } = config;
  const connections = new Set();
  const replicationAccounting = config.replicationAccounting
    ? (config.replicationAccountingFactory || createReplicationAccounting)({ now })
    : null;
  let replicationAccountingEpoch = 1;
  let replicationPendingSendCallbacks = 0;
  const byBindingKey = new Map();
  const bindingKeys = new WeakMap();
  const wss = new WebSocketServer({ noServer: true, perMessageDeflate: false, maxPayload: LIMITS.maxFrameBytes });
  const lifecycle = new AbortController();
  let closed = false;
  let generation = 1;
  let currentRunId = config.runId;
  let heartbeatCounter = 0;
  let schedulerConnectionCounter = 0;
  let nextSweepScheduledAt = now() + sweepIntervalMs;
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
  const statePairStats = { accepted: 0, rejected: 0, lastRejectReason: null };
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
    applicationQueueMessages: queueOptions?.maxMessages ?? SEND_QUEUE_DEFAULTS.maxMessages,
    reliableQueueBytes: null,
    reliableQueueMessages: queueOptions?.maxReliableMessages ?? SEND_QUEUE_DEFAULTS.maxReliableMessages,
    replayEventBytes: MAX_PENDING_REPLAY_BYTES,
    replayEventMessages: MAX_PENDING_REPLAY_EVENTS,
    inboundPendingBytes: maxPendingInboundBytes,
    inboundPendingMessages: maxPendingInbound,
    pendingSendMessages: queueOptions?.maxMessages ?? SEND_QUEUE_DEFAULTS.maxMessages,
    scheduledSendMessages: queueOptions?.maxMessages ?? SEND_QUEUE_DEFAULTS.maxMessages,
    connectionsCrossedTransportHighWater: 0,
    transportHighWaterCrossings: 0,
    connectionsHitQueuePolicy: 0,
    queuePolicyLimitCrossings: 0,
    queuePolicyEvents: 0,
    queuePolicyRebases: 0,
    queuePolicyDisconnects: 0,
    queuePolicyReasons: {},
  };
  const pressureObserver = {
    enabled: onPressureTransition !== null,
    emitted: 0,
    failures: 0,
    falseReturns: 0,
    throws: 0,
    asyncReturns: 0,
  };
  const detailedMetricNames = onPressureTransition ? Object.freeze([
    "wsBufferedBytes", "queuedBytes", "queuedMessages", "reliableBytes", "reliableMessages",
    "replayEventBytes", "replayEventCount", "pendingInboundBytes", "pendingInboundCount",
    "pendingSendBytes", "pendingSendCount", "scheduledSendBytes", "scheduledSendCount",
  ]) : null;

  function frozenDetailedSnapshot(state) {
    const current = Object.freeze({ ...(state.pressureDetailCurrent || {}) });
    const maximum = Object.freeze({ ...(state.pressureDetailMaximum || current) });
    return Object.freeze({
      bound: Boolean(state.bound),
      closing: Boolean(state.closing),
      connectionEpoch: Number.isSafeInteger(state.identity?.connectionEpoch) ? state.identity.connectionEpoch : null,
      current,
      maximum,
      transportHigh: Boolean(state.pressureTransportHigh),
      firstHighAt: state.pressureFirstHighAt ?? null,
      backpressuredSince: state.backpressuredSince ?? null,
      latestPolicy: state.pressureLatestPolicy ? Object.freeze({ ...state.pressureLatestPolicy }) : null,
      counts: Object.freeze({
        ...(state.pressureCounts || {}),
        stateFramesWsSendAccepted: Object.freeze({
          ...(state.pressureCounts?.stateFramesWsSendAccepted || {}),
        }),
      }),
    });
  }

  function emitPressureTransition(state, type, detail = {}) {
    if (!onPressureTransition || !state) return;
    const event = Object.freeze({
      type,
      timestamp: now(),
      schedulerConnectionId: state.schedulerConnectionId,
      connectionEpoch: Number.isSafeInteger(state.identity?.connectionEpoch) ? state.identity.connectionEpoch : null,
      ...detail,
      pressure: frozenDetailedSnapshot(state),
    });
    pressureObserver.emitted += 1;
    try {
      const outcome = onPressureTransition(event);
      if (outcome === false) {
        pressureObserver.failures += 1;
        pressureObserver.falseReturns += 1;
      } else if (outcome && typeof outcome.then === "function") {
        pressureObserver.failures += 1;
        pressureObserver.asyncReturns += 1;
        Promise.resolve(outcome).catch(() => {});
      }
    } catch {
      pressureObserver.failures += 1;
      pressureObserver.throws += 1;
    }
  }

  function readWsBufferedBytes(state) {
    let wsBufferedBytes = 0;
    try { wsBufferedBytes = Math.max(0, Number(state.ws.bufferedAmount) || 0); } catch {}
    return wsBufferedBytes;
  }

  function capturePressureSample(state, supplied = {}) {
    const wsBufferedBytes = supplied.wsBufferedBytes ?? readWsBufferedBytes(state);
    const status = supplied.status || state.queue.observeTransportBufferedBytes(wsBufferedBytes);
    const current = Object.freeze({
      wsBufferedBytes,
      queuedBytes: Math.max(0, Number(status.queuedBytes) || 0),
      reliableBytes: Math.max(0, Number(status.reliableBytes) || 0),
      replayEventBytes: Math.max(0, Number(state.pendingEventBytes) || 0),
      pendingInboundBytes: Math.max(0, Number(state.pendingInboundBytes) || 0),
      pendingSends: Math.max(0, Number(state.pendingSends) || 0),
      scheduledSends: Math.max(0, Number(state.scheduledSends?.size) || 0),
    });
    const detailed = !onPressureTransition ? null : Object.freeze({
      wsBufferedBytes,
      queuedBytes: current.queuedBytes,
      queuedMessages: Math.max(0, Number(status.queuedMessages) || 0),
      reliableBytes: current.reliableBytes,
      reliableMessages: Math.max(0, Number(status.reliableMessages) || 0),
      replayEventBytes: current.replayEventBytes,
      replayEventCount: Math.max(0, Number(state.pendingEventSeqs?.size) || 0),
      pendingInboundBytes: current.pendingInboundBytes,
      pendingInboundCount: Math.max(0, Number(state.pendingInbound) || 0),
      pendingSendBytes: Math.max(0, Number(state.pendingSendBytes) || 0),
      pendingSendCount: current.pendingSends,
      scheduledSendBytes: Math.max(0, Number(state.scheduledSendBytes) || 0),
      scheduledSendCount: current.scheduledSends,
    });
    return Object.freeze({ status, current, detailed });
  }

  function samplePressure(state, supplied = null, { emitTransitions = true } = {}) {
    if (!state?.queue || !state?.ws || state.cleaned) return;
    const sample = supplied || capturePressureSample(state);
    const previous = state.pressureSnapshot || Object.fromEntries(pressureMetricNames.map((name) => [name, 0]));
    const { status, current, detailed } = sample;
    state.pressureSnapshot = current;
    if (onPressureTransition) {
      state.pressureDetailCurrent = detailed;
      for (const name of detailedMetricNames) {
        state.pressureDetailMaximum[name] = Math.max(state.pressureDetailMaximum[name], detailed[name]);
      }
    }
    for (const name of pressureMetricNames) {
      pressureTotals[name] = Math.max(0, pressureTotals[name] + current[name] - previous[name]);
      pressureMaxima[name].total = Math.max(pressureMaxima[name].total, pressureTotals[name]);
      pressureMaxima[name].worstConnection = Math.max(pressureMaxima[name].worstConnection, current[name]);
    }
    const threshold = state.queue.limits.transportHighWaterBytes;
    pressurePolicy.transportHighWaterBytes ??= threshold;
    pressurePolicy.applicationQueueBytes ??= state.queue.limits.maxBytes;
    pressurePolicy.reliableQueueBytes ??= state.queue.limits.maxReliableBytes;
    const crossed = state.pressureTransportHigh
      ? current.wsBufferedBytes > state.queue.limits.transportLowWaterBytes
      : current.wsBufferedBytes >= threshold;
    if (crossed) state.backpressuredSince ??= now();
    else if (!status.backpressured) state.backpressuredSince = null;
    if (crossed && !state.pressureTransportHigh) {
      pressurePolicy.transportHighWaterCrossings += 1;
      if (!state.pressureEverTransportHigh) {
        state.pressureEverTransportHigh = true;
        pressurePolicy.connectionsCrossedTransportHighWater += 1;
      }
      state.pressureTransportHigh = true;
      if (onPressureTransition) {
        state.pressureFirstHighAt ??= now();
        state.pressureCounts.highWaterCrossings += 1;
      }
      if (emitTransitions) {
        emitPressureTransition(state, "transport-high-enter", {
          bufferedBytes: current.wsBufferedBytes,
          highWaterBytes: threshold,
        });
      }
    } else if (!crossed && state.pressureTransportHigh) {
      state.pressureTransportHigh = false;
      if (emitTransitions) {
        emitPressureTransition(state, "transport-low-exit", {
          bufferedBytes: current.wsBufferedBytes,
          lowWaterBytes: state.queue.limits.transportLowWaterBytes,
        });
      }
    }
    state.pressureTransportHigh = crossed;
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
    for (const name of pressureMetricNames) {
      pressureTotals[name] = Math.max(0, pressureTotals[name] - (state.pressureSnapshot?.[name] || 0));
    }
    state.pressureSnapshot = Object.fromEntries(pressureMetricNames.map((name) => [name, 0]));
    state.pressureTransportHigh = false;
    state.pressureQueueAtLimit = false;
  }

  function markQueuePolicy(state, action, reason) {
    if (action !== "rebase" && action !== "disconnect") return;
    const normalizedReason = typeof reason === "string" && /^[a-z0-9][a-z0-9._-]{0,63}$/i.test(reason)
      ? reason
      : "unspecified";
    pressurePolicy.queuePolicyEvents += 1;
    if (action === "rebase") pressurePolicy.queuePolicyRebases += 1;
    else pressurePolicy.queuePolicyDisconnects += 1;
    const reasonKey = `${action}:${normalizedReason}`;
    pressurePolicy.queuePolicyReasons[reasonKey] = (pressurePolicy.queuePolicyReasons[reasonKey] || 0) + 1;
    if (!state.pressureEverQueuePolicy) {
      state.pressureEverQueuePolicy = true;
      pressurePolicy.connectionsHitQueuePolicy += 1;
    }
    if (onPressureTransition) {
      state.pressureLatestPolicy = Object.freeze({ action, reason: normalizedReason, timestamp: now() });
      if (action === "rebase") state.pressureCounts.rebases += 1;
      else state.pressureCounts.disconnects += 1;
    }
    samplePressure(state);
    emitPressureTransition(state, "queue-policy", { action, reason: normalizedReason });
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
      policy: Object.freeze({ ...pressurePolicy, queuePolicyReasons: Object.freeze({ ...pressurePolicy.queuePolicyReasons }) }),
      observer: Object.freeze({ ...pressureObserver }),
      ...(onPressureTransition ? {
        connections: Object.freeze(Object.fromEntries([...connections]
          .slice(0, maxConnections)
          .map((state) => [state.schedulerConnectionId, frozenDetailedSnapshot(state)]))),
      } : {}),
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

  function resetOutbound(state, { cause = "operational" } = {}) {
    samplePressure(state);
    for (const token of [...(state.scheduledSends || [])]) {
      token.active = false;
      try { token.cancel?.(); } catch {}
    }
    state.scheduledSends?.clear();
    if (onPressureTransition) state.scheduledSendBytes = 0;
    state.outboundGeneration = (state.outboundGeneration || 0) + 1;
    const before = state.queue.status();
    if (replicationAccounting && state.replicationStateFrames) {
      for (const queued of state.replicationStateFrames.values()) {
        if (!queued.sendInvoked) replicationAccounting.outbound(state, queued.frame, "policyDropped", queued.bytes);
      }
      state.replicationStateFrames.clear();
      state.replicationQueuedStateFrames = null;
    }
    if (replicationAccounting && state.replicationReliableFrames) {
      for (const retained of state.replicationReliableFrames.values()) {
        if (!retained.transportAccepted && !retained.sendInvoked) {
          replicationAccounting.outbound(state, retained.frame, "policyDropped", retained.bytes);
        }
      }
      state.replicationReliableFrames.clear();
    }
    const result = state.queue.reset();
    if (onPressureTransition && cause === "cleanup") {
      state.pressureCounts.reliableResetOnCleanup += before.reliableMessages;
    }
    samplePressure(state);
    return result;
  }

  function recordSendTerminal(
    state, frame, metric, wire, timestamp = now(), sendAttempt = null, { mutateTracking = true } = {},
  ) {
    if (!replicationAccounting) return;
    replicationAccounting.outbound(state, frame, metric, Buffer.byteLength(wire, "utf8"), { timestamp });
    if (mutateTracking && (frame?.type === "publicState" || frame?.type === "ownerState" || frame?.type === "statePair")) {
      state.replicationStateFrames?.delete(frame);
      const trackingKey = frame.type === "statePair" ? "statePair" : frame.type;
      if (state.replicationQueuedStateFrames?.[trackingKey]?.frame === frame) {
        delete state.replicationQueuedStateFrames[trackingKey];
        if (Object.keys(state.replicationQueuedStateFrames).length === 0) state.replicationQueuedStateFrames = null;
      }
    }
    if (mutateTracking && sendAttempt) state.replicationReliableFrames?.delete(sendAttempt.reliableId);
  }

  function sendWireImmediate(state, wire, frame, sendAttempt = null, { completeAttempt = true } = {}) {
    if (state.cleaned || state.ws.readyState !== WebSocket.OPEN) {
      recordSendTerminal(state, frame, "sendFailed", wire, now(), sendAttempt);
      if (sendAttempt) state.queue.completeSendAttempt(sendAttempt, { physicalCopies: 0 });
      return false;
    }
    if (sendAttempt && !state.queue.authorizePhysicalSend(sendAttempt)) return false;
    try {
      state.pendingSends += 1;
      if (replicationAccounting) replicationPendingSendCallbacks += 1;
      const accountingTimestamp = replicationAccounting ? now() : null;
      const accountingEpoch = replicationAccountingEpoch;
      const callbackFence = replicationAccounting ? Object.freeze({
        generation: state.generation,
        schedulerConnectionId: state.schedulerConnectionId,
        connectionEpoch: state.identity?.connectionEpoch ?? null,
        outboundGeneration: state.outboundGeneration,
      }) : null;
      if (replicationAccounting && sendAttempt) {
        const retained = state.replicationReliableFrames?.get(sendAttempt.reliableId);
        if (retained) retained.sendInvoked = true;
      } else if (replicationAccounting && (frame?.type === "publicState" || frame?.type === "ownerState" || frame?.type === "statePair")) {
        const queued = state.replicationStateFrames?.get(frame);
        if (queued) queued.sendInvoked = true;
      }
      if (onPressureTransition) state.pendingSendBytes += Buffer.byteLength(wire, "utf8");
      samplePressure(state);
      state.ws.send(wire, (error) => {
        state.pendingSends = Math.max(0, state.pendingSends - 1);
        if (replicationAccounting) replicationPendingSendCallbacks = Math.max(0, replicationPendingSendCallbacks - 1);
        if (onPressureTransition) {
          state.pendingSendBytes = Math.max(0, state.pendingSendBytes - Buffer.byteLength(wire, "utf8"));
        }
        samplePressure(state);
        const callbackIsCurrent = !callbackFence || (
          state.generation === callbackFence.generation
          && state.schedulerConnectionId === callbackFence.schedulerConnectionId
          && (state.identity?.connectionEpoch ?? null) === callbackFence.connectionEpoch
          && state.outboundGeneration === callbackFence.outboundGeneration
          && !state.cleaned
        );
        if (error) {
          if (replicationAccounting && accountingEpoch === replicationAccountingEpoch) {
            recordSendTerminal(state, frame, "sendFailed", wire, accountingTimestamp, sendAttempt, {
              mutateTracking: callbackIsCurrent,
            });
          }
          if (callbackIsCurrent) terminate(state);
        }
        else {
          if (replicationAccounting && accountingEpoch === replicationAccountingEpoch && callbackIsCurrent) {
            replicationAccounting.accepted(
              state, frame, Buffer.byteLength(wire, "utf8"), sendAttempt, accountingTimestamp,
            );
            if (sendAttempt) {
              const retained = state.replicationReliableFrames?.get(sendAttempt.reliableId);
              if (retained) retained.transportAccepted = true;
            }
            if (frame?.type === "publicState" || frame?.type === "ownerState" || frame?.type === "statePair") {
              state.replicationStateFrames?.delete(frame);
              const trackingKey = frame.type === "statePair" ? "statePair" : frame.type;
              if (state.replicationQueuedStateFrames?.[trackingKey]?.frame === frame) delete state.replicationQueuedStateFrames[trackingKey];
              if (state.replicationQueuedStateFrames
                && Object.keys(state.replicationQueuedStateFrames).length === 0) state.replicationQueuedStateFrames = null;
            }
          } else if (replicationAccounting && accountingEpoch === replicationAccountingEpoch) {
            recordSendTerminal(state, frame, "otherTerminal", wire, accountingTimestamp, sendAttempt, {
              mutateTracking: false,
            });
          }
          flush(state);
        }
      });
      if (onPressureTransition && sendAttempt) {
        state.pressureCounts.reliableWsSendAccepted += 1;
        emitPressureTransition(state, "reliable-ws-send-accepted", {
          reliableId: frame?.deliveryId ?? sendAttempt?.reliableId ?? null,
          eventSeq: Number.isSafeInteger(frame?.eventSeq) ? frame.eventSeq : null,
        });
      }
      else if (onPressureTransition && (frame?.type === "publicState" || frame?.type === "ownerState")) {
        state.pressureCounts.stateFramesWsSendAccepted[frame.type] += 1;
        emitPressureTransition(state, "state-ws-send-accepted", {
          snapshotId: frame.snapshotId,
          frameClass: frame.type,
        });
      }
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
      if (replicationAccounting) replicationPendingSendCallbacks = Math.max(0, replicationPendingSendCallbacks - 1);
      if (onPressureTransition) {
        state.pendingSendBytes = Math.max(0, state.pendingSendBytes - Buffer.byteLength(wire, "utf8"));
      }
      samplePressure(state);
      recordSendTerminal(state, frame, "sendFailed", wire, accountingTimestamp ?? now(), sendAttempt);
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
      return sendWireImmediate(state, wire, frame, sendAttempt);
    }
    if (state.cleaned || state.ws.readyState !== WebSocket.OPEN) {
      recordSendTerminal(state, frame, "sendFailed", wire, now(), sendAttempt);
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
    if (onPressureTransition) state.scheduledSendBytes += Buffer.byteLength(wire, "utf8");
    samplePressure(state);
    const settle = () => {
      if (!token.active) return true;
      if (token.sendAttempt
        && !state.queue.completeSendAttempt(token.sendAttempt, { physicalCopies: token.physicalCopies })) {
        token.active = false;
        state.scheduledSends.delete(token);
        if (onPressureTransition) {
          state.scheduledSendBytes = Math.max(0, state.scheduledSendBytes - Buffer.byteLength(wire, "utf8"));
        }
        samplePressure(state);
        terminate(state);
        return false;
      }
      token.active = false;
      state.scheduledSends.delete(token);
      if (onPressureTransition) {
        state.scheduledSendBytes = Math.max(0, state.scheduledSendBytes - Buffer.byteLength(wire, "utf8"));
      }
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
            if (onPressureTransition) {
              state.scheduledSendBytes = Math.max(0, state.scheduledSendBytes - Buffer.byteLength(wire, "utf8"));
            }
            samplePressure(state);
            return false;
          }
          sent = sendWireImmediate(state, wire, frame, token.sendAttempt, { completeAttempt: false });
          if (sent && token.sendAttempt) token.physicalCopies += 1;
        }
      }
      // A delayed release that finds a dead or backpressured socket ends this
      // attempt now. Zero accepted copies re-arm it for a later sweep; a second
      // callback from a duplicate decision is fenced by token.active.
      if (!sent || (token.deliveryCount !== null && token.delivered >= token.deliveryCount)) settle();
      if (!sent && !token.sendAttempt) recordSendTerminal(state, frame, "policyDropped", wire);
      return sent;
    };
    try {
      const outcome = scheduleOutboundFrame(wire, context, deliver);
      if (outcome && typeof outcome.then === "function") {
        Promise.resolve(outcome).catch(() => {});
        settle();
        recordSendTerminal(state, frame, "sendFailed", wire, now(), token.sendAttempt);
        terminate(state);
        return false;
      }
      if (outcome === false || outcome?.accepted === false) {
        settle();
        recordSendTerminal(state, frame, "sendFailed", wire, now(), token.sendAttempt);
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
        recordSendTerminal(state, frame, "sendFailed", wire, now(), token.sendAttempt);
        terminate(state);
        return false;
      }
      if (token.deliveryCount === 0 || token.delivered >= token.deliveryCount) {
        settle();
        if (token.deliveryCount === 0 && !token.sendAttempt) {
          recordSendTerminal(state, frame, "policyDropped", wire);
        }
      }
      return true;
    } catch {
      settle();
      recordSendTerminal(state, frame, "sendFailed", wire, now(), token.sendAttempt);
      terminate(state);
      return false;
    }
  }

  function sendFrame(state, frame) {
    const wire = encodeWireFrame(frame, { direction: SERVER_TO_CLIENT });
    if (replicationAccounting) replicationAccounting.outbound(
      state, frame, "offered", Buffer.byteLength(wire, "utf8"),
    );
    return sendWire(state, wire, frame);
  }

  function sendApplicationClose(state, code, reason, reconnectable, retryAfterMs, transportCode = code) {
    state.closing = true;
    state.closingSince ??= now();
    const closeFrame = { type: "close", code, reason, reconnectable };
    if (retryAfterMs !== undefined) closeFrame.retryAfterMs = retryAfterMs;
    emitPressureTransition(state, "close-dispatched", { code, transportCode, reason });
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
    replicationAccounting?.cleanup(state);
    state.abortController.abort();
    clearTimeout(state.helloTimer);
    clearTimeout(state.manifestTimer);
    state.manifestRequired = null;
    state.releaseManifestAdmission = null;
    if (state.helloPending) {
      state.helloPending = false;
      pendingHello = Math.max(0, pendingHello - 1);
    }
    if (state.bindingKey !== null && byBindingKey.get(state.bindingKey) === state) byBindingKey.delete(state.bindingKey);
    if (state.binding && onBindingClosed) {
      try { onBindingClosed(state.binding); } catch {}
    }
    resetOutbound(state, { cause: "cleanup" });
    state.cleaned = true;
    emitPressureTransition(state, "connection-cleanup");
    connections.delete(state);
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
    markQueuePolicy(state, outcome.action, outcome.reason);
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
      if (status.disconnectRequired) return queueOutcome(state, { action: "disconnect", reason: status.reason });
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
      replicationAccounting?.outbound(state, retainedFrame, "offered", wireBytes);
      if (replayEvent && retainedFrame.type === "event") {
        const queueStatus = state.queue.status();
        if (
          state.pendingEventBytes + wireBytes > MAX_PENDING_REPLAY_BYTES
          || queueStatus.reliableMessages >= state.queue.limits.maxReliableMessages - ACTION_RELIABLE_MESSAGE_RESERVE
          || queueStatus.reliableBytes + wireBytes > state.queue.limits.maxReliableBytes - ACTION_RELIABLE_BYTE_RESERVE
        ) {
          replicationAccounting?.outbound(state, retainedFrame, "otherTerminal", wireBytes);
          return { accepted: false, action: "ignore", reason: "event-replay-budget-full" };
        }
      }
      if (onPressureTransition) state.pressureCounts.reliableOffered += 1;
      const result = state.queue.enqueueConsequence(retainedFrame, { reliableId: retainedFrame.deliveryId });
      if (replicationAccounting && result.accepted) {
        state.replicationReliableFrames.set(retainedFrame.deliveryId, {
          frame: retainedFrame, bytes: wireBytes, transportAccepted: false, sendInvoked: false,
        });
      }
      if (replicationAccounting && !result.accepted
        && (result.action === "rebase" || result.action === "disconnect")) {
        replicationAccounting.outbound(state, retainedFrame, "policyDropped", wireBytes);
      } else if (replicationAccounting && !result.accepted) {
        replicationAccounting.outbound(state, retainedFrame, "otherTerminal", wireBytes);
      }
      if (onPressureTransition && result.accepted) state.pressureCounts.reliableQueued += 1;
      samplePressure(state);
      if (result.accepted) emitPressureTransition(state, "reliable-queued", {
        reliableId: retainedFrame.deliveryId,
        eventSeq: Number.isSafeInteger(retainedFrame.eventSeq) ? retainedFrame.eventSeq : null,
        byteLength: result.byteLength,
      });
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
    if (!result || typeof result !== "object" || !result.binding || !result.welcome || (!result.rebase && !result.manifestRequired)) {
      throw Object.assign(new Error("invalid hello redemption"), { publicCode: "admission-rejected", closeCode: 4401 });
    }
    encodeWireFrame(result.welcome, { direction: SERVER_TO_CLIENT });
    if (result.rebase) encodeWireFrame(result.rebase, { direction: SERVER_TO_CLIENT });
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
    state.wireVersion = result.welcome.wireVersion;
    state.capabilities = Object.freeze([...(result.welcome.capabilities || [])]);
    state.manifestSchema = result.welcome.manifestSchema || null;
    state.manifestHash = result.welcome.manifestHash || null;
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
    if (onBindingOpened) await onBindingOpened(state.binding, callbackContext(state, "binding-opened"));
    if (!stateIsLive(state, expectedGeneration)) return;
    replicationAccounting?.bind(state);
    currentRunId = result.welcome.runId;
    resetOutbound(state);
    sendFrame(state, result.welcome);
    const releaseAdmission = () => {
      if (!stateIsLive(state) || state.closing) return;
      sendFrame(state, result.rebase);
      sendFrame(state, baselinePublicFrame);
      sendFrame(state, baselineOwnerFrame);
      if (!Array.isArray(result.reliableEvents)) return;
      let enqueued = 0;
      for (const event of result.reliableEvents) {
        if (enqueued >= MAX_REPLAY_EVENTS_PER_PASS) break;
        const outcome = enqueueReliableState(state, event, { replayEvent: true });
        if (outcome.accepted) enqueued += 1;
      }
    };
    if (result.manifestRequired) {
      state.manifestRequired = Object.freeze({
        manifestSchema: result.welcome.manifestSchema,
        manifestHash: result.welcome.manifestHash,
        manifestBytes: result.welcome.manifestBytes,
        connectionEpoch: result.welcome.connectionEpoch,
      });
      state.releaseManifestAdmission = releaseAdmission;
      state.manifestTimer = setTimeout(() => {
        if (state.manifestRequired && stateIsLive(state)) {
          state.closing = true;
          sendApplicationClose(state, 4408, "manifest verification timeout", false);
        }
      }, Number(result.manifestTimeoutMs) || 10_000);
      state.manifestTimer.unref?.();
    } else {
      releaseAdmission();
    }
  }

  async function handleBoundFrame(state, frame) {
    const expectedGeneration = state.generation;
    if (!(await isBindingCurrent(state, `inbound:${frame.type}`))) {
      if (!stateIsLive(state, expectedGeneration)) return;
      state.closing = true;
      return sendApplicationClose(state, 4003, "connection fenced", true);
    }
    const acceptPong = async () => {
      if (frame.heartbeatId !== state.pendingHeartbeat?.id) {
        throw new WireProtocolError("invalid-pong", "pong does not match the active heartbeat", 4400);
      }
      state.pendingHeartbeat = null;
      state.nextHeartbeatAt = now() + state.heartbeatIntervalMs;
      emitPressureTransition(state, "heartbeat-pong", {
        nextHeartbeatTimeoutEligibleAt: state.nextHeartbeatAt + state.heartbeatIntervalMs * 2,
      });
      await onPong(state.binding, frame, callbackContext(state, "pong"));
      return stateIsLive(state, expectedGeneration);
    };
    if (state.manifestRequired) {
      if (frame.type === "pong") {
        await acceptPong();
        return;
      }
      if (frame.type !== "manifestAck") {
        state.closing = true;
        return sendApplicationClose(state, 4401, "manifest verification required", false);
      }
      const required = state.manifestRequired;
      if (frame.manifestSchema !== required.manifestSchema
          || frame.manifestHash !== required.manifestHash
          || frame.manifestBytes !== required.manifestBytes
          || frame.connectionEpoch !== required.connectionEpoch) {
        state.closing = true;
        return sendApplicationClose(state, 4401, "manifest verification failed", false);
      }
      const proofAccepted = await verifyManifestAck(state.binding, frame, callbackContext(state, "manifest-ack"));
      if (!proofAccepted || !stateIsLive(state, expectedGeneration)) {
        if (!stateIsLive(state, expectedGeneration)) return;
        state.closing = true;
        return sendApplicationClose(state, 4401, "manifest verification failed", false);
      }
      clearTimeout(state.manifestTimer);
      state.manifestTimer = null;
      state.manifestRequired = null;
      const release = state.releaseManifestAdmission;
      state.releaseManifestAdmission = null;
      release?.();
      return;
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
      await acceptPong();
      return;
    }
    if (frame.type === "statePairRecovery") {
      const validRecovery = state.statePairMode && state.capabilities?.includes("state-pair-v1")
        && frame.matchId === state.identity.runId && frame.sessionId === state.identity.connectionId
        && frame.recipientId === state.identity.membershipId
        && frame.recipientIncarnation === state.identity.connectionEpoch
        && Number.isSafeInteger(state.binding?.authorityIncarnation)
        && frame.authorityIncarnation === state.binding.authorityIncarnation
        && frame.manifestSchema === state.manifestSchema && frame.manifestHash === state.manifestHash;
      if (!validRecovery) {
        throw new WireProtocolError("unexpected-state-pair-recovery", "statePair recovery is not valid for this binding", 4401);
      }
      if (!(await isBindingCurrent(state, "state-pair-recovery"))) {
        if (!stateIsLive(state, expectedGeneration)) return;
        throw new WireProtocolError("connection-fenced", "statePair recovery binding is stale", 4403);
      }
      const recoveryAt = now();
      if (Number.isFinite(state.lastStatePairRecoveryAt)
        && recoveryAt - state.lastStatePairRecoveryAt < STATE_PAIR_RECOVERY_COOLDOWN_MS) return;
      const accepted = await onStatePairRecovery(state.binding, frame, callbackContext(state, "state-pair-recovery"));
      if (accepted === false) throw new WireProtocolError("state-pair-recovery-rejected", "statePair recovery was rejected", 4401);
      if (!stateIsLive(state, expectedGeneration)) return;
      state.lastStatePairRecoveryAt = recoveryAt;
      resetOutbound(state);
      return;
    }
    if (frame.type === "ack") {
      if (frame.ackKind === "statePair") {
        const validStatePairAck = state.statePairMode && state.capabilities?.includes("state-pair-v1")
          && frame.matchId === state.identity.runId && frame.sessionId === state.identity.connectionId
          && frame.recipientId === state.identity.membershipId
          && frame.recipientIncarnation === state.identity.connectionEpoch
          && Number.isSafeInteger(state.binding?.authorityIncarnation)
          && frame.authorityIncarnation === state.binding.authorityIncarnation;
        if (!validStatePairAck) {
          throw new WireProtocolError("unexpected-state-pair-ack", "statePair ACK is not valid for this binding", 4401);
        }
      }
      if (frame.ackKind === "delivery") {
        const ackOutcome = state.queue.acknowledge(frame.deliveryId);
        if (replicationAccounting && ackOutcome.removedMessages > 0) {
          for (const [reliableId, retained] of state.replicationReliableFrames) {
            if (reliableId > frame.deliveryId) continue;
            replicationAccounting.outbound(state, retained.frame, "ackRetired", retained.bytes, { reliableId });
            replicationAccounting.retire(state, reliableId);
            state.replicationReliableFrames.delete(reliableId);
          }
        }
        if (onPressureTransition) state.pressureCounts.reliableAckRetired += ackOutcome.removedMessages || 0;
        samplePressure(state);
        emitPressureTransition(state, "reliable-ack-retired", {
          reliableId: frame.deliveryId,
          removedCount: ackOutcome.removedMessages || 0,
          cumulativeRetired: state.pressureCounts?.reliableAckRetired || 0,
        });
        queueOutcome(state, ackOutcome);
      }
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
    replicationAccounting?.inbound(state, frame, Buffer.byteLength(raw));
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
    if (replicationAccounting) {
      state.replicationQueuedStateFrames = null;
      state.replicationStateFrames = new Map();
      state.replicationReliableFrames = new Map();
    }
    if (onPressureTransition) {
      state.pendingSendBytes = 0;
      state.scheduledSendBytes = 0;
      state.pressureDetailMaximum = Object.fromEntries(detailedMetricNames.map((name) => [name, 0]));
      state.pressureCounts = {
        stateOffered: 0,
        stateCoalesced: 0,
        stateFramesWsSendAccepted: { publicState: 0, ownerState: 0 },
        reliableOffered: 0,
        reliableQueued: 0,
        reliableWsSendAccepted: 0,
        reliableAckRetired: 0,
        reliableResetOnCleanup: 0,
        highWaterCrossings: 0,
        rebases: 0,
        disconnects: 0,
      };
    }
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
    const candidates = [...connections].filter((state) => state.bound && !state.manifestRequired
      && !state.capabilities?.includes("state-pair-v1") && !state.statePairMode && !state.closing && !state.cleaned);
    const statePairCandidates = buildStatePair ? [...connections].filter((state) => state.bound && !state.manifestRequired
      && state.capabilities?.includes("state-pair-v1") && !state.closing && !state.cleaned) : [];
    if (candidates.length === 0 && statePairCandidates.length === 0) return { projected: 0, skipped: connections.size };
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
    let skipped = Math.max(0, connections.size - candidates.length - statePairCandidates.length);
    for (const state of candidates) {
      if (!(await isBindingCurrent(state, "private-project"))) {
        skipped += 1;
        if (!stateIsLive(state)) continue;
        state.closing = true;
        sendApplicationClose(state, 4003, "connection fenced", true);
        continue;
      }
      try {
        const recipientPublicFrame = state.binding?.manifestHash
          ? await projectPublicStateForBinding(
              state.binding,
              publicFrame,
              callbackContext(state, "public-recipient-project"),
            )
          : publicFrame;
        if (recipientPublicFrame !== publicFrame) {
          encodeWireFrame(recipientPublicFrame, { direction: SERVER_TO_CLIENT });
        }
        const ownerFrame = await buildOwnerState(
          state.binding,
          recipientPublicFrame,
          context,
          callbackContext(state, "owner-project"),
        );
        if (!stateIsLive(state)) {
          skipped += 1;
          continue;
        }
        encodeWireFrame(ownerFrame, { direction: SERVER_TO_CLIENT });
        assertOwnerProjection(ownerFrame, recipientPublicFrame, state.identity);
        const recovery = await buildEventRecovery(
          state.binding,
          recipientPublicFrame,
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
          sendFrame(state, recipientPublicFrame);
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
        const priorQueuedStateFrames = state.replicationQueuedStateFrames;
        const outcome = state.queue.enqueueState(recipientPublicFrame.snapshotId, {
          kind: "state-pair",
          frames: [recipientPublicFrame, ownerFrame],
        });
        if (replicationAccounting) {
          const publicBytes = Buffer.byteLength(JSON.stringify(recipientPublicFrame), "utf8");
          const ownerBytes = Buffer.byteLength(JSON.stringify(ownerFrame), "utf8");
          replicationAccounting.outbound(state, recipientPublicFrame, "offered", publicBytes);
          replicationAccounting.outbound(state, ownerFrame, "offered", ownerBytes);
          if (!outcome.accepted) {
            const terminalMetric = outcome.action === "rebase" || outcome.action === "disconnect"
              ? "policyDropped" : "otherTerminal";
            replicationAccounting.outbound(state, recipientPublicFrame, terminalMetric, publicBytes);
            replicationAccounting.outbound(state, ownerFrame, terminalMetric, ownerBytes);
          } else if (outcome.action === "coalesced") {
            for (const queued of Object.values(priorQueuedStateFrames || {})) {
              replicationAccounting.outbound(state, queued.frame, "coalesced", queued.bytes);
              state.replicationStateFrames.delete(queued.frame);
            }
          }
          if (outcome.accepted) {
            const publicRecord = { frame: publicFrame, bytes: publicBytes, sendInvoked: false };
            const ownerRecord = { frame: ownerFrame, bytes: ownerBytes, sendInvoked: false };
            state.replicationStateFrames.set(publicFrame, publicRecord);
            state.replicationStateFrames.set(ownerFrame, ownerRecord);
            state.replicationQueuedStateFrames = { publicState: publicRecord, ownerState: ownerRecord };
          }
        }
        if (onPressureTransition) state.pressureCounts.stateOffered += 1;
        emitPressureTransition(state, "state-offered", {
          snapshotId: publicFrame.snapshotId,
          queueAction: outcome.action,
        });
        if (outcome.action === "coalesced") {
          if (onPressureTransition) state.pressureCounts.stateCoalesced += 1;
          emitPressureTransition(state, "state-coalesced", { snapshotId: publicFrame.snapshotId });
        }
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
    for (const state of statePairCandidates) {
      try {
        if (!(await isBindingCurrent(state, "private-state-pair-project"))) {
          skipped += 1;
          if (stateIsLive(state)) {
            state.closing = true;
            sendApplicationClose(state, 4003, "connection fenced", true);
          }
          continue;
        }
        const recipientPublicFrame = state.binding?.manifestHash
          ? await projectPublicStateForBinding(
              state.binding,
              publicFrame,
              callbackContext(state, "state-pair-public-recipient-project"),
            )
          : publicFrame;
        const ownerFrame = await buildOwnerState(
          state.binding,
          recipientPublicFrame,
          context,
          callbackContext(state, "state-pair-owner-project"),
        );
        const pair = await buildStatePair(
          state.binding,
          recipientPublicFrame,
          ownerFrame,
          context,
          callbackContext(state, "state-pair-project"),
        );
        if (!stateIsLive(state)) {
          skipped += 1;
          continue;
        }
        const outcome = await publishStatePair(state.binding, pair.frame || pair);
        if (outcome.accepted) {
          statePairStats.accepted += 1;
          projected += 1;
        } else {
          statePairStats.rejected += 1;
          statePairStats.lastRejectReason = String(outcome.reason || outcome.action || "unknown").slice(0, 96);
          skipped += 1;
        }
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

  async function publishStatePair(binding, frame) {
    const key = bindingKeyFor(binding);
    const state = key ? byBindingKey.get(key) : null;
    if (!state) return { accepted: false, action: "ignore", reason: "binding-not-connected" };
    if (state.wireVersion !== "lbh-multiplayer-json-v2") {
      return { accepted: false, action: "ignore", reason: "state-pair-requires-v2" };
    }
    try {
      encodeWireFrame(frame, { direction: SERVER_TO_CLIENT });
    } catch (error) {
      return { accepted: false, action: "reject", reason: publicError(error, "state-pair-invalid").code };
    }
    if (!state.capabilities?.includes("state-pair-v1")) {
      return { accepted: false, action: "reject", reason: "state-pair-capability-required" };
    }
    if (frame.matchId !== state.identity.runId || frame.sessionId !== state.identity.connectionId
      || frame.recipientId !== state.identity.membershipId
      || frame.recipientIncarnation !== state.identity.connectionEpoch
      || frame.manifestHash !== state.binding?.manifestHash
      || !Number.isSafeInteger(state.binding?.authorityIncarnation)
      || frame.authorityIncarnation !== state.binding.authorityIncarnation) {
      return { accepted: false, action: "reject", reason: "state-pair-identity-mismatch" };
    }
    if (!(await isBindingCurrent(state, "private-state-pair-send"))) {
      if (!stateIsLive(state)) return { accepted: false, action: "ignore", reason: "connection-not-live" };
      state.closing = true;
      sendApplicationClose(state, 4003, "connection fenced", true);
      return { accepted: false, action: "disconnect", reason: "connection-fenced" };
    }
    if (!state.statePairMode) {
      if (frame.public.kind !== "keyframe" || frame.owner.kind !== "keyframe") {
        return { accepted: false, action: "reject", reason: "state-pair-keyframe-required" };
      }
      state.statePairMode = true;
      state.statePairQueueOffset = Math.max(0, state.queue.status().lastStateSequence + 1 - frame.frameId);
      state.lastStatePairFrameId = 0;
    } else if (frame.frameId <= state.lastStatePairFrameId) {
      return { accepted: false, action: "reject", reason: "stale-state-pair" };
    }
    const priorRecords = Object.values(state.replicationQueuedStateFrames || {});
    const queueSequence = frame.frameId + state.statePairQueueOffset;
    const outcome = state.queue.enqueueState(queueSequence, { kind: "state-pair", frames: [frame] });
    if (replicationAccounting) {
      const bytes = Buffer.byteLength(JSON.stringify(frame), "utf8");
      replicationAccounting.outbound(state, frame, "offered", bytes);
      if (!outcome.accepted) {
        const terminal = outcome.action === "rebase" || outcome.action === "disconnect"
          ? "policyDropped" : "otherTerminal";
        replicationAccounting.outbound(state, frame, terminal, bytes);
      } else {
        if (outcome.action === "coalesced") {
          for (const prior of priorRecords) {
            replicationAccounting.outbound(state, prior.frame, "coalesced", prior.bytes);
            state.replicationStateFrames?.delete(prior.frame);
          }
        }
        const record = { frame, bytes, sendInvoked: false };
        state.replicationStateFrames?.set(frame, record);
        state.replicationQueuedStateFrames = { statePair: record };
      }
    }
    samplePressure(state);
    queueOutcome(state, outcome, frame);
    flush(state);
    if (outcome.accepted) state.lastStatePairFrameId = frame.frameId;
    return outcome;
  }

  async function retransmitStatePair(binding, frame) {
    const key = bindingKeyFor(binding);
    const state = key ? byBindingKey.get(key) : null;
    if (!state) return { accepted: false, action: "ignore", reason: "binding-not-connected" };
    let wire;
    try {
      wire = encodeWireFrame(frame, { direction: SERVER_TO_CLIENT });
    } catch (error) {
      return { accepted: false, action: "reject", reason: publicError(error, "state-pair-invalid").code };
    }
    if (state.wireVersion !== "lbh-multiplayer-json-v2" || !state.statePairMode
      || !state.capabilities?.includes("state-pair-v1") || frame.matchId !== state.identity.runId
      || frame.sessionId !== state.identity.connectionId || frame.recipientId !== state.identity.membershipId
      || frame.recipientIncarnation !== state.identity.connectionEpoch
      || frame.manifestHash !== state.binding?.manifestHash
      || frame.authorityIncarnation !== state.binding?.authorityIncarnation) {
      return { accepted: false, action: "reject", reason: "state-pair-identity-mismatch" };
    }
    if (!(await isBindingCurrent(state, "private-state-pair-retransmit"))) {
      return { accepted: false, action: "ignore", reason: "connection-not-live" };
    }
    replicationAccounting?.outbound(state, frame, "retransmitted", Buffer.byteLength(wire, "utf8"));
    const accepted = sendWire(state, wire, frame);
    return accepted
      ? { accepted: true, action: "retransmitted" }
      : { accepted: false, action: "disconnect", reason: "send-failed" };
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
    replicationAccountingEpoch += 1;
    replicationAccounting?.reset();
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
      const wsBufferedBytes = readWsBufferedBytes(state);
      const queueStatus = state.queue.observeTransportBufferedBytes(wsBufferedBytes);
      if (queueStatus.backpressured) state.backpressuredSince ??= timestamp;
      else state.backpressuredSince = null;
      samplePressure(state, capturePressureSample(state, { status: queueStatus, wsBufferedBytes }));
      emitPressureTransition(state, "pressure-sweep", {
        scheduledAt: nextSweepScheduledAt,
        actualAt: timestamp,
      });
      if (state.backpressuredSince !== null && timestamp - state.backpressuredSince >= backpressureTimeoutMs) {
        markQueuePolicy(state, "disconnect", "backpressure-timeout");
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
    nextSweepScheduledAt += sweepIntervalMs;
    if (nextSweepScheduledAt <= timestamp) nextSweepScheduledAt = timestamp + sweepIntervalMs;
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

  function diagnostics({ includeReplication = true } = {}) {
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
      statePair: Object.freeze({ ...statePairStats,
        modeConnections: [...connections].filter((state) => state.statePairMode).length }),
      ...(replicationAccounting && includeReplication
        ? { replication: replicationAccounting.snapshot() }
        : replicationAccounting ? { replicationCaptureEnabled: true } : {}),
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
    publishStatePair,
    retransmitStatePair,
    rebase: sendRebase,
    sendRebase,
    broadcastReliable,
    bindingKeyFor,
    rotateRun,
    diagnostics,
    replicationWindow(startAt, endAt, options = {}) {
      if (!replicationAccounting) return null;
      return summarizeReplicationWindow(replicationAccounting.snapshot(), {
        startAt, endAt,
        evidenceFinalized: options.evidenceFinalized === true && connections.size === 0,
        expectedRecipients: options.expectedRecipients ?? null,
        pendingSendCallbacks: replicationPendingSendCallbacks,
      });
    },
    shutdown,
  });
}

module.exports = {
  DEFAULTS,
  createSimWebSocketAdapter,
};
