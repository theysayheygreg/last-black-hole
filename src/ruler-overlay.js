import { CONFIG } from './config.js';
import { worldToScreen } from './coords.js';
import { createRulerRegistry, FORCE_LEDGER_CLASSES } from './ruler-contract.js';
import {
  RULER_SCALE_BAR_METERS,
  metersToScreenRadius,
  simUnitsToMeters,
} from './units.js';
import { canvasFont } from './ui/typography.js';
import { getRulerReadoutBounds } from './ui/presentation-layout.js';

const COLORS = Object.freeze({
  capture: '#f7d774',
  magnetismEntry: '#70d8ff',
  magnetismLocked: '#ff7fd1',
  coyote: '#a8b8c8',
  payoffEntry: '#b5c8d8',
  payoffExit: '#ffe36e',
  chain: '#77f0bd',
  thrust: '#66e6ff',
  coupling: '#6df2a2',
  gravity: '#ffca68',
  wave: '#8ca8ff',
  impulse: '#ff78bc',
  drag: '#c0c8d2',
});

function finite(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function fallbackRulerFacts() {
  return {
    source: 'local-contract-fallback',
    slingshot: {
      captureRadius: {
        well: simUnitsToMeters(0.45),
        star: simUnitsToMeters(0.30),
        planetoid: simUnitsToMeters(0.18),
      },
      magnetism: { active: false, entry: { x: 0, y: 0 }, locked: { x: 0, y: 0 }, bendDegrees: 0 },
      coyoteTime: { implemented: true, durationMs: 50, remainingMs: 0, effectiveDurationMs: 50, transportAllowanceMs: 0 },
      payoffCurve: { active: false, entry: { x: 0, y: 0 }, exit: { x: 0, y: 0 }, ratio: 0 },
      chainWindow: { active: false, durationSeconds: 0.5, remainingSeconds: 0 },
    },
  };
}

function drawLabel(ctx, text, x, y, color = '#e8f5ff', align = 'left') {
  ctx.font = canvasFont(10);
  ctx.textAlign = align;
  const width = ctx.measureText(text).width;
  const left = align === 'center' ? x - width / 2 : align === 'right' ? x - width : x;
  ctx.fillStyle = 'rgba(0, 4, 12, 0.78)';
  ctx.fillRect(left - 3, y - 10, width + 6, 14);
  ctx.fillStyle = color;
  ctx.fillText(text, x, y);
}

function drawArrow(ctx, start, vector, color, label = '', maxLength = 220) {
  const rawLength = Math.hypot(vector.x, vector.y);
  if (rawLength < 0.25) return { x: start.x, y: start.y };
  const scale = Math.min(1, maxLength / rawLength);
  const end = { x: start.x + vector.x * scale, y: start.y + vector.y * scale };
  const angle = Math.atan2(end.y - start.y, end.x - start.x);
  const head = 6;
  ctx.strokeStyle = color;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(start.x, start.y);
  ctx.lineTo(end.x, end.y);
  ctx.lineTo(end.x - Math.cos(angle - 0.55) * head, end.y - Math.sin(angle - 0.55) * head);
  ctx.moveTo(end.x, end.y);
  ctx.lineTo(end.x - Math.cos(angle + 0.55) * head, end.y - Math.sin(angle + 0.55) * head);
  ctx.stroke();
  if (label) drawLabel(ctx, label, end.x + 5, end.y - 4, color);
  return end;
}

function drawVectorPair(state, first, second, firstColor, secondColor, label) {
  if (!state.playerScreen) return;
  const maxMagnitude = Math.max(1e-6, Math.hypot(first.x, first.y), Math.hypot(second.x, second.y));
  const scale = 58 / maxMagnitude;
  const origin = { x: state.playerScreen.x, y: state.playerScreen.y };
  drawArrow(state.ctx, origin, { x: first.x * scale, y: first.y * scale }, firstColor, 'in', 70);
  drawArrow(state.ctx, origin, { x: second.x * scale, y: second.y * scale }, secondColor, label, 70);
}

function addRow(state, row) {
  state.rows.push(row);
  return true;
}

const HANDLERS = {
  'slingshot.captureRadius': (state, contract) => {
    const facts = state.ruler.slingshot.captureRadius;
    const preview = finite(CONFIG.debug?.ruler?.captureRadiusPreview_m);
    const families = [
      ['well', state.presentation.world.wells, preview > 0 ? preview : facts.well],
      ['star', state.presentation.world.stars, facts.star],
      ['planetoid', state.presentation.world.planetoids, facts.planetoid],
    ];
    let firstRadiusPx = 0;
    for (const [kind, entities, meters] of families) {
      const radius = metersToScreenRadius(meters, state.canvasW, state.canvasH);
      if (!firstRadiusPx && kind === 'well') firstRadiusPx = radius.rx;
      for (const entity of entities) {
        const [x, y] = worldToScreen(entity.world.x, entity.world.y, state.camera.x, state.camera.y, state.canvasW, state.canvasH);
        state.ctx.strokeStyle = 'rgba(247, 215, 116, 0.62)';
        state.ctx.lineWidth = 1;
        state.ctx.beginPath();
        state.ctx.ellipse(x, y, radius.rx, radius.ry, 0, 0, Math.PI * 2);
        state.ctx.stroke();
        drawLabel(state.ctx, `${Math.round(meters)} m`, x, y - radius.ry - 5, COLORS.capture, 'center');
      }
    }
    state.geometry.captureRadiusPx = firstRadiusPx;
    return addRow(state, { id: contract.id, color: COLORS.capture, label: 'capture', value: `${Math.round(preview > 0 ? preview : facts.well)} m · step 25 m` });
  },
  'slingshot.magnetism': (state, contract) => {
    const value = state.ruler.slingshot.magnetism;
    if (value.active) drawVectorPair(state, value.entry, value.locked, COLORS.magnetismEntry, COLORS.magnetismLocked, 'lock');
    return addRow(state, { id: contract.id, color: COLORS.magnetismLocked, label: 'magnetism', value: value.active ? `${value.bendDegrees.toFixed(1)}° · step 5°` : 'awaiting lock · step 5°' });
  },
  'slingshot.coyoteTime': (state, contract) => {
    const value = state.ruler.slingshot.coyoteTime;
    const fraction = value.durationMs > 0 ? value.remainingMs / value.durationMs : 0;
    const allowance = Math.max(0, finite(value.transportAllowanceMs, finite(value.effectiveDurationMs) - value.durationMs));
    const valueLabel = value.implemented
      ? `${Math.round(value.remainingMs)} / ${Math.round(value.durationMs)} ms + ${Math.round(allowance)} ms transport`
      : '0 ms · disabled · fixed transport allowance';
    return addRow(state, { id: contract.id, color: COLORS.coyote, label: 'coyote', value: valueLabel, fraction });
  },
  'slingshot.payoffCurve': (state, contract) => {
    const value = state.ruler.slingshot.payoffCurve;
    if (value.active) drawVectorPair(state, value.entry, value.exit, COLORS.payoffEntry, COLORS.payoffExit, 'exit');
    return addRow(state, { id: contract.id, color: COLORS.payoffExit, label: 'payoff', value: value.active ? `${value.ratio.toFixed(2)}x · step 0.1x` : 'awaiting release projection · step 0.1x' });
  },
  'slingshot.chainWindow': (state, contract) => {
    const value = state.ruler.slingshot.chainWindow;
    const preview = finite(CONFIG.debug?.ruler?.chainWindowPreview_s);
    const duration = preview > 0 ? preview : value.durationSeconds;
    const remaining = preview > 0 ? preview : value.remainingSeconds;
    const fraction = duration > 0 ? Math.min(1, remaining / duration) : 0;
    if (state.playerScreen && fraction > 0) {
      state.ctx.strokeStyle = COLORS.chain;
      state.ctx.lineWidth = 2;
      state.ctx.beginPath();
      state.ctx.arc(state.playerScreen.x, state.playerScreen.y, 26, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * fraction);
      state.ctx.stroke();
    }
    return addRow(state, { id: contract.id, color: COLORS.chain, label: 'chain', value: `${remaining.toFixed(2)} / ${duration.toFixed(2)} s · step 0.5 s`, fraction });
  },
};

for (const name of FORCE_LEDGER_CLASSES) {
  HANDLERS[`force.${name}`] = (state, contract) => {
    const vector = state.forceLedger?.vectors?.[name] || { x: 0, y: 0, magnitude: 0 };
    const pixelsPerUnit = finite(CONFIG.debug?.ruler?.forceVectorScalePxPerMps2, 0.04);
    const screenVector = { x: vector.x * pixelsPerUnit, y: vector.y * pixelsPerUnit };
    if (state.forceCursor && vector.magnitude > 0.01) {
      state.forceCursor = drawArrow(
        state.ctx,
        state.forceCursor,
        screenVector,
        COLORS[name],
        `${name} ${Math.round(vector.magnitude)} m/s²`
      );
    }
    return addRow(state, { id: contract.id, color: COLORS[name], label: name, value: `${Math.round(vector.magnitude)} m/s²` });
  };
}

export const RULER_HANDLER_REGISTRY = createRulerRegistry(HANDLERS);

function drawScaleBar(state) {
  const projected = metersToScreenRadius(RULER_SCALE_BAR_METERS, state.canvasW, state.canvasH);
  const x = (state.canvasW - projected.rx) / 2;
  const y = state.canvasH - 26;
  state.ctx.strokeStyle = '#f0f6ff';
  state.ctx.lineWidth = 2;
  state.ctx.beginPath();
  state.ctx.moveTo(x, y - 5); state.ctx.lineTo(x, y + 5);
  state.ctx.moveTo(x, y); state.ctx.lineTo(x + projected.rx, y);
  state.ctx.moveTo(x + projected.rx, y - 5); state.ctx.lineTo(x + projected.rx, y + 5);
  state.ctx.stroke();
  drawLabel(state.ctx, `${RULER_SCALE_BAR_METERS} m`, x + projected.rx / 2, y - 9, '#f0f6ff', 'center');
  state.geometry.scaleBarPx = projected.rx;
}

function drawReadout(state) {
  const rowH = 17;
  const bounds = getRulerReadoutBounds(state.canvasW, state.canvasH, state.rows.length);
  const { x, y, w: panelW, h: panelH } = bounds;
  state.geometry.readoutBounds = bounds;
  state.ctx.fillStyle = 'rgba(0, 5, 14, 0.82)';
  state.ctx.fillRect(x, y, panelW, panelH);
  state.ctx.strokeStyle = 'rgba(210, 230, 245, 0.32)';
  state.ctx.strokeRect(x, y, panelW, panelH);
  state.ctx.font = canvasFont(10, { weight: 'bold' });
  state.ctx.textAlign = 'left';
  state.ctx.fillStyle = '#f0f6ff';
  state.ctx.fillText(`RULER // ${state.ruler.source}`, x + 8, y + 17);
  state.rows.forEach((row, index) => {
    const rowY = y + 35 + index * rowH;
    if (Number.isFinite(row.fraction)) {
      state.ctx.fillStyle = 'rgba(255,255,255,0.08)';
      state.ctx.fillRect(x + 7, rowY - 10, panelW - 14, 12);
      state.ctx.fillStyle = row.color;
      state.ctx.globalAlpha = 0.18;
      state.ctx.fillRect(x + 7, rowY - 10, (panelW - 14) * Math.max(0, Math.min(1, row.fraction)), 12);
      state.ctx.globalAlpha = 1;
    }
    state.ctx.fillStyle = row.color;
    state.ctx.font = canvasFont(9);
    state.ctx.fillText(row.label, x + 9, rowY);
    state.ctx.textAlign = 'right';
    state.ctx.fillText(row.value, x + panelW - 9, rowY);
    state.ctx.textAlign = 'left';
  });
}

export function drawRulerOverlay(ctx, { presentation, canvasW, canvasH, reducedMotion = false } = {}) {
  if (!CONFIG.debug?.showRulerOverlay || !ctx || !presentation?.localPlayer) {
    return Object.freeze({ enabled: false, handlerCount: 0, geometry: Object.freeze({}) });
  }
  const player = presentation.localPlayer;
  const [playerX, playerY] = worldToScreen(
    player.world.x, player.world.y,
    presentation.camera.x, presentation.camera.y,
    canvasW, canvasH
  );
  const state = {
    ctx, presentation, canvasW, canvasH,
    camera: presentation.camera,
    ruler: player.ruler || fallbackRulerFacts(),
    forceLedger: player.forceLedger,
    playerScreen: { x: playerX, y: playerY },
    forceCursor: { x: playerX, y: playerY },
    runClock: presentation.runClock,
    rows: [],
    geometry: {},
    reducedMotion: Boolean(reducedMotion),
  };
  ctx.save();
  drawScaleBar(state);
  const results = RULER_HANDLER_REGISTRY.drawAll(state);
  drawReadout(state);
  ctx.restore();
  return Object.freeze({
    enabled: true,
    handlerCount: results.filter((result) => result.drawn).length,
    handlerIds: Object.freeze(results.map((result) => result.id)),
    forceTick: player.forceLedger?.tick ?? null,
    runClock: state.runClock,
    geometry: Object.freeze({ ...state.geometry }),
    reducedMotion: state.reducedMotion,
  });
}
