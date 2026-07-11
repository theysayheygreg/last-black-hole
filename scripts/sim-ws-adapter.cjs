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

const DEFAULTS = Object.freeze({
  path: "/stream",
  helloTimeoutMs: 3_000,
  heartbeatIntervalMs: 10_000,
  backpressureTimeoutMs: 10_000,
  shutdownTimeoutMs: 1_000,
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

function safeCode(value, fallback = "authority-error") {
  return typeof value === "string" && /^[a-z0-9][a-z0-9._-]{0,63}$/i.test(value) ? value : fallback;
}

function publicError(error, fallback = "authority-error") {
  const code = error instanceof WireProtocolError ? error.code : safeCode(error?.code, fallback);
  return {
    code,
    message: code.replace(/[._-]+/g, " ").slice(0, LIMITS.maxErrorMessageLength),
    closeCode: Number.isInteger(error?.closeCode) && error.closeCode >= 4000 && error.closeCode <= 4999
      ? error.closeCode
      : 4400,
    retryable: Boolean(error?.retryable),
  };
}

function createBucket(rate, burst, now) {
  return { rate, burst, tokens: burst, updatedAt: now };
}

function consumeBucket(bucket, now) {
  const elapsedSeconds = Math.max(0, now - bucket.updatedAt) / 1000;
  bucket.tokens = Math.min(bucket.burst, bucket.tokens + elapsedSeconds * bucket.rate);
  bucket.updatedAt = now;
  if (bucket.tokens < 1) return false;
  bucket.tokens -= 1;
  return true;
}

function createSimWebSocketAdapter(options = {}) {
  const server = options.server;
  if (!server || typeof server.on !== "function" || typeof server.removeListener !== "function") {
    throw new TypeError("server must be an injected http.Server");
  }
  const redeemHello = requiredCallback(options.redeemHello, "redeemHello");
  const revalidateBinding = requiredCallback(options.revalidateBinding, "revalidateBinding");
  const onInput = requiredCallback(options.onInput, "onInput");
  const onAction = requiredCallback(options.onAction, "onAction");
  const buildPublicState = requiredCallback(options.buildPublicState, "buildPublicState");
  const buildOwnerState = requiredCallback(options.buildOwnerState, "buildOwnerState");
  const onPong = typeof options.onPong === "function" ? options.onPong : async () => {};
  const onAck = typeof options.onAck === "function" ? options.onAck : async () => {};
  const now = typeof options.now === "function" ? options.now : Date.now;
  const path = typeof options.path === "string" && options.path.startsWith("/") ? options.path : DEFAULTS.path;
  const helloTimeoutMs = positiveInteger(options.helloTimeoutMs, DEFAULTS.helloTimeoutMs, "helloTimeoutMs");
  const heartbeatIntervalMs = positiveInteger(
    options.heartbeatIntervalMs,
    DEFAULTS.heartbeatIntervalMs,
    "heartbeatIntervalMs",
  );
  const backpressureTimeoutMs = positiveInteger(
    options.backpressureTimeoutMs,
    DEFAULTS.backpressureTimeoutMs,
    "backpressureTimeoutMs",
  );
  const shutdownTimeoutMs = positiveInteger(options.shutdownTimeoutMs, DEFAULTS.shutdownTimeoutMs, "shutdownTimeoutMs");
  const queueOptions = Object.freeze({ ...(options.queueOptions || {}) });
  const connections = new Set();
  const byBinding = new Map();
  const wss = new WebSocketServer({ noServer: true, perMessageDeflate: false, maxPayload: LIMITS.maxFrameBytes });
  let closed = false;
  let currentRunId = options.runId || null;
  let heartbeatCounter = 0;

  function rejectUpgrade(socket, status = "404 Not Found") {
    if (!socket.destroyed) socket.end(`HTTP/1.1 ${status}\r\nConnection: close\r\nContent-Length: 0\r\n\r\n`);
  }

  function handleUpgrade(request, socket, head) {
    if (closed) return rejectUpgrade(socket, "503 Service Unavailable");
    let target;
    try {
      target = new URL(request.url, "http://localhost");
    } catch {
      return rejectUpgrade(socket, "400 Bad Request");
    }
    if (target.pathname !== path || target.search) return rejectUpgrade(socket);
    wss.handleUpgrade(request, socket, head, (ws) => wss.emit("connection", ws, request));
  }

  async function isBindingCurrent(state, purpose) {
    if (!state.bound || state.closing) return false;
    try {
      return (await revalidateBinding(state.binding, { purpose })) !== false;
    } catch {
      return false;
    }
  }

  function sendWire(state, wire) {
    if (state.cleaned || state.ws.readyState !== WebSocket.OPEN) return false;
    state.pendingSends += 1;
    state.ws.send(wire, (error) => {
      state.pendingSends = Math.max(0, state.pendingSends - 1);
      if (error) terminate(state);
      else flush(state);
    });
    return true;
  }

  function sendFrame(state, frame) {
    try {
      return sendWire(state, encodeWireFrame(frame, { direction: SERVER_TO_CLIENT }));
    } catch {
      terminate(state);
      return false;
    }
  }

  function sendApplicationClose(state, code, reason, reconnectable, retryAfterMs) {
    const closeFrame = { type: "close", code, reason, reconnectable };
    if (retryAfterMs !== undefined) closeFrame.retryAfterMs = retryAfterMs;
    sendFrame(state, closeFrame);
    if (state.ws.readyState === WebSocket.OPEN || state.ws.readyState === WebSocket.CONNECTING) {
      state.ws.close(code, reason);
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
    clearTimeout(state.helloTimer);
    connections.delete(state);
    if (state.binding !== null && byBinding.get(state.binding) === state) byBinding.delete(state.binding);
    state.queue.reset();
  }

  function terminate(state) {
    if (state.cleaned) return;
    state.closing = true;
    if (state.ws.readyState !== WebSocket.CLOSED) state.ws.terminate();
    cleanup(state);
  }

  function queueOutcome(state, outcome, rebaseWatermarks = null) {
    if (!outcome || outcome.action === "queued" || outcome.action === "coalesced" || outcome.action === "ignore") return;
    if (outcome.action === "rebase") {
      const binding = state.binding;
      const runId = rebaseWatermarks?.runId || binding?.runId || currentRunId;
      const snapshotId = Math.max(1, Number(rebaseWatermarks?.snapshotId || binding?.snapshotId) || 1);
      const lastEventSeq = Math.max(0, Number(rebaseWatermarks?.lastEventSeq ?? binding?.lastEventSeq) || 0);
      sendFrame(state, { type: "rebase", runId, reason: "server-recovery", snapshotId, lastEventSeq });
      state.queue.clearRebase();
      return;
    }
    if (outcome.action === "disconnect") {
      state.closing = true;
      sendApplicationClose(state, 4008, "queue policy", true, 250);
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
      const drained = state.queue.drain();
      if (drained.action === "pause") return;
      for (const message of drained.messages) {
        if (message.lane === "state") {
          for (const frame of message.envelope.frames) {
            const wire = encodeWireFrame(frame, { direction: SERVER_TO_CLIENT });
            if (!sendWire(state, wire)) break;
          }
        } else if (!sendWire(state, encodeWireFrame(message.envelope, { direction: SERVER_TO_CLIENT }))) {
          break;
        }
      }
    } catch (error) {
      failConnection(state, error);
    } finally {
      state.flushing = false;
    }
  }

  function enqueueReliableState(state, frame) {
    if (state.closing) return { accepted: false, action: "disconnect", reason: "connection-closing" };
    const nextId = state.queue.status().highestIssuedReliableId + 1;
    const retainedFrame = frame.deliveryId === undefined ? { ...frame, deliveryId: nextId } : frame;
    encodeWireFrame(retainedFrame, { direction: SERVER_TO_CLIENT });
    const result = state.queue.enqueueConsequence(retainedFrame, { reliableId: retainedFrame.deliveryId });
    queueOutcome(state, result);
    flush(state);
    return result.accepted ? { ...result, frame: retainedFrame } : result;
  }

  async function handleHello(state, frame) {
    if (state.bound) throw new WireProtocolError("duplicate-hello", "hello is only valid once", 4400);
    const result = await redeemHello(frame);
    if (!result || typeof result !== "object" || !result.binding || !result.welcome || !result.rebase) {
      throw Object.assign(new Error("invalid hello redemption"), { code: "admission-rejected", closeCode: 4401 });
    }
    encodeWireFrame(result.welcome, { direction: SERVER_TO_CLIENT });
    encodeWireFrame(result.rebase, { direction: SERVER_TO_CLIENT });
    state.binding = result.binding;
    state.bound = true;
    state.heartbeatIntervalMs = result.welcome.heartbeatIntervalMs;
    state.nextHeartbeatAt = now() + state.heartbeatIntervalMs;
    clearTimeout(state.helloTimer);
    const prior = byBinding.get(state.binding);
    if (prior && prior !== state) {
      prior.closing = true;
      sendApplicationClose(prior, 4003, "connection replaced", true);
    }
    byBinding.set(state.binding, state);
    currentRunId = result.welcome.runId;
    if (!(await isBindingCurrent(state, "private-welcome"))) {
      throw Object.assign(new Error("redeemed binding is no longer current"), { code: "connection-fenced", closeCode: 4003 });
    }
    sendFrame(state, result.welcome);
    sendFrame(state, result.rebase);
  }

  async function handleBoundFrame(state, frame) {
    if (!(await isBindingCurrent(state, `inbound:${frame.type}`))) {
      state.closing = true;
      return sendApplicationClose(state, 4003, "connection fenced", true);
    }
    if (frame.type === "input") {
      if (!consumeBucket(state.inputBucket, now())) {
        state.closing = true;
        return sendApplicationClose(state, 4008, "input rate exceeded", true, 250);
      }
      const reply = await onInput(state.binding, frame);
      if (reply && await isBindingCurrent(state, "private-input-ack")) sendFrame(state, reply.frame || reply);
      else if (reply) {
        state.closing = true;
        sendApplicationClose(state, 4003, "connection fenced", true);
      }
      return;
    }
    if (frame.type === "action") {
      if (!consumeBucket(state.actionBucket, now())) {
        state.closing = true;
        return sendApplicationClose(state, 4008, "action rate exceeded", true, 250);
      }
      const reply = await onAction(state.binding, frame);
      if (reply && await isBindingCurrent(state, "private-action-ack")) enqueueReliableState(state, reply.frame || reply);
      else if (reply) {
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
      await onPong(state.binding, frame);
      return;
    }
    if (frame.type === "ack") {
      if (frame.ackKind === "delivery") queueOutcome(state, state.queue.acknowledge(frame.deliveryId));
      await onAck(state.binding, frame);
      flush(state);
      return;
    }
    throw new WireProtocolError("unexpected-frame", `unexpected ${frame.type} frame`, 4400);
  }

  function connection(ws) {
    const timestamp = now();
    const state = {
      ws,
      queue: createMultiplayerSendQueue(queueOptions),
      binding: null,
      bound: false,
      closing: false,
      cleaned: false,
      flushing: false,
      pendingSends: 0,
      backpressuredSince: null,
      heartbeatIntervalMs,
      nextHeartbeatAt: timestamp + heartbeatIntervalMs,
      pendingHeartbeat: null,
      inputBucket: createBucket(40, 12, timestamp),
      actionBucket: createBucket(10, 8, timestamp),
      helloTimer: null,
    };
    connections.add(state);
    state.helloTimer = setTimeout(() => {
      if (!state.bound && !state.closing) {
        state.closing = true;
        sendApplicationClose(state, 4401, "hello timeout", true);
      }
    }, helloTimeoutMs);
    state.helloTimer.unref?.();
    ws.on("message", (raw, isBinary) => {
      Promise.resolve().then(async () => {
        if (state.closing) return;
        if (isBinary) throw new WireProtocolError("binary-frame", "binary application frames are not supported", 4403);
        const frame = parseWireFrame(raw, { direction: CLIENT_TO_SERVER });
        if (!state.bound) {
          if (frame.type !== "hello") throw new WireProtocolError("hello-required", "first frame must be hello", 4401);
          await handleHello(state, frame);
        } else {
          await handleBoundFrame(state, frame);
        }
      }).catch((error) => failConnection(state, error));
    });
    ws.on("close", () => cleanup(state));
    ws.on("error", () => terminate(state));
  }

  async function projectNow(context = {}) {
    if (closed) return { projected: 0, skipped: connections.size };
    const publicFrame = await buildPublicState(context);
    encodeWireFrame(publicFrame, { direction: SERVER_TO_CLIENT });
    let projected = 0;
    let skipped = 0;
    for (const state of [...connections]) {
      if (!(await isBindingCurrent(state, "private-project"))) {
        skipped += 1;
        state.closing = true;
        sendApplicationClose(state, 4003, "connection fenced", true);
        continue;
      }
      try {
        const ownerFrame = await buildOwnerState(state.binding, publicFrame, context);
        encodeWireFrame(ownerFrame, { direction: SERVER_TO_CLIENT });
        for (const watermark of [
          "runId", "snapshotId", "tick", "simTime", "lastEventSeq", "fieldRevision", "overloadMode",
        ]) {
          if (ownerFrame[watermark] !== publicFrame[watermark]) {
            throw Object.assign(new Error("projection watermark mismatch"), { code: "projection-watermark-mismatch" });
          }
        }
        if (!(await isBindingCurrent(state, "private-project-send"))) {
          state.closing = true;
          sendApplicationClose(state, 4003, "connection fenced", true);
          skipped += 1;
          continue;
        }
        const outcome = state.queue.enqueueState(publicFrame.snapshotId, {
          kind: "state-pair",
          frames: [publicFrame, ownerFrame],
        });
        queueOutcome(state, outcome, publicFrame);
        flush(state);
        if (outcome.accepted) projected += 1;
        else skipped += 1;
      } catch (error) {
        skipped += 1;
        failConnection(state, error, { fatal: false });
      }
    }
    return { projected, skipped, snapshotId: publicFrame.snapshotId };
  }

  async function enqueueReliable(binding, frame) {
    const state = byBinding.get(binding);
    if (!state) return { accepted: false, action: "ignore", reason: "binding-not-connected" };
    if (!(await isBindingCurrent(state, "private-reliable-send"))) {
      state.closing = true;
      sendApplicationClose(state, 4003, "connection fenced", true);
      return { accepted: false, action: "disconnect", reason: "connection-fenced" };
    }
    return enqueueReliableState(state, frame);
  }

  async function broadcastReliable(frameFactory) {
    const results = [];
    for (const state of connections) {
      if (!state.bound || state.closing) continue;
      if (!(await isBindingCurrent(state, "private-reliable-send"))) {
        state.closing = true;
        sendApplicationClose(state, 4003, "connection fenced", true);
        results.push({ accepted: false, action: "disconnect", reason: "connection-fenced" });
        continue;
      }
      const frame = typeof frameFactory === "function" ? frameFactory(state.binding) : frameFactory;
      if (frame) results.push(enqueueReliableState(state, frame));
    }
    return results;
  }

  function rotateRun(nextRunId) {
    currentRunId = nextRunId || null;
    let fenced = 0;
    for (const state of [...connections]) {
      state.queue.reset();
      if (state.bound && !state.closing) {
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
      if (!state.bound || state.closing) continue;
      const queueStatus = state.queue.observeTransportBufferedBytes(state.ws.bufferedAmount);
      if (queueStatus.backpressured) state.backpressuredSince ??= timestamp;
      else state.backpressuredSince = null;
      if (state.backpressuredSince !== null && timestamp - state.backpressuredSince >= backpressureTimeoutMs) {
        state.closing = true;
        sendApplicationClose(state, 4008, "backpressure timeout", true, 250);
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

  const heartbeatTimer = setInterval(heartbeatSweep, Math.min(heartbeatIntervalMs, backpressureTimeoutMs));
  heartbeatTimer.unref?.();
  server.on("upgrade", handleUpgrade);
  wss.on("connection", connection);

  function diagnostics() {
    let bound = 0;
    let queuedMessages = 0;
    let queuedBytes = 0;
    let backpressured = 0;
    for (const state of connections) {
      const status = state.queue.status();
      if (state.bound) bound += 1;
      queuedMessages += status.queuedMessages;
      queuedBytes += status.queuedBytes;
      if (status.backpressured) backpressured += 1;
    }
    return Object.freeze({
      path,
      closed,
      currentRunId,
      connections: connections.size,
      bound,
      queuedMessages,
      queuedBytes,
      backpressured,
      helloTimers: [...connections].filter((state) => !state.bound).length,
      livenessTimers: closed ? 0 : 1,
    });
  }

  async function shutdown() {
    if (closed) return diagnostics();
    closed = true;
    clearInterval(heartbeatTimer);
    server.removeListener("upgrade", handleUpgrade);
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
    broadcastReliable,
    rotateRun,
    diagnostics,
    shutdown,
  });
}

module.exports = {
  DEFAULTS,
  createSimWebSocketAdapter,
};
