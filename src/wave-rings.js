/**
 * wave-rings.js — Explicit propagating wave ring system.
 *
 * V4: World-space presentation projection. Rings expand in world-units and
 * preserve their source identity for dye/VFX; authority owns crossing impulse.
 */

import { CONFIG } from './config.js';
import { decayWaveAmplitude } from './content/event-wave.js';
import { worldRadiusToFluidUV, worldToFluidUV, splatScale } from './coords.js';

class WaveRing {
  constructor(sourceWX, sourceWY, amplitude, metadata = {}, sequence = 0) {
    const eventId = metadata.eventId || `local-wave-${sequence}`;
    this.id = eventId;
    this.eventId = eventId;
    this.cause = metadata.cause || 'local-sandbox';
    this.sourceWellId = metadata.sourceWellId ?? null;
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
    this.sequence = 0;
  }

  /**
   * Spawn a new expanding wave ring at a world-space position.
   */
  spawn(wx, wy, amplitude, metadata = {}) {
    this.sequence += 1;
    this.rings.push(new WaveRing(wx, wy, amplitude, metadata, this.sequence));
  }

  update(dt) {
    const cfg = CONFIG.events;

    for (const ring of this.rings) {
      ring.radius += cfg.waveSpeed * dt;
      ring.amplitude = decayWaveAmplitude(ring.amplitude, dt);
      if (ring.radius > cfg.waveMaxRadius || ring.amplitude < 0.01) {
        ring.alive = false;
      }
    }

    this.rings = this.rings.filter(r => r.alive);
  }

  /**
   * Preserve the ring dye without injecting an unregistered velocity. The
   * authority owns the one-shot crossing impulse separately.
   */
  injectIntoFluid(fluid) {
    const SPLATS_PER_RING = 16; // points around the circumference

    for (const ring of this.rings) {
      if (ring.amplitude < 0.05) continue;

      const life = ring.amplitude / ring.initialAmplitude;
      const [srcU, srcV] = worldToFluidUV(ring.sourceWX, ring.sourceWY);
      const radiusUV = worldRadiusToFluidUV(ring.radius);

      // Dye the authority-driven wavefront; never add a client current.
      const brightness = ring.amplitude * 0.08 * life; // density glow

      for (let i = 0; i < SPLATS_PER_RING; i++) {
        const angle = (i / SPLATS_PER_RING) * Math.PI * 2;
        const px = srcU + Math.cos(angle) * radiusUV;
        const py = srcV + Math.sin(angle) * radiusUV;

        // Cyan-white density — scale splat radius by the central GPU splat rule.
        const { s2 } = splatScale();
        const splatRadius = 0.004;  // UV-space base radius for wave ring splats
        fluid.visualSplat(px, py, splatRadius * s2,
          brightness * 0.3, brightness * 0.8, brightness);
      }
    }
  }

  getActiveCount() {
    return this.rings.length;
  }
}
