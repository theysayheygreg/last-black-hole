const path = require('path');
const { pathToFileURL } = require('url');
const { TestRunner, assert } = require('./helpers.cjs');

const ROOT = path.resolve(__dirname, '..');

async function run() {
  const runner = new TestRunner('EntityPresentationScale');
  const scale = await import(pathToFileURL(path.join(ROOT, 'src/render-three/entity-presentation-scale.js')).href);

  await runner.run('Deck minima are centralized while authority radii pass through unchanged', async () => {
    const cases = [
      ['stars', {}, 0.6],
      ['portals', { visualState: 'rift' }, 0.144],
      ['wrecks', { visualState: 'valuable', size: 'large' }, 0.08],
      ['player', { hull: { type: 'breacher' } }, 0.035],
      ['scavengers', { variant: 'drifter' }, 0.04],
      ['inhibitors', { kind: 'glitch' }, 0.045],
      ['inhibitors', { kind: 'swarm' }, 0.09],
      ['inhibitors', { kind: 'vessel' }, 0.075],
    ];
    for (const [family, entity, authorityRadius] of cases) {
      const result = scale.resolveEntityPresentationScale({
        family,
        entity,
        authorityRadius,
        camera: { x: 1.5, y: 1.5 },
        cameraView: 3,
        canvasHeight: 720,
      });
      assert(result.pixelRadius >= result.minPx, `${family} fell below Deck minimum`);
      assert(result.pixelRadius <= result.maxPx, `${family} exceeded its bounded maximum`);
      assert(result.authorityRadius === authorityRadius, `${family} authority radius was changed`);
    }
  });

  await runner.run('Distance scaling is bounded and preserves the hierarchy', async () => {
    const near = (family, entity = {}) => scale.resolveEntityPresentationScale({
      family, entity, cameraDistance: 0, cameraView: 3, canvasHeight: 720,
    });
    const far = (family, entity = {}) => scale.resolveEntityPresentationScale({
      family, entity, cameraDistance: 3, cameraView: 3, canvasHeight: 720,
    });
    const landmark = near('portals', { visualState: 'rift' });
    const objective = near('wrecks', { visualState: 'valuable', size: 'large' });
    const ship = near('scavengers', { variant: 'drifter' });
    const debris = near('wrecks', { visualState: 'looted', size: 'scattered' });
    assert(landmark.pixelRadius > objective.pixelRadius, 'Landmark must outrank large objective');
    assert(objective.pixelRadius > ship.pixelRadius, 'Large objective must outrank ship');
    assert(ship.pixelRadius > debris.pixelRadius, 'Ship must outrank debris');
    assert(far('portals', { visualState: 'rift' }).pixelRadius >= landmark.minPx, 'Far landmark lost its minimum');
    assert(far('portals', { visualState: 'rift' }).pixelRadius <= landmark.pixelRadius, 'Distance scale grew a landmark');
    assert(far('portals', { visualState: 'rift' }).distanceScale >= scale.PRESENTATION_DISTANCE_FLOOR,
      'Distance scale fell below the bounded floor');
  });

  console.log(JSON.stringify({
    hierarchy: ['rift portal', 'valuable large wreck', 'scavenger drifter', 'looted debris'],
    minima: Object.fromEntries(Object.entries(scale.ENTITY_PRESENTATION_SCALE).map(([family, specs]) => [
      family, Object.fromEntries(Object.entries(specs).map(([key, value]) => [key, value.minPx])),
    ])),
  }));
}

run().catch((error) => {
  console.error(error.stack || error);
  process.exitCode = 1;
});
