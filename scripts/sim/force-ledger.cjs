const { UNIT_SCALE } = require('../content/units.cjs');

const FORCE_COMPONENTS = Object.freeze([
  'inhibitor',
  'ability',
  'thrust',
  'coupling',
  'gravity',
  'solarWind',
  'wave',
  'impulse',
  'drag',
]);

function finite(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

function velocity(entity) {
  return { x: finite(entity?.vx), y: finite(entity?.vy) };
}

function beginForceLedger(player, dt, tick) {
  return {
    tick: Math.max(0, Math.floor(finite(tick))),
    dt: Math.max(1e-6, finite(dt)),
    start: velocity(player),
    deltaV: Object.fromEntries(FORCE_COMPONENTS.map((name) => [name, { x: 0, y: 0 }])),
  };
}

function setForceLedgerDt(ledger, dt) {
  if (ledger) ledger.dt = Math.max(1e-6, finite(dt));
}

function recordForceDeltaV(ledger, component, delta = {}) {
  if (!ledger?.deltaV?.[component]) throw new Error(`Unknown force ledger component: ${component}`);
  ledger.deltaV[component].x += finite(delta.x);
  ledger.deltaV[component].y += finite(delta.y);
}

function recordForceMutation(ledger, component, player, mutate) {
  const before = velocity(player);
  const result = mutate();
  const after = velocity(player);
  recordForceDeltaV(ledger, component, { x: after.x - before.x, y: after.y - before.y });
  return result;
}

function finalizeForceLedger(ledger, player) {
  const after = velocity(player);
  const totalDeltaV = {
    x: after.x - ledger.start.x,
    y: after.y - ledger.start.y,
  };
  const accounted = FORCE_COMPONENTS.reduce((sum, name) => ({
    x: sum.x + ledger.deltaV[name].x,
    y: sum.y + ledger.deltaV[name].y,
  }), { x: 0, y: 0 });

  // Any velocity mutation outside the named continuous paths is an impulse.
  // This keeps the decomposition exact for contacts, abilities, clamps, and
  // cross-player effects without letting diagnostics own gameplay order.
  recordForceDeltaV(ledger, 'impulse', {
    x: totalDeltaV.x - accounted.x,
    y: totalDeltaV.y - accounted.y,
  });

  const accelerationScale = UNIT_SCALE.metersPerSimUnit / ledger.dt;
  const vectors = Object.fromEntries(FORCE_COMPONENTS.map((name) => [name, {
    x: ledger.deltaV[name].x * accelerationScale,
    y: ledger.deltaV[name].y * accelerationScale,
  }]));
  const total = {
    x: totalDeltaV.x * accelerationScale,
    y: totalDeltaV.y * accelerationScale,
  };
  return {
    tick: ledger.tick,
    dt: ledger.dt,
    unit: 'm/s^2',
    vectors,
    total,
    deltaV_mps: {
      x: totalDeltaV.x * UNIT_SCALE.metersPerSimUnit,
      y: totalDeltaV.y * UNIT_SCALE.metersPerSimUnit,
    },
  };
}

module.exports = {
  FORCE_COMPONENTS,
  beginForceLedger,
  finalizeForceLedger,
  recordForceDeltaV,
  recordForceMutation,
  setForceLedgerDt,
};
