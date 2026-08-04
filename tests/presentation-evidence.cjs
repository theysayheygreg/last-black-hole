#!/usr/bin/env node

const assert = require('assert');
const path = require('path');
const { pathToFileURL } = require('url');
const { recordJourneyStage } = require('./agent-play-report.cjs');

async function run() {
  const hud = await import(pathToFileURL(path.join(__dirname, '..', 'src', 'ui', 'hud-presentation.js')).href);
  const layout = await import(pathToFileURL(path.join(__dirname, '..', 'src', 'ui', 'presentation-layout.js')).href);
  const loadout = await import(pathToFileURL(path.join(__dirname, '..', 'src', 'ui', 'loadout-presentation.js')).href);
  const bindings = await import(pathToFileURL(path.join(__dirname, '..', 'src', 'ui', 'input-bindings.js')).href);
  const remote = await import(pathToFileURL(path.join(__dirname, '..', 'src', 'sim', 'remote-snapshot-presentation.js')).href);
  const heat = await import(pathToFileURL(path.join(__dirname, '..', 'src', 'presentation', 'heat-instrument.js')).href);

  const optional = hud.getRouteObjectiveState(
    { wx: 0.5, wy: 0.5 },
    { activeCount: 2, portals: [{ type: 'extraction', alive: true, wx: 0.8, wy: 0.5 }] },
    null,
    false,
    { exfilHeard: false, portalInteraction: { portalId: 'optional-1', portalType: 'standard', ready: true } },
  );
  assert.strictEqual(optional.label, 'CONFIRM EXTRACTION');
  assert.strictEqual(optional.detail, 'remain inside cyan aperture');
  const optionalPrompt = hud.getInteractionPresentationState({
    visible: true,
    action: 'extract',
    label: 'confirm optional residence',
    detail: 'remain inside cyan aperture',
    verb: 'extract',
  }, { mode: 'controller' });
  assert.strictEqual(optionalPrompt.action, 'extract');
  assert(optionalPrompt.caption.includes('data-input-family="controller"')
    && optionalPrompt.caption.includes('>A</span>'),
  'Optional residence must publish a ready extract prompt with controller A');

  const finalReady = hud.getRouteObjectiveState(
    { wx: 0.5, wy: 0.5 },
    { activeCount: 1, portals: [{ type: 'exit', alive: true, wx: 0.8, wy: 0.5 }] },
    null,
    false,
    { exfilHeard: true, portalInteraction: { portalId: 'final-1', portalType: 'exit', ready: true } },
  );
  assert.strictEqual(finalReady.label, 'CONFIRM EXTRACTION',
    'A ready extraction interaction must outrank the passive route-listening rail');
  assert.strictEqual(finalReady.detail, 'remain inside cyan aperture');
  const finalPrompt = hud.getInteractionPresentationState({
    visible: true,
    action: 'extract',
    label: 'confirm extraction',
    detail: 'remain inside cyan aperture',
    verb: 'extract',
  }, { mode: 'controller' });
  const finalKeyboardPrompt = hud.getInteractionPresentationState({
    visible: true,
    action: 'extract',
    label: 'confirm extraction',
    detail: 'remain inside cyan aperture',
    verb: 'extract',
  }, { mode: 'keyboard' });
  assert(finalPrompt.caption.includes('data-input-family="controller"')
    && finalPrompt.caption.includes('>A</span>'),
  'Final residence must publish a ready extract prompt with controller A');
  assert(finalKeyboardPrompt.caption.includes('>Enter</span>'),
    'Final residence must preserve explicit Enter confirmation');

  assert.strictEqual(layout.safeObjectLabel(undefined, 'STAR 1'), 'STAR 1');
  assert.strictEqual(layout.safeObjectLabel('undefined', 'PLANETOID 1'), 'PLANETOID 1');
  assert.strictEqual(layout.safeObjectLabel('Lumen', 'STAR 1'), 'Lumen');
  const shipSlots = layout.getShipLocalLabelSlots({ shipX: 640, shipY: 400, canvasW: 1280, canvasH: 800 });
  assert(shipSlots.heat.bounds.y > shipSlots.velocity.bounds.y + shipSlots.velocity.bounds.h);
  const labels = layout.placePresentationLabels([
    { id: 'near-star', order: 20, anchorX: 640, anchorY: 430, width: 120, height: 18 },
    { id: 'near-planet', order: 30, anchorX: 640, anchorY: 430, width: 120, height: 18 },
  ], { canvasW: 1280, canvasH: 800, obstacles: [shipSlots.velocity.bounds, shipSlots.heat.bounds] });
  assert.strictEqual(labels.placed.length, 2);
  assert(!layout.rectsOverlap(labels.placed[0].bounds, labels.placed[1].bounds, 5));

  const terminal = hud.getTerminalPresentationState('dead');
  assert.strictEqual(terminal.interaction, null);
  assert.strictEqual(terminal.abilities.inert, true);
  const terminalFrame = hud.getHUDPresentationState({
    terminal: true,
    interaction: { action: 'extract', label: 'confirm extraction' },
    abilityState: { hullType: 'breacher', burnActive: true, burnFuel: 20 },
  });
  assert.strictEqual(terminalFrame.interaction, null);
  assert(terminalFrame.abilityState.terminal);
  const escapedFrame = hud.getHUDPresentationState({
    outcome: 'escaped',
    interaction: { action: 'extract', label: 'confirm extraction' },
    abilityState: { hullType: 'breacher', burnActive: true, burnFuel: 20 },
  });
  assert.strictEqual(escapedFrame.terminal, true,
    'An escaped outcome must enter the existing terminal HUD path');
  assert.strictEqual(escapedFrame.interaction, null,
    'An escaped outcome must suppress active route interaction');
  const terminalRoute = hud.getRouteObjectiveState(
    { wx: 0.5, wy: 0.5 },
    { activeCount: 1, portals: [{ type: 'exit', alive: true, wx: 0.8, wy: 0.5 }] },
    null,
    false,
    { exfilHeard: true, terminal: true },
  );
  assert.strictEqual(terminalRoute.label, '',
    'Terminal HUD state must suppress the active route objective label');
  assert.strictEqual(terminalRoute.detail, '',
    'Terminal HUD state must suppress the active route objective detail');
  const terminalAbilities = hud.getAbilityPresentationState(terminalFrame.abilityState);
  assert(terminalAbilities.slots.every((slot) => slot.inert && !slot.active && slot.action === null));
  const inert = hud.getAbilityPresentationState({ hullType: 'breacher', terminal: true, burnFuel: 20 });
  assert.strictEqual(inert.slots[0].inert, true);
  assert.strictEqual(inert.slots[0].tone, 'inert');
  assert.strictEqual(inert.slots[0].action, null);

  assert.strictEqual(hud.formatNoiseDetail({ currentSource: 'NOISE', heardListenerCount: 3 }), 'HEARD BY 3');
  assert(!hud.formatNoiseDetail({ currentSource: 'NOISE' }).includes('NOISE · NOISE'));

  assert.strictEqual(bindings.ACTION_PROMPT_LABELS.extract.controller, 'A');
  assert.deepStrictEqual(bindings.GAMEPAD_ACTION_BUTTONS.extract, [0]);

  // Authority snapshots remain the clock source even when presentation is
  // sampled at 5Hz against a 15Hz run. This deliberately skips two snapshots
  // between draws so a render accumulator cannot masquerade as gameplay time.
  const authorityHz = 15;
  const presentationCadenceHz = 5;
  const growthIntervalSeconds = 3;
  const activePortal = { id: 'optional-1', type: 'standard', alive: true, wx: 0.5, wy: 0.5, spawnTime: 57, lifespan: 10 };
  const portalSchedule = {
    windows: [
      // Diagnostic zero-count entries are authority history only. They must
      // never turn into a lying HUD countdown before the next real aperture.
      { openTime: 59, metadata: { finalExfil: false, effectiveCountRange: [0, 0] } },
      { openTime: 60, metadata: { finalExfil: false, effectiveCountRange: [1, 1] } },
      { openTime: 120, metadata: { finalExfil: true, effectiveCountRange: [1, 1] } },
    ],
  };
  const displayed = [];
  for (let tick = 0; tick <= authorityHz * 2; tick += 1) {
    if (tick % (authorityHz / presentationCadenceHz) !== 0) continue;
    const simTime = 58 + tick / authorityHz;
    const growthTimer = (tick * 0.4) % growthIntervalSeconds;
    const rawWorld = { growthTimer, portals: [activePortal] };
    const projected = remote.projectRemoteSnapshot({
      session: { runDurationSeconds: 120 },
      simTime,
      players: [],
      world: rawWorld,
    }, { elapsedTime: 0 });
    const world = remote.projectRemoteWorldPatch(rawWorld);
    const timers = hud.resolveHudTimerState({
      runElapsedTime: projected.elapsedTime,
      runDurationSeconds: projected.runDurationSeconds,
      growthTimer: world.growthTimer,
      growthIntervalSeconds,
      portalSchedule,
    });
    const apertureSeconds = world.portals[0].timeLeft(projected.elapsedTime);
    const heatState = heat.resolveHeatInstrumentState({
      heatRatio: 1,
      overheatRemaining: Math.max(0, 3 - (simTime - 58)),
    });
    displayed.push({
      simTime: projected.elapsedTime,
      matchRemaining: timers.matchRemainingSeconds,
      matchLabel: hud.fmtTime(timers.matchRemainingSeconds),
      apertureSeconds,
      nextApertureSeconds: timers.nextApertureSeconds,
      nextGrowthSeconds: timers.nextGrowthSeconds,
      heatRemaining: heatState.overheatRemaining,
    });
  }
  assert.strictEqual(displayed.length, 11);
  for (let index = 1; index < displayed.length; index += 1) {
    assert(displayed[index].simTime > displayed[index - 1].simTime,
      'Slow presentation samples must consume newer authority simTime');
    assert(displayed[index].matchRemaining < displayed[index - 1].matchRemaining,
      'Displayed match timer must not freeze between slow presentation samples');
    assert(displayed[index].apertureSeconds < displayed[index - 1].apertureSeconds,
      'Displayed aperture residence timer must follow authority simTime');
  }
  assert(displayed.some((sample) => sample.matchLabel === '1:01'), 'Match timer must visibly cross a second boundary');
  assert.strictEqual(displayed[0].nextApertureSeconds, 2);
  assert.strictEqual(displayed[0].nextGrowthSeconds, 3);
  assert(displayed[displayed.length - 1].heatRemaining < displayed[0].heatRemaining,
    'Displayed Heat lockout must follow authority cooldown time');

  const canonicalNoiseEffects = loadout.formatItemEffects({ coefficients: {
    noiseRadiusMultiplier: 1.2,
    noiseDecayMultiplier: 0.8,
  } });
  const legacyNoiseEffects = loadout.formatItemEffects({ coefficients: {
    signalGenMult: 1.2,
    signalDecayMult: 0.8,
  } });
  assert.deepStrictEqual(canonicalNoiseEffects, ['noise radius +20%', 'noise decay -20%']);
  assert.deepStrictEqual(legacyNoiseEffects, canonicalNoiseEffects);

  const report = { journey: {} };
  recordJourneyStage(report, { briefing: { mapName: 'The Shallows' }, firstRun: { runId: 'run-1' } });
  recordJourneyStage(report, { slingshot: { anchorType: 'well' } });
  assert.deepStrictEqual(report.journey.briefing, { mapName: 'The Shallows' });
  assert.deepStrictEqual(report.journey.firstRun, { runId: 'run-1' });
  assert.deepStrictEqual(report.journey.slingshot, { anchorType: 'well' });

  const hudSource = require('fs').readFileSync(path.join(__dirname, '..', 'src', 'hud.js'), 'utf8');
  assert(/terminal:\s*hudPresentation\.terminal/.test(hudSource),
    'The live HUD renderer must pass terminal truth into route presentation');

  console.log('PresentationEvidence: 7/7 passed');
}

run().catch((error) => {
  console.error(error.stack || error.message);
  process.exit(1);
});
