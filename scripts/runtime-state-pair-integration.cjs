"use strict";

const crypto = require("crypto");
const { canonicalJson, canonicalJsonBytes } = require("./session-replication-manifest.cjs");
const { normalizeView } = require("./canonical-structural-delta.cjs");
const { createAuthorityDeltaPublisher } = require("./authority-delta-publisher.cjs");

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

function publicComponents(entity, index) {
  return { runtimePublic: clone(entity), runtimeOrder: { index } };
}

function publicFacts(state) {
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

function collectPublicEntities(publicFrame) {
  const state = publicFrame?.state;
  if (!state || typeof state !== "object" || Array.isArray(state)) fail("invalid-source", "public state is required");
  const entities = [];
  const append = (category, values) => {
    if (!Array.isArray(values)) return;
    for (let index = 0; index < values.length; index += 1) {
      const value = values[index];
      if (!value || typeof value !== "object" || Array.isArray(value)) fail("invalid-source", `${category} entry is invalid`);
      entities.push({ category, sourceId: sourceId(value, `${category}-${index}`),
        explicitIncarnation: value.incarnation, components: publicComponents(value, index) });
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
      components: publicComponents(state.inhibitor, 0) });
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
  manifestSchema = DEFAULT_MANIFEST_SCHEMA, manifestHash, publisherOptions = {} } = {}) {
  // This object belongs to one active match/group and its one dedicated
  // authoritative sim instance. A fleet owns many isolated objects like this;
  // it never shares one global gameplay authority or mutable delta history.
  const fixedMatchId = requiredString(matchId, "matchId");
  const fixedAuthorityIncarnation = positiveInteger(authorityIncarnation, "authorityIncarnation");
  const fixedBallparkEpoch = positiveInteger(ballparkEpoch, "ballparkEpoch");
  const fixedManifestSchema = requiredString(manifestSchema, "manifestSchema");
  const fixedManifestHash = requiredString(manifestHash, "manifestHash");
  const publisher = createAuthorityDeltaPublisher(publisherOptions);
  const maxAdmissions = Number.isSafeInteger(publisherOptions.maxRecipients)
    ? publisherOptions.maxRecipients : 128;
  const publicTracker = createRevisionTracker();
  const ownerTrackers = new Map();
  const admissions = new Map();

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
    const admissionKey = key(identity);
    if (!admissions.has(admissionKey) && admissions.size >= maxAdmissions) fail("recipient-cap", "state-pair admission cap reached");
    admissions.set(admissionKey, Object.freeze({ identity, capabilities: Object.freeze([...ticketClaims.capabilities]) }));
    if (!ownerTrackers.has(identity.recipientId)) {
      if (ownerTrackers.size >= maxAdmissions) fail("recipient-cap", "state-pair recipient history cap reached");
      ownerTrackers.set(identity.recipientId, createRevisionTracker());
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
    if (canonicalJsonBytes({ publicFrame, ownerFrame }).length > MAX_SOURCE_BYTES) {
      fail("projection-too-large", "authoritative source exceeds bounded projection input");
    }
    const snapshot = positiveInteger(publicFrame.snapshotId, "snapshotId");
    const shared = {
      schema: VIEW_SCHEMA, runId: fixedMatchId, authorityEpoch: fixedAuthorityIncarnation,
      connectionEpoch: identity.recipientIncarnation, ballparkEpoch: fixedBallparkEpoch,
      manifestHash: fixedManifestHash, statePairId: `pair-${snapshot}-${identity.recipientIncarnation}`,
      snapshotId: `snapshot-${snapshot}`, tick: Math.max(0, Number(publicFrame.tick) || 0),
      simTime: finite(publicFrame.simTime), eventWatermark: Math.max(0, Number(publicFrame.lastEventSeq) || 0),
      fieldRevision: Math.max(0, Number(publicFrame.fieldRevision) || 0), overloadMode: publicFrame.overloadMode,
    };
    const publicView = normalizeView({ ...shared, lane: "public",
      world: { publicFacts: publicFacts(publicFrame.state) },
      entities: publicTracker.project(collectPublicEntities(publicFrame)) });
    const ownerValue = clone(ownerFrame.state || {});
    const ownerTracker = ownerTrackers.get(identity.recipientId);
    const ownerView = normalizeView({ ...shared, lane: "owner", world: {}, entities: ownerTracker.project([{
      category: "owner", sourceId: identity.recipientId, components: {
        ownerState: ownerValue,
        transient: { lastInputSeq: ownerFrame.lastInputSeq || 0, lastActionSeq: ownerFrame.lastActionSeq || 0 },
      },
    }]) });
    const admission = admissions.get(key(identity));
    return Object.freeze({ identity, publicView, ownerView,
      allowMixed: admission.capabilities.includes(MIXED_CAPABILITY) });
  }

  function publish(binding, publicFrame, ownerFrame) {
    return publisher.publish(buildViews(binding, publicFrame, ownerFrame));
  }

  function acknowledge(binding, ack) {
    return publisher.acknowledge(requireAdmission(binding), ack);
  }

  function recover(binding) {
    publisher.rebase(requireAdmission(binding));
    return true;
  }

  function disconnect(binding) {
    let identity;
    try { identity = context(binding); } catch { return false; }
    admissions.delete(key(identity));
    publisher.disconnect(identity);
    return true;
  }

  function diagnostics() {
    return Object.freeze({ matchId: fixedMatchId, authorityIncarnation: fixedAuthorityIncarnation,
      manifestSchema: fixedManifestSchema, manifestHash: fixedManifestHash, admissions: admissions.size,
      publisher: publisher.diagnostics() });
  }

  return Object.freeze({ admit, publish, acknowledge, recover, disconnect, diagnostics });
}

module.exports = {
  CAPABILITY,
  MIXED_CAPABILITY,
  SOURCE_FIELD_CLASSIFICATION,
  VIEW_SCHEMA,
  DEFAULT_MANIFEST_SCHEMA,
  RuntimeStatePairError,
  createRuntimeStatePairAuthority,
};
