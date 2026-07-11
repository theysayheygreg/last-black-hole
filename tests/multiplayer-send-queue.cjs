#!/usr/bin/env node
"use strict";

const assert = require("assert");
const { createMultiplayerSendQueue } = require("../scripts/multiplayer-send-queue.cjs");

function bytes(envelope) {
  return Buffer.byteLength(JSON.stringify(envelope), "utf8");
}

function testStateCoalescingAndOrdering() {
  const queue = createMultiplayerSendQueue({ maxMessages: 8, maxBytes: 4096 });
  assert.deepStrictEqual(queue.enqueueState(10, { x: 1 }), {
    accepted: true,
    action: "queued",
    byteLength: bytes({ type: "state", sequence: 10, payload: { x: 1 } }),
  });
  assert.strictEqual(queue.enqueueState(12, { x: 3 }).action, "coalesced");
  assert.strictEqual(queue.enqueueState(11, { x: 2 }).reason, "stale-state");
  assert.strictEqual(queue.enqueueState(12, { duplicate: true }).reason, "stale-state");

  const batch = queue.drain();
  assert.strictEqual(batch.messages.length, 1);
  assert.deepStrictEqual(batch.messages[0].envelope, { type: "state", sequence: 12, payload: { x: 3 } });
  assert.strictEqual(batch.bytes, batch.messages[0].byteLength);
  assert.strictEqual(batch.bytes, Buffer.byteLength(batch.messages[0].wire, "utf8"));
  assert.strictEqual(queue.status().queuedBytes, 0);
}

function testReliableFifoAckAndReplay() {
  const queue = createMultiplayerSendQueue({ maxMessages: 8, maxBytes: 4096 });
  const first = queue.enqueueConsequence({ kind: "loot" });
  const second = queue.enqueueConsequence({ kind: "death" });
  const third = queue.enqueueConsequence({ kind: "extract" });
  assert.deepStrictEqual([first.id, second.id, third.id], [1, 2, 3]);

  const sent = queue.drain();
  assert.deepStrictEqual(sent.messages.map((message) => message.envelope.id), [1, 2, 3]);
  assert.strictEqual(queue.drain().messages.length, 0, "sent reliable entries await ack without hot-loop resend");

  assert.strictEqual(queue.replayAfter(1).replayMessages, 2);
  assert.deepStrictEqual(queue.drain().messages.map((message) => message.envelope.id), [2, 3]);
  const ack = queue.acknowledge(2);
  assert.strictEqual(ack.removedMessages, 2);
  assert.strictEqual(ack.removedBytes, first.byteLength + second.byteLength);
  assert.strictEqual(queue.acknowledge(1).reason, "stale-ack");
  assert.strictEqual(queue.acknowledge(2).reason, "stale-ack");
  assert.strictEqual(queue.status().reliableMessages, 1);
  assert.strictEqual(queue.status().lastAckedReliableId, 2);

  const expired = queue.replayAfter(1);
  assert.deepStrictEqual(expired, { accepted: false, action: "rebase", reason: "replay-window-expired" });
  assert.strictEqual(queue.status().rebaseRequired, true);
}

function testDeterministicPriorityAndDrainBudgets() {
  const queue = createMultiplayerSendQueue({ maxMessages: 8, maxBytes: 4096 });
  const consequence = queue.enqueueConsequence({ event: "signal" });
  queue.enqueueState(1, { tick: 1 });

  const firstOnly = queue.drain({ maxMessages: 1, maxBytes: 4096 });
  assert.strictEqual(firstOnly.messages.length, 1);
  assert.strictEqual(firstOnly.messages[0].envelope.type, "consequence");
  assert.strictEqual(firstOnly.bytes, consequence.byteLength);
  assert.strictEqual(queue.status().pendingState, true);

  const stateBytes = bytes({ type: "state", sequence: 1, payload: { tick: 1 } });
  assert.strictEqual(queue.drain({ maxMessages: 8, maxBytes: stateBytes - 1 }).messages.length, 0);
  const state = queue.drain({ maxMessages: 8, maxBytes: stateBytes });
  assert.strictEqual(state.messages[0].envelope.type, "state");
  assert.strictEqual(state.bytes, stateBytes);

  const blocked = createMultiplayerSendQueue({ maxMessages: 8, maxBytes: 4096 });
  const large = blocked.enqueueConsequence({ data: "x".repeat(100) });
  blocked.enqueueState(1, { tiny: true });
  const tooSmallForReliable = blocked.drain({ maxMessages: 8, maxBytes: large.byteLength - 1 });
  assert.strictEqual(tooSmallForReliable.messages.length, 0, "state cannot pass a FIFO consequence blocked by budget");
}

function testExactAccountingAndFloodBounds() {
  const sample = { type: "consequence", id: 1, payload: { text: "black hole 🌌" } };
  const sampleBytes = bytes(sample);
  const queue = createMultiplayerSendQueue({
    maxMessages: 3,
    maxBytes: sampleBytes * 3,
    maxReliableMessages: 3,
    maxReliableBytes: sampleBytes * 3,
  });
  const one = queue.enqueueConsequence(sample.payload);
  const two = queue.enqueueConsequence(sample.payload);
  const three = queue.enqueueConsequence(sample.payload);
  const expectedBytes = one.byteLength + two.byteLength + three.byteLength;
  assert.strictEqual(queue.status().queuedBytes, expectedBytes);
  assert.strictEqual(queue.status().queuedMessages, 3);

  for (let index = 0; index < 10_000; index += 1) {
    const result = queue.enqueueConsequence({ flood: index });
    assert.strictEqual(result.action, "disconnect");
  }
  const status = queue.status();
  assert.strictEqual(status.disconnectRequired, true);
  assert.strictEqual(status.reason, "reliable-retention-unsafe");
  assert.strictEqual(status.queuedMessages, 3);
  assert.strictEqual(status.queuedBytes, expectedBytes);
}

function testReplaceableFloodAndOversizeRebase() {
  const queue = createMultiplayerSendQueue({ maxMessages: 4, maxBytes: 128 });
  for (let sequence = 0; sequence < 10_000; sequence += 1) {
    const result = queue.enqueueState(sequence, { sequence });
    assert.strictEqual(result.accepted, true);
  }
  assert.strictEqual(queue.status().queuedMessages, 1);
  assert(queue.status().queuedBytes <= 128);
  assert.strictEqual(queue.status().lastStateSequence, 9_999);

  const oversized = queue.enqueueState(10_000, { data: "x".repeat(256) });
  assert.deepStrictEqual(oversized, { accepted: false, action: "rebase", reason: "state-budget-exceeded" });
  assert.strictEqual(queue.status().queuedMessages, 0, "unsafe replaceable state is discarded, not retained");
  assert.strictEqual(queue.status().disconnectRequired, false);
  assert.strictEqual(queue.enqueueState(10_001, { small: true }).action, "rebase",
    "a newer delta cannot silently clear an outstanding baseline requirement");
  assert.strictEqual(queue.clearRebase().action, "cleared");
  assert.strictEqual(queue.enqueueState(10_001, { small: true }).accepted, true);
}

function testBackpressureHysteresisAndReset() {
  const queue = createMultiplayerSendQueue({
    maxMessages: 8,
    maxBytes: 4096,
    transportHighWaterBytes: 100,
    transportLowWaterBytes: 25,
    nextReliableId: 40,
  });
  assert.strictEqual(queue.enqueueConsequence({ event: 1 }).id, 40);
  assert.strictEqual(queue.observeTransportBufferedBytes(100).action, "pause");
  assert.strictEqual(queue.drain().action, "pause");
  assert.strictEqual(queue.observeTransportBufferedBytes(50).action, "pause", "hysteresis holds in middle band");
  assert.strictEqual(queue.observeTransportBufferedBytes(25).action, "ready");
  assert.strictEqual(queue.drain().messages.length, 1);

  const reset = queue.reset({ nextReliableId: 100 });
  assert.strictEqual(reset.queuedMessages, 0);
  assert.strictEqual(reset.queuedBytes, 0);
  assert.strictEqual(reset.highestIssuedReliableId, 99);
  assert.strictEqual(reset.highestSentReliableId, 99);
  assert.strictEqual(reset.lastAckedReliableId, 99);
  assert.strictEqual(reset.lastStateSequence, -1);
  assert.strictEqual(reset.disconnectRequired, false);
  assert.strictEqual(queue.enqueueConsequence({ after: "reset" }).id, 100);
}

function testInvalidWatermarksDisconnectExplicitly() {
  const ackQueue = createMultiplayerSendQueue();
  ackQueue.enqueueConsequence({ event: 1 });
  assert.strictEqual(ackQueue.acknowledge(2).reason, "ack-beyond-issued-window");
  assert.strictEqual(ackQueue.status().disconnectRequired, true);

  const replayQueue = createMultiplayerSendQueue();
  replayQueue.enqueueConsequence({ event: 1 });
  assert.strictEqual(replayQueue.replayAfter(2).reason, "replay-beyond-issued-window");
  assert.strictEqual(replayQueue.status().disconnectRequired, true);

  const unsentAckQueue = createMultiplayerSendQueue();
  unsentAckQueue.enqueueConsequence({ event: 1 });
  assert.strictEqual(unsentAckQueue.acknowledge(1).reason, "ack-beyond-sent-window");
  assert.strictEqual(unsentAckQueue.status().disconnectRequired, true);

  assert.throws(() => createMultiplayerSendQueue().enqueueState(undefined, {}), /state sequence/);
  assert.throws(() => createMultiplayerSendQueue().acknowledge(undefined), /ack id/);
}

function main() {
  testStateCoalescingAndOrdering();
  testReliableFifoAckAndReplay();
  testDeterministicPriorityAndDrainBudgets();
  testExactAccountingAndFloodBounds();
  testReplaceableFloodAndOversizeRebase();
  testBackpressureHysteresisAndReset();
  testInvalidWatermarksDisconnectExplicitly();
  console.log("multiplayer send queue: bounded state/reliable lanes, replay, backpressure, and reset passed");
}

try {
  main();
} catch (error) {
  console.error(error.stack || error.message);
  process.exitCode = 1;
}
