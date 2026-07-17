const assert = require("assert");
const {
  INTERNAL,
  SLINGSHOT_KNOB_CONTRACT,
  SLINGSHOT_VALUES,
  boundedReleaseDelta,
  captureRadiusWorld,
  coyoteWindowOpen,
  engageEligible,
  effectiveCoyoteTimeMs,
  releaseSpeedCap,
  resolveChainCount,
  rotateToward,
  tangentialSpeed,
} = require("../scripts/sim/slingshot-contract.cjs");
const { simUnitsToMeters } = require("../scripts/content/units.cjs");

function run() {
  const names = Object.keys(SLINGSHOT_KNOB_CONTRACT);
  assert.deepStrictEqual(names, ["captureRadius", "magnetism", "coyoteTime", "payoffCurve", "chainWindow"]);
  assert.deepStrictEqual(
    names.map((name) => SLINGSHOT_KNOB_CONTRACT[name].step),
    [25, 5, 50, 0.1, 0.5],
  );
  assert.deepStrictEqual(SLINGSHOT_VALUES, {
    captureRadius: simUnitsToMeters(0.45),
    magnetism: 30,
    coyoteTime: 50,
    payoffCurve: 1.4,
    chainWindow: 0.5,
  });
  assert.strictEqual(captureRadiusWorld("well"), 0.45);
  assert.strictEqual(captureRadiusWorld("star"), 0.3);
  assert.strictEqual(captureRadiusWorld("planetoid"), 0.18);

  const locked = rotateToward({ x: 1, y: 0 }, { x: 0, y: 1 }, SLINGSHOT_VALUES.magnetism);
  assert(locked.bendDegrees <= SLINGSHOT_VALUES.magnetism + 1e-9, "entry bend must be capped");

  const entrySpeed = 2;
  const cap = releaseSpeedCap(entrySpeed, Math.PI / 2, SLINGSHOT_VALUES.payoffCurve, 1);
  const release = boundedReleaseDelta({
    velocity: { x: 0, y: entrySpeed },
    direction: { x: 1, y: 0 },
    entrySpeed,
    arcRadians: Math.PI / 2,
    payoffCurve: SLINGSHOT_VALUES.payoffCurve,
    chainCount: 1,
    desiredBoost: 100,
  });
  assert(Math.abs(cap - 2.8) < 1e-9, `Expected 1.4x quarter-turn cap, got ${cap}`);
  assert(release.exitSpeed <= cap + 1e-9, "release must never exceed payoff cap");
  assert(release.delta.x > 0 && Math.abs(release.delta.y) < 1e-9, "release follows supplied stick-relative direction");

  assert(coyoteWindowOpen(10.049, 10, SLINGSHOT_VALUES.coyoteTime));
  assert(!coyoteWindowOpen(10.051, 10, SLINGSHOT_VALUES.coyoteTime));
  assert(!coyoteWindowOpen(10.1, 10, 0), "zero coyote time is truthfully disabled");
  const shallowsDt = 1 / 15;
  const effectiveCoyoteMs = effectiveCoyoteTimeMs(SLINGSHOT_VALUES.coyoteTime, shallowsDt);
  assert.strictEqual(SLINGSHOT_VALUES.coyoteTime, 50, "canonical coyote value must remain 50 ms");
  assert.strictEqual(INTERNAL.promptTransportTicks, 4, "Prompt transport allowance must remain an internal four-tick constant");
  assert.strictEqual(INTERNAL.rangeBreakGraceFactor, 1.1, "Range-break grace must remain 1.1x");
  assert.strictEqual(INTERNAL.minimumTangentialSpeed, 0.05, "Tangential gate must remain the internal 0.05 threshold");
  assert(Math.abs(tangentialSpeed({ x: 0, y: 0.08 }, { x: 1, y: 0 }) - 0.08) < 1e-9,
    "Tangential speed must measure the velocity component around the anchor");
  assert(!engageEligible(0.049), "Aim below the tangential threshold must not be engage-eligible");
  assert(engageEligible(0.05), "Aim at the tangential threshold must be engage-eligible");
  assert(Math.abs(effectiveCoyoteMs - (50 + (INTERNAL.promptTransportTicks * 1000 / 15))) < 1e-9,
    `Expected coyote plus four transport ticks, got ${effectiveCoyoteMs} ms`);
  assert(coyoteWindowOpen(10 + (effectiveCoyoteMs - 0.001) / 1000, 10, effectiveCoyoteMs),
    "edge within coyote plus two authority ticks must remain eligible");
  assert(!coyoteWindowOpen(10 + (effectiveCoyoteMs + 0.001) / 1000, 10, effectiveCoyoteMs),
    "coyote must reject beyond the effective transport window");
  assert.strictEqual(resolveChainCount({
    nowSeconds: 2.49,
    lastReleaseSeconds: 2,
    lastAnchorKey: "well:a",
    anchorKey: "well:b",
    previousCount: 1,
  }), 2);
  assert.strictEqual(resolveChainCount({
    nowSeconds: 2.51,
    lastReleaseSeconds: 2,
    lastAnchorKey: "well:a",
    anchorKey: "well:b",
    previousCount: 1,
  }), 1);
  assert(INTERNAL.releaseGhostDurationSeconds > 0);
  assert.strictEqual(INTERNAL.lockTelegraphDurationSeconds, 0.25);
  assert.strictEqual(INTERNAL.releaseGhostDurationSeconds, 1.0);
  console.log("SlingshotContract: 10/10 passed");
}

try {
  run();
} catch (error) {
  console.error(error.stack || error.message);
  process.exit(1);
}
