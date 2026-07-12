#!/usr/bin/env node
"use strict";

const assert = require("assert");
const http = require("http");
const { createSimWebSocketAdapter } = require("../scripts/sim-ws-adapter.cjs");
const { createSeededFrameScheduler } = require("./network/seeded-frame-scheduler.cjs");
const {
  WIRE_PROTOCOL_VERSION,
  SIM_PROTOCOL_VERSION,
} = require("../scripts/multiplayer-wire-protocol.cjs");
const { waitFor, openClient, hello } = require("./multiplayer-ws-adapter-fixture.cjs");

function frame(runId, snapshotId, type, identity = {}) {
  const common = {
    type,
    runId,
    snapshotId,
    tick: snapshotId,
    simTime: snapshotId / 10,
    lastEventSeq: 0,
    fieldRevision: 1,
    overloadMode: "NORMAL",
    lastInputSeq: 0,
    lastActionSeq: 0,
  };
  if (type === "publicState") {
    return { ...common, manifestHash: "sha256:test", full: true, state: { bodies: [], despawns: [] } };
  }
  return { ...common, membershipId: identity.membershipId, playerId: identity.playerId,
    state: { privateMarker: identity.membershipId } };
}

function createSchedulerSeam(scheduler) {
  const pending = new Map();
  const contexts = [];
  function scheduleOutboundFrame(wire, context, deliver) {
    contexts.push(context);
    const outcome = scheduler.schedule(wire, {
      cohort: "adapter-contract",
      playerId: context.playerId,
      membershipId: context.membershipId,
      connectionEpoch: context.connectionEpoch,
      direction: context.direction,
      frameClass: context.frameClass,
      frameType: context.frameType,
      semanticId: context.semanticId,
    });
    const record = { deliver, remaining: outcome.decision.copies, cancelled: false };
    if (record.remaining > 0) pending.set(outcome.ordinal, record);
    return {
      accepted: outcome.accepted,
      deliveryCount: outcome.decision.copies,
      cancel() {
        record.cancelled = true;
        pending.delete(outcome.ordinal);
      },
    };
  }
  function release(items) {
    for (const item of items) {
      const record = pending.get(item.originalOrdinal);
      if (!record || record.cancelled) continue;
      record.deliver();
      record.remaining -= 1;
      if (record.remaining === 0) pending.delete(item.originalOrdinal);
    }
  }
  return {
    scheduleOutboundFrame,
    releaseNow(options) { release(scheduler.releaseDue(options)); },
    advanceTo(time, options) { release(scheduler.advanceTo(time, options)); },
    pendingCount: () => pending.size,
    contexts,
    reset() { pending.clear(); scheduler.reset(); },
  };
}

async function createHarness({ scheduleOutboundFrame } = {}) {
  const server = http.createServer((_request, response) => response.writeHead(404).end());
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const baseUrl = `ws://127.0.0.1:${server.address().port}`;
  const tickets = new Map();
  const bindings = [];
  const actions = [];
  const acks = [];
  let ticketOrdinal = 0;
  let snapshotId = 1;

  const adapter = createSimWebSocketAdapter({
    server,
    runId: "run-impairment",
    heartbeatIntervalMs: 60_000,
    sweepIntervalMs: 1_000,
    scheduleOutboundFrame,
    async redeemHello(wireFrame) {
      const claim = tickets.get(wireFrame.admissionTicket);
      if (!claim) throw Object.assign(new Error("ticket rejected"), { publicCode: "admission-rejected", closeCode: 4401 });
      tickets.delete(wireFrame.admissionTicket);
      const binding = { ...claim, runId: "run-impairment", current: true, lastEventSeq: 0, snapshotId: 1 };
      bindings.push(binding);
      const identity = {
        runId: binding.runId,
        membershipId: binding.membershipId,
        playerId: binding.playerId,
        connectionId: `connection-${binding.name}-${binding.epoch}`,
        connectionEpoch: binding.epoch,
      };
      return {
        binding,
        bindingKey: { runId: binding.runId, membershipId: binding.membershipId },
        welcome: {
          type: "welcome",
          wireVersion: WIRE_PROTOCOL_VERSION,
          simProtocolVersion: SIM_PROTOCOL_VERSION,
          ...identity,
          commandCredential: `credential-${binding.name}`,
          lastCommandSeq: 0,
          nextCommandSeq: 1,
          lastInputSeq: 0,
          lastActionSeq: 0,
          heartbeatIntervalMs: 60_000,
          reconnected: binding.epoch > 1,
        },
        rebase: { type: "rebase", runId: binding.runId, reason: "initial", snapshotId: 1, lastEventSeq: 0 },
        baselineFrames: [frame(binding.runId, 1, "publicState"), frame(binding.runId, 1, "ownerState", identity)],
      };
    },
    async revalidateBinding(binding) { return binding.current; },
    async onInput(_binding, input) { return { type: "ack", ackKind: "input", inputSeq: input.inputSeq }; },
    async onAction(binding, action) {
      actions.push({ binding, action });
      return { type: "ack", ackKind: "action", actionId: action.actionId, actionSeq: action.actionSeq,
        commandSeq: action.commandSeq, status: "accepted", result: { pulsed: true } };
    },
    async onAck(binding, ack) { acks.push({ binding, ack }); },
    async buildPublicState() {
      snapshotId += 1;
      return frame("run-impairment", snapshotId, "publicState");
    },
    async buildOwnerState(binding, publicFrame) {
      return frame(publicFrame.runId, publicFrame.snapshotId, "ownerState", binding);
    },
  });

  function issueTicket(name, epoch = 1) {
    const ticket = `ticket-${name}-${epoch}-${++ticketOrdinal}`;
    tickets.set(ticket, {
      name,
      epoch,
      playerId: `player-${name}`,
      membershipId: `membership-${name}`,
    });
    return ticket;
  }

  async function beginAdmission(name, epoch = 1) {
    const client = await openClient(`${baseUrl}/stream`);
    client.ws.send(JSON.stringify(hello(issueTicket(name, epoch))));
    await waitFor(() => bindings.some((binding) => binding.name === name && binding.epoch === epoch), {
      label: `${name} binding`,
    });
    return client;
  }

  async function close() {
    await adapter.shutdown();
    await new Promise((resolve) => server.close(resolve));
  }

  return { adapter, bindings, actions, acks, beginAdmission, close };
}

async function admit(harness, seam, name, epoch, releaseAt = 0) {
  const client = await harness.beginAdmission(name, epoch);
  await waitFor(() => client.messages.some((message) => message.type === "welcome"), { label: `${name} welcome` });
  if (seam) seam.advanceTo(releaseAt, { flush: true });
  await waitFor(() => client.messages.some((message) => message.type === "publicState")
    && client.messages.some((message) => message.type === "ownerState"), { label: `${name} baseline` });
  client.binding = harness.bindings.findLast((binding) => binding.name === name && binding.epoch === epoch);
  return client;
}

async function run(name, test) {
  try {
    await test();
    console.log(`  PASS: ${name}`);
    return true;
  } catch (error) {
    console.error(`  FAIL: ${name}`);
    console.error(error.stack || error.message);
    return false;
  }
}

async function main() {
  let passed = 0;
  let failed = 0;
  async function test(name, callback) {
    if (await run(name, callback)) passed += 1;
    else failed += 1;
  }

  await test("keeps the default transport path identical to an immediate injected seam", async () => {
    const direct = await createHarness();
    const injected = await createHarness({ scheduleOutboundFrame(wire, _context, deliver) {
      deliver();
      return { accepted: true, deliveryCount: 1 };
    } });
    try {
      const directClient = await admit(direct, null, "parity", 1);
      const injectedClient = await admit(injected, null, "parity", 1);
      assert.deepStrictEqual(injectedClient.rawMessages, directClient.rawMessages);
      assert.strictEqual(injected.adapter.diagnostics().pendingScheduledSends, 0);
    } finally {
      await Promise.all([direct.close(), injected.close()]);
    }
  });

  await test("bypasses scheduling for reliable delivery IDs and preserves cumulative ACK ordering", async () => {
    const scheduler = createSeededFrameScheduler({ rootSeed: 11n,
      rules: { "authority-to-client": { event: { delayMs: 25, reorderWindow: 1, duplicateRate: 1 } } } });
    const seam = createSchedulerSeam(scheduler);
    const harness = await createHarness({ scheduleOutboundFrame: seam.scheduleOutboundFrame });
    try {
      const client = await admit(harness, seam, "ack", 1, 0);
      const binding = harness.bindings.find((entry) => entry.name === "ack");
      const first = await harness.adapter.enqueueReliable(binding, { type: "event", runId: "run-impairment",
        eventSeq: 1, tick: 1, visibility: "owner", eventType: "test.first", payload: {} });
      const second = await harness.adapter.enqueueReliable(binding, { type: "event", runId: "run-impairment",
        eventSeq: 2, tick: 2, visibility: "owner", eventType: "test.second", payload: {} });
      assert(first.accepted && second.accepted);
      const events = await waitFor(() => {
        const value = client.messages.filter((message) => message.type === "event");
        return value.length === 2 ? value : null;
      }, { label: "immediate reliable events" });
      assert.deepStrictEqual(events.map((event) => event.deliveryId), [1, 2]);
      assert.strictEqual(seam.contexts.filter((context) => context.frameType === "event").length, 0,
        "The impairment scheduler must never observe reliable delivery frames");
      assert.strictEqual(harness.adapter.diagnostics().queuedMessages, 2);
      client.ws.send(JSON.stringify({ type: "ack", ackKind: "delivery", deliveryId: second.frame.deliveryId }));
      await waitFor(() => harness.adapter.diagnostics().queuedMessages === 0, { label: "delivery retention release" });
    } finally {
      await harness.close();
    }
  });

  await test("can expose a public/owner half-pair without merging or mutating either frame", async () => {
    const scheduler = createSeededFrameScheduler({ rootSeed: 12n,
      rules: { "authority-to-client": { ownerState: { delayMs: 20 } } } });
    const seam = createSchedulerSeam(scheduler);
    const harness = await createHarness({ scheduleOutboundFrame: seam.scheduleOutboundFrame });
    try {
      const client = await admit(harness, seam, "pair", 1, 20);
      const publicBefore = client.messages.filter((message) => message.type === "publicState").length;
      const ownerBefore = client.messages.filter((message) => message.type === "ownerState").length;
      await harness.adapter.projectNow();
      seam.releaseNow();
      await waitFor(() => client.messages.filter((message) => message.type === "publicState").length === publicBefore + 1,
        { label: "unpaired public state" });
      assert.strictEqual(client.messages.filter((message) => message.type === "ownerState").length, ownerBefore);
      seam.advanceTo(40);
      await waitFor(() => client.messages.filter((message) => message.type === "ownerState").length === ownerBefore + 1,
        { label: "delayed owner state" });
      const latestPublic = client.messages.filter((message) => message.type === "publicState").at(-1);
      const latestOwner = client.messages.filter((message) => message.type === "ownerState").at(-1);
      assert.strictEqual(latestOwner.snapshotId, latestPublic.snapshotId);
    } finally {
      await harness.close();
    }
  });

  await test("discards complete non-reliable state frames during a blackout without calling it packet loss", async () => {
    const scheduler = createSeededFrameScheduler({ rootSeed: 13n,
      blackouts: [{ startMs: 10, endMs: 20, mode: "discard", direction: "authority-to-client" }] });
    const seam = createSchedulerSeam(scheduler);
    const harness = await createHarness({ scheduleOutboundFrame: seam.scheduleOutboundFrame });
    try {
      const client = await admit(harness, seam, "blackout", 1, 0);
      const stateCount = client.messages.filter((message) => message.type === "publicState" || message.type === "ownerState").length;
      seam.advanceTo(10);
      await harness.adapter.projectNow();
      seam.releaseNow({ flush: true });
      await new Promise((resolve) => setTimeout(resolve, 20));
      assert.strictEqual(client.messages.filter((message) => message.type === "publicState" || message.type === "ownerState").length,
        stateCount);
      assert(scheduler.decisionLog().some((entry) => entry.metadata.frameClass === "publicState"
        && entry.decision.blackout === "discard" && entry.decision.copies === 0));
    } finally {
      await harness.close();
    }
  });

  await test("fences an old-epoch delayed frame after a replacement connection becomes current", async () => {
    let holdPublicState = false;
    const held = [];
    const harness = await createHarness({ scheduleOutboundFrame(wire, context, deliver) {
      if (holdPublicState && context.frameClass === "publicState") {
        const record = { wire, context, deliver, cancelled: false };
        held.push(record);
        return { accepted: true, deliveryCount: 1, cancel() { record.cancelled = true; } };
      }
      deliver();
      return { accepted: true, deliveryCount: 1 };
    } });
    try {
      const oldClient = await admit(harness, null, "epoch", 1);
      holdPublicState = true;
      await harness.adapter.projectNow();
      assert.strictEqual(held.length, 1);
      holdPublicState = false;
      const newClient = await admit(harness, null, "epoch", 2);
      await waitFor(() => oldClient.close.code !== null, { label: "old epoch close" });
      assert.strictEqual(held[0].deliver(), false);
      assert(!newClient.messages.some((message) => message.type === "publicState" && message.snapshotId === 2));
    } finally {
      await harness.close();
    }
  });

  await test("makes same-socket rebase an immediate barrier that cancels held old-epoch work", async () => {
    let holdPublicState = false;
    const scheduledTypes = [];
    const held = [];
    const harness = await createHarness({ scheduleOutboundFrame(wire, context, deliver) {
      scheduledTypes.push(context.frameType);
      if (holdPublicState && context.frameType === "publicState") {
        const record = { wire, context, deliver, cancelled: false };
        held.push(record);
        return { accepted: true, deliveryCount: 1, cancel() { record.cancelled = true; } };
      }
      deliver();
      return { accepted: true, deliveryCount: 1 };
    } });
    try {
      const client = await admit(harness, null, "same-socket-rebase", 1);
      const binding = client.binding;
      assert(!scheduledTypes.includes("welcome") && !scheduledTypes.includes("rebase"),
        "Delivery-epoch barriers must never enter the impairment scheduler");

      holdPublicState = true;
      await harness.adapter.projectNow();
      assert.strictEqual(held.length, 1);
      const result = await harness.adapter.sendRebase(binding, {
        type: "rebase",
        runId: "run-impairment",
        reason: "server-recovery",
        snapshotId: 3,
        lastEventSeq: 0,
      });
      assert.deepStrictEqual(result, { accepted: true, action: "sent" });
      assert.strictEqual(held[0].cancelled, true);
      assert.strictEqual(held[0].deliver(), false, "Cancelled old-generation callback must stay inert");
      assert.strictEqual(harness.adapter.diagnostics().pendingScheduledSends, 0);

      const reliable = await harness.adapter.enqueueReliable(binding, {
        type: "event",
        runId: "run-impairment",
        eventSeq: 1,
        tick: 3,
        visibility: "owner",
        eventType: "test.after-rebase",
        payload: {},
      });
      assert(reliable.accepted && reliable.frame.deliveryId === 1,
        "The new delivery epoch must restart reliable IDs at one");
      await waitFor(() => client.messages.some((message) => message.type === "event"), {
        label: "post-rebase reliable event",
      });
      const ordered = client.messages.filter((message) => message.type === "rebase" || message.type === "event").slice(-2);
      assert.deepStrictEqual(ordered.map((message) => [message.type, message.deliveryId]), [
        ["rebase", undefined],
        ["event", 1],
      ]);
      assert.strictEqual(scheduledTypes.filter((type) => type === "rebase").length, 0);
      assert.strictEqual(scheduledTypes.filter((type) => type === "event").length, 0,
        "Reliable scheduling remains gated after the barrier lands");
    } finally {
      await harness.close();
    }
  });

  await test("fences held callbacks across run rotation and shutdown", async () => {
    async function exercise(operation, label) {
      let holdPublicState = false;
      const held = [];
      const harness = await createHarness({ scheduleOutboundFrame(_wire, context, deliver) {
        if (holdPublicState && context.frameType === "publicState") {
          const record = { deliver, cancelled: false };
          held.push(record);
          return { accepted: true, deliveryCount: 1, cancel() { record.cancelled = true; } };
        }
        deliver();
        return { accepted: true, deliveryCount: 1 };
      } });
      try {
        const client = await admit(harness, null, label, 1);
        holdPublicState = true;
        await harness.adapter.projectNow();
        assert.strictEqual(held.length, 1);
        await operation(harness.adapter);
        assert.strictEqual(held[0].cancelled, true);
        assert.strictEqual(held[0].deliver(), false);
        assert.strictEqual(harness.adapter.diagnostics().pendingScheduledSends, 0);
        client.ws.terminate();
      } finally {
        await harness.close();
      }
    }

    await exercise((adapter) => adapter.rotateRun("run-rotated"), "rotation-fence");
    await exercise((adapter) => adapter.shutdown(), "shutdown-fence");
  });

  await test("accounts for deterministic duplicate delivery of non-reliable complete frames", async () => {
    const scheduler = createSeededFrameScheduler({ rootSeed: 14n,
      rules: { "authority-to-client": { publicState: { duplicateRate: 1 } } } });
    const seam = createSchedulerSeam(scheduler);
    const harness = await createHarness({ scheduleOutboundFrame: seam.scheduleOutboundFrame });
    try {
      const client = await admit(harness, seam, "duplicate", 1, 0);
      const publicBefore = client.rawMessages.filter((wire) => JSON.parse(wire).type === "publicState").length;
      const ownerBefore = client.messages.filter((message) => message.type === "ownerState").length;
      await harness.adapter.projectNow();
      seam.releaseNow({ flush: true });
      await waitFor(() => client.messages.filter((message) => message.type === "publicState").length === publicBefore + 2,
        { label: "duplicate complete public states" });
      const publicWires = client.rawMessages.filter((wire) => JSON.parse(wire).type === "publicState").slice(-2);
      assert.strictEqual(publicWires[0], publicWires[1]);
      assert.strictEqual(client.messages.filter((message) => message.type === "ownerState").length, ownerBefore + 1);
      assert.strictEqual(harness.adapter.diagnostics().pendingScheduledSends, 0);
    } finally {
      await harness.close();
    }
  });

  await test("bypasses scheduling for terminal error and close frames", async () => {
    const scheduledTypes = [];
    const harness = await createHarness({ scheduleOutboundFrame(_wire, context, deliver) {
      scheduledTypes.push(context.frameType);
      deliver();
      return { accepted: true, deliveryCount: 1 };
    } });
    try {
      const client = await admit(harness, null, "terminal", 1);
      client.ws.send("{not-json");
      await waitFor(() => client.close.code !== null, { label: "terminal protocol close" });
      assert(client.messages.some((message) => message.type === "error"));
      assert(client.messages.some((message) => message.type === "close"));
      assert(!scheduledTypes.includes("error") && !scheduledTypes.includes("close"),
        "Terminal frames must retain immediate transport semantics");
    } finally {
      await harness.close();
    }
  });

  await test("cancels adapter work on cleanup and resets the external deterministic queue", async () => {
    const scheduler = createSeededFrameScheduler({ rootSeed: 15n,
      rules: { "authority-to-client": { publicState: { delayMs: 100 } } } });
    const seam = createSchedulerSeam(scheduler);
    const harness = await createHarness({ scheduleOutboundFrame: seam.scheduleOutboundFrame });
    try {
      const client = await admit(harness, seam, "cleanup", 1, 100);
      await harness.adapter.projectNow();
      seam.releaseNow();
      assert.strictEqual(harness.adapter.diagnostics().pendingScheduledSends, 1);
      client.ws.terminate();
      await waitFor(() => harness.adapter.diagnostics().connections === 0, { label: "scheduled cleanup" });
      assert.strictEqual(harness.adapter.diagnostics().pendingScheduledSends, 0);
      assert.strictEqual(seam.pendingCount(), 0);
      seam.reset();
      assert.deepStrictEqual(scheduler.status(), { nowMs: 0, queuedItems: 0, queuedBytes: 0, retainedBlocks: 0,
        evidenceEntries: 0, evidenceBytes: 0, decisions: 0, terminalReason: null });
    } finally {
      await harness.close();
    }
  });

  console.log(`\nMultiplayerWsAdapterImpairment: ${passed} passed, ${failed} failed`);
  if (failed > 0) process.exitCode = 1;
}

main().catch((error) => {
  console.error(error.stack || error.message);
  process.exitCode = 1;
});
