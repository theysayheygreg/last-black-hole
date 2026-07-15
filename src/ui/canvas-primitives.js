import {
  UI_COLORS,
  UI_DECK,
  UI_DECK_GEOMETRY,
  UI_SPACING,
  UI_TYPOGRAPHY,
} from './design-tokens.js';
import { canvasFont } from './typography.js';
import { applyCanvasTextShadow, drawGeneratedFrame } from './asset-kit.js';

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
  padding = UI_DECK_GEOMETRY.panel.paddingX,
  cornerLength = 38,
} = {}) {
  const r = normalizeRect(rect);
  ctx.save();
  ctx.shadowColor = 'rgba(0, 0, 8, 0.72)';
  ctx.shadowBlur = 12;
  ctx.shadowOffsetX = 4;
  ctx.shadowOffsetY = 6;
  ctx.fillStyle = UI_COLORS.panelBacking;
  ctx.fillRect(r.x + 3, r.y + 4, r.w, r.h);
  ctx.shadowColor = 'transparent';
  ctx.shadowBlur = 0;
  ctx.shadowOffsetX = 0;
  ctx.shadowOffsetY = 0;
  ctx.fillStyle = withAlpha(UI_COLORS.panelBackground, fillAlpha);
  ctx.fillRect(r.x, r.y, r.w, r.h);
  ctx.strokeStyle = roleColor(role, borderAlpha);
  ctx.lineWidth = 1;
  ctx.strokeRect(r.x, r.y, r.w, r.h);
  if (!drawGeneratedFrame(ctx, r, { alpha: Math.min(0.8, borderAlpha + 0.24), segmentSize: cornerLength })) {
    drawCornerFrame(ctx, r, { role, alpha: Math.min(0.95, borderAlpha + 0.2), length: cornerLength });
  }

  if (title) {
    ctx.font = canvasFont(UI_TYPOGRAPHY.couchMicro, { weight: '700' });
    ctx.textAlign = 'left';
    applyCanvasTextShadow(ctx);
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
  const source = normalizeRect(rect);
  const r = { ...source, h: Math.max(source.h, UI_DECK_GEOMETRY.listRow.minHeight) };
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

function drawGlyphFrame(ctx, x, y, w, h, radius = 0) {
  if (radius > 0 && typeof ctx.arcTo === 'function') {
    ctx.beginPath();
    ctx.moveTo(x + radius, y);
    ctx.arcTo(x + w, y, x + w, y + h, radius);
    ctx.arcTo(x + w, y + h, x, y + h, radius);
    ctx.arcTo(x, y + h, x, y, radius);
    ctx.arcTo(x, y, x + w, y, radius);
    ctx.closePath();
    return;
  }
  ctx.rect(x, y, w, h);
}

/** Draw the active input family glyph without embedding device logic in callers. */
export function drawActionGlyph(ctx, descriptor, rect, { alpha = 1, color = null } = {}) {
  const source = normalizeRect(rect);
  const minGlyphSize = Math.max(UI_DECK_GEOMETRY.actionGlyph.minWidth, UI_DECK_GEOMETRY.actionGlyph.minHeight);
  const size = Math.max(minGlyphSize, Math.min(source.w, source.h));
  const x = source.x + (source.w - size) / 2;
  const y = source.y + (source.h - size) / 2;
  const kind = descriptor?.glyphKind || 'keycap';
  const label = String(descriptor?.fallbackLabel || '').toUpperCase();
  const glyphColor = color ? withAlpha(color, alpha) : roleColor('text', alpha);

  ctx.save();
  ctx.strokeStyle = glyphColor;
  ctx.fillStyle = glyphColor;
  ctx.lineWidth = 1.5;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = canvasFont(Math.max(10, Math.min(13, size * 0.38)), { weight: '700' });

  if (kind === 'face') {
    ctx.beginPath();
    ctx.arc(x + size / 2, y + size / 2, size * 0.42, 0, Math.PI * 2);
    ctx.stroke();
    ctx.fillText(label.slice(0, 1), x + size / 2, y + size / 2 + 0.5);
  } else if (kind === 'dpad') {
    const arm = size * 0.28;
    const center = size / 2 - arm / 2;
    ctx.fillRect(x + center, y + 2, arm, size - 4);
    ctx.fillRect(x + 2, y + center, size - 4, arm);
    const direction = label.match(/\b(L|R|U|D)\b$/)?.[1];
    if (direction) {
      ctx.fillStyle = roleColor('void', alpha);
      ctx.font = canvasFont(Math.max(8, Math.min(11, size * 0.28)), { weight: '700' });
      ctx.fillText(direction, x + size / 2, y + size / 2);
    }
  } else if (kind === 'shoulder' || kind === 'trigger' || kind === 'system') {
    ctx.beginPath();
    drawGlyphFrame(ctx, x + 1, y + size * 0.2, size - 2, size * 0.6, 3);
    ctx.stroke();
    ctx.fillText(label, x + size / 2, y + size / 2 + 0.5);
  } else {
    ctx.beginPath();
    drawGlyphFrame(ctx, x + 1, y + 2, size - 2, size - 4, 3);
    ctx.stroke();
    ctx.fillText(label, x + size / 2, y + size / 2 + 0.5);
  }
  ctx.restore();
  return { x, y, w: size, h: size };
}

export function drawActionPrompt(ctx, rect, descriptor, { verb = '', actionLabel = '', alpha = 1, color = null } = {}) {
  const source = normalizeRect(rect);
  const minGlyphSize = Math.max(UI_DECK_GEOMETRY.actionGlyph.minWidth, UI_DECK_GEOMETRY.actionGlyph.minHeight);
  const glyphSize = Math.max(minGlyphSize, Math.min(32, source.h));
  const glyphRect = { x: source.x, y: source.y, w: glyphSize, h: source.h };
  const copy = String(verb || '').trim();
  const sameAction = copy && (
    copy.toLowerCase() === String(descriptor?.actionId || '').toLowerCase()
    || copy.toLowerCase() === String(descriptor?.fallbackLabel || '').toLowerCase()
    || copy.toLowerCase() === String(actionLabel || '').trim().toLowerCase()
  );
  drawActionGlyph(ctx, descriptor, glyphRect, { alpha, color });
  if (copy && !sameAction) {
    ctx.save();
    ctx.font = canvasFont(UI_TYPOGRAPHY.couchSmall, { weight: '700' });
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = color ? withAlpha(color, alpha) : roleColor('muted', alpha);
    ctx.fillText(copy.toUpperCase(), source.x + glyphSize + UI_DECK_GEOMETRY.actionGlyph.gap, source.y + source.h / 2);
    ctx.restore();
  }
  return { glyph: { x: glyphRect.x, y: glyphRect.y, w: glyphSize, h: glyphSize }, copy: !sameAction && Boolean(copy) };
}

export function drawActionFooter(ctx, x, y, actions, {
  alpha = 1,
  color = null,
  gap = UI_DECK_GEOMETRY.panel.gap,
  maxWidth = Infinity,
  lineHeight = UI_DECK_GEOMETRY.actionGlyph.minHeight + UI_DECK_GEOMETRY.panel.gap,
} = {}) {
  let cursor = Number(x) || 0;
  const startX = cursor;
  let top = Number(y) || 0;
  for (const entry of Array.isArray(actions) ? actions : []) {
    const descriptor = entry?.descriptor || entry;
    const verb = entry?.verb || '';
    const estimatedWidth = Math.max(UI_DECK_GEOMETRY.actionGlyph.minWidth, resultWidth(verb, descriptor)) + gap;
    if (cursor > startX && cursor + estimatedWidth > startX + maxWidth) {
      cursor = startX;
      top += lineHeight;
    }
    const result = drawActionPrompt(ctx, { x: cursor, y: top, w: Math.max(estimatedWidth, UI_DECK_GEOMETRY.actionGlyph.minWidth), h: UI_DECK_GEOMETRY.actionGlyph.minHeight }, descriptor, { verb, alpha, color });
    cursor += estimatedWidth;
  }
}

function resultWidth(verb, descriptor) {
  const copy = String(verb || '').trim().toLowerCase();
  const duplicate = copy === String(descriptor?.actionId || '').toLowerCase()
    || copy === String(descriptor?.fallbackLabel || '').trim().toLowerCase();
  return UI_DECK_GEOMETRY.actionGlyph.minWidth + (copy && !duplicate ? UI_DECK_GEOMETRY.actionGlyph.gap + copy.length * 8 : 0);
}

export function drawCommandButton(ctx, rect, label, {
  action = null,
  prompt = '',
  role = 'flow',
  active = true,
  disabled = false,
  alpha = 1,
  textColor,
} = {}) {
  const source = normalizeRect(rect);
  const r = {
    ...source,
    w: Math.max(source.w, UI_DECK_GEOMETRY.button.minWidth),
    h: Math.max(source.h, UI_DECK_GEOMETRY.button.minHeight),
  };
  const a = clamp01(disabled ? alpha * 0.42 : alpha);
  const buttonRole = disabled ? 'muted' : role;
  const labelText = String(label ?? '').trim();
  const promptText = String(prompt || '').trim();

  ctx.save();
  applyCanvasTextShadow(ctx);
  drawSelectedRow(ctx, r, {
    role: buttonRole,
    active,
    alpha: a,
    fillAlpha: active ? 0.18 : 0.06,
    borderAlpha: active ? 0.68 : 0.25,
    railWidth: 4,
  });
  applyCanvasTextShadow(ctx);

  ctx.font = canvasFont(Math.max(UI_TYPOGRAPHY.couchButton, Math.min(24, r.h * 0.48)), { weight: '700' });
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = textColor ? withAlpha(textColor, a) : roleColor(disabled ? 'muted' : 'text', a);
  ctx.fillText(fitUiText(ctx, labelText.toUpperCase(), r.w - UI_DECK_GEOMETRY.button.paddingX * 2), r.x + r.w / 2, r.y + r.h / 2);

  // The action face owns the verb. The supporting affordance is a drawn glyph
  // and only adds copy when it is not the same verb again.
  if (action) {
    drawActionPrompt(ctx, {
      x: r.x + UI_DECK_GEOMETRY.button.paddingX,
      y: r.y + r.h + UI_DECK_GEOMETRY.button.gap,
      w: r.w - UI_DECK_GEOMETRY.button.paddingX * 2,
      h: UI_DECK_GEOMETRY.actionGlyph.minHeight,
    }, action, { verb: promptText, actionLabel: labelText, alpha: 0.78 * a, color: roleColor(buttonRole) });
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
    applyCanvasTextShadow(ctx);
    applyCanvasTextShadow(ctx);
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
  applyCanvasTextShadow(ctx);
  applyCanvasTextShadow(ctx);
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
  minWidth = UI_DECK_GEOMETRY.valueBlock.minWidth,
} = {}) {
  const source = String(label ?? '');
  const r = normalizeRect(rect);
  ctx.save();
  applyCanvasTextShadow(ctx);
  ctx.font = canvasFont(UI_TYPOGRAPHY.couchMicro, { weight: '700' });
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const width = Math.max(minWidth, r.w || ctx.measureText(source).width + 18);
  const height = Math.max(r.h || 20, UI_DECK_GEOMETRY.valueBlock.minHeight);
  const x = r.x - width / 2;
  const y = r.y - height / 2;
  ctx.fillStyle = roleColor(role, 0.14 * alpha);
  ctx.fillRect(x, y, width, height);
  ctx.strokeStyle = roleColor(role, 0.34 * alpha);
  ctx.strokeRect(x, y, width, height);
  ctx.fillStyle = roleColor('text', 0.88 * alpha);
  applyCanvasTextShadow(ctx);
  ctx.fillText(fitUiText(ctx, source.toUpperCase(), width - 12), r.x, r.y + 1);
  ctx.restore();
}

export function drawSectionLabel(ctx, text, x, y, {
  role = 'flow',
  alpha = 1,
} = {}) {
  ctx.save();
  applyCanvasTextShadow(ctx);
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = roleColor(role, 0.74 * alpha);
  applyCanvasTextShadow(ctx);
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
  applyCanvasTextShadow(ctx);
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
  ctx.font = canvasFont(UI_TYPOGRAPHY.couchSmall);
  applyCanvasTextShadow(ctx);
  ctx.fillStyle = roleColor('muted', 0.75 * a);
  ctx.fillText(String(label), x, y);
  ctx.fillStyle = roleColor(valueRole, 0.9 * a);
  ctx.fillText(String(value), x + labelWidth, y);
  ctx.restore();
}
