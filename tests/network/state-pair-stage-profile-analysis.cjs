#!/usr/bin/env node
"use strict";

const fs = require("fs");
const path = require("path");
const { validateChecksums } = require("./state-pair-product-metrics.cjs");

function fail(message) {
  throw new Error(message);
}

function read(directory, name) {
  return JSON.parse(fs.readFileSync(path.join(directory, name), "utf8"));
}

function artifact(directory) {
  const resolved = path.resolve(directory);
  const aggregate = read(resolved, "aggregate.json");
  const checksum = validateChecksums(resolved);
  if (!checksum.passed) fail(`Artifact checksum failed: ${resolved}`);
  return { directory: resolved, aggregate, checksum,
    scenarios: Object.fromEntries(aggregate.scenarios.map((entry) =>
      [entry.population, read(resolved, entry.file)])) };
}

function mean(values) {
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function range(values) {
  return { min: Math.min(...values), mean: mean(values), max: Math.max(...values) };
}

function metric(scenario) {
  const authority = scenario.performance.authority;
  return {
    publicationHz: scenario.cadence.observedPairsPerSecond,
    projectionMeanMs: authority.projectionTotalMs / authority.projectionSamples,
    projectionP95Ms: authority.projectionAndPublishMs.p95,
    simTickP95Ms: authority.simTickMs.p95,
    meanDownlinkBytesPerSecond: scenario.exactTraffic.worstRecipientMeanDownlinkBytesPerSecond,
    oneSecondP95DownlinkBytesPerSecond: scenario.exactTraffic.oneSecondP95DownlinkBytesPerSecond,
    overloadStayedNormal: scenario.admission.overloadStayedNormal,
    correctnessPassed: scenario.admission.correctnessPassed,
    ackRejectsExactlyZero: scenario.correctness.unexpectedAckRejects === true,
  };
}

function delta(instrumented, control) {
  const result = {};
  for (const key of ["publicationHz", "projectionMeanMs", "projectionP95Ms", "simTickP95Ms",
    "meanDownlinkBytesPerSecond", "oneSecondP95DownlinkBytesPerSecond"]) {
    result[key] = { control: control[key], instrumented: instrumented[key],
      delta: instrumented[key] - control[key],
      changeFraction: control[key] === 0 ? null : (instrumented[key] - control[key]) / control[key] };
  }
  result.overloadStayedNormal = { control: control.overloadStayedNormal,
    instrumented: instrumented.overloadStayedNormal };
  result.correctnessPassed = control.correctnessPassed && instrumented.correctnessPassed;
  result.ackRejectsExactlyZero = control.ackRejectsExactlyZero && instrumented.ackRejectsExactlyZero;
  return result;
}

function parseArgs(args) {
  const parsed = { pairs: [] };
  for (let index = 0; index < args.length; index += 1) {
    if (args[index] === "--canonical") parsed.canonical = args[++index];
    else if (args[index] === "--pair") {
      const [control, instrumented] = String(args[++index] || "").split("::");
      if (!control || !instrumented) fail("--pair requires control::instrumented");
      parsed.pairs.push({ control, instrumented });
    } else if (args[index] === "--output") parsed.output = args[++index];
    else fail(`Unknown argument: ${args[index]}`);
  }
  if (!parsed.canonical || !parsed.output || parsed.pairs.length < 1) {
    fail("Usage: --canonical DIR --pair CONTROL::INSTRUMENTED [--pair ...] --output FILE");
  }
  return parsed;
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const canonical = artifact(args.canonical);
  if (canonical.aggregate.gate !== "s5" || canonical.aggregate.instrumentationEnabled !== true) {
    fail("Canonical artifact must be an instrumented S5 profile");
  }
  const populations = Object.keys(canonical.scenarios).map(Number).sort((a, b) => a - b);
  const canonicalProfiles = {};
  for (const population of populations) {
    const scenario = canonical.scenarios[population];
    const authority = scenario.performance.authority;
    const profile = scenario.performance.authorityStageProfile;
    const proof = scenario.diagnostics.statePair.profileShareability.publicCore;
    const stages = Object.fromEntries(Object.entries(profile.stages).map(([name, row]) => [name, {
      scope: row.scope,
      timingKind: row.timingKind,
      ...row.aggregate,
      percentOfEndToEndProjectionWall: row.aggregate.totalMs / authority.projectionTotalMs,
      eligibleForSynchronousOperationRanking: row.timingKind !== "async-wall-latency",
    }]));
    const core = stages["recipient.publicCoreProjectionConstruction"];
    const redundantCoreMs = core.totalMs * (population - 1) / population;
    canonicalProfiles[population] = {
      population,
      topology: scenario.topology,
      metric: metric(scenario),
      endToEndProjection: {
        samples: authority.projectionSamples,
        totalMs: authority.projectionTotalMs,
        meanMs: authority.projectionTotalMs / authority.projectionSamples,
        ...authority.projectionAndPublishMs,
      },
      eventLoopDelay: scenario.performance.eventLoopLag,
      stages,
      shareability: {
        ...scenario.diagnostics.statePair.profileShareability,
        completeCoverage: proof.beats * population === core.calls
          && proof.comparisons === proof.beats * (population - 1),
        publicCoreRedundantMs: redundantCoreMs,
        publicCoreRedundantMsPerBeat: redundantCoreMs / proof.beats,
        publicCoreTheoreticalEndToEndSavingsFraction: redundantCoreMs / authority.projectionTotalMs,
        assumption: "Reuse only the byte-identical public core inside one match authority beat; retain recipient lineage, ACK bases, owner state, pair choice, queue, and send per recipient.",
      },
      correctness: scenario.correctness,
    };
  }

  const pairRows = args.pairs.map(({ control: controlDir, instrumented: instrumentedDir }, index) => {
    const control = artifact(controlDir);
    const instrumented = artifact(instrumentedDir);
    if (control.aggregate.commit !== canonical.aggregate.commit || instrumented.aggregate.commit !== canonical.aggregate.commit
        || control.aggregate.instrumentationEnabled !== false || instrumented.aggregate.instrumentationEnabled !== true
        || control.aggregate.microProfile !== true || instrumented.aggregate.microProfile !== true) {
      fail(`A/B pair ${index + 1} is not a same-commit control/instrumented micro pair`);
    }
    return {
      repeat: index + 1,
      control: { directory: path.relative(process.cwd(), control.directory), sha256: control.checksum.actualAggregateSha256,
        generatedAt: read(control.directory, "run.json").generatedAt },
      instrumented: { directory: path.relative(process.cwd(), instrumented.directory), sha256: instrumented.checksum.actualAggregateSha256,
        generatedAt: read(instrumented.directory, "run.json").generatedAt },
      order: read(control.directory, "run.json").generatedAt < read(instrumented.directory, "run.json").generatedAt
        ? "control-then-instrumented" : "instrumented-then-control",
      populations: Object.fromEntries([1, 8].map((population) => [population,
        delta(metric(instrumented.scenarios[population]), metric(control.scenarios[population]))])),
    };
  });
  const overheadSummary = {};
  for (const population of [1, 8]) {
    overheadSummary[population] = {};
    for (const key of ["publicationHz", "projectionMeanMs", "projectionP95Ms", "simTickP95Ms",
      "meanDownlinkBytesPerSecond", "oneSecondP95DownlinkBytesPerSecond"]) {
      overheadSummary[population][key] = range(pairRows.map((pair) =>
        pair.populations[population][key].changeFraction));
    }
    overheadSummary[population].allCorrect = pairRows.every((pair) =>
      pair.populations[population].correctnessPassed && pair.populations[population].ackRejectsExactlyZero);
  }

  const output = {
    schema: "lbh-authority-stage-profile-analysis-v1",
    generatedAt: new Date().toISOString(),
    commit: canonical.aggregate.commit,
    canonical: { directory: path.relative(process.cwd(), canonical.directory), sha256: canonical.checksum.actualAggregateSha256,
      profiles: canonicalProfiles },
    pairedAlternatingAB: { repeats: pairRows.length, pairs: pairRows, overheadSummary },
    interpretation: {
      stageRowsAreAdditiveCpuDecomposition: false,
      reason: "Opaque delta stages include internal normalization/hash/canonical work; repeated candidate/full-frame phases are intentionally aggregated. Socket callback is overlapping async wall latency. Metric sizing and shareability hashes occur outside stage timers.",
      externalWallOverheadSource: "Use pairedAlternatingAB, not the sum of stage rows.",
      allocationBoundary: "serializedAllocationProxyBytes is serialized output size, not measured heap allocation.",
    },
  };
  fs.writeFileSync(path.resolve(args.output), `${JSON.stringify(output, null, 2)}\n`, { flag: "wx" });
  console.log(path.resolve(args.output));
}

main();
