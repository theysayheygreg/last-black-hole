/**
 * map-loader.js — Loads a map definition into the running game systems.
 *
 * Single entry point: loadMap(). Clears all entity arrays, sets world scale,
 * spawns entities from map data, optionally reinitializes the fluid sim.
 */

import { setWorldScale } from './coords.js';

/**
 * Load a map definition into the game.
 *
 * @param {Object} map - Map definition (see src/maps/*.js for format)
 * @param {Object} systems - Game systems to populate
 * @param {WellSystem} systems.wellSystem
 * @param {StarSystem} systems.starSystem
 * @param {LootSystem} systems.lootSystem
 * @param {PortalSystem} systems.portalSystem
 * @param {PlanetoidSystem} systems.planetoidSystem
 * @param {FluidSim} systems.fluid
 * @returns {{ startingMasses: number[] }}
 */
export function loadMap(map, systems) {
  const { wellSystem, starSystem, lootSystem, portalSystem, planetoidSystem, fluid } = systems;

  // 1. Set world scale (live binding — all importers see the new value)
  setWorldScale(map.worldScale);

  // 2. Clear all entity arrays
  wellSystem.wells = [];
  starSystem.stars = [];
  lootSystem.anchors = [];
  portalSystem.portals = [];
  planetoidSystem.planetoids = [];
  planetoidSystem.spawnTimer = 10;

  // 3. Reinitialize fluid if map specifies a different resolution
  if (map.fluidResolution && map.fluidResolution !== fluid.res) {
    fluid.reinitialize(map.fluidResolution);
  }

  // 4. Spawn wells
  for (const w of map.wells) {
    wellSystem.addWell(w.x, w.y, {
      mass: w.mass,
      orbitalDir: w.orbitalDir ?? 1,
      killRadius: w.killRadius,
      accretionSpinRate: w.spinRate,
      accretionPoints: w.points,
    });
  }

  // 5. Spawn stars
  for (const s of map.stars) {
    starSystem.addStar(s.x, s.y, {
      mass: s.mass ?? 1.0,
      orbitalDir: s.orbitalDir ?? 1,
    });
  }

  // 6. Spawn loot
  for (const l of map.loot) {
    lootSystem.addLoot(l.x, l.y);
  }

  // 7. Spawn portals
  for (const p of map.portals) {
    portalSystem.addPortal(p.x, p.y);
  }

  // 8. Spawn planetoids by well index reference
  for (const pd of (map.planetoids || [])) {
    if (pd.type === 'orbit') {
      const well = wellSystem.wells[pd.wellIndex];
      if (well) planetoidSystem.spawnOrbit(well);
    } else if (pd.type === 'figure8') {
      const wA = wellSystem.wells[pd.wellA];
      const wB = wellSystem.wells[pd.wellB];
      if (wA && wB) planetoidSystem.spawnFigure8(wA, wB);
    }
  }

  // 9. Return starting masses for restart
  return {
    startingMasses: wellSystem.wells.map(w => w.mass),
  };
}
