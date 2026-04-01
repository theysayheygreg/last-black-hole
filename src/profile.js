/**
 * profile.js — Player profile / save slot management.
 *
 * 3 save slots in localStorage. Each stores:
 *   - Pilot name, timestamps
 *   - Exotic matter (currency)
 *   - Vault items (capped, expandable via upgrade)
 *   - Equipped loadout (2 equip + 2 consumable)
 *   - Upgrade ranks (thrust/hull/coupling/drag/sensor/vault)
 *   - Lifetime stats
 *
 * The profile is the single source of truth for between-run state.
 * Everything persists here — vault.js is replaced by this.
 */

const STORAGE_PREFIX = 'lbh_profile_';
const INDEX_KEY = 'lbh_profiles_index';
const LEGACY_VAULT_KEY = 'lbh_vault';
const MAX_SLOTS = 3;
const MAX_NAME_LENGTH = 16;
const EQUIPPED_SLOT_COUNT = 2;
const CONSUMABLE_SLOT_COUNT = 2;

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

// ---- Default profile shape ----

function createDefaultProfile(name) {
  return {
    id: generateProfileId(),
    name: name || generatePilotName(),
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

    shipType: 'standard',

    // Stats
    totalExtractions: 0,
    totalDeaths: 0,
    totalItemsSold: 0,
    bestSurvivalTime: 0,
    totalExoticMatterEarned: 0,
  };
}

function normalizeLoadoutShape(loadout = {}) {
  return {
    equipped: Array.from({ length: EQUIPPED_SLOT_COUNT }, (_, index) =>
      loadout?.equipped?.[index] ? { ...loadout.equipped[index] } : null
    ),
    consumables: Array.from({ length: CONSUMABLE_SLOT_COUNT }, (_, index) =>
      loadout?.consumables?.[index] ? { ...loadout.consumables[index] } : null
    ),
  };
}

function normalizeProfileShape(profile = {}) {
  const next = { ...createDefaultProfile(profile.name), ...profile };
  next.loadout = normalizeLoadoutShape(profile.loadout);
  return next;
}

// ---- Vault capacity per upgrade rank ----

const VAULT_CAPACITY = [25, 35, 50, 75];

// ---- Upgrade definitions ----

export const UPGRADE_TRACKS = {
  thrust:   { label: 'thrust',   desc: 'ship acceleration',          statKey: 'ship.thrustAccel', multPerRank: 0.15 },
  hull:     { label: 'hull',     desc: 'well contact grace period',  statKey: null,               multPerRank: 0 },
  coupling: { label: 'coupling', desc: 'fluid current influence',    statKey: 'ship.fluidCoupling', multPerRank: 0.10 },
  drag:     { label: 'drag',     desc: 'velocity damping (lower)',   statKey: 'ship.drag',        multPerRank: -0.12 },
  sensor:   { label: 'sensor',   desc: 'detection range',            statKey: null,               multPerRank: 0 },
  vault:    { label: 'vault',    desc: 'storage capacity',           statKey: null,               multPerRank: 0 },
};

// EM costs per rank (all tracks except vault).
// Balance target: rank 1 after 1-2 extractions, rank 3 after 5-8 per track,
// full max (all tracks) after 25-30 extractions.
const RANK_COSTS = [
  { em: 250,  component: null },        // rank 1: EM only — achievable quickly
  { em: 800,  component: 'uncommon' },  // rank 2: meaningful investment
  { em: 2000, component: 'rare' },      // rank 3: serious commitment + rare drop
];

// Vault track has its own cost schedule (EM only, steep — this is the EM sink)
const VAULT_RANK_COSTS = [
  { em: 800 },
  { em: 2500 },
  { em: 6000 },
];

export const MAX_RANK = 3;

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
    const cleanName = (name || '').trim().slice(0, MAX_NAME_LENGTH) || generatePilotName();
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
    if (slotIndex < 0 || slotIndex >= MAX_SLOTS) return;
    this.slots[slotIndex] = null;
    if (this.activeSlot === slotIndex) this.activeSlot = -1;
    try { localStorage.removeItem(STORAGE_PREFIX + slotIndex); } catch (e) {}
    this._saveIndex();
  }

  // ---- Profile mutations ----

  /** Add exotic matter. */
  addEM(amount) {
    const p = this.active;
    if (!p) return;
    p.exoticMatter += amount;
    p.totalExoticMatterEarned += amount;
    this.save();
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
    if (!p) return;
    p.totalExtractions++;
    if (survivalTime > p.bestSurvivalTime) p.bestSurvivalTime = survivalTime;
    p.lastPlayed = new Date().toISOString();
    this.save();
  }

  recordDeath() {
    const p = this.active;
    if (!p) return;
    p.totalDeaths++;
    // Death tax: lose 10% of EM (minimum 0)
    const tax = Math.floor(p.exoticMatter * 0.1);
    p.exoticMatter -= tax;
    p.lastPlayed = new Date().toISOString();
    this.save();
    return tax;
  }

  // ---- Upgrades ----

  /** Get upgrade cost for a track at its next rank. Returns { em, componentTarget } or null if maxed. */
  getUpgradeCost(track) {
    const p = this.active;
    if (!p) return null;
    const currentRank = p.upgrades[track] ?? 0;
    if (currentRank >= MAX_RANK) return null;

    if (track === 'vault') {
      return { em: VAULT_RANK_COSTS[currentRank].em, componentTarget: null };
    }
    const cost = RANK_COSTS[currentRank];
    const componentTarget = cost.component ? `${track}.${currentRank + 1}` : null;
    // e.g., 'thrust.2' for rank 2 upgrade
    return { em: cost.em, componentTarget };
  }

  /** Check if player can afford an upgrade (has EM and component in vault). */
  canAffordUpgrade(track) {
    const p = this.active;
    if (!p) return false;
    const cost = this.getUpgradeCost(track);
    if (!cost) return false;
    if (p.exoticMatter < cost.em) return false;
    if (cost.componentTarget) {
      // Must have the matching component in vault
      return p.vault.some(item => item.upgradeTarget === cost.componentTarget);
    }
    return true;
  }

  /** Perform an upgrade. Consumes EM and component. Returns true on success. */
  performUpgrade(track) {
    const p = this.active;
    if (!p || !this.canAffordUpgrade(track)) return false;
    const cost = this.getUpgradeCost(track);

    // Consume EM
    p.exoticMatter -= cost.em;

    // Consume component from vault
    if (cost.componentTarget) {
      const idx = p.vault.findIndex(item => item.upgradeTarget === cost.componentTarget);
      if (idx >= 0) p.vault.splice(idx, 1);
    }

    // Increment rank
    p.upgrades[track]++;

    // Vault upgrade: increase capacity
    if (track === 'vault') {
      p.vaultCapacity = VAULT_CAPACITY[p.upgrades.vault] ?? VAULT_CAPACITY[VAULT_CAPACITY.length - 1];
    }

    this.save();
    return true;
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
      const profile = createDefaultProfile('Pilot Alpha');
      profile.exoticMatter = old.exoticMatter ?? 0;
      profile.vault = old.items ?? [];
      profile.totalExtractions = old.totalExtractions ?? 0;
      profile.totalItemsSold = old.totalItemsSold ?? 0;
      profile.bestSurvivalTime = old.bestSurvivalTime ?? 0;
      this.slots[0] = profile;
      this._saveSlot(0);
      this._saveIndex();
      // Remove legacy key
      localStorage.removeItem(LEGACY_VAULT_KEY);
    } catch (e) {}
  }
}
