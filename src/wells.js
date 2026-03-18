/**
 * wells.js — Gravity well force injection with orbital currents.
 *
 * V3: Wells use world-space coordinates (0-3 range).
 * Fluid injection uses worldToFluidUV. Ship interaction uses worldDistance.
 */

import { CONFIG } from './config.js';
import { WORLD_SCALE, worldToFluidUV, worldToScreen, worldDistance, worldDisplacement, CAMERA_VIEW, uvScale } from './coords.js';

export class Well {
  /**
   * @param {number} wx - world-space X (0 to WORLD_SCALE)
   * @param {number} wy - world-space Y (0 to WORLD_SCALE)
   * @param {Object} opts - per-instance parameters
   */
  constructor(wx, wy, opts = {}) {
    this.wx = wx;
    this.wy = wy;
    this.mass = opts.mass ?? 1.0;
    this.orbitalDir = opts.orbitalDir ?? 1;
    this.accretionRate = opts.accretionRate ?? null;
    this.accretionRadius = opts.accretionRadius ?? null;
    this.accretionSpinRate = opts.accretionSpinRate ?? null;
    this.accretionPoints = opts.accretionPoints ?? null;
    this.killRadius = opts.killRadius ?? CONFIG.wells.killRadius;
  }

  getAccretionRate() { return this.accretionRate ?? CONFIG.wells.accretionRate; }
  getAccretionRadius() { return this.accretionRadius ?? CONFIG.wells.accretionRadius; }
  getAccretionSpinRate() { return this.accretionSpinRate ?? CONFIG.wells.accretionSpinRate; }
  getAccretionPoints() { return this.accretionPoints ?? CONFIG.wells.accretionPoints; }
}

export class WellSystem {
  constructor() {
    this.wells = [];
  }

  addWell(wx, wy, opts = {}) {
    const well = new Well(wx, wy, opts);
    this.wells.push(well);
    return well;
  }

  /**
   * Apply all well forces to the fluid sim and inject density.
   * When camX/camY are provided, culls wells beyond visible range + margin.
   */
  update(fluid, dt, totalTime, camX, camY) {
    const cfg = CONFIG.wells;
    const cullDist = CAMERA_VIEW + 0.5;
    // UV scaling: config calibrated at WORLD_SCALE=3, normalize for current scale
    const s = uvScale();
    const s2 = s * s;  // for splat radii (quadratic because exp uses squared distance)

    for (const well of this.wells) {
      if (camX != null && worldDistance(well.wx, well.wy, camX, camY) > cullDist) continue;

      const [fu, fv] = worldToFluidUV(well.wx, well.wy);

      // Apply gravitational + orbital force to velocity field
      // Gravity scaled by s^falloff to compensate for smaller UV distances on large maps
      fluid.applyWellForce(
        [fu, fv],
        cfg.gravity * well.mass * Math.pow(s, cfg.falloff),
        cfg.falloff,
        cfg.fluidClampRadius,
        cfg.orbitalStrength * well.orbitalDir,
        dt,
        cfg.fluidTerminalSpeed * s
      );

      // === SPINNING ACCRETION DISK ===
      const spinAngle = totalTime * well.getAccretionSpinRate() * well.orbitalDir;
      const numPts = well.getAccretionPoints();
      const rate = well.getAccretionRate() * well.mass;

      for (const ring of cfg.accretionRings) {
        const ringR = well.getAccretionRadius() * well.mass * ring.radiusMult * s;

        for (let i = 0; i < numPts; i++) {
          const armPhase = (i / numPts) * Math.PI * 2;
          const armBrightness = 0.3 + 0.7 * Math.pow(Math.max(0, Math.cos(armPhase * numPts * 0.5)), 2);

          const angle = spinAngle + armPhase;
          const px = fu + Math.cos(angle) * ringR;
          const py = fv + Math.sin(angle) * ringR;

          const tangStr = cfg.accretionTangentialForce * ring.radiusMult * s;
          const tangVx = -Math.sin(angle) * tangStr * well.orbitalDir;
          const tangVy = Math.cos(angle) * tangStr * well.orbitalDir;

          const b = rate * ring.brightness * armBrightness;
          fluid.splat(
            px, py,
            tangVx, tangVy,
            ring.splatR * s2,
            b * ring.r,
            b * ring.g,
            b * ring.b
          );
        }
      }

      // === EVENT HORIZON ===
      fluid.splat(fu, fv, 0, 0, 0.001 * s2, -0.05, -0.05, -0.05);

      const horizonPts = cfg.horizonPoints;
      const horizonR = well.getAccretionRadius() * well.mass * cfg.horizonRadiusMult * s;
      for (let i = 0; i < horizonPts; i++) {
        const angle = spinAngle * 1.5 + (i / horizonPts) * Math.PI * 2;
        const px = fu + Math.cos(angle) * horizonR;
        const py = fv + Math.sin(angle) * horizonR;
        fluid.splat(px, py, 0, 0, 0.001 * s2, rate * 8.0, rate * 7.0, rate * 4.0);
      }
    }
  }

  /**
   * Check if the ship is inside any well's kill radius (world-space).
   */
  checkDeath(shipWX, shipWY) {
    for (const well of this.wells) {
      const dist = worldDistance(shipWX, shipWY, well.wx, well.wy);
      if (dist < well.killRadius) return well;
    }
    return null;
  }

  /**
   * Get well data for external use (test API, debug).
   */
  getWellData(camX, camY, canvasW, canvasH) {
    return this.wells.map(w => {
      const [sx, sy] = worldToScreen(w.wx, w.wy, camX, camY, canvasW, canvasH);
      return {
        x: sx, y: sy,
        wx: w.wx, wy: w.wy,
        mass: w.mass,
      };
    });
  }

  /**
   * Get fluid UV positions for the display shader.
   */
  getUVPositions() {
    return this.wells.map(w => worldToFluidUV(w.wx, w.wy));
  }
}
