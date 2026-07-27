/**
 * hud.js — DOM-based HUD overlay.
 *
 * The HUD is grouped into stable edge rails so values cannot collide at the
 * 1280x800 Deck target. Live world truth remains supplied by the caller.
 *
 * All lowercase text, soft glow via text-shadow.
 */

import { CONFIG } from './config.js';
import { worldToScreen, worldDistance, worldDisplacement } from './coords.js';
import { corruptText, stripCombiningMarks } from './text-corruption.js';
import { UI_COLORS, UI_TIERS } from './ui/design-tokens.js';
import { portalArrowMarkup, setWarningColor } from './ui/hud-primitives.js';
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
  findNearestActivePortal,
  fmtTime,
  getAbilityPresentationState,
  getHullPresentationState,
  getInteractionPresentationState,
  getRouteObjectiveState,
  getSlingshotInteractionState,
} from './ui/hud-presentation.js';

export {
  getAbilityPresentationState,
  getHullPresentationState,
  getInventoryActionAtCursor,
  getInteractionPresentationState,
  getRouteObjectiveState,
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
let _portalArrowEl;
let _warningsEl;
let _signalFillEl, _signalZoneEl;
let _fuelFillEl, _fuelReadoutEl;
let _hullFillEl, _hullReadoutEl;
let _interactionEl, _interactionActionEl, _interactionDetailEl, _interactionCaptionEl;
let _abilitiesEl;
let _ability1El, _ability2El;
let _inhibitorEl, _inhibitorFormEl;
let _lastCollapseStr = '';
let _promptOptions = {};
const INHIBITOR_FORM_NAMES = ['dormant', 'glitch', 'swarm', 'vessel'];

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
  _portalArrowEl = document.getElementById('hud-portal-arrow');
  initHudInventory(document.getElementById('hud-inventory-panel'));
  _warningsEl = document.getElementById('hud-warnings');
  _signalFillEl = document.getElementById('hud-signal-fill');
  _signalZoneEl = document.getElementById('hud-signal-zone');
  _fuelFillEl = document.getElementById('hud-fuel-fill');
  _fuelReadoutEl = document.getElementById('hud-fuel-readout');
  _hullFillEl = document.getElementById('hud-hull-fill');
  _hullReadoutEl = document.getElementById('hud-hull-readout');
  _interactionEl = document.getElementById('hud-interaction');
  _interactionActionEl = document.getElementById('hud-interaction-action');
  _interactionDetailEl = document.getElementById('hud-interaction-detail');
  _interactionCaptionEl = document.getElementById('hud-interaction-caption');
  _abilitiesEl = document.getElementById('hud-abilities');
  _ability1El = document.getElementById('hud-ability1');
  _ability2El = document.getElementById('hud-ability2');
  _inhibitorEl = document.getElementById('hud-inhibitor');
  _inhibitorFormEl = document.getElementById('hud-inhibitor-form');
  renderAbilitySlot(_ability1El, createAbilitySlot('Q', '---', { status: '', ready: false }));
  renderAbilitySlot(_ability2El, createAbilitySlot('R', '---', { status: '', ready: false }));
  void preloadUiAssets().catch(() => {});
}

function textCorruptionConfig() {
  return CONFIG.inhibitor?.textCorruption || {};
}

function inhibitorFormName(form) {
  return INHIBITOR_FORM_NAMES[form] || 'dormant';
}

function getInhibitorHUDState(opts = {}) {
  const state = opts.inhibitorState || null;
  const form = Math.max(0, Math.min(3, Math.floor(Number(state?.form) || 0)));
  const intensity = clamp01(state?.intensity ?? (form > 0 ? 1 : 0));
  const reach = form === 3 ? 1.2 : form === 2 ? 0.9 : 0.6;
  const dist = form > 0 && opts.ship
    ? worldDistance(opts.ship.wx, opts.ship.wy, state.wx, state.wy)
    : Infinity;
  const proximity = Number.isFinite(dist) ? clamp01(1 - dist / reach) : 0;
  return {
    form,
    intensity,
    reach,
    dist,
    proximity,
    corruption: proximity * intensity,
  };
}

function inhibitorTextAmount(inhibitorHud, boost = 1) {
  const cfg = textCorruptionConfig();
  if (!cfg.enabled || !inhibitorHud || inhibitorHud.form <= 0) return 0;

  const base = clamp01(cfg.amount ?? 0);
  const formBoost = inhibitorHud.form === 3
    ? Number(cfg.vesselBoost ?? 1.35)
    : inhibitorHud.form === 2 ? 1.0 : 0.72;
  const proximityScale = clamp01(cfg.proximityScale ?? 0.75);
  const proximityFactor = 0.25 + clamp01(inhibitorHud.proximity * proximityScale) * 0.75;
  return clamp01(base * inhibitorHud.intensity * formBoost * Number(boost || 1) * proximityFactor);
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
  const fillColor = slot.active ? 'rgba(100, 255, 200, 0.72)'
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
    <div class="hud-action-caption">${affordanceCaption(slot.action, slot.active ? 'release' : 'activate', _promptOptions)}</div>
    ${abilityResourceMarkup(slot)}
  `;

  if (el.style.display === 'none') el.style.display = '';
  if (el.className !== className) el.className = className;
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
  const route = getRouteObjectiveState(opts.ship, portalSystem, nextWaveTime, isFinalWave);
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

  // === SIGNAL ===
  if (_signalFillEl && opts.signalLevel !== undefined) {
    const level = opts.signalLevel;
    const zone = opts.signalZone || 'ghost';
    const pct = Math.round(level * 100);
    _signalFillEl.style.width = `${pct}%`;
    _signalFillEl.parentElement?.setAttribute('aria-valuenow', String(pct));

    // Zone-based color
    const zoneColors = {
      ghost:     'rgba(80, 200, 180, 0.7)',   // teal
      whisper:   'rgba(80, 140, 220, 0.8)',   // blue
      presence:  'rgba(210, 180, 60, 0.85)',  // amber
      beacon:    'rgba(230, 140, 40, 0.9)',   // orange
      flare:     'rgba(220, 50, 40, 0.9)',    // red
      threshold: 'rgba(255, 255, 255, 0.95)', // glitch white
    };
    _signalFillEl.style.backgroundColor = zoneColors[zone] || zoneColors.ghost;
    _signalZoneEl.textContent = zone;
    _signalZoneEl.style.color = zoneColors[zone] || zoneColors.ghost;
  }

  // === PROPULSION HEAT ===
  if (_fuelFillEl && (opts.heatRatio !== undefined || opts.fuelRatio !== undefined)) {
    // fuelRatio is a private compatibility input for older local fixtures;
    // the player-facing gauge always renders the inverted value as Heat.
    const ratio = opts.heatRatio !== undefined
      ? Math.max(0, Math.min(1, opts.heatRatio))
      : 1 - Math.max(0, Math.min(1, opts.fuelRatio));
    const pct = Math.round(ratio * 100);
    _fuelFillEl.style.width = `${pct}%`;
    _fuelFillEl.parentElement?.setAttribute('aria-valuenow', String(pct));
    // Heat shifts from cool cyan to amber/red as propulsion approaches lockout.
    let color;
    if (ratio < 0.35)      color = 'rgba(100, 220, 220, 0.9)';
    else if (ratio < 0.7)  color = 'rgba(220, 220, 90, 0.9)';
    else if (ratio < 0.99) color = 'rgba(240, 150, 50, 0.95)';
    else                   color = 'rgba(240, 60, 50, 0.98)';
    _fuelFillEl.style.backgroundColor = color;
    if (_fuelReadoutEl) {
      const overheated = opts.overheated === true || ratio >= 0.999;
      const remaining = Math.max(0, Number(opts.overheatRemaining) || 0);
      _fuelReadoutEl.textContent = overheated && remaining > 0
        ? `${pct}% · locked ${remaining.toFixed(1)}s`
        : `${pct}%`;
      _fuelReadoutEl.style.color = color;
    }
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

  // === INHIBITOR FORM ===
  if (_inhibitorEl && opts.inhibitorState) {
    if (inhibitorHud.form <= 0) {
      _inhibitorEl.style.display = 'none';
      _inhibitorEl.classList.remove('form-vessel');
      setMaybeCorruptedText(_inhibitorFormEl, 'dormant', 0, 'inhibitor-dormant');
    } else {
      _inhibitorEl.style.display = '';
      const cfg = textCorruptionConfig();
      const stateTime = opts.inhibitorState.localTime ?? runElapsedTime;
      const refreshHz = Math.max(1, Number(cfg.refreshHz ?? 5) || 5);
      const textSeed = `form-${inhibitorHud.form}-${Math.floor(stateTime * refreshHz)}`;
      setMaybeCorruptedText(
        _inhibitorFormEl,
        inhibitorFormName(inhibitorHud.form),
        inhibitorTextAmount(inhibitorHud),
        textSeed,
        { maxChars: 24 }
      );
      // Swap the CSS class so the vessel form pulses harder
      if (inhibitorHud.form === 3) {
        _inhibitorEl.classList.add('form-vessel');
      } else {
        _inhibitorEl.classList.remove('form-vessel');
      }
    }
  }

  if (opts.inhibitorState && opts.ship) {
    const form = inhibitorHud.form;
    const corruption = inhibitorHud.corruption;
    if (!reducedMotion && corruption > 0.02) {
      const jitter = 1 + corruption * (form === 3 ? 3 : 2);
      const jx = Math.sin(runElapsedTime * 41.3) * jitter * corruption;
      const jy = Math.cos(runElapsedTime * 33.7) * jitter * corruption;
      _hudEl.style.transform = `translate(${jx.toFixed(1)}px, ${jy.toFixed(1)}px)`;
      _hudEl.style.filter = `hue-rotate(${(corruption * 16).toFixed(1)}deg) saturate(${(1 + corruption * 0.4).toFixed(2)})`;
    } else {
      _hudEl.style.transform = '';
      _hudEl.style.filter = '';
    }
  } else {
    _hudEl.style.transform = '';
    _hudEl.style.filter = '';
  }

  // === HULL ABILITIES ===
  if (_ability1El && opts.abilityState) {
    if (_abilitiesEl) _abilitiesEl.style.display = '';
    const presentation = getAbilityPresentationState(opts.abilityState);
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

  // === PORTAL DIRECTION ARROW ===
  if (opts.ship && portalSystem && _portalArrowEl && opts.canvasW) {
    _updatePortalArrow(opts.ship, portalSystem, opts.camX, opts.camY, opts.canvasW, opts.canvasH);
  }
}

/**
 * Update the portal direction arrow. Points toward nearest active portal
 * when the portal is off-screen.
 */
function _updatePortalArrow(ship, portalSystem, camX, camY, canvasW, canvasH) {
  const nearest = findNearestActivePortal(ship, portalSystem);
  if (!nearest) {
    _portalArrowEl.style.display = 'none';
    return;
  }
  const { portal: nearestPortal, distance: nearestDist } = nearest;

  // Check if portal is on screen
  const [sx, sy] = worldToScreen(nearestPortal.wx, nearestPortal.wy, camX, camY, canvasW, canvasH);
  const margin = 60;
  const onScreen = sx > margin && sx < canvasW - margin && sy > margin && sy < canvasH - margin;

  if (onScreen) {
    _portalArrowEl.style.display = 'none';
    return;
  }

  // Portal is off-screen — show arrow at screen edge pointing toward it
  const [dx, dy] = worldDisplacement(ship.wx, ship.wy, nearestPortal.wx, nearestPortal.wy);
  const angle = Math.atan2(dy, dx);

  // Place arrow at edge of screen in the direction of the portal
  const edgeMargin = 40;
  const cx = canvasW / 2;
  const cy = canvasH / 2;

  // Ray from center at angle, clamped to screen edge
  const cosA = Math.cos(angle);
  const sinA = Math.sin(angle);
  const maxX = (cx - edgeMargin);
  const maxY = (cy - edgeMargin);

  let t = Infinity;
  if (Math.abs(cosA) > 0.001) t = Math.min(t, maxX / Math.abs(cosA));
  if (Math.abs(sinA) > 0.001) t = Math.min(t, maxY / Math.abs(sinA));

  const arrowX = cx + cosA * t;
  const arrowY = cy + sinA * t;

  _portalArrowEl.style.display = '';
  _portalArrowEl.style.left = `${arrowX}px`;
  _portalArrowEl.style.top = `${arrowY}px`;

  // Render arrow as a rotated triangle via CSS border trick
  const deg = (angle * 180 / Math.PI) + 90;  // CSS rotation: 0 = up
  const distText = nearestDist.toFixed(1);
  _portalArrowEl.innerHTML = portalArrowMarkup({
    degrees: deg,
    distanceText: distText,
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
      form: Math.max(1, Math.min(3, Number(options.form ?? 1) || 1)),
      intensity: clamp01(options.intensity ?? 1),
      proximity: clamp01(options.proximity ?? 1),
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
  form = 1,
  intensity = 1,
  durationMs = 3200,
  color = 'rgba(204, 26, 128, 0.95)',
  options = {}
) {
  showWarning(text, color, durationMs, {
    corrupt: true,
    form,
    intensity,
    ...options,
  });
}
