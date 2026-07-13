#!/usr/bin/env node
"use strict";

const fs = require("fs");
const path = require("path");
const { validateChecksums } = require("./state-pair-product-metrics.cjs");

function fail(message) { throw new Error(message); }
function read(file) { return JSON.parse(fs.readFileSync(file, "utf8")); }
function mean(values) { return values.reduce((sum, value) => sum + value, 0) / Math.max(1, values.length); }
function pct(before, after) { return before ? (before - after) / before : null; }

const args = process.argv.slice(2);
const pairs = [];
let output = null;
for (let index = 0; index < args.length; index += 1) {
  if (args[index] === "--pair") {
    const [legacy, prepared] = String(args[++index] || "").split("::");
    if (!legacy || !prepared) fail("--pair requires legacy::prepared");
    pairs.push({ legacy: path.resolve(legacy), prepared: path.resolve(prepared) });
  } else if (args[index] === "--output") output = path.resolve(args[++index]);
  else fail(`unknown argument ${args[index]}`);
}
if (!pairs.length || !output) fail("at least one --pair and --output are required");

function loadArtifact(directory, expectedPrepared) {
  const checksum = validateChecksums(directory);
  if (!checksum.passed) fail(`checksum validation failed for ${directory}`);
  const aggregate = read(path.join(directory, "aggregate.json"));
  const run = read(path.join(directory, "run.json"));
  if (aggregate.gate !== "s6" || aggregate.preparedProjectionsEnabled !== expectedPrepared) {
    fail(`unexpected S6 mode for ${directory}`);
  }
  if (aggregate.commit !== run.commit || run.dirty !== false) fail(`artifact is not bound to one clean commit: ${directory}`);
  if (aggregate.instrumentationEnabled !== false || run.config?.env?.LBH_SIM_WS_STAGE_PROFILE !== false) {
    fail(`S5 stage profiler must be disabled: ${directory}`);
  }
  const env = run.config?.env || {};
  if (env.LBH_SIM_WS_PREPARED_PROJECTIONS !== expectedPrepared
      || env.LBH_SIM_WS_BENCH_EVENT_LOOP !== true
      || env.LBH_SIM_WS_STATE_PAIR_MIXED_V1 !== true
      || env.LBH_SIM_WS_REPLICATION_ACCOUNTING !== true
      || env.LBH_REPLICATION_BASELINE_CAPTURE !== true) {
    fail(`benchmark environment mismatch: ${directory}`);
  }
  if (run.seed !== aggregate.seed || run.config.normalWarmupMs !== 5000
      || run.config.normalWindowMs !== 15000 || run.config.inputHz !== 10) {
    fail(`benchmark workload mismatch: ${directory}`);
  }
  const scenarios = Object.fromEntries(aggregate.scenarios.map((row) => [row.population,
    read(path.join(directory, row.file))]));
  const expected = [...aggregate.expectedPopulations].sort((a, b) => a - b);
  const configured = [...run.config.populations].sort((a, b) => a - b);
  const actual = Object.keys(scenarios).map(Number).sort((a, b) => a - b);
  if (JSON.stringify(expected) !== JSON.stringify(configured)
      || JSON.stringify(expected) !== JSON.stringify(actual)) {
    fail(`population inventory mismatch: ${directory}`);
  }
  return { directory, aggregate, run, checksum, scenarios };
}

function metric(scenario) {
  const authority = scenario.performance.authority;
  const runtimeOps = scenario.diagnostics.statePair.preparedProjections;
  const publisherOps = scenario.diagnostics.statePair.publisher.preparedProjections;
  return {
    projectionMeanMs: authority.projectionTotalMs / authority.projectionSamples,
    projectionP95Ms: authority.projectionAndPublishMs.p95,
    projectionP99Ms: authority.projectionAndPublishMs.p99,
    publicationHz: scenario.cadence.observedPairsPerSecond,
    simTickP95Ms: authority.simTickMs.p95,
    eventLoopP95Ms: scenario.performance.eventLoopLag.p95Ms,
    eventLoopP99Ms: scenario.performance.eventLoopLag.p99Ms,
    downlinkMeanBps: scenario.exactTraffic.worstRecipientMeanDownlinkBytesPerSecond,
    downlinkOneSecondP95Bps: scenario.exactTraffic.oneSecondP95DownlinkBytesPerSecond,
    rssP95Bytes: scenario.performance.memory.rssBytes.p95,
    heapP95Bytes: scenario.performance.memory.heapUsedBytes.p95,
    canonicalizations: runtimeOps.canonicalizations + publisherOps.canonicalizations,
    hashes: runtimeOps.hashes + publisherOps.hashes,
    diffs: publisherOps.diffs,
    preparedDiffs: publisherOps.preparedDiffs,
    pendingReferences: publisherOps.pendingReferences,
    ackedReferences: publisherOps.ackedReferences,
    maxPendingReferences: publisherOps.maxPendingReferences,
    maxAckedReferences: publisherOps.maxAckedReferences,
    maxPublisherPendingPairs: scenario.performance.boundedState.maxPublisherPendingPairs,
    maxPublisherRetainedBytes: scenario.performance.boundedState.maxPublisherRetainedBytes,
    correctness: scenario.admission.correctnessPassed && scenario.correctness.accountingComplete
      && scenario.correctness.allClientHashesMatched && scenario.correctness.ownerPrivacyAndAtomicObservationVerified,
  };
}

const loaded = pairs.map((pair, index) => ({ index: index + 1,
  legacy: loadArtifact(pair.legacy, false), prepared: loadArtifact(pair.prepared, true) }));
const commits = new Set(loaded.flatMap((pair) => [pair.legacy.aggregate.commit, pair.prepared.aggregate.commit]));
const machines = new Set(loaded.flatMap((pair) => [pair.legacy.run.machine, pair.prepared.run.machine]
  .map((machine) => JSON.stringify(machine))));
const seeds = new Set(loaded.flatMap((pair) => [pair.legacy.run.seed, pair.prepared.run.seed]));
if (commits.size !== 1) fail(`paired artifacts span commits: ${[...commits]}`);
if (machines.size !== 1) fail("paired artifacts span machine configurations");
if (seeds.size !== 1) fail("paired artifacts span workload seeds");
for (const pair of loaded) {
  const legacyPopulations = Object.keys(pair.legacy.scenarios).map(Number).sort((a, b) => a - b);
  const preparedPopulations = Object.keys(pair.prepared.scenarios).map(Number).sort((a, b) => a - b);
  if (JSON.stringify(legacyPopulations) !== JSON.stringify(preparedPopulations)) {
    fail(`pair ${pair.index} has disjoint population coverage`);
  }
}

const populations = [...new Set(loaded.flatMap((pair) =>
  Object.keys(pair.legacy.scenarios).map(Number).filter((population) => pair.prepared.scenarios[population])))]
  .sort((a, b) => a - b);
const perPair = [];
for (const pair of loaded) {
  for (const population of populations) {
    if (!pair.legacy.scenarios[population] || !pair.prepared.scenarios[population]) continue;
    const legacy = metric(pair.legacy.scenarios[population]);
    const prepared = metric(pair.prepared.scenarios[population]);
    perPair.push({ pair: pair.index, population, legacy, prepared,
      reduction: {
        projectionMean: pct(legacy.projectionMeanMs, prepared.projectionMeanMs),
        projectionP95: pct(legacy.projectionP95Ms, prepared.projectionP95Ms),
        projectionP99: pct(legacy.projectionP99Ms, prepared.projectionP99Ms),
        canonicalizations: pct(legacy.canonicalizations, prepared.canonicalizations),
        hashes: pct(legacy.hashes, prepared.hashes),
      } });
  }
}
const expectedRepeatPlan = { 1: 3, 4: 1, 8: 3 };
for (const [population, repeats] of Object.entries(expectedRepeatPlan)) {
  const observed = perPair.filter((row) => row.population === Number(population)).length;
  if (observed !== repeats) fail(`population ${population} requires ${repeats} paired repeats, found ${observed}`);
}
const orderDirections = new Set(loaded.filter((pair) => pair.legacy.scenarios[1] && pair.prepared.scenarios[1])
  .map((pair) => new Date(pair.legacy.run.generatedAt) < new Date(pair.prepared.run.generatedAt)
    ? "legacy-first" : "prepared-first"));
if (!orderDirections.has("legacy-first") || !orderDirections.has("prepared-first")) {
  fail("1/8 repeats must alternate legacy-first and prepared-first execution order");
}

const summary = Object.fromEntries(populations.map((population) => {
  const rows = perPair.filter((row) => row.population === population);
  const aggregateSide = (side) => Object.fromEntries([
    "projectionMeanMs", "projectionP95Ms", "projectionP99Ms", "publicationHz", "simTickP95Ms",
    "eventLoopP95Ms", "eventLoopP99Ms", "downlinkMeanBps", "downlinkOneSecondP95Bps",
    "rssP95Bytes", "heapP95Bytes", "canonicalizations", "hashes", "diffs",
  ].map((key) => [key, mean(rows.map((row) => row[side][key]))]));
  return [population, { repeats: rows.length, legacy: aggregateSide("legacy"), prepared: aggregateSide("prepared"),
    reduction: {
      projectionMean: mean(rows.map((row) => row.reduction.projectionMean)),
      projectionP95: mean(rows.map((row) => row.reduction.projectionP95)),
      projectionP99: mean(rows.map((row) => row.reduction.projectionP99)),
      canonicalizations: mean(rows.map((row) => row.reduction.canonicalizations)),
      hashes: mean(rows.map((row) => row.reduction.hashes)),
    } }];
}));

const result = {
  schema: "lbh-s6-prepared-projection-analysis-v1",
  generatedAt: new Date().toISOString(),
  commit: [...commits][0],
  machine: JSON.parse([...machines][0]),
  method: { alternatingPairs: pairs.length, warmupMs: 5000, measuredWindowMs: 15000,
    inputHz: loaded[0].legacy.run.config.inputHz, seed: [...seeds][0],
    expectedRepeatPlan, observedOrderDirections: [...orderDirections].sort(),
    timing: "runtime outer projection-and-publish wall timer; S5 stage profiler disabled",
    productAdmissionClaimed: false },
  artifacts: loaded.flatMap((pair) => [pair.legacy, pair.prepared]).map((artifact) => ({
    directory: path.relative(path.dirname(output), artifact.directory), profile: artifact.aggregate.profile,
    populations: artifact.aggregate.expectedPopulations,
    compositeSha256: artifact.checksum.actualAggregateSha256,
  })),
  allCorrect: perPair.every((row) => row.legacy.correctness && row.prepared.correctness),
  cacheBoundsPassed: perPair.every((row) => row.prepared.pendingReferences <= row.prepared.maxPendingReferences
    && row.prepared.ackedReferences <= row.prepared.maxAckedReferences),
  summary,
  perPair,
  limitations: ["Short local macOS loopback diagnostic", "One match at a time",
    "No WAN, WSS, hosted fleet, AOI, compression, binary codec, or product admission claim"],
};
fs.writeFileSync(output, `${JSON.stringify(result, null, 2)}\n`, { flag: "wx" });
console.log(JSON.stringify({ output, commit: result.commit, allCorrect: result.allCorrect,
  cacheBoundsPassed: result.cacheBoundsPassed, summary: result.summary }, null, 2));
