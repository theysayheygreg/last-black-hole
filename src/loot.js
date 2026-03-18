/**
 * loot.js — Static anchored points that obstruct fluid flow.
 *
 * V3: World-space coordinates. Same physics, wider map.
 */

import { CONFIG } from './config.js';
import { worldToFluidUV, worldToScreen, shouldCull, uvScale } from './coords.js';

class LootAnchor {
  constructor(wx, wy) {
    this.wx = wx;
    this.wy = wy;
    this.alive = true;
  }
}

export class LootSystem {
  constructor() {
    this.anchors = [];
  }

  addLoot(wx, wy) {
    const anchor = new LootAnchor(wx, wy);
    this.anchors.push(anchor);
    return anchor;
  }

  update(fluid, dt, totalTime, camX, camY) {
    const cfg = CONFIG.loot;
    const s = uvScale();
    const s2 = s * s;

    for (const anchor of this.anchors) {
      if (!anchor.alive) continue;
      if (shouldCull(anchor.wx, anchor.wy, camX, camY, 0.2)) continue;

      const [fu, fv] = worldToFluidUV(anchor.wx, anchor.wy);

      // Micro-well: flow obstruction (scaled for world size)
      fluid.applyWellForce(
        [fu, fv],
        cfg.gravity * Math.pow(s, cfg.falloff),
        cfg.falloff,
        cfg.fluidClampRadius,
        0,
        dt,
        cfg.fluidTerminalSpeed * s
      );

      // Visible glow — visual buffer (stays anchored, not advected)
      fluid.visualSplat(fu, fv, cfg.glowRadius * s2,
        cfg.densityRate * 0.4,
        cfg.densityRate * 0.8,
        cfg.densityRate * 1.0
      );

      // 4 shimmer points orbiting the anchor — visual buffer
      const shimmerAngle = totalTime * cfg.shimmerSpeed;
      for (let i = 0; i < 4; i++) {
        const angle = shimmerAngle + (i / 4) * Math.PI * 2;
        const px = fu + Math.cos(angle) * cfg.shimmerRadius * s;
        const py = fv + Math.sin(angle) * cfg.shimmerRadius * s;
        fluid.visualSplat(px, py, 0.001 * s2,
          cfg.densityRate * 0.4,
          cfg.densityRate * 0.4,
          cfg.densityRate * 0.3
        );
      }
    }
  }

  render(ctx, camX, camY, canvasW, canvasH, totalTime) {
    const cfg = CONFIG.loot;

    for (const anchor of this.anchors) {
      if (!anchor.alive) continue;

      const [sx, sy] = worldToScreen(anchor.wx, anchor.wy, camX, camY, canvasW, canvasH);
      const pulse = 0.5 + 0.5 * Math.sin(totalTime * cfg.pulseRate * Math.PI * 2);

      ctx.save();
      ctx.beginPath();
      ctx.arc(sx, sy, cfg.overlaySize + 2, 0, Math.PI * 2);
      ctx.strokeStyle = `rgba(100, 200, 255, ${0.3 * pulse})`;
      ctx.lineWidth = 1;
      ctx.stroke();

      ctx.beginPath();
      ctx.arc(sx, sy, cfg.overlaySize * 0.6, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(255, 255, 200, ${0.6 + 0.4 * pulse})`;
      ctx.fill();
      ctx.restore();
    }
  }

  getUVPositions() {
    return this.anchors.filter(a => a.alive).map(a => worldToFluidUV(a.wx, a.wy));
  }
}
