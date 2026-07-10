import { VisualFamilyLifecycle } from './visual-family.js';
import { selectWreckAsset } from '../entity-assets.js';

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
      const core = draw.sprite(this.group, selectWreckAsset(wreck), wreck.world.x, wreck.world.y,
        size * 1.35, 0, 'wrecks');
      if (core) this.countObject(4);
    }
    this.drop(wrecks.length - limit);
    return this.getStats();
  }
}
