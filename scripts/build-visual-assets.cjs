#!/usr/bin/env node

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const sharp = require('sharp');

const ROOT = path.resolve(__dirname, '..');
const SOURCE_DIR = path.join(ROOT, 'assets', 'source', 'generated', 'v0.3');
const OUTPUT_DIR = path.join(ROOT, 'assets', 'visual');

const ATLASES = {
  entities: {
    file: 'world-entities-atlas.png',
    columns: 4,
    rows: 4,
    size: 128,
    names: [
      'ship-drifter', 'ship-breacher', 'ship-remote', 'scavenger-raider',
      'scavenger-breacher', 'inhibitor-shard', 'wreck-intact', 'wreck-looted',
      'wreck-cluster', 'planetoid', 'comet', 'star-warm',
      'portal-extraction', 'portal-rift', 'sentry-fauna', 'well-instrument',
    ],
  },
  itemFamilies: {
    file: 'item-families-atlas.png',
    columns: 5,
    rows: 4,
    size: 96,
    names: [
      'thruster', 'plating', 'signal', 'coupling', 'drag',
      'cargo', 'pulse', 'sensor', 'flow', 'burn',
      'recirculator', 'gravity', 'decay', 'resonance', 'phase',
      'pickup', 'shield-cell', 'time-dilator', 'breach-flare', 'fuel-cell',
    ],
  },
  ui: {
    file: 'ui-frame-parts-atlas.png',
    columns: 4,
    rows: 3,
    size: 256,
    names: [
      'corner-top-left', 'corner-top-right', 'corner-bottom-left', 'corner-bottom-right',
      'rail-top', 'rail-bottom', 'rail-left', 'rail-right',
      'corner-selected', 'corner-warning', 'divider-junction', 'terminal-node',
    ],
  },
};

const TIER_COLORS = ['#dcecff', '#36f58a', '#00e2ff', '#ffb938'];

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

async function chromaKeyCell(input, left, top, width, height) {
  const { data, info } = await sharp(input)
    .extract({ left, top, width, height })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  for (let i = 0; i < data.length; i += 4) {
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    const dominance = g - Math.max(r, b);
    const greenBiased = g > 36 && g > r * 1.28 && g > b * 1.18;
    if (greenBiased && dominance > 12) {
      const keep = Math.max(0, Math.min(1, (52 - dominance) / 40));
      data[i + 3] = Math.round(data[i + 3] * keep);
      data[i + 1] = Math.min(g, Math.max(r, b) + 18);
    }
  }

  return sharp(data, { raw: info }).png().toBuffer();
}

async function writeAtlas(atlasKey, atlas) {
  const source = path.join(SOURCE_DIR, atlas.file);
  const metadata = await sharp(source).metadata();
  const output = path.join(OUTPUT_DIR, atlasKey === 'itemFamilies' ? 'item-families' : atlasKey);
  ensureDir(output);

  const written = [];
  for (let index = 0; index < atlas.names.length; index += 1) {
    const column = index % atlas.columns;
    const row = Math.floor(index / atlas.columns);
    const left = Math.round((column * metadata.width) / atlas.columns);
    const right = Math.round(((column + 1) * metadata.width) / atlas.columns);
    const top = Math.round((row * metadata.height) / atlas.rows);
    const bottom = Math.round(((row + 1) * metadata.height) / atlas.rows);
    const keyed = await chromaKeyCell(source, left, top, right - left, bottom - top);
    const destination = path.join(output, `${atlas.names[index]}.png`);

    await sharp(keyed)
      .trim({ background: { r: 0, g: 0, b: 0, alpha: 0 } })
      .resize(atlas.size, atlas.size, {
        fit: 'contain',
        kernel: sharp.kernel.nearest,
        background: { r: 0, g: 0, b: 0, alpha: 0 },
      })
      .png({ compressionLevel: 9, palette: false })
      .toFile(destination);
    written.push(path.relative(ROOT, destination));
  }
  return written;
}

function resolveItemFamily(id) {
  const rules = [
    [/shield|plating|hull|keel|reinforcement|suture/, 'plating'],
    [/thruster|afterburner|burn-extender|drift-engine|singularity-drive|overcharged-core/, 'thruster'],
    [/signal|baffle|dampener|echo-sink|codex/, 'signal'],
    [/coupling|coefficient/, 'coupling'],
    [/drag|foil|skimmer/, 'drag'],
    [/cargo|freight|mass-stitcher|salvage-titan|netting/, 'cargo'],
    [/pulse|tidal|precision/, 'pulse'],
    [/sensor|wake-needle/, 'sensor'],
    [/flow|vane|amplifier|spinneret|laminar/, 'flow'],
    [/canister|reservoir|injector|cinder/, 'burn'],
    [/recirculator|tank/, 'recirculator'],
    [/gravity|anchor|void-anchor|event-horizon/, 'gravity'],
    [/decay|temporal/, 'decay'],
    [/resonance|resonator|coil|braided|harmonic/, 'resonance'],
    [/phase|ghost|veil|negative-space|chamber/, 'phase'],
    [/pickup|magnet|hook/, 'pickup'],
    [/shield-cell|foam-anchor/, 'shield-cell'],
    [/time-dilator|dead-air-ampoule/, 'time-dilator'],
    [/breach-flare|crown-breach-match/, 'breach-flare'],
    [/fuel-cell|plasma-cell|antimatter-cell/, 'fuel-cell'],
  ];
  return rules.find(([pattern]) => pattern.test(id))?.[1] || 'resonance';
}

function iconOverlay(id, tier, consumable = false) {
  const hash = crypto.createHash('sha1').update(id).digest();
  const color = TIER_COLORS[Math.max(0, Math.min(3, tier - 1))];
  const marks = Array.from({ length: 4 }, (_, index) => {
    const x = 69 + index * 5;
    const height = 3 + (hash[index] % 4) * 2;
    return `<rect x="${x}" y="${84 - height}" width="3" height="${height}" fill="${color}" opacity="0.9"/>`;
  }).join('');
  const consumableMark = consumable
    ? `<path d="M12 12h12M18 6v12" stroke="${color}" stroke-width="3"/>`
    : '';
  return Buffer.from(`<svg width="96" height="96" xmlns="http://www.w3.org/2000/svg">
    <path d="M6 25V6h19M71 6h19v19M90 71v19H71M25 90H6V71" fill="none" stroke="${color}" stroke-width="2" opacity="0.82"/>
    ${consumableMark}${marks}
  </svg>`);
}

async function writeItemIcons() {
  const content = JSON.parse(fs.readFileSync(path.join(ROOT, 'src', 'content', 'items.data.json'), 'utf8'));
  const output = path.join(OUTPUT_DIR, 'items');
  ensureDir(output);
  const entries = [];

  for (const [tierKey, items] of Object.entries(content.ITEM_CATALOG)) {
    for (const item of items) entries.push({ ...item, tier: Number(tierKey), consumable: false });
  }
  for (const item of content.CONSUMABLE_CATALOG) entries.push({ ...item, consumable: true });

  const manifest = {};
  for (const item of entries) {
    const family = resolveItemFamily(item.id);
    const source = path.join(OUTPUT_DIR, 'item-families', `${family}.png`);
    const destination = path.join(output, `${item.id}.png`);
    await sharp({
      create: { width: 96, height: 96, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } },
    })
      .composite([
        { input: await sharp(source).resize(78, 78, { fit: 'contain', kernel: sharp.kernel.nearest }).png().toBuffer(), left: 9, top: 9 },
        { input: iconOverlay(item.id, item.tier, item.consumable), left: 0, top: 0 },
      ])
      .png({ compressionLevel: 9, palette: false })
      .toFile(destination);
    manifest[item.id] = {
      file: path.relative(ROOT, destination),
      family,
      tier: item.tier,
      consumable: item.consumable,
    };
  }
  return manifest;
}

async function main() {
  ensureDir(OUTPUT_DIR);
  const atlases = {};
  for (const [key, atlas] of Object.entries(ATLASES)) atlases[key] = await writeAtlas(key, atlas);
  const items = await writeItemIcons();
  const manifest = {
    version: 1,
    generatedAt: new Date().toISOString(),
    sourceDirectory: path.relative(ROOT, SOURCE_DIR),
    atlases,
    items,
  };
  fs.writeFileSync(path.join(OUTPUT_DIR, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
  console.log(`Built ${atlases.entities.length} entity sprites, ${Object.keys(items).length} item icons, and ${atlases.ui.length} UI slices.`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
