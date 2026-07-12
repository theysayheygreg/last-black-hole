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
    default: return "control";
  }
}

function nearestRank(values, percentile) {
  if (!Array.isArray(values) || values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.ceil(percentile * sorted.length) - 1];
}

function frameShape(frame) {
  const bodies = Array.isArray(frame?.state?.bodies) ? frame.state.bodies : [];
  return Object.freeze({
    projectionKind: frame?.type === "publicState" || frame?.type === "ownerState"
      ? (frame.full === true ? "keyframe" : frame.delta === true ? "delta" : "state")
      : null,
    streamKind: frame?.type === "manifest" ? "manifest" : "matchStream",
    entityCount: bodies.length,
    componentCount: bodies.reduce((sum, body) => sum + Math.max(0, Object.keys(body || {}).length - 1), 0)
      + ((frame?.type === "ownerState" && frame.state && typeof frame.state === "object")
        ? Object.keys(frame.state).length : 0),
    despawnCount: Array.isArray(frame?.state?.despawns) ? frame.state.despawns.length : 0,
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
    const key = `${event.direction}|${event.wireVersion}|${event.frameClass}`;
    const group = groups[key] ||= {
      direction: event.direction, wireVersion: event.wireVersion, frameClass: event.frameClass,
      offeredBytes: 0, offeredFrames: 0, acceptedBytes: 0, acceptedFrames: 0,
      coalescedBytes: 0, coalescedFrames: 0, policyDroppedBytes: 0, policyDroppedFrames: 0,
      retransmittedBytes: 0, retransmittedFrames: 0, ackRetiredBytes: 0, ackRetiredFrames: 0,
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
      }
    }
  }
  for (const group of Object.values(groups)) {
    group.p50AcceptedFrameBytes = nearestRank(group.acceptedFrameBytes, 0.5);
    group.p95AcceptedFrameBytes = nearestRank(group.acceptedFrameBytes, 0.95);
    delete group.acceptedFrameBytes;
  }
  const pairBytes = [];
  const pairCounts = {};
  for (const [key, pair] of pairHalves) {
    if (pair.publicState === null || pair.ownerState === null) continue;
    pairBytes.push(pair.publicState + pair.ownerState);
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
  const completeEvidenceWindow = snapshot.overflow === 0
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

function createReplicationAccounting({ now = Date.now, maxEvents = MAX_EVENTS } = {}) {
  let salt = crypto.randomBytes(32);
  const ordinals = new Map();
  const intervals = new Map();
  const events = [];
  const acceptedReliable = new Set();
  let nextOrdinal = 0;
  let overflow = 0;
  let runGeneration = 1;
  let captureStartedAt = now();

  function recipient(bindingKey, schedulerConnectionId) {
    const stable = bindingKey || `pending:${schedulerConnectionId}`;
    let entry = ordinals.get(stable);
    if (!entry) {
      entry = Object.freeze({
        label: `recipient-${++nextOrdinal}`,
        digest: crypto.createHmac("sha256", salt).update(stable).digest("base64url").slice(0, 16),
      });
      ordinals.set(stable, entry);
    }
    return entry;
  }

  function push(state, frame, direction, metric, bytes, { frames = 1, reliableId = null, timestamp = now() } = {}) {
    if (events.length >= maxEvents) { overflow += 1; return; }
    const identity = recipient(state.bindingKey, state.schedulerConnectionId);
    const shape = frameShape(frame);
    events.push(Object.freeze({
      timestamp, recipient: identity.label, recipientDigest: identity.digest,
      recipientOrdinal: Number(identity.label.slice("recipient-".length)),
      runGeneration,
      connectionEpoch: Number.isSafeInteger(state.identity?.connectionEpoch) ? state.identity.connectionEpoch : 0,
      direction, wireVersion: WIRE_PROTOCOL_VERSION, frameClass: wireClass(frame), metric,
      bytes: Math.max(0, Number(bytes) || 0), frames,
      projectionBeat: Number.isSafeInteger(frame?.snapshotId) ? frame.snapshotId : null,
      reliableId: Number.isSafeInteger(reliableId) ? reliableId : null,
      ...shape,
    }));
  }

  return Object.freeze({
    bind(state) {
      const pendingKey = `pending:${state.schedulerConnectionId}`;
      const stableKey = state.bindingKey;
      const pendingIdentity = ordinals.get(pendingKey);
      if (pendingIdentity && stableKey && !ordinals.has(stableKey)) ordinals.set(stableKey, pendingIdentity);
      const identity = recipient(stableKey, state.schedulerConnectionId);
      const list = intervals.get(identity.label) || [];
      const interval = { startAt: now(), endAt: null };
      list.push(interval);
      intervals.set(identity.label, list);
      state.replicationRecipient = identity.label;
      state.replicationInterval = interval;
    },
    cleanup(state) {
      const active = state.replicationInterval;
      if (active && active.endAt === null) active.endAt = now();
      state.replicationInterval = null;
    },
    outbound(state, frame, metric, bytes, options) { push(state, frame, DOWNLINK, metric, bytes, options); },
    inbound(state, frame, bytes) { push(state, frame, UPLINK, "accepted", bytes); },
    accepted(state, frame, bytes, sendAttempt, timestamp) {
      push(state, frame, DOWNLINK, "accepted", bytes, { reliableId: sendAttempt?.reliableId, timestamp });
      if (sendAttempt) {
        const epoch = Number.isSafeInteger(state.identity?.connectionEpoch) ? state.identity.connectionEpoch : 0;
        const key = `${runGeneration}|${state.replicationRecipient}|${epoch}|${sendAttempt.reliableId}`;
        if (acceptedReliable.has(key)) push(state, frame, DOWNLINK, "retransmitted", bytes,
          { reliableId: sendAttempt.reliableId, timestamp });
        else acceptedReliable.add(key);
      }
    },
    reset() {
      ordinals.clear(); intervals.clear(); events.length = 0; acceptedReliable.clear(); nextOrdinal = 0; overflow = 0;
      salt = crypto.randomBytes(32);
      runGeneration += 1;
      captureStartedAt = now();
    },
    snapshot() {
      return Object.freeze({
        enabled: true, overflow,
        captureStartedAt,
        capturedThroughAt: now(),
        events: Object.freeze([...events]),
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
