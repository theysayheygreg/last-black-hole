/**
 * vault.js — Persistent player vault and currency.
 *
 * Survives across runs via localStorage. Stores:
 *   - Exotic matter (currency from selling salvage/components)
 *   - Vault items (extracted cargo kept for future use)
 *   - Run stats (total extractions, best time, etc.)
 *
 * The vault is the bridge between runs — you extract cargo, sell or store it,
 * then drop back in with your loadout.
 */

const STORAGE_KEY = 'lbh_vault';

export class Vault {
  constructor() {
    this.exoticMatter = 0;
    this.items = [];          // stored items (not equipped, not in cargo)
    this.totalExtractions = 0;
    this.totalItemsSold = 0;
    this.bestSurvivalTime = 0;

    this._load();
  }

  // ---- Currency ----

  /** Sell items for exotic matter. Returns total value gained. */
  sellItems(items) {
    let total = 0;
    for (const item of items) {
      total += item.value || 0;
      this.totalItemsSold++;
    }
    this.exoticMatter += total;
    this._save();
    return total;
  }

  /** Sell a single vault item by index. Returns value gained. */
  sellVaultItem(index) {
    if (index < 0 || index >= this.items.length) return 0;
    const item = this.items[index];
    const value = item.value || 0;
    this.items.splice(index, 1);
    this.exoticMatter += value;
    this.totalItemsSold++;
    this._save();
    return value;
  }

  /** Spend exotic matter. Returns true if affordable. */
  spend(amount) {
    if (this.exoticMatter < amount) return false;
    this.exoticMatter -= amount;
    this._save();
    return true;
  }

  // ---- Item storage ----

  /** Store extracted cargo items in the vault. */
  storeItems(items) {
    this.items.push(...items);
    this._save();
  }

  /** Remove an item from vault (to equip or use). */
  takeItem(index) {
    if (index < 0 || index >= this.items.length) return null;
    const item = this.items.splice(index, 1)[0];
    this._save();
    return item;
  }

  // ---- Run tracking ----

  /** Record a successful extraction. */
  recordExtraction(survivalTime) {
    this.totalExtractions++;
    if (survivalTime > this.bestSurvivalTime) {
      this.bestSurvivalTime = survivalTime;
    }
    this._save();
  }

  // ---- Persistence ----

  _save() {
    try {
      const data = {
        exoticMatter: this.exoticMatter,
        items: this.items,
        totalExtractions: this.totalExtractions,
        totalItemsSold: this.totalItemsSold,
        bestSurvivalTime: this.bestSurvivalTime,
      };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    } catch (e) {
      // localStorage might be full or unavailable — fail silently
    }
  }

  _load() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      const data = JSON.parse(raw);
      this.exoticMatter = data.exoticMatter ?? 0;
      this.items = data.items ?? [];
      this.totalExtractions = data.totalExtractions ?? 0;
      this.totalItemsSold = data.totalItemsSold ?? 0;
      this.bestSurvivalTime = data.bestSurvivalTime ?? 0;
    } catch (e) {
      // Corrupted data — start fresh
    }
  }

  /** Wipe everything (debug / new save). */
  reset() {
    this.exoticMatter = 0;
    this.items = [];
    this.totalExtractions = 0;
    this.totalItemsSold = 0;
    this.bestSurvivalTime = 0;
    this._save();
  }
}
