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
      timing: "LIVE",
      drawKind: "radius",
      resetBehavior: "Restore the canonical archetype value.",
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
      timing: "RESTART",
      drawKind: "number",
      resetBehavior: "Remove the banked restart value.",
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
assert.ok(initial.gallery.bays.every((bay) => bay.exhibits.every((exhibit) =>
  exhibit.contractStatus === "NO TUNABLE CONTRACT YET"
)));

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
assert.strictEqual(authority.exportPatch().entries.length, 0);
authority.importPatch({ version: exported.version, entries: exported.entries });
assert.deepStrictEqual(authority.exportPatch().entries, exported.entries);

assert.throws(
  () => authority.applyEntry({ adapterId: "unknown", propertyId: "radius", value: 2 }),
  /NO TUNABLE CONTRACT YET/
);
assert.throws(
  () => authority.applyEntry({ adapterId: "test-well", propertyId: "radius", value: 2.3 }),
  /align to step/
);

const truthA = authority.replaySameSetup({ id: "volatile-a", timestamp: 12, x: 1 / 3 });
const truthB = authority.replaySameSetup({ id: "volatile-b", timestamp: 99, x: 1 / 3 });
assert.deepStrictEqual(truthA, truthB);

authority.activateBay("objectives");
const activeBays = authority.state().gallery.bays.filter((bay) => bay.simulation === "active");
assert.deepStrictEqual(activeBays.map((bay) => bay.id), ["objectives"]);

console.log("Bench authority pure contracts: PASS");
