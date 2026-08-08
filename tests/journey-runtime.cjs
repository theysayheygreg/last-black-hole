const assert = require('assert');
const { pathToFileURL } = require('url');
const path = require('path');

async function loadJourney() {
  return import(pathToFileURL(path.join(__dirname, '..', 'src', 'journey', 'index.js')).href);
}

async function loadConditions() {
  return import(pathToFileURL(path.join(__dirname, '..', 'src', 'conditions', 'index.js')).href);
}

function baseJourney(overrides = {}) {
  return {
    id: 'agent.salvage-extract',
    version: 1,
    description: 'Representative authority-backed journey',
    setup: {
      seed: 'journey-seed-1',
      pilot: 'pilot-1',
      hull: 'drifter',
      loadout: ['grapple'],
      map: 'shallows',
      runRules: { signature: 'dead_calm' },
      startingProfileFacts: { 'pilot.unlock.map.shallows': true },
    },
    controllerPolicy: { driver: 'product-input', movement: 'shared' },
    steps: [{ action: 'launch', args: {} }],
    ...overrides,
  };
}

async function main() {
  const {
    JourneyRuntime,
    createJourneyRegistry,
    validateJourneyDefinition,
  } = await loadJourney();
  const { validateConditionQuery } = await loadConditions();

  const registry = createJourneyRegistry({
    actions: ['launch', 'salvage', 'confirmExtraction'],
    conditionValidator: validateConditionQuery,
  });
  registry.registerRoutine('salvageLoop', ({ args }) => [
    { action: 'salvage', args: { targetId: args.targetId }, target: args.targetId },
    { waitForEvent: 'salvage.collected', timeoutMs: 500 },
    { waitForCondition: { condition: 'run.cargo.count', gte: 1 }, timeoutMs: 500, pollMs: 50 },
  ]);

  assert.throws(() => validateJourneyDefinition(baseJourney({ steps: [{ action: 'teleport', args: {} }] }), registry), /Unknown Journey action/);
  assert.throws(() => validateJourneyDefinition(baseJourney({ steps: [{ action: 'launch', frame: 10 }] }), registry), /frame number/);
  assert.throws(() => validateJourneyDefinition(baseJourney({ steps: [{ waitForCondition: 'run.cargo.count', timeoutMs: 0 }] }), registry), /at least 50ms/);
  assert.throws(() => validateJourneyDefinition(baseJourney({ steps: [{ assertCondition: 'run.unknown' }] }), registry), /Unknown condition/);
  assert.throws(() => validateJourneyDefinition(baseJourney({
    knownFailure: { reason: 'natural route flaky', owner: 'journeys', reviewDate: 'tomorrow' },
  }), registry), /ISO calendar date/);

  let now = 0;
  const state = { salvage: 0 };
  const calls = [];
  const clock = {
    now: () => now,
    sleep: async (milliseconds) => {
      now += milliseconds;
      state.salvage = 1;
    },
  };
  const driver = {
    configureSetup: async (setup) => calls.push(['setup', setup.map]),
    configureControllerPolicy: async (policy) => calls.push(['policy', policy.driver]),
    dispatchAction: async (action, args, context) => calls.push(['action', action, args.targetId || null, context.target]),
    waitForEvent: async (event, options) => {
      calls.push(['event', event, options.timeoutMs]);
      return event === 'salvage.collected';
    },
    getAuthorityEvents: () => [{ type: 'salvage.collected', tick: 12 }],
    getEvidencePaths: () => ['/tmp/journey/frame.png'],
    getArtifactManifest: () => [{ type: 'receipt', path: '/tmp/journey/receipt.json' }],
  };
  const conditions = {
    evaluate: async (query) => query.condition === 'run.cargo.count' && state.salvage >= query.gte,
    assert: async (query, _context, _message) => {
      if (query.condition === 'pilot.chronicle.extractions' && state.salvage !== 1) throw new Error('not extracted');
    },
    snapshot: async () => ({ 'run.cargo.count': state.salvage }),
  };
  const runtime = new JourneyRuntime({ registry, driver, conditions, clock });
  const result = await runtime.run(baseJourney({
    steps: [
      { action: 'launch', args: {} },
      { routine: 'salvageLoop', args: { targetId: 'wreck-7' }, target: 'wreck-7' },
      { assertCondition: { condition: 'pilot.chronicle.extractions', gte: 0 } },
    ],
  }));

  assert.strictEqual(result.status, 'passed');
  assert.deepStrictEqual(calls.slice(0, 2), [['setup', 'shallows'], ['policy', 'product-input']]);
  assert.ok(calls.some((call) => call[0] === 'action' && call[1] === 'salvage' && call[2] === 'wreck-7'));
  assert.ok(calls.some((call) => call[0] === 'event' && call[1] === 'salvage.collected'));
  assert.ok(result.steps.some((step) => step.routine === 'salvageLoop' && step.kind === 'waitForCondition'));
  assert.deepStrictEqual(result.conditionSnapshot, { 'run.cargo.count': 1 });
  assert.strictEqual(result.authorityEvents[0].type, 'salvage.collected');
  assert.strictEqual(result.evidencePaths[0], '/tmp/journey/frame.png');
  assert.strictEqual(result.artifactManifest.length, 2);
  assert.match(result.summary, /completed/);

  const failingDriver = {
    ...driver,
    waitForEvent: async () => false,
    getActiveTarget: () => 'portal-9',
  };
  const failingRuntime = new JourneyRuntime({ registry, driver: failingDriver, conditions, clock });
  const knownFailure = await failingRuntime.run(baseJourney({
    knownFailure: { reason: 'authority event pending', owner: 'journeys', reviewDate: '2026-09-01' },
    steps: [
      { action: 'launch', args: {} },
      { waitForEvent: 'portal.ready', timeoutMs: 500, target: 'portal-9' },
    ],
  }));
  assert.strictEqual(knownFailure.status, 'known-failure');
  assert.strictEqual(knownFailure.lastCompletedStep.id, 'action:journey.steps[0]');
  assert.strictEqual(knownFailure.activeTarget, 'portal-9');
  assert.match(knownFailure.error.message, /portal.ready/);
  assert.ok(Array.isArray(knownFailure.authorityEvents));
  assert.ok(Number.isFinite(knownFailure.elapsedMs));

  const unexpectedPass = await runtime.run(baseJourney({
    knownFailure: { reason: 'expected old failure', owner: 'journeys', reviewDate: '2026-09-01' },
  }));
  assert.strictEqual(unexpectedPass.status, 'unexpected-pass');

  console.log('JourneyRuntime: 16/16');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
