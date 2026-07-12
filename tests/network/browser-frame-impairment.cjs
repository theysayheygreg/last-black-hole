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
        for (const [frameClass, capacity] of Object.entries(fixture.decisionCapacity)) {
          const key = [fixture.scenarioVersion, scenarioId, `pilot-${pilot}`, phase, direction, frameClass, 1].join("|");
          derivedSeeds[key] = sha256(`${scenario.rootSeed}|${key}`).slice(0, 16);
          const next64 = createSplitMix64(BigInt(`0x${derivedSeeds[key]}`));
          const directionRule = scenario.rules.directions?.[direction] || scenario.rules;
          const impaired = !scenario.impairPhases || scenario.impairPhases.includes(phase);
          const baseDelayMs = impaired ? Number(directionRule.delayMs || 0) : 0;
          const jitterMs = impaired ? Number(directionRule.jitterMs || 0) : 0;
          streams[key] = Array.from({ length: capacity }, (_unused, streamOrdinal) => {
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
          });
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
          deliveryId: Number.isSafeInteger(frame.deliveryId) ? frame.deliveryId : undefined,
          eventSeq: Number.isSafeInteger(frame.eventSeq) ? frame.eventSeq : undefined,
          snapshotId: Number.isSafeInteger(frame.snapshotId) ? frame.snapshotId : undefined,
          eventType: typeof frame.eventType === "string" ? frame.eventType : undefined,
          eventPlayerId: typeof frame.payload?.clientId === "string" ? frame.payload.clientId : undefined,
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
      queue.sort((left, right) => left.releaseAtMs - right.releaseAtMs
        || left.enqueueOrdinal - right.enqueueOrdinal);
      while (queue.length > 0) {
        const item = queue[0];
        if (!item.cancelled && item.releaseAtMs > now) break;
        queue.shift();
        if (item.cancelled) continue;
        let delivered = false;
        for (let copy = 0; copy < item.decision.copies; copy += 1) delivered = item.deliver() !== false || delivered;
        boundedPush({ ...item.record, event: "released", actualMonoMs: now,
          overshootMs: Math.max(0, now - item.releaseAtMs), copies: item.decision.copies, delivered });
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
      const frameClass = Object.prototype.hasOwnProperty.call(book.streams,
        [book.scenarioVersion, book.scenarioId, pilotSlot, phase, direction, parsed.frameClass, epochOrdinal].join("|"))
        ? parsed.frameClass : "unknown";
      const key = [book.scenarioVersion, book.scenarioId, pilotSlot, phase, direction, frameClass, epochOrdinal].join("|");
      const ordinal = ordinals.get(key) || 0;
      const decisions = book.streams[key];
      const decision = decisions?.[ordinal];
      if (!decision) throw new Error("compiled decision exhaustion: " + key + "#" + ordinal);
      ordinals.set(key, ordinal + 1);
      const item = { deliver, decision, cancelled: false, releaseAtMs: now + decision.delayMs,
        enqueueOrdinal: nextEnqueueOrdinal++,
        record: { ...record, frameClass, streamOrdinal: ordinal, decision,
          scheduledReleaseMonoMs: now + decision.delayMs, enqueueOrdinal: nextEnqueueOrdinal - 1 } };
      boundedPush({ ...item.record, event: decision.omitted ? "omitted" : "queued" });
      if (!decision.omitted && decision.copies > 0) queue.push(item);
      if (decision.delayMs === 0) releaseDue();
      return {
        accepted: true,
        deliveryCount: decision.omitted ? 0 : decision.copies,
        cancel() { item.cancelled = true; },
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
      status() { return { pilotSlot, queued: queue.length, evidence: evidence.length, epochOrdinal,
        phase: phaseAt(performance.now()), timeline }; },
      stop() {
        stopped = true;
        clearInterval(pump);
        for (const item of queue) item.cancelled = true;
        queue.length = 0;
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
      const replacement = "simClient = new SimClient(simServerUrl, { transport: getConfiguredSimTransport(), scheduleStreamFrame: globalThis.__LBH_FRAME_IMPAIRMENT__?.schedule });";
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
