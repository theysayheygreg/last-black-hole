// Single canonical economy/progression data lives in balance.data.json.
// This module wraps the JSON with helper functions for the ESM (browser)
// side; scripts/content/balance.cjs is the matching CJS wrapper for the
// Node sim. Both files load the same JSON so data cannot drift.
import balanceData from './balance.data.json' with { type: 'json' };

export const BALANCE = balanceData;

export function wreckAgeValueMultiplier(spawnTime = 0, currentTime = spawnTime) {
  const age = Math.max(0, (Number(currentTime) || 0) - (Number(spawnTime) || 0));
  const { wreckAgeCapSeconds, wreckAgeValueCap } = BALANCE.loot;
  return Math.min(
    wreckAgeValueCap,
    1 + (age / wreckAgeCapSeconds) * (wreckAgeValueCap - 1)
  );
}

export function survivalBonusEm(survivalTime = 0) {
  return Math.floor(Math.max(0, Number(survivalTime) || 0) * BALANCE.economy.survivalEmPerSecond);
}

export function runEmEarned({ outcome = "dead", survivalTime = 0 } = {}) {
  const bonus = survivalBonusEm(survivalTime);
  if (outcome === "escaped" || outcome === "extracted") {
    return bonus;
  }
  return Math.floor(bonus * BALANCE.economy.deathSurvivalPayoutMult);
}
