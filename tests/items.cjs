const fs = require("fs");
const os = require("os");
const path = require("path");
const { TestRunner, assert } = require("./helpers.cjs");

const ROOT = path.join(__dirname, "..");
const catalogData = require("../src/content/items.data.json");

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

async function loadProfileModule() {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "lbh-profile-migration-"));
  fs.cpSync(path.join(ROOT, "src"), path.join(tmp, "src"), { recursive: true });
  fs.writeFileSync(path.join(tmp, "package.json"), JSON.stringify({ type: "module" }));
  return import(`file://${path.join(tmp, "src", "profile.js")}`);
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

  await runner.run("Inert artifact records are retired from every loot tier", async () => {
    const retired = [
      "burn-canister", "harmonic-anchor", "phase-veil", "cargo-brace-mk2", "tidal-resonator",
      "burn-extender", "gravity-lens", "echo-chamber", "void-anchor", "singularity-drive",
      "laminar-flow-core", "inhibitor-resonance", "temporal-displacement",
    ];
    assert(JSON.stringify(catalogData.RETIRED_ARTIFACT_IDS) === JSON.stringify(retired),
      `Expected the declared retired artifact set, got ${JSON.stringify(catalogData.RETIRED_ARTIFACT_IDS)}`);
    const liveIds = new Set(Object.values(items.ITEM_CATALOG_BY_TIER).flat().map((item) => item.id));
    for (const id of retired) assert(!liveIds.has(id), `${id} must not remain droppable`);
    for (const item of Object.values(items.ITEM_CATALOG_BY_TIER).flat()) {
      assert(Object.keys(item.coefficients || {}).length > 0 || item.special,
        `${item.id} must retain a real coefficient or implemented special`);
    }
  });

  await runner.run("Stored profile migration removes retired artifacts without losing live profile data", async () => {
    const retired = { id: "legacy-retired", catalogId: "burn-canister", value: 77 };
    const liveVaultItem = { id: "legacy-live", catalogId: "event-horizon-keel", value: 143 };
    const liveEquippedItem = {
      id: "legacy-equipped",
      catalogId: "negative-space-spool",
      subcategory: "equippable",
      value: 211,
    };
    const storedProfile = {
      id: "legacy-pilot-id",
      name: "Archive Pilot",
      created: "2026-07-01T00:00:00.000Z",
      exoticMatter: 4096,
      vault: [retired, liveVaultItem],
      loadout: {
        equipped: [retired, liveEquippedItem],
        consumables: [null, null],
      },
      upgrades: { thrust: 2, hull: 1 },
      hullType: "drifter",
      rigLevels: [1, 0, 0],
      totalExtractions: 9,
      totalDeaths: 4,
      recentEchoes: [{ fragment: "Still here.", pilotName: "Archive Pilot", hullType: "drifter" }],
    };
    const storage = new Map([
      ["lbh_profiles_index", JSON.stringify({
        slots: [{ name: storedProfile.name, created: storedProfile.created }, null, null],
        lastActive: 0,
      })],
      ["lbh_profile_0", JSON.stringify(storedProfile)],
    ]);
    global.localStorage = {
      getItem: (key) => storage.get(key) ?? null,
      setItem: (key, value) => storage.set(key, String(value)),
      removeItem: (key) => storage.delete(key),
    };

    try {
      const { ProfileManager } = await loadProfileModule();
      const manager = new ProfileManager();
      const profile = manager.loadProfile(0);
      assert(profile.id === storedProfile.id, "migration must preserve profile identity");
      assert(profile.name === storedProfile.name, "migration must preserve pilot name");
      assert(profile.exoticMatter === storedProfile.exoticMatter, "migration must preserve EM");
      assert(profile.totalExtractions === 9 && profile.totalDeaths === 4,
        "migration must preserve lifetime run stats");
      assert(profile.upgrades.thrust === 2 && profile.upgrades.hull === 1,
        "migration must preserve inert legacy upgrade records");
      assert(profile.vault.length === 1 && profile.vault[0].id === liveVaultItem.id,
        "migration must remove only the retired vault artifact");
      assert(profile.loadout.equipped[0] === null
        && profile.loadout.equipped[1].id === liveEquippedItem.id,
      "migration must clear retired equipment without shifting or losing the live slot");
      assert(profile.recentEchoes[0].fragment === "Still here.",
        "migration must preserve unrelated Chronicle data");
      let wrongRunScopeFailed = false;
      try {
        manager.mutateRunCondition("set", "pilot.currency.exoticMatter", 0);
      } catch (error) {
        wrongRunScopeFailed = /requires run scope/.test(error.message);
      }
      assert(wrongRunScopeFailed, "run mutation must reject a pilot-scoped condition before mutation");
      let wrongPilotScopeFailed = false;
      try {
        manager.mutatePilotCondition("initialize", "run.map.id", "shallows");
      } catch (error) {
        wrongPilotScopeFailed = /requires pilot scope/.test(error.message);
      }
      assert(wrongPilotScopeFailed, "pilot mutation must reject a run-scoped condition before mutation");

      const persisted = JSON.parse(storage.get("lbh_profile_0"));
      assert(persisted.vault.length === 1 && persisted.vault[0].id === liveVaultItem.id,
        "sanitized vault must persist on load");
      assert(manager.readCondition("pilot.vault.itemCount") === 1,
        "derived vault count must read the authoritative active profile");
      manager.storeItems([{ id: "new-live", catalogId: "last-wake-codex", value: 89 }]);
      assert(manager.readCondition("pilot.vault.itemCount") === 2,
        "derived vault count must follow authoritative vault changes without a mirror");
    } finally {
      delete global.localStorage;
    }
  });

  await runner.run("No-profile legacy vault migration sanitizes retired artifacts before persisting slot 0", async () => {
    const retired = { id: "legacy-retired", catalogId: "burn-canister", value: 77 };
    const liveVaultItem = { id: "legacy-live", catalogId: "event-horizon-keel", value: 143 };
    const legacyVault = {
      exoticMatter: 4096,
      items: [retired, liveVaultItem],
      totalExtractions: 9,
      totalItemsSold: 4,
      bestSurvivalTime: 321,
    };
    const storage = new Map([["lbh_vault", JSON.stringify(legacyVault)]]);
    global.localStorage = {
      getItem: (key) => storage.get(key) ?? null,
      setItem: (key, value) => storage.set(key, String(value)),
      removeItem: (key) => storage.delete(key),
    };

    try {
      const { ProfileManager } = await loadProfileModule();
      const manager = new ProfileManager();
      const profile = manager.loadProfile(0);
      assert(profile.exoticMatter === legacyVault.exoticMatter,
        "legacy migration must preserve exotic matter");
      assert(profile.totalExtractions === legacyVault.totalExtractions
        && profile.totalItemsSold === legacyVault.totalItemsSold
        && profile.bestSurvivalTime === legacyVault.bestSurvivalTime,
      "legacy migration must preserve unrelated vault-era progress");
      assert(profile.vault.length === 1 && profile.vault[0].id === liveVaultItem.id,
        "legacy migration must retain live items and remove retired artifacts");

      const persisted = JSON.parse(storage.get("lbh_profile_0"));
      assert(persisted.vault.length === 1 && persisted.vault[0].id === liveVaultItem.id,
        "persisted migrated slot must not retain retired artifacts");
      assert(storage.get("lbh_vault") === undefined,
        "legacy vault key must be cleared after migration");
      const index = JSON.parse(storage.get("lbh_profiles_index"));
      assert(index.slots[0]?.name === profile.name && index.lastActive === 0,
        "migrated profile must be indexed as the active slot");
    } finally {
      delete global.localStorage;
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
