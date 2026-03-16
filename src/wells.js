/**
 * wells.js — Gravity well force injection with orbital currents.
 *
 * V2: Wells inject CONSTANT radial pull + tangential force for orbital flow.
 * No oscillation. Waves come from the event system (wave-rings.js).
 *
 * Each well has:
 *   - Position (in UV space, 0-1)
 *   - Mass (affects gravity strength)
 *   - Orbital direction (+1 = CCW, -1 = CW)
 */

import { CONFIG } from './config.js';

export class Well {
  constructor(uvX, uvY, mass = 1.0) {
    this.x = uvX;
    this.y = uvY;
    this.mass = mass;
    this.orbitalDir = 1; // +1 = counterclockwise, -1 = clockwise
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
   * V2: constant radial pull + tangential orbital force. No oscillation.
   */
  update(fluid, dt) {
    const cfg = CONFIG.wells;

    for (const well of this.wells) {
      // Apply gravitational + orbital force to velocity field
      // Well positions are in UV space — same as the fluid sim
      fluid.applyWellForce(
        [well.x, well.y],
        cfg.gravity * well.mass,
        cfg.falloff,
        cfg.clampRadius,
        cfg.orbitalStrength * well.orbitalDir,
        dt,
        cfg.terminalInflowSpeed
      );

      // Inject density near the well — creates visible accretion glow
      fluid.splat(
        well.x, well.y,
        0, 0,
        0.002,
        0.15, 0.06, 0.02  // warm amber
      );
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
