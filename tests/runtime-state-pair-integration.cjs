#!/usr/bin/env node
"use strict";

const assert = require("assert");
const { performance } = require("perf_hooks");
const { TestRunner } = require("./helpers.cjs");
const { canonicalJsonBytes } = require("../scripts/session-replication-manifest.cjs");
const { createMultiplayerTicketRegistry } = require("../scripts/multiplayer-ticket-registry.cjs");
const { createMultiplayerSendQueue } = require("../scripts/multiplayer-send-queue.cjs");
const { createClientDeltaReceiver } = require("../scripts/client-delta-receiver.cjs");
const { encodeWireFrame, SERVER_TO_CLIENT } = require("../scripts/multiplayer-wire-protocol.cjs");
const {
  CAPABILITY,
  SOURCE_FIELD_CLASSIFICATION,
  RuntimeStatePairError,
  createRuntimeStatePairAuthority,
} = require("../scripts/runtime-state-pair-integration.cjs");

const MANIFEST_SCHEMA = "lbh-session-replication-manifest-v1";
const MANIFEST_HASH = `sha256:${"a".repeat(64)}`;

function binding(suffix = "a", overrides = {}) {
  return {
    runId: "match-a",
    connectionId: `session-${suffix}`,
    membershipId: `member-${suffix}`,
    playerId: `player-${suffix}`,
    connectionEpoch: 1,
    wireVersion: "lbh-multiplayer-json-v2",
    capabilities: [CAPABILITY, "static-manifest-v1"],
    manifestSchema: MANIFEST_SCHEMA,
    manifestHash: MANIFEST_HASH,
    authorityIncarnation: 7,
    ...overrides,
  };
}

function claims(id = binding()) {
  return {
    membershipId: id.membershipId,
    playerId: id.playerId,
    profileId: `profile-${id.playerId}`,
    wireVersion: id.wireVersion,
    capabilities: id.capabilities,
    manifestSchema: id.manifestSchema,
    manifestHash: id.manifestHash,
    authorityIncarnation: id.authorityIncarnation,
  };
}

function sourceFrames(id, beat, { playerCount = 24, omit = [], marker = "stable", staticPayload = false } = {}) {
  const players = Array.from({ length: playerCount }, (_, index) => ({
    clientId: `public-${index}`,
    wx: index === 0 ? beat / 100 : index / 100,
    wy: index / 50,
    vx: 0.01,
    vy: 0.02,
    hullType: "drifter",
    status: "alive",
    name: `Pilot ${index}`,
    isAI: index % 2 === 1,
    slingshot: { engaged: index === 0, anchorId: index === 0 ? "well-static" : null, orbitDir: index % 2 ? -1 : 1 },
  })).filter((entry) => !omit.includes(entry.clientId));
  const publicFrame = {
    type: "publicState", runId: id.runId, snapshotId: beat, tick: beat * 2, simTime: beat / 10,
    lastEventSeq: beat, fieldRevision: beat, overloadMode: "NORMAL", lastInputSeq: 0, lastActionSeq: 0,
    manifestHash: MANIFEST_HASH, full: true,
    state: {
      session: { status: "running", hostClientId: "public-0", hostName: "Pilot 0", simScaleProfile: "small" },
      players,
      world: {
        wells: [{ id: "well-static", ...(staticPayload ? { name: "Static Name", wx: 0.5, wy: 0.5 } : {}) }],
        stars: [],
        wrecks: [{ id: "wreck-live", wx: 0.2, wy: 0.3, looted: beat > 1, pickupCooldown: beat / 10,
          loot: [{ id: "public-loot", coefficients: { cargoSlots: 1, controlDebuffResist: 1.1, pulseCooldownScale: 0.9 } }] }],
        planetoids: [],
        portals: [{ id: "portal-live", active: true, charge: beat, expiresAt: 20 }],
        scavengers: [{ id: "scavenger-live", state: "pursue", decisionTimer: 2 }],
        fauna: [{ id: "fauna-live", state: "drift", phase: beat }],
        sentries: [{ id: "sentry-live", state: "watch", targetId: "public-0" }],
        nextPortalWaveIndex: beat,
      },
      inhibitor: { form: 0, wx: 0, wy: 0 },
    },
  };
  const ownerFrame = {
    type: "ownerState", runId: id.runId, membershipId: id.membershipId, playerId: id.playerId,
    snapshotId: beat, tick: beat * 2, simTime: beat / 10, lastEventSeq: beat,
    fieldRevision: beat, overloadMode: "NORMAL", lastInputSeq: beat, lastActionSeq: beat,
    state: { profileId: `private-${id.playerId}`, cargo: Array.from({ length: 40 }, (_, index) => `${marker}-${index}`) },
  };
  return { publicFrame, ownerFrame };
}

function materializePublicState(view) {
  const state = JSON.parse(JSON.stringify(view.world.publicFacts));
  state.players = [];
  state.world ||= {};
  const lanes = {
    well: "wells", star: "stars", wreck: "wrecks", planetoid: "planetoids", portal: "portals",
    scavenger: "scavengers", fauna: "fauna", sentry: "sentries",
  };
  for (const lane of Object.values(lanes)) state.world[lane] = [];
  for (const entity of view.entities) {
    const value = JSON.parse(JSON.stringify(entity.components.runtimePublic.value));
    const index = entity.components.runtimeOrder.value.index;
    if (entity.category === "player") state.players[index] = value;
    else if (entity.category === "inhibitor") state.inhibitor = value;
    else state.world[lanes[entity.category]][index] = value;
  }
  return state;
}

function authority(options = {}) {
  return createRuntimeStatePairAuthority({
    matchId: "match-a", authorityIncarnation: 7, ballparkEpoch: 3,
    manifestSchema: MANIFEST_SCHEMA, manifestHash: MANIFEST_HASH,
    ...options,
  });
}

function receiver(id) {
  return createClientDeltaReceiver({ context: {
    matchId: id.runId, sessionId: id.connectionId, authorityIncarnation: id.authorityIncarnation,
    recipientId: id.membershipId, recipientIncarnation: id.connectionEpoch,
    manifestSchema: id.manifestSchema, manifestHash: id.manifestHash,
  } });
}

function wire(frame) {
  return encodeWireFrame(frame, { direction: SERVER_TO_CLIENT });
}

async function run() {
  const runner = new TestRunner("RuntimeStatePairIntegration");

  await runner.run("ticket-bound admission drives keyframe ACK delta and exact materialization", async () => {
    const id = binding();
    const ticketRegistry = createMultiplayerTicketRegistry({ runId: id.runId });
    const issued = ticketRegistry.issueAdmission(claims(id));
    const redeemed = ticketRegistry.redeem(issued.ticket, { kind: "admission", runId: id.runId });
    const server = authority();
    server.admit(id, redeemed.claims);
    const client = receiver(id);

    const firstSource = sourceFrames(id, 1);
    const first = server.publish(id, firstSource.publicFrame, firstSource.ownerFrame);
    assert.strictEqual(first.projectionKind, "keyframe");
    const acceptedFirst = client.receive(wire(first.frame));
    assert(acceptedFirst.accepted && server.acknowledge(id, acceptedFirst.ack).accepted);

    const secondSource = sourceFrames(id, 2);
    const second = server.publish(id, secondSource.publicFrame, secondSource.ownerFrame);
    assert.strictEqual(second.projectionKind, "delta");
    const acceptedSecond = client.receive(wire(second.frame));
    assert(acceptedSecond.accepted && !acceptedSecond.duplicate);
    assert.strictEqual(acceptedSecond.state.public.snapshotId, "snapshot-2");
    assert.deepStrictEqual(materializePublicState(acceptedSecond.state.public), secondSource.publicFrame.state);
    assert.strictEqual(acceptedSecond.state.owner.entities[0].components.ownerState.value.profileId, "private-player-a");
    assert.deepStrictEqual(acceptedSecond.state.owner.entities[0].components.ownerState.value, secondSource.ownerFrame.state);
    assert.deepStrictEqual(acceptedSecond.state.owner.entities[0].components.transient.value,
      { lastInputSeq: secondSource.ownerFrame.lastInputSeq, lastActionSeq: secondSource.ownerFrame.lastActionSeq });
    assert(server.acknowledge(id, acceptedSecond.ack).accepted);
    assert(second.bytes < first.bytes, `expected local delta bytes ${second.bytes} < keyframe ${first.bytes}`);
    console.log(`  pre-gate local pair bytes keyframe=${first.bytes} delta=${second.bytes}`);
  });

  await runner.run("capability cannot be self-asserted after ticket admission", async () => {
    const id = binding();
    const server = authority();
    const forged = { ...claims(id), capabilities: ["static-manifest-v1"] };
    assert.throws(() => server.admit(id, forged), (error) => error instanceof RuntimeStatePairError
      && error.code === "capability-not-admitted");
    const v1 = binding("v1", { wireVersion: "lbh-multiplayer-json-v1", capabilities: [], manifestSchema: null,
      manifestHash: null, authorityIncarnation: null });
    assert.throws(() => server.admit(v1, claims(v1)), /binding is outside this match authority/);
  });

  await runner.run("legacy source envelope inventory is exhaustive and additions fail closed", async () => {
    const id = binding();
    const source = sourceFrames(id, 1);
    for (const [lane, frame] of [["public", source.publicFrame], ["owner", source.ownerFrame]]) {
      const groups = Object.values(SOURCE_FIELD_CLASSIFICATION[lane]);
      const flattened = groups.flat();
      assert.strictEqual(new Set(flattened).size, flattened.length, `${lane} field classifications must be disjoint`);
      assert.deepStrictEqual([...flattened].sort(), Object.keys(frame).sort(), `${lane} field inventory must be exhaustive`);
    }
    const server = authority();
    server.admit(id, claims(id));
    assert.throws(() => server.publish(id, { ...source.publicFrame, futurePublicField: true }, source.ownerFrame),
      /not classified/);
    assert.throws(() => server.publish(id, source.publicFrame, { ...source.ownerFrame, futureOwnerField: true }),
      /not classified/);
    assert.throws(() => server.publish(id, { ...source.publicFrame, full: false }, source.ownerFrame),
      /replacement fields are invalid/);
  });

  await runner.run("public projection exactly materializes the S1-stripped state while owner stays isolated", async () => {
    const a = binding("a");
    const b = binding("b");
    const server = authority();
    server.admit(a, claims(a));
    server.admit(b, claims(b));
    const sourceA = sourceFrames(a, 1);
    const pairA = server.publish(a, ...Object.values(sourceA));
    const pairB = server.publish(b, ...Object.values(sourceFrames(b, 1)));
    const publicText = JSON.stringify(pairA.frame.public);
    assert.deepStrictEqual(materializePublicState(pairA.frame.public.projection), sourceA.publicFrame.state);
    assert(!publicText.includes("private-player"));
    assert.deepStrictEqual(pairA.frame.public.projection.entities
      .find((entry) => entry.category === "well").components.runtimePublic.value, { id: "well-static" });
    assert(JSON.stringify(pairA.frame).includes("private-player-a"));
    assert(!JSON.stringify(pairB.frame).includes("private-player-a"));
    const privateSource = sourceFrames(a, 2);
    privateSource.publicFrame.state.session.secret = "must-not-project";
    assert.throws(() => server.publish(a, privateSource.publicFrame, privateSource.ownerFrame), /owner-private/);
    for (const [key, value] of Object.entries({
      cargoCount: 99,
      inventoryRevision: 2,
      loadoutSummary: "private",
      abilityCooldowns: { pulse: 1 },
      profileName: "private",
      portalInteractionState: "private",
    })) {
      const adversarial = sourceFrames(a, 3);
      adversarial.publicFrame.state.players[0][key] = value;
      assert.throws(() => server.publish(a, adversarial.publicFrame, adversarial.ownerFrame), /owner-private/,
        `${key} must fail closed before entering shared state`);
    }
    const forgedCoefficient = sourceFrames(a, 4);
    forgedCoefficient.publicFrame.state.world.wrecks[0].loot[0].coefficients.profileName = "private";
    assert.throws(() => server.publish(a, forgedCoefficient.publicFrame, forgedCoefficient.ownerFrame), /owner-private/,
      "only declared public wreck-loot coefficients may bypass semantic private-name rejection");
    const smuggledCoefficient = sourceFrames(a, 5);
    smuggledCoefficient.publicFrame.state.world.wrecks[0].debug = {
      coefficients: { cargoSlots: "owner cargo exfil" },
    };
    assert.throws(() => server.publish(a, smuggledCoefficient.publicFrame, smuggledCoefficient.ownerFrame), /owner-private/);
    const smuggledCooldown = sourceFrames(a, 6);
    smuggledCooldown.publicFrame.state.world.wrecks[0].ownerEnvelope = {
      pickupCooldown: "owner cooldown exfil",
    };
    assert.throws(() => server.publish(a, smuggledCooldown.publicFrame, smuggledCooldown.ownerFrame), /owner-private/);
    const smuggledProfile = sourceFrames(a, 7);
    smuggledProfile.publicFrame.state.world.debug = {
      session: { simScaleProfile: "private profile exfil" },
    };
    assert.throws(() => server.publish(a, smuggledProfile.publicFrame, smuggledProfile.ownerFrame), /owner-private/);
    for (const mutate of [
      (state) => { state.session.simScaleProfile = "private"; },
      (state) => { state.world.wrecks[0].pickupCooldown = "private"; },
      (state) => { state.world.wrecks[0].loot[0].coefficients.cargoSlots = 1.5; },
    ]) {
      const invalidValue = sourceFrames(a, 8);
      mutate(invalidValue.publicFrame.state);
      assert.throws(() => server.publish(a, invalidValue.publicFrame, invalidValue.ownerFrame), /owner-private/,
        "declared exception paths must retain exact bounded value schemas");
    }
  });

  await runner.run("coalesced frame gaps converge on the latest recovery keyframe", async () => {
    const id = binding();
    const server = authority();
    server.admit(id, claims(id));
    const client = receiver(id);
    const one = server.publish(id, ...Object.values(sourceFrames(id, 1)));
    const accepted = client.receive(wire(one.frame));
    server.acknowledge(id, accepted.ack);
    const queue = createMultiplayerSendQueue();
    let latestGap;
    for (let beat = 2; beat <= 33; beat += 1) {
      latestGap = server.publish(id, ...Object.values(sourceFrames(id, beat)));
      const outcome = queue.enqueueState(latestGap.frame.frameId, latestGap.frame);
      assert.strictEqual(outcome.action, beat === 2 ? "queued" : "coalesced");
      assert.strictEqual(queue.status().queuedMessages, 1, "replaceable transport state must remain bounded");
    }
    assert(server.diagnostics().publisher.pendingPairs <= 8, "ACK-delayed authority history must remain bounded");
    const rejected = client.receive(wire(queue.drain().messages[0].envelope));
    assert(!rejected.accepted && rejected.recovery.reason === "frame-gap");
    server.recover(id);
    let coalescedRecovery;
    for (let beat = 34; beat <= 65; beat += 1) {
      coalescedRecovery = server.publish(id, ...Object.values(sourceFrames(id, beat)));
      assert.strictEqual(coalescedRecovery.projectionKind, "keyframe",
        "without an ACK every recovery candidate must remain independently materializable");
      const outcome = queue.enqueueState(coalescedRecovery.frame.frameId, coalescedRecovery.frame);
      assert.strictEqual(outcome.action, beat === 34 ? "queued" : "coalesced");
      assert.strictEqual(queue.status().queuedMessages, 1);
    }
    assert(server.diagnostics().publisher.pendingPairs <= 8, "recovery history must remain bounded under sustained pressure");
    const converged = client.receive(wire(queue.drain().messages[0].envelope));
    assert(converged.accepted, "latest coalesced recovery keyframe must converge without an intermediate frame");
    assert(server.acknowledge(id, converged.ack).accepted);
    const resumed = server.publish(id, ...Object.values(sourceFrames(id, 66)));
    assert.strictEqual(resumed.projectionKind, "delta");
    assert(client.receive(wire(resumed.frame)).accepted, "recovered stream must resume delta progression");
  });

  await runner.run("despawn and reincarnation preserve deterministic identity fences", async () => {
    const id = binding();
    const server = authority();
    server.admit(id, claims(id));
    const client = receiver(id);
    const one = server.publish(id, ...Object.values(sourceFrames(id, 1)));
    let result = client.receive(wire(one.frame));
    server.acknowledge(id, result.ack);
    const removed = server.publish(id, ...Object.values(sourceFrames(id, 2, { omit: ["public-0"] })));
    result = client.receive(wire(removed.frame));
    server.acknowledge(id, result.ack);
    const returned = server.publish(id, ...Object.values(sourceFrames(id, 3)));
    result = client.receive(wire(returned.frame));
    const entity = result.state.public.entities.find((entry) => entry.sourceId === "public-0");
    assert.strictEqual(entity.incarnation, 2);
  });

  await runner.run("match and recipient authorities retain no mutable cross-scope bases", async () => {
    const a = binding("a");
    const b = binding("b");
    const server = authority();
    server.admit(a, claims(a));
    server.admit(b, claims(b));
    const firstA = server.publish(a, ...Object.values(sourceFrames(a, 1, { marker: "a" })));
    const firstB = server.publish(b, ...Object.values(sourceFrames(b, 1, { marker: "b" })));
    const clientA = receiver(a);
    const clientB = receiver(b);
    const acceptedA = clientA.receive(wire(firstA.frame));
    const acceptedB = clientB.receive(wire(firstB.frame));
    server.acknowledge(a, acceptedA.ack);
    server.acknowledge(b, acceptedB.ack);
    const nextA = server.publish(a, ...Object.values(sourceFrames(a, 2, { marker: "a" })));
    const nextB = server.publish(b, ...Object.values(sourceFrames(b, 2, { marker: "b" })));
    const baseA = nextA.frame.owner.baseHash || nextA.frame.owner.projection?.entities?.[0]?.components?.ownerState?.value?.profileId;
    const baseB = nextB.frame.owner.baseHash || nextB.frame.owner.projection?.entities?.[0]?.components?.ownerState?.value?.profileId;
    assert.notStrictEqual(baseA, baseB);
    const otherMatch = createRuntimeStatePairAuthority({ matchId: "match-b", authorityIncarnation: 1,
      manifestHash: MANIFEST_HASH, manifestSchema: MANIFEST_SCHEMA });
    assert.strictEqual(otherMatch.diagnostics().publisher.recipients, 0);
  });

  await runner.run("reconnect recipient incarnation and manifest identity require fresh admission and keyframe", async () => {
    const id = binding();
    const server = authority();
    server.admit(id, claims(id));
    server.publish(id, ...Object.values(sourceFrames(id, 1)));
    server.disconnect(id);
    const next = binding("a", { connectionId: "session-a-2", connectionEpoch: 2 });
    assert.throws(() => server.publish(next, ...Object.values(sourceFrames(next, 2))), /not admitted/);
    server.admit(next, claims(next));
    assert.strictEqual(server.publish(next, ...Object.values(sourceFrames(next, 2))).projectionKind, "keyframe");
    const changed = binding("a", { manifestHash: `sha256:${"b".repeat(64)}` });
    assert.throws(() => server.admit(changed, claims(changed)), /outside this match authority/);
  });

  await runner.run("bounded oversize input fails closed and deterministic replay is byte exact", async () => {
    const id = binding();
    const build = () => {
      const server = authority();
      server.admit(id, claims(id));
      return server.publish(id, ...Object.values(sourceFrames(id, 1))).frame;
    };
    assert.deepStrictEqual(build(), build());
    const small = authority({ publisherOptions: { maxPairBytes: 4096, maxRetainedBytesPerRecipient: 8192 } });
    small.admit(id, claims(id));
    const oversized = sourceFrames(id, 1);
    oversized.ownerFrame.state.cargo = ["x".repeat(16 * 1024)];
    assert.throws(() => small.publish(id, oversized.publicFrame, oversized.ownerFrame), /atomic state pair exceeds/);
  });

  await runner.run("representative 1 4 8 local projection costs are labeled pre-gate evidence", async () => {
    const evidence = [];
    for (const count of [1, 4, 8]) {
      const server = authority();
      const clients = [];
      for (let index = 0; index < count; index += 1) {
        const id = binding(String(index));
        server.admit(id, claims(id));
        clients.push(id);
      }
      const started = performance.now();
      let bytes = 0;
      for (const id of clients) bytes += server.publish(id, ...Object.values(sourceFrames(id, 1))).bytes;
      evidence.push({ recipients: count, bytes, cpuMs: performance.now() - started });
    }
    assert(evidence.every((row) => row.bytes > 0 && row.cpuMs >= 0));
    console.log(`  pre-gate local evidence ${JSON.stringify(evidence)}`);
  });

  const passed = runner.summary();
  process.exit(passed ? 0 : 1);
}

run().catch((error) => {
  console.error(error.stack || error.message);
  process.exit(1);
});
