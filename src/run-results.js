import { canvasFont } from './ui/typography.js';
import {
  drawKeyValueRow,
  drawScanlines,
  drawSectionLabel,
  drawSelectedRow,
  drawStatusPill,
  fitUiText,
  roleColor,
  withAlpha,
} from './ui/canvas-primitives.js';
import { promptLabel } from './ui/input-prompts.js';
import {
  drawCommandButtonMotion,
  drawMotionPanel,
  motionProgress,
  resolveMotionSettings,
  staggerProgress,
} from './ui/motion.js';

const INHIBITOR_FORMS = ['dormant', 'glitch', 'swarm', 'vessel'];

function clamp01(value) {
  return Math.max(0, Math.min(1, Number(value) || 0));
}

function formatTime(seconds = 0) {
  const safe = Math.max(0, Math.floor(Number(seconds) || 0));
  const mins = Math.floor(safe / 60);
  const secs = safe % 60;
  return `${mins}:${String(secs).padStart(2, '0')}`;
}

function formatSignal(value) {
  if (!Number.isFinite(Number(value))) return '--';
  return Number(value).toFixed(2);
}

function itemLabel(item) {
  if (!item) return '[ empty ]';
  const tier = item.tier != null ? `T${item.tier}` : 'T?';
  const name = item.name || item.id || 'unknown artifact';
  const value = Number.isFinite(Number(item.value)) ? ` ${Math.round(item.value)}em` : '';
  return `[${tier}] ${name}${value}`;
}

function totalCargoValue(cargo) {
  return cargo.reduce((sum, item) => sum + (Number(item?.value) || 0), 0);
}

function normalizeOutcome(rawOutcome, phase) {
  const outcome = rawOutcome || (phase === 'escaped' ? 'extracted' : phase === 'dead' ? 'dead' : 'abandoned');
  if (outcome === 'escaped') return 'extracted';
  return outcome;
}

function deathStatus(result) {
  const cause = result?.deathCause || null;
  const entity = result?.deathEntityId || null;
  if (cause === 'well') return entity ? `CONSUMED BY ${String(entity).toUpperCase()}` : 'CONSUMED';
  if (cause === 'inhibitor_vessel') return 'DEVOURED';
  if (cause === 'inhibitor_swarm') return 'SHREDDED';
  if (cause === 'collapse') return 'COLLAPSED';
  if (cause) return String(cause).replace(/_/g, ' ').toUpperCase();
  return 'CONSUMED';
}

function cargoForOutcome(result, fallbackCargo, outcome) {
  if (outcome === 'extracted') {
    return Array.isArray(result?.cargoExtracted) ? result.cargoExtracted : fallbackCargo;
  }
  return Array.isArray(result?.cargoLost) ? result.cargoLost : fallbackCargo;
}

export function buildRunResultsViewModel({
  runResult = null,
  phase = 'dead',
  fallbackCargo = [],
  fallbackSurvivalTime = 0,
  fallbackEmEarned = 0,
  deathTax = 0,
} = {}) {
  const outcome = normalizeOutcome(runResult?.outcome, phase);
  const extracted = outcome === 'extracted';
  const cargo = cargoForOutcome(runResult, fallbackCargo, outcome);
  const signalPeak = runResult?.signalPeak ?? null;
  const signalZone = runResult?.signalPeakZone || 'ghost';
  const inhibitorForm = Math.max(0, Math.min(3, Number(runResult?.inhibitorFormReached) || 0));
  const survivalTime = runResult?.survivalTime ?? fallbackSurvivalTime ?? 0;
  const emEarned = Number.isFinite(Number(runResult?.emEarned))
    ? Math.max(0, Math.round(Number(runResult.emEarned)))
    : Math.max(0, Math.round(Number(fallbackEmEarned) || 0));

  const aiOutcomes = Array.isArray(runResult?.aiOutcomes) ? runResult.aiOutcomes : [];
  const notables = Array.isArray(runResult?.notables) ? runResult.notables : [];
  const mapContext = {
    mapId: runResult?.mapId || runResult?.mapContext?.mapId || null,
    seed: runResult?.seed ?? runResult?.mapContext?.seed ?? null,
    wellCount: runResult?.wellCount ?? runResult?.mapContext?.wellCount ?? null,
  };

  return {
    outcome,
    status: extracted ? 'EXTRACTED' : deathStatus(runResult),
    tone: extracted ? 'extract' : 'death',
    survival: formatTime(survivalTime),
    survivalSeconds: survivalTime,
    signalPeakLabel: `${String(signalZone).toUpperCase()} (${formatSignal(signalPeak)})`,
    inhibitorLabel: INHIBITOR_FORMS[inhibitorForm] || 'dormant',
    wellsVisited: runResult?.wellsVisited ?? null,
    cargo,
    cargoTitle: extracted ? 'CARGO EXTRACTED' : 'CARGO LOST',
    cargoCount: cargo.length,
    cargoValue: totalCargoValue(cargo),
    cargoLabels: cargo.map(itemLabel),
    emEarned,
    deathCause: !extracted && runResult?.deathCause
      ? (runResult.deathEntityId ? `${runResult.deathCause}: ${runResult.deathEntityId}` : runResult.deathCause)
      : null,
    deathTax: Math.max(0, Math.round(Number(deathTax) || 0)),
    aiLines: aiOutcomes.slice(0, 4).map((ai) => {
      const personality = ai.personality || ai.name || 'rival';
      const hull = ai.hullType || 'unknown';
      const cargoCount = Number.isFinite(Number(ai.cargoCount)) ? ` / ${ai.cargoCount} cargo` : '';
      return `${personality} (${hull}) ${ai.outcome || 'unknown'}${cargoCount}`;
    }),
    notableLines: notables.slice(0, 3).map((entry) => entry.description || entry.name || String(entry.type || 'notable')),
    mapContext,
  };
}

export function drawRunResultsOverlay(ctx, canvas, {
  view,
  rawTime = 0,
  totalTime = 0,
  lingerDuration = 1.2,
  motionSettings = null,
} = {}) {
  if (!view) return;
  const motion = motionSettings || resolveMotionSettings();
  const w = canvas.width;
  const h = canvas.height;
  const cx = w / 2;
  const cy = h / 2;
  const success = view.tone === 'extract';
  const role = success ? 'extract' : 'danger';
  const continueRole = success ? 'extract' : 'flow';
  const continueLabel = success ? 'review salvage' : 'return home';
  const accent = roleColor(role, 0.95);
  const lingerFrac = clamp01(rawTime / lingerDuration);
  const dimEase = lingerFrac * lingerFrac * (3 - 2 * lingerFrac);
  const overlayAlpha = lingerFrac < 1 ? dimEase * 0.55 : 0.55 + Math.min(0.2, (rawTime - lingerDuration) * 0.6);
  const reveal = Math.max(0, rawTime - lingerDuration);

  ctx.save();
  ctx.fillStyle = `rgba(0, 2, 12, ${overlayAlpha.toFixed(3)})`;
  ctx.fillRect(0, 0, w, h);

  if (rawTime < lingerDuration) {
    const a = Math.min(0.35, lingerFrac * 0.4);
    ctx.textAlign = 'center';
    ctx.fillStyle = withAlpha(accent, a);
    ctx.font = canvasFont(12);
    ctx.shadowColor = withAlpha(accent, a * 0.5);
    ctx.shadowBlur = 10;
    ctx.fillText('-- cycle ended --', cx, cy);
    ctx.restore();
    return;
  }

  drawScanlines(ctx, w, h, 0.026);
  const panelW = Math.min(840, w - 64);
  const panelH = Math.min(540, h - 48);
  const panelX = cx - panelW / 2;
  const panelY = cy - panelH / 2;
  const panelRect = { x: panelX, y: panelY, w: panelW, h: panelH };
  const panelReveal = motionProgress(reveal, {
    delay: 0.02,
    duration: motion.panelDuration,
    reducedMotion: motion.reducedMotion,
  });
  drawMotionPanel(ctx, panelRect, {
    progress: panelReveal,
    origin: 'center',
    role,
    fillAlpha: 0.68,
    borderAlpha: 0.26,
    cornerLength: 46,
  });

  ctx.shadowColor = 'rgba(0, 0, 0, 0.9)';
  ctx.shadowBlur = 14;
  ctx.textAlign = 'center';

  const titleAlpha = motionProgress(reveal, {
    delay: 0.15,
    duration: 0.38,
    reducedMotion: motion.reducedMotion,
  });
  ctx.fillStyle = withAlpha(accent, titleAlpha);
  ctx.font = canvasFont(success ? 38 : 42, { role: 'display', weight: '800' });
  ctx.fillText(fitUiText(ctx, view.status, panelW - 72), cx, panelY + 58);

  ctx.fillStyle = roleColor('muted', 0.78 * motionProgress(reveal, {
    delay: 0.35,
    duration: 0.5,
    reducedMotion: motion.reducedMotion,
  }));
  ctx.font = canvasFont(15);
  ctx.fillText(success ? 'you made it through the aperture' : 'this is what the universe kept', cx, panelY + 84);

  const contentAlpha = motionProgress(reveal, {
    delay: 0.65,
    duration: motion.textDuration,
    reducedMotion: motion.reducedMotion,
  });
  const leftX = panelX + 42;
  const rightX = panelX + panelW / 2 + 42;
  const mapLabel = view.mapContext.mapId ? String(view.mapContext.mapId).toUpperCase() : 'UNKNOWN MAP';
  drawStatusPill(ctx, { x: cx - 138, y: panelY + 114, w: 118, h: 26 }, mapLabel, { role, alpha: contentAlpha });
  drawStatusPill(ctx, { x: cx, y: panelY + 114, w: 118, h: 26 }, `${view.cargoCount} CARGO`, { role, alpha: contentAlpha });
  drawStatusPill(ctx, { x: cx + 138, y: panelY + 114, w: 118, h: 26 }, `+${view.emEarned} EM`, { role: 'salvage', alpha: contentAlpha });

  let y = panelY + 160;

  drawSectionLabel(ctx, 'RUN SUMMARY', leftX, y, { role, alpha: contentAlpha });
  y += 25;
  drawKeyValueRow(ctx, 'survival', view.survival, leftX, y, { alpha: contentAlpha });
  y += 18;
  drawKeyValueRow(ctx, 'signal peak', view.signalPeakLabel, leftX, y, { alpha: contentAlpha, valueRole: 'flow' });
  y += 18;
  drawKeyValueRow(ctx, 'inhibitor', view.inhibitorLabel, leftX, y, { alpha: contentAlpha, valueRole: 'inhibitor' });
  y += 18;
  if (view.wellsVisited != null) {
    drawKeyValueRow(ctx, 'wells visited', String(view.wellsVisited), leftX, y, { alpha: contentAlpha });
    y += 18;
  }
  if (view.deathCause) {
    y += 8;
    drawKeyValueRow(ctx, 'cause', view.deathCause, leftX, y, { alpha: contentAlpha, valueRole: 'danger' });
    y += 18;
  }

  y += 18;
  drawSectionLabel(ctx, 'LEDGER', leftX, y, { role: 'salvage', alpha: contentAlpha });
  y += 25;
  drawKeyValueRow(ctx, success ? 'credited' : 'residue', `${view.emEarned} EM`, leftX, y, { alpha: contentAlpha, valueRole: 'salvage' });
  y += 18;
  if (view.deathTax > 0) {
    drawKeyValueRow(ctx, 'death tax', `-${view.deathTax} EM`, leftX, y, { alpha: contentAlpha, valueRole: 'danger' });
  }

  let ry = panelY + 160;
  drawSectionLabel(ctx, view.cargoTitle, rightX, ry, { role: success ? 'salvage' : 'danger', alpha: contentAlpha });
  ry += 24;
  drawKeyValueRow(ctx, 'manifest', `${view.cargoCount} items`, rightX, ry, {
    alpha: contentAlpha,
    valueRole: success ? 'salvage' : 'danger',
  });
  ry += 22;
  drawKeyValueRow(ctx, 'salvage value', `${view.cargoValue} EM`, rightX, ry, {
    alpha: contentAlpha,
    valueRole: success ? 'salvage' : 'danger',
  });
  ry += 22;
  ctx.textAlign = 'left';
  ctx.font = canvasFont(13);
  const cargoLines = view.cargoLabels.length > 0 ? view.cargoLabels.slice(0, 6) : ['[ empty ]'];
  for (let i = 0; i < cargoLines.length; i++) {
    const rowAlpha = Math.min(contentAlpha, staggerProgress(reveal, i, {
      delay: 0.82,
      stagger: motion.rowStagger,
      reducedMotion: motion.reducedMotion,
    }));
    drawSelectedRow(ctx, { x: rightX - 6, y: ry - 13, w: panelW / 2 - 64, h: 18 }, {
      role: success ? 'salvage' : 'danger',
      active: cargoLines[i] !== '[ empty ]',
      alpha: rowAlpha,
      fillAlpha: success ? 0.075 : 0.09,
      borderAlpha: success ? 0.14 : 0.22,
      railWidth: 2,
    });
    ctx.fillStyle = success ? roleColor('text', 0.85 * rowAlpha) : roleColor('danger', 0.72 * rowAlpha);
    ctx.fillText(fitUiText(ctx, cargoLines[i], panelW / 2 - 82), rightX, ry);
    if (!success && cargoLines[i] !== '[ empty ]') {
      ctx.strokeStyle = roleColor('danger', 0.45 * rowAlpha);
      ctx.beginPath();
      ctx.moveTo(rightX, ry - 4);
      ctx.lineTo(rightX + Math.min(panelW / 2 - 90, cargoLines[i].length * 7), ry - 4);
      ctx.stroke();
    }
    ry += 18;
  }

  ry += 14;
  const notableLines = [...view.notableLines];
  if (view.aiLines.length > 0) notableLines.push(...view.aiLines);
  drawSectionLabel(ctx, 'NOTABLE', rightX, ry, { role, alpha: contentAlpha });
  ry += 24;
  ctx.font = canvasFont(13);
  ctx.fillStyle = roleColor('muted', 0.84 * contentAlpha);
  const lines = notableLines.length > 0 ? notableLines.slice(0, 5) : ['no unusual telemetry'];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const rowAlpha = Math.min(contentAlpha, staggerProgress(reveal, i, {
      delay: 1.02,
      stagger: motion.rowStagger,
      reducedMotion: motion.reducedMotion,
    }));
    ctx.fillStyle = roleColor('muted', 0.84 * rowAlpha);
    ctx.fillText(fitUiText(ctx, line, panelW / 2 - 72), rightX, ry);
    ry += 16;
  }

  const promptAlpha = motionProgress(reveal, {
    delay: 1.55,
    duration: 0.45,
    reducedMotion: motion.reducedMotion,
  });
  if (promptAlpha > 0) {
    const blink = Math.sin(totalTime * 3) > 0 ? 1 : 0.65;
    drawCommandButtonMotion(ctx, {
      x: cx - 150,
      y: panelY + panelH - 86,
      w: 300,
      h: 44,
    }, continueLabel, {
      hotkey: promptLabel('confirm'),
      role: continueRole,
      active: true,
      alpha: promptAlpha * blink,
      progress: promptAlpha,
      pulseTime: (totalTime % 1.4) / 1.4,
      reducedMotion: motion.reducedMotion,
      commandPulse: motion.commandPulse,
    });
  }

  ctx.restore();
}
