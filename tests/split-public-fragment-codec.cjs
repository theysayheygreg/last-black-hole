#!/usr/bin/env node
"use strict";

const assert = require("assert");
const {
  CAPABILITY,
  FRAGMENT_SCHEMA,
  OVERLAY_SCHEMA,
  MANIFEST_HASH,
  MAX_FRAGMENT_BYTES,
  MAX_OVERLAY_BYTES,
  assertFragment,
  assertOverlay,
  encodePublicFragment,
  decodePublicFragment,
  encodeOwnerOverlay,
  decodeOwnerOverlay,
  splitWireKind,
} = require("../scripts/split-public-fragment-codec.cjs");

const BINDING = Object.freeze({
  matchId: "match-split-8",
  authorityIncarnation: 3,
  ballparkEpoch: 2,
  manifestHash: `sha256:${"a".repeat(64)}`,
});

function publicBody() {
  return {
    schema: "lbh-public-body-v1",
    ...BINDING,
    bodyId: "body-41",
    bodyRevision: 41,
    world: { publicFacts: { status: "running", entropy: 0.25 } },
    entities: [{
      publicEntityId: "player:ship-1:1",
      category: "player",
      sourceId: "ship-1",
      incarnation: 1,
      lifecycleRevision: 4,
      components: {
        runtimeMotion: { revision: 4, value: { wx: 0.25, wy: 0.75, vx: 1, vy: -2 } },
      },
    }],
  };
}

function fragment() {
  const body = publicBody();
  return {
    type: "publicFragment",
    schema: FRAGMENT_SCHEMA,
    ...BINDING,
    fragmentId: "fragment-41",
    fragmentRevision: 41,
    snapshotId: "snapshot-41",
    tick: 410,
    simTime: 41,
    eventWatermark: 88,
    fieldRevision: 23,
    overloadMode: "NORMAL",
    bodyId: body.bodyId,
    bodyRevision: body.bodyRevision,
    bodyHash: `sha256:${"b".repeat(64)}`,
    public: {
      kind: "keyframe",
      schema: "lbh-public-body-v1",
      bodyId: body.bodyId,
      bodyRevision: body.bodyRevision,
      resultHash: `sha256:${"b".repeat(64)}`,
      body,
    },
  };
}

function overlay() {
  return {
    type: "ownerOverlay",
    schema: OVERLAY_SCHEMA,
    matchId: BINDING.matchId,
    sessionId: "session-1",
    authorityIncarnation: BINDING.authorityIncarnation,
    recipientId: "membership-1",
    recipientIncarnation: 5,
    frameId: 7,
    statePairId: "pair-41-1",
    snapshotId: "snapshot-41",
    tick: 410,
    simTime: 41,
    eventWatermark: 88,
    fieldRevision: 23,
    overloadMode: "NORMAL",
    ballparkEpoch: BINDING.ballparkEpoch,
    manifestHash: BINDING.manifestHash,
    fragmentId: "fragment-41",
    fragmentRevision: 41,
    fragmentHash: `sha256:${"c".repeat(64)}`,
    bodyId: "body-41",
    bodyHash: `sha256:${"b".repeat(64)}`,
    owner: { kind: "keyframe", resultHash: `sha256:${"d".repeat(64)}`, view: {
      schema: "lbh-canonical-projection-v1", lane: "owner", privateProgress: 12,
    } },
  };
}

function main() {
  let assertions = 0;
  assert.strictEqual(CAPABILITY, "state-pair-split-public-fragment-v1");
  assert(/^sha256:[a-f0-9]{64}$/.test(MANIFEST_HASH));
  assert.strictEqual(MAX_FRAGMENT_BYTES, 256 * 1024);
  assert.strictEqual(MAX_OVERLAY_BYTES, 256 * 1024);
  assertions += 4;

  const encodedFragment = encodePublicFragment(fragment());
  assert.strictEqual(splitWireKind(encodedFragment.wire), "fragment");
  assert.strictEqual(decodePublicFragment(encodedFragment.wire, BINDING).value.fragmentId, "fragment-41");
  assert.strictEqual(encodePublicFragment(fragment()).wire.equals(encodedFragment.wire), true,
    "The same public semantic must produce byte-identical immutable fragment material");
  assertions += 3;

  const encodedOverlay = encodeOwnerOverlay(overlay());
  assert.strictEqual(splitWireKind(encodedOverlay.wire), "overlay");
  assert.strictEqual(decodeOwnerOverlay(encodedOverlay.wire, {
    matchId: BINDING.matchId,
    sessionId: "session-1",
    authorityIncarnation: BINDING.authorityIncarnation,
    recipientId: "membership-1",
    recipientIncarnation: 5,
    manifestHash: BINDING.manifestHash,
  }).value.owner.view.privateProgress, 12);
  assertions += 2;

  const tampered = Buffer.from(encodedFragment.wire);
  tampered[tampered.length - 1] ^= 1;
  assert.throws(() => decodePublicFragment(tampered, BINDING),
    (error) => ["invalid-compression", "integrity-failure"].includes(error.code));
  assert.throws(() => decodePublicFragment(encodedFragment.wire, { ...BINDING, matchId: "other" }),
    (error) => error.code === "identity-mismatch");
  assertions += 2;

  assert.throws(() => assertFragment({ ...fragment(), recipientId: "private-membership" }),
    (error) => error.code === "invalid-layout");
  const leaked = fragment();
  leaked.public.body.world.publicFacts.sessionId = "secret";
  assert.throws(() => encodePublicFragment(leaked), (error) => error.code === "privacy-boundary");
  assert.throws(() => assertOverlay({ ...overlay(), public: {} }),
    (error) => error.code === "invalid-layout");
  const leakedDelta = fragment();
  leakedDelta.public = { kind: "delta", schema: "lbh-public-body-delta-v1",
    baseBodyId: "body-40", baseBodyRevision: 40, baseHash: `sha256:${"1".repeat(64)}`,
    bodyId: leakedDelta.bodyId, bodyRevision: leakedDelta.bodyRevision,
    resultHash: leakedDelta.bodyHash, structuralBaseHash: `sha256:${"2".repeat(64)}`,
    structuralResultHash: `sha256:${"3".repeat(64)}`, delta: {
      schema: "lbh-canonical-structural-delta-v1", lane: "public", runId: BINDING.matchId,
      authorityEpoch: BINDING.authorityIncarnation, connectionEpoch: 1,
      ballparkEpoch: BINDING.ballparkEpoch, manifestHash: BINDING.manifestHash,
      statePairId: "body-41", baseSnapshotId: "body-40", snapshotId: "body-41",
      baseHash: `sha256:${"2".repeat(64)}`, resultHash: `sha256:${"3".repeat(64)}`,
      rootOps: [{ op: "set", path: ["world"], value: { sessionId: "private" } }],
      creates: [], updates: [], despawns: [] } };
  assert.throws(() => encodePublicFragment(leakedDelta), (error) => error.code === "privacy-boundary");
  assertions += 4;

  console.log(JSON.stringify({ schema: "lbh-split-public-fragment-codec-proof-v1",
    assertions, capability: CAPABILITY, manifestHash: MANIFEST_HASH, mismatches: 0 }, null, 2));
}

try { main(); } catch (error) {
  console.error(error.stack || error.message);
  process.exitCode = 1;
}
