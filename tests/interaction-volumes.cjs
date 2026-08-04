"use strict";

const fs = require("fs");
const path = require("path");
const { TestRunner, assert } = require("./helpers.cjs");
const {
  INTERACTION_VOLUME_CONFIG,
  effectiveInteractionRadius,
  interactionTargetRadius,
  isWithinInteractionRadius,
  playerBodyRadius,
} = require("../scripts/sim/interaction-volumes.cjs");
const { sweptMovingCircleVsCircle, wrappedDelta } = require("../scripts/sim/world-geometry.cjs");

function near(actual, expected, label, epsilon = 1e-9) {
  assert(Math.abs(actual - expected) <= epsilon, `${label}: expected ${expected}, got ${actual}`);
}

async function run() {
  const runner = new TestRunner("InteractionVolumes");

  await runner.run("pickup and aperture volumes include the ship body plus one bounded grace", () => {
    const player = { radius: INTERACTION_VOLUME_CONFIG.playerBodyRadius };
    const pickupRadius = effectiveInteractionRadius(player, {
      semanticRadius: 0.08,
    });
    const apertureRadius = effectiveInteractionRadius(player, { semanticRadius: 0.08 });
    near(pickupRadius, 0.127, "pickup radius");
    near(apertureRadius, 0.127, "aperture radius");
    assert(isWithinInteractionRadius(pickupRadius, player, {
      semanticRadius: 0.08,
    }), "The edge of a pickup volume must still count");
    assert(!isWithinInteractionRadius(pickupRadius + 0.0001, player, {
      semanticRadius: 0.08,
    }), "The grace must remain bounded");
    assert(interactionTargetRadius({ semanticRadius: 0.08 }) > 0.08,
      "Interaction targets must carry the explicit near-miss allowance");
  });

  await runner.run("the same body-aware radius catches high-speed seam crossings", () => {
    const player = { radius: INTERACTION_VOLUME_CONFIG.playerBodyRadius };
    const targetRadius = interactionTargetRadius({ semanticRadius: 0.08 });
    const hit = sweptMovingCircleVsCircle({
      startX: 4.84,
      startY: 2.5,
      deltaX: 0.38,
      deltaY: 0,
      movingRadius: playerBodyRadius(player),
      targetX: 0.06,
      targetY: 2.5,
      targetRadius,
      worldScale: 5,
    });
    assert(hit.hit && !hit.startedOverlapping, "A seam crossing must enter the same aperture used at the endpoint");
    assert(hit.t > 0 && hit.t < 1, "The crossing must happen during the movement segment");
  });

  await runner.run("scavenger death spirals take their start angle from wrapped authority direction", () => {
    const worldScale = 5;
    const well = { wx: 0.02, wy: 2.5 };
    const scavenger = { wx: 4.99, wy: 2.5 };
    const towardWellX = wrappedDelta(scavenger.wx, well.wx, worldScale);
    const deathAngle = Math.atan2(0, -towardWellX);
    near(deathAngle, Math.PI, "seam-correct outward death angle");

    const runtimeSource = fs.readFileSync(path.join(__dirname, "..", "scripts/sim-runtime.cjs"), "utf8");
    const gravityStart = runtimeSource.indexOf("function applyWellGravityToEntity");
    const gravityEnd = runtimeSource.indexOf("function spawnScavengerDeathDrops", gravityStart);
    const authoritySeam = runtimeSource.slice(gravityStart, gravityEnd);
    assert(authoritySeam.includes("Math.atan2(-direction.dy, -direction.dx)"),
      "Scavenger authority must derive deathAngle from seam-correct worldDirection");
    assert(!authoritySeam.includes("Math.atan2(entity.wy - well.wy, entity.wx - well.wx)"),
      "Scavenger authority must not use raw unwrapped death-angle coordinates");
  });

  process.exit(runner.summary() ? 0 : 1);
}

run().catch((error) => {
  console.error(error.stack || error.message);
  process.exit(1);
});
