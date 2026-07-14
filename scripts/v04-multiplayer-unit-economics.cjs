#!/usr/bin/env node
"use strict";

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { execFileSync } = require("child_process");

const SCHEMA = "lbh-v04-multiplayer-unit-economics-v1";
const DECIMAL_GB = 1_000_000_000;

function stable(value) {
  if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stable(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

function sha256(value) {
  return crypto.createHash("sha256").update(typeof value === "string" ? value : stable(value)).digest("hex");
}

function finite(name, value, { min = 0, max = Infinity, integer = false } = {}) {
  if (!Number.isFinite(value) || value < min || value > max || (integer && !Number.isInteger(value))) {
    throw new Error(`${name} must be ${integer ? "an integer " : ""}between ${min} and ${max}; got ${value}`);
  }
  return value;
}

function rate(name, value) { return finite(name, value, { min: 0, max: 1 }); }
function sumValues(object) { return Object.values(object || {}).reduce((sum, value) => sum + value, 0); }
function round(value, digits = 8) {
  if (!Number.isFinite(value)) return null;
  const factor = 10 ** digits;
  return Math.round((value + Number.EPSILON) * factor) / factor;
}
function money(value) { return Math.round((value + Number.EPSILON) * 100) / 100; }

function validatePrice(name, price) {
  if (!price || typeof price !== "object") throw new Error(`${name} must be a price object`);
  finite(`${name}.value`, price.value);
  if (!['verifiedOfficial', 'pendingRefresh', 'planningAssumption'].includes(price.status)) {
    throw new Error(`${name}.status must declare verifiedOfficial, pendingRefresh, or planningAssumption`);
  }
  if (!price.source || typeof price.source !== "string") throw new Error(`${name}.source is required`);
}

function validateConfig(config) {
  if (!config || config.schema !== SCHEMA) throw new Error(`config.schema must equal ${SCHEMA}`);
  finite("listPriceUsd", config.commercial.listPriceUsd);
  finite("hoursPerMonth", config.capacity.hoursPerMonth, { min: 1 });
  const scales = config.salesScales;
  if (!Array.isArray(scales) || scales.length === 0) throw new Error("salesScales must be non-empty");
  scales.forEach((copies, index) => finite(`salesScales[${index}]`, copies, { min: 1, integer: true }));
  for (const [caseName, item] of Object.entries(config.cases || {})) {
    rate(`${caseName}.storefrontFeeRate`, item.storefrontFeeRate);
    rate(`${caseName}.refundRate`, item.refundRate);
    rate(`${caseName}.chargebackRate`, item.chargebackRate);
    rate(`${caseName}.taxVatFxRate`, item.taxVatFxRate);
    rate(`${caseName}.activePlayerConversion`, item.activePlayerConversion);
    rate(`${caseName}.multiplayerShare`, item.multiplayerShare);
    finite(`${caseName}.monthlyPlayHoursPerActive`, item.monthlyPlayHoursPerActive);
    finite(`${caseName}.activeLifetimeMonths`, item.activeLifetimeMonths);
    finite(`${caseName}.serviceMonths`, item.serviceMonths, { min: 1 });
    finite(`${caseName}.peakToMean`, item.peakToMean, { min: 1 });
    finite(`${caseName}.supportCostPerActivePlayerUsd`, item.supportCostPerActivePlayerUsd);
  }
  for (const [topologyName, topology] of Object.entries(config.topologies || {})) {
    rate(`${topologyName}.hostedGameplayShare`, topology.hostedGameplayShare);
    finite(`${topologyName}.averagePlayersPerMatch`, topology.averagePlayersPerMatch, { min: 1, max: 4 });
    finite(`${topologyName}.matchDurationHours`, topology.matchDurationHours, { min: 0.01 });
    for (const [caseName, infrastructure] of Object.entries(topology.caseInfrastructure || {})) {
      finite(`${topologyName}.${caseName}.safeAuthoritiesPerHost`, infrastructure.safeAuthoritiesPerHost, { min: 1 });
      finite(`${topologyName}.${caseName}.warmCapacityFactor`, infrastructure.warmCapacityFactor, { min: 1 });
      finite(`${topologyName}.${caseName}.egressKiBPerSecondPerClient`, infrastructure.egressKiBPerSecondPerClient);
      finite(`${topologyName}.${caseName}.variableControlCostPerMultiplayerPlayerHourUsd`, infrastructure.variableControlCostPerMultiplayerPlayerHourUsd);
      finite(`${topologyName}.${caseName}.storageGbPerActivePlayer`, infrastructure.storageGbPerActivePlayer);
      finite(`${topologyName}.${caseName}.storageRetentionMonths`, infrastructure.storageRetentionMonths);
      for (const [key, value] of Object.entries(infrastructure.fixedMonthlyUsd || {})) finite(`${topologyName}.${caseName}.fixedMonthlyUsd.${key}`, value);
      for (const [key, value] of Object.entries(infrastructure.oneTimeUsd || {})) finite(`${topologyName}.${caseName}.oneTimeUsd.${key}`, value);
      validatePrice(`${topologyName}.${caseName}.hostHourUsd`, infrastructure.hostHourUsd);
      validatePrice(`${topologyName}.${caseName}.egressUsdPerGb`, infrastructure.egressUsdPerGb);
      validatePrice(`${topologyName}.${caseName}.storageUsdPerGbMonth`, infrastructure.storageUsdPerGbMonth);
    }
  }
  return config;
}

function receiptLedger(copies, commercial, behavior) {
  const grossReceipts = copies * commercial.listPriceUsd;
  const refunds = grossReceipts * behavior.refundRate;
  const afterRefunds = grossReceipts - refunds;
  const storefrontFees = afterRefunds * behavior.storefrontFeeRate;
  const afterStorefront = afterRefunds - storefrontFees;
  const chargebacks = afterStorefront * behavior.chargebackRate;
  const afterChargebacks = afterStorefront - chargebacks;
  const taxVatFx = afterChargebacks * behavior.taxVatFxRate;
  const netReceiptsBeforeOperations = afterChargebacks - taxVatFx;
  return { grossReceipts, refunds, afterRefunds, storefrontFees, afterStorefront,
    chargebacks, afterChargebacks, taxVatFx, netReceiptsBeforeOperations,
    netReceiptsPerCopy: netReceiptsBeforeOperations / copies };
}

function evaluate(config, copies, caseName, topologyName) {
  const behavior = config.cases[caseName];
  const topology = config.topologies[topologyName];
  const infra = topology.caseInfrastructure[caseName];
  if (!behavior || !topology || !infra) throw new Error(`unknown case/topology ${caseName}/${topologyName}`);
  const receipts = receiptLedger(copies, config.commercial, behavior);
  const activePlayers = copies * behavior.activePlayerConversion;
  const lifetimePlayerHours = activePlayers * behavior.monthlyPlayHoursPerActive * behavior.activeLifetimeMonths;
  const multiplayerPlayerHours = lifetimePlayerHours * behavior.multiplayerShare;
  const hostedMultiplayerPlayerHours = multiplayerPlayerHours * topology.hostedGameplayShare;
  // Authority density is always a workload/config input. Copies never appear in this divisor.
  const authorityHours = hostedMultiplayerPlayerHours / topology.averagePlayersPerMatch;
  const matchStarts = authorityHours / topology.matchDurationHours;
  const averageHostedPlayerCcu = hostedMultiplayerPlayerHours / (behavior.serviceMonths * config.capacity.hoursPerMonth);
  const peakHostedPlayerCcu = averageHostedPlayerCcu * behavior.peakToMean;
  const averageConcurrentMatches = averageHostedPlayerCcu / topology.averagePlayersPerMatch;
  const peakConcurrentMatches = peakHostedPlayerCcu / topology.averagePlayersPerMatch;
  const peakHosts = peakConcurrentMatches === 0 ? 0 : Math.ceil(peakConcurrentMatches / infra.safeAuthoritiesPerHost);

  const costPerAuthorityHour = infra.hostHourUsd.value * infra.warmCapacityFactor / infra.safeAuthoritiesPerHost;
  const transportGbPerPlayerHour = infra.egressKiBPerSecondPerClient * 1024 * 3600 / DECIMAL_GB;
  const egressCostPerHostedPlayerHour = transportGbPerPlayerHour * infra.egressUsdPerGb.value;
  const computeCostPerHostedPlayerHour = costPerAuthorityHour / topology.averagePlayersPerMatch;
  const costPerHostedPlayerHour = computeCostPerHostedPlayerHour + egressCostPerHostedPlayerHour;
  const computeCost = authorityHours * costPerAuthorityHour;
  const egressCost = hostedMultiplayerPlayerHours * egressCostPerHostedPlayerHour;
  const controlPlaneVariableCost = multiplayerPlayerHours * infra.variableControlCostPerMultiplayerPlayerHourUsd;
  const storageCost = activePlayers * infra.storageGbPerActivePlayer * infra.storageRetentionMonths * infra.storageUsdPerGbMonth.value;
  const supportCost = activePlayers * behavior.supportCostPerActivePlayerUsd;
  const fixedMonthlyCost = sumValues(infra.fixedMonthlyUsd);
  const recurringBackendCost = fixedMonthlyCost * behavior.serviceMonths;
  const oneTimeBackendCost = sumValues(infra.oneTimeUsd);
  const variableOperationsCost = computeCost + egressCost + controlPlaneVariableCost + storageCost + supportCost;
  const totalOperationsCost = variableOperationsCost + recurringBackendCost + oneTimeBackendCost;
  const contribution = receipts.netReceiptsBeforeOperations - totalOperationsCost;
  const variableCostPerMultiplayerPlayerHour = multiplayerPlayerHours === 0 ? 0 : variableOperationsCost / multiplayerPlayerHours;
  const availableForVariableHosting = Math.max(0, receipts.netReceiptsBeforeOperations - recurringBackendCost - oneTimeBackendCost - supportCost - storageCost);
  const breakEvenHostedPlayerHours = costPerHostedPlayerHour === 0 ? null : availableForVariableHosting / costPerHostedPlayerHour;
  const variableCostPerCopy = variableOperationsCost / copies;
  const contributionMarginPerCopyBeforeFixed = receipts.netReceiptsPerCopy - variableCostPerCopy;
  const breakEvenCopies = contributionMarginPerCopyBeforeFixed <= 0 ? null
    : Math.ceil((recurringBackendCost + oneTimeBackendCost) / contributionMarginPerCopyBeforeFixed);

  return {
    copies, case: caseName, topology: topologyName,
    commercial: receipts,
    demand: { activePlayers, lifetimePlayerHours, multiplayerPlayerHours,
      hostedMultiplayerPlayerHours, authorityHours, matchStarts, averageHostedPlayerCcu,
      peakHostedPlayerCcu, averageConcurrentMatches, peakConcurrentMatches, peakHosts },
    unitCosts: { costPerAuthorityHour, transportGbPerPlayerHour,
      egressCostPerHostedPlayerHour, computeCostPerHostedPlayerHour, costPerHostedPlayerHour,
      hostedPlayerHoursPerDollar: costPerHostedPlayerHour === 0 ? null : 1 / costPerHostedPlayerHour,
      variableCostPerMultiplayerPlayerHour, variableCostPerCopy },
    operations: { computeCost, egressCost, controlPlaneVariableCost, storageCost, supportCost,
      variableOperationsCost, fixedMonthlyCost, recurringBackendCost, oneTimeBackendCost,
      totalOperationsCost, fixedMonthlyComponents: infra.fixedMonthlyUsd,
      oneTimeComponents: infra.oneTimeUsd },
    capacityInputs: { averagePlayersPerMatch: topology.averagePlayersPerMatch,
      matchDurationHours: topology.matchDurationHours, safeAuthoritiesPerHost: infra.safeAuthoritiesPerHost,
      densityEvidence: infra.densityEvidence, warmCapacityFactor: infra.warmCapacityFactor,
      egressKiBPerSecondPerClient: infra.egressKiBPerSecondPerClient },
    breakEven: { availableForVariableHosting, breakEvenHostedPlayerHours, breakEvenCopies,
      contributionMarginPerCopyBeforeFixed },
    contribution,
    audit: {
      receipts: "gross * (1-refund) * (1-storefront) * (1-chargeback) * (1-taxVatFx)",
      authorityHours: "hostedMultiplayerPlayerHours / averagePlayersPerMatch",
      hostDensity: "costPerAuthorityHour = hostHourUsd * warmCapacityFactor / safeAuthoritiesPerHost",
      egress: "KiB/s/client * 1024 * 3600 / 1e9 * egressUsdPerGb * hostedPlayerHours",
      totalOperations: "compute + egress + variableControl + storage + support + recurringBackend + oneTimeBackend",
      explicitExclusions: config.exclusions,
    },
  };
}

function roundTree(value) {
  if (Array.isArray(value)) return value.map(roundTree);
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, roundTree(item)]));
  return typeof value === "number" ? round(value) : value;
}

function sensitivity(config, row) {
  const probes = [
    ["listPriceUsd +10%", (c) => { c.commercial.listPriceUsd *= 1.1; }],
    ["storefrontFeeRate +10%", (c) => { c.cases[row.case].storefrontFeeRate = Math.min(1, c.cases[row.case].storefrontFeeRate * 1.1); }],
    ["lifetimeMonths +10%", (c) => { c.cases[row.case].activeLifetimeMonths *= 1.1; }],
    ["hostHourUsd +10%", (c) => { c.topologies[row.topology].caseInfrastructure[row.case].hostHourUsd.value *= 1.1; }],
    ["egressUsdPerGb +10%", (c) => { c.topologies[row.topology].caseInfrastructure[row.case].egressUsdPerGb.value *= 1.1; }],
    ["egressKiBPerSecond +10%", (c) => { c.topologies[row.topology].caseInfrastructure[row.case].egressKiBPerSecondPerClient *= 1.1; }],
    ["fixedMonthly +10%", (c) => { const fixed = c.topologies[row.topology].caseInfrastructure[row.case].fixedMonthlyUsd; for (const key of Object.keys(fixed)) fixed[key] *= 1.1; }],
    ["safeAuthoritiesPerHost -10%", (c) => { c.topologies[row.topology].caseInfrastructure[row.case].safeAuthoritiesPerHost *= 0.9; }],
  ];
  return probes.map(([input, mutate]) => {
    const clone = JSON.parse(JSON.stringify(config));
    mutate(clone);
    const changed = evaluate(clone, row.copies, row.case, row.topology);
    return { input, contributionDeltaUsd: round(changed.contribution - row.contribution) };
  }).sort((a, b) => Math.abs(b.contributionDeltaUsd) - Math.abs(a.contributionDeltaUsd));
}

function model(config, source = {}) {
  validateConfig(config);
  const rows = [];
  for (const topologyName of Object.keys(config.topologies)) {
    for (const caseName of Object.keys(config.cases)) {
      for (const copies of config.salesScales) rows.push(evaluate(config, copies, caseName, topologyName));
    }
  }
  const roundedRows = rows.map((row) => {
    const rounded = roundTree(row);
    rounded.display = { grossReceiptsUsd: money(row.commercial.grossReceipts),
      netReceiptsUsd: money(row.commercial.netReceiptsBeforeOperations),
      operationsUsd: money(row.operations.totalOperationsCost), contributionUsd: money(row.contribution) };
    rounded.sensitivity = sensitivity(config, row);
    return rounded;
  });
  return {
    schema: SCHEMA,
    provenance: { sourceCommit: source.sourceCommit || "UNSPECIFIED",
      modelSourceSha256: source.modelSourceSha256 || sha256(fs.readFileSync(__filename)),
      configSha256: sha256(config) },
    classification: "deterministic planning model; provider rates pending refresh are not quotes; host density is not a copies-derived capacity claim",
    commercialFeeScenarios: Object.fromEntries(Object.entries(config.cases).map(([name, item]) => [name, {
      storefrontFeeRate: item.storefrontFeeRate,
      status: "scenario assumption; not claimed as a current universal storefront default",
    }])),
    providerInputs: Object.fromEntries(Object.entries(config.topologies).map(([topologyName, topology]) => [topologyName,
      Object.fromEntries(Object.entries(topology.caseInfrastructure).map(([caseName, item]) => [caseName, {
        hostHourUsd: item.hostHourUsd, egressUsdPerGb: item.egressUsdPerGb,
        storageUsdPerGbMonth: item.storageUsdPerGbMonth, densityEvidence: item.densityEvidence,
      }]))])),
    rows: roundedRows,
  };
}

function parseArgs(argv) {
  const args = {};
  for (let index = 0; index < argv.length; index += 1) {
    const item = argv[index];
    if (!item.startsWith("--")) throw new Error(`unexpected argument ${item}`);
    const [key, inline] = item.slice(2).split("=", 2);
    args[key] = inline === undefined ? argv[++index] : inline;
    if (args[key] === undefined) throw new Error(`missing value for --${key}`);
  }
  return args;
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!args.config || !args.output) throw new Error("usage: node scripts/v04-multiplayer-unit-economics.cjs --config FILE --output FILE [--source-commit SHA]");
  const configPath = path.resolve(args.config);
  const outputPath = path.resolve(args.output);
  const config = JSON.parse(fs.readFileSync(configPath, "utf8"));
  const sourceCommit = args["source-commit"] || execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim();
  const result = model(config, { sourceCommit });
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, `${stable(result)}\n`);
  process.stdout.write(`${outputPath}\nsha256 ${sha256(fs.readFileSync(outputPath))}\n`);
}

module.exports = { SCHEMA, stable, sha256, validateConfig, receiptLedger, evaluate, model, money };
if (require.main === module) {
  try { main(); } catch (error) { console.error(error.stack || error.message); process.exit(1); }
}
