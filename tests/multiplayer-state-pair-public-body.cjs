#!/usr/bin/env node
"use strict";

const assert = require("assert");
const { normalizeView } = require("../scripts/canonical-structural-delta.cjs");
const { createSharedPublicBodyAuthority } = require("../scripts/shared-public-body-authority.cjs");
const {
  PAIR_SCHEMA,
  decodePublicBodyFrame,
  scanPublicBodyPrivacy,
} = require("../scripts/state-pair-public-body-codec.cjs");

const MANIFEST_HASH = `sha256:${"a".repeat(64)}`;

function identity(index, incarnation = 1) {
  return { matchId: "match-s23", sessionId: `connection-${index}`,
    authorityIncarnation: 7, recipientId: `membership-${index}`, recipientIncarnation: incarnation };
}

function bodySource(beat) {
  return {
    sourceKey: `snapshot-${beat}`,
    world: { publicFacts: { status: "running", beat } },
    entities: Array.from({ length: 16 }, (_, index) => ({
      category: index < 8 ? "player" : "wreck",
      sourceId: `entity-${index}`,
      incarnation: 1,
      lifecycleRevision: beat,
      components: {
        runtimeMotion: { revision: beat, value: { wx: index + beat / 10, wy: index / 10, vx: beat, vy: -beat } },
        runtimeIdentity: { revision: 1, value: { sourceId: `entity-${index}`, name: `Public ${index}` } },
        runtimeOrder: { revision: 1, value: { index } },
      },
    })),
  };
}

function ownerView(id, beat) {
  return normalizeView({ schema: "lbh-canonical-projection-v1", lane: "owner",
    runId: id.matchId, authorityEpoch: id.authorityIncarnation,
    connectionEpoch: id.recipientIncarnation, ballparkEpoch: 3,
    manifestHash: MANIFEST_HASH, statePairId: `pair-${beat}-${id.recipientIncarnation}`,
    snapshotId: `snapshot-${beat}`, tick: beat, simTime: beat / 10,
    eventWatermark: beat, fieldRevision: beat, overloadMode: "NORMAL", world: {},
    entities: [{ category: "owner", sourceId: id.recipientId, incarnation: 1,
      lifecycleRevision: beat, components: {
        ownerState: { revision: beat, value: { deltaV: 90 - beat, profileId: `private-${id.recipientId}` } },
        transient: { revision: beat, value: { lastInputSeq: beat, lastActionSeq: beat } },
      } }],
  });
}

function ackFor(frame) {
  return { type: "ack", ackKind: "statePair", ackSchema: "lbh-authority-state-pair-mixed-ack-v1",
    matchId: frame.matchId, sessionId: frame.sessionId, authorityIncarnation: frame.authorityIncarnation,
    recipientId: frame.recipientId, recipientIncarnation: frame.recipientIncarnation,
    frameId: frame.frameId, statePairId: frame.statePairId, snapshotId: frame.snapshotId,
    publicHash: frame.bodyHash, ownerHash: frame.owner.resultHash,
    pairSchema: "lbh-authority-state-pair-mixed-v1", tick: frame.tick, simTime: frame.simTime,
    eventWatermark: frame.eventWatermark, fieldRevision: frame.fieldRevision,
    overloadMode: frame.overloadMode, ballparkEpoch: frame.ballparkEpoch,
    manifestHash: frame.manifestHash, publicKind: frame.public.kind, ownerKind: frame.owner.kind,
    publicBaseSnapshotId: frame.public.baseBodyId || null,
    ownerBaseSnapshotId: frame.owner.baseSnapshotId || null };
}

function createAuthority(limits = {}) {
  return createSharedPublicBodyAuthority({ matchId: "match-s23", authorityIncarnation: 7,
    ballparkEpoch: 3, manifestHash: MANIFEST_HASH, limits,
    publisherOptions: { maxRecipients: 16, maxPendingPairsPerRecipient: 12 } });
}

async function main() {
  let assertions = 0;
  {
    const authority = createAuthority();
    const ids = Array.from({ length: 8 }, (_, index) => identity(index));
    const firstBody = authority.prepareBody(bodySource(1));
    const first = ids.map((id) => authority.publish({ identity: id, body: firstBody, ownerView: ownerView(id, 1) }));
    assert(first.every((publication) => publication.frame.pairSchema === PAIR_SCHEMA
      && publication.frame.public.kind === "keyframe"));
    assert.strictEqual(new Set(first.map((publication) => publication.frame.public)).size, 1,
      "Synchronized keyframes must share one immutable public payload object");
    for (let index = 0; index < ids.length; index += 1) {
      assert(authority.acknowledge(ids[index], ackFor(first[index].frame)).accepted);
    }
    const secondBody = authority.prepareBody(bodySource(2));
    const second = ids.map((id) => authority.publish({ identity: id, body: secondBody, ownerView: ownerView(id, 2) }));
    assert(second.every((publication) => publication.frame.public.kind === "delta"));
    assert.strictEqual(new Set(second.map((publication) => publication.frame.public)).size, 1,
      "One exact base cohort must reuse one immutable delta object");
    const diagnostics = authority.diagnostics();
    assert.strictEqual(diagnostics.bodyBuilds, 2);
    assert.strictEqual(diagnostics.bodyHashes, 2);
    assert.strictEqual(diagnostics.cohortBuilds, 1);
    assert.strictEqual(diagnostics.cohortHits, 7);
    assert.strictEqual(diagnostics.cohortMisses, 1);
    assert.strictEqual(diagnostics.activeTargetCohorts, 1);
    const decoded = decodePublicBodyFrame(second[0].encodedWire, { ...ids[0], manifestHash: MANIFEST_HASH });
    assert.strictEqual(decoded.bodyHash, secondBody.bodyHash);
    assert.strictEqual(decoded.public.baseBodyId, firstBody.body.bodyId);
    assert.strictEqual(authority.retransmit(ids[0], second[0].frame.frameId).encodedDigest,
      second[0].encodedDigest, "Retransmit must retain exact source bytes/digest");
    assertions += 16;
  }

  {
    const authority = createAuthority();
    const ids = [identity(0), identity(1), identity(2), identity(3)];
    const one = authority.prepareBody(bodySource(1));
    const p1 = ids.map((id) => authority.publish({ identity: id, body: one, ownerView: ownerView(id, 1) }));
    p1.forEach((publication, index) => assert(authority.acknowledge(ids[index], ackFor(publication.frame)).accepted));
    const two = authority.prepareBody(bodySource(2));
    const p2 = ids.map((id) => authority.publish({ identity: id, body: two, ownerView: ownerView(id, 2) }));
    for (let index = 1; index < ids.length; index += 1) {
      assert(authority.acknowledge(ids[index], ackFor(p2[index].frame)).accepted);
    }
    const three = authority.prepareBody(bodySource(3));
    const p3 = ids.map((id) => authority.publish({ identity: id, body: three, ownerView: ownerView(id, 3) }));
    assert.strictEqual(p3[0].frame.public.baseBodyId, one.body.bodyId);
    assert(p3.slice(1).every((publication) => publication.frame.public.baseBodyId === two.body.bodyId));
    assert.strictEqual(authority.diagnostics().activeTargetCohorts, 2);
    assertions += 8;
  }

  {
    const authority = createAuthority({ maxBodies: 2, maxBodyBytes: 8 * 1024 * 1024 });
    const id = identity(0);
    const firstBody = authority.prepareBody(bodySource(1));
    const first = authority.publish({ identity: id, body: firstBody, ownerView: ownerView(id, 1) });
    assert(authority.acknowledge(id, ackFor(first.frame)).accepted);
    authority.prepareBody(bodySource(2));
    const thirdBody = authority.prepareBody(bodySource(3));
    const third = authority.publish({ identity: id, body: thirdBody, ownerView: ownerView(id, 3) });
    assert.strictEqual(third.frame.public.kind, "keyframe");
    assert.strictEqual(authority.diagnostics().bodyEvictions, 1);
    assert(authority.diagnostics().bodies <= 2);
    assertions += 4;
  }

  {
    assert.throws(() => scanPublicBodyPrivacy({ schema: "lbh-public-body-v1",
      membershipId: "secret-membership" }), (error) => error.code === "privacy-boundary");
    const authority = createAuthority();
    const body = authority.prepareBody(bodySource(1));
    assert.throws(() => authority.publish({ identity: { ...identity(0), matchId: "other-match" },
      body, ownerView: ownerView(identity(0), 1) }), (error) => error.code === "identity-mismatch");
    assert.throws(() => authority.prepareBody({ ...bodySource(1), world: { changed: true } }),
      (error) => error.code === "source-reuse");
    assertions += 3;
  }

  console.log(JSON.stringify({ schema: "lbh-s23-public-body-proof-v1", assertions,
    synchronizedRecipients: 8, divergentBaseRecipients: 4, mismatches: 0 }, null, 2));
}

main().catch((error) => {
  console.error(error.stack || error.message);
  process.exitCode = 1;
});
