/**
 * sim-scale.js — Authoritative sim scaling profile checks.
 *
 * Verifies that map-specific presentation and content budgets stay distinct
 * while every authority session advances at the shared movement clock.
 */
const { startSimServer, stopSimServer, TestRunner, assert } = require("./helpers.cjs");
const { SESSION_PROFILES } = require("../scripts/content/session-profiles.cjs");
const { MOVEMENT } = require("../scripts/content/movement.cjs");
const { loadPlayableMaps } = require("../scripts/shared-map-loader.cjs");
const { serializedJsonBytes } = require("../scripts/sim/serialization-budget.cjs");

const SIM_PORT = 8789;
const SIM_URL = `http://127.0.0.1:${SIM_PORT}`;
const SMALL_PROFILE = SESSION_PROFILES.small;
const MEDIUM_PROFILE = SESSION_PROFILES.medium;
const LARGE_PROFILE = SESSION_PROFILES.large;
const LEGACY_RATE_KEYS = [
  "worldTickHz",
  "portalTickHz",
  "growthTickHz",
  "scavengerTickHz",
  "waveTickHz",
  "fieldTickHz",
];
const LEGACY_DIAGNOSTIC_COUNTS = {
  maxRelevantStarsPerPlayer: "stars",
  maxRelevantPlanetoidsPerPlayer: "planetoids",
  maxRelevantWrecksPerPlayer: "wrecks",
  maxRelevantScavengersPerPlayer: "scavengers",
  maxWellInfluencesPerPlayer: "wells",
  maxWaveInfluencesPerPlayer: "waveRings",
  maxPickupChecksPerPlayer: "wrecks",
  maxPortalChecksPerPlayer: "portals",
};

async function getJson(path, options) {
  const response = await fetch(`${SIM_URL}${path}`, options);
  const text = await response.text();
  const body = JSON.parse(text);
  return { status: response.status, body, bytes: Buffer.byteLength(text) };
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

function count(collection, key) {
  return Array.isArray(collection?.[key]) ? collection[key].length : 0;
}

function assertLegacyRateShape(session, { includeBaseKeys = false } = {}) {
  for (const key of LEGACY_RATE_KEYS) {
    assert(session[key] === MOVEMENT.authority.integrationHz,
      `${key} must expose canonical ${MOVEMENT.authority.integrationHz} Hz`);
    if (includeBaseKeys) {
      const baseKey = `base${key[0].toUpperCase()}${key.slice(1)}`;
      assert(session[baseKey] === MOVEMENT.authority.integrationHz,
        `${baseKey} must expose canonical ${MOVEMENT.authority.integrationHz} Hz`);
    }
  }
}

function assertLegacyDiagnosticShape(session, world, { includeBaseKeys = false } = {}) {
  for (const key of ["entityRelevanceRadius", "scavengerRelevanceRadius"]) {
    assert(session[key] === session.worldScale,
      `${key} must describe the full authority world, got ${session[key]}`);
    if (includeBaseKeys) {
      const baseKey = `base${key[0].toUpperCase()}${key.slice(1)}`;
      assert(session[baseKey] === session.worldScale,
        `${baseKey} must describe the full authority world, got ${session[baseKey]}`);
    }
  }
  for (const [key, sourceKey] of Object.entries(LEGACY_DIAGNOSTIC_COUNTS)) {
    const expected = count(world, sourceKey);
    assert(Number.isFinite(session[key]) && session[key] === expected,
      `${key} must report all current ${sourceKey}, got ${session[key]}/${expected}`);
    if (includeBaseKeys) {
      const baseKey = `base${key[0].toUpperCase()}${key.slice(1)}`;
      assert(Number.isFinite(session[baseKey]) && session[baseKey] === expected,
        `${baseKey} must report all current ${sourceKey}, got ${session[baseKey]}/${expected}`);
    }
  }
}

async function run() {
  const runner = new TestRunner("SimScale");
  const authoritativeMaps = loadPlayableMaps();

  await startSimServer(SIM_PORT);
  try {
    await runner.run("Maps endpoint preserves legacy diagnostics at one authority clock", async () => {
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
        assert(advertised.worldScale === source.worldScale,
          `${advertised.id}: advertised worldScale drifted from map truth`);
        assert(advertised.dimensions?.width === source.dimensions.width
          && advertised.dimensions?.height === source.dimensions.height,
          `${advertised.id}: advertised dimensions drifted from map truth`);
        assert(advertised.profileId === source.profileId,
          `${advertised.id}: advertised profile identity drifted from map truth`);
        assert(source.route?.id, `${advertised.id}: authoritative map is missing route identity`);
      }
      assert(shallows.tickHz === MOVEMENT.authority.integrationHz
        && expanse.tickHz === MOVEMENT.authority.integrationHz
        && deepField.tickHz === MOVEMENT.authority.integrationHz,
      "Every map must advertise the shared authority clock");
      for (const advertised of maps) {
        const source = authoritativeMaps[advertised.id];
        assertLegacyRateShape(advertised);
        assertLegacyDiagnosticShape(advertised, source);
      }
      assert(shallows.snapshotHz > deepField.snapshotHz, "Expected shallows snapshotHz > deep-field");
      assert(shallows.useCoarseField === false, "Expected shallows direct-force path");
      assert(expanse.useCoarseField === true, "Expected expanse coarse-field path");
      assert(deepField.useCoarseField === true, "Expected deep-field coarse-field path");
      assert(shallows.clientPerfProfile === SMALL_PROFILE.clientPerfProfile, "Expected shallows client perf profile from manifest");
      assert(expanse.clientPerfProfile === MEDIUM_PROFILE.clientPerfProfile, "Expected expanse client perf profile from manifest");
      assert(deepField.clientPerfProfile === LARGE_PROFILE.clientPerfProfile, "Expected deep-field client perf profile from manifest");
      assert(expanse.flowFieldCellSize < deepField.flowFieldCellSize, "Expected deep-field field cells to be coarser than expanse");
      assert(shallows.maxScavengers < deepField.maxScavengers, "Expected deep-field to allow more scavengers than shallows");
    });

    await runner.run("Deep Field snapshot preserves legacy session diagnostics", async () => {
      await restartFreshSim();
      const { status, body } = await getJson("/session/start", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          mapId: "deep-field",
          requesterId: "sim-scale-test",
          requesterName: "Scale Test",
          seed: 424242,
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
      assert(body.session.tickHz === MOVEMENT.authority.integrationHz,
        `Expected canonical tickHz ${MOVEMENT.authority.integrationHz}, got ${body.session.tickHz}`);
      assert(body.session.snapshotHz === LARGE_PROFILE.snapshotHz, `Expected large-map snapshotHz ${LARGE_PROFILE.snapshotHz}, got ${body.session.snapshotHz}`);
      assert(body.session.flowFieldCellSize === LARGE_PROFILE.flowFieldCellSize, `Expected large-map flowFieldCellSize ${LARGE_PROFILE.flowFieldCellSize}, got ${body.session.flowFieldCellSize}`);
      assert(body.session.maxScavengers === LARGE_PROFILE.maxScavengers, `Expected large-map maxScavengers ${LARGE_PROFILE.maxScavengers}, got ${body.session.maxScavengers}`);
      assert(body.session.localFluidWindowWorldUnits > 0, "Expected bounded local fluid window");
      assert(body.session.localFluidResolution === 192, "Expected fixed local fluid resolution");
      assert(body.session.coarseTextureResolution === 64, "Expected fixed coarse texture resolution");
      assert(body.session.maxCoarseFieldCells === LARGE_PROFILE.maxCoarseFieldCells,
        "Expected large-map coarse-field cell ceiling");
      assert(body.session.snapshotBudgetBytes === LARGE_PROFILE.snapshotBudgetBytes,
        "Expected large-map snapshot budget");
      const join = await getJson("/join", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          runId: body.session.runId,
          joinTicket: body.joinTicket,
          clientId: "sim-scale-deck-proof",
          name: "Deck Proof",
        }),
      });
      assert(join.status === 200 && join.body.ok === true, "Expected Deck-representative player join");

      const observedBytes = [];
      for (let i = 0; i < 6; i += 1) {
        const snapshot = await getJson("/snapshot");
        assert(snapshot.status === 200, `Expected repeated /snapshot ${i + 1} 200, got ${snapshot.status}`);
        assert(snapshot.body.session?.mapId === "deep-field",
          `Expected repeated snapshot map identity deep-field, got ${snapshot.body.session?.mapId}`);
        assert(snapshot.body.session?.simScaleProfile === "large",
          `Expected repeated snapshot large tier, got ${snapshot.body.session?.simScaleProfile}`);
        assertLegacyRateShape(snapshot.body.session, { includeBaseKeys: true });
        assertLegacyDiagnosticShape(snapshot.body.session, snapshot.body.world, { includeBaseKeys: true });
        const serializedBytes = serializedJsonBytes(snapshot.body, { pretty: true, trailingNewline: true });
        observedBytes.push(serializedBytes);
        assert(serializedBytes <= LARGE_PROFILE.snapshotBudgetBytes,
          `Deep Field serialized snapshot exceeds large tier: ${serializedBytes}/${LARGE_PROFILE.snapshotBudgetBytes}`);
        assert((snapshot.body.world?.stars || []).every((star) => typeof star.type === "string"),
          "Deep Field snapshot star type data must remain wire-compatible");
        await new Promise((resolve) => setTimeout(resolve, 180));
      }
      assert(Math.max(...observedBytes) > 0, "Expected exact repeated snapshot byte observations");
      console.log(`Deep Field repeated snapshot bytes: ${observedBytes.join(", ")} / ${LARGE_PROFILE.snapshotBudgetBytes}`);
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
      assert(body.session.tickHz === MOVEMENT.authority.integrationHz,
        `Expected canonical tickHz ${MOVEMENT.authority.integrationHz}, got ${body.session.tickHz}`);
      assert(body.session.snapshotHz === MEDIUM_PROFILE.snapshotHz, `Expected medium-map snapshotHz ${MEDIUM_PROFILE.snapshotHz}, got ${body.session.snapshotHz}`);
      assert(body.session.flowFieldCellSize === MEDIUM_PROFILE.flowFieldCellSize, `Expected medium-map flowFieldCellSize ${MEDIUM_PROFILE.flowFieldCellSize}, got ${body.session.flowFieldCellSize}`);
      assert(body.session.maxScavengers === MEDIUM_PROFILE.maxScavengers, `Expected medium-map maxScavengers ${MEDIUM_PROFILE.maxScavengers}, got ${body.session.maxScavengers}`);
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
