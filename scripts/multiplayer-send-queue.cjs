"use strict";

const DEFAULTS = Object.freeze({
  maxMessages: 256,
  maxBytes: 512 * 1024,
  maxReliableMessages: 128,
  maxReliableBytes: 256 * 1024,
  transportHighWaterBytes: 256 * 1024,
  transportLowWaterBytes: 64 * 1024,
});

function positiveInteger(value, fallback, name) {
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed <= 0) {
    if (value === undefined && fallback !== undefined) return fallback;
    throw new TypeError(`${name} must be a positive safe integer`);
  }
  return parsed;
}

function nonNegativeInteger(value, fallback, name) {
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 0) {
    if (value === undefined && fallback !== undefined) return fallback;
    throw new TypeError(`${name} must be a non-negative safe integer`);
  }
  return parsed;
}

function serializeEnvelope(envelope) {
  const wire = JSON.stringify(envelope);
  if (wire === undefined) throw new TypeError("message must be JSON serializable");
  const snapshot = deepFreezeJson(JSON.parse(wire));
  return Object.freeze({
    envelope: snapshot,
    wire,
    byteLength: Buffer.byteLength(wire, "utf8"),
  });
}

function deepFreezeJson(value) {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    for (const child of Object.values(value)) deepFreezeJson(child);
    Object.freeze(value);
  }
  return value;
}

class MultiplayerSendQueue {
  constructor(options = {}) {
    this.limits = Object.freeze({
      maxMessages: positiveInteger(options.maxMessages, DEFAULTS.maxMessages, "maxMessages"),
      maxBytes: positiveInteger(options.maxBytes, DEFAULTS.maxBytes, "maxBytes"),
      maxReliableMessages: positiveInteger(
        options.maxReliableMessages,
        DEFAULTS.maxReliableMessages,
        "maxReliableMessages",
      ),
      maxReliableBytes: positiveInteger(
        options.maxReliableBytes,
        DEFAULTS.maxReliableBytes,
        "maxReliableBytes",
      ),
      transportHighWaterBytes: positiveInteger(
        options.transportHighWaterBytes,
        DEFAULTS.transportHighWaterBytes,
        "transportHighWaterBytes",
      ),
      transportLowWaterBytes: nonNegativeInteger(
        options.transportLowWaterBytes,
        DEFAULTS.transportLowWaterBytes,
        "transportLowWaterBytes",
      ),
    });
    if (this.limits.transportLowWaterBytes >= this.limits.transportHighWaterBytes) {
      throw new RangeError("transportLowWaterBytes must be below transportHighWaterBytes");
    }

    this.reset({ nextReliableId: options.nextReliableId });
  }

  enqueueState(sequence, payload) {
    if (this.terminal) return this._terminalResult();
    if (this.rebaseRequired) {
      return { accepted: false, action: "rebase", reason: this.rebaseReason };
    }
    const normalizedSequence = nonNegativeInteger(sequence, undefined, "state sequence");

    // A state sequence is a monotonic authority watermark. Duplicate and
    // reordered projections cannot replace a newer queued or already-sent one.
    if (normalizedSequence <= this.lastStateSequence) {
      return { accepted: false, action: "ignore", reason: "stale-state" };
    }

    const candidate = serializeEnvelope({ type: "state", sequence: normalizedSequence, payload });
    const replacedBytes = this.state ? this.state.byteLength : 0;
    const projectedBytes = this.queuedBytes - replacedBytes + candidate.byteLength;
    const projectedMessages = this.queuedMessages - (this.state ? 1 : 0) + 1;

    if (projectedBytes > this.limits.maxBytes || projectedMessages > this.limits.maxMessages) {
      this.state = null;
      this.rebaseRequired = true;
      this.rebaseReason = "state-budget-exceeded";
      this._refreshBackpressure();
      return { accepted: false, action: "rebase", reason: this.rebaseReason };
    }

    const coalesced = this.state !== null;
    this.state = candidate;
    this.lastStateSequence = normalizedSequence;
    this._refreshBackpressure();
    return {
      accepted: true,
      action: coalesced ? "coalesced" : "queued",
      byteLength: candidate.byteLength,
    };
  }

  enqueueConsequence(payload) {
    if (this.terminal) return this._terminalResult();
    const id = this.nextReliableId;
    const candidate = serializeEnvelope({ type: "consequence", id, payload });
    const projectedReliableMessages = this.reliable.length + 1;
    const projectedReliableBytes = this.reliableBytes + candidate.byteLength;
    const projectedMessages = this.queuedMessages + 1;
    const projectedBytes = this.queuedBytes + candidate.byteLength;

    if (
      projectedReliableMessages > this.limits.maxReliableMessages
      || projectedReliableBytes > this.limits.maxReliableBytes
      || projectedMessages > this.limits.maxMessages
      || projectedBytes > this.limits.maxBytes
    ) {
      this._disconnect("reliable-retention-unsafe");
      return this._terminalResult();
    }

    this.nextReliableId += 1;
    this.reliable.push({ ...candidate, needsSend: true });
    this.reliableBytes = projectedReliableBytes;
    this._refreshBackpressure();
    return { accepted: true, action: "queued", id, byteLength: candidate.byteLength };
  }

  acknowledge(id) {
    if (this.terminal) return this._terminalResult();
    const normalizedId = nonNegativeInteger(id, undefined, "ack id");
    const highestIssuedId = this.nextReliableId - 1;
    if (normalizedId > highestIssuedId) {
      this._disconnect("ack-beyond-issued-window");
      return this._terminalResult();
    }
    if (normalizedId > this.highestSentReliableId) {
      this._disconnect("ack-beyond-sent-window");
      return this._terminalResult();
    }
    if (normalizedId <= this.lastAckedReliableId) {
      return { accepted: false, action: "ignore", reason: "stale-ack", ackedThrough: this.lastAckedReliableId };
    }

    let removedMessages = 0;
    let removedBytes = 0;
    while (this.reliable.length > 0 && this.reliable[0].envelope.id <= normalizedId) {
      const entry = this.reliable.shift();
      removedMessages += 1;
      removedBytes += entry.byteLength;
    }
    this.reliableBytes -= removedBytes;
    this.lastAckedReliableId = normalizedId;
    this._refreshBackpressure();
    return {
      accepted: true,
      action: "acknowledged",
      ackedThrough: normalizedId,
      removedMessages,
      removedBytes,
    };
  }

  replayAfter(id) {
    if (this.terminal) return this._terminalResult();
    const normalizedId = nonNegativeInteger(id, undefined, "replay id");
    const highestIssuedId = this.nextReliableId - 1;
    if (normalizedId > highestIssuedId) {
      this._disconnect("replay-beyond-issued-window");
      return this._terminalResult();
    }
    if (normalizedId < this.lastAckedReliableId) {
      this.rebaseRequired = true;
      this.rebaseReason = "replay-window-expired";
      this._refreshBackpressure();
      return { accepted: false, action: "rebase", reason: this.rebaseReason };
    }

    let replayMessages = 0;
    for (const entry of this.reliable) {
      if (entry.envelope.id > normalizedId) {
        entry.needsSend = true;
        replayMessages += 1;
      }
    }
    this._refreshBackpressure();
    return { accepted: true, action: "replay", afterId: normalizedId, replayMessages };
  }

  observeTransportBufferedBytes(byteLength) {
    this.transportBufferedBytes = nonNegativeInteger(byteLength, undefined, "transport buffered bytes");
    if (this.transportBufferedBytes >= this.limits.transportHighWaterBytes) {
      this.transportBackpressured = true;
    } else if (this.transportBufferedBytes <= this.limits.transportLowWaterBytes) {
      this.transportBackpressured = false;
    }
    this._refreshBackpressure();
    return this.status();
  }

  drain(options = {}) {
    if (this.terminal) return { action: "disconnect", reason: this.terminal.reason, messages: [], bytes: 0 };
    if (this.transportBackpressured) {
      return { action: "pause", reason: "transport-backpressure", messages: [], bytes: 0 };
    }

    const maxMessages = positiveInteger(options.maxMessages, this.limits.maxMessages, "drain maxMessages");
    const maxBytes = positiveInteger(options.maxBytes, this.limits.maxBytes, "drain maxBytes");
    const messages = [];
    let bytes = 0;
    let reliableBlocked = false;

    const append = (entry) => {
      if (messages.length >= maxMessages || bytes + entry.byteLength > maxBytes) return false;
      messages.push(Object.freeze({
        envelope: entry.envelope,
        wire: entry.wire,
        byteLength: entry.byteLength,
      }));
      bytes += entry.byteLength;
      return true;
    };

    // Consequences have deterministic FIFO priority over replaceable state.
    for (const entry of this.reliable) {
      if (!entry.needsSend) continue;
      if (!append(entry)) {
        reliableBlocked = true;
        break;
      }
      entry.needsSend = false;
      this.highestSentReliableId = Math.max(this.highestSentReliableId, entry.envelope.id);
    }
    if (!reliableBlocked && this.state && append(this.state)) this.state = null;

    this._refreshBackpressure();
    return { action: "send", messages, bytes };
  }

  clearRebase() {
    if (this.terminal) return this._terminalResult();
    this.rebaseRequired = false;
    this.rebaseReason = null;
    this._refreshBackpressure();
    return { accepted: true, action: "cleared" };
  }

  reset(options = {}) {
    this.state = null;
    this.reliable = [];
    this.reliableBytes = 0;
    this.nextReliableId = positiveInteger(options.nextReliableId, 1, "nextReliableId");
    this.lastAckedReliableId = this.nextReliableId - 1;
    this.highestSentReliableId = this.lastAckedReliableId;
    this.lastStateSequence = -1;
    this.transportBufferedBytes = 0;
    this.transportBackpressured = false;
    this.backpressured = false;
    this.rebaseRequired = false;
    this.rebaseReason = null;
    this.terminal = null;
    return this.status();
  }

  get queuedMessages() {
    return this.reliable.length + (this.state ? 1 : 0);
  }

  get queuedBytes() {
    return this.reliableBytes + (this.state ? this.state.byteLength : 0);
  }

  status() {
    return Object.freeze({
      action: this.terminal ? "disconnect" : this.rebaseRequired ? "rebase" : this.backpressured ? "pause" : "ready",
      reason: this.terminal?.reason || this.rebaseReason || (this.backpressured ? "backpressure" : null),
      queuedMessages: this.queuedMessages,
      queuedBytes: this.queuedBytes,
      reliableMessages: this.reliable.length,
      reliableBytes: this.reliableBytes,
      pendingState: this.state !== null,
      lastStateSequence: this.lastStateSequence,
      lastAckedReliableId: this.lastAckedReliableId,
      highestSentReliableId: this.highestSentReliableId,
      highestIssuedReliableId: this.nextReliableId - 1,
      transportBufferedBytes: this.transportBufferedBytes,
      backpressured: this.backpressured,
      rebaseRequired: this.rebaseRequired,
      disconnectRequired: this.terminal !== null,
    });
  }

  _disconnect(reason) {
    this.terminal = Object.freeze({ reason, requiresRebase: true });
    this.backpressured = true;
  }

  _terminalResult() {
    return {
      accepted: false,
      action: "disconnect",
      reason: this.terminal.reason,
      requiresRebase: this.terminal.requiresRebase,
    };
  }

  _refreshBackpressure() {
    const queueAtLimit = this.queuedMessages >= this.limits.maxMessages
      || this.queuedBytes >= this.limits.maxBytes
      || this.reliable.length >= this.limits.maxReliableMessages
      || this.reliableBytes >= this.limits.maxReliableBytes;
    this.backpressured = this.terminal !== null || this.transportBackpressured || queueAtLimit;
  }
}

function createMultiplayerSendQueue(options) {
  return new MultiplayerSendQueue(options);
}

module.exports = {
  DEFAULTS,
  MultiplayerSendQueue,
  createMultiplayerSendQueue,
};
