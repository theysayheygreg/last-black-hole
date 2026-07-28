// Canonical Deck presentation sizing. These values affect pixels only; the
// authority radius supplied by the sim remains an input and is never changed.

import { worldDistance } from '../coords.js';

export const SPRITE_CARD_SCALE = 1.65;
export const PRESENTATION_DISTANCE_FLOOR = 0.88;

// Values are sprite half-radii in pixels on the 1280x720 render backing.
// The 1280x800 Deck capture keeps this same world backing and letterboxes it.
const FAMILY_SPECS = Object.freeze({
  stars: { default: { minPx: 20, basePx: 23, maxPx: 28 } },
  planetoids: {
    default: { minPx: 16, basePx: 18, maxPx: 24 },
    comet: { minPx: 18, basePx: 20, maxPx: 26 },
  },
  portals: {
    default: { minPx: 24, basePx: 27, maxPx: 34 },
    rift: { minPx: 29, basePx: 33, maxPx: 42 },
  },
  wrecks: {
    default: { minPx: 17, basePx: 20, maxPx: 26 },
    large: { minPx: 22, basePx: 26, maxPx: 34 },
    valuable: { minPx: 25, basePx: 30, maxPx: 38 },
    looted: { minPx: 13, basePx: 16, maxPx: 22 },
    cluster: { minPx: 10, basePx: 12, maxPx: 17 },
  },
  player: {
    default: { minPx: 19, basePx: 22, maxPx: 28 },
    breacher: { minPx: 21, basePx: 24, maxPx: 30 },
  },
  remotePlayers: { default: { minPx: 16, basePx: 18, maxPx: 24 } },
  shipCandidates: { default: { minPx: 16, basePx: 18, maxPx: 24 } },
  scavengers: {
    default: { minPx: 17, basePx: 20, maxPx: 26 },
    drifter: { minPx: 16, basePx: 19, maxPx: 24 },
    breacher: { minPx: 19, basePx: 22, maxPx: 28 },
  },
  fauna: { default: { minPx: 13, basePx: 15, maxPx: 20 } },
  sentries: { default: { minPx: 16, basePx: 19, maxPx: 24 } },
  inhibitors: {
    glitch: { minPx: 18, basePx: 21, maxPx: 27 },
    swarm: { minPx: 23, basePx: 27, maxPx: 34 },
    vessel: { minPx: 29, basePx: 35, maxPx: 44 },
  },
});

function normalizeKey(family, entity = {}) {
  const text = String(entity.visualState || entity.variant || entity.archetype || entity.kind || '').toLowerCase();
  if (family === 'portals' && text.includes('rift')) return 'rift';
  if (family === 'planetoids' && text.includes('comet')) return 'comet';
  if (family === 'wrecks') {
    if (entity.visualState === 'looted' || entity.looted) return 'looted';
    if (entity.visualState === 'valuable' || entity.valuable || entity.valueTier === 'valuable') return 'valuable';
    if (entity.size === 'large') return 'large';
    if (entity.visualState === 'cluster' || entity.size === 'scattered' || text.includes('debris')) return 'cluster';
  }
  if (family === 'player' || family === 'shipCandidates') {
    if (entity.hull?.type === 'breacher' || text.includes('breacher')) return 'breacher';
  }
  if (family === 'scavengers') {
    if (text.includes('breach')) return 'breacher';
    if (text.includes('drifter')) return 'drifter';
  }
  if (family === 'inhibitors') {
    if (text.includes('vessel')) return 'vessel';
    if (text.includes('swarm')) return 'swarm';
    return 'glitch';
  }
  return 'default';
}

export function resolveEntityPresentationSpec(family, entity = {}) {
  const familySpecs = FAMILY_SPECS[family] || FAMILY_SPECS.fauna;
  const key = normalizeKey(family, entity);
  return Object.freeze({
    family,
    key: familySpecs[key] ? key : 'default',
    ...(familySpecs[key] || familySpecs.default),
  });
}

export function resolveEntityPresentationScale({
  family,
  entity = {},
  authorityRadius = 0,
  camera = {},
  cameraView = 3,
  canvasHeight = 720,
  cameraDistance = null,
} = {}) {
  const spec = resolveEntityPresentationSpec(family, entity);
  const safeView = Math.max(0.001, Number(cameraView) || 3);
  const safeHeight = Math.max(1, Number(canvasHeight) || 720);
  const authorityPx = Math.max(0, Number(authorityRadius) || 0) * safeHeight / safeView;
  const boundedAuthorityPx = Math.min(spec.maxPx, authorityPx * 1.15);
  const basePx = Math.max(spec.basePx, boundedAuthorityPx);
  const distance = cameraDistance == null && Number.isFinite(entity.world?.x) && Number.isFinite(entity.world?.y)
    ? worldDistance(entity.world.x, entity.world.y, camera.cameraX ?? camera.x ?? 0, camera.cameraY ?? camera.y ?? 0)
    : Math.max(0, Number(cameraDistance) || 0);
  const distanceRatio = Math.min(1, distance / Math.max(0.001, safeView * 0.75));
  const distanceScale = 1 - distanceRatio * (1 - PRESENTATION_DISTANCE_FLOOR);
  const pixelRadius = Math.max(spec.minPx, Math.min(spec.maxPx, basePx * distanceScale));
  const spriteRadius = pixelRadius * 2 * safeView / (SPRITE_CARD_SCALE * safeHeight);
  return Object.freeze({
    ...spec,
    minPx: spec.minPx,
    maxPx: spec.maxPx,
    pixelRadius,
    spriteRadius,
    distanceScale,
    authorityRadius: Number(authorityRadius) || 0,
  });
}

export const ENTITY_PRESENTATION_SCALE = FAMILY_SPECS;
