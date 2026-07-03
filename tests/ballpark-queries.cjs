const { TestRunner, assert, startSimServer, stopSimServer } = require("./helpers.cjs");
const { BODY_MASKS } = require("../scripts/sim/body-masks.cjs");
const { createBallparkMirror } = require("../scripts/sim/ballpark-mirror.cjs");
const { collectNearestBodies, collectRelevantBodies } = require("../scripts/sim/sim-queries.cjs");

const SIM_PORT = 8804;
const SIM_URL = `http://127.0.0.1:${SIM_PORT}`;

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
      wells: [],
      stars: [
        { id: "near", wx: 2.1, wy: 2, radius: 0.03, alive: true },
        { id: "radius-edge", wx: 2.25, wy: 2, radius: 0.2, alive: true },
      ],
      wrecks: [],
      portals: [
        { id: "blocked", wx: 2.05, wy: 2, alive: true, blockedByInhibitor: true },
        { id: "open", wx: 2.2, wy: 2, alive: true },
      ],
      planetoids: [],
      scavengers: [],
      sentries: [],
      fauna: [],
    },
  };
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
        body: JSON.stringify({ clientId: "ballpark-query-test", name: "Ballpark Query Test" }),
      });
      assert(join.status === 200 && join.body.ok === true, `Expected join success, got ${join.status}`);

      const health = await waitForHealth((body) => (
        body.ballparkRelevance?.mode === "ballpark"
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
