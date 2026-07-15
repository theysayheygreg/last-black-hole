import { TunableDrawRegistry } from './units.js';

export const SLINGSHOT_KNOB_SCHEMA = Object.freeze([
  Object.freeze({ name: 'captureRadius', unit: 'm', range: Object.freeze([100, 1000]), value: 450, step: 25, startBias: 'medium' }),
  Object.freeze({ name: 'magnetism', unit: 'deg', range: Object.freeze([0, 90]), value: 30, step: 5, startBias: 'large' }),
  Object.freeze({ name: 'coyoteTime', unit: 'ms', range: Object.freeze([0, 500]), value: 50, step: 50, startBias: 'small' }),
  Object.freeze({ name: 'payoffCurve', unit: 'x/quarter-turn', range: Object.freeze([1, 3]), value: 1.4, step: 0.1, startBias: 'medium' }),
  Object.freeze({ name: 'chainWindow', unit: 's', range: Object.freeze([0, 3]), value: 0.5, step: 0.5, startBias: 'disabled-or-small' }),
]);

export const S4_RULER_CONTRACTS = Object.freeze(SLINGSHOT_KNOB_SCHEMA.map((knob) => Object.freeze({
  id: `slingshot.${knob.name}`,
  system: 'slingshot',
  kind: knob.name === 'captureRadius' ? 'spatial'
    : (knob.name === 'coyoteTime' || knob.name === 'chainWindow' ? 'temporal' : 'vectorPair'),
  unit: knob.unit,
  range: knob.range,
  value: knob.value,
  step: knob.step,
  startBias: knob.startBias,
  resolved: true,
})));

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
