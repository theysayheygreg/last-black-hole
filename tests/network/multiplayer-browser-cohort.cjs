"use strict";

const crypto = require("crypto");
const fs = require("fs");
const net = require("net");
const path = require("path");
const { spawn } = require("child_process");
const { launchBrowser, findChrome } = require("../browser-driver.cjs");
const {
  startSimServer,
  stopSimServer,
  dispatchKey,
  waitFor,
  assert,
  simLogFile,
} = require("../helpers.cjs");
const {
  browserInitSource,
  installMainResponseRewrite,
  sha256,
} = require("./browser-frame-impairment.cjs");
const { createCdpBrowserTransport } = require("./cdp-browser-transport.cjs");

const ROOT = path.resolve(__dirname, "../..");
const TMP = path.join(ROOT, "tmp");
const STATIC_SCRIPT = path.join(ROOT, "scripts/static-server.cjs");
const PRIVATE_KEYS = [
  "profileId", "rigLevels", "abilityState", "deltaV", "deltaVMax", "deltaVRatio",
  "lastInputSeq", "lastInputBrake", "pendingSlingshotEdgeCount", "cargo", "cargoCount",
  "equipped", "consumables", "activeEffects", "effectState", "portalInteraction", "signal",
  "controlDebuff", "runResult", "recentRuns", "commandCredential", "energy", "chainCount", "engageRadius",
];

function sleep(ms, signal) {
  if (signal?.aborted) return Promise.reject(signal.reason || new Error("aborted"));
  return new Promise((resolve, reject) => {
    const finish = () => {
      signal?.removeEventListener("abort", onAbort);
      resolve();
    };
    const timer = setTimeout(finish, ms);
    const onAbort = () => {
      clearTimeout(timer);
      signal?.removeEventListener("abort", onAbort);
      reject(signal.reason || new Error("aborted"));
    };
    signal?.addEventListener("abort", onAbort, { once: true });
  });
}

function appendJsonl(file, value) { fs.appendFileSync(file, `${JSON.stringify(value)}\n`); }
function hashId(value) { return value == null ? null : sha256(String(value)); }
function pidAlive(pid) { try { process.kill(pid, 0); return true; } catch { return false; } }

function copyRedactedSimLog(source, destination) {
  const identityKeys = new Set(["sessionId", "runId", "clientId", "profileId", "membershipId", "playerId",
    "connectionId", "commandCredential", "admissionTicket", "resumeTicket", "name"]);
  const lines = fs.readFileSync(source, "utf8").split("\n");
  const redacted = lines.map((line) => {
    if (!line.trim()) return "";
    try {
      const record = JSON.parse(line);
      for (const key of Object.keys(record)) {
        if (!identityKeys.has(key)) continue;
        record[`${key}Hash`] = hashId(record[key]);
        delete record[key];
      }
      return JSON.stringify(record);
    } catch {
      return line.replace(/[0-9a-f]{8}-[0-9a-f-]{27,}/gi, "[redacted-id]");
    }
  });
  fs.writeFileSync(destination, redacted.join("\n"), { flag: "wx" });
}

async function reserveDistinctPorts(count) {
  const servers = [];
  try {
    for (let index = 0; index < count; index += 1) {
      const server = net.createServer();
      await new Promise((resolve, reject) => server.once("error", reject).listen(0, "127.0.0.1", resolve));
      servers.push(server);
    }
    const ports = servers.map((server) => server.address().port);
    if (new Set(ports).size !== count) throw new Error("ephemeral port reservation returned a collision");
    return ports;
  } finally {
    await Promise.all(servers.map((server) => new Promise((resolve) => server.close(resolve))));
  }
}

async function portClosed(port) {
  return new Promise((resolve) => {
    const socket = net.connect({ host: "127.0.0.1", port });
    socket.once("connect", () => { socket.destroy(); resolve(false); });
    socket.once("error", () => resolve(true));
    socket.setTimeout(300, () => { socket.destroy(); resolve(true); });
  });
}

function acquireLock() {
  fs.mkdirSync(TMP, { recursive: true });
  const file = path.join(TMP, "multiplayer-impairment-browser.lock");
  try {
    const prior = Number(fs.readFileSync(file, "utf8"));
    if (!pidAlive(prior)) fs.rmSync(file, { force: true });
  } catch {}
  const fd = fs.openSync(file, "wx");
  fs.writeFileSync(fd, `${process.pid}\n`);
  return () => { try { fs.closeSync(fd); } catch {} try { fs.rmSync(file, { force: true }); } catch {} };
}

async function startStaticServer(port, runDir) {
  const pidFile = path.join(runDir, "static.pid");
  const metaFile = path.join(runDir, "static-meta.json");
  const stdout = fs.openSync(path.join(runDir, "static.stdout.log"), "a");
  const stderr = fs.openSync(path.join(runDir, "static.stderr.log"), "a");
  const proc = spawn(process.execPath, [STATIC_SCRIPT, "--host", "127.0.0.1", "--port", String(port),
    "--root", ROOT, "--pid-file", pidFile, "--meta-file", metaFile, "--label", "lbh-impairment"], {
    cwd: ROOT, stdio: ["ignore", stdout, stderr], detached: true,
  });
  try {
    const deadline = Date.now() + 7000;
    while (Date.now() < deadline) {
      try { const response = await fetch(`http://127.0.0.1:${port}/index-a.html`); if (response.ok) break; } catch {}
      await sleep(50);
    }
    if (!(await fetch(`http://127.0.0.1:${port}/index-a.html`).catch(() => null))?.ok) {
      throw new Error("isolated static server failed to start");
    }
  } catch (error) {
    try { process.kill(-proc.pid, "SIGKILL"); } catch { try { proc.kill("SIGKILL"); } catch {} }
    try { fs.closeSync(stdout); } catch {}
    try { fs.closeSync(stderr); } catch {}
    throw error;
  }
  return { proc, pid: proc.pid, pidFile, metaFile, stdout, stderr };
}

async function stopChild(child) {
  if (!child?.proc || !pidAlive(child.pid)) return;
  try { process.kill(-child.pid, "SIGTERM"); } catch { try { child.proc.kill("SIGTERM"); } catch {} }
  const deadline = Date.now() + 2500;
  while (pidAlive(child.pid) && Date.now() < deadline) await sleep(50).catch(() => null);
  if (pidAlive(child.pid)) {
    try { process.kill(-child.pid, "SIGKILL"); } catch { try { child.proc.kill("SIGKILL"); } catch {} }
  }
}

async function tap(page, code, key = code, holdMs = 60) {
  await dispatchKey(page, code, key, holdMs);
  await sleep(100);
}

async function phase(page) { return page.evaluate(() => window.__TEST_API?.getGamePhase?.() || null); }
async function tapUntil(page, code, key, expected, timeout = 20000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    if (await phase(page) === expected) return;
    await tap(page, code, key);
  }
  throw new Error(`Timed out driving ${code} to ${expected}; current=${await phase(page)}`);
}

async function journeyState(pilot) {
  return pilot.page.evaluate(() => window.__TEST_API?.getMultiplayerJourneyState?.() || null);
}

function sanitizeFrameEvidence(entry) {
  const copy = { ...entry };
  if (copy.actionId) { copy.actionIdHash = hashId(copy.actionId); delete copy.actionId; }
  if (copy.eventPlayerId) { copy.eventPlayerHash = hashId(copy.eventPlayerId); delete copy.eventPlayerId; }
  return copy;
}

async function launchPilot({ index, staticPort, simPort, fixture, compiled, htmlTarget }) {
  const browser = await launchBrowser({ viewport: { width: 1280, height: 800, deviceScaleFactor: 1 } });
  const page = await browser.newPage({ width: 1280, height: 800, deviceScaleFactor: 1 });
  const pilot = { index, slot: `pilot-${index}`, browser, page, pageErrors: [], consoleErrors: [],
    consoleErrorEvents: [],
    rewriteErrors: [], networkFailures: [], privacyFrames: [], hotHttp: [], cdp: {
      inboundBytes: 0, outboundBytes: 0, inboundFrames: 0, outboundFrames: 0, lifecycle: [],
    },
    evidence: [], consumedEvents: [], rotateSchedulerOnNextSocket: false, reconnectRotationPromise: null };
  try {
  page.on("pageerror", (error) => pilot.pageErrors.push(error.message));
  page.on("console", (message) => {
    if (message.type() !== "error") return;
    pilot.consoleErrors.push(message.text());
    pilot.consoleErrorEvents.push({ message: message.text(), atWallMs: Date.now() });
  });
  await page.session.send("Page.addScriptToEvaluateOnNewDocument", {
    source: browserInitSource({ pilotSlot: pilot.slot, decisionBook: compiled.book }),
  });
  pilot.rewriter = await installMainResponseRewrite(page, fixture, (error) => pilot.rewriteErrors.push(error.message));
  await page.session.send("Network.enable");
  const pushLifecycle = (entry) => {
    if (pilot.cdp.lifecycle.length >= 256) {
      pilot.pageErrors.push("bounded CDP WebSocket lifecycle evidence exceeded");
      return;
    }
    pilot.cdp.lifecycle.push(entry);
  };
  page.session.on("Network.webSocketCreated", ({ requestId }) => {
    pushLifecycle({ event: "created", atWallMs: Date.now(), requestIdHash: hashId(requestId) });
    if (pilot.rotateSchedulerOnNextSocket) {
      pilot.rotateSchedulerOnNextSocket = false;
      pilot.reconnectRotationPromise = pilot.page.evaluate(() =>
        window.__LBH_FRAME_IMPAIRMENT__.rotateEpoch()).catch((error) => {
        pilot.pageErrors.push(`T0 reconnect scheduler rotation failed: ${error.message}`);
        throw error;
      });
    }
  });
  page.session.on("Network.webSocketClosed", ({ requestId, timestamp }) => {
    pushLifecycle({ event: "closed", atWallMs: Date.now(), timestamp, requestIdHash: hashId(requestId) });
  });
  page.session.on("Network.webSocketWillSendHandshakeRequest", ({ requestId, timestamp }) => {
    pushLifecycle({ event: "handshake-request", atWallMs: Date.now(), timestamp, requestIdHash: hashId(requestId) });
  });
  page.session.on("Network.webSocketHandshakeResponseReceived", ({ requestId, timestamp, response }) => {
    pushLifecycle({ event: "handshake-response", atWallMs: Date.now(), timestamp,
      requestIdHash: hashId(requestId), status: response?.status ?? null });
  });
  page.session.on("Network.webSocketFrameError", ({ requestId, timestamp }) => {
    pushLifecycle({ event: "frame-error", atWallMs: Date.now(), timestamp, requestIdHash: hashId(requestId) });
  });
  page.session.on("Network.responseReceived", ({ response }) => {
    if (Number(response?.status) >= 400) pilot.networkFailures.push({ status: response.status, url: response.url });
  });
  page.session.on("Network.webSocketFrameReceived", ({ response, timestamp }) => {
    const wire = response?.payloadData || "";
    pilot.cdp.inboundFrames += 1;
    pilot.cdp.inboundBytes += Buffer.byteLength(wire);
    try {
      const frame = JSON.parse(wire);
      if (["welcome", "publicState", "ownerState", "rebase", "ack", "event", "error", "close"].includes(frame.type)) {
        if (pilot.privacyFrames.length >= 10000) throw new Error("bounded privacy-frame evidence exceeded");
        const serialized = frame.type === "publicState" ? JSON.stringify(frame.state) : "";
        pilot.privacyFrames.push({ direction: "inbound", timestamp, type: frame.type,
          playerId: frame.type === "ownerState" ? frame.playerId : undefined,
          membershipId: frame.type === "ownerState" ? frame.membershipId : undefined,
          connectionEpoch: frame.type === "welcome" ? frame.connectionEpoch : undefined,
          reconnected: frame.type === "welcome" ? frame.reconnected : undefined,
          snapshotId: Number.isSafeInteger(frame.snapshotId) ? frame.snapshotId : undefined,
          code: frame.type === "error" || frame.type === "close" ? frame.code : undefined,
          fatal: frame.type === "error" ? frame.fatal : undefined,
          retryable: frame.type === "error" ? frame.retryable : undefined,
          reconnectable: frame.type === "close" ? frame.reconnectable : undefined,
          ackKind: frame.type === "ack" ? frame.ackKind : undefined,
          eventType: frame.type === "event" ? frame.eventType : undefined,
          privateLeaks: frame.type === "publicState"
            ? PRIVATE_KEYS.filter((key) => serialized.includes(`"${key}"`)) : [] });
      }
    } catch (error) { pilot.pageErrors.push(error.message); }
  });
  page.session.on("Network.webSocketFrameSent", ({ response, timestamp }) => {
    const wire = response?.payloadData || "";
    pilot.cdp.outboundFrames += 1;
    pilot.cdp.outboundBytes += Buffer.byteLength(wire);
    try {
      const frame = JSON.parse(wire);
      if (frame.type === "ack") {
        if (pilot.privacyFrames.length >= 10000) throw new Error("bounded privacy-frame evidence exceeded");
        pilot.privacyFrames.push({ direction: "outbound", timestamp, type: frame.type, ackKind: frame.ackKind,
          snapshotId: Number.isSafeInteger(frame.snapshotId) ? frame.snapshotId : undefined,
          inputSeq: Number.isSafeInteger(frame.inputSeq) ? frame.inputSeq : undefined,
          privateLeaks: [] });
      }
    } catch (error) { pilot.pageErrors.push(error.message); }
  });
  page.session.on("Network.requestWillBeSent", ({ request }) => {
    try {
      const pathname = new URL(request.url).pathname;
      if (["/input", "/snapshot", "/events", "/inventory/action"].includes(pathname)) {
        pilot.hotHttp.push({ method: request.method, pathname });
      }
    } catch {}
  });
  const query = new URLSearchParams({ renderer: "three", simServer: `http://127.0.0.1:${simPort}`,
    simTransport: "stream", simMaxPlayers: "4", capture: "1", deck: "1" });
  await page.goto(`http://127.0.0.1:${staticPort}/${htmlTarget}?${query}`, { timeout: 15000 });
  await sleep(1800);
  pilot.rewriter.assertRewritten();
  await waitFor(page, () => window.__TEST_API?.getGamePhase?.() === "title", { timeout: 15000 });
  await tapUntil(page, "Space", " ", "profileSelect");
  await tapUntil(page, "Enter", "Enter", "home");
  await page.evaluate(() => window.__TEST_API.setHomeTabForTest(4));
  await tapUntil(page, "Enter", "Enter", "mapSelect");
  await tapUntil(page, "Enter", "Enter", "playing", 25000);
  await waitFor(page, () => {
    const state = window.__TEST_API?.getMultiplayerJourneyState?.();
    return state?.transport?.activeTransport === "stream" && state.transport.streamState === "open"
      && Number.isSafeInteger(state.snapshotId);
  }, { timeout: 25000 });
  return pilot;
  } catch (error) {
    await pilot.rewriter?.close().catch(() => null);
    await browser.close().catch(() => null);
    if (pidAlive(browser.proc?.pid)) {
      try { process.kill(browser.proc.pid, "SIGKILL"); } catch {}
    }
    throw error;
  }
}

function scanPrivacy(pilot, own) {
  let publicFrames = 0;
  let ownerFrames = 0;
  for (const frame of pilot.privacyFrames.filter((entry) => entry.direction === "inbound")) {
    if (frame.type === "publicState") {
      publicFrames += 1;
      assert(frame.privateLeaks.length === 0, `${pilot.slot} public frame leaked ${frame.privateLeaks.join(",")}`);
    }
    if (frame.type === "ownerState") {
      ownerFrames += 1;
      assert(frame.playerId === own.ownerPlayerId && frame.membershipId === own.membershipId,
        `${pilot.slot} received a rival owner frame`);
    }
  }
  assert(publicFrames > 0 && ownerFrames > 0, `${pilot.slot} privacy scan had no public/owner frames`);
  return { publicFrames, ownerFrames };
}

function percentile(values, probability) {
  const sorted = values.filter(Number.isFinite).sort((a, b) => a - b);
  if (sorted.length === 0) return null;
  return sorted[Math.min(sorted.length - 1, Math.ceil(probability * sorted.length) - 1)];
}

function isExpectedF3InputTimeout(scenarioId, pilot, error) {
  return scenarioId === "F3-frame-defense" && pilot.slot === "pilot-3"
    && /^\[LBH\] remote input failed: Error: Timed out waiting for input ACK\n/.test(String(error));
}

function isExpectedF6CloseInputError(scenarioId, pilot, errorEvent, f6CloseSchedule) {
  if (scenarioId !== "F6-all-flap"
    || !/^\[LBH\] remote input failed: Error: Sim stream is not connected\n/.test(String(errorEvent?.message))) return false;
  const pilotIndex = Number(pilot.slot.split("-").at(-1));
  const invocation = f6CloseSchedule?.invocations?.[pilotIndex];
  const outcome = f6CloseSchedule?.outcomes?.[pilotIndex];
  if (!invocation || !outcome) return false;
  return errorEvent.atWallMs >= invocation.actualWallMs - 100
    && errorEvent.atWallMs <= outcome.observedWallMs + 100;
}

function isExpectedT0OfflineInputError(scenarioId, pilot, errorEvent) {
  return scenarioId === "T0-cdp-smoke" && pilot.slot === "pilot-3"
    && Number.isSafeInteger(errorEvent?.t0MatchedInputSeq);
}

function bindT0InputTimeoutCausality(pilot, scenario, transportResult) {
  const contract = scenario.transport.offlineWindow;
  const command = transportResult.commands.offline.shaping;
  const startMonoMs = command.pageMonoBefore;
  const settleMonoMs = startMonoMs + (transportResult.settled.observedWallMs - command.requestedWallMs);
  const sends = pilot.evidence.filter((entry) => entry.direction === "client-to-authority"
    && entry.frameClass === "input" && entry.event === "copy-delivered" && entry.delivered === true
    && Number.isSafeInteger(entry.inputSeq) && Number.isFinite(entry.actualMonoMs));
  const acks = pilot.evidence.filter((entry) => entry.direction === "authority-to-client"
    && entry.frameClass === "ack" && entry.ackKind === "input" && entry.event === "application-delivered"
    && Number.isSafeInteger(entry.inputSeq) && Number.isFinite(entry.actualMonoMs));
  const candidates = [];
  for (const send of sends) {
    const ack = acks.find((entry) => entry.inputSeq >= send.inputSeq && entry.actualMonoMs >= send.actualMonoMs);
    const terminalMonoMs = ack?.actualMonoMs ?? settleMonoMs;
    const latencyMs = ack ? ack.actualMonoMs - send.actualMonoMs : null;
    if (send.actualMonoMs > settleMonoMs || terminalMonoMs < startMonoMs) continue;
    if (ack && latencyMs < contract.inputAckTimeoutMs) continue;
    candidates.push({ inputSeq: send.inputSeq, sendMonoMs: send.actualMonoMs,
      ackMonoMs: ack?.actualMonoMs ?? null, coveringAckSeq: ack?.inputSeq ?? null, latencyMs,
      expectedWallMs: command.requestedWallMs + (send.actualMonoMs - command.pageMonoBefore)
        + contract.inputAckTimeoutMs });
  }
  const timeoutEvents = pilot.consoleErrorEvents.filter((entry) =>
    /^\[LBH\] remote input failed: Error: Timed out waiting for input ACK\n/.test(String(entry.message)));
  const unmatched = new Set(candidates.map((_, index) => index));
  const matches = [];
  for (const errorEvent of timeoutEvents) {
    let bestIndex = -1;
    let bestDelta = Number.POSITIVE_INFINITY;
    for (const index of unmatched) {
      const delta = Math.abs(errorEvent.atWallMs - candidates[index].expectedWallMs);
      if (delta < bestDelta) { bestIndex = index; bestDelta = delta; }
    }
    if (bestIndex < 0 || bestDelta > contract.timeoutMatchToleranceMs) continue;
    unmatched.delete(bestIndex);
    errorEvent.t0MatchedInputSeq = candidates[bestIndex].inputSeq;
    matches.push({ errorAtWallMs: errorEvent.atWallMs, deltaMs: bestDelta, ...candidates[bestIndex] });
  }
  return { inputAckTimeoutMs: contract.inputAckTimeoutMs,
    matchToleranceMs: contract.timeoutMatchToleranceMs, startMonoMs, settleMonoMs,
    candidates, matches, unmatchedCandidateInputSeqs: [...unmatched].map((index) => candidates[index].inputSeq),
    unmatchedErrorWallMs: timeoutEvents
      .filter((entry) => !Number.isSafeInteger(entry.t0MatchedInputSeq)).map((entry) => entry.atWallMs) };
}

function faultDecisionProfile(scenario, pilots, serverRecords) {
  const allRecords = [
    ...pilots.flatMap((pilot) => pilot.evidence.filter((entry) => entry.direction === "client-to-authority")),
    ...serverRecords.filter((entry) => entry.direction === "authority-to-client"),
  ];
  const keyFor = (entry) => [entry.pilotSlot, entry.phase, entry.direction, entry.connectionEpochOrdinal,
    entry.decisionClass || entry.frameClass, entry.streamOrdinal].join("|");
  for (const phase of ["warmup", "recovery"]) {
    const decisions = allRecords.filter((entry) => entry.phase === phase
      && (entry.event === "queued" || entry.event === "omitted"));
    assert(decisions.length > 0, `F3 produced no ${phase} decisions`);
    assert(decisions.every((entry) => entry.decision?.delayMs === 0 && entry.decision.copies === 1
      && entry.decision.omitted === false && Number(entry.decision.reorderWindow || 0) === 0),
    `F3 ${phase} was not a clean bypass phase`);
  }
  const active = allRecords.filter((entry) => entry.phase === "active");
  const decisionRecords = active.filter((entry) => entry.event === "queued" || entry.event === "omitted");
  for (const entry of decisionRecords) {
    const rule = scenario.rules.faults?.[entry.pilotSlot]?.[entry.direction]
      ?.[entry.decisionClass || entry.frameClass] || {};
    if (entry.pilotSlot !== "pilot-3" || Object.keys(rule).length === 0) {
      assert(entry.decision.copies === 1 && !entry.decision.omitted
        && Number(entry.decision.reorderWindow || 0) === 0,
      `F3 contaminated ${entry.pilotSlot} ${entry.direction} ${entry.decisionClass || entry.frameClass}`);
    }
  }
  const faultClasses = {};
  for (const [pilotSlot, directions] of Object.entries(scenario.rules.faults)) {
    for (const [direction, classes] of Object.entries(directions)) {
      for (const [decisionClass, rule] of Object.entries(classes)) {
        const records = active.filter((entry) => entry.pilotSlot === pilotSlot && entry.direction === direction
          && (entry.decisionClass || entry.frameClass) === decisionClass);
        const decisions = records.filter((entry) => entry.event === "queued" || entry.event === "omitted");
        const queued = records.filter((entry) => entry.event === "queued");
        const omitted = records.filter((entry) => entry.event === "omitted");
        const released = records.filter((entry) => entry.event === "released");
        const cancelled = records.filter((entry) => entry.event === "cancelled");
        const copies = records.filter((entry) => entry.event === "copy-delivered");
        assert(decisions.length > 0, `${pilotSlot} ${direction} ${decisionClass} lacked stimulus`);
        const queuedKeys = new Set(queued.map(keyFor));
        const releasedKeys = new Set(released.map(keyFor));
        const cancelledKeys = new Set(cancelled.map(keyFor));
        const terminalKeys = new Set([...releasedKeys, ...cancelledKeys]);
        assert(queuedKeys.size === queued.length && releasedKeys.size === released.length
          && cancelledKeys.size === cancelled.length && queuedKeys.size === terminalKeys.size
          && [...queuedKeys].every((key) => terminalKeys.has(key))
          && ![...releasedKeys].some((key) => cancelledKeys.has(key)),
        `${decisionClass} queued/terminal decision sets differ`);
        for (const entry of queued) {
          const expectedCopies = entry.decision.copies;
          const actualCopies = copies.filter((copy) => keyFor(copy) === keyFor(entry)).length;
          assert((cancelledKeys.has(keyFor(entry)) && actualCopies === 0)
            || (releasedKeys.has(keyFor(entry)) && actualCopies === expectedCopies),
            `${decisionClass} physical copy count changed`);
        }
        if (rule.omitRate) assert(omitted.length > 0, `${decisionClass} omission was not stimulated`);
        const duplicated = queued.filter((entry) => entry.decision.copies === 2
          && releasedKeys.has(keyFor(entry)));
        if (rule.duplicateRate) assert(duplicated.length > 0, `${decisionClass} duplication was not stimulated`);
        let reorderedBlocks = 0;
        let maxDisplacement = 0;
        if (rule.reorderWindow) {
          const blocks = new Map();
          for (const entry of released) {
            const block = entry.decision.reorderBlock;
            const values = blocks.get(block) || [];
            values.push(entry);
            blocks.set(block, values);
            assert(entry.decision.reorderWindow === rule.reorderWindow,
              `${decisionClass} changed reorder window`);
          }
          for (const values of blocks.values()) {
            if (values.length < 2) continue;
            const original = [...values].sort((a, b) => a.streamOrdinal - b.streamOrdinal);
            if (values.some((entry, index) => entry.streamOrdinal !== original[index].streamOrdinal)) reorderedBlocks += 1;
            for (let index = 0; index < values.length; index += 1) {
              maxDisplacement = Math.max(maxDisplacement,
                Math.abs(index - original.findIndex((entry) => entry.streamOrdinal === values[index].streamOrdinal)));
            }
          }
          assert(maxDisplacement <= rule.reorderWindow, `${decisionClass} exceeded bounded reorder`);
          assert(copies.every((entry) => entry.blockHoldMs <= rule.maxBlockHoldMs + 25),
            `${decisionClass} exceeded max block hold`);
        }
        faultClasses[`${pilotSlot}/${direction}/${decisionClass}`] = {
          decisions: decisions.length, queued: queued.length, omitted: omitted.length, cancelled: cancelled.length,
          duplicated: duplicated.length, physicalCopies: copies.length, reorderedBlocks, maxDisplacement,
        };
      }
    }
  }
  const reorderGroups = {};
  const grouped = new Map();
  for (const entry of active.filter((record) => record.event === "released" && record.decision?.reorderGroup)) {
    const key = [entry.pilotSlot, entry.direction, entry.decision.reorderGroup, entry.decision.reorderBlock].join("|");
    const values = grouped.get(key) || [];
    values.push(entry);
    grouped.set(key, values);
  }
  for (const [blockKey, values] of grouped) {
    const groupKey = blockKey.split("|").slice(0, 3).join("/");
    const stats = reorderGroups[groupKey] || { blocks: 0, reorderedBlocks: 0, maxDisplacement: 0 };
    stats.blocks += 1;
    const original = [...values].sort((a, b) => a.decision.reorderOrdinal - b.decision.reorderOrdinal);
    if (values.some((entry, index) => entry.decision.reorderOrdinal !== original[index].decision.reorderOrdinal)) {
      stats.reorderedBlocks += 1;
    }
    for (let index = 0; index < values.length; index += 1) {
      stats.maxDisplacement = Math.max(stats.maxDisplacement,
        Math.abs(index - original.findIndex((entry) =>
          entry.decision.reorderOrdinal === values[index].decision.reorderOrdinal)));
    }
    reorderGroups[groupKey] = stats;
  }
  for (const [group, stats] of Object.entries(reorderGroups)) {
    assert(stats.reorderedBlocks > 0 && stats.maxDisplacement <= 3,
      `${group} did not prove a bounded shared reorder window`);
  }
  assert(Object.keys(reorderGroups).length === 2, "F3 did not activate both shared reorder groups");
  const runtimeGroupTape = decisionRecords.filter((entry) => entry.decision?.reorderGroup).map((entry) => ({
    pilotSlot: entry.pilotSlot, direction: entry.direction,
    decisionClass: entry.decisionClass || entry.frameClass, streamOrdinal: entry.streamOrdinal,
    group: entry.decision.reorderGroup, groupOrdinal: entry.decision.reorderOrdinal,
    reorderBlock: entry.decision.reorderBlock, reorderOffset: entry.decision.reorderOffset,
    copies: entry.decision.copies, omitted: entry.decision.omitted,
  }));
  for (const group of new Set(runtimeGroupTape.map((entry) =>
    `${entry.pilotSlot}|${entry.direction}|${entry.group}`))) {
    const ordinals = runtimeGroupTape.filter((entry) =>
      `${entry.pilotSlot}|${entry.direction}|${entry.group}` === group).map((entry) => entry.groupOrdinal);
    assert(ordinals.every((ordinal, index) => ordinal === index), `${group} runtime group tape diverged`);
  }
  return { faultClasses, reorderGroups,
    runtimeGroupTape: { decisions: runtimeGroupTape.length, sha256: sha256(JSON.stringify(runtimeGroupTape)) } };
}

function decisionProfile(scenario, pilots, serverEvidenceFile, transportResult = null) {
  const serverRecords = fs.readFileSync(serverEvidenceFile, "utf8").split("\n").filter(Boolean)
    .map((line) => JSON.parse(line));
  if (scenario.rules.faults) return faultDecisionProfile(scenario, pilots, serverRecords);
  const allUpstream = pilots.flatMap((pilot) => pilot.evidence.filter((entry) =>
    entry.direction === "client-to-authority"));
  const allDownstream = serverRecords.filter((entry) => entry.direction === "authority-to-client");
  const serverTimeline = serverRecords.find((entry) => entry.event === "timeline");
  const upstream = allUpstream.filter((entry) => entry.phase === "active");
  const downstream = allDownstream.filter((entry) => entry.phase === "active");
  const configured = (direction) => {
    const rule = scenario.rules.directions?.[direction] || scenario.rules;
    const base = Number(rule.delayMs || 0);
    const jitter = Number(rule.jitterMs || 0);
    return { min: base - jitter, max: base + jitter };
  };
  const validate = (records, direction) => {
    const queued = records.filter((entry) => entry.event === "queued");
    const released = records.filter((entry) => entry.event === "released");
    const range = configured(direction);
    assert(queued.length > 0 && released.length > 0, `${direction} produced no active decisions/releases`);
    assert(!records.some((entry) => entry.event === "omitted"), `${direction} emitted an omission record`);
    const keyFor = (entry) => [entry.pilotSlot, entry.phase, entry.direction, entry.connectionEpochOrdinal,
      entry.decisionClass || entry.frameClass, entry.streamOrdinal].join("|");
    const queuedKeys = queued.map(keyFor);
    const releasedKeys = released.map(keyFor);
    assert(new Set(queuedKeys).size === queuedKeys.length, `${direction} queued duplicate decision keys`);
    assert(new Set(releasedKeys).size === releasedKeys.length, `${direction} released duplicate decision keys`);
    assert(queuedKeys.length === releasedKeys.length
      && queuedKeys.every((key) => releasedKeys.includes(key)),
    `${direction} queued/released decision sets differ: ${queued.length}/${released.length}`);
    for (const entry of queued) {
      assert(entry.decision?.delayMs >= range.min && entry.decision.delayMs <= range.max,
        `${direction} delay ${entry.decision?.delayMs} escaped ${range.min}-${range.max}`);
      assert(entry.decision.copies === 1 && entry.decision.omitted === false,
        `${direction} introduced an F1 omission or duplicate`);
      assert(!Object.prototype.hasOwnProperty.call(entry.decision, "overshootMs"),
        "Timer overshoot entered the deterministic decision tape");
    }
    const transportRejected = [];
    for (const entry of released) {
      assert(Number.isFinite(entry.overshootMs) && entry.overshootMs >= 0,
        `${direction} release omitted timer overshoot evidence`);
      if (entry.delivered !== true && scenario.transport?.kind === "cdp-websocket-smoke"
        && direction === "authority-to-client") {
        const windowStart = serverTimeline?.startMonoMs
          + (transportResult?.steadyStateExclusionWindow?.startWallMs - serverTimeline?.startWallMs);
        const recoveryEndWallMs = transportResult?.settled?.observedWallMs;
        const windowEnd = serverTimeline?.startMonoMs + (recoveryEndWallMs - serverTimeline?.startWallMs)
          + scenario.transport.offlineWindow.guardMs;
        assert(entry.pilotSlot === scenario.transport.offlineWindow.pilotSlot
          && Number.isFinite(windowStart) && entry.actualMonoMs >= windowStart && entry.actualMonoMs <= windowEnd,
        `${direction} release rejection escaped the declared T0 pilot/window`);
        transportRejected.push(entry);
      } else {
        assert(entry.delivered === true, `${direction} release was not delivered exactly once`);
      }
    }
    const transportRejectedReleaseClasses = Object.fromEntries([...new Set(transportRejected.map((entry) =>
      entry.ackKind ? `${entry.frameClass}:${entry.ackKind}` : entry.frameClass))].sort().map((frameClass) => [frameClass,
        transportRejected.filter((entry) => (entry.ackKind ? `${entry.frameClass}:${entry.ackKind}` : entry.frameClass)
          === frameClass).length]));
    if (scenario.transport?.kind === "cdp-websocket-smoke" && direction === "authority-to-client") {
      const budget = scenario.transport.releaseRejectionBudget;
      assert(budget && transportRejected.length <= budget.maximumTotal,
        `${direction} exceeded the T0 release-rejection budget`);
      for (const [frameClass, count] of Object.entries(transportRejectedReleaseClasses)) {
        assert(Number.isSafeInteger(budget.classes?.[frameClass]) && count <= budget.classes[frameClass],
          `${direction} ${frameClass} exceeded or escaped the T0 release-rejection class budget`);
      }
    }
    const releaseGroups = new Map();
    for (const entry of released) {
      const entries = releaseGroups.get(entry.pilotSlot) || [];
      entries.push(entry);
      releaseGroups.set(entry.pilotSlot, entries);
    }
    for (const [pilotSlot, entries] of releaseGroups) {
      for (let index = 1; index < entries.length; index += 1) {
        const prior = entries[index - 1];
        const next = entries[index];
        assert(prior.actualMonoMs <= next.actualMonoMs,
          `${direction} observed release time reversed for ${pilotSlot}`);
      }
    }
    return {
      decisions: queued.length,
      releases: released.length,
      configuredDelayMs: { ...range,
        observedMin: Math.min(...queued.map((entry) => entry.decision.delayMs)),
        observedMax: Math.max(...queued.map((entry) => entry.decision.delayMs)) },
      overshootMs: { p95: percentile(released.map((entry) => entry.overshootMs), 0.95),
        max: Math.max(...released.map((entry) => entry.overshootMs)) },
      transportRejectedReleases: transportRejected.length,
      transportRejectedReleaseClasses,
    };
  };
  const bypass = {};
  for (const phase of ["warmup", "recovery"]) {
    bypass[phase] = {};
    for (const [direction, records] of [["client-to-authority", allUpstream],
      ["authority-to-client", allDownstream]]) {
      const queued = records.filter((entry) => entry.phase === phase && entry.event === "queued");
      assert(queued.length > 0, `${direction} produced no ${phase} decisions`);
      if (scenario.impairPhases && !scenario.impairPhases.includes(phase)) {
        assert(queued.every((entry) => entry.decision?.delayMs === 0),
          `${direction} impaired the ${phase} bypass phase`);
      }
      bypass[phase][direction] = queued.length;
    }
  }
  for (const pilot of pilots) {
    assert(upstream.some((entry) => entry.pilotSlot === pilot.slot && entry.event === "queued"),
      `${pilot.slot} had no active upstream decisions`);
    assert(downstream.some((entry) => entry.pilotSlot === pilot.slot && entry.event === "queued"),
      `${pilot.slot} had no active downstream decisions`);
  }
  assert(!pilots.some((pilot) => pilot.evidence.some((entry) => entry.event === "omitted")),
    "Browser scheduler emitted an omission");
  assert(!serverRecords.some((entry) => entry.event === "omitted"), "Server preload emitted an omission");
  assert(!pilots.some((pilot) => pilot.evidence.some((entry) => entry.event === "queued"
    && entry.direction !== "client-to-authority")), "Browser scheduler impaired downstream twice");
  assert(!serverRecords.some((entry) => entry.event === "queued"
    && entry.direction !== "authority-to-client"), "Server preload impaired a non-downstream direction");
  return {
    upstream: validate(upstream, "client-to-authority"),
    downstream: validate(downstream, "authority-to-client"),
    bypass,
  };
}

function clientLedger(pilot, ownerPlayerId, options = {}) {
  const events = pilot.evidence;
  const excludedWindows = options.excludedWindows || [];
  const overlapsExcludedWindow = (start, end = start) => excludedWindows.some((window) =>
    Number.isFinite(window.startMonoMs) && Number.isFinite(window.endMonoMs)
      && start <= window.endMonoMs && end >= window.startMonoMs);
  const inputs = new Map();
  const inputLatencies = [];
  const excludedInputLatencies = [];
  const actions = new Map();
  const actionLatencies = [];
  const excludedActionLatencies = [];
  const pulseEvents = [];
  const deliveredEventCounts = new Map();
  const pairs = new Map();
  const alignedTimes = [];
  for (const event of events) {
    const active = event.phase === "active";
    if (active && event.direction === "client-to-authority" && event.event === "queued" && event.inputSeq) {
      if (!inputs.has(event.inputSeq)) inputs.set(event.inputSeq, event.atMonoMs);
    }
    if (event.direction === "authority-to-client" && event.event === "application-delivered"
      && event.frameClass === "ack" && event.ackKind === "input" && event.inputSeq) {
      for (const [inputSeq, sentAt] of inputs) {
        if (inputSeq > event.inputSeq) continue;
        assert(event.actualMonoMs >= sentAt,
          `${pilot.slot} covering input ACK ${event.inputSeq} preceded input ${inputSeq}`);
        const latency = event.actualMonoMs - sentAt;
        if (overlapsExcludedWindow(sentAt, event.actualMonoMs)) excludedInputLatencies.push(latency);
        else inputLatencies.push(latency);
        inputs.delete(inputSeq);
      }
    }
    if (active && event.direction === "client-to-authority" && event.event === "queued" && event.frameClass === "action") {
      if (!actions.has(event.actionId)) actions.set(event.actionId,
        { sentAt: event.atMonoMs, outcomes: [], semanticOutcome: null });
    }
    if (event.direction === "authority-to-client" && event.event === "application-delivered"
      && event.frameClass === "ack" && event.ackKind === "action" && actions.has(event.actionId)) {
      const action = actions.get(event.actionId);
      action.outcomes.push(event);
      if (!action.semanticOutcome) action.semanticOutcome = event;
      else assert(action.semanticOutcome.status === event.status
        && action.semanticOutcome.actionSeq === event.actionSeq
        && action.semanticOutcome.commandSeq === event.commandSeq,
        `${pilot.slot} duplicate action ACK changed semantic status`);
    }
    if (event.direction === "authority-to-client" && event.event === "application-delivered"
      && event.frameClass === "event" && Number.isSafeInteger(event.eventSeq)) {
      deliveredEventCounts.set(event.eventSeq, (deliveredEventCounts.get(event.eventSeq) || 0) + 1);
    }
    if (active && event.direction === "authority-to-client" && event.event === "application-delivered"
      && (event.frameClass === "publicState" || event.frameClass === "ownerState") && event.snapshotId) {
      const pair = pairs.get(event.snapshotId) || {};
      pair[event.frameClass] = event.actualMonoMs;
      pairs.set(event.snapshotId, pair);
      if (pair.publicState != null && pair.ownerState != null && !pair.recorded) {
        pair.recorded = true;
        alignedTimes.push(Math.max(pair.publicState, pair.ownerState));
      }
    }
  }
  const consumedEventCounts = new Map();
  for (const event of pilot.consumedEvents) {
    assert(Number.isSafeInteger(event.eventSeq), `${pilot.slot} consumed event lacked a safe event sequence`);
    consumedEventCounts.set(event.eventSeq, (consumedEventCounts.get(event.eventSeq) || 0) + 1);
  }
  assert([...consumedEventCounts.values()].every((count) => count === 1),
    `${pilot.slot} consumed a duplicate event sequence`);
  const duplicateDeliveredEventSequences = [...deliveredEventCounts.entries()]
    .filter(([, count]) => count > 1).map(([eventSeq]) => eventSeq);
  for (const eventSeq of duplicateDeliveredEventSequences) {
    assert(consumedEventCounts.get(eventSeq) === 1,
      `${pilot.slot} duplicated delivered event ${eventSeq} was not consumed exactly once`);
  }
  for (const event of pilot.consumedEvents.filter((entry) =>
    entry.eventType === "player.pulse" && entry.eventPlayerId === ownerPlayerId)) {
    assert(Number.isSafeInteger(event.eventSeq), `${pilot.slot} consumed pulse lacked a safe event sequence`);
    pulseEvents.push({ eventSeq: event.eventSeq, actualMonoMs: event.actualMonoMs });
  }
  alignedTimes.sort((a, b) => a - b);
  pulseEvents.sort((a, b) => a.actualMonoMs - b.actualMonoMs);
  assert(new Set(pulseEvents.map((event) => event.eventSeq)).size === pulseEvents.length,
    `${pilot.slot} observed duplicate pulse event sequences`);
  let pulseIndex = 0;
  for (const action of [...actions.values()].sort((left, right) => left.sentAt - right.sentAt)) {
    const outcome = action.semanticOutcome;
    if (!outcome) continue;
    let settledAt = outcome.actualMonoMs;
    if (outcome.status === "accepted") {
      while (pulseIndex < pulseEvents.length && pulseEvents[pulseIndex].actualMonoMs < action.sentAt) pulseIndex += 1;
      if (pulseIndex < pulseEvents.length) settledAt = Math.max(settledAt, pulseEvents[pulseIndex++].actualMonoMs);
      else settledAt = Number.POSITIVE_INFINITY;
    }
    const latency = settledAt - action.sentAt;
    if (overlapsExcludedWindow(action.sentAt, settledAt)) excludedActionLatencies.push(latency);
    else actionLatencies.push(latency);
  }
  const excludedCadenceSamples = [];
  const cadence = [];
  for (let index = 1; index < alignedTimes.length; index += 1) {
    const interval = alignedTimes[index] - alignedTimes[index - 1];
    if (overlapsExcludedWindow(alignedTimes[index - 1], alignedTimes[index])) excludedCadenceSamples.push(interval);
    else cadence.push(interval);
  }
  return {
    inputLatencies,
    actionLatencies,
    cadence,
    actions,
    pulseEvents,
    summary: {
      inputAckSamples: inputLatencies.length,
      inputAckP95Ms: percentile(inputLatencies, 0.95),
      alignedPairSamples: alignedTimes.length,
      snapshotCadenceP95Ms: percentile(cadence, 0.95),
      reliableActions: actions.size,
      reliableConsequenceP95Ms: percentile(actionLatencies, 0.95),
      duplicateDeliveredEventSequences: duplicateDeliveredEventSequences.length,
      recoveryWindowSamples: { inputAck: excludedInputLatencies.length,
        cadence: excludedCadenceSamples.length, reliableConsequence: excludedActionLatencies.length },
      recoveryLatencyDistribution: {
        inputAckMs: { p50: percentile(excludedInputLatencies, 0.5), p95: percentile(excludedInputLatencies, 0.95),
          max: excludedInputLatencies.length ? Math.max(...excludedInputLatencies) : null },
        cadenceMs: { p50: percentile(excludedCadenceSamples, 0.5), p95: percentile(excludedCadenceSamples, 0.95),
          max: excludedCadenceSamples.length ? Math.max(...excludedCadenceSamples) : null },
        reliableConsequenceMs: { p50: percentile(excludedActionLatencies, 0.5),
          p95: percentile(excludedActionLatencies, 0.95),
          max: excludedActionLatencies.length ? Math.max(...excludedActionLatencies) : null },
      },
    },
  };
}

async function capture(pilot, runDir, label) {
  const file = path.join(runDir, `${label}.png`);
  await pilot.page.screenshot({ path: file });
  const bytes = fs.readFileSync(file);
  assert(bytes.length > 1024 && bytes.readUInt32BE(16) === 1280 && bytes.readUInt32BE(20) === 800,
    `Invalid 1280x800 screenshot ${label}`);
  return { file: path.basename(file), sha256: sha256(bytes), bytes: bytes.length };
}

async function runF6CloseSchedule({ pilots, scenario, startWallMs, clientEvidenceFile, runDir, signal }) {
  const schedule = scenario.closeSchedule;
  assert(schedule && Number.isFinite(schedule.atMs) && schedule.atMs > scenario.warmupMs,
    "F6 close schedule must begin after warm-up");
  const scheduledWallMs = startWallMs + schedule.atMs;
  const invocations = await Promise.all(pilots.map((pilot, index) => pilot.page.evaluate(async (options) => {
    const delayMs = options.scheduledWallMs - Date.now();
    if (delayMs > 0) await new Promise((resolve) => setTimeout(resolve, delayMs));
    const before = window.__TEST_API.getMultiplayerJourneyState();
    const schedulerEpochOrdinal = window.__LBH_FRAME_IMPAIRMENT__.rotateEpoch();
    const actualWallMs = Date.now();
    const actualMonoMs = performance.now();
    const interrupted = window.__TEST_API.interruptMultiplayerStreamForTest();
    return {
      pilotSlot: options.pilotSlot,
      scheduledWallMs: options.scheduledWallMs,
      actualWallMs,
      actualMonoMs,
      schedulerEpochOrdinal,
      beforeConnectionEpoch: before.connectionEpoch,
      beforeSnapshotId: before.snapshotId,
      beforeInputAck: before.transport.lastInputAck,
      beforeReconnectCount: before.transport.reconnectCount,
      beforeStreamState: before.transport.streamState,
      pendingActionCount: interrupted?.pendingActionCount ?? null,
      pendingInputCount: interrupted?.pendingInputCount ?? null,
      hookAccepted: Boolean(interrupted),
    };
  }, { scheduledWallMs, index, pilotSlot: pilot.slot })));
  const actualWalls = invocations.map((entry) => entry.actualWallMs);
  const barrierSkewMs = Math.max(...actualWalls) - Math.min(...actualWalls);
  const evidenceFile = path.join(runDir, "f6-close-schedule.json");
  const writeEvidence = (stage, outcomes = null) => fs.writeFileSync(evidenceFile,
    `${JSON.stringify({ stage, scheduledWallMs, barrierBudgetMs: schedule.barrierMs,
      barrierSkewMs, invocations, outcomes }, null, 2)}\n`);
  writeEvidence("hooks-invoked");
  assert(invocations.every((entry) => entry.hookAccepted), "F6 interruption hook rejected a pilot");
  assert(invocations.every((entry) => entry.beforeStreamState === "open"),
    "F6 interruption hook did not begin from four open streams");
  assert(invocations.every((entry) => entry.schedulerEpochOrdinal === 2),
    "F6 browser scheduler did not rotate every pilot to epoch ordinal 2");
  assert(barrierSkewMs <= schedule.barrierMs,
    `F6 close barrier skew ${barrierSkewMs}ms exceeded ${schedule.barrierMs}ms`);
  for (const entry of invocations) appendJsonl(clientEvidenceFile, { event: "layer-a-close",
    pilotSlot: entry.pilotSlot, scheduledWallMs: entry.scheduledWallMs, actualWallMs: entry.actualWallMs,
    actualMonoMs: entry.actualMonoMs, schedulerEpochOrdinal: entry.schedulerEpochOrdinal });

  const outcomes = new Array(pilots.length).fill(null);
  const deadline = Math.max(...actualWalls) + schedule.recoveryBudgetMs;
  while (Date.now() <= deadline && outcomes.some((entry) => entry === null)) {
    if (signal?.aborted) throw signal.reason || new Error("aborted");
    for (let index = 0; index < pilots.length; index += 1) {
      if (outcomes[index]) continue;
      const state = await journeyState(pilots[index]);
      const invocation = invocations[index];
      const streamState = state?.transport?.streamState;
      if (streamState === "failed") {
        outcomes[index] = { outcome: "terminal", observedWallMs: Date.now(), streamState,
          connectionEpoch: state.connectionEpoch, reconnectCount: state.transport.reconnectCount };
        continue;
      }
      if (state?.transport?.activeTransport === "stream" && streamState === "open"
        && state.connectionEpoch > invocation.beforeConnectionEpoch
        && state.transport.reconnectCount === invocation.beforeReconnectCount + 1
        && state.transport.lastInputAck > invocation.beforeInputAck
        && Number.isSafeInteger(state.snapshotId)) {
        outcomes[index] = { outcome: "recovered", observedWallMs: Date.now(), streamState,
          connectionEpoch: state.connectionEpoch, reconnectCount: state.transport.reconnectCount,
          snapshotId: state.snapshotId, inputAck: state.transport.lastInputAck };
      }
    }
    if (outcomes.some((entry) => entry === null)) await sleep(50, signal);
  }
  writeEvidence("recovery-observed", outcomes);
  assert(outcomes.every(Boolean), "F6 recovery budget expired with a half-open pilot");

  for (let index = 0; index < pilots.length; index += 1) {
    const pilot = pilots[index];
    const drained = await pilot.page.evaluate(() => window.__LBH_FRAME_IMPAIRMENT__.drain());
    pilot.evidence.push(...drained);
    for (const event of drained) appendJsonl(clientEvidenceFile, sanitizeFrameEvidence(event));
    const invocation = invocations[index];
    const outcome = outcomes[index];
    outcome.recoveryElapsedMs = outcome.observedWallMs - invocation.actualWallMs;
    assert(outcome.recoveryElapsedMs <= schedule.recoveryBudgetMs,
      `${pilot.slot} F6 recovery exceeded ${schedule.recoveryBudgetMs}ms`);
    if (outcome.outcome === "terminal") continue;
    const epochRecords = pilot.evidence.filter((entry) =>
      entry.connectionEpochOrdinal === invocation.schedulerEpochOrdinal
      && Number(entry.actualMonoMs) >= invocation.actualMonoMs);
    const inboundFrames = pilot.privacyFrames.filter((entry) => entry.direction === "inbound");
    const welcomeIndex = inboundFrames.findIndex((entry) => entry.type === "welcome"
      && entry.connectionEpoch > invocation.beforeConnectionEpoch && entry.reconnected === true);
    const welcome = inboundFrames[welcomeIndex];
    assert(welcome, `${pilot.slot} F6 lacked a new-epoch welcome`);
    const rebaseIndex = inboundFrames.findIndex((entry, frameIndex) => frameIndex > welcomeIndex
      && entry.type === "rebase" && Number.isSafeInteger(entry.snapshotId));
    const rebase = inboundFrames[rebaseIndex];
    assert(rebase, `${pilot.slot} F6 lacked a new-epoch rebase`);
    const baselinePublic = inboundFrames.find((entry, frameIndex) => frameIndex > rebaseIndex
      && entry.type === "publicState" && entry.snapshotId === rebase.snapshotId);
    const baselineOwner = inboundFrames.find((entry, frameIndex) => frameIndex > rebaseIndex
      && entry.type === "ownerState" && entry.snapshotId === rebase.snapshotId);
    assert(baselinePublic && baselineOwner, `${pilot.slot} F6 lacked an aligned public/owner baseline`);
    const baselineAck = epochRecords.find((entry) => entry.direction === "client-to-authority"
      && entry.event === "copy-delivered" && entry.frameClass === "ack" && entry.ackKind === "baseline"
      && entry.snapshotId === rebase.snapshotId);
    assert(baselineAck, `${pilot.slot} F6 lacked a physical baseline ACK`);
    const physicalInput = epochRecords.find((entry) => entry.direction === "client-to-authority"
      && entry.event === "copy-delivered" && entry.frameClass === "input"
      && entry.inputSeq > invocation.beforeInputAck && entry.actualMonoMs >= baselineAck.actualMonoMs);
    assert(physicalInput, `${pilot.slot} F6 lacked a new-epoch physical input send`);
    const inputAck = epochRecords.find((entry) => entry.direction === "authority-to-client"
      && entry.event === "application-delivered" && entry.frameClass === "ack" && entry.ackKind === "input"
      && entry.inputSeq >= physicalInput.inputSeq && entry.actualMonoMs >= physicalInput.actualMonoMs);
    assert(inputAck, `${pilot.slot} F6 lacked a covering input ACK`);
    outcome.baselineSnapshotId = rebase.snapshotId;
    outcome.physicalInputSeq = physicalInput.inputSeq;
    outcome.coveringInputAck = inputAck.inputSeq;
    outcome.newConnectionEpoch = welcome.connectionEpoch;
  }
  const result = { scheduledWallMs, barrierBudgetMs: schedule.barrierMs, barrierSkewMs, invocations, outcomes };
  writeEvidence("complete", outcomes);
  return result;
}

async function runBrowserCohort(options) {
  const { fixture, compiled, scenarioId, runDir, htmlTarget = "index-a.html", signal } = options;
  const scenario = fixture.scenarios[scenarioId];
  const scenarioLabel = scenarioId.toLowerCase().replace(/[^a-z0-9]+/g, "-");
  const [staticPort, simPort] = await reserveDistinctPorts(2);
  let releaseLock = () => {};
  const controlFile = path.join(runDir, "control.json");
  const preloadConfigFile = path.join(runDir, "preload-config.json");
  const serverEvidenceFile = path.join(runDir, "server-frames.jsonl");
  const clientEvidenceFile = path.join(runDir, "client-frames.jsonl");
  const clientsFile = path.join(runDir, "clients.jsonl");
  const authorityFile = path.join(runDir, "authority.jsonl");
  const errorFile = path.join(runDir, "browser-errors.jsonl");
  const registryFile = path.join(TMP, `impairment-registry-${process.pid}-${simPort}.json`);
  const partialResultFile = path.join(runDir, "partial-result.json");
  const preload = path.join(__dirname, "sim-impairment-preload.cjs");
  const resources = { pilots: [], staticServer: null, simStarted: false, browserSchedulerStatuses: [] };
  const startedAt = Date.now();
  let sampling = true;
  let samplingTask = null;
  let samplingError = null;
  let lastHealth = null;
  let expectedSlotMap = [];
  let cleanup = null;
  let f6CloseSchedule = null;
  let f6CloseTask = null;
  let f6CloseError = null;
  let t0Transport = null;
  let t0Task = null;
  let t0Error = null;
  let t0Result = null;
  let t0FinalDrain = null;
  const compiledDecisionFile = path.join(runDir, "compiled-decisions.json");
  const writePartialResult = (stage, extra = {}) => {
    const value = {
      stage,
      staticPort,
      simPort,
      slotMap: expectedSlotMap,
      processes: {
        staticPid: resources.staticServer?.pid || null,
        simPid: lastHealth?.process?.pid || null,
        browserPids: resources.pilots.map((pilot) => pilot.browser.proc?.pid || null),
      },
      profileDirectories: resources.pilots.map((pilot) => pilot.browser.userDataDir),
      ...extra,
    };
    fs.writeFileSync(partialResultFile, `${JSON.stringify(value, null, 2)}\n`);
  };
  fs.writeFileSync(preloadConfigFile, `${JSON.stringify({ compiledDecisionFile,
    compiledDecisionHash: compiled.hash, controlFile, serverEvidenceFile })}\n`, { flag: "wx" });
  releaseLock = acquireLock();
  try {
    resources.staticServer = await startStaticServer(staticPort, runDir);
    writePartialResult("static-started");
    const signalListenersBefore = new Map(["SIGINT", "SIGTERM"].map((name) => [name, new Set(process.listeners(name))]));
    try {
      await startSimServer(simPort, { idleShutdownMs: 120000, env: {
        LBH_SIM_WS_ENABLED: "true",
        LBH_SIM_MAX_SIM_TIME: "600",
        LBH_SESSION_REGISTRY_FILE: registryFile,
        LBH_IMPAIRMENT_PRELOAD_CONFIG: preloadConfigFile,
        NODE_OPTIONS: `${process.env.NODE_OPTIONS || ""} --require=${preload}`.trim(),
      } });
    } finally {
      for (const name of ["SIGINT", "SIGTERM"]) {
        for (const listener of process.listeners(name)) {
          if (!signalListenersBefore.get(name).has(listener)) process.removeListener(name, listener);
        }
      }
    }
    resources.simStarted = true;
    for (let index = 0; index < 4; index += 1) {
      resources.pilots.push(await launchPilot({ index, staticPort, simPort, fixture, compiled, htmlTarget }));
      writePartialResult(`pilot-${index}-admitted`);
    }
    await Promise.all(resources.pilots.map((pilot) => waitFor(pilot.page, () => {
      const state = window.__TEST_API?.getMultiplayerJourneyState?.();
      return state?.players?.filter((player) => !player.isAI).length === 4;
    }, { timeout: 20000 })));
    const initial = await Promise.all(resources.pilots.map(journeyState));
    assert(new Set(initial.map((state) => state.runId)).size === 1, `${scenarioId} cohort did not share one run`);
    assert(new Set(initial.map((state) => state.clientId)).size === 4, `${scenarioId} authority players were not unique`);
    assert(new Set(initial.map((state) => state.membershipId)).size === 4, `${scenarioId} memberships were not unique`);
    assert(new Set(initial.map((state) => state.owner?.profileId)).size === 4, `${scenarioId} profiles were not unique`);
    const slotMap = initial.map((state, index) => ({ pilotSlot: `pilot-${index}`,
      playerHash: hashId(state.clientId), membershipHash: hashId(state.membershipId),
      profileHash: hashId(state.owner?.profileId), connectionEpoch: state.connectionEpoch }));
    expectedSlotMap = slotMap;
    writePartialResult("cohort-admitted", { slotMap });
    const startWallMs = Date.now() + 1500;
    fs.writeFileSync(controlFile, `${JSON.stringify({ startWallMs })}\n`, { flag: "wx" });
    const timelines = await Promise.all(resources.pilots.map((pilot) => pilot.page.evaluate(
      (start) => window.__LBH_FRAME_IMPAIRMENT__.start(start), startWallMs)));
    if (scenario.transport?.kind === "cdp-websocket-smoke") {
      t0Transport = createCdpBrowserTransport({ pilots: resources.pilots, transport: scenario.transport,
        startWallMs, runDir, journeyState, signal });
      t0Task = t0Transport.run().catch(async (error) => {
        t0Error = error;
        try { await t0Transport.restore(); }
        catch (restoreError) {
          t0Error = new AggregateError([error, restoreError], "T0 failed and immediate profile restoration failed");
        }
        return null;
      });
    }
    f6CloseTask = scenario.closeSchedule
      ? runF6CloseSchedule({ pilots: resources.pilots, scenario, startWallMs, clientEvidenceFile, runDir, signal })
        .catch((error) => { f6CloseError = error; return null; })
      : null;
    if (scenario.stimulus?.inputIntervalMs) {
      const stimulusSlots = new Set(scenario.stimulus.inputPilots || ["pilot-3"]);
      for (const pilot of resources.pilots.filter((entry) => stimulusSlots.has(entry.slot))) {
        await pilot.page.evaluate((intervalMs) => {
          window.__LBH_IMPAIRMENT_INPUT_STIMULUS__ = setInterval(() => {
          window.__TEST_API?.sendRemoteInput?.({ moveX: 0.35, moveY: -0.2, thrust: 0.7 })?.catch(() => {});
          }, intervalMs);
        }, scenario.stimulus.inputIntervalMs);
      }
    }
    for (const pilot of resources.pilots) {
      await pilot.page.evaluate(() => {
        window.dispatchEvent(new KeyboardEvent("keydown", { code: "ArrowRight", key: "ArrowRight", bubbles: true }));
        window.dispatchEvent(new KeyboardEvent("keydown", { code: "KeyW", key: "w", bubbles: true }));
      });
    }
    samplingTask = (async () => {
      while (sampling) {
        const sampledAt = Date.now();
        for (const pilot of resources.pilots) {
          const drained = await pilot.page.evaluate(() => window.__LBH_FRAME_IMPAIRMENT__.drain());
          pilot.evidence.push(...drained);
          for (const event of drained) appendJsonl(clientEvidenceFile, sanitizeFrameEvidence(event));
          const state = await journeyState(pilot);
          appendJsonl(clientsFile, { sampledAt, pilotSlot: pilot.slot, snapshotId: state.snapshotId,
            tick: state.tick, connectionEpoch: state.connectionEpoch, transport: state.transport });
        }
        const health = await (await fetch(`http://127.0.0.1:${simPort}/health`, {
          headers: { "x-lbh-test-oracle": "authority" }, signal: AbortSignal.timeout(1000) })).json();
        const accounting = health.multiplayer?.projection?.accounting;
        lastHealth = health;
        assert(health.multiplayer?.adapter?.pressure?.current && health.multiplayer?.adapter?.pressure?.maxima,
          "Authority sample missing adapter pressure schema");
        assert(accounting?.costDistributions?.simTickMs && accounting.costDistributions.projectionReplicationMs,
          "Authority sample missing bounded cost quantiles");
        assert(health.session?.overloadState === "NORMAL", `${scenarioId} authority left NORMAL: ${health.session?.overloadState}`);
        assert(accounting.costDistributions.simTickMs.count > 0
          && accounting.costDistributions.simTickMs.totalObserved > 0
          && accounting.costDistributions.projectionReplicationMs.count > 0,
        "Authority quantile distributions have no observations");
        const pressure = health.multiplayer.adapter.pressure;
        appendJsonl(authorityFile, { sampledAt, tick: health.tick, mode: health.session?.overloadState,
          process: health.process, pressure: health.multiplayer.adapter.pressure,
          costDistributions: accounting.costDistributions });
        if (scenario.transport?.kind === "cdp-websocket-smoke") {
          const insideOfflineRecoveryWindow = sampledAt >= startWallMs + scenario.transport.offlineWindow.startMs
            && sampledAt <= startWallMs + scenario.transport.offlineWindow.endMs
              + scenario.transport.offlineWindow.settleMs;
          if (!insideOfflineRecoveryWindow) {
            assert(pressure.current.wsBufferedBytes.worstConnection < pressure.policy.transportHighWaterBytes,
              `${scenarioId} retained WebSocket pressure outside its declared offline/recovery window`);
          }
          assert(pressure.policy.connectionsCrossedTransportHighWater <= 1,
            `${scenarioId} allowed more than the one intentionally offline connection to cross high water`);
        } else {
          assert(pressure.maxima.wsBufferedBytes.worstConnection < pressure.policy.transportHighWaterBytes,
            `${scenarioId} crossed WebSocket high water`);
        }
        assert(pressure.maxima.queuedBytes.worstConnection <= pressure.policy.applicationQueueBytes
          && pressure.maxima.reliableBytes.worstConnection <= pressure.policy.reliableQueueBytes
          && pressure.maxima.replayEventBytes.worstConnection <= pressure.policy.replayEventBytes
          && pressure.maxima.pendingInboundBytes.worstConnection <= pressure.policy.inboundPendingBytes,
        `${scenarioId} exceeded an adapter pressure policy bound`);
        assert((scenario.transport?.kind === "cdp-websocket-smoke"
          || pressure.policy.connectionsCrossedTransportHighWater === 0)
          && pressure.policy.connectionsHitQueuePolicy === 0,
        `${scenarioId} unexpectedly crossed a transport or queue policy`);
        await sleep(1000, signal);
      }
    })().catch((error) => { samplingError = error; sampling = false; });
    const warmupCapture = await capture(resources.pilots[0], runDir, `${scenarioLabel}-warmup-host`);
    await sleep(Math.max(0, startWallMs - Date.now()) + scenario.warmupMs + 2000, signal);
    if (samplingError) throw samplingError;
    for (const pilot of resources.pilots) await tap(pilot.page, "KeyE", "e", 50);
    if (scenario.stimulus?.actionIntervalMs) {
      const activeEnd = startWallMs + scenario.warmupMs + scenario.activeMs;
      let nextActionAt = Date.now() + scenario.stimulus.actionIntervalMs;
      let secondCohortActionSent = false;
      while (nextActionAt < activeEnd - Number(scenario.stimulus.drainMs || 500)) {
        await sleep(Math.max(0, nextActionAt - Date.now()), signal);
        if (!secondCohortActionSent && Date.now() >= startWallMs + scenario.warmupMs + 12000) {
          for (const pilot of resources.pilots.slice(0, 3)) await tap(pilot.page, "KeyE", "e", 50);
          secondCohortActionSent = true;
        }
        await tap(resources.pilots[3].page, "KeyE", "e", 50);
        nextActionAt += scenario.stimulus.actionIntervalMs;
        if (samplingError) throw samplingError;
      }
      assert(secondCohortActionSent, `${scenarioId} did not complete cohort action stimulus`);
    } else {
      await sleep(10000, signal);
      if (samplingError) throw samplingError;
      for (const pilot of resources.pilots) await tap(pilot.page, "KeyE", "e", 50);
    }
    if (scenario.stimulus?.inputIntervalMs) {
      const stimulusSlots = new Set(scenario.stimulus.inputPilots || ["pilot-3"]);
      for (const pilot of resources.pilots.filter((entry) => stimulusSlots.has(entry.slot))) {
        await pilot.page.evaluate(() => {
          clearInterval(window.__LBH_IMPAIRMENT_INPUT_STIMULUS__);
          window.__LBH_IMPAIRMENT_INPUT_STIMULUS__ = null;
        });
      }
    }
    if (f6CloseTask) {
      f6CloseSchedule = await f6CloseTask;
      if (f6CloseError) throw f6CloseError;
    }
    if (t0Task) {
      t0Result = await t0Task;
      if (t0Error) throw t0Error;
    }
    const endWallMs = startWallMs + scenario.warmupMs + scenario.activeMs + scenario.recoveryMs;
    await sleep(Math.max(0, endWallMs - Date.now()), signal);
    if (samplingError) throw samplingError;
    for (const pilot of resources.pilots) {
      await pilot.page.evaluate(() => {
        window.dispatchEvent(new KeyboardEvent("keyup", { code: "KeyW", key: "w", bubbles: true }));
        window.dispatchEvent(new KeyboardEvent("keyup", { code: "ArrowRight", key: "ArrowRight", bubbles: true }));
      });
    }
    const screenshots = [warmupCapture,
      await capture(resources.pilots[0], runDir, `${scenarioLabel}-recovery-host`),
      await capture(resources.pilots[3], runDir, `${scenarioLabel}-recovery-pilot-3`)];
    if (scenario.transport?.kind === "cdp-websocket-smoke") {
      const drainStartedWallMs = Date.now();
      for (const pilot of resources.pilots) await tap(pilot.page, "Escape", "Escape", 50);
      await Promise.all(resources.pilots.map((pilot) => waitFor(pilot.page, () =>
        window.__TEST_API?.getGamePhase?.() === "paused", { timeout: 2000 })));
      await Promise.all(resources.pilots.map((pilot) => waitFor(pilot.page, () => {
        const state = window.__TEST_API?.getMultiplayerJourneyState?.();
        return state?.transport?.pendingInputCount === 0 && state?.transport?.pendingActionCount === 0;
      }, { timeout: scenario.transport.offlineWindow.finalDrainMs })));
      t0FinalDrain = { startedWallMs: drainStartedWallMs, completedWallMs: Date.now(),
        budgetMs: scenario.transport.offlineWindow.finalDrainMs };
    }
    sampling = false;
    await samplingTask;
    for (const pilot of resources.pilots) {
      const drained = await pilot.page.evaluate(() => window.__LBH_FRAME_IMPAIRMENT__.drain());
      pilot.evidence.push(...drained);
      for (const event of drained) appendJsonl(clientEvidenceFile, sanitizeFrameEvidence(event));
      pilot.consumedEvents = await pilot.page.evaluate(() => window.__LBH_CONSUMED_EVENTS__ || []);
      for (const event of pilot.consumedEvents) appendJsonl(clientEvidenceFile,
        sanitizeFrameEvidence({ ...event, pilotSlot: pilot.slot, event: "gameplay-consumed" }));
    }
    const final = await Promise.all(resources.pilots.map(journeyState));
    const privacy = resources.pilots.map((pilot, index) => scanPrivacy(pilot, {
      ownerPlayerId: final[index].clientId, membershipId: final[index].membershipId,
    }));
    const ledgers = resources.pilots.map((pilot, index) => clientLedger(pilot, final[index].clientId, {
      excludedWindows: t0Result?.steadyStateExclusionWindow?.pilotSlot === pilot.slot
        ? [t0Result.steadyStateExclusionWindow] : [],
    }));
    const impairment = decisionProfile(scenario, resources.pilots, serverEvidenceFile, t0Result);
    if (scenario.transport?.kind === "cdp-websocket-smoke"
      && impairment.downstream.transportRejectedReleases > 0) {
      const pressure = lastHealth?.multiplayer?.adapter?.pressure;
      assert(pressure?.policy?.connectionsCrossedTransportHighWater === 1
        && pressure.maxima.wsBufferedBytes.worstConnection >= pressure.policy.transportHighWaterBytes,
      "T0 downstream release rejections lacked a matching single-client transport-pressure crossing");
    }
    const t0InputTimeoutCausality = scenario.transport?.kind === "cdp-websocket-smoke"
      ? bindT0InputTimeoutCausality(resources.pilots[3], scenario, t0Result) : null;
    if (t0InputTimeoutCausality) {
      fs.writeFileSync(path.join(runDir, "t0-input-timeout-causality.json"),
        `${JSON.stringify(t0InputTimeoutCausality, null, 2)}\n`, { flag: "wx" });
    }
    const eventsOracle = await (await fetch(`http://127.0.0.1:${simPort}/events?since=0`, {
      headers: { "x-lbh-test-oracle": "events" }, signal: AbortSignal.timeout(2000) })).json();
    const authorityPulseEvents = new Map();
    for (const event of eventsOracle.events || []) {
      if (event.type !== "player.pulse") continue;
      const id = event.payload?.clientId;
      const sequences = authorityPulseEvents.get(id) || new Set();
      assert(Number.isSafeInteger(event.seq), "Authority pulse oracle returned an unsafe event sequence");
      sequences.add(event.seq);
      authorityPulseEvents.set(id, sequences);
    }
    for (const pilot of resources.pilots) {
      for (const error of [...pilot.pageErrors, ...pilot.rewriteErrors,
        ...pilot.networkFailures.map((entry) => `${entry.status} ${entry.url}`)]) {
        appendJsonl(errorFile, { pilotSlot: pilot.slot, error, expectedFault: false });
      }
      for (const errorEvent of pilot.consoleErrorEvents) {
        appendJsonl(errorFile, { pilotSlot: pilot.slot, error: errorEvent.message,
          atWallMs: errorEvent.atWallMs,
          t0MatchedInputSeq: errorEvent.t0MatchedInputSeq,
          expectedFault: isExpectedF3InputTimeout(scenarioId, pilot, errorEvent.message)
            || isExpectedF6CloseInputError(scenarioId, pilot, errorEvent, f6CloseSchedule)
            || isExpectedT0OfflineInputError(scenarioId, pilot, errorEvent) });
      }
    }
    for (let index = 0; index < 4; index += 1) {
      const summary = ledgers[index].summary;
      const gates = scenario.gates;
      assert(summary.inputAckSamples >= gates.minimumInputAckSamplesPerPilot,
        `${resources.pilots[index].slot} input ACK sample floor ${summary.inputAckSamples}`);
      assert(summary.alignedPairSamples >= gates.minimumAlignedPairSamplesPerPilot,
        `${resources.pilots[index].slot} aligned-pair sample floor ${summary.alignedPairSamples}`);
      assert(summary.reliableActions >= gates.minimumReliableActionsPerPilot,
        `${resources.pilots[index].slot} reliable action floor ${summary.reliableActions}`);
      assert(summary.inputAckP95Ms <= gates.inputAckP95Ms, `${resources.pilots[index].slot} input p95 ${summary.inputAckP95Ms}`);
      assert(summary.snapshotCadenceP95Ms <= gates.snapshotCadenceP95Ms,
        `${resources.pilots[index].slot} cadence p95 ${summary.snapshotCadenceP95Ms}`);
      assert(summary.reliableConsequenceP95Ms <= gates.reliableConsequenceP95Ms,
        `${resources.pilots[index].slot} reliable p95 ${summary.reliableConsequenceP95Ms}`);
      for (const [actionId, action] of ledgers[index].actions) {
        assert(action.semanticOutcome && new Set(action.outcomes.map((entry) => entry.status)).size === 1,
          `${resources.pilots[index].slot} action ${actionId} lacked one stable semantic outcome`);
      }
      if (scenario.closeSchedule) {
        const outcome = f6CloseSchedule.outcomes[index];
        const halfOpenStates = new Set(["connecting", "reconnecting", "disconnected"]);
        assert(!halfOpenStates.has(final[index].transport.streamState),
          `${resources.pilots[index].slot} remained half-open after F6`);
        if (outcome.outcome === "recovered") {
          assert(final[index].transport.activeTransport === "stream"
            && final[index].transport.streamState === "open"
            && final[index].transport.reconnectCount === gates.postAdmissionReconnects
            && final[index].connectionEpoch === outcome.newConnectionEpoch,
          `${resources.pilots[index].slot} F6 recovered stream/epoch/count diverged`);
        } else {
          assert(final[index].transport.streamState === "failed",
            `${resources.pilots[index].slot} F6 terminal outcome was not explicit`);
        }
      } else if (scenario.transport?.kind === "cdp-websocket-smoke") {
        assert(final[index].transport.activeTransport === "stream" && final[index].transport.streamState === "open",
          `${resources.pilots[index].slot} did not finish T0 on an open stream`);
        if (resources.pilots[index].slot === scenario.transport.offlineWindow.pilotSlot) {
          assert(final[index].transport.reconnectCount <= gates.maximumImpairedPilotReconnects,
            `${resources.pilots[index].slot} T0 reconnect count ${final[index].transport.reconnectCount}`);
          assert(t0Result?.settled?.state?.connectionEpoch === final[index].connectionEpoch,
            `${resources.pilots[index].slot} T0 settled epoch changed before final state`);
          assert(["same-socket-resume", "new-socket-recovery"].includes(t0Result.immediateSocketOutcome)
            && ["same-socket-resume", "new-socket-recovery"].includes(t0Result.finalConnectionOutcome),
            `${resources.pilots[index].slot} lacked a classified T0 delivery outcome`);
          const postOnlineFrames = resources.pilots[index].privacyFrames.slice(t0Result.privacyFrameCountAtOnline);
          const publicSnapshots = new Set(postOnlineFrames.filter((frame) => frame.type === "publicState")
            .map((frame) => frame.snapshotId));
          assert(postOnlineFrames.some((frame) => frame.type === "ownerState"
            && publicSnapshots.has(frame.snapshotId)), `${resources.pilots[index].slot} lacked an aligned recovery baseline`);
          if (t0Result.finalConnectionOutcome === "new-socket-recovery") {
            const welcomeIndex = postOnlineFrames.findIndex((frame) => frame.type === "welcome"
              && frame.reconnected === true && frame.connectionEpoch === final[index].connectionEpoch);
            assert(welcomeIndex >= 0, `${resources.pilots[index].slot} lacked a final reconnected welcome`);
            const finalEpochFrames = postOnlineFrames.slice(welcomeIndex + 1);
            const rebase = finalEpochFrames.find((frame) => frame.type === "rebase"
              && Number.isSafeInteger(frame.snapshotId));
            assert(rebase && finalEpochFrames.some((frame) => frame.type === "publicState"
              && frame.snapshotId === rebase.snapshotId)
              && finalEpochFrames.some((frame) => frame.type === "ownerState"
                && frame.snapshotId === rebase.snapshotId),
            `${resources.pilots[index].slot} lacked a final-epoch rebase/aligned baseline`);
            const physicalBaselineAck = resources.pilots[index].evidence.find((entry) =>
              entry.direction === "client-to-authority" && entry.connectionEpochOrdinal === 2
                && entry.frameClass === "ack" && entry.ackKind === "baseline"
                && entry.snapshotId === rebase.snapshotId && entry.delivered === true
                && (entry.event === "immediate" || entry.event === "copy-delivered"));
            assert(physicalBaselineAck, `${resources.pilots[index].slot} lacked a physical baseline ACK`);
            const newPhysicalInput = resources.pilots[index].evidence.find((entry) =>
              entry.direction === "client-to-authority" && entry.connectionEpochOrdinal === 2
                && entry.frameClass === "input" && entry.event === "copy-delivered" && entry.delivered === true
                && entry.actualMonoMs >= physicalBaselineAck.actualMonoMs);
            assert(newPhysicalInput, `${resources.pilots[index].slot} lacked a new physical final-epoch input`);
            assert(resources.pilots[index].evidence.some((entry) =>
              entry.direction === "authority-to-client" && entry.connectionEpochOrdinal === 2
                && entry.frameClass === "ack" && entry.ackKind === "input"
                && entry.event === "application-delivered" && entry.inputSeq >= newPhysicalInput.inputSeq
                && entry.actualMonoMs >= newPhysicalInput.actualMonoMs),
            `${resources.pilots[index].slot} lacked a covering final-epoch input ACK`);
          }
        } else {
          assert(final[index].transport.reconnectCount === gates.healthyPilotReconnects,
            `${resources.pilots[index].slot} healthy T0 pilot reconnected`);
        }
      } else {
        assert(final[index].transport.reconnectCount === 0, `${resources.pilots[index].slot} unexpectedly reconnected`);
      }
      if (scenario.rules.faults || scenario.transport?.kind === "cdp-websocket-smoke") {
        assert(final[index].transport.pendingInputCount === 0 && final[index].transport.pendingActionCount === 0,
          `${resources.pilots[index].slot} did not converge pending input/action work`);
      }
      const rebases = resources.pilots[index].privacyFrames.filter((frame) => frame.direction === "inbound"
        && frame.type === "rebase").length;
      assert(Math.max(0, rebases - 1) <= gates.postAdmissionRebases,
        `${resources.pilots[index].slot} had ${Math.max(0, rebases - 1)} post-admission rebases`);
      const inboundAckKinds = new Set(resources.pilots[index].privacyFrames.filter((frame) => frame.direction === "inbound"
        && frame.type === "ack").map((frame) => frame.ackKind));
      const outboundAckKinds = new Set(resources.pilots[index].privacyFrames.filter((frame) => frame.direction === "outbound"
        && frame.type === "ack").map((frame) => frame.ackKind));
      assert(inboundAckKinds.has("input") && inboundAckKinds.has("action")
        && outboundAckKinds.has("delivery") && outboundAckKinds.has("event") && outboundAckKinds.has("baseline"),
      `${resources.pilots[index].slot} did not preserve distinct ACK kinds`);
      assert(resources.pilots[index].hotHttp.length === 0, `${resources.pilots[index].slot} used hot HTTP`);
      const expectedInputTimeouts = resources.pilots[index].consoleErrors.filter((error) =>
        isExpectedF3InputTimeout(scenarioId, resources.pilots[index], error));
      const fatalConsoleErrors = resources.pilots[index].consoleErrorEvents.filter((errorEvent) =>
        !isExpectedF3InputTimeout(scenarioId, resources.pilots[index], errorEvent.message)
        && !isExpectedF6CloseInputError(scenarioId, resources.pilots[index], errorEvent, f6CloseSchedule)
        && !isExpectedT0OfflineInputError(scenarioId, resources.pilots[index], errorEvent));
      if (scenario.rules.faults && resources.pilots[index].slot === "pilot-3") {
        const omittedInputs = impairment.faultClasses["pilot-3/client-to-authority/input"].omitted;
        assert(expectedInputTimeouts.length <= omittedInputs,
          `pilot-3 input timeout evidence did not correlate to ${omittedInputs} omissions`);
        assert(summary.duplicateDeliveredEventSequences > 0,
          "pilot-3 did not bind duplicated event delivery to exact-once gameplay consumption");
      }
      if (scenario.closeSchedule) {
        const expectedCloseErrors = resources.pilots[index].consoleErrorEvents.filter((errorEvent) =>
          isExpectedF6CloseInputError(scenarioId, resources.pilots[index], errorEvent, f6CloseSchedule));
        assert(expectedCloseErrors.length <= 4,
          `${resources.pilots[index].slot} emitted ${expectedCloseErrors.length} close-window input errors`);
      }
      assert(resources.pilots[index].pageErrors.length === 0 && fatalConsoleErrors.length === 0
        && resources.pilots[index].rewriteErrors.length === 0 && resources.pilots[index].networkFailures.length === 0,
        `${resources.pilots[index].slot} browser/rewrite errors`);
      const acceptedPulses = [...ledgers[index].actions.values()].filter((action) =>
        action.semanticOutcome?.status === "accepted").length;
      const oracleSequences = authorityPulseEvents.get(final[index].clientId) || new Set();
      const clientSequences = new Set(ledgers[index].pulseEvents.map((event) => event.eventSeq));
      assert(oracleSequences.size === acceptedPulses && clientSequences.size === acceptedPulses
        && [...oracleSequences].every((sequence) => clientSequences.has(sequence)),
      `${resources.pilots[index].slot} pulse outcomes and consequences differ`);
    }
    return { startedAt, completedAt: Date.now(), staticPort, simPort, slotMap, timelines, screenshots,
      privacy, clientSummaries: ledgers.map((entry) => entry.summary), cdp: resources.pilots.map((pilot) => pilot.cdp),
      impairment,
      f6CloseSchedule,
      t0CdpTransport: t0Result,
      t0FinalDrain,
      t0InputTimeoutCausality,
      pulseConsequences: final.map((state) => authorityPulseEvents.get(state.clientId)?.size || 0),
      processes: { staticPid: resources.staticServer.pid, simPid: lastHealth?.process?.pid || null,
        browserPids: resources.pilots.map((pilot) => pilot.browser.proc?.pid || null) },
      profileDirectories: resources.pilots.map((pilot) => pilot.browser.userDataDir),
      activation: { browserRewriteCounts: resources.pilots.map((pilot) => pilot.rewriter.status().rewrites) },
      scope: scenario.transport?.kind === "cdp-websocket-smoke"
        ? "PR-smoke CDP browser shaping/offline-gap evidence; no claim CDP caused an observed socket close/reconnect, and not TCP loss, netem, WAN, TLS, congestion, retransmission, or receive-window evidence"
        : "pr-smoke application-frame evidence; not canonical duration, memory slope, TCP, WAN, TLS, or packet loss" };
  } finally {
    sampling = false;
    await samplingTask?.catch(() => null);
    await f6CloseTask?.catch(() => null);
    t0Transport?.cancel();
    await t0Task?.catch(() => null);
    await t0Transport?.restore().catch(() => null);
    for (const pilot of resources.pilots) {
      try {
        const drained = await pilot.page.evaluate(() => window.__LBH_FRAME_IMPAIRMENT__.drain());
        for (const event of drained) appendJsonl(clientEvidenceFile, sanitizeFrameEvidence(event));
        resources.browserSchedulerStatuses.push(await pilot.page.evaluate(() => window.__LBH_FRAME_IMPAIRMENT__.status()));
        await pilot.page.evaluate(() => window.__LBH_FRAME_IMPAIRMENT__.stop());
      } catch {}
      await pilot.rewriter?.close().catch(() => null);
      await pilot.browser.close().catch(() => null);
      if (pidAlive(pilot.browser.proc?.pid)) {
        try { process.kill(pilot.browser.proc.pid, "SIGKILL"); } catch {}
      }
    }
    await stopSimServer(simPort).catch(() => null);
    const simLog = simLogFile(simPort);
    if (fs.existsSync(simLog)) copyRedactedSimLog(simLog, path.join(runDir, "sim.log"));
    await stopChild(resources.staticServer);
    for (const handle of [resources.staticServer?.stdout, resources.staticServer?.stderr]) {
      if (Number.isInteger(handle)) try { fs.closeSync(handle); } catch {}
    }
    try { fs.rmSync(registryFile, { force: true }); } catch {}
    for (const file of [resources.staticServer?.pidFile, resources.staticServer?.metaFile]) {
      if (file) try { fs.rmSync(file, { force: true }); } catch {}
    }
    const serverRecords = fs.existsSync(serverEvidenceFile)
      ? fs.readFileSync(serverEvidenceFile, "utf8").split("\n").filter(Boolean).map((line) => JSON.parse(line)) : [];
    const slotMaps = serverRecords.filter((entry) => entry.event === "slot-map");
    const serverQueued = serverRecords.filter((entry) => entry.event === "queued");
    const serverReleased = serverRecords.filter((entry) => entry.event === "released");
    const serverStops = serverRecords.filter((entry) => entry.event === "scheduler-stop");
    const preloadInstalled = serverRecords.filter((entry) => entry.event === "preload-installed");
    const adapterWraps = serverRecords.filter((entry) => entry.event === "adapter-wrap");
    const preloadFailures = serverRecords.filter((entry) => entry.event === "preload-failure"
      || entry.event === "scheduler-stop-failure");
    const forbiddenBarriers = serverRecords.filter((entry) => ["welcome", "rebase", "error", "close"]
      .includes(entry.frameClass));
    cleanup = {
      browserPidsStopped: resources.pilots.every((pilot) => !pidAlive(pilot.browser.proc?.pid)),
      profilesRemoved: resources.pilots.every((pilot) => !fs.existsSync(pilot.browser.userDataDir)),
      staticPidStopped: !pidAlive(resources.staticServer?.pid),
      simPidStopped: !pidAlive(lastHealth?.process?.pid),
      staticPortClosed: await portClosed(staticPort),
      simPortClosed: await portClosed(simPort),
      registryRemoved: !fs.existsSync(registryFile),
      browserSchedulerStatusesComplete: resources.browserSchedulerStatuses.length === 4,
      browserSchedulersPending: resources.browserSchedulerStatuses.length === 4
        ? resources.browserSchedulerStatuses.reduce((sum, status) => sum + (status.queued || 0), 0) : -1,
      browserSchedulerBlocksPending: resources.browserSchedulerStatuses.length === 4
        ? resources.browserSchedulerStatuses.reduce((sum, status) => sum + (status.blocks || 0), 0) : -1,
      preloadTimelineObserved: serverRecords.some((entry) => entry.event === "timeline"),
      preloadInstalledForWrappedProcess: adapterWraps.length === 1
        && preloadInstalled.some((entry) => entry.pid === adapterWraps[0].pid),
      preloadAdapterWrappedOnce: adapterWraps.length === 1,
      preloadStableSlotMaps: slotMaps.length === 4 && new Set(slotMaps.map((entry) => entry.pilotSlot)).size === 4,
      preloadSlotHashesMatch: expectedSlotMap.length === 4 && expectedSlotMap.every((expected) =>
        slotMaps.some((entry) => entry.pilotSlot === expected.pilotSlot
          && entry.runtimeIdentityHash === expected.playerHash)),
      preloadDownstreamObserved: expectedSlotMap.length === 4 && expectedSlotMap.every((expected) =>
        serverQueued.some((entry) => entry.pilotSlot === expected.pilotSlot)
          && serverReleased.some((entry) => entry.pilotSlot === expected.pilotSlot)),
      preloadBarriersBypassed: forbiddenBarriers.length === 0,
      preloadStoppedClean: serverStops.at(-1)?.pending === 0 && serverStops.at(-1)?.pendingBlocks === 0,
      preloadFailuresAbsent: preloadFailures.length === 0,
      cdpProfilesRestored: t0Transport ? t0Transport.restorationComplete : true,
    };
    fs.writeFileSync(path.join(runDir, "cleanup.json"), `${JSON.stringify(cleanup, null, 2)}\n`, { flag: "wx" });
    releaseLock();
    assert(Object.entries(cleanup).every(([, value]) => value === true || value === 0),
      `${scenarioId} cleanup failed: ${JSON.stringify(cleanup)}`);
  }
}

module.exports = { runBrowserCohort, percentile, decisionProfile };
