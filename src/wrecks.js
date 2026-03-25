/**
 * wrecks.js — Salvage from dead civilizations.
 *
 * Three types: derelict (common), debris (scattered), vault (rare, near danger).
 * Three tiers: surface (safe), deep (mid), core (near wells).
 * Fluid obstacle via zero-velocity splats. Fly-over pickup.
 */

import { CONFIG } from './config.js';
import { worldToFluidUV, worldToScreen, worldDistance, shouldCull, uvScale, wrapWorld } from './coords.js';
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
  update(fluid, dt, totalTime, camX = null, camY = null) {
    const cfg = CONFIG.wrecks;
    const s = uvScale();
    const s2 = s * s;

    for (const wreck of this.wrecks) {
      if (!wreck.alive) continue;
      if (wreck.pickupCooldown > 0) wreck.pickupCooldown -= dt;

      // Drift: ejected wrecks move and decelerate
      if (wreck.vx !== 0 || wreck.vy !== 0) {
        wreck.wx = wrapWorld(wreck.wx + wreck.vx * dt);
        wreck.wy = wrapWorld(wreck.wy + wreck.vy * dt);
        // Drag: decay is time-based so ejection behavior stays consistent as FPS changes.
        // Old behavior was 0.96x per 60 Hz frame, which is exp(-2.45 * dt).
        const dragRate = 2.45;
        const dragFactor = Math.exp(-dragRate * dt);
        wreck.vx *= dragFactor;
        wreck.vy *= dragFactor;
        if (Math.abs(wreck.vx) < 0.001 && Math.abs(wreck.vy) < 0.001) {
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

      // Visual glow — visual buffer (stays anchored, not advected)
      if (!wreck.looted) {
        const glow = wreck.type === 'vault' ? cfg.vaultGlow : cfg.wreckGlow;
        fluid.visualSplat(fu, fv, sizeP.glowRadius * s2,
          glow[0], glow[1], glow[2]
        );
      } else {
        fluid.visualSplat(fu, fv, sizeP.glowRadius * s2,
          0.02, 0.02, 0.02
        );
      }
    }
  }

  /**
   * Check if ship is within pickup radius of any un-looted wreck.
   * Returns array of newly looted items (empty if none).
   */
  checkPickup(shipWX, shipWY) {
    const cfg = CONFIG.wrecks;
    const items = [];

    for (const wreck of this.wrecks) {
      if (!wreck.alive || wreck.looted) continue;
      if (wreck.pickupCooldown > 0) continue;  // recently dropped — can't grab yet
      const dist = worldDistance(shipWX, shipWY, wreck.wx, wreck.wy);
      if (dist < cfg.pickupRadius) {
        wreck.looted = true;
        items.push(...wreck.loot);
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
   * Render wreck overlay markers.
   */
  render(ctx, camX, camY, canvasW, canvasH, totalTime) {
    for (const wreck of this.wrecks) {
      if (!wreck.alive) continue;
      const [sx, sy] = worldToScreen(wreck.wx, wreck.wy, camX, camY, canvasW, canvasH);
      const sizeP = SIZE_PARAMS[wreck.size] || SIZE_PARAMS.medium;
      const r = sizeP.overlaySize;

      ctx.save();

      if (wreck.looted) {
        // Dim gray marker
        ctx.fillStyle = 'rgba(85, 85, 85, 0.4)';
        ctx.beginPath();
        ctx.arc(sx, sy, r * 0.6, 0, Math.PI * 2);
        ctx.fill();
      } else {
        // Gold marker with pulse
        const pulse = 0.6 + 0.4 * Math.sin(totalTime * 2 + wreck.wx * 10);
        const color = wreck.type === 'vault'
          ? `rgba(255, 232, 160, ${pulse})`
          : `rgba(212, 168, 67, ${pulse * 0.8})`;

        // Outer glow
        ctx.beginPath();
        ctx.arc(sx, sy, r + 2, 0, Math.PI * 2);
        ctx.strokeStyle = color;
        ctx.lineWidth = 1;
        ctx.stroke();

        // Inner fill
        ctx.beginPath();
        ctx.arc(sx, sy, r * 0.5, 0, Math.PI * 2);
        ctx.fillStyle = color;
        ctx.fill();

        // Vault gets an extra bright center
        if (wreck.type === 'vault') {
          ctx.beginPath();
          ctx.arc(sx, sy, 3, 0, Math.PI * 2);
          ctx.fillStyle = `rgba(255, 255, 220, ${pulse})`;
          ctx.fill();
        }
      }

      ctx.restore();
    }
  }

  getUVPositions() {
    return this.wrecks.filter(w => w.alive).map(w => worldToFluidUV(w.wx, w.wy));
  }
}
