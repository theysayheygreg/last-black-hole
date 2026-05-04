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
  fallbackCargoValue = 0,
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
    : Math.max(0, Math.round(Number(fallbackCargoValue) || 0));

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

function withAlpha(color, alpha) {
  return color.replace(/[\d.]+\)$/, `${clamp01(alpha).toFixed(3)})`);
}

function drawScanlines(ctx, w, h, alpha = 0.035) {
  ctx.save();
  ctx.fillStyle = `rgba(255, 255, 255, ${alpha})`;
  for (let y = 0; y < h; y += 4) ctx.fillRect(0, y, w, 1);
  ctx.restore();
}

function drawFrame(ctx, x, y, w, h, color) {
  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineWidth = 1;
  ctx.strokeRect(x, y, w, h);
  ctx.fillStyle = color;
  ctx.fillRect(x, y, 42, 1);
  ctx.fillRect(x + w - 42, y + h - 1, 42, 1);
  ctx.fillRect(x, y, 1, 42);
  ctx.fillRect(x + w - 1, y + h - 42, 1, 42);
  ctx.restore();
}

function drawSectionLabel(ctx, text, x, y, color) {
  ctx.save();
  ctx.textAlign = 'left';
  ctx.fillStyle = color;
  ctx.font = 'bold 11px monospace';
  ctx.fillText(`-- ${text} --`, x, y);
  ctx.restore();
}

function drawKeyValue(ctx, key, value, x, y, alpha = 1) {
  ctx.save();
  ctx.textAlign = 'left';
  ctx.font = '12px monospace';
  ctx.fillStyle = `rgba(130, 150, 175, ${0.75 * alpha})`;
  ctx.fillText(key, x, y);
  ctx.fillStyle = `rgba(218, 226, 236, ${0.9 * alpha})`;
  ctx.fillText(value, x + 122, y);
  ctx.restore();
}

export function drawRunResultsOverlay(ctx, canvas, {
  view,
  rawTime = 0,
  totalTime = 0,
  lingerDuration = 1.2,
} = {}) {
  if (!view) return;
  const w = canvas.width;
  const h = canvas.height;
  const cx = w / 2;
  const cy = h / 2;
  const success = view.tone === 'extract';
  const accent = success ? 'rgba(98, 242, 165, 0.92)' : 'rgba(232, 25, 0, 0.92)';
  const dimAccent = success ? 'rgba(98, 242, 165, 0.22)' : 'rgba(232, 25, 0, 0.18)';
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
    ctx.font = '12px monospace';
    ctx.shadowColor = withAlpha(accent, a * 0.5);
    ctx.shadowBlur = 10;
    ctx.fillText('-- cycle ended --', cx, cy);
    ctx.restore();
    return;
  }

  drawScanlines(ctx, w, h, 0.026);
  const panelW = Math.min(620, w - 72);
  const panelH = Math.min(460, h - 70);
  const panelX = cx - panelW / 2;
  const panelY = cy - panelH / 2;
  drawFrame(ctx, panelX, panelY, panelW, panelH, dimAccent);

  ctx.shadowColor = 'rgba(0, 0, 0, 0.9)';
  ctx.shadowBlur = 14;
  ctx.textAlign = 'center';

  const titleAlpha = clamp01((reveal - 0.15) * 2.5);
  ctx.fillStyle = withAlpha(accent, titleAlpha);
  ctx.font = 'bold 34px monospace';
  ctx.fillText(view.status, cx, panelY + 48);

  ctx.fillStyle = `rgba(150, 165, 188, ${0.72 * clamp01((reveal - 0.35) * 2)})`;
  ctx.font = '12px monospace';
  ctx.fillText(success ? 'you made it through the aperture' : 'this is what the universe kept', cx, panelY + 70);

  const contentAlpha = clamp01((reveal - 0.65) * 2);
  const leftX = panelX + 34;
  const rightX = panelX + panelW / 2 + 26;
  let y = panelY + 112;

  drawSectionLabel(ctx, 'RUN SUMMARY', leftX, y, withAlpha(accent, 0.72 * contentAlpha));
  y += 25;
  drawKeyValue(ctx, 'survival', view.survival, leftX, y, contentAlpha);
  y += 18;
  drawKeyValue(ctx, 'signal peak', view.signalPeakLabel, leftX, y, contentAlpha);
  y += 18;
  drawKeyValue(ctx, 'inhibitor', view.inhibitorLabel, leftX, y, contentAlpha);
  y += 18;
  if (view.wellsVisited != null) {
    drawKeyValue(ctx, 'wells visited', String(view.wellsVisited), leftX, y, contentAlpha);
    y += 18;
  }
  if (view.deathCause) {
    y += 8;
    drawKeyValue(ctx, 'cause', view.deathCause, leftX, y, contentAlpha);
    y += 18;
  }

  y += 18;
  drawSectionLabel(ctx, 'EARNINGS', leftX, y, withAlpha(accent, 0.72 * contentAlpha));
  y += 25;
  drawKeyValue(ctx, 'earned', `${view.emEarned} EM`, leftX, y, contentAlpha);
  y += 18;
  if (view.deathTax > 0) {
    drawKeyValue(ctx, 'tax', `-${view.deathTax} EM`, leftX, y, contentAlpha);
  }

  let ry = panelY + 112;
  drawSectionLabel(ctx, view.cargoTitle, rightX, ry, withAlpha(accent, 0.72 * contentAlpha));
  ry += 24;
  ctx.textAlign = 'left';
  ctx.font = '12px monospace';
  const cargoLines = view.cargoLabels.length > 0 ? view.cargoLabels.slice(0, 6) : ['[ empty ]'];
  for (let i = 0; i < cargoLines.length; i++) {
    ctx.fillStyle = success ? `rgba(225, 232, 220, ${0.85 * contentAlpha})` : `rgba(170, 118, 118, ${0.8 * contentAlpha})`;
    ctx.fillText(cargoLines[i].slice(0, 36), rightX, ry);
    if (!success && cargoLines[i] !== '[ empty ]') {
      ctx.strokeStyle = `rgba(232, 25, 0, ${0.45 * contentAlpha})`;
      ctx.beginPath();
      ctx.moveTo(rightX, ry - 4);
      ctx.lineTo(rightX + Math.min(245, cargoLines[i].length * 7), ry - 4);
      ctx.stroke();
    }
    ry += 18;
  }

  ry += 14;
  const notableLines = [...view.notableLines];
  if (view.aiLines.length > 0) notableLines.push(...view.aiLines);
  drawSectionLabel(ctx, 'NOTABLE', rightX, ry, withAlpha(accent, 0.72 * contentAlpha));
  ry += 24;
  ctx.font = '11px monospace';
  ctx.fillStyle = `rgba(172, 186, 205, ${0.82 * contentAlpha})`;
  const lines = notableLines.length > 0 ? notableLines.slice(0, 5) : ['no unusual telemetry'];
  for (const line of lines) {
    ctx.fillText(String(line).slice(0, 42), rightX, ry);
    ry += 16;
  }

  const promptAlpha = clamp01((reveal - 2.0) * 2);
  if (promptAlpha > 0) {
    const blink = Math.sin(totalTime * 3) > 0 ? 1 : 0.35;
    ctx.textAlign = 'center';
    ctx.font = '16px monospace';
    ctx.fillStyle = `rgba(210, 220, 235, ${(promptAlpha * blink).toFixed(3)})`;
    ctx.fillText('press space to continue', cx, panelY + panelH - 28);
  }

  ctx.restore();
}
