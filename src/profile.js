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

import { BALANCE, deathTaxEm } from './content/balance.js';

const STORAGE_PREFIX = 'lbh_profile_';
const INDEX_KEY = 'lbh_profiles_index';
const LEGACY_VAULT_KEY = 'lbh_vault';
const MAX_SLOTS = 3;
const MAX_NAME_LENGTH = 16;
const EQUIPPED_SLOT_COUNT = 2;
const CONSUMABLE_SLOT_COUNT = 2;
const HULL_TYPES = ['drifter', 'breacher', 'resonant', 'shroud', 'hauler'];
const DEFAULT_HULL_TYPE = 'drifter';
const RIG_SLOT_COUNT = 3;
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

function normalizeHullType(hullType, legacyShipType) {
  const raw = String(hullType || legacyShipType || DEFAULT_HULL_TYPE).toLowerCase();
  return HULL_TYPES.includes(raw) ? raw : DEFAULT_HULL_TYPE;
}

function normalizeRigLevels(rigLevels = []) {
  return Array.from({ length: RIG_SLOT_COUNT }, (_, index) => {
    const value = Number(rigLevels?.[index]);
    if (!Number.isFinite(value)) return 0;
    return Math.max(0, Math.min(MAX_RIG_LEVEL, Math.round(value)));
  });
}

function normalizeProfileShape(profile = {}) {
  const next = { ...createDefaultProfile(profile.name), ...profile };
  next.hullType = normalizeHullType(profile.hullType, profile.shipType);
  next.shipType = next.hullType;
  next.rigLevels = normalizeRigLevels(profile.rigLevels);
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
const RANK_COSTS = BALANCE.progression.profileUpgradeCosts;

// Vault track has its own cost schedule (EM only, steep — this is the EM sink)
const VAULT_RANK_COSTS = BALANCE.progression.vaultUpgradeCosts;

export const MAX_RANK = BALANCE.progression.maxProfileRank;

export const RIG_TRACKS = {
  drifter: [
    { key: 'laminar', label: 'laminar', focus: 'current mastery' },
    { key: 'edgerunner', label: 'edgerunner', focus: 'well navigation' },
    { key: 'gleanings', label: 'gleanings', focus: 'extraction value' },
  ],
  breacher: [
    { key: 'afterburner', label: 'afterburner', focus: 'raw speed' },
    { key: 'ironclad', label: 'ironclad', focus: 'survivability' },
    { key: 'smashgrab', label: 'smash & grab', focus: 'speed-looting' },
  ],
  resonant: [
    { key: 'harmonics', label: 'harmonics', focus: 'eddy mastery' },
    { key: 'anchor', label: 'anchor', focus: 'territorial control' },
    { key: 'dampening', label: 'dampening', focus: 'anti-inhibitor' },
  ],
  shroud: [
    { key: 'phantom', label: 'phantom', focus: 'stealth depth' },
    { key: 'sensor', label: 'sensor', focus: 'information' },
    { key: 'decoy', label: 'decoy', focus: 'misdirection' },
  ],
  hauler: [
    { key: 'cargo', label: 'cargo', focus: 'carrying capacity' },
    { key: 'salvage', label: 'salvage', focus: 'loot quality' },
    { key: 'endurance', label: 'endurance', focus: 'survivability' },
  ],
};

const RIG_LEVEL_COSTS = BALANCE.progression.rigLevelCosts;

export const RIG_LEVEL_EFFECTS = {
  drifter: [
    ['+0.1 currentCoupling', 'flow lock align time -0.5s', '+0.1 currentCoupling', 'flow lock align time -0.5s', 'flow lock signal mult -> 0.05'],
    ['+0.1 wellResistScale', 'accretion shadow signal masking', '+0.1 wellResistScale', 'show well kill radius', 'eddy brake cooldown -5s'],
    ['+0.1 pickupRadius', 'wreck tier estimate in HUD', '+0.1 pickupRadius', '+1 extraction item chance', 'slip stream signal reduction -> 0.5'],
  ],
  breacher: [
    ['+5s burn fuel', '+0.1 thrustScale', '+5s burn fuel', 'burn recharge rate +50%', 'burn thrust mult -> 2.5'],
    ['+0.1 wellResistScale', '+0.15 controlDebuffResist', 'momentum shield threshold -10%', 'shield charge on first burn', 'shockwave stun +1s'],
    ['pickup at 90% speed', '+0.1 pickupRadius', 'pickup at 70% speed', 'death cargo scatters further', 'loot signal spikes -30%'],
  ],
  resonant: [
    ['+1 max eddy', 'eddy duration +2s', 'eddies pull wrecks', '+1 max eddy', 'team-visible eddies'],
    ['tap range +0.1 wu', 'tap cooldown -5s', 'pulse cooldown -20% near anchor', 'anchor persists through death', 'frequency shift cooldown -15s'],
    ['dampening slow +10%', 'eddies reduce signal inside', 'dampening slow +10%', 'eddies block inhibitor form 1', 'form 3 vessel slow'],
  ],
  shroud: [
    ['ghost trail threshold -> PRESENCE', '+0.1 signalDecayMult', 'wake cloak cooldown -10s', 'scavengers never detect ghost trail', 'wake cloak works at THRESHOLD'],
    ['+0.1 sensorRange', 'see inhibitor tracking target', '+0.1 sensorRange', 'see wreck contents', 'see player equipped items'],
    ['+1 decoy charge', 'decoy duration +4s', 'decoy cooldown -20s', 'decoys attract fauna', 'remote decoy placement'],
  ],
  hauler: [
    ['+1 cargo slot', 'tagged wrecks glow further', '+1 cargo slot', 'block first swarm drain', 'salvage lock +1 charge'],
    ['deep scanner names items', 'tagged wreck bonus +1 item', 'tractor range +0.05 wu', 'tagged wreck lockout 10s', 'tractor can pull portals'],
    ['reinforced hull scatters 0 cargo', '+0.1 wellResistScale', 'tractor cooldown -10s', 'reinforced hull +1 charge', 'full-cargo speed +10%'],
  ],
};

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

  setHullType(hullType) {
    const p = this.active;
    if (!p) return false;
    const nextHull = normalizeHullType(hullType);
    p.hullType = nextHull;
    p.shipType = nextHull;
    p.rigLevels = normalizeRigLevels(p.rigLevels);
    this.save();
    return true;
  }

  getRigProgression() {
    const p = this.active;
    if (!p) return null;
    const hullType = normalizeHullType(p.hullType, p.shipType);
    const levels = normalizeRigLevels(p.rigLevels);
    const tracks = RIG_TRACKS[hullType] || RIG_TRACKS[DEFAULT_HULL_TYPE];
    return {
      hullType,
      maxLevel: MAX_RIG_LEVEL,
      levels,
      tracks: tracks.map((track, index) => ({
        ...track,
        index,
        level: levels[index] ?? 0,
        nextEffect: RIG_LEVEL_EFFECTS[hullType]?.[index]?.[levels[index] ?? 0] || null,
      })),
    };
  }

  getRigUpgradeCost(trackIndex) {
    const p = this.active;
    if (!p) return null;
    const index = Number(trackIndex);
    if (!Number.isInteger(index) || index < 0 || index >= RIG_SLOT_COUNT) return null;
    const levels = normalizeRigLevels(p.rigLevels);
    const currentLevel = levels[index] ?? 0;
    if (currentLevel >= MAX_RIG_LEVEL) return null;
    return {
      em: RIG_LEVEL_COSTS[currentLevel],
      trackIndex: index,
      nextLevel: currentLevel + 1,
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
    p.rigLevels = normalizeRigLevels(p.rigLevels);
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
    const tax = deathTaxEm(p.exoticMatter);
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
