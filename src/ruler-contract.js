import { TunableDrawRegistry } from './units.js';

export const S4_RULER_CONTRACTS = Object.freeze([
  Object.freeze({ id: 'slingshot.captureRadius', system: 'slingshot', kind: 'spatial', unit: 'm', range: null, step: 25, startBias: 'medium', resolved: false }),
  Object.freeze({ id: 'slingshot.magnetism', system: 'slingshot', kind: 'vectorPair', unit: 'deg', range: null, step: 5, startBias: 'large', resolved: false }),
  Object.freeze({ id: 'slingshot.coyoteTime', system: 'slingshot', kind: 'temporal', unit: 'ms', range: null, step: 50, startBias: 'small', resolved: false }),
  Object.freeze({ id: 'slingshot.payoffCurve', system: 'slingshot', kind: 'vectorPair', unit: 'x/quarter-turn', range: null, step: 0.1, startBias: 'medium', resolved: false }),
  Object.freeze({ id: 'slingshot.chainWindow', system: 'slingshot', kind: 'temporal', unit: 's', range: null, step: 0.5, startBias: 'disabled-or-small', resolved: false }),
]);

export const FORCE_LEDGER_CLASSES = Object.freeze([
  'thrust',
  'coupling',
  'gravity',
  'wave',
  'impulse',
  'drag',
]);

export const S5_RULER_CONTRACTS = Object.freeze(FORCE_LEDGER_CLASSES.map((name) => Object.freeze({
  id: `force.${name}`,
  system: 'movement',
  kind: 'vector',
  unit: 'm/s^2',
  range: null,
  step: null,
  startBias: 'live-authority-fact',
  resolved: true,
})));

export const RULER_CONTRACTS = Object.freeze([...S4_RULER_CONTRACTS, ...S5_RULER_CONTRACTS]);
export const REQUIRED_RULER_HANDLER_IDS = Object.freeze(RULER_CONTRACTS.map((contract) => contract.id));

export function createRulerRegistry(handlers) {
  const registry = new TunableDrawRegistry();
  for (const contract of RULER_CONTRACTS) {
    const draw = handlers?.[contract.id];
    if (typeof draw !== 'function') {
      throw new Error(`Missing ruler draw handler: ${contract.id}`);
    }
    registry.register(contract, draw);
  }
  registry.assertCoverage(REQUIRED_RULER_HANDLER_IDS);
  return registry;
}
