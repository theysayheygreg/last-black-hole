/**
 * Renderer harness — deterministic timed captures for visual work.
 *
 * This is not a gameplay regression suite. It captures stable renderer fixtures
 * over time so humans and agents can judge motion, composition, and layer reads.
 *
 * Usage: node tests/renderer.js [index-a.html]
 */
const fs = require('fs');
const path = require('path');
const {
  startServer,
  stopServer,
  launchGame,
  TestRunner,
  assert,
} = require('./helpers');

const htmlFile = process.argv[2] || 'index-a.html';
const FIXTURES = [
  { name: 'title', expectedWells: 1, timesMs: [500, 2000, 5000] },
  { name: 'singleWell', expectedWells: 1, timesMs: [500, 2000, 5000] },
  { name: 'interference', expectedWells: 2, timesMs: [500, 2000, 5000] },
];

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function takeShot(page, filepath) {
  await page.screenshot({ path: filepath });
}

async function setRenderDebug(page, { overlayVisible = false, showWellRadii = false, rendererView = 'ascii' } = {}) {
  await page.evaluate(({ overlayVisible, showWellRadii, rendererView }) => {
    window.__TEST_API.setOverlayVisible(overlayVisible);
    window.__TEST_API.setConfig('debug.showWellRadii', showWellRadii);
    window.__TEST_API.setConfig('debug.showFPS', false);
    window.__TEST_API.setConfig('debug.showFluidDiagnostic', false);
    window.__TEST_API.setConfig('debug.showVelocityField', false);
    window.__TEST_API.setConfig('debug.showCoordDiagnostic', false);
    window.__TEST_API.setRendererView(rendererView);
  }, { overlayVisible, showWellRadii, rendererView });
}

async function captureFixture(page, outputDir, fixture) {
  const fixtureDir = path.join(outputDir, fixture.name);
  fs.mkdirSync(fixtureDir, { recursive: true });

  const loaded = await page.evaluate((name) => window.__TEST_API.loadRendererFixture(name), fixture.name);
  assert(loaded, `Failed to load renderer fixture '${fixture.name}'`);

  await setRenderDebug(page, { overlayVisible: false, showWellRadii: false, rendererView: 'ascii' });
  await sleep(250);

  const wellData = await page.evaluate(() => window.__TEST_API.getWells());
  const fpsAtStart = await page.evaluate(() => window.__TEST_API.getFPS());
  assert(wellData.length === fixture.expectedWells,
    `Fixture '${fixture.name}' expected ${fixture.expectedWells} wells, got ${wellData.length}`);
  assert(fpsAtStart > 10, `Fixture '${fixture.name}' FPS too low at start: ${fpsAtStart}`);

  const captures = [];
  let elapsed = 0;
  for (const t of fixture.timesMs) {
    await sleep(t - elapsed);
    elapsed = t;

    const scenePath = path.join(fixtureDir, `scene-${String(t).padStart(4, '0')}ms.png`);
    const asciiPath = path.join(fixtureDir, `ascii-${String(t).padStart(4, '0')}ms.png`);

    await setRenderDebug(page, { overlayVisible: false, showWellRadii: false, rendererView: 'scene' });
    await sleep(50);
    await takeShot(page, scenePath);

    await setRenderDebug(page, { overlayVisible: false, showWellRadii: false, rendererView: 'ascii' });
    await sleep(50);
    await takeShot(page, asciiPath);

    const fps = await page.evaluate(() => window.__TEST_API.getFPS());
    captures.push({
      timeMs: t,
      fps,
      scenePath,
      asciiPath,
    });
  }

  const debugPath = path.join(fixtureDir, 'ascii-debug.png');
  await setRenderDebug(page, { overlayVisible: true, showWellRadii: true, rendererView: 'ascii' });
  await sleep(100);
  await takeShot(page, debugPath);

  await setRenderDebug(page, { overlayVisible: false, showWellRadii: false, rendererView: 'ascii' });

  return {
    name: fixture.name,
    expectedWells: fixture.expectedWells,
    wells: wellData,
    captures,
    debugPath,
  };
}

async function run() {
  console.log(`\n=== RENDERER HARNESS (${htmlFile}) ===\n`);

  const runner = new TestRunner('Renderer');
  await startServer();

  let browser, page;

  const runStamp = new Date().toISOString().replace(/[:.]/g, '');
  const outputDir = path.join(__dirname, 'screenshots', `renderer-${runStamp}`);
  fs.mkdirSync(outputDir, { recursive: true });

  try {
    ({ browser, page } = await launchGame(htmlFile));
    const hasAPI = await page.evaluate(() => typeof window.__TEST_API !== 'undefined');
    assert(hasAPI, 'window.__TEST_API not found');

    const manifest = {
      generatedAt: new Date().toISOString(),
      htmlFile,
      outputDir,
      fixtures: [],
    };

    for (const fixture of FIXTURES) {
      await runner.run(`Capture ${fixture.name} fixture`, async () => {
        const result = await captureFixture(page, outputDir, fixture);
        manifest.fixtures.push(result);
        console.log(`        Saved: ${path.relative(path.join(__dirname, '..'), result.debugPath)}`);
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
  console.error('Renderer harness fatal error:', err.message);
  stopServer();
  process.exit(1);
});
