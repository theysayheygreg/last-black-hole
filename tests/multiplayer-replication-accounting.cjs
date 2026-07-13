#!/usr/bin/env node
"use strict";

const { TestRunner, assert } = require("./helpers.cjs");
const { WebSocket } = require("ws");
const {
  createReplicationAccounting,
  frameShape,
  nearestRank,
  summarizeWindow,
  normalizeReconnect,
  reconcileCombinedTraffic,
} = require("../scripts/replication-accounting.cjs");
const {
  createHarness, waitFor, nextFrame, inputFrame, actionFrame, eventFrame,
} = require("./multiplayer-ws-adapter-fixture.cjs");

async function run() {
  const runner = new TestRunner("MultiplayerReplicationAccounting");

  await runner.run("counts the concrete v1 public and owner replication schemas", async () => {
    const world = Object.fromEntries(["wells", "stars", "wrecks", "planetoids", "portals", "scavengers", "fauna", "sentries"]
      .map((key, index) => [key, [{ id: `${key}-${index}`, x: index, y: index + 1, type: key }]]));
    world.nextPortalWaveIndex = 2;
    const frame = { type: "publicState", full: true, state: {
      type: "snapshot", protocolVersion: "2", session: { status: "running" }, tick: 10, simTime: 1,
      fieldRevision: 2, serverTime: 100, lastEventSeq: 4, snapshotId: 3, baselineSnapshotId: null,
      runId: "fixture-run", bodySchemaVersion: 1, snapshotSchemaVersion: 2,
      players: [
        { clientId: "p1", x: 1, y: 2, status: "alive" },
        { clientId: "p2", x: 3, y: 4, status: "alive" },
      ], world, inhibitor: { form: "dormant", wx: 0.5, wy: 0.5 }, despawns: ["gone-1", "gone-2"],
    } };
    const shape = frameShape(frame);
    assert(shape.shapeSchema === "lbh-public-state-v1" && shape.shapeComplete
      && shape.entityCount === 11 && shape.componentCount === 33 && shape.despawnCount === 2
      && shape.otherEntityCount === 0 && shape.unknownStateKeys.length === 0 && shape.unknownWorldKeys.length === 0,
    `Known v1 public shape must be exact and nonzero: ${JSON.stringify(shape)}`);
    const owner = frameShape({ type: "ownerState", state: { playerId: "p1", cargo: [], signal: 0 } });
    assert(owner.shapeSchema === "lbh-owner-state-v1" && owner.shapeComplete
      && owner.entityCount === 1 && owner.componentCount === 2,
    `Owner lane must expose one private projection and its components: ${JSON.stringify(owner)}`);
    const unknown = frameShape({ ...frame, state: { ...frame.state, mysteryEntities: [{ id: "unknown" }] } });
    assert(!unknown.shapeComplete && unknown.otherEntityCount === 1
      && unknown.unknownStateKeys.includes("mysteryEntities"),
    "Unknown public entity collections must be explicit and fail completeness instead of reading as zero");
    const missing = frameShape({ ...frame, state: { ...frame.state, inhibitor: undefined } });
    assert(!missing.shapeComplete && missing.unknownStateKeys.includes("<missing:inhibitor>"),
      "Missing required public entity lanes must be attributed explicitly");
    const invalidMembers = frameShape({ ...frame, state: { ...frame.state,
      players: [...frame.state.players, null], world: { ...world, stars: [null] } } });
    assert(!invalidMembers.shapeComplete
      && invalidMembers.unknownStateKeys.includes("<invalid-member:players>")
      && invalidMembers.unknownWorldKeys.includes("<invalid-member:stars>"),
    "Malformed entity members must fail shape completeness with their exact collection names");
  });

  await runner.run("uses exact nearest-rank and reconnect normalization without double counting", async () => {
    assert(nearestRank([90, 10, 30, 20], 0.5) === 20, "p50 must use ceil(p*N)-1 over sorted values");
    assert(nearestRank([90, 10, 30, 20], 0.95) === 90, "p95 must use nearest rank");
    const normalized = normalizeReconnect({
      nonRecoveryAcceptedDownlinkBytes: 6000,
      nonRecoveryConnectedSeconds: 60,
      reconnectAcceptedDownlinkBytes: 1500,
      reconnectConnectedSeconds: 10,
      coldManifestServedBytes: 2700,
    });
    assert(normalized.recoveryFreeDownlinkBps === 100 && normalized.reconnectExcessBytes === 500,
      "Reconnect excess must subtract its recovery-free baseline exactly once");
    assert(Math.abs(normalized.amortizedDownlinkBps - (100 + 1 + 500 / 2700)) < 1e-12,
      "Amortization must add one manifest and only reconnect excess");
    const syntheticReconciliation = reconcileCombinedTraffic({
      legacyCombinedBytes: 6_500,
      downlinkAcceptedBytes: 6_000,
      uplinkAcceptedBytes: 500,
    });
    assert(syntheticReconciliation.relativeDifference === 0,
      "A directional capture must reconcile to its legacy combined row without inventing a split");
  });

  await runner.run("keeps exact direction, class, recipient, active-time, percentile, and reset ledgers", async () => {
    let timestamp = 1000;
    const accounting = createReplicationAccounting({ now: () => timestamp, maxEvents: 100 });
    const state = { bindingKey: "private-run-and-member", schedulerConnectionId: 7 };
    accounting.inbound(state, { type: "hello" }, 101);
    state.bindingKey = "private-run-and-member";
    accounting.bind(state);
    timestamp += 1000;
    accounting.outbound(state, { type: "publicState", snapshotId: 1 }, "offered", 400);
    accounting.accepted(state, { type: "publicState", snapshotId: 1 }, 400);
    accounting.accepted(state, { type: "ownerState", snapshotId: 1 }, 100);
    accounting.inbound(state, { type: "input" }, 50);
    timestamp += 1000;
    accounting.cleanup(state);
    timestamp = 301000;
    const snapshot = accounting.snapshot();
    const summary = summarizeWindow(snapshot, {
      startAt: 1000, endAt: 301000, evidenceFinalized: true, expectedRecipients: 1, pendingSendCallbacks: 0,
    });
    assert(summary.requestedExactProductWindow && !summary.exactProductWindow
      && summary.aggregate.downlinkAcceptedBytes === 500
      && summary.aggregate.uplinkAcceptedBytes === 151,
    "A short trace must split directions without falsely certifying the requested 300-second product window");
    const recipient = Object.values(summary.recipients)[0];
    assert(recipient.activeSeconds === 2 && recipient.completeProjectionBeats === 1
      && recipient.actualProjectionBeatsPerSecond === 0.5,
    "Connected seconds and complete public-owner beats must be authority-timestamped");
    assert(summary.completePairBytes.p50 === 500 && summary.completePairBytes.p95 === 500,
      "Pair size percentiles must use exact accepted public plus owner bytes");
    const serialized = JSON.stringify(snapshot);
    assert(!serialized.includes("private-run-and-member"), "Accounting must redact raw run and membership identity");
    accounting.reset();
    assert(accounting.snapshot().events.length === 0 && Object.keys(accounting.snapshot().intervals).length === 0,
      "Run reset must clear events, intervals, identities, and epochs");

    timestamp = 400000;
    const fullWindowAccounting = createReplicationAccounting({ now: () => timestamp });
    const fullState = { bindingKey: "full-window-private", schedulerConnectionId: 8 };
    fullWindowAccounting.bind(fullState);
    fullWindowAccounting.accepted(fullState, { type: "publicState", snapshotId: 1, full: true }, 10, null, timestamp);
    fullWindowAccounting.accepted(fullState, { type: "ownerState", snapshotId: 1, full: true }, 5, null, timestamp);
    timestamp = 700000;
    fullWindowAccounting.cleanup(fullState);
    const fullWindow = summarizeWindow(fullWindowAccounting.snapshot(), {
      startAt: 400000, endAt: 700000, evidenceFinalized: true, expectedRecipients: 1, pendingSendCallbacks: 1,
    });
    assert(!fullWindow.exactProductWindow,
      "A 300-second trace with an unsettled send callback must not certify an exact product window");
    const settledFullWindow = summarizeWindow(fullWindowAccounting.snapshot(), {
      startAt: 400000, endAt: 700000, evidenceFinalized: true, expectedRecipients: 1, pendingSendCallbacks: 0,
    });
    assert(settledFullWindow.exactProductWindow,
      "A finalized overflow-free recipient covering the complete 300 seconds may certify an exact capture window");
  });

  await runner.run("does not combine projection halves across connection epochs", async () => {
    let timestamp = 0;
    const accounting = createReplicationAccounting({ now: () => timestamp });
    const state = { bindingKey: "stable-private-binding", schedulerConnectionId: 1, identity: { connectionEpoch: 1 } };
    accounting.bind(state);
    accounting.accepted(state, { type: "publicState", snapshotId: 9, full: true }, 100, null, timestamp);
    state.identity = { connectionEpoch: 2 };
    accounting.accepted(state, { type: "ownerState", snapshotId: 9, full: true }, 50, null, timestamp);
    timestamp = 300000;
    const window = summarizeWindow(accounting.snapshot(), { startAt: 0, endAt: 300000 });
    assert(window.completePairBytes.count === 0,
      "A public half from one connection epoch must not pair with an owner half from another");
  });

  await runner.run("closes the exact overlapping reconnect interval and unions connected seconds", async () => {
    let timestamp = 0;
    const accounting = createReplicationAccounting({ now: () => timestamp });
    const oldState = { bindingKey: "same-private-member", schedulerConnectionId: 1 };
    accounting.bind(oldState);
    timestamp = 5000;
    const newState = { bindingKey: "same-private-member", schedulerConnectionId: 2 };
    accounting.bind(newState);
    timestamp = 6000;
    accounting.cleanup(oldState);
    timestamp = 10000;
    accounting.cleanup(newState);
    const window = summarizeWindow(accounting.snapshot(), { startAt: 0, endAt: 10000 });
    assert(Object.values(window.recipients)[0].activeSeconds === 10,
      "Old-epoch cleanup must close its own interval and overlapping epochs must not double-count seconds");
  });

  await runner.run("merges pending hello ordinals into one stable reconnect recipient", async () => {
    let timestamp = 0;
    const accounting = createReplicationAccounting({ now: () => timestamp });
    const first = { bindingKey: null, schedulerConnectionId: 1 };
    accounting.inbound(first, { type: "hello" }, 20);
    first.bindingKey = "stable-private-member";
    accounting.bind(first);
    timestamp = 1000;
    accounting.cleanup(first);
    const resumed = { bindingKey: null, schedulerConnectionId: 2 };
    accounting.inbound(resumed, { type: "hello" }, 21);
    resumed.bindingKey = "stable-private-member";
    accounting.bind(resumed);
    timestamp = 2000;
    accounting.cleanup(resumed);
    const snapshot = accounting.snapshot();
    assert(new Set(snapshot.events.map((event) => event.recipient)).size === 1
      && Object.keys(snapshot.intervals).length === 1,
    "Pending hello facts and reconnect intervals must canonicalize to one stable recipient ordinal");
    const window = summarizeWindow(snapshot, {
      startAt: 0, endAt: 2000, evidenceFinalized: true, expectedRecipients: 1, pendingSendCallbacks: 0,
    });
    assert(Object.keys(window.recipients).length === 1 && window.completeEvidenceWindow,
      "Canonical cardinality must finalize against the stable recipient, not connection attempts");
  });

  await runner.run("bounds evidence state and stops mutating after the first overflow", async () => {
    let timestamp = 0;
    const accounting = createReplicationAccounting({ now: () => timestamp, maxEvents: 2 });
    const state = { bindingKey: "bounded-private", schedulerConnectionId: 1 };
    accounting.bind(state);
    accounting.inbound(state, { type: "input" }, 10);
    accounting.inbound(state, { type: "input" }, 11);
    accounting.inbound(state, { type: "input" }, 12);
    const failed = accounting.snapshot();
    assert(failed.events.length === 2 && failed.overflow === 1
      && failed.evidenceFailure?.reason === "event-capacity-exceeded",
    "First event overflow must fail evidence explicitly at the fixed cap");
    accounting.inbound(state, { type: "input" }, 13);
    accounting.accepted(state, { type: "event", deliveryId: 1 }, 14, { reliableId: 1 }, timestamp);
    const stopped = accounting.snapshot();
    assert(stopped.events.length === 2 && JSON.stringify(stopped.evidenceFailure) === JSON.stringify(failed.evidenceFailure),
      "No event, ordinal, interval, or reliable state may accumulate after evidence failure");
    const window = summarizeWindow(stopped, {
      startAt: 0, endAt: 300000, evidenceFinalized: true, expectedRecipients: 1, pendingSendCallbacks: 0,
    });
    assert(!window.completeEvidenceWindow, "Overflowed evidence must never certify a product window");
  });

  await runner.run("tracks reliable retransmission across epochs and retires the stable delivery identity", async () => {
    let timestamp = 0;
    const accounting = createReplicationAccounting({ now: () => timestamp });
    const state = {
      bindingKey: "reliable-private", schedulerConnectionId: 1,
      identity: { connectionEpoch: 1 }, replicationRecipient: "recipient-1",
    };
    accounting.bind(state);
    const frame = { type: "event", runId: "run-a", eventSeq: 7, deliveryId: 1 };
    accounting.outbound(state, frame, "offered", 30);
    accounting.accepted(state, frame, 30, { reliableId: 1 }, timestamp);
    state.identity = { connectionEpoch: 2 };
    accounting.outbound(state, frame, "offered", 30);
    accounting.accepted(state, frame, 30, { reliableId: 1 }, timestamp);
    accounting.retire(state, 1);
    state.identity = { connectionEpoch: 3 };
    accounting.outbound(state, frame, "offered", 30);
    accounting.accepted(state, frame, 30, { reliableId: 1 }, timestamp);
    const snapshot = accounting.snapshot();
    assert(snapshot.events.filter((event) => event.metric === "retransmitted").length === 1,
      "The same unretired delivery in epoch two is retransmitted, while ID reuse after retirement is primary");
    const group = Object.values(summarizeWindow(snapshot, { startAt: 0, endAt: 1 }).groups)
      .find((entry) => entry.frameClass === "event");
    assert(group.conservationBalanced && group.unofferedRetransmittedFrames === 0,
      "Each reconnect replay offer must receive its own accepted terminal credit");

    const duplicateAccounting = createReplicationAccounting({ now: () => timestamp });
    const duplicateState = { bindingKey: "duplicate-private", schedulerConnectionId: 2 };
    duplicateAccounting.bind(duplicateState);
    duplicateAccounting.outbound(duplicateState, frame, "offered", 30);
    duplicateAccounting.accepted(duplicateState, frame, 30, { reliableId: 1 }, timestamp);
    duplicateAccounting.accepted(duplicateState, frame, 30, { reliableId: 1 }, timestamp);
    const duplicateGroup = Object.values(summarizeWindow(duplicateAccounting.snapshot(), { startAt: 0, endAt: 1 }).groups)
      .find((entry) => entry.frameClass === "event");
    assert(duplicateGroup.conservationBalanced && duplicateGroup.unofferedRetransmittedFrames === 1,
      "A second physical copy without a second offer must classify separately without breaking conservation");
  });

  await runner.run("groups public keyframes and deltas separately with conserved terminal outcomes", async () => {
    let timestamp = 0;
    const accounting = createReplicationAccounting({ now: () => timestamp });
    const state = { bindingKey: "class-private", schedulerConnectionId: 1 };
    accounting.bind(state);
    const keyframe = { type: "publicState", snapshotId: 1, full: true };
    const delta = { type: "publicState", snapshotId: 2, delta: true };
    accounting.outbound(state, keyframe, "offered", 100);
    accounting.accepted(state, keyframe, 100, null, timestamp);
    accounting.outbound(state, delta, "offered", 20);
    accounting.outbound(state, delta, "sendFailed", 20);
    timestamp = 1000;
    accounting.cleanup(state);
    const groups = summarizeWindow(accounting.snapshot(), { startAt: 0, endAt: 1000 }).groups;
    assert(groups["authority->client|lbh-multiplayer-json-v1|publicState|keyframe"]?.conservationBalanced
      && groups["authority->client|lbh-multiplayer-json-v1|publicState|delta"]?.conservationBalanced,
    "Projection-kind grouping must keep keyframe/delta accounting distinct and exactly conserved");
  });

  await runner.run("excludes asynchronous ws.send failures from accepted traffic", async () => {
    const originalSend = WebSocket.prototype.send;
    let failNextPublic = false;
    WebSocket.prototype.send = function accountingFailureSend(data, ...args) {
      if (this._isServer === true && failNextPublic && JSON.parse(data).type === "publicState") {
        failNextPublic = false;
        const callback = args.find((entry) => typeof entry === "function");
        setImmediate(() => callback?.(new Error("injected transport failure")));
        return;
      }
      return originalSend.call(this, data, ...args);
    };
    const harness = await createHarness({ replicationAccounting: true });
    try {
      const client = await harness.admit("failed-send");
      await waitFor(() => harness.adapter.diagnostics().replication.events.some((event) =>
        event.metric === "accepted" && event.frameClass === "publicState"), { label: "baseline accounting callback" });
      const before = harness.adapter.diagnostics().replication.events.filter((event) =>
        event.metric === "accepted" && event.frameClass === "publicState").length;
      failNextPublic = true;
      await harness.adapter.projectNow();
      await waitFor(() => client.close.code !== null, { label: "injected failed send cleanup" });
      const after = harness.adapter.diagnostics().replication.events.filter((event) =>
        event.metric === "accepted" && event.frameClass === "publicState").length;
      assert(after === before, "A callback-failed physical send must add zero accepted frames and bytes");
      const failed = harness.adapter.diagnostics().replication.events.filter((event) =>
        event.metric === "sendFailed" && event.frameClass === "publicState");
      assert(failed.length === 1, "A callback-failed offered frame must terminate exactly once as sendFailed");
    } finally {
      WebSocket.prototype.send = originalSend;
      await harness.close();
    }
  });

  await runner.run("epoch-fences a delayed successful callback across run rotation", async () => {
    const originalSend = WebSocket.prototype.send;
    let holdNextPublic = false;
    let delayedCallback = null;
    WebSocket.prototype.send = function accountingDelayedSend(data, ...args) {
      if (this._isServer === true && holdNextPublic && JSON.parse(data).type === "publicState") {
        holdNextPublic = false;
        delayedCallback = args.find((entry) => typeof entry === "function") || null;
        return;
      }
      return originalSend.call(this, data, ...args);
    };
    const harness = await createHarness({ replicationAccounting: true });
    try {
      await harness.admit("rotate-delayed-success");
      holdNextPublic = true;
      await harness.adapter.projectNow();
      assert(typeof delayedCallback === "function", "Test must hold one invoked public-state callback");
      harness.adapter.rotateRun("run-b");
      await new Promise((resolve) => setImmediate(resolve));
      assert(harness.adapter.diagnostics().replication.events.length === 0,
        "Run rotation must start with an empty accounting generation");
      delayedCallback(null);
      await new Promise((resolve) => setImmediate(resolve));
      assert(harness.adapter.diagnostics().replication.events.length === 0,
        "A late old-run success callback must not repopulate the fresh ledger");
    } finally {
      WebSocket.prototype.send = originalSend;
      await harness.close();
    }
  });

  await runner.run("outbound-fences a delayed successful callback before same-run rebase", async () => {
    const originalSend = WebSocket.prototype.send;
    let holdNextPublic = false;
    let delayedCallback = null;
    WebSocket.prototype.send = function accountingOutboundFenceSend(data, ...args) {
      if (this._isServer === true && holdNextPublic && JSON.parse(data).type === "publicState") {
        holdNextPublic = false;
        delayedCallback = args.find((entry) => typeof entry === "function") || null;
        return;
      }
      return originalSend.call(this, data, ...args);
    };
    const harness = await createHarness({ replicationAccounting: true });
    try {
      const client = await harness.admit("outbound-fence");
      holdNextPublic = true;
      await harness.adapter.projectNow();
      assert(typeof delayedCallback === "function", "Test must hold one current-run public callback");
      await harness.adapter.sendRebase(client.binding, {
        type: "rebase", runId: "run-a", reason: "baseline-missed", snapshotId: 2, lastEventSeq: 0,
      });
      delayedCallback(null);
      await new Promise((resolve) => setImmediate(resolve));
      const events = harness.adapter.diagnostics().replication.events;
      assert(events.some((event) => event.metric === "otherTerminal" && event.frameClass === "publicState")
        && !events.some((event) => event.metric === "accepted" && event.frameClass === "publicState"
          && event.projectionBeat === 1 && event.connectionEpoch === 1 && event.timestamp === events.at(-1)?.timestamp),
      "A callback behind the outbound-generation barrier must terminate without becoming accepted traffic");
    } finally {
      WebSocket.prototype.send = originalSend;
      await harness.close();
    }
  });

  await runner.run("stale callback errors cannot kill the newer same-run outbound epoch", async () => {
    const originalSend = WebSocket.prototype.send;
    let holdNextPublic = false;
    let delayedCallback = null;
    WebSocket.prototype.send = function accountingStaleErrorSend(data, ...args) {
      if (this._isServer === true && holdNextPublic && JSON.parse(data).type === "publicState") {
        holdNextPublic = false;
        delayedCallback = args.find((entry) => typeof entry === "function") || null;
        return;
      }
      return originalSend.call(this, data, ...args);
    };
    const harness = await createHarness({ replicationAccounting: true });
    try {
      const client = await harness.admit("stale-error-fence");
      holdNextPublic = true;
      await harness.adapter.projectNow();
      await harness.adapter.sendRebase(client.binding, {
        type: "rebase", runId: "run-a", reason: "baseline-missed", snapshotId: 2, lastEventSeq: 0,
      });
      delayedCallback(new Error("late old-epoch send failure"));
      await new Promise((resolve) => setImmediate(resolve));
      assert(client.close.code === null && harness.adapter.diagnostics().connections === 1,
        "A stale send error must settle old accounting without terminating the newer outbound epoch");
      assert(harness.adapter.diagnostics().replication.events.some((event) =>
        event.metric === "sendFailed" && event.frameClass === "publicState"),
      "The stale offered fact must still terminate explicitly as sendFailed");
    } finally {
      WebSocket.prototype.send = originalSend;
      await harness.close();
    }
  });

  await runner.run("stale reliable callbacks cannot delete reused current-epoch retirement evidence", async () => {
    const originalSend = WebSocket.prototype.send;
    let holdNextEvent = false;
    let delayedCallback = null;
    WebSocket.prototype.send = function accountingReliableFenceSend(data, ...args) {
      if (this._isServer === true && holdNextEvent && JSON.parse(data).type === "event") {
        holdNextEvent = false;
        delayedCallback = args.find((entry) => typeof entry === "function") || null;
        return;
      }
      return originalSend.call(this, data, ...args);
    };
    const harness = await createHarness({ replicationAccounting: true });
    try {
      const client = await harness.admit("reliable-reuse-fence");
      holdNextEvent = true;
      await harness.adapter.enqueueReliable(client.binding, eventFrame("run-a", 1, "old-reliable"));
      assert(typeof delayedCallback === "function", "Test must hold the old reliable callback");
      await harness.adapter.sendRebase(client.binding, {
        type: "rebase", runId: "run-a", reason: "baseline-missed", snapshotId: 2, lastEventSeq: 0,
      });
      await harness.adapter.enqueueReliable(client.binding, eventFrame("run-a", 2, "new-reliable"));
      await waitFor(() => client.messages.some((frame) => frame.type === "event" && frame.eventSeq === 2),
        { label: "reused reliable ID current event" });
      delayedCallback(null);
      client.ws.send(JSON.stringify({ type: "ack", ackKind: "delivery", deliveryId: 1 }));
      await waitFor(() => harness.adapter.diagnostics().replication.events.some((event) =>
        event.metric === "ackRetired" && event.reliableId === 1), { label: "identity-bearing ACK retirement" });
      assert(client.close.code === null,
        "A stale reliable callback must not delete or corrupt the newer ID-reused retained record");
    } finally {
      WebSocket.prototype.send = originalSend;
      await harness.close();
    }
  });

  for (const count of [1, 4, 8]) {
    await runner.run(`attributes unchanged v1 wire bytes exactly across ${count} recipient${count === 1 ? "" : "s"}`, async () => {
      const harness = await createHarness({ replicationAccounting: true });
      try {
        const clients = [];
        for (let index = 0; index < count; index += 1) clients.push(await harness.admit(`acct-${count}-${index}`));
        for (let index = 0; index < count; index += 1) {
          clients[index].ws.send(JSON.stringify(inputFrame(1)));
          clients[index].ws.send(JSON.stringify(actionFrame(1, 1)));
        }
        await harness.adapter.projectNow();
        await harness.adapter.projectNow();
        await waitFor(() => clients.every((client) => client.messages.filter((frame) => frame.type === "publicState").length >= 2
          && client.messages.filter((frame) => frame.type === "ownerState").length >= 2),
          { label: `${count}-recipient accounting projection` });
        await waitFor(() => clients.every((client) => client.messages.some((frame) =>
          frame.type === "ack" && frame.ackKind === "action")),
        { label: `${count}-recipient accounting reliable acceptance` });
        for (const client of clients) {
          const reliable = client.messages.find((frame) => frame.type === "ack" && frame.ackKind === "action");
          client.ws.send(JSON.stringify({ type: "ack", ackKind: "delivery", deliveryId: reliable.deliveryId }));
        }
        await waitFor(() => harness.adapter.diagnostics().replication.events.filter((event) =>
          event.metric === "ackRetired" && Number.isSafeInteger(event.reliableId)).length >= count,
        { label: `${count}-recipient identity-bearing ACK retirement` });
        const diagnostic = harness.adapter.diagnostics().replication;
        assert(diagnostic.enabled && diagnostic.overflow === 0, "Opt-in accounting must remain complete");
        assert(new Set(diagnostic.events.map((event) => event.recipientOrdinal)).size === count,
          "Hello and bound traffic must retain one anonymized ordinal per recipient");
        const startAt = Math.min(...diagnostic.events.map((event) => event.timestamp));
        const window = harness.adapter.replicationWindow(startAt, startAt + 300_000);
        const publicAccepted = diagnostic.events.filter((event) => event.metric === "accepted"
          && event.direction === "authority->client" && event.frameClass === "publicState");
        const ownerAccepted = diagnostic.events.filter((event) => event.metric === "accepted"
          && event.direction === "authority->client" && event.frameClass === "ownerState");
        const receivedPublicBytes = clients.reduce((sum, client) => sum + client.rawMessages
          .filter((entry) => JSON.parse(entry).type === "publicState")
          .reduce((subtotal, entry) => subtotal + Buffer.byteLength(entry), 0), 0);
        const receivedOwnerBytes = clients.reduce((sum, client) => sum + client.rawMessages
          .filter((entry) => JSON.parse(entry).type === "ownerState")
          .reduce((subtotal, entry) => subtotal + Buffer.byteLength(entry), 0), 0);
        assert(publicAccepted.reduce((sum, event) => sum + event.bytes, 0) === receivedPublicBytes
          && ownerAccepted.reduce((sum, event) => sum + event.bytes, 0) === receivedOwnerBytes,
        "Authority ws.send acceptance must equal unchanged v1 client wire bytes by state class");
        assert(Object.values(window.recipients).every((row) => row.completeProjectionBeats >= 2),
          `Every recipient must retain independent complete-pair cadence evidence: ${JSON.stringify(window.recipients)}`);
        assert(Object.values(window.groups).filter((group) => group.direction === "authority->client")
          .every((group) => group.conservationBalanced),
        `Every offered downlink path must have one conserved terminal outcome: ${JSON.stringify(window.groups)}`);
        const privateText = JSON.stringify({ diagnostic, window });
        for (let index = 0; index < count; index += 1) {
          assert(!privateText.includes(`membership-acct-${count}-${index}`)
            && !privateText.includes(`player-acct-${count}-${index}`)
            && !privateText.includes(`private-acct-${count}-${index}`),
          "Accounting output must contain no membership, player, or owner payload values");
        }
        assert(nextFrame(clients[0].messages, "welcome")?.wireVersion,
          "Accounting must not alter the negotiated v1 wire surface");
      } finally {
        await harness.close();
      }
    });
  }

  await runner.run("is absent by default and does not alter production frame semantics", async () => {
    let factoryCalls = 0;
    const harness = await createHarness({
      replicationAccountingFactory() { factoryCalls += 1; throw new Error("default-off factory must not run"); },
    });
    try {
      const client = await harness.admit("accounting-default-off");
      assert(harness.adapter.diagnostics().replication === undefined
        && harness.adapter.replicationWindow(0, 300000) === null,
      "Default production adapter must allocate no accounting ledger");
      assert(factoryCalls === 0, "Default-off construction must not allocate accounting state");
      assert(client.messages.map((frame) => frame.type).slice(0, 4).join(",") === "welcome,rebase,publicState,ownerState",
        "Default-off accounting must preserve admission frame order and shape");
    } finally {
      await harness.close();
    }
  });

  runner.summary();
}

run().catch((error) => { console.error(error); process.exitCode = 1; });
