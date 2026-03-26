/**
 * wells.js — Gravity well force injection with orbital currents.
 *
 * V3: Wells use world-space coordinates (0-3 range).
 * Fluid injection uses worldToFluidUV. Ship interaction uses worldDistance.
 */

import { CONFIG } from './config.js';
import { WORLD_SCALE, worldToFluidUV, worldToScreen, worldDistance, worldDisplacement, uvScale, accretionScale } from './coords.js';

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

      // The renderer now owns the well silhouette analytically.
      // Do not accumulate a subtractive splat here every fixed tick — it turns
      // large wells into blocky dark slabs once the ASCII quantization kicks in.
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
   * Get renderer-facing well shape data for the display shader.
   * Returns [coreRadius, ringInner, ringOuter, orbitalDir] per well.
   *
   * ALL OUTPUT VALUES ARE IN WORLD-SPACE (SHADER DISTANCE RULE).
   * The display shader computes: dist = length(diff_uv) / uvS  which is world-space.
   * Shape radii must be in the same space to compare correctly.
   *
   * accretionRadius (CONFIG, UV-space) is converted to world-space via × WORLD_SCALE.
   * killRadius (CONFIG, world-space) is used directly.
   *
   * The multiplier constants (1.08, 0.33, 1.18, 0.72, 1.48, 3.8, 2.2) are
   * visual tuning — they size the core, inner ring, and outer ring relative
   * to each other. They don't change with map scale.
   */
  getRenderShapes() {
    // Visual tuning constants — these are artistic ratios, NOT coordinate conversions.
    // They control how the shader's ring/core/halo map onto the well's physical radii.
    const CORE_KILL_FRAC = 1.0 / 3.0;  // visual core = 1/3 of kill radius (die before you see black)
    const MIN_ACCRETION_WORLD = 0.036;  // world-space floor so tiny wells still have a visible ring

    return this.wells.map(w => {
      // Convert accretion from UV-space to world-space (SHADER DISTANCE RULE).
      // accretionRadius (CONFIG) is in UV-space. Multiply by accretionScale() for
      // sqrt scaling — rings grow sub-linearly with map size. See RING-SCALE.md.
      const accretionUV = w.getAccretionRadius() * w.mass;       // UV-space
      const accretionWorld = accretionUV * accretionScale();      // → world-space (sqrt-scaled)
      const accretionRef = Math.max(MIN_ACCRETION_WORLD, accretionWorld);

      // Core: driven by kill radius (world-space) — the "do not go here" signal
      const coreRef = Math.max(
        w.killRadius * CORE_KILL_FRAC * 1.08,  // kill radius fraction (world-space)
        accretionRef * 0.33                     // or 1/3 of accretion ring
      );

      // Inner ring: just outside the core
      const ringInnerRef = Math.max(coreRef * 1.18, accretionRef * 0.72);

      // Outer ring: the visible extent of the accretion band
      const ringOuterRef = Math.max(ringInnerRef * 1.48, coreRef * 3.8, accretionRef * 2.2);

      return [coreRef, ringInnerRef, ringOuterRef, w.orbitalDir];
    });
  }
}
