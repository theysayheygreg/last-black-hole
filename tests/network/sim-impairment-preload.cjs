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
  const blockCounts = new Map();
  const blockReleaseTimes = new Map();
  const blockFirstAt = new Map();
  const blockMaxHold = new Map();
  const blockPhases = new Map();
  const groupOrdinals = new Map();
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
  const blackoutAt = (now, pilotSlot) => {
    const rule = book.blackout;
    if (!timeline || !rule || pilotSlot !== rule.pilotSlot
      || !rule.directions.includes("authority-to-client")) return false;
    const elapsed = now - timeline.startMonoMs;
    return elapsed >= rule.startMs && elapsed < rule.endMs;
  };
  const releaseDue = () => {
    if (stopped) return;
    readControl();
    const now = performance.now();
    const currentPhase = phaseAt(now);
    const ready = queue.filter((item) => item.cancelled || (item.releaseAtMs <= now
      && (item.decision.reorderWindow === 0
        || blockCounts.get(item.streamBlockKey) >= item.decision.reorderWindow + 1
        || now - blockFirstAt.get(item.streamBlockKey) >= item.decision.maxBlockHoldMs
        || currentPhase !== item.record.phase)));
    ready.sort((left, right) => (blockReleaseTimes.get(left.streamBlockKey) || left.releaseAtMs)
      - (blockReleaseTimes.get(right.streamBlockKey) || right.releaseAtMs)
      || left.streamBlockKey.localeCompare(right.streamBlockKey)
      || left.decision.reorderOffset - right.decision.reorderOffset
      || left.enqueueOrdinal - right.enqueueOrdinal);
    for (const item of ready) {
      const index = queue.indexOf(item);
      if (index >= 0) queue.splice(index, 1);
      if (item.cancelled) continue;
      let delivered = false;
      for (let copy = 0; copy < item.decision.copies; copy += 1) {
        const copyDelivered = item.deliver() !== false;
        delivered = copyDelivered || delivered;
        append({ ...item.record, event: "copy-delivered", copyIndex: copy,
          actualMonoMs: performance.now(), delivered: copyDelivered,
          blockHoldMs: now - blockFirstAt.get(item.streamBlockKey) });
      }
      append({ ...item.record, event: "released", actualMonoMs: now,
        overshootMs: Math.max(0, now - item.releaseAtMs), delivered });
      item.completed = true;
    }
    for (const key of new Set(ready.map((item) => item.streamBlockKey))) {
      if (!queue.some((item) => item.streamBlockKey === key)) {
        blockCounts.delete(key);
        blockReleaseTimes.delete(key);
        blockFirstAt.delete(key);
        blockMaxHold.delete(key);
        blockPhases.delete(key);
      }
    }
    for (const [key, firstAt] of blockFirstAt) {
      if (!queue.some((item) => item.streamBlockKey === key)
        && (now - firstAt >= blockMaxHold.get(key) || currentPhase !== blockPhases.get(key))) {
        blockCounts.delete(key); blockReleaseTimes.delete(key); blockFirstAt.delete(key);
        blockMaxHold.delete(key); blockPhases.delete(key);
      }
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
      slots.set(identity, { slot, firstConnectionEpoch: context.connectionEpoch });
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
      wireHash: hash(wire),
      actionSeq: Number.isSafeInteger(frame.actionSeq) ? frame.actionSeq : undefined,
      commandSeq: Number.isSafeInteger(frame.commandSeq) ? frame.commandSeq : undefined,
      byteLength: Buffer.byteLength(wire),
    };
  };
  const schedule = (wire, context, deliver) => {
    if (stopped) return false;
    readControl();
    const now = performance.now();
    const slot = slotFor(context);
    const pilotSlot = slot.slot;
    const connectionEpochOrdinal = Number.isSafeInteger(context.connectionEpoch)
      && Number.isSafeInteger(slot.firstConnectionEpoch)
      ? 1 + context.connectionEpoch - slot.firstConnectionEpoch : 1;
    if (!Number.isSafeInteger(connectionEpochOrdinal) || connectionEpochOrdinal < 1) {
      throw new Error(`invalid server connection epoch ordinal for ${pilotSlot}`);
    }
    const phase = phaseAt(now);
    const parsed = classify(wire, context);
    const record = { atMonoMs: now, side: "authority", pilotSlot, phase,
      direction: "authority-to-client", connectionEpochOrdinal, ...parsed };
    if (blackoutAt(now, pilotSlot)) {
      append({ ...record, event: "blackout-discard", blackout: "discard", copies: 0,
        delivered: false, actualMonoMs: performance.now() });
      return { accepted: true, deliveryCount: 0 };
    }
    if (phase === "admission" || phase === "complete") {
      const delivered = deliver() !== false;
      append({ ...record, event: "immediate", actualMonoMs: performance.now(), delivered });
      return { accepted: true, deliveryCount: 1 };
    }
    const requestedClass = parsed.frameClass === "ack" && parsed.ackKind
      ? `ack:${parsed.ackKind}` : parsed.frameClass;
    const exactKey = [book.scenarioVersion, book.scenarioId, pilotSlot, phase,
      "authority-to-client", requestedClass, connectionEpochOrdinal].join("|");
    const baseKey = [book.scenarioVersion, book.scenarioId, pilotSlot, phase,
      "authority-to-client", parsed.frameClass, connectionEpochOrdinal].join("|");
    const decisionClass = book.streams[exactKey] ? requestedClass : (book.streams[baseKey] ? parsed.frameClass : "unknown");
    const key = [book.scenarioVersion, book.scenarioId, pilotSlot, phase,
      "authority-to-client", decisionClass, connectionEpochOrdinal].join("|");
    const ordinal = ordinals.get(key) || 0;
    const compiledDecision = book.streams[key]?.[ordinal];
    if (!compiledDecision) throw new Error(`server compiled decision exhaustion: ${key}#${ordinal}`);
    ordinals.set(key, ordinal + 1);
    let decision = { reorderWindow: 0, reorderBlock: ordinal, reorderOffset: 0,
      maxBlockHoldMs: 0, reorderGroup: null, ...compiledDecision };
    let blockDomain = key;
    if (decision.reorderGroup) {
      blockDomain = [pilotSlot, phase, "authority-to-client", decision.reorderGroup].join("|");
      const groupOrdinal = groupOrdinals.get(blockDomain) || 0;
      groupOrdinals.set(blockDomain, groupOrdinal + 1);
      decision = { ...decision, reorderOrdinal: groupOrdinal,
        reorderBlock: Math.floor(groupOrdinal / (decision.reorderWindow + 1)) };
    }
    const streamBlockKey = `${blockDomain}|${decision.reorderBlock}`;
    blockCounts.set(streamBlockKey, (blockCounts.get(streamBlockKey) || 0) + 1);
    if (!blockFirstAt.has(streamBlockKey)) blockFirstAt.set(streamBlockKey, now);
    blockMaxHold.set(streamBlockKey, decision.maxBlockHoldMs || 0);
    blockPhases.set(streamBlockKey, phase);
    blockReleaseTimes.set(streamBlockKey,
      Math.max(blockReleaseTimes.get(streamBlockKey) || 0, now + decision.delayMs));
    const item = { deliver, decision, cancelled: false, releaseAtMs: now + decision.delayMs,
      enqueueOrdinal: nextEnqueueOrdinal++, streamBlockKey,
      record: { ...record, decisionClass, streamOrdinal: ordinal, decision,
        scheduledReleaseMonoMs: now + decision.delayMs, enqueueOrdinal: nextEnqueueOrdinal - 1 } };
    append({ ...item.record, event: decision.omitted ? "omitted" : "queued" });
    if (!decision.omitted && decision.copies > 0) queue.push(item);
    if (decision.omitted && blockCounts.get(streamBlockKey) >= decision.reorderWindow + 1
      && !queue.some((queued) => queued.streamBlockKey === streamBlockKey)) {
      blockCounts.delete(streamBlockKey); blockReleaseTimes.delete(streamBlockKey); blockFirstAt.delete(streamBlockKey);
      blockMaxHold.delete(streamBlockKey); blockPhases.delete(streamBlockKey);
    }
    if (decision.delayMs === 0) releaseDue();
    return { accepted: true, deliveryCount: decision.omitted ? 0 : decision.copies,
      cancel() {
        if (!item.cancelled && !item.completed) append({ ...item.record, event: "cancelled", actualMonoMs: performance.now() });
        item.cancelled = true;
      } };
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
      const pendingBlocks = blockCounts.size;
      blockCounts.clear(); blockReleaseTimes.clear(); blockFirstAt.clear(); blockMaxHold.clear(); blockPhases.clear();
      append({ event: "scheduler-stop", side: "authority", pending: 0, pendingBlocks });
      flushEvidence();
    },
  };
}
