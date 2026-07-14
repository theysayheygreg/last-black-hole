const { PROTOCOL_VERSION: SIM_PROTOCOL_VERSION } = require("./sim-protocol.cjs");
const {
  WIRE_PROTOCOL_VERSION,
  STREAM_PATH,
} = require("./multiplayer-protocol-constants.cjs");
const { normalizeView, projectionHash } = require("./canonical-structural-delta.cjs");
const {
  CAPABILITY: POSITIONAL_CODEC_CAPABILITY,
  PositionalCodecError,
  encodePositionalFrame,
  decodePositionalFrame,
  composeStatePairCandidates,
  composeStatePairLaneCandidates,
} = require("./state-pair-positional-codec.cjs");
const {
  CAPABILITY: BINARY_CODEC_CAPABILITY,
  BINARY_CODEC_MANIFEST_HASH,
  BinaryCodecError,
  encodeBinaryFrame,
  decodeBinaryFrame,
  composeBinaryStatePairCandidates,
} = require("./state-pair-binary-codec.cjs");
const {
  CAPABILITY: COMPRESSION_CODEC_CAPABILITY,
  MANIFEST_HASH: COMPRESSION_CODEC_MANIFEST_HASH,
  CompressionCodecError,
  encodeCompressedStatePair,
  decodeCompressedStatePair,
} = require("./state-pair-compression-codec.cjs");
const trustedStatePairWireEncoders = new WeakSet();
const trustedStatePairCandidateSelectors = new WeakMap();
const trustedStatePairLazyCandidateSelectors = new WeakMap();
const trustedStatePairWireEncoderContexts = new WeakMap();
const trustedStatePairWireEncoderObservers = new WeakMap();

const CLIENT_TO_SERVER = "client->server";
const SERVER_TO_CLIENT = "server->client";
const WIRE_PROTOCOL_VERSION_V2 = "lbh-multiplayer-json-v2";
const SUPPORTED_WIRE_VERSIONS = new Set([WIRE_PROTOCOL_VERSION, WIRE_PROTOCOL_VERSION_V2]);

const LIMITS = Object.freeze({
  maxFrameBytes: 256 * 1024,
  maxHelloBytes: 4 * 1024,
  maxControlBytes: 8 * 1024,
  maxInputBytes: 2 * 1024,
  maxActionBytes: 16 * 1024,
  maxPublicStateBytes: 256 * 1024,
  maxOwnerStateBytes: 64 * 1024,
  maxEventBytes: 32 * 1024,
  maxIdentifierLength: 160,
  maxTicketLength: 2048,
  maxErrorMessageLength: 512,
  maxPayloadStringLength: 8192,
  maxPayloadDepth: 8,
  // Canonical state-pair envelopes add structural wrappers around the same
  // bounded public/owner JSON, so they receive a separate finite depth budget.
  maxStatePairPayloadDepth: 16,
  maxObjectKeys: 128,
  maxArrayItems: 2048,
  maxPublicBodies: 2048,
  maxDespawns: 2048,
});

const FRAME_DIRECTIONS = Object.freeze({
  hello: CLIENT_TO_SERVER,
  welcome: SERVER_TO_CLIENT,
  heartbeat: SERVER_TO_CLIENT,
  pong: CLIENT_TO_SERVER,
  input: CLIENT_TO_SERVER,
  action: CLIENT_TO_SERVER,
  publicState: SERVER_TO_CLIENT,
  ownerState: SERVER_TO_CLIENT,
  event: SERVER_TO_CLIENT,
  ack: "bidirectional",
  rebase: SERVER_TO_CLIENT,
  error: SERVER_TO_CLIENT,
  close: SERVER_TO_CLIENT,
  manifestAck: CLIENT_TO_SERVER,
  statePair: SERVER_TO_CLIENT,
  statePairRecovery: CLIENT_TO_SERVER,
});

const FRAME_BYTE_LIMITS = Object.freeze({
  hello: LIMITS.maxHelloBytes,
  welcome: LIMITS.maxControlBytes,
  heartbeat: LIMITS.maxControlBytes,
  pong: LIMITS.maxControlBytes,
  input: LIMITS.maxInputBytes,
  action: LIMITS.maxActionBytes,
  publicState: LIMITS.maxPublicStateBytes,
  ownerState: LIMITS.maxOwnerStateBytes,
  event: LIMITS.maxEventBytes,
  ack: LIMITS.maxControlBytes,
  rebase: LIMITS.maxControlBytes,
  error: LIMITS.maxControlBytes,
  close: LIMITS.maxControlBytes,
  manifestAck: LIMITS.maxControlBytes,
  statePair: LIMITS.maxFrameBytes,
  statePairRecovery: LIMITS.maxControlBytes,
});

const ACTION_KINDS = new Set([
  "slingshotEdge",
  "pulse",
  "extractConfirm",
  "consume",
  "inventory",
]);
const ACK_KINDS = new Set(["baseline", "event", "delivery", "input", "action", "statePair"]);
const OVERLOAD_MODES = new Set([
  "NORMAL",
  "THROTTLED",
  "DEGRADED",
  "DILATED",
]);
const REBASE_REASONS = new Set([
  "initial",
  "resume",
  "baseline-missed",
  "event-gap",
  "run-changed",
  "server-recovery",
]);
const STATE_PAIR_RECOVERY_REASONS = new Set([
  "reconnect", "match-changed", "session-changed", "authority-changed", "recipient-changed",
  "manifest-changed", "schema-changed", "frame-gap", "stale-frame", "duplicate-mismatch",
  "identity-mismatch", "manifest-mismatch", "missing-base", "base-mismatch", "hash-mismatch",
  "lineage-mismatch", "owner-mismatch", "malformed-frame", "oversize-frame", "rejected-delta",
]);

class WireProtocolError extends Error {
  constructor(code, message, closeCode = 4400) {
    super(message);
    this.name = "WireProtocolError";
    this.code = code;
    this.closeCode = closeCode;
  }
}

function fail(code, message, closeCode = 4400) {
  throw new WireProtocolError(code, message, closeCode);
}

function isPlainObject(value) {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function object(value, label) {
  if (!isPlainObject(value)) fail("invalid-field", `${label} must be a plain object`);
  return value;
}

function exactKeys(value, allowed, label = "frame") {
  for (const key of Object.keys(value)) {
    if (!allowed.has(key)) fail("unknown-field", `${label} contains unknown field ${key}`);
  }
}

function requiredString(value, label, maxLength = LIMITS.maxIdentifierLength) {
  if (typeof value !== "string" || value.length === 0 || value.length > maxLength || value.trim() !== value) {
    fail("invalid-field", `${label} must be a non-empty trimmed string of at most ${maxLength} characters`);
  }
  return value;
}

function optionalString(value, label, maxLength = LIMITS.maxIdentifierLength) {
  if (value === undefined) return undefined;
  return requiredString(value, label, maxLength);
}

function integer(value, label, { min = 0, max = Number.MAX_SAFE_INTEGER } = {}) {
  if (!Number.isSafeInteger(value) || value < min || value > max) {
    fail("invalid-field", `${label} must be an integer between ${min} and ${max}`);
  }
  return value;
}

function finiteNumber(value, label, { min = -Infinity, max = Infinity } = {}) {
  if (!Number.isFinite(value) || value < min || value > max) {
    fail("invalid-field", `${label} must be a finite number between ${min} and ${max}`);
  }
  return value;
}

function boolean(value, label) {
  if (typeof value !== "boolean") fail("invalid-field", `${label} must be boolean`);
  return value;
}

function jsonValue(value, label, depth = 0, maxDepth = LIMITS.maxPayloadDepth) {
  if (depth > maxDepth) fail("payload-too-deep", `${label} exceeds the payload depth limit`);
  if (value === null || typeof value === "boolean") return;
  if (typeof value === "number") {
    if (!Number.isFinite(value)) fail("invalid-payload", `${label} contains a non-finite number`);
    return;
  }
  if (typeof value === "string") {
    if (value.length > LIMITS.maxPayloadStringLength) fail("payload-string-too-long", `${label} contains an oversized string`);
    return;
  }
  if (Array.isArray(value)) {
    if (value.length > LIMITS.maxArrayItems) fail("payload-array-too-large", `${label} exceeds the array item limit`);
    value.forEach((entry, index) => jsonValue(entry, `${label}[${index}]`, depth + 1, maxDepth));
    return;
  }
  if (!isPlainObject(value)) fail("invalid-payload", `${label} must contain JSON values only`);
  const keys = Object.keys(value);
  if (keys.length > LIMITS.maxObjectKeys) fail("payload-object-too-large", `${label} exceeds the object key limit`);
  for (const key of keys) {
    if (key.length === 0 || key.length > LIMITS.maxIdentifierLength) fail("invalid-payload-key", `${label} contains an invalid key`);
    jsonValue(value[key], `${label}.${key}`, depth + 1, maxDepth);
  }
}

function protocolHeader(frame) {
  requiredString(frame.wireVersion, "wireVersion");
  if (!SUPPORTED_WIRE_VERSIONS.has(frame.wireVersion)) {
    fail("unsupported-wire-version", "wireVersion is unsupported", 4406);
  }
}

function validateHello(frame) {
  protocolHeader(frame);
  const allowed = new Set(["type", "wireVersion", "simProtocolVersion", "admissionTicket", "resumeTicket", "lastRunId", "lastSnapshotId", "lastEventSeq"]);
  if (frame.wireVersion === WIRE_PROTOCOL_VERSION_V2) {
    allowed.add("capabilities");
    allowed.add("manifestSchema");
    allowed.add("manifestHash");
  }
  exactKeys(frame, allowed);
  requiredString(frame.simProtocolVersion, "simProtocolVersion");
  if (frame.simProtocolVersion !== SIM_PROTOCOL_VERSION) {
    fail("unsupported-sim-version", `simProtocolVersion must be ${SIM_PROTOCOL_VERSION}`, 4406);
  }
  const admission = optionalString(frame.admissionTicket, "admissionTicket", LIMITS.maxTicketLength);
  const resume = optionalString(frame.resumeTicket, "resumeTicket", LIMITS.maxTicketLength);
  if (Boolean(admission) === Boolean(resume)) fail("invalid-ticket", "hello requires exactly one admissionTicket or resumeTicket", 4401);
  const lastRunId = optionalString(frame.lastRunId, "lastRunId");
  if (frame.lastSnapshotId !== undefined) integer(frame.lastSnapshotId, "lastSnapshotId");
  if (frame.lastEventSeq !== undefined) integer(frame.lastEventSeq, "lastEventSeq");
  if (!resume && (lastRunId || frame.lastSnapshotId !== undefined || frame.lastEventSeq !== undefined)) {
    fail("invalid-resume-cursor", "resume cursors require a resumeTicket");
  }
  const cursorParts = [Boolean(lastRunId), frame.lastSnapshotId !== undefined, frame.lastEventSeq !== undefined];
  if (resume && cursorParts.some(Boolean) && !cursorParts.every(Boolean)) {
    fail("invalid-resume-cursor", "resume cursor requires lastRunId, lastSnapshotId, and lastEventSeq");
  }
  if (frame.wireVersion === WIRE_PROTOCOL_VERSION_V2) {
    if (!Array.isArray(frame.capabilities) || frame.capabilities.length > 16 || new Set(frame.capabilities).size !== frame.capabilities.length) {
      fail("invalid-field", "capabilities must be a bounded unique array");
    }
    frame.capabilities.forEach((value, index) => requiredString(value, `capabilities[${index}]`));
    if (!frame.capabilities.includes("static-manifest-v1")) fail("invalid-field", "v2 requires static-manifest-v1");
    if (frame.capabilities.includes("state-pair-mixed-v1") && !frame.capabilities.includes("state-pair-v1")) {
      fail("invalid-field", "state-pair-mixed-v1 requires state-pair-v1");
    }
    if (frame.capabilities.includes("runtime-public-components-v1")
        && !frame.capabilities.includes("state-pair-mixed-v1")) {
      fail("invalid-field", "runtime-public-components-v1 requires state-pair-mixed-v1");
    }
    if (frame.capabilities.includes(POSITIONAL_CODEC_CAPABILITY)
        && (!frame.capabilities.includes("runtime-public-components-v1")
          || !frame.capabilities.includes("state-pair-mixed-v1"))) {
      fail("invalid-field", `${POSITIONAL_CODEC_CAPABILITY} requires sparse mixed state-pair`);
    }
    if (frame.capabilities.includes(BINARY_CODEC_CAPABILITY)
        && (!frame.capabilities.includes(POSITIONAL_CODEC_CAPABILITY)
          || !frame.capabilities.includes("runtime-public-components-v1")
          || !frame.capabilities.includes("state-pair-mixed-v1"))) {
      fail("invalid-field", `${BINARY_CODEC_CAPABILITY} requires positional sparse mixed state-pair fallback`);
    }
    if (frame.capabilities.includes(COMPRESSION_CODEC_CAPABILITY)
        && (!frame.capabilities.includes(POSITIONAL_CODEC_CAPABILITY)
          || frame.capabilities.includes(BINARY_CODEC_CAPABILITY))) {
      fail("invalid-field", `${COMPRESSION_CODEC_CAPABILITY} requires positional state-pair and excludes binary`);
    }
    requiredString(frame.manifestSchema, "manifestSchema");
    requiredString(frame.manifestHash, "manifestHash");
  }
}

function validateWelcome(frame) {
  protocolHeader(frame);
  const allowed = new Set([
    "type", "wireVersion", "simProtocolVersion", "runId", "membershipId", "playerId", "connectionId",
    "connectionEpoch", "commandCredential", "lastCommandSeq", "nextCommandSeq", "lastInputSeq", "lastActionSeq",
    "heartbeatIntervalMs", "reconnected",
  ]);
  if (frame.wireVersion === WIRE_PROTOCOL_VERSION_V2) {
    for (const key of ["capabilities", "manifestSchema", "manifestHash", "manifestBytes", "fetchPath", "authorityIncarnation"]) allowed.add(key);
  }
  exactKeys(frame, allowed);
  if (frame.simProtocolVersion !== SIM_PROTOCOL_VERSION) fail("unsupported-sim-version", `simProtocolVersion must be ${SIM_PROTOCOL_VERSION}`, 4406);
  for (const key of ["runId", "membershipId", "playerId", "connectionId"]) requiredString(frame[key], key);
  requiredString(frame.commandCredential, "commandCredential", LIMITS.maxTicketLength);
  integer(frame.connectionEpoch, "connectionEpoch", { min: 1 });
  integer(frame.lastCommandSeq, "lastCommandSeq");
  integer(frame.nextCommandSeq, "nextCommandSeq", { min: 1 });
  if (frame.nextCommandSeq !== frame.lastCommandSeq + 1) fail("invalid-sequence", "nextCommandSeq must follow lastCommandSeq");
  integer(frame.lastInputSeq, "lastInputSeq");
  integer(frame.lastActionSeq, "lastActionSeq");
  integer(frame.heartbeatIntervalMs, "heartbeatIntervalMs", { min: 1000, max: 60000 });
  boolean(frame.reconnected, "reconnected");
  if (frame.wireVersion === WIRE_PROTOCOL_VERSION_V2) {
    if (!Array.isArray(frame.capabilities) || frame.capabilities.length > 16 || new Set(frame.capabilities).size !== frame.capabilities.length) {
      fail("invalid-field", "capabilities must be a bounded unique array");
    }
    frame.capabilities.forEach((value, index) => requiredString(value, `capabilities[${index}]`));
    if (!frame.capabilities.includes("static-manifest-v1")) fail("invalid-field", "v2 requires static-manifest-v1");
    if (frame.capabilities.includes("state-pair-mixed-v1") && !frame.capabilities.includes("state-pair-v1")) {
      fail("invalid-field", "state-pair-mixed-v1 requires state-pair-v1");
    }
    if (frame.capabilities.includes("runtime-public-components-v1")
        && !frame.capabilities.includes("state-pair-mixed-v1")) {
      fail("invalid-field", "runtime-public-components-v1 requires state-pair-mixed-v1");
    }
    if (frame.capabilities.includes(POSITIONAL_CODEC_CAPABILITY)
        && (!frame.capabilities.includes("runtime-public-components-v1")
          || !frame.capabilities.includes("state-pair-mixed-v1"))) {
      fail("invalid-field", `${POSITIONAL_CODEC_CAPABILITY} requires sparse mixed state-pair`);
    }
    if (frame.capabilities.includes(BINARY_CODEC_CAPABILITY)
        && (!frame.capabilities.includes(POSITIONAL_CODEC_CAPABILITY)
          || !frame.capabilities.includes("runtime-public-components-v1")
          || !frame.capabilities.includes("state-pair-mixed-v1"))) {
      fail("invalid-field", `${BINARY_CODEC_CAPABILITY} requires positional sparse mixed state-pair fallback`);
    }
    if (frame.capabilities.includes(COMPRESSION_CODEC_CAPABILITY)
        && (!frame.capabilities.includes(POSITIONAL_CODEC_CAPABILITY)
          || frame.capabilities.includes(BINARY_CODEC_CAPABILITY))) {
      fail("invalid-field", `${COMPRESSION_CODEC_CAPABILITY} requires positional state-pair and excludes binary`);
    }
    if (frame.authorityIncarnation !== undefined) {
      if (!frame.capabilities.includes("state-pair-v1")) fail("invalid-field", "authorityIncarnation requires state-pair-v1");
      integer(frame.authorityIncarnation, "authorityIncarnation", { min: 1 });
    }
    requiredString(frame.manifestSchema, "manifestSchema");
    requiredString(frame.manifestHash, "manifestHash");
    integer(frame.manifestBytes, "manifestBytes", { min: 1, max: 1024 * 1024 });
    requiredString(frame.fetchPath, "fetchPath", 512);
    if (!frame.fetchPath.startsWith("/multiplayer/manifest/") || frame.fetchPath.includes("?") || frame.fetchPath.includes("#")) {
      fail("invalid-field", "fetchPath must be a credential-free manifest path");
    }
  }
}

function validateManifestAck(frame) {
  exactKeys(frame, new Set(["type", "manifestSchema", "manifestHash", "manifestBytes", "connectionEpoch"]));
  requiredString(frame.manifestSchema, "manifestSchema");
  requiredString(frame.manifestHash, "manifestHash");
  integer(frame.manifestBytes, "manifestBytes", { min: 1, max: 1024 * 1024 });
  integer(frame.connectionEpoch, "connectionEpoch", { min: 1 });
}

function validateHeartbeat(frame) {
  exactKeys(frame, new Set(["type", "heartbeatId", "serverTimeMs"]));
  requiredString(frame.heartbeatId, "heartbeatId");
  integer(frame.serverTimeMs, "serverTimeMs");
}

function validatePong(frame) {
  exactKeys(frame, new Set(["type", "heartbeatId", "clientTimeMs"]));
  requiredString(frame.heartbeatId, "heartbeatId");
  integer(frame.clientTimeMs, "clientTimeMs");
}

function validateInput(frame) {
  exactKeys(frame, new Set([
    "type", "inputSeq", "moveX", "moveY", "thrust", "brake", "slingshot", "ability1", "ability2", "clientTimeMs",
  ]));
  integer(frame.inputSeq, "inputSeq", { min: 1 });
  const moveX = finiteNumber(frame.moveX, "moveX", { min: -1, max: 1 });
  const moveY = finiteNumber(frame.moveY, "moveY", { min: -1, max: 1 });
  if (Math.hypot(moveX, moveY) > 1.000001) fail("invalid-field", "movement vector magnitude must not exceed 1");
  finiteNumber(frame.thrust, "thrust", { min: 0, max: 1 });
  finiteNumber(frame.brake, "brake", { min: 0, max: 1 });
  boolean(frame.slingshot, "slingshot");
  boolean(frame.ability1, "ability1");
  boolean(frame.ability2, "ability2");
  integer(frame.clientTimeMs, "clientTimeMs");
}

function validateAction(frame) {
  exactKeys(frame, new Set(["type", "actionId", "actionSeq", "commandSeq", "actionKind", "payload", "clientTimeMs"]));
  requiredString(frame.actionId, "actionId");
  integer(frame.actionSeq, "actionSeq", { min: 1 });
  integer(frame.commandSeq, "commandSeq", { min: 1 });
  requiredString(frame.actionKind, "actionKind");
  if (!ACTION_KINDS.has(frame.actionKind)) fail("invalid-action-kind", `unsupported actionKind ${frame.actionKind}`);
  object(frame.payload, "payload");
  jsonValue(frame.payload, "payload");
  integer(frame.clientTimeMs, "clientTimeMs");
}

function validateStateCommon(frame, owner) {
  const allowed = new Set([
    "type", "runId", "snapshotId", "tick", "simTime", "lastEventSeq", "fieldRevision", "overloadMode",
    "lastInputSeq", "lastActionSeq", "state",
  ]);
  if (owner) {
    allowed.add("membershipId");
    allowed.add("playerId");
  } else {
    allowed.add("manifestHash");
    allowed.add("full");
  }
  exactKeys(frame, allowed);
  requiredString(frame.runId, "runId");
  integer(frame.snapshotId, "snapshotId", { min: 1 });
  integer(frame.tick, "tick");
  finiteNumber(frame.simTime, "simTime", { min: 0 });
  integer(frame.lastEventSeq, "lastEventSeq");
  integer(frame.fieldRevision, "fieldRevision");
  requiredString(frame.overloadMode, "overloadMode");
  if (!OVERLOAD_MODES.has(frame.overloadMode)) fail("invalid-overload-mode", `unsupported overloadMode ${frame.overloadMode}`);
  integer(frame.lastInputSeq, "lastInputSeq");
  integer(frame.lastActionSeq, "lastActionSeq");
  if (owner) {
    requiredString(frame.membershipId, "membershipId");
    requiredString(frame.playerId, "playerId");
  } else {
    optionalString(frame.manifestHash, "manifestHash");
    boolean(frame.full, "full");
  }
  object(frame.state, "state");
  jsonValue(frame.state, "state");
  if (!owner && frame.state.bodies !== undefined) {
    if (!Array.isArray(frame.state.bodies) || frame.state.bodies.length > LIMITS.maxPublicBodies) {
      fail("too-many-bodies", `state.bodies must contain at most ${LIMITS.maxPublicBodies} entries`);
    }
  }
  if (!owner && frame.state.despawns !== undefined) {
    if (!Array.isArray(frame.state.despawns) || frame.state.despawns.length > LIMITS.maxDespawns) {
      fail("too-many-despawns", `state.despawns must contain at most ${LIMITS.maxDespawns} entries`);
    }
  }
}

function validateEvent(frame) {
  exactKeys(frame, new Set(["type", "deliveryId", "runId", "eventSeq", "tick", "visibility", "eventType", "payload"]));
  integer(frame.deliveryId, "deliveryId", { min: 1 });
  requiredString(frame.runId, "runId");
  integer(frame.eventSeq, "eventSeq", { min: 1 });
  integer(frame.tick, "tick");
  if (frame.visibility !== "public" && frame.visibility !== "owner") fail("invalid-visibility", "visibility must be public or owner");
  requiredString(frame.eventType, "eventType");
  object(frame.payload, "payload");
  jsonValue(frame.payload, "payload");
}

function validateAck(frame, direction) {
  exactKeys(frame, new Set([
    "type", "ackKind", "deliveryId", "snapshotId", "eventSeq", "inputSeq", "actionId", "actionSeq", "commandSeq", "status", "result",
    "ackSchema", "matchId", "sessionId", "authorityIncarnation", "recipientId", "recipientIncarnation", "frameId", "statePairId", "publicHash", "ownerHash",
    "pairSchema", "tick", "simTime", "eventWatermark", "fieldRevision", "overloadMode", "ballparkEpoch", "manifestHash",
    "publicKind", "ownerKind", "publicBaseSnapshotId", "ownerBaseSnapshotId",
  ]));
  requiredString(frame.ackKind, "ackKind");
  if (!ACK_KINDS.has(frame.ackKind)) fail("invalid-ack-kind", `unsupported ackKind ${frame.ackKind}`);
  if (frame.ackKind === "statePair") {
    if (direction && direction !== CLIENT_TO_SERVER) fail("invalid-direction", "statePair ack is client->server");
    const mixed = frame.ackSchema === "lbh-authority-state-pair-mixed-ack-v1";
    exactKeys(frame, new Set(["type", "ackKind", "ackSchema", "matchId", "sessionId", "authorityIncarnation",
      "recipientId", "recipientIncarnation", "frameId", "statePairId", "snapshotId", "publicHash", "ownerHash",
      ...(mixed ? ["pairSchema", "tick", "simTime", "eventWatermark", "fieldRevision", "overloadMode",
        "ballparkEpoch", "manifestHash", "publicKind", "ownerKind", "publicBaseSnapshotId", "ownerBaseSnapshotId"] : [])]), "statePair ack");
    for (const key of ["ackSchema", "matchId", "sessionId", "recipientId", "statePairId", "snapshotId", "publicHash", "ownerHash"]) requiredString(frame[key], key);
    if (frame.ackSchema !== "lbh-authority-state-pair-ack-v1" && !mixed) fail("invalid-field", "unsupported statePair ACK schema");
    if (mixed) {
      for (const key of ["pairSchema", "overloadMode", "manifestHash"]) requiredString(frame[key], key);
      if (frame.pairSchema !== "lbh-authority-state-pair-mixed-v1") fail("invalid-field", "mixed ACK pairSchema is unsupported");
      integer(frame.tick, "tick");
      finiteNumber(frame.simTime, "simTime", { min: 0 });
      for (const key of ["eventWatermark", "fieldRevision", "ballparkEpoch"]) integer(frame[key], key);
      for (const key of ["authorityIncarnation", "recipientIncarnation", "frameId", "tick", "simTime",
        "eventWatermark", "fieldRevision", "ballparkEpoch"]) {
        if (Object.is(frame[key], -0)) fail("invalid-field", `${key} cannot be negative zero`);
      }
      if (!OVERLOAD_MODES.has(frame.overloadMode)) fail("invalid-overload-mode", `unsupported overloadMode ${frame.overloadMode}`);
      for (const lane of ["public", "owner"]) {
        if (frame[`${lane}Kind`] !== "keyframe" && frame[`${lane}Kind`] !== "delta") {
          fail("invalid-field", `${lane}Kind must be keyframe or delta`);
        }
        const base = frame[`${lane}BaseSnapshotId`];
        if (frame[`${lane}Kind`] === "delta") requiredString(base, `${lane}BaseSnapshotId`);
        else if (base !== null) fail("invalid-field", `${lane}BaseSnapshotId must be null for a keyframe`);
      }
    }
    integer(frame.authorityIncarnation, "authorityIncarnation", { min: 1 });
    integer(frame.recipientIncarnation, "recipientIncarnation", { min: 1 });
    integer(frame.frameId, "frameId", { min: 1 });
  } else if (frame.ackKind === "baseline") {
    if (direction && direction !== CLIENT_TO_SERVER) fail("invalid-direction", "baseline ack is client->server");
    exactKeys(frame, new Set(["type", "ackKind", "snapshotId", "eventSeq"]), "baseline ack");
    integer(frame.snapshotId, "snapshotId", { min: 1 });
    integer(frame.eventSeq, "eventSeq");
  } else if (frame.ackKind === "event") {
    if (direction && direction !== CLIENT_TO_SERVER) fail("invalid-direction", "event ack is client->server");
    exactKeys(frame, new Set(["type", "ackKind", "eventSeq"]), "event ack");
    integer(frame.eventSeq, "eventSeq", { min: 1 });
  } else if (frame.ackKind === "delivery") {
    if (direction && direction !== CLIENT_TO_SERVER) fail("invalid-direction", "delivery ack is client->server");
    exactKeys(frame, new Set(["type", "ackKind", "deliveryId"]), "delivery ack");
    integer(frame.deliveryId, "deliveryId", { min: 1 });
  } else if (frame.ackKind === "input") {
    if (direction && direction !== SERVER_TO_CLIENT) fail("invalid-direction", "input ack is server->client");
    exactKeys(frame, new Set(["type", "ackKind", "inputSeq"]), "input ack");
    integer(frame.inputSeq, "inputSeq", { min: 1 });
  } else {
    if (direction && direction !== SERVER_TO_CLIENT) fail("invalid-direction", "action ack is server->client");
    exactKeys(frame, new Set(["type", "ackKind", "deliveryId", "actionId", "actionSeq", "commandSeq", "status", "result"]), "action ack");
    integer(frame.deliveryId, "deliveryId", { min: 1 });
    requiredString(frame.actionId, "actionId");
    integer(frame.actionSeq, "actionSeq", { min: 1 });
    integer(frame.commandSeq, "commandSeq", { min: 1 });
    if (frame.status !== "accepted" && frame.status !== "rejected") fail("invalid-action-status", "action ack status must be accepted or rejected");
    if (frame.result !== undefined) jsonValue(frame.result, "result");
  }
}

const STATE_PAIR_HEADER_KEYS = Object.freeze(["type", "pairSchema", "matchId", "sessionId", "authorityIncarnation",
  "recipientId", "recipientIncarnation", "frameId", "statePairId", "snapshotId", "tick", "simTime",
  "eventWatermark", "fieldRevision", "overloadMode", "ballparkEpoch", "manifestHash"]);

function validateStatePairHeader(frame, { lanes = true } = {}) {
  exactKeys(frame, new Set([...STATE_PAIR_HEADER_KEYS, ...(lanes ? ["public", "owner"] : [])]));
  for (const key of ["pairSchema", "matchId", "sessionId", "recipientId", "statePairId", "snapshotId", "manifestHash"]) requiredString(frame[key], key);
  const mixed = frame.pairSchema === "lbh-authority-state-pair-mixed-v1";
  if (frame.pairSchema !== "lbh-authority-state-pair-v1" && !mixed) fail("invalid-field", "unsupported statePair schema");
  for (const key of ["authorityIncarnation", "recipientIncarnation", "frameId"]) integer(frame[key], key, { min: 1 });
  integer(frame.tick, "tick");
  finiteNumber(frame.simTime, "simTime", { min: 0 });
  for (const key of ["eventWatermark", "fieldRevision", "ballparkEpoch"]) integer(frame[key], key);
  requiredString(frame.overloadMode, "overloadMode");
  if (!OVERLOAD_MODES.has(frame.overloadMode)) fail("invalid-overload-mode", `unsupported overloadMode ${frame.overloadMode}`);
  return mixed;
}

function validateStatePairLane(frame, lane, input) {
  const payload = object(input, lane);
  const allowed = payload.kind === "keyframe"
    ? new Set(["kind", "schema", "resultHash", "projection"])
    : new Set(["kind", "schema", "baseSnapshotId", "baseHash", "resultHash", "delta"]);
  exactKeys(payload, allowed, lane);
  if (payload.kind !== "keyframe" && payload.kind !== "delta") fail("invalid-field", `${lane}.kind must be keyframe or delta`);
  for (const key of ["schema", "resultHash"]) requiredString(payload[key], `${lane}.${key}`);
  if (payload.kind === "keyframe") {
      if (payload.schema !== "lbh-canonical-projection-v1") fail("invalid-field", `${lane} keyframe schema is unsupported`);
      object(payload.projection, `${lane}.projection`);
      jsonValue(payload.projection, `${lane}.projection`, 0, LIMITS.maxStatePairPayloadDepth);
      let normalized;
      try { normalized = normalizeView(payload.projection); } catch { fail("invalid-field", `${lane} keyframe projection is invalid`); }
      if (projectionHash(normalized) !== payload.resultHash) fail("invalid-field", `${lane} keyframe hash is invalid`);
      if (normalized.lane !== lane || normalized.runId !== frame.matchId
        || normalized.authorityEpoch !== frame.authorityIncarnation
        || normalized.connectionEpoch !== frame.recipientIncarnation || normalized.ballparkEpoch !== frame.ballparkEpoch
        || normalized.statePairId !== frame.statePairId || normalized.snapshotId !== frame.snapshotId
        || normalized.tick !== frame.tick || normalized.simTime !== frame.simTime
        || normalized.eventWatermark !== frame.eventWatermark || normalized.fieldRevision !== frame.fieldRevision
        || normalized.overloadMode !== frame.overloadMode || normalized.manifestHash !== frame.manifestHash) {
        fail("invalid-field", `${lane} keyframe lineage does not match statePair header`);
      }
  } else {
      if (payload.schema !== "lbh-canonical-structural-delta-v1") fail("invalid-field", `${lane} delta schema is unsupported`);
      requiredString(payload.baseSnapshotId, `${lane}.baseSnapshotId`);
      requiredString(payload.baseHash, `${lane}.baseHash`);
      object(payload.delta, `${lane}.delta`);
      jsonValue(payload.delta, `${lane}.delta`, 0, LIMITS.maxStatePairPayloadDepth);
      if (payload.delta.lane !== lane || payload.delta.runId !== frame.matchId
        || payload.delta.authorityEpoch !== frame.authorityIncarnation
        || payload.delta.connectionEpoch !== frame.recipientIncarnation || payload.delta.ballparkEpoch !== frame.ballparkEpoch
        || payload.delta.statePairId !== frame.statePairId || payload.delta.snapshotId !== frame.snapshotId
        || payload.delta.manifestHash !== frame.manifestHash || payload.delta.baseSnapshotId !== payload.baseSnapshotId
        || payload.delta.baseHash !== payload.baseHash || payload.delta.resultHash !== payload.resultHash) {
        fail("invalid-field", `${lane} delta lineage does not match statePair header`);
      }
      const cursors = {};
      for (const operation of payload.delta.rootOps || []) {
        if (operation?.op === "set" && Array.isArray(operation.path) && operation.path.length === 1) {
          cursors[operation.path[0]] = operation.value;
        }
      }
      for (const key of ["statePairId", "snapshotId", "tick", "simTime", "eventWatermark", "fieldRevision", "overloadMode"]) {
        if (Object.hasOwn(cursors, key) && cursors[key] !== frame[key]) fail("invalid-field", `${lane} delta ${key} disagrees with statePair header`);
      }
      for (const key of ["statePairId", "snapshotId"]) {
        if (!Object.hasOwn(cursors, key)) fail("invalid-field", `${lane} delta must declare ${key} cursor`);
      }
    return cursors;
  }
  return null;
}

function validateStatePairLaneRelation(frame, mixed, publicPayload, ownerPayload, publicCursors, ownerCursors) {
  if (!mixed && publicPayload.kind !== ownerPayload.kind) fail("invalid-field", "statePair-v1 lanes must use the same transaction kind");
  if (publicPayload.kind === "delta" && ownerPayload.kind === "delta") {
    for (const key of ["statePairId", "snapshotId", "tick", "simTime", "eventWatermark", "fieldRevision", "overloadMode"]) {
      if (Object.hasOwn(publicCursors, key) !== Object.hasOwn(ownerCursors, key)
        || (Object.hasOwn(publicCursors, key) && publicCursors[key] !== ownerCursors[key])) {
        fail("invalid-field", `public and owner delta ${key} cursors are not atomic`);
      }
    }
  }
}

function validateStatePair(frame) {
  const mixed = validateStatePairHeader(frame);
  const publicCursors = validateStatePairLane(frame, "public", frame.public);
  const ownerCursors = validateStatePairLane(frame, "owner", frame.owner);
  validateStatePairLaneRelation(frame, mixed, frame.public, frame.owner, publicCursors, ownerCursors);
}

function validateStatePairLaneCandidates(header, lanes, tieOrder) {
  const mixed = validateStatePairHeader(header, { lanes: false });
  if (!lanes?.public?.keyframe || !lanes?.public?.delta
      || !lanes?.owner?.keyframe || !lanes?.owner?.delta) {
    fail("invalid-field", "statePair lane candidate set is incomplete");
  }
  const cursors = {
    public: {
      keyframe: validateStatePairLane(header, "public", lanes.public.keyframe),
      delta: validateStatePairLane(header, "public", lanes.public.delta),
    },
    owner: {
      keyframe: validateStatePairLane(header, "owner", lanes.owner.keyframe),
      delta: validateStatePairLane(header, "owner", lanes.owner.delta),
    },
  };
  for (const kind of tieOrder) {
    const [publicKind, ownerKind] = kind.split("+").map((part) => part.split("-")[1]);
    const publicPayload = lanes.public[publicKind];
    const ownerPayload = lanes.owner[ownerKind];
    if (!publicPayload || !ownerPayload) fail("invalid-field", "statePair candidate tie order is unsupported");
    validateStatePairLaneRelation(header, mixed, publicPayload, ownerPayload,
      cursors.public[publicKind], cursors.owner[ownerKind]);
  }
}

function validateRebase(frame) {
  exactKeys(frame, new Set(["type", "runId", "reason", "snapshotId", "lastEventSeq"]));
  requiredString(frame.runId, "runId");
  requiredString(frame.reason, "reason");
  if (!REBASE_REASONS.has(frame.reason)) fail("invalid-rebase-reason", `unsupported rebase reason ${frame.reason}`);
  integer(frame.snapshotId, "snapshotId", { min: 1 });
  integer(frame.lastEventSeq, "lastEventSeq");
}

function validateStatePairRecovery(frame) {
  exactKeys(frame, new Set(["type", "recoverySchema", "reason", "matchId", "sessionId",
    "authorityIncarnation", "recipientId", "recipientIncarnation", "manifestSchema", "manifestHash",
    "lastAcceptedFrameId", "lastAcceptedStatePairId", "lastAcceptedSnapshotId"]));
  for (const key of ["recoverySchema", "reason", "matchId", "sessionId", "recipientId", "manifestSchema", "manifestHash"]) {
    requiredString(frame[key], key);
  }
  if (frame.recoverySchema !== "lbh-client-state-pair-recovery-v1") fail("invalid-field", "unsupported statePair recovery schema");
  if (!STATE_PAIR_RECOVERY_REASONS.has(frame.reason)) fail("invalid-field", "unsupported statePair recovery reason");
  integer(frame.authorityIncarnation, "authorityIncarnation", { min: 1 });
  integer(frame.recipientIncarnation, "recipientIncarnation", { min: 1 });
  integer(frame.lastAcceptedFrameId, "lastAcceptedFrameId");
  for (const key of ["lastAcceptedStatePairId", "lastAcceptedSnapshotId"]) {
    if (frame[key] !== null) requiredString(frame[key], key);
  }
  if ((frame.lastAcceptedStatePairId === null) !== (frame.lastAcceptedSnapshotId === null)) {
    fail("invalid-field", "statePair recovery cursors must be present or absent together");
  }
  if (frame.lastAcceptedFrameId === 0 && frame.lastAcceptedStatePairId !== null) {
    fail("invalid-field", "zero statePair recovery frame cannot carry cursors");
  }
}

function validateErrorFrame(frame) {
  exactKeys(frame, new Set(["type", "code", "message", "fatal", "retryable", "relatedType", "acceptedCommandSeq", "acceptedInputSeq", "acceptedActionSeq"]));
  requiredString(frame.code, "code");
  requiredString(frame.message, "message", LIMITS.maxErrorMessageLength);
  boolean(frame.fatal, "fatal");
  boolean(frame.retryable, "retryable");
  if (frame.relatedType !== undefined) {
    requiredString(frame.relatedType, "relatedType");
    if (!Object.hasOwn(FRAME_DIRECTIONS, frame.relatedType)) fail("invalid-related-type", `unknown relatedType ${frame.relatedType}`);
  }
  for (const key of ["acceptedCommandSeq", "acceptedInputSeq", "acceptedActionSeq"]) {
    if (frame[key] !== undefined) integer(frame[key], key);
  }
}

function validateClose(frame) {
  exactKeys(frame, new Set(["type", "code", "reason", "reconnectable", "retryAfterMs"]));
  integer(frame.code, "code", { min: 4000, max: 4999 });
  requiredString(frame.reason, "reason", 123);
  boolean(frame.reconnectable, "reconnectable");
  if (frame.retryAfterMs !== undefined) integer(frame.retryAfterMs, "retryAfterMs", { max: 300000 });
}

const VALIDATORS = Object.freeze({
  hello: validateHello,
  welcome: validateWelcome,
  heartbeat: validateHeartbeat,
  pong: validatePong,
  input: validateInput,
  action: validateAction,
  publicState: (frame) => validateStateCommon(frame, false),
  ownerState: (frame) => validateStateCommon(frame, true),
  event: validateEvent,
  ack: validateAck,
  rebase: validateRebase,
  error: validateErrorFrame,
  close: validateClose,
  manifestAck: validateManifestAck,
  statePair: validateStatePair,
  statePairRecovery: validateStatePairRecovery,
});

function byteLength(value) {
  try {
    return Buffer.byteLength(typeof value === "string" ? value : JSON.stringify(value), "utf8");
  } catch {
    fail("invalid-json-value", "frame must be JSON serializable");
  }
}

function frameByteLimit(type) {
  return Math.min(LIMITS.maxFrameBytes, FRAME_BYTE_LIMITS[type] || LIMITS.maxFrameBytes);
}

function validateWireFrameSemantic(frame, { direction } = {}) {
  object(frame, "frame");
  requiredString(frame.type, "type", 64);
  const validator = VALIDATORS[frame.type];
  if (!validator) fail("unknown-frame-type", `unknown frame type ${frame.type}`, 4404);
  if (direction !== undefined && direction !== CLIENT_TO_SERVER && direction !== SERVER_TO_CLIENT) {
    fail("invalid-direction", `direction must be ${CLIENT_TO_SERVER} or ${SERVER_TO_CLIENT}`);
  }
  const expectedDirection = FRAME_DIRECTIONS[frame.type];
  if (direction && expectedDirection !== "bidirectional" && direction !== expectedDirection) {
    fail("invalid-direction", `${frame.type} is ${expectedDirection}`);
  }
  validator(frame, direction);
  return frame;
}

function validateWireFrame(frame, options = {}) {
  validateWireFrameSemantic(frame, options);
  const bytes = byteLength(frame);
  const limit = frameByteLimit(frame.type);
  if (bytes > limit) fail("frame-too-large", `${frame.type} frame is ${bytes} bytes; limit is ${limit}`, 4409);
  return frame;
}

function parseWireFrame(raw, options = {}) {
  if (options.compressed === true) {
    if (!options.compressionContext
        || options.compressionContext.compressionManifestHash !== COMPRESSION_CODEC_MANIFEST_HASH) {
      fail("unexpected-compressed-frame", "compressed frame was not negotiated", 4403);
    }
    let positional;
    try { positional = decodeCompressedStatePair(raw); }
    catch (error) {
      if (error instanceof CompressionCodecError) fail(error.code, error.message, 4403);
      throw error;
    }
    return parseWireFrame(positional, { ...options, compressed: false, requirePositional: true });
  }
  if (options.binary === true) {
    if (!options.binaryContext) fail("unexpected-binary-frame", "binary frame was not negotiated", 4403);
    let frame;
    try { frame = decodeBinaryFrame(raw, options.binaryContext); }
    catch (error) {
      if (error instanceof BinaryCodecError) fail(error.code, error.message, 4403);
      throw error;
    }
    const bytes = Buffer.isBuffer(raw) || raw instanceof Uint8Array ? raw.byteLength : 0;
    if (bytes > frameByteLimit(frame.type)) {
      fail("frame-too-large", `${frame.type} binary frame is ${bytes} bytes; limit is ${frameByteLimit(frame.type)}`, 4409);
    }
    return validateWireFrameSemantic(frame, options);
  }
  let text;
  if (typeof raw === "string") text = raw;
  else if (Buffer.isBuffer(raw) || raw instanceof Uint8Array) {
    try {
      text = new TextDecoder("utf-8", { fatal: true }).decode(raw);
    } catch {
      fail("invalid-frame-encoding", "wire frame must be valid UTF-8 JSON text", 4403);
    }
  }
  else fail("invalid-frame-encoding", "wire frame must be UTF-8 JSON text", 4403);
  const bytes = Buffer.byteLength(text, "utf8");
  if (bytes > LIMITS.maxFrameBytes) fail("frame-too-large", `frame is ${bytes} bytes; limit is ${LIMITS.maxFrameBytes}`, 4409);
  let frame;
  try {
    frame = JSON.parse(text);
  } catch {
    fail("invalid-json", "wire frame is not valid JSON");
  }
  const positional = Array.isArray(frame);
  if (positional) {
    if (!options.positionalContext) fail("unexpected-positional-frame", "positional frame was not negotiated", 4403);
    try { frame = decodePositionalFrame(text, options.positionalContext); }
    catch (error) {
      if (error instanceof PositionalCodecError) fail(error.code, error.message, 4403);
      throw error;
    }
  } else if (options.requirePositional
      && (frame?.type === "statePair" || frame?.type === "statePairRecovery"
        || (frame?.type === "ack" && frame?.ackKind === "statePair"))) {
    fail("positional-frame-required", "negotiated state-pair transaction must use positional JSON", 4403);
  }
  if (options.requireBinary
      && (frame?.type === "statePair" || frame?.type === "statePairRecovery"
        || (frame?.type === "ack" && frame?.ackKind === "statePair"))) {
    fail("binary-frame-required", "negotiated state-pair transaction must use binary framing", 4403);
  }
  if (positional && bytes > frameByteLimit(frame.type)) {
    fail("frame-too-large", `${frame.type} positional frame is ${bytes} bytes; limit is ${frameByteLimit(frame.type)}`, 4409);
  }
  return positional ? validateWireFrameSemantic(frame, options) : validateWireFrame(frame, options);
}

function encodeWireFrame(frame, options = {}) {
  const compressed = options.compressionContext && frame.type === "statePair";
  if (compressed) {
    if (options.binaryContext) fail("cross-codec-framing", "compression does not apply to binary state-pair frames");
    if (options.compressionContext.compressionManifestHash !== COMPRESSION_CODEC_MANIFEST_HASH) {
      fail("wrong-compression-manifest", "compression manifest is unsupported");
    }
    const positionalWire = encodeWireFrame(frame, { ...options, compressionContext: null });
    try {
      const wire = encodeCompressedStatePair(positionalWire);
      if (wire.length > frameByteLimit(frame.type)) {
        fail("frame-too-large", `${frame.type} compressed frame is ${wire.length} bytes; limit is ${frameByteLimit(frame.type)}`, 4409);
      }
      return wire;
    }
    catch (error) {
      if (error instanceof CompressionCodecError) fail(error.code, error.message);
      throw error;
    }
  }
  const binary = options.binaryContext
    && (frame.type === "statePair" || frame.type === "statePairRecovery"
      || (frame.type === "ack" && frame.ackKind === "statePair"));
  const positional = options.positionalContext
    && (frame.type === "statePair" || frame.type === "statePairRecovery"
      || (frame.type === "ack" && frame.ackKind === "statePair"));
  if (binary || positional) validateWireFrameSemantic(frame, options);
  else validateWireFrame(frame, options);
  if (binary) {
    try {
      const wire = encodeBinaryFrame(frame, options.binaryContext);
      if (wire.length > frameByteLimit(frame.type)) {
        fail("frame-too-large", `${frame.type} binary frame is ${wire.length} bytes; limit is ${frameByteLimit(frame.type)}`, 4409);
      }
      return wire;
    } catch (error) {
      if (error instanceof BinaryCodecError) fail(error.code, error.message);
      throw error;
    }
  }
  if (positional) {
    try {
      const wire = encodePositionalFrame(frame, options.positionalContext);
      const bytes = Buffer.byteLength(wire, "utf8");
      if (bytes > frameByteLimit(frame.type)) {
        fail("frame-too-large", `${frame.type} positional frame is ${bytes} bytes; limit is ${frameByteLimit(frame.type)}`, 4409);
      }
      return wire;
    }
    catch (error) {
      if (error instanceof PositionalCodecError) fail(error.code, error.message);
      throw error;
    }
  }
  return JSON.stringify(frame);
}

function createStatePairWireEncoder(codecContext, observe = null) {
  if (!codecContext || typeof codecContext !== "object" || Array.isArray(codecContext)) {
    throw new TypeError("codecContext is required for a trusted state-pair encoder");
  }
  const context = Object.freeze({ ...codecContext });
  const binary = context.codecManifestHash === BINARY_CODEC_MANIFEST_HASH;
  if (observe !== null && typeof observe !== "function") throw new TypeError("observe must be a function");
  const encoder = (frame) => {
    const started = performance.now();
    const wire = encodeWireFrame(frame, { direction: SERVER_TO_CLIENT,
      ...(binary ? { binaryContext: context } : { positionalContext: context }) });
    observe?.(wire, performance.now() - started);
    return wire;
  };
  trustedStatePairWireEncoders.add(encoder);
  trustedStatePairWireEncoderContexts.set(encoder, context);
  if (observe) trustedStatePairWireEncoderObservers.set(encoder, observe);
  trustedStatePairCandidateSelectors.set(encoder, (entries, tieOrder) => {
    const started = performance.now();
    for (const entry of entries) {
      validateWireFrameSemantic(entry.frame, { direction: SERVER_TO_CLIENT });
    }
    try {
      const selected = binary
        ? composeBinaryStatePairCandidates(entries, context, tieOrder)
        : composeStatePairCandidates(entries, context, tieOrder);
      observe?.(selected.chosen.wire, performance.now() - started);
      return selected;
    } catch (error) {
      if (error instanceof PositionalCodecError) fail(error.code, error.message);
      throw error;
    }
  });
  if (!binary) {
    trustedStatePairLazyCandidateSelectors.set(encoder, (header, lanes, tieOrder) => {
      const started = performance.now();
      try {
        validateStatePairLaneCandidates(header, lanes, tieOrder);
        const selected = composeStatePairLaneCandidates(header, lanes, context, tieOrder);
        observe?.(selected.chosen.wire, performance.now() - started);
        return selected;
      } catch (error) {
        if (error instanceof PositionalCodecError) fail(error.code, error.message);
        throw error;
      }
    });
  }
  return encoder;
}

function isTrustedStatePairWireEncoder(value) {
  return typeof value === "function" && trustedStatePairWireEncoders.has(value);
}

function selectTrustedStatePairWireCandidate(encoder, entries, tieOrder) {
  const selector = trustedStatePairCandidateSelectors.get(encoder);
  if (!selector) throw new TypeError("encoder does not expose trusted exact candidate composition");
  return selector(entries, tieOrder);
}

function hasTrustedStatePairCandidateSelector(encoder) {
  return trustedStatePairCandidateSelectors.has(encoder);
}

function selectTrustedStatePairWireLaneCandidate(encoder, header, lanes, tieOrder) {
  const selector = trustedStatePairLazyCandidateSelectors.get(encoder);
  if (!selector) throw new TypeError("encoder does not expose trusted lazy candidate composition");
  return selector(header, lanes, tieOrder);
}

// The authority owns its private same-operation validation proof and composes
// directly with this immutable negotiated context. This accessor grants no
// validation bypass in the wire module: every public wire selector above still
// validates its inputs before composition.
function statePairWireEncoderContext(encoder) {
  const context = trustedStatePairWireEncoderContexts.get(encoder);
  if (!context) throw new TypeError("encoder does not expose a negotiated state-pair context");
  return context;
}

function observeStatePairWireSelection(encoder, wire, milliseconds) {
  const observe = trustedStatePairWireEncoderObservers.get(encoder);
  observe?.(wire, milliseconds);
}

function hasTrustedStatePairLazyCandidateSelector(encoder) {
  return trustedStatePairLazyCandidateSelectors.has(encoder);
}

module.exports = {
  WIRE_PROTOCOL_VERSION,
  WIRE_PROTOCOL_VERSION_V2,
  STREAM_PATH,
  SIM_PROTOCOL_VERSION,
  CLIENT_TO_SERVER,
  SERVER_TO_CLIENT,
  LIMITS,
  FRAME_DIRECTIONS,
  ACTION_KINDS: Object.freeze([...ACTION_KINDS]),
  ACK_KINDS: Object.freeze([...ACK_KINDS]),
  POSITIONAL_CODEC_CAPABILITY,
  BINARY_CODEC_CAPABILITY,
  COMPRESSION_CODEC_CAPABILITY,
  WireProtocolError,
  validateWireFrame,
  parseWireFrame,
  encodeWireFrame,
  createStatePairWireEncoder,
  selectTrustedStatePairWireCandidate,
  hasTrustedStatePairCandidateSelector,
  selectTrustedStatePairWireLaneCandidate,
  statePairWireEncoderContext,
  observeStatePairWireSelection,
  hasTrustedStatePairLazyCandidateSelector,
  isTrustedStatePairWireEncoder,
};
