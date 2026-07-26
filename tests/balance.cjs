const fs = require("fs");
const os = require("os");
const path = require("path");
const { pathToFileURL } = require("url");
const { TestRunner, assert } = require("./helpers.cjs");
const serverBalance = require("../scripts/content/balance.cjs");
const {
  BALANCE,
  wreckAgeValueMultiplier,
  survivalBonusEm,
  runEmEarned,
} = serverBalance;
const { HULL_DEFINITIONS } = require("../scripts/content/hulls.cjs");

const ROOT = path.join(__dirname, "..");

async function run() {
  const runner = new TestRunner("Balance");

  await runner.run("CJS adapter exposes the canonical balance module", async () => {
    const clientBalance = await import(pathToFileURL(path.join(ROOT, "src", "content", "balance.js")).href);
    for (const name of Object.keys(serverBalance)) {
      assert(serverBalance[name] === clientBalance[name], `${name} is not the canonical ESM export`);
    }
  });

  await runner.run("Client and server BALANCE pull from the same JSON source", async () => {
    // Both src/content/balance.js (ESM) and scripts/content/balance.cjs (CJS)
    // import the same balance.data.json — drift is impossible at the data
    // layer. Sanity-check that BALANCE matches the JSON file we expect.
    const jsonPath = path.join(ROOT, "src", "content", "balance.data.json");
    const fromJson = JSON.parse(fs.readFileSync(jsonPath, "utf8"));
    assert(
      JSON.stringify(fromJson) === JSON.stringify(BALANCE),
      "BALANCE drifted from balance.data.json — wrapper changed shape"
    );
  });

  await runner.run("Loot gates and weights keep T4 late and rare", async () => {
    const { tierGates, tierWeights } = BALANCE.loot;
    assert(tierGates[1] === 0, "T1 must be available at run start");
    assert(tierGates[2] > tierGates[1], "T2 should unlock after T1");
    assert(tierGates[3] > tierGates[2], "T3 should unlock after T2");
    assert(tierGates[4] >= 240, "T4 should not enter before the 4-minute deep-run gate");

    const totalLateWeight = Object.values(tierWeights).reduce((sum, value) => sum + value, 0);
    const t4Share = tierWeights[4] / totalLateWeight;
    assert(t4Share > 0 && t4Share <= 0.03, `T4 share should stay rare, got ${t4Share}`);
    assert(tierWeights[1] > tierWeights[2] && tierWeights[2] > tierWeights[3] && tierWeights[3] > tierWeights[4],
      "Tier weights should descend from common to exotic");
  });

  await runner.run("Wreck age multiplier rewards waiting but stays bounded", async () => {
    assert(wreckAgeValueMultiplier(10, 10) === 1, "Fresh wreck should be 1x");
    assert(Math.abs(wreckAgeValueMultiplier(0, 60) - 1.25) < 1e-9, "60s wreck should be 1.25x");
    assert(wreckAgeValueMultiplier(0, 120) === BALANCE.loot.wreckAgeValueCap, "120s wreck should hit cap");
    assert(wreckAgeValueMultiplier(0, 999) === BALANCE.loot.wreckAgeValueCap, "Old wreck should stay capped");
  });

  await runner.run("EM earnings track profile credit, not vaulted cargo value", async () => {
    const cargoValue = 200;
    const survivalTime = 180;
    const survivalBonus = survivalBonusEm(survivalTime);
    const extracted = runEmEarned({ outcome: "escaped", cargoValue, survivalTime });
    const dead = runEmEarned({ outcome: "dead", cargoValue, survivalTime });

    assert(survivalBonus === 90, `Expected 90 EM survival bonus, got ${survivalBonus}`);
    assert(extracted === survivalBonus, "Extraction should credit survival EM while cargo goes to vault");
    assert(dead < survivalBonus && dead < extracted, "Death should earn less than extraction");
    assert(BALANCE.economy.deathTaxRate === undefined, "Death tax should stay removed from current ledger balance");
  });

  await runner.run("Rig and upgrade costs rise monotonically", async () => {
    const rig = BALANCE.progression.rigLevelCosts;
    for (let i = 1; i < rig.length; i++) {
      assert(rig[i] > rig[i - 1], `Rig level ${i + 1} cost should rise`);
    }

    const profile = BALANCE.progression.profileUpgradeCosts.map(cost => cost.em);
    const vault = BALANCE.progression.vaultUpgradeCosts.map(cost => cost.em);
    for (let i = 1; i < profile.length; i++) {
      assert(profile[i] > profile[i - 1], `Profile rank ${i + 1} cost should rise`);
    }
    for (let i = 1; i < vault.length; i++) {
      assert(vault[i] > vault[i - 1], `Vault rank ${i + 1} cost should rise`);
    }
  });

  await runner.run("Hull identities remain mechanically distinct", async () => {
    const hulls = HULL_DEFINITIONS;
    assert(hulls.breacher.thrustScale > hulls.drifter.thrustScale, "Breacher should out-thrust Drifter");
    assert(hulls.drifter.currentCoupling > hulls.breacher.currentCoupling, "Drifter should read current better than Breacher");
    assert(hulls.shroud.signalGenMult < hulls.hauler.signalGenMult, "Shroud should be quieter than Hauler");
    assert(hulls.hauler.cargoSlots > hulls.shroud.cargoSlots, "Hauler should carry more than Shroud");
    assert(hulls.resonant.pulseRadiusScale > hulls.shroud.pulseRadiusScale, "Resonant should own pulse space");
  });

  const allPassed = runner.summary();
  process.exit(allPassed ? 0 : 1);
}

run().catch((err) => {
  console.error("Balance test fatal error:", err.stack || err.message);
  process.exit(1);
});
