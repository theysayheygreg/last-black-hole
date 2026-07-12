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
    rewriteErrors: [], networkFailures: [], privacyFrames: [], hotHttp: [], cdp: { inboundBytes: 0, outboundBytes: 0, inboundFrames: 0, outboundFrames: 0 },
    evidence: [] };
  try {
  page.on("pageerror", (error) => pilot.pageErrors.push(error.message));
  page.on("console", (message) => { if (message.type() === "error") pilot.consoleErrors.push(message.text()); });
  await page.session.send("Page.addScriptToEvaluateOnNewDocument", {
    source: browserInitSource({ pilotSlot: pilot.slot, decisionBook: compiled.book }),
  });
  pilot.rewriter = await installMainResponseRewrite(page, fixture, (error) => pilot.rewriteErrors.push(error.message));
  await page.session.send("Network.enable");
  page.session.on("Network.responseReceived", ({ response }) => {
    if (Number(response?.status) >= 400) pilot.networkFailures.push({ status: response.status, url: response.url });
  });
  page.session.on("Network.webSocketFrameReceived", ({ response, timestamp }) => {
    const wire = response?.payloadData || "";
    pilot.cdp.inboundFrames += 1;
    pilot.cdp.inboundBytes += Buffer.byteLength(wire);
    try {
      const frame = JSON.parse(wire);
      if (["publicState", "ownerState", "rebase", "ack", "event"].includes(frame.type)) {
        if (pilot.privacyFrames.length >= 10000) throw new Error("bounded privacy-frame evidence exceeded");
        const serialized = frame.type === "publicState" ? JSON.stringify(frame.state) : "";
        pilot.privacyFrames.push({ direction: "inbound", timestamp, type: frame.type,
          playerId: frame.type === "ownerState" ? frame.playerId : undefined,
          membershipId: frame.type === "ownerState" ? frame.membershipId : undefined,
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

function clientLedger(pilot, ownerPlayerId) {
  const events = pilot.evidence;
  const inputs = new Map();
  const inputLatencies = [];
  const actions = new Map();
  const actionLatencies = [];
  const pulseEvents = [];
  const pairs = new Map();
  const alignedTimes = [];
  for (const event of events) {
    if (event.phase !== "active") continue;
    if (event.direction === "client-to-authority" && event.event === "released" && event.inputSeq) {
      inputs.set(event.inputSeq, event.actualMonoMs);
    }
    if (event.direction === "authority-to-client" && event.event === "application-delivered"
      && event.frameClass === "ack" && event.ackKind === "input" && event.inputSeq && inputs.has(event.inputSeq)) {
      inputLatencies.push(event.actualMonoMs - inputs.get(event.inputSeq));
    }
    if (event.direction === "client-to-authority" && event.event === "released" && event.frameClass === "action") {
      actions.set(event.actionId, { sentAt: event.actualMonoMs, outcomes: [] });
    }
    if (event.direction === "authority-to-client" && event.event === "application-delivered"
      && event.frameClass === "ack" && event.ackKind === "action" && actions.has(event.actionId)) {
      actions.get(event.actionId).outcomes.push(event);
    }
    if (event.direction === "authority-to-client" && event.event === "application-delivered"
      && event.frameClass === "event" && event.eventType === "player.pulse"
      && event.eventPlayerId === ownerPlayerId) {
      assert(Number.isSafeInteger(event.eventSeq), `${pilot.slot} pulse event lacked a safe event sequence`);
      pulseEvents.push({ eventSeq: event.eventSeq, actualMonoMs: event.actualMonoMs });
    }
    if (event.direction === "authority-to-client" && event.event === "application-delivered"
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
  alignedTimes.sort((a, b) => a - b);
  pulseEvents.sort((a, b) => a.actualMonoMs - b.actualMonoMs);
  assert(new Set(pulseEvents.map((event) => event.eventSeq)).size === pulseEvents.length,
    `${pilot.slot} observed duplicate pulse event sequences`);
  let pulseIndex = 0;
  for (const action of [...actions.values()].sort((left, right) => left.sentAt - right.sentAt)) {
    const outcome = action.outcomes[0];
    if (!outcome) continue;
    let settledAt = outcome.actualMonoMs;
    if (outcome.status === "accepted") {
      while (pulseIndex < pulseEvents.length && pulseEvents[pulseIndex].actualMonoMs < action.sentAt) pulseIndex += 1;
      if (pulseIndex < pulseEvents.length) settledAt = Math.max(settledAt, pulseEvents[pulseIndex++].actualMonoMs);
      else settledAt = Number.POSITIVE_INFINITY;
    }
    actionLatencies.push(settledAt - action.sentAt);
  }
  const cadence = alignedTimes.slice(1).map((at, index) => at - alignedTimes[index]);
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

async function runF0Cohort(options) {
  const { fixture, compiled, runDir, htmlTarget = "index-a.html", signal } = options;
  const scenario = fixture.scenarios["F0-clean"];
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
    assert(new Set(initial.map((state) => state.runId)).size === 1, "F0 cohort did not share one run");
    assert(new Set(initial.map((state) => state.clientId)).size === 4, "F0 authority players were not unique");
    assert(new Set(initial.map((state) => state.membershipId)).size === 4, "F0 memberships were not unique");
    assert(new Set(initial.map((state) => state.owner?.profileId)).size === 4, "F0 profiles were not unique");
    const slotMap = initial.map((state, index) => ({ pilotSlot: `pilot-${index}`,
      playerHash: hashId(state.clientId), membershipHash: hashId(state.membershipId),
      profileHash: hashId(state.owner?.profileId), connectionEpoch: state.connectionEpoch }));
    expectedSlotMap = slotMap;
    writePartialResult("cohort-admitted", { slotMap });
    const startWallMs = Date.now() + 1500;
    fs.writeFileSync(controlFile, `${JSON.stringify({ startWallMs })}\n`, { flag: "wx" });
    const timelines = await Promise.all(resources.pilots.map((pilot) => pilot.page.evaluate(
      (start) => window.__LBH_FRAME_IMPAIRMENT__.start(start), startWallMs)));
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
        assert(health.session?.overloadState === "NORMAL", `F0 authority left NORMAL: ${health.session?.overloadState}`);
        assert(accounting.costDistributions.simTickMs.count > 0
          && accounting.costDistributions.simTickMs.totalObserved > 0
          && accounting.costDistributions.projectionReplicationMs.count > 0,
        "Authority quantile distributions have no observations");
        const pressure = health.multiplayer.adapter.pressure;
        assert(pressure.maxima.wsBufferedBytes.worstConnection < pressure.policy.transportHighWaterBytes,
          "F0 crossed WebSocket high water");
        assert(pressure.maxima.queuedBytes.worstConnection <= pressure.policy.applicationQueueBytes
          && pressure.maxima.reliableBytes.worstConnection <= pressure.policy.reliableQueueBytes
          && pressure.maxima.replayEventBytes.worstConnection <= pressure.policy.replayEventBytes
          && pressure.maxima.pendingInboundBytes.worstConnection <= pressure.policy.inboundPendingBytes,
        "F0 exceeded an adapter pressure policy bound");
        assert(pressure.policy.connectionsCrossedTransportHighWater === 0
          && pressure.policy.connectionsHitQueuePolicy === 0,
        "F0 unexpectedly crossed a transport or queue policy");
        appendJsonl(authorityFile, { sampledAt, tick: health.tick, mode: health.session?.overloadState,
          process: health.process, pressure: health.multiplayer.adapter.pressure,
          costDistributions: accounting.costDistributions });
        await sleep(1000, signal);
      }
    })().catch((error) => { samplingError = error; sampling = false; });
    const warmupCapture = await capture(resources.pilots[0], runDir, "f0-warmup-host");
    await sleep(Math.max(0, startWallMs - Date.now()) + scenario.warmupMs + 2000, signal);
    if (samplingError) throw samplingError;
    for (const pilot of resources.pilots) await tap(pilot.page, "KeyE", "e", 50);
    await sleep(10000, signal);
    if (samplingError) throw samplingError;
    for (const pilot of resources.pilots) await tap(pilot.page, "KeyE", "e", 50);
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
      await capture(resources.pilots[0], runDir, "f0-recovery-host"),
      await capture(resources.pilots[3], runDir, "f0-recovery-pilot-3")];
    sampling = false;
    await samplingTask;
    for (const pilot of resources.pilots) {
      const drained = await pilot.page.evaluate(() => window.__LBH_FRAME_IMPAIRMENT__.drain());
      pilot.evidence.push(...drained);
      for (const event of drained) appendJsonl(clientEvidenceFile, sanitizeFrameEvidence(event));
    }
    const final = await Promise.all(resources.pilots.map(journeyState));
    const privacy = resources.pilots.map((pilot, index) => scanPrivacy(pilot, {
      ownerPlayerId: final[index].clientId, membershipId: final[index].membershipId,
    }));
    const ledgers = resources.pilots.map((pilot, index) => clientLedger(pilot, final[index].clientId));
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
      for (const error of [...pilot.pageErrors, ...pilot.consoleErrors, ...pilot.rewriteErrors,
        ...pilot.networkFailures.map((entry) => `${entry.status} ${entry.url}`)]) {
        appendJsonl(errorFile, { pilotSlot: pilot.slot, error });
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
        assert(action.outcomes.length === 1, `${resources.pilots[index].slot} action ${actionId} outcomes=${action.outcomes.length}`);
      }
      assert(final[index].transport.reconnectCount === 0, `${resources.pilots[index].slot} unexpectedly reconnected`);
      const rebases = resources.pilots[index].privacyFrames.filter((frame) => frame.direction === "inbound"
        && frame.type === "rebase").length;
      assert(rebases === 1, `${resources.pilots[index].slot} had ${Math.max(0, rebases - 1)} post-admission rebases`);
      const inboundAckKinds = new Set(resources.pilots[index].privacyFrames.filter((frame) => frame.direction === "inbound"
        && frame.type === "ack").map((frame) => frame.ackKind));
      const outboundAckKinds = new Set(resources.pilots[index].privacyFrames.filter((frame) => frame.direction === "outbound"
        && frame.type === "ack").map((frame) => frame.ackKind));
      assert(inboundAckKinds.has("input") && inboundAckKinds.has("action")
        && outboundAckKinds.has("delivery") && outboundAckKinds.has("event") && outboundAckKinds.has("baseline"),
      `${resources.pilots[index].slot} did not preserve distinct ACK kinds`);
      assert(resources.pilots[index].hotHttp.length === 0, `${resources.pilots[index].slot} used hot HTTP`);
      assert(resources.pilots[index].pageErrors.length === 0 && resources.pilots[index].consoleErrors.length === 0
        && resources.pilots[index].rewriteErrors.length === 0 && resources.pilots[index].networkFailures.length === 0,
        `${resources.pilots[index].slot} browser/rewrite errors`);
      const acceptedPulses = [...ledgers[index].actions.values()].filter((action) =>
        action.outcomes[0]?.status === "accepted").length;
      const oracleSequences = authorityPulseEvents.get(final[index].clientId) || new Set();
      const clientSequences = new Set(ledgers[index].pulseEvents.map((event) => event.eventSeq));
      assert(oracleSequences.size === acceptedPulses && clientSequences.size === acceptedPulses
        && [...oracleSequences].every((sequence) => clientSequences.has(sequence)),
      `${resources.pilots[index].slot} pulse outcomes and consequences differ`);
    }
    return { startedAt, completedAt: Date.now(), staticPort, simPort, slotMap, timelines, screenshots,
      privacy, clientSummaries: ledgers.map((entry) => entry.summary), cdp: resources.pilots.map((pilot) => pilot.cdp),
      pulseConsequences: final.map((state) => authorityPulseEvents.get(state.clientId)?.size || 0),
      processes: { staticPid: resources.staticServer.pid, simPid: lastHealth?.process?.pid || null,
        browserPids: resources.pilots.map((pilot) => pilot.browser.proc?.pid || null) },
      profileDirectories: resources.pilots.map((pilot) => pilot.browser.userDataDir),
      activation: { browserRewriteCounts: resources.pilots.map((pilot) => pilot.rewriter.status().rewrites) },
      scope: "pr-smoke application-frame evidence; not canonical duration, memory slope, TCP, WAN, TLS, or packet loss" };
  } finally {
    sampling = false;
    await samplingTask?.catch(() => null);
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
      preloadStoppedClean: serverStops.at(-1)?.pending === 0,
      preloadFailuresAbsent: preloadFailures.length === 0,
    };
    fs.writeFileSync(path.join(runDir, "cleanup.json"), `${JSON.stringify(cleanup, null, 2)}\n`, { flag: "wx" });
    releaseLock();
    assert(Object.entries(cleanup).every(([, value]) => value === true || value === 0),
      `F0 cleanup failed: ${JSON.stringify(cleanup)}`);
  }
}

module.exports = { runF0Cohort, percentile };
