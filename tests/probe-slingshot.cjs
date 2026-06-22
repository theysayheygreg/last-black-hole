// Diagnostic probe for the slingshot system. Boots the game, starts a
// run, builds up speed via thrust, presses F near a well to engage,
// holds, presses F again to release. Logs the velocity profile so we
// can confirm engage/release/boost actually fire end-to-end.

const path = require('path');
const { startServer, stopServer, launchGame, stepGameFrames } = require('./helpers.cjs');

(async () => {
  await startServer();
  const { browser, page } = await launchGame('index-a.html');
  page.on('pageerror', (err) => console.log('[page error]', err.message));
  await page.waitForFunction(
    () => Boolean(window.__TEST_API?.triggerRestart) && window.__TEST_API.getGamePhase?.() === 'title',
    { timeout: 5000 },
  );
  await stepGameFrames(page, 36);
  await page.evaluate(() => window.__TEST_API.createTestProfile('SlingTest'));
  await page.evaluate(() => window.__TEST_API.triggerRestart());
  await stepGameFrames(page, 90);

  const wells = await page.evaluate(() => window.__TEST_API.getWells());
  if (!wells.length) { console.log('no wells in this map'); await browser.close(); stopServer(); return; }
  const w = wells[0];
  console.log('targeting well at', JSON.stringify({ wx: w.wx, wy: w.wy, mass: w.mass }));

  // Park ship 0.4 world-units away from the well. Drag will bleed any
  // residual velocity from spawn; we'll thrust in a moment to build a
  // tangential vector.
  await page.evaluate(({ wx, wy }) => window.__TEST_API.teleportShip(wx + 0.4, wy), { wx: w.wx, wy: w.wy });
  await stepGameFrames(page, 18);

  // Hold thrust for ~1s to build speed (ship default-faces +x; will
  // pick up tangential component as it accelerates and gets pulled
  // by the well).
  await page.keyboard.down('KeyW');
  await stepGameFrames(page, 60);
  await page.keyboard.up('KeyW');
  await stepGameFrames(page, 6);

  const before = await page.evaluate(() => {
    const v = window.__TEST_API.getShipVel();
    const p = window.__TEST_API.getShipPos();
    return { wx: p.x, wy: p.y, vx: v.x, vy: v.y, speed: Math.hypot(v.x, v.y) };
  });
  console.log('pre-engage:', JSON.stringify(before));

  // Engage F
  await page.keyboard.down('KeyF');
  await stepGameFrames(page, 5);
  await page.keyboard.up('KeyF');
  await stepGameFrames(page, 5);

  // Hold for ~1.5s of orbit to bank energy
  await stepGameFrames(page, 90);

  const orbiting = await page.evaluate(() => {
    const v = window.__TEST_API.getShipVel();
    const s = window.__TEST_API.getSlingshotState();
    return { vx: v.x, vy: v.y, speed: Math.hypot(v.x, v.y), sling: s };
  });
  console.log('mid-orbit (1.5s in):', JSON.stringify(orbiting));

  // Release F
  await page.keyboard.down('KeyF');
  await stepGameFrames(page, 5);
  await page.keyboard.up('KeyF');
  await stepGameFrames(page, 6);

  const released = await page.evaluate(() => {
    const v = window.__TEST_API.getShipVel();
    const s = window.__TEST_API.getSlingshotState();
    return { vx: v.x, vy: v.y, speed: Math.hypot(v.x, v.y), sling: s };
  });
  console.log('post-release:', JSON.stringify(released));

  await page.screenshot({ path: path.join(__dirname, 'slingshot-probe.png') });
  console.log('screenshot saved');

  await browser.close();
  stopServer();
})().catch(e => { console.error(e.message); process.exit(1); });
