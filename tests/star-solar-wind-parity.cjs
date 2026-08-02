const assert = require('assert');
const fs = require('fs');
const path = require('path');
const {
  STAR_GAMEPLAY,
  solarWindMagnitudeForStar,
  solarWindMultiplierForType,
} = require('../scripts/sim/star-solar-wind.cjs');
const {
  beginForceLedger,
  finalizeForceLedger,
  recordForceDeltaV,
} = require('../scripts/sim/force-ledger.cjs');
const { stepPlayerFreeMovement } = require('../scripts/sim/player-movement-step.cjs');

const ROOT = path.resolve(__dirname, '..');

function close(actual, expected, label) {
  assert(Math.abs(actual - expected) < 1e-9, `${label}: expected ${expected}, got ${actual}`);
}

assert.deepStrictEqual(STAR_GAMEPLAY.solarWind, {
  strength: 0.45,
  falloff: 1.8,
  maxRange: 0.6,
});
assert.deepStrictEqual(Object.fromEntries(Object.keys(STAR_GAMEPLAY.types).map((type) => [
  type,
  solarWindMultiplierForType(type),
])), {
  redGiant: 0.6,
  yellowDwarf: 1,
  whiteDwarf: 2,
  neutronStar: 3,
});
assert.strictEqual(solarWindMultiplierForType('unknown'), 1, 'unknown subtype uses deterministic yellow-dwarf fallback');

const baseline = solarWindMagnitudeForStar({ type: 'yellowDwarf', mass: 1 }, 0.25);
for (const [type, multiplier] of Object.entries({ redGiant: 0.6, yellowDwarf: 1, whiteDwarf: 2, neutronStar: 3 })) {
  close(solarWindMagnitudeForStar({ type, mass: 1 }, 0.25), baseline * multiplier, `${type} authority parity`);
}

const player = {
  wx: 1,
  wy: 1,
  vx: 0,
  vy: 0,
  brain: { thrustScale: 1, currentCoupling: 0, dragScale: 1 },
  heat: 0,
  heatRatio: 0,
  overheatRemaining: 0,
};
const step = stepPlayerFreeMovement(player, {}, 0.1, {
  worldScale: 5,
  flowSample: { current: { x: 0, y: 0 } },
  environmentAcceleration: {
    gravity: { x: 0.1, y: 0 },
    solarWind: [{ x: 0.2, y: 0 }],
    bodyPush: [{ x: 0.3, y: 0 }],
    wave: { x: 0.4, y: 0 },
  },
});
close(step.gravityDeltaV.x, 0.04, 'well plus existing body push attribution');
close(step.solarWindDeltaV.x, 0.02, 'solar-wind delta-v');
close(step.waveDeltaV.x, 0.04, 'wave delta-v');

const ledgerPlayer = { vx: 0, vy: 0 };
const ledger = beginForceLedger(ledgerPlayer, 0.1, 1);
ledgerPlayer.vx += step.gravityDeltaV.x;
recordForceDeltaV(ledger, 'gravity', step.gravityDeltaV);
ledgerPlayer.vx += step.solarWindDeltaV.x;
recordForceDeltaV(ledger, 'solarWind', step.solarWindDeltaV);
const receipt = finalizeForceLedger(ledger, ledgerPlayer);
assert(receipt.vectors.solarWind.x > 0, 'solar wind has an independent force-ledger vector');
assert(receipt.vectors.gravity.x > receipt.vectors.solarWind.x, 'planetoid/body push remains in existing gravity attribution');

const runtimeSource = fs.readFileSync(path.join(ROOT, 'scripts/sim-runtime.cjs'), 'utf8');
assert(runtimeSource.includes('solarWind: resolveStarSolarWind'), 'authority routes stars through solarWind');
assert(runtimeSource.includes('recordForceDeltaV(forceLedger, "solarWind"'), 'authority records solarWind separately');
assert(!runtimeSource.includes('STAR_SERVER'), 'duplicated authority star tuning is retired');

console.log('StarSolarWindParity: shared 0.6x/1x/2x/3x authority and ledger PASS');
