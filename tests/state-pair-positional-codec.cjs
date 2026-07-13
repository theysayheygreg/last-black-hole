#!/usr/bin/env node
"use strict";

const assert = require("assert");
const crypto = require("crypto");
const { performance } = require("perf_hooks");
const { TestRunner } = require("./helpers.cjs");
const { createRuntimeStatePairAuthority } = require("../scripts/runtime-state-pair-integration.cjs");
const { createClientDeltaReceiver } = require("../scripts/client-delta-receiver.cjs");
const { projectionHash } = require("../scripts/canonical-structural-delta.cjs");
const {
  CLIENT_TO_SERVER, SERVER_TO_CLIENT, WireProtocolError, encodeWireFrame, parseWireFrame,
} = require("../scripts/multiplayer-wire-protocol.cjs");
const {
  CAPABILITY: POSITIONAL_CAPABILITY,
  POSITIONAL_CODEC_MANIFEST,
  POSITIONAL_CODEC_MANIFEST_HASH,
  codecContext,
} = require("../scripts/state-pair-positional-codec.cjs");

const MANIFEST_SCHEMA = "lbh-session-replication-manifest-v1";
const MANIFEST_HASH = `sha256:${"9".repeat(64)}`;
const CAPABILITIES = Object.freeze(["runtime-public-components-v1", "state-pair-mixed-v1",
  "state-pair-v1", POSITIONAL_CAPABILITY, "static-manifest-v1"].sort());

function binding(overrides = {}) {
  return { runId: "match-s9", connectionId: "session-s9", membershipId: "member-s9", playerId: "player-s9",
    connectionEpoch: 1, wireVersion: "lbh-multiplayer-json-v2", capabilities: [...CAPABILITIES],
    manifestSchema: MANIFEST_SCHEMA, manifestHash: MANIFEST_HASH, authorityIncarnation: 7, ...overrides };
}

function claims(id) {
  return { membershipId: id.membershipId, playerId: id.playerId, profileId: "profile-s9",
    wireVersion: id.wireVersion, capabilities: id.capabilities, manifestSchema: id.manifestSchema,
    manifestHash: id.manifestHash, authorityIncarnation: id.authorityIncarnation };
}

function sourceFrames(id, beat, { player = true, x = beat / 10, secret = "owner-secret" } = {}) {
  const state = {
    type: "snapshot", protocolVersion: "lbh-sim-v1", bodySchemaVersion: 1, snapshotSchemaVersion: 2,
    runId: id.runId, baselineSnapshotId: beat, snapshotId: beat, tick: beat * 6, simTime: beat / 10,
    fieldRevision: beat, serverTime: beat * 100, lastEventSeq: beat,
    session: { id: "session", runId: id.runId, mapId: "shallows", mapName: "The Shallows", seed: 9,
      maxPlayers: 8, worldScale: 5, simScaleProfile: "small", clientPerfProfile: "fixedGrid",
      status: "running", hostClientId: "player-s9", hostName: "Pilot", overloadState: "NORMAL",
      overloadPressure: 0, timeScale: 1, tickHz: 60, snapshotHz: 10 },
    players: player ? [{ clientId: "player-s9", name: "Pilot", isAI: false, personality: null,
      hullType: "drifter", status: "alive", wx: x, wy: 0.4, vx: 0.1, vy: -0.2,
      slingshot: { engaged: false, anchorId: null, anchorType: null, anchorWX: null, anchorWY: null,
        anchorRange: 0, orbitDir: 0 } }] : [],
    world: { wells: [], stars: [], wrecks: [], planetoids: [], portals: [], scavengers: [], fauna: [],
      sentries: [], nextPortalWaveIndex: 0 },
    inhibitor: { form: 0, wx: 0, wy: 0, targetWX: 0, targetWY: 0, lastSignalWX: 0, lastSignalWY: 0,
      radius: 0, intensity: 0, threshold: 0.9, pressureFrac: 0, pressure: 0,
      finalPortalSpawned: false, finalPortalExpired: false, gravityBonus: 0, localTime: 0,
      formTimes: [null, null, null, null] },
  };
  return {
    publicFrame: { type: "publicState", runId: id.runId, snapshotId: beat, tick: beat * 6,
      simTime: beat / 10, lastEventSeq: beat, fieldRevision: beat, overloadMode: "NORMAL",
      lastInputSeq: 0, lastActionSeq: 0, manifestHash: MANIFEST_HASH, full: true, state },
    ownerFrame: { type: "ownerState", runId: id.runId, membershipId: id.membershipId, playerId: id.playerId,
      snapshotId: beat, tick: beat * 6, simTime: beat / 10, lastEventSeq: beat, fieldRevision: beat,
      overloadMode: "NORMAL", lastInputSeq: beat, lastActionSeq: beat,
      state: { profileId: secret, rigLevels: [1, 0, 0], cargo: [], cargoCount: 0,
        effectState: { shieldCharges: 0, timeSlowRemaining: 0, pulseCooldownRemaining: 0,
          hullGraceRemaining: 0 }, signal: { level: 0, zone: "ghost", prevZone: "ghost" } } },
  };
}

function context(id) {
  return codecContext({ matchId: id.runId, sessionId: id.connectionId,
    authorityIncarnation: id.authorityIncarnation, recipientId: id.membershipId,
    recipientIncarnation: id.connectionEpoch, manifestHash: id.manifestHash,
    codecManifestHash: POSITIONAL_CODEC_MANIFEST_HASH });
}

function receiver(id) {
  return createClientDeltaReceiver({ context: { matchId: id.runId, sessionId: id.connectionId,
    authorityIncarnation: id.authorityIncarnation, recipientId: id.membershipId,
    recipientIncarnation: id.connectionEpoch, manifestSchema: id.manifestSchema, manifestHash: id.manifestHash },
  capabilities: id.capabilities });
}

function publish(authority, id, beat, options) {
  const source = sourceFrames(id, beat, options);
  return authority.publish(id, source.publicFrame, source.ownerFrame);
}

function mutateJson(wire, mutate) {
  const value = JSON.parse(wire);
  mutate(value);
  return JSON.stringify(value);
}

async function run() {
  const runner = new TestRunner("StatePairPositionalCodec");

  await runner.run("manifest binds exact immutable dictionaries layouts limits and hash", () => {
    assert.strictEqual(POSITIONAL_CODEC_MANIFEST.codecSchema, "lbh-state-pair-positional-json-v1");
    assert(POSITIONAL_CODEC_MANIFEST.dictionaries.categories.includes("owner"));
    assert(POSITIONAL_CODEC_MANIFEST.dictionaries.components.includes("runtimeMotion"));
    assert(POSITIONAL_CODEC_MANIFEST.dictionaries.fields.includes("profileId"));
    assert.match(POSITIONAL_CODEC_MANIFEST_HASH, /^sha256:[0-9a-f]{64}$/);
    assert(Object.isFrozen(POSITIONAL_CODEC_MANIFEST));
  });

  await runner.run("keyframe and mixed deltas preserve semantic hashes and deterministic positional bytes", () => {
    const id = binding();
    const authority = createRuntimeStatePairAuthority({ matchId: id.runId,
      authorityIncarnation: id.authorityIncarnation, manifestSchema: id.manifestSchema,
      manifestHash: id.manifestHash, publisherOptions: { preparedProjections: true } });
    authority.admit(id, claims(id));
    const client = receiver(id);
    const transcript = [];
    for (let beat = 1; beat <= 4; beat += 1) {
      const produced = publish(authority, id, beat, { x: beat < 3 ? 0.1 : beat / 10 });
      const wire = encodeWireFrame(produced.frame, { direction: SERVER_TO_CLIENT, positionalContext: context(id) });
      assert.strictEqual(wire, encodeWireFrame(produced.frame,
        { direction: SERVER_TO_CLIENT, positionalContext: context(id) }));
      assert(wire.startsWith("["));
      assert(wire.length < JSON.stringify(produced.frame).length * 0.55,
        `positional bytes ${wire.length} did not materially reduce object JSON ${JSON.stringify(produced.frame).length}`);
      assert.deepStrictEqual(parseWireFrame(wire,
        { direction: SERVER_TO_CLIENT, positionalContext: context(id), requirePositional: true }), produced.frame,
      "Decoded positional statePair must equal the canonical object frame exactly");
      const accepted = client.receive(wire);
      assert.strictEqual(accepted.accepted, true);
      assert.strictEqual(projectionHash(accepted.state.public), accepted.ack.publicHash);
      assert.strictEqual(projectionHash(accepted.state.owner), accepted.ack.ownerHash);
      const ackWire = encodeWireFrame(accepted.ack, { direction: CLIENT_TO_SERVER, positionalContext: context(id) });
      const ack = parseWireFrame(ackWire, { direction: CLIENT_TO_SERVER, positionalContext: context(id), requirePositional: true });
      assert.strictEqual(authority.acknowledge(id, ack).accepted, true);
      transcript.push(wire);
    }
    const digest = crypto.createHash("sha256").update(transcript.join("\n")).digest("hex");
    assert.match(digest, /^[0-9a-f]{64}$/);
    assert(client.current().legacyPublicState.players.length === 1);
    assert(!JSON.stringify(client.current().public).includes("owner-secret"), "public lane leaked owner-private state");
  });

  await runner.run("loss applies the next branch from a retained base and preserves despawn reincarnation ACK bases", () => {
    const id = binding();
    const authority = createRuntimeStatePairAuthority({ matchId: id.runId,
      authorityIncarnation: id.authorityIncarnation, manifestSchema: id.manifestSchema,
      manifestHash: id.manifestHash, publisherOptions: { preparedProjections: true, ackRejectDiagnostics: true } });
    authority.admit(id, claims(id));
    const client = receiver(id);
    const accept = (produced) => client.receive(encodeWireFrame(produced.frame,
      { direction: SERVER_TO_CLIENT, positionalContext: context(id) }));
    const first = accept(publish(authority, id, 1));
    authority.acknowledge(id, first.ack);
    publish(authority, id, 2, { x: 0.2 }); // deterministically lost before receiver admission
    const lagged = accept(publish(authority, id, 3, { x: 0.3 }));
    assert.strictEqual(lagged.accepted, true);
    assert.strictEqual(client.diagnostics().recoveryRequests, 0);
    authority.acknowledge(id, lagged.ack);
    const despawned = accept(publish(authority, id, 4, { player: false }));
    assert.strictEqual(despawned.accepted, true);
    assert.strictEqual(despawned.state.legacyPublicState.players.length, 0);
    authority.acknowledge(id, despawned.ack);
    const reincarnated = accept(publish(authority, id, 5, { player: true, x: 0.5 }));
    assert.strictEqual(reincarnated.accepted, true);
    assert(reincarnated.state.public.entities.find((entity) => entity.category === "player").incarnation > 1);
    assert.strictEqual(authority.diagnostics().publisher.ackRejectDiagnostics.total, 0);
  });

  await runner.run("decoder rejects alternate JSON forms holes tags lengths numbers and cross-context replay", () => {
    const id = binding();
    const authority = createRuntimeStatePairAuthority({ matchId: id.runId,
      authorityIncarnation: id.authorityIncarnation, manifestSchema: id.manifestSchema,
      manifestHash: id.manifestHash });
    authority.admit(id, claims(id));
    const wire = encodeWireFrame(publish(authority, id, 1).frame,
      { direction: SERVER_TO_CLIENT, positionalContext: context(id) });
    const reject = (raw, codec = context(id)) => assert.throws(() => parseWireFrame(raw,
      { direction: SERVER_TO_CLIENT, positionalContext: codec, requirePositional: true }), WireProtocolError);
    reject(` ${wire}`);
    reject(wire.replace(",1,", ",-0,"));
    reject(mutateJson(wire, (value) => value.push(null)));
    reject(mutateJson(wire, (value) => { value[0] = 99; }));
    reject(mutateJson(wire, (value) => { value[16] = 99; }));
    reject(mutateJson(wire, (value) => { value[19][3].push([999, "x", 1, 1, []]); }));
    reject(wire, context(binding({ runId: "other-match" })));
    reject(JSON.stringify(parseWireFrame(wire,
      { direction: SERVER_TO_CLIENT, positionalContext: context(id), requirePositional: true })));
  });

  await runner.run("codec round-trips prototype-like values without dynamic-key pollution", () => {
    const id = binding();
    const authority = createRuntimeStatePairAuthority({ matchId: id.runId,
      authorityIncarnation: id.authorityIncarnation, manifestSchema: id.manifestSchema,
      manifestHash: id.manifestHash });
    authority.admit(id, claims(id));
    const frame = publish(authority, id, 1, { secret: "__proto__" }).frame;
    const wire = encodeWireFrame(frame, { direction: SERVER_TO_CLIENT, positionalContext: context(id) });
    const decoded = parseWireFrame(wire,
      { direction: SERVER_TO_CLIENT, positionalContext: context(id), requirePositional: true });
    const value = decoded.owner.projection.entities[0].components.ownerState.value;
    assert.strictEqual(value.profileId, "__proto__");
    assert.strictEqual(Object.getPrototypeOf(value), Object.prototype);
    assert.strictEqual(Object.hasOwn(value, "__proto__"), false);
  });

  await runner.run("legacy object JSON and prepared sparse rollback remain unchanged when codec is absent", () => {
    const id = binding({ capabilities: CAPABILITIES.filter((value) => value !== POSITIONAL_CAPABILITY) });
    const authority = createRuntimeStatePairAuthority({ matchId: id.runId,
      authorityIncarnation: id.authorityIncarnation, manifestSchema: id.manifestSchema,
      manifestHash: id.manifestHash });
    authority.admit(id, claims(id));
    const pair = publish(authority, id, 1);
    const wire = encodeWireFrame(pair.frame, { direction: SERVER_TO_CLIENT });
    assert(wire.startsWith("{"));
    assert.deepStrictEqual(parseWireFrame(wire, { direction: SERVER_TO_CLIENT }), pair.frame);
  });

  await runner.run("bounded codec CPU and allocation proxies are measured without retained session dictionaries", () => {
    const id = binding();
    const authority = createRuntimeStatePairAuthority({ matchId: id.runId,
      authorityIncarnation: id.authorityIncarnation, manifestSchema: id.manifestSchema,
      manifestHash: id.manifestHash });
    authority.admit(id, claims(id));
    const frame = publish(authority, id, 1).frame;
    const started = performance.now();
    let bytes = 0;
    for (let index = 0; index < 250; index += 1) {
      const wire = encodeWireFrame(frame, { direction: SERVER_TO_CLIENT, positionalContext: context(id) });
      bytes += Buffer.byteLength(wire, "utf8");
      parseWireFrame(wire, { direction: SERVER_TO_CLIENT, positionalContext: context(id), requirePositional: true });
    }
    const elapsed = performance.now() - started;
    assert(elapsed < 2500, `250 encode/decode pairs took ${elapsed.toFixed(1)} ms`);
    assert(bytes > 0);
    assert.strictEqual(authority.diagnostics().positionalJson.mutableSessionDictionaries, 0);
    console.log(`  positional codec 250x encode+decode ${elapsed.toFixed(2)} ms, encoded proxy ${bytes} B`);
  });

  if (!runner.summary()) process.exit(1);
}

run().catch((error) => { console.error(error); process.exit(1); });
