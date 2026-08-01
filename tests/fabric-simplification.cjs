const assert = require('assert');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const canonical = require('../src/content/fabric.data.json');
const { FABRIC: authorityFabric } = require('../scripts/content/fabric.cjs');
const { decayWaveAmplitude } = require('../scripts/sim/event-wave.cjs');

assert.deepStrictEqual(authorityFabric, canonical,
  'authority must consume the canonical fabric data without copying defaults');
assert.strictEqual(canonical.eventWave.halfLifeSeconds, 2);
assert(Math.abs(decayWaveAmplitude(1, 2) - 0.5) < 1e-12,
  'event-wave decay must use elapsed seconds from the fabric owner');

const planetoids = fs.readFileSync(path.join(ROOT, 'src/planetoids.js'), 'utf8');
const main = fs.readFileSync(path.join(ROOT, 'src/main.js'), 'utf8');
const simCore = fs.readFileSync(path.join(ROOT, 'src/sim/sim-core.js'), 'utf8');
assert(!planetoids.includes('fluid.splat(') && !planetoids.includes('PLANETOID_WAKE_ENABLED'),
  'planetoids must not promise an unauthoritative surfable velocity wake');
assert(!main.includes('planetoidSystem.update('),
  'the frame loop must not advance planetoids a second time outside SimCore');
assert.strictEqual((simCore.match(/planetoidSystem\.update\(/g) || []).length, 1,
  'SimCore must have exactly one local-sandbox planetoid update owner');
assert(main.includes('const fieldSample = remoteSession.active\n    ? null'),
  'remote presentation must not relabel the local analytic field as authority truth');

console.log('FabricSimplification: canonical defaults, dt decay, and truth ownership PASS');
