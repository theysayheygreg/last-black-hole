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

export function linear(value) {
  return clamp01(value);
}

/** Keep UI clocks moving without letting a suspended tab skip an animation. */
export function advanceMotionClock(current, frameDelta, { maxStep = 0.25 } = {}) {
  const clock = Math.max(0, Number(current) || 0);
  const delta = Math.max(0, Number(frameDelta) || 0);
  const cap = Math.max(0, Number(maxStep) || 0);
  return clock + Math.min(delta, cap);
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
    transitionDuration: Number.isFinite(config?.transitionDuration) ? Math.max(0.01, config.transitionDuration) : 0.34,
    windowDuration: Number.isFinite(config?.windowDuration) ? Math.max(0.01, config.windowDuration) : 0.42,
    focusDuration: Number.isFinite(config?.focusDuration) ? Math.max(0.01, config.focusDuration) : 0.16,
    maxOcclusion: clamp01(Number.isFinite(config?.maxOcclusion) ? config.maxOcclusion : 0.68),
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

function normalizePhases(phases) {
  const entries = Array.isArray(phases) ? phases : [];
  return entries.map((phase, index) => ({
    name: String(phase?.name || `phase-${index}`),
    duration: Math.max(0, Number.isFinite(phase?.duration) ? phase.duration : 0),
  }));
}

export function sampleTimeline(time, phases, {
  delay = 0,
  reducedMotion = false,
  ease = linear,
} = {}) {
  const entries = normalizePhases(phases);
  const totalDuration = entries.reduce((sum, phase) => sum + phase.duration, 0);
  if (reducedMotion || entries.length === 0 || totalDuration <= 0) {
    return {
      phase: entries.at(-1)?.name || null,
      phaseIndex: Math.max(0, entries.length - 1),
      phaseProgress: 1,
      progress: 1,
      settled: true,
      elapsed: totalDuration,
      totalDuration,
    };
  }

  const elapsed = Math.max(0, Number.isFinite(time) ? time - delay : 0);
  let cursor = 0;
  for (let index = 0; index < entries.length; index += 1) {
    const phase = entries[index];
    const end = cursor + phase.duration;
    if (elapsed < end || index === entries.length - 1) {
      const rawPhaseProgress = phase.duration <= 0 ? 1 : clamp01((elapsed - cursor) / phase.duration);
      const settled = elapsed >= totalDuration;
      return {
        phase: phase.name,
        phaseIndex: index,
        phaseProgress: settled ? 1 : ease(rawPhaseProgress),
        progress: settled ? 1 : clamp01(elapsed / totalDuration),
        settled,
        elapsed: Math.min(elapsed, totalDuration),
        totalDuration,
      };
    }
    cursor = end;
  }

  return {
    phase: entries.at(-1)?.name || null,
    phaseIndex: Math.max(0, entries.length - 1),
    phaseProgress: 1,
    progress: 1,
    settled: true,
    elapsed: totalDuration,
    totalDuration,
  };
}

export function sampleScreenTransition(time, {
  delay = 0,
  duration = 0.34,
  reducedMotion = false,
  maxOcclusion = 0.68,
} = {}) {
  const safeDuration = Math.max(0.01, duration);
  const timeline = sampleTimeline(time, [
    { name: 'depart', duration: safeDuration * 0.38 },
    { name: 'handoff', duration: safeDuration * 0.18 },
    { name: 'arrive', duration: safeDuration * 0.44 },
  ], { delay, reducedMotion, ease: easeInOutCubic });

  if (reducedMotion || timeline.settled) {
    return {
      ...timeline,
      outgoingAlpha: 0,
      incomingAlpha: 1,
      occlusionAlpha: 0,
      criticalAlpha: 1,
    };
  }

  const cap = Math.min(0.82, clamp01(maxOcclusion));
  let outgoingAlpha = 0;
  let incomingAlpha = 0;
  let occlusionAlpha = cap;
  if (timeline.phase === 'depart') {
    outgoingAlpha = 1 - timeline.phaseProgress;
    occlusionAlpha = cap * timeline.phaseProgress;
  } else if (timeline.phase === 'handoff') {
    incomingAlpha = 0.18 * timeline.phaseProgress;
  } else {
    incomingAlpha = 0.18 + 0.82 * timeline.phaseProgress;
    occlusionAlpha = cap * (1 - timeline.phaseProgress);
  }

  return {
    ...timeline,
    outgoingAlpha: clamp01(outgoingAlpha),
    incomingAlpha: clamp01(incomingAlpha),
    occlusionAlpha: Math.min(cap, clamp01(occlusionAlpha)),
    criticalAlpha: 1,
  };
}

export function sampleTerminalWindow(time, {
  delay = 0,
  duration = 0.42,
  reducedMotion = false,
} = {}) {
  const safeDuration = Math.max(0.01, duration);
  const timeline = sampleTimeline(time, [
    { name: 'node', duration: safeDuration * 0.12 },
    { name: 'rail', duration: safeDuration * 0.28 },
    { name: 'frame', duration: safeDuration * 0.34 },
    { name: 'content', duration: safeDuration * 0.26 },
  ], { delay, reducedMotion, ease: easeOutCubic });

  const completeBefore = (phaseIndex) => timeline.phaseIndex > phaseIndex ? 1 : 0;
  const progressAt = (phaseIndex) => timeline.phaseIndex === phaseIndex ? timeline.phaseProgress : completeBefore(phaseIndex);
  return {
    ...timeline,
    node: progressAt(0),
    rail: progressAt(1),
    frame: progressAt(2),
    content: progressAt(3),
  };
}

export function sampleStaggeredRows(time, count, options = {}) {
  const total = Math.max(0, Math.floor(Number.isFinite(count) ? count : 0));
  const reducedMotion = options.reducedMotion === true;
  const distance = Math.max(0, Number.isFinite(options.distance) ? options.distance : 8);
  return Array.from({ length: total }, (_, index) => {
    const progress = staggerProgress(time, index, options);
    return {
      index,
      progress,
      alpha: reducedMotion ? 1 : progress,
      offset: reducedMotion ? 0 : (1 - progress) * distance,
      settled: reducedMotion || progress >= 1,
    };
  });
}

export function sampleFocusShift(time, {
  delay = 0,
  duration = 0.16,
  reducedMotion = false,
} = {}) {
  const progress = motionProgress(time, { delay, duration, reducedMotion, ease: easeInOutCubic });
  if (reducedMotion || progress >= 1) {
    return { progress: 1, previousAlpha: 0.58, currentAlpha: 1, edgeAlpha: 0, settled: true };
  }
  return {
    progress,
    previousAlpha: 1 - 0.42 * progress,
    currentAlpha: 0.72 + 0.28 * progress,
    edgeAlpha: Math.sin(Math.PI * progress) * 0.34,
    settled: false,
  };
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
  if (origin === 'top-left' || origin === 'top-right' || origin === 'bottom-left' || origin === 'bottom-right') {
    const w = r.w * p;
    const h = r.h * p;
    return {
      x: origin.endsWith('right') ? r.x + r.w - w : r.x,
      y: origin.startsWith('bottom') ? r.y + r.h - h : r.y,
      w,
      h,
    };
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

function terminalCorner(rect, origin) {
  const right = origin.endsWith('right');
  const bottom = origin.startsWith('bottom');
  return {
    x: right ? rect.x + rect.w : rect.x,
    y: bottom ? rect.y + rect.h : rect.y,
    xDirection: right ? -1 : 1,
    yDirection: bottom ? -1 : 1,
  };
}

export function drawTerminalWindow(ctx, rect, {
  state = sampleTerminalWindow(Infinity, { reducedMotion: true }),
  origin = 'top-left',
  role = 'flow',
  fillAlpha = 0.46,
  borderAlpha = 0.34,
  cornerLength = 18,
  drawContent,
} = {}) {
  const r = normalizeRect(rect);
  const corner = terminalCorner(r, origin);
  const nodeSize = 3 + 2 * clamp01(state.node);
  ctx.save();
  ctx.fillStyle = roleColor(role, 0.86);
  ctx.fillRect(corner.x - nodeSize / 2, corner.y - nodeSize / 2, nodeSize, nodeSize);

  if (state.rail > 0.001) {
    const horizontal = r.w * clamp01(state.rail);
    const vertical = r.h * clamp01((state.rail - 0.38) / 0.62);
    ctx.beginPath();
    ctx.moveTo(corner.x, corner.y);
    ctx.lineTo(corner.x + corner.xDirection * horizontal, corner.y);
    if (vertical > 0) {
      ctx.moveTo(corner.x, corner.y);
      ctx.lineTo(corner.x, corner.y + corner.yDirection * vertical);
    }
    ctx.strokeStyle = roleColor(role, 0.72);
    ctx.lineWidth = 1;
    ctx.stroke();
  }
  ctx.restore();

  if (state.frame > 0.001) {
    drawMotionPanel(ctx, r, {
      progress: state.frame,
      origin,
      role,
      fillAlpha,
      borderAlpha,
      cornerLength,
    });
  }

  if (typeof drawContent === 'function' && state.content > 0.001) {
    ctx.save();
    ctx.globalAlpha = (ctx.globalAlpha ?? 1) * clamp01(state.content);
    drawContent(r, clamp01(state.content));
    ctx.restore();
  }
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
  action,
  prompt,
  font = '16px "Mona Space", monospace',
} = {}) {
  const p = clamp01(progress);
  if (p <= 0.001) return;
  ctx.save();
  ctx.globalAlpha = (ctx.globalAlpha ?? 1) * alpha * p;
  drawCommandButton(ctx, rect, label, { role, active, alpha: 1, textColor, action, prompt, font });
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
