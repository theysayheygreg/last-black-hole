const data = require('../../src/content/units.data.json');
const RATIFICATION = Object.freeze({ ...data.ratification });
const LOCKED_INPUTS = Object.freeze({ ...data.inputs });

const UNITS_DATA = Object.freeze({
  schemaVersion: data.schemaVersion,
  catalogId: data.catalogId,
  ratification: RATIFICATION,
  inputs: LOCKED_INPUTS,
});

const UNIT_SCALE = Object.freeze({
  ...LOCKED_INPUTS,
  drifterHullLengthSimUnits: LOCKED_INPUTS.drifterHullLengthMeters / LOCKED_INPUTS.metersPerSimUnit,
  scaleBarMeters: LOCKED_INPUTS.rulerPresentationDefaultMeters,
  status: RATIFICATION.status,
  source: RATIFICATION.source,
});

function simUnitsToMeters(value) {
  return Number(value || 0) * UNIT_SCALE.metersPerSimUnit;
}

function metersToSimUnits(value) {
  return Number(value || 0) / UNIT_SCALE.metersPerSimUnit;
}

module.exports = { UNITS_DATA, UNIT_SCALE, simUnitsToMeters, metersToSimUnits };
