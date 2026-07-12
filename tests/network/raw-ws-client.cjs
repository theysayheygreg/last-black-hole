"use strict";

const { WebSocket } = require("ws");
const { WIRE_PROTOCOL_VERSION } = require("../../scripts/multiplayer-wire-protocol.cjs");
const { PROTOCOL_VERSION } = require("../../scripts/sim-protocol.cjs");

function waitFor(check, label, timeoutMs = 10000) {
  const deadline = Date.now() + timeoutMs;
  return new Promise((resolve, reject) => {
    const poll = async () => {
      let value;
      try { value = await check(); } catch (error) { reject(error); return; }
      if (value) { resolve(value); return; }
      if (Date.now() >= deadline) { reject(new Error(`Timed out waiting for ${label}`)); return; }
      setTimeout(poll, 10);
    };
    poll();
  });
}

async function openRawClient({ port, ticket, pilotSlot, record, maxFrames = 10000,
  kind = "admission", cursors = {}, shouldWithholdEventAck = null }) {
  const client = {
    pilotSlot,
    ws: new WebSocket(`ws://127.0.0.1:${port}/stream`, { perMessageDeflate: false }),
    frames: [], rawBytes: 0, receiveCount: 0, close: null, error: null,
    lastHeartbeat: null, lastSnapshotAck: 0, paused: false, sentBytes: 0, sentFrames: 0,
  };
  const send = (frame) => sendRawClientFrame(client, frame);
  client.ws.on("error", (error) => { client.error = error.message; });
  client.ws.on("close", (code, reason) => { client.close = { code, reason: reason.toString("utf8"), at: Date.now() }; });
  client.ws.on("message", (raw) => {
    const text = raw.toString("utf8");
    const frame = JSON.parse(text);
    if (client.frames.length >= maxFrames) {
      client.error = `raw frame cap exceeded (${maxFrames})`;
      client.ws.terminate();
      return;
    }
    client.rawBytes += Buffer.byteLength(text);
    client.receiveCount += 1;
    client.frames.push({ ...frame, _receivedAt: Date.now(), _bytes: Buffer.byteLength(text) });
    record({ type: "frame", pilotSlot, frameType: frame.type, at: Date.now(), bytes: Buffer.byteLength(text),
      snapshotId: frame.snapshotId ?? null, eventSeq: frame.eventSeq ?? null, deliveryId: frame.deliveryId ?? null });
    if (frame.type === "heartbeat" && client.ws.readyState === WebSocket.OPEN) {
      send({ type: "pong", heartbeatId: frame.heartbeatId, clientTimeMs: Date.now() });
      client.lastHeartbeat = { heartbeatId: frame.heartbeatId, pongAt: Date.now() };
      record({ type: "pong", pilotSlot, at: client.lastHeartbeat.pongAt });
    }
    if (frame.type === "ownerState" && client.lastSnapshotAck === 0) {
      const rebase = [...client.frames].reverse().find((entry) => entry.type === "rebase");
      send({ type: "ack", ackKind: "baseline", snapshotId: frame.snapshotId,
        eventSeq: rebase?.lastEventSeq || 0 });
      record({ type: "baseline-ack", pilotSlot, at: Date.now(), snapshotId: frame.snapshotId,
        eventSeq: rebase?.lastEventSeq || 0 });
      client.lastSnapshotAck = frame.snapshotId;
    }
    if (frame.type === "event") {
      const withheld = shouldWithholdEventAck
        ? shouldWithholdEventAck({ frame, pilotSlot, client }) === true : false;
      if (shouldWithholdEventAck) {
        record({ type: "event-ack-decision", pilotSlot, at: Date.now(), eventSeq: frame.eventSeq,
          deliveryId: frame.deliveryId, withheld });
      }
      if (withheld) return;
      send({ type: "ack", ackKind: "delivery", deliveryId: frame.deliveryId });
      record({ type: "delivery-ack", pilotSlot, at: Date.now(), deliveryId: frame.deliveryId,
        eventSeq: frame.eventSeq });
      send({ type: "ack", ackKind: "event", eventSeq: frame.eventSeq });
      record({ type: "event-ack", pilotSlot, at: Date.now(), deliveryId: frame.deliveryId,
        eventSeq: frame.eventSeq });
    }
  });
  await waitFor(() => client.ws.readyState === WebSocket.OPEN || client.error, `${pilotSlot} socket open`);
  if (client.error) throw new Error(`${pilotSlot} open error: ${client.error}`);
  send({ type: "hello", wireVersion: WIRE_PROTOCOL_VERSION,
    simProtocolVersion: PROTOCOL_VERSION,
    [kind === "resume" ? "resumeTicket" : "admissionTicket"]: ticket,
    ...cursors });
  await waitFor(() => client.frames.some((frame) => frame.type === "welcome") || client.close, `${pilotSlot} welcome`);
  if (client.close) throw new Error(`${pilotSlot} closed before welcome: ${JSON.stringify(client.close)}`);
  await waitFor(() => client.frames.some((frame) => frame.type === "publicState")
    && client.frames.some((frame) => frame.type === "ownerState"), `${pilotSlot} baseline`);
  if (client.close) throw new Error(`${pilotSlot} closed during baseline: ${JSON.stringify(client.close)}`);
  return client;
}

function sendRawClientFrame(client, frame) {
  const wire = typeof frame === "string" ? frame : JSON.stringify(frame);
  client.sentBytes += Buffer.byteLength(wire);
  client.sentFrames += 1;
  client.ws.send(wire);
}

async function pauseAfterAuthorityPong(client, authorityPong, guardMs, record) {
  const socket = client.ws._socket;
  if (!socket || typeof socket.pause !== "function") throw new Error("Node ws private socket pause seam unavailable");
  const pauseAt = Date.now();
  if (pauseAt - authorityPong.timestamp > 250) throw new Error("read pause missed authority-pong +250ms bound");
  socket.pause();
  client.paused = true;
  record({ type: "pause-dispatched", pilotSlot: client.pilotSlot, authorityPongAt: authorityPong.timestamp,
    nextHeartbeatTimeoutEligibleAt: authorityPong.nextHeartbeatTimeoutEligibleAt, at: pauseAt,
    bytesRead: socket.bytesRead, receiveCount: client.receiveCount, isPaused: socket.isPaused(),
    readableFlowing: socket.readableFlowing });
  let previousBytes = socket.bytesRead;
  let stableSince = Date.now();
  const settleDeadline = Date.now() + 5000;
  while (Date.now() < settleDeadline && Date.now() - stableSince < 300) {
    await new Promise((resolve) => setTimeout(resolve, 10));
    if (socket.bytesRead !== previousBytes) { previousBytes = socket.bytesRead; stableSince = Date.now(); }
  }
  if (Date.now() >= settleDeadline) throw new Error("paused socket did not settle into a stable read gate");
  const before = { bytesRead: socket.bytesRead, receiveCount: client.receiveCount, at: Date.now() };
  record({ type: "pause-guard-start", pilotSlot: client.pilotSlot, ...before });
  await new Promise((resolve) => setTimeout(resolve, guardMs));
  const after = { bytesRead: socket.bytesRead, receiveCount: client.receiveCount, at: Date.now(),
    isPaused: socket.isPaused(), readableFlowing: socket.readableFlowing };
  record({ type: "pause-guard", pilotSlot: client.pilotSlot, ...after });
  if (!after.isPaused || after.readableFlowing !== false || after.bytesRead !== before.bytesRead
    || after.receiveCount !== before.receiveCount) {
    throw new Error(`read-gate guard failed: ${JSON.stringify({ before, after, authorityPong })}`);
  }
  return { before, after };
}

function resume(client, record) {
  client.ws._socket.resume();
  client.paused = false;
  record({ type: "resume", pilotSlot: client.pilotSlot, at: Date.now(), bytesRead: client.ws._socket.bytesRead });
}

async function closeRawClient(client) {
  if (!client) return;
  if (client.paused) client.ws._socket?.resume();
  if (client.ws.readyState === WebSocket.CLOSED) return;
  client.ws.close(1000, "test complete");
  await waitFor(() => client.close, `${client.pilotSlot} close`, 1500).catch(() => client.ws.terminate());
}

function terminateRawClient(client) {
  if (!client || client.ws.readyState === WebSocket.CLOSED) return;
  client.paused = false;
  client.ws.terminate();
}

module.exports = { waitFor, openRawClient, sendRawClientFrame, pauseAfterAuthorityPong, resume, closeRawClient, terminateRawClient };
