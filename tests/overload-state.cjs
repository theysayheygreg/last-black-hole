const { TestRunner, assert } = require("./helpers.cjs");
const {
  AUTHORITY_INTEGRATION_HZ,
  createOverloadController,
  projectOverloadBudget,
  advanceOverload,
} = require("../scripts/overload-state.cjs");

function makeBase() {
  return {
    tickHz: 10, // Deliberately ignored: movement clock is content-owned.
    snapshotHz: 6,
  };
}

async function run() {
  const runner = new TestRunner("OverloadState");

  await runner.run("Normal projection exposes the canonical clock", async () => {
    const projection = projectOverloadBudget(makeBase(), "NORMAL");
    assert(projection.overloadState === "NORMAL", "Expected NORMAL state");
    assert(projection.timeScale === 1, "Expected timeScale 1 in NORMAL");
    assert(projection.tickHz === AUTHORITY_INTEGRATION_HZ,
      `Expected canonical tickHz ${AUTHORITY_INTEGRATION_HZ}, got ${projection.tickHz}`);
    assert(projection.snapshotHz === 6, `Expected snapshotHz 6, got ${projection.snapshotHz}`);
  });

  await runner.run("Sustained pressure steps through overload states", async () => {
    const controller = createOverloadController(makeBase());
    let state = controller.state;
    for (let i = 0; i < 6; i++) {
      state = advanceOverload(controller, {
        tickCostMs: 70,
      }).state;
    }
    assert(state === "THROTTLED", `Expected THROTTLED, got ${state}`);

    for (let i = 0; i < 6; i++) {
      state = advanceOverload(controller, {
        tickCostMs: 70,
      }).state;
    }
    assert(state === "DEGRADED", `Expected DEGRADED, got ${state}`);

    for (let i = 0; i < 6; i++) {
      state = advanceOverload(controller, {
        tickCostMs: 70,
      }).state;
    }
    assert(state === "DILATED", `Expected DILATED, got ${state}`);
  });

  await runner.run("Map population cannot classify a healthy tick as overloaded", async () => {
    const sparse = createOverloadController(makeBase());
    const dense = createOverloadController(makeBase());
    for (let i = 0; i < 8; i++) {
      advanceOverload(sparse, {
        tickCostMs: 2,
        playerCount: 1,
        aiCount: 1,
        forcePressure: 0,
      });
      advanceOverload(dense, {
        tickCostMs: 2,
        playerCount: 1,
        aiCount: 1000,
        forcePressure: 1000,
      });
    }
    assert(sparse.state === "NORMAL", `Expected sparse healthy state NORMAL, got ${sparse.state}`);
    assert(dense.state === "NORMAL", `Expected dense healthy state NORMAL, got ${dense.state}`);
    assert(dense.pressure < 1, `Expected measured healthy pressure, got ${dense.pressure}`);
  });

  await runner.run("Pressure only reduces snapshot transport", async () => {
    const projection = projectOverloadBudget(makeBase(), "DILATED");
    assert(projection.timeScale === 1, "Pressure must not change simulation wall time");
    assert(projection.tickHz === AUTHORITY_INTEGRATION_HZ,
      `Pressure must not change canonical tickHz, got ${projection.tickHz}`);
    assert(projection.snapshotHz < 6, `Expected reduced snapshotHz in DILATED, got ${projection.snapshotHz}`);
    assert(JSON.stringify(Object.keys(projection).sort()) === JSON.stringify(["overloadState", "snapshotHz", "tickHz", "timeScale"]),
      "Pressure projection must not mutate gameplay budgets or cadence");
  });

  await runner.run("Sustained recovery walks the state back down", async () => {
    const controller = createOverloadController(makeBase());
    for (let stage = 0; stage < 18; stage++) {
      advanceOverload(controller, {
        tickCostMs: 70,
      });
    }
    assert(controller.state === "DILATED", `Expected DILATED before recovery, got ${controller.state}`);

    for (let i = 0; i < 120; i++) {
      advanceOverload(controller, {
        tickCostMs: 2,
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
