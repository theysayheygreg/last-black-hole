#!/usr/bin/env node
"use strict";

const assert = require("assert");
const { TestRunner } = require("./helpers.cjs");
const {
  createAuthorityDeltaPublisher,
} = require("../scripts/authority-delta-publisher.cjs");
const {
  CLIENT_TO_SERVER,
  SERVER_TO_CLIENT,
  SIM_PROTOCOL_VERSION,
  WIRE_PROTOCOL_VERSION_V2,
  encodeWireFrame,
} = require("../scripts/multiplayer-wire-protocol.cjs");
const { createHarness, openClient, waitFor, nextFrame } = require("./multiplayer-ws-adapter-fixture.cjs");
const {
  MODES,
  MIXED_CAPABILITY,
  RUNTIME_PUBLIC_COMPONENTS_CAPABILITY,
  RECOVERY_SCHEMA,
  selectClientReplicationMode,
  createClientDeltaReceiver,
} = require("../scripts/client-delta-receiver.cjs");

function identity(overrides = {}) {
  return {
    matchId: "match-client",
    sessionId: "session-client",
    authorityIncarnation: 3,
    recipientId: "member-client",
    recipientIncarnation: 2,
    ...overrides,
  };
}

function context(id = identity(), overrides = {}) {
  return {
    ...id,
    manifestSchema: "lbh-session-replication-manifest-v1",
    manifestHash: "sha256:manifest-client",
    ...overrides,
  };
}

function component(revision, value) { return { revision, value }; }

function publicEntity(sourceId, beat, incarnation = 1) {
  return {
    category: "player", sourceId, incarnation, lifecycleRevision: beat,
    components: {
      transform: component(beat, { x: beat * 2, y: 3, heading: beat % 8 }),
      publicState: component(1, { hull: "drifter", active: true }),
    },
  };
}

function ownerEntity(id, beat) {
  return {
    category: "owner", sourceId: id.recipientId, incarnation: 1, lifecycleRevision: beat,
    components: {
      inventory: component(beat, { cargo: beat % 2 ? ["ore"] : ["ore", "ice"] }),
      cooldowns: component(Math.min(beat, 4), { pulse: Math.max(0, 4 - beat) }),
    },
  };
}

function view({ lane = "public", beat = 1, id = identity(), manifestHash = "sha256:manifest-client",
  entities = null, padding = "x".repeat(8 * 1024), ballparkEpoch = 4,
  tick = beat, simTime = beat / 10, eventWatermark = beat, fieldRevision = beat,
  overloadMode = "NORMAL" } = {}) {
  const owner = lane === "owner";
  return {
    schema: "lbh-canonical-projection-v1",
    lane,
    runId: id.matchId,
    authorityEpoch: id.authorityIncarnation,
    connectionEpoch: id.recipientIncarnation,
    ballparkEpoch,
    manifestHash,
    statePairId: `pair-${beat}`,
    snapshotId: `snapshot-${beat}`,
    tick,
    simTime,
    eventWatermark,
    fieldRevision,
    overloadMode,
    world: owner ? { privatePadding: padding } : { global: padding },
    entities: entities ?? (owner ? [ownerEntity(id, beat)] : [publicEntity("seat-1", beat)]),
  };
}

function inputs(beat, id = identity(), overrides = {}) {
  return {
    identity: id,
    publicView: view({ beat, id, ...(overrides.public || {}) }),
    ownerView: view({ lane: "owner", beat, id, ...(overrides.owner || {}) }),
  };
}

function wire(frame) {
  return encodeWireFrame(frame, { direction: SERVER_TO_CLIENT });
}

function accept(authority, receiver, published, id = identity()) {
  const result = receiver.receive(wire(published.frame));
  assert.strictEqual(result.accepted, true, JSON.stringify(result));
  assert.strictEqual(authority.acknowledge(id, result.ack).accepted, true);
  return result;
}

async function run() {
  const runner = new TestRunner("ClientDeltaReceiver");

  await runner.run("keyframe, delta, and no-op beats materialize and ACK atomically", async () => {
    let receiver;
    const observed = [];
    receiver = createClientDeltaReceiver({
      context: context(),
      onState(pair) {
        assert.strictEqual(receiver.current(), pair, "observer must see the committed complete pair");
        assert(pair.public && pair.owner, "observer must never see one lane without the other");
        observed.push(pair);
      },
    });
    const authority = createAuthorityDeltaPublisher();
    const first = authority.publish(inputs(1));
    assert.strictEqual(first.projectionKind, "keyframe");
    const acceptedFirst = accept(authority, receiver, first);
    const second = authority.publish(inputs(2));
    assert.strictEqual(second.projectionKind, "delta");
    const acceptedSecond = accept(authority, receiver, second);
    const noOpEntities = acceptedSecond.state.public.entities.map((entity) => ({
      ...entity,
      components: { ...entity.components },
    }));
    const third = authority.publish(inputs(3, identity(), {
      public: { entities: noOpEntities },
    }));
    accept(authority, receiver, third);
    assert.strictEqual(observed.length, 3);
    assert.strictEqual(acceptedFirst.ack.publicHash, first.frame.public.resultHash);
    assert.strictEqual(acceptedSecond.ack.ownerHash, second.frame.owner.resultHash);
    assert(Object.isFrozen(receiver.current()) && Object.isFrozen(receiver.current().owner), "published pair must be immutable");
    assert.notStrictEqual(receiver.current().public, receiver.current().owner, "lane bases must be independent objects");
  });

  await runner.run("mixed public delta and owner keyframe publish once and ACK both lanes", async () => {
    const observed = [];
    const authority = createAuthorityDeltaPublisher();
    const receiver = createClientDeltaReceiver({
      context: context(),
      capabilities: ["state-pair-v1", MIXED_CAPABILITY],
      onState(pair) {
        assert(pair.public && pair.owner, "observer may only receive a complete committed pair");
        observed.push(pair);
      },
    });
    const baseInputs = inputs(1, identity(), { owner: { padding: "" } });
    const first = authority.publish({ ...baseInputs, allowMixed: true });
    accept(authority, receiver, first);
    const mixed = authority.publish({
      ...inputs(2, identity(), { owner: { padding: "" } }), allowMixed: true,
    });
    assert.deepStrictEqual([mixed.frame.public.kind, mixed.frame.owner.kind], ["delta", "keyframe"]);
    const accepted = accept(authority, receiver, mixed);
    assert.strictEqual(observed.length, 2);
    assert.strictEqual(accepted.ack.publicKind, "delta");
    assert.strictEqual(accepted.ack.ownerKind, "keyframe");
    assert.strictEqual(accepted.ack.publicBaseSnapshotId, first.frame.snapshotId);
    assert.strictEqual(accepted.ack.ownerBaseSnapshotId, null);
    assert.strictEqual(receiver.diagnostics().mixed, 1);
    const legacyReceiver = createClientDeltaReceiver({ context: context() });
    assert.strictEqual(legacyReceiver.receive(wire(mixed.frame)).accepted, false,
      "state-pair-v1 receiver must reject a mixed schema it did not negotiate");
    const boundedMixedReceiver = createClientDeltaReceiver({
      context: context(), capabilities: ["state-pair-v1", MIXED_CAPABILITY], maxPairBytes: 1024,
    });
    const oversizeMixed = boundedMixedReceiver.receive(wire(mixed.frame));
    assert.strictEqual(oversizeMixed.accepted, false);
    assert.strictEqual(oversizeMixed.reason, "oversize-frame");

    const forged = authority.publish({
      ...inputs(3, identity(), { owner: { padding: "" } }), allowMixed: true,
    });
    const corrupt = structuredClone(forged.frame);
    corrupt.owner.resultHash = `sha256:${"0".repeat(64)}`;
    const rejected = receiver.receive(JSON.stringify(corrupt));
    assert.strictEqual(rejected.accepted, false);
    assert.strictEqual(Object.hasOwn(rejected, "ack"), false);
    assert.strictEqual(observed.length, 2, "failed owner lane must not expose the valid public delta");
    assert.strictEqual(receiver.current(), accepted.state, "forged lane must not erase the last safe visible pair");
  });

  await runner.run("ACK loss, retransmit, and exact duplicate delivery are idempotent", async () => {
    let observations = 0;
    const authority = createAuthorityDeltaPublisher();
    const receiver = createClientDeltaReceiver({ context: context(), onState: () => { observations += 1; } });
    const first = authority.publish(inputs(1));
    const one = receiver.receive(wire(first.frame));
    const duplicate = receiver.receive(wire(authority.retransmit(identity(), first.frame.frameId).frame));
    assert.strictEqual(one.accepted, true);
    assert.strictEqual(duplicate.accepted, true);
    assert.strictEqual(duplicate.duplicate, true);
    assert.deepStrictEqual(duplicate.ack, one.ack);
    assert.strictEqual(observations, 1, "duplicate must not expose state twice");
    assert.strictEqual(authority.acknowledge(identity(), duplicate.ack).accepted, true);
    assert.strictEqual(authority.publish(inputs(2)).projectionKind, "delta");
  });

  await runner.run("duplicate frame IDs with changed canonical bytes fail closed", async () => {
    const receiver = createClientDeltaReceiver({ context: context() });
    const first = createAuthorityDeltaPublisher().publish(inputs(1));
    assert.strictEqual(receiver.receive(wire(first.frame)).accepted, true);
    const safe = receiver.current();
    assert.strictEqual(receiver.receive("{malformed").accepted, false, "malformed input must fail closed");
    const changed = createAuthorityDeltaPublisher().publish(inputs(2));
    assert.strictEqual(changed.frame.frameId, first.frame.frameId);
    const result = receiver.receive(wire(changed.frame));
    assert.strictEqual(result.accepted, false);
    assert.strictEqual(result.reason, "duplicate-mismatch");
    assert.strictEqual(receiver.current(), safe, "duplicate mutation must retain the last safe visible reference");
  });

  await runner.run("delta headers cannot forge cursors omitted from structural root operations", async () => {
    const authority = createAuthorityDeltaPublisher();
    const receiver = createClientDeltaReceiver({ context: context() });
    accept(authority, receiver, authority.publish(inputs(1)));
    const unchangedCursors = {
      tick: 1, simTime: 0.1, eventWatermark: 1, fieldRevision: 1, overloadMode: "NORMAL",
    };
    const second = authority.publish(inputs(2, identity(), {
      public: unchangedCursors,
      owner: unchangedCursors,
    }));
    assert.strictEqual(second.projectionKind, "delta");
    const forged = structuredClone(second.frame);
    Object.assign(forged, {
      tick: 999, simTime: 99.9, eventWatermark: 999, fieldRevision: 999, overloadMode: "DILATED",
    });
    const result = receiver.receive(wire(forged));
    assert.strictEqual(result.accepted, false);
    assert.strictEqual(result.reason, "lineage-mismatch");
    assert.strictEqual(receiver.current().frameId, 1, "forged cursors must not erase visible state");
  });

  await runner.run("fallback keyframes cannot regress entity lifecycle or component revisions", async () => {
    const authority = createAuthorityDeltaPublisher();
    const receiver = createClientDeltaReceiver({ context: context() });
    const advanced = publicEntity("seat-1", 5, 2);
    advanced.lifecycleRevision = 5;
    accept(authority, receiver, authority.publish(inputs(1, identity(), { public: { entities: [advanced] } })));
    authority.rebase(identity());
    const regressed = publicEntity("seat-1", 1, 1);
    const keyframe = authority.publish(inputs(2, identity(), { public: { entities: [regressed] } }));
    assert.strictEqual(keyframe.projectionKind, "keyframe");
    const result = receiver.receive(wire(keyframe.frame));
    assert.strictEqual(result.accepted, false);
    assert.strictEqual(result.reason, "lineage-mismatch");
  });

  await runner.run("ballpark epoch transitions accept monotonic keyframes without losing entity fences", async () => {
    const authority = createAuthorityDeltaPublisher();
    const receiver = createClientDeltaReceiver({ context: context() });
    accept(authority, receiver, authority.publish(inputs(1, identity(), {
      public: { ballparkEpoch: 4 }, owner: { ballparkEpoch: 4 },
    })));
    const transitioned = authority.publish(inputs(2, identity(), {
      public: { ballparkEpoch: 5 }, owner: { ballparkEpoch: 5 },
    }));
    assert.strictEqual(transitioned.projectionKind, "keyframe");
    const accepted = receiver.receive(wire(transitioned.frame));
    assert.strictEqual(accepted.accepted, true, JSON.stringify(accepted));
    assert.strictEqual(accepted.state.ballparkEpoch, 5);
  });

  await runner.run("reordered branches apply from their exact retained base without visible rollback", async () => {
    const authority = createAuthorityDeltaPublisher();
    const receiver = createClientDeltaReceiver({ context: context(),
      capabilities: ["state-pair-v1", MIXED_CAPABILITY] });
    const large = (beat) => inputs(beat, identity(), {
      public: { padding: "p".repeat(8 * 1024) }, owner: { padding: "o".repeat(8 * 1024),
        entities: [{ ...ownerEntity(identity(), beat), components: {
          ...ownerEntity(identity(), beat).components,
          inventory: component(beat, { cargo: [`ore-${beat}`] }),
        } }] },
    });
    accept(authority, receiver, authority.publish(large(1)));
    const second = authority.publish({ ...large(2), allowMixed: true });
    const third = authority.publish({ ...large(3), allowMixed: true });
    assert(second.frame.public.kind === "delta" && third.frame.public.kind === "delta");
    const later = receiver.receive(wire(third.frame));
    assert.strictEqual(later.accepted, true, JSON.stringify(later));
    assert.strictEqual(later.state.frameId, 3);
    const stale = receiver.receive(wire(second.frame));
    assert.strictEqual(stale.accepted, true, JSON.stringify(stale));
    assert.strictEqual(stale.stale, true);
    assert.strictEqual(receiver.current(), later.state, "stale branch cannot replace the visible head");
    assert.strictEqual(receiver.diagnostics().recoveryRequests, 0);
  });

  await runner.run("an initial coalesced keyframe may start after frame one", async () => {
    const receiver = createClientDeltaReceiver({ context: context() });
    const future = structuredClone(createAuthorityDeltaPublisher().publish(inputs(1)).frame);
    future.frameId = 4;
    const result = receiver.receive(wire(future));
    assert.strictEqual(result.accepted, true);
    assert.strictEqual(result.state.frameId, 4);
  });

  await runner.run("a forged owner hash cannot expose a half-applied public beat or emit an ACK", async () => {
    const observed = [];
    const authority = createAuthorityDeltaPublisher();
    const receiver = createClientDeltaReceiver({ context: context(), onState: (pair) => observed.push(pair) });
    accept(authority, receiver, authority.publish(inputs(1)));
    const second = authority.publish(inputs(2));
    const forged = structuredClone(second.frame);
    forged.owner.resultHash = "sha256:" + "0".repeat(64);
    forged.owner.delta.resultHash = forged.owner.resultHash;
    const rejected = receiver.receive(JSON.stringify(forged));
    assert.strictEqual(rejected.accepted, false);
    assert.strictEqual(observed.length, 1, "failed owner lane must not expose the valid public lane");
    assert.strictEqual(receiver.current().frameId, 1, "forged owner hash must retain the complete safe pair");
    assert.strictEqual(Object.hasOwn(rejected, "ack"), false);
  });

  await runner.run("despawn and reincarnation replay through independent retained ledgers", async () => {
    const authority = createAuthorityDeltaPublisher();
    const receiver = createClientDeltaReceiver({ context: context() });
    accept(authority, receiver, authority.publish(inputs(1)));
    const removed = authority.publish(inputs(2, identity(), { public: { entities: [] } }));
    const removal = accept(authority, receiver, removed);
    assert.strictEqual(removal.state.public.entities.length, 0);
    const replacement = publicEntity("seat-1", 3, 2);
    replacement.lifecycleRevision = 3;
    const reincarnated = authority.publish(inputs(3, identity(), { public: { entities: [replacement] } }));
    const result = accept(authority, receiver, reincarnated);
    assert.strictEqual(result.state.public.entities[0].incarnation, 2);
    assert.strictEqual(result.state.owner.entities[0].sourceId, identity().recipientId);
  });

  await runner.run("cross-match, cross-session, and cross-recipient pairs are isolated", async () => {
    const receiver = createClientDeltaReceiver({ context: context() });
    for (const other of [
      identity({ matchId: "match-other" }),
      identity({ sessionId: "session-other" }),
      identity({ recipientId: "member-other" }),
      identity({ recipientIncarnation: 9 }),
    ]) {
      const result = receiver.receive(wire(createAuthorityDeltaPublisher().publish(inputs(1, other)).frame));
      assert.strictEqual(result.accepted, false);
      assert.strictEqual(result.reason, "identity-mismatch");
    }
  });

  await runner.run("another owner's private projection is rejected even under a matching outer header", async () => {
    const receiver = createClientDeltaReceiver({ context: context() });
    const publisher = createAuthorityDeltaPublisher();
    const otherOwner = ownerEntity(identity({ recipientId: "member-other" }), 1);
    const pair = publisher.publish(inputs(1, identity(), { owner: { entities: [otherOwner] } }));
    const result = receiver.receive(wire(pair.frame));
    assert.strictEqual(result.accepted, false);
    assert.strictEqual(result.reason, "owner-mismatch");
    assert.strictEqual(receiver.current(), null);
  });

  await runner.run("reconnect and manifest/schema/incarnation changes clear bases and request a keyframe", async () => {
    const receiver = createClientDeltaReceiver({ context: context() });
    const authority = createAuthorityDeltaPublisher();
    assert.strictEqual(receiver.receive(wire(authority.publish(inputs(1)).frame)).accepted, true);
    const nextId = identity({ recipientIncarnation: 3 });
    const recovery = receiver.reconnect(context(nextId));
    assert.strictEqual(recovery.reason, "recipient-changed");
    assert.strictEqual(receiver.current(), null);
    assert.strictEqual(receiver.receive(wire(authority.publish(inputs(1, nextId)).frame)).accepted, true);
    const changedManifest = receiver.reconnect(context(nextId, { manifestHash: "sha256:manifest-next" }));
    assert.strictEqual(changedManifest.reason, "manifest-changed");
    const changedSchema = receiver.reconnect(context(nextId, {
      manifestHash: "sha256:manifest-next", manifestSchema: "lbh-session-replication-manifest-v2",
    }));
    assert.strictEqual(changedSchema.reason, "schema-changed");
    assert.throws(() => createClientDeltaReceiver({ context: context(identity(), {
      manifestSchema: "evil-schema-v999",
    }) }), (error) => error?.code === "invalid-context");
  });

  await runner.run("bounded recovery frames round-trip through the adapter and force the recipient publisher to keyframe", async () => {
    const manifest = {
      schema: "lbh-session-replication-manifest-v1",
      hash: "sha256:test",
      bytes: 42,
    };
    const id = identity({
      matchId: "run-a",
      sessionId: "connection-recovery-wire",
      authorityIncarnation: 1,
      recipientId: "membership-recovery-wire",
      recipientIncarnation: 1,
    });
    const authority = createAuthorityDeltaPublisher();
    const harness = await createHarness({
      afterRedeem(result) {
        result.welcome.wireVersion = WIRE_PROTOCOL_VERSION_V2;
        result.welcome.capabilities = ["static-manifest-v1", "state-pair-v1"];
        result.welcome.manifestSchema = manifest.schema;
        result.welcome.manifestHash = manifest.hash;
        result.welcome.manifestBytes = manifest.bytes;
        result.welcome.fetchPath = "/multiplayer/manifest/test";
        result.binding.wireVersion = WIRE_PROTOCOL_VERSION_V2;
        result.binding.authorityIncarnation = 1;
        result.binding.manifestHash = manifest.hash;
      },
      onStatePairRecovery(_binding, frame) {
        authority.rebase(id);
        return frame.reason === "reconnect";
      },
    });
    try {
      const ticket = harness.issueTicket("recovery-wire");
      const client = await openClient(`${harness.baseUrl}/stream`);
      client.ws.send(JSON.stringify({
        type: "hello",
        wireVersion: WIRE_PROTOCOL_VERSION_V2,
        simProtocolVersion: SIM_PROTOCOL_VERSION,
        admissionTicket: ticket,
        capabilities: ["static-manifest-v1", "state-pair-v1"],
        manifestSchema: manifest.schema,
        manifestHash: manifest.hash,
      }));
      await waitFor(() => nextFrame(client.messages, "welcome") && nextFrame(client.messages, "rebase"), {
        label: "statePair recovery admission",
      });
      const binding = harness.bindings.find((entry) => entry.name === "recovery-wire");
      const receiver = createClientDeltaReceiver({ context: context(id, {
        manifestSchema: manifest.schema,
        manifestHash: manifest.hash,
      }) });
      const first = authority.publish(inputs(1, id, {
        public: { manifestHash: manifest.hash }, owner: { manifestHash: manifest.hash },
      }));
      assert.strictEqual((await harness.adapter.publishStatePair(binding, first.frame)).accepted, true);
      await waitFor(() => nextFrame(client.messages, "statePair"), { label: "statePair keyframe" });
      assert.strictEqual(receiver.receive(wire(first.frame)).accepted, true);
      const recovery = receiver.reconnect(context(id, {
        manifestSchema: manifest.schema,
        manifestHash: manifest.hash,
      }));
      client.ws.send(encodeWireFrame(recovery, { direction: CLIENT_TO_SERVER }));
      client.ws.send(encodeWireFrame(recovery, { direction: CLIENT_TO_SERVER }));
      client.ws.send(encodeWireFrame(recovery, { direction: CLIENT_TO_SERVER }));
      await waitFor(() => harness.statePairRecoveries.length === 1, { label: "statePair recovery callback" });
      await new Promise((resolve) => setTimeout(resolve, 30));
      assert.strictEqual(harness.statePairRecoveries.length, 1, "recovery burst must coalesce before authority work");
      const next = authority.publish(inputs(2, id, {
        public: { manifestHash: manifest.hash }, owner: { manifestHash: manifest.hash },
      }));
      assert.strictEqual(next.projectionKind, "keyframe");
      assert.strictEqual(receiver.receive(wire(next.frame)).accepted, true);
    } finally {
      await harness.close();
    }
  });

  await runner.run("malformed, prototype-polluting, and oversize wire input fails closed", async () => {
    const receiver = createClientDeltaReceiver({ context: context(), maxPairBytes: 20 * 1024 });
    assert.strictEqual(receiver.receive("{broken").accepted, false);
    const pair = createAuthorityDeltaPublisher().publish(inputs(1));
    const polluted = wire(pair.frame).replace('"cargo":["ore"]', '"__proto__":{"polluted":true},"cargo":["ore"]');
    assert(polluted.includes("__proto__"), "fixture must contain the forbidden key");
    assert.strictEqual(receiver.receive(polluted).accepted, false);
    assert.strictEqual(Object.prototype.polluted, undefined);
    const zeroFrame = createAuthorityDeltaPublisher().publish(inputs(0)).frame;
    const negativeZeroWire = wire(zeroFrame).replaceAll('"simTime":0', '"simTime":-0');
    assert(negativeZeroWire.includes('"simTime":-0'), "fixture must preserve raw JSON negative zero");
    const negativeZeroResult = createClientDeltaReceiver({ context: context() }).receive(negativeZeroWire);
    assert.strictEqual(negativeZeroResult.accepted, false);
    assert.strictEqual(negativeZeroResult.reason, "lineage-mismatch");
    const boundedReceiver = createClientDeltaReceiver({ context: context(), maxPairBytes: 4 * 1024 });
    const oversize = createAuthorityDeltaPublisher().publish(inputs(1));
    const rejected = boundedReceiver.receive(wire(oversize.frame));
    assert.strictEqual(rejected.accepted, false);
    assert.strictEqual(rejected.reason, "oversize-frame");
    assert.strictEqual(boundedReceiver.diagnostics().retainedPairHistory <= 12, true);
  });

  await runner.run("v1 and static-manifest-only negotiation remain unchanged and opt-in", async () => {
    assert.strictEqual(selectClientReplicationMode({ wireVersion: "lbh-multiplayer-json-v1", capabilities: [] }), MODES.V1);
    assert.strictEqual(selectClientReplicationMode({
      wireVersion: "lbh-multiplayer-json-v2", capabilities: ["static-manifest-v1"],
    }), MODES.STATIC_MANIFEST);
    assert.strictEqual(selectClientReplicationMode({
      wireVersion: "lbh-multiplayer-json-v2", capabilities: ["static-manifest-v1", "state-pair-v1"],
    }), MODES.STATE_PAIR);
    assert.strictEqual(selectClientReplicationMode({
      wireVersion: "lbh-multiplayer-json-v2",
      capabilities: ["static-manifest-v1", "state-pair-v1", MIXED_CAPABILITY],
    }), MODES.STATE_PAIR_MIXED);
    assert.strictEqual(selectClientReplicationMode({
      wireVersion: "lbh-multiplayer-json-v2",
      capabilities: ["static-manifest-v1", "state-pair-v1", MIXED_CAPABILITY,
        RUNTIME_PUBLIC_COMPONENTS_CAPABILITY],
    }), MODES.STATE_PAIR_RUNTIME_COMPONENTS);
  });

  await runner.run("representative apply cost and retained memory diagnostics stay bounded", async () => {
    const authority = createAuthorityDeltaPublisher();
    const receiver = createClientDeltaReceiver({ context: context() });
    let totalNs = 0n;
    let totalBytes = 0;
    for (let beat = 1; beat <= 100; beat += 1) {
      const published = authority.publish(inputs(beat));
      const encoded = wire(published.frame);
      totalBytes += Buffer.byteLength(encoded);
      const started = process.hrtime.bigint();
      const result = receiver.receive(encoded);
      totalNs += process.hrtime.bigint() - started;
      assert.strictEqual(result.accepted, true, `beat=${beat} ${JSON.stringify(result)}`);
      assert.strictEqual(authority.acknowledge(identity(), result.ack).accepted, true);
    }
    const diagnostics = receiver.diagnostics();
    assert.strictEqual(diagnostics.retainedPairHistory, diagnostics.limits.maxRetainedPairHistory);
    assert(diagnostics.ledger.bytes <= diagnostics.limits.maxRetainedBytes
      && diagnostics.ledger.highWaterBytes <= diagnostics.limits.maxRetainedBytes);
    assert.strictEqual(diagnostics.hasPublicBase, true);
    assert.strictEqual(diagnostics.hasOwnerBase, true);
    console.log(`  receiver mean apply=${(Number(totalNs) / 100 / 1e6).toFixed(3)}ms mean wire=${Math.round(totalBytes / 100)}B`);
  });

  process.exit(runner.summary() ? 0 : 1);
}

run().catch((error) => { console.error(error.stack || error); process.exit(1); });
