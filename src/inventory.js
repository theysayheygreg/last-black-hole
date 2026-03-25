/**
 * inventory.js — Player inventory system.
 *
 * Three slot types:
 *   - Cargo (8 slots) — items picked up during a run. Lost on death, kept on extract.
 *   - Equipped (2 slots) — equippable artifacts set at meta screen. Persist across runs.
 *   - Consumables (2 slots) — one-use items, d-pad to activate. Lost on use or death.
 *
 * Dropping an item creates a mini-wreck at the ship's position.
 */

export class InventorySystem {
  constructor() {
    /** @type {Array<object|null>} 8 cargo slots */
    this.cargo = new Array(8).fill(null);
    /** @type {Array<object|null>} 2 equip slots */
    this.equipped = new Array(2).fill(null);
    /** @type {Array<object|null>} 2 consumable slots */
    this.consumables = new Array(2).fill(null);

    /** Items dropped this frame (main.js reads + clears to spawn mini-wrecks) */
    this.droppedItems = [];

    /** Items consumed this frame (main.js reads + clears to apply effects) */
    this.usedConsumables = [];
  }

  // ---- Cargo ----

  /** Number of occupied cargo slots. */
  get cargoCount() {
    return this.cargo.filter(s => s !== null).length;
  }

  /** Maximum cargo slots. */
  get cargoMax() {
    return this.cargo.length;
  }

  /** Is cargo full? */
  get cargoFull() {
    return this.cargoCount >= this.cargoMax;
  }

  /**
   * Try to add an item to cargo. Returns true if added, false if full.
   */
  addToCargo(item) {
    const slot = this.cargo.indexOf(null);
    if (slot === -1) return false;
    this.cargo[slot] = item;
    return true;
  }

  /**
   * Try to add multiple items. Returns array of items that couldn't fit.
   */
  addMultipleToCargo(items) {
    const overflow = [];
    for (const item of items) {
      if (!this.addToCargo(item)) {
        overflow.push(item);
      }
    }
    return overflow;
  }

  /**
   * Remove an item from cargo by slot index. Returns the item, or null.
   */
  removeFromCargo(slotIndex) {
    if (slotIndex < 0 || slotIndex >= this.cargo.length) return null;
    const item = this.cargo[slotIndex];
    this.cargo[slotIndex] = null;
    return item;
  }

  /**
   * Drop an item from cargo. Queues it for mini-wreck creation.
   * Returns the dropped item, or null if slot was empty.
   */
  dropFromCargo(slotIndex) {
    const item = this.removeFromCargo(slotIndex);
    if (item) {
      this.droppedItems.push(item);
    }
    return item;
  }

  /**
   * Get all non-null cargo items (for display, selling, etc.)
   */
  getCargoItems() {
    return this.cargo.filter(s => s !== null);
  }

  /**
   * Total value of all cargo items.
   */
  getCargoValue() {
    return this.cargo.reduce((sum, item) => sum + (item?.value || 0), 0);
  }

  // ---- Equipped ----

  /**
   * Equip an artifact to a slot (0 or 1). Returns the previously equipped item, or null.
   * Item must have subcategory === 'equippable'.
   */
  equip(slotIndex, item) {
    if (slotIndex < 0 || slotIndex >= this.equipped.length) return null;
    if (item && item.subcategory !== 'equippable') return null;
    const prev = this.equipped[slotIndex];
    this.equipped[slotIndex] = item;
    return prev;
  }

  /**
   * Unequip from a slot. Returns the item.
   */
  unequip(slotIndex) {
    return this.equip(slotIndex, null);
  }

  /**
   * Check if a specific effect is equipped.
   */
  hasEffect(effectId) {
    return this.equipped.some(item => item?.effect === effectId);
  }

  /**
   * Get all active equip effects as an array of effect IDs.
   */
  getActiveEffects() {
    return this.equipped
      .filter(item => item !== null)
      .map(item => item.effect);
  }

  // ---- Consumables ----

  /**
   * Load a consumable into a hotbar slot (0 or 1). Returns previous item.
   * Item must have subcategory === 'consumable' and charges > 0.
   */
  loadConsumable(slotIndex, item) {
    if (slotIndex < 0 || slotIndex >= this.consumables.length) return null;
    if (item && (item.subcategory !== 'consumable' || (item.charges || 0) <= 0)) return null;
    const prev = this.consumables[slotIndex];
    this.consumables[slotIndex] = item;
    return prev;
  }

  /**
   * Use a consumable from a hotbar slot. Decrements charges, removes if empty.
   * Queues the effect for main.js to apply.
   * Returns the effect ID, or null if slot is empty/spent.
   */
  useConsumable(slotIndex) {
    const item = this.consumables[slotIndex];
    if (!item || (item.charges || 0) <= 0) return null;

    item.charges--;
    this.usedConsumables.push({ ...item, slotIndex });

    if (item.charges <= 0) {
      this.consumables[slotIndex] = null;
    }
    return item.useEffect;
  }

  // ---- Session lifecycle ----

  /**
   * Clear all cargo (on death or new run). Equipped + consumables persist.
   */
  clearCargo() {
    this.cargo.fill(null);
    this.droppedItems = [];
    this.usedConsumables = [];
  }

  /**
   * Extract: return all cargo items and clear. Called when player extracts.
   * These go to the vault in the meta screen.
   */
  extractCargo() {
    const items = this.getCargoItems();
    this.cargo.fill(null);
    return items;
  }

  /**
   * Full reset (new game / title screen).
   */
  reset() {
    this.cargo.fill(null);
    this.consumables.fill(null);
    this.droppedItems = [];
    this.usedConsumables = [];
    // Note: equipped persists across runs — only cleared via meta screen
  }

  /**
   * Flush per-frame queues. Call at end of frame after main.js processes them.
   */
  flushQueues() {
    this.droppedItems = [];
    this.usedConsumables = [];
  }

  // ---- Serialization (for localStorage vault) ----

  /**
   * Serialize equipped + consumables for save. Cargo is session-only.
   */
  serializeLoadout() {
    return {
      equipped: this.equipped.map(i => i ? { ...i } : null),
      consumables: this.consumables.map(i => i ? { ...i } : null),
    };
  }

  /**
   * Restore loadout from save data.
   */
  deserializeLoadout(data) {
    if (data.equipped) {
      for (let i = 0; i < Math.min(data.equipped.length, this.equipped.length); i++) {
        this.equipped[i] = data.equipped[i];
      }
    }
    if (data.consumables) {
      for (let i = 0; i < Math.min(data.consumables.length, this.consumables.length); i++) {
        this.consumables[i] = data.consumables[i];
      }
    }
  }
}
