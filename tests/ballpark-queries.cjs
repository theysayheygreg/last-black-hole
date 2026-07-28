const { TestRunner, assert, startSimServer, stopSimServer } = require("./helpers.cjs");
const { BODY_MASKS } = require("../scripts/sim/body-masks.cjs");
const { createBallparkMirror } = require("../scripts/sim/ballpark-mirror.cjs");
const { collectNearestBodies, collectRelevantBodies } = require("../scripts/sim/sim-queries.cjs");

const SIM_PORT = 8804;
const SIM_URL = `http://127.0.0.1:${SIM_PORT}`;
const EPSILON = 1e-9;

async function getJson(path, options) {
  const response = await fetch(`${SIM_URL}${path}`, options);
  const body = await response.json();
  return { status: response.status, body };
}

async function waitForHealth(predicate, timeoutMs = 3500) {
  const deadline = Date.now() + timeoutMs;
  let lastHealth = null;
  while (Date.now() < deadline) {
    const health = await getJson("/health");
    lastHealth = health.body;
    if (health.status === 200 && predicate(health.body)) return health.body;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`Timed out waiting for health predicate. Last health: ${JSON.stringify(lastHealth)}`);
}

function fakeQueryRuntime() {
  return {
    tick: 7,
    simTime: 1.5,
    session: { worldScale: 4, flowFieldCellSize: 0.5 },
    players: new Map(),
    waveRings: [],
    inhibitor: null,
    mapState: {
      worldScale: 4,
      wells: [
        { id: "well-far", wx: 2.9, wy: 2, killRadius: 0.07, mass: 1, alive: true },
        { id: "well-near", wx: 2.12, wy: 2, killRadius: 0.07, mass: 1, alive: true },
      ],
      stars: [
        { id: "near", wx: 2.1, wy: 2, radius: 0.03, alive: true },
        { id: "radius-edge", wx: 2.25, wy: 2, radius: 0.2, alive: true },
      ],
      wrecks: [
        { id: "looted", wx: 2.03, wy: 2, alive: true, looted: true, pickupCooldown: 0, loot: [] },
        { id: "cooldown", wx: 2.04, wy: 2, alive: true, looted: false, pickupCooldown: 2, loot: [{ id: "cool" }] },
        { id: "pickup-near", wx: 2.06, wy: 2, alive: true, looted: false, pickupCooldown: 0, loot: [{ id: "a" }] },
        { id: "pickup-far", wx: 2.4, wy: 2, alive: true, looted: false, pickupCooldown: 0, loot: [{ id: "b" }] },
      ],
      portals: [
        { id: "closed", wx: 2.05, wy: 2, alive: false },
        { id: "open", wx: 2.2, wy: 2, alive: true },
      ],
      planetoids: [],
      scavengers: [],
      sentries: [],
      fauna: [],
    },
  };
}

function fakeWrappedRuntime() {
  return {
    tick: 8,
    simTime: 1.75,
    session: { worldScale: 4, flowFieldCellSize: 0.5 },
    players: new Map(),
    waveRings: [],
    inhibitor: null,
    mapState: {
      worldScale: 4,
      wells: [
        { id: "center-well", wx: 2.2, wy: 2, killRadius: 0.07, mass: 1, alive: true },
        { id: "wrapped-well", wx: 3.96, wy: 2, killRadius: 0.07, mass: 1, alive: true },
      ],
      stars: [],
      wrecks: [
        { id: "center-wreck", wx: 2.1, wy: 2, alive: true, looted: false, pickupCooldown: 0, loot: [{ id: "c" }] },
        { id: "wrapped-wreck", wx: 3.95, wy: 2, alive: true, looted: false, pickupCooldown: 0, loot: [{ id: "d" }] },
      ],
      portals: [
        { id: "center-portal", wx: 2.25, wy: 2, alive: true },
        { id: "wrapped-portal", wx: 3.94, wy: 2, alive: true },
      ],
      planetoids: [],
      scavengers: [],
      sentries: [],
      fauna: [],
    },
  };
}

function worldDisplacement(from, to, worldScale) {
  let delta = to - from;
  if (delta > worldScale / 2) delta -= worldScale;
  if (delta < -worldScale / 2) delta += worldScale;
  return delta;
}

function worldDistance(ax, ay, bx, by, worldScale) {
  return Math.hypot(
    worldDisplacement(ax, bx, worldScale),
    worldDisplacement(ay, by, worldScale),
  );
}

function legacyNearest(origin, entities, limit, worldScale, predicate = () => true) {
  return entities
    .filter((entity) => entity && predicate(entity))
    .map((entity) => ({
      entity,
      dist: worldDistance(origin.wx, origin.wy, entity.wx, entity.wy, worldScale),
    }))
    .sort((a, b) => a.dist - b.dist)
    .slice(0, Math.max(1, Math.trunc(limit || 1)));
}

function nearestSourceIds(result) {
  return result.bodies.map((hit) => hit.sourceId);
}

function assertNearestParity(label, legacy, result) {
  const legacyIds = legacy.map(({ entity }) => entity.id);
  const ballparkIds = nearestSourceIds(result);
  assert(
    JSON.stringify(ballparkIds) === JSON.stringify(legacyIds),
    `${label} expected ids ${legacyIds.join(",")}, got ${ballparkIds.join(",")}`,
  );
  for (let i = 0; i < legacy.length; i += 1) {
    const ballparkDistance = result.bodies[i]?.distance;
    assert(
      Math.abs(ballparkDistance - legacy[i].dist) <= EPSILON,
      `${label} expected distance ${legacy[i].dist}, got ${ballparkDistance}`,
    );
  }
}

async function run() {
  const runner = new TestRunner("BallparkQueries");

  await runner.run("Collects relevance by center distance, not inflated body radius", async () => {
    const mirror = createBallparkMirror({ worldScale: 4, cellSize: 0.5 });
    mirror.rebuildFromRuntime(fakeQueryRuntime(), { reason: "query-test" });

    const { bodies, stats } = collectRelevantBodies(mirror, [{ wx: 2, wy: 2 }], {
      category: "star",
      radius: 0.2,
      perOriginLimit: 5,
      query: { collisionMask: BODY_MASKS.STAR },
    });

    assert(bodies.length === 1, `Expected one center-distance star, got ${bodies.map((hit) => hit.id).join(",")}`);
    assert(bodies[0].sourceId === "near", `Expected near star, got ${bodies[0].sourceId}`);
    assert(stats.radiusRejects === 1, `Expected radius-edge candidate to be rejected, got ${JSON.stringify(stats)}`);
    assert(mirror.stats().queryUsage.queryCircleCount === 1, "Expected mirror query usage to record helper query");
  });

  await runner.run("One stable origin preserves full-world relevance order", async () => {
    const runtime = fakeQueryRuntime();
    const mirror = createBallparkMirror({ worldScale: 4, cellSize: 0.5 });
    mirror.rebuildFromRuntime(runtime, { reason: "full-world-query-test" });
    const origins = [{ wx: 2, wy: 2 }, { wx: 3.8, wy: 0.2 }, { wx: 0.1, wy: 3.9 }];
    const options = {
      category: "wreck",
      radius: runtime.session.worldScale,
      perOriginLimit: runtime.mapState.wrecks.length,
      query: { interactionMask: BODY_MASKS.PICKUP },
    };

    const repeated = collectRelevantBodies(mirror, origins, options);
    const stable = collectRelevantBodies(mirror, [origins[0]], options);
    assert(
      JSON.stringify(nearestSourceIds(stable)) === JSON.stringify(nearestSourceIds(repeated)),
      `Expected stable full-world order ${nearestSourceIds(repeated)}, got ${nearestSourceIds(stable)}`,
    );
    assert(repeated.stats.queryCount === origins.length,
      `Expected repeated query count ${origins.length}, got ${repeated.stats.queryCount}`);
    assert(stable.stats.queryCount === 1, `Expected one stable-origin query, got ${stable.stats.queryCount}`);
  });

  await runner.run("Collects nearest available bodies with lifecycle filtering", async () => {
    const mirror = createBallparkMirror({ worldScale: 4, cellSize: 0.5 });
    mirror.rebuildFromRuntime(fakeQueryRuntime(), { reason: "nearest-test" });

    const { bodies, stats } = collectNearestBodies(mirror, { wx: 2, wy: 2 }, {
      category: "portal",
      radius: 1,
      limit: 2,
      query: {
        interactionMask: BODY_MASKS.PORTAL,
        lifecycleStates: ["alive", "spawning"],
      },
    });

    assert(bodies.length === 1, `Expected one available portal, got ${bodies.map((hit) => hit.id).join(",")}`);
    assert(bodies[0].sourceId === "open", `Expected open portal, got ${bodies[0].sourceId}`);
    assert(stats.selectedCount === 1, `Expected selected count 1, got ${JSON.stringify(stats)}`);
  });

  await runner.run("Returns mutation-safe handles and immediately reflects lifecycle changes", async () => {
    const mirror = createBallparkMirror({ worldScale: 4, cellSize: 0.5 });
    mirror.rebuildFromRuntime(fakeQueryRuntime(), { tick: 7, reason: "query-handle-test" });

    const playerHandle = mirror.createBody({
      id: "player:query-pilot",
      category: "player",
      wx: 2,
      wy: 2,
      radius: 0.035,
      collisionMask: BODY_MASKS.PLAYER,
      interactionMask: [BODY_MASKS.PICKUP, BODY_MASKS.PORTAL],
      ownerId: "query-pilot",
      replicationLane: "self",
      lifecycle: { state: "alive" },
    }, { tick: 8 });
    const playerHits = mirror.queryCircle(2, 2, 0.01, { collisionMask: BODY_MASKS.PLAYER });
    assert(playerHits.length === 1 && playerHits[0].handle.epoch === playerHandle.epoch,
      `Expected query hit to expose epoch-aware handle, got ${JSON.stringify(playerHits[0]?.handle)}`);

    mirror.updateBody(playerHits[0].handle, { wx: 2.5, wy: 2.5 }, { tick: 9 });
    const movedHits = mirror.queryCircle(2.5, 2.5, 0.01, { collisionMask: BODY_MASKS.PLAYER });
    assert(movedHits.length === 1 && movedHits[0].id === "player:query-pilot",
      "Expected a query-returned handle to mutate the indexed player body");

    const wreckHit = mirror.nearest({
      wx: 2,
      wy: 2,
      radius: 0.2,
      limit: 4,
      interactionMask: BODY_MASKS.PICKUP,
      lifecycleStates: ["alive"],
    }).find((hit) => hit.id === "wreck:pickup-near");
    assert(wreckHit?.id === "wreck:pickup-near", `Expected nearest live wreck, got ${wreckHit?.id}`);
    mirror.setLifecycle(wreckHit.handle, "dead", { tick: 10 });
    const afterDeath = mirror.nearest({
      wx: 2,
      wy: 2,
      radius: 0.2,
      limit: 2,
      interactionMask: BODY_MASKS.PICKUP,
      lifecycleStates: ["alive"],
    });
    assert(afterDeath.every((hit) => hit.id !== wreckHit.id),
      "Expected lifecycle mutation to update spatial query filtering immediately");

    const portalHit = mirror.nearest({
      wx: 2,
      wy: 2,
      radius: 1,
      limit: 1,
      collisionMask: BODY_MASKS.PORTAL,
      lifecycleStates: ["alive"],
    })[0];
    assert(portalHit?.id === "portal:open", `Expected nearest open portal, got ${portalHit?.id}`);
    mirror.removeBody(portalHit.handle, { tick: 11 });
    assert(mirror.nearest({
      wx: 2,
      wy: 2,
      radius: 1,
      limit: 4,
      collisionMask: BODY_MASKS.PORTAL,
      lifecycleStates: ["alive"],
    }).length === 0, "Expected removed portal to leave load-bearing queries immediately");
  });

  await runner.run("Matches legacy nearest well, wreck, and portal selection", async () => {
    const runtime = fakeQueryRuntime();
    const origin = { wx: 2, wy: 2 };
    const mirror = createBallparkMirror({ worldScale: 4, cellSize: 0.5 });
    mirror.rebuildFromRuntime(runtime, { reason: "nearest-parity-test" });

    const wellLegacy = legacyNearest(origin, runtime.mapState.wells, 2, runtime.session.worldScale);
    const wellBallpark = collectNearestBodies(mirror, origin, {
      category: "well",
      radius: runtime.session.worldScale,
      limit: 2,
      query: { collisionMask: BODY_MASKS.WELL },
    });
    assertNearestParity("nearest wells", wellLegacy, wellBallpark);

    const wreckLegacy = legacyNearest(
      origin,
      runtime.mapState.wrecks,
      2,
      runtime.session.worldScale,
      (wreck) => wreck.alive !== false && !wreck.looted && wreck.pickupCooldown <= 0,
    );
    const wreckBallpark = collectNearestBodies(mirror, origin, {
      category: "wreck",
      radius: runtime.session.worldScale,
      limit: 4,
      query: {
        interactionMask: BODY_MASKS.PICKUP,
        lifecycleStates: ["alive", "spawning"],
      },
    });
    assertNearestParity("nearest unlooted wrecks", wreckLegacy, {
      ...wreckBallpark,
      bodies: wreckBallpark.bodies
        .filter((hit) => hit.body?.data?.looted !== true && hit.body?.data?.pickupCooldown <= 0)
        .slice(0, wreckLegacy.length),
    });

    const portalLegacy = legacyNearest(
      origin,
      runtime.mapState.portals,
      2,
      runtime.session.worldScale,
      (portal) => portal.alive !== false,
    );
    const portalBallpark = collectNearestBodies(mirror, origin, {
      category: "portal",
      radius: runtime.session.worldScale,
      limit: 2,
      query: {
        interactionMask: BODY_MASKS.PORTAL,
        lifecycleStates: ["alive", "spawning"],
      },
    });
    assertNearestParity("nearest available portals", portalLegacy, portalBallpark);
  });

  await runner.run("Matches legacy nearest selection across world wrap", async () => {
    const runtime = fakeWrappedRuntime();
    const origin = { wx: 0.03, wy: 2 };
    const mirror = createBallparkMirror({ worldScale: 4, cellSize: 0.5 });
    mirror.rebuildFromRuntime(runtime, { reason: "nearest-wrap-parity-test" });

    const wellLegacy = legacyNearest(origin, runtime.mapState.wells, 1, runtime.session.worldScale);
    const wellBallpark = collectNearestBodies(mirror, origin, {
      category: "well",
      radius: runtime.session.worldScale,
      limit: 1,
      query: { collisionMask: BODY_MASKS.WELL },
    });
    assertNearestParity("wrapped nearest well", wellLegacy, wellBallpark);

    const wreckLegacy = legacyNearest(origin, runtime.mapState.wrecks, 1, runtime.session.worldScale);
    const wreckBallpark = collectNearestBodies(mirror, origin, {
      category: "wreck",
      radius: runtime.session.worldScale,
      limit: 1,
      query: {
        interactionMask: BODY_MASKS.PICKUP,
        lifecycleStates: ["alive", "spawning"],
      },
    });
    assertNearestParity("wrapped nearest wreck", wreckLegacy, wreckBallpark);

    const portalLegacy = legacyNearest(origin, runtime.mapState.portals, 1, runtime.session.worldScale);
    const portalBallpark = collectNearestBodies(mirror, origin, {
      category: "portal",
      radius: runtime.session.worldScale,
      limit: 1,
      query: {
        interactionMask: BODY_MASKS.PORTAL,
        lifecycleStates: ["alive", "spawning"],
      },
    });
    assertNearestParity("wrapped nearest portal", portalLegacy, portalBallpark);
  });

  await runner.run("Live sim uses Ballpark for relevance without changing snapshots", async () => {
    await startSimServer(SIM_PORT, { keepAlive: true });
    try {
      const start = await getJson("/session/start", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          mapId: "shallows",
          requesterId: "ballpark-query-test",
          requesterName: "Ballpark Query Test",
          seed: 7304,
        }),
      });
      assert(start.status === 200 && start.body.ok === true, `Expected start success, got ${start.status}`);

      const join = await getJson("/join", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          runId: start.body.session.runId,
          clientId: "ballpark-query-test",
          joinTicket: start.body.joinTicket,
          name: "Ballpark Query Test",
        }),
      });
      assert(join.status === 200 && join.body.ok === true, `Expected join success, got ${join.status}`);

      const secondJoin = await getJson("/join", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          runId: start.body.session.runId,
          clientId: "ballpark-query-test-second",
          name: "Ballpark Query Test Second",
        }),
      });
      assert(secondJoin.status === 200 && secondJoin.body.ok === true,
        `Expected second join success, got ${secondJoin.status}`);

      const health = await waitForHealth((body) => (
        body.idleState?.humanPlayerCount === 2
        && body.ballparkRelevance?.mode === "ballpark"
        && body.ballpark?.queryUsage?.queryCircleCount > 0
      ));
      const snapshot = await getJson("/snapshot");
      assert(snapshot.status === 200, `Expected /snapshot 200, got ${snapshot.status}`);
      assert(!Object.prototype.hasOwnProperty.call(snapshot.body, "ballparkRelevance"),
        "Expected snapshot to avoid Ballpark relevance diagnostics");
      assert(health.ballparkRelevance.categories.star?.mode === "ballpark",
        `Expected star relevance to use Ballpark, got ${JSON.stringify(health.ballparkRelevance.categories.star)}`);
      assert(health.ballparkRelevance.categories.wreck?.mode === "ballpark",
        `Expected wreck relevance to use Ballpark, got ${JSON.stringify(health.ballparkRelevance.categories.wreck)}`);
      for (const [category, stats] of Object.entries(health.ballparkRelevance.categories)) {
        if (stats.mode !== "ballpark") continue;
        assert(stats.queryCount === 1,
          `Expected one full-world ${category} query per authority tick, got ${JSON.stringify(stats)}`);
        assert(stats.originCount === 1,
          `Expected stable authority origin for ${category}, got ${JSON.stringify(stats)}`);
        assert(stats.materializedCount === stats.selectedCount,
          `Expected every selected ${category} body to materialize, got ${JSON.stringify(stats)}`);
      }
    } finally {
      await stopSimServer(SIM_PORT).catch(() => null);
    }
  });

  const allPassed = runner.summary();
  process.exit(allPassed ? 0 : 1);
}

run().catch(async (err) => {
  await stopSimServer(SIM_PORT).catch(() => null);
  console.error("BallparkQueries test fatal error:", err.message);
  process.exit(1);
});
