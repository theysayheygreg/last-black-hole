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
  withQuery,
  stepGameFrames,
} = require('./helpers.cjs');

const htmlFile = process.argv[2] || 'index-a.html';
const ALL_FIXTURES = [
  { name: 'title', expectedWells: 1, minFps: 10, timesMs: [500, 2000, 5000] },
  { name: 'singleWell', expectedWells: 1, minFps: 10, timesMs: [500, 2000, 5000] },
  { name: 'interference', expectedWells: 2, minFps: 10, timesMs: [500, 2000, 5000] },
  { name: 'singleWell5x5', expectedWells: 1, minFps: 8, timesMs: [500, 2000, 5000] },
  { name: 'interference10x10', expectedWells: 2, minFps: 5, timesMs: [500, 2000, 5000] },
];
const DEFAULT_FIXTURES = new Set(['title', 'interference', 'interference10x10']);
const DEEP_RENDERER_SWEEP = process.env.LBH_RENDERER_DEEP === '1';
const FIXTURES = DEEP_RENDERER_SWEEP
  ? ALL_FIXTURES
  : ALL_FIXTURES
    .filter((fixture) => DEFAULT_FIXTURES.has(fixture.name))
    .map((fixture) => ({ ...fixture, timesMs: [900] }));

async function stepForMs(page, ms, dt = 1 / 60) {
  const frames = Math.max(1, Math.ceil(ms / (dt * 1000)));
  return stepGameFrames(page, frames, dt);
}

async function takeShot(page, filepath, backend = 'legacy') {
  const stats = await page.evaluate((backendName) => {
    const canvasId = window.__TEST_API?.getRenderCanvasId?.();
    const source = document.getElementById(canvasId || 'fluid-canvas');
    const overlay = document.getElementById('overlay-canvas');
    if (!source) throw new Error(`${backendName} source canvas missing`);
    const out = document.createElement('canvas');
    out.width = source.width;
    out.height = source.height;
    const ctx = out.getContext('2d');
    ctx.drawImage(source, 0, 0);
    if (overlay && getComputedStyle(overlay).opacity !== '0') {
      ctx.drawImage(overlay, 0, 0);
    }
    const pixels = ctx.getImageData(0, 0, out.width, out.height).data;
    let rgbMax = 0;
    let rgbSum = 0;
    let litPixels = 0;
    for (let i = 0; i < pixels.length; i += 4) {
      const rgb = pixels[i] + pixels[i + 1] + pixels[i + 2];
      rgbMax = Math.max(rgbMax, rgb);
      rgbSum += rgb;
      if (rgb > 8) litPixels++;
    }
    return {
      width: out.width,
      height: out.height,
      rgbMax,
      rgbAvg: rgbSum / (pixels.length / 4),
      litPixels,
    };
  }, backend);
  await page.screenshot({ path: filepath });
  return stats;
}

function assertCaptureHasSignal(stats, label) {
  assert(stats.rgbMax > 8, `${label} capture is blank; max RGB ${stats.rgbMax}`);
  assert(stats.litPixels > 64, `${label} capture has too few lit pixels: ${stats.litPixels}`);
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

function expectedBackendFor(htmlFile) {
  const queryIndex = String(htmlFile).indexOf('?');
  if (queryIndex < 0) return 'three';
  const params = new URLSearchParams(String(htmlFile).slice(queryIndex + 1));
  return params.get('renderer') === 'legacy' ? 'legacy' : 'three';
}

async function captureFixture(page, outputDir, fixture) {
  const fixtureDir = path.join(outputDir, fixture.name);
  fs.mkdirSync(fixtureDir, { recursive: true });

  const loaded = await page.evaluate((name) => window.__TEST_API.loadRendererFixture(name), fixture.name);
  assert(loaded, `Failed to load renderer fixture '${fixture.name}'`);
  const backend = await page.evaluate(() => window.__TEST_API.getRendererBackend?.() || 'legacy');
  const renderCanvasId = await page.evaluate(() => window.__TEST_API.getRenderCanvasId?.() || 'fluid-canvas');
  assert(backend === expectedBackendFor(htmlFile),
    `Fixture '${fixture.name}' expected ${expectedBackendFor(htmlFile)} renderer, got ${backend}`);
  if (backend === 'three') {
    assert(renderCanvasId === 'fluid-canvas',
      `Fixture '${fixture.name}' expected Three to share fluid-canvas, got ${renderCanvasId}`);
  }

  await setRenderDebug(page, { overlayVisible: false, showWellRadii: false, rendererView: 'ascii' });
  await stepForMs(page, 250);

  const wellData = await page.evaluate(() => window.__TEST_API.getWells());
  const fpsAtStart = await page.evaluate(() => window.__TEST_API.getFPS());
  assert(wellData.length === fixture.expectedWells,
    `Fixture '${fixture.name}' expected ${fixture.expectedWells} wells, got ${wellData.length}`);
  assert(fpsAtStart > fixture.minFps, `Fixture '${fixture.name}' FPS too low at start: ${fpsAtStart}`);

  const captures = [];
  let elapsed = 0;
  for (const t of fixture.timesMs) {
    await stepForMs(page, t - elapsed);
    elapsed = t;

    const scenePath = path.join(fixtureDir, `scene-${String(t).padStart(4, '0')}ms.png`);
    const asciiPath = path.join(fixtureDir, `ascii-${String(t).padStart(4, '0')}ms.png`);

    await setRenderDebug(page, { overlayVisible: false, showWellRadii: false, rendererView: 'scene' });
    await stepGameFrames(page, 2);
    const sceneStats = await takeShot(page, scenePath, backend);
    assertCaptureHasSignal(sceneStats, `${fixture.name} scene ${t}ms`);

    await setRenderDebug(page, { overlayVisible: false, showWellRadii: false, rendererView: 'ascii' });
    await stepGameFrames(page, 2);
    const asciiStats = await takeShot(page, asciiPath, backend);
    assertCaptureHasSignal(asciiStats, `${fixture.name} ascii ${t}ms`);

    const fps = await page.evaluate(() => window.__TEST_API.getFPS());
    captures.push({
      timeMs: t,
      fps,
      scenePath,
      asciiPath,
      sceneStats,
      asciiStats,
    });
  }

  const debugPath = path.join(fixtureDir, 'ascii-debug.png');
  await setRenderDebug(page, { overlayVisible: true, showWellRadii: true, rendererView: 'ascii' });
  await stepGameFrames(page, 4);
  const debugStats = await takeShot(page, debugPath, backend);
  assertCaptureHasSignal(debugStats, `${fixture.name} debug`);

  await setRenderDebug(page, { overlayVisible: false, showWellRadii: false, rendererView: 'ascii' });
  const perf = await page.evaluate(() => window.__TEST_API.getPerfStats?.() || null);
  const backendStats = await page.evaluate(() => window.__TEST_API.getRendererBackendStats?.() || null);
  if (backend === 'three') {
    assert(backendStats?.backend === 'three', `Fixture '${fixture.name}' backend stats did not report three`);
    assert(backendStats?.passCount >= 5, `Fixture '${fixture.name}' Three render graph is missing passes`);
    assert(backendStats?.three?.sceneKind === 'top-down-3d',
      `Fixture '${fixture.name}' Three scene is not first-class 3D`);
    assert(backendStats?.three?.camera?.kind === 'orthographic-top-down',
      `Fixture '${fixture.name}' Three camera is not the top-down orthographic camera`);
    const camera = backendStats.three.camera;
    const captureAspect = captures[0]?.asciiStats?.width / captures[0]?.asciiStats?.height;
    assert(Math.abs(camera.aspect - captureAspect) < 0.02,
      `Fixture '${fixture.name}' Three camera aspect ${camera.aspect} does not match capture ${captureAspect}`);
    assert(Math.abs(camera.worldViewHeight - 1.0) < 1e-6,
      `Fixture '${fixture.name}' Three camera vertical world span should stay 1.0, got ${camera.worldViewHeight}`);
    assert(Math.abs(camera.worldViewWidth - camera.aspect) < 0.02,
      `Fixture '${fixture.name}' Three camera horizontal span should be aspect-wide, got ${camera.worldViewWidth}`);
    assert(Math.abs(camera.right + camera.left) < 1e-6 && Math.abs(camera.top + camera.bottom) < 1e-6,
      `Fixture '${fixture.name}' Three camera is not centered on the top-down view`);
    assert(Array.isArray(backendStats?.three?.worldLayers)
      && backendStats.three.worldLayers.some((layer) => layer.name === 'fabric-source-layer')
      && backendStats.three.worldLayers.some((layer) => layer.name === 'background-parallax-field')
      && backendStats.three.worldLayers.some((layer) => layer.name === 'semantic-flow-field-layer')
      && backendStats.three.worldLayers.some((layer) => layer.name === 'world-entity-layer'),
    `Fixture '${fixture.name}' Three world layers missing`);
    assert((backendStats.three.entityCount || 0) > 0,
      `Fixture '${fixture.name}' Three scene did not submit world entities`);
    assert((backendStats.three.semanticCount || 0) > 0,
      `Fixture '${fixture.name}' Three scene did not submit semantic flow cues`);
    assert(Array.isArray(backendStats?.three?.passNames) && backendStats.three.passNames.includes('three-screen-space-post'),
      `Fixture '${fixture.name}' Three pass list missing screen-space post`);
    assert(backendStats.three.sharedContext === true,
      `Fixture '${fixture.name}' Three renderer is not sharing the Composer context`);
    assert(backendStats.three.canvasUploads === 0,
      `Fixture '${fixture.name}' Three renderer is still reporting canvas uploads`);
    assert((backendStats.three.pooledMeshes || 0) > 0,
      `Fixture '${fixture.name}' Three scene did not allocate pooled meshes`);
  }

  return {
    name: fixture.name,
    rendererBackend: backend,
    renderCanvasId,
    expectedWells: fixture.expectedWells,
    minFps: fixture.minFps,
    wells: wellData,
    perf,
    backendStats,
    captures,
    debugPath,
    debugStats,
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

  const captureTarget = withQuery(htmlFile, { capture: 1 });

  try {
    ({ browser, page } = await launchGame(captureTarget));
    const hasAPI = await page.evaluate(() => typeof window.__TEST_API !== 'undefined');
    assert(hasAPI, 'window.__TEST_API not found');

    const manifest = {
      generatedAt: new Date().toISOString(),
      htmlFile,
      captureTarget,
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
