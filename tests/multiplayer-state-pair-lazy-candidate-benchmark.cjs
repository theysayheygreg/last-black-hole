#!/usr/bin/env node
"use strict";

const assert = require("assert");
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");

const ROOT = path.resolve(__dirname, "..");
const BASELINE_ROOT = path.resolve(process.env.LBH_S17_BASELINE_ROOT || "/tmp/lbh-s17-baseline");
const ITERATIONS = Number(process.env.LBH_S17_ITERATIONS || 600);
const WARMUP = Number(process.env.LBH_S17_WARMUP || 60);
const OUTPUT = process.env.LBH_S17_OUTPUT ? path.resolve(ROOT, process.env.LBH_S17_OUTPUT) : null;
const BENCHMARK = path.join(ROOT, "tests", "multiplayer-state-pair-canonical-reuse-benchmark.cjs");

function git(cwd, ...args) {
  return execFileSync("git", args, { cwd, encoding: "utf8" }).trim();
}

function sha(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function run(label, moduleRoot, order) {
  const output = execFileSync(process.execPath, [BENCHMARK], { cwd: ROOT, encoding: "utf8", env: {
    ...process.env,
    LBH_S15_MODULE_ROOT: moduleRoot,
    LBH_S15_SELECTOR_ITERATIONS: String(ITERATIONS),
    LBH_S15_SELECTOR_WARMUP: String(WARMUP),
    LBH_S15_RUN_LABEL: label,
    LBH_S15_RUN_ORDER: String(order),
    LBH_S15_SOURCE_COMMIT: git(moduleRoot, "rev-parse", "HEAD"),
    LBH_S15_SOURCE_TREE: git(moduleRoot, "rev-parse", "HEAD^{tree}"),
  } });
  return JSON.parse(output);
}

function outerProxy(row, framesPerSelection) {
  const frames = row.selections * framesPerSelection;
  const slotsPerFrame = 21; // 19 header properties plus public/owner references.
  return { frames, referenceSlots: frames * slotsPerFrame,
    bytes: frames * slotsPerFrame * 8,
    contract: "Reference-slot allocation proxy only; not measured V8 heap allocation." };
}

function main() {
  assert(fs.existsSync(path.join(BASELINE_ROOT, "scripts", "authority-delta-publisher.cjs")),
    "LBH_S17_BASELINE_ROOT must be a detached S16/S15 release-default source tree");
  const baselineCommit = git(BASELINE_ROOT, "rev-parse", "HEAD");
  assert.strictEqual(baselineCommit, "b52b0bfcbfcbaf3322a161d4e14334f67fdbf7af",
    "S17 baseline must be the sealed S16 decision commit whose release default is S15 positional JSON");
  const candidateCommit = git(ROOT, "rev-parse", "HEAD");
  const rounds = [
    { order: "baseline-candidate", baseline: run("round-a-baseline", BASELINE_ROOT, 1),
      candidate: run("round-a-candidate", ROOT, 2) },
    { order: "candidate-baseline", candidate: run("round-b-candidate", ROOT, 1),
      baseline: run("round-b-baseline", BASELINE_ROOT, 2) },
  ];
  for (const round of rounds) {
    assert.strictEqual(round.baseline.transcriptSha256, round.candidate.transcriptSha256);
    assert.strictEqual(round.baseline.selectionTranscriptSha256, round.candidate.selectionTranscriptSha256);
    assert.strictEqual(round.baseline.parityComparisons, ITERATIONS);
    assert.strictEqual(round.candidate.parityComparisons, ITERATIONS);
  }
  const summaries = rounds.map((round) => {
    const before = round.baseline;
    const after = round.candidate;
    const beforeOuter = outerProxy(before, 4);
    const afterOuter = outerProxy(after, 1);
    assert.strictEqual(after.operations.outerCandidateDescriptors, after.selections * 4);
    assert.strictEqual(after.operations.outerCandidateFrames, after.selections);
    assert.strictEqual(after.operations.chosenFrameMaterializations, after.selections);
    assert.strictEqual(after.operations.sizeProofOperations, after.selections * 8);
    return { order: round.order,
      publishMeanReductionFraction: 1 - after.publishMilliseconds.mean / before.publishMilliseconds.mean,
      selectionP95ReductionFraction: 1 - after.selectionMilliseconds.p95 / before.selectionMilliseconds.p95,
      preparedHashHitReductionFraction: 1 - after.preparedProjectionOperations.preparedHashHits
        / before.preparedProjectionOperations.preparedHashHits,
      outerAllocationProxyReductionFraction: 1 - afterOuter.bytes / beforeOuter.bytes,
      baselineOuterAllocationProxy: beforeOuter, candidateOuterAllocationProxy: afterOuter };
  });
  const result = { schema: "lbh-s17-lazy-candidate-benchmark-v1",
    authorityBoundary: "One dedicated logical authority process owns one match/group; concurrent matches multiply this isolated boundary.",
    releaseDefault: "S15 positional JSON; S16 binary remains opt-in and is not measured here.",
    iterations: ITERATIONS, warmup: WARMUP,
    baseline: { commit: baselineCommit, tree: git(BASELINE_ROOT, "rev-parse", "HEAD^{tree}") },
    candidate: { commit: candidateCommit, tree: git(ROOT, "rev-parse", "HEAD^{tree}") },
    rounds, summaries,
    parity: { exactWireComparisons: ITERATIONS * rounds.length,
      exactSelectionTranscriptComparisons: ITERATIONS * rounds.length,
      decodedSemanticComparisons: ITERATIONS * rounds.length,
      mismatches: 0,
      transcriptSha256: rounds[0].candidate.transcriptSha256,
      crossRoundTranscriptSha256: sha(rounds.map((round) => round.candidate.transcriptSha256).join("\n")) },
    attribution: {
      provenMaterial: summaries.every((row) => row.publishMeanReductionFraction > 0.15
        && row.selectionP95ReductionFraction > 0.25),
      operationChange: "Four complete outer candidates and repeated lane validation become four descriptors, four unique lane validations, and one chosen complete frame.",
      laneReuse: "The already-built public/owner keyframe and delta payloads are referenced within one synchronous selection only; no cross-tick or cross-recipient mutable cache exists.",
    },
    limitations: ["Machine-local synthetic 48-public-entity plus one-owner workload",
      "Allocation proxy counts reference slots and is not measured V8 heap allocation",
      "Does not admit cadence, hosted deployment, fleet packing, or 24/48/96 clients"] };
  if (OUTPUT) fs.writeFileSync(OUTPUT, `${JSON.stringify(result, null, 2)}\n`, { flag: "wx" });
  console.log(JSON.stringify(result, null, 2));
}

main();
