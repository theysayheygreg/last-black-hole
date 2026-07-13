"use strict";

const crypto = require("crypto");
const { WIRE_PROTOCOL_VERSION } = require("./multiplayer-protocol-constants.cjs");

const DOWNLINK = "authority->client";
const UPLINK = "client->authority";
// Eight recipients at 10 Hz produce 96k offered+accepted state-frame facts in
// five minutes before inputs, control, recovery, or coalescing. This cap keeps
// the opt-in trace bounded while leaving >5x headroom for the S0 product run.
const MAX_EVENTS = 500_000;

function wireClass(frame) {
  switch (frame?.type) {
    case "publicState": return "publicState";
    case "ownerState": return "ownerState";
    case "event": return "event";
    case "input": return "input";
    case "action": return "action";
    case "ack": return "ack";
    case "statePair": return "statePair";
    default: return "control";
  }
}

function nearestRank(values, percentile) {
  if (!Array.isArray(values) || values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.ceil(percentile * sorted.length) - 1];
}

const PUBLIC_WORLD_ENTITY_KEYS = Object.freeze([
  "wells", "stars", "wrecks", "planetoids", "portals", "scavengers", "fauna", "sentries",
]);
const PUBLIC_STATE_KEYS = new Set([
  "type", "protocolVersion", "session", "tick", "simTime", "fieldRevision", "serverTime",
  "lastEventSeq", "players", "world", "inhibitor", "snapshotId", "baselineSnapshotId", "runId",
  "bodySchemaVersion", "snapshotSchemaVersion", "despawns",
]);
const ENTITY_IDENTITY_KEYS = new Set(["id", "clientId", "playerId", "profileId", "instanceId"]);

function isEntityObject(value) {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function entityComponents(entity) {
  if (!entity || typeof entity !== "object" || Array.isArray(entity)) return 0;
  return Object.keys(entity).filter((key) => !ENTITY_IDENTITY_KEYS.has(key)).length;
}

function frameShape(frame) {
  if (frame?.type === "statePair") {
    const publicKind = frame.public?.kind || null;
    const ownerKind = frame.owner?.kind || null;
    const validKinds = [publicKind, ownerKind].every((kind) => kind === "keyframe" || kind === "delta");
    return Object.freeze({
      projectionKind: publicKind === ownerKind ? publicKind : `public-${publicKind}+owner-${ownerKind}`,
      publicProjectionKind: publicKind,
      ownerProjectionKind: ownerKind,
      streamKind: "matchStream",
      shapeSchema: frame.pairSchema || "unknown-state-pair",
      shapeComplete: Boolean(frame.public && frame.owner && validKinds),
      entityCount: 0, componentCount: 0, despawnCount: 0, otherEntityCount: 0,
      unknownStateKeys: Object.freeze([]), unknownWorldKeys: Object.freeze([]),
    });
  }
  const projectionKind = frame?.type === "publicState" || frame?.type === "ownerState"
    ? (frame.full === true ? "keyframe" : frame.delta === true ? "delta" : "state") : null;
  const base = {
    projectionKind,
    publicProjectionKind: frame?.type === "publicState" ? projectionKind : null,
    ownerProjectionKind: frame?.type === "ownerState" ? projectionKind : null,
    streamKind: frame?.type === "manifest" ? "manifest" : "matchStream",
    shapeSchema: "not-applicable",
    shapeComplete: true,
    entityCount: 0,
    componentCount: 0,
    despawnCount: 0,
    otherEntityCount: 0,
    unknownStateKeys: Object.freeze([]),
    unknownWorldKeys: Object.freeze([]),
  };
  if (frame?.type === "ownerState") {
    const state = frame.state;
    const complete = Boolean(state && typeof state === "object" && !Array.isArray(state));
    return Object.freeze({ ...base, shapeSchema: "lbh-owner-state-v1", shapeComplete: complete,
      entityCount: complete ? 1 : 0, componentCount: complete ? entityComponents(state) : 0,
      unknownStateKeys: complete ? Object.freeze([]) : Object.freeze(["<invalid:owner-state>"]) });
  }
  if (frame?.type !== "publicState") return Object.freeze(base);
  const state = frame.state;
  if (!state || typeof state !== "object" || Array.isArray(state)) {
    return Object.freeze({ ...base, shapeSchema: "lbh-public-state-v1", shapeComplete: false,
      unknownStateKeys: Object.freeze(["<invalid-state>"]) });
  }
  const unknownStateKeys = Object.keys(state).filter((key) => !PUBLIC_STATE_KEYS.has(key)).sort();
  const world = state.world;
  const worldObject = isEntityObject(world);
  const unknownWorldKeys = worldObject
    ? Object.keys(world).filter((key) => !PUBLIC_WORLD_ENTITY_KEYS.includes(key)
      && key !== "nextPortalWaveIndex").sort() : ["<invalid-world>"];
  const players = Array.isArray(state.players) ? state.players.filter(isEntityObject) : [];
  const knownCollections = worldObject
    ? PUBLIC_WORLD_ENTITY_KEYS.map((key) => Array.isArray(world[key]) ? world[key].filter(isEntityObject) : []) : [];
  const stateShapeIssues = [
    ...(state.players === undefined ? ["<missing:players>"]
      : !Array.isArray(state.players) ? ["<invalid:players>"]
        : state.players.some((value) => !isEntityObject(value)) ? ["<invalid-member:players>"] : []),
    ...(state.world === undefined ? ["<missing:world>"] : !worldObject ? ["<invalid:world>"] : []),
    ...(state.inhibitor === undefined ? ["<missing:inhibitor>"]
      : !isEntityObject(state.inhibitor) ? ["<invalid:inhibitor>"] : []),
  ];
  const worldShapeIssues = worldObject ? PUBLIC_WORLD_ENTITY_KEYS.flatMap((key) =>
    world[key] === undefined ? [`<missing:${key}>`]
      : !Array.isArray(world[key]) ? [`<invalid:${key}>`]
        : world[key].some((value) => !isEntityObject(value)) ? [`<invalid-member:${key}>`] : [])
    : PUBLIC_WORLD_ENTITY_KEYS.map((key) => `<missing:${key}>`);
  const knownEntities = [...players, ...knownCollections.flat()];
  const inhibitor = isEntityObject(state.inhibitor) ? state.inhibitor : null;
  if (inhibitor) knownEntities.push(inhibitor);
  const unknownValues = [
    ...unknownStateKeys.map((key) => state[key]),
    ...(worldObject ? unknownWorldKeys.map((key) => world[key]) : []),
  ];
  const otherEntities = unknownValues.flatMap((value) => Array.isArray(value)
    ? value : value && typeof value === "object" ? [value] : []);
  const stateDespawns = Array.isArray(state.despawns) ? state.despawns : [];
  const frameDespawns = Array.isArray(frame.despawns) ? frame.despawns : [];
  return Object.freeze({
    ...base,
    shapeSchema: "lbh-public-state-v1",
    shapeComplete: unknownStateKeys.length === 0 && unknownWorldKeys.length === 0
      && stateShapeIssues.length === 0 && worldShapeIssues.length === 0,
    entityCount: knownEntities.length,
    componentCount: knownEntities.reduce((sum, entity) => sum + entityComponents(entity), 0),
    despawnCount: stateDespawns.length + frameDespawns.length,
    otherEntityCount: otherEntities.length,
    unknownStateKeys: Object.freeze([...unknownStateKeys, ...stateShapeIssues]),
    unknownWorldKeys: Object.freeze([...unknownWorldKeys, ...worldShapeIssues]),
  });
}

function intersectSeconds(intervals, startAt, endAt) {
  const clipped = intervals.map((interval) => ({
    start: Math.max(startAt, interval.startAt),
    end: Math.min(endAt, interval.endAt ?? endAt),
  })).filter((interval) => interval.end > interval.start).sort((a, b) => a.start - b.start);
  let milliseconds = 0;
  let cursorStart = null;
  let cursorEnd = null;
  for (const interval of clipped) {
    if (cursorStart === null) {
      cursorStart = interval.start;
      cursorEnd = interval.end;
    } else if (interval.start <= cursorEnd) {
      cursorEnd = Math.max(cursorEnd, interval.end);
    } else {
      milliseconds += cursorEnd - cursorStart;
      cursorStart = interval.start;
      cursorEnd = interval.end;
    }
  }
  if (cursorStart !== null) milliseconds += cursorEnd - cursorStart;
  return milliseconds / 1000;
}

function summarizeWindow(snapshot, {
  startAt, endAt, evidenceFinalized = false, expectedRecipients = null, pendingSendCallbacks = null,
}) {
  if (!Number.isFinite(startAt) || !Number.isFinite(endAt) || endAt <= startAt) {
    throw new TypeError("accounting window must have finite increasing timestamps");
  }
  const selected = snapshot.events.filter((event) => event.timestamp >= startAt && event.timestamp < endAt);
  const recipients = {};
  const aggregate = { downlinkAcceptedBytes: 0, uplinkAcceptedBytes: 0, recipientSeconds: 0 };
  for (const [recipient, intervals] of Object.entries(snapshot.intervals)) {
    const activeSeconds = intersectSeconds(intervals, startAt, endAt);
    recipients[recipient] = { activeSeconds, downlinkAcceptedBytes: 0, uplinkAcceptedBytes: 0 };
    aggregate.recipientSeconds += activeSeconds;
  }
  const groups = {};
  const pairHalves = new Map();
  for (const event of selected) {
    const key = `${event.direction}|${event.wireVersion}|${event.frameClass}|${event.projectionKind || "none"}`;
    const group = groups[key] ||= {
      direction: event.direction, wireVersion: event.wireVersion, frameClass: event.frameClass,
      projectionKind: event.projectionKind,
      offeredBytes: 0, offeredFrames: 0, acceptedBytes: 0, acceptedFrames: 0,
      coalescedBytes: 0, coalescedFrames: 0, policyDroppedBytes: 0, policyDroppedFrames: 0,
      retransmittedBytes: 0, retransmittedFrames: 0, ackRetiredBytes: 0, ackRetiredFrames: 0,
      unofferedRetransmittedBytes: 0, unofferedRetransmittedFrames: 0,
      sendFailedBytes: 0, sendFailedFrames: 0, otherTerminalBytes: 0, otherTerminalFrames: 0,
      acceptedFrameBytes: [],
    };
    const prefix = event.metric;
    group[`${prefix}Bytes`] += event.bytes;
    group[`${prefix}Frames`] += event.frames;
    if (event.metric === "accepted") {
      group.acceptedFrameBytes.push(event.bytes);
      const recipient = recipients[event.recipient] ||= { activeSeconds: 0, downlinkAcceptedBytes: 0, uplinkAcceptedBytes: 0 };
      if (event.direction === DOWNLINK) {
        recipient.downlinkAcceptedBytes += event.bytes;
        aggregate.downlinkAcceptedBytes += event.bytes;
      } else {
        recipient.uplinkAcceptedBytes += event.bytes;
        aggregate.uplinkAcceptedBytes += event.bytes;
      }
      if (event.direction === DOWNLINK && event.projectionBeat !== null
        && (event.frameClass === "publicState" || event.frameClass === "ownerState")) {
        const pairKey = `${event.runGeneration}|${event.recipient}|${event.connectionEpoch}|${event.projectionBeat}`;
        const pair = pairHalves.get(pairKey) || {
          publicState: null, ownerState: null, publicProjectionKind: null, publicCopies: 0, ownerCopies: 0,
        };
        if (event.frameClass === "publicState") {
          pair.publicCopies += 1;
          pair.publicState ??= event.bytes;
          pair.publicProjectionKind ??= event.projectionKind;
        } else {
          pair.ownerCopies += 1;
          pair.ownerState ??= event.bytes;
        }
        pairHalves.set(pairKey, pair);
      } else if (event.direction === DOWNLINK && event.projectionBeat !== null
        && event.frameClass === "statePair") {
        const pairKey = `${event.runGeneration}|${event.recipient}|${event.connectionEpoch}|${event.projectionBeat}`;
        const pair = pairHalves.get(pairKey) || {
          publicState: null, ownerState: null, publicProjectionKind: null, publicCopies: 0, ownerCopies: 0,
          atomicStatePair: null, atomicCopies: 0,
        };
        pair.atomicCopies += 1;
        pair.atomicStatePair ??= event.bytes;
        pair.publicProjectionKind ??= event.projectionKind;
        pairHalves.set(pairKey, pair);
      }
    }
  }
  for (const group of Object.values(groups)) {
    group.p50AcceptedFrameBytes = nearestRank(group.acceptedFrameBytes, 0.5);
    group.p95AcceptedFrameBytes = nearestRank(group.acceptedFrameBytes, 0.95);
    delete group.acceptedFrameBytes;
    if (group.direction === DOWNLINK) {
      group.primaryAcceptedBytes = group.acceptedBytes - group.unofferedRetransmittedBytes;
      group.primaryAcceptedFrames = group.acceptedFrames - group.unofferedRetransmittedFrames;
      group.terminalBytes = group.primaryAcceptedBytes + group.coalescedBytes + group.policyDroppedBytes
        + group.sendFailedBytes + group.otherTerminalBytes;
      group.terminalFrames = group.primaryAcceptedFrames + group.coalescedFrames + group.policyDroppedFrames
        + group.sendFailedFrames + group.otherTerminalFrames;
      group.conservationBalanced = group.offeredBytes === group.terminalBytes
        && group.offeredFrames === group.terminalFrames;
    }
  }
  const pairBytes = [];
  const pairCounts = {};
  for (const [key, pair] of pairHalves) {
    const bytes = pair.atomicStatePair ?? (
      pair.publicState !== null && pair.ownerState !== null ? pair.publicState + pair.ownerState : null
    );
    if (bytes === null) continue;
    pairBytes.push(bytes);
    const parts = key.split("|");
    const recipient = parts[1];
    pairCounts[recipient] = (pairCounts[recipient] || 0) + 1;
    if (pair.publicProjectionKind === "keyframe") {
      recipients[recipient].completeKeyframeBeats = (recipients[recipient].completeKeyframeBeats || 0) + 1;
    }
  }
  for (const [recipient, row] of Object.entries(recipients)) {
    row.completeProjectionBeats = pairCounts[recipient] || 0;
    row.completeKeyframeBeats ||= 0;
    row.actualProjectionBeatsPerSecond = row.activeSeconds > 0 ? row.completeProjectionBeats / row.activeSeconds : null;
    row.actualKeyframesPerSecond = row.activeSeconds > 0 ? row.completeKeyframeBeats / row.activeSeconds : null;
    row.downlinkAcceptedBytesPerSecond = row.activeSeconds > 0 ? row.downlinkAcceptedBytes / row.activeSeconds : null;
    row.uplinkAcceptedBytesPerSecond = row.activeSeconds > 0 ? row.uplinkAcceptedBytes / row.activeSeconds : null;
  }
  aggregate.downlinkAcceptedBytesPerRecipientSecond = aggregate.recipientSeconds > 0
    ? aggregate.downlinkAcceptedBytes / aggregate.recipientSeconds : null;
  aggregate.uplinkAcceptedBytesPerRecipientSecond = aggregate.recipientSeconds > 0
    ? aggregate.uplinkAcceptedBytes / aggregate.recipientSeconds : null;
  const requestedExactProductWindow = endAt - startAt === 300_000;
  const intervalsFinalized = Object.values(snapshot.intervals).every((list) =>
    list.every((interval) => interval.endAt !== null));
  const recipientCardinalityMatches = Number.isSafeInteger(expectedRecipients) && expectedRecipients > 0
    && Object.keys(recipients).length === expectedRecipients;
  const activeCoverageComplete = Object.values(recipients).length > 0
    && Object.values(recipients).every((row) => row.activeSeconds >= (endAt - startAt) / 1000 * 0.9);
  const completeEvidenceWindow = snapshot.overflow === 0 && snapshot.evidenceFailure === null
    && startAt >= snapshot.captureStartedAt && endAt <= snapshot.capturedThroughAt
    && evidenceFinalized && intervalsFinalized && recipientCardinalityMatches && activeCoverageComplete
    && pendingSendCallbacks === 0;
  return Object.freeze({
    startAt, endAt, durationSeconds: (endAt - startAt) / 1000,
    requestedExactProductWindow,
    exactProductWindow: requestedExactProductWindow && completeEvidenceWindow,
    completeEvidenceWindow,
    pendingSendCallbacks,
    recipients: Object.freeze(recipients), aggregate: Object.freeze(aggregate), groups: Object.freeze(groups),
    completePairBytes: Object.freeze({ count: pairBytes.length, p50: nearestRank(pairBytes, 0.5), p95: nearestRank(pairBytes, 0.95) }),
    overflow: snapshot.overflow,
    evidenceFailure: snapshot.evidenceFailure,
  });
}

function reconcileCombinedTraffic({ legacyCombinedBytes, downlinkAcceptedBytes, uplinkAcceptedBytes }) {
  for (const value of [legacyCombinedBytes, downlinkAcceptedBytes, uplinkAcceptedBytes]) {
    if (!Number.isFinite(value) || value < 0) throw new TypeError("traffic reconciliation inputs must be non-negative");
  }
  const directionalCombinedBytes = downlinkAcceptedBytes + uplinkAcceptedBytes;
  const absoluteDifferenceBytes = Math.abs(legacyCombinedBytes - directionalCombinedBytes);
  return Object.freeze({
    legacyCombinedBytes, directionalCombinedBytes, absoluteDifferenceBytes,
    relativeDifference: legacyCombinedBytes === 0 ? (absoluteDifferenceBytes === 0 ? 0 : Infinity)
      : absoluteDifferenceBytes / legacyCombinedBytes,
  });
}

function normalizeReconnect({ nonRecoveryAcceptedDownlinkBytes, nonRecoveryConnectedSeconds,
  reconnectAcceptedDownlinkBytes, reconnectConnectedSeconds, coldManifestServedBytes = 0, runSeconds = 2700 }) {
  for (const value of [nonRecoveryAcceptedDownlinkBytes, nonRecoveryConnectedSeconds,
    reconnectAcceptedDownlinkBytes, reconnectConnectedSeconds, coldManifestServedBytes, runSeconds]) {
    if (!Number.isFinite(value) || value < 0) throw new TypeError("normalization inputs must be finite and non-negative");
  }
  if (nonRecoveryConnectedSeconds === 0 || runSeconds === 0) throw new RangeError("normalization denominators must be positive");
  const recoveryFreeDownlinkBps = nonRecoveryAcceptedDownlinkBytes / nonRecoveryConnectedSeconds;
  const reconnectExcessBytes = Math.max(0,
    reconnectAcceptedDownlinkBytes - recoveryFreeDownlinkBps * reconnectConnectedSeconds);
  return Object.freeze({
    recoveryFreeDownlinkBps,
    reconnectExcessBytes,
    coldManifestServedBytes,
    amortizedDownlinkBps: recoveryFreeDownlinkBps + coldManifestServedBytes / runSeconds + reconnectExcessBytes / runSeconds,
  });
}

function createReplicationAccounting({
  now = Date.now,
  maxEvents = MAX_EVENTS,
  maxOrdinalIdentities = 4096,
  maxIntervalsPerRecipient = 2048,
  maxAcceptedReliable = 16384,
} = {}) {
  let salt = crypto.randomBytes(32);
  const ordinals = new Map();
  const identitiesByLabel = new Map();
  const aliases = new Map();
  const intervals = new Map();
  const events = [];
  const acceptedReliable = new Map();
  let nextOrdinal = 0;
  let overflow = 0;
  let evidenceFailure = null;
  let runGeneration = 1;
  let captureStartedAt = now();

  function failEvidence(reason) {
    if (!evidenceFailure) evidenceFailure = Object.freeze({ reason, timestamp: now() });
    overflow = 1;
  }

  function canonicalLabel(label) {
    let current = label;
    const seen = new Set();
    while (aliases.has(current) && !seen.has(current)) {
      seen.add(current);
      current = aliases.get(current);
    }
    return current;
  }

  function recipient(bindingKey, schedulerConnectionId) {
    if (evidenceFailure) return null;
    const stable = bindingKey || `pending:${schedulerConnectionId}`;
    let entry = ordinals.get(stable);
    if (!entry) {
      if (nextOrdinal >= maxOrdinalIdentities) {
        failEvidence("recipient-capacity-exceeded");
        return null;
      }
      entry = Object.freeze({
        label: `recipient-${++nextOrdinal}`,
        digest: crypto.createHmac("sha256", salt).update(stable).digest("base64url").slice(0, 16),
      });
      ordinals.set(stable, entry);
      identitiesByLabel.set(entry.label, entry);
    }
    return entry;
  }

  function push(state, frame, direction, metric, bytes, { frames = 1, reliableId = null, timestamp = now() } = {}) {
    if (evidenceFailure) return;
    if (events.length >= maxEvents) { failEvidence("event-capacity-exceeded"); return; }
    const identity = recipient(state.bindingKey, state.schedulerConnectionId);
    if (!identity) return;
    const canonical = identitiesByLabel.get(canonicalLabel(identity.label)) || identity;
    const shape = frameShape(frame);
    events.push(Object.freeze({
      timestamp, recipient: canonical.label, recipientDigest: canonical.digest,
      recipientOrdinal: Number(canonical.label.slice("recipient-".length)),
      runGeneration,
      connectionEpoch: Number.isSafeInteger(state.identity?.connectionEpoch) ? state.identity.connectionEpoch : 0,
      direction,
      wireVersion: state.binding?.wireVersion || frame?.wireVersion || WIRE_PROTOCOL_VERSION,
      frameClass: wireClass(frame), metric,
      bytes: Math.max(0, Number(bytes) || 0), frames,
      projectionBeat: frame?.type === "statePair" && Number.isSafeInteger(frame?.frameId)
        ? frame.frameId : Number.isSafeInteger(frame?.snapshotId) ? frame.snapshotId : null,
      reliableId: Number.isSafeInteger(reliableId) ? reliableId : null,
      ...shape,
    }));
  }

  return Object.freeze({
    bind(state) {
      if (evidenceFailure) return;
      const pendingKey = `pending:${state.schedulerConnectionId}`;
      const stableKey = state.bindingKey;
      const pendingIdentity = ordinals.get(pendingKey);
      const stableIdentity = stableKey ? ordinals.get(stableKey) : null;
      if (pendingIdentity && stableIdentity && pendingIdentity !== stableIdentity) {
        aliases.set(pendingIdentity.label, stableIdentity.label);
      } else if (pendingIdentity && stableKey && !stableIdentity) {
        ordinals.set(stableKey, pendingIdentity);
      }
      const identity = recipient(stableKey, state.schedulerConnectionId);
      if (!identity) return;
      const label = canonicalLabel(identity.label);
      const list = intervals.get(label) || [];
      if (list.length >= maxIntervalsPerRecipient) {
        failEvidence("interval-capacity-exceeded");
        return;
      }
      const interval = { startAt: now(), endAt: null };
      list.push(interval);
      intervals.set(label, list);
      state.replicationRecipient = label;
      state.replicationInterval = interval;
    },
    cleanup(state) {
      if (evidenceFailure) return;
      const active = state.replicationInterval;
      if (active && active.endAt === null) active.endAt = now();
      state.replicationInterval = null;
    },
    outbound(state, frame, metric, bytes, options) {
      if (metric === "offered" && Number.isSafeInteger(frame?.deliveryId) && !evidenceFailure) {
        const key = `${runGeneration}|${canonicalLabel(state.replicationRecipient)}|${frame.deliveryId}`;
        let fact = acceptedReliable.get(key);
        if (!fact) {
          if (acceptedReliable.size >= maxAcceptedReliable) {
            failEvidence("reliable-capacity-exceeded");
            return;
          }
          fact = { offers: 0, accepts: 0 };
          acceptedReliable.set(key, fact);
        }
        fact.offers += 1;
      }
      push(state, frame, DOWNLINK, metric, bytes, options);
    },
    inbound(state, frame, bytes) { push(state, frame, UPLINK, "accepted", bytes); },
    accepted(state, frame, bytes, sendAttempt, timestamp) {
      push(state, frame, DOWNLINK, "accepted", bytes, { reliableId: sendAttempt?.reliableId, timestamp });
      if (sendAttempt && !evidenceFailure) {
        const key = `${runGeneration}|${canonicalLabel(state.replicationRecipient)}|${sendAttempt.reliableId}`;
        let fact = acceptedReliable.get(key);
        if (!fact) {
          if (acceptedReliable.size >= maxAcceptedReliable) {
            failEvidence("reliable-capacity-exceeded");
            return;
          }
          fact = { offers: 0, accepts: 0 };
          acceptedReliable.set(key, fact);
        }
        fact.accepts += 1;
        if (fact.accepts > 1) push(state, frame, DOWNLINK, "retransmitted", bytes,
          { reliableId: sendAttempt.reliableId, timestamp });
        if (fact.accepts > fact.offers) push(state, frame, DOWNLINK, "unofferedRetransmitted", bytes,
          { reliableId: sendAttempt.reliableId, timestamp });
      }
    },
    retire(state, reliableId) {
      if (evidenceFailure) return;
      if (!Number.isSafeInteger(reliableId) || reliableId <= 0) return;
      acceptedReliable.delete(`${runGeneration}|${canonicalLabel(state.replicationRecipient)}|${reliableId}`);
    },
    reset() {
      ordinals.clear(); identitiesByLabel.clear(); aliases.clear(); intervals.clear(); events.length = 0;
      acceptedReliable.clear(); nextOrdinal = 0; overflow = 0; evidenceFailure = null;
      salt = crypto.randomBytes(32);
      runGeneration += 1;
      captureStartedAt = now();
    },
    snapshot() {
      return Object.freeze({
        enabled: true, overflow, evidenceFailure,
        captureStartedAt,
        capturedThroughAt: now(),
        events: Object.freeze(events.map((event) => {
          const label = canonicalLabel(event.recipient);
          const identity = identitiesByLabel.get(label);
          return Object.freeze({ ...event, recipient: label,
            recipientDigest: identity?.digest || event.recipientDigest,
            recipientOrdinal: Number(label.slice("recipient-".length)) });
        })),
        intervals: Object.freeze(Object.fromEntries([...intervals].map(([key, value]) => [key,
          Object.freeze(value.map((interval) => Object.freeze({ ...interval })))]))),
      });
    },
  });
}

module.exports = {
  DOWNLINK, UPLINK, wireClass, frameShape, nearestRank, summarizeWindow, normalizeReconnect,
  reconcileCombinedTraffic, createReplicationAccounting,
};
