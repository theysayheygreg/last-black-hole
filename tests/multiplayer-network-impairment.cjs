#!/usr/bin/env node
"use strict";

const crypto = require("crypto");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { execFileSync } = require("child_process");
const { findChrome } = require("./browser-driver.cjs");
const {
  compileDecisionBook,
  sha256,
  writeCompiledDecisionBook,
} = require("./network/browser-frame-impairment.cjs");
const { runBrowserCohort } = require("./network/multiplayer-browser-cohort.cjs");

const ROOT = path.resolve(__dirname, "..");
const fixtureFile = path.join(__dirname, "fixtures/network-impairment/phase2-browser-v1.json");
const fixtureRaw = fs.readFileSync(fixtureFile, "utf8");
const fixture = JSON.parse(fixtureRaw);
const scenarioId = process.env.LBH_IMPAIRMENT_SCENARIO || "F0-clean";
const scenario = fixture.scenarios[scenarioId];
if (!scenario) throw new Error(`Unknown impairment scenario ${scenarioId}`);
if (scenario.profile !== "pr-smoke") throw new Error("Browser impairment lane must run the pr-smoke profile");
const htmlTarget = process.argv[2] || "index-a.html";
const stamp = new Date().toISOString().replace(/[:.]/g, "");
const nonce = crypto.randomBytes(3).toString("hex");
const runDir = path.join(__dirname, "screenshots",
  `multiplayer-impairment-${stamp}-${scenarioId.toLowerCase()}-4p-${scenario.rootSeed.slice(2)}-${nonce}`);
fs.mkdirSync(runDir, { recursive: false });

const compiled = compileDecisionBook(fixture, scenarioId);
writeCompiledDecisionBook(path.join(runDir, "compiled-decisions.json"), compiled);
for (const file of ["server-frames.jsonl", "client-frames.jsonl", "clients.jsonl", "authority.jsonl", "browser-errors.jsonl"]) {
  fs.writeFileSync(path.join(runDir, file), "", { flag: "wx" });
}

const controller = new AbortController();
let receivedSignal = null;
const signalHandlers = new Map();
for (const name of ["SIGINT", "SIGTERM"]) {
  const handler = () => {
    receivedSignal = name;
    controller.abort(new Error(`received ${name}`));
  };
  signalHandlers.set(name, handler);
  process.once(name, handler);
}

async function main() {
  const commit = execFileSync("git", ["rev-parse", "HEAD"], { cwd: ROOT, encoding: "utf8" }).trim();
  const dirty = execFileSync("git", ["status", "--porcelain"], { cwd: ROOT, encoding: "utf8" }).trim().length > 0;
  const dirtyDiagnostic = dirty && process.env.LBH_IMPAIRMENT_ALLOW_DIRTY === "1";
  const source = fs.readFileSync(path.join(ROOT, "src/main.js"));
  if (sha256(source) !== fixture.mainSource.sha256) throw new Error("src/main.js no longer matches the response rewrite contract");
  const startedAt = new Date().toISOString();
  let result = null;
  let failure = dirty && !dirtyDiagnostic
    ? "Strict impairment evidence requires a clean HEAD; set LBH_IMPAIRMENT_ALLOW_DIRTY=1 for diagnostic-only runs"
    : null;
  try {
    if (!failure) {
      result = await runBrowserCohort({ fixture, compiled, scenarioId, runDir, htmlTarget: htmlTarget.split("?")[0],
        signal: controller.signal });
    }
  } catch (error) {
    failure = error.stack || error.message;
  } finally {
    for (const [name, handler] of signalHandlers) process.removeListener(name, handler);
  }
  const frameFile = path.join(runDir, "frame-decisions.jsonl");
  const combined = ["server-frames.jsonl", "client-frames.jsonl"]
    .map((file) => fs.readFileSync(path.join(runDir, file), "utf8")).join("");
  fs.writeFileSync(frameFile, combined, { flag: "wx" });
  const cleanup = fs.existsSync(path.join(runDir, "cleanup.json"))
    ? JSON.parse(fs.readFileSync(path.join(runDir, "cleanup.json"), "utf8")) : null;
  const partialResult = fs.existsSync(path.join(runDir, "partial-result.json"))
    ? JSON.parse(fs.readFileSync(path.join(runDir, "partial-result.json"), "utf8")) : null;
  const reportResult = result || (partialResult ? { partial: partialResult } : null);
  const chromeExecutable = findChrome();
  const chromeVersion = execFileSync(chromeExecutable, ["--version"], { encoding: "utf8" }).trim();
  const manifest = {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    startedAt,
    commit,
    dirty,
    diagnosticOnly: dirtyDiagnostic,
    scenarioVersion: fixture.scenarioVersion,
    scenarioSchemaHash: sha256(fixtureRaw),
    scenarioId,
    profile: scenario.profile,
    rootSeed: scenario.rootSeed,
    derivedSeeds: compiled.book.derivedSeeds,
    compiledDecisionHash: compiled.hash,
    claimBoundary: scenario.transport?.kind === "cdp-websocket-smoke"
      ? "CDP browser shaping/offline-gap PR smoke only; no claim CDP caused an observed socket close/reconnect, and not canonical duration, memory slope, TCP loss, netem, WAN, TLS, congestion, retransmission, receive-window, or hosted evidence"
      : scenario.transport?.kind === "managed-tcp-proxy"
        ? "Configured fixed userspace TCP-stream proxy latency/rate and observed browser/gameplay outcomes only; not packet loss/reorder, throughput accuracy, congestion, retransmission, receive-window, WAN, WSS, TLS, hosted, live throughput, queue depth, or connection-drain evidence"
      : scenario.transport?.kind === "managed-tcp-proxy-blackout"
        ? "Configured userspace timeout-zero stream discard, one-listener disable/re-enable fence, and observed browser/gameplay outcomes only; not packet loss, synchronous RST, live byte-counter, WAN, WSS, TLS, congestion, retransmission, or hosted evidence"
      : "application-frame PR smoke only; not canonical duration, memory slope, TCP, packet loss, WAN, TLS, or hosted evidence",
    duration: { warmupMs: scenario.warmupMs, activeMs: scenario.activeMs, recoveryMs: scenario.recoveryMs },
    transport: scenario.transport || null,
    gates: scenario.gates,
    runtime: {
      node: process.version,
      chromeExecutable,
      chromeVersion,
      platform: process.platform,
      arch: process.arch,
      osRelease: os.release(),
    },
    ports: reportResult?.partial
      ? { static: reportResult.partial.staticPort, sim: reportResult.partial.simPort,
        proxyControl: reportResult.partial.t1Proxy?.tool?.controlPort || null,
        proxyListeners: reportResult.partial.t1Proxy?.mappings?.map((entry) => entry.listenerPort) || null }
      : (reportResult ? { static: reportResult.staticPort, sim: reportResult.simPort,
        proxyControl: reportResult.t1ProxyTransport?.tool?.controlPort || null,
        proxyListeners: reportResult.t1ProxyTransport?.mappings?.map((entry) => entry.listenerPort) || null } : null),
    stableSlots: reportResult?.slotMap || reportResult?.partial?.slotMap || null,
    timelines: reportResult?.timelines || null,
    processes: reportResult?.processes || reportResult?.partial?.processes || null,
    profileDirectories: reportResult?.profileDirectories || reportResult?.partial?.profileDirectories || null,
    activation: {
      browser: reportResult?.activation || null,
      preloadInstalledForWrappedProcess: cleanup?.preloadInstalledForWrappedProcess ?? null,
      preloadAdapterWrappedOnce: cleanup?.preloadAdapterWrappedOnce ?? null,
    },
    tcpProxy: reportResult?.f5ProxyTransport || reportResult?.t1ProxyTransport || reportResult?.partial?.t1Proxy || null,
    receivedSignal,
  };
  fs.writeFileSync(path.join(runDir, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`, { flag: "wx" });
  const forbiddenKeyPattern = /"(?:commandCredential|admissionTicket|resumeTicket|profileId|membershipId)"\s*:/;
  for (const file of fs.readdirSync(runDir).filter((name) => /\.(?:json|jsonl|log)$/.test(name))) {
    const content = fs.readFileSync(path.join(runDir, file), "utf8");
    if (forbiddenKeyPattern.test(content)) {
      failure ||= `Evidence privacy scan rejected ${file}`;
      break;
    }
  }
  fs.writeFileSync(path.join(runDir, "first-failure.json"), `${JSON.stringify({ failure }, null, 2)}\n`, { flag: "wx" });
  const summary = {
    scenarioId,
    profile: scenario.profile,
    passed: failure === null,
    failure,
    result: reportResult,
    cleanup,
    unavailableCanonicalGates: ["canonical sample duration", "heap growth slope", "RSS versus paired canonical F0",
      "monotonic snapshot age offset", "TCP loss/netem and WAN transport behavior"],
    evidenceFiles: fs.readdirSync(runDir).sort(),
  };
  fs.writeFileSync(path.join(runDir, "summary.json"), `${JSON.stringify(summary, null, 2)}\n`, { flag: "wx" });
  console.log(`Multiplayer impairment evidence: ${runDir}`);
  if (failure) {
    console.error(failure);
    process.exitCode = 1;
  } else {
    console.log(`${scenarioId} 4-browser pr-smoke passed`);
  }
}

main().catch((error) => {
  const failure = error.stack || error.message;
  console.error(failure);
  for (const [name, handler] of signalHandlers) process.removeListener(name, handler);
  const firstFailureFile = path.join(runDir, "first-failure.json");
  const summaryFile = path.join(runDir, "summary.json");
  if (!fs.existsSync(firstFailureFile)) {
    fs.writeFileSync(firstFailureFile, `${JSON.stringify({ failure }, null, 2)}\n`, { flag: "wx" });
  }
  if (!fs.existsSync(summaryFile)) {
    fs.writeFileSync(summaryFile, `${JSON.stringify({
      scenarioId, profile: scenario.profile, passed: false, failure, result: null,
      cleanup: fs.existsSync(path.join(runDir, "cleanup.json"))
        ? JSON.parse(fs.readFileSync(path.join(runDir, "cleanup.json"), "utf8")) : null,
      receivedSignal,
    }, null, 2)}\n`, { flag: "wx" });
  }
  console.error(`Multiplayer impairment evidence: ${runDir}`);
  process.exitCode = 1;
});
