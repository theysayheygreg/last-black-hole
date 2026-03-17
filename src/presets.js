/**
 * presets.js — Physics feel variations for A/B testing.
 *
 * All values in world-units. thrustAccel is world-units/s² (no px conversion).
 */

export const PRESETS = {
  Default: null, // signals "restore DEFAULTS" — handled by caller

  Ocean: {
    ship:   { thrustAccel: 2.5, fluidCoupling: 0.85, turnRate: 240, drag: 0.015, size: 12 },
    wells:  { gravity: 0.002, orbitalStrength: 0.5, shipPullStrength: 0.3, shipPullFalloff: 1.3,
              accretionRate: 0.01, accretionRadius: 0.023, accretionSpinRate: 0.6 },
    fluid:  { dissipation: 0.999, curl: 0.4, viscosity: 0.00005,
              ambientTurbulence: 0.0003, ambientDensity: 0.0002 },
    events: { growthInterval: 60, waveShipPush: 1.0 },
  },

  Spacecraft: {
    ship:   { thrustAccel: 4.0, fluidCoupling: 0.3, turnRate: 540, drag: 0.05, size: 10 },
    wells:  { gravity: 0.001, orbitalStrength: 0.2, shipPullStrength: 0.9, shipPullFalloff: 2.0,
              accretionRate: 0.005, accretionRadius: 0.013, accretionSpinRate: 1.2 },
    fluid:  { dissipation: 0.996, curl: 0.2, viscosity: 0.0002,
              ambientTurbulence: 0.0002, ambientDensity: 0.0001 },
    events: { growthInterval: 30, waveShipPush: 0.5 },
  },

  Surfer: {
    ship:   { thrustAccel: 2.0, fluidCoupling: 0.75, turnRate: 360, drag: 0.02, size: 12 },
    wells:  { gravity: 0.0018, orbitalStrength: 0.55, shipPullStrength: 0.45, shipPullFalloff: 1.5,
              accretionRate: 0.008, accretionRadius: 0.02, accretionSpinRate: 0.8 },
    fluid:  { dissipation: 0.999, curl: 0.35, viscosity: 0.00008,
              ambientTurbulence: 0.0004, ambientDensity: 0.0002 },
    events: { growthInterval: 40, waveShipPush: 0.9 },
  },
};

export const PRESET_NAMES = Object.keys(PRESETS);

/**
 * Deep-merge source into target — only overwrites leaves that exist in source.
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
