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
    const budget = Math.max(0, frame.style?.entityBudgets?.wrecks ?? 96);
    this.objectBudget = budget;
    let dropped = 0;
    // Projection rejection must not spend a density slot needed by a later
    // visible wreck, but every budget skip still gets an explicit ledger row.
    for (const wreck of wrecks) {
      if (this.activeObjects >= budget) {
        draw.budgetCull?.('wrecks', wreck, 0);
        dropped += 1;
        continue;
      }
      const core = draw.sprite(this.group, selectWreckAsset(wreck), wreck.world.x, wreck.world.y,
        0, 0, 'wrecks', wreck);
      if (core) this.countObject(1);
    }
    this.drop(dropped);
    return this.getStats();
  }
}
