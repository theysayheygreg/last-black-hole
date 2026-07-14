#!/usr/bin/env node
"use strict";

const assert = require("assert");
const { FLAG, HARNESS_FLAG, TARGETS, createS24LiveEvidenceFixture } =
  require("../scripts/s24-live-evidence-fixture.cjs");

assert.throws(() => createS24LiveEvidenceFixture({ [FLAG]: "true" }), /must be exactly 0 or 1/);
assert.throws(() => createS24LiveEvidenceFixture({ [FLAG]: "1" }), /requires NODE_ENV=test/);
assert.throws(() => createS24LiveEvidenceFixture({ NODE_ENV: "test", [FLAG]: "1" }),
  new RegExp(`${HARNESS_FLAG}=1`));
assert.throws(() => createS24LiveEvidenceFixture({ NODE_ENV: "test", [HARNESS_FLAG]: "1" }),
  /valid only/);

const normal = createS24LiveEvidenceFixture({ NODE_ENV: "production" });
assert.strictEqual(normal.enabled, false);
assert.strictEqual(normal.adapterMaxConnections, 16);
assert.strictEqual(normal.adapterMaxPendingHello, 8);
assert.strictEqual(normal.profilerMaxRecipients, 16);
assert.strictEqual(normal.suppressAmbientAiPlayers, false);
assert.throws(() => normal.prepareSession({}, {}), /disabled/);

const fixture = createS24LiveEvidenceFixture({ NODE_ENV: "test", [FLAG]: "1", [HARNESS_FLAG]: "1" });
assert.strictEqual(fixture.enabled, true);
assert.strictEqual(fixture.adapterMaxConnections, 24);
assert.strictEqual(fixture.adapterMaxPendingHello, 24);
assert.strictEqual(fixture.profilerMaxRecipients, 24);
assert.strictEqual(fixture.suppressAmbientAiPlayers, true);
assert.deepStrictEqual(fixture.targets, TARGETS);
assert.throws(() => fixture.prepareSession({}, { mapId: "shallows", maxPlayers: 24 }), /deep-field/);
assert.throws(() => fixture.prepareSession({}, { mapId: "deep-field", maxPlayers: 8 }), /maxPlayers/);

const session = { worldScale: 10 };
fixture.prepareSession(session, { mapId: "deep-field", maxPlayers: 24 });
assert.deepStrictEqual({ base: session.spawnScavengersBase, perPlayer: session.spawnScavengersPerPlayer,
  max: session.maxScavengers, relevant: session.maxRelevantScavengersPerPlayer },
{ base: 48, perPlayer: 0, max: 48, relevant: 48 });
const runtime = { session, players: new Map(), mapState: {
  scavengers: Array.from({ length: 48 }, (_, index) => ({ id: `scav-${index}`, alive: true, state: "drift" })),
  fauna: [],
} };
fixture.seedRuntime(runtime);
assert.strictEqual(runtime.mapState.fauna.length, 328);
assert.strictEqual(new Set(runtime.mapState.fauna.map((entry) => entry.id)).size, 328);
assert(runtime.mapState.fauna.every((entry) => entry.s24EvidenceBody && entry.alive));
assert(runtime.mapState.fauna.every((entry) => entry.type === "jelly"));
assert(runtime.mapState.scavengers.every((entry) => entry.s24EvidenceAi));
for (let index = 0; index < 24; index += 1) runtime.players.set(`seat-${index}`, { isAI: false });
fixture.observe("simTicks");
fixture.observe("worldSteps");
fixture.observe("worldEntityUpdates", 12);
fixture.observe("fieldSteps");
fixture.observe("scavengerSteps");
fixture.observe("expensiveAiEntityUpdates", 48);
fixture.observe("faunaSteps");
fixture.observe("evidenceFaunaEntityUpdates", 328);
fixture.observe("eventsPublished", 1, "test.event");
fixture.observe("projectionSchedules");
const snapshot = fixture.snapshot(runtime);
assert.strictEqual(snapshot.exactVectorPresent, true);
assert.deepStrictEqual(snapshot.counts,
  { humans: 24, expensiveAi: 48, evidenceFauna: 328, dynamicBodies: 400, ambientAiPlayers: 0 });
assert.strictEqual(snapshot.counters.expensiveAiEntityUpdates, 48);
assert.strictEqual(snapshot.counters.evidenceFaunaEntityUpdates, 328);
assert.strictEqual(snapshot.counters.eventTypes["test.event"], 1);
assert.deepStrictEqual(snapshot.authority, { logicalGameplayWriters: 1, processes: 1, workers: 0,
  note: "One writer for this match; concurrent matches use independent authorities." });
fixture.reset();
assert.strictEqual(fixture.snapshot(runtime).counters.simTicks, 0);
console.log("s24 live evidence fixture contract passed");
