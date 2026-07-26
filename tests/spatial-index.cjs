const { TestRunner, assert } = require("./helpers.cjs");
const { BODY_MASKS } = require("../scripts/sim/body-masks.cjs");
const { BodyRegistry } = require("../scripts/sim/body-registry.cjs");
const { SpatialIndex, worldDelta, worldDistance } = require("../scripts/sim/spatial-index.cjs");

function addBody(registry, index, body, tick = 1) {
  const handle = registry.createBody(body, { tick });
  registry.setLifecycle(handle, body.lifecycle?.state || "alive", { tick: tick + 1 });
  index.upsert(registry.getBody(handle));
  return handle;
}

async function run() {
  const runner = new TestRunner("SpatialIndex");

  await runner.run("queryCircle wraps across toroidal world edges", async () => {
    const registry = new BodyRegistry({ worldScale: 4 });
    const index = new SpatialIndex({ worldScale: 4, cellSize: 0.5 });
    addBody(registry, index, {
      id: "wreck:edge",
      category: "wreck",
      wx: 3.92,
      wy: 2,
      radius: 0.05,
      collisionMask: BODY_MASKS.WRECK,
    });
    addBody(registry, index, {
      id: "wreck:far",
      category: "wreck",
      wx: 2,
      wy: 2,
      radius: 0.05,
      collisionMask: BODY_MASKS.WRECK,
    });

    const hits = index.queryCircle(0.08, 2, 0.25, { collisionMask: BODY_MASKS.WRECK });
    assert(hits.length === 1, `Expected one wrapped hit, got ${hits.map((hit) => hit.id).join(", ")}`);
    assert(hits[0].id === "wreck:edge", `Expected wrapped edge wreck, got ${hits[0].id}`);
    assert(Math.abs(hits[0].distance - 0.16) < 1e-12, `Expected wrapped distance 0.16, got ${hits[0].distance}`);
    assert(worldDelta(0, 2, 4) === 2 && worldDelta(2, 0, 4) === -2, "Expected signed half-world ties");
    assert(worldDelta(0, 25, 10) === 15, "Expected exported delta to apply one seam correction");
    assert(worldDelta(0, 1, 0) === 1 && worldDistance(0, 0, 3, 4, 0) === 5,
      "Expected exported geometry to preserve invalid-scale arithmetic");
    assert(index.queryCircle(NaN, 0, 1).length === 0, "Expected invalid query coordinates to stay empty");
  });

  await runner.run("quantizes non-divisible cell sizes to preserve the toroidal period", async () => {
    const registry = new BodyRegistry({ worldScale: 10 });
    const index = new SpatialIndex({ worldScale: 10, cellSize: 0.45 });
    addBody(registry, index, {
      id: "wreck:seam",
      category: "wreck",
      wx: 0.1,
      wy: 5,
      radius: 0.01,
      interactionMask: BODY_MASKS.PICKUP,
    });

    const stats = index.stats();
    assert(Math.abs(stats.columns * stats.cellSize - stats.worldScale) < 1e-12,
      `Expected exact grid period, got ${stats.columns} * ${stats.cellSize} vs ${stats.worldScale}`);
    assert(stats.requestedCellSize === 0.45, `Expected requested cell size to stay inspectable, got ${stats.requestedCellSize}`);

    const hits = index.queryCircle({ wx: 9.9, wy: 5, radius: 0.35, interactionMask: BODY_MASKS.PICKUP });
    assert(hits.length === 1 && hits[0].id === "wreck:seam",
      `Expected wrapped seam hit with non-divisible cell size, got ${hits.map((hit) => hit.id).join(",")}`);
  });

  await runner.run("non-divisible cell sizes wrap on both axes", async () => {
    const registry = new BodyRegistry({ worldScale: 5 });
    const index = new SpatialIndex({ worldScale: 5, cellSize: 0.32 });
    addBody(registry, index, {
      id: "star:corner",
      category: "star",
      wx: 0.06,
      wy: 0.08,
      radius: 0.015,
      collisionMask: BODY_MASKS.STAR,
    });

    const hits = index.queryAABB(4.94, 4.93, 0.16, 0.18, { collisionMask: BODY_MASKS.STAR });
    assert(hits.length === 1 && hits[0].id === "star:corner",
      `Expected wrapped corner hit with snapped cell size, got ${hits.map((hit) => hit.id).join(",")}`);
  });

  await runner.run("queryCircle filters masks and orders by distance then public id", async () => {
    const registry = new BodyRegistry({ worldScale: 3 });
    const index = new SpatialIndex({ worldScale: 3, cellSize: 0.4 });
    addBody(registry, index, {
      id: "portal:zeta",
      category: "portal",
      wx: 1.2,
      wy: 1,
      radius: 0.02,
      collisionMask: BODY_MASKS.PORTAL,
      interactionMask: BODY_MASKS.PORTAL,
    });
    addBody(registry, index, {
      id: "portal:alpha",
      category: "portal",
      wx: 0.8,
      wy: 1,
      radius: 0.02,
      collisionMask: BODY_MASKS.PORTAL,
      interactionMask: BODY_MASKS.PORTAL,
    });
    addBody(registry, index, {
      id: "wreck:closer",
      category: "wreck",
      wx: 1.05,
      wy: 1,
      radius: 0.02,
      collisionMask: BODY_MASKS.WRECK,
      interactionMask: BODY_MASKS.PICKUP,
    });

    const portalHits = index.queryCircle(1, 1, 0.3, { interactionMask: BODY_MASKS.PORTAL });
    assert(portalHits.map((hit) => hit.id).join(",") === "portal:alpha,portal:zeta",
      `Expected deterministic id tie-break, got ${portalHits.map((hit) => hit.id).join(",")}`);

    const pickupHits = index.queryCircle(1, 1, 0.3, { mask: BODY_MASKS.PICKUP });
    assert(pickupHits.length === 1 && pickupHits[0].id === "wreck:closer",
      `Expected pickup mask to isolate wreck, got ${pickupHits.map((hit) => hit.id).join(",")}`);
    assert(index.stats().maskRejects >= 2, "Expected mask reject stats to increment");
  });

  await runner.run("queryAABB finds wrapped boxes and excludes inactive lifecycle states", async () => {
    const registry = new BodyRegistry({ worldScale: 2 });
    const index = new SpatialIndex({ worldScale: 2, cellSize: 0.25 });
    addBody(registry, index, {
      id: "star:edge",
      category: "star",
      wx: 1.95,
      wy: 0.12,
      radius: 0.04,
      collisionMask: BODY_MASKS.STAR,
    });
    const dead = addBody(registry, index, {
      id: "star:dead",
      category: "star",
      wx: 0.1,
      wy: 0.1,
      radius: 0.04,
      collisionMask: BODY_MASKS.STAR,
    });
    registry.setLifecycle(dead, "dead", { tick: 5 });
    index.upsert(registry.getBody(dead));

    const hits = index.queryAABB(0.05, 0.1, 0.12, 0.08, { collisionMask: BODY_MASKS.STAR });
    assert(hits.length === 1, `Expected one active wrapped star, got ${hits.map((hit) => hit.id).join(", ")}`);
    assert(hits[0].id === "star:edge", `Expected edge star, got ${hits[0].id}`);

    const debugHits = index.queryAABB(0.05, 0.1, 0.12, 0.08, {
      collisionMask: BODY_MASKS.STAR,
      lifecycleStates: ["alive", "dead"],
    });
    assert(debugHits.map((hit) => hit.id).join(",") === "star:dead,star:edge",
      `Expected debug lifecycle override ordering, got ${debugHits.map((hit) => hit.id).join(",")}`);
    assert(index.stats().stateRejects >= 1, "Expected inactive lifecycle reject stat");
  });

  await runner.run("nearest limits results with deterministic distance ordering", async () => {
    const registry = new BodyRegistry({ worldScale: 5 });
    const index = new SpatialIndex({ worldScale: 5, cellSize: 0.5 });
    addBody(registry, index, { id: "ai:two", wx: 2.1, wy: 2, radius: 0.02, collisionMask: BODY_MASKS.AI });
    addBody(registry, index, { id: "ai:one", wx: 1.9, wy: 2, radius: 0.02, collisionMask: BODY_MASKS.AI });
    addBody(registry, index, { id: "ai:far", wx: 3, wy: 3, radius: 0.02, collisionMask: BODY_MASKS.AI });

    const nearest = index.nearest(2, 2, { collisionMask: BODY_MASKS.AI, limit: 2 });
    assert(nearest.map((hit) => hit.id).join(",") === "ai:one,ai:two",
      `Expected nearest tie by public id, got ${nearest.map((hit) => hit.id).join(",")}`);
    assert(index.stats().queryCount >= 1, "Expected query stats to increment");
    assert(index.stats().candidateCount >= 2, "Expected candidate stats to increment");
  });

  const allPassed = runner.summary();
  process.exit(allPassed ? 0 : 1);
}

run().catch((err) => {
  console.error("SpatialIndex test fatal error:", err.message);
  process.exit(1);
});
