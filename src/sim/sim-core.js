import { CONFIG } from '../config.js';

/**
 * Legacy local-sandbox world step.
 *
 * Product gameplay truth lives in the authority runtime. This remains for
 * Bench/local sandbox work, renderer fixtures, and remote visual hydration;
 * the title attract scene has its own presentation-only owner.
 */
export class LocalSandboxSimCore {
  constructor({
    fluid,
    flowField,
    wellSystem,
    starSystem,
    wreckSystem,
    portalSystem,
    planetoidSystem,
    scavengerSystem,
    combatSystem,
    waveRings,
    ship,
  }) {
    this.fluid = fluid;
    this.flowField = flowField;
    this.wellSystem = wellSystem;
    this.starSystem = starSystem;
    this.wreckSystem = wreckSystem;
    this.portalSystem = portalSystem;
    this.planetoidSystem = planetoidSystem;
    this.scavengerSystem = scavengerSystem;
    this.combatSystem = combatSystem;
    this.waveRings = waveRings;
    this.ship = ship;
    this.accumulator = 0;
  }

  reset() {
    this.accumulator = 0;
  }

  getDissipationAnchors() {
    return [
      ...this.wellSystem.getUVPositions(),
      ...this.starSystem.getUVPositions(),
    ];
  }

  update(simState, { frameDt, totalTime, inMenu, visualOnly = false, camX = null, camY = null }) {
    const fixedStep = 1 / CONFIG.sim.fixedHz;
    const maxSteps = CONFIG.sim.maxStepsPerFrame;

    this.accumulator += frameDt;

    let steps = 0;
    while (this.accumulator >= fixedStep && steps < maxSteps) {
      this.step(simState, { stepDt: fixedStep, totalTime, inMenu, visualOnly, camX, camY });
      this.accumulator -= fixedStep;
      steps++;
    }

    if (steps === maxSteps && this.accumulator >= fixedStep) {
      this.accumulator = 0;
    }
  }

  step(simState, { stepDt, totalTime, inMenu, visualOnly = false, camX = null, camY = null }) {
    this.fluid.setWellPositions(this.getDissipationAnchors());
    this.fluid.step(stepDt);
    this.fluid.fadeVisualDensity(0.99);

    this.wellSystem.update(this.fluid, stepDt, totalTime, { authorityDriven: visualOnly });
    this.starSystem.update(this.fluid, stepDt, totalTime, this.wellSystem, this.waveRings, {
      visualOnly,
      authorityDriven: visualOnly,
    });

    if (!visualOnly) {
      this.wreckSystem.update(this.fluid, stepDt, totalTime, camX, camY, this.wellSystem);
      this.portalSystem.update(this.fluid, stepDt, totalTime, camX, camY, simState.runElapsedTime);
      this.planetoidSystem.update(stepDt, this.wellSystem, this.waveRings);
    }

    if (!inMenu && !visualOnly) {
      this.scavengerSystem.update(stepDt, this.flowField, this.fluid, this.wellSystem, this.wreckSystem, this.portalSystem, this.ship, this.waveRings);
      this.scavengerSystem.checkBumpCollision(this.ship);
      simState.runElapsedTime += stepDt;
    }

    if (!visualOnly) {
      this.combatSystem.update(stepDt);
      this.combatSystem.applyDisruptions(this.fluid);
    }

    // Staggered well growth — one well per event tick, round-robin.
    // Prevents all wells spawning wave rings on the same frame (GPU spike).
    if (!visualOnly) {
      simState.growthTimer += stepDt;
      const perWellInterval = CONFIG.events.growthInterval / Math.max(1, this.wellSystem.wells.length);
      if (simState.growthTimer >= perWellInterval) {
        simState.growthTimer -= perWellInterval;
        const evtCfg = CONFIG.events;
        const idx = (simState.growthIndex ?? 0) % this.wellSystem.wells.length;
        simState.growthIndex = idx + 1;
        const well = this.wellSystem.wells[idx];
        if (well) {
          well.mass += well.growthRate;
          well.updateKillRadius();
          this.waveRings.spawn(well.wx, well.wy, evtCfg.growthWaveAmplitude * well.mass);
        }
      }
    }

    if (!inMenu && !visualOnly && CONFIG.universe.planetoidSpawnAccel > 0) {
      const runDuration = Number(CONFIG.universe.runDuration);
      const runProgress = runDuration > 0
        ? Math.min(simState.runElapsedTime / runDuration, 1.0)
        : 0;
      const intervalScale = 1.0 - runProgress * CONFIG.universe.planetoidSpawnAccel;
      this.planetoidSystem._spawnIntervalScale = Math.max(0.3, intervalScale);
    }

    if (!visualOnly) {
      this.waveRings.update(stepDt);
      this.waveRings.injectIntoFluid(this.fluid);
    }
  }
}

// Preserve the narrow historical import for external debug tooling while new
// app wiring names the remaining local owner honestly.
export { LocalSandboxSimCore as SimCore };
