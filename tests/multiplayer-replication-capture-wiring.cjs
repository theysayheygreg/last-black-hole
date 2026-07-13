#!/usr/bin/env node
"use strict";

const fs = require("fs");
const path = require("path");
const { TestRunner, assert, startSimServer, stopSimServer } = require("./helpers.cjs");

const ROOT = path.resolve(__dirname, "..");
const startupLog = (port) => path.join(ROOT, "tmp", `sim-server-${port}.log`);

async function health(port) {
  const response = await fetch(`http://127.0.0.1:${port}/health`, { headers: { connection: "close" } });
  return { status: response.status, body: await response.json() };
}

async function run() {
  const runner = new TestRunner("MultiplayerReplicationCaptureWiring");

  await runner.run("keeps the runtime ledger absent by default", async () => {
    const port = 8951;
    try {
      await startSimServer(port, { keepAlive: true, env: { LBH_SIM_WS_ENABLED: "true" } });
      const response = await health(port);
      assert(response.status === 200, "default runtime must start");
      assert(!Object.prototype.hasOwnProperty.call(response.body.multiplayer.adapter, "replication"),
        "default runtime health must not expose or allocate the capture ledger");
    } finally {
      await stopSimServer(port).catch(() => {});
    }
  });

  await runner.run("requires exact flags and a test-only explicit guard", async () => {
    const malformedPort = 8952;
    const unguardedPort = 8953;
    try {
      let malformedRejected = false;
      try {
        await startSimServer(malformedPort, { keepAlive: true,
          env: { LBH_SIM_WS_ENABLED: "true", LBH_SIM_WS_REPLICATION_ACCOUNTING: "true" } });
      } catch (error) {
        const log = fs.existsSync(startupLog(malformedPort)) ? fs.readFileSync(startupLog(malformedPort), "utf8") : "";
        malformedRejected = /did not start cleanly/.test(error.message) && /must be exactly 0 or 1/.test(log);
      }
      assert(malformedRejected, "malformed capture flag must fail startup");
      let unguardedRejected = false;
      try {
        await startSimServer(unguardedPort, { keepAlive: true,
          env: { LBH_SIM_WS_ENABLED: "true", LBH_SIM_WS_REPLICATION_ACCOUNTING: "1", NODE_ENV: "test" } });
      } catch (error) {
        const log = fs.existsSync(startupLog(unguardedPort)) ? fs.readFileSync(startupLog(unguardedPort), "utf8") : "";
        unguardedRejected = /did not start cleanly/.test(error.message)
          && /requires NODE_ENV=test and LBH_REPLICATION_BASELINE_CAPTURE=1/.test(log);
      }
      assert(unguardedRejected, "capture must require its explicit test guard");
    } finally {
      await stopSimServer(malformedPort).catch(() => {});
      await stopSimServer(unguardedPort).catch(() => {});
    }
  });

  await runner.run("exposes the ledger only under the fully guarded opt-in", async () => {
    const port = 8954;
    try {
      await startSimServer(port, { keepAlive: true, env: {
        LBH_SIM_WS_ENABLED: "true", LBH_SIM_WS_REPLICATION_ACCOUNTING: "1",
        LBH_REPLICATION_BASELINE_CAPTURE: "1", NODE_ENV: "test",
      } });
      const response = await health(port);
      assert(response.status === 200 && response.body.multiplayer.adapter.replication?.enabled === true,
        "guarded capture runtime must expose the empty opt-in ledger");
      assert(response.body.multiplayer.adapter.replication.events.length === 0,
        "fresh capture runtime must begin with an empty ledger");
    } finally {
      await stopSimServer(port).catch(() => {});
    }
  });

  runner.summary();
}

run().catch((error) => { console.error(error); process.exitCode = 1; });
