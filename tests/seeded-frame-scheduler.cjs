#!/usr/bin/env node
"use strict";

const assert = require("assert");
const fs = require("fs");
const path = require("path");
const {
  createSeededFrameScheduler,
  createSplitMix64,
  encodeDomain,
} = require("./network/seeded-frame-scheduler.cjs");

function meta(overrides = {}) {
  return {
    cohort: "four-player",
    playerId: "player-a",
    membershipId: "membership-secret",
    connectionEpoch: "epoch-1",
    direction: "upstream",
    frameClass: "input",
    frameType: "input",
    semanticId: "input-1",
    ...overrides,
  };
}

function testPortablePrngGoldenVectors() {
  const cases = [
    [0n, ["e220a8397b1dcdaf", "6e789e6aa1b965f4", "6c45d188009454f"]],
    [1n, ["910a2dec89025cc1", "beeb8da1658eec67", "f893a2eefb32555e"]],
    [0x1_0000_0000n, ["c42c5a1aa3820138", "37ad5fdd5756bd3d", "af57978921422ad5"]],
  ];
  for (const [seed, expected] of cases) {
    const next = createSplitMix64(seed);
    assert.deepStrictEqual([next(), next(), next()].map((value) => value.toString(16)), expected);
  }
  assert.notDeepStrictEqual(cases[0][1], cases[2][1], "upper 32 seed bits must survive");
  assert.notStrictEqual(encodeDomain(["a/b", "c"]), encodeDomain(["a", "b/c"]), "domain labels are length-prefixed");
}

function testSeedAndTapeExactness() {
  const options = {
    rootSeed: "0x0403ac11",
    rules: { upstream: { input: { delayMs: 20, jitterMs: 5, duplicateRate: 0.5, reorderWindow: 2 } } },
  };
  const first = createSeededFrameScheduler(options);
  for (let index = 0; index < 3; index += 1) first.schedule(JSON.stringify({ type: "input", index }), meta({ semanticId: `i-${index}` }));
  const tape = first.tape();
  const replay = createSeededFrameScheduler({ ...options, replayTape: tape });
  for (let index = 0; index < 3; index += 1) replay.schedule(JSON.stringify({ type: "input", index }), meta({ semanticId: `i-${index}` }));
  assert.deepStrictEqual(replay.advanceTo(30).map((item) => [item.wire, item.originalOrdinal, item.copyIndex]),
    first.advanceTo(30).map((item) => [item.wire, item.originalOrdinal, item.copyIndex]));
  assert.deepStrictEqual(replay.tape(), tape);

  tape.decisions[0].decision.copies = 999;
  assert.notStrictEqual(first.tape().decisions[0].decision.copies, 999, "returned tapes cannot mutate scheduler state");
}

function testStreamIndependence() {
  const rules = { upstream: { input: { delayMs: 40, jitterMs: 20, omitRate: 0.25, duplicateRate: 0.25, reorderWindow: 3 } } };
  const isolated = createSeededFrameScheduler({ rootSeed: 99n, rules });
  const isolatedA = [0, 1, 2].map((index) => isolated.schedule(`a${index}`, meta({ semanticId: index })).decision);

  const interleaved = createSeededFrameScheduler({ rootSeed: 99n, rules });
  const interleavedA = [];
  for (let index = 0; index < 3; index += 1) {
    interleavedA.push(interleaved.schedule(`a${index}`, meta({ semanticId: index })).decision);
    interleaved.decisionLog();
    interleaved.schedule(`b${index}`, meta({ playerId: "player-b", semanticId: index }));
  }
  assert.deepStrictEqual(interleavedA, isolatedA, "another player and log reads cannot perturb player A");
}

function testVirtualClockAndBoundedReordering() {
  const delayed = createSeededFrameScheduler({ rootSeed: 1n, rules: { upstream: { input: { delayMs: 10 } } } });
  delayed.schedule("one", meta());
  assert.deepStrictEqual(delayed.advanceTo(9), []);
  assert.strictEqual(delayed.advanceTo(10)[0].wire, "one");
  assert.throws(() => delayed.advanceTo(9), /backwards/);
  assert.throws(() => createSeededFrameScheduler({ startMs: 0.5 }), /integer/);
  assert.throws(() => createSeededFrameScheduler({ blackouts: [{ startMs: 0.5, endMs: 2, mode: "hold" }] }), /integer/);

  const reordered = createSeededFrameScheduler({ rootSeed: 0n, rules: { upstream: { input: { reorderWindow: 2 } } } });
  reordered.schedule("0", meta({ semanticId: 0 }));
  assert.deepStrictEqual(reordered.advanceTo(0), [], "online release waits for bounded lookahead block");
  reordered.schedule("1", meta({ semanticId: 1 }));
  assert.deepStrictEqual(reordered.releaseDue(), []);
  reordered.schedule("2", meta({ semanticId: 2 }));
  const order = reordered.releaseDue().map((item) => item.originalOrdinal);
  assert.deepStrictEqual(order, [1, 2, 0]);
  order.forEach((ordinal, position) => assert(Math.abs(ordinal - position) <= 2));

  reordered.schedule("tail", meta({ semanticId: 3 }));
  assert.deepStrictEqual(reordered.releaseDue(), []);
  assert.strictEqual(reordered.releaseDue({ flush: true })[0].wire, "tail", "tails flush explicitly and deterministically");

  const jittered = createSeededFrameScheduler({ rootSeed: 3n,
    rules: { upstream: { input: { delayMs: 20, jitterMs: 20, reorderWindow: 2 } } } });
  const decisions = [0, 1, 2].map((index) => jittered.schedule(String(index), meta({ semanticId: index })).decision);
  const maxRelease = Math.max(...decisions.map((decision) => decision.releaseAtMs));
  assert.deepStrictEqual(jittered.advanceTo(maxRelease - 1), [], "a reorder block releases atomically at its latest nominal time");
  assert.strictEqual(jittered.advanceTo(maxRelease).length, 3);
}

function testWholeFrameOmissionDuplicationAndBlackout() {
  const duplicate = createSeededFrameScheduler({ rootSeed: 5n, rules: { upstream: { input: { duplicateRate: 1 } } } });
  const wire = Buffer.from('{"token":"do-not-change","inputSeq":7}');
  duplicate.schedule(wire, meta({ semanticId: "input-7" }));
  const copies = duplicate.advanceTo(0);
  assert.strictEqual(copies.length, 2);
  assert(copies.every((item) => Buffer.isBuffer(item.wire) && item.wire.equals(wire)));
  assert(copies.every((item) => item.identity === "input-7"), "duplicate identity remains stable");

  const omitted = createSeededFrameScheduler({ rootSeed: 5n, rules: { upstream: { input: { omitRate: 1 } } } });
  const result = omitted.schedule("frame", meta());
  assert.strictEqual(result.decision.omitted, true);
  assert.strictEqual(result.decision.copies, 0);
  assert.deepStrictEqual(omitted.advanceTo(100), []);

  const hold = createSeededFrameScheduler({ rules: { upstream: { input: { delayMs: 12 } } },
    blackouts: [{ startMs: 10, endMs: 20, mode: "hold" }] });
  hold.schedule("held", meta());
  assert.strictEqual(hold.advanceTo(19).length, 0);
  assert.strictEqual(hold.advanceTo(21)[0].wire, "held", "leaping over a blackout still honors its hold");

  const discard = createSeededFrameScheduler({ rules: { upstream: { input: { delayMs: 12 } } },
    blackouts: [{ startMs: 10, endMs: 20, mode: "discard" }] });
  assert.strictEqual(discard.schedule("discarded", meta()).decision.blackout, "discard");
  assert.deepStrictEqual(discard.advanceTo(21), []);

  const dueBefore = createSeededFrameScheduler({ rules: { upstream: { input: { delayMs: 5 } } },
    blackouts: [{ startMs: 10, endMs: 20, mode: "discard" }] });
  dueBefore.schedule("already-due", meta());
  assert.strictEqual(dueBefore.advanceTo(15)[0].wire, "already-due", "poll time cannot retroactively discard a due frame");

  const enqueueDuring = createSeededFrameScheduler({ rules: { upstream: { input: { delayMs: 10 } } },
    blackouts: [{ startMs: 10, endMs: 20, mode: "discard" }] });
  enqueueDuring.advanceTo(15);
  assert.strictEqual(enqueueDuring.schedule("arrived-in-blackout", meta()).decision.blackout, "discard",
    "arrival during blackout is captured even if nominal release is after it");

  const holdDoesNotShorten = createSeededFrameScheduler({ rules: { upstream: { input: { delayMs: 10 } } },
    blackouts: [{ startMs: 10, endMs: 20, mode: "hold" }] });
  holdDoesNotShorten.advanceTo(15);
  const heldDecision = holdDoesNotShorten.schedule("late-held", meta()).decision;
  assert.strictEqual(heldDecision.releaseAtMs, 25, "hold never shortens nominal delay");
}

function testReplayDivergenceAndValidation() {
  const original = createSeededFrameScheduler({ rootSeed: 8n });
  original.schedule("a", meta());
  const tape = original.tape();
  const divergent = createSeededFrameScheduler({ rootSeed: 8n, replayTape: tape });
  assert.throws(() => divergent.schedule("changed", meta()), /divergence/);
  assert.throws(() => createSeededFrameScheduler({ rootSeed: 9n, replayTape: tape }), /root seed mismatch/);
  assert.throws(() => createSeededFrameScheduler({ rootSeed: 8n, rules: { default: { delayMs: 1 } }, replayTape: tape }), /scenario mismatch/);

  const exhausted = createSeededFrameScheduler({ rootSeed: 8n, replayTape: tape });
  exhausted.schedule("a", meta());
  assert.throws(() => exhausted.schedule("b", meta({ semanticId: "b" })), /divergence/);
  const unread = createSeededFrameScheduler({ rootSeed: 8n, replayTape: tape });
  assert.throws(() => unread.tape(), /unread decisions/);

  const crafted = JSON.parse(JSON.stringify(tape));
  crafted.decisions[0].decision.copies = 999;
  const unsafe = createSeededFrameScheduler({ rootSeed: 8n, replayTape: crafted });
  assert.throws(() => unsafe.schedule("a", meta()), /invalid decision/);
  for (const field of ["streamOrdinal", "reorderOrdinal", "reorderWindow", "reorderBlock"]) {
    const altered = JSON.parse(JSON.stringify(tape));
    altered.decisions[0].decision[field] += 1;
    const invalid = createSeededFrameScheduler({ rootSeed: 8n, replayTape: altered });
    assert.throws(() => invalid.schedule("a", meta()), /invalid decision/, `${field} is scenario-bound`);
  }
}

function testBoundsEpochFenceRedactionControlsAndReset() {
  const bounded = createSeededFrameScheduler({ maxItems: 1, maxBytes: 5,
    rules: { upstream: { input: { duplicateRate: 1 } } } });
  assert.throws(() => bounded.schedule("12345", meta()), /bounds exceeded/);
  assert.deepStrictEqual(bounded.status(), { nowMs: 0, queuedItems: 0, queuedBytes: 0,
    retainedBlocks: 1, evidenceEntries: 0, evidenceBytes: 0, decisions: 0,
    terminalReason: "seeded frame scheduler queue bounds exceeded" });
  assert.throws(() => bounded.schedule("x", meta()), /bounds exceeded/, "overflow latches terminal instead of resuming corrupt state");

  const epoch = createSeededFrameScheduler({ rules: { upstream: { input: { delayMs: 10 } } } });
  epoch.schedule("old", meta({ connectionEpoch: "epoch-old" }));
  const rotated = epoch.activateEpoch({ playerId: "player-a", direction: "upstream", connectionEpoch: "epoch-new" });
  assert.deepStrictEqual([rotated.discardedItems, rotated.discardedBytes], [1, 3]);
  epoch.schedule("new", meta({ connectionEpoch: "epoch-new" }));
  assert.strictEqual(epoch.schedule("late-old", meta({ connectionEpoch: "epoch-old" })).reason, "stale-connection-epoch");
  assert.deepStrictEqual(epoch.advanceTo(10).map((item) => item.wire), ["new"]);

  const epochWindow = createSeededFrameScheduler({ rules: { upstream: { input: { reorderWindow: 2 } } } });
  epochWindow.schedule("old-partial", meta({ connectionEpoch: "old", semanticId: 0 }));
  epochWindow.activateEpoch({ playerId: "player-a", direction: "upstream", connectionEpoch: "new" });
  for (let index = 0; index < 3; index += 1) {
    epochWindow.schedule(`new-${index}`, meta({ connectionEpoch: "new", semanticId: index }));
  }
  assert.deepStrictEqual(epochWindow.advanceTo(0).map((item) => item.wire).sort(), ["new-0", "new-1", "new-2"]);

  const idempotent = createSeededFrameScheduler({ rules: { upstream: { input: { reorderWindow: 2 } } } });
  idempotent.activateEpoch({ playerId: "player-a", direction: "upstream", connectionEpoch: "same" });
  idempotent.schedule("0", meta({ connectionEpoch: "same", semanticId: 0 }));
  assert.strictEqual(idempotent.activateEpoch({ playerId: "player-a", direction: "upstream", connectionEpoch: "same" }).action, "noop");
  idempotent.schedule("1", meta({ connectionEpoch: "same", semanticId: 1 }));
  idempotent.schedule("2", meta({ connectionEpoch: "same", semanticId: 2 }));
  assert.strictEqual(idempotent.releaseDue().length, 3, "idempotent activation preserves partial reorder state");

  const frozenRules = { upstream: { input: { delayMs: 7 } } };
  const frozen = createSeededFrameScheduler({ rules: frozenRules });
  frozenRules.upstream.input.delayMs = 999;
  assert.strictEqual(frozen.schedule("frozen", meta()).decision.delayMs, 7);

  const cleanup = createSeededFrameScheduler();
  for (let index = 0; index < 100_000; index += 1) {
    cleanup.schedule("x", meta({ semanticId: index }));
    cleanup.releaseDue();
  }
  assert.strictEqual(cleanup.status().retainedBlocks, 0, "completed blocks do not create scheduler memory slope");

  const evidenceBound = createSeededFrameScheduler({ maxEvidenceEntries: 1 });
  evidenceBound.schedule("one", meta());
  assert.throws(() => evidenceBound.schedule("two", meta({ semanticId: 2 })), /evidence bounds exceeded/);
  assert.throws(() => evidenceBound.schedule("three", meta({ semanticId: 3 })), /evidence bounds exceeded/,
    "evidence overflow latches terminal instead of silently dropping records");
  evidenceBound.reset();
  assert.deepStrictEqual(evidenceBound.status(), { nowMs: 0, queuedItems: 0, queuedBytes: 0,
    retainedBlocks: 0, evidenceEntries: 0, evidenceBytes: 0, decisions: 0, terminalReason: null });
  assert.deepStrictEqual(evidenceBound.tape().decisions, []);
  assert.strictEqual(evidenceBound.schedule("clean-after-terminal-reset", meta()).accepted, true,
    "reset recovers a terminal-bound scheduler for clean reuse");
  const purgeBound = createSeededFrameScheduler({ maxEvidenceEntries: 1, rules: { upstream: { input: { delayMs: 10 } } } });
  purgeBound.schedule("old", meta({ connectionEpoch: "old" }));
  assert.throws(() => purgeBound.activateEpoch({ playerId: "player-a", direction: "upstream", connectionEpoch: "new" }),
    /evidence bounds exceeded/, "epoch-purge evidence obeys the same hard cap");
  const oneTape = createSeededFrameScheduler();
  oneTape.schedule("one", meta());
  assert.throws(() => createSeededFrameScheduler({ replayTape: oneTape.tape(), maxEvidenceEntries: 0 }), /entry bound/);
  assert.throws(() => createSeededFrameScheduler({ replayTape: oneTape.tape(), maxEvidenceBytes: 1 }), /byte bound/);
  assert.throws(() => createSeededFrameScheduler().activateEpoch({ direction: "upstream", connectionEpoch: "e" }), /participant/);

  const secrets = createSeededFrameScheduler();
  secrets.schedule('{"ticket":"raw-ticket-secret"}', meta({ playerId: "raw-player-secret", membershipId: "raw-member-secret",
    connectionEpoch: "raw-epoch-secret", semanticId: "raw-semantic-secret" }));
  const artifact = JSON.stringify({ log: secrets.decisionLog(), tape: secrets.tape() });
  for (const secret of ["raw-ticket-secret", "raw-player-secret", "raw-member-secret", "raw-epoch-secret", "raw-semantic-secret"]) {
    assert(!artifact.includes(secret), `artifact leaked ${secret}`);
  }

  const controls = createSeededFrameScheduler({ controls: [
    { atMs: 10, action: "close", playerId: "b" },
    { atMs: 5, action: "stop-consuming", playerId: "a" },
    { atMs: 10, action: "close", playerId: "a" },
  ] });
  controls.advanceTo(10);
  assert.deepStrictEqual(controls.pollControls().map((control) => [control.atMs, control.playerId]), [[5, "a"], [10, "b"], [10, "a"]]);
  controls.reset();
  assert.deepStrictEqual(controls.status(), { nowMs: 0, queuedItems: 0, queuedBytes: 0,
    retainedBlocks: 0, evidenceEntries: 0, evidenceBytes: 0, decisions: 0, terminalReason: null });
  controls.advanceTo(10);
  assert.strictEqual(controls.pollControls().length, 3);

  const reusable = createSeededFrameScheduler();
  reusable.schedule("before-reset", meta());
  assert.strictEqual(reusable.tape().decisions.length, 1);
  reusable.reset();
  assert.deepStrictEqual(reusable.status(), { nowMs: 0, queuedItems: 0, queuedBytes: 0,
    retainedBlocks: 0, evidenceEntries: 0, evidenceBytes: 0, decisions: 0, terminalReason: null });
  assert.deepStrictEqual(reusable.tape().decisions, [], "reset clears retained record-mode decisions");

  const replaySource = createSeededFrameScheduler({ rootSeed: 17n,
    rules: { upstream: { input: { delayMs: 4, duplicateRate: 1 } } } });
  replaySource.schedule("replay-reset", meta());
  const sourceTape = replaySource.tape();
  const sourceTapeCopy = JSON.parse(JSON.stringify(sourceTape));
  const replayReusable = createSeededFrameScheduler({ rootSeed: 17n,
    rules: { upstream: { input: { delayMs: 4, duplicateRate: 1 } } }, replayTape: sourceTape });
  replayReusable.schedule("replay-reset", meta());
  const firstReplay = replayReusable.advanceTo(4).map((item) => [item.wire, item.copyIndex, item.identity]);
  assert.deepStrictEqual(replayReusable.tape(), sourceTape);
  replayReusable.reset();
  replayReusable.schedule("replay-reset", meta());
  const secondReplay = replayReusable.advanceTo(4).map((item) => [item.wire, item.copyIndex, item.identity]);
  assert.deepStrictEqual(secondReplay, firstReplay, "replay mode produces identical output after reset");
  assert.deepStrictEqual(replayReusable.tape(), sourceTape);
  assert.deepStrictEqual(sourceTape, sourceTapeCopy, "replay reuse never mutates the source tape");

  const source = fs.readFileSync(path.join(__dirname, "network/seeded-frame-scheduler.cjs"), "utf8");
  assert(!/Date\.now|performance\.now|setTimeout|setInterval/.test(source), "decision kernel cannot use wall clocks");
  assert(!/packet loss/i.test(source), "whole-frame omission must not be mislabeled packet loss");
}

const tests = [
  testPortablePrngGoldenVectors,
  testSeedAndTapeExactness,
  testStreamIndependence,
  testVirtualClockAndBoundedReordering,
  testWholeFrameOmissionDuplicationAndBlackout,
  testReplayDivergenceAndValidation,
  testBoundsEpochFenceRedactionControlsAndReset,
];

for (const test of tests) test();
console.log(`Seeded frame scheduler: ${tests.length}/${tests.length} checks passed`);
