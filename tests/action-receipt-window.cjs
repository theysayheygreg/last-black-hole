"use strict";

const {
  createActionReceiptState,
  inspectActionReceipt,
  recordActionReceipt,
} = require("../scripts/action-receipt-window.cjs");

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const state = createActionReceiptState(null, 2);
const first = {
  actionId: "a",
  actionSeq: 1,
  commandSeq: 1,
  actionKind: "inventory",
  payload: { equipSlot: 0, action: "unequip" },
};
const admitted = inspectActionReceipt(state, first);
assert(admitted.kind === "new", "first action must be new");
recordActionReceipt(state, admitted.identity, {
  type: "ack",
  ackKind: "action",
  ...first,
  status: "rejected",
  result: { code: "empty" },
});
assert(inspectActionReceipt(state, {
  ...first,
  clientTimeMs: 999,
  payload: { action: "unequip", equipSlot: 0 },
}, { lastActionSeq: 1, lastCommandSeq: 1 }).kind === "replay",
"canonical payload retry must replay before stale checks");
assert(inspectActionReceipt(state, { ...first, payload: { action: "unequip", equipSlot: 1 } }, {
  lastActionSeq: 1,
  lastCommandSeq: 1,
}).code === "action-id-conflict", "changed payload must conflict");

for (let seq = 2; seq <= 3; seq += 1) {
  const next = { actionId: String(seq), actionSeq: seq, commandSeq: seq, actionKind: "pulse", payload: {} };
  const result = inspectActionReceipt(state, next, { lastActionSeq: seq - 1, lastCommandSeq: seq - 1 });
  recordActionReceipt(state, result.identity, {
    type: "ack", ackKind: "action", actionId: next.actionId, actionSeq: seq, commandSeq: seq,
    status: "accepted", result: { code: "queued" },
  });
}
assert(state.receipts.length === 2 && state.metrics.evicted === 1, "receipt window must evict to its bound");
assert(inspectActionReceipt(state, first, { lastActionSeq: 3, lastCommandSeq: 3 }).code === "stale-action",
  "evicted retry must become stale unknown");

console.log("ActionReceiptWindow: PASS");
