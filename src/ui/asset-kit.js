import { UI_COLORS, UI_SHADOWS, UI_TIERS } from './design-tokens.js';

const MANIFEST_URL = new URL('../../assets/visual/manifest.json', import.meta.url);
const ITEM_TIER_NAMES = ['common', 'common', 'uncommon', 'rare', 'unique'];
const FRAME_FILES = {
  topLeft: 'corner-top-left.png',
  topRight: 'corner-top-right.png',
  bottomLeft: 'corner-bottom-left.png',
  bottomRight: 'corner-bottom-right.png',
  top: 'rail-top.png',
  bottom: 'rail-bottom.png',
  left: 'rail-left.png',
  right: 'rail-right.png',
};

let manifestPromise = null;
let manifestCache = null;
const imagePromises = new Map();
const imageCache = new Map();
const itemImagePromises = new Map();
const itemImageCache = new Map();

function catalogIdOf(itemOrId) {
  if (typeof itemOrId === 'string') return itemOrId;
  return typeof itemOrId?.catalogId === 'string' ? itemOrId.catalogId : '';
}

function isStableCatalogId(value) {
  return /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value);
}

function assetUrl(file) {
  return new URL(`../../${file}`, import.meta.url).href;
}

function imageConstructor(options = {}) {
  return options.ImageCtor || globalThis.Image;
}

export async function loadVisualManifest(options = {}) {
  if (manifestCache) return manifestCache;
  if (manifestPromise) return manifestPromise;
  const fetchImpl = options.fetchImpl || globalThis.fetch;
  if (typeof fetchImpl !== 'function') throw new Error('Visual asset manifest requires fetch');

  manifestPromise = fetchImpl(MANIFEST_URL.href)
    .then((response) => {
      if (!response?.ok) throw new Error(`Visual asset manifest failed: ${response?.status || 'unknown'}`);
      return response.json();
    })
    .then((manifest) => {
      if (!manifest?.items || !Array.isArray(manifest?.atlases?.ui)) {
        throw new Error('Visual asset manifest is missing item or UI atlas entries');
      }
      manifestCache = manifest;
      return manifest;
    })
    .catch((error) => {
      manifestPromise = null;
      throw error;
    });
  return manifestPromise;
}

export function itemAssetDescriptor(itemOrId, manifest = manifestCache) {
  const catalogId = catalogIdOf(itemOrId);
  if (!isStableCatalogId(catalogId)) return null;
  const entry = manifest?.items?.[catalogId];
  if (!entry?.file) return null;
  return {
    catalogId,
    family: entry.family || 'unknown',
    tier: Number(entry.tier) || 1,
    consumable: Boolean(entry.consumable),
    url: assetUrl(entry.file),
  };
}

export async function loadImage(url, options = {}) {
  if (imageCache.has(url)) return imageCache.get(url);
  if (imagePromises.has(url)) return imagePromises.get(url);
  const ImageCtor = imageConstructor(options);
  if (typeof ImageCtor !== 'function') throw new Error('Visual assets require an Image constructor');

  const promise = new Promise((resolve, reject) => {
    const image = new ImageCtor();
    image.onload = () => {
      imageCache.set(url, image);
      resolve(image);
    };
    image.onerror = () => {
      imagePromises.delete(url);
      reject(new Error(`Visual asset failed to load: ${url}`));
    };
    image.src = url;
  });
  imagePromises.set(url, promise);
  return promise;
}

export function loadItemIcon(itemOrId, options = {}) {
  const catalogId = catalogIdOf(itemOrId);
  if (!isStableCatalogId(catalogId)) return Promise.resolve(null);
  if (itemImageCache.has(catalogId)) return Promise.resolve(itemImageCache.get(catalogId));
  if (itemImagePromises.has(catalogId)) return itemImagePromises.get(catalogId);
  const manifestPromise = options.manifest
    ? Promise.resolve(options.manifest)
    : loadVisualManifest(options);
  const promise = manifestPromise
    .then((manifest) => {
      const descriptor = itemAssetDescriptor(catalogId, manifest);
      return descriptor ? loadImage(descriptor.url, options) : null;
    })
    .then((image) => {
      if (image) itemImageCache.set(catalogId, image);
      return image;
    })
    .catch((error) => {
      itemImagePromises.delete(catalogId);
      throw error;
    });
  itemImagePromises.set(catalogId, promise);
  return promise;
}

export function getCachedItemIcon(itemOrId, manifest = manifestCache) {
  const descriptor = itemAssetDescriptor(itemOrId, manifest);
  return descriptor ? itemImageCache.get(descriptor.catalogId) || null : null;
}

export async function preloadUiAssets(options = {}) {
  const manifest = options.manifest || await loadVisualManifest(options);
  const urls = manifest.atlases.ui.map(assetUrl);
  await Promise.all(urls.map((url) => loadImage(url, options)));
  return manifest;
}

export async function preloadInventoryIcons(items, options = {}) {
  const manifest = options.manifest || await loadVisualManifest(options);
  const ids = new Set((items || []).map(catalogIdOf).filter(Boolean));
  await Promise.all([...ids].map((catalogId) => loadItemIcon(catalogId, { ...options, manifest })));
}

export function itemIconMarkup(item, { state = 'cargo', selected = false } = {}) {
  const descriptor = itemAssetDescriptor(item);
  if (!descriptor) return '<span class="inv-icon inv-icon-missing" aria-hidden="true"></span>';
  const tier = ITEM_TIER_NAMES[Math.max(1, Math.min(4, Number(item?.tier) || descriptor.tier))];
  const classes = ['inv-icon', `inv-icon-${state}`, selected ? 'is-selected' : ''].filter(Boolean).join(' ');
  return `<span class="${classes}" data-catalog-id="${descriptor.catalogId}" data-tier="${tier}" aria-hidden="true"><img src="${descriptor.url}" alt="" draggable="false"></span>`;
}

export function drawItemIcon(ctx, item, rect, {
  state = 'cargo',
  selected = false,
  disabled = false,
  alpha = 1,
} = {}) {
  const x = Number(rect?.x) || 0;
  const y = Number(rect?.y) || 0;
  const w = Math.max(1, Number(rect?.w ?? rect?.width) || 1);
  const h = Math.max(1, Number(rect?.h ?? rect?.height) || 1);
  const descriptor = itemAssetDescriptor(item);
  const image = descriptor ? itemImageCache.get(descriptor.catalogId) : null;
  const tierName = ITEM_TIER_NAMES[Math.max(1, Math.min(4, Number(item?.tier) || descriptor?.tier || 1))];
  const tierColor = UI_TIERS[tierName] || UI_COLORS.panelText;

  ctx.save();
  ctx.globalAlpha = disabled ? alpha * 0.38 : alpha;
  ctx.fillStyle = UI_COLORS.iconBacking;
  ctx.fillRect(x, y, w, h);
  ctx.strokeStyle = selected ? UI_COLORS.selectionBorder : tierColor;
  ctx.lineWidth = selected ? 2 : 1;
  ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
  if (image) {
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(image, x + 2, y + 2, w - 4, h - 4);
  } else if (descriptor) {
    void loadItemIcon(descriptor.catalogId).catch(() => {});
  }
  if (state === 'equipped') {
    ctx.fillStyle = UI_COLORS.signal;
    ctx.fillRect(x + w - 5, y + 2, 3, Math.max(4, h - 4));
  } else if (state === 'consumable') {
    ctx.fillStyle = UI_COLORS.salvage;
    ctx.fillRect(x + 2, y + h - 5, Math.max(4, w - 4), 3);
  }
  ctx.restore();
  return Boolean(image);
}

export function drawGeneratedFrame(ctx, rect, { alpha = 1, segmentSize = 32 } = {}) {
  const x = Number(rect?.x) || 0;
  const y = Number(rect?.y) || 0;
  const w = Math.max(0, Number(rect?.w ?? rect?.width) || 0);
  const h = Math.max(0, Number(rect?.h ?? rect?.height) || 0);
  const size = Math.max(12, Math.min(Number(segmentSize) || 32, w / 3, h / 3));
  const urls = Object.fromEntries(Object.entries(FRAME_FILES).map(([key, file]) => [key, assetUrl(`assets/visual/ui/${file}`)]));
  const images = Object.fromEntries(Object.entries(urls).map(([key, url]) => [key, imageCache.get(url)]));
  if (Object.values(images).some((image) => !image) || w <= 0 || h <= 0) {
    void preloadUiAssets().catch(() => {});
    return false;
  }

  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.drawImage(images.top, x + size, y, Math.max(1, w - size * 2), size);
  ctx.drawImage(images.bottom, x + size, y + h - size, Math.max(1, w - size * 2), size);
  ctx.drawImage(images.left, x, y + size, size, Math.max(1, h - size * 2));
  ctx.drawImage(images.right, x + w - size, y + size, size, Math.max(1, h - size * 2));
  ctx.drawImage(images.topLeft, x, y, size, size);
  ctx.drawImage(images.topRight, x + w - size, y, size, size);
  ctx.drawImage(images.bottomLeft, x, y + h - size, size, size);
  ctx.drawImage(images.bottomRight, x + w - size, y + h - size, size, size);
  ctx.restore();
  return true;
}

export function applyCanvasTextShadow(ctx) {
  ctx.shadowColor = UI_SHADOWS.canvasTextColor;
  ctx.shadowBlur = UI_SHADOWS.canvasTextBlur;
  ctx.shadowOffsetX = UI_SHADOWS.canvasTextOffsetX;
  ctx.shadowOffsetY = UI_SHADOWS.canvasTextOffsetY;
}

export function resetAssetKitForTest() {
  manifestPromise = null;
  manifestCache = null;
  imagePromises.clear();
  imageCache.clear();
  itemImagePromises.clear();
  itemImageCache.clear();
}
