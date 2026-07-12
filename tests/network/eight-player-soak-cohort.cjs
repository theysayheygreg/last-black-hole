"use strict";

const crypto = require("crypto");
const fs = require("fs");
const net = require("net");
const path = require("path");
const { startSimServer, stopSimServer } = require("../helpers.cjs");
const { openRawClient, closeRawClient, terminateRawClient, waitFor } = require("./raw-ws-client.cjs");

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
  const headers = { "content-type": "application/json" };
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

function safeHealth(body, elapsedMs) {
  const adapter = body.multiplayer?.adapter || {};
  const pressure = adapter.pressure || {};
  const tickets = body.multiplayer?.tickets || {};
  const session = body.session || {};
  return {
    elapsedMs, pid: body.process?.pid ?? null, rss: body.process?.memory?.rss ?? body.process?.rss ?? null,
    heapUsed: body.process?.memory?.heapUsed ?? body.process?.heapUsed ?? null,
    overloadState: session.overloadState ?? null,
    clients: body.multiplayer?.memberships?.active ?? body.session?.players ?? null,
    adapter: { connections: adapter.connections, bound: adapter.bound, closing: adapter.closing,
      queuedBytes: adapter.queuedBytes, queuedMessages: adapter.queuedMessages,
      pendingScheduledSends: adapter.pendingScheduledSends, livenessTimers: adapter.livenessTimers,
      highWaterCrossings: pressure.policy?.transportHighWaterCrossings,
      queuePolicyEvents: pressure.policy?.queuePolicyEvents,
      observerFailures: pressure.observer?.failures,
      pressureCurrent: pressure.current },
    tickets: { retained: tickets.retained, pending: tickets.counts?.pending,
      issued: tickets.counts?.issued, redeemed: tickets.counts?.redeemed },
    projection: body.multiplayer?.projection || null,
    ticks: body.ticks || body.multiplayer?.ticks || null,
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
  const files = Object.fromEntries(["authority-health", "runtime-windows", "client-ledger", "membership-ledger", "reliable-ledger"]
    .map((name) => [name, createBoundedJsonl(path.join(runDir, `${name}.jsonl`), fixture)]));
  const accounting = {};
  const clients = Array(8).fill(null);
  const authorities = Array(8).fill(null);
  const incarnations = Array(8).fill(0);
  const ordinals = Array.from({ length: 8 }, () => []);
  const commandSeq = Array(8).fill(0);
  const inputSeq = Array(8).fill(0);
  const initialEpochs = Array(8).fill(null);
  const actionOutcomes = new Map();
  const eventAckLedger = { decisions: 0, withheld: 0, deliveryAcks: 0, eventAcks: 0 };
  const startedAt = Date.now();
  const monotonicStarted = performance.now();
  let authorityPid = null;
  let authorityRunHash = null;
  let stopped = false;
  let failure = null;
  let lastBarrier = "created";
  let checkpointTimer = null;
  const recordClient = (entry) => files["client-ledger"]({ elapsedMs: Math.round(performance.now() - monotonicStarted), ...entry });
  const clientRecord = (seat) => (entry) => {
    if (entry.type === "event-ack-decision") {
      eventAckLedger.decisions += 1;
      if (entry.withheld) eventAckLedger.withheld += 1;
    } else if (entry.type === "delivery-ack") eventAckLedger.deliveryAcks += 1;
    else if (entry.type === "event-ack") eventAckLedger.eventAcks += 1;
    if (entry.type === "frame" && !["welcome", "rebase", "ack", "event"].includes(entry.frameType)) return;
    recordClient({ seat, incarnation: incarnations[seat], ...entry, pilotSlot: undefined,
      deliveryId: entry.deliveryId == null ? null : digest(salt, entry.deliveryId) });
  };
  const checkpoint = () => {
    const value = { profile: fixture.profile, scheduleHash: schedule.scheduleHash,
      elapsedMs: Math.round(performance.now() - monotonicStarted), lastBarrier,
      admissions: incarnations.reduce((sum, value) => sum + (value > 0 ? 1 : 0), 0),
      actions: actionOutcomes.size, pid: authorityPid, port };
    const target = path.join(runDir, "checkpoint.json");
    const temp = `${target}.tmp`;
    fs.writeFileSync(temp, `${JSON.stringify(value, null, 2)}\n`);
    fs.renameSync(temp, target);
  };
  const getHealth = async (elapsedMs) => {
    const response = await request(port, "/health", { accounting });
    if (response.status !== 200) throw new Error(`health returned ${response.status}`);
    const safe = safeHealth(response.body, elapsedMs);
    files["authority-health"](safe);
    if (safe.soakDiagnostics) {
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
    const joined = await request(port, "/join", { method: "POST", accounting, body: {
      runId: started.session.runId, clientId: id, joinTicket: !replacement && seat === 0 ? started.joinTicket : undefined,
      name: `Soak Seat ${seat}`, equipped: [{ id: `soak-secret-${seat}-${incarnations[seat]}`,
        name: `Soak Rig ${seat}`, subcategory: "equippable" }],
    } });
    if (joined.status !== 200) throw new Error(`join failed for seat ${seat}: ${JSON.stringify(joined.body)}`);
    authorities[seat] = joined.body.authority;
    const ticket = await issueTicket(seat, "admission");
    clients[seat] = await openRawClient({ port, ticket, pilotSlot: `seat-${seat}`,
      record: clientRecord(seat), maxFrames: fixture.evidence.maxRawFramesPerClient });
    await captureOrdinal(before, seat);
    const welcome = clients[seat].frames.find((frame) => frame.type === "welcome");
    initialEpochs[seat] = welcome.connectionEpoch;
    files["membership-ledger"]({ type: replacement ? "replacement-admission" : "initial-admission", seat,
      incarnation: incarnations[seat], membershipHash: digest(salt, authorities[seat].membershipId),
      playerHash: digest(salt, authorities[seat].playerId), epoch: welcome.connectionEpoch,
      ordinal: ordinals[seat].at(-1), elapsedMs: Math.round(performance.now() - monotonicStarted) });
  };
  const reconnect = async (seat) => {
    const old = clients[seat];
    const oldWelcome = old.frames.find((frame) => frame.type === "welcome");
    const publicState = [...old.frames].reverse().find((frame) => frame.type === "publicState");
    const beforeHealth = await getHealth(Math.round(performance.now() - monotonicStarted));
    const before = new Set(Object.keys(beforeHealth.raw.multiplayer.adapter.pressure.connections || {}));
    terminateRawClient(old);
    await waitFor(() => old.close, `seat ${seat} reconnect close`, 3000);
    const ticket = await issueTicket(seat, "resume");
    const next = await openRawClient({ port, ticket, kind: "resume", pilotSlot: `seat-${seat}-resume`,
      cursors: { lastRunId: authorities[seat].runId, lastSnapshotId: publicState.snapshotId,
        lastEventSeq: publicState.lastEventSeq }, record: clientRecord(seat),
      maxFrames: fixture.evidence.maxRawFramesPerClient });
    clients[seat] = next;
    await captureOrdinal(before, seat);
    const welcome = next.frames.find((frame) => frame.type === "welcome");
    if (!welcome.reconnected || welcome.connectionEpoch !== oldWelcome.connectionEpoch + 1) {
      throw new Error(`seat ${seat} reconnect epoch/rebase contract failed`);
    }
    const order = ["welcome", "rebase", "publicState", "ownerState"].map((type) => next.frames.findIndex((frame) => frame.type === type));
    if (!order.every((value, index) => value >= 0 && (!index || value > order[index - 1]))) throw new Error("reconnect baseline order failed");
    files["membership-ledger"]({ type: "reconnect", seat, incarnation: incarnations[seat],
      oldEpoch: oldWelcome.connectionEpoch, newEpoch: welcome.connectionEpoch, ordinal: ordinals[seat].at(-1),
      elapsedMs: Math.round(performance.now() - monotonicStarted) });
  };
  const replace = async (seat, started) => {
    const oldAuthority = authorities[seat];
    const left = await request(port, "/leave", { method: "POST", authority: oldAuthority, accounting,
      body: command(oldAuthority, ++commandSeq[seat], { playerId: oldAuthority.playerId }) });
    if (left.status !== 200) throw new Error(`leave failed for seat ${seat}`);
    await closeRawClient(clients[seat]);
    files["membership-ledger"]({ type: "leave", seat, incarnation: incarnations[seat],
      membershipHash: digest(salt, oldAuthority.membershipId), elapsedMs: Math.round(performance.now() - monotonicStarted) });
    await admit(seat, started, true);
    if (authorities[seat].membershipId === oldAuthority.membershipId) throw new Error("replacement reused membership lineage");
  };
  const sendInput = (event) => {
    const client = clients[event.seat];
    if (!client || client.ws.readyState !== client.ws.OPEN) return;
    client.ws.send(JSON.stringify({ type: "input", inputSeq: ++inputSeq[event.seat],
      moveX: event.moveX, moveY: event.moveY, thrust: 1, brake: 0, slingshot: false,
      ability1: false, ability2: false, clientTimeMs: Date.now() }));
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
    client.ws.send(JSON.stringify({ type: "action", actionId, actionSeq: event.round + 1,
      commandSeq: ++commandSeq[event.seat], actionKind, payload, clientTimeMs: Date.now() }));
    const ack = await waitFor(() => client.frames.slice(before).find((frame) => frame.type === "ack"
      && frame.ackKind === "action" && frame.actionId === actionId), `action ack ${actionId}`, 5000);
    client.ws.send(JSON.stringify({ type: "ack", ackKind: "delivery", deliveryId: ack.deliveryId }));
    const outcome = { round: event.round, seat: event.seat, actionKind, status: ack.status,
      semanticHash: digest(salt, actionId), deliveryHash: digest(salt, `${event.seat}:${ack.deliveryId}`),
      receiptHash: digest(salt, JSON.stringify({ status: ack.status, result: ack.result })), deliveryAckSent: true,
      elapsedMs: Math.round(performance.now() - monotonicStarted) };
    if (actionOutcomes.has(actionId)) throw new Error(`duplicate action outcome ${actionId}`);
    actionOutcomes.set(actionId, outcome);
    files["reliable-ledger"](outcome);
  };
  const finalCleanup = async () => {
    if (stopped) return null;
    stopped = true;
    if (checkpointTimer) clearInterval(checkpointTimer);
    for (let seat = 0; seat < authorities.length; seat += 1) {
      const authority = authorities[seat];
      if (!authority) continue;
      await request(port, "/leave", { method: "POST", authority, accounting,
        body: command(authority, ++commandSeq[seat], { playerId: authority.playerId }) }).catch(() => null);
    }
    await Promise.all(clients.map((client) => closeRawClient(client).catch(() => null)));
    await waitFor(async () => {
      const health = await request(port, "/health", { accounting });
      return health.body.multiplayer?.adapter?.connections === 0
        && health.body.multiplayer?.tickets?.retained === 0 ? true : false;
    }, "soak cleanup drain", 5000).catch(() => null);
    const pre = await getHealth(Math.round(performance.now() - monotonicStarted)).catch(() => null);
    await stopSimServer(port).catch((error) => { failure ||= `authority stop failed: ${error.message}`; });
    const dead = await portIsDead(port);
    const preAdapter = pre?.safe?.adapter;
    const preTickets = pre?.safe?.tickets;
    const drained = Boolean(preAdapter && preAdapter.connections === 0 && preAdapter.bound === 0
      && preAdapter.closing === 0 && preAdapter.queuedBytes === 0 && preAdapter.queuedMessages === 0
      && preAdapter.pendingScheduledSends === 0 && preTickets?.retained === 0 && preTickets?.pending === 0);
    return { preShutdown: pre?.safe || null, portReusable: dead,
      clientsClosed: clients.every((client) => !client || client.close || client.ws.readyState === client.ws.CLOSED),
      samplerStopped: checkpointTimer !== null, drained, passed: dead && drained };
  };
  let started;
  let cleanup;
  try {
    const pressurePreload = path.resolve(__dirname, "soak-pressure-preload.cjs");
    await startSimServer(port, { keepAlive: true, env: { LBH_SIM_WS_ENABLED: "true",
      LBH_SOAK_DIAGNOSTICS: "1",
      ...(timeScale === 1 ? {} : { LBH_SIM_WS_TEST_TICKET_TTL_MS: "300" }),
      NODE_OPTIONS: `${process.env.NODE_OPTIONS || ""} --require=${pressurePreload}`.trim() } });
    const start = await request(port, "/session/start", { method: "POST", accounting, body: {
      mapId: "shallows", requesterId: "soak-seat-0", requesterName: "Soak Seat 0", maxPlayers: 8 } });
    if (start.status !== 200) throw new Error(`session start failed: ${JSON.stringify(start.body)}`);
    started = start.body;
    authorityRunHash = digest(salt, started.session.runId);
    for (let seat = 0; seat < 8; seat += 1) await admit(seat, started);
    const admitted = await getHealth(0);
    authorityPid = admitted.safe.pid;
    if (!Number.isSafeInteger(authorityPid) || new Set(ordinals.flat()).size !== 8) throw new Error("initial admission topology failed");
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
        files["runtime-windows"]({ elapsedMs: event.atMs, type: "forced-gc-checkpoint",
          invoked: false, reason: "authority global.gc is not exposed in PR smoke; long-window GC gate is not applicable",
          excludedPerformanceMinutes: schedule.excludedPerformanceMinutes });
        lastBarrier = "forced-gc-checkpoint-recorded";
      } else if (event.kind === "final-drain") lastBarrier = "final-drain";
    }
    await sleep(1000);
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
    if (eventAckLedger.withheld !== 0 || eventAckLedger.decisions !== eventAckLedger.deliveryAcks
      || eventAckLedger.decisions !== eventAckLedger.eventAcks) {
      throw new Error(`event dual-ACK ledger mismatch: ${JSON.stringify(eventAckLedger)}`);
    }
    if (final.safe.pid !== authorityPid || final.safe.overloadState !== "NORMAL") throw new Error("authority identity/mode changed");
    if ((final.safe.adapter.highWaterCrossings || 0) !== 0 || (final.safe.adapter.queuePolicyEvents || 0) !== 0
      || (final.safe.adapter.observerFailures || 0) !== 0) throw new Error("unexpected pressure/observer event");
  } catch (error) {
    failure = error.stack || error.message;
  } finally {
    cleanup = await finalCleanup();
  }
  const gates = {
    deterministicSchedule: { status: "PASS", numerator: schedule.scheduleHash, denominator: 1, threshold: "exact fixture hash", source: "schedule.json" },
    topology: { status: incarnations.filter(Boolean).length === 8 && incarnations[5] === 2 ? "PASS" : "FAIL",
      numerator: { initialAdmissions: 8, replacementAdmissions: Math.max(0, incarnations[5] - 1), authoritiesPerMatch: 1 },
      denominator: { seats: 8 }, threshold: "8 initial + 1 replacement, one logical authority", source: "membership-ledger.jsonl" },
    reliability: { status: actionOutcomes.size === 16 ? "PASS" : "FAIL", numerator: actionOutcomes.size,
      denominator: 16, threshold: "exact 16 stable action outcomes and delivery ACKs", source: "reliable-ledger.jsonl" },
    eventAckLedger: { status: eventAckLedger.withheld === 0 && eventAckLedger.decisions === eventAckLedger.deliveryAcks
      && eventAckLedger.decisions === eventAckLedger.eventAcks ? "PASS" : "FAIL", numerator: eventAckLedger,
      denominator: eventAckLedger.decisions, threshold: "default-immediate exact dual ACK", source: "client-ledger.jsonl" },
    heapSlope: { status: "NOT_APPLICABLE_SHORT_RUN", numerator: 0, denominator: 0, threshold: "canonical only", source: "profile" },
    rssSlope: { status: "NOT_APPLICABLE_SHORT_RUN", numerator: 0, denominator: 0, threshold: "diagnostic only", source: "profile" },
    gcDuty: { status: "NOT_APPLICABLE_SHORT_RUN", numerator: 0, denominator: 0, threshold: "canonical only", source: "profile" },
    longWindowRecovery: { status: "NOT_APPLICABLE_SHORT_RUN", numerator: 0, denominator: 0, threshold: "canonical only", source: "profile" },
    cleanup: { status: cleanup?.passed ? "PASS" : "FAIL", numerator: cleanup, denominator: 1,
      threshold: "owned process gone and port reusable", source: "cleanup.json" },
  };
  const passed = !failure && timeScale === 1 && Object.values(gates).every((gate) => gate.status !== "FAIL");
  return { passed, failure: failure || (timeScale !== 1 ? "accelerated diagnostic cannot pass" : null),
    authorityPid, authorityRunHash, actionCount: actionOutcomes.size, incarnations, ordinals,
    httpAccounting: accounting, gates, cleanup, commit, dirty, timeScale };
}

module.exports = { runEightPlayerSoak, writeExclusive };
