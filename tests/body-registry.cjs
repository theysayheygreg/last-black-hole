const { TestRunner, assert } = require("./helpers.cjs");
const { BODY_MASKS } = require("../scripts/sim/body-masks.cjs");
const {
  BodyRegistry,
  DuplicateBodyIdError,
  StaleBodyHandleError,
} = require("../scripts/sim/body-registry.cjs");

async function run() {
  const runner = new TestRunner("BodyRegistry");

  await runner.run("Allocates stable public ids and private handles", async () => {
    const registry = new BodyRegistry({ worldScale: 4 });
    const handle = registry.createBody({
      id: "player:one",
      category: "player",
      wx: 3.9,
      wy: -0.1,
      radius: 0.04,
      collisionMask: BODY_MASKS.PLAYER,
      interactionMask: BODY_MASKS.PICKUP,
    }, { tick: 7 });

    assert(handle.slot === 0 && handle.generation === 1, `Expected first handle slot/generation, got ${JSON.stringify(handle)}`);
    const body = registry.getBody(handle);
    assert(body.id === "player:one", `Expected stable public id, got ${body.id}`);
    assert(body.handle !== handle && body.handle.slot === handle.slot, "Expected registry-owned private handle copy");
    assert(body.wx >= 0 && body.wx < 4 && body.wy >= 0 && body.wy < 4, "Expected wrapped world coordinates");
    assert(body.lifecycle.state === "spawning", `Expected spawning state, got ${body.lifecycle.state}`);
    assert(body.lifecycle.createdTick === 7, `Expected created tick 7, got ${body.lifecycle.createdTick}`);
    assert((body.collisionMask & BODY_MASKS.PLAYER) !== 0, "Expected player collision mask");
    assert((body.interactionMask & BODY_MASKS.PICKUP) !== 0, "Expected pickup interaction mask");
  });

  await runner.run("Updates motion fields and lifecycle tick stamps", async () => {
    const registry = new BodyRegistry({ worldScale: 2 });
    const handle = registry.createBody({ id: "wreck:alpha", wx: 0.2, wy: 0.3, radius: 0.1 }, { tick: 2 });
    registry.setLifecycle(handle, "alive", { tick: 3 });
    const body = registry.updateBody(handle, {
      wx: 2.1,
      wy: -0.2,
      vx: 0.5,
      vy: -0.25,
      radius: 0.12,
    }, { tick: 4 });

    assert(body.lifecycle.state === "alive", `Expected alive state, got ${body.lifecycle.state}`);
    assert(body.lifecycle.changedTick === 3, `Expected changed tick 3, got ${body.lifecycle.changedTick}`);
    assert(body.lifecycle.updatedTick === 4, `Expected updated tick 4, got ${body.lifecycle.updatedTick}`);
    assert(Math.abs(body.prevWX - 0.2) < 1e-12 && Math.abs(body.prevWY - 0.3) < 1e-12,
      `Expected previous position to be preserved, got (${body.prevWX}, ${body.prevWY})`);
    assert(Math.abs(body.wx - 0.1) < 1e-12, `Expected wrapped wx 0.1, got ${body.wx}`);
    assert(Math.abs(body.wy - 1.8) < 1e-12, `Expected wrapped wy 1.8, got ${body.wy}`);
    assert(body.vx === 0.5 && body.vy === -0.25, "Expected velocity update");
    assert(body.radius === 0.12, `Expected radius update, got ${body.radius}`);
  });

  await runner.run("Rejects duplicate active public ids", async () => {
    const registry = new BodyRegistry();
    registry.createBody({ id: "portal:one", wx: 0, wy: 0, radius: 0.1 });
    let error = null;
    try {
      registry.createBody({ id: "portal:one", wx: 0.5, wy: 0.5, radius: 0.1 });
    } catch (err) {
      error = err;
    }
    assert(error instanceof DuplicateBodyIdError, `Expected DuplicateBodyIdError, got ${error?.name}`);
    assert(error.code === "DUPLICATE_BODY_ID", `Expected duplicate code, got ${error.code}`);
    assert(registry.stats().duplicateIdRejects === 1, "Expected duplicate id reject stat");
  });

  await runner.run("Rejects stale handles explicitly after removal and recycle", async () => {
    const registry = new BodyRegistry({ worldScale: 3 });
    const first = registry.createBody({ id: "well:old", wx: 1, wy: 1, radius: 0.2 }, { tick: 1 });
    const removed = registry.removeBody(first, { tick: 9 });
    assert(removed.lifecycle.state === "removed", `Expected removed tombstone, got ${removed.lifecycle.state}`);
    assert(removed.lifecycle.removedTick === 9, `Expected removed tick 9, got ${removed.lifecycle.removedTick}`);

    let removedError = null;
    try {
      registry.getBody(first);
    } catch (err) {
      removedError = err;
    }
    assert(removedError instanceof StaleBodyHandleError, `Expected stale handle error, got ${removedError?.name}`);
    assert(removedError.code === "STALE_BODY_HANDLE", `Expected stale code, got ${removedError.code}`);
    assert(removedError.reason === "removed body", `Expected removed reason, got ${removedError.reason}`);

    const second = registry.createBody({ id: "well:new", wx: 1.5, wy: 1.5, radius: 0.2 }, { tick: 10 });
    assert(second.slot === first.slot, "Expected recycled slot");
    assert(second.generation === first.generation + 1, "Expected generation bump on recycled slot");

    let recycledError = null;
    try {
      registry.updateBody(first, { wx: 2 }, { tick: 11 });
    } catch (err) {
      recycledError = err;
    }
    assert(recycledError instanceof StaleBodyHandleError, `Expected stale recycle error, got ${recycledError?.name}`);
    assert(recycledError.reason === "recycled slot", `Expected recycled reason, got ${recycledError.reason}`);
    assert(registry.stats().staleHandleRejects >= 2, "Expected stale reject stats");
  });

  const allPassed = runner.summary();
  process.exit(allPassed ? 0 : 1);
}

run().catch((err) => {
  console.error("BodyRegistry test fatal error:", err.message);
  process.exit(1);
});
