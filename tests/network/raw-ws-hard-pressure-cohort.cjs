"use strict";

const fs = require("fs");
const net = require("net");
const path = require("path");
const { startSimServer, stopSimServer } = require("../helpers.cjs");
const { waitFor, openRawClient, pauseAfterAuthorityPong, closeRawClient,
  terminateRawClient } = require("./raw-ws-client.cjs");
const { runAllReadingControl, assertPrivateCohort } = require("./raw-ws-slow-reader-cohort.cjs");

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

function exactOne(events, predicate, label) {
  const matches = events.filter(predicate);
  if (matches.length !== 1) throw new Error(`${label} expected exactly one, saw ${matches.length}`);
  return matches[0];
}

async function runRawHardPressureCohort({ fixture, runDir, port }) {
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
  const accounting = { setup: 0, oracle: 0, controllerStimulus: 0, clientHotPath: 0 };
  let readerEvents = 0;
  const record = (entry) => {
    if (++readerEvents > fixture.evidence.maxRawReaderEvents) throw new Error("T2b raw-reader evidence cap exceeded");
    fs.appendFileSync(readerFile, `${JSON.stringify(entry)}\n`);
  };
  let oldImpaired = null;
  let replacement = null;
  try {
    await startSimServer(port, { keepAlive: true, env: { LBH_SIM_WS_ENABLED: "true",
      LBH_PRESSURE_PRELOAD_CONFIG: preloadConfig,
      NODE_OPTIONS: `${process.env.NODE_OPTIONS || ""} --require=${preload}`.trim() } });
    const started = await request(port, "/session/start", { method: "POST", accounting, category: "setup", body: {
      mapId: "shallows", requesterId: "t2b-pilot-0", requesterName: "T2B Pilot 0",
      maxPlayers: fixture.pilotCount } });
    if (started.status !== 200) throw new Error(`T2b session start failed: ${JSON.stringify(started.body)}`);
    for (let index = 0; index < fixture.pilotCount; index += 1) {
      const before = new Set(Object.keys((await request(port, "/health", { accounting })).body
        .multiplayer.adapter.pressure.connections));
      const id = `t2b-pilot-${index}`;
      const joined = await request(port, "/join", { method: "POST", accounting, category: "setup", body: {
        runId: started.body.session.runId, clientId: id,
        joinTicket: index === 0 ? started.body.joinTicket : undefined, name: `T2B Pilot ${index}`,
        equipped: [{ id: `t2b-rig-${index}`, name: `T2B Rig ${index}`, subcategory: "equippable" }] } });
      if (joined.status !== 200) throw new Error(`T2b join ${index} failed: ${JSON.stringify(joined.body)}`);
      authorities.push(joined.body.authority);
      const ticket = await request(port, "/multiplayer/ticket", { method: "POST", authority: joined.body.authority,
        accounting, category: "setup", body: { kind: "admission" } });
      const client = await openRawClient({ port, ticket: ticket.body.ticket, pilotSlot: `pilot-${index}`, record,
        maxFrames: fixture.evidence.maxRawFramesPerClient });
      clients.push(client);
      const after = Object.keys((await request(port, "/health", { accounting })).body
        .multiplayer.adapter.pressure.connections);
      const added = after.filter((key) => !before.has(key));
      if (added.length !== 1) throw new Error("T2b admission scheduler mapping was not exact");
      const welcome = client.frames.find((frame) => frame.type === "welcome");
      connectionMap.push({ pilotSlot: `pilot-${index}`, schedulerOrdinals: [Number(added[0])],
        connectionEpochs: [welcome.connectionEpoch], transitions: [{ kind: "admission", at: welcome._receivedAt }] });
    }
    if (connectionMap.length !== fixture.pilotCount
      || new Set(connectionMap.map((entry) => entry.schedulerOrdinals[0])).size !== fixture.pilotCount) {
      throw new Error(`T2b match did not admit exactly ${fixture.pilotCount} distinct raw clients`);
    }
    assertPrivateCohort(clients, authorities, "t2b");

    const admittedHealth = (await request(port, "/health", { accounting })).body;
    const authorityPid = admittedHealth.process.pid;
    const adapterPolicy = admittedHealth.multiplayer.adapter;
    if (adapterPolicy.backpressureTimeoutMs !== fixture.queuePolicy.backpressureTimeoutMs
      || adapterPolicy.pressure.policy.transportHighWaterBytes !== fixture.queuePolicy.transportHighWaterBytes
      || adapterPolicy.pressure.policy.applicationQueueBytes !== fixture.queuePolicy.maxBytes
      || adapterPolicy.pressure.policy.reliableQueueBytes !== fixture.queuePolicy.maxReliableBytes) {
      throw new Error("T2b fixture does not match production adapter pressure limits");
    }
    const impairedIndex = connectionMap.findIndex((entry) => entry.pilotSlot === fixture.impairedPilot);
    if (impairedIndex < 0 || impairedIndex !== fixture.pilotCount - 1) {
      throw new Error(`fixture impaired pilot must be the final admitted identity: ${fixture.impairedPilot}`);
    }
    oldImpaired = clients[impairedIndex];
    const oldMap = connectionMap[impairedIndex];
    const impairedAuthority = authorities[impairedIndex];
    const oldOrdinal = oldMap.schedulerOrdinals[0];
    const oldWelcome = oldImpaired.frames.find((frame) => frame.type === "welcome");
    const authorityPong = await waitFor(() => readJsonl(pressureFile).find((event) =>
      event.type === "heartbeat-pong" && event.schedulerConnectionId === oldOrdinal),
    "T2b authority-validated pong", 15000);
    const baselinePublic = [...oldImpaired.frames].reverse().find((frame) => frame.type === "publicState");
    const baselineOwner = [...oldImpaired.frames].reverse().find((frame) => frame.type === "ownerState"
      && frame.snapshotId === baselinePublic.snapshotId);
    if (!baselineOwner) throw new Error("T2b pre-pause aligned baseline unavailable");
    const cursor = { lastRunId: started.body.session.runId, lastSnapshotId: baselinePublic.snapshotId,
      lastEventSeq: baselinePublic.lastEventSeq };
    await pauseAfterAuthorityPong(oldImpaired, authorityPong, fixture.readGateGuardMs, record);
    const high = await waitFor(() => readJsonl(pressureFile).find((event) =>
      event.type === "transport-high-enter" && event.schedulerConnectionId === oldOrdinal),
    "T2b transport high", 12000);
    const tB = high.pressure.backpressuredSince;
    if (tB >= authorityPong.nextHeartbeatTimeoutEligibleAt) throw new Error("T2b high became heartbeat eligible");
    const highCounts = high.pressure.counts;
    const issued = [];
    for (let index = 0; index < fixture.stimulus.count; index += 1) {
      const unequip = index % 2 === 0;
      const response = await request(port, "/inventory/action", { method: "POST", authority: impairedAuthority,
        accounting, category: "controllerStimulus", body: command(impairedAuthority, index + 1, unequip
          ? { action: "unequip", equipSlot: 0 }
          : { action: "equipCargo", cargoSlot: 0, equipSlot: 0 }) });
      if (response.status !== 200) throw new Error(`T2b stimulus ${index + 1} failed`);
      issued.push({ ordinal: index + 1, action: unequip ? "unequip" : "equipCargo", at: Date.now() });
    }
    if (Date.now() - tB > fixture.burstWithinMs) throw new Error("T2b eight-event burst missed tB +800ms");
    await waitFor(async () => {
      const detail = (await request(port, "/health", { accounting })).body.multiplayer.adapter.pressure
        .connections[String(oldOrdinal)];
      return detail?.counts.reliableQueued >= highCounts.reliableQueued + 8 ? detail : null;
    }, "T2b eight queued consequences", 500);

    const cleanup = await waitFor(() => readJsonl(pressureFile).find((event) =>
      event.type === "connection-cleanup" && event.schedulerConnectionId === oldOrdinal),
    "T2b pressured connection cleanup", 7000);
    let events = readJsonl(pressureFile);
    const policy = exactOne(events, (event) => event.type === "queue-policy"
      && event.schedulerConnectionId === oldOrdinal && event.action === "disconnect"
      && event.reason === "backpressure-timeout", "T2b disconnect policy");
    const close = exactOne(events, (event) => event.type === "close-dispatched"
      && event.schedulerConnectionId === oldOrdinal, "T2b close dispatch");
    const oldPolicies = events.filter((event) => event.type === "queue-policy"
      && event.schedulerConnectionId === oldOrdinal);
    const sweeps = events.filter((event) => event.type === "pressure-sweep"
      && event.schedulerConnectionId === oldOrdinal && event.timestamp >= tB);
    const firstEligible = sweeps.find((event) => event.actualAt - tB >= fixture.queuePolicy.backpressureTimeoutMs);
    const firstEligibleIndex = events.indexOf(firstEligible);
    const policyIndex = events.indexOf(policy);
    const nextImpairedSweepIndex = events.findIndex((event, index) => index > firstEligibleIndex
      && event.type === "pressure-sweep" && event.schedulerConnectionId === oldOrdinal);
    if (!firstEligible || firstEligible.pressure.transportHigh !== true
      || policyIndex <= firstEligibleIndex
      || (nextImpairedSweepIndex >= 0 && policyIndex >= nextImpairedSweepIndex)
      || sweeps.some((event) => event.actualAt - event.scheduledAt > fixture.queuePolicy.maxSweepLatenessMs)) {
      throw new Error("T2b timeout was not dispatched on the first punctual eligible pressure sweep");
    }
    if (oldPolicies.length !== 1 || close.code !== 4008 || close.transportCode !== 1013
      || close.reason !== "backpressure timeout" || cleanup.timestamp < policy.timestamp
      || cleanup.timestamp > policy.timestamp + adapterPolicy.closeGraceMs + adapterPolicy.sweepIntervalMs
        + fixture.queuePolicy.maxSweepLatenessMs) {
      throw new Error("T2b server fence cause/ordering mismatch");
    }
    const oldMaximum = cleanup.pressure.maximum;
    if (oldMaximum.queuedBytes > fixture.queuePolicy.maxBytes
      || oldMaximum.reliableBytes > fixture.queuePolicy.maxReliableBytes
      || oldMaximum.replayEventBytes > adapterPolicy.pressure.policy.replayEventBytes) {
      throw new Error("T2b pressured connection exceeded a production queue/retention cap");
    }
    const oldQueued = events.filter((event) => event.type === "reliable-queued"
      && event.schedulerConnectionId === oldOrdinal
      && event.reliableId > highCounts.reliableQueued
      && event.reliableId <= highCounts.reliableQueued + fixture.stimulus.count);
    const oldAccepted = events.filter((event) => event.type === "reliable-ws-send-accepted"
      && event.schedulerConnectionId === oldOrdinal && oldQueued.some((queued) => queued.reliableId === event.reliableId));
    const allOldQueued = events.filter((event) => event.type === "reliable-queued"
      && event.schedulerConnectionId === oldOrdinal && event.timestamp <= cleanup.timestamp);
    const allOldRetiredIds = new Set(events.filter((event) => event.type === "reliable-ack-retired"
      && event.schedulerConnectionId === oldOrdinal && event.timestamp <= cleanup.timestamp && event.removedCount > 0)
      .map((event) => event.reliableId));
    const cleanupReset = allOldQueued.filter((event) => !allOldRetiredIds.has(event.reliableId));
    if (cleanupReset.length !== cleanup.pressure.counts.reliableResetOnCleanup
      || oldQueued.some((event) => !cleanupReset.some((reset) => reset.reliableId === event.reliableId))) {
      throw new Error("T2b cleanup-reset identities did not close the cleanup counter exactly");
    }
    if (oldQueued.length !== 8 || new Set(oldQueued.map((event) => event.reliableId)).size !== 8
      || oldAccepted.length !== 0 || oldQueued.some((event, index) => index &&
        (event.pressure.current.reliableMessages <= oldQueued[index - 1].pressure.current.reliableMessages
          || event.pressure.current.reliableBytes <= oldQueued[index - 1].pressure.current.reliableBytes))) {
      throw new Error("T2b old-epoch reliable queue ledger was not exact and unsent");
    }

    const beforeResume = new Set(Object.keys((await request(port, "/health", { accounting })).body
      .multiplayer.adapter.pressure.connections));
    const resumeTicket = await request(port, "/multiplayer/ticket", { method: "POST", authority: oldWelcome,
      accounting, category: "setup", body: { kind: "resume" } });
    replacement = await openRawClient({ port, ticket: resumeTicket.body.ticket, kind: "resume", cursors: cursor,
      pilotSlot: fixture.replacementPilot, record, maxFrames: fixture.evidence.maxRawFramesPerClient });
    clients.push(replacement);
    const afterResume = Object.keys((await request(port, "/health", { accounting })).body
      .multiplayer.adapter.pressure.connections);
    const added = afterResume.filter((key) => !beforeResume.has(key));
    if (added.length !== 1) throw new Error("T2b resume scheduler mapping was not exact");
    const newOrdinal = Number(added[0]);
    const newWelcome = replacement.frames.find((frame) => frame.type === "welcome");
    oldMap.schedulerOrdinals.push(newOrdinal);
    oldMap.connectionEpochs.push(newWelcome.connectionEpoch);
    oldMap.transitions.push({ kind: "resume", at: newWelcome._receivedAt });
    if (newOrdinal === oldOrdinal || newWelcome.connectionEpoch <= oldWelcome.connectionEpoch
      || newWelcome.reconnected !== true) throw new Error("T2b resume did not rotate socket ordinal and epoch");
    const order = ["welcome", "rebase", "publicState", "ownerState"].map((type) =>
      replacement.frames.findIndex((frame) => frame.type === type));
    if (!order.every((value, index) => value >= 0 && (!index || value > order[index - 1]))) {
      throw new Error(`T2b resume baseline was not aligned: ${JSON.stringify(order)}`);
    }
    await waitFor(() => replacement.frames.filter((frame) => frame.type === "event"
      && frame.eventType === "player.inventoryAction").length >= 8, "T2b replayed consequences", 5000);
    const stableEventSeqs = oldQueued.map((event) => event.eventSeq);
    const replayed = replacement.frames.filter((frame) => frame.type === "event"
      && frame.eventType === "player.inventoryAction" && stableEventSeqs.includes(frame.eventSeq));
    const replayByEventSeq = new Map();
    for (const frame of replayed) replayByEventSeq.set(frame.eventSeq, (replayByEventSeq.get(frame.eventSeq) || 0) + 1);
    if (replayed.length !== 8 || stableEventSeqs.some((eventSeq) => replayByEventSeq.get(eventSeq) !== 1)
      || oldImpaired.frames.some((frame) => frame.type === "event" && stableEventSeqs.includes(frame.eventSeq))
      || replayed.some((frame, index) => frame.payload.action !== issued[index].action || frame._bytes > 4096)) {
      throw new Error("T2b replay was not exact-once FIFO with stable consequence identities");
    }
    replacement.ws.send(JSON.stringify({ type: "input", inputSeq: 1, moveX: 1, moveY: 0, thrust: 1,
      brake: 0, slingshot: false, ability1: false, ability2: false, clientTimeMs: Date.now() }));
    await waitFor(() => replacement.frames.find((frame) => frame.type === "ack"
      && frame.ackKind === "input" && frame.inputSeq >= 1), "T2b covering input ACK", 3000);
    await waitFor(() => {
      const fresh = readJsonl(pressureFile);
      const acceptedIds = fresh.filter((event) => event.type === "reliable-ws-send-accepted"
        && event.schedulerConnectionId === newOrdinal && stableEventSeqs.includes(event.eventSeq))
        .map((event) => event.reliableId);
      const retired = fresh.filter((event) => event.type === "reliable-ack-retired"
        && event.schedulerConnectionId === newOrdinal && acceptedIds.includes(event.reliableId)
        && event.removedCount > 0);
      return new Set(retired.map((event) => event.reliableId)).size === 8;
    }, "T2b replay ACK retirement", 3000);

    const finalHealth = (await request(port, "/health", { accounting })).body;
    events = readJsonl(pressureFile);
    const details = finalHealth.multiplayer.adapter.pressure.connections;
    const healthy = connectionMap.filter((_, index) => index !== impairedIndex).map(({ schedulerOrdinals }) => ({
      schedulerConnectionId: schedulerOrdinals[0], ...details[String(schedulerOrdinals[0])] }));
    if (healthy.length !== fixture.pilotCount - 1
      || healthy.some((entry) => entry.connectionEpoch !== 1
      || entry.counts.highWaterCrossings || entry.counts.rebases
      || entry.counts.disconnects || entry.maximum.wsBufferedBytes >= fixture.queuePolicy.transportHighWaterBytes)) {
      throw new Error("T2b healthy-peer isolation failed");
    }
    if (finalHealth.process.pid !== authorityPid || finalHealth.session?.overloadState !== "NORMAL") {
      throw new Error("T2b authority identity/mode changed");
    }
    if (clients.slice(0, -2).some((client) => client.close || client.error) || replacement.close || replacement.error) {
      throw new Error("T2b healthy/replacement raw client error or close observed");
    }
    const expectedSetupRequests = 2 + (fixture.pilotCount * 2);
    if (accounting.setup !== expectedSetupRequests || accounting.controllerStimulus !== fixture.stimulus.count
      || accounting.clientHotPath !== 0) {
      throw new Error(`T2b HTTP accounting mismatch: ${JSON.stringify(accounting)}`);
    }
    if (events.length > fixture.evidence.maxPressureEvents || readerEvents > fixture.evidence.maxRawReaderEvents
      || finalHealth.multiplayer.adapter.pressure.observer.failures !== 0) {
      throw new Error("T2b bounded evidence/observer gate failed");
    }
    const replayAccepted = events.filter((event) => event.type === "reliable-ws-send-accepted"
      && event.schedulerConnectionId === newOrdinal && stableEventSeqs.includes(event.eventSeq));
    const replayReliableIds = replayAccepted.map((event) => event.reliableId);
    const replayRetired = events.filter((event) => event.type === "reliable-ack-retired"
      && event.schedulerConnectionId === newOrdinal && replayReliableIds.includes(event.reliableId) && event.removedCount > 0);
    if (replayAccepted.length !== 8 || replayRetired.length !== 8) throw new Error("T2b replacement ledger cardinality failed");
    const readerLedger = readJsonl(readerFile);
    const replacementBaselineAcks = readerLedger.filter((event) => event.type === "baseline-ack"
      && event.pilotSlot === fixture.replacementPilot);
    const replayDeliveryAcks = readerLedger.filter((event) => event.type === "delivery-ack"
      && event.pilotSlot === fixture.replacementPilot && stableEventSeqs.includes(event.eventSeq));
    const replayEventAcks = readerLedger.filter((event) => event.type === "event-ack"
      && event.pilotSlot === fixture.replacementPilot && stableEventSeqs.includes(event.eventSeq));
    if (replacementBaselineAcks.length !== 1 || replayDeliveryAcks.length !== 8 || replayEventAcks.length !== 8
      || stableEventSeqs.some((eventSeq) => replayDeliveryAcks.filter((event) => event.eventSeq === eventSeq).length !== 1
        || replayEventAcks.filter((event) => event.eventSeq === eventSeq).length !== 1)) {
      throw new Error("T2b baseline/delivery/event ACK evidence was not exact-one");
    }

    const oldStateOffered = events.filter((event) => event.type === "state-offered"
      && event.schedulerConnectionId === oldOrdinal && event.timestamp >= tB && event.timestamp <= cleanup.timestamp);
    const oldStateCoalesced = events.filter((event) => event.type === "state-coalesced"
      && event.schedulerConnectionId === oldOrdinal && event.timestamp >= tB && event.timestamp <= cleanup.timestamp);
    const oldStateAccepted = events.filter((event) => event.type === "state-ws-send-accepted"
      && event.schedulerConnectionId === oldOrdinal && event.timestamp >= tB && event.timestamp <= cleanup.timestamp);
    const oldOfferedIds = new Set(oldStateOffered.map((event) => event.snapshotId));
    const oldReceived = oldImpaired.frames.filter((frame) =>
      (frame.type === "publicState" || frame.type === "ownerState") && oldOfferedIds.has(frame.snapshotId));
    const replacementStateAccepted = events.filter((event) => event.type === "state-ws-send-accepted"
      && event.schedulerConnectionId === newOrdinal);
    const replacementStates = replacement.frames.filter((frame) =>
      frame.type === "publicState" || frame.type === "ownerState");
    if (replacementStates.length % 2 !== 0) throw new Error("T2b replacement received an incomplete state pair");
    const replacementPairs = [];
    for (let index = 0; index < replacementStates.length; index += 2) {
      const publicFrame = replacementStates[index];
      const ownerFrame = replacementStates[index + 1];
      const publicAccepted = replacementStateAccepted.filter((event) =>
        event.snapshotId === publicFrame.snapshotId && event.frameClass === "publicState");
      const ownerAccepted = replacementStateAccepted.filter((event) =>
        event.snapshotId === ownerFrame.snapshotId && event.frameClass === "ownerState");
      if (publicFrame.type !== "publicState" || ownerFrame.type !== "ownerState"
        || publicFrame.snapshotId !== ownerFrame.snapshotId
        || publicAccepted.length !== 1 || ownerAccepted.length !== 1) {
        throw new Error(`T2b replacement state pair ${publicFrame.snapshotId} lacked exact acceptance coverage`);
      }
      replacementPairs.push({ snapshotId: publicFrame.snapshotId,
        received: { publicAt: publicFrame._receivedAt, ownerAt: ownerFrame._receivedAt },
        wsSendAccepted: { publicAt: publicAccepted[0].timestamp, ownerAt: ownerAccepted[0].timestamp } });
    }
    const absentAlignedSnapshotIds = [...oldOfferedIds].filter((snapshotId) =>
      !oldReceived.some((frame) => frame.snapshotId === snapshotId));
    if (oldReceived.length !== 0 || absentAlignedSnapshotIds.length !== oldOfferedIds.size) {
      throw new Error("T2b old socket gained application-visible high-window state");
    }
    const stateLedgerEntries = oldStateOffered.length + oldStateCoalesced.length + oldStateAccepted.length
      + oldReceived.length + replacementStateAccepted.length + replacementPairs.length;
    const reliableLedgerEntries = allOldQueued.length + cleanupReset.length + oldAccepted.length
      + replayed.length + replayAccepted.length + replayRetired.length
      + replayDeliveryAcks.length + replayEventAcks.length + replacementBaselineAcks.length;
    if (stateLedgerEntries > fixture.evidence.maxStateLedgerEntries
      || reliableLedgerEntries > fixture.evidence.maxReliableLedgerEntries) {
      throw new Error("T2b state/reliable evidence cap exceeded");
    }

    const pressureCost = finalHealth.multiplayer.projection.accounting.costDistributions;
    const performance = { simTickP95Ms: pressureCost.simTickMs.p95,
      projectionP95Ms: pressureCost.projectionReplicationMs.p95, rssBytes: finalHealth.process.memory.rss };
    fs.writeFileSync(path.join(runDir, "reliable-ledger.json"), `${JSON.stringify({ issued,
      oldEpoch: { ordinal: oldOrdinal, queued: oldQueued.map((event) => ({ reliableId: event.reliableId,
        eventSeq: event.eventSeq, timestamp: event.timestamp, byteLength: event.byteLength })), wsSendAccepted: [],
        cleanupReset: cleanupReset.map((event) => ({ reliableId: event.reliableId, eventSeq: event.eventSeq,
          burstIdentity: oldQueued.some((burst) => burst.reliableId === event.reliableId) })) },
      replacementEpoch: { ordinal: newOrdinal, received: replayed.map((frame) => ({ deliveryId: frame.deliveryId,
        eventSeq: frame.eventSeq, action: frame.payload.action, receivedAt: frame._receivedAt })),
        wsSendAccepted: replayAccepted.map((event) => ({ reliableId: event.reliableId, timestamp: event.timestamp })),
        baselineAck: replacementBaselineAcks[0], deliveryAcks: replayDeliveryAcks,
        eventAcks: replayEventAcks,
        ackRetired: replayRetired.map((event) => ({ reliableId: event.reliableId, timestamp: event.timestamp })) },
      assertions: { eightOldQueuedZeroOldAccepted: true, stableIdentityReplayExactlyOnce: true,
        semanticConsumptionExactlyOnce: true, exactOneBaselineDeliveryAndEventAcks: true,
        cleanupResetIdentitySetMatchesCounter: true, allReplayAckRetired: true },
      evidenceCounts: { entries: reliableLedgerEntries, cap: fixture.evidence.maxReliableLedgerEntries } }, null, 2)}\n`, { flag: "wx" });
    const resumeRebase = replacement.frames.find((frame) => frame.type === "rebase");
    const resumeBaseline = replacement.frames.filter((frame) =>
      frame.type === "publicState" || frame.type === "ownerState").slice(0, 2);
    fs.writeFileSync(path.join(runDir, "state-ledger.json"), `${JSON.stringify({ resumeOrder: order,
      cursor: { lastSnapshotId: cursor.lastSnapshotId, lastEventSeq: cursor.lastEventSeq },
      rebase: { reason: resumeRebase.reason, snapshotId: resumeRebase.snapshotId,
        lastEventSeq: resumeRebase.lastEventSeq },
      baseline: resumeBaseline.map((frame) => ({ type: frame.type, snapshotId: frame.snapshotId,
        lastEventSeq: frame.lastEventSeq, receivedAt: frame._receivedAt })),
      oldEpochHighWindow: {
        offered: oldStateOffered.map((event) => ({ snapshotId: event.snapshotId,
          queueAction: event.queueAction, timestamp: event.timestamp })),
        coalesced: oldStateCoalesced.map((event) => ({ snapshotId: event.snapshotId, timestamp: event.timestamp })),
        wsSendAccepted: oldStateAccepted.map((event) => ({ snapshotId: event.snapshotId,
          frameClass: event.frameClass, timestamp: event.timestamp })),
        received: oldReceived.map((frame) => ({ snapshotId: frame.snapshotId, frameClass: frame.type,
          receivedAt: frame._receivedAt })), absentAlignedSnapshotIds },
      replacementEpoch: {
        wsSendAccepted: replacementStateAccepted.map((event) => ({ snapshotId: event.snapshotId,
          frameClass: event.frameClass, timestamp: event.timestamp })), receivedPairs: replacementPairs },
      assertions: { alignedBaselineBeforeReplay: true, coveringInputAck: true,
        oldHighWindowApplicationVisibilityAbsent: true, everyReplacementPairHasExactAcceptancePair: true },
      evidenceCounts: { entries: stateLedgerEntries, cap: fixture.evidence.maxStateLedgerEntries } }, null, 2)}\n`, { flag: "wx" });
    fs.writeFileSync(path.join(runDir, "healthy-peers.json"), `${JSON.stringify(healthy, null, 2)}\n`, { flag: "wx" });
    fs.writeFileSync(path.join(runDir, "pressure-performance.json"), `${JSON.stringify(performance, null, 2)}\n`, { flag: "wx" });
    return { passed: true, authorityPid, tB, tD: policy.timestamp, tC: cleanup.timestamp,
      oldOrdinal, newOrdinal, oldEpoch: oldWelcome.connectionEpoch, newEpoch: newWelcome.connectionEpoch,
      connectionMap, performance, accounting };
  } finally {
    if (oldImpaired?.paused) terminateRawClient(oldImpaired);
    await Promise.all(clients.filter((client) => client !== oldImpaired).map(closeRawClient));
    if (authorities[0]) await request(port, "/session/reset", { method: "POST", authority: authorities[0],
      body: command(authorities[0], 1, { requesterId: authorities[0].playerId }) }).catch(() => null);
    const preShutdown = await request(port, "/health").catch(() => null);
    if (preShutdown) {
      const { currentRunId: _currentRunId, ...adapter } = preShutdown.body.multiplayer.adapter;
      const { runId: _runId, ...tickets } = preShutdown.body.multiplayer.tickets;
      fs.writeFileSync(path.join(runDir, "pre-shutdown-health.json"),
        `${JSON.stringify({ multiplayer: { adapter, tickets } }, null, 2)}\n`, { flag: "wx" });
    }
    await stopSimServer(port).catch(() => null);
    if (!await portIsDead(port)) throw new Error(`T2b authority port ${port} remained live after shutdown`);
  }
}

module.exports = { runRawHardPressureCohort, runAllReadingControl };
