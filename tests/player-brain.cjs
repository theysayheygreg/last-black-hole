const { startSimServer, stopSimServer, TestRunner, assert } = require("./helpers.cjs");
const {
  createPlayerBrain,
  normalizeProfileUpgrades,
} = require("../scripts/player-brain.cjs");
const { HULL_DEFINITIONS } = require("../scripts/content/hulls.cjs");

const SIM_PORT = 8795;
const SIM_URL = `http://127.0.0.1:${SIM_PORT}`;

async function post(path, body) {
  const response = await fetch(`${SIM_URL}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  return { status: response.status, body: await response.json() };
}

async function run() {
  const runner = new TestRunner("PlayerBrain");

  await runner.run("PlayerBrain resolves durable upgrade coefficients", async () => {
    const brain = createPlayerBrain({
      hullType: "drifter",
      profileUpgrades: normalizeProfileUpgrades({
        thrust: 2,
        coupling: 3,
        drag: 1,
        sensor: 2,
        hull: 3,
      }),
    });

    assert(Math.abs(brain.thrustScale - (0.7 * 1.3)) < 1e-6, `Unexpected thrustScale ${brain.thrustScale}`);
    assert(Math.abs(brain.currentCoupling - (1.6 * 1.3)) < 1e-6, `Unexpected currentCoupling ${brain.currentCoupling}`);
    assert(Math.abs(brain.dragScale - (0.85 * 0.88)) < 1e-6, `Unexpected dragScale ${brain.dragScale}`);
    assert(Math.abs(brain.sensorRange - (1.0 * 1.45)) < 1e-6, `Unexpected sensorRange ${brain.sensorRange}`);
    assert(Math.abs(brain.wellGraceDuration - 0.5) < 1e-6, `Unexpected wellGraceDuration ${brain.wellGraceDuration}`);
    assert(brain.freeWellSurvives === 1, `Expected one free well survive, got ${brain.freeWellSurvives}`);
  });

  await startSimServer(SIM_PORT);
  try {
    await runner.run("Remote join hydrates brain from durable profile upgrades", async () => {
      const start = await post("/session/start", {
        mapId: "shallows",
        requesterId: "brain-host",
        requesterName: "Brain Host",
      });
      assert(start.status === 200, `Expected /session/start 200, got ${start.status}`);

      const join = await post("/join", {
        clientId: "brain-client",
        name: "Brain Pilot",
        profileId: "brain-profile",
        profileSnapshot: {
          id: "brain-profile",
          name: "Brain Pilot",
          shipType: "standard",
          upgrades: { thrust: 2, coupling: 1, drag: 1, sensor: 3, hull: 2 },
          loadout: { equipped: [null, null], consumables: [null, null] },
        },
      });
      assert(join.status === 200, `Expected /join 200, got ${join.status}`);
      const player = join.body.player;
      assert(player.brain, "Expected server player brain");
      assert(Math.abs(player.brain.thrustScale - (0.7 * 1.3)) < 1e-6, `Unexpected hydrated thrustScale ${player.brain.thrustScale}`);
      assert(Math.abs(player.brain.sensorRange - 1.7) < 1e-6, `Unexpected hydrated sensorRange ${player.brain.sensorRange}`);
      assert(Math.abs(player.brain.wellGraceDuration - 0.4) < 1e-6, `Unexpected hydrated wellGraceDuration ${player.brain.wellGraceDuration}`);
      assert(player.abilityState.wellSurvivesRemaining === 1, `Expected one profile free pass, got ${player.abilityState.wellSurvivesRemaining}`);
    });

    await runner.run("Equipping an artifact refreshes the live brain", async () => {
      const update = await post("/join", {
        clientId: "brain-client",
        profileSnapshot: {
          upgrades: { thrust: 2, coupling: 1, drag: 1, sensor: 3, hull: 2 },
        },
        equipped: [
          {
            id: "gravity-anchor",
            name: "Gravity Anchor",
            category: "artifact",
            subcategory: "equippable",
            tier: "unique",
            effect: "reduceWellPull",
          },
          null,
        ],
      });
      assert(update.status === 200, `Expected join update 200, got ${update.status}`);
      const player = update.body.player;
      assert(player.brain.wellResistScale > 1.0, `Expected wellResistScale > 1, got ${player.brain.wellResistScale}`);
      assert(player.activeEffects.includes("reduceWellPull"), "Expected active reduceWellPull effect");
    });

    await runner.run("Rig copy-backed levels have server-owned coefficients", async () => {
      const breacher = createPlayerBrain({
        hullType: "breacher",
        rigLevels: [2, 2, 2],
      });
      assert(breacher.thrustScale > HULL_DEFINITIONS.breacher.thrustScale, `Expected breacher rig thrust boost, got ${breacher.thrustScale}`);
      assert(breacher.pickupRadius > HULL_DEFINITIONS.breacher.pickupRadius, `Expected breacher pickup boost, got ${breacher.pickupRadius}`);
      assert(breacher.controlDebuffResist > HULL_DEFINITIONS.breacher.controlDebuffResist, `Expected breacher control resistance, got ${breacher.controlDebuffResist}`);

      const resonant = createPlayerBrain({
        hullType: "resonant",
        rigLevels: [1, 1, 0],
      });
      assert(Math.abs(resonant.pulseRadiusScale - (HULL_DEFINITIONS.resonant.pulseRadiusScale * 1.1)) < 1e-6,
        `Expected resonant pulse radius rig boost, got ${resonant.pulseRadiusScale}`);
      assert(resonant.pulseCooldownScale < HULL_DEFINITIONS.resonant.pulseCooldownScale,
        `Expected resonant pulse cooldown reduction, got ${resonant.pulseCooldownScale}`);
    });
  } finally {
    await stopSimServer(SIM_PORT);
  }

  const allPassed = runner.summary();
  process.exit(allPassed ? 0 : 1);
}

run().catch(async (err) => {
  console.error("PlayerBrain test fatal error:", err.message);
  try { await stopSimServer(SIM_PORT); } catch {}
  process.exit(1);
});
