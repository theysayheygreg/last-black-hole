/** Focused pure contracts for the v0.3 Map Select survey terminal. */

const assert = require('assert');
const { pathToFileURL } = require('url');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');

async function run() {
  const survey = await import(pathToFileURL(path.join(ROOT, 'src/ui/map-select-survey.js')).href);
  const layout = await import(pathToFileURL(path.join(ROOT, 'src/ui/layout-contract.js')).href);
  const tokens = await import(pathToFileURL(path.join(ROOT, 'src/ui/design-tokens.js')).href);
  const mapLoader = await import(pathToFileURL(path.join(ROOT, 'src/maps/playable-map-loader.js')).href);
  const mapScales = await import(pathToFileURL(path.join(ROOT, 'src/content/map-scales.js')).href);
  const maps = mapLoader.PLAYABLE_MAPS.map(({ map }) => ({ MAP: map }));

  const briefing = { signature: { id: 'test-signal', name: 'Test Signal' } };
  const previews = maps.map(({ MAP }, index) => survey.buildSurveyPreview(MAP, briefing, 1000 + index));
  const [shallows, expanse, deep] = previews;

  assert.deepStrictEqual(Object.keys(shallows).sort(), survey.surveySchemaKeys().sort(), 'descriptor schema drifted');
  for (const preview of previews) {
    assert.deepStrictEqual(survey.surveyPreviewForbiddenFields(preview), [], 'sanitized descriptor contains forbidden fields');
    assert(!JSON.stringify(preview).toLowerCase().match(/route|path|spawn|portal|exact|coordinate|position/), 'player descriptor leaked exact-layout vocabulary');
  }
  const sanitized = survey.sanitizeSurveyPreview({
    ...shallows,
    route: { stages: [{ anchor: { x: 1 } }] },
    coarseRegions: [{ route: 'discard me', gridX: 1, gridY: 1, width: 2, height: 2 }],
  });
  assert.deepStrictEqual(survey.surveyPreviewForbiddenFields(sanitized), [], 'whitelist sanitizer retained forbidden nested data');
  assert.throws(() => survey.assertSurveyPreviewSafe({ nested: { spawn: { x: 1 } } }), /forbidden fields/, 'recursive forbidden-field guard did not reject spawn');

  const sameA = survey.buildSurveyPreview(maps[1].MAP, briefing, 42);
  const sameB = survey.buildSurveyPreview(maps[1].MAP, briefing, 42);
  const different = survey.buildSurveyPreview(maps[1].MAP, briefing, 43);
  assert.deepStrictEqual(sameA, sameB, 'same seed must produce a stable preview');
  assert.notDeepStrictEqual(sameA.coarseRegions, different.coarseRegions, 'different seed did not vary coarse topology');

  assert.strictEqual(shallows.scale.label, '5x5', 'Shallows survey scale must be 5x5');
  assert.strictEqual(expanse.scale.label, '15x15', 'Expanse survey scale must be 15x15');
  assert.strictEqual(deep.scale.label, '25x25', 'Deep Field survey scale must be 25x25');
  assert(shallows.scale.cells < expanse.scale.cells && expanse.scale.cells < deep.scale.cells, 'survey scale classes must be ordered');
  assert(shallows.coarseRegions.length < deep.coarseRegions.length, 'scale classes should visibly distinguish topology density');
  assert(shallows.aggregateRanges.gravityWells.max > 0 && deep.aggregateRanges.derelictFields.max >= shallows.aggregateRanges.derelictFields.max,
    'survey contents must be derived from canonical map populations');

  for (const [index, mapId] of mapScales.PLAYABLE_MAP_IDS.entries()) {
    const canonical = mapScales.MAP_SCALE_REGISTRY[mapId];
    const resolved = survey.resolveSurveyPresentation(mapId);
    const scale = survey.resolveSurveyScalePresentation(mapId);
    const preview = previews[index];
    assert.strictEqual(resolved.source, 'canonical', `${mapId}: survey descriptor must resolve canonically`);
    assert.strictEqual(scale.source, 'canonical', `${mapId}: scale descriptor must resolve canonically`);
    assert.deepStrictEqual(
      { cells: resolved.scale.cells, label: resolved.scale.label, band: resolved.scale.band },
      { cells: canonical.dimensions.width, label: `${canonical.dimensions.width}x${canonical.dimensions.height}`, band: canonical.survey.scaleBand },
      `${mapId}: scale presentation drifted from canonical dimensions`,
    );
    assert.strictEqual(resolved.riskBand, canonical.survey.riskBand, `${mapId}: risk presentation drifted`);
    assert.deepStrictEqual(resolved.topology, canonical.survey.topology, `${mapId}: topology presentation drifted`);
    assert.strictEqual(resolved.description, canonical.survey.description, `${mapId}: survey description drifted`);
    assert.deepStrictEqual(
      resolved.contents.map(({ id, label, description, role, rangeKey }) => ({ id, label, description, role, rangeKey })),
      canonical.survey.contents,
      `${mapId}: visible content descriptions drifted`,
    );
    assert.strictEqual(preview.description, canonical.survey.description, `${mapId}: sanitized preview lost canonical description`);
    assert.deepStrictEqual(
      preview.possibleContactFamilies.map(({ id, label, description, role }) => ({ id, label, description, role })),
      canonical.survey.contents.map(({ id, label, description, role }) => ({ id, label, description, role })),
      `${mapId}: sanitized preview content copy drifted`,
    );
  }

  const valid = survey.buildValidSurveySelection({ id: 'expanse', map: maps[1].MAP }, briefing, 42);
  const locked = survey.buildLockedSurveySelection({ id: 'sector-04', label: 'SECTOR 04', status: 'UNRESOLVED' });
  assert.strictEqual(valid.state, 'valid');
  assert(valid.surveyPreview && valid.surveyPreview.scale.label === '15x15', 'valid selection must expose sanitized survey preview');
  assert.strictEqual(locked.state, 'locked');
  assert.strictEqual(locked.surveyPreview, null, 'locked selection must not preview hidden layout');
  assert.strictEqual(locked.entry.available, false);

  const surface = layout.mapSelectSurfaceLayout(960, 720, 960, 6);
  assert(surface.rows.length === 6, 'Map Select must contain six destination rows');
  for (const row of surface.rows) assert(layout.rectContains(surface.left, row, surface.pad), 'destination row escaped left panel');
  assert(surface.rows.every((row, index) => !surface.rows.some((other, otherIndex) => index !== otherIndex && layout.rectsOverlap(row, other, 0))), 'destination rows overlap');
  assert(surface.rows.every((row) => !layout.rectsOverlap(row, surface.footer, 0)), 'destination rows overlap footer');
  assert(layout.rectContains(surface.right, surface.command, surface.pad), 'command escaped right panel');
  assert(layout.rectContains(surface.right, surface.briefStatus.scale, surface.pad), 'scale status escaped briefing panel');
  assert(layout.rectContains(surface.right, surface.briefStatus.risk, surface.pad), 'risk status escaped briefing panel');
  assert(!layout.rectsOverlap(surface.briefStatus.scale, surface.briefStatus.risk, 0), 'briefing status pills overlap');
  const glyph = {
    x: surface.command.x + tokens.UI_DECK_GEOMETRY.button.paddingX,
    y: surface.command.y + surface.command.h + tokens.UI_DECK_GEOMETRY.button.gap,
    w: surface.command.w - tokens.UI_DECK_GEOMETRY.button.paddingX * 2,
    h: tokens.UI_DECK_GEOMETRY.actionGlyph.minHeight,
  };
  assert(layout.rectContains(surface.right, glyph), 'controller glyph escaped right panel');
  assert(!layout.rectsOverlap(surface.left, surface.center, 0) && !layout.rectsOverlap(surface.center, surface.right, 0), 'three panels overlap');

  console.log('MapSelectSurvey: canonical metadata, schema, seed, state, scale, and layout assertions passed for all 3 maps.');
}

run().catch((error) => {
  console.error(error.stack || error.message);
  process.exit(1);
});
