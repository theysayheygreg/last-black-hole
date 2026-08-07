// Screen-space annotation layout only. World projection belongs to coords.js;
// callers provide already-projected anchors and silhouette bounds.

const DEFAULT_CANDIDATES = Object.freeze(['north', 'northEast', 'northWest', 'south', 'southEast', 'southWest', 'east', 'west']);

export const ANNOTATION_LABEL_VIEWPORTS = Object.freeze({
  desktop: Object.freeze({ edgeMargin: 10, clearance: 8, labelGap: 6, hysteresis: 3 }),
  deck: Object.freeze({ edgeMargin: 14, clearance: 12, labelGap: 9, hysteresis: 4 }),
});

function finite(value, fallback = 0) {
  return Number.isFinite(Number(value)) ? Number(value) : fallback;
}

function nonEmptyId(value, fallback) {
  const id = String(value ?? '').trim();
  return id || fallback;
}

function positive(value, fallback) {
  return Math.max(1, finite(value, fallback));
}

function normalizeRect(rect, fallback = {}) {
  return Object.freeze({
    x: finite(rect?.x, finite(fallback.x)),
    y: finite(rect?.y, finite(fallback.y)),
    w: positive(rect?.w, finite(fallback.w, 1)),
    h: positive(rect?.h, finite(fallback.h, 1)),
  });
}

function clampRect(rect, viewport, margin) {
  const w = Math.min(rect.w, Math.max(1, viewport.width - margin * 2));
  const h = Math.min(rect.h, Math.max(1, viewport.height - margin * 2));
  return Object.freeze({
    x: Math.max(margin, Math.min(viewport.width - margin - w, rect.x)),
    y: Math.max(margin, Math.min(viewport.height - margin - h, rect.y)),
    w,
    h,
  });
}

export function annotationRectsOverlap(a, b, gap = 0) {
  return a.x < b.x + b.w + gap
    && a.x + a.w + gap > b.x
    && a.y < b.y + b.h + gap
    && a.y + a.h + gap > b.y;
}

export function resolveAnnotationLabelViewport(options = {}) {
  const viewportClass = options.viewportClass === 'deck' ? 'deck' : 'desktop';
  const policy = ANNOTATION_LABEL_VIEWPORTS[viewportClass];
  return Object.freeze({
    width: Math.max(1, finite(options.width ?? options.canvasW, 1280)),
    height: Math.max(1, finite(options.height ?? options.canvasH, 800)),
    viewportClass,
    zoom: Math.max(0, finite(options.zoom, 1)),
    edgeMargin: Math.max(0, finite(options.edgeMargin, policy.edgeMargin)),
    clearance: Math.max(0, finite(options.clearance, policy.clearance)),
    labelGap: Math.max(0, finite(options.labelGap, policy.labelGap)),
    hysteresis: Math.max(0, finite(options.hysteresis, policy.hysteresis)),
  });
}

export function createAnnotationLabelLayoutState() {
  return {
    anchors: new Map(),
    frame: 0,
  };
}

export function resetAnnotationLabelLayoutState(state) {
  if (!state || !(state.anchors instanceof Map)) return createAnnotationLabelLayoutState();
  state.anchors.clear();
  state.frame = 0;
  return state;
}

export function forgetAnnotationLabel(state, id) {
  if (state?.anchors instanceof Map) state.anchors.delete(String(id));
}

function normalizeEntry(entry, index) {
  const id = nonEmptyId(entry?.id, `annotation-${index}`);
  const anchorX = finite(entry?.anchor?.x ?? entry?.anchorX);
  const anchorY = finite(entry?.anchor?.y ?? entry?.anchorY);
  // interactionRadius is already a screen-space radius supplied by the
  // projection owner. It is not a world-radius conversion.
  const interactionRadius = Math.max(0, finite(entry?.interactionRadius));
  const subject = normalizeRect(entry?.subjectBounds ?? entry?.silhouetteBounds ?? entry?.interactionBounds, interactionRadius > 0 ? {
    x: anchorX - interactionRadius,
    y: anchorY - interactionRadius,
    w: interactionRadius * 2,
    h: interactionRadius * 2,
  } : {
    x: anchorX - 1,
    y: anchorY - 1,
    w: 2,
    h: 2,
  });
  return Object.freeze({
    ...entry,
    id,
    order: finite(entry?.order, index),
    index,
    anchorX,
    anchorY,
    width: positive(entry?.width, 120),
    height: positive(entry?.height, 18),
    subjectBounds: subject,
    placement: entry?.placement === 'fixed' ? 'fixed' : 'moving',
    minZoom: Math.max(0, finite(entry?.minZoom)),
    candidates: Array.isArray(entry?.candidates) && entry.candidates.length
      ? entry.candidates.map(String)
      : DEFAULT_CANDIDATES,
  });
}

function candidateRect(subject, width, height, candidate, clearance) {
  const centerX = subject.x + subject.w / 2;
  const centerY = subject.y + subject.h / 2;
  const north = subject.y - clearance - height;
  const south = subject.y + subject.h + clearance;
  const east = subject.x + subject.w + clearance;
  const west = subject.x - clearance - width;
  switch (candidate) {
    case 'north': return { x: centerX - width / 2, y: north, w: width, h: height };
    case 'northEast': return { x: east, y: north, w: width, h: height };
    case 'northWest': return { x: west, y: north, w: width, h: height };
    case 'south': return { x: centerX - width / 2, y: south, w: width, h: height };
    case 'southEast': return { x: east, y: south, w: width, h: height };
    case 'southWest': return { x: west, y: south, w: width, h: height };
    case 'east': return { x: east, y: centerY - height / 2, w: width, h: height };
    case 'west': return { x: west, y: centerY - height / 2, w: width, h: height };
    default: return null;
  }
}

function candidateScore(raw, bounds, order) {
  return order + (Math.abs(raw.x - bounds.x) + Math.abs(raw.y - bounds.y)) / 100;
}

function collectReservedRegions(options) {
  return [
    ...(Array.isArray(options.reservedRegions) ? options.reservedRegions : []),
    ...(Array.isArray(options.hudReservedRegions) ? options.hudReservedRegions : []),
    ...(Array.isArray(options.shipInstrumentBounds) ? options.shipInstrumentBounds : []),
    ...(options.shipHeatBounds ? [options.shipHeatBounds] : []),
    ...(options.shipSpeedBounds ? [options.shipSpeedBounds] : []),
  ].filter(Boolean).map((rect) => normalizeRect(rect));
}

function viableCandidates(entry, viewport, blocked) {
  const candidates = [];
  const seen = new Set();
  for (let index = 0; index < entry.candidates.length; index += 1) {
    const key = entry.candidates[index];
    if (seen.has(key)) continue;
    seen.add(key);
    const raw = candidateRect(entry.subjectBounds, entry.width, entry.height, key, viewport.clearance);
    if (!raw) continue;
    const bounds = clampRect(raw, viewport, viewport.edgeMargin);
    if (blocked.some((rect) => annotationRectsOverlap(bounds, rect, viewport.labelGap))) continue;
    candidates.push(Object.freeze({ key, bounds, score: candidateScore(raw, bounds, index) }));
  }
  return candidates.sort((a, b) => a.score - b.score || a.key.localeCompare(b.key));
}

function chooseCandidate(entry, candidates, state, viewport) {
  if (!candidates.length) return null;
  const remembered = state.anchors.get(entry.id);
  const prior = remembered ? candidates.find((candidate) => candidate.key === remembered.key) : null;
  if (entry.placement === 'fixed' && remembered) return prior || null;
  if (prior && prior.score <= candidates[0].score + viewport.hysteresis) return prior;
  return candidates[0];
}

/**
 * Places already-projected annotation labels. It never projects world positions
 * or computes gameplay radii; callers own those facts and pass screen bounds.
 */
export function placeAnnotationLabels(entries = [], options = {}, state = createAnnotationLabelLayoutState()) {
  const viewport = resolveAnnotationLabelViewport(options);
  const ownedState = state?.anchors instanceof Map ? state : createAnnotationLabelLayoutState();
  const ordered = entries
    .map(normalizeEntry)
    .sort((a, b) => a.order - b.order || a.index - b.index);
  const subjects = ordered.map((entry) => entry.subjectBounds);
  const occupied = collectReservedRegions(options);
  const placed = [];
  const rejected = [];

  for (const entry of ordered) {
    if (viewport.zoom < entry.minZoom) {
      rejected.push(Object.freeze({ ...entry, reason: 'below-zoom-threshold' }));
      continue;
    }
    const candidate = chooseCandidate(entry, viableCandidates(entry, viewport, [...subjects, ...occupied]), ownedState, viewport);
    if (!candidate) {
      rejected.push(Object.freeze({ ...entry, reason: ownedState.anchors.has(entry.id) && entry.placement === 'fixed'
        ? 'fixed-anchor-blocked'
        : 'no-safe-anchor' }));
      continue;
    }
    const placement = Object.freeze({
      ...entry,
      candidate: candidate.key,
      bounds: candidate.bounds,
      x: candidate.bounds.x + candidate.bounds.w / 2,
      y: candidate.bounds.y + candidate.bounds.h / 2,
    });
    ownedState.anchors.set(entry.id, Object.freeze({ key: candidate.key, placement: entry.placement }));
    occupied.push(candidate.bounds);
    placed.push(placement);
  }

  ownedState.frame = finite(ownedState.frame) + 1;
  return Object.freeze({
    viewport,
    placed: Object.freeze(placed),
    rejected: Object.freeze(rejected),
    state: ownedState,
  });
}
