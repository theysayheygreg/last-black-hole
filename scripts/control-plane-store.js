const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

// Rig tracks: 3 per hull, levels 0-5. Stored as array [track0, track1, track2].
const DEFAULT_RIG_LEVELS = [0, 0, 0];

const EQUIPPED_SLOT_COUNT = 2;
const CONSUMABLE_SLOT_COUNT = 2;

const DEFAULT_LOADOUT = {
  // Keep the durable profile contract aligned with the live client UI.
  // The 3-artifact-slot design still exists on paper, but the shipped game
  // currently exposes 2 equipped slots and 2 consumable slots.
  equipped: new Array(EQUIPPED_SLOT_COUNT).fill(null),
  consumables: new Array(CONSUMABLE_SLOT_COUNT).fill(null),
};

const DEFAULT_UPGRADES = {
  thrust: 0,
  hull: 0,
  coupling: 0,
  drag: 0,
  sensor: 0,
  vault: 0,
};

const DEFAULT_VAULT_CAPACITY = 25;

function nowIso() {
  return new Date().toISOString();
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function createProfileSkeleton(profileId, name = "Pilot") {
  const now = nowIso();
  return {
    id: profileId || crypto.randomUUID(),
    name,
    created: now,
    lastPlayed: now,
    exoticMatter: 0,
    vault: [],
    vaultCapacity: DEFAULT_VAULT_CAPACITY,
    loadout: clone(DEFAULT_LOADOUT),
    upgrades: { ...DEFAULT_UPGRADES },
    rigLevels: [...DEFAULT_RIG_LEVELS],
    hullType: "drifter",
    totalExtractions: 0,
    totalDeaths: 0,
    totalItemsSold: 0,
    bestSurvivalTime: 0,
    totalExoticMatterEarned: 0,
  };
}

function normalizeLoadout(loadout = {}) {
  return {
    equipped: Array.from({ length: EQUIPPED_SLOT_COUNT }, (_, index) =>
      loadout?.equipped?.[index] ? { ...loadout.equipped[index] } : null
    ),
    consumables: Array.from({ length: CONSUMABLE_SLOT_COUNT }, (_, index) =>
      loadout?.consumables?.[index] ? { ...loadout.consumables[index] } : null
    ),
  };
}

function normalizeProfileSnapshot(snapshot = {}, profileId = null, fallbackName = "Pilot") {
  const base = createProfileSkeleton(profileId || snapshot.id, snapshot.name || fallbackName);
  const rawUpgrades = snapshot.upgrades || {};
  const upgrades = {};
  for (const [key, defaultValue] of Object.entries(DEFAULT_UPGRADES)) {
    const raw = Number(rawUpgrades[key]);
    upgrades[key] = Number.isFinite(raw) ? Math.max(0, Math.min(3, Math.round(raw))) : defaultValue;
  }
  return {
    ...base,
    ...clone(snapshot),
    id: profileId || snapshot.id || base.id,
    name: snapshot.name || fallbackName || base.name,
    created: snapshot.created || base.created,
    lastPlayed: snapshot.lastPlayed || base.lastPlayed,
    exoticMatter: Number.isFinite(Number(snapshot.exoticMatter)) ? Number(snapshot.exoticMatter) : base.exoticMatter,
    vault: Array.isArray(snapshot.vault) ? snapshot.vault.map((item) => item ? { ...item } : null).filter(Boolean) : base.vault,
    vaultCapacity: Number.isFinite(Number(snapshot.vaultCapacity)) ? Number(snapshot.vaultCapacity) : base.vaultCapacity,
    loadout: normalizeLoadout(snapshot.loadout),
    upgrades,
    rigLevels: Array.isArray(snapshot.rigLevels)
      ? snapshot.rigLevels.map(v => Math.max(0, Math.min(5, Math.round(Number(v) || 0)))).slice(0, 3)
      : [...DEFAULT_RIG_LEVELS],
    // Legacy migration: shipType → hullType
    hullType: snapshot.hullType || snapshot.shipType || base.hullType,
    totalExtractions: Number.isFinite(Number(snapshot.totalExtractions)) ? Number(snapshot.totalExtractions) : base.totalExtractions,
    totalDeaths: Number.isFinite(Number(snapshot.totalDeaths)) ? Number(snapshot.totalDeaths) : base.totalDeaths,
    totalItemsSold: Number.isFinite(Number(snapshot.totalItemsSold)) ? Number(snapshot.totalItemsSold) : base.totalItemsSold,
    bestSurvivalTime: Number.isFinite(Number(snapshot.bestSurvivalTime)) ? Number(snapshot.bestSurvivalTime) : base.bestSurvivalTime,
    totalExoticMatterEarned: Number.isFinite(Number(snapshot.totalExoticMatterEarned)) ? Number(snapshot.totalExoticMatterEarned) : base.totalExoticMatterEarned,
  };
}

function sortVault(vault) {
  const catOrder = { artifact: 0, component: 1, dataCore: 2, salvage: 3 };
  const tierOrder = { unique: 0, rare: 1, uncommon: 2, common: 3 };
  vault.sort((a, b) => {
    const catA = catOrder[a.category] ?? 9;
    const catB = catOrder[b.category] ?? 9;
    if (catA !== catB) return catA - catB;
    const tierA = tierOrder[a.tier] ?? 9;
    const tierB = tierOrder[b.tier] ?? 9;
    if (tierA !== tierB) return tierA - tierB;
    return (b.value || 0) - (a.value || 0);
  });
}

class ControlPlaneStore {
  constructor(filepath) {
    this.filepath = path.resolve(filepath);
    this.state = this._load();
  }

  _load() {
    try {
      const raw = fs.readFileSync(this.filepath, "utf8");
      const parsed = JSON.parse(raw);
      return {
        version: 1,
        profiles: parsed.profiles || {},
        sessions: parsed.sessions || {},
        runs: parsed.runs || {},
        // Echoes: map of mapId → seed → array of chronicle wrecks (max 8 each).
        // An echo is evidence of a past cycle that persists in the
        // present one. Scoped by both map and seed so identical numeric
        // signatures on different maps do not bleed into each other.
        echoes: parsed.echoes || {},
      };
    } catch {
      return {
        version: 1,
        profiles: {},
        sessions: {},
        runs: {},
        echoes: {},
      };
    }
  }

  _save() {
    fs.mkdirSync(path.dirname(this.filepath), { recursive: true });
    fs.writeFileSync(this.filepath, `${JSON.stringify(this.state, null, 2)}\n`);
  }

  bootstrapProfile({ profileId, snapshot, fallbackName = "Pilot" }) {
    const normalized = normalizeProfileSnapshot(snapshot || {}, profileId, fallbackName);
    const existing = this.state.profiles[normalized.id];
    // Stored profile is authoritative for durable fields (EM, vault, stats, loadout).
    // Client snapshot only wins for transient/display fields (name) or if no stored profile exists.
    const nextProfile = existing
      ? {
          ...normalized,
          ...normalizeProfileSnapshot(existing, normalized.id, normalized.name),
          // Client can update display name only
          name: normalized.name || existing.name,
          created: existing.created || normalized.created,
        }
      : normalized;
    this.state.profiles[nextProfile.id] = clone(nextProfile);
    this._save();
    return clone(nextProfile);
  }

  getProfile(profileId) {
    if (!profileId) return null;
    const profile = this.state.profiles[profileId];
    return profile ? clone(profile) : null;
  }

  saveProfile(profile) {
    if (!profile?.id) throw new Error("profile.id is required");
    const normalized = normalizeProfileSnapshot(profile, profile.id, profile.name);
    this.state.profiles[normalized.id] = clone(normalized);
    this._save();
    return clone(normalized);
  }

  applyOutcome({ profileId, player, outcome, runDuration = 0, session = null }) {
    const profile = this.getProfile(profileId) || createProfileSkeleton(profileId, player?.name || "Pilot");
    const result = {
      outcome,
      tax: 0,
      overflowValue: 0,
      extractedCount: 0,
    };

    profile.lastPlayed = nowIso();
    profile.loadout = normalizeLoadout({
      equipped: player?.equipped || [],
      consumables: player?.consumables || [],
    });

    if (outcome === "dead") {
      profile.totalDeaths += 1;
      result.tax = Math.floor((profile.exoticMatter || 0) * 0.1);
      profile.exoticMatter = Math.max(0, (profile.exoticMatter || 0) - result.tax);
    }

    if (outcome === "escaped") {
      profile.totalExtractions += 1;
      if (runDuration > profile.bestSurvivalTime) {
        profile.bestSurvivalTime = runDuration;
      }
      const cargoItems = Array.isArray(player?.cargo)
        ? player.cargo.filter(Boolean).map((item) => ({ ...item }))
        : [];
      result.extractedCount = cargoItems.length;
      for (const item of cargoItems) {
        if (profile.vault.length < profile.vaultCapacity) {
          profile.vault.push(item);
        } else {
          const value = item.value || 0;
          result.overflowValue += value;
          profile.exoticMatter += value;
          profile.totalExoticMatterEarned += value;
        }
      }
      sortVault(profile.vault);
    }

    const saved = this.saveProfile(profile);
    if (session?.id) {
      const runId = session.runId || session.id;
      this.state.runs[runId] = {
        runId,
        sessionId: session.id,
        profileId: saved.id,
        outcome,
        runDuration,
        updatedAt: nowIso(),
        tax: result.tax,
        overflowValue: result.overflowValue,
        extractedCount: result.extractedCount,
        mapId: session.mapId || null,
      };
      this._save();
    }
    return { profile: saved, result };
  }

  upsertSession(session, players = []) {
    if (!session?.id) return null;
    const now = nowIso();
    const existing = this.state.sessions[session.id] || {};
    const next = {
      ...existing,
      sessionId: session.id,
      runId: session.runId || existing.runId || session.id,
      simInstanceId: session.simInstanceId || existing.simInstanceId || "local-sim",
      hostClientId: session.hostClientId || null,
      hostProfileId: session.hostProfileId || null,
      hostName: session.hostName || null,
      mapId: session.mapId || null,
      mapName: session.mapName || null,
      status: session.status || "idle",
      worldScale: session.worldScale || null,
      playerCount: players.filter((player) => !player.isAI).length,
      maxPlayers: session.maxPlayers || 0,
      players: players
        .filter((player) => !player.isAI)
        .map((player) => ({
          clientId: player.clientId,
          profileId: player.profileId || null,
          name: player.name,
          status: player.status,
        })),
      createdAt: existing.createdAt || now,
      updatedAt: now,
    };
    this.state.sessions[session.id] = next;
    this._save();
    return clone(next);
  }

  markSessionEnded(session, players = [], extra = {}) {
    if (!session?.id) return null;
    return this.upsertSession({
      ...session,
      status: extra.status || "ended",
    }, players);
  }

  // --- Echoes ---
  // An echo is residue from a past cycle — a chronicle wreck left by
  // a pilot whose run did not finish the way this one will. Keyed by
  // mapId + seed so identical numeric signatures on different maps do
  // not bleed into each other.
  // Max ECHO_MAX_PER_SEED per seed; oldest by createdAt evicted first.

  saveEchoWreck(wreck) {
    if (!wreck?.mapId) throw new Error("echo.mapId is required");
    if (!wreck?.seed) throw new Error("echo.seed is required");
    if (!wreck?.wreckId) throw new Error("echo.wreckId is required");
    const mapKey = String(wreck.mapId);
    const seedKey = String(wreck.seed);
    if (!this.state.echoes[mapKey]) {
      this.state.echoes[mapKey] = {};
    }
    if (!this.state.echoes[mapKey][seedKey]) {
      this.state.echoes[mapKey][seedKey] = [];
    }
    const list = this.state.echoes[mapKey][seedKey];
    // Replace if an echo with the same id already exists (idempotent)
    const existingIdx = list.findIndex((e) => e.wreckId === wreck.wreckId);
    const record = clone(wreck);
    if (!record.createdAt) record.createdAt = nowIso();
    if (existingIdx >= 0) {
      list[existingIdx] = record;
    } else {
      list.push(record);
    }
    // Evict oldest if over cap
    const ECHO_MAX_PER_SEED = 8;
    if (list.length > ECHO_MAX_PER_SEED) {
      list.sort((a, b) => (a.createdAt || "").localeCompare(b.createdAt || ""));
      list.splice(0, list.length - ECHO_MAX_PER_SEED);
    }
    this._save();
    return clone(record);
  }

  getEchoesForSeed(seed, mapId = null) {
    if (seed == null) return [];
    if (mapId == null) {
      // Legacy fallback for older callers. Intentionally returns no echoes
      // rather than cross-map data; callers should provide mapId.
      return [];
    }
    const mapKey = String(mapId);
    const mapGroup = this.state.echoes[mapKey];
    if (!mapGroup || Array.isArray(mapGroup)) return [];
    const list = mapGroup[String(seed)];
    if (!Array.isArray(list)) return [];
    return list.map((e) => clone(e));
  }

  clearEchoesForSeed(seed, mapId = null) {
    if (seed == null || mapId == null) return 0;
    const mapKey = String(mapId);
    const seedKey = String(seed);
    const mapGroup = this.state.echoes[mapKey];
    if (!mapGroup || Array.isArray(mapGroup)) return 0;
    const existing = mapGroup[seedKey];
    if (!existing) return 0;
    const count = existing.length;
    delete mapGroup[seedKey];
    if (Object.keys(mapGroup).length === 0) {
      delete this.state.echoes[mapKey];
    }
    this._save();
    return count;
  }
}

module.exports = {
  ControlPlaneStore,
  normalizeProfileSnapshot,
};
