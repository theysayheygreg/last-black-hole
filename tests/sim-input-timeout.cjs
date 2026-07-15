const { TestRunner, assert, startSimServer, stopSimServer } = require("./helpers.cjs");

const SIM_PORT = 8831;
const HELD_INPUT_TIMEOUT_MS = 180;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function request(path, payload = null) {
  const response = await fetch(`http://127.0.0.1:${SIM_PORT}${path}`, payload === null ? undefined : {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload),
  });
  return { status: response.status, body: await response.json() };
}

async function authorizedInput(authority, commandSeq, payload) {
  const response = await fetch(`http://127.0.0.1:${SIM_PORT}/input`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-lbh-command-credential": authority.commandCredential,
      "x-lbh-player-id": authority.playerId,
      "x-lbh-run-id": authority.runId,
    },
    body: JSON.stringify({
      ...payload,
      runId: authority.runId,
      playerId: authority.playerId,
      commandCredential: authority.commandCredential,
      commandSeq,
    }),
  });
  return { status: response.status, body: await response.json() };
}

async function playerSnapshot(clientId) {
  const snapshot = await request("/snapshot");
  return snapshot.body.players.find((player) => player.clientId === clientId);
}

async function run() {
  const runner = new TestRunner("SimInputTimeout");

  await runner.run("silent human input releases held thrust after the server receipt timeout", async () => {
    await startSimServer(SIM_PORT, {
      keepAlive: true,
      env: { LBH_SIM_HELD_INPUT_TIMEOUT_MS: String(HELD_INPUT_TIMEOUT_MS) },
    });
    try {
      const clientId = "input-timeout";
      const start = await request("/session/start", {
        mapId: "shallows",
        requesterId: clientId,
        requesterName: clientId,
        seed: 4417,
      });
      assert(start.status === 200 && start.body.ok, "Expected session start");
      const join = await request("/join", {
        runId: start.body.session.runId,
        clientId,
        name: clientId,
        hullType: "drifter",
        joinTicket: start.body.joinTicket,
      });
      assert(join.status === 200 && join.body.ok, "Expected player join");

      const placed = await request("/debug/player-state", {
        clientId,
        wx: 2.5,
        wy: 2.5,
        vx: 0,
        vy: 0,
        deltaV: 100,
        status: "alive",
      });
      assert(placed.status === 200 && placed.body.ok, "Expected debug player placement");
      const initialDeltaV = (await playerSnapshot(clientId)).deltaV;

      const input = await authorizedInput(join.body.authority, 1, {
        seq: 1,
        moveX: 1,
        moveY: 0,
        thrust: 1,
        brake: 0,
      });
      assert(input.status === 200 && input.body.ok, "Expected held thrust input to be accepted");

      await sleep(Math.floor(HELD_INPUT_TIMEOUT_MS * 0.5));
      const activeDeltaV = (await playerSnapshot(clientId)).deltaV;
      assert(activeDeltaV < initialDeltaV, "Expected accepted thrust to spend delta-v before timeout");

      await sleep(HELD_INPUT_TIMEOUT_MS + 120);
      const afterTimeoutDeltaV = (await playerSnapshot(clientId)).deltaV;
      const afterTimeoutBrake = (await playerSnapshot(clientId)).lastInputBrake;
      await sleep(160);
      const settledDeltaV = (await playerSnapshot(clientId)).deltaV;
      assert(afterTimeoutBrake === 0, "Expected expired input to clear held controls");
      assert(settledDeltaV >= afterTimeoutDeltaV,
        `Expected stale input to stop spending delta-v (${afterTimeoutDeltaV} -> ${settledDeltaV})`);
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
