import data from './stars.data.json' with { type: 'json' };

export const STAR_GAMEPLAY = data;

export function solarWindMultiplierForType(type) {
  return STAR_GAMEPLAY.types[type]?.solarWindMultiplier
    ?? STAR_GAMEPLAY.types.yellowDwarf.solarWindMultiplier;
}
