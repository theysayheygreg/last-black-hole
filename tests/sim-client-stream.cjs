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

async function main() {
  const { SimClient } = await import("../src/sim/sim-client.js");
  const runner = new TestRunner("SimClient stream transport");
  let client = null;
  await startSimServer(PORT, { keepAlive: true, env: { LBH_SIM_WS_ENABLED: "true" } });

  try {
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
