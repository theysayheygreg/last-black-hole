const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { startServer, stopServer, launchGame } = require('./helpers.cjs');

const ROOT = path.resolve(__dirname, '..');
const STAMP = new Date().toISOString().replace(/[:.]/g, '');
const OUTPUT_DIR = path.join(__dirname, 'screenshots', `fabric-event-wave-${STAMP}`);

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function capture(page, name) {
  const file = path.join(OUTPUT_DIR, `${name}.png`);
  await page.screenshot({ path: file });
  return {
    name,
    file,
    sha256: crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex'),
  };
}

async function main() {
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  await startServer();
  let browser;
  try {
    const launched = await launchGame('index-a.html?renderer=three');
    browser = launched.browser;
    const page = launched.page;
    await page.setViewport({ width: 1280, height: 800, deviceScaleFactor: 1 });
    const deadline = Date.now() + 10000;
    while (!(await page.evaluate(() => Boolean(window.__TEST_API?.startGameOnMap)))) {
      if (Date.now() >= deadline) {
        const diagnostics = await page.evaluate(() => ({
          href: location.href,
          boot: window.__LBH_BOOT_STATE__ || null,
          apiType: typeof window.__TEST_API,
          body: document.body?.innerText?.slice(0, 300) || '',
        }));
        throw new Error(`Timed out waiting for test API boot: ${JSON.stringify(diagnostics)}`);
      }
      await sleep(50);
    }
    await page.evaluate(() => {
      localStorage.clear();
      window.__TEST_API.createTestProfile('Fabric Wave Art Review');
      window.__TEST_API.startGameOnMap(0);
      window.__TEST_API.setConfig('ui.motion.reduced', true);
    });
    await sleep(500);

    const captures = [];
    for (const [stage, filename] of [
      ['telegraph', '01-bench-source-telegraph'],
      ['swell', '02-bench-material-swell'],
      ['calm', '03-bench-calm-behind'],
    ]) {
      const receipt = await page.evaluate((value) => window.__TEST_API.stageBenchFabricWaveForTest(value), stage);
      if (!receipt || receipt.stage !== stage) throw new Error(`Failed to stage ${stage}`);
      await sleep(350);
      captures.push({ ...(await capture(page, filename)), receipt });
    }

    await page.evaluate(() => {
      window.__TEST_API.clearBenchFabricWaveForTest();
      window.__TEST_API.firePlayerPulseForTest();
    });
    await sleep(220);
    captures.push(await capture(page, '04-player-noise-radius-comparison'));

    const manifest = {
      generatedAt: new Date().toISOString(),
      viewport: { width: 1280, height: 800 },
      classification: 'BENCH FORCED ART REVIEW — NOT AUTHORITY MOVEMENT PROOF',
      authorityMovementProof: 'tests/fabric-wave-v4.cjs and tests/fabric-wave-v5.cjs',
      sourceHead: require('child_process').execFileSync('git', ['rev-parse', 'HEAD'], { cwd: ROOT, encoding: 'utf8' }).trim(),
      captures,
    };
    fs.writeFileSync(path.join(OUTPUT_DIR, 'manifest.json'), JSON.stringify(manifest, null, 2));
    console.log(JSON.stringify({ outputDir: OUTPUT_DIR, captures }, null, 2));
  } finally {
    if (browser) await browser.close().catch(() => null);
    stopServer();
  }
}

main().catch((error) => {
  console.error(error.stack || error.message);
  stopServer();
  process.exit(1);
});
