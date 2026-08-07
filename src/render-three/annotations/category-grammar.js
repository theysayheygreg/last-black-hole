// Semantic category grammar for the spatial HUD. This module chooses a
// silhouette, never placement, projection, signal truth, or gameplay state.

import {
  makeArcPlan,
  makeCornerBracketPlan,
  makeDashedRingPlan,
  makeLinePlan,
  makeProgressSectorPlan,
  makeRepeatedNotchPlan,
  makeRingPlan,
  makeSegmentedRingPlan,
  makeTaperedPointerPlan,
} from './analytic-primitives.js';

export const ANNOTATION_CATEGORIES = Object.freeze([
  'noise',
  'portal',
  'exfil',
  'grapple',
  'salvage',
  'vessel',
  'inhibitor',
]);

const DEFAULT_EXTENT_PX = 54;

function fail(message) {
  throw new Error(`Invalid annotation category grammar: ${message}`);
}

function extent(value = DEFAULT_EXTENT_PX) {
  const number = Number(value);
  if (!Number.isFinite(number) || number < 16) fail('extentPx must be a finite value >= 16');
  return number;
}

function progress(value, label) {
  const number = Number(value);
  if (!Number.isFinite(number) || number < 0 || number > 1) fail(`${label} must be within 0..1`);
  return number;
}

function plan(category, pieces, metadata = {}) {
  return Object.freeze({
    category,
    localSpace: 'anchor-pixels',
    colorIndependent: true,
    pieces: Object.freeze(pieces),
    metadata: Object.freeze(metadata),
  });
}

function portalPlan(category, options) {
  const e = extent(options.extentPx);
  return plan(category, [
    makeSegmentedRingPlan({ extentPx: e, segmentCount: 5, gapFraction: 0.24, ...options }),
    makeProgressSectorPlan({ extentPx: e * 1.2, progress: progress(options.collapseProgress ?? 0, 'collapseProgress'), emphasis: true, ...options }),
    makeProgressSectorPlan({ extentPx: e * 0.79, progress: progress(options.apertureProgress ?? 0, 'apertureProgress'), ...options }),
  ], {
    silhouette: 'five-segment route ring with dual timing arcs',
    timing: 'collapse outer; aperture inner',
  });
}

export function makeCategoryAnnotationPlan(category, options = {}) {
  if (!ANNOTATION_CATEGORIES.includes(category)) {
    fail(`category must be one of ${ANNOTATION_CATEGORIES.join(', ')}`);
  }
  const e = extent(options.extentPx);
  const primitiveOptions = { viewportClass: options.viewportClass || 'desktop' };

  if (category === 'noise') {
    const magnitude = Math.max(0, Math.min(1, Number(options.magnitude) || 0));
    return plan(category, [
      makeDashedRingPlan({ extentPx: e, dashCount: 10, gapFraction: 0.42, ...primitiveOptions }),
      makeTaperedPointerPlan({ lengthPx: 14 + magnitude * 22, baseWidthPx: 8, ...primitiveOptions }),
    ], { silhouette: 'expanding dashed ring with directional magnitude pointer', magnitude, motion: 'expansion comes from the owning presentation clock' });
  }
  if (category === 'portal' || category === 'exfil') {
    return portalPlan(category, { ...primitiveOptions, ...options, extentPx: e });
  }
  if (category === 'grapple') {
    const attached = Boolean(options.attached);
    return plan(category, [
      makeArcPlan({ extentPx: e, startTurn: 0.14, endTurn: 0.86, emphasis: true, ...primitiveOptions }),
      makeRingPlan({ extentPx: e * 0.62, ...primitiveOptions }),
      ...(attached ? [makeLinePlan({ lengthPx: e * 1.45, emphasis: true, ...primitiveOptions })] : []),
    ], {
      silhouette: 'reachable arc with capture allowance and optional tether',
      attached,
    });
  }
  if (category === 'salvage') {
    return plan(category, [
      makeCornerBracketPlan({ extentPx: e, cornerFraction: 0.22, ...primitiveOptions }),
      makeRepeatedNotchPlan({ extentPx: e * 1.1, notchCount: 3, ...primitiveOptions }),
    ], { silhouette: 'three-notch bracket family' });
  }
  if (category === 'vessel') {
    return plan(category, [
      makeCornerBracketPlan({ extentPx: e, cornerFraction: 0.32, emphasis: Boolean(options.hostile || options.selected), ...primitiveOptions }),
      ...(options.selected ? [makeTaperedPointerPlan({ lengthPx: e * 0.56, baseWidthPx: 10, ...primitiveOptions })] : []),
    ], {
      silhouette: 'four-corner bracket family',
      stateAccent: options.hostile ? 'hostile' : (options.selected ? 'selected' : 'none'),
    });
  }
  return plan(category, [
    makeDashedRingPlan({ extentPx: e, dashCount: 7, gapFraction: 0.53, emphasis: true, ...primitiveOptions }),
    makeRepeatedNotchPlan({ extentPx: e * 0.7, notchCount: 4, inward: true, ...primitiveOptions }),
  ], { silhouette: 'broken inward-facing containment geometry' });
}
