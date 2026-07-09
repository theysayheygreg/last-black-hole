import { VisualFamilyLifecycle } from './visual-family.js';

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
      const isRift = portal.variant === 'rift';
      const material = isRift ? this.materials.riftPortal : this.materials.portal;
      const halo = isRift ? this.materials.riftPortalHalo : this.materials.portalHalo;
      const core = draw.readable(this.group, this.geometries.ring, material,
        portal.world.x, portal.world.y, portal.radius || 0.08, 0, 0.08,
        { haloMaterial: halo, haloRadius: 1.55, rimRadius: 1.10, matteRadius: 1.25, matteY: 1.0, matteOpacity: 'heavy' });
      if (core) this.countObject(3);
    }
    this.drop(portals.length - limit);
    return this.getStats();
  }
}
