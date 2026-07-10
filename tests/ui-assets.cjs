const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { pathToFileURL } = require('url');

const ROOT = path.resolve(__dirname, '..');
const MANIFEST = JSON.parse(fs.readFileSync(path.join(ROOT, 'assets', 'visual', 'manifest.json'), 'utf8'));

class FakeImage {
  set src(value) {
    this._src = value;
    queueMicrotask(() => this.onload?.());
  }
  get src() { return this._src; }
}

function recordingContext() {
  const calls = [];
  return {
    calls,
    save: () => calls.push(['save']),
    restore: () => calls.push(['restore']),
    fillRect: (...args) => calls.push(['fillRect', ...args]),
    strokeRect: (...args) => calls.push(['strokeRect', ...args]),
    drawImage: (...args) => calls.push(['drawImage', ...args]),
    set fillStyle(value) { calls.push(['fillStyle', value]); },
    set strokeStyle(value) { calls.push(['strokeStyle', value]); },
    set lineWidth(value) { calls.push(['lineWidth', value]); },
    set globalAlpha(value) { calls.push(['globalAlpha', value]); },
    set imageSmoothingEnabled(value) { calls.push(['imageSmoothingEnabled', value]); },
    set shadowColor(value) { calls.push(['shadowColor', value]); },
    set shadowBlur(value) { calls.push(['shadowBlur', value]); },
    set shadowOffsetX(value) { calls.push(['shadowOffsetX', value]); },
    set shadowOffsetY(value) { calls.push(['shadowOffsetY', value]); },
  };
}

async function run() {
  const mod = await import(pathToFileURL(path.join(ROOT, 'src', 'ui', 'asset-kit.js')).href);
  const fetchImpl = async () => ({ ok: true, json: async () => MANIFEST });
  mod.resetAssetKitForTest();

  assert.match(MANIFEST.sourceDigest, /^[a-f0-9]{64}$/,
    'Generated manifest must identify its source atlases without a wall-clock timestamp');
  assert.strictEqual(Object.hasOwn(MANIFEST, 'generatedAt'), false,
    'Generated manifest should be reproducible across identical asset builds');
  assert.strictEqual(Object.keys(MANIFEST.items).length, 67, 'Expected complete generated item catalog');
  for (const [catalogId, family] of Object.entries({
    'shield-cell': 'shield-cell',
    'foam-anchor': 'shield-cell',
    'time-dilator': 'time-dilator',
    'dead-air-ampoule': 'time-dilator',
    'breach-flare': 'breach-flare',
    'crown-breach-match': 'breach-flare',
    'fuel-cell': 'fuel-cell',
    'plasma-cell': 'fuel-cell',
    'antimatter-cell': 'fuel-cell',
  })) {
    assert.strictEqual(MANIFEST.items[catalogId]?.family, family,
      `${catalogId} should use its dedicated consumable icon family`);
  }
  for (const [catalogId, entry] of Object.entries(MANIFEST.items)) {
    assert.strictEqual(path.basename(entry.file, '.png'), catalogId, `Catalog path drift for ${catalogId}`);
    assert(fs.existsSync(path.join(ROOT, entry.file)), `Missing icon for ${catalogId}`);
  }
  for (const file of MANIFEST.atlases.ui) assert(fs.existsSync(path.join(ROOT, file)), `Missing frame segment ${file}`);

  const manifest = await mod.loadVisualManifest({ fetchImpl });
  const stableItem = { id: 'runtime_999_random', catalogId: 'event-horizon-keel', tier: 4 };
  const descriptor = mod.itemAssetDescriptor(stableItem, manifest);
  assert.strictEqual(descriptor.catalogId, 'event-horizon-keel');
  assert(descriptor.url.endsWith('/assets/visual/items/event-horizon-keel.png'));
  assert.strictEqual(mod.itemAssetDescriptor({ id: 'event-horizon-keel' }, manifest), null,
    'Transient runtime ids must not resolve visual assets');
  assert.strictEqual(mod.itemAssetDescriptor('../event-horizon-keel', manifest), null, 'Unsafe catalog id resolved');

  const first = mod.loadItemIcon(stableItem, { manifest, ImageCtor: FakeImage });
  const second = mod.loadItemIcon('event-horizon-keel', { manifest, ImageCtor: FakeImage });
  assert.strictEqual(first, second, 'Pending item loads should be cached by catalogId');
  assert.strictEqual(await first, await second, 'Catalog cache should reuse one Image per stable id');

  const markup = mod.itemIconMarkup(stableItem, { state: 'equipped', selected: true });
  assert(markup.includes('data-catalog-id="event-horizon-keel"'));
  assert(markup.includes('data-tier="unique"'));
  assert(markup.includes('inv-icon-equipped is-selected'));
  assert(!markup.includes(stableItem.id), 'Runtime id leaked into icon markup');

  await mod.preloadUiAssets({ manifest, ImageCtor: FakeImage });
  const frameCtx = recordingContext();
  assert.strictEqual(mod.drawGeneratedFrame(frameCtx, { x: 10, y: 20, w: 300, h: 160 }), true);
  assert.strictEqual(frameCtx.calls.filter((call) => call[0] === 'drawImage').length, 8,
    'Frame should compose four rails and four corners');

  const iconCtx = recordingContext();
  assert.strictEqual(mod.drawItemIcon(iconCtx, stableItem, { x: 0, y: 0, w: 48, h: 48 }, {
    state: 'equipped', selected: true,
  }), true);
  assert(iconCtx.calls.some((call) => call[0] === 'strokeStyle' && String(call[1]).includes('0, 226, 255')),
    'Selected icon should retain cyan semantic treatment');
  assert(iconCtx.calls.filter((call) => call[0] === 'fillRect').length >= 2,
    'Icon should include backing and equipped-state rail');

  console.log('UIAssets: 10 passed, 0 failed');
}

run().catch((error) => {
  console.error(error.stack || error.message);
  process.exit(1);
});
