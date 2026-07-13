#!/usr/bin/env node
"use strict";

const assert = require("assert");
const { TestRunner } = require("./helpers.cjs");
const { applyStructuralDelta } = require("../scripts/canonical-structural-delta.cjs");
const {
  PAIR_SCHEMA,
  ACK_SCHEMA,
  createAuthorityDeltaPublisher,
} = require("../scripts/authority-delta-publisher.cjs");
const {
  CLIENT_TO_SERVER,
  SERVER_TO_CLIENT,
  encodeWireFrame,
  parseWireFrame,
} = require("../scripts/multiplayer-wire-protocol.cjs");
const { SIM_PROTOCOL_VERSION, WIRE_PROTOCOL_VERSION_V2 } = require("../scripts/multiplayer-wire-protocol.cjs");
const { createHarness, openClient, waitFor, nextFrame } = require("./multiplayer-ws-adapter-fixture.cjs");

function identity(overrides = {}) {
  return {
    matchId: "match-a",
    sessionId: "session-a",
    authorityIncarnation: 1,
    recipientId: "member-a",
    recipientIncarnation: 1,
    ...overrides,
  };
}

function component(revision, value) {
  return { revision, value };
}

function entity(category, sourceId, revision, x, incarnation = 1) {
  return {
    category,
    sourceId,
    incarnation,
    lifecycleRevision: revision,
    components: { transform: component(revision, { x, y: 2 }) },
  };
}

function view({ lane = "public", beat = 1, id = identity(), manifestHash = "sha256:manifest-a",
  ballparkEpoch = 1, entities, padding = "", incarnation = 1 } = {}) {
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
    tick: beat,
    simTime: beat / 10,
    eventWatermark: beat,
    fieldRevision: beat,
    overloadMode: "NORMAL",
    world: owner ? { privateNote: padding } : { global: padding },
    entities: entities ?? (owner ? [{
      category: "owner", sourceId: id.recipientId, incarnation: 1, lifecycleRevision: beat,
      components: { inventory: component(beat, { cargo: beat % 2 ? ["ore"] : ["ore", "ice"] }) },
    }] : [entity("player", "one", beat, beat, incarnation)]),
  };
}

function pairInputs(beat, id = identity(), overrides = {}) {
  return {
    identity: id,
    publicView: view({ beat, id, ...(overrides.public || {}) }),
    ownerView: view({ lane: "owner", beat, id, ...(overrides.owner || {}) }),
  };
}

function largePairInputs(beat, id = identity(), overrides = {}) {
  return pairInputs(beat, id, {
    public: { padding: "p".repeat(6 * 1024), ...(overrides.public || {}) },
    owner: { padding: "o".repeat(6 * 1024), ...(overrides.owner || {}) },
  });
}

function ackFor(frame, overrides = {}) {
  return {
    type: "ack",
    ackKind: "statePair",
    ackSchema: ACK_SCHEMA,
    matchId: frame.matchId,
    sessionId: frame.sessionId,
    authorityIncarnation: frame.authorityIncarnation,
    recipientId: frame.recipientId,
    recipientIncarnation: frame.recipientIncarnation,
    frameId: frame.frameId,
    statePairId: frame.statePairId,
    snapshotId: frame.snapshotId,
    publicHash: frame.public.resultHash,
    ownerHash: frame.owner.resultHash,
    ...overrides,
  };
}

function expectCode(fn, code) {
  assert.throws(fn, (error) => error?.code === code, `expected ${code}`);
}

async function run() {
  const runner = new TestRunner("AuthorityDeltaPublisher");

  await runner.run("publishes an atomic keyframe then ACK-based public and owner deltas", async () => {
    const publisher = createAuthorityDeltaPublisher();
    const first = publisher.publish(largePairInputs(1));
    assert.strictEqual(first.frame.pairSchema, PAIR_SCHEMA);
    assert.strictEqual(first.frame.public.kind, "keyframe");
    assert.strictEqual(first.frame.owner.kind, "keyframe");
    encodeWireFrame(first.frame, { direction: SERVER_TO_CLIENT });
    const accepted = publisher.acknowledge(identity(), ackFor(first.frame));
    assert.strictEqual(accepted.accepted, true);
    const second = publisher.publish(largePairInputs(2));
    assert.strictEqual(second.frame.public.kind, "delta");
    assert.strictEqual(second.frame.owner.kind, "delta");
    assert.strictEqual(second.frame.public.baseHash, first.frame.public.resultHash);
    assert.strictEqual(second.frame.owner.baseHash, first.frame.owner.resultHash);
    encodeWireFrame(second.frame, { direction: SERVER_TO_CLIENT });
    const appliedPublic = applyStructuralDelta(first.frame.public.projection, second.frame.public.delta);
    const appliedOwner = applyStructuralDelta(first.frame.owner.projection, second.frame.owner.delta);
    assert.strictEqual(appliedPublic.resultHash, second.frame.public.resultHash);
    assert.strictEqual(appliedOwner.resultHash, second.frame.owner.resultHash);
    console.log(`  synthetic pair bytes keyframe=${first.bytes} delta=${second.bytes} saved=${first.bytes - second.bytes}`);
  });

  await runner.run("no-op entity sets remain deterministic and do not trust dirty hints", async () => {
    const publisher = createAuthorityDeltaPublisher();
    const one = pairInputs(1);
    one.publicView.entities = [];
    one.ownerView.entities = [];
    const first = publisher.publish(one);
    publisher.acknowledge(identity(), ackFor(first.frame));
    const two = pairInputs(2);
    two.publicView.entities = [];
    two.ownerView.entities = [];
    const a = publisher.publish({ ...two, dirtyHints: ["wrong.entity"] });
    const other = createAuthorityDeltaPublisher();
    const otherFirst = other.publish(one);
    other.acknowledge(identity(), ackFor(otherFirst.frame));
    const b = other.publish({ ...two, dirtyHints: [] });
    assert.deepStrictEqual(a.frame, b.frame);
  });

  await runner.run("ACK loss retransmits exact bytes and send never advances the base", async () => {
    const publisher = createAuthorityDeltaPublisher();
    const first = publisher.publish(largePairInputs(1));
    const second = publisher.publish(pairInputs(2));
    assert.strictEqual(second.frame.public.kind, "keyframe", "unACKed send must not become a delta base");
    const replay = publisher.retransmit(identity(), first.frame.frameId);
    assert.deepStrictEqual(replay.frame, first.frame);
    assert.strictEqual(replay.bytes, first.bytes);
  });

  await runner.run("duplicate stale forged and cross-recipient ACKs fail closed and force keyframes", async () => {
    const publisher = createAuthorityDeltaPublisher();
    const first = publisher.publish(pairInputs(1));
    assert.strictEqual(publisher.acknowledge(identity(), ackFor(first.frame)).accepted, true);
    assert.strictEqual(publisher.acknowledge(identity(), ackFor(first.frame)).accepted, false, "duplicate ACK must fail closed");
    const afterDuplicate = publisher.publish(pairInputs(2));
    assert.strictEqual(afterDuplicate.frame.public.kind, "keyframe");
    assert.strictEqual(publisher.acknowledge(identity(), ackFor(afterDuplicate.frame, { publicHash: "sha256:forged" })).accepted, false);
    const other = identity({ recipientId: "member-b" });
    assert.strictEqual(publisher.acknowledge(other, ackFor(afterDuplicate.frame)).accepted, false);
    const crossMatch = identity({ matchId: "match-b" });
    assert.strictEqual(publisher.acknowledge(crossMatch, ackFor(afterDuplicate.frame)).accepted, false);
  });

  await runner.run("out-of-order ACK retirement is bounded and stale ACK cannot roll back the base", async () => {
    const publisher = createAuthorityDeltaPublisher();
    const base = publisher.publish(pairInputs(1));
    publisher.acknowledge(identity(), ackFor(base.frame));
    const second = publisher.publish(pairInputs(2));
    const third = publisher.publish(pairInputs(3));
    assert.strictEqual(publisher.acknowledge(identity(), ackFor(third.frame)).accepted, true);
    assert.strictEqual(publisher.acknowledge(identity(), ackFor(second.frame)).accepted, false);
    const next = publisher.publish(pairInputs(4));
    assert.strictEqual(next.frame.public.kind, "keyframe", "stale ACK rejection must rebase rather than roll back");
  });

  await runner.run("despawn and reincarnation preserve lifecycle semantics", async () => {
    const publisher = createAuthorityDeltaPublisher();
    const first = publisher.publish(pairInputs(1));
    publisher.acknowledge(identity(), ackFor(first.frame));
    const removed = publisher.publish(largePairInputs(2, identity(), { public: { entities: [] } }));
    if (removed.frame.public.kind === "delta") assert.strictEqual(removed.frame.public.delta.despawns.length, 1);
    else assert.strictEqual(removed.frame.public.projection.entities.length, 0);
    publisher.acknowledge(identity(), ackFor(removed.frame));
    const reincarnated = publisher.publish(largePairInputs(3, identity(), {
      public: { entities: [entity("player", "one", 3, 3, 2)] },
    }));
    const replacement = reincarnated.frame.public.kind === "delta"
      ? reincarnated.frame.public.delta.creates[0]
      : reincarnated.frame.public.projection.entities[0];
    assert.strictEqual(replacement.incarnation, 2);
  });

  await runner.run("manifest ballpark reconnect and explicit gap changes force atomic rebases", async () => {
    const publisher = createAuthorityDeltaPublisher();
    const first = publisher.publish(pairInputs(1));
    publisher.acknowledge(identity(), ackFor(first.frame));
    const changedManifest = publisher.publish(pairInputs(2, identity(), {
      public: { manifestHash: "sha256:manifest-b" }, owner: { manifestHash: "sha256:manifest-b" },
    }));
    assert.strictEqual(changedManifest.frame.public.kind, "keyframe");
    publisher.acknowledge(identity(), ackFor(changedManifest.frame));
    publisher.rebase(identity());
    assert.strictEqual(publisher.publish(pairInputs(3, identity(), {
      public: { manifestHash: "sha256:manifest-b" }, owner: { manifestHash: "sha256:manifest-b" },
    })).frame.public.kind, "keyframe");
    const reconnect = identity({ recipientIncarnation: 2 });
    assert.strictEqual(publisher.publish(pairInputs(1, reconnect)).frame.public.kind, "keyframe");
  });

  await runner.run("owner bases stay private per recipient and matches remain isolated", async () => {
    const publisher = createAuthorityDeltaPublisher();
    const a = identity();
    const b = identity({ sessionId: "session-b", recipientId: "member-b" });
    const firstA = publisher.publish(largePairInputs(1, a));
    publisher.acknowledge(a, ackFor(firstA.frame));
    const firstB = publisher.publish(largePairInputs(1, b));
    publisher.acknowledge(b, ackFor(firstB.frame));
    const nextA = publisher.publish(largePairInputs(2, a));
    const nextB = publisher.publish(largePairInputs(2, b));
    assert.strictEqual(nextA.frame.owner.delta.baseHash, firstA.frame.owner.resultHash);
    assert.strictEqual(nextB.frame.owner.delta.baseHash, firstB.frame.owner.resultHash);
    assert.notStrictEqual(nextA.frame.owner.delta.baseHash, nextB.frame.owner.delta.baseHash);
    assert(!JSON.stringify(nextB.frame).includes("member-a"), "recipient B frame must not contain recipient A private identity");
  });

  await runner.run("history and bytes are bounded and eviction forces a keyframe", async () => {
    const publisher = createAuthorityDeltaPublisher({ maxPendingPairsPerRecipient: 2, maxRetainedBytesPerRecipient: 512 * 1024 });
    publisher.publish(pairInputs(1));
    publisher.publish(pairInputs(2));
    publisher.publish(pairInputs(3));
    const diagnostics = publisher.diagnostics();
    assert(diagnostics.pendingPairs <= 2 && diagnostics.retainedBytes <= 512 * 1024);
    assert.strictEqual(publisher.publish(pairInputs(4)).frame.public.kind, "keyframe");
  });

  await runner.run("retention configuration always fits one maximum pair", async () => {
    assert.throws(() => createAuthorityDeltaPublisher({ maxPairBytes: 8192, maxRetainedBytesPerRecipient: 4096 }),
      /must retain at least one/);
    assert.throws(() => createAuthorityDeltaPublisher({ maxPairBytes: 256 * 1024 + 1,
      maxRetainedBytesPerRecipient: 512 * 1024 }), /wire frame limit/);
  });

  await runner.run("oversize pair fails deterministically and leaves the recipient rebased", async () => {
    const publisher = createAuthorityDeltaPublisher({ maxPairBytes: 4 * 1024 });
    expectCode(() => publisher.publish(pairInputs(1, identity(), {
      public: { padding: "x".repeat(8 * 1024) }, owner: { padding: "y".repeat(8 * 1024) },
    })), "pair-too-large");
    const recovered = publisher.publish(pairInputs(2));
    assert.strictEqual(recovered.frame.public.kind, "keyframe");
  });

  await runner.run("wire codec accepts exact pair/ACK schemas and rejects forged extensions", async () => {
    const publisher = createAuthorityDeltaPublisher();
    const pair = publisher.publish(pairInputs(1));
    const wire = encodeWireFrame(pair.frame, { direction: SERVER_TO_CLIENT });
    assert.deepStrictEqual(parseWireFrame(wire, { direction: SERVER_TO_CLIENT }), pair.frame);
    const ack = ackFor(pair.frame);
    encodeWireFrame(ack, { direction: CLIENT_TO_SERVER });
    expectCode(() => encodeWireFrame({ ...ack, forged: true }, { direction: CLIENT_TO_SERVER }), "unknown-field");
  });

  await runner.run("v2 adapter publishes one statePair wire frame and rejects cross-session routing", async () => {
    const manifest = { manifestSchema: "lbh-session-replication-manifest-v1", manifestHash: "sha256:test", manifestBytes: 42 };
    const harness = await createHarness({
      replicationAccounting: true,
      afterRedeem(result) {
        result.welcome.wireVersion = WIRE_PROTOCOL_VERSION_V2;
        result.welcome.capabilities = ["static-manifest-v1", "state-pair-v1"];
        result.welcome.manifestSchema = manifest.manifestSchema;
        result.welcome.manifestHash = manifest.manifestHash;
        result.welcome.manifestBytes = manifest.manifestBytes;
        result.welcome.fetchPath = "/multiplayer/manifest/test";
        result.binding.wireVersion = WIRE_PROTOCOL_VERSION_V2;
        result.binding.authorityIncarnation = 1;
        result.binding.manifestHash = manifest.manifestHash;
      },
    });
    try {
      const ticket = harness.issueTicket("wire");
      const client = await openClient(`${harness.baseUrl}/stream`);
      client.ws.send(JSON.stringify({
        type: "hello", wireVersion: WIRE_PROTOCOL_VERSION_V2, simProtocolVersion: SIM_PROTOCOL_VERSION,
        admissionTicket: ticket, capabilities: ["static-manifest-v1", "state-pair-v1"],
        manifestSchema: manifest.manifestSchema, manifestHash: manifest.manifestHash,
      }));
      await waitFor(() => nextFrame(client.messages, "welcome") && nextFrame(client.messages, "rebase"), { label: "v2 admission" });
      const binding = harness.bindings.find((entry) => entry.name === "wire");
      const id = identity({
        matchId: "run-a", sessionId: "connection-wire", recipientId: "membership-wire",
      });
      assert.strictEqual((await harness.adapter.projectNow()).projected, 0,
        "negotiated statePair sockets must never enter the legacy projection scheduler");
      const pair = createAuthorityDeltaPublisher().publish(pairInputs(1, id, {
        public: { manifestHash: manifest.manifestHash }, owner: { manifestHash: manifest.manifestHash },
      }));
      const outcome = await harness.adapter.publishStatePair(binding, pair.frame);
      assert.strictEqual(outcome.accepted, true, JSON.stringify(outcome));
      await waitFor(() => nextFrame(client.messages, "statePair"), { label: "atomic state pair" });
      assert.strictEqual((await harness.adapter.projectNow()).projected, 0,
        "legacy publisher must stay disabled after the statePair keyframe transition");
      const retransmitted = await harness.adapter.retransmitStatePair(binding, pair.frame);
      assert.strictEqual(retransmitted.accepted, true, JSON.stringify(retransmitted));
      await waitFor(() => client.messages.filter((frame) => frame.type === "statePair").length === 2,
        { label: "state pair retransmission" });
      client.ws.send(encodeWireFrame(ackFor(pair.frame), { direction: CLIENT_TO_SERVER }));
      await waitFor(() => harness.acks.some((entry) => entry.frame.ackKind === "statePair"), { label: "state pair ACK" });
      const forged = { ...pair.frame, sessionId: "connection-other", frameId: pair.frame.frameId + 1 };
      const rejected = await harness.adapter.publishStatePair(binding, forged);
      assert.deepStrictEqual({ accepted: rejected.accepted, reason: rejected.reason },
        { accepted: false, reason: "state-pair-identity-mismatch" });
      const accounting = harness.adapter.diagnostics().replication;
      assert(accounting.events.some((event) => event.frameClass === "statePair" && event.projectionKind === "keyframe"),
        "directional accounting must classify statePair keyframe bytes");
      assert(accounting.events.some((event) => event.frameClass === "statePair" && event.metric === "retransmitted"),
        "directional accounting must classify retransmission bytes");
      assert(accounting.events.some((event) => event.frameClass === "ack" && event.direction === "client->authority"),
        "directional accounting must attribute ACK bytes to the recipient");
      const window = harness.adapter.replicationWindow(accounting.captureStartedAt, accounting.capturedThroughAt + 1);
      assert.strictEqual(window.completePairBytes.count, 1, "retransmission must not double-count the atomic projection beat");
      assert.strictEqual(Object.values(window.recipients)[0].completeProjectionBeats, 1);
    } finally {
      await harness.close();
    }
  });

  await runner.run("v1 state frame codec remains unchanged", async () => {
    const legacy = {
      type: "publicState", runId: "run-v1", snapshotId: 1, tick: 1, simTime: 0.1,
      lastEventSeq: 0, fieldRevision: 1, overloadMode: "NORMAL", lastInputSeq: 0, lastActionSeq: 0,
      full: true, state: {},
    };
    assert.deepStrictEqual(parseWireFrame(encodeWireFrame(legacy, { direction: SERVER_TO_CLIENT }),
      { direction: SERVER_TO_CLIENT }), legacy);
  });

  await runner.run("unnegotiated statePair ACKs fail before the authority callback", async () => {
    const harness = await createHarness();
    try {
      const client = await harness.admit("legacy-ack");
      client.ws.send(encodeWireFrame({
        type: "ack", ackKind: "statePair", ackSchema: ACK_SCHEMA,
        matchId: "run-a", sessionId: "connection-legacy-ack", authorityIncarnation: 1,
        recipientId: "membership-legacy-ack", recipientIncarnation: 1, frameId: 1,
        statePairId: "pair-1", snapshotId: "snapshot-1",
        publicHash: "sha256:public", ownerHash: "sha256:owner",
      }, { direction: CLIENT_TO_SERVER }));
      await waitFor(() => client.close.code !== null, { label: "unnegotiated statePair ACK close" });
      assert.strictEqual(client.close.code, 4401);
      assert.strictEqual(harness.acks.length, 0, "invalid statePair ACK must not reach onAck");
    } finally {
      await harness.close();
    }
  });

  process.exit(runner.summary() ? 0 : 1);
}

run().catch((error) => { console.error(error.stack || error); process.exit(1); });
