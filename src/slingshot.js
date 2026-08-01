/**
 * Client presentation for the server-authoritative Grapple Arc v3.
 *
 * This class deliberately does not simulate engagement, orbit, boost, or
 * release. Packaged play always receives those outcomes from authority. The
 * only local responsibility is drawing the same size-relative affordance when
 * a sandbox/title scene has world objects but no authority snapshot yet.
 */
import { worldDistance } from './coords.js';
import { GRAPPLE_ARC } from './content/grapple-arc.js';

function geometry(anchor) {
  const family = GRAPPLE_ARC.anchorFamilies[anchor.type] || GRAPPLE_ARC.anchorFamilies.planetoid;
  let physicalRadius = family.minimumPhysicalRadius;
  if (anchor.type === 'well') {
    physicalRadius = Math.max(physicalRadius, Number(anchor.killRadius) || physicalRadius);
  } else if (anchor.type === 'star') {
    const size = GRAPPLE_ARC.starSizeMultipliers[anchor.starType] || 1;
    physicalRadius = Math.max(
      physicalRadius,
      physicalRadius * size * Math.sqrt(Math.max(0.25, Number(anchor.mass) || 1)),
    );
  } else {
    physicalRadius = Math.max(physicalRadius, Number(anchor.radius) || physicalRadius);
  }
  const swingRadius = family.swingClearance + physicalRadius * family.swingRadiusScale;
  return {
    physicalRadius,
    swingRadius,
    hookRadius: swingRadius * GRAPPLE_ARC.hookReachMultiplier,
    boost: family.baseBoost + physicalRadius * family.sizeBoostScale,
  };
}

export class SlingshotSystem {
  collectAnchors(wellSystem, starSystem, planetoidSystem) {
    const anchors = [];
    for (const well of wellSystem?.wells || []) {
      anchors.push({
        ref: well,
        id: well.id || well.name,
        type: 'well',
        wx: well.wx,
        wy: well.wy,
        killRadius: well.killRadius,
        mass: well.mass,
      });
    }
    for (const star of starSystem?.stars || []) {
      if (star.alive === false) continue;
      anchors.push({
        ref: star,
        id: star.id,
        type: 'star',
        starType: star.type,
        wx: star.wx,
        wy: star.wy,
        mass: star.mass,
      });
    }
    for (const planetoid of planetoidSystem?.planetoids || []) {
      if (planetoid.alive === false) continue;
      anchors.push({
        ref: planetoid,
        id: planetoid.id,
        type: 'planetoid',
        wx: planetoid.wx,
        wy: planetoid.wy,
        radius: planetoid.radius,
      });
    }
    return anchors.map((anchor) => {
      const shape = geometry(anchor);
      return { ...anchor, ...shape, range: shape.hookRadius };
    });
  }

  findAffordance(ship, anchors) {
    let best = null;
    for (const anchor of anchors || []) {
      const distance = worldDistance(ship.wx, ship.wy, anchor.wx, anchor.wy);
      if (distance <= anchor.hookRadius && (!best || distance < best.distance)) {
        best = { anchor, distance };
      }
    }
    return best;
  }

  cancel(ship) {
    if (!ship) return;
    ship.slingshotEngaged = false;
    ship.slingshotAnchor = null;
    ship.slingshotEngageRadius = 0;
    ship.slingshotOrbitDir = 0;
  }
}
