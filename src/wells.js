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
  /**
   * @param {number} uvX - well-space X (0-1, screen-normalized)
   * @param {number} uvY - well-space Y (0-1, screen-normalized)
   * @param {Object} opts - per-instance parameters
   */
  constructor(uvX, uvY, opts = {}) {
    this.x = uvX;
    this.y = uvY;
    this.mass = opts.mass ?? 1.0;
    this.orbitalDir = opts.orbitalDir ?? 1;       // +1 = CCW, -1 = CW
    this.accretionRate = opts.accretionRate ?? null;     // null = use CONFIG default
    this.accretionRadius = opts.accretionRadius ?? null;
    this.accretionSpinRate = opts.accretionSpinRate ?? null;
    this.accretionPoints = opts.accretionPoints ?? null;
    this.killRadius = opts.killRadius ?? 20;       // pixel-space death radius
  }

  // Read a per-instance value, falling back to CONFIG default
  getAccretionRate() { return this.accretionRate ?? CONFIG.wells.accretionRate; }
  getAccretionRadius() { return this.accretionRadius ?? CONFIG.wells.accretionRadius; }
  getAccretionSpinRate() { return this.accretionSpinRate ?? CONFIG.wells.accretionSpinRate; }
  getAccretionPoints() { return this.accretionPoints ?? CONFIG.wells.accretionPoints; }
}

export class WellSystem {
  constructor() {
    this.wells = [];
  }

  addWell(uvX, uvY, opts = {}) {
    const well = new Well(uvX, uvY, opts);
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
      // Per-instance parameters with CONFIG fallback
      const spinAngle = totalTime * well.getAccretionSpinRate() * well.orbitalDir;
      const ringR = well.getAccretionRadius() * well.mass;
      const numPts = well.getAccretionPoints();
      const rate = well.getAccretionRate() * well.mass;

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
  /**
   * Check if the ship is inside any well's kill radius.
   * Returns the killing well or null.
   */
  checkDeath(shipX, shipY, canvasWidth, canvasHeight) {
    for (const well of this.wells) {
      const [sx, sy] = wellToScreen(well.x, well.y, canvasWidth, canvasHeight);
      const dx = shipX - sx;
      const dy = shipY - sy;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist < well.killRadius) return well;
    }
    return null;
  }

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
