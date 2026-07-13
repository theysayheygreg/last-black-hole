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
  encodePositionalFrame,
  decodePositionalFrame,
  composeStatePairCandidates,
  composeStatePairLaneCandidates,
} = require("../scripts/state-pair-positional-codec.cjs");
const { canonicalJsonBytes } = require("../scripts/session-replication-manifest.cjs");
const { CODEC_PAIR_TIE_ORDER } = require("../scripts/authority-delta-publisher.cjs");

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

function sourceFrames(id, beat, { player = true, x = beat / 10, secret = "owner-secret", cargoItems = 0 } = {}) {
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
      state: { profileId: secret, rigLevels: [1, 0, 0],
        cargo: Array.from({ length: cargoItems }, (_, index) => `stable-cargo-${index}`), cargoCount: cargoItems,
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

  await runner.run("exact component sizing matches brute-force wires across UTF-8 and JSON escaping", () => {
    const strings = ["plain-ascii", "caf\u00e9-\ud83d\ude80-\u6f22\u5b57", "quote-\"-slash-\\-controls-\n\t\u0000",
      "x".repeat(8192), "\ud83d\ude80".repeat(2048)];
    let parityCases = 0;
    for (let index = 0; index < 80; index += 1) {
      const marker = strings[index % strings.length];
      const ctx = codecContext({ matchId: "match-s14", sessionId: "session-s14", authorityIncarnation: 3,
        recipientId: "member-s14", recipientIncarnation: 2, manifestHash: MANIFEST_HASH });
      const header = { type: "statePair", pairSchema: "lbh-authority-state-pair-mixed-v1",
        matchId: ctx.matchId, sessionId: ctx.sessionId, authorityIncarnation: ctx.authorityIncarnation,
        recipientId: ctx.recipientId, recipientIncarnation: ctx.recipientIncarnation, frameId: index + 1,
        statePairId: `pair-${index}`, snapshotId: `snapshot-${index}`, tick: index * 6,
        simTime: index / 10, eventWatermark: index, fieldRevision: index, overloadMode: "NORMAL",
        ballparkEpoch: 1, manifestHash: MANIFEST_HASH };
      const keyframe = (lane) => ({ kind: "keyframe", schema: "lbh-canonical-projection-v1",
        resultHash: `sha256:${lane === "public" ? "a" : "b".repeat(1)}${"0".repeat(63)}`,
        projection: { schema: "lbh-canonical-projection-v1", lane, runId: header.matchId,
          authorityEpoch: header.authorityIncarnation, connectionEpoch: header.recipientIncarnation,
          ballparkEpoch: header.ballparkEpoch, manifestHash: header.manifestHash,
          statePairId: header.statePairId, snapshotId: header.snapshotId, tick: header.tick,
          simTime: header.simTime, eventWatermark: header.eventWatermark, fieldRevision: header.fieldRevision,
          overloadMode: header.overloadMode, world: { publicFacts: { profileId: marker } }, entities: [] } });
      const delta = (lane) => ({ kind: "delta", schema: "lbh-canonical-structural-delta-v1",
        baseSnapshotId: `base-${index}`, baseHash: `sha256:${"c".repeat(64)}`,
        resultHash: `sha256:${"d".repeat(64)}`, delta: { schema: "lbh-canonical-structural-delta-v1",
          lane, runId: header.matchId, authorityEpoch: header.authorityIncarnation,
          connectionEpoch: header.recipientIncarnation, ballparkEpoch: header.ballparkEpoch,
          manifestHash: header.manifestHash, statePairId: header.statePairId,
          baseSnapshotId: `base-${index}`, snapshotId: header.snapshotId,
          baseHash: `sha256:${"c".repeat(64)}`, resultHash: `sha256:${"d".repeat(64)}`,
          rootOps: [{ op: "set", path: ["publicFacts"], value: { profileId: marker } }],
          creates: [], updates: [], despawns: [] } });
      const lanes = { public: { keyframe: keyframe("public"), delta: delta("public") },
        owner: { keyframe: keyframe("owner"), delta: delta("owner") } };
      const entries = CODEC_PAIR_TIE_ORDER.map((kind) => {
        const [publicKind, ownerKind] = kind.split("+").map((part) => part.split("-")[1]);
        return { kind, frame: { ...header, public: lanes.public[publicKind], owner: lanes.owner[ownerKind] } };
      });
      const oracle = entries.map((entry) => {
        const wire = encodePositionalFrame(entry.frame, ctx);
        return { ...entry, wire, bytes: Buffer.byteLength(wire, "utf8") };
      });
      const selected = composeStatePairCandidates(entries, ctx, CODEC_PAIR_TIE_ORDER);
      const lazy = composeStatePairLaneCandidates(header, lanes, ctx, CODEC_PAIR_TIE_ORDER);
      assert.deepStrictEqual(selected.candidates.map(({ kind, bytes }) => ({ kind, bytes })),
        oracle.map(({ kind, bytes }) => ({ kind, bytes })));
      assert.deepStrictEqual(lazy.candidates, selected.candidates,
        "lazy descriptors must preserve the full exact four-candidate size transcript");
      const expected = [...oracle].sort((a, b) => a.bytes - b.bytes
        || CODEC_PAIR_TIE_ORDER.indexOf(a.kind) - CODEC_PAIR_TIE_ORDER.indexOf(b.kind))[0];
      assert.strictEqual(selected.chosen.kind, expected.kind);
      assert.strictEqual(selected.chosen.wire, expected.wire);
      assert.strictEqual(lazy.chosen.kind, expected.kind);
      assert.strictEqual(lazy.chosen.wire, expected.wire);
      assert.strictEqual(lazy.diagnostics.outerCandidateFrames, 1);
      assert.strictEqual(lazy.diagnostics.outerCandidateDescriptors, 4);
      assert.strictEqual(lazy.diagnostics.lanePayloadsBuilt, 4);
      assert.deepStrictEqual(decodePositionalFrame(selected.chosen.wire, ctx), selected.chosen.frame);
      assert.strictEqual(crypto.createHash("sha256").update(selected.chosen.wire).digest("hex"),
        crypto.createHash("sha256").update(expected.wire).digest("hex"));
      if (index === 0) {
        const tied = composeStatePairCandidates(CODEC_PAIR_TIE_ORDER.map((kind) => ({ kind,
          frame: entries[0].frame })), ctx, CODEC_PAIR_TIE_ORDER);
        assert.strictEqual(tied.chosen.kind, CODEC_PAIR_TIE_ORDER[0],
          "exact composed-size ties must preserve the safety-first order");
        const oversizedFrame = JSON.parse(JSON.stringify(entries[0].frame));
        oversizedFrame.public.projection.world.publicFacts.formTimes = Array.from({ length: 400 },
          () => "x".repeat(1000));
        assert.throws(() => composeStatePairCandidates(CODEC_PAIR_TIE_ORDER.map((kind) => ({ kind,
          frame: oversizedFrame })), ctx, CODEC_PAIR_TIE_ORDER), (error) => error?.code === "frame-too-large");
      }
      parityCases += entries.length;
    }
    assert.strictEqual(parityCases, 320);
  });

  await runner.run("keyframe and mixed deltas preserve semantic hashes and deterministic positional bytes", () => {
    const id = binding();
    const authority = createRuntimeStatePairAuthority({ matchId: id.runId,
      authorityIncarnation: id.authorityIncarnation, manifestSchema: id.manifestSchema,
      manifestHash: id.manifestHash, publisherOptions: { preparedProjections: true } });
    authority.admit(id, claims(id));
    const client = receiver(id);
    const semanticId = binding({ capabilities: CAPABILITIES.filter((value) => value !== POSITIONAL_CAPABILITY) });
    const semanticAuthority = createRuntimeStatePairAuthority({ matchId: semanticId.runId,
      authorityIncarnation: semanticId.authorityIncarnation, manifestSchema: semanticId.manifestSchema,
      manifestHash: semanticId.manifestHash, publisherOptions: { preparedProjections: true } });
    semanticAuthority.admit(semanticId, claims(semanticId));
    const semanticClient = receiver(semanticId);
    const transcript = [];
    const kinds = [];
    let ownerDeltaBeat = null;
    for (let beat = 1; beat <= 4; beat += 1) {
      const produced = publish(authority, id, beat, { x: beat < 3 ? 0.1 : beat / 10, cargoItems: 4 });
      assert(Object.isFrozen(produced.frame) && Object.isFrozen(produced.frame.public)
        && Object.isFrozen(produced.frame.owner), "published lazy winner and lane bindings must be immutable");
      const wire = encodeWireFrame(produced.frame, { direction: SERVER_TO_CLIENT, positionalContext: context(id) });
      assert.strictEqual(produced.encodedWire, wire, "publisher must retain the exact selected positional bytes");
      assert.strictEqual(produced.bytes, Buffer.byteLength(wire, "utf8"));
      assert.strictEqual(produced.expandedBytes, canonicalJsonBytes(produced.frame).length);
      assert.strictEqual(produced.encodedDigest,
        `sha256:${crypto.createHash("sha256").update(wire, "utf8").digest("hex")}`);
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
      const semanticProduced = publish(semanticAuthority, semanticId, beat,
        { x: beat < 3 ? 0.1 : beat / 10, cargoItems: 4 });
      const semanticAccepted = semanticClient.receive(encodeWireFrame(semanticProduced.frame,
        { direction: SERVER_TO_CLIENT }));
      assert.strictEqual(semanticAccepted.accepted, true);
      assert.strictEqual(projectionHash(semanticAccepted.state.public), projectionHash(accepted.state.public));
      assert.strictEqual(projectionHash(semanticAccepted.state.owner), projectionHash(accepted.state.owner));
      assert.strictEqual(semanticAuthority.acknowledge(semanticId, semanticAccepted.ack).accepted, true);
      if (produced.priorSemanticProjectionKind === "public-delta+owner-keyframe"
          && produced.projectionKind === "delta") ownerDeltaBeat = beat;
      kinds.push([beat, produced.priorSemanticProjectionKind, produced.projectionKind, produced.bytes]);
      transcript.push(wire);
    }
    const digest = crypto.createHash("sha256").update(transcript.join("\n")).digest("hex");
    assert.match(digest, /^[0-9a-f]{64}$/);
    assert(client.current().legacyPublicState.players.length === 1);
    assert(!JSON.stringify(client.current().public).includes("owner-secret"), "public lane leaked owner-private state");
    assert(ownerDeltaBeat !== null,
      `actual positional bytes must select owner delta on a beat where expanded semantic sizing chose owner keyframe: ${JSON.stringify(kinds)}`);
    const choice = authority.diagnostics().publisher.codecPairChoice;
    assert(choice.bytesSavedVsPriorSemanticChoice > 0);
    assert.strictEqual(choice.ephemeralCandidates.maxPerPublish, 4);
    assert.strictEqual(choice.ephemeralCandidates.retainedAfterPublish, 0);
    assert.strictEqual(choice.operations.winnerSerializations, 4);
    assert.strictEqual(choice.operations.fullCandidateCompositions, 4);
    assert(choice.operations.componentSerializations > 0);
    assert.strictEqual(choice.operations.expandedLaneSerializationReuses, choice.selections * 4,
      "all four exact canonical lanes must be reused within each safe-base selection");
    assert.strictEqual(choice.operations.expandedLaneSerializations, 0,
      "expanded sizing must not serialize an already-proven lane again");
    assert(choice.operations.expandedReusedLaneBytes > 0);
    assert.strictEqual(choice.operations.expandedSerializedLaneBytes, 0);
    assert(choice.operations.expandedBytesExamined > 0);
    assert.strictEqual(choice.operations.outerCandidateDescriptors, choice.selections * 4);
    assert.strictEqual(choice.operations.outerCandidateFrames, choice.selections,
      "safe-base selection must materialize only its chosen complete frame");
    assert.strictEqual(choice.operations.chosenFrameMaterializations, choice.selections);
    assert.strictEqual(choice.operations.lanePayloadsBuilt, choice.selections * 4);
    assert.strictEqual(choice.operations.lanePayloadReferenceReuses, choice.selections * 4);
    assert.strictEqual(choice.operations.sizeProofOperations, choice.selections * 8);
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

  await runner.run("owner keyframe remains the exact positional winner when its delta overhead is larger", () => {
    const id = binding();
    const authority = createRuntimeStatePairAuthority({ matchId: id.runId,
      authorityIncarnation: id.authorityIncarnation, manifestSchema: id.manifestSchema,
      manifestHash: id.manifestHash, publisherOptions: { preparedProjections: true } });
    authority.admit(id, claims(id));
    const client = receiver(id);
    const first = publish(authority, id, 1, { cargoItems: 0 });
    const acceptedFirst = client.receive(first.encodedWire);
    assert(acceptedFirst.accepted && authority.acknowledge(id, acceptedFirst.ack).accepted);
    const second = publish(authority, id, 2, { cargoItems: 0, x: 0.2 });
    assert.strictEqual(second.projectionKind, "public-delta+owner-keyframe");
    const acceptedSecond = client.receive(second.encodedWire);
    assert.strictEqual(acceptedSecond.accepted, true);
    assert.strictEqual(projectionHash(acceptedSecond.state.public), second.frame.public.resultHash);
    assert.strictEqual(projectionHash(acceptedSecond.state.owner), second.frame.owner.resultHash);
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
