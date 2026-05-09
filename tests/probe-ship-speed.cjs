// Diagnostic probe: measure ship dynamics across map sizes.
//
// Captures:
//   - signature per run (signatures vary the physics CONFIG per scale)
//   - fluid velocity at ship spawn (fluid coupling input)
//   - early-transient speed (0.5s) + steady-state (6s)
//   - well count, nearest-well distance at spawn
//   - effective thrust/drag/coupling config
//
// Read-only — does not write back or commit anything.

const puppeteer = require('puppeteer');
const { startServer, stopServer, PORT } = require('./helpers.cjs');

const TRIALS_PER_MAP = 3;
const THRUST_WARMUP_MS = 500;
const THRUST_STEADY_MS = 5500;

async function probeOne(page, mapIdx) {
  const loaded = await page.evaluate((i) => window.__TEST_API.startGameOnMap(i), mapIdx);
  if (!loaded) return null;
  await new Promise(r => setTimeout(r, 400));

  const spawn = await page.evaluate(() => {
    const api = window.__TEST_API;
    const wells = api.getWells();
    let bestX = 0.2, bestY = 0.2, bestDist = 0;
    for (let x = 0.2; x < 1.0; x += 0.2) {
      for (let y = 0.2; y < 1.0; y += 0.2) {
        let near = Infinity;
        for (const w of wells) {
          const dx = x - w.wx, dy = y - w.wy;
          near = Math.min(near, Math.sqrt(dx*dx + dy*dy));
        }
        if (near > bestDist) { bestDist = near; bestX = x; bestY = y; }
      }
    }
    api.teleportShip(bestX, bestY);
    const fvel = api.getFluidVelAt(bestX, bestY);
    return {
      bestX, bestY, bestDist,
      wellCount: wells.length,
      fluidVxAtSpawn: fvel.x, fluidVyAtSpawn: fvel.y,
      fluidSpeedAtSpawn: Math.sqrt(fvel.x * fvel.x + fvel.y * fvel.y),
    };
  });

  await page.keyboard.down('KeyW');
  await new Promise(r => setTimeout(r, THRUST_WARMUP_MS));
  const transient = await page.evaluate(() => {
    const v = window.__TEST_API.getShipVel();
    return { speed: Math.sqrt(v.x*v.x + v.y*v.y) };
  });
  await new Promise(r => setTimeout(r, THRUST_STEADY_MS));
  const steady = await page.evaluate(() => {
    const v = window.__TEST_API.getShipVel();
    const p = window.__TEST_API.getShipPos();
    const fvel = window.__TEST_API.getFluidVelAt(p.x, p.y);
    return {
      vx: v.x, vy: v.y,
      speed: Math.sqrt(v.x*v.x + v.y*v.y),
      fluidSpeedAtShip: Math.sqrt(fvel.x*fvel.x + fvel.y*fvel.y),
    };
  });
  await page.keyboard.up('KeyW');

  const cfg = await page.evaluate(() => {
    const c = window.__TEST_API.getConfig();
    return {
      thrustAccel: c.ship.thrustAccel,
      drag: c.ship.drag,
      fluidCoupling: c.ship.fluidCoupling,
      wellsGravity: c.wells.gravity,
      shipPullStrength: c.wells.shipPullStrength,
      fluidViscosity: c.fluid.viscosity,
    };
  });

  return { ...spawn, ...cfg, transientSpeed: transient.speed, steadySpeed: steady.speed, fluidSpeedAtShip: steady.fluidSpeedAtShip };
}

(async () => {
  await startServer();
  const browser = await puppeteer.launch({ headless: 'new' });
  const page = await browser.newPage();
  page.on('console', m => {
    if (m.type() === 'error') console.log('[page error]', m.text());
  });
  await page.setViewport({ width: 1440, height: 810 });
  await page.goto(`http://127.0.0.1:${PORT}/index-a.html`, { waitUntil: 'networkidle0' });
  await page.waitForFunction(() => window.__TEST_API && window.__TEST_API.startGameOnMap);

  const all = { shallows: [], expanse: [], deep: [] };
  const keys = ['shallows', 'expanse', 'deep'];
  for (let trial = 0; trial < TRIALS_PER_MAP; trial++) {
    for (let idx = 0; idx < 3; idx++) {
      const r = await probeOne(page, idx);
      if (r) all[keys[idx]].push(r);
    }
  }

  await browser.close();
  stopServer();

  console.log('\n=== RESULTS ===');
  for (const k of keys) {
    console.log(`\n${k} (${all[k].length} trials):`);
    for (const r of all[k]) {
      console.log(`  wells=${r.wellCount} dNearest=${r.bestDist.toFixed(2)}  ` +
        `fluidAtSpawn=${r.fluidSpeedAtSpawn.toFixed(4)}  fluidAtShip=${r.fluidSpeedAtShip.toFixed(4)}  ` +
        `transient0.5s=${r.transientSpeed.toFixed(3)}  steady6s=${r.steadySpeed.toFixed(3)}  ` +
        `wellsGravity=${r.wellsGravity}  viscosity=${r.fluidViscosity}`);
    }
    const steady = all[k].map(r => r.steadySpeed);
    const transient = all[k].map(r => r.transientSpeed);
    const fluid = all[k].map(r => r.fluidSpeedAtShip);
    const grav = all[k].map(r => r.wellsGravity);
    console.log(`  AVG steady=${(steady.reduce((a,b)=>a+b,0)/steady.length).toFixed(3)}  ` +
      `transient=${(transient.reduce((a,b)=>a+b,0)/transient.length).toFixed(3)}  ` +
      `fluid@ship=${(fluid.reduce((a,b)=>a+b,0)/fluid.length).toFixed(4)}  ` +
      `gravity range=[${Math.min(...grav)}..${Math.max(...grav)}]`);
  }
})().catch(e => { console.error(e); process.exit(1); });
