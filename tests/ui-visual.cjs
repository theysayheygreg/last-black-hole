/**
 * UI visual harness.
 *
 * Captures deterministic UI surfaces and reduced "couch proxy" versions. This
 * is a readability canary, not a pixel-perfect art approval suite.
 */

const fs = require('fs');
const path = require('path');
const sharp = require('sharp');
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
  emEarned: 90,
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

async function setUiDebugQuiet(page, { reducedMotion = false } = {}) {
  await page.evaluate((reduce) => {
    window.__TEST_API?.setOverlayVisible?.(true);
    window.__TEST_API?.setConfig?.('debug.showFPS', false);
    window.__TEST_API?.setConfig?.('debug.showWellRadii', false);
    window.__TEST_API?.setConfig?.('debug.showFluidDiagnostic', false);
    window.__TEST_API?.setConfig?.('debug.showVelocityField', false);
    window.__TEST_API?.setConfig?.('debug.showCoordDiagnostic', false);
    window.__TEST_API?.setConfig?.('ui.motion.reduced', Boolean(reduce));
  }, reducedMotion);
}

async function analyzePngInPage(_page, base64, { scale = 1, regions = [] } = {}) {
  const source = Buffer.from(base64, 'base64');
  const metadata = await sharp(source).metadata();
  const width = Math.max(1, Math.round(metadata.width * scale));
  const height = Math.max(1, Math.round(metadata.height * scale));
  const pipeline = sharp(source).resize(width, height).ensureAlpha();
  const { data: pixels, info } = await pipeline.clone().raw().toBuffer({ resolveWithObject: true });
  const png = await pipeline.png().toBuffer();

    let rgbMax = 0;
    let rgbSum = 0;
    let litPixels = 0;
    for (let i = 0; i < pixels.length; i += 4) {
      const rgb = pixels[i] + pixels[i + 1] + pixels[i + 2];
      rgbMax = Math.max(rgbMax, rgb);
      rgbSum += rgb;
      if (rgb > 18) litPixels++;
    }

    const regionStats = regions.map((region) => {
      const x0 = Math.max(0, Math.floor(region.x * scale));
      const y0 = Math.max(0, Math.floor(region.y * scale));
      const x1 = Math.min(info.width, Math.ceil((region.x + region.width) * scale));
      const y1 = Math.min(info.height, Math.ceil((region.y + region.height) * scale));
      let sum = 0;
      let max = 0;
      let lit = 0;
      let count = 0;
      for (let y = y0; y < y1; y++) {
        for (let x = x0; x < x1; x++) {
          const i = (y * info.width + x) * info.channels;
          const rgb = pixels[i] + pixels[i + 1] + pixels[i + 2];
          sum += rgb;
          max = Math.max(max, rgb);
          if (rgb > 18) lit++;
          count++;
        }
      }
      return { name: region.name, x: x0, y: y0, width: x1 - x0, height: y1 - y0,
        rgbMax: max, rgbAvg: count ? sum / count : 0, litPixels: lit, pixelCount: count };
    });
  return {
      width: info.width,
      height: info.height,
      rgbMax,
      rgbAvg: rgbSum / (pixels.length / 4),
      litPixels,
      regions: regionStats,
      dataUrl: `data:image/png;base64,${png.toString('base64')}`,
  };
}

async function resolveRegions(page, definitions = []) {
  return page.evaluate((items) => items.map((item) => {
    if (item.selector) {
      const rect = document.querySelector(item.selector)?.getBoundingClientRect();
      if (!rect) return null;
      return { name: item.name, x: rect.x, y: rect.y, width: rect.width, height: rect.height };
    }
    return {
      name: item.name,
      x: item.x * innerWidth,
      y: item.y * innerHeight,
      width: item.width * innerWidth,
      height: item.height * innerHeight,
    };
  }).filter(Boolean), definitions);
}

function assertNamedRegions(stats, surface) {
  for (const expected of surface.regions || []) {
    const region = stats.regions.find((entry) => entry.name === expected.name);
    assert(region, `${surface.name} missing named region ${expected.name}`);
    assert(region.pixelCount > 0, `${surface.name} ${expected.name} has no pixels`);
    assert(region.rgbMax >= (expected.minRgbMax ?? 72),
      `${surface.name} ${expected.name} is too dim; max RGB ${region.rgbMax}`);
    assert(region.litPixels >= (expected.minLitPixels ?? 24),
      `${surface.name} ${expected.name} has too few lit pixels: ${region.litPixels}`);
    if (Number.isFinite(expected.minBackingAvg)) {
      assert(region.rgbAvg >= expected.minBackingAvg,
        `${surface.name} ${expected.name} lacks local backing; avg RGB ${region.rgbAvg.toFixed(1)}`);
    }
  }
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
  const viewport = surface.viewport || { width: 1280, height: 800 };
  await page.session.send('Emulation.setDeviceMetricsOverride', {
    width: viewport.width, height: viewport.height, deviceScaleFactor: 1, mobile: false,
  });
  await surface.setup(page);
  await setUiDebugQuiet(page, { reducedMotion: surface.reducedMotion === true });

  // Fixtures author the target state directly. One frame synchronizes a new
  // phase, then the motion clock is pinned before two frames paint that state.
  await stepGameFrames(page, 1);
  await page.evaluate((time) => window.__TEST_API?.setUiMotionTime?.(time), surface.motionTime ?? 1.2);
  await stepGameFrames(page, 2);

  if (surface.expectPhase) {
    const phase = await page.evaluate(() => window.__TEST_API?.getGamePhase?.() || null);
    assert(phase === surface.expectPhase, `${surface.name} expected phase ${surface.expectPhase}, got ${phase}`);
  }
  if (surface.assertDom) {
    const domOk = await page.evaluate(surface.assertDom);
    assert(domOk, `${surface.name} DOM assertion failed`);
  }

  const motion = await page.evaluate(() => window.__TEST_API?.getUiMotionState?.() || null);
  if (surface.expectSettled != null) {
    const settledAfter = Math.max(0.5, Number(motion?.settings?.panelDuration || 0));
    const settled = motion?.settings?.reducedMotion === true || Number(motion?.timer || 0) >= settledAfter;
    assert(settled === surface.expectSettled,
      `${surface.name} expected motion settled=${surface.expectSettled}, got ${settled}`);
  }

  const filepath = path.join(outputDir, `${surface.name}.png`);
  const base64 = await captureFullPage(page, filepath);
  const regions = await resolveRegions(page, surface.regions);
  const stats = await analyzePngInPage(page, base64, { regions });
  assertReadableStats(stats, surface.name, surface.thresholds);
  assertNamedRegions(stats, surface);

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
    viewport,
    motion,
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
      setup: (p) => p.evaluate(() => window.__TEST_API.showUiFixture('title', { titleTimer: 1.4 })),
    },
    {
      name: 'title-left',
      expectPhase: 'title',
      setup: (p) => p.evaluate(() => window.__TEST_API.showUiFixture('title', { titleTimer: 1.4, layout: 'left' })),
    },
    {
      name: 'title-right',
      expectPhase: 'title',
      setup: (p) => p.evaluate(() => window.__TEST_API.showUiFixture('title', { titleTimer: 1.4, layout: 'right' })),
    },
    {
      name: 'title-opposite-left',
      expectPhase: 'title',
      setup: (p) => p.evaluate(() => window.__TEST_API.showUiFixture('title', {
        titleTimer: 1.4,
        layout: 'opposite-left',
      })),
    },
    {
      name: 'title-attract',
      expectPhase: 'title',
      setup: (p) => p.evaluate(() => window.__TEST_API.showUiFixture('title', { titleTimer: 1.8, loopTime: 8.1 })),
    },
    {
      name: 'title-glitch',
      expectPhase: 'title',
      setup: (p) => p.evaluate(() => window.__TEST_API.showUiFixture('title', {
        titleTimer: 1.8,
        layout: 'opposite-left',
        loopTime: 2.11,
      })),
    },
    {
      name: 'title-reduced-motion',
      expectPhase: 'title',
      reducedMotion: true,
      setup: (p) => p.evaluate(() => window.__TEST_API.showUiFixture('title', {
        titleTimer: 1.4,
        layout: 'left',
        loopTime: 2.11,
      })),
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
      regions: [
        { name: 'home-tabs', x: 0.04, y: 0.08, width: 0.92, height: 0.09, minBackingAvg: 5 },
        { name: 'ship-loadout', x: 0.32, y: 0.20, width: 0.36, height: 0.62, minBackingAvg: 4 },
      ],
    },
    {
      name: 'home-compact',
      expectPhase: 'home',
      viewport: { width: 960, height: 720 },
      setup: (p) => p.evaluate(() => window.__TEST_API.showUiFixture('home', { tabIndex: 0 })),
      assertDom: () => {
        const layout = window.__TEST_API.getUiMotionState()?.layout;
        if (!layout?.compact || layout.centerW <= 0) return false;
        return layout.viewportWidth === 960
          && layout.marginX * 2 + layout.leftW + layout.centerW + layout.rightW + layout.gap * 2 <= layout.width + 0.01;
      },
    },
    {
      name: 'home-transition-entering',
      expectPhase: 'home',
      motionTime: 0.08,
      setup: (p) => p.evaluate(() => window.__TEST_API.showUiFixture('home', { tabIndex: 0 })),
      regions: [{ name: 'home-transition-panel', x: 0.05, y: 0.16, width: 0.90, height: 0.70 }],
    },
    {
      name: 'home-transition-reduced-motion',
      expectPhase: 'home',
      motionTime: 0.08,
      reducedMotion: true,
      expectSettled: true,
      setup: (p) => p.evaluate(() => window.__TEST_API.showUiFixture('home', { tabIndex: 0 })),
      regions: [{ name: 'home-transition-panel', x: 0.05, y: 0.16, width: 0.90, height: 0.70 }],
    },
    {
      name: 'map-select',
      expectPhase: 'mapSelect',
      setup: (p) => p.evaluate(() => window.__TEST_API.showUiFixture('map-select', { mapIndex: 1, seed: 424242 })),
    },
    {
      name: 'map-select-compact',
      expectPhase: 'mapSelect',
      viewport: { width: 960, height: 720 },
      setup: (p) => p.evaluate(() => window.__TEST_API.showUiFixture('map-select', { mapIndex: 1, seed: 424242 })),
      assertDom: () => {
        const layout = window.__TEST_API.getUiMotionState()?.layout;
        if (!layout?.compact || layout.centerW <= 0) return false;
        return layout.viewportWidth === 960
          && layout.marginX * 2 + layout.leftW + layout.centerW + layout.rightW + layout.gap * 2 <= layout.width + 0.01;
      },
    },
    {
      name: 'playing-hud',
      expectPhase: 'playing',
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
      regions: [
        { name: 'vitals', selector: '#hud-vitals', minBackingAvg: 6 },
        { name: 'route-objective', selector: '#hud-portals', minBackingAvg: 6 },
        { name: 'ship-actions', selector: '#hud-actions', minBackingAvg: 6 },
      ],
    },
    {
      name: 'playing-hud-1280x720',
      viewport: { width: 1280, height: 720 },
      expectPhase: 'playing',
      setup: async (p) => {
        await p.evaluate(() => window.__TEST_API.showUiFixture('playing-hud', { mapIndex: 2, seed: 424242 }));
        await waitFor(p, () => window.__TEST_API.getGamePhase() === 'playing', { timeout: 6000 });
      },
      assertDom: () => {
        const hud = document.getElementById('hud');
        const panels = [...document.querySelectorAll('#hud .hud-panel')].filter((el) => getComputedStyle(el).display !== 'none');
        return !!hud && panels.every((el) => {
          const r = el.getBoundingClientRect();
          return r.left >= 0 && r.top >= 0 && r.right <= innerWidth && r.bottom <= innerHeight;
        });
      },
      thresholds: { minLitPixels: 1100, minRgbMax: 90 },
      regions: [
        { name: 'vitals', selector: '#hud-vitals', minBackingAvg: 6 },
        { name: 'route-objective', selector: '#hud-portals', minBackingAvg: 6 },
        { name: 'ship-actions', selector: '#hud-actions', minBackingAvg: 6 },
      ],
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
