#!/usr/bin/env node

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { pathToFileURL } = require('url');
const noiseData = require('../src/content/noise.data.json');
const {
  NOISE_CONFIG,
  emitterAudibleFor,
  enemyListenerStateFor,
  identifyPublicSource,
  resolveContinuousRadius,
  resolveImpulseRadius,
  resolveNoiseSourceProjection,
  recordNoisePeak,
} = require('../scripts/sim/noise-radius.cjs');
const { buildRunEntry } = require('../scripts/control-plane-store.cjs');

const root = path.resolve(__dirname, '..');
const mainSource = fs.readFileSync(path.join(root, 'src/main.js'), 'utf8');
const hudSource = fs.readFileSync(path.join(root, 'src/hud.js'), 'utf8');
const htmlSource = fs.readFileSync(path.join(root, 'index-a.html'), 'utf8');
const snapshotSource = fs.readFileSync(path.join(root, 'scripts/sim/public-snapshot.cjs'), 'utf8');
const runtimeSource = fs.readFileSync(path.join(root, 'scripts/sim-runtime.cjs'), 'utf8');
const ecologySource = fs.readFileSync(path.join(root, 'scripts/sim/inhibitor-ecology.cjs'), 'utf8');
const controlSource = fs.readFileSync(path.join(root, 'scripts/control-plane-store.cjs'), 'utf8');

let checks = 0;
function check(condition, message) {
  checks += 1;
  assert.ok(condition, message);
}

async function run() {
  const {
    projectAudibleContact,
    prioritizeAudibleContacts,
    reconcileUnobservedAudibleContacts,
  } = await import(
    pathToFileURL(path.join(root, 'src/presentation/audible-contact-memory.js')).href
  );
  const { projectRemoteWorldPatch } = await import(
    pathToFileURL(path.join(root, 'src/sim/remote-snapshot-presentation.js')).href
  );

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
  check(NOISE_CONFIG.world.contactCap === 5, 'world Noise contact cap is centralized');
  check(NOISE_CONFIG.world.inhibitor.glitch.radiusMeters === 260
    && NOISE_CONFIG.world.inhibitor.swarm.radiusMeters === 340
    && NOISE_CONFIG.world.inhibitor.vessel.radiusMeters === 620, 'ecology Noise radii are data-owned');
  check(NOISE_CONFIG.world.exfil.radiusMeters === 800
    && NOISE_CONFIG.world.exfil.category === 'EXFIL TONE', 'exfil Noise emitter is data-owned');

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
  const continuousSource = resolveNoiseSourceProjection({
    continuousRadiusMeters: 240,
    continuousSource: 'THRUST AGAINST FLOW',
    continuousSourceClass: 'VESSEL THRUST',
    impulseRadiusMeters: 600,
    impulseSource: 'PULSE',
    impulseSourceClass: 'VESSEL',
  });
  check(continuousSource.source === 'PULSE' && continuousSource.sourceClass === 'VESSEL', 'louder action impulse owns simultaneous envelope');
  const decayingContinuousSource = resolveNoiseSourceProjection({
    continuousRadiusMeters: 120,
    continuousSource: 'THRUST AGAINST FLOW',
    continuousSourceClass: 'VESSEL THRUST',
  });
  check(decayingContinuousSource.source === 'THRUST AGAINST FLOW' && decayingContinuousSource.sourceClass === 'VESSEL THRUST', 'decaying continuous envelope retains source class');
  const impulseSource = resolveNoiseSourceProjection({
    continuousRadiusMeters: 0,
    impulseRadiusMeters: 600,
    impulseSource: 'PULSE',
    impulseSourceClass: 'VESSEL',
  });
  check(impulseSource.source === 'PULSE' && impulseSource.sourceClass === 'VESSEL', 'authority projects action impulse class');
  check(resolveNoiseSourceProjection({ continuousRadiusMeters: 0, impulseRadiusMeters: 0 }).source === 'IDLE'
    && resolveNoiseSourceProjection({ continuousRadiusMeters: 0, impulseRadiusMeters: 0 }).sourceClass === null, 'authority clears source at zero envelope');
  const pulsePeak = recordNoisePeak({ previousMaxMeters: 0, previousSource: 'IDLE', radiusMeters: 600, source: 'PULSE' });
  const retainedPeak = recordNoisePeak({
    previousMaxMeters: pulsePeak.maxAudibleRadiusMeters,
    previousSource: pulsePeak.loudestSource,
    radiusMeters: 240,
    source: 'THRUST',
  });
  check(pulsePeak.loudestSource === 'PULSE' && retainedPeak.loudestSource === 'PULSE', 'loudestSource follows the radius that set max');

  const contactArgs = {
    sourceWX: 1.2,
    sourceWY: 1.3,
    emittedRadiusMeters: 700,
    identificationFraction: 0.40,
    publicSourceClasses: ['GLITCH', 'SWARM', 'VESSEL', 'VESSEL THRUST', 'EXFIL'],
    fadeSeconds: 2.5,
    category: 'THRUST',
  };
  let contact = projectAudibleContact({
    ...contactArgs,
    distanceSimUnits: 0.5,
    bearingRadians: 0.25,
    sourceClass: 'VESSEL',
    nowSeconds: 1,
  }).contact;
  check(contact.live && contact.identity === null, 'outer audible contact is category-only');
  check(contact.rangeMeters === 500 && contact.bearingRadians === 0.25, 'live contact projects actual range and bearing');
  contact = projectAudibleContact({
    ...contactArgs,
    existing: contact,
    distanceSimUnits: 0.2,
    bearingRadians: 0.75,
    sourceClass: 'VESSEL THRUST',
    nowSeconds: 2,
  }).contact;
  check(contact.identity === 'VESSEL THRUST' && contact.rangeMeters === 200, 'inner contact upgrades and updates range');
  const outward = projectAudibleContact({
    ...contactArgs,
    existing: contact,
    distanceSimUnits: 0.5,
    bearingRadians: 1.25,
    sourceClass: 'VESSEL THRUST',
    nowSeconds: 3,
  }).contact;
  check(outward.identity === 'VESSEL THRUST' && outward.rangeMeters === 500, 'identity retains while moving outward');
  const lost = projectAudibleContact({
    ...contactArgs,
    existing: outward,
    distanceSimUnits: 0.9,
    bearingRadians: 2.5,
    sourceClass: 'VESSEL THRUST',
    nowSeconds: 4,
  }).contact;
  check(!lost.live && lost.rangeMeters === 500 && lost.bearingRadians === 1.25, 'loss freezes actual last-heard range and bearing');
  check(lost.identity === 'VESSEL THRUST', 'loss cannot upgrade or erase valid identity');
  const categoryOnlyBeforeLoss = projectAudibleContact({
    ...contactArgs,
    distanceSimUnits: 0.5,
    bearingRadians: 0.1,
    sourceClass: 'VESSEL',
    nowSeconds: 4,
  }).contact;
  const categoryOnlyLost = projectAudibleContact({
    ...contactArgs,
    existing: categoryOnlyBeforeLoss,
    distanceSimUnits: 0.9,
    bearingRadians: 2.5,
    sourceClass: 'VESSEL',
    nowSeconds: 5,
  }).contact;
  const categoryReheard = projectAudibleContact({
    ...contactArgs,
    existing: categoryOnlyLost,
    distanceSimUnits: 0.2,
    bearingRadians: -0.25,
    sourceClass: 'VESSEL',
    nowSeconds: 6,
  }).contact;
  check(categoryReheard.live && categoryReheard.identity === 'VESSEL', 're-heard inner contact may identify again');
  const expired = projectAudibleContact({
    ...contactArgs,
    existing: lost,
    distanceSimUnits: 0.9,
    sourceClass: 'VESSEL THRUST',
    nowSeconds: 6.6,
  }).contact;
  check(expired === null, 'expired contact memory is deleted');
  const reheard = projectAudibleContact({
    ...contactArgs,
    distanceSimUnits: 0.2,
    bearingRadians: -0.5,
    sourceClass: 'VESSEL THRUST',
    nowSeconds: 7,
  }).contact;
  check(reheard.live && reheard.identity === 'VESSEL THRUST', 're-heard contact starts a fresh identification');
  const exfilContact = projectAudibleContact({
    ...contactArgs,
    distanceSimUnits: 0.2,
    category: 'EXFIL TONE',
    sourceClass: 'EXFIL',
    nowSeconds: 9,
  }).contact;
  check(exfilContact.identity === 'EXFIL' && exfilContact.category === 'EXFIL TONE',
    'active exfil uses the same audible contact identity lifecycle');
  const missingClass = projectAudibleContact({
    ...contactArgs,
    distanceSimUnits: 0.2,
    bearingRadians: 0,
    sourceClass: '',
    nowSeconds: 8,
  }).contact;
  check(missingClass.identity === null, 'missing source class stays category-only');
  const capped = prioritizeAudibleContacts([
    { id: 'salvage', category: 'SALVAGE', rangeMeters: 80, emittedRadiusMeters: 180, lastHeardAt: 4 },
    { id: 'impact', category: 'IMPACT', rangeMeters: 300, emittedRadiusMeters: 300, lastHeardAt: 2 },
    { id: 'thrust', category: 'THRUST', rangeMeters: 20, emittedRadiusMeters: 240, lastHeardAt: 3 },
  ], { limit: 2 });
  const cappedAgain = prioritizeAudibleContacts([
    { id: 'salvage', category: 'SALVAGE', rangeMeters: 80, emittedRadiusMeters: 180, lastHeardAt: 4 },
    { id: 'impact', category: 'IMPACT', rangeMeters: 300, emittedRadiusMeters: 300, lastHeardAt: 2 },
    { id: 'thrust', category: 'THRUST', rangeMeters: 20, emittedRadiusMeters: 240, lastHeardAt: 3 },
  ], { limit: 2 });
  check(capped.length === 2 && capped.map((entry) => entry.id).join(',') === cappedAgain.map((entry) => entry.id).join(','), 'audible contact cap and priority are deterministic');
  const omittedKey = 'world:omitted-source';
  const omittedMemory = new Map([[omittedKey, { ...outward, id: omittedKey }]]);
  reconcileUnobservedAudibleContacts(omittedMemory, new Set(), 10, { fadeSeconds: 2.5 });
  const omittedFading = omittedMemory.get(omittedKey);
  check(!omittedFading.live
    && omittedFading.expiresAt === 12.5
    && omittedFading.rangeMeters === outward.rangeMeters
    && omittedFading.bearingRadians === outward.bearingRadians
    && omittedFading.identity === outward.identity,
  'omitted live source freezes identity/range/bearing and begins its fade once');
  reconcileUnobservedAudibleContacts(omittedMemory, new Set(), 11, { fadeSeconds: 2.5 });
  check(omittedMemory.get(omittedKey).expiresAt === 12.5,
    'repeated omission preserves the original fade deadline');
  reconcileUnobservedAudibleContacts(omittedMemory, new Set(), 12.6, { fadeSeconds: 2.5 });
  check(!omittedMemory.has(omittedKey), 'omitted source expires and is deleted after its memory window');

  const portalPatch = projectRemoteWorldPatch({
    portals: [
      { id: 'optional', type: 'unstable', wx: 0.2, wy: 0.2, alive: true },
      { id: 'final', type: 'rift', wx: 0.8, wy: 0.8, alive: true, finalInhibitor: true, finalExfil: true },
    ],
  });
  check(portalPatch.portals[1].finalInhibitor && portalPatch.portals[1].finalExfil, 'remote projection preserves final exit flags');
  check(!mainSource.includes('findNearestActivePortal') && !mainSource.includes('hud-portal-arrow'),
    'main edge indicators have no privileged exit arrow');
  check(!htmlSource.includes('hud-portal-arrow') && !hudSource.includes('findNearestActivePortal'),
    'HUD edge presentation has no independent exit-marker state');
  check(!runtimeSource.includes('blockedByInhibitor') && !runtimeSource.includes('consumedByInhibitor'),
    'portal blocking and well consumption fields are absent from production authority');

  const runEntry = buildRunEntry({
    profile: { id: 'pilot', hullType: 'drifter', rigLevels: [0, 0, 0] },
    player: { clientId: 'p1', hullType: 'drifter', cargo: [], equipped: [], consumables: [], noise: {
      maxAudibleRadiusMeters: 320,
      dominantSource: 'THRUST AGAINST FLOW',
      timeHeardSeconds: 4.5,
      timeTrackedSeconds: 1.25,
    } },
    outcome: 'dead',
    runDuration: 12,
    session: { id: 'session-1', runId: 'run-1', mapId: 'shallows', worldScale: 5, seed: 42 },
    runResult: {},
    result: {},
  });
  check(runEntry.noiseMaxMeters === 320
    && runEntry.noiseSource === 'THRUST AGAINST FLOW'
    && runEntry.noiseTimeHeardSeconds === 4.5
    && runEntry.noiseTimeTrackedSeconds === 1.25, 'run entry persists Noise learning stats');
  check(!Object.prototype.hasOwnProperty.call(runEntry, 'signalPeak')
    && !Object.prototype.hasOwnProperty.call(runEntry, 'timePerZone'), 'new run entry retires legacy Signal fields');

  check(runtimeSource.includes('function tickPlayerNoise'), 'authority owns Noise envelope');
  check(!runtimeSource.includes('function tickPlayerSignal'), 'legacy Signal tick is removed');
  check(runtimeSource.includes('Conductor time alone advances Inhibitor phases'), 'Noise cannot advance Inhibitor arrival');
  check(runtimeSource.includes('fauna.type !== "bloom"'), 'jellies are excluded from Noise listener counts');
  check(runtimeSource.includes('f.listenerState === "HEARD"') && runtimeSource.includes('lastHeardWX'), 'Blooms investigate remembered Noise sources');
  check(runtimeSource.includes('force * dt') && runtimeSource.includes('sourceClass, ageSeconds: 0'), 'Bloom steering and impulse class use wall-time projection');
  check(runtimeSource.includes('sourceProjection.sourceClass') && runtimeSource.includes('sourceClass,'), 'authority selects and publishes current Noise source class');
  check(ecologySource.includes('noiseListenerState') && ecologySource.includes('noiseSearchState'), 'Swarm listener/search state is authoritative');
  check(runtimeSource.includes('NOISE_CONFIG.impulses.collisionMeters') && runtimeSource.includes('scavenger-contact'), 'scavenger contact emits IMPACT Noise');
  check(snapshotSource.includes('noise: projectNoise(player)'), 'Noise is public snapshot state');
  check(snapshotSource.includes('publicListenerStates') && snapshotSource.includes('listener.state'), 'public Noise projection preserves listener states');
  check(mainSource.includes('HEAT_DISPLAY_EPSILON = 0.02'), 'Heat display epsilon is explicit');
  check(mainSource.includes('resolveHeatInstrumentState'), 'Heat render uses pure presentation visibility helper');
  check(mainSource.includes('projectAudibleContact') && mainSource.includes('simUnitsToMeters'), 'edge contact projection uses canonical meter conversion');
  check(mainSource.includes('world:inhibitor:') && mainSource.includes('NOISE_CONFIG.world?.inhibitor'),
    'local ecology entities use the shared world Noise contact bridge');
  check(!mainSource.includes('radiusMeters / 1000') && !mainSource.includes('radiusMeters * NOISE_IDENTIFICATION_FRACTION) / 1000'), 'Noise presentation has no /1000 conversion folklore');
  check(!mainSource.includes('INHIBITOR EDGE DIM'), 'omniscient Inhibitor edge dim is removed');
  check(mainSource.includes('finalInhibitor') && mainSource.includes('finalExfil'), 'local portal presentation carries final exit flags');
  check(hudSource.includes('TRACKED BY') && hudSource.includes('LOCKED ON'), 'HUD reports tracked and separately authored locks');
  check(controlSource.includes('noiseMaxMeters') && controlSource.includes('noiseTimeTrackedSeconds'), 'control plane owns Noise result persistence');
  check(htmlSource.includes('id="hud-noise"') && !htmlSource.includes('id="hud-signal"') && !htmlSource.includes('id="hud-fuel"'), 'Deck HUD has Noise, not legacy meter rails');

  console.log(`noise-radius focused ${checks}/${checks}`);
}

run().catch((error) => {
  console.error(error.stack || error);
  process.exitCode = 1;
});
