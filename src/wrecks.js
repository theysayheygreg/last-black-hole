/**
 * wrecks.js — Salvage from dead civilizations.
 *
 * Three types: derelict (common), debris (scattered), vault (rare, near danger).
 * Three tiers: surface (safe), deep (mid), core (near wells).
 * Fluid obstacle via zero-velocity splats. Fly-over pickup.
 */

import { CONFIG } from './config.js';
import { worldToFluidUV, worldToScreen, worldDistance, worldDirectionTo, shouldCull, uvScale, wrapWorld } from './coords.js';
import { generateLoot } from './items.js';

// ---- Name generation ----

const ADJ = ['Ascending', 'Crystalline', 'Shattered', 'Infinite', 'Dreaming',
  'Ossified', 'Luminous', 'Drifting', 'Harmonic', 'Forgotten',
  'Silent', 'Fractured', 'Prismatic', 'Hollow', 'Resonant'];
const NOUN = ['Chorus', 'Lattice', 'Meridian', 'Archive', 'Theorem',
  'Garden', 'Beacon', 'Chrysalis', 'Mandate', 'Confluence',
  'Helix', 'Axiom', 'Tempest', 'Orbit', 'Zenith'];

function pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }

function generateWreckName() {
  return `${pick(['Wreck', 'Remains', 'Hulk'])} of the ${pick(ADJ)} ${pick(NOUN)}`;
}

// ---- Wreck entity ----

class Wreck {
  constructor(wx, wy, opts = {}) {
    this.wx = wx;
    this.wy = wy;
    this.type = opts.type ?? 'derelict';
    this.tier = opts.tier ?? 1;
    this.size = opts.size ?? 'medium';
    this.alive = true;
    this.looted = false;
    this.name = generateWreckName();
    this.pickupCooldown = opts.pickupCooldown ?? 0;  // seconds before this wreck can be looted

    // Drift velocity — used for ejected/dropped wrecks. Decays to zero.
    this.vx = opts.vx ?? 0;
    this.vy = opts.vy ?? 0;

    // Generate categorized loot via items.js (80/20 primary/secondary table)
    this.loot = generateLoot(this.type, this.tier, this.name);
  }
}

// ---- Wreck sizes → fluid parameters ----

const SIZE_PARAMS = {
  small:    { splatRadius: 0.005, glowRadius: 0.004, overlaySize: 8 },
  medium:   { splatRadius: 0.008, glowRadius: 0.006, overlaySize: 12 },
  large:    { splatRadius: 0.014, glowRadius: 0.010, overlaySize: 16 },
  scattered: { splatRadius: 0.004, glowRadius: 0.003, overlaySize: 6 },
};

// ---- WreckSystem ----

export class WreckSystem {
  constructor() {
    this.wrecks = [];
  }

  addWreck(wx, wy, opts = {}) {
    const wreck = new Wreck(wx, wy, opts);
    this.wrecks.push(wreck);

    // Debris fields spawn additional scattered pieces around the center
    if (wreck.type === 'debris') {
      const pieceCount = 2 + Math.floor(Math.random() * 4);
      for (let i = 0; i < pieceCount; i++) {
        const angle = Math.random() * Math.PI * 2;
        const dist = 0.05 + Math.random() * 0.1;
        const piece = new Wreck(wx + Math.cos(angle) * dist, wy + Math.sin(angle) * dist, {
          type: 'debris', tier: wreck.tier, size: 'scattered',
        });
        piece.loot = generateLoot('debris', wreck.tier, wreck.name, 1);
        piece.name = wreck.name;
        this.wrecks.push(piece);
      }
    }
    return wreck;
  }

  /**
   * Inject fluid obstruction and visual glow for each wreck.
   */
  update(fluid, dt, totalTime, camX = null, camY = null, wellSystem = null) {
    const cfg = CONFIG.wrecks;
    const s = uvScale();
    const s2 = s * s;

    for (const wreck of this.wrecks) {
      if (!wreck.alive) continue;
      if (wreck.pickupCooldown > 0) wreck.pickupCooldown -= dt;

      // Well gravity drift — wrecks fall toward wells (see docs/design/DRIFT.md)
      if (cfg.driftEnabled && wellSystem) {
        const driftMaxRange = cfg.driftMaxRange ?? 0.8;
        for (const well of wellSystem.wells) {
          const { dist, nx, ny } = worldDirectionTo(wreck.wx, wreck.wy, well.wx, well.wy);
          if (dist > driftMaxRange || dist < 0.001) continue;
          const pullStrength = cfg.driftStrength * well.mass;
          const falloff = cfg.driftFalloff ?? 1.5;
          const accel = pullStrength / Math.pow(Math.max(dist, 0.02), falloff);
          wreck.vx += nx * accel * dt;
          wreck.vy += ny * accel * dt;
        }
      }

      // Movement + drag (applies to both ejection velocity and drift)
      if (wreck.vx !== 0 || wreck.vy !== 0) {
        wreck.wx = wrapWorld(wreck.wx + wreck.vx * dt);
        wreck.wy = wrapWorld(wreck.wy + wreck.vy * dt);
        // Drag: time-based exponential decay.
        // Drift mode (1.5): lower drag so wrecks sustain slow drift toward wells.
        // Ejection mode (2.45): higher drag so dropped items decelerate quickly and
        // stop near where they were dropped (responsive "I put it here" feel).
        const dragRate = cfg.driftEnabled ? (cfg.driftDrag ?? 1.5) : 2.45;
        const dragFactor = Math.exp(-dragRate * dt);
        wreck.vx *= dragFactor;
        wreck.vy *= dragFactor;
        // Terminal speed clamp
        const speed = Math.sqrt(wreck.vx * wreck.vx + wreck.vy * wreck.vy);
        const terminal = cfg.driftTerminalSpeed ?? 0.05;
        if (speed > terminal) {
          wreck.vx *= terminal / speed;
          wreck.vy *= terminal / speed;
        }
        if (speed < 0.0005) {
          wreck.vx = 0;
          wreck.vy = 0;
        }
      }

      if (shouldCull(wreck.wx, wreck.wy, camX, camY, 0.3)) continue;

      const [fu, fv] = worldToFluidUV(wreck.wx, wreck.wy);
      const sizeP = SIZE_PARAMS[wreck.size] || SIZE_PARAMS.medium;

      // Zero-velocity splat — fluid obstacle (creates lee zone + vortex shedding)
      fluid.splat(fu, fv, 0, 0, sizeP.splatRadius * s2,
        0, 0, 0  // no density from obstruction itself
      );

      // Visual glow — visual buffer, type-colored
      if (!wreck.looted) {
        let glow;
        if (wreck.type === 'vault') glow = cfg.vaultGlow;        // gold
        else if (wreck.type === 'debris') glow = [0.03, 0.02, 0.005]; // warm orange
        else glow = cfg.wreckGlow;                                // blue-gray
        fluid.visualSplat(fu, fv, sizeP.glowRadius * s2, glow[0], glow[1], glow[2]);
      } else {
        fluid.visualSplat(fu, fv, sizeP.glowRadius * s2, 0.02, 0.02, 0.02);
      }
    }
  }

  /**
   * Check if ship is within pickup radius of any un-looted wreck.
   * Returns array of newly looted items (empty if none).
   */
  checkPickup(shipWX, shipWY, cargoSlotsAvailable = Infinity) {
    const cfg = CONFIG.wrecks;
    const items = [];

    for (const wreck of this.wrecks) {
      if (!wreck.alive || wreck.looted) continue;
      if (wreck.pickupCooldown > 0) continue;  // recently dropped — can't grab yet
      if (items.length >= cargoSlotsAvailable) break;  // no more room
      const dist = worldDistance(shipWX, shipWY, wreck.wx, wreck.wy);
      if (dist < cfg.pickupRadius) {
        // Take items one at a time — only mark looted when ALL items taken
        while (wreck.loot.length > 0 && items.length < cargoSlotsAvailable) {
          items.push(wreck.loot.shift());
        }
        if (wreck.loot.length === 0) {
          wreck.looted = true;
        }
        // If loot remains, wreck stays active for a second pass
      }
    }
    return items;
  }

  /**
   * Check if growing wells have consumed any wrecks.
   */
  checkWellConsumption(wellSystem, waveRings) {
    for (const wreck of this.wrecks) {
      if (!wreck.alive) continue;
      for (const well of wellSystem.wells) {
        const dist = worldDistance(wreck.wx, wreck.wy, well.wx, well.wy);
        if (dist < well.killRadius) {
          wreck.alive = false;
          well.mass += 0.1;
          well.updateKillRadius();
          if (waveRings) {
            waveRings.spawn(well.wx, well.wy, 0.5);
          }
          break;
        }
      }
    }
  }

  /**
   * Render wreck overlay markers — distinct shapes per type.
   * Derelict: broken rectangle (gray-blue). Debris: scattered dots (dull orange).
   * Vault: diamond with golden particle orbit.
   */
  render(ctx, camX, camY, canvasW, canvasH, totalTime) {
    for (const wreck of this.wrecks) {
      if (!wreck.alive) continue;
      const [sx, sy] = worldToScreen(wreck.wx, wreck.wy, camX, camY, canvasW, canvasH);
      const sizeP = SIZE_PARAMS[wreck.size] || SIZE_PARAMS.medium;
      const r = sizeP.overlaySize;

      ctx.save();

      if (wreck.looted) {
        // Dim gray marker — same for all types
        ctx.fillStyle = 'rgba(85, 85, 85, 0.3)';
        ctx.beginPath();
        ctx.arc(sx, sy, r * 0.4, 0, Math.PI * 2);
        ctx.fill();
      } else if (wreck.type === 'vault') {
        // Vault: golden diamond with particle orbit
        const pulse = 0.6 + 0.4 * Math.sin(totalTime * 2 + wreck.wx * 10);
        const goldColor = `rgba(255, 215, 60, ${pulse})`;

        // Diamond shape (rotated square)
        ctx.translate(sx, sy);
        ctx.rotate(Math.PI / 4);
        ctx.fillStyle = goldColor;
        ctx.fillRect(-r * 0.45, -r * 0.45, r * 0.9, r * 0.9);
        ctx.strokeStyle = `rgba(255, 240, 100, ${pulse * 0.6})`;
        ctx.lineWidth = 1;
        ctx.strokeRect(-r * 0.55, -r * 0.55, r * 1.1, r * 1.1);
        ctx.setTransform(1, 0, 0, 1, 0, 0);

        // Orbiting golden particles (2 particles)
        for (let i = 0; i < 2; i++) {
          const angle = totalTime * 2.5 + i * Math.PI + wreck.wy * 5;
          const ox = sx + Math.cos(angle) * (r + 4);
          const oy = sy + Math.sin(angle) * (r + 4);
          ctx.beginPath();
          ctx.arc(ox, oy, 1.5, 0, Math.PI * 2);
          ctx.fillStyle = `rgba(255, 255, 180, ${pulse * 0.7})`;
          ctx.fill();
        }

        // Bright center
        ctx.beginPath();
        ctx.arc(sx, sy, 2.5, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(255, 255, 220, ${pulse})`;
        ctx.fill();
      } else if (wreck.type === 'debris') {
        // Debris: scattered dots (dull orange) — looks like loose floating junk
        const baseAlpha = 0.5 + 0.2 * Math.sin(totalTime * 1.5 + wreck.wx * 8);
        const dotColor = `rgba(180, 140, 80, ${baseAlpha})`;
        const dotCount = 3 + Math.floor(r / 5);
        for (let i = 0; i < dotCount; i++) {
          // Deterministic scatter: use wreck position as seed so dots don't
          // jump around between frames. Prime multipliers (137, 251, 73) spread
          // the hash space to avoid clustering.
          const seed = wreck.wx * 137 + wreck.wy * 251 + i * 73;
          const angle = (seed % 628) / 100;
          const dist = (seed % 100) / 100 * r * 0.8 + 2;
          const dotR = 1 + (i % 2);
          ctx.beginPath();
          ctx.arc(sx + Math.cos(angle) * dist, sy + Math.sin(angle) * dist, dotR, 0, Math.PI * 2);
          ctx.fillStyle = dotColor;
          ctx.fill();
        }
      } else {
        // Derelict: broken rectangle (gray-blue)
        const pulse = 0.5 + 0.3 * Math.sin(totalTime * 1.2 + wreck.wx * 10);
        const blueGray = `rgba(160, 180, 200, ${pulse})`;

        // Two offset parallel lines (broken hull)
        const halfW = r * 0.6;
        const halfH = r * 0.35;
        const tilt = (wreck.wx * 17 + wreck.wy * 31) % 3.14;  // deterministic tilt
        ctx.translate(sx, sy);
        ctx.rotate(tilt);

        ctx.strokeStyle = blueGray;
        ctx.lineWidth = 1.5;
        // Top hull line (broken in middle)
        ctx.beginPath();
        ctx.moveTo(-halfW, -halfH);
        ctx.lineTo(-halfW * 0.15, -halfH);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(halfW * 0.2, -halfH * 0.8);
        ctx.lineTo(halfW, -halfH * 0.6);
        ctx.stroke();
        // Bottom hull line
        ctx.beginPath();
        ctx.moveTo(-halfW * 0.8, halfH);
        ctx.lineTo(halfW * 0.7, halfH * 0.9);
        ctx.stroke();

        // Faint spark
        if (pulse > 0.7) {
          ctx.fillStyle = `rgba(200, 220, 255, ${(pulse - 0.7) * 2})`;
          ctx.beginPath();
          ctx.arc(halfW * 0.1, -halfH * 0.3, 1.5, 0, Math.PI * 2);
          ctx.fill();
        }

        ctx.setTransform(1, 0, 0, 1, 0, 0);
      }

      ctx.restore();
    }
  }

  getUVPositions() {
    return this.wrecks.filter(w => w.alive).map(w => worldToFluidUV(w.wx, w.wy));
  }
}
