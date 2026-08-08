const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { BrowserJourneyDriver, evaluateValues } = require('./journey/browser-driver.cjs');

const driverPath = path.join(__dirname, 'journey', 'browser-driver.cjs');
const source = fs.readFileSync(driverPath, 'utf8');

assert.strictEqual(evaluateValues({ condition: 'run.cargo.count', gte: 1 }, { 'run.cargo.count': 2 }), true);
assert.strictEqual(evaluateValues({ all: [
  { condition: 'run.cargo.count', gte: 1 },
  { condition: 'run.map.id', equals: 'shallows' },
] }, { 'run.cargo.count': 1, 'run.map.id': 'shallows' }), true);
assert.strictEqual(evaluateValues({ not: { condition: 'run.grapple.active' } }, { 'run.grapple.active': false }), true);

assert(source.includes("require('../../scripts/sim/world-geometry.cjs')"),
  'Journey movement must consume the canonical authority geometry owner');
assert(source.includes('approachTargetId: target.id'),
  'Journey approach must pass explicit target intent into shared Phase 1A movement');
assert(source.includes('sendRemoteInput'),
  'Journey gameplay actions must use the ordinary remote input seam');
assert(!source.includes('startRemoteGameNow'),
  'Journey launch must use the ordinary title/profile/Home/map-select input path');
assert(!source.includes('/debug/player-state'),
  'Journey gameplay actions must not mutate authoritative player state through debug setup');
assert(!source.includes('teleportShip'),
  'Journey gameplay actions must not teleport through a test surface');
assert(!/stoppingDistance|v\s*\*\s*v|resolveHazard/.test(source),
  'Journey controller must not reintroduce retired stopping or hazard controller math');
assert(source.includes('getJourneyState?.()?.authorityEvents'),
  'Journey waits must consume the authenticated client event history');
assert(!source.includes("fetch(`${this.simUrl}/events"),
  'Journey waits must not use the unauthenticated public event route');
assert(!source.includes('showUiFixture'),
  'Journey UI actions must not fabricate state through fixture APIs');
assert(source.includes("value === 'paused'") && source.includes("value === 'profileSelect'"),
  'Journey UI actions must observe real phase transitions');

async function probeDriverPolicies() {
  const sent = [];
  const page = {
    evaluate: async (_fn, body) => { sent.push(body); return { ok: true }; },
    keyboard: { press: async () => {} },
  };
  const driver = new BrowserJourneyDriver({ page, simUrl: 'http://journey.invalid', artifactRoot: '/tmp' });
  const snapshot = {
    session: { worldScale: 3 },
    world: {
      wells: [{ id: 'well-1', wx: 0.2, wy: 0.1, alive: true }],
      wrecks: [{ id: 'wreck-1', wx: 0.11, wy: 0.1, alive: true }],
      portals: [],
    },
  };
  assert.strictEqual(driver.findTarget(snapshot, { wx: 0.1, wy: 0.1 }, { targetPolicy: 'nearest-well' }).id, 'well-1');
  await driver.dispatchAction('grapple');
  await driver.dispatchAction('releaseGrapple');
  assert.deepStrictEqual(sent[0], { slingshot: true, slingshotEdges: [1] });
  assert.deepStrictEqual(sent[1], { slingshot: false });
}

probeDriverPolicies().then(() => {
  console.log('JourneyDriverContract: real input and shared movement owner PASS');
}).catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
