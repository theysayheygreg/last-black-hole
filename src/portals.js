/**
 * portals.js — Exit wormholes with wave-based spawning.
 *
 * Portals arrive in timed waves, each shorter-lived than the last.
 * Three types: standard (reliable), unstable (flickers, small), rift (large, near danger).
 * The final portal is always guaranteed at 9:30, lasting 30 seconds.
 */

import { CONFIG } from './config.js';
import { WORLD_SCALE, worldToFluidUV, worldToScreen, worldDistance, CAMERA_VIEW, uvScale, wrapWorld } from './coords.js';

class Portal {
  constructor(wx, wy, opts = {}) {
    this.wx = wx;
    this.wy = wy;
    this.type = opts.type ?? 'standard';
    this.wave = opts.wave ?? 0;
    this.spawnTime = opts.spawnTime ?? 0;
    this.lifespan = opts.lifespan ?? 90;
    this.alive = true;
    this.opacity = 1.0;
  }

  /** Remaining seconds before evaporation. */
  timeLeft(runTime) {
    return Math.max(0, (this.spawnTime + this.lifespan) - runTime);
  }

  /** Is this portal in its warning phase (last 15s)? */
  isWarning(runTime) {
    return this.alive && this.timeLeft(runTime) < 15;
  }

  /** Is this portal in its critical phase (last 5s)? */
  isCritical(runTime) {
    return this.alive && this.timeLeft(runTime) < 5;
  }

  /** Capture radius varies by type. */
  getCaptureRadius() {
    const base = CONFIG.portals.captureRadius;
    if (this.type === 'unstable') return base * 0.5;
    if (this.type === 'rift') return base * 1.8;
    return base;
  }
}

export class PortalSystem {
  constructor() {
    this.portals = [];
    this._nextWaveIndex = 0;
    this._waveSchedule = CONFIG.portals.waves;
  }

  addPortal(wx, wy, opts = {}) {
    const portal = new Portal(wx, wy, opts);
    this.portals.push(portal);
    return portal;
  }

  /** Get count of currently alive portals. */
  get activeCount() {
    return this.portals.filter(p => p.alive).length;
  }

  /** Are there more waves coming? */
  get hasMoreWaves() {
    return this._nextWaveIndex < this._waveSchedule.length;
  }

  /**
   * Update portal waves: spawn new waves, expire old portals, inject fluid effects.
   */
  update(fluid, dt, totalTime, camX, camY, runElapsedTime = 0) {
    const cfg = CONFIG.portals;
    const cullDist = CAMERA_VIEW + 0.5;
    const s = uvScale();
    const s2 = s * s;

    // --- Wave spawning ---
    while (this._nextWaveIndex < this._waveSchedule.length) {
      const wave = this._waveSchedule[this._nextWaveIndex];
      if (runElapsedTime < wave.time) break;

      // Spawn portals for this wave
      const count = wave.count[0] + Math.floor(Math.random() * (wave.count[1] - wave.count[0] + 1));
      for (let i = 0; i < count; i++) {
        const type = wave.types[Math.floor(Math.random() * wave.types.length)];
        const [wx, wy] = this._findSpawnPosition(type);
        this.addPortal(wx, wy, {
          type,
          wave: this._nextWaveIndex + 1,
          spawnTime: runElapsedTime,
          lifespan: wave.lifespan + (type === 'unstable' ? (Math.random() - 0.5) * wave.lifespan * 0.4 : 0),
        });
      }
      this._nextWaveIndex++;
    }

    // --- Evaporation ---
    for (const portal of this.portals) {
      if (!portal.alive) continue;
      const remaining = portal.timeLeft(runElapsedTime);

      if (remaining <= 0) {
        portal.alive = false;
        portal.opacity = 0;
        continue;
      }

      // Fade opacity in warning phase
      if (remaining < 15) {
        portal.opacity = remaining / 15;
      } else {
        portal.opacity = 1.0;
      }
    }

    // --- Fluid effects (only for alive portals) ---
    for (const portal of this.portals) {
      if (!portal.alive) continue;
      if (camX != null && worldDistance(portal.wx, portal.wy, camX, camY) > cullDist) continue;

      const [fu, fv] = worldToFluidUV(portal.wx, portal.wy);
      const strength = portal.opacity;

      // Pull strength varies by type
      const gravMult = portal.type === 'rift' ? 3.0 : portal.type === 'unstable' ? 0.5 : 1.0;
      // Unstable: intermittent pull (stutters on/off)
      const unstableFlicker = portal.type === 'unstable'
        ? (Math.sin(totalTime * 8 + portal.wx * 20) > 0 ? 1 : 0)
        : 1;

      fluid.applyWellForce(
        [fu, fv],
        cfg.gravity * Math.pow(s, cfg.falloff) * gravMult * strength * unstableFlicker,
        cfg.falloff,
        cfg.fluidClampRadius,
        cfg.orbitalStrength,
        dt,
        cfg.fluidTerminalSpeed * s
      );

      // Spiral density
      const spiralAngle = totalTime * cfg.spiralSpeed;
      const arms = portal.type === 'rift' ? 5 : cfg.spiralArms;
      for (let arm = 0; arm < arms; arm++) {
        const baseAngle = spiralAngle + (arm / arms) * Math.PI * 2;
        for (let p = 0; p < 4; p++) {
          const t = (p + 1) / 4;
          const sizeMult = portal.type === 'rift' ? 1.5 : 1.0;
          const dist = t * 0.025 * s * sizeMult;
          const windAngle = baseAngle + t * 1.5;
          const px = fu + Math.cos(windAngle) * dist;
          const py = fv + Math.sin(windAngle) * dist;
          const fade = (1 - t * 0.5) * strength;
          const b = cfg.densityRate * fade;

          // Color by type: standard=purple, unstable=purple-red, rift=cyan-white
          const [cr, cg, cb] = portal.type === 'rift'
            ? [b * 0.3, b * 0.8, b * 1.0]
            : portal.type === 'unstable'
            ? [b * 0.8, b * 0.1, b * 0.6]
            : [b * 0.6, b * 0.15, b * 1.0];

          fluid.visualSplat(px, py, 0.002 * s2, cr, cg, cb);
        }
      }

      // Core glow
      const [ccr, ccg, ccb] = portal.type === 'rift'
        ? [cfg.densityRate * 0.3, cfg.densityRate * 0.7, cfg.densityRate * 0.9]
        : [cfg.densityRate * 0.5, cfg.densityRate * 0.2, cfg.densityRate * 0.8];
      fluid.visualSplat(fu, fv, 0.003 * s2,
        ccr * strength, ccg * strength, ccb * strength
      );
    }
  }

  /**
   * Find a spawn position for a new portal.
   * Rifts spawn near wells. Others spawn in safer areas.
   */
  _findSpawnPosition(type) {
    // Simple random placement with well-distance check
    for (let attempt = 0; attempt < 30; attempt++) {
      const wx = Math.random() * WORLD_SCALE;
      const wy = Math.random() * WORLD_SCALE;
      // Check: not too close to existing portals
      let valid = true;
      for (const p of this.portals) {
        if (p.alive && worldDistance(wx, wy, p.wx, p.wy) < 0.3) {
          valid = false;
          break;
        }
      }
      if (valid) return [wx, wy];
    }
    // Fallback: random position
    return [Math.random() * WORLD_SCALE, Math.random() * WORLD_SCALE];
  }

  checkExtraction(shipWX, shipWY) {
    for (const portal of this.portals) {
      if (!portal.alive) continue;
      const dist = worldDistance(shipWX, shipWY, portal.wx, portal.wy);
      if (dist < portal.getCaptureRadius()) return portal;
    }
    return null;
  }

  render(ctx, camX, camY, canvasW, canvasH, totalTime, runElapsedTime = 0) {
    const cfg = CONFIG.portals;

    for (const portal of this.portals) {
      if (!portal.alive) continue;
      const [sx, sy] = worldToScreen(portal.wx, portal.wy, camX, camY, canvasW, canvasH);
      const pulse = 0.5 + 0.5 * Math.sin(totalTime * cfg.pulseRate * Math.PI * 2);
      const alpha = portal.opacity;

      // Critical blink (last 5s)
      const critBlink = portal.isCritical(runElapsedTime)
        ? (Math.sin(totalTime * 12) > 0 ? 1 : 0.2)
        : 1;
      const a = alpha * critBlink;

      ctx.save();

      // Type-specific colors
      const ringColor = portal.type === 'rift'
        ? `rgba(100, 255, 255, ${(0.4 + 0.3 * pulse) * a})`
        : portal.type === 'unstable'
        ? `rgba(255, 80, 180, ${(0.3 + 0.2 * pulse) * a})`
        : `rgba(180, 80, 255, ${(0.3 + 0.2 * pulse) * a})`;

      const innerColor = portal.type === 'rift'
        ? `rgba(200, 255, 255, ${(0.5 + 0.3 * pulse) * a})`
        : `rgba(100, 255, 255, ${(0.4 + 0.3 * pulse) * a})`;

      // Outer ring
      const size = portal.type === 'rift' ? cfg.overlaySize * 1.6 : cfg.overlaySize;
      ctx.beginPath();
      ctx.arc(sx, sy, size + 4 + pulse * 3, 0, Math.PI * 2);
      ctx.strokeStyle = ringColor;
      ctx.lineWidth = portal.type === 'rift' ? 3 : 2;
      ctx.stroke();

      // Inner ring
      ctx.beginPath();
      ctx.arc(sx, sy, size * 0.7, 0, Math.PI * 2);
      ctx.strokeStyle = innerColor;
      ctx.lineWidth = 1.5;
      ctx.stroke();

      // Center dot
      ctx.beginPath();
      ctx.arc(sx, sy, portal.type === 'rift' ? 5 : 3, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(200, 150, 255, ${(0.7 + 0.3 * pulse) * a})`;
      ctx.fill();

      // Label
      const label = portal.type === 'rift' ? 'RIFT' : portal.type === 'unstable' ? 'EXIT?' : 'EXIT';
      ctx.fillStyle = `rgba(180, 120, 255, ${(0.5 + 0.2 * pulse) * a})`;
      ctx.font = '10px monospace';
      ctx.textAlign = 'center';
      ctx.fillText(label, sx, sy - size - 6);

      // Warning: time remaining when in warning phase
      if (portal.isWarning(runElapsedTime)) {
        const secs = Math.ceil(portal.timeLeft(runElapsedTime));
        ctx.fillStyle = `rgba(255, 80, 80, ${a})`;
        ctx.font = '11px monospace';
        ctx.fillText(`${secs}s`, sx, sy + size + 14);
      }

      ctx.restore();
    }
  }

  getUVPositions() {
    return this.portals.filter(p => p.alive).map(p => worldToFluidUV(p.wx, p.wy));
  }
}
