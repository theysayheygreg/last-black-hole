#!/usr/bin/env node
"use strict";

const crypto = require("crypto");
const { monitorEventLoopDelay, performance } = require("perf_hooks");
const { WebSocket } = require("ws");
const { createClientDeltaReceiver, MIXED_CAPABILITY,
  RUNTIME_PUBLIC_COMPONENTS_CAPABILITY, POSITIONAL_CODEC_CAPABILITY } =
  require("../../scripts/client-delta-receiver.cjs");
const { projectionHash } = require("../../scripts/canonical-structural-delta.cjs");
const { WIRE_PROTOCOL_VERSION_V2, SIM_PROTOCOL_VERSION, SERVER_TO_CLIENT,
  encodeWireFrame, parseWireFrame } = require("../../scripts/multiplayer-wire-protocol.cjs");
const { codecContext: positionalCodecContext, POSITIONAL_CODEC_MANIFEST,
  POSITIONAL_CODEC_MANIFEST_HASH } = require("../../scripts/state-pair-positional-codec.cjs");
const { canonicalJsonBytes } = require("../../scripts/session-replication-manifest.cjs");
const { distribution } = require("./state-pair-product-metrics.cjs");

const INPUT_HZ = 10;
const capabilities = ["static-manifest-v1", "state-pair-v1", MIXED_CAPABILITY,
  RUNTIME_PUBLIC_COMPONENTS_CAPABILITY, POSITIONAL_CODEC_CAPABILITY];
const eventLoop = monitorEventLoopDelay({ resolution: 20 });
eventLoop.enable();

let state = null;
let inputTimer = null;
let measuring = false;
let measurement = null;

function reply(requestId, result, error = null) {
  process.send?.({ requestId, ...(error ? { error } : { result }) });
}

async function request(port, pathname, { method = "GET", body, authority, headers = {} } = {}) {
  const requestHeaders = { "content-type": "application/json", connection: "close", ...headers };
  if (authority) {
    requestHeaders["x-lbh-command-credential"] = authority.commandCredential;
    requestHeaders["x-lbh-player-id"] = authority.playerId;
    requestHeaders["x-lbh-run-id"] = authority.runId;
  }
  const response = await fetch(`http://127.0.0.1:${port}${pathname}`, {
    method, headers: requestHeaders, body: body === undefined ? undefined : JSON.stringify(body),
  });
  const bytes = Buffer.from(await response.arrayBuffer());
  let responseBody = null;
  if (bytes.length) {
    try { responseBody = JSON.parse(bytes.toString("utf8")); } catch {}
  }
  return { status: response.status, body: responseBody, bytes };
}

function waitFor(check, label, timeoutMs = 12_000) {
  return new Promise((resolve, reject) => {
    const started = Date.now();
    const timer = setInterval(() => {
      const result = check();
      if (result) {
        clearInterval(timer);
        resolve(result);
      } else if (Date.now() - started >= timeoutMs) {
        clearInterval(timer);
        reject(new Error(`Timed out waiting for ${label}`));
      }
    }, 20);
  });
}

function send(frame) {
  if (!state || state.ws.readyState !== WebSocket.OPEN) return false;
  const wire = encodeWireFrame(frame, state.codecContext
    ? { positionalContext: state.codecContext } : undefined);
  state.ws.send(wire);
  if (measuring) {
    measurement.uplinkFrames += 1;
    measurement.uplinkBytes += Buffer.byteLength(wire, "utf8");
    measurement.maxBufferedAmount = Math.max(measurement.maxBufferedAmount,
      Number(state.ws.bufferedAmount) || 0);
  }
  return true;
}

function resetMeasurement() {
  eventLoop.reset();
  measurement = {
    startedAt: Date.now(), cpuStart: process.cpuUsage(), acceptedEvents: [],
    decodeMs: [], applyMs: [], ackMs: [], uplinkFrames: 0, uplinkBytes: 0,
    maxBufferedAmount: Number(state?.ws?.bufferedAmount) || 0,
    inputSteps: 0, errors: [],
  };
  measuring = true;
  return measurement.startedAt;
}

function eventLoopSnapshot() {
  const milliseconds = (value) => Number.isFinite(value) ? value / 1e6 : null;
  return { unit: "milliseconds", minMs: milliseconds(eventLoop.min),
    meanMs: milliseconds(eventLoop.mean), p50Ms: milliseconds(eventLoop.percentile(50)),
    p95Ms: milliseconds(eventLoop.percentile(95)), p99Ms: milliseconds(eventLoop.percentile(99)),
    maxMs: milliseconds(eventLoop.max) };
}

function stopMeasurement() {
  measuring = false;
  const endedAt = Date.now();
  const cpu = process.cpuUsage(measurement.cpuStart);
  const wallUs = Math.max(1, (endedAt - measurement.startedAt) * 1000);
  return {
    label: state.label, pid: process.pid, startedAt: measurement.startedAt, endedAt,
    durationSeconds: (endedAt - measurement.startedAt) / 1000,
    acceptedPairCount: measurement.acceptedEvents.length,
    acceptedPairBytes: measurement.acceptedEvents.reduce((sum, event) => sum + event.bytes, 0),
    acceptedEvents: measurement.acceptedEvents,
    acceptedPairEvents: state.acceptedPairEvents,
    decodeMs: distribution(measurement.decodeMs), applyMs: distribution(measurement.applyMs),
    ackSerializeSendMs: distribution(measurement.ackMs),
    uplinkFrames: measurement.uplinkFrames, uplinkBytes: measurement.uplinkBytes,
    maxBufferedAmount: measurement.maxBufferedAmount, inputSteps: measurement.inputSteps,
    cpuUsage: { ...cpu, totalMicroseconds: cpu.user + cpu.system,
      oneCoreFraction: (cpu.user + cpu.system) / wallUs },
    eventLoopDelay: eventLoopSnapshot(), errors: [...measurement.errors],
    receiver: state.receiver.diagnostics(),
  };
}

function startInputs() {
  if (inputTimer) return;
  let step = 0;
  inputTimer = setInterval(() => {
    if (!state || state.ws.readyState !== WebSocket.OPEN) return;
    const phase = ((step + state.seat * 7) % 64) / 64 * Math.PI * 2;
    send({ type: "input", inputSeq: ++state.inputSeq,
      moveX: Number(Math.cos(phase).toFixed(6)), moveY: Number(Math.sin(phase).toFixed(6)),
      thrust: step % 5 !== 0 ? 1 : 0, brake: step % 29 === 0 ? 1 : 0,
      slingshot: false, ability1: false, ability2: false, clientTimeMs: Date.now() });
    if (step > 0 && step % (15 * INPUT_HZ) === 0) {
      send({ type: "action", actionId: `${state.label}-pulse-${step}`,
        actionSeq: ++state.actionSeq, commandSeq: ++state.commandSeq,
        actionKind: "pulse", payload: {}, clientTimeMs: Date.now() });
    }
    if (measuring) measurement.inputSteps += 1;
    step += 1;
  }, 1000 / INPUT_HZ);
}

async function initialize(config) {
  const issued = await request(config.port, "/multiplayer/ticket", {
    method: "POST", authority: config.authority, body: {
      kind: "admission", supportedVersions: [WIRE_PROTOCOL_VERSION_V2], capabilities,
    },
  });
  if (issued.status !== 200 || !capabilities.every((capability) =>
    issued.body.capabilities.includes(capability))) {
    throw new Error(`state-pair ticket failed: ${JSON.stringify(issued.body)}`);
  }
  state = {
    ...config, ticket: issued.body, ws: new WebSocket(`ws://127.0.0.1:${config.port}/stream`,
      { perMessageDeflate: false }), codecContext: null, receiver: null, welcome: null,
    inputSeq: 0, actionSeq: 0, commandSeq: 0, acceptedPairs: 0,
    acceptedPairEvents: [], error: null, close: null,
  };
  state.ws.on("error", (error) => { state.error = error.message; });
  state.ws.on("close", (code, reason) => {
    state.close = { code, reason: reason.toString("utf8"), at: Date.now() };
  });
  state.ws.on("message", (raw) => {
    try {
      const text = raw.toString("utf8");
      const decodeStarted = performance.now();
      const frame = text.startsWith("[")
        ? parseWireFrame(text, { direction: SERVER_TO_CLIENT,
            positionalContext: state.codecContext, requirePositional: true })
        : parseWireFrame(text, { direction: SERVER_TO_CLIENT });
      if (measuring && text.startsWith("[")) measurement.decodeMs.push(performance.now() - decodeStarted);
      if (frame.type === "welcome") {
        state.welcome = frame;
        state.inputSeq = frame.lastInputSeq;
        state.actionSeq = frame.lastActionSeq;
        state.commandSeq = frame.lastCommandSeq;
        state.codecContext = positionalCodecContext({
          matchId: frame.runId, sessionId: frame.connectionId,
          authorityIncarnation: frame.authorityIncarnation, recipientId: frame.membershipId,
          recipientIncarnation: frame.connectionEpoch, manifestHash: frame.manifestHash,
          codecManifestHash: POSITIONAL_CODEC_MANIFEST_HASH,
        });
        state.receiver = createClientDeltaReceiver({ context: {
          matchId: frame.runId, sessionId: frame.connectionId,
          authorityIncarnation: frame.authorityIncarnation, recipientId: frame.membershipId,
          recipientIncarnation: frame.connectionEpoch, manifestSchema: frame.manifestSchema,
          manifestHash: frame.manifestHash,
        }, capabilities: issued.body.capabilities });
        return;
      }
      if (frame.type === "heartbeat") {
        send({ type: "pong", heartbeatId: frame.heartbeatId, clientTimeMs: Date.now() });
        return;
      }
      if (frame.type === "event") {
        send({ type: "ack", ackKind: "delivery", deliveryId: frame.deliveryId });
        send({ type: "ack", ackKind: "event", eventSeq: frame.eventSeq });
        return;
      }
      if (frame.type === "ack" && frame.ackKind === "action" && Number.isSafeInteger(frame.deliveryId)) {
        send({ type: "ack", ackKind: "delivery", deliveryId: frame.deliveryId });
        return;
      }
      if (frame.type === "error") throw new Error(`${frame.code}:${frame.message}`);
      if (frame.type !== "statePair") return;
      const applyStarted = performance.now();
      const outcome = state.receiver.receive(text);
      if (measuring) measurement.applyMs.push(performance.now() - applyStarted);
      if (!outcome.accepted) {
        if (outcome.recovery) send(outcome.recovery);
        if (measuring) measurement.errors.push(`receiver:${outcome.reason}`);
        return;
      }
      if (projectionHash(outcome.state.public) !== outcome.ack.publicHash
          || projectionHash(outcome.state.owner) !== outcome.ack.ownerHash) {
        throw new Error("materialized authority/client projection hash mismatch");
      }
      if (outcome.published !== false) {
        state.acceptedPairs += 1;
        const event = { at: Date.now(), frameId: outcome.state.frameId,
          bytes: Buffer.byteLength(text, "utf8") };
        state.acceptedPairEvents.push(event);
        if (measuring) measurement.acceptedEvents.push(event);
      }
      const ackStarted = performance.now();
      send(outcome.ack);
      if (measuring) measurement.ackMs.push(performance.now() - ackStarted);
    } catch (error) {
      state.error = error.message;
      if (measuring) measurement.errors.push(error.message);
      state.ws.terminate();
    }
  });
  await new Promise((resolve, reject) => {
    state.ws.once("open", resolve);
    state.ws.once("error", reject);
  });
  send({ type: "hello", wireVersion: issued.body.wireVersion,
    simProtocolVersion: SIM_PROTOCOL_VERSION, admissionTicket: issued.body.ticket,
    capabilities: issued.body.capabilities, manifestSchema: issued.body.manifestSchema,
    manifestHash: issued.body.manifestHash });
  await waitFor(() => state.welcome || state.error || state.close, `${state.label} welcome`);
  if (!state.welcome) throw new Error(state.error || JSON.stringify(state.close));
  const fetched = await request(config.port, issued.body.fetchPath, {
    headers: { authorization: `Bearer ${issued.body.manifestCapability}` },
  });
  const sessionManifest = JSON.parse(fetched.bytes.toString("utf8"));
  const codec = sessionManifest.publicContent?.statePairCodec;
  const codecHash = codec?.manifest
    ? `sha256:${crypto.createHash("sha256").update(canonicalJsonBytes(codec.manifest)).digest("hex")}` : null;
  if (fetched.status !== 200 || fetched.bytes.length !== issued.body.manifestBytes
      || codec?.capability !== POSITIONAL_CODEC_CAPABILITY
      || codec?.codecManifestHash !== POSITIONAL_CODEC_MANIFEST_HASH
      || codecHash !== POSITIONAL_CODEC_MANIFEST_HASH
      || !canonicalJsonBytes(codec.manifest).equals(canonicalJsonBytes(POSITIONAL_CODEC_MANIFEST))) {
    throw new Error("content-addressed positional codec manifest verification failed");
  }
  send({ type: "manifestAck", manifestSchema: issued.body.manifestSchema,
    manifestHash: issued.body.manifestHash, manifestBytes: issued.body.manifestBytes,
    connectionEpoch: state.welcome.connectionEpoch });
  await waitFor(() => state.acceptedPairs > 0 || state.error || state.close,
    `${state.label} first state pair`);
  if (state.error || state.close) throw new Error(state.error || JSON.stringify(state.close));
  startInputs();
  return { label: state.label, pid: process.pid, membershipId: state.welcome.membershipId,
    connectionEpoch: state.welcome.connectionEpoch, acceptedPairs: state.acceptedPairs };
}

async function shutdown() {
  if (inputTimer) clearInterval(inputTimer);
  inputTimer = null;
  if (state?.ws && state.ws.readyState !== WebSocket.CLOSED) {
    state.ws.close(1000, "attribution complete");
    await waitFor(() => state.close, `${state.label} close`, 1500)
      .catch(() => state.ws.terminate());
  }
  state?.receiver?.teardown();
  eventLoop.disable();
  return { label: state?.label || null, closed: true };
}

process.on("message", async (message) => {
  const { requestId, command } = message || {};
  try {
    if (command === "init") reply(requestId, await initialize(message.config));
    else if (command === "measure-start") reply(requestId, { startedAt: resetMeasurement() });
    else if (command === "measure-stop") reply(requestId, stopMeasurement());
    else if (command === "shutdown") {
      reply(requestId, await shutdown());
      setImmediate(() => process.exit(0));
    } else throw new Error(`unsupported command ${command}`);
  } catch (error) {
    reply(requestId, null, String(error.stack || error.message));
  }
});

process.on("disconnect", () => shutdown().finally(() => process.exit(0)));
