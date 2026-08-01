const path = require('path');
const { pathToFileURL } = require('url');
const { TestRunner, assert } = require('./helpers.cjs');

const ROOT = path.resolve(__dirname, '..');
const DT = 1 / 30;

async function run() {
  const runner = new TestRunner('LocalPlayerReconciliation');
  const coords = await import(pathToFileURL(path.join(ROOT, 'src/coords.js')).href);
  const movement = await import(pathToFileURL(path.join(ROOT, 'src/content/movement-step.js')).href);
  const reconciliation = await import(pathToFileURL(path.join(ROOT, 'src/sim/local-player-reconciliation.js')).href);
  const { UNIT_SCALE } = await import(pathToFileURL(path.join(ROOT, 'src/content/units.js')).href);
  const { SimClient } = await import(pathToFileURL(path.join(ROOT, 'src/sim/sim-client.js')).href);
  coords.setWorldScale(3);

  const brain = { thrustScale: 1, dragScale: 1, currentCoupling: 1 };
  const inputConfig = movement.MOVEMENT_INPUT;
  const player = (overrides = {}) => ({
    status: 'alive',
    wx: 1,
    wy: 1,
    vx: 0,
    vy: 0,
    deltaV: 80,
    deltaVMax: 100,
    deltaVRegen: 1.5,
    deltaVRegenBoost: 6,
    deltaVBurnEff: 1,
    deltaVBurnRate: 12,
    timeSinceThrust: 0,
    slingshot: { phase: 'idle' },
    ...overrides,
  });

  const rebase = (state, source, options = {}) => reconciliation.rebaseLocalPlayerReconciliation(
    state,
    source,
    { runId: options.runId || 'run-a', now: options.now || 0, brain, inputConfig, ...options },
  );
  const advance = (state, input, now, options = {}) => reconciliation.advanceLocalPlayerReconciliation(state, {
    dt: DT,
    now,
    input,
    ...options,
  });

  await runner.run('SimClient keeps pending movement private and bounded', async () => {
    const client = new SimClient('http://local-authority.invalid');
    client.commandCredential = 'test-command';
    client.authorityRunId = 'run-a';
    client.runId = 'run-a';
    client._json = async () => ({ acceptedSeq: client.seq, tick: client.seq });
    for (let index = 0; index < 34; index += 1) {
      await client.sendInput({
        moveX: 0.25,
        moveY: -0.5,
        thrust: 0.75,
        brake: 0.1,
      });
    }
    const pending = client.getPendingInputs();
    assert(pending.length === 32, `Expected bounded pending payloads, got ${pending.length}`);
    assert(pending[pending.length - 1].moveX === 0.25, 'Expected pending moveX');
    assert(pending[pending.length - 1].moveY === -0.5, 'Expected pending moveY');
    assert(pending[pending.length - 1].thrust === 0.75, 'Expected pending thrust');
    assert(pending[pending.length - 1].brake === 0.1, 'Expected pending brake');
    client._recordSnapshotMetrics({
      players: [{ clientId: client.clientId, lastInputSeq: client.seq }],
    });
    assert(client.getPendingInputs().length === 0, 'Expected acknowledged payloads to be pruned');
  });

  await runner.run('thrust starts locally before the next authority snapshot', async () => {
    let state = reconciliation.createLocalPlayerReconciliationState({ brain, inputConfig });
    state = rebase(state, player(), {
      pendingInputs: [{ seq: 1, thrust: 1 }],
      acknowledgedSeq: 0,
    }).state;
    assert(state.pendingInputCount === 1, 'Expected pending input metadata to remain local');
    assert(state.lastAcknowledgedSeq === 0, 'Expected snapshot ack sequence to be retained');
    const start = state.wx;
    state = advance(state, { moveX: 1, moveY: 0, thrust: 1, brake: 0 }, 16).state;
    assert(state.wx > start, `Expected local thrust displacement, got ${state.wx - start}`);
    assert(state.vx > 0, `Expected local thrust velocity, got ${state.vx}`);
  });

  await runner.run('release coasts while correction stays blended', async () => {
    let state = reconciliation.createLocalPlayerReconciliationState({ brain, inputConfig });
    state = rebase(state, player({ vx: 0.8 })).state;
    const before = state.vx;
    state = advance(state, { moveX: 1, moveY: 0, thrust: 0, brake: 0 }, 16).state;
    assert(state.vx > 0 && state.vx < before, `Expected coasting decay, got ${state.vx}`);
    assert(state.lastMode === 'blend', `Expected blended presentation, got ${state.lastMode}`);
  });

  await runner.run('latest unacknowledged command survives local release until ack', async () => {
    const held = [{
      seq: 1,
      sentAt: 0,
      moveX: 1,
      moveY: 0,
      thrust: 1,
      brake: 0,
    }];
    const releasedInput = { moveX: 1, moveY: 0, thrust: 0, brake: 0 };
    let state = reconciliation.createLocalPlayerReconciliationState({ brain, inputConfig });
    state = rebase(state, player(), {
      pendingInputs: held,
      acknowledgedSeq: 0,
    }).state;
    const fuelBeforePending = state.deltaV;
    state = advance(state, releasedInput, 16, {
      pendingInputs: held,
      acknowledgedSeq: 0,
    }).state;
    assert(state.predictionInputSource === 'pending', 'Expected pending command to drive prediction');
    assert(state.predictionInputSeq === 1, `Expected pending seq 1, got ${state.predictionInputSeq}`);
    assert(state.deltaV < fuelBeforePending, 'Expected unacknowledged held thrust to keep applying');

    const fuelAtAck = state.deltaV;
    state = advance(state, releasedInput, 32, {
      pendingInputs: held,
      acknowledgedSeq: 1,
    }).state;
    assert(state.predictionInputSource === 'current', 'Expected acked command to stop prediction');
    assert(state.predictionInputSeq === null, 'Expected no pending prediction sequence after ack');
    assert(state.deltaV >= fuelAtAck, 'Expected acked thrust to stop consuming fuel');
  });

  await runner.run('brake reversal responds locally without waiting for authority', async () => {
    let state = reconciliation.createLocalPlayerReconciliationState({ brain, inputConfig });
    state = rebase(state, player({ vx: 0.5 })).state;
    state = advance(state, { moveX: -1, moveY: 0, thrust: 0, brake: 1 }, 16).state;
    assert(state.vx < 0.5, `Expected brake to reduce velocity, got ${state.vx}`);
  });

  await runner.run('coupling, gravity, and wave ledger hints bend presentation between snapshots', async () => {
    let state = reconciliation.createLocalPlayerReconciliationState({ brain, inputConfig });
    state = rebase(state, player({ forceLedger: {
      vectors: {
        coupling: { x: UNIT_SCALE.metersPerSimUnit, y: 0 },
        gravity: { x: 0, y: 0 },
        wave: { x: 0, y: 0 },
      },
    } })).state;
    state = advance(state, { moveX: 0, moveY: 0, thrust: 0, brake: 0 }, 100).state;
    assert(state.vx > 0, `Expected authority force hint to bend velocity, got ${state.vx}`);
  });

  await runner.run('ordinary snapshot rebases refresh authoritative fuel state', async () => {
    let state = reconciliation.createLocalPlayerReconciliationState({ brain, inputConfig });
    state = rebase(state, player()).state;
    state = advance(state, { moveX: 1, moveY: 0, thrust: 1, brake: 0 }, 16).state;
    assert(state.deltaV < 80, `Expected local prediction to spend fuel, got ${state.deltaV}`);

    const refreshed = rebase(state, player({
      wx: state.wx + 0.1,
      deltaV: 61,
      deltaVMax: 120,
      deltaVRegen: 2.5,
      deltaVRegenBoost: 9,
      deltaVBurnEff: 1.25,
      deltaVBurnRate: 14,
      timeSinceThrust: 0.4,
    }), { now: 40 });
    assert(refreshed.hardReset === false, 'Expected ordinary fuel snapshot to blend');
    assert(refreshed.state.deltaV === 61, 'Expected authoritative fuel value');
    assert(refreshed.state.deltaVMax === 120, 'Expected authoritative fuel capacity');
    assert(refreshed.state.deltaVRegen === 2.5, 'Expected authoritative regen rate');
    assert(refreshed.state.deltaVRegenBoost === 9, 'Expected authoritative regen boost');
    assert(refreshed.state.deltaVBurnEff === 1.25, 'Expected authoritative burn efficiency');
    assert(refreshed.state.deltaVBurnRate === 14, 'Expected authoritative burn rate');
    assert(refreshed.state.timeSinceThrust === 0.4, 'Expected authoritative regen timer');
  });

  await runner.run('ordinary corrections do not teleport', async () => {
    let state = reconciliation.createLocalPlayerReconciliationState({ brain, inputConfig });
    state = rebase(state, player()).state;
    state = advance(state, { moveX: 1, moveY: 0, thrust: 1, brake: 0 }, 16).state;
    const result = rebase(state, player({ wx: state.wx + 0.1 }), { now: 40 });
    assert(result.hardReset === false, 'Expected small correction to blend');
    assert(result.state.lastMode === 'rebase', `Expected rebase mode, got ${result.state.lastMode}`);
  });

  await runner.run('slingshot phase updates blend without a presentation teleport', async () => {
    let state = reconciliation.createLocalPlayerReconciliationState({ brain, inputConfig });
    state = rebase(state, player({ slingshot: { phase: 'engaged' } })).state;
    const released = rebase(state, player({
      wx: 1.15,
      vx: 0.25,
      slingshot: { phase: 'release' },
    }), { now: 100 });
    assert(released.hardReset === false, 'Expected slingshot release phase to rebase without a hard snap');
    assert(released.state.authority.phase === 'alive', 'Expected latest authoritative status to be retained');
    assert(released.state.lastMode === 'rebase', `Expected blended release rebase, got ${released.state.lastMode}`);
  });

  await runner.run('run changes and catastrophic divergence hard reset', async () => {
    let state = reconciliation.createLocalPlayerReconciliationState({ brain, inputConfig });
    state = rebase(state, player()).state;
    const runChanged = rebase(state, player({ wx: 2 }), { runId: 'run-b', now: 100 });
    assert(runChanged.hardReset === true, 'Expected run change to hard reset');
    const catastrophic = rebase(runChanged.state, player({ wx: 0.1 }), { runId: 'run-b', now: 200 });
    assert(catastrophic.hardReset === true, 'Expected catastrophic divergence to hard reset');
    assert(catastrophic.state.wx === 0.1, 'Expected hard reset to authoritative position');
  });

  const passed = runner.summary();
  process.exit(passed ? 0 : 1);
}

run().catch((error) => {
  console.error(error.stack || error.message);
  process.exit(1);
});
