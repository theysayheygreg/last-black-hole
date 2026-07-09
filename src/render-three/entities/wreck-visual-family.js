import { VisualFamilyLifecycle } from './visual-family.js';

export class WreckVisualFamily extends VisualFamilyLifecycle {
  constructor({ group, geometries, materials }) {
    super('wreck');
    this.group = group;
    this.geometries = geometries;
    this.materials = materials;
  }

  update(frame, draw) {
    this.beginUpdate();
    const wrecks = frame.world?.wrecks || [];
    const budget = Math.max(0, frame.style?.entityBudgets?.wrecks || 96);
    this.objectBudget = budget;
    const limit = Math.min(wrecks.length, budget);
    for (let index = 0; index < limit; index++) {
      const wreck = wrecks[index];
      const size = wreck.size === 'large' ? 0.042 : wreck.size === 'small' || wreck.size === 'scattered' ? 0.020 : 0.030;
      const material = wreck.looted ? this.materials.lootedWreck : this.materials.wreck;
      const halo = wreck.looted ? this.materials.lootedWreckHalo : this.materials.wreckHalo;
      const rim = wreck.looted ? this.materials.lootedWreckHalo : this.materials.wreckRim;
      const core = draw.readable(this.group, this.geometries.square, material,
        wreck.world.x, wreck.world.y, size, Math.PI * 0.25, 0.07,
        { haloMaterial: halo, rimMaterial: rim, haloRadius: 1.55, rimRadius: 1.16, matteRadius: 3.6, matteY: 1.0, matteOpacity: 'heavy' },
        'screen');
      if (core) this.countObject(4);
    }
    this.drop(wrecks.length - limit);
    return this.getStats();
  }
}
