const { TestRunner, assert } = require("./helpers");
const {
  createOverloadController,
  projectOverloadBudget,
  advanceOverload,
} = require("../scripts/overload-state.js");

function makeBase() {
  return {
    tickHz: 10,
    snapshotHz: 6,
    worldTickHz: 4,
    portalTickHz: 4,
    growthTickHz: 3,
    scavengerTickHz: 6,
    waveTickHz: 10,
    entityRelevanceRadius: 1.0,
    scavengerRelevanceRadius: 1.4,
    spawnScavengersBase: 1,
    spawnScavengersPerPlayer: 0.5,
    maxScavengers: 7,
    maxRelevantStarsPerPlayer: 4,
    maxRelevantPlanetoidsPerPlayer: 3,
    maxRelevantWrecksPerPlayer: 3,
    maxRelevantScavengersPerPlayer: 3,
    maxWellInfluencesPerPlayer: 4,
    maxWaveInfluencesPerPlayer: 4,
    maxPickupChecksPerPlayer: 2,
    maxPortalChecksPerPlayer: 2,
    maxPlayers: 8,
  };
}

async function run() {
  const runner = new TestRunner("OverloadState");

  await runner.run("Normal projection preserves base clocks and budgets", async () => {
    const projection = projectOverloadBudget(makeBase(), "NORMAL");
    assert(projection.overloadState === "NORMAL", "Expected NORMAL state");
    assert(projection.timeScale === 1, "Expected timeScale 1 in NORMAL");
    assert(projection.tickHz === 10, `Expected tickHz 10, got ${projection.tickHz}`);
    assert(projection.snapshotHz === 6, `Expected snapshotHz 6, got ${projection.snapshotHz}`);
    assert(projection.maxWellInfluencesPerPlayer === 4, "Expected well budget unchanged in NORMAL");
  });

  await runner.run("Sustained pressure steps through overload states", async () => {
    const controller = createOverloadController(makeBase());
    let state = controller.state;
    for (let i = 0; i < 6; i++) {
      state = advanceOverload(controller, {
        tickCostMs: 16,
        playerCount: 8,
        aiCount: 7,
        forcePressure: 1.3,
      }).state;
    }
    assert(state === "THROTTLED", `Expected THROTTLED, got ${state}`);

    for (let i = 0; i < 6; i++) {
      state = advanceOverload(controller, {
        tickCostMs: 14,
        playerCount: 8,
        aiCount: 7,
        forcePressure: 1.1,
      }).state;
    }
    assert(state === "DEGRADED", `Expected DEGRADED, got ${state}`);

    for (let i = 0; i < 6; i++) {
      state = advanceOverload(controller, {
        tickCostMs: 22,
        playerCount: 8,
        aiCount: 7,
        forcePressure: 1.8,
      }).state;
    }
    assert(state === "DILATED", `Expected DILATED, got ${state}`);
  });

  await runner.run("Dilation projection slows the shared run and trims budgets", async () => {
    const projection = projectOverloadBudget(makeBase(), "DILATED");
    assert(projection.timeScale < 1, "Expected timeScale below 1 in DILATED");
    assert(projection.tickHz < 10, `Expected reduced tickHz in DILATED, got ${projection.tickHz}`);
    assert(projection.snapshotHz < 6, `Expected reduced snapshotHz in DILATED, got ${projection.snapshotHz}`);
    assert(projection.maxScavengers < 7, `Expected reduced scavenger budget in DILATED, got ${projection.maxScavengers}`);
    assert(
      projection.maxWellInfluencesPerPlayer < 4,
      `Expected reduced well influence budget in DILATED, got ${projection.maxWellInfluencesPerPlayer}`
    );
  });

  await runner.run("Sustained recovery walks the state back down", async () => {
    const controller = createOverloadController(makeBase());
    for (let stage = 0; stage < 18; stage++) {
      advanceOverload(controller, {
        tickCostMs: 22,
        playerCount: 8,
        aiCount: 7,
        forcePressure: 1.8,
      });
    }
    assert(controller.state === "DILATED", `Expected DILATED before recovery, got ${controller.state}`);

    for (let i = 0; i < 72; i++) {
      advanceOverload(controller, {
        tickCostMs: 2,
        playerCount: 1,
        aiCount: 1,
        forcePressure: 0.1,
      });
    }
    assert(controller.state === "NORMAL", `Expected recovery to NORMAL, got ${controller.state}`);
  });

  const allPassed = runner.summary();
  process.exit(allPassed ? 0 : 1);
}

run().catch((err) => {
  console.error("OverloadState test fatal error:", err.message);
  process.exit(1);
});
