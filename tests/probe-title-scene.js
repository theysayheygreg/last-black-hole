// tests/probe-title-scene.js
//
// Quick probe: opens the real main game (index-a.html), waits for the
// title phase to be live, and captures a screenshot. Used to verify the
// title prototype merge — the title scene in the merged build should
// match the standalone title-prototype visually (accretion ramp + drift
// + title-tuned post-processing).

const puppeteer = require('puppeteer');
const path = require('path');
const fs = require('fs');
const { startServer, stopServer, PORT } = require('./helpers');

const OUT = path.join(__dirname, 'screenshots', 'title-scene');
fs.mkdirSync(OUT, { recursive: true });

(async () => {
  await startServer();
  const browser = await puppeteer.launch({ headless: 'new' });
  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 1440, height: 810, deviceScaleFactor: 1 });
    await page.goto(`http://127.0.0.1:${PORT}/index-a.html`, { waitUntil: 'networkidle0' });
    await page.waitForFunction(() => window.__TEST_API && window.__TEST_API.getGamePhase);
    await page.waitForFunction(() => window.__TEST_API.getGamePhase() === 'title');
    // Let the title settle and the lissajous drift get off its starting point.
    await new Promise((r) => setTimeout(r, 1500));
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
