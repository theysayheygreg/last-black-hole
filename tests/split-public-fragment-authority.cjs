#!/usr/bin/env node
"use strict";

const assert = require("assert");
const { normalizeView } = require("../scripts/canonical-structural-delta.cjs");
const { createSharedPublicBodyAuthority } = require("../scripts/shared-public-body-authority.cjs");
const {
  createSplitPublicFragmentAuthority,
  resolveSplitPublication,
} = require("../scripts/split-public-fragment-authority.cjs");
const { decodePublicFragment, decodeOwnerOverlay } = require("../scripts/split-public-fragment-codec.cjs");

const MANIFEST_HASH = `sha256:${"a".repeat(64)}`;
const FIXED = Object.freeze({ matchId: "match-split-authority", authorityIncarnation: 9,
  ballparkEpoch: 4, manifestHash: MANIFEST_HASH });

function identity(index, incarnation = 1) {
  return { matchId: FIXED.matchId, sessionId: `session-${index}`,
    authorityIncarnation: FIXED.authorityIncarnation, recipientId: `membership-${index}`,
    recipientIncarnation: incarnation };
}

function bodySource(beat) {
  return { sourceKey: `snapshot-${beat}`, world: { publicFacts: { status: "running", beat } },
    entities: Array.from({ length: 16 }, (_, index) => ({
      category: index < 8 ? "player" : "wreck", sourceId: `entity-${index}`,
      incarnation: 1, lifecycleRevision: beat, components: {
        runtimeMotion: { revision: beat, value: { wx: index + beat / 10, wy: index / 10,
          vx: beat, vy: -beat } },
        runtimeOrder: { revision: 1, value: { index } },
      },
    })) };
}

function ownerView(id, beat) {
  return normalizeView({ schema: "lbh-canonical-projection-v1", lane: "owner",
    runId: id.matchId, authorityEpoch: id.authorityIncarnation,
    connectionEpoch: id.recipientIncarnation, ballparkEpoch: FIXED.ballparkEpoch,
    manifestHash: MANIFEST_HASH, statePairId: `owner-${beat}-${id.recipientId}`,
    snapshotId: `snapshot-${beat}`, tick: beat * 10, simTime: beat,
    eventWatermark: beat, fieldRevision: beat, overloadMode: "NORMAL", world: {},
    entities: [{ category: "owner", sourceId: id.recipientId, incarnation: 1,
      lifecycleRevision: beat, components: {
        ownerState: { revision: beat, value: { deltaV: 100 - beat, cargo: [`private-${id.recipientId}`] } },
      } }],
  });
}

function metadata(beat) {
  return { snapshotId: `snapshot-${beat}`, tick: beat * 10, simTime: beat,
    eventWatermark: beat, fieldRevision: beat, overloadMode: "NORMAL" };
}

function ack(frame) {
  return { ackSchema: "lbh-authority-state-pair-mixed-ack-v1",
    pairSchema: "lbh-authority-state-pair-mixed-v1",
    matchId: frame.matchId, sessionId: frame.sessionId,
    authorityIncarnation: frame.authorityIncarnation, recipientId: frame.recipientId,
    recipientIncarnation: frame.recipientIncarnation, frameId: frame.frameId,
    statePairId: frame.statePairId, snapshotId: frame.snapshotId,
    publicHash: frame.bodyHash, ownerHash: frame.owner.resultHash,
    tick: frame.tick, simTime: frame.simTime, eventWatermark: frame.eventWatermark,
    fieldRevision: frame.fieldRevision, overloadMode: frame.overloadMode,
    ballparkEpoch: frame.ballparkEpoch, manifestHash: frame.manifestHash,
    publicKind: null, ownerKind: "keyframe", publicBaseSnapshotId: null,
    ownerBaseSnapshotId: null };
}

function main() {
  let assertions = 0;
  const bodies = createSharedPublicBodyAuthority({ ...FIXED,
    publisherOptions: { maxRecipients: 16, maxPendingPairsPerRecipient: 12 } });
  const split = createSplitPublicFragmentAuthority(FIXED);
  const ids = Array.from({ length: 8 }, (_, index) => identity(index));

  const bodyOne = bodies.prepareBody(bodySource(1));
  const fragmentOne = split.prepareFragment({ body: bodyOne, ...metadata(1) });
  const publications = ids.map((id) => split.publish({ identity: id, fragment: fragmentOne,
    ownerView: ownerView(id, 1) }));
  const material = publications.map(resolveSplitPublication);
  assert(material.every(Boolean));
  assert.strictEqual(new Set(material.map((entry) => entry.fragmentWire)).size, 1,
    "All eight recipients must retain the exact same fragment Buffer object");
  assert.strictEqual(new Set(material.map((entry) => entry.overlayWire)).size, 8,
    "Owner overlays remain recipient-local");
  assert(publications.every((publication) => publication.fragmentWire === undefined
    && publication.overlayWire === undefined), "Raw replication bytes must not escape on public publications");
  assert.strictEqual(decodePublicFragment(material[0].fragmentWire, FIXED).value.public.kind, "keyframe");
  for (let index = 0; index < ids.length; index += 1) {
    const overlay = decodeOwnerOverlay(material[index].overlayWire, { ...ids[index], manifestHash: MANIFEST_HASH }).value;
    assert.strictEqual(overlay.owner.view.entities[0].components.ownerState.value.cargo[0],
      `private-membership-${index}`);
    const proof = ack(publications[index].frame);
    proof.publicKind = fragmentOne.fragment.public.kind;
    assert(split.acknowledge(ids[index], proof).accepted);
  }
  const firstDiagnostics = split.diagnostics();
  assert.strictEqual(firstDiagnostics.fragmentBuilds, 1);
  assert.strictEqual(firstDiagnostics.fragmentPacks, 1);
  assert.strictEqual(firstDiagnostics.fragmentCompressions, 1);
  assert.strictEqual(firstDiagnostics.fragmentHashes, 1);
  assert.strictEqual(firstDiagnostics.overlayBuilds, 8);
  assert.strictEqual(firstDiagnostics.perRecipientPublicTraversals, 0);
  assert.strictEqual(firstDiagnostics.perRecipientPublicCompositions, 0);
  assertions += 30;

  const bodyTwo = bodies.prepareBody(bodySource(2));
  const fragmentTwo = split.prepareFragment({ body: bodyTwo, ...metadata(2) });
  const second = ids.map((id) => split.publish({ identity: id, fragment: fragmentTwo,
    ownerView: ownerView(id, 2) }));
  assert.strictEqual(fragmentTwo.fragment.public.kind, "delta");
  assert.strictEqual(new Set(second.map((publication) =>
    resolveSplitPublication(publication).fragmentWire)).size, 1);
  assert.strictEqual(split.retransmit(ids[0], second[0].frame.frameId), second[0]);
  assert.strictEqual(resolveSplitPublication(split.retransmit(ids[0], second[0].frame.frameId)).fragmentWire,
    resolveSplitPublication(second[0]).fragmentWire);
  const badAck = { ...ack(second[0].frame), publicHash: `sha256:${"0".repeat(64)}`,
    publicKind: fragmentTwo.fragment.public.kind,
    publicBaseSnapshotId: fragmentTwo.fragment.public.baseBodyId };
  assert.strictEqual(split.acknowledge(ids[0], badAck).reason, "lineage-mismatch");
  split.rebase(ids[0]);
  const bodyThree = bodies.prepareBody(bodySource(3));
  const fragmentThree = split.prepareFragment({ body: bodyThree, ...metadata(3) });
  assert.strictEqual(fragmentThree.fragment.public.kind, "keyframe",
    "One recovery request must fail closed to a global keyframe on the next authority beat");
  assertions += 6;

  split.disconnect(ids[0]);
  assert.strictEqual(split.diagnostics().recipients, 7);
  assert.throws(() => split.publish({ identity: { ...ids[1], matchId: "other-match" },
    fragment: fragmentThree, ownerView: ownerView(ids[1], 3) }),
  (error) => error.code === "identity-mismatch");
  ids.slice(1).forEach((id) => split.disconnect(id));
  assert.strictEqual(split.diagnostics().recipients, 0);
  assert.strictEqual(split.diagnostics().pendingPairs, 0);
  assertions += 4;

  const eviction = createSplitPublicFragmentAuthority({ ...FIXED, limits: { maxFragments: 1 } });
  const evictionFirst = eviction.prepareFragment({ body: bodyOne, ...metadata(1) });
  eviction.publish({ identity: ids[0], fragment: evictionFirst, ownerView: ownerView(ids[0], 1) });
  eviction.prepareFragment({ body: bodyTwo, ...metadata(2) });
  assert.strictEqual(eviction.diagnostics().fragments, 1);
  assert.strictEqual(eviction.diagnostics().pendingPairs, 0,
    "Recipient pending state must not pin an evicted global fragment");
  assert.strictEqual(eviction.diagnostics().forceGlobalKeyframe, true);
  assertions += 3;

  console.log(JSON.stringify({ schema: "lbh-split-public-fragment-authority-proof-v1",
    assertions, synchronizedRecipients: 8, fragmentObjectIdentities: 1,
    perRecipientPublicTraversals: 0, perRecipientPublicCompositions: 0, mismatches: 0 }, null, 2));
}

try { main(); } catch (error) {
  console.error(error.stack || error.message);
  process.exitCode = 1;
}
