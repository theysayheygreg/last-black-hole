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
    // UV scaling factors. s = linear (for UV position offsets).
    // s2 = quadratic (for splat radii — because the splat shader uses exp(-d²/r),
    // keeping the same world-space Gaussian width requires r to scale as s²).
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

      // === EVENT HORIZON ===
      // The renderer now owns the accretion band analytically. Keep only the
      // subtractive void signal here so the scene stays readable without
      // exploding the pass budget on large maps.
      const voidR = well.getVoidRadius() * Math.max(1.0, well.mass * 0.75) * s2;
      const voidStr = -0.5 * Math.min(2.0, 1.0 + well.mass * 0.25);
      fluid.visualSplat(fu, fv, voidR, voidStr, voidStr, voidStr);
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

  /**
   * Get well masses matching getUVPositions() order, for gravity field visualization.
   */
  getUVMasses() {
    return this.wells.map(w => w.mass);
  }

  /**
   * Get renderer-facing well shape data in reference-scaled units.
   * x = core radius, y = ring inner radius, z = ring outer radius, w = orbitalDir
   *
   * Distances are normalized to the 3x3 reference view so the display shader
   * can stay stable across map sizes. Kill radius drives the core because that
   * is the actual gameplay "do not go here" signal.
   */
  getRenderShapes() {
    return this.wells.map(w => {
      const accretionRef = Math.max(0.012, w.getAccretionRadius() * w.mass);
      const coreRef = Math.max((w.killRadius / 3.0) * 0.9, accretionRef * 0.28);
      const ringInnerRef = Math.max(coreRef * 1.12, accretionRef * 0.72);
      const ringOuterRef = Math.max(ringInnerRef * 1.18, accretionRef * 1.32);
      return [coreRef, ringInnerRef, ringOuterRef, w.orbitalDir];
    });
  }
}
