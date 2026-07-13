#!/usr/bin/env node
"use strict";

const assert = require("assert");
const { TestRunner } = require("./helpers.cjs");
const {
  prepareProjection,
  preparedProjectionView,
  preparedProjectionHash,
} = require("../scripts/canonical-structural-delta.cjs");
const {
  MIXED_ACK_SCHEMA,
  MIXED_PAIR_SCHEMA,
  createAuthorityDeltaPublisher,
} = require("../scripts/authority-delta-publisher.cjs");
const { createClientDeltaReceiver } = require("../scripts/client-delta-receiver.cjs");
const { encodeWireFrame, SERVER_TO_CLIENT } = require("../scripts/multiplayer-wire-protocol.cjs");

const MANIFEST = "sha256:prepared-test-manifest";

function identity(overrides = {}) {
  return { matchId: "match-a", sessionId: "session-a", authorityIncarnation: 1,
    recipientId: "member-a", recipientIncarnation: 1, ...overrides };
}

function entity(beat, incarnation = 1, x = beat) {
  return { category: "player", sourceId: "one", incarnation, lifecycleRevision: beat,
    components: { transform: { revision: beat, value: { x, y: 2 } } } };
}

function view(lane, beat, id = identity(), overrides = {}) {
  const owner = lane === "owner";
  return {
    schema: "lbh-canonical-projection-v1", lane, runId: id.matchId,
    authorityEpoch: id.authorityIncarnation, connectionEpoch: id.recipientIncarnation,
    ballparkEpoch: 1, manifestHash: MANIFEST, statePairId: `pair-${beat}`,
    snapshotId: `snapshot-${beat}`, tick: beat, simTime: beat / 10,
    eventWatermark: beat, fieldRevision: beat, overloadMode: "NORMAL",
    world: owner ? {} : { global: "x".repeat(4096) },
    entities: owner ? [{ category: "owner", sourceId: id.recipientId, incarnation: 1,
      lifecycleRevision: beat, components: { ownerState: { revision: beat,
        value: { cargo: beat % 2 ? ["ore"] : ["ore", "ice"] } } } }] : [entity(beat)],
    ...overrides,
  };
}

function inputs(beat, id = identity(), overrides = {}) {
  return { identity: id, publicView: view("public", beat, id, overrides.public),
    ownerView: view("owner", beat, id, overrides.owner), allowMixed: true };
}

function ack(frame) {
  assert.strictEqual(frame.pairSchema, MIXED_PAIR_SCHEMA);
  return { type: "ack", ackKind: "statePair", ackSchema: MIXED_ACK_SCHEMA,
    matchId: frame.matchId, sessionId: frame.sessionId,
    authorityIncarnation: frame.authorityIncarnation, recipientId: frame.recipientId,
    recipientIncarnation: frame.recipientIncarnation, frameId: frame.frameId,
    statePairId: frame.statePairId, snapshotId: frame.snapshotId,
    publicHash: frame.public.resultHash, ownerHash: frame.owner.resultHash,
    pairSchema: frame.pairSchema, tick: frame.tick, simTime: frame.simTime,
    eventWatermark: frame.eventWatermark, fieldRevision: frame.fieldRevision,
    overloadMode: frame.overloadMode, ballparkEpoch: frame.ballparkEpoch,
    manifestHash: frame.manifestHash, publicKind: frame.public.kind, ownerKind: frame.owner.kind,
    publicBaseSnapshotId: frame.public.baseSnapshotId || null,
    ownerBaseSnapshotId: frame.owner.baseSnapshotId || null };
}

function receiver(id = identity()) {
  return createClientDeltaReceiver({ context: {
    matchId: id.matchId, sessionId: id.sessionId,
    authorityIncarnation: id.authorityIncarnation, recipientId: id.recipientId,
    recipientIncarnation: id.recipientIncarnation,
    manifestSchema: "lbh-session-replication-manifest-v1", manifestHash: MANIFEST,
  }, capabilities: ["state-pair-v1", "state-pair-mixed-v1"] });
}

function context(id, projection) {
  return { schema: projection.schema, manifestHash: projection.manifestHash,
    matchId: id.matchId, sessionId: id.sessionId,
    authorityIncarnation: id.authorityIncarnation, recipientId: id.recipientId,
    recipientIncarnation: id.recipientIncarnation, lane: projection.lane,
    statePairId: projection.statePairId, snapshotId: projection.snapshotId, tick: projection.tick };
}

async function run() {
  const runner = new TestRunner("PreparedReplicationProjections");

  await runner.run("prepared on and off remain wire and materialization identical through recovery paths", async () => {
    const legacy = createAuthorityDeltaPublisher({ preparedProjections: false,
      maxPendingPairsPerRecipient: 2, maxRetainedBytesPerRecipient: 512 * 1024 });
    const prepared = createAuthorityDeltaPublisher({ preparedProjections: true,
      maxPendingPairsPerRecipient: 2, maxRetainedBytesPerRecipient: 512 * 1024 });
    let legacyClient = receiver();
    let preparedClient = receiver();
    const compare = (pairInputs, { acknowledge = true, receive = true } = {}) => {
      const left = legacy.publish(pairInputs);
      const right = prepared.publish(pairInputs);
      const leftWire = encodeWireFrame(left.frame, { direction: SERVER_TO_CLIENT });
      const rightWire = encodeWireFrame(right.frame, { direction: SERVER_TO_CLIENT });
      assert.strictEqual(rightWire, leftWire, "prepared path changed encoded wire bytes");
      assert.deepStrictEqual(right.frame, left.frame, "prepared path changed canonical frame data");
      if (receive) {
        const leftResult = legacyClient.receive(leftWire);
        const rightResult = preparedClient.receive(rightWire);
        assert.deepStrictEqual(rightResult, leftResult);
        assert.deepStrictEqual(preparedClient.current(), legacyClient.current());
      }
      if (acknowledge) {
        assert.deepStrictEqual(prepared.acknowledge(pairInputs.identity, ack(right.frame)),
          legacy.acknowledge(pairInputs.identity, ack(left.frame)));
      }
      return { left, right, leftWire, rightWire };
    };

    compare(inputs(1));
    compare(inputs(2));
    compare(inputs(3, identity(), {
      public: { entities: [entity(2, 1, 2)] },
      owner: { entities: view("owner", 2).entities },
    }));
    compare(inputs(4, identity(), { public: { entities: [] } }));
    compare(inputs(5, identity(), { public: { entities: [entity(5, 2)] } }));
    const lost = compare(inputs(6), { acknowledge: false });
    assert.strictEqual(prepared.retransmit(identity(), lost.right.frame.frameId).frame,
      lost.right.frame, "retransmit must retain the exact frozen frame");
    compare(inputs(7));
    legacy.rebase(identity());
    prepared.rebase(identity());
    compare(inputs(8));
    compare(inputs(9), { acknowledge: false });
    compare(inputs(10), { acknowledge: false });
    compare(inputs(11), { acknowledge: false });
    assert(legacy.diagnostics().pendingPairs <= 2 && prepared.diagnostics().pendingPairs <= 2);

    const reconnected = identity({ sessionId: "session-b", recipientIncarnation: 2 });
    legacyClient = receiver(reconnected);
    preparedClient = receiver(reconnected);
    compare(inputs(1, reconnected));

    const beforeDisconnect = prepared.diagnostics().preparedProjections;
    assert(beforeDisconnect.pendingReferences <= beforeDisconnect.maxPendingReferences
      && beforeDisconnect.ackedReferences <= beforeDisconnect.maxAckedReferences);
    legacy.disconnect(identity());
    prepared.disconnect(identity());
    legacy.disconnect(reconnected);
    prepared.disconnect(reconnected);
    const afterDisconnect = prepared.diagnostics();
    assert.strictEqual(afterDisconnect.recipients, 0);
    assert.strictEqual(afterDisconnect.preparedProjections.pendingReferences, 0);
    assert.strictEqual(afterDisconnect.preparedProjections.ackedReferences, 0);
  });

  await runner.run("opaque prepared values reject forgery mutation and cross-context reuse", async () => {
    const id = identity();
    const raw = view("public", 1, id);
    const prepared = prepareProjection(raw, context(id, raw));
    const frozenHash = preparedProjectionHash(prepared, context(id, raw));
    raw.entities[0].components.transform.value.x = 999;
    const served = preparedProjectionView(prepared, context(id, raw));
    assert.strictEqual(served.entities[0].components.transform.value.x, 1,
      "mutating the source object poisoned the prepared projection");
    assert.strictEqual(preparedProjectionHash(prepared, context(id, raw)), frozenHash);
    assert(Object.isFrozen(prepared) && Object.getPrototypeOf(prepared) === null);
    assert.throws(() => preparedProjectionView(Object.freeze({}), context(id, raw)),
      (error) => error?.code === "invalid-prepared-projection");

    for (const changed of [
      { schema: "lbh-canonical-projection-v2" }, { manifestHash: "sha256:other" },
      { matchId: "match-b" }, { sessionId: "session-b" }, { recipientId: "member-b" },
      { recipientIncarnation: 2 }, { lane: "owner" }, { statePairId: "pair-other" },
      { snapshotId: "snapshot-other" }, { tick: 2 },
    ]) {
      assert.throws(() => preparedProjectionView(prepared, { ...context(id, raw), ...changed }),
        (error) => error?.code === "prepared-context-mismatch");
    }
    assert.throws(() => preparedProjectionView(prepared, { ...context(id, raw), tick: -0 }),
      (error) => error?.code === "invalid-prepared-context");
    const poisoned = JSON.parse('{"schema":"lbh-canonical-projection-v1","lane":"public","runId":"match-a","authorityEpoch":1,"connectionEpoch":1,"ballparkEpoch":1,"manifestHash":"sha256:prepared-test-manifest","statePairId":"pair-1","snapshotId":"snapshot-1","tick":1,"simTime":0.1,"eventWatermark":1,"fieldRevision":1,"overloadMode":"NORMAL","world":{"global":"ok","__proto__":{"polluted":true}},"entities":[]}');
    assert.throws(() => prepareProjection(poisoned, context(id, poisoned)));
    assert.strictEqual({}.polluted, undefined);
    const publisher = createAuthorityDeltaPublisher();
    assert.throws(() => publisher.publish({ ...inputs(1), publicPrepared: prepared }),
      (error) => error?.code === "prepared-input-mismatch",
      "a prepared token cannot stand in for another same-cursor input object");
  });

  await runner.run("prepared call accounting removes repeated canonicalization and hashing", async () => {
    const legacy = createAuthorityDeltaPublisher({ preparedProjections: false });
    const prepared = createAuthorityDeltaPublisher({ preparedProjections: true });
    for (let beat = 1; beat <= 6; beat += 1) {
      const left = legacy.publish(inputs(beat));
      const right = prepared.publish(inputs(beat));
      legacy.acknowledge(identity(), ack(left.frame));
      prepared.acknowledge(identity(), ack(right.frame));
    }
    const left = legacy.diagnostics().preparedProjections;
    const right = prepared.diagnostics().preparedProjections;
    assert(right.canonicalizations < left.canonicalizations, JSON.stringify({ left, right }));
    assert(right.hashes < left.hashes, JSON.stringify({ left, right }));
    assert.strictEqual(right.preparedDiffs, right.diffs);
    assert.strictEqual(left.preparedDiffs, 0);
  });

  if (!runner.summary()) process.exitCode = 1;
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
