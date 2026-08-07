#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { pathToFileURL } = require('url');
const {
  withFreshGame,
  withFreshSimServer,
  withQuery,
  waitFor,
  startServer,
  stopServer,
} = require('../helpers.cjs');
const { BrowserJourneyConditionReader, BrowserJourneyDriver } = require('./browser-driver.cjs');

const ROOT = path.resolve(__dirname, '..', '..');
const JOURNEY_ROOT = path.join(ROOT, 'src', 'content', 'journeys');
const DEFAULT_SIM_PORT = 8798;

function journeyPath(id) {
  if (!/^[a-z0-9.-]+$/.test(String(id))) throw new TypeError(`Invalid Journey id: ${id}`);
  const direct = path.join(JOURNEY_ROOT, `${id}.json`);
  if (fs.existsSync(direct)) return direct;
  const match = fs.readdirSync(JOURNEY_ROOT)
    .filter((file) => file.endsWith('.json'))
    .map((file) => ({ file, definition: JSON.parse(fs.readFileSync(path.join(JOURNEY_ROOT, file), 'utf8')) }))
    .find((entry) => entry.definition.id === id);
  if (!match) throw new RangeError(`Unknown Journey: ${id}`);
  return path.join(JOURNEY_ROOT, match.file);
}

async function runJourney(id, options = {}) {
  const file = journeyPath(id);
  const definition = JSON.parse(fs.readFileSync(file, 'utf8'));
  const artifactRoot = path.resolve(options.artifactRoot || path.join(ROOT, 'tmp', 'journeys', id));
  const receiptPath = path.join(artifactRoot, 'receipt.json');
  const simPort = Number(options.simPort) || DEFAULT_SIM_PORT;
  const simUrl = `http://127.0.0.1:${simPort}`;
  fs.mkdirSync(artifactRoot, { recursive: true });

  const [{ CONDITION_NAMES, validateConditionQuery }, journey] = await Promise.all([
    import(pathToFileURL(path.join(ROOT, 'src', 'conditions', 'index.js')).href),
    import(pathToFileURL(path.join(ROOT, 'src', 'journey', 'index.js')).href),
  ]);

  let receipt;
  await startServer();
  try {
    await withFreshSimServer(simPort, async () => {
      await withFreshGame(withQuery('index-a.html', { simServer: simUrl }), async ({ page, errors }) => {
      try {
        await waitFor(page, () => Boolean(window.__TEST_API?.getNetworkState), { timeout: 12_000 });
      } catch (error) {
        const diagnostics = page.getDiagnostics?.() || [];
        throw new Error(`Journey browser bootstrap failed: ${error.message}; errors=${errors.join(' | ')}; diagnostics=${JSON.stringify(diagnostics.slice(-16))}`);
      }
      const driver = new BrowserJourneyDriver({ page, simUrl, artifactRoot });
      const conditions = new BrowserJourneyConditionReader({
        page,
        conditionNames: CONDITION_NAMES,
        validateConditionQuery,
      });
      const runtime = new journey.JourneyRuntime({
        registry: journey.createDefaultJourneyRegistry(),
        driver,
        conditions,
      });
      receipt = await runtime.run(definition);
      if (errors.length > 0 && receipt.status === 'passed') {
        receipt = { ...receipt, browserErrors: [...errors] };
      }
      }, { resetState: true, resetWaitMs: 500 });
    });
  } finally {
    stopServer();
  }

  fs.writeFileSync(receiptPath, `${JSON.stringify(receipt, null, 2)}\n`, 'utf8');
  return { receipt, receiptPath };
}

async function main() {
  const id = process.argv[2] || 'representative-salvage-extract';
  const { receipt, receiptPath } = await runJourney(id, {
    artifactRoot: process.env.LBH_JOURNEY_ARTIFACT_ROOT,
    simPort: process.env.LBH_JOURNEY_SIM_PORT,
  });
  console.log(`${receipt.summary}\nreceipt: ${receiptPath}`);
  if (receipt.status === 'failed') process.exitCode = 1;
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}

module.exports = { runJourney };
