const assert = require('assert');
const { stepPlayerMovementCore } = require('../scripts/sim/player-movement-step.cjs');
const { resolveAuthorityApproachTarget } = require('../scripts/sim/approach-target.cjs');
const { wrappedDistance } = require('../scripts/sim/world-geometry.cjs');
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

const routed = {
  wx: 0.2, wy: 1, vx: 0, vy: 0, movementFacing: 0,
  deltaV: 100, deltaVMax: 100, deltaVRegen: 3, deltaVRegenBoost: 12,
  deltaVBurnRate: 12, deltaVBurnEff: 1, heat: 0, heatRatio: 0,
  overheatRemaining: 0, timeSinceThrust: 999,
};
const wreck = { id: 'wreck-routed', wx: 1.4, wy: 1, alive: true };
const well = { id: 'well-route', wx: 0.8, wy: 1, killRadius: 0.04, alive: true };
let minimumWellDistance = Infinity;
for (let tick = 0; tick < 420; tick += 1) {
  const dx = wreck.wx - routed.wx;
  const dy = wreck.wy - routed.wy;
  const distance = Math.hypot(dx, dy);
  const approachTarget = resolveAuthorityApproachTarget({
    player: routed,
    targetId: wreck.id,
    wrecks: [wreck],
    wells: [well],
    portals: [],
    worldScale: 3,
    worldDistance: wrappedDistance,
    pickupRadiusForPlayer: () => 0.08,
    portalCaptureRadius: () => 0.08,
    isPortalAvailable: () => false,
  });
  stepPlayerMovementCore(routed, {
    moveX: dx / Math.max(distance, 1e-9),
    moveY: dy / Math.max(distance, 1e-9),
    thrust: 0.55,
    brake: 0,
  }, 1 / 15, {
    brain: { thrustScale: 1, dragScale: 1, currentCoupling: 0 },
    flowSample: { current: { x: 0, y: 0 } },
    externalAcceleration: { x: 0, y: 0 },
    approachTarget,
    worldScale: 3,
  });
  minimumWellDistance = Math.min(minimumWellDistance,
    wrappedDistance(routed.wx, routed.wy, well.wx, well.wy, 3));
  if (wrappedDistance(routed.wx, routed.wy, wreck.wx, wreck.wy, 3) <= 0.08
    && Math.hypot(routed.vx, routed.vy) === 0) break;
}
const routedFinalDistance = wrappedDistance(routed.wx, routed.wy, wreck.wx, wreck.wy, 3);
assert(minimumWellDistance > well.killRadius,
  `shared explicit approach crossed well kill radius: ${minimumWellDistance}`);
assert(routedFinalDistance <= 0.08 && Math.hypot(routed.vx, routed.vy) === 0,
  `shared explicit approach did not settle: distance=${routedFinalDistance} speed=${Math.hypot(routed.vx, routed.vy)}`);
console.log(`MovementApproachSmoke: routed distance=${routedFinalDistance.toFixed(5)} clearance=${minimumWellDistance.toFixed(5)}`);
