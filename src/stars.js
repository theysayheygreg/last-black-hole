/**
 * stars.js — Radiant bodies that push fluid outward.
 *
 * V3: World-space coordinates. Same physics, wider map.
 */

import { CONFIG } from './config.js';
import { WORLD_SCALE, worldToFluidUV, worldToScreen, worldDistance, worldDisplacement } from './coords.js';
import { inversePowerForce, applyForceToShip } from './physics.js';

class Star {
  constructor(wx, wy, opts = {}) {
    this.wx = wx;
    this.wy = wy;
    this.mass = opts.mass ?? 1.0;
    this.orbitalDir = opts.orbitalDir ?? 1;
  }
}

export class StarSystem {
  constructor() {
    this.stars = [];
  }

  addStar(wx, wy, opts = {}) {
    const star = new Star(wx, wy, opts);
    this.stars.push(star);
    return star;
  }

  update(fluid, dt, totalTime) {
    const cfg = CONFIG.stars;

    for (const star of this.stars) {
      const [fu, fv] = worldToFluidUV(star.wx, star.wy);

      // Outward push: NEGATIVE gravity
      fluid.applyWellForce(
        [fu, fv],
        -cfg.radiationStrength * star.mass,
        cfg.falloff,
        20,
        cfg.orbitalStrength * star.orbitalDir,
        dt,
        0.2
      );

      // Clearing bubble
      const clearingRadius = cfg.clearing * 0.13; // scaled for 3x UV
      fluid.splat(fu, fv, 0, 0, clearingRadius, -cfg.clearing, -cfg.clearing, -cfg.clearing);

      // Bright core
      const coreRadius = cfg.coreBrightness * 0.025;
      fluid.splat(fu, fv, 0, 0, coreRadius,
        cfg.coreBrightness * 1.0,
        cfg.coreBrightness * 0.95,
        cfg.coreBrightness * 0.6
      );

      // Rotating radial rays
      const rayAngleBase = totalTime * cfg.raySpinRate;
      const pointsPerRay = 4;

      for (let r = 0; r < cfg.rayCount; r++) {
        const rayAngle = rayAngleBase + (r / cfg.rayCount) * Math.PI * 2;
        for (let p = 0; p < pointsPerRay; p++) {
          const t = (p + 1) / pointsPerRay;
          const dist = t * cfg.rayLength;
          const px = fu + Math.cos(rayAngle) * dist;
          const py = fv + Math.sin(rayAngle) * dist;
          const fade = 1 - t * 0.7;
          const b = cfg.rayBrightness * fade * star.mass;
          fluid.splat(px, py, 0, 0, 0.001,
            b * (1.0 - t * 0.4),
            b * (0.9 - t * 0.2),
            b * (0.6 + t * 0.4)
          );
        }
      }
    }
  }

  /**
   * Apply star push force directly to ship (world-space).
   */
  applyToShip(ship) {
    const cfg = CONFIG.stars;
    const maxRange = cfg.maxRange ?? 0.6;

    for (const star of this.stars) {
      const [dx, dy] = worldDisplacement(star.wx, star.wy, ship.wx, ship.wy);
      const dist = Math.sqrt(dx * dx + dy * dy);
      const accel = inversePowerForce(dist, cfg.shipPushStrength, star.mass, cfg.shipPushFalloff, maxRange);
      if (accel > 0) {
        applyForceToShip(ship, dx / dist, dy / dist, accel);
      }
    }
  }

  getUVPositions() {
    return this.stars.map(s => worldToFluidUV(s.wx, s.wy));
  }

  render(ctx, camX, camY, canvasW, canvasH, totalTime) {
    for (const star of this.stars) {
      const [sx, sy] = worldToScreen(star.wx, star.wy, camX, camY, canvasW, canvasH);
      const pulse = 0.7 + 0.3 * Math.sin(totalTime * 3);

      ctx.save();

      // Large diffuse halo
      const haloR = 60 + 20 * star.mass;
      const grad = ctx.createRadialGradient(sx, sy, 0, sx, sy, haloR);
      grad.addColorStop(0, `rgba(255, 255, 230, ${0.4 * pulse})`);
      grad.addColorStop(0.2, `rgba(255, 245, 200, ${0.25 * pulse})`);
      grad.addColorStop(0.5, `rgba(255, 230, 160, ${0.1 * pulse})`);
      grad.addColorStop(1, 'rgba(255, 220, 120, 0)');
      ctx.beginPath();
      ctx.arc(sx, sy, haloR, 0, Math.PI * 2);
      ctx.fillStyle = grad;
      ctx.fill();

      // Rotating ray spikes
      const rayCount = 4;
      const rayLen = 50 + 30 * star.mass;
      const rayAngle = totalTime * CONFIG.stars.raySpinRate * 0.5;
      ctx.lineWidth = 2;
      for (let i = 0; i < rayCount; i++) {
        const a = rayAngle + (i / rayCount) * Math.PI * 2;
        const rayGrad = ctx.createLinearGradient(
          sx + Math.cos(a) * 8, sy + Math.sin(a) * 8,
          sx + Math.cos(a) * rayLen, sy + Math.sin(a) * rayLen
        );
        rayGrad.addColorStop(0, `rgba(255, 255, 220, ${0.5 * pulse})`);
        rayGrad.addColorStop(1, 'rgba(255, 240, 180, 0)');
        ctx.strokeStyle = rayGrad;
        ctx.beginPath();
        ctx.moveTo(sx + Math.cos(a) * 8, sy + Math.sin(a) * 8);
        ctx.lineTo(sx + Math.cos(a) * rayLen, sy + Math.sin(a) * rayLen);
        ctx.stroke();
      }

      // Bright core
      ctx.beginPath();
      ctx.arc(sx, sy, 10, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(255, 255, 240, ${0.9 * pulse})`;
      ctx.fill();

      // Hot center
      ctx.beginPath();
      ctx.arc(sx, sy, 5, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(255, 255, 255, ${pulse})`;
      ctx.fill();

      ctx.restore();
    }
  }
}
