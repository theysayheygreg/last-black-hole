/**
 * UI visual harness.
 *
 * Captures deterministic UI surfaces and reduced "couch proxy" versions. This
 * is a readability canary, not a pixel-perfect art approval suite.
 */

const fs = require('fs');
const path = require('path');
const {
  startServer,
  stopServer,
  launchGame,
  TestRunner,
  assert,
  waitFor,
  withQuery,
  stepGameFrames,
} = require('./helpers.cjs');

const htmlFile = process.argv[2] || 'index-a.html?renderer=three';

const extractedResult = {
  runId: 'ui-visual-extracted',
  pilotId: 'ui-pilot',
  profileId: 'ui-profile',
  hullType: 'hauler',
  outcome: 'extracted',
  survivalTime: 238,
  cargoExtracted: [
    { id: 'cargo-ui-a', name: 'Bright Relic', value: 120, tier: 2, category: 'artifact' },
    { id: 'cargo-ui-b', name: 'Quiet Core', value: 80, tier: 3, category: 'salvage' },
  ],
  signalPeak: 0.82,
  signalPeakZone: 'flare',
  inhibitorFormReached: 2,
  emEarned: 290,
  aiOutcomes: [
    { personality: 'raider', hullType: 'breacher', outcome: 'dead', cargoCount: 1 },
    { personality: 'ghost', hullType: 'shroud', outcome: 'extracted', cargoCount: 3 },
  ],
  notables: [{ type: 'milestone', description: 'new milestone: DEEP DIVE', value: 'deep-dive' }],
  mapId: 'shallows',
  wellCount: 5,
  seed: 4242,
};

const deathResult = {
  runId: 'ui-visual-death',
  pilotId: 'ui-pilot',
  profileId: 'ui-profile',
  hullType: 'drifter',
  outcome: 'dead',
  deathCause: 'well',
  deathEntityId: 'charybdis',
  survivalTime: 64,
  cargoLost: [{ id: 'lost-ui-a', name: 'Drowned Core', value: 75, tier: 2, category: 'artifact' }],
  signalPeak: 0.91,
  signalPeakZone: 'threshold',
  inhibitorFormReached: 3,
  emEarned: 16,
  aiOutcomes: [{ personality: 'redline', hullType: 'breacher', outcome: 'extracted', cargoCount: 4 }],
  notables: [{ type: 'death_cause', description: 'consumed by Charybdis', value: 'well' }],
  mapId: 'expanse',
  wellCount: 8,
  seed: 99,
};

async function stepForMs(page, ms, dt = 1 / 60) {
  const frames = Math.max(1, Math.ceil(ms / (dt * 1000)));
  return stepGameFrames(page, frames, dt);
}

async function setUiDebugQuiet(page) {
  await page.evaluate(() => {
    window.__TEST_API?.setOverlayVisible?.(true);
    window.__TEST_API?.setConfig?.('debug.showFPS', false);
    window.__TEST_API?.setConfig?.('debug.showWellRadii', false);
    window.__TEST_API?.setConfig?.('debug.showFluidDiagnostic', false);
    window.__TEST_API?.setConfig?.('debug.showVelocityField', false);
    window.__TEST_API?.setConfig?.('debug.showCoordDiagnostic', false);
  });
}

async function analyzePngInPage(page, base64, { scale = 1 } = {}) {
  return page.evaluate(async ({ base64Png, scaleValue }) => {
    const dataUrl = `data:image/png;base64,${base64Png}`;
    const img = new Image();
    await new Promise((resolve, reject) => {
      img.onload = resolve;
      img.onerror = () => reject(new Error('failed to load screenshot image'));
      img.src = dataUrl;
    });

    const out = document.createElement('canvas');
    out.width = Math.max(1, Math.round(img.width * scaleValue));
    out.height = Math.max(1, Math.round(img.height * scaleValue));
    const ctx = out.getContext('2d');
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(img, 0, 0, out.width, out.height);

    const pixels = ctx.getImageData(0, 0, out.width, out.height).data;
    let rgbMax = 0;
    let rgbSum = 0;
    let litPixels = 0;
    for (let i = 0; i < pixels.length; i += 4) {
      const rgb = pixels[i] + pixels[i + 1] + pixels[i + 2];
      rgbMax = Math.max(rgbMax, rgb);
      rgbSum += rgb;
      if (rgb > 18) litPixels++;
    }

    return {
      width: out.width,
      height: out.height,
      rgbMax,
      rgbAvg: rgbSum / (pixels.length / 4),
      litPixels,
      dataUrl: out.toDataURL('image/png'),
    };
  }, { base64Png: base64, scaleValue: scale });
}

function writeDataUrl(filepath, dataUrl) {
  fs.writeFileSync(filepath, Buffer.from(dataUrl.split(',')[1], 'base64'));
}

async function captureFullPage(page, filepath) {
  const result = await page.session.send('Page.captureScreenshot', { format: 'png', fromSurface: true });
  fs.writeFileSync(filepath, Buffer.from(result.data, 'base64'));
  return result.data;
}

function assertReadableStats(stats, label, { minLitPixels = 900, minRgbMax = 90 } = {}) {
  assert(stats.rgbMax >= minRgbMax, `${label} capture is too dim; max RGB ${stats.rgbMax}`);
  assert(stats.litPixels >= minLitPixels, `${label} capture has too few lit pixels: ${stats.litPixels}`);
}

async function captureSurface(page, outputDir, surface) {
  await surface.setup(page);
  await setUiDebugQuiet(page);
  await stepForMs(page, surface.warmMs ?? 260);

  if (surface.expectPhase) {
    const phase = await page.evaluate(() => window.__TEST_API?.getGamePhase?.() || null);
    assert(phase === surface.expectPhase, `${surface.name} expected phase ${surface.expectPhase}, got ${phase}`);
  }
  if (surface.assertDom) {
    const domOk = await page.evaluate(surface.assertDom);
    assert(domOk, `${surface.name} DOM assertion failed`);
  }

  const filepath = path.join(outputDir, `${surface.name}.png`);
  const base64 = await captureFullPage(page, filepath);
  const stats = await analyzePngInPage(page, base64);
  assertReadableStats(stats, surface.name, surface.thresholds);

  const proxies = [];
  for (const scale of [0.5, 0.25]) {
    const proxy = await analyzePngInPage(page, base64, { scale });
    assertReadableStats(proxy, `${surface.name} couch ${scale}`, {
      minLitPixels: Math.max(80, Math.round((surface.thresholds?.minLitPixels ?? 900) * scale * scale * 0.5)),
      minRgbMax: surface.thresholds?.minRgbMax ?? 90,
    });
    const proxyPath = path.join(outputDir, `${surface.name}-couch-${Math.round(scale * 100)}.png`);
    writeDataUrl(proxyPath, proxy.dataUrl);
    proxies.push({ scale, path: proxyPath, stats: { ...proxy, dataUrl: undefined } });
  }

  return {
    name: surface.name,
    phase: await page.evaluate(() => window.__TEST_API?.getGamePhase?.() || null),
    path: filepath,
    stats: { ...stats, dataUrl: undefined },
    proxies,
  };
}

async function run() {
  console.log(`\n=== UI VISUAL HARNESS (${htmlFile}) ===\n`);
  const runner = new TestRunner('UIVisual');
  await startServer();

  let browser, page;
  const runStamp = new Date().toISOString().replace(/[:.]/g, '');
  const outputDir = path.join(__dirname, 'screenshots', `ui-visual-${runStamp}`);
  fs.mkdirSync(outputDir, { recursive: true });
  const captureTarget = withQuery(htmlFile, { capture: 1 });

  const surfaces = [
    {
      name: 'title',
      expectPhase: 'title',
      warmMs: 1500,
      setup: (p) => p.evaluate(() => window.__TEST_API.showUiFixture('title', { titleTimer: 1.4 })),
    },
    {
      name: 'profile-select',
      expectPhase: 'profileSelect',
      setup: (p) => p.evaluate(() => window.__TEST_API.showUiFixture('profile-select', { cursor: 0 })),
    },
    {
      name: 'home-ship',
      expectPhase: 'home',
      setup: (p) => p.evaluate(() => window.__TEST_API.showUiFixture('home', { tabIndex: 0 })),
    },
    {
      name: 'map-select',
      expectPhase: 'mapSelect',
      setup: (p) => p.evaluate(() => window.__TEST_API.showUiFixture('map-select', { mapIndex: 1, seed: 424242 })),
    },
    {
      name: 'playing-hud',
      expectPhase: 'playing',
      warmMs: 1700,
      setup: async (p) => {
        await p.evaluate(() => window.__TEST_API.showUiFixture('playing-hud', { mapIndex: 0, seed: 424242 }));
        await waitFor(p, () => window.__TEST_API.getGamePhase() === 'playing', { timeout: 6000 });
      },
      assertDom: () => {
        const hud = document.getElementById('hud');
        const fuel = document.getElementById('hud-fuel-readout');
        const signal = document.getElementById('hud-signal-zone');
        return !!hud && getComputedStyle(hud).display !== 'none' && !!fuel?.textContent && !!signal?.textContent;
      },
      thresholds: { minLitPixels: 1200, minRgbMax: 90 },
    },
    {
      name: 'results-extracted',
      expectPhase: 'escaped',
      setup: (p) => p.evaluate((result) => window.__TEST_API.showRunResultsFixture(result), extractedResult),
    },
    {
      name: 'results-death',
      expectPhase: 'dead',
      setup: (p) => p.evaluate((result) => window.__TEST_API.showRunResultsFixture(result), deathResult),
    },
  ];

  try {
    ({ browser, page } = await launchGame(captureTarget));
    const hasAPI = await page.evaluate(() => typeof window.__TEST_API !== 'undefined');
    assert(hasAPI, 'window.__TEST_API not found');

    const manifest = {
      generatedAt: new Date().toISOString(),
      htmlFile,
      captureTarget,
      outputDir,
      surfaces: [],
    };

    for (const surface of surfaces) {
      await runner.run(`Capture ${surface.name}`, async () => {
        const result = await captureSurface(page, outputDir, surface);
        manifest.surfaces.push(result);
        console.log(`        Saved: ${path.relative(path.join(__dirname, '..'), result.path)}`);
      });
    }

    const manifestPath = path.join(outputDir, 'manifest.json');
    fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
    console.log(`\n  Manifest: ${manifestPath}`);
  } finally {
    if (browser) await browser.close();
    stopServer();
  }

  const allPassed = runner.summary();
  process.exit(allPassed ? 0 : 1);
}

run().catch((err) => {
  console.error('UI visual harness fatal error:', err.message);
  stopServer();
  process.exit(1);
});
