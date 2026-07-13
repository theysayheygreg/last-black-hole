#!/usr/bin/env node
"use strict";

const assert = require("assert");
const { TestRunner } = require("./helpers.cjs");
const { encodeWireFrame, SERVER_TO_CLIENT } = require("../scripts/multiplayer-wire-protocol.cjs");
const { createClientDeltaReceiver } = require("../scripts/client-delta-receiver.cjs");
const {
  ENTITY_FIELD_CLASSIFICATION,
  PUBLIC_FACT_CLASSIFICATION,
  splitRuntimePublicEntity,
  reconstructRuntimePublicEntity,
} = require("../scripts/runtime-public-schema.cjs");
const {
  CAPABILITY,
  MIXED_CAPABILITY,
  RUNTIME_PUBLIC_COMPONENTS_CAPABILITY,
  createRuntimeStatePairAuthority,
} = require("../scripts/runtime-state-pair-integration.cjs");

const MANIFEST_SCHEMA = "lbh-session-replication-manifest-v1";
const MANIFEST_HASH = `sha256:${"8".repeat(64)}`;

const EXAMPLES = Object.freeze({
  player: { clientId: "p1", name: "Pilot", isAI: false, personality: null, hullType: "drifter",
    status: "alive", wx: 1, wy: 2, vx: 0.1, vy: -0.2,
    slingshot: { engaged: false, anchorId: null, anchorType: null, anchorWX: null, anchorWY: null,
      anchorRange: 0, orbitDir: 0 } },
  well: { id: "w1", wx: 1, wy: 1, killRadius: 0.1, mass: 2, growthRate: 0.01,
    consumedByInhibitor: false, name: "Well", orbitalDir: 1, points: 8, spinRate: 0.1,
    baseKillRadius: 0.05, startMass: 2 },
  star: { id: "s1", type: "blue", wx: 2, wy: 2, driftVX: 0, driftVY: 0, alive: true,
    mass: 1, orbitalDir: -1 },
  wreck: { id: "r1", type: "derelict", name: "Wreck", wx: 3, wy: 3, vx: 0, vy: 0, size: 1,
    alive: true, looted: false, pickupCooldown: 0, tier: 1, spawnTime: 0,
    loot: [{ id: "flow-vane", name: "Flow Vane", tier: 1, affinity: "drifter",
      coefficients: { currentCoupling: 1.08 }, value: 22, catalogId: "flow-vane", category: "artifact",
      subcategory: "equippable", baseValue: 22, effectDesc: "currentCoupling x1.08" }] },
  planetoid: { id: "b1", type: "orbiter", wx: 4, wy: 4, vx: 0.1, vy: 0.1, alive: true,
    age: 1, t: 0.2, wellIndex: 0, pathData: { wellIndex: 0, semiA: 0.2, semiB: 0.1, tilt: 1, speed: 0.2 } },
  portal: { id: "q1", type: "standard", wave: 1, wx: 4, wy: 2, alive: true, lifespan: 60,
    spawnTime: 0, blockedByInhibitor: false, finalInhibitor: false, opacity: 1 },
  scavenger: { id: "a1", name: "Scav", callsign: "S", archetype: "picker", faction: "neutral",
    wx: 1, wy: 4, vx: 0, vy: 0, facing: 0, driftHeading: 0, alive: true, state: "patrol",
    decisionTimer: 0.5, lootCount: 0, lootTarget: null, targetPortalId: null, targetWreckId: null,
    deathTimer: 0, deathWellId: null, deathWellWX: 0, deathWellWY: 0, deathStartWX: 0,
    deathStartWY: 0, deathAngle: 0, thrustIntensity: 0 },
  fauna: { id: "f1", type: "jelly", wx: 2, wy: 4, vx: 0.01, vy: 0.01, alive: true,
    age: 2, lifespan: 60, phase: 0.5 },
  sentry: { id: "t1", wx: 3, wy: 4, lungeTargetX: 3.2, lungeTargetY: 4.2, alive: true,
    state: "patrol", wellId: "w1", lungeTimer: 0, recoverTimer: 0, orbitAngle: 1, orbitDir: 1,
    orbitRadius: 0.2, orbitSpeed: 0.1 },
  inhibitor: { form: 0, wx: 0, wy: 0, targetWX: 0, targetWY: 0, lastSignalWX: 0, lastSignalWY: 0,
    radius: 0, intensity: 0, threshold: 0.9, pressureFrac: 0, pressure: 0, finalPortalSpawned: false,
    finalPortalExpired: false, gravityBonus: 0, localTime: 0, formTimes: [null, null, null, null] },
});

function binding() {
  return { runId: "match-s8", connectionId: "session-s8", membershipId: "member-s8", playerId: "p1",
    connectionEpoch: 1, wireVersion: "lbh-multiplayer-json-v2",
    capabilities: [CAPABILITY, MIXED_CAPABILITY, RUNTIME_PUBLIC_COMPONENTS_CAPABILITY, "static-manifest-v1"].sort(),
    manifestSchema: MANIFEST_SCHEMA, manifestHash: MANIFEST_HASH, authorityIncarnation: 3 };
}

function claims(id) {
  return { membershipId: id.membershipId, playerId: id.playerId, profileId: "profile-s8",
    wireVersion: id.wireVersion, capabilities: id.capabilities, manifestSchema: id.manifestSchema,
    manifestHash: id.manifestHash, authorityIncarnation: id.authorityIncarnation };
}

function frames(id, beat, mutate = null) {
  const examples = JSON.parse(JSON.stringify(EXAMPLES));
  if (mutate) mutate(examples);
  const state = {
    type: "snapshot", protocolVersion: "lbh-sim-v1", bodySchemaVersion: 1, snapshotSchemaVersion: 2,
    runId: id.runId, baselineSnapshotId: beat, snapshotId: beat, tick: beat * 6, simTime: beat / 10,
    fieldRevision: 1, serverTime: beat * 100, lastEventSeq: beat,
    session: { id: "session", runId: id.runId, mapId: "shallows", mapName: "The Shallows", seed: 1,
      maxPlayers: 8, worldScale: 5, simScaleProfile: "small", clientPerfProfile: "fixedGrid",
      status: "running", hostClientId: "p1", hostName: "Pilot", overloadState: "NORMAL", overloadPressure: 0,
      timeScale: 1, tickHz: 60, snapshotHz: 10 },
    players: [examples.player],
    world: { wells: [examples.well], stars: [examples.star], wrecks: [examples.wreck],
      planetoids: [examples.planetoid], portals: [examples.portal], scavengers: [examples.scavenger],
      fauna: [examples.fauna], sentries: [examples.sentry], nextPortalWaveIndex: 0 },
    inhibitor: examples.inhibitor,
  };
  return {
    publicFrame: { type: "publicState", runId: id.runId, snapshotId: beat, tick: beat * 6,
      simTime: beat / 10, lastEventSeq: beat, fieldRevision: 1, overloadMode: "NORMAL",
      lastInputSeq: 0, lastActionSeq: 0, manifestHash: MANIFEST_HASH, full: true, state },
    ownerFrame: { type: "ownerState", runId: id.runId, membershipId: id.membershipId, playerId: id.playerId,
      snapshotId: beat, tick: beat * 6, simTime: beat / 10, lastEventSeq: beat, fieldRevision: 1,
      overloadMode: "NORMAL", lastInputSeq: beat, lastActionSeq: beat,
      state: { profileId: "private", cargo: ["secret"] } },
    examples,
  };
}

function receiver(id) {
  return createClientDeltaReceiver({ context: { matchId: id.runId, sessionId: id.connectionId,
    authorityIncarnation: id.authorityIncarnation, recipientId: id.membershipId,
    recipientIncarnation: id.connectionEpoch, manifestSchema: id.manifestSchema, manifestHash: id.manifestHash },
  capabilities: id.capabilities });
}

async function run() {
  const runner = new TestRunner("RuntimePublicComponents");

  await runner.run("source classification is exhaustive unique and round-trips every public entity category", () => {
    assert.deepStrictEqual(Object.keys(ENTITY_FIELD_CLASSIFICATION).sort(), Object.keys(EXAMPLES).sort());
    for (const [category, groups] of Object.entries(ENTITY_FIELD_CLASSIFICATION)) {
      const fields = Object.values(groups).flat();
      assert.strictEqual(new Set(fields).size, fields.length, `${category} field appears in more than one cadence group`);
      assert(Object.keys(EXAMPLES[category]).every((field) => fields.includes(field)),
        `${category} example contains an unclassified field`);
      const components = splitRuntimePublicEntity(category, EXAMPLES[category]);
      const reconstructed = reconstructRuntimePublicEntity({ category, components: Object.fromEntries(
        Object.entries(components).map(([name, value]) => [name, { revision: 1, value }])) });
      assert.deepStrictEqual(reconstructed, JSON.parse(JSON.stringify(EXAMPLES[category])));
    }
    assert(PUBLIC_FACT_CLASSIFICATION.staticSession.includes("seed")
      && PUBLIC_FACT_CLASSIFICATION.dynamicSession.includes("overloadState"));
    for (const [category, example] of Object.entries(EXAMPLES)) {
      const lifecycleExample = { ...example, sourceId: `${category}-source`, incarnation: 2 };
      const components = splitRuntimePublicEntity(category, lifecycleExample);
      const reconstructed = reconstructRuntimePublicEntity({ category, components: Object.fromEntries(
        Object.entries(components).map(([name, value]) => [name, { revision: 1, value }])) });
      assert.deepStrictEqual(reconstructed, lifecycleExample, `${category} lifecycle identity did not round-trip`);
    }
  });

  await runner.run("unknown top-level and nested source fields fail closed before projection", () => {
    assert.throws(() => splitRuntimePublicEntity("player", { ...EXAMPLES.player, cargo: ["secret"] }),
      (error) => error.code === "unknown-source-field");
    assert.throws(() => splitRuntimePublicEntity("player", { ...EXAMPLES.player,
      slingshot: { ...EXAMPLES.player.slingshot, futureAnchorField: true } }),
    (error) => error.code === "unknown-source-field");
    assert.throws(() => splitRuntimePublicEntity("new-category", { id: "x" }),
      (error) => error.code === "unknown-source-category");
  });

  await runner.run("ticket-bound split schema publishes 10 Hz motion-only deltas and atomically reconstructs legacy values", () => {
    const id = binding();
    const authority = createRuntimeStatePairAuthority({ matchId: id.runId, authorityIncarnation: 3,
      manifestSchema: MANIFEST_SCHEMA, manifestHash: MANIFEST_HASH,
      publisherOptions: { preparedProjections: true, ackRejectDiagnostics: true } });
    authority.admit(id, claims(id));
    const client = receiver(id);
    const firstSource = frames(id, 1);
    const first = authority.publish(id, firstSource.publicFrame, firstSource.ownerFrame);
    const acceptedFirst = client.receive(encodeWireFrame(first.frame, { direction: SERVER_TO_CLIENT }));
    assert(acceptedFirst.accepted && authority.acknowledge(id, acceptedFirst.ack).accepted);
    const byCategory = new Map(acceptedFirst.state.legacyPublicEntities.map((entry) => [entry.category, entry.value]));
    for (const [category, value] of Object.entries(firstSource.examples)) assert.deepStrictEqual(byCategory.get(category), value);
    assert(!JSON.stringify(acceptedFirst.state.public).includes("private"));

    const secondSource = frames(id, 2, (examples) => { examples.player.wx = 1.25; examples.player.vx = 0.25; });
    const second = authority.publish(id, secondSource.publicFrame, secondSource.ownerFrame);
    assert.strictEqual(second.frame.public.kind, "delta");
    const playerUpdate = second.frame.public.delta.updates.find((entry) =>
      entry.publicEntityId.includes("player") && Object.hasOwn(entry.components, "runtimeMotion"));
    assert(playerUpdate && Object.keys(playerUpdate.components).every((name) => name === "runtimeMotion"),
      "A movement beat resent an unrelated runtime component");
    const acceptedSecond = client.receive(encodeWireFrame(second.frame, { direction: SERVER_TO_CLIENT }));
    assert(acceptedSecond.accepted && acceptedSecond.state.legacyPublicEntities
      .find((entry) => entry.category === "player").value.wx === 1.25);
    assert(authority.acknowledge(id, acceptedSecond.ack).accepted);
    const diagnostics = authority.diagnostics();
    assert.deepStrictEqual(diagnostics.runtimePublicComponents.cadence,
      { motionHz: 10, otherGroups: "on-change", lowerCadenceTimers: 0 });
    assert.strictEqual(diagnostics.publisher.ackRejectDiagnostics.total, 0);

    authority.recover(id);
    const thirdSource = frames(id, 3, (examples) => { examples.player.wx = 1.5; });
    const recovery = authority.publish(id, thirdSource.publicFrame, thirdSource.ownerFrame);
    assert(recovery.frame.public.kind === "keyframe" && recovery.frame.owner.kind === "keyframe");
    const acceptedRecovery = client.receive(encodeWireFrame(recovery.frame, { direction: SERVER_TO_CLIENT }));
    assert(acceptedRecovery.accepted && acceptedRecovery.state.legacyPublicEntities
      .find((entry) => entry.category === "player").value.wx === 1.5);
    authority.disconnect(id);
    assert.strictEqual(authority.diagnostics().publisher.recipients, 0);
  });

  process.exit(runner.summary() ? 0 : 1);
}

run().catch((error) => { console.error(error.stack || error); process.exit(1); });
