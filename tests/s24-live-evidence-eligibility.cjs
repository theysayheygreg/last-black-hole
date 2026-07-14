#!/usr/bin/env node
"use strict";

const assert = require("assert");
const fs = require("fs");
const net = require("net");
const path = require("path");
const { fork } = require("child_process");
const { WebSocket } = require("ws");
const { startSimServer, stopSimServer } = require("./helpers.cjs");

const ROOT = path.resolve(__dirname, "..");
const CLIENT = path.join(__dirname, "network", "state-pair-isolated-client.cjs");
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

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

async function request(port, pathname, { method = "GET", body, authority } = {}) {
  const headers = { "content-type": "application/json", connection: "close" };
  if (authority) {
    headers["x-lbh-command-credential"] = authority.commandCredential;
    headers["x-lbh-player-id"] = authority.playerId;
    headers["x-lbh-run-id"] = authority.runId;
  }
  const response = await fetch(`http://127.0.0.1:${port}${pathname}`, {
    method, headers, body: body === undefined ? undefined : JSON.stringify(body),
  });
  const bytes = Buffer.from(await response.arrayBuffer());
  let responseBody = null;
  if (bytes.length) try { responseBody = JSON.parse(bytes.toString("utf8")); } catch {}
  return { status: response.status, body: responseBody };
}

async function waitFor(check, label, timeoutMs = 15_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const value = await check();
    if (value) return value;
    await sleep(25);
  }
  throw new Error(`Timed out waiting for ${label}`);
}

function spawnClient() {
  const child = fork(CLIENT, [], { cwd: ROOT, stdio: ["ignore", "ignore", "pipe", "ipc"] });
  child.stderrText = "";
  child.stderr.on("data", (data) => { child.stderrText += data.toString(); });
  child.pending = new Map();
  child.nextRequestId = 0;
  child.on("message", (message) => {
    const pending = child.pending.get(message.requestId);
    if (!pending) return;
    child.pending.delete(message.requestId);
    if (message.error) pending.reject(new Error(message.error));
    else pending.resolve(message.result);
  });
  child.on("exit", (code, signal) => {
    const error = new Error(`client exited code=${code} signal=${signal}: ${child.stderrText}`);
    for (const pending of child.pending.values()) pending.reject(error);
    child.pending.clear();
  });
  child.call = (command, extra = {}, timeoutMs = 60_000) => new Promise((resolve, reject) => {
    const requestId = ++child.nextRequestId;
    const timer = setTimeout(() => {
      child.pending.delete(requestId);
      reject(new Error(`client ${command} timeout: ${child.stderrText}`));
    }, timeoutMs);
    child.pending.set(requestId, {
      resolve: (value) => { clearTimeout(timer); resolve(value); },
      reject: (error) => { clearTimeout(timer); reject(error); },
    });
    child.send({ requestId, command, ...extra });
  });
  return child;
}

async function rejectedUpgradeStatus(port) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(`ws://127.0.0.1:${port}/stream`);
    ws.once("unexpected-response", (_request, response) => {
      resolve(response.statusCode);
      ws.terminate();
    });
    ws.once("open", () => { ws.terminate(); reject(new Error("25th socket unexpectedly opened")); });
    ws.once("error", reject);
  });
}

async function defaultBoundary() {
  const port = await freePort();
  try {
    await startSimServer(port, { keepAlive: true, registerProcessCleanup: false, env: {
      NODE_ENV: "test", LBH_SIM_WS_ENABLED: "true", LBH_SIM_WS_JSON_V2: "true",
      LBH_SIM_WS_STATE_PAIR_V1: "true", LBH_SIM_WS_STATE_PAIR_MIXED_V1: "true",
      LBH_SIM_WS_RUNTIME_PUBLIC_COMPONENTS_V1: "true", LBH_SIM_WS_POSITIONAL_JSON_V1: "true",
    } });
    const before = await request(port, "/health/compact");
    assert.strictEqual(before.body.multiplayer.adapter.maxConnections, 16);
    assert.strictEqual(before.body.s24LiveEvidence, undefined);
    const started = await request(port, "/session/start", { method: "POST", body: {
      mapId: "deep-field", requesterId: "default-boundary", maxPlayers: 24, seed: 0x5324,
      LBH_S24_LIVE_EVIDENCE: "1", LBH_S24_EVIDENCE_HARNESS: "1",
      capabilities: ["s24-live-evidence-v1"], maxConnections: 24, maxScavengers: 48,
    } });
    assert.strictEqual(started.status, 200);
    assert.strictEqual(started.body.session.maxScavengers, 7);
    const after = await request(port, "/health/compact");
    assert.strictEqual(after.body.s24LiveEvidence, undefined);
    assert.strictEqual(after.body.session.maxScavengers, 7);
    assert.strictEqual(after.body.multiplayer.adapter.maxConnections, 16);
  } finally {
    await stopSimServer(port).catch(() => null);
  }
}

async function evidenceBoundary() {
  const port = await freePort();
  const children = [];
  const authorities = [];
  let authorityPid = null;
  try {
    await startSimServer(port, { keepAlive: true, registerProcessCleanup: false, env: {
      NODE_ENV: "test", LBH_S24_LIVE_EVIDENCE: "1", LBH_S24_EVIDENCE_HARNESS: "1",
      LBH_SIM_WS_ENABLED: "true", LBH_SIM_WS_JSON_V2: "true",
      LBH_SIM_WS_STATE_PAIR_V1: "true", LBH_SIM_WS_STATE_PAIR_MIXED_V1: "true",
      LBH_SIM_WS_RUNTIME_PUBLIC_COMPONENTS_V1: "true", LBH_SIM_WS_POSITIONAL_JSON_V1: "true",
      LBH_SIM_WS_REPLICATION_ACCOUNTING: "1", LBH_REPLICATION_BASELINE_CAPTURE: "1",
      LBH_SIM_WS_BENCH_EVENT_LOOP: "1", LBH_SIM_WS_STAGE_PROFILE: "1",
      LBH_SIM_MAX_SIM_TIME: "7200",
    } });
    authorityPid = Number(fs.readFileSync(path.join(ROOT, "tmp", `sim-server-${port}.pid`), "utf8").trim());
    const started = await request(port, "/session/start", { method: "POST", body: {
      mapId: "deep-field", requesterId: "s24-eligibility-seat-0", maxPlayers: 24,
      tickHz: 15, snapshotHz: 10, seed: 0x5324A11E,
    } });
    assert.strictEqual(started.status, 200);
    assert.strictEqual(started.body.session.maxScavengers, 48);
    for (let seat = 0; seat < 24; seat += 1) {
      const joined = await request(port, "/join", { method: "POST", body: {
        runId: started.body.session.runId, clientId: `s24-eligibility-seat-${seat}`,
        joinTicket: seat === 0 ? started.body.joinTicket : undefined,
        name: `S24 eligibility ${seat}`,
      } });
      assert.strictEqual(joined.status, 200, `seat ${seat} join`);
      authorities.push(joined.body.authority);
    }
    for (let seat = 0; seat < 24; seat += 1) {
      const child = spawnClient();
      children.push(child);
      const admitted = await child.call("init", { config: { port, authority: authorities[seat], seat,
        label: `evidence-seat-${seat}`, binary: false, compression: false,
        publicBody: false, preparedPublicSource: false } });
      assert.strictEqual(admitted.pid, child.pid);
    }
    const full = await waitFor(async () => {
      const health = await request(port, "/health/compact");
      return health.body.multiplayer.adapter.connections === 24 ? health.body : false;
    }, "24 bound clients", 30_000);
    assert.strictEqual(full.multiplayer.adapter.maxConnections, 24);
    assert.strictEqual(full.multiplayer.adapter.connections, 24);
    assert.strictEqual(await rejectedUpgradeStatus(port), 503);

    const workStartAt = Date.now() + 250;
    await Promise.all(children.map((child) => child.call("workload-start", { workload: {
      phase: "eligibility", startAt: workStartAt, durationMs: 2_000,
    } })));
    await sleep(Math.max(0, workStartAt + 2_000 - Date.now()));
    const workloads = await Promise.all(children.map((child) => child.call("workload-stop")));
    assert(workloads.every((row) => row.submittedInputSteps === row.plannedInputSteps));
    const health = (await request(port, "/health/compact")).body;
    const evidence = health.s24LiveEvidence;
    assert.strictEqual(evidence.exactVectorPresent, true);
    assert.deepStrictEqual(evidence.counts,
      { humans: 24, expensiveAi: 48, evidenceFauna: 328, dynamicBodies: 400, ambientAiPlayers: 0 });
    assert.strictEqual(health.ballpark.categories.player, 24);
    assert.strictEqual(health.ballpark.categories.scavenger, 48);
    assert.strictEqual(health.ballpark.categories.fauna, 328);
    assert(evidence.counters.simTicks > 0);
    assert(evidence.counters.worldSteps > 0 && evidence.counters.worldEntityUpdates > 0);
    assert(evidence.counters.fieldSteps > 0);
    assert(evidence.counters.scavengerSteps > 0 && evidence.counters.expensiveAiEntityUpdates >= 48);
    assert(evidence.counters.faunaSteps > 0 && evidence.counters.evidenceFaunaEntityUpdates >= 328);
    assert(evidence.counters.eventsPublished >= 24);
    assert(evidence.counters.projectionSchedules > 0);
    assert.deepStrictEqual(evidence.authority.logicalGameplayWriters, 1);
    assert.deepStrictEqual(evidence.authority.workers, 0);
    const serializedEvidence = JSON.stringify(evidence);
    assert(!serializedEvidence.includes("s24-eligibility-seat-"));
    assert(!/credential|ticket|secret/i.test(serializedEvidence));

    await Promise.all(children.map((child) => child.call("shutdown")));
    for (let seat = 0; seat < authorities.length; seat += 1) {
      const left = await request(port, "/leave", { method: "POST", authority: authorities[seat], body: {
        runId: authorities[seat].runId, playerId: authorities[seat].playerId, commandSeq: 1,
      } });
      assert.strictEqual(left.status, 200, `seat ${seat} leave`);
    }
    const drained = await waitFor(async () => {
      const current = await request(port, "/health/compact");
      return current.body.multiplayer.adapter.connections === 0
        && current.body.idleState.activeHumanPlayerCount === 0 ? current.body : false;
    }, "S24 drain");
    assert.strictEqual(drained.multiplayer.adapter.pendingScheduledSends, 0);
  } finally {
    for (const child of children) if (child.exitCode === null) child.kill("SIGTERM");
    await stopSimServer(port).catch(() => null);
    const portClosed = await new Promise((resolve) => {
      const socket = net.connect({ host: "127.0.0.1", port }, () => { socket.destroy(); resolve(false); });
      socket.once("error", () => resolve(true));
    });
    assert.strictEqual(portClosed, true);
    let pidDead = authorityPid === null;
    if (authorityPid !== null) try { process.kill(authorityPid, 0); } catch { pidDead = true; }
    assert.strictEqual(pidDead, true);
  }
}

async function main() {
  await defaultBoundary();
  console.log("  PASS: default runtime remains capped at 16 sockets and 7 Deep Field scavengers");
  await evidenceBoundary();
  console.log("  PASS: guarded S24 runtime admits 24, rejects 25th, executes 400/48, and cleans up");
}

main().catch((error) => {
  console.error(error.stack || error.message);
  process.exitCode = 1;
});
