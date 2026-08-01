const assert = require('assert');
const { grappleGeometry } = require('../scripts/sim/slingshot-contract.cjs');
const { TestRunner, startSimServer, stopSimServer } = require('./helpers.cjs');

const SIM_PORT = 8817;
const SIM_URL = `http://127.0.0.1:${SIM_PORT}`;

async function request(route, options = {}) {
  const response = await fetch(`${SIM_URL}${route}`, options);
  return { status: response.status, body: await response.json() };
}

function post(route, body, headers = {}) {
  return request(route, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body: JSON.stringify(body),
  });
}

function headers(authority) {
  return {
    'x-lbh-command-credential': authority.commandCredential,
    'x-lbh-player-id': authority.playerId,
    'x-lbh-run-id': authority.runId,
  };
}

function sleep(ms) { return new Promise((resolve) => setTimeout(resolve, ms)); }
function wrap(value, scale) { return ((value % scale) + scale) % scale; }
function delta(from, to, scale) {
  let result = to - from;
  if (result > scale / 2) result -= scale;
  if (result < -scale / 2) result += scale;
  return result;
}

async function waitForPlayer(clientId, predicate, timeoutMs = 5000) {
  const deadline = Date.now() + timeoutMs;
  let last = null;
  while (Date.now() < deadline) {
    const snapshot = (await request('/snapshot')).body;
    last = snapshot.players?.find((player) => player.clientId === clientId) || null;
    if (last && predicate(last, snapshot)) return { player: last, snapshot };
    await sleep(50);
  }
  throw new Error(`Timed out waiting for Grapple Arc state: ${JSON.stringify(last)}`);
}

async function run() {
  const runner = new TestRunner('GrappleArcV3');
  await runner.run('authority owns a forgiving fixed arc and flat release', async () => {
    await startSimServer(SIM_PORT, { keepAlive: true });
    try {
      const start = await post('/session/start', {
        mapId: 'shallows',
        requesterId: 'grapple-arc-v3-test',
        requesterName: 'Grapple Arc V3 Test',
        seed: 7431,
      });
      assert.strictEqual(start.status, 200);
      const join = await post('/join', {
        runId: start.body.session.runId,
        clientId: 'grapple-arc-v3-test',
        joinTicket: start.body.joinTicket,
        name: 'Grapple Arc V3 Test',
      });
      assert.strictEqual(join.status, 200);
      const authority = join.body.authority;
      const initial = (await request('/snapshot')).body;
      const scale = initial.session.worldScale;
      const anchor = initial.world.stars.find((star) => star.alive !== false
        && initial.world.wells.every((well) => Math.hypot(
          delta(star.wx, well.wx, scale),
          delta(star.wy, well.wy, scale),
        ) > 0.7));
      assert(anchor, 'expected a clear star anchor');
      const geometry = grappleGeometry({ type: 'star', starType: anchor.type, mass: anchor.mass });
      const startRadius = geometry.hookRadius * 0.92;
      await post('/debug/player-state', {
        clientId: 'grapple-arc-v3-test',
        wx: wrap(anchor.wx + startRadius, scale),
        wy: anchor.wy,
        vx: -1.2,
        vy: 0,
        deltaV: 40,
        resetSlingshot: true,
        status: 'alive',
      });

      await post('/input', {
        ...authority,
        commandSeq: 1,
        seq: 1,
        moveX: -1,
        moveY: 0,
        thrust: 1,
        brake: 0,
        slingshot: true,
        slingshotEdges: [1],
        timestamp: Date.now(),
      }, headers(authority));
      const engaged = await waitForPlayer('grapple-arc-v3-test', (player) => player.slingshot?.engaged);
      assert.strictEqual(engaged.player.slingshot.phase, 'arc');
      assert(engaged.player.slingshot.hookRadius > engaged.player.slingshot.swingRadius);
      assert(Math.abs(
        engaged.player.slingshot.arcSpeed
          - engaged.player.slingshot.entrySpeed
          - engaged.player.slingshot.boost,
      ) < 1e-6, 'flat boost must be granted once at capture');

      await post('/input', {
        ...authority,
        commandSeq: 2,
        seq: 2,
        moveX: 1,
        moveY: 1,
        thrust: 1,
        brake: 0,
        slingshot: true,
        slingshotEdges: [],
        timestamp: Date.now(),
      }, headers(authority));
      const held = await waitForPlayer('grapple-arc-v3-test', (player, snapshot) =>
        player.slingshot?.engaged && snapshot.tick >= engaged.snapshot.tick + 4);
      assert.strictEqual(held.player.deliveredThrust, 0, 'thrust must be excluded while grapple owns movement');
      for (const component of ['thrust', 'coupling', 'gravity', 'wave', 'drag']) {
        const force = held.player.forceLedger.vectors[component];
        assert(Math.hypot(force.x, force.y) < 1e-6, `${component} leaked into the held arc`);
      }
      assert(Math.abs(held.player.slingshot.arcSpeed - engaged.player.slingshot.arcSpeed) < 1e-9,
        'hold duration must not accrue more speed');

      const dx = delta(held.player.wx, anchor.wx, scale);
      const dy = delta(held.player.wy, anchor.wy, scale);
      await post('/input', {
        ...authority,
        commandSeq: 3,
        seq: 3,
        moveX: dx,
        moveY: dy,
        thrust: 0,
        brake: 0,
        slingshot: false,
        slingshotEdges: [],
        timestamp: Date.now(),
      }, headers(authority));
      const released = await waitForPlayer('grapple-arc-v3-test', (player) =>
        !player.slingshot?.engaged && player.slingshot?.phase === 'release-ghost');
      const ghost = released.player.slingshot.telegraph.releaseGhost;
      assert(ghost, 'release ghost must survive as presentation');
      assert(Math.abs(Math.hypot(ghost.exit.x, ghost.exit.y) - held.player.slingshot.arcSpeed) < 1e-6,
        'release must use the same flat boosted speed regardless of hold time');
      assert.strictEqual(released.player.slingshot.chainCount, 0, 'mechanical chain state must be absent');
      const outward = { x: -dx / Math.hypot(dx, dy), y: -dy / Math.hypot(dx, dy) };
      assert(ghost.direction.x * outward.x + ghost.direction.y * outward.y >= -1e-6,
        'inward release request must not create an inward exit');

      await post('/debug/player-state', {
        clientId: 'grapple-arc-v3-test',
        wx: wrap(anchor.wx + startRadius, scale),
        wy: anchor.wy,
        vx: -1.2,
        vy: 0,
        resetSlingshot: true,
        status: 'alive',
      });
      await post('/input', {
        ...authority,
        commandSeq: 4,
        seq: 4,
        moveX: -1,
        moveY: 0,
        thrust: 0,
        brake: 0,
        slingshot: true,
        slingshotEdges: [4],
        timestamp: Date.now(),
      }, headers(authority));
      const brakeEngaged = await waitForPlayer('grapple-arc-v3-test', (player) => player.slingshot?.engaged);
      await post('/input', {
        ...authority,
        commandSeq: 5,
        seq: 5,
        moveX: 0,
        moveY: 0,
        thrust: 0,
        brake: 1,
        slingshot: true,
        slingshotEdges: [],
        timestamp: Date.now(),
      }, headers(authority));
      const brakeAbort = await waitForPlayer('grapple-arc-v3-test', (player) =>
        !player.slingshot?.engaged && player.slingshot?.phase === 'release-ghost');
      const brakeGhost = brakeAbort.player.slingshot.telegraph.releaseGhost;
      assert(Math.abs(Math.hypot(brakeGhost.exit.x, brakeGhost.exit.y) - brakeEngaged.player.slingshot.entrySpeed) < 1e-6,
        'brake abort must discard the flat grapple bonus');
    } finally {
      await stopSimServer(SIM_PORT).catch(() => null);
    }
  });

  if (runner.failed > 0) process.exitCode = 1;
}

run().catch((error) => {
  console.error(error.stack || error.message);
  process.exit(1);
});
