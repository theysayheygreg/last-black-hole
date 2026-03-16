/**
 * presets.js — Physics feel variations for A/B testing.
 *
 * Each preset is a partial CONFIG override (deep-merged, not replaced).
 * Keys not listed here (ascii, color, debug, etc.) are left untouched.
 */

export const PRESETS = {
  Default: null, // signals "restore DEFAULTS" — handled by caller

  Ocean: {
    ship:   { thrustAccel: 1200, fluidCoupling: 0.85, turnRate: 240, drag: 0.015, size: 12 },
    wells:  { gravity: 0.002, orbitalStrength: 0.5, shipPullStrength: 120, shipPullFalloff: 1.3,
              accretionRate: 0.01, accretionRadius: 0.07, accretionSpinRate: 0.6 },
    fluid:  { dissipation: 0.999, curl: 0.4, viscosity: 0.00005,
              ambientTurbulence: 0.0003, ambientDensity: 0.0002 },
    events: { growthInterval: 25, waveShipPush: 400 },
  },

  Spacecraft: {
    ship:   { thrustAccel: 4000, fluidCoupling: 0.3, turnRate: 540, drag: 0.05, size: 10 },
    wells:  { gravity: 0.001, orbitalStrength: 0.2, shipPullStrength: 350, shipPullFalloff: 2.0,
              accretionRate: 0.005, accretionRadius: 0.04, accretionSpinRate: 1.2 },
    fluid:  { dissipation: 0.996, curl: 0.2, viscosity: 0.0002,
              ambientTurbulence: 0.0002, ambientDensity: 0.0001 },
    events: { growthInterval: 15, waveShipPush: 200 },
  },

  Surfer: {
    ship:   { thrustAccel: 1800, fluidCoupling: 0.75, turnRate: 360, drag: 0.02, size: 12 },
    wells:  { gravity: 0.0018, orbitalStrength: 0.55, shipPullStrength: 175, shipPullFalloff: 1.5,
              accretionRate: 0.008, accretionRadius: 0.06, accretionSpinRate: 0.8 },
    fluid:  { dissipation: 0.999, curl: 0.35, viscosity: 0.00008,
              ambientTurbulence: 0.0004, ambientDensity: 0.0002 },
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
