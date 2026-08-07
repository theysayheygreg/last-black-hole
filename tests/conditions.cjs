const assert = require('assert');

async function main() {
  const {
    CONDITION_DEFINITIONS,
    CONDITION_SCHEMA_VERSION,
    ConditionStore,
    getConditionDefinition,
    sanitizeConditionValues,
    validateConditionQuery,
  } = await import('../src/conditions/index.js');

  assert.strictEqual(CONDITION_SCHEMA_VERSION, 1);
  assert(CONDITION_DEFINITIONS.every((definition) => definition.name.startsWith(`${definition.scope}.`)));
  assert(!CONDITION_DEFINITIONS.some((definition) => definition.scope === 'install'));
  assert(!CONDITION_DEFINITIONS.some((definition) => definition.scope === 'session'));
  assert.throws(() => getConditionDefinition('pilot.unknown'), /Unknown condition/);
  assert.strictEqual(getConditionDefinition('pilot.unlock.map.deepField').default, true);
  assert.strictEqual(getConditionDefinition('pilot.progression.legacy.dragRank').maximum, 3);

  const store = new ConditionStore({
    initialValues: {
      schemaVersion: 0,
      values: {
        'pilot.currency.exoticMatter': 12,
        'pilot.chronicle.extractions': 'retired-bad-value',
        'pilot.retiredKey': true,
        'run.cargo.count': 99,
      },
    },
  });
  assert.strictEqual(store.read('pilot.currency.exoticMatter'), 12);
  assert.strictEqual(store.read('pilot.chronicle.extractions'), 0);
  assert.strictEqual(store.migrationIssues.length, 3);

  assert.strictEqual(store.mutate('increment', 'pilot.currency.exoticMatter', 8), 20);
  assert.strictEqual(store.mutate('max', 'pilot.chronicle.bestSurvivalSeconds', 32.5), 32.5);
  assert.strictEqual(store.mutate('max', 'pilot.chronicle.bestSurvivalSeconds', 12), 32.5);
  assert.strictEqual(store.mutate('initialize', 'run.map.id', 'shallows'), 'shallows');
  assert.strictEqual(store.mutate('initialize', 'run.id', 'run-123'), 'run-123');
  assert.strictEqual(store.mutate('initialize', 'run.map.id', 'expanse'), 'shallows');
  assert.throws(() => store.mutate('set', 'run.map.id', 'expanse'), /not declared/);
  assert.throws(() => store.mutate('set', 'pilot.currency.exoticMatter', -1), /at least 0/);
  assert.throws(() => store.mutate('set', 'pilot.currency.exoticMatter', 1.5), /safe integer/);
  assert.throws(() => store.mutate('set', 'pilot.progression.legacy.dragRank', 4), /at most 3/);
  assert.throws(() => store.mutate('increment', 'pilot.unlock.vaultAccess', 1), /not declared/);
  assert.throws(() => store.mutate('set', 'run.cargo.count', 2), /read-only/);

  store.registerDerived('run.cargo.count', (context) => context.player.cargo.filter(Boolean).length);
  store.registerDerived('run.hull.integrity', (context) => 1 - context.player.hullDamage);
  assert.strictEqual(store.read('run.cargo.count', { player: { cargo: [{}, null, {}] } }), 2);
  assert.throws(() => store.read('run.heat.ratio', {}), /No derived provider/);
  assert.throws(
    () => new ConditionStore({ derivedProviders: { 'run.hull.integrity': () => 2 } }).read('run.hull.integrity'),
    /at most 1/,
  );

  const context = { player: { cargo: [{}, null, {}], hullDamage: 0.25 } };
  const query = {
    all: [
      { condition: 'pilot.currency.exoticMatter', gte: 20 },
      { condition: 'run.cargo.count', equals: 2 },
      { not: 'pilot.unlock.expandedVault' },
    ],
  };
  assert(Object.isFrozen(validateConditionQuery(query)));
  assert.strictEqual(store.evaluate(query, context), true);
  assert.strictEqual(store.assert(query, context), true);
  assert.throws(() => validateConditionQuery({ condition: 'pilot.hull.selectedId', gt: 'drifter' }), /numeric/);
  assert.throws(() => validateConditionQuery({ any: [] }), /non-empty/);
  assert.throws(() => validateConditionQuery({ condition: 'pilot.currency.exoticMatter', bogus: 2 }), /at most one comparison/);

  const pilotOnly = store.serialize({ scopes: ['pilot'] });
  assert.deepStrictEqual(pilotOnly, {
    schemaVersion: 1,
    values: {
      'pilot.currency.exoticMatter': 20,
      'pilot.chronicle.bestSurvivalSeconds': 32.5,
    },
  });
  store.clearScope('run');
  assert.strictEqual(store.read('run.map.id'), undefined);
  assert.strictEqual(store.read('run.id'), undefined);
  assert.throws(() => store.clearScope('pilot'), /cannot be cleared/);

  const sanitized = sanitizeConditionValues({
    'pilot.unlock.hull.drifter': true,
    'run.modifier.cosmicSignatureId': 'not-real',
    'session.fake': true,
  });
  assert.deepStrictEqual(sanitized.values, { 'pilot.unlock.hull.drifter': true });
  assert.strictEqual(sanitized.issues.length, 2);

  console.log('conditions: ok');
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
