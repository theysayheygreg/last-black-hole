/**
 * hud.js — DOM-based HUD overlay.
 *
 * Panels: collapse timer (top-left), wormholes (top-right),
 * salvage (bottom-left), scavengers (bottom-right),
 * pulse status (above salvage), signature (bottom-center),
 * portal direction arrow (screen-space), center warnings.
 *
 * All lowercase text, soft glow via text-shadow.
 */

import { CONFIG } from './config.js';
import { worldToScreen, worldDistance, worldDisplacement } from './coords.js';
import { UI_COLORS, UI_TIERS } from './ui/design-tokens.js';
import { inventoryItemColor, inventorySelectionStyle, portalArrowMarkup, setWarningColor } from './ui/hud-primitives.js';

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
let _ability1El, _ability2El;
let _inhibitorEl, _inhibitorFormEl;
let _dropCallback = null;  // set by main.js for drop handling
let _lastPortalCount = -1;
let _lastCollapseStr = '';

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
  _ability1El = document.getElementById('hud-ability1');
  _ability2El = document.getElementById('hud-ability2');
  _inhibitorEl = document.getElementById('hud-inhibitor');
  _inhibitorFormEl = document.getElementById('hud-inhibitor-form');
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

  const runDuration = CONFIG.universe.runDuration;
  const remaining = Math.max(0, runDuration - runElapsedTime);

  // === COLLAPSE TIMER ===
  const collapseStr = fmtTime(remaining);
  if (collapseStr !== _lastCollapseStr) {
    _collapseTimerEl.textContent = `collapse: ${collapseStr}`;
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

  if (nextWaveTime !== null) {
    if (isFinalWave) {
      _portalsNextEl.textContent = `last spawn: ${fmtTime(nextWaveTime)}`;
      _portalsNextEl.style.color = 'rgba(255, 80, 80, 0.8)';
    } else {
      _portalsNextEl.textContent = `next spawn: ${fmtTime(nextWaveTime)}`;
      _portalsNextEl.style.color = '';
    }
  } else {
    if (count > 0) {
      _portalsNextEl.textContent = 'no more spawns';
      _portalsNextEl.style.color = 'rgba(255, 80, 80, 0.6)';
    } else {
      _portalsNextEl.textContent = 'no way out';
      _portalsNextEl.style.color = 'rgba(255, 40, 40, 0.9)';
    }
  }

  // === CARGO (count/max + total value) ===
  const inv = opts.inventorySystem;
  if (inv) {
    const count = inv.cargoCount;
    const max = inv.cargoMax;
    _salvageCountEl.textContent = count > 0 ? `◈ cargo ${count}/${max}` : `◈ cargo 0/${max}`;
    if (count > 0) {
      const totalValue = inv.getCargoValue();
      _salvageValueEl.textContent = `value: ${totalValue}  [Tab]`;
    } else {
      _salvageValueEl.textContent = '[Tab] inventory';
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
    if (opts.combatSystem.playerReady) {
      _pulseEl.textContent = 'pulse ready [E]';
      _pulseEl.className = 'hud-panel ready';
    } else {
      const cd = opts.combatSystem.playerCooldown;
      _pulseEl.textContent = `pulse ${cd.toFixed(1)}s`;
      _pulseEl.className = 'hud-panel';
    }
  }

  // === SIGNAL ===
  if (_signalFillEl && opts.signalLevel !== undefined) {
    const level = opts.signalLevel;
    const zone = opts.signalZone || 'ghost';
    const pct = Math.round(level * 100);
    _signalFillEl.style.width = `${pct}%`;

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

  // === INHIBITOR FORM ===
  if (_inhibitorEl && opts.inhibitorState) {
    const form = opts.inhibitorState.form || 0;
    if (form <= 0) {
      _inhibitorEl.style.display = 'none';
    } else {
      _inhibitorEl.style.display = '';
      const formName = form === 1 ? 'glitch'
        : form === 2 ? 'swarm'
        : form === 3 ? 'vessel'
        : 'dormant';
      if (_inhibitorFormEl) _inhibitorFormEl.textContent = formName;
      // Swap the CSS class so the vessel form pulses harder
      if (form === 3) {
        _inhibitorEl.classList.add('form-vessel');
      } else {
        _inhibitorEl.classList.remove('form-vessel');
      }
    }
  }

  // === HULL ABILITIES ===
  if (_ability1El && opts.abilityState) {
    const as = opts.abilityState;
    const hull = as.hullType || 'drifter';

    // Ability names and state per hull
    const abilityInfo = {
      drifter:  { a1: 'eddy brake', a2: null,
        a1State: as.eddyBrakeCooldown > 0 ? `${Math.ceil(as.eddyBrakeCooldown)}s` : 'ready',
        a1Active: false, a1Ready: (as.eddyBrakeCooldown || 0) <= 0,
        flowLock: as.flowLockActive },
      breacher: { a1: 'burn', a2: null,
        a1State: as.burnActive ? `${Math.ceil(as.burnFuel || 0)}s fuel` : `${Math.ceil(as.burnFuel || 0)}s`,
        a1Active: as.burnActive, a1Ready: !as.burnActive && (as.burnFuel || 0) > 1 },
      resonant: { a1: 'tap', a2: 'shift',
        a1State: as.tapCooldown > 0 ? `${Math.ceil(as.tapCooldown)}s` : 'ready',
        a1Active: !!as.tapAnchor, a1Ready: (as.tapCooldown || 0) <= 0,
        a2State: as.frequencyShiftCooldown > 0 ? `${Math.ceil(as.frequencyShiftCooldown)}s` : (as.nextPulseInverted ? 'armed' : 'ready'),
        a2Active: as.nextPulseInverted, a2Ready: (as.frequencyShiftCooldown || 0) <= 0 },
      shroud:   { a1: 'cloak', a2: 'decoy',
        a1State: as.wakeCloakCooldown > 0 ? `${Math.ceil(as.wakeCloakCooldown)}s` : 'ready',
        a1Active: false, a1Ready: (as.wakeCloakCooldown || 0) <= 0,
        a2State: `${as.decoyCharges || 0}×${as.decoyCooldown > 0 ? ' ' + Math.ceil(as.decoyCooldown) + 's' : ''}`,
        a2Active: false, a2Ready: (as.decoyCharges || 0) > 0 && (as.decoyCooldown || 0) <= 0 },
      hauler:   { a1: 'tag', a2: 'tractor',
        a1State: `${as.salvageLockCharges || 0}×`,
        a1Active: false, a1Ready: (as.salvageLockCharges || 0) > 0,
        a2State: as.tractorCooldown > 0 ? `${Math.ceil(as.tractorCooldown)}s` : 'ready',
        a2Active: (as.tractorChannelTimer || 0) > 0, a2Ready: (as.tractorCooldown || 0) <= 0 },
    };
    const info = abilityInfo[hull] || abilityInfo.drifter;

    // Ability 1
    const name1El = _ability1El.querySelector('.hud-ability-name');
    const status1El = _ability1El.querySelector('.hud-ability-status');
    if (name1El) name1El.textContent = info.a1;
    if (status1El) status1El.textContent = info.a1State || '';
    _ability1El.className = 'hud-ability' + (info.a1Active ? ' active' : info.a1Ready ? ' ready' : ' cooldown');

    // Flow lock indicator for Drifter (passive, no key)
    if (hull === 'drifter' && info.flowLock) {
      if (name1El) name1El.textContent = 'flow lock';
      _ability1El.className = 'hud-ability active';
      if (status1El) status1El.textContent = '';
    }

    // Ability 2
    if (info.a2) {
      _ability2El.style.display = '';
      const name2El = _ability2El.querySelector('.hud-ability-name');
      const status2El = _ability2El.querySelector('.hud-ability-status');
      if (name2El) name2El.textContent = info.a2;
      if (status2El) status2El.textContent = info.a2State || '';
      _ability2El.className = 'hud-ability' + (info.a2Active ? ' active' : info.a2Ready ? ' ready' : ' cooldown');
    } else {
      _ability2El.style.display = 'none';
    }
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
    if (!portal.alive) continue;
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

  // ---- Cargo ----
  let html = `<div class="inv-header">cargo ${inv.cargoCount}/${inv.cargoMax}  ↑↓ select  X/space confirm  Tab close</div>`;

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
      html += `<div class="inv-item" style="${rowStyle}"><span class="inv-name" style="color:${inventoryItemColor(item)}">${item.name}</span><span class="inv-cat">${item.effectDesc || ''}</span>${action}</div>`;
    } else {
      html += `<div class="inv-item" style="${rowStyle}"><span class="inv-empty">— empty slot —</span></div>`;
    }
  }
  html += '</div>';

  // ---- Consumables ----
  html += `<div class="inv-section"><div class="inv-header">consumables [1] [2]</div>`;
  for (let i = 0; i < inv.consumables.length; i++) {
    const globalIdx = 10 + i;
    const isSel = (sel === globalIdx);
    const item = inv.consumables[i];
    const rowStyle = inventorySelectionStyle(isSel);
    if (item) {
      const action = isSel ? '<span class="inv-drop">[remove]</span>' : '';
      html += `<div class="inv-item" style="${rowStyle}"><span class="inv-name" style="color:${inventoryItemColor(item)}">[${i + 1}] ${item.name}</span><span class="inv-cat">${item.useDesc || ''}</span>${action}</div>`;
    } else {
      html += `<div class="inv-item" style="${rowStyle}"><span class="inv-empty">[${i + 1}] — empty —</span></div>`;
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
export function showWarning(text, color = 'rgba(200, 200, 220, 0.9)', durationMs = 4000) {
  if (!_warningsEl) return;

  // Cap visible entries
  while (_warningsEl.children.length >= 8) {
    _warningsEl.removeChild(_warningsEl.firstChild);
  }

  const el = document.createElement('div');
  el.className = 'hud-warning';
  el.textContent = text;
  setWarningColor(el, color);
  _warningsEl.appendChild(el);

  setTimeout(() => {
    el.classList.add('fading');
    setTimeout(() => el.remove(), 1000);
  }, durationMs);
}
