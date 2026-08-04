const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { pathToFileURL } = require('url');

const ROOT = path.resolve(__dirname, '..');

(async () => {
  const palette = await import(pathToFileURL(path.join(ROOT, 'src/ui/palette-tokens.js')).href);
  const tokens = await import(pathToFileURL(path.join(ROOT, 'src/ui/design-tokens.js')).href);
  const presentation = await import(pathToFileURL(path.join(ROOT, 'src/presentation/presentation-style.js')).href);
  const generator = require('../scripts/generate-ui-token-css.cjs');

  assert.deepStrictEqual(palette.UI_PALETTE, {
    void: '#000021', field: '#000421', panelFill: 'rgba(0, 2, 10, 0.78)',
    panelBacking: 'rgba(0, 0, 8, 0.56)', iconBacking: 'rgba(0, 0, 8, 0.68)',
    structure: 'rgba(0, 226, 255, 0.32)', textPrimaryBase: '#EAF7FF',
    textPrimary: 'rgba(234, 247, 255, 0.94)', textMutedBase: '#9AB4CE', textMuted: 'rgba(154, 180, 206, 0.72)',
    bone: '#FFF4DA', route: '#00E2FF', value: '#FFB938', danger: '#FF3336',
    inhibitor: '#FF3EB5', anomaly: '#B84CFF', ecology: '#38F58A',
  }, 'Canonical palette drifted from UI Style Guide v1');

  assert.strictEqual(presentation.PRESENTATION_PALETTE.routeCyan, 0x00e2ff);
  assert.strictEqual(presentation.PRESENTATION_PALETTE.routeAmber, 0xffb938);
  assert.strictEqual(presentation.PRESENTATION_PALETTE.threatRed, 0xff3336);
  assert.strictEqual(presentation.PRESENTATION_PALETTE.inhibitorMagenta, 0xff3eb5);
  assert.strictEqual(presentation.PRESENTATION_PALETTE.anomalyMagenta, 0xb84cff);
  assert.strictEqual(presentation.PRESENTATION_PALETTE.ecologyGreen, 0x38f58a);
  const canonicalNumbers = new Set([
    palette.UI_PALETTE.void, palette.UI_PALETTE.field, palette.UI_PALETTE.textPrimaryBase,
    palette.UI_PALETTE.textMutedBase, palette.UI_PALETTE.bone, palette.UI_PALETTE.route,
    palette.UI_PALETTE.value, palette.UI_PALETTE.danger, palette.UI_PALETTE.inhibitor,
    palette.UI_PALETTE.anomaly, palette.UI_PALETTE.ecology,
  ].map(palette.colorAsNumber));
  assert(Object.values(presentation.PRESENTATION_PALETTE).every((color) => canonicalNumbers.has(color)),
    'Three presentation palette still owns a non-canonical hue');
  assert.strictEqual(tokens.UI_TIERS.unique, 'rgba(255, 185, 56, 0.95)');

  const cssPath = path.join(ROOT, 'src/ui/design-tokens.css');
  assert.strictEqual(fs.readFileSync(cssPath, 'utf8'), await generator.renderUiTokenCss(), 'Generated CSS drifted from JS tokens');
  const index = fs.readFileSync(path.join(ROOT, 'index-a.html'), 'utf8');
  assert(index.includes('href="src/ui/design-tokens.css"'));
  assert(!index.includes('--lbh-void:'), 'Entrypoint still owns a copied palette');
  assert(!fs.readFileSync(path.join(ROOT, 'scripts/build-visual-assets.cjs'), 'utf8').includes("'#dcecff'"), 'Asset builder still owns a copied tier palette');
  assert(fs.readFileSync(path.join(ROOT, 'scripts/build-visual-assets.cjs'), 'utf8').includes('UI_PALETTE.textPrimaryBase, UI_PALETTE.ecology, UI_PALETTE.route, UI_PALETTE.value'),
    'Asset builder tier adapter drifted from canonical roles');
  assert(![...fs.readFileSync(cssPath, 'utf8'), JSON.stringify(tokens.UI_TIERS)].join('').toLowerCase().includes('255,215,0'), 'Banned gold returned');
  const tokenAdapterSource = fs.readFileSync(path.join(ROOT, 'src/ui/design-tokens.js'), 'utf8');
  assert(!tokenAdapterSource.match(/#[0-9a-f]{3,8}|rgba?\(\s*\d/i),
    'Design-token adapters must derive colors from palette-tokens.js');

  console.log('UIDesignTokens: canonical JS, Three adapters, generated CSS, and asset tier consumers agree.');
})().catch((error) => {
  console.error(error.stack || error.message);
  process.exit(1);
});
