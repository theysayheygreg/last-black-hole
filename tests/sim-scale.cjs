/**
 * sim-scale.js — Authoritative sim scaling profile checks.
 *
 * Verifies that larger maps advertise and start with cheaper server-side
 * clocks than small maps.
 */
const { startSimServer, stopSimServer, TestRunner, assert } = require("./helpers.cjs");
const { SESSION_PROFILES } = require("../scripts/content/session-profiles.cjs");
const { loadPlayableMaps } = require("../scripts/shared-map-loader.cjs");

const SIM_PORT = 8789;
const SIM_URL = `http://127.0.0.1:${SIM_PORT}`;
const SMALL_PROFILE = SESSION_PROFILES.small;
const MEDIUM_PROFILE = SESSION_PROFILES.medium;
const LARGE_PROFILE = SESSION_PROFILES.large;

async function getJson(path, options) {
  const response = await fetch(`${SIM_URL}${path}`, options);
  const body = await response.json();
  return { status: response.status, body };
}

async function restartFreshSim() {
  await stopSimServer(SIM_PORT).catch(() => null);
  await startSimServer(SIM_PORT);
}

function torusDelta(from, to, worldScale) {
  let d = to - from;
  const half = worldScale / 2;
  if (d > half) d -= worldScale;
  if (d < -half) d += worldScale;
  return d;
}

function torusDistance(ax, ay, bx, by, worldScale) {
  return Math.hypot(torusDelta(ax, bx, worldScale), torusDelta(ay, by, worldScale));
}

async function run() {
  const runner = new TestRunner("SimScale");
  const authoritativeMaps = loadPlayableMaps();

  await startSimServer(SIM_PORT);
  try {
    await runner.run("Maps endpoint advertises cheaper profiles for larger worlds", async () => {
      const { status, body } = await getJson("/maps");
      assert(status === 200, `Expected /maps 200, got ${status}`);
      const maps = body.maps || [];
      const shallows = maps.find((map) => map.id === "shallows");
      const expanse = maps.find((map) => map.id === "expanse");
      const deepField = maps.find((map) => map.id === "deep-field");
      assert(shallows && expanse && deepField, "Expected shallows, expanse, and deep-field in /maps");
      for (const advertised of maps) {
        const source = authoritativeMaps[advertised.id];
        assert(source, `Maps endpoint advertised unknown map ${advertised.id}`);
        assert(advertised.wellCount === source.wells.length,
          `${advertised.id}: advertised well count drifted from map truth`);
        assert(advertised.wreckCount === source.wrecks.length,
          `${advertised.id}: advertised wreck count drifted from map truth`);
        assert(source.route?.id, `${advertised.id}: authoritative map is missing route identity`);
      }
      assert(shallows.tickHz > expanse.tickHz, `Expected shallows tickHz > expanse (${shallows.tickHz} vs ${expanse.tickHz})`);
      assert(expanse.tickHz > deepField.tickHz, `Expected expanse tickHz > deep-field (${expanse.tickHz} vs ${deepField.tickHz})`);
      assert(shallows.worldTickHz > expanse.worldTickHz, "Expected shallows worldTickHz > expanse");
      assert(expanse.worldTickHz > deepField.worldTickHz, "Expected expanse worldTickHz > deep-field");
      assert(shallows.snapshotHz > deepField.snapshotHz, "Expected shallows snapshotHz > deep-field");
      assert(shallows.useCoarseField === false, "Expected shallows direct-force path");
      assert(expanse.useCoarseField === true, "Expected expanse coarse-field path");
      assert(deepField.useCoarseField === true, "Expected deep-field coarse-field path");
      assert(shallows.clientPerfProfile === SMALL_PROFILE.clientPerfProfile, "Expected shallows client perf profile from manifest");
      assert(expanse.clientPerfProfile === MEDIUM_PROFILE.clientPerfProfile, "Expected expanse client perf profile from manifest");
      assert(deepField.clientPerfProfile === LARGE_PROFILE.clientPerfProfile, "Expected deep-field client perf profile from manifest");
      assert(expanse.fieldTickHz > deepField.fieldTickHz, "Expected expanse fieldTickHz > deep-field");
      assert(expanse.flowFieldCellSize < deepField.flowFieldCellSize, "Expected deep-field field cells to be coarser than expanse");
      assert(
        shallows.entityRelevanceRadius > expanse.entityRelevanceRadius,
        "Expected shallows entityRelevanceRadius > expanse"
      );
      assert(
        expanse.entityRelevanceRadius > deepField.entityRelevanceRadius,
        "Expected expanse entityRelevanceRadius > deep-field"
      );
      assert(
        shallows.scavengerRelevanceRadius > deepField.scavengerRelevanceRadius,
        "Expected shallows scavengerRelevanceRadius > deep-field"
      );
      assert(shallows.maxScavengers < deepField.maxScavengers, "Expected deep-field to allow more scavengers than shallows");
      assert(
        shallows.maxRelevantStarsPerPlayer > deepField.maxRelevantStarsPerPlayer,
        "Expected shallows star relevance budget > deep-field"
      );
      assert(
        shallows.maxRelevantScavengersPerPlayer > deepField.maxRelevantScavengersPerPlayer,
        "Expected shallows scavenger relevance budget > deep-field"
      );
      assert(
        shallows.maxWellInfluencesPerPlayer > deepField.maxWellInfluencesPerPlayer,
        "Expected shallows well influence budget > deep-field"
      );
      assert(
        shallows.maxWaveInfluencesPerPlayer > deepField.maxWaveInfluencesPerPlayer,
        "Expected shallows wave influence budget > deep-field"
      );
    });

    await runner.run("Starting deep-field session applies the large-map server profile", async () => {
      await restartFreshSim();
      const { status, body } = await getJson("/session/start", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          mapId: "deep-field",
          requesterId: "sim-scale-test",
          requesterName: "Scale Test",
        }),
      });
      assert(status === 200, `Expected /session/start 200, got ${status}`);
      assert(body.session.mapId === "deep-field", `Expected deep-field session, got ${body.session.mapId}`);
      assert(body.session.simScaleProfile === "large", `Expected large profile, got ${body.session.simScaleProfile}`);
      assert(body.session.clientPerfProfile === LARGE_PROFILE.clientPerfProfile,
        `Expected large-map clientPerfProfile ${LARGE_PROFILE.clientPerfProfile}, got ${body.session.clientPerfProfile}`);
      assert(body.session.overloadState === "NORMAL", `Expected NORMAL overload state, got ${body.session.overloadState}`);
      assert(body.session.timeScale === 1, `Expected timeScale 1, got ${body.session.timeScale}`);
      assert(body.session.useCoarseField === true, "Expected deep-field coarse field on");
      assert(body.session.tickHz === LARGE_PROFILE.tickHz, `Expected large-map tickHz ${LARGE_PROFILE.tickHz}, got ${body.session.tickHz}`);
      assert(body.session.snapshotHz === LARGE_PROFILE.snapshotHz, `Expected large-map snapshotHz ${LARGE_PROFILE.snapshotHz}, got ${body.session.snapshotHz}`);
      assert(body.session.worldTickHz === LARGE_PROFILE.worldTickHz, `Expected large-map worldTickHz ${LARGE_PROFILE.worldTickHz}, got ${body.session.worldTickHz}`);
      assert(body.session.fieldTickHz === LARGE_PROFILE.fieldTickHz, `Expected large-map fieldTickHz ${LARGE_PROFILE.fieldTickHz}, got ${body.session.fieldTickHz}`);
      assert(body.session.flowFieldCellSize === LARGE_PROFILE.flowFieldCellSize, `Expected large-map flowFieldCellSize ${LARGE_PROFILE.flowFieldCellSize}, got ${body.session.flowFieldCellSize}`);
      assert(body.session.scavengerTickHz === LARGE_PROFILE.scavengerTickHz, `Expected large-map scavengerTickHz ${LARGE_PROFILE.scavengerTickHz}, got ${body.session.scavengerTickHz}`);
      assert(
        body.session.entityRelevanceRadius === LARGE_PROFILE.entityRelevanceRadius,
        `Expected large-map entityRelevanceRadius ${LARGE_PROFILE.entityRelevanceRadius}, got ${body.session.entityRelevanceRadius}`
      );
      assert(
        body.session.scavengerRelevanceRadius === LARGE_PROFILE.scavengerRelevanceRadius,
        `Expected large-map scavengerRelevanceRadius ${LARGE_PROFILE.scavengerRelevanceRadius}, got ${body.session.scavengerRelevanceRadius}`
      );
      assert(body.session.maxScavengers === LARGE_PROFILE.maxScavengers, `Expected large-map maxScavengers ${LARGE_PROFILE.maxScavengers}, got ${body.session.maxScavengers}`);
      assert(
        body.session.maxRelevantStarsPerPlayer === LARGE_PROFILE.maxRelevantStarsPerPlayer,
        `Expected large-map maxRelevantStarsPerPlayer ${LARGE_PROFILE.maxRelevantStarsPerPlayer}, got ${body.session.maxRelevantStarsPerPlayer}`
      );
      assert(
        body.session.maxWellInfluencesPerPlayer === LARGE_PROFILE.maxWellInfluencesPerPlayer,
        `Expected large-map maxWellInfluencesPerPlayer ${LARGE_PROFILE.maxWellInfluencesPerPlayer}, got ${body.session.maxWellInfluencesPerPlayer}`
      );
      assert(
        body.session.maxPortalChecksPerPlayer === LARGE_PROFILE.maxPortalChecksPerPlayer,
        `Expected large-map maxPortalChecksPerPlayer ${LARGE_PROFILE.maxPortalChecksPerPlayer}, got ${body.session.maxPortalChecksPerPlayer}`
      );
    });

    await runner.run("Starting expanse session applies the medium-map server profile", async () => {
      await restartFreshSim();
      const { status, body } = await getJson("/session/start", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          mapId: "expanse",
          requesterId: "sim-scale-test",
          requesterName: "Scale Test",
        }),
      });
      assert(status === 200, `Expected /session/start 200, got ${status}`);
      assert(body.session.mapId === "expanse", `Expected expanse session, got ${body.session.mapId}`);
      assert(body.session.simScaleProfile === "medium", `Expected medium profile, got ${body.session.simScaleProfile}`);
      assert(body.session.clientPerfProfile === MEDIUM_PROFILE.clientPerfProfile,
        `Expected medium-map clientPerfProfile ${MEDIUM_PROFILE.clientPerfProfile}, got ${body.session.clientPerfProfile}`);
      assert(body.session.overloadState === "NORMAL", `Expected NORMAL overload state, got ${body.session.overloadState}`);
      assert(body.session.timeScale === 1, `Expected timeScale 1, got ${body.session.timeScale}`);
      assert(body.session.useCoarseField === true, "Expected expanse coarse field on");
      assert(body.session.tickHz === MEDIUM_PROFILE.tickHz, `Expected medium-map tickHz ${MEDIUM_PROFILE.tickHz}, got ${body.session.tickHz}`);
      assert(body.session.snapshotHz === MEDIUM_PROFILE.snapshotHz, `Expected medium-map snapshotHz ${MEDIUM_PROFILE.snapshotHz}, got ${body.session.snapshotHz}`);
      assert(body.session.worldTickHz === MEDIUM_PROFILE.worldTickHz, `Expected medium-map worldTickHz ${MEDIUM_PROFILE.worldTickHz}, got ${body.session.worldTickHz}`);
      assert(body.session.fieldTickHz === MEDIUM_PROFILE.fieldTickHz, `Expected medium-map fieldTickHz ${MEDIUM_PROFILE.fieldTickHz}, got ${body.session.fieldTickHz}`);
      assert(body.session.flowFieldCellSize === MEDIUM_PROFILE.flowFieldCellSize, `Expected medium-map flowFieldCellSize ${MEDIUM_PROFILE.flowFieldCellSize}, got ${body.session.flowFieldCellSize}`);
      assert(
        body.session.entityRelevanceRadius === MEDIUM_PROFILE.entityRelevanceRadius,
        `Expected medium-map entityRelevanceRadius ${MEDIUM_PROFILE.entityRelevanceRadius}, got ${body.session.entityRelevanceRadius}`
      );
      assert(body.session.maxScavengers === MEDIUM_PROFILE.maxScavengers, `Expected medium-map maxScavengers ${MEDIUM_PROFILE.maxScavengers}, got ${body.session.maxScavengers}`);
      assert(
        body.session.maxRelevantScavengersPerPlayer === MEDIUM_PROFILE.maxRelevantScavengersPerPlayer,
        `Expected medium-map maxRelevantScavengersPerPlayer ${MEDIUM_PROFILE.maxRelevantScavengersPerPlayer}, got ${body.session.maxRelevantScavengersPerPlayer}`
      );
      assert(
        body.session.maxPickupChecksPerPlayer === MEDIUM_PROFILE.maxPickupChecksPerPlayer,
        `Expected medium-map maxPickupChecksPerPlayer ${MEDIUM_PROFILE.maxPickupChecksPerPlayer}, got ${body.session.maxPickupChecksPerPlayer}`
      );
    });

    await runner.run("Authoritative joins spawn clear of immediate well danger", async () => {
      for (const mapId of ["shallows", "expanse", "deep-field"]) {
        await restartFreshSim();
        const start = await getJson("/session/start", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            mapId,
            requesterId: "sim-scale-test",
            requesterName: "Scale Test",
            seed: 60625,
          }),
        });
        assert(start.status === 200, `${mapId}: expected /session/start 200, got ${start.status}`);

        const join = await getJson("/join", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            clientId: `spawn-check-${mapId}`,
            name: "Spawn Check",
          }),
        });
        assert(join.status === 200 && join.body.ok === true, `${mapId}: expected /join success`);
        const player = join.body.player;
        const snapshot = await getJson("/snapshot");
        const world = snapshot.body.world;
        const nearestWell = (world.wells || []).reduce((best, well) => {
          const dist = torusDistance(player.wx, player.wy, well.wx, well.wy, world.worldScale);
          return !best || dist < best.dist ? { dist, killRadius: well.killRadius, id: well.id } : best;
        }, null);
        assert(nearestWell && nearestWell.dist > (nearestWell.killRadius || 0) + 0.18,
          `${mapId}: authoritative spawn too close to well ${JSON.stringify(nearestWell)}`);
      }
    });

    await runner.run("Authoritative snapshots carry printable wreck labels", async () => {
      await restartFreshSim();
      const { status } = await getJson("/session/start", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          mapId: "shallows",
          requesterId: "sim-scale-test",
          requesterName: "Scale Test",
          seed: 424242,
        }),
      });
      assert(status === 200, `Expected /session/start 200, got ${status}`);

      const snapshot = await getJson("/snapshot");
      const wrecks = snapshot.body.world?.wrecks || [];
      assert(wrecks.length > 0, "Expected snapshot wrecks");
      for (const wreck of wrecks) {
        assert(typeof wreck.name === "string" && wreck.name.length > 0, `Expected printable wreck name for ${wreck.id || wreck.type}`);
        assert(!wreck.name.includes("undefined"), `Wreck label leaked undefined: ${wreck.name}`);
        assert(Array.isArray(wreck.loot), `Expected wreck loot array for ${wreck.name}`);
      }
    });

    await runner.run("Starting high-player deep-field session applies explicit AI spawn budget", async () => {
      await restartFreshSim();
      const { status, body } = await getJson("/session/start", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          mapId: "deep-field",
          maxPlayers: 8,
          requesterId: "sim-scale-test",
          requesterName: "Scale Test",
        }),
      });
      assert(status === 200, `Expected /session/start 200, got ${status}`);
      assert(body.session.maxPlayers === 8, `Expected maxPlayers 8, got ${body.session.maxPlayers}`);
      assert(body.session.maxScavengers === LARGE_PROFILE.maxScavengers, `Expected maxScavengers ${LARGE_PROFILE.maxScavengers}, got ${body.session.maxScavengers}`);

      const snapshot = await getJson("/snapshot");
      const scavengers = snapshot.body.world?.scavengers || [];
      assert(scavengers.length === 6, `Expected spawned scavengers to honor budget at 6, got ${scavengers.length}`);
    });
  } finally {
    await stopSimServer(SIM_PORT);
  }

  const allPassed = runner.summary();
  process.exit(allPassed ? 0 : 1);
}

run().catch(async (err) => {
  console.error("SimScale test fatal error:", err.message);
  try { await stopSimServer(SIM_PORT); } catch {}
  process.exit(1);
});
