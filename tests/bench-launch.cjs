#!/usr/bin/env node
"use strict";

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const { MODES, parseArgs } = require('../scripts/stack.cjs');

assert.deepStrictEqual(MODES.bench.services, ['control', 'sim', 'dev']);
assert.deepStrictEqual(MODES.bench.serviceArgs.sim, ['--bench', 'true', '--keep-alive', 'true']);
assert.strictEqual(MODES.bench.query.bench, '1');
assert.ok(MODES.bench.query.simServer.includes('8787'));
assert.deepStrictEqual(parseArgs(['restart', '--mode=bench', '--no-open']), {
  _: ['restart'], mode: 'bench', 'no-open': true,
});

const packageJson = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
assert.strictEqual(packageJson.scripts.bench, 'node scripts/stack.cjs restart --mode=bench');

Promise.all([
  import('../src/sim/sim-client.js'),
  import('../src/bench/ui.js'),
]).then(([{ SimClient }, ui]) => {
  for (const method of ['getBench', 'activateBenchBay', 'importBenchPatch', 'replayBenchSameSetup', 'resetBench', 'undoBench']) {
    assert.strictEqual(typeof SimClient.prototype[method], 'function', `${method} client method`);
  }
  assert.strictEqual(typeof ui.initBenchUi, 'function');
  console.log('Bench launch contract: PASS');
}).catch((error) => {
  console.error(error.stack || error.message);
  process.exitCode = 1;
});
