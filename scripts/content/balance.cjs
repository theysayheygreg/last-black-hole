// CJS wrapper around the canonical JSON balance manifest. The matching
// ESM consumer is src/content/balance.js. Both load the same JSON file
// so data cannot drift — only the helper functions below are duplicated,
// and validation tests catch any drift between them.
const BALANCE = require("../../src/content/balance.data.json");

function wreckAgeValueMultiplier(spawnTime = 0, currentTime = spawnTime) {
  const age = Math.max(0, (Number(currentTime) || 0) - (Number(spawnTime) || 0));
  const { wreckAgeCapSeconds, wreckAgeValueCap } = BALANCE.loot;
  return Math.min(
    wreckAgeValueCap,
    1 + (age / wreckAgeCapSeconds) * (wreckAgeValueCap - 1)
  );
}

function survivalBonusEm(survivalTime = 0) {
  return Math.floor(Math.max(0, Number(survivalTime) || 0) * BALANCE.economy.survivalEmPerSecond);
}

function runEmEarned({ outcome = "dead", cargoValue = 0, survivalTime = 0 } = {}) {
  const bonus = survivalBonusEm(survivalTime);
  if (outcome === "escaped" || outcome === "extracted") {
    return Math.max(0, Math.floor(Number(cargoValue) || 0)) + bonus;
  }
  return Math.floor(bonus * BALANCE.economy.deathSurvivalPayoutMult);
}

function deathTaxEm(exoticMatter = 0) {
  return Math.floor(Math.max(0, Number(exoticMatter) || 0) * BALANCE.economy.deathTaxRate);
}

module.exports = {
  BALANCE,
  wreckAgeValueMultiplier,
  survivalBonusEm,
  runEmEarned,
  deathTaxEm,
};
