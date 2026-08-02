const { STAR_GAMEPLAY, solarWindMultiplierForType } = require('../content/stars.cjs');
const { wellGravityMagnitude } = require('./well-gravity.cjs');

function solarWindMagnitudeForStar(star, distance) {
  return wellGravityMagnitude('player', distance, (star?.mass || 1) * solarWindMultiplierForType(star?.type), {
    strength: STAR_GAMEPLAY.solarWind.strength,
    falloff: STAR_GAMEPLAY.solarWind.falloff,
    maxRange: STAR_GAMEPLAY.solarWind.maxRange,
    zeroDistanceThreshold: 0.001,
  });
}

module.exports = {
  STAR_GAMEPLAY,
  solarWindMagnitudeForStar,
  solarWindMultiplierForType,
};
