const { TestRunner, assert, startSimServer, stopSimServer } = require("./helpers.cjs");
const { BODY_MASKS } = require("../scripts/sim/body-masks.cjs");
const { createBallparkMirror } = require("../scripts/sim/ballpark-mirror.cjs");

const SIM_PORT = 8797;
const SIM_URL = `http://127.0.0.1:${SIM_PORT}`;

async function getJson(path, options) {
  const response = await fetch(`${SIM_URL}${path}`, options);
  const body = await response.json();
  return { status: response.status, body };
}

function fakeRuntime() {
  return {
    tick: 42,
    simTime: 12.5,
    session: { worldScale: 4, flowFieldCellSize: 0.5 },
    players: new Map([
      ["greg", { clientId: "greg", status: "alive", wx: 0.4, wy: 0.5, vx: 0.01, vy: 0, hullType: "drifter" }],
    ]),
    waveRings: [
      { id: "alpha", sourceWX: 1.5, sourceWY: 1.5, radius: 0.4, amplitude: 0.2, initialAmplitude: 0.4, alive: true },
    ],
    inhibitor: { form: 2, wx: 2.5, wy: 2.5, vx: 0, vy: 0, radius: 0.18, intensity: 0.7, pressure: 0.9 },
    mapState: {
      worldScale: 4,
      wells: [{ id: "maw", wx: 2, wy: 2, mass: 2, killRadius: 0.12, ringOuter: 0.35 }],
      stars: [{ id: "edge-star", wx: 3.96, wy: 2, mass: 1, alive: true }],
      wrecks: [
        { id: "vault", wx: 1, wy: 1, vx: 0, vy: 0, loot: [{ id: "x" }], alive: true },
        { id: "vault", wx: 1.2, wy: 1, vx: 0, vy: 0, loot: [], alive: true, looted: true },
      ],
      portals: [{ id: "exit", wx: 3, wy: 0.5, type: "standard", alive: true, captureRadius: 0.08 }],
      planetoids: [{ id: "drifter", wx: 0.2, wy: 3.5, vx: 0.02, vy: -0.01, alive: true }],
      scavengers: [{ id: "scav-a", wx: 3.5, wy: 3.5, vx: 0, vy: 0, alive: true, state: "drift", archetype: "vulture" }],
      sentries: [{ id: "sentry-a", wx: 2.4, wy: 2.3, alive: true, state: "patrol", wellId: "maw" }],
      fauna: [{ id: "jelly-a", type: "jelly", wx: 0.8, wy: 2.8, vx: 0, vy: 0, alive: true }],
    },
  };
}

async function run() {
  const runner = new TestRunner("BallparkMirror");

  await runner.run("Mirrors all runtime families into body categories", async () => {
    const mirror = createBallparkMirror({ worldScale: 4, cellSize: 0.5 });
    const stats = mirror.rebuildFromRuntime(fakeRuntime(), { reason: "test" });

    assert(stats.schemaVersion === 1, `Expected body schema v1, got ${stats.schemaVersion}`);
    assert(stats.bodyCount === 12, `Expected 12 mirrored bodies, got ${stats.bodyCount}`);
    assert(stats.activeBodyCount === 11, `Expected looted wreck to be inactive, got ${stats.activeBodyCount} active bodies`);
    for (const category of [
      "player",
      "well",
      "star",
      "wreck",
      "portal",
      "planetoid",
      "scavenger",
      "sentry",
      "fauna",
      "wave",
      "inhibitor",
    ]) {
      assert(stats.categories[category] >= 1, `Expected category ${category} in ${JSON.stringify(stats.categories)}`);
    }
    assert(stats.categories.wreck === 2, `Expected duplicate wrecks to stay mirrored, got ${stats.categories.wreck}`);
    assert(stats.duplicateIds.length === 1 && stats.duplicateIds[0] === "wreck:vault",
      `Expected duplicate source id to be recorded, got ${JSON.stringify(stats.duplicateIds)}`);
  });

  await runner.run("Provides wrapped spatial queries over mirrored bodies", async () => {
    const mirror = createBallparkMirror({ worldScale: 4, cellSize: 0.5 });
    mirror.rebuildFromRuntime(fakeRuntime(), { reason: "query-test" });

    const starHits = mirror.queryCircle(0.04, 2, 0.12, { collisionMask: BODY_MASKS.STAR });
    assert(starHits.length === 1, `Expected one wrapped star hit, got ${starHits.map((hit) => hit.id).join(",")}`);
    assert(starHits[0].id === "star:edge-star", `Expected edge star hit, got ${starHits[0].id}`);

    const pickupHits = mirror.queryCircle(1.05, 1, 0.15, { interactionMask: BODY_MASKS.PICKUP });
    assert(pickupHits.length === 1, `Expected one active pickup hit, got ${pickupHits.map((hit) => hit.id).join(",")}`);
    assert(pickupHits.every((hit) => hit.category === "wreck"), "Expected pickup query to isolate wreck bodies");
  });

  await runner.run("Live sim exposes Ballpark health without changing snapshots", async () => {
    await startSimServer(SIM_PORT, { keepAlive: true });
    try {
      const start = await getJson("/session/start", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          mapId: "shallows",
          requesterId: "ballpark-test",
          requesterName: "Ballpark Test",
          seed: 7303,
        }),
      });
      assert(start.status === 200 && start.body.ok === true, `Expected start success, got ${start.status}`);

      const join = await getJson("/join", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ clientId: "ballpark-test", name: "Ballpark Test" }),
      });
      assert(join.status === 200 && join.body.ok === true, `Expected join success, got ${join.status}`);

      const health = await getJson("/health");
      assert(health.status === 200, `Expected /health 200, got ${health.status}`);
      const snapshot = await getJson("/snapshot");
      assert(snapshot.status === 200, `Expected /snapshot 200, got ${snapshot.status}`);
      assert(!Object.prototype.hasOwnProperty.call(snapshot.body, "ballpark"), "Expected normal snapshot to avoid Ballpark debug payload");

      const ballpark = health.body.ballpark;
      assert(ballpark && ballpark.enabled === true, `Expected health.ballpark payload, got ${JSON.stringify(ballpark)}`);
      assert(ballpark.categories.player === 1, `Expected one human player body, got ${JSON.stringify(ballpark.categories)}`);
      assert(ballpark.categories.aiPlayer >= 1, `Expected AI player bodies, got ${JSON.stringify(ballpark.categories)}`);
      assert(ballpark.categories.well === snapshot.body.world.wells.length,
        `Expected mirrored wells to match snapshot wells, got ${ballpark.categories.well} vs ${snapshot.body.world.wells.length}`);
      assert(ballpark.categories.star === snapshot.body.world.stars.length,
        `Expected mirrored stars to match snapshot stars, got ${ballpark.categories.star} vs ${snapshot.body.world.stars.length}`);
      assert(ballpark.categories.wreck === snapshot.body.world.wrecks.length,
        `Expected mirrored wrecks to match snapshot wrecks, got ${ballpark.categories.wreck} vs ${snapshot.body.world.wrecks.length}`);
      assert(ballpark.categories.scavenger === snapshot.body.world.scavengers.length,
        `Expected mirrored scavengers to match snapshot scavengers, got ${ballpark.categories.scavenger} vs ${snapshot.body.world.scavengers.length}`);

      const debug = await getJson("/debug/ballpark");
      assert(debug.status === 200 && debug.body.ballpark.bodyCount === ballpark.bodyCount,
        "Expected /debug/ballpark to report current mirror stats");
    } finally {
      await stopSimServer(SIM_PORT).catch(() => null);
    }
  });

  const allPassed = runner.summary();
  process.exit(allPassed ? 0 : 1);
}

run().catch(async (err) => {
  await stopSimServer(SIM_PORT).catch(() => null);
  console.error("BallparkMirror test fatal error:", err.message);
  process.exit(1);
});
