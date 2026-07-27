const assert = require('assert');
const path = require('path');
const { pathToFileURL } = require('url');

async function run() {
  const projection = await import(pathToFileURL(path.resolve(__dirname, '../src/bench/identity-projection.js')).href);
  const picking = await import(pathToFileURL(path.resolve(__dirname, '../src/bench/picking.js')).href);
  const snapshot = {
    session: { worldScale: 4 },
    players: [{ clientId: 'pilot', name: 'Probe', hullType: 'drifter', wx: 0.02, wy: 2, status: 'alive' }],
    world: {
      wells: [{ id: 'well-a', catalogId: 'base-well', wx: 2, wy: 2, killRadius: 0.1, mass: 2 }],
      stars: [{ id: 'star-a', type: 'redGiant', wx: 1, wy: 1 }],
      wrecks: [{ id: 'wreck-a', type: 'derelict', size: 'large', wx: 1.5, wy: 1.5, loot: [{ id: 'salvage' }] }],
      debris: [{ id: 'debris-a', type: 'scrap', wx: 1.7, wy: 1.5 }],
      loot: [{ id: 'loot-a', kind: 'fuel', wx: 1.8, wy: 1.5 }],
      portals: [{ id: 'portal-a', type: 'rift', wx: 3, wy: 3, captureRadius: 0.12 }],
      objectives: [{ objectiveId: 'extract', type: 'extraction', wx: 3, wy: 3 }],
      planetoids: [{ id: 'planet-a', pathType: 'orbit', wx: 0.5, wy: 0.5 }],
      scavengers: [
        { id: 'scav-b', archetype: 'vulture', wx: 2.5, wy: 2.5, state: 'patrol' },
        { id: 'scav-a', archetype: 'vulture', wx: 2.7, wy: 2.5, state: 'chase' },
      ],
      enemies: [{ id: 'enemy-a', archetype: 'hunter', wx: 2.8, wy: 2.5 }],
      sentries: [{ id: 'sentry-a', state: 'patrol', wx: 2.4, wy: 2.4 }],
      fauna: [{ id: 'fauna-a', type: 'jelly', wx: 0.8, wy: 0.8 }],
      waveRings: [{ id: 'wave-a', sourceWX: 2, sourceWY: 2, radius: 0.3, amplitude: 0.7 }],
      collapseEpoch: { epochId: 'approach', epochIndex: 1, transitionCount: 1 },
    },
    inhibitor: {
      phase: 1,
      ecology: { reachedKinds: ['glitch'] },
      entities: [{ id: 'inhibitor-glitch-1', kind: 'glitch', wx: 3.5, wy: 3.5, radius: 0.18 }],
    },
  };

  const identities = projection.projectBenchIdentities(snapshot);
  const families = new Set(identities.map(({ family }) => family));
  for (const family of [...projection.BENCH_IDENTITY_FAMILIES, 'inhibitor', 'collapseEpoch']) {
    assert(families.has(family), `missing projected family ${family}`);
  }
  assert.strictEqual(identities.find(({ key }) => key === 'wrecks:wreck-a').context.lootCount, 1);
  assert.strictEqual(identities.find(({ key }) => key === 'wells:well-a').tunableContract, null,
    'identity projection must not fake tuning support');
  assert.deepStrictEqual(projection.resolveBenchWorldBounds(snapshot), { width: 4, height: 4 });
  const duplicateIds = projection.projectBenchIdentities({ world: {
    wrecks: [{ id: 'same', wx: 0, wy: 0 }, { id: 'same', wx: 1, wy: 1 }],
  } });
  assert.deepStrictEqual(duplicateIds.map(({ id, key }) => ({ id, key })), [
    { id: 'same', key: 'wrecks:same' }, { id: 'same', key: 'wrecks:same#2' },
  ], 'duplicate authority ids should remain visible while selection keys stay unique');

  const tieFixture = [
    { key: 'stars:z', family: 'stars', archetype: 'same', groupKey: 'stars:same', position: { x: 1, y: 1 }, radius: 1 },
    { key: 'stars:a', family: 'stars', archetype: 'same', groupKey: 'stars:same', position: { x: 1, y: 1 }, radius: 1 },
  ];
  assert.strictEqual(picking.pickBenchIdentity(tieFixture, { x: 1, y: 1 }).key, 'stars:a',
    'equal-distance picks must use stable identity key order');
  assert.strictEqual(picking.pickBenchIdentity(identities, { x: 3.99, y: 2 }, {
    bounds: projection.resolveBenchWorldBounds(snapshot),
  }).key, 'players:pilot', 'picking should wrap across authority world bounds');

  const selectedScavenger = identities.find(({ key }) => key === 'scavengers:scav-a');
  assert.deepStrictEqual(
    picking.selectBenchIdentityGroup(identities, selectedScavenger).map(({ key }) => key),
    ['scavengers:scav-a', 'scavengers:scav-b'],
    'type selection should include and stably order every matching archetype instance',
  );

  assert.deepStrictEqual(projection.projectBenchIdentities(null), []);
  assert.deepStrictEqual(projection.projectBenchIdentities({ players: [null], world: { wells: 'bad' } })[0].position, null);
  assert.strictEqual(picking.pickBenchIdentity(null, { x: 0, y: 0 }), null);
  assert.strictEqual(picking.pickBenchIdentity(identities, null), null);

  console.log(`BenchIdentity: ${identities.length} identities; family, tie, group, wrap, and partial-snapshot proofs passed`);
}

run().catch((error) => {
  console.error(error.stack || error.message);
  process.exit(1);
});
