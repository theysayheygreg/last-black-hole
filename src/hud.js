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
import { inventoryItemColor, inventorySelectionStyle, portalArrowMarkup, setWarningColor } from './ui/hud-primitives.js';
import { actionCaptionMarkup, actionDescriptor, actionGlyphMarkup, affordanceCaption, inventoryHint, promptLabel, setDeckModeAttribute } from './ui/input-prompts.js';
import { resolveMotionSettings } from './ui/motion.js';
import { itemIconMarkup, preloadInventoryIcons, preloadUiAssets } from './ui/asset-kit.js';

let _hudEl;
let _collapseTimerEl, _collapseEventEl;
let _portalsStatusEl, _portalsNextEl;
let _salvageCountEl, _salvageValueEl;
let _scavengersCountEl, _scavengersSub;
let _pulseEl;
let _signatureEl;
let _portalArrowEl;
let _inventoryPanelEl;
let _warningsEl;
let _signalFillEl, _signalZoneEl;
let _fuelFillEl, _fuelReadoutEl;
let _hullFillEl, _hullReadoutEl;
let _interactionEl, _interactionActionEl, _interactionDetailEl, _interactionCaptionEl;
let _abilitiesEl;
let _ability1El, _ability2El;
let _inhibitorEl, _inhibitorFormEl;
let _dropCallback = null;  // set by main.js for drop handling
let _lastCollapseStr = '';
let _promptOptions = {};
const INHIBITOR_FORM_NAMES = ['dormant', 'glitch', 'swarm', 'vessel'];

// Inventory selection state
let _invCursor = 0;          // which slot is selected (0-7 = cargo, 8-9 = equipped, 10-11 = consumable)
let _invTotalSlots = 12;     // 8 cargo + 2 equip + 2 consumable

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
  _inventoryPanelEl = document.getElementById('hud-inventory-panel');
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
  renderAbilitySlot(_ability1El, abilitySlot('Q', '---', { status: '', ready: false }));
  renderAbilitySlot(_ability2El, abilitySlot('R', '---', { status: '', ready: false }));
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

function fmtTime(seconds) {
  const m = Math.floor(Math.max(0, seconds) / 60);
  const s = Math.floor(Math.max(0, seconds) % 60);
  return `${m}:${String(s).padStart(2, '0')}`;
}

function fmtSeconds(seconds) {
  return `${Math.ceil(Math.max(0, seconds || 0))}s`;
}

function clamp01(value) {
  const numeric = Number(value);
  return Math.max(0, Math.min(1, Number.isFinite(numeric) ? numeric : 0));
}

function abilityTone(slot) {
  if (slot?.active) return 'active';
  if (slot?.ready) return 'ready';
  return 'cooldown';
}

function cooldownMeter(cooldown, max) {
  if (!cooldown || cooldown <= 0) return 0;
  return clamp01(1 - cooldown / Math.max(1, max || cooldown));
}

function abilitySlot(key, name, state) {
  const slot = {
    key,
    action: state.action || (key === 'R' ? 'ability2' : 'ability1'),
    name,
    status: state.status || '',
    ready: Boolean(state.ready),
    active: Boolean(state.active),
    cooldown: Math.max(0, state.cooldown || 0),
    detail: state.detail || '',
    resourceLabel: state.resourceLabel || '',
    resource: state.resource ?? null,
    charges: state.charges ?? null,
    meter: clamp01(state.meter ?? (state.ready || state.active ? 1 : 0)),
  };
  slot.tone = abilityTone(slot);
  return slot;
}

export function getAbilityPresentationState(abilityState = {}) {
  const as = abilityState || {};
  const hull = as.hullType || 'drifter';
  const slots = [];

  if (hull === 'drifter') {
    const flowActive = Boolean(as.flowLockActive);
    const cooldown = Math.max(0, as.eddyBrakeCooldown || 0);
    slots.push(abilitySlot('Q', flowActive ? 'flow lock' : 'eddy brake', {
      status: flowActive ? 'surf locked' : cooldown > 0 ? `brake ${fmtSeconds(cooldown)}` : 'brake ready',
      active: flowActive,
      ready: cooldown <= 0,
      cooldown,
      detail: flowActive ? 'current alignment holding' : 'instant stop + wake turbulence',
      meter: cooldown > 0 ? cooldownMeter(cooldown, 20) : 1,
    }));
  } else if (hull === 'breacher') {
    const fuelMax = 30;
    const fuel = Math.max(0, as.burnFuel || 0);
    const active = Boolean(as.burnActive);
    slots.push(abilitySlot('Q', 'burn', {
      status: active ? `burning ${fmtSeconds(fuel)}` : fuel > 1 ? `fuel ${Math.ceil(fuel)}/${fuelMax}` : 'fuel dry',
      active,
      ready: !active && fuel > 1,
      cooldown: 0,
      detail: active ? 'thrust spike, loud signal' : 'hold fuel for a line break',
      resourceLabel: 'fuel',
      resource: fuel,
      meter: clamp01(fuel / fuelMax),
    }));
  } else if (hull === 'resonant') {
    const tapCooldown = Math.max(0, as.tapCooldown || 0);
    const shiftCooldown = Math.max(0, as.frequencyShiftCooldown || 0);
    slots.push(abilitySlot('Q', 'tap', {
      status: as.tapAnchor ? 'anchor set' : tapCooldown > 0 ? `anchor ${fmtSeconds(tapCooldown)}` : 'anchor ready',
      active: Boolean(as.tapAnchor),
      ready: tapCooldown <= 0,
      cooldown: tapCooldown,
      detail: as.tapAnchor ? 'pulse space keyed to anchor' : 'place a resonance anchor',
      meter: tapCooldown > 0 ? cooldownMeter(tapCooldown, 15) : 1,
    }));
    slots.push(abilitySlot('R', 'shift', {
      status: as.nextPulseInverted ? 'pulse inverted' : shiftCooldown > 0 ? `shift ${fmtSeconds(shiftCooldown)}` : 'shift ready',
      active: Boolean(as.nextPulseInverted),
      ready: shiftCooldown <= 0,
      cooldown: shiftCooldown,
      detail: 'invert next harmonic pulse',
      meter: shiftCooldown > 0 ? cooldownMeter(shiftCooldown, 45) : 1,
    }));
  } else if (hull === 'shroud') {
    const cloakCooldown = Math.max(0, as.wakeCloakCooldown || 0);
    const decoyCooldown = Math.max(0, as.decoyCooldown || 0);
    const decoyCharges = Math.max(0, as.decoyCharges || 0);
    slots.push(abilitySlot('Q', 'cloak', {
      status: as.ghostTrailActive ? 'ghost wake' : cloakCooldown > 0 ? `cloak ${fmtSeconds(cloakCooldown)}` : 'cloak ready',
      active: Boolean(as.ghostTrailActive),
      ready: cloakCooldown <= 0,
      cooldown: cloakCooldown,
      detail: 'drop a signal zone when exposed',
      meter: cloakCooldown > 0 ? cooldownMeter(cloakCooldown, 30) : 1,
    }));
    slots.push(abilitySlot('R', 'decoy', {
      status: decoyCooldown > 0 ? `${decoyCharges} charge ${fmtSeconds(decoyCooldown)}` : `${decoyCharges} charge${decoyCharges === 1 ? '' : 's'}`,
      active: Array.isArray(as.decoys) && as.decoys.length > 0,
      ready: decoyCharges > 0 && decoyCooldown <= 0,
      cooldown: decoyCooldown,
      charges: decoyCharges,
      detail: 'throw a false signal body',
      meter: decoyCooldown > 0 ? cooldownMeter(decoyCooldown, 60) : (decoyCharges > 0 ? 1 : 0),
    }));
  } else if (hull === 'hauler') {
    const tagCharges = Math.max(0, as.salvageLockCharges || 0);
    const tractorCooldown = Math.max(0, as.tractorCooldown || 0);
    const tractorActive = (as.tractorChannelTimer || 0) > 0;
    slots.push(abilitySlot('Q', 'tag', {
      status: `${tagCharges} lock${tagCharges === 1 ? '' : 's'}`,
      active: false,
      ready: tagCharges > 0,
      cooldown: 0,
      charges: tagCharges,
      detail: 'mark nearest salvage for bonus yield',
      meter: tagCharges > 0 ? 1 : 0,
    }));
    slots.push(abilitySlot('R', 'tractor', {
      status: tractorActive ? `channel ${fmtSeconds(as.tractorChannelTimer || 0)}` : tractorCooldown > 0 ? `tractor ${fmtSeconds(tractorCooldown)}` : 'tractor ready',
      active: tractorActive,
      ready: tractorCooldown <= 0,
      cooldown: tractorCooldown,
      detail: tractorActive ? 'pull field engaged' : 'pull nearest salvage body',
      meter: tractorActive ? clamp01((as.tractorChannelTimer || 0) / 3) : tractorCooldown > 0 ? cooldownMeter(tractorCooldown, 25) : 1,
    }));
  } else {
    slots.push(abilitySlot('Q', 'ability', { status: 'unknown hull', ready: false }));
  }

  return { hull, slots };
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

function nearestActivePortal(ship, portalSystem) {
  if (!ship || !portalSystem?.portals) return null;
  let nearest = null;
  for (const portal of portalSystem.portals) {
    if (!portal?.alive || portal.blockedByInhibitor) continue;
    const distance = worldDistance(ship.wx, ship.wy, portal.wx, portal.wy);
    if (!nearest || distance < nearest.distance) nearest = { portal, distance };
  }
  return nearest;
}

export function getRouteObjectiveState(ship, portalSystem, nextWaveTime = null, isFinalWave = false) {
  const count = portalSystem?.activeCount || 0;
  const nearest = nearestActivePortal(ship, portalSystem);
  if (nearest) {
    return {
      count,
      tone: 'active',
      label: `aperture ${nearest.distance.toFixed(1)}`,
      detail: `${count} active · enter cyan aperture`,
      nearest,
    };
  }
  if (nextWaveTime != null) {
    return {
      count: 0,
      tone: isFinalWave ? 'critical' : 'waiting',
      label: isFinalWave ? 'final aperture inbound' : 'aperture inbound',
      detail: `${fmtTime(nextWaveTime)} until route opens`,
      nearest: null,
    };
  }
  return { count: 0, tone: 'critical', label: 'route closed', detail: 'no extraction aperture', nearest: null };
}

export function getHullPresentationState(hullState = {}, ship = null) {
  const status = String(hullState.status || ship?.status || 'nominal').toLowerCase();
  const shielded = Boolean(hullState.shielded || hullState.shieldCharges > 0);
  const grace = Math.max(0, Number(hullState.graceRemaining) || 0);
  const ratio = clamp01(hullState.ratio ?? (status === 'dead' ? 0 : 1));
  if (shielded) return { ratio, label: 'shielded', tone: 'shielded' };
  if (grace > 0) return { ratio, label: `impact ${grace.toFixed(1)}s`, tone: 'critical' };
  if (status === 'dead' || status === 'critical') return { ratio, label: status, tone: 'critical' };
  return { ratio, label: status === 'alive' ? 'nominal' : status, tone: ratio < 0.35 ? 'critical' : 'nominal' };
}

export function getInteractionPresentationState(interaction, promptOptions = {}) {
  if (!interaction || interaction.visible === false) return null;
  const action = interaction.action || 'confirm';
  const label = String(interaction.label || 'confirm interaction');
  const detail = String(interaction.detail || 'hold position');
  const verb = String(interaction.verb || 'confirm');
  return { action, label, detail, caption: affordanceCaption(action, verb, promptOptions) };
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
    _salvageCountEl.textContent = count > 0 ? `◈ cargo ${count}/${max}` : `◈ cargo 0/${max}`;
    if (count > 0) {
      const totalValue = inv.getCargoValue();
      _salvageValueEl.innerHTML = `<span>value ${totalValue}</span><span class="hud-action-caption">${affordanceCaption('inventory', 'inventory', _promptOptions)}</span>`;
    } else {
      _salvageValueEl.innerHTML = `<span>hold space for salvage</span><span class="hud-action-caption">${affordanceCaption('inventory', 'inventory', _promptOptions)}</span>`;
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

  // === FUEL (delta-v) ===
  if (_fuelFillEl && opts.fuelRatio !== undefined) {
    const ratio = Math.max(0, Math.min(1, opts.fuelRatio));
    const pct = Math.round(ratio * 100);
    _fuelFillEl.style.width = `${pct}%`;
    _fuelFillEl.parentElement?.setAttribute('aria-valuenow', String(pct));
    // Threshold-based color: green → yellow → orange → red as the gauge
    // empties. Players see the cost climbing before they hit the wall.
    let color;
    if (ratio > 0.6)      color = 'rgba(120, 220, 140, 0.9)';   // green
    else if (ratio > 0.3) color = 'rgba(220, 200, 80, 0.9)';    // yellow
    else if (ratio > 0.1) color = 'rgba(230, 140, 40, 0.95)';   // orange
    else                  color = 'rgba(220, 60, 40, 0.95)';    // red
    _fuelFillEl.style.backgroundColor = color;
    if (_fuelReadoutEl) {
      _fuelReadoutEl.textContent = `${pct}%`;
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
      _interactionCaptionEl.textContent = interaction.caption;
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
    renderAbilitySlot(_ability1El, abilitySlot('Q', '---', { status: '', ready: false }));
    renderAbilitySlot(_ability2El, abilitySlot('R', '---', { status: '', ready: false }));
  }

  // === SIGNATURE ===
  if (opts.signature && _signatureEl) {
    _signatureEl.textContent = `[${opts.signature.name}]`;
  }

  // === INVENTORY PANEL (Tab toggle) ===
  if (_inventoryPanelEl && inv) {
    if (opts.inventoryOpen) {
      _inventoryPanelEl.classList.add('open');
      _renderInventoryPanel(inv);
    } else {
      _inventoryPanelEl.classList.remove('open');
    }
  }

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
  // Find nearest active portal
  let nearestDist = Infinity;
  let nearestPortal = null;
  for (const portal of portalSystem.portals) {
    if (!portal.alive || portal.blockedByInhibitor) continue;
    const dist = worldDistance(ship.wx, ship.wy, portal.wx, portal.wy);
    if (dist < nearestDist) {
      nearestDist = dist;
      nearestPortal = portal;
    }
  }

  if (!nearestPortal) {
    _portalArrowEl.style.display = 'none';
    return;
  }

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
 * Set callback for when player drops from inventory.
 * @param {function(slotIndex: number)} fn
 */
export function setDropCallback(fn) {
  _dropCallback = fn;
}

/** Reset inventory cursor to slot 0. Call when inventory opens. */
export function resetInventoryCursor() {
  _invCursor = 0;
}

/** Move inventory cursor up. */
export function inventoryCursorUp() {
  _invCursor = (_invCursor - 1 + _invTotalSlots) % _invTotalSlots;
}

/** Move inventory cursor down. */
export function inventoryCursorDown() {
  _invCursor = (_invCursor + 1) % _invTotalSlots;
}

export function getInventoryActionAtCursor(inv) {
  if (!inv) return null;

  if (_invCursor < 8) {
    const item = inv.cargo[_invCursor];
    if (!item) return null;

    if (item.subcategory === 'equippable') {
      const openSlot = inv.equipped.indexOf(null);
      return {
        type: 'equipCargo',
        cargoSlot: _invCursor,
        equipSlot: openSlot !== -1 ? openSlot : 0,
      };
    }

    if (item.subcategory === 'consumable') {
      const openSlot = inv.consumables.indexOf(null);
      return {
        type: 'loadConsumable',
        cargoSlot: _invCursor,
        consumableSlot: openSlot !== -1 ? openSlot : 0,
      };
    }

    return {
      type: 'dropCargo',
      cargoSlot: _invCursor,
    };
  }

  if (_invCursor < 10) {
    const equipIdx = _invCursor - 8;
    const item = inv.equipped[equipIdx];
    if (item && !inv.cargoFull) {
      return {
        type: 'unequip',
        equipSlot: equipIdx,
      };
    }
    return null;
  }

  const consumableIdx = _invCursor - 10;
  const item = inv.consumables[consumableIdx];
  if (item && !inv.cargoFull) {
    return {
      type: 'unloadConsumable',
      consumableSlot: consumableIdx,
    };
  }
  return null;
}

/**
 * Confirm action on current cursor slot.
 * Cargo equippable → equip. Cargo consumable → load hotbar. Cargo other → drop.
 * Equipped → unequip to cargo. Consumable → remove to cargo.
 * @param {InventorySystem} inv
 */
export function inventoryConfirm(inv) {
  if (!inv) return;
  const action = getInventoryActionAtCursor(inv);
  if (!action) return;

  if (action.type === 'equipCargo') {
    const item = inv.removeFromCargo(action.cargoSlot);
    if (!item) return;
    const prev = inv.equip(action.equipSlot, item);
    if (prev) inv.cargo[action.cargoSlot] = prev;
    return;
  }

  if (action.type === 'loadConsumable') {
    const item = inv.removeFromCargo(action.cargoSlot);
    if (!item) return;
    const prev = inv.loadConsumable(action.consumableSlot, item);
    if (prev) inv.cargo[action.cargoSlot] = prev;
    return;
  }

  if (action.type === 'dropCargo') {
    if (_dropCallback) _dropCallback(action.cargoSlot);
    return;
  }

  if (action.type === 'unequip') {
    const item = inv.unequip(action.equipSlot);
    if (item) inv.addToCargo(item);
    return;
  }

  if (action.type === 'unloadConsumable') {
    const item = inv.consumables[action.consumableSlot];
    if (item && !inv.cargoFull) {
      inv.consumables[action.consumableSlot] = null;
      inv.addToCargo(item);
    }
  }
}

/**
 * Render the full inventory panel contents.
 */
function _renderInventoryPanel(inv) {
  if (!_inventoryPanelEl) return;

  const sel = _invCursor;
  const inventoryItems = [...inv.cargo, ...inv.equipped, ...inv.consumables].filter(Boolean);
  void preloadInventoryIcons(inventoryItems).catch(() => {});

  // ---- Cargo ----
  let html = `<div class="inv-header"><span>cargo ${inv.cargoCount}/${inv.cargoMax}</span><span class="inv-caption">${inventoryHint(_promptOptions)}</span></div>`;

  for (let i = 0; i < inv.cargo.length; i++) {
    const isSel = (sel === i);
    const item = inv.cargo[i];
    const rowStyle = inventorySelectionStyle(isSel);
    if (item) {
      const color = inventoryItemColor(item);
      const catLabel = item.category === 'artifact' ? item.subcategory : (item.category || '');
      let actionLabel = 'drop';
      if (item.subcategory === 'equippable') actionLabel = 'equip';
      else if (item.subcategory === 'consumable') actionLabel = 'load';
      const action = isSel ? `<span class="inv-drop">[${actionLabel}]</span>` : '';
      html += `<div class="inv-item" style="${rowStyle}">
        ${itemIconMarkup(item, { state: 'cargo', selected: isSel })}
        <span class="inv-name" style="color:${color}">${item.name}</span>
        <span class="inv-cat">${catLabel}</span>
        ${action}
      </div>`;
    } else {
      html += `<div class="inv-item" style="${rowStyle}"><span class="inv-empty">— empty —</span></div>`;
    }
  }

  // ---- Equipped ----
  html += `<div class="inv-section"><div class="inv-header">equipped</div>`;
  for (let i = 0; i < inv.equipped.length; i++) {
    const globalIdx = 8 + i;
    const isSel = (sel === globalIdx);
    const item = inv.equipped[i];
    const rowStyle = inventorySelectionStyle(isSel);
    if (item) {
      const action = isSel ? '<span class="inv-drop">[unequip]</span>' : '';
      html += `<div class="inv-item" style="${rowStyle}">${itemIconMarkup(item, { state: 'equipped', selected: isSel })}<span class="inv-name" style="color:${inventoryItemColor(item)}">${item.name}</span><span class="inv-cat">${item.effectDesc || ''}</span>${action}</div>`;
    } else {
      html += `<div class="inv-item" style="${rowStyle}"><span class="inv-empty">— empty slot —</span></div>`;
    }
  }
  html += '</div>';

  // ---- Consumables ----
  html += `<div class="inv-section"><div class="inv-header"><span>consumables</span><span class="inv-caption">${affordanceCaption('consumables', 'use', _promptOptions)}</span></div>`;
  for (let i = 0; i < inv.consumables.length; i++) {
    const globalIdx = 10 + i;
    const isSel = (sel === globalIdx);
    const item = inv.consumables[i];
    const rowStyle = inventorySelectionStyle(isSel);
    const slotAction = actionDescriptor(i === 0 ? 'consumable1' : 'consumable2', _promptOptions);
    const slotGlyph = actionGlyphMarkup(slotAction);
    if (item) {
      const action = isSel ? '<span class="inv-drop">[remove]</span>' : '';
      html += `<div class="inv-item" style="${rowStyle}">${itemIconMarkup(item, { state: 'consumable', selected: isSel })}<span class="inv-name" style="color:${inventoryItemColor(item)}">${slotGlyph} ${item.name}</span><span class="inv-cat">${item.useDesc || ''}</span>${action}</div>`;
    } else {
      html += `<div class="inv-item" style="${rowStyle}"><span class="inv-empty">${slotGlyph} — empty —</span></div>`;
    }
  }
  html += '</div>';

  _inventoryPanelEl.innerHTML = html;
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
