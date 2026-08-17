const assert = require('assert');
const {
  convergeHeading,
  resolveApproachHazard,
  resolveStoppingEnvelope,
  shapeMovementIntent,
  usefulThrustScale,
} = require('../src/content/movement-affordances.js');
const { normalizeInputMessage } = require('../scripts/sim-protocol.cjs');
const { stepPlayerMovementCore } = require('../scripts/sim/player-movement-step.cjs');

function close(actual, expected, tolerance = 1e-9, label = 'value') {
  assert(Math.abs(actual - expected) <= tolerance, `${label}: expected ${expected}, got ${actual}`);
}

const finalTurn = convergeHeading(0, 0.1, 1 / 15, Math.PI * 2);
close(finalTurn, 0.1, 1e-12, 'fractional final turn');
assert(Math.abs(convergeHeading(0, Math.PI, 1 / 15, Math.PI * 2)) < Math.PI / 2,
  'major turns must advance by one bounded fraction');
assert(usefulThrustScale(0) === 1 && usefulThrustScale(Math.PI) > 0 && usefulThrustScale(Math.PI) < 0.2,
  'useful-thrust gate must be smooth while never silently discarding requested thrust');

const free = shapeMovementIntent({ movementFacing: 0, vx: 0.2, vy: 0 }, { moveX: 1, moveY: 0, thrust: 1 }, 1 / 15);
assert(!free.stopping.active && free.input.brake === 0, 'free flight must remain free without brake or explicit target');
const braking = shapeMovementIntent({ movementFacing: 0, vx: 0.2, vy: 0 }, { moveX: 0, moveY: 1, brake: 1 }, 1 / 15);
assert(braking.stopping.active && braking.input.brakeX === 1 && Math.abs(braking.input.brakeY) < 1e-12,
  'braking must oppose actual motion rather than invent a steering target');
const target = resolveStoppingEnvelope({ vx: 0.4, vy: 0 }, { brake: 0 }, {
  approachTarget: { explicit: true, id: 'portal', kind: 'portal', distance: 0.14, radius: 0.08 },
  brakeAcceleration: 1,
});
assert(target.targetAssist && target.brake > 0, 'explicit approach must enter the shared stopping envelope');

const acheronTarget = {
  explicit: true,
  id: 'wreck-route',
  kind: 'salvage',
  distance: 0.8,
  radius: 0.08,
  hazardDriftMargin: 0.035,
  hazard: { id: 'well-2', distance: 0.0987, clearance: 0.12, awayX: 1, awayY: 0 },
};
const acheronActor = { movementFacing: Math.PI, vx: -0.08, vy: 0 };
const acheronStopping = resolveStoppingEnvelope(acheronActor, { thrust: 0.72, brake: 0 }, {
  approachTarget: acheronTarget,
  brakeAcceleration: 0.0975609756097561,
});
const acheronHazard = resolveApproachHazard(acheronActor, acheronTarget, acheronStopping.stoppingDistance);
close(acheronHazard.dynamicClearance, 0.1528, 1e-9, 'Acheron dynamic clearance');
const acheronEscape = shapeMovementIntent(acheronActor, {
  moveX: -1,
  moveY: 0,
  thrust: 0.72,
  brake: 0,
}, 1 / 15, {
  approachTarget: acheronTarget,
  brakeAcceleration: 0.0975609756097561,
});
assert(acheronHazard.active && acheronHazard.insideDynamicClearance,
  'recorded Acheron approach must activate shared hazard clearance');
assert(acheronEscape.hazard.active && acheronEscape.input.moveX > 0
  && acheronEscape.input.thrust > 0 && acheronEscape.input.brake === 0,
  'inside dynamic clearance, explicit approach must thrust outward without reverse braking');

const rawActions = [
  normalizeInputMessage({ moveX: 0, moveY: 1, thrust: 0.8, brake: 0 }),
  { moveX: 0, moveY: 1, thrust: 0.8, brake: 0 },
  normalizeInputMessage({ moveX: 0, moveY: 1, thrust: 0.8, brake: 0 }),
];
const providers = rawActions.map((intent) => shapeMovementIntent(
  { movementFacing: -0.3, vx: 0.15, vy: 0.02 },
  intent,
  1 / 15,
));
const movementResult = (result) => ({
  heading: result.heading,
  deliveredThrust: result.deliveredThrust,
  thrustGateScale: result.thrustGateScale,
  moveX: result.input.moveX,
  moveY: result.input.moveY,
  brake: result.input.brake,
});
assert.deepStrictEqual(movementResult(providers[0]), movementResult(providers[1]));
assert.deepStrictEqual(movementResult(providers[1]), movementResult(providers[2]));

const residual = {
  wx: 1, wy: 1, vx: 0.001, vy: -0.001, movementFacing: 0,
  deltaV: 100, deltaVMax: 100, deltaVRegen: 3, deltaVRegenBoost: 12,
  deltaVBurnRate: 12, deltaVBurnEff: 1, heat: 0, heatRatio: 0,
  overheatRemaining: 0, timeSinceThrust: 999,
};
const residualStep = stepPlayerMovementCore(residual, { moveX: 1, moveY: 0, brake: 1 }, 1 / 15, {
  brain: { thrustScale: 1, dragScale: 1, currentCoupling: 0 },
  inputConfig: { fluidCoupling: 0, brakeThrustScale: 0, brakeHeatScale: 0, coastHalfLifeSeconds: 0.764, maxSpeedWorld: 8 },
  worldScale: 3,
});
assert(residualStep.residualResolved && residual.vx === 0 && residual.vy === 0,
  'negligible braking velocity must resolve after force and drag processing');

console.log('MovementAffordances: ok');
