"use strict";

const crypto = require("crypto");
const fs = require("fs");
const net = require("net");
const path = require("path");
const { startSimServer, stopSimServer } = require("../helpers.cjs");
const { openRawClient, sendRawClientFrame, closeRawClient, terminateRawClient, waitFor } = require("./raw-ws-client.cjs");

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const digest = (salt, value) => crypto.createHash("sha256").update(`${salt}:${value}`).digest("hex");

function createBoundedJsonl(file, fixture) {
  fs.writeFileSync(file, "", { flag: "wx" });
  let bytes = 0;
  let records = 0;
  return (entry) => {
    const line = `${JSON.stringify(entry)}\n`;
    const lineBytes = Buffer.byteLength(line);
    if (records + 1 > fixture.evidence.maxJsonlRecords || bytes + lineBytes > fixture.evidence.maxJsonlBytes) {
      throw new Error(`evidence cap exceeded for ${path.basename(file)}`);
    }
    fs.appendFileSync(file, line, { encoding: "utf8" });
    records += 1;
    bytes += lineBytes;
  };
}

function writeExclusive(file, value) {
  fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`, { flag: "wx" });
}

async function request(port, pathname, { method = "GET", body, authority, accounting }) {
  const headers = { "content-type": "application/json", connection: "close" };
  if (authority) {
    headers["x-lbh-command-credential"] = authority.commandCredential;
    headers["x-lbh-player-id"] = authority.playerId;
    headers["x-lbh-run-id"] = authority.runId;
  }
  const response = await fetch(`http://127.0.0.1:${port}${pathname}`, {
    method, headers, body: body === undefined ? undefined : JSON.stringify(body),
  });
  accounting[`${method} ${pathname} ${response.status}`] = (accounting[`${method} ${pathname} ${response.status}`] || 0) + 1;
  return { status: response.status, body: await response.json() };
}

function command(authority, commandSeq, extra = {}) {
  return { runId: authority.runId, playerId: authority.playerId,
    commandCredential: authority.commandCredential, commandSeq, ...extra };
}

function safeHealth(body, plannedElapsedMs, actualElapsedMs) {
  const adapter = body.multiplayer?.adapter || {};
  const pressure = adapter.pressure || {};
  const tickets = body.multiplayer?.tickets || {};
  const session = body.session || {};
  const pressureCountFields = ["queuedMessages", "reliableMessages", "replayEventCount", "pendingInboundCount",
    "pendingSendCount", "scheduledSendCount"];
  const pressureCountMaxima = Object.fromEntries(pressureCountFields.map((name) => [name,
    Math.max(0, ...Object.values(pressure.connections || {}).map((entry) => Number(entry.maximum?.[name]) || 0))]));
  return {
    plannedElapsedMs, actualElapsedMs, pid: body.process?.pid ?? null, tick: body.tick ?? null, playerCount: body.playerCount ?? null,
    rss: body.process?.memory?.rss ?? body.process?.rss ?? null,
    heapUsed: body.process?.memory?.heapUsed ?? body.process?.heapUsed ?? null,
    overloadState: session.overloadState ?? null,
    clients: body.multiplayer?.memberships?.active ?? body.session?.players ?? null,
    adapter: { connections: adapter.connections, bound: adapter.bound, closing: adapter.closing,
      queuedBytes: adapter.queuedBytes, queuedMessages: adapter.queuedMessages,
      pendingScheduledSends: adapter.pendingScheduledSends, livenessTimers: adapter.livenessTimers,
      highWaterCrossings: pressure.policy?.transportHighWaterCrossings,
      queuePolicyEvents: pressure.policy?.queuePolicyEvents,
      observerFailures: pressure.observer?.failures,
      pressureCurrent: pressure.current, pressureMaxima: pressure.maxima, pressureCountMaxima,
      pressurePolicy: pressure.policy },
    tickets: { retained: tickets.retained, capacity: tickets.capacity, pending: tickets.counts?.pending,
      issued: tickets.counts?.issued, redeemed: tickets.counts?.redeemed },
    projection: body.multiplayer?.projection || null,
    retention: { eventJournal: body.eventJournal ? { capacity: body.eventJournal.capacity,
      retainedCount: body.eventJournal.retainedCount, stats: body.eventJournal.stats } : null,
      snapshotRing: body.snapshotRing ? { capacity: body.snapshotRing.capacity,
        retainedCount: body.snapshotRing.retainedCount, stats: body.snapshotRing.stats } : null,
      actions: body.multiplayer?.actions, memberships: body.multiplayer?.memberships,
      adapterEventReplay: body.multiplayer?.adapter?.eventReplay },
    soakDiagnostics: body.soakDiagnostics || null,
  };
}

async function portIsDead(port) {
  return new Promise((resolve) => {
    const socket = net.connect({ host: "127.0.0.1", port }, () => { socket.destroy(); resolve(false); });
    socket.once("error", () => resolve(true));
  });
}

async function runEightPlayerSoak({ fixture, schedule, runDir, port, commit, dirty, timeScale = 1,
  aborted = () => null }) {
  const salt = crypto.randomBytes(32).toString("hex");
  const files = Object.fromEntries(["authority-health", "runtime-windows", "client-ledger", "membership-ledger", "reliable-ledger", "schedule-execution"]
    .map((name) => [name, createBoundedJsonl(path.join(runDir, `${name}.jsonl`), fixture)]));
  const accounting = {};
  const gcFile = path.join(runDir, "forced-gc.jsonl");
  const diagnosticsCleanupFile = path.join(runDir, "diagnostics-cleanup.jsonl");
  const resourceFile = path.join(runDir, "authority-resources.jsonl");
  fs.writeFileSync(gcFile, "", { flag: "wx" });
  fs.writeFileSync(diagnosticsCleanupFile, "", { flag: "wx" });
  fs.writeFileSync(resourceFile, "", { flag: "wx" });
  const readJsonl = (file) => fs.readFileSync(file, "utf8").trim().split("\n").filter(Boolean).map((line) => JSON.parse(line));
  const clients = Array(8).fill(null);
  const allClients = [];
  const authorities = Array(8).fill(null);
  const incarnations = Array(8).fill(0);
  const markerHistory = Array.from({ length: 8 }, () => []);
  const ordinals = Array.from({ length: 8 }, () => []);
  const commandSeq = Array(8).fill(0);
  const actionSeq = Array(8).fill(0);
  const inputSeq = Array(8).fill(0);
  const initialEpochs = Array(8).fill(null);
  const actionOutcomes = new Map();
  const eventAckLedger = { decisions: 0, withheld: 0, deliveryAcks: 0, eventAcks: 0 };
  const eventAckFacts = new Map();
  const healthSamples = [];
  const runtimeWindows = new Map();
  const recoveryLedger = [];
  const cycleConsequenceEvidence = [];
  const membershipCounts = { initialAdmissions: 0, replacementAdmissions: 0, reconnects: 0, leaves: 0,
    invalidatedTicketRejections: 0, closedSocketAckWriteRejections: 0 };
  const authorityRunHashes = new Set();
  const fencedClients = [];
  let heldEventTarget = null;
  let heldEventObserved = null;
  let maxScheduleLatenessMs = 0;
  let lastDiagnosticStatus = null;
  let measuredGates = {};
  const startedAt = Date.now();
  const monotonicStarted = performance.now();
  let authorityPid = null;
  let authorityRunHash = null;
  let stopped = false;
  let failure = null;
  let lastBarrier = "created";
  let checkpointTimer = null;
  let checkpointTimerStopped = false;
  const recordClient = (entry) => files["client-ledger"]({ elapsedMs: Math.round(performance.now() - monotonicStarted), ...entry });
  const clientRecord = (seat) => (entry) => {
    const ackKey = entry.eventSeq == null || entry.deliveryId == null ? null
      : `${entry.pilotSlot}:${entry.eventSeq}:${entry.deliveryId}`;
    if (entry.type === "event-ack-decision") {
      eventAckLedger.decisions += 1;
      if (entry.withheld) eventAckLedger.withheld += 1;
      const fact = eventAckFacts.get(ackKey) || { decisions: 0, deliveryAcks: 0, eventAcks: 0, withheld: false };
      fact.decisions += 1;
      fact.withheld ||= entry.withheld;
      eventAckFacts.set(ackKey, fact);
    } else if (entry.type === "delivery-ack") {
      eventAckLedger.deliveryAcks += 1;
      const fact = eventAckFacts.get(ackKey) || { decisions: 0, deliveryAcks: 0, eventAcks: 0, withheld: false };
      fact.deliveryAcks += 1;
      eventAckFacts.set(ackKey, fact);
    } else if (entry.type === "event-ack") {
      eventAckLedger.eventAcks += 1;
      const fact = eventAckFacts.get(ackKey) || { decisions: 0, deliveryAcks: 0, eventAcks: 0, withheld: false };
      fact.eventAcks += 1;
      eventAckFacts.set(ackKey, fact);
    }
    if (entry.type === "frame" && !["welcome", "rebase", "ack", "event"].includes(entry.frameType)) return;
    recordClient({ seat, incarnation: incarnations[seat], ...entry, pilotSlot: undefined,
      deliveryId: entry.deliveryId == null ? null : digest(salt, entry.deliveryId) });
  };
  const checkpoint = () => {
    const value = { profile: fixture.profile, scheduleHash: schedule.scheduleHash,
      elapsedMs: Math.round(performance.now() - monotonicStarted), lastBarrier,
      admissions: incarnations.reduce((sum, value) => sum + (value > 0 ? 1 : 0), 0),
      actions: actionOutcomes.size, eventAckLedger: { ...eventAckLedger }, incarnations: [...incarnations],
      sampler: lastDiagnosticStatus?.accounting || null, httpAccounting: { ...accounting },
      owned: { pid: authorityPid, port } };
    const target = path.join(runDir, "checkpoint.json");
    const temp = `${target}.tmp`;
    fs.writeFileSync(temp, `${JSON.stringify(value, null, 2)}\n`);
    fs.renameSync(temp, target);
  };
  const getHealth = async (elapsedMs) => {
    const response = await request(port, "/health", { accounting });
    if (response.status !== 200) throw new Error(`health returned ${response.status}`);
    const actualElapsedMs = Math.round(performance.now() - monotonicStarted);
    const safe = safeHealth(response.body, elapsedMs, actualElapsedMs);
    safe.trafficBySeat = Array.from({ length: 8 }, (_, seat) => {
      const seatClients = allClients.filter((client) => client.pilotSlot.startsWith(`seat-${seat}`));
      return { seat, receivedBytes: seatClients.reduce((sum, client) => sum + client.rawBytes, 0),
        sentBytes: seatClients.reduce((sum, client) => sum + client.sentBytes, 0),
        inputAcks: seatClients.reduce((sum, client) => sum + client.frames.filter((frame) => frame.type === "ack"
          && frame.ackKind === "input").length, 0),
        actionAcks: seatClients.reduce((sum, client) => sum + client.frames.filter((frame) => frame.type === "ack"
          && frame.ackKind === "action").length, 0) };
    });
    healthSamples.push({ plannedElapsedMs: elapsedMs, actualElapsedMs, safe });
    files["authority-health"](safe);
    if (safe.soakDiagnostics) {
      lastDiagnosticStatus = safe.soakDiagnostics;
      for (const window of safe.soakDiagnostics.completedWindows || []) {
        runtimeWindows.set(window.endedMonotonicMs, window);
      }
      files["runtime-windows"]({ elapsedMs, accounting: safe.soakDiagnostics.accounting,
        currentWindow: safe.soakDiagnostics.currentWindow, completedWindows: safe.soakDiagnostics.completedWindows });
    }
    if (authorityPid !== null && safe.pid !== authorityPid) throw new Error("authority PID changed during smoke");
    return { raw: response.body, safe };
  };
  const issueTicket = async (seat, kind) => {
    const response = await request(port, "/multiplayer/ticket", { method: "POST", authority: authorities[seat], accounting,
      body: { kind } });
    if (response.status !== 200) throw new Error(`${kind} ticket failed for seat ${seat}`);
    return response.body.ticket;
  };
  const captureOrdinal = async (before, seat) => {
    const health = await getHealth(Math.round(performance.now() - monotonicStarted));
    const after = Object.keys(health.raw.multiplayer.adapter.pressure.connections || {});
    const added = after.filter((entry) => !before.has(entry));
    if (added.length !== 1) throw new Error(`seat ${seat} did not add exactly one scheduler ordinal`);
    ordinals[seat].push(Number(added[0]));
  };
  const admit = async (seat, started, replacement = false) => {
    const beforeHealth = await getHealth(Math.round(performance.now() - monotonicStarted));
    const before = new Set(Object.keys(beforeHealth.raw.multiplayer.adapter.pressure.connections || {}));
    incarnations[seat] += 1;
    const id = `soak-seat-${seat}`;
    const marker = `soak-secret-${seat}-${incarnations[seat]}`;
    markerHistory[seat].push(marker);
    const joined = await request(port, "/join", { method: "POST", accounting, body: {
      runId: started.session.runId, clientId: id, joinTicket: !replacement && seat === 0 ? started.joinTicket : undefined,
      name: `Soak Seat ${seat}`, equipped: [{ id: marker,
        name: `Soak Rig ${seat}`, subcategory: "equippable" }],
    } });
    if (joined.status !== 200) throw new Error(`join failed for seat ${seat}: ${JSON.stringify(joined.body)}`);
    authorities[seat] = joined.body.authority;
    const ticket = await issueTicket(seat, "admission");
    clients[seat] = await openRawClient({ port, ticket, pilotSlot: `seat-${seat}`,
      record: clientRecord(seat), maxFrames: fixture.evidence.maxRawFramesPerClient,
      shouldWithholdEventAck({ frame }) {
        const matches = heldEventTarget?.seat === seat && frame.type === "event"
          && frame.eventType === heldEventTarget.eventType
          && frame.payload?.action === heldEventTarget.action;
        if (matches) heldEventObserved = frame;
        return matches;
      } });
    allClients.push(clients[seat]);
    await captureOrdinal(before, seat);
    const welcome = clients[seat].frames.find((frame) => frame.type === "welcome");
    initialEpochs[seat] = welcome.connectionEpoch;
    commandSeq[seat] = welcome.lastCommandSeq;
    actionSeq[seat] = welcome.lastActionSeq;
    files["membership-ledger"]({ type: replacement ? "replacement-admission" : "initial-admission", seat,
      incarnation: incarnations[seat], membershipHash: digest(salt, authorities[seat].membershipId),
      playerHash: digest(salt, authorities[seat].playerId), epoch: welcome.connectionEpoch,
      ordinal: ordinals[seat].at(-1), elapsedMs: Math.round(performance.now() - monotonicStarted) });
    membershipCounts[replacement ? "replacementAdmissions" : "initialAdmissions"] += 1;
  };
  const assertPrivateIsolation = () => {
    const currentMarkers = markerHistory.map((entries) => entries.at(-1));
    const allMarkers = markerHistory.flat();
    for (let seat = 0; seat < 8; seat += 1) {
      const owner = [...clients[seat].frames].reverse().find((frame) => frame.type === "ownerState");
      const ownerWire = JSON.stringify(owner);
      if (!owner || !ownerWire.includes(currentMarkers[seat])
        || markerHistory[seat].slice(0, -1).some((marker) => ownerWire.includes(marker))) {
        throw new Error(`seat ${seat} owner marker lineage mismatch`);
      }
      const publicWire = JSON.stringify(clients[seat].frames.filter((frame) => frame.type === "publicState"));
      if (allMarkers.some((marker) => publicWire.includes(marker))) throw new Error(`seat ${seat} public state leaked owner marker`);
      const wire = JSON.stringify(clients[seat].frames);
      if (markerHistory.some((markers, rival) => rival !== seat && markers.some((marker) => wire.includes(marker)))) {
        throw new Error(`seat ${seat} received rival private marker`);
      }
    }
  };
  const healthySnapshot = (targetSeat) => new Map(Array.from({ length: 8 }, (_, seat) => seat)
    .filter((seat) => seat !== targetSeat).map((seat) => [seat, {
      ordinal: ordinals[seat].at(-1), epoch: clients[seat].frames.find((frame) => frame.type === "welcome").connectionEpoch,
      rebases: clients[seat].frames.filter((frame) => frame.type === "rebase").length,
      baselines: clients[seat].frames.filter((frame) => frame.type === "ownerState").length,
      inputAcks: clients[seat].frames.filter((frame) => frame.type === "ack" && frame.ackKind === "input").length,
    }]));
  const proveHealthyProgress = async (before, targetSeat) => {
    for (const seat of before.keys()) {
      const client = clients[seat];
      sendRawClientFrame(client, { type: "input", inputSeq: ++inputSeq[seat], moveX: 0, moveY: 0,
        thrust: 0, brake: 0, slingshot: false, ability1: false, ability2: false, clientTimeMs: Date.now() });
    }
    await waitFor(() => [...before].every(([seat, prior]) => clients[seat].frames.filter((frame) => frame.type === "ack"
      && frame.ackKind === "input").length > prior.inputAcks), `seven-peer input progress around seat ${targetSeat}`, 5000);
    for (const [seat, prior] of before) {
      const welcome = clients[seat].frames.find((frame) => frame.type === "welcome");
      if (ordinals[seat].at(-1) !== prior.ordinal || welcome.connectionEpoch !== prior.epoch
        || clients[seat].frames.filter((frame) => frame.type === "rebase").length !== prior.rebases) {
        throw new Error(`healthy seat ${seat} changed ordinal/epoch/rebase around seat ${targetSeat}`);
      }
    }
  };
  const issueInventoryConsequence = async (seat, action, semanticId, { withhold = false } = {}) => {
    const beforeFrames = clients.map((client) => client.frames.length);
    if (withhold) {
      heldEventTarget = { seat, eventType: "player.inventoryAction", action };
      heldEventObserved = null;
    }
    const body = action === "unequip" ? { action, equipSlot: 0 }
      : { action, cargoSlot: 0, equipSlot: 0 };
    const response = await request(port, "/inventory/action", { method: "POST", authority: authorities[seat], accounting,
      body: command(authorities[seat], ++commandSeq[seat], body) });
    if (response.status !== 200) throw new Error(`cycle inventory action ${semanticId} returned ${response.status}`);
    const consequence = await waitFor(() => clients[seat].frames.slice(beforeFrames[seat]).find((frame) => frame.type === "event"
      && frame.eventType === "player.inventoryAction" && frame.payload?.action === action),
    `cycle consequence ${semanticId}`, 5000);
    if (withhold && heldEventObserved?.eventSeq !== consequence.eventSeq) {
      throw new Error("named reconnect consequence was not exclusively withheld");
    }
    const entitled = consequence.visibility === "public" ? Array.from({ length: 8 }, (_, index) => index) : [seat];
    await waitFor(() => entitled.every((index) => clients[index].frames.slice(beforeFrames[index]).some((frame) => frame.type === "event"
      && frame.eventSeq === consequence.eventSeq && frame.eventType === consequence.eventType)), `entitled consequence fanout ${semanticId}`, 5000);
    for (let index = 0; index < 8; index += 1) {
      const count = clients[index].frames.slice(beforeFrames[index]).filter((frame) => frame.type === "event"
        && frame.eventSeq === consequence.eventSeq && frame.eventType === consequence.eventType).length;
      if (count !== (entitled.includes(index) ? 1 : 0)) throw new Error(`consequence entitlement mismatch: ${JSON.stringify({
        seat: index, count, visibility: consequence.visibility, entitled, eventSeq: consequence.eventSeq,
        matching: clients.map((client, clientIndex) => client.frames.slice(beforeFrames[clientIndex]).filter((frame) => frame.type === "event"
          && frame.eventSeq === consequence.eventSeq && frame.eventType === consequence.eventType).length),
      })}`);
    }
    const outcome = { round: semanticId, seat, actionKind: `inventory:${action}`, status: "accepted",
      semanticHash: digest(salt, semanticId), consequenceHash: digest(salt, `${seat}:${consequence.eventSeq}`),
      eventSeq: consequence.eventSeq, visibility: consequence.visibility,
      deliveryAckSent: !withhold, eventAckSent: !withhold, elapsedMs: Math.round(performance.now() - monotonicStarted) };
    actionOutcomes.set(semanticId, outcome);
    files["reliable-ledger"](outcome);
    return { consequence, beforeFrames };
  };
  const proveClosedEpochRejectsAck = async (client, consequence, label) => {
    const wire = JSON.stringify({ type: "ack", ackKind: "delivery", deliveryId: consequence.deliveryId });
    const rejected = await new Promise((resolve) => {
      try { client.ws.send(wire, (error) => resolve(Boolean(error))); } catch { resolve(true); }
      setTimeout(() => resolve(false), 500).unref?.();
    });
    if (!rejected) throw new Error(`${label} accepted a delivery ACK write after its physical epoch was fenced`);
    membershipCounts.closedSocketAckWriteRejections += 1;
    files["membership-ledger"]({ type: "fenced-ack-rejected", label,
      consequenceHash: digest(salt, `${consequence.eventSeq}:${consequence.deliveryId}`),
      elapsedMs: Math.round(performance.now() - monotonicStarted) });
  };
  const reconnect = async (seat) => {
    const barrierStarted = performance.now();
    const healthy = healthySnapshot(seat);
    const old = clients[seat];
    const oldWelcome = old.frames.find((frame) => frame.type === "welcome");
    const publicState = [...old.frames].reverse().find((frame) => frame.type === "publicState");
    const cycle = await issueInventoryConsequence(seat, "unequip", "cycle-reconnect-seat-4", { withhold: true });
    const beforeHealth = await getHealth(Math.round(performance.now() - monotonicStarted));
    const before = new Set(Object.keys(beforeHealth.raw.multiplayer.adapter.pressure.connections || {}));
    terminateRawClient(old);
    await waitFor(() => old.close, `seat ${seat} reconnect close`, 3000);
    fencedClients.push({ client: old, framesAtFence: old.frames.length });
    await proveClosedEpochRejectsAck(old, cycle.consequence, "old-reconnect-epoch");
    const ticket = await issueTicket(seat, "resume");
    const next = await openRawClient({ port, ticket, kind: "resume", pilotSlot: `seat-${seat}-resume`,
      cursors: { lastRunId: authorities[seat].runId, lastSnapshotId: publicState.snapshotId,
        lastEventSeq: publicState.lastEventSeq }, record: clientRecord(seat),
      maxFrames: fixture.evidence.maxRawFramesPerClient,
      shouldWithholdEventAck() { return false; } });
    allClients.push(next);
    clients[seat] = next;
    await captureOrdinal(before, seat);
    const welcome = next.frames.find((frame) => frame.type === "welcome");
    authorities[seat] = welcome;
    commandSeq[seat] = welcome.lastCommandSeq;
    actionSeq[seat] = welcome.lastActionSeq;
    if (!welcome.reconnected || welcome.connectionEpoch !== oldWelcome.connectionEpoch + 1) {
      throw new Error(`seat ${seat} reconnect epoch/rebase contract failed`);
    }
    const order = ["welcome", "rebase", "publicState", "ownerState"].map((type) => next.frames.findIndex((frame) => frame.type === type));
    if (!order.every((value, index) => value >= 0 && (!index || value > order[index - 1]))) throw new Error("reconnect baseline order failed");
    const replay = await waitFor(() => next.frames.find((frame) => frame.type === "event"
      && frame.eventSeq === cycle.consequence.eventSeq && frame.eventType === cycle.consequence.eventType), "named consequence replay on new epoch", 5000);
    if (!replay || old.frames.filter((frame) => frame.type === "event" && frame.eventSeq === replay.eventSeq
      && frame.eventType === replay.eventType).length !== 1
      || next.frames.filter((frame) => frame.type === "event" && frame.eventSeq === replay.eventSeq
        && frame.eventType === replay.eventType).length !== 1) {
      throw new Error("named consequence replay was not exact once per old/new physical epoch");
    }
    heldEventTarget = null;
    heldEventObserved = null;
    files["reliable-ledger"]({ type: "cycle-replay-retired", seat, semanticHash: digest(salt, "cycle-reconnect-seat-4"),
      consequenceHash: digest(salt, `${seat}:${replay.eventSeq}`), newEpoch: welcome.connectionEpoch,
      deliveryAckSent: true, eventAckSent: true, elapsedMs: Math.round(performance.now() - monotonicStarted) });
    cycleConsequenceEvidence.push({ label: "reconnect", eventSeq: replay.eventSeq, eventType: replay.eventType,
      allowedClients: new Set([old, next]) });
    await proveHealthyProgress(healthy, seat);
    recoveryLedger.push({ kind: "reconnect", seat, durationMs: performance.now() - barrierStarted });
    files["membership-ledger"]({ type: "reconnect", seat, incarnation: incarnations[seat],
      oldEpoch: oldWelcome.connectionEpoch, newEpoch: welcome.connectionEpoch, ordinal: ordinals[seat].at(-1),
      elapsedMs: Math.round(performance.now() - monotonicStarted) });
    membershipCounts.reconnects += 1;
  };
  const replace = async (seat, started) => {
    const barrierStarted = performance.now();
    const healthy = healthySnapshot(seat);
    const oldAuthority = authorities[seat];
    const departedClient = clients[seat];
    const departed = await issueInventoryConsequence(seat, "unequip", "cycle-leave-seat-5");
    const invalidatedTicket = await issueTicket(seat, "resume");
    const left = await request(port, "/leave", { method: "POST", authority: oldAuthority, accounting,
      body: command(oldAuthority, ++commandSeq[seat], { playerId: oldAuthority.playerId }) });
    if (left.status !== 200) throw new Error(`leave failed for seat ${seat}`);
    await closeRawClient(clients[seat]);
    await proveClosedEpochRejectsAck(clients[seat], departed.consequence, "departed-membership");
    files["membership-ledger"]({ type: "leave", seat, incarnation: incarnations[seat],
      membershipHash: digest(salt, oldAuthority.membershipId), elapsedMs: Math.round(performance.now() - monotonicStarted) });
    membershipCounts.leaves += 1;
    let invalidatedRejected = false;
    try {
      await openRawClient({ port, ticket: invalidatedTicket, kind: "resume", pilotSlot: `seat-${seat}-invalidated`,
        record: clientRecord(seat), maxFrames: 32, shouldWithholdEventAck() { return false; } });
    } catch { invalidatedRejected = true; }
    if (!invalidatedRejected) throw new Error("departed membership resume ticket redeemed after leave");
    membershipCounts.invalidatedTicketRejections += 1;
    await admit(seat, started, true);
    if (authorities[seat].membershipId === oldAuthority.membershipId) throw new Error("replacement reused membership lineage");
    if (clients[seat].frames.some((frame) => frame.type === "event"
      && frame.eventType === departed.consequence.eventType && frame.eventSeq === departed.consequence.eventSeq)) {
      throw new Error("replacement recovered departed owner-private consequence");
    }
    cycleConsequenceEvidence.push({ label: "leave-join", eventSeq: departed.consequence.eventSeq,
      eventType: departed.consequence.eventType, allowedClients: new Set([departedClient]) });
    await proveHealthyProgress(healthy, seat);
    assertPrivateIsolation();
    recoveryLedger.push({ kind: "leave-join", seat, durationMs: performance.now() - barrierStarted });
  };
  const sendInput = (event) => {
    const client = clients[event.seat];
    if (!client || client.ws.readyState !== client.ws.OPEN) return;
    sendRawClientFrame(client, { type: "input", inputSeq: ++inputSeq[event.seat],
      moveX: event.moveX, moveY: event.moveY, thrust: 1, brake: 0, slingshot: false,
      ability1: false, ability2: false, clientTimeMs: Date.now() });
  };
  const sendAction = async (event) => {
    if (event.anticipatedIncarnation !== incarnations[event.seat]) {
      throw new Error(`action ${event.round} incarnation did not match compiled schedule`);
    }
    const client = clients[event.seat];
    const before = client.frames.length;
    const actionKinds = [
      ["pulse", {}], ["slingshotEdge", { edgeId: 1000 }], ["consume", { slot: 99 }],
      ["inventory", { action: "unloadConsumable", consumableSlot: 99 }], ["extractConfirm", {}],
    ];
    const [actionKind, payload] = actionKinds[event.actionKindIndex];
    const actionId = event.semanticId;
    const command = { type: "action", actionId, actionSeq: ++actionSeq[event.seat],
      commandSeq: ++commandSeq[event.seat], actionKind, payload, clientTimeMs: Date.now() };
    sendRawClientFrame(client, command);
    const ack = await waitFor(() => client.frames.slice(before).find((frame) => frame.type === "ack"
      && frame.ackKind === "action" && frame.actionId === actionId), `action ack ${actionId}`, 5000);
    sendRawClientFrame(client, { type: "ack", ackKind: "delivery", deliveryId: ack.deliveryId });
    const retryStart = client.frames.length;
    sendRawClientFrame(client, { ...command, clientTimeMs: Date.now() });
    const retry = await waitFor(() => client.frames.slice(retryStart).find((frame) => frame.type === "ack"
      && frame.ackKind === "action" && frame.actionId === actionId), `action retry ack ${actionId}`, 5000);
    sendRawClientFrame(client, { type: "ack", ackKind: "delivery", deliveryId: retry.deliveryId });
    if (retry.status !== ack.status || JSON.stringify(retry.result) !== JSON.stringify(ack.result)) {
      throw new Error(`action ${actionId} retry changed its semantic receipt`);
    }
    const outcome = { round: event.round, seat: event.seat, actionKind, status: ack.status,
      semanticHash: digest(salt, actionId), deliveryHash: digest(salt, `${event.seat}:${ack.deliveryId}`),
      retryDeliveryHash: digest(salt, `${event.seat}:${retry.deliveryId}`),
      receiptHash: digest(salt, JSON.stringify({ status: ack.status, result: ack.result })),
      retryReceiptHash: digest(salt, JSON.stringify({ status: retry.status, result: retry.result })),
      deliveryAckSent: true, retryDeliveryAckSent: true,
      elapsedMs: Math.round(performance.now() - monotonicStarted) };
    if (actionOutcomes.has(actionId)) throw new Error(`duplicate action outcome ${actionId}`);
    actionOutcomes.set(actionId, outcome);
    files["reliable-ledger"](outcome);
  };
  const finalCleanup = async () => {
    if (stopped) return null;
    stopped = true;
    if (checkpointTimer) { clearInterval(checkpointTimer); checkpointTimerStopped = true; }
    for (let seat = 0; seat < authorities.length; seat += 1) {
      const authority = authorities[seat];
      if (!authority) continue;
      try {
        const left = await request(port, "/leave", { method: "POST", authority, accounting,
          body: command(authority, ++commandSeq[seat], { playerId: authority.playerId }) });
        if (left.status !== 200) failure ||= `cleanup leave seat ${seat} returned ${left.status}`;
      } catch (error) { failure ||= `cleanup leave seat ${seat} failed: ${error.message}`; }
    }
    await Promise.all(clients.map((client) => closeRawClient(client).catch(() => null)));
    await waitFor(async () => {
      const health = await request(port, "/health", { accounting });
      return health.body.multiplayer?.adapter?.connections === 0
        && health.body.multiplayer?.tickets?.retained === 0 ? true : false;
    }, "soak cleanup drain", 5000).catch((error) => { failure ||= error.message; });
    const pre = await getHealth(Math.round(performance.now() - monotonicStarted)).catch(() => null);
    const resourceIndex = readJsonl(resourceFile).length;
    try { process.kill(authorityPid, "SIGUSR1"); } catch (error) { failure ||= `authority resource signal failed: ${error.message}`; }
    const resourceInventory = await waitFor(() => readJsonl(resourceFile)[resourceIndex],
      "authority resource inventory", 3000).catch((error) => { failure ||= error.message; return null; });
    const resourceCounts = resourceInventory?.counts || {};
    const orderedResources = (value) => Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b)));
    const resourceInventoryPassed = Boolean(resourceInventory?.pid === authorityPid
      && JSON.stringify(orderedResources(resourceCounts)) === JSON.stringify(orderedResources(fixture.authorityResourceExpected)));
    if (!resourceInventoryPassed) failure ||= `authority resource inventory exceeded declared caps: ${JSON.stringify(resourceCounts)}`;
    await stopSimServer(port).catch((error) => { failure ||= `authority stop failed: ${error.message}`; });
    const dead = await portIsDead(port);
    let processDead = false;
    try { process.kill(authorityPid, 0); } catch { processDead = true; }
    const diagnosticCleanup = readJsonl(diagnosticsCleanupFile).at(-1)?.status || null;
    const diagnosticsStopped = Boolean(diagnosticCleanup?.lifecycle === "stopped"
      && diagnosticCleanup.timerActive === false && diagnosticCleanup.histogramEnabled === false
      && diagnosticCleanup.observerConnected === false);
    const preAdapter = pre?.safe?.adapter;
    const preTickets = pre?.safe?.tickets;
    const drained = Boolean(preAdapter && preAdapter.connections === 0 && preAdapter.bound === 0
      && preAdapter.closing === 0 && preAdapter.queuedBytes === 0 && preAdapter.queuedMessages === 0
      && preAdapter.pendingScheduledSends === 0 && preTickets?.retained === 0 && preTickets?.pending === 0);
    const preShutdownAllowedResources = Boolean(preAdapter?.livenessTimers === 1
      && pre?.safe?.soakDiagnostics?.timerActive === true
      && pre?.safe?.soakDiagnostics?.histogramEnabled === true
      && pre?.safe?.soakDiagnostics?.observerConnected === true);
    return { preShutdown: pre?.safe || null, resourceInventory: resourceCounts,
      resourceExpected: fixture.authorityResourceExpected, resourceInventoryPassed,
      portReusable: dead, processDead, diagnosticsStopped,
      preShutdownAllowedResources,
      clientsClosed: allClients.every((client) => !client || client.close || client.ws.readyState === client.ws.CLOSED),
      samplerStopped: checkpointTimerStopped, drained,
      passed: dead && processDead && diagnosticsStopped && checkpointTimerStopped && preShutdownAllowedResources
        && resourceInventoryPassed && drained
        && allClients.every((client) => !client || client.close || client.ws.readyState === client.ws.CLOSED) };
  };
  let started;
  let cleanup;
  try {
    const pressurePreload = path.resolve(__dirname, "soak-pressure-preload.cjs");
    await startSimServer(port, { keepAlive: true, registerProcessCleanup: false, env: { LBH_SIM_WS_ENABLED: "true",
      LBH_SOAK_DIAGNOSTICS: "1",
      LBH_SIM_MAX_SIM_TIME: "7200",
      ...(timeScale === 1 ? {} : { LBH_SIM_WS_TEST_TICKET_TTL_MS: "300" }),
      LBH_SOAK_GC_FILE: gcFile,
      LBH_SOAK_DIAGNOSTICS_CLEANUP_FILE: diagnosticsCleanupFile,
      LBH_SOAK_RESOURCE_FILE: resourceFile,
      NODE_OPTIONS: `${process.env.NODE_OPTIONS || ""} --require=${pressurePreload}`.trim() } });
    const start = await request(port, "/session/start", { method: "POST", accounting, body: {
      mapId: "shallows", requesterId: "soak-seat-0", requesterName: "Soak Seat 0", maxPlayers: 8 } });
    if (start.status !== 200) throw new Error(`session start failed: ${JSON.stringify(start.body)}`);
    started = start.body;
    authorityRunHash = digest(salt, started.session.runId);
    authorityRunHashes.add(authorityRunHash);
    for (let seat = 0; seat < 8; seat += 1) await admit(seat, started);
    const admitted = await getHealth(0);
    authorityPid = admitted.safe.pid;
    if (!Number.isSafeInteger(authorityPid) || new Set(ordinals.flat()).size !== 8) throw new Error("initial admission topology failed");
    assertPrivateIsolation();
    lastBarrier = "eight-admitted";
    checkpoint();
    checkpointTimer = setInterval(checkpoint, 60000 * timeScale);
    checkpointTimer.unref();
    for (const event of schedule.events) {
      const signal = aborted();
      if (signal) throw new Error(`ABORTED_BY_${signal}`);
      const target = monotonicStarted + event.atMs * timeScale;
      const delay = target - performance.now();
      if (delay > 0) await sleep(delay);
      const actualElapsedMs = performance.now() - monotonicStarted;
      const latenessMs = Math.max(0, performance.now() - target);
      maxScheduleLatenessMs = Math.max(maxScheduleLatenessMs, latenessMs);
      files["schedule-execution"]({ plannedElapsedMs: event.atMs, actualElapsedMs,
        latenessMs, kind: event.kind, seat: event.seat ?? null, round: event.round ?? null });
      if (event.kind === "input") {
        // Accelerated runs are implementation diagnostics only; avoid turning
        // compressed virtual time into an artificial production rate-limit test.
        if (timeScale === 1 || event.atMs % 10000 === 0) sendInput(event);
      }
      else if (event.kind === "health-sample") await getHealth(event.atMs);
      else if (event.kind === "action") await sendAction(event);
      else if (event.kind === "reconnect") { await reconnect(event.seat); lastBarrier = `reconnect-seat-${event.seat}`; checkpoint(); }
      else if (event.kind === "leave-join") { await replace(event.seat, started); lastBarrier = `replace-seat-${event.seat}`; checkpoint(); }
      else if (event.kind === "forced-gc-checkpoint") {
        await waitFor(async () => {
          const health = await getHealth(event.atMs);
          return health.safe.adapter.queuedMessages === 0 ? true : false;
        }, "forced-GC reliable drain", 5000);
        const beforeGc = readJsonl(gcFile).length;
        process.kill(authorityPid, "SIGUSR2");
        const gc = await waitFor(() => readJsonl(gcFile)[beforeGc], "authority forced GC acknowledgement", 5000);
        await sleep(2000 * timeScale);
        const postGc = await getHealth(event.atMs + 2000);
        files["runtime-windows"]({ elapsedMs: event.atMs, type: "forced-gc-checkpoint",
          invoked: true, authorityPidStable: gc.pid === authorityPid,
          postGcHeapUsed: postGc.safe.heapUsed,
          excludedPerformanceMinutes: schedule.excludedPerformanceMinutes });
        if (gc.pid !== authorityPid) throw new Error("forced GC ran outside the match authority");
        lastBarrier = "forced-gc-checkpoint-complete";
      } else if (event.kind === "final-drain") lastBarrier = "final-drain";
    }
    await waitFor(async () => {
      const health = await getHealth(fixture.wallTimeMs);
      return health.safe.adapter.queuedMessages === 0 ? true : false;
    }, "final reliable ACK retirement", 5000);
    const final = await getHealth(fixture.wallTimeMs);
    if (digest(salt, final.raw.session?.runId) !== authorityRunHash) throw new Error("authority run identity changed");
    const details = final.raw.multiplayer.adapter.pressure.connections || {};
    for (let seat = 0; seat < 8; seat += 1) {
      const current = details[String(ordinals[seat].at(-1))];
      const welcome = clients[seat].frames.find((frame) => frame.type === "welcome");
      const expectedEpoch = seat === 4 ? initialEpochs[seat] + 1 : initialEpochs[seat];
      if (!current || current.connectionEpoch !== expectedEpoch || welcome.connectionEpoch !== expectedEpoch) {
        throw new Error(`seat ${seat} final epoch/isolation mismatch`);
      }
      if (seat !== 4 && ordinals[seat].length !== 1 && seat !== 5) throw new Error(`healthy seat ${seat} changed socket`);
      if (current.counts?.highWaterCrossings || current.counts?.disconnects || current.counts?.rebases > (seat === 4 ? 1 : 0)) {
        throw new Error(`seat ${seat} violated pressure/isolation gate`);
      }
      const acks = clients[seat].frames.filter((frame) => frame.type === "ack" && frame.ackKind === "input");
      if (!acks.length) throw new Error(`seat ${seat} lacks input ACK progress`);
    }
    if (actionOutcomes.size !== 16) throw new Error(`expected 16 reliable action outcomes, saw ${actionOutcomes.size}`);
    if (eventAckLedger.withheld !== 1 || eventAckLedger.decisions - 1 !== eventAckLedger.deliveryAcks
      || eventAckLedger.deliveryAcks !== eventAckLedger.eventAcks) {
      throw new Error(`event dual-ACK ledger mismatch: ${JSON.stringify(eventAckLedger)}`);
    }
    const exactEventAckFacts = [...eventAckFacts.values()].every((fact) => fact.decisions === 1
      && fact.deliveryAcks === (fact.withheld ? 0 : 1) && fact.eventAcks === (fact.withheld ? 0 : 1));
    if (!exactEventAckFacts || eventAckFacts.size !== allClients.reduce((sum, client) =>
      sum + client.frames.filter((frame) => frame.type === "event").length, 0)) {
      throw new Error("per-event per-physical-client delivery/event ACK ledger was not exact");
    }
    if (fencedClients.some(({ client, framesAtFence }) => client.frames.length !== framesAtFence)) {
      throw new Error("fenced old epoch received application-visible frames after replacement");
    }
    if (allClients.some((client) => client.error || client.frames.length > fixture.evidence.maxRawFramesPerClient)) {
      throw new Error("raw client error or immutable frame evidence cap exceeded");
    }
    const plannedStreamIds = new Set(schedule.events.filter((event) => event.kind === "action").map((event) => event.semanticId));
    const actionAcks = allClients.flatMap((client) => client.frames.filter((frame) => frame.type === "ack" && frame.ackKind === "action"));
    const actionAckCounts = new Map();
    for (const ack of actionAcks) actionAckCounts.set(ack.actionId, (actionAckCounts.get(ack.actionId) || 0) + 1);
    if (actionAcks.some((ack) => !plannedStreamIds.has(ack.actionId)) || plannedStreamIds.size !== 14
      || [...plannedStreamIds].some((id) => actionAckCounts.get(id) !== 2)) {
      throw new Error("action ACK ledger contained unknown, missing, or duplicate receipts");
    }
    for (const client of allClients) {
      const events = client.frames.filter((frame) => frame.type === "event");
      if (events.some((event, index) => index && event.eventSeq <= events[index - 1].eventSeq)) {
        throw new Error(`event FIFO regressed for ${client.pilotSlot}`);
      }
      const keys = events.map((event) => event.eventSeq);
      if (new Set(keys).size !== keys.length) throw new Error(`duplicate event consequence for ${client.pilotSlot}`);
    }
    for (const evidence of cycleConsequenceEvidence) {
      for (const client of allClients) {
        const count = client.frames.filter((frame) => frame.type === "event" && frame.eventSeq === evidence.eventSeq
          && frame.eventType === evidence.eventType).length;
        if (count !== (evidence.allowedClients.has(client) ? 1 : 0)) {
          throw new Error(`${evidence.label} final entitled consequence cardinality failed for ${client.pilotSlot}`);
        }
      }
    }
    if (final.safe.pid !== authorityPid || final.safe.overloadState !== "NORMAL") throw new Error("authority identity/mode changed");
    if ((final.safe.adapter.highWaterCrossings || 0) !== 0 || (final.safe.adapter.queuePolicyEvents || 0) !== 0
      || (final.safe.adapter.observerFailures || 0) !== 0) throw new Error("unexpected pressure/observer event");
    const windows = [...runtimeWindows.values()];
    const diagnosticSamples = windows.reduce((sum, window) => sum + window.sampleCount, 0)
      + (lastDiagnosticStatus?.currentWindow?.sampleCount || 0);
    const coverageDenominator = timeScale === 1 ? fixture.wallTimeMs / 1000 : fixture.wallTimeMs * timeScale / 1000;
    const sampleCoverage = diagnosticSamples / coverageDenominator;
    const performanceWindows = windows.filter((window) => {
      const minute = Math.max(0, Math.floor(window.endedMonotonicMs / 60000) - 1);
      return !schedule.excludedPerformanceMinutes.includes(minute) && minute >= 1;
    });
    const eventLoopPass = performanceWindows.every((window) => window.eventLoopDelay.p99Ms <= 50
      && window.eventLoopDelay.maxMs <= 250);
    const minuteRates = [1, 2, 5].map((minute) => {
      const samples = healthSamples.filter((sample) => (timeScale === 1 ? sample.actualElapsedMs : sample.plannedElapsedMs) >= minute * 60000
        && (timeScale === 1 ? sample.actualElapsedMs : sample.plannedElapsedMs) <= (minute + 1) * 60000);
      const first = samples[0];
      const last = samples.at(-1);
      const seconds = first && last ? ((timeScale === 1 ? last.actualElapsedMs - first.actualElapsedMs
        : last.plannedElapsedMs - first.plannedElapsedMs) / 1000) : 0;
      return { minute, sampleCount: samples.length,
        projectionHz: seconds > 0 ? (last.safe.projection.beats - first.safe.projection.beats) / seconds : 0,
        tickHz: seconds > 0 ? (last.safe.tick - first.safe.tick) / seconds : 0 };
    });
    const cadencePass = minuteRates.every((entry) => entry.sampleCount >= 10
      && entry.projectionHz >= 9 && entry.tickHz >= 13.5);
    const includedCostSamples = healthSamples.filter((sample) => {
      const minute = Math.floor(sample.actualElapsedMs / 60000);
      return minute >= 1 && !schedule.excludedPerformanceMinutes.includes(minute);
    }).map((sample) => ({ actualElapsedMs: sample.actualElapsedMs,
      costs: sample.safe.projection?.accounting?.costDistributions || {} }));
    const durationPass = includedCostSamples.length >= 20 && includedCostSamples.every(({ costs }) =>
      Number.isFinite(costs.simTickMs?.p95) && costs.simTickMs.p95 <= 10 && costs.simTickMs.p99 <= 20
      && costs.simTickMs.max <= 100 && Number.isFinite(costs.projectionReplicationMs?.p95)
      && costs.projectionReplicationMs.p95 <= 20 && costs.projectionReplicationMs.p99 <= 40
      && costs.projectionReplicationMs.max <= 150);
    const diagnosticAccounting = lastDiagnosticStatus?.accounting || {};
    const diagnosticsPass = ["sampleFailureCount", "missedSampleCount", "observerFailureCount", "gcOverflowCount"]
      .every((key) => diagnosticAccounting[key] === 0);
    const postWarmHealth = healthSamples.filter((sample) => sample.actualElapsedMs >= fixture.warmupMs);
    const normalRatio = postWarmHealth.filter((sample) => sample.safe.overloadState === "NORMAL").length
      / Math.max(1, postWarmHealth.length);
    const bytesBySeat = Array.from({ length: 8 }, (_, seat) => allClients.filter((client) => client.pilotSlot.startsWith(`seat-${seat}`))
      .reduce((sum, client) => sum + client.rawBytes + client.sentBytes, 0));
    const sortedBytes = [...bytesBySeat].sort((a, b) => a - b);
    const medianBytes = (sortedBytes[3] + sortedBytes[4]) / 2;
    const trafficBps = bytesBySeat.reduce((sum, bytes) => sum + bytes, 0) / (fixture.wallTimeMs / 1000);
    const minuteTraffic = [1, 2, 5].map((minute) => {
      const samples = healthSamples.filter((sample) => sample.actualElapsedMs >= minute * 60000
        && sample.actualElapsedMs <= (minute + 1) * 60000);
      const first = samples[0]?.safe.trafficBySeat;
      const last = samples.at(-1)?.safe.trafficBySeat;
      const seconds = samples.length > 1 ? (samples.at(-1).actualElapsedMs - samples[0].actualElapsedMs) / 1000 : 0;
      const seatBytes = first && last ? last.map((entry, seat) =>
        entry.receivedBytes + entry.sentBytes - first[seat].receivedBytes - first[seat].sentBytes) : [];
      const sorted = [...seatBytes].sort((a, b) => a - b);
      const median = sorted.length === 8 ? (sorted[3] + sorted[4]) / 2 : 0;
      return { minute, seconds, seatBytes, median, skewRequired: minute !== 5, aggregateBytesPerSec: seconds > 0
        ? seatBytes.reduce((sum, bytes) => sum + bytes, 0) / seconds : Infinity,
      ackProgress: first && last ? last.every((entry, seat) => entry.inputAcks > first[seat].inputAcks) : false };
    });
    const trafficPass = trafficBps <= 2.5 * 1024 * 1024 && bytesBySeat.every((bytes) => bytes <= medianBytes * 2)
      && minuteTraffic.every((entry) => entry.aggregateBytesPerSec <= 2.5 * 1024 * 1024 && entry.ackProgress
        && (!entry.skewRequired || entry.seatBytes.every((bytes) => bytes <= entry.median * 2)));
    const rawActions = final.raw.multiplayer?.actions || {};
    const rawReplay = final.raw.multiplayer?.adapter?.eventReplay || {};
    const rawTickets = final.raw.multiplayer?.tickets || {};
    const retentionPairs = [
      { name: "eventJournal", current: final.raw.eventJournal?.retainedCount, capacity: final.raw.eventJournal?.capacity },
      { name: "snapshotRing", current: final.raw.snapshotRing?.retainedCount, capacity: final.raw.snapshotRing?.capacity },
      { name: "actionReceipts", current: rawActions.retained,
        capacity: (rawActions.memberships || 0) * (rawActions.capacityPerMembership || 0) },
      { name: "eventReplayFrames", current: rawReplay.pendingEventFrames,
        capacity: (final.raw.multiplayer?.adapter?.connections || 0) * (rawReplay.maxPendingPerBinding || 0) },
      { name: "eventReplayBytes", current: rawReplay.pendingEventBytes,
        capacity: (final.raw.multiplayer?.adapter?.connections || 0) * (rawReplay.maxPendingBytesPerBinding || 0) },
      { name: "tickets", current: rawTickets.retained, capacity: rawTickets.capacity },
      { name: "harnessMembershipLedger", current: Object.values(membershipCounts).reduce((sum, value) => sum + value, 0),
        capacity: fixture.evidence.maxMembershipLedgerEntries },
      { name: "harnessConnectionLedger", current: ordinals.reduce((sum, entries) => sum + entries.length, 0),
        capacity: fixture.evidence.maxConnectionLedgerEntries },
    ];
    const retentionPass = retentionPairs.every(({ current, capacity }) => current <= capacity);
    const actionAccountingPass = rawActions.adjudicated === 13 && rawActions.replays === 13
      && rawActions.accepted + rawActions.rejected === 13 && rawActions.conflicts === 0 && rawActions.stale === 0
      && rawActions.gaps === 0;
    const replayAccountingPass = rawReplay.pendingEventFrames === 0 && rawReplay.pendingEventBytes === 0
      && rawReplay.replayedEvents - rawReplay.eventAcks === 1 && rawReplay.forcedRebases === 0
      && rawReplay.duplicatePendingEvents === 0;
    const pressure = final.raw.multiplayer?.adapter?.pressure || {};
    const pressureBounds = [
      { name: "wsBufferedBytes", current: pressure.maxima?.wsBufferedBytes?.worstConnection,
        capacity: pressure.policy?.transportHighWaterBytes },
      { name: "queuedBytes", current: pressure.maxima?.queuedBytes?.worstConnection,
        capacity: pressure.policy?.applicationQueueBytes },
      { name: "reliableBytes", current: pressure.maxima?.reliableBytes?.worstConnection,
        capacity: pressure.policy?.reliableQueueBytes },
      { name: "replayEventBytes", current: pressure.maxima?.replayEventBytes?.worstConnection,
        capacity: pressure.policy?.replayEventBytes },
      { name: "pendingInboundBytes", current: pressure.maxima?.pendingInboundBytes?.worstConnection,
        capacity: pressure.policy?.inboundPendingBytes },
      { name: "pendingSends", current: pressure.maxima?.pendingSends?.worstConnection,
        capacity: pressure.policy?.pendingSendMessages },
      { name: "scheduledSends", current: pressure.maxima?.scheduledSends?.worstConnection,
        capacity: pressure.policy?.scheduledSendMessages },
    ];
    const countCapMap = { queuedMessages: "applicationQueueMessages", reliableMessages: "reliableQueueMessages",
      replayEventCount: "replayEventMessages", pendingInboundCount: "inboundPendingMessages",
      pendingSendCount: "pendingSendMessages", scheduledSendCount: "scheduledSendMessages" };
    for (const [name, capName] of Object.entries(countCapMap)) {
      pressureBounds.push({ name, current: Math.max(0, ...healthSamples.map((sample) =>
        sample.safe.adapter.pressureCountMaxima?.[name] || 0)), capacity: pressure.policy?.[capName] });
    }
    const pressureBoundsPass = pressureBounds.every(({ current, capacity }) => Number.isFinite(current)
      && Number.isFinite(capacity) && current <= capacity)
      && Object.values(pressure.current || {}).every((metric) => metric.total === 0);
    const recoveryPass = recoveryLedger.length === 2 && recoveryLedger.every((entry) => entry.durationMs <= 15000);
    const actualWallMs = performance.now() - monotonicStarted;
    const wallPass = timeScale !== 1 || (actualWallMs >= fixture.wallTimeMs && actualWallMs <= fixture.wallTimeMs + 10000
      && maxScheduleLatenessMs <= 5000);
    measuredGates = {
      sampleCoverage: { status: timeScale !== 1 ? "NOT_APPLICABLE_ACCELERATED_DIAGNOSTIC"
        : sampleCoverage >= 0.95 ? "PASS" : "FAIL", numerator: diagnosticSamples,
        denominator: coverageDenominator, threshold: ">=95% one-Hz", source: "runtime-windows.jsonl" },
      cadence: { status: timeScale !== 1 ? "NOT_APPLICABLE_ACCELERATED_DIAGNOSTIC"
        : cadencePass ? "PASS" : "FAIL", numerator: minuteRates, denominator: 3,
        threshold: ">=90% configured tick/projection target in non-excluded minutes", source: "authority-health.jsonl" },
      runtimeDurations: { status: timeScale !== 1 ? "NOT_APPLICABLE_ACCELERATED_DIAGNOSTIC"
        : durationPass ? "PASS" : "FAIL", numerator: includedCostSamples, denominator: includedCostSamples.length,
        threshold: "every included 5s rolling source stays within tick 10/20/100ms and projection 20/40/150ms p95/p99/max",
        source: "authority-health.jsonl" },
      diagnosticsIntegrity: { status: timeScale !== 1 ? "NOT_APPLICABLE_ACCELERATED_DIAGNOSTIC"
        : diagnosticsPass && normalRatio >= 0.99 ? "PASS" : "FAIL",
      numerator: { accounting: diagnosticAccounting, normalSamples: postWarmHealth.filter((sample) => sample.safe.overloadState === "NORMAL").length,
        totalSamples: postWarmHealth.length, normalRatio }, denominator: postWarmHealth.length,
      threshold: "zero diagnostic failures/misses/overflow and NORMAL >=99%", source: "runtime-windows.jsonl" },
      eventLoop: { status: timeScale !== 1 ? "NOT_APPLICABLE_ACCELERATED_DIAGNOSTIC"
        : eventLoopPass && performanceWindows.length >= 2 ? "PASS" : "FAIL",
        numerator: performanceWindows.map((window) => window.eventLoopDelay), denominator: performanceWindows.length,
        threshold: "each included minute p99<=50ms max<=250ms", source: "runtime-windows.jsonl" },
      traffic: { status: timeScale !== 1 ? "NOT_APPLICABLE_ACCELERATED_DIAGNOSTIC"
        : trafficPass ? "PASS" : "FAIL", numerator: { aggregateBytesPerSec: trafficBps,
        bytesBySeat, medianBytes, minuteTraffic },
        denominator: 8, threshold: "both directions <=2.5MiB/s aggregate, per-minute ACK progress, <=2x cohort median outside recovery",
        source: "authority-health.jsonl" },
      retention: { status: retentionPass && pressureBoundsPass ? "PASS" : "FAIL",
        numerator: { retained: retentionPairs, pressure: pressureBounds }, denominator: retentionPairs.length + pressureBounds.length,
        threshold: "all retained registries <= advertised capacity", source: "authority-health.jsonl" },
      authorityReliabilityAccounting: { status: actionAccountingPass && replayAccountingPass ? "PASS" : "FAIL",
        numerator: { actions: rawActions, eventReplay: rawReplay }, denominator: { currentMembershipStreamActions: 13,
          departedMembershipActionsProvenInHarnessLedger: 1, streamRetries: 14, intentionallyUnackedOldEpochEvents: 1 },
        threshold: "exact current authority adjudication/retry counts plus one departed receipt and one reset old-epoch hold",
        source: "authority-health.jsonl" },
      recovery: { status: recoveryPass ? "PASS" : "FAIL", numerator: recoveryLedger, denominator: 2,
        threshold: "both barriers restore eight clients within 15s", source: "membership-ledger.jsonl" },
      wallTime: { status: wallPass ? "PASS" : "FAIL", numerator: { actualWallMs, maxScheduleLatenessMs }, denominator: fixture.wallTimeMs,
        threshold: "declared six minutes, <=5s barrier lateness", source: "schedule.json" },
    };
    const failedMeasured = Object.entries(measuredGates).filter(([, gate]) => gate.status === "FAIL").map(([name]) => name);
    if (failedMeasured.length) throw new Error(`smoke measured gates failed: ${failedMeasured.join(",")}`);
  } catch (error) {
    failure = error.stack || error.message;
  } finally {
    cleanup = await finalCleanup();
  }
  const gates = {
    deterministicSchedule: { status: "PASS", numerator: schedule.scheduleHash, denominator: 1, threshold: "exact fixture hash", source: "schedule.json" },
    topology: { status: membershipCounts.initialAdmissions === 8 && membershipCounts.replacementAdmissions === 1
      && membershipCounts.reconnects === 1 && membershipCounts.leaves === 1
      && membershipCounts.invalidatedTicketRejections === 1 && membershipCounts.closedSocketAckWriteRejections === 2
      && authorityRunHashes.size === 1 ? "PASS" : "FAIL",
      numerator: { ...membershipCounts, authoritiesPerMatch: authorityRunHashes.size,
        distinctInitialOrdinals: new Set(ordinals.map((entries) => entries[0])).size },
      denominator: { seats: 8 }, threshold: "8 initial + 1 replacement, one logical authority", source: "membership-ledger.jsonl" },
    reliability: { status: actionOutcomes.size === 16
      && [...actionOutcomes.values()].filter((entry) => typeof entry.round === "number")
        .every((entry) => entry.receiptHash === entry.retryReceiptHash && entry.deliveryAckSent && entry.retryDeliveryAckSent)
      && [...actionOutcomes.values()].filter((entry) => typeof entry.round === "string")
        .every((entry) => entry.status === "accepted" && entry.consequenceHash) ? "PASS" : "FAIL",
    numerator: { total: actionOutcomes.size,
      accepted: [...actionOutcomes.values()].filter((entry) => entry.status === "accepted").length,
      rejected: [...actionOutcomes.values()].filter((entry) => entry.status === "rejected").length,
      stableStreamRetries: [...actionOutcomes.values()].filter((entry) => typeof entry.round === "number"
        && entry.receiptHash === entry.retryReceiptHash).length,
      exactCycleConsequences: [...actionOutcomes.values()].filter((entry) => typeof entry.round === "string" && entry.consequenceHash).length },
    denominator: { planned: 16, streamRetries: 14, cycleConsequences: 2 },
    threshold: "every identity has one stable receipt; accepted cycle actions have exact entitled consequence and delivery retirement",
    source: "reliable-ledger.jsonl" },
    eventAckLedger: { status: eventAckLedger.withheld === 1 && eventAckLedger.decisions - 1 === eventAckLedger.deliveryAcks
      && eventAckLedger.deliveryAcks === eventAckLedger.eventAcks
      && [...eventAckFacts.values()].every((fact) => fact.decisions === 1
        && fact.deliveryAcks === (fact.withheld ? 0 : 1) && fact.eventAcks === (fact.withheld ? 0 : 1)) ? "PASS" : "FAIL",
    numerator: { aggregate: eventAckLedger, identityFacts: eventAckFacts.size },
      denominator: eventAckLedger.decisions, threshold: "one named old-epoch hold, all other events immediate dual ACK", source: "client-ledger.jsonl" },
    heapSlope: { status: "NOT_APPLICABLE_SHORT_RUN", numerator: 0, denominator: 0, threshold: "canonical only", source: "profile" },
    rssSlope: { status: "NOT_APPLICABLE_SHORT_RUN", numerator: 0, denominator: 0, threshold: "diagnostic only", source: "profile" },
    gcDuty: { status: "NOT_APPLICABLE_SHORT_RUN", numerator: 0, denominator: 0, threshold: "canonical only", source: "profile" },
    longWindowRecovery: { status: "NOT_APPLICABLE_SHORT_RUN", numerator: 0, denominator: 0, threshold: "canonical only", source: "profile" },
    cleanup: { status: cleanup?.passed ? "PASS" : "FAIL", numerator: cleanup, denominator: 1,
      threshold: "owned process gone and port reusable", source: "cleanup.json" },
    ...measuredGates,
  };
  const passed = !failure && timeScale === 1 && Object.values(gates).every((gate) => gate.status !== "FAIL");
  return { passed, failure: failure || (timeScale !== 1 ? "accelerated diagnostic cannot pass" : null),
    authorityPid, authorityRunHash, actionCount: actionOutcomes.size, incarnations, ordinals,
    httpAccounting: accounting, gates, cleanup, commit, dirty, timeScale };
}

module.exports = { runEightPlayerSoak, writeExclusive };
