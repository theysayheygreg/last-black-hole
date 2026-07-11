const { PROTOCOL_VERSION: SIM_PROTOCOL_VERSION } = require("./sim-protocol.cjs");
const {
  WIRE_PROTOCOL_VERSION,
  STREAM_PATH,
} = require("./multiplayer-protocol-constants.cjs");

const CLIENT_TO_SERVER = "client->server";
const SERVER_TO_CLIENT = "server->client";

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
});

const ACTION_KINDS = new Set([
  "slingshotEdge",
  "pulse",
  "extractConfirm",
  "consume",
  "inventory",
]);
const ACK_KINDS = new Set(["baseline", "event", "delivery", "input", "action"]);
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

function jsonValue(value, label, depth = 0) {
  if (depth > LIMITS.maxPayloadDepth) fail("payload-too-deep", `${label} exceeds the payload depth limit`);
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
    value.forEach((entry, index) => jsonValue(entry, `${label}[${index}]`, depth + 1));
    return;
  }
  if (!isPlainObject(value)) fail("invalid-payload", `${label} must contain JSON values only`);
  const keys = Object.keys(value);
  if (keys.length > LIMITS.maxObjectKeys) fail("payload-object-too-large", `${label} exceeds the object key limit`);
  for (const key of keys) {
    if (key.length === 0 || key.length > LIMITS.maxIdentifierLength) fail("invalid-payload-key", `${label} contains an invalid key`);
    jsonValue(value[key], `${label}.${key}`, depth + 1);
  }
}

function protocolHeader(frame) {
  requiredString(frame.wireVersion, "wireVersion");
  if (frame.wireVersion !== WIRE_PROTOCOL_VERSION) {
    fail("unsupported-wire-version", `wireVersion must be ${WIRE_PROTOCOL_VERSION}`, 4406);
  }
}

function validateHello(frame) {
  exactKeys(frame, new Set(["type", "wireVersion", "simProtocolVersion", "admissionTicket", "resumeTicket", "lastSnapshotId", "lastEventSeq"]));
  protocolHeader(frame);
  requiredString(frame.simProtocolVersion, "simProtocolVersion");
  if (frame.simProtocolVersion !== SIM_PROTOCOL_VERSION) {
    fail("unsupported-sim-version", `simProtocolVersion must be ${SIM_PROTOCOL_VERSION}`, 4406);
  }
  const admission = optionalString(frame.admissionTicket, "admissionTicket", LIMITS.maxTicketLength);
  const resume = optionalString(frame.resumeTicket, "resumeTicket", LIMITS.maxTicketLength);
  if (Boolean(admission) === Boolean(resume)) fail("invalid-ticket", "hello requires exactly one admissionTicket or resumeTicket", 4401);
  if (frame.lastSnapshotId !== undefined) integer(frame.lastSnapshotId, "lastSnapshotId");
  if (frame.lastEventSeq !== undefined) integer(frame.lastEventSeq, "lastEventSeq");
  if (!resume && (frame.lastSnapshotId !== undefined || frame.lastEventSeq !== undefined)) {
    fail("invalid-resume-cursor", "resume cursors require a resumeTicket");
  }
}

function validateWelcome(frame) {
  exactKeys(frame, new Set([
    "type", "wireVersion", "simProtocolVersion", "runId", "membershipId", "playerId", "connectionId",
    "connectionEpoch", "commandCredential", "lastCommandSeq", "nextCommandSeq", "lastInputSeq", "lastActionSeq",
    "heartbeatIntervalMs", "reconnected",
  ]));
  protocolHeader(frame);
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
  ]));
  requiredString(frame.ackKind, "ackKind");
  if (!ACK_KINDS.has(frame.ackKind)) fail("invalid-ack-kind", `unsupported ackKind ${frame.ackKind}`);
  if (frame.ackKind === "baseline") {
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

function validateRebase(frame) {
  exactKeys(frame, new Set(["type", "runId", "reason", "snapshotId", "lastEventSeq"]));
  requiredString(frame.runId, "runId");
  requiredString(frame.reason, "reason");
  if (!REBASE_REASONS.has(frame.reason)) fail("invalid-rebase-reason", `unsupported rebase reason ${frame.reason}`);
  integer(frame.snapshotId, "snapshotId", { min: 1 });
  integer(frame.lastEventSeq, "lastEventSeq");
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
});

function byteLength(value) {
  try {
    return Buffer.byteLength(typeof value === "string" ? value : JSON.stringify(value), "utf8");
  } catch {
    fail("invalid-json-value", "frame must be JSON serializable");
  }
}

function validateWireFrame(frame, { direction } = {}) {
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
  const bytes = byteLength(frame);
  const limit = Math.min(LIMITS.maxFrameBytes, FRAME_BYTE_LIMITS[frame.type]);
  if (bytes > limit) fail("frame-too-large", `${frame.type} frame is ${bytes} bytes; limit is ${limit}`, 4409);
  return frame;
}

function parseWireFrame(raw, options = {}) {
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
  return validateWireFrame(frame, options);
}

function encodeWireFrame(frame, options = {}) {
  validateWireFrame(frame, options);
  return JSON.stringify(frame);
}

module.exports = {
  WIRE_PROTOCOL_VERSION,
  STREAM_PATH,
  SIM_PROTOCOL_VERSION,
  CLIENT_TO_SERVER,
  SERVER_TO_CLIENT,
  LIMITS,
  FRAME_DIRECTIONS,
  ACTION_KINDS: Object.freeze([...ACTION_KINDS]),
  ACK_KINDS: Object.freeze([...ACK_KINDS]),
  WireProtocolError,
  validateWireFrame,
  parseWireFrame,
  encodeWireFrame,
};
