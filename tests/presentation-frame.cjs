const path = require('path');
const { pathToFileURL } = require('url');
const nodeAssert = require('assert');
const { TestRunner, assert } = require('./helpers.cjs');

const ROOT = path.resolve(__dirname, '..');

async function importModule(relativePath) {
  return import(pathToFileURL(path.join(ROOT, relativePath)).href);
}

async function run() {
  const runner = new TestRunner('PresentationFrame');
  const presentation = await importModule('src/presentation/presentation-frame.js');
  const sceneSource = await importModule('src/presentation/scene-source.js');
  const style = await importModule('src/presentation/presentation-style.js');
  const materials = await importModule('src/render-three/material-registry.js');

  await runner.run('Local scene facts preserve grouped defaults and family filtering', async () => {
    const source = sceneSource.createPresentationSceneSource({
      phase: 'playing',
      isTitleBackdrop: true,
      localPlayer: {
        ship: {
          wx: 1, wy: 2, vx: 0.3, vy: -0.2, facing: 0.4,
          slingshotPhase: '', slingshotEngaged: false, slingshotTelegraph: { lock: true },
        },
        hullType: 'breacher',
        localDeltaVRatio: 0,
        deliveredThrust: 0.5,
        deliveredBrake: 0.01,
      },
      world: {
        wells: [{ name: 'gravity', wx: 1, wy: 2, mass: 0, killRadius: 0 }],
        stars: [{ id: 'live', wx: 2, wy: 3, mass: 0 }, { id: 'dead', alive: false }],
        remotePlayers: [{ clientId: 'gone', wx: 4, wy: 5, status: 'dead' }],
        fauna: [{ id: 'ghost-fauna', wx: 6, wy: 7, alive: false }],
      },
      slingshot: {
        localAffordance: { anchor: { wx: 8, wy: 9, range: 0.2, type: 'well' } },
      },
      semanticFieldSample: { hazard: 0.2, surf: 0, x: 0.3, y: -0.4 },
      defaults: { wellKillRadius: 0.05, portalCaptureRadius: 0.1 },
    });

    nodeAssert.deepStrictEqual({
      phase: source.phase,
      isTitleBackdrop: source.isTitleBackdrop,
      ship: source.ship,
      wells: source.wells,
      stars: source.stars,
      remotePlayers: source.remotePlayers,
      fauna: source.fauna,
      slingshot: source.slingshot,
      semanticField: source.semanticField,
    }, {
      phase: 'playing',
      isTitleBackdrop: true,
      ship: {
        wx: 1, wy: 2, vx: 0.3, vy: -0.2, facing: 0.4,
        hullType: 'breacher', deltaVRatio: 0, heatRatio: 1, overheated: true,
        overheatRemaining: 0, forceLedger: null, ruler: null,
        noise: null,
        slingshotEngaged: false, thrusting: true, braking: false,
      },
      wells: [{
        id: 'gravity', catalogId: 'base-well', behaviorId: 'base-well',
        wx: 1, wy: 2, mass: 1, visualMass: 0, orbitalDir: 1,
        overdriveTier: 0, overdriveMultiplier: 1,
        killRadius: 0.05, ringOuter: 0.125,
      }],
      stars: [{ id: 'live', wx: 2, wy: 3, mass: 1, type: 'mainSequence' }],
      remotePlayers: [{
        id: 'gone', wx: 4, wy: 5, vx: 0, vy: 0, status: 'dead', hullType: 'drifter',
      }],
      fauna: [{ id: 'ghost-fauna', wx: 6, wy: 7, size: 2, kind: 'fauna' }],
      slingshot: {
        phase: 'idle',
        affordance: { wx: 8, wy: 9, range: 0.2, type: 'well' },
        engaged: null,
        telegraph: { lock: true },
      },
      semanticField: {
        shipSample: {
          hazard: 0.2, current: { x: 0.3, y: -0.4 },
        },
      },
    });
    assert(source.wrecks.length === 0 && source.portals.length === 0 && source.sentries.length === 0,
      'Absent families must remain empty arrays');
  });

  await runner.run('Well growth fronts retain source identity and effective visual strength', async () => {
    const source = sceneSource.createPresentationSceneSource({
      phase: 'playing',
      localPlayer: { ship: { wx: 0, wy: 0, vx: 0, vy: 0, facing: 0 } },
      world: {
        wells: [{ id: 'well-a', wx: 1, wy: 2, mass: 1.25, orbitalDir: -1, overdriveMultiplier: 1.5 }],
        waveRings: [{
          id: 'wave-a', sourceWellId: 'well-a', sourceWX: 1, sourceWY: 2,
          radius: 0.4, amplitude: 0.6, initialAmplitude: 1,
        }],
      },
    });
    const frame = presentation.createPresentationFrame({
      phase: 'playing',
      scene: source,
      camera: { x: 1, y: 2, worldScale: 5, gridWindow: 3, view: 3 },
    });
    assert(frame.world.wells[0].orbitalDir === -1 && frame.world.wells[0].visualMass === 1.875,
      `Expected authoritative current and overdrive strength, got ${JSON.stringify(frame.world.wells[0])}`);
    assert(frame.world.waveRings[0].sourceWellId === 'well-a'
      && frame.world.waveRings[0].world.x === 1
      && frame.world.waveRings[0].radius === 0.4,
    `Expected one source-bound wavefront, got ${JSON.stringify(frame.world.waveRings[0])}`);
  });

  await runner.run('Remote authority facts win without changing source rows', async () => {
    const forceLedger = { tick: 9 };
    const ruler = { selectedWellId: 'well-a' };
    const authority = {
      phase: 'lock',
      aim: { anchorWX: 3, anchorWY: 4, anchorRange: 0.25, anchorType: 'star' },
      engaged: true,
      anchorWX: 5,
      anchorWY: 6,
      anchorRange: 0.3,
      anchorType: 'well',
      telegraph: { ownedArc: true },
    };
    const portal = {
      id: 'portal-a', wx: 7, wy: 8, opacity: 0, captureRadius: 0,
      blockedByInhibitor: true, finalInhibitor: true, warning: true, critical: false,
    };
    const source = sceneSource.createPresentationSceneSource({
      phase: 'paused',
      localPlayer: {
        ship: {
          wx: 1, wy: 2, vx: 0, vy: 0, facing: 0,
          slingshotPhase: 'arc', slingshotEngaged: true,
          slingshotAnchor: { wx: 10, wy: 11, range: 0.4, type: 'local' },
        },
        hullType: 'drifter',
        authorityDeltaVRatio: 0,
        localDeltaVRatio: 0.8,
        forceLedger,
        ruler,
        deliveredThrust: 1,
        deliveredBrake: 1,
      },
      world: {
        portals: [portal],
        wrecks: [{ id: 'dead', alive: false }, { id: 'vault', wx: 9, wy: 10, type: 'vault' }],
        collapseEpoch: { id: 'collapse-a' },
        collapseEpochSchedule: [{ id: 'epoch-a' }],
      },
      slingshot: {
        authority,
        localAffordance: { anchor: { wx: 12, wy: 13, range: 0.5, type: 'local' } },
      },
      defaults: { portalCaptureRadius: 0.12 },
    });

    nodeAssert.deepStrictEqual({
      ship: source.ship,
      portals: source.portals,
      wrecks: source.wrecks,
      collapseEpoch: source.collapseEpoch,
      collapseEpochSchedule: source.collapseEpochSchedule,
      slingshot: source.slingshot,
    }, {
      ship: {
        wx: 1, wy: 2, vx: 0, vy: 0, facing: 0,
        hullType: 'drifter', deltaVRatio: 0, heatRatio: 1, overheated: true,
        overheatRemaining: 0, forceLedger, ruler,
        noise: null,
        slingshotEngaged: true, thrusting: false, braking: false,
      },
      portals: [{
        id: 'portal-a', wx: 7, wy: 8, type: 'standard', opacity: 0, radius: 0.12,
        finalInhibitor: true, warning: true, critical: false,
      }],
      wrecks: [{
        id: 'vault', wx: 9, wy: 10, size: 'medium', tier: 1, type: 'vault',
        vx: 0, vy: 0, lootCount: 0, pickupCooldown: 0, isEcho: false,
        looted: false, valuable: true, valueTier: null, visualState: null,
      }],
      collapseEpoch: { id: 'collapse-a' },
      collapseEpochSchedule: [{ id: 'epoch-a' }],
      slingshot: {
        phase: 'lock',
        affordance: { wx: 3, wy: 4, range: 0.25, type: 'star' },
        engaged: { wx: 5, wy: 6, range: 0.3, type: 'well' },
        telegraph: { ownedArc: true },
      },
    });
    nodeAssert.deepStrictEqual(portal, {
      id: 'portal-a', wx: 7, wy: 8, opacity: 0, captureRadius: 0,
      blockedByInhibitor: true, finalInhibitor: true, warning: true, critical: false,
    }, 'Pure scene construction must not mutate runtime facts');
  });

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
        wrecks: [
          { id: 'wreck-a', wx: 0.1, wy: 0.2, size: 'scattered', type: 'debris', looted: false, loot: ['sim-secret'] },
          { id: 'wreck-vault', wx: 0.2, wy: 0.25, size: 'large', type: 'vault', tier: 3, looted: false },
        ],
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
    assert(frame.world.wrecks[1].visualState === 'valuable' && frame.world.wrecks[1].valuable === true,
      'Vault wrecks must retain their valuable presentation classification');
    assert(frame.world.portals[0].visualState === 'available', 'Expected normalized portal visual state');
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
