/**
 * Validation tests — catch silent failures before they hit the GPU.
 *
 * One test suite that checks map data, config bounds, and pipeline limits.
 * These don't need a browser — they validate data integrity directly.
 *
 * Usage: node tests/validation.js
 */

const path = require('path');
const fs = require('fs');
const ROOT = path.resolve(__dirname, '..');
const { loadPlayableMaps } = require('../scripts/shared-map-loader.cjs');
const { MAP_SCALE_REGISTRY, PLAYABLE_MAP_IDS } = require('../scripts/content/map-scales.cjs');
const { MOVEMENT } = require('../scripts/content/movement.cjs');

// ---- Helpers ----

class TestRunner {
  constructor(suiteName) {
    this.suite = suiteName;
    this.results = [];
  }
  run(name, fn) {
    try {
      fn();
      this.results.push({ name, passed: true });
      console.log(`  PASS: ${name}`);
    } catch (err) {
      this.results.push({ name, passed: false, error: err.message });
      console.log(`  FAIL: ${name}`);
      console.log(`        ${err.message}`);
    }
  }
  summary() {
    const passed = this.results.filter(r => r.passed).length;
    const failed = this.results.filter(r => !r.passed).length;
    console.log(`\n${this.suite}: ${passed} passed, ${failed} failed`);
    return failed === 0;
  }
}

function assert(condition, message) {
  if (!condition) throw new Error(message || 'Assertion failed');
}

// ---- Load source files as text (for shader inspection) ----

const SRC = path.resolve(__dirname, '..', 'src');
const fluidShaderSrc = fs.readFileSync(path.join(SRC, 'render', 'shaders', 'fluid.glsl.js'), 'utf8');
const configSrc = fs.readFileSync(path.join(SRC, 'config.js'), 'utf8');
const asciiShaderSrc = fs.readFileSync(path.join(SRC, 'render', 'shaders', 'ascii.glsl.js'), 'utf8');
const asciiPassSrc = fs.readFileSync(path.join(SRC, 'render', 'passes', 'ascii-pass.js'), 'utf8');
const mainSrc = fs.readFileSync(path.join(SRC, 'main.js'), 'utf8');
const testApiSrc = fs.readFileSync(path.join(SRC, 'test-api.js'), 'utf8');
const rendererFixturesSrc = fs.readFileSync(path.join(SRC, 'maps', 'renderer-fixtures.js'), 'utf8');

// Extract GLSL array sizes from shader source
function findGLSLArraySize(src, name) {
  const re = new RegExp(`uniform\\s+vec2\\s+${name}\\[(\\d+)\\]`);
  const match = src.match(re);
  return match ? parseInt(match[1]) : null;
}

// ---- Load map files ----
// Maps are ES modules, so we parse them as text and extract the data

function parseMapFile(filepath) {
  const src = fs.readFileSync(filepath, 'utf8');
  // Extract the MAP object by evaluating the JS (safe — our own files)
  const fn = new Function(src.replace('export const MAP =', 'return'));
  return fn();
}

const MAPS_DIR = path.join(SRC, 'maps');
const mapFiles = fs.readdirSync(MAPS_DIR).filter(f => {
  if (!f.endsWith('.js')) return false;
  const src = fs.readFileSync(path.join(MAPS_DIR, f), 'utf8');
  return src.includes('export const MAP = {');
});
const staticMaps = mapFiles.map(f => ({
  name: f,
  data: parseMapFile(path.join(MAPS_DIR, f)),
}));
const loadedPlayableMaps = loadPlayableMaps();
const playableMaps = PLAYABLE_MAP_IDS.map(mapId => {
  const definition = MAP_SCALE_REGISTRY[mapId];
  const map = loadedPlayableMaps[mapId];
  return {
    name: definition.sourceFile,
    data: {
      ...map,
      wells: map.wells.map(({ wx, wy, ...well }) => ({ ...well, x: wx, y: wy })),
      stars: map.stars.map(({ wx, wy, ...star }) => ({ ...star, x: wx, y: wy })),
      wrecks: map.wrecks.map(({ wx, wy, ...wreck }) => ({ ...wreck, x: wx, y: wy })),
      fluidResolution: null,
    },
  };
});
const maps = [...staticMaps, ...playableMaps];

// ---- Extract config values ----
// CONFIG is a plain object literal, extract via eval

function parseConfig() {
  const src = fs.readFileSync(path.join(SRC, 'config.js'), 'utf8');
  const movement = JSON.parse(fs.readFileSync(path.join(SRC, 'content', 'movement.data.json'), 'utf8'));
  const sessionProfiles = JSON.parse(fs.readFileSync(path.join(SRC, 'content', 'session-profiles.data.json'), 'utf8'));
  const fabric = JSON.parse(fs.readFileSync(path.join(SRC, 'content', 'fabric.data.json'), 'utf8'));
  const stars = JSON.parse(fs.readFileSync(path.join(SRC, 'content', 'stars.data.json'), 'utf8'));
  const evaluable = src
    .replace("import { MOVEMENT } from './content/movement.js';", '')
    .replace("import { FABRIC } from './content/fabric.js';", '')
    .replace("import { CLIENT_PERF_PROFILES } from './content/session-profiles.js';", '')
    .replace("import { STAR_GAMEPLAY } from './content/stars.js';", '')
    .replace('export const CONFIG =', 'return');
  const fn = new Function('MOVEMENT', 'FABRIC', 'CLIENT_PERF_PROFILES', 'STAR_GAMEPLAY', evaluable);
  return fn(movement, fabric, sessionProfiles.CLIENT_PERF_PROFILES, stars);
}

const CONFIG = parseConfig();

// ---- Load signature manifests ----

const SIGNATURE_CONSTANTS = [
  'SIGNATURE_DEFINITIONS',
  'SIGNATURE_POOLS_BY_MAP_ID',
  'LAYOUT_MULTIPLIERS',
  'SEEDED_SIGNATURES',
];

const ITEM_CONSTANTS = [
  'ARTIFACT_SPECIAL_IDS',
  'CONSUMABLE_EFFECT_IDS',
  'ITEM_CATALOG',
  'CONSUMABLE_CATALOG',
];

const SESSION_PROFILE_CONSTANTS = [
  'SESSION_PROFILE_FIELDS',
  'CLIENT_PERF_PROFILES',
  'SESSION_PROFILES',
];

const HULL_CONSTANTS = [
  'RIG_TRACKS',
  'PROFILE_SHIP_TO_HULL',
  'HULL_DEFINITIONS',
  'PERSONALITY_HULL_MAP',
];

// Both client (ESM) and server (CJS) sides load the same canonical JSON
// for content data — see src/content/*.data.json. We can therefore read
// the JSON directly here and use it as the single source of truth for
// validation. The previous eval-based parser is gone because ESM source
// now uses `import data from './X.data.json'` which can't be evaluated
// inside a regular Function.
function loadContentJson(name) {
  return JSON.parse(fs.readFileSync(path.join(SRC, 'content', `${name}.data.json`), 'utf8'));
}

const serverSignatures = require(path.join(ROOT, 'scripts', 'content', 'signatures.cjs'));
const clientSignatures = loadContentJson('signatures');
const serverItems = require(path.join(ROOT, 'scripts', 'content', 'items.cjs'));
const clientItems = loadContentJson('items');
const serverSessionProfiles = require(path.join(ROOT, 'scripts', 'content', 'session-profiles.cjs'));
const clientSessionProfiles = loadContentJson('session-profiles');
const serverHulls = require(path.join(ROOT, 'scripts', 'content', 'hulls.cjs'));
const clientHulls = loadContentJson('hulls');

function deepEqual(a, b) {
  return JSON.stringify(a) === JSON.stringify(b);
}

function assertObject(value, label) {
  assert(value && typeof value === 'object' && !Array.isArray(value), `${label} must be an object`);
}

function assertValueRange(value, label) {
  assert(Array.isArray(value) && value.length === 2, `${label} must be [min, max]`);
  assert(Number.isFinite(value[0]) && Number.isFinite(value[1]), `${label} values must be finite`);
  assert(value[0] >= 0 && value[1] >= value[0], `${label} must be non-negative and ordered`);
}

function specialAtoms(special) {
  if (typeof special !== 'string' || special.length === 0) return [];
  return special
    .split(',')
    .map(token => token.trim().replace(/[+\-×x]\d+(?:\.\d+)?$/, '').replace(/\d+$/, ''))
    .filter(Boolean);
}

function parseAsciiRamps() {
  const match = asciiShaderSrc.match(/export const RAMPS = \[([\s\S]*?)\];/);
  assert(match, 'Could not find ASCII RAMPS export');
  const body = match[1];
  const ramps = [];
  const re = /'((?:\\.|[^'\\])*)'/g;
  let rampMatch;
  while ((rampMatch = re.exec(body)) !== null) {
    ramps.push(new Function(`return '${rampMatch[1]}';`)());
  }
  return ramps;
}

const DORMANT_SIGNATURE_CONFIG_OVERRIDES = new Set([
  'portals.evaporationInterval',
  'universe.viscosityGrowth',
]);

// ---- GLSL limits ----

const DISPLAY_WELL_LIMIT = findGLSLArraySize(fluidShaderSrc, 'u_wellPositions');
// There are two u_wellPositions declarations (display + dissipation) — find both
const allLimits = [];
const re = /uniform\s+vec2\s+u_wellPositions\[(\d+)\]/g;
let m;
while ((m = re.exec(fluidShaderSrc)) !== null) {
  allLimits.push(parseInt(m[1]));
}

// ========================================
// TESTS
// ========================================

console.log('\n=== VALIDATION TESTS ===\n');
const runner = new TestRunner('Validation');

// ---- 1. Map well counts vs GLSL array capacity ----

runner.run('Map well counts within GLSL display shader capacity', () => {
  const limit = allLimits[0]; // display shader
  assert(limit != null, 'Could not find u_wellPositions array size in display shader');
  for (const map of maps) {
    const wellCount = map.data.wells.length;
    assert(wellCount <= limit,
      `${map.name}: ${wellCount} wells exceeds display shader capacity of ${limit}`);
  }
});

runner.run('Map total density sources within GLSL dissipation shader capacity', () => {
  const limit = allLimits[1] || allLimits[0]; // dissipation shader (second declaration)
  assert(limit != null, 'Could not find u_wellPositions array size in dissipation shader');
  for (const map of maps) {
    // Count all density sources: wells + stars + wrecks + portals (wave-spawned, estimate max) + planetoids + ship
    // Debris wrecks spawn 2-5 extra pieces each
    const debrisCount = (map.data.wrecks || []).filter(w => w.type === 'debris').length;
    const maxDebrisPieces = debrisCount * 5;
    const totalSources = map.data.wells.length
      + map.data.stars.length
      + (map.data.wrecks || []).length + maxDebrisPieces
      + 5  // max portals from wave system
      + (CONFIG.planetoids.maxAlive || 6)
      + 1; // ship
    assert(totalSources <= limit,
      `${map.name}: ~${totalSources} max density sources exceeds dissipation shader capacity of ${limit}`);
  }
});

// ---- 2. Well data validation ----

runner.run('All wells have positive mass', () => {
  for (const map of maps) {
    for (let i = 0; i < map.data.wells.length; i++) {
      const w = map.data.wells[i];
      assert(w.mass > 0, `${map.name} well[${i}]: mass=${w.mass} must be > 0`);
    }
  }
});

runner.run('All wells have positive killRadius', () => {
  for (const map of maps) {
    for (let i = 0; i < map.data.wells.length; i++) {
      const w = map.data.wells[i];
      if (w.killRadius != null) {
        assert(w.killRadius > 0, `${map.name} well[${i}]: killRadius=${w.killRadius} must be > 0`);
      }
    }
  }
});

runner.run('All well positions within world bounds', () => {
  for (const map of maps) {
    const ws = map.data.worldScale;
    for (let i = 0; i < map.data.wells.length; i++) {
      const w = map.data.wells[i];
      assert(w.x >= 0 && w.x < ws, `${map.name} well[${i}]: x=${w.x} outside [0, ${ws})`);
      assert(w.y >= 0 && w.y < ws, `${map.name} well[${i}]: y=${w.y} outside [0, ${ws})`);
    }
  }
});

// ---- 3. Star data validation ----

runner.run('All star positions within world bounds', () => {
  for (const map of maps) {
    const ws = map.data.worldScale;
    for (let i = 0; i < map.data.stars.length; i++) {
      const s = map.data.stars[i];
      assert(s.x >= 0 && s.x < ws, `${map.name} star[${i}]: x=${s.x} outside [0, ${ws})`);
      assert(s.y >= 0 && s.y < ws, `${map.name} star[${i}]: y=${s.y} outside [0, ${ws})`);
    }
  }
});

// ---- 4. Loot/wreck positions ----

// Loot position validation removed — loot anchors replaced with stars

runner.run('All wreck positions within world bounds', () => {
  for (const map of maps) {
    const ws = map.data.worldScale;
    for (const w of (map.data.wrecks || [])) {
      assert(w.x >= 0 && w.x < ws, `${map.name} wreck at (${w.x},${w.y}): x outside [0, ${ws})`);
      assert(w.y >= 0 && w.y < ws, `${map.name} wreck at (${w.x},${w.y}): y outside [0, ${ws})`);
    }
  }
});

// ---- 5. Planetoid well index references ----

runner.run('All planetoid wellIndex/wellA/wellB references are valid', () => {
  for (const map of maps) {
    const wellCount = map.data.wells.length;
    for (let i = 0; i < (map.data.planetoids || []).length; i++) {
      const p = map.data.planetoids[i];
      if (p.type === 'orbit') {
        assert(p.wellIndex >= 0 && p.wellIndex < wellCount,
          `${map.name} planetoid[${i}]: wellIndex=${p.wellIndex} out of range [0, ${wellCount})`);
      } else if (p.type === 'figure8') {
        assert(p.wellA >= 0 && p.wellA < wellCount,
          `${map.name} planetoid[${i}]: wellA=${p.wellA} out of range [0, ${wellCount})`);
        assert(p.wellB >= 0 && p.wellB < wellCount,
          `${map.name} planetoid[${i}]: wellB=${p.wellB} out of range [0, ${wellCount})`);
      }
    }
  }
});

// ---- 6. World scale validation ----

runner.run('All maps have worldScale > 0', () => {
  for (const map of maps) {
    assert(map.data.worldScale > 0, `${map.name}: worldScale=${map.data.worldScale} must be > 0`);
  }
});

// ---- 7. CONFIG bounds that break math ----

runner.run('fluid.dissipation < 1.0 (prevents velocity blowup)', () => {
  assert(CONFIG.fluid.dissipation < 1.0,
    `fluid.dissipation=${CONFIG.fluid.dissipation} must be < 1.0 or velocity amplifies exponentially`);
});

runner.run('fluid.nearDissipation < 1.0 (prevents density blowup)', () => {
  assert(CONFIG.fluid.nearDissipation < 1.0,
    `fluid.nearDissipation=${CONFIG.fluid.nearDissipation} must be < 1.0`);
});

runner.run('fluid.farDissipation < 1.0 (prevents density blowup)', () => {
  assert(CONFIG.fluid.farDissipation < 1.0,
    `fluid.farDissipation=${CONFIG.fluid.farDissipation} must be < 1.0`);
});

runner.run('fluid.resolution > 0', () => {
  assert(CONFIG.fluid.resolution > 0,
    `fluid.resolution=${CONFIG.fluid.resolution} must be > 0`);
});

runner.run('ascii.cellSize > 0', () => {
  assert(CONFIG.ascii.cellSize > 0,
    `ascii.cellSize=${CONFIG.ascii.cellSize} must be > 0`);
});

runner.run('ascii.contrast > 0 (prevents all-bright or NaN luminance)', () => {
  assert(CONFIG.ascii.contrast > 0,
    `ascii.contrast=${CONFIG.ascii.contrast} must be > 0`);
});

runner.run('color.densityScale > 0 (prevents invisible fluid)', () => {
  assert(CONFIG.color.densityScale > 0,
    `color.densityScale=${CONFIG.color.densityScale} must be > 0`);
});

runner.run('wells.falloff > 0 (prevents distance-independent gravity)', () => {
  assert(CONFIG.wells.falloff > 0,
    `wells.falloff=${CONFIG.wells.falloff} must be > 0`);
});

runner.run('wells.killRadius > 0', () => {
  assert(CONFIG.wells.killRadius > 0,
    `wells.killRadius=${CONFIG.wells.killRadius} must be > 0`);
});

runner.run('Inhibitor text corruption stays bounded', () => {
  const cfg = CONFIG.inhibitor?.textCorruption;
  assert(cfg && typeof cfg === 'object', 'CONFIG.inhibitor.textCorruption is missing');
  assert(cfg.amount >= 0 && cfg.amount <= 1,
    `inhibitor.textCorruption.amount=${cfg.amount} must stay within 0..1`);
  assert(cfg.density >= 0 && cfg.density <= 1,
    `inhibitor.textCorruption.density=${cfg.density} must stay within 0..1`);
  assert(cfg.maxMarks >= 0 && cfg.maxMarks <= 6,
    `inhibitor.textCorruption.maxMarks=${cfg.maxMarks} must stay within 0..6`);
  assert(cfg.refreshHz >= 1 && cfg.refreshHz <= 12,
    `inhibitor.textCorruption.refreshHz=${cfg.refreshHz} must stay within 1..12`);
});

// ---- 8. Negative mass guard: growthVariance cannot exceed growthAmount ----

runner.run('Well growth variance cannot produce negative growth rate', () => {
  const minRate = CONFIG.events.growthAmount - CONFIG.universe.wellGrowthVariance;
  assert(minRate >= 0,
    `Min growth rate = ${CONFIG.events.growthAmount} - ${CONFIG.universe.wellGrowthVariance} = ${minRate}. ` +
    `Must be >= 0 or wells can shrink to negative mass`);
});

// ---- 9. Dead map data and stale perf overrides ----

runner.run('Map files do not define unused portals field', () => {
  for (const map of maps) {
    if (map.data.portals && map.data.portals.length > 0) {
      throw new Error(`${map.name} defines ${map.data.portals.length} portals (ignored — wave system spawns portals)`);
    }
  }
});

runner.run('Playable maps do not carry client perf overrides', () => {
  for (const map of playableMaps) {
    assert(map.data.fluidResolution == null,
      `${map.name}: fluidResolution is stale; client grid size comes from CONFIG.fluid.resolution`);
    assert(map.data.configOverrides == null,
      `${map.name}: configOverrides are stale for gameplay maps; fixed-grid/coarse-field scaling is runtime-owned`);
  }
});

runner.run('Playable map scales and filenames match the canonical registry', () => {
  assert(playableMaps.length === PLAYABLE_MAP_IDS.length,
    `Expected ${PLAYABLE_MAP_IDS.length} playable maps, got ${playableMaps.length}`);
  for (const mapId of PLAYABLE_MAP_IDS) {
    const definition = MAP_SCALE_REGISTRY[mapId];
    const map = playableMaps.find(candidate => candidate.data.id === mapId);
    assert(map, `${mapId}: shared loader did not return canonical map`);
    assert(map.name === definition.sourceFile,
      `${mapId}: expected sourceFile ${definition.sourceFile}, got ${map.name}`);
    assert(map.data.sourceFile === definition.sourceFile,
      `${mapId}: loaded sourceFile does not match registry`);
    assert(map.data.worldScale === definition.dimensions.width,
      `${mapId}: worldScale does not match registry width`);
    assert(map.data.dimensions.width === definition.dimensions.width
      && map.data.dimensions.height === definition.dimensions.height,
      `${mapId}: dimensions do not match registry`);
    assert(map.data.profileId === definition.profileId,
      `${mapId}: profile identity does not match registry`);
  }
});

// ---- 10. GLSL array sizes are consistent ----

runner.run('Display and dissipation shader well arrays are same size', () => {
  assert(allLimits.length >= 2,
    `Expected 2 u_wellPositions declarations, found ${allLimits.length}`);
  assert(allLimits[0] === allLimits[1],
    `Display shader has [${allLimits[0]}] but dissipation shader has [${allLimits[1]}] — must match`);
});

// ---- 11. UV-space vs world-space sanity checks ----

runner.run('UV-space CONFIG values are plausible (< 0.5)', () => {
  // These are all UV-space radii/distances. If any exceed 0.5, something is probably
  // in the wrong coordinate space (world-space leaking into UV config).
  const uvValues = [
    ['wells.accretionRadius', CONFIG.wells.accretionRadius],
    ['wells.voidRadius', CONFIG.wells.voidRadius],
    ['ship.wake.radius', CONFIG.ship.wake.radius],
    ['ship.wake.splatSpacing', CONFIG.ship.wake.splatSpacing],
    ['fluid.dissipationNearRadius', CONFIG.fluid.dissipationNearRadius],
    ['fluid.dissipationFarRadius', CONFIG.fluid.dissipationFarRadius],
    ['combat.pulseRadius', CONFIG.combat.pulseRadius],
  ];
  for (const [name, value] of uvValues) {
    assert(value < 0.5,
      `${name}=${value} looks too large for UV-space (expected < 0.5). Is this world-space?`);
  }
});

runner.run('World-space CONFIG values are plausible (> 0.01)', () => {
  // These are all world-space distances. If any are < 0.01, something might be
  // in UV-space when it should be world-space.
  const worldValues = [
    ['wells.killRadius', CONFIG.wells.killRadius],
    ['wells.maxRange', CONFIG.wells.maxRange],
    ['portals.captureRadius', CONFIG.portals.captureRadius],
    ['combat.pulseEntityRadius', CONFIG.combat.pulseEntityRadius],
    ['wrecks.pickupRadius', CONFIG.wrecks.pickupRadius],
    ['scavengers.bumpRadius', CONFIG.scavengers.bumpRadius],
    ['scavengers.fleeWellDist', CONFIG.scavengers.fleeWellDist],
  ];
  for (const [name, value] of worldValues) {
    assert(value > 0.01,
      `${name}=${value} looks too small for world-space (expected > 0.01). Is this UV-space?`);
  }
});

// ---- 12. Signature content manifest validation ----

runner.run('Signature server/client manifests stay in sync', () => {
  for (const name of SIGNATURE_CONSTANTS) {
    assert(deepEqual(serverSignatures[name], clientSignatures[name]),
      `scripts/content/signatures.js ${name} does not match src/content/signatures.js`);
  }
});

runner.run('Playable signature manifest has unique ids and names', () => {
  const ids = new Set();
  const names = new Set();
  for (const [key, sig] of Object.entries(serverSignatures.SIGNATURE_DEFINITIONS)) {
    assertObject(sig, `signature ${key}`);
    assert(sig.id === key, `signature ${key}: id must match object key`);
    assert(!ids.has(sig.id), `Duplicate signature id: ${sig.id}`);
    assert(!names.has(sig.name), `Duplicate signature name: ${sig.name}`);
    ids.add(sig.id);
    names.add(sig.name);
  }
});

runner.run('Playable signature pools match canonical map ids', () => {
  const allowedMapIds = new Set(PLAYABLE_MAP_IDS);
  const pooledIds = new Set();
  for (const [mapId, pool] of Object.entries(serverSignatures.SIGNATURE_POOLS_BY_MAP_ID)) {
    assert(allowedMapIds.has(mapId), `Signature pool exists for unknown map id ${mapId}`);
    assert(Array.isArray(pool) && pool.length > 0, `Signature pool ${mapId} must be a non-empty array`);
    for (const id of pool) {
      const sig = serverSignatures.SIGNATURE_DEFINITIONS[id];
      assert(sig, `Signature pool ${mapId} references unknown id ${id}`);
      assert(sig.mapIds.includes(mapId),
        `Signature ${id} is in ${mapId} pool but mapIds=${sig.mapIds.join(',')}`);
      pooledIds.add(id);
    }
  }
  for (const sig of Object.values(serverSignatures.SIGNATURE_DEFINITIONS)) {
    assert(pooledIds.has(sig.id), `Signature ${sig.id} is not present in any map-id pool`);
    for (const mapId of sig.mapIds) {
      assert(allowedMapIds.has(mapId), `Signature ${sig.id} supports unknown map id ${mapId}`);
      const pool = serverSignatures.SIGNATURE_POOLS_BY_MAP_ID[mapId] || [];
      assert(pool.includes(sig.id), `Signature ${sig.id} supports ${mapId} but is missing from that pool`);
    }
  }
});

runner.run('Playable signature config overrides match CONFIG shape', () => {
  for (const sig of Object.values(serverSignatures.SIGNATURE_DEFINITIONS)) {
    assert(typeof sig.name === 'string' && sig.name.length > 0, `${sig.id}: missing name`);
    assert(typeof sig.flavor === 'string' && sig.flavor.length > 0, `${sig.id}: missing flavor`);
    assert(typeof sig.mechanical === 'string' && sig.mechanical.length > 0, `${sig.id}: missing mechanical text`);
    assert(Array.isArray(sig.mapIds) && sig.mapIds.length > 0, `${sig.id}: missing mapIds`);
    assertObject(sig.config, `${sig.id}.config`);
    for (const [section, overrides] of Object.entries(sig.config)) {
      assertObject(CONFIG[section], `${sig.id}.config.${section} target`);
      assertObject(overrides, `${sig.id}.config.${section}`);
      for (const [key, value] of Object.entries(overrides)) {
        const path = `${section}.${key}`;
        assert(key in CONFIG[section] || DORMANT_SIGNATURE_CONFIG_OVERRIDES.has(path),
          `${sig.id}.config.${path} does not exist in CONFIG`);
        assert(Number.isFinite(value), `${sig.id}.config.${section}.${key} must be a finite number`);
      }
    }
  }
});

runner.run('Playable signature layout hints are known', () => {
  const allowedWellSpread = new Set(['tight', 'normal', 'wide', 'extreme']);
  for (const sig of Object.values(serverSignatures.SIGNATURE_DEFINITIONS)) {
    assertObject(sig.layout, `${sig.id}.layout`);
    assert(allowedWellSpread.has(sig.layout.wellSpread),
      `${sig.id}.layout.wellSpread has unknown value ${sig.layout.wellSpread}`);
    for (const [key, value] of Object.entries(sig.layout)) {
      if (key === 'wellSpread') continue;
      if (key === 'wreckTierBoost') {
        assert(Number.isInteger(value) && value >= 0, `${sig.id}.layout.wreckTierBoost must be a non-negative integer`);
        continue;
      }
      const table = serverSignatures.LAYOUT_MULTIPLIERS[key];
      assert(table, `${sig.id}.layout.${key} has no multiplier table`);
      assert(value in table, `${sig.id}.layout.${key} has unknown value ${value}`);
    }
  }
});

runner.run('Seeded signature manifest preserves seeded-generation contract', () => {
  const ids = new Set();
  const names = new Set();
  assert(Array.isArray(serverSignatures.SEEDED_SIGNATURES) && serverSignatures.SEEDED_SIGNATURES.length > 0,
    'SEEDED_SIGNATURES must be a non-empty array');
  for (const sig of serverSignatures.SEEDED_SIGNATURES) {
    assert(typeof sig.id === 'string' && sig.id.length > 0, 'Seeded signature missing id');
    assert(typeof sig.name === 'string' && sig.name.length > 0, `${sig.id}: missing name`);
    assertObject(sig.mods, `${sig.id}.mods`);
    assert(!ids.has(sig.id), `Duplicate seeded signature id: ${sig.id}`);
    assert(!names.has(sig.name), `Duplicate seeded signature name: ${sig.name}`);
    ids.add(sig.id);
    names.add(sig.name);
    for (const [key, value] of Object.entries(sig.mods)) {
      assert(Number.isFinite(value), `${sig.id}.mods.${key} must be finite`);
    }
  }
});

// ---- 13. Item content manifest validation ----

runner.run('Item server/client manifests stay in sync', () => {
  for (const name of ITEM_CONSTANTS) {
    assert(deepEqual(serverItems[name], clientItems[name]),
      `scripts/content/items.js ${name} does not match src/content/items.js`);
  }
});

runner.run('Item special and consumable effect id registries are valid', () => {
  for (const [name, list] of Object.entries({
    ARTIFACT_SPECIAL_IDS: serverItems.ARTIFACT_SPECIAL_IDS,
    CONSUMABLE_EFFECT_IDS: serverItems.CONSUMABLE_EFFECT_IDS,
  })) {
    assert(Array.isArray(list) && list.length > 0, `${name} must be a non-empty array`);
    const ids = new Set();
    for (const id of list) {
      assert(typeof id === 'string' && /^[a-z][A-Za-z0-9]*$/.test(id), `${name} contains invalid id ${id}`);
      assert(!ids.has(id), `${name} contains duplicate id ${id}`);
      ids.add(id);
    }
  }
});

runner.run('Item catalog tiers and artifact shapes are valid', () => {
  const expectedTiers = [1, 2, 3, 4];
  const tiers = Object.keys(serverItems.ITEM_CATALOG).map(Number).sort((a, b) => a - b);
  assert(deepEqual(tiers, expectedTiers), `Expected item tiers ${expectedTiers.join(',')}, got ${tiers.join(',')}`);

  const ids = new Set();
  const names = new Set();
  const specialIds = new Set(serverItems.ARTIFACT_SPECIAL_IDS);
  for (const tier of expectedTiers) {
    const items = serverItems.ITEM_CATALOG[tier];
    assert(Array.isArray(items) && items.length > 0, `Tier ${tier} must contain at least one item`);
    for (const item of items) {
      assertObject(item, `item ${item && item.id}`);
      assert(typeof item.id === 'string' && item.id.length > 0, `Tier ${tier} item missing id`);
      assert(typeof item.name === 'string' && item.name.length > 0, `${item.id}: missing name`);
      assert(item.tier === tier, `${item.id}: tier ${item.tier} does not match catalog tier ${tier}`);
      assert(item.affinity == null || typeof item.affinity === 'string', `${item.id}: affinity must be string or null`);
      assertObject(item.coefficients, `${item.id}.coefficients`);
      assertValueRange(item.value, `${item.id}.value`);
      assert(!ids.has(item.id), `Duplicate item id: ${item.id}`);
      assert(!names.has(item.name), `Duplicate item name: ${item.name}`);
      ids.add(item.id);
      names.add(item.name);
      for (const [key, value] of Object.entries(item.coefficients)) {
        assert(Number.isFinite(value), `${item.id}.coefficients.${key} must be finite`);
      }
      for (const id of specialAtoms(item.special)) {
        assert(specialIds.has(id), `${item.id}: special references unknown id ${id}`);
      }
    }
  }
});

runner.run('Consumable catalog has stable ids, tiers, effects, and values', () => {
  const ids = new Set();
  const effectIds = new Set(serverItems.CONSUMABLE_EFFECT_IDS);
  assert(Array.isArray(serverItems.CONSUMABLE_CATALOG) && serverItems.CONSUMABLE_CATALOG.length > 0,
    'CONSUMABLE_CATALOG must be a non-empty array');
  for (const item of serverItems.CONSUMABLE_CATALOG) {
    assert(typeof item.id === 'string' && item.id.length > 0, 'Consumable missing id');
    assert(typeof item.name === 'string' && item.name.length > 0, `${item.id}: missing name`);
    assert(Number.isInteger(item.tier) && item.tier >= 1 && item.tier <= 4, `${item.id}: invalid tier ${item.tier}`);
    assert(typeof item.effect === 'string' && item.effect.length > 0, `${item.id}: missing effect`);
    assert(effectIds.has(item.effect), `${item.id}: effect references unknown id ${item.effect}`);
    assertValueRange(item.value, `${item.id}.value`);
    assert(!ids.has(item.id), `Duplicate consumable id: ${item.id}`);
    ids.add(item.id);
  }
});

// ---- 14. Session profile manifest validation ----

runner.run('Session profile server/client manifests stay in sync', () => {
  for (const name of SESSION_PROFILE_CONSTANTS.filter((name) => name !== 'SESSION_PROFILES')) {
    assert(deepEqual(serverSessionProfiles[name], clientSessionProfiles[name]),
      `scripts/content/session-profiles.js ${name} does not match src/content/session-profiles.js`);
  }
  const expectedProfiles = Object.fromEntries(
    Object.entries(clientSessionProfiles.SESSION_PROFILES).map(([id, profile]) => [id, {
      ...profile,
      tickHz: MOVEMENT.authority.integrationHz,
    }]),
  );
  assert(deepEqual(serverSessionProfiles.SESSION_PROFILES, expectedProfiles),
    'Session adapters must derive tickHz from MOVEMENT.authority.integrationHz');
});

runner.run('Session profiles expose complete server/client scale truth', () => {
  const fields = serverSessionProfiles.SESSION_PROFILE_FIELDS;
  assert(Array.isArray(fields) && fields.length > 0, 'SESSION_PROFILE_FIELDS must be non-empty');
  for (const [id, profile] of Object.entries(serverSessionProfiles.SESSION_PROFILES)) {
    assert(profile.profileId === id, `Session profile ${id}: profileId must match object key`);
    for (const field of fields) {
      assert(field in profile, `Session profile ${id}: missing ${field}`);
    }
    assert(profile.tickHz === MOVEMENT.authority.integrationHz,
      `${id}: tickHz must use the canonical authority movement rate`);
    assert(profile.snapshotHz <= profile.tickHz, `${id}: snapshotHz should be <= movement tickHz`);
    assert(profile.flowFieldCellSize > 0, `${id}: flowFieldCellSize must be positive`);
    assert(profile.maxScavengers >= 1, `${id}: maxScavengers must be positive`);
    assert(serverSessionProfiles.CLIENT_PERF_PROFILES[profile.clientPerfProfile],
      `${id}: unknown clientPerfProfile ${profile.clientPerfProfile}`);
  }
});

runner.run('Playable maps bind to known session profiles', () => {
  for (const map of playableMaps) {
    const mapId = map.data.id;
    const definition = MAP_SCALE_REGISTRY[mapId];
    assert(definition, `${map.name}: missing canonical registry binding`);
    const profileId = definition.profileId;
    assert(serverSessionProfiles.SESSION_PROFILES[profileId],
      `${map.name}: unknown session profile ${profileId}`);
    const resolved = serverSessionProfiles.getSessionProfile(mapId, map.data.worldScale);
    assert(resolved.profileId === profileId,
      `${map.name}: resolver returned ${resolved.profileId}, expected ${profileId}`);
  }
});

runner.run('Session profiles retain map budgets without lowering authority fidelity', () => {
  const small = serverSessionProfiles.SESSION_PROFILES.small;
  const medium = serverSessionProfiles.SESSION_PROFILES.medium;
  const large = serverSessionProfiles.SESSION_PROFILES.large;
  assert(small.tickHz === MOVEMENT.authority.integrationHz
    && medium.tickHz === MOVEMENT.authority.integrationHz
    && large.tickHz === MOVEMENT.authority.integrationHz,
  'Expected one authority tickHz across all playable maps');
  assert(small.snapshotHz > large.snapshotHz,
    'Expected large profile to use cheaper snapshots than small');
  assert(small.useCoarseField === false, 'Expected small profile direct-force path');
  assert(medium.useCoarseField === true && large.useCoarseField === true,
    'Expected medium/large profiles to use coarse field');
  assert(medium.flowFieldCellSize < large.flowFieldCellSize,
    'Expected large profile field cells to be coarser than medium');
  assert(small.maxScavengers < large.maxScavengers,
    'Expected larger maps to allow more total scavengers');
});

runner.run('Client perf profiles match shipped fixed-grid contract', () => {
  const fixedGrid = serverSessionProfiles.CLIENT_PERF_PROFILES.fixedGrid;
  assertObject(fixedGrid, 'CLIENT_PERF_PROFILES.fixedGrid');
  assert(fixedGrid.fluidResolution === CONFIG.fluid.resolution,
    `fixedGrid.fluidResolution ${fixedGrid.fluidResolution} must match CONFIG.fluid.resolution ${CONFIG.fluid.resolution}`);
  assert(fixedGrid.remotePresentationExtrapolateLimit === 0.75,
    'fixedGrid remotePresentationExtrapolateLimit must preserve current client presentation behavior');
  assert(fixedGrid.perfSmoothing === 0.12,
    'fixedGrid perfSmoothing must preserve current perf HUD smoothing');
});

// ---- 15. Hull content manifest validation ----

runner.run('Hull server/client manifests stay in sync', () => {
  for (const name of HULL_CONSTANTS) {
    assert(deepEqual(serverHulls[name], clientHulls[name]),
      `scripts/content/hulls.cjs ${name} does not match src/content/hulls.data.json`);
  }
});

runner.run('Hull definitions expose movement and delta-v truth', () => {
  const requiredNumeric = [
    'thrustScale', 'dragScale', 'currentCoupling',
    'noiseRadiusMultiplier', 'noiseDecayMultiplier',
    'pulseRadiusScale', 'pulseCooldownScale', 'pulseNoiseRadiusScale',
    'cargoSlots', 'pickupRadius', 'sensorRange',
    'wellResistScale', 'controlDebuffResist',
    'deltaVMax', 'deltaVBurnEff', 'deltaVRegen', 'deltaVRegenBoost',
  ];
  const hullIds = new Set(Object.keys(serverHulls.HULL_DEFINITIONS));
  assert(hullIds.size >= 5, `Expected at least 5 hulls, got ${hullIds.size}`);
  for (const [id, hull] of Object.entries(serverHulls.HULL_DEFINITIONS)) {
    assert(typeof hull.name === 'string' && hull.name.length > 0, `${id}: missing name`);
    for (const key of requiredNumeric) {
      assert(Number.isFinite(hull[key]), `${id}.${key} must be finite`);
    }
    assert(Number.isInteger(hull.cargoSlots) && hull.cargoSlots > 0, `${id}.cargoSlots must be positive integer`);
    assertObject(hull.abilities, `${id}.abilities`);
  }
  for (const [shipType, hullId] of Object.entries(serverHulls.PROFILE_SHIP_TO_HULL)) {
    assert(hullIds.has(hullId), `PROFILE_SHIP_TO_HULL.${shipType} references unknown hull ${hullId}`);
  }
  for (const [personality, choices] of Object.entries(serverHulls.PERSONALITY_HULL_MAP)) {
    assert(Array.isArray(choices) && choices.length > 0, `${personality}: personality hull list must be non-empty`);
    for (const hullId of choices) {
      assert(hullIds.has(hullId), `${personality}: unknown hull ${hullId}`);
    }
  }
});

// ---- 16. Directional + Inhibitor ASCII shader validation ----

runner.run('ASCII shader keeps base and Inhibitor-specific 16-cell ramps', () => {
  const ramps = parseAsciiRamps();
  assert(ramps.length === 6, `Expected 6 ASCII ramps, got ${ramps.length}`);
  for (let i = 0; i < ramps.length; i++) {
    assert(ramps[i].length === 16, `ASCII ramp ${i} has ${ramps[i].length} chars; expected 16`);
  }
  assert(ramps[4].includes('Ψ') && ramps[4].includes('∫'), 'Inhibitor math ramp must contain wrong-symbol glyphs');
  assert(ramps[5].includes('╬') && ramps[5].includes('█'), 'Inhibitor vessel ramp must contain box-drawing glyphs');
  assert(asciiShaderSrc.includes('export const CHARS_PER_RAMP = 16'), 'CHARS_PER_RAMP must remain 16');
});

runner.run('ASCII directional shader samples velocity with tunable blend', () => {
  assert(asciiShaderSrc.includes('uniform sampler2D u_velocity'), 'ASCII shader must sample the velocity texture');
  assert(asciiShaderSrc.includes('uniform float u_dirThreshold'), 'ASCII shader must expose u_dirThreshold');
  assert(asciiShaderSrc.includes('uniform float u_dirBlendRange'), 'ASCII shader must expose u_dirBlendRange');
  assert(asciiShaderSrc.includes('smoothstep(u_dirThreshold, u_dirThreshold + u_dirBlendRange, speed)'),
    'Directional blend must use the tunable blend range');
  assert(configSrc.includes('dirThreshold') && configSrc.includes('dirBlendRange'),
    'CONFIG.ascii must expose directional threshold and blend controls');
});

runner.run('ASCII shader consumes authoritative Inhibitor data', () => {
  assert(!asciiShaderSrc.includes('u_inhibitorForm')
    && mainSrc.includes('(inhibitorState.entities || [])'),
  'Renderer must consume collection-shaped authoritative Inhibitor entities');
  assert(asciiPassSrc.includes('ctx.inhibitorData?.entities || []')
    && asciiPassSrc.includes('u_ecologyKind')
    && asciiPassSrc.includes("entity?.kind === 'vessel'"),
  'ASCII pass must consume collection-shaped Inhibitor presentation data');
  assert(asciiShaderSrc.includes('INHIBITOR_MATH_ROW'), 'ASCII shader must keep the math corruption ramp');
  assert(asciiShaderSrc.includes('INHIBITOR_VESSEL_ROW'), 'ASCII shader must keep the vessel ramp');
  assert(mainSrc.includes('inhibitorData: inhData'), 'Main render path must pass Inhibitor data into the ASCII pass');
  assert(testApiSrc.includes('setInhibitorVisualStateForTest'), 'Test API must expose a render-only Inhibitor fixture hook');
});

// ---- 17. Renderer fixture source-of-truth validation ----

runner.run('Renderer title fixture reuses the playable title scene map', () => {
  assert(rendererFixturesSrc.includes("import { MAP as TITLE_SCREEN_MAP } from './title-screen.js'"),
    'Renderer title fixture must import the title scene map');
  assert(rendererFixturesSrc.includes('...TITLE_SCREEN_MAP'),
    'Renderer title fixture must spread the title scene map instead of duplicating title composition data');
});

// ---- Done ----

const allPassed = runner.summary();
process.exit(allPassed ? 0 : 1);
