import { VisualFamilyLifecycle } from './visual-family.js';
import { selectPortalAsset } from '../entity-assets.js';

export class PortalVisualFamily extends VisualFamilyLifecycle {
  constructor({ group, geometries, materials }) {
    super('portal');
    this.group = group;
    this.geometries = geometries;
    this.materials = materials;
  }

  update(frame, draw) {
    this.beginUpdate();
    const portals = frame.world?.portals || [];
    const budget = Math.max(0, frame.style?.entityBudgets?.portals || 20);
    this.objectBudget = budget;
    const limit = Math.min(portals.length, budget);
    for (let index = 0; index < limit; index++) {
      const portal = portals[index];
      const core = draw.sprite(this.group, selectPortalAsset(portal), portal.world.x, portal.world.y,
        (portal.radius || 0.08) * 1.15, 0, 'portals', portal);
      if (core) this.countObject(3);
    }
    this.drop(portals.length - limit);
    return this.getStats();
  }
}
