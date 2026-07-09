const { TestRunner, assert } = require("./helpers.cjs");
const { normalizeInputMessage } = require("../scripts/sim-protocol.cjs");

async function run() {
  const runner = new TestRunner("SimProtocolInput");

  await runner.run("normalizes crafted move vectors without changing scalar actions", async () => {
    const input = normalizeInputMessage({
      runId: "run-input",
      playerId: "diag",
      commandSeq: 4,
      commandCredential: "diag-secret",
      seq: 7,
      moveX: 1,
      moveY: 1,
      thrust: 1,
      brake: 1,
      pulse: true,
      ability1: true,
      ability2: true,
      slingshotEdges: [3, { id: 4 }, 4, 0, -1, "5"],
      consumeSlot: 1,
      timestamp: 123,
    });

    assert(Math.abs(Math.hypot(input.moveX, input.moveY) - 1) < 1e-12,
      `Expected unit move vector, got ${input.moveX},${input.moveY}`);
    assert(input.thrust === 1 && input.brake === 1, "Expected scalar action fields to keep their requested intensity");
    assert(input.pulse === true && input.ability1 === true && input.ability2 === true, "Expected boolean actions to survive normalization");
    assert(input.slingshotEdges.join(",") === "3,4,5",
      `Expected deduped slingshot edges to survive normalization, got ${input.slingshotEdges.join(",")}`);
    assert(input.consumeSlot === 1, `Expected consume slot 1, got ${input.consumeSlot}`);
    assert(input.runId === "run-input" && input.playerId === "diag" && input.commandSeq === 4,
      "Expected v2 command envelope on normalized input");
  });

  await runner.run("leaves brake-only facing vectors intact", async () => {
    const input = normalizeInputMessage({
      clientId: "diag",
      moveX: 0.6,
      moveY: 0.8,
      thrust: 0,
      brake: 1,
    });

    assert(input.moveX === 0.6 && input.moveY === 0.8,
      `Expected already-unit vector to pass through, got ${input.moveX},${input.moveY}`);
    assert(input.brake === 1 && input.thrust === 0, "Expected brake-only input to keep steering intent");
  });

  const allPassed = runner.summary();
  process.exit(allPassed ? 0 : 1);
}

run().catch((err) => {
  console.error("SimProtocolInput test fatal error:", err.message);
  process.exit(1);
});
