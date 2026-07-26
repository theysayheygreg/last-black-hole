import { itemIconMarkup, preloadInventoryIcons } from './asset-kit.js';
import { inventoryItemColor, inventorySelectionStyle } from './hud-primitives.js';
import { actionDescriptor, actionGlyphMarkup, affordanceCaption, inventoryHint } from './input-prompts.js';

const INVENTORY_SLOT_COUNT = 12;
let panelElement = null;
let cursor = 0;
let dropCallback = null;

// The HUD is a singleton, so its inventory cursor and panel share that lifetime.
export function initHudInventory(element) {
  panelElement = element;
}

export function setDropCallback(callback) {
  dropCallback = callback;
}

export function resetInventoryCursor() {
  cursor = 0;
}

export function inventoryCursorUp() {
  cursor = (cursor - 1 + INVENTORY_SLOT_COUNT) % INVENTORY_SLOT_COUNT;
}

export function inventoryCursorDown() {
  cursor = (cursor + 1) % INVENTORY_SLOT_COUNT;
}

export function getInventoryActionAtCursor(inventory) {
  if (!inventory) return null;

  if (cursor < 8) {
    const item = inventory.cargo[cursor];
    if (!item) return null;

    if (item.subcategory === 'equippable') {
      const openSlot = inventory.equipped.indexOf(null);
      return {
        type: 'equipCargo',
        cargoSlot: cursor,
        equipSlot: openSlot !== -1 ? openSlot : 0,
      };
    }

    if (item.subcategory === 'consumable') {
      const openSlot = inventory.consumables.indexOf(null);
      return {
        type: 'loadConsumable',
        cargoSlot: cursor,
        consumableSlot: openSlot !== -1 ? openSlot : 0,
      };
    }

    return {
      type: 'dropCargo',
      cargoSlot: cursor,
    };
  }

  if (cursor < 10) {
    const equipSlot = cursor - 8;
    const item = inventory.equipped[equipSlot];
    return item && !inventory.cargoFull ? { type: 'unequip', equipSlot } : null;
  }

  const consumableSlot = cursor - 10;
  const item = inventory.consumables[consumableSlot];
  return item && !inventory.cargoFull ? { type: 'unloadConsumable', consumableSlot } : null;
}

export function inventoryConfirm(inventory) {
  if (!inventory) return;
  const action = getInventoryActionAtCursor(inventory);
  if (!action) return;

  if (action.type === 'equipCargo') {
    const item = inventory.removeFromCargo(action.cargoSlot);
    if (!item) return;
    const previous = inventory.equip(action.equipSlot, item);
    if (previous) inventory.cargo[action.cargoSlot] = previous;
    return;
  }

  if (action.type === 'loadConsumable') {
    const item = inventory.removeFromCargo(action.cargoSlot);
    if (!item) return;
    const previous = inventory.loadConsumable(action.consumableSlot, item);
    if (previous) inventory.cargo[action.cargoSlot] = previous;
    return;
  }

  if (action.type === 'dropCargo') {
    if (dropCallback) dropCallback(action.cargoSlot);
    return;
  }

  if (action.type === 'unequip') {
    const item = inventory.unequip(action.equipSlot);
    if (item) inventory.addToCargo(item);
    return;
  }

  if (action.type === 'unloadConsumable') {
    const item = inventory.consumables[action.consumableSlot];
    if (item && !inventory.cargoFull) {
      inventory.consumables[action.consumableSlot] = null;
      inventory.addToCargo(item);
    }
  }
}

export function updateHudInventoryPanel(inventory, { open = false, promptOptions = {} } = {}) {
  if (!panelElement || !inventory) return;
  if (!open) {
    panelElement.classList.remove('open');
    return;
  }
  panelElement.classList.add('open');
  renderInventoryPanel(inventory, promptOptions);
}

function renderInventoryPanel(inventory, promptOptions) {
  const selected = cursor;
  const inventoryItems = [...inventory.cargo, ...inventory.equipped, ...inventory.consumables].filter(Boolean);
  void preloadInventoryIcons(inventoryItems).catch(() => {});

  let html = `<div class="inv-header"><span>cargo ${inventory.cargoCount}/${inventory.cargoMax}</span><span class="inv-caption">${inventoryHint(promptOptions)}</span></div>`;

  for (let i = 0; i < inventory.cargo.length; i++) {
    const isSelected = selected === i;
    const item = inventory.cargo[i];
    const rowStyle = inventorySelectionStyle(isSelected);
    if (item) {
      const color = inventoryItemColor(item);
      const categoryLabel = item.category === 'artifact' ? item.subcategory : (item.category || '');
      let actionLabel = 'drop';
      if (item.subcategory === 'equippable') actionLabel = 'equip';
      else if (item.subcategory === 'consumable') actionLabel = 'load';
      const action = isSelected ? `<span class="inv-drop">[${actionLabel}]</span>` : '';
      html += `<div class="inv-item" style="${rowStyle}">
        ${itemIconMarkup(item, { state: 'cargo', selected: isSelected })}
        <span class="inv-name" style="color:${color}">${item.name}</span>
        <span class="inv-cat">${categoryLabel}</span>
        ${action}
      </div>`;
    } else {
      html += `<div class="inv-item" style="${rowStyle}"><span class="inv-empty">— empty —</span></div>`;
    }
  }

  html += '<div class="inv-section"><div class="inv-header">equipped</div>';
  for (let i = 0; i < inventory.equipped.length; i++) {
    const isSelected = selected === 8 + i;
    const item = inventory.equipped[i];
    const rowStyle = inventorySelectionStyle(isSelected);
    if (item) {
      const action = isSelected ? '<span class="inv-drop">[unequip]</span>' : '';
      html += `<div class="inv-item" style="${rowStyle}">${itemIconMarkup(item, { state: 'equipped', selected: isSelected })}<span class="inv-name" style="color:${inventoryItemColor(item)}">${item.name}</span><span class="inv-cat">${item.effectDesc || ''}</span>${action}</div>`;
    } else {
      html += `<div class="inv-item" style="${rowStyle}"><span class="inv-empty">— empty slot —</span></div>`;
    }
  }
  html += '</div>';

  html += `<div class="inv-section"><div class="inv-header"><span>consumables</span><span class="inv-caption">${affordanceCaption('consumables', 'use', promptOptions)}</span></div>`;
  for (let i = 0; i < inventory.consumables.length; i++) {
    const isSelected = selected === 10 + i;
    const item = inventory.consumables[i];
    const rowStyle = inventorySelectionStyle(isSelected);
    const slotAction = actionDescriptor(i === 0 ? 'consumable1' : 'consumable2', promptOptions);
    const slotGlyph = actionGlyphMarkup(slotAction);
    if (item) {
      const action = isSelected ? '<span class="inv-drop">[remove]</span>' : '';
      html += `<div class="inv-item" style="${rowStyle}">${itemIconMarkup(item, { state: 'consumable', selected: isSelected })}<span class="inv-name" style="color:${inventoryItemColor(item)}">${slotGlyph} ${item.name}</span><span class="inv-cat">${item.useDesc || ''}</span>${action}</div>`;
    } else {
      html += `<div class="inv-item" style="${rowStyle}"><span class="inv-empty">${slotGlyph} — empty —</span></div>`;
    }
  }
  html += '</div>';

  panelElement.innerHTML = html;
}
