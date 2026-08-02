const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { stepPlayerFreeMovement } = require('../scripts/sim/player-movement-step.cjs');
const {
  FORCE_COMPONENTS,
  beginForceLedger,
  finalizeForceLedger,
  recordForceDeltaV,
} = require('../scripts/sim/force-ledger.cjs');

const ROOT = path.resolve(__dirname, '..');
const expectedEnvironmentOrder = ['currentCoupling', 'wellGravity', 'solarWind', 'bodyPush'];
for (const name of expectedEnvironmentOrder) {
  assert(FORCE_COMPONENTS.includes(name), `force ledger must expose ${name}`);
}
assert(!FORCE_COMPONENTS.includes('coupling') && !FORCE_COMPONENTS.includes('gravity'),
  'ambiguous legacy environment labels must be retired');

const player = {
  wx: 1, wy: 1, vx: 0, vy: 0,
  brain: { thrustScale: 1, currentCoupling: 0, dragScale: 1 },
  heat: 0, heatRatio: 0, overheatRemaining: 0,
};
const step = stepPlayerFreeMovement(player, {}, 0.1, {
  worldScale: 5,
  flowSample: { current: { x: 0, y: 0 } },
  environmentAcceleration: {
    wellGravity: { x: 0.1, y: 0 },
    solarWind: { x: 0.2, y: 0 },
    bodyPush: { x: 0.3, y: 0 },
    wave: { x: 0.4, y: 0 },
  },
});

assert.deepStrictEqual(step.currentCouplingDeltaV, { x: 0, y: 0 });
assert(Math.abs(step.wellGravityDeltaV.x - 0.01) < 1e-12);
assert(Math.abs(step.solarWindDeltaV.x - 0.02) < 1e-12);
assert(Math.abs(step.bodyPushDeltaV.x - 0.03) < 1e-12);

const ledgerPlayer = { vx: 0, vy: 0 };
const ledger = beginForceLedger(ledgerPlayer, 0.1, 1);
for (const name of expectedEnvironmentOrder) {
  const delta = step[`${name}DeltaV`];
  ledgerPlayer.vx += delta.x;
  ledgerPlayer.vy += delta.y;
  recordForceDeltaV(ledger, name, delta);
}
const receipt = finalizeForceLedger(ledger, ledgerPlayer);
assert(receipt.vectors.bodyPush.x > receipt.vectors.solarWind.x);
assert(receipt.vectors.wellGravity.x < receipt.vectors.solarWind.x);

const runtime = fs.readFileSync(path.join(ROOT, 'scripts/sim-runtime.cjs'), 'utf8');
assert(runtime.includes('wellGravity: well'));
assert(runtime.includes('bodyPush: resolvePlanetoidPushes'));
assert(!runtime.includes('recordForceDeltaV(forceLedger, "gravity"'));

console.log('HonestEnvironmentChannels: current/well/star/body attribution PASS');
