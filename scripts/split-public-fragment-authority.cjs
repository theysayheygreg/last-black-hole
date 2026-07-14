"use strict";

const crypto = require("crypto");
const { canonicalJson, canonicalJsonBytes } = require("./session-replication-manifest.cjs");
const { normalizeView, projectionHash, createStructuralDelta } = require("./canonical-structural-delta.cjs");
const { BODY_SCHEMA, BODY_DELTA_SCHEMA } = require("./state-pair-public-body-codec.cjs");
const {
  CAPABILITY,
  FRAGMENT_SCHEMA,
  OVERLAY_SCHEMA,
  encodePublicFragment,
  encodeOwnerOverlay,
} = require("./split-public-fragment-codec.cjs");

const DEFAULTS = Object.freeze({
  maxFragments: 16,
  maxFragmentBytes: 8 * 1024 * 1024,
  maxPendingPairsPerRecipient: 12,
  maxRetiredAckProofsPerRecipient: 256,
  maxRetainedOverlayBytesPerRecipient: 2 * 1024 * 1024,
});
const publicationMaterial = new WeakMap();

class SplitPublicFragmentAuthorityError extends Error {
  constructor(code, message) {
    super(message);
    this.name = "SplitPublicFragmentAuthorityError";
    this.code = code;
  }
}

function fail(code, message) {
  throw new SplitPublicFragmentAuthorityError(code, message);
}

function positiveInteger(value, fallback, label) {
  const result = value === undefined ? fallback : Number(value);
  if (!Number.isSafeInteger(result) || result < 1) throw new RangeError(`${label} must be a positive integer`);
  return result;
}

function requiredString(value, label) {
  if (typeof value !== "string" || !value || value.trim() !== value || value !== value.normalize("NFC")) {
    fail("invalid-identity", `${label} is invalid`);
  }
  return value;
}

function deepFreeze(value) {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) deepFreeze(child);
  return Object.freeze(value);
}

function identityKey(identity) {
  return canonicalJson([identity.matchId, identity.sessionId, identity.authorityIncarnation,
    identity.recipientId, identity.recipientIncarnation]);
}

function exactMetadata(left, right) {
  return ["snapshotId", "tick", "simTime", "eventWatermark", "fieldRevision", "overloadMode"]
    .every((key) => left[key] === right[key]);
}

function digestPair(fragmentDigest, overlayDigest) {
  return `sha256:${crypto.createHash("sha256").update(fragmentDigest).update("\0")
    .update(overlayDigest).digest("hex")}`;
}

function resolveSplitPublication(publication) {
  const material = publicationMaterial.get(publication);
  if (!material) return null;
  return Object.freeze({ fragmentWire: material.fragmentWire, overlayWire: material.overlayWire,
    fragmentDigest: material.fragmentDigest, overlayDigest: material.overlayDigest });
}

function isSplitPublication(publication) {
  return publicationMaterial.has(publication);
}

function createSplitPublicFragmentAuthority({ matchId, authorityIncarnation, ballparkEpoch,
  manifestHash, limits: rawLimits = {} } = {}) {
  // One instance belongs to one live match/group. A fleet scales by running
  // many isolated instances; this is never a global gameplay authority.
  const fixed = Object.freeze({
    matchId: requiredString(matchId, "matchId"),
    authorityIncarnation: positiveInteger(authorityIncarnation, undefined, "authorityIncarnation"),
    ballparkEpoch: positiveInteger(ballparkEpoch, undefined, "ballparkEpoch"),
    manifestHash: requiredString(manifestHash, "manifestHash"),
  });
  const limits = Object.freeze(Object.fromEntries(Object.entries(DEFAULTS).map(([key, fallback]) =>
    [key, positiveInteger(rawLimits[key], fallback, key)])));
  const fragments = new Map();
  const recipients = new Map();
  let latest = null;
  let nextFragmentRevision = 1;
  let fragmentBytes = 0;
  let forceGlobalKeyframe = true;
  const counters = {
    fragmentBuilds: 0, fragmentPacks: 0, fragmentHashes: 0, fragmentCompressions: 0,
    fragmentKeyframes: 0, fragmentDeltas: 0, fragmentCacheHits: 0, fragmentEvictions: 0,
    overlayBuilds: 0, overlayHashes: 0, overlayCompressions: 0, publications: 0,
    acknowledgements: 0, ackRejected: 0, retransmits: 0, recoveryResets: 0, disconnects: 0,
    perRecipientPublicTraversals: 0, perRecipientPublicCompositions: 0,
  };

  function assertIdentity(identity) {
    if (!identity || typeof identity !== "object" || identity.matchId !== fixed.matchId
        || identity.authorityIncarnation !== fixed.authorityIncarnation) {
      fail("identity-mismatch", "recipient identity is outside the split-fragment authority");
    }
    requiredString(identity.sessionId, "sessionId");
    requiredString(identity.recipientId, "recipientId");
    positiveInteger(identity.recipientIncarnation, undefined, "recipientIncarnation");
    return identity;
  }

  function stateFor(identity, create = true) {
    const key = identityKey(identity);
    let state = recipients.get(key);
    if (!state && create) {
      state = { identity: Object.freeze({ ...identity }), nextFrameId: 1,
        pending: new Map(), retired: new Map(), retainedOverlayBytes: 0 };
      recipients.set(key, state);
      // A newly admitted client may not possess the immediately prior global
      // fragment. The next authority beat becomes a match-global keyframe.
      if (latest?.fragment.public.kind === "delta") forceGlobalKeyframe = true;
    }
    return state;
  }

  function evictFragments() {
    while (fragments.size > limits.maxFragments || fragmentBytes > limits.maxFragmentBytes) {
      const oldestId = fragments.keys().next().value;
      const record = fragments.get(oldestId);
      if (record === latest && fragments.size === 1) {
        fail("fragment-too-large", "one public fragment exceeds the match history byte cap");
      }
      fragments.delete(oldestId);
      fragmentBytes -= record.bytes;
      counters.fragmentEvictions += 1;
      if (latest?.baseFragmentId === oldestId) forceGlobalKeyframe = true;
    }
  }

  function publicPayload(bodyRecord) {
    if (!forceGlobalKeyframe && latest && fragments.has(latest.fragment.fragmentId)) {
      try {
        const built = createStructuralDelta(latest.body.internalView, bodyRecord.internalView,
          { expectedBaseHash: latest.body.structuralHash });
        return deepFreeze({ kind: "delta", schema: BODY_DELTA_SCHEMA,
          baseBodyId: latest.body.body.bodyId,
          baseBodyRevision: latest.body.body.bodyRevision,
          baseHash: latest.body.bodyHash,
          bodyId: bodyRecord.body.bodyId,
          bodyRevision: bodyRecord.body.bodyRevision,
          resultHash: bodyRecord.bodyHash,
          structuralBaseHash: latest.body.structuralHash,
          structuralResultHash: bodyRecord.structuralHash,
          delta: built.delta });
      } catch {
        // Revision-only changes are not representable by the structural codec.
        // A complete lossless public keyframe is the bounded exact fallback.
      }
    }
    return deepFreeze({ kind: "keyframe", schema: BODY_SCHEMA,
      bodyId: bodyRecord.body.bodyId,
      bodyRevision: bodyRecord.body.bodyRevision,
      resultHash: bodyRecord.bodyHash,
      body: bodyRecord.body });
  }

  function prepareFragment({ body, snapshotId, tick, simTime, eventWatermark,
    fieldRevision, overloadMode }) {
    if (!body?.body || typeof body.bodyHash !== "string" || !body.internalView) {
      fail("unknown-body", "split fragment requires a prepared public-body record");
    }
    const metadata = { snapshotId: requiredString(snapshotId, "snapshotId"),
      tick, simTime, eventWatermark, fieldRevision, overloadMode: requiredString(overloadMode, "overloadMode") };
    if (!Number.isSafeInteger(tick) || tick < 0 || !Number.isFinite(simTime)
        || !Number.isSafeInteger(eventWatermark) || eventWatermark < 0
        || !Number.isSafeInteger(fieldRevision) || fieldRevision < 0) {
      fail("invalid-lineage", "split fragment lineage is invalid");
    }
    const cached = [...fragments.values()].find((record) => record.body === body);
    if (cached) {
      if (!exactMetadata(cached.fragment, metadata)) {
        fail("source-reuse", "one prepared public body was rebound to different authority lineage");
      }
      counters.fragmentCacheHits += 1;
      return cached;
    }
    if (nextFragmentRevision > Number.MAX_SAFE_INTEGER) {
      fail("fragment-revision-overflow", "split fragment revision overflowed");
    }
    const revision = nextFragmentRevision++;
    const payload = publicPayload(body);
    const fragment = deepFreeze({ type: "publicFragment", schema: FRAGMENT_SCHEMA,
      ...fixed, fragmentId: `fragment-${fixed.authorityIncarnation}-${revision}`,
      fragmentRevision: revision, ...metadata, bodyId: body.body.bodyId,
      bodyRevision: body.body.bodyRevision, bodyHash: body.bodyHash, public: payload });
    const encoded = encodePublicFragment(fragment);
    const record = Object.freeze({ fragment, body, wire: encoded.wire,
      fragmentHash: encoded.semanticDigest, bytes: encoded.wire.length,
      baseFragmentId: payload.kind === "delta" ? latest.fragment.fragmentId : null });
    fragments.set(fragment.fragmentId, record);
    fragmentBytes += record.bytes;
    latest = record;
    forceGlobalKeyframe = false;
    counters.fragmentBuilds += 1;
    counters.fragmentPacks += 1;
    counters.fragmentHashes += 1;
    counters.fragmentCompressions += 1;
    if (payload.kind === "keyframe") counters.fragmentKeyframes += 1;
    else counters.fragmentDeltas += 1;
    evictFragments();
    return record;
  }

  function retire(state, frameId, record) {
    state.retired.set(frameId, Object.freeze({ bodyHash: record.fragment.fragment.bodyHash,
      ownerHash: record.overlay.owner.resultHash }));
    while (state.retired.size > limits.maxRetiredAckProofsPerRecipient) {
      state.retired.delete(state.retired.keys().next().value);
    }
  }

  function publish({ identity: rawIdentity, fragment: fragmentRecord, ownerView }) {
    const identity = assertIdentity(rawIdentity);
    if (!fragmentRecord || fragments.get(fragmentRecord.fragment?.fragmentId) !== fragmentRecord) {
      fail("unknown-fragment", "publication must use a live fragment prepared by this authority");
    }
    const state = stateFor(identity);
    const frameId = state.nextFrameId++;
    const fragment = fragmentRecord.fragment;
    const statePairId = `split-${fragment.fragmentId}-${frameId}-${identity.recipientIncarnation}`;
    const overlayOwnerView = normalizeView({ ...ownerView, statePairId,
      snapshotId: fragment.snapshotId, tick: fragment.tick, simTime: fragment.simTime,
      eventWatermark: fragment.eventWatermark, fieldRevision: fragment.fieldRevision,
      overloadMode: fragment.overloadMode });
    const ownerHash = projectionHash(overlayOwnerView);
    counters.overlayHashes += 1;
    const overlay = deepFreeze({ type: "ownerOverlay", schema: OVERLAY_SCHEMA,
      matchId: fixed.matchId, sessionId: identity.sessionId,
      authorityIncarnation: fixed.authorityIncarnation, recipientId: identity.recipientId,
      recipientIncarnation: identity.recipientIncarnation, frameId,
      statePairId,
      snapshotId: fragment.snapshotId, tick: fragment.tick, simTime: fragment.simTime,
      eventWatermark: fragment.eventWatermark, fieldRevision: fragment.fieldRevision,
      overloadMode: fragment.overloadMode, ballparkEpoch: fixed.ballparkEpoch,
      manifestHash: fixed.manifestHash, fragmentId: fragment.fragmentId,
      fragmentRevision: fragment.fragmentRevision, fragmentHash: fragmentRecord.fragmentHash,
      bodyId: fragment.bodyId, bodyHash: fragment.bodyHash,
      owner: { kind: "keyframe", resultHash: ownerHash, view: overlayOwnerView } });
    const encodedOverlay = encodeOwnerOverlay(overlay);
    counters.overlayBuilds += 1;
    counters.overlayCompressions += 1;
    const bytes = fragmentRecord.bytes + encodedOverlay.wire.length;
    const publication = Object.freeze({ type: "splitPublicFragmentPublication",
      capability: CAPABILITY, frame: overlay, bytes,
      fragmentBytes: fragmentRecord.bytes, overlayBytes: encodedOverlay.wire.length,
      encodedDigest: digestPair(fragmentRecord.fragmentHash, encodedOverlay.semanticDigest),
      projectionKind: `public-${fragment.public.kind}+owner-keyframe` });
    publicationMaterial.set(publication, Object.freeze({ fragmentWire: fragmentRecord.wire,
      overlayWire: encodedOverlay.wire, fragmentDigest: fragmentRecord.fragmentHash,
      overlayDigest: encodedOverlay.semanticDigest }));
    const pending = Object.freeze({ publication, fragment: fragmentRecord, overlay });
    state.pending.set(frameId, pending);
    state.retainedOverlayBytes += encodedOverlay.wire.length;
    while (state.pending.size > limits.maxPendingPairsPerRecipient
        || state.retainedOverlayBytes > limits.maxRetainedOverlayBytesPerRecipient) {
      const oldestId = state.pending.keys().next().value;
      const oldest = state.pending.get(oldestId);
      retire(state, oldestId, oldest);
      state.pending.delete(oldestId);
      state.retainedOverlayBytes -= oldest.publication.overlayBytes;
      forceGlobalKeyframe = true;
    }
    counters.publications += 1;
    return publication;
  }

  function acknowledge(rawIdentity, ack) {
    const identity = assertIdentity(rawIdentity);
    const state = stateFor(identity, false);
    const reject = (reason) => {
      counters.ackRejected += 1;
      forceGlobalKeyframe = true;
      return Object.freeze({ accepted: false, reason });
    };
    if (!state || !ack || typeof ack !== "object"
        || ack.matchId !== identity.matchId || ack.sessionId !== identity.sessionId
        || ack.authorityIncarnation !== identity.authorityIncarnation
        || ack.recipientId !== identity.recipientId
        || ack.recipientIncarnation !== identity.recipientIncarnation
        || !Number.isSafeInteger(ack.frameId) || ack.frameId < 1) return reject("identity-mismatch");
    const record = state.pending.get(ack.frameId);
    if (!record) {
      const retired = state.retired.get(ack.frameId);
      if (retired && ack.publicHash === retired.bodyHash && ack.ownerHash === retired.ownerHash) {
        return Object.freeze({ accepted: true, stale: true, retired: true, frameId: ack.frameId });
      }
      return reject("unknown-frame");
    }
    const overlay = record.overlay;
    const expectedBase = record.fragment.fragment.public.kind === "delta"
      ? record.fragment.fragment.public.baseBodyId : null;
    if (ack.ackSchema !== "lbh-authority-state-pair-mixed-ack-v1"
        || ack.pairSchema !== "lbh-authority-state-pair-mixed-v1"
        || ack.statePairId !== overlay.statePairId || ack.snapshotId !== overlay.snapshotId
        || ack.publicHash !== overlay.bodyHash || ack.ownerHash !== overlay.owner.resultHash
        || ack.tick !== overlay.tick || ack.simTime !== overlay.simTime
        || ack.eventWatermark !== overlay.eventWatermark || ack.fieldRevision !== overlay.fieldRevision
        || ack.overloadMode !== overlay.overloadMode || ack.ballparkEpoch !== overlay.ballparkEpoch
        || ack.manifestHash !== overlay.manifestHash
        || ack.publicKind !== record.fragment.fragment.public.kind || ack.ownerKind !== "keyframe"
        || ack.publicBaseSnapshotId !== expectedBase
        || ack.ownerBaseSnapshotId !== null) return reject("lineage-mismatch");
    for (const [frameId, pending] of state.pending) {
      if (frameId > ack.frameId) continue;
      state.pending.delete(frameId);
      state.retainedOverlayBytes -= pending.publication.overlayBytes;
    }
    counters.acknowledgements += 1;
    return Object.freeze({ accepted: true, frameId: ack.frameId });
  }

  function retransmit(rawIdentity, frameId) {
    const identity = assertIdentity(rawIdentity);
    const record = stateFor(identity, false)?.pending.get(frameId);
    if (!record) return null;
    counters.retransmits += 1;
    return record.publication;
  }

  function rebase(rawIdentity) {
    const identity = assertIdentity(rawIdentity);
    const state = stateFor(identity, false);
    if (state) {
      state.pending.clear();
      state.retainedOverlayBytes = 0;
    }
    forceGlobalKeyframe = true;
    counters.recoveryResets += 1;
  }

  function disconnect(rawIdentity) {
    const identity = assertIdentity(rawIdentity);
    recipients.delete(identityKey(identity));
    forceGlobalKeyframe = true;
    counters.disconnects += 1;
  }

  function diagnostics() {
    let pendingPairs = 0;
    let retainedOverlayBytes = 0;
    let retiredAckProofs = 0;
    for (const state of recipients.values()) {
      pendingPairs += state.pending.size;
      retainedOverlayBytes += state.retainedOverlayBytes;
      retiredAckProofs += state.retired.size;
    }
    return deepFreeze({ schema: "lbh-split-public-fragment-authority-diagnostics-v1",
      capability: CAPABILITY, ...counters, fragments: fragments.size, fragmentBytes,
      recipients: recipients.size, pendingPairs, retainedOverlayBytes, retiredAckProofs,
      latestFragmentId: latest?.fragment.fragmentId || null,
      latestFragmentKind: latest?.fragment.public.kind || null,
      forceGlobalKeyframe, limits,
      invariant: Object.freeze({ publicFragmentBuildsPerAuthorityBeatMaximum: 1,
        recipientCanPinGlobalFragment: false, publicWireExposedOnPublication: false }) });
  }

  return Object.freeze({ prepareFragment, publish, acknowledge, retransmit, rebase, disconnect, diagnostics });
}

module.exports = {
  DEFAULTS,
  SplitPublicFragmentAuthorityError,
  createSplitPublicFragmentAuthority,
  isSplitPublication,
  resolveSplitPublication,
};
