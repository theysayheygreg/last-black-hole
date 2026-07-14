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
  for (const key of ["a1EightFamilyShare", "a2EightFamilyShare",
    "a1OneFamilyShare", "a2OneFamilyShare"]) assert(analysis.selection[key] >= 0.70);
  assert(Object.values(analysis.methodGates).every(Boolean));
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
    for (const population of run.config.populations) {
      const row = JSON.parse(fs.readFileSync(path.join(directory, `normal-${population}.json`), "utf8"));
      const summaryKey = population === 1 ? "one" : "eight";
      const compact = name === "b" ? analysis.control[summaryKey]
        : name === "s20One" ? analysis.profiles.s20One : analysis.profiles[name][summaryKey];
      close(row.cadence.minimumAuthorityAcceptedPairsPerSecond, compact.hz);
      close(row.performance.authority.projectionAndPublishMs.p50, compact.p50Ms);
      close(row.performance.authority.projectionAndPublishMs.p95, compact.p95Ms);
      if (row.performance.authority.s23tPublicBodyProfile && name !== "b") {
        const profile = row.performance.authority.s23tPublicBodyProfile;
        assert(profile.bounds.sourceBeatCapacity === 512);
        assert(profile.nestedTimerViolations === 0);
        assert(profile.overflowRecipientObservations === 0);
        assert(JSON.stringify(profile.sourceBeats).includes("recipientSlots"));
        assert(!JSON.stringify(profile.sourceBeats).includes("membershipId"));
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
