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
assert(source.includes('keyboard.down(code)') && source.includes('keyboard.up(code)') && source.includes('holdMs = 70'),
  'Journey menu actions must hold keys across the frame-polled input seam');
assert(source.includes('journeySeq') && source.includes('syntheticEventCursor'),
  'Journey synthetic events must be consumed in sequence across relaunches');
assert(source.includes("navigationPolicy === 'slingshot'") && source.includes("navigationPolicy === 'well-intercept'"),
  'Journey movement policies must have executable shared-input behavior');
assert(source.includes('thrust: braking ? 0') && source.includes('brake: braking ? 1 : 0'),
  'Journey arrival braking must release thrust instead of issuing contradictory full-drive input');
assert(!source.includes('/debug/player-state'),
  'Journey gameplay actions must not mutate authoritative player state through debug setup');
assert(!source.includes('teleportShip'),
  'Journey gameplay actions must not teleport through a test surface');
assert(!/stoppingDistance|v\s*\*\s*v|resolveHazard/.test(source),
  'Journey controller must not reintroduce retired stopping or hazard controller math');
assert(source.includes('getJourneyState?.()?.authorityEvents'),
  'Journey waits must consume the authenticated client event history');
assert(source.includes('getJourneyState?.() || null') && source.includes('players: state.player ? [state.player] : []'),
  'Journey navigation must consume the browser-authenticated authority snapshot');
assert(!source.includes("fetch(`${this.simUrl}/snapshot`)"),
  'Journey navigation must not bypass browser authority through the public snapshot route');
assert(!source.includes("fetch(`${this.simUrl}/events"),
  'Journey waits must not use the unauthenticated public event route');
assert(!source.includes('showUiFixture'),
  'Journey UI actions must not fabricate state through fixture APIs');
assert(source.includes("value === 'paused'") && source.includes("value === 'profileSelect'"),
  'Journey UI actions must observe real phase transitions');
assert(source.includes("value === 'loading' || value === 'playing'"),
  'Journey map confirmation must remain held until the real launch transition consumes it');
assert(source.includes("state.playerStatus === 'alive'"),
  'Journey launch must wait for the browser-owned authoritative player before navigation');

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

async function probeAuthenticatedSnapshot() {
  const authorityState = {
    session: { runId: 'run-1', worldScale: 3 },
    tick: 12,
    simTime: 0.8,
    player: { clientId: 'browser-player', status: 'alive', wx: 1, wy: 1 },
    world: { wrecks: [{ id: 'wreck-1', wx: 1.1, wy: 1.1 }] },
    recentEvents: [{ seq: 1, type: 'player.joined' }],
  };
  const page = { evaluate: async () => authorityState };
  const driver = new BrowserJourneyDriver({ page, artifactRoot: '/tmp' });
  const snapshot = await driver.snapshot();
  assert.strictEqual(snapshot.players[0].clientId, 'browser-player');
  assert.strictEqual(snapshot.session.runId, 'run-1');
  assert.strictEqual(snapshot.world.wrecks[0].id, 'wreck-1');
}

async function probeFramePolledMenuTransition() {
  let pressed = false;
  let frames = 0;
  const keyEvents = [];
  const page = {
    keyboard: {
      down: async (code) => { pressed = true; keyEvents.push(`down:${code}`); },
      up: async (code) => { pressed = false; keyEvents.push(`up:${code}`); },
    },
    evaluate: async () => { frames += 1; },
  };
  const driver = new BrowserJourneyDriver({ page, simUrl: 'http://journey.invalid', artifactRoot: '/tmp' });
  const state = await driver.pressUntilTransition('KeyE', async () => {
    return { tabIndex: pressed && frames >= 1 ? 1 : 0 };
  }, (value) => value.tabIndex === 1, 1_000);
  assert.strictEqual(state.tabIndex, 1, 'Held Home input must survive until the frame-polled UI consumes it');
  assert.deepStrictEqual(keyEvents, ['down:KeyE', 'up:KeyE']);
  assert.strictEqual(frames, 2, 'Home input must step once held and once released before the next edge');
}

Promise.all([probeDriverPolicies(), probeAuthenticatedSnapshot(), probeFramePolledMenuTransition()]).then(() => {
  console.log('JourneyDriverContract: real input and shared movement owner PASS');
}).catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
