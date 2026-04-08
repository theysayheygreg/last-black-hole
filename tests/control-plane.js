/**
 * control-plane.js — persistence/control-plane integration smoke.
 *
 * Proves that a sim instance can register with a separate control-plane
 * process, hydrate a profile through it, mirror session state out of process,
 * and write back a run outcome on leave.
 */
const crypto = require("crypto");
const {
  TestRunner,
  assert,
  startControlPlane,
  stopControlPlane,
  startSimServer,
  stopSimServer,
} = require("./helpers");

const CONTROL_PORT = 8792;
const SIM_PORT = 8789;
const CONTROL_URL = `http://127.0.0.1:${CONTROL_PORT}`;
const SIM_URL = `http://127.0.0.1:${SIM_PORT}`;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function getJson(url) {
  const response = await fetch(url);
  const json = await response.json();
  if (!response.ok || json.ok === false) {
    throw new Error(json.error || `GET ${url} failed (${response.status})`);
  }
  return json;
}

async function postJson(url, body) {
  const response = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const json = await response.json();
  if (!response.ok || json.ok === false) {
    throw new Error(json.error || `POST ${url} failed (${response.status})`);
  }
  return json;
}

async function waitFor(fn, { timeout = 5000, interval = 100 } = {}) {
  const deadline = Date.now() + timeout;
  let lastError = null;
  while (Date.now() < deadline) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      await sleep(interval);
    }
  }
  throw lastError || new Error("Timed out");
}

async function run() {
  console.log("\n=== CONTROL PLANE TESTS ===\n");
  const runner = new TestRunner("ControlPlane");
  const profileId = `profile-${crypto.randomUUID()}`;
  const clientId = `client-${crypto.randomUUID()}`;

  await startControlPlane(CONTROL_PORT);
  await startSimServer(SIM_PORT, {
    env: {
      LBH_CONTROL_PLANE_URL: CONTROL_URL,
      LBH_SIM_INSTANCE_ID: "sim-control-plane-test",
    },
  });

  try {
    await runner.run("Sim instance registers against external control plane", async () => {
      const health = await waitFor(async () => {
        const body = await getJson(`${CONTROL_URL}/health`);
        assert(Array.isArray(body.simInstances), "Expected simInstances array");
        const registered = body.simInstances.find((entry) => entry.simInstanceId === "sim-control-plane-test");
        assert(registered, "Expected registered sim instance");
        return body;
      });
      assert(health.simInstances.length >= 1, "Expected at least one registered sim instance");
    });

    await runner.run("Join hydrates profile through external control plane", async () => {
      await postJson(`${SIM_URL}/join`, {
        clientId,
        profileId,
        name: "Remote Pilot",
        profileSnapshot: {
          id: profileId,
          name: "Remote Pilot",
          upgrades: {
            hull: 2,
            thrust: 1,
          },
          shipType: "hauler",
        },
      });

      const profileBody = await waitFor(async () => {
        const body = await getJson(`${CONTROL_URL}/profile?profileId=${encodeURIComponent(profileId)}`);
        assert(body.profile?.id === profileId, "Expected profile to persist through control plane");
        return body;
      });
      assert(profileBody.profile.shipType === "hauler", `Expected hauler ship type, got ${profileBody.profile.shipType}`);
      assert(profileBody.profile.upgrades.hull === 2, "Expected stored hull upgrade");
      assert(profileBody.profile.loadout.equipped.length === 2, "Expected 2 persisted equip slots");
      assert(profileBody.profile.loadout.consumables.length === 2, "Expected 2 persisted consumable slots");

      const sessionBody = await waitFor(async () => {
        const body = await getJson(`${CONTROL_URL}/sessions`);
        const mirrored = body.sessions.find((entry) =>
          Array.isArray(entry.players) && entry.players.some((player) => player.profileId === profileId)
        );
        assert(mirrored, "Expected mirrored live session");
        return mirrored;
      });
      assert(sessionBody.players.some((entry) => entry.profileId === profileId), "Expected joined profile in mirrored session");
    });

    await runner.run("Leave writes outcome back without sim-local store ownership", async () => {
      await postJson(`${SIM_URL}/leave`, { clientId });

      const health = await waitFor(async () => {
        const body = await getJson(`${CONTROL_URL}/health`);
        assert(body.runCount >= 1, "Expected control plane run record after leave outcome");
        return body;
      });
      assert(health.runCount >= 1, "Expected at least one persisted run record");
    });

    await runner.run("Echoes are scoped by map and seed", async () => {
      const echoA = await postJson(`${CONTROL_URL}/echoes/save`, {
        wreck: {
          wreckId: `echo-a-${crypto.randomUUID()}`,
          mapId: "shallows",
          seed: 12345,
          pilotName: "Pilot A",
          wx: 1.0,
          wy: 1.0,
          loot: [],
        },
      });
      const echoB = await postJson(`${CONTROL_URL}/echoes/save`, {
        wreck: {
          wreckId: `echo-b-${crypto.randomUUID()}`,
          mapId: "expanse",
          seed: 12345,
          pilotName: "Pilot B",
          wx: 2.0,
          wy: 2.0,
          loot: [],
        },
      });
      assert(echoA.echo.mapId === "shallows", "Expected saved shallows echo");
      assert(echoB.echo.mapId === "expanse", "Expected saved expanse echo");

      const shallows = await getJson(`${CONTROL_URL}/echoes?mapId=shallows&seed=12345`);
      const expanse = await getJson(`${CONTROL_URL}/echoes?mapId=expanse&seed=12345`);

      assert(shallows.echoes.length === 1, `Expected 1 shallows echo, got ${shallows.echoes.length}`);
      assert(expanse.echoes.length === 1, `Expected 1 expanse echo, got ${expanse.echoes.length}`);
      assert(shallows.echoes[0].mapId === "shallows", "Expected shallows-scoped echo only");
      assert(expanse.echoes[0].mapId === "expanse", "Expected expanse-scoped echo only");
    });
  } finally {
    await stopSimServer(SIM_PORT).catch(() => null);
    await stopControlPlane(CONTROL_PORT).catch(() => null);
  }

  const ok = runner.summary();
  process.exit(ok ? 0 : 1);
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
