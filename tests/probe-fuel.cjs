const path = require('path');
const helpers = require('./helpers.cjs');

(async () => {
  await helpers.startServer();
  const { browser, page } = await helpers.launchGame('index-a.html');
  await page.waitForFunction(() => window.__TEST_API && window.__TEST_API.triggerRestart);
  await helpers.stepGameFrames(page, 60);
  await page.evaluate(() => window.__TEST_API.createTestProfile('FuelTest'));
  await page.evaluate(() => window.__TEST_API.triggerRestart());
  await helpers.stepGameFrames(page, 90);

  const snapshot = await page.evaluate(() => ({
    phase: window.__TEST_API.getGamePhase(),
    fuelEl: document.getElementById('hud-fuel-fill')?.style.width,
    fuelReadout: document.getElementById('hud-fuel-readout')?.textContent,
    shipDeltaV: document.querySelector('#hud') ? null : 'no hud',
  }));
  console.log('snapshot:', JSON.stringify(snapshot));

  // Fire thrust for 2s
  await page.keyboard.down('KeyW');
  await helpers.stepGameFrames(page, 120);
  const burning = await page.evaluate(() => ({
    fuelEl: document.getElementById('hud-fuel-fill')?.style.width,
    fuelColor: document.getElementById('hud-fuel-fill')?.style.backgroundColor,
    fuelReadout: document.getElementById('hud-fuel-readout')?.textContent,
  }));
  console.log('after 2s thrust:', JSON.stringify(burning));
  await page.keyboard.up('KeyW');

  const out = path.join(__dirname, 'fuel-probe.png');
  await page.screenshot({ path: out });
  console.log('screenshot:', out);

  await browser.close();
  helpers.stopServer();
})().catch(e => { console.error(e.message); process.exit(1); });
