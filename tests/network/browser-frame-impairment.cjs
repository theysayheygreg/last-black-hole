"use strict";

const crypto = require("crypto");
const fs = require("fs");
const { createSplitMix64 } = require("./seeded-frame-scheduler.cjs");

const UINT53 = Number(0x20_0000_0000_0000n);

const PHASES = Object.freeze(["warmup", "active", "recovery"]);
const DIRECTIONS = Object.freeze(["client-to-authority", "authority-to-client"]);

function sha256(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function compileDecisionBook(fixture, scenarioId) {
  const scenario = fixture.scenarios?.[scenarioId];
  if (!scenario) throw new Error(`Unknown impairment scenario ${scenarioId}`);
  const streams = {};
  const derivedSeeds = {};
  for (let pilot = 0; pilot < scenario.players; pilot += 1) {
    for (const phase of PHASES) {
      for (const direction of DIRECTIONS) {
        const capacities = { ...fixture.decisionCapacity, ...(scenario.decisionCapacity || {}) };
        for (let epochOrdinal = 1; epochOrdinal <= Number(scenario.connectionEpochs || 1); epochOrdinal += 1) {
          for (const [frameClass, capacity] of Object.entries(capacities)) {
            const key = [fixture.scenarioVersion, scenarioId, `pilot-${pilot}`, phase, direction,
              frameClass, epochOrdinal].join("|");
            derivedSeeds[key] = scenario.rules.faults
              ? (BigInt(scenario.rootSeed) ^ crypto.createHash("sha256").update(key).digest().readBigUInt64BE(0))
                .toString(16).padStart(16, "0")
              : sha256(`${scenario.rootSeed}|${key}`).slice(0, 16);
            const next64 = createSplitMix64(BigInt(`0x${derivedSeeds[key]}`));
            const directionRule = scenario.rules.directions?.[direction] || scenario.rules;
            const impaired = !scenario.impairPhases || scenario.impairPhases.includes(phase);
            const baseDelayMs = impaired ? Number(directionRule.delayMs || 0) : 0;
            const jitterMs = impaired ? Number(directionRule.jitterMs || 0) : 0;
            streams[key] = Array.from({ length: capacity }, (_unused, streamOrdinal) => {
              if (!scenario.rules.faults) {
                const draw = Number(next64() >> 11n) / UINT53;
                const jitter = jitterMs === 0 ? 0 : Math.floor(draw * ((jitterMs * 2) + 1)) - jitterMs;
                return {
                  streamOrdinal,
                  copies: scenario.rules.copies,
                  baseDelayMs,
                  jitterMs,
                  delayMs: baseDelayMs + jitter,
                  omitted: scenario.rules.omitted,
                };
              }
              const faultRule = impaired
                ? (scenario.rules.faults?.[`pilot-${pilot}`]?.[direction]?.[frameClass] || {}) : {};
              const jitterDraw = Number(next64() >> 11n) / UINT53;
              const omitDraw = Number(next64() >> 11n) / UINT53;
              const duplicateDraw = Number(next64() >> 11n) / UINT53;
              const reorderDraw = Number(next64() >> 11n) / UINT53;
              const jitter = jitterMs === 0 ? 0 : Math.floor(jitterDraw * ((jitterMs * 2) + 1)) - jitterMs;
              const omitted = Boolean(scenario.rules.omitted) || omitDraw < Number(faultRule.omitRate || 0);
              const copies = omitted ? 0
                : (duplicateDraw < Number(faultRule.duplicateRate || 0) ? 2 : Number(scenario.rules.copies || 1));
              const reorderWindow = Number(faultRule.reorderWindow || 0);
              return {
                streamOrdinal,
                copies,
                baseDelayMs,
                jitterMs,
                delayMs: baseDelayMs + jitter,
                omitted,
                reorderWindow,
                reorderGroup: reorderWindow === 0 ? null : (faultRule.reorderGroup || null),
                maxBlockHoldMs: reorderWindow === 0 ? 0 : Number(faultRule.maxBlockHoldMs || 250),
                reorderBlock: reorderWindow === 0 ? streamOrdinal : Math.floor(streamOrdinal / (reorderWindow + 1)),
                reorderOffset: reorderWindow === 0 ? 0 : Math.floor(reorderDraw * (reorderWindow + 1)),
              };
            });
          }
        }
      }
    }
  }
  const book = {
    schemaVersion: 1,
    scenarioVersion: fixture.scenarioVersion,
    scenarioId,
    profile: scenario.profile,
    rootSeed: scenario.rootSeed,
    phases: {
      warmupMs: scenario.warmupMs,
      activeMs: scenario.activeMs,
      recoveryMs: scenario.recoveryMs,
    },
    derivedSeeds,
    streams,
  };
  return { book, hash: sha256(JSON.stringify(book)) };
}

function browserInitSource({ pilotSlot, decisionBook }) {
  const slot = String(pilotSlot);
  const browserBook = {
    ...decisionBook,
    derivedSeeds: Object.fromEntries(Object.entries(decisionBook.derivedSeeds)
      .filter(([key]) => key.includes(`|${slot}|`) && key.includes("|client-to-authority|"))),
    streams: Object.fromEntries(Object.entries(decisionBook.streams)
      .filter(([key]) => key.includes(`|${slot}|`) && key.includes("|client-to-authority|"))),
  };
  const book = JSON.stringify(browserBook);
  return `(() => {
    "use strict";
    const pilotSlot = ${JSON.stringify(slot)};
    const book = ${book};
    const queue = [];
    const ordinals = new Map();
    const blockCounts = new Map();
    const blockReleaseTimes = new Map();
    const blockFirstAt = new Map();
    const blockMaxHold = new Map();
    const blockPhases = new Map();
    const groupOrdinals = new Map();
    const evidence = [];
    let timeline = null;
    let stopped = false;
    let epochOrdinal = 1;
    let nextEnqueueOrdinal = 0;
    const boundedPush = (entry) => {
      if (evidence.length >= 200000) throw new Error("browser impairment evidence capacity exceeded");
      evidence.push(entry);
    };
    const classify = (wire) => {
      try {
        const frame = JSON.parse(wire);
        return {
          frameClass: typeof frame.type === "string" ? frame.type : "unknown",
          ackKind: frame.ackKind,
          inputSeq: Number.isSafeInteger(frame.inputSeq) ? frame.inputSeq : undefined,
          actionId: typeof frame.actionId === "string" ? frame.actionId : undefined,
          actionSeq: Number.isSafeInteger(frame.actionSeq) ? frame.actionSeq : undefined,
          commandSeq: Number.isSafeInteger(frame.commandSeq) ? frame.commandSeq : undefined,
          deliveryId: Number.isSafeInteger(frame.deliveryId) ? frame.deliveryId : undefined,
          eventSeq: Number.isSafeInteger(frame.eventSeq) ? frame.eventSeq : undefined,
          snapshotId: Number.isSafeInteger(frame.snapshotId) ? frame.snapshotId : undefined,
          eventType: typeof frame.eventType === "string" ? frame.eventType : undefined,
          eventPlayerId: typeof frame.payload?.clientId === "string" ? frame.payload.clientId : undefined,
          connectionEpoch: Number.isSafeInteger(frame.connectionEpoch) ? frame.connectionEpoch : undefined,
          status: typeof frame.status === "string" ? frame.status : undefined,
          byteLength: new TextEncoder().encode(wire).byteLength,
        };
      } catch {
        return { frameClass: "unknown", byteLength: String(wire).length };
      }
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
          boundedPush({ ...item.record, event: "copy-delivered", copyIndex: copy,
            actualMonoMs: performance.now(), delivered: copyDelivered,
            blockHoldMs: now - blockFirstAt.get(item.streamBlockKey) });
        }
        boundedPush({ ...item.record, event: "released", actualMonoMs: now,
          overshootMs: Math.max(0, now - item.releaseAtMs), copies: item.decision.copies, delivered });
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
    const schedule = (wire, metadata, deliver) => {
      if (stopped) return false;
      const now = performance.now();
      const parsed = classify(wire);
      const direction = metadata?.direction || "unknown";
      const phase = phaseAt(now);
      const record = { atMonoMs: now, pilotSlot, phase, direction, connectionEpochOrdinal: epochOrdinal,
        ...parsed };
      if (direction === "authority-to-client") {
        boundedPush({ ...record, event: "native-arrival" });
        const delivered = deliver() !== false;
        boundedPush({ ...record, event: "application-delivered", delivered, actualMonoMs: performance.now() });
        return { accepted: true, deliveryCount: 1 };
      }
      if (phase === "admission" || phase === "complete") {
        const delivered = deliver() !== false;
        boundedPush({ ...record, event: "immediate", delivered, actualMonoMs: performance.now() });
        return { accepted: true, deliveryCount: 1 };
      }
      const requestedClass = parsed.frameClass === "ack" && parsed.ackKind
        ? "ack:" + parsed.ackKind : parsed.frameClass;
      const exactKey = [book.scenarioVersion, book.scenarioId, pilotSlot, phase, direction, requestedClass, epochOrdinal].join("|");
      const baseKey = [book.scenarioVersion, book.scenarioId, pilotSlot, phase, direction, parsed.frameClass, epochOrdinal].join("|");
      const decisionClass = Object.prototype.hasOwnProperty.call(book.streams, exactKey)
        ? requestedClass : (Object.prototype.hasOwnProperty.call(book.streams, baseKey) ? parsed.frameClass : "unknown");
      const key = [book.scenarioVersion, book.scenarioId, pilotSlot, phase, direction, decisionClass, epochOrdinal].join("|");
      const ordinal = ordinals.get(key) || 0;
      const decisions = book.streams[key];
      const compiledDecision = decisions?.[ordinal];
      if (!compiledDecision) throw new Error("compiled decision exhaustion: " + key + "#" + ordinal);
      ordinals.set(key, ordinal + 1);
      let decision = { reorderWindow: 0, reorderBlock: ordinal, reorderOffset: 0,
        maxBlockHoldMs: 0, reorderGroup: null, ...compiledDecision };
      let blockDomain = key;
      if (decision.reorderGroup) {
        blockDomain = [pilotSlot, phase, direction, decision.reorderGroup].join("|");
        const groupOrdinal = groupOrdinals.get(blockDomain) || 0;
        groupOrdinals.set(blockDomain, groupOrdinal + 1);
        decision = { ...decision, reorderOrdinal: groupOrdinal,
          reorderBlock: Math.floor(groupOrdinal / (decision.reorderWindow + 1)) };
      }
      const streamBlockKey = blockDomain + "|" + decision.reorderBlock;
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
      boundedPush({ ...item.record, event: decision.omitted ? "omitted" : "queued" });
      if (!decision.omitted && decision.copies > 0) queue.push(item);
      if (decision.omitted && blockCounts.get(streamBlockKey) >= decision.reorderWindow + 1
        && !queue.some((queued) => queued.streamBlockKey === streamBlockKey)) {
        blockCounts.delete(streamBlockKey); blockReleaseTimes.delete(streamBlockKey); blockFirstAt.delete(streamBlockKey);
        blockMaxHold.delete(streamBlockKey); blockPhases.delete(streamBlockKey);
      }
      if (decision.delayMs === 0) releaseDue();
      return {
        accepted: true,
        deliveryCount: decision.omitted ? 0 : decision.copies,
        cancel() {
          if (!item.cancelled && !item.completed) boundedPush({ ...item.record, event: "cancelled", actualMonoMs: performance.now() });
          item.cancelled = true;
        },
      };
    };
    globalThis.__LBH_FRAME_IMPAIRMENT__ = Object.freeze({
      schedule,
      start(startWallMs) {
        const wallDelta = Number(startWallMs) - Date.now();
        timeline = { startWallMs: Number(startWallMs), startMonoMs: performance.now() + wallDelta };
        boundedPush({ event: "timeline", pilotSlot, startWallMs: timeline.startWallMs,
          startMonoMs: timeline.startMonoMs, installedMonoMs: performance.now() });
        return { ...timeline };
      },
      rotateEpoch() { epochOrdinal += 1; return epochOrdinal; },
      drain() { return evidence.splice(0, evidence.length); },
      status() { return { pilotSlot, queued: queue.length, blocks: blockCounts.size,
        evidence: evidence.length, epochOrdinal,
        phase: phaseAt(performance.now()), timeline }; },
      stop() {
        stopped = true;
        clearInterval(pump);
        for (const item of queue) item.cancelled = true;
        queue.length = 0;
        blockCounts.clear(); blockReleaseTimes.clear(); blockFirstAt.clear(); blockMaxHold.clear(); blockPhases.clear();
        return { stopped: true, pending: 0 };
      },
    });
  })();`;
}

async function installMainResponseRewrite(page, fixture, onError) {
  const expected = fixture.mainSource;
  let rewrites = 0;
  await page.session.send("Fetch.enable", {
    patterns: [
      { urlPattern: "*src/main.js*", requestStage: "Response" },
      { urlPattern: "*/favicon.ico", requestStage: "Request" },
    ],
  });
  page.session.on("Fetch.requestPaused", async (event) => {
    try {
      if (new URL(event.request.url).pathname === "/favicon.ico" && !event.responseStatusCode) {
        await page.session.send("Fetch.fulfillRequest", {
          requestId: event.requestId,
          responseCode: 204,
          responseHeaders: [{ name: "Content-Length", value: "0" }],
          body: "",
        });
        return;
      }
      if (!event.responseStatusCode || !new URL(event.request.url).pathname.endsWith("/src/main.js")) {
        await page.session.send("Fetch.continueRequest", { requestId: event.requestId });
        return;
      }
      const bodyResult = await page.session.send("Fetch.getResponseBody", { requestId: event.requestId });
      const source = bodyResult.base64Encoded
        ? Buffer.from(bodyResult.body, "base64").toString("utf8")
        : bodyResult.body;
      if (sha256(source) !== expected.sha256) throw new Error("src/main.js source hash changed; refusing in-memory rewrite");
      const occurrences = source.split(expected.constructor).length - 1;
      if (occurrences !== 1) throw new Error(`Expected exactly one SimClient constructor marker, found ${occurrences}`);
      const replacement = `simClient = new SimClient(simServerUrl, { transport: getConfiguredSimTransport(), scheduleStreamFrame: globalThis.__LBH_FRAME_IMPAIRMENT__?.schedule });
      globalThis.__LBH_CONSUMED_EVENTS__ = [];
      const __lbhConsumeEvents = simClient.consumeEvents.bind(simClient);
      simClient.consumeEvents = () => {
        const values = __lbhConsumeEvents();
        for (const value of values) {
          if (globalThis.__LBH_CONSUMED_EVENTS__.length >= 10000) throw new Error("consumed-event evidence capacity exceeded");
          globalThis.__LBH_CONSUMED_EVENTS__.push({ eventSeq: value.seq, eventType: value.type,
            eventPlayerId: value.payload?.clientId,
            actualMonoMs: performance.now(), phase: globalThis.__LBH_FRAME_IMPAIRMENT__?.status().phase });
        }
        return values;
      };`;
      const rewritten = source.replace(expected.constructor, replacement);
      const headers = (event.responseHeaders || []).filter((header) => header.name.toLowerCase() !== "content-length");
      await page.session.send("Fetch.fulfillRequest", {
        requestId: event.requestId,
        responseCode: event.responseStatusCode,
        responseHeaders: headers,
        body: Buffer.from(rewritten).toString("base64"),
      });
      rewrites += 1;
    } catch (error) {
      onError(error);
      try { await page.session.send("Fetch.failRequest", { requestId: event.requestId, errorReason: "Aborted" }); } catch {}
    }
  });
  return {
    assertRewritten() {
      if (rewrites !== 1) throw new Error(`Expected one in-memory main.js rewrite, observed ${rewrites}`);
    },
    status() { return { rewrites }; },
    async close() { await page.session.send("Fetch.disable").catch(() => null); },
  };
}

function writeCompiledDecisionBook(file, compiled) {
  fs.writeFileSync(file, `${JSON.stringify({ ...compiled.book, sha256: compiled.hash }, null, 2)}\n`, { flag: "wx" });
}

module.exports = {
  PHASES,
  DIRECTIONS,
  sha256,
  compileDecisionBook,
  browserInitSource,
  installMainResponseRewrite,
  writeCompiledDecisionBook,
};
