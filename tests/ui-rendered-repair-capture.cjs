/**
 * Targeted visual receipt for the dense pre-launch and terminal UI rails.
 * Captures use the live Three/canvas path; layout-only tests cannot catch a
 * center-vs-top-left canvas primitive mismatch.
 */

const fs = require('fs');
const path = require('path');
const {
  startServer,
  stopServer,
  launchGame,
  stepGameFrames,
  waitFor,
  withQuery,
} = require('./helpers.cjs');

const stamp = new Date().toISOString().replace(/[:.]/g, '');
const outputDir = path.join('/private/tmp', `lbh-v03-ui-rendered-repair-${stamp}`);
fs.mkdirSync(outputDir, { recursive: true });

const deathResult = {
  runId: 'ui-rendered-repair-death',
  pilotId: 'ui-repair-pilot',
  profileId: 'ui-repair-profile',
  hullType: 'drifter',
  outcome: 'dead',
  deathCause: 'well',
  deathEntityId: 'charybdis',
  survivalTime: 64,
  cargoLost: [{ id: 'lost-ui-a', name: 'Drowned Core', value: 75, tier: 2, category: 'artifact' }],
  noiseMaxMeters: 1200,
  noiseSource: 'IMPACT',
  emEarned: 16,
  aiOutcomes: [{ personality: 'redline', hullType: 'breacher', outcome: 'extracted', cargoCount: 4 }],
  notables: [{ type: 'death_cause', description: 'consumed by Charybdis', value: 'well' }],
  mapId: 'expanse',
  wellCount: 8,
  seed: 99,
};

async function settle(page, frames = 90) {
  await stepGameFrames(page, frames, 1 / 60);
  await new Promise((resolve) => setTimeout(resolve, 180));
}

async function capture(page, name, viewport) {
  const file = path.join(outputDir, `${name}.png`);
  const result = await page.session.send('Page.captureScreenshot', { format: 'png', fromSurface: true });
  const buffer = Buffer.from(result.data, 'base64');
  const width = buffer.readUInt32BE(16);
  const height = buffer.readUInt32BE(20);
  if (width !== viewport.width || height !== viewport.height) {
    throw new Error(`${name} captured ${width}x${height}, expected ${viewport.width}x${viewport.height}`);
  }
  fs.writeFileSync(file, buffer);
  return { name, path: file, width, height, bytes: buffer.length };
}

async function run() {
  await startServer();
  let browser;
  try {
    const launched = await launchGame(withQuery('index-a.html?renderer=three', { deck: 1, capture: 1 }));
    browser = launched.browser;
    const page = launched.page;
    await waitFor(page, () => typeof window.__TEST_API !== 'undefined', { timeout: 5000 });
    await page.evaluate(() => localStorage.clear());

    const frames = [];
    const show = async (name, viewport, fixture, payload = undefined) => {
      await page.setViewport({ ...viewport, deviceScaleFactor: 1 });
      await page.evaluate(fixture, payload);
      await page.evaluate(() => {
        window.__TEST_API.setConfig('debug.showFPS', false);
        window.__TEST_API.setConfig('debug.showWellRadii', false);
        window.__TEST_API.setConfig('ui.motion.reduced', false);
        window.__TEST_API.setUiMotionTime(2.4);
      });
      await settle(page);
      frames.push(await capture(page, name, viewport));
    };

    await show('01-ship-loadout-1280x800', { width: 1280, height: 800 },
      () => window.__TEST_API.showUiFixture('home', { tabIndex: 0 }));
    await show('02-launch-1280x800', { width: 1280, height: 800 },
      () => window.__TEST_API.showUiFixture('home', { tabIndex: 4 }));
    await show('03-map-select-1280x800', { width: 1280, height: 800 },
      () => window.__TEST_API.showUiFixture('map-select', { mapIndex: 0, seed: 424242 }));
    await show('04-map-select-1048x576', { width: 1048, height: 576 },
      () => window.__TEST_API.showUiFixture('map-select', { mapIndex: 0, seed: 424242 }));
    await show('05-map-select-960x720', { width: 960, height: 720 },
      () => window.__TEST_API.showUiFixture('map-select', { mapIndex: 0, seed: 424242 }));
    await show('06-results-death-1280x800', { width: 1280, height: 800 },
      (result) => window.__TEST_API.showRunResultsFixture(result), deathResult);

    const manifest = { generatedAt: new Date().toISOString(), outputDir, frames };
    fs.writeFileSync(path.join(outputDir, 'manifest.json'), JSON.stringify(manifest, null, 2));
    console.log(JSON.stringify(manifest, null, 2));
  } finally {
    if (browser) await browser.close();
    stopServer();
  }
}

run().catch((error) => {
  console.error(error.stack || error.message);
  stopServer();
  process.exit(1);
});
