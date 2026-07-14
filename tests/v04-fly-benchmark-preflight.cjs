#!/usr/bin/env node
"use strict";

const assert = require("assert");
const crypto = require("crypto");
const fs = require("fs");
const os = require("os");
const path = require("path");
const {
  BRANCH,
  PROTOCOL,
  evaluatePreflight,
  findSecretLeaks,
  stableS20Hash,
} = require("../scripts/v04-fly-benchmark-preflight.cjs");

const ROOT = path.resolve(__dirname, "..");
let passed = 0;
let failed = 0;

function test(name, fn) {
  try { fn(); passed += 1; console.log(`PASS ${name}`); }
  catch (error) { failed += 1; console.error(`FAIL ${name}: ${error.stack || error.message}`); }
}

function fixture(overrides = {}) {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), "lbh-v04-fly-preflight-"));
  const evidence = path.join(temp, "evidence");
  fs.mkdirSync(evidence);
  const pair = crypto.generateKeyPairSync("ed25519");
  const publicKey = path.join(temp, "capture-public.pem");
  fs.writeFileSync(publicKey, pair.publicKey.export({ type: "spki", format: "pem" }));
  const attestation = path.join(temp, "collectors.json");
  fs.writeFileSync(attestation, JSON.stringify({ perConnectionSocketBytes: true, perConnectionOnWireBytes: true,
    connectionTupleSeparation: true }));
  const env = {
    PATH: process.env.PATH,
    LBH_BENCH_ARTIFACT_SHA256: `sha256:${"a".repeat(64)}`,
    LBH_BENCH_S20_SOURCE_SHA256: stableS20Hash(ROOT),
    LBH_BENCH_PROTOCOL: PROTOCOL,
    LBH_BENCH_AUTHORITY_PROCESSES: "1",
    LBH_BENCH_MAX_SEATS: "4",
    LBH_BENCH_RETRIES: "0",
    LBH_BENCH_HOST_CLASS: "performance-1x",
    LBH_BENCH_APP: "lbh-v04-benchmark",
    LBH_BENCH_ORG: "lbh-benchmark-org",
    LBH_BENCH_REGION: "iad",
    LBH_BENCH_INVOICE_REF: "fly-rate-card-2026-07",
    LBH_BENCH_CURRENCY: "USD",
    LBH_BENCH_COMPUTE_RATE: "0.0000164/us",
    LBH_BENCH_EGRESS_RATE: "0.02/gb",
    LBH_BENCH_INVOICE_OBSERVED: "false",
    LBH_BENCH_RUN_ID: "run-one-shot-001",
    LBH_BENCH_CLIENT_ORIGINS_JSON: JSON.stringify([1, 2, 3, 4].map((n) => ({ alias: `client-${n}`, origin: `https://client-${n}.example` }))),
    LBH_BENCH_FIFTH_PROBE_ORIGIN: "https://client-5.example",
    LBH_BENCH_SIGNER_PUBLIC_KEY_PATH: publicKey,
    LBH_BENCH_EVIDENCE_DIR: evidence,
    LBH_BENCH_COLLECTOR_ATTESTATION_PATH: attestation,
    ...overrides.env,
  };
  return {
    root: ROOT,
    env,
    platform: overrides.platform || "linux",
    procAvailable: Object.hasOwn(overrides, "procAvailable") ? overrides.procAvailable : true,
    nodeVersion: "22.22.0",
    git: { branch: BRANCH, commit: "b".repeat(40), status: "", ...overrides.git },
    executables: { flyctl: true, ss: true, tcpdump: true, tshark: false, bpftool: false, ...overrides.executables },
    flyAuth: Object.hasOwn(overrides, "flyAuth") ? overrides.flyAuth : "benchmark@example.invalid",
  };
}

function has(result, blocker) { assert(result.blockers.includes(blocker), `expected ${blocker}: ${JSON.stringify(result.blockers)}`); }

test("accepts a complete deterministic package preflight without claiming evidence", () => {
  const result = evaluatePreflight(fixture());
  assert.strictEqual(result.status, "READY_FOR_ONE_SHOT");
  assert.strictEqual(result.admissionEligible, false);
  assert.strictEqual(result.bindings.s20SourceSha256, `sha256:${stableS20Hash(ROOT)}`);
});

test("rejects a dirty tree and wrong branch", () => {
  const result = evaluatePreflight(fixture({ git: { branch: "main", status: " M src/nope.js" } }));
  has(result, "WRONG_BRANCH"); has(result, "DIRTY_TREE");
});

test("reports AUTH_REQUIRED in check-only state", () => {
  const result = evaluatePreflight(fixture({ flyAuth: null }));
  has(result, "AUTH_REQUIRED");
  assert.strictEqual(result.checks.find((entry) => entry.id === "fly-auth").detail, "AUTH_REQUIRED");
});

test("rejects missing OS, socket, and on-wire collectors", () => {
  const result = evaluatePreflight(fixture({ platform: "darwin", procAvailable: false,
    executables: { ss: false, tcpdump: false, tshark: false, bpftool: false } }));
  has(result, "PROCESS_CGROUP_COLLECTOR_REQUIRED"); has(result, "SOCKET_COLLECTOR_REQUIRED"); has(result, "ON_WIRE_COLLECTOR_REQUIRED");
});

test("rejects absent per-connection capture attestation", () => {
  const value = fixture();
  value.env.LBH_BENCH_COLLECTOR_ATTESTATION_PATH = "/does/not/exist";
  has(evaluatePreflight(value), "PER_CONNECTION_CAPTURE_REQUIRED");
});

test("rejects missing or non-isolated four-client input and fifth probe", () => {
  const result = evaluatePreflight(fixture({ env: { LBH_BENCH_CLIENT_ORIGINS_JSON: "[]", LBH_BENCH_FIFTH_PROBE_ORIGIN: "" } }));
  has(result, "FOUR_CLIENT_ORIGINS_REQUIRED"); has(result, "FIFTH_REJECTION_PROBE_REQUIRED");
});

test("rejects absent or non-Ed25519 signer", () => {
  const result = evaluatePreflight(fixture({ env: { LBH_BENCH_SIGNER_PUBLIC_KEY_PATH: "" } }));
  has(result, "ED25519_SIGNER_REQUIRED");
});

test("rejects shared/non-performance host class", () => {
  has(evaluatePreflight(fixture({ env: { LBH_BENCH_HOST_CLASS: "shared-cpu-1x" } })), "PERFORMANCE_HOST_REQUIRED");
});

test("rejects retries and eight-seat configuration", () => {
  const result = evaluatePreflight(fixture({ env: { LBH_BENCH_RETRIES: "1", LBH_BENCH_MAX_SEATS: "8" } }));
  has(result, "RETRIES_FORBIDDEN"); has(result, "EIGHT_SEATS_FORBIDDEN");
});

test("rejects a reused final-run directory", () => {
  const value = fixture();
  fs.mkdirSync(path.join(value.env.LBH_BENCH_EVIDENCE_DIR, value.env.LBH_BENCH_RUN_ID));
  has(evaluatePreflight(value), "FINAL_RUN_ALREADY_EXISTS");
});

test("detects secret leakage patterns without echoing secret material", () => {
  const leaks = findSecretLeaks({ image: "Authorization: Bearer abcdefghijklmnop", evidence: "safe public metadata" });
  assert.deepStrictEqual(leaks, ["image"]);
  assert(!JSON.stringify(leaks).includes("abcdefghijklmnop"));
});

test("rejects an artifact or S20 source mismatch", () => {
  const result = evaluatePreflight(fixture({ env: { LBH_BENCH_ARTIFACT_SHA256: "latest", LBH_BENCH_S20_SOURCE_SHA256: "0".repeat(64) } }));
  has(result, "ARTIFACT_DIGEST_REQUIRED"); has(result, "S20_SOURCE_MISMATCH");
});

test("package pins Node 22, one performance authority, four seats, and no restart", () => {
  const docker = fs.readFileSync(path.join(ROOT, "Dockerfile.v04-benchmark"), "utf8");
  const fly = fs.readFileSync(path.join(ROOT, "deploy/fly/v04-authority-benchmark.toml"), "utf8");
  assert.match(docker, /^FROM node:22\.22\.0-bookworm-slim/m);
  assert.match(docker, /LBH_BENCH_AUTHORITY_PROCESSES=1/);
  assert.match(docker, /LBH_BENCH_MAX_SEATS=4/);
  assert.match(fly, /cpu_kind = "performance"/);
  assert.match(fly, /\[\[restart\]\][\s\S]*?policy = "no"/);
  assert.doesNotMatch(fly, /LBH_BENCH_MAX_SEATS = "8"/);
});

console.log(`\n${passed} passed, ${failed} failed`);
if (failed) process.exitCode = 1;
