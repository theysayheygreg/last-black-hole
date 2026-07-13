#!/usr/bin/env node
"use strict";

const fs = require("fs");
const path = require("path");
const { TestRunner, assert, startSimServer, stopSimServer } = require("./helpers.cjs");
const { openRawClient, closeRawClient } = require("./network/raw-ws-client.cjs");
const { frameShape } = require("../scripts/replication-accounting.cjs");

const ROOT = path.resolve(__dirname, "..");
const startupLog = (port) => path.join(ROOT, "tmp", `sim-server-${port}.log`);

async function health(port) {
  const response = await fetch(`http://127.0.0.1:${port}/health`, { headers: { connection: "close" } });
  return { status: response.status, body: await response.json() };
}

async function request(port, pathname, { body, authority } = {}) {
  const headers = { "content-type": "application/json", connection: "close" };
  if (authority) {
    headers["x-lbh-command-credential"] = authority.commandCredential;
    headers["x-lbh-player-id"] = authority.playerId;
    headers["x-lbh-run-id"] = authority.runId;
  }
  const response = await fetch(`http://127.0.0.1:${port}${pathname}`, {
    method: "POST", headers, body: JSON.stringify(body || {}),
  });
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

  await runner.run("counts a real runtime v1 public frame with the declared schema", async () => {
    const port = 8955;
    let client = null;
    try {
      await startSimServer(port, { keepAlive: true, env: {
        LBH_SIM_WS_ENABLED: "true", LBH_SIM_WS_REPLICATION_ACCOUNTING: "1",
        LBH_REPLICATION_BASELINE_CAPTURE: "1", NODE_ENV: "test",
      } });
      const started = await request(port, "/session/start", { body: {
        mapId: "shallows", requesterId: "shape-runtime-seat", requesterName: "Shape Runtime Seat",
        maxPlayers: 1, seed: 0x50B04A5E,
      } });
      assert(started.status === 200, "real shape session must start");
      const joined = await request(port, "/join", { body: {
        runId: started.body.session.runId, clientId: "shape-runtime-seat",
        joinTicket: started.body.joinTicket, name: "Shape Runtime Seat",
      } });
      assert(joined.status === 200, "real shape member must join");
      const ticket = await request(port, "/multiplayer/ticket", {
        authority: joined.body.authority, body: { kind: "admission" },
      });
      assert(ticket.status === 200, "real shape admission ticket must issue");
      client = await openRawClient({ port, ticket: ticket.body.ticket, pilotSlot: "shape-runtime",
        record() {}, maxFrames: 64, maxReceivedFrames: 128, sampleStateEvery: 10 });
      const shape = frameShape(client.latestFrames.publicState);
      assert(shape.shapeSchema === "lbh-public-state-v1" && shape.shapeComplete
        && shape.entityCount > 1 && shape.componentCount > 0 && shape.otherEntityCount === 0
        && shape.unknownStateKeys.length === 0 && shape.unknownWorldKeys.length === 0,
      `Real runtime public frame must match the declared nonzero v1 schema: ${JSON.stringify(shape)}`);
    } finally {
      await closeRawClient(client).catch(() => {});
      await stopSimServer(port).catch(() => {});
    }
  });

  runner.summary();
}

run().catch((error) => { console.error(error); process.exitCode = 1; });
