#!/usr/bin/env node
"use strict";

const http = require("http");
const nodeAssert = require("assert");
const { WebSocket } = require("ws");
const { TestRunner, assert } = require("./helpers.cjs");
const { DEFAULTS, createSimWebSocketAdapter } = require("../scripts/sim-ws-adapter.cjs");
const {
  WIRE_PROTOCOL_VERSION,
  waitFor,
  deferred,
  upgradeStatus,
  nextFrame,
  openClient,
  hello,
  inputFrame,
  actionFrame,
  eventFrame,
  createHarness,
} = require("./multiplayer-ws-adapter-fixture.cjs");

async function run() {
  const runner = new TestRunner("MultiplayerWsAdapterCore");

  await runner.run("rejects non-stream upgrades and closes sockets that miss the hello deadline", async () => {
    const harness = await createHarness({ helloTimeoutMs: 40, closeGraceMs: 100, sweepIntervalMs: 50 });
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

      const stubborn = await openClient(`${harness.baseUrl}/stream`);
      stubborn.ws._socket.pause();
      await waitFor(() => harness.adapter.diagnostics().closing === 1, { label: "stubborn hello timeout" });
      await waitFor(() => harness.adapter.diagnostics().connections === 0, {
        timeout: 1_000,
        label: "forced hello-timeout cleanup",
      });
      stubborn.ws._socket.resume();
    } finally {
      await harness.close();
    }

  });

  await runner.run("fails construction when another component already owns Upgrade routing", async () => {
    const server = http.createServer();
    server.on("upgrade", () => {});
    nodeAssert.throws(
      () => createSimWebSocketAdapter({ server }),
      /already owns Upgrade routing/,
      "Adapter should require an explicit cooperative router instead of racing Upgrade listeners",
    );
    server.removeAllListeners();
  });

  await runner.run("bounds total connections and pending hellos and recovers capacity after cleanup", async () => {
    assert(DEFAULTS.maxConnections === 128 && DEFAULTS.maxPendingHello === 32 && DEFAULTS.maxPendingInbound === 64,
      "Production defaults should expose explicit hard connection, hello, and inbound caps");
    assert(DEFAULTS.maxPendingInboundBytes === 512 * 1024 && DEFAULTS.maxPendingInboundBytesTotal === 8 * 1024 * 1024,
      "Production defaults should bound retained inbound bytes per socket and per adapter");
    assert(DEFAULTS.backpressureTimeoutMs === 2_000, "Production no-progress default should match the 2s plan bound");
    const connectionHarness = await createHarness({ maxConnections: 1, maxPendingHello: 1, helloTimeoutMs: 40 });
    try {
      const idle = await openClient(`${connectionHarness.baseUrl}/stream`);
      assert(await upgradeStatus(`${connectionHarness.baseUrl}/stream`) === 503, "Connection cap should reject excess Upgrade");
      assert(connectionHarness.adapter.diagnostics().rejectedConnections === 1, "Connection rejection should be counted");
      await waitFor(() => idle.close.code !== null, { label: "connection-cap idle cleanup" });
      await waitFor(() => connectionHarness.adapter.diagnostics().connections === 0, { label: "connection capacity release" });
      const recovered = await connectionHarness.admit("capacity-recovered");
      assert(nextFrame(recovered.messages, "welcome"), "Released connection capacity should accept a later hello");
    } finally {
      await connectionHarness.close();
    }

    const helloHarness = await createHarness({ maxConnections: 2, maxPendingHello: 1, helloTimeoutMs: 40 });
    try {
      const idle = await openClient(`${helloHarness.baseUrl}/stream`);
      assert(await upgradeStatus(`${helloHarness.baseUrl}/stream`) === 503, "Pending-hello cap should reject excess Upgrade");
      assert(helloHarness.adapter.diagnostics().rejectedPendingHello === 1, "Pending-hello rejection should be counted");
      await waitFor(() => idle.close.code !== null, { label: "pending-hello timeout" });
      await waitFor(() => helloHarness.adapter.diagnostics().pendingHello === 0, { label: "pending-hello capacity release" });
      const recovered = await helloHarness.admit("hello-recovered");
      assert(nextFrame(recovered.messages, "welcome"), "Hello timeout cleanup should release pending capacity");
    } finally {
      await helloHarness.close();
    }
  });

  await runner.run("skips projection for a hello-pending socket without closing or projecting private state", async () => {
    const gate = deferred();
    let redemptionStarted = false;
    const harness = await createHarness({
      beforeRedeem: async () => {
        redemptionStarted = true;
        await gate.promise;
      },
    });
    try {
      const ticket = harness.issueTicket("pending-project");
      const client = await openClient(`${harness.baseUrl}/stream`);
      client.ws.send(JSON.stringify(hello(ticket)));
      await waitFor(() => redemptionStarted, { label: "delayed redemption start" });
      const projection = await harness.adapter.projectNow();
      assert(projection.projected === 0 && projection.skipped === 1, "Pending hello should be skipped, not fenced");
      assert(client.close.code === null && client.messages.length === 0, "Pending hello should receive no state or close frame");
      gate.resolve();
      await waitFor(() => nextFrame(client.messages, "welcome"), { label: "post-projection welcome" });
    } finally {
      gate.resolve();
      await harness.close();
    }
  });

  await runner.run("serializes raw frames so double hello redeems once and commands retain arrival order", async () => {
    const redeemGate = deferred();
    let redeemStarted = false;
    const helloHarness = await createHarness({
      beforeRedeem: async () => {
        redeemStarted = true;
        await redeemGate.promise;
      },
    });
    try {
      const ticket = helloHarness.issueTicket("double");
      const client = await openClient(`${helloHarness.baseUrl}/stream`);
      const wire = JSON.stringify(hello(ticket));
      client.ws.send(wire);
      client.ws.send(wire);
      await waitFor(() => redeemStarted, { label: "first hello redemption" });
      redeemGate.resolve();
      await waitFor(() => client.close.code !== null, { label: "duplicate hello close" });
      assert(helloHarness.getRedemptionCount() === 1, "Concurrent double hello must redeem exactly once");
      assert(helloHarness.adapter.diagnostics().maxObservedPendingInbound <= 2, "Double hello queue should remain bounded");
    } finally {
      redeemGate.resolve();
      await helloHarness.close();
    }

    const inputGate = deferred();
    const starts = [];
    const orderHarness = await createHarness({
      beforeInput: async (_binding, frame) => {
        starts.push(frame.inputSeq);
        if (frame.inputSeq === 1) await inputGate.promise;
      },
    });
    try {
      const client = await orderHarness.admit("ordered");
      client.ws.send(JSON.stringify(inputFrame(1)));
      client.ws.send(JSON.stringify(inputFrame(2)));
      await waitFor(() => starts.length === 1, { label: "first ordered command start" });
      nodeAssert.deepStrictEqual(starts, [1], "Second callback must not overtake a delayed first callback");
      inputGate.resolve();
      await waitFor(() => orderHarness.inputs.length === 2, { label: "ordered command completion" });
      nodeAssert.deepStrictEqual(
        orderHarness.inputs.map((entry) => entry.frame.inputSeq),
        [1, 2],
        "Command callbacks should preserve socket arrival order",
      );
    } finally {
      inputGate.resolve();
      await orderHarness.close();
    }
  });

  await runner.run("closes an inbound raw-frame flood without exceeding its configured pending cap", async () => {
    const gate = deferred();
    const harness = await createHarness({
      maxPendingInbound: 4,
      beforeInput: async (_binding, frame) => {
        if (frame.inputSeq === 1) await gate.promise;
      },
    });
    try {
      const client = await harness.admit("inbound-flood");
      for (let sequence = 1; sequence <= 8; sequence += 1) client.ws.send(JSON.stringify(inputFrame(sequence)));
      await waitFor(() => client.close.code !== null, { label: "inbound flood close" });
      assert(client.close.code === 1013, "Inbound queue exhaustion should use retry-later transport close");
      assert(nextFrame(client.messages, "close")?.code === 4008, "Inbound flood should retain codec-valid app close");
      assert(harness.adapter.diagnostics().maxObservedPendingInbound <= 4, "Raw-frame tail must never exceed configured cap");
      gate.resolve();
      await waitFor(() => harness.adapter.diagnostics().pendingInbound === 0, { label: "inbound tail cleanup" });
    } finally {
      gate.resolve();
      await harness.close();
    }
  });

  await runner.run("bounds inbound bytes per socket and recovers accounting after overflow", async () => {
    const gate = deferred();
    const large = actionFrame(1, 1);
    large.payload = { marker: "x".repeat(1_000) };
    const wire = JSON.stringify(large);
    const wireBytes = Buffer.byteLength(wire, "utf8");
    const harness = await createHarness({
      maxPendingInbound: 64,
      maxPendingInboundBytes: wireBytes + 16,
      beforeAction: async () => gate.promise,
    });
    try {
      const client = await harness.admit("byte-socket");
      client.ws.send(wire);
      await waitFor(() => harness.adapter.diagnostics().pendingInboundBytes === wireBytes, {
        label: "first retained socket bytes",
      });
      client.ws.send(wire);
      await waitFor(() => client.close.code !== null, { label: "per-socket byte overflow close" });
      assert(client.close.code === 1013 && nextFrame(client.messages, "close")?.code === 4008,
        "Per-socket byte overflow should use retry-later transport plus codec close");
      await waitFor(() => harness.adapter.diagnostics().pendingInboundBytes === 0, {
        label: "per-socket byte accounting recovery",
      });
      assert(harness.adapter.diagnostics().maxObservedPendingInbound <= 1,
        "Byte overflow test must not depend on the inbound count cap");
    } finally {
      gate.resolve();
      await harness.close();
    }
  });

  await runner.run("bounds aggregate inbound bytes across sockets and releases the match budget", async () => {
    const gate = deferred();
    const large = actionFrame(1, 1);
    large.payload = { marker: "y".repeat(1_000) };
    const wire = JSON.stringify(large);
    const wireBytes = Buffer.byteLength(wire, "utf8");
    const harness = await createHarness({
      maxPendingInbound: 64,
      maxPendingInboundBytes: wireBytes * 2,
      maxPendingInboundBytesTotal: wireBytes + 16,
      beforeAction: async () => gate.promise,
    });
    try {
      const first = await harness.admit("byte-total-a");
      const second = await harness.admit("byte-total-b");
      first.ws.send(wire);
      await waitFor(() => harness.adapter.diagnostics().pendingInboundBytes === wireBytes, {
        label: "first retained aggregate bytes",
      });
      second.ws.send(wire);
      await waitFor(() => second.close.code !== null, { label: "aggregate byte overflow close" });
      assert(second.close.code === 1013 && nextFrame(second.messages, "close")?.code === 4008,
        "Match-wide byte overflow should reject only the socket that exceeds the cap");
      assert(harness.adapter.diagnostics().pendingInboundBytes === wireBytes,
        "Rejected aggregate bytes must never enter retained accounting");
      gate.resolve();
      await waitFor(() => harness.adapter.diagnostics().pendingInboundBytes === 0, {
        label: "aggregate byte budget release",
      });
      assert(first.close.code === null, "A within-budget peer should remain connected after aggregate rejection");
    } finally {
      gate.resolve();
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

  await runner.run("replaces old epochs by stable run and membership identity across new binding objects", async () => {
    const harness = await createHarness();
    try {
      const identity = { runId: "run-a", membershipId: "membership-stable" };
      const first = await harness.admit("stable-old", {
        membershipId: identity.membershipId,
        playerId: "player-stable",
        epoch: 1,
      });
      const second = await harness.admit("stable-new", {
        membershipId: identity.membershipId,
        playerId: "player-stable",
        epoch: 2,
      });
      await waitFor(() => first.close.code !== null, { label: "old epoch immediate fence" });
      assert(first.close.code === 4003, "New epoch should immediately close the old stable membership socket");
      assert(harness.adapter.bindingKeyFor(first.binding) === harness.adapter.bindingKeyFor(second.binding),
        "Distinct binding objects for one membership should resolve to one stable key");

      const reliable = await harness.adapter.enqueueReliable(identity, eventFrame("run-a", 1, "stable-route"));
      assert(reliable.accepted, "Reliable lookup should accept a stable runId+membershipId object");
      await waitFor(
        () => second.messages.some((frame) => frame.type === "event" && frame.payload.marker === "stable-route"),
        { label: "stable reliable route" },
      );
      await harness.adapter.projectNow();
      await waitFor(() => nextFrame(second.messages, "ownerState"), { label: "new epoch owner state" });
      assert(!nextFrame(first.messages, "ownerState"), "Old epoch must not receive owner state after replacement");
    } finally {
      await harness.close();
    }
  });

  await runner.run("rejects an owner projection whose identity differs from the redeemed welcome", async () => {
    const harness = await createHarness({
      ownerFrameMutation(frame) {
        return { ...frame, membershipId: "membership-attacker" };
      },
    });
    try {
      const client = await harness.admit("owner-mismatch");
      const result = await harness.adapter.projectNow();
      assert(result.projected === 0 && result.skipped === 1, "Identity-mismatched owner frame must be skipped");
      await waitFor(() => client.close.code !== null, { label: "owner identity mismatch close" });
      assert(client.close.code === 4403, "Private identity mismatch should close the connection");
      assert(!nextFrame(client.messages, "ownerState"), "Mismatched owner frame must never reach the wire");
      assert(nextFrame(client.messages, "error")?.code === "owner-identity-mismatch",
        "Identity mismatch should surface only a bounded error code");
    } finally {
      await harness.close();
    }
  });

  await runner.run("aborts delayed redemption on shutdown without repopulating adapter state", async () => {
    const gate = deferred();
    const returned = deferred();
    let redemptionContext = null;
    const harness = await createHarness({
      beforeRedeem: async (_frame, context) => {
        redemptionContext = context;
        await gate.promise;
      },
      afterRedeem: async () => returned.resolve(),
    });
    let serverClosed = false;
    try {
      const ticket = harness.issueTicket("shutdown-race");
      const client = await openClient(`${harness.baseUrl}/stream`);
      client.ws.send(JSON.stringify(hello(ticket)));
      await waitFor(() => redemptionContext, { label: "shutdown-race redemption start" });
      const diagnostics = await harness.adapter.shutdown();
      assert(redemptionContext.signal.aborted, "Shutdown must abort the callback signal");
      assert(diagnostics.connections === 0 && diagnostics.bound === 0 && diagnostics.pendingHello === 0,
        "Shutdown should clear connection and hello state before delayed callback returns");
      gate.resolve();
      await returned.promise;
      await new Promise((resolve) => setImmediate(resolve));
      const after = harness.adapter.diagnostics();
      assert(after.connections === 0 && after.bound === 0 && after.pendingHello === 0,
        "Resolved redemption must not repopulate maps after lifecycle generation changes");
      await waitFor(() => client.close.code !== null, { label: "shutdown-race socket close" });
      await new Promise((resolve) => harness.server.close(resolve));
      serverClosed = true;
    } finally {
      gate.resolve();
      if (!serverClosed) await harness.close();
    }
  });

  await runner.run("uses a safe sweep for a 1s negotiated heartbeat even when the factory default is 60s", async () => {
    const harness = await createHarness({ heartbeatIntervalMs: 60_000, welcomeHeartbeatIntervalMs: 1_000 });
    try {
      const client = await harness.admit("heartbeat-divergence");
      assert(harness.adapter.diagnostics().sweepIntervalMs <= 1_000, "Sweep cadence must stay at or below one second");
      const heartbeat = await waitFor(
        () => nextFrame(client.messages, "heartbeat"),
        { timeout: 2_500, label: "negotiated 1s heartbeat" },
      );
      client.ws.send(JSON.stringify({ type: "pong", heartbeatId: heartbeat.heartbeatId, clientTimeMs: Date.now() }));
      await waitFor(() => harness.pongs.length === 1, { label: "divergent heartbeat pong" });
    } finally {
      await harness.close();
    }
  });

  await runner.run("contains projection, broadcast-factory, and reliable-encoding failures", async () => {
    const secret = "CALLBACK-SECRET-MUST-NOT-LEAK";
    let failPublic = true;
    const harness = await createHarness({
      beforePublicState: async () => {
        if (failPublic) throw new Error(secret);
      },
    });
    try {
      const client = await harness.admit("callback-errors");
      const projection = await harness.adapter.projectNow();
      assert(projection.error === "public-projection-failed", "Public callback failure should return a bounded result");
      await waitFor(() => nextFrame(client.messages, "error"), { label: "public projection error frame" });
      failPublic = false;

      const broadcast = await harness.adapter.broadcastReliable(() => {
        throw new Error(secret);
      });
      assert(broadcast[0].action === "reject" && broadcast[0].reason === "reliable-factory-failed",
        "Broadcast factory failure should be contained per connection");

      const invalid = await harness.adapter.enqueueReliable(client.binding, { type: "event", payload: {} });
      assert(invalid.action === "reject", "Invalid reliable frame should return a bounded rejection");
      await waitFor(() => client.close.code !== null, { label: "invalid reliable frame close" });
      const serialized = JSON.stringify({ messages: client.messages, diagnostics: harness.adapter.diagnostics() });
      assert(!serialized.includes(secret), "Callback errors and diagnostics must not expose callback messages");
    } finally {
      await harness.close();
    }

    const invalidCallbackHarness = await createHarness({
      inputReplyMutation: (reply) => ({ ...reply, inputSeq: 0 }),
    });
    try {
      const client = await invalidCallbackHarness.admit("invalid-callback-reply");
      client.ws.send(JSON.stringify(inputFrame(1)));
      await waitFor(() => client.close.code !== null, { label: "invalid callback reply close" });
      assert(nextFrame(client.messages, "error")?.code === "invalid-field",
        "Invalid callback output should become a bounded protocol error and close");
    } finally {
      await invalidCallbackHarness.close();
    }
  });

  await runner.run("final-revalidates authority after an awaited reliable broadcast factory", async () => {
    const gate = deferred();
    let factoryStarted = false;
    const harness = await createHarness();
    try {
      const client = await harness.admit("broadcast-rotation");
      const pending = harness.adapter.broadcastReliable(async () => {
        factoryStarted = true;
        await gate.promise;
        return eventFrame("run-a", 1, "must-not-cross-authority-rotation");
      });
      await waitFor(() => factoryStarted, { label: "delayed reliable factory" });
      client.binding.current = false;
      gate.resolve();
      const [result] = await pending;
      assert(result.action === "disconnect" && result.reason === "connection-fenced",
        "A post-factory authority rotation must fence the old epoch");
      await waitFor(() => client.close.code !== null, { label: "broadcast authority fence close" });
      assert(client.close.code === 4003, "The stale broadcast recipient should close as fenced");
      assert(!client.messages.some((frame) => frame.type === "event" && frame.payload?.marker === "must-not-cross-authority-rotation"),
        "No reliable event may cross an authority rotation that happened during the factory await");
    } finally {
      gate.resolve();
      await harness.close();
    }
  });

  await runner.run("sends explicit rebases only to current bindings and clears their reliable window", async () => {
    const harness = await createHarness();
    try {
      const client = await harness.admit("explicit-rebase");
      await harness.adapter.enqueueReliable(client.binding, eventFrame("run-a", 1, "retained-before-rebase"));
      await waitFor(() => harness.adapter.diagnostics().queuedMessages === 1, { label: "pre-rebase reliable retention" });
      const frame = { type: "rebase", runId: "run-a", reason: "event-gap", snapshotId: 9, lastEventSeq: 8 };
      const result = await harness.adapter.sendRebase(client.binding, frame);
      assert(result.accepted && result.action === "sent", "Current binding should receive an explicit rebase");
      assert(harness.adapter.diagnostics().queuedMessages === 0,
        "Explicit rebase should reset the socket reliable window before sending");
      await waitFor(
        () => client.messages.some((message) => message.type === "rebase" && message.reason === "event-gap"),
        { label: "explicit event-gap rebase" },
      );

      client.binding.current = false;
      const stale = await harness.adapter.rebase(client.binding, {
        type: "rebase", runId: "run-a", reason: "server-recovery", snapshotId: 10, lastEventSeq: 9,
      });
      assert(stale.action === "disconnect" && stale.reason === "connection-fenced",
        "A stale binding must be fenced instead of receiving a rebase");
      await waitFor(() => client.close.code !== null, { label: "stale rebase binding close" });
      assert(!client.messages.some((message) => message.type === "rebase" && message.reason === "server-recovery"),
        "A stale binding must not receive the requested rebase frame");
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
      assert(client.close.code === 1013, "Queue overload should use transport retry-later code 1013");
      assert(nextFrame(client.messages, "close")?.code === 4008, "Application close frame should preserve queue-policy code");
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
      for (let index = 1; index <= 300; index += 1) {
        const queued = await harness.adapter.enqueueReliable(
          client.binding,
          eventFrame("run-a", index, `${String(index).padStart(3, "0")}:${"x".repeat(7_500)}`),
        );
        assert(queued.accepted, `Reliable fixture event ${index} should fit explicit bounds`);
      }
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
      await waitFor(
        () => client.messages.filter((frame) => frame.type === "event").length === 300
          && client.messages.some((frame) => frame.type === "publicState" && frame.snapshotId === latest.snapshotId),
        { timeout: 5_000, label: "all reliable events and latest coalesced projection" },
      );
      const events = client.messages.filter((frame) => frame.type === "event");
      const deliveryIds = events.map((frame) => frame.deliveryId);
      nodeAssert.deepStrictEqual(
        deliveryIds,
        Array.from({ length: 300 }, (_unused, index) => index + 1),
        "All 300 retained deliveries must arrive exactly once and monotonically",
      );
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
      client.ws.send(JSON.stringify({ type: "ack", ackKind: "delivery", deliveryId: 300 }));
      await waitFor(
        () => harness.adapter.diagnostics().queuedMessages === 0
          && harness.adapter.diagnostics().backpressured === 0,
        { label: "post-resume queue depth recovery" },
      );
    } finally {
      await harness.close();
    }
  });

  await runner.run("closes a real no-progress consumer after the hard backpressure deadline", async () => {
    const marker = "NO-PROGRESS-SECRET";
    const harness = await createHarness({
      queueOptions: {
        maxMessages: 384,
        maxBytes: 4 * 1024 * 1024,
        maxReliableMessages: 384,
        maxReliableBytes: 3 * 1024 * 1024,
        transportHighWaterBytes: 16 * 1024,
        transportLowWaterBytes: 0,
      },
      backpressureTimeoutMs: 200,
      sweepIntervalMs: 100,
    });
    try {
      const client = await harness.admit("no-progress", { ticket: marker, credential: marker });
      client.ws._socket.pause();
      for (let index = 1; index <= 300; index += 1) {
        const queued = await harness.adapter.enqueueReliable(
          client.binding,
          eventFrame("run-a", index, `${String(index).padStart(3, "0")}:${"z".repeat(7_500)}`),
        );
        assert(queued.accepted, `No-progress fixture event ${index} should fit explicit caps`);
      }
      await waitFor(() => harness.adapter.diagnostics().backpressured === 1, {
        timeout: 3_000,
        label: "no-progress transport pressure",
      });
      await waitFor(() => harness.adapter.diagnostics().closing === 1, {
        timeout: 1_500,
        label: "hard no-progress policy close",
      });
      client.ws._socket.resume();
      await waitFor(() => client.close.code !== null, { timeout: 5_000, label: "no-progress transport close" });
      assert(client.close.code === 1013, "No-progress pressure should close transport with retry-later 1013");
      assert(nextFrame(client.messages, "close")?.code === 4008, "No-progress close should retain codec-valid app code 4008");
      const serialized = JSON.stringify({
        close: client.close,
        closeFrames: client.messages.filter((frame) => frame.type === "close" || frame.type === "error"),
        diagnostics: harness.adapter.diagnostics(),
      });
      assert(!serialized.includes(marker), "No-progress diagnostics and close reasons must not contain supplied markers");
      await waitFor(() => harness.adapter.diagnostics().connections === 0, { label: "no-progress cleanup" });
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
