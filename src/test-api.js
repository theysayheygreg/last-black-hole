/**
 * test-api.js — Exposes window.__TEST_API for automated tests and dev tools.
 *
 * V3: World-space coordinates. Ship pos in world-units.
 */

import { CONFIG } from './config.js';
import { WORLD_SCALE } from './coords.js';

export function initTestAPI(getState) {
  window.__TEST_API = {
    getShipPos() {
      const { ship } = getState();
      return { x: ship.wx, y: ship.wy };
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

    getGamePhase() {
      const { gamePhase } = getState();
      return gamePhase;
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

    getNetworkState() {
      const { simClient, remoteAuthorityActive, remoteMapId, remoteSnapshot } = getState();
      return {
        simEnabled: Boolean(simClient?.enabled),
        simUrl: simClient?.baseUrl || null,
        clientId: simClient?.clientId || null,
        remoteAuthorityActive: Boolean(remoteAuthorityActive),
        remoteMapId: remoteMapId || null,
        remoteTick: remoteSnapshot?.tick ?? null,
        remoteSimTime: remoteSnapshot?.simTime ?? null,
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
        name: p.name,
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

    // ---- Inventory API ----

    getInventory() {
      const { inventorySystem } = getState();
      if (!inventorySystem) return null;
      return {
        cargo: inventorySystem.cargo.map(i => i ? { ...i } : null),
        cargoCount: inventorySystem.cargoCount,
        cargoMax: inventorySystem.cargoMax,
        cargoFull: inventorySystem.cargoFull,
        equipped: inventorySystem.equipped.map(i => i ? { ...i } : null),
        consumables: inventorySystem.consumables.map(i => i ? { ...i } : null),
        cargoValue: inventorySystem.getCargoValue(),
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
        name: wreck.name,
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

    pickupAtShip() {
      const { wreckSystem, inventorySystem, ship } = getState();
      if (!wreckSystem || !inventorySystem || !ship) return { pickedUp: 0, overflow: 0 };
      const slotsAvailable = inventorySystem.cargoMax - inventorySystem.cargoCount;
      const newItems = wreckSystem.checkPickup(ship.wx, ship.wy, slotsAvailable);
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
