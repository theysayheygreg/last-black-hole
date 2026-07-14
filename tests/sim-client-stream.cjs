"use strict";

const { WebSocket } = require("ws");
const {
  TestRunner,
  assert,
  startSimServer,
  stopSimServer,
} = require("./helpers.cjs");

const PORT = Number(process.env.LBH_SIM_CLIENT_STREAM_PORT || 8851);
const BASE_URL = `http://127.0.0.1:${PORT}`;

async function waitFor(check, label, timeoutMs = 5000) {
  const deadline = Date.now() + timeoutMs;
  let value = null;
  while (Date.now() < deadline) {
    value = await check();
    if (value) return value;
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  throw new Error(`Timed out waiting for ${label}; last=${JSON.stringify(value)}`);
}

async function authoritySnapshot(client) {
  const response = await fetch(`${BASE_URL}/snapshot`, {
    headers: {
      "x-lbh-command-credential": client.commandCredential,
      "x-lbh-player-id": client.authorityPlayerId,
      "x-lbh-run-id": client.authorityRunId,
    },
  });
  return response.json();
}

function resumeSocketClass({ acceptedInputSeq, sent }) {
  return class ResumeSocket {
    static OPEN = 1;
    constructor() {
      this.readyState = 0;
      this.listeners = new Map();
      queueMicrotask(() => { this.readyState = 1; this.emit("open", {}); });
    }
    addEventListener(type, callback) {
      const listeners = this.listeners.get(type) || [];
      listeners.push(callback);
      this.listeners.set(type, listeners);
    }
    emit(type, event) { for (const callback of this.listeners.get(type) || []) callback(event); }
    send(raw) {
      const frame = JSON.parse(raw);
      sent.push(frame);
      if (frame.type !== "hello") return;
      queueMicrotask(() => {
        const common = { runId: "resume-run", snapshotId: 10, tick: 20, simTime: 2, lastEventSeq: 2, fieldRevision: 1 };
        for (const incoming of [
          {
            type: "welcome", wireVersion: "test-wire", simProtocolVersion: "test-sim",
            runId: "resume-run", playerId: "resume-player", membershipId: "resume-membership",
            connectionId: "resume-connection", connectionEpoch: 2, commandCredential: "rotated",
            lastCommandSeq: 4, lastActionSeq: 1, lastInputSeq: acceptedInputSeq, heartbeatIntervalMs: 10000,
          },
          { type: "rebase", ...common, reason: "resume" },
          { type: "publicState", ...common, state: { ...common, session: { snapshotHz: 10 }, players: [{ clientId: "resume-player" }] } },
          { type: "ownerState", ...common, membershipId: "resume-membership", playerId: "resume-player", lastActionSeq: 1, state: {} },
        ]) this.emit("message", { data: JSON.stringify(incoming) });
      });
    }
    close(code = 1000, reason = "closed") {
      this.readyState = 3;
      this.emit("close", { code, reason });
    }
  };
}

function deliveryHarness(SimClient, scheduleStreamFrame = null) {
  const sent = [];
  const closed = [];
  const client = new SimClient(BASE_URL, { transport: "stream", scheduleStreamFrame });
  client._socketGeneration = 1;
  client._socket = {
    readyState: 1,
    send(raw) { sent.push(JSON.parse(raw)); },
    close(code, reason) { this.readyState = 3; closed.push({ code, reason }); },
  };
  client.runId = "delivery-run";
  return { client, sent, closed };
}

function controlledStreamScheduler(plan) {
  const records = [];
  function schedule(wire, metadata, deliver) {
    const decision = plan(metadata, JSON.parse(wire)) || {};
    const copies = decision.copies ?? 1;
    const record = { wire, metadata, deliver, copies, cancelled: false };
    records.push(record);
    const immediateCopies = decision.hold ? 0 : copies;
    for (let index = 0; index < immediateCopies; index += 1) deliver();
    return {
      accepted: decision.accepted !== false,
      deliveryCount: copies,
      cancel() { record.cancelled = true; },
    };
  }
  function release(record, copies = record.copies) {
    if (record.cancelled) return [];
    const results = [];
    for (let index = 0; index < copies; index += 1) results.push(record.deliver());
    return results;
  }
  return { schedule, records, release };
}

function scheduleInbound(client, frame, generation = client._socketGeneration) {
  const wire = JSON.stringify(frame);
  return client._scheduleEncodedStreamFrame(wire, frame, "authority-to-client", generation, () => {
    client._handleStreamFrame(JSON.parse(wire), generation);
    return true;
  });
}

function eventFrame(deliveryId, eventSeq, runId = "delivery-run") {
  return {
    type: "event", deliveryId, eventSeq, runId, tick: eventSeq,
    visibility: "public", eventType: `event.${eventSeq}`, payload: { eventSeq },
  };
}

function actionAck(deliveryId, actionId = "action-a", actionSeq = 7, commandSeq = 9) {
  return {
    type: "ack", ackKind: "action", deliveryId, actionId, actionSeq, commandSeq,
    status: "accepted", result: { ok: true },
  };
}

async function main() {
  const { SimClient } = await import("../src/sim/sim-client.js");
  const runner = new TestRunner("SimClient stream transport");
  let client = null;
  await startSimServer(PORT, { keepAlive: true, env: { LBH_SIM_WS_ENABLED: "true" } });

  try {
    await runner.run("health rejects an incompatible authority protocol before admission", async () => {
      const originalFetch = global.fetch;
      global.fetch = async () => ({
        ok: true,
        status: 200,
        async json() { return { ok: true, protocolVersion: "lbh-local-v1" }; },
      });
      try {
        const incompatible = new SimClient("http://incompatible.invalid");
        let failure = null;
        try {
          await incompatible.getHealth();
        } catch (error) {
          failure = error;
        }
        assert(failure?.code === "room-version-incompatible",
          `Expected room-version-incompatible, got ${failure?.code || "no error"}`);
        assert(failure.expectedProtocolVersion === "lbh-local-v2"
          && failure.receivedProtocolVersion === "lbh-local-v1",
        "Protocol rejection must preserve expected and received versions for diagnosis");
      } finally {
        global.fetch = originalFetch;
      }
    });

    await runner.run("client scheduler defaults to byte-identical immediate delivery with privacy-safe metadata", async () => {
      const direct = deliveryHarness(SimClient);
      const seam = controlledStreamScheduler(() => ({ copies: 1 }));
      const injected = deliveryHarness(SimClient, seam);
      const frame = {
        type: "action", actionId: "stable-action", actionSeq: 1, commandSeq: 1,
        actionKind: "pulse", payload: { privateMarker: "must-not-enter-metadata" },
        commandCredential: "must-not-enter-metadata",
      };
      direct.client._sendFrame(frame);
      injected.client._sendFrame(frame);
      assert(direct.sent.length === 1 && injected.sent.length === 1
        && JSON.stringify(direct.sent[0]) === JSON.stringify(injected.sent[0]),
      "An immediate injected scheduler must preserve the default serialized frame exactly");
      const metadata = seam.records[0].metadata;
      assert(Object.isFrozen(metadata) && metadata.direction === "client-to-authority"
        && metadata.frameType === "action" && metadata.semanticId === "stable-action",
      "Scheduler metadata must be frozen and classify direction, frame, and stable identity");
      assert(!("payload" in metadata) && !("commandCredential" in metadata)
        && !("ticket" in metadata) && !JSON.stringify(metadata).includes("privateMarker"),
      "Scheduler metadata must exclude payloads, credentials, and tickets");
      assert(injected.client.getMetrics().pendingScheduledStreamFrames === 0,
        "Immediate scheduling must leave no retained client token");
    });

    await runner.run("outbound scheduling preserves continuous input independence and stable reliable bytes", async () => {
      const seam = controlledStreamScheduler((metadata) => ({
        copies: metadata.frameType === "action" ? 2 : 1,
        hold: metadata.frameType === "action",
      }));
      const harness = deliveryHarness(SimClient, seam);
      const action = {
        type: "action", actionId: "retry-action", actionSeq: 3, commandSeq: 4,
        actionKind: "pulse", payload: {}, clientTimeMs: 10,
      };
      harness.client._sendFrame(action);
      harness.client._sendFrame({
        type: "input", inputSeq: 5, moveX: 1, moveY: 0, thrust: 0, brake: 0,
        slingshot: false, ability1: false, ability2: false, clientTimeMs: 11,
      });
      assert(harness.sent.length === 1 && harness.sent[0].type === "input",
        "A held reliable action must not block independent continuous input");
      const held = seam.records.find((record) => record.metadata.frameType === "action");
      seam.release(held);
      const actionWires = harness.sent.filter((frame) => frame.type === "action");
      assert(actionWires.length === 2
        && JSON.stringify(actionWires[0]) === held.wire
        && JSON.stringify(actionWires[1]) === held.wire,
      "Outbound duplication must submit byte-identical copies with stable action identity");
      assert(harness.client.getMetrics().pendingScheduledStreamFrames === 0,
        "Completing both declared copies must retire the scheduler token");
    });

    await runner.run("inbound scheduling retains contiguous ACK, duplicate idempotence, and playback separation", async () => {
      const seam = controlledStreamScheduler((metadata) => ({
        copies: metadata.frameType === "ack" ? 2 : 1,
        hold: metadata.frameType === "event",
      }));
      const harness = deliveryHarness(SimClient, seam);
      let settlements = 0;
      harness.client._pendingActions.set("scheduled-action", {
        frame: { actionId: "scheduled-action", actionSeq: 2, commandSeq: 2, actionKind: "pulse", payload: {} },
        resolve() { settlements += 1; }, reject() {},
      });
      scheduleInbound(harness.client, eventFrame(1, 1));
      scheduleInbound(harness.client, actionAck(2, "scheduled-action", 2, 2));
      assert(settlements === 1 && harness.client.metrics.lastDeliveryAck === 0
        && harness.client.latestEvents.length === 0,
      "Duplicated action settlement above a held event hole must settle once and emit no cumulative ACK");
      const heldEvent = seam.records.find((record) => record.metadata.direction === "authority-to-client"
        && record.metadata.frameType === "event");
      seam.release(heldEvent);
      assert(harness.client.metrics.lastDeliveryAck === 2 && harness.client.latestEvents.length === 1,
        "Releasing the held event must close through the duplicated action and expose gameplay once");
      assert(harness.client.metrics.lastEventAck === 0,
        "Transport delivery must not advance playback ACK");
      assert(harness.client.consumeEvents().length === 1 && harness.client.metrics.lastEventAck === 1,
        "Gameplay consumption must independently advance the event ACK");
    });

    await runner.run("scheduler cleanup fences old sockets and rejects unsafe outcomes without leakage", async () => {
      const heldSeam = controlledStreamScheduler(() => ({ copies: 1, hold: true }));
      const harness = deliveryHarness(SimClient, heldSeam);
      harness.client._sendFrame({ type: "pong", heartbeatId: 1, clientTimeMs: 1 });
      const held = heldSeam.records[0];
      assert(harness.client.getMetrics().pendingScheduledStreamFrames === 1,
        "Held work must be visible in bounded diagnostics");
      harness.client._resetStreamFrameScheduler();
      harness.client._socketGeneration += 1;
      const replacementSends = [];
      harness.client._socket = { readyState: 1, send(raw) { replacementSends.push(raw); }, close() { this.readyState = 3; } };
      assert(heldSeam.release(held).length === 0 && replacementSends.length === 0
        && harness.client.getMetrics().pendingScheduledStreamFrames === 0,
      "Cleanup must cancel held work and prevent an old-generation callback from reaching a replacement socket");

      const unsafe = deliveryHarness(SimClient, () => Promise.resolve({ accepted: true, deliveryCount: 1 }));
      unsafe.client._sendFrame({ type: "pong", heartbeatId: 2, clientTimeMs: 2 });
      assert(unsafe.closed[0]?.reason === "stream-scheduler-async-outcome"
        && unsafe.client.getMetrics().pendingScheduledStreamFrames === 0,
      "Promise scheduler outcomes must fail closed and purge all client tokens");

      let callback = null;
      const overdeliver = deliveryHarness(SimClient, (_wire, _metadata, deliver) => {
        callback = deliver;
        deliver(); deliver();
        return { accepted: true, deliveryCount: 2 };
      });
      overdeliver.client._sendFrame({ type: "pong", heartbeatId: 3, clientTimeMs: 3 });
      callback();
      assert(overdeliver.closed[0]?.reason === "stream-scheduler-extra-callback"
        && overdeliver.sent.length === 2,
      "A callback beyond the declared two-copy maximum must close before a third physical send");

      let holdCurrent = false;
      const staleSeam = controlledStreamScheduler(() => ({ copies: 1, hold: holdCurrent }));
      const stale = deliveryHarness(SimClient, staleSeam);
      stale.client._sendFrame({ type: "pong", heartbeatId: 4, clientTimeMs: 4 });
      const completedOld = staleSeam.records[0];
      stale.client._socketGeneration += 1;
      stale.client._socket = { readyState: 1, send() {}, close() { this.readyState = 3; } };
      holdCurrent = true;
      stale.client._sendFrame({ type: "pong", heartbeatId: 5, clientTimeMs: 5 });
      const currentHeld = staleSeam.records[1];
      completedOld.deliver();
      assert(!currentHeld.cancelled && stale.client.getMetrics().pendingScheduledStreamFrames === 1,
        "A late extra callback from a completed old generation must not purge current connection work");
      stale.client._resetStreamFrameScheduler();
    });

    await runner.run("same-run rebase fences downstream work without dropping held upstream intent", async () => {
      const seam = controlledStreamScheduler(() => ({ copies: 1, hold: true }));
      const harness = deliveryHarness(SimClient, seam);
      const action = {
        type: "action", actionId: "rebase-action", actionSeq: 4, commandSeq: 4,
        actionKind: "pulse", payload: {}, clientTimeMs: 10,
      };
      harness.client._sendFrame(action);
      scheduleInbound(harness.client, {
        type: "publicState", runId: "delivery-run", snapshotId: 8, tick: 8, simTime: 0.8,
        lastEventSeq: 0, fieldRevision: 1, state: { players: [] },
      });
      const heldAction = seam.records.find((record) => record.metadata.direction === "client-to-authority");
      const heldState = seam.records.find((record) => record.metadata.direction === "authority-to-client");
      scheduleInbound(harness.client, {
        type: "rebase", runId: "delivery-run", snapshotId: 9, lastEventSeq: 0,
        reason: "event-gap", tick: 9, simTime: 0.9, fieldRevision: 1,
      });
      assert(!heldAction.cancelled && heldState.cancelled
        && harness.client.getMetrics().pendingScheduledStreamFrames === 1,
      "A same-run rebase must preserve upstream action/input while canceling old downstream work");
      seam.release(heldAction);
      assert(harness.sent.some((frame) => frame.actionId === "rebase-action")
        && seam.release(heldState).length === 0
        && harness.client.getMetrics().pendingScheduledStreamFrames === 0,
      "The preserved action must retain exact identity while canceled downstream state cannot release late");
    });

    await runner.run("action settlement above a delivery hole is identity-idempotent and not cumulatively ACKed", async () => {
      const harness = deliveryHarness(SimClient);
      let settlements = 0;
      harness.client._pendingActions.set("action-a", {
        frame: { actionId: "action-a", actionSeq: 7, commandSeq: 9, actionKind: "pulse", payload: {} },
        resolve() { settlements += 1; },
        reject() {},
      });

      harness.client._handleStreamFrame(actionAck(2), 1);
      assert(settlements === 1 && harness.client._deliveryAckThrough === 0,
        "Action identity may settle above a hole, but delivery ACK must remain at zero");
      assert(!harness.sent.some((frame) => frame.ackKind === "delivery"),
        "Receiving delivery ID 2 before 1 must emit no cumulative delivery ACK");

      harness.client._handleStreamFrame(actionAck(2), 1);
      assert(settlements === 1 && harness.client._pendingDeliveryIds.size === 1,
        "A duplicate action delivery above the hole must not re-settle or grow the window");

      harness.client._handleStreamFrame(eventFrame(1, 1), 1);
      const deliveryAcks = harness.sent.filter((frame) => frame.ackKind === "delivery");
      assert(deliveryAcks.length === 1 && deliveryAcks[0].deliveryId === 2,
        "Closing delivery ID 1 must advance through retained ID 2 with one ACK 2");
      assert(harness.client.metrics.lastActionAck === 7 && harness.client.metrics.lastEventAck === 0,
        "Semantic action and playback cursors must remain separate from delivery ACK");

      harness.client._handleStreamFrame(actionAck(3), 1);
      assert(settlements === 1 && harness.client._deliveryAckThrough === 3,
        "A settled action replay under a fresh delivery ID must ACK transport without re-settling semantics");
      harness.client._handleStreamFrame(actionAck(4, "action-a", 8, 9), 1);
      assert(harness.closed.at(-1)?.reason === "action-ack-identity-mismatch"
        && !harness.sent.some((frame) => frame.ackKind === "delivery" && frame.deliveryId === 4),
      "A mismatched replay identity must fail closed without poisoning the delivery cursor");
    });

    await runner.run("out-of-order events stay hidden until delivery closes, then playback ACKs separately", async () => {
      const harness = deliveryHarness(SimClient);
      harness.client._handleStreamFrame(eventFrame(2, 2), 1);
      harness.client._handleStreamFrame(eventFrame(2, 2), 1);
      assert(harness.client.latestEvents.length === 0 && harness.client._eventFrames.size === 1,
        "Delivery ID 2 and its duplicate must remain hidden and occupy one semantic event slot");

      harness.client._handleStreamFrame(eventFrame(1, 1), 1);
      assert(harness.client.latestEvents.map((frame) => frame.eventSeq).join(",") === "1,2",
        "Closing the delivery hole must expose retained events in semantic order");
      const delivered = harness.sent.filter((frame) => frame.ackKind === "delivery");
      assert(delivered.length === 1 && delivered[0].deliveryId === 2,
        "The event hole must produce one contiguous delivery ACK");

      const events = harness.client.consumeEvents();
      assert(events.map((event) => event.seq).join(",") === "1,2",
        "Gameplay must consume each eligible event exactly once in event order");
      const playback = harness.sent.filter((frame) => frame.ackKind === "event");
      assert(playback.length === 1 && playback[0].eventSeq === 2
        && harness.client.metrics.lastDeliveryAck === 2,
      "Playback ACK must advance independently after gameplay consumes eligible events");

      harness.client._handleStreamFrame(eventFrame(2, 2), 1);
      assert(harness.client.consumeEvents().length === 0,
        "A duplicate below the delivery and semantic cursors must never replay gameplay effects");
    });

    await runner.run("welcome, same-socket rebase, stream reset, and terminal stop fence delivery epochs", async () => {
      const harness = deliveryHarness(SimClient);
      harness.client._handleStreamFrame(eventFrame(2, 2), 1);
      harness.client._handleStreamFrame({
        type: "welcome", runId: "delivery-run", playerId: "player", membershipId: "membership",
        connectionId: "connection-2", connectionEpoch: 2, commandCredential: "credential",
        lastCommandSeq: 0, lastActionSeq: 0, lastInputSeq: 0, heartbeatIntervalMs: 10000,
      }, 1);
      clearTimeout(harness.client._heartbeatTimer);
      assert(harness.client._deliveryAckThrough === 0 && harness.client._pendingDeliveryIds.size === 0
        && harness.client._eventFrames.size === 0,
      "An accepted reconnect welcome must discard old-epoch delivery and unplayed event state");

      harness.client._handleStreamFrame(eventFrame(2, 2), 1);
      harness.client._handleStreamFrame({
        type: "rebase", runId: "delivery-run", snapshotId: 20, lastEventSeq: 10,
        reason: "resume", tick: 20, simTime: 2, fieldRevision: 1,
      }, 1);
      assert(harness.client._deliveryAckThrough === 0 && harness.client._pendingDeliveryIds.size === 0
        && harness.client._eventFrames.size === 0 && harness.client.eventCursor === 10,
      "A same-socket rebase must start a clean delivery epoch and discard unplayed old work");
      harness.client._handleStreamFrame(eventFrame(1, 11), 1);
      assert(harness.client.latestEvents.length === 1 && harness.client.metrics.lastDeliveryAck === 1,
        "The rebased epoch must accept a fresh reliable ID 1");

      harness.client._resetStreamState("next-run");
      assert(harness.client._deliveryAckThrough === 0 && harness.client._eventFrames.size === 0,
        "A stream-state reset must clear delivery and unplayed event state");
      harness.client._socket.readyState = 1;
      harness.client._handleStreamFrame(eventFrame(2, 12, "next-run"), 1);
      await harness.client._stopStream("terminal-test");
      assert(harness.client._deliveryAckThrough === 0 && harness.client._pendingDeliveryIds.size === 0
        && harness.client._eventFrames.size === 0,
      "Terminal stop must clear the delivery window and old unplayed events");
    });

    await runner.run("transport close fences old events before a fresh binding can receive their ACK", async () => {
      const harness = deliveryHarness(SimClient);
      harness.client.eventCursor = 39;
      harness.client._handleStreamFrame(eventFrame(1, 40), 1);
      assert(harness.client.latestEvents.length === 1,
        "The fixture must retain one delivered but unconsumed old-epoch event");

      let reconnectReason = null;
      harness.client._scheduleReconnect = (reason) => { reconnectReason = reason; return null; };
      harness.client._socket.readyState = 3;
      harness.client._handleSocketClose({ code: 4000, reason: "fixture flap" }, 1);
      assert(reconnectReason === "fixture flap"
        && harness.client._eventFrames.size === 0
        && harness.client.latestEvents.length === 0
        && harness.client.eventCursor === 39,
      "Closing the old transport must discard unconsumed delivery state without advancing the replay cursor");

      const freshSent = [];
      harness.client._socket = {
        readyState: 1,
        send(raw) { freshSent.push(JSON.parse(raw)); },
        close() { this.readyState = 3; },
      };
      assert(harness.client.consumeEvents().length === 0
        && !freshSent.some((frame) => frame.ackKind === "event"),
      "The fresh socket's pre-welcome window must not emit an ACK for an old binding's event");
    });

    await runner.run("terminal close fails persistently and neutralizes stale continuous intent", async () => {
      const harness = deliveryHarness(SimClient);
      harness.client.lastSentInput = {
        type: "input", inputSeq: 7, moveX: 1, moveY: -1,
        thrust: 1, brake: 0.5, slingshot: true, ability1: true, ability2: true,
      };
      harness.client._closeDirective = { reconnectable: false, reason: "terminal fixture" };
      harness.client._socket.readyState = 3;
      harness.client._handleSocketClose({ code: 4012, reason: "terminal fixture" }, 1);
      assert(harness.client.getMetrics().streamState === "failed"
        && harness.client.metrics.reconnectReason === "terminal fixture",
      "A non-reconnectable close must become a persistent failed state");
      assert(harness.client.lastSentInput.thrust === 0
        && harness.client.lastSentInput.brake === 0
        && harness.client.lastSentInput.slingshot === false
        && harness.client.lastSentInput.ability1 === false
        && harness.client.lastSentInput.ability2 === false,
      "A terminal close must neutralize continuous intent before any future admission");
    });

    await runner.run("delivery and semantic event windows fail closed before ACKing unretained frames", async () => {
      const deliveryOverflow = deliveryHarness(SimClient);
      deliveryOverflow.client._handleStreamFrame(eventFrame(129, 129), 1);
      assert(deliveryOverflow.closed[0]?.reason === "delivery-window-overflow"
        && deliveryOverflow.client.metrics.lastDeliveryAck === 0
        && !deliveryOverflow.sent.some((frame) => frame.ackKind === "delivery"),
      "A frame outside the bounded 128-ID delivery window must reconnect without an ACK");

      const eventOverflow = deliveryHarness(SimClient);
      for (let id = 2; id <= 65; id += 1) eventOverflow.client._handleStreamFrame(eventFrame(id, id), 1);
      assert(eventOverflow.client._eventFrames.size === 64 && eventOverflow.sent.length === 0,
        "Sixty-four held events may remain bounded above the first delivery hole");
      eventOverflow.client._handleStreamFrame(eventFrame(66, 66), 1);
      assert(eventOverflow.closed[0]?.reason === "event-window-overflow"
        && !eventOverflow.sent.some((frame) => frame.ackKind === "delivery"),
      "The sixty-fifth unplayed event must fail closed before retaining or ACKing its delivery");

      const staleRun = deliveryHarness(SimClient);
      staleRun.client._handleStreamFrame(eventFrame(2, 2, "old-run"), 1);
      staleRun.client._handleStreamFrame(eventFrame(1, 1), 1);
      assert(staleRun.client.metrics.lastDeliveryAck === 1
        && !staleRun.sent.some((frame) => frame.ackKind === "delivery" && frame.deliveryId === 2),
      "An old-run frame must not poison the current delivery epoch's contiguous cursor");
    });

    await runner.run("stop cancels delayed ticket and pre-baseline admission without hanging", async () => {
      const delayed = new SimClient(BASE_URL, { transport: "stream", WebSocketImpl: WebSocket });
      delayed._protocol = { path: "/stream", wireVersion: "test", simProtocolVersion: "test" };
      delayed._issueStreamTicket = () => new Promise(() => {});
      const duringTicket = delayed._connectStream("admission");
      await new Promise((resolve) => setTimeout(resolve, 20));
      await delayed._stopStream("ticket-cancel-test");
      await assertRejectsSoon(duringTicket, "delayed ticket cancellation");

      class PreBaselineSocket {
        static OPEN = 1;
        constructor() { this.readyState = 0; this.listeners = new Map(); }
        addEventListener(type, callback) { this.listeners.set(type, callback); }
        send() {}
        close(code = 1000, reason = "closed") {
          this.readyState = 3;
          this.listeners.get("close")?.({ code, reason });
        }
      }
      const preBaseline = new SimClient(BASE_URL, { transport: "stream", WebSocketImpl: PreBaselineSocket });
      preBaseline._protocol = { path: "/stream", wireVersion: "test", simProtocolVersion: "test" };
      preBaseline._issueStreamTicket = async () => ({ ticket: "test-ticket" });
      const duringBaseline = preBaseline._connectStream("admission");
      await waitFor(() => preBaseline._socket, "pre-baseline socket");
      await preBaseline._stopStream("baseline-cancel-test");
      await assertRejectsSoon(duringBaseline, "pre-baseline cancellation");
    });

    await runner.run("discovers stream and merges an owner-private first snapshot", async () => {
      client = new SimClient(BASE_URL, { transport: "stream", WebSocketImpl: WebSocket });
      await client.startSession({
        mapId: "shallows",
        maxPlayers: 4,
        requesterName: "Stream Pilot",
      });
      await client.join({
        name: "Stream Pilot",
        profileId: null,
        equipped: [{ id: "stream-rig", name: "Stream Rig", subcategory: "equippable" }],
        consumables: [{ id: "stream-cell", name: "Stream Cell", subcategory: "consumable", charges: 1, useEffect: "fuelRefill" }],
      });
      const stream = await client.pollSnapshot(false);
      const oracle = await authoritySnapshot(client);
      const streamOwner = stream.players.find((entry) => entry.clientId === client.clientId);
      const oracleOwner = oracle.players.find((entry) => entry.clientId === client.clientId);
      assert(stream.runId === oracle.runId && streamOwner.profileId === oracleOwner.profileId,
        "Stream baseline must preserve HTTP snapshot lineage and owner overlay");
      assert(client.getMetrics().selectedTransport === "stream"
        && client.getMetrics().activeTransport === "stream",
      "Expected explicit stream transport to become active");
    });

    await runner.run("continuous ACK is independent and rejected one-shots settle once", async () => {
      const response = await client.sendInput({ moveX: 1, thrust: 0.5, extractConfirm: true });
      assert(response.acceptedSeq === 1 && response.actionResults instanceof Promise,
        "sendInput must release on continuous ACK with separate semantic results");
      const results = await response.actionResults;
      const extract = results.actionAcks.find((entry) => entry.actionKind === "extractConfirm");
      assert(extract?.status === "rejected" && results.extractConfirmSettled === true,
        "Not-ready extraction must settle as a deterministic rejection");
      assert(client.getMetrics().pendingActionCount === 0,
        "Rejected physical intent must not remain pending or retry forever");
    });

    await runner.run("reliable actions, merged inventory state, and playback ACK remain split", async () => {
      const response = await client.sendInput({ moveY: 1, slingshotEdges: [41], pulse: true });
      const results = await response.actionResults;
      assert(results.settledSlingshotEdges.includes(41)
        && results.actionAcks.some((entry) => entry.actionKind === "pulse"),
      "Burst one-shots must each receive semantic settlement");
      await client.inventoryAction({ action: "unequip", equipSlot: 0 });
      const beforeConsume = client.getMetrics();
      await waitFor(() => client.latestEvents.length > 0, "stream event delivery");
      const delivered = client.getMetrics();
      assert(delivered.lastDeliveryAck > 0 && delivered.lastEventAck === beforeConsume.lastEventAck,
        "Delivery ACK must precede and remain distinct from playback ACK");
      const events = client.consumeEvents();
      assert(events.some((entry) => entry.type === "player.inventoryAction")
        && client.getMetrics().lastEventAck > beforeConsume.lastEventAck,
      "consumeEvents must advance the cumulative playback cursor");
    });

    await runner.run("blackout resumes with rotated authority and no hot-path HTTP", async () => {
      const oldCredential = client.commandCredential;
      client._socket.terminate();
      await waitFor(() => client.getMetrics().reconnectCount === 1, "stream reconnect", 8000);
      assert(client.commandCredential !== oldCredential && client.connectionEpoch >= 2,
        "Resume must rotate connection authority");
      const response = await client.sendInput({ moveX: -1, thrust: 0.25 });
      assert(response.acceptedSeq >= 3, "Continuous input must continue after resume");
      const metrics = client.getMetrics();
      assert(metrics.hotPathHttpCount === 0 && metrics.hotPathHttpOccurred === false,
        `Stream mode issued hot-path HTTP requests: ${JSON.stringify(metrics)}`);
    });

    await runner.run("resume adopts the welcome input cursor before deciding what to resend", async () => {
      async function connectWithLastInput(inputSeq) {
        const sent = [];
        const resumed = new SimClient(BASE_URL, {
          transport: "stream",
          WebSocketImpl: resumeSocketClass({ acceptedInputSeq: 7, sent }),
        });
        resumed._protocol = { path: "/stream", wireVersion: "test-wire", simProtocolVersion: "test-sim" };
        resumed._issueStreamTicket = async () => ({ ticket: "resume-ticket" });
        resumed.runId = "resume-run";
        resumed.lastSnapshotId = 9;
        resumed.eventCursor = 2;
        resumed.metrics.lastInputAck = 6;
        resumed.metrics.lastAcceptedSeq = 6;
        resumed.lastSentInput = {
          type: "input", inputSeq, moveX: 1, moveY: 0, thrust: 0, brake: 0,
          slingshot: false, ability1: false, ability2: false,
        };
        resumed.seq = inputSeq;
        resumed.pendingInputs = [{ seq: 7, sentAt: 1 }, ...(inputSeq > 7 ? [{ seq: inputSeq, sentAt: 2 }] : [])];
        await resumed._connectStream("resume");
        return { resumed, sent };
      }

      const accepted = await connectWithLastInput(7);
      assert(accepted.resumed.metrics.lastInputAck === 7
        && accepted.resumed.metrics.lastAcceptedSeq === 7
        && accepted.resumed.pendingInputs.length === 0,
      "Welcome must advance and prune through the authoritative input cursor");
      assert(!accepted.sent.some((frame) => frame.type === "input"),
        "Resume must not resend an input the welcome says authority accepted");
      await accepted.resumed._stopStream("accepted-cursor-test");

      const newer = await connectWithLastInput(8);
      const resent = newer.sent.filter((frame) => frame.type === "input");
      assert(resent.length === 1 && resent[0].inputSeq === 9 && newer.resumed.lastSentInput.inputSeq === 9
        && newer.resumed.pendingInputs.length === 1,
      "Resume must remint a genuinely newer continuous intent above the welcome cursor");
      newer.resumed._handleStreamFrame({ type: "ack", ackKind: "input", inputSeq: 9 }, newer.resumed._socketGeneration);
      assert(newer.resumed.pendingInputs.length === 0 && newer.resumed.metrics.lastInputAck === 9,
        "Fresh resume ACK must cumulatively clear the older in-flight input state");
      await newer.resumed._stopStream("newer-cursor-test");
    });

    await runner.run("leave closes stream and leaves bounded state", async () => {
      const response = await client.leave();
      assert(response.ok === true && client.getMetrics().pendingActionCount === 0,
        "Clean leave must drain reliable state");
      assert(client.getMetrics().activeTransport === "http",
        "Clean leave must shut down the stream transport");
    });

    await runner.run("leave with a dead socket and pending action rejects within its bound", async () => {
      const blocked = new SimClient(BASE_URL, {
        transport: "stream",
        WebSocketImpl: WebSocket,
        actionDrainTimeoutMs: 40,
      });
      blocked.commandCredential = "test-credential";
      blocked.authorityRunId = "test-run";
      blocked.authorityPlayerId = blocked.clientId;
      blocked._pendingActions.set("blocked-action", { promise: new Promise(() => {}) });
      await assertRejectsSoon(blocked.leave(), "bounded pending-action leave", 500);
      assert(blocked._shuttingDown === false,
        "A failed drain must not enter shutdown or issue an unsafe HTTP command");
    });
  } finally {
    if (client?._socket?.readyState < 2) await client.shutdown();
    await stopSimServer(PORT);
  }

  runner.summary();
}

async function assertRejectsSoon(promise, label, timeoutMs = 500) {
  let rejected = false;
  await Promise.race([
    promise.then(() => { throw new Error(`${label} unexpectedly resolved`); }, () => { rejected = true; }),
    new Promise((_, reject) => setTimeout(() => reject(new Error(`${label} hung`)), timeoutMs)),
  ]);
  assert(rejected, `${label} must reject`);
}

main().catch((error) => {
  console.error(error.stack || error.message);
  process.exitCode = 1;
});
