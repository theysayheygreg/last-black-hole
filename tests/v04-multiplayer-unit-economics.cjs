#!/usr/bin/env node
"use strict";

const assert = require("assert");
const { SCHEMA, sha256, validateConfig, receiptLedger, evaluate, model, money } = require("../scripts/v04-multiplayer-unit-economics.cjs");

function price(value) { return { value, status: "planningAssumption", source: "test" }; }
function fixture() {
  const cases = {};
  for (const [name, fee] of [["best", 0.15], ["base", 0.20], ["worst", 0.30]]) {
    cases[name] = { storefrontFeeRate: fee, refundRate: 0.05, chargebackRate: 0.01,
      taxVatFxRate: 0.02, activePlayerConversion: 0.5, multiplayerShare: 0.5,
      monthlyPlayHoursPerActive: 4, activeLifetimeMonths: 3, serviceMonths: 12,
      peakToMean: 4, supportCostPerActivePlayerUsd: 0.1 };
  }
  const infrastructure = () => ({ safeAuthoritiesPerHost: 2, warmCapacityFactor: 1.25,
    egressKiBPerSecondPerClient: 32, variableControlCostPerMultiplayerPlayerHourUsd: 0.001,
    storageGbPerActivePlayer: 0.01, storageRetentionMonths: 3,
    fixedMonthlyUsd: { control: 10 }, oneTimeUsd: { setup: 100 }, hostHourUsd: price(0.01),
    egressUsdPerGb: price(0.02), storageUsdPerGbMonth: price(0.015),
    densityEvidence: { status: "planningAssumptionPendingMeasurement", source: "test" } });
  return { schema: SCHEMA, commercial: { listPriceUsd: 4.99 }, capacity: { hoursPerMonth: 730 },
    salesScales: [1000, 10000], cases, exclusions: ["income tax"], topologies: {
      central: { hostedGameplayShare: 1, averagePlayersPerMatch: 4, matchDurationHours: 0.5,
        caseInfrastructure: { best: infrastructure(), base: infrastructure(), worst: infrastructure() } },
      local: { hostedGameplayShare: 0, averagePlayersPerMatch: 4, matchDurationHours: 0.5,
        caseInfrastructure: { best: infrastructure(), base: infrastructure(), worst: infrastructure() } },
    } };
}

const config = fixture();
assert.strictEqual(validateConfig(config), config);

const ledger15 = receiptLedger(1000, config.commercial, config.cases.best);
const ledger20 = receiptLedger(1000, config.commercial, config.cases.base);
const ledger30 = receiptLedger(1000, config.commercial, config.cases.worst);
assert(ledger15.netReceiptsBeforeOperations > ledger20.netReceiptsBeforeOperations);
assert(ledger20.netReceiptsBeforeOperations > ledger30.netReceiptsBeforeOperations);
assert.strictEqual(money(ledger20.grossReceipts), 4990);
assert(Math.abs(ledger20.netReceiptsBeforeOperations - 4990 * 0.95 * 0.8 * 0.99 * 0.98) < 1e-9,
  "scenario receipt arithmetic must preserve the explicit deduction order");

const row1k = evaluate(config, 1000, "base", "central");
const row10k = evaluate(config, 10000, "base", "central");
assert.strictEqual(row1k.demand.authorityHours,
  row1k.demand.hostedMultiplayerPlayerHours / row1k.capacityInputs.averagePlayersPerMatch);
assert.strictEqual(row1k.capacityInputs.safeAuthoritiesPerHost, 2);
assert(row10k.demand.lifetimePlayerHours > row1k.demand.lifetimePlayerHours);
assert(row10k.operations.totalOperationsCost > row1k.operations.totalOperationsCost);
assert(row10k.commercial.netReceiptsBeforeOperations > row1k.commercial.netReceiptsBeforeOperations);
assert.strictEqual(row10k.unitCosts.costPerAuthorityHour, row1k.unitCosts.costPerAuthorityHour,
  "host density and authority-hour cost must not change with copies");
assert.strictEqual(row10k.capacityInputs.safeAuthoritiesPerHost, row1k.capacityInputs.safeAuthoritiesPerHost,
  "safe authority density is a measured/configured input, never copies-derived");

const local = evaluate(config, 1000, "base", "local");
assert.strictEqual(local.demand.hostedMultiplayerPlayerHours, 0);
assert.strictEqual(local.demand.authorityHours, 0);
assert.strictEqual(local.operations.computeCost, 0);
assert.strictEqual(local.operations.egressCost, 0);
assert.strictEqual(local.demand.peakHosts, 0);

const resultA = model(config, { sourceCommit: "abc" });
const resultB = model(JSON.parse(JSON.stringify(config)), { sourceCommit: "abc" });
assert.deepStrictEqual(resultA, resultB, "same source/config must regenerate exactly");
assert.strictEqual(resultA.rows.length, 12);
assert(resultA.rows.every((row) => row.audit.authorityHours.includes("averagePlayersPerMatch")));
for (const topology of Object.keys(config.topologies)) {
  for (const caseName of Object.keys(config.cases)) {
    const rows = resultA.rows.filter((row) => row.topology === topology && row.case === caseName)
      .sort((a, b) => a.copies - b.copies);
    for (let index = 1; index < rows.length; index += 1) {
      assert(rows[index].demand.lifetimePlayerHours >= rows[index - 1].demand.lifetimePlayerHours,
        `${topology}/${caseName} player-hours must be monotonic with copies`);
      assert(rows[index].operations.totalOperationsCost >= rows[index - 1].operations.totalOperationsCost,
        `${topology}/${caseName} operations cost must be monotonic with copies`);
      assert(rows[index].commercial.netReceiptsBeforeOperations >= rows[index - 1].commercial.netReceiptsBeforeOperations,
        `${topology}/${caseName} receipts must be monotonic with copies`);
    }
  }
}
assert.deepStrictEqual(resultA.commercialFeeScenarios,
  { best: { storefrontFeeRate: 0.15, status: "scenario assumption; not claimed as a current universal storefront default" },
    base: { storefrontFeeRate: 0.2, status: "scenario assumption; not claimed as a current universal storefront default" },
    worst: { storefrontFeeRate: 0.3, status: "scenario assumption; not claimed as a current universal storefront default" } });

for (const mutation of [
  (c) => { c.commercial.listPriceUsd = -1; },
  (c) => { c.cases.base.refundRate = 1.1; },
  (c) => { c.topologies.central.averagePlayersPerMatch = 8; },
  (c) => { c.topologies.central.caseInfrastructure.base.safeAuthoritiesPerHost = 0; },
  (c) => { c.topologies.central.caseInfrastructure.base.hostHourUsd.value = -0.01; },
]) {
  const invalid = fixture(); mutation(invalid); assert.throws(() => validateConfig(invalid));
}

assert.strictEqual(money(1.005), 1.01, "money rounding must be half-up at cent precision");
assert.strictEqual(sha256(Buffer.from("abc")), sha256("abc"), "artifact SHA must hash raw file bytes");
console.log("v0.4 multiplayer unit-economics tests passed");
