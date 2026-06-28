import {
  clamp01,
  drawCommandButton,
  drawUiPanel,
  normalizeRect,
  roleColor,
  withAlpha,
} from './canvas-primitives.js';

export function easeOutCubic(value) {
  const t = clamp01(value);
  return 1 - Math.pow(1 - t, 3);
}

export function easeInOutCubic(value) {
  const t = clamp01(value);
  return t < 0.5
    ? 4 * t * t * t
    : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

export function prefersReducedMotion(source = globalThis) {
  try {
    return source?.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches === true;
  } catch {
    return false;
  }
}

export function resolveMotionSettings(config = {}, source = globalThis) {
  const enabled = config?.enabled !== false;
  const reducedMotion = !enabled || config?.reduced === true || prefersReducedMotion(source);
  const intensity = reducedMotion ? 0 : clamp01(Number.isFinite(config?.intensity) ? config.intensity : 1);
  return {
    enabled,
    reducedMotion,
    intensity,
    panelDuration: Number.isFinite(config?.panelDuration) ? Math.max(0.01, config.panelDuration) : 0.42,
    textDuration: Number.isFinite(config?.textDuration) ? Math.max(0.01, config.textDuration) : 0.7,
    rowStagger: Number.isFinite(config?.rowStagger) ? Math.max(0, config.rowStagger) : 0.055,
    commandPulse: Number.isFinite(config?.commandPulse) ? Math.max(0.01, config.commandPulse) : 0.8,
  };
}

export function motionProgress(time, {
  delay = 0,
  duration = 1,
  reducedMotion = false,
  ease = easeOutCubic,
} = {}) {
  if (reducedMotion) return 1;
  const t = (Math.max(0, time) - delay) / Math.max(0.001, duration);
  return ease(clamp01(t));
}

export function staggerProgress(time, index, {
  delay = 0,
  stagger = 0.055,
  duration = 0.32,
  reducedMotion = false,
  ease = easeOutCubic,
} = {}) {
  return motionProgress(time, {
    delay: delay + Math.max(0, index) * stagger,
    duration,
    reducedMotion,
    ease,
  });
}

export function typeOnText(text, {
  time = 0,
  delay = 0,
  duration = 1,
  reducedMotion = false,
  minChars = 0,
  ease = easeOutCubic,
} = {}) {
  const value = String(text ?? '');
  if (reducedMotion || value.length === 0) return value;
  const progress = motionProgress(time, { delay, duration, reducedMotion, ease });
  const count = Math.max(0, Math.min(value.length, Math.ceil(value.length * progress), Math.floor(value.length)));
  return value.slice(0, Math.max(Math.min(value.length, minChars), count));
}

function revealRectForOrigin(rect, progress, origin = 'left') {
  const r = normalizeRect(rect);
  const p = clamp01(progress);
  if (p >= 0.999) return r;
  if (origin === 'right') return { x: r.x + r.w * (1 - p), y: r.y, w: r.w * p, h: r.h };
  if (origin === 'top') return { x: r.x, y: r.y, w: r.w, h: r.h * p };
  if (origin === 'bottom') return { x: r.x, y: r.y + r.h * (1 - p), w: r.w, h: r.h * p };
  if (origin === 'center') {
    const w = r.w * p;
    const h = r.h * p;
    return { x: r.x + (r.w - w) / 2, y: r.y + (r.h - h) / 2, w, h };
  }
  return { x: r.x, y: r.y, w: r.w * p, h: r.h };
}

export function withRevealClip(ctx, rect, progress, origin, draw) {
  const p = clamp01(progress);
  if (p <= 0.001) return;
  const reveal = revealRectForOrigin(rect, p, origin);
  ctx.save();
  if (p < 0.999 && typeof ctx.rect === 'function' && typeof ctx.clip === 'function') {
    ctx.beginPath();
    ctx.rect(reveal.x, reveal.y, reveal.w, reveal.h);
    ctx.clip();
  }
  draw(reveal, p);
  ctx.restore();
}

export function drawMotionPanel(ctx, rect, {
  progress = 1,
  origin = 'left',
  role = 'flow',
  fillAlpha = 0.46,
  borderAlpha = 0.34,
  cornerLength = 18,
} = {}) {
  withRevealClip(ctx, rect, progress, origin, () => {
    drawUiPanel(ctx, rect, { role, fillAlpha, borderAlpha, cornerLength });
  });
}

export function drawCommandButtonMotion(ctx, rect, label, {
  progress = 1,
  pulseTime = 999,
  role = 'energy',
  active = false,
  alpha = 1,
  reducedMotion = false,
  commandPulse = 0.8,
  textColor,
  hotkey,
  font = '16px "Mona Space", monospace',
} = {}) {
  const p = clamp01(progress);
  if (p <= 0.001) return;
  ctx.save();
  ctx.globalAlpha = (ctx.globalAlpha ?? 1) * alpha * p;
  drawCommandButton(ctx, rect, label, { role, active, alpha: 1, textColor, hotkey, font });
  if (!reducedMotion) {
    const pulse = 1 - motionProgress(pulseTime, { duration: commandPulse, ease: easeOutCubic });
    if (pulse > 0.001) {
      const r = normalizeRect(rect);
      const pad = 6 + pulse * 10;
      ctx.strokeStyle = roleColor(role, 0.28 * pulse);
      ctx.lineWidth = 1 + pulse * 2;
      ctx.strokeRect(r.x - pad, r.y - pad, r.w + pad * 2, r.h + pad * 2);
    }
  }
  ctx.restore();
}

export function drawDirectionalWipe(ctx, rect, {
  progress = 0,
  direction = 'right',
  role = 'anomaly',
  alpha = 1,
  reducedMotion = false,
} = {}) {
  const r = normalizeRect(rect);
  const p = reducedMotion ? 1 : easeInOutCubic(progress);
  if (reducedMotion) {
    ctx.save();
    ctx.fillStyle = withAlpha(roleColor(role), 0.05 * alpha);
    ctx.fillRect(r.x, r.y, r.w, r.h);
    ctx.restore();
    return;
  }
  const horizontal = direction === 'left' || direction === 'right';
  const span = horizontal ? r.w : r.h;
  const band = Math.max(90, span * 0.18);
  const head = direction === 'left' || direction === 'top'
    ? span + band - p * (span + band * 2)
    : -band + p * (span + band * 2);
  ctx.save();
  ctx.fillStyle = withAlpha(roleColor(role), 0.07 * alpha);
  if (horizontal) {
    const x = r.x + head;
    ctx.fillRect(x - band * 0.5, r.y, band, r.h);
    ctx.fillStyle = withAlpha(roleColor(role), 0.2 * alpha);
    ctx.fillRect(x, r.y, 3, r.h);
  } else {
    const y = r.y + head;
    ctx.fillRect(r.x, y - band * 0.5, r.w, band);
    ctx.fillStyle = withAlpha(roleColor(role), 0.2 * alpha);
    ctx.fillRect(r.x, y, r.w, 3);
  }
  ctx.restore();
}
