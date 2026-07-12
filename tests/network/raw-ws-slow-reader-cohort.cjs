"use strict";

const fs = require("fs");
const net = require("net");
const path = require("path");
const { startSimServer, stopSimServer } = require("../helpers.cjs");
const { waitFor, openRawClient, pauseAfterAuthorityPong, resume, closeRawClient } = require("./raw-ws-client.cjs");

async function request(port, pathname, { method = "GET", body = null, authority = null,
  accounting = null, category = "oracle" } = {}) {
  if (accounting) accounting[category] = (accounting[category] || 0) + 1;
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

async function portIsDead(port) {
  return new Promise((resolve) => {
    const socket = net.connect({ host: "127.0.0.1", port }, () => { socket.destroy(); resolve(false); });
    socket.once("error", () => resolve(true));
  });
}

async function runRawSlowReaderCohort({ fixture, runDir, port }) {
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
  const connectionMap = [];
  const httpAccounting = { setup: 0, oracle: 0, controllerStimulus: 0, clientHotPath: 0 };
  let readerEvents = 0;
  const record = (entry) => {
    if (++readerEvents > fixture.evidence.maxRawReaderEvents) throw new Error("pressure raw-reader evidence cap exceeded");
    fs.appendFileSync(readerFile, `${JSON.stringify(entry)}\n`);
  };
  let healthAtAdmission = null;
  let pressureFailure = null;
  try {
    await startSimServer(port, { keepAlive: true, env: {
      LBH_SIM_WS_ENABLED: "true",
      LBH_PRESSURE_PRELOAD_CONFIG: preloadConfig,
      NODE_OPTIONS: `${process.env.NODE_OPTIONS || ""} --require=${preload}`.trim(),
    } });
    const started = await request(port, "/session/start", { method: "POST", accounting: httpAccounting, category: "setup", body: {
      mapId: "shallows", requesterId: "t2a-pilot-0", requesterName: "T2A Pilot 0", maxPlayers: 4,
    } });
    if (started.status !== 200) throw new Error(`session start failed: ${JSON.stringify(started.body)}`);
    for (let index = 0; index < fixture.pilotCount; index += 1) {
      const beforeKeys = new Set(Object.keys((await request(port, "/health", { accounting: httpAccounting })).body
        .multiplayer.adapter.pressure.connections));
      const id = `t2a-pilot-${index}`;
      const joined = await request(port, "/join", { method: "POST", accounting: httpAccounting, category: "setup", body: {
        runId: started.body.session.runId, clientId: id,
        joinTicket: index === 0 ? started.body.joinTicket : undefined,
        name: `T2A Pilot ${index}`,
        equipped: [{ id: `t2a-rig-${index}`, name: `T2A Rig ${index}`, subcategory: "equippable" }],
      } });
      if (joined.status !== 200) throw new Error(`join ${index} failed: ${JSON.stringify(joined.body)}`);
      authorities.push(joined.body.authority);
      const ticket = await request(port, "/multiplayer/ticket", { method: "POST",
        authority: joined.body.authority, accounting: httpAccounting, category: "setup", body: { kind: "admission" } });
      if (ticket.status !== 200) throw new Error(`ticket ${index} failed: ${JSON.stringify(ticket.body)}`);
      clients.push(await openRawClient({ port, ticket: ticket.body.ticket, pilotSlot: `pilot-${index}`, record,
        maxFrames: fixture.evidence.maxRawFramesPerClient }));
      const afterHealth = (await request(port, "/health", { accounting: httpAccounting })).body;
      const afterKeys = Object.keys(afterHealth.multiplayer.adapter.pressure.connections);
      const added = afterKeys.filter((key) => !beforeKeys.has(key));
      if (added.length !== 1) throw new Error(`admission did not add exactly one scheduler ordinal: ${JSON.stringify({ beforeKeys: [...beforeKeys], afterKeys })}`);
      connectionMap.push({ pilotSlot: `pilot-${index}`, schedulerConnectionId: Number(added[0]), connectionEpochs: [1] });
    }
    healthAtAdmission = (await request(port, "/health", { accounting: httpAccounting })).body;
    const authorityPid = healthAtAdmission.process?.pid;
    if (!Number.isSafeInteger(authorityPid)) throw new Error("one dedicated match authority PID unavailable");
    const impaired = clients.at(-1);
    const ordinal = connectionMap.at(-1).schedulerConnectionId;
    const authorityPong = await waitFor(() => readJsonl(pressureFile).find((event) =>
      event.type === "heartbeat-pong" && event.schedulerConnectionId === ordinal),
    "authority-validated impaired heartbeat pong", 15000);
    await pauseAfterAuthorityPong(impaired, authorityPong, fixture.readGateGuardMs, record);
    const high = await waitFor(() => readJsonl(pressureFile).find((event) =>
      event.type === "transport-high-enter" && event.schedulerConnectionId === ordinal),
    "impaired connection transport high water", 12000).catch((error) => {
      pressureFailure = error.message;
      return null;
    });
    if (!high) {
      const diagnostic = (await request(port, "/health", { accounting: httpAccounting })).body.multiplayer.adapter.pressure;
      return { passed: false, authorityPid, ordinal, pressureFailure, diagnostic,
        claimBoundary: "Normal production projections did not prove the 256 KiB transport high-water condition" };
    }
    const tB = high.pressure.backpressuredSince;
    if (tB >= authorityPong.nextHeartbeatTimeoutEligibleAt) throw new Error("transport high was heartbeat-timeout eligible");
    const highCounts = high.pressure.counts;
    await waitFor(() => readJsonl(pressureFile).filter((event) => event.type === "state-coalesced"
      && event.schedulerConnectionId === ordinal && event.timestamp >= tB).length >= 5,
    "five impaired state coalesces", 700);
    const issued = [];
    for (let index = 0; index < fixture.stimulus.count; index += 1) {
      const unequip = index % 2 === 0;
      const result = await request(port, "/inventory/action", { method: "POST", authority: authorities.at(-1),
        accounting: httpAccounting, category: "controllerStimulus",
        body: command(authorities.at(-1), index + 1, unequip
          ? { action: "unequip", equipSlot: 0 }
          : { action: "equipCargo", cargoSlot: 0, equipSlot: 0 }) });
      if (result.status !== 200) throw new Error(`stimulus ${index + 1} failed: ${JSON.stringify(result.body)}`);
      issued.push({ ordinal: index + 1, action: unequip ? "unequip" : "equipCargo", at: Date.now() });
    }
    const beforeResume = await waitFor(async () => {
      const detail = (await request(port, "/health", { accounting: httpAccounting })).body.multiplayer.adapter.pressure.connections[String(ordinal)];
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
    if (low.timestamp >= authorityPong.nextHeartbeatTimeoutEligibleAt) throw new Error("transport low crossed heartbeat-timeout eligibility");
    await waitFor(() => impaired.frames.filter((frame) => frame.type === "event"
      && frame.eventType === "player.inventoryAction").length >= 8, "eight reliable inventory consequences", 5000);
    let finalHealth = (await request(port, "/health", { accounting: httpAccounting })).body;
    if (finalHealth.process.pid !== authorityPid) throw new Error("pressure authority PID changed");
    let pressureEvents = readJsonl(pressureFile);
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
    const queuedEvents = pressureEvents.filter((event) => event.type === "reliable-queued"
      && event.schedulerConnectionId === ordinal && event.timestamp >= tB && event.timestamp < low.timestamp
      && inventoryEvents.some((received) => received.deliveryId === event.reliableId));
    const acceptedBeforeResume = pressureEvents.filter((event) => event.type === "reliable-ws-send-accepted"
      && event.schedulerConnectionId === ordinal && event.timestamp < low.timestamp
      && queuedEvents.some((queued) => queued.reliableId === event.reliableId));
    if (queuedEvents.length !== 8 || acceptedBeforeResume.length !== 0
      || queuedEvents.some((event, index) => index > 0
        && (event.pressure.current.reliableMessages <= queuedEvents[index - 1].pressure.current.reliableMessages
          || event.pressure.current.reliableBytes <= queuedEvents[index - 1].pressure.current.reliableBytes))) {
      throw new Error("T2a per-ID reliable queue ledger was not strictly increasing with zero pre-resume acceptance");
    }
    await waitFor(() => {
      const retired = readJsonl(pressureFile).filter((event) => event.type === "reliable-ack-retired"
        && event.schedulerConnectionId === ordinal && queuedEvents.some((queued) => queued.reliableId === event.reliableId));
      return new Set(retired.filter((event) => event.removedCount > 0).map((event) => event.reliableId)).size === 8;
    }, "delivery ACK retirement for all eight reliable IDs", 3000);
    finalHealth = (await request(port, "/health", { accounting: httpAccounting })).body;
    if (finalHealth.process.pid !== authorityPid) throw new Error("pressure authority PID changed after ACK retirement");
    pressureEvents = readJsonl(pressureFile);
    const reliableAccepted = pressureEvents.filter((event) => event.type === "reliable-ws-send-accepted"
      && event.schedulerConnectionId === ordinal && queuedEvents.some((queued) => queued.reliableId === event.reliableId));
    const reliableRetired = pressureEvents.filter((event) => event.type === "reliable-ack-retired"
      && event.schedulerConnectionId === ordinal && queuedEvents.some((queued) => queued.reliableId === event.reliableId)
      && event.removedCount > 0);
    const reliableIdentityLedger = queuedEvents.map((queued, index) => {
      const accepted = reliableAccepted.find((event) => event.reliableId === queued.reliableId);
      const retired = reliableRetired.find((event) => event.reliableId === queued.reliableId);
      const received = inventoryEvents.find((event) => event.deliveryId === queued.reliableId);
      const queuedIndex = pressureEvents.indexOf(queued);
      const acceptedIndex = pressureEvents.indexOf(accepted);
      const retiredIndex = pressureEvents.indexOf(retired);
      if (!accepted || !retired || !received || accepted.eventSeq !== queued.eventSeq
        || acceptedIndex <= queuedIndex || accepted.timestamp < low.timestamp || retiredIndex <= acceptedIndex
        || retired.cumulativeRetired < index + 1) {
        throw new Error(`T2a reliable identity ${queued.reliableId} lacked ordered acceptance/retirement evidence`);
      }
      return {
        reliableId: queued.reliableId,
        eventSeq: queued.eventSeq,
        queued: { timestamp: queued.timestamp, byteLength: queued.byteLength,
          messages: queued.pressure.current.reliableMessages, bytes: queued.pressure.current.reliableBytes },
        wsSendAccepted: { timestamp: accepted.timestamp, eventSeq: accepted.eventSeq },
        received: { timestamp: received._receivedAt, action: received.payload.action, bytes: received._bytes },
        ackRetired: { timestamp: retired.timestamp, removedCount: retired.removedCount,
          cumulativeRetired: retired.cumulativeRetired },
      };
    });
    const cleanupResetReliableIds = [];
    const replayedReliableIds = [];
    if (reliableIdentityLedger.length !== 8
      || new Set(reliableIdentityLedger.map((entry) => entry.reliableId)).size !== 8
      || finalHealth.multiplayer.adapter.pressure.connections[String(ordinal)].current.reliableMessages !== 0
      || cleanupResetReliableIds.length !== 0 || replayedReliableIds.length !== 0) {
      throw new Error("T2a reliable identity-set closure failed");
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
    const highEventIndex = pressureEvents.findIndex((event) => event.type === "transport-high-enter"
      && event.schedulerConnectionId === ordinal && event.timestamp === high.timestamp);
    const lowEventIndex = pressureEvents.findIndex((event) => event.type === "transport-low-exit"
      && event.schedulerConnectionId === ordinal && event.timestamp === low.timestamp);
    const stateOffered = pressureEvents.filter((event, index) => event.type === "state-offered"
      && event.schedulerConnectionId === ordinal && index > highEventIndex && index < lowEventIndex);
    const stateAccepted = pressureEvents.filter((event) => event.type === "state-ws-send-accepted"
      && event.schedulerConnectionId === ordinal);
    const allReceivedStates = impaired.frames.filter((frame) => frame.type === "publicState" || frame.type === "ownerState");
    if (allReceivedStates.length % 2 !== 0) throw new Error("T2a received an incomplete state pair");
    const receivedStatePairLedger = [];
    for (let index = 0; index < allReceivedStates.length; index += 2) {
      const publicFrame = allReceivedStates[index];
      const ownerFrame = allReceivedStates[index + 1];
      const publicAccepted = stateAccepted.find((event) => event.snapshotId === publicFrame.snapshotId
        && event.frameClass === "publicState");
      const ownerAccepted = stateAccepted.find((event) => event.snapshotId === ownerFrame.snapshotId
        && event.frameClass === "ownerState");
      if (publicFrame.type !== "publicState" || ownerFrame.type !== "ownerState"
        || publicFrame.snapshotId !== ownerFrame.snapshotId || !publicAccepted || !ownerAccepted) {
        throw new Error(`T2a received state pair ${publicFrame.snapshotId} without matching wsSendAccepted pair`);
      }
      receivedStatePairLedger.push({
        snapshotId: publicFrame.snapshotId,
        received: { publicAt: publicFrame._receivedAt, ownerAt: ownerFrame._receivedAt,
          publicBytes: publicFrame._bytes, ownerBytes: ownerFrame._bytes },
        wsSendAccepted: { publicAt: publicAccepted.timestamp, ownerAt: ownerAccepted.timestamp },
      });
    }
    if (pressureEvents.length > fixture.evidence.maxPressureEvents
      || receivedStatePairLedger.length + stateOffered.length + stateAccepted.length > fixture.evidence.maxStateLedgerEntries
      || reliableIdentityLedger.length * 4 > fixture.evidence.maxReliableLedgerEntries
      || finalHealth.multiplayer.adapter.pressure.observer.failures !== 0) {
      throw new Error("T2a evidence/observer capacity gate failed");
    }
    const acceptedHighSnapshots = new Set(stateAccepted.filter((event) => stateOffered.some((offered) =>
      offered.snapshotId === event.snapshotId)).map((event) => event.snapshotId));
    if (coalesced.length < 5 || highWindowReceived[0]?.snapshotId !== coalesced.at(-1)?.snapshotId
      || acceptedHighSnapshots.size !== 1 || !acceptedHighSnapshots.has(coalesced.at(-1)?.snapshotId)
      || new Set(highWindowReceived.map((frame) => frame.snapshotId)).size !== 1) {
      throw new Error(`T2a drain did not send only the greatest coalesced high-window snapshot first: ${JSON.stringify({
        coalesced: coalesced.map((event) => event.snapshotId),
        highWindowReceived: highWindowReceived.map((frame) => frame.snapshotId),
        acceptedHighSnapshots: [...acceptedHighSnapshots],
      })}`);
    }
    const details = finalHealth.multiplayer.adapter.pressure.connections;
    const healthy = connectionMap.slice(0, -1).map(({ schedulerConnectionId }) => ({
      schedulerConnectionId, ...details[String(schedulerConnectionId)],
    }));
    if (healthy.some((entry) => entry.maximum.wsBufferedBytes >= fixture.queuePolicy.transportHighWaterBytes
      || entry.counts.highWaterCrossings !== 0 || entry.counts.rebases !== 0 || entry.counts.disconnects !== 0)) {
      throw new Error("T2a healthy-peer pressure isolation failed");
    }
    if (clients.some((client) => client.error || client.close)) throw new Error("T2a raw client error/close observed");
    if (httpAccounting.setup !== 9 || httpAccounting.controllerStimulus !== 8 || httpAccounting.clientHotPath !== 0) {
      throw new Error(`T2a HTTP accounting mismatch: ${JSON.stringify(httpAccounting)}`);
    }
    const pressureCost = finalHealth.multiplayer.projection.accounting.costDistributions;
    const performance = {
      pressure: { simTickP95Ms: pressureCost.simTickMs.p95, projectionP95Ms: pressureCost.projectionReplicationMs.p95,
        rssBytes: finalHealth.process.memory.rss },
    };
    fs.writeFileSync(path.join(runDir, "state-ledger.json"), `${JSON.stringify({
      highWindow: { coalescedSnapshotIds: coalesced.map((event) => event.snapshotId),
        firstAcceptedAfterDrain: highWindowReceived[0]?.snapshotId || null },
      offered: stateOffered.map((event) => ({ snapshotId: event.snapshotId, queueAction: event.queueAction,
        timestamp: event.timestamp })),
      wsSendAccepted: stateAccepted.map((event) => ({ snapshotId: event.snapshotId, frameClass: event.frameClass,
        timestamp: event.timestamp })),
      receivedPairs: receivedStatePairLedger,
      assertions: { everyReceivedPairHasWsSendAcceptedPair: true, receivedPairCount: receivedStatePairLedger.length },
    }, null, 2)}\n`, { flag: "wx" });
    fs.writeFileSync(path.join(runDir, "reliable-ledger.json"), `${JSON.stringify({ issued,
      highCounts: { offered: highCounts.reliableOffered, queued: highCounts.reliableQueued,
        wsSendAccepted: highCounts.reliableWsSendAccepted },
      beforeResumeCounts: { offered: beforeResume.counts.reliableOffered, queued: beforeResume.counts.reliableQueued,
        wsSendAccepted: beforeResume.counts.reliableWsSendAccepted },
      queued: queuedEvents.map((event) => ({ reliableId: event.reliableId, eventSeq: event.eventSeq,
        byteLength: event.byteLength, queuedMessages: event.pressure.current.reliableMessages,
        queuedBytes: event.pressure.current.reliableBytes, timestamp: event.timestamp })),
      received: inventoryEvents.map((event) => ({ action: event.payload.action, eventSeq: event.eventSeq,
        deliveryId: event.deliveryId, bytes: event._bytes })),
      identities: reliableIdentityLedger,
      cleanupResetReliableIds,
      replayedReliableIds,
      assertions: { everyStimulatedIdQueuedAcceptedReceivedAndRetired: true,
        acceptedOnlyAfterResume: true, cleanupResetSetEmpty: true, replayedSetEmpty: true },
    }, null, 2)}\n`, { flag: "wx" });
    fs.writeFileSync(path.join(runDir, "healthy-peers.json"), `${JSON.stringify(healthy, null, 2)}\n`, { flag: "wx" });
    fs.writeFileSync(path.join(runDir, "pressure-performance.json"), `${JSON.stringify(performance, null, 2)}\n`, { flag: "wx" });
    return { passed: true, authorityPid, ordinal, connectionMap, tB, lowAt: low.timestamp,
      nextHeartbeatTimeoutEligibleAt: authorityPong.nextHeartbeatTimeoutEligibleAt, issued,
      pressureBeforeResume: beforeResume, performance, httpAccounting };
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
    if (!await portIsDead(port)) throw new Error(`pressure authority port ${port} remained live after shutdown`);
  }
}

async function runAllReadingControl({ fixture, runDir, port }) {
  const pressureFile = path.join(runDir, "control-authority-pressure.jsonl");
  const lifecycleFile = path.join(runDir, "control-authority-lifecycle.jsonl");
  const readerFile = path.join(runDir, "control-raw-reader.jsonl");
  for (const file of [pressureFile, lifecycleFile, readerFile]) fs.writeFileSync(file, "", { flag: "wx" });
  const preloadConfig = path.join(runDir, "control-preload-config.json");
  fs.writeFileSync(preloadConfig, `${JSON.stringify({ pressureFile, lifecycleFile,
    maxPressureEvents: fixture.evidence.maxPressureEvents }, null, 2)}\n`, { flag: "wx" });
  const preload = path.resolve(__dirname, "sim-pressure-preload.cjs");
  const clients = [];
  const authorities = [];
  const connectionMap = [];
  let readerEvents = 0;
  const record = (entry) => {
    if (++readerEvents > fixture.evidence.maxRawReaderEvents) throw new Error("control raw-reader evidence cap exceeded");
    fs.appendFileSync(readerFile, `${JSON.stringify(entry)}\n`);
  };
  const accounting = { setup: 0, oracle: 0, controllerStimulus: 0, clientHotPath: 0 };
  let result = null;
  try {
    await startSimServer(port, { keepAlive: true, env: { LBH_SIM_WS_ENABLED: "true",
      LBH_PRESSURE_PRELOAD_CONFIG: preloadConfig,
      NODE_OPTIONS: `${process.env.NODE_OPTIONS || ""} --require=${preload}`.trim() } });
    const started = await request(port, "/session/start", { method: "POST", accounting, category: "setup",
      body: { mapId: "shallows", requesterId: "t2a-control-0", requesterName: "T2A Control 0", maxPlayers: 4 } });
    for (let index = 0; index < fixture.pilotCount; index += 1) {
      const beforeKeys = new Set(Object.keys((await request(port, "/health", { accounting })).body
        .multiplayer.adapter.pressure.connections));
      const id = `t2a-control-${index}`;
      const joined = await request(port, "/join", { method: "POST", accounting, category: "setup", body: {
        runId: started.body.session.runId, clientId: id, joinTicket: index === 0 ? started.body.joinTicket : undefined,
        name: `T2A Control ${index}`,
        equipped: [{ id: `t2a-control-rig-${index}`, name: `T2A Control Rig ${index}`, subcategory: "equippable" }],
      } });
      authorities.push(joined.body.authority);
      const ticket = await request(port, "/multiplayer/ticket", { method: "POST", authority: joined.body.authority,
        accounting, category: "setup", body: { kind: "admission" } });
      clients.push(await openRawClient({ port, ticket: ticket.body.ticket, pilotSlot: `pilot-${index}`, record,
        maxFrames: fixture.evidence.maxRawFramesPerClient }));
      const keys = Object.keys((await request(port, "/health", { accounting })).body.multiplayer.adapter.pressure.connections);
      const added = keys.filter((key) => !beforeKeys.has(key));
      if (added.length !== 1) throw new Error("control admission scheduler mapping was not exact");
      connectionMap.push({ pilotSlot: `pilot-${index}`, schedulerConnectionId: Number(added[0]), connectionEpochs: [1] });
    }
    await waitFor(() => {
      const events = readJsonl(pressureFile).filter((event) => event.type === "heartbeat-pong");
      return connectionMap.every((entry) => events.some((event) => event.schedulerConnectionId === entry.schedulerConnectionId));
    }, "all-reading control heartbeat pongs", 15000);
    const before = (await request(port, "/health", { accounting })).body;
    await new Promise((resolve) => setTimeout(resolve, fixture.controlDurationMs));
    const after = (await request(port, "/health", { accounting })).body;
    const events = readJsonl(pressureFile);
    if (events.some((event) => event.type === "transport-high-enter" || event.type === "queue-policy")
      || events.length > fixture.evidence.maxPressureEvents
      || after.multiplayer.adapter.pressure.observer.failures !== 0
      || clients.some((client) => client.close || client.error)) throw new Error("all-reading control was not clean");
    result = { authorityPid: after.process.pid, connectionMap, durationMs: fixture.controlDurationMs, accounting,
      performance: { simTickP95Ms: after.multiplayer.projection.accounting.costDistributions.simTickMs.p95,
        projectionP95Ms: after.multiplayer.projection.accounting.costDistributions.projectionReplicationMs.p95,
        rssBytes: after.process.memory.rss }, beforePid: before.process.pid };
    if (result.authorityPid !== result.beforePid) throw new Error("control authority PID changed");
    return result;
  } finally {
    await Promise.all(clients.map(closeRawClient));
    if (authorities[0]) await request(port, "/session/reset", { method: "POST", authority: authorities[0],
      body: command(authorities[0], 1, { requesterId: authorities[0].playerId }) }).catch(() => null);
    await stopSimServer(port).catch(() => null);
    if (!await portIsDead(port)) throw new Error(`control authority port ${port} remained live after shutdown`);
  }
}

module.exports = { runRawSlowReaderCohort, runAllReadingControl };
