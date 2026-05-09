const fs = require("fs");
const os = require("os");
const path = require("path");
const { TestRunner, assert } = require("./helpers.cjs");

const ROOT = path.join(__dirname, "..");

async function loadItemsModule() {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "lbh-items-"));
  const seededSrc = fs.readFileSync(path.join(ROOT, "src", "seeded-generation.js"), "utf8");
  const itemsSrc = fs
    .readFileSync(path.join(ROOT, "src", "items.js"), "utf8")
    .replace("./seeded-generation.js", "./seeded-generation.mjs");

  fs.mkdirSync(path.join(tmp, "content"), { recursive: true });
  for (const file of fs.readdirSync(path.join(ROOT, "src", "content"))) {
    if (file.endsWith(".js") || file.endsWith(".json")) {
      fs.copyFileSync(path.join(ROOT, "src", "content", file), path.join(tmp, "content", file));
    }
  }
  fs.writeFileSync(path.join(tmp, "package.json"), JSON.stringify({ type: "module" }));
  fs.writeFileSync(path.join(tmp, "seeded-generation.mjs"), seededSrc);
  fs.writeFileSync(path.join(tmp, "items.mjs"), itemsSrc);
  return import(`file://${path.join(tmp, "items.mjs")}`);
}

async function run() {
  const runner = new TestRunner("Items");
  const items = await loadItemsModule();

  await runner.run("Catalog exposes T1-T4 artifacts with clear inventory shape", async () => {
    const tiers = Object.keys(items.ITEM_CATALOG_BY_TIER).map(Number).sort();
    assert(JSON.stringify(tiers) === JSON.stringify([1, 2, 3, 4]), `Unexpected catalog tiers: ${tiers}`);

    for (const tier of tiers) {
      assert(items.ITEM_CATALOG_BY_TIER[tier].length > 0, `Tier ${tier} has no items`);
    }

    const loot = items.generateLoot("vault", 3, { sessionTime: 240, sourceName: "test vault", count: 8, consumableChance: 0 });
    assert(loot.length === 8, `Expected 8 generated items, got ${loot.length}`);
    for (const item of loot) {
      assert(item.category === "artifact", `Expected artifact category, got ${item.category}`);
      assert(item.subcategory === "equippable", `Expected equippable, got ${item.subcategory}`);
      assert(Number.isInteger(item.tier) && item.tier >= 1 && item.tier <= 4, `Invalid tier ${item.tier}`);
      assert(typeof item.catalogId === "string" && item.catalogId.length > 0, "Missing catalogId");
      assert(Number.isFinite(item.baseValue), "Missing baseValue");
      assert(item.source === "test vault", `Unexpected source ${item.source}`);
    }
  });

  await runner.run("Catalog includes distinctive hull-affinity specials", async () => {
    const allArtifacts = Object.values(items.ITEM_CATALOG_BY_TIER).flat();
    const expected = [
      "event-horizon-keel",
      "negative-space-spool",
      "braided-eddy-core",
      "cinder-geometry",
      "last-wake-codex",
    ];
    for (const id of expected) {
      const item = allArtifacts.find(entry => entry.id === id);
      assert(item, `Missing catalog item ${id}`);
      assert(item.special || Object.keys(item.coefficients || {}).length > 0,
        `${id} should carry coefficients or a special marker`);
    }
  });

  await runner.run("Session tier gates prevent early high-tier drops", async () => {
    const early = items.generateLoot("vault", 4, { sessionTime: 0, count: 200, consumableChance: 0 });
    assert(early.every(item => item.tier === 1), "Session time 0 should only produce T1 loot");

    const mid = items.generateLoot("vault", 4, { sessionTime: 119, count: 200, consumableChance: 0 });
    assert(mid.every(item => item.tier <= 2), "Session time 119 should not produce T3+ loot");

    const late = items.generateLoot("vault", 4, { sessionTime: 240, count: 400, consumableChance: 0 });
    assert(late.some(item => item.tier === 4), "Session time 240 should make T4 possible");
  });

  await runner.run("Legacy generateLoot(wreckType, wreckTier) remains compatible", async () => {
    const loot = items.generateLoot("derelict", 1);
    assert(Array.isArray(loot), "Expected array from legacy generateLoot call");
    assert(loot.length >= 1, "Legacy generateLoot should produce at least one item");
    for (const item of loot) {
      assert(typeof item.id === "string" && item.id.length > 0, "Missing generated id");
      assert(typeof item.name === "string" && item.name.length > 0, "Missing item name");
      assert(typeof item.category === "string" && item.category.length > 0, "Missing category");
      assert(Number.isFinite(item.value), "Missing item value");
    }
  });

  await runner.run("Wreck age value multiplier caps at 1.5x and preserves base value", async () => {
    assert(items.wreckAgeValueMultiplier(10, 10) === 1, "Fresh wreck should be 1x");
    assert(Math.abs(items.wreckAgeValueMultiplier(0, 60) - 1.25) < 1e-9, "60s wreck should be 1.25x");
    assert(items.wreckAgeValueMultiplier(0, 999) === 1.5, "Old wreck should cap at 1.5x");

    const item = { name: "Aged Test", value: 100 };
    items.applyWreckAgeValue(item, 1.25);
    assert(item.baseValue === 100, `Expected baseValue 100, got ${item.baseValue}`);
    assert(item.value === 125, `Expected aged value 125, got ${item.value}`);
    items.applyWreckAgeValue(item, 1.5);
    assert(item.value === 150, `Expected non-compounded value 150, got ${item.value}`);
  });

  const allPassed = runner.summary();
  process.exit(allPassed ? 0 : 1);
}

run().catch((err) => {
  console.error("Items test fatal error:", err.stack || err.message);
  process.exit(1);
});
