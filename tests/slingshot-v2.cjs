const assert = require("assert");
const {
  SLINGSHOT_KNOB_CONTRACT,
  SLINGSHOT_VALUES,
  releaseSpeedCap,
} = require("../scripts/sim/slingshot-contract.cjs");
const { TestRunner, startSimServer, stopSimServer } = require("./helpers.cjs");

const SIM_PORT = 8817;
const SIM_URL = `http://127.0.0.1:${SIM_PORT}`;

async function request(route, options = {}) {
  const response = await fetch(`${SIM_URL}${route}`, options);
  return { status: response.status, body: await response.json() };
}

async function post(route, body, headers = {}) {
  return request(route, {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: JSON.stringify(body),
  });
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function wrap(value, worldScale) {
  return ((value % worldScale) + worldScale) % worldScale;
}

async function waitForPlayer(clientId, predicate, timeoutMs = 8000) {
  const deadline = Date.now() + timeoutMs;
  let last = null;
  while (Date.now() < deadline) {
    const snapshot = (await request("/snapshot")).body;
    last = snapshot.players?.find((player) => player.clientId === clientId) || null;
    if (last && predicate(last, snapshot)) return { player: last, snapshot };
    await sleep(60);
  }
  throw new Error(`Timed out waiting for slingshot state: ${JSON.stringify(last)}`);
}

function authorityHeaders(authority) {
  return {
    "x-lbh-command-credential": authority.commandCredential,
    "x-lbh-player-id": authority.playerId,
    "x-lbh-run-id": authority.runId,
  };
}

async function run() {
  const runner = new TestRunner("SlingshotV2");
  await runner.run("Five-knob route fixture clears the 25% time margin", async () => {
    const names = Object.keys(SLINGSHOT_KNOB_CONTRACT);
    assert.deepStrictEqual(names, ["captureRadius", "magnetism", "coyoteTime", "payoffCurve", "chainWindow"]);

    // This is a fixed route geometry, not a sixth tuning surface. The
    // movement acceleration is the ratified canonical 2.5 wu/s^2 baseline.
    const thrustAcceleration = 2.5;
    const thrustOnlyDistance = 4;
    const thrustOnlyTime = Math.sqrt((2 * thrustOnlyDistance) / thrustAcceleration);
    const entrySpeed = 2;
    const approachDistance = (entrySpeed * entrySpeed) / (2 * thrustAcceleration);
    const approachTime = entrySpeed / thrustAcceleration;
    const arcCommitTime = 0.2;
    const exitDistance = 0.8;
    const exitSpeed = releaseSpeedCap(entrySpeed, Math.PI / 2, SLINGSHOT_VALUES.payoffCurve, 1);
    const slingshotTime = approachTime + arcCommitTime + exitDistance / exitSpeed;
    const margin = 1 - slingshotTime / thrustOnlyTime;

    assert(margin >= 0.25, `Expected >=25% route-time margin, got ${(margin * 100).toFixed(2)}%`);
    console.log(JSON.stringify({
      thrustOnlySeconds: Number(thrustOnlyTime.toFixed(6)),
      slingshotSeconds: Number(slingshotTime.toFixed(6)),
      margin: Number((margin * 100).toFixed(2)),
      knobs: names,
    }));
  });

  await runner.run("Authority transports aim, lock, owned arc, release ghost, and chain count", async () => {
    await startSimServer(SIM_PORT, { keepAlive: true });
    try {
      const start = await post("/session/start", {
        mapId: "shallows",
        requesterId: "slingshot-v2-test",
        requesterName: "Slingshot V2 Test",
        seed: 7414,
      });
      assert.strictEqual(start.status, 200);
      const join = await post("/join", {
        runId: start.body.session.runId,
        clientId: "slingshot-v2-test",
        joinTicket: start.body.joinTicket,
        name: "Slingshot V2 Test",
      });
      assert.strictEqual(join.status, 200);
      const authority = join.body.authority;
      const initial = (await request("/snapshot")).body;
      const first = initial.world.wells[0];
      const second = initial.world.stars.find((star) => Math.hypot(star.wx - first.wx, star.wy - first.wy) > 0.1)
        || initial.world.planetoids.find((body) => Math.hypot(body.wx - first.wx, body.wy - first.wy) > 0.1);
      assert(first && second, "Expected two distinct slingshot anchors");
      const worldScale = initial.session.worldScale;
      const firstRange = 0.45;

      await post("/debug/player-state", {
        clientId: "slingshot-v2-test",
        wx: wrap(first.wx + firstRange * 0.8, worldScale),
        wy: first.wy,
        vx: 0,
        vy: 1.2,
        deltaV: 40,
        resetSlingshot: true,
        status: "alive",
      });
      const aim = await waitForPlayer("slingshot-v2-test", (player) => player.slingshot?.phase === "aim");
      assert(aim.player.slingshot.telegraph.aimCue, "Aim cue must be authoritative");

      await post("/input", {
        ...authority,
        runId: authority.runId,
        playerId: authority.playerId,
        commandCredential: authority.commandCredential,
        commandSeq: 1,
        seq: 1,
        moveX: 0,
        moveY: 1,
        thrust: 0,
        brake: 0,
        slingshotEdges: [1],
        timestamp: Date.now(),
      }, authorityHeaders(authority));
      const locked = await waitForPlayer("slingshot-v2-test", (player) => player.slingshot?.engaged === true && player.slingshot?.phase === "lock");
      assert(locked.player.slingshot.telegraph.lock, "Lock telegraph must be transported");
      assert(locked.player.slingshot.bendDegrees <= SLINGSHOT_VALUES.magnetism + 1e-6);
      const engaged = await waitForPlayer("slingshot-v2-test", (player) => player.slingshot?.engaged === true && player.slingshot?.phase === "arc");
      assert(engaged.player.slingshot.telegraph.ownedArc, "Owned arc telegraph must be transported");

      await post("/input", {
        ...authority,
        runId: authority.runId,
        playerId: authority.playerId,
        commandCredential: authority.commandCredential,
        commandSeq: 2,
        seq: 2,
        moveX: -1,
        moveY: 0,
        thrust: 0,
        brake: 0,
        slingshotEdges: [2],
        timestamp: Date.now(),
      }, authorityHeaders(authority));
      const released = await waitForPlayer("slingshot-v2-test", (player) => player.slingshot?.engaged === false && player.slingshot?.phase === "release-ghost");
      const ghost = released.player.slingshot.telegraph.releaseGhost;
      assert(ghost, "Release ghost must be authoritative");
      assert(ghost.direction.x < -0.99, "Release ghost must follow stick-relative input, not facing");
      assert(Math.hypot(released.player.vx, released.player.vy) <= ghost.speedCap + 1e-6,
        `Release speed exceeded cap: ${Math.hypot(released.player.vx, released.player.vy)} > ${ghost.speedCap}`);

      await post("/debug/player-state", {
        clientId: "slingshot-v2-test",
        wx: wrap(second.wx + 0.05, worldScale),
        wy: second.wy,
        vx: 0,
        vy: 1.2,
        status: "alive",
      });
      await post("/input", {
        ...authority,
        runId: authority.runId,
        playerId: authority.playerId,
        commandCredential: authority.commandCredential,
        commandSeq: 3,
        seq: 3,
        moveX: 0,
        moveY: 1,
        thrust: 0,
        brake: 0,
        slingshotEdges: [3],
        timestamp: Date.now(),
      }, authorityHeaders(authority));
      const chained = await waitForPlayer("slingshot-v2-test", (player) => player.slingshot?.engaged === true);
      assert(chained.player.slingshot.chainCount >= 2, `Expected chain count >=2, got ${chained.player.slingshot.chainCount}`);
    } finally {
      await stopSimServer(SIM_PORT).catch(() => null);
    }
  });

  process.exit(runner.summary() ? 0 : 1);
}

run().catch(async (error) => {
  await stopSimServer(SIM_PORT).catch(() => null);
  console.error(error.stack || error.message);
  process.exit(1);
});
