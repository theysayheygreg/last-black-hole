#!/usr/bin/env node
"use strict";

const http = require("http");
const nodeAssert = require("assert");
const { WebSocket } = require("ws");
const { TestRunner, assert } = require("./helpers.cjs");
const { createSimWebSocketAdapter } = require("../scripts/sim-ws-adapter.cjs");
const {
  WIRE_PROTOCOL_VERSION,
  SIM_PROTOCOL_VERSION,
  SERVER_TO_CLIENT,
  parseWireFrame,
} = require("../scripts/multiplayer-wire-protocol.cjs");

function waitFor(predicate, { timeout = 2_000, interval = 5, label = "condition" } = {}) {
  const deadline = Date.now() + timeout;
  return new Promise((resolve, reject) => {
    const poll = () => {
      let value;
      try {
        value = predicate();
      } catch (error) {
        reject(error);
        return;
      }
      if (value) {
        resolve(value);
        return;
      }
      if (Date.now() >= deadline) {
        reject(new Error(`Timed out waiting for ${label}`));
        return;
      }
      setTimeout(poll, interval);
    };
    poll();
  });
}

function nextFrame(messages, type, after = -1) {
  return messages.find((frame, index) => index > after && frame.type === type);
}

async function openClient(url, { collect = true } = {}) {
  const ws = new WebSocket(url);
  const messages = [];
  const rawMessages = [];
  const close = { code: null, reason: null };
  if (collect) {
    ws.on("message", (raw) => {
      rawMessages.push(raw.toString());
      messages.push(parseWireFrame(raw, { direction: SERVER_TO_CLIENT }));
    });
  }
  ws.on("close", (code, reason) => {
    close.code = code;
    close.reason = reason.toString();
  });
  await new Promise((resolve, reject) => {
    ws.once("open", resolve);
    ws.once("error", reject);
  });
  return { ws, messages, rawMessages, close };
}

function hello(ticket) {
  return {
    type: "hello",
    wireVersion: WIRE_PROTOCOL_VERSION,
    simProtocolVersion: SIM_PROTOCOL_VERSION,
    admissionTicket: ticket,
  };
}

function inputFrame(inputSeq = 1) {
  return {
    type: "input",
    inputSeq,
    moveX: 0.6,
    moveY: 0.8,
    thrust: 1,
    brake: 0,
    slingshot: false,
    ability1: false,
    ability2: true,
    clientTimeMs: Date.now(),
  };
}

function actionFrame(actionSeq = 1, commandSeq = 1) {
  return {
    type: "action",
    actionId: `action-${actionSeq}`,
    actionSeq,
    commandSeq,
    actionKind: "pulse",
    payload: {},
    clientTimeMs: Date.now(),
  };
}

function eventFrame(runId, eventSeq, marker = `event-${eventSeq}`) {
  return {
    type: "event",
    runId,
    eventSeq,
    tick: eventSeq,
    visibility: "owner",
    eventType: "test.event",
    payload: { marker },
  };
}

async function createHarness(options = {}) {
  const server = http.createServer((_request, response) => {
    response.writeHead(404).end();
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  const baseUrl = `ws://127.0.0.1:${address.port}`;
  const tickets = new Map();
  const bindings = [];
  const inputs = [];
  const actions = [];
  const pongs = [];
  const acks = [];
  const validations = [];
  let snapshotId = 0;

  function issueTicket(name, overrides = {}) {
    const ticket = overrides.ticket || `ticket-${name}-${Math.random().toString(36).slice(2)}`;
    tickets.set(ticket, {
      name,
      playerId: `player-${name}`,
      membershipId: `membership-${name}`,
      credential: `credential-${name}`,
      expiresAt: Date.now() + 5_000,
      ...overrides,
    });
    return ticket;
  }

  const adapter = createSimWebSocketAdapter({
    server,
    runId: "run-a",
    helloTimeoutMs: options.helloTimeoutMs || 80,
    heartbeatIntervalMs: options.heartbeatIntervalMs || 1_000,
    backpressureTimeoutMs: options.backpressureTimeoutMs || 1_000,
    queueOptions: options.queueOptions,
    async redeemHello(frame) {
      const claim = tickets.get(frame.admissionTicket);
      if (!claim || claim.expiresAt <= Date.now()) {
        const error = new Error("opaque ticket rejected");
        error.code = "admission-rejected";
        error.closeCode = 4401;
        throw error;
      }
      tickets.delete(frame.admissionTicket);
      const binding = {
        name: claim.name,
        runId: "run-a",
        playerId: claim.playerId,
        membershipId: claim.membershipId,
        current: true,
        snapshotId: 1,
        lastEventSeq: 0,
      };
      bindings.push(binding);
      return {
        binding,
        welcome: {
          type: "welcome",
          wireVersion: WIRE_PROTOCOL_VERSION,
          simProtocolVersion: SIM_PROTOCOL_VERSION,
          runId: binding.runId,
          membershipId: binding.membershipId,
          playerId: binding.playerId,
          connectionId: `connection-${claim.name}`,
          connectionEpoch: 1,
          commandCredential: claim.credential,
          lastCommandSeq: 0,
          nextCommandSeq: 1,
          lastInputSeq: 0,
          lastActionSeq: 0,
          heartbeatIntervalMs: options.heartbeatIntervalMs || 1_000,
          reconnected: false,
        },
        rebase: {
          type: "rebase",
          runId: binding.runId,
          reason: "initial",
          snapshotId: 1,
          lastEventSeq: 0,
        },
      };
    },
    async revalidateBinding(binding, context) {
      validations.push({ name: binding.name, purpose: context.purpose });
      return binding.current;
    },
    async onInput(binding, frame) {
      inputs.push({ binding, frame });
      return { type: "ack", ackKind: "input", inputSeq: frame.inputSeq };
    },
    async onAction(binding, frame) {
      actions.push({ binding, frame });
      return {
        type: "ack",
        ackKind: "action",
        actionId: frame.actionId,
        actionSeq: frame.actionSeq,
        commandSeq: frame.commandSeq,
        status: "accepted",
        result: { pulsed: true },
      };
    },
    async onPong(binding, frame) {
      pongs.push({ binding, frame });
    },
    async onAck(binding, frame) {
      acks.push({ binding, frame });
    },
    async buildPublicState(context = {}) {
      snapshotId += 1;
      const payload = context.payload || { bodies: [{ id: "public-body", x: 0.25, y: 0.5 }], despawns: [] };
      return {
        type: "publicState",
        runId: "run-a",
        snapshotId,
        tick: snapshotId * 2,
        simTime: snapshotId / 10,
        lastEventSeq: snapshotId,
        fieldRevision: 1,
        overloadMode: "NORMAL",
        lastInputSeq: 0,
        lastActionSeq: 0,
        manifestHash: "sha256:test",
        full: true,
        state: payload,
      };
    },
    async buildOwnerState(binding, publicFrame) {
      return {
        type: "ownerState",
        runId: publicFrame.runId,
        membershipId: binding.membershipId,
        playerId: binding.playerId,
        snapshotId: publicFrame.snapshotId,
        tick: publicFrame.tick,
        simTime: publicFrame.simTime,
        lastEventSeq: publicFrame.lastEventSeq,
        fieldRevision: publicFrame.fieldRevision,
        overloadMode: publicFrame.overloadMode,
        lastInputSeq: 0,
        lastActionSeq: 0,
        state: { privateMarker: `private-${binding.name}` },
      };
    },
  });

  async function admit(name, overrides = {}) {
    const ticket = issueTicket(name, overrides);
    const client = await openClient(`${baseUrl}/stream`);
    client.ws.send(JSON.stringify(hello(ticket)));
    await waitFor(
      () => nextFrame(client.messages, "welcome") && nextFrame(client.messages, "rebase"),
      { label: `${name} welcome and rebase` },
    );
    client.binding = bindings.find((binding) => binding.name === name);
    return client;
  }

  async function close() {
    await adapter.shutdown();
    await new Promise((resolve) => server.close(resolve));
  }

  return {
    server,
    baseUrl,
    adapter,
    tickets,
    bindings,
    inputs,
    actions,
    pongs,
    acks,
    validations,
    issueTicket,
    admit,
    close,
  };
}

async function run() {
  const runner = new TestRunner("MultiplayerWsAdapterCore");

  await runner.run("rejects non-stream upgrades and closes sockets that miss the hello deadline", async () => {
    const harness = await createHarness({ helloTimeoutMs: 40 });
    try {
      const wrongPath = new WebSocket(`${harness.baseUrl}/not-stream`);
      const status = await new Promise((resolve, reject) => {
        wrongPath.once("unexpected-response", (_request, response) => resolve(response.statusCode));
        wrongPath.once("error", reject);
      });
      assert(status === 404, "Non-/stream Upgrade should receive a generic 404");
      wrongPath.terminate();

      const queryTicket = new WebSocket(`${harness.baseUrl}/stream?ticket=must-not-enter-url`);
      const queryStatus = await new Promise((resolve, reject) => {
        queryTicket.once("unexpected-response", (_request, response) => resolve(response.statusCode));
        queryTicket.once("error", reject);
      });
      assert(queryStatus === 404, "Credential-shaped /stream queries should be rejected before Upgrade");
      queryTicket.terminate();

      const idle = await openClient(`${harness.baseUrl}/stream`);
      await waitFor(() => idle.close.code !== null, { label: "hello-timeout close" });
      assert(idle.close.code === 4401, `Expected hello timeout 4401, got ${idle.close.code}`);
      assert(nextFrame(idle.messages, "close")?.reason === "hello timeout", "Timeout should emit a codec-valid close frame");
    } finally {
      await harness.close();
    }
  });

  await runner.run("rejects expired and reused opaque tickets without leaking supplied secrets", async () => {
    const harness = await createHarness();
    const marker = "DO-NOT-LEAK-TICKET-MARKER";
    try {
      const expiredTicket = harness.issueTicket("expired", { ticket: marker, expiresAt: Date.now() - 1 });
      const expired = await openClient(`${harness.baseUrl}/stream`);
      expired.ws.send(JSON.stringify(hello(expiredTicket)));
      await waitFor(() => expired.close.code !== null, { label: "expired-ticket close" });
      assert(expired.close.code === 4401, "Expired ticket should close as admission rejection");

      const reusable = harness.issueTicket("once");
      const accepted = await openClient(`${harness.baseUrl}/stream`);
      accepted.ws.send(JSON.stringify(hello(reusable)));
      await waitFor(() => nextFrame(accepted.messages, "welcome"), { label: "first ticket redemption" });
      const reused = await openClient(`${harness.baseUrl}/stream`);
      reused.ws.send(JSON.stringify(hello(reusable)));
      await waitFor(() => reused.close.code !== null, { label: "reused-ticket close" });
      assert(reused.close.code === 4401, "Reused ticket should be rejected");

      const serialized = JSON.stringify({
        expired: expired.rawMessages,
        reused: reused.rawMessages,
        diagnostics: harness.adapter.diagnostics(),
      });
      assert(!serialized.includes(marker), "Ticket marker must not enter frames or diagnostics");
    } finally {
      await harness.close();
    }
  });

  await runner.run("emits strict welcome/rebase and routes revalidated input and reliable action", async () => {
    const harness = await createHarness();
    try {
      const client = await harness.admit("route");
      const welcome = nextFrame(client.messages, "welcome");
      assert(welcome.wireVersion === WIRE_PROTOCOL_VERSION, "Welcome should use committed wire version");
      assert(nextFrame(client.messages, "rebase")?.reason === "initial", "Initial rebase should follow welcome");

      client.ws.send(JSON.stringify(inputFrame(1)));
      await waitFor(() => nextFrame(client.messages, "ack")?.ackKind === "input", { label: "input ack" });
      client.ws.send(JSON.stringify(actionFrame(1, 1)));
      await waitFor(
        () => client.messages.find((frame) => frame.type === "ack" && frame.ackKind === "action"),
        { label: "action ack" },
      );
      const actionAck = client.messages.find((frame) => frame.type === "ack" && frame.ackKind === "action");
      assert(actionAck.deliveryId === 1, "Adapter should allocate the first retained delivery id");
      assert(harness.inputs.length === 1 && harness.actions.length === 1, "Both command callbacks should run once");
      assert(
        harness.validations.some((entry) => entry.purpose === "inbound:input")
          && harness.validations.some((entry) => entry.purpose === "inbound:action"),
        "Every inbound command should revalidate its binding",
      );

      const heartbeat = await waitFor(
        () => nextFrame(client.messages, "heartbeat"),
        { timeout: 2_500, label: "application heartbeat" },
      );
      client.ws.send(JSON.stringify({ type: "pong", heartbeatId: heartbeat.heartbeatId, clientTimeMs: Date.now() }));
      await waitFor(() => harness.pongs.length === 1, { label: "pong callback" });

      client.binding.current = false;
      client.ws.send(JSON.stringify(inputFrame(2)));
      await waitFor(() => client.close.code !== null, { label: "fenced command close" });
      assert(client.close.code === 4003, "Stale connection authority should be fenced");
      assert(harness.inputs.length === 1, "Fenced input must not reach authority callback");
    } finally {
      await harness.close();
    }
  });

  await runner.run("projects one public baseline plus isolated owner state across four bindings", async () => {
    const harness = await createHarness();
    try {
      const clients = [];
      for (const name of ["a", "b", "c", "d"]) clients.push(await harness.admit(name));
      const result = await harness.adapter.projectNow();
      assert(result.projected === 4, "All four live bindings should receive the projection");
      await Promise.all(clients.map((client) => waitFor(
        () => nextFrame(client.messages, "publicState") && nextFrame(client.messages, "ownerState"),
        { label: `${client.binding.name} state pair` },
      )));
      for (const client of clients) {
        const publicFrame = nextFrame(client.messages, "publicState");
        const ownerFrame = nextFrame(client.messages, "ownerState");
        assert(publicFrame.snapshotId === result.snapshotId, "Every socket should share one public snapshot id");
        assert(ownerFrame.snapshotId === publicFrame.snapshotId, "Owner frame must share the public watermark");
        assert(ownerFrame.state.privateMarker === `private-${client.binding.name}`, "Owner marker should match binding");
        const wire = client.rawMessages.join("\n");
        for (const other of ["a", "b", "c", "d"].filter((name) => name !== client.binding.name)) {
          assert(!wire.includes(`private-${other}`), `Private state for ${other} crossed into ${client.binding.name}`);
        }
        assert(
          client.messages.findIndex((frame) => frame.type === "publicState")
            < client.messages.findIndex((frame) => frame.type === "ownerState"),
          "Public state must be sent before its owner overlay",
        );
      }
    } finally {
      await harness.close();
    }
  });

  await runner.run("retains reliable frames until cumulative ack and disconnects future acknowledgements", async () => {
    const harness = await createHarness();
    try {
      const client = await harness.admit("reliable");
      const first = await harness.adapter.enqueueReliable(client.binding, eventFrame("run-a", 1));
      const second = await harness.adapter.enqueueReliable(client.binding, eventFrame("run-a", 2));
      assert(first.frame.deliveryId === 1 && second.frame.deliveryId === 2, "Delivery ids should be cumulative");
      await waitFor(
        () => client.messages.filter((frame) => frame.type === "event").length === 2,
        { label: "two retained events" },
      );
      assert(harness.adapter.diagnostics().queuedMessages === 2, "ws.send callbacks must not release retention");

      client.ws.send(JSON.stringify({ type: "ack", ackKind: "delivery", deliveryId: 2 }));
      await waitFor(() => harness.adapter.diagnostics().queuedMessages === 0, { label: "cumulative delivery release" });
      client.ws.send(JSON.stringify({ type: "ack", ackKind: "delivery", deliveryId: 1 }));
      await waitFor(() => harness.acks.length >= 2, { label: "stale ack callback" });
      assert(client.close.code === null, "Stale cumulative ack should be ignored, not fatal");

      client.ws.send(JSON.stringify({ type: "ack", ackKind: "delivery", deliveryId: 99 }));
      await waitFor(() => client.close.code !== null, { label: "future ack close" });
      assert(client.close.code === 4008, "Future delivery ack should follow terminal queue policy");
    } finally {
      await harness.close();
    }
  });

  await runner.run("coalesces replaceable state for a paused real consumer while preserving reliable order", async () => {
    const harness = await createHarness({
      queueOptions: {
        maxMessages: 384,
        maxBytes: 4 * 1024 * 1024,
        maxReliableMessages: 384,
        maxReliableBytes: 3 * 1024 * 1024,
        transportHighWaterBytes: 16 * 1024,
        transportLowWaterBytes: 0,
      },
      backpressureTimeoutMs: 5_000,
    });
    try {
      const client = await harness.admit("slow");
      client.ws._socket.pause();
      const reliablePromises = [];
      for (let index = 1; index <= 300; index += 1) {
        reliablePromises.push(harness.adapter.enqueueReliable(
          client.binding,
          eventFrame("run-a", index, `${String(index).padStart(3, "0")}:${"x".repeat(7_500)}`),
        ));
      }
      await Promise.all(reliablePromises);
      await waitFor(
        () => harness.adapter.diagnostics().backpressured === 1,
        { timeout: 3_000, label: "real socket backpressure" },
      );
      const before = harness.adapter.diagnostics();
      await harness.adapter.projectNow({ payload: { bodies: [{ id: "old", pad: "a".repeat(8_000) }], despawns: [] } });
      await harness.adapter.projectNow({ payload: { bodies: [{ id: "middle", pad: "b".repeat(8_000) }], despawns: [] } });
      const latest = await harness.adapter.projectNow({ payload: { bodies: [{ id: "latest", pad: "c".repeat(8_000) }], despawns: [] } });
      const during = harness.adapter.diagnostics();
      assert(during.queuedMessages <= before.queuedMessages + 1, "Three projections should occupy one coalesced state slot");
      const queuedStateBytes = during.queuedBytes - before.queuedBytes;

      client.ws._socket.resume();
      client.ws.send(JSON.stringify({ type: "ack", ackKind: "delivery", deliveryId: 1 }));
      await waitFor(
        () => client.messages.some((frame) => frame.type === "publicState" && frame.snapshotId === latest.snapshotId),
        { timeout: 4_000, label: "latest coalesced projection" },
      );
      const events = client.messages.filter((frame) => frame.type === "event");
      const deliveryIds = events.map((frame) => frame.deliveryId);
      nodeAssert.deepStrictEqual(deliveryIds, [...deliveryIds].sort((a, b) => a - b), "Reliable delivery order must stay monotonic");
      const latestPublic = client.messages.find(
        (frame) => frame.type === "publicState" && frame.snapshotId === latest.snapshotId,
      );
      const latestOwner = client.messages.find(
        (frame) => frame.type === "ownerState" && frame.snapshotId === latest.snapshotId,
      );
      assert(
        queuedStateBytes >= Buffer.byteLength(JSON.stringify(latestPublic)) + Buffer.byteLength(JSON.stringify(latestOwner)),
        "Adapter-private state-pair accounting should conservatively cover both encoded frames",
      );
      assert(
        !client.messages.some((frame) => frame.type === "publicState" && frame.snapshotId !== latest.snapshotId),
        "Only the newest coalesced public frame should leave the paused socket",
      );
      assert(
        !client.messages.some((frame) => frame.type === "ownerState" && frame.snapshotId !== latest.snapshotId),
        "Coalescing must not emit an orphan owner frame from a replaced projection",
      );
    } finally {
      await harness.close();
    }
  });

  await runner.run("run rotation fences old sockets and clears retained queue state", async () => {
    const harness = await createHarness();
    try {
      const client = await harness.admit("rotate");
      await harness.adapter.enqueueReliable(client.binding, eventFrame("run-a", 1));
      await waitFor(() => harness.adapter.diagnostics().queuedMessages === 1, { label: "retained pre-rotation event" });
      const result = harness.adapter.rotateRun("run-b");
      assert(result.fenced === 1, "Rotation should fence the one bound socket");
      await waitFor(() => client.close.code !== null, { label: "run-rotation close" });
      assert(client.close.code === 4003, "Run rotation should use the fencing close code");
      assert(harness.adapter.diagnostics().queuedMessages === 0, "Run rotation should clear queue state");
    } finally {
      await harness.close();
    }
  });

  await runner.run("shutdown removes Upgrade ownership and leaves no sockets or adapter timers", async () => {
    const harness = await createHarness();
    let serverClosed = false;
    try {
      const client = await harness.admit("shutdown");
      const diagnostics = await harness.adapter.shutdown();
      await waitFor(() => client.close.code !== null, { label: "shutdown socket close" });
      assert(diagnostics.closed && diagnostics.connections === 0 && diagnostics.bound === 0, "Shutdown should clear sockets");
      assert(diagnostics.helloTimers === 0 && diagnostics.livenessTimers === 0, "Shutdown should leave no adapter timers");
      assert(harness.server.listenerCount("upgrade") === 0, "Shutdown should detach its Upgrade listener");
      await new Promise((resolve) => harness.server.close(resolve));
      serverClosed = true;
    } finally {
      if (!serverClosed) await harness.close();
    }
  });

  const allPassed = runner.summary();
  process.exit(allPassed ? 0 : 1);
}

run().catch((error) => {
  console.error(error.stack || error.message);
  process.exit(1);
});
