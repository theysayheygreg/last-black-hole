"use strict";

const DEFAULT_CAPACITY = 32;

function canonicalJson(value) {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  return `{${Object.keys(value).sort().map((key) =>
    `${JSON.stringify(key)}:${canonicalJson(value[key])}`
  ).join(",")}}`;
}

function createActionReceiptState(previous = null, capacity = DEFAULT_CAPACITY) {
  if (previous && Array.isArray(previous.receipts)) return previous;
  return {
    capacity: Math.max(1, Math.floor(Number(capacity) || DEFAULT_CAPACITY)),
    receipts: [],
    metrics: {
      adjudicated: 0,
      accepted: 0,
      rejected: 0,
      replays: 0,
      conflicts: 0,
      stale: 0,
      gaps: 0,
      evicted: 0,
    },
  };
}

function actionIdentity(frame) {
  return {
    actionId: frame.actionId,
    actionSeq: frame.actionSeq,
    commandSeq: frame.commandSeq,
    actionKind: frame.actionKind,
    payloadJson: canonicalJson(frame.payload),
  };
}

function sameIdentity(left, right) {
  return left.actionId === right.actionId
    && left.actionSeq === right.actionSeq
    && left.commandSeq === right.commandSeq
    && left.actionKind === right.actionKind
    && left.payloadJson === right.payloadJson;
}

function inspectActionReceipt(state, frame, { lastActionSeq = 0, lastCommandSeq = 0 } = {}) {
  const identity = actionIdentity(frame);
  const byId = state.receipts.find((receipt) => receipt.identity.actionId === identity.actionId);
  if (byId) {
    if (sameIdentity(byId.identity, identity)) {
      state.metrics.replays += 1;
      return { kind: "replay", ack: structuredClone(byId.ack) };
    }
    state.metrics.conflicts += 1;
    return { kind: "conflict", code: "action-id-conflict" };
  }
  if (state.receipts.some((receipt) => receipt.identity.actionSeq === identity.actionSeq)) {
    state.metrics.conflicts += 1;
    return { kind: "conflict", code: "action-seq-conflict" };
  }
  if (state.receipts.some((receipt) => receipt.identity.commandSeq === identity.commandSeq)) {
    state.metrics.conflicts += 1;
    return { kind: "conflict", code: "command-seq-conflict" };
  }
  if (identity.actionSeq <= lastActionSeq) {
    state.metrics.stale += 1;
    return { kind: "stale", code: "stale-action" };
  }
  if (identity.commandSeq <= lastCommandSeq) {
    state.metrics.stale += 1;
    return { kind: "stale", code: "stale-command" };
  }
  if (identity.actionSeq !== lastActionSeq + 1) {
    state.metrics.gaps += 1;
    return { kind: "gap", code: "action-sequence-gap" };
  }
  if (identity.commandSeq !== lastCommandSeq + 1) {
    state.metrics.gaps += 1;
    return { kind: "gap", code: "command-sequence-gap" };
  }
  return { kind: "new", identity };
}

function recordActionReceipt(state, identity, ack) {
  const semanticAck = structuredClone(ack);
  delete semanticAck.deliveryId;
  state.receipts.push({ identity: structuredClone(identity), ack: semanticAck });
  state.metrics.adjudicated += 1;
  state.metrics[semanticAck.status === "accepted" ? "accepted" : "rejected"] += 1;
  while (state.receipts.length > state.capacity) {
    state.receipts.shift();
    state.metrics.evicted += 1;
  }
  return structuredClone(semanticAck);
}

function describeActionReceipts(state) {
  return {
    capacity: state.capacity,
    retained: state.receipts.length,
    ...state.metrics,
  };
}

module.exports = {
  DEFAULT_CAPACITY,
  canonicalJson,
  createActionReceiptState,
  inspectActionReceipt,
  recordActionReceipt,
  describeActionReceipts,
};
