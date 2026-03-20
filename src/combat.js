/**
 * combat.js — Force pulse combat system.
 *
 * Both the player and scavengers can fire radial force pulses that:
 *   1. Inject outward velocity into the fluid sim (visible shockwave)
 *   2. Spawn a wave ring for propagating distortion
 *   3. Push nearby entities (scavengers, planetoids, player)
 *   4. Temporarily disrupt well accretion disks (counter-density splats)
 *
 * All tunables live in CONFIG.combat. Cooldown is per-entity.
 */

import { CONFIG } from './config.js';
import { worldToFluidUV, worldToScreen, worldDistance, worldDirectionTo,
         uvScale, wrapWorld } from './coords.js';

export class CombatSystem {
  constructor() {
    /** Seconds remaining on player pulse cooldown. */
    this.playerCooldown = 0;
    /** Active accretion disk disruptions: [{well, timer}]. */
    this.wellDisruptions = [];
  }

  // ---------- Public API ----------

  /**
   * Fire a pulse from the player ship.
   * @returns {boolean} true if pulse fired, false if on cooldown.
   */
  playerPulse(ship, fluid, waveRings, wellSystem, scavengerSystem, planetoidSystem) {
    if (this.playerCooldown > 0) return false;

    const cfg = CONFIG.combat;
    this.playerCooldown = cfg.pulseCooldown;

    this._firePulse(ship.wx, ship.wy, fluid, waveRings, wellSystem,
                    scavengerSystem, planetoidSystem, ship, null);

    // Optional recoil — launches player backward along facing
    if (cfg.pulseRecoil) {
      ship.vx -= Math.cos(ship.facing) * cfg.pulseRecoilForce;
      ship.vy -= Math.sin(ship.facing) * cfg.pulseRecoilForce;
    }

    return true;
  }

  /**
   * Fire a pulse from a scavenger (called by scavenger AI).
   * Scavenger cooldown is managed by the scavenger itself.
   */
  entityPulse(scav, fluid, waveRings, wellSystem, scavengerSystem, planetoidSystem, ship) {
    this._firePulse(scav.wx, scav.wy, fluid, waveRings, wellSystem,
                    scavengerSystem, planetoidSystem, null, ship);
  }

  /**
   * Tick cooldowns and disruption timers.
   * @param {number} dt - frame delta in seconds
   */
  update(dt) {
    if (this.playerCooldown > 0) {
      this.playerCooldown = Math.max(0, this.playerCooldown - dt);
    }

    // Expire finished disruptions
    this.wellDisruptions = this.wellDisruptions.filter(d => {
      d.timer -= dt;
      return d.timer > 0;
    });
  }

  /**
   * Inject counter-density splats around disrupted wells.
   * Call once per frame after update(), before fluid step.
   */
  applyDisruptions(fluid) {
    const s = uvScale();
    const s2 = s * s;

    for (const d of this.wellDisruptions) {
      const [fu, fv] = worldToFluidUV(d.well.wx, d.well.wy);

      // Counter-radial splats push density outward, breaking the accretion ring
      for (let i = 0; i < 8; i++) {
        const angle = (i / 8) * Math.PI * 2 + d.timer * 3;
        const dist = 0.02 * s * d.well.mass;
        fluid.splat(
          fu + Math.cos(angle) * dist,
          fv + Math.sin(angle) * dist,
          Math.cos(angle) * 0.001 * s,
          Math.sin(angle) * 0.001 * s,
          0.003 * s2,
          0, 0, 0   // no density — just scatter velocity
        );
      }
    }
  }

  /**
   * Render cooldown arc around the ship on the overlay canvas.
   * Shows nothing when pulse is ready (no visual clutter).
   */
  renderCooldown(ctx, ship, camX, camY, canvasW, canvasH) {
    const cfg = CONFIG.combat;
    if (cfg.pulseCooldown <= 0) return;

    const progress = 1 - (this.playerCooldown / cfg.pulseCooldown);
    if (progress >= 1) return; // ready — no indicator needed

    const [sx, sy] = worldToScreen(ship.wx, ship.wy, camX, camY, canvasW, canvasH);
    const radius = CONFIG.ship.size + 6;

    ctx.save();

    // Background ring (dim)
    ctx.strokeStyle = 'rgba(100, 100, 120, 0.3)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(sx, sy, radius, 0, Math.PI * 2);
    ctx.stroke();

    // Progress ring (fills clockwise from top)
    ctx.strokeStyle = 'rgba(200, 180, 100, 0.7)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(sx, sy, radius, -Math.PI / 2, -Math.PI / 2 + progress * Math.PI * 2);
    ctx.stroke();

    ctx.restore();
  }

  /** Is the player pulse ready to fire? */
  get playerReady() { return this.playerCooldown <= 0; }

  // ---------- Internal ----------

  /**
   * Core pulse logic shared by player and entity pulses.
   *
   * @param {number} wx - pulse origin world X
   * @param {number} wy - pulse origin world Y
   * @param {FluidSim} fluid
   * @param {WaveRingSystem} waveRings
   * @param {WellSystem} wellSystem
   * @param {object|null} scavengerSystem
   * @param {object|null} planetoidSystem
   * @param {Ship|null} sourceShip - the player ship if this is a player pulse (excluded from push)
   * @param {Ship|null} targetShip - the player ship if this is an entity pulse (gets pushed)
   */
  _firePulse(wx, wy, fluid, waveRings, wellSystem, scavengerSystem, planetoidSystem, sourceShip, targetShip) {
    const cfg = CONFIG.combat;
    const s = uvScale();
    const s2 = s * s;

    // --- 1. Fluid force injection: radial outward splats ---
    const [fu, fv] = worldToFluidUV(wx, wy);
    const numSplats = 16;
    for (let i = 0; i < numSplats; i++) {
      const angle = (i / numSplats) * Math.PI * 2;
      const dist = 0.01 * s;
      const px = fu + Math.cos(angle) * dist;
      const py = fv + Math.sin(angle) * dist;
      fluid.splat(
        px, py,
        Math.cos(angle) * cfg.pulseForce * s,
        Math.sin(angle) * cfg.pulseForce * s,
        cfg.pulseRadius * s2,
        0.8, 0.6, 0.3  // bright amber flash
      );
    }

    // --- 2. Wave ring for visible shockwave propagation ---
    waveRings.spawn(wx, wy, 1.5);

    // --- 3. Push nearby scavengers ---
    if (scavengerSystem) {
      for (const scav of scavengerSystem.scavengers) {
        if (!scav.alive || scav === sourceShip) continue;
        const { dist, nx, ny } = worldDirectionTo(wx, wy, scav.wx, scav.wy);
        if (dist < cfg.pulseEntityRadius && dist > 0.001) {
          const force = cfg.pulseEntityForce * (1 - dist / cfg.pulseEntityRadius);
          scav.vx += nx * force;
          scav.vy += ny * force;
        }
      }
    }

    // --- 4. Push player ship (entity pulses only) ---
    if (targetShip) {
      const { dist, nx, ny } = worldDirectionTo(wx, wy, targetShip.wx, targetShip.wy);
      if (dist < cfg.pulseEntityRadius && dist > 0.001) {
        const force = cfg.pulseEntityForce * (1 - dist / cfg.pulseEntityRadius);
        targetShip.vx += nx * force;
        targetShip.vy += ny * force;
      }
    }

    // --- 5. Nudge planetoids (heavier — smaller displacement, no velocity) ---
    if (planetoidSystem) {
      for (const p of planetoidSystem.planetoids) {
        const { dist, nx, ny } = worldDirectionTo(wx, wy, p.wx, p.wy);
        if (dist < cfg.pulseEntityRadius * 0.5 && dist > 0.001) {
          p.wx = wrapWorld(p.wx + nx * 0.02);
          p.wy = wrapWorld(p.wy + ny * 0.02);
        }
      }
    }

    // --- 6. Disrupt nearby well accretion disks ---
    for (const well of wellSystem.wells) {
      const d = worldDistance(wx, wy, well.wx, well.wy);
      if (d < cfg.pulseWellDisruptRadius) {
        this.wellDisruptions.push({ well, timer: cfg.pulseWellDisruptDuration });
      }
    }
  }
}
