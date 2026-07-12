"use strict";

const crypto = require("crypto");

const MASK_64 = (1n << 64n) - 1n;
const UINT53 = 0x20_0000_0000_0000n;

function stableStringify(value) {
  if (value === undefined || typeof value === "function" || typeof value === "symbol") {
    throw new TypeError("value is not strict JSON");
  }
  if (typeof value === "number" && !Number.isFinite(value)) throw new TypeError("value is not strict JSON");
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) {
    if (Object.keys(value).length !== value.length) throw new TypeError("sparse arrays are not strict JSON");
    return `[${value.map(stableStringify).join(",")}]`;
  }
  return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`).join(",")}}`;
}

function hash64(text) {
  const bytes = crypto.createHash("sha256").update(text).digest();
  return bytes.readBigUInt64BE(0);
}

function encodeDomain(parts) {
  return parts.map((part) => {
    const value = String(part ?? "");
    return `${Buffer.byteLength(value, "utf8")}:${value}`;
  }).join("|");
}

// SplitMix64 is specified here rather than delegated to a runtime RNG so tapes
// remain portable between Node versions and host architectures.
function createSplitMix64(seed) {
  let state = BigInt.asUintN(64, seed);
  return () => {
    state = (state + 0x9e3779b97f4a7c15n) & MASK_64;
    let value = state;
    value = ((value ^ (value >> 30n)) * 0xbf58476d1ce4e5b9n) & MASK_64;
    value = ((value ^ (value >> 27n)) * 0x94d049bb133111ebn) & MASK_64;
    return (value ^ (value >> 31n)) & MASK_64;
  };
}

function toUnit(next64) {
  return Number(next64() >> 11n) / Number(UINT53);
}

function normalizeSeed(seed) {
  if (typeof seed === "bigint") return BigInt.asUintN(64, seed);
  if (typeof seed === "number" && Number.isSafeInteger(seed)) return BigInt.asUintN(64, BigInt(seed));
  if (typeof seed === "string" && /^(?:0x[\da-f]+|\d+)$/i.test(seed)) return BigInt.asUintN(64, BigInt(seed));
  throw new TypeError("rootSeed must be a bigint, safe integer, or integer string");
}

function boundedNumber(value, fallback, name) {
  const result = value === undefined ? fallback : value;
  if (!Number.isFinite(result) || result < 0) throw new RangeError(`${name} must be a finite non-negative number`);
  return result;
}

function integer(value, fallback, name) {
  const result = boundedNumber(value, fallback, name);
  if (!Number.isSafeInteger(result)) throw new RangeError(`${name} must be a non-negative safe integer`);
  return result;
}

function rate(value, fallback, name) {
  const result = boundedNumber(value, fallback, name);
  if (result > 1) throw new RangeError(`${name} must be between 0 and 1`);
  return result;
}

function ruleFor(rules, direction, frameClass) {
  const common = rules.default || {};
  const directional = rules[direction] || {};
  const classified = directional[frameClass] || {};
  return { ...common, ...(directional.default || {}), ...classified };
}

function redactMetadata(metadata) {
  const digest = (value) => value === undefined ? undefined
    : crypto.createHash("sha256").update(String(value)).digest("hex");
  return Object.fromEntries(Object.entries({
    cohort: metadata.cohort,
    playerHash: digest(metadata.playerId),
    membershipHash: digest(metadata.membershipId),
    connectionEpochHash: digest(metadata.connectionEpoch),
    direction: metadata.direction,
    frameClass: metadata.frameClass,
    frameType: metadata.frameType,
    semanticIdHash: digest(metadata.semanticId),
  }).filter(([, value]) => value !== undefined));
}

function createSeededFrameScheduler(options = {}) {
  const rootSeed = normalizeSeed(options.rootSeed ?? 0n);
  const rules = JSON.parse(JSON.stringify(options.rules || {}));
  const blackouts = JSON.parse(JSON.stringify(options.blackouts || [])).map((entry) => {
    if (!Number.isSafeInteger(entry.startMs) || !Number.isSafeInteger(entry.endMs) || entry.startMs < 0 || entry.endMs < entry.startMs) {
      throw new RangeError("blackout bounds must be integer, monotonic virtual milliseconds");
    }
    if (!['hold', 'discard'].includes(entry.mode)) throw new RangeError("blackout mode must be hold or discard");
    return { ...entry };
  });
  const controls = JSON.parse(JSON.stringify(options.controls || [])).map((entry, index) => {
    if (!Number.isSafeInteger(entry.atMs) || entry.atMs < 0) throw new RangeError("control atMs must be a non-negative integer");
    return { ...entry, index, emitted: false };
  });
  const maxItems = integer(options.maxItems, 4096, "maxItems");
  const maxBytes = integer(options.maxBytes, 8 * 1024 * 1024, "maxBytes");
  const maxEvidenceEntries = integer(options.maxEvidenceEntries, 1_000_000, "maxEvidenceEntries");
  const maxEvidenceBytes = integer(options.maxEvidenceBytes, 256 * 1024 * 1024, "maxEvidenceBytes");
  const scenarioHash = crypto.createHash("sha256").update(stableStringify({ rules, blackouts, controls: options.controls || [] })).digest("hex");
  const replaySerialized = options.replayTape ? JSON.stringify(options.replayTape) : null;
  if (replaySerialized && Buffer.byteLength(replaySerialized) > maxEvidenceBytes) throw new Error("decision tape exceeds evidence byte bound");
  const replayTape = replaySerialized ? JSON.parse(replaySerialized) : null;
  if (replayTape && (!Array.isArray(replayTape.decisions) || replayTape.decisions.length > maxEvidenceEntries)) {
    throw new Error("decision tape exceeds evidence entry bound");
  }
  if (replayTape && replayTape.version !== 1) throw new Error("unsupported decision tape version");
  if (replayTape && replayTape.rootSeed !== `0x${rootSeed.toString(16)}`) throw new Error("decision tape root seed mismatch");
  if (replayTape && replayTape.scenarioHash !== scenarioHash) throw new Error("decision tape scenario mismatch");
  const recorded = [];
  const streams = new Map();
  let tapeIndex = 0;
  let nowMs = integer(options.startMs, 0, "startMs");
  let nextOrdinal = 0;
  let queuedBytes = 0;
  let queue = [];
  let logs = [];
  let evidenceBytes = 0;
  const derivedStreams = new Map();
  const streamOrdinals = new Map();
  const epochStreamOrdinals = new Map();
  const activeEpochs = new Map();
  const blockCounts = new Map();
  const blockExpected = new Map();
  const blockReleaseTimes = new Map();
  const blockPeers = new Map();
  let terminalReason = null;

  function appendEvidence(logEntry, tapeEntry = null) {
    const addedBytes = Buffer.byteLength(JSON.stringify(logEntry))
      + (tapeEntry && !replayTape ? Buffer.byteLength(JSON.stringify(tapeEntry)) : 0);
    if (logs.length >= maxEvidenceEntries || (!replayTape && tapeEntry && recorded.length >= maxEvidenceEntries)
      || evidenceBytes + addedBytes > maxEvidenceBytes) {
      terminalReason = "seeded frame scheduler evidence bounds exceeded";
      throw new Error(terminalReason);
    }
    if (tapeEntry && !replayTape) recorded.push(tapeEntry);
    logs.push(logEntry);
    evidenceBytes += addedBytes;
  }

  function streamFor(metadata) {
    const key = encodeDomain(["lbh-frame-scheduler-v1", metadata.cohort,
      metadata.playerId || metadata.membershipId, metadata.direction, metadata.frameClass]);
    let stream = streams.get(key);
    if (!stream) {
      const derivedSeed = rootSeed ^ hash64(key);
      stream = createSplitMix64(derivedSeed);
      streams.set(key, stream);
      derivedStreams.set(crypto.createHash("sha256").update(key).digest("hex"), `0x${derivedSeed.toString(16)}`);
    }
    return { key, next64: stream };
  }

  function blackoutAt(time, metadata) {
    return blackouts.find((entry) => time >= entry.startMs && time < entry.endMs
      && (!entry.direction || entry.direction === metadata.direction)
      && (!entry.playerId || entry.playerId === metadata.playerId));
  }

  function makeDecision(metadata, payloadHash, byteLength, ordinal) {
    const { key, next64 } = streamFor(metadata);
    const streamOrdinal = streamOrdinals.get(key) || 0;
    streamOrdinals.set(key, streamOrdinal + 1);
    const epochStreamKey = `${key}|${String(metadata.connectionEpoch ?? "")}`;
    const reorderOrdinal = epochStreamOrdinals.get(epochStreamKey) || 0;
    epochStreamOrdinals.set(epochStreamKey, reorderOrdinal + 1);
    const selectedRule = ruleFor(rules, metadata.direction, metadata.frameClass);
    const fingerprint = crypto.createHash("sha256").update(stableStringify({
      key, metadata: redactMetadata(metadata), payloadHash, byteLength, streamOrdinal, reorderOrdinal,
    })).digest("hex");

    if (replayTape) {
      const entry = replayTape.decisions[tapeIndex++];
      if (!entry || entry.fingerprint !== fingerprint) {
        terminalReason = `decision tape divergence at index ${tapeIndex - 1}`;
        throw new Error(terminalReason);
      }
      const candidate = entry.decision;
      const expectedWindow = integer(selectedRule.reorderWindow, 0, "reorderWindow");
      const integerFields = ["copies", "delayMs", "releaseAtMs", "reorderOffset", "reorderBlock", "reorderWindow", "streamOrdinal", "reorderOrdinal"];
      if (!candidate || integerFields.some((field) => !Number.isSafeInteger(candidate[field]) || candidate[field] < 0)
        || typeof candidate.omitted !== "boolean" || ![null, "hold", "discard"].includes(candidate.blackout)
        || candidate.releaseAtMs !== nowMs + candidate.delayMs
        || candidate.copies !== (candidate.omitted ? 0 : (candidate.copies === 2 ? 2 : 1))
        || candidate.streamOrdinal !== streamOrdinal
        || candidate.reorderOrdinal !== reorderOrdinal
        || candidate.reorderWindow !== expectedWindow
        || candidate.reorderBlock !== (expectedWindow === 0 ? reorderOrdinal : Math.floor(reorderOrdinal / (expectedWindow + 1)))
        || candidate.reorderOffset > candidate.reorderWindow) {
        terminalReason = `invalid decision tape entry at index ${tapeIndex - 1}`;
        throw new Error(terminalReason);
      }
      return { ...candidate, fingerprint };
    }

    const delayMs = integer(selectedRule.delayMs, 0, "delayMs");
    const jitterMs = integer(selectedRule.jitterMs, 0, "jitterMs");
    const omitRate = rate(selectedRule.omitRate, 0, "omitRate");
    const duplicateRate = rate(selectedRule.duplicateRate, 0, "duplicateRate");
    const reorderWindow = integer(selectedRule.reorderWindow, 0, "reorderWindow");
    // Fixed draw count makes minimization safe: toggling one fault dimension
    // does not shift the others within the same derived stream.
    const jitterDraw = toUnit(next64);
    const omitDraw = toUnit(next64);
    const duplicateDraw = toUnit(next64);
    const reorderDraw = toUnit(next64);
    const jitter = jitterMs === 0 ? 0 : Math.floor(jitterDraw * ((jitterMs * 2) + 1)) - jitterMs;
    const omitted = omitRate > 0 && omitDraw < omitRate;
    const copies = !omitted && duplicateRate > 0 && duplicateDraw < duplicateRate ? 2 : (omitted ? 0 : 1);
    // Reordering is block-bounded: a window N permutes only within consecutive
    // blocks of N+1 frames in this derived stream, so displacement cannot exceed N.
    const reorderOffset = reorderWindow === 0 ? 0 : Math.floor(reorderDraw * (reorderWindow + 1));
    const reorderBlock = reorderWindow === 0 ? reorderOrdinal : Math.floor(reorderOrdinal / (reorderWindow + 1));
    let releaseAtMs = nowMs + Math.max(0, delayMs + jitter);
    const blackout = blackoutAt(nowMs, metadata) || blackoutAt(releaseAtMs, metadata);
    let blackoutDecision = null;
    if (blackout) {
      blackoutDecision = blackout.mode;
      if (blackout.mode === "hold") releaseAtMs = Math.max(releaseAtMs, blackout.endMs);
    }
    const decision = {
      omitted: omitted || blackoutDecision === "discard",
      copies: blackoutDecision === "discard" ? 0 : copies,
      delayMs: releaseAtMs - nowMs,
      releaseAtMs,
      reorderOffset,
      reorderBlock,
      reorderWindow,
      streamOrdinal,
      reorderOrdinal,
      blackout: blackoutDecision,
    };
    return { ...decision, fingerprint };
  }

  function schedule(serializedMessage, metadata) {
    if (terminalReason) throw new Error(terminalReason);
    if (typeof serializedMessage !== "string" && !Buffer.isBuffer(serializedMessage)) {
      throw new TypeError("serializedMessage must be a string or Buffer");
    }
    if (!metadata || !metadata.direction || !metadata.frameClass
      || (!metadata.playerId && !metadata.membershipId) || metadata.connectionEpoch === undefined) {
      throw new TypeError("metadata participant, connectionEpoch, direction, and frameClass are required");
    }
    const epochKey = encodeDomain([metadata.playerId || metadata.membershipId, metadata.direction]);
    const activeEpoch = activeEpochs.get(epochKey);
    if (activeEpoch !== undefined && metadata.connectionEpoch !== activeEpoch) {
      return { accepted: false, action: "discard", reason: "stale-connection-epoch" };
    }
    if (activeEpoch === undefined && metadata.connectionEpoch !== undefined) {
      activeEpochs.set(epochKey, metadata.connectionEpoch);
    }
    const wire = Buffer.isBuffer(serializedMessage) ? Buffer.from(serializedMessage) : serializedMessage;
    const bytes = Buffer.byteLength(wire);
    const payloadHash = crypto.createHash("sha256").update(wire).digest("hex");
    const ordinal = nextOrdinal++;
    const decision = makeDecision(metadata, payloadHash, bytes, ordinal);
    const streamBlockKey = `${streamFor(metadata).key}|${String(metadata.connectionEpoch ?? "")}|${decision.reorderBlock}`;
    blockCounts.set(streamBlockKey, (blockCounts.get(streamBlockKey) || 0) + 1);
    blockExpected.set(streamBlockKey, decision.reorderWindow + 1);
    blockReleaseTimes.set(streamBlockKey, Math.max(blockReleaseTimes.get(streamBlockKey) || 0, decision.releaseAtMs));
    blockPeers.set(streamBlockKey, epochKey);
    const requiredItems = decision.copies;
    const requiredBytes = bytes * requiredItems;
    if (queue.length + requiredItems > maxItems || queuedBytes + requiredBytes > maxBytes) {
      terminalReason = "seeded frame scheduler queue bounds exceeded";
      throw new Error("seeded frame scheduler queue bounds exceeded");
    }
    const { fingerprint, ...tapeDecisionValue } = decision;
    const tapeEntry = { fingerprint, decision: tapeDecisionValue };
    const logEntry = {
      atMs: nowMs,
      originalOrdinal: ordinal,
      payloadHash,
      byteLength: bytes,
      metadata: redactMetadata(metadata),
      decision: { ...decision },
    };
    appendEvidence(logEntry, tapeEntry);
    const identity = metadata.semanticId;
    for (let copyIndex = 0; copyIndex < decision.copies; copyIndex += 1) {
      queue.push({
        wire: Buffer.isBuffer(wire) ? Buffer.from(wire) : wire,
        metadata: { ...metadata },
        identity,
        payloadHash,
        byteLength: bytes,
        originalOrdinal: ordinal,
        copyIndex,
        enqueueAtMs: nowMs,
        releaseAtMs: decision.releaseAtMs,
        releaseOrder: decision.reorderOffset,
        decision: { ...decision },
        streamBlockKey,
      });
      queuedBytes += bytes;
    }
    if (decision.copies === 0 && !queue.some((item) => item.streamBlockKey === streamBlockKey)
      && blockCounts.get(streamBlockKey) >= blockExpected.get(streamBlockKey)) {
      blockCounts.delete(streamBlockKey);
      blockExpected.delete(streamBlockKey);
      blockReleaseTimes.delete(streamBlockKey);
      blockPeers.delete(streamBlockKey);
    }
    return { accepted: true, ordinal, payloadHash, identity, decision: { ...decision } };
  }

  function releaseDue({ flush = false } = {}) {
    const released = [];
    const retained = [];
    for (const item of queue) {
      const blockSize = item.decision.reorderWindow + 1;
      const blockComplete = (blockCounts.get(item.streamBlockKey) || 0) >= blockSize;
      const wholeBlockDue = (blockReleaseTimes.get(item.streamBlockKey) || item.releaseAtMs) <= nowMs;
      if (item.releaseAtMs <= nowMs && (flush || (blockComplete && wholeBlockDue))) released.push(item);
      else retained.push(item);
    }
    queue = retained;
    released.sort((a, b) => (blockReleaseTimes.get(a.streamBlockKey) || a.releaseAtMs)
      - (blockReleaseTimes.get(b.streamBlockKey) || b.releaseAtMs)
      || (a.streamBlockKey === b.streamBlockKey ? a.releaseOrder - b.releaseOrder : a.releaseAtMs - b.releaseAtMs)
      || a.originalOrdinal - b.originalOrdinal
      || a.copyIndex - b.copyIndex);
    for (const item of released) queuedBytes -= item.byteLength;
    for (const key of new Set(released.map((item) => item.streamBlockKey))) {
      if (!queue.some((item) => item.streamBlockKey === key)) {
        blockCounts.delete(key);
        blockExpected.delete(key);
        blockReleaseTimes.delete(key);
        blockPeers.delete(key);
      }
    }
    for (const [key, count] of blockCounts) {
      const expected = blockExpected.get(key) || 1;
      if (!queue.some((item) => item.streamBlockKey === key) && (flush || count >= expected)) {
        blockCounts.delete(key);
        blockExpected.delete(key);
        blockReleaseTimes.delete(key);
        blockPeers.delete(key);
      }
    }
    return released;
  }

  function advanceTo(nextMs, releaseOptions) {
    if (!Number.isSafeInteger(nextMs) || nextMs < nowMs) throw new RangeError("virtual clock requires integer milliseconds and cannot move backwards");
    nowMs = nextMs;
    return releaseDue(releaseOptions);
  }

  function pollControls() {
    const due = controls.filter((entry) => !entry.emitted && entry.atMs <= nowMs)
      .sort((a, b) => a.atMs - b.atMs || a.index - b.index);
    for (const entry of due) entry.emitted = true;
    return due.map(({ emitted, index, ...entry }) => ({ ...entry }));
  }

  function activateEpoch({ playerId, membershipId, direction, connectionEpoch }) {
    if ((!playerId && !membershipId) || !direction || connectionEpoch === undefined) {
      throw new TypeError("participant, direction, and connectionEpoch are required");
    }
    const epochKey = encodeDomain([playerId || membershipId, direction]);
    const previousEpoch = activeEpochs.get(epochKey);
    if (previousEpoch === connectionEpoch) {
      return { previousEpoch, connectionEpoch, discardedItems: 0, discardedBytes: 0, action: "noop" };
    }
    activeEpochs.set(epochKey, connectionEpoch);
    let discardedItems = 0;
    let discardedBytes = 0;
    queue = queue.filter((item) => {
      const samePeer = encodeDomain([item.metadata.playerId || item.metadata.membershipId, item.metadata.direction]) === epochKey;
      if (samePeer && item.metadata.connectionEpoch !== connectionEpoch) {
        discardedItems += 1;
        discardedBytes += item.byteLength;
        return false;
      }
      return true;
    });
    queuedBytes -= discardedBytes;
    if (discardedItems > 0) appendEvidence({ atMs: nowMs, event: "epoch-purge",
      peerHash: hash64(epochKey).toString(16), discardedItems, discardedBytes });
    for (const [key, peer] of blockPeers) {
      if (peer === epochKey) {
        blockCounts.delete(key);
        blockExpected.delete(key);
        blockReleaseTimes.delete(key);
        blockPeers.delete(key);
      }
    }
    return { previousEpoch, connectionEpoch, discardedItems, discardedBytes };
  }

  function tape() {
    if (replayTape && tapeIndex !== replayTape.decisions.length) {
      throw new Error(`decision tape has ${replayTape.decisions.length - tapeIndex} unread decisions`);
    }
    return JSON.parse(JSON.stringify({ version: 1, rootSeed: `0x${rootSeed.toString(16)}`, scenarioHash,
      streams: [...derivedStreams].map(([keyHash, seed]) => ({ keyHash, seed })),
      decisions: replayTape ? replayTape.decisions : recorded }));
  }

  function status() {
    return { nowMs, queuedItems: queue.length, queuedBytes, retainedBlocks: blockCounts.size,
      evidenceEntries: logs.length, evidenceBytes,
      decisions: replayTape ? tapeIndex : recorded.length, terminalReason };
  }

  function decisionLog() {
    return logs.map((entry) => JSON.parse(JSON.stringify(entry)));
  }

  function reset() {
    queue = [];
    queuedBytes = 0;
    logs = [];
    recorded.length = 0;
    evidenceBytes = 0;
    streams.clear();
    derivedStreams.clear();
    streamOrdinals.clear();
    epochStreamOrdinals.clear();
    activeEpochs.clear();
    blockCounts.clear();
    blockExpected.clear();
    blockReleaseTimes.clear();
    blockPeers.clear();
    terminalReason = null;
    tapeIndex = 0;
    nextOrdinal = 0;
    nowMs = integer(options.startMs, 0, "startMs");
    for (const control of controls) control.emitted = false;
  }

  return { schedule, advanceTo, releaseDue, pollControls, activateEpoch, tape, status, decisionLog, reset };
}

module.exports = { createSeededFrameScheduler, createSplitMix64, stableStringify, encodeDomain };
