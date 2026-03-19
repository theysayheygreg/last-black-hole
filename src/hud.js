/**
 * hud.js — DOM-based HUD overlay.
 *
 * Two rich panels: universal collapse (left), wormholes (right).
 * Salvage count (bottom-left). Center warning system.
 * All lowercase text, soft glow via text-shadow.
 */

import { CONFIG } from './config.js';

let _hudEl, _collapseTimerEl, _collapseEventEl;
let _portalsStatusEl, _portalsNextEl, _portalsPanel;
let _salvageEl, _warningsEl;
let _lastPortalCount = -1;
let _lastCollapseStr = '';

export function initHUD() {
  _hudEl = document.getElementById('hud');
  _collapseTimerEl = document.getElementById('hud-collapse-timer');
  _collapseEventEl = document.getElementById('hud-collapse-event');
  _portalsStatusEl = document.getElementById('hud-portals-status');
  _portalsNextEl = document.getElementById('hud-portals-next');
  _portalsPanel = document.getElementById('hud-portals');
  _salvageEl = document.getElementById('hud-salvage');
  _warningsEl = document.getElementById('hud-warnings');
}

export function showHUD() {
  if (_hudEl) _hudEl.style.display = '';
}

export function hideHUD() {
  if (_hudEl) _hudEl.style.display = 'none';
  if (_warningsEl) _warningsEl.innerHTML = '';
}

function fmtTime(seconds) {
  const m = Math.floor(Math.max(0, seconds) / 60);
  const s = Math.floor(Math.max(0, seconds) % 60);
  return `${m}:${String(s).padStart(2, '0')}`;
}

/**
 * Update HUD panels. Call once per frame during 'playing' phase.
 */
export function updateHUD(runElapsedTime, portalSystem, inventory, growthTimer) {
  if (!_hudEl) return;

  const runDuration = CONFIG.universe.runDuration;
  const remaining = Math.max(0, runDuration - runElapsedTime);

  // === COLLAPSE TIMER — counts down from 10:00 ===
  const collapseStr = fmtTime(remaining);
  if (collapseStr !== _lastCollapseStr) {
    _collapseTimerEl.textContent = `collapse: ${collapseStr}`;
    _lastCollapseStr = collapseStr;
  }

  // Color shifts: normal → amber at 2min → red at 1min
  const collapsePanel = _collapseTimerEl.parentElement;
  if (remaining <= 60) {
    _collapseTimerEl.style.color = 'rgba(232, 25, 0, 0.95)';
    _collapseTimerEl.style.textShadow = '0 0 12px rgba(232, 25, 0, 0.6)';
    collapsePanel.querySelector('.hud-label').style.color = 'rgba(232, 25, 0, 0.6)';
  } else if (remaining <= 120) {
    _collapseTimerEl.style.color = 'rgba(240, 144, 58, 0.9)';
    _collapseTimerEl.style.textShadow = '0 0 10px rgba(240, 144, 58, 0.5)';
    collapsePanel.querySelector('.hud-label').style.color = 'rgba(200, 120, 50, 0.5)';
  } else {
    _collapseTimerEl.style.color = '';
    _collapseTimerEl.style.textShadow = '';
    collapsePanel.querySelector('.hud-label').style.color = '';
  }

  // Next event: well growth timer
  const growthInterval = CONFIG.events.growthInterval;
  const nextGrowth = growthInterval - (growthTimer % growthInterval);

  // Find next portal wave
  const waves = CONFIG.portals.waves;
  let nextWaveTime = null;
  let nextWaveLabel = '';
  let isFinalWave = false;
  for (let i = 0; i < waves.length; i++) {
    if (waves[i].time > runElapsedTime) {
      nextWaveTime = waves[i].time - runElapsedTime;
      isFinalWave = (i === waves.length - 1);
      nextWaveLabel = isFinalWave ? 'last wormhole' : 'wormhole wave';
      break;
    }
  }

  // Pick whichever event is sooner
  let eventText = '';
  const eventColor = '';
  if (nextWaveTime !== null && nextWaveTime < nextGrowth) {
    eventText = `next: ${nextWaveLabel} ${fmtTime(nextWaveTime)}`;
    if (isFinalWave) {
      _collapseEventEl.style.color = 'rgba(255, 80, 80, 0.8)';
    } else if (nextWaveTime < 10) {
      _collapseEventEl.style.color = 'rgba(200, 180, 100, 0.8)';
    } else {
      _collapseEventEl.style.color = '';
    }
  } else {
    eventText = `next: well growth ${fmtTime(nextGrowth)}`;
    if (nextGrowth < 5) {
      _collapseEventEl.style.color = 'rgba(200, 180, 100, 0.7)';
    } else {
      _collapseEventEl.style.color = '';
    }
  }
  _collapseEventEl.textContent = eventText;

  // === WORMHOLES ===
  const count = portalSystem ? portalSystem.activeCount : 0;

  if (count !== _lastPortalCount) {
    if (count > 0) {
      _portalsStatusEl.textContent = `active wormholes: ${count}`;
      _portalsStatusEl.style.color = 'rgba(180, 120, 255, 0.9)';
    } else {
      _portalsStatusEl.textContent = 'no active wormholes';
      _portalsStatusEl.style.color = 'rgba(100, 80, 140, 0.5)';
    }
    _lastPortalCount = count;
  }

  // Next wave countdown (always show, even with active portals)
  if (nextWaveTime !== null) {
    if (isFinalWave) {
      _portalsNextEl.textContent = `last spawn: ${fmtTime(nextWaveTime)}`;
      _portalsNextEl.style.color = 'rgba(255, 80, 80, 0.8)';
    } else {
      _portalsNextEl.textContent = `next spawn: ${fmtTime(nextWaveTime)}`;
      _portalsNextEl.style.color = '';
    }
  } else {
    // All waves have spawned
    if (count > 0) {
      _portalsNextEl.textContent = 'no more spawns';
      _portalsNextEl.style.color = 'rgba(255, 80, 80, 0.6)';
    } else {
      _portalsNextEl.textContent = 'no way out';
      _portalsNextEl.style.color = 'rgba(255, 40, 40, 0.9)';
    }
  }

  // === SALVAGE ===
  const salvageCount = inventory ? inventory.length : 0;
  _salvageEl.textContent = salvageCount > 0 ? `◈ ${salvageCount} salvage` : '';
}

/**
 * Show a center warning. Auto-dismisses after duration.
 */
export function showWarning(text, color = 'rgba(200, 200, 220, 0.9)', durationMs = 2500) {
  if (!_warningsEl) return;

  const el = document.createElement('div');
  el.className = 'hud-warning';
  el.textContent = text;
  el.style.color = color;
  _warningsEl.appendChild(el);

  setTimeout(() => {
    el.classList.add('fading');
    setTimeout(() => el.remove(), 500);
  }, durationMs);
}
