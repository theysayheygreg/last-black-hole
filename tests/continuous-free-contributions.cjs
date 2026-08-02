const assert = require('assert');
const fs = require('fs');
const path = require('path');

const {
  resolveGlitchInfluence,
  resolveVesselInfluence,
} = require('../scripts/sim/inhibitor-ecology.cjs');
const { FORCE_COMPONENTS } = require('../scripts/sim/force-ledger.cjs');
const { stepPlayerFreeMovement } = require('../scripts/sim/player-movement-step.cjs');

const ROOT = path.resolve(__dirname, '..');

function player(overrides = {}) {
  return {
    clientId: 'pilot',
    status: 'alive',
    wx: 1.1,
    wy: 1,
    vx: 0,
    vy: 0,
    hullDamage: 0,
    brain: { thrustScale: 1, currentCoupling: 0, dragScale: 1 },
    deltaV: 100,
    deltaVMax: 100,
    deltaVBurnRate: 12,
    deltaVBurnEff: 1,
    deltaVRegen: 1.5,
    deltaVRegenBoost: 6,
    timeSinceThrust: 0,
    ...overrides,
  };
}

{
  const pilot = player();
  const glitch = {
    id: 'glitch-a',
    lifecycle: 'alive',
    wx: 1,
    wy: 1,
    fabricForceRadius: 0.2,
    fabricForceStrength: 0.02,
    coreRadius: 0.01,
    coreDamage: 0.25,
    maxDamage: 1,
    contactCooldownSeconds: 1,
    contactCooldowns: {},
  };
  const influence = resolveGlitchInfluence([glitch], [pilot], { dt: 0.1, worldScale: 5, tick: 1 });
  assert.deepStrictEqual({ vx: pilot.vx, vy: pilot.vy }, { vx: 0, vy: 0 },
    'Glitch ecology must not mutate player velocity');
  assert.strictEqual(influence.continuous.length, 1);
  assert(influence.continuous[0].x > 0, 'Glitch fabric acceleration must retain direction');
}

{
  const pilot = player({ wx: 1, wy: 1 });
  const vessel = {
    id: 'vessel-a',
    kind: 'vessel',
    lifecycle: 'alive',
    wx: 1.1,
    wy: 1,
    gravityRange: 0.3,
    gravityStrength: 0.16,
    outerDamageRadius: 0.01,
    coreRadius: 0.005,
    outerDamage: 0.35,
    contactCooldownSeconds: 1,
    contactCooldowns: {},
  };
  const influence = resolveVesselInfluence([vessel], [pilot], { dt: 0.1, worldScale: 5, tick: 1 });
  assert.deepStrictEqual({ vx: pilot.vx, vy: pilot.vy }, { vx: 0, vy: 0 },
    'Vessel ecology must not mutate player velocity');
  assert.strictEqual(influence.continuous.length, 1);
  assert(influence.continuous[0].x > 0, 'Vessel gravity acceleration must retain direction');
}

{
  const pilot = player();
  let velocitySeenByAbility = null;
  const step = stepPlayerFreeMovement(pilot, { moveX: 0, moveY: 0, thrust: 0, brake: 0 }, 0.1, {
    worldScale: 5,
    flowSample: { current: { x: 0, y: 0 } },
    continuousAcceleration: { inhibitor: [{ x: 0.2, y: 0 }] },
    resolveAbilityAcceleration: (movingPlayer) => {
      velocitySeenByAbility = movingPlayer.vx;
      return { x: 0.3, y: 0 };
    },
    environmentAcceleration: { wellGravity: { x: 0.4, y: 0 }, wave: { x: 0.5, y: 0 } },
  });
  assert(Math.abs(velocitySeenByAbility - 0.02) < 1e-12,
    'ability state must observe the already-applied inhibitor contribution');
  assert(Math.abs(step.inhibitorDeltaV.x - 0.02) < 1e-12);
  assert(Math.abs(step.abilityDeltaV.x - 0.03) < 1e-12);
  assert(Math.abs(step.wellGravityDeltaV.x - 0.04) < 1e-12);
}

assert(FORCE_COMPONENTS.includes('ability') && FORCE_COMPONENTS.includes('inhibitor'),
  'force ledger must name retained continuous ability and Inhibitor forces');

const runtime = fs.readFileSync(path.join(ROOT, 'scripts/sim-runtime.cjs'), 'utf8');
const playerTick = runtime.slice(
  runtime.indexOf('function tickAuthorityPlayers'),
  runtime.indexOf('\nfunction tickSim', runtime.indexOf('function tickAuthorityPlayers')),
);
const hullTick = runtime.slice(
  runtime.indexOf('function tickHullAbilities'),
  runtime.indexOf('\nfunction getBurnModifiers', runtime.indexOf('function tickHullAbilities')),
);
const grappleBranch = playerTick.slice(
  playerTick.indexOf('if (grappleOwnsMovement)'),
  playerTick.indexOf('// FREE movement advances'),
);
assert.strictEqual((playerTick.match(/estimateFlowSample\(/g) || []).length, 1,
  'player tick must cache exactly one authority field sample');
assert(!hullTick.includes('estimateFlow(player.wx, player.wy)'),
  'Flow Lock must consume the cached player sample');
assert(!hullTick.includes('player.vx += (flow.x / flowMag)')
  && !hullTick.includes('player.vy += (flow.y / flowMag)'),
  'Flow Lock must return acceleration instead of mutating velocity');
assert(!grappleBranch.includes('stepPlayerFreeMovement(')
  && !grappleBranch.includes('inhibitorAcceleration'),
  'GRAPPLED must exclude FREE continuous contributions');

const ecology = fs.readFileSync(path.join(ROOT, 'scripts/sim/inhibitor-ecology.cjs'), 'utf8');
assert(!ecology.includes('player.vx +=') && !ecology.includes('player.vy +='),
  'Inhibitor ecology must return continuous acceleration without mutating players');

console.log('ContinuousFreeContributions: one sample, named ordering, and grapple exclusion PASS');
