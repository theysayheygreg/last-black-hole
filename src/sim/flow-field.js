import { CONFIG } from '../config.js';
import { FABRIC } from '../content/fabric.js';
import { resolveWellReachMultiplier, wellStrengthMass } from '../content/well-growth.js';
import { fluidVelToWorld, worldDirectionTo, worldToFluidUV } from '../coords.js';
import { inversePowerForce, orbitalCurrentSpeed } from '../physics.js';
import { emptyFlowSample, normalizeFlowSample } from './flow-sample.js';

function wrapUV(value) {
  return ((value % 1) + 1) % 1;
}

export class FlowField {
  constructor(fluid = null, sources = {}) {
    this.fluid = fluid;
    this.setSources(sources);
  }

  setFluid(fluid) {
    this.fluid = fluid;
  }

  setSources({ wellSystem = null, starSystem = null, waveRings = null } = {}) {
    this.wellSystem = wellSystem;
    this.starSystem = starSystem;
    this.waveRings = waveRings;
  }

  sample(wx, wy) {
    const wells = this.wellSystem?.wells || [];
    const stars = this.starSystem?.stars || [];
    if (wells.length === 0 && stars.length === 0) {
      return emptyFlowSample();
    }

    let currentX = 0;
    let currentY = 0;
    let gravityX = 0;
    let gravityY = 0;
    let hazard = 0;
    let sourceWellId = null;
    let bestCurrent = 0;

    const wellCfg = CONFIG.wells;
    const wellRange = wellCfg.maxRange ?? 1.2;
    const currentRange = wellCfg.currentRange ?? wellRange;
    for (const well of wells) {
      const dirToWell = worldDirectionTo(wx, wy, well.wx, well.wy);
      if (dirToWell.dist < 0.001) continue;
      const reach = resolveWellReachMultiplier(well, FABRIC.wellGravity.growthReachPerMass);
      const orbital = orbitalCurrentSpeed(
        dirToWell.dist,
        wellCfg.currentStrength ?? 0.3,
        wellStrengthMass(well),
        wellCfg.currentFalloff ?? wellCfg.shipPullFalloff ?? 1.5,
        currentRange * reach
      );
      const gravity = inversePowerForce(
        dirToWell.dist,
        wellCfg.shipPullStrength ?? 0.6,
        wellStrengthMass(well),
        wellCfg.shipPullFalloff ?? 1.5,
        wellRange * reach
      );
      const orbitalDir = well.orbitalDir || 1;
      const tx = -dirToWell.ny * orbitalDir;
      const ty = dirToWell.nx * orbitalDir;
      if (orbital > 0) {
        currentX += tx * orbital;
        currentY += ty * orbital;
      }
      gravityX += dirToWell.nx * gravity;
      gravityY += dirToWell.ny * gravity;
      hazard = Math.max(hazard, 1 - Math.max(0, dirToWell.dist - (well.killRadius || 0.04)) / Math.max(0.001, wellRange * reach));
      if (orbital > bestCurrent) {
        bestCurrent = orbital;
        sourceWellId = well.name || null;
      }
    }

    const starCfg = CONFIG.stars;
    const starRange = starCfg.maxRange ?? 0.6;
    for (const star of stars) {
      if (star.alive === false) continue;
      const dirFromStar = worldDirectionTo(star.wx, star.wy, wx, wy);
      if (dirFromStar.dist < 0.001 || dirFromStar.dist > starRange) continue;
      const safeDist = Math.max(0.15, dirFromStar.dist);
      const rangeFade = Math.max(0, 1 - dirFromStar.dist / starRange);
      const typePush = star.typeDef?.pushMult ?? 1;
      const strength = (star.mass || 1) * typePush * rangeFade / Math.pow(safeDist / 0.25, starCfg.falloff ?? 1.8);
      hazard = Math.max(hazard, Math.min(1, strength / 2.5));
    }

    return normalizeFlowSample({
      current: { x: currentX, y: currentY },
      gravity: { x: gravityX, y: gravityY },
      hazard,
      sources: { wellId: sourceWellId },
      confidence: 1,
    });
  }

  sampleUV(u, v) {
    if (!this.fluid) return emptyFlowSample();
    const sampleU = wrapUV(u);
    const sampleV = wrapUV(v);
    const [fvx, fvy] = this.fluid.readVelocityAt(sampleU, sampleV);
    const [wvx, wvy] = fluidVelToWorld(fvx, fvy);
    return normalizeFlowSample({
      current: { x: wvx, y: wvy },
      confidence: 1,
    });
  }
}
