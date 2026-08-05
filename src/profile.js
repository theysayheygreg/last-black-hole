/**
 * profile.js — Player profile / save slot management.
 *
 * 3 save slots in localStorage. Each stores:
 *   - Pilot name, timestamps
 *   - Exotic matter (currency)
 *   - Vault items (fixed-cap storage)
 *   - Equipped loadout (2 equip + 2 consumable)
 *   - Legacy upgrade ranks retained only for save compatibility
 *   - Lifetime stats
 *
 * The profile is the single source of truth for between-run state.
 * Everything persists here — vault.js is replaced by this.
 */

import { BALANCE, runEmEarned, survivalBonusEm } from './content/balance.js';
import { PUBLIC_HULL_IDS, RIG_TRACKS as HULL_RIG_TRACKS } from './content/hulls.js';
import { sanitizeRetiredItems } from './content/items.js';

const STORAGE_PREFIX = 'lbh_profile_';
const INDEX_KEY = 'lbh_profiles_index';
const LEGACY_VAULT_KEY = 'lbh_vault';
const MAX_SLOTS = 3;
const MAX_NAME_LENGTH = 16;
const EQUIPPED_SLOT_COUNT = 2;
const CONSUMABLE_SLOT_COUNT = 2;
const DEFAULT_HULL_TYPE = 'drifter';
const RIG_SLOT_COUNT = 3;
const MAX_RECENT_ECHOES = 8;
export const MAX_RIG_LEVEL = BALANCE.progression.maxRigLevel;

// ---- Random name generation ----

const PILOT_ADJ = ['Steady', 'Quiet', 'Bold', 'Swift', 'Pale', 'Bright', 'Cold', 'Dark', 'Lost', 'Last'];
const PILOT_NOUN = ['Drift', 'Wake', 'Tide', 'Ember', 'Arc', 'Helm', 'Void', 'Star', 'Edge', 'Pulse'];

function pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }
function generateProfileId() {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  return `profile-${Math.random().toString(36).slice(2, 10)}`;
}

export function generatePilotName() {
  return `${pick(PILOT_ADJ)} ${pick(PILOT_NOUN)}`;
}

export function sanitizePilotName(name, fallback = generatePilotName()) {
  const clean = String(name || '')
    .normalize('NFKC')
    .replace(/[<>{}[\]\\/^`|~]/g, '')
    .replace(/[^\p{L}\p{N} ._'-]/gu, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, MAX_NAME_LENGTH)
    .trim();
  return clean || fallback;
}

// ---- Default profile shape ----

function createDefaultProfile(name) {
  return {
    id: generateProfileId(),
    name: sanitizePilotName(name),
    created: new Date().toISOString(),
    lastPlayed: new Date().toISOString(),

    exoticMatter: 0,

    vault: [],
    vaultCapacity: 25,

    loadout: {
      equipped: new Array(EQUIPPED_SLOT_COUNT).fill(null),
      consumables: new Array(CONSUMABLE_SLOT_COUNT).fill(null),
    },

    upgrades: {
      thrust: 0,
      hull: 0,
      coupling: 0,
      drag: 0,
      sensor: 0,
      vault: 0,
    },

    hullType: DEFAULT_HULL_TYPE,
    // Legacy alias kept for older local/remote callers. New code should read hullType.
    shipType: DEFAULT_HULL_TYPE,
    rigLevels: new Array(RIG_SLOT_COUNT).fill(0),

    // Stats
    totalExtractions: 0,
    totalDeaths: 0,
    totalItemsSold: 0,
    bestSurvivalTime: 0,
    totalExoticMatterEarned: 0,
    recentEchoes: [],
  };
}

function normalizeLoadoutShape(loadout = {}) {
  const equipped = sanitizeRetiredItems(loadout?.equipped);
  const consumables = sanitizeRetiredItems(loadout?.consumables);
  return {
    equipped: Array.from({ length: EQUIPPED_SLOT_COUNT }, (_, index) =>
      equipped[index] || null
    ),
    consumables: Array.from({ length: CONSUMABLE_SLOT_COUNT }, (_, index) =>
      consumables[index] || null
    ),
  };
}

function normalizeHullType(hullType, legacyShipType) {
  const raw = String(hullType || legacyShipType || DEFAULT_HULL_TYPE).toLowerCase();
  return PUBLIC_HULL_IDS.includes(raw) ? raw : DEFAULT_HULL_TYPE;
}

function normalizeRigLevels(rigLevels = [], hullType = DEFAULT_HULL_TYPE) {
  return Array.from({ length: RIG_SLOT_COUNT }, (_, index) => {
    const value = Number(rigLevels?.[index]);
    if (!Number.isFinite(value)) return 0;
    return Math.max(0, Math.min(shippedRigLevelCap(hullType, index), Math.round(value)));
  });
}

function normalizeRecentEchoes(echoes = []) {
  if (!Array.isArray(echoes)) return [];
  return echoes
    .filter((echo) => echo && typeof echo === 'object' && String(echo.fragment || '').trim())
    .slice(0, MAX_RECENT_ECHOES)
    .map((echo) => ({
      fragment: String(echo.fragment).slice(0, 240),
      pilotName: String(echo.pilotName || 'unknown').slice(0, MAX_NAME_LENGTH),
      hullType: normalizeHullType(echo.hullType),
      deathCause: echo.deathCause ? String(echo.deathCause).slice(0, 80) : null,
      survivalTime: Math.max(0, Number(echo.survivalTime) || 0),
    }));
}

function normalizeProfileShape(profile = {}) {
  const defaults = createDefaultProfile(profile.name);
  const next = { ...defaults, ...profile };
  // Old saves retain this inert record so profile migrations never discard it.
  // The shipped progression surface is now the authority-backed rig only.
  next.upgrades = { ...defaults.upgrades, ...(profile.upgrades || {}) };
  next.hullType = normalizeHullType(profile.hullType, profile.shipType);
  next.shipType = next.hullType;
  next.rigLevels = normalizeRigLevels(profile.rigLevels, next.hullType);
  next.vault = Array.isArray(profile.vault)
    ? sanitizeRetiredItems(profile.vault).filter(Boolean)
    : defaults.vault;
  next.loadout = normalizeLoadoutShape(profile.loadout);
  next.recentEchoes = normalizeRecentEchoes(profile.recentEchoes);
  return next;
}

function normalizeEmCredit(value) {
  return Math.max(0, Math.round(Number(value) || 0));
}

// Adapt the canonical hull manifest once for the ordered profile UI shape.
export const RIG_TRACKS = Object.fromEntries(
  Object.entries(HULL_RIG_TRACKS).map(([hullType, tracks]) => [
    hullType,
    Object.entries(tracks).map(([key, track]) => ({
      key,
      label: track.name,
      focus: track.focus,
      levels: track.levels || [],
    })),
  ])
);

const RIG_LEVEL_COSTS = BALANCE.progression.rigLevelCosts;

export const RIG_LEVEL_EFFECTS = Object.fromEntries(
  Object.entries(HULL_RIG_TRACKS).map(([hullType, tracks]) => [
    hullType,
    Object.values(tracks).map((track) => (track.levels || []).map((level) => level.effect)),
  ])
);

export const RIG_SHIPPED_LEVEL_CAPS = Object.fromEntries(
  Object.entries(HULL_RIG_TRACKS).map(([hullType, tracks]) => [
    hullType,
    Object.values(tracks).map((track) => (track.levels || []).length),
  ])
);

function shippedRigLevelCap(hullType, trackIndex) {
  const caps = RIG_SHIPPED_LEVEL_CAPS[normalizeHullType(hullType)];
  const value = Number(caps?.[trackIndex]);
  return Number.isFinite(value) ? Math.max(0, Math.min(MAX_RIG_LEVEL, Math.round(value))) : MAX_RIG_LEVEL;
}

// ---- Profile Manager ----

export class ProfileManager {
  constructor() {
    this.slots = new Array(MAX_SLOTS).fill(null);
    this.activeSlot = -1;
    this._loadIndex();
    this._migrateLegacy();
  }

  /** Get the active profile, or null. */
  get active() {
    return this.activeSlot >= 0 ? this.slots[this.activeSlot] : null;
  }

  /** Does a slot have a profile? */
  hasProfile(slotIndex) {
    return this.slots[slotIndex] !== null;
  }

  /** Create a new profile in a slot. */
  createProfile(slotIndex, name) {
    if (slotIndex < 0 || slotIndex >= MAX_SLOTS) return null;
    const cleanName = sanitizePilotName(name);
    const profile = createDefaultProfile(cleanName);
    this.slots[slotIndex] = profile;
    this.activeSlot = slotIndex;
    this._saveSlot(slotIndex);
    this._saveIndex();
    return profile;
  }

  /** Load an existing profile slot. */
  loadProfile(slotIndex) {
    if (slotIndex < 0 || slotIndex >= MAX_SLOTS) return null;
    if (!this.slots[slotIndex]) {
      // Try loading from storage
      this._loadSlot(slotIndex);
    }
    if (!this.slots[slotIndex]) return null;
    this.activeSlot = slotIndex;
    this.slots[slotIndex].lastPlayed = new Date().toISOString();
    this._saveSlot(slotIndex);
    this._saveIndex();
    return this.slots[slotIndex];
  }

  /** Delete a profile slot. */
  deleteProfile(slotIndex) {
    if (slotIndex < 0 || slotIndex >= MAX_SLOTS || !this.slots[slotIndex]) return null;
    const deleted = this.slots[slotIndex];
    this.slots[slotIndex] = null;
    if (this.activeSlot === slotIndex) this.activeSlot = -1;
    try { localStorage.removeItem(STORAGE_PREFIX + slotIndex); } catch (e) {}
    this._saveIndex();
    return deleted;
  }

  // ---- Profile mutations ----

  /** Add exotic matter. */
  addEM(amount) {
    const p = this.active;
    if (!p) return 0;
    const credit = normalizeEmCredit(amount);
    if (credit <= 0) return 0;
    p.exoticMatter += credit;
    p.totalExoticMatterEarned += credit;
    this.save();
    return credit;
  }

  /** Spend exotic matter. Returns false if can't afford. */
  spendEM(amount) {
    const p = this.active;
    if (!p || p.exoticMatter < amount) return false;
    p.exoticMatter -= amount;
    this.save();
    return true;
  }

  /** Sort vault: artifacts first, then components, dataCores, salvage. Within category: tier desc, value desc. */
  sortVault() {
    const p = this.active;
    if (!p) return;
    const catOrder = { artifact: 0, component: 1, dataCore: 2, salvage: 3 };
    const tierOrder = { unique: 0, rare: 1, uncommon: 2, common: 3 };
    p.vault.sort((a, b) => {
      const catA = catOrder[a.category] ?? 9;
      const catB = catOrder[b.category] ?? 9;
      if (catA !== catB) return catA - catB;
      const tierA = tierOrder[a.tier] ?? 9;
      const tierB = tierOrder[b.tier] ?? 9;
      if (tierA !== tierB) return tierA - tierB;
      return (b.value || 0) - (a.value || 0);
    });
    this.save();
  }

  /** Add items to vault. Returns overflow (items that didn't fit). Auto-sorts after. */
  storeItems(items) {
    const p = this.active;
    if (!p) return items;
    const overflow = [];
    for (const item of items) {
      if (p.vault.length < p.vaultCapacity) {
        p.vault.push({ ...item });
      } else {
        overflow.push(item);
      }
    }
    this.sortVault();
    return overflow;
  }

  /** Remove item from vault by index. */
  takeFromVault(index) {
    const p = this.active;
    if (!p || index < 0 || index >= p.vault.length) return null;
    const item = p.vault.splice(index, 1)[0];
    this.save();
    return item;
  }

  /** Sell a vault item for EM. Returns value gained. */
  sellVaultItem(index) {
    const item = this.takeFromVault(index);
    if (!item) return 0;
    const value = item.value || 0;
    this.addEM(value);
    const p = this.active;
    if (p) p.totalItemsSold++;
    this.save();
    return value;
  }

  /** Update equipped loadout. */
  setLoadout(equipped, consumables) {
    const p = this.active;
    if (!p) return;
    p.loadout = normalizeLoadoutShape({ equipped, consumables });
    this.save();
  }

  setHullType(hullType) {
    const p = this.active;
    if (!p) return false;
    const nextHull = normalizeHullType(hullType);
    p.hullType = nextHull;
    p.shipType = nextHull;
    p.rigLevels = normalizeRigLevels(p.rigLevels, nextHull);
    this.save();
    return true;
  }

  setRecentEchoes(echoes) {
    const p = this.active;
    if (!p) return [];
    p.recentEchoes = normalizeRecentEchoes(echoes);
    this.save();
    return p.recentEchoes.map((echo) => ({ ...echo }));
  }

  getRigProgression() {
    const p = this.active;
    if (!p) return null;
    const hullType = normalizeHullType(p.hullType, p.shipType);
    const levels = normalizeRigLevels(p.rigLevels, hullType);
    const tracks = RIG_TRACKS[hullType] || RIG_TRACKS[DEFAULT_HULL_TYPE];
    return {
      hullType,
      maxLevel: MAX_RIG_LEVEL,
      levels,
      tracks: tracks.map((track, index) => ({
        ...track,
        index,
        level: levels[index] ?? 0,
        maxLevel: shippedRigLevelCap(hullType, index),
        nextEffect: (levels[index] ?? 0) < shippedRigLevelCap(hullType, index)
          ? RIG_LEVEL_EFFECTS[hullType]?.[index]?.[levels[index] ?? 0] || null
          : null,
      })),
    };
  }

  getRigUpgradeCost(trackIndex) {
    const p = this.active;
    if (!p) return null;
    const index = Number(trackIndex);
    if (!Number.isInteger(index) || index < 0 || index >= RIG_SLOT_COUNT) return null;
    const levels = normalizeRigLevels(p.rigLevels, p.hullType || p.shipType);
    const currentLevel = levels[index] ?? 0;
    const maxLevel = shippedRigLevelCap(p.hullType || p.shipType, index);
    if (currentLevel >= maxLevel) return null;
    return {
      em: RIG_LEVEL_COSTS[currentLevel],
      trackIndex: index,
      nextLevel: currentLevel + 1,
      maxLevel,
      nextEffect: RIG_LEVEL_EFFECTS[normalizeHullType(p.hullType, p.shipType)]?.[index]?.[currentLevel] || null,
    };
  }

  canAffordRigUpgrade(trackIndex) {
    const p = this.active;
    const cost = this.getRigUpgradeCost(trackIndex);
    return Boolean(p && cost && p.exoticMatter >= cost.em);
  }

  performRigUpgrade(trackIndex) {
    const p = this.active;
    if (!p || !this.canAffordRigUpgrade(trackIndex)) return false;
    const cost = this.getRigUpgradeCost(trackIndex);
    p.exoticMatter -= cost.em;
    p.rigLevels = normalizeRigLevels(p.rigLevels, p.hullType || p.shipType);
    p.rigLevels[cost.trackIndex] = cost.nextLevel;
    this.save();
    return true;
  }

  exportActiveProfile() {
    const p = this.active;
    if (!p) return null;
    return JSON.parse(JSON.stringify(p));
  }

  replaceActiveProfile(profileData) {
    if (this.activeSlot < 0 || !profileData) return null;
    const next = normalizeProfileShape(profileData);
    this.slots[this.activeSlot] = next;
    this._saveSlot(this.activeSlot);
    this._saveIndex();
    return next;
  }

  /** Record run outcome. */
  recordExtraction(survivalTime) {
    const p = this.active;
    if (!p) return 0;
    const emCredited = survivalBonusEm(survivalTime);
    p.totalExtractions++;
    if (survivalTime > p.bestSurvivalTime) p.bestSurvivalTime = survivalTime;
    if (emCredited > 0) {
      p.exoticMatter += emCredited;
      p.totalExoticMatterEarned += emCredited;
    }
    p.lastPlayed = new Date().toISOString();
    this.save();
    return emCredited;
  }

  recordDeath(survivalTime = 0) {
    const p = this.active;
    if (!p) return 0;
    const emCredited = runEmEarned({ outcome: 'dead', survivalTime });
    p.totalDeaths++;
    if (emCredited > 0) {
      p.exoticMatter += emCredited;
      p.totalExoticMatterEarned += emCredited;
    }
    p.lastPlayed = new Date().toISOString();
    this.save();
    return emCredited;
  }

  // ---- Persistence ----

  save() {
    if (this.activeSlot >= 0) this._saveSlot(this.activeSlot);
  }

  _saveSlot(slotIndex) {
    const profile = this.slots[slotIndex];
    if (!profile) return;
    try {
      localStorage.setItem(STORAGE_PREFIX + slotIndex, JSON.stringify(profile));
    } catch (e) {}
  }

  _loadSlot(slotIndex) {
    try {
      const raw = localStorage.getItem(STORAGE_PREFIX + slotIndex);
      if (!raw) return;
      const data = JSON.parse(raw);
      // Ensure all fields exist (forward compat)
      this.slots[slotIndex] = normalizeProfileShape(data);
      if (!this.slots[slotIndex].id) {
        this.slots[slotIndex].id = generateProfileId();
        this._saveSlot(slotIndex);
      }
    } catch (e) {}
  }

  _saveIndex() {
    try {
      const index = {
        slots: this.slots.map(s => s ? { name: s.name, created: s.created } : null),
        lastActive: this.activeSlot,
      };
      localStorage.setItem(INDEX_KEY, JSON.stringify(index));
    } catch (e) {}
  }

  _loadIndex() {
    try {
      const raw = localStorage.getItem(INDEX_KEY);
      if (!raw) return;
      const index = JSON.parse(raw);
      for (let i = 0; i < MAX_SLOTS; i++) {
        if (index.slots[i]) this._loadSlot(i);
      }
      if (index.lastActive >= 0 && this.slots[index.lastActive]) {
        this.activeSlot = index.lastActive;
      }
    } catch (e) {}
  }

  /** Migrate old vault.js data to slot 0 if no profiles exist. */
  _migrateLegacy() {
    // Only migrate if no slots exist
    if (this.slots.some(s => s !== null)) return;
    try {
      const raw = localStorage.getItem(LEGACY_VAULT_KEY);
      if (!raw) return;
      const old = JSON.parse(raw);
      const profile = normalizeProfileShape({
        name: 'Pilot Alpha',
        exoticMatter: old.exoticMatter ?? 0,
        vault: old.items ?? [],
        totalExtractions: old.totalExtractions ?? 0,
        totalItemsSold: old.totalItemsSold ?? 0,
        bestSurvivalTime: old.bestSurvivalTime ?? 0,
      });
      this.slots[0] = profile;
      this._saveSlot(0);
      this._saveIndex();
      // Remove legacy key
      localStorage.removeItem(LEGACY_VAULT_KEY);
    } catch (e) {}
  }
}
