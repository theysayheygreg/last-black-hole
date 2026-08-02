import { CONFIG } from '../config.js';

/**
 * Pure title-loop state shared by the animated backdrop and its UI copy.
 * `loopTime` is already normalized by the caller so this module owns no app
 * clock and cannot accidentally become gameplay time.
 */
export function sampleTitleAttractState(loopTime) {
  const t = Number(loopTime) || 0;
  const smoothstep = (edge0, edge1, value) => {
    const n = Math.max(0, Math.min(1, (value - edge0) / Math.max(0.0001, edge1 - edge0)));
    return n * n * (3 - 2 * n);
  };
  const collapse = smoothstep(6.2, 7.5, t);
  const returnFade = smoothstep(8.8, 10.6, t);
  const portalAlpha = t < 6.2 ? 1 : t < 8.8 ? 1 - collapse : returnFade;
  let story = 'wake scan nominal';
  let role = 'flow';

  if (t >= 2.5 && t < 5.0) {
    story = 'derelict signatures indexed';
    role = 'salvage';
  } else if (t >= 5.0 && t < 7.9) {
    story = 'rift aperture decay';
    role = 'anomaly';
  } else if (t >= 7.9 && t < 10.4) {
    story = 'route memory degraded';
    role = 'muted';
  }

  return { portalAlpha, story, role };
}

/**
 * Presentation-only owner for the live title backdrop.
 *
 * The title map reuses the existing entity data shapes because the renderer
 * already consumes them, but this owner has no ship, input, authority, AI,
 * inventory, extraction, or run clock. It advances only the authored visual
 * fixture through the app's existing frame loop.
 */
export class TitleScenePresentation {
  constructor({
    fluid,
    wellSystem,
    starSystem,
    wreckSystem,
    portalSystem,
    planetoidSystem,
    combatSystem,
    waveRings,
  }) {
    this.fluid = fluid;
    this.wellSystem = wellSystem;
    this.starSystem = starSystem;
    this.wreckSystem = wreckSystem;
    this.portalSystem = portalSystem;
    this.planetoidSystem = planetoidSystem;
    this.combatSystem = combatSystem;
    this.waveRings = waveRings;
    this.reset();
  }

  reset() {
    this.accumulator = 0;
    this.growthTimer = 0;
    this.growthIndex = 0;
  }

  getDissipationAnchors() {
    return [
      ...this.wellSystem.getUVPositions(),
      ...this.starSystem.getUVPositions(),
    ];
  }

  update({ frameDt, totalTime, camX = null, camY = null }) {
    const fixedStep = 1 / CONFIG.sim.fixedHz;
    const maxSteps = CONFIG.sim.maxStepsPerFrame;
    this.accumulator += frameDt;

    let steps = 0;
    while (this.accumulator >= fixedStep && steps < maxSteps) {
      this.step({ stepDt: fixedStep, totalTime, camX, camY });
      this.accumulator -= fixedStep;
      steps += 1;
    }

    if (steps === maxSteps && this.accumulator >= fixedStep) {
      this.accumulator = 0;
    }
  }

  step({ stepDt, totalTime, camX = null, camY = null }) {
    this.fluid.setWellPositions(this.getDissipationAnchors());
    this.fluid.step(stepDt);
    this.fluid.fadeVisualDensity(0.99);

    // Preserve the established title composition exactly. These systems mutate
    // title-local fixture records only; no product gameplay reads them.
    this.wellSystem.update(this.fluid, stepDt, totalTime);
    this.starSystem.update(this.fluid, stepDt, totalTime, this.wellSystem, this.waveRings);
    this.wreckSystem.update(this.fluid, stepDt, totalTime, camX, camY, this.wellSystem);
    this.portalSystem.update(this.fluid, stepDt, totalTime, camX, camY, 0);
    this.planetoidSystem.update(stepDt, this.wellSystem, this.waveRings);
    this.combatSystem.update(stepDt);
    this.combatSystem.applyDisruptions(this.fluid);

    this.growthTimer += stepDt;
    const perWellInterval = CONFIG.events.growthInterval / Math.max(1, this.wellSystem.wells.length);
    if (this.growthTimer >= perWellInterval) {
      this.growthTimer -= perWellInterval;
      const index = this.growthIndex % this.wellSystem.wells.length;
      this.growthIndex = index + 1;
      const well = this.wellSystem.wells[index];
      if (well) {
        well.mass += well.growthRate;
        well.updateKillRadius();
        this.waveRings.spawn(
          well.wx,
          well.wy,
          CONFIG.events.growthWaveAmplitude * well.mass,
        );
      }
    }

    this.waveRings.update(stepDt);
    this.waveRings.injectIntoFluid(this.fluid);
  }

  applyAttractState({ portalId, loopTime }) {
    const portal = this.portalSystem.portals.find((candidate) => candidate.id === portalId);
    if (!portal) return false;
    const { portalAlpha } = sampleTitleAttractState(loopTime);
    portal.opacity = portalAlpha;
    portal.alive = portalAlpha > 0.035;
    return true;
  }
}
