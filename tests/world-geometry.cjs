const { TestRunner, assert } = require("./helpers.cjs");
const {
  closestPointOnToroidalSegment,
  sweptMovingCircleVsCircle,
  wrapPosition,
  wrappedDelta,
  wrappedDistance,
  wrappedDistanceSquared,
} = require("../scripts/sim/world-geometry.cjs");

const EPSILON = 1e-9;

function near(actual, expected, label) {
  assert(Math.abs(actual - expected) <= EPSILON, `${label}: expected ${expected}, got ${actual}`);
}

async function run() {
  const runner = new TestRunner("WorldGeometry");

  await runner.run("wrapped deltas and distances use the shortest world-space path", async () => {
    near(wrapPosition(-0.2, 10), 9.8, "negative position wrap");
    near(wrapPosition(10.2, 10), 0.2, "positive position wrap");
    near(wrappedDelta(9.8, 0.2, 10), 0.4, "positive x seam delta");
    near(wrappedDelta(0.2, 9.8, 10), -0.4, "negative x seam delta");
    near(wrappedDelta(0, 5, 10), 5, "positive half-world tie");
    near(wrappedDelta(5, 0, 10), -5, "negative half-world tie");
    near(wrappedDelta(0, 25, 10), 5, "multi-wrap positive half-world tie");
    near(wrappedDelta(0, -25, 10), -5, "multi-wrap negative half-world tie");
    near(wrappedDistanceSquared(9.8, 9.7, 0.2, 0.1, 10), 0.32, "corner seam distance squared");
    near(wrappedDistance(9.8, 9.7, 0.2, 0.1, 10), Math.sqrt(0.32), "corner seam distance");
  });

  await runner.run("closest approach handles ordinary and zero-length segments", async () => {
    const ordinary = closestPointOnToroidalSegment({
      pointX: 3,
      pointY: 2,
      startX: 0,
      startY: 0,
      deltaX: 4,
      deltaY: 0,
      worldScale: 10,
    });
    near(ordinary.t, 0.75, "ordinary closest t");
    near(ordinary.closestX, 3, "ordinary closest x");
    near(ordinary.distance, 2, "ordinary distance");

    const stationary = closestPointOnToroidalSegment({
      pointX: 0.1,
      pointY: 4.9,
      startX: 4.9,
      startY: 0.1,
      deltaX: 0,
      deltaY: 0,
      worldScale: 5,
    });
    near(stationary.t, 0, "stationary closest t");
    near(stationary.distanceSquared, 0.08, "stationary corner distance squared");
  });

  await runner.run("closest approach follows x, y, and corner seam crossings", async () => {
    const xSeam = closestPointOnToroidalSegment({
      pointX: 0.1, pointY: 2, startX: 4.7, startY: 2, deltaX: 0.6, deltaY: 0, worldScale: 5,
    });
    near(xSeam.t, 2 / 3, "x seam t");
    near(xSeam.distance, 0, "x seam distance");
    near(xSeam.closestX, 0.1, "x seam wrapped x");

    const ySeam = closestPointOnToroidalSegment({
      pointX: 2, pointY: 0.1, startX: 2, startY: 4.7, deltaX: 0, deltaY: 0.6, worldScale: 5,
    });
    near(ySeam.t, 2 / 3, "y seam t");
    near(ySeam.distance, 0, "y seam distance");

    const corner = closestPointOnToroidalSegment({
      pointX: 0.1, pointY: 0.1, startX: 4.7, startY: 4.7, deltaX: 0.6, deltaY: 0.6, worldScale: 5,
    });
    near(corner.t, 2 / 3, "corner seam t");
    near(corner.distance, 0, "corner seam distance");
  });

  await runner.run("swept circles catch high-speed tunneling and report misses", async () => {
    const hit = sweptMovingCircleVsCircle({
      startX: 0,
      startY: 2,
      deltaX: 8,
      deltaY: 0,
      movingRadius: 0.1,
      targetX: 4,
      targetY: 2,
      targetRadius: 0.2,
      worldScale: 10,
    });
    assert(hit.hit, "Expected a fast sweep to hit the target between endpoints");
    near(hit.t, 3.7 / 8, "high-speed impact t");
    near(hit.contactX, 3.7, "high-speed contact x");
    near(hit.normalX, -1, "high-speed contact normal");

    const miss = sweptMovingCircleVsCircle({
      startX: 0, startY: 0, deltaX: 8, deltaY: 0,
      movingRadius: 0.1, targetX: 4, targetY: 2, targetRadius: 0.2, worldScale: 10,
    });
    assert(!miss.hit, "Expected a parallel high-speed pass to miss");
  });

  await runner.run("swept circles handle stationary overlap and stationary separation", async () => {
    const overlap = sweptMovingCircleVsCircle({
      startX: 0.05, startY: 2, deltaX: 0, deltaY: 0,
      movingRadius: 0.1, targetX: 4.95, targetY: 2, targetRadius: 0.1, worldScale: 5,
    });
    assert(overlap.hit && overlap.startedOverlapping, "Expected seam-adjacent stationary circles to overlap");
    near(overlap.t, 0, "stationary overlap t");

    const separated = sweptMovingCircleVsCircle({
      startX: 1, startY: 1, deltaX: 0, deltaY: 0,
      movingRadius: 0.1, targetX: 2, targetY: 2, targetRadius: 0.1, worldScale: 5,
    });
    assert(!separated.hit, "Expected separated stationary circles to miss");
  });

  await runner.run("swept circles detect x, y, and corner seam contacts", async () => {
    const cases = [
      { label: "x", startX: 4.6, startY: 2, deltaX: 0.8, deltaY: 0, targetX: 0.2, targetY: 2 },
      { label: "y", startX: 2, startY: 4.6, deltaX: 0, deltaY: 0.8, targetX: 2, targetY: 0.2 },
      { label: "corner", startX: 4.6, startY: 4.6, deltaX: 0.8, deltaY: 0.8, targetX: 0.2, targetY: 0.2 },
    ];

    for (const seam of cases) {
      const hit = sweptMovingCircleVsCircle({
        ...seam,
        movingRadius: 0.05,
        targetRadius: 0.05,
        worldScale: 5,
      });
      assert(hit.hit, `Expected ${seam.label} seam sweep to hit`);
      assert(hit.t > 0 && hit.t < 1, `Expected ${seam.label} seam contact during the sweep, got ${hit.t}`);
      assert(hit.contactX >= 0 && hit.contactX < 5 && hit.contactY >= 0 && hit.contactY < 5,
        `Expected ${seam.label} contact to be wrapped into the world`);
    }
  });

  await runner.run("multi-wrap displacement preserves the earliest contact", async () => {
    const hit = sweptMovingCircleVsCircle({
      startX: 1,
      startY: 1,
      deltaX: 12,
      deltaY: 0,
      movingRadius: 0.1,
      targetX: 2,
      targetY: 1,
      targetRadius: 0.1,
      worldScale: 5,
    });
    assert(hit.hit, "Expected a multi-wrap sweep to hit");
    near(hit.t, 0.8 / 12, "multi-wrap earliest impact t");
    near(hit.contactX, 1.8, "multi-wrap earliest contact x");
  });

  const allPassed = runner.summary();
  process.exit(allPassed ? 0 : 1);
}

run().catch((error) => {
  console.error(error.stack || error.message);
  process.exit(1);
});
