// Renderer-neutral analytic annotation plans. These plans are deliberately
// local to an already-projected anchor: callers supply canonical screen/world
// placement, while this module owns only category-independent pixel geometry.

export const ANNOTATION_VIEWPORT_CLASSES = Object.freeze(['desktop', 'deck']);

export const ANNOTATION_PIXEL_WEIGHT = Object.freeze({
  desktop: Object.freeze({ strokePx: 2, emphasisPx: 3, minimumPx: 2 }),
  deck: Object.freeze({ strokePx: 3, emphasisPx: 4, minimumPx: 3 }),
});

const TURN = Math.PI * 2;

function fail(message) {
  throw new Error(`Invalid analytic annotation plan: ${message}`);
}

function finitePositive(value, label) {
  const number = Number(value);
  if (!Number.isFinite(number) || number <= 0) fail(`${label} must be a positive finite number`);
  return number;
}

function finiteNonNegative(value, label) {
  const number = Number(value);
  if (!Number.isFinite(number) || number < 0) fail(`${label} must be a non-negative finite number`);
  return number;
}

function unit(value, label) {
  const number = Number(value);
  if (!Number.isFinite(number) || number < 0 || number > 1) fail(`${label} must be within 0..1`);
  return number;
}

function integerAtLeast(value, minimum, label) {
  const number = Number(value);
  if (!Number.isInteger(number) || number < minimum) fail(`${label} must be an integer >= ${minimum}`);
  return number;
}

function normaliseTurns(value, label) {
  const number = Number(value);
  if (!Number.isFinite(number)) fail(`${label} must be finite`);
  return number;
}

function immutable(value) {
  if (Array.isArray(value)) value.forEach(immutable);
  else if (value && typeof value === 'object') Object.values(value).forEach(immutable);
  return Object.freeze(value);
}

export function resolveAnnotationWeight({ viewportClass = 'desktop', emphasis = false } = {}) {
  if (!ANNOTATION_VIEWPORT_CLASSES.includes(viewportClass)) {
    fail(`viewportClass must be one of ${ANNOTATION_VIEWPORT_CLASSES.join(', ')}`);
  }
  const policy = ANNOTATION_PIXEL_WEIGHT[viewportClass];
  return immutable({
    viewportClass,
    strokePx: emphasis ? policy.emphasisPx : policy.strokePx,
    minimumPx: policy.minimumPx,
    zoomInvariant: true,
  });
}

function localExtent(options = {}) {
  return finitePositive(options.extentPx, 'extentPx');
}

function planBase(kind, options = {}) {
  return {
    kind,
    localSpace: 'anchor-pixels',
    weight: resolveAnnotationWeight(options),
  };
}

export function makeArcPlan({ extentPx, startTurn = 0, endTurn = 1, ...options } = {}) {
  const plan = {
    ...planBase('arc', options),
    extentPx: localExtent({ extentPx }),
    startTurn: normaliseTurns(startTurn, 'startTurn'),
    endTurn: normaliseTurns(endTurn, 'endTurn'),
  };
  if (plan.endTurn <= plan.startTurn) fail('endTurn must be greater than startTurn');
  return immutable(plan);
}

export function makeRingPlan(options = {}) {
  return immutable({ ...makeArcPlan({ ...options, startTurn: 0, endTurn: 1 }), kind: 'ring' });
}

export function makeDashedRingPlan({ extentPx, dashCount = 10, gapFraction = 0.38, ...options } = {}) {
  const count = integerAtLeast(dashCount, 2, 'dashCount');
  const gap = unit(gapFraction, 'gapFraction');
  if (gap >= 1) fail('gapFraction must be less than 1');
  const span = 1 / count;
  const dash = span * (1 - gap);
  return immutable({
    ...planBase('dashed-ring', options),
    extentPx: localExtent({ extentPx }),
    dashCount: count,
    gapFraction: gap,
    segments: Array.from({ length: count }, (_, index) => immutable({
      startTurn: index * span,
      endTurn: index * span + dash,
    })),
  });
}

export function makeSegmentedRingPlan({ extentPx, segmentCount, gapFraction = 0.18, ...options } = {}) {
  const count = integerAtLeast(segmentCount, 2, 'segmentCount');
  const gap = unit(gapFraction, 'gapFraction');
  if (gap >= 1) fail('gapFraction must be less than 1');
  const span = 1 / count;
  const segment = span * (1 - gap);
  return immutable({
    ...planBase('segmented-ring', options),
    extentPx: localExtent({ extentPx }),
    segmentCount: count,
    gapFraction: gap,
    segments: Array.from({ length: count }, (_, index) => immutable({
      index,
      startTurn: index * span,
      endTurn: index * span + segment,
    })),
  });
}

export function makeTaperedPointerPlan({ lengthPx, baseWidthPx, tipWidthPx = 0, ...options } = {}) {
  const baseWidth = finitePositive(baseWidthPx, 'baseWidthPx');
  const tipWidth = finiteNonNegative(tipWidthPx, 'tipWidthPx');
  if (tipWidth > baseWidth) fail('tipWidthPx must not exceed baseWidthPx');
  return immutable({
    ...planBase('tapered-pointer', options),
    lengthPx: finitePositive(lengthPx, 'lengthPx'),
    baseWidthPx: baseWidth,
    tipWidthPx: tipWidth,
    forwardAxis: 'positive-y',
  });
}

export function makeLinePlan({ lengthPx, ...options } = {}) {
  return immutable({
    ...planBase('line', options),
    lengthPx: finitePositive(lengthPx, 'lengthPx'),
    axis: 'local-x',
  });
}

export function makeCornerBracketPlan({ extentPx, cornerFraction = 0.28, ...options } = {}) {
  const fraction = unit(cornerFraction, 'cornerFraction');
  if (fraction === 0) fail('cornerFraction must be greater than zero');
  return immutable({
    ...planBase('corner-bracket', options),
    extentPx: localExtent({ extentPx }),
    cornerFraction: fraction,
    corners: immutable(['north-west', 'north-east', 'south-east', 'south-west']),
  });
}

export function makeOutlinePlan({ points, closed = true, ...options } = {}) {
  if (!Array.isArray(points) || points.length < (closed ? 3 : 2)) {
    fail(`points must contain at least ${closed ? 3 : 2} local points`);
  }
  const localPoints = points.map((point, index) => {
    if (!point || !Number.isFinite(Number(point.u)) || !Number.isFinite(Number(point.v))) {
      fail(`points[${index}] must provide finite local u and v`);
    }
    return immutable({ u: Number(point.u), v: Number(point.v) });
  });
  return immutable({ ...planBase('outline', options), closed: Boolean(closed), points: localPoints });
}

export function makeProgressSectorPlan({ extentPx, progress, startTurn = 0, ...options } = {}) {
  const amount = unit(progress, 'progress');
  const start = normaliseTurns(startTurn, 'startTurn');
  return immutable({
    ...planBase('progress-sector', options),
    extentPx: localExtent({ extentPx }),
    progress: amount,
    startTurn: start,
    endTurn: start + amount,
  });
}

export function makeRepeatedNotchPlan({ extentPx, notchCount, inward = false, ...options } = {}) {
  const count = integerAtLeast(notchCount, 1, 'notchCount');
  return immutable({
    ...planBase('repeated-notches', options),
    extentPx: localExtent({ extentPx }),
    notchCount: count,
    inward: Boolean(inward),
    turns: Array.from({ length: count }, (_, index) => index / count),
  });
}

export const ANALYTIC_ANNOTATION_TURN = TURN;
