/**
 * map-loader.js — Loads a map definition into the running game systems.
 *
 * Single entry point: loadMap(). Clears all entity arrays, sets world scale,
 * spawns entities from map data, optionally reinitializes the fluid sim.
 */

import { setWorldScale } from './coords.js';
import { selectAnomalyCast } from './anomaly-catalog.js';
import { assertMapDefinitionParity, PLAYABLE_MAP_IDS } from './content/map-scales.js';

function resolveMapDefinition(map) {
  if (map?.id) return assertMapDefinitionParity(map);
  if (!map || !Number.isFinite(map.worldScale)) return assertMapDefinitionParity(map);

  // Title and renderer compositions are presentation fixtures, not playable
  // maps. Keep their authored dimensions while routing catalog selection
  // through a valid canonical playable id.
  return {
    mapId: PLAYABLE_MAP_IDS[0],
    dimensions: { width: map.worldScale, height: map.worldScale },
  };
}

function applyPlanetoidOverrides(planetoid, data = {}) {
  if (!planetoid) return planetoid;
  if (data.id) planetoid.id = data.id;
  if (data.name) planetoid.name = data.name;
  if (Number.isFinite(data.x)) planetoid.wx = data.x;
  if (Number.isFinite(data.y)) planetoid.wy = data.y;
  if (Number.isFinite(data.vx)) planetoid.vx = data.vx;
  if (Number.isFinite(data.vy)) planetoid.vy = data.vy;
  if (Number.isFinite(data.phase)) planetoid.t = data.phase;
  return planetoid;
}

/**
 * Load a map definition into the game.
 *
 * @param {Object} map - Map definition (see src/maps/*.js for format)
 * @param {Object} systems - Game systems to populate
 * @param {WellSystem} systems.wellSystem
 * @param {StarSystem} systems.starSystem
 * @param {WreckSystem} systems.wreckSystem
 * @param {PortalSystem} systems.portalSystem
 * @param {PlanetoidSystem} systems.planetoidSystem
 * @param {FluidSim} systems.fluid
 * @returns {{ startingMasses: number[], anomalyCatalog: Object }}
 */
export function loadMap(map, systems, { seed = 1 } = {}) {
  const { wellSystem, starSystem, wreckSystem, portalSystem, planetoidSystem, fluid } = systems;
  const mapDefinition = resolveMapDefinition(map);

  // 1. Set world scale (live binding — all importers see the new value)
  setWorldScale(mapDefinition.dimensions.width);

  // 2. Clear all entity arrays
  wellSystem.wells = [];
  starSystem.stars = [];
  if (wreckSystem) wreckSystem.wrecks = [];
  portalSystem.portals = [];
  planetoidSystem.planetoids = [];
  planetoidSystem.spawnTimer = 10;

  // 3. Reinitialize fluid if map specifies a different resolution
  if (map.fluidResolution && map.fluidResolution !== fluid.res) {
    fluid.reinitialize(map.fluidResolution);
  }

  // 4. Spawn wells through the catalog migration seam. The selected entry
  // only supplies identity in phase 1; current-well fields remain untouched.
  const anomalyCatalog = selectAnomalyCast({
    mapId: mapDefinition.mapId,
    seed,
    wellCount: map.wells.length,
  });
  for (let index = 0; index < map.wells.length; index += 1) {
    const w = map.wells[index];
    const catalogWell = anomalyCatalog.cast[index];
    wellSystem.addWell(w.x, w.y, {
      id: w.id || `well-${index + 1}`,
      catalogId: catalogWell?.catalogId,
      mass: w.mass,
      orbitalDir: w.orbitalDir ?? 1,
      killRadius: w.killRadius,
      accretionSpinRate: w.spinRate,
      accretionPoints: w.points,
      accretionRadius: w.accretionRadius,
      accretionRate: w.accretionRate,
      voidRadius: w.voidRadius,
      growthRate: w.growthRate,
    });
  }

  // 5. Spawn stars
  for (const s of map.stars) {
    starSystem.addStar(s.x, s.y, {
      id: s.id || `star-${starSystem.stars.length + 1}`,
      mass: s.mass ?? 1.0,
      orbitalDir: s.orbitalDir ?? 1,
      type: s.type,  // yellowDwarf if omitted
      driftVX: s.driftVX ?? 0,
      driftVY: s.driftVY ?? 0,
    });
  }

  // 6. Spawn wrecks
  for (const w of (map.wrecks || [])) {
    if (wreckSystem) {
      wreckSystem.addWreck(w.x, w.y, {
        type: w.type,
        tier: w.tier ?? 1,
        size: w.size ?? 'medium',
      });
    }
  }

  // 8. Reset portal wave system (portals spawn via waves, not map data)
  portalSystem.portals = [];
  portalSystem._nextWaveIndex = 0;

  // 9. Spawn planetoids by well index reference
  for (const pd of (map.planetoids || [])) {
    if (pd.type === 'orbit') {
      const well = wellSystem.wells[pd.wellIndex];
      if (well) applyPlanetoidOverrides(planetoidSystem.spawnOrbit(well), pd);
    } else if (pd.type === 'figure8') {
      const wA = wellSystem.wells[pd.wellA];
      const wB = wellSystem.wells[pd.wellB];
      if (wA && wB) applyPlanetoidOverrides(planetoidSystem.spawnFigure8(wA, wB), pd);
    } else if (pd.type === 'transit') {
      applyPlanetoidOverrides(planetoidSystem.spawnTransit(), pd);
    }
  }

  // 9. Return starting masses for restart
  return {
    startingMasses: wellSystem.wells.map(w => w.mass),
    anomalyCatalog,
  };
}
