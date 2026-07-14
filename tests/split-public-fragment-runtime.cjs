#!/usr/bin/env node
"use strict";

const assert = require("assert");
const {
  CAPABILITY,
  MIXED_CAPABILITY,
  RUNTIME_PUBLIC_COMPONENTS_CAPABILITY,
  POSITIONAL_CODEC_CAPABILITY,
  PUBLIC_BODY_CAPABILITY,
  PREPARED_PUBLIC_SOURCE_CAPABILITY,
  SPLIT_PUBLIC_FRAGMENT_CAPABILITY,
  createRuntimeStatePairAuthority,
} = require("../scripts/runtime-state-pair-integration.cjs");
const { createClientDeltaReceiver, MODES } = require("../scripts/client-delta-receiver.cjs");
const { resolveSplitPublication } = require("../scripts/split-public-fragment-authority.cjs");
const { CAPABILITY: COMPRESSION_CODEC_CAPABILITY, PUBLIC_BODY_COMPRESSION_CAPABILITY } =
  require("../scripts/state-pair-compression-codec.cjs");
const { encodeWireFrame, CLIENT_TO_SERVER } = require("../scripts/multiplayer-wire-protocol.cjs");

const MANIFEST_SCHEMA = "lbh-session-replication-manifest-v1";
const MANIFEST_HASH = `sha256:${"a".repeat(64)}`;
const CAPABILITIES = [CAPABILITY, MIXED_CAPABILITY, RUNTIME_PUBLIC_COMPONENTS_CAPABILITY,
  POSITIONAL_CODEC_CAPABILITY, COMPRESSION_CODEC_CAPABILITY, PUBLIC_BODY_CAPABILITY,
  PUBLIC_BODY_COMPRESSION_CAPABILITY, PREPARED_PUBLIC_SOURCE_CAPABILITY,
  SPLIT_PUBLIC_FRAGMENT_CAPABILITY, "static-manifest-v1"].sort();

function deepFreeze(value) {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) deepFreeze(child);
  return Object.freeze(value);
}

function binding(index) {
  return { runId: "match-split-runtime", connectionId: `session-${index}`,
    membershipId: `membership-${index}`, playerId: `player-${index}`, connectionEpoch: 1,
    wireVersion: "lbh-multiplayer-json-v2", capabilities: CAPABILITIES,
    manifestSchema: MANIFEST_SCHEMA, manifestHash: MANIFEST_HASH, authorityIncarnation: 7 };
}

function claims(id) {
  return { membershipId: id.membershipId, playerId: id.playerId, profileId: `profile-${id.playerId}`,
    wireVersion: id.wireVersion, capabilities: id.capabilities, manifestSchema: id.manifestSchema,
    manifestHash: id.manifestHash, authorityIncarnation: id.authorityIncarnation };
}

function publicFrame(beat) {
  return deepFreeze({ type: "publicState", runId: "match-split-runtime", snapshotId: beat,
    tick: beat * 10, simTime: beat, lastEventSeq: beat, fieldRevision: beat,
    overloadMode: "NORMAL", lastInputSeq: 0, lastActionSeq: 0,
    manifestHash: MANIFEST_HASH, full: true,
    state: { session: { status: "running", hostClientId: "ship-0", hostName: "Pilot 0",
      simScaleProfile: "small" },
    players: Array.from({ length: 8 }, (_, index) => ({ clientId: `ship-${index}`,
      wx: index / 10 + beat / 100, wy: index / 20, vx: beat / 100, vy: -beat / 100,
      hullType: "drifter", status: "alive", name: `Pilot ${index}`, isAI: false,
      slingshot: { engaged: false, anchorId: null, orbitDir: 1 } })),
    world: { wells: [], stars: [], wrecks: [], planetoids: [], portals: [], scavengers: [],
      fauna: [], sentries: [], nextPortalWaveIndex: beat },
    inhibitor: { form: 0, wx: 0, wy: 0 } } });
}

function ownerFrame(id, beat) {
  return { type: "ownerState", runId: id.runId, membershipId: id.membershipId,
    playerId: id.playerId, snapshotId: beat, tick: beat * 10, simTime: beat,
    lastEventSeq: beat, fieldRevision: beat, overloadMode: "NORMAL",
    lastInputSeq: beat, lastActionSeq: beat,
    state: { profileId: `private-${id.playerId}`, cargo: [`cargo-${id.playerId}-${beat}`] } };
}

function client(id) {
  return createClientDeltaReceiver({ capabilities: CAPABILITIES, context: {
    matchId: id.runId, sessionId: id.connectionId, authorityIncarnation: id.authorityIncarnation,
    recipientId: id.membershipId, recipientIncarnation: id.connectionEpoch,
    manifestSchema: id.manifestSchema, manifestHash: id.manifestHash } });
}

function main() {
  let assertions = 0;
  const ids = Array.from({ length: 8 }, (_, index) => binding(index));
  const clients = ids.map(client);
  const authority = createRuntimeStatePairAuthority({ matchId: "match-split-runtime",
    authorityIncarnation: 7, ballparkEpoch: 3, manifestSchema: MANIFEST_SCHEMA,
    manifestHash: MANIFEST_HASH, publisherOptions: { maxRecipients: 8 } });
  ids.forEach((id) => authority.admit(id, claims(id)));

  const firstPublic = publicFrame(1);
  const firstProof = authority.preparePublicSource(firstPublic,
    ids.map((id, ordinal) => ({ binding: id, ordinal })));
  const first = ids.map((id, ordinal) => authority.publish(id, firstPublic, ownerFrame(id, 1), {
    preparedPublicSource: firstProof, preparedRecipientOrdinal: ordinal }));
  const firstMaterial = first.map(resolveSplitPublication);
  assert.strictEqual(new Set(firstMaterial.map((entry) => entry.fragmentWire)).size, 1);
  assertions += 1;
  for (let index = 0; index < ids.length; index += 1) {
    const material = firstMaterial[index];
    const waiting = index % 2 === 0
      ? clients[index].receive(material.fragmentWire)
      : clients[index].receive(material.overlayWire);
    assert(waiting.accepted && waiting.published === false);
    const accepted = index % 2 === 0
      ? clients[index].receive(material.overlayWire)
      : clients[index].receive(material.fragmentWire);
    assert(accepted.accepted && accepted.published, accepted.reason);
    assert.strictEqual(accepted.state.owner.entities[0].components.ownerState.value.profileId,
      `private-player-${index}`);
    assert.strictEqual(accepted.state.legacyPublicState.players.length, 8);
    assert.doesNotThrow(() => encodeWireFrame(accepted.ack, { direction: CLIENT_TO_SERVER }));
    assert(authority.acknowledge(ids[index], accepted.ack).accepted);
    assert.strictEqual(clients[index].diagnostics().mode, MODES.STATE_PAIR_SPLIT_PUBLIC_FRAGMENT);
    assertions += 7;
  }

  const secondPublic = publicFrame(2);
  const secondProof = authority.preparePublicSource(secondPublic,
    ids.map((id, ordinal) => ({ binding: id, ordinal })));
  const second = ids.map((id, ordinal) => authority.publish(id, secondPublic, ownerFrame(id, 2), {
    preparedPublicSource: secondProof, preparedRecipientOrdinal: ordinal }));
  const secondMaterial = second.map(resolveSplitPublication);
  assert.strictEqual(new Set(secondMaterial.map((entry) => entry.fragmentWire)).size, 1);
  assert(second.every((publication) => publication.projectionKind === "public-delta+owner-keyframe"));
  assertions += 2;
  for (let index = 0; index < ids.length; index += 1) {
    assert(clients[index].receive(secondMaterial[index].fragmentWire).accepted);
    const accepted = clients[index].receive(secondMaterial[index].overlayWire);
    assert(accepted.accepted && accepted.published, accepted.reason);
    assert.strictEqual(accepted.state.publicBodyRevision, 2);
    assert(authority.acknowledge(ids[index], accepted.ack).accepted);
    assertions += 4;
  }
  const diagnostics = authority.diagnostics().splitPublicFragment.authority;
  assert.deepStrictEqual({ fragments: diagnostics.fragmentBuilds, packs: diagnostics.fragmentPacks,
    compressions: diagnostics.fragmentCompressions, hashes: diagnostics.fragmentHashes,
    overlays: diagnostics.overlayBuilds, traversals: diagnostics.perRecipientPublicTraversals,
    compositions: diagnostics.perRecipientPublicCompositions },
  { fragments: 2, packs: 2, compressions: 2, hashes: 2, overlays: 16, traversals: 0, compositions: 0 });
  assert.strictEqual(diagnostics.pendingPairs, 0);
  assertions += 2;

  console.log(JSON.stringify({ schema: "lbh-split-public-fragment-runtime-proof-v1",
    assertions, recipients: 8, authorityBeats: 2, fragmentBuilds: 2,
    fragmentObjectIdentitiesPerBeat: 1, atomicClientPublishes: 16, mismatches: 0 }, null, 2));
}

try { main(); } catch (error) {
  console.error(error.stack || error.message);
  process.exitCode = 1;
}
