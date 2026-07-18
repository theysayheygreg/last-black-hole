const assert = require('assert');

let passed = 0;

async function test(name, fn) {
  await fn();
  passed += 1;
  console.log(`  PASS ${name}`);
}

function contract(id, overrides = {}) {
  return {
    id,
    label: `Label ${id}`,
    effect: `Changes ${id} for the selected archetype.`,
    group: 'Movement',
    unit: 'm',
    min: 0,
    max: 10,
    step: 1,
    scope: 'type',
    applies: 'live',
    drawKind: 'radius',
    reset: 'session baseline',
    ...overrides,
  };
}

(async () => {
  const registryModule = await import('../src/bench/contract-registry.js');
  const inspector = await import('../src/bench/inspector.js');
  const patchModule = await import('../src/bench/patch-session.js');

  await test('registry rejects incomplete metadata, duplicates, and implicit adapters', () => {
    const registry = registryModule.createBenchContractRegistry();
    const base = {
      id: 'probe-ship',
      identity: { family: 'ships', type: 'probe' },
      contracts: [contract('radius')],
      read: () => 4,
      apply: () => {},
    };
    registry.register(base);
    assert.throws(() => registry.register(base), /Duplicate Bench adapter id/);
    assert.throws(() => registryModule.validateBenchContract({ ...contract('bad'), effect: '' }), /effect/);
    assert.throws(() => registryModule.validateBenchContract({ ...contract('bad'), scope: 'instance' }), /scope/);
    assert.throws(() => registryModule.validateBenchContract({ ...contract('bad'), min: 0, max: null }), /all null/);
    assert.throws(() => registry.register({ ...base, id: 'implicit', identity: { family: 'ships', type: 'other' }, apply: null }), /explicit read and apply/);
  });

  await test('inspector is generated only from curated metadata and reports unsupported identity exactly', async () => {
    const secretRuntimeObject = { radius: 99, secret: 'must not leak' };
    const registry = registryModule.createBenchContractRegistry([{
      id: 'probe-ship',
      label: 'Probe Ship',
      identity: { family: 'ships', type: 'probe' },
      contracts: [contract('radius')],
      read: ({ propertyId }) => propertyId === 'radius' ? 4 : secretRuntimeObject,
      apply: () => {},
    }]);
    const view = await inspector.createBenchInspectorViewModel(registry, { family: 'ships', type: 'probe', runtime: secretRuntimeObject });
    assert.strictEqual(view.supported, true);
    assert.strictEqual(view.rows.length, 1);
    assert.strictEqual(view.rows[0].value, 4);
    assert.strictEqual(JSON.stringify(view).includes('must not leak'), false);

    const unsupported = await inspector.createBenchInspectorViewModel(registry, { family: 'fauna', type: 'manta' });
    assert.strictEqual(unsupported.supported, false);
    assert.strictEqual(unsupported.status, 'NO TUNABLE CONTRACT YET');
    assert.deepStrictEqual(unsupported.rows, []);
  });

  await test('patch session separates live-applied and banked restart edits', async () => {
    const values = { radius: 4, palette: 'blue' };
    const applied = [];
    const identity = { family: 'ships', type: 'probe' };
    const registry = registryModule.createBenchContractRegistry([{
      id: 'probe-ship',
      identity,
      contracts: [
        contract('radius'),
        contract('palette', { unit: 'name', min: null, max: null, step: null, applies: 'restart', drawKind: 'select' }),
      ],
      read: ({ propertyId }) => values[propertyId],
      apply: (edit) => { applied.push(edit); values[edit.propertyId] = edit.value; },
    }]);
    const session = new patchModule.BenchPatchSession(registry);
    await session.setProperty(identity, 'radius', 6);
    await session.setProperty(identity, 'palette', 'amber');
    assert.strictEqual(values.radius, 6);
    assert.strictEqual(values.palette, 'blue');
    assert.deepStrictEqual(session.liveApplied().map((edit) => edit.propertyId), ['radius']);
    assert.deepStrictEqual(session.bankedRestart().map((edit) => edit.propertyId), ['palette']);
    assert.strictEqual(applied.length, 1);
  });

  await test('reset property, reset type, revert all, and undo restore authority values', async () => {
    const values = { radius: 4, speed: 3 };
    const identity = { family: 'ships', type: 'probe' };
    const registry = registryModule.createBenchContractRegistry([{
      id: 'probe-ship', identity,
      contracts: [contract('radius'), contract('speed')],
      read: ({ propertyId }) => values[propertyId],
      apply: ({ propertyId, value }) => { values[propertyId] = value; },
    }]);
    const session = new patchModule.BenchPatchSession(registry);
    await session.setProperty(identity, 'radius', 6);
    await session.setProperty(identity, 'speed', 7);
    await session.resetProperty(identity, 'radius');
    assert.deepStrictEqual(values, { radius: 4, speed: 7 });
    await session.undoLastChange();
    assert.deepStrictEqual(values, { radius: 6, speed: 7 });
    await session.resetType(identity);
    assert.deepStrictEqual(values, { radius: 4, speed: 3 });
    await session.undoLastChange();
    assert.deepStrictEqual(values, { radius: 6, speed: 7 });
    await session.revertAll();
    assert.deepStrictEqual(values, { radius: 4, speed: 3 });
    assert.strictEqual(session.edits().length, 0);
  });

  await test('validated JSON roundtrip rejects arbitrary values and timing lies', async () => {
    const identity = { family: 'ships', type: 'probe' };
    const values = { radius: 4, palette: 'blue' };
    const makeRegistry = () => registryModule.createBenchContractRegistry([{
      id: 'probe-ship', identity,
      contracts: [
        contract('radius'),
        contract('palette', { unit: 'name', min: null, max: null, step: null, applies: 'restart', drawKind: 'select' }),
      ],
      read: ({ propertyId }) => values[propertyId],
      apply: ({ propertyId, value }) => { values[propertyId] = value; },
    }]);
    const first = new patchModule.BenchPatchSession(makeRegistry());
    await first.setProperty(identity, 'radius', 8);
    await first.setProperty(identity, 'palette', 'amber');
    const json = first.exportJSON();
    const second = new patchModule.BenchPatchSession(makeRegistry());
    await second.importJSON(json);
    assert.deepStrictEqual(JSON.parse(second.exportJSON()), JSON.parse(json));

    const badObject = JSON.parse(json);
    badObject.edits[0].value = { merged: 'runtime object' };
    await assert.rejects(() => second.importJSON(badObject), /JSON scalar/);
    const timingLie = JSON.parse(json);
    timingLie.edits[0].status = 'banked-restart';
    await assert.rejects(() => second.importJSON(timingLie), /timing mismatch/);
    const offStep = JSON.parse(json);
    offStep.edits[0].value = 8.5;
    await assert.rejects(() => second.importJSON(offStep), /align to step/);
  });

  console.log(`BenchInspector: ${passed}/5 passed`);
})().catch((error) => {
  console.error(error.stack || error.message);
  process.exit(1);
});
