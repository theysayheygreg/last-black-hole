const fs = require("fs");
const path = require("path");
const { TestRunner, assert } = require("./helpers.cjs");
const { MOVEMENT } = require("../scripts/content/movement.cjs");
const {
  CLIENT_TUNABLE_CONTRACTS,
  TUNING_CONTRACTS,
  gravityStrengthFromReferenceDriftSpeed,
  signalFractionPerSecond,
} = require("../src/content/tuning.js");
const { WELL_GRAVITY_PARAMS, wellGravityMagnitude } = require("../scripts/sim/well-gravity.cjs");

const ROOT = path.join(__dirname, "..");
const EPSILON = 1e-12;

function source(file) {
  return fs.readFileSync(path.join(ROOT, file), "utf8");
}

async function run() {
  const runner = new TestRunner("ConfigRedFlags");

  await runner.run("movement half-life preserves the old drag curve", async () => {
    const oldPerFrame = 0.015;
    const halfLife = MOVEMENT.player.coastHalfLifeSeconds;
    const oldFactor = Math.pow(1 - oldPerFrame, (1 / 30) * 60);
    const newFactor = Math.pow(0.5, (1 / 30) / halfLife);
    assert(Math.abs(newFactor - oldFactor) <= EPSILON,
      `coast factor changed: ${newFactor} != ${oldFactor}`);
    assert(!source("src/content/movement.data.json").includes("baseDragPer60HzFrame"),
      "raw per-frame movement drag name must be gone");
  });

  await runner.run("wreck drift re-unitization preserves representative acceleration", async () => {
    const profile = WELL_GRAVITY_PARAMS.wreck;
    const expectedStrength = 0.0045;
    const actualStrength = profile.referenceDriftSpeed * profile.dragRate;
    assert(Math.abs(actualStrength - expectedStrength) <= EPSILON,
      `reference drift speed changed strength: ${actualStrength}`);
    for (const distance of [0.02, 0.1, 0.5, 0.8, 1.0]) {
      const expected = distance > profile.maxRange
        ? 0
        : expectedStrength / Math.pow(Math.max(distance, profile.minimumDistance), profile.falloff);
      assert(Math.abs(wellGravityMagnitude("wreck", distance, 1) - expected) <= EPSILON,
        `wreck gravity changed at ${distance}`);
    }
    assert(gravityStrengthFromReferenceDriftSpeed(0.08 / 1.5, 1.5) === 0.08,
      "local wreck drift conversion must preserve its legacy acceleration");
  });

  await runner.run("signal rates expose percent-of-full-scale units", async () => {
    assert(signalFractionPerSecond(0.5) === 0.005, "0.5%/s must equal the old 0.005 fraction/s");
    assert(signalFractionPerSecond(0.2) === 0.002, "0.2%/s must equal the old 0.002 fraction/s");
    assert(signalFractionPerSecond(0.1) === 0.001, "0.1%/s must equal the old 0.001 fraction/s");
    assert(TUNING_CONTRACTS.signal.thrustBasePercentPerSecond.step === 0.5,
      "signal schema must declare a whole perceptual step");
    assert(TUNING_CONTRACTS.signal.decayBasePercentPerSecond.step === 0.5,
      "signal decay schema must declare a whole perceptual step");
    assert(TUNING_CONTRACTS.wreckDrift.dragRate.step === 0.25,
      "wreck damping schema must declare a meaningful step");
    assert(TUNING_CONTRACTS.wreckDrift.referenceDriftSpeed.step === 0.001,
      "wreck drift schema must declare a meaningful spatial step");
  });

  await runner.run("dev panel snaps the declared movement step", async () => {
    const devPanel = await import("../src/dev-panel.js");
    const metadata = devPanel.controlMetadata("ship.coastHalfLifeSeconds", 0.7643727575403364);
    assert(metadata.step === 0.05, "half-life schema must declare a temporal step");
    assert(devPanel.snapControlValue("ship.coastHalfLifeSeconds", 0.77) === 0.75,
      "dev panel must snap to the declared step");
  });

  await runner.run("ESM CJS and dev panel consume canonical tuning metadata", async () => {
    const esm = await import("../src/content/tuning.js");
    const devPanel = await import("../src/dev-panel.js");
    assert(esm.TUNING_CONTRACTS === TUNING_CONTRACTS, "ESM and CJS loaded different tuning contracts");
    for (const [configPath, contract] of Object.entries(CLIENT_TUNABLE_CONTRACTS)) {
      assert(JSON.stringify(devPanel.controlMetadata(configPath)) === JSON.stringify(contract),
        `${configPath} dev metadata drifted from canonical contract`);
    }
    assert(!fs.existsSync(path.join(ROOT, "scripts/sim/config-contracts.cjs")),
      "duplicated CJS tuning contract must stay deleted");
    assert(source("scripts/sim/well-gravity.cjs").includes('require("../../src/content/tuning.js")'),
      "authority gravity must consume the canonical tuning module");
    const runtimeSource = source("scripts/sim-runtime.cjs");
    assert(runtimeSource.includes('require("./sim/noise-radius.cjs")')
      && runtimeSource.includes("NOISE_CONFIG"),
      "authority Noise must consume the canonical Noise source module");
    assert(source("src/dev-panel.js").includes("CLIENT_TUNABLE_CONTRACTS"),
      "dev panel must consume canonical client metadata");
  });

  await runner.run("unused config names are absent", async () => {
    const configSource = source("src/config.js");
    const panelSource = source("src/dev-panel.js");
    for (const name of [
      "colorTemperature", "gamepadTurnRate", "shipMotion", "portalSparks",
      "pickupGlints", "inhibitorFaults", "nearCameraAtmosphere", "debugBounds",
      "freezeSeed", "ship.drag",
      "driftStrength", "driftDrag",
    ]) {
      assert(!configSource.includes(name), `CONFIG still contains ${name}`);
      assert(!panelSource.includes(name), `dev panel still exposes ${name}`);
    }
  });

  const passed = runner.summary();
  process.exit(passed ? 0 : 1);
}

run().catch((error) => {
  console.error(error.stack || error.message);
  process.exit(1);
});
