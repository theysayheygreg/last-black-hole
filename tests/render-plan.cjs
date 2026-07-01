const path = require('path');
const { pathToFileURL } = require('url');
const { TestRunner, assert } = require('./helpers.cjs');

const ROOT = path.resolve(__dirname, '..');

async function importModule(rel) {
  return import(pathToFileURL(path.join(ROOT, rel)).href);
}

function collectIds(items, label) {
  const ids = items.map((item) => item.id);
  assert(ids.length === new Set(ids).size, `${label} ids must be unique`);
  return ids;
}

function walkKeys(value, visitor, pathLabel = 'root') {
  if (Array.isArray(value)) {
    value.forEach((entry, index) => walkKeys(entry, visitor, `${pathLabel}[${index}]`));
    return;
  }
  if (!value || typeof value !== 'object') return;
  for (const key of Object.keys(value)) {
    visitor(key, `${pathLabel}.${key}`);
    walkKeys(value[key], visitor, `${pathLabel}.${key}`);
  }
}

function assertNoGameplayOwnershipFields(label, value) {
  const forbidden = new Set([
    'gameplay',
    'gameplayState',
    'gameplayOwner',
    'owner',
    'owns',
    'authority',
    'authoritative',
    'simBody',
    'body',
    'position',
    'velocity',
    'radius',
    'mass',
    'collision',
    'damage',
    'health',
    'pickup',
    'extraction',
    'death',
  ]);
  walkKeys(value, (key, pathLabel) => {
    assert(!forbidden.has(key), `${label} must not declare gameplay ownership field ${pathLabel}`);
  });
}

function assertThrows(fn, pattern, message) {
  let thrown = null;
  try {
    fn();
  } catch (err) {
    thrown = err;
  }
  assert(thrown, message);
  assert(pattern.test(String(thrown.message || thrown)), `${message}: ${thrown.message || thrown}`);
}

async function run() {
  const runner = new TestRunner('RenderPlan');
  const renderPlan = await importModule('src/render-three/render-plan.js');
  const materials = await importModule('src/render-three/material-registry.js');
  const hints = await importModule('src/render-three/renderable-hints.js');

  await runner.run('Render plan descriptor exposes required pass contract fields', async () => {
    const descriptor = renderPlan.RENDER_PLAN_DESCRIPTOR;
    assert(descriptor.id, 'Render plan descriptor needs an id');
    assert(descriptor.defaultQualityTier, 'Render plan descriptor needs a default quality tier');
    assert(descriptor.budgetTarget?.fps === 60, 'Render plan descriptor should declare a 60fps target');
    assert(descriptor.fixturePolicy?.productTruth === 'finalAscii', 'Render plan descriptor should keep final ASCII as product truth');
    assert(descriptor.capturePolicy?.canonicalSurface === 'asciiComposite', 'Render plan descriptor should declare canonical capture surface');
    assert(descriptor.debugView?.default === 'finalAscii', 'Render plan descriptor should declare a default debug view');
    assert(Array.isArray(descriptor.deckCaveats) && descriptor.deckCaveats.length > 0, 'Render plan descriptor needs Deck caveats');

    const ids = collectIds(descriptor.passes, 'Render pass');
    for (const required of renderPlan.RENDER_PLAN_PASS_IDS) {
      assert(ids.includes(required), `Render plan missing pass ${required}`);
    }
    for (const pass of descriptor.passes) {
      assert(pass.name, `${pass.id} pass missing name`);
      assert(Array.isArray(pass.inputs) && pass.inputs.length > 0, `${pass.id} pass missing inputs`);
      assert(Array.isArray(pass.outputs) && pass.outputs.length > 0, `${pass.id} pass missing outputs`);
      assert(renderPlan.RENDER_QUALITY_TIERS.includes(pass.qualityTier), `${pass.id} pass has invalid quality tier`);
      assert(pass.fixturePolicy, `${pass.id} pass missing fixture policy`);
      assert(pass.capturePolicy, `${pass.id} pass missing capture policy`);
      assert(pass.debugView, `${pass.id} pass missing debug view`);
      assert(Number.isFinite(pass.budgetTarget?.defaultMs), `${pass.id} pass missing default budget`);
      assert(Number.isFinite(pass.budgetTarget?.deckMs), `${pass.id} pass missing Deck budget`);
      assert(Array.isArray(pass.deckCaveats), `${pass.id} pass missing Deck caveats`);
    }
  });

  await runner.run('Material registry exposes required unique families with quality defaults', async () => {
    const familyIds = collectIds(materials.MATERIAL_FAMILIES, 'Material family');
    for (const required of materials.REQUIRED_MATERIAL_FAMILY_IDS) {
      assert(familyIds.includes(required), `Material registry missing family ${required}`);
      assert(materials.hasMaterialFamily(required), `Material lookup failed for ${required}`);
    }
    for (const family of materials.MATERIAL_FAMILIES) {
      assert(materials.MATERIAL_QUALITY_TIERS.includes(family.defaultQualityTier), `${family.id} has invalid default quality tier`);
      assert(materials.MATERIAL_QUALITY_TIERS.includes(family.minimumQualityTier), `${family.id} has invalid minimum quality tier`);
      assert(materials.MATERIAL_QUALITY_TIERS.includes(family.captureQualityTier), `${family.id} has invalid capture quality tier`);
      assert(family.defaults?.paletteRole, `${family.id} missing palette role default`);
      assert(family.defaults?.blendMode, `${family.id} missing blend mode default`);
      assert(family.budgetClass, `${family.id} missing budget class`);
    }
  });

  await runner.run('Renderable hints validate required visual fields', async () => {
    for (const required of hints.RENDERABLE_HINT_REQUIRED_FIELDS) {
      assert(hints.RENDERABLE_HINT_SCHEMA.requiredFields.includes(required), `Hint schema missing ${required}`);
      assert(hints.RENDERABLE_HINT_SCHEMA.fields[required], `Hint schema fields missing ${required}`);
    }
    const hint = hints.makeRenderableHint({
      category: 'player',
      roleColor: 'playerCyan',
      mattePolicy: 'coreContact',
      vfxFamily: 'thrusterWake',
      labelPolicy: 'deckOff',
      priority: 'critical',
      cullingLane: 'nearField',
      materialFamily: 'shipContactMatte',
    });
    assert(hint.category === 'player', 'Renderable hint should preserve category');
    assert(hints.validateRenderableHint(hint) === true, 'Renderable hint should validate');
    assertThrows(
      () => hints.makeRenderableHint({ category: 'player', materialFamily: 'missingFamily' }),
      /Unknown renderable hint materialFamily/,
      'Unknown material family should fail validation'
    );
  });

  await runner.run('Renderer contracts do not declare gameplay ownership fields', async () => {
    assertNoGameplayOwnershipFields('Render plan descriptor', renderPlan.RENDER_PLAN_DESCRIPTOR);
    assertNoGameplayOwnershipFields('Material registry', materials.MATERIAL_FAMILIES);
    assertNoGameplayOwnershipFields('Renderable hint schema', hints.RENDERABLE_HINT_SCHEMA);
    assertNoGameplayOwnershipFields('Renderable hint defaults', hints.RENDERABLE_HINT_DEFAULTS);
    assertNoGameplayOwnershipFields('Renderable hint sample', hints.makeRenderableHint());
  });

  const ok = runner.summary();
  process.exit(ok ? 0 : 1);
}

run().catch((err) => {
  console.error('Render plan test fatal error:', err);
  process.exit(1);
});
