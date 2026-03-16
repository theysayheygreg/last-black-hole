/**
 * test-api.js — Exposes window.__TEST_API for automated tests and dev tools.
 *
 * Every function reads live state — no stale caches.
 */

import { CONFIG } from './config.js';

export function initTestAPI(getState) {
  window.__TEST_API = {
    getShipPos() {
      const { ship } = getState();
      return { x: ship.x, y: ship.y };
    },

    getShipVel() {
      const { ship } = getState();
      return { x: ship.vx, y: ship.vy };
    },

    getFluidVelAt(pixelX, pixelY) {
      const { fluid, canvasWidth, canvasHeight } = getState();
      if (!fluid) return { x: 0, y: 0 };
      const uvX = pixelX / canvasWidth;
      const uvY = pixelY / canvasHeight;
      const [vx, vy] = fluid.readVelocityAt(
        Math.max(0, Math.min(1, uvX)),
        Math.max(0, Math.min(1, uvY))
      );
      return { x: vx, y: vy };
    },

    getFPS() {
      const { fps } = getState();
      return fps;
    },

    getWells() {
      const { wellSystem, canvasWidth, canvasHeight } = getState();
      if (!wellSystem) return [];
      return wellSystem.getWellData(canvasWidth, canvasHeight);
    },

    getConfig() {
      return JSON.parse(JSON.stringify(CONFIG));
    },

    teleportShip(x, y) {
      const { ship } = getState();
      ship.teleport(x, y);
    },

    setTimeScale(scale) {
      const { setTimeScale } = getState();
      if (setTimeScale) setTimeScale(scale);
    },

    setConfig(path, value) {
      // path like "ship.thrustForce"
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

  // Also expose CONFIG globally for the smoke test that checks `typeof CONFIG`
  window.CONFIG = CONFIG;
}
