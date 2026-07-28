const LABEL_OFFSETS = Object.freeze([0, 22, -22, 44, -44, 66, -66, 88, -88]);

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

export function safeObjectLabel(value, fallback) {
  const text = String(value ?? '').trim();
  if (!text || text.toLowerCase() === 'undefined' || text.toLowerCase() === 'null') {
    return fallback;
  }
  return text;
}

export function getShipLocalLabelSlots({ shipX, shipY, canvasW, canvasH } = {}) {
  const x = finite(shipX);
  const y = finite(shipY);
  const width = Math.max(1, finite(canvasW, 1280));
  const height = Math.max(1, finite(canvasH, 800));
  const velocityBounds = clampRect({ x: x - 82, y: y + 14, w: 164, h: 18 }, width, height);
  const heatBounds = clampRect({ x: x - 74, y: y + 45, w: 148, h: 23 }, width, height);
  return Object.freeze({
    velocity: Object.freeze({
      id: 'ship-velocity',
      order: 10,
      bounds: Object.freeze(velocityBounds),
      textX: x,
      textY: velocityBounds.y + 14,
    }),
    heat: Object.freeze({
      id: 'ship-heat',
      order: 20,
      bounds: Object.freeze(heatBounds),
      textX: x,
      textY: heatBounds.y + 13,
      barX: heatBounds.x,
      barY: heatBounds.y + 18,
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

export function placePresentationLabels(entries = [], {
  canvasW = 1280,
  canvasH = 800,
  obstacles = [],
  gap = 5,
  offsets = LABEL_OFFSETS,
} = {}) {
  const occupied = obstacles
    .filter(Boolean)
    .map((rect) => ({ ...rect }));
  const ordered = entries
    .map((entry, index) => ({ ...entry, order: finite(entry.order, index), index }))
    .sort((a, b) => a.order - b.order || a.index - b.index);
  const placed = [];
  const rejected = [];

  for (const entry of ordered) {
    const width = Math.max(1, finite(entry.width, 120));
    const height = Math.max(1, finite(entry.height, 18));
    const anchorX = finite(entry.anchorX);
    const anchorY = finite(entry.anchorY);
    const candidates = Array.isArray(entry.offsets) ? entry.offsets : offsets;
    let placement = null;
    for (const offset of candidates) {
      const bounds = clampRect({
        x: anchorX - width / 2,
        y: anchorY + finite(offset) - height / 2,
        w: width,
        h: height,
      }, canvasW, canvasH);
      if (occupied.some((obstacle) => rectsOverlap(bounds, obstacle, gap))) continue;
      placement = {
        ...entry,
        slot: `${entry.id || 'label'}:${placed.length}`,
        bounds: Object.freeze(bounds),
        x: bounds.x + bounds.w / 2,
        y: bounds.y + bounds.h / 2,
      };
      break;
    }
    if (!placement) {
      rejected.push({ ...entry, bounds: null });
      continue;
    }
    occupied.push(placement.bounds);
    placed.push(Object.freeze(placement));
  }

  return Object.freeze({
    placed: Object.freeze(placed),
    rejected: Object.freeze(rejected),
    occupied: Object.freeze(occupied),
  });
}
