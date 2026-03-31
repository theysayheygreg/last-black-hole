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
      assert(body.session.tickHz === 12, `Expected medium-map tickHz 12, got ${body.session.tickHz}`);
      assert(body.session.snapshotHz === 8, `Expected medium-map snapshotHz 8, got ${body.session.snapshotHz}`);
      assert(body.session.worldTickHz === 6, `Expected medium-map worldTickHz 6, got ${body.session.worldTickHz}`);
      assert(
        body.session.entityRelevanceRadius === 1.2,
        `Expected medium-map entityRelevanceRadius 1.2, got ${body.session.entityRelevanceRadius}`
      );
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
