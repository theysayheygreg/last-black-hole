const { TestRunner, assert } = require("./helpers.cjs");
const { normalizeInputMessage } = require("../scripts/sim-protocol.cjs");

async function run() {
  const runner = new TestRunner("SimProtocol");

  await runner.run("Input normalization preserves bounded slingshot edge ids", async () => {
    const normalized = normalizeInputMessage({
      clientId: "pilot",
      seq: 7.9,
      moveX: 8,
      moveY: -8,
      thrust: 3,
      brake: -1,
      slingshot: false,
      slingshotEdges: [1, { id: 2 }, 2, -1, 3, 4, 5, 6, 7, 8, 9],
      pulse: "yes",
      consumeSlot: 99,
    });

    assert(normalized.seq === 7, `Expected floored seq 7, got ${normalized.seq}`);
    assert(Math.abs(Math.hypot(normalized.moveX, normalized.moveY) - 1) < 1e-9, "Expected unit movement vector clamp");
    assert(normalized.thrust === 1 && normalized.brake === 0, "Expected scalar action clamp");
    assert(normalized.slingshot === false, "Held slingshot state should remain distinct from press edges");
    assert(JSON.stringify(normalized.slingshotEdges) === JSON.stringify([1, 2, 3, 4, 5, 6, 7, 8]),
      `Expected unique positive edge ids capped at 8, got ${normalized.slingshotEdges}`);
    assert(normalized.pulse === true, "Expected pulse boolean normalization");
    assert(normalized.consumeSlot === 1, "Expected consumable slot clamp");
  });

  await runner.run("Missing slingshot edges normalize to an empty queue", async () => {
    const normalized = normalizeInputMessage({ clientId: "pilot", seq: 1 });
    assert(Array.isArray(normalized.slingshotEdges) && normalized.slingshotEdges.length === 0,
      "Expected absent press edges to normalize to an empty queue");
  });

  const allPassed = runner.summary();
  process.exit(allPassed ? 0 : 1);
}

run().catch((error) => {
  console.error(error.stack || error.message);
  process.exit(1);
});
