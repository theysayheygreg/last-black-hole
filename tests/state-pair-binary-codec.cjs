#!/usr/bin/env node
"use strict";

const assert = require("assert");
const crypto = require("crypto");
const { TestRunner } = require("./helpers.cjs");
const { createRuntimeStatePairAuthority } = require("../scripts/runtime-state-pair-integration.cjs");
const { createClientDeltaReceiver } = require("../scripts/client-delta-receiver.cjs");
const { selectedStatePairCodecCapability } = require("../scripts/sim-ws-adapter.cjs");
const {
  CLIENT_TO_SERVER, SERVER_TO_CLIENT, encodeWireFrame, parseWireFrame,
} = require("../scripts/multiplayer-wire-protocol.cjs");
const {
  CAPABILITY: POSITIONAL_CAPABILITY,
  POSITIONAL_CODEC_MANIFEST_HASH,
  codecContext: positionalContext,
} = require("../scripts/state-pair-positional-codec.cjs");
const {
  CAPABILITY: BINARY_CAPABILITY,
  CODEC_SCHEMA,
  BINARY_CODEC_MANIFEST,
  BINARY_CODEC_MANIFEST_HASH,
  HEADER_BYTES,
  codecContext: binaryContext,
  encodeBinaryFrame,
  decodeBinaryFrame,
} = require("../scripts/state-pair-binary-codec.cjs");

const MANIFEST_SCHEMA = "lbh-session-replication-manifest-v1";
const MANIFEST_HASH = `sha256:${"9".repeat(64)}`;
const BASE_CAPABILITIES = Object.freeze(["runtime-public-components-v1", "state-pair-mixed-v1",
  "state-pair-v1", POSITIONAL_CAPABILITY, "static-manifest-v1"].sort());
const BINARY_CAPABILITIES = Object.freeze([...BASE_CAPABILITIES, BINARY_CAPABILITY].sort());

function binding(capabilities = BINARY_CAPABILITIES) {
  return { runId: "match-s16", connectionId: "session-s16", membershipId: "member-s16", playerId: "player-s16",
    connectionEpoch: 1, wireVersion: "lbh-multiplayer-json-v2", capabilities: [...capabilities],
    manifestSchema: MANIFEST_SCHEMA, manifestHash: MANIFEST_HASH, authorityIncarnation: 7 };
}

function claims(id) {
  return { membershipId: id.membershipId, playerId: id.playerId, profileId: "profile-s16",
    wireVersion: id.wireVersion, capabilities: id.capabilities, manifestSchema: id.manifestSchema,
    manifestHash: id.manifestHash, authorityIncarnation: id.authorityIncarnation };
}

function sourceFrames(id, beat, marker = `owner-${beat}`) {
  const state = {
    type: "snapshot", protocolVersion: "lbh-sim-v1", bodySchemaVersion: 1, snapshotSchemaVersion: 2,
    runId: id.runId, baselineSnapshotId: beat, snapshotId: beat, tick: beat * 6, simTime: beat / 10,
    fieldRevision: beat, serverTime: beat * 100, lastEventSeq: beat,
    session: { id: "session", runId: id.runId, mapId: "shallows", mapName: "The Shallows", seed: 16,
      maxPlayers: 8, worldScale: 5, simScaleProfile: "small", clientPerfProfile: "fixedGrid",
      status: "running", hostClientId: id.playerId, hostName: "Pilot", overloadState: "NORMAL",
      overloadPressure: 0, timeScale: 1, tickHz: 60, snapshotHz: 10 },
    players: [{ clientId: id.playerId, name: "Pilot", isAI: false, personality: null,
      hullType: "drifter", status: "alive", wx: beat / 10, wy: 0.4, vx: 0.1, vy: -0.2,
      slingshot: { engaged: false, anchorId: null, anchorType: null, anchorWX: null, anchorWY: null,
        anchorRange: 0, orbitDir: 0 } }],
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
      state: { profileId: marker, rigLevels: [1, 0, 0], cargo: [], cargoCount: 0,
        effectState: { shieldCharges: 0, timeSlowRemaining: 0, pulseCooldownRemaining: 0,
          hullGraceRemaining: 0 }, signal: { level: 0, zone: "ghost", prevZone: "ghost" } } },
  };
}

function bctx(id) {
  return binaryContext({ matchId: id.runId, sessionId: id.connectionId,
    authorityIncarnation: id.authorityIncarnation, recipientId: id.membershipId,
    recipientIncarnation: id.connectionEpoch, manifestHash: id.manifestHash,
    codecManifestHash: BINARY_CODEC_MANIFEST_HASH });
}

function pctx(id) {
  return positionalContext({ matchId: id.runId, sessionId: id.connectionId,
    authorityIncarnation: id.authorityIncarnation, recipientId: id.membershipId,
    recipientIncarnation: id.connectionEpoch, manifestHash: id.manifestHash,
    codecManifestHash: POSITIONAL_CODEC_MANIFEST_HASH });
}

function createAuthorityAndClient(capabilities = BINARY_CAPABILITIES) {
  const id = binding(capabilities);
  const authority = createRuntimeStatePairAuthority({ matchId: id.runId,
    authorityIncarnation: id.authorityIncarnation, manifestSchema: id.manifestSchema,
    manifestHash: id.manifestHash, publisherOptions: { preparedProjections: true } });
  authority.admit(id, claims(id));
  const client = createClientDeltaReceiver({ context: { matchId: id.runId, sessionId: id.connectionId,
    authorityIncarnation: id.authorityIncarnation, recipientId: id.membershipId,
    recipientIncarnation: id.connectionEpoch, manifestSchema: id.manifestSchema,
    manifestHash: id.manifestHash }, capabilities: id.capabilities });
  return { id, authority, client };
}

async function run() {
  const runner = new TestRunner("StatePairBinaryCodec");

  await runner.run("versioned manifest binds binary transport to the positional semantic schema", () => {
    assert.strictEqual(BINARY_CODEC_MANIFEST.codecSchema, CODEC_SCHEMA);
    assert.strictEqual(BINARY_CODEC_MANIFEST.transport, "websocket-binary-message");
    assert.strictEqual(BINARY_CODEC_MANIFEST.payload.sourceSchema, POSITIONAL_CODEC_MANIFEST_HASH);
    assert.strictEqual(BINARY_CODEC_MANIFEST.payload.otherNumberEncoding,
      "ieee754-float64-be; finite; negative-zero-rejected");
    assert.match(BINARY_CODEC_MANIFEST_HASH, /^sha256:[0-9a-f]{64}$/);
    assert(Object.isFrozen(BINARY_CODEC_MANIFEST));
  });

  await runner.run("binary keyframe/delta transcript equals the exact positional JSON oracle and ACK lineage", () => {
    const { id, authority, client } = createAuthorityAndClient();
    const transcript = [];
    for (let beat = 1; beat <= 24; beat += 1) {
      const source = sourceFrames(id, beat, beat % 2 ? `café-🚀-${beat}` : `quote-\"-slash-\\-${beat}`);
      const produced = authority.publish(id, source.publicFrame, source.ownerFrame);
      assert(Buffer.isBuffer(produced.encodedWire), "binary publication must retain exact Buffer bytes");
      const binary = encodeWireFrame(produced.frame, { direction: SERVER_TO_CLIENT, binaryContext: bctx(id) });
      const positional = encodeWireFrame(produced.frame, { direction: SERVER_TO_CLIENT, positionalContext: pctx(id) });
      assert(produced.encodedWire.equals(binary));
      assert.strictEqual(produced.bytes, binary.length);
      assert.deepStrictEqual(decodeBinaryFrame(binary, bctx(id)), produced.frame);
      assert.deepStrictEqual(parseWireFrame(binary,
        { direction: SERVER_TO_CLIENT, binary: true, binaryContext: bctx(id) }), produced.frame);
      assert.deepStrictEqual(parseWireFrame(positional,
        { direction: SERVER_TO_CLIENT, positionalContext: pctx(id), requirePositional: true }), produced.frame);
      assert(binary.length < Buffer.byteLength(positional, "utf8"), "binary frame must beat its positional oracle bytes");
      const accepted = client.receive(binary);
      assert.strictEqual(accepted.accepted, true);
      const ackWire = encodeWireFrame(accepted.ack, { direction: CLIENT_TO_SERVER, binaryContext: bctx(id) });
      assert(Buffer.isBuffer(ackWire));
      const ack = parseWireFrame(ackWire, { direction: CLIENT_TO_SERVER, binary: true, binaryContext: bctx(id) });
      assert.strictEqual(authority.acknowledge(id, ack).accepted, true);
      transcript.push(crypto.createHash("sha256").update(binary).digest("hex"));
    }
    assert.strictEqual(new Set(transcript).size, transcript.length);
    assert.strictEqual(client.diagnostics().mode, BINARY_CAPABILITY);
  });

  await runner.run("positional JSON remains a complete negotiated fallback", () => {
    const { id, authority, client } = createAuthorityAndClient(BASE_CAPABILITIES);
    const source = sourceFrames(id, 1);
    const produced = authority.publish(id, source.publicFrame, source.ownerFrame);
    assert.strictEqual(typeof produced.encodedWire, "string");
    assert(produced.encodedWire.startsWith("["));
    assert.strictEqual(client.receive(produced.encodedWire).accepted, true);
  });

  await runner.run("lossless number/string edges and deterministic randomized values round-trip", () => {
    const { id, authority, client } = createAuthorityAndClient();
    const strings = ["", "ascii", "café-🚀-漢字", "quote-\"-slash-\\-controls-\n\t\u0000",
      "x".repeat(8192), "🚀".repeat(2048), "lone-high-\ud800", "lone-low-\udfff", "paired-🚀-\ud800"];
    const numbers = [0, 1, -1, Number.MAX_SAFE_INTEGER, Number.MIN_SAFE_INTEGER, 0.1, -0.1,
      Number.MIN_VALUE, Number.MAX_VALUE, 9007199254740992];
    let cases = 0;
    for (const marker of strings) {
      const source = sourceFrames(id, ++cases, marker);
      const frame = authority.publish(id, source.publicFrame, source.ownerFrame).frame;
      const wire = encodeBinaryFrame(frame, bctx(id));
      assert.deepStrictEqual(decodeBinaryFrame(wire, bctx(id)), frame);
      const outcome = client.receive(wire);
      assert.strictEqual(outcome.accepted, true);
      assert.strictEqual(authority.acknowledge(id, outcome.ack).accepted, true);
    }
    for (const value of numbers) {
      const source = sourceFrames(id, ++cases, `number-${cases}`);
      source.ownerFrame.state.effectState.timeSlowRemaining = value;
      const frame = authority.publish(id, source.publicFrame, source.ownerFrame).frame;
      const wire = encodeBinaryFrame(frame, bctx(id));
      assert.deepStrictEqual(decodeBinaryFrame(wire, bctx(id)), frame);
      const outcome = client.receive(wire);
      assert.strictEqual(outcome.accepted, true);
      assert.strictEqual(authority.acknowledge(id, outcome.ack).accepted, true);
    }
    let seed = 0x5a17c0de;
    for (let index = 0; index < 500; index += 1) {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
      const value = (seed / 0xffffffff - 0.5) * 1e9;
      const source = sourceFrames(id, ++cases, `property-${index}-🚀`);
      source.ownerFrame.state.effectState.timeSlowRemaining = value;
      const frame = authority.publish(id, source.publicFrame, source.ownerFrame).frame;
      const wire = encodeBinaryFrame(frame, bctx(id));
      assert.deepStrictEqual(decodeBinaryFrame(wire, bctx(id)), frame);
      const outcome = client.receive(wire);
      assert.strictEqual(outcome.accepted, true);
      assert.strictEqual(authority.acknowledge(id, outcome.ack).accepted, true);
    }
    assert.strictEqual(cases, 519);
    const validSource = sourceFrames(id, ++cases, "invalid-number-source");
    const validFrame = authority.publish(id, validSource.publicFrame, validSource.ownerFrame).frame;
    for (const invalid of [-0, NaN, Infinity, -Infinity]) {
      assert.throws(() => encodeBinaryFrame({ ...validFrame, simTime: invalid }, bctx(id)),
        (error) => error?.code === "invalid-number");
    }
  });

  await runner.run("malformed corpus and deterministic byte fuzz fail closed without alternate semantics", () => {
    const { id, authority } = createAuthorityAndClient();
    const source = sourceFrames(id, 1, "fuzz-🚀");
    const frame = authority.publish(id, source.publicFrame, source.ownerFrame).frame;
    const good = encodeBinaryFrame(frame, bctx(id));
    const malformed = [];
    const frameWithPayload = (payload, tag = 0) => {
      const header = Buffer.from(good.subarray(0, HEADER_BYTES));
      header[37] = tag;
      header.writeUInt32BE(payload.length, 38);
      return Buffer.concat([header, payload]);
    };
    const vu = (value) => {
      let current = BigInt(value);
      const bytes = [];
      do { let byte = Number(current & 0x7fn); current >>= 7n; if (current) byte |= 0x80; bytes.push(byte); }
      while (current);
      return Buffer.from(bytes);
    };
    const mutate = (offset, value) => { const copy = Buffer.from(good); copy[offset] = value; return copy; };
    malformed.push(good.subarray(0, HEADER_BYTES - 1));
    malformed.push(Buffer.concat([good, Buffer.from([0])]));
    malformed.push(mutate(0, 0));
    malformed.push(mutate(4, 2));
    malformed.push(mutate(5, good[5] ^ 0xff));
    malformed.push(mutate(37, good[37] ^ 1));
    const shortLength = Buffer.from(good); shortLength.writeUInt32BE(good.length - HEADER_BYTES - 1, 38); malformed.push(shortLength);
    const longLength = Buffer.from(good); longLength.writeUInt32BE(good.length - HEADER_BYTES + 1, 38); malformed.push(longLength);
    const unknownType = Buffer.from(good); unknownType[HEADER_BYTES] = 0xff; malformed.push(unknownType);
    malformed.push(frameWithPayload(Buffer.from([7, 0x81, 0x00]))); // overlong collection varint
    malformed.push(frameWithPayload(Buffer.from([3, 0x80, 0x80, 0x80, 0x80, 0x80, 0x80, 0x80, 0x80])));
    malformed.push(frameWithPayload(Buffer.concat([Buffer.from([7]), vu(16385)])));
    malformed.push(frameWithPayload(Buffer.concat([Buffer.from([6]), vu(8193)])));
    malformed.push(frameWithPayload(Buffer.from([6, 2, 0xc3, 0x28])));
    const nan = Buffer.alloc(9); nan[0] = 5; nan.writeDoubleBE(NaN, 1); malformed.push(frameWithPayload(nan));
    const negativeZero = Buffer.alloc(9); negativeZero[0] = 5; negativeZero.writeDoubleBE(-0, 1);
    malformed.push(frameWithPayload(negativeZero));
    malformed.push(frameWithPayload(Buffer.from([0, 0]))); // exact header length, trailing payload byte
    let deep = Buffer.from([0]);
    for (let depth = 0; depth < 34; depth += 1) deep = Buffer.concat([Buffer.from([7, 1]), deep]);
    malformed.push(frameWithPayload(deep));
    const manyNodes = Buffer.concat([Buffer.from([7, 7]), ...Array.from({ length: 7 }, () =>
      Buffer.concat([Buffer.from([7]), vu(15000), Buffer.alloc(15000, 0)]))]);
    malformed.push(frameWithPayload(manyNodes));
    const truncated = [1, 2, 3, 4, 5, 8, 16, 31, 63].map((count) => good.subarray(0, good.length - count));
    malformed.push(...truncated);
    for (const sample of malformed) assert.throws(() => decodeBinaryFrame(sample, bctx(id)));
    assert.strictEqual(malformed.length, 28);

    let rejected = 0;
    let exact = 0;
    let seed = 0x16b1a2c3;
    for (let index = 0; index < 1000; index += 1) {
      seed = (Math.imul(seed, 1103515245) + 12345) >>> 0;
      const copy = Buffer.from(good);
      const flips = 1 + (seed % 4);
      for (let flip = 0; flip < flips; flip += 1) {
        seed = (Math.imul(seed, 1103515245) + 12345) >>> 0;
        const offset = seed % copy.length;
        copy[offset] ^= 1 << ((seed >>> 8) & 7);
      }
      try {
        const decoded = decodeBinaryFrame(copy, bctx(id));
        assert.deepStrictEqual(decoded, frame, "accepted fuzz mutation changed semantics");
        exact += 1;
      } catch { rejected += 1; }
    }
    assert.strictEqual(rejected + exact, 1000);
    assert(rejected >= 950, `malformed fuzz rejection was unexpectedly low: ${rejected}`);
  });

  await runner.run("text/binary negotiation is explicit and rejects cross-codec state-pair traffic", () => {
    const { id, authority } = createAuthorityAndClient();
    const source = sourceFrames(id, 1);
    const frame = authority.publish(id, source.publicFrame, source.ownerFrame).frame;
    const binary = encodeBinaryFrame(frame, bctx(id));
    const positional = encodeWireFrame(frame, { direction: SERVER_TO_CLIENT, positionalContext: pctx(id) });
    assert.throws(() => parseWireFrame(binary, { direction: SERVER_TO_CLIENT, binary: true }), /not negotiated/);
    assert.throws(() => parseWireFrame(positional, { direction: SERVER_TO_CLIENT,
      positionalContext: pctx(id), requireBinary: true }),
      /must use binary framing/);
    assert.throws(() => parseWireFrame(binary, { direction: SERVER_TO_CLIENT,
      positionalContext: pctx(id) }), /UTF-8|JSON|encoding/);
  });

  await runner.run("binary frame is deterministic", () => {
    const { id, authority } = createAuthorityAndClient();
    const source = sourceFrames(id, 1);
    const frame = authority.publish(id, source.publicFrame, source.ownerFrame).frame;
    const first = encodeBinaryFrame(frame, bctx(id));
    const second = encodeBinaryFrame(frame, bctx(id));
    assert(first.equals(second));
    assert.strictEqual(crypto.createHash("sha256").update(first).digest("hex"),
      crypto.createHash("sha256").update(second).digest("hex"));
  });

  await runner.run("publisher retention is isolated from publication and retransmit buffer mutation", () => {
    const { id, authority } = createAuthorityAndClient();
    const source = sourceFrames(id, 1);
    const published = authority.publish(id, source.publicFrame, source.ownerFrame);
    const expected = Buffer.from(published.encodedWire);
    published.encodedWire[0] ^= 0xff;
    const firstRetransmit = authority.retransmit(id, published.frame.frameId);
    assert(firstRetransmit.encodedWire.equals(expected));
    firstRetransmit.encodedWire[1] ^= 0xff;
    const secondRetransmit = authority.retransmit(id, published.frame.frameId);
    assert(secondRetransmit.encodedWire.equals(expected));
    assert.deepStrictEqual(decodeBinaryFrame(secondRetransmit.encodedWire, bctx(id)), published.frame);
  });

  await runner.run("bound binary sessions reject positional exact publications instead of mixed framing", () => {
    assert.strictEqual(selectedStatePairCodecCapability(BINARY_CAPABILITIES), BINARY_CAPABILITY);
    assert.strictEqual(selectedStatePairCodecCapability(BASE_CAPABILITIES), POSITIONAL_CAPABILITY);
    const exactCapability = (wire) => Buffer.isBuffer(wire) ? BINARY_CAPABILITY : POSITIONAL_CAPABILITY;
    assert.strictEqual(exactCapability(Buffer.from([1])) === selectedStatePairCodecCapability(BINARY_CAPABILITIES), true);
    assert.strictEqual(exactCapability("[]") === selectedStatePairCodecCapability(BINARY_CAPABILITIES), false);
    assert.strictEqual(exactCapability("[]") === selectedStatePairCodecCapability(BASE_CAPABILITIES), true);
    assert.strictEqual(exactCapability(Buffer.from([1])) === selectedStatePairCodecCapability(BASE_CAPABILITIES), false);
  });

  runner.summary();
}

run().catch((error) => {
  console.error(error.stack || error.message);
  process.exit(1);
});
