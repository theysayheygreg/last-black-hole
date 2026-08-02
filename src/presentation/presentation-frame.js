// The presentation frame is the only world-shaped input a renderer needs.
// It contains display facts and semantic roles, never mutable sim objects or
// gameplay callbacks, so Three and future native renderers share one boundary.

import { CAMERA_VIEW } from '../coords.js';
import { FABRIC } from '../content/fabric.js';
import { FORCE_LEDGER_CLASSES } from '../ruler-contract.js';
import {
  PRESENTATION_PALETTE_ID,
  PRESENTATION_ROLE_HINTS,
  normalizePresentationQuality,
  resolvePresentationQuality,
} from './presentation-style.js';

export const PRESENTATION_FRAME_VERSION = 1;

const WORLD_FAMILIES = Object.freeze([
  'wells',
  'waveRings',
  'stars',
  'wrecks',
  'portals',
  'planetoids',
  'scavengers',
  'remotePlayers',
  'shipCandidates',
  'fauna',
  'sentries',
  'inhibitors',
  'noiseEmitters',
]);

function finite(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function optionalFinite(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : undefined;
}

function opacity(source = {}) {
  return Math.max(0, Math.min(1, finite(source.opacity, 1)));
}

function text(value, fallback = '') {
  return value == null ? fallback : String(value);
}

function id(value, fallback) {
  const resolved = text(value, fallback).trim();
  return resolved || fallback;
}

function point(source = {}, xKey = 'wx', yKey = 'wy') {
  return Object.freeze({ x: finite(source[xKey]), y: finite(source[yKey]) });
}

function velocity(source = {}) {
  const x = finite(source.vx);
  const y = finite(source.vy);
  return Object.freeze({ x, y, speed: Math.hypot(x, y) });
}

function forceVector(source = {}) {
  const x = finite(source.x);
  const y = finite(source.y);
  return Object.freeze({ x, y, magnitude: Math.hypot(x, y) });
}

function forceLedger(source = null) {
  if (!source) return null;
  const vectors = {};
  for (const name of FORCE_LEDGER_CLASSES) vectors[name] = forceVector(source.vectors?.[name]);
  return Object.freeze({
    tick: Math.max(0, Math.floor(finite(source.tick))),
    dt: Math.max(0, finite(source.dt)),
    unit: text(source.unit, 'm/s^2'),
    vectors: Object.freeze(vectors),
    total: forceVector(source.total),
    deltaV: forceVector(source.deltaV_mps),
  });
}

function normalizeParameterVector(source = null) {
  if (!source || typeof source !== 'object') return Object.freeze({});
  const vector = {};
  for (const key of ['seededSeaAmbientMultiplier']) {
    const value = optionalFinite(source[key]);
    if (value !== undefined) vector[key] = value;
  }
  return Object.freeze(vector);
}

function normalizeCollapseEpoch(source = null) {
  if (!source || typeof source !== 'object' || !source.epochId) return null;
  return Object.freeze({
    epochId: id(source.epochId, 'collapse-epoch-unknown'),
    epochIndex: Math.max(0, Math.floor(finite(source.epochIndex))),
    scheduledTime: Math.max(0, finite(source.scheduledTime)),
    transitionCount: Math.max(0, Math.floor(finite(source.transitionCount))),
    parameterVector: normalizeParameterVector(source.parameterVector),
  });
}

function normalizeCollapseEpochSchedule(source = []) {
  if (!Array.isArray(source)) return Object.freeze([]);
  return Object.freeze(source.map((entry) => normalizeCollapseEpoch(entry)).filter(Boolean));
}

function rulerFacts(source = null) {
  const sling = source?.slingshot;
  if (!sling) return null;
  const radii = sling.radii || {};
  const reel = sling.reel || {};
  const boost = sling.flatBoost || {};
  const assist = sling.releaseAssist || {};
  return Object.freeze({
    source: text(source.source, 'authority'),
    slingshot: Object.freeze({
      radii: Object.freeze({
        hookMeters: Math.max(0, finite(radii.hook_m)),
        swingMeters: Math.max(0, finite(radii.swing_m)),
      }),
      reel: Object.freeze({
        active: reel.active === true,
        entry: forceVector(reel.entry),
        locked: forceVector(reel.locked),
        bendDegrees: Math.max(0, finite(reel.bend_deg)),
        configuredMs: Math.max(0, finite(reel.configured_ms)),
      }),
      flatBoost: Object.freeze({
        active: boost.active === true,
        entry: forceVector(boost.entry),
        exit: forceVector(boost.exit),
        amount: Math.max(0, finite(boost.amount)),
      }),
      releaseAssist: Object.freeze({
        degrees: Math.max(0, finite(assist.degrees)),
      }),
    }),
  });
}

function hull(source = {}) {
  return Object.freeze({
    type: text(source.hullType || source.shipType, 'drifter').toLowerCase(),
    integrityRatio: Math.max(0, Math.min(1, finite(source.hullRatio ?? source.integrityRatio, 1))),
  });
}

function pathState(source = {}, sling = {}) {
  if (source.status === 'dead') return 'disabled';
  if (source.braking === true) return 'braking';
  if (source.thrusting === true) return 'thrusting';
  if (source.slingshotEngaged === true || sling.engaged) return 'slingshot';
  return Math.hypot(finite(source.vx), finite(source.vy)) > 0.01 ? 'coasting' : 'idle';
}

function hint(role, overrides = null) {
  return Object.freeze({
    ...(PRESENTATION_ROLE_HINTS[role] || PRESENTATION_ROLE_HINTS.anomaly),
    ...(overrides || {}),
  });
}

function anchor(source = {}) {
  if (!source || !Number.isFinite(Number(source.wx)) || !Number.isFinite(Number(source.wy))) return null;
  return Object.freeze({
    world: point(source),
    range: Math.max(0, finite(source.range, 0.1)),
    kind: text(source.type, 'gravity'),
  });
}

function telegraph(source = null) {
  if (!source) return null;
  const normalizeAnchor = (value) => anchor({
    wx: value?.wx,
    wy: value?.wy,
    range: value?.range,
    type: value?.type,
  });
  const lock = source.lock;
  const ownedArc = source.ownedArc;
  const ghost = source.releaseGhost;
  return Object.freeze({
    phase: text(source.phase, 'idle'),
    aimCue: source.aimCue ? Object.freeze({
      anchor: normalizeAnchor(source.aimCue.anchor),
      distance: Math.max(0, finite(source.aimCue.distance)),
      speed: Math.max(0, finite(source.aimCue.speed)),
      engageEligible: source.aimCue.engageEligible === true,
    }) : null,
    lock: lock ? Object.freeze({
      anchor: normalizeAnchor(lock.anchor),
      entry: forceVector(lock.entry),
      locked: forceVector(lock.locked),
      bendDegrees: Math.max(0, finite(lock.bendDegrees)),
    }) : null,
    ownedArc: ownedArc ? Object.freeze({
      anchor: normalizeAnchor(ownedArc.anchor),
      orbitDir: finite(ownedArc.orbitDir),
      arcRadians: finite(ownedArc.arcRadians),
      swingRadius: Math.max(0, finite(ownedArc.swingRadius)),
      hookRadius: Math.max(0, finite(ownedArc.hookRadius)),
      reelProgress: Math.max(0, Math.min(1, finite(ownedArc.reelProgress))),
      speed: Math.max(0, finite(ownedArc.speed)),
      boost: Math.max(0, finite(ownedArc.boost)),
    }) : null,
    releaseGhost: ghost ? Object.freeze({
      anchor: normalizeAnchor(ghost.anchor),
      entry: forceVector(ghost.entry),
      exit: forceVector(ghost.exit),
      direction: forceVector(ghost.direction),
      speed: Math.max(0, finite(ghost.speed)),
      remainingMs: Math.max(0, finite(ghost.remainingMs)),
      unspoolSeconds: Math.max(0, finite(ghost.unspoolSeconds)),
    }) : null,
  });
}

function normalizeLocalPlayer(source = null, scene = {}) {
  if (!source) return null;
  const motion = velocity(source);
  const sling = scene.slingshot || source.slingshot || {};
  return Object.freeze({
    id: id(source.id || source.clientId, 'local-player'),
    world: point(source),
    opacity: opacity(source),
    movement: Object.freeze({
      velocity: motion,
      facing: finite(source.facing, Math.atan2(motion.y, motion.x)),
      heatRatio: Math.max(0, Math.min(1, finite(
        source.heatRatio ?? (source.deltaVRatio != null ? 1 - source.deltaVRatio : 0),
      ))),
      overheated: source.overheated === true,
      overheatRemaining: Math.max(0, finite(source.overheatRemaining)),
      noise: source.noise ? Object.freeze({
        audibleRadiusMeters: Math.max(0, finite(source.noise.audibleRadiusMeters)),
        trend: text(source.noise.trend, 'steady'),
        currentSource: text(source.noise.currentSource, 'IDLE'),
        heardListenerCount: Math.max(0, finite(source.noise.heardListenerCount)),
        trackedListenerCount: Math.max(0, finite(source.noise.trackedListenerCount)),
        lockedOnListenerCount: Math.max(0, finite(source.noise.lockedOnListenerCount)),
      }) : null,
      thrusting: source.thrusting === true,
      braking: source.braking === true,
      pathState: pathState(source, sling),
    }),
    hull: hull(source),
    forceLedger: forceLedger(source.forceLedger),
    ruler: rulerFacts(source.ruler),
    slingshot: Object.freeze({
      engaged: Boolean(source.slingshotEngaged || sling.engaged),
      affordance: anchor(sling.affordance),
      anchor: anchor(sling.engaged || source.slingshotAnchor),
      phase: text(sling.phase, source.slingshotPhase || 'idle'),
      telegraph: telegraph(sling.telegraph),
    }),
    status: text(source.status, 'alive'),
    hint: hint('player'),
  });
}

function normalizeEntity(family, source, index) {
  const base = {
    id: id(source?.id || source?.name, `${family}-${index}`),
    world: point(source, family === 'waveRings' ? 'sourceWX' : 'wx', family === 'waveRings' ? 'sourceWY' : 'wy'),
    opacity: opacity(source),
  };
  switch (family) {
    case 'wells':
      return Object.freeze({
        ...base,
        catalogId: id(source.catalogId, 'base-well'),
        behaviorId: id(source.behaviorId, 'base-well'),
        mass: Math.max(0, finite(source.mass, 1)),
        visualMass: Math.max(0, finite(source.visualMass, source.mass || 1)),
        orbitalDir: finite(source.orbitalDir, 1),
        overdriveTier: Math.max(0, Math.floor(finite(source.overdriveTier))),
        overdriveMultiplier: Math.max(1, finite(source.overdriveMultiplier, 1)),
        visual: Object.freeze({
          coreRadius: Math.max(0.001, finite(source.killRadius, 0.04)),
          outerRadius: Math.max(0.001, finite(source.ringOuter, 0.1)),
        }),
        hint: hint('anomaly', { category: 'fabric', roleColor: 'neutralWhite', vfxFamily: 'none' }),
      });
    case 'waveRings':
      return Object.freeze({
        ...base,
        eventId: id(source.eventId || source.id, 'wave-event'),
        cause: text(source.cause, 'unknown'),
        sourceWellId: source.sourceWellId == null ? null : id(source.sourceWellId, null),
        radius: Math.max(0, finite(source.radius, 0.01)),
        previousRadius: Math.max(0, finite(source.previousRadius, source.radius)),
        frontWidth: Math.max(0.001, finite(source.frontWidth, FABRIC.eventWave.frontWidth)),
        state: source.state === 'telegraph' ? 'telegraph' : 'active',
        launchTime: Math.max(0, finite(source.launchTime)),
        telegraphStartTime: Math.max(0, finite(source.telegraphStartTime)),
        strength: Math.max(0, finite(source.amplitude)),
        initialStrength: Math.max(0.0001, finite(source.initialAmplitude, source.amplitude || 1)),
        hint: hint('anomaly', { category: 'fabric', roleColor: 'fabricBlue', vfxFamily: 'fabricWave' }),
      });
    case 'stars':
      return Object.freeze({
        ...base,
        visualScale: Math.max(0.1, finite(source.mass, 1)),
        variant: text(source.type, 'mainSequence'),
        hint: hint('portal', { category: 'routeAnchor', roleColor: 'routeAmber', vfxFamily: 'none' }),
      });
    case 'wrecks':
      {
      const variant = text(source.type, 'derelict');
      const valuable = source.visualState === 'valuable'
        || source.valuable === true
        || source.valueTier === 'valuable'
        || variant === 'vault';
      const visualState = source.looted === true
        ? 'looted'
        : valuable
          ? 'valuable'
          : (source.cluster === true || source.size === 'scattered' || variant === 'debris' ? 'cluster' : 'intact');
      return Object.freeze({
        ...base,
        size: text(source.size, 'medium'),
        tier: Math.max(1, Math.floor(finite(source.tier, 1))),
        variant,
        looted: source.looted === true,
        valuable,
        visualState,
        hint: hint('wreck', source.looted ? { priority: 'low', roleColor: 'neutralWhite' } : null),
      });
      }
    case 'portals':
      {
      const variant = text(source.type, 'standard');
      const final = source.final === true || source.finalInhibitor === true;
      return Object.freeze({
        ...base,
        variant,
        radius: Math.max(0.001, finite(source.radius ?? source.captureRadius, 0.08)),
        final,
        visualState: variant === 'rift'
          ? 'rift'
          : source.ready === true || source.interactionReady === true
            ? 'ready'
            : final ? 'final' : 'available',
        hint: hint('portal'),
      });
      }
    case 'planetoids':
      return Object.freeze({ ...base, movement: velocity(source), variant: text(source.type, 'orbit'), hint: hint('portal', { priority: 'normal' }) });
    case 'scavengers':
      return Object.freeze({
        ...base,
        movement: Object.freeze({ velocity: velocity(source), facing: finite(source.facing) }),
        variant: text(source.archetype, 'scavenger'),
        status: text(source.state, 'patrol'),
        hint: hint('threat'),
      });
    case 'remotePlayers':
      return Object.freeze({
        ...base,
        movement: Object.freeze({ velocity: velocity(source), facing: optionalFinite(source.facing) }),
        status: text(source.status, 'alive'),
        variant: text(source.hullType, 'drifter'),
        hull: hull(source),
        hint: hint('remotePlayer'),
      });
    case 'shipCandidates':
      return Object.freeze({
        ...base,
        movement: Object.freeze({ velocity: velocity(source), facing: optionalFinite(source.facing) }),
        variant: source.variant === 'pixel-mesh' ? 'pixel-mesh' : 'sprite-card',
        hull: hull(source),
        radius: Math.max(0.001, finite(source.radius, 0.04)),
        hint: hint('player'),
      });
    case 'fauna':
      return Object.freeze({
        ...base,
        size: Math.max(1, finite(source.size, 2)),
        variant: text(source.kind, 'fauna'),
        hint: hint('ecology'),
      });
    case 'sentries':
      return Object.freeze({ ...base, status: text(source.state, 'patrol'), hint: hint('ecology', { priority: 'high' }) });
    case 'inhibitors':
      return Object.freeze({
        ...base,
        kind: text(source.kind, 'glitch'),
        lifecycle: text(source.lifecycle, 'alive'),
        age: Math.max(0, finite(source.age ?? source.ageSeconds)),
        lifetime: Math.max(0, finite(source.lifetime ?? source.lifetimeSeconds)),
        intensity: Math.max(0, Math.min(1, finite(source.intensity))),
        radius: Math.max(0.001, finite(source.radius, 0.1)),
        coreRadius: Math.max(0.001, finite(source.coreRadius, 0.045)),
        contactRadius: Math.max(0, finite(source.contactRadius)),
        outerDamageRadius: Math.max(0, finite(source.outerDamageRadius)),
        inbound: source.inbound ? Object.freeze({
          edge: source.inbound.edge || null,
          tellSeconds: Math.max(0, finite(source.inbound.tellSeconds)),
          remainingSeconds: Math.max(0, finite(source.inbound.remainingSeconds)),
        }) : null,
        awareness: text(source.awareness, source.kind === 'vessel' ? 'STRATEGIC' : 'NONE'),
        target: source.target ? point(source.target, 'wx', 'wy') : null,
        lastHeard: source.lastHeard ? Object.freeze({
          ...point(source.lastHeard, 'wx', 'wy'),
          ageSeconds: Math.max(0, finite(source.lastHeard.ageSeconds)),
        }) : null,
        listensToNoise: source.listensToNoise === true,
        noiseListenerState: text(source.noiseListenerState, 'QUIET'),
        noiseSearchState: text(source.noiseSearchState, 'IDLE'),
        movement: Object.freeze({ velocity: velocity(source) }),
        visual: Object.freeze({
          family: source.kind === 'vessel'
            ? 'strategic-vessel-magenta'
            : source.kind === 'swarm' ? 'noise-hunting-fabric' : 'magenta-fabric-corruption',
          core: source.kind === 'vessel' ? 'instant-kill' : 'damaging',
        }),
        hint: hint('anomaly', {
          roleColor: 'anomalyMagenta',
          vfxFamily: 'inhibitorShard',
          priority: 'high',
          labelPolicy: 'debugOnly',
        }),
      });
    case 'noiseEmitters':
      return Object.freeze({
        ...base,
        sourceKind: text(source.sourceKind, 'world'),
        source: text(source.source, 'NOISE'),
        sourceClass: source.sourceClass ? text(source.sourceClass) : null,
        radiusMeters: Math.max(0, finite(source.radiusMeters)),
        hint: hint('ecology', { labelPolicy: 'debugOnly' }),
      });
    default:
      return Object.freeze({ ...base, hint: hint('anomaly') });
  }
}

function normalizeWorld(scene = {}) {
  const world = {};
  for (const family of WORLD_FAMILIES) {
    const list = Array.isArray(scene[family]) ? scene[family] : [];
    world[family] = Object.freeze(list.map((entry, index) => normalizeEntity(family, entry || {}, index)));
  }
  world.titleBackdrop = scene.isTitleBackdrop === true;
  world.semanticField = Object.freeze({
    localSample: scene.semanticField?.shipSample ? Object.freeze({
      hazard: finite(scene.semanticField.shipSample.hazard),
    }) : null,
  });
  world.collapseEpoch = normalizeCollapseEpoch(scene.collapseEpoch);
  world.collapseEpochSchedule = normalizeCollapseEpochSchedule(scene.collapseEpochSchedule);
  return Object.freeze(world);
}

function normalizeEvent(source, index) {
  if (!source || !source.type) return null;
  const details = source.payload && typeof source.payload === 'object' ? source.payload : source;
  const eventId = id(source.eventId || source.id || source.seq, `presentation-event-${index}`);
  const event = {
    eventId,
    type: text(source.type),
    sequence: Math.max(0, Math.floor(finite(source.seq ?? source.sequence))),
    runId: source.runId == null ? null : text(source.runId),
    lane: text(source.lane, 'vfx'),
    sourceId: source.sourceId == null && source.source == null ? null : text(source.sourceId ?? source.source),
    subjectId: source.subjectId == null && source.subject == null ? null : text(source.subjectId ?? source.subject),
    simTime: Math.max(0, finite(source.simTime ?? source.time)),
  };
  for (const key of ['screenX', 'screenY', 'glyphWidth', 'glyphHeight', 'intensity']) {
    const value = optionalFinite(source[key]);
    if (value !== undefined) event[key] = value;
  }
  for (const key of ['glyph', 'cleanGlyph', 'seed', 'role', 'variant']) {
    if (source[key] != null) event[key] = text(source[key]);
  }
  for (const key of ['wellId', 'catalogId', 'behaviorId', 'waveId', 'tellId', 'epochId', 'sourceEntityId']) {
    if (source[key] != null || details[key] != null) event[key] = text(source[key] ?? details[key]);
  }
  if (details.source != null) event.growthSource = text(details.source);
  if (details.reason != null) event.growthReason = text(details.reason);
  for (const key of ['scheduledTime', 'eventTime']) {
    const value = optionalFinite(source[key] ?? details[key]);
    if (value !== undefined) event[key] = Math.max(0, value);
  }
  for (const key of ['before', 'after']) {
    if (details[key] && typeof details[key] === 'object') {
      event[key] = Object.freeze({
        mass: Math.max(0, finite(details[key].mass)),
        killRadius: Math.max(0, finite(details[key].killRadius)),
      });
    }
  }
  if (source.heavy === true) event.heavy = true;
  if (Number.isFinite(Number(source.wx ?? details.wx)) && Number.isFinite(Number(source.wy ?? details.wy))) {
    event.world = point({ wx: source.wx ?? details.wx, wy: source.wy ?? details.wy });
  }
  return Object.freeze(event);
}

export function createPresentationFrame(input = {}, defaults = {}) {
  const scene = input.world || input.scene || {};
  const qualityTier = normalizePresentationQuality(
    input.style?.qualityTier || input.qualityTier || defaults.qualityTier || 'default'
  );
  const quality = resolvePresentationQuality(qualityTier);
  const camera = input.camera || {};
  const localSource = input.localPlayer || scene.ship || input.ship
    ? { ...(input.ship || {}), ...(scene.ship || {}), ...(input.localPlayer || {}) }
    : null;
  const localPlayer = normalizeLocalPlayer(localSource, scene);
  const events = (Array.isArray(input.events) ? input.events : input.vfxEvents || [])
    .map(normalizeEvent)
    .filter(Boolean);
  return Object.freeze({
    version: PRESENTATION_FRAME_VERSION,
    frameId: Math.max(0, Math.floor(finite(input.frameId))),
    runId: input.runId == null ? null : text(input.runId),
    phase: text(input.phase || scene.phase, 'title'),
    timing: Object.freeze({
      dt: Math.max(0, finite(input.timing?.dt ?? input.dt, 1 / 60)),
      totalTime: Math.max(0, finite(input.timing?.totalTime ?? input.totalTime)),
    }),
    runClock: Object.freeze({
      elapsedSeconds: Math.max(0, finite(input.runTime?.elapsedSeconds)),
      durationSeconds: Math.max(0, finite(input.runTime?.durationSeconds)),
      progress: input.runTime?.durationSeconds > 0
        ? Math.max(0, Math.min(1, finite(input.runTime.elapsedSeconds) / input.runTime.durationSeconds))
        : 0,
    }),
    camera: Object.freeze({
      x: finite(camera.x ?? camera.camX ?? input.camX),
      y: finite(camera.y ?? camera.camY ?? input.camY),
      worldScale: Math.max(0.001, finite(camera.worldScale ?? input.worldScale, 3)),
      gridWindow: Math.max(0.001, finite(camera.gridWindow ?? input.gridWindow, 3)),
      view: Math.max(0.001, finite(camera.view ?? camera.cameraView ?? input.cameraView, CAMERA_VIEW)),
    }),
    localPlayer,
    world: normalizeWorld(scene),
    hints: Object.freeze({
      localPlayer: localPlayer?.hint || null,
      semanticField: scene.semanticField ? 'fabric-owned' : 'none',
    }),
    style: Object.freeze({
      qualityTier,
      paletteId: text(input.style?.paletteId, PRESENTATION_PALETTE_ID),
      roleHints: PRESENTATION_ROLE_HINTS,
      entityBudgets: quality.entityBudgets,
    }),
    events: Object.freeze(events),
    vfxConfig: Object.freeze({ ...(input.vfxConfig || {}) }),
  });
}

export function resolvePresentationFrame(frameContext = {}, defaults = {}) {
  if (frameContext.presentation?.version === PRESENTATION_FRAME_VERSION) return frameContext.presentation;
  if (frameContext.presentation) return createPresentationFrame(frameContext.presentation, defaults);
  return createPresentationFrame(frameContext.three || {}, defaults);
}
