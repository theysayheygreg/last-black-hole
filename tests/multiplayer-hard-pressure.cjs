"use strict";

const crypto = require("crypto");
const fs = require("fs");
const net = require("net");
const os = require("os");
const path = require("path");
const { execFileSync } = require("child_process");
const { runRawHardPressureCohort, runAllReadingControl } = require("./network/raw-ws-hard-pressure-cohort.cjs");

const ROOT = path.resolve(__dirname, "..");
const fixtureName = process.env.LBH_PRESSURE_FIXTURE || "phase2-transport-hard-v1.json";
if (path.basename(fixtureName) !== fixtureName) throw new Error("LBH_PRESSURE_FIXTURE must be a fixture basename");
const fixturePath = path.join(__dirname, "fixtures/network-impairment", fixtureName);
const fixtureRaw = fs.readFileSync(fixturePath, "utf8");
const fixture = JSON.parse(fixtureRaw);
const stamp = new Date().toISOString().replace(/[:.]/g, "");
const artifactLabel = fixture.artifactLabel || "t2b";
const runDir = path.join(__dirname, "screenshots", `multiplayer-transport-${stamp}-${artifactLabel}-${crypto.randomBytes(3).toString("hex")}`);
fs.mkdirSync(runDir, { recursive: false });

function freePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const port = server.address().port;
      server.close((error) => error ? reject(error) : resolve(port));
    });
  });
}

async function main() {
  const commit = execFileSync("git", ["rev-parse", "HEAD"], { cwd: ROOT, encoding: "utf8" }).trim();
  const dirty = execFileSync("git", ["status", "--porcelain"], { cwd: ROOT, encoding: "utf8" }).trim().length > 0;
  const diagnosticOnly = dirty && process.env.LBH_PRESSURE_ALLOW_DIRTY === "1";
  const ports = { control: await freePort(), pressure: await freePort() };
  if (ports.control === ports.pressure) ports.pressure = await freePort();
  let failure = dirty && !diagnosticOnly
    ? "T2b evidence requires clean HEAD; use LBH_PRESSURE_ALLOW_DIRTY=1 for diagnostic RED" : null;
  let control = null;
  let result = null;
  try {
    if (!failure) control = await runAllReadingControl({ fixture, runDir, port: ports.control });
    if (!failure) result = await runRawHardPressureCohort({ fixture, runDir, port: ports.pressure });
  } catch (error) { failure = error.stack || error.message; }
  let performance = null;
  if (control && result?.passed) {
    performance = { evidenceClass: fixture.evidenceClass, control: control.performance, pressure: result.performance };
    performance.gates = {
      simTick: performance.pressure.simTickP95Ms <= Math.max(performance.control.simTickP95Ms + 2, 10),
      projection: performance.pressure.projectionP95Ms <= Math.max(performance.control.projectionP95Ms * 1.5, 12),
      rss: performance.pressure.rssBytes - performance.control.rssBytes <= 64 * 1024 * 1024,
    };
    if (Object.values(performance.gates).includes(false)) failure ||= `T2b performance gate failed: ${JSON.stringify(performance)}`;
    fs.writeFileSync(path.join(runDir, "performance.json"), `${JSON.stringify(performance, null, 2)}\n`, { flag: "wx" });
  }
  const lifecycleFile = path.join(runDir, "authority-lifecycle.jsonl");
  const preFile = path.join(runDir, "pre-shutdown-health.json");
  const lifecycle = fs.existsSync(lifecycleFile) ? fs.readFileSync(lifecycleFile, "utf8").trim().split("\n")
    .filter(Boolean).map((line) => JSON.parse(line)) : [];
  const pre = fs.existsSync(preFile) ? JSON.parse(fs.readFileSync(preFile, "utf8")) : null;
  const post = lifecycle.find((entry) => entry.type === "post-shutdown")?.diagnostics || null;
  const adapter = pre?.multiplayer?.adapter;
  const cleanup = { preShutdown: adapter ? { connections: adapter.connections, bound: adapter.bound,
    closing: adapter.closing, queuedBytes: adapter.queuedBytes, queuedMessages: adapter.queuedMessages,
    pendingScheduledSends: adapter.pendingScheduledSends, helloTimers: adapter.helloTimers,
    livenessTimers: adapter.livenessTimers, pressureCurrent: adapter.pressure?.current,
    tickets: pre.multiplayer.tickets } : null,
  postShutdown: post ? { connections: post.connections, bound: post.bound, closing: post.closing,
    queuedBytes: post.queuedBytes, queuedMessages: post.queuedMessages,
    pendingScheduledSends: post.pendingScheduledSends, helloTimers: post.helloTimers,
    livenessTimers: post.livenessTimers, pressureCurrent: post.pressure?.current } : null };
  cleanup.passed = Boolean(cleanup.preShutdown && cleanup.postShutdown
    && cleanup.preShutdown.connections === 0 && cleanup.preShutdown.bound === 0 && cleanup.preShutdown.closing === 0
    && cleanup.preShutdown.queuedBytes === 0 && cleanup.preShutdown.queuedMessages === 0
    && cleanup.preShutdown.pendingScheduledSends === 0 && cleanup.preShutdown.helloTimers === 0
    && cleanup.preShutdown.livenessTimers === 1 && cleanup.postShutdown.livenessTimers === 0
    && cleanup.preShutdown.tickets?.retained === 0 && cleanup.preShutdown.tickets?.counts?.pending === 0
    && Object.values(cleanup.preShutdown.pressureCurrent || {}).every((metric) => metric.total === 0)
    && Object.values(cleanup.postShutdown.pressureCurrent || {}).every((metric) => metric.total === 0));
  if (result?.passed && !cleanup.passed) failure ||= `T2b cleanup gate failed: ${JSON.stringify(cleanup)}`;
  fs.writeFileSync(path.join(runDir, "cleanup.json"), `${JSON.stringify(cleanup, null, 2)}\n`, { flag: "wx" });
  fs.writeFileSync(path.join(runDir, "manifest.json"), `${JSON.stringify({ schemaVersion: 1,
    generatedAt: new Date().toISOString(), commit, dirty, diagnosticOnly,
    fixtureHash: crypto.createHash("sha256").update(fixtureRaw).digest("hex"), scenarioId: fixture.scenarioId,
    evidenceClass: fixture.evidenceClass, seed: fixture.seed,
    topology: { matches: 2, dedicatedAuthoritiesPerMatch: 1, rawClientsPerMatch: fixture.pilotCount },
    ports, queuePolicy: fixture.queuePolicy, stimulus: fixture.stimulus,
    claimBoundary: "Local Node raw-WebSocket hard-pressure PR smoke only; no packet, browser, WAN, WSS, hosted, or capacity claim",
    runtime: { node: process.version, platform: process.platform, arch: process.arch, osRelease: os.release() } }, null, 2)}\n`, { flag: "wx" });
  fs.writeFileSync(path.join(runDir, "connection-map.json"), `${JSON.stringify({ control: control?.connectionMap || [],
    pressure: result?.connectionMap || [] }, null, 2)}\n`, { flag: "wx" });
  const forbiddenKey = /"(?:commandCredential|admissionTicket|resumeTicket|profileId|membershipId|playerId|connectionId|currentRunId|runId)"\s*:/;
  for (const name of fs.readdirSync(runDir).filter((entry) => /\.jsonl?$/.test(entry))) {
    if (forbiddenKey.test(fs.readFileSync(path.join(runDir, name), "utf8"))) {
      failure ||= `T2b privacy scan rejected ${name}`;
      break;
    }
  }
  fs.writeFileSync(path.join(runDir, "summary.json"), `${JSON.stringify({ passed: !failure, failure,
    control, result, performance, cleanup }, null, 2)}\n`, { flag: "wx" });
  console.log(`T2b pressure evidence: ${runDir}`);
  if (failure) { console.error(failure); process.exitCode = 1; }
  else console.log("T2b hard-pressure fence/reconnect/replay passed");
}

main().catch((error) => { console.error(error.stack || error.message); process.exitCode = 1; });
