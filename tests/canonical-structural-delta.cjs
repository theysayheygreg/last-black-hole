#!/usr/bin/env node
"use strict";

const crypto = require("crypto");
const { TestRunner, assert } = require("./helpers.cjs");
const {
  VIEW_SCHEMA, DELTA_SCHEMA, MAX_DELTA_BYTES, MAX_RETAINED_IDENTITIES, StructuralDeltaError, publicEntityId,
  normalizeView, projectionHash, createStructuralDelta, applyStructuralDelta,
} = require("../scripts/canonical-structural-delta.cjs");

function expectCode(fn, code) {
  let caught = null;
  try { fn(); } catch (error) { caught = error; }
  assert(caught instanceof StructuralDeltaError && caught.code === code,
    `Expected ${code}, got ${caught?.code || caught?.message || "no error"}`);
}

function component(revision, value) { return { revision, value }; }

function entity(category, sourceId, incarnation, lifecycleRevision, components) {
  return { category, sourceId, incarnation, lifecycleRevision, components };
}

function view({ lane = "public", population = 1, beat = 0, entities = null, world = null,
  snapshotId = `snapshot-${beat}`, fieldRevision = 1 } = {}) {
  const players = Array.from({ length: population }, (_, seat) => entity("player", `seat-${seat}`, 1, 1, {
    transform: component(beat + 1, { x: seat * 10 + beat * 0.25, y: -0, heading: (beat + seat) % 8 }),
    publicState: component(1, { hull: seat % 2 ? "drifter" : "hauler", active: true }),
  }));
  return {
    schema: VIEW_SCHEMA, lane, runId: "run-golden", ballparkEpoch: 3,
    authorityEpoch: 2, connectionEpoch: 7, statePairId: `pair-${beat}`,
    manifestHash: "sha256:manifest", snapshotId, tick: beat, simTime: beat / 10,
    eventWatermark: beat, fieldRevision, overloadMode: null,
    world: world || { toroidalBounds: [0, 4096, 0, 4096], currents: [[1, -1], [0.5, 0]], phase: beat % 4 },
    entities: entities || players,
  };
}

async function run() {
  const runner = new TestRunner("CanonicalStructuralDelta");

  await runner.run("public ids are deterministic length-prefixed NFC UTF-8 namespaces", async () => {
    assert(publicEntityId("player", "é") === "6:player2:é", "Entity id must use UTF-8 byte lengths");
    assert(publicEntityId("a", "bc") !== publicEntityId("ab", "c"), "Length prefixes must prevent concatenation collisions");
    expectCode(() => publicEntityId("player", "e\u0301"), "invalid-identity");
  });

  await runner.run("ordinary component, world array, and field revision mutations round-trip canonically", async () => {
    const base = view({ population: 4, beat: 0 });
    const current = view({ population: 4, beat: 1, fieldRevision: 2,
      world: { toroidalBounds: [0, 8192, 0, 4096], currents: [[1, -1], [0.5, 0]], phase: 1 } });
    const built = createStructuralDelta(base, current, { dirtyHints: [{ entity: "wrong" }] });
    const applied = applyStructuralDelta(base, built.delta);
    assert(applied.resultHash === projectionHash(current), "Applied view must equal current hash");
    assert(built.delta.updates.length === 4 && built.delta.creates.length === 0 && built.delta.despawns.length === 0,
      "Ordinary motion must produce component updates only");
    assert(built.diagnostics.dirtyHintsUsedForCorrectness === false, "Dirty hints must never control correctness");
    assert(built.delta.rootOps.some((op) => op.path.join(".") === "world.toroidalBounds"), "World arrays must be replaced explicitly");
  });

  await runner.run("create, remove, despawn, and same-slot reincarnation have explicit lifecycle operations", async () => {
    const oldA = entity("wreck", "slot-7", 1, 4, { transform: component(1, { x: 1, y: 2 }), lootPublic: component(1, { tier: 1 }) });
    const oldB = entity("fauna", "eel-1", 1, 2, { transform: component(1, { x: 3, y: 4 }) });
    const base = view({ beat: 4, entities: [oldA, oldB] });
    const replacement = entity("wreck", "slot-7", 2, 6, { transform: component(1, { x: 9, y: 8 }) });
    const added = entity("portal", "portal-2", 1, 1, { transform: component(1, { x: 8, y: 7 }) });
    const current = view({ beat: 5, entities: [replacement, added] });
    const { delta } = createStructuralDelta(base, current);
    assert(delta.despawns.length === 2 && delta.creates.length === 2, "Removal and reincarnation must be explicit");
    assert(delta.despawns.find((entry) => entry.publicEntityId === publicEntityId("wreck", "slot-7")).reason === "reincarnated",
      "Reincarnation must name its lifecycle reason");
    assert(applyStructuralDelta(base, delta).resultHash === projectionHash(current), "Lifecycle matrix must round-trip");
    expectCode(() => createStructuralDelta(base, view({ beat: 5, entities: [entity("wreck", "slot-7", 0, 7, replacement.components)] })), "stale-incarnation");
    const removed = view({ beat: 6, entities: [] });
    const retirement = applyStructuralDelta(current, createStructuralDelta(current, removed).delta).retainedIncarnations;
    expectCode(() => createStructuralDelta(removed, view({ beat: 7, entities: [replacement] }), { retainedIncarnations: retirement }), "stale-incarnation");
    const reincarnated = view({ beat: 7, entities: [entity("wreck", "slot-7", 3, 8, replacement.components)] });
    assert(applyStructuralDelta(removed, createStructuralDelta(removed, reincarnated, { retainedIncarnations: retirement }).delta,
      { retainedIncarnations: retirement }).resultHash === projectionHash(reincarnated), "A strictly newer retained incarnation must apply");
  });

  await runner.run("component removals and owner inventory/equipment revisions are isolated", async () => {
    const ownerBaseEntity = entity("owner", "membership-1", 1, 1, {
      inventory: component(1, { cargo: ["ore"], consumables: ["pulse"] }),
      equipment: component(1, { slots: ["lens", null] }), transient: component(1, { cooldown: 3 }),
    });
    const ownerCurrentEntity = entity("owner", "membership-1", 1, 1, {
      inventory: component(2, { cargo: ["ore", "shard"], consumables: [] }),
      equipment: component(2, { slots: ["lens", "coil"] }),
    });
    const base = view({ lane: "owner", beat: 1, entities: [ownerBaseEntity] });
    const current = view({ lane: "owner", beat: 2, entities: [ownerCurrentEntity] });
    const { delta } = createStructuralDelta(base, current);
    assert(delta.updates[0].components.transient.remove === true, "Absent component must be an explicit removal");
    assert(applyStructuralDelta(base, delta).resultHash === projectionHash(current), "Owner changes must round-trip");
    expectCode(() => normalizeView(view({ lane: "public", entities: [ownerBaseEntity] })), "unknown-component-schema");
    expectCode(() => normalizeView(view({ lane: "public", entities: [entity("player", "p", 1, 1,
      { exactCargoState: component(1, { privateMarker: "seed-secret" }) })] })), "unknown-component-schema");
    expectCode(() => normalizeView(view({ lane: "public", entities: [entity("player", "p", 1, 1,
      { publicState: component(1, { oreHold: ["secret"], authToken: "token", ownerMarker: "hidden" }) })] })), "unknown-public-value-schema");
    assert(!JSON.stringify(createStructuralDelta(view({ beat: 1 }), view({ beat: 2 })).delta).includes("ore"),
      "Public delta must not contain seeded owner secrets");
  });

  await runner.run("empty and reordered sources produce deterministic empty deltas", async () => {
    const original = view({ population: 8, beat: 3 });
    const reordered = { ...original, world: { phase: 3, currents: [[1, -1], [0.5, 0]], toroidalBounds: [0, 4096, 0, 4096] },
      entities: [...original.entities].reverse().map((entry) => ({ ...entry,
        components: Object.fromEntries(Object.entries(entry.components).reverse()) })) };
    const left = createStructuralDelta(original, reordered);
    const right = createStructuralDelta(original, original, { dirtyHints: ["everything"] });
    for (const built of [left, right]) {
      assert(built.delta.rootOps.length === 0 && built.delta.creates.length === 0 && built.delta.updates.length === 0 && built.delta.despawns.length === 0,
        "Canonical equality must emit an empty delta");
      assert(applyStructuralDelta(original, built.delta).resultHash === projectionHash(original), "Empty delta must preserve hash");
    }
  });

  await runner.run("1/4/8 representative sequences reconstruct the authority hash on every beat", async () => {
    for (const population of [1, 4, 8]) {
      let materialized = view({ population, beat: 0 });
      for (let beat = 1; beat <= 40; beat += 1) {
        const entities = view({ population, beat }).entities;
        if (beat === 12) entities.push(entity("wreck", `wreck-${population}`, 1, 1, { transform: component(1, { x: 10, y: 20 }) }));
        if (beat > 12 && beat < 20) entities.push(entity("wreck", `wreck-${population}`, 1, 1, { transform: component(beat - 10, { x: 10 + beat, y: 20 }) }));
        if (beat >= 24 && beat < 30) entities.push(entity("wreck", `wreck-${population}`, 2, 3, { transform: component(beat - 23, { x: 40, y: beat }) }));
        const current = view({ population, beat, entities, fieldRevision: beat >= 32 ? 2 : 1 });
        const built = createStructuralDelta(materialized, current, { expectedBaseHash: projectionHash(materialized), dirtyHints: [] });
        materialized = applyStructuralDelta(materialized, built.delta, { expectedResultHash: projectionHash(current) }).view;
      }
    }
  });

  await runner.run("unknown schema, static repeats, collisions, mismatched bases, ordering, hashes, and oversize fail closed", async () => {
    expectCode(() => normalizeView({ ...view(), schema: "future" }), "unknown-schema");
    expectCode(() => normalizeView({ ...view(), mapBounds: [0, 1] }), "static-manifest-field");
    expectCode(() => normalizeView({ ...view(), world: { dynamic: { staticAnchors: [] } } }), "static-manifest-field");
    const duplicate = entity("player", "same", 1, 1, { transform: component(1, { x: 0 }) });
    expectCode(() => normalizeView(view({ entities: [duplicate, duplicate] })), "identity-collision");
    const base = view({ beat: 0 });
    const current = view({ beat: 1 });
    expectCode(() => createStructuralDelta(base, current, { expectedBaseHash: "sha256:nope" }), "base-hash-mismatch");
    expectCode(() => createStructuralDelta(base, { ...current, snapshotId: base.snapshotId }), "invalid-cursor-advance");
    expectCode(() => createStructuralDelta(base, { ...current, statePairId: base.statePairId }), "invalid-cursor-advance");
    const { delta } = createStructuralDelta(base, current);
    expectCode(() => applyStructuralDelta(view({ beat: 0, snapshotId: "other" }), delta), "base-mismatch");
    expectCode(() => applyStructuralDelta(base, { ...delta, resultHash: "sha256:nope" }), "result-hash-mismatch");
    const regressionBase = view({ beat: 2 });
    const regressionCurrent = view({ beat: 3 });
    const regressive = structuredClone(createStructuralDelta(regressionBase, regressionCurrent).delta);
    const tickOp = regressive.rootOps.find((operation) => operation.path.join(".") === "tick");
    tickOp.value = 1;
    regressive.resultHash = projectionHash({ ...regressionCurrent, tick: 1 });
    expectCode(() => applyStructuralDelta(regressionBase, regressive), "result-lineage-regression");
    const malformed = structuredClone(delta);
    malformed.rootOps = [...malformed.rootOps].reverse();
    expectCode(() => applyStructuralDelta(base, malformed), "invalid-order");
    expectCode(() => applyStructuralDelta(base, { ...delta, rootOps: [{}] }), "invalid-operation");
    expectCode(() => applyStructuralDelta(base, { ...delta, schema: "future" }), "unknown-schema");
    expectCode(() => applyStructuralDelta(base, { ...delta, creates: [null] }), "invalid-delta");
    const oversized = { ...delta, padding: "x".repeat(MAX_DELTA_BYTES) };
    expectCode(() => applyStructuralDelta(base, oversized), "delta-too-large");
    const maxed = entity("wreck", "maxed", 1, Number.MAX_SAFE_INTEGER, { transform: component(1, { x: 0 }) });
    expectCode(() => createStructuralDelta(view({ beat: 1, entities: [maxed] }), view({ beat: 2, entities: [] })), "revision-overflow");
    const removedBase = view({ beat: 1 });
    const removedCurrent = view({ beat: 2, entities: [] });
    const wrongReason = structuredClone(createStructuralDelta(removedBase, removedCurrent).delta);
    wrongReason.despawns[0].reason = "reincarnated";
    expectCode(() => applyStructuralDelta(removedBase, wrongReason), "stale-incarnation");
    const removalBase = view({ lane: "owner", beat: 1, entities: [entity("owner", "m", 1, 1,
      { inventory: component(1, { cargo: [] }), transient: component(1, { cooldown: 2 }) })] });
    const removalCurrent = view({ lane: "owner", beat: 2, entities: [entity("owner", "m", 1, 1,
      { inventory: component(1, { cargo: [] }) })] });
    const badRemoval = structuredClone(createStructuralDelta(removalBase, removalCurrent).delta);
    badRemoval.updates[0].components.transient.revision = 999;
    expectCode(() => applyStructuralDelta(removalBase, badRemoval), "component-revision-regression");
    const retained = Object.fromEntries(Array.from({ length: MAX_RETAINED_IDENTITIES + 1 }, (_, index) => [`id-${index}`, 1]));
    expectCode(() => createStructuralDelta(base, current, { retainedIncarnations: retained }), "retained-identity-overflow");
  });

  await runner.run("returned views, deltas, and retained identity ledgers are recursively immutable", async () => {
    const base = view({ beat: 0 });
    const built = createStructuralDelta(base, view({ beat: 1 }));
    const applied = applyStructuralDelta(base, built.delta);
    assert(Object.isFrozen(built.delta) && Object.isFrozen(built.delta.rootOps)
      && Object.isFrozen(applied.view) && Object.isFrozen(applied.view.world)
      && Object.isFrozen(applied.retainedIncarnations), "Core results must be recursively immutable");
  });

  await runner.run("delta JSON sizes are bounded and reported for representative 1/4/8 fixtures", async () => {
    const observations = {};
    for (const population of [1, 4, 8]) {
      const sizes = [];
      let base = view({ population, beat: 0 });
      for (let beat = 1; beat <= 100; beat += 1) {
        const current = view({ population, beat });
        const built = createStructuralDelta(base, current);
        sizes.push(built.deltaBytes);
        base = current;
      }
      sizes.sort((a, b) => a - b);
      observations[population] = { p50: sizes[Math.ceil(sizes.length * 0.5) - 1], p95: sizes[Math.ceil(sizes.length * 0.95) - 1] };
      assert(observations[population].p95 < MAX_DELTA_BYTES, "Representative delta must remain under hard cap");
    }
    const digest = crypto.createHash("sha256").update(JSON.stringify(observations)).digest("hex").slice(0, 12);
    console.log(`  structural JSON observations ${JSON.stringify(observations)} digest=${digest}`);
  });

  process.exit(runner.summary() ? 0 : 1);
}

run().catch((error) => { console.error(error.stack || error.message); process.exit(1); });
