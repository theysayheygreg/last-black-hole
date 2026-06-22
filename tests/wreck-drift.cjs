/**
 * wreck-drift.cjs — deterministic WreckSystem drift coverage.
 *
 * Browser systems tests cover presentation. This suite owns the pure wreck
 * physics contract: wrecks inside well drift range should move inward when the
 * WreckSystem is ticked.
 */
const { TestRunner, assert } = require("./helpers.cjs");

function dist(a, b) {
  return Math.hypot(a.wx - b.wx, a.wy - b.wy);
}

async function run() {
  const runner = new TestRunner("WreckDrift");
  const { WreckSystem } = await import("../src/wrecks.js");
  const { WellSystem } = await import("../src/wells.js");

  const dummyFluid = {
    splat() {},
    visualSplat() {},
  };

  await runner.run("Wrecks inside well range drift inward", async () => {
    const wells = new WellSystem();
    const well = wells.addWell(1.0, 1.0, { mass: 1.5, killRadius: 0.05 });
    const wrecks = new WreckSystem();
    const wreck = wrecks.addWreck(1.25, 1.0, {
      type: "debris",
      tier: 1,
      size: "small",
      pickupCooldown: 999,
    });

    const before = dist(wreck, well);
    for (let i = 0; i < 120; i++) {
      wrecks.update(dummyFluid, 1 / 60, i / 60, 1.5, 1.5, wells);
    }
    const after = dist(wreck, well);

    assert(after < before - 0.001,
      `Expected wreck to drift inward (${before.toFixed(4)} -> ${after.toFixed(4)})`);
    assert(Number.isFinite(wreck.vx) && Number.isFinite(wreck.vy), "Expected finite drift velocity");
  });

  const ok = runner.summary();
  process.exit(ok ? 0 : 1);
}

run().catch((err) => {
  console.error("WreckDrift test fatal error:", err.stack || err.message);
  process.exit(1);
});
