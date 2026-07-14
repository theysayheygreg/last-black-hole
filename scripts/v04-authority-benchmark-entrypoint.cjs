#!/usr/bin/env node
"use strict";

const { spawn, spawnSync } = require("child_process");
const fs = require("fs");
const path = require("path");

const AUTHORITY_ENV = Object.freeze({
  LBH_SIM_WS_ENABLED: "true",
  LBH_SIM_WS_JSON_V2: "true",
  LBH_SIM_WS_STATE_PAIR_V1: "true",
  LBH_SIM_WS_STATE_PAIR_MIXED_V1: "true",
  LBH_SIM_WS_RUNTIME_PUBLIC_COMPONENTS_V1: "true",
  LBH_SIM_WS_POSITIONAL_JSON_V1: "true",
  LBH_SIM_WS_STATE_PAIR_BINARY_V1: "false",
  LBH_SIM_WS_STATE_PAIR_COMPRESSION_V1: "true",
  LBH_SIM_WS_STATE_PAIR_PUBLIC_BODY_V1: "false",
  LBH_SIM_WS_STATE_PAIR_PREPARED_PUBLIC_SOURCE_V1: "false",
  LBH_SIM_KEEP_ALIVE: "true",
});

function fail(message) {
  console.error(`[v04-benchmark] ${message}`);
  process.exit(78);
}

function exact(name, expected) {
  if (String(process.env[name] || "") !== expected) fail(`${name} must equal ${expected}`);
}

function collectorReady(name, args, execute = spawnSync) {
  const probe = execute(name, args, {
    encoding: "utf8",
    timeout: 5_000,
    stdio: ["ignore", "pipe", "pipe"],
  });
  return probe?.status === 0 && !probe?.error;
}

function requireCollector(name, args) {
  if (!collectorReady(name, args)) fail(`required collector cannot execute: ${name}`);
}

function main() {
  exact("LBH_BENCH_PROTOCOL", "s20-v1+brotli-q1");
  exact("LBH_BENCH_AUTHORITY_PROCESSES", "1");
  exact("LBH_BENCH_MAX_SEATS", "4");
  exact("LBH_BENCH_RETRIES", "0");
  exact("HOST", "0.0.0.0");

  const port = Number(process.env.PORT);
  if (!Number.isInteger(port) || port < 1 || port > 65535) fail("PORT must be a valid TCP port");
  if (process.versions.node.split(".")[0] !== "22") fail("Node 22 is required");
  if (process.platform !== "linux" || !fs.existsSync("/proc/self/stat") || !fs.existsSync("/proc/self/cgroup")) {
    fail("Linux process and cgroup counters are required");
  }
  requireCollector("ss", ["--version"]);
  // Listing capture interfaces is non-destructive, but exercises the exact
  // packet-capture capability that a mere PATH or --version probe misses.
  requireCollector("tcpdump", ["-D"]);

  const collectorAttestation = process.env.LBH_BENCH_COLLECTOR_ATTESTATION_PATH;
  if (!collectorAttestation || !path.isAbsolute(collectorAttestation) || !fs.existsSync(collectorAttestation)) {
    fail("an absolute collector attestation path is required");
  }
  let attestation;
  try { attestation = JSON.parse(fs.readFileSync(collectorAttestation, "utf8")); } catch { fail("collector attestation is invalid"); }
  if (attestation.perConnectionSocketBytes !== true || attestation.perConnectionOnWireBytes !== true
    || attestation.connectionTupleSeparation !== true) {
    fail("per-connection socket/on-wire capture and tuple separation must be attested");
  }

  // Hosted evidence must exercise production runtime guards. Application-byte
  // accounting is collected by the four isolated client processes; the
  // authority's internal replication ledger is intentionally test-only.
  Object.assign(process.env, AUTHORITY_ENV);

  const child = spawn(process.execPath, [
    path.join(__dirname, "sim-runtime.cjs"),
    "--host", "0.0.0.0",
    "--port", String(port),
    "--keep-alive", "true",
    "--label", "lbh-v04-s20-authority",
    "--sim-instance-id", String(process.env.LBH_SIM_INSTANCE_ID || "v04-benchmark-authority-1"),
  ], { stdio: "inherit", env: process.env });

  for (const signal of ["SIGTERM", "SIGINT"]) process.on(signal, () => child.kill(signal));
  child.on("error", (error) => fail(`authority failed to start: ${error.message}`));
  child.on("exit", (code, signal) => process.exitCode = signal ? 1 : (code ?? 1));
}

if (require.main === module) main();

module.exports = { AUTHORITY_ENV, collectorReady, main };
