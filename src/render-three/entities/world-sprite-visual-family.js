import { VisualFamilyLifecycle } from './visual-family.js';
import {
  selectPlanetoidAsset,
  selectFaunaAsset,
  selectScavengerAsset,
  selectSentryAsset,
} from '../entity-assets.js';

function movementHeading(entity) {
  const facing = entity?.movement?.facing;
  if (Number.isFinite(facing)) return -facing - Math.PI * 0.5;
  const velocity = entity?.movement?.velocity || entity?.movement || {};
  return Math.atan2(-(velocity.y || 0), velocity.x || 0) - Math.PI * 0.5;
}

export class WorldSpriteVisualFamily extends VisualFamilyLifecycle {
  constructor({ landmarkGroup, activeGroup }) {
    super('worldSprites');
    this.landmarkGroup = landmarkGroup;
    this.activeGroup = activeGroup;
  }

  update(frame, draw) {
    this.beginUpdate();
    const world = frame.world || {};
    const budgets = frame.style?.entityBudgets || {};
    const ecologyBudget = Math.max(0, budgets.ecology ?? 64);
    const faunaBudget = Math.min(world.fauna?.length || 0, ecologyBudget);
    const families = [
      ['stars', budgets.stars ?? 32, this.landmarkGroup, () => 'starWarm', () => 0.045, () => 0],
      ['planetoids', budgets.planetoids ?? 48, this.landmarkGroup, selectPlanetoidAsset, () => 0.034, movementHeading],
      ['scavengers', budgets.scavengers ?? 48, this.activeGroup, selectScavengerAsset, () => 0.038, movementHeading],
      ['fauna', faunaBudget, this.activeGroup, selectFaunaAsset, (entity) => 0.018 + entity.size * 0.003, () => 0],
      ['sentries', ecologyBudget - faunaBudget, this.activeGroup, selectSentryAsset, () => 0.027, () => 0],
    ];
    this.objectBudget = families.reduce((sum, [, budget]) => sum + Math.max(0, budget), 0);

    for (const [name, budget, group, selectAsset, selectRadius, selectRotation] of families) {
      const entities = world[name] || [];
      const familyBudget = Math.max(0, budget);
      let active = 0;
      let index = 0;
      // Walk past culled entries so budgets describe visible scene density.
      for (; index < entities.length && active < familyBudget; index++) {
        const entity = entities[index];
        if (draw.sprite(group, selectAsset(entity), entity.world.x, entity.world.y,
          selectRadius(entity), selectRotation(entity), name, entity)) {
          this.countObject(4);
          active += 1;
        }
      }
      this.drop(entities.length - index);
    }
    return this.getStats();
  }
}
