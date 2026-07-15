const assert = require("assert");
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const {
  TestRunner,
  startSimServer,
  stopSimServer,
} = require("./helpers.cjs");
const serverCatalog = require("../scripts/anomaly-catalog.cjs");
const { createRNGStreams } = require("../scripts/rng-stream.cjs");
const { buildCoarseFlowField, sampleCoarseFlowField } = require("../scripts/coarse-flow-field.cjs");
const { createSeededSea } = require("../scripts/sim/seeded-sea.cjs");

const ROOT = path.resolve(__dirname, "..");
const SIM_PORT = 8837;
const SIM_URL = `http://127.0.0.1:${SIM_PORT}`;
const SHIPPING_IDS = [
  "base-well",
  "micro-black-hole",
  "supermassive-black-hole",
  "pulsar",
];
const TRIO_IDS = SHIPPING_IDS.slice(1);

function hash(value) {
  return crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex").slice(0, 16);
}

function makeField(catalogId) {
  const well = {
    id: "well-proof",
    wx: 1.5,
    wy: 1.5,
    mass: 1,
    killRadius: 0.06,
    orbitalDir: 1,
  };
  if (catalogId) well.fabricSignature = serverCatalog.getFabricSignature(catalogId);
  const seededSea = createSeededSea({
    seed: 90210,
    mapId: "w2a3-proof",
    worldScale: 3,
    wells: [well],
    rngStreams: createRNGStreams(90210),
  });
  return buildCoarseFlowField({
    worldScale: 3,
    cellSize: 0.2,
    wells: [well],
    waveRings: [{
      id: "wave-proof",
      sourceWX: 1.5,
      sourceWY: 1.5,
      sourceWellId: "well-proof",
      radius: 0.4,
      amplitude: 0.8,
      alive: true,
    }],
    seededSea,
    wellGravityScale: 0.6,
    wellGravityFalloff: 1.5,
    wellGravityMaxRange: 1.2,
    wellCurrentScale: 0.3,
    wellCurrentFalloff: 1.5,
    wellCurrentMaxRange: 1.35,
    waveShipPush: 0.8,
    waveWidth: 0.1,
  });
}

async function requestJson(route, options = {}) {
  const response = await fetch(`${SIM_URL}${route}`, options);
  return { status: response.status, body: await response.json() };
}

async function loadClientCatalog() {
  return import(`file://${path.join(ROOT, "src/anomaly-catalog.js")}?w2a3=${Date.now()}`);
}

async function run() {
  const runner = new TestRunner("W2A3ShippingTrio");
  const clientCatalog = await loadClientCatalog();

  await runner.run("shipping entries validate unit-bearing bounded vectors in both wrappers", () => {
    assert(serverCatalog.assertValidAnomalyCatalog());
    assert(clientCatalog.assertValidAnomalyCatalog());
    assert.deepStrictEqual(clientCatalog.ANOMALY_CATALOG, serverCatalog.ANOMALY_CATALOG);
    assert.deepStrictEqual(
      Object.keys(serverCatalog.ANOMALY_CATALOG).filter((id) => serverCatalog.ANOMALY_CATALOG[id].status === "shipping").sort(),
      SHIPPING_IDS.slice().sort(),
    );
    const contract = serverCatalog.ANOMALY_FABRIC_PARAMETER_CONTRACT;
    for (const id of SHIPPING_IDS) {
      const entry = serverCatalog.ANOMALY_CATALOG[id];
      assert.strictEqual(entry.runtimeBehaviorId, "base-well");
      assert.strictEqual(entry.fabricSignature.kind, "bounded-parameter-vector");
      for (const [name, declaration] of Object.entries(contract)) {
        const value = entry.fabricSignature.parameters[name];
        assert(Number.isFinite(value), `${id}.${name} must be numeric`);
        assert(value >= declaration.range[0] && value <= declaration.range[1], `${id}.${name} escaped its bound`);
        assert(declaration.unit && declaration.source, `${name} must retain unit/source labels`);
      }
    }
  });

  await runner.run("Shallows remains a fixed curated cast", () => {
    const first = serverCatalog.selectAnomalyCast({ mapId: "shallows", seed: 424242, wellCount: 4, rngStreams: createRNGStreams(424242) });
    const second = serverCatalog.selectAnomalyCast({ mapId: "shallows", seed: 424243, wellCount: 4, rngStreams: createRNGStreams(424243) });
    assert.strictEqual(first.policy, "fixed-curated");
    assert.strictEqual(first.castIdentity, "base-well|base-well|base-well|base-well");
    assert.strictEqual(JSON.stringify(first.eligibleMap), JSON.stringify(second.eligibleMap));
    assert.strictEqual(JSON.stringify(first.cast), JSON.stringify(second.cast));
  });

  await runner.run("Expanse and Deep Field casts are byte-stable and seed-divergent", () => {
    for (const mapId of ["expanse", "deep-field"]) {
      const sameA = serverCatalog.selectAnomalyCast({ mapId, seed: 424242, wellCount: mapId === "expanse" ? 8 : 20, rngStreams: createRNGStreams(424242) });
      const sameB = serverCatalog.selectAnomalyCast({ mapId, seed: 424242, wellCount: mapId === "expanse" ? 8 : 20, rngStreams: createRNGStreams(424242) });
      const different = serverCatalog.selectAnomalyCast({ mapId, seed: 424243, wellCount: mapId === "expanse" ? 8 : 20, rngStreams: createRNGStreams(424243) });
      assert.strictEqual(JSON.stringify(sameA), JSON.stringify(sameB), `${mapId} same seed/config must be byte-stable`);
      assert.notStrictEqual(hash(sameA), hash(different), `${mapId} known seeds must differ`);
    }
  });

  await runner.run("each trio vector changes the existing authoritative field and wave output", () => {
    const fields = Object.fromEntries(["base-well", ...TRIO_IDS].map((id) => [id, makeField(id)]));
    const hashes = new Set(Object.values(fields).map((field) => hash(field.cells)));
    assert.strictEqual(hashes.size, 4, "base plus trio must produce four distinct field outputs");
    const waveSamples = TRIO_IDS.map((id) => sampleCoarseFlowField(fields[id], 1.9, 1.5).wave.x);
    assert(waveSamples.every((value) => Number.isFinite(value)));
    assert.notStrictEqual(waveSamples[0], waveSamples[1], "micro and supermassive wave terms must differ");
    assert.notStrictEqual(waveSamples[1], waveSamples[2], "supermassive and pulsar wave terms must differ");
  });

  await runner.run("base-well migration preserves fields and identity-vector parity", () => {
    const legacyField = makeField(null);
    const baseField = makeField("base-well");
    assert.deepStrictEqual(baseField.cells, legacyField.cells, "identity vector must preserve legacy field cells");
    const legacy = {
      id: "well-1",
      wx: 1,
      wy: 1,
      mass: 1.5,
      startMass: 1.5,
      growthRate: 0.021,
      orbitalDir: -1,
      baseKillRadius: 0.06,
      killRadius: 0.06027,
      spinRate: 0.6,
      points: 8,
    };
    const migrated = serverCatalog.migrateCurrentWell(legacy, "base-well");
    for (const key of Object.keys(legacy)) assert.deepStrictEqual(migrated[key], legacy[key], `${key} changed`);
    assert.deepStrictEqual(migrated.fabricSignature, serverCatalog.getFabricSignature("base-well"));
    assert(Object.values(migrated.fabricSignature.parameters).every((value) => value === 1));
  });

  await runner.run("activation adds no random source, per-player clock, portal, Inhibitor, or W1 retune", () => {
    const sources = [
      "scripts/anomaly-catalog.cjs",
      "scripts/coarse-flow-field.cjs",
      "scripts/sim/seeded-sea.cjs",
    ].map((file) => fs.readFileSync(path.join(ROOT, file), "utf8")).join("\n");
    assert(!sources.includes("Math.random"), "shipping-trio adapters must use no new random source");
    assert(!sources.includes("timeScale") && !sources.includes("timeSlow"), "shipping-trio adapters must not add time dilation");
    assert(!JSON.stringify(serverCatalog.ANOMALY_CATALOG).includes("exactly one"), "catalog must not claim an endgame owner");
    const runtime = fs.readFileSync(path.join(ROOT, "scripts/sim-runtime.cjs"), "utf8");
    assert(runtime.includes("collapseEpochState?.parameterVector"), "existing epoch vector seam must remain authoritative");
    assert(runtime.includes("runtime.mapState.anomalyCatalog"), "runtime must retain catalog truth");
  });

  await runner.run("live snapshot exposes selected cast and per-well signature truth", async () => {
    await startSimServer(SIM_PORT, { keepAlive: true });
    try {
      const start = await requestJson("/session/start", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          mapId: "deep-field",
          requesterId: "w2a3-shipping-trio",
          requesterName: "W2-A3 proof",
          seed: 424242,
        }),
      });
      assert.strictEqual(start.status, 200);
      const snapshot = await requestJson("/snapshot");
      assert.strictEqual(snapshot.status, 200);
      const body = snapshot.body;
      const sessionCast = body.session.anomalyCatalog;
      assert.deepStrictEqual(body.world.anomalyCatalog, sessionCast);
      assert.strictEqual(body.world.wells.length, sessionCast.cast.length);
      body.world.wells.forEach((well, index) => {
        const castEntry = sessionCast.cast[index];
        assert.strictEqual(well.catalogId, castEntry.catalogId);
        assert.strictEqual(well.fabricSignatureId, castEntry.fabricSignatureId);
        assert.deepStrictEqual(well.fabricSignature, castEntry.fabricSignature);
        assert.strictEqual(castEntry.shipping, true);
      });
      assert(body.world.authoritativeField?.data, "snapshot must retain the server field packet");
    } finally {
      await stopSimServer(SIM_PORT).catch(() => null);
    }
  });

  const passed = runner.summary();
  process.exit(passed ? 0 : 1);
}

run().catch((error) => {
  console.error("W2A3ShippingTrio fatal error:", error.stack || error.message);
  process.exit(1);
});
