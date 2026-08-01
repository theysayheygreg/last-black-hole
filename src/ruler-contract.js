import {
  TunableDrawRegistry,
} from './units.js';
import { GRAPPLE_ARC } from './content/grapple-arc.js';

export const SLINGSHOT_KNOB_SCHEMA = Object.freeze([
  Object.freeze({ name: 'radii', unit: 'm', range: null, value: null, step: null, startBias: 'live-anchor-scale' }),
  Object.freeze({ name: 'reel', unit: 'ms', range: Object.freeze([50, 300]), value: GRAPPLE_ARC.reelSeconds * 1000, step: 50, startBias: 'short' }),
  Object.freeze({ name: 'flatBoost', unit: 'sim units/s', range: null, value: null, step: null, startBias: 'live-anchor-scale' }),
  Object.freeze({ name: 'releaseAssist', unit: 'deg', range: Object.freeze([0, 30]), value: GRAPPLE_ARC.releaseAssistDegrees, step: 5, startBias: 'small' }),
]);

export const S4_RULER_CONTRACTS = Object.freeze(SLINGSHOT_KNOB_SCHEMA.map((knob) => Object.freeze({
  id: `slingshot.${knob.name}`,
  system: 'slingshot',
  kind: knob.name === 'radii' ? 'spatial'
    : knob.name === 'reel' ? 'temporal' : knob.name === 'flatBoost' ? 'vectorPair' : 'angular',
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
