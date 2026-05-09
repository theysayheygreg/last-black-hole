// Canonical first-pass economy and progression tuning.
// These are representative launch values, not final feel locks.

const BALANCE = {
  loot: {
    tierGates: { 1: 0, 2: 30, 3: 120, 4: 240 },
    tierWeights: { 1: 60, 2: 30, 3: 8, 4: 2 },
    wreckAgeCapSeconds: 120,
    wreckAgeValueCap: 1.5,
  },
  economy: {
    survivalEmPerSecond: 0.5,
    deathSurvivalPayoutMult: 0.5,
    deathTaxRate: 0.1,
  },
  progression: {
    profileUpgradeCosts: [
      { em: 250, component: null },
      { em: 800, component: "uncommon" },
      { em: 2000, component: "rare" },
    ],
    vaultUpgradeCosts: [
      { em: 800 },
      { em: 2500 },
      { em: 6000 },
    ],
    rigLevelCosts: [300, 750, 1500, 3000, 5000],
    maxProfileRank: 3,
    maxRigLevel: 5,
  },
};

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
