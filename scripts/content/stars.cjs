// Authority view of the canonical star gameplay defaults.
const STAR_GAMEPLAY = require('../../src/content/stars.data.json');

function solarWindMultiplierForType(type) {
  return STAR_GAMEPLAY.types[type]?.solarWindMultiplier
    ?? STAR_GAMEPLAY.types.yellowDwarf.solarWindMultiplier;
}

module.exports = { STAR_GAMEPLAY, solarWindMultiplierForType };
