/**
 * Bounded ordinary-authority capture for the Area 1 rich-current comparison.
 *
 * This deliberately uses the real protocol-v2 sim, a seeded Shallows launch,
 * and normal input. It does not stage a Bench wave or mutate player/world
 * state, so the result is visual evidence rather than a synthetic art fixture.
 *
 * Usage: FABRIC_CAPTURE_LABEL=before node tests/fabric-rich-current-capture.cjs
 */
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const {
  startSimServer,
  stopSimServer,
  launchGame,
  withQuery,
} = require('./helpers.cjs');

const ROOT = path.resolve(process.env.FABRIC_CAPTURE_ROOT || path.join(__dirname, '..'));
const STATIC_PORT = 8931;
const SIM_PORT = 8932;
const SIM_URL = `http://127.0.0.1:${SIM_PORT}`;
const LABEL = String(process.env.FABRIC_CAPTURE_LABEL || 'candidate').replace(/[^a-z0-9_-]/gi, '-');
const STAMP = new Date().toISOString().replace(/[:.]/g, '');
const OUTPUT_DIR = path.join(__dirname, 'screenshots', `fabric-rich-current-area1-${LABEL}-${STAMP}`);
const PREVIEW_SEED = 73043;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function waitFor(read, predicate, label, timeoutMs = 12000) {
  const deadline = Date.now() + timeoutMs;
  let value = null;
  while (Date.now() < deadline) {
    value = await read();
    if (predicate(value)) return value;
    await sleep(40);
  }
  throw new Error(`Timed out waiting for ${label}: ${JSON.stringify(value)}`);
}

async function startStaticServer() {
  const child = spawn(process.execPath, [
    path.join(ROOT, 'scripts', 'static-server.cjs'),
    '--host', '127.0.0.1', '--port', String(STATIC_PORT), '--root', ROOT,
    '--pid-file', path.join(ROOT, 'tmp', `fabric-rich-current-static-${STATIC_PORT}.pid`),
    '--meta-file', path.join(ROOT, 'tmp', `fabric-rich-current-static-${STATIC_PORT}.json`),
    '--label', 'lbh-fabric-rich-current-capture',
  ], { cwd: ROOT, stdio: 'ignore' });
  await waitFor(
    async () => {
      try { return (await fetch(`http://127.0.0.1:${STATIC_PORT}/index-a.html`)).ok; } catch { return false; }
    },
    Boolean,
    'dedicated static server',
  );
  return child;
}

async function capture(page, name) {
  const file = path.join(OUTPUT_DIR, `${name}.png`);
  await page.screenshot({ path: file });
  return {
    name,
    file,
    sha256: crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex'),
  };
}

async function snapshot() {
  const response = await fetch(`${SIM_URL}/snapshot`);
  if (!response.ok) throw new Error(`Authority snapshot failed: ${response.status}`);
  return response.json();
}

async function main() {
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  let browser;
  let staticServer;
  try {
    staticServer = await startStaticServer();
    await startSimServer(SIM_PORT, { keepAlive: true, idleShutdownMs: 8000 });
    const launched = await launchGame(withQuery(
      `http://127.0.0.1:${STATIC_PORT}/index-a.html`,
      { simServer: SIM_URL },
    ));
    browser = launched.browser;
    const { page } = launched;
    await page.setViewport({ width: 1280, height: 800, deviceScaleFactor: 1 });
    await waitFor(
      () => page.evaluate(() => Boolean(window.__TEST_API?.startRemoteGameNow)),
      Boolean,
      'test API boot',
    );
    await page.evaluate((seed) => {
      localStorage.clear();
      window.__TEST_API.createTestProfile('Fabric Current Capture');
      window.__TEST_API.showUiFixture('mapSelect', { mapIndex: 0, seed });
      window.__TEST_API.setConfig('ui.motion.reduced', true);
    }, PREVIEW_SEED);
    const started = await page.evaluate(() => window.__TEST_API.startRemoteGameNow(0));
    if (started !== true) throw new Error('Remote authority did not accept the Shallows launch');
    const network = await waitFor(
      () => page.evaluate(() => window.__TEST_API.getNetworkState()),
      (state) => state?.remoteAuthorityActive && state?.clientId,
      'remote authority',
    );
    const initial = await waitFor(
      async () => ({
        phase: await page.evaluate(() => window.__TEST_API.getGamePhase()),
        snapshot: await snapshot(),
      }),
      (state) => state?.phase === 'playing' && state?.snapshot?.session?.mapId === 'shallows',
      'ordinary Shallows authority snapshot',
    );
    await sleep(500);
    const captures = [await capture(page, '01-ordinary-authority-still')];
    const movementStart = await page.evaluate(() => window.__TEST_API.sendRemoteInput({
      moveX: 1,
      moveY: 0,
      thrust: 1,
      brake: 0,
    }));
    if (movementStart?.ok !== true) throw new Error(`Authority rejected capture input: ${JSON.stringify(movementStart)}`);
    await sleep(900);
    captures.push(await capture(page, '02-ordinary-authority-motion'));
    await page.evaluate(() => window.__TEST_API.sendRemoteInput({
      moveX: 1,
      moveY: 0,
      thrust: 0,
      brake: 0,
    }));
    await sleep(250);
    const final = await snapshot();
    const player = final?.players?.find((entry) => entry.clientId === network.clientId) || null;
    const manifest = {
      generatedAt: new Date().toISOString(),
      sourceHead: require('child_process').execFileSync('git', ['rev-parse', 'HEAD'], { cwd: ROOT, encoding: 'utf8' }).trim(),
      viewport: { width: 1280, height: 800 },
      classification: 'ORDINARY PROTOCOL-V2 AUTHORITY GAMEPLAY — NO BENCH OR DEBUG WORLD MUTATION',
      mapId: initial.snapshot.session.mapId,
      previewSeed: PREVIEW_SEED,
      clientId: network.clientId,
      initialTick: initial.snapshot.tick,
      finalTick: final?.tick ?? null,
      player: player ? { wx: player.wx, wy: player.wy, vx: player.vx, vy: player.vy } : null,
      captures,
      browserErrors: launched.errors,
    };
    fs.writeFileSync(path.join(OUTPUT_DIR, 'manifest.json'), JSON.stringify(manifest, null, 2));
    console.log(JSON.stringify({ outputDir: OUTPUT_DIR, manifest }, null, 2));
    if (launched.errors.length) throw new Error(`Browser errors: ${launched.errors.join('; ')}`);
  } finally {
    if (browser) await browser.close().catch(() => null);
    await stopSimServer(SIM_PORT).catch(() => null);
    staticServer?.kill('SIGTERM');
  }
}

main().catch((error) => {
  console.error(error.stack || error.message);
  process.exit(1);
});
