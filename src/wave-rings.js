/**
 * wave-rings.js — Explicit propagating wave ring system.
 *
 * V4: World-space presentation projection. Rings expand in world-units and
 * preserve their source identity for dye/VFX; authority owns crossing impulse.
 */

import { CONFIG } from './config.js';
import { decayWaveAmplitude } from './content/event-wave.js';

class WaveRing {
  constructor(sourceWX, sourceWY, amplitude, metadata = {}, sequence = 0) {
    const eventId = metadata.eventId || `local-wave-${sequence}`;
    this.id = eventId;
    this.eventId = eventId;
    this.cause = metadata.cause || 'local-sandbox';
    this.sourceWellId = metadata.sourceWellId ?? null;
    this.authoritative = metadata.authoritative === true;
    this.state = metadata.state || 'active';
    this.launchTime = metadata.launchTime ?? null;
    this.telegraphStartTime = metadata.telegraphStartTime ?? null;
    this.frontWidth = metadata.frontWidth ?? null;
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
      if (ring.authoritative) continue;
      ring.radius += cfg.waveSpeed * dt;
      ring.amplitude = decayWaveAmplitude(ring.amplitude, dt);
      if (ring.radius > cfg.waveMaxRadius || ring.amplitude < 0.01) {
        ring.alive = false;
      }
    }

    this.rings = this.rings.filter(r => r.alive);
  }

  /**
   * V5 keeps event waves in the existing fluid display pass. This legacy
   * entry point remains harmless for local callers, but no longer paints a
   * detached circumference of splats or invents a second wave renderer.
   */
  injectIntoFluid() {
    return 0;
  }

  getActiveCount() {
    return this.rings.length;
  }
}
