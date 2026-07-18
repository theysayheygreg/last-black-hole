#!/usr/bin/env node
"use strict";

const assert = require("assert");
const { createBenchAdapterRegistry } = require("../scripts/sim/bench-adapters.cjs");
const { createBenchAuthority } = require("../scripts/sim/bench-authority.cjs");
const { BAY_DEFINITIONS, BENCH_GALLERY_ID, BENCH_GALLERY_SEED } = require("../scripts/sim/bench-gallery.cjs");
const { resolveBenchGate } = require("../scripts/sim/bench-gate.cjs");

assert.deepStrictEqual(resolveBenchGate({ args: {}, env: {} }), { enabled: false, source: "disabled" });
assert.deepStrictEqual(resolveBenchGate({ args: { bench: "true" }, env: {} }), { enabled: true, source: "cli" });

const applied = [];
const reset = [];
const registry = createBenchAdapterRegistry();
registry.register({
  id: "test-well",
  label: "Test Well",
  properties: [
    {
      id: "radius",
      label: "Pull Radius",
      effect: "Changes how far the test well pulls.",
      group: "Gravity",
      unit: "world units",
      min: 1,
      max: 5,
      step: 0.5,
      scope: "type",
      applies: "live",
      drawKind: "radius",
      reset: "Restore the canonical archetype value.",
    },
    {
      id: "restartMass",
      label: "Starting Mass",
      effect: "Changes mass the next time the setup starts.",
      group: "Gravity",
      unit: "mass",
      min: 10,
      max: 20,
      step: 1,
      scope: "type",
      applies: "restart",
      drawKind: "number",
      reset: "Remove the banked restart value.",
    },
  ],
  apply(change) { applied.push([change.property.id, change.value]); },
  reset(change) { reset.push(change.property.id); },
});

const authority = createBenchAuthority({ registry });
const initial = authority.state();
assert.strictEqual(initial.gallery.id, BENCH_GALLERY_ID);
assert.strictEqual(initial.gallery.seed, BENCH_GALLERY_SEED);
assert.strictEqual(initial.gallery.bays.length, BAY_DEFINITIONS.length);
assert.strictEqual(initial.gallery.bays.filter((bay) => bay.simulation === "active").length, 1);
assert.strictEqual(initial.gallery.bays.flatMap((bay) => bay.exhibits)
  .filter((exhibit) => exhibit.contractStatus === "TUNABLE").length, 1);
assert.strictEqual(initial.world.id, BENCH_GALLERY_ID);
assert.strictEqual(initial.world.entities.length, BAY_DEFINITIONS.reduce((sum, bay) => sum + bay.families.length, 0) + 1);
const probe = initial.world.entities.find((entity) => entity.family === "probe-ship");
assert.strictEqual(probe.invulnerable, true);
assert.strictEqual(probe.infiniteFuel, true);
assert.strictEqual(probe.fuel, "infinite");
authority.tick(0.1);
assert.ok(authority.state().world.entities.filter((entity) => entity.active).every((entity) => entity.scenarioTicks === 1));
assert.ok(authority.state().world.entities.filter((entity) => !entity.active).every((entity) => entity.scenarioTicks === 0));

authority.applyEntry({ adapterId: "test-well", propertyId: "radius", value: 2.5 });
authority.applyEntry({ adapterId: "test-well", propertyId: "restartMass", value: 14 });
assert.deepStrictEqual(applied, [["radius", 2.5]]);
assert.strictEqual(authority.exportPatch().liveApplied.length, 1);
assert.strictEqual(authority.exportPatch().bankedRestart.length, 1);

assert.strictEqual(authority.undoLastChange(), true);
assert.strictEqual(authority.exportPatch().bankedRestart.length, 0);
assert.strictEqual(authority.exportPatch().liveApplied.length, 1);
assert.deepStrictEqual(applied.at(-1), ["radius", 2.5]);

const exported = authority.exportPatch();
authority.resetAll();
assert.deepStrictEqual(reset, ["radius", "radius"]);
assert.strictEqual(authority.exportPatch().edits.length, 0);
authority.importPatch({ schema: exported.schema, edits: exported.edits });
assert.deepStrictEqual(authority.exportPatch().edits, exported.edits);
assert.throws(
  () => authority.importPatch({ schema: exported.schema, edits: [{ ...exported.edits[0], status: "banked-restart" }] }),
  /timing mismatch/
);

assert.throws(
  () => authority.applyEntry({ adapterId: "unknown", propertyId: "radius", value: 2 }),
  /NO TUNABLE CONTRACT YET/
);
assert.throws(
  () => authority.applyEntry({ adapterId: "test-well", propertyId: "radius", value: 2.3 }),
  /align to step/
);

const truthA = authority.replaySameSetup();
authority.tick(9);
const truthB = authority.replaySameSetup();
assert.deepStrictEqual(truthA, truthB);
assert.strictEqual(authority.state().world.scenarioTime, 0);

authority.activateBay("objectives");
const activeBays = authority.state().gallery.bays.filter((bay) => bay.simulation === "active");
assert.deepStrictEqual(activeBays.map((bay) => bay.id), ["objectives"]);

function createThrowingAuthority() {
  const switches = { apply: false, reset: false };
  const throwingRegistry = createBenchAdapterRegistry();
  throwingRegistry.register({
    id: "throwing",
    label: "Throwing Test Adapter",
    properties: [{
      id: "value",
      label: "Value",
      effect: "Exercises transaction failure handling.",
      group: "Tests",
      unit: "units",
      min: 0,
      max: 10,
      step: 1,
      scope: "type",
      applies: "live",
      drawKind: "number",
      reset: "Restore the test value.",
    }],
    apply() { if (switches.apply) throw new Error("apply exploded"); },
    reset() { if (switches.reset) throw new Error("reset exploded"); },
  });
  return { authority: createBenchAuthority({ registry: throwingRegistry }), switches };
}

{
  const throwing = createThrowingAuthority();
  const before = throwing.authority.state();
  throwing.switches.apply = true;
  assert.throws(
    () => throwing.authority.applyEntry({ adapterId: "throwing", propertyId: "value", value: 2 }),
    /apply exploded/
  );
  assert.deepStrictEqual(throwing.authority.state(), before);
}

{
  const throwing = createThrowingAuthority();
  throwing.authority.applyEntry({ adapterId: "throwing", propertyId: "value", value: 2 });
  const before = throwing.authority.state();
  throwing.switches.reset = true;
  assert.throws(() => throwing.authority.resetAll(), /reset exploded/);
  assert.deepStrictEqual(throwing.authority.state(), before);
  assert.throws(() => throwing.authority.importPatch({ schema: before.patch.schema, edits: [] }), /reset exploded/);
  assert.deepStrictEqual(throwing.authority.state(), before);
  assert.throws(() => throwing.authority.undoLastChange(), /reset exploded/);
  assert.deepStrictEqual(throwing.authority.state(), before);
}

{
  const throwing = createThrowingAuthority();
  throwing.authority.applyEntry({ adapterId: "throwing", propertyId: "value", value: 2 });
  const before = throwing.authority.state();
  throwing.switches.apply = true;
  assert.throws(() => throwing.authority.importPatch({
    schema: before.patch.schema,
    edits: [{ ...before.patch.edits[0], value: 3 }],
  }), /apply exploded/);
  assert.deepStrictEqual(throwing.authority.state(), before);
}

console.log("Bench authority pure contracts: PASS");
