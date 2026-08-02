// src/render-three/renderable-hints.js
//
// Renderer-facing hint schema. Hints describe how an already-authoritative
// snapshot/event should be presented; they intentionally omit movement and
// contact truth.

import { hasMaterialFamily } from './material-registry.js';

export const RENDERABLE_CATEGORIES = Object.freeze([
  'player',
  'remoteShip',
  'threat',
  'salvage',
  'routeAnchor',
  'ecology',
  'anomaly',
  'fabric',
  'screen',
]);

export const ROLE_COLORS = Object.freeze([
  'playerCyan',
  'remoteBlue',
  'threatRed',
  'salvageBone',
  'routeAmber',
  'routeCyan',
  'ecologyGreen',
  'anomalyMagenta',
  'fabricBlue',
  'neutralWhite',
]);

export const MATTE_POLICIES = Object.freeze([
  'none',
  'softContact',
  'coreContact',
  'heavyOccluding',
  'apertureBackplate',
]);

export const VFX_FAMILIES = Object.freeze([
  'none',
  'thrusterWake',
  'portalAperture',
  'inhibitorShard',
  'titleFault',
  'scanNoise',
]);

export const LABEL_POLICIES = Object.freeze([
  'never',
  'debugOnly',
  'selectedOnly',
  'deckOff',
  'always',
]);

export const PRIORITY_LANES = Object.freeze([
  'background',
  'low',
  'normal',
  'high',
  'critical',
]);

export const CULLING_LANES = Object.freeze([
  'global',
  'camera',
  'nearField',
  'foreground',
  'hud',
  'debug',
]);

export const RENDERABLE_HINT_REQUIRED_FIELDS = Object.freeze([
  'category',
  'roleColor',
  'mattePolicy',
  'vfxFamily',
  'labelPolicy',
  'priority',
  'cullingLane',
]);

export const RENDERABLE_HINT_DEFAULTS = Object.freeze({
  category: 'anomaly',
  roleColor: 'neutralWhite',
  mattePolicy: 'softContact',
  vfxFamily: 'none',
  labelPolicy: 'debugOnly',
  priority: 'normal',
  cullingLane: 'camera',
  materialFamily: 'entityEcho',
});

export const RENDERABLE_HINT_SCHEMA = Object.freeze({
  version: 1,
  requiredFields: RENDERABLE_HINT_REQUIRED_FIELDS,
  fields: Object.freeze({
    category: Object.freeze({ allowed: RENDERABLE_CATEGORIES }),
    roleColor: Object.freeze({ allowed: ROLE_COLORS }),
    mattePolicy: Object.freeze({ allowed: MATTE_POLICIES }),
    vfxFamily: Object.freeze({ allowed: VFX_FAMILIES }),
    labelPolicy: Object.freeze({ allowed: LABEL_POLICIES }),
    priority: Object.freeze({ allowed: PRIORITY_LANES }),
    cullingLane: Object.freeze({ allowed: CULLING_LANES }),
    materialFamily: Object.freeze({ registry: 'material-registry' }),
  }),
});

function assertAllowed(field, value, allowed) {
  if (!allowed.includes(value)) {
    throw new Error(`Invalid renderable hint ${field}: ${value}`);
  }
}

export function validateRenderableHint(hint = {}) {
  for (const field of RENDERABLE_HINT_REQUIRED_FIELDS) {
    if (!Object.prototype.hasOwnProperty.call(hint, field)) {
      throw new Error(`Renderable hint missing ${field}`);
    }
  }
  assertAllowed('category', hint.category, RENDERABLE_CATEGORIES);
  assertAllowed('roleColor', hint.roleColor, ROLE_COLORS);
  assertAllowed('mattePolicy', hint.mattePolicy, MATTE_POLICIES);
  assertAllowed('vfxFamily', hint.vfxFamily, VFX_FAMILIES);
  assertAllowed('labelPolicy', hint.labelPolicy, LABEL_POLICIES);
  assertAllowed('priority', hint.priority, PRIORITY_LANES);
  assertAllowed('cullingLane', hint.cullingLane, CULLING_LANES);
  if (hint.materialFamily !== undefined && !hasMaterialFamily(hint.materialFamily)) {
    throw new Error(`Unknown renderable hint materialFamily: ${hint.materialFamily}`);
  }
  return true;
}

export function makeRenderableHint(overrides = {}) {
  const hint = Object.freeze({
    ...RENDERABLE_HINT_DEFAULTS,
    ...overrides,
  });
  validateRenderableHint(hint);
  return hint;
}
