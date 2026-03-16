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
import { wellToFluidUV, wellToScreen } from './coords.js';

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
  update(fluid, dt, totalTime) {
    const cfg = CONFIG.wells;

    for (const well of this.wells) {
      // Convert well-space (Y-down) to fluid UV (Y-up) for GPU operations
      const [fu, fv] = wellToFluidUV(well.x, well.y);

      // Apply gravitational + orbital force to velocity field
      fluid.applyWellForce(
        [fu, fv],
        cfg.gravity * well.mass,
        cfg.falloff,
        cfg.clampRadius,
        cfg.orbitalStrength * well.orbitalDir,
        dt,
        cfg.terminalInflowSpeed
      );

      // === SPINNING ACCRETION DISK ===
      // Inject density at rotating points around the well to create
      // visible spiral arms that get swept by the orbital flow.
      // The injection rotates, the fluid carries it into spiral patterns.
      const spinAngle = totalTime * cfg.accretionSpinRate * well.orbitalDir;
      const ringR = cfg.accretionRadius * well.mass;
      const numPts = cfg.accretionPoints;
      const rate = cfg.accretionRate * well.mass;

      for (let i = 0; i < numPts; i++) {
        const angle = spinAngle + (i / numPts) * Math.PI * 2;
        const px = fu + Math.cos(angle) * ringR;
        const py = fv + Math.sin(angle) * ringR;

        // Inject density with slight tangential velocity to feed the orbital flow
        const tangVx = -Math.sin(angle) * 0.0005 * well.orbitalDir;
        const tangVy = Math.cos(angle) * 0.0005 * well.orbitalDir;

        fluid.splat(
          px, py,
          tangVx, tangVy,
          0.004,
          rate * 0.8,   // r — warm
          rate * 0.35,   // g
          rate * 0.1     // b — amber/orange accretion glow
        );
      }

      // Inner core glow — constant, dim, marks the center
      fluid.splat(
        fu, fv,
        0, 0,
        0.001,
        rate * 0.3, rate * 0.1, rate * 0.03
      );
    }
  }

  /**
   * Get well data for external use (test API, rendering).
   * Returns positions in pixel coords given canvas dimensions.
   */
  getWellData(canvasWidth, canvasHeight) {
    return this.wells.map(w => {
      const [sx, sy] = wellToScreen(w.x, w.y, canvasWidth, canvasHeight);
      return {
        x: sx,
        y: sy,
        uvX: w.x,
        uvY: w.y,
        mass: w.mass,
      };
    });
  }

  /**
   * Get UV positions for the display shader.
   */
  /**
   * Get fluid UV positions for the display shader.
   * Converts from well-space (Y-down) to fluid UV (Y-up).
   */
  getUVPositions() {
    return this.wells.map(w => wellToFluidUV(w.x, w.y));
  }
}
