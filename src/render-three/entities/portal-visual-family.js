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
    const budget = Math.max(0, frame.style?.entityBudgets?.portals ?? 20);
    this.objectBudget = budget;
    let dropped = 0;
    // Only a submitted sprite consumes the bounded visible-object budget, but
    // budget skips remain explicit temporal records.
    for (const portal of portals) {
      if (this.activeObjects >= budget) {
        draw.budgetCull?.('portals', portal, (portal.radius || 0.08) * 1.15);
        dropped += 1;
        continue;
      }
      const core = draw.sprite(this.group, selectPortalAsset(portal), portal.world.x, portal.world.y,
        (portal.radius || 0.08) * 1.15, 0, 'portals', portal);
      if (core) this.countObject(1);
      if (core && portal.visualState === 'final' && draw.semantic?.(
        this.geometries.ring, this.materials.portalFinalState || this.materials.portal,
        portal.world.x, portal.world.y, (portal.radius || 0.08) * 1.22, 0, 0.145, 'screen'
      )) this.countPart(1);
    }
    this.drop(dropped);
    return this.getStats();
  }
}
