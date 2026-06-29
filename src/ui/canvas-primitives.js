import {
  UI_COLORS,
  UI_DECK,
  UI_SPACING,
  UI_TYPOGRAPHY,
} from './design-tokens.js';
import { canvasFont } from './typography.js';

const ROLE_COLORS = {
  flow: UI_COLORS.signal,
  player: UI_COLORS.signal,
  tech: UI_COLORS.signal,
  selection: UI_COLORS.selectionBorder,
  danger: UI_COLORS.danger,
  death: UI_COLORS.danger,
  salvage: UI_COLORS.salvage,
  value: UI_COLORS.salvage,
  amber: UI_COLORS.salvage,
  anomaly: UI_COLORS.anomaly,
  inhibitor: UI_COLORS.inhibitor,
  ecology: UI_COLORS.ecology,
  extract: UI_COLORS.ecology,
  text: UI_COLORS.panelText,
  muted: UI_COLORS.mutedText,
  panel: UI_COLORS.panelBackground,
  border: UI_COLORS.panelBorder,
  void: UI_COLORS.void,
  bone: '#fff4da',
};

export function clamp01(value) {
  return Math.max(0, Math.min(1, Number(value) || 0));
}

function expandShortHex(hex) {
  return `#${hex.slice(1).split('').map((ch) => `${ch}${ch}`).join('')}`;
}

export function withAlpha(color, alpha = 1) {
  const safeAlpha = clamp01(alpha);
  const raw = String(color || '').trim();
  const rgbaMatch = raw.match(/^rgba\(([^)]+)\)$/i);
  if (rgbaMatch) {
    const parts = rgbaMatch[1].split(',').map((part) => part.trim());
    return `rgba(${parts[0]}, ${parts[1]}, ${parts[2]}, ${safeAlpha.toFixed(3)})`;
  }
  const rgbMatch = raw.match(/^rgb\(([^)]+)\)$/i);
  if (rgbMatch) {
    const parts = rgbMatch[1].split(',').map((part) => part.trim());
    return `rgba(${parts[0]}, ${parts[1]}, ${parts[2]}, ${safeAlpha.toFixed(3)})`;
  }
  const hex = raw.length === 4 && raw.startsWith('#') ? expandShortHex(raw) : raw;
  if (/^#[0-9a-f]{6}$/i.test(hex)) {
    const value = Number.parseInt(hex.slice(1), 16);
    const r = (value >> 16) & 255;
    const g = (value >> 8) & 255;
    const b = value & 255;
    return `rgba(${r}, ${g}, ${b}, ${safeAlpha.toFixed(3)})`;
  }
  return raw;
}

export function roleColor(role = 'flow', alpha = 1) {
  const color = ROLE_COLORS[role] || ROLE_COLORS.flow;
  return withAlpha(color, alpha);
}

export function normalizeRect(rect, fallback = {}) {
  const source = typeof rect === 'object' && rect ? rect : fallback;
  return {
    x: Number(source.x) || 0,
    y: Number(source.y) || 0,
    w: Number(source.w ?? source.width) || 0,
    h: Number(source.h ?? source.height) || 0,
  };
}

export function drawScanlines(ctx, w, h, alpha = 0.035, spacing = 4) {
  ctx.save();
  ctx.fillStyle = roleColor('bone', alpha);
  for (let y = 0; y < h; y += spacing) ctx.fillRect(0, y, w, 1);
  ctx.restore();
}

export function drawCornerFrame(ctx, rect, {
  role = 'flow',
  alpha = 0.36,
  length = 36,
  lineWidth = 1,
  inset = 0,
} = {}) {
  const { x, y, w, h } = normalizeRect(rect);
  const l = Math.max(4, Math.min(length, w / 3, h / 3));
  const x0 = x + inset;
  const y0 = y + inset;
  const x1 = x + w - inset;
  const y1 = y + h - inset;

  ctx.save();
  ctx.strokeStyle = roleColor(role, alpha);
  ctx.lineWidth = lineWidth;
  ctx.beginPath();
  ctx.moveTo(x0, y0 + l); ctx.lineTo(x0, y0); ctx.lineTo(x0 + l, y0);
  ctx.moveTo(x1 - l, y0); ctx.lineTo(x1, y0); ctx.lineTo(x1, y0 + l);
  ctx.moveTo(x0, y1 - l); ctx.lineTo(x0, y1); ctx.lineTo(x0 + l, y1);
  ctx.moveTo(x1 - l, y1); ctx.lineTo(x1, y1); ctx.lineTo(x1, y1 - l);
  ctx.stroke();
  ctx.restore();
}

export function drawUiPanel(ctx, rect, {
  role = 'flow',
  title = '',
  fillAlpha = 0.72,
  borderAlpha = 0.34,
  titleAlpha = 0.82,
  padding = UI_SPACING.panelPaddingX,
  cornerLength = 38,
} = {}) {
  const r = normalizeRect(rect);
  ctx.save();
  ctx.fillStyle = withAlpha(UI_COLORS.panelBackground, fillAlpha);
  ctx.fillRect(r.x, r.y, r.w, r.h);
  ctx.strokeStyle = roleColor(role, borderAlpha);
  ctx.lineWidth = 1;
  ctx.strokeRect(r.x, r.y, r.w, r.h);
  drawCornerFrame(ctx, r, { role, alpha: Math.min(0.95, borderAlpha + 0.2), length: cornerLength });

  if (title) {
    ctx.font = canvasFont(UI_TYPOGRAPHY.couchMicro, { weight: '700' });
    ctx.textAlign = 'left';
    ctx.fillStyle = roleColor(role, titleAlpha);
    ctx.fillText(String(title).toUpperCase(), r.x + padding, r.y + 19);
  }
  ctx.restore();
}

export function drawSelectedRow(ctx, rect, {
  role = 'flow',
  active = true,
  alpha = 1,
  fillAlpha = 0.14,
  borderAlpha = 0.54,
  railWidth = 3,
} = {}) {
  const r = normalizeRect(rect);
  const a = clamp01(alpha);
  ctx.save();
  if (active) {
    ctx.fillStyle = roleColor(role, fillAlpha * a);
    ctx.fillRect(r.x, r.y, r.w, r.h);
    ctx.strokeStyle = roleColor(role, borderAlpha * a);
    ctx.lineWidth = 1;
    ctx.strokeRect(r.x, r.y, r.w, r.h);
    ctx.fillStyle = roleColor(role, 0.9 * a);
    ctx.fillRect(r.x, r.y, railWidth, r.h);
  } else {
    ctx.fillStyle = withAlpha(UI_COLORS.terminalRowBackground, 0.45 * a);
    ctx.fillRect(r.x, r.y, r.w, r.h);
  }
  ctx.restore();
}

export function fitUiText(ctx, text, maxWidth, {
  suffix = '...',
} = {}) {
  const source = String(text ?? '');
  if (!Number.isFinite(maxWidth) || maxWidth <= 0) return '';
  if (ctx.measureText(source).width <= maxWidth) return source;
  if (ctx.measureText(suffix).width > maxWidth) return '';

  let lo = 0;
  let hi = source.length;
  let best = suffix;
  while (lo <= hi) {
    const mid = Math.floor((lo + hi) / 2);
    const candidate = `${source.slice(0, mid)}${suffix}`;
    if (ctx.measureText(candidate).width <= maxWidth) {
      best = candidate;
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }
  return best;
}

export function drawCommandButton(ctx, rect, label, {
  hotkey = '',
  prompt = '',
  role = 'flow',
  active = true,
  disabled = false,
  alpha = 1,
  textColor,
} = {}) {
  const r = normalizeRect(rect);
  const a = clamp01(disabled ? alpha * 0.42 : alpha);
  const buttonRole = disabled ? 'muted' : role;
  const labelText = String(label ?? '').trim();
  const hotkeyText = String(hotkey ?? '').trim();
  const promptText = String(prompt || labelText || 'confirm').trim();

  ctx.save();
  drawSelectedRow(ctx, r, {
    role: buttonRole,
    active,
    alpha: a,
    fillAlpha: active ? 0.18 : 0.06,
    borderAlpha: active ? 0.68 : 0.25,
    railWidth: 4,
  });

  ctx.font = canvasFont(Math.max(UI_TYPOGRAPHY.couchButton, Math.min(24, r.h * 0.48)), { weight: '700' });
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = textColor ? withAlpha(textColor, a) : roleColor(disabled ? 'muted' : 'text', a);
  ctx.fillText(fitUiText(ctx, labelText.toUpperCase(), r.w - 18), r.x + r.w / 2, r.y + r.h / 2);

  // Keep the command label clean; controller/keyboard affordances live as
  // supporting prompt text so the action remains readable across input modes.
  if (hotkeyText) {
    ctx.font = canvasFont(Math.max(10, Math.min(UI_TYPOGRAPHY.couchSmall, r.h * 0.32)), { weight: '700' });
    ctx.textBaseline = 'top';
    ctx.fillStyle = roleColor(buttonRole, 0.78 * a);
    const subcopy = `${hotkeyText.toUpperCase()} ${promptText.toUpperCase()}`;
    ctx.fillText(fitUiText(ctx, subcopy, r.w - 18), r.x + r.w / 2, r.y + r.h + 8);
  }
  ctx.restore();
}

export function drawSegmentedGauge(ctx, rect, {
  value = 0,
  max = 1,
  segments = 10,
  role = 'flow',
  dangerAt = null,
  label = '',
  alpha = 1,
} = {}) {
  const r = normalizeRect(rect);
  const a = clamp01(alpha);
  const count = Math.max(1, Math.round(segments));
  const ratio = max > 0 ? clamp01(Number(value) / Number(max)) : 0;
  const filled = Math.round(ratio * count);
  const gaugeRole = dangerAt != null && ratio <= dangerAt ? 'danger' : role;
  const gap = 2;
  const cellW = Math.max(1, (r.w - gap * (count - 1)) / count);
  const cellH = Math.max(r.h, UI_DECK.minGaugeHeight);

  ctx.save();
  if (label) {
    ctx.font = canvasFont(UI_TYPOGRAPHY.couchMicro, { weight: '700' });
    ctx.textAlign = 'left';
    ctx.textBaseline = 'bottom';
    ctx.fillStyle = roleColor('muted', 0.72 * a);
    ctx.fillText(String(label).toUpperCase(), r.x, r.y - 3);
  }

  for (let i = 0; i < count; i++) {
    const x = r.x + i * (cellW + gap);
    ctx.fillStyle = i < filled
      ? roleColor(gaugeRole, 0.88 * a)
      : withAlpha(UI_COLORS.terminalRowBackground, 0.72 * a);
    ctx.fillRect(x, r.y, cellW, cellH);
  }
  ctx.restore();
}

export function drawWarningStrip(ctx, rect, {
  title = 'warning',
  body = '',
  role = 'danger',
  alpha = 1,
} = {}) {
  const r = normalizeRect(rect);
  const a = clamp01(alpha);

  ctx.save();
  drawUiPanel(ctx, r, { role, fillAlpha: 0.76 * a, borderAlpha: 0.62 * a, cornerLength: 20 });
  ctx.font = canvasFont(UI_TYPOGRAPHY.couchMicro, { weight: '700' });
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  ctx.fillStyle = roleColor(role, 0.94 * a);
  ctx.fillText(String(title).toUpperCase(), r.x + 12, r.y + 8);
  if (body) {
    ctx.font = canvasFont(UI_TYPOGRAPHY.couchSmall);
    ctx.fillStyle = roleColor('text', 0.84 * a);
    ctx.fillText(fitUiText(ctx, body, r.w - 24), r.x + 12, r.y + 27);
  }
  ctx.restore();
}

export function drawStatusPill(ctx, rect, label, {
  role = 'flow',
  alpha = 1,
  minWidth = 68,
} = {}) {
  const source = String(label ?? '');
  const r = normalizeRect(rect);
  ctx.save();
  ctx.font = canvasFont(UI_TYPOGRAPHY.couchMicro, { weight: '700' });
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const width = Math.max(minWidth, r.w || ctx.measureText(source).width + 18);
  const height = Math.max(r.h || 20, 24);
  const x = r.x - width / 2;
  const y = r.y - height / 2;
  ctx.fillStyle = roleColor(role, 0.14 * alpha);
  ctx.fillRect(x, y, width, height);
  ctx.strokeStyle = roleColor(role, 0.34 * alpha);
  ctx.strokeRect(x, y, width, height);
  ctx.fillStyle = roleColor('text', 0.88 * alpha);
  ctx.fillText(fitUiText(ctx, source.toUpperCase(), width - 12), r.x, r.y + 1);
  ctx.restore();
}

export function drawSectionLabel(ctx, text, x, y, {
  role = 'flow',
  alpha = 1,
} = {}) {
  ctx.save();
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = roleColor(role, 0.74 * alpha);
  ctx.font = canvasFont(UI_TYPOGRAPHY.couchMicro, { weight: '700' });
  ctx.fillText(`-- ${String(text).toUpperCase()} --`, x, y);
  ctx.restore();
}

export function drawKeyValueRow(ctx, label, value, x, y, {
  labelWidth = 122,
  alpha = 1,
  valueRole = 'text',
} = {}) {
  const a = clamp01(alpha);
  ctx.save();
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
  ctx.font = canvasFont(UI_TYPOGRAPHY.couchSmall);
  ctx.fillStyle = roleColor('muted', 0.75 * a);
  ctx.fillText(String(label), x, y);
  ctx.fillStyle = roleColor(valueRole, 0.9 * a);
  ctx.fillText(String(value), x + labelWidth, y);
  ctx.restore();
}
