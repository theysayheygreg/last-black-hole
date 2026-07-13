#!/usr/bin/env node
"use strict";

const assert = require("assert");
const { TestRunner } = require("./helpers.cjs");
const { createAuthorityDeltaPublisher } = require("../scripts/authority-delta-publisher.cjs");
const { SERVER_TO_CLIENT, encodeWireFrame } = require("../scripts/multiplayer-wire-protocol.cjs");
const { createClientDeltaReceiver, MIXED_CAPABILITY } = require("../scripts/client-delta-receiver.cjs");

function identity(lag = 0, overrides = {}) {
  return {
    matchId: "ledger-match", sessionId: `ledger-session-${lag}`, authorityIncarnation: 1,
    recipientId: `ledger-member-${lag}`, recipientIncarnation: 1, ...overrides,
  };
}

function context(id, overrides = {}) {
  return { ...id, manifestSchema: "lbh-session-replication-manifest-v1",
    manifestHash: "sha256:ledger-manifest", ...overrides };
}

function component(revision, value) { return { revision, value }; }

function view(id, beat, lane = "public", overrides = {}) {
  const owner = lane === "owner";
  return {
    schema: "lbh-canonical-projection-v1", lane, runId: id.matchId,
    authorityEpoch: id.authorityIncarnation, connectionEpoch: id.recipientIncarnation,
    ballparkEpoch: 1, manifestHash: "sha256:ledger-manifest",
    statePairId: `pair-${beat}`, snapshotId: `snapshot-${beat}`, tick: beat,
    simTime: beat / 10, eventWatermark: beat, fieldRevision: beat, overloadMode: "NORMAL",
    world: owner ? { privatePadding: "o".repeat(4096) } : { global: "p".repeat(4096) },
    entities: owner ? [{ category: "owner", sourceId: id.recipientId, incarnation: 1,
      lifecycleRevision: beat, components: { inventory: component(beat,
        { cargo: [`ore-${beat}`, ...(beat % 2 ? [] : ["ice"])] }) } }]
      : [{ category: "player", sourceId: "seat-1", incarnation: 1, lifecycleRevision: beat,
        components: { transform: component(beat, { x: beat, y: 2 }),
          publicState: component(beat, { active: beat % 2 === 0, hull: `hull-${beat}` }) } }],
    ...overrides,
  };
}

function inputs(id, beat) {
  return { identity: id, publicView: view(id, beat), ownerView: view(id, beat, "owner"), allowMixed: true };
}

function createReceiver(id, options = {}) {
  return createClientDeltaReceiver({ context: context(id),
    capabilities: ["state-pair-v1", MIXED_CAPABILITY], ...options });
}

function wire(frame) { return encodeWireFrame(frame, { direction: SERVER_TO_CLIENT }); }

async function run() {
  const runner = new TestRunner("ClientBaseLedger");

  await runner.run("one through eight beats of ACK lag converge from exact retained atomic bases", () => {
    const authority = createAuthorityDeltaPublisher({ ackRejectDiagnostics: true });
    for (let lag = 1; lag <= 8; lag += 1) {
      const id = identity(lag);
      const receiver = createReceiver(id);
      const first = authority.publish(inputs(id, 1));
      const admitted = receiver.receive(wire(first.frame));
      assert(admitted.accepted);
      assert(authority.acknowledge(id, admitted.ack).accepted);
      const delayed = [];
      for (let beat = 2; beat <= 24; beat += 1) {
        if (delayed.length >= lag) assert(authority.acknowledge(id, delayed.shift()).accepted);
        const published = authority.publish(inputs(id, beat));
        assert.strictEqual(published.publicKind, "delta");
        assert.strictEqual(published.ownerKind, "delta");
        const accepted = receiver.receive(wire(published.frame));
        assert(accepted.accepted, `lag=${lag} beat=${beat} ${JSON.stringify(accepted)}`);
        delayed.push(accepted.ack);
      }
      assert(authority.acknowledge(id, delayed.at(-1)).accepted);
      const diagnostics = receiver.diagnostics();
      assert.strictEqual(diagnostics.recoveryRequests, 0);
      assert.strictEqual(diagnostics.rejected, 0);
      assert(diagnostics.ledgerHits >= 23 && diagnostics.ledger.entries <= 12);
      assert.strictEqual(receiver.current().frameId, 24);
    }
    assert.strictEqual(authority.diagnostics().ackRejectDiagnostics.total, 0);
  });

  await runner.run("out-of-order branches and duplicate mutation cannot roll the visible head backward", () => {
    const id = identity(20);
    const authority = createAuthorityDeltaPublisher();
    const observed = [];
    const receiver = createReceiver(id, { onState: (state) => observed.push(state) });
    const one = authority.publish(inputs(id, 1));
    const base = receiver.receive(wire(one.frame));
    authority.acknowledge(id, base.ack);
    const two = authority.publish(inputs(id, 2));
    const three = authority.publish(inputs(id, 3));
    const four = authority.publish(inputs(id, 4));
    const newest = receiver.receive(wire(four.frame));
    assert(newest.accepted);
    const visible = receiver.current();
    const staleTwo = receiver.receive(wire(two.frame));
    const staleThree = receiver.receive(wire(three.frame));
    assert(staleTwo.accepted && staleTwo.stale && staleThree.accepted && staleThree.stale);
    assert.strictEqual(receiver.current(), visible);
    assert.strictEqual(observed.length, 2);
    const mutated = structuredClone(three.frame);
    mutated.public.resultHash = `sha256:${"f".repeat(64)}`;
    if (mutated.public.kind === "delta") mutated.public.delta.resultHash = mutated.public.resultHash;
    const rejected = receiver.receive(wire(mutated));
    assert.strictEqual(rejected.reason, "duplicate-mismatch");
    assert.strictEqual(receiver.current(), visible);
    assert(Object.isFrozen(visible) && Object.isFrozen(visible.public));
  });

  await runner.run("public and owner lanes cannot splice two different retained atomic bases", () => {
    const id = identity(25);
    const currentBasePublisher = createAuthorityDeltaPublisher();
    const oldBasePublisher = createAuthorityDeltaPublisher();
    const receiver = createReceiver(id);
    const first = currentBasePublisher.publish(inputs(id, 1));
    const admitted = receiver.receive(wire(first.frame));
    assert(currentBasePublisher.acknowledge(id, admitted.ack).accepted);
    assert(oldBasePublisher.acknowledge(id, admitted.ack).accepted === false,
      "the independent publisher must first publish its identical admission frame");
    const oldFirst = oldBasePublisher.publish(inputs(id, 1));
    assert(oldBasePublisher.acknowledge(id, admitted.ack).accepted);
    assert.deepStrictEqual(oldFirst.frame, first.frame);
    const second = currentBasePublisher.publish(inputs(id, 2));
    const acceptedSecond = receiver.receive(wire(second.frame));
    assert(acceptedSecond.accepted);
    assert(currentBasePublisher.acknowledge(id, acceptedSecond.ack).accepted);
    oldBasePublisher.publish(inputs(id, 2));
    const fromSecond = currentBasePublisher.publish(inputs(id, 3)).frame;
    const fromFirst = oldBasePublisher.publish(inputs(id, 3)).frame;
    assert.notStrictEqual(fromSecond.public.baseSnapshotId, fromFirst.owner.baseSnapshotId);
    const spliced = structuredClone(fromSecond);
    spliced.owner = structuredClone(fromFirst.owner);
    const safe = receiver.current();
    const rejected = receiver.receive(wire(spliced));
    assert.strictEqual(rejected.accepted, false);
    assert.strictEqual(rejected.reason, "base-mismatch");
    assert.strictEqual(Object.hasOwn(rejected, "recovery"), false);
    assert.strictEqual(receiver.current(), safe);
  });

  await runner.run("stale despawn and reincarnation branches cannot poison the visible lifecycle head", () => {
    const id = identity(27);
    const visiblePublisher = createAuthorityDeltaPublisher();
    const stalePublisher = createAuthorityDeltaPublisher();
    const receiver = createReceiver(id);
    const first = visiblePublisher.publish(inputs(id, 1));
    const admitted = receiver.receive(wire(first.frame));
    assert(visiblePublisher.acknowledge(id, admitted.ack).accepted);
    const staleFirst = stalePublisher.publish(inputs(id, 1));
    assert.deepStrictEqual(staleFirst.frame, first.frame);
    assert(stalePublisher.acknowledge(id, admitted.ack).accepted);

    const despawnView = view(id, 2, "public", { entities: [] });
    const despawn = visiblePublisher.publish({ ...inputs(id, 2), publicView: despawnView });
    const acceptedDespawn = receiver.receive(wire(despawn.frame));
    assert(acceptedDespawn.accepted && acceptedDespawn.published);
    assert(visiblePublisher.acknowledge(id, acceptedDespawn.ack).accepted);
    visiblePublisher.publish(inputs(id, 3));
    visiblePublisher.publish(inputs(id, 4));
    visiblePublisher.publish(inputs(id, 5));
    const reincarnatedView = view(id, 6, "public", { entities: [{ category: "player",
      sourceId: "seat-1", incarnation: 2, lifecycleRevision: 6,
      components: { transform: component(6, { x: 6, y: 2 }),
        publicState: component(6, { active: true, hull: "hull-6" }) } }] });
    const newest = visiblePublisher.publish({ ...inputs(id, 6), publicView: reincarnatedView });
    const acceptedNewest = receiver.receive(wire(newest.frame));
    assert(acceptedNewest.accepted && acceptedNewest.published);
    const visible = receiver.current();

    stalePublisher.publish(inputs(id, 2));
    const staleDespawn = stalePublisher.publish({ ...inputs(id, 3),
      publicView: view(id, 3, "public", { entities: [] }) });
    const staleReincarnation = stalePublisher.publish({ ...inputs(id, 4),
      publicView: view(id, 4, "public", { entities: [{ category: "player",
        sourceId: "seat-1", incarnation: 2, lifecycleRevision: 4,
        components: { transform: component(4, { x: 4, y: 2 }),
          publicState: component(4, { active: true, hull: "stale-hull" }) } }] }) });
    const acceptedStaleDespawn = receiver.receive(wire(staleDespawn.frame));
    const acceptedStaleReincarnation = receiver.receive(wire(staleReincarnation.frame));
    assert(acceptedStaleDespawn.accepted && acceptedStaleDespawn.stale);
    assert(acceptedStaleReincarnation.accepted && acceptedStaleReincarnation.stale);
    assert.strictEqual(receiver.current(), visible);
    stalePublisher.publish(inputs(id, 5));
    stalePublisher.publish(inputs(id, 6));
    const regressionBridge = stalePublisher.publish({ ...inputs(id, 7),
      publicView: view(id, 7, "public", { entities: [{ category: "player",
        sourceId: "seat-1", incarnation: 1, lifecycleRevision: 7,
        components: { transform: component(7, { x: 7, y: 2 }),
          publicState: component(7, { active: false, hull: "regressed-incarnation" }) } }] }) });
    const rejectedBridge = receiver.receive(wire(regressionBridge.frame));
    assert.strictEqual(rejectedBridge.accepted, false);
    assert.strictEqual(rejectedBridge.reason, "lineage-mismatch");
    assert.strictEqual(receiver.current(), visible);
    assert(visiblePublisher.acknowledge(id, acceptedNewest.ack).accepted);
    const after = visiblePublisher.publish({ ...inputs(id, 7), publicView: view(id, 7, "public", {
      entities: [{ category: "player", sourceId: "seat-1", incarnation: 2, lifecycleRevision: 7,
        components: { transform: component(7, { x: 7, y: 2 }),
          publicState: component(7, { active: false, hull: "hull-7" }) } }],
    }) });
    const acceptedAfter = receiver.receive(wire(after.frame));
    assert(acceptedAfter.accepted && acceptedAfter.published);
    assert.strictEqual(receiver.current().frameId, 7);
  });

  await runner.run("count eviction opens one recovery edge and fences racing deltas until keyframe convergence", () => {
    const id = identity(30);
    const authority = createAuthorityDeltaPublisher({ ackRejectDiagnostics: true });
    const receiver = createReceiver(id, {
      baseLedgerLimits: { maxEntries: 3, maxBytes: 1024 * 1024, maxAgeMs: 15_000,
        minRecoveryIntervalMs: 1 } });
    const one = authority.publish(inputs(id, 1));
    const admitted = receiver.receive(wire(one.frame));
    authority.acknowledge(id, admitted.ack);
    for (let beat = 2; beat <= 4; beat += 1) assert(receiver.receive(wire(authority.publish(inputs(id, beat)).frame)).accepted);
    const visible = receiver.current();
    const missing = authority.publish(inputs(id, 5));
    const firstMiss = receiver.receive(wire(missing.frame));
    assert.strictEqual(firstMiss.reason, "missing-base");
    assert(firstMiss.recovery);
    authority.rebase(id);
    const repeatMiss = receiver.receive(wire(missing.frame));
    assert.strictEqual(Object.hasOwn(repeatMiss, "recovery"), false);
    assert.strictEqual(receiver.receive("{bad-json").accepted, false);
    assert.strictEqual(receiver.current(), visible);
    const recovered = receiver.receive(wire(authority.publish(inputs(id, 6)).frame));
    assert(recovered.accepted && recovered.published);
    assert(authority.acknowledge(id, recovered.ack).accepted);
    const diagnostics = receiver.diagnostics();
    assert.strictEqual(diagnostics.recoveryRequests, 1);
    assert(diagnostics.recoveryCoalesced >= 1);
    assert.strictEqual(diagnostics.recoveryOutstanding, false);
    assert(diagnostics.ledger.evictions > 0 && diagnostics.ledger.evictionReasons["frame-count"] > 0);
    assert.strictEqual(authority.diagnostics().ackRejectDiagnostics.total, 0);
  });

  await runner.run("age binding explicit rebase and teardown clear only their exact receiver ledger", () => {
    let wallMs = 1000;
    const id = identity(40);
    const authority = createAuthorityDeltaPublisher();
    const receiver = createReceiver(id, { now: () => wallMs,
      baseLedgerLimits: { maxEntries: 12, maxBytes: 1024 * 1024, maxAgeMs: 100,
        minRecoveryIntervalMs: 1 } });
    const first = receiver.receive(wire(authority.publish(inputs(id, 1)).frame));
    authority.acknowledge(id, first.ack);
    wallMs += 101;
    const aged = receiver.receive(wire(authority.publish(inputs(id, 2)).frame));
    assert.strictEqual(aged.reason, "missing-base");
    assert.strictEqual(receiver.diagnostics().ledger.evictionReasons.age, 1);
    authority.rebase(id);
    const recoveryFrame = authority.publish(inputs(id, 3)).frame;
    assert(receiver.receive(wire(recoveryFrame)).accepted);
    const safe = receiver.current();
    const explicitRecovery = receiver.rebase("reconnect");
    assert(explicitRecovery && receiver.rebase("reconnect") === null,
      "repeated explicit rebases must coalesce into one outstanding request");
    assert.strictEqual(receiver.diagnostics().ledger.entries, 0);
    assert.strictEqual(receiver.diagnostics().recoveryOutstanding, true);
    assert.strictEqual(receiver.current(), safe, "same-binding rebase may retain presentation but not a delta base");
    const oldRetransmit = receiver.receive(wire(recoveryFrame));
    assert.strictEqual(oldRetransmit.accepted, false);
    assert.strictEqual(Object.hasOwn(oldRetransmit, "ack"), false);
    assert.strictEqual(receiver.diagnostics().ledger.entries, 0);
    const next = identity(40, { recipientIncarnation: 2 });
    receiver.reconnect(context(next));
    assert.strictEqual(receiver.current(), null);
    assert.strictEqual(receiver.diagnostics().ledger.entries, 0);
    receiver.teardown();
    const cleaned = receiver.diagnostics();
    assert(cleaned.closed && cleaned.ledger.entries === 0 && cleaned.ledger.bytes === 0);
  });

  await runner.run("forged base selection malformed cursors and cursor reuse never mutate visible state or storm recovery", () => {
    const id = identity(50);
    const authority = createAuthorityDeltaPublisher();
    const receiver = createReceiver(id);
    const one = authority.publish(inputs(id, 1));
    const accepted = receiver.receive(wire(one.frame));
    authority.acknowledge(id, accepted.ack);
    const safe = receiver.current();
    const delta = authority.publish(inputs(id, 2)).frame;
    for (let index = 0; index < 128; index += 1) {
      const forged = structuredClone(delta);
      const deltaLanes = [forged.public, forged.owner].filter((lane) => lane.kind === "delta");
      assert(deltaLanes.length > 0, "fixture must exercise an advertised base hash");
      const lane = deltaLanes[index % deltaLanes.length];
      lane.baseHash = `sha256:${index.toString(16).padStart(64, "0")}`;
      lane.delta.baseHash = lane.baseHash;
      const result = receiver.receive(wire(forged));
      assert.strictEqual(result.accepted, false);
      assert.strictEqual(result.reason, "base-mismatch");
      assert.strictEqual(Object.hasOwn(result, "recovery"), false);
      assert.strictEqual(receiver.current(), safe);
    }
    const negativeZero = wire(delta).replaceAll('"simTime":0.2', '"simTime":-0');
    const negativeZeroResult = receiver.receive(negativeZero);
    assert.strictEqual(negativeZeroResult.accepted, false);
    assert.strictEqual(Object.hasOwn(negativeZeroResult, "recovery"), false);
    const malformed = receiver.receive("{malformed");
    assert.strictEqual(malformed.accepted, false);
    assert.strictEqual(Object.hasOwn(malformed, "recovery"), false);
    const reused = structuredClone(one.frame);
    reused.frameId = 3;
    const cursorReuse = receiver.receive(wire(reused));
    assert.strictEqual(cursorReuse.accepted, false);
    assert.strictEqual(cursorReuse.reason, "lineage-mismatch", `cursor-reuse ${JSON.stringify(cursorReuse)}`);
    assert.strictEqual(receiver.current(), safe);
    assert.strictEqual(receiver.diagnostics().recoveryRequests, 0);
  });

  process.exit(runner.summary() ? 0 : 1);
}

run().catch((error) => { console.error(error.stack || error); process.exit(1); });
