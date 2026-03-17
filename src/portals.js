/**
 * portals.js — Exit wormholes for extraction loop.
 *
 * Each portal has a weak inward pull (like a gentle well), purple/magenta
 * density injection with a rotating 3-arm spiral, and a pulsing overlay ring.
 * Flying into a portal's capture radius triggers extraction ("ESCAPED").
 */

import { CONFIG } from './config.js';
import { worldToFluidUV, worldToScreen, worldDistance } from './coords.js';

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
  update(fluid, dt, totalTime) {
    const cfg = CONFIG.portals;

    for (const portal of this.portals) {
      const [fu, fv] = worldToFluidUV(portal.wx, portal.wy);

      // Weak inward pull (about 1/3 of well gravity)
      fluid.applyWellForce(
        [fu, fv],
        cfg.gravity,
        cfg.falloff,
        cfg.fluidClampRadius,
        cfg.orbitalStrength,
        dt,
        cfg.fluidTerminalSpeed
      );

      // Rotating 3-arm spiral density injection (purple/magenta)
      const spiralAngle = totalTime * cfg.spiralSpeed;
      for (let arm = 0; arm < cfg.spiralArms; arm++) {
        const baseAngle = spiralAngle + (arm / cfg.spiralArms) * Math.PI * 2;
        // 4 points per arm along a spiral
        // 4 splats per arm, spiraling outward from center
        for (let p = 0; p < 4; p++) {
          const t = (p + 1) / 4;       // 0.25 to 1.0 along arm
          const dist = t * 0.025;       // max 0.025 UV from center (~0.075 world-units)
          const windAngle = baseAngle + t * 1.5; // 1.5 radians of twist gives visible spiral curl
          const px = fu + Math.cos(windAngle) * dist;
          const py = fv + Math.sin(windAngle) * dist;
          const fade = 1 - t * 0.5; // outer points 50% dimmer than inner
          const b = cfg.densityRate * fade;
          fluid.splat(
            px, py,
            0, 0,
            0.002,
            b * 0.6,    // purple: R component
            b * 0.15,   // low G
            b * 1.0     // high B
          );
        }
      }

      // Core glow — bright purple-white
      fluid.splat(fu, fv, 0, 0, 0.003,
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
