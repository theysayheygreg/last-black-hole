"use strict";

const fs = require("fs");
const path = require("path");
const { startSimServer, stopSimServer } = require("../helpers.cjs");
const { waitFor, openRawClient, pauseAfterPong, resume, closeRawClient } = require("./raw-ws-client.cjs");

async function request(port, pathname, { method = "GET", body = null, authority = null } = {}) {
  const headers = { "content-type": "application/json" };
  if (authority) {
    headers["x-lbh-command-credential"] = authority.commandCredential;
    headers["x-lbh-player-id"] = authority.playerId;
    headers["x-lbh-run-id"] = authority.runId;
  }
  const response = await fetch(`http://127.0.0.1:${port}${pathname}`, {
    method, headers, body: body === null ? undefined : JSON.stringify(body),
  });
  return { status: response.status, body: await response.json() };
}

function command(authority, commandSeq, extra) {
  return { runId: authority.runId, playerId: authority.playerId,
    commandCredential: authority.commandCredential, commandSeq, ...extra };
}

function readJsonl(file) {
  if (!fs.existsSync(file)) return [];
  return fs.readFileSync(file, "utf8").trim().split("\n").filter(Boolean).map((line) => JSON.parse(line));
}

async function runRawSlowReaderCohort({ fixture, runDir }) {
  const port = fixture.port;
  const pressureFile = path.join(runDir, "authority-pressure.jsonl");
  const lifecycleFile = path.join(runDir, "authority-lifecycle.jsonl");
  const readerFile = path.join(runDir, "raw-reader.jsonl");
  for (const file of [pressureFile, lifecycleFile, readerFile]) fs.writeFileSync(file, "", { flag: "wx" });
  const preloadConfig = path.join(runDir, "preload-config.json");
  fs.writeFileSync(preloadConfig, `${JSON.stringify({ pressureFile, lifecycleFile,
    maxPressureEvents: fixture.evidence.maxPressureEvents }, null, 2)}\n`, { flag: "wx" });
  const preload = path.resolve(__dirname, "sim-pressure-preload.cjs");
  const clients = [];
  const authorities = [];
  const record = (entry) => fs.appendFileSync(readerFile, `${JSON.stringify(entry)}\n`);
  let healthAtAdmission = null;
  let pressureFailure = null;
  try {
    await startSimServer(port, { keepAlive: true, env: {
      LBH_SIM_WS_ENABLED: "true",
      LBH_PRESSURE_PRELOAD_CONFIG: preloadConfig,
      NODE_OPTIONS: `${process.env.NODE_OPTIONS || ""} --require=${preload}`.trim(),
    } });
    const started = await request(port, "/session/start", { method: "POST", body: {
      mapId: "shallows", requesterId: "t2a-pilot-0", requesterName: "T2A Pilot 0", maxPlayers: 4,
    } });
    if (started.status !== 200) throw new Error(`session start failed: ${JSON.stringify(started.body)}`);
    for (let index = 0; index < fixture.pilotCount; index += 1) {
      const id = `t2a-pilot-${index}`;
      const joined = await request(port, "/join", { method: "POST", body: {
        runId: started.body.session.runId, clientId: id,
        joinTicket: index === 0 ? started.body.joinTicket : undefined,
        name: `T2A Pilot ${index}`,
        equipped: [{ id: `t2a-rig-${index}`, name: `T2A Rig ${index}`, subcategory: "equippable" }],
      } });
      if (joined.status !== 200) throw new Error(`join ${index} failed: ${JSON.stringify(joined.body)}`);
      authorities.push(joined.body.authority);
      const ticket = await request(port, "/multiplayer/ticket", { method: "POST",
        authority: joined.body.authority, body: { kind: "admission" } });
      if (ticket.status !== 200) throw new Error(`ticket ${index} failed: ${JSON.stringify(ticket.body)}`);
      clients.push(await openRawClient({ port, ticket: ticket.body.ticket, pilotSlot: `pilot-${index}`, record }));
    }
    healthAtAdmission = (await request(port, "/health")).body;
    const authorityPid = healthAtAdmission.process?.pid;
    if (!Number.isSafeInteger(authorityPid)) throw new Error("one dedicated match authority PID unavailable");
    const impaired = clients.at(-1);
    await new Promise((resolve) => setTimeout(resolve, 8000));
    const controlHealth = (await request(port, "/health")).body;
    await pauseAfterPong(impaired, fixture.readGateGuardMs, record);
    const ordinal = fixture.pilotCount;
    const high = await waitFor(() => readJsonl(pressureFile).find((event) =>
      event.type === "transport-high-enter" && event.schedulerConnectionId === ordinal),
    "impaired connection transport high water", 12000).catch((error) => {
      pressureFailure = error.message;
      return null;
    });
    if (!high) {
      const diagnostic = (await request(port, "/health")).body.multiplayer.adapter.pressure;
      return { passed: false, authorityPid, ordinal, pressureFailure, diagnostic,
        claimBoundary: "Normal production projections did not prove the 256 KiB transport high-water condition" };
    }
    const tB = high.pressure.backpressuredSince;
    const highCounts = high.pressure.counts;
    await waitFor(() => readJsonl(pressureFile).filter((event) => event.type === "state-coalesced"
      && event.schedulerConnectionId === ordinal && event.timestamp >= tB).length >= 5,
    "five impaired state coalesces", 700);
    const issued = [];
    for (let index = 0; index < fixture.stimulus.count; index += 1) {
      const unequip = index % 2 === 0;
      const result = await request(port, "/inventory/action", { method: "POST", authority: authorities.at(-1),
        body: command(authorities.at(-1), index + 1, unequip
          ? { action: "unequip", equipSlot: 0 }
          : { action: "equipCargo", cargoSlot: 0, equipSlot: 0 }) });
      if (result.status !== 200) throw new Error(`stimulus ${index + 1} failed: ${JSON.stringify(result.body)}`);
      issued.push({ ordinal: index + 1, action: unequip ? "unequip" : "equipCargo", at: Date.now() });
    }
    const beforeResume = await waitFor(async () => {
      const detail = (await request(port, "/health")).body.multiplayer.adapter.pressure.connections[String(ordinal)];
      return detail.counts.reliableOffered >= highCounts.reliableOffered + 8
        && detail.counts.reliableQueued >= highCounts.reliableQueued + 8 ? detail : null;
    }, "eight reliable consequences queued behind transport high", 300);
    if (beforeResume.counts.reliableWsSendAccepted !== highCounts.reliableWsSendAccepted) {
      throw new Error("T2a reliable burst reached ws.send before read resume");
    }
    if (beforeResume.current.reliableMessages < high.pressure.current.reliableMessages + 8
      || beforeResume.current.reliableBytes <= high.pressure.current.reliableBytes) {
      throw new Error("T2a reliable queue depth/bytes did not increase for all eight consequences");
    }
    if (Date.now() - tB > fixture.resumeWithinMs) throw new Error("T2a missed tB + 1s resume deadline");
    resume(impaired, record);
    const low = await waitFor(() => readJsonl(pressureFile).find((event) =>
      event.type === "transport-low-exit" && event.schedulerConnectionId === ordinal && event.timestamp > tB),
    "impaired transport low water", fixture.lowWaterWithinMs);
    await waitFor(() => impaired.frames.filter((frame) => frame.type === "event"
      && frame.eventType === "player.inventoryAction").length >= 8, "eight reliable inventory consequences", 5000);
    const finalHealth = (await request(port, "/health")).body;
    const pressureEvents = readJsonl(pressureFile);
    const policyEvents = pressureEvents.filter((event) => event.type === "queue-policy" || event.type === "close-dispatched");
    if (low.bufferedBytes > fixture.queuePolicy.transportLowWaterBytes || low.timestamp >= tB + fixture.lowWaterWithinMs) {
      throw new Error("T2a low-water event missed the production hysteresis/deadline gate");
    }
    if (policyEvents.length !== 0 || clients.some((client) => client.close)
      || beforeResume.counts.rebases !== 0 || beforeResume.counts.disconnects !== 0) {
      throw new Error("T2a observed a forbidden policy, close, rebase, or disconnect");
    }
    const inventoryEvents = impaired.frames.filter((frame) => frame.type === "event"
      && frame.eventType === "player.inventoryAction" && frame._receivedAt >= issued[0].at);
    if (inventoryEvents.length !== 8
      || inventoryEvents.some((event, index) => event.payload.action !== issued[index].action || event._bytes > 4096)
      || new Set(inventoryEvents.map((event) => event.deliveryId)).size !== 8) {
      throw new Error("T2a reliable consequences were not exact-once FIFO bounded inventory events");
    }
    const coalesced = pressureEvents.filter((event) => event.type === "state-coalesced"
      && event.schedulerConnectionId === ordinal && event.timestamp >= tB && event.timestamp <= low.timestamp);
    const resumedStates = impaired.frames.filter((frame) => (frame.type === "publicState" || frame.type === "ownerState")
      && frame._receivedAt >= issued[0].at);
    for (let index = 0; index < resumedStates.length - 1; index += 2) {
      if (resumedStates[index].type !== "publicState" || resumedStates[index + 1].type !== "ownerState"
        || resumedStates[index].snapshotId !== resumedStates[index + 1].snapshotId) {
        throw new Error("T2a received a non-atomic public/owner state pair");
      }
    }
    const highWindowReceived = resumedStates.filter((frame) => frame.snapshotId >= coalesced[0]?.snapshotId);
    if (coalesced.length < 5 || highWindowReceived[0]?.snapshotId !== coalesced.at(-1)?.snapshotId
      || new Set(highWindowReceived.map((frame) => frame.snapshotId)).size !== 1) {
      throw new Error("T2a drain did not send only the greatest coalesced high-window snapshot first");
    }
    const details = finalHealth.multiplayer.adapter.pressure.connections;
    const healthy = [1, 2, 3].map((id) => ({ schedulerConnectionId: id, ...details[String(id)] }));
    if (healthy.some((entry) => entry.maximum.wsBufferedBytes >= fixture.queuePolicy.transportHighWaterBytes
      || entry.counts.highWaterCrossings !== 0 || entry.counts.rebases !== 0 || entry.counts.disconnects !== 0)) {
      throw new Error("T2a healthy-peer pressure isolation failed");
    }
    const controlCost = controlHealth.multiplayer.projection.accounting.costDistributions;
    const pressureCost = finalHealth.multiplayer.projection.accounting.costDistributions;
    const performance = {
      control: { simTickP95Ms: controlCost.simTickMs.p95, projectionP95Ms: controlCost.projectionReplicationMs.p95,
        rssBytes: controlHealth.process.memory.rss },
      pressure: { simTickP95Ms: pressureCost.simTickMs.p95, projectionP95Ms: pressureCost.projectionReplicationMs.p95,
        rssBytes: finalHealth.process.memory.rss },
    };
    performance.gates = {
      simTick: performance.pressure.simTickP95Ms <= Math.max(performance.control.simTickP95Ms + 2, 10),
      projection: performance.pressure.projectionP95Ms <= Math.max(performance.control.projectionP95Ms * 1.5, 12),
      rss: performance.pressure.rssBytes - performance.control.rssBytes <= 64 * 1024 * 1024,
    };
    if (Object.values(performance.gates).includes(false)) throw new Error(`T2a performance gate failed: ${JSON.stringify(performance)}`);
    fs.writeFileSync(path.join(runDir, "state-ledger.json"), `${JSON.stringify({
      highWindow: { coalescedSnapshotIds: coalesced.map((event) => event.snapshotId),
        firstAcceptedAfterDrain: highWindowReceived[0]?.snapshotId || null },
      receivedPairs: resumedStates.map((frame) => ({ type: frame.type, snapshotId: frame.snapshotId, bytes: frame._bytes })),
    }, null, 2)}\n`, { flag: "wx" });
    fs.writeFileSync(path.join(runDir, "reliable-ledger.json"), `${JSON.stringify({ issued,
      highCounts: { offered: highCounts.reliableOffered, queued: highCounts.reliableQueued,
        wsSendAccepted: highCounts.reliableWsSendAccepted },
      beforeResumeCounts: { offered: beforeResume.counts.reliableOffered, queued: beforeResume.counts.reliableQueued,
        wsSendAccepted: beforeResume.counts.reliableWsSendAccepted },
      received: inventoryEvents.map((event) => ({ action: event.payload.action, eventSeq: event.eventSeq,
        deliveryId: event.deliveryId, bytes: event._bytes })),
    }, null, 2)}\n`, { flag: "wx" });
    fs.writeFileSync(path.join(runDir, "healthy-peers.json"), `${JSON.stringify(healthy, null, 2)}\n`, { flag: "wx" });
    fs.writeFileSync(path.join(runDir, "performance.json"), `${JSON.stringify(performance, null, 2)}\n`, { flag: "wx" });
    return { passed: true, authorityPid, ordinal, tB, lowAt: low.timestamp, issued,
      pressureBeforeResume: beforeResume, performance };
  } finally {
    await Promise.all(clients.map(closeRawClient));
    if (authorities[0]) {
      await request(port, "/session/reset", { method: "POST", authority: authorities[0],
        body: command(authorities[0], 1, { requesterId: authorities[0].playerId }) }).catch(() => null);
    }
    const preShutdown = await request(port, "/health").catch(() => null);
    if (preShutdown) {
      const { currentRunId: _currentRunId, ...adapter } = preShutdown.body.multiplayer.adapter;
      const { runId: _ticketRunId, ...tickets } = preShutdown.body.multiplayer.tickets;
      fs.writeFileSync(path.join(runDir, "pre-shutdown-health.json"),
        `${JSON.stringify({ multiplayer: { adapter, tickets } }, null, 2)}\n`, { flag: "wx" });
    }
    await stopSimServer(port).catch(() => null);
  }
}

module.exports = { runRawSlowReaderCohort };
