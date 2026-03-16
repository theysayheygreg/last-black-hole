/**
 * wave-rings.js — Explicit propagating wave ring system.
 *
 * V2 event waves: instead of oscillating well forces, spawn ring-shaped
 * force impulses that propagate outward at a fixed speed. Each ring is
 * a discrete entity with position, radius, amplitude, and decay.
 *
 * Wave rings are spawned by events (well growth, mergers, collapses)
 * and push the ship outward when the wavefront passes over it.
 */

import { CONFIG } from './config.js';

class WaveRing {
  constructor(sourceUVX, sourceUVY, amplitude) {
    this.sourceX = sourceUVX;    // UV coords (0-1)
    this.sourceY = sourceUVY;
    this.radius = 0;             // current radius in pixels
    this.amplitude = amplitude;  // current force strength (decays over time)
    this.initialAmplitude = amplitude;
    this.alive = true;
  }
}

export class WaveRingSystem {
  constructor() {
    this.rings = [];
  }

  /**
   * Spawn a new expanding wave ring at a UV position.
   * @param {number} uvX - source X in UV coords (0-1)
   * @param {number} uvY - source Y in UV coords (0-1)
   * @param {number} amplitude - initial force amplitude
   */
  spawn(uvX, uvY, amplitude) {
    this.rings.push(new WaveRing(uvX, uvY, amplitude));
  }

  /**
   * Expand all rings, decay amplitude, cull dead rings.
   * @param {number} dt - frame delta in seconds
   */
  update(dt) {
    const cfg = CONFIG.events;

    for (const ring of this.rings) {
      // Expand outward
      ring.radius += cfg.waveSpeed * dt;

      // Decay amplitude each frame
      ring.amplitude *= cfg.waveDecay;

      // Kill ring if too large or too faint
      if (ring.radius > cfg.waveMaxRadius || ring.amplitude < 0.01) {
        ring.alive = false;
      }
    }

    // Remove dead rings
    this.rings = this.rings.filter(r => r.alive);
  }

  /**
   * Apply wave ring forces to the ship.
   * If the ship is within a ring's wavefront band, push it outward.
   * @param {Ship} ship
   * @param {number} canvasW
   * @param {number} canvasH
   */
  applyToShip(ship, canvasW, canvasH) {
    const cfg = CONFIG.events;
    const halfWidth = cfg.waveWidth * 0.5;

    for (const ring of this.rings) {
      // Convert ring source from UV to pixel coords
      const srcPxX = ring.sourceX * canvasW;
      const srcPxY = ring.sourceY * canvasH;

      // Distance from ship to ring source
      const dx = ship.x - srcPxX;
      const dy = ship.y - srcPxY;
      const dist = Math.sqrt(dx * dx + dy * dy);

      if (dist < 1) continue; // ship is at the source, skip

      // Is the ship within the wavefront band?
      const distFromFront = Math.abs(dist - ring.radius);
      if (distFromFront > halfWidth) continue;

      // Wavefront profile: strongest at center of band, fades at edges
      // Smooth cosine falloff within the band
      const bandPosition = distFromFront / halfWidth; // 0 at center, 1 at edge
      const profile = Math.cos(bandPosition * Math.PI * 0.5); // 1 at center, 0 at edge

      // Force direction: outward from ring source
      const nx = dx / dist;
      const ny = dy / dist;

      // Apply outward push — force = pushStrength * amplitude * profile
      const forceMag = cfg.waveShipPush * ring.amplitude * profile;
      ship.vx += nx * forceMag * (1 / 60); // use fixed dt for consistency
      ship.vy += ny * forceMag * (1 / 60);
    }
  }

  /**
   * Render wave rings as expanding circles on the overlay canvas.
   * Bright at spawn, fading with decay. Color shifts from white-cyan to dim blue.
   * @param {CanvasRenderingContext2D} ctx
   * @param {number} canvasW
   * @param {number} canvasH
   */
  render(ctx, canvasW, canvasH) {
    for (const ring of this.rings) {
      const srcX = ring.sourceX * canvasW;
      const srcY = ring.sourceY * canvasH;

      // Opacity and color based on amplitude relative to initial
      const life = ring.amplitude / ring.initialAmplitude;
      const alpha = Math.min(1, life * 1.5) * 0.7; // bright early, fading

      if (alpha < 0.02) continue;

      // Color: bright cyan-white at start, fading to dim blue
      const r = Math.floor(100 + 155 * life);
      const g = Math.floor(200 + 55 * life);
      const b = 255;

      ctx.save();
      ctx.strokeStyle = `rgba(${r}, ${g}, ${b}, ${alpha})`;
      ctx.lineWidth = Math.max(1, CONFIG.events.waveWidth * 0.15 * life);
      ctx.shadowColor = `rgba(${r}, ${g}, ${b}, ${alpha * 0.5})`;
      ctx.shadowBlur = 8 * life;

      ctx.beginPath();
      ctx.arc(srcX, srcY, ring.radius, 0, Math.PI * 2);
      ctx.stroke();

      // Inner ring for extra drama at high amplitude
      if (life > 0.5) {
        const innerAlpha = (life - 0.5) * 2 * alpha * 0.4;
        ctx.strokeStyle = `rgba(255, 255, 255, ${innerAlpha})`;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.arc(srcX, srcY, ring.radius, 0, Math.PI * 2);
        ctx.stroke();
      }

      ctx.restore();
    }
  }

  /**
   * Get ring count for debug display.
   */
  getActiveCount() {
    return this.rings.length;
  }
}
