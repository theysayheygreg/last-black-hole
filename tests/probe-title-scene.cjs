// tests/probe-title-scene.js
//
// Quick probe: opens the real main game (index-a.html), waits for the
// title phase to be live, and captures a screenshot. Used to verify the
// title prototype merge — the title scene in the merged build should
// match the standalone title-prototype visually (accretion ramp + drift
// + title-tuned post-processing).

const path = require('path');
const fs = require('fs');
const { startServer, stopServer, launchGame, stepGameFrames } = require('./helpers.cjs');

const OUT = path.join(__dirname, 'screenshots', 'title-scene');
fs.mkdirSync(OUT, { recursive: true });

(async () => {
  await startServer();
  let browser;
  try {
    const launched = await launchGame('index-a.html');
    browser = launched.browser;
    const page = launched.page;
    await page.waitForFunction(() => window.__TEST_API && window.__TEST_API.getGamePhase);
    await page.waitForFunction(() => window.__TEST_API.getGamePhase() === 'title');
    // Let the title settle and the lissajous drift get off its starting point.
    await stepGameFrames(page, 90);
    const phase = await page.evaluate(() => window.__TEST_API.getGamePhase());
    console.log('phase:', phase);
    const outPath = path.join(OUT, `title-${new Date().toISOString().replace(/[:.]/g, '-')}.png`);
    await page.screenshot({ path: outPath });
    console.log('saved:', outPath);
  } finally {
    await browser.close();
    stopServer();
  }
})();
