#!/usr/bin/env node
"use strict";

const crypto = require("crypto");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { execFileSync } = require("child_process");

const ROOT = path.resolve(__dirname, "..");
const BRANCH = "codex/v0.4-multiplayer-architecture";
const PROTOCOL = "s20-v1+brotli-q1";
const SCHEMA = "lbh-v04-fly-benchmark-preflight-v1";
const S20_FILES = [
  "scripts/client-delta-receiver.cjs",
  "scripts/sim-runtime.cjs",
  "scripts/sim-ws-adapter.cjs",
  "scripts/state-pair-compression-codec.cjs",
  "scripts/state-pair-positional-codec.cjs",
];
const SECRET_VALUE = /(?:-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----|\bBearer\s+[A-Za-z0-9._~+/=-]{8,}|\b(?:api[_-]?key|access[_-]?token|password)\s*[:=]\s*[^\s#]+)/i;

function sha256(value) { return crypto.createHash("sha256").update(value).digest("hex"); }
function stableS20Hash(root = ROOT) {
  const hash = crypto.createHash("sha256");
  for (const relative of S20_FILES) {
    hash.update(`${relative}\0`);
    hash.update(fs.readFileSync(path.join(root, relative)));
    hash.update("\0");
  }
  return hash.digest("hex");
}

function findSecretLeaks(values) {
  const findings = [];
  for (const [label, value] of Object.entries(values || {})) {
    if (SECRET_VALUE.test(String(value || ""))) findings.push(label);
  }
  return findings;
}

function run(command, args, cwd, execute = execFileSync) {
  try { return String(execute(command, args, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] })).trim(); }
  catch { return null; }
}

function hasExecutable(name, env = process.env) {
  return String(env.PATH || "").split(path.delimiter).some((directory) => {
    try { fs.accessSync(path.join(directory, name), fs.constants.X_OK); return true; } catch { return false; }
  });
}

function parseClients(raw) {
  let clients;
  try { clients = JSON.parse(raw || ""); } catch { return null; }
  if (!Array.isArray(clients) || clients.length !== 4) return null;
  const aliases = clients.map((entry) => entry?.alias);
  const origins = clients.map((entry) => entry?.origin);
  if (aliases.join(",") !== "client-1,client-2,client-3,client-4") return null;
  if (new Set(origins).size !== 4 || origins.some((origin) => !/^https:\/\/[^\s/]+/i.test(origin || ""))) return null;
  return clients.map(({ alias, origin }) => ({ alias, origin }));
}

function signerFingerprint(file) {
  try {
    const key = crypto.createPublicKey(fs.readFileSync(file));
    if (key.asymmetricKeyType !== "ed25519") return null;
    return `sha256:${sha256(key.export({ type: "spki", format: "der" }))}`;
  } catch { return null; }
}

function evaluatePreflight(options = {}) {
  const root = options.root || ROOT;
  const env = { ...process.env, ...(options.env || {}) };
  const execute = options.execFileSync || execFileSync;
  const platform = options.platform || process.platform;
  const checks = [];
  const add = (id, passed, detail, blocker = id.toUpperCase().replace(/-/g, "_")) => {
    checks.push({ id, passed: Boolean(passed), detail });
    return passed ? null : blocker;
  };
  const blockers = [];
  const block = (value) => { if (value && !blockers.includes(value)) blockers.push(value); };

  const branch = options.git?.branch ?? run("git", ["branch", "--show-current"], root, execute);
  const commit = options.git?.commit ?? run("git", ["rev-parse", "HEAD"], root, execute);
  const dirty = options.git?.status ?? run("git", ["status", "--porcelain", "--untracked-files=normal"], root, execute);
  block(add("branch", branch === BRANCH, branch || "unavailable", "WRONG_BRANCH"));
  block(add("clean-tree", dirty === "", dirty === "" ? "clean" : "tracked or untracked changes present", "DIRTY_TREE"));
  block(add("immutable-commit", /^[a-f0-9]{40}$/.test(commit || ""), commit || "unavailable", "GIT_COMMIT_REQUIRED"));
  block(add("node-22", (options.nodeVersion || process.versions.node).split(".")[0] === "22",
    options.nodeVersion || process.versions.node, "NODE_22_REQUIRED"));

  const artifact = env.LBH_BENCH_ARTIFACT_SHA256 || "";
  block(add("artifact-digest", /^sha256:[a-f0-9]{64}$/.test(artifact), artifact ? "supplied" : "missing", "ARTIFACT_DIGEST_REQUIRED"));
  const sourceHash = stableS20Hash(root);
  block(add("s20-source-binding", !env.LBH_BENCH_S20_SOURCE_SHA256 || env.LBH_BENCH_S20_SOURCE_SHA256 === sourceHash,
    `sha256:${sourceHash}`, "S20_SOURCE_MISMATCH"));

  block(add("protocol-s20", env.LBH_BENCH_PROTOCOL === PROTOCOL, env.LBH_BENCH_PROTOCOL || "missing", "S20_ONLY_REQUIRED"));
  block(add("one-authority", env.LBH_BENCH_AUTHORITY_PROCESSES === "1", env.LBH_BENCH_AUTHORITY_PROCESSES || "missing", "ONE_AUTHORITY_REQUIRED"));
  block(add("four-seat-cap", env.LBH_BENCH_MAX_SEATS === "4", env.LBH_BENCH_MAX_SEATS || "missing",
    env.LBH_BENCH_MAX_SEATS === "8" ? "EIGHT_SEATS_FORBIDDEN" : "FOUR_SEAT_CAP_REQUIRED"));
  block(add("zero-retries", env.LBH_BENCH_RETRIES === "0", env.LBH_BENCH_RETRIES || "missing", "RETRIES_FORBIDDEN"));
  block(add("performance-host", /^performance(?:-[1-9][0-9]*x)?$/i.test(env.LBH_BENCH_HOST_CLASS || ""),
    env.LBH_BENCH_HOST_CLASS || "missing", "PERFORMANCE_HOST_REQUIRED"));

  for (const name of ["LBH_BENCH_APP", "LBH_BENCH_ORG", "LBH_BENCH_REGION", "LBH_BENCH_INVOICE_REF",
    "LBH_BENCH_CURRENCY", "LBH_BENCH_COMPUTE_RATE", "LBH_BENCH_EGRESS_RATE", "LBH_BENCH_INVOICE_OBSERVED",
    "LBH_BENCH_RUN_ID"]) {
    block(add(`metadata-${name.toLowerCase()}`, Boolean(env[name]) && !String(env[name]).startsWith("REPLACE_"),
      env[name] ? "supplied" : "missing", "EXECUTION_METADATA_REQUIRED"));
  }
  block(add("invoice-observed-boolean", ["true", "false"].includes(env.LBH_BENCH_INVOICE_OBSERVED),
    env.LBH_BENCH_INVOICE_OBSERVED || "missing", "INVOICE_METADATA_REQUIRED"));

  const clients = parseClients(env.LBH_BENCH_CLIENT_ORIGINS_JSON);
  block(add("four-isolated-clients", Boolean(clients), clients ? clients.map((entry) => entry.alias).join(",") : "missing or invalid",
    "FOUR_CLIENT_ORIGINS_REQUIRED"));
  block(add("fifth-rejection-probe", /^https:\/\/[^\s/]+/i.test(env.LBH_BENCH_FIFTH_PROBE_ORIGIN || ""),
    env.LBH_BENCH_FIFTH_PROBE_ORIGIN ? "supplied" : "missing", "FIFTH_REJECTION_PROBE_REQUIRED"));

  const signerPath = env.LBH_BENCH_SIGNER_PUBLIC_KEY_PATH || "";
  const fingerprint = signerPath && path.isAbsolute(signerPath) ? signerFingerprint(signerPath) : null;
  block(add("ed25519-signer", Boolean(fingerprint), fingerprint || "missing/invalid", "ED25519_SIGNER_REQUIRED"));

  const evidenceDir = env.LBH_BENCH_EVIDENCE_DIR || "";
  const outputOkay = path.isAbsolute(evidenceDir) && fs.existsSync(evidenceDir);
  block(add("evidence-output-mount", outputOkay, outputOkay ? evidenceDir : "missing absolute existing directory", "EVIDENCE_MOUNT_REQUIRED"));
  const runDir = outputOkay && env.LBH_BENCH_RUN_ID ? path.join(evidenceDir, env.LBH_BENCH_RUN_ID) : null;
  block(add("unused-final-run-id", Boolean(runDir) && !fs.existsSync(runDir), runDir || "unavailable", "FINAL_RUN_ALREADY_EXISTS"));

  const proc = options.procAvailable ?? (platform === "linux" && fs.existsSync("/proc/self/stat") && fs.existsSync("/proc/self/cgroup"));
  block(add("process-cgroup-collectors", proc, proc ? "available" : "Linux /proc and cgroup required", "PROCESS_CGROUP_COLLECTOR_REQUIRED"));
  const ss = (options.executables || {}).ss ?? hasExecutable("ss", env);
  const tcpdump = (options.executables || {}).tcpdump ?? hasExecutable("tcpdump", env);
  const tshark = (options.executables || {}).tshark ?? hasExecutable("tshark", env);
  const bpftool = (options.executables || {}).bpftool ?? hasExecutable("bpftool", env);
  block(add("socket-collector", ss, ss ? "ss" : "missing ss", "SOCKET_COLLECTOR_REQUIRED"));
  block(add("on-wire-collector", tcpdump || tshark || bpftool, tcpdump ? "tcpdump" : tshark ? "tshark" : bpftool ? "bpftool" : "missing",
    "ON_WIRE_COLLECTOR_REQUIRED"));

  let attestation = null;
  try { attestation = JSON.parse(fs.readFileSync(env.LBH_BENCH_COLLECTOR_ATTESTATION_PATH || "", "utf8")); } catch {}
  const separated = attestation?.perConnectionSocketBytes === true && attestation?.perConnectionOnWireBytes === true
    && attestation?.connectionTupleSeparation === true;
  block(add("per-connection-capture", separated, separated ? "attested" : "missing/invalid attestation",
    "PER_CONNECTION_CAPTURE_REQUIRED"));

  const packageFiles = ["Dockerfile.v04-benchmark", "deploy/fly/v04-authority-benchmark.toml"];
  const leaks = findSecretLeaks(Object.fromEntries(packageFiles.map((file) => [file, fs.readFileSync(path.join(root, file), "utf8")])));
  block(add("no-packaged-secrets", leaks.length === 0, leaks.length ? leaks.join(",") : "clean", "SECRET_LEAKAGE"));

  const fly = (options.executables || {}).flyctl ?? hasExecutable("flyctl", env);
  const auth = options.flyAuth ?? (fly ? run("flyctl", ["auth", "whoami"], root, execute) : null);
  block(add("fly-auth", Boolean(auth), auth ? "authenticated" : "AUTH_REQUIRED", "AUTH_REQUIRED"));

  return {
    schema: SCHEMA,
    status: blockers.length ? "BLOCKED" : "READY_FOR_ONE_SHOT",
    admissionEligible: false,
    blockers,
    checks,
    bindings: { branch, commit, artifactSha256: artifact || null, s20SourceSha256: `sha256:${sourceHash}`, signerKeyFingerprint: fingerprint },
    externalInputs: { clients: clients?.map((entry) => entry.alias) || [], fifthRejectionProbe: Boolean(env.LBH_BENCH_FIFTH_PROBE_ORIGIN) },
    note: "Preflight readiness is not benchmark evidence and does not authorize deployment or retry.",
  };
}

function main() {
  const checkOnly = process.argv.includes("--check-only");
  if (!checkOnly) {
    console.error("Refusing implicit execution. Run with --check-only; deployment and one-shot capture require separate authorization.");
    process.exit(64);
  }
  const result = evaluatePreflight();
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  // A check-only diagnostic is safe and scriptable even when auth/inputs are intentionally absent.
  process.exitCode = 0;
}

if (require.main === module) main();
module.exports = { BRANCH, PROTOCOL, SCHEMA, S20_FILES, evaluatePreflight, findSecretLeaks, parseClients, signerFingerprint, stableS20Hash };
