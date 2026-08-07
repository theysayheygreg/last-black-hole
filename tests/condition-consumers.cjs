const assert = require("assert");
const { ConditionStore } = require("../src/conditions/index.js");
const {
  createRunConditionInitialValues,
  registerSimDerivedConditions,
} = require("../scripts/sim/condition-adapters.cjs");
const { listPlayableMapsForConditions } = require("../scripts/shared-map-loader.cjs");
const {
  getSeededSignatureById,
  resolveSignatureModsById,
} = require("../scripts/sim/signature-mods.cjs");

function run() {
  const runtime = {
    session: { status: "running", runDurationSeconds: 600 },
    simTime: 150,
    mapState: { portals: [{ id: "exit-1", type: "exit", alive: true }] },
    players: new Map(),
  };
  const player = {
    hullType: "drifter",
    hullDamage: 0.25,
    heatRatio: 0.4,
    cargo: [{ id: "cargo-a" }, null],
    noise: { audibleRadiusMeters: 12, listeners: [{ id: "listener-a" }, { id: "listener-b" }] },
    slingshot: { engaged: true },
    status: "alive",
    portalInteraction: null,
  };
  runtime.players.set("pilot-1", player);
  const initial = createRunConditionInitialValues({
    mapId: "expanse",
    seed: 91,
    cosmicSignatureId: "dark_run",
  });
  const store = registerSimDerivedConditions(
    new ConditionStore({ initialValues: initial }),
    { getRuntime: () => runtime },
  );
  const context = { clientId: "pilot-1", profile: { vault: [{ id: "kept" }, null] } };

  assert.strictEqual(store.read("run.map.id"), "expanse");
  assert.strictEqual(store.read("run.modifier.cosmicSignatureId"), "dark_run");
  assert.strictEqual(store.read("pilot.vault.itemCount", context), 1);
  assert.strictEqual(store.read("run.cargo.count", context), 1);
  assert.strictEqual(store.read("run.hull.integrity", context), 0.75);
  assert.strictEqual(store.read("run.heat.ratio", context), 0.4);
  assert.strictEqual(store.read("run.extraction.state", context), "available");
  assert.strictEqual(store.read("run.map.cycleProgress", context), 0.25);
  assert.strictEqual(store.read("run.contacts.count", context), 2);
  assert.strictEqual(store.read("run.noise.radiusMeters", context), 12);
  assert.strictEqual(store.read("run.grapple.active", context), true);
  assert.throws(() => store.mutate("set", "run.heat.ratio", 0.2), /read-only/);

  player.portalInteraction = { ready: true };
  assert.strictEqual(store.read("run.extraction.state", context), "confirmable");
  player.status = "escaped";
  assert.strictEqual(store.read("run.extraction.state", context), "confirmed");

  assert.strictEqual(getSeededSignatureById("dark_run").id, "dark_run");
  assert.strictEqual(resolveSignatureModsById("dark_run").sensorRangeMult, 0.6);
  assert.throws(() => resolveSignatureModsById("not-authored"), /Unknown seeded signature/);

  const mapAvailability = {
    "pilot.unlock.map.shallows": true,
    "pilot.unlock.map.expanse": true,
    "pilot.unlock.map.deepField": false,
  };
  const maps = listPlayableMapsForConditions({
    evaluate(query) { return mapAvailability[query.condition] === query.equals; },
  });
  assert.deepStrictEqual(
    maps.map(({ id, available }) => [id, available]),
    [["shallows", true], ["expanse", true], ["deep-field", false]],
  );
  assert.deepStrictEqual(
    maps.map(({ unlockCondition }) => unlockCondition.condition),
    ["pilot.unlock.map.shallows", "pilot.unlock.map.expanse", "pilot.unlock.map.deepField"],
  );

  console.log("ConditionConsumers: derived facts, manifest-backed signatures, and generic map gates remain one vocabulary.");
}

try {
  run();
} catch (error) {
  console.error(error.stack || error.message);
  process.exitCode = 1;
}
