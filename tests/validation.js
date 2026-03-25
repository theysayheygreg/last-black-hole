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
const fluidSrc = fs.readFileSync(path.join(SRC, 'fluid.js'), 'utf8');
const configSrc = fs.readFileSync(path.join(SRC, 'config.js'), 'utf8');

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
  return src.includes('export const MAP =');
});
const maps = mapFiles.map(f => ({
  name: f,
  data: parseMapFile(path.join(MAPS_DIR, f)),
}));

// ---- Extract config values ----
// CONFIG is a plain object literal, extract via eval

function parseConfig() {
  const src = fs.readFileSync(path.join(SRC, 'config.js'), 'utf8');
  const fn = new Function(src.replace('export const CONFIG =', 'return'));
  return fn();
}

const CONFIG = parseConfig();

// ---- GLSL limits ----

const DISPLAY_WELL_LIMIT = findGLSLArraySize(fluidSrc, 'u_wellPositions');
// There are two u_wellPositions declarations (display + dissipation) — find both
const allLimits = [];
const re = /uniform\s+vec2\s+u_wellPositions\[(\d+)\]/g;
let m;
while ((m = re.exec(fluidSrc)) !== null) {
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
    // Count all density sources: wells + stars + loot + wrecks + portals (wave-spawned, estimate max) + planetoids + ship
    // Debris wrecks spawn 2-5 extra pieces each
    const debrisCount = (map.data.wrecks || []).filter(w => w.type === 'debris').length;
    const maxDebrisPieces = debrisCount * 5;
    const totalSources = map.data.wells.length
      + map.data.stars.length
      + map.data.loot.length
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

runner.run('All loot positions within world bounds', () => {
  for (const map of maps) {
    const ws = map.data.worldScale;
    for (let i = 0; i < map.data.loot.length; i++) {
      const l = map.data.loot[i];
      assert(l.x >= 0 && l.x < ws, `${map.name} loot[${i}]: x=${l.x} outside [0, ${ws})`);
      assert(l.y >= 0 && l.y < ws, `${map.name} loot[${i}]: y=${l.y} outside [0, ${ws})`);
    }
  }
});

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

// ---- 8. Negative mass guard: growthVariance cannot exceed growthAmount ----

runner.run('Well growth variance cannot produce negative growth rate', () => {
  const minRate = CONFIG.events.growthAmount - CONFIG.universe.wellGrowthVariance;
  assert(minRate >= 0,
    `Min growth rate = ${CONFIG.events.growthAmount} - ${CONFIG.universe.wellGrowthVariance} = ${minRate}. ` +
    `Must be >= 0 or wells can shrink to negative mass`);
});

// ---- 9. Dead map data: portals field should not exist (wave system replaced it) ----

runner.run('Map files do not define unused portals field', () => {
  const warnings = [];
  for (const map of maps) {
    if (map.data.portals && map.data.portals.length > 0) {
      warnings.push(`${map.name} defines ${map.data.portals.length} portals (ignored — wave system spawns portals)`);
    }
  }
  // This is a warning, not a failure — but flag it
  if (warnings.length > 0) {
    console.log(`        NOTE: ${warnings.join('; ')}`);
  }
  // Don't fail — just inform
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
    ['loot.glowRadius', CONFIG.loot.glowRadius],
    ['loot.shimmerRadius', CONFIG.loot.shimmerRadius],
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

// ---- Done ----

const screenshotPath = null; // no browser needed for this suite
const allPassed = runner.summary();
process.exit(allPassed ? 0 : 1);
