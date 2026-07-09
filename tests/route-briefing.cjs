/**
 * route-briefing.cjs — Preview, map registry, and launched-session truth.
 */
const path = require("path");
const { pathToFileURL } = require("url");
const { startSimServer, stopSimServer, TestRunner, assert } = require("./helpers.cjs");
const { loadPlayableMaps } = require("../scripts/shared-map-loader.cjs");

const ROOT = path.join(__dirname, "..");
const SIM_PORT = 8796;
const SIM_URL = `http://127.0.0.1:${SIM_PORT}`;

async function getJson(route, options) {
  const response = await fetch(`${SIM_URL}${route}`, options);
  return { status: response.status, body: await response.json() };
}

function itemIdentity(item) {
  return {
    id: item?.id || item?.catalogId || null,
    name: item?.name || null,
    tier: item?.tier ?? null,
    value: item?.value ?? null,
  };
}

function assertRouteAnchors(map) {
  const entityLists = {
    well: map.wells,
    wreck: map.wrecks,
    star: map.stars,
  };
  for (const stage of map.route.stages) {
    if (!stage.anchor) continue;
    const list = entityLists[stage.anchor.entity];
    assert(Array.isArray(list), `${map.id}/${stage.id}: unknown anchor family ${stage.anchor.entity}`);
    assert(Number.isInteger(stage.anchor.index) && list[stage.anchor.index],
      `${map.id}/${stage.id}: anchor index is outside authoritative map content`);
  }
}

async function run() {
  const runner = new TestRunner("RouteBriefing");
  const signatureModule = await import(pathToFileURL(path.join(ROOT, "src", "signatures.js")).href);
  const browserMaps = {
    shallows: (await import(pathToFileURL(path.join(ROOT, "src", "maps", "shallows-3x3.js")).href)).MAP,
    expanse: (await import(pathToFileURL(path.join(ROOT, "src", "maps", "expanse-5x5.js")).href)).MAP,
    "deep-field": (await import(pathToFileURL(path.join(ROOT, "src", "maps", "deep-field-10x10.js")).href)).MAP,
  };
  const authoritativeMaps = loadPlayableMaps();

  await runner.run("maps expose distinct, anchored cyan route identities", async () => {
    const routeIds = new Set();
    for (const [mapId, map] of Object.entries(authoritativeMaps)) {
      assert(map.route && map.route.id, `${mapId}: missing route`);
      assert(map.route.portalPalette === "cyan", `${mapId}: route portal palette must be cyan`);
      assert(!JSON.stringify(map.route).toLowerCase().includes("magenta"),
        `${mapId}: route metadata trespassed on Inhibitor/corruption magenta`);
      assert(typeof map.route.objective === "string" && map.route.objective.length > 20,
        `${mapId}: route objective is too vague`);
      assert(Array.isArray(map.route.stages) && map.route.stages.length >= 4,
        `${mapId}: route needs a meaningful sequence`);
      assert(!routeIds.has(map.route.id), `Duplicate route identity ${map.route.id}`);
      routeIds.add(map.route.id);
      assertRouteAnchors(map);
      assert(JSON.stringify(map.route) === JSON.stringify(browserMaps[mapId].route),
        `${mapId}: browser and authoritative route metadata differ`);
    }
  });

  await runner.run("Shallows teaches movement, loot, escalation, then confirmed extraction", async () => {
    const route = authoritativeMaps.shallows.route;
    assert(route.id === "first-current", `Unexpected Shallows route ${route.id}`);
    assert(JSON.stringify(route.stages.map((stage) => stage.kind)) ===
      JSON.stringify(["slingshot", "salvage", "signal", "portal"]),
    `Shallows teaching order drifted: ${route.stages.map((stage) => stage.kind).join(" -> ")}`);
    assert(route.stages[3].confirm === true, "Shallows extraction must require explicit confirmation");
  });

  await runner.run("seed previews match every launched authoritative map", async () => {
    const seed = 731337;
    for (const [mapId, map] of Object.entries(browserMaps)) {
      await startSimServer(SIM_PORT);
      try {
        const preview = signatureModule.buildRunBriefing(map, seed);
        const start = await getJson("/session/start", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            mapId,
            seed,
            requesterId: "route-briefing-test",
            requesterName: "Route Briefing Test",
          }),
        });
        assert(start.status === 200, `${mapId}: session start failed with ${start.status}`);
        assert(start.body.session.mapId === preview.mapId, `${mapId}: preview map id disagrees with session`);
        assert(start.body.session.seed === preview.seed, `${mapId}: preview seed disagrees with session`);
        assert(JSON.stringify(start.body.session.cosmicSignature) === JSON.stringify(preview.signature),
          `${mapId}: preview signature disagrees with authority`);

        const snapshot = await getJson("/snapshot");
        const world = snapshot.body.world;
        assert(world.wells.length === preview.wellCount,
          `${mapId}: preview well count ${preview.wellCount} != authority ${world.wells.length}`);
        assert(JSON.stringify(world.wells.map((well) => well.name)) === JSON.stringify(preview.wellNames),
          `${mapId}: preview well names disagree with authority`);

        const initialWrecks = world.wrecks.slice(0, preview.initialWrecks.length);
        assert(initialWrecks.length === preview.initialWrecks.length,
          `${mapId}: initial wreck count disagrees with preview`);
        initialWrecks.forEach((wreck, index) => {
          assert(JSON.stringify(wreck.loot.map(itemIdentity)) ===
            JSON.stringify(preview.initialWrecks[index].loot.map(itemIdentity)),
          `${mapId}: initial wreck ${index} loot disagrees with preview`);
        });
      } finally {
        await stopSimServer(SIM_PORT);
      }
    }
  });

  const allPassed = runner.summary();
  process.exit(allPassed ? 0 : 1);
}

run().catch(async (err) => {
  console.error("RouteBriefing test fatal error:", err.stack || err.message);
  try { await stopSimServer(SIM_PORT); } catch {}
  process.exit(1);
});
