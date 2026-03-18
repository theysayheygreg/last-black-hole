/**
 * portals.js — Exit wormholes for extraction loop.
 *
 * Each portal has a weak inward pull (like a gentle well), purple/magenta
 * density injection with a rotating 3-arm spiral, and a pulsing overlay ring.
 * Flying into a portal's capture radius triggers extraction ("ESCAPED").
 */

import { CONFIG } from './config.js';
import { worldToFluidUV, worldToScreen, worldDistance, CAMERA_VIEW, uvScale } from './coords.js';

class Portal {
  constructor(wx, wy) {
    this.wx = wx;
    this.wy = wy;
  }
}

export class PortalSystem {
  constructor() {
    this.portals = [];
  }

  addPortal(wx, wy) {
    const portal = new Portal(wx, wy);
    this.portals.push(portal);
    return portal;
  }

  /**
   * Apply portal fluid effects: weak inward pull + purple density spiral.
   */
  update(fluid, dt, totalTime, camX, camY) {
    const cfg = CONFIG.portals;
    const cullDist = CAMERA_VIEW + 0.5;
    const s = uvScale();
    const s2 = s * s;

    for (const portal of this.portals) {
      if (camX != null && worldDistance(portal.wx, portal.wy, camX, camY) > cullDist) continue;

      const [fu, fv] = worldToFluidUV(portal.wx, portal.wy);

      // Weak inward pull (scaled for world size)
      fluid.applyWellForce(
        [fu, fv],
        cfg.gravity * Math.pow(s, cfg.falloff),
        cfg.falloff,
        cfg.fluidClampRadius,
        cfg.orbitalStrength,
        dt,
        cfg.fluidTerminalSpeed * s
      );

      // Rotating 3-arm spiral density injection (purple/magenta)
      const spiralAngle = totalTime * cfg.spiralSpeed;
      for (let arm = 0; arm < cfg.spiralArms; arm++) {
        const baseAngle = spiralAngle + (arm / cfg.spiralArms) * Math.PI * 2;
        for (let p = 0; p < 4; p++) {
          const t = (p + 1) / 4;
          const dist = t * 0.025 * s;
          const windAngle = baseAngle + t * 1.5;
          const px = fu + Math.cos(windAngle) * dist;
          const py = fv + Math.sin(windAngle) * dist;
          const fade = 1 - t * 0.5;
          const b = cfg.densityRate * fade;
          fluid.splat(
            px, py,
            0, 0,
            0.002 * s2,
            b * 0.6,
            b * 0.15,
            b * 1.0
          );
        }
      }

      // Core glow
      fluid.splat(fu, fv, 0, 0, 0.003 * s2,
        cfg.densityRate * 0.5,
        cfg.densityRate * 0.2,
        cfg.densityRate * 0.8
      );
    }
  }

  /**
   * Check if ship is within any portal's capture radius.
   * Returns the portal or null.
   */
  checkExtraction(shipWX, shipWY) {
    const cfg = CONFIG.portals;
    for (const portal of this.portals) {
      const dist = worldDistance(shipWX, shipWY, portal.wx, portal.wy);
      if (dist < cfg.captureRadius) return portal;
    }
    return null;
  }

  /**
   * Render portal overlay markers (pulsing rings, purple/cyan).
   */
  render(ctx, camX, camY, canvasW, canvasH, totalTime) {
    const cfg = CONFIG.portals;

    for (const portal of this.portals) {
      const [sx, sy] = worldToScreen(portal.wx, portal.wy, camX, camY, canvasW, canvasH);
      const pulse = 0.5 + 0.5 * Math.sin(totalTime * cfg.pulseRate * Math.PI * 2);

      ctx.save();

      // Outer ring — purple, pulsing
      ctx.beginPath();
      ctx.arc(sx, sy, cfg.overlaySize + 4 + pulse * 3, 0, Math.PI * 2);
      ctx.strokeStyle = `rgba(180, 80, 255, ${0.3 + 0.2 * pulse})`;
      ctx.lineWidth = 2;
      ctx.stroke();

      // Inner ring — cyan
      ctx.beginPath();
      ctx.arc(sx, sy, cfg.overlaySize * 0.7, 0, Math.PI * 2);
      ctx.strokeStyle = `rgba(100, 255, 255, ${0.4 + 0.3 * pulse})`;
      ctx.lineWidth = 1.5;
      ctx.stroke();

      // Center dot
      ctx.beginPath();
      ctx.arc(sx, sy, 3, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(200, 150, 255, ${0.7 + 0.3 * pulse})`;
      ctx.fill();

      // Label
      ctx.fillStyle = `rgba(180, 120, 255, ${0.5 + 0.2 * pulse})`;
      ctx.font = '10px monospace';
      ctx.textAlign = 'center';
      ctx.fillText('EXIT', sx, sy - cfg.overlaySize - 6);

      ctx.restore();
    }
  }

  getUVPositions() {
    return this.portals.map(p => worldToFluidUV(p.wx, p.wy));
  }
}
