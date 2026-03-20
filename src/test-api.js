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
  };

  window.CONFIG = CONFIG;
}
