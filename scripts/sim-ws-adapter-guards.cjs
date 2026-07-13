"use strict";

const { LIMITS, WireProtocolError } = require("./multiplayer-wire-protocol.cjs");

const DEFAULTS = Object.freeze({
  path: "/stream",
  helloTimeoutMs: 3_000,
  heartbeatIntervalMs: 10_000,
  backpressureTimeoutMs: 2_000,
  sweepIntervalMs: 1_000,
  shutdownTimeoutMs: 1_000,
  closeGraceMs: 1_000,
  maxConnections: 128,
  maxPendingHello: 32,
  maxPendingInbound: 64,
  maxPendingInboundBytes: 512 * 1024,
  maxPendingInboundBytesTotal: 8 * 1024 * 1024,
});

function positiveInteger(value, fallback, label) {
  const candidate = value === undefined ? fallback : Number(value);
  if (!Number.isSafeInteger(candidate) || candidate <= 0) throw new TypeError(`${label} must be a positive integer`);
  return candidate;
}

function requiredCallback(value, label) {
  if (typeof value !== "function") throw new TypeError(`${label} must be a function`);
  return value;
}

function publicError(error, fallback = "authority-error") {
  const supplied = error instanceof WireProtocolError ? error.code : error?.publicCode;
  const code = typeof supplied === "string" && /^[a-z0-9][a-z0-9._-]{0,63}$/i.test(supplied)
    ? supplied
    : fallback;
  return {
    code,
    message: code.replace(/[._-]+/g, " ").slice(0, LIMITS.maxErrorMessageLength),
    closeCode: Number.isInteger(error?.closeCode) && error.closeCode >= 4000 && error.closeCode <= 4999
      ? error.closeCode
      : 4400,
    retryable: Boolean(error?.retryable),
  };
}

function createRateBucket(rate, burst, timestamp) {
  return { rate, burst, tokens: burst, updatedAt: timestamp };
}

function consumeRateBucket(bucket, timestamp) {
  bucket.tokens = Math.min(
    bucket.burst,
    bucket.tokens + Math.max(0, timestamp - bucket.updatedAt) / 1000 * bucket.rate,
  );
  bucket.updatedAt = timestamp;
  if (bucket.tokens < 1) return false;
  bucket.tokens -= 1;
  return true;
}

function stableBindingKey(identity) {
  if (typeof identity === "string" && identity.length > 0) return identity;
  if (!identity || typeof identity.runId !== "string" || typeof identity.membershipId !== "string") return null;
  return `${identity.runId.length}:${identity.runId}${identity.membershipId.length}:${identity.membershipId}`;
}

function normalizeAdapterOptions(options) {
  const server = options.server;
  if (!server || typeof server.on !== "function" || typeof server.removeListener !== "function") {
    throw new TypeError("server must be an injected http.Server");
  }
  const upgradeRouter = options.upgradeRouter;
  if (upgradeRouter && (typeof upgradeRouter.attach !== "function" || typeof upgradeRouter.detach !== "function")) {
    throw new TypeError("upgradeRouter must provide attach(handler) and detach(handler)");
  }
  if (server.listenerCount("upgrade") > 0 && !upgradeRouter) {
    throw new Error("server already owns Upgrade routing; supply upgradeRouter.attach(handler) for cooperative routing");
  }
  const backpressureTimeoutMs = positiveInteger(
    options.backpressureTimeoutMs,
    DEFAULTS.backpressureTimeoutMs,
    "backpressureTimeoutMs",
  );
  return Object.freeze({
    server,
    upgradeRouter,
    redeemHello: requiredCallback(options.redeemHello, "redeemHello"),
    revalidateBinding: requiredCallback(options.revalidateBinding, "revalidateBinding"),
    onInput: requiredCallback(options.onInput, "onInput"),
    onAction: requiredCallback(options.onAction, "onAction"),
    buildPublicState: requiredCallback(options.buildPublicState, "buildPublicState"),
    buildOwnerState: requiredCallback(options.buildOwnerState, "buildOwnerState"),
    buildStatePair: typeof options.buildStatePair === "function" ? options.buildStatePair : null,
    onPong: typeof options.onPong === "function" ? options.onPong : async () => {},
    onAck: typeof options.onAck === "function" ? options.onAck : async () => {},
    onStatePairRecovery: typeof options.onStatePairRecovery === "function"
      ? options.onStatePairRecovery
      : async () => true,
    onPressureTransition: typeof options.onPressureTransition === "function"
      ? options.onPressureTransition
      : null,
    replicationAccounting: options.replicationAccounting === true,
    replicationAccountingFactory: typeof options.replicationAccountingFactory === "function"
      ? options.replicationAccountingFactory : null,
    now: typeof options.now === "function" ? options.now : Date.now,
    path: typeof options.path === "string" && options.path.startsWith("/") ? options.path : DEFAULTS.path,
    helloTimeoutMs: positiveInteger(options.helloTimeoutMs, DEFAULTS.helloTimeoutMs, "helloTimeoutMs"),
    heartbeatIntervalMs: positiveInteger(
      options.heartbeatIntervalMs,
      DEFAULTS.heartbeatIntervalMs,
      "heartbeatIntervalMs",
    ),
    backpressureTimeoutMs,
    shutdownTimeoutMs: positiveInteger(options.shutdownTimeoutMs, DEFAULTS.shutdownTimeoutMs, "shutdownTimeoutMs"),
    closeGraceMs: positiveInteger(options.closeGraceMs, DEFAULTS.closeGraceMs, "closeGraceMs"),
    maxConnections: positiveInteger(options.maxConnections, DEFAULTS.maxConnections, "maxConnections"),
    maxPendingHello: positiveInteger(options.maxPendingHello, DEFAULTS.maxPendingHello, "maxPendingHello"),
    maxPendingInbound: positiveInteger(options.maxPendingInbound, DEFAULTS.maxPendingInbound, "maxPendingInbound"),
    maxPendingInboundBytes: positiveInteger(
      options.maxPendingInboundBytes,
      DEFAULTS.maxPendingInboundBytes,
      "maxPendingInboundBytes",
    ),
    maxPendingInboundBytesTotal: positiveInteger(
      options.maxPendingInboundBytesTotal,
      DEFAULTS.maxPendingInboundBytesTotal,
      "maxPendingInboundBytesTotal",
    ),
    sweepIntervalMs: Math.min(
      DEFAULTS.sweepIntervalMs,
      positiveInteger(options.sweepIntervalMs, DEFAULTS.sweepIntervalMs, "sweepIntervalMs"),
      backpressureTimeoutMs,
    ),
    queueOptions: Object.freeze({ ...(options.queueOptions || {}) }),
    runId: options.runId || null,
  });
}

function createConnectionState({ ws, queue, generation, timestamp, heartbeatIntervalMs }) {
  return {
    ws,
    queue,
    binding: null,
    bindingKey: null,
    identity: null,
    bound: false,
    helloPending: true,
    closing: false,
    closingSince: null,
    cleaned: false,
    flushing: false,
    generation,
    abortController: new AbortController(),
    pendingSends: 0,
    pendingInbound: 0,
    pendingInboundBytes: 0,
    inboundItems: new Set(),
    inboundTail: Promise.resolve(),
    backpressuredSince: null,
    heartbeatIntervalMs,
    nextHeartbeatAt: timestamp + heartbeatIntervalMs,
    pendingHeartbeat: null,
    inputBucket: createRateBucket(40, 12, timestamp),
    actionBucket: createRateBucket(10, 8, timestamp),
    helloTimer: null,
  };
}

function summarizeConnections(connections) {
  const summary = {
    bound: 0,
    queuedMessages: 0,
    queuedBytes: 0,
    backpressured: 0,
    pendingInbound: 0,
    pendingInboundBytes: 0,
    closing: 0,
  };
  for (const state of connections) {
    const status = state.queue.status();
    if (state.bound) summary.bound += 1;
    summary.queuedMessages += status.queuedMessages;
    summary.queuedBytes += status.queuedBytes;
    if (status.backpressured) summary.backpressured += 1;
    summary.pendingInbound += state.pendingInbound;
    summary.pendingInboundBytes += state.pendingInboundBytes;
    if (state.closing) summary.closing += 1;
  }
  return summary;
}

function assertOwnerProjection(ownerFrame, publicFrame, identity) {
  if (
    ownerFrame.runId !== identity.runId
    || ownerFrame.membershipId !== identity.membershipId
    || ownerFrame.playerId !== identity.playerId
  ) {
    throw Object.assign(new Error("owner projection identity mismatch"), {
      publicCode: "owner-identity-mismatch",
      closeCode: 4403,
      fatal: true,
    });
  }
  for (const watermark of [
    "runId", "snapshotId", "tick", "simTime", "lastEventSeq", "fieldRevision", "overloadMode",
  ]) {
    if (ownerFrame[watermark] !== publicFrame[watermark]) {
      throw Object.assign(new Error("projection watermark mismatch"), { publicCode: "projection-watermark-mismatch" });
    }
  }
}

function rejectUpgrade(socket, status = "404 Not Found") {
  if (socket.destroyed) return;
  try {
    socket.end(`HTTP/1.1 ${status}\r\nConnection: close\r\nContent-Length: 0\r\n\r\n`);
  } catch {
    socket.destroy();
  }
}

function createUpgradeHandler(options) {
  return function handleUpgrade(request, socket, head) {
    if (options.isClosed()) return rejectUpgrade(socket, "503 Service Unavailable");
    let target;
    try {
      target = new URL(request.url, "http://localhost");
    } catch {
      return rejectUpgrade(socket, "400 Bad Request");
    }
    if (target.pathname !== options.path || target.search) return rejectUpgrade(socket);
    if (options.connectionCount() >= options.maxConnections) {
      options.onConnectionRejected();
      return rejectUpgrade(socket, "503 Service Unavailable");
    }
    if (options.pendingHelloCount() >= options.maxPendingHello) {
      options.onPendingHelloRejected();
      return rejectUpgrade(socket, "503 Service Unavailable");
    }
    try {
      options.wss.handleUpgrade(request, socket, head, (ws) => options.wss.emit("connection", ws, request));
    } catch {
      if (!socket.destroyed) socket.destroy();
    }
  };
}

function createLifecycleGuards({ lifecycle, getGeneration, isClosed }) {
  function callbackContext(state, purpose) {
    return Object.freeze({
      purpose,
      generation: state?.generation ?? getGeneration(),
      signal: state?.abortController.signal ?? lifecycle.signal,
    });
  }
  function stateIsLive(state, expectedGeneration = state.generation) {
    return !isClosed()
      && getGeneration() === expectedGeneration
      && state.generation === expectedGeneration
      && !state.cleaned
      && !state.closing
      && !state.abortController.signal.aborted;
  }
  return { callbackContext, stateIsLive };
}

function rawByteLength(raw) {
  if (typeof raw === "string") return Buffer.byteLength(raw, "utf8");
  if (Buffer.isBuffer(raw)) return raw.byteLength;
  if (ArrayBuffer.isView(raw)) return raw.byteLength;
  if (raw instanceof ArrayBuffer) return raw.byteLength;
  return Buffer.byteLength(String(raw), "utf8");
}

function enqueueBoundedInbound({
  state,
  raw,
  isBinary,
  maxPendingInbound,
  maxPendingInboundBytes,
  maxPendingInboundBytesTotal,
  getPendingInboundBytesTotal,
  onBytes,
  onOverflow,
  onFrame,
  onError,
  onDepth,
  onByteDepth,
}) {
  if (state.closing || state.cleaned) return false;
  const bytes = rawByteLength(raw);
  if (
    state.pendingInbound >= maxPendingInbound
    || state.pendingInboundBytes + bytes > maxPendingInboundBytes
    || getPendingInboundBytesTotal() + bytes > maxPendingInboundBytesTotal
  ) {
    onOverflow();
    return false;
  }
  state.pendingInbound += 1;
  state.pendingInboundBytes += bytes;
  onBytes(bytes);
  onDepth(state.pendingInbound);
  onByteDepth(state.pendingInboundBytes, getPendingInboundBytesTotal());
  const item = {
    released: false,
    release() {
      if (item.released) return;
      item.released = true;
      state.inboundItems.delete(item);
      state.pendingInbound = Math.max(0, state.pendingInbound - 1);
      state.pendingInboundBytes = Math.max(0, state.pendingInboundBytes - bytes);
      onBytes(-bytes);
    },
  };
  state.inboundItems.add(item);
  state.inboundTail = state.inboundTail
    .then(() => onFrame(raw, isBinary))
    .catch(onError)
    .finally(item.release);
  return true;
}

module.exports = {
  DEFAULTS,
  positiveInteger,
  requiredCallback,
  publicError,
  createRateBucket,
  consumeRateBucket,
  stableBindingKey,
  normalizeAdapterOptions,
  createConnectionState,
  summarizeConnections,
  assertOwnerProjection,
  rejectUpgrade,
  createUpgradeHandler,
  createLifecycleGuards,
  enqueueBoundedInbound,
};
