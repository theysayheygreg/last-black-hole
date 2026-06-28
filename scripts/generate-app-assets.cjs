#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { pathToFileURL } = require('url');
const { launchBrowser } = require('../tests/browser-driver.cjs');

const ROOT = path.resolve(__dirname, '..');
const APP_DIR = path.join(ROOT, 'assets', 'app');
const STEAM_DIR = path.join(ROOT, 'docs', 'public', 'steam');
const OXANIUM = pathToFileURL(path.join(ROOT, 'assets', 'fonts', 'oxanium', 'Oxanium-Variable.ttf')).href;
const MONA = pathToFileURL(path.join(ROOT, 'assets', 'fonts', 'monaspace', 'MonaspaceNeonVar.woff2')).href;

const ASSETS = [
  { name: 'icon-256.png', dir: APP_DIR, width: 256, height: 256, kind: 'icon' },
  { name: 'icon-512.png', dir: APP_DIR, width: 512, height: 512, kind: 'icon' },
  { name: 'capsule-main-616x353.png', dir: STEAM_DIR, width: 616, height: 353, kind: 'main' },
  { name: 'capsule-header-460x215.png', dir: STEAM_DIR, width: 460, height: 215, kind: 'header' },
  { name: 'capsule-small-231x87.png', dir: STEAM_DIR, width: 231, height: 87, kind: 'small' },
  { name: 'library-capsule-600x900.png', dir: STEAM_DIR, width: 600, height: 900, kind: 'libraryCapsule' },
  { name: 'library-hero-3840x1240.png', dir: STEAM_DIR, width: 3840, height: 1240, kind: 'hero' },
  { name: 'library-logo-1280x720.png', dir: STEAM_DIR, width: 1280, height: 720, kind: 'logo', transparent: true },
];

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function iconSvg(size = 512) {
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 512 512">
  <defs>
    <radialGradient id="g" cx="50%" cy="47%" r="52%">
      <stop offset="0%" stop-color="#fff4da"/>
      <stop offset="23%" stop-color="#00e2ff"/>
      <stop offset="48%" stop-color="#b84cff"/>
      <stop offset="70%" stop-color="#cc1a80"/>
      <stop offset="100%" stop-color="#000021"/>
    </radialGradient>
    <filter id="glow"><feGaussianBlur stdDeviation="7" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
  </defs>
  <rect width="512" height="512" rx="72" fill="#000021"/>
  <ellipse cx="256" cy="256" rx="176" ry="74" fill="none" stroke="url(#g)" stroke-width="18" filter="url(#glow)"/>
  <ellipse cx="256" cy="256" rx="108" ry="42" fill="#000006" stroke="#00e2ff" stroke-opacity="0.5" stroke-width="4"/>
  <circle cx="256" cy="256" r="35" fill="#000006" stroke="#fff4da" stroke-opacity="0.7" stroke-width="3"/>
  <text x="256" y="272" text-anchor="middle" font-family="Oxanium, Arial, sans-serif" font-weight="800" font-size="74" fill="#eaf7ff" letter-spacing="0">LS</text>
</svg>
`;
}

function assetHtml({ width, height, kind, transparent = false }) {
  const titleSize = Math.max(18, Math.round(Math.min(width, height) * (kind === 'small' ? 0.22 : kind === 'hero' ? 0.115 : 0.13)));
  const subtitleSize = Math.max(10, Math.round(titleSize * 0.32));
  const titleY = kind === 'libraryCapsule' ? 0.21 : kind === 'hero' ? 0.36 : kind === 'small' ? 0.52 : 0.36;
  const ringScale = kind === 'libraryCapsule' ? 0.78 : kind === 'hero' ? 0.42 : 0.62;
  return `<!doctype html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    @font-face { font-family: Oxanium; src: url("${OXANIUM}"); }
    @font-face { font-family: MonaspaceNeon; src: url("${MONA}"); }
    html, body {
      width: ${width}px;
      height: ${height}px;
      margin: 0;
      overflow: hidden;
      background: ${transparent ? 'transparent' : '#000021'};
      font-family: Oxanium, Arial, sans-serif;
    }
    .asset {
      position: relative;
      width: ${width}px;
      height: ${height}px;
      background:
        radial-gradient(ellipse at 62% 52%, rgba(0,226,255,0.18), transparent 28%),
        radial-gradient(ellipse at 44% 58%, rgba(204,26,128,0.18), transparent 31%),
        linear-gradient(180deg, rgba(0,5,22,0.98), rgba(0,0,8,0.98));
      color: #eaf7ff;
    }
    .logo-only { background: transparent; }
    .scan {
      position: absolute; inset: 0;
      background: repeating-linear-gradient(180deg, rgba(234,247,255,0.055) 0 1px, transparent 1px 7px);
      mix-blend-mode: screen;
      opacity: ${kind === 'small' ? 0.22 : 0.34};
    }
    .stars {
      position: absolute; inset: 0;
      background:
        radial-gradient(circle at 15% 22%, #fff4da 0 1px, transparent 2px),
        radial-gradient(circle at 82% 18%, #00e2ff 0 1px, transparent 2px),
        radial-gradient(circle at 71% 76%, #ffb938 0 1px, transparent 2px),
        radial-gradient(circle at 31% 67%, #eaf7ff 0 1px, transparent 2px),
        radial-gradient(circle at 92% 58%, #cc1a80 0 1px, transparent 2px);
      opacity: 0.85;
    }
    .well {
      position: absolute;
      left: 50%; top: ${kind === 'libraryCapsule' ? 58 : kind === 'hero' ? 54 : 55}%;
      width: ${Math.round(width * ringScale)}px;
      height: ${Math.round(Math.min(width, height) * ringScale * 0.33)}px;
      transform: translate(-50%, -50%);
      border-radius: 50%;
      background:
        radial-gradient(ellipse at center, #000006 0 19%, rgba(204,26,128,0.55) 20% 32%, rgba(0,226,255,0.82) 34% 45%, rgba(255,244,218,0.78) 47% 54%, rgba(184,76,255,0.46) 58% 70%, transparent 74%);
      filter: drop-shadow(0 0 ${Math.max(8, Math.round(width * 0.016))}px rgba(0,226,255,0.45));
      opacity: ${kind === 'logo' ? 0.65 : 0.88};
    }
    .fabric {
      position: absolute; inset: 0;
      font: ${Math.max(5, Math.round(Math.min(width, height) * 0.018))}px MonaspaceNeon, monospace;
      line-height: 1.18;
      color: rgba(0,226,255,0.24);
      white-space: pre;
      transform: skewY(-4deg) scale(1.08);
      opacity: ${kind === 'small' ? 0.18 : 0.32};
    }
    .title {
      position: absolute;
      left: ${kind === 'libraryCapsule' ? '8%' : '7%'};
      right: ${kind === 'libraryCapsule' ? '8%' : '7%'};
      top: ${Math.round(height * titleY)}px;
      transform: translateY(-50%);
      text-align: ${kind === 'hero' ? 'left' : 'center'};
      font-weight: 800;
      font-size: ${titleSize}px;
      line-height: 0.92;
      letter-spacing: 0;
      text-shadow: 0 0 ${Math.max(10, Math.round(titleSize * 0.38))}px rgba(0,226,255,0.5), 0 2px 1px #000;
    }
    .subtitle {
      position: absolute;
      left: ${kind === 'hero' ? '7%' : '8%'};
      right: 8%;
      top: ${Math.round(height * (titleY + 0.16))}px;
      text-align: ${kind === 'hero' ? 'left' : 'center'};
      font: 700 ${subtitleSize}px MonaspaceNeon, monospace;
      color: rgba(255,244,218,0.86);
      text-transform: uppercase;
      text-shadow: 0 0 10px rgba(0,0,0,0.9);
    }
    .tag {
      position: absolute;
      left: 7%; bottom: ${Math.max(16, Math.round(height * 0.08))}px;
      font: 700 ${Math.max(9, Math.round(subtitleSize * 0.92))}px MonaspaceNeon, monospace;
      color: rgba(0,226,255,0.78);
      text-transform: uppercase;
    }
    .logo-only .well, .logo-only .scan, .logo-only .stars, .logo-only .fabric, .logo-only .subtitle, .logo-only .tag { display: none; }
    .logo-only .title {
      inset: 0;
      display: grid;
      place-items: center;
      font-size: ${Math.round(Math.min(width, height) * 0.13)}px;
      color: #eaf7ff;
      text-align: center;
    }
  </style>
</head>
<body>
  <div class="asset ${kind === 'logo' ? 'logo-only' : ''}">
    <div class="stars"></div>
    <div class="fabric">${Array(24).fill(':::: //// ==== ....     ⟡   ░░░░   //// ==== ....').join('\n')}</div>
    <div class="well"></div>
    <div class="scan"></div>
    <div class="title">LAST<br>SINGULARITY</div>
    <div class="subtitle">surf the dying universe</div>
    <div class="tag">ASCII fluid extraction roguelike</div>
  </div>
</body>
</html>`;
}

function iconHtml({ width, height }) {
  return `<!doctype html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    @font-face { font-family: Oxanium; src: url("${OXANIUM}"); }
    html, body { width: ${width}px; height: ${height}px; margin: 0; overflow: hidden; background: #000021; }
    svg { width: ${width}px; height: ${height}px; display: block; }
  </style>
</head>
<body>${iconSvg(Math.max(width, height))}</body>
</html>`;
}

async function captureAsset(browser, asset) {
  ensureDir(asset.dir);
  const page = await browser.newPage({ width: asset.width, height: asset.height, deviceScaleFactor: 1 });
  const html = asset.kind === 'icon' ? iconHtml(asset) : assetHtml(asset);
  const dataUrl = `data:text/html;charset=utf-8,${encodeURIComponent(html)}`;
  await page.goto(dataUrl, { timeout: 15000 });
  await page.waitForFunction(() => document.fonts?.status === 'loaded', { timeout: 5000 }).catch(() => null);
  const result = await page.session.send('Page.captureScreenshot', {
    format: 'png',
    fromSurface: true,
    omitBackground: Boolean(asset.transparent),
  });
  fs.writeFileSync(path.join(asset.dir, asset.name), Buffer.from(result.data, 'base64'));
}

async function main() {
  ensureDir(APP_DIR);
  ensureDir(STEAM_DIR);
  fs.writeFileSync(path.join(APP_DIR, 'icon.svg'), iconSvg(512));

  const browser = await launchBrowser({ viewport: { width: 1280, height: 720, deviceScaleFactor: 1 } });
  try {
    for (const asset of ASSETS) {
      await captureAsset(browser, asset);
      console.log(`wrote ${path.relative(ROOT, path.join(asset.dir, asset.name))}`);
    }
  } finally {
    await browser.close();
  }
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error.stack || error.message);
    process.exit(1);
  });
}
