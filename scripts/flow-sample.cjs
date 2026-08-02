function finiteNumber(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function clamp01(value) {
  return Math.max(0, Math.min(1, finiteNumber(value, 0)));
}

function vectorFrom(input, xKey, yKey) {
  const nested = input && typeof input === "object" ? input : {};
  return {
    x: finiteNumber(nested.x ?? nested[xKey], 0),
    y: finiteNumber(nested.y ?? nested[yKey], 0),
  };
}

function normalizeSources(input = {}) {
  return {
    wellId: input.wellId ?? null,
    anchorId: input.anchorId ?? null,
  };
}

function normalizeFlowSample(input = {}) {
  const current = input.current
    ? vectorFrom(input.current, "currentX", "currentY")
    : { x: finiteNumber(input.currentX ?? input.x, 0), y: finiteNumber(input.currentY ?? input.y, 0) };
  const gravity = input.gravity
    ? vectorFrom(input.gravity, "gravityX", "gravityY")
    : { x: finiteNumber(input.gravityX, 0), y: finiteNumber(input.gravityY, 0) };
  const sources = normalizeSources(input.sources || {
    wellId: input.sourceWellId,
    anchorId: input.sourceAnchorId,
  });

  return {
    x: current.x,
    y: current.y,
    current,
    gravity,
    hazard: clamp01(input.hazard),
    sources,
    confidence: clamp01(input.confidence ?? 1),
  };
}

function emptyFlowSample() {
  return normalizeFlowSample({ confidence: 0 });
}

module.exports = {
  normalizeFlowSample,
  emptyFlowSample,
};
