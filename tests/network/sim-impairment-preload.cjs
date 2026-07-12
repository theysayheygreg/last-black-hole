"use strict";

const crypto = require("crypto");
const fs = require("fs");
const { performance } = require("perf_hooks");

const configFile = process.env.LBH_IMPAIRMENT_PRELOAD_CONFIG;
if (configFile) install(configFile);

function install(file) {
  const config = JSON.parse(fs.readFileSync(file, "utf8"));
  fs.appendFileSync(config.serverEvidenceFile, `${JSON.stringify({ event: "preload-installed", pid: process.pid })}\n`);
  const compiled = JSON.parse(fs.readFileSync(config.compiledDecisionFile, "utf8"));
  const expectedHash = compiled.sha256;
  delete compiled.sha256;
  const actualHash = crypto.createHash("sha256").update(JSON.stringify(compiled)).digest("hex");
  if (actualHash !== expectedHash || actualHash !== config.compiledDecisionHash) {
    throw new Error("sim impairment compiled decision hash mismatch");
  }
  const adapterPath = require.resolve("../../scripts/sim-ws-adapter.cjs");
  const adapterModule = require(adapterPath);
  const createAdapter = adapterModule.createSimWebSocketAdapter;
  let installed = false;
  adapterModule.createSimWebSocketAdapter = function createInstrumentedAdapter(options) {
    if (installed) throw new Error("sim impairment preload supports exactly one adapter");
    installed = true;
    fs.appendFileSync(config.serverEvidenceFile, `${JSON.stringify({ event: "adapter-wrap", pid: process.pid })}\n`);
    const seam = createServerSeam(config, compiled);
    const adapter = createAdapter({ ...options, scheduleOutboundFrame: seam.schedule });
    return Object.freeze({
      ...adapter,
      async shutdown() {
        let diagnostics = null;
        try { diagnostics = await adapter.shutdown(); }
        catch (error) { seam.recordFailure(`adapter shutdown: ${error.message}`); }
        try { seam.stop(); }
        catch (error) {
          try { fs.appendFileSync(config.serverEvidenceFile,
            `${JSON.stringify({ event: "scheduler-stop-failure", message: error.message })}\n`); } catch {}
        }
        return diagnostics || adapter.diagnostics();
      },
    });
  };
}

function createServerSeam(config, book) {
  const queue = [];
  const ordinals = new Map();
  const slots = new Map();
  let nextSlot = 0;
  let timeline = null;
  let stopped = false;
  let lastControlMtime = -1;
  let nextEnqueueOrdinal = 0;
  const evidence = [];
  const append = (entry) => {
    if (evidence.length >= 200000) throw new Error("sim impairment evidence capacity exceeded");
    evidence.push(entry);
  };
  const flushEvidence = () => {
    if (evidence.length === 0) return;
    const batch = evidence.splice(0, evidence.length).map((entry) => JSON.stringify(entry)).join("\n");
    fs.appendFileSync(config.serverEvidenceFile, `${batch}\n`);
  };
  const hash = (value) => crypto.createHash("sha256").update(String(value)).digest("hex");
  const readControl = () => {
    try {
      const stat = fs.statSync(config.controlFile);
      if (stat.mtimeMs === lastControlMtime) return;
      lastControlMtime = stat.mtimeMs;
      const control = JSON.parse(fs.readFileSync(config.controlFile, "utf8"));
      if (Number.isFinite(control.startWallMs)) {
        timeline = { startWallMs: control.startWallMs,
          startMonoMs: performance.now() + (control.startWallMs - Date.now()) };
        append({ event: "timeline", side: "authority", startWallMs: timeline.startWallMs,
          startMonoMs: timeline.startMonoMs, installedMonoMs: performance.now() });
      }
    } catch {}
  };
  const phaseAt = (now) => {
    if (!timeline || now < timeline.startMonoMs) return "admission";
    const elapsed = now - timeline.startMonoMs;
    if (elapsed < book.phases.warmupMs) return "warmup";
    if (elapsed < book.phases.warmupMs + book.phases.activeMs) return "active";
    if (elapsed < book.phases.warmupMs + book.phases.activeMs + book.phases.recoveryMs) return "recovery";
    return "complete";
  };
  const releaseDue = () => {
    if (stopped) return;
    readControl();
    const now = performance.now();
    queue.sort((left, right) => left.releaseAtMs - right.releaseAtMs
      || left.enqueueOrdinal - right.enqueueOrdinal);
    while (queue.length > 0) {
      const item = queue[0];
      if (!item.cancelled && item.releaseAtMs > now) break;
      queue.shift();
      if (item.cancelled) continue;
      let delivered = false;
      for (let copy = 0; copy < item.decision.copies; copy += 1) delivered = item.deliver() !== false || delivered;
      append({ ...item.record, event: "released", actualMonoMs: now,
        overshootMs: Math.max(0, now - item.releaseAtMs), delivered });
    }
  };
  const pump = setInterval(releaseDue, 5);
  pump.unref?.();
  const evidencePump = setInterval(flushEvidence, 250);
  evidencePump.unref?.();
  const slotFor = (context) => {
    const identity = context.playerId || context.membershipId || `pending-${context.schedulerConnectionId}`;
    if (!slots.has(identity)) {
      if (nextSlot >= 4) throw new Error("server impairment observed more than four stable pilots");
      const slot = `pilot-${nextSlot++}`;
      slots.set(identity, slot);
      append({ event: "slot-map", pilotSlot: slot, runtimeIdentityHash: hash(identity) });
    }
    return slots.get(identity);
  };
  const classify = (wire, context) => {
    let frame = {};
    try { frame = JSON.parse(wire); } catch {}
    const semantic = frame.deliveryId ?? frame.actionId ?? frame.eventSeq ?? frame.snapshotId ?? frame.inputSeq;
    return {
      frameClass: context.frameClass || frame.type || "unknown",
      ackKind: frame.ackKind,
      semanticIdHash: semantic === undefined ? undefined : hash(semantic),
      byteLength: Buffer.byteLength(wire),
    };
  };
  const schedule = (wire, context, deliver) => {
    if (stopped) return false;
    readControl();
    const now = performance.now();
    const pilotSlot = slotFor(context);
    const phase = phaseAt(now);
    const parsed = classify(wire, context);
    const record = { atMonoMs: now, side: "authority", pilotSlot, phase,
      direction: "authority-to-client", connectionEpochOrdinal: 1, ...parsed };
    if (phase === "admission" || phase === "complete") {
      const delivered = deliver() !== false;
      append({ ...record, event: "immediate", actualMonoMs: performance.now(), delivered });
      return { accepted: true, deliveryCount: 1 };
    }
    const requestedClass = parsed.frameClass;
    const exactKey = [book.scenarioVersion, book.scenarioId, pilotSlot, phase,
      "authority-to-client", requestedClass, 1].join("|");
    const frameClass = book.streams[exactKey] ? requestedClass : "unknown";
    const key = [book.scenarioVersion, book.scenarioId, pilotSlot, phase,
      "authority-to-client", frameClass, 1].join("|");
    const ordinal = ordinals.get(key) || 0;
    const decision = book.streams[key]?.[ordinal];
    if (!decision) throw new Error(`server compiled decision exhaustion: ${key}#${ordinal}`);
    ordinals.set(key, ordinal + 1);
    const item = { deliver, decision, cancelled: false, releaseAtMs: now + decision.delayMs,
      enqueueOrdinal: nextEnqueueOrdinal++,
      record: { ...record, frameClass, streamOrdinal: ordinal, decision,
        scheduledReleaseMonoMs: now + decision.delayMs, enqueueOrdinal: nextEnqueueOrdinal - 1 } };
    append({ ...item.record, event: decision.omitted ? "omitted" : "queued" });
    if (!decision.omitted && decision.copies > 0) queue.push(item);
    if (decision.delayMs === 0) releaseDue();
    return { accepted: true, deliveryCount: decision.omitted ? 0 : decision.copies,
      cancel() { item.cancelled = true; } };
  };
  return {
    schedule,
    recordFailure(message) { append({ event: "preload-failure", message: String(message).slice(0, 256) }); },
    stop() {
      stopped = true;
      clearInterval(pump);
      clearInterval(evidencePump);
      for (const item of queue) item.cancelled = true;
      queue.length = 0;
      append({ event: "scheduler-stop", side: "authority", pending: 0 });
      flushEvidence();
    },
  };
}
