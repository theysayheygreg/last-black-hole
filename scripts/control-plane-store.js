const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

// Rig tracks: 3 per hull, levels 0-5. Stored as array [track0, track1, track2].
const DEFAULT_RIG_LEVELS = [0, 0, 0];

const DEFAULT_LOADOUT = {
  equipped: [null, null, null], // 3 artifact slots
  consumables: [null, null],    // 2 consumable slots
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
    equipped: [0, 1, 2].map((index) => loadout?.equipped?.[index] ? { ...loadout.equipped[index] } : null),
    consumables: [0, 1].map((index) => loadout?.consumables?.[index] ? { ...loadout.consumables[index] } : null),
  };
}

function normalizeProfileSnapshot(snapshot = {}, profileId = null, fallbackName = "Pilot") {
  const base = createProfileSkeleton(profileId || snapshot.id, snapshot.name || fallbackName);
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
    rigLevels: Array.isArray(snapshot.rigLevels)
      ? snapshot.rigLevels.map(v => Math.max(0, Math.min(5, Math.round(Number(v) || 0)))).slice(0, 3)
      : [...DEFAULT_RIG_LEVELS],
    hullType: snapshot.hullType || base.hullType,
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
      };
    } catch {
      return {
        version: 1,
        profiles: {},
        sessions: {},
        runs: {},
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
}

module.exports = {
  ControlPlaneStore,
  normalizeProfileSnapshot,
};
