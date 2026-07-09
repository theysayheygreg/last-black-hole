const {
  TestRunner,
  assert,
  startSimServer,
  stopSimServer,
} = require("./helpers.cjs");
const seeded = require("../scripts/seeded-generation.cjs");
const catalog = require("../scripts/content/items.cjs");

const SIM_PORT = 8811;
const SIM_URL = `http://127.0.0.1:${SIM_PORT}`;

function constantRng(value) {
  return () => value;
}

function assertCatalogIdentity(item, sourceCatalog) {
  const source = sourceCatalog.find((entry) => entry.id === item.catalogId);
  assert(source, `Expected ${item.catalogId} in the shared item catalog`);
  assert(item.id === source.id, `Expected catalog id ${source.id}, got ${item.id}`);
  assert(item.name === source.name, `Expected catalog name ${source.name}, got ${item.name}`);
  assert(item.tier === source.tier, `Expected catalog tier ${source.tier}, got ${item.tier}`);
}

function assertInventoryShape(item) {
  assert(item.category === "artifact", `Expected artifact category, got ${item.category}`);
  assert(["equippable", "consumable"].includes(item.subcategory),
    `Expected inventory subcategory, got ${item.subcategory}`);
  assert(typeof item.catalogId === "string", "Expected catalogId");
  assert(Number.isFinite(item.value), `Expected finite value, got ${item.value}`);
  assert(item.baseValue === item.value, `Expected base value ${item.value}, got ${item.baseValue}`);
}

async function requestJson(path, options) {
  const response = await fetch(`${SIM_URL}${path}`, options);
  return { status: response.status, body: await response.json() };
}

async function postJson(path, body) {
  return requestJson(path, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

async function waitForSnapshot(predicate, timeoutMs = 5000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const { body } = await requestJson("/snapshot");
    if (predicate(body)) return body;
    await new Promise((resolve) => setTimeout(resolve, 75));
  }
  throw new Error("Timed out waiting for authoritative item state");
}

async function run() {
  const runner = new TestRunner("AuthoritativeItemShape");

  await runner.run("Seeded artifacts satisfy the inventory and equip contract", async () => {
    const item = seeded.rollItem(constantRng(0), 1);

    assertCatalogIdentity(item, catalog.ITEM_CATALOG[1]);
    assertInventoryShape(item);
    assert(item.subcategory === "equippable", `Expected equippable subcategory, got ${item.subcategory}`);
    assert(typeof item.effectDesc === "string", "Expected artifact effect description");
    assert(item.coefficients === catalog.ITEM_CATALOG[1][0].coefficients,
      "Expected the authoritative item to retain catalog coefficients");
  });

  await runner.run("Seeded consumables satisfy the inventory and load contract", async () => {
    const item = seeded.rollConsumable(constantRng(0), 240);

    assertCatalogIdentity(item, catalog.CONSUMABLE_CATALOG);
    assertInventoryShape(item);
    assert(item.subcategory === "consumable", `Expected consumable subcategory, got ${item.subcategory}`);
    assert(item.useEffect === item.effect, `Expected useEffect ${item.effect}, got ${item.useEffect}`);
    assert(item.useDesc === item.effect, `Expected useDesc ${item.effect}, got ${item.useDesc}`);
    assert(item.charges === 1, `Expected one charge, got ${item.charges}`);
  });

  await runner.run("Wreck loot never emits raw catalog-only item shapes", async () => {
    const values = [0, 0, 0, 0, 0];
    let index = 0;
    const loot = seeded.generateWreckLoot(() => values[index++] ?? 0, 240, 2, 1);

    assert(loot.length === 3, `Expected two artifacts plus one consumable, got ${loot.length}`);
    assert(loot.every((item) => item.category === "artifact"), "Expected every wreck item to carry category");
    assert(loot.every((item) => typeof item.catalogId === "string"), "Expected every wreck item to carry catalogId");
    assert(loot.every((item) => Number.isFinite(item.baseValue)), "Expected every wreck item to carry baseValue");
    assert(loot.filter((item) => item.subcategory === "equippable").length === 2,
      "Expected artifact slots to remain equippable");
    assert(loot.filter((item) => item.subcategory === "consumable").length === 1,
      "Expected the bonus consumable to remain loadable");
  });

  await runner.run("Authoritative wreck loot keeps its shape after pickup into cargo", async () => {
    await startSimServer(SIM_PORT, { keepAlive: true });
    try {
      const start = await postJson("/session/start", {
        mapId: "shallows",
        requesterId: "item-shape-test",
        requesterName: "Item Shape Test",
        seed: 7303,
      });
      assert(start.status === 200 && start.body.ok === true, `Expected session start, got ${start.status}`);

      const join = await postJson("/join", { clientId: "item-shape-test", name: "Item Shape Test" });
      assert(join.status === 200 && join.body.ok === true, `Expected player join, got ${join.status}`);

      const before = await waitForSnapshot((snapshot) => snapshot.world?.wrecks?.some((wreck) => wreck.loot?.length));
      const wreck = before.world.wrecks.find((entry) => entry.loot?.length);
      assertInventoryShape(wreck.loot[0]);

      const moved = await postJson("/debug/player-state", {
        clientId: "item-shape-test",
        wx: wreck.wx,
        wy: wreck.wy,
        vx: 0,
        vy: 0,
        status: "alive",
        signalLevel: 0,
      });
      assert(moved.status === 200 && moved.body.ok === true, `Expected debug move, got ${moved.status}`);

      const after = await waitForSnapshot((snapshot) => {
        const player = snapshot.players?.find((entry) => entry.clientId === "item-shape-test");
        return player?.cargo?.some(Boolean);
      });
      const cargoItem = after.players.find((entry) => entry.clientId === "item-shape-test").cargo.find(Boolean);
      assertInventoryShape(cargoItem);
      assert(typeof cargoItem.id === "string", "Expected cargo to retain its catalog item id");
    } finally {
      await stopSimServer(SIM_PORT).catch(() => null);
    }
  });

  const allPassed = runner.summary();
  process.exit(allPassed ? 0 : 1);
}

run().catch((error) => {
  stopSimServer(SIM_PORT).catch(() => null);
  console.error("Authoritative item shape test fatal error:", error.stack || error.message);
  process.exit(1);
});
