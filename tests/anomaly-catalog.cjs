const assert = require('assert');
const crypto = require('crypto');
const path = require('path');
const { TestRunner } = require('./helpers.cjs');
const serverCatalog = require('../scripts/anomaly-catalog.cjs');
const { createRNGStreams } = require('../scripts/rng-stream.cjs');

const ROOT = path.resolve(__dirname, '..');

function hash(value) {
  return crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex').slice(0, 16);
}

async function loadClientCatalog() {
  return import(`file://${path.join(ROOT, 'src/anomaly-catalog.js')}?test=${Date.now()}`);
}

async function run() {
  const runner = new TestRunner('AnomalyCatalog');
  const clientCatalog = await loadClientCatalog();

  await runner.run('schema validates and browser/server manifests match', () => {
    assert(serverCatalog.assertValidAnomalyCatalog());
    assert(clientCatalog.assertValidAnomalyCatalog());
    assert.deepStrictEqual(clientCatalog.ANOMALY_CATALOG, serverCatalog.ANOMALY_CATALOG);
    assert.deepStrictEqual(clientCatalog.ANOMALY_MAP_POLICIES, serverCatalog.ANOMALY_MAP_POLICIES);
    assert.deepStrictEqual(clientCatalog.ANOMALY_CATALOG_DATA, require('../src/content/anomalies.data.json'));
  });

  await runner.run('base-well migration preserves gameplay fields exactly', () => {
    const legacy = {
      id: 'well-1',
      wx: 1.0,
      wy: 1.2,
      mass: 1.5,
      startMass: 1.5,
      growthRate: 0.021,
      orbitalDir: -1,
      baseKillRadius: 0.06,
      killRadius: 0.06027,
      spinRate: 0.6,
      points: 8,
    };
    const migrated = serverCatalog.migrateCurrentWell(legacy, 'base-well');
    for (const key of Object.keys(legacy)) assert.deepStrictEqual(migrated[key], legacy[key], `${key} changed`);
    const beforeHash = hash(Object.keys(legacy).map((key) => [key, legacy[key]]));
    const afterHash = hash(Object.keys(legacy).map((key) => [key, migrated[key]]));
    assert.strictEqual(beforeHash, afterHash, `gameplay parity hash changed: ${beforeHash} -> ${afterHash}`);
    assert.strictEqual(migrated.catalogId, 'base-well');
    assert.strictEqual(migrated.behaviorId, 'base-well');
  });

  await runner.run('same seed produces identical Expanse cast identity in both runtimes', () => {
    const server = serverCatalog.selectAnomalyCast({
      mapId: 'expanse', seed: 424242, wellCount: 8, rngStreams: createRNGStreams(424242),
    });
    const client = clientCatalog.selectAnomalyCast({ mapId: 'expanse', seed: 424242, wellCount: 8 });
    assert.strictEqual(server.castIdentity, client.castIdentity);
    assert.deepStrictEqual(server.eligibleMap, client.eligibleMap);
    assert.strictEqual(hash(server.cast), hash(client.cast));
  });

  await runner.run('different seed diverges the eligible map for seeded maps', () => {
    const first = serverCatalog.selectAnomalyCast({ mapId: 'deep-field', seed: 424242, wellCount: 15, rngStreams: createRNGStreams(424242) });
    const second = serverCatalog.selectAnomalyCast({ mapId: 'deep-field', seed: 424243, wellCount: 15, rngStreams: createRNGStreams(424243) });
    assert.notStrictEqual(hash(first.eligibleMap), hash(second.eligibleMap));
  });

  await runner.run('Shallows stays on the fixed curated base cast', () => {
    const first = serverCatalog.selectAnomalyCast({ mapId: 'shallows', seed: 1, wellCount: 4, rngStreams: createRNGStreams(1) });
    const second = serverCatalog.selectAnomalyCast({ mapId: 'shallows', seed: 999999, wellCount: 4, rngStreams: createRNGStreams(999999) });
    assert.strictEqual(first.policy, 'fixed-curated');
    assert.strictEqual(first.castIdentity, 'base-well|base-well|base-well|base-well');
    assert.strictEqual(first.castIdentity, second.castIdentity);
    assert.strictEqual(hash(first.eligibleMap), hash(second.eligibleMap));
  });

  const passed = runner.summary();
  const parityFixture = {
    wx: 1.0,
    wy: 1.2,
    mass: 1.5,
    startMass: 1.5,
    growthRate: 0.021,
    orbitalDir: -1,
    baseKillRadius: 0.06,
    killRadius: 0.06027,
    spinRate: 0.6,
    points: 8,
  };
  const migratedFixture = serverCatalog.migrateCurrentWell(parityFixture, 'base-well');
  const parityKeys = Object.keys(parityFixture);
  const parityBeforeHash = hash(parityKeys.map((key) => [key, parityFixture[key]]));
  const parityAfterHash = hash(parityKeys.map((key) => [key, migratedFixture[key]]));
  const sample = serverCatalog.selectAnomalyCast({ mapId: 'expanse', seed: 424242, wellCount: 8, rngStreams: createRNGStreams(424242) });
  console.log(`AnomalyCatalog: schema=${serverCatalog.ANOMALY_CATALOG_SCHEMA_VERSION} parityBefore=${parityBeforeHash} parityAfter=${parityAfterHash} castHash=${hash(sample.cast)} eligibleHash=${hash(sample.eligibleMap)}`);
  process.exit(passed ? 0 : 1);
}

run().catch((error) => {
  console.error('AnomalyCatalog test fatal error:', error.stack || error.message);
  process.exit(1);
});
