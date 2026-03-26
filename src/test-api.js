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

    getWells() {
      const { wellSystem, camX, camY, canvasWidth, canvasHeight } = getState();
      if (!wellSystem) return [];
      return wellSystem.getWellData(camX, camY, canvasWidth, canvasHeight);
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
      const { startGame, mapList } = getState();
      // Start the first playable map (not the title map)
      if (startGame && mapList && mapList.length > 0) startGame(mapList[0]);
      else if (startGame) startGame(getState().currentMap);
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
      const newItems = wreckSystem.checkPickup(ship.wx, ship.wy);
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

    getVault() {
      const { vault } = getState();
      if (!vault) return null;
      return {
        exoticMatter: vault.exoticMatter,
        itemCount: vault.items.length,
        totalExtractions: vault.totalExtractions,
        bestSurvivalTime: vault.bestSurvivalTime,
      };
    },
  };

  window.CONFIG = CONFIG;
}
