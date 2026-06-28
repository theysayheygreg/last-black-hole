// src/render-three/vfx/vfx-quality.js
//
// Presentation budgets for Three VFX. Gameplay code does not read these; they
// only constrain how many visual particles the renderer may submit.

export const VFX_QUALITY = {
  minimal: {
    particleBudget: 120,
    titleBurstScale: 0.55,
  },
  default: {
    particleBudget: 350,
    titleBurstScale: 0.80,
  },
  rich: {
    particleBudget: 700,
    titleBurstScale: 1.0,
  },
  capture: {
    particleBudget: 1200,
    titleBurstScale: 1.45,
  },
};

export function normalizeVfxQuality(value, fallback = 'rich') {
  const key = String(value || fallback).toLowerCase();
  return Object.prototype.hasOwnProperty.call(VFX_QUALITY, key) ? key : fallback;
}

export function resolveVfxBudget(config = {}, renderQuality = 'rich') {
  const requested = normalizeVfxQuality(config.quality, renderQuality === 'minimal' ? 'minimal' : renderQuality);
  const base = VFX_QUALITY[requested] || VFX_QUALITY.rich;
  const explicit = Number(config.particleBudget);
  const particleBudget = Number.isFinite(explicit) && explicit > 0
    ? Math.min(explicit, base.particleBudget)
    : base.particleBudget;
  return {
    quality: requested,
    particleBudget,
    titleBurstScale: base.titleBurstScale,
  };
}
