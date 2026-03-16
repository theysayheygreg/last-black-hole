/**
 * presets.js — Physics feel variations for A/B testing.
 *
 * Each preset is a partial CONFIG override (deep-merged, not replaced).
 * Keys not listed here (ascii, color, debug, etc.) are left untouched.
 */

export const PRESETS = {
  Default: null, // signals "restore DEFAULTS" — handled by caller

  Ocean: {
    ship:   { thrustAccel: 1500, fluidCoupling: 0.85, turnRate: 240, drag: 0.015, size: 12 },
    wells:  { gravity: 0.002, orbitalStrength: 0.5, shipPullStrength: 150, shipPullFalloff: 1.3 },
    fluid:  { dissipation: 0.998, curl: 0.4, viscosity: 0.00005 },
    events: { growthInterval: 25, waveShipPush: 400 },
  },

  Spacecraft: {
    ship:   { thrustAccel: 4000, fluidCoupling: 0.3, turnRate: 540, drag: 0.05, size: 10 },
    wells:  { gravity: 0.001, orbitalStrength: 0.2, shipPullStrength: 400, shipPullFalloff: 2.0 },
    fluid:  { dissipation: 0.993, curl: 0.2, viscosity: 0.0002 },
    events: { growthInterval: 15, waveShipPush: 200 },
  },

  Surfer: {
    ship:   { thrustAccel: 2000, fluidCoupling: 0.7, turnRate: 360, drag: 0.025, size: 12 },
    wells:  { gravity: 0.0018, orbitalStrength: 0.6, shipPullStrength: 200, shipPullFalloff: 1.5 },
    fluid:  { dissipation: 0.997, curl: 0.35, viscosity: 0.00008 },
    events: { growthInterval: 18, waveShipPush: 350 },
  },
};

export const PRESET_NAMES = Object.keys(PRESETS);

/**
 * Deep-merge source into target — only overwrites leaves that exist in source.
 * Arrays are copied element-by-element; objects recurse; primitives overwrite.
 */
export function deepMerge(target, source) {
  for (const k of Object.keys(source)) {
    if (source[k] !== null && typeof source[k] === 'object' && !Array.isArray(source[k])) {
      if (target[k] && typeof target[k] === 'object') {
        deepMerge(target[k], source[k]);
      }
    } else if (Array.isArray(source[k])) {
      for (let i = 0; i < source[k].length; i++) {
        target[k][i] = source[k][i];
      }
    } else {
      target[k] = source[k];
    }
  }
}
