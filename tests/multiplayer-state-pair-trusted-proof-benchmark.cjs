#!/usr/bin/env node
"use strict";

const assert = require("assert");
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");

const ROOT = path.resolve(__dirname, "..");
const BENCHMARK = path.join(ROOT, "tests", "multiplayer-state-pair-canonical-reuse-benchmark.cjs");
const ITERATIONS = Number(process.env.LBH_S18_ITERATIONS || 800);
const WARMUP = Number(process.env.LBH_S18_WARMUP || 80);

function git(...args) { return execFileSync("git", args, { cwd: ROOT, encoding: "utf8" }).trim(); }
function sha(value) { return crypto.createHash("sha256").update(value).digest("hex"); }

function run(label, order, trusted) {
  return JSON.parse(execFileSync(process.execPath, [BENCHMARK], { cwd: ROOT, encoding: "utf8", env: {
    ...process.env,
    LBH_S15_SELECTOR_ITERATIONS: String(ITERATIONS),
    LBH_S15_SELECTOR_WARMUP: String(WARMUP),
    LBH_S15_RUN_LABEL: label,
    LBH_S15_RUN_ORDER: String(order),
    LBH_S15_SOURCE_COMMIT: git("rev-parse", "HEAD"),
    LBH_S15_SOURCE_TREE: git("rev-parse", "HEAD^{tree}"),
    ...(trusted ? {} : { LBH_S18_DISABLE_TRUSTED_PROOFS: "1" }),
  } }));
}

function main() {
  const rounds = [
    { order: "full-trusted", full: run("round-a-full", 1, false), trusted: run("round-a-trusted", 2, true) },
    { order: "trusted-full", trusted: run("round-b-trusted", 1, true), full: run("round-b-full", 2, false) },
  ];
  for (const round of rounds) {
    assert.strictEqual(round.full.transcriptSha256, round.trusted.transcriptSha256);
    assert.strictEqual(round.full.selectionTranscriptSha256, round.trusted.selectionTranscriptSha256);
    assert.strictEqual(round.full.parityComparisons, ITERATIONS);
    assert.strictEqual(round.trusted.parityComparisons, ITERATIONS);
    assert.strictEqual(round.trusted.operations.trustedProofsCreated, ITERATIONS + WARMUP);
    assert.strictEqual(round.trusted.operations.trustedProofsConsumed, ITERATIONS + WARMUP);
    assert.strictEqual(round.trusted.operations.trustedProofRejects, 0);
  }
  const comparisons = rounds.map((round) => ({ order: round.order,
    publishMeanReductionFraction: 1 - round.trusted.publishMilliseconds.mean / round.full.publishMilliseconds.mean,
    selectionP50ReductionFraction: 1 - round.trusted.selectionMilliseconds.p50 / round.full.selectionMilliseconds.p50,
    selectionP95ReductionFraction: 1 - round.trusted.selectionMilliseconds.p95 / round.full.selectionMilliseconds.p95,
    allocationProxyReductionFraction: 1 - round.trusted.operations.allocationProxyBytes
      / round.full.operations.allocationProxyBytes,
  }));
  const result = { schema: "lbh-s18-trusted-proof-benchmark-v1",
    authorityBoundary: "One dedicated logical authority owns one match/group; concurrent matches multiply that isolated boundary horizontally.",
    releaseDefault: "S15 positional JSON plus S17 lazy materialization and S18 trusted same-operation proof; S16 binary remains opt-in.",
    implementationCommit: git("rev-parse", "HEAD"), implementationTree: git("rev-parse", "HEAD^{tree}"),
    trackedClean: !git("status", "--short"), iterations: ITERATIONS, warmup: WARMUP,
    rounds, comparisons,
    parity: { exactWireComparisons: ITERATIONS * rounds.length,
      exactSelectionTranscriptComparisons: ITERATIONS * rounds.length,
      semanticDecodeComparisons: ITERATIONS * rounds.length, mismatches: 0,
      transcriptSha256: rounds[0].trusted.transcriptSha256,
      combinedSha256: sha(rounds.map((round) => round.trusted.transcriptSha256).join("\n")) },
    attribution: { material: comparisons.every((row) => row.publishMeanReductionFraction > 0.2
        && row.selectionP95ReductionFraction > 0.5),
      skipped: "Four repeated full semantic/hash validations and the separate expanded-size pass are replaced by one authority-origin validation plus one consumed proof.",
      retained: "All four positional lane encodes, exact four-candidate sizes, one chosen composition, digest, queue, and send remain unchanged.",
      allocationProxyNote: "Existing labeled serialization/reference proxy only; not measured V8 heap allocation." },
    limitations: ["Machine-local synthetic 48-public-entity plus one-owner workload",
      "Profiler-off counterbalanced microbenchmark; no hosted, cadence-policy, compression, or 24/48/96 claim"] };
  if (process.env.LBH_S18_OUTPUT) fs.writeFileSync(path.resolve(ROOT, process.env.LBH_S18_OUTPUT),
    `${JSON.stringify(result, null, 2)}\n`, { flag: "wx" });
  console.log(JSON.stringify(result, null, 2));
}

main();
