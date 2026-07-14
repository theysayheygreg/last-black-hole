"use strict";

const crypto = require("crypto");
const { canonicalJson, canonicalJsonBytes } = require("./session-replication-manifest.cjs");
const {
  normalizeView,
  prepareProjection,
  preparedProjectionView,
} = require("./canonical-structural-delta.cjs");
const { createAuthorityDeltaPublisher } = require("./authority-delta-publisher.cjs");
const { STAGES } = require("./authority-stage-profiler.cjs");
const { createStatePairWireEncoder } = require("./multiplayer-wire-protocol.cjs");
const {
  CAPABILITY: RUNTIME_PUBLIC_COMPONENTS_CAPABILITY,
  COMPONENT_SCHEMA: RUNTIME_PUBLIC_COMPONENT_SCHEMA,
  assertPublicFactsClassified,
  splitRuntimePublicEntity,
} = require("./runtime-public-schema.cjs");
const {
  CAPABILITY: POSITIONAL_CODEC_CAPABILITY,
  codecContext: positionalCodecContext,
} = require("./state-pair-positional-codec.cjs");
const {
  CAPABILITY: BINARY_CODEC_CAPABILITY,
  codecContext: binaryCodecContext,
} = require("./state-pair-binary-codec.cjs");
const {
  CAPABILITY: PUBLIC_BODY_CAPABILITY,
} = require("./state-pair-public-body-codec.cjs");
const { createSharedPublicBodyAuthority } = require("./shared-public-body-authority.cjs");
const { CAPABILITY: COMPRESSION_CODEC_CAPABILITY, PUBLIC_BODY_COMPRESSION_CAPABILITY } =
  require("./state-pair-compression-codec.cjs");

const CAPABILITY = "state-pair-v1";
const MIXED_CAPABILITY = "state-pair-mixed-v1";
const VIEW_SCHEMA = "lbh-canonical-projection-v1";
const DEFAULT_MANIFEST_SCHEMA = "lbh-session-replication-manifest-v1";
const MAX_SOURCE_ENTITIES = 4096;
const MAX_SOURCE_BYTES = 1024 * 1024;
const MAX_TRACKED_IDENTITIES = 8192;
const SOURCE_FIELD_CLASSIFICATION = Object.freeze({
  public: Object.freeze({
    canonicalLineage: Object.freeze(["runId", "snapshotId", "tick", "simTime", "lastEventSeq", "fieldRevision", "overloadMode"]),
    canonicalPublic: Object.freeze(["state"]),
    staticManifestReference: Object.freeze(["manifestHash"]),
    intentionallyReplaced: Object.freeze(["type", "full", "lastInputSeq", "lastActionSeq"]),
  }),
  owner: Object.freeze({
    canonicalLineage: Object.freeze(["runId", "snapshotId", "tick", "simTime", "lastEventSeq", "fieldRevision", "overloadMode"]),
    recipientIdentity: Object.freeze(["membershipId", "playerId"]),
    canonicalOwnerPrivate: Object.freeze(["state"]),
    canonicalOwnerCursor: Object.freeze(["lastInputSeq", "lastActionSeq"]),
    intentionallyReplaced: Object.freeze(["type"]),
  }),
});

class RuntimeStatePairError extends Error {
  constructor(code, message) {
    super(message);
    this.name = "RuntimeStatePairError";
    this.code = code;
  }
}

function fail(code, message) {
  throw new RuntimeStatePairError(code, message);
}

function requiredString(value, label) {
  if (typeof value !== "string" || !value || value.length > 160 || value.trim() !== value
      || value !== value.normalize("NFC")) fail("invalid-identity", `${label} is invalid`);
  return value;
}

function positiveInteger(value, label) {
  if (!Number.isSafeInteger(value) || value < 1) fail("invalid-identity", `${label} is invalid`);
  return value;
}

function clone(value) {
  return JSON.parse(canonicalJson(value));
}

function hash(value) {
  return crypto.createHash("sha256").update(canonicalJsonBytes(value)).digest("hex");
}

function finite(value, fallback = 0) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Object.is(number, -0) ? 0 : number;
}

function classifiedFields(lane) {
  return new Set(Object.values(SOURCE_FIELD_CLASSIFICATION[lane]).flat());
}

function assertSourceEnvelope(frame, lane) {
  if (!frame || typeof frame !== "object" || Array.isArray(frame)) fail("invalid-source", `${lane} frame is required`);
  const allowed = classifiedFields(lane);
  for (const key of Object.keys(frame)) {
    if (!allowed.has(key)) fail("unknown-source-field", `${lane} frame field ${key} is not classified`);
  }
  for (const key of allowed) {
    if (!Object.hasOwn(frame, key)) fail("missing-source-field", `${lane} frame field ${key} is required`);
  }
  if (lane === "public" && (frame.type !== "publicState" || frame.full !== true
      || frame.lastInputSeq !== 0 || frame.lastActionSeq !== 0)) {
    fail("invalid-source", "public frame replacement fields are invalid");
  }
  if (lane === "owner" && frame.type !== "ownerState") fail("invalid-source", "owner frame type is invalid");
}

function sourceId(entity, fallback) {
  const value = entity?.id ?? entity?.clientId ?? entity?.sourceId ?? fallback;
  return requiredString(String(value || ""), "sourceId");
}

function publicComponents(category, entity, index, splitRuntimePublic) {
  return {
    ...(splitRuntimePublic ? splitRuntimePublicEntity(category, entity) : { runtimePublic: clone(entity) }),
    runtimeOrder: { index },
  };
}

function publicFacts(state, splitRuntimePublic = false) {
  if (splitRuntimePublic) assertPublicFactsClassified(state);
  const facts = clone(state);
  delete facts.players;
  delete facts.inhibitor;
  const world = { ...(facts.world || {}) };
  for (const lane of ["wells", "stars", "wrecks", "planetoids", "portals", "scavengers", "fauna", "sentries"]) {
    delete world[lane];
  }
  facts.world = world;
  return facts;
}

function publicBodyFacts(state) {
  const facts = publicFacts(state, true);
  for (const key of ["runId", "snapshotId", "tick", "simTime", "lastEventSeq", "fieldRevision",
    "overloadMode", "lastInputSeq", "lastActionSeq", "type", "full"]) delete facts[key];
  return facts;
}

function collectPublicEntities(publicFrame, splitRuntimePublic = false) {
  const state = publicFrame?.state;
  if (!state || typeof state !== "object" || Array.isArray(state)) fail("invalid-source", "public state is required");
  const entities = [];
  const append = (category, values) => {
    if (!Array.isArray(values)) return;
    for (let index = 0; index < values.length; index += 1) {
      const value = values[index];
      if (!value || typeof value !== "object" || Array.isArray(value)) fail("invalid-source", `${category} entry is invalid`);
      entities.push({ category, sourceId: sourceId(value, `${category}-${index}`),
        explicitIncarnation: value.incarnation,
        components: publicComponents(category, value, index, splitRuntimePublic) });
      if (entities.length > MAX_SOURCE_ENTITIES) fail("projection-too-large", "public entity source exceeds cap");
    }
  };
  append("player", state.players);
  for (const [category, lane] of [["well", "wells"], ["star", "stars"], ["wreck", "wrecks"],
    ["planetoid", "planetoids"], ["portal", "portals"], ["scavenger", "scavengers"],
    ["fauna", "fauna"], ["sentry", "sentries"]]) {
    append(category, state.world?.[lane]);
  }
  if (state.inhibitor && typeof state.inhibitor === "object") {
    entities.push({ category: "inhibitor", sourceId: "inhibitor", explicitIncarnation: state.inhibitor.incarnation,
      components: publicComponents("inhibitor", state.inhibitor, 0, splitRuntimePublic) });
  }
  return entities;
}

function createRevisionTracker() {
  const states = new Map();
  const retired = new Map();

  function project(rawEntities) {
    const current = new Set();
    const output = [];
    for (const raw of rawEntities) {
      const key = `${raw.category}\u0000${raw.sourceId}`;
      if (current.has(key)) fail("identity-collision", `duplicate source ${raw.category}/${raw.sourceId}`);
      current.add(key);
      const prior = states.get(key);
      if (!prior && states.size >= MAX_TRACKED_IDENTITIES) fail("projection-too-large", "entity identity history exceeds cap");
      const retiredIncarnation = retired.get(key) || 0;
      let incarnation;
      if (prior?.present) incarnation = prior.incarnation;
      else if (raw.explicitIncarnation !== undefined) incarnation = positiveInteger(raw.explicitIncarnation, "entity incarnation");
      else incarnation = retiredIncarnation + 1;
      if (incarnation <= retiredIncarnation) fail("incarnation-regression", "entity incarnation reused after despawn");
      if (prior?.present && raw.explicitIncarnation !== undefined && raw.explicitIncarnation !== prior.incarnation) {
        fail("incarnation-change-without-despawn", "live entity incarnation cannot change");
      }
      const components = {};
      const nextFences = new Map();
      for (const name of Object.keys(raw.components).sort()) {
        const value = clone(raw.components[name]);
        const valueHash = hash(value);
        const fence = prior?.present ? prior.components.get(name) : null;
        const revision = fence ? fence.revision + (fence.hash === valueHash ? 0 : 1) : 1;
        components[name] = { revision, value };
        nextFences.set(name, { revision, hash: valueHash });
      }
      const lifecycleHash = hash({ incarnation, components: [...nextFences].map(([name, value]) => [name, value.hash]) });
      const lifecycleRevision = prior?.present
        ? prior.lifecycleRevision + (prior.lifecycleHash === lifecycleHash ? 0 : 1) : 1;
      states.set(key, { present: true, incarnation, lifecycleRevision, lifecycleHash, components: nextFences });
      output.push({ category: raw.category, sourceId: raw.sourceId, incarnation, lifecycleRevision, components });
    }
    for (const [key, prior] of states) {
      if (!prior.present || current.has(key)) continue;
      retired.set(key, Math.max(retired.get(key) || 0, prior.incarnation));
      states.set(key, { ...prior, present: false });
    }
    return output;
  }

  return Object.freeze({ project });
}

function pairIdentity(binding, authorityIncarnation) {
  return Object.freeze({
    matchId: requiredString(binding.runId, "matchId"),
    sessionId: requiredString(binding.connectionId, "sessionId"),
    authorityIncarnation: positiveInteger(authorityIncarnation, "authorityIncarnation"),
    recipientId: requiredString(binding.membershipId, "recipientId"),
    recipientIncarnation: positiveInteger(binding.connectionEpoch, "recipientIncarnation"),
  });
}

function createRuntimeStatePairAuthority({ matchId, authorityIncarnation, ballparkEpoch = 1,
  manifestSchema = DEFAULT_MANIFEST_SCHEMA, manifestHash, publisherOptions = {}, stageProfiler = null } = {}) {
  // This object belongs to one active match/group and its one dedicated
  // authoritative sim instance. A fleet owns many isolated objects like this;
  // it never shares one global gameplay authority or mutable delta history.
  const fixedMatchId = requiredString(matchId, "matchId");
  const fixedAuthorityIncarnation = positiveInteger(authorityIncarnation, "authorityIncarnation");
  const fixedBallparkEpoch = positiveInteger(ballparkEpoch, "ballparkEpoch");
  const fixedManifestSchema = requiredString(manifestSchema, "manifestSchema");
  const fixedManifestHash = requiredString(manifestHash, "manifestHash");
  const preparedProjectionsEnabled = publisherOptions.preparedProjections !== false;
  const publisher = createAuthorityDeltaPublisher({ ...publisherOptions, stageProfiler });
  const publicBodyAuthority = createSharedPublicBodyAuthority({
    matchId: fixedMatchId,
    authorityIncarnation: fixedAuthorityIncarnation,
    ballparkEpoch: fixedBallparkEpoch,
    manifestHash: fixedManifestHash,
    publisherOptions: { ...publisherOptions, stageProfiler },
  });
  const maxAdmissions = Number.isSafeInteger(publisherOptions.maxRecipients)
    ? publisherOptions.maxRecipients : 128;
  // Legacy and split recipients may coexist during rollback. Component-name
  // histories cannot share one revision tracker without cross-schema churn.
  const legacyPublicTracker = createRevisionTracker();
  const publicBodyTracker = createRevisionTracker();
  let publicBodySource = null;
  const splitPublicTrackers = new Map();
  const ownerTrackers = new Map();
  const admissions = new Map();
  let shareabilityGeneration = stageProfiler?.generation?.() || 0;
  let shareability = { beats: 0, comparisons: 0, mismatches: 0, snapshotId: null, coreHash: null };
  const preparedCounters = { preparations: 0, canonicalizations: 0, hashes: 0 };
  const positionalMeasure = { encodedCandidates: 0, encodedBytes: 0, encodeMilliseconds: 0 };

  function resetShareabilityIfNeeded() {
    const currentGeneration = stageProfiler?.generation?.() || 0;
    if (currentGeneration === shareabilityGeneration) return;
    shareabilityGeneration = currentGeneration;
    shareability = { beats: 0, comparisons: 0, mismatches: 0, snapshotId: null, coreHash: null };
  }

  function observePublicCore(snapshotId, value) {
    if (!stageProfiler) return;
    resetShareabilityIfNeeded();
    const valueHash = hash(value);
    if (shareability.snapshotId !== snapshotId) {
      shareability.snapshotId = snapshotId;
      shareability.coreHash = valueHash;
      shareability.beats += 1;
    } else {
      shareability.comparisons += 1;
      if (shareability.coreHash !== valueHash) shareability.mismatches += 1;
    }
  }

  function key(identity) {
    return canonicalJson([identity.matchId, identity.sessionId, identity.authorityIncarnation,
      identity.recipientId, identity.recipientIncarnation]);
  }

  function context(binding) {
    const identity = pairIdentity(binding, fixedAuthorityIncarnation);
    if (identity.matchId !== fixedMatchId || binding.manifestSchema !== fixedManifestSchema
        || binding.manifestHash !== fixedManifestHash) fail("identity-mismatch", "binding is outside this match authority");
    return identity;
  }

  function admit(binding, ticketClaims) {
    const identity = context(binding);
    if (!ticketClaims || ticketClaims.wireVersion !== "lbh-multiplayer-json-v2"
        || !Array.isArray(ticketClaims.capabilities) || !ticketClaims.capabilities.includes(CAPABILITY)
        || ticketClaims.manifestSchema !== fixedManifestSchema || ticketClaims.manifestHash !== fixedManifestHash
        || ticketClaims.authorityIncarnation !== fixedAuthorityIncarnation
        || canonicalJson(ticketClaims.capabilities) !== canonicalJson(binding.capabilities || [])) {
      fail("capability-not-admitted", "state-pair capability is not ticket-bound");
    }
    if (ticketClaims.capabilities.includes(MIXED_CAPABILITY)
        && !ticketClaims.capabilities.includes(CAPABILITY)) {
      fail("capability-not-admitted", "mixed state-pair capability requires state-pair-v1");
    }
    if (ticketClaims.capabilities.includes(RUNTIME_PUBLIC_COMPONENTS_CAPABILITY)
        && (!ticketClaims.capabilities.includes(CAPABILITY)
          || !ticketClaims.capabilities.includes(MIXED_CAPABILITY))) {
      fail("capability-not-admitted", "runtime public components require mixed state-pair-v1");
    }
    if (ticketClaims.capabilities.includes(POSITIONAL_CODEC_CAPABILITY)
        && (!ticketClaims.capabilities.includes(RUNTIME_PUBLIC_COMPONENTS_CAPABILITY)
          || !ticketClaims.capabilities.includes(MIXED_CAPABILITY))) {
      fail("capability-not-admitted", "positional JSON requires sparse mixed state-pair-v1");
    }
    if (ticketClaims.capabilities.includes(BINARY_CODEC_CAPABILITY)
        && (!ticketClaims.capabilities.includes(POSITIONAL_CODEC_CAPABILITY)
          || !ticketClaims.capabilities.includes(RUNTIME_PUBLIC_COMPONENTS_CAPABILITY)
          || !ticketClaims.capabilities.includes(MIXED_CAPABILITY))) {
      fail("capability-not-admitted", "binary state-pair requires positional JSON fallback and sparse mixed state-pair-v1");
    }
    if (ticketClaims.capabilities.includes(PUBLIC_BODY_CAPABILITY)
        && (!ticketClaims.capabilities.includes(POSITIONAL_CODEC_CAPABILITY)
          || !ticketClaims.capabilities.includes(COMPRESSION_CODEC_CAPABILITY)
          || !ticketClaims.capabilities.includes(PUBLIC_BODY_COMPRESSION_CAPABILITY)
          || !ticketClaims.capabilities.includes(RUNTIME_PUBLIC_COMPONENTS_CAPABILITY)
          || !ticketClaims.capabilities.includes(MIXED_CAPABILITY)
          || ticketClaims.capabilities.includes(BINARY_CODEC_CAPABILITY))) {
      fail("capability-not-admitted", "public body v1 requires compressed positional sparse mixed state-pair and excludes binary v1");
    }
    const admissionKey = key(identity);
    if (!admissions.has(admissionKey) && admissions.size >= maxAdmissions) fail("recipient-cap", "state-pair admission cap reached");
    const needsOwnerTracker = !ownerTrackers.has(identity.recipientId);
    if (needsOwnerTracker && ownerTrackers.size >= maxAdmissions) {
      fail("recipient-cap", "state-pair recipient history cap reached");
    }
    if (needsOwnerTracker) ownerTrackers.set(identity.recipientId, createRevisionTracker());
    admissions.set(admissionKey, Object.freeze({ identity, capabilities: Object.freeze([...ticketClaims.capabilities]) }));
    if (ticketClaims.capabilities.includes(RUNTIME_PUBLIC_COMPONENTS_CAPABILITY)
        && !ticketClaims.capabilities.includes(PUBLIC_BODY_CAPABILITY)
        && !splitPublicTrackers.has(admissionKey)) {
      splitPublicTrackers.set(admissionKey, createRevisionTracker());
    }
    return identity;
  }

  function requireAdmission(binding) {
    const identity = context(binding);
    const admission = admissions.get(key(identity));
    if (!admission || !admission.capabilities.includes(CAPABILITY)) fail("capability-not-admitted", "binding is not admitted for state-pair");
    return identity;
  }

  function buildViews(binding, publicFrame, ownerFrame) {
    const identity = requireAdmission(binding);
    assertSourceEnvelope(publicFrame, "public");
    assertSourceEnvelope(ownerFrame, "owner");
    if (publicFrame?.runId !== fixedMatchId || ownerFrame?.runId !== fixedMatchId
        || publicFrame.snapshotId !== ownerFrame.snapshotId || publicFrame.tick !== ownerFrame.tick
        || publicFrame.simTime !== ownerFrame.simTime || publicFrame.lastEventSeq !== ownerFrame.lastEventSeq
        || publicFrame.fieldRevision !== ownerFrame.fieldRevision || publicFrame.overloadMode !== ownerFrame.overloadMode
        || publicFrame.manifestHash !== fixedManifestHash
        || ownerFrame.membershipId !== identity.recipientId || ownerFrame.playerId !== binding.playerId) {
      fail("non-atomic-source", "public and owner frames must be one authoritative match tick");
    }
    const sourceBytes = canonicalJsonBytes({ publicFrame, ownerFrame }).length;
    if (sourceBytes > MAX_SOURCE_BYTES) {
      fail("projection-too-large", "authoritative source exceeds bounded projection input");
    }
    const snapshot = positiveInteger(publicFrame.snapshotId, "snapshotId");
    const admission = admissions.get(key(identity));
    const splitRuntimePublic = admission.capabilities.includes(RUNTIME_PUBLIC_COMPONENTS_CAPABILITY);
    const sharedPublicBody = admission.capabilities.includes(PUBLIC_BODY_CAPABILITY);
    const shared = {
      schema: VIEW_SCHEMA, runId: fixedMatchId, authorityEpoch: fixedAuthorityIncarnation,
      connectionEpoch: identity.recipientIncarnation, ballparkEpoch: fixedBallparkEpoch,
      manifestHash: fixedManifestHash, statePairId: `pair-${snapshot}-${identity.recipientIncarnation}`,
      snapshotId: `snapshot-${snapshot}`, tick: Math.max(0, Number(publicFrame.tick) || 0),
      simTime: finite(publicFrame.simTime), eventWatermark: Math.max(0, Number(publicFrame.lastEventSeq) || 0),
      fieldRevision: Math.max(0, Number(publicFrame.fieldRevision) || 0), overloadMode: publicFrame.overloadMode,
    };
    const profile = { recipientKey: identity.recipientId, inputBytes: sourceBytes };
    const finalizeView = (input, lane) => {
      if (!preparedProjectionsEnabled) {
        preparedCounters.canonicalizations += 1;
        return Object.freeze({ view: normalizeView(input), prepared: null });
      }
      const preparedContext = Object.freeze({
        schema: input.schema,
        manifestHash: input.manifestHash,
        matchId: identity.matchId,
        sessionId: identity.sessionId,
        authorityIncarnation: identity.authorityIncarnation,
        recipientId: identity.recipientId,
        recipientIncarnation: identity.recipientIncarnation,
        lane,
        statePairId: input.statePairId,
        snapshotId: input.snapshotId,
        tick: input.tick,
      });
      const prepared = prepareProjection(input, preparedContext);
      preparedCounters.preparations += 1;
      preparedCounters.canonicalizations += 1;
      preparedCounters.hashes += 1;
      return Object.freeze({ view: preparedProjectionView(prepared, preparedContext), prepared });
    };
    const publicTracker = sharedPublicBody ? publicBodyTracker
      : splitRuntimePublic ? splitPublicTrackers.get(key(identity)) : legacyPublicTracker;
    if (!publicTracker) fail("capability-not-admitted", "split public history is unavailable for this admission");
    const buildPublicCore = () => ({
      world: { publicFacts: sharedPublicBody
        ? publicBodyFacts(publicFrame.state) : publicFacts(publicFrame.state, splitRuntimePublic) },
      entities: publicTracker.project(collectPublicEntities(publicFrame, splitRuntimePublic)),
    });
    const cachedBody = sharedPublicBody && publicBodySource?.snapshot === snapshot
      ? publicBodySource.body : null;
    if (cachedBody && publicBodySource.publicFrame !== publicFrame) {
      fail("non-shared-public-source",
        "one public-body source tick must be the same authority-projected object for every recipient");
    }
    const publicCore = cachedBody ? null : stageProfiler
      ? stageProfiler.measureSync(STAGES.PUBLIC_CORE, (value) => ({
          ...profile,
          outputBytes: canonicalJsonBytes(value).length,
          entities: value.entities.length,
          components: value.entities.reduce((sum, entity) => sum + Object.keys(entity.components).length, 0),
        }), buildPublicCore)
      : buildPublicCore();
    if (publicCore) observePublicCore(publicFrame.snapshotId, publicCore);
    const body = sharedPublicBody
      ? cachedBody || publicBodyAuthority.prepareBody({
          sourceKey: String(snapshot), world: publicCore.world, entities: publicCore.entities,
        })
      : null;
    if (sharedPublicBody && !cachedBody) {
      publicBodySource = Object.freeze({ snapshot, body, publicFrame });
    }
    const publicView = sharedPublicBody ? null : stageProfiler
      ? stageProfiler.measureSync(STAGES.PUBLIC_PROJECTION, (value) => ({
          ...profile,
          outputBytes: canonicalJsonBytes(value.view).length,
          entities: value.view.entities.length,
          components: value.view.entities.reduce((sum, entity) => sum + Object.keys(entity.components).length, 0),
        }), () => finalizeView({ ...shared, lane: "public", ...publicCore }, "public"))
      : finalizeView({ ...shared, lane: "public", ...publicCore }, "public");
    const buildOwnerView = () => {
      const ownerValue = clone(ownerFrame.state || {});
      const ownerTracker = ownerTrackers.get(identity.recipientId);
      return finalizeView({ ...shared, lane: "owner", world: {}, entities: ownerTracker.project([{
        category: "owner", sourceId: identity.recipientId, components: {
          ownerState: ownerValue,
          transient: { lastInputSeq: ownerFrame.lastInputSeq || 0, lastActionSeq: ownerFrame.lastActionSeq || 0 },
        },
      }]) }, "owner");
    };
    const ownerProjection = stageProfiler
      ? stageProfiler.measureSync(STAGES.OWNER_PROJECTION, (value) => ({
          recipientKey: identity.recipientId,
          inputBytes: canonicalJsonBytes(ownerFrame).length,
          outputBytes: canonicalJsonBytes(value.view).length,
          entities: value.view.entities.length,
          components: value.view.entities.reduce((sum, entity) => sum + Object.keys(entity.components).length, 0),
        }), buildOwnerView)
      : buildOwnerView();
    const publicProjection = publicView;
    if (sharedPublicBody) {
      return Object.freeze({ identity, body, ownerView: ownerProjection.view,
        ownerPrepared: ownerProjection.prepared });
    }
    const binary = admission.capabilities.includes(BINARY_CODEC_CAPABILITY);
    const positionalEncoder = admission.capabilities.includes(POSITIONAL_CODEC_CAPABILITY)
      ? createStatePairWireEncoder(
          binary
            ? binaryCodecContext({ ...identity, manifestHash: fixedManifestHash })
            : positionalCodecContext({ ...identity, manifestHash: fixedManifestHash }),
          (wire, milliseconds) => {
            positionalMeasure.encodedCandidates += 1;
            positionalMeasure.encodedBytes += Buffer.byteLength(wire);
            positionalMeasure.encodeMilliseconds += milliseconds;
          },
        ) : null;
    return Object.freeze({ identity, publicView: publicProjection.view, ownerView: ownerProjection.view,
      publicPrepared: publicProjection.prepared, ownerPrepared: ownerProjection.prepared,
      allowMixed: admission.capabilities.includes(MIXED_CAPABILITY),
      ...(positionalEncoder ? { encodeWire: positionalEncoder } : {}) });
  }

  function publish(binding, publicFrame, ownerFrame) {
    const views = buildViews(binding, publicFrame, ownerFrame);
    return views.body ? publicBodyAuthority.publish(views) : publisher.publish(views);
  }

  function acknowledge(binding, ack) {
    const identity = requireAdmission(binding);
    const admission = admissions.get(key(identity));
    return admission.capabilities.includes(PUBLIC_BODY_CAPABILITY)
      ? publicBodyAuthority.acknowledge(identity, ack)
      : publisher.acknowledge(identity, ack);
  }

  function recover(binding) {
    const identity = requireAdmission(binding);
    const admission = admissions.get(key(identity));
    if (admission.capabilities.includes(PUBLIC_BODY_CAPABILITY)) publicBodyAuthority.rebase(identity);
    else publisher.rebase(identity);
    return true;
  }

  function retransmit(binding, frameId) {
    const identity = requireAdmission(binding);
    const admission = admissions.get(key(identity));
    return admission.capabilities.includes(PUBLIC_BODY_CAPABILITY)
      ? publicBodyAuthority.retransmit(identity, frameId)
      : publisher.retransmit(identity, frameId);
  }

  function disconnect(binding) {
    let identity;
    try { identity = context(binding); } catch { return false; }
    const admission = admissions.get(key(identity));
    admissions.delete(key(identity));
    splitPublicTrackers.delete(key(identity));
    if (admission?.capabilities.includes(PUBLIC_BODY_CAPABILITY)) publicBodyAuthority.disconnect(identity);
    else publisher.disconnect(identity);
    if (![...admissions.values()].some((entry) => entry.identity.recipientId === identity.recipientId)) {
      ownerTrackers.delete(identity.recipientId);
    }
    return true;
  }

  function diagnostics() {
    resetShareabilityIfNeeded();
    return Object.freeze({ matchId: fixedMatchId, authorityIncarnation: fixedAuthorityIncarnation,
      manifestSchema: fixedManifestSchema, manifestHash: fixedManifestHash, admissions: admissions.size,
      ...(stageProfiler ? { profileShareability: Object.freeze({
        publicCore: Object.freeze({ beats: shareability.beats, comparisons: shareability.comparisons,
          mismatches: shareability.mismatches,
          noMismatchesAmongObservedComparisons: shareability.mismatches === 0 }),
        wholeCanonicalPublicViewReusable: false,
        recipientSpecificCanonicalFields: Object.freeze(["connectionEpoch", "statePairId"]),
        recipientSpecificPublicationWork: Object.freeze(["ACK base", "public delta", "owner projection",
          "owner hash", "owner delta", "pair choice", "pair envelope", "adapter queue", "socket send"]),
      }) } : {}),
      preparedProjections: Object.freeze({ enabled: preparedProjectionsEnabled, ...preparedCounters }),
      runtimePublicComponents: Object.freeze({
        capability: RUNTIME_PUBLIC_COMPONENTS_CAPABILITY,
        schema: RUNTIME_PUBLIC_COMPONENT_SCHEMA,
        enabledAdmissions: [...admissions.values()].filter((entry) =>
          entry.capabilities.includes(RUNTIME_PUBLIC_COMPONENTS_CAPABILITY)).length,
        trackedRecipientHistories: splitPublicTrackers.size,
        configuredCadence: Object.freeze({ motionTargetHz: 10, otherGroups: "on-change", lowerCadenceTimers: 0 }),
        fieldFreshness: Object.freeze({
          measurement: "Every group is projected from the same authoritative snapshot; unchanged groups retain their prior revision.",
          maximumConfiguredPublicationLagBeats: Object.freeze({
            runtimeMotion: 0,
            runtimeGameplay: 0,
            runtimeIdentity: 0,
            runtimePresentation: 0,
          }),
        }),
      }),
      positionalJson: Object.freeze({
        capability: POSITIONAL_CODEC_CAPABILITY,
        enabledAdmissions: [...admissions.values()].filter((entry) =>
          entry.capabilities.includes(POSITIONAL_CODEC_CAPABILITY)).length,
        mutableSessionDictionaries: 0,
        hashDomain: "semantic canonical projection",
        ...positionalMeasure,
        meanCandidateEncodeMs: positionalMeasure.encodedCandidates
          ? positionalMeasure.encodeMilliseconds / positionalMeasure.encodedCandidates : null,
        measurementScope: "authority lifetime including warmup; adapter codec counters reset with evidence windows",
      }),
      binary: Object.freeze({
        capability: BINARY_CODEC_CAPABILITY,
        enabledAdmissions: [...admissions.values()].filter((entry) =>
          entry.capabilities.includes(BINARY_CODEC_CAPABILITY)).length,
        positionalJsonFallbackRequired: true,
        lossyQuantization: false,
      }),
      publicBody: Object.freeze({
        capability: PUBLIC_BODY_CAPABILITY,
        enabledAdmissions: [...admissions.values()].filter((entry) =>
          entry.capabilities.includes(PUBLIC_BODY_CAPABILITY)).length,
        sharedTracker: true,
        authority: publicBodyAuthority.diagnostics(),
      }),
      publisher: publisher.diagnostics() });
  }

  return Object.freeze({ admit, publish, acknowledge, retransmit, recover, disconnect, diagnostics });
}

module.exports = {
  CAPABILITY,
  MIXED_CAPABILITY,
  RUNTIME_PUBLIC_COMPONENTS_CAPABILITY,
  RUNTIME_PUBLIC_COMPONENT_SCHEMA,
  POSITIONAL_CODEC_CAPABILITY,
  BINARY_CODEC_CAPABILITY,
  PUBLIC_BODY_CAPABILITY,
  SOURCE_FIELD_CLASSIFICATION,
  VIEW_SCHEMA,
  DEFAULT_MANIFEST_SCHEMA,
  RuntimeStatePairError,
  createRuntimeStatePairAuthority,
};
