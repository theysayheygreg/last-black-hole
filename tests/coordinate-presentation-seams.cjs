const path = require('path');
const { pathToFileURL } = require('url');
const { TestRunner, assert } = require('./helpers.cjs');

const ROOT = path.resolve(__dirname, '..');

async function importModule(relativePath) {
  return import(pathToFileURL(path.join(ROOT, relativePath)).href);
}

function near(actual, expected, message, epsilon = 1e-9) {
  assert(Math.abs(actual - expected) <= epsilon, `${message}: expected ${expected}, got ${actual}`);
}

async function run() {
  const runner = new TestRunner('CoordinatePresentationSeams');
  const coords = await importModule('src/coords.js');
  const { ScavengerSystem } = await importModule('src/scavengers.js');
  const { createWorldProjection, scenePointToViewport } = await importModule('src/render-three/world-projection.js');
  const { makeCategoryAnnotationPlan } = await importModule('src/render-three/annotations/category-grammar.js');
  const { createPresentationFrame } = await importModule('src/presentation/presentation-frame.js');
  const { resolveVesselTargetTell } = await importModule('src/render-three/world-scene-presentation.js');

  await runner.run('local scavenger death spiral keeps the consumed well across a world seam', () => {
    const priorWorldScale = coords.WORLD_SCALE;
    coords.setWorldScale(5);
    try {
      const system = new ScavengerSystem();
      const scavenger = system.spawn(4.9, 2, 'drifter');
      system._checkWellDeath(scavenger, { wells: [{ id: 'seam-well', wx: 0.1, wy: 2, killRadius: 0.3 }] });
      near(Math.abs(scavenger.deathAngle), Math.PI, 'Seam death angle must point from the well toward the wrapped start');
      system._updateDeathSpiral(scavenger, 0.05);
      assert(scavenger.wx > 4.8,
        `Spiral must remain on the scavenger's wrapped side of the well, got x=${scavenger.wx}`);
    } finally {
      coords.setWorldScale(priorWorldScale);
    }
  });

  await runner.run('grapple annotation uses the canonical short wrapped projection', () => {
    const projection = createWorldProjection({ x: 0.1, y: 1, worldScale: 5, view: 3 }, 1.6);
    const player = scenePointToViewport(projection.project(0.1, 1), 1280, 800, 1.6);
    const anchor = scenePointToViewport(projection.project(4.9, 1), 1280, 800, 1.6);
    assert(Math.abs(anchor.x - player.x) < 100,
      `Wrapped grapple anchor must remain near the pilot, got ${anchor.x - player.x}px`);
    const plan = makeCategoryAnnotationPlan('grapple', { extentPx: 92, attached: true, viewportClass: 'deck' });
    assert(plan.metadata.attached === true && plan.pieces.some((piece) => piece.kind === 'line'),
      'Attached grapple grammar must contain the shared tether primitive');
  });

  await runner.run('Vessel target tells use normalized coordinates and omit incomplete rows', () => {
    const frame = createPresentationFrame({
      scene: {
        inhibitors: [
          {
            id: 'vessel-seam', kind: 'vessel', wx: 4.9, wy: 2,
            target: { clientId: 'pilot', wx: 0.1, wy: 2 },
          },
          { id: 'invalid-world-row', kind: 'glitch', wx: Number.NaN, wy: 2 },
          {
            id: 'incomplete-tell', kind: 'vessel', wx: 1, wy: 1,
            target: { clientId: 'pilot', wx: Number.NaN, wy: 2 },
            lastHeard: { wx: 2, wy: Number.NaN },
          },
        ],
      },
    });
    assert(frame.world.inhibitors.length === 2,
      'Rows without a finite world position must not fabricate an origin sprite');
    const vessel = frame.world.inhibitors.find((entity) => entity.id === 'vessel-seam');
    assert(vessel && vessel.target?.x === 0.1 && vessel.target?.y === 2,
      `Vessel target must cross the frame as normalized x/y: ${JSON.stringify(vessel?.target)}`);
    const endpoint = resolveVesselTargetTell(vessel, 5);
    near(endpoint.x, 5.1, 'Vessel target tell endpoint must cross the nearest seam');
    near(endpoint.y, 2, 'Vessel target tell endpoint y');
    const incomplete = frame.world.inhibitors.find((entity) => entity.id === 'incomplete-tell');
    assert(incomplete.target === null && incomplete.lastHeard === null,
      'Incomplete optional world facts must be omitted instead of becoming origin tells');
    assert(resolveVesselTargetTell(incomplete, 5) === null,
      'A Vessel without an authoritative target must not draw a fabricated tell');
  });

  const ok = runner.summary();
  process.exit(ok ? 0 : 1);
}

run().catch((error) => {
  console.error(error.stack || error);
  process.exit(1);
});
