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

async function openRawClient({ port, ticket, pilotSlot, record }) {
  const client = {
    pilotSlot,
    ws: new WebSocket(`ws://127.0.0.1:${port}/stream`, { perMessageDeflate: false }),
    frames: [], rawBytes: 0, receiveCount: 0, close: null, error: null,
    lastHeartbeat: null, lastSnapshotAck: 0, paused: false,
    pauseRequested: false, pauseCapture: null,
  };
  client.ws.on("error", (error) => { client.error = error.message; });
  client.ws.on("close", (code, reason) => { client.close = { code, reason: reason.toString("utf8"), at: Date.now() }; });
  client.ws.on("message", (raw) => {
    const text = raw.toString("utf8");
    const frame = JSON.parse(text);
    client.rawBytes += Buffer.byteLength(text);
    client.receiveCount += 1;
    client.frames.push({ ...frame, _receivedAt: Date.now(), _bytes: Buffer.byteLength(text) });
    record({ type: "frame", pilotSlot, frameType: frame.type, at: Date.now(), bytes: Buffer.byteLength(text),
      snapshotId: frame.snapshotId ?? null, eventSeq: frame.eventSeq ?? null, deliveryId: frame.deliveryId ?? null });
    if (frame.type === "heartbeat" && client.ws.readyState === WebSocket.OPEN) {
      if (client.pauseRequested && !client.paused) {
        const socket = client.ws._socket;
        socket.pause();
        client.paused = true;
        const settle = async () => {
          let previous = socket.bytesRead;
          let stableSince = Date.now();
          const deadline = Date.now() + 2000;
          while (Date.now() < deadline && Date.now() - stableSince < 300) {
            await new Promise((resolve) => setTimeout(resolve, 10));
            if (socket.bytesRead !== previous) { previous = socket.bytesRead; stableSince = Date.now(); }
          }
          client.ws.send(JSON.stringify({ type: "pong", heartbeatId: frame.heartbeatId, clientTimeMs: Date.now() }));
          client.lastHeartbeat = { heartbeatId: frame.heartbeatId, pongAt: Date.now() };
          client.pauseCapture = { bytesRead: socket.bytesRead, receiveCount: client.receiveCount, at: Date.now() };
          record({ type: "pong", pilotSlot, at: client.lastHeartbeat.pongAt });
          record({ type: "pause", pilotSlot, ...client.pauseCapture });
        };
        settle().catch((error) => { client.error = error.message; });
      } else {
        client.ws.send(JSON.stringify({ type: "pong", heartbeatId: frame.heartbeatId, clientTimeMs: Date.now() }));
        client.lastHeartbeat = { heartbeatId: frame.heartbeatId, pongAt: Date.now() };
        record({ type: "pong", pilotSlot, at: client.lastHeartbeat.pongAt });
      }
    }
    if (frame.type === "ownerState" && client.lastSnapshotAck === 0) {
      const rebase = [...client.frames].reverse().find((entry) => entry.type === "rebase");
      client.ws.send(JSON.stringify({ type: "ack", ackKind: "baseline", snapshotId: frame.snapshotId,
        eventSeq: rebase?.lastEventSeq || 0 }));
      client.lastSnapshotAck = frame.snapshotId;
    }
    if (frame.type === "event") {
      client.ws.send(JSON.stringify({ type: "ack", ackKind: "delivery", deliveryId: frame.deliveryId }));
      client.ws.send(JSON.stringify({ type: "ack", ackKind: "event", eventSeq: frame.eventSeq }));
    }
  });
  await waitFor(() => client.ws.readyState === WebSocket.OPEN || client.error, `${pilotSlot} socket open`);
  if (client.error) throw new Error(`${pilotSlot} open error: ${client.error}`);
  client.ws.send(JSON.stringify({ type: "hello", wireVersion: WIRE_PROTOCOL_VERSION,
    simProtocolVersion: PROTOCOL_VERSION, admissionTicket: ticket }));
  await waitFor(() => client.frames.some((frame) => frame.type === "welcome") || client.close, `${pilotSlot} welcome`);
  await waitFor(() => client.frames.some((frame) => frame.type === "publicState")
    && client.frames.some((frame) => frame.type === "ownerState"), `${pilotSlot} baseline`);
  if (client.close) throw new Error(`${pilotSlot} closed during baseline: ${JSON.stringify(client.close)}`);
  return client;
}

async function pauseAfterPong(client, guardMs, record) {
  const socket = client.ws._socket;
  if (!socket || typeof socket.pause !== "function") throw new Error("Node ws private socket pause seam unavailable");
  client.pauseRequested = true;
  await waitFor(() => client.pauseCapture, `${client.pilotSlot} heartbeat pong and synchronous pause`, 15000);
  const before = client.pauseCapture;
  await new Promise((resolve) => setTimeout(resolve, guardMs));
  const after = { bytesRead: socket.bytesRead, receiveCount: client.receiveCount, at: Date.now(),
    isPaused: socket.isPaused(), readableFlowing: socket.readableFlowing };
  record({ type: "pause-guard", pilotSlot: client.pilotSlot, ...after });
  if (!after.isPaused || after.readableFlowing !== false || after.bytesRead !== before.bytesRead
    || after.receiveCount !== before.receiveCount || before.at - client.lastHeartbeat.pongAt > 250) {
    throw new Error(`read-gate guard failed: ${JSON.stringify({ before, after, pong: client.lastHeartbeat })}`);
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

module.exports = { waitFor, openRawClient, pauseAfterPong, resume, closeRawClient };
