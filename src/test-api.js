/**
 * test-api.js — Exposes window.__TEST_API for automated tests and dev tools.
 *
 * V3: World-space coordinates. Ship pos in world-units.
 */

import { CONFIG } from './config.js';
import { WORLD_SCALE, GRID_WINDOW, getFluidCamera, worldToScreen } from './coords.js';
import { getAbilityPresentationState } from './hud.js';

function clone(value) {
  return value == null ? value : JSON.parse(JSON.stringify(value));
}

function abilitySlotState(abilityState, slot) {
  const as = abilityState || {};
  const hull = as.hullType || 'drifter';
  if (slot === 1) {
    if (hull === 'drifter') {
      return {
        key: 'ability1',
        name: as.flowLockActive ? 'flow lock' : 'eddy brake',
        ready: (as.eddyBrakeCooldown || 0) <= 0,
        active: Boolean(as.flowLockActive),
        cooldown: as.eddyBrakeCooldown || 0,
      };
    }
    if (hull === 'breacher') {
      return {
        key: 'ability1',
        name: 'burn',
        ready: !as.burnActive && (as.burnFuel || 0) > 1,
        active: Boolean(as.burnActive),
        cooldown: 0,
        fuel: as.burnFuel || 0,
      };
    }
    if (hull === 'resonant') {
      return {
        key: 'ability1',
        name: 'tap',
        ready: (as.tapCooldown || 0) <= 0,
        active: Boolean(as.tapAnchor),
        cooldown: as.tapCooldown || 0,
      };
    }
    if (hull === 'shroud') {
      return {
        key: 'ability1',
        name: 'cloak',
        ready: (as.wakeCloakCooldown || 0) <= 0,
        active: false,
        cooldown: as.wakeCloakCooldown || 0,
      };
    }
    if (hull === 'hauler') {
      return {
        key: 'ability1',
        name: 'tag',
        ready: (as.salvageLockCharges || 0) > 0,
        active: false,
        cooldown: 0,
        charges: as.salvageLockCharges || 0,
      };
    }
  }

  if (hull === 'resonant') {
    return {
      key: 'ability2',
      name: 'shift',
      ready: (as.frequencyShiftCooldown || 0) <= 0,
      active: Boolean(as.nextPulseInverted),
      cooldown: as.frequencyShiftCooldown || 0,
    };
  }
  if (hull === 'shroud') {
    return {
      key: 'ability2',
      name: 'decoy',
      ready: (as.decoyCharges || 0) > 0 && (as.decoyCooldown || 0) <= 0,
      active: false,
      cooldown: as.decoyCooldown || 0,
      charges: as.decoyCharges || 0,
    };
  }
  if (hull === 'hauler') {
    return {
      key: 'ability2',
      name: 'tractor',
      ready: (as.tractorCooldown || 0) <= 0,
      active: (as.tractorChannelTimer || 0) > 0,
      cooldown: as.tractorCooldown || 0,
    };
  }
  return null;
}

export function initTestAPI(getState) {
  window.__TEST_API = {
    getShipPos() {
      const { ship } = getState();
      return { x: ship.wx, y: ship.wy };
    },

    /**
     * Ship position in render-space screen pixels. Uses the current
     * camera and canvas dimensions. Used by tests that need to place
     * a cursor on the ship (e.g. mouse deadzone verification).
     */
    getShipScreenPos() {
      const { ship, camX, camY, canvasWidth, canvasHeight } = getState();
      if (!ship || !Number.isFinite(camX) || !Number.isFinite(camY)) return null;
      const [sx, sy] = worldToScreen(ship.wx, ship.wy, camX, camY, canvasWidth, canvasHeight);
      return { x: sx, y: sy };
    },

    getShipVel() {
      const { ship } = getState();
      return { x: ship.vx, y: ship.vy };
    },

    getFluidVelAt(worldX, worldY) {
      const { flowField } = getState();
      if (!flowField) return { x: 0, y: 0 };
      return flowField.sample(worldX, worldY);
    },

    getFPS() {
      const { fps } = getState();
      return fps;
    },

    getPerfStats() {
      const { perfStats } = getState();
      return perfStats ? JSON.parse(JSON.stringify(perfStats)) : null;
    },

    getFluidGridState() {
      const { perfStats } = getState();
      const [camX, camY] = getFluidCamera();
      return {
        worldScale: WORLD_SCALE,
        gridWindow: GRID_WINDOW,
        fluidCamera: { x: camX, y: camY },
        perfStats: perfStats ? JSON.parse(JSON.stringify(perfStats)) : null,
      };
    },

    getGamePhase() {
      const { gamePhase } = getState();
      return gamePhase;
    },

    getRunResultsView() {
      const { getRunResultsViewModel } = getState();
      return getRunResultsViewModel ? getRunResultsViewModel() : null;
    },

    getChronicleView() {
      const { getChronicleViewModel } = getState();
      return getChronicleViewModel ? getChronicleViewModel() : null;
    },

    showRunResultsFixture(runResult, phase = null) {
      const state = getState();
      if (!state.setLastRunResult || !state.setEndScreenTimers) return false;
      if (state.profileManager && !state.profileManager.active) {
        state.profileManager.createProfile(0, 'Results Pilot');
      }
      state.setLastRunResult(runResult || null);
      const outcome = runResult?.outcome === 'extracted' ? 'escaped' : runResult?.outcome === 'escaped' ? 'escaped' : 'dead';
      state.gamePhase = phase || outcome;
      state.setEndScreenTimers({ death: 3.8, escape: 3.8 });
      return true;
    },

    getWells() {
      const { wellSystem, camX, camY, canvasWidth, canvasHeight } = getState();
      if (!wellSystem) return [];
      const screenData = wellSystem.getWellData(camX, camY, canvasWidth, canvasHeight);
      return wellSystem.wells.map((w, i) => ({
        ...screenData[i],  // x, y (screen coords), wx, wy, mass from getWellData
        name: w.name,
        killRadius: w.killRadius,
      }));
    },

    getConfig() {
      return JSON.parse(JSON.stringify(CONFIG));
    },

    teleportShip(wx, wy) {
      const { ship } = getState();
      ship.teleport(wx, wy);
    },

    setTimeScale(scale) {
      const { setTimeScale } = getState();
      if (setTimeScale) setTimeScale(scale);
    },

    loadTitleScene() {
      const { loadTitleScene } = getState();
      if (!loadTitleScene) return false;
      loadTitleScene();
      return true;
    },

    loadRendererFixture(name) {
      const { loadRendererFixture } = getState();
      if (!loadRendererFixture) return false;
      return loadRendererFixture(name);
    },

    setConfig(path, value) {
      const parts = path.split('.');
      let obj = CONFIG;
      for (let i = 0; i < parts.length - 1; i++) {
        obj = obj[parts[i]];
        if (!obj) return false;
      }
      obj[parts[parts.length - 1]] = value;
      return true;
    },

    setOverlayVisible(visible) {
      const { setOverlayVisible } = getState();
      if (!setOverlayVisible) return false;
      setOverlayVisible(visible);
      return true;
    },

    setRendererView(mode) {
      const { setRendererView } = getState();
      if (!setRendererView) return false;
      setRendererView(mode);
      return true;
    },

    getRendererView() {
      const { getRendererView } = getState();
      return getRendererView ? getRendererView() : 'ascii';
    },

    // Diagnostic-only: start a game on a specific map index (0=shallows,
    // 1=expanse, 2=deep-field). Used by ship-speed probes to compare
    // physics across map scales. Safe to keep — thin wrapper over startGame.
    startGameOnMap(index) {
      const { startGame, mapList, profileManager } = getState();
      if (profileManager && !profileManager.active) profileManager.createProfile(0, 'Test Pilot');
      if (!startGame || !mapList) return false;
      const map = mapList[index];
      if (!map) return false;
      startGame(map);
      return true;
    },

    triggerRestart() {
      const { startGame, mapList, profileManager } = getState();
      // NOTE: This bypasses the real profile→home→mapSelect UI flow for test speed.
      // The real flow (title→profileSelect→home→launch→mapSelect→play) is validated
      // by manual playtesting. Automating it is fragile due to multi-phase keyboard
      // simulation in Puppeteer. See Codex review 2026-03-27.
      if (profileManager && !profileManager.active) {
        profileManager.createProfile(0, 'Test Pilot');
      }
      if (startGame && mapList && mapList.length > 0) startGame(mapList[0]);
      else if (startGame) startGame(getState().currentMap);
    },

    startRemoteGame(mapIndex = 0) {
      const { playableMaps, transitionToRemoteGame } = getState();
      if (!playableMaps || !transitionToRemoteGame) return false;
      const entry = playableMaps[mapIndex] || playableMaps[0];
      transitionToRemoteGame(entry);
      return true;
    },

    resetRemoteGame(mapIndex = 0) {
      const { playableMaps, transitionToRemoteGame } = getState();
      if (!playableMaps || !transitionToRemoteGame) return false;
      const entry = playableMaps[mapIndex] || playableMaps[0];
      transitionToRemoteGame(entry, { forceReset: true });
      return true;
    },

    getNetworkState() {
      const { simClient, remoteAuthorityActive, remoteMapId, remoteSnapshot, remoteControlState } = getState();
      return {
        simEnabled: Boolean(simClient?.enabled),
        simUrl: simClient?.baseUrl || null,
        clientId: simClient?.clientId || null,
        remoteAuthorityActive: Boolean(remoteAuthorityActive),
        remoteMapId: remoteMapId || null,
        remoteTick: remoteSnapshot?.tick ?? null,
        remoteSimTime: remoteSnapshot?.simTime ?? null,
        sessionStatus: remoteControlState?.sessionStatus ?? null,
        sessionMapId: remoteControlState?.sessionMapId ?? null,
        sessionMapName: remoteControlState?.sessionMapName ?? null,
        sessionPlayerCount: remoteControlState?.sessionPlayerCount ?? 0,
        sessionHostClientId: remoteControlState?.hostClientId ?? null,
        sessionHostName: remoteControlState?.hostName ?? null,
        sessionIsHost: Boolean(remoteControlState?.isHost),
        sessionCanHostReset: Boolean(remoteControlState?.canHostReset),
        sessionWillJoinLiveRun: Boolean(remoteControlState?.willJoinLiveRun),
        sessionSelectedDiffersFromLive: Boolean(remoteControlState?.selectedDiffersFromLive),
        lastRemoteInput: simClient?.lastSentInput ? { ...simClient.lastSentInput } : null,
      };
    },

    async sendRemoteInput(message = {}) {
      const { simClient } = getState();
      if (!simClient?.enabled) return null;
      return simClient.sendInput(message);
    },

    createTestProfile(name) {
      const { profileManager } = getState();
      if (!profileManager) return null;
      return profileManager.createProfile(0, name || 'Test Pilot');
    },

    getProfile() {
      const { profileManager } = getState();
      const p = profileManager?.active;
      if (!p) return null;
      return {
        id: p.id,
        name: p.name,
        hullType: p.hullType || p.shipType || 'drifter',
        shipType: p.shipType || p.hullType || 'drifter',
        rigLevels: Array.isArray(p.rigLevels) ? [...p.rigLevels] : [0, 0, 0],
        exoticMatter: p.exoticMatter,
        vaultCount: p.vault.length,
        vaultCapacity: p.vaultCapacity,
        upgrades: { ...p.upgrades },
        loadout: {
          equipped: p.loadout.equipped.map(i => i ? { ...i } : null),
          consumables: p.loadout.consumables.map(i => i ? { ...i } : null),
        },
        totalExtractions: p.totalExtractions,
        totalDeaths: p.totalDeaths,
      };
    },

    setProfileShipType(hullType) {
      const { profileManager } = getState();
      return Boolean(profileManager?.setHullType?.(hullType));
    },

    getProgression() {
      const { profileManager } = getState();
      const p = profileManager?.active;
      if (!p) return null;
      return {
        hullType: p.hullType || p.shipType || 'drifter',
        rig: profileManager.getRigProgression?.() || null,
        upgrades: { ...p.upgrades },
        exoticMatter: p.exoticMatter,
      };
    },

    getHomeState() {
      const { gamePhase, homeTab, homeRigCursor, profileManager } = getState();
      const p = profileManager?.active;
      const rig = profileManager?.getRigProgression?.() || null;
      const tabNames = ['SHIP', 'VAULT', 'RIG', 'CHRONICLE', 'LAUNCH'];
      return {
        phase: gamePhase,
        tabIndex: homeTab ?? null,
        tabName: tabNames[homeTab] || null,
        rigCursor: homeRigCursor ?? null,
        hullType: p?.hullType || p?.shipType || null,
        exoticMatter: p?.exoticMatter ?? null,
        rig,
        selectedRig: rig?.tracks?.[homeRigCursor] || null,
        selectedRigCost: profileManager?.getRigUpgradeCost?.(homeRigCursor) || null,
        selectedRigAffordable: Boolean(profileManager?.canAffordRigUpgrade?.(homeRigCursor)),
        loadoutSlots: p ? {
          equipped: p.loadout.equipped.length,
          consumables: p.loadout.consumables.length,
        } : null,
      };
    },

    seedProfileRunRecords(records) {
      const { profileManager } = getState();
      const p = profileManager?.active;
      if (!p || !Array.isArray(records)) return false;
      p.runRecords = records.map((record) => ({ ...record }));
      profileManager.save();
      return true;
    },

    seedRecentEchoes(echoes) {
      const state = getState();
      if (!state.setRecentEchoes) return false;
      state.setRecentEchoes(echoes);
      return true;
    },

    queryRigUpgrade(trackIndex) {
      const { profileManager } = getState();
      if (!profileManager?.active) return null;
      const progression = profileManager.getRigProgression?.();
      const track = progression?.tracks?.[trackIndex] || null;
      const cost = profileManager.getRigUpgradeCost?.(trackIndex) || null;
      return {
        track,
        cost,
        canAfford: Boolean(profileManager.canAffordRigUpgrade?.(trackIndex)),
      };
    },

    purchaseRigUpgrade(trackIndex) {
      const { profileManager } = getState();
      return Boolean(profileManager?.performRigUpgrade?.(trackIndex));
    },

    seedProfileRigLevels(levels) {
      const { profileManager } = getState();
      const p = profileManager?.active;
      if (!p || !Array.isArray(levels)) return false;
      p.rigLevels = levels.slice(0, 3).map((value) => Math.max(0, Math.min(5, Math.round(Number(value) || 0))));
      while (p.rigLevels.length < 3) p.rigLevels.push(0);
      profileManager.save();
      return true;
    },

    seedProfileExoticMatter(amount) {
      const { profileManager } = getState();
      const p = profileManager?.active;
      if (!p) return false;
      p.exoticMatter = Math.max(0, Math.round(Number(amount) || 0));
      profileManager.save();
      return true;
    },

    getAbilityState() {
      const { localAbilityState, remoteSnapshot, simClient } = getState();
      const remotePlayer = remoteSnapshot?.players?.find((player) => player.clientId === simClient?.clientId);
      const raw = localAbilityState || remotePlayer?.abilityState || null;
      if (!raw) return null;
      return {
        hullType: raw.hullType || 'drifter',
        raw: clone(raw),
        ability1: abilitySlotState(raw, 1),
        ability2: abilitySlotState(raw, 2),
        presentation: getAbilityPresentationState(raw),
      };
    },

    getAbilityPresentationFixture(raw = {}) {
      return getAbilityPresentationState(raw);
    },

    seedProfileConsumable(slotIndex, item) {
      const { profileManager, inventorySystem } = getState();
      const p = profileManager?.active;
      if (!p) return false;
      if (slotIndex < 0 || slotIndex >= p.loadout.consumables.length) return false;
      const nextItem = item ? { ...item } : null;
      p.loadout.consumables[slotIndex] = nextItem;
      profileManager.save();
      if (inventorySystem) {
        inventorySystem.consumables[slotIndex] = nextItem ? { ...nextItem } : null;
      }
      return true;
    },

    seedProfileEquipped(slotIndex, item) {
      const { profileManager, inventorySystem } = getState();
      const p = profileManager?.active;
      if (!p) return false;
      if (slotIndex < 0 || slotIndex >= p.loadout.equipped.length) return false;
      const nextItem = item ? { ...item } : null;
      p.loadout.equipped[slotIndex] = nextItem;
      profileManager.save();
      if (inventorySystem) {
        inventorySystem.equipped[slotIndex] = nextItem ? { ...nextItem } : null;
      }
      return true;
    },

    // ---- Inventory API ----

    getInventory() {
      const { inventorySystem, inventoryOpen } = getState();
      if (!inventorySystem) return null;
      return {
        open: Boolean(inventoryOpen),
        cargo: inventorySystem.cargo.map(i => i ? { ...i } : null),
        cargoCount: inventorySystem.cargoCount,
        cargoMax: inventorySystem.cargoMax,
        cargoFull: inventorySystem.cargoFull,
        equipped: inventorySystem.equipped.map(i => i ? { ...i } : null),
        consumables: inventorySystem.consumables.map(i => i ? { ...i } : null),
        cargoValue: inventorySystem.getCargoValue(),
      };
    },

    getInputState() {
      const { inputManager } = getState();
      if (!inputManager) return null;
      return {
        facing: inputManager.facing,
        thrustIntensity: inputManager.thrustIntensity,
        brakeIntensity: inputManager.brakeIntensity,
        lastInputSource: inputManager.lastInputSource,
        mouseAimActive: Boolean(inputManager._mouse?.active),
        mouseDistancePx: inputManager._mouse?.distancePx ?? 0,
        ability1: Boolean(inputManager.ability1),
        ability2: Boolean(inputManager.ability2),
      };
    },

    dropFromCargo(slotIndex) {
      const { inventorySystem } = getState();
      if (!inventorySystem) return null;
      return inventorySystem.dropFromCargo(slotIndex);
    },

    equipFromCargo(cargoSlot, equipSlot = 0) {
      const { inventorySystem } = getState();
      if (!inventorySystem) return null;
      const item = inventorySystem.removeFromCargo(cargoSlot);
      if (!item) return null;
      const prev = inventorySystem.equip(equipSlot, item);
      if (prev) inventorySystem.addToCargo(prev);
      return item;
    },

    loadConsumableFromCargo(cargoSlot, hotbarSlot = 0) {
      const { inventorySystem } = getState();
      if (!inventorySystem) return null;
      const item = inventorySystem.removeFromCargo(cargoSlot);
      if (!item) return null;
      const prev = inventorySystem.loadConsumable(hotbarSlot, item);
      if (prev) inventorySystem.addToCargo(prev);
      return item;
    },

    useConsumable(slotIndex) {
      const { inventorySystem } = getState();
      if (!inventorySystem) return null;
      return inventorySystem.useConsumable(slotIndex);
    },

    getWrecks() {
      const { wreckSystem } = getState();
      if (!wreckSystem) return [];
      return wreckSystem.wrecks.map((wreck, index) => ({
        index,
        wx: wreck.wx,
        wy: wreck.wy,
        alive: wreck.alive,
        looted: wreck.looted,
        type: wreck.type,
        tier: wreck.tier,
        name: wreck.name,
        spawnTime: wreck.spawnTime,
        pickupCooldown: wreck.pickupCooldown,
        loot: wreck.loot?.map(item => item ? { ...item } : null) || [],
      }));
    },

    spawnTestWreck(wx, wy, opts = {}) {
      const { wreckSystem } = getState();
      if (!wreckSystem) return false;
      const wreck = wreckSystem.addWreck(wx, wy, {
        type: opts.type ?? 'derelict',
        tier: opts.tier ?? 1,
        size: opts.size ?? 'small',
        sessionTime: opts.sessionTime ?? 0,
        spawnTime: opts.spawnTime ?? opts.sessionTime ?? 0,
        pickupCooldown: opts.pickupCooldown ?? 0,
        vx: opts.vx ?? 0,
        vy: opts.vy ?? 0,
      });
      if (opts.loot) {
        wreck.loot = opts.loot.map(item => ({ ...item }));
      }
      if (opts.name) wreck.name = opts.name;
      return true;
    },

    pickupAtShip(opts = {}) {
      const { wreckSystem, inventorySystem, ship } = getState();
      if (!wreckSystem || !inventorySystem || !ship) return { pickedUp: 0, overflow: 0 };
      const slotsAvailable = inventorySystem.cargoMax - inventorySystem.cargoCount;
      const now = typeof opts.currentTime === 'number' ? opts.currentTime : 0;
      const newItems = wreckSystem.checkPickup(ship.wx, ship.wy, slotsAvailable, now);
      const overflow = inventorySystem.addMultipleToCargo(newItems);
      return {
        pickedUp: newItems.length - overflow.length,
        overflow: overflow.length,
      };
    },

    getScavengers() {
      const { scavengerSystem } = getState();
      if (!scavengerSystem) return [];
      return scavengerSystem.scavengers.map(s => ({
        id: s.id,
        wx: s.wx, wy: s.wy, alive: s.alive, archetype: s.archetype,
        state: s.state, lootCount: s.lootCount,
        name: s.name, faction: s.faction, callsign: s.callsign,
      }));
    },

    getCombatState() {
      const { combatSystem } = getState();
      if (!combatSystem) return null;
      return {
        playerCooldown: combatSystem.playerCooldown,
        playerReady: combatSystem.playerReady,
        wellDisruptions: combatSystem.wellDisruptions.length,
      };
    },

    firePlayerPulseForTest() {
      const {
        combatSystem, ship, fluid, waveRings, wellSystem, scavengerSystem, planetoidSystem,
      } = getState();
      if (!combatSystem || !ship || !fluid || !waveRings || !wellSystem) return false;
      return combatSystem.playerPulse(
        ship,
        fluid,
        waveRings,
        wellSystem,
        scavengerSystem,
        planetoidSystem
      );
    },

    getRemotePlayers() {
      const { remotePlayers } = getState();
      if (!Array.isArray(remotePlayers)) return [];
      return remotePlayers.map((player) => ({ ...player }));
    },

    getSignature() {
      const { currentSignature } = getState();
      return currentSignature ? { name: currentSignature.name, mechanical: currentSignature.mechanical } : null;
    },

    getStars() {
      const { starSystem } = getState();
      if (!starSystem) return [];
      return starSystem.stars.map(s => ({
        wx: s.wx, wy: s.wy, mass: s.mass, type: s.type,
        name: s.name, alive: s.alive, asteroidCount: s.asteroids.length,
      }));
    },

    getComets() {
      const { planetoidSystem } = getState();
      if (!planetoidSystem) return [];
      return planetoidSystem.planetoids.map(p => ({
        wx: p.wx, wy: p.wy, name: p.name, alive: p.alive, pathType: p.pathType,
      }));
    },

    getGamePhase() {
      return getState().gamePhase;
    },

    getVault() {
      const { profileManager } = getState();
      const p = profileManager?.active;
      if (!p) return null;
      return {
        exoticMatter: p.exoticMatter,
        itemCount: p.vault.length,
        vaultCapacity: p.vaultCapacity,
        totalExtractions: p.totalExtractions,
        bestSurvivalTime: p.bestSurvivalTime,
        upgrades: { ...p.upgrades },
      };
    },
  };

  window.CONFIG = CONFIG;
}
