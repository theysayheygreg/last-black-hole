function finite(value, fallback = 0) {
  return Number.isFinite(Number(value)) ? Number(value) : fallback;
}

function clampRect(rect, canvasW, canvasH, margin = 8) {
  const width = Math.max(1, Math.min(canvasW - margin * 2, finite(rect.w, 1)));
  const height = Math.max(1, Math.min(canvasH - margin * 2, finite(rect.h, 1)));
  return {
    x: Math.max(margin, Math.min(canvasW - margin - width, finite(rect.x))),
    y: Math.max(margin, Math.min(canvasH - margin - height, finite(rect.y))),
    w: width,
    h: height,
  };
}

export function rectsOverlap(a, b, gap = 0) {
  return a.x < b.x + b.w + gap
    && a.x + a.w + gap > b.x
    && a.y < b.y + b.h + gap
    && a.y + a.h + gap > b.y;
}

export function getShipLocalLabelSlots({ shipX, shipY, canvasW, canvasH } = {}) {
  const x = finite(shipX);
  const y = finite(shipY);
  const width = Math.max(1, finite(canvasW, 1280));
  const height = Math.max(1, finite(canvasH, 800));
  // Clamp the entire stack once. Clamping independent lanes can fold Heat
  // over speed at a viewport edge; the group preserves their order and gap.
  const velocityHeight = 26;
  const laneGap = 8;
  const heatHeight = 30;
  const group = clampRect({
    x: x - 98,
    y: y + 16,
    w: 196,
    h: velocityHeight + laneGap + heatHeight,
  }, width, height);
  const velocityBounds = { x: group.x, y: group.y, w: group.w, h: velocityHeight };
  const heatBounds = { x: group.x, y: group.y + velocityHeight + laneGap, w: group.w, h: heatHeight };
  return Object.freeze({
    velocity: Object.freeze({
      id: 'ship-velocity',
      order: 10,
      bounds: Object.freeze(velocityBounds),
      textX: velocityBounds.x + velocityBounds.w / 2,
      textY: velocityBounds.y + 19,
    }),
    heat: Object.freeze({
      id: 'ship-heat',
      order: 20,
      bounds: Object.freeze(heatBounds),
      textX: heatBounds.x + heatBounds.w / 2,
      textY: heatBounds.y + 18,
      barX: heatBounds.x,
      barY: heatBounds.y + 23,
      barW: heatBounds.w,
    }),
  });
}

export function getRulerReadoutBounds(canvasW, canvasH, rowCount = 0) {
  const width = Math.max(1, finite(canvasW, 1280));
  const height = Math.max(1, finite(canvasH, 800));
  const panelW = Math.min(330, width - 28);
  const panelH = 27 + Math.max(0, Math.floor(finite(rowCount))) * 17;
  return Object.freeze(clampRect({
    x: width - panelW - 14,
    y: Math.min(280, height - panelH - 16),
    w: panelW,
    h: panelH,
  }, width, height, 0));
}
