/**
 * hud.js — DOM-based HUD overlay.
 *
 * The HUD is grouped into stable edge rails so values cannot collide at the
 * 1280x800 Deck target. Live world truth remains supplied by the caller.
 *
 * All lowercase text, soft glow via text-shadow.
 */

import { CONFIG } from './config.js';
import { worldToScreen, worldDisplacement } from './coords.js';
import { corruptText, stripCombiningMarks } from './text-corruption.js';
import { UI_COLORS, UI_TIERS } from './ui/design-tokens.js';
import { setWarningColor } from './ui/hud-primitives.js';
import { actionCaptionMarkup, affordanceCaption, promptLabel, setDeckModeAttribute } from './ui/input-prompts.js';
import { resolveMotionSettings } from './ui/motion.js';
import { preloadUiAssets } from './ui/asset-kit.js';
import {
  getInventoryActionAtCursor,
  initHudInventory,
  inventoryConfirm,
  inventoryCursorDown,
  inventoryCursorUp,
  resetInventoryCursor,
  setDropCallback,
  updateHudInventoryPanel,
} from './ui/hud-inventory.js';
import {
  clamp01,
  createAbilitySlot,
  fmtTime,
  getAbilityPresentationState,
  getHullPresentationState,
  getInteractionPresentationState,
  getRouteObjectiveState,
  getTerminalPresentationState,
  isExfilPortal,
  formatNoiseDetail,
  getSlingshotInteractionState,
} from './ui/hud-presentation.js';

export {
  getAbilityPresentationState,
  getHullPresentationState,
  getInventoryActionAtCursor,
  getInteractionPresentationState,
  getRouteObjectiveState,
  getTerminalPresentationState,
  isExfilPortal,
  formatNoiseDetail,
  getSlingshotInteractionState,
  inventoryConfirm,
  inventoryCursorDown,
  inventoryCursorUp,
  resetInventoryCursor,
  setDropCallback,
};

let _hudEl;
let _collapseTimerEl, _collapseEventEl;
let _portalsStatusEl, _portalsNextEl;
let _salvageCountEl, _salvageValueEl;
let _scavengersCountEl, _scavengersSub;
let _pulseEl;
let _signatureEl;
let _warningsEl;
let _noiseReadoutEl, _noiseDetailEl;
let _hullFillEl, _hullReadoutEl;
let _interactionEl, _interactionActionEl, _interactionDetailEl, _interactionCaptionEl;
let _abilitiesEl;
let _ability1El, _ability2El;
let _inhibitorEl, _inhibitorSummaryEl;
let _lastCollapseStr = '';
let _promptOptions = {};

export function initHUD() {
  _hudEl = document.getElementById('hud');
  _collapseTimerEl = document.getElementById('hud-collapse-timer');
  _collapseEventEl = document.getElementById('hud-collapse-event');
  _portalsStatusEl = document.getElementById('hud-portals-status');
  _portalsNextEl = document.getElementById('hud-portals-next');
  _salvageCountEl = document.getElementById('hud-salvage-count');
  _salvageValueEl = document.getElementById('hud-salvage-value');
  _scavengersCountEl = document.getElementById('hud-scavengers-count');
  _scavengersSub = document.getElementById('hud-scavengers-sub');
  _pulseEl = document.getElementById('hud-pulse');
  _signatureEl = document.getElementById('hud-signature');
  initHudInventory(document.getElementById('hud-inventory-panel'));
  _warningsEl = document.getElementById('hud-warnings');
  _noiseReadoutEl = document.getElementById('hud-noise-readout');
  _noiseDetailEl = document.getElementById('hud-noise-detail');
  _hullFillEl = document.getElementById('hud-hull-fill');
  _hullReadoutEl = document.getElementById('hud-hull-readout');
  _interactionEl = document.getElementById('hud-interaction');
  _interactionActionEl = document.getElementById('hud-interaction-action');
  _interactionDetailEl = document.getElementById('hud-interaction-detail');
  _interactionCaptionEl = document.getElementById('hud-interaction-caption');
  _abilitiesEl = document.getElementById('hud-abilities');
  _ability1El = document.getElementById('hud-ability1');
  _ability2El = document.getElementById('hud-ability2');
  _inhibitorEl = document.getElementById('hud-ecology');
  _inhibitorSummaryEl = document.getElementById('hud-ecology-summary');
  renderAbilitySlot(_ability1El, createAbilitySlot('Q', '---', { status: '', ready: false }));
  renderAbilitySlot(_ability2El, createAbilitySlot('R', '---', { status: '', ready: false }));
  void preloadUiAssets().catch(() => {});
}

function textCorruptionConfig() {
  return CONFIG.inhibitor?.textCorruption || {};
}

function getInhibitorHUDState(opts = {}) {
  const state = opts.inhibitorState || null;
  const entities = Array.isArray(state?.entities) ? state.entities : [];
  const active = entities.filter((entity) => entity.lifecycle !== 'expired');
  const counts = active.reduce((result, entity) => {
    const kind = String(entity.kind || 'threat').toUpperCase();
    result[kind] = (result[kind] || 0) + 1;
    return result;
  }, {});
  const intensity = active.reduce((max, entity) => Math.max(max, clamp01(entity.intensity)), 0);
  return {
    intensity,
    count: active.length,
    counts,
    corruption: intensity,
  };
}

function inhibitorTextAmount(inhibitorHud, boost = 1) {
  const cfg = textCorruptionConfig();
  if (!cfg.enabled || !inhibitorHud || inhibitorHud.count <= 0) return 0;

  const base = clamp01(cfg.amount ?? 0);
  return clamp01(base * inhibitorHud.intensity * Number(boost || 1));
}

function textCorruptionOptions(maxChars = 160) {
  const cfg = textCorruptionConfig();
  return {
    density: cfg.density,
    maxMarks: cfg.maxMarks,
    maxChars,
    preserveDigits: cfg.preserveDigits !== false,
  };
}

function setMaybeCorruptedText(el, text, corruption, seed, options = {}) {
  if (!el) return;
  const cleanText = stripCombiningMarks(text);
  const amount = clamp01(corruption);
  if (amount > 0.02) {
    el.textContent = corruptText(cleanText, amount, seed, {
      ...textCorruptionOptions(options.maxChars),
      ...options,
    });
    el.classList.add('hud-zalgo');
    el.dataset.plainText = cleanText;
  } else {
    el.textContent = cleanText;
    el.classList.remove('hud-zalgo');
    delete el.dataset.plainText;
  }
}

export function showHUD() {
  if (_hudEl) {
    _hudEl.style.display = '';
    _hudEl.style.opacity = '';
    _hudEl.style.transition = '';
    delete _hudEl.dataset.terminalPhase;
  }
}

export function hideHUD() {
  if (_hudEl) {
    _hudEl.style.display = 'none';
    _hudEl.style.opacity = '';
    _hudEl.style.transition = '';
  }
  if (_warningsEl) _warningsEl.innerHTML = '';
}

export function clearHUDForTerminal(outcome = 'dead') {
  if (!_hudEl) return;
  const terminal = getTerminalPresentationState(outcome);
  _hudEl.dataset.terminalPhase = terminal.outcome;
  if (_interactionEl) {
    _interactionEl.style.display = 'none';
    _interactionActionEl.textContent = '';
    _interactionDetailEl.textContent = '';
    _interactionCaptionEl.innerHTML = '';
  }
  if (terminal.abilities && _ability1El) {
    if (_abilitiesEl) _abilitiesEl.style.display = '';
    const hullType = _ability1El.dataset.hullType || 'drifter';
    const presentation = getAbilityPresentationState({ hullType, inert: true, terminal: true });
    renderAbilitySlot(_ability1El, presentation.slots[0]);
    if (presentation.slots[1]) renderAbilitySlot(_ability2El, presentation.slots[1]);
    else if (_ability2El) _ability2El.style.display = 'none';
  }
}

/**
 * Fade the HUD during the death linger. Pass 0..1. The HUD stays
 * mounted (display: '') but its opacity tracks the caller's linger
 * fraction. Called every frame during the dead/escaped phases so the
 * HUD dims in sync with the world overlay.
 */
export function fadeHUD(opacity) {
  if (!_hudEl) return;
  const clamped = Math.max(0, Math.min(1, opacity));
  _hudEl.style.display = '';
  _hudEl.style.opacity = clamped.toFixed(3);
  _hudEl.style.transition = 'opacity 0.1s linear';
}

function abilityResourceMarkup(slot) {
  if (slot.charges != null) {
    const charges = Math.max(0, Math.min(4, slot.charges));
    const pips = [];
    for (let i = 0; i < Math.max(1, charges || 1); i++) {
      const lit = i < charges;
      pips.push(`<span style="display:inline-block;width:4px;height:4px;margin-right:2px;border:1px solid ${lit ? 'rgba(120, 230, 180, 0.75)' : 'rgba(120, 140, 160, 0.3)'};background:${lit ? 'rgba(120, 230, 180, 0.45)' : 'transparent'};"></span>`);
    }
    return `<span class="hud-ability-pips" aria-hidden="true">${pips.join('')}</span>`;
  }
  if (slot.resourceLabel) {
    return `<span class="hud-ability-meter-label">${slot.resourceLabel}</span>`;
  }
  return '';
}

function renderAbilitySlot(el, slot) {
  if (!el || !slot) return;
  const fillColor = slot.inert ? 'rgba(120, 135, 150, 0.28)' : slot.active ? 'rgba(100, 255, 200, 0.72)'
    : slot.ready ? 'rgba(180, 200, 220, 0.52)'
    : 'rgba(200, 160, 80, 0.48)';
  const className = `hud-ability ${slot.tone}`;
  const html = `
    <div class="hud-ability-line">
      <span class="hud-ability-name">${slot.name}</span>
      <span class="hud-ability-status">${slot.status}</span>
    </div>
    <div class="hud-ability-detail">${slot.detail}</div>
    <div class="hud-ability-meter">
      <div class="hud-ability-meter-fill" style="width:${Math.round(slot.meter * 100)}%;background:${fillColor};box-shadow:0 0 5px ${fillColor};"></div>
    </div>
    <div class="hud-action-caption">${slot.inert ? 'inert' : affordanceCaption(slot.action, slot.active ? 'release' : 'activate', _promptOptions)}</div>
    ${abilityResourceMarkup(slot)}
  `;

  if (el.style.display === 'none') el.style.display = '';
  if (el.className !== className) el.className = className;
  el.toggleAttribute('aria-disabled', Boolean(slot.inert));
  if (slot.inert) el.dataset.inert = 'true';
  else delete el.dataset.inert;
  if (el.dataset.renderKey !== html) {
    el.innerHTML = html;
    el.dataset.renderKey = html;
  }
}

/**
 * Update HUD panels. Call once per frame during 'playing' phase.
 *
 * @param {number} runElapsedTime
 * @param {PortalSystem} portalSystem
 * @param {Array} inventory
 * @param {number} growthTimer
 * @param {Object} opts - additional data for new HUD panels
 * @param {Object} opts.scavengerSystem
 * @param {Object} opts.combatSystem
 * @param {Object} opts.signature - current cosmic signature
 * @param {Object} opts.ship - player ship {wx, wy}
 * @param {number} opts.camX
 * @param {number} opts.camY
 * @param {number} opts.canvasW
 * @param {number} opts.canvasH
 */
export function updateHUD(runElapsedTime, portalSystem, inventory, growthTimer, opts = {}) {
  if (!_hudEl) return;
  _promptOptions = { lastInputSource: opts.lastInputSource, deck: opts.deckMode };
  setDeckModeAttribute(_hudEl, _promptOptions);
  const motion = resolveMotionSettings(CONFIG.ui?.motion || {});
  const reducedMotion = opts.reducedMotion ?? motion.reducedMotion;
  _hudEl.dataset.reducedMotion = reducedMotion ? 'true' : 'false';

  const runDuration = CONFIG.universe.runDuration;
  const remaining = Math.max(0, runDuration - runElapsedTime);

  // === COLLAPSE TIMER ===
  const collapseStr = fmtTime(remaining);
  if (collapseStr !== _lastCollapseStr) {
    _collapseTimerEl.textContent = collapseStr;
    _lastCollapseStr = collapseStr;
  }

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

  // Next event
  const growthInterval = CONFIG.events.growthInterval;
  const nextGrowth = growthInterval - (growthTimer % growthInterval);

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

  let eventText = '';
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

  // === ROUTE OBJECTIVE ===
  const route = getRouteObjectiveState(
    opts.ship,
    portalSystem,
    nextWaveTime,
    isFinalWave,
    opts.routeDiscovery,
  );
  _portalsStatusEl.textContent = route.label;
  _portalsNextEl.textContent = route.detail;
  _portalsStatusEl.dataset.tone = route.tone;
  _portalsNextEl.dataset.tone = route.tone;

  // === CARGO (count/max + total value) ===
  const inv = opts.inventorySystem;
  if (inv) {
    const count = inv.cargoCount;
    const max = inv.cargoMax;
    const inventoryCaption = affordanceCaption('inventory', count > 0 ? 'inventory' : 'salvage', _promptOptions);
    _salvageCountEl.textContent = count > 0 ? `◈ cargo ${count}/${max}` : `◈ cargo 0/${max}`;
    if (count > 0) {
      const totalValue = inv.getCargoValue();
      _salvageValueEl.innerHTML = `<span>value ${totalValue}</span><span class="hud-action-caption">${inventoryCaption}</span>`;
    } else {
      _salvageValueEl.innerHTML = `<span class="hud-action-caption">${inventoryCaption}</span>`;
    }
    // Warn when nearly full
    if (count >= max) {
      _salvageCountEl.style.color = 'rgba(255, 100, 80, 0.9)';
    } else if (count >= max - 1) {
      _salvageCountEl.style.color = 'rgba(240, 180, 60, 0.9)';
    } else {
      _salvageCountEl.style.color = '';
    }
  }

  // === SCAVENGERS ===
  if (opts.scavengerSystem && _scavengersCountEl) {
    const scavs = opts.scavengerSystem.scavengers;
    const alive = scavs.filter(s => s.alive && s.state !== 'dying').length;
    if (alive > 0) {
      _scavengersCountEl.textContent = `scavengers: ${alive}`;
      _scavengersSub.textContent = '';
    } else {
      _scavengersCountEl.textContent = 'no scavengers';
      _scavengersSub.textContent = '';
    }
  }

  // === PULSE STATUS ===
  if (opts.combatSystem && _pulseEl) {
    const actionCaption = affordanceCaption('pulse', 'activate', _promptOptions);
    if (opts.combatSystem.playerReady) {
      _pulseEl.innerHTML = `<div class="hud-command-label">force pulse</div><div class="hud-command-state">ready</div><div class="hud-action-caption">${actionCaption}</div>`;
      _pulseEl.className = 'hud-command ready';
    } else {
      const cd = opts.combatSystem.playerCooldown;
      _pulseEl.innerHTML = `<div class="hud-command-label">force pulse</div><div class="hud-command-state">${cd.toFixed(1)}s</div><div class="hud-action-caption">${actionCaption}</div>`;
      _pulseEl.className = 'hud-command';
    }
  }

  // === NOISE RADIUS ===
  if (_noiseReadoutEl && opts.noise) {
    const noise = opts.noise;
    const radius = Math.max(0, Number(noise.audibleRadiusMeters) || 0);
    const trend = String(noise.trend || 'steady').toUpperCase();
    _noiseReadoutEl.textContent = `NOISE ${Math.round(radius)}m · ${trend}`;
    _noiseDetailEl.textContent = formatNoiseDetail(noise);
    _noiseReadoutEl.style.color = radius > 0 ? 'rgba(80, 220, 220, 0.92)' : 'rgba(120, 160, 180, 0.72)';
  }

  // === HULL ===
  if (_hullFillEl && _hullReadoutEl) {
    const hull = getHullPresentationState(opts.hullState, opts.ship);
    _hullFillEl.style.width = `${Math.round(hull.ratio * 100)}%`;
    _hullFillEl.parentElement?.setAttribute('aria-valuenow', String(Math.round(hull.ratio * 100)));
    _hullReadoutEl.textContent = hull.label;
    _hullReadoutEl.dataset.tone = hull.tone;
    _hullFillEl.dataset.tone = hull.tone;
  }

  // === CONTEXTUAL INTERACTION ===
  if (_interactionEl) {
    const interaction = getInteractionPresentationState(opts.interaction, _promptOptions);
    if (!interaction) {
      _interactionEl.style.display = 'none';
    } else {
      _interactionEl.style.display = '';
      _interactionActionEl.textContent = interaction.label;
      _interactionDetailEl.textContent = interaction.detail;
      _interactionCaptionEl.innerHTML = interaction.caption || '';
    }
  }

  const inhibitorHud = getInhibitorHUDState(opts);

  // === ACCUMULATED ECOLOGY ===
  if (_inhibitorEl && opts.inhibitorState) {
    if (inhibitorHud.count <= 0) {
      _inhibitorEl.style.display = 'none';
    } else {
      _inhibitorEl.style.display = '';
      const summary = Object.entries(inhibitorHud.counts)
        .map(([kind, count]) => `${kind} ${count}`)
        .join(' · ');
      _inhibitorSummaryEl.textContent = `${summary} · PHASE ${Math.max(0, Number(opts.inhibitorState.phase) || 0)}`;
    }
  }

  // Ecology keeps its slower world pulse; the HUD stays still so threat
  // language remains readable instead of stacking a second global motion.
  _hudEl.style.transform = '';
  _hudEl.style.filter = '';

  // === HULL ABILITIES ===
  if (_ability1El && opts.abilityState) {
    if (_abilitiesEl) _abilitiesEl.style.display = '';
    const presentation = getAbilityPresentationState(opts.abilityState);
    _ability1El.dataset.hullType = presentation.hull;
    renderAbilitySlot(_ability1El, presentation.slots[0]);
    if (presentation.slots[1]) {
      renderAbilitySlot(_ability2El, presentation.slots[1]);
    } else {
      _ability2El.style.display = 'none';
    }
  } else if (_ability1El) {
    if (_abilitiesEl) _abilitiesEl.style.display = 'none';
    renderAbilitySlot(_ability1El, createAbilitySlot('Q', '---', { status: '', ready: false }));
    renderAbilitySlot(_ability2El, createAbilitySlot('R', '---', { status: '', ready: false }));
  }

  // === SIGNATURE ===
  if (opts.signature && _signatureEl) {
    _signatureEl.textContent = `[${opts.signature.name}]`;
  }

  // === INVENTORY PANEL (Tab toggle) ===
  updateHudInventoryPanel(inv, {
    open: opts.inventoryOpen,
    promptOptions: _promptOptions,
  });

}

/**
 * Add an event to the events log panel (left side, fades by age).
 * Replaces the old center-screen warning system.
 * Max 8 visible entries — oldest removed when full.
 */
export function showWarning(text, color = 'rgba(200, 200, 220, 0.9)', durationMs = 4000, options = {}) {
  if (!_warningsEl) return;

  // Cap visible entries
  while (_warningsEl.children.length >= 8) {
    _warningsEl.removeChild(_warningsEl.firstChild);
  }

  const el = document.createElement('div');
  el.className = 'hud-warning';
  if (options.corrupt) {
    const warningBoost = Number(textCorruptionConfig().warningBoost ?? 1.15) || 1;
    const corruption = inhibitorTextAmount({
      intensity: clamp01(options.intensity ?? 1),
      count: 1,
    }, warningBoost * Number(options.boost ?? 1));
    setMaybeCorruptedText(
      el,
      text,
      corruption,
      options.seed ?? `warning-${Date.now()}-${_warningsEl.children.length}`,
      { maxChars: options.maxChars ?? 96 }
    );
  } else if (options.action) {
    el.textContent = stripCombiningMarks(text);
    el.insertAdjacentHTML('beforeend', ` ${actionCaptionMarkup(options.action.actionId, options.actionVerb, {
      ...options.action,
      mode: options.action.inputFamily,
    })}`);
  } else {
    el.textContent = stripCombiningMarks(text);
  }
  setWarningColor(el, color);
  _warningsEl.appendChild(el);

  setTimeout(() => {
    el.classList.add('fading');
    setTimeout(() => el.remove(), 1000);
  }, durationMs);
}

export function showInhibitorWarning(
  text,
  _kind = 'threat',
  intensity = 1,
  durationMs = 3200,
  color = 'rgba(204, 26, 128, 0.95)',
  options = {}
) {
  showWarning(text, color, durationMs, {
    corrupt: true,
    intensity,
    ...options,
  });
}
