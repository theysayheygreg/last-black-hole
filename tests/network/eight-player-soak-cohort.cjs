"use strict";

const crypto = require("crypto");
const fs = require("fs");
const net = require("net");
const path = require("path");
const { startSimServer, stopSimServer } = require("../helpers.cjs");
const { openRawClient, sendRawClientFrame, closeRawClient, terminateRawClient, waitFor } = require("./raw-ws-client.cjs");

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const digest = (salt, value) => crypto.createHash("sha256").update(`${salt}:${value}`).digest("hex");
const median = (values) => {
  const sorted = [...values].sort((a, b) => a - b);
  if (!sorted.length) return null;
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
};
const theilSen = (points) => median(points.flatMap((a, index) => points.slice(index + 1)
  .map((b) => (b.value - a.value) / ((b.minute - a.minute) || 1))));
const linearRegression = (points) => {
  if (points.length < 2) return { slope: null, rSquared: null };
  const meanX = points.reduce((sum, point) => sum + point.minute, 0) / points.length;
  const meanY = points.reduce((sum, point) => sum + point.value, 0) / points.length;
  const denominator = points.reduce((sum, point) => sum + (point.minute - meanX) ** 2, 0);
  const slope = denominator ? points.reduce((sum, point) => sum
    + (point.minute - meanX) * (point.value - meanY), 0) / denominator : 0;
  const intercept = meanY - slope * meanX;
  const total = points.reduce((sum, point) => sum + (point.value - meanY) ** 2, 0);
  const residual = points.reduce((sum, point) => sum
    + (point.value - (intercept + slope * point.minute)) ** 2, 0);
  return { slope, rSquared: total ? 1 - residual / total : 1 };
};

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
    heapTotal: body.process?.memory?.heapTotal ?? null,
    external: body.process?.memory?.external ?? null,
    arrayBuffers: body.process?.memory?.arrayBuffers ?? null,
    overloadState: session.overloadState ?? null,
    clients: body.multiplayer?.memberships?.active ?? body.session?.players ?? null,
    adapter: { connections: adapter.connections, bound: adapter.bound, closing: adapter.closing,
      queuedBytes: adapter.queuedBytes, queuedMessages: adapter.queuedMessages,
      pendingScheduledSends: adapter.pendingScheduledSends, livenessTimers: adapter.livenessTimers,
      highWaterCrossings: pressure.policy?.transportHighWaterCrossings,
      queuePolicyEvents: pressure.policy?.queuePolicyEvents,
      observerFailures: pressure.observer?.failures,
      pressureCurrent: pressure.current, pressureMaxima: pressure.maxima, pressureCountMaxima,
      pressureConnections: Object.fromEntries(Object.entries(pressure.connections || {}).map(([ordinal, entry]) => [ordinal, {
        connectionEpoch: entry.connectionEpoch, current: entry.current, maximum: entry.maximum,
        counts: entry.counts,
      }])),
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
  const normal = fixture.profile === "normal-45m";
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
  const declaredMarkers = Array.from({ length: 8 }, (_, seat) => [
    `soak-secret-${seat}-1`, ...(!normal && seat === 5 ? [`soak-secret-${seat}-2`] : []),
  ]);
  const privacyOracle = { inspectedFrames: 0, publicFrames: 0, ownerFrames: 0,
    latest: Array(8).fill(null).map(() => ({ publicSeen: false, ownerSeen: false })),
    violations: [], overflow: false };
  const privacyViolation = (value) => {
    if (privacyOracle.violations.length < 16) privacyOracle.violations.push(value);
    else privacyOracle.overflow = true;
  };
  const inspectPrivacyFrame = (seat) => ({ frame, text }) => {
    privacyOracle.inspectedFrames += 1;
    const currentMarker = `soak-secret-${seat}-${incarnations[seat]}`;
    const rivalMarkers = declaredMarkers.flatMap((markers, rival) => rival === seat ? [] : markers);
    const oldOrFutureOwn = declaredMarkers[seat].filter((marker) => marker !== currentMarker);
    if (frame.type === "publicState") {
      privacyOracle.publicFrames += 1;
      privacyOracle.latest[seat].publicSeen = true;
      if (declaredMarkers.flat().some((marker) => text.includes(marker))) {
        privacyViolation({ seat, frameType: frame.type, reason: "public-marker" });
      }
    } else if (frame.type === "ownerState") {
      privacyOracle.ownerFrames += 1;
      privacyOracle.latest[seat].ownerSeen = true;
      privacyOracle.latest[seat].currentMarkerPresent = text.includes(currentMarker);
      if (!text.includes(currentMarker)) privacyViolation({ seat, frameType: frame.type, reason: "owner-marker-missing" });
      if (oldOrFutureOwn.some((marker) => text.includes(marker))) {
        privacyViolation({ seat, frameType: frame.type, reason: "old-owner-marker" });
      }
      if (rivalMarkers.some((marker) => text.includes(marker))) {
        privacyViolation({ seat, frameType: frame.type, reason: "rival-owner-marker" });
      }
    } else if (rivalMarkers.some((marker) => text.includes(marker))) {
      privacyViolation({ seat, frameType: frame.type, reason: "rival-marker" });
    }
  };
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
  const forcedGcPoints = [];
  const cycleConsequenceEvidence = [];
  const membershipCounts = { initialAdmissions: 0, replacementAdmissions: 0, reconnects: 0, leaves: 0,
    invalidatedTicketRejections: 0, closedSocketAckWriteRejections: 0 };
  const authorityRunHashes = new Set();
  const fencedClients = [];
  let heldEventTarget = null;
  let heldEventObserved = null;
  let maxScheduleLatenessMs = 0;
  let lastDiagnosticStatus = null;
  let authorityMonotonicOrigin = null;
  const actualExcludedPerformanceMinutes = new Set();
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
        receivedBytesByType: Object.fromEntries(["publicState", "ownerState", "event", "ack", "welcome", "rebase", "heartbeat"]
          .map((type) => [type, seatClients.reduce((sum, client) => sum + (client.receivedBytesByType[type] || 0), 0)])),
        sentBytesByType: Object.fromEntries(["input", "action", "ack", "pong", "hello"]
          .map((type) => [type, seatClients.reduce((sum, client) => sum + (client.sentBytesByType[type] || 0), 0)])),
        sentFramesByType: Object.fromEntries(["input", "action", "ack", "pong", "hello"]
          .map((type) => [type, seatClients.reduce((sum, client) => sum + (client.sentFramesByType[type] || 0), 0)])),
        authorityCounts: safe.adapter.pressureConnections?.[String(ordinals[seat].at(-1))]?.counts || {},
        inputAcks: seatClients.reduce((sum, client) => sum + client.frames.filter((frame) => frame.type === "ack"
          && frame.ackKind === "input").length, 0),
        actionAcks: seatClients.reduce((sum, client) => sum + client.frames.filter((frame) => frame.type === "ack"
          && frame.ackKind === "action").length, 0) };
    });
    if (clients.every(Boolean)) assertPrivateIsolation();
    healthSamples.push({ plannedElapsedMs: elapsedMs, actualElapsedMs, safe });
    files["authority-health"](safe);
    if (safe.soakDiagnostics) {
      lastDiagnosticStatus = safe.soakDiagnostics;
      const observedOrigin = safe.soakDiagnostics.monotonicMs - actualElapsedMs;
      if (authorityMonotonicOrigin === null) authorityMonotonicOrigin = observedOrigin;
      else if (Math.abs(observedOrigin - authorityMonotonicOrigin) > 250) {
        throw new Error("authority/runner monotonic calibration drifted by more than 250ms");
      }
      for (const window of safe.soakDiagnostics.completedWindows || []) {
        runtimeWindows.set(window.endedMonotonicMs, window);
      }
      files["runtime-windows"]({ elapsedMs, accounting: safe.soakDiagnostics.accounting,
        currentWindow: safe.soakDiagnostics.currentWindow, completedWindows: safe.soakDiagnostics.completedWindows });
    }
    if (authorityPid !== null && safe.pid !== authorityPid) throw new Error("authority PID changed during soak");
    return { raw: response.body, safe };
  };
  const reliableDrainComplete = ({ raw, safe }) => {
    const current = safe.adapter.pressureCurrent || {};
    const replay = raw.multiplayer?.adapter?.eventReplay || {};
    return safe.adapter.queuedMessages === 0 && safe.adapter.queuedBytes === 0
      && safe.adapter.pendingScheduledSends === 0
      && Object.values(current).every((metric) => metric.total === 0)
      && replay.pendingEventFrames === 0 && replay.pendingEventBytes === 0
      && replay.replayedEvents === replay.eventAcks;
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
      maxReceivedFrames: fixture.evidence.maxRawReceiveFramesPerClient, sampleStateEvery: 50,
      inspectFrame: inspectPrivacyFrame(seat),
      shouldWithholdEventAck({ frame }) {
        const matches = heldEventTarget?.seat === seat && frame.type === "event"
          && frame.eventType === heldEventTarget.eventType
          && frame.payload?.action === heldEventTarget.action;
        if (matches) heldEventObserved = frame;
        return matches;
      } });
    allClients.push(clients[seat]);
    await captureOrdinal(before, seat);
    const welcome = clients[seat].latestFrames.welcome;
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
    if (privacyOracle.overflow || privacyOracle.violations.length
      || privacyOracle.latest.some((entry) => !entry.publicSeen || !entry.ownerSeen || !entry.currentMarkerPresent)) {
      throw new Error(`incremental privacy oracle failed: ${JSON.stringify(privacyOracle)}`);
    }
  };
  const healthySnapshot = (targetSeat) => new Map(Array.from({ length: 8 }, (_, seat) => seat)
    .filter((seat) => seat !== targetSeat).map((seat) => [seat, {
      ordinal: ordinals[seat].at(-1), epoch: clients[seat].latestFrames.welcome.connectionEpoch,
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
      const welcome = clients[seat].latestFrames.welcome;
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
    const oldWelcome = old.latestFrames.welcome;
    const publicState = old.latestFrames.publicState;
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
      maxReceivedFrames: fixture.evidence.maxRawReceiveFramesPerClient, sampleStateEvery: 50,
      inspectFrame: inspectPrivacyFrame(seat),
      shouldWithholdEventAck() { return false; } });
    allClients.push(next);
    clients[seat] = next;
    await captureOrdinal(before, seat);
    const welcome = next.latestFrames.welcome;
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
    let invalidatedClassification = null;
    try {
      await openRawClient({ port, ticket: invalidatedTicket, kind: "resume", pilotSlot: `seat-${seat}-invalidated`,
        record: clientRecord(seat), maxFrames: 32, maxReceivedFrames: 32, sampleStateEvery: 50,
        inspectFrame: inspectPrivacyFrame(seat), shouldWithholdEventAck() { return false; } });
    } catch (error) {
      invalidatedRejected = true;
      invalidatedClassification = { closedBeforeWelcome: error.message.includes("closed before welcome"),
        protocolFence: /4403|invalid|expired|redeem/i.test(error.message) };
    }
    if (!invalidatedRejected) throw new Error("departed membership resume ticket redeemed after leave");
    if (!invalidatedClassification.closedBeforeWelcome || !invalidatedClassification.protocolFence) {
      throw new Error("invalidated ticket failed without an auditable protocol fence classification");
    }
    files["membership-ledger"]({ type: "invalidated-ticket-rejected", seat,
      incarnation: incarnations[seat], ...invalidatedClassification,
      elapsedMs: Math.round(performance.now() - monotonicStarted) });
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
    const eventStarts = clients.map((entry) => entry.frames.length);
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
    let consequence = null;
    if (actionKind === "pulse" && ack.status === "accepted") {
      consequence = await waitFor(() => clients[event.seat].frames.slice(eventStarts[event.seat]).find((frame) => frame.type === "event"
        && frame.eventType === "player.pulse" && frame.payload?.clientId === `soak-seat-${event.seat}`),
      `pulse consequence ${actionId}`, 5000);
      await waitFor(() => clients.every((entry, seat) => entry.frames.slice(eventStarts[seat]).some((frame) => frame.type === "event"
        && frame.eventSeq === consequence.eventSeq && frame.eventType === "player.pulse")),
      `pulse consequence fanout ${actionId}`, 5000);
      for (let seat = 0; seat < clients.length; seat += 1) {
        const count = clients[seat].frames.slice(eventStarts[seat]).filter((frame) => frame.type === "event"
          && frame.eventSeq === consequence.eventSeq && frame.eventType === "player.pulse").length;
        if (count !== 1) throw new Error(`pulse consequence cardinality ${actionId} seat ${seat} was ${count}`);
      }
    }
    const outcome = { round: event.round, seat: event.seat, actionKind, status: ack.status,
      semanticHash: digest(salt, actionId), deliveryHash: digest(salt, `${event.seat}:${ack.deliveryId}`),
      retryDeliveryHash: digest(salt, `${event.seat}:${retry.deliveryId}`),
      receiptHash: digest(salt, JSON.stringify({ status: ack.status, result: ack.result })),
      retryReceiptHash: digest(salt, JSON.stringify({ status: retry.status, result: retry.result })),
      consequenceCount: consequence ? 1 : 0,
      consequenceHash: consequence ? digest(salt, `${actionId}:${consequence.eventSeq}`) : null,
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
    await startSimServer(port, { keepAlive: true, registerProcessCleanup: false,
      nodeArgs: ["--expose-gc"], env: { LBH_SIM_WS_ENABLED: "true",
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
          return reliableDrainComplete(health) ? true : false;
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
        const actualGcElapsedMs = gc.monotonicMs - authorityMonotonicOrigin;
        const actualGcMinute = Math.floor(actualGcElapsedMs / 60000);
        actualExcludedPerformanceMinutes.add(actualGcMinute);
        actualExcludedPerformanceMinutes.add(actualGcMinute + 1);
        forcedGcPoints.push({ minute: actualGcElapsedMs / 60000, plannedElapsedMs: event.atMs,
          actualElapsedMs: actualGcElapsedMs,
          heapUsed: postGc.safe.heapUsed, rss: postGc.safe.rss });
        lastBarrier = "forced-gc-checkpoint-complete";
      } else if (event.kind === "final-drain") lastBarrier = "final-drain";
    }
    await waitFor(async () => {
      const health = await getHealth(fixture.wallTimeMs);
      return reliableDrainComplete(health) ? true : false;
    }, "final reliable ACK retirement", 5000);
    if (normal && timeScale === 1) {
      const finalMinute = fixture.wallTimeMs / 60000 - 1;
      const deadline = performance.now() + 9000;
      let covered = false;
      while (!covered && performance.now() < deadline) {
        const health = await getHealth(fixture.wallTimeMs);
        const diagnostics = health.safe.soakDiagnostics;
        const completed = diagnostics?.completedWindows || [];
        covered = completed.some((window) => Math.max(0,
          Math.floor((window.endedMonotonicMs - authorityMonotonicOrigin) / 60000) - 1) === finalMinute);
        if (!covered && diagnostics?.currentWindow) {
          const currentMinute = Math.floor((diagnostics.currentWindow.startedMonotonicMs - authorityMonotonicOrigin) / 60000);
          covered = currentMinute === finalMinute && diagnostics.currentWindow.durationMs >= 57000
            && diagnostics.currentWindow.sampleCount >= 57;
        }
        if (!covered) await sleep(1000);
      }
      if (!covered) throw new Error("final authority diagnostic minute did not reach 57 samples within 9s");
    }
    const final = await getHealth(fixture.wallTimeMs);
    if (digest(salt, final.raw.session?.runId) !== authorityRunHash) throw new Error("authority run identity changed");
    const details = final.raw.multiplayer.adapter.pressure.connections || {};
    for (let seat = 0; seat < 8; seat += 1) {
      const current = details[String(ordinals[seat].at(-1))];
      const welcome = clients[seat].latestFrames.welcome;
      const expectedEpoch = normal ? initialEpochs[seat]
        : seat === 4 ? initialEpochs[seat] + 1 : initialEpochs[seat];
      if (!current || current.connectionEpoch !== expectedEpoch || welcome.connectionEpoch !== expectedEpoch) {
        throw new Error(`seat ${seat} final epoch/isolation mismatch`);
      }
      if ((normal || (seat !== 4 && seat !== 5)) && ordinals[seat].length !== 1) throw new Error(`healthy seat ${seat} changed socket`);
      if (current.counts?.highWaterCrossings || current.counts?.disconnects
        || current.counts?.rebases > (!normal && seat === 4 ? 1 : 0)) {
        throw new Error(`seat ${seat} violated pressure/isolation gate`);
      }
      const acks = clients[seat].frames.filter((frame) => frame.type === "ack" && frame.ackKind === "input");
      if (!acks.length) throw new Error(`seat ${seat} lacks input ACK progress`);
    }
    const plannedActionCount = schedule.events.filter((event) => event.kind === "action").length;
    const expectedOutcomeCount = plannedActionCount + (normal ? 0 : 2);
    if (actionOutcomes.size !== expectedOutcomeCount) throw new Error(`expected ${expectedOutcomeCount} reliable action outcomes, saw ${actionOutcomes.size}`);
    if (eventAckLedger.withheld !== (normal ? 0 : 1)
      || eventAckLedger.decisions - (normal ? 0 : 1) !== eventAckLedger.deliveryAcks
      || eventAckLedger.deliveryAcks !== eventAckLedger.eventAcks) {
      throw new Error(`event dual-ACK ledger mismatch: ${JSON.stringify(eventAckLedger)}`);
    }
    const exactEventAckFacts = [...eventAckFacts.values()].every((fact) => fact.decisions === 1
      && fact.deliveryAcks === (fact.withheld ? 0 : 1) && fact.eventAcks === (fact.withheld ? 0 : 1));
    if (!exactEventAckFacts || eventAckFacts.size !== allClients.reduce((sum, client) =>
      sum + client.frames.filter((frame) => frame.type === "event").length, 0)) {
      throw new Error("per-event per-physical-client delivery/event ACK ledger was not exact");
    }
    if (normal && fencedClients.length) throw new Error("normal soak fenced a client");
    if (fencedClients.some(({ client, framesAtFence }) => client.frames.length !== framesAtFence)) {
      throw new Error("fenced old epoch received application-visible frames after replacement");
    }
    if (allClients.some((client) => client.error || client.frames.length > fixture.evidence.maxRawFramesPerClient
      || client.receiveCount > fixture.evidence.maxRawReceiveFramesPerClient)) {
      throw new Error("raw client error or immutable frame evidence cap exceeded");
    }
    const plannedStreamIds = new Set(schedule.events.filter((event) => event.kind === "action").map((event) => event.semanticId));
    const actionAcks = allClients.flatMap((client) => client.frames.filter((frame) => frame.type === "ack" && frame.ackKind === "action"));
    const actionAckCounts = new Map();
    for (const ack of actionAcks) actionAckCounts.set(ack.actionId, (actionAckCounts.get(ack.actionId) || 0) + 1);
    if (actionAcks.some((ack) => !plannedStreamIds.has(ack.actionId)) || plannedStreamIds.size !== plannedActionCount
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
    if (normal) {
      const acceptedPulseByActor = Array.from({ length: 8 }, (_, seat) => [...actionOutcomes.values()].filter((entry) =>
        entry.seat === seat && entry.actionKind === "pulse" && entry.status === "accepted").length);
      const canonicalPulseSets = Array.from({ length: 8 }, () => null);
      for (const client of clients) {
        for (let actor = 0; actor < 8; actor += 1) {
          const pulses = client.frames.filter((frame) => frame.type === "event" && frame.eventType === "player.pulse"
            && frame.payload?.clientId === `soak-seat-${actor}`);
          const seqs = pulses.map((frame) => frame.eventSeq);
          if (seqs.length !== acceptedPulseByActor[actor] || new Set(seqs).size !== seqs.length) {
            throw new Error(`pulse action consequence total mismatch for actor ${actor} on ${client.pilotSlot}`);
          }
          const normalized = JSON.stringify([...seqs].sort((a, b) => a - b));
          canonicalPulseSets[actor] ||= normalized;
          if (canonicalPulseSets[actor] !== normalized) throw new Error(`pulse entitlement diverged for actor ${actor}`);
        }
      }
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
    const warmupMinute = fixture.warmupMs / 60000;
    const finalMinute = fixture.wallTimeMs / 60000;
    const candidateMinutes = Array.from({ length: finalMinute - warmupMinute }, (_, index) => warmupMinute + index);
    const excludedMinutes = normal && timeScale === 1 ? [...actualExcludedPerformanceMinutes].sort((a, b) => a - b)
      : schedule.excludedPerformanceMinutes;
    if (normal && timeScale === 1 && JSON.stringify(excludedMinutes) !== JSON.stringify(schedule.excludedPerformanceMinutes)) {
      throw new Error(`actual forced-GC exclusion minutes drifted from schedule: ${JSON.stringify({ excludedMinutes,
        scheduled: schedule.excludedPerformanceMinutes })}`);
    }
    const includedMinutes = candidateMinutes.filter((minute) => !excludedMinutes.includes(minute));
    const performanceWindows = windows.map((window) => ({ window,
      minute: Math.max(0, Math.floor((window.endedMonotonicMs - authorityMonotonicOrigin) / 60000) - 1) })).filter(({ minute }) => {
      return includedMinutes.includes(minute);
    });
    const currentDiagnosticWindow = lastDiagnosticStatus?.currentWindow;
    if (currentDiagnosticWindow?.durationMs >= 57000 && currentDiagnosticWindow.sampleCount >= 57) {
      const currentMinute = Math.floor((currentDiagnosticWindow.startedMonotonicMs - authorityMonotonicOrigin) / 60000);
      performanceWindows.push({ minute: currentMinute, window: currentDiagnosticWindow });
    }
    const uniqueWindowMinutes = new Set(performanceWindows.map((entry) => entry.minute));
    if (uniqueWindowMinutes.size !== performanceWindows.length) throw new Error("duplicate authority diagnostic minute classification");
    const eventLoopMinutes = [...performanceWindows.map((entry) => entry.minute)].sort((a, b) => a - b);
    const expectedPerformanceMinutes = normal ? includedMinutes : [1, 2, 5];
    const eventLoopPass = JSON.stringify(eventLoopMinutes) === JSON.stringify(expectedPerformanceMinutes)
      && performanceWindows.every(({ window }) => window.eventLoopDelay.p99Ms <= 50
        && window.eventLoopDelay.maxMs <= 250);
    const minuteRates = expectedPerformanceMinutes.map((minute) => {
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
      return expectedPerformanceMinutes.includes(minute);
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
    const modeMinutes = candidateMinutes.map((minute) => {
      const samples = healthSamples.filter((sample) => sample.actualElapsedMs >= minute * 60000
        && sample.actualElapsedMs < (minute + 1) * 60000);
      return { minute, sampleCount: samples.length,
        normal: samples.length >= 10 && samples.every((sample) => sample.safe.overloadState === "NORMAL") };
    });
    const normalMinuteRatio = modeMinutes.filter((entry) => entry.normal).length / Math.max(1, modeMinutes.length);
    // The authenticated health surface exposes live stream topology, not a
    // duplicate membership count. Eight bound connections plus the immutable
    // admission/ordinal/epoch ledgers are the normal profile's membership proof.
    const stableNormalTopology = !normal || postWarmHealth.every(({ safe }) => safe.adapter.connections === 8
      && safe.adapter.bound === 8 && safe.adapter.closing === 0);
    const bytesBySeat = Array.from({ length: 8 }, (_, seat) => allClients.filter((client) => client.pilotSlot.startsWith(`seat-${seat}`))
      .reduce((sum, client) => sum + client.rawBytes + client.sentBytes, 0));
    const sortedBytes = [...bytesBySeat].sort((a, b) => a - b);
    const medianBytes = (sortedBytes[3] + sortedBytes[4]) / 2;
    const trafficBps = bytesBySeat.reduce((sum, bytes) => sum + bytes, 0) / (fixture.wallTimeMs / 1000);
    const minuteTraffic = expectedPerformanceMinutes.map((minute) => {
      const samples = healthSamples.filter((sample) => sample.actualElapsedMs >= minute * 60000
        && sample.actualElapsedMs <= (minute + 1) * 60000);
      const first = samples[0]?.safe.trafficBySeat;
      const last = samples.at(-1)?.safe.trafficBySeat;
      const seconds = samples.length > 1 ? (samples.at(-1).actualElapsedMs - samples[0].actualElapsedMs) / 1000 : 0;
      const seatBytes = first && last ? last.map((entry, seat) =>
        entry.receivedBytes + entry.sentBytes - first[seat].receivedBytes - first[seat].sentBytes) : [];
      const channelBySeat = first && last ? last.map((entry, seat) => ({ seat,
        inputBytesSent: entry.sentBytesByType.input - first[seat].sentBytesByType.input,
        actionBytesSent: entry.sentBytesByType.action - first[seat].sentBytesByType.action,
        ackBytesSent: entry.sentBytesByType.ack - first[seat].sentBytesByType.ack,
        stateBytesReceived: entry.receivedBytesByType.publicState + entry.receivedBytesByType.ownerState
          - first[seat].receivedBytesByType.publicState - first[seat].receivedBytesByType.ownerState,
        reliableBytesReceived: entry.receivedBytesByType.event + entry.receivedBytesByType.ack
          - first[seat].receivedBytesByType.event - first[seat].receivedBytesByType.ack,
        inputAcks: entry.inputAcks - first[seat].inputAcks,
        actionAcks: entry.actionAcks - first[seat].actionAcks,
        authorityReliableRetired: (entry.authorityCounts.reliableAckRetired || 0)
          - (first[seat].authorityCounts.reliableAckRetired || 0),
        authorityStateFramesAccepted: Object.values(entry.authorityCounts.stateFramesWsSendAccepted || {})
          .reduce((sum, value) => sum + value, 0)
          - Object.values(first[seat].authorityCounts.stateFramesWsSendAccepted || {}).reduce((sum, value) => sum + value, 0),
      })) : [];
      const sorted = [...seatBytes].sort((a, b) => a - b);
      const median = sorted.length === 8 ? (sorted[3] + sorted[4]) / 2 : 0;
      return { minute, seconds, seatBytes, channelBySeat, median, skewRequired: normal || minute !== 5, aggregateBytesPerSec: seconds > 0
        ? seatBytes.reduce((sum, bytes) => sum + bytes, 0) / seconds : Infinity,
      ackProgress: first && last ? last.every((entry, seat) => entry.inputAcks > first[seat].inputAcks) : false };
    });
    const trafficPass = trafficBps <= 2.5e6 && bytesBySeat.every((bytes) => bytes <= medianBytes * 2)
      && minuteTraffic.every((entry) => entry.aggregateBytesPerSec <= 2.5e6 && entry.ackProgress
        && entry.channelBySeat.every((seat) => seat.inputBytesSent > 0 && seat.stateBytesReceived > 0
          && seat.inputAcks > 0 && seat.authorityStateFramesAccepted > 0)
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
    const retentionObservations = healthSamples.flatMap((sample) => {
      const actions = sample.safe.retention.actions || {};
      const replay = sample.safe.retention.adapterEventReplay || {};
      return [
        { elapsedMs: sample.actualElapsedMs, name: "eventJournal", current: sample.safe.retention.eventJournal?.retainedCount,
          capacity: sample.safe.retention.eventJournal?.capacity },
        { elapsedMs: sample.actualElapsedMs, name: "snapshotRing", current: sample.safe.retention.snapshotRing?.retainedCount,
          capacity: sample.safe.retention.snapshotRing?.capacity },
        { elapsedMs: sample.actualElapsedMs, name: "actionReceipts", current: actions.retained,
          capacity: (actions.memberships || 0) * (actions.capacityPerMembership || 0) },
        { elapsedMs: sample.actualElapsedMs, name: "eventReplayFrames", current: replay.pendingEventFrames,
          capacity: (sample.safe.adapter.connections || 0) * (replay.maxPendingPerBinding || 0) },
        { elapsedMs: sample.actualElapsedMs, name: "eventReplayBytes", current: replay.pendingEventBytes,
          capacity: (sample.safe.adapter.connections || 0) * (replay.maxPendingBytesPerBinding || 0) },
        { elapsedMs: sample.actualElapsedMs, name: "tickets", current: sample.safe.tickets.retained,
          capacity: sample.safe.tickets.capacity },
      ];
    });
    const retentionMaxima = Object.values(Object.groupBy(retentionObservations, (entry) => entry.name)).map((entries) => ({
      name: entries[0].name, maximum: Math.max(...entries.map((entry) => entry.current)),
      capacity: Math.min(...entries.map((entry) => entry.capacity)), samples: entries.length,
    }));
    const retentionPass = retentionPairs.every(({ current, capacity }) => current <= capacity)
      && retentionObservations.every(({ current, capacity }) => Number.isFinite(current)
        && Number.isFinite(capacity) && current <= capacity);
    const authoritativeActions = plannedActionCount - (normal ? 0 : 1);
    const actionAccountingPass = rawActions.adjudicated === authoritativeActions && rawActions.replays === authoritativeActions
      && rawActions.accepted + rawActions.rejected === authoritativeActions && rawActions.conflicts === 0 && rawActions.stale === 0
      && rawActions.gaps === 0;
    const replayAccountingPass = rawReplay.pendingEventFrames === 0 && rawReplay.pendingEventBytes === 0
      && rawReplay.replayedEvents - rawReplay.eventAcks === (normal ? 0 : 1) && rawReplay.forcedRebases === 0
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
    const recoveryPass = normal ? recoveryLedger.length === 0
      : recoveryLedger.length === 2 && recoveryLedger.every((entry) => entry.durationMs <= 15000);
    const actualWallMs = performance.now() - monotonicStarted;
    const wallPass = timeScale !== 1 || (actualWallMs >= fixture.wallTimeMs && actualWallMs <= fixture.wallTimeMs + 10000
      && maxScheduleLatenessMs <= 5000);
    const gcPass = performanceWindows.every(({ window }) => window.gc.durationTotalMs / Math.max(1, window.durationMs) <= 0.02
      && window.gc.p99Ms <= 50 && window.gc.maxMs <= 250);
    const fullGcBins = [0, 1, 2].map((bin) => performanceWindows.filter(({ minute }) => minute >= warmupMinute + bin * 10
      && minute < warmupMinute + (bin + 1) * 10).reduce((sum, { window }) => sum + (window.gc.kindCounts?.[4] || 0), 0));
    const fullGcStable = !(fullGcBins[0] < fullGcBins[1] && fullGcBins[1] < fullGcBins[2]);
    const heapPoints = forcedGcPoints.filter((point) => point.actualElapsedMs >= fixture.warmupMs);
    const heapSlope = theilSen(heapPoints.map((point) => ({ minute: point.minute, value: point.heapUsed })));
    const heapOls = linearRegression(heapPoints.map((point) => ({ minute: point.minute, value: point.heapUsed })));
    const rssOls = linearRegression(postWarmHealth.map((sample) => ({ minute: sample.actualElapsedMs / 60000,
      value: sample.safe.rss })));
    const firstFiveGcMedian = median(heapPoints.slice(0, 5).map((point) => point.heapUsed));
    const lastFiveGcMedian = median(heapPoints.slice(-5).map((point) => point.heapUsed));
    const firstMeasuredHeapMedian = median(postWarmHealth.filter((sample) => sample.actualElapsedMs < fixture.warmupMs + 300000)
      .map((sample) => sample.safe.heapUsed));
    const rawHeapPeak = Math.max(...postWarmHealth.map((sample) => sample.safe.heapUsed));
    const rssBaseline = median(postWarmHealth.filter((sample) => sample.actualElapsedMs < fixture.warmupMs + 300000)
      .map((sample) => sample.safe.rss));
    const rssPeak = Math.max(...postWarmHealth.map((sample) => sample.safe.rss));
    const heapPass = !normal || (heapPoints.length >= 12 && Number.isFinite(heapSlope) && heapSlope <= 1024 * 1024
      && lastFiveGcMedian <= firstFiveGcMedian + 32 * 1024 * 1024
      && rawHeapPeak <= firstMeasuredHeapMedian + 96 * 1024 * 1024);
    const rssPass = !normal || rssPeak <= rssBaseline + 160 * 1024 * 1024;
    const resourceMinutePass = performanceWindows.every(({ window }) => [window.cpu.userMicros.count,
      window.cpu.systemMicros.count, window.eventLoopUtilization.utilization.count].every((value) => value >= 57));
    measuredGates = {
      sampleCoverage: { status: timeScale !== 1 ? "NOT_APPLICABLE_ACCELERATED_DIAGNOSTIC"
        : sampleCoverage >= 0.95 ? "PASS" : "FAIL", numerator: diagnosticSamples,
        denominator: coverageDenominator, threshold: ">=95% one-Hz", source: "runtime-windows.jsonl" },
      cadence: { status: timeScale !== 1 ? "NOT_APPLICABLE_ACCELERATED_DIAGNOSTIC"
        : cadencePass ? "PASS" : "FAIL", numerator: minuteRates, denominator: expectedPerformanceMinutes.length,
        threshold: ">=90% configured tick/projection target in non-excluded minutes", source: "authority-health.jsonl" },
      runtimeDurations: { status: timeScale !== 1 ? "NOT_APPLICABLE_ACCELERATED_DIAGNOSTIC"
        : durationPass ? "PASS" : "FAIL", numerator: includedCostSamples, denominator: includedCostSamples.length,
        threshold: "every included 5s rolling source stays within tick 10/20/100ms and projection 20/40/150ms p95/p99/max",
        source: "authority-health.jsonl" },
      diagnosticsIntegrity: { status: timeScale !== 1 ? "NOT_APPLICABLE_ACCELERATED_DIAGNOSTIC"
        : diagnosticsPass && normalMinuteRatio >= 0.99 && stableNormalTopology ? "PASS" : "FAIL",
      numerator: { accounting: diagnosticAccounting, normalSamples: postWarmHealth.filter((sample) => sample.safe.overloadState === "NORMAL").length,
        totalSamples: postWarmHealth.length, pollNormalRatio: normalRatio, normalMinuteRatio, modeMinutes,
        stableNormalTopology }, denominator: modeMinutes.length,
      threshold: "zero diagnostic failures/misses/overflow, >=99% all-NORMAL one-minute samples, stable eight-client topology", source: "runtime-windows.jsonl" },
      eventLoop: { status: timeScale !== 1 ? "NOT_APPLICABLE_ACCELERATED_DIAGNOSTIC"
        : eventLoopPass && performanceWindows.length === expectedPerformanceMinutes.length ? "PASS" : "FAIL",
        numerator: performanceWindows.map(({ minute, window }) => ({ minute, ...window.eventLoopDelay,
          durationMs: window.durationMs, sampleCount: window.sampleCount })), denominator: performanceWindows.length,
        threshold: "each included minute p99<=50ms max<=250ms", source: "runtime-windows.jsonl" },
      traffic: { status: timeScale !== 1 ? "NOT_APPLICABLE_ACCELERATED_DIAGNOSTIC"
        : trafficPass ? "PASS" : "FAIL", numerator: { aggregateBytesPerSec: trafficBps,
        applicationBytesPerPlayerSecond: trafficBps / 8, bytesBySeat, medianBytes, minuteTraffic },
        denominator: 8, threshold: "full-JSON regression debt: both directions <=2.5MB/s aggregate, per-minute ACK progress, <=2x cohort median outside recovery",
        source: "authority-health.jsonl" },
      retention: { status: retentionPass && pressureBoundsPass ? "PASS" : "FAIL",
        numerator: { retained: retentionPairs, retainedMaxima: retentionMaxima, pressure: pressureBounds },
        denominator: retentionObservations.length + pressureBounds.length,
        threshold: "all retained registries <= advertised capacity", source: "authority-health.jsonl" },
      authorityReliabilityAccounting: { status: actionAccountingPass && replayAccountingPass ? "PASS" : "FAIL",
        numerator: { actions: rawActions, eventReplay: rawReplay }, denominator: normal
          ? { currentMembershipStreamActions: plannedActionCount, streamRetries: plannedActionCount, intentionallyUnackedOldEpochEvents: 0 }
          : { currentMembershipStreamActions: 13, departedMembershipActionsProvenInHarnessLedger: 1,
            streamRetries: 14, intentionallyUnackedOldEpochEvents: 1 },
        threshold: "exact current authority adjudication/retry counts plus one departed receipt and one reset old-epoch hold",
        source: "authority-health.jsonl" },
      recovery: { status: recoveryPass ? "PASS" : "FAIL", numerator: recoveryLedger, denominator: normal ? 0 : 2,
        threshold: normal ? "zero reconnect/replacement recovery events" : "both barriers restore eight clients within 15s", source: "membership-ledger.jsonl" },
      heapSlope: { status: timeScale !== 1 ? "NOT_APPLICABLE_ACCELERATED_DIAGNOSTIC" : heapPass ? "PASS" : "FAIL",
        numerator: { points: heapPoints, theilSenBytesPerMinute: heapSlope, olsBytesPerMinute: heapOls.slope,
          olsRSquared: heapOls.rSquared, postGcMinimum: Math.min(...heapPoints.map((point) => point.heapUsed)),
          firstFiveGcMedian, lastFiveGcMedian, firstMeasuredHeapMedian, rawHeapPeak,
          minuteMedians: performanceWindows.map(({ minute, window }) => ({ minute,
            heapUsed: window.memory.heapUsed?.p50, rss: window.memory.rss?.p50 })) }, denominator: heapPoints.length,
        threshold: ">=12 points; slope<=1MiB/min; endpoint<=+32MiB; peak<=+96MiB", source: "forced-gc.jsonl" },
      rssPeak: { status: timeScale !== 1 ? "NOT_APPLICABLE_ACCELERATED_DIAGNOSTIC" : rssPass ? "PASS" : "FAIL",
        numerator: { baseline: rssBaseline, peak: rssPeak, olsBytesPerMinute: rssOls.slope,
          olsRSquared: rssOls.rSquared }, denominator: postWarmHealth.length,
        threshold: "peak<=first measured five-minute median+160MiB; slope diagnostic only", source: "authority-health.jsonl" },
      gc: { status: timeScale !== 1 ? "NOT_APPLICABLE_ACCELERATED_DIAGNOSTIC" : gcPass && fullGcStable ? "PASS" : "FAIL",
        numerator: { fullGcBins, windows: performanceWindows.map(({ minute, window }) => ({ minute, gc: window.gc })) },
        denominator: performanceWindows.length, threshold: "duty<=2%; p99<=50ms; max<=250ms; no three-bin full-GC increase", source: "runtime-windows.jsonl" },
      cpuElu: { status: timeScale !== 1 ? "NOT_APPLICABLE_ACCELERATED_DIAGNOSTIC" : resourceMinutePass ? "PASS" : "FAIL",
        numerator: performanceWindows.map(({ minute, window }) => ({ minute, cpu: window.cpu, elu: window.eventLoopUtilization })),
        denominator: performanceWindows.length, threshold: ">=57 numeric CPU/ELU samples per included minute", source: "runtime-windows.jsonl" },
      wallTime: { status: wallPass ? "PASS" : "FAIL", numerator: { actualWallMs, maxScheduleLatenessMs }, denominator: fixture.wallTimeMs,
        threshold: `declared ${fixture.wallTimeMs / 60000} minutes, <=5s barrier lateness`, source: "schedule.json" },
    };
    const failedMeasured = Object.entries(measuredGates).filter(([, gate]) => gate.status === "FAIL").map(([name]) => name);
    if (failedMeasured.length) throw new Error(`${fixture.profile} measured gates failed: ${failedMeasured.join(",")}`);
  } catch (error) {
    failure = error.stack || error.message;
  } finally {
    cleanup = await finalCleanup();
  }
  const gates = {
    deterministicSchedule: { status: "PASS", numerator: schedule.scheduleHash, denominator: 1, threshold: "exact fixture hash", source: "schedule.json" },
    topology: { status: membershipCounts.initialAdmissions === 8
      && membershipCounts.replacementAdmissions === (normal ? 0 : 1)
      && membershipCounts.reconnects === (normal ? 0 : 1) && membershipCounts.leaves === (normal ? 0 : 1)
      && membershipCounts.invalidatedTicketRejections === (normal ? 0 : 1)
      && membershipCounts.closedSocketAckWriteRejections === (normal ? 0 : 2)
      && authorityRunHashes.size === 1 ? "PASS" : "FAIL",
      numerator: { ...membershipCounts, authoritiesPerMatch: authorityRunHashes.size,
        distinctInitialOrdinals: new Set(ordinals.map((entries) => entries[0])).size },
      denominator: { seats: 8 }, threshold: normal ? "8 initial, zero churn, one logical authority"
        : "8 initial + 1 replacement, one logical authority", source: "membership-ledger.jsonl" },
    privacy: { status: !privacyOracle.overflow && privacyOracle.violations.length === 0
      && privacyOracle.latest.every((entry) => entry.publicSeen && entry.ownerSeen && entry.currentMarkerPresent) ? "PASS" : "FAIL",
    numerator: { inspectedFrames: privacyOracle.inspectedFrames, publicFrames: privacyOracle.publicFrames,
      ownerFrames: privacyOracle.ownerFrames, violations: privacyOracle.violations.length, overflow: privacyOracle.overflow,
      alignedSeats: privacyOracle.latest.filter((entry) => entry.publicSeen && entry.ownerSeen && entry.currentMarkerPresent).length },
    denominator: 8, threshold: "incremental all-frame marker isolation with eight latest aligned owner/public facts",
    source: "bounds-and-privacy.json" },
    reliability: { status: actionOutcomes.size === schedule.events.filter((event) => event.kind === "action").length + (normal ? 0 : 2)
      && [...actionOutcomes.values()].filter((entry) => typeof entry.round === "number")
        .every((entry) => entry.receiptHash === entry.retryReceiptHash && entry.deliveryAckSent && entry.retryDeliveryAckSent
          && entry.consequenceCount <= 1 && (entry.status === "accepted" || entry.consequenceCount === 0))
      && [...actionOutcomes.values()].filter((entry) => typeof entry.round === "string")
        .every((entry) => entry.status === "accepted" && entry.consequenceHash) ? "PASS" : "FAIL",
    numerator: { total: actionOutcomes.size,
      accepted: [...actionOutcomes.values()].filter((entry) => entry.status === "accepted").length,
      rejected: [...actionOutcomes.values()].filter((entry) => entry.status === "rejected").length,
      stableStreamRetries: [...actionOutcomes.values()].filter((entry) => typeof entry.round === "number"
        && entry.receiptHash === entry.retryReceiptHash).length,
      exactCycleConsequences: [...actionOutcomes.values()].filter((entry) => typeof entry.round === "string" && entry.consequenceHash).length },
    denominator: { planned: schedule.events.filter((event) => event.kind === "action").length + (normal ? 0 : 2),
      streamRetries: schedule.events.filter((event) => event.kind === "action").length, cycleConsequences: normal ? 0 : 2 },
    threshold: "every identity has one stable receipt; at most one correlated consequence; rejected identities have none; exact entitlement and retirement",
    source: "reliable-ledger.jsonl" },
    eventAckLedger: { status: eventAckLedger.withheld === (normal ? 0 : 1)
      && eventAckLedger.decisions - (normal ? 0 : 1) === eventAckLedger.deliveryAcks
      && eventAckLedger.deliveryAcks === eventAckLedger.eventAcks
      && [...eventAckFacts.values()].every((fact) => fact.decisions === 1
        && fact.deliveryAcks === (fact.withheld ? 0 : 1) && fact.eventAcks === (fact.withheld ? 0 : 1)) ? "PASS" : "FAIL",
    numerator: { aggregate: eventAckLedger, identityFacts: eventAckFacts.size },
      denominator: eventAckLedger.decisions, threshold: "one named old-epoch hold, all other events immediate dual ACK", source: "client-ledger.jsonl" },
    ...(normal ? {} : {
      heapSlope: { status: "NOT_APPLICABLE_SHORT_RUN", numerator: 0, denominator: 0, threshold: "canonical only", source: "profile" },
      rssSlope: { status: "NOT_APPLICABLE_SHORT_RUN", numerator: 0, denominator: 0, threshold: "diagnostic only", source: "profile" },
      gcDuty: { status: "NOT_APPLICABLE_SHORT_RUN", numerator: 0, denominator: 0, threshold: "canonical only", source: "profile" },
      longWindowRecovery: { status: "NOT_APPLICABLE_SHORT_RUN", numerator: 0, denominator: 0, threshold: "canonical only", source: "profile" },
    }),
    cleanup: { status: cleanup?.passed ? "PASS" : "FAIL", numerator: cleanup, denominator: 1,
      threshold: "owned process gone and port reusable", source: "cleanup.json" },
    ...measuredGates,
  };
  const passed = !failure && timeScale === 1 && Object.values(gates).every((gate) => gate.status !== "FAIL");
  return { passed, failure: failure || (timeScale !== 1 ? "accelerated diagnostic cannot pass" : null),
    authorityPid, authorityRunHash, actionCount: actionOutcomes.size, incarnations, ordinals,
    httpAccounting: accounting, gates, cleanup, privacy: { inspectedFrames: privacyOracle.inspectedFrames,
      publicFrames: privacyOracle.publicFrames, ownerFrames: privacyOracle.ownerFrames,
      violations: privacyOracle.violations.length, overflow: privacyOracle.overflow,
      alignedSeats: privacyOracle.latest.filter((entry) => entry.publicSeen && entry.ownerSeen && entry.currentMarkerPresent).length },
    commit, dirty, timeScale };
}

module.exports = { runEightPlayerSoak, writeExclusive };
