const puppeteer = require('puppeteer');
const path = require('path');
const helpers = require('/Users/theysayheygreg/clawd/projects/last-black-hole/tests/helpers.cjs');

(async () => {
  await helpers.startServer();
  const browser = await puppeteer.launch({ headless: 'new' });
  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 810 });
  await page.goto(`http://127.0.0.1:${helpers.PORT}/index-a.html`, { waitUntil: 'networkidle0' });
  await page.waitForFunction(() => window.__TEST_API && window.__TEST_API.triggerRestart);
  await new Promise(r => setTimeout(r, 1000));
  await page.evaluate(() => window.__TEST_API.createTestProfile('FuelTest'));
  await page.evaluate(() => window.__TEST_API.triggerRestart());
  await new Promise(r => setTimeout(r, 1500));

  const snapshot = await page.evaluate(() => ({
    phase: window.__TEST_API.getGamePhase(),
    fuelEl: document.getElementById('hud-fuel-fill')?.style.width,
    fuelReadout: document.getElementById('hud-fuel-readout')?.textContent,
    shipDeltaV: document.querySelector('#hud') ? null : 'no hud',
  }));
  console.log('snapshot:', JSON.stringify(snapshot));

  // Fire thrust for 2s
  await page.keyboard.down('KeyW');
  await new Promise(r => setTimeout(r, 2000));
  const burning = await page.evaluate(() => ({
    fuelEl: document.getElementById('hud-fuel-fill')?.style.width,
    fuelColor: document.getElementById('hud-fuel-fill')?.style.backgroundColor,
    fuelReadout: document.getElementById('hud-fuel-readout')?.textContent,
  }));
  console.log('after 2s thrust:', JSON.stringify(burning));
  await page.keyboard.up('KeyW');

  const path = require('path');
  const out = path.join(__dirname, 'fuel-probe.png');
  await page.screenshot({ path: out });
  console.log('screenshot:', out);

  await browser.close();
  helpers.stopServer();
})().catch(e => { console.error(e.message); process.exit(1); });
