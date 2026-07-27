#!/usr/bin/env node

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const noiseData = require('../src/content/noise.data.json');
const {
  NOISE_CONFIG,
  emitterAudibleFor,
  enemyListenerStateFor,
  identifyPublicSource,
  resolveContinuousRadius,
  resolveImpulseRadius,
} = require('../scripts/sim/noise-radius.cjs');

const root = path.resolve(__dirname, '..');
const mainSource = fs.readFileSync(path.join(root, 'src/main.js'), 'utf8');
const hudSource = fs.readFileSync(path.join(root, 'src/hud.js'), 'utf8');
const htmlSource = fs.readFileSync(path.join(root, 'index-a.html'), 'utf8');
const snapshotSource = fs.readFileSync(path.join(root, 'scripts/sim/public-snapshot.cjs'), 'utf8');
const runtimeSource = fs.readFileSync(path.join(root, 'scripts/sim-runtime.cjs'), 'utf8');

let checks = 0;
function check(condition, message) {
  checks += 1;
  assert.ok(condition, message);
}

check(NOISE_CONFIG.unit === 'm', 'noise uses canonical meters');
check(NOISE_CONFIG.continuous.withFlowMeters === 180, 'with-flow radius');
check(NOISE_CONFIG.continuous.neutralMeters === 240, 'neutral radius');
check(NOISE_CONFIG.continuous.againstFlowMeters === 320, 'against-flow radius');
check(NOISE_CONFIG.continuous.brakeMeters === 220, 'brake radius');
check(NOISE_CONFIG.impulses.salvage['1'] === 180 && NOISE_CONFIG.impulses.salvage['3'] === 480, 'salvage tiers');
check(NOISE_CONFIG.impulses.forcePulseMeters === 600 && NOISE_CONFIG.impulses.decoyLaunchMeters === 700, 'action radii');
check(NOISE_CONFIG.impulseHoldSeconds === 0.35 && NOISE_CONFIG.impulseDecayMetersPerSecond === 120, 'impulse hold and decay');
check(NOISE_CONFIG.continuousDecayMetersPerSecond === 90, 'continuous decay');
check(NOISE_CONFIG.identificationFraction === 0.40, 'identification fraction');
check(NOISE_CONFIG.lastHeardFadeSeconds === 2.5, 'last-heard fade');
check(JSON.stringify(noiseData) === JSON.stringify(NOISE_CONFIG), 'CJS adapter preserves canonical data');

check(resolveContinuousRadius(0, 240, 1) === 240, 'thrust establishes continuous radius');
check(resolveContinuousRadius(240, 0, 1) === 150, 'coast decays per wall second');
check(resolveImpulseRadius(600, 0.35) === 600, 'impulse holds at the envelope floor');
check(resolveImpulseRadius(600, 1.35) === 480, 'impulse decays after hold');

check(emitterAudibleFor({ radiusMeters: 240, distanceSimUnits: 0.24 }).audible, 'edge distance is audible');
check(!emitterAudibleFor({ radiusMeters: 240, distanceSimUnits: 0.240001 }).audible, 'outside emitted radius is silent');
check(identifyPublicSource({ radiusMeters: 700, distanceSimUnits: 0.28, sourceClass: 'VESSEL' }) === 'VESSEL', 'inner public identity upgrades');
check(identifyPublicSource({ radiusMeters: 700, distanceSimUnits: 0.29, sourceClass: 'VESSEL' }) === null, 'outer audible zone stays category-only');
check(identifyPublicSource({ radiusMeters: 700, distanceSimUnits: 0.28, sourceClass: '' }) === null, 'missing class cannot upgrade');

check(enemyListenerStateFor({ radiusMeters: 240, distanceSimUnits: 0.132 }).state === 'TRACKING', 'enemy inner listener state');
check(enemyListenerStateFor({ radiusMeters: 240, distanceSimUnits: 0.20 }).state === 'HEARD', 'enemy outer listener state');
check(enemyListenerStateFor({ radiusMeters: 240, distanceSimUnits: 0.241 }).state === 'QUIET', 'enemy listener loses source outside radius');

check(runtimeSource.includes('function tickPlayerNoise'), 'authority owns Noise envelope');
check(!runtimeSource.includes('function tickPlayerSignal'), 'legacy Signal tick is removed');
check(runtimeSource.includes('Conductor time alone advances Inhibitor phases'), 'Noise cannot advance Inhibitor arrival');
check(snapshotSource.includes('noise: projectNoise(player)'), 'Noise is public snapshot state');
check(mainSource.includes('HEAT_DISPLAY_EPSILON = 0.02'), 'Heat display epsilon is explicit');
check(mainSource.includes('ratio <= HEAT_DISPLAY_EPSILON && overheatRemaining <= 0'), 'cooled Heat hides');
check(mainSource.includes('NOISE_LAST_HEARD_FADE_SECONDS'), 'edge memory uses centralized fade');
check(mainSource.includes('distanceSimUnits <= radiusMeters / 1000'), 'player audibility uses emitter radius');
check(mainSource.includes('NOISE_IDENTIFICATION_FRACTION'), 'player identification uses the 0.40 tier');
check(mainSource.includes('publicIdentityRank'), 'identified contacts retain their highest public class');
check(hudSource.includes('LOCKED ON') && !hudSource.includes('TRACKED BY'), 'HUD does not disguise tracking as a lock');
check(htmlSource.includes('id="hud-noise"') && !htmlSource.includes('id="hud-signal"') && !htmlSource.includes('id="hud-fuel"'), 'Deck HUD has Noise, not legacy meter rails');

console.log(`noise-radius focused ${checks}/${checks}`);
