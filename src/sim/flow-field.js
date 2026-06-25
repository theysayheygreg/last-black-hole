import { CONFIG } from '../config.js';
import { fluidVelToWorld, worldDirectionTo, worldToFluidUV } from '../coords.js';
import { inversePowerForce, orbitalCurrentSpeed, waveBandForce } from '../physics.js';
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
    const rings = this.waveRings?.rings || [];
    if (wells.length === 0 && stars.length === 0 && rings.length === 0) {
      return emptyFlowSample();
    }

    let currentX = 0;
    let currentY = 0;
    let gravityX = 0;
    let gravityY = 0;
    let waveX = 0;
    let waveY = 0;
    let hazard = 0;
    let surf = 0;
    let sourceWellId = null;
    let sourceRingId = null;
    let bestCurrent = 0;

    const wellCfg = CONFIG.wells;
    const wellRange = wellCfg.maxRange ?? 1.2;
    const currentRange = wellCfg.currentRange ?? wellRange;
    for (const well of wells) {
      const dirToWell = worldDirectionTo(wx, wy, well.wx, well.wy);
      if (dirToWell.dist < 0.001) continue;
      const orbital = orbitalCurrentSpeed(
        dirToWell.dist,
        wellCfg.currentStrength ?? 0.3,
        well.mass || 1,
        wellCfg.currentFalloff ?? wellCfg.shipPullFalloff ?? 1.5,
        currentRange
      );
      const gravity = inversePowerForce(
        dirToWell.dist,
        wellCfg.shipPullStrength ?? 0.6,
        well.mass || 1,
        wellCfg.shipPullFalloff ?? 1.5,
        wellRange
      );
      const orbitalDir = well.orbitalDir || 1;
      const tx = -dirToWell.ny * orbitalDir;
      const ty = dirToWell.nx * orbitalDir;
      if (orbital > 0) {
        currentX += tx * orbital;
        currentY += ty * orbital;
        surf = Math.max(surf, Math.min(1, orbital / 0.7));
      }
      gravityX += dirToWell.nx * gravity;
      gravityY += dirToWell.ny * gravity;
      hazard = Math.max(hazard, 1 - Math.max(0, dirToWell.dist - (well.killRadius || 0.04)) / Math.max(0.001, wellRange));
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

    const eventCfg = CONFIG.events;
    const halfWidth = (eventCfg.waveWidth ?? 0.1) * 0.5;
    for (const ring of rings) {
      if (!ring || ring.alive === false || ring.amplitude < 0.01) continue;
      const dirFromRing = worldDirectionTo(ring.sourceWX, ring.sourceWY, wx, wy);
      const accel = waveBandForce(
        dirFromRing.dist,
        ring.radius || 0,
        halfWidth,
        eventCfg.waveShipPush ?? 0.8,
        ring.amplitude || 0
      );
      if (accel <= 0) continue;
      const x = dirFromRing.nx * accel;
      const y = dirFromRing.ny * accel;
      waveX += x;
      waveY += y;
      sourceRingId = sourceRingId || `${ring.sourceWX?.toFixed?.(2) ?? 'ring'},${ring.sourceWY?.toFixed?.(2) ?? ''}`;
      surf = Math.max(surf, Math.min(1, accel / 1.4));
    }

    return normalizeFlowSample({
      current: { x: currentX, y: currentY },
      gravity: { x: gravityX, y: gravityY },
      wave: { x: waveX, y: waveY },
      hazard,
      surf,
      sources: { wellId: sourceWellId, ringId: sourceRingId },
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
