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
    this.color = opts.color ?? [1.0, 0.6, 0.15];  // per-well color identity (RGB, 0-1)
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

      // === SPINNING ACCRETION DISK — VISUALLY LOUD ===
      const spinAngle = totalTime * well.getAccretionSpinRate() * well.orbitalDir;
      const numPts = well.getAccretionPoints();
      const rate = well.getAccretionRate() * well.mass;

      // Multi-ring injection tinted by per-well color identity
      // Inner rings are hotter (whiter), outer rings are more saturated in well color
      const wc = well.color;
      const rings = [
        { radiusMult: 0.5, brightness: 8.0, r: 0.6+wc[0]*0.4, g: 0.5+wc[1]*0.4, b: 0.3+wc[2]*0.4, splatR: 0.005 },  // inner — hot, slightly white-shifted
        { radiusMult: 0.8, brightness: 4.0, r: wc[0], g: wc[1]*0.7, b: wc[2]*0.4, splatR: 0.007 },  // mid — saturated well color
        { radiusMult: 1.2, brightness: 2.0, r: wc[0]*0.7, g: wc[1]*0.4, b: wc[2]*0.2, splatR: 0.009 },  // outer — dimmer, more saturated
        { radiusMult: 1.6, brightness: 0.8, r: wc[0]*0.4, g: wc[1]*0.2, b: wc[2]*0.1, splatR: 0.012 },  // far outer — faint halo
      ];

      for (const ring of rings) {
        const ringR = well.getAccretionRadius() * well.mass * ring.radiusMult;

        for (let i = 0; i < numPts; i++) {
          // Gap pattern: skip every other point for spiral arm effect
          // Use sine modulation so arms have bright cores and dim edges
          const armPhase = (i / numPts) * Math.PI * 2;
          const armBrightness = 0.3 + 0.7 * Math.pow(Math.max(0, Math.cos(armPhase * numPts * 0.5)), 2);

          const angle = spinAngle + armPhase;
          const px = fu + Math.cos(angle) * ringR;
          const py = fv + Math.sin(angle) * ringR;

          // Tangential velocity — stronger to visibly feed the swirl
          const tangStr = 0.002 * ring.radiusMult;
          const tangVx = -Math.sin(angle) * tangStr * well.orbitalDir;
          const tangVy = Math.cos(angle) * tangStr * well.orbitalDir;

          const b = rate * ring.brightness * armBrightness;
          fluid.splat(
            px, py,
            tangVx, tangVy,
            ring.splatR,
            b * ring.r,
            b * ring.g,
            b * ring.b
          );
        }
      }

      // === EVENT HORIZON — dark center with bright edge contrast ===
      // Instead of glowing at center, inject NEGATIVE density to darken it
      // This creates the void-with-bright-ring look
      // (Negative density values get clamped by the shader but reduce the
      //  accumulated density from other splats, creating relative darkness)
      fluid.splat(
        fu, fv,
        0, 0,
        0.003,           // small radius — tight dark core
        -0.05, -0.05, -0.05  // subtract density — creates the void
      );

      // Bright innermost ring — the edge of the event horizon, tinted by well color
      const horizonPts = 16;
      const horizonR = well.getAccretionRadius() * well.mass * 0.3;
      for (let i = 0; i < horizonPts; i++) {
        const angle = spinAngle * 1.5 + (i / horizonPts) * Math.PI * 2;
        const px = fu + Math.cos(angle) * horizonR;
        const py = fv + Math.sin(angle) * horizonR;
        fluid.splat(
          px, py,
          0, 0,
          0.004,
          rate * 12.0 * (0.5 + wc[0] * 0.5),   // VERY bright, well-tinted
          rate * 10.0 * (0.5 + wc[1] * 0.5),
          rate * 6.0 * (0.5 + wc[2] * 0.5)
        );
      }
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
