const crypto = require("crypto");

const DEFAULT_TTL_MS = 30_000;
const DEFAULT_CAPACITY = 32;
const TICKET_BYTES = 32;
const TICKET_PATTERN = /^[A-Za-z0-9_-]{43}$/;
const TICKET_KINDS = new Set(["admission", "resume"]);
const MAX_IDENTIFIER_LENGTH = 160;
const ALLOWED_WIRE_VERSIONS = new Set(["lbh-multiplayer-json-v1", "lbh-multiplayer-json-v2"]);
const POSITIONAL_CODEC_CAPABILITY = "state-pair-positional-json-v1";
const BINARY_CODEC_CAPABILITY = "state-pair-binary-v1";
const COMPRESSION_CODEC_CAPABILITY = "state-pair-brotli-v1";
const PUBLIC_BODY_CAPABILITY = "state-pair-public-body-v1";
const PUBLIC_BODY_COMPRESSION_CAPABILITY = "state-pair-public-body-brotli-v1";
const PREPARED_PUBLIC_SOURCE_CAPABILITY = "state-pair-public-body-prepared-v1";
const SPLIT_PUBLIC_FRAGMENT_CAPABILITY = "state-pair-split-public-fragment-v1";

class MultiplayerTicketError extends Error {
  constructor(code, message) {
    super(message);
    this.name = "MultiplayerTicketError";
    this.code = code;
  }
}

function fail(code, message) {
  throw new MultiplayerTicketError(code, message);
}

function identifier(value, label) {
  if (
    typeof value !== "string"
    || value.length === 0
    || value.length > MAX_IDENTIFIER_LENGTH
    || value.trim() !== value
  ) {
    fail("invalid-claim", `${label} must be a non-empty trimmed string of at most ${MAX_IDENTIFIER_LENGTH} characters`);
  }
  return value;
}

function positiveInteger(value, label) {
  if (!Number.isSafeInteger(value) || value < 1) {
    fail("invalid-claim", `${label} must be a positive integer`);
  }
  return value;
}

function ticketDigest(ticket) {
  return crypto.createHash("sha256").update(ticket, "utf8").digest();
}

function cloneClaims(claims) {
  return { ...claims };
}

function createMultiplayerTicketRegistry({
  runId,
  now = Date.now,
  ttlMs = DEFAULT_TTL_MS,
  capacity = DEFAULT_CAPACITY,
  randomBytes = crypto.randomBytes,
} = {}) {
  let activeRunId = identifier(runId, "runId");
  if (typeof now !== "function") fail("invalid-config", "now must be a function");
  if (typeof randomBytes !== "function") fail("invalid-config", "randomBytes must be a function");
  if (!Number.isSafeInteger(ttlMs) || ttlMs < 1) fail("invalid-config", "ttlMs must be a positive integer");
  if (!Number.isSafeInteger(capacity) || capacity < 1) fail("invalid-config", "capacity must be a positive integer");

  const records = [];

  function currentTime() {
    const value = now();
    if (!Number.isSafeInteger(value) || value < 0) {
      fail("invalid-clock", "now must return a non-negative safe integer in milliseconds");
    }
    return value;
  }

  function pruneExpired(at = currentTime()) {
    let removed = 0;
    for (let index = records.length - 1; index >= 0; index--) {
      if (at >= records[index].expiresAt) {
        records.splice(index, 1);
        removed += 1;
      }
    }
    return removed;
  }

  function validateBaseClaims(claims, kind) {
    if (!claims || typeof claims !== "object" || Array.isArray(claims)) {
      fail("invalid-claim", "ticket claims must be an object");
    }
    const allowed = new Set([
      "membershipId", "playerId", "profileId", "wireVersion", "capabilities",
      "manifestSchema", "manifestHash", "authorityIncarnation",
    ]);
    if (kind === "resume") {
      allowed.add("connectionId");
      allowed.add("connectionEpoch");
    }
    for (const key of Object.keys(claims)) {
      if (!allowed.has(key)) fail("invalid-claim", `ticket claims contain unsupported field ${key}`);
    }
    const selected = {
      membershipId: identifier(claims.membershipId, "membershipId"),
      playerId: identifier(claims.playerId, "playerId"),
      profileId: identifier(claims.profileId, "profileId"),
    };
    if (claims.wireVersion !== undefined) {
      selected.wireVersion = identifier(claims.wireVersion, "wireVersion");
      if (!ALLOWED_WIRE_VERSIONS.has(selected.wireVersion)) fail("invalid-claim", "wireVersion is unsupported");
      if (!Array.isArray(claims.capabilities) || claims.capabilities.length > 16) fail("invalid-claim", "capabilities must be a bounded array");
      const capabilities = claims.capabilities.map((value) => identifier(value, "capability"));
      if (new Set(capabilities).size !== capabilities.length) fail("invalid-claim", "capabilities must be unique");
      selected.capabilities = Object.freeze([...capabilities].sort());
      if (selected.wireVersion === "lbh-multiplayer-json-v2") {
        if (selected.capabilities.includes("state-pair-mixed-v1")
            && !selected.capabilities.includes("state-pair-v1")) {
          fail("invalid-claim", "state-pair-mixed-v1 requires state-pair-v1");
        }
        if (selected.capabilities.includes("runtime-public-components-v1")
            && !selected.capabilities.includes("state-pair-mixed-v1")) {
          fail("invalid-claim", "runtime-public-components-v1 requires state-pair-mixed-v1");
        }
        if (selected.capabilities.includes(POSITIONAL_CODEC_CAPABILITY)
            && (!selected.capabilities.includes("runtime-public-components-v1")
              || !selected.capabilities.includes("state-pair-mixed-v1"))) {
          fail("invalid-claim", `${POSITIONAL_CODEC_CAPABILITY} requires sparse mixed state-pair`);
        }
        if (selected.capabilities.includes(BINARY_CODEC_CAPABILITY)
            && (!selected.capabilities.includes(POSITIONAL_CODEC_CAPABILITY)
              || !selected.capabilities.includes("runtime-public-components-v1")
              || !selected.capabilities.includes("state-pair-mixed-v1"))) {
          fail("invalid-claim", `${BINARY_CODEC_CAPABILITY} requires positional sparse mixed state-pair fallback`);
        }
        if (selected.capabilities.includes(COMPRESSION_CODEC_CAPABILITY)
            && (!selected.capabilities.includes(POSITIONAL_CODEC_CAPABILITY)
              || selected.capabilities.includes(BINARY_CODEC_CAPABILITY))) {
          fail("invalid-claim", `${COMPRESSION_CODEC_CAPABILITY} requires positional state-pair and excludes binary`);
        }
        if (selected.capabilities.includes(PUBLIC_BODY_CAPABILITY)
            && (!selected.capabilities.includes(COMPRESSION_CODEC_CAPABILITY)
              || !selected.capabilities.includes(PUBLIC_BODY_COMPRESSION_CAPABILITY)
              || !selected.capabilities.includes(POSITIONAL_CODEC_CAPABILITY)
              || !selected.capabilities.includes("runtime-public-components-v1")
              || !selected.capabilities.includes("state-pair-mixed-v1")
              || selected.capabilities.includes(BINARY_CODEC_CAPABILITY))) {
          fail("invalid-claim", `${PUBLIC_BODY_CAPABILITY} requires compressed positional sparse mixed state-pair and excludes binary`);
        }
        if (selected.capabilities.includes(PUBLIC_BODY_COMPRESSION_CAPABILITY)
            && (!selected.capabilities.includes(PUBLIC_BODY_CAPABILITY)
              || !selected.capabilities.includes(COMPRESSION_CODEC_CAPABILITY)
              || selected.capabilities.includes(BINARY_CODEC_CAPABILITY))) {
          fail("invalid-claim", `${PUBLIC_BODY_COMPRESSION_CAPABILITY} requires public-body v1 plus its positional fallback and excludes binary`);
        }
        if (selected.capabilities.includes(PREPARED_PUBLIC_SOURCE_CAPABILITY)
            && !selected.capabilities.includes(PUBLIC_BODY_CAPABILITY)) {
          fail("invalid-claim", `${PREPARED_PUBLIC_SOURCE_CAPABILITY} requires public-body v1`);
        }
        if (selected.capabilities.includes(SPLIT_PUBLIC_FRAGMENT_CAPABILITY)
            && (!selected.capabilities.includes(PREPARED_PUBLIC_SOURCE_CAPABILITY)
              || !selected.capabilities.includes(PUBLIC_BODY_CAPABILITY)
              || selected.capabilities.includes(BINARY_CODEC_CAPABILITY))) {
          fail("invalid-claim", `${SPLIT_PUBLIC_FRAGMENT_CAPABILITY} requires prepared public-body v1 and excludes binary`);
        }
        selected.manifestSchema = identifier(claims.manifestSchema, "manifestSchema");
        selected.manifestHash = identifier(claims.manifestHash, "manifestHash");
        const wantsStatePair = selected.capabilities.includes("state-pair-v1");
        if (wantsStatePair) selected.authorityIncarnation = positiveInteger(claims.authorityIncarnation, "authorityIncarnation");
        else if (claims.authorityIncarnation !== undefined) fail("invalid-claim", "authorityIncarnation requires state-pair-v1");
      } else if (claims.manifestSchema !== undefined || claims.manifestHash !== undefined
          || claims.authorityIncarnation !== undefined) {
        fail("invalid-claim", "v1 tickets cannot carry a manifest binding");
      }
    } else if (claims.capabilities !== undefined || claims.manifestSchema !== undefined || claims.manifestHash !== undefined
        || claims.authorityIncarnation !== undefined) {
      fail("invalid-claim", "wireVersion is required for protocol claims");
    }
    return selected;
  }

  function generateUniqueTicket() {
    for (let attempt = 0; attempt < 8; attempt++) {
      const bytes = randomBytes(TICKET_BYTES);
      if (!Buffer.isBuffer(bytes) || bytes.length !== TICKET_BYTES) {
        fail("ticket-generation-failed", `randomBytes must return exactly ${TICKET_BYTES} bytes`);
      }
      const ticket = bytes.toString("base64url");
      const digest = ticketDigest(ticket);
      if (!records.some((record) => crypto.timingSafeEqual(record.digest, digest))) {
        return { ticket, digest };
      }
    }
    fail("ticket-generation-failed", "could not generate a unique ticket");
  }

  function issue(kind, claims) {
    const issuedAt = currentTime();
    pruneExpired(issuedAt);
    if (records.length >= capacity) {
      fail("ticket-capacity-exceeded", "ticket registry capacity is exhausted");
    }

    const baseClaims = validateBaseClaims(claims, kind);
    const reservedClaims = kind === "resume"
      ? {
          ...baseClaims,
          connectionId: identifier(claims.connectionId, "connectionId"),
          connectionEpoch: positiveInteger(claims.connectionEpoch, "connectionEpoch"),
        }
      : baseClaims;
    const { ticket, digest } = generateUniqueTicket();
    const expiresAt = issuedAt + ttlMs;
    if (!Number.isSafeInteger(expiresAt)) fail("invalid-clock", "ticket expiry exceeds the safe integer range");
    records.push({
      digest,
      kind,
      runId: activeRunId,
      claims: reservedClaims,
      issuedAt,
      expiresAt,
      consumedAt: null,
    });
    return Object.freeze({ ticket, kind, runId: activeRunId, issuedAt, expiresAt });
  }

  function findRecord(ticket) {
    const digest = ticketDigest(ticket);
    let match = null;
    // Capacity is deliberately tiny. Scan every digest so matching ticket
    // material never passes through ordinary string equality or a secret key.
    for (const record of records) {
      if (crypto.timingSafeEqual(record.digest, digest)) match = record;
    }
    return match;
  }

  function redeem(ticket, { kind, runId: expectedRunId } = {}) {
    if (typeof ticket !== "string" || !TICKET_PATTERN.test(ticket)) {
      fail("malformed-ticket", "ticket must be a 32-byte base64url token");
    }
    if (!TICKET_KINDS.has(kind)) fail("invalid-ticket-kind", "kind must be admission or resume");
    identifier(expectedRunId, "runId");

    const redeemedAt = currentTime();
    const record = findRecord(ticket);
    if (!record) {
      pruneExpired(redeemedAt);
      fail("unknown-ticket", "ticket is unknown or was invalidated");
    }
    if (redeemedAt >= record.expiresAt) {
      const index = records.indexOf(record);
      if (index >= 0) records.splice(index, 1);
      pruneExpired(redeemedAt);
      fail("expired-ticket", "ticket has expired");
    }
    if (record.consumedAt !== null) fail("reused-ticket", "ticket has already been redeemed");
    if (record.kind !== kind) fail("wrong-ticket-kind", `ticket is not valid for ${kind} admission`);
    if (record.runId !== expectedRunId || activeRunId !== expectedRunId) {
      fail("cross-run-ticket", "ticket is not valid for this run");
    }

    record.consumedAt = redeemedAt;
    pruneExpired(redeemedAt);
    return Object.freeze({
      kind: record.kind,
      runId: record.runId,
      claims: Object.freeze(cloneClaims(record.claims)),
      issuedAt: record.issuedAt,
      expiresAt: record.expiresAt,
      redeemedAt,
    });
  }

  function reset() {
    const invalidated = records.length;
    records.splice(0, records.length);
    return invalidated;
  }

  function rotateRun(nextRunId) {
    const next = identifier(nextRunId, "runId");
    const invalidated = reset();
    activeRunId = next;
    return Object.freeze({ runId: activeRunId, invalidated });
  }

  function diagnostics() {
    const at = currentTime();
    const pruned = pruneExpired(at);
    const counts = {
      admission: 0,
      resume: 0,
      pending: 0,
      consumed: 0,
    };
    for (const record of records) {
      counts[record.kind] += 1;
      counts[record.consumedAt === null ? "pending" : "consumed"] += 1;
    }
    return Object.freeze({
      runId: activeRunId,
      ttlMs,
      capacity,
      retained: records.length,
      available: capacity - records.length,
      pruned,
      counts: Object.freeze(counts),
    });
  }

  return Object.freeze({
    issueAdmission(claims) {
      return issue("admission", claims);
    },
    issueResume(claims) {
      return issue("resume", claims);
    },
    redeem,
    reset,
    rotateRun,
    pruneExpired,
    diagnostics,
  });
}

module.exports = {
  DEFAULT_TTL_MS,
  DEFAULT_CAPACITY,
  MultiplayerTicketError,
  createMultiplayerTicketRegistry,
};
