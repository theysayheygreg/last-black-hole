const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { evaluateValues } = require('./journey/browser-driver.cjs');

const driverPath = path.join(__dirname, 'journey', 'browser-driver.cjs');
const source = fs.readFileSync(driverPath, 'utf8');

assert.strictEqual(evaluateValues({ condition: 'run.cargo.count', gte: 1 }, { 'run.cargo.count': 2 }), true);
assert.strictEqual(evaluateValues({ all: [
  { condition: 'run.cargo.count', gte: 1 },
  { condition: 'run.map.id', equals: 'shallows' },
] }, { 'run.cargo.count': 1, 'run.map.id': 'shallows' }), true);
assert.strictEqual(evaluateValues({ not: { condition: 'run.grapple.active' } }, { 'run.grapple.active': false }), true);

assert(source.includes("require('../../scripts/sim/world-geometry.cjs')"),
  'Journey movement must consume the canonical authority geometry owner');
assert(source.includes('approachTargetId: target.id'),
  'Journey approach must pass explicit target intent into shared Phase 1A movement');
assert(source.includes('sendRemoteInput'),
  'Journey gameplay actions must use the ordinary remote input seam');
assert(!source.includes('/debug/player-state'),
  'Journey gameplay actions must not mutate authoritative player state through debug setup');
assert(!source.includes('teleportShip'),
  'Journey gameplay actions must not teleport through a test surface');
assert(!/stoppingDistance|v\s*\*\s*v|resolveHazard/.test(source),
  'Journey controller must not reintroduce retired stopping or hazard controller math');

console.log('JourneyDriverContract: real input and shared movement owner PASS');
