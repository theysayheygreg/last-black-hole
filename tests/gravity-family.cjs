/**
 * gravity-family.cjs — pure shared well-gravity contract.
 *
 * The matrix compares the shared body-class helper with the three pre-slice
 * curves, then checks that toroidal edge positions preserve inward direction.
 */
const fs = require("fs");
const path = require("path");
const { TestRunner, assert } = require("./helpers.cjs");

const WELL = { mass: 1.5 };
const LEGACY_PRODUCTION_PARAMS = {
  player: {
    strength: 0.6,
    referenceDistance: 0.25,
    minimumDistance: 0.15,
    falloff: 1.5,
    rangeMode: "linear",
    maxRange: 1.2,
    zeroDistanceThreshold: 0.001,
  },
  scavenger: {
    strength: 0.02,
    referenceDistance: 1,
    minimumDistance: 0.02,
    falloff: 1.8,
    rangeMode: "unbounded",
    maxRange: Infinity,
    zeroDistanceThreshold: 0.0001,
  },
  wreck: {
    strength: 0.0045,
    referenceDistance: 1,
    minimumDistance: 0.02,
    falloff: 1.5,
    rangeMode: "cutoff",
    maxRange: 0.8,
    zeroDistanceThreshold: 0.001,
  },
};

const CURRENT_PRODUCTION_PARAMS = {
  ...LEGACY_PRODUCTION_PARAMS,
  wreck: {
    referenceDriftSpeed: 0.003,
    dragRate: 1.5,
    referenceDistance: 1,
    minimumDistance: 0.02,
    falloff: 1.5,
    rangeMode: "cutoff",
    maxRange: 0.8,
    zeroDistanceThreshold: 0.001,
  },
};

function oldMagnitude(bodyClass, dist) {
  const params = LEGACY_PRODUCTION_PARAMS[bodyClass];
  if (dist < params.zeroDistanceThreshold) return 0;
  if (params.rangeMode !== "unbounded" && dist > params.maxRange) return 0;
  const safeDist = Math.max(dist, params.minimumDistance);
  const base = params.strength * WELL.mass
    / Math.pow(safeDist / params.referenceDistance, params.falloff);
  return params.rangeMode === "linear"
    ? base * (1 - dist / params.maxRange)
    : base;
}

async function run() {
  const runner = new TestRunner("GravityFamily");
  const {
    WELL_GRAVITY_PARAMS,
    wellGravityMagnitude,
    wellGravityVector,
  } = require("../scripts/sim/well-gravity.cjs");
  const { worldDirectionTo } = await import("../src/coords.js");

  await runner.run("Authority profiles expose the named production parameters", async () => {
    for (const [bodyClass, expected] of Object.entries(CURRENT_PRODUCTION_PARAMS)) {
      for (const [name, value] of Object.entries(expected)) {
        assert(WELL_GRAVITY_PARAMS[bodyClass][name] === value,
          `${bodyClass}.${name}: expected ${value}, got ${WELL_GRAVITY_PARAMS[bodyClass][name]}`);
      }
    }
  });

  await runner.run("Shared authority family preserves the representative matrix", async () => {
    const distances = [0.0001, 0.001, 0.1, 0.15, 0.25, 0.5, 0.8, 1.0, 1.2, 4.0];
    let rows = 0;
    for (const bodyClass of Object.keys(LEGACY_PRODUCTION_PARAMS)) {
      for (const distance of distances) {
        const direction = { dist: distance, nx: 1, ny: 0 };
        const gravity = wellGravityVector(
          bodyClass,
          direction,
          WELL.mass
        );
        const magnitude = wellGravityMagnitude(bodyClass, distance, WELL.mass);
        const expected = oldMagnitude(bodyClass, distance);
        assert(Math.abs(gravity.magnitude - expected) < 1e-12,
          `${bodyClass} at ${distance}: ${gravity.magnitude} != ${expected}`);
        assert(Math.abs(magnitude - expected) < 1e-12,
          `${bodyClass} scalar at ${distance}: ${magnitude} != ${expected}`);
        assert(Math.abs(gravity.x - expected) < 1e-12 && gravity.y === 0,
          `${bodyClass} vector mismatch at ${distance}`);
        rows++;
      }
    }
    console.log(`  matrix rows: ${rows}`);
  });

  await runner.run("Wrapped well direction points inward for every body class", async () => {
    let rows = 0;
    for (const bodyClass of Object.keys(LEGACY_PRODUCTION_PARAMS)) {
      const direction = worldDirectionTo(2.99, 1.5, 0.01, 1.5);
      const gravity = wellGravityVector(
        bodyClass,
        direction,
        WELL.mass
      );
      assert(direction.nx > 0 && direction.ny === 0,
        `${bodyClass}: wrapped direction was not inward (+x)`);
      assert(gravity.x > 0 && gravity.y === 0,
        `${bodyClass}: wrapped gravity vector was not inward (+x)`);
      rows++;
    }
    console.log(`  wrap rows: ${rows}`);
  });

  await runner.run("Authority consumers stay on the shared gravity seam", async () => {
    const sharedSource = fs.readFileSync(path.join(__dirname, "..", "src", "content", "well-gravity.js"), "utf8");
    const browserSource = fs.readFileSync(path.join(__dirname, "..", "src", "physics.js"), "utf8");
    const adapterSource = fs.readFileSync(path.join(__dirname, "..", "scripts", "sim", "well-gravity.cjs"), "utf8");
    const runtimeSource = fs.readFileSync(path.join(__dirname, "..", "scripts", "sim-runtime.cjs"), "utf8");
    const coarseSource = fs.readFileSync(path.join(__dirname, "..", "scripts", "coarse-flow-field.cjs"), "utf8");
    assert(browserSource.includes("from './content/well-gravity.js'"),
      "browser physics must import the shared gravity math module");
    assert(adapterSource.includes('require("../../src/content/well-gravity.js")'),
      "authority adapter must require the shared gravity math module");
    assert((sharedSource.match(/Math\.pow/g) || []).length === 1,
      "shared gravity math must contain the single inverse-power calculation");
    assert(!adapterSource.includes("Math.pow"),
      "authority adapter must not duplicate the inverse-power calculation");
    assert(!browserSource.includes("function inversePowerMagnitude"),
      "browser physics must not duplicate the inverse-power calculation");
    assert(runtimeSource.includes('require("./sim/well-gravity.cjs")'),
      "sim-runtime must require the shared authority gravity module");
    for (const bodyClass of ["player", "scavenger", "wreck"]) {
      assert(runtimeSource.includes(`wellGravityVector("${bodyClass}"`),
        `sim-runtime must consume the ${bodyClass} gravity profile`);
    }
    assert(coarseSource.includes('wellGravityMagnitude("player"'),
      "coarse player gravity must consume the shared scalar helper");
    assert(!runtimeSource.includes("0.0045 * well.mass"),
      "wreck gravity must not regress to its inline authority formula");
    assert(!runtimeSource.includes("Math.max(dist, 0.02), 1.8"),
      "scavenger gravity must not regress to its inline authority formula");
  });

  const ok = runner.summary();
  process.exit(ok ? 0 : 1);
}

run().catch((err) => {
  console.error("GravityFamily fatal error:", err.stack || err.message);
  process.exit(1);
});
