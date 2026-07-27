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
    inhibitor: { phase: 2 },
    inhibitorEntities: [{
      id: "inhibitor-swarm-1", kind: "swarm", lifecycle: "alive",
      wx: 2.5, wy: 2.5, vx: 0, vy: 0, radius: 0.18, intensity: 0.7,
    }],
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
    assert(Number.isFinite(stats.lastRebuildMs) && stats.lastRebuildMs >= 0,
      `Expected finite mirror rebuild cost, got ${stats.lastRebuildMs}`);
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

  await runner.run("Keeps handles stable while updating moving bodies in place", async () => {
    const runtime = fakeRuntime();
    const mirror = createBallparkMirror({ worldScale: 4, cellSize: 0.5 });
    mirror.rebuildFromRuntime(runtime, { tick: 42, reason: "first-tick" });
    const before = mirror.getBodyById("player:greg");
    const stableHandle = { ...before.handle };

    runtime.tick = 43;
    runtime.players.get("greg").wx = 0.9;
    runtime.players.get("greg").wy = 0.75;
    mirror.rebuildFromRuntime(runtime, { tick: 43, reason: "next-tick" });

    const after = mirror.getBodyById("player:greg");
    assert(after.handle.slot === stableHandle.slot && after.handle.generation === stableHandle.generation,
      `Expected stable handle ${JSON.stringify(stableHandle)}, got ${JSON.stringify(after.handle)}`);
    assert(Math.abs(after.prevWX - 0.4) <= 1e-12 && Math.abs(after.prevWY - 0.5) <= 1e-12,
      `Expected previous position 0.4,0.5, got ${after.prevWX},${after.prevWY}`);
    assert(Math.abs(after.wx - 0.9) <= 1e-12 && Math.abs(after.wy - 0.75) <= 1e-12,
      `Expected current position 0.9,0.75, got ${after.wx},${after.wy}`);
    const movedHits = mirror.queryCircle(0.9, 0.75, 0.01, { collisionMask: BODY_MASKS.PLAYER });
    assert(movedHits.length === 1 && movedHits[0].id === "player:greg",
      `Expected spatial index at updated position, got ${movedHits.map((hit) => hit.id).join(",")}`);
    assert(mirror.stats().lastSyncMode === "incremental", "Expected matching configuration to synchronize incrementally");
  });

  await runner.run("Removes disappeared bodies and safely recycles their slots", async () => {
    const runtime = fakeRuntime();
    const mirror = createBallparkMirror({ worldScale: 4, cellSize: 0.5 });
    mirror.rebuildFromRuntime(runtime, { tick: 42, reason: "first-tick" });
    const removedHandle = { ...mirror.getBodyById("star:edge-star").handle };

    runtime.tick = 43;
    runtime.mapState.stars = [{ id: "new-star", wx: 0.25, wy: 2, mass: 1, alive: true }];
    mirror.rebuildFromRuntime(runtime, { tick: 43, reason: "next-tick" });

    assert(mirror.getBodyById("star:edge-star") === null, "Expected disappeared star to leave the registry");
    assert(mirror.registry.has(removedHandle) === false, "Expected removed handle to be stale after recycling");
    const replacement = mirror.getBodyById("star:new-star");
    assert(replacement.handle.slot === removedHandle.slot,
      `Expected deterministic slot reuse at ${removedHandle.slot}, got ${replacement.handle.slot}`);
    assert(replacement.handle.generation === removedHandle.generation + 1,
      `Expected recycled generation ${removedHandle.generation + 1}, got ${replacement.handle.generation}`);
    const oldHits = mirror.queryCircle(3.96, 2, 0.02, { collisionMask: BODY_MASKS.STAR });
    const newHits = mirror.queryCircle(0.25, 2, 0.02, { collisionMask: BODY_MASKS.STAR });
    assert(oldHits.length === 0, `Expected removed star out of the index, got ${oldHits.map((hit) => hit.id).join(",")}`);
    assert(newHits.length === 1 && newHits[0].id === "star:new-star",
      `Expected replacement star in the index, got ${newHits.map((hit) => hit.id).join(",")}`);
  });

  await runner.run("Keeps duplicate source ids unique and stable across refreshes", async () => {
    const runtime = fakeRuntime();
    const mirror = createBallparkMirror({ worldScale: 4, cellSize: 0.5 });
    const firstStats = mirror.rebuildFromRuntime(runtime, { tick: 42, reason: "first-tick" });
    const firstDuplicate = { ...mirror.getBodyById("wreck:vault#2").handle };

    runtime.tick = 43;
    const nextStats = mirror.rebuildFromRuntime(runtime, { tick: 43, reason: "next-tick" });
    const ids = mirror.registry.entries().map((body) => body.id);
    const duplicate = mirror.getBodyById("wreck:vault#2");

    assert(new Set(ids).size === ids.length, `Expected unique public ids, got ${JSON.stringify(ids)}`);
    assert(firstStats.duplicateIds.length === 1 && nextStats.duplicateIds.length === 1,
      `Expected one honest duplicate diagnostic per refresh, got ${JSON.stringify(nextStats.duplicateIds)}`);
    assert(duplicate.handle.slot === firstDuplicate.slot && duplicate.handle.generation === firstDuplicate.generation,
      `Expected duplicate-derived id handle to remain stable, got ${JSON.stringify(duplicate.handle)}`);
    assert(mirror.registry.stats().duplicateIdRejects === 0,
      `Expected collector to resolve duplicate source ids before registry insertion, got ${mirror.registry.stats().duplicateIdRejects}`);
  });

  await runner.run("Owns deterministic lifecycle identity for load-bearing body families", async () => {
    const mirror = createBallparkMirror({ worldScale: 4, cellSize: 0.5 });
    mirror.rebuildFromRuntime(fakeRuntime(), { tick: 42, reason: "identity-test" });
    const ids = ["player:greg", "wreck:vault", "portal:exit", "scavenger:scav-a", "well:maw"];
    const handles = new Map(ids.map((id) => [id, mirror.getHandleById(id)]));

    for (const id of ids) {
      const identity = mirror.getIdentity(handles.get(id));
      assert(identity?.id === id && identity.incarnation === 1,
        `Expected first incarnation for ${id}, got ${JSON.stringify(identity)}`);
      assert(identity.handle.epoch === mirror.stats().identities.epoch,
        `Expected ${id} handle to carry the live Ballpark epoch`);
    }

    mirror.updateBody(handles.get("player:greg"), { wx: 0.8, wy: 0.7 }, { tick: 43 });
    mirror.updateBody(handles.get("scavenger:scav-a"), { wx: 3.25, wy: 3.1 }, { tick: 43 });
    mirror.updateBody(handles.get("well:maw"), { mass: 3 }, { tick: 43 });
    mirror.setLifecycle(handles.get("wreck:vault"), "dying", { tick: 44 });
    mirror.setLifecycle(handles.get("wreck:vault"), "dead", { tick: 45 });
    mirror.setLifecycle(handles.get("portal:exit"), "dying", { tick: 44 });

    assert(Math.abs(mirror.getBody(handles.get("player:greg")).wx - 0.8) <= 1e-12,
      "Expected epoch-aware player handle to resolve its mutation");
    assert(mirror.getBody(handles.get("well:maw")).mass === 3,
      "Expected well mutation to remain attached to its stable identity");
    assert(mirror.listBodies({ category: "wreck", lifecycleStates: ["dead"] })
      .some((body) => body.id === "wreck:vault"),
    "Expected lifecycle-filtered body listing to include the transitioned wreck");
    assert(mirror.listBodies({ category: "portal", lifecycleStates: ["alive"] }).length === 0,
      "Expected the dying portal to leave alive-only body listings");

    const removed = mirror.removeBody(handles.get("wreck:vault"), { tick: 46 });
    const retired = mirror.getIdentity(handles.get("wreck:vault"));
    assert(removed.id === "wreck:vault" && retired?.state === "removed" && retired.removedTick === 46,
      `Expected queryable wreck tombstone, got ${JSON.stringify(retired)}`);

    const replacement = mirror.createBody({
      id: "wreck:replacement",
      category: "wreck",
      wx: 1.1,
      wy: 1.1,
      radius: 0.045,
      collisionMask: BODY_MASKS.WRECK,
      interactionMask: BODY_MASKS.PICKUP,
      lifecycle: { state: "alive" },
      data: { sourceId: "replacement" },
    }, { tick: 46 });
    assert(replacement.slot === handles.get("wreck:vault").slot,
      `Expected deterministic recycled slot ${handles.get("wreck:vault").slot}, got ${replacement.slot}`);
    assert(replacement.generation === handles.get("wreck:vault").generation + 1,
      `Expected recycled generation to advance, got ${replacement.generation}`);
    assert(mirror.getIdentity(handles.get("wreck:vault")).key !== mirror.getIdentity(replacement).key,
      "Expected retired and replacement bodies to keep distinct lifecycle identities");
    const identities = mirror.listIdentities({ includeRetired: true });
    const sortedKeys = [...identities]
      .sort((a, b) => a.handle.epoch - b.handle.epoch || a.handle.slot - b.handle.slot
        || a.handle.generation - b.handle.generation)
      .map((entry) => entry.key);
    assert(JSON.stringify(identities.map((entry) => entry.key)) === JSON.stringify(sortedKeys),
      "Expected lifecycle identity listing to be deterministic by epoch, slot, and generation");
  });

  await runner.run("Respawns terminal ids as new incarnations and rejects backward lifecycle", async () => {
    const mirror = createBallparkMirror({ worldScale: 4, cellSize: 0.5 });
    mirror.rebuildFromRuntime(fakeRuntime(), { tick: 42, reason: "respawn-test" });
    const portalHandle = mirror.getHandleById("portal:exit");
    mirror.setLifecycle(portalHandle, "dying", { tick: 43 });
    mirror.setLifecycle(portalHandle, "dead", { tick: 44 });

    let backwardError = null;
    try {
      mirror.setLifecycle(portalHandle, "alive", { tick: 45 });
    } catch (error) {
      backwardError = error;
    }
    assert(backwardError?.message.includes("cannot move backward"),
      `Expected backward lifecycle rejection, got ${backwardError?.message}`);

    const nextHandle = mirror.upsertBody({
      id: "portal:exit",
      category: "portal",
      wx: 2.8,
      wy: 0.6,
      radius: 0.08,
      collisionMask: BODY_MASKS.PORTAL,
      interactionMask: BODY_MASKS.PORTAL,
      lifecycle: { state: "alive" },
      data: { sourceId: "exit" },
    }, { tick: 46 });
    const history = mirror.getIdentityHistory("portal:exit");
    assert(history.length === 2 && history[0].state === "removed" && history[1].state === "alive",
      `Expected retired and live portal incarnations, got ${JSON.stringify(history)}`);
    assert(nextHandle.slot === portalHandle.slot && nextHandle.generation === portalHandle.generation + 1,
      `Expected same-id respawn to advance generation, got ${JSON.stringify(nextHandle)}`);
    assert(history[1].incarnation === 2, `Expected portal incarnation 2, got ${history[1].incarnation}`);
  });

  await runner.run("Preserves identities for index refreshes and invalidates them on registry reset", async () => {
    const runtime = fakeRuntime();
    const mirror = createBallparkMirror({ worldScale: 4, cellSize: 0.5 });
    mirror.rebuildFromRuntime(runtime, { tick: 42, reason: "first-tick" });
    const playerHandle = mirror.getHandleById("player:greg");

    runtime.tick = 43;
    runtime.session.flowFieldCellSize = 0.4;
    mirror.rebuildFromRuntime(runtime, { tick: 43, reason: "echo-hydration" });
    const afterIndexRefresh = mirror.getHandleById("player:greg");
    assert(afterIndexRefresh.epoch === playerHandle.epoch
      && afterIndexRefresh.slot === playerHandle.slot
      && afterIndexRefresh.generation === playerHandle.generation,
    `Expected cell-size/echo refresh to preserve player identity, got ${JSON.stringify(afterIndexRefresh)}`);
    assert(mirror.stats().lastSyncMode === "index-rebuild",
      `Expected index-only rebuild, got ${mirror.stats().lastSyncMode}`);

    runtime.tick = 44;
    mirror.rebuildFromRuntime(runtime, { tick: 44, reason: "session-started" });
    const afterReset = mirror.getHandleById("player:greg");
    assert(afterReset.epoch === playerHandle.epoch + 1,
      `Expected registry reset to advance epoch, got ${JSON.stringify(afterReset)}`);
    const retired = mirror.getIdentity(playerHandle);
    assert(retired?.state === "removed" && retired.removedTick === 44,
      `Expected old epoch identity to remain queryable, got ${JSON.stringify(retired)}`);
    let staleEpochError = null;
    try {
      mirror.getBody(playerHandle);
    } catch (error) {
      staleEpochError = error;
    }
    assert(staleEpochError?.code === "STALE_BALLPARK_EPOCH",
      `Expected old epoch reference rejection, got ${staleEpochError?.code}`);
  });

  await runner.run("Bounds retired identity history without reusing incarnation numbers", async () => {
    const mirror = createBallparkMirror({ worldScale: 4, cellSize: 0.5, retiredIdentityLimit: 1 });
    const first = mirror.createBody({
      id: "wreck:bounded",
      category: "wreck",
      wx: 1,
      wy: 1,
      radius: 0.04,
      lifecycle: { state: "alive" },
    }, { tick: 1 });
    mirror.removeBody(first, { tick: 2 });
    const other = mirror.createBody({
      id: "portal:bounded",
      category: "portal",
      wx: 2,
      wy: 2,
      radius: 0.08,
      lifecycle: { state: "alive" },
    }, { tick: 3 });
    mirror.removeBody(other, { tick: 4 });
    assert(mirror.getIdentity(first) === null,
      "Expected the oldest retired identity to be pruned at the configured bound");
    assert(mirror.stats().identities.retiredIdentities === 1 && mirror.stats().identities.pruned === 1,
      `Expected bounded retired identity stats, got ${JSON.stringify(mirror.stats().identities)}`);

    const respawned = mirror.createBody({
      id: "wreck:bounded",
      category: "wreck",
      wx: 1.5,
      wy: 1.5,
      radius: 0.04,
      lifecycle: { state: "alive" },
    }, { tick: 5 });
    assert(mirror.getIdentity(respawned).incarnation === 2,
      "Expected incarnation numbering to remain monotonic after tombstone pruning");
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
        body: JSON.stringify({
          runId: start.body.session.runId,
          clientId: "ballpark-test",
          joinTicket: start.body.joinTicket,
          name: "Ballpark Test",
        }),
      });
      assert(join.status === 200 && join.body.ok === true, `Expected join success, got ${join.status}`);

      const health = await getJson("/health");
      assert(health.status === 200, `Expected /health 200, got ${health.status}`);
      const snapshot = await getJson("/snapshot");
      assert(snapshot.status === 200, `Expected /snapshot 200, got ${snapshot.status}`);
      assert(!Object.prototype.hasOwnProperty.call(snapshot.body, "ballpark"), "Expected normal snapshot to avoid Ballpark debug payload");

      const ballpark = health.body.ballpark;
      assert(ballpark && ballpark.enabled === true, `Expected health.ballpark payload, got ${JSON.stringify(ballpark)}`);
      assert((ballpark.duplicateIds || []).length === 0,
        `Expected live mirror to avoid duplicate public ids, got ${JSON.stringify(ballpark.duplicateIds)}`);
      assert(Number.isFinite(ballpark.lastRebuildMs) && ballpark.lastRebuildMs <= 75,
        `Expected representative live mirror rebuild to stay within the structural runaway budget, got ${ballpark.lastRebuildMs}ms`);
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
