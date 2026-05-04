/**
 * control-plane.js — persistence/control-plane integration smoke.
 *
 * Proves that a sim instance can register with a separate control-plane
 * process, hydrate a profile through it, mirror session state out of process,
 * and write back a run outcome on leave.
 */
const crypto = require("crypto");
const fs = require("fs");
const os = require("os");
const path = require("path");
const {
  TestRunner,
  assert,
  startControlPlane,
  stopControlPlane,
  startSimServer,
  stopSimServer,
} = require("./helpers");
const { ControlPlaneStore } = require("../scripts/control-plane-store.js");

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

    await runner.run("RunResult package persists extraction details", async () => {
      const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "lbh-run-result-"));
      const storeFile = path.join(tmpDir, "store.json");
      const store = new ControlPlaneStore(storeFile);
      const runId = `run-${crypto.randomUUID()}`;
      const profileId = `profile-${crypto.randomUUID()}`;
      const cargo = [
        { id: "cargo-a", name: "Bright Relic", value: 120, tier: "rare" },
        { id: "cargo-b", name: "Quiet Core", value: 80, tier: "uncommon" },
      ];

      store.applyOutcome({
        profileId,
        outcome: "escaped",
        runDuration: 180,
        session: { id: "session-extract", runId, mapId: "shallows", worldScale: 3, seed: 4242 },
        player: {
          clientId: "pilot-extract",
          name: "RunResult Pilot",
          hullType: "hauler",
          rigLevels: [1, 0, 2],
          cargo,
          equipped: [{ id: "equip-a", name: "Signal Sink" }],
          consumables: [{ id: "cell-a", name: "Shield Cell" }],
          signal: { level: 0.72, zone: "flare" },
        },
        runResult: {
          runId,
          pilotId: "pilot-extract",
          profileId,
          hullType: "hauler",
          rigLevels: [1, 0, 2],
          outcome: "extracted",
          survivalTime: 180,
          cargoExtracted: cargo,
          cargoLost: [],
          salvageBrought: [{ id: "equip-a", name: "Signal Sink" }],
          signalPeak: 0.82,
          signalPeakZone: "flare",
          timePerZone: { ghost: 40, whisper: 80, flare: 60 },
          inhibitorFormReached: 2,
          inhibitorFormTimes: [null, 92, 144, null],
          survivalBonus: 90,
          emEarned: 290,
          aiOutcomes: [{ personality: "raider", hullType: "breacher", outcome: "dead", cargoCount: 1 }],
          notables: [{ type: "cargo_extracted", description: "2 cargo recovered", value: 2 }],
          statsDelta: { runsAttempted: 1, runsCompleted: 1, totalSurvivalTime: 180, totalEmEarned: 290, cargoExtracted: 2, cargoLost: 0 },
          mapId: "shallows",
          mapScale: 3,
          wellCount: 5,
          seed: 4242,
        },
      });

      const state = JSON.parse(fs.readFileSync(storeFile, "utf8"));
      const run = state.runs[runId];
      assert(run, "Expected run entry to be persisted");
      assert(run.outcome === "extracted", `Expected normalized extracted outcome, got ${run.outcome}`);
      assert(run.legacyOutcome === "escaped", "Expected legacy escaped outcome to be retained");
      assert(run.cargoExtracted.length === 2, "Expected extracted cargo in run record");
      assert(run.cargoLost.length === 0, "Expected no lost cargo on extraction");
      assert(run.emEarned === 290, "Expected RunResult EM earned to persist");
      assert(run.survivalBonus === 90, "Expected survival bonus to persist");
      assert(run.signalPeak === 0.82 && run.signalPeakZone === "flare", "Expected signal peak context");
      assert(run.mapContext.mapId === "shallows" && run.mapContext.seed === 4242, "Expected map context");
      assert(run.loadoutSnapshot.equipped.length === 2, "Expected canonical loadout snapshot shape");
      assert(run.loadoutSnapshot.equipped[0].id === "equip-a", "Expected equipped item snapshot");
      assert(run.statsDelta.totalEmEarned === 290, "Expected compact stats delta");
    });

    await runner.run("RunResult package persists death and abandon-like losses", async () => {
      const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "lbh-run-loss-"));
      const storeFile = path.join(tmpDir, "store.json");
      const store = new ControlPlaneStore(storeFile);
      const deadRunId = `run-${crypto.randomUUID()}`;
      const abandonRunId = `run-${crypto.randomUUID()}`;
      const deathCargo = [{ id: "lost-a", name: "Drowned Core", value: 75 }];
      const profileId = `profile-${crypto.randomUUID()}`;

      store.applyOutcome({
        profileId,
        outcome: "dead",
        runDuration: 64,
        session: { id: "session-death", runId: deadRunId, mapId: "expanse", worldScale: 5, seed: 99 },
        player: {
          clientId: "pilot-death",
          name: "Death Pilot",
          hullType: "drifter",
          cargo: deathCargo,
          equipped: [],
          consumables: [],
          signal: { level: 0.91, zone: "threshold" },
        },
        runResult: {
          runId: deadRunId,
          pilotId: "pilot-death",
          profileId,
          hullType: "drifter",
          outcome: "dead",
          deathCause: "well",
          deathEntityId: "charybdis",
          survivalTime: 64,
          cargoExtracted: [],
          cargoLost: deathCargo,
          signalPeak: 0.91,
          signalPeakZone: "threshold",
          survivalBonus: 32,
          emEarned: 16,
          notables: [{ type: "death_cause", description: "well: charybdis", value: "well" }],
          statsDelta: { runsAttempted: 1, runsCompleted: 0, totalSurvivalTime: 64, totalEmEarned: 16, cargoExtracted: 0, cargoLost: 1 },
          mapId: "expanse",
          mapScale: 5,
          wellCount: 8,
          seed: 99,
        },
      });

      store.applyOutcome({
        profileId,
        outcome: "abandoned",
        runDuration: 12,
        session: { id: "session-abandon", runId: abandonRunId, mapId: "shallows", worldScale: 3, seed: 100 },
        player: {
          clientId: "pilot-abandon",
          name: "Abandon Pilot",
          hullType: "shroud",
          cargo: [{ id: "lost-b", name: "Cold Shard", value: 25 }],
          equipped: [],
          consumables: [],
          signal: { level: 0.12, zone: "ghost" },
        },
      });

      const state = JSON.parse(fs.readFileSync(storeFile, "utf8"));
      const deadRun = state.runs[deadRunId];
      const abandonedRun = state.runs[abandonRunId];
      assert(deadRun.outcome === "dead", "Expected death run outcome");
      assert(deadRun.deathCause === "well" && deadRun.deathEntityId === "charybdis", "Expected death cause context");
      assert(deadRun.cargoLost.length === 1 && deadRun.cargoExtracted.length === 0, "Expected death cargo loss");
      assert(deadRun.emEarned === 16, "Expected reduced death EM to persist");
      assert(deadRun.notables[0].type === "death_cause", "Expected notable death cause");
      assert(abandonedRun.outcome === "abandoned", "Expected abandoned outcome");
      assert(abandonedRun.cargoLost.length === 1, "Expected abandoned cargo to be recorded as lost");
      assert(abandonedRun.signalPeakZone === "ghost", "Expected fallback signal zone for abandoned run");
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
          loot: [{ id: "echo-loot-a", name: "Echo Loot A", value: 240 }],
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
          loot: [{ id: "echo-loot-b", name: "Echo Loot B", value: 260 }],
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

    await runner.run("Echoes reject empty loot", async () => {
      let rejected = false;
      try {
        await postJson(`${CONTROL_URL}/echoes/save`, {
          wreck: {
            wreckId: `empty-echo-${crypto.randomUUID()}`,
            mapId: "shallows",
            seed: 12345,
            pilotName: "Empty Pilot",
            wx: 1.5,
            wy: 1.5,
            loot: [],
          },
        });
      } catch (error) {
        rejected = /wreck\.loot/.test(error.message);
      }
      assert(rejected, "Expected control plane to reject empty chronicle echoes");
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
