const { TestRunner, assert } = require("./helpers.cjs");
const { normalizeInputMessage } = require("../scripts/sim-protocol.cjs");

async function run() {
  const runner = new TestRunner("SimProtocol");

  await runner.run("Input normalization preserves bounded slingshot press edges", async () => {
    const normalized = normalizeInputMessage({
      clientId: "pilot",
      seq: 7.9,
      moveX: 8,
      moveY: -8,
      thrust: 3,
      brake: -1,
      slingshot: false,
      slingshotPresses: 9,
      pulse: "yes",
      consumeSlot: 99,
    });

    assert(normalized.seq === 7, `Expected floored seq 7, got ${normalized.seq}`);
    assert(normalized.moveX === 1 && normalized.moveY === -1, "Expected movement vector clamp");
    assert(normalized.thrust === 1 && normalized.brake === 0, "Expected scalar action clamp");
    assert(normalized.slingshot === false, "Held slingshot state should remain distinct from press edges");
    assert(normalized.slingshotPresses === 4, `Expected press edge clamp to 4, got ${normalized.slingshotPresses}`);
    assert(normalized.pulse === true, "Expected pulse boolean normalization");
    assert(normalized.consumeSlot === 1, "Expected consumable slot clamp");
  });

  await runner.run("Missing slingshot edges normalize to zero", async () => {
    const normalized = normalizeInputMessage({ clientId: "pilot", seq: 1 });
    assert(normalized.slingshotPresses === 0, "Expected absent press edges to normalize to zero");
  });

  const allPassed = runner.summary();
  process.exit(allPassed ? 0 : 1);
}

run().catch((error) => {
  console.error(error.stack || error.message);
  process.exit(1);
});
