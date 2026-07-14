#!/usr/bin/env node
"use strict";

const assert = require("assert");
const crypto = require("crypto");
const http = require("http");
const path = require("path");
const { spawn, spawnSync } = require("child_process");
const { TestRunner } = require("./helpers.cjs");

const ROOT = path.resolve(__dirname, "..");
const RUNTIME = path.join(ROOT, "scripts", "sim-runtime.cjs");
const PROOF_HEADER = "x-lbh-benchmark-control-proof";

function request(port, pathname, headers = {}) {
  return new Promise((resolve, reject) => {
    const req = http.request({ hostname: "127.0.0.1", port, path: pathname, headers }, (res) => {
      const chunks = [];
      res.on("data", (chunk) => chunks.push(chunk));
      res.on("end", () => {
        const text = Buffer.concat(chunks).toString("utf8");
        let body = null;
        try { body = JSON.parse(text); } catch {}
        resolve({ status: res.statusCode, body, text });
      });
    });
    req.once("error", reject);
    req.end();
  });
}

async function openPort() {
  const server = require("net").createServer();
  await new Promise((resolve, reject) => server.listen(0, "127.0.0.1", resolve).once("error", reject));
  const port = server.address().port;
  await new Promise((resolve) => server.close(resolve));
  return port;
}

async function startRuntime(env = {}) {
  const port = await openPort();
  const output = [];
  const child = spawn(process.execPath, [RUNTIME, "--host", "127.0.0.1", "--port", String(port),
    "--keep-alive", "true"], {
    cwd: ROOT,
    env: {
      ...process.env,
      NODE_ENV: "production",
      LBH_SIM_WS_ENABLED: "true",
      LBH_SIM_WS_REPLICATION_ACCOUNTING: "0",
      LBH_SIM_WS_STAGE_PROFILE: "0",
      LBH_REPLICATION_BASELINE_CAPTURE: "0",
      LBH_S23T_PUBLIC_BODY_PROFILE: "0",
      LBH_S23T_EVIDENCE_HARNESS: "0",
      LBH_SIM_WS_BENCH_EVENT_LOOP: "0",
      ...env,
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  child.stdout.on("data", (chunk) => output.push(chunk));
  child.stderr.on("data", (chunk) => output.push(chunk));
  const deadline = Date.now() + 8000;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) {
      throw new Error(`runtime exited ${child.exitCode}: ${Buffer.concat(output).toString("utf8")}`);
    }
    try {
      const health = await request(port, "/health");
      if (health.status === 200) return { child, port, output };
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 40));
  }
  child.kill("SIGTERM");
  throw new Error(`runtime did not become ready: ${Buffer.concat(output).toString("utf8")}`);
}

async function stopRuntime(runtime) {
  if (!runtime || runtime.child.exitCode !== null) return;
  runtime.child.kill("SIGTERM");
  await Promise.race([
    new Promise((resolve) => runtime.child.once("exit", resolve)),
    new Promise((resolve) => setTimeout(resolve, 2500)),
  ]);
  if (runtime.child.exitCode === null) runtime.child.kill("SIGKILL");
}

function collectKeys(value, keys = []) {
  if (!value || typeof value !== "object") return keys;
  for (const [key, child] of Object.entries(value)) {
    keys.push(key);
    collectKeys(child, keys);
  }
  return keys;
}

async function run() {
  const runner = new TestRunner("HostedBenchmarkInstrumentation");

  await runner.run("surface is default-off even when a proof happens to be present", async () => {
    const proof = crypto.randomBytes(32).toString("base64url");
    const runtime = await startRuntime({
      LBH_HOSTED_BENCHMARK_INSTRUMENTATION: "0",
      LBH_HOSTED_BENCHMARK_CONTROL_PROOF: proof,
    });
    try {
      const response = await request(runtime.port, "/benchmark/diagnostics", {
        [PROOF_HEADER]: proof,
      });
      assert.strictEqual(response.status, 404);
      assert.deepStrictEqual(response.body, { ok: false, error: "Not found" });
    } finally {
      await stopRuntime(runtime);
    }
  });

  await runner.run("production endpoint rejects missing and wrong proof and accepts only the supplied proof", async () => {
    const proof = crypto.randomBytes(32).toString("base64url");
    const wrongProof = crypto.randomBytes(32).toString("base64url");
    const runtime = await startRuntime({
      LBH_HOSTED_BENCHMARK_INSTRUMENTATION: "1",
      LBH_HOSTED_BENCHMARK_CONTROL_PROOF: proof,
    });
    try {
      for (const headers of [{}, { [PROOF_HEADER]: wrongProof }]) {
        const rejected = await request(runtime.port, "/benchmark/diagnostics", headers);
        assert.strictEqual(rejected.status, 404);
        assert.deepStrictEqual(rejected.body, { ok: false, error: "Not found" });
      }
      const accepted = await request(runtime.port, "/benchmark/diagnostics", {
        [PROOF_HEADER]: proof,
      });
      assert.strictEqual(accepted.status, 200);
      assert.strictEqual(accepted.body.schema, "lbh-hosted-benchmark-diagnostics-v1");
      assert(accepted.body.process.cpuUsage && accepted.body.process.memory,
        "authenticated surface must expose collector-baseline CPU and memory counters");
      assert(accepted.body.soak && accepted.body.soak.lifecycle === "running",
        "hosted opt-in must activate bounded GC/event-loop/CPU/memory windows");
      assert.strictEqual(accepted.body.bounds.costDistributionSamples, 512);
      assert.strictEqual(accepted.body.bounds.soakCompletedWindowCapacity, 2);
      assert(accepted.body.bounds.authorityStageSamples <= 512);
      assert(accepted.body.bounds.authorityStageRecipients <= 16);
      assert(accepted.body.soak.completedWindows.length <= 2);
      assert(accepted.body.distributions.simTickMs.count <= 512);
      assert(accepted.body.distributions.projectionReplicationMs.count <= 512);
      assert(accepted.body.runtime.tickDebt.distributionMs.count <= 512);
      assert(accepted.body.runtime.retention.eventJournal.retainedCount
        <= accepted.body.runtime.retention.eventJournal.capacity);
      assert(accepted.body.runtime.retention.snapshotRing.retainedCount
        <= accepted.body.runtime.retention.snapshotRing.capacity);
      assert(accepted.text.length < 300_000, "bounded readback must stay safely below a fixed response ceiling");

      const publicHealth = await request(runtime.port, "/health");
      assert.strictEqual(publicHealth.status, 200);
      assert(!publicHealth.body.multiplayer.adapter.authorityStageProfile,
        "hosted stage distributions must not leak through public health");

      const serialized = JSON.stringify(accepted.body);
      assert(!serialized.includes(proof) && !serialized.includes(wrongProof),
        "control proofs must never appear in response data");
      const forbiddenKeys = new Set(["runId", "membershipId", "playerId", "clientId",
        "commandCredential", "joinTicket", "authorization", "controlProof"]);
      const leakedKeys = collectKeys(accepted.body).filter((key) => forbiddenKeys.has(key));
      assert.deepStrictEqual(leakedKeys, [], "diagnostic response must exclude identity and secret fields");
      const logs = Buffer.concat(runtime.output).toString("utf8");
      assert(!logs.includes(proof) && !logs.includes(wrongProof), "control proofs must never appear in logs");
    } finally {
      await stopRuntime(runtime);
    }
  });

  await runner.run("exact flags and proof entropy fail closed without test masquerade", async () => {
    const baseEnv = {
      ...process.env,
      NODE_ENV: "production",
      LBH_SIM_WS_REPLICATION_ACCOUNTING: "0",
      LBH_SIM_WS_STAGE_PROFILE: "0",
      LBH_REPLICATION_BASELINE_CAPTURE: "0",
      LBH_S23T_PUBLIC_BODY_PROFILE: "0",
      LBH_S23T_EVIDENCE_HARNESS: "0",
      LBH_SIM_WS_BENCH_EVENT_LOOP: "0",
    };
    const nonExact = spawnSync(process.execPath, [RUNTIME, "--port", "0"], {
      cwd: ROOT,
      env: { ...baseEnv, LBH_HOSTED_BENCHMARK_INSTRUMENTATION: "true" },
      encoding: "utf8",
      timeout: 3000,
    });
    assert.notStrictEqual(nonExact.status, 0);
    assert.match(`${nonExact.stdout}${nonExact.stderr}`, /must be exactly 0 or 1/);

    const weakProof = spawnSync(process.execPath, [RUNTIME, "--port", "0"], {
      cwd: ROOT,
      env: {
        ...baseEnv,
        LBH_HOSTED_BENCHMARK_INSTRUMENTATION: "1",
        LBH_HOSTED_BENCHMARK_CONTROL_PROOF: "benchmark-secret",
      },
      encoding: "utf8",
      timeout: 3000,
    });
    assert.notStrictEqual(weakProof.status, 0);
    assert.match(`${weakProof.stdout}${weakProof.stderr}`, /unguessable base64url value of at least 32 bytes/);

    const source = require("fs").readFileSync(RUNTIME, "utf8");
    assert(source.includes("TEST_AUTHORITY_STAGE_PROFILE_CAPTURE")
      && source.includes("|| HOSTED_BENCHMARK_INSTRUMENTATION"),
    "hosted stage profiling must be a distinct production path");
    assert(!/HOSTED_BENCHMARK_INSTRUMENTATION[^;]{0,200}NODE_ENV\s*!==\s*["']test["']/.test(source),
      "hosted instrumentation must not require NODE_ENV=test");
  });

  if (!runner.summary()) process.exitCode = 1;
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
