/**
 * perf-probe.js — local perf probe for map scale and render-chain cost.
 *
 * This is intentionally not part of npm test. It is a diagnostic harness for
 * the 5x5/10x10 perf lane: FPS, smoothed frame timings, visible well count,
 * fluid resolution, composer passes, and authoritative snapshot payload size.
 */
const {
  startServer,
  stopServer,
  startSimServer,
  stopSimServer,
  launchGame,
} = require("./helpers");

const SIM_PORT = 8794;
const SIM_URL = `http://127.0.0.1:${SIM_PORT}`;
const MAPS = [
  { index: 0, id: "shallows", label: "3x3", scale: 3 },
  { index: 1, id: "expanse", label: "5x5", scale: 5 },
  { index: 2, id: "deep-field", label: "10x10", scale: 10 },
];

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function measurePageScenario(htmlFile, map) {
  const { browser, page, errors } = await launchGame(htmlFile);
  try {
    await page.waitForFunction(() => window.__TEST_API?.startGameOnMap && window.__TEST_API?.getPerfStats, { timeout: 8000 });
    const ok = await page.evaluate((index) => window.__TEST_API.startGameOnMap(index), map.index);
    if (!ok) throw new Error(`Could not start map ${map.label}`);
    await page.evaluate((scale) => {
      const wells = window.__TEST_API.getWells();
      let best = { x: scale / 2, y: scale / 2, dist: -Infinity };
      const steps = 24;
      for (let ix = 0; ix <= steps; ix++) {
        for (let iy = 0; iy <= steps; iy++) {
          const x = (ix + 0.5) * scale / (steps + 1);
          const y = (iy + 0.5) * scale / (steps + 1);
          let nearest = Infinity;
          for (const well of wells) {
            let dx = Math.abs(x - well.wx);
            let dy = Math.abs(y - well.wy);
            if (dx > scale / 2) dx = scale - dx;
            if (dy > scale / 2) dy = scale - dy;
            nearest = Math.min(nearest, Math.hypot(dx, dy));
          }
          if (nearest > best.dist) best = { x, y, dist: nearest };
        }
      }
      window.__TEST_API.teleportShip(best.x, best.y);
    }, map.scale);
    await sleep(8500);
    const result = await page.evaluate(() => ({
      fps: window.__TEST_API.getFPS(),
      perf: window.__TEST_API.getPerfStats(),
      phase: window.__TEST_API.getGamePhase(),
      wells: window.__TEST_API.getWells().length,
      stars: window.__TEST_API.getStars().length,
      wrecks: window.__TEST_API.getWrecks().length,
      comets: window.__TEST_API.getComets().length,
    }));
    return { map: map.label, htmlFile, errors, ...result };
  } finally {
    await browser.close();
  }
}

async function measureSnapshotPayload(map) {
  await fetch(`${SIM_URL}/session/start`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      mapId: map.id,
      requesterId: "perf-probe",
      requesterName: "Perf Probe",
    }),
  });
  await sleep(500);
  const response = await fetch(`${SIM_URL}/snapshot`);
  const text = await response.text();
  const snapshot = JSON.parse(text);
  return {
    map: map.label,
    bytes: Buffer.byteLength(text),
    snapshotHz: snapshot.session?.snapshotHz,
    tickHz: snapshot.session?.tickHz,
    players: snapshot.players?.length ?? 0,
    wells: snapshot.world?.wells?.length ?? 0,
    stars: snapshot.world?.stars?.length ?? 0,
    wrecks: snapshot.world?.wrecks?.length ?? 0,
    comets: snapshot.world?.planetoids?.length ?? 0,
    scavengers: snapshot.world?.scavengers?.length ?? 0,
  };
}

async function run() {
  await startServer();
  await startSimServer(SIM_PORT, { keepAlive: true });
  try {
    const scenarios = [];
    for (const map of MAPS) {
      scenarios.push(await measurePageScenario("index-a.html", map));
    }
    scenarios.push(await measurePageScenario("index-a.html?minimalrender=1", MAPS[2]));
    scenarios.push(await measurePageScenario("index-a.html?disable=bloom,color-grade,vignette,chromatic-aberration,scanlines", MAPS[2]));

    const payloads = [];
    for (const map of MAPS) {
      payloads.push(await measureSnapshotPayload(map));
    }

    console.log(JSON.stringify({ scenarios, payloads }, null, 2));
  } finally {
    await stopSimServer(SIM_PORT);
    stopServer();
  }
}

run().catch(async (err) => {
  console.error(err);
  try { await stopSimServer(SIM_PORT); } catch {}
  stopServer();
  process.exit(1);
});
