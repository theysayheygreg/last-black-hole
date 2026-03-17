/**
 * wave-rings.js — Explicit propagating wave ring system.
 *
 * V3: World-space. Wave rings expand in world-units, push ship in world-units.
 * Source positions stored in world-space. Toroidal distance for ship interaction.
 */

import { CONFIG } from './config.js';
import { WORLD_SCALE, pxPerWorld, worldToScreen, worldDirectionTo } from './coords.js';
import { waveBandForce, applyForceToShip } from './physics.js';

class WaveRing {
  constructor(sourceWX, sourceWY, amplitude) {
    this.sourceWX = sourceWX;    // world-space coords
    this.sourceWY = sourceWY;
    this.radius = 0;             // current radius in world-units
    this.amplitude = amplitude;
    this.initialAmplitude = amplitude;
    this.alive = true;
  }
}

export class WaveRingSystem {
  constructor() {
    this.rings = [];
  }

  /**
   * Spawn a new expanding wave ring at a world-space position.
   */
  spawn(wx, wy, amplitude) {
    this.rings.push(new WaveRing(wx, wy, amplitude));
  }

  update(dt) {
    const cfg = CONFIG.events;

    for (const ring of this.rings) {
      ring.radius += cfg.waveSpeed * dt;
      ring.amplitude *= cfg.waveDecay;
      if (ring.radius > cfg.waveMaxRadius || ring.amplitude < 0.01) {
        ring.alive = false;
      }
    }

    this.rings = this.rings.filter(r => r.alive);
  }

  /**
   * Apply wave ring forces to the ship (world-space).
   */
  applyToShip(ship) {
    const cfg = CONFIG.events;
    const halfWidth = cfg.waveWidth * 0.5;

    for (const ring of this.rings) {
      const { dist, nx, ny } = worldDirectionTo(ring.sourceWX, ring.sourceWY, ship.wx, ship.wy);
      const accel = waveBandForce(dist, ring.radius, halfWidth, cfg.waveShipPush, ring.amplitude);
      if (accel > 0) {
        applyForceToShip(ship, nx, ny, accel);
      }
    }
  }

  /**
   * Render wave rings on the overlay canvas (camera-aware).
   */
  render(ctx, camX, camY, canvasW, canvasH) {
    const ppw = pxPerWorld(canvasW);

    for (const ring of this.rings) {
      const [srcX, srcY] = worldToScreen(ring.sourceWX, ring.sourceWY, camX, camY, canvasW, canvasH);
      const radiusPx = ring.radius * ppw;

      // life = 1.0 at spawn, decays toward 0 as amplitude fades.
      // Alpha overshoots early (×1.5) then caps at 0.7 — rings start bright, fade gracefully.
      const life = ring.amplitude / ring.initialAmplitude;
      const alpha = Math.min(1, life * 1.5) * 0.7;
      if (alpha < 0.02) continue;

      // Color transitions from bright cyan-white (life=1) to dim blue (life=0).
      // R: 255→100, G: 255→200, B: always 255.
      const r = Math.floor(100 + 155 * life);
      const g = Math.floor(200 + 55 * life);
      const b = 255;

      ctx.save();
      ctx.strokeStyle = `rgba(${r}, ${g}, ${b}, ${alpha})`;
      // Line width = 15% of the wavefront band width, thinning as amplitude fades
      ctx.lineWidth = Math.max(1, CONFIG.events.waveWidth * ppw * 0.15 * life);
      ctx.shadowColor = `rgba(${r}, ${g}, ${b}, ${alpha * 0.5})`;
      ctx.shadowBlur = 8 * life;

      ctx.beginPath();
      ctx.arc(srcX, srcY, radiusPx, 0, Math.PI * 2);
      ctx.stroke();

      if (life > 0.5) {
        const innerAlpha = (life - 0.5) * 2 * alpha * 0.4;
        ctx.strokeStyle = `rgba(255, 255, 255, ${innerAlpha})`;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.arc(srcX, srcY, radiusPx, 0, Math.PI * 2);
        ctx.stroke();
      }

      ctx.restore();
    }
  }

  getActiveCount() {
    return this.rings.length;
  }
}
