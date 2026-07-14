#!/usr/bin/env node
"use strict";

const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");

const ROOT = path.resolve(__dirname, "..");
const RUNTIME = path.join(ROOT, "scripts", "sim-runtime.cjs");
const PROFILES = path.join(ROOT, "src", "content", "session-profiles.data.json");
const OUTPUT = path.join(ROOT, "docs", "v0.4", "evidence", "s24-live-loopback", "eligibility.json");
const RAW_OUTPUT = path.join(ROOT, "docs", "v0.4", "evidence", "s24-live-loopback", "raw.json");
const SEALED_PREFLIGHT_COMMIT = "eaaa811";
const REQUESTED_CLIENTS = 24;

function sha256(bytes) {
  return crypto.createHash("sha256").update(bytes).digest("hex");
}

function git(...args) {
  return execFileSync("git", args, { cwd: ROOT, encoding: "utf8" }).trim();
}

function inspectEligibility() {
  const runtime = fs.readFileSync(RUNTIME, "utf8");
  const profilesBytes = fs.readFileSync(PROFILES);
  const profiles = JSON.parse(profilesBytes);
  const binding = runtime.match(/createSimWebSocketAdapter\(\{[\s\S]*?maxConnections:\s*(\d+)\s*,[\s\S]*?\}\);/);
  if (!binding) throw new Error("could not prove runtime WebSocket connection cap");
  const maxConnections = Number(binding[1]);
  const deepFieldProfileId = profiles.MAP_SESSION_PROFILES["deep-field"];
  const deepField = profiles.SESSION_PROFILES[deepFieldProfileId];
  if (!deepField) throw new Error("could not resolve Deep Field session profile");
  const reasons = [];
  if (maxConnections < REQUESTED_CLIENTS) {
    reasons.push({ code: "adapter-connection-cap", requested: REQUESTED_CLIENTS,
      supported: maxConnections,
      detail: "The one match authority instantiates one WebSocket adapter capped below the requested simultaneous clients." });
  }
  if (deepField.maxScavengers < 48) {
    reasons.push({ code: "expensive-ai-vector-unavailable", requested: 48,
      supported: deepField.maxScavengers,
      detail: "The largest existing live profile cannot instantiate the requested 48-scavenger load." });
  }
  reasons.push({ code: "body-vector-unconfigured", requested: 400, supported: null,
    detail: "No authorized production-free runtime control instantiates an exact 400-dynamic-body H24 vector." });
  return {
    schema: "lbh-s24-live-loopback-eligibility-v1",
    eligible: false,
    rawRunConsumed: fs.existsSync(RAW_OUTPUT),
    decision: "stop-before-live-run",
    requested: { logicalGameplayWritersPerMatch: 1, matches: 1,
      isolatedClientProcesses: REQUESTED_CLIENTS, workers: 0,
      humanClients: 24, dynamicBodies: 400, expensiveAi: 48 },
    observedStaticRuntimeBoundary: {
      websocketAdapterMaxConnections: maxConnections,
      deepFieldProfile: deepFieldProfileId,
      deepFieldMaxScavengers: deepField.maxScavengers,
    },
    reasons,
    authorityBoundary: "One logical writer for this one match; concurrent matches would each own a separate writer.",
    requiredScopeExpansion: [
      "Raise or parameterize the live match adapter connection cap above 16.",
      "Add an evidence-only or product-approved live load vector for 400 bodies and 48 expensive AI.",
      "Re-review correctness, memory, and admission behavior before authorizing a fresh one-run capture.",
    ],
    provenance: {
      branch: git("branch", "--show-current"),
      commit: git("rev-parse", "HEAD"),
      sealedSyntheticPreflightCommit: SEALED_PREFLIGHT_COMMIT,
      runtime: { path: path.relative(ROOT, RUNTIME), sha256: sha256(Buffer.from(runtime)) },
      sessionProfiles: { path: path.relative(ROOT, PROFILES), sha256: sha256(profilesBytes) },
    },
  };
}

function main() {
  const result = inspectEligibility();
  if (process.argv.includes("--write")) {
    if (fs.existsSync(OUTPUT)) throw new Error(`refusing to overwrite ${OUTPUT}`);
    fs.mkdirSync(path.dirname(OUTPUT), { recursive: true });
    fs.writeFileSync(OUTPUT, `${JSON.stringify(result, null, 2)}\n`, { flag: "wx" });
  }
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
}

if (require.main === module) main();

module.exports = { OUTPUT, RAW_OUTPUT, REQUESTED_CLIENTS, SEALED_PREFLIGHT_COMMIT, inspectEligibility };
