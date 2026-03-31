/**
 * sim-scale.js — Authoritative sim scaling profile checks.
 *
 * Verifies that larger maps advertise and start with cheaper server-side
 * clocks than small maps.
 */
const { startSimServer, stopSimServer, TestRunner, assert } = require("./helpers");

const SIM_PORT = 8789;
const SIM_URL = `http://127.0.0.1:${SIM_PORT}`;

async function getJson(path, options) {
  const response = await fetch(`${SIM_URL}${path}`, options);
  const body = await response.json();
  return { status: response.status, body };
}

async function run() {
  const runner = new TestRunner("SimScale");

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
      assert(shallows.tickHz > expanse.tickHz, `Expected shallows tickHz > expanse (${shallows.tickHz} vs ${expanse.tickHz})`);
      assert(expanse.tickHz > deepField.tickHz, `Expected expanse tickHz > deep-field (${expanse.tickHz} vs ${deepField.tickHz})`);
      assert(shallows.worldTickHz > expanse.worldTickHz, "Expected shallows worldTickHz > expanse");
      assert(expanse.worldTickHz > deepField.worldTickHz, "Expected expanse worldTickHz > deep-field");
      assert(shallows.snapshotHz > deepField.snapshotHz, "Expected shallows snapshotHz > deep-field");
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
      assert(body.session.overloadState === "NORMAL", `Expected NORMAL overload state, got ${body.session.overloadState}`);
      assert(body.session.timeScale === 1, `Expected timeScale 1, got ${body.session.timeScale}`);
      assert(body.session.tickHz === 10, `Expected large-map tickHz 10, got ${body.session.tickHz}`);
      assert(body.session.snapshotHz === 6, `Expected large-map snapshotHz 6, got ${body.session.snapshotHz}`);
      assert(body.session.worldTickHz === 4, `Expected large-map worldTickHz 4, got ${body.session.worldTickHz}`);
      assert(body.session.scavengerTickHz === 6, `Expected large-map scavengerTickHz 6, got ${body.session.scavengerTickHz}`);
      assert(
        body.session.entityRelevanceRadius === 1.0,
        `Expected large-map entityRelevanceRadius 1.0, got ${body.session.entityRelevanceRadius}`
      );
      assert(
        body.session.scavengerRelevanceRadius === 1.4,
        `Expected large-map scavengerRelevanceRadius 1.4, got ${body.session.scavengerRelevanceRadius}`
      );
      assert(body.session.maxScavengers === 7, `Expected large-map maxScavengers 7, got ${body.session.maxScavengers}`);
      assert(
        body.session.maxRelevantStarsPerPlayer === 4,
        `Expected large-map maxRelevantStarsPerPlayer 4, got ${body.session.maxRelevantStarsPerPlayer}`
      );
      assert(
        body.session.maxWellInfluencesPerPlayer === 4,
        `Expected large-map maxWellInfluencesPerPlayer 4, got ${body.session.maxWellInfluencesPerPlayer}`
      );
      assert(
        body.session.maxPortalChecksPerPlayer === 2,
        `Expected large-map maxPortalChecksPerPlayer 2, got ${body.session.maxPortalChecksPerPlayer}`
      );
    });

    await runner.run("Starting expanse session applies the medium-map server profile", async () => {
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
      assert(body.session.overloadState === "NORMAL", `Expected NORMAL overload state, got ${body.session.overloadState}`);
      assert(body.session.timeScale === 1, `Expected timeScale 1, got ${body.session.timeScale}`);
      assert(body.session.tickHz === 12, `Expected medium-map tickHz 12, got ${body.session.tickHz}`);
      assert(body.session.snapshotHz === 8, `Expected medium-map snapshotHz 8, got ${body.session.snapshotHz}`);
      assert(body.session.worldTickHz === 6, `Expected medium-map worldTickHz 6, got ${body.session.worldTickHz}`);
      assert(
        body.session.entityRelevanceRadius === 1.2,
        `Expected medium-map entityRelevanceRadius 1.2, got ${body.session.entityRelevanceRadius}`
      );
      assert(body.session.maxScavengers === 6, `Expected medium-map maxScavengers 6, got ${body.session.maxScavengers}`);
      assert(
        body.session.maxRelevantScavengersPerPlayer === 3,
        `Expected medium-map maxRelevantScavengersPerPlayer 3, got ${body.session.maxRelevantScavengersPerPlayer}`
      );
      assert(
        body.session.maxPickupChecksPerPlayer === 3,
        `Expected medium-map maxPickupChecksPerPlayer 3, got ${body.session.maxPickupChecksPerPlayer}`
      );
    });

    await runner.run("Starting high-player deep-field session applies explicit AI spawn budget", async () => {
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
      assert(body.session.maxScavengers === 7, `Expected maxScavengers 7, got ${body.session.maxScavengers}`);

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
