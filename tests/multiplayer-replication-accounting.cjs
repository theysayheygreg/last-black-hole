#!/usr/bin/env node
"use strict";

const { TestRunner, assert } = require("./helpers.cjs");
const { WebSocket } = require("ws");
const {
  createReplicationAccounting,
  nearestRank,
  summarizeWindow,
  normalizeReconnect,
  reconcileCombinedTraffic,
} = require("../scripts/replication-accounting.cjs");
const {
  createHarness, waitFor, nextFrame, inputFrame, actionFrame,
} = require("./multiplayer-ws-adapter-fixture.cjs");

async function run() {
  const runner = new TestRunner("MultiplayerReplicationAccounting");

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
