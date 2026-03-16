/**
 * wells.js — Gravity well force injection + oscillation.
 *
 * Each well has:
 *   - Position (in UV space, 0-1)
 *   - Mass (affects gravity strength and wave amplitude/frequency)
 *   - Oscillation phase (creates wave pulses)
 *
 * Wells inject force into the fluid every step. The oscillating component
 * creates expanding rings of high-velocity fluid — the surfable waves.
 */

import { CONFIG } from './config.js';

export class Well {
  constructor(uvX, uvY, mass = 1.0) {
    this.x = uvX;
    this.y = uvY;
    this.mass = mass;
    this.phase = 0;
  }
}

export class WellSystem {
  constructor() {
    this.wells = [];
  }

  addWell(uvX, uvY, mass = 1.0) {
    const well = new Well(uvX, uvY, mass);
    this.wells.push(well);
    return well;
  }

  /**
   * Apply all well forces to the fluid sim and inject density.
   * Called once per simulation step.
   */
  update(fluid, dt, totalTime) {
    const cfg = CONFIG.wells;

    for (const well of this.wells) {
      // Oscillation: amplitude * sin(frequency * time)
      // Frequency decreases with mass (bigger = slower, more powerful)
      const freq = cfg.waveFrequency / Math.sqrt(well.mass);
      const amp = cfg.waveAmplitude * well.mass;
      const waveAmp = amp * Math.sin(freq * totalTime * Math.PI * 2);

      // Apply gravitational + wave force to velocity field
      fluid.applyWellForce(
        [well.x, well.y],
        cfg.gravity * well.mass,
        cfg.falloff,
        cfg.clampRadius,
        waveAmp,
        dt,
        cfg.terminalInflowSpeed
      );

      // Inject density near the well — creates visible accretion and wave fronts
      // Constant ambient density at well center (accretion glow)
      fluid.splat(
        well.x, well.y,
        0, 0,
        0.002,
        0.15, 0.06, 0.02  // warm amber
      );

      // Pulsed density ring during wave peaks — makes waves visible
      const densityPulse = Math.max(0, waveAmp * 0.15);
      if (densityPulse > 0.01) {
        // Inject at several points in a ring around the well
        const ringRadius = 0.08;
        const numPoints = 8;
        for (let i = 0; i < numPoints; i++) {
          const angle = (i / numPoints) * Math.PI * 2;
          const px = well.x + Math.cos(angle) * ringRadius;
          const py = well.y + Math.sin(angle) * ringRadius;
          fluid.splat(
            px, py,
            0, 0,
            0.003,
            densityPulse * 0.5,       // r
            densityPulse * 0.3,        // g
            densityPulse * 0.15        // b — teal-amber
          );
        }
      }
    }
  }

  /**
   * Get well data for external use (test API, rendering).
   * Returns positions in pixel coords given canvas dimensions.
   */
  getWellData(canvasWidth, canvasHeight) {
    return this.wells.map(w => ({
      x: w.x * canvasWidth,
      y: w.y * canvasHeight,
      uvX: w.x,
      uvY: w.y,
      mass: w.mass,
    }));
  }

  /**
   * Get UV positions for the display shader.
   */
  getUVPositions() {
    return this.wells.map(w => [w.x, w.y]);
  }
}
