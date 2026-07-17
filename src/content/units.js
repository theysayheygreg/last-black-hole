import data from './units.data.json' with { type: 'json' };

const RATIFICATION = Object.freeze({ ...data.ratification });
const LOCKED_INPUTS = Object.freeze({ ...data.inputs });

export const UNITS_DATA = Object.freeze({
  schemaVersion: data.schemaVersion,
  catalogId: data.catalogId,
  ratification: RATIFICATION,
  inputs: LOCKED_INPUTS,
});

export const UNIT_SCALE = Object.freeze({
  ...LOCKED_INPUTS,
  drifterHullLengthSimUnits: LOCKED_INPUTS.drifterHullLengthMeters / LOCKED_INPUTS.metersPerSimUnit,
  scaleBarMeters: LOCKED_INPUTS.rulerPresentationDefaultMeters,
  status: RATIFICATION.status,
  source: RATIFICATION.source,
});
