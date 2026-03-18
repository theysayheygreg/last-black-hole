/**
 * hud.js — DOM-based HUD overlay.
 *
 * Three persistent panels: run timer, portal count, salvage count.
 * Center warning system for transient events.
 * All lowercase text, soft glow via text-shadow.
 */

let _hudEl, _timerEl, _portalsEl, _salvageEl, _warningsEl;
let _lastPortalCount = -1;

export function initHUD() {
  _hudEl = document.getElementById('hud');
  _timerEl = document.getElementById('hud-timer');
  _portalsEl = document.getElementById('hud-portals');
  _salvageEl = document.getElementById('hud-salvage');
  _warningsEl = document.getElementById('hud-warnings');
}

export function showHUD() {
  if (_hudEl) _hudEl.style.display = '';
}

export function hideHUD() {
  if (_hudEl) _hudEl.style.display = 'none';
  // Clear warnings on hide
  if (_warningsEl) _warningsEl.innerHTML = '';
}

/**
 * Update HUD panels. Call once per frame during 'playing' phase.
 */
export function updateHUD(runElapsedTime, portalSystem, inventory) {
  if (!_hudEl) return;

  // Timer — mm:ss, color shifts late game
  const mins = Math.floor(runElapsedTime / 60);
  const secs = Math.floor(runElapsedTime % 60);
  const timeStr = `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  _timerEl.textContent = timeStr;

  if (runElapsedTime > 540) {
    _timerEl.style.color = 'rgba(232, 25, 0, 0.9)';
    _timerEl.style.textShadow = '0 0 10px rgba(232, 25, 0, 0.5)';
  } else if (runElapsedTime > 480) {
    _timerEl.style.color = 'rgba(240, 144, 58, 0.9)';
    _timerEl.style.textShadow = '0 0 8px rgba(240, 144, 58, 0.4)';
  } else {
    _timerEl.style.color = '';
    _timerEl.style.textShadow = '';
  }

  // Portal count
  const count = portalSystem ? portalSystem.activeCount : 0;
  if (count !== _lastPortalCount) {
    _portalsEl.textContent = count > 0 ? `◉ ${count} exit${count > 1 ? 's' : ''}` : 'no exits';
    _portalsEl.style.color = count > 0
      ? 'rgba(180, 120, 255, 0.8)'
      : 'rgba(100, 100, 120, 0.5)';
    _lastPortalCount = count;
  }

  // Salvage count
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

  // Start fade-out before removal
  setTimeout(() => {
    el.classList.add('fading');
    setTimeout(() => el.remove(), 500);
  }, durationMs);
}
