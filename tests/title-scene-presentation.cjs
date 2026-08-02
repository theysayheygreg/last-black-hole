const fs = require('fs');
const path = require('path');
const { TestRunner, assert } = require('./helpers.cjs');

const ROOT = path.resolve(__dirname, '..');

async function run() {
  const runner = new TestRunner('TitleScenePresentation');
  const { CONFIG } = await import(path.join(ROOT, 'src/config.js'));
  const {
    sampleTitleAttractState,
    TitleScenePresentation,
  } = await import(path.join(ROOT, 'src/presentation/title-scene-presentation.js'));

  await runner.run('title frame preserves the established visual step order', async () => {
    const calls = [];
    const fluid = {
      setWellPositions: (anchors) => calls.push(['anchors', anchors]),
      step: (dt) => calls.push(['fluid.step', dt]),
      fadeVisualDensity: (value) => calls.push(['fluid.fade', value]),
    };
    const well = {
      wx: 1.5,
      wy: 1.5,
      mass: 4.9,
      growthRate: 0.1,
      updateKillRadius: () => calls.push(['well.kill-radius']),
    };
    const wellSystem = {
      wells: [well],
      getUVPositions: () => ['well-anchor'],
      update: (...args) => calls.push(['wells.update', ...args]),
    };
    const starSystem = {
      getUVPositions: () => ['star-anchor'],
      update: (...args) => calls.push(['stars.update', ...args]),
    };
    const wreckSystem = { update: (...args) => calls.push(['wrecks.update', ...args]) };
    const portalSystem = {
      portals: [],
      update: (...args) => calls.push(['portals.update', ...args]),
    };
    const planetoidSystem = { update: (...args) => calls.push(['planetoids.update', ...args]) };
    const combatSystem = {
      update: (...args) => calls.push(['combat.update', ...args]),
      applyDisruptions: (...args) => calls.push(['combat.disruptions', ...args]),
    };
    const waveRings = {
      update: (...args) => calls.push(['waves.update', ...args]),
      injectIntoFluid: (...args) => calls.push(['waves.inject', ...args]),
      spawn: (...args) => calls.push(['waves.spawn', ...args]),
    };

    const title = new TitleScenePresentation({
      fluid,
      wellSystem,
      starSystem,
      wreckSystem,
      portalSystem,
      planetoidSystem,
      combatSystem,
      waveRings,
    });
    const dt = 1 / CONFIG.sim.fixedHz;
    title.update({ frameDt: dt, totalTime: 3.25, camX: 1.1, camY: 1.2 });

    assert(
      calls.map(([name]) => name).join('|') === [
        'anchors',
        'fluid.step',
        'fluid.fade',
        'wells.update',
        'stars.update',
        'wrecks.update',
        'portals.update',
        'planetoids.update',
        'combat.update',
        'combat.disruptions',
        'waves.update',
        'waves.inject',
      ].join('|'),
      `Unexpected title visual step order: ${calls.map(([name]) => name).join('|')}`,
    );
    assert(calls[0][1].join('|') === 'well-anchor|star-anchor', 'Expected the same title dissipation anchors');
    const portalCall = calls.find(([name]) => name === 'portals.update');
    assert(portalCall[6] === 0, 'Title portal stepping must keep the non-gameplay run clock at zero');
  });

  await runner.run('attract loop stays deterministic and mutates only the named title portal', async () => {
    const titlePortal = { id: 'title-rift', alive: true, opacity: 1 };
    const otherPortal = { id: 'other', alive: true, opacity: 0.75 };
    const title = new TitleScenePresentation({
      fluid: {},
      wellSystem: {},
      starSystem: {},
      wreckSystem: {},
      portalSystem: { portals: [titlePortal, otherPortal] },
      planetoidSystem: {},
      combatSystem: {},
      waveRings: {},
    });

    const decay = sampleTitleAttractState(7.5);
    assert(decay.story === 'rift aperture decay' && decay.role === 'anomaly', 'Expected existing decay copy and role');
    assert(decay.portalAlpha === 0, `Expected the rift collapsed at 7.5s, got ${decay.portalAlpha}`);
    assert(title.applyAttractState({ portalId: 'title-rift', loopTime: 7.5 }), 'Expected named title portal update');
    assert(titlePortal.opacity === 0 && titlePortal.alive === false, 'Expected title rift to blink out at collapse');
    assert(otherPortal.opacity === 0.75 && otherPortal.alive === true, 'Unrelated portals must remain unchanged');

    const restored = sampleTitleAttractState(10.6);
    assert(restored.portalAlpha === 1 && restored.story === 'wake scan nominal', 'Expected existing attract-loop return');
    title.applyAttractState({ portalId: 'title-rift', loopTime: 10.6 });
    assert(titlePortal.opacity === 1 && titlePortal.alive === true, 'Expected title rift to return');
  });

  await runner.run('main routes title separately and labels the remaining local sim honestly', async () => {
    const main = fs.readFileSync(path.join(ROOT, 'src/main.js'), 'utf8');
    const localCore = fs.readFileSync(path.join(ROOT, 'src/sim/sim-core.js'), 'utf8');
    assert(main.includes("gamePhase === 'title' && !rendererFixtureActive")
      && main.includes('titleScenePresentation.update({ frameDt: dt, totalTime, camX, camY })'),
    'Title must use the presentation-only owner in the existing frame loop');
    assert(main.includes('legacyLocalSimCore.update(simState')
      && localCore.includes('export class LocalSandboxSimCore'),
    'Remaining local gameplay fallback must be explicitly named');
    assert(!localCore.includes("gamePhase === 'title'"), 'Local sandbox owner must not regain title phase knowledge');
  });

  process.exit(runner.summary() ? 0 : 1);
}

run().catch((error) => {
  console.error('Title scene presentation test fatal error:', error);
  process.exit(1);
});
