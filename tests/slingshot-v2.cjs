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
    await sleep(10);
  }
  throw new Error(`Timed out waiting for Grapple Arc state: ${JSON.stringify(last)}`);
}

async function waitForEvent(since, predicate, timeoutMs = 5000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const events = (await request(`/events?since=${since}`)).body.events || [];
    const match = events.find(predicate);
    if (match) return match;
    await sleep(20);
  }
  throw new Error('Timed out waiting for Grapple Arc event');
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
      const secondAnchor = initial.world.stars.find((star) => star.alive !== false
        && star.id !== anchor.id);
      assert(secondAnchor, 'expected a distinct second star anchor');
      const geometry = grappleGeometry({ type: 'star', starType: anchor.type, mass: anchor.mass });
      const secondGeometry = grappleGeometry({
        type: 'star',
        starType: secondAnchor.type,
        mass: secondAnchor.mass,
      });
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
      const captureEventWatermark = Math.max(0, ...((await request('/events')).body.events || [])
        .map((event) => event.seq || 0));
      const captureCommand = await post('/input', {
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
      assert.deepStrictEqual(captureCommand.body.acceptedSlingshotEdges, [1],
        'authority must accept the capture input edge');
      const captureEvent = await waitForEvent(captureEventWatermark, (event) =>
        event.type === 'player.slingshotEngaged'
          && event.payload?.clientId === 'grapple-arc-v3-test');
      assert(captureEvent.tick >= captureCommand.body.tick,
        'accepted capture input must produce an authoritative capture event');
      assert.strictEqual(captureEvent.payload?.phase, 'arc',
        'capture event must enter the authoritative arc state');
      assert.strictEqual(captureEvent.payload?.anchorId, anchor.id,
        'capture event must identify the selected anchor');
      assert(Math.abs(captureEvent.payload?.boost - geometry.boost) < 1e-9,
        'capture event must publish the selected anchor flat boost');
      const engaged = await waitForPlayer('grapple-arc-v3-test', (player) => player.slingshot?.engaged);
      assert.strictEqual(engaged.player.slingshot.phase, 'arc');
      assert(engaged.player.slingshot.hookRadius > engaged.player.slingshot.swingRadius);
      assert(Math.abs(
        engaged.player.slingshot.arcSpeed
          - engaged.player.slingshot.entrySpeed
          - engaged.player.slingshot.boost,
      ) < 1e-6, 'flat boost must be granted once at capture');
      assert(engaged.player.slingshot.telegraph.ownedArc.reelProgress >= 0
        && engaged.player.slingshot.telegraph.ownedArc.reelProgress <= 1,
      'the observable arc state must publish bounded reel progress');
      // The zero-progress direction is deterministic pure-contract coverage in
      // slingshot-contract.cjs. This live authority assertion deliberately
      // observes capture through its event rather than racing the next 15 Hz tick.

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
      for (const component of ['thrust', 'currentCoupling', 'wellGravity', 'solarWind', 'bodyPush', 'wave', 'drag']) {
        const force = held.player.forceLedger.vectors[component];
        assert(Math.hypot(force.x, force.y) < 1e-6, `${component} leaked into the held arc`);
      }
      assert(Math.abs(held.player.slingshot.arcSpeed - engaged.player.slingshot.arcSpeed) < 1e-9,
        'hold duration must not accrue more speed');

      const heldOutwardX = delta(held.player.slingshot.anchorWX, held.player.wx, scale);
      const heldOutwardY = delta(held.player.slingshot.anchorWY, held.player.wy, scale);
      const heldRadius = Math.hypot(heldOutwardX, heldOutwardY);
      const heldTangent = {
        x: -heldOutwardY / heldRadius * held.player.slingshot.orbitDir,
        y: heldOutwardX / heldRadius * held.player.slingshot.orbitDir,
      };
      const heldSpeed = Math.hypot(held.player.vx, held.player.vy);
      assert((held.player.vx / heldSpeed) * heldTangent.x + (held.player.vy / heldSpeed) * heldTangent.y > 0.999,
        'completed reel must resolve onto the active arc tangent');

      const scavenger = held.snapshot.world.scavengers.find((entry) => entry.alive !== false);
      assert(scavenger, 'expected a scavenger for held-arc contact proof');
      const eventWatermark = Math.max(0, ...((await request('/events')).body.events || []).map((event) => event.seq || 0));
      await post('/debug/scavenger-state', {
        scavengerId: scavenger.id,
        wx: held.player.wx,
        wy: held.player.wy,
        vx: 0,
        vy: 0,
        state: 'drift',
        alive: true,
      });
      await waitForEvent(eventWatermark, (event) => event.type === 'player.scavengerBumped'
        && event.payload?.clientId === 'grapple-arc-v3-test');
      const afterContact = await waitForPlayer('grapple-arc-v3-test', (player, snapshot) =>
        player.slingshot?.engaged && snapshot.tick > held.snapshot.tick);
      const contactOutwardX = delta(afterContact.player.slingshot.anchorWX, afterContact.player.wx, scale);
      const contactOutwardY = delta(afterContact.player.slingshot.anchorWY, afterContact.player.wy, scale);
      const contactRadius = Math.hypot(contactOutwardX, contactOutwardY);
      const contactTangent = {
        x: -contactOutwardY / contactRadius * afterContact.player.slingshot.orbitDir,
        y: contactOutwardX / contactRadius * afterContact.player.slingshot.orbitDir,
      };
      const contactSpeed = Math.hypot(afterContact.player.vx, afterContact.player.vy);
      assert((afterContact.player.vx / contactSpeed) * contactTangent.x
        + (afterContact.player.vy / contactSpeed) * contactTangent.y > 0.999,
      'scavenger contact must not knock a grappled player off tangent');

      const dx = delta(afterContact.player.wx, anchor.wx, scale);
      const dy = delta(afterContact.player.wy, anchor.wy, scale);
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
      const longHoldExitSpeed = Math.hypot(ghost.exit.x, ghost.exit.y);
      assert(Math.abs(longHoldExitSpeed - afterContact.player.slingshot.arcSpeed) < 1e-6,
        'release must carry the held arc speed without duration payout');
      assert(!('chainCount' in released.player.slingshot) && !('energy' in released.player.slingshot),
        'retired v2 chain and energy fields must be absent');
      assert(Math.abs(ghost.anchor.wx - afterContact.player.slingshot.anchorWX) < 1e-9
        && Math.abs(ghost.anchor.wy - afterContact.player.slingshot.anchorWY) < 1e-9,
      'release ghost must retain the active anchor coordinates');
      const outward = { x: -dx / Math.hypot(dx, dy), y: -dy / Math.hypot(dx, dy) };
      assert(ghost.direction.x * outward.x + ghost.direction.y * outward.y >= -1e-6,
        'inward release request must not create an inward exit');

      // A fresh controlled setup makes this an actual authority comparison:
      // release immediately after capture, then compare it to the held arc
      // above. The debug reset is fixture setup only; the cooldown is tested
      // below without resetting its state.
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
      const shortEngaged = await waitForPlayer('grapple-arc-v3-test', (player) => player.slingshot?.engaged);
      await post('/input', {
        ...authority,
        commandSeq: 5,
        seq: 5,
        moveX: 0,
        moveY: 0,
        thrust: 0,
        brake: 0,
        slingshot: false,
        slingshotEdges: [],
        timestamp: Date.now(),
      }, headers(authority));
      const shortRelease = await waitForPlayer('grapple-arc-v3-test', (player) =>
        !player.slingshot?.engaged && player.slingshot?.phase === 'release-ghost');
      const shortGhost = shortRelease.player.slingshot.telegraph.releaseGhost;
      const shortHoldExitSpeed = Math.hypot(shortGhost.exit.x, shortGhost.exit.y);
      assert(Math.abs(shortHoldExitSpeed - longHoldExitSpeed) < 1e-6,
        'short and long held arcs must release at the same flat boosted speed');
      assert(shortRelease.player.slingshot.rehookCooldownSeconds > 1
        && shortRelease.player.slingshot.rehookCooldownSeconds <= 1.25,
      'release must start the configured global re-hook cooldown');
      assert.strictEqual(shortRelease.player.slingshot.aim, null,
        'cooldown must suppress a stale aim target');
      assert.strictEqual(shortRelease.player.slingshot.telegraph.aimCue, null,
        'cooldown must suppress a false aim telegraph');

      // Compress ten seconds of 15 Hz button mashing into the live cooldown
      // window. These 150 attempts happen while the player is still in the
      // same first-anchor encounter and must not produce another engagement.
      const spamWatermark = Math.max(0, ...((await request('/events')).body.events || []).map((event) => event.seq || 0));
      let commandSeq = 6;
      let edgeId = 6;
      const tapAttempts = 15 * 10;
      for (let attempt = 0; attempt < tapAttempts; attempt += 1) {
        await post('/input', {
          ...authority,
          commandSeq,
          seq: commandSeq,
          moveX: 0,
          moveY: 0,
          thrust: 0,
          brake: 0,
          slingshot: true,
          slingshotEdges: [edgeId],
          timestamp: Date.now(),
        }, headers(authority));
        commandSeq += 1;
        edgeId += 1;
        await post('/input', {
          ...authority,
          commandSeq,
          seq: commandSeq,
          moveX: 0,
          moveY: 0,
          thrust: 0,
          brake: 0,
          slingshot: false,
          slingshotEdges: [],
          timestamp: Date.now(),
        }, headers(authority));
        commandSeq += 1;
      }
      const afterSpam = await waitForPlayer('grapple-arc-v3-test', () => true, 250);
      assert(afterSpam.player.slingshot.rehookCooldownSeconds > 0,
        'equivalent ten-second tap load must complete inside the live cooldown window');
      assert.strictEqual(afterSpam.player.slingshot.aim, null,
        'tap spam must not restore aim during the re-hook cooldown');
      assert.strictEqual(afterSpam.player.slingshot.telegraph.aimCue, null,
        'tap spam must not restore the lock telegraph during cooldown');
      const spamEvents = (await request(`/events?since=${spamWatermark}`)).body.events || [];
      const repeatedEngages = spamEvents.filter((event) => event.type === 'player.slingshotEngaged'
        && event.payload?.clientId === 'grapple-arc-v3-test');
      assert.strictEqual(repeatedEngages.length, 0,
        'same-anchor tap attempts inside the cooldown must not re-engage');

      // The cooldown is an input affordance, not a payout lock. Once it has
      // honestly expired, a different landmark contributes its normal flat
      // bonus on top of the already-boosted entry speed.
      await waitForPlayer('grapple-arc-v3-test', (player) =>
        player.slingshot?.rehookCooldownSeconds <= 0, 3000);
      const secondStartRadius = secondGeometry.hookRadius * 0.92;
      await post('/debug/player-state', {
        clientId: 'grapple-arc-v3-test',
        wx: wrap(secondAnchor.wx + secondStartRadius, scale),
        wy: secondAnchor.wy,
        vx: -shortHoldExitSpeed,
        vy: 0,
        deltaV: 40,
        status: 'alive',
      });
      await post('/input', {
        ...authority,
        commandSeq,
        seq: commandSeq,
        moveX: -1,
        moveY: 0,
        thrust: 0,
        brake: 0,
        slingshot: true,
        slingshotEdges: [edgeId],
        timestamp: Date.now(),
      }, headers(authority));
      commandSeq += 1;
      edgeId += 1;
      const secondEngaged = await waitForPlayer('grapple-arc-v3-test', (player) =>
        player.slingshot?.engaged && player.slingshot?.anchorId === secondAnchor.id);
      assert(Math.abs(secondEngaged.player.slingshot.boost - secondGeometry.boost) < 1e-9,
        'a distinct landmark must retain its normal flat boost');
      assert(Math.abs(secondEngaged.player.slingshot.entrySpeed - shortHoldExitSpeed) < 0.05,
        'the second landmark must enter with the already-boosted velocity');
      assert(Math.abs(secondEngaged.player.slingshot.arcSpeed
        - secondEngaged.player.slingshot.entrySpeed
        - secondEngaged.player.slingshot.boost) < 1e-6,
      'the second landmark must compound its flat boost from the higher entry speed');
      await post('/input', {
        ...authority,
        commandSeq,
        seq: commandSeq,
        moveX: 0,
        moveY: 0,
        thrust: 0,
        brake: 0,
        slingshot: false,
        slingshotEdges: [],
        timestamp: Date.now(),
      }, headers(authority));
      commandSeq += 1;
      await waitForPlayer('grapple-arc-v3-test', (player) => !player.slingshot?.engaged);

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
        commandSeq,
        seq: commandSeq,
        moveX: -1,
        moveY: 0,
        thrust: 0,
        brake: 0,
        slingshot: true,
        slingshotEdges: [edgeId],
        timestamp: Date.now(),
      }, headers(authority));
      commandSeq += 1;
      const brakeEngaged = await waitForPlayer('grapple-arc-v3-test', (player) => player.slingshot?.engaged);
      await post('/input', {
        ...authority,
        commandSeq,
        seq: commandSeq,
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
      assert(brakeAbort.player.slingshot.rehookCooldownSeconds > 1,
        'brake abort must use the same global re-hook cooldown as button-up');
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
