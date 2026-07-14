#!/usr/bin/env node
"use strict";

const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");

const ROOT = path.resolve(__dirname, "..");
const EVIDENCE = path.join(ROOT, "docs", "v0.4", "evidence", "split-public-fragment-screen-c9d52da");
const CAPABILITY = "state-pair-split-public-fragment-v1";
const EXPECTED_COMPOSITE_SHA256 = "35fdbe0a00e6e3f2ee3e576685c4472466bc8dc8373634e5dd64e7cc9bd6a9a9";
const ABORT_P95_MS = 55;
const PRE_PROTOTYPE_BASELINE = "16da5ae";
const COMMITS = Object.freeze({
  codecPrototype: "2642633",
  authorityPrototype: "255a140",
  runtimePrototype: "c9d52da",
  postScreenClosure: "a3f67d9",
  preservedDraft: "68d2826",
  preservedDraftRevert: "3658219",
  postScreenClosureRevert: "e696e08",
  runtimePrototypeRevert: "642452f",
  authorityPrototypeRevert: "d26f590",
  codecPrototypeRevert: "5189833",
});
const REMOVED_FILES = Object.freeze([
  "scripts/split-public-fragment-codec.cjs",
  "scripts/split-public-fragment-authority.cjs",
  "tests/split-public-fragment-codec.cjs",
  "tests/split-public-fragment-authority.cjs",
  "tests/split-public-fragment-runtime.cjs",
]);
const REVERT_PAIRS = Object.freeze([
  ["preservedDraft", "preservedDraftRevert"],
  ["postScreenClosure", "postScreenClosureRevert"],
  ["runtimePrototype", "runtimePrototypeRevert"],
  ["authorityPrototype", "authorityPrototypeRevert"],
  ["codecPrototype", "codecPrototypeRevert"],
]);

function git(...args) {
  return execFileSync("git", args, { cwd: ROOT, encoding: "utf8" }).trim();
}

function sha256(bytes) {
  return crypto.createHash("sha256").update(bytes).digest("hex");
}

function readJson(name) {
  return JSON.parse(fs.readFileSync(path.join(EVIDENCE, name), "utf8"));
}

function assertCommit(role, shortCommit) {
  const commit = git("rev-parse", `${shortCommit}^{commit}`);
  try { git("merge-base", "--is-ancestor", commit, "HEAD"); }
  catch { throw new Error(`${role} commit ${commit} is not an ancestor of HEAD`); }
  return Object.freeze({ role, commit });
}

function proveRevertChronology() {
  const chronology = Object.entries(COMMITS).map(([role, commit]) => assertCommit(role, commit));
  const byRole = new Map(chronology.map((record) => [record.role, record.commit]));
  const pairs = REVERT_PAIRS.map(([targetRole, revertRole]) => {
    const target = byRole.get(targetRole);
    const revert = byRole.get(revertRole);
    const message = git("show", "-s", "--format=%B", revert);
    if (!message.includes(`This reverts commit ${target}.`)) {
      throw new Error(`${revertRole} does not explicitly revert ${targetRole}`);
    }
    return Object.freeze({ targetRole, target, revertRole, revert });
  });
  const baselineTree = git("rev-parse", `${PRE_PROTOTYPE_BASELINE}^{tree}`);
  const restoredTree = git("rev-parse", `${byRole.get("codecPrototypeRevert")}^{tree}`);
  if (baselineTree !== restoredTree) throw new Error("prototype revert chain did not restore the baseline tree");
  return Object.freeze({ chronology: Object.freeze(chronology), pairs: Object.freeze(pairs),
    baselineCommit: git("rev-parse", `${PRE_PROTOTYPE_BASELINE}^{commit}`), baselineTree, restoredTree });
}

function proveInstrumentationLimitation() {
  const broken = git("show", `${COMMITS.runtimePrototype}:scripts/sim-ws-adapter.cjs`);
  const corrected = git("show", `${COMMITS.postScreenClosure}:scripts/sim-ws-adapter.cjs`);
  if (!broken.includes("frames: [accountingFrame, accountingFrame]")
      || !corrected.includes("frames: [fragmentAccountingFrame, accountingFrame]")) {
    throw new Error("historical two-wire accounting classification proof changed");
  }
  return Object.freeze({
    rawLogicalPairCountUsable: false,
    rawCorrectnessFailureIsNotSemanticFailure: true,
    configuredPublicationHz: 10,
    rawAuthorityAcceptedPhysicalWiresPerSecond: 20,
    historicalBrokenCommit: git("rev-parse", `${COMMITS.runtimePrototype}^{commit}`),
    historicalCorrectionCommit: git("rev-parse", `${COMMITS.postScreenClosure}^{commit}`),
    causeProvenFromHistory: true,
    reason: "The harness classified the fragment and overlay physical wires as two logical state-pair deliveries.",
  });
}

function verifyComposite() {
  const manifest = readJson("checksums.json");
  if (manifest.algorithm !== "sha256(path NUL sha256 LF, sorted by path)") {
    throw new Error("unexpected split evidence checksum algorithm");
  }
  const files = [...manifest.files].sort((left, right) => left.path.localeCompare(right.path, "en"));
  const lines = [];
  for (const record of files) {
    const bytes = fs.readFileSync(path.join(EVIDENCE, record.path));
    const digest = sha256(bytes);
    if (bytes.length !== record.bytes || digest !== record.sha256) {
      throw new Error(`split evidence file mismatch: ${record.path}`);
    }
    lines.push(`${record.path}\0${digest}\n`);
  }
  const composite = sha256(Buffer.from(lines.join(""), "utf8"));
  if (composite !== manifest.sha256 || composite !== EXPECTED_COMPOSITE_SHA256) {
    throw new Error(`split evidence composite mismatch: ${composite}`);
  }
  return Object.freeze({ algorithm: manifest.algorithm, sha256: composite,
    files: Object.freeze(files.map((record) => Object.freeze({ ...record }))) });
}

function walkSource(directory, output = []) {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) walkSource(absolute, output);
    else if (/\.(?:c?js|mjs)$/.test(entry.name)) output.push(absolute);
  }
  return output;
}

function proveLiveSourceAbsence() {
  const removed = REMOVED_FILES.map((relative) => Object.freeze({ path: relative,
    absent: !fs.existsSync(path.join(ROOT, relative)) }));
  if (removed.some((record) => !record.absent)) throw new Error("split prototype file remains live");
  const excluded = new Set([
    path.resolve(__filename),
    path.join(ROOT, "tests", "split-public-fragment-terminal-negative.cjs"),
  ]);
  const needles = [CAPABILITY, "splitPublicFragment", "SPLIT_PUBLIC_FRAGMENT"];
  const matches = [];
  for (const root of ["scripts", "src", "tests"]) {
    for (const absolute of walkSource(path.join(ROOT, root))) {
      if (excluded.has(absolute)) continue;
      const source = fs.readFileSync(absolute, "utf8");
      for (const needle of needles) {
        if (source.includes(needle)) matches.push(`${path.relative(ROOT, absolute)}:${needle}`);
      }
    }
  }
  if (matches.length) throw new Error(`split capability remains in live source: ${matches.join(", ")}`);
  return Object.freeze({ capability: CAPABILITY, removedFiles: Object.freeze(removed), sourceMatches: 0 });
}

function buildTerminalNegative() {
  const checksums = verifyComposite();
  const aggregate = readJson("aggregate.json");
  const raw = readJson("normal-8.json");
  const run = readJson("run.json");
  const cleanup = readJson("cleanup-normal-8.json");
  const scenario = aggregate.scenarios?.find((entry) => entry.population === 8);
  if (!scenario || raw.population !== 8 || run.config?.populations?.join(",") !== "8") {
    throw new Error("terminal split evidence is not the one eight-client screen");
  }
  if (!run.commit.startsWith(COMMITS.runtimePrototype) || raw.commit !== run.commit
      || aggregate.commit !== run.commit) throw new Error("screen is not bound to runtime prototype c9d52da");
  const p95Ms = raw.performance?.authority?.projectionAndPublishMs?.p95;
  if (p95Ms !== scenario.projectionP95Ms || !(p95Ms > ABORT_P95_MS)) {
    throw new Error("declared projection/publish abort boundary was not crossed");
  }
  const receiverHz = raw.cadence?.minimumReceiverAcceptedPairsPerSecond;
  const worstMeanBps = raw.traffic?.worstRecipientMeanDownlinkBytesPerSecond;
  const recipientWindowP95Bps = raw.traffic?.oneSecondAllRecipientBytesPerSecond?.p95;
  const authorityCore = raw.performance?.authority?.cpuUsage?.oneCoreFraction;
  if (receiverHz !== 9.666666666666666 || worstMeanBps !== 49386.666666666664
      || recipientWindowP95Bps !== 49922 || authorityCore !== 0.5097349493873202
      || raw.authorityState?.overloadState !== "NORMAL") {
    throw new Error("terminal split evidence metrics changed");
  }
  const zeroRecovery = raw.clients.every((client) => client.receiver?.recoveryRequests === 0)
    && raw.authorityState?.adapter?.ackRejectDiagnostics?.recoveryRequests === 0;
  const noQueueTransition = raw.correctness?.noHighWaterOrQueuePolicyTransition === true
    && raw.performance?.queueAndBackpressure?.maxQueuedBytes === 0
    && raw.performance?.queueAndBackpressure?.maxQueuedMessages === 0;
  if (!raw.correctness?.noClientErrors || !zeroRecovery || !noQueueTransition || !cleanup.passed) {
    throw new Error("observed screen health facts changed");
  }
  if (raw.cadence?.configuredPublicationHz !== 10
      || raw.cadence?.minimumAuthorityAcceptedPairsPerSecond !== 20
      || raw.correctness?.authorityReceiverCountDeltaAtMostOnePerClient !== false) {
    throw new Error("expected two-wire logical-pair instrumentation limitation is absent");
  }
  const reverts = proveRevertChronology();
  return Object.freeze({
    schema: "lbh-split-public-fragment-terminal-negative-v1",
    status: "rejected-reverted",
    decision: "eight-player-v0.4-closed-cap-four",
    artifact: checksums,
    screen: Object.freeze({ commit: run.commit, population: 8, warmupMs: run.config.warmupMs,
      measurementMs: run.config.windowMs, overload: "NORMAL", receiverCadenceHz: receiverHz,
      projectionPublishP95Ms: p95Ms, declaredAbortWhenP95MsAbove: ABORT_P95_MS,
      thresholdProvenance: "operator-provided pre-screen orchestration contract; not encoded in the raw artifact",
      independentlyCrossedAbortGate: true, authorityOneCoreFraction: authorityCore,
      worstRecipientMeanDownlinkBytesPerSecond: worstMeanBps,
      oneSecondRecipientWindowP95BytesPerSecond: recipientWindowP95Bps,
      observedNoQueueTransition: true, observedNoRecoveryRequest: true,
      observedNoClientError: true, cleanupPassed: true }),
    instrumentationLimitation: proveInstrumentationLimitation(),
    claimBoundary: Object.freeze({
      semanticAndPrivacyClaims: "focused prototype tests only",
      redTeamDisposition: "High retention, mutable Buffer ownership, delta-schema/privacy, and queue-coalescing recovery risks were unshipped prototype risks; no exploit or leak was observed.",
      sealedTwentySecondCaptureRan: false,
      hostedFleetWanOrHighCountClaim: false,
    }),
    topology: Object.freeze({ logicalGameplayAuthoritiesPerMatch: 1,
      concurrentMatchesMultiplyIsolatedAuthorities: true }),
    nextPhase: "hosted identity placement cost and unit economics",
    liveSource: proveLiveSourceAbsence(),
    chronology: reverts.chronology,
    revertProof: reverts,
    provenance: Object.freeze({ branch: git("branch", "--show-current"), head: git("rev-parse", "HEAD") }),
  });
}

function main() {
  process.stdout.write(`${JSON.stringify(buildTerminalNegative(), null, 2)}\n`);
}

if (require.main === module) main();
module.exports = { ABORT_P95_MS, CAPABILITY, COMMITS, EXPECTED_COMPOSITE_SHA256,
  PRE_PROTOTYPE_BASELINE, REMOVED_FILES, REVERT_PAIRS, buildTerminalNegative };
