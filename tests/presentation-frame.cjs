const path = require('path');
const { pathToFileURL } = require('url');
const { TestRunner, assert } = require('./helpers.cjs');

const ROOT = path.resolve(__dirname, '..');

async function importModule(relativePath) {
  return import(pathToFileURL(path.join(ROOT, relativePath)).href);
}

async function run() {
  const runner = new TestRunner('PresentationFrame');
  const presentation = await importModule('src/presentation/presentation-frame.js');
  const style = await importModule('src/presentation/presentation-style.js');
  const materials = await importModule('src/render-three/material-registry.js');

  await runner.run('Legacy renderer input becomes a sanitized renderer-neutral frame', async () => {
    const raw = {
      dt: 1 / 30,
      totalTime: 12,
      camX: 2.9,
      camY: 0.1,
      worldScale: 3,
      gridWindow: 3,
      cameraView: 3,
      phase: 'playing',
      scene: {
        ship: {
          id: 'pilot', wx: 2.95, wy: 0.2, vx: 1.2, vy: -0.4, facing: 0.25,
          deltaVRatio: 0.6, hullType: 'breacher', thrusting: true,
          forceLedger: {
            tick: 42,
            dt: 0.1,
            unit: 'm/s^2',
            vectors: {
              thrust: { x: 2500, y: 0 }, coupling: { x: -400, y: 100 },
              gravity: { x: -200, y: 300 }, wave: { x: 0, y: 0 },
              impulse: { x: 0, y: 0 }, drag: { x: -50, y: 10 },
            },
            total: { x: 1850, y: 410 },
            deltaV_mps: { x: 185, y: 41 },
          },
        },
        slingshot: {
          affordance: { wx: 0.05, wy: 0.2, range: 0.22, type: 'star' },
          engaged: null,
        },
        wrecks: [{ id: 'wreck-a', wx: 0.1, wy: 0.2, size: 'scattered', type: 'debris', looted: false, loot: ['sim-secret'] }],
        portals: [{ id: 'exit-a', wx: 0.2, wy: 0.3, radius: 0.1, type: 'standard', blockedByInhibitor: true }],
        remotePlayers: [{ id: 'friend-a', wx: 0.4, wy: 0.5, vx: 0.2, vy: 0, hullType: 'drifter' }],
      },
      vfxEvents: [{
        eventId: 'fault-a',
        type: 'titleGlyphFault',
        seq: 7,
        screenX: 640,
        screenY: 300,
        intensity: 0.8,
        glyph: 'Ψ',
        payload: { mutableSimInternals: true },
      }],
      vfxConfig: { enabled: true },
    };

    const frame = presentation.createPresentationFrame(raw, { qualityTier: 'default' });
    assert(frame.version === presentation.PRESENTATION_FRAME_VERSION, 'Expected versioned presentation frame');
    assert(frame.phase === 'playing' && frame.timing.dt === 1 / 30, 'Expected phase and timing');
    assert(frame.camera.x === 2.9 && frame.camera.worldScale === 3, 'Expected normalized camera');
    assert(frame.localPlayer.id === 'pilot', 'Expected local player identity');
    assert(frame.localPlayer.movement.velocity.speed > 1.2, 'Expected renderer-neutral movement state');
    assert(frame.localPlayer.hull.type === 'breacher' && frame.localPlayer.movement.pathState === 'thrusting',
      'Expected normalized hull and path presentation state');
    assert(frame.localPlayer.forceLedger.tick === 42, 'Expected authoritative force-ledger tick');
    assert(frame.localPlayer.forceLedger.vectors.thrust.magnitude === 2500,
      'Expected force vectors transported as presentation facts');
    assert(frame.localPlayer.forceLedger.total.x === 1850 && frame.localPlayer.forceLedger.unit === 'm/s^2',
      'Expected normalized force-ledger total and human unit');
    assert(frame.localPlayer.slingshot.affordance.kind === 'star', 'Expected slingshot affordance');
    assert(frame.world.wrecks[0].hint.category === 'salvage', 'Expected semantic wreck hint');
    assert(frame.world.portals[0].hint.roleColor === 'routeCyan', 'Expected cyan route hint');
    assert(frame.world.wrecks[0].visualState === 'cluster', 'Expected normalized wreck visual state');
    assert(frame.world.portals[0].visualState === 'blocked', 'Expected normalized portal visual state');
    assert(frame.world.remotePlayers[0].hint.category === 'remoteShip', 'Expected remote-player hint');
    assert(!('loot' in frame.world.wrecks[0]), 'Presentation frame must omit inventory internals');
    assert(!('payload' in frame.events[0]), 'Presentation events must omit arbitrary sim payloads');
    assert(frame.events[0].sequence === 7 && frame.events[0].screenX === 640, 'Expected safe event fields');
  });

  await runner.run('Canonical presentation frames pass through the renderer entry unchanged', async () => {
    const frame = presentation.createPresentationFrame({
      qualityTier: 'minimal',
      scene: { ship: { wx: 1, wy: 1 }, portals: [], wrecks: [] },
    });
    const resolved = presentation.resolvePresentationFrame({ presentation: frame }, { qualityTier: 'rich' });
    assert(resolved === frame, 'Canonical frame should not be normalized twice');
    assert(resolved.style.qualityTier === 'minimal', 'Explicit frame quality should win');
  });

  await runner.run('Quality and palette roles are centralized and keep route cyan distinct from corruption', async () => {
    const minimal = style.resolvePresentationQuality('minimal');
    const rich = style.resolvePresentationQuality('rich');
    assert(minimal.entityBudgets.wrecks < rich.entityBudgets.wrecks, 'Expected quality-scaled wreck budget');
    assert(style.PRESENTATION_PALETTE.routeCyan !== style.PRESENTATION_PALETTE.inhibitorMagenta,
      'Route cyan must remain distinct from Inhibitor magenta');
    assert(style.PRESENTATION_PALETTE.routeCyan !== style.PRESENTATION_PALETTE.corruptMagenta,
      'Route cyan must remain distinct from corruption magenta');
    assert(materials.getMaterialFamily('portalAperture').defaults.paletteRole === 'routeCyan',
      'Portal material family must declare route cyan');
  });

  await runner.run('Invalid events are dropped instead of leaking unknown objects to renderers', async () => {
    const frame = presentation.createPresentationFrame({
      scene: {},
      events: [null, {}, { type: '', payload: { bad: true } }, { type: 'portal.extracted', eventId: 'ok' }],
    });
    assert(frame.events.length === 1, `Expected one safe event, got ${frame.events.length}`);
    assert(frame.events[0].type === 'portal.extracted', 'Expected valid event to survive');
  });

  const ok = runner.summary();
  process.exit(ok ? 0 : 1);
}

run().catch((error) => {
  console.error('Presentation frame test fatal error:', error);
  process.exit(1);
});
