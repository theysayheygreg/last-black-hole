import { CONFIG } from '../config.js';
import { worldToFluidUV } from '../coords.js';

export class SimCore {
  constructor({
    fluid,
    flowField,
    wellSystem,
    starSystem,
    lootSystem,
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
    this.lootSystem = lootSystem;
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

  update(simState, { frameDt, totalTime, inMenu }) {
    const fixedStep = 1 / CONFIG.sim.fixedHz;
    const maxSteps = CONFIG.sim.maxStepsPerFrame;

    this.accumulator += frameDt;

    let steps = 0;
    while (this.accumulator >= fixedStep && steps < maxSteps) {
      this.step(simState, { stepDt: fixedStep, totalTime, inMenu });
      this.accumulator -= fixedStep;
      steps++;
    }

    if (steps === maxSteps && this.accumulator >= fixedStep) {
      this.accumulator = 0;
    }
  }

  step(simState, { stepDt, totalTime, inMenu }) {
    this.fluid.setWellPositions(this.getDissipationAnchors());
    this.fluid.step(stepDt);
    this.fluid.fadeVisualDensity(0.99);

    this.wellSystem.update(this.fluid, stepDt, totalTime);
    this.starSystem.update(this.fluid, stepDt, totalTime);

    const turbStr = CONFIG.fluid.ambientTurbulence;
    const densStr = CONFIG.fluid.ambientDensity;
    if (turbStr > 0 || densStr > 0) {
      for (let i = 0; i < 3; i++) {
        const rx = Math.random();
        const ry = Math.random();
        const angle = Math.random() * Math.PI * 2;
        const forceMag = turbStr * (0.5 + Math.random());
        this.fluid.splat(
          rx,
          ry,
          Math.cos(angle) * forceMag,
          Math.sin(angle) * forceMag,
          0.003 + Math.random() * 0.005,
          densStr * (0.3 + Math.random() * 0.7),
          densStr * (0.5 + Math.random() * 0.5),
          densStr * (0.6 + Math.random() * 0.4)
        );
      }
    }

    this.lootSystem.update(this.fluid, stepDt, totalTime);
    this.wreckSystem.update(this.fluid, stepDt, totalTime);
    this.portalSystem.update(this.fluid, stepDt, totalTime, undefined, undefined, simState.runElapsedTime);
    this.planetoidSystem.update(stepDt, this.fluid, totalTime, this.wellSystem, this.waveRings);

    if (!inMenu) {
      this.scavengerSystem.update(stepDt, this.flowField, this.fluid, this.wellSystem, this.wreckSystem, this.portalSystem, this.ship, this.waveRings);
      this.scavengerSystem.checkBumpCollision(this.ship);
      simState.runElapsedTime += stepDt;
    }

    this.combatSystem.update(stepDt);
    this.combatSystem.applyDisruptions(this.fluid);

    simState.growthTimer += stepDt;
    if (simState.growthTimer >= CONFIG.events.growthInterval) {
      simState.growthTimer -= CONFIG.events.growthInterval;
      const evtCfg = CONFIG.events;
      for (const well of this.wellSystem.wells) {
        well.mass += well.growthRate;
        well.updateKillRadius();
        this.waveRings.spawn(well.wx, well.wy, evtCfg.growthWaveAmplitude * well.mass);
      }
    }

    if (!inMenu && CONFIG.universe.planetoidSpawnAccel > 0) {
      const runProgress = Math.min(simState.runElapsedTime / CONFIG.universe.runDuration, 1.0);
      const intervalScale = 1.0 - runProgress * CONFIG.universe.planetoidSpawnAccel;
      this.planetoidSystem._spawnIntervalScale = Math.max(0.3, intervalScale);
    }

    this.waveRings.update(stepDt);
    this.waveRings.injectIntoFluid(this.fluid);
  }
}
