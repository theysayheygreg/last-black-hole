/**
 * wrecks.js — Salvage from dead civilizations.
 *
 * Three types: derelict (common), debris (scattered), vault (rare, near danger).
 * Three tiers: surface (safe), deep (mid), core (near wells).
 * Fluid obstacle via zero-velocity splats. Fly-over pickup.
 */

import { CONFIG } from './config.js';
import { worldToFluidUV, worldToScreen, worldDistance, shouldCull, uvScale } from './coords.js';

// ---- Name generation ----

const ADJ = ['Ascending', 'Crystalline', 'Shattered', 'Infinite', 'Dreaming',
  'Ossified', 'Luminous', 'Drifting', 'Harmonic', 'Forgotten',
  'Silent', 'Fractured', 'Prismatic', 'Hollow', 'Resonant'];
const NOUN = ['Chorus', 'Lattice', 'Meridian', 'Archive', 'Theorem',
  'Garden', 'Beacon', 'Chrysalis', 'Mandate', 'Confluence',
  'Helix', 'Axiom', 'Tempest', 'Orbit', 'Zenith'];
const ITEM_MAT = ['Quantum', 'Exotic', 'Null', 'Phase', 'Stellar',
  'Void', 'Dark', 'Temporal', 'Prismatic', 'Entropic'];
const ITEM_OBJ = ['Fragment', 'Core', 'Lattice', 'Matrix', 'Coil',
  'Lens', 'Shard', 'Seed', 'Engine', 'Key'];
const ITEM_TIERS = ['common', 'common', 'common', 'uncommon', 'uncommon', 'rare'];

function pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }

function generateWreckName() {
  return `${pick(['Wreck', 'Remains', 'Hulk'])} of the ${pick(ADJ)} ${pick(NOUN)}`;
}

function generateItem(tier, sourceName) {
  const tierRoll = tier === 3 ? pick(['uncommon', 'rare', 'rare', 'unique'])
    : tier === 2 ? pick(['common', 'uncommon', 'uncommon', 'rare'])
    : pick(ITEM_TIERS);
  const value = tierRoll === 'unique' ? 400 + Math.floor(Math.random() * 200)
    : tierRoll === 'rare' ? 200 + Math.floor(Math.random() * 150)
    : tierRoll === 'uncommon' ? 80 + Math.floor(Math.random() * 80)
    : 20 + Math.floor(Math.random() * 40);
  return {
    name: `${pick(ITEM_MAT)} ${pick(ITEM_OBJ)}`,
    value,
    tier: tierRoll,
    source: sourceName,
  };
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

    // Generate loot based on type and tier
    const itemCount = this.type === 'vault' ? 3 + Math.floor(Math.random() * 3)
      : this.type === 'debris' ? 1 + Math.floor(Math.random() * 2)
      : 1 + Math.floor(Math.random() * 3);
    this.loot = [];
    for (let i = 0; i < itemCount; i++) {
      this.loot.push(generateItem(this.tier, this.name));
    }
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
        piece.loot = [generateItem(wreck.tier, wreck.name)];
        piece.name = wreck.name;
        this.wrecks.push(piece);
      }
    }
    return wreck;
  }

  /**
   * Inject fluid obstruction and visual glow for each wreck.
   */
  update(fluid, dt, totalTime, camX, camY) {
    const cfg = CONFIG.wrecks;
    const s = uvScale();
    const s2 = s * s;

    for (const wreck of this.wrecks) {
      if (!wreck.alive) continue;
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
