#!/usr/bin/env node
"use strict";

const crypto = require("crypto");
const fs = require("fs");
const net = require("net");
const os = require("os");
const path = require("path");
const { execFileSync } = require("child_process");
const { compileSoakSchedule } = require("./network/soak-schedule.cjs");
const { runEightPlayerSoak, writeExclusive } = require("./network/eight-player-soak-cohort.cjs");

const ROOT = path.resolve(__dirname, "..");
const fixturePath = path.join(__dirname, "fixtures/multiplayer-soak/pr-smoke-v1.json");
const fixtureRaw = fs.readFileSync(fixturePath, "utf8");
const fixture = Object.freeze(JSON.parse(fixtureRaw));
const schedule = compileSoakSchedule(fixture);
const stamp = new Date().toISOString().replace(/[:.]/g, "");
const runDir = path.join(__dirname, "screenshots", `multiplayer-soak-${stamp}-pr-smoke-${fixture.rootSeed.replace("0x", "")}-${schedule.scheduleHash.slice(0, 12)}`);
fs.mkdirSync(runDir, { recursive: false });

async function freePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const port = server.address().port;
      server.close((error) => error ? reject(error) : resolve(port));
    });
  });
}

function directoryBytes(directory) {
  return fs.readdirSync(directory).reduce((sum, name) => sum + fs.statSync(path.join(directory, name)).size, 0);
}

function sanitizeTerminalCause(value) {
  return String(value || "")
    .replace(/"(?:commandCredential|admissionTicket|resumeTicket|ticket|profileId|membershipId|playerId|connectionId|currentRunId|runId|equipped|inventory)"\s*:\s*(?:"[^"]*"|null|\[[^\]]*\]|\{[^}]*\})/g,
      '"redacted":"[redacted]"')
    .replace(/soak-secret-[\w-]+|Soak Rig \d+|Soak Seat \d+/g, "[redacted-marker]");
}

async function main() {
  let interruptedSignal = null;
  const interrupt = (signal) => { interruptedSignal ||= signal; };
  process.once("SIGINT", interrupt.bind(null, "SIGINT"));
  process.once("SIGTERM", interrupt.bind(null, "SIGTERM"));
  const commit = execFileSync("git", ["rev-parse", "HEAD"], { cwd: ROOT, encoding: "utf8" }).trim();
  const dirty = execFileSync("git", ["status", "--porcelain"], { cwd: ROOT, encoding: "utf8" }).trim().length > 0;
  const allowDirty = process.env.LBH_SOAK_ALLOW_DIRTY === "1";
  const timeScale = Number(process.env.LBH_SOAK_TIME_SCALE || 1);
  let failure = dirty && !allowDirty ? "PR-smoke evidence requires clean HEAD; LBH_SOAK_ALLOW_DIRTY=1 is diagnostic-only" : null;
  if (!Number.isFinite(timeScale) || timeScale <= 0 || timeScale > 1) throw new Error("LBH_SOAK_TIME_SCALE must be in (0,1]");
  const port = await freePort();
  writeExclusive(path.join(runDir, "manifest.json"), {
    schemaVersion: 1, profile: "pr-smoke", evidenceClass: "local-raw-websocket-eight-player-pr-smoke",
    generatedAt: new Date().toISOString(), commit, dirty, diagnosticOnly: dirty || timeScale !== 1,
    fixtureHash: crypto.createHash("sha256").update(fixtureRaw).digest("hex"),
    scenarioVersion: fixture.scenarioVersion, rootSeed: fixture.rootSeed, scheduleHash: schedule.scheduleHash,
    topology: { matches: 1, logicalSingleWriterAuthoritiesPerMatch: 1, clients: 8 },
    runtime: { node: process.version, platform: process.platform, arch: process.arch, osRelease: os.release() },
    processOwnership: { authorityPort: port, loopbackOnly: true },
    claimBoundary: "Six-minute local raw-WebSocket machinery smoke only; not long-duration, leak, WAN, packet, browser, WSS, TLS-edge, hosted, or 24/48/96 capacity evidence",
  });
  writeExclusive(path.join(runDir, "schedule.json"), schedule);
  let result = null;
  if (!failure) {
    result = await runEightPlayerSoak({ fixture, schedule, runDir, port, commit, dirty, timeScale,
      aborted: () => interruptedSignal });
    failure = result.failure;
  } else {
    for (const name of ["authority-health", "runtime-windows", "client-ledger", "membership-ledger", "reliable-ledger",
      "schedule-execution", "forced-gc", "diagnostics-cleanup", "authority-resources"]) {
      fs.writeFileSync(path.join(runDir, `${name}.jsonl`), "", { flag: "wx" });
    }
  }
  const terminalFailures = failure ? [sanitizeTerminalCause(failure)] : [];
  const allowedHttp = /^(GET \/health|POST \/(?:session\/start|join|leave|multiplayer\/ticket|inventory\/action)) 200$/;
  if (result && Object.keys(result.httpAccounting).some((key) => !allowedHttp.test(key))) {
    terminalFailures.push("unknown, debug, or non-200 HTTP route observed");
  }
  const expectedHttp = { "POST /session/start 200": 1, "POST /join 200": 9,
    "POST /multiplayer/ticket 200": 11, "POST /inventory/action 200": 2, "POST /leave 200": 9 };
  if (result && Object.entries(expectedHttp).some(([key, count]) => result.httpAccounting[key] !== count)) {
    terminalFailures.push(sanitizeTerminalCause(`HTTP cardinality mismatch: ${JSON.stringify(result.httpAccounting)}`));
  }
  if (result) writeExclusive(path.join(runDir, "cleanup.json"), result.cleanup);
  else writeExclusive(path.join(runDir, "cleanup.json"), { passed: false, reason: "run not started" });
  const logPath = path.join(ROOT, "tmp", `sim-server-${port}.log`);
  const log = fs.existsSync(logPath) ? fs.readFileSync(logPath, "utf8") : "";
  const redactedLog = log.replace(/"(?:sessionId|runId|clientId|hostClientId|requesterId|profileId|playerId|membershipId|name)":(?:"[^"]*"|null)/g,
    (match) => `"redactedIdentity":"${crypto.createHash("sha256").update(match).digest("hex")}"`);
  const tail = Buffer.from(redactedLog).subarray(Math.max(0, Buffer.byteLength(redactedLog) - fixture.evidence.maxStdoutStderrBytes));
  fs.writeFileSync(path.join(runDir, "stdout-tail.txt"), tail, { flag: "wx" });
  fs.writeFileSync(path.join(runDir, "stderr-tail.txt"), "", { flag: "wx" });
  const forbidden = /"(?:commandCredential|admissionTicket|resumeTicket|ticket|profileId|membershipId|playerId|connectionId|currentRunId|runId|equipped|inventory)"\s*:/;
  const secretMarker = /soak-secret-|Soak Rig|Soak Seat/;
  const scanned = [];
  for (const name of fs.readdirSync(runDir).filter((entry) => /\.(?:jsonl?|txt)$/.test(entry))) {
    const text = fs.readFileSync(path.join(runDir, name), "utf8");
    scanned.push({ name, bytes: Buffer.byteLength(text), records: name.endsWith(".jsonl") ? text.split("\n").filter(Boolean).length : 1 });
    if (forbidden.test(text) || secretMarker.test(text)) terminalFailures.push(`privacy scan rejected ${name}`);
  }
  const bytesBeforeBounds = directoryBytes(runDir);
  const buildTerminal = () => {
    failure = [...new Set(terminalFailures)].join("\n---\n") || null;
    const status = failure ? (failure.includes("ABORTED_BY_SIG") ? "ABORTED" : "FAIL") : "PASS";
    const summary = { status, passed: !failure && result?.passed === true,
      failure, scheduleHash: schedule.scheduleHash, profile: fixture.profile,
      actionCount: result?.actionCount || 0, gates: result?.gates || {},
      limitations: ["NOT long-duration or leak evidence", "NOT packet/browser/WAN/WSS/TLS-edge/hosted evidence",
        "Heap slope, RSS slope, GC duty, and long-window recovery are NOT_APPLICABLE_SHORT_RUN",
        "Forced-GC checkpoint minute and following minute are excluded from short-run performance gates",
        "Closed old/departed socket ACK writes are rejected locally; authority issued-only wrong-epoch retirement remains owned by accepted T2b"],
      localProviderSpendUsd: 0 };
    const error = { status: status === "PASS" ? "NONE" : status, firstCause: terminalFailures[0] || null,
      allCauses: [...new Set(terminalFailures)] };
    return { status, summary, error };
  };
  let terminal = buildTerminal();
  const bounds = { passed: terminal.status === "PASS", directoryBytesBeforeTerminal: bytesBeforeBounds,
    projectedFinalDirectoryBytes: 0, directoryCapBytes: fixture.evidence.maxArtifactBytes,
    jsonlCapBytes: fixture.evidence.maxJsonlBytes, jsonlRecordCap: fixture.evidence.maxJsonlRecords,
    stdoutStderrCapBytes: fixture.evidence.maxStdoutStderrBytes,
    forbiddenIdentityKeys: "absent", seededSecretMarkers: "absent", files: scanned,
    httpClassification: result?.httpAccounting || {} };
  const projectedSize = () => bytesBeforeBounds
    + Buffer.byteLength(`${JSON.stringify(bounds, null, 2)}\n`)
    + Buffer.byteLength(`${JSON.stringify(terminal.error, null, 2)}\n`)
    + Buffer.byteLength(`${JSON.stringify(terminal.summary, null, 2)}\n`);
  bounds.projectedFinalDirectoryBytes = projectedSize();
  bounds.projectedFinalDirectoryBytes = projectedSize();
  if (bounds.projectedFinalDirectoryBytes > fixture.evidence.maxArtifactBytes) {
    terminalFailures.push(`artifact directory would exceed ${fixture.evidence.maxArtifactBytes} bytes`);
    terminal = buildTerminal();
    bounds.passed = false;
    bounds.projectedFinalDirectoryBytes = projectedSize();
  }
  writeExclusive(path.join(runDir, "bounds-and-privacy.json"), bounds);
  writeExclusive(path.join(runDir, "error-or-abort.json"), terminal.error);
  writeExclusive(path.join(runDir, "summary.json"), terminal.summary);
  const finalBytes = directoryBytes(runDir);
  if (finalBytes !== bounds.projectedFinalDirectoryBytes) throw new Error("terminal artifact size projection was not exact");
  console.log(`Eight-player soak smoke artifact: ${runDir}`);
  console.log(`Schedule hash: ${schedule.scheduleHash}`);
  if (failure || !result?.passed) { console.error(failure || "smoke did not pass"); process.exitCode = 1; }
  else console.log("Six-minute eight-player PR smoke passed");
}

main().catch((error) => { console.error(error.stack || error.message); process.exitCode = 1; });
