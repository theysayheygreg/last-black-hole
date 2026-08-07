const assert = require('assert');
const { stepPlayerMovementCore } = require('../scripts/sim/player-movement-step.cjs');
const { shortestHeadingDelta } = require('../src/content/movement-affordances.js');

const actor = {
  wx: 1, wy: 1, vx: 0, vy: 0, movementFacing: Math.PI,
  deltaV: 100, deltaVMax: 100, deltaVRegen: 3, deltaVRegenBoost: 12,
  deltaVBurnRate: 12, deltaVBurnEff: 1, heat: 0, heatRatio: 0,
  overheatRemaining: 0, timeSinceThrust: 999,
};
const target = { id: 'portal-smoke', kind: 'portal', wx: 1.55, wy: 1, radius: 0.08 };
let brakeTransitions = 0;
let braking = false;
let maxHeadingStep = 0;
let previousHeading = actor.movementFacing;

for (let tick = 0; tick < 180; tick += 1) {
  const dx = target.wx - actor.wx;
  const dy = target.wy - actor.wy;
  const distance = Math.hypot(dx, dy);
  const step = stepPlayerMovementCore(actor, {
    moveX: dx / Math.max(distance, 1e-9),
    moveY: dy / Math.max(distance, 1e-9),
    thrust: distance > target.radius ? 0.55 : 0,
    brake: 0,
  }, 1 / 15, {
    brain: { thrustScale: 1, dragScale: 1, currentCoupling: 0 },
    flowSample: { current: { x: 0, y: 0 } },
    externalAcceleration: { x: 0, y: 0 },
    approachTarget: { explicit: true, id: target.id, kind: target.kind, distance, radius: target.radius },
    worldScale: 3,
  });
  if (step.affordance.stopping.targetAssist !== braking) {
    if (step.affordance.stopping.targetAssist) brakeTransitions += 1;
    braking = step.affordance.stopping.targetAssist;
  }
  maxHeadingStep = Math.max(maxHeadingStep, Math.abs(shortestHeadingDelta(previousHeading, actor.movementFacing)));
  previousHeading = actor.movementFacing;
  if (distance <= target.radius && Math.hypot(actor.vx, actor.vy) === 0) break;
}

const finalDistance = Math.hypot(target.wx - actor.wx, target.wy - actor.wy);
assert(finalDistance <= target.radius, `approach must settle inside interaction radius, got ${finalDistance}`);
assert(Math.hypot(actor.vx, actor.vy) === 0, 'approach must resolve residual drift');
assert.strictEqual(brakeTransitions, 1, `approach should brake once, got ${brakeTransitions}`);
assert(maxHeadingStep <= Math.PI * 2 / 15 + 1e-9, 'turning must respect the shared fractional convergence rate');
console.log(`MovementApproachSmoke: ok distance=${finalDistance.toFixed(5)} brakeTransitions=${brakeTransitions}`);
