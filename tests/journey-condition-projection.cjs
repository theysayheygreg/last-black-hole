const assert = require('assert');
const { CONDITION_NAMES, ConditionStore } = require('../src/conditions/index.js');
const {
  createRunConditionInitialValues,
  registerSimDerivedConditions,
} = require('../scripts/sim/condition-adapters.cjs');
const { buildPublicSnapshot } = require('../scripts/sim/public-snapshot.cjs');

const player = {
  clientId: 'journey-pilot',
  name: 'Journey Pilot',
  status: 'alive',
  hullType: 'drifter',
  wx: 0.2,
  wy: 0.3,
  vx: 0,
  vy: 0,
  deltaV: 100,
  deltaVMax: 100,
  heatRatio: 0.25,
  cargo: [{ id: 'salvage-a' }],
  equipped: [],
  consumables: [],
  activeEffects: [],
  effectState: {},
  lastInput: { seq: 1, brake: 0, slingshotEdges: [] },
  noise: { audibleRadiusMeters: 420, listeners: [] },
};
const runtime = {
  session: { status: 'running', runDurationSeconds: 480 },
  simTime: 24,
  mapState: { portals: [] },
  players: new Map([[player.clientId, player]]),
};
const store = new ConditionStore({
  initialValues: createRunConditionInitialValues({
    mapId: 'shallows',
    seed: 12345,
    cosmicSignatureId: 'dead_calm',
  }),
});
registerSimDerivedConditions(store, { getRuntime: () => runtime });
const buildPlayerConditionSnapshot = (owner) => Object.fromEntries(
  CONDITION_NAMES
    .filter((name) => name.startsWith('run.'))
    .map((name) => [name, store.read(name, { runtime, player: owner })])
    .filter(([, value]) => value !== undefined),
);

const snapshot = buildPublicSnapshot({
  session: { id: 'session-a', runId: 'run-a', status: 'running' },
  clock: { tick: 10, simTime: 24, serverTime: 1000, lastEventSeq: 0 },
  bench: null,
  players: [player],
  world: {
    mapState: {
      anomalyCatalog: [], wells: [], stars: [], wrecks: [], planetoids: [], portals: [],
      scavengers: [], fauna: [], sentries: [], nextPortalWindowIndex: 0, nextPortalWaveIndex: 0,
    },
    portalSchedule: [], waveRings: [], collapseEpochState: null,
    collapseEpochSchedule: [], growthTimer: 0, getAuthoritativeField: () => null,
  },
  inhibitor: { phase: 0, waveId: null, scheduledTime: null, waveBudget: 0 },
  inhibitorEntities: [],
  inhibitorEcology: {},
  recentEvents: [],
}, {
  buildSlingshotTelegraph: () => null,
  buildPlayerRulerFacts: () => null,
  buildPlayerConditionSnapshot,
});

assert.strictEqual(snapshot.players[0].conditions['run.cargo.count'], 1);
assert.strictEqual(snapshot.players[0].conditions['run.noise.radiusMeters'], 420);
assert.strictEqual(snapshot.players[0].conditions['run.map.id'], 'shallows');
assert(!('pilot.currency.exoticMatter' in snapshot.players[0].conditions),
  'public run projection must not leak unrelated durable pilot facts');
console.log('JourneyConditionProjection: canonical run vocabulary PASS');
