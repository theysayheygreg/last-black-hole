/**
 * test-api.js — Exposes window.__TEST_API for automated tests and dev tools.
 *
 * V3: World-space coordinates. Ship pos in world-units.
 */

import { CONFIG } from './config.js';
import { WORLD_SCALE, worldToFluidUV, fluidVelToScreen } from './coords.js';

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
      const { fluid } = getState();
      if (!fluid) return { x: 0, y: 0 };
      const [fuv_x, fuv_y] = worldToFluidUV(worldX, worldY);
      const [fvx, fvy] = fluid.readVelocityAt(
        Math.max(0, Math.min(1, fuv_x)),
        Math.max(0, Math.min(1, fuv_y))
      );
      const [svx, svy] = fluidVelToScreen(fvx, fvy);
      return { x: svx, y: svy };
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

    triggerRestart() {
      const { restart } = getState();
      if (restart) restart();
    },
  };

  window.CONFIG = CONFIG;
}
