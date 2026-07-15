const UNIT_SCALE = require('../../src/content/units.data.json');

function simUnitsToMeters(value) {
  return Number(value || 0) * UNIT_SCALE.metersPerSimUnit;
}

module.exports = { UNIT_SCALE, simUnitsToMeters };
