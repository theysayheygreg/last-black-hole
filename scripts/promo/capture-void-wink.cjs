/**
 * capture-void-wink.cjs — capture the "void stares back" promo fixture.
 *
 * Boots the game page in capture mode, loads the promoVoidStares renderer
 * fixture, steps the loop deterministically, and writes:
 *   docs/promo/void-stares-back/frames/frame-NNN.png   (one 6 s wink loop @30fps)
 *   docs/promo/void-stares-back/still-stare.png
 *   docs/promo/void-stares-back/still-wink.png
 *   docs/promo/void-stares-back/still-glint.png
 * Assemble video/GIF afterward with ffmpeg (see PROMO-README.md alongside
 * the output).
 *
 * Usage: node scripts/promo/capture-void-wink.cjs [index-a.html]
 */
const fs = require('fs');
const path = require('path');
const {
  startServer,
  stopServer,
  launchGame,
  withQuery,
  stepGameFrames,
} = require('../../tests/helpers.cjs');

const FPS = 30;
const PERIOD = 6; // must match promoWink.periodSeconds
const FRAMES = PERIOD * FPS;
// Timeline landmarks (seconds into the period; must match promo-wink.js math):
// wink starts at period - (close+hold+reopen+glint) - 0.4 = 4.32
const STILLS = {
  'still-stare': 2.0,   // eye fully open, mid-stare
  'still-wink': 4.63,   // lid closed, lash-arc + lashes
  'still-glint': 5.15,  // catchlight at full pop
};

async function capturePng(page, filepath) {
  const dataUrl = await page.evaluate(() => {
    const canvasId = window.__TEST_API?.getRenderCanvasId?.() || 'fluid-canvas';
    const source = document.getElementById(canvasId);
    const overlay = document.getElementById('overlay-canvas');
    const out = document.createElement('canvas');
    out.width = source.width;
    out.height = source.height;
    const c = out.getContext('2d');
    c.drawImage(source, 0, 0);
    if (overlay) c.drawImage(overlay, 0, 0, out.width, out.height);
    return out.toDataURL('image/png');
  });
  fs.writeFileSync(filepath, Buffer.from(dataUrl.split(',')[1], 'base64'));
}

(async () => {
  const htmlFile = process.argv[2] || 'index-a.html';
  const outDir = path.join(__dirname, '..', '..', 'docs', 'promo', 'void-stares-back');
  const frameDir = path.join(outDir, 'frames');
  fs.mkdirSync(frameDir, { recursive: true });

  await startServer();
  let browser;
  try {
    let page;
    ({ browser, page } = await launchGame(withQuery(htmlFile, { capture: 1 })));

    const loaded = await page.evaluate(() => window.__TEST_API.loadRendererFixture('promoVoidStares'));
    if (!loaded) throw new Error('promoVoidStares fixture failed to load');

    await page.evaluate(() => {
      window.__TEST_API.setConfig('debug.showFPS', false);
      window.__TEST_API.setConfig('debug.showWellRadii', false);
      window.__TEST_API.setConfig('debug.showFluidDiagnostic', false);
      window.__TEST_API.setConfig('debug.showVelocityField', false);
      window.__TEST_API.setConfig('debug.showCoordDiagnostic', false);
    });

    // The game loop free-runs on rAF (stepFrameForTest does not pause it),
    // so exact wink phase comes from pinning the promo clock per frame.
    // The fluid underneath stays live — that keeps the fabric breathing.
    await stepGameFrames(page, 120); // let the fluid develop

    const stillFrames = new Map(Object.entries(STILLS).map(
      ([name, t]) => [Math.round(t * FPS), name]
    ));
    for (let i = 0; i < FRAMES; i++) {
      await page.evaluate((t) => { window.__LBH_PROMO_TIME = t; }, i / FPS);
      await new Promise((r) => setTimeout(r, 60)); // let a couple rAF frames render it
      await capturePng(page, path.join(frameDir, `frame-${String(i).padStart(3, '0')}.png`));
      const stillName = stillFrames.get(i);
      if (stillName) {
        fs.copyFileSync(
          path.join(frameDir, `frame-${String(i).padStart(3, '0')}.png`),
          path.join(outDir, `${stillName}.png`)
        );
        console.log(`  ${stillName} @ frame ${i}`);
      }
    }
    console.log(`captured ${FRAMES} frames -> ${frameDir}`);
  } finally {
    if (browser) await browser.close();
    stopServer();
  }
})().catch((e) => { console.error(e); process.exit(1); });
