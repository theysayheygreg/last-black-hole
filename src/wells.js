/**
 * wells.js — Gravity well force injection with orbital currents.
 *
 * V3: Wells use world-space coordinates (0-3 range).
 * Fluid injection uses worldToFluidUV. Ship interaction uses worldDistance.
 */

import { CONFIG } from './config.js';
import { WORLD_SCALE, worldToFluidUV, worldToScreen, worldDistance, worldDisplacement, uvScale } from './coords.js';

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
    this.startMass = this.mass;  // for kill radius growth calculation
    this.orbitalDir = opts.orbitalDir ?? 1;
    this.accretionRate = opts.accretionRate ?? null;
    this.accretionRadius = opts.accretionRadius ?? null;
    this.accretionSpinRate = opts.accretionSpinRate ?? null;
    this.accretionPoints = opts.accretionPoints ?? null;
    this.voidRadius = opts.voidRadius ?? null;  // negative density splat radius (UV-space before scaling)
    this.baseKillRadius = opts.killRadius ?? CONFIG.wells.killRadius;
    this.killRadius = this.baseKillRadius;
    // Per-well growth rate: base + random variance for asymmetric growth
    this.growthRate = (opts.growthRate ?? CONFIG.events.growthAmount)
      + (Math.random() * 2 - 1) * CONFIG.universe.wellGrowthVariance;
  }

  /** Recalculate kill radius from current mass vs starting mass. */
  updateKillRadius() {
    const massDelta = Math.max(0, this.mass - this.startMass);
    this.killRadius = this.baseKillRadius * (1 + massDelta * CONFIG.universe.wellKillRadiusGrowth);
  }

  getVoidRadius() { return this.voidRadius ?? CONFIG.wells.voidRadius ?? 0.001; }
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
  update(fluid, dt, totalTime) {
    const cfg = CONFIG.wells;
    // No camera culling for wells — they're too important to skip.
    // Direct gravity + kill radius check ALL wells, so visual density must match.
    // 8-20 wells is cheap enough for the GPU.
    const s = uvScale();
    const s2 = s * s;

    for (const well of this.wells) {

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
      // Velocity injection stays in physics (drives orbital currents).
      // Density injection moved to visual buffer (doesn't get advected away).
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

          // Tangential velocity — physics (feeds the orbital current)
          const tangStr = cfg.accretionTangentialForce * ring.radiusMult * s;
          const tangVx = -Math.sin(angle) * tangStr * well.orbitalDir;
          const tangVy = Math.cos(angle) * tangStr * well.orbitalDir;
          fluid.splat(px, py, tangVx, tangVy, ring.splatR * s2, 0, 0, 0);

          // Density — visual only (stays anchored, not advected)
          const b = rate * ring.brightness * armBrightness;
          fluid.visualSplat(px, py, ring.splatR * s2,
            b * ring.r, b * ring.g, b * ring.b
          );
        }
      }

      // === EVENT HORIZON ===
      // Void + glow in visual buffer so they stay centered on the well
      const voidR = well.getVoidRadius() * s2;
      // Negative density strength scales with radius — bigger voids need stronger injection
      const voidStr = voidR > 0.01 ? -0.3 : -0.05;
      fluid.visualSplat(fu, fv, voidR, voidStr, voidStr, voidStr);

      const horizonPts = cfg.horizonPoints;
      const horizonR = well.getAccretionRadius() * well.mass * cfg.horizonRadiusMult * s;
      for (let i = 0; i < horizonPts; i++) {
        const angle = spinAngle * 1.5 + (i / horizonPts) * Math.PI * 2;
        const px = fu + Math.cos(angle) * horizonR;
        const py = fv + Math.sin(angle) * horizonR;
        fluid.visualSplat(px, py, 0.001 * s2, rate * 8.0, rate * 7.0, rate * 4.0);
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
