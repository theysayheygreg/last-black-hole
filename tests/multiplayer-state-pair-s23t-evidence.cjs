#!/usr/bin/env node
"use strict";

const assert = require("assert");
const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");

const ROOT = path.resolve(__dirname, "..");
const EVIDENCE = path.join(ROOT, "docs", "v0.4", "evidence", "state-pair-s23t");
const analysis = JSON.parse(fs.readFileSync(path.join(EVIDENCE, "analysis.json"), "utf8"));
const FAMILY = ["publicCoreSource", "bodyNormalizeAllowlist", "bodyCanonicalEncodingHash"];
const EXCLUSIVE_STAGES = new Set([...FAMILY, "cohortLookupDeltaSerialize",
  "ownerSourcePreparedProjection", "legacyPlaceholderOwnerPublisher",
  "recipientEnvelopeBuildValidate", "envelopeSerializeDigestRetain",
  "adapterDigestVerification", "brotliCompression", "accountingEnqueue", "socketSendCall"]);

function percentile(values, q) {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.ceil(sorted.length * q) - 1];
}

function median(values) {
  const sorted = [...values].sort((a, b) => a - b);
  return (sorted[(sorted.length - 1) >> 1] + sorted[sorted.length >> 1]) / 2;
}

function close(actual, expected, tolerance = 1e-9) {
  assert(Math.abs(actual - expected) <= tolerance * Math.max(1, Math.abs(expected)),
    `${actual} != ${expected}`);
}

function validateSummary() {
  assert.strictEqual(analysis.schema, "lbh-s23t-tail-attribution-analysis-v1");
  assert(/^[0-9a-f]{40}$/.test(analysis.commit));
  for (const capture of Object.values(analysis.captures)) {
    assert(/^[0-9a-f]{64}$/.test(capture.compositeSha256));
  }
  const sealed = analysis.sealedS23Reference;
  const control = analysis.control;
  for (const population of ["one", "eight"]) {
    assert.strictEqual(control[population].overload, "NORMAL");
    assert(control[population].hz >= 9);
    assert(Math.abs(control[population].p50Ms / median(sealed[population].p50Ms) - 1) <= 0.10);
    assert(Math.abs(control[population].p95Ms / median(sealed[population].p95Ms) - 1) <= 0.10);
  }
  for (const round of ["a1", "a2"]) for (const population of ["one", "eight"]) {
    const row = analysis.profiles[round][population];
    assert(row.completeBeats >= 128);
    assert(row.reconciliationRatio >= 0.99);
    assert(row.unattributedP95Ms / row.p95Ms < 0.10);
    const overhead = analysis.profiles[round].overheadVersusB;
    const prefix = population === "one" ? "one" : "eight";
    assert(overhead[`${prefix}P50`] <= 0.10 && overhead[`${prefix}P95`] <= 0.10);
    assert(overhead[`${prefix}Core`] <= 0.05);
  }
  const familyRatio = analysis.profiles.a2.eight.sourceBodyPreparationP95Ms
    / analysis.profiles.a1.eight.sourceBodyPreparationP95Ms;
  assert(Math.abs(familyRatio - 1) <= 0.15);
  assert.deepStrictEqual(analysis.selection.stages, FAMILY);
  assert.strictEqual(analysis.selection.nextLane, "S23P prepared public-source proof");
  for (const round of ["a1", "a2"]) {
    const eight = analysis.profiles[round].eight;
    const one = analysis.profiles[round].one;
    const eightExcess = eight.p95Ms - 50;
    const oneRegression = one.p95Ms - analysis.profiles.s20One.p95Ms;
    const eightShare = eight.sourceBodyPreparationP95Ms / eightExcess;
    const oneShare = (one.sourceBodyPreparationP95Ms
      - analysis.profiles.s20One.sourceBodyPreparationP95Ms) / oneRegression;
    close(analysis.selection[`${round}EightExcessMs`], eightExcess);
    close(analysis.selection[`${round}EightFamilyShare`], eightShare);
    close(analysis.selection[`${round}OneRegressionMs`], oneRegression);
    close(analysis.selection[`${round}OneFamilyShare`], oneShare);
    assert(eightShare >= 0.70 && oneShare >= 0.70);
  }
  assert(Object.values(analysis.methodGates).every(Boolean));
}

function validateBeatPrivacy(beat) {
  assert.deepStrictEqual(Object.keys(beat).sort(), ["arrayBuffers", "cpuMicroseconds", "elu",
    "exclusiveMs", "external", "gcEvents", "heapTotal", "heapUsed", "invocations", "ordinal",
    "outerMs", "recipientSlots", "reconciliationRatio", "rss", "stages", "unattributedMs"].sort());
  for (const [key, value] of Object.entries(beat)) {
    if (key === "recipientSlots") {
      assert(value.every((slot) => Number.isSafeInteger(slot) && slot >= 1 && slot <= 16));
    } else if (key === "stages" || key === "invocations") {
      for (const [stage, numeric] of Object.entries(value)) {
        assert(EXCLUSIVE_STAGES.has(stage), `unexpected retained stage ${stage}`);
        assert(Number.isFinite(numeric) && numeric >= 0);
      }
    } else assert(Number.isFinite(value) && value >= 0, `non-numeric retained field ${key}`);
  }
}

function validateRaw(rawRoot) {
  const dirs = { a1: "a1", b: "b", a2: "a2", s20One: "s20-one" };
  for (const [name, relative] of Object.entries(dirs)) {
    const directory = path.join(rawRoot, relative);
    execFileSync(process.execPath,
      [path.join(__dirname, "multiplayer-state-pair-clock-attribution.cjs"),
        "--validate-artifact", directory], { cwd: ROOT, stdio: "pipe" });
    const checksums = JSON.parse(fs.readFileSync(path.join(directory, "checksums.json"), "utf8"));
    assert.strictEqual(checksums.sha256, analysis.captures[name].compositeSha256);
    const run = JSON.parse(fs.readFileSync(path.join(directory, "run.json"), "utf8"));
    assert.strictEqual(run.commit, analysis.commit);
    assert.deepStrictEqual(run.config.populations, analysis.captures[name].populations);
    assert.strictEqual(run.config.warmupMs, 5_000);
    assert.strictEqual(run.config.windowMs, 20_000);
    assert.strictEqual(run.config.binary, false);
    assert.strictEqual(run.config.compression, true);
    assert.strictEqual(run.config.publicBody, name !== "s20One");
    assert.strictEqual(run.config.s23tProfile, analysis.captures[name].profile);
    for (const population of run.config.populations) {
      const row = JSON.parse(fs.readFileSync(path.join(directory, `normal-${population}.json`), "utf8"));
      assert.strictEqual(row.commit, analysis.commit);
      assert.strictEqual(row.population, population);
      assert.strictEqual(row.window.warmupMs, 5_000);
      assert.strictEqual(row.window.requestedMeasurementMs, 20_000);
      assert.strictEqual(row.window.endAt - row.window.startAt, 20_000);
      assert.strictEqual(row.window.durationSeconds, 20);
      assert.strictEqual(row.topology.matches, 1);
      assert.strictEqual(row.topology.dedicatedLogicalAuthorities, 1);
      assert.strictEqual(row.topology.simultaneousRecipients, population);
      assert.strictEqual(row.topology.isolatedClientProcesses.length, population);
      assert(new Set(row.topology.isolatedClientProcesses).size === population);
      assert(!row.topology.isolatedClientProcesses.includes(row.topology.authorityPid));
      assert.strictEqual(row.correctness.passed, true);
      const summaryKey = population === 1 ? "one" : "eight";
      const compact = name === "b" ? analysis.control[summaryKey]
        : name === "s20One" ? analysis.profiles.s20One : analysis.profiles[name][summaryKey];
      close(row.cadence.minimumAuthorityAcceptedPairsPerSecond, compact.hz);
      close(row.performance.authority.projectionAndPublishMs.p50, compact.p50Ms);
      close(row.performance.authority.projectionAndPublishMs.p95, compact.p95Ms);
      const retainedProfile = row.performance.authority.s23tPublicBodyProfile;
      assert.strictEqual(Boolean(retainedProfile), name !== "b");
      if (retainedProfile) {
        const profile = retainedProfile;
        assert(profile.bounds.sourceBeatCapacity === 512);
        assert(profile.bounds.maxRecipientSlots === 16);
        assert(profile.nestedTimerViolations === 0);
        assert(profile.overflowRecipientObservations === 0);
        assert.strictEqual(profile.recipientSlots, population);
        assert(profile.sourceBeats.length <= 512);
        profile.sourceBeats.forEach(validateBeatPrivacy);
        const familyP95 = percentile(profile.sourceBeats.map((beat) =>
          FAMILY.reduce((sum, stage) => sum + (beat.stages[stage] || 0), 0)), 0.95);
        close(familyP95, compact.sourceBodyPreparationP95Ms);
      }
    }
  }
}

validateSummary();
if (process.env.LBH_S23T_RAW_ROOT) validateRaw(path.resolve(process.env.LBH_S23T_RAW_ROOT));
console.log("S23T evidence validation passed");
