/**
 * One bounded 1280x800 Deck review capture for the v0.3.1 UI lane.
 * This is evidence, not a retrying visual suite.
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
const outputDir = path.join('/private/tmp', `lbh-v031-deck-ui-capture-${stamp}`);
fs.mkdirSync(outputDir, { recursive: true });

async function settle(page, frames = 90) {
  await stepGameFrames(page, frames, 1 / 60);
  await new Promise((resolve) => setTimeout(resolve, 180));
}

async function capture(page, name) {
  const file = path.join(outputDir, `${name}.png`);
  const result = await page.session.send('Page.captureScreenshot', { format: 'png', fromSurface: true });
  const buffer = Buffer.from(result.data, 'base64');
  fs.writeFileSync(file, buffer);
  return {
    name,
    path: file,
    width: buffer.readUInt32BE(16),
    height: buffer.readUInt32BE(20),
    bytes: buffer.length,
  };
}

async function showFixture(page, surface, options = {}) {
  await page.evaluate(({ fixture, fixtureOptions }) => {
    window.__TEST_API.showUiFixture(fixture, fixtureOptions);
    window.__TEST_API.setConfig('debug.showFPS', false);
    window.__TEST_API.setConfig('debug.showWellRadii', false);
    window.__TEST_API.setConfig('ui.motion.reduced', false);
  }, { fixture: surface, fixtureOptions: options });
  await settle(page);
}

async function run() {
  await startServer();
  let browser;
  try {
    const target = withQuery('index-a.html?renderer=three', { deck: 1, capture: 1 });
    const launched = await launchGame(target);
    browser = launched.browser;
    const page = launched.page;
    await page.setViewport({ width: 1280, height: 800, deviceScaleFactor: 1 });
    await waitFor(page, () => typeof window.__TEST_API !== 'undefined', { timeout: 5000 });
    await page.evaluate(() => localStorage.clear());

    const frames = [];
    await showFixture(page, 'title', { titleTimer: 1.8 });
    frames.push(await capture(page, '01-title-exit'));

    await showFixture(page, 'home', { tabIndex: 0 });
    frames.push(await capture(page, '02-ship-loadout'));

    for (const [index, label] of [[0, 'shallows-5x5'], [1, 'expanse-15x15'], [2, 'deep-field-25x25']]) {
      await showFixture(page, 'map-select', { mapIndex: index, seed: 424242 });
      frames.push(await capture(page, `03-map-${label}`));
    }

    await showFixture(page, 'map-select', { mapIndex: 3, seed: 424242 });
    frames.push(await capture(page, '06-map-locked'));

    await showFixture(page, 'playing-hud', { mapIndex: 0, seed: 424242 });
    await waitFor(page, () => window.__TEST_API.getGamePhase() === 'playing', { timeout: 5000 });
    await page.evaluate(() => {
      const api = window.__TEST_API;
      const ship = api.getShipPos();
      api.spawnTestWreck(ship.x - 0.12, ship.y, {
        name: 'WRECK OF THE ASCENDANT',
        type: 'derelict',
        loot: [{ id: 'capture-a', name: 'Quiet Core', value: 40, tier: 2, category: 'salvage' }],
      });
      api.spawnTestWreck(ship.x + 0.12, ship.y + 0.02, {
        name: 'DROWNED RELAY FIELD',
        type: 'debris',
        loot: [{ id: 'capture-b', name: 'Bright Relic', value: 60, tier: 2, category: 'artifact' }],
      });
    });
    await settle(page, 45);
    frames.push(await capture(page, '07-in-match-wreck-labels'));

    const manifest = {
      generatedAt: new Date().toISOString(),
      viewport: { width: 1280, height: 800, deviceScaleFactor: 1 },
      target,
      outputDir,
      frames,
    };
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
